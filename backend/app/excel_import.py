"""Import delle schede Excel STATISFY nel database.

Si leggono solo i VALORI delle celle (per le celle con formula, il valore calcolato salvato da Excel):
le formule dell'Excel non vengono portate, le derivate le ricalcola `rules.py`.
Ogni incoerenza trovata finisce nel report (`issues`), senza correggere i dati in silenzio.

Uso da riga di comando (dalla cartella backend):
  .venv\\Scripts\\python -m app.excel_import FILE.xlsx [FILE2.xlsx ...] [--dry-run] [--owner Nome=username]
"""
from __future__ import annotations

import argparse
import io
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import rules
from .models import Character, Issue, User

STAT_FIRST, STAT_LAST = 9, 24          # righe delle statistiche
HEADER_ROW = 8                          # intestazioni delle colonne delle statistiche
SOURCE_HEADERS = {"valore iniziale": "iniziale", "punti creazione": "creazione", "punti investiti": "investiti",
                  "punti level up": "levelup", "punti altro": "altro", "punti titoli": "titoli"}
GENERIC_TITLES = {"scheda personaggio - statisfy", "foglio di lavoro senza nome", ""}

# Etichette (normalizzate) delle derivate dell'Excel → chiave in rules.DERIVED
DERIVED_LABELS = {
    "moltiplicatore danno fisico": "moltFis", "capacita carico (kg)": "carico", "attacchi per turno": "attacchi",
    "precisione (%)": "precisione", "evasione (%)": "evasione", "velocita movimento (%)": "velocita",
    "punti vita (hp)": "hp", "rigenerazione (hp/min)": "regen", "resistenza veleni (%)": "resVeleni",
    "resistenza elementi (%)": "resElementi", "punti mana (mp)": "mp", "moltiplicatore danno magico": "moltMag",
    "bonus exp (%)": "bonusExp",
}
# Coefficienti del blocco «MANA E VITA» secondo le regole
RESOURCE_COEFF = {"vita": ("hp", 15), "mana": ("mp", 10)}

LIST_FIELDS = ["titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests"]
SEVERITIES = ("bad", "warn", "info")
ISSUE_PREFIX = "Import Excel — "


