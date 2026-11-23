"""Meccanica strutturata di incantesimi, miracoli, skill e attacchi (`mech`, versione 1).

Un'abilità è una lista di Effetti; ogni Effetto risponde a cinque domande:
  Trigger    — quando scatta (al lancio, a inizio turno, quando colpito, all'uccisione…)
  Bersaglio  — chi colpisce (sé, alleato, nemico; singolo, area, catena, casuale, tutti)
  Azione     — cosa fa (danno, cura, scudo, status, statistiche, evocazione…)
  Condizioni e scaling — da cosa dipende (status presenti, vita, stack, numero di lanci, storico)
  Timing     — quando si può usare (mio turno, reazione, entrambi; sta nell'abilità)

Il testo libero (`effect`) resta accanto come descrizione; `describe()` genera il riepilogo leggibile.
Il motore che usa questi dati è in `engine.py`.
"""
from __future__ import annotations

import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

MAX_EFFECTS = 8
MAX_DEPTH = 3
Num = Annotated[float, Field(ge=-1e9, le=1e9, allow_inf_nan=False)]
Pos = Annotated[float, Field(ge=0, le=1e9, allow_inf_nan=False)]
Pct = Annotated[float, Field(ge=0, le=1000, allow_inf_nan=False)]
Short = Annotated[str, Field(max_length=80)]
Text = Annotated[str, Field(max_length=600)]

# ---------- Vocabolario (inviato anche al client in /forge/meta → mech) ----------
EVENTS = {
    "al_lancio": "Al lancio",
    "inizio_turno": "Inizio turno",
    "fine_turno": "Fine turno",
    "quando_colpito": "Quando viene colpito",
    "quando_colpisce": "Quando colpisce",
    "uccide": "Quando uccide",
    "muore": "Quando muore",
    "morte_alleato": "Quando muore un alleato",
    "azione_nemica": "Quando un nemico agisce (trappola, runa)",
    "dopo_abilita": "Dopo un'abilità specifica",
    "soglia_hp": "Quando la vita scende sotto una soglia",
    "passivo": "Sempre (passivo)",
}
REACTIVE_EVENTS = {"quando_colpito", "quando_colpisce", "uccide", "muore", "morte_alleato", "azione_nemica",
                   "dopo_abilita", "soglia_hp"}
SIDES = {"se": "Sé stesso", "alleato": "Alleato", "nemico": "Nemico", "qualsiasi": "Chiunque"}
SHAPES = {"singolo": "Singolo", "area": "Area", "catena": "Catena", "casuale": "Casuali", "tutti": "Tutti"}
REACH = {"mischia": "Mischia", "distanza": "Distanza", "a_vista": "A vista (nessun limite di portata)"}
OPS = {
    "danno": "Danno", "cura": "Cura", "danno_e_cura": "Danno e cura (furto di vita)", "scudo": "Scudo",
    "status_applica": "Applica status", "status_rimuovi": "Rimuovi status", "status_consuma": "Consuma status (combo)",
    "stat_mod": "Modifica statistica", "evoca": "Evoca alleato o costrutto", "sposta": "Sposta",
    "interrompi": "Interrompi", "reindirizza": "Reindirizza il colpo", "dispel": "Dissolvi / purifica",
    "risorsa": "Risorse (dai, togli, ruba)", "ruba_buff": "Ruba effetti positivi", "cd_mod": "Modifica cooldown",
    "turno_mod": "Modifica turni", "copia": "Copia l'ultima abilità", "trasforma": "Trasformazione / postura",
    "campo": "Effetto di campo", "esegui_sotto": "Esecuzione sotto soglia", "resuscita": "Resurrezione",
    "salvavita": "Salvavita", "legame": "Legame (divide il danno)", "riflesso": "Danno riflesso",
    "doma": "Doma / cattura", "rivela": "Rivela (annulla invisibilità)", "narrativo": "Solo testo",
}
FORMULA_BASES = {
    "fissa": "Valore fisso", "intervallo": "Intervallo min–max", "dadi": "Dadi (es. 2d6+3)",
    "incantesimo": "Incantesimo (15–30 × efficacia × molt. magico)", "arma": "Arma (base × molt. fisico)",
    "pct_hp": "% della vita", "pct_danno": "% del danno inflitto", "pct_eccesso": "% del danno in eccesso",
}
MULTS = {"nessuno": "Nessuno", "moltMag": "Molt. magico", "moltFis": "Molt. fisico", "efficacia": "Efficacia"}
DAMAGE_TYPES = ["fisico", "magico", "puro", "Ignis", "Aqua", "Terra", "Ventus", "Mens", "Anima", "Vis", "Vita",
                "Spatium", "Tempus", "Luce", "Ombra", "Veleno"]
