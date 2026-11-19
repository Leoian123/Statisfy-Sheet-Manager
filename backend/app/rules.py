"""Regole STATISFY (porting di mockup/rules.js). Funzioni pure, nessun accesso al DB."""
from __future__ import annotations

import math
import re
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
]
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
     "equip": [{"name": "Spada di Ferro", "type": "Arma", "weight": 3, "stats": "Req 15 STR"},
               {"name": "Armatura di Cuoio Rinforzato", "type": "Armatura", "weight": 6, "stats": "+5 Difesa"},
               {"name": "Scudo di Legno", "type": "Scudo", "weight": 4, "stats": "Blocco 20%"}]},
    {"id": "mago", "name": "Mago", "skill": "Dardo Magico", "skill_text": "Colpisce sempre",
     "cost": "20 MP", "cooldown": 1,
     "equip": [{"name": "Bastone di Frassino", "type": "Arma", "weight": 2, "stats": "Req 15 INT, +10% Mana"},
               {"name": "Vesti di Stoffa", "type": "Armatura", "weight": 1, "stats": "+3 Regen Mana"},
               {"name": "Grimorio Basilare", "type": "Libro", "weight": 1, "stats": "Dardo + 2 slot liberi"}]},
    {"id": "ladro", "name": "Ladro", "skill": "Colpo Furtivo", "skill_text": "+100% critico se non visto",
     "cost": "10 SP", "cooldown": 2,
     "equip": [{"name": "Daga Affilata", "type": "Arma", "weight": 1, "stats": "Req 15 DEX, +5% Critico"},
               {"name": "Armatura di Cuoio Morbido", "type": "Armatura", "weight": 4, "stats": "+10% Evasione"},
               {"name": "Kit da Scasso", "type": "Strumento", "weight": 1, "stats": "Attrezzi da scasso"}]},
    {"id": "chierico", "name": "Chierico", "skill": "Cura Minore", "skill_text": "Ripristina 40–60 HP",
     "cost": "25 MP", "cooldown": 1,
     "equip": [{"name": "Mazza Benedetta", "type": "Arma", "weight": 3, "stats": "Req 12 STR, +10% vs non-morti"},
               {"name": "Vesti Sacre", "type": "Armatura", "weight": 2, "stats": "+5 Difesa Magica"},
               {"name": "Simbolo Sacro", "type": "Strumento", "weight": 0.5, "stats": "Focus divino"}]},
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
    {"key": "evasione", "label": "Evasione", "fmt": "pct", "src": "Regole",
     "calc": lambda t, c: t["DEX"] / 20, "formula": "DEX / 20 %"},
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
]
DERIVED_KEYS = [d["key"] for d in DERIVED]


def _cap(d: dict, v: float) -> float:
    return min(d["cap"], v) if d.get("cap") is not None else v


def derived_values(c: dict) -> dict[str, float]:
    """Valore base di ogni derivata (senza bonus oggetti, con tetto). c = {stats, equip?, magia?}."""
    t = T(totals(c.get("stats") or []))
    return {d["key"]: clean(_cap(d, d["calc"](t, c))) for d in DERIVED}


def formula_text(d: dict, c: dict) -> str:
    return d["formula_for"](c) if "formula_for" in d else d["formula"]


def explain(d: dict, c: dict) -> str:
    t = T(totals(c.get("stats") or []))
    if "explain" in d:
        return d["explain"](t, c)
    s = re.sub(r" \(.*\)$", "", d["formula"])
    s = re.sub(r" %$", "", s)
    return re.sub(r"\b(STR|DEX|VIT|INT)\b", lambda m: _f(t[m.group(1)]) if m.group(1) in t else m.group(1), s)


def derived(c: dict) -> list[dict]:
    """Lista Derived completa per la risposta API."""
    t = T(totals(c.get("stats") or []))
    ib = c.get("item_bonus") or {}
    out = []
    for d in DERIVED:
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
    }


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
