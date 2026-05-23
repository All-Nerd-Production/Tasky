"""
models.py — Modelos completos do Tasky.
User → Workspace → Project → Item (hierarquia) → Comment / Activity
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, DateTime, Integer, Boolean,
    ForeignKey, JSON, Float, Table
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


def gen_uuid():
    return str(uuid.uuid4())


# ── Tabela de associação: usuários ↔ workspaces ──────────────────────────────
workspace_members = Table(
    "workspace_members", Base.metadata,
    Column("workspace_id", String, ForeignKey("workspaces.id", ondelete="CASCADE")),
    Column("user_id",      String, ForeignKey("users.id",       ondelete="CASCADE")),
    Column("role",         String, default="member"),  # owner | admin | member | viewer
    Column("joined_at",   DateTime, server_default=func.now()),
)

# ── Tabela de associação: usuários ↔ projetos ────────────────────────────────
project_members = Table(
    "project_members", Base.metadata,
    Column("project_id", String, ForeignKey("projects.id", ondelete="CASCADE")),
    Column("user_id",    String, ForeignKey("users.id",    ondelete="CASCADE")),
    Column("role",       String, default="member"),
)


class User(Base):
    __tablename__ = "users"

    id           = Column(String, primary_key=True, default=gen_uuid)
    email        = Column(String(320), unique=True, nullable=False, index=True)
    username     = Column(String(100), unique=True, nullable=False, index=True)
    display_name = Column(String(200), nullable=False)
    avatar_color = Column(String(7), default="#7B5EA7")
    avatar_emoji = Column(String(10), default="👤")
    password_hash= Column(String(200), nullable=False)
    is_active    = Column(Boolean, default=True)
    is_verified  = Column(Boolean, default=False)

    # Para integração com NoteDex
    notedex_token= Column(String(500), nullable=True)  # token JWT do NoteDex
    notedex_url  = Column(String(500), nullable=True)  # URL da instância NoteDex

    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_login   = Column(DateTime, nullable=True)

    workspaces   = relationship("Workspace", secondary=workspace_members, back_populates="members")
    items_assigned = relationship("Item", foreign_keys="Item.assignee_id", back_populates="assignee")


class Workspace(Base):
    __tablename__ = "workspaces"

    id          = Column(String, primary_key=True, default=gen_uuid)
    name        = Column(String(200), nullable=False)
    slug        = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    icon        = Column(String(10), default="🏢")
    color       = Column(String(7), default="#7B5EA7")
    owner_id    = Column(String, ForeignKey("users.id"), nullable=False)
    is_personal = Column(Boolean, default=False)

    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())

    members  = relationship("User", secondary=workspace_members, back_populates="workspaces")
    projects = relationship("Project", back_populates="workspace", cascade="all, delete-orphan")
    owner    = relationship("User", foreign_keys=[owner_id])


class Project(Base):
    __tablename__ = "projects"

    id           = Column(String, primary_key=True, default=gen_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    name         = Column(String(300), nullable=False)
    description  = Column(Text, default="")
    key          = Column(String(10), nullable=False)   # ex: "PROJ"
    color        = Column(String(7), default="#7B5EA7")
    icon         = Column(String(10), default="📋")
    is_archived  = Column(Boolean, default=False)
    item_counter = Column(Integer, default=0)           # auto-incrementa key

    # Configurações do projeto
    settings     = Column(JSON, default=dict)           # workflow customizável
    notedex_note_id = Column(String, nullable=True)     # ID da nota no NoteDex

    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    workspace    = relationship("Workspace", back_populates="projects")
    items        = relationship("Item", back_populates="project", cascade="all, delete-orphan")
    members      = relationship("User", secondary=project_members)


class Item(Base):
    __tablename__ = "items"

    id           = Column(String, primary_key=True, default=gen_uuid)
    key          = Column(String(20), nullable=False, index=True)  # PROJ-42
    title        = Column(String(500), nullable=False)
    description  = Column(Text, default="")

    # Classificação
    item_type    = Column(String(20), default="task")     # initiative|epic|story|task|bug|subtask
    status       = Column(String(20), default="backlog")  # backlog|selected|in_progress|in_review|in_qa|done|cancelled
    priority     = Column(String(10), default="medium")   # low|medium|high|critical

    # Estimativas
    story_points = Column(Integer, nullable=True)
    time_estimate= Column(Integer, nullable=True)         # minutos
    time_spent   = Column(Integer, nullable=True)         # minutos

    # Pessoas
    project_id   = Column(String, ForeignKey("projects.id",  ondelete="CASCADE"), nullable=False, index=True)
    assignee_id  = Column(String, ForeignKey("users.id",     ondelete="SET NULL"), nullable=True)
    reporter_id  = Column(String, ForeignKey("users.id",     ondelete="SET NULL"), nullable=True)
    parent_id    = Column(String, ForeignKey("items.id",     ondelete="SET NULL"), nullable=True)

    # Metadados ricos
    tags         = Column(JSON, default=list)
    labels       = Column(JSON, default=list)
    attachments  = Column(JSON, default=list)             # URLs de anexos
    custom_fields= Column(JSON, default=dict)

    # Datas
    due_date     = Column(DateTime, nullable=True)
    started_at   = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Integração NoteDex
    notedex_note_ids = Column(JSON, default=list)         # IDs de notas relacionadas
    notedex_note_id  = Column(String, nullable=True)      # nota gerada automaticamente

    # Posição no board
    board_order  = Column(Float, default=0.0)

    created_at   = Column(DateTime, server_default=func.now())
    updated_at   = Column(DateTime, server_default=func.now(), onupdate=func.now())

    project      = relationship("Project", back_populates="items")
    assignee     = relationship("User", foreign_keys=[assignee_id], back_populates="items_assigned")
    reporter     = relationship("User", foreign_keys=[reporter_id])
    parent       = relationship("Item", remote_side="Item.id", foreign_keys=[parent_id])
    children     = relationship("Item", foreign_keys=[parent_id])
    comments     = relationship("Comment", back_populates="item", cascade="all, delete-orphan")
    activities   = relationship("Activity", back_populates="item", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id         = Column(String, primary_key=True, default=gen_uuid)
    item_id    = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id  = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content    = Column(Text, nullable=False)
    is_internal= Column(Boolean, default=False)    # comentário interno (não visível para externos)
    edited     = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    item   = relationship("Item",    back_populates="comments")
    author = relationship("User",    foreign_keys=[author_id])


class Activity(Base):
    """Log de auditoria — registra toda mudança em um item."""
    __tablename__ = "activities"

    id         = Column(String, primary_key=True, default=gen_uuid)
    item_id    = Column(String, ForeignKey("items.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action     = Column(String(50), nullable=False)    # created|status_changed|assigned|commented|...
    field      = Column(String(100), nullable=True)    # campo alterado
    old_value  = Column(Text, nullable=True)
    new_value  = Column(Text, nullable=True)
    meta       = Column(JSON, default=dict)

    created_at = Column(DateTime, server_default=func.now())

    item = relationship("Item", back_populates="activities")
    user = relationship("User", foreign_keys=[user_id])


class Invitation(Base):
    """Convites para workspace via email."""
    __tablename__ = "invitations"

    id           = Column(String, primary_key=True, default=gen_uuid)
    workspace_id = Column(String, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    email        = Column(String(320), nullable=False)
    role         = Column(String(20), default="member")
    token        = Column(String(100), unique=True, nullable=False)
    invited_by   = Column(String, ForeignKey("users.id"), nullable=True)
    accepted     = Column(Boolean, default=False)
    expires_at   = Column(DateTime, nullable=False)
    created_at   = Column(DateTime, server_default=func.now())
