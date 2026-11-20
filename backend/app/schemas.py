"""Schemi Pydantic per i corpi delle richieste (le risposte sono dict costruiti in serialize.py)."""
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# Tetti generici: oltre questi valori i numeri non hanno senso di gioco e gli interi non stanno in SQLite (int64)
MAX_LEVEL = 9999
MAX_AMOUNT = 10 ** 9
MAX_COINS = 10 ** 12


class LoginIn(BaseModel):
    username: str = Field(max_length=100)
    password: str = Field(max_length=256)


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
    oggetti: float = 0  # calcolata dal server: in /preview vale solo se non si passa `inventory`
    note: str | None = None


class PreviewIn(BaseModel):
    stats: list[StatRowIn] = Field(max_length=100)
    item_bonus: dict[str, float] | None = None
    equip: dict[str, float] | None = None
    magia: dict[str, int] | None = None
    inventory: list[dict[str, Any]] | None = Field(None, max_length=2000)  # se presente, l'equipaggiato ricalcola Oggetti/equip/bonus
    # Creazione guidata: aggiunge l'equipaggiamento iniziale della classe, indossato come alla creazione del PG
    classe_id: str | None = None


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
    ki: float | None = Field(default=None, ge=0)  # solo per i PG con la statistica avanzata KI


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
MASTER_FIELDS = {"level", "exp_pct", "regno", "pvp", "gilda", "corone", "scellini", "stats", "item_bonus", "equip",
                 "magia", "titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests",
                 "reputation"}
LOCKED_FIELDS = {"name", "classe", "id", "owner_id"}

# ---------- Elementi delle sezioni modificabili dal Master ----------
# extra="allow": i campi non previsti (es. slot, bonus e id degli oggetti dell'inventario MMORPG) restano intatti.
# Le regole di gioco (rarità, Gradi, tetti, codici) si controllano in rules.sheet_errors.

Pct = float | Literal["MAX"]
Name = Annotated[str, Field(min_length=1, max_length=120)]


class StatRowEdit(BaseModel):
    """Riga di statistica inviata dal Master. `total` è calcolato e viene ignorato; `oggetti` è calcolata
    dagli oggetti equipaggiati e non si può cambiare."""
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^[A-Z]{2,5}$")
    name: str = Field(min_length=1, max_length=40)
    kind: Literal["base", "avanzata"] = "avanzata"
    iniziale: float = 0
    creazione: float = 0
    investiti: float = 0
    levelup: float = 0
    altro: float = 0
    titoli: float = 0
    note: str | None = None
    oggetti: float | None = None
    total: float | None = None


class _Item(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: Name


class TitleIn(_Item):
    rarity: str
    bonus: dict[str, float] = Field(default_factory=dict)


class SkillIn(_Item):
    lvl: int
    pct: Pct = 0
    type: str = ""
    passive: str | None = None


class ActiveSkillIn(_Item):
    effect: str = ""
    lvl: int = 1
    pct: Pct = 0
    cost: str = ""
    cd: int = Field(0, ge=0)


class TalentIn(_Item):
    rarity: str
    origin: str = ""
    effect: str = ""


class InventoryItemIn(_Item):
    rarity: str
    type: str = ""
    stats: str | dict[str, float] | None = ""
    qty: int = Field(1, ge=0)
    weight: float = Field(0, ge=0)


class PetSkillIn(_Item):
    lvl: int
    pct: Pct = 0


class PetIn(_Item):
    species: str = ""
    lvl: int = Field(1, ge=1)
    passive: str = ""
    skills: list[PetSkillIn] = Field(default_factory=list)


class CurseIn(_Item):
    desc: str = ""
    bonus: str = ""
    malus: str = ""


class QuestIn(_Item):
    progress: str = ""
    reward: str = ""
    rarity: str = ""


class ReputationIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    scope: str = ""
    target: Name
    value: float = 0
    range: float = Field(0, ge=0)
    label: str = ""


class CharacterPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resources: Resources | None = None
    combat: CombatPatch | None = None
    level: int | None = Field(None, ge=1, le=MAX_LEVEL)
    exp_pct: float | None = Field(None, ge=0, le=100)
    regno: str | None = None
    pvp: Literal["Bianco", "Grigio", "Rosso"] | None = None
    gilda: Gilda | None = None
    corone: int | None = Field(None, ge=0, le=MAX_COINS)
    scellini: int | None = Field(None, ge=0, le=MAX_COINS)
    stats: list[StatRowEdit] | None = None
    item_bonus: dict[str, float] | None = None
    equip: Equip | None = None
    magia: Magia | None = None
    titles: list[TitleIn] | None = None
    skills: list[SkillIn] | None = None
    active_skills: list[ActiveSkillIn] | None = None
    talents: list[TalentIn] | None = None
    inventory: list[InventoryItemIn] | None = None
    pets: list[PetIn] | None = None
    curses: list[CurseIn] | None = None
    quests: list[QuestIn] | None = None
    reputation: list[ReputationIn] | None = None


SlotKey = Literal["testa", "collo", "spalle", "mantello", "torso", "polsi", "mani", "cintura", "gambe", "piedi",
                  "anello1", "anello2", "ninnolo1", "ninnolo2", "manoPrincipale", "manoSecondaria"]


class EquipIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str = Field(min_length=1)
    slot: SlotKey | None = None


class UnequipIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slot: SlotKey


class MoveSlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_slot: SlotKey
    to_slot: SlotKey


class DistributeIn(BaseModel):
    alloc: dict[str, int]


class CombatActionIn(BaseModel):
    type: Literal["damage", "heal", "spend_mp", "spend_sp", "spend_ki"]
    amount: int = Field(gt=0, le=MAX_AMOUNT)


class EffectIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["good", "bad"]
    turns: int = Field(ge=1, le=99)
    text: str | None = Field(None, max_length=300)
    hpPerTurn: float | None = Field(None, ge=-MAX_AMOUNT, le=MAX_AMOUNT, allow_inf_nan=False)
    absorb: float | None = Field(None, ge=0, le=MAX_AMOUNT, allow_inf_nan=False)


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