TESTS = {
    "ha_status": "Ha lo status", "non_ha_status": "Non ha lo status", "hp_sotto": "Vita sotto %",
    "hp_sopra": "Vita sopra %", "tipo": "È del tipo", "taglia": "È della taglia", "stack_min": "Stack almeno",
    "lanci_min": "Lanci almeno", "storico": "Nello storico c'è l'evento", "invisibile": "Non è visibile",
}
SCALES = {
    "stack": "Stack di uno status", "consumati": "Stack consumati", "lanci": "Numero di lanci",
    "turni_mantenuto": "Turni mantenuto", "hp_mancante_se": "Vita mancante di chi lancia",
    "hp_mancante_bersaglio": "Vita mancante del bersaglio", "storico": "Volte che è successo un evento",
    "grado": "Grado dell'abilità",
}
TIMINGS = {"mio_turno": "Mio turno", "reazione": "Reazione", "entrambi": "Entrambi"}
ACTIONS = {"principale": "Principale", "bonus": "Bonus", "libera": "Libera", "reazione": "Reazione"}
DURATIONS = {"istantaneo": "Istantaneo", "turni": "Per N turni", "mantenuto": "Mantenuto", "canalizzato": "Canalizzato"}
RESOURCES = {"MP": "MP", "SP": "SP", "KI": "KI", "HP": "HP", "FEDE": "Fede", "stack": "Stack di status",
             "cariche": "Cariche"}
CD_UNITS = {"turni": "turni", "ore": "ore", "giorni": "giorni", "settimana": "settimana"}
KINDS = {"incantesimo": "Incantesimo", "miracolo": "Miracolo", "skill": "Skill", "attacco": "Attacco",
         "passiva": "Passiva"}


