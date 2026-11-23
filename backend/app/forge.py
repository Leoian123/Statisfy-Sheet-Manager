"""Forgia del Master: logica dei wizard (porting di mockup/screens/wizards-master.js e wizards-magia.js).

Ogni wizard ha una bozza libera (`draft`, dict JSON con i campi del modulo) e quattro funzioni pure:
  check(d, ctx)   -> un messaggio per passo ("" = passo valido)
  compute(d, ctx) -> valori calcolati per l'anteprima (numeri, formule, requisiti)
  build(d, ctx)   -> voce della libreria {name, summary, ...}
  apply(e, pg)    -> modifica il PG assegnato (dict con stats/skills/active_skills/titles) e ritorna i messaggi
Le formule e le costanti sono in rules.py. `ctx` lo costruisce il router dal DB (vedi routers/forge.py):
  {"chars": [{id, name, level, classe, exp_pct, stats, skills, active_skills, titles, reputation, ri, derived}],
   "library": {kind: [voce, ...]}}
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Callable

from . import mech as MECH
from . import rules as R

KIND_LABEL = {"skills": "Skill", "classes": "Classi", "races": "Razze", "titles": "Titoli", "npcs": "PNG",
              "encounters": "Incontri", "spells": "Incantesimi", "miracles": "Miracoli",
              "items": "Oggetti"}
# Un singolo elemento («Titolo: «Drago» aggiunto»), non la categoria
KIND_ONE = {"skills": "Skill", "classes": "Classe", "races": "Razza", "titles": "Titolo", "npcs": "PNG",
            "encounters": "Incontro", "spells": "Incantesimo", "miracles": "Miracolo", "items": "Oggetto"}
KIND_FEMININE = {"skills", "classes", "races"}
KINDS = list(KIND_LABEL)


# ---------- Meccanica strutturata (passo «Meccanica» di incantesimi, miracoli e skill) ----------
def mech_msg(d: dict) -> str:
    """Il passo Meccanica è facoltativo: senza `mech` l'abilità resta descrittiva."""
    raw = d.get("mech")
    if not raw:
        return ""
    _, errs = MECH.parse(raw)
    return errs[0] if errs else ""


def mech_final(d: dict, tipo: str, cost: Any = None, res: str = "MP", cd: Any = None, tags: Any = ()) -> dict | None:
    """Meccanica da salvare: costo, ricarica ed etichette del wizard riempiono ciò che il Master non ha indicato."""
    raw = d.get("mech")
    if not raw or not isinstance(raw, dict):
        return None
    m = dict(raw)
    m["tipo"] = "passiva" if m.get("tipo") == "passiva" else tipo
    costi = list(m.get("costi") or [])
    has_launch = any(k.get("per", "lancio") == "lancio" and k.get("risorsa") in ("MP", "SP", "KI", "HP", "FEDE")
                     for k in costi if isinstance(k, dict))
    if not has_launch and cost and m["tipo"] != "passiva":  # il costo calcolato dal wizard, se il Master non ne ha messo uno
        m["costi"] = [{"risorsa": res if res in MECH.RESOURCES else "MP", "valore": cost, "per": "lancio"}, *costi][:4]
    if not (m.get("cooldown") or {}).get("valore") and cd:
        m["cooldown"] = {"valore": int(cd), "unita": "turni"}
    et = [str(x) for x in (m.get("etichette") or [])]
    for t in tags:
        if t and t not in et:
            et.append(str(t))
    m["etichette"] = et[:12]
    parsed, errs = MECH.parse(m)
    return MECH.dump(parsed) if parsed else None


def with_mech(check: Callable, compute: Callable) -> tuple[Callable, Callable]:
    """Aggiunge il passo Meccanica (penultimo) a un wizard e la sua descrizione all'anteprima."""
    def c(d: dict, ctx: dict) -> list[str]:
        msgs = check(d, ctx)
        return msgs[:-1] + [mech_msg(d)] + msgs[-1:]

    def k(d: dict, ctx: dict) -> dict:
        out = compute(d, ctx)
        raw = d.get("mech")
        if raw:
            m, errs = MECH.parse(raw)
            out["mech"] = {"text": MECH.describe(m) if m else "", "errors": errs}
        else:
            out["mech"] = None
        return out
    return c, k


# ---------- Helper ----------
def txt(v: Any) -> str:
    return str(v if v is not None else "").strip()


def filled(v: Any, n: int = 1) -> bool:
    return len(txt(v)) >= n


def as_int(v: Any, lo: float, hi: float) -> int | None:
    """Intero tra lo e hi (accetta numeri e stringhe numeriche), altrimenti None."""
    if isinstance(v, bool) or v is None or v == "":
        return None
    try:
        f = float(str(v).replace(",", "."))
    except ValueError:
        return None
    if not f.is_integer() or f < lo or f > hi:
        return None
    return int(f)


def as_num(v: Any) -> float | None:
    if isinstance(v, bool) or v is None or v == "":
        return None
    try:
        f = float(str(v).replace(",", "."))
    except ValueError:
        return None
    return None if f != f else f


def lst(v: Any) -> list:
    return v if isinstance(v, list) else []


