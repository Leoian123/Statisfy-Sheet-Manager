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
    """Numero finito o 0: NaN, ±infinito e interi troppo grandi per un float non entrano nei calcoli
    (né nelle risposte JSON, dove farebbero fallire la serializzazione)."""
    try:
        n = float(v)
    except (TypeError, ValueError, OverflowError):
        return 0
    return n if math.isfinite(n) else 0


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
    {"key": "ki", "label": "KI max", "fmt": "int", "src": "Excel (Corax)", "only_if": "KI",
     "calc": lambda t, c: 100 + t["KI"] * 8, "formula": "100 + KI×8",
     "note": lambda c: "Risorsa come Vita e Mana: si spende in combattimento e rigenera a fine turno."},
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


# ---------- Forgia del Master (porting di mockup/screens/wizards-*.js, decisioni del 20/11/2026) ----------
# Regole e numeri dei wizard di creazione: skill, classi, razze, titoli, PNG, incontri, incantesimi, miracoli.
# Funzioni pure su dict; la logica dei wizard (validazione per passo, anteprima, salvataggio) è in forge.py.

FORGE_STATS = {"STR": "Forza", "DEX": "Destrezza", "VIT": "Vitalità", "INT": "Intelligenza",
               "FIN": "Finesse", "AUT": "Autorità"}

# Skill (Progressione, Sezioni 3–4). Deciso: ogni skill ha i suoi valori per Grado, scelti nel wizard (uno per Grado).
SKILL_TYPES = ["Combat", "Craft", "Utility", "Gathering", "Defense", "Knowledge", "Language", "Social", "Classe"]
SKILL_GRADES = 10
GRADE1_RULE = {
    "Combat": "Al primo uso vero in combattimento.",
    "Craft": "Dopo un lavoro completo fatto sotto la guida di un PNG che pratica il mestiere.",
    "Gathering": "Dopo un lavoro completo fatto sotto la guida di un PNG che pratica il mestiere.",
}
ACQUIRE = [
    {"v": "Level up", "l": "Level up (abilità di classe ogni 5 livelli)"},
    {"v": "Libro", "l": "Libro (tomi rari)"},
    {"v": "Quest training", "l": "Quest training con un PNG Maestro"},
    {"v": "Titolo", "l": "Inclusa in un titolo"},
    {"v": "Sviluppo organico", "l": "Sviluppo organico (rarissimo)"},
]


def linear_grades(v1: float) -> list[float]:
    """«Lineare dal I»: il valore del Grado I moltiplicato per il Grado."""
    return [clean(num(v1) * (i + 1)) for i in range(SKILL_GRADES)]


WEAPON_GRADE_ROWS = [{"what": "Precisione", "unit": "%", "vals": linear_grades(2)},
                     {"what": "Danno", "unit": "%", "vals": linear_grades(1)}]


def grade_text(rows: list[dict], g: int) -> str:
    """Testo di una skill al Grado g (1–10): «+4% Precisione, +2% Danno»."""
    out = []
    for r in rows or []:
        vals = r.get("vals") or []
        v = num(vals[g - 1]) if len(vals) >= g else 0
        what = str(r.get("what") or "").strip()
        if not what or v == 0:
            continue
        unit = "%" if r.get("unit", "%") == "%" else f" {r.get('unit')}"
        out.append(f"{'+' if v > 0 else ''}{fmt_n(v)}{unit} {what}")
    return ", ".join(out)


# Classi
CLASS_TYPES = [{"v": "base", "l": "Base", "sub": "scelta alla creazione"},
               {"v": "avanzata", "l": "Avanzata", "sub": "si sblocca giocando"},
               {"v": "produzione", "l": "Di produzione", "sub": "mestiere, si sblocca giocando"}]
CLASS_LABEL = {"base": "Classe base", "avanzata": "Classe avanzata", "produzione": "Classe di produzione"}
TALENT_LEVELS = [5, 10, 15, 20]

# Razze (Ambientazione, Razze e popolazioni). Deciso: statistiche e talenti razziali liberi, senza limiti fissi.
RACE_TEMPLATES = [
    {"name": "Elfi di Eldermoor", "origin": "Eldermoor", "desc": "Longevi, custodi della magia naturale, legati all'Albero Mondo; saggi ma distaccati dalle faccende dei mortali."},
    {"name": "Nani delle Montagne", "origin": "Montagne", "desc": "Artigiani della forgia dalla resistenza leggendaria, in clan patriarcali fondati sull'onore.", "rel": [{"race": "Umani", "rel": "Alleati"}]},
    {"name": "Dragonborn dei Vulcani", "origin": "Regioni vulcaniche", "desc": "Discendenti dei draghi, in tribù dove il potere magico fa la gerarchia; respirano l'elemento del loro lignaggio."},
    {"name": "Drow", "origin": "Profondità", "desc": "Elfi corrotti dall'oscurità, esiliati nelle caverne: una società crudele e raffinata."},
    {"name": "Svirfneblin", "origin": "Profondità", "desc": "Gnomi delle profondità, minatori che comunicano con vibrazioni nella roccia."},
    {"name": "Duergar", "origin": "Profondità", "desc": "Nani grigi con poteri psionici, forgiano metalli impossibili alla luce dei funghi."},
    {"name": "Halfling", "origin": "Eldermoor", "desc": ""},
    {"name": "Elementali minori", "origin": "Qadesh", "desc": ""},
]
RACE_ORIGINS_EXTRA = ["Montagne", "Regioni vulcaniche", "Profondità", "Altro"]
RELATIONS = ["Alleati", "Cordiali", "Neutrali", "Diffidenti", "Ostili"]
RACE_PREVIEW_KEYS = ["hp", "mp", "sp", "evasione", "precisione", "carico"]


def race_level1_stats(mods: dict) -> list[dict]:
    """PG di livello 1 della razza: statistiche base 10 e modificatori razziali nella colonna «Altro»."""
    codes = list(dict.fromkeys([*BASE_STATS, *mods.keys()]))
    return [{"code": k, "name": STAT_NAMES.get(k, k), "kind": "base" if k in BASE_STATS else "avanzata",
             "iniziale": CREATION["base"] if k in BASE_STATS else 0, "creazione": 0, "investiti": 0, "levelup": 0,
             "altro": num(mods.get(k)), "titoli": 0} for k in codes]


