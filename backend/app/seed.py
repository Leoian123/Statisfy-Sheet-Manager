"""Dati iniziali (da mockup/data.js). Uso: python -m app.seed [--reset]"""
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rules
from .auth import hash_password
from .db import Base, SessionLocal, engine
from .models import Campaign, Character, Issue, Npc, User

USERS = [("master", "Il Narratore", "master")] + [(f"giocatore{i}", f"Giocatore {i}", "player") for i in range(1, 7)]


def stat(code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note=None):
    return {"code": code, "name": name, "kind": kind, "iniziale": iniziale, "creazione": creazione,
            "investiti": investiti, "levelup": levelup, "altro": altro, "titoli": titoli, "note": note}


KELVIN = {
    "name": "Kelvin", "classe": "Domatore", "level": 77, "exp_pct": 0, "regno": "Valeria", "pvp": "Bianco",
    "gilda": {"nome": "—", "ruolo": "Nessuna gilda"}, "corone": 25, "scellini": 30,
    "stats": [
        stat("STR", "Forza", "base", 10, 0, 84, 76, 0, 0),
        stat("DEX", "Destrezza", "base", 10, 0, 401, 76, 0, 5),
        stat("VIT", "Vitalità", "base", 10, 20, 75, 76, 0, 5),
        stat("INT", "Intelligenza", "base", 10, 0, 0, 76, 0, 0),
        stat("FIN", "Finesse", "avanzata", 0, 0, 200, 35, 354, 60, "Altro = talento Finesse IV: (somma+titoli)×1,2"),
        stat("AUT", "Autorità", "avanzata", 5, 0, 0, 7, 0, 50, "Sbloccata al livello 70"),
    ],
    "item_bonus": {"evasione": 10, "critico": 12},
    "equip": {"difesa": 85, "difesaMagica": 0, "blocco": 0},
    "magia": {"nucleo": 4, "talenti": 0},
    "resources": {"hp": 2410, "mp": 640, "sp": 2900},
    "titles": [
        {"name": "Artigiano Talentuoso", "rarity": "Raro", "bonus": {"DEX": 5, "VIT": 5, "FIN": 10}},
        {"name": "Il Primo Passo verso l'Artigiano", "rarity": "Raro", "bonus": {"FIN": 50}},
        {"name": "Domatore delle Epoche", "rarity": "Epico", "bonus": {"AUT": 50}},
    ],
    "skills": [
        {"name": "Cooking", "lvl": 10, "pct": "MAX", "type": "Craft", "passive": "Gli effetti dei consumabili ingeriti raddoppiano"},
        {"name": "Crafting", "lvl": 10, "pct": "MAX", "type": "Craft", "passive": "Passiva di Grado X sbloccata"},
        {"name": "Leatherworking", "lvl": 9, "pct": 20, "type": "Craft"},
        {"name": "Ispeziona", "lvl": 8, "pct": 85, "type": "Utility"},
        {"name": "Domare", "lvl": 6, "pct": 40, "type": "Classe"},
        {"name": "Gathering", "lvl": 7, "pct": 12, "type": "Gathering"},
        {"name": "Spear", "lvl": 4, "pct": 66, "type": "Combat"},
        {"name": "Schivata", "lvl": 5, "pct": 30, "type": "Defense"},
        {"name": "Vis", "lvl": 1, "pct": 80, "type": "Knowledge"},
        {"name": "Lingua Eldarin", "lvl": 1, "pct": 85, "type": "Language"},
    ],
    "active_skills": [
        {"name": "Comando: Sottomissione", "effect": "Tenta di sottomettere una creatura indebolita", "lvl": 1, "pct": 0, "cost": "120 MP", "cd": 5},
        {"name": "Comando: Battaglia", "effect": "I compagni attaccano il bersaglio indicato con +20% danno", "lvl": 1, "pct": 60, "cost": "80 SP", "cd": 3},
    ],
    "talents": [
        {"name": "Ispeziona", "rarity": "Non Comune", "origin": "Lvl 05", "effect": "Rivela statistiche base di oggetti e creature"},
        {"name": "Gatherer", "rarity": "Comune", "origin": "Lvl 10", "effect": "+20% materiali raccolti"},
        {"name": "Segugio", "rarity": "Non Comune", "origin": "Lvl 15", "effect": "Segue le tracce di creature fino a 24 ore"},
        {"name": "Finesse I", "rarity": "Raro", "origin": "Lvl 20", "effect": "Sblocca la statistica Finesse"},
        {"name": "Finesse II", "rarity": "Raro", "origin": "Libro Abilità", "effect": "Finesse ×1,05"},
        {"name": "Giant Killer", "rarity": "Epico", "origin": "Lvl 45", "effect": "+30% danno contro creature di taglia grande"},
        {"name": "Linguistica", "rarity": "Non Comune", "origin": "Lvl 55", "effect": "Apprendimento lingue raddoppiato"},
        {"name": "Finesse IV", "rarity": "Epico", "origin": "Lvl 75", "effect": "Finesse ×1,2 su somma e titoli"},
    ],
    "inventory": [
        {"name": "La Promessa di Thanatos", "stats": "Lancia · Base 410 · +12% critico", "rarity": "Unico", "type": "Arma", "qty": 1, "weight": 6},
        {"name": "Spalla del Simbionte", "stats": "Difesa 85 · +10% Evasione", "rarity": "Epico", "type": "Armatura", "qty": 1, "weight": 4},
        {"name": "Kit del conciatore", "stats": "+5% qualità pelli", "rarity": "Non Comune", "type": "Strumento", "qty": 1, "weight": 3},
        {"name": "Pelle di Wyrm", "stats": "Materiale grezzo", "rarity": "Raro", "type": "Materiale", "qty": 4, "weight": 2},
        {"name": "Razione da viaggio", "stats": "+50% recupero per 1h", "rarity": "Comune", "type": "Cibo", "qty": 12, "weight": 0.5},
        {"name": "Diario di caccia", "stats": "Appunti sulle creature domate", "rarity": "Comune", "type": "Libro", "qty": 1, "weight": 1},
        {"name": "Corone d'Oro", "stats": "Moneta di Valeria", "rarity": "Comune", "type": "Monete", "qty": 25, "weight": 0},
        {"name": "Scellini", "stats": "Moneta minore", "rarity": "Comune", "type": "Monete", "qty": 30, "weight": 0},
    ],
    "pets": [
        {"name": "Celsius", "species": "Topo dei Ghiacci", "lvl": 56, "passive": "Aura di gelo",
         "skills": [{"name": "Morso glaciale", "lvl": 6, "pct": 30}, {"name": "Mimetismo nella neve", "lvl": 4, "pct": 10}]},
        {"name": "Fahrenheit", "species": "Wyrm del Fuoco", "lvl": 3, "passive": "Immunità alla lava",
         "skills": [{"name": "Ignis", "lvl": 9, "pct": 0}]},
    ],
    "curses": [
        {"name": "Braccio degli antichi", "desc": "Il braccio destro è posseduto da uno spirito antico.",
         "bonus": "+20% FOR nelle prove con il braccio posseduto", "malus": "−2 livelli di skill nei lavori di precisione"},
    ],
    "quests": [
        {"name": "Il Wyrm che non brucia", "progress": "2/3 indizi", "reward": "Uovo di Wyrm (Raro)", "rarity": "Raro"},
        {"name": "Pelli per la gilda dei conciatori", "progress": "8/20 pelli", "reward": "120 Corone, +Reputazione Valeria", "rarity": "Comune"},
    ],
    "reputation": [
        {"scope": "Regionale", "target": "Valeria", "value": 340, "range": 1000, "label": "Benvoluto"},
        {"scope": "Gruppo", "target": "Gilda dei Conciatori", "value": 42, "range": 100, "label": "Amico"},
        {"scope": "PNG", "target": "Marta la Locandiera", "value": 6, "range": 10, "label": "Fiducia"},
        {"scope": "Cosmica", "target": "Luxor", "value": 0, "range": 0, "label": "Neutrale"},
    ],
    "combat": {
        "position": "Media distanza", "turn": 1, "log": [],
        "effects": [
            {"name": "Emorragia", "kind": "bad", "text": "−3 HP/turno", "turns": 2, "hpPerTurn": -3},
            {"name": "Scudo Magico", "kind": "good", "text": "Assorbe 50 danni", "turns": 3, "absorb": 50},
            {"name": "Concentrazione", "kind": "good", "text": "+50% al prossimo attacco", "turns": 1},
        ],
        "cooldowns": [{"name": "Comando: Battaglia", "turns": 2}, {"name": "Comando: Sottomissione", "turns": 4}],
    },
}


