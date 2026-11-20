"""Regole STATISFY (porting di mockup/rules.js). Funzioni pure, nessun accesso al DB."""
from __future__ import annotations

import copy
import math
import re
import uuid
from typing import Any, Callable

BASE_STATS = ["STR", "DEX", "VIT", "INT"]
STAT_NAMES = {"STR": "Forza", "DEX": "Destrezza", "VIT": "Vitalità", "INT": "Intelligenza"}

SOURCES = [
    {"key": "iniziale", "label": "Iniziale", "help": "Valore di partenza della statistica (10 per le base)."},
    {"key": "creazione", "label": "Creazione", "help": "Punti bonus assegnati alla creazione del personaggio (anche negativi)."},
    {"key": "investiti", "label": "Investiti", "help": "Punti liberi distribuiti dal giocatore ai level up."},
    {"key": "levelup", "label": "Level up", "help": "+1 automatico a ogni statistica per ogni livello guadagnato."},
    {"key": "altro", "label": "Altro", "help": "Talenti, maledizioni, oggetti o decisioni del Master."},
    {"key": "titoli", "label": "Titoli", "help": "Bonus dei titoli ottenuti."},
    {"key": "oggetti", "label": "Oggetti",
     "help": "Bonus degli oggetti equipaggiati: calcolato dal server, non si inserisce a mano."},
]
# Colonne inseribili (tutte tranne "oggetti", che è calcolata dall'equipaggiamento)
STORED_SOURCE_KEYS = [s["key"] for s in SOURCES if s["key"] != "oggetti"]
SOURCE_KEYS = [s["key"] for s in SOURCES]

CREATION = {"base": 10, "bonus_points": 20, "min": 1, "name_min": 3, "name_max": 15}
LEVEL = {"auto_per_level": 1, "free_per_level": 10, "talent_every": 5}
REGEN = {"mp_pct": 15, "sp_pct": 25}

GRADES = ["Assoluto Novizio", "Novizio", "Praticante", "Amatore", "Dilettante", "Specializzando",
          "Abile", "Esperto", "Professionista", "Maestro"]
ROMAN = ["—", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]

RARITY_SCALE = [
    {"name": "Comune", "grade": 1, "weapon_base": [15, 30], "creature_mult": 1},
    {"name": "Non Comune", "grade": 2, "weapon_base": [30, 60], "creature_mult": 8},
    {"name": "Raro", "grade": 3, "weapon_base": [60, 120], "creature_mult": 27},
    {"name": "Epico", "grade": 4, "weapon_base": [120, 250], "creature_mult": 64},
    {"name": "Unico", "grade": 5, "weapon_base": [250, 500], "creature_mult": 125},
    {"name": "Leggendario", "grade": 6, "weapon_base": [500, 1000], "creature_mult": 216},
    {"name": "Mitico", "grade": 7, "weapon_base": [1000, 2000], "creature_mult": 343},
    {"name": "Divino", "grade": 8, "weapon_base": [2000, None], "creature_mult": 512},
]
RARITIES = [r["name"] for r in RARITY_SCALE]

POWER_RANKS = [
    {"min": 1, "name": "Soldato Semplice"}, {"min": 100, "name": "Guerriero Scelto"},
    {"min": 200, "name": "Guerriero Importante"}, {"min": 300, "name": "Eroe"},
    {"min": 400, "name": "Leggenda"}, {"min": 500, "name": "Mito"}, {"min": 600, "name": "Divinità"},
]

POSITIONS = ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"]

CLASSES = [
    {"id": "guerriero", "name": "Guerriero", "skill": "Attacco Possente", "skill_text": "+50% danno fisico",
     "cost": "15 SP", "cooldown": 3,
     "equip": [{"name": "Spada di Ferro", "type": "Arma", "equip_type": "unaMano", "weapon_base": 20, "req": {"STR": 15},
                "weight": 3, "stats_text": "Una mano · Base 20"},
               {"name": "Armatura di Cuoio Rinforzato", "type": "Armatura", "equip_type": "corazza",
                "bonus": {"difesa": 5}, "weight": 5, "stats_text": "Difesa 5"},
               {"name": "Scudo di Legno", "type": "Scudo", "equip_type": "scudo", "bonus": {"blocco": 20},
                "weight": 4, "stats_text": "Blocco 20%"}]},
    {"id": "mago", "name": "Mago", "skill": "Dardo Magico", "skill_text": "Colpisce sempre",
     "cost": "20 MP", "cooldown": 1,
     "equip": [{"name": "Bastone di Frassino", "type": "Arma", "equip_type": "dueMani", "weapon_base": 18,
                "req": {"INT": 15}, "weight": 3, "stats_text": "Due mani · Base 18 · +10% Mana"},
               {"name": "Vesti di Stoffa", "type": "Armatura", "equip_type": "corazza", "bonus": {"difesaMagica": 2},
                "weight": 2, "stats_text": "+3 Regen Mana"},
               {"name": "Grimorio Basilare", "type": "Libro", "equip_type": None, "weight": 1,
                "stats_text": "Dardo Magico + 2 slot liberi"}]},
    {"id": "ladro", "name": "Ladro", "skill": "Colpo Furtivo", "skill_text": "+100% critico se non visto",
     "cost": "10 SP", "cooldown": 2,
     "equip": [{"name": "Daga Affilata", "type": "Arma", "equip_type": "unaMano", "weapon_base": 15,
                "bonus": {"critico": 5}, "req": {"DEX": 15}, "weight": 1, "stats_text": "Una mano · Base 15 · +5% Critico"},
               {"name": "Armatura di Cuoio Morbido", "type": "Armatura", "equip_type": "corazza",
                "bonus": {"evasione": 10}, "weight": 4, "stats_text": "+10% Evasione"},
               {"name": "Kit da Scasso", "type": "Strumento", "equip_type": None, "weight": 1,
                "stats_text": "Grimaldelli e lime"}]},
    {"id": "chierico", "name": "Chierico", "skill": "Cura Minore", "skill_text": "Ripristina 40–60 HP",
     "cost": "25 MP", "cooldown": 1,
     "equip": [{"name": "Mazza Benedetta", "type": "Arma", "equip_type": "unaMano", "weapon_base": 20,
                "req": {"STR": 12}, "weight": 3, "stats_text": "Una mano · Base 20 · +10% vs non-morti"},
               {"name": "Vesti Sacre", "type": "Armatura", "equip_type": "corazza", "bonus": {"difesaMagica": 5},
                "weight": 2, "stats_text": "Difesa magica 5"},
               {"name": "Simbolo Sacro", "type": "Accessorio", "equip_type": "tenuto", "weight": 0.5,
                "stats_text": "Tenuto in mano secondaria · Focus divino"}]},
]