# Titoli (Sistema Status Sociale, Sezione 1). Deciso: l'evoluzione sostituisce il titolo precedente e ne toglie i bonus.
TITLE_ACQ = {"Comune": "Impegno normale", "Non Comune": "Dedizione specifica", "Raro": "Imprese notevoli",
             "Epico": "Gesta che cambiano il mondo", "Leggendario": "Solo 1–2 per server",
             "Mitico": "Trascende la mortalità", "Divino": "Intervento diretto di una divinità"}
TITLE_EX = {"Comune": "Primo Sangue: +2 STR, +1 VIT, +5% critici vs umanoidi", "Raro": "Ammazzadraghi: +10 STR/VIT, +5 tutte",
            "Epico": "Salvatore di Regni: +15 tutte", "Leggendario": "Primo tra i Mortali: +25 tutte, regen raddoppiata"}
TITLE_EFFECTS = ["nessuno", "passivo", "attivo"]


def expand_title_bonus(rows: list[dict]) -> dict:
    """Bonus di un titolo: "ALL" vale per le 4 statistiche base, codici ripetuti si sommano."""
    out: dict[str, float] = {}
    for r in rows or []:
        v = num(r.get("val"))
        code = str(r.get("code") or "")
        if not code or not v:
            continue
        for k in (BASE_STATS if code == "ALL" else [code]):
            out[k] = clean(out.get(k, 0) + v)
    return out


def add_title_bonus(stats: list[dict], bonus: dict, sign: int) -> list[str]:
    """Somma (sign=+1) o toglie (−1) i bonus alla colonna «Titoli»; ritorna i codici che il PG non ha."""
    missing = []
    for k, v in (bonus or {}).items():
        row = next((r for r in stats if r.get("code") == k), None)
        if row is None:
            missing.append(k)
            continue
        row["titoli"] = clean(num(row.get("titoli")) + sign * num(v))
    return missing


def assign_title(stats: list[dict], titles: list[dict], title: dict, replace: str | None) -> dict:
    """Aggiunge un titolo al PG (stats e titles modificati sul posto). Se `replace` è un titolo del PG
    (evoluzione), lo toglie con i suoi bonus. {missing, replaced}"""
    replaced = None
    if replace:
        i = next((j for j, t in enumerate(titles) if t.get("name") == replace), -1)
        if i >= 0:
            replaced = titles.pop(i)
            add_title_bonus(stats, replaced.get("bonus") or {}, -1)
    titles.append({"name": title["name"], "rarity": title["rarity"], "bonus": dict(title.get("bonus") or {})})
    missing = add_title_bonus(stats, title.get("bonus") or {}, +1)
    return {"missing": missing, "replaced": replaced["name"] if replaced else None}


# PNG (Sistema PNG)
TRUST_LEVELS = ["Scarso", "Neutrale", "Buono", "Eccellente"]
RACES_KNOWN = ["Umano", "Umana", "Elfo", "Nano", "Dragonborn", "Drow", "Svirfneblin", "Duergar", "Halfling", "Elementale minore"]

# Creature (Combat, "Creature" e "Taglia"): Danno = (10 + L×6) × rarità; Vita = (40 + L×20) × rarità × taglia
SIZES = [{"v": "Fragile", "m": 0.5}, {"v": "Normale", "m": 1}, {"v": "Robusta", "m": 1.5}]
ENVIRONMENTS = ["Foresta", "Montagna", "Grotta o dungeon", "Città", "Deserto", "Ghiacci", "Mare o costa", "Palude",
                "Sottosuolo", "Rovine", "Piano oscuro"]


def rarity_info(name: str | None) -> dict:
    return next((r for r in RARITY_SCALE if r["name"] == name), RARITY_SCALE[0])


def size_mult(size: str | None) -> float:
    return next((s["m"] for s in SIZES if s["v"] == size), 1)


def creature(level: Any, rarity: str | None, size: str | None = "Normale") -> dict:
    r = rarity_info(rarity)
    m = size_mult(size)
    lv = max(0, int(num(level)))
    return {"dmg": clean((10 + lv * 6) * r["creature_mult"]), "hp": clean((40 + lv * 20) * r["creature_mult"] * m),
            "dmg_formula": f"(10 + {lv}×6) × {r['creature_mult']}",
            "hp_formula": f"(40 + {lv}×20) × {r['creature_mult']} × {fmt_it(m)}"}


def fmt_it(x: float) -> str:
    """Numero all'italiana con al massimo 2 decimali (1,5)."""
    v = clean(round(num(x), 2))
    return str(v).replace(".", ",")


# Esperienza (Progressione, Sezione 2): pari livello 2%, ±1 punto per livello di differenza, 0–10%;
# dal livello 10 metà, dal 50 un quarto. Deciso: la rarità della creatura moltiplica l'EXP per grado³.
def exp_gain(pg_level: Any, c_level: Any) -> dict:
    base = max(0.0, min(10.0, 2 + (num(c_level) - num(pg_level))))
    pl = num(pg_level)
    factor = 0.25 if pl >= 50 else 0.5 if pl >= 10 else 1
    return {"base": clean(base), "factor": factor, "pct": clean(base * factor)}


def exp_for(pg_level: Any, creatures: list[dict]) -> dict:
    """EXP (in % del livello) che un PG di quel livello prende da un incontro intero."""
    tot = 0.0
    parts = []
    for c in creatures:
        n = max(0, int(num(c.get("count"))))
        if not n:
            continue
        g = exp_gain(pg_level, c.get("level"))
        rm = rarity_info(c.get("rarity"))["creature_mult"]
        tot += g["pct"] * rm * n
        parts.append(f"{n}× {str(c.get('name') or 'creatura').strip()}: {fmt_it(g['base'])}%"
                     + (f" × {fmt_it(g['factor'])}" if g["factor"] < 1 else "")
                     + (f" × {rm} ({c.get('rarity')})" if rm > 1 else ""))
    return {"pct": clean(round(tot, 6)), "parts": parts}