def quick(name, owner, classe, level, s, str_, dex, vit, int_, **extra):
    return {
        "owner": owner, "name": name, "classe": classe, "level": level, "exp_pct": extra.get("exp_pct", 30),
        "regno": extra.get("regno", "Valeria"), "pvp": extra.get("pvp", "Bianco"),
        "gilda": extra.get("gilda", {"nome": "—", "ruolo": ""}), "corone": 0, "scellini": 0,
        "stats": [
            stat("STR", "Forza", "base", 10, s[0], str_, level - 1, 0, 0),
            stat("DEX", "Destrezza", "base", 10, s[1], dex, level - 1, 0, 0),
            stat("VIT", "Vitalità", "base", 10, s[2], vit, level - 1, 0, 0),
            stat("INT", "Intelligenza", "base", 10, s[3], int_, level - 1, 0, 0),
        ],
    }


OTHERS = [
    quick("Eric", "giocatore2", "Faro della Civiltà", 64, [0, 0, 10, 10], 40, 60, 210, 320,
          gilda={"nome": "Lanterne di Valeria", "ruolo": "Diplomatico"}),
    quick("Corax", "giocatore3", "Monaco", 181, [10, 10, 0, 0], 600, 700, 400, 100, pvp="Grigio",
          gilda={"nome": "Pugno di Raijin", "ruolo": "Ufficiale"}),
    quick("Deniel", "giocatore4", "Guerriero", 110, [10, 0, 10, 0], 620, 200, 270, 0),
    quick("Connor", "giocatore5", "Ladro", 52, [0, 20, 0, 0], 60, 330, 80, 40, regno="Qadesh"),
    quick("Dante", "giocatore6", "Ladro", 88, [0, 15, 5, 0], 120, 500, 150, 100, pvp="Rosso"),
]

