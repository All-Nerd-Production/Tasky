"""
auth.py — Registro, login, perfil e integração NoteDex.
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_token, oauth2_scheme
from app.models.models import User, Workspace, workspace_members

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: str
    username: str
    display_name: str
    password: str
    avatar_emoji: str = "👤"
    avatar_color: str = "#7B5EA7"

class LoginIn(BaseModel):
    email: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class UserOut(BaseModel):
    id: str
    email: str
    username: str
    display_name: str
    avatar_color: str
    avatar_emoji: str
    is_active: bool
    created_at: datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    return user


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_color": user.avatar_color,
        "avatar_emoji": user.avatar_emoji,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _create_personal_workspace(user: User, db: Session) -> Workspace:
    """Cria workspace pessoal automaticamente ao registrar."""
    slug = f"{user.username}-personal"
    ws = Workspace(
        name=f"Workspace de {user.display_name}",
        slug=slug,
        icon="🏠",
        color=user.avatar_color,
        owner_id=user.id,
        is_personal=True,
        description="Seu workspace pessoal",
    )
    db.add(ws)
    db.flush()

    # Adiciona como owner
    db.execute(workspace_members.insert().values(
        workspace_id=ws.id, user_id=user.id, role="owner"
    ))
    db.commit()
    return ws


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenOut)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    # Verifica duplicatas
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "Email já cadastrado")
    if db.query(User).filter(User.username == body.username.lower()).first():
        raise HTTPException(400, "Username já em uso")

    user = User(
        email=body.email.lower().strip(),
        username=body.username.lower().strip(),
        display_name=body.display_name.strip(),
        password_hash=hash_password(body.password),
        avatar_emoji=body.avatar_emoji,
        avatar_color=body.avatar_color,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Cria workspace pessoal
    _create_personal_workspace(user, db)

    token = create_access_token({"sub": user.id})
    return TokenOut(access_token=token, user=_user_dict(user))


@router.post("/token", response_model=TokenOut)
def login_form(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Endpoint OAuth2 padrão (para Swagger UI)."""
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(400, "Email ou senha incorretos")
    user.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": user.id})
    return TokenOut(access_token=token, user=_user_dict(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(400, "Email ou senha incorretos")
    user.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token({"sub": user.id})
    return TokenOut(access_token=token, user=_user_dict(user))


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return _user_dict(current_user)


@router.put("/me")
def update_me(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"display_name", "avatar_emoji", "avatar_color"}
    for k, v in body.items():
        if k in allowed:
            setattr(current_user, k, v)
    db.commit()
    return _user_dict(current_user)


@router.put("/me/notedex")
def link_notedex(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Vincula token NoteDex ao perfil para integração."""
    current_user.notedex_token = body.get("token")
    current_user.notedex_url   = body.get("url", "http://localhost:8000")
    db.commit()
    return {"ok": True, "notedex_url": current_user.notedex_url}


@router.post("/me/change-password")
def change_password(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.get("old_password",""), current_user.password_hash):
        raise HTTPException(400, "Senha atual incorreta")
    current_user.password_hash = hash_password(body["new_password"])
    db.commit()
    return {"ok": True}