def _norm(v: Any) -> str:
    """Testo minuscolo, senza accenti e spazi doppi: per confrontare intestazioni ed etichette."""
    s = unicodedata.normalize("NFKD", str(v if v is not None else ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().lower()


def _text(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        return str(rules.clean(v))
    return re.sub(r"\s+", " ", str(v)).strip()


def _fmt(n: float) -> str:
    n = rules.clean(round(float(n), 2))
    return str(n).replace(".", ",")


@dataclass
class Report:
    file: str
    issues: list[dict] = field(default_factory=list)

    def add(self, severity: str, message: str, sheet: str | None = None, character: str | None = None) -> None:
        assert severity in SEVERITIES
        self.issues.append({"severity": severity, "sheet": sheet, "character": character, "message": message})


class _Sheet:
    """Accesso a un foglio con valori e formule affiancati."""

    def __init__(self, values: Worksheet, formulas: Worksheet, report: Report, character: str | None = None):
        self.v, self.f, self.report, self.name, self.character = values, formulas, report, values.title, character

    def raw(self, row: int, col: int) -> Any:
        return self.v.cell(row=row, column=col).value

    def formula(self, row: int, col: int) -> str | None:
        f = self.f.cell(row=row, column=col).value
        return f if isinstance(f, str) and f.startswith("=") else None

    def coord(self, row: int, col: int) -> str:
        return self.v.cell(row=row, column=col).coordinate

    def number(self, row: int, col: int, what: str) -> float | int:
        v = self.raw(row, col)
        if v is None:
            if self.formula(row, col):
                self.warn(f"{what} ({self.coord(row, col)}): formula senza valore calcolato salvato; letto 0. "
                          "Apri e salva il file in Excel prima di importarlo.")
            return 0
        if isinstance(v, bool):
            return int(v)
        if isinstance(v, (int, float)):
            return rules.clean(v)
        s = _text(v).replace(",", ".")
        try:
            return rules.clean(float(s))
        except ValueError:
            if s not in ("", "-", "—"):
                self.warn(f"{what} ({self.coord(row, col)}): valore non numerico «{_text(v)}»; letto 0.")
            return 0

    def warn(self, msg: str) -> None:
        self.report.add("warn", msg, self.name, self.character)

    def info(self, msg: str) -> None:
        self.report.add("info", msg, self.name, self.character)

    @property
    def max_row(self) -> int:
        return self.v.max_row

    @property
    def max_col(self) -> int:
        return self.v.max_column


# ---------------------------------------------------------------- foglio personaggio

def _is_character_sheet(ws: Worksheet) -> bool:
    return _norm(ws["A4"].value).startswith("nome personaggio")


def _stat_code(label: str) -> tuple[str, str] | None:
    m = re.match(r"^(.*?)\s*\(([A-Za-z]{2,4})\)\s*$", label) or re.match(r"^(.*?)\s+([A-Z]{2,4})\s*$", label)
    if not m:
        return None
    return m.group(2).upper(), m.group(1).strip()


def _rarity(raw: Any, sh: _Sheet, where: str) -> str:
    s = _text(raw)
    if not s:
        return ""
    for name in rules.RARITIES:
        if rules.rarity_key(name) == rules.rarity_key(s):
            return name
    sh.warn(f"{where}: rarità «{s}» non presente nella scala a 8 gradi; importata così com'è.")
    return s


def _stat_columns(sh: _Sheet) -> tuple[dict[str, int], list[tuple[int, str]], int | None]:
    """Colonne delle fonti (per intestazione), colonne extra «Punti …» e colonna «Valore»."""
    cols: dict[str, int] = {}
    extra: list[tuple[int, str]] = []
    total_col = None
    for c in range(1, sh.max_col + 1):
        h = _norm(sh.raw(HEADER_ROW, c))
        if h in SOURCE_HEADERS:
            cols[SOURCE_HEADERS[h]] = c
        elif h == "valore":
            total_col = c
        elif h.startswith("punti "):
            extra.append((c, _text(sh.raw(HEADER_ROW, c))))
    return cols, extra, total_col


def _parse_stats(sh: _Sheet) -> list[dict]:
    cols, extra, total_col = _stat_columns(sh)
    missing = [k for k in rules.STORED_SOURCE_KEYS if k not in cols]  # «oggetti» si calcola dall'equipaggiamento
    if missing:
        sh.warn(f"Colonne mancanti nella riga {HEADER_ROW}: {', '.join(missing)} (lette come 0).")
    for _, label in extra:
        sh.warn(f"Colonna extra «{label}»: non esiste nelle regole; il suo valore è sommato nella fonte «Altro» "
                "e segnato nella nota della statistica.")
    known = [c for c in (*cols.values(), *(c for c, _ in extra), total_col) if c]
    effect_col = next((c for c in range(1, sh.max_col + 1) if _norm(sh.raw(HEADER_ROW, c)) == "effetto"), None)
    last_known = max(known + [effect_col or 0])
    stray = [sh.coord(r, c) for r in range(STAT_FIRST, STAT_LAST + 1) for c in range(last_known + 1, sh.max_col + 1)
             if isinstance(sh.raw(r, c), (int, float)) and not isinstance(sh.raw(r, c), bool)]
    if stray:
        sh.info(f"Numeri fuori dalle colonne delle statistiche ({', '.join(stray)}): ignorati.")
    stats: list[dict] = []
    for r in range(STAT_FIRST, STAT_LAST + 1):
        label = _text(sh.raw(r, 1))
        values = {k: (sh.number(r, cols[k], f"{label or f'riga {r}'} · {k}") if k in cols else 0)
                  for k in rules.STORED_SOURCE_KEYS}
        extras = {lab: sh.number(r, c, f"{label} · {lab}") for c, lab in extra}
        empty = not any(values.values()) and not any(extras.values())
        if not label or re.fullmatch(r"statistica \d+", _norm(label)):
            if not empty:
                sh.warn(f"Riga {r}: statistica senza nome («{label}») con valori diversi da 0; non importata.")
            continue
        parsed = _stat_code(label)
        if parsed is None:
            code, name = re.sub(r"[^A-Za-z]", "", label)[:3].upper(), label
            sh.warn(f"Riga {r}: «{label}» non ha una sigla (es. «Forza (STR)»); usata la sigla {code}.")
        else:
            code, name = parsed
        if any(s["code"] == code for s in stats):
            sh.warn(f"Riga {r}: sigla {code} ripetuta; riga non importata.")
            continue
        notes = []
        for lab, v in extras.items():
            if v:
                values["altro"] = rules.clean(values["altro"] + v)
                notes.append(f"Altro include {_fmt(v)} da «{lab}» (colonna extra dell'Excel)")
        if "altro" in cols and (f := sh.formula(r, cols["altro"])):
            notes.append(f"Altro calcolato in Excel con {f}")
        row = {"code": code, "name": name or rules.STAT_NAMES.get(code, code),
               "kind": "base" if code in rules.BASE_STATS else "avanzata", **values,
               "note": "; ".join(notes) or None}
        if total_col:
            excel_total = sh.number(r, total_col, f"{code} · Valore")
            if abs(excel_total - rules.stat_total(row)) > 1e-6:
                sh.warn(f"{code}: il «Valore» dell'Excel è {_fmt(excel_total)}, ma la somma delle fonti è "
                        f"{_fmt(rules.stat_total(row))} (formula del totale da controllare).")
        stats.append(row)
    for code in rules.BASE_STATS:
        if not any(s["code"] == code for s in stats):
            sh.warn(f"Statistica base {code} assente.")
    return stats


def _find_table(sh: _Sheet, first: str, second: str, col: int = 6) -> int | None:
    """Riga d'intestazione di una tabella (colonna F = first, G = second), cercata sotto le statistiche."""
    for r in range(STAT_LAST + 1, sh.max_row + 1):
        if _norm(sh.raw(r, col)) == first and _norm(sh.raw(r, col + 1)) == second:
            return r
    return None


def _parse_titles(sh: _Sheet, stats: list[dict]) -> list[dict] | None:
    h = _find_table(sh, "nome", "rarita")
    if h is None:
        return None
    # La k-esima colonna bonus (da H) corrisponde alla k-esima riga statistica (da 9), come nelle formule SUM.
    colmap: dict[int, str] = {}
    by_row = {}
    for r in range(STAT_FIRST, STAT_LAST + 1):
        p = _stat_code(_text(sh.raw(r, 1)))
        if p:
            by_row[r] = p
    for k in range(STAT_LAST - STAT_FIRST + 1):
        c = 8 + k
        header = _text(sh.raw(h, c))
        if (STAT_FIRST + k) not in by_row:
            continue
        code, name = by_row[STAT_FIRST + k]
        if not any(s["code"] == code for s in stats):
            continue
        colmap[c] = code
        hn = _norm(header)
        if header and not (hn == code.lower() or _norm(name).startswith(hn)):
            sh.warn(f"Tabella titoli: la colonna {sh.coord(h, c)} si chiama «{header}» ma corrisponde a {code} "
                    f"({name}).")
    titles = []
    for r in range(h + 1, sh.max_row + 1):
        name = _text(sh.raw(r, 6))
        bonus = {code: sh.number(r, c, f"Titolo «{name}» · {code}") for c, code in colmap.items()}
        bonus = {k: v for k, v in bonus.items() if v}
        stray = [sh.coord(r, c) for c in range(8, 8 + STAT_LAST - STAT_FIRST + 1)
                 if c not in colmap and isinstance(sh.raw(r, c), (int, float)) and sh.raw(r, c)]
        if stray:
            sh.warn(f"Titolo «{name}»: bonus in colonne senza statistica ({', '.join(stray)}), ignorati.")
        if not name:
            if bonus:
                sh.warn(f"Riga {r}: bonus titolo senza nome ({bonus}); non importato.")
            continue
        if _norm(name) == "placeholder":
            sh.warn(f"Riga {r}: titolo segnaposto «{name}» non importato.")
            continue
        titles.append({"name": name, "rarity": _rarity(sh.raw(r, 7), sh, f"Titolo «{name}»"), "bonus": bonus})
    # Confronto con la colonna «Punti Titoli»
    for s in stats:
        expected = rules.clean(sum(t["bonus"].get(s["code"], 0) for t in titles))
        if abs(expected - rules.num(s["titoli"])) > 1e-6:
            sh.warn(f"{s['code']}: «Punti Titoli» vale {_fmt(s['titoli'])}, ma i titoli elencati danno "
                    f"{_fmt(expected)}. Importato il valore della cella ({_fmt(s['titoli'])}).")
    return titles


def _parse_sheet_talents(sh: _Sheet) -> list[dict] | None:
    h = _find_table(sh, "talento", "rarita")
    if h is None:
        return None
    heads = {_norm(sh.raw(h, c)): c for c in range(6, sh.max_col + 1) if sh.raw(h, c) is not None}
    out = []
    for r in range(h + 1, sh.max_row + 1):
        name = _text(sh.raw(r, 6))
        if not name:
            continue
        effect = " · ".join(x for x in (_text(sh.raw(r, heads["descrizione"])) if "descrizione" in heads else "",
                                        _text(sh.raw(r, heads["bonus"])) if "bonus" in heads else "") if x)
        out.append({"name": name, "rarity": _rarity(sh.raw(r, 7), sh, f"Talento «{name}»"), "origin": "",
                    "effect": effect})
    return out


def _parse_derived(sh: _Sheet, stats: list[dict]) -> dict:
    """Bonus oggetti (colonna «Bonus Item») e confronto informativo con le derivate dell'Excel."""
    head = next((r for r in range(STAT_LAST + 1, sh.max_row + 1)
                 if _norm(sh.raw(r, 1)) == "statistica derivata"), None)
    if head is None:
        return {}
    bonus_col = next((c for c in range(2, 6) if _norm(sh.raw(head, c)) == "bonus item"), None)
    formula_col = next((c for c in range(2, 6) if _norm(sh.raw(head, c)) == "formula"), None)
    app = {d["key"]: d for d in rules.DERIVED}
    app_values = rules.derived_values({"stats": stats})
    item_bonus: dict[str, float] = {}
    for r in range(head + 1, sh.max_row + 1):
        label = _text(sh.raw(r, 1))
        if not label:
            break  # fine della tabella (sotto possono esserci altre tabelle, es. Imprese Diplomatiche)
        key = DERIVED_LABELS.get(_norm(label))
        if bonus_col:
            b = sh.number(r, bonus_col, f"{label} · Bonus Item")
            if b and key:
                item_bonus[key] = b
            elif b:
                sh.warn(f"«{label}»: bonus oggetti {_fmt(b)} su una derivata che l'app non gestisce; non importato.")
        if key is None:
            if isinstance(sh.raw(r, 2), (int, float)):
                sh.info(f"Derivata «{label}» dell'Excel non gestita dall'app: non importata.")
            continue
        excel = sh.raw(r, 2)
        if isinstance(excel, (int, float)) and abs(float(excel) - app_values[key]) > 0.01:
            shown = _text(sh.raw(r, formula_col)) if formula_col else ""
            cell = sh.formula(r, 2)
            how = ", ".join(x for x in (f"«{shown}»" if shown else "", f"cella {cell}" if cell else "") if x)
            sh.info(f"{app[key]['label']}: Excel {_fmt(excel)}" + (f" ({how})" if how else "")
                    + f", app {_fmt(app_values[key])} ({app[key]['formula']}). Vale la formula dell'app.")
    # Blocco «MANA E VITA» (colonna F): coefficienti diversi dalle regole, risorse extra
    start = next((r for r in range(STAT_LAST + 1, sh.max_row + 1) if _norm(sh.raw(r, 6)) == "mana e vita"), None)
    if start is not None:
        for r in range(start + 2, sh.max_row + 1):  # salta l'intestazione «Statistica Derivata»
            lab = _norm(sh.raw(r, 6))
            if not lab:
                break
            if lab in RESOURCE_COEFF:
                key, rule = RESOURCE_COEFF[lab]
                coeff = sh.raw(r, 12)
                if isinstance(coeff, (int, float)) and rules.clean(coeff) != rule:
                    sh.warn(f"Blocco «MANA E VITA»: coefficiente {lab.upper()} = {_fmt(coeff)}, le regole usano "
                            f"{rule} ({app[key]['formula']}). Vale la formula dell'app.")
            else:
                sh.info(f"Risorsa «{_text(sh.raw(r, 6))}» del blocco «MANA E VITA» non gestita dall'app: "
                        "non importata.")
    return item_bonus


def _check_rules(sh: _Sheet, level: int, stats: list[dict], free_cell: Any) -> None:
    expected = level - 1
    base = [s for s in stats if s["kind"] == "base"]
    wrong: dict[float, list[str]] = {}
    for s in base:
        if rules.num(s["levelup"]) != expected:
            wrong.setdefault(s["levelup"], []).append(s["code"])
    for v, codes in wrong.items():
        sh.warn(f"Livello {level}: «Punti Level Up» = {_fmt(v)} su {', '.join(codes)}, attesi {expected} "
                f"(+{rules.LEVEL['auto_per_level']} per ogni livello dopo il primo).")
    for s in stats:
        if s["kind"] == "avanzata" and rules.num(s["levelup"]) > expected:
            sh.warn(f"{s['code']} (avanzata): «Punti Level Up» = {_fmt(s['levelup'])}, più dei {expected} "
                    f"level up possibili al livello {level}.")
    for s in base:
        if rules.num(s["iniziale"]) != rules.CREATION["base"]:
            sh.warn(f"{s['code']}: «Valore Iniziale» = {_fmt(s['iniziale'])}, le regole partono da "
                    f"{rules.CREATION['base']}.")
    creation = rules.clean(sum(rules.num(s["creazione"]) for s in base))
    if creation != rules.CREATION["bonus_points"]:
        sh.warn(f"«Punti Creazione» sulle statistiche base: {_fmt(creation)}, attesi "
                f"{rules.CREATION['bonus_points']}.")
    total = rules.free_points_total(level)
    used = rules.clean(sum(rules.num(s["investiti"]) for s in stats))
    if used > total:
        sh.warn(f"«Punti Investiti» totali {_fmt(used)}, ma al livello {level} i punti liberi sono {total}: "
                f"{_fmt(used - total)} di troppo.")
    elif used < total:
        sh.info(f"{_fmt(total - used)} punti liberi non ancora investiti ({_fmt(used)} su {total}).")
    if isinstance(free_cell, (int, float)) and rules.clean(free_cell) != total:
        sh.warn(f"«Punti Liberi per Level Up» nell'Excel = {_fmt(free_cell)}, le regole danno {total} "
                f"(({level} − 1) × {rules.LEVEL['free_per_level']}).")


def _parse_character(sh: _Sheet) -> dict | None:
    name = _text(sh.raw(4, 2))
    sh.character = name or sh.name
    if not name:
        sh.report.add("bad", "Nome personaggio vuoto (B4): foglio non importato.", sh.name, None)
        return None
    if not re.fullmatch(r"[A-Za-z0-9À-ÖØ-öø-ÿ]{%d,%d}" % (rules.CREATION["name_min"], rules.CREATION["name_max"]),
                        name):
        sh.report.add("bad", f"Nome «{name}» non valido per l'app (3–15 lettere o cifre, senza spazi): "
                             "foglio non importato.", sh.name, name)
        return None
    if _norm(name) != _norm(sh.name):
        sh.info(f"Il foglio si chiama «{sh.name}» ma il personaggio è «{name}».")
    title = _text(sh.raw(1, 1))
    if _norm(title) not in GENERIC_TITLES and _norm(title) != _norm(name):
        sh.info(f"Titolo del foglio (A1) «{title}» diverso dal nome «{name}».")
    classe = _text(sh.raw(4, 4))
    if not classe:
        sh.warn("Classe vuota (D4).")
    lvl_raw = sh.number(5, 2, "Livello")
    level = int(lvl_raw)
    if level != lvl_raw or level < 1:
        sh.report.add("bad", f"Livello «{_fmt(lvl_raw)}» non valido (B5): foglio non importato.", sh.name, name)
        return None
    exp = sh.number(5, 4, "EXP corrente")
    if not 0 <= exp <= 100:
        sh.warn(f"EXP corrente {_fmt(exp)}% fuori da 0–100.")
    stats = _parse_stats(sh)
    _check_rules(sh, level, stats, sh.raw(26, 2) if _norm(sh.raw(26, 1)).startswith("punti liberi") else None)
    data: dict[str, Any] = {"name": name, "classe": classe, "level": level, "exp_pct": exp, "stats": stats}
    titles = _parse_titles(sh, stats)
    if titles is not None:
        data["titles"] = titles
    talents = _parse_sheet_talents(sh)
    if talents is not None:
        data["talents"] = talents
    item_bonus = _parse_derived(sh, stats)
    if item_bonus:
        data["item_bonus"] = item_bonus
    return data


# ---------------------------------------------------------------- fogli accessori (es. file di Kelvin)

def _header(sh: _Sheet) -> dict[str, int]:
    out: dict[str, int] = {}
    for c in range(1, sh.max_col + 1):
        h = _norm(sh.raw(1, c))
        if h and h not in out:
            out[h] = c
    return out


def _rows(sh: _Sheet, stop_at_gap: bool = False):
    """Righe di dati (dalla 2) con la prima colonna valorizzata. Con stop_at_gap si ferma al primo buco."""
    seen_gap = False
    skipped = []
    for r in range(2, sh.max_row + 1):
        first = _text(sh.raw(r, 1))
        if not first:
            if any(sh.raw(r, c) is not None for c in range(2, sh.max_col + 1)):
                sh.warn(f"Riga {r}: dati senza nome nella colonna A; riga non importata.")
            seen_gap = True
            continue
        if stop_at_gap and seen_gap:
            skipped.append(first)
            continue
        yield r
    if skipped:
        sh.warn(f"Righe dopo una riga vuota non importate (sembrano appunti o voci non ancora ottenute): "
                f"{', '.join(skipped)}. Aggiungile a mano se il personaggio le possiede.")


def _pct(sh: _Sheet, r: int, c: int | None, what: str) -> float | int | str:
    if c is None:
        return 0
    v = sh.raw(r, c)
    if _norm(v) == "max":
        return "MAX"
    return sh.number(r, c, what)


def _col(h: dict[str, int], *names: str) -> int | None:
    return next((h[n] for n in names if n in h), None)


def _skills(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    out = []
    for r in _rows(sh):
        name = _text(sh.raw(r, 1))
        lvl_c = _col(h, "lvl", "livello")
        if lvl_c and _text(sh.raw(r, lvl_c)) in ("-", "—"):
            sh.info(f"Skill «{name}»: livello «-» importato come 0.")
        item = {"name": name, "lvl": int(sh.number(r, lvl_c, f"Skill «{name}» · lvl")) if lvl_c else 0,
                "pct": _pct(sh, r, _col(h, "%"), f"Skill «{name}» · %"),
                "type": _text(sh.raw(r, h["tipo"])) if "tipo" in h else ""}
        passive = _text(sh.raw(r, h["passiva"])) if "passiva" in h else ""
        if passive:
            item["passive"] = passive
        out.append(item)
    return out


def _active_skills(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    out = []
    for r in _rows(sh):
        name = _text(sh.raw(r, 1))
        cost_c, cd_c = _col(h, "costo", "cost"), _col(h, "cd", "cooldown")
        out.append({"name": name, "effect": _text(sh.raw(r, h["effetto"])) if "effetto" in h else "",
                    "lvl": int(sh.number(r, _col(h, "lvl", "livello"), f"«{name}» · lvl")) if _col(h, "lvl", "livello") else 0,
                    "pct": _pct(sh, r, _col(h, "%"), f"«{name}» · %"),
                    "cost": _text(sh.raw(r, cost_c)) if cost_c else "",
                    "cd": int(sh.number(r, cd_c, f"«{name}» · cd")) if cd_c else 0})
    if out and not (_col(h, "costo", "cost") and _col(h, "cd", "cooldown")):
        sh.info("Costo e cooldown delle skill attive non presenti nell'Excel: importati vuoti (costo «», cd 0).")
    return out


def _inventory(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    out, no_weight = [], 0
    qty_c, w_c = _col(h, "quantita", "qta"), _col(h, "peso (kg)", "peso")
    for r in _rows(sh):
        name = _text(sh.raw(r, 1))
        qty_raw = sh.raw(r, qty_c) if qty_c else None
        if w_c is None or sh.raw(r, w_c) is None:
            no_weight += 1
        out.append({"name": name, "stats": _text(sh.raw(r, h["stats"])) if "stats" in h else "",
                    "rarity": _rarity(sh.raw(r, h["rarita"]), sh, f"Oggetto «{name}»") if "rarita" in h else "",
                    "type": _text(sh.raw(r, h["tipo"])) if "tipo" in h else "",
                    "qty": int(sh.number(r, qty_c, f"«{name}» · quantità")) if qty_raw is not None else 1,
                    "weight": sh.number(r, w_c, f"«{name}» · peso") if w_c else 0})
    if no_weight:
        sh.info(f"{no_weight} oggetti su {len(out)} senza peso: importati con peso 0.")
    no_rarity = sum(1 for i in out if not i["rarity"])
    if no_rarity:
        sh.info(f"{no_rarity} oggetti su {len(out)} senza rarità: lasciata vuota.")
    return out


def _talents(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    return [{"name": _text(sh.raw(r, 1)),
             "rarity": _rarity(sh.raw(r, h["rarita"]), sh, f"Talento «{_text(sh.raw(r, 1))}»") if "rarita" in h else "",
             "origin": _text(sh.raw(r, h["origine"])) if "origine" in h else "",
             "effect": _text(sh.raw(r, h["effetto"])) if "effetto" in h else ""}
            for r in _rows(sh, stop_at_gap=True)]


def _pets(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    out = []
    for r in _rows(sh):
        name = _text(sh.raw(r, 1))
        skills = []
        for c in range(1, sh.max_col + 1):
            if re.fullmatch(r"skill \d+", _norm(sh.raw(1, c))):
                sk = _text(sh.raw(r, c))
                if sk:
                    skills.append({"name": sk, "lvl": int(sh.number(r, c + 1, f"Pet «{name}» · {sk} · lvl")),
                                   "pct": _pct(sh, r, c + 2, f"Pet «{name}» · {sk} · %")})
        out.append({"name": name, "species": _text(sh.raw(r, h["specie"])) if "specie" in h else "",
                    "lvl": int(sh.number(r, h["lvl"], f"Pet «{name}» · lvl")) if "lvl" in h else 0,
                    "passive": _text(sh.raw(r, h["skill passiva"])) if "skill passiva" in h else "",
                    "skills": skills})
    return out


def _curses(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    return [{"name": _text(sh.raw(r, 1)), "desc": _text(sh.raw(r, h["descrizione"])) if "descrizione" in h else "",
             "bonus": _text(sh.raw(r, h["bonus"])) if "bonus" in h else "",
             "malus": _text(sh.raw(r, h["malus"])) if "malus" in h else ""} for r in _rows(sh)]


def _quests(sh: _Sheet) -> list[dict]:
    h = _header(sh)
    out = [{"name": _text(sh.raw(r, 1)), "progress": _text(sh.raw(r, h["progresso"])) if "progresso" in h else "",
            "reward": _text(sh.raw(r, h["ricompensa"])) if "ricompensa" in h else "",
            "rarity": _rarity(sh.raw(r, h["rarita"]), sh, f"Quest «{_text(sh.raw(r, 1))}»") if "rarita" in h else ""}
           for r in _rows(sh)]
    if out and "rarita" not in h:
        sh.info("Le quest non hanno una colonna Rarità: lasciata vuota.")
    return out


AUX_SHEETS = {"skills": ("skills", _skills), "skill attive": ("active_skills", _active_skills),
              "inventario": ("inventory", _inventory), "talenti": ("talents", _talents), "pets": ("pets", _pets),
              "maledizioni": ("curses", _curses), "quest": ("quests", _quests)}


# ---------------------------------------------------------------- parsing del file

# Limiti anti-abuso dell'import (le schede reali: ~1,3 MB espansi, al massimo ~1000 righe × 29 colonne).
MAX_UNZIPPED = 50 * 1024 * 1024   # zip bomb: dimensione totale espansa
MAX_ENTRIES = 1000
MAX_ROWS, MAX_COLS = 10_000, 200  # i cicli del parser scorrono righe × colonne


def check_archive(content: bytes, filename: str) -> None:
    """Controlla l'archivio .xlsx prima di darlo a openpyxl: deve essere uno zip con il contenuto di una cartella
    di lavoro e non espandersi oltre MAX_UNZIPPED (zip bomb)."""
    import zipfile

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            infos = z.infolist()
    except (zipfile.BadZipFile, ValueError, OSError) as exc:
        raise ValueError(f"Il file «{filename}» non è un Excel .xlsx leggibile ({type(exc).__name__}).") from exc
    if len(infos) > MAX_ENTRIES:
        raise ValueError(f"Il file «{filename}» contiene troppi elementi ({len(infos)}).")
    if not any(i.filename == "xl/workbook.xml" for i in infos):
        raise ValueError(f"Il file «{filename}» non è un Excel .xlsx leggibile (manca la cartella di lavoro).")
    if sum(i.file_size for i in infos) > MAX_UNZIPPED:
        raise ValueError(f"Il file «{filename}» si espande oltre {MAX_UNZIPPED // (1024 * 1024)} MB: non importato.")


def parse_workbook(content: bytes, filename: str = "file.xlsx") -> tuple[list[dict], Report]:
    """Legge un file .xlsx e restituisce (personaggi, report). Non tocca il DB."""
    report = Report(filename)
    check_archive(content, filename)
    try:
        wb_v = load_workbook(io.BytesIO(content), data_only=True, read_only=False)
        wb_f = load_workbook(io.BytesIO(content), data_only=False, read_only=False)
    except Exception as exc:  # file corrotto o non xlsx
        raise ValueError(f"Il file «{filename}» non è un Excel .xlsx leggibile ({type(exc).__name__}).") from exc
    for ws in wb_v.worksheets:
        if ws.max_row > MAX_ROWS or ws.max_column > MAX_COLS:
            raise ValueError(f"Foglio «{ws.title}» troppo esteso ({ws.max_row} righe × {ws.max_column} colonne; "
                             f"massimo {MAX_ROWS} × {MAX_COLS}): elimina le celle usate oltre la scheda.")
    chars: list[dict] = []
    aux: list[_Sheet] = []
    for ws in wb_v.worksheets:
        sh = _Sheet(ws, wb_f[ws.title], report)
        if _is_character_sheet(ws):
            data = _parse_character(sh)
            if data is not None:
                data["sheet"] = ws.title
                if any(c["name"].lower() == data["name"].lower() for c in chars):
                    report.add("bad", f"Personaggio «{data['name']}» presente in più fogli: importato solo il primo.",
                               ws.title, data["name"])
                else:
                    chars.append(data)
        elif _norm(ws.title) in AUX_SHEETS:
            aux.append(sh)
        else:
            report.add("info", "Foglio non riconosciuto: ignorato.", ws.title)
    if aux:
        if len(chars) != 1:
            report.add("warn", f"Fogli accessori ({', '.join(s.name for s in aux)}) ignorati: il file contiene "
                               f"{len(chars)} schede personaggio, non si sa a chi assegnarli.")
        else:
            target = chars[0]
            for sh in aux:
                sh.character = target["name"]
                key, fn = AUX_SHEETS[_norm(sh.name)]
                target[key] = fn(sh)
            coins = {_norm(i["name"]): i["qty"] for i in target.get("inventory", []) if _norm(i["type"]) == "monete"}
            for coin, fld in (("corone", "corone"), ("corone d'oro", "corone"), ("scellini", "scellini")):
                if coin in coins:
                    target[fld] = coins[coin]
    if not chars:
        report.add("bad", "Nessuna scheda personaggio trovata (cella A4 «Nome Personaggio:»).")
    return chars, report


# ---------------------------------------------------------------- scrittura nel DB

def _issue_text(items: list[dict]) -> str:
    return "\n".join(f"• [{i['sheet']}] {i['message']}" if i.get("sheet") else f"• {i['message']}" for i in items)


def _save_issues(db: Session, report: Report) -> list[int]:
    """Una questione per personaggio con le incoerenze (warn/bad) dell'import, visibile nella sezione Master."""
    groups: dict[str, list[dict]] = {}
    for i in report.issues:
        if i["severity"] in ("warn", "bad"):
            groups.setdefault(i["character"] or report.file, []).append(i)
    ids = []
    for who, items in groups.items():
        title = f"{ISSUE_PREFIX}{who}"
        sev = "bad" if any(i["severity"] == "bad" for i in items) else "warn"
        text = f"Incoerenze trovate importando «{report.file}» (dati importati così come sono nell'Excel):\n" \
               + _issue_text(items)
        existing = db.scalar(select(Issue).where(Issue.title == title, Issue.resolved.is_(False)))
        if existing:
            existing.text, existing.sev = text, sev
            ids.append(existing.id)
        else:
            iss = Issue(title=title, text=text, sev=sev, resolved=False, decision=None)
            db.add(iss)
            db.flush()
            ids.append(iss.id)
    return ids


def import_characters(db: Session, chars: list[dict], report: Report, *, default_owner: User,
                      owners: dict[str, User] | None = None, dry_run: bool = False,
                      save_issues: bool = True) -> dict:
    """Crea o aggiorna (per nome, senza distinzione di maiuscole) i personaggi letti dall'Excel."""
    from .serialize import maxes  # import locale: evita cicli

    owners = {k.lower(): v for k, v in (owners or {}).items()}
    results = []
    for data in chars:
        existing = db.scalar(select(Character).where(Character.name_key == data["name"].lower()))
        sections = [f for f in LIST_FIELDS if f in data]
        entry = {"name": data["name"], "sheet": data["sheet"], "action": "updated" if existing else "created",
                 "id": existing.id if existing else None, "level": data["level"], "classe": data["classe"],
                 "stats": len(data["stats"]), "sections": {f: len(data[f]) for f in sections}}
        if existing:
            for fld, label in (("level", "Livello"), ("classe", "Classe")):
                old = getattr(existing, fld)
                if old != data[fld]:
                    report.add("info", f"{label}: nel database {old}, nell'Excel {data[fld]} → vale l'Excel.",
                               data["sheet"], data["name"])
            if data["name"].lower() in owners and owners[data["name"].lower()].id != existing.owner_id:
                report.add("info", "Il proprietario indicato è ignorato: il personaggio esiste già e mantiene "
                                   "il suo proprietario.", data["sheet"], data["name"])
            entry["owner"] = existing.owner.username if existing.owner else None
        else:
            owner = owners.get(data["name"].lower(), default_owner)
            entry["owner"] = owner.username
            if owner.role == "master":
                report.add("info", "Personaggio nuovo assegnato al Master: indica il giocatore con il parametro "
                                   "«owners».", data["sheet"], data["name"])
            report.add("info", "Regno, PvP e gilda non sono nell'Excel: impostati a «—», Bianco, nessuna gilda.",
                       data["sheet"], data["name"])
        results.append(entry)
        if dry_run:
            continue
        c = existing or Character(
            owner_id=owners.get(data["name"].lower(), default_owner).id, name=data["name"],
            name_key=data["name"].lower(), regno="—", pvp="Bianco", gilda={"nome": "—", "ruolo": "Nessuna gilda"},
            corone=0, scellini=0, item_bonus={}, equip={"difesa": 0, "difesaMagica": 0, "blocco": 0},
            magia={"nucleo": 0, "talenti": 0}, reputation=[],
            combat={"position": "Mischia", "turn": 1, "effects": [], "cooldowns": [], "log": []}, death=None,
            **{f: [] for f in LIST_FIELDS})
        c.classe, c.level, c.exp_pct, c.stats = data["classe"], data["level"], data["exp_pct"], data["stats"]
        for f in sections + [k for k in ("item_bonus", "corone", "scellini") if k in data]:
            setattr(c, f, data[f])
        if existing is None:
            db.add(c)
            c.resources = maxes(c)
        else:
            m = maxes(c)
            c.resources = {k: rules.clean(min(rules.num((c.resources or {}).get(k, m[k])), m[k])) for k in m}
        db.flush()
        entry["id"] = c.id
    issue_ids = _save_issues(db, report) if (save_issues and not dry_run) else []
    if dry_run:
        db.rollback()
    else:
        db.commit()
    counts = {s: sum(1 for i in report.issues if i["severity"] == s) for s in SEVERITIES}
    return {"file": report.file, "dry_run": dry_run, "characters": results, "issues": report.issues,
            "summary": counts, "issue_ids": issue_ids}


# ---------------------------------------------------------------- CLI

def format_report(res: dict) -> str:
    lines = [f"== {res['file']}" + (" (prova, nessuna modifica salvata)" if res["dry_run"] else "")]
    verb = {"created": "creato", "updated": "aggiornato"}
    for c in res["characters"]:
        extra = ", ".join(f"{k} {v}" for k, v in c["sections"].items())
        lines.append(f"  {c['name']}: {verb[c['action']]} (lv {c['level']}, {c['classe']}, {c['stats']} statistiche"
                     + (f", {extra}" if extra else "") + f", proprietario {c['owner']})")
    s = res["summary"]
    lines.append(f"  Segnalazioni: {s['bad']} gravi, {s['warn']} incoerenze, {s['info']} note")
    tag = {"bad": "GRAVE", "warn": "INCOERENZA", "info": "nota"}
    for i in res["issues"]:
        where = f"[{i['sheet']}] " if i["sheet"] else ""
        lines.append(f"  - {tag[i['severity']]}: {where}{i['message']}")
    return "\n".join(lines)


def main(argv=None) -> int:
    from .db import SessionLocal
    from .seed import seed_if_empty

    p = argparse.ArgumentParser(prog="python -m app.excel_import", description="Importa schede Excel STATISFY")
    p.add_argument("files", nargs="+", type=Path)
    p.add_argument("--dry-run", action="store_true", help="mostra il report senza salvare nulla")
    p.add_argument("--owner", action="append", default=[], metavar="NOME=USERNAME",
                   help="proprietario di un personaggio nuovo (ripetibile); default il primo Master")
    p.add_argument("--no-issues", action="store_true", help="non creare questioni per il Master")
    args = p.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")
    with SessionLocal() as db:
        seed_if_empty(db)
        master = db.scalar(select(User).where(User.role == "master").order_by(User.id))
        owners = {}
        for spec in args.owner:
            name, _, username = spec.partition("=")
            u = db.scalar(select(User).where(User.username == username))
            if not name or u is None:
                print(f"--owner non valido: {spec} (utente inesistente?)")
                return 1
            owners[name] = u
        code = 0
        for path in args.files:
            try:
                chars, report = parse_workbook(path.read_bytes(), path.name)
            except (OSError, ValueError) as exc:
                print(exc)
                code = 1
                continue
            res = import_characters(db, chars, report, default_owner=master, owners=owners, dry_run=args.dry_run,
                                    save_issues=not args.no_issues)
            print(format_report(res))
    return code


if __name__ == "__main__":
    sys.exit(main())