NPCS = [
    {"name": "Marta la Locandiera", "level": 12, "race": "Umana", "place": "Alba Chiara — Il Gallo Storto",
     "role": "Locandiera, informatrice", "trust": "Buono",
     "knows": "Sa che Kelvin è un Immortale e che cerca uova di Wyrm.",
     "debts": "Kelvin le deve un favore (2 notti non pagate).",
     "last": "Sessione 14 — gli ha venduto una mappa delle grotte.",
     "secret": "Paga una tassa ai contrabbandieri del porto."},
    {"name": "Capitano Orsino", "level": 95, "race": "Umano", "place": "Alba Chiara — Caserma",
     "role": "Capitano della guardia", "trust": "Neutrale", "knows": "Conosce Kelvin solo di nome.", "debts": "—",
     "last": "Sessione 11 — ha multato Dante per rissa.", "secret": "Ha perso il fratello contro un Wyrm del Fuoco."},
    {"name": "Fra' Teodoro", "level": 40, "race": "Umano", "place": "Tempio di Luxor", "role": "Chierico, guaritore",
     "trust": "Eccellente", "knows": "Ha curato la maledizione di Kelvin per due volte.",
     "debts": "Kelvin ha promesso una donazione di 50 Corone.",
     "last": "Sessione 13 — ha studiato il Braccio degli antichi.",
     "secret": "Sospetta che lo spirito nel braccio sia un antico re."},
]

OPEN_QUESTS = [
    {"name": "Il Wyrm che non brucia", "who": "Kelvin", "rarity": "Raro", "due": "—"},
    {"name": "Taglia su Dante", "who": "Dante", "rarity": "Epico", "due": "24h di gioco"},
    {"name": "Ambasceria a Qadesh", "who": "Eric, Connor", "rarity": "Raro", "due": "Sessione 18"},
]

