"""Schemi Pydantic per i corpi delle richieste (le risposte sono dict costruiti in serialize.py)."""
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class LoginIn(BaseModel):
    username: str
    password: str


class StatRowIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    code: str
    name: str = ""
    kind: Literal["base", "avanzata"] = "base"
    iniziale: float = 0
    creazione: float = 0
    investiti: float = 0
    levelup: float = 0
    altro: float = 0
    titoli: float = 0
    note: str | None = None


class PreviewIn(BaseModel):
    stats: list[StatRowIn]
    item_bonus: dict[str, float] | None = None
    equip: dict[str, float] | None = None
    magia: dict[str, int] | None = None


class CreationStats(BaseModel):
    STR: int
    DEX: int
    VIT: int
    INT: int


class CharacterCreate(BaseModel):
    name: str
    classe_id: str
    stats: CreationStats
    regno_id: str
    owner_id: int | None = None


class Gilda(BaseModel):
    nome: str = ""
    ruolo: str = ""


class Resources(BaseModel):
    hp: float = Field(ge=0)
    mp: float = Field(ge=0)
    sp: float = Field(ge=0)


class Equip(BaseModel):
    difesa: float = 0
    difesaMagica: float = 0
    blocco: float = 0


class Magia(BaseModel):
    nucleo: int = Field(0, ge=0)
    talenti: int = Field(0, ge=0)


class CombatPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    position: str


# Campi modificabili dal player e dal solo master
PLAYER_FIELDS = {"resources", "combat"}
MASTER_FIELDS = {"exp_pct", "regno", "pvp", "gilda", "corone", "scellini", "item_bonus", "equip", "magia",
                 "titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"}
LOCKED_FIELDS = {"name", "classe", "stats", "level", "id", "owner_id"}


class CharacterPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resources: Resources | None = None
    combat: CombatPatch | None = None
    exp_pct: float | None = Field(None, ge=0, le=100)
    regno: str | None = None
    pvp: Literal["Bianco", "Grigio", "Rosso"] | None = None
    gilda: Gilda | None = None
    corone: int | None = Field(None, ge=0)
    scellini: int | None = Field(None, ge=0)
    item_bonus: dict[str, float] | None = None
    equip: Equip | None = None
    magia: Magia | None = None
    titles: list[dict[str, Any]] | None = None
    skills: list[dict[str, Any]] | None = None
    active_skills: list[dict[str, Any]] | None = None
    talents: list[dict[str, Any]] | None = None
    inventory: list[dict[str, Any]] | None = None
    pets: list[dict[str, Any]] | None = None
    curses: list[dict[str, Any]] | None = None
    quests: list[dict[str, Any]] | None = None
    reputation: list[dict[str, Any]] | None = None


class DistributeIn(BaseModel):
    alloc: dict[str, int]


class CombatActionIn(BaseModel):
    type: Literal["damage", "heal", "spend_mp", "spend_sp"]
    amount: int = Field(gt=0)


class EffectIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["good", "bad"]
    turns: int = Field(ge=1, le=99)
    text: str | None = None
    hpPerTurn: float | None = None
    absorb: float | None = Field(None, ge=0)


class DeathIn(BaseModel):
    hubris: bool = False
    respawn: Literal["checkpoint", "here"] = "checkpoint"


Trust = Literal["Scarso", "Neutrale", "Buono", "Eccellente"]


class NpcCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    level: int = Field(1, ge=1)
    race: str = ""
    place: str = ""
    role: str = ""
    trust: Trust = "Neutrale"
    knows: str = ""
    debts: str = ""
    last: str = ""
    secret: str = ""


class NpcPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(None, min_length=1, max_length=100)
    level: int | None = Field(None, ge=1)
    race: str | None = None
    place: str | None = None
    role: str | None = None
    trust: Trust | None = None
    knows: str | None = None
    debts: str | None = None
    last: str | None = None
    secret: str | None = None


class InteractionIn(BaseModel):
    text: str = Field(min_length=1)


class IssuePatch(BaseModel):
    resolved: bool | None = None
    decision: str | None = None