def dct(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def cap(s: str) -> str:
    return s[:1].upper() + s[1:] if s else s


def signed(v: float) -> str:
    v = R.clean(v)
    return f"+{R.fmt_n(v)}" if v > 0 else f"−{R.fmt_n(abs(v))}" if v < 0 else "±0"


def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "x"


def lib(ctx: dict, kind: str) -> list[dict]:
    return (ctx.get("library") or {}).get(kind) or []


def name_taken(ctx: dict, kind: str, name: str, extra: list[str] | None = None) -> bool:
    n = txt(name).lower()
    if not n:
        return False
    return any(txt(x.get("name")).lower() == n for x in lib(ctx, kind)) or any(txt(x).lower() == n for x in (extra or []))


def char_by_id(ctx: dict, cid: Any) -> dict | None:
    i = as_int(cid, 1, 10 ** 9)
    return next((c for c in ctx.get("chars") or [] if c["id"] == i), None) if i else None


def char_brief(c: dict | None) -> dict | None:
    return {"id": c["id"], "name": c["name"], "level": c["level"], "classe": c["classe"]} if c else None


# ======================================================================
# 1. SKILL
# ======================================================================
def _skill_rows(d: dict) -> list[dict]:
    return [r for r in lst(d.get("rows")) if isinstance(r, dict)]


def skill_check(d: dict, ctx: dict) -> list[str]:
    name = txt(d.get("name"))
    att = d.get("mode") == "attiva"
    s0 = ("dai un nome alla skill (almeno 2 caratteri)." if len(name) < 2
          else f"«{name}» esiste già nella libreria." if name_taken(ctx, "skills", name) else "")
    if d.get("type") not in R.SKILL_TYPES:
        s0 = s0 or "scegli il tipo della skill."
    s1 = ""
    if att and as_int(d.get("cost"), 1, 99999) is None:
        s1 = f"indica il costo in {d.get('res') or 'SP'} (intero ≥ 1)."
    elif att and as_int(d.get("cd"), 0, 99) is None:
        s1 = "indica il cooldown in turni (0–99)."
    elif not filled(d.get("effect"), 5):
        s1 = "descrivi l'effetto (almeno 5 caratteri)."
    s2 = ""
    rows = _skill_rows(d)
    if not rows:
        s2 = "aggiungi almeno una riga a «cosa migliora per Grado»."
    for i, r in enumerate(rows):
        if s2:
            break
        if not filled(r.get("what")):
            s2 = f"riga {i + 1}: scrivi cosa migliora."
            break
        vals = lst(r.get("vals"))
        for g in range(R.SKILL_GRADES):
            if g >= len(vals) or as_num(vals[g]) is None:
                s2 = f"riga {i + 1}: manca il valore del Grado {R.ROMAN[g + 1]}."
                break
    if not s2 and att:
        cr = as_num(d.get("costRed"))
        if cr is None or not 0 <= cr <= 10:
            s2 = "la riduzione del costo per Grado va da 0 a 10%."
    if not s2 and not filled(d.get("passiveX"), 5):
        s2 = "descrivi la passiva sbloccata al Grado X."
    if not s2 and d.get("school") and not filled(d.get("schoolName"), 2):
        s2 = "dai un nome alla scuola oltre il Grado X, o togli la spunta."
    s3 = "" if filled(d.get("grade1"), 5) else "scrivi come si ottiene il Grado I."
    s4 = ""
    c = char_by_id(ctx, d.get("charId"))
    if d.get("charId") not in (None, "") and c is None:
        s4 = "personaggio non trovato."
    elif c:
        lst_ = c["active_skills"] if att else c["skills"]
        if any(txt(x.get("name")).lower() == name.lower() for x in lst_):
            s4 = f"{c['name']} ha già una skill chiamata «{name}»."
    return [s0, s1, s2, s3, s4]


def _is_weapon_rule(d: dict) -> bool:
    key = lambda rows: [(txt(r.get("what")), r.get("unit"), [as_num(v) for v in lst(r.get("vals"))]) for r in rows]
    return d.get("type") == "Combat" and key(_skill_rows(d)) == key(R.WEAPON_GRADE_ROWS)


def skill_compute(d: dict, ctx: dict) -> dict:
    rows = _skill_rows(d)
    cost = as_num(d.get("cost")) or 0
    red = as_num(d.get("costRed")) or 0
    return {
        "grades": [R.grade_text(rows, g) for g in range(1, R.SKILL_GRADES + 1)],
        "grade_names": list(R.GRADES),
        "weapon_rule": _is_weapon_rule(d),
        "cost_x": R.clean(round(cost * (1 - red * 9 / 100), 2)) if d.get("mode") == "attiva" and cost and red else None,
        "char": char_brief(char_by_id(ctx, d.get("charId"))),
        "grade1_rule": R.GRADE1_RULE.get(d.get("type") or ""),
    }


def skill_build(d: dict, ctx: dict) -> dict:
    c = char_by_id(ctx, d.get("charId"))
    att = d.get("mode") == "attiva"
    rows = [{"what": txt(r.get("what")), "unit": r.get("unit") or "%", "vals": [R.clean(as_num(v) or 0) for v in lst(r.get("vals"))[:R.SKILL_GRADES]]}
            for r in _skill_rows(d)]
    g1 = R.grade_text(rows, 1) or "—"
    return {
        "name": txt(d.get("name")), "type": d.get("type"), "mode": "attiva" if att else "passiva",
        "res": d.get("res") if att else None, "cost": as_int(d.get("cost"), 1, 99999) if att else None,
        "cd": as_int(d.get("cd"), 0, 99) if att else None, "effect": txt(d.get("effect")), "perGrade": rows,
        "costRedPerGrade": R.clean(as_num(d.get("costRed")) or 0) if att else 0, "passiveX": txt(d.get("passiveX")),
        "school": txt(d.get("schoolName")) if d.get("school") else None, "grade1": txt(d.get("grade1")),
        "method": txt(d.get("method")) or "Level up", "assignedTo": c["id"] if c else None,
        "mech": mech_final(d, "skill" if att else "passiva", as_int(d.get("cost"), 1, 99999) if att else None,
                           str(d.get("res") or "SP"), as_int(d.get("cd"), 0, 99) if att else None, [d.get("type")]),
        "summary": f"{d.get('type')} · {'attiva, ' + R.fmt_n(as_num(d.get('cost')) or 0) + ' ' + str(d.get('res')) + ', cd ' + R.fmt_n(as_num(d.get('cd')) or 0) if att else 'passiva'}"
                   f" · Grado I: {g1}" + (f" · assegnata a {c['name']}" if c else ""),
    }


def skill_apply(e: dict, pg: dict) -> list[str]:
    if e["mode"] == "attiva":
        pg["active_skills"].append({"name": e["name"], "effect": e["effect"], "lvl": 1, "pct": 0,
                                    "cost": f"{e['cost']} {e['res']}", "cd": e["cd"], "kind": "Skill",
                                    **({"mech": e["mech"]} if e.get("mech") else {})})
        return [f"{pg['name']}: nuova skill attiva «{e['name']}», Grado I · 0%."]
    pg["skills"].append({"name": e["name"], "lvl": 1, "pct": 0, "type": e["type"],
                         **({"mech": e["mech"]} if e.get("mech") else {})})
    return [f"{pg['name']}: nuova skill «{e['name']}», Grado I · 0%."]


# ======================================================================
# 2. CLASSE
# ======================================================================
def _class_skill(d: dict, ctx: dict) -> dict | None:
    if d.get("abMode") == "lib":
        s = next((x for x in lib(ctx, "skills") if x.get("name") == d.get("abLib")), None)
        return {"name": s["name"], "res": s.get("res"), "cost": s.get("cost"), "cd": s.get("cd"), "effect": s.get("effect", ""),
                "mode": s.get("mode", "attiva"), "fromLibrary": True} if s else None
    ab = dct(d.get("ab"))
    return {"name": txt(ab.get("name")), "res": ab.get("res") or "SP", "cost": as_int(ab.get("cost"), 1, 99999),
            "cd": as_int(ab.get("cd"), 0, 99), "effect": txt(ab.get("effect")), "mode": "attiva", "fromLibrary": False}


def _skill_line(s: dict | None) -> str:
    if not s:
        return ""
    if s.get("mode") == "attiva":
        return f"{R.fmt_n(R.num(s.get('cost')))} {s.get('res')} · {s.get('effect')} · cooldown {R.fmt_n(R.num(s.get('cd')))} turni"
    return f"Passiva · {s.get('effect')}"


def class_check(d: dict, ctx: dict) -> list[str]:
    name = txt(d.get("name"))
    base_names = [c["name"] for c in R.CLASSES]
    s0 = ("dai un nome alla classe." if len(name) < 2
          else f"la classe «{name}» esiste già." if name_taken(ctx, "classes", name, base_names)
          else "" if filled(d.get("focus"), 5) else "descrivi la classe e il suo focus.")
    if not s0 and d.get("ctype") not in R.CLASS_LABEL:
        s0 = "scegli il tipo di classe."
    s1 = ""
    if d.get("ctype") != "base" and not filled(d.get("unlock"), 10):
        s1 = "spiega come si sblocca giocando (almeno 10 caratteri)."
    elif d.get("minLevel") not in (None, "") and as_int(d.get("minLevel"), 1, 999) is None:
        s1 = "il livello minimo va da 1 a 999, o lascialo vuoto."
    elif not lst(d.get("keyStats")):
        s1 = "scegli almeno una statistica chiave."
    s2 = ""
    if d.get("abMode") == "lib":
        if not _class_skill(d, ctx):
            s2 = "scegli una skill della libreria."
    else:
        ab = dct(d.get("ab"))
        if not filled(ab.get("name"), 2):
            s2 = "dai un nome all'abilità."
        elif as_int(ab.get("cost"), 1, 99999) is None:
            s2 = "indica il costo (intero ≥ 1)."
        elif as_int(ab.get("cd"), 0, 99) is None:
            s2 = "indica il cooldown in turni (0–99)."
        elif not filled(ab.get("effect"), 5):
            s2 = "descrivi l'effetto dell'abilità."
    eq = [x for x in lst(d.get("equip")) if isinstance(x, dict)]
    s3 = ("indica almeno un oggetto di equipaggiamento iniziale." if not any(filled(x.get("name"), 2) for x in eq)
          else "una riga di equipaggiamento ha la nota ma non il nome."
          if any(not filled(x.get("name")) and filled(x.get("note")) for x in eq) else "")
    return [s0, s1, s2, s3]


def class_compute(d: dict, ctx: dict) -> dict:
    sk = _class_skill(d, ctx)
    return {"skill": sk, "skill_line": _skill_line(sk), "label": R.CLASS_LABEL.get(d.get("ctype") or "", ""),
            "from_options": [c["name"] for c in R.CLASSES] + [x["name"] for x in lib(ctx, "classes")]}


def class_build(d: dict, ctx: dict) -> dict:
    sk = _class_skill(d, ctx) or {}
    eq = [{"name": txt(x.get("name")), "note": txt(x.get("note"))} for x in lst(d.get("equip")) if isinstance(x, dict) and filled(x.get("name"))]
    name = txt(d.get("name"))
    tal = dct(d.get("tal"))
    ctype = d.get("ctype")
    return {
        "name": name, "type": ctype, "focus": txt(d.get("focus")),
        "unlock": "Disponibile alla creazione" if ctype == "base" else txt(d.get("unlock")),
        "from": d.get("from") or None, "teacher": txt(d.get("teacher")),
        "minLevel": as_int(d.get("minLevel"), 1, 999), "keyStats": [str(k) for k in lst(d.get("keyStats"))],
        "skill": sk, "equip": eq, "talents": {str(lv): txt(tal.get(str(lv))) for lv in R.TALENT_LEVELS},
        "class": {"id": slug(name), "name": name, "skill": sk.get("name"), "skill_text": _skill_line(sk),
                  "equip": [f"{e['name']} ({e['note']})" if e["note"] else e["name"] for e in eq]},
        "summary": f"{R.CLASS_LABEL.get(ctype, '')} · abilità {sk.get('name')} · stat {'/'.join(map(str, lst(d.get('keyStats'))))}",
    }


# ======================================================================
# 3. RAZZA (deciso: statistiche e talenti razziali liberi, senza limiti fissi)
# ======================================================================
def _race_mods(d: dict) -> dict:
    out: dict[str, float] = {}
    for r in lst(d.get("mods")):
        if isinstance(r, dict) and txt(r.get("code")) and as_num(r.get("val")) is not None:
            k = txt(r.get("code")).upper()
            out[k] = R.clean(out.get(k, 0) + (as_num(r.get("val")) or 0))
    return out


def race_check(d: dict, ctx: dict) -> list[str]:
    name = txt(d.get("name"))
    s0 = ("dai un nome alla razza." if len(name) < 2
          else f"«{name}» esiste già nella libreria." if name_taken(ctx, "races", name)
          else "scegli l'origine o il regno." if not filled(d.get("origin"))
          else "" if filled(d.get("desc"), 10) else "scrivi una descrizione (almeno 10 caratteri).")
    tr = [t for t in lst(d.get("traits")) if isinstance(t, dict)]
    ok = [t for t in tr if filled(t.get("name"), 2) and filled(t.get("effect"), 5)]
    s1 = ("aggiungi almeno un talento razziale con nome ed effetto." if not ok
          else "completa o togli i talenti a metà."
          if any((filled(t.get("name")) or filled(t.get("effect"))) and not (filled(t.get("name"), 2) and filled(t.get("effect"), 5)) for t in tr)
          else "")
    s2 = ""
    seen = set()
    for i, r in enumerate(lst(d.get("mods"))):
        r = dct(r)
        code = txt(r.get("code")).upper()
        if not re.fullmatch(r"[A-Z]{2,5}", code):
            s2 = f"riga {i + 1}: scegli la statistica."
            break
        if code in seen:
            s2 = f"{code} compare due volte: somma i valori in una riga."
            break
        seen.add(code)
        if as_int(r.get("val"), -99999, 99999) is None:
            s2 = f"{code}: scrivi un intero (anche negativo)."
            break
    s3 = ("indica almeno una lingua." if not filled(d.get("langs"), 2)
          else "indica la durata della vita in anni (intero ≥ 1)." if as_int(d.get("life"), 1, 100000) is None
          else "dai un nome a ogni razza nei rapporti, o togli la riga."
          if any(not filled(dct(r).get("race"), 2) for r in lst(d.get("rel"))) else "")
    return [s0, s1, s2, s3]


def race_compute(d: dict, ctx: dict) -> dict:
    mods = _race_mods(d)
    race = {"stats": R.race_level1_stats(mods)}
    human = {"stats": R.race_level1_stats({})}
    rv = {x["key"]: x for x in R.derived(race)}
    hv = {x["key"]: x for x in R.derived(human)}
    return {"mods": mods, "level1": [{"key": k, "label": rv[k]["label"], "fmt": rv[k]["fmt"], "value": rv[k]["value"],
                                      "human": hv[k]["value"], "formula": rv[k]["formula"], "explain": rv[k]["explain"]}
                                     for k in R.RACE_PREVIEW_KEYS]}


def race_build(d: dict, ctx: dict) -> dict:
    traits = [{"name": txt(t.get("name")), "effect": txt(t.get("effect"))} for t in lst(d.get("traits")) if isinstance(t, dict) and filled(t.get("name"))]
    mods = {k: v for k, v in _race_mods(d).items() if v}
    ms = ", ".join(f"{k} {signed(v)}" for k, v in mods.items()) or "nessun modificatore"
    life = as_int(d.get("life"), 1, 100000) or 0
    return {
        "name": txt(d.get("name")), "origin": txt(d.get("origin")), "originNote": txt(d.get("originNote")), "desc": txt(d.get("desc")),
        "acquire": txt(d.get("acquire")), "traits": traits, "mods": mods,
        "langs": [s.strip() for s in txt(d.get("langs")).split(",") if s.strip()], "lifespan": life,
        "relations": [{"race": txt(dct(r).get("race")), "rel": dct(r).get("rel") or "Neutrali"} for r in lst(d.get("rel")) if filled(dct(r).get("race"))],
        "summary": f"{txt(d.get('origin'))} · {len(traits)} talenti razziali · {ms} · vita {R.fmt_n(life)} anni",
    }


# ======================================================================
# 4. TITOLO (deciso: l'evoluzione sostituisce il precedente e ne toglie i bonus)
# ======================================================================
def known_titles(ctx: dict) -> list[dict]:
    seen: dict[str, str] = {}
    for t in lib(ctx, "titles"):
        seen.setdefault(t["name"], t.get("rarity", "Comune"))
    for c in ctx.get("chars") or []:
        for t in c["titles"]:
            if txt(t.get("name")):
                seen.setdefault(t["name"], t.get("rarity") or "Comune")
    return [{"name": k, "rarity": v} for k, v in seen.items()]


def _incompat(d: dict) -> list[str]:
    free = [s.strip() for s in txt(d.get("incompatFree")).split(",") if s.strip()]
    return list(dict.fromkeys([*map(str, lst(d.get("incompat"))), *free]))


def _title_clash(d: dict, c: dict | None) -> str:
    if not c:
        return ""
    has = [t.get("name") for t in c["titles"]]
    name = txt(d.get("name"))
    if any(txt(n).lower() == name.lower() for n in has):
        return f"{c['name']} ha già il titolo «{name}»."
    bad = [n for n in _incompat(d) if n in has and n != d.get("prev")]
    return f"{c['name']} ha «{'», «'.join(bad)}», incompatibile con questo titolo." if bad else ""


def title_check(d: dict, ctx: dict) -> list[str]:
    name = txt(d.get("name"))
    s0 = ("dai un nome al titolo." if len(name) < 2
          else f"«{name}» esiste già nella libreria." if name_taken(ctx, "titles", name)
          else "scegli la rarità." if d.get("rarity") not in R.RARITIES
          else "" if filled(d.get("how"), 5) else "scrivi come si ottiene, in una frase.")
    rows = [dct(b) for b in lst(d.get("bonus"))]
    s1 = ""
    if any(not txt(b.get("code")) for b in rows):
        s1 = "scegli la statistica di ogni bonus."
    elif any(as_int(b.get("val"), -999, 999) in (None, 0) for b in rows):
        s1 = "ogni bonus vuole un valore intero diverso da 0 (o togli la riga)."
    elif d.get("effType") in ("passivo", "attivo") and not filled(d.get("effText"), 5):
        s1 = f"descrivi l'effetto {d.get('effType')}."
    elif not rows and d.get("effType") in (None, "", "nessuno") and not filled(d.get("unlocks")):
        s1 = "un titolo deve dare almeno un bonus, un effetto o una stat sbloccata."
    s2 = ("descrivi l'azione scatenante." if not filled(d.get("trigger"), 5)
          else "un titolo segreto vuole il momento in cui si rivela." if d.get("secret") and not filled(d.get("reveal"), 5) else "")
    s3 = ("precedente e successivo non possono coincidere." if d.get("prev") and d.get("prev") == d.get("next")
          else "il titolo non può evolvere da sé stesso." if d.get("prev") and d.get("prev") == name
          else "scrivi la condizione per evolvere nel titolo successivo." if d.get("next") and not filled(d.get("evoCond"), 5) else "")
    c = char_by_id(ctx, d.get("charId"))
    s4 = "personaggio non trovato." if d.get("charId") not in (None, "") and c is None else _title_clash(d, c)
    return [s0, s1, s2, s3, s4]


def title_compute(d: dict, ctx: dict) -> dict:
    bonus = R.expand_title_bonus([dct(b) for b in lst(d.get("bonus"))])
    c = char_by_id(ctx, d.get("charId"))
    out: dict = {"bonus": bonus, "known": known_titles(ctx), "incompat": _incompat(d),
                 "acq": R.TITLE_ACQ.get(d.get("rarity") or ""), "example": R.TITLE_EX.get(d.get("rarity") or ""),
                 "char": char_brief(c), "assign": None}
    if c:
        out["assign"] = {**title_delta(bonus, d.get("prev"), c), "clash": _title_clash(d, c)}
    return out


def title_delta(bonus: dict, prev_name: str | None, c: dict) -> dict:
    """Variazioni della colonna «Titoli» se il PG riceve il titolo (togliendo il precedente se è un'evoluzione)."""
    prev = next((t for t in c["titles"] if prev_name and t.get("name") == prev_name), None)
    delta = dict(bonus)
    for k, v in (dct(prev.get("bonus")) if prev else {}).items():
        delta[k] = R.clean(delta.get(k, 0) - R.num(v))
    lines = []
    for k, v in delta.items():
        if not v:
            continue
        row = next((r for r in c["stats"] if r.get("code") == k), None)
        if row is None:
            lines.append({"code": k, "missing": True, "delta": v})
            continue
        before = R.num(row.get("titoli"))
        tot = R.stat_total(row)
        lines.append({"code": k, "missing": False, "delta": v, "before": R.clean(before), "after": R.clean(before + v),
                      "total_before": tot, "total_after": R.clean(tot + v)})
    return {"replaces": prev["name"] if prev else None, "lines": lines}


def title_build(d: dict, ctx: dict) -> dict:
    c = char_by_id(ctx, d.get("charId"))
    bonus = R.expand_title_bonus([dct(b) for b in lst(d.get("bonus"))])
    eff = d.get("effType") if d.get("effType") in ("passivo", "attivo") else None
    return {
        "name": txt(d.get("name")), "rarity": d.get("rarity"), "how": txt(d.get("how")), "bonus": bonus,
        "bonusRows": [{"code": dct(b).get("code"), "val": as_int(dct(b).get("val"), -999, 999)} for b in lst(d.get("bonus"))],
        "effect": {"type": eff, "text": txt(d.get("effText"))} if eff else None, "unlocks": txt(d.get("unlocks")),
        "trigger": txt(d.get("trigger")), "context": txt(d.get("context")), "witnesses": txt(d.get("witnesses")),
        "secret": bool(d.get("secret")), "reveal": txt(d.get("reveal")) if d.get("secret") else "",
        "incompatible": _incompat(d), "prev": d.get("prev") or None, "next": d.get("next") or None,
        "evoCond": txt(d.get("evoCond")) if d.get("next") else "", "assignedTo": c["id"] if c else None,
        "summary": f"{d.get('rarity')} · {', '.join(f'{k} {signed(v)}' for k, v in bonus.items()) or 'nessun bonus'}"
                   + (" · segreto" if d.get("secret") else "") + (f" · assegnato a {c['name']}" if c else ""),
    }


def title_apply(e: dict, pg: dict) -> list[str]:
    res = R.assign_title(pg["stats"], pg["titles"], e, e.get("prev"))
    msgs = [f"{pg['name']}: nuovo titolo «{e['name']}» ({e['rarity']})."]
    if res["replaced"]:
        msgs.append(f"Sostituisce «{res['replaced']}»: i suoi bonus sono stati tolti.")
    if res["missing"]:
        msgs.append(f"Bonus ignorati (statistica assente): {', '.join(res['missing'])}.")
        e["summary"] += f" (ignorati: {', '.join(res['missing'])})"
    return msgs


# ======================================================================
# 5. PNG
# ======================================================================
def npc_check(d: dict, ctx: dict) -> list[str]:
    s0 = ("dai un nome al PNG." if not filled(d.get("name"), 2)
          else "il livello va da 1 a 999." if as_int(d.get("level"), 1, 999) is None
          else "indica la razza." if not filled(d.get("race"), 2)
          else "indica dove si trova." if not filled(d.get("place"), 2)
          else "" if filled(d.get("role"), 2) else "indica il ruolo.")
    s1 = ("scrivi i tratti dominanti." if not filled(d.get("traits"), 3)
          else "" if filled(d.get("speech"), 3) else "descrivi come parla.")
    s2 = ("scrivi almeno l'origine o un evento formativo." if not filled(d.get("origin"), 3) and not filled(d.get("events"), 3)
          else "indica almeno un obiettivo (breve o lungo termine)." if not filled(d.get("goalShort"), 3) and not filled(d.get("goalLong"), 3)
          else "")
    s3 = ("scegli la fiducia iniziale." if d.get("trust") not in R.TRUST_LEVELS
          else "" if filled(d.get("knows"), 3) else "scrivi cosa sa dei PG (anche «Niente»).")
    return [s0, s1, s2, s3, ""]


def npc_compute(d: dict, ctx: dict) -> dict:
    lv = as_int(d.get("level"), 1, 999)
    return {"rank": R.power_rank(lv) if lv else None, "creature": R.creature(lv or 0, "Comune", d.get("size") or "Normale")}


def npc_build(d: dict, ctx: dict) -> dict:
    t = lambda k: txt(d.get(k))
    lv = as_int(d.get("level"), 1, 999) or 1
    k = R.creature(lv, "Comune", d.get("size") or "Normale")
    npc = {
        "name": t("name"), "level": lv, "race": t("race"), "place": t("place"), "role": t("role"), "trust": d.get("trust") or "Neutrale",
        "knows": t("knows"), "debts": t("debts") or "—", "secret": t("secret") or "—", "kingdom": t("kingdom"), "age": t("age"),
        "personality": {"traits": t("traits"), "speech": t("speech"), "motives": t("motives"), "fears": t("fears"), "habits": t("habits")},
        "background": {"origin": t("origin"), "events": t("events"), "relations": t("relations")},
        "goals": {"short": t("goalShort"), "long": t("goalLong"), "conflict": t("conflict")},
        "resources": {"skills": t("skills"), "influence": t("influence"), "wealth": t("wealth"), "connections": t("connections")},
        "combat": {"rarity": "Comune", "size": d.get("size") or "Normale", "hp": k["hp"], "dmg": k["dmg"]} if d.get("fight") else None,
    }
    return {"name": npc["name"], "npc": npc,
            "summary": f"Lv {lv} · {npc['race']} · {npc['role']} · {npc['place']} · fiducia {npc['trust']}"}


# ======================================================================
# 6. INCONTRO
# ======================================================================
def _creatures(d: dict) -> list[dict]:
    return [dct(c) for c in lst(d.get("creatures"))]


def valid_creatures(d: dict) -> list[dict]:
    out = []
    for c in _creatures(d):
        lv, n = as_int(c.get("level"), 1, 999), as_int(c.get("count"), 1, 99)
        if filled(c.get("name")) and lv and n:
            out.append({"name": txt(c.get("name")), "level": lv, "count": n,
                        "rarity": c.get("rarity") if c.get("rarity") in R.RARITIES else "Comune",
                        "size": c.get("size") if c.get("size") in [s["v"] for s in R.SIZES] else "Normale"})
    return out


def _party(d: dict, ctx: dict) -> list[dict]:
    ids = {as_int(x, 1, 10 ** 9) for x in lst(d.get("party"))}
    return [c for c in ctx.get("chars") or [] if c["id"] in ids]


def avg_level(chars: list[dict]) -> int:
    return R.js_round(sum(c["level"] for c in chars) / len(chars)) if chars else 1


def encounter_check(d: dict, ctx: dict) -> list[str]:
    s0 = ("dai un nome all'incontro." if not filled(d.get("name"), 2)
          else "" if filled(d.get("place"), 2) else "indica il luogo.")
    s1 = ("scegli almeno un PG che partecipa." if not _party(d, ctx)
          else "" if as_int(d.get("level"), 1, 999) else "il livello del gruppo va da 1 a 999.")
    s2 = ""
    cs = _creatures(d)
    if not cs:
        s2 = "aggiungi almeno una creatura."
    for i, c in enumerate(cs):
        if not filled(c.get("name")):
            s2 = f"la creatura {i + 1} non ha un nome."
        elif as_int(c.get("level"), 1, 999) is None:
            s2 = f"livello della creatura {i + 1}: da 1 a 999."
        elif as_int(c.get("count"), 1, 99) is None:
            s2 = f"numero della creatura {i + 1}: da 1 a 99."
        elif c.get("rarity") not in R.RARITIES:
            s2 = f"rarità della creatura {i + 1} non valida."
        if s2:
            break
    s3 = "" if d.get("masterDiff") in (None, "", *R.DIFFICULTY_LABELS) else "difficoltà del Master non valida."
    return [s0, s1, s2, s3]


def encounter_compute(d: dict, ctx: dict) -> dict:
    cs = valid_creatures(d)
    pcs = _party(d, ctx)
    lv = as_int(d.get("level"), 1, 999) or 1
    rows = [{**R.creature(c.get("level"), c.get("rarity") if c.get("rarity") in R.RARITIES else "Comune", c.get("size")), "i": i}
            for i, c in enumerate(_creatures(d))]
    powers = [{"id": p["id"], "name": p["name"], "level": p["level"], **R.pg_power(p["ri"], p["level"])} for p in pcs]
    diff = R.difficulty(cs, powers) if cs and pcs else None
    top = R.top_rarity(cs)
    return {
        "creatures": rows, "valid": len(cs), "avg_level": avg_level(pcs), "party": [char_brief(p) for p in pcs],
        "difficulty": diff, "powers": [{**p, "dmg": R.clean(round(p["dmg"], 2))} for p in powers],
        "exp": R.exp_for(lv, cs), "exp_by_pc": [{"id": p["id"], "name": p["name"], "level": p["level"], "pct": R.exp_for(p["level"], cs)["pct"]} for p in pcs],
        "top_rarity": top, "weapon_base_range": R.weapon_base_range(top),
        "master_tone": R.difficulty_tone(d.get("masterDiff")) if d.get("masterDiff") else None,
    }


def encounter_build(d: dict, ctx: dict) -> dict:
    cs = [{**c, "hp": R.creature(c["level"], c["rarity"], c["size"])["hp"], "dmg": R.creature(c["level"], c["rarity"], c["size"])["dmg"]}
          for c in valid_creatures(d)]
    pcs = _party(d, ctx)
    powers = [R.pg_power(p["ri"], p["level"]) for p in pcs]
    diff = R.difficulty(cs, powers)
    lv = as_int(d.get("level"), 1, 999) or 1
    exp = R.exp_for(lv, cs)
    top = R.top_rarity(cs)
    label = d.get("masterDiff") or diff["label"]
    profile = d.get("drop") if isinstance(d.get("drop"), dict) else None
    n_cr = sum(c['count'] for c in cs)
    return {
        "name": txt(d.get("name")), "place": txt(d.get("place")), "env": d.get("env") or "", "conditions": txt(d.get("conditions")),
        "party": [p["id"] for p in pcs], "level": lv, "creatures": cs,
        "difficulty": {"label": label, "estimate": diff["label"], "ratio": diff["ratio"], "byMaster": bool(d.get("masterDiff"))},
        "expPct": exp["pct"], "expByPc": {str(p["id"]): R.exp_for(p["level"], cs)["pct"] for p in pcs},
        "loot": {"rarity": top, "weaponBase": list(R.rarity_info(top)["weapon_base"]), "profile": profile, "note": txt(d.get("lootNote"))},
        "hooks": txt(d.get("hooks")),
        "summary": f"{txt(d.get('place'))} · {n_cr} {'creatura' if n_cr == 1 else 'creature'} · {label}{'' if d.get('masterDiff') else ' (stima)'}"
                   f" · EXP {R.fmt_it(exp['pct'])}% a lv {lv}",
    }


# ======================================================================
# 7. INCANTESIMO
# ======================================================================
def _spheres(d: dict) -> list[dict]:
    return [{"s": dct(x).get("s"), "role": txt(dct(x).get("role")), "trav": bool(dct(x).get("trav"))} for x in lst(d.get("spheres"))]


def _levels(d: dict) -> dict:
    env = dct(d.get("env"))
    lvl = as_int(d.get("level"), 1, R.SPELL_MAX_LEVEL)
    return R.spell_levels(_spheres(d), lvl or 0, [str(m) for m in lst(d.get("meta"))], env.get("zone") or "", env.get("ley") or 0)


def _pick(v: Any, default: Any) -> Any:
    return default if v is None else v


def _spell_vals(d: dict) -> dict:
    L = _levels(d)
    combo = bool(d.get("combo"))
    sugg = {"cost": R.spell_cost(L["cast"], combo), "cd": R.spell_cd(L["cast"])}
    return {"L": L, "sugg": sugg, "cost": _pick(d.get("cost"), sugg["cost"]), "cd": _pick(d.get("cd"), sugg["cd"]),
            "turns": R.cast_turns(L["cast"], combo)}


def _spell_char(d: dict, ctx: dict) -> dict | None:
    return char_by_id(ctx, d.get("charId"))


def _spell_state(d: dict, ctx: dict) -> dict:
    V = _spell_vals(d)
    c = _spell_char(d, ctx)
    origin = next((o for o in R.SPELL_ORIGINS if o["key"] == d.get("origin")), None)
    reqs = R.sphere_reqs(_spheres(d), V["L"]["cast"], bool(d.get("combo")), c["skills"] if c else None)
    risk = dct(d.get("risk"))
    ov = risk.get("overcast") or "auto"
    over_auto = bool(c) and any(r["status"] != "ok" for r in reqs)
    over = over_auto if ov == "auto" else ov == "si"
    B = R.backlash(_spheres(d), V["L"]["cast"], risk, bool(dct(d.get("env")).get("anti")), over)
    mm = c["derived"].get("moltMag", 1) if c else 1
    E = R.spell_effect(d.get("category") or "", V["L"]["eff"], len(_spheres(d)), mm, [str(m) for m in lst(d.get("meta"))])
    return {"V": V, "char": c, "origin": origin, "reqs": reqs, "missing": [r for r in reqs if r["status"] == "missing"],
            "can_skill": bool(origin and origin["skill"]), "overcast_auto": over_auto, "backlash": B, "effect": E}


def spell_check(d: dict, ctx: dict) -> list[str]:
    name = txt(d.get("name"))
    s0 = ("Dai un nome all'incantesimo (almeno 2 caratteri)." if len(name) < 2
          else "Nome troppo lungo: massimo 40 caratteri." if len(name) > 40
          else "Descrivi l'effetto dichiarato dal giocatore." if not filled(d.get("effect"), 5)
          else "Scegli la categoria." if d.get("category") not in [c["key"] for c in R.SPELL_CATEGORIES]
          else "Scegli l'origine." if d.get("origin") not in [o["key"] for o in R.SPELL_ORIGINS] else "")
    sph = _spheres(d)
    keys = [x["s"] for x in sph]
    s1 = ("Scegli almeno una sfera." if not sph
          else "Al massimo tre sfere." if len(sph) > 3
          else "Sfera sconosciuta." if any(k not in R.SPHERE_KEYS for k in keys)
          else "Ogni sfera una sola volta." if len(set(keys)) != len(keys) else "")
    if not s1:
        empty = next((x for x in sph if not x["role"]), None)
        s1 = f"Indica il ruolo di {empty['s']} (es. forma, innesco)." if empty else ""
    lvl = as_int(d.get("level"), 1, R.SPELL_MAX_LEVEL)
    L = _levels(d)
    s2 = ("Il livello base va da 1 a 10." if lvl is None
          else f"Livello di lancio {L['cast']}: oltre 10. Togli metamagia o abbassa il livello." if L["cast"] > R.SPELL_MAX_LEVEL else "")
    V = _spell_vals(d)
    risk = dct(d.get("risk"))
    s3 = ("Il costo Mana deve essere un intero ≥ 1." if as_int(V["cost"], 1, 10 ** 7) is None
          else "La ricarica deve essere un intero ≥ 0." if as_int(V["cd"], 0, 999) is None
          else "Protezioni: da 0 a 5." if as_int(risk.get("protections", 0), 0, 5) is None else "")
    s4 = ""
    if d.get("assign"):
        A = _spell_state(d, ctx)
        if not A["char"]:
            s4 = "Nessun PG da assegnare."
        elif A["can_skill"] and A["missing"] and not d.get("force"):
            miss = ", ".join(f"{r['s']} Grado {R.ROMAN[r['need']]}" for r in A["missing"])
            s4 = f"{A['char']['name']} non possiede {miss}: forza o togli l'assegnazione."
    return [s0, s1, s2, s3, s4]


def spell_compute(d: dict, ctx: dict) -> dict:
    A = _spell_state(d, ctx)
    c = A["char"]
    pairs = R.compat_pairs([x["s"] for x in _spheres(d) if x["s"] in R.SPHERE_KEYS])
    return {
        "levels": A["V"]["L"], "sugg": A["V"]["sugg"], "cost": A["V"]["cost"], "cd": A["V"]["cd"], "turns": A["V"]["turns"],
        "backlash": A["backlash"], "effect": A["effect"], "reqs": A["reqs"], "missing": len(A["missing"]),
        "overcast_auto": A["overcast_auto"], "can_skill": A["can_skill"], "pairs": pairs, "worst": R.worst_pair(pairs),
        "meta_names": R.spell_meta_names([str(m) for m in lst(d.get("meta"))]),
        "char": {**char_brief(c), "mp": c["derived"].get("mp", 0), "molt_mag": c["derived"].get("moltMag", 1),
                 "mage": "mago" in txt(c["classe"]).lower()} if c else None,
        "name_taken": name_taken(ctx, "spells", d.get("name")),
        "ley_surge": next((x["surge"] for x in R.LEY_LINES if x["v"] == A["V"]["L"]["ley"]), 0),
    }


def spell_build(d: dict, ctx: dict) -> dict:
    A = _spell_state(d, ctx)
    V, B = A["V"], A["backlash"]
    assign = bool(d.get("assign") and A["can_skill"] and A["char"])
    sph = _spheres(d)
    cat = next((c["name"] for c in R.SPELL_CATEGORIES if c["key"] == d.get("category")), "")
    return {
        "name": txt(d.get("name")),
        "summary": f"Lv {V['L']['cast']} · {'+'.join(x['s'] for x in sph)} · {R.fmt_n(V['cost'])} MP · {cat} · backlash {B['band']}",
        "type": "Incantesimo", "effect": txt(d.get("effect")), "category": d.get("category"), "origin": d.get("origin"),
        "spheres": [{"sphere": x["s"], "role": x["role"], "traverso": x["trav"]} for x in sph], "combo": bool(d.get("combo")),
        "level": V["L"]["base"], "castLevel": V["L"]["cast"], "efficacy": V["L"]["eff"],
        "metamagic": R.spell_meta_names([str(m) for m in lst(d.get("meta"))]), "env": dct(d.get("env")),
        "cost": int(V["cost"]), "castTurns": V["turns"], "cd": int(V["cd"]),
        "backlash": {"score": B["score"], "band": B["band"]}, "assignedTo": A["char"]["id"] if assign else None,
        "forced": bool(assign and A["missing"]),
        "mech": mech_final(d, "incantesimo", int(V["cost"]), "MP", int(V["cd"]), [x["s"] for x in sph]),
    }


def spell_apply(e: dict, pg: dict) -> list[str]:
    pg["active_skills"].append({"name": e["name"], "effect": e["effect"], "lvl": 1, "pct": 1, "cost": f"{e['cost']} MP",
                                "cd": e["cd"], "kind": "Incantesimo", "spheres": [x["sphere"] for x in e["spheres"]],
                                "category": e.get("category"), "efficacia": e.get("efficacy"),
                                **({"mech": e["mech"]} if e.get("mech") else {})})
    return [f"Aggiunto al grimorio di {pg['name']}: Grado I · 1%."]


# ======================================================================
# 8. MIRACOLO
# ======================================================================
def _god(d: dict) -> dict | None:
    return next((g for g in R.GODS if g["key"] == d.get("god")), None)


def _miracle_vals(d: dict) -> dict:
    L = as_int(d.get("level"), 1, R.SPELL_MAX_LEVEL) or 0
    god = _god(d)
    affine = bool(god and d.get("nature") in god["affine"])
    sugg = {"fede": R.miracle_fede(L), "favor": R.favor_required(L, affine), "cost": R.miracle_cost(L), "cd": R.spell_cd(L)}
    return {"L": L, "god": god, "affine": affine, "sugg": sugg, "fede": _pick(d.get("fede"), sugg["fede"]),
            "favor": _pick(d.get("favor"), sugg["favor"]), "cost": _pick(d.get("cost"), sugg["cost"]), "cd": _pick(d.get("cd"), sugg["cd"])}


def _vows(d: dict) -> list[str]:
    god = _god(d)
    own = [str(v) for v in lst(d.get("vows")) if god and v in god["vows"]]
    return own + [s.strip() for s in txt(d.get("customVows")).split("\n") if s.strip()]


def _miracle_state(d: dict, ctx: dict) -> dict:
    V = _miracle_vals(d)
    c = char_by_id(ctx, d.get("charId"))
    fede = R.char_fede(c["stats"]) if c else 0
    fav = R.char_favor(c["reputation"], V["god"]["name"]) if c and V["god"] else {"v": 0, "recorded": False}
    need = as_int(V["favor"], -3, 4) or 0
    issues = []
    if c and not R.is_cleric(c["classe"]):
        issues.append(f"{c['name']} non è un chierico ({c['classe'] or '—'})")
    if c and as_int(V["fede"], 0, 10 ** 7) is not None and fede < V["fede"]:
        issues.append(f"Fede {R.fmt_n(fede)} su {R.fmt_n(V['fede'])} richiesta")
    if c and V["god"] and fav["v"] < need:
        issues.append(f"favore di {V['god']['name']}: {R.favor_name(fav['v'])}, serve {R.favor_name(need)}")
    P = R.miracle_power(d.get("nature") or "", V["L"], fede, fav["v"], need)
    return {"V": V, "char": c, "fede": fede, "fav": fav, "need": need, "issues": issues, "power": P}


def miracle_check(d: dict, ctx: dict) -> list[str]:
    s0 = "" if _god(d) else "Scegli la divinità che concede il miracolo."
    name = txt(d.get("name"))
    s1 = ("Dai un nome al miracolo (almeno 2 caratteri)." if len(name) < 2
          else "Nome troppo lungo: massimo 40 caratteri." if len(name) > 40
          else "Scegli la natura del miracolo." if d.get("nature") not in [n["key"] for n in R.MIRACLE_NATURES]
          else "" if filled(d.get("effect"), 5) else "Descrivi l'effetto del miracolo.")
    V = _miracle_vals(d)
    s2 = ("Il livello va da 1 a 10." if not V["L"]
          else "La Fede richiesta deve essere un intero ≥ 0." if as_int(V["fede"], 0, 10 ** 7) is None
          else "Il favore richiesto va da −3 a +4." if as_int(V["favor"], -3, 4) is None
          else "Il costo Mana deve essere un intero ≥ 1." if as_int(V["cost"], 1, 10 ** 7) is None
          else "La ricarica deve essere un intero ≥ 0." if as_int(V["cd"], 0, 999) is None else "")
    s3 = ("Indica almeno una condizione, un voto o un tabù del dio." if not _vows(d)
          else "" if d.get("against") in [a["key"] for a in R.MIRACLE_AGAINST] else "Scegli cosa succede se usato contro la volontà del dio.")
    s4 = ""
    if d.get("assign"):
        A = _miracle_state(d, ctx)
        if not A["char"]:
            s4 = "Nessun PG da assegnare."
        elif A["issues"] and not d.get("force"):
            s4 = f"{cap(A['issues'][0])}: forza o togli l'assegnazione."
    return [s0, s1, s2, s3, s4]


def miracle_compute(d: dict, ctx: dict) -> dict:
    A = _miracle_state(d, ctx)
    V, c = A["V"], A["char"]
    return {
        "level": V["L"], "affine": V["affine"], "sugg": V["sugg"], "fede": V["fede"], "favor": V["favor"], "cost": V["cost"], "cd": V["cd"],
        "favor_name": R.favor_name(V["favor"]), "sugg_favor_name": R.favor_name(V["sugg"]["favor"]),
        "power": A["power"], "char_fede": A["fede"], "char_favor": A["fav"], "char_favor_name": R.favor_name(A["fav"]["v"]),
        "issues": A["issues"], "vows": _vows(d), "name_taken": name_taken(ctx, "miracles", d.get("name")),
        "char": {**char_brief(c), "mp": c["derived"].get("mp", 0), "cleric": R.is_cleric(c["classe"])} if c else None,
    }


def miracle_build(d: dict, ctx: dict) -> dict:
    A = _miracle_state(d, ctx)
    V = A["V"]
    nat = next(n for n in R.MIRACLE_NATURES if n["key"] == d.get("nature"))
    assign = bool(d.get("assign") and A["char"])
    return {
        "name": txt(d.get("name")),
        "summary": f"{V['god']['name']} · {nat['name']} · Lv {V['L']} · {R.fmt_n(V['cost'])} MP · Fede {R.fmt_n(V['fede'])} · {R.favor_name(V['favor'])}",
        "type": "Miracolo", "god": V["god"]["name"], "domain": V["god"]["domain"], "nature": d.get("nature"), "effect": txt(d.get("effect")),
        "level": V["L"], "fede": int(V["fede"]), "favor": int(V["favor"]), "favorName": R.favor_name(V["favor"]),
        "cost": int(V["cost"]), "cd": int(V["cd"]), "vows": _vows(d), "against": d.get("against"), "againstNote": txt(d.get("againstNote")),
        "assignedTo": A["char"]["id"] if assign else None, "forced": bool(assign and A["issues"]),
        "mech": mech_final(d, "miracolo", int(V["cost"]), "MP", int(V["cd"]), [V["god"]["name"]]),
    }


def miracle_apply(e: dict, pg: dict) -> list[str]:
    pg["active_skills"].append({"name": e["name"], "effect": e["effect"], "lvl": 1, "pct": 1, "cost": f"{e['cost']} MP",
                                "cd": e["cd"], "kind": "Miracolo", "god": e["god"], "efficacia": e.get("level"),
                                **({"mech": e["mech"]} if e.get("mech") else {})})
    return [f"Assegnato a {pg['name']}: Grado I · 1%."]


# ======================================================================
# 9. OGGETTO (inventario MMORPG: tipo → slot, bonus alle statistiche e alle derivate, requisiti)
# ======================================================================
ITEM_BONUS_KEYS = list(dict.fromkeys([*R.EQUIP_FORMULA_KEYS, *R.DERIVED_KEYS]))


def item_bonus_options() -> list[dict]:
    labels = {d["key"]: d["label"] for d in R.DERIVED}
    labels.update({"difesa": "Difesa (equip)", "difesaMagica": "Difesa magica (equip)", "blocco": "Blocco scudo (equip)"})
    return [{"v": k, "l": labels.get(k, k)} for k in ITEM_BONUS_KEYS]


def _rows_map(rows: Any, key: str = "code") -> dict:
    out: dict[str, float] = {}
    for r in lst(rows):
        r = dct(r)
        k = txt(r.get(key))
        v = as_num(r.get("val"))
        if k and v:
            out[k] = R.clean(out.get(k, 0) + v)
    return out


def _item(d: dict) -> dict:
    req = _rows_map(d.get("req"))
    lv = as_int(d.get("reqLevel"), 1, 999)
    if lv:
        req = {"level": lv, **req}
    et = d.get("equip_type") if d.get("equip_type") in R.EQUIP_TYPES else None
    raw = {"name": txt(d.get("name")) or "Oggetto", "rarity": d.get("rarity") or "Comune", "type": txt(d.get("type")),
           "equip_type": et, "stats": _rows_map(d.get("stats")), "bonus": _rows_map(d.get("bonus"), "key"), "req": req,
           "weapon_base": as_num(d.get("weapon_base")) or None, "weight": as_num(d.get("weight")) or 0,
           "qty": as_int(d.get("qty"), 1, 99999) or 1, "desc": txt(d.get("desc")) or None, "stats_text": txt(d.get("stats_text"))}
    it = R.normalize_item(raw)
    if not it["stats_text"]:
        parts = [R.EQUIP_TYPES[et]["label"]] if et else []
        if it["weapon_base"]:
            parts.append(f"Base {R.fmt_n(it['weapon_base'])}")
        parts += [f"{k} {signed(v)}" for k, v in it["stats"].items()]
        labels = {o["v"]: o["l"] for o in item_bonus_options()}
        parts += [f"{labels.get(k, k)} {signed(v)}" for k, v in it["bonus"].items()]
        it["stats_text"] = " · ".join(parts)
    return it


def item_check(d: dict, ctx: dict) -> list[str]:
    s0 = ("dai un nome all'oggetto (almeno 2 caratteri)." if not filled(d.get("name"), 2)
          else "scegli la rarità." if d.get("rarity") not in R.RARITIES
          else "indica il tipo (es. Arma, Armatura, Pozione)." if not filled(d.get("type"), 2)
          else "tipo di equipaggiamento sconosciuto." if d.get("equip_type") not in (None, "", *R.EQUIP_TYPES) else "")
    s1 = ""
    if d.get("weapon_base") not in (None, "") and (as_num(d.get("weapon_base")) is None or as_num(d.get("weapon_base")) < 0):
        s1 = "la Base danno dell'arma è un numero ≥ 0, o lasciala vuota."
    for i, r in enumerate(lst(d.get("stats"))):
        r = dct(r)
        if s1:
            break
        if not re.fullmatch(r"[A-Z]{2,5}", txt(r.get("code"))):
            s1 = f"statistica {i + 1}: scegli il codice."
        elif as_int(r.get("val"), -99999, 99999) in (None, 0):
            s1 = f"{txt(r.get('code'))}: un intero diverso da 0, o togli la riga."
    for i, r in enumerate(lst(d.get("bonus"))):
        r = dct(r)
        if s1:
            break
        if r.get("key") not in ITEM_BONUS_KEYS:
            s1 = f"bonus {i + 1}: scegli il valore derivato."
        elif as_num(r.get("val")) in (None, 0):
            s1 = f"bonus {i + 1}: un numero diverso da 0, o togli la riga."
    s2 = ""
    if d.get("reqLevel") not in (None, "") and as_int(d.get("reqLevel"), 1, 999) is None:
        s2 = "il livello richiesto va da 1 a 999, o lascialo vuoto."
    for i, r in enumerate(lst(d.get("req"))):
        r = dct(r)
        if s2:
            break
        if not re.fullmatch(r"[A-Z]{2,5}", txt(r.get("code"))) or as_int(r.get("val"), 1, 99999) is None:
            s2 = f"requisito {i + 1}: statistica e valore minimo (intero ≥ 1)."
    if not s2 and (as_num(d.get("weight")) is None or (as_num(d.get("weight")) or 0) < 0):
        s2 = "il peso è un numero ≥ 0 (kg)."
    if not s2 and as_int(d.get("qty"), 1, 99999) is None:
        s2 = "la quantità è un intero ≥ 1."
    c = char_by_id(ctx, d.get("charId"))
    s3 = "personaggio non trovato." if d.get("charId") not in (None, "") and c is None else ""
    return [s0, s1, s2, s3]


def item_compute(d: dict, ctx: dict) -> dict:
    it = _item(d)
    c = char_by_id(ctx, d.get("charId"))
    et = R.EQUIP_TYPES.get(it["equip_type"] or "")
    return {"item": it, "slots": [R.SLOT_LABELS[s] for s in et["slots"]] if et else [],
            "two_handed": bool(et and et.get("two_handed")), "category": next((x["label"] for x in R.CATEGORIES if x["key"] == it["category"]), ""),
            "weapon_range": R.weapon_base_range(it["rarity"]), "char": char_brief(c),
            "unmet": R.unmet_requirements(c["ri"], it) if c else []}


def item_build(d: dict, ctx: dict) -> dict:
    it = _item(d)
    c = char_by_id(ctx, d.get("charId"))
    return {"name": it["name"], "rarity": it["rarity"], "item": it, "assignedTo": c["id"] if c else None,
            "summary": f"{it['rarity']} · {it['type']}{' · ' + it['stats_text'] if it['stats_text'] else ''}"
                       + (f" · a {c['name']}" if c else "")}


def item_apply(e: dict, pg: dict) -> list[str]:
    it = R.normalize_item({**e["item"], "id": R.new_item_id(), "slot": None})
    pg["inventory"].append(it)
    return [f"{pg['name']}: «{it['name']}» nella borsa{' (×' + str(it['qty']) + ')' if it['qty'] > 1 else ''}."]


# ======================================================================
# Assegnare a un PG una voce già nella libreria
# ======================================================================
ASSIGNABLE = ["titles", "items", "skills", "spells", "miracles"]


def assign_preview(kind: str, e: dict, c: dict) -> dict:
    """Esito dell'assegnazione di una voce della libreria al PG `c` (dict di contesto):
    {error, issues (servono force), lines/replaces (titoli), unmet (oggetti), text}."""
    out: dict = {"error": "", "issues": [], "lines": [], "replaces": None, "unmet": []}
    name = txt(e.get("name"))
    if kind == "titles":
        if any(txt(t.get("name")).lower() == name.lower() for t in c["titles"]):
            out["error"] = f"{c['name']} ha già il titolo «{name}»."
        bad = [n for n in lst(e.get("incompatible")) if n in [t.get("name") for t in c["titles"]] and n != e.get("prev")]
        if bad and not out["error"]:
            out["error"] = f"{c['name']} ha «{'», «'.join(bad)}», incompatibile con questo titolo."
        out.update(title_delta(dct(e.get("bonus")), e.get("prev"), c))
    elif kind == "skills":
        lst_ = c["active_skills"] if e.get("mode") == "attiva" else c["skills"]
        if any(txt(x.get("name")).lower() == name.lower() for x in lst_):
            out["error"] = f"{c['name']} ha già una skill chiamata «{name}»."
    elif kind == "spells":
        if any(txt(x.get("name")).lower() == name.lower() for x in c["active_skills"]):
            out["error"] = f"{c['name']} ha già «{name}» tra le skill attive."
        elif e.get("origin") == "improvvisato":
            out["error"] = "Un incantesimo improvvisato non diventa una skill."
        else:
            sph = [{"s": x.get("sphere")} for x in lst(e.get("spheres"))]
            reqs = R.sphere_reqs(sph, int(R.num(e.get("castLevel"))), bool(e.get("combo")), c["skills"])
            out["issues"] = [f"{c['name']} non possiede {r['s']} Grado {R.ROMAN[r['need']]}" for r in reqs if r["status"] == "missing"]
    elif kind == "miracles":
        if any(txt(x.get("name")).lower() == name.lower() for x in c["active_skills"]):
            out["error"] = f"{c['name']} ha già «{name}» tra le skill attive."
        else:
            god = next((g for g in R.GODS if g["name"] == e.get("god")), None)
            d = {"god": god["key"] if god else "", "level": e.get("level"), "fede": e.get("fede"), "favor": e.get("favor"),
                 "cost": e.get("cost"), "cd": e.get("cd"), "nature": e.get("nature"), "charId": c["id"]}
            out["issues"] = _miracle_state(d, {"chars": [c]})["issues"]
    elif kind == "items":
        out["unmet"] = R.unmet_requirements(c["ri"], dct(e.get("item")))
    else:
        out["error"] = "Questo tipo di voce non si assegna a un PG."
    return out


# ======================================================================
# Registro dei wizard
# ======================================================================
_SK = with_mech(skill_check, skill_compute)
_SP = with_mech(spell_check, spell_compute)
_MI = with_mech(miracle_check, miracle_compute)

WIZARDS: dict[str, dict[str, Any]] = {
    "skills": {"steps": ["Identità", "Effetto", "Gradi", "Ottenimento", "Meccanica", "Assegna"],
               "check": _SK[0], "compute": _SK[1], "build": skill_build, "apply": skill_apply},
    "classes": {"steps": ["Identità", "Sblocco", "Abilità iniziale", "Equipaggiamento e talenti"], "check": class_check,
                "compute": class_compute, "build": class_build, "apply": None},
    "races": {"steps": ["Identità", "Talenti razziali", "Statistiche", "Lingue e rapporti"], "check": race_check,
              "compute": race_compute, "build": race_build, "apply": None},
    "titles": {"steps": ["Identità", "Effetti", "Requisiti", "Evoluzione", "Assegna"], "check": title_check,
               "compute": title_compute, "build": title_build, "apply": title_apply},
    "npcs": {"steps": ["Anagrafica", "Personalità", "Background", "Rapporto con i PG", "Combattimento"], "check": npc_check,
             "compute": npc_compute, "build": npc_build, "apply": None},
    "encounters": {"steps": ["Scena", "Gruppo", "Creature", "Bottino e ganci"], "check": encounter_check,
                   "compute": encounter_compute, "build": encounter_build, "apply": None},
    "spells": {"steps": ["Concetto", "Sfere", "Potenza", "Costo e rischi", "Meccanica", "Anteprima"],
               "check": _SP[0], "compute": _SP[1], "build": spell_build, "apply": spell_apply},
    "miracles": {"steps": ["Divinità", "Natura", "Requisiti e costo", "Voti e tabù", "Meccanica", "Anteprima"],
                 "check": _MI[0], "compute": _MI[1], "build": miracle_build, "apply": miracle_apply},
    "items": {"steps": ["Identità", "Effetti", "Requisiti e peso", "Assegna"], "check": item_check,
              "compute": item_compute, "build": item_build, "apply": item_apply},
}


def preview(kind: str, draft: dict, ctx: dict) -> dict:
    w = WIZARDS[kind]
    steps = [cap(m) for m in w["check"](draft, ctx)]
    return {"kind": kind, "steps": steps, "first_bad": next((i for i, m in enumerate(steps) if m), -1),
            "computed": w["compute"](draft, ctx)}


def build(kind: str, draft: dict, ctx: dict) -> tuple[dict | None, str | None]:
    """Voce pronta da salvare, o (None, motivo) se un passo non è valido."""
    w = WIZARDS[kind]
    msgs = w["check"](draft, ctx)
    bad = next((i for i, m in enumerate(msgs) if m), -1)
    if bad != -1:
        return None, f"Passo {bad + 1} ({w['steps'][bad]}): {msgs[bad]}"
    return w["build"](draft, ctx), None


def apply_fn(kind: str) -> Callable[[dict, dict], list[str]] | None:
    return WIZARDS[kind]["apply"]
