"""
workspaces.py — Workspaces, projetos e membros.
"""
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.models import (
    User, Workspace, Project, Item,
    workspace_members, project_members, Invitation
)

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    slug: str
    description: str = ""
    icon: str = "🏢"
    color: str = "#7B5EA7"

class ProjectCreate(BaseModel):
    name: str
    key: str
    description: str = ""
    icon: str = "📋"
    color: str = "#7B5EA7"

class InviteIn(BaseModel):
    email: str
    role: str = "member"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ws_role(ws: Workspace, user: User, db: Session) -> Optional[str]:
    row = db.execute(
        workspace_members.select().where(
            workspace_members.c.workspace_id == ws.id,
            workspace_members.c.user_id == user.id
        )
    ).first()
    return row.role if row else None


def _serialize_ws(ws: Workspace, db: Session) -> dict:
    members_count = db.execute(
        text("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = :wid"),
        {"wid": ws.id}
    ).scalar()
    return {
        "id": ws.id, "name": ws.name, "slug": ws.slug,
        "description": ws.description, "icon": ws.icon, "color": ws.color,
        "owner_id": ws.owner_id, "is_personal": ws.is_personal,
        "member_count": members_count,
        "project_count": len(ws.projects),
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
    }


def _serialize_project(p: Project, db: Session) -> dict:
    total = db.query(Item).filter(Item.project_id == p.id).count()
    done  = db.query(Item).filter(Item.project_id == p.id, Item.status == "done").count()
    return {
        "id": p.id, "name": p.name, "key": p.key,
        "description": p.description, "icon": p.icon, "color": p.color,
        "workspace_id": p.workspace_id, "is_archived": p.is_archived,
        "item_count": total, "done_count": done,
        "notedex_note_id": p.notedex_note_id,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


# ── Workspace endpoints ───────────────────────────────────────────────────────

@router.get("")
def list_workspaces(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wss = db.query(Workspace).join(
        workspace_members,
        (workspace_members.c.workspace_id == Workspace.id) &
        (workspace_members.c.user_id == user.id)
    ).all()
    return [_serialize_ws(w, db) for w in wss]


@router.post("")
def create_workspace(
    body: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    slug = body.slug.lower().strip().replace(" ", "-")
    if db.query(Workspace).filter(Workspace.slug == slug).first():
        raise HTTPException(400, "Slug já em uso")

    ws = Workspace(
        name=body.name, slug=slug, description=body.description,
        icon=body.icon, color=body.color, owner_id=user.id,
    )
    db.add(ws); db.flush()
    db.execute(workspace_members.insert().values(
        workspace_id=ws.id, user_id=user.id, role="owner"
    ))
    db.commit(); db.refresh(ws)
    return _serialize_ws(ws, db)


@router.get("/{ws_id}")
def get_workspace(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws: raise HTTPException(404)
    if not _ws_role(ws, user, db): raise HTTPException(403, "Sem acesso")
    return _serialize_ws(ws, db)


@router.get("/{ws_id}/members")
def list_members(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws or not _ws_role(ws, user, db): raise HTTPException(403)

    rows = db.execute(
        workspace_members.select().where(workspace_members.c.workspace_id == ws_id)
    ).fetchall()

    result = []
    for row in rows:
        u = db.query(User).filter(User.id == row.user_id).first()
        if u:
            result.append({
                "id": u.id, "username": u.username,
                "display_name": u.display_name,
                "email": u.email,
                "avatar_emoji": u.avatar_emoji,
                "avatar_color": u.avatar_color,
                "role": row.role,
                "joined_at": row.joined_at.isoformat() if row.joined_at else None,
            })
    return result


@router.post("/{ws_id}/invite")
def invite_member(
    ws_id: str,
    body: InviteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws: raise HTTPException(404)
    role = _ws_role(ws, user, db)
    if role not in ("owner", "admin"): raise HTTPException(403, "Sem permissão para convidar")

    # Verifica se usuário já existe pelo email
    existing = db.query(User).filter(User.email == body.email.lower()).first()
    if existing:
        # Adiciona diretamente
        already = db.execute(
            workspace_members.select().where(
                workspace_members.c.workspace_id == ws_id,
                workspace_members.c.user_id == existing.id
            )
        ).first()
        if already:
            raise HTTPException(400, "Usuário já é membro")

        db.execute(workspace_members.insert().values(
            workspace_id=ws_id, user_id=existing.id, role=body.role
        ))
        db.commit()
        return {"ok": True, "added": True, "user": existing.display_name}

    # Cria convite por token
    token = secrets.token_urlsafe(32)
    inv = Invitation(
        workspace_id=ws_id,
        email=body.email.lower(),
        role=body.role,
        token=token,
        invited_by=user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(inv); db.commit()
    return {"ok": True, "invite_token": token, "message": f"Convite gerado para {body.email}"}


@router.post("/join/{token}")
def join_by_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inv = db.query(Invitation).filter(
        Invitation.token == token,
        Invitation.accepted == False,
        Invitation.expires_at > datetime.utcnow(),
    ).first()
    if not inv: raise HTTPException(404, "Convite inválido ou expirado")

    db.execute(workspace_members.insert().values(
        workspace_id=inv.workspace_id, user_id=user.id, role=inv.role
    ))
    inv.accepted = True
    db.commit()
    ws = db.query(Workspace).filter(Workspace.id == inv.workspace_id).first()
    return {"ok": True, "workspace": ws.name if ws else ""}


# ── Project endpoints ─────────────────────────────────────────────────────────

@router.get("/{ws_id}/projects")
def list_projects(
    ws_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws or not _ws_role(ws, user, db): raise HTTPException(403)

    projects = db.query(Project).filter(
        Project.workspace_id == ws_id,
        Project.is_archived == False,
    ).all()
    return [_serialize_project(p, db) for p in projects]


@router.post("/{ws_id}/projects")
def create_project(
    ws_id: str,
    body: ProjectCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not ws or not _ws_role(ws, user, db): raise HTTPException(403)

    key = body.key.upper().replace(" ", "")[:10]
    if db.query(Project).filter(Project.workspace_id == ws_id, Project.key == key).first():
        raise HTTPException(400, f"Chave '{key}' já existe neste workspace")

    p = Project(
        workspace_id=ws_id, name=body.name, key=key,
        description=body.description, icon=body.icon, color=body.color,
    )
    db.add(p); db.commit(); db.refresh(p)
    return _serialize_project(p, db)


@router.put("/{ws_id}/projects/{pid}")
def update_project(
    ws_id: str, pid: str,
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.query(Project).filter(Project.id == pid, Project.workspace_id == ws_id).first()
    if not p: raise HTTPException(404)

    for field in ("name", "description", "color", "icon", "is_archived", "notedex_note_id"):
        if field in body:
            setattr(p, field, body[field])
    db.commit(); db.refresh(p)
    return _serialize_project(p, db)