KINGDOMS = [
    {"id": "valeria", "name": "Valeria", "text": "Regno d'oro e grano. Il più comune per iniziare; moneta: Corone d'Oro."},
    {"id": "qadesh", "name": "Qadesh", "text": "Sole e sabbia, rotte carovaniere."},
    {"id": "frostland", "name": "Frostland", "text": "Ghiacci del nord, popoli duri."},
    {"id": "eldermoor", "name": "Eldermoor", "text": "Foreste verde e oro, tradizioni antiche."},
]


def js_round(x: float) -> int:
    """Math.round di JavaScript (mezzo verso +infinito)."""
    return int(math.floor(x + 0.5))


def num(v: Any) -> float:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return 0
    return 0 if math.isnan(n) else n


def clean(n: float) -> float | int:
    """Restituisce int se il valore è intero, altrimenti float arrotondato a 10 decimali."""
    n = round(n, 10)
    return int(n) if float(n).is_integer() else n


def stat_total(row: dict) -> float | int:
    return clean(sum(num(row.get(k)) for k in SOURCE_KEYS))


def totals(stats: list[dict]) -> dict[str, float | int]:
    return {row["code"]: stat_total(row) for row in stats}


def magic(c: dict) -> dict:
    return {"nucleo": 0, "talenti": 0, **(c.get("magia") or {})}


def magic_divisor(c: dict) -> int:
    m = magic(c)
    return max(10, 100 - 10 * (int(num(m["nucleo"])) + int(num(m["talenti"]))))


def equip(c: dict) -> dict:
    return {"difesa": 0, "difesaMagica": 0, "blocco": 0, **(c.get("equip") or {})}


def _f(v: float) -> str:
    """Formatta un numero come String(n) in JS."""
    v = clean(v)
    return str(v)


class T(dict):
    def __missing__(self, key):  # stat assenti valgono 0
        return 0


