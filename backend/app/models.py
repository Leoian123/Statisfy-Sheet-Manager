from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    display_name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10))


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    session: Mapped[int] = mapped_column(Integer, default=1)
    master_name: Mapped[str] = mapped_column(String(100))
    open_quests: Mapped[list[Any]] = mapped_column(JSON, default=list)


class Character(Base):
    __tablename__ = "characters"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    owner: Mapped[User] = relationship(lazy="joined")
    name: Mapped[str] = mapped_column(String(50))
    name_key: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # nome minuscolo, per l'unicità
    classe: Mapped[str] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(Integer, default=1)
    exp_pct: Mapped[float] = mapped_column(default=0)
    regno: Mapped[str] = mapped_column(String(100))
    pvp: Mapped[str] = mapped_column(String(10), default="Bianco")
    corone: Mapped[int] = mapped_column(Integer, default=0)
    scellini: Mapped[int] = mapped_column(Integer, default=0)
    gilda: Mapped[dict] = mapped_column(JSON, default=dict)
    stats: Mapped[list] = mapped_column(JSON, default=list)
    item_bonus: Mapped[dict] = mapped_column(JSON, default=dict)
    equip: Mapped[dict] = mapped_column(JSON, default=dict)
    magia: Mapped[dict] = mapped_column(JSON, default=dict)
    resources: Mapped[dict] = mapped_column(JSON, default=dict)
    titles: Mapped[list] = mapped_column(JSON, default=list)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    active_skills: Mapped[list] = mapped_column(JSON, default=list)
    talents: Mapped[list] = mapped_column(JSON, default=list)
    inventory: Mapped[list] = mapped_column(JSON, default=list)
    pets: Mapped[list] = mapped_column(JSON, default=list)
    curses: Mapped[list] = mapped_column(JSON, default=list)
    quests: Mapped[list] = mapped_column(JSON, default=list)
    reputation: Mapped[list] = mapped_column(JSON, default=list)
    combat: Mapped[dict] = mapped_column(JSON, default=dict)
    death: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)


class Npc(Base):
    __tablename__ = "npcs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    level: Mapped[int] = mapped_column(Integer, default=1)
    race: Mapped[str] = mapped_column(String(100), default="")
    place: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(200), default="")
    trust: Mapped[str] = mapped_column(String(20), default="Neutrale")
    knows: Mapped[str] = mapped_column(Text, default="")
    debts: Mapped[str] = mapped_column(Text, default="")
    last: Mapped[str] = mapped_column(Text, default="")
    secret: Mapped[str] = mapped_column(Text, default="")
    history: Mapped[list] = mapped_column(JSON, default=list)


class Issue(Base):
    __tablename__ = "issues"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    sev: Mapped[str] = mapped_column(String(10))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    decision: Mapped[str | None] = mapped_column(Text, nullable=True)
