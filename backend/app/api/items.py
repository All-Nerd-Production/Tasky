"""
items.py — CRUD de itens + WebSocket para atualizações em tempo real.
"""
import json
from datetime import datetime
from typing import Optional, List, Dict, Set

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.models import User, Project, Item, Comment, Activity, workspace_members

router = APIRouter(tags=["items"])


# ── WebSocket manager ─────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        # project_id → set de conexões ativas
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, project_id: str):
        await ws.accept()
        if project_id not in self.rooms:
            self.rooms[project_id] = set()
        self.rooms[project_id].add(ws)

    def disconnect(self, ws: WebSocket, project_id: str):
        if project_id in self.rooms:
            self.rooms[project_id].discard(ws)

    async def broadcast(self, project_id: str, message: dict, exclude: WebSocket = None):
        """Envia mensagem para todos na sala exceto o remetente."""
        if project_id not in self.rooms:
            return
        dead = set()
        for ws in self.rooms[project_id]:
            if ws is exclude:
                continue
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead.add(ws)
        self.rooms[project_id] -= dead


manager = ConnectionManager()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ItemCreate(BaseModel):
    title: str
    description: str = ""
    item_type: str = "task"
    status: str = "backlog"
    priority: str = "medium"
    story_points: Optional[int] = None
    assignee_id: Optional[str] = None
    parent_id: Optional[str] = None
    tags: List[str] = []
    due_date: Optional[str] = None
    notedex_note_ids: List[str] = []

class ItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    story_points: Optional[int] = None
    assignee_id: Optional[str] = None
    tags: Optional[List[str]] = None
    due_date: Optional[str] = None
    notedex_note_ids: Optional[List[str]] = None
    board_order: Optional[float] = None

class CommentCreate(BaseModel):
    content: str
    is_internal: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_mini(user: User) -> dict:
    if not user: return None
    return {
        "id": user.id, "username": user.username,
        "display_name": user.display_name,
        "avatar_emoji": user.avatar_emoji,
        "avatar_color": user.avatar_color,
    }