DERIVED: list[dict] = [
    {"key": "hp", "label": "Vita (HP) max", "fmt": "int", "src": "Regole",
     "calc": lambda t, c: 100 + t["VIT"] * 15, "formula": "100 + VIT×15"},
    {"key": "mp", "label": "Mana (MP) max", "fmt": "int", "src": "Regole",
     "calc": lambda t, c: 50 + t["INT"] * 10, "formula": "50 + INT×10"},
    {"key": "sp", "label": "Stamina (SP) max", "fmt": "int", "src": "Regole (confermata il 19/11/2026)",
     "calc": lambda t, c: 50 + (t["STR"] + t["DEX"]) * 5, "formula": "50 + (STR+DEX)×5"},
    {"key": "carico", "label": "Carico massimo", "fmt": "kg", "src": "Regole",
     "calc": lambda t, c: 50 + t["STR"] * 2, "formula": "50 + STR×2 kg"},
    # Con la Fortuna (LCK) l'Evasione è (DEX + LCK)/20, come nel foglio Excel di Dante
    {"key": "evasione", "label": "Evasione", "fmt": "pct", "src": "Regole + Excel (Fortuna)",
     "calc": lambda t, c: (t["DEX"] + t["LCK"]) / 20, "formula": "DEX / 20 %",
     "formula_for": lambda c: "(DEX + LCK) / 20 %" if _has(c, "LCK") else "DEX / 20 %",
     "explain": lambda t, c: (f"({_f(t['DEX'])} + {_f(t['LCK'])}) / 20" if _has(c, "LCK") else f"{_f(t['DEX'])} / 20")},
    {"key": "precisione", "label": "Precisione", "fmt": "pct", "src": "Regole",
     "calc": lambda t, c: 70 + t["DEX"] / 10, "formula": "70 + DEX/10 %"},
    {"key": "regen", "label": "Regen HP", "fmt": "permin", "src": "Regole",
     "calc": lambda t, c: t["VIT"] / 10, "formula": "VIT / 10 HP/min"},
    {"key": "bonusExp", "label": "Bonus EXP", "fmt": "pct", "src": "Regole",
     "calc": lambda t, c: t["INT"] / 20, "formula": "INT / 20 %"},
    {"key": "moltFis", "label": "Molt. danno fisico", "fmt": "mult", "src": "Regole",
     "calc": lambda t, c: 1 + t["STR"] / 100, "formula": "1 + STR/100"},
    {"key": "moltMag", "label": "Molt. danno magico", "fmt": "mult", "src": "Regole (decisa il 19/11/2026)",
     "calc": lambda t, c: 1 + t["INT"] / magic_divisor(c),
     "formula": "1 + INT / divisore",
     "formula_for": lambda c: f"1 + INT/{magic_divisor(c)}",
     "explain": lambda t, c: f"1 + {_f(t['INT'])}/{magic_divisor(c)}",
     "note": lambda c: (f"Divisore base 100, −10 per ogni grado di nucleo e talento magico "
                        f"(nucleo {magic(c)['nucleo']}, talenti {magic(c)['talenti']}).")},
    {"key": "difesa", "label": "Difesa", "fmt": "int1", "src": "Regole (decisa il 19/11/2026)",
     "calc": lambda t, c: t["VIT"] / 10 + num(equip(c)["difesa"]) * (1 + t["VIT"] / 100),
     "formula": "VIT/10 + Difesa equip × (1 + VIT/100)",
     "explain": lambda t, c: f"{_f(t['VIT'])}/10 + {_f(num(equip(c)['difesa']))} × (1 + {_f(t['VIT'])}/100)",
     "note": lambda c: "Si sottrae al danno fisico subito (minimo 1)."},
    {"key": "difesaMag", "label": "Difesa magica", "fmt": "int1", "src": "Regole (decisa il 19/11/2026)",
     "calc": lambda t, c: t["INT"] / 10 + num(equip(c)["difesaMagica"]) * (1 + t["INT"] / 100),
     "formula": "INT/10 + Difesa magica equip × (1 + INT/100)",
     "explain": lambda t, c: f"{_f(t['INT'])}/10 + {_f(num(equip(c)['difesaMagica']))} × (1 + {_f(t['INT'])}/100)",
     "note": lambda c: "Riduce gli effetti magici ostili; il danno magico diretto ignora la Difesa fisica."},
    {"key": "iniziativa", "label": "Iniziativa", "fmt": "dec", "src": "Regole (decisa il 19/11/2026)",
     "calc": lambda t, c: 10 + t["DEX"] / 10, "formula": "10 + DEX/10",
     "note": lambda c: "Ordine di turno decrescente; a parità agisce chi ha più DEX."},
    {"key": "critico", "label": "Prob. critico", "fmt": "pct", "src": "Regole (decisa il 19/11/2026)", "cap": 75,
     "calc": lambda t, c: 5 + t["DEX"] / 40, "formula": "5 + DEX/40 % (max 75%)",
     "note": lambda c: "Il critico raddoppia il danno. I bonus degli oggetti si sommano, sempre entro il 75%."},
    {"key": "blocco", "label": "Prob. blocco", "fmt": "pct", "src": "Regole (decisa il 19/11/2026)", "cap": 75,
     "calc": lambda t, c: (num(equip(c)["blocco"]) + t["STR"] / 40) if num(equip(c)["blocco"]) > 0 else 0,
     "formula": "Blocco scudo + STR/40 % (solo con scudo, max 75%)",
     "explain": lambda t, c: (f"{_f(num(equip(c)['blocco']))} + {_f(t['STR'])}/40" if num(equip(c)["blocco"]) > 0
                              else "nessuno scudo equipaggiato → 0"),
     "note": lambda c: "Un blocco riuscito annulla il colpo."},
    {"key": "attacchi", "label": "Attacchi per turno", "fmt": "dec", "src": "Excel",
     "calc": lambda t, c: 1 + t["DEX"] * 0.005, "formula": "1 + DEX×0.005"},
    {"key": "velocita", "label": "Velocità movimento", "fmt": "pct", "src": "Excel",
     "calc": lambda t, c: 100 + t["DEX"] / 5, "formula": "100 + DEX/5 %"},
    {"key": "resVeleni", "label": "Res. veleni", "fmt": "pct", "src": "Excel",
     "calc": lambda t, c: t["VIT"] / 5, "formula": "VIT / 5 %"},
    {"key": "resElementi", "label": "Res. elementi", "fmt": "pct", "src": "Excel",
     "calc": lambda t, c: t["VIT"] / 10, "formula": "VIT / 10 %"},
    # Derivate delle statistiche avanzate: compaiono solo se il PG ha quella statistica (formule dei fogli Excel)
    {"key": "bonusFortuna", "label": "Bonus Fortuna sui tiri", "fmt": "dec", "src": "Excel (Dante)", "only_if": "LCK",
     "calc": lambda t, c: t["LCK"] / 100, "formula": "LCK / 100",
     "explain": lambda t, c: f"{_f(t['LCK'])} / 100",
     "note": lambda c: "Nel foglio di Dante la cella calcola LCK/100, ma la descrizione dice LCK/10: da confermare."},
    {"key": "kiCombat", "label": "Regen KI in combattimento", "fmt": "dec", "src": "Excel (Corax)", "only_if": "KI",
     "calc": lambda t, c: t["VIT"] / 30, "formula": "VIT / 30 a turno"},
    {"key": "kiFuori", "label": "Regen KI fuori combattimento", "fmt": "permin", "src": "Excel (Corax)", "only_if": "KI",
     "calc": lambda t, c: t["VIT"] / 15, "formula": "VIT / 15 al minuto"},
    {"key": "kiMeditazione", "label": "Regen KI in meditazione", "fmt": "permin", "src": "Excel (Corax)", "only_if": "KI",
     "calc": lambda t, c: t["VIT"] / 5, "formula": "VIT / 5 al minuto"},
]
DERIVED_KEYS = [d["key"] for d in DERIVED]


def _has(c: dict, code: str) -> bool:
    return any(r.get("code") == code for r in (c.get("stats") or []))


def derived_for(c: dict) -> list[dict]:
    """Derivate che valgono per questo PG: quelle con only_if solo se ha la statistica avanzata."""
    return [d for d in DERIVED if not d.get("only_if") or _has(c, d["only_if"])]


def _cap(d: dict, v: float) -> float:
    return min(d["cap"], v) if d.get("cap") is not None else v


def derived_values(c: dict) -> dict[str, float]:
    """Valore base di ogni derivata (senza bonus oggetti, con tetto). c = {stats, equip?, magia?}."""
    t = T(totals(c.get("stats") or []))
    return {d["key"]: clean(_cap(d, d["calc"](t, c))) for d in derived_for(c)}


def formula_text(d: dict, c: dict) -> str:
    return d["formula_for"](c) if "formula_for" in d else d["formula"]


def explain(d: dict, c: dict) -> str:
    t = T(totals(c.get("stats") or []))
    if "explain" in d:
        return d["explain"](t, c)
    s = re.sub(r" \(.*\)$", "", d["formula"])
    s = re.sub(r" %$", "", s)
    return re.sub(r"\b(STR|DEX|VIT|INT|LCK|KI)\b", lambda m: _f(t[m.group(1)]) if m.group(1) in t else m.group(1), s)


def derived(c: dict) -> list[dict]:
    """Lista Derived completa per la risposta API."""
    t = T(totals(c.get("stats") or []))
    ib = c.get("item_bonus") or {}
    out = []
    for d in derived_for(c):
        base = _cap(d, d["calc"](t, c))
        bonus = num(ib.get(d["key"]))
        out.append({
            "key": d["key"], "label": d["label"], "fmt": d["fmt"],
            "base": clean(base), "bonus": clean(bonus), "value": clean(_cap(d, base + bonus)),
            "formula": formula_text(d, c), "explain": explain(d, c),
            "src": d["src"], "note": d["note"](c) if "note" in d else None,
            "cap": d.get("cap"), "disputed": False,
        })
    return out