def gain_exp(level: int, exp_pct: Any, pct: Any) -> dict:
    """Aggiunge EXP (in %): ogni 100% è un livello. {level, exp_pct, ups}"""
    exp = num(exp_pct) + num(pct)
    ups = int(exp // 100) if exp >= 100 else 0
    exp -= ups * 100
    return {"level": level + ups, "exp_pct": clean(round(exp, 2)), "ups": ups}


EXP_MODES = ["intera", "divisa"]


def exp_share(full_by_pc: dict, mode: str) -> dict:
    """«Intera»: ogni PG prende la sua EXP; «divisa»: la sua EXP diviso il numero di PG che partecipano."""
    n = max(1, len(full_by_pc))
    return {k: clean(round(v / n if mode == "divisa" else v, 6)) for k, v in full_by_pc.items()}


# Difficoltà (deciso: la decide il Master; il wizard mostra una stima di riferimento, proposta):
# (ΣVita creature × ΣDanno creature) / (ΣVita gruppo × ΣDanno gruppo)
DIFFICULTY_BANDS = [(0.1, "Banale", "muted"), (0.3, "Facile", "good"), (0.7, "Equilibrato", "violet"),
                    (1.5, "Difficile", "warn"), (4, "Mortale", "bad"), (math.inf, "Impossibile", "bad")]
DIFFICULTY_LABELS = [b[1] for b in DIFFICULTY_BANDS]
# Proposta: rarità tipica dell'arma per livello (stima del danno dei PG senza arma registrata)
LEVEL_RARITY = [(24, "Comune"), (59, "Non Comune"), (119, "Raro"), (199, "Epico"), (299, "Unico"),
                (399, "Leggendario"), (499, "Mitico"), (math.inf, "Divino")]


def difficulty_tone(label: str) -> str:
    return next((b[2] for b in DIFFICULTY_BANDS if b[1] == label), "muted")


def rarity_for_level(level: Any) -> str:
    return next(r for mx, r in LEVEL_RARITY if num(level) <= mx)


def weapon_base_mid(rarity: str) -> float:
    a, b = rarity_info(rarity)["weapon_base"]
    return a if b is None else (a + b) / 2


def weapon_base_range(rarity: str) -> str:
    a, b = rarity_info(rarity)["weapon_base"]
    return f"{fmt_n(a)}+" if b is None else f"{fmt_n(a)}–{fmt_n(b)}"


def pg_power(ri: dict, level: int) -> dict:
    """Danno per turno di un PG (proposta) = Base arma × max(molt. fisico, molt. magico) × attacchi per turno.
    `ri` = dati del PG con l'equipaggiamento già applicato (serialize.rules_input)."""
    d = {x["key"]: x["value"] for x in derived(ri)}
    weapon = next((it for it in equipped_items(ri.get("inventory") or []) if num(it.get("weapon_base")) > 0), None)
    base = num(weapon["weapon_base"]) if weapon else weapon_base_mid(rarity_for_level(level))
    molt = max(num(d.get("moltFis")), num(d.get("moltMag")))
    att = num(d.get("attacchi")) or 1
    return {"hp": num(d.get("hp")), "dmg": base * molt * att, "base": base, "molt": molt, "att": att,
            "weapon": weapon["name"] if weapon else f"stima {rarity_for_level(level)}"}


def difficulty(creatures: list[dict], powers: list[dict]) -> dict:
    c_hp = c_dmg = p_hp = p_dmg = 0.0
    for c in creatures:
        n = max(0, int(num(c.get("count"))))
        k = creature(c.get("level"), c.get("rarity"), c.get("size"))
        c_hp += k["hp"] * n
        c_dmg += k["dmg"] * n
    for p in powers:
        p_hp += p["hp"]
        p_dmg += p["dmg"]
    ratio = (c_hp * c_dmg) / (p_hp * p_dmg) if p_hp * p_dmg > 0 else math.inf
    band = next(b for b in DIFFICULTY_BANDS if ratio < b[0]) if ratio != math.inf else DIFFICULTY_BANDS[-1]
    return {"c_hp": clean(c_hp), "c_dmg": clean(c_dmg), "p_hp": clean(p_hp), "p_dmg": clean(round(p_dmg, 4)),
            "ratio": None if ratio == math.inf else clean(round(ratio, 4)), "label": band[1], "tone": band[2]}


def top_rarity(creatures: list[dict]) -> str:
    best = "Comune"
    for c in creatures:
        if rarity_info(c.get("rarity"))["grade"] > rarity_info(best)["grade"]:
            best = c.get("rarity")
    return best


# Bottino (deciso: lo decide il Master). Il wizard genera al momento un profilo di drop generico:
# un tiro d100 per creatura (max 6). Proposta: i quattro tipi di profilo e le loro soglie.
DROP_KINDS = [
    {"name": "Avaro", "text": "Poco o niente: bestie senza tesoro.", "up": 2, "same": 15, "down": 35},
    {"name": "Normale", "text": "Bottino da strada: qualcosa di utile, raramente di valore.", "up": 5, "same": 25, "down": 40},
    {"name": "Generoso", "text": "Creature che custodiscono o accumulano.", "up": 10, "same": 35, "down": 35},
    {"name": "Tesoro", "text": "Un covo, un forziere, un boss: il bottino è il punto.", "up": 20, "same": 45, "down": 25},
]
DROP_CATEGORIES = ["Arma", "Armatura", "Accessorio", "Consumabile", "Materiale raro", "Pergamena o libro"]
DROP_MAX_ROLLS = 6


def rarity_step(name: str, d: int) -> str:
    i = RARITIES.index(name) if name in RARITIES else 0
    return RARITIES[max(0, min(len(RARITIES) - 1, i + d))]


def make_drop_profile(creatures: list[dict], rng, kind: str | None = None) -> dict:
    """Profilo di drop generato al momento: tabella d100 con soglie del tipo di profilo, rarità a partire dalla
    creatura più rara; monete = Corone numero × grado²/4 (±50%) più 0–19 Scellini; materiali per creatura."""
    top = top_rarity(creatures)
    k = next((x for x in DROP_KINDS if x["name"] == kind), None) or rng.choice(DROP_KINDS)
    cats = rng.sample(DROP_CATEGORIES, 3)
    a = k["up"]
    b = a + k["same"]
    c = b + k["down"]
    rows = [
        {"from": 1, "to": a, "what": f"Oggetto {rarity_step(top, 1)} ({cats[0]})", "rarity": rarity_step(top, 1)},
        {"from": a + 1, "to": b, "what": f"Oggetto {top} ({cats[1]})", "rarity": top},
        {"from": b + 1, "to": c, "what": f"Oggetto {rarity_step(top, -1)} ({cats[2]})", "rarity": rarity_step(top, -1)},
        {"from": c + 1, "to": 100, "what": "Solo monete e materiali", "rarity": ""},
    ]
    coins = sum(int(num(x.get("count"))) * rarity_info(x.get("rarity"))["grade"] ** 2 / 4 * rng.uniform(0.5, 1.5)
                for x in creatures)
    mats = [{"name": f"Materiali di {str(x.get('name') or 'creatura').strip().lower()}",
             "qty": max(1, js_round(int(num(x.get("count"))) * rng.uniform(0.5, 2))), "rarity": x.get("rarity") or "Comune"}
            for x in creatures]
    rolls = min(DROP_MAX_ROLLS, sum(int(num(x.get("count"))) for x in creatures))
    return {"kind": k["name"], "text": k["text"], "top": top, "rows": rows, "rolls": rolls,
            "corone": js_round(coins), "scellini": rng.randrange(20), "mats": mats}


def roll_drop(profile: dict, rng) -> dict:
    """«Tira il bottino»: un d100 per tiro sulla tabella del profilo, più monete e materiali."""
    rolls = []
    for _ in range(max(0, int(num(profile.get("rolls"))))):
        d = rng.randint(1, 100)
        row = next((r for r in profile.get("rows") or [] if num(r.get("from")) <= d <= num(r.get("to"))), None)
        rolls.append({"d100": d, "what": row["what"] if row else "—", "rarity": (row or {}).get("rarity") or ""})
    lines = [f"{r['what']} [d100 {r['d100']}]" for r in rolls if r["rarity"]]
    lines += [f"{m['qty']}× {m['name']} ({m['rarity']})" for m in profile.get("mats") or []]
    coins = ", ".join(x for x in [f"{profile['corone']} Corone" if profile.get("corone") else "",
                                  f"{profile['scellini']} Scellini" if profile.get("scellini") else ""] if x)
    if coins:
        lines.append(coins)
    return {"rolls": rolls, "text": "\n".join(lines)}


# ---- Incantesimi (Magia_Creazione_Incantesimi.txt, Magic.txt; decisioni 6–12 di docs/PROPOSTE.md) ----
SPHERES = [
    {"key": "Ignis", "it": "Fuoco", "field": "Combustione, calore, passione, trasformazione rapida"},
    {"key": "Aqua", "it": "Acqua", "field": "Liquidi, guarigione, ghiaccio e vapore, sogni"},
    {"key": "Terra", "it": "Terra", "field": "Roccia, metallo, cristalli, crescita, stabilità"},
    {"key": "Ventus", "it": "Aria", "field": "Venti, volo, suoni, comunicazione a distanza"},
    {"key": "Mens", "it": "Mente", "field": "Pensiero, memoria, telepatia, illusioni"},
    {"key": "Anima", "it": "Spirito", "field": "Spiriti, energia vitale, morte, protezione dalle influenze"},
    {"key": "Vis", "it": "Forza", "field": "Energia pura, scudi, proiettili, gravità, dissolvere magie"},
    {"key": "Vita", "it": "Vita", "field": "Guarigione, crescita, mutazione, cicli vitali"},
    {"key": "Spatium", "it": "Spazio", "field": "Distanza, portali, teletrasporto · sfera pura", "pure": True},
    {"key": "Tempus", "it": "Tempo", "field": "Accelerare, rallentare, visioni · sfera pura", "pure": True},
]
SPHERE_KEYS = [s["key"] for s in SPHERES]
SPELL_ROLES = ["forma", "innesco", "sostanza", "direzione", "potenza", "durata", "bersaglio", "protezione"]
SPELL_CATEGORIES = [{"key": "attacco", "name": "Attacco"}, {"key": "difesa", "name": "Difesa"}, {"key": "cura", "name": "Cura"},
                    {"key": "controllo", "name": "Controllo"}, {"key": "utilita", "name": "Utilità"},
                    {"key": "movimento", "name": "Movimento"}, {"key": "percezione", "name": "Percezione"}]
SPELL_ORIGINS = [
    {"key": "grimorio", "name": "Grimorio", "text": "Scritto in uno slot del Grimorio Basilare: si consolida subito, senza pratica.", "skill": True},
    {"key": "pratica", "name": "Pratica", "text": "Usato con continuità: entra «in pratica» come incantesimo di Grado I all'1%.", "skill": True},
    {"key": "improvvisato", "name": "Improvvisato", "text": "Composto sul momento: non diventa una skill finché non si consolida.", "skill": False},
]
COMPAT_RAW = {
    "Ignis": {"strong": ["Terra", "Ventus"], "weak": ["Aqua"]},
    "Aqua": {"strong": ["Terra", "Vita"], "weak": ["Ignis"]},
    "Terra": {"strong": ["Vita", "Ignis"], "weak": ["Ventus"]},
    "Ventus": {"strong": ["Ignis", "Spatium"], "weak": ["Terra"]},
    "Mens": {"strong_all": True, "note": "forte con tutte (compatibilità universale)"},
    "Anima": {"strong": ["Vita", "Tempus"], "dangerous": ["Vis"]},
    "Vis": {"note": "neutra con tutte, ma richiede un controllo preciso"},
    "Vita": {"strong": ["Aqua", "Terra"], "weak": ["Anima"], "note": "debole con Anima se manca un'etica"},
    "Spatium": {"strong": ["Tempus", "Ventus"], "note": "pericolosa se usata di fretta"},
    "Tempus": {"strong": ["Spatium"], "dangerous_all": True, "note": "forte solo con Spatium, pericolosa con tutte le altre"},
}
COMPAT_LEVELS = {"S": {"name": "Forte", "tone": "good", "rank": 0}, "N": {"name": "Neutra", "tone": "muted", "rank": 1},
                 "W": {"name": "Debole", "tone": "warn", "rank": 2}, "D": {"name": "Pericolosa", "tone": "bad", "rank": 3}}
METAMAGIC = [
    {"key": "extend", "name": "Estesa", "en": "Extend", "lv": 1, "text": "Durata doppia"},
    {"key": "empower", "name": "Potenziata", "en": "Empower", "lv": 2, "text": "+50% agli effetti numerici"},
    {"key": "maximize", "name": "Massimizzata", "en": "Maximize", "lv": 3, "text": "Danno o cura al massimo"},
    {"key": "silent", "name": "Silenziosa", "en": "Silent", "lv": 1, "text": "Senza componenti verbali"},
    {"key": "still", "name": "Immobile", "en": "Still", "lv": 1, "text": "Senza componenti gestuali"},
    {"key": "subtle", "name": "Sottile", "en": "Subtle", "lv": 2, "text": "Difficile da individuare"},
    {"key": "penetrating", "name": "Penetrante", "en": "Penetrating", "lv": 2, "text": "Ignora le resistenze"},
    {"key": "persistent", "name": "Persistente", "en": "Persistent", "lv": 4, "text": "Continua senza concentrazione"},
]
SPHERE_META = {
    "Ignis": {"name": "Ustionante", "text": "Le bruciature continuano a fare danno"},
    "Aqua": {"name": "Fluente", "text": "L'incantesimo può muoversi e cambiare forma"},
    "Terra": {"name": "Duratura", "text": "Durata lunghissima"},
    "Ventus": {"name": "Rapida", "text": "Tempo di lancio ridotto"},
    "Mens": {"name": "In rete", "text": "Colpisce più bersagli"},
    "Anima": {"name": "Vincolante", "text": "Crea un legame spirituale duraturo"},
    "Vis": {"name": "Sovraccarica", "text": "Potenza molto aumentata"},
    "Vita": {"name": "Adattiva", "text": "Si evolve secondo le circostanze"},
    "Spatium": {"name": "Ancorata", "text": "Non può essere spostata o dissolta"},
    "Tempus": {"name": "Sincronizzata", "text": "Si attiva in un momento preciso"},
}
SPHERE_META_LV = 2  # deciso: metamagie di sfera +2 livelli
MAGIC_ZONES = [
    {"key": "", "name": "Nessuna zona particolare"},
    {"key": "vulcano", "name": "Vulcano / deserto", "plus": "Ignis", "minus": "Aqua"},
    {"key": "oceano", "name": "Oceano / lago", "plus": "Aqua", "minus": "Ignis"},
    {"key": "montagna", "name": "Montagna / caverna", "plus": "Terra", "minus": "Ventus"},
    {"key": "alture", "name": "Alture ventose", "plus": "Ventus", "minus": "Terra"},
    {"key": "biblioteca", "name": "Biblioteca / accademia", "plus": "Mens"},
    {"key": "cimitero", "name": "Cimitero / campo di battaglia", "plus": "Anima"},
    {"key": "forgia", "name": "Forgia / laboratorio", "plus": "Vis"},
    {"key": "foresta", "name": "Giardino / foresta", "plus": "Vita"},
    {"key": "portale", "name": "Portale / velo sottile", "plus": "Spatium"},
    {"key": "anomalia", "name": "Anomalia temporale", "plus": "Tempus"},
]
LEY_LINES = [{"v": 0, "name": "Nessuna linea di potere", "surge": 0}, {"v": 1, "name": "Linea minore (+1)", "surge": 0},
             {"v": 2, "name": "Linea maggiore (+2)", "surge": 10}, {"v": 3, "name": "Incrocio di linee (+3)", "surge": 25}]
BACKLASH_BANDS = [
    {"max": 8, "name": "Minore", "tone": "good", "text": "Mal di testa o nausea, piccole fughe dell'elemento (scintille, brina). Dura 1–10 minuti."},
    {"max": 15, "name": "Moderato", "tone": "warn", "text": "L'incantesimo rimbalza sul mago o produce un effetto casuale; drenaggio temporaneo. Dura 1–24 ore."},
    {"max": 20, "name": "Maggiore", "tone": "warn", "text": "Ferita seria al mago, danni magici all'ambiente, piccola alterazione permanente. Dura 1–7 giorni."},
    {"max": 25, "name": "Grave", "tone": "bad", "text": "Ferita mortale, area vasta colpita, cicatrice magica permanente."},
    {"max": math.inf, "name": "Catastrofico", "tone": "bad", "text": "Morte, pietrificazione o follia; squarcio nella realtà, zona di pericolo magico."},
]
SPELL_MAX_LEVEL = 10
COMBO_GRADE = 7  # combinazioni: Grado VII in ogni sfera (Magic.txt, 70%)


def _judge(a: str, b: str) -> str:
    r = COMPAT_RAW.get(a, {})
    strong = b in r.get("strong", [])
    if b in r.get("dangerous", []) or (r.get("dangerous_all") and not strong):
        return "D"
    if b in r.get("weak", []):
        return "W"
    if strong or r.get("strong_all"):
        return "S"
    return "N"


def pair_compat(a: str, b: str) -> dict:
    """Giudizio di una coppia di sfere: se i due punti di vista differiscono vale il più severo (deciso)."""
    x, y = _judge(a, b), _judge(b, a)
    level = x if COMPAT_LEVELS[x]["rank"] >= COMPAT_LEVELS[y]["rank"] else y
    return {"a": a, "b": b, "level": level, "name": COMPAT_LEVELS[level]["name"], "tone": COMPAT_LEVELS[level]["tone"],
            "views": [f"{a} → {b}: {COMPAT_LEVELS[x]['name']}", f"{b} → {a}: {COMPAT_LEVELS[y]['name']}"], "disagree": x != y}


def compat_pairs(keys: list[str]) -> list[dict]:
    return [pair_compat(keys[i], keys[j]) for i in range(len(keys)) for j in range(i + 1, len(keys))]


def worst_pair(pairs: list[dict]) -> dict | None:
    w = None
    for p in pairs:
        if w is None or COMPAT_LEVELS[p["level"]]["rank"] > COMPAT_LEVELS[w["level"]]["rank"]:
            w = p
    return w


def zone_mod(keys: list[str], zone: str) -> dict:
    """Sintonia della zona: +2 per la sfera favorita, −2 per quella sfavorita; con più sfere si somma, limite ±2."""
    z = next((x for x in MAGIC_ZONES if x["key"] == zone), None)
    if not z or not z["key"]:
        return {"mod": 0, "parts": []}
    s = 0
    parts = []
    for k in keys:
        if k == z.get("plus"):
            s += 2
            parts.append(f"{k} +2")
        if k == z.get("minus"):
            s -= 2
            parts.append(f"{k} −2")
    return {"mod": max(-2, min(2, s)), "parts": parts}


def spell_levels(spheres: list[dict], level: Any, meta: list[str], zone: str = "", ley: Any = 0) -> dict:
    """Livello di lancio = base + metamagia (+2 per quelle di sfera) + 1 per ogni sfera in uso traverso;
    efficacia = base + linea di potere + sintonia (minimo 1)."""
    keys = [x.get("s") for x in spheres]
    base = int(level) if isinstance(level, (int, float)) and float(level).is_integer() else 0
    meta_std = sum(m["lv"] for m in METAMAGIC if m["key"] in meta)
    meta_sph = sum(1 for k in keys if f"sph:{k}" in meta) * SPHERE_META_LV
    trav = sum(1 for x in spheres if x.get("trav"))
    z = zone_mod(keys, zone)
    ley_v = int(num(ley))
    return {"base": base, "meta_std": meta_std, "meta_sph": meta_sph, "meta": meta_std + meta_sph, "trav": trav,
            "cast": base + meta_std + meta_sph + trav, "zone": z["mod"], "zone_parts": z["parts"], "ley": ley_v,
            "eff": max(1, base + ley_v + z["mod"])}


def spell_cost(cast: int, combo: bool = False) -> int:
    """Mana = 10 × L × (L+1) (livello 1 = 20, il Dardo Magico); combinazione ×1,5."""
    return js_round(10 * cast * (cast + 1) * (1.5 if combo else 1))


def cast_turns(cast: int, combo: bool = False) -> int:
    """Tempo di lancio ⌈L/3⌉ turni (minimo 1); combinazione +50%."""
    return math.ceil(max(1, math.ceil(cast / 3)) * (1.5 if combo else 1))


def spell_cd(cast: int) -> int:
    """Ricarica ⌈L/2⌉ turni, minimo 1."""
    return max(1, math.ceil(cast / 2))


def sphere_grade(skills: list[dict], key: str) -> dict:
    """Grado del PG in una sfera = skill di tipo Knowledge con il nome della sfera."""
    s = next((x for x in skills or [] if "knowledge" in str(x.get("type") or "").lower()
              and str(x.get("name") or "").lower() == key.lower()), None)
    return {"grade": int(num(s.get("lvl"))) if s else 0, "pct": s.get("pct") if s else None}


def sphere_reqs(spheres: list[dict], cast: int, combo: bool, skills: list[dict] | None) -> list[dict]:
    """Ogni sfera va posseduta (Grado I; Grado VII per le combinazioni); consigliato Grado ≥ livello di lancio,
    altrimenti il lancio conta come overcast (deciso)."""
    need = COMBO_GRADE if combo else 1
    rec = max(1, min(SPELL_MAX_LEVEL, cast))
    out = []
    for x in spheres:
        g = sphere_grade(skills or [], x.get("s", ""))
        has = g["grade"]
        out.append({"s": x.get("s"), "need": need, "rec": rec, "has": has, "pct": g["pct"],
                    "status": "missing" if has < need else "overcast" if has < rec else "ok"})
    return out


def backlash_band(score: float) -> dict:
    return next(b for b in BACKLASH_BANDS if score <= b["max"])


def backlash(spheres: list[dict], cast: int, risk: dict, anti: bool, overcast: bool) -> dict:
    """Gravità = livello di lancio × 2 + fattori (al posto del d20, deciso)."""
    f = [{"label": f"Livello di lancio {cast} × 2", "v": cast * 2}]
    if risk.get("fatigue"):
        f.append({"label": "Fatica (molti incantesimi oggi)", "v": 1})
    if risk.get("emotion"):
        f.append({"label": "Stato emotivo (stress, rabbia, paura)", "v": 1})
    if risk.get("interrupt"):
        f.append({"label": "Lancio interrotto", "v": 3})
    if overcast:
        f.append({"label": "Overcast (oltre le proprie capacità)", "v": 2})
    if anti:
        f.append({"label": "Zona antimagia", "v": 2})
    prot = max(0, min(5, int(num(risk.get("protections")))))
    if prot:
        f.append({"label": f"Protezioni prese ({prot})", "v": -prot})
    pure = {s["key"] for s in SPHERES if s.get("pure")}
    if any(x.get("s") in pure for x in spheres):
        f.append({"label": "Sfera pura (Spatium/Tempus)", "v": 2})
    wp = worst_pair(compat_pairs([x.get("s") for x in spheres]))
    if wp and wp["level"] == "D":
        f.append({"label": f"Coppia pericolosa {wp['a']} + {wp['b']}", "v": 2})
    elif wp and wp["level"] == "W":
        f.append({"label": f"Coppia debole {wp['a']} + {wp['b']}", "v": 1})
    score = max(0, sum(x["v"] for x in f))
    b = backlash_band(score)
    return {"score": score, "band": b["name"], "tone": b["tone"], "text": b["text"], "factors": f, "overcast": overcast}


SPELL_COMPOSITION = [1, 0.85, 0.75]  # ×1 con una sfera, ×0,85 con due, ×0,75 con tre (deciso)


def spell_effect(category: str, eff: int, n_spheres: int, molt_mag: float, meta: list[str]) -> dict | None:
    """Danno o cura = 15–30 × efficacia × molt. danno magico × composizione (deciso). None se la categoria non ha numeri."""
    if category not in ("attacco", "cura"):
        return None
    n = max(1, min(3, n_spheres))
    comp = SPELL_COMPOSITION[n - 1]
    lo, hi = 15 * eff * comp * molt_mag, 30 * eff * comp * molt_mag
    steps = [f"base 15–30 × efficacia {eff}"]
    if comp != 1:
        steps.append(f"× {fmt_it(comp)} ({n} sfere)")
    steps.append(f"× molt. magico {fmt_it(molt_mag)}")
    if "empower" in meta:
        lo, hi = lo * 1.5, hi * 1.5
        steps.append("× 1,5 Potenziata")
    if "maximize" in meta:
        lo = hi
        steps.append("Massimizzata: sempre il massimo")
    return {"min": js_round(lo), "max": js_round(hi), "steps": steps, "kind": "Cura" if category == "cura" else "Danno"}


def spell_meta_names(meta: list[str]) -> list[str]:
    out = []
    for k in meta:
        if k.startswith("sph:"):
            s = k[4:]
            if s in SPHERE_META:
                out.append(f"{SPHERE_META[s]['name']} ({s})")
        else:
            m = next((x for x in METAMAGIC if x["key"] == k), None)
            if m:
                out.append(m["name"])
    return out


# ---- Miracoli (decisioni 13–22 di docs/PROPOSTE.md): i miracoli sono skill, livelli 1–10 ----
GODS = [
    {"key": "luxor", "name": "Luxor", "domain": "Luce", "origin": True, "epithet": "Il Padre Luminoso", "sphere": "Ordine e giustizia; i suoi templi sono di cristallo puro",
     "tone": "Solenne, inflessibile, giudica secondo la legge", "affine": ["protezione", "castigo", "rivelazione", "benedizione"],
     "vows": ["Non mentire sotto giuramento", "Non negare giustizia a chi la chiede", "Rispettare l'ordine legittimo"]},
    {"key": "solaria", "name": "Solaria", "domain": "Luce", "epithet": "La Madre Solare", "sphere": "Protezione dei giusti e dei valorosi; a Qadesh è figlia di Luxor, meno pura del padre",
     "tone": "Calda e marziale, premia il coraggio", "affine": ["protezione", "guarigione", "benedizione"],
     "vows": ["Non abbandonare un compagno in battaglia", "Proteggere chi non può difendersi", "Non colpire chi si arrende"]},
    {"key": "verdania", "name": "Verdania", "domain": "Luce", "epithet": "La Nutrice Verde", "sphere": "Tutte le cose che crescono e fioriscono",
     "tone": "Materna e paziente", "affine": ["guarigione", "benedizione", "purificazione"],
     "vows": ["Non distruggere ciò che cresce senza necessità", "Restituire alla terra ciò che si prende"]},
    {"key": "ferrum", "name": "Ferrum", "domain": "Luce", "epithet": "Il Fabbro Divino", "sphere": "Forgiò le prime armi e insegnò l'arte agli umani",
     "tone": "Pratico e burbero, rispetta il lavoro ben fatto", "affine": ["benedizione", "protezione"],
     "vows": ["Non rompere l'opera di un altro per invidia", "Onorare ogni dono con il lavoro"]},
    {"key": "umbranis", "name": "Umbranis", "domain": "Ombra", "origin": True, "epithet": "L'Imperatrice del Vuoto (detta anche Umbris)", "sphere": "Tessitrice del destino e del caos",
     "tone": "Enigmatica e capricciosa", "affine": ["rivelazione", "castigo", "intercessione"],
     "vows": ["Non opporsi al destino rivelato", "Lasciare sempre una scelta al caso"]},
    {"key": "morteus", "name": "Morteus", "domain": "Ombra", "epithet": "Il Giudice Finale", "sphere": "Pesa le anime e decide il loro destino ultraterreno",
     "tone": "Impassibile e giudicante", "affine": ["castigo", "rivelazione", "intercessione"],
     "vows": ["Non profanare i morti", "Non sfuggire alla propria morte con l'inganno", "Rispettare il giudizio pronunciato"]},
    {"key": "tempestus", "name": "Tempestus", "domain": "Ombra", "epithet": "Il Distruttore", "sphere": "Signore delle tempeste e della furia della natura",
     "tone": "Furioso e impulsivo", "affine": ["castigo", "benedizione"],
     "vows": ["Non cercare riparo dalla tempesta", "Non trattenere la furia davanti a un affronto"]},
    {"key": "venenum", "name": "Venenum", "domain": "Ombra", "epithet": "Il Sussurratore", "sphere": "Maestro dell'inganno e dei veleni sottili",
     "tone": "Sussurrato e ambiguo", "affine": ["castigo", "rivelazione", "purificazione"],
     "vows": ["Non rivelare i segreti del culto", "Ripagare ogni debito, anche con l'inganno"]},
]
MIRACLE_NATURES = [
    {"key": "benedizione", "name": "Benedizione", "text": "Potenzia un alleato, un oggetto o un luogo"},
    {"key": "guarigione", "name": "Guarigione", "text": "Ripristina Vita, chiude ferite, cura malattie", "base": [40, 60]},
    {"key": "protezione", "name": "Protezione", "text": "Scudi, santuari, difesa da influenze ostili"},
    {"key": "castigo", "name": "Castigo", "text": "Danno o punizione inflitta in nome del dio", "base": [15, 30]},
    {"key": "rivelazione", "name": "Rivelazione", "text": "Visioni, verità nascoste, presagi"},
    {"key": "purificazione", "name": "Purificazione", "text": "Scaccia maledizioni, veleni e corruzione"},
    {"key": "intercessione", "name": "Intercessione", "text": "Chiede al dio di intervenire di persona"},
]
FAVOR_SCALE = [{"v": -3, "name": "Maledizione divina"}, {"v": -2, "name": "Rinnegato"}, {"v": -1, "name": "In disgrazia"},
               {"v": 0, "name": "Neutrale"}, {"v": 1, "name": "Notato"}, {"v": 2, "name": "Favorito"},
               {"v": 3, "name": "Prescelto"}, {"v": 4, "name": "Benedizione divina"}]
MIRACLE_AGAINST = [
    {"key": "indebolito", "name": "Il prodigio si indebolisce", "text": "Effetto dimezzato; il Mana è speso per intero.", "from_text": True},
    {"key": "cessa", "name": "Il prodigio non avviene", "text": "Nessun effetto; il Mana è speso.", "from_text": True},
    {"key": "favore1", "name": "Perdita di favore (−1 grado)", "text": "Il prodigio riesce, ma il dio se ne ricorda."},
    {"key": "favore2", "name": "Perdita di favore (−2 gradi)", "text": "Il prodigio fallisce e il chierico porta un segno del disfavore."},
    {"key": "maledizione", "name": "Maledizione divina", "text": "Il favore crolla a Maledizione divina; il dio può mandare un castigo."},
]


def favor_name(v: Any) -> str:
    return next((f["name"] for f in FAVOR_SCALE if f["v"] == int(num(v))), "Neutrale")


def miracle_cost(level: int) -> int:
    """Mana = 12,5 × L × (L+1) (livello 1 = 25, la Cura Minore)."""
    return js_round(12.5 * level * (level + 1))


def miracle_fede(level: int) -> int:
    """Fede richiesta = 5 × L × (L+1)."""
    return 5 * level * (level + 1)


def favor_required(level: int, affine: bool) -> int:
    """Livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione; un grado in più fuori dominio."""
    base = 1 if level <= 2 else 2 if level <= 5 else 3 if level <= 8 else 4
    return min(4, base + (0 if affine else 1))


def favor_mult(have: int, need: int) -> dict:
    """×1 al favore richiesto, +25% per ogni grado in più; un grado sotto ×0,5; due o più gradi sotto 0."""
    d = have - need
    if d >= 0:
        return {"mult": 1 + 0.25 * d, "state": "potenziato" if d > 0 else "pieno"}
    if d == -1:
        return {"mult": 0.5, "state": "indebolito"}
    return {"mult": 0, "state": "cessa"}


def char_fede(stats: list[dict]) -> float:
    """Fede del PG: statistica avanzata FED/FEDE (si sblocca quando il PG crede in un dio); 0 se non c'è."""
    row = next((r for r in stats or [] if str(r.get("code") or "").upper() in ("FED", "FEDE")
                or str(r.get("name") or "").lower() == "fede"), None)
    return stat_total(row) if row else 0


def char_favor(reputation: list[dict], god_name: str) -> dict:
    """Favore = reputazione cosmica del PG verso il dio (per nome della scala o valore −3…+4)."""
    rep = next((r for r in reputation or [] if "cosmic" in str(r.get("scope") or "").lower()
                and str(r.get("target") or "").lower() == god_name.lower()), None)
    if not rep:
        return {"v": 0, "recorded": False}
    by_name = next((f for f in FAVOR_SCALE if f["name"].lower() == str(rep.get("label") or "").lower()), None)
    v = by_name["v"] if by_name else max(-3, min(4, js_round(num(rep.get("value")))))
    return {"v": v, "recorded": True}


def is_cleric(classe: str | None) -> bool:
    return "chieric" in str(classe or "").lower()


def miracle_power(nature: str, level: int, fede: float, have_favor: int, need_favor: int) -> dict:
    """Potenza = base × livello × (1 + Fede/100) × molt. favore (deciso). value None se la natura non ha numeri."""
    nat = next((n for n in MIRACLE_NATURES if n["key"] == nature), None)
    fm = favor_mult(have_favor, need_favor)
    if not nat or "base" not in nat or not level:
        return {"fm": fm, "value": None}
    k = level * (1 + fede / 100) * fm["mult"]
    return {"fm": fm, "value": {"min": js_round(nat["base"][0] * k), "max": js_round(nat["base"][1] * k),
                                "base": list(nat["base"]), "kind": "Cura" if nature == "guarigione" else "Danno"}}


def forge_config() -> dict:
    """Costanti della Forgia per il frontend (opzioni dei wizard)."""
    return {
        "stats": [{"code": k, "name": v} for k, v in FORGE_STATS.items()],
        "skill_types": list(SKILL_TYPES), "acquire": copy.deepcopy(ACQUIRE), "grade1_rule": dict(GRADE1_RULE),
        "weapon_grade_rows": copy.deepcopy(WEAPON_GRADE_ROWS),
        "class_types": copy.deepcopy(CLASS_TYPES), "talent_levels": list(TALENT_LEVELS),
        "race_templates": copy.deepcopy(RACE_TEMPLATES), "race_origins_extra": list(RACE_ORIGINS_EXTRA),
        "relations": list(RELATIONS), "races_known": list(RACES_KNOWN),
        "title_acq": dict(TITLE_ACQ), "title_examples": dict(TITLE_EX), "title_effects": list(TITLE_EFFECTS),
        "trust": list(TRUST_LEVELS), "sizes": copy.deepcopy(SIZES), "environments": list(ENVIRONMENTS),
        "difficulty": [{"max": None if b[0] == math.inf else b[0], "label": b[1], "tone": b[2]} for b in DIFFICULTY_BANDS],
        "drop_kinds": copy.deepcopy(DROP_KINDS), "exp_modes": list(EXP_MODES),
        "spheres": copy.deepcopy(SPHERES), "spell_roles": list(SPELL_ROLES), "spell_categories": copy.deepcopy(SPELL_CATEGORIES),
        "spell_origins": copy.deepcopy(SPELL_ORIGINS), "compat_notes": {k: v.get("note") for k, v in COMPAT_RAW.items() if v.get("note")},
        "metamagic": copy.deepcopy(METAMAGIC), "sphere_meta": copy.deepcopy(SPHERE_META), "sphere_meta_lv": SPHERE_META_LV,
        "zones": copy.deepcopy(MAGIC_ZONES), "ley_lines": copy.deepcopy(LEY_LINES),
        "backlash_bands": [{**b, "max": None if b["max"] == math.inf else b["max"]} for b in BACKLASH_BANDS],
        "gods": copy.deepcopy(GODS), "natures": copy.deepcopy(MIRACLE_NATURES), "favor": copy.deepcopy(FAVOR_SCALE),
        "against": copy.deepcopy(MIRACLE_AGAINST), "spell_max_level": SPELL_MAX_LEVEL, "combo_grade": COMBO_GRADE,
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


RESOURCE_KEYS = ("hp", "mp", "sp", "ki")  # "ki" solo per i PG con la statistica avanzata KI
RESOURCE_LABELS = {"hp": "HP", "mp": "MP", "sp": "SP", "ki": "KI"}


def resource_keys(maxes: dict) -> list[str]:
    """Risorse che valgono per un PG, dati i suoi massimi (KI incluso solo se c'è)."""
    return [k for k in RESOURCE_KEYS if k in maxes]


def clamp_resources(resources: dict | None, maxes: dict) -> dict:
    """Risorse correnti entro i massimi: una risorsa mancante (es. KI appena sbloccato) parte dal massimo,
    una che il PG non ha più (es. statistica KI rimossa) sparisce."""
    r = resources or {}
    return {k: clean(min(num(r.get(k, maxes[k])), num(maxes[k]))) for k in resource_keys(maxes)}


def resource_errors(resources: dict, maxes: dict) -> list[str]:
    errs = [f"{RESOURCE_LABELS[k]}: il personaggio non ha la statistica KI." for k in ("ki",)
            if resources.get(k) is not None and k not in maxes]
    return errs + [f"{RESOURCE_LABELS[k]} oltre il massimo ({fmt_n(resources[k])} su {fmt_n(maxes[k])})."
                   for k in resource_keys(maxes) if num(resources.get(k)) > num(maxes.get(k))]


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


def end_turn(resources: dict, combat: dict, maxes: dict, ki_regen: float = 0) -> None:
    """Fine turno. `ki_regen` = derivata kiCombat finale (VIT/30, bonus oggetti inclusi), usata solo se c'è il KI."""
    mp_gain = max(0, min(maxes["mp"] - num(resources["mp"]), js_round(maxes["mp"] * REGEN["mp_pct"] / 100)))
    sp_gain = max(0, min(maxes["sp"] - num(resources["sp"]), js_round(maxes["sp"] * REGEN["sp_pct"] / 100)))
    resources["mp"] = clean(min(maxes["mp"], num(resources["mp"]) + mp_gain))
    resources["sp"] = clean(min(maxes["sp"], num(resources["sp"]) + sp_gain))
    line = f"Fine turno: MP +{fmt_n(mp_gain)}, SP +{fmt_n(sp_gain)}"
    if "ki" in maxes:  # KI: VIT/30 a turno (derivata kiCombat, bonus oggetti inclusi), entro il massimo
        ki_gain = max(0, min(maxes["ki"] - num(resources.get("ki", maxes["ki"])), js_round(num(ki_regen))))
        resources["ki"] = clean(min(maxes["ki"], num(resources.get("ki", maxes["ki"])) + ki_gain))
        line += f", KI +{fmt_n(ki_gain)}"
    add_log(combat, line + ".")
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