ISSUES = [
    {"title": "Moltiplicatore danno magico", "text": "Le schede usano INT/50, INT/60 e INT/80. Serve un divisore unico.",
     "sev": "bad", "resolved": True,
     "decision": "1 + INT/100. Ogni grado di nucleo magico o talento apposito abbassa il divisore di 10 (90, 80, …, minimo 10)."},
    {"title": "Stamina assente nell'Excel",
     "text": "Il regolamento definisce SP = 50 + (STR+DEX)×5, ma nessuna scheda la calcola.", "sev": "warn", "resolved": True,
     "decision": "Confermata SP = 50 + (STR+DEX)×5. Va aggiunta al modello e calcolata in automatico."},
    {"title": "Scala di rarità",
     "text": "Combat unisce Unico/Leggendario, il Crafting li separa e aggiunge Evolutivo; i titoli aggiungono Divino.",
     "sev": "warn", "resolved": True,
     "decision": "Scala unica a 8 gradi: Comune, Non Comune, Raro, Epico, Unico, Leggendario, Mitico, Divino. Base danno arma: Unico 250–500, Leggendario 500–1000, Mitico 1000–2000, Divino 2000+. Moltiplicatore creature = grado³ (fino a ×512). Evolutivo è un tipo di oggetto con rarità effettiva, non un grado."},
    {"title": "Punti Level Up incoerenti", "text": "Corax (lv 181) ha 185 punti invece di 180.", "sev": "warn",
     "resolved": False, "decision": None},
    {"title": "Formule non definite", "text": "Difesa, iniziativa, probabilità di critico e di blocco non hanno formula.",
     "sev": "bad", "resolved": True,
     "decision": "Difesa = VIT/10 + Difesa equip × (1 + VIT/100); Difesa magica = INT/10 + Difesa magica equip × (1 + INT/100); Iniziativa = 10 + DEX/10; Critico = 5 + DEX/40 % (max 75%); Blocco = Blocco scudo + STR/40 % (solo con scudo, max 75%)."},
]

LIST_FIELDS = ["titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"]


def _character(data: dict, owner: User) -> Character:
    c = Character(
        owner_id=owner.id, name=data["name"], name_key=data["name"].lower(), classe=data["classe"],
        level=data["level"], exp_pct=data["exp_pct"], regno=data["regno"], pvp=data["pvp"], gilda=data["gilda"],
        corone=data.get("corone", 0), scellini=data.get("scellini", 0), stats=data["stats"],
        item_bonus=data.get("item_bonus", {}), equip=data.get("equip", {"difesa": 0, "difesaMagica": 0, "blocco": 0}),
        magia=data.get("magia", {"nucleo": 0, "talenti": 0}),
        combat=data.get("combat", {"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": []}),
        death=None, **{f: data.get(f, []) for f in LIST_FIELDS},
    )
    if data.get("resources"):
        c.resources = data["resources"]
    else:
        d = rules.derived_values({"stats": c.stats, "equip": c.equip, "magia": c.magia})
        c.resources = {"hp": d["hp"], "mp": d["mp"], "sp": d["sp"]}
    return c


def seed(db: Session) -> None:
    users = {}
    for username, display, role in USERS:
        u = User(username=username, password_hash=hash_password(username), display_name=display, role=role)
        db.add(u)
        users[username] = u
    db.flush()
    master = users["master"]
    db.add(Campaign(name="Campagna di Alba Chiara", session=15, master_name=master.display_name,
                    open_quests=OPEN_QUESTS))
    db.add(_character(KELVIN, users["giocatore1"]))
    for o in OTHERS:
        db.add(_character(o, users[o["owner"]]))
    for n in NPCS:
        db.add(Npc(**n, history=[]))
    for i in ISSUES:
        db.add(Issue(**i))
    db.commit()


def seed_if_empty(db: Session) -> bool:
    Base.metadata.create_all(bind=db.get_bind())
    if db.scalar(select(User).limit(1)) is not None:
        return False
    seed(db)
    return True


def reset() -> None:
    Base.metadata.drop_all(bind=engine)
    with SessionLocal() as db:
        seed_if_empty(db)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
        print("Database ricreato con i dati di seed.")
    else:
        with SessionLocal() as db:
            print("Seed eseguito." if seed_if_empty(db) else "Database già popolato: nessuna modifica (usa --reset).")