def penalty_band(value: float) -> dict | None:
    if value >= 10:
        return None
    if value >= 7:
        return {"band": "7–9", "text": "Penalità lieve"}
    if value >= 4:
        return {"band": "4–6", "text": "Penalità marcata"}
    return {"band": "1–3", "text": "Penalità grave"}


def free_points_total(level: int) -> int:
    return (level - 1) * LEVEL["free_per_level"]


def free_points(level: int, stats: list[dict]) -> dict:
    total = free_points_total(level)
    used = int(sum(num(r.get("investiti")) for r in stats))
    # Dopo una morte il livello scende ma i punti investiti restano: il residuo non va sotto zero.
    return {"total": total, "used": used, "left": max(0, total - used)}


def next_talent_level(level: int) -> int:
    e = LEVEL["talent_every"]
    return (level // e + 1) * e


def death_penalty(level: int, exp_pct: float, hubris: bool) -> dict:
    if level <= 2:
        return {"level": level, "exp_pct": exp_pct, "protected": True, "lost": 0}
    lost = 3 if hubris else 1.5
    pos = max(1, level + exp_pct / 100 - lost)
    new_level = math.floor(pos)
    new_exp = js_round((pos - new_level) * 100)
    return {"level": new_level, "exp_pct": new_exp, "lost": lost, "protected": False,
            "malus": "−10% a tutte le statistiche per 1 ora", "bonus": "+50% EXP per 30 minuti"}


def power_rank(level: int) -> str:
    for r in reversed(POWER_RANKS):
        if level >= r["min"]:
            return r["name"]
    return POWER_RANKS[0]["name"]


def rarity_key(r: str | None) -> str:
    return re.sub(r"\s+", "", str(r or "").lower()).strip()


# ---------- Equipaggiamento stile MMORPG (porting di mockup/rules.js, regole decise il 20/11/2026) ----------
# Oggetto (elemento di Character.inventory, JSON):
#   {id, name, rarity, type, category, equip_type|null, slot|null, stats: {CODE: n}, bonus: {chiave: n},
#    req: {level?, CODE?}, durability: {cur, max}|null, weapon_base|null, weight, qty, desc|null, stats_text}
#   equip_type = tipo di equipaggiamento (decide gli slot ammessi, vedi EQUIP_TYPES);
#   slot = slot in cui è indossato (null = nella borsa). Un'arma a due mani sta in manoPrincipale e blocca
#   manoSecondaria. stats → colonna "Oggetti" delle statistiche; bonus → derivate.
SLOTS = [
    {"key": "testa", "label": "Testa", "side": "left"},
    {"key": "collo", "label": "Collo", "side": "left"},
    {"key": "spalle", "label": "Spalle", "side": "left"},
    {"key": "mantello", "label": "Mantello", "side": "left"},
    {"key": "torso", "label": "Torso", "side": "left"},
    {"key": "polsi", "label": "Polsi", "side": "left"},
    {"key": "mani", "label": "Mani", "side": "right"},
    {"key": "cintura", "label": "Cintura", "side": "right"},
    {"key": "gambe", "label": "Gambe", "side": "right"},
    {"key": "piedi", "label": "Piedi", "side": "right"},
    {"key": "anello1", "label": "Anello", "side": "right"},
    {"key": "anello2", "label": "Anello", "side": "right"},
    {"key": "ninnolo1", "label": "Ninnolo", "side": "bottom"},
    {"key": "ninnolo2", "label": "Ninnolo", "side": "bottom"},
    {"key": "manoPrincipale", "label": "Mano principale", "side": "bottom"},
    {"key": "manoSecondaria", "label": "Mano secondaria", "side": "bottom"},
]
SLOT_KEYS = [s["key"] for s in SLOTS]
SLOT_LABELS = {s["key"]: s["label"] for s in SLOTS}
MAIN_HAND, OFF_HAND = "manoPrincipale", "manoSecondaria"

# Tipo di equipaggiamento → slot ammessi (modellato su InventoryType di WoW). Doppia impugnatura libera per tutti:
# "unaMano" va in principale o secondaria (il danno della secondaria lo deciderà un talento).
EQUIP_TYPES = {
    "elmo": {"label": "Elmo", "slots": ["testa"]},
    "amuleto": {"label": "Amuleto", "slots": ["collo"]},
    "spallacci": {"label": "Spallacci", "slots": ["spalle"]},
    "mantello": {"label": "Mantello", "slots": ["mantello"]},
    "corazza": {"label": "Corazza / Veste", "slots": ["torso"]},
    "bracciali": {"label": "Bracciali", "slots": ["polsi"]},
    "guanti": {"label": "Guanti", "slots": ["mani"]},
    "cintura": {"label": "Cintura", "slots": ["cintura"]},
    "gambali": {"label": "Gambali", "slots": ["gambe"]},
    "stivali": {"label": "Stivali", "slots": ["piedi"]},
    "anello": {"label": "Anello", "slots": ["anello1", "anello2"]},
    "ninnolo": {"label": "Ninnolo", "slots": ["ninnolo1", "ninnolo2"]},
    "unaMano": {"label": "Una mano", "slots": [MAIN_HAND, OFF_HAND]},
    "manoPrincipale": {"label": "Mano principale", "slots": [MAIN_HAND]},
    "dueMani": {"label": "Due mani", "slots": [MAIN_HAND], "two_handed": True},
    "scudo": {"label": "Scudo", "slots": [OFF_HAND]},
    "tenuto": {"label": "Tenuto in mano secondaria", "slots": [OFF_HAND]},
}
# Bonus degli oggetti che entrano nella formula come "equipaggiamento" (Difesa equip × (1 + VIT/100), ecc.).
# Tutti gli altri bonus alle derivate (evasione, critico, velocità, …) si sommano DOPO la formula.
EQUIP_FORMULA_KEYS = ["difesa", "difesaMagica", "blocco"]

CATEGORIES = [
    {"key": "equipaggiamento", "label": "Equipaggiamento"},
    {"key": "consumabili", "label": "Consumabili"},
    {"key": "materiali", "label": "Materiali"},
    {"key": "altro", "label": "Altro"},
]
CATEGORY_KEYS = [c["key"] for c in CATEGORIES]
CONSUMABLE_TYPES = ["Cibo", "Pozione", "Consumabile", "Bevanda", "Pergamena"]
COMPUTED_ITEM_KEYS = {"unmet"}  # campi calcolati in uscita, mai salvati


class EquipError(ValueError):
    """Operazione di equipaggiamento non valida (→ 422 con messaggio)."""


def equip_type(item: dict | None) -> dict | None:
    return EQUIP_TYPES.get((item or {}).get("equip_type") or "")


def is_two_handed(item: dict | None) -> bool:
    return bool((equip_type(item) or {}).get("two_handed"))


def slot_accepts(slot: str, item: dict | None) -> bool:
    t = equip_type(item)
    return bool(t) and slot in t["slots"]


def item_category(item: dict) -> str:
    if item.get("category") in CATEGORY_KEYS:
        return item["category"]
    if equip_type(item):
        return "equipaggiamento"
    if item.get("type") in CONSUMABLE_TYPES:
        return "consumabili"
    if item.get("type") == "Materiale":
        return "materiali"
    return "altro"


def _num_dict(d: Any) -> dict:
    if not isinstance(d, dict):
        return {}
    return {str(k): clean(num(v)) for k, v in d.items() if num(v)}


def normalize_item(raw: dict) -> dict:
    """Oggetto con tutti i campi (compatibile con i vecchi oggetti dove `stats` era un testo)."""
    it = {k: v for k, v in dict(raw or {}).items() if k not in COMPUTED_ITEM_KEYS}
    if isinstance(it.get("stats"), str):  # formato precedente: stats = descrizione breve
        it.setdefault("stats_text", it["stats"])
        it["stats"] = {}
    et = it.get("equip_type") if it.get("equip_type") in EQUIP_TYPES else None
    dur = it.get("durability")
    out = {
        "id": str(it.get("id") or ""),
        "name": str(it.get("name") or "Oggetto"),
        "rarity": str(it.get("rarity") or "Comune"),
        "type": str(it.get("type") or ""),
        "equip_type": et,
        "slot": it.get("slot") if et and it.get("slot") in SLOT_KEYS else None,
        "stats": _num_dict(it.get("stats")),
        "bonus": _num_dict(it.get("bonus")),
        "req": _num_dict(it.get("req")),
        "durability": ({"cur": clean(num(dur.get("cur"))), "max": clean(num(dur.get("max")))}
                       if isinstance(dur, dict) and num(dur.get("max")) > 0 else None),
        "weapon_base": clean(num(it["weapon_base"])) if num(it.get("weapon_base")) else None,
        "weight": clean(num(it.get("weight"))),
        "qty": int(num(it["qty"])) if it.get("qty") is not None else 1,
        "desc": it.get("desc") or None,
        "stats_text": str(it.get("stats_text") or ""),
    }
    out["category"] = item_category({**out, "category": it.get("category")})
    return out


def normalize_inventory(inv: list | None) -> list[dict]:
    return [normalize_item(x) for x in (inv or []) if isinstance(x, dict)]


def new_item_id() -> str:
    return f"it-{uuid.uuid4().hex[:10]}"


def ensure_item_ids(inv: list[dict]) -> bool:
    """Assegna un id agli oggetti che non ce l'hanno (o con id duplicato). True se ha cambiato qualcosa."""
    seen: set[str] = set()
    changed = False
    for it in inv:
        if not it.get("id") or it["id"] in seen:
            it["id"] = new_item_id()
            changed = True
        seen.add(it["id"])
    return changed


def equipped_map(inv: list[dict]) -> dict[str, str]:
    """{slot: id oggetto}; un'arma a due mani compare sia in manoPrincipale sia in manoSecondaria."""
    m: dict[str, str] = {}
    for it in inv:
        if it.get("slot") and slot_accepts(it["slot"], it):
            m[it["slot"]] = it["id"]
            if is_two_handed(it):
                m[OFF_HAND] = it["id"]
    return m


def equipped_items(inv: list[dict]) -> list[dict]:
    return [it for it in inv if it.get("slot") and slot_accepts(it["slot"], it)]


def equipment_sums(inv: list[dict]) -> dict:
    stats: dict[str, float] = {}
    formula = {k: 0.0 for k in EQUIP_FORMULA_KEYS}
    bonus: dict[str, float] = {}
    for it in equipped_items(inv):
        for k, v in (it.get("stats") or {}).items():
            stats[k] = stats.get(k, 0) + num(v)
        for k, v in (it.get("bonus") or {}).items():
            if k in EQUIP_FORMULA_KEYS:
                formula[k] += num(v)
            else:
                bonus[k] = bonus.get(k, 0) + num(v)
    return {"stats": {k: clean(v) for k, v in stats.items()}, "equip": {k: clean(v) for k, v in formula.items()},
            "bonus": {k: clean(v) for k, v in bonus.items()}}


def apply_equipment(c: dict) -> dict:
    """Da chiamare sui dati salvati (non su un risultato di apply_equipment: i bonus si sommerebbero due volte).
    Nuovo dict con: colonna `oggetti` di ogni statistica (sempre ricalcolata, mai inserita a mano),
    `equip` = valori manuali del Master + Difesa/Difesa magica/Blocco degli oggetti (entrano nella formula),
    `item_bonus` = valori manuali + altri bonus degli oggetti (sommati dopo la formula)."""
    inv = normalize_inventory(c.get("inventory"))
    sums = equipment_sums(inv)
    stats = [{**row, "oggetti": sums["stats"].get(row.get("code"), 0)} for row in (c.get("stats") or [])]
    eq = equip(c)
    eq = {**eq, **{k: clean(num(eq.get(k)) + num(sums["equip"].get(k))) for k in EQUIP_FORMULA_KEYS}}
    ib = {k: num(v) for k, v in (c.get("item_bonus") or {}).items()}
    for k, v in sums["bonus"].items():
        ib[k] = ib.get(k, 0) + v
    return {**c, "inventory": inv, "stats": stats, "equip": eq, "item_bonus": {k: clean(v) for k, v in ib.items()}}


def requirement_label(key: str, value: Any) -> str:
    return f"Livello {_f(num(value))}" if key == "level" else f"{key} {_f(num(value))}"


def unmet_requirements(c: dict, item: dict, tot: dict | None = None) -> list[str]:
    """Requisiti non soddisfatti, es. ["Livello 80", "STR 200"]. `c` già passato da apply_equipment."""
    t = tot if tot is not None else totals(c.get("stats") or [])
    out = []
    for k, v in (item.get("req") or {}).items():
        have = num(c.get("level")) if k == "level" else num(t.get(k, 0))
        if have < num(v):
            out.append(requirement_label(k, v))
    return out


def _by_id(inv: list[dict], item_id: str) -> dict:
    it = next((x for x in inv if x.get("id") == item_id), None)
    if it is None:
        raise EquipError("Oggetto non trovato nell'inventario.")
    return it


def _occupant(inv: list[dict], slot: str) -> dict | None:
    item_id = equipped_map(inv).get(slot)
    return next((x for x in inv if x["id"] == item_id), None) if item_id else None


def _clear(inv: list[dict], slot: str, removed: list[dict]) -> None:
    it = _occupant(inv, slot)
    if it is not None:
        it["slot"] = None
        removed.append(it)


def _check_slot(slot: str | None) -> None:
    if slot is not None and slot not in SLOT_KEYS:
        raise EquipError(f"Slot inesistente: {slot}.")


def _wrong_slot(it: dict, slot: str) -> EquipError:
    t = equip_type(it) or {"label": "?", "slots": []}
    allowed = ", ".join(SLOT_LABELS[s] for s in t["slots"])
    return EquipError(f"{it['name']} ({t['label']}) non va nello slot {SLOT_LABELS[slot]}. Slot ammessi: {allowed}.")


def equip_item(c: dict, item_id: str, slot: str | None = None) -> dict:
    """Indossa un oggetto della borsa. Ritorna {inventory, slot, removed: [nomi tornati nella borsa]}.
    Solleva EquipError se l'oggetto non è equipaggiabile, lo slot non è ammesso o i requisiti mancano."""
    _check_slot(slot)
    ce = apply_equipment(c)
    inv = copy.deepcopy(ce["inventory"])
    it = _by_id(inv, item_id)
    t = equip_type(it)
    if t is None:
        raise EquipError(f"{it['name']}: oggetto non equipaggiabile.")
    if it["qty"] != 1:
        raise EquipError(f"{it['name']}: si può equipaggiare solo un oggetto singolo (quantità 1).")
    if slot is not None and slot not in t["slots"]:
        raise _wrong_slot(it, slot)
    if it["slot"]:
        if slot is None or slot == it["slot"]:
            return {"inventory": inv, "slot": it["slot"], "removed": [], "swapped": None}
        return move_item(c, it["slot"], slot)
    unmet = unmet_requirements(ce, it)
    if unmet:
        raise EquipError(f"Impossibile equipaggiare {it['name']}: requisiti non soddisfatti ({', '.join(unmet)}).")
    eqm = equipped_map(inv)
    removed: list[dict] = []
    if t.get("two_handed"):
        target = MAIN_HAND
        _clear(inv, MAIN_HAND, removed)
        _clear(inv, OFF_HAND, removed)
    else:
        target = slot or next((s for s in t["slots"] if s not in eqm), t["slots"][0])
        if target in (MAIN_HAND, OFF_HAND):
            main = _occupant(inv, MAIN_HAND)
            if main is not None and is_two_handed(main):
                _clear(inv, MAIN_HAND, removed)
        _clear(inv, target, removed)
    it["slot"] = target
    return {"inventory": inv, "slot": target, "removed": [x["name"] for x in removed if x is not it], "swapped": None}


def unequip_slot(c: dict, slot: str) -> dict:
    """Rimette nella borsa l'oggetto nello slot (la mano secondaria bloccata toglie l'arma a due mani)."""
    _check_slot(slot)
    inv = normalize_inventory(c.get("inventory"))
    it = _occupant(inv, slot)
    if it is None:
        raise EquipError(f"Lo slot {SLOT_LABELS[slot]} è vuoto.")
    it["slot"] = None
    return {"inventory": inv, "slot": slot, "removed": [it["name"]], "swapped": None}


def move_item(c: dict, from_slot: str, to_slot: str) -> dict:
    """Sposta un oggetto indossato in un altro slot compatibile; l'eventuale occupante fa il percorso inverso
    se può, altrimenti torna nella borsa."""
    _check_slot(from_slot)
    _check_slot(to_slot)
    inv = normalize_inventory(c.get("inventory"))
    it = _occupant(inv, from_slot)
    if it is None:
        raise EquipError(f"Lo slot {SLOT_LABELS[from_slot]} è vuoto.")
    if from_slot == to_slot:
        raise EquipError("Lo slot di partenza e quello di arrivo coincidono.")
    if is_two_handed(it):
        raise EquipError(f"{it['name']} è un'arma a due mani: occupa entrambe le mani e non si sposta.")
    if not slot_accepts(to_slot, it):
        raise _wrong_slot(it, to_slot)
    other = _occupant(inv, to_slot)
    removed: list[str] = []
    swapped = None
    if other is not None and not is_two_handed(other) and slot_accepts(from_slot, other):
        other["slot"] = from_slot
        swapped = other["name"]
    elif other is not None:
        other["slot"] = None
        removed.append(other["name"])
    it["slot"] = to_slot
    return {"inventory": inv, "slot": to_slot, "removed": removed, "swapped": swapped}


def validate_equipment(inv: list[dict]) -> str | None:
    """Coerenza degli slot di un inventario (per le modifiche manuali del Master). None se va bene."""
    used: dict[str, str] = {}
    for it in inv:
        s = it.get("slot")
        if not s:
            continue
        t = equip_type(it)
        if t is None:
            return f"{it['name']}: oggetto non equipaggiabile ma con slot {s}."
        if s not in t["slots"]:
            return f"{it['name']} ({t['label']}) non può stare nello slot {SLOT_LABELS.get(s, s)}."
        if it["qty"] != 1:
            return f"{it['name']}: si può equipaggiare solo un oggetto singolo (quantità 1)."
        for k in ([s, OFF_HAND] if t.get("two_handed") else [s]):
            if k in used:
                return f"Slot {SLOT_LABELS[k]} occupato due volte ({used[k]} e {it['name']})."
            used[k] = it["name"]
    return None


def final_values(c: dict) -> dict:
    """{stats: totali, derived: valori finali} di un PG già passato da apply_equipment."""
    return {"stats": totals(c.get("stats") or []), "derived": {d["key"]: d["value"] for d in derived(c)}}


def _diff(before: dict, after: dict) -> dict:
    out = {}
    for k in dict.fromkeys([*before, *after]):
        dv = num(after.get(k)) - num(before.get(k))
        if abs(dv) > 1e-9:
            out[k] = clean(dv)
    return out


def item_previews(c: dict) -> dict[str, dict]:
    """Per ogni oggetto equipaggiabile nella borsa: esito dell'equipaggiamento e differenze su statistiche e
    derivate (il "Confronto" del tooltip). {id: {ok, error, unmet, slot, replaces, stats, derived}}"""
    ce = apply_equipment(c)
    before = final_values(ce)
    out: dict[str, dict] = {}
    for it in ce["inventory"]:
        if it["slot"] or not equip_type(it):
            continue
        try:
            res = equip_item(c, it["id"])
        except EquipError as e:
            out[it["id"]] = {"ok": False, "error": str(e), "unmet": unmet_requirements(ce, it),
                             "slot": None, "replaces": [], "stats": {}, "derived": {}}
            continue
        # Si riparte da `c` (valori manuali), non da `ce`, per non contare due volte i bonus degli oggetti
        after = final_values(apply_equipment({**c, "inventory": res["inventory"]}))
        out[it["id"]] = {"ok": True, "error": None, "unmet": [], "slot": res["slot"], "replaces": res["removed"],
                         "stats": _diff(before["stats"], after["stats"]),
                         "derived": _diff(before["derived"], after["derived"])}
    return out


def starting_equipment(c: dict) -> list[dict]:
    """Equipaggiamento iniziale: indossa ciò che ha i requisiti soddisfatti, il resto resta in borsa."""
    inv = normalize_inventory(c.get("inventory"))
    for item_id in [it["id"] for it in inv]:
        it = _by_id(inv, item_id)
        t = equip_type(it)
        if t is None or it["slot"]:
            continue
        eqm = equipped_map(inv)
        free = next((s for s in t["slots"] if s not in eqm), None)
        if free is None or (t.get("two_handed") and OFF_HAND in eqm):
            continue
        try:
            inv = equip_item({**c, "inventory": inv}, item_id, free)["inventory"]
        except EquipError:
            continue
    return inv


def rules_config() -> dict:
    return {
        "creation": dict(CREATION),
        "level": dict(LEVEL),
        "regen": dict(REGEN),
        "sources": [dict(s) for s in SOURCES],
        "grades": list(GRADES),
        "rarities": [{"name": r["name"], "key": rarity_key(r["name"]), "grade": r["grade"],
                      "weapon_base": list(r["weapon_base"]), "creature_mult": r["creature_mult"]} for r in RARITY_SCALE],
        "classes": [{k: v for k, v in c.items()} for c in CLASSES],
        "kingdoms": [dict(k) for k in KINGDOMS],
        "positions": list(POSITIONS),
        "power_ranks": [dict(p) for p in POWER_RANKS],
        "slots": [dict(s) for s in SLOTS],
        "equip_types": [{"key": k, "label": v["label"], "slots": list(v["slots"]),
                         "two_handed": bool(v.get("two_handed"))} for k, v in EQUIP_TYPES.items()],
        "equip_formula_keys": list(EQUIP_FORMULA_KEYS),
        "item_categories": [dict(x) for x in CATEGORIES],
    }


# ---------- Modifica della scheda da parte del Master ----------

# Colonne di origine che il Master scrive a mano. "oggetti" (se presente) è calcolata dagli oggetti equipaggiati.
COMPUTED_SOURCES = {"oggetti"}
EDITABLE_SOURCES = [k for k in SOURCE_KEYS if k not in COMPUTED_SOURCES]
GRADE_MAX = len(GRADES)


def _grade_errors(where: str, lvl: Any, pct: Any) -> list[str]:
    out = []
    if not (1 <= int(num(lvl)) <= GRADE_MAX) or num(lvl) != int(num(lvl)):
        out.append(f"{where}: il Grado va da 1 a {GRADE_MAX} (ora {lvl}).")
    if pct != "MAX" and not (0 <= num(pct) <= 100):
        out.append(f"{where}: la % va da 0 a 100 oppure MAX (ora {pct}).")
    return out


def _rarity_errors(where: str, rarity: Any, required: bool = True) -> list[str]:
    if not rarity and not required:
        return []
    if rarity not in RARITIES:
        return [f"{where}: rarità «{rarity or '—'}» fuori scala ({', '.join(RARITIES)})."]
    return []


def sheet_errors(sheet: dict) -> list[str]:
    """Controlla le regole sui dati di scheda modificati dal Master. sheet contiene solo le sezioni presenti
    nella modifica, più "stats" (sempre, per i codici). Restituisce i messaggi d'errore in italiano."""
    errs: list[str] = []
    stats = sheet.get("stats") or []
    codes = [r.get("code") for r in stats]
    if "stats" in sheet.get("_changed", ()):
        dup = sorted({c for c in codes if codes.count(c) > 1})
        if dup:
            errs.append(f"Statistiche duplicate: {', '.join(dup)}.")
        for code in BASE_STATS:
            row = next((r for r in stats if r.get("code") == code), None)
            if row is None:
                errs.append(f"La statistica base {code} non si può rimuovere.")
            elif row.get("kind") != "base":
                errs.append(f"{code} è una statistica base.")
        for r in stats:
            if r.get("code") not in BASE_STATS and r.get("kind") == "base":
                errs.append(f"{r.get('code')}: solo {', '.join(BASE_STATS)} sono statistiche base.")
            if stat_total(r) < 0:
                errs.append(f"{r.get('code')}: il totale non può essere negativo.")
    known = set(codes)
    for t in sheet.get("titles") or []:
        w = f"Titolo «{t.get('name')}»"
        errs += _rarity_errors(w, t.get("rarity"))
        unknown = sorted(k for k in (t.get("bonus") or {}) if k not in known)
        if unknown:
            errs.append(f"{w}: bonus a statistiche inesistenti ({', '.join(unknown)}).")
    for sk in sheet.get("skills") or []:
        errs += _grade_errors(f"Skill «{sk.get('name')}»", sk.get("lvl"), sk.get("pct"))
    for sk in sheet.get("active_skills") or []:
        errs += _grade_errors(f"Skill attiva «{sk.get('name')}»", sk.get("lvl"), sk.get("pct"))
    for t in sheet.get("talents") or []:
        errs += _rarity_errors(f"Talento «{t.get('name')}»", t.get("rarity"))
    for it in sheet.get("inventory") or []:
        w = f"Oggetto «{it.get('name')}»"
        errs += _rarity_errors(w, it.get("rarity"))
        if isinstance(it.get("stats"), dict):
            unknown = sorted(k for k in it["stats"] if k not in known)
            if unknown:
                errs.append(f"{w}: bonus a statistiche inesistenti ({', '.join(unknown)}).")
    for p in sheet.get("pets") or []:
        for sk in p.get("skills") or []:
            errs += _grade_errors(f"Pet «{p.get('name')}», skill «{sk.get('name')}»", sk.get("lvl"), sk.get("pct"))
    for q in sheet.get("quests") or []:
        errs += _rarity_errors(f"Quest «{q.get('name')}»", q.get("rarity"), required=False)
    for r in sheet.get("reputation") or []:
        rng, val = num(r.get("range")), num(r.get("value"))
        if rng > 0 and abs(val) > rng:
            errs.append(f"Reputazione «{r.get('target')}»: il valore deve stare tra −{fmt_n(rng)} e +{fmt_n(rng)}.")
    return errs


def resource_errors(resources: dict, maxes: dict) -> list[str]:
    labels = {"hp": "HP", "mp": "MP", "sp": "SP"}
    return [f"{labels[k]} oltre il massimo ({fmt_n(resources[k])} su {fmt_n(maxes[k])})."
            for k in ("hp", "mp", "sp") if num(resources.get(k)) > num(maxes.get(k))]


# ---------- Combattimento (funzioni pure su dict) ----------

def fmt_n(x: float) -> str:
    """Intero con separatore delle migliaia all'italiana."""
    return f"{js_round(num(x)):,}".replace(",", ".")


def add_log(combat: dict, text: str, limit: int = 20) -> None:
    log = list(combat.get("log") or [])
    log.append(f"T{combat.get('turn', 1)} · {text}")
    combat["log"] = log[-limit:]


def apply_damage(resources: dict, combat: dict, amount: int) -> None:
    rest = amount
    effects = combat.get("effects") or []
    shield = next((e for e in effects if num(e.get("absorb")) > 0), None)
    if shield is not None:
        absorbed = min(num(shield["absorb"]), rest)
        shield["absorb"] = clean(num(shield["absorb"]) - absorbed)
        rest -= absorbed
        if shield["absorb"] <= 0:
            combat["effects"] = [e for e in effects if e is not shield]
            add_log(combat, f"{shield['name']} assorbe {fmt_n(absorbed)} danni e si dissolve.")
        else:
            shield["text"] = f"Assorbe {fmt_n(shield['absorb'])} danni"
            add_log(combat, f"{shield['name']} assorbe {fmt_n(absorbed)} danni.")
    if rest > 0:
        resources["hp"] = clean(max(0, num(resources["hp"]) - rest))
        add_log(combat, f"Subiti {fmt_n(rest)} danni. HP {fmt_n(resources['hp'])}.")
        if resources["hp"] == 0:
            add_log(combat, "HP a zero: il personaggio è a terra.")


def end_turn(resources: dict, combat: dict, maxes: dict) -> None:
    mp_gain = max(0, min(maxes["mp"] - num(resources["mp"]), js_round(maxes["mp"] * REGEN["mp_pct"] / 100)))
    sp_gain = max(0, min(maxes["sp"] - num(resources["sp"]), js_round(maxes["sp"] * REGEN["sp_pct"] / 100)))
    resources["mp"] = clean(min(maxes["mp"], num(resources["mp"]) + mp_gain))
    resources["sp"] = clean(min(maxes["sp"], num(resources["sp"]) + sp_gain))
    add_log(combat, f"Fine turno: MP +{fmt_n(mp_gain)}, SP +{fmt_n(sp_gain)}.")
    effects = combat.get("effects") or []
    for e in effects:
        h = num(e.get("hpPerTurn"))
        if h:
            resources["hp"] = clean(max(0, min(maxes["hp"], num(resources["hp"]) + h)))
            add_log(combat, f"{e['name']}: {'+' if h > 0 else '−'}{fmt_n(abs(h))} HP.")
        e["turns"] = int(num(e.get("turns"))) - 1
    expired = [e["name"] for e in effects if e["turns"] <= 0]
    combat["effects"] = [e for e in effects if e["turns"] > 0]
    if expired:
        add_log(combat, f"Effetti terminati: {', '.join(expired)}.")
    cds = combat.get("cooldowns") or []
    for cd in cds:
        cd["turns"] = int(num(cd.get("turns"))) - 1
    ready = [cd["name"] for cd in cds if cd["turns"] <= 0]
    combat["cooldowns"] = [cd for cd in cds if cd["turns"] > 0]
    if ready:
        add_log(combat, f"Di nuovo pronte: {', '.join(ready)}.")
    combat["turn"] = int(combat.get("turn", 1)) + 1