def _serialize_item(item: Item, db: Session) -> dict:
    children_count = db.query(Item).filter(Item.parent_id == item.id).count()
    comments_count = len(item.comments)
    return {
        "id": item.id, "key": item.key, "title": item.title,
        "description": item.description,
        "item_type": item.item_type, "status": item.status, "priority": item.priority,
        "story_points": item.story_points,
        "project_id": item.project_id,
        "parent_id": item.parent_id,
        "assignee": _user_mini(item.assignee),
        "assignee_id": item.assignee_id,
        "reporter": _user_mini(item.reporter),
        "tags": item.tags or [],
        "notedex_note_ids": item.notedex_note_ids or [],
        "notedex_note_id": item.notedex_note_id,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "board_order": item.board_order,
        "children_count": children_count,
        "comments_count": comments_count,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


def _log_activity(db: Session, item: Item, user: User, action: str,
                   field: str = None, old: str = None, new: str = None):
    act = Activity(
        item_id=item.id, user_id=user.id,
        action=action, field=field,
        old_value=old, new_value=new,
    )
    db.add(act)


def _next_key(db: Session, project: Project) -> str:
    project.item_counter += 1
    db.flush()
    return f"{project.key}-{project.item_counter}"


def _check_project_access(project_id: str, user: User, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p: raise HTTPException(404, "Projeto não encontrado")
    # Verifica se user é membro do workspace
    member = db.execute(
        workspace_members.select().where(
            workspace_members.c.workspace_id == p.workspace_id,
            workspace_members.c.user_id == user.id
        )
    ).first()
    if not member: raise HTTPException(403, "Sem acesso ao projeto")
    return p


# ── Item endpoints ────────────────────────────────────────────────────────────

@router.get("/projects/{pid}/items")
def list_items(
    pid: str,
    status: Optional[str] = None,
    item_type: Optional[str] = None,
    assignee_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _check_project_access(pid, user, db)
    q = db.query(Item).filter(Item.project_id == pid)
    if status:      q = q.filter(Item.status == status)
    if item_type:   q = q.filter(Item.item_type == item_type)
    if assignee_id: q = q.filter(Item.assignee_id == assignee_id)
    items = q.order_by(Item.board_order, Item.created_at).all()
    return [_serialize_item(i, db) for i in items]


@router.post("/projects/{pid}/items")
async def create_item(
    pid: str,
    body: ItemCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _check_project_access(pid, user, db)

    item = Item(
        key=_next_key(db, project),
        title=body.title, description=body.description,
        item_type=body.item_type, status=body.status, priority=body.priority,
        story_points=body.story_points,
        assignee_id=body.assignee_id, reporter_id=user.id,
        parent_id=body.parent_id,
        tags=body.tags, project_id=pid,
        notedex_note_ids=body.notedex_note_ids,
        due_date=datetime.fromisoformat(body.due_date) if body.due_date else None,
        board_order=float(db.query(Item).filter(Item.project_id==pid, Item.status==body.status).count()),
    )
    db.add(item); db.flush()
    _log_activity(db, item, user, "created")
    db.commit(); db.refresh(item)

    serialized = _serialize_item(item, db)
    # Broadcast WebSocket
    await manager.broadcast(pid, {"event": "item_created", "data": serialized})
    return serialized


@router.get("/items/{iid}")
def get_item(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    _check_project_access(item.project_id, user, db)
    return _serialize_item(item, db)


@router.put("/items/{iid}")
async def update_item(
    iid: str,
    body: ItemUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    _check_project_access(item.project_id, user, db)

    changes = []
    for field, value in body.dict(exclude_none=True).items():
        old = getattr(item, field, None)
        if old != value:
            setattr(item, field, value)
            changes.append((field, str(old), str(value)))

    # Marca completion
    if body.status == "done" and item.completed_at is None:
        item.completed_at = datetime.utcnow()
    elif body.status and body.status != "done":
        item.completed_at = None

    if body.due_date:
        item.due_date = datetime.fromisoformat(body.due_date)

    for field, old, new in changes:
        _log_activity(db, item, user, "updated", field, old, new)

    db.commit(); db.refresh(item)
    serialized = _serialize_item(item, db)
    await manager.broadcast(item.project_id, {"event": "item_updated", "data": serialized})
    return serialized


@router.delete("/items/{iid}")
async def delete_item(
    iid: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    project_id = item.project_id
    _check_project_access(project_id, user, db)
    item.status = "cancelled"
    _log_activity(db, item, user, "cancelled")
    db.commit()
    await manager.broadcast(project_id, {"event": "item_deleted", "data": {"id": iid}})
    return {"ok": True}


# ── Comments ──────────────────────────────────────────────────────────────────

@router.get("/items/{iid}/comments")
def list_comments(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    _check_project_access(item.project_id, user, db)
    return [
        {
            "id": c.id, "content": c.content,
            "author": _user_mini(c.author),
            "is_internal": c.is_internal, "edited": c.edited,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in sorted(item.comments, key=lambda c: c.created_at)
    ]


@router.post("/items/{iid}/comments")
async def add_comment(
    iid: str, body: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    _check_project_access(item.project_id, user, db)

    c = Comment(item_id=iid, author_id=user.id, content=body.content, is_internal=body.is_internal)
    db.add(c)
    _log_activity(db, item, user, "commented")
    db.commit(); db.refresh(c)

    data = {
        "id": c.id, "content": c.content,
        "author": _user_mini(user),
        "is_internal": c.is_internal,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
    await manager.broadcast(item.project_id, {"event": "comment_added", "item_id": iid, "data": data})
    return data


# ── Activity log ──────────────────────────────────────────────────────────────

@router.get("/items/{iid}/activity")
def item_activity(iid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(Item).filter(Item.id == iid).first()
    if not item: raise HTTPException(404)
    _check_project_access(item.project_id, user, db)
    acts = db.query(Activity).filter(Activity.item_id == iid).order_by(Activity.created_at.desc()).limit(50).all()
    return [
        {
            "id": a.id, "action": a.action, "field": a.field,
            "old_value": a.old_value, "new_value": a.new_value,
            "user": _user_mini(a.user),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in acts
    ]


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/projects/{pid}/stats")
def project_stats(pid: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_project_access(pid, user, db)
    items = db.query(Item).filter(Item.project_id == pid).all()

    by_status = {}
    by_type   = {}
    by_priority = {}
    for i in items:
        by_status[i.status]     = by_status.get(i.status, 0)     + 1
        by_type[i.item_type]    = by_type.get(i.item_type, 0)    + 1
        by_priority[i.priority] = by_priority.get(i.priority, 0) + 1

    total_sp    = sum(i.story_points or 0 for i in items)
    done_sp     = sum(i.story_points or 0 for i in items if i.status == "done")
    open_bugs   = sum(1 for i in items if i.item_type == "bug" and i.status not in ("done","cancelled"))

    return {
        "total": len(items), "by_status": by_status,
        "by_type": by_type, "by_priority": by_priority,
        "total_story_points": total_sp, "done_story_points": done_sp,
        "open_bugs": open_bugs,
    }


# ── WebSocket ─────────────────────────────────────────────────────────────────

@router.websocket("/ws/projects/{pid}")
async def websocket_project(
    pid: str,
    ws: WebSocket,
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    WebSocket de tempo real para um projeto.
    Conecta com: ws://host/ws/projects/{pid}?token={jwt}
    """
    # Valida token
    try:
        from app.core.security import decode_token
        payload = decode_token(token)
        user_id = payload.get("sub")
        user = db.query(User).filter(User.id == user_id).first()
        if not user: await ws.close(1008); return
    except Exception:
        await ws.close(1008); return

    await manager.connect(ws, pid)

    # Anuncia entrada
    await manager.broadcast(pid, {
        "event": "user_joined",
        "data": {"user": {"id": user.id, "display_name": user.display_name, "avatar_emoji": user.avatar_emoji, "avatar_color": user.avatar_color}}
    }, exclude=ws)

    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                # Apenas retransmite eventos de presença (cursor, etc.)
                if msg.get("event") in ("cursor_move", "typing", "user_presence"):
                    await manager.broadcast(pid, {**msg, "user_id": user.id}, exclude=ws)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(ws, pid)
        await manager.broadcast(pid, {
            "event": "user_left",
            "data": {"user_id": user.id}
        })