class _M(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Trigger(_M):
    evento: Literal[tuple(EVENTS)] = "al_lancio"  # type: ignore[valid-type]
    chi: Literal["se", "bersaglio"] = "se"  # inizio/fine turno di chi
    abilita: Short = ""  # dopo_abilita: nome o #etichetta; azione_nemica: lancio|attacco|movimento|"" (qualsiasi)
    soglia: Pct = 0  # soglia_hp: percentuale


class Bersaglio(_M):
    lato: Literal[tuple(SIDES)] = "nemico"  # type: ignore[valid-type]
    forma: Literal[tuple(SHAPES)] = "singolo"  # type: ignore[valid-type]
    n: int = Field(1, ge=1, le=50)  # catena: salti; casuale/area: numero massimo di bersagli
    raggio: Pos = 0  # metri (descrittivo: l'area colpisce chi il Master/giocatore sceglie, fino a n)
    calo: Pct = 0  # catena: % in meno a ogni salto
    portata: Literal[tuple(REACH)] = "distanza"  # type: ignore[valid-type]


class Formula(_M):
    base: Literal[tuple(FORMULA_BASES)] = "fissa"  # type: ignore[valid-type]
    min: Num = 0
    max: Num = 0
    dadi: Annotated[str, Field(max_length=20, pattern=r"^\s*(\d{1,2}d\d{1,3}\s*([+-]\s*\d{1,6})?|\d{1,6})?\s*$")] = ""
    pct: Pct = 0
    di: Literal["se", "bersaglio"] = "bersaglio"
    quale: Literal["max", "attuale", "mancante"] = "max"
    molt: Literal[tuple(MULTS)] = "nessuno"  # type: ignore[valid-type]
    tipo: Annotated[str, Field(max_length=20)] = "magico"
    penetrazione: Pct = 0  # % di resistenza ignorata


class Condizione(_M):
    soggetto: Literal["se", "bersaglio"] = "bersaglio"
    test: Literal[tuple(TESTS)]  # type: ignore[valid-type]
    status: Short = ""
    valore: Num = 0
    testo: Short = ""  # tipo / taglia / evento dello storico
    entro: int = Field(0, ge=0, le=99)  # storico: negli ultimi N round (0 = in tutto lo scontro)


class Scaling(_M):
    da: Literal[tuple(SCALES)]  # type: ignore[valid-type]
    status: Short = ""
    evento: Short = ""
    passo: Num = 0  # % in più per unità
    max: Pct = 0  # tetto in % (0 = nessuno)


class Azione(_M):
    op: Literal[tuple(OPS)]  # type: ignore[valid-type]
    status: Short = ""  # status_*: nome dello status (catalogo o personalizzato)
    stack: int = Field(1, ge=1, le=99)
    turni: int = Field(0, ge=0, le=99)
    stat: Annotated[str, Field(max_length=20)] = ""  # stat_mod: chiave derivata o codice statistica
    valore: Num = 0  # % (stat_mod, marchio…), turni (cd_mod), quantità generica
    pct: Pct = 0  # danno_e_cura: % del danno che diventa cura; esegui_sotto: soglia; resuscita: % vita; riflesso
    risorsa: Literal["", "hp", "mp", "sp", "ki"] = ""
    modo: Annotated[str, Field(max_length=20)] = ""  # risorsa: dai|togli|ruba · sposta: spingi|attira|scambia · turno_mod: extra|anticipa|ritarda · dispel: buoni|cattivi
    nome: Short = ""  # evoca / trasforma / campo
    hp: Pos = 0  # evoca: vita della creatura
    eccesso_scudo: bool = False  # cura: la cura oltre il massimo diventa scudo
    polarita: Literal["", "buono", "cattivo"] = ""  # status personalizzato: positivo o negativo
    testo: Text = ""  # narrativo, o nota mostrata nel registro


class Effetto(_M):
    trigger: Trigger = Field(default_factory=Trigger)
    bersaglio: Bersaglio = Field(default_factory=Bersaglio)
    azione: Azione
    formula: Formula | None = None
    condizioni: list[Condizione] = Field(default_factory=list, max_length=6)
    scaling: list[Scaling] = Field(default_factory=list, max_length=4)
    probabilita: Pct = 100
    critico: Pct = 0  # % di critico in più per questo effetto
    ritardo: int = Field(0, ge=0, le=20)  # turni prima che scatti (bomba)
    figli: list["Effetto"] = Field(default_factory=list, max_length=6)


class Costo(_M):
    risorsa: Literal[tuple(RESOURCES)] = "MP"  # type: ignore[valid-type]
    valore: Pos = 0
    per: Literal["lancio", "turno"] = "lancio"
    status: Short = ""  # risorsa "stack": quale status si consuma


class Cooldown(_M):
    valore: int = Field(0, ge=0, le=999)
    unita: Literal[tuple(CD_UNITS)] = "turni"  # type: ignore[valid-type]


class Usi(_M):
    n: int = Field(1, ge=1, le=99)
    per: Literal["scontro", "giorno"] = "scontro"


class Durata(_M):
    tipo: Literal[tuple(DURATIONS)] = "istantaneo"  # type: ignore[valid-type]
    turni: int = Field(0, ge=0, le=99)
    interrompibile: bool = True


class Interazione(_M):
    dopo: Short  # nome di un'abilità o #etichetta
    entro_turni: int = Field(1, ge=1, le=10)
    consuma_status: Short = ""
    effetto: Effetto


class Rider(_M):
    """Effetto agganciato a ogni abilità con un'etichetta (es. ogni incantesimo #Vis lancia anche un Dardo)."""
    etichetta: Short
    effetto: Effetto | None = None
    grado: int = Field(0, ge=-10, le=10)  # potenziamento: +N al grado delle abilità con l'etichetta


class Mech(_M):
    v: Literal[1] = 1
    tipo: Literal[tuple(KINDS)] = "incantesimo"  # type: ignore[valid-type]
    costi: list[Costo] = Field(default_factory=list, max_length=4)
    cooldown: Cooldown = Field(default_factory=Cooldown)
    usi: Usi | None = None
    timing: Literal[tuple(TIMINGS)] = "mio_turno"  # type: ignore[valid-type]
    azione: Literal[tuple(ACTIONS)] = "principale"  # type: ignore[valid-type]
    durata: Durata = Field(default_factory=Durata)
    tiro_colpire: bool = True  # False = colpisce sempre (dardo magico)
    rischio: Pct = 0  # % di contraccolpo al lancio
    etichette: list[Short] = Field(default_factory=list, max_length=12)
    effetti: list[Effetto] = Field(default_factory=list, max_length=MAX_EFFECTS)
    interazioni: list[Interazione] = Field(default_factory=list, max_length=6)
    rider: list[Rider] = Field(default_factory=list, max_length=6)
    fusione: list[Short] = Field(default_factory=list, max_length=3)  # abilità richieste (sinergia)


Effetto.model_rebuild()


def _depth(effs: list[Effetto], d: int = 1) -> int:
    return max([d] + [_depth(e.figli, d + 1) for e in effs if e.figli])


def mech_errors(m: Mech) -> list[str]:
    """Regole di gioco oltre allo schema. Lista vuota = valida."""
    errs: list[str] = []
    if not m.effetti and m.tipo != "passiva" and not m.rider:
        errs.append("Aggiungi almeno un effetto.")
    if m.effetti and _depth(m.effetti) > MAX_DEPTH:
        errs.append(f"Al massimo {MAX_DEPTH} livelli di sotto-effetti.")
    for i, e in enumerate(_walk(m.effetti), 1):
        where = f"Effetto {i}"
        ev = e.trigger.evento
        if ev in REACTIVE_EVENTS and ev != "azione_nemica" and m.timing == "mio_turno" and m.tipo not in ("passiva",) \
                and m.durata.tipo == "istantaneo":
            errs.append(f"{where}: il trigger «{EVENTS[ev]}» scatta fuori dal tuo turno: usa una durata "
                        "(mantenuto, N turni), una passiva o il timing reazione.")
        if ev == "dopo_abilita" and not e.trigger.abilita.strip():
            errs.append(f"{where}: indica dopo quale abilità o #etichetta.")
        if ev == "soglia_hp" and not 0 < e.trigger.soglia < 100:
            errs.append(f"{where}: la soglia di vita va tra 1 e 99%.")
        op = e.azione.op
        if op in ("danno", "cura", "danno_e_cura", "scudo", "risorsa") and e.formula is None:
            errs.append(f"{where}: «{OPS[op]}» ha bisogno di una formula.")
        if op.startswith("status_") and not e.azione.status.strip():
            errs.append(f"{where}: scegli lo status.")
        if op == "esegui_sotto" and not 0 < e.azione.pct < 100:
            errs.append(f"{where}: la soglia di esecuzione va tra 1 e 99%.")
        if op == "evoca" and (not e.azione.nome.strip() or e.azione.hp <= 0):
            errs.append(f"{where}: l'evocazione ha bisogno di nome e vita.")
        if op == "stat_mod" and (not e.azione.stat or not e.azione.valore):
            errs.append(f"{where}: indica statistica e variazione.")
        f = e.formula
        if f is not None:
            if f.base == "intervallo" and f.max < f.min:
                errs.append(f"{where}: il massimo è minore del minimo.")
            if f.base in ("pct_hp", "pct_danno", "pct_eccesso") and f.pct <= 0:
                errs.append(f"{where}: indica la percentuale.")
            if f.base == "dadi" and not f.dadi.strip():
                errs.append(f"{where}: scrivi i dadi (es. 2d6+3).")
            if f.tipo not in DAMAGE_TYPES:
                errs.append(f"{where}: tipo di danno sconosciuto «{f.tipo}».")
        if e.bersaglio.forma == "catena" and e.bersaglio.n < 2:
            errs.append(f"{where}: una catena salta su almeno 2 bersagli.")
    if m.durata.tipo in ("turni", "canalizzato") and m.durata.turni < 1:
        errs.append("Durata: indica quanti turni.")
    for c in m.costi:
        if c.risorsa == "stack" and not c.status.strip():
            errs.append("Costo in stack: indica lo status che si consuma.")
    return errs


def _walk(effs: list[Effetto]):
    for e in effs:
        yield e
        yield from _walk(e.figli)


def parse(data: Any) -> tuple[Mech | None, list[str]]:
    """Valida un dict `mech`. Restituisce (Mech, []) oppure (None, errori leggibili)."""
    try:
        m = Mech.model_validate(data)
    except ValidationError as ex:
        out = []
        for e in ex.errors()[:8]:
            loc = ".".join(str(x) for x in e["loc"])
            out.append(f"{loc}: {e['msg']}")
        return None, out
    errs = mech_errors(m)
    return (None, errs) if errs else (m, [])


def dump(m: Mech) -> dict:
    return m.model_dump(mode="json")


# ---------- Descrizione leggibile ----------

def _n(x: float) -> str:
    v = round(x, 2)
    return str(int(v)) if float(v).is_integer() else str(v).replace(".", ",")


def describe_formula(f: Formula | None) -> str:
    if f is None:
        return ""
    t = "" if f.tipo in ("magico", "fisico") and f.base in ("incantesimo", "arma") else f" {f.tipo}"
    b = f.base
    if b == "fissa":
        s = _n(f.min)
    elif b == "intervallo":
        s = f"{_n(f.min)}–{_n(f.max)}"
    elif b == "dadi":
        s = f.dadi.replace(" ", "")
    elif b == "incantesimo":
        s = "15–30 × efficacia"
    elif b == "arma":
        s = "base arma"
    elif b == "pct_hp":
        q = {"max": "massima", "attuale": "attuale", "mancante": "mancante"}[f.quale]
        s = f"{_n(f.pct)}% della vita {q} di {'chi lancia' if f.di == 'se' else 'del bersaglio'}"
    elif b == "pct_danno":
        s = f"{_n(f.pct)}% del danno inflitto"
    else:
        s = f"{_n(f.pct)}% del danno in eccesso"
    if f.molt != "nessuno" and b not in ("incantesimo", "arma"):
        s += f" × {MULTS[f.molt].lower()}"
    elif b == "incantesimo":
        s += " × molt. magico"
    elif b == "arma":
        s += " × molt. fisico"
    if f.penetrazione:
        s += f", penetrazione {_n(f.penetrazione)}%"
    return s + t


def describe_effect(e: Effetto) -> str:
    a = e.azione
    op = a.op
    who = {"se": "su di sé", "alleato": "a un alleato", "nemico": "a un nemico", "qualsiasi": "a un bersaglio"}[
        e.bersaglio.lato]
    sh = e.bersaglio.forma
    if sh == "area":
        who = f"ad area ({'alleati' if e.bersaglio.lato == 'alleato' else 'nemici'}"
        who += f", raggio {_n(e.bersaglio.raggio)} m)" if e.bersaglio.raggio else ")"
    elif sh == "tutti":
        who = "a tutti gli " + ("alleati" if e.bersaglio.lato == "alleato" else "nemici")
    elif sh == "catena":
        who = f"a catena su {e.bersaglio.n} bersagli" + (f" (−{_n(e.bersaglio.calo)}% a salto)" if e.bersaglio.calo else "")
    elif sh == "casuale":
        who = f"a {e.bersaglio.n} bersagli casuali"
    f = describe_formula(e.formula)
    st = a.status
    dur = f" per {a.turni} turni" if a.turni else ""
    body = {
        "danno": f"infligge {f} {who}",
        "cura": f"cura {f} {who}" + (" (l'eccesso diventa scudo)" if a.eccesso_scudo else ""),
        "danno_e_cura": f"infligge {f} {who} e cura chi lancia del {_n(a.pct or 100)}% del danno",
        "scudo": f"dà uno scudo di {f} {who}{dur}",
        "status_applica": f"applica {st}" + (f" ×{a.stack}" if a.stack > 1 else "") + f" {who}{dur}",
        "status_rimuovi": f"rimuove {st} {who}",
        "status_consuma": f"consuma {st} {who}",
        "stat_mod": f"{'+' if a.valore >= 0 else '−'}{_n(abs(a.valore))}% {a.stat} {who}{dur}",
        "evoca": f"evoca {a.nome} ({_n(a.hp)} HP){dur}",
        "sposta": f"{a.modo or 'sposta'} {who}",
        "interrompi": f"interrompe l'abilità {who}",
        "reindirizza": "reindirizza il colpo su chi lancia",
        "dispel": f"dissolve gli effetti {'positivi' if a.modo != 'cattivi' else 'negativi'} {who}",
        "risorsa": f"{a.modo or 'dai'} {f} {(a.risorsa or 'mp').upper()} {who}",
        "ruba_buff": f"ruba un effetto positivo {who}",
        "cd_mod": f"{'riduce' if a.valore < 0 else 'allunga'} i cooldown di {_n(abs(a.valore))} turni {who}",
        "turno_mod": {"extra": "concede un turno extra", "anticipa": "anticipa il turno",
                      "ritarda": "ritarda il turno"}.get(a.modo, "modifica i turni") + f" {who}",
        "copia": "ripete l'ultima abilità usata dal bersaglio",
        "trasforma": f"assume la forma {a.nome}{dur}",
        "campo": f"crea il campo {a.nome}{dur}",
        "esegui_sotto": f"uccide {who} se ha meno del {_n(a.pct)}% di vita",
        "resuscita": f"riporta in vita un alleato al {_n(a.pct or 10)}% di vita",
        "salvavita": f"protegge {who} dalla morte una volta (resta a 1 HP)",
        "legame": f"lega chi lancia {who}: il {_n(a.pct or 50)}% del danno è diviso{dur}",
        "riflesso": f"riflette il {_n(a.pct)}% del danno subito{dur}",
        "doma": f"tenta di domare {who} (sotto il {_n(a.pct or 25)}% di vita)",
        "rivela": f"rivela {who} (annulla invisibilità)",
        "narrativo": a.testo or "effetto descrittivo",
    }[op]
    ev = e.trigger.evento
    pre = "" if ev == "al_lancio" else {
        "inizio_turno": "A inizio turno", "fine_turno": "A fine turno", "quando_colpito": "Quando viene colpito",
        "quando_colpisce": "Quando colpisce", "uccide": "Quando uccide", "muore": "Quando muore",
        "morte_alleato": "Quando muore un alleato", "azione_nemica": "Quando un nemico agisce",
        "dopo_abilita": f"Dopo {e.trigger.abilita}", "soglia_hp": f"Sotto il {_n(e.trigger.soglia)}% di vita",
        "passivo": "Sempre"}[ev] + ", "
    s = pre + body
    if e.probabilita < 100:
        s += f" ({_n(e.probabilita)}% di probabilità)"
    if e.ritardo:
        s += f" dopo {e.ritardo} turni"
    for c in e.condizioni:
        s += f"; se {('chi lancia' if c.soggetto == 'se' else 'il bersaglio')} {TESTS[c.test].lower()}"
        s += f" {c.status or c.testo or ''}".rstrip() + (f" {_n(c.valore)}" if c.valore else "")
    for sc in e.scaling:
        s += f"; +{_n(sc.passo)}% per {SCALES[sc.da].lower()}" + (f" (max {_n(sc.max)}%)" if sc.max else "")
    if e.figli:
        s += "; poi: " + "; ".join(describe_effect(x) for x in e.figli)
    return s[0].upper() + s[1:] if s else s


def describe(m: Mech) -> str:
    parts = []
    head = []
    if m.costi:
        head.append(" + ".join(f"{_n(c.valore)} {c.status if c.risorsa == 'stack' else c.risorsa}"
                               + ("/turno" if c.per == "turno" else "") for c in m.costi))
    if m.cooldown.valore:
        head.append(f"CD {m.cooldown.valore} {CD_UNITS[m.cooldown.unita]}")
    if m.usi:
        head.append(f"{m.usi.n}/{m.usi.per}")
    if m.timing != "mio_turno":
        head.append(TIMINGS[m.timing].lower())
    if m.durata.tipo != "istantaneo":
        d = DURATIONS[m.durata.tipo].lower()
        head.append(d.replace("per n turni", f"per {m.durata.turni} turni") if m.durata.tipo == "turni" else
                    f"{d} ({m.durata.turni} turni)" if m.durata.tipo == "canalizzato" else d)
    if head:
        parts.append(" · ".join(head) + ".")
    parts += [describe_effect(e) + "." for e in m.effetti]
    for i in m.interazioni:
        parts.append(f"Se lanciato entro {i.entro_turni} turni da {i.dopo}: " + describe_effect(i.effetto).lower() + ".")
    for r in m.rider:
        if r.effetto:
            parts.append(f"Ogni abilità #{r.etichetta.lstrip('#')}: " + describe_effect(r.effetto).lower() + ".")
        if r.grado:
            parts.append(f"Abilità #{r.etichetta.lstrip('#')}: {'+' if r.grado > 0 else ''}{r.grado} al grado.")
    if m.fusione:
        parts.append("Fusione di: " + ", ".join(m.fusione) + ".")
    if m.rischio:
        parts.append(f"Contraccolpo {_n(m.rischio)}%.")
    return " ".join(parts)


def vocabulary() -> dict:
    """Vocabolario per il client (Forgia, passo Meccanica)."""
    return {"events": EVENTS, "reactive": sorted(REACTIVE_EVENTS), "sides": SIDES, "shapes": SHAPES, "reach": REACH,
            "ops": OPS, "bases": FORMULA_BASES, "mults": MULTS, "damage_types": DAMAGE_TYPES, "tests": TESTS,
            "scales": SCALES, "timings": TIMINGS, "actions": ACTIONS, "durations": DURATIONS,
            "resources": RESOURCES, "cd_units": CD_UNITS, "kinds": KINDS, "max_effects": MAX_EFFECTS}


def finite(x: Any) -> bool:
    return isinstance(x, (int, float)) and math.isfinite(x)
