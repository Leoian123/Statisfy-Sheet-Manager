"""Motore di combattimento: risolve abilità con meccanica strutturata (`mech.py`) su uno stato di scontro.

Funzioni pure su dict, nessun accesso al DB. Lo stato (`state`) è quello salvato nella tabella `scontri`:
  round, ordine[ids], turno (indice in ordine), combattenti{id: combattente}, campo[], in_attesa[], registro[], seq

Combattente: id, nome, rif ("pg:3", "creatura:0:1", "evocazione:e7"), lato ("alleati"|"nemici"), hp/hp_max,
mp/mp_max, sp/sp_max, (ki/ki_max), stat{precisione, evasione, critico, blocco, difesa, difesaMag, moltFis, moltMag,
iniziativa}, arma[min,max], tipo, taglia, posizione, vivo, status[], cooldown{}, usi{}, contatori{}, storico[],
azioni{principale, bonus, reazione}, mantenuti[], abilita[{nome, grado, efficacia, mech}], evocazione?{fonte, turni}.

Tiri: ogni passo aleatorio ha una chiave ("colpo:<bers>", "danno:<percorso>:<bers>", …). Il valore arriva da
`tiri` (dado fisico del tavolo), altrimenti da `rng` (tiro del server). In anteprima si risolve due volte su copie
(tutti i tiri al minimo e al massimo, colpi sempre a segno, niente critici) per mostrare l'intervallo.
"""
from __future__ import annotations

import copy
import math
import random
from typing import Any

from . import status_catalog as SC
from .mech import Mech

POSITIONS = ["Mischia", "Media distanza", "Lunga distanza"]
HOSTILE_OPS = {"danno", "danno_e_cura", "status_applica", "stat_mod", "sposta", "interrompi", "dispel", "risorsa",
               "ruba_buff", "cd_mod", "esegui_sotto", "doma", "rivela", "status_consuma"}
MAX_CHAIN = 5
LOG_MAX = 300
STORICO_MAX = 60


class EngineError(Exception):
    """Azione non valida: il messaggio è per l'utente."""


def num(x: Any) -> float:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    return v if math.isfinite(v) else 0.0


def rnd(x: float) -> int:
    return int(math.floor(x + 0.5))


def fmt(x: float) -> str:
    return f"{rnd(x):,}".replace(",", ".")


# ---------- Contesto di risoluzione ----------

class Ctx:
    def __init__(self, state: dict, tiri: dict | None, rng: random.Random | None, mode: str = "real"):
        self.s = state
        self.tiri = {str(k): v for k, v in (tiri or {}).items()}
        self.rng = rng
        self.mode = mode  # real | min | max
        self.used: dict[str, float] = {}
        self.requests: list[dict] = []
        self.steps: list[str] = []
        self.queue: list[tuple] = []
        self.fired: set = set()
        self.depth = 0
        self.hit: dict[str, bool] = {}
        self.last_damage = 0.0
        self.overkill = 0.0
        self.consumati = 0
        self.turni_mantenuto = 0
        self.totals: dict[str, dict] = {}  # per anteprima: {bers: {danno, cura, scudo}}
        self.window: dict | None = None  # finestra di reazione in corso (reagisci)

    # Tiro d100: successo se valore ≤ soglia
    def check(self, key: str, label: str, soglia: float, want: bool = True) -> bool:
        soglia = max(0.0, min(100.0, soglia))
        self._req(key, "d100", label, 1, 100, soglia)
        if self.mode != "real":
            return want
        v = self._value(key, 1, 100)
        return v <= soglia

    def value(self, key: str, label: str, lo: float, hi: float) -> float:
        lo, hi = (lo, hi) if lo <= hi else (hi, lo)
        if lo != hi:  # un valore fisso non è un tiro
            self._req(key, "valore", label, lo, hi, None)
        if self.mode == "min":
            return lo
        if self.mode == "max":
            return hi
        if lo == hi:
            return lo
        return self._value(key, lo, hi)

    def _req(self, key, kind, label, lo, hi, soglia):
        if not any(r["key"] == key for r in self.requests):
            self.requests.append({"key": key, "tipo": kind, "label": label, "min": rnd(lo), "max": rnd(hi),
                                  "soglia": None if soglia is None else rnd(soglia)})

    def _value(self, key, lo, hi) -> float:
        if key in self.tiri:
            v = num(self.tiri[key])
            v = max(lo, min(hi, v))
        else:
            r = self.rng or random.Random()
            v = r.randint(int(math.ceil(lo)), int(math.floor(hi))) if hi - lo >= 1 else lo
        self.used[key] = v
        return v

    def log(self, text: str, kind: str = "azione"):
        reg = self.s.setdefault("registro", [])
        reg.append({"r": self.s.get("round", 1), "t": text, "k": kind})
        del reg[:-LOG_MAX]

    def step(self, text: str):
        self.steps.append(text)

    def tot(self, cid: str, k: str, v: float):
        d = self.totals.setdefault(cid, {})
        d[k] = d.get(k, 0) + v


# ---------- Accesso ai combattenti ----------

def C(s: dict, cid: str) -> dict:
    c = (s.get("combattenti") or {}).get(cid)
    if c is None:
        raise EngineError("Combattente non trovato.")
    return c


def alive(s: dict) -> list[dict]:
    return [c for c in s["combattenti"].values() if c.get("vivo", True)]


def enemies_of(s: dict, c: dict) -> list[dict]:
    return [x for x in alive(s) if x["lato"] != c["lato"]]


def allies_of(s: dict, c: dict) -> list[dict]:
    return [x for x in alive(s) if x["lato"] == c["lato"]]


def statuses(c: dict, mod: str | None = None, nome: str | None = None) -> list[dict]:
    out = c.get("status") or []
    if mod:
        out = [x for x in out if (x.get("mod") or {}).get(mod)]
    if nome:
        out = [x for x in out if x.get("nome") == nome]
    return out


def has(c: dict, mod: str) -> bool:
    return bool(statuses(c, mod))


def stat(c: dict, key: str) -> float:
    base = num((c.get("stat") or {}).get(key))
    pct = sum(num(x.get("valore")) for x in statuses(c, "stat_mod") if x.get("stat") == key)
    v = base * (1 + pct / 100)
    if key == "evasione" and has(c, "immobilizzato"):
        return 0.0
    return v


def hp_pct(c: dict) -> float:
    mx = num(c.get("hp_max")) or 1
    return num(c.get("hp")) / mx * 100


def ability(c: dict, nome: str) -> dict | None:
    key = nome.strip().lower()
    return next((a for a in c.get("abilita") or [] if a.get("nome", "").strip().lower() == key), None)


def mech_of(a: dict) -> Mech:
    m = a.get("_m")
    if m is None:
        m = Mech.model_validate(a["mech"])
    return m


def tags(a: dict) -> set[str]:
    m = mech_of(a)
    out = {t.lstrip("#").lower() for t in m.etichette}
    return out


def history(c: dict, ev: str, entro: int, rnow: int, ab: str = "") -> list[dict]:
    out = []
    for h in c.get("storico") or []:
        if h.get("ev") != ev:
            continue
        if entro and rnow - num(h.get("r")) > entro:
            continue
        if ab and h.get("ab", "").lower() != ab.lower() and ab.lstrip("#").lower() not in (h.get("tags") or []):
            continue
        out.append(h)
    return out


def remember(s: dict, c: dict, ev: str, **kw):
    st = c.setdefault("storico", [])
    st.append({"r": s.get("round", 1), "ev": ev, **kw})
    del st[:-STORICO_MAX]


# ---------- Condizioni, scaling, formule ----------

def cond_ok(ctx: Ctx, cond, src: dict, tgt: dict, ab: dict | None) -> bool:
    who = src if cond.soggetto == "se" else tgt
    t = cond.test
    if t == "ha_status":
        return bool(statuses(who, nome=cond.status))
    if t == "non_ha_status":
        return not statuses(who, nome=cond.status)
    if t == "hp_sotto":
        return hp_pct(who) < cond.valore
    if t == "hp_sopra":
        return hp_pct(who) > cond.valore
    if t == "tipo":
        return str(who.get("tipo", "")).lower() == cond.testo.lower()
    if t == "taglia":
        return str(who.get("taglia", "")).lower() == cond.testo.lower()
    if t == "stack_min":
        return sum(x["stack"] for x in statuses(who, nome=cond.status)) >= cond.valore
    if t == "lanci_min":
        return num((src.get("contatori") or {}).get(ab["nome"] if ab else "")) >= cond.valore
    if t == "storico":
        return len(history(who, cond.testo, cond.entro, ctx.s.get("round", 1))) >= max(1, cond.valore)
    if t == "invisibile":
        return has(who, "non_bersagliabile")
    return True


def scale_pct(ctx: Ctx, scs, src: dict, tgt: dict, ab: dict | None) -> float:
    total = 0.0
    for sc in scs:
        u = 0.0
        if sc.da == "stack":
            u = sum(x["stack"] for x in statuses(tgt, nome=sc.status)) or \
                sum(x["stack"] for x in statuses(src, nome=sc.status))
        elif sc.da == "consumati":
            u = ctx.consumati
        elif sc.da == "lanci":
            u = max(0.0, num((src.get("contatori") or {}).get(ab["nome"] if ab else "")) - 1)
        elif sc.da == "turni_mantenuto":
            u = ctx.turni_mantenuto
        elif sc.da == "hp_mancante_se":
            u = 100 - hp_pct(src)
        elif sc.da == "hp_mancante_bersaglio":
            u = 100 - hp_pct(tgt)
        elif sc.da == "storico":
            u = len(history(src, sc.evento, 0, ctx.s.get("round", 1)))
        elif sc.da == "grado":
            u = num(ab.get("grado")) if ab else 0
        v = sc.passo * u
        if sc.max:
            v = min(v, sc.max)
        total += v
    return total


def dice_range(expr: str) -> tuple[float, float]:
    e = expr.replace(" ", "").lower()
    if not e:
        return 0, 0
    if "d" not in e:
        return float(e), float(e)
    n, rest = e.split("d", 1)
    bonus = 0
    if "+" in rest:
        rest, b = rest.split("+", 1)
        bonus = int(b)
    elif "-" in rest:
        rest, b = rest.split("-", 1)
        bonus = -int(b)
    n, f = int(n or 1), int(rest)
    return n + bonus, n * f + bonus


def amount(ctx: Ctx, key: str, eff, src: dict, tgt: dict, ab: dict | None, label: str) -> float:
    f = eff.formula
    if f is None:
        return num(eff.azione.valore)
    b = f.base
    eff_lv = num(ab.get("efficacia") or ab.get("grado") or 1) if ab else 1
    if b == "fissa":
        lo = hi = f.min
    elif b == "intervallo":
        lo, hi = f.min, f.max
    elif b == "dadi":
        lo, hi = dice_range(f.dadi)
    elif b == "incantesimo":
        lo, hi = 15 * eff_lv, 30 * eff_lv
    elif b == "arma":
        lo, hi = (src.get("arma") or [10, 10])[:2]
    elif b == "pct_hp":
        who = src if f.di == "se" else tgt
        base = {"max": num(who.get("hp_max")), "attuale": num(who.get("hp")),
                "mancante": num(who.get("hp_max")) - num(who.get("hp"))}[f.quale]
        lo = hi = base * f.pct / 100
    elif b == "pct_danno":
        lo = hi = ctx.last_damage * f.pct / 100
    else:
        lo = hi = ctx.overkill * f.pct / 100
    v = ctx.value(key, label, lo, hi)
    mult = 1.0
    if b == "incantesimo":
        mult = num(stat(src, "moltMag")) or 1
    elif b == "arma":
        mult = num(stat(src, "moltFis")) or 1
    elif f.molt == "efficacia":
        mult = eff_lv
    elif f.molt != "nessuno":
        mult = num(stat(src, f.molt)) or 1
    sc = scale_pct(ctx, eff.scaling, src, tgt, ab)
    out = v * mult * (1 + sc / 100)
    ctx.step(f"{label}: {fmt(v)}" + (f" × {mult:.2f}".replace(".", ",") if mult != 1 else "")
             + (f" × (1 + {fmt(sc)}%)" if sc else "") + f" = {fmt(out)}")
    return out


# ---------- Danno, cura, morte ----------

def type_mod(c: dict, mod: str, tipo: str) -> float:
    return sum(num(x.get("valore")) for x in statuses(c, mod) if not x.get("stat") or x.get("stat") == tipo)


def deal(ctx: Ctx, src: dict, tgt: dict, raw: float, tipo: str, pen: float = 0, crit_bonus: float = 0,
         key: str = "", label: str = "", can_crit: bool = True, dot: bool = False) -> float:
    """Applica danno con tutti i modificatori. Restituisce il danno arrivato alla vita.
    `dot` = danno nel tempo: niente bonus di chi lo ha applicato, critico, blocco né difesa."""
    if not tgt.get("vivo", True):
        return 0.0
    dmg = raw
    bonus = 0 if dot else sum(num(x.get("valore")) * (-1 if x.get("negativo") else 1)
                              for x in statuses(src, "danno_bonus"))
    if bonus:
        dmg *= 1 + bonus / 100
        ctx.step(f"Danno {'+' if bonus > 0 else ''}{fmt(bonus)}% (effetti di {src['nome']})")
    if can_crit and not dot and ctx.check(f"crit:{key}", f"Critico ({label})", stat(src, "critico") + crit_bonus, want=False):
        dmg *= 2
        ctx.step("Critico ×2")
        ctx.log(f"Critico di {src['nome']}!", "colpo")
    mark = sum(num(x.get("valore")) for x in statuses(tgt, "marchio"))
    vuln = type_mod(tgt, "vulnerabilita", tipo)
    if mark or vuln:
        dmg *= 1 + (mark + vuln) / 100
        ctx.step(f"Marchio/vulnerabilità +{fmt(mark + vuln)}%")
    if tipo != "puro":
        res = type_mod(tgt, "resistenza", tipo) + num((tgt.get("resistenze") or {}).get(tipo))
        if res:
            eff_res = res * (1 - pen / 100)
            dmg *= max(0.0, 1 - eff_res / 100)
            ctx.step(f"Resistenza {fmt(res)}%" + (f" − penetrazione {fmt(pen)}%" if pen else ""))
        if dot:
            d = 0.0
        elif tipo == "fisico":
            if ctx.check(f"blocco:{key}", f"Blocco di {tgt['nome']}", stat(tgt, "blocco"), want=False):
                ctx.step(f"{tgt['nome']} blocca il colpo")
                ctx.log(f"{tgt['nome']} blocca il colpo.", "colpo")
                return 0.0
            d = stat(tgt, "difesa")
        else:
            d = stat(tgt, "difesaMag")
        if d > 0:
            dmg = max(1.0, dmg - d)
            ctx.step(f"Difesa −{fmt(d)}")
    if has(tgt, "invulnerabile"):
        ctx.step(f"{tgt['nome']} è invulnerabile")
        ctx.log(f"{tgt['nome']} è invulnerabile.", "colpo")
        return 0.0
    dmg = max(0.0, dmg)
    rest = dmg
    if tipo != "puro":
        for sh in statuses(tgt, "scudo"):
            if rest <= 0:
                break
            a = min(num(sh.get("valore")), rest)
            sh["valore"] = num(sh.get("valore")) - a
            rest -= a
            if a:
                ctx.log(f"{sh['nome']} di {tgt['nome']} assorbe {fmt(a)}.", "colpo")
        tgt["status"] = [x for x in tgt.get("status") or [] if not ((x.get("mod") or {}).get("scudo")
                                                                     and num(x.get("valore")) <= 0)]
    # Legame: parte del danno va a chi l'ha creato
    for lk in statuses(tgt, "legame"):
        f = ctx.s["combattenti"].get(lk.get("fonte") or "")
        if f and f.get("vivo", True) and f is not tgt and rest > 0:
            share = rest * num(lk.get("valore") or 50) / 100
            rest -= share
            f["hp"] = max(0.0, num(f["hp"]) - share)
            ctx.log(f"Legame: {f['nome']} subisce {fmt(share)} al posto di {tgt['nome']}.", "colpo")
            check_death(ctx, src, f, share)
    before = num(tgt["hp"])
    tgt["hp"] = max(0.0, before - rest)
    taken = before - tgt["hp"]
    ctx.overkill = max(0.0, rest - before)
    ctx.last_damage = taken
    ctx.tot(tgt["id"], "danno", taken)
    if rest > 0:
        ctx.log(f"{tgt['nome']} subisce {fmt(rest)} danni {tipo}. HP {fmt(tgt['hp'])}.", "danno")
    if taken > 0:
        tgt["status"] = [x for x in tgt.get("status") or [] if not (x.get("mod") or {}).get("si_rompe_colpito")]
        remember(ctx.s, tgt, "colpito", da=src["id"], n=rnd(taken))
        remember(ctx.s, src, "colpisce", a=tgt["id"], n=rnd(taken))
        ls = sum(num(x.get("valore")) for x in statuses(src, "furto_vita"))
        if ls:
            heal(ctx, src, src, taken * ls / 100, quiet=False)
        if src is not tgt:
            for sp in statuses(tgt, "riflesso"):
                back = taken * num(sp.get("valore")) / 100
                if back > 0 and src.get("vivo", True):
                    src["hp"] = max(0.0, num(src["hp"]) - back)
                    ctx.log(f"{sp['nome']}: {src['nome']} subisce {fmt(back)} danni riflessi.", "danno")
                    check_death(ctx, tgt, src, back)
        ctx.queue.append(("quando_colpito", tgt["id"], src["id"]))
        ctx.queue.append(("quando_colpisce", src["id"], tgt["id"]))
        for ab in tgt.get("abilita") or []:  # soglia di vita
            for e in mech_of(ab).effetti:
                if e.trigger.evento == "soglia_hp" and before / (num(tgt["hp_max"]) or 1) * 100 >= e.trigger.soglia \
                        > hp_pct(tgt):
                    ctx.queue.append(("soglia_hp", tgt["id"], src["id"]))
                    break
    check_death(ctx, src, tgt, taken)
    return taken


def heal(ctx: Ctx, src: dict, tgt: dict, val: float, overshield: bool = False, quiet: bool = False) -> float:
    if not tgt.get("vivo", True) or val <= 0:
        return 0.0
    anti = sum(num(x.get("valore")) for x in statuses(tgt, "anti_cura"))
    if anti:
        val *= max(0.0, 1 - anti / 100)
        ctx.step(f"Anti-cura −{fmt(anti)}%")
    room = num(tgt["hp_max"]) - num(tgt["hp"])
    gain = max(0.0, min(val, room))
    tgt["hp"] = num(tgt["hp"]) + gain
    ctx.tot(tgt["id"], "cura", gain)
    if not quiet:
        ctx.log(f"{tgt['nome']} recupera {fmt(gain)} HP. HP {fmt(tgt['hp'])}.", "cura")
    extra = val - gain
    if overshield and extra > 0:
        add_status(ctx, src, tgt, "Scudo", valore=extra, turni=3)
        ctx.log(f"La cura in eccesso diventa uno scudo di {fmt(extra)}.", "cura")
    return gain


def check_death(ctx: Ctx, src: dict, tgt: dict, dealt: float):
    if num(tgt.get("hp")) > 0 or not tgt.get("vivo", True):
        return
    sv = statuses(tgt, "salvavita")
    if sv:
        tgt["hp"] = 1.0
        tgt["status"] = [x for x in tgt["status"] if x is not sv[0]]
        ctx.log(f"{sv[0]['nome']}: {tgt['nome']} resta a 1 HP.", "colpo")
        return
    tgt["vivo"] = False
    ctx.log(f"{tgt['nome']} è a terra.", "morte")
    remember(ctx.s, tgt, "muore", da=src["id"])
    remember(ctx.s, src, "uccide", a=tgt["id"])
    ctx.queue.append(("muore", tgt["id"], src["id"]))
    ctx.queue.append(("uccide", src["id"], tgt["id"]))
    for a in allies_of(ctx.s, tgt):
        ctx.queue.append(("morte_alleato", a["id"], tgt["id"]))
    # Le evocazioni di chi muore svaniscono; i mantenuti si interrompono
    tgt["mantenuti"] = []
    for c in list(ctx.s["combattenti"].values()):
        ev = c.get("evocazione") or {}
        if ev.get("fonte") == tgt["id"] and c.get("vivo", True):
            c["vivo"] = False
            ctx.log(f"{c['nome']} svanisce.", "morte")


# ---------- Status ----------

def add_status(ctx: Ctx, src: dict, tgt: dict, nome: str, stack: int = 1, turni: int = 0, valore: float = 0,
               stat_key: str = "", polarita: str = "") -> dict | None:
    if not tgt.get("vivo", True):
        return None
    if nome == "Invisibile" and has(tgt, "rivelato"):
        ctx.log(f"{tgt['nome']} è rivelato: niente invisibilità.", "status")
        return None
    d = SC.STATUS.get(nome, {})
    cur = next((x for x in tgt.setdefault("status", []) if x["nome"] == nome
                and (x.get("stat") or "") == (stat_key or d.get("tipo", ""))), None)
    smax = int(d.get("stack_max") or 99)
    if cur:
        cur["stack"] = min(smax, cur["stack"] + stack)
        cur["turni"] = max(cur["turni"], turni) if cur["turni"] and turni else (turni or cur["turni"])
        if (cur.get("mod") or {}).get("scudo"):
            cur["valore"] = num(cur["valore"]) + valore
        else:
            cur["valore"] = max(num(cur["valore"]), valore)
        st = cur
    else:
        st = SC.make(nome, stack=min(smax, stack), turni=turni, valore=valore, stat=stat_key, fonte=src["id"],
                     polarita=polarita)
        tgt["status"].append(st)
    ctx.log(f"{tgt['nome']}: {nome}" + (f" ×{st['stack']}" if st["stack"] > 1 else "")
            + (f" ({turni} turni)" if turni else "") + ".", "status")
    remember(ctx.s, tgt, "status", nome=nome)
    soglia = d.get("soglia")
    if soglia and st["stack"] >= soglia:
        tgt["status"].remove(st)
        nxt = d.get("diventa")
        if nxt:
            ctx.log(f"{tgt['nome']}: {soglia} stack di {nome} → {nxt}.", "status")
            add_status(ctx, src, tgt, nxt, turni=1)
    if has(tgt, "salta_turno"):
        tgt["mantenuti"] = []  # chi perde il turno interrompe ciò che mantiene
        for w in ctx.s.get("in_attesa") or []:
            if w.get("tipo") == "canalizzazione" and w.get("fonte") == tgt["id"]:
                w["annullata"] = True
    return st


def remove_status(tgt: dict, pred) -> list[dict]:
    out = [x for x in tgt.get("status") or [] if pred(x)]
    tgt["status"] = [x for x in tgt.get("status") or [] if not pred(x)]
    return out


# ---------- Bersagli ----------

def pick_targets(ctx: Ctx, src: dict, eff, chosen: list[str], path: str) -> list[dict]:
    s = ctx.s
    b = eff.bersaglio
    if b.lato == "se":
        return [src]
    hostile = b.lato == "nemico"
    side_allies = b.lato == "alleato"
    if has(src, "charme"):
        hostile, side_allies = side_allies, hostile
    pool = enemies_of(s, src) if hostile else allies_of(s, src) if side_allies else alive(s)
    if eff.azione.op == "resuscita":  # la resurrezione sceglie tra gli alleati a terra
        pool = [c for c in s["combattenti"].values() if c["lato"] == src["lato"] and not c.get("vivo", True)]
        picked = [s["combattenti"][x] for x in chosen if x in s["combattenti"] and s["combattenti"][x] in pool]
        return (picked or pool)[:1]
    if hostile and b.forma in ("singolo", "catena", "casuale"):
        pool = [c for c in pool if not has(c, "non_bersagliabile")]
    picked = [s["combattenti"][x] for x in chosen if x in s["combattenti"]
              and s["combattenti"][x].get("vivo", True)]
    picked = [c for c in picked if c in pool]
    if hostile:
        taunt = next((x for x in statuses(src, "provocazione")
                      if x.get("fonte") in s["combattenti"] and s["combattenti"][x["fonte"]].get("vivo", True)), None)
        if taunt and b.forma == "singolo":
            forced = s["combattenti"][taunt["fonte"]]
            if forced in pool:
                if picked and picked[0] is not forced:
                    ctx.log(f"{src['nome']} è provocato: colpisce {forced['nome']}.", "status")
                picked = [forced]
    if has(src, "confuso") and pool and b.forma == "singolo":
        i = int(ctx.value(f"confuso:{path}", f"Bersaglio casuale di {src['nome']} (confuso)", 1, len(pool))) - 1
        picked = [pool[max(0, min(len(pool) - 1, i))]]
    if b.forma == "singolo":
        if not picked:
            hidden = [s["combattenti"][x]["nome"] for x in chosen if x in s["combattenti"]
                      and s["combattenti"][x]["lato"] != src["lato"] and s["combattenti"][x] not in pool
                      and s["combattenti"][x].get("vivo", True)]
            if hostile and hidden:
                raise EngineError(f"{hidden[0]} non può essere scelto come bersaglio.")
            if not hostile and b.lato in ("alleato", "qualsiasi"):
                return [src]  # nessun alleato scelto: l'effetto va su chi lancia
            if len(pool) == 1:
                return pool
            raise EngineError("Scegli un bersaglio valido.")
        return picked[:1]
    if b.forma == "tutti":
        return pool
    if b.forma == "area":
        return (picked or pool)[: b.n if b.n > 1 else len(pool)]
    if b.forma == "catena":
        if not picked:
            picked = pool
        return picked[: b.n]
    # casuale
    rest = list(pool)
    out = []
    for k in range(min(b.n, len(rest))):
        i = int(ctx.value(f"caso:{path}:{k}", "Bersaglio casuale", 1, len(rest))) - 1
        out.append(rest.pop(max(0, min(len(rest) - 1, i))))
    return out


# ---------- Effetti ----------

def is_hostile(eff, src: dict, tgt: dict) -> bool:
    if tgt["lato"] == src["lato"]:
        return False
    op = eff.azione.op
    if op == "status_applica":
        d = SC.STATUS.get(eff.azione.status, {})
        return (d.get("polarita") or eff.azione.polarita or "cattivo") == "cattivo"
    if op == "stat_mod":
        return eff.azione.valore < 0
    return op in HOSTILE_OPS


def run_effects(ctx: Ctx, src: dict, effs, chosen: list[str], ab: dict | None, path: str, roll_hit: bool,
                only_event: str | None = "al_lancio", ev_target: dict | None = None):
    for i, eff in enumerate(effs):
        if only_event and eff.trigger.evento != only_event:
            continue
        p = f"{path}.{i}"
        if eff.ritardo:
            ctx.s.setdefault("in_attesa", []).append({
                "id": new_id(ctx.s, "b"), "tipo": "bomba", "fonte": src["id"], "turni": eff.ritardo,
                "abilita": ab["nome"] if ab else "", "effetto": eff.model_dump(mode="json"),
                "bersagli": [t["id"] for t in pick_targets(ctx, src, eff, chosen, p)]})
            ctx.log(f"{ab['nome'] if ab else 'Effetto'}: scatterà tra {eff.ritardo} turni.", "azione")
            continue
        targets = [ev_target] if ev_target is not None and eff.bersaglio.lato != "se" and eff.bersaglio.forma == "singolo" \
            else pick_targets(ctx, src, eff, chosen, p)
        calo = 1.0
        for k, tgt in enumerate(targets):
            tk = f"{p}:{tgt['id']}"
            if not all(cond_ok(ctx, c, src, tgt, ab) for c in eff.condizioni):
                ctx.step(f"{tgt['nome']}: condizione non soddisfatta")
                continue
            if eff.probabilita < 100 and not ctx.check(f"proc:{tk}", f"Probabilità {fmt(eff.probabilita)}%",
                                                       eff.probabilita):
                ctx.step(f"{tgt['nome']}: l'effetto non scatta")
                continue
            if roll_hit and is_hostile(eff, src, tgt):
                if tgt["id"] not in ctx.hit:
                    soglia = max(5.0, min(95.0, stat(src, "precisione") - stat(tgt, "evasione")))
                    ok = ctx.check(f"colpo:{tgt['id']}", f"Colpire {tgt['nome']} (≤ {fmt(soglia)})", soglia)
                    ctx.hit[tgt["id"]] = ok
                    if not ok:
                        ctx.log(f"{src['nome']} manca {tgt['nome']}.", "colpo")
                if not ctx.hit[tgt["id"]]:
                    continue
            apply_op(ctx, src, tgt, eff, ab, tk, calo)
            if eff.figli and tgt.get("vivo", True) or eff.figli and eff.azione.op in ("danno", "esegui_sotto"):
                run_effects(ctx, src, eff.figli, [tgt["id"]], ab, p + ".f", False, only_event=None, ev_target=tgt)
            if eff.bersaglio.forma == "catena":
                calo *= max(0.0, 1 - eff.bersaglio.calo / 100)


def apply_op(ctx: Ctx, src: dict, tgt: dict, eff, ab: dict | None, key: str, calo: float = 1.0):
    a = eff.azione
    op = a.op
    s = ctx.s
    abn = ab["nome"] if ab else "Effetto"
    label = f"{abn} → {tgt['nome']}"
    f = eff.formula
    if op in ("danno", "danno_e_cura"):
        raw = amount(ctx, f"danno:{key}", eff, src, tgt, ab, label) * calo
        got = deal(ctx, src, tgt, raw, f.tipo if f else "magico", f.penetrazione if f else 0, eff.critico, key, label)
        if op == "danno_e_cura" and got > 0:
            heal(ctx, src, src, got * (a.pct or 100) / 100)
    elif op == "cura":
        v = amount(ctx, f"cura:{key}", eff, src, tgt, ab, label) * calo
        heal(ctx, src, tgt, v, a.eccesso_scudo)
    elif op == "scudo":
        v = amount(ctx, f"scudo:{key}", eff, src, tgt, ab, label) * calo
        add_status(ctx, src, tgt, "Scudo", valore=v, turni=a.turni)
        ctx.tot(tgt["id"], "scudo", v)
    elif op == "status_applica":
        v = amount(ctx, f"val:{key}", eff, src, tgt, ab, label) if f else num(a.valore)
        add_status(ctx, src, tgt, a.status, a.stack, a.turni, v, a.stat, a.polarita)
    elif op == "status_rimuovi":
        gone = remove_status(tgt, lambda x: x["nome"] == a.status)
        if gone:
            ctx.log(f"{tgt['nome']}: {a.status} rimosso.", "status")
    elif op == "status_consuma":
        gone = remove_status(tgt, lambda x: x["nome"] == a.status)
        ctx.consumati = sum(x["stack"] for x in gone)
        if gone:
            ctx.log(f"{abn} consuma {ctx.consumati} stack di {a.status} su {tgt['nome']}.", "status")
    elif op == "stat_mod":
        pol = "buono" if a.valore >= 0 else "cattivo"
        st = add_status(ctx, src, tgt, f"Modifica: {a.stat}", 1, a.turni, a.valore, a.stat, pol)
        if st:
            st["mod"] = {"stat_mod": True}
    elif op == "evoca":
        cid = new_id(s, "e")
        dmg = (f.min, f.max if f.base == "intervallo" else f.min) if f else (0, 0)
        s["combattenti"][cid] = {
            "id": cid, "nome": a.nome, "rif": f"evocazione:{cid}", "lato": src["lato"], "hp": a.hp, "hp_max": a.hp,
            "mp": 0, "mp_max": 0, "sp": 0, "sp_max": 0, "vivo": True, "tipo": "evocazione", "taglia": "Normale",
            "stat": {"precisione": stat(src, "precisione"), "evasione": 10, "critico": 5, "blocco": 0, "difesa": 0,
                     "difesaMag": 0, "moltFis": 1, "moltMag": 1, "iniziativa": stat(src, "iniziativa")},
            "arma": list(dmg), "posizione": src.get("posizione", "Mischia"), "status": [], "cooldown": {},
            "usi": {}, "contatori": {}, "storico": [], "mantenuti": [],
            "azioni": {"principale": 0, "bonus": 0, "reazione": 0},
            "abilita": [basic_attack(list(dmg), "fisico")] if dmg[1] else [],
            "evocazione": {"fonte": src["id"], "turni": a.turni}}
        order = s.setdefault("ordine", [])
        at = order.index(src["id"]) + 1 if src["id"] in order else len(order)
        order.insert(at, cid)
        if at <= s.get("turno", 0):
            s["turno"] = s.get("turno", 0) + 1
        ctx.log(f"{src['nome']} evoca {a.nome} ({fmt(a.hp)} HP" + (f", {a.turni} turni" if a.turni else "") + ").",
                "azione")
    elif op == "sposta":
        if has(tgt, "immobilizzato"):
            ctx.log(f"{tgt['nome']} è immobilizzato e non si sposta.", "status")
            return
        m = a.modo or "spingi"
        if m == "scambia":
            src["posizione"], tgt["posizione"] = tgt.get("posizione"), src.get("posizione")
        else:
            cur = tgt.get("posizione") if tgt.get("posizione") in POSITIONS else "Mischia"
            i = POSITIONS.index(cur) + (1 if m == "spingi" else -1)
            tgt["posizione"] = POSITIONS[max(0, min(len(POSITIONS) - 1, i))]
        ctx.log(f"{tgt['nome']} → {tgt['posizione']}.", "azione")
    elif op == "interrompi":
        done = False
        for w in s.get("in_attesa") or []:
            if w.get("fonte") == tgt["id"] and w.get("tipo") == "canalizzazione" and not w.get("annullata"):
                w["annullata"] = True
                done = True
        if ctx.window and ctx.window.get("attore") == tgt["id"]:
            ctx.window["interrotta"] = True
            done = True
        if tgt.get("mantenuti"):
            tgt["mantenuti"] = []
            done = True
        ctx.log(f"{abn}: " + (f"{tgt['nome']} viene interrotto." if done else f"{tgt['nome']} non stava lanciando nulla."),
                "azione")
    elif op == "reindirizza":
        if ctx.window:
            ctx.window["reindirizza"] = src["id"] if tgt is src else tgt["id"]
            ctx.log(f"{abn}: il colpo viene reindirizzato su {s['combattenti'][ctx.window['reindirizza']]['nome']}.",
                    "azione")
    elif op == "dispel":
        want = "cattivo" if a.modo == "cattivi" else "buono"
        n = max(1, a.stack)
        cand = [x for x in tgt.get("status") or [] if x.get("polarita") == want and x.get("dispellabile", True)][:n]
        tgt["status"] = [x for x in tgt.get("status") or [] if x not in cand]
        ctx.log(f"{abn}: {tgt['nome']} perde " + (", ".join(x["nome"] for x in cand) if cand else "nulla") + ".",
                "status")
    elif op == "risorsa":
        k = a.risorsa or "mp"
        v = amount(ctx, f"ris:{key}", eff, src, tgt, ab, label) * calo
        m = a.modo or "dai"
        if m == "dai":
            got = min(v, num(tgt.get(f"{k}_max")) - num(tgt.get(k)))
            tgt[k] = num(tgt.get(k)) + max(0.0, got)
            ctx.log(f"{tgt['nome']} recupera {fmt(got)} {k.upper()}.", "cura")
        else:
            got = min(v, num(tgt.get(k)))
            tgt[k] = num(tgt.get(k)) - got
            ctx.log(f"{tgt['nome']} perde {fmt(got)} {k.upper()}.", "danno")
            if m == "ruba":
                g2 = min(got, num(src.get(f"{k}_max")) - num(src.get(k)))
                src[k] = num(src.get(k)) + max(0.0, g2)
                ctx.log(f"{src['nome']} ruba {fmt(g2)} {k.upper()}.", "cura")
            if k == "hp":
                check_death(ctx, src, tgt, got)
    elif op == "ruba_buff":
        buff = next((x for x in tgt.get("status") or [] if x.get("polarita") == "buono" and x.get("dispellabile", True)),
                    None)
        if buff:
            tgt["status"].remove(buff)
            buff["fonte"] = src["id"]
            src.setdefault("status", []).append(buff)
            ctx.log(f"{src['nome']} ruba {buff['nome']} a {tgt['nome']}.", "status")
    elif op == "cd_mod":
        d = int(a.valore)
        for k in list((tgt.get("cooldown") or {}).keys()):
            tgt["cooldown"][k] = max(0, int(tgt["cooldown"][k]) + d)
            if tgt["cooldown"][k] == 0:
                del tgt["cooldown"][k]
        ctx.log(f"{abn}: cooldown di {tgt['nome']} {'+' if d > 0 else ''}{d}.", "azione")
    elif op == "turno_mod":
        order = s["ordine"]
        m = a.modo or "extra"
        if m == "extra":
            tgt.setdefault("azioni", {})["principale"] = int(tgt["azioni"].get("principale", 0)) + max(1, int(a.valore or 1))
            ctx.log(f"{tgt['nome']} ottiene un'azione in più.", "azione")
        elif tgt["id"] in order:
            cur = order[s.get("turno", 0)]
            order.remove(tgt["id"])
            if m == "anticipa":
                order.insert(order.index(cur) + 1, tgt["id"])
            else:
                order.append(tgt["id"])
            s["turno"] = order.index(cur)
            ctx.log(f"{tgt['nome']}: turno {'anticipato' if m == 'anticipa' else 'ritardato'}.", "azione")
    elif op == "copia":
        last = next((h for h in reversed(tgt.get("storico") or []) if h.get("ev") == "lancio"), None)
        cab = ability(tgt, last["ab"]) if last else None
        if not cab:
            ctx.log(f"{abn}: {tgt['nome']} non ha usato abilità da copiare.", "azione")
            return
        ctx.log(f"{src['nome']} copia {cab['nome']}.", "azione")
        run_effects(ctx, src, mech_of(cab).effetti, [tgt["id"]], {**cab, "_m": mech_of(cab)}, key + ".copia", True)
    elif op == "trasforma":
        remove_status(tgt, lambda x: str(x["nome"]).startswith("Forma: "))
        add_status(ctx, src, tgt, f"Forma: {a.nome}", turni=a.turni, polarita="buono")
    elif op == "campo":
        s.setdefault("campo", []).append({"nome": a.nome or abn, "turni": a.turni, "fonte": src["id"],
                                          "lato": src["lato"], "effetti": [e.model_dump(mode="json") for e in eff.figli]})
        ctx.log(f"Campo: {a.nome or abn}" + (f" ({a.turni} turni)" if a.turni else "") + ".", "azione")
    elif op == "esegui_sotto":
        if hp_pct(tgt) <= a.pct:
            ctx.log(f"{abn}: esecuzione di {tgt['nome']}.", "colpo")
            deal(ctx, src, tgt, num(tgt["hp"]) + 1, "puro", key=key, label=label, can_crit=False)
        else:
            ctx.step(f"{tgt['nome']} sopra il {fmt(a.pct)}%: niente esecuzione")
    elif op == "resuscita":
        if not tgt.get("vivo", True):
            tgt["vivo"] = True
            tgt["hp"] = max(1.0, num(tgt["hp_max"]) * (a.pct or 10) / 100)
            ctx.log(f"{tgt['nome']} torna in vita con {fmt(tgt['hp'])} HP.", "cura")
    elif op == "salvavita":
        add_status(ctx, src, tgt, "Salvavita", turni=a.turni)
    elif op == "legame":
        add_status(ctx, src, tgt, "Legame", turni=a.turni, valore=a.pct or 50)
    elif op == "riflesso":
        add_status(ctx, src, tgt, "Spine", turni=a.turni, valore=a.pct)
    elif op == "doma":
        soglia = a.pct or 25
        if hp_pct(tgt) > soglia:
            ctx.log(f"{tgt['nome']} è troppo in forze per essere domato.", "azione")
        elif ctx.check(f"doma:{key}", f"Domare {tgt['nome']}", eff.probabilita if eff.probabilita < 100 else 50):
            tgt["lato"] = src["lato"]
            tgt["status"] = [x for x in tgt.get("status") or [] if x.get("polarita") != "cattivo"]
            ctx.log(f"{tgt['nome']} è domato e passa con {src['nome']}.", "azione")
        else:
            ctx.log(f"{tgt['nome']} resiste.", "azione")
    elif op == "rivela":
        remove_status(tgt, lambda x: (x.get("mod") or {}).get("non_bersagliabile"))
        add_status(ctx, src, tgt, "Rivelato", turni=a.turni or 1)
        st = tgt.get("stat") or {}
        ctx.log(f"{tgt['nome']}: HP {fmt(tgt['hp'])}/{fmt(tgt['hp_max'])}, precisione {fmt(st.get('precisione', 0))}, "
                f"evasione {fmt(st.get('evasione', 0))}.", "azione")
    elif op == "narrativo":
        ctx.log(f"{abn}: {a.testo or 'effetto descrittivo'}", "azione")
    if a.testo and op != "narrativo":
        ctx.log(a.testo, "azione")


# ---------- Eventi (trigger a catena) ----------

def listeners(c: dict) -> list[tuple[dict, Any]]:
    """Abilità del combattente che ascoltano eventi: passive, mantenute o a durata attiva."""
    active = {m.get("abilita") for m in c.get("mantenuti") or []}
    out = []
    for ab in c.get("abilita") or []:
        m = mech_of(ab)
        if m.tipo == "passiva" or ab["nome"] in active:
            out.append((ab, m))
    return out


def drain(ctx: Ctx):
    while ctx.queue:
        ev, owner_id, other_id = ctx.queue.pop(0)
        if ctx.depth >= MAX_CHAIN:
            ctx.queue.clear()
            ctx.log("Catena di effetti interrotta (troppi trigger in fila).", "avviso")
            return
        owner = ctx.s["combattenti"].get(owner_id)
        other = ctx.s["combattenti"].get(other_id)
        if not owner or (not owner.get("vivo", True) and ev != "muore"):
            continue
        for ab, m in listeners(owner):
            effs = [e for e in m.effetti if e.trigger.evento == ev]
            if not effs:
                continue
            fk = (owner_id, ab["nome"], ev)
            if fk in ctx.fired:
                continue
            ctx.fired.add(fk)
            ctx.depth += 1
            ctx.log(f"{ab['nome']} di {owner['nome']} si attiva.", "trigger")
            for e in effs:
                run_effects(ctx, owner, [e], [other_id] if other else [], {**ab, "_m": m}, f"ev.{ev}", False,
                            only_event=None, ev_target=other if other and other is not owner else None)
            ctx.depth -= 1


def enemy_acted(ctx: Ctx, actor: dict, kind: str):
    """Trappole e rune: scattano quando un nemico compie un'azione."""
    for w in list(ctx.s.get("in_attesa") or []):
        if w.get("tipo") != "trappola" or w.get("lato") == actor["lato"]:
            continue
        want = w.get("su", "")
        if want and want != kind:
            continue
        owner = ctx.s["combattenti"].get(w["fonte"])
        if not owner:
            continue
        ctx.s["in_attesa"].remove(w)
        ctx.log(f"Trappola {w.get('abilita', '')} di {owner['nome']} scatta su {actor['nome']}!", "trigger")
        e = Mech.model_validate({"effetti": [w["effetto"]]}).effetti[0]
        run_effects(ctx, owner, [e], [actor["id"]], None, f"trap.{w['id']}", False, only_event=None, ev_target=actor)


# ---------- Azioni ----------

def new_id(s: dict, prefix: str) -> str:
    s["seq"] = int(s.get("seq", 0)) + 1
    return f"{prefix}{s['seq']}"


def basic_attack(arma: list, tipo: str = "fisico", nome: str = "Attacco") -> dict:
    lo, hi = (arma + [arma[0]])[:2] if arma else (10, 10)
    m = {"tipo": "attacco", "azione": "principale", "etichette": ["Arma"],
         "effetti": [{"azione": {"op": "danno"}, "formula": {"base": "intervallo", "min": lo, "max": hi,
                                                            "molt": "moltFis", "tipo": tipo}}]}
    return {"nome": nome, "grado": 1, "efficacia": 1, "mech": m, "base": True}


def current(s: dict) -> dict | None:
    order = s.get("ordine") or []
    if not order:
        return None
    return s["combattenti"].get(order[s.get("turno", 0) % len(order)])


def can_use(s: dict, c: dict, ab: dict, m: Mech, reaction: bool, force: bool) -> str | None:
    if not c.get("vivo", True):
        return f"{c['nome']} è a terra."
    if m.tipo == "passiva":
        return f"{ab['nome']} è una passiva: non si lancia."
    if has(c, "salta_turno"):
        return f"{c['nome']} non può agire ({', '.join(x['nome'] for x in statuses(c, 'salta_turno'))})."
    if has(c, "silenzio") and m.tipo in ("incantesimo", "miracolo"):
        return f"{c['nome']} è silenziato."
    if has(c, "disarmo") and m.tipo == "attacco":
        return f"{c['nome']} è disarmato."
    if not force:
        cur = current(s)
        if reaction:
            if m.timing == "mio_turno":
                return f"{ab['nome']} non si può usare come reazione."
        elif cur is None or cur["id"] != c["id"]:
            if m.timing == "reazione":
                return f"{ab['nome']} si usa solo come reazione."
            return f"Non è il turno di {c['nome']}."
        elif m.timing == "reazione":
            return f"{ab['nome']} si usa solo come reazione."
    cd = int((c.get("cooldown") or {}).get(ab["nome"], 0))
    if cd > 0:
        return f"{ab['nome']} è in ricarica ({cd} turni)."
    if (c.get("ricarica_reale") or {}).get(ab["nome"]):
        return f"{ab['nome']} è in ricarica fino a {c['ricarica_reale'][ab['nome']]}."
    if m.usi and int((c.get("usi") or {}).get(ab["nome"], 0)) >= m.usi.n:
        return f"{ab['nome']}: usi esauriti ({m.usi.n} per {m.usi.per})."
    for need in m.fusione:
        if not ability(c, need):
            return f"{ab['nome']} è una fusione: serve conoscere {need}."
    for k in m.costi:
        if k.per != "lancio":
            continue
        if k.risorsa in ("MP", "SP", "KI", "HP") and num(c.get(k.risorsa.lower())) < k.valore:
            return f"{k.risorsa} insufficienti per {ab['nome']}: servono {fmt(k.valore)}."
        if k.risorsa == "stack" and sum(x["stack"] for x in statuses(c, nome=k.status)) < k.valore:
            return f"Servono {fmt(k.valore)} stack di {k.status}."
        if k.risorsa == "cariche" and num((c.get("cariche") or {}).get(ab["nome"], k.valore)) <= 0:
            return f"{ab['nome']}: cariche esaurite."
    if not force:
        slot = "reazione" if reaction else m.azione
        if slot != "libera":
            have = int((c.get("azioni") or {}).get(slot, 0))
            if have <= 0 and not (slot == "principale" and m.tipo == "incantesimo" and c.get("lancio_doppio")):
                return f"{c['nome']} ha già usato l'azione {slot} in questo turno."
    return None


def pay(ctx: Ctx, c: dict, ab: dict, m: Mech, reaction: bool, force: bool):
    for k in m.costi:
        if k.per != "lancio":
            continue
        if k.risorsa in ("MP", "SP", "KI", "HP"):
            key = k.risorsa.lower()
            c[key] = max(0.0, num(c.get(key)) - k.valore)
        elif k.risorsa == "stack":
            left = k.valore
            for x in statuses(c, nome=k.status):
                take = min(left, x["stack"])
                x["stack"] -= take
                left -= take
            c["status"] = [x for x in c.get("status") or [] if x["stack"] > 0]
        elif k.risorsa == "cariche":
            ch = c.setdefault("cariche", {})
            ch[ab["nome"]] = num(ch.get(ab["nome"], k.valore)) - 1
    if m.cooldown.valore:
        if m.cooldown.unita == "turni":
            c.setdefault("cooldown", {})[ab["nome"]] = m.cooldown.valore + 1  # scala a fine turno di chi lancia
        else:
            c.setdefault("ricarica_reale", {})[ab["nome"]] = f"{m.cooldown.valore} {m.cooldown.unita}"
    if m.usi:
        c.setdefault("usi", {})[ab["nome"]] = int(c["usi"].get(ab["nome"], 0)) + 1
    c.setdefault("contatori", {})[ab["nome"]] = int(c["contatori"].get(ab["nome"], 0)) + 1
    if not force:
        slot = "reazione" if reaction else m.azione
        if slot != "libera":
            az = c.setdefault("azioni", {})
            if slot == "principale" and m.tipo == "incantesimo" and c.get("lancio_doppio"):
                c["lancio_doppio"] = False  # il secondo incantesimo dello stesso turno è gratis
            else:
                az[slot] = int(az.get(slot, 0)) - 1
                if slot == "principale" and m.tipo == "incantesimo" and has(c, "lanci_doppi"):
                    c["lancio_doppio"] = True


def reveal(ctx: Ctx, c: dict, before: list[dict]):
    """Dopo aver agito: finiscono gli status che si rompono agendo e che c'erano già prima dell'azione
    (l'invisibilità vale ancora per il colpo; quella appena lanciata resta)."""
    gone = [x for x in statuses(c, "si_rompe_agisce") if any(x is b for b in before)]
    for x in gone:
        ctx.log(f"{c['nome']} non è più {x['nome'].lower()}.", "status")
    remove_status(c, lambda x: any(x is g for g in gone))


def cast(ctx: Ctx, actor: dict, ab: dict, m: Mech, chosen: list[str], reaction: bool, force: bool,
         window: dict | None = None):
    """Esegue un'abilità già validata e pagata."""
    s = ctx.s
    ab = {**ab, "_m": m}
    hidden = list(statuses(actor, "si_rompe_agisce"))
    bonus_lv = 0
    my_tags = {t.lstrip("#").lower() for t in m.etichette}
    for other in actor.get("abilita") or []:
        for r in mech_of(other).rider:
            if r.etichetta.lstrip("#").lower() in my_tags and r.grado:
                bonus_lv += r.grado
    if bonus_lv:
        ab["efficacia"] = num(ab.get("efficacia") or ab.get("grado") or 1) + bonus_lv
        ctx.step(f"Potenziamento: grado +{bonus_lv}")
    ctx.log(f"{actor['nome']} usa {ab['nome']}" + (
        " su " + ", ".join(s["combattenti"][x]["nome"] for x in chosen if x in s["combattenti"]) if chosen else "") + ".",
        "azione")
    remember(s, actor, "lancio", ab=ab["nome"], bersagli=list(chosen), tags=sorted(my_tags))
    if m.rischio and ctx.check(f"rischio:{ab['nome']}", f"Contraccolpo ({fmt(m.rischio)}%)", m.rischio, want=False):
        ctx.log(f"Contraccolpo! {ab['nome']} sfugge al controllo di {actor['nome']}: decide il Master.", "avviso")
    if m.durata.tipo == "canalizzato":
        s.setdefault("in_attesa", []).append({
            "id": new_id(s, "c"), "tipo": "canalizzazione", "fonte": actor["id"], "abilita": ab["nome"],
            "turni": m.durata.turni, "bersagli": list(chosen), "interrompibile": m.durata.interrompibile})
        ctx.log(f"{actor['nome']} canalizza {ab['nome']} ({m.durata.turni} turni).", "azione")
        reveal(ctx, actor, hidden)
        return
    effs = m.effetti
    trap_effs = [e for e in effs if e.trigger.evento == "azione_nemica"]
    for e in trap_effs:
        s.setdefault("in_attesa", []).append({
            "id": new_id(s, "t"), "tipo": "trappola", "fonte": actor["id"], "lato": actor["lato"],
            "abilita": ab["nome"], "su": e.trigger.abilita, "effetto": e.model_dump(mode="json")})
        ctx.log(f"{actor['nome']} piazza {ab['nome']}.", "azione")
    if m.durata.tipo in ("mantenuto", "turni"):
        actor.setdefault("mantenuti", [])
        actor["mantenuti"] = [x for x in actor["mantenuti"] if x["abilita"] != ab["nome"]]
        actor["mantenuti"].append({"abilita": ab["nome"], "turni": 0, "bersagli": list(chosen),
                                   "resta": m.durata.turni if m.durata.tipo == "turni" else 0})
    run_effects(ctx, actor, effs, chosen, ab, "a", m.tiro_colpire and not reaction)
    # Interazioni: combo con un'abilità usata poco prima
    for it in m.interazioni:
        prev = [h for h in history(actor, "lancio", it.entro_turni, s.get("round", 1), it.dopo)
                if h.get("ab") != ab["nome"]]
        if not prev:
            continue
        if it.consuma_status:
            targets = [s["combattenti"][x] for x in chosen if x in s["combattenti"]]
            if not any(statuses(t, nome=it.consuma_status) for t in targets):
                continue
            for t in targets:
                gone = remove_status(t, lambda x: x["nome"] == it.consuma_status)
                ctx.consumati = sum(x["stack"] for x in gone)
        ctx.log(f"Combo: {ab['nome']} dopo {it.dopo}.", "trigger")
        run_effects(ctx, actor, [it.effetto], chosen, ab, "combo", False, only_event=None)
    # Rider: effetti agganciati alle etichette
    for other in actor.get("abilita") or []:
        if other["nome"] == ab["nome"]:
            continue
        for r in mech_of(other).rider:
            if r.effetto and r.etichetta.lstrip("#").lower() in my_tags:
                ctx.log(f"{other['nome']}: effetto aggiunto a {ab['nome']}.", "trigger")
                run_effects(ctx, actor, [r.effetto], chosen, {**other, "_m": mech_of(other)}, "rider." + other["nome"],
                            False, only_event=None)
    # Abilità che ascoltano un lancio specifico
    for o_ab, om in listeners(actor):
        for e in om.effetti:
            if e.trigger.evento == "dopo_abilita" and o_ab["nome"] != ab["nome"] and (
                    e.trigger.abilita.lower() == ab["nome"].lower()
                    or e.trigger.abilita.lstrip("#").lower() in my_tags):
                ctx.log(f"{o_ab['nome']} si attiva dopo {ab['nome']}.", "trigger")
                run_effects(ctx, actor, [e], chosen, {**o_ab, "_m": om}, "dopo", False, only_event=None)
    kind = "lancio" if m.tipo in ("incantesimo", "miracolo") else "attacco"
    enemy_acted(ctx, actor, kind)
    drain(ctx)
    reveal(ctx, actor, hidden)


def reaction_candidates(s: dict, actor: dict, targets: list[str], kind: str = "") -> list[dict]:
    """Chi può reagire a un'azione di `actor`: i nemici di actor con un'abilità reazione pronta.
    Le reazioni fatte solo di «interrompi» (counterspell) non rispondono agli attacchi con l'arma."""
    out = []
    for c in enemies_of(s, actor):
        if int((c.get("azioni") or {}).get("reazione", 0)) <= 0 or has(c, "salta_turno"):
            continue
        for ab in c.get("abilita") or []:
            m = mech_of(ab)
            if kind == "attacco" and m.effetti and all(e.azione.op == "interrompi" for e in m.effetti):
                continue
            if m.timing in ("reazione", "entrambi") and m.tipo != "passiva" \
                    and can_use(s, c, ab, m, True, False) is None:
                out.append({"id": c["id"], "nome": c["nome"], "abilita": ab["nome"], "bersaglio": c["id"] in targets})
    return out


def act(state: dict, azione: dict, rng: random.Random | None = None, tiri: dict | None = None,
        mode: str = "real", reactions: bool = True) -> dict:
    """Usa un'abilità. azione = {attore, abilita, bersagli[], forza?}. Modifica `state` e restituisce
    {esito: "ok"|"reazione", eventi, passi, richieste, totali, finestra?}."""
    ctx = Ctx(state, tiri, rng, mode)
    actor = C(state, str(azione.get("attore") or ""))
    ab = ability(actor, str(azione.get("abilita") or ""))
    if not ab:
        raise EngineError(f"{actor['nome']} non conosce «{azione.get('abilita')}».")
    m = mech_of(ab)
    force = bool(azione.get("forza"))
    chosen = [str(x) for x in azione.get("bersagli") or []][:20]
    err = can_use(state, actor, ab, m, False, force)
    if err:
        raise EngineError(err)
    start = len(state.get("registro") or [])
    pay(ctx, actor, ab, m, False, force)
    if reactions and mode == "real":
        cands = reaction_candidates(state, actor, chosen, m.tipo)
        if cands:
            w = {"id": new_id(state, "r"), "tipo": "reazione", "attore": actor["id"], "abilita": ab["nome"],
                 "bersagli": chosen, "candidati": cands, "tiri": dict(tiri or {})}
            state.setdefault("in_attesa", []).append(w)
            ctx.log(f"{actor['nome']} sta per usare {ab['nome']}: finestra di reazione.", "avviso")
            return {"esito": "reazione", "finestra": w, "eventi": state["registro"][start:], "passi": ctx.steps,
                    "richieste": ctx.requests, "totali": ctx.totals}
    cast(ctx, actor, ab, m, chosen, False, force)
    return {"esito": "ok", "eventi": state["registro"][start:], "passi": ctx.steps, "richieste": ctx.requests,
            "totali": ctx.totals, "tiri_usati": ctx.used}


def react(state: dict, finestra_id: str, reazione: dict | None, rng: random.Random | None = None,
          tiri: dict | None = None) -> dict:
    """Chiude una finestra di reazione: `reazione` = {attore, abilita, bersagli?} oppure None (nessuno reagisce)."""
    w = next((x for x in state.get("in_attesa") or [] if x.get("id") == finestra_id and x.get("tipo") == "reazione"),
             None)
    if not w:
        raise EngineError("Finestra di reazione chiusa o inesistente.")
    ctx = Ctx(state, {**(w.get("tiri") or {}), **(tiri or {})}, rng)
    start = len(state.get("registro") or [])
    state["in_attesa"].remove(w)
    ctx.window = w
    if reazione:
        r = C(state, str(reazione.get("attore") or ""))
        rab = ability(r, str(reazione.get("abilita") or ""))
        if not rab:
            raise EngineError("Abilità di reazione sconosciuta.")
        rm = mech_of(rab)
        err = can_use(state, r, rab, rm, True, False)
        if err:
            raise EngineError(err)
        hidden_r = list(statuses(r, "si_rompe_agisce"))
        pay(ctx, r, rab, rm, True, False)
        targets = [str(x) for x in reazione.get("bersagli") or []] or [w["attore"]]
        ctx.log(f"{r['nome']} reagisce con {rab['nome']}.", "azione")
        remember(state, r, "lancio", ab=rab["nome"], bersagli=targets)
        run_effects(ctx, r, rm.effetti, targets, {**rab, "_m": rm}, "rea", False, only_event=None)
        drain(ctx)
        reveal(ctx, r, hidden_r)
    actor = state["combattenti"].get(w["attore"])
    if w.get("interrotta") or not actor or not actor.get("vivo", True):
        ctx.log(f"{w['abilita']} viene annullato.", "azione")
    else:
        ab = ability(actor, w["abilita"])
        chosen = list(w["bersagli"])
        if w.get("reindirizza"):
            chosen = [w["reindirizza"]]
        cast(ctx, actor, ab, mech_of(ab), chosen, False, True)
    return {"esito": "ok", "eventi": state["registro"][start:], "passi": ctx.steps, "richieste": ctx.requests,
            "totali": ctx.totals}


def preview(state: dict, azione: dict) -> dict:
    """Stima senza toccare lo stato: due risoluzioni su copie (tiri al minimo e al massimo)."""
    lo_s, hi_s = copy.deepcopy(state), copy.deepcopy(state)
    lo = act(lo_s, azione, mode="min", reactions=False)
    hi = act(hi_s, azione, mode="max", reactions=False)
    actor = state["combattenti"].get(str(azione.get("attore")))
    pab = ability(actor, str(azione.get("abilita") or "")) if actor else None
    reactors = reaction_candidates(state, actor, [str(x) for x in azione.get("bersagli") or []],
                                   mech_of(pab).tipo if pab else "") if actor else []
    stima = {}
    for cid in set(lo["totali"]) | set(hi["totali"]):
        a, b = lo["totali"].get(cid, {}), hi["totali"].get(cid, {})
        stima[cid] = {k: [rnd(a.get(k, 0)), rnd(b.get(k, 0))] for k in set(a) | set(b)}
    return {"passi": hi["passi"], "richieste": hi["richieste"], "stima": stima, "eventi": hi["eventi"],
            "reazioni": reactors}


def toggle_off(state: dict, attore: str, abilita: str) -> dict:
    c = C(state, attore)
    before = len(c.get("mantenuti") or [])
    c["mantenuti"] = [x for x in c.get("mantenuti") or [] if x["abilita"].lower() != abilita.lower()]
    if len(c["mantenuti"]) == before:
        raise EngineError(f"{c['nome']} non sta mantenendo {abilita}.")
    ctx = Ctx(state, None, None)
    ctx.log(f"{c['nome']} smette di mantenere {abilita}.", "azione")
    return {"esito": "ok"}


# ---------- Turni ----------

def start_turn(ctx: Ctx, c: dict):
    s = ctx.s
    extra = sum(int(num(x.get("valore") or 1)) for x in statuses(c, "azioni_extra"))
    rex = sum(int(num(x.get("valore") or 1)) for x in statuses(c, "reazioni_extra"))
    c["azioni"] = {"principale": 1 + extra, "bonus": 1, "reazione": 1 + rex}
    c["lancio_doppio"] = False
    for st in list(c.get("status") or []):
        mod = st.get("mod") or {}
        v = num(st.get("valore")) * max(1, int(st.get("stack", 1)))
        fonte = s["combattenti"].get(st.get("fonte") or "") or c
        if mod.get("tick_danno") and v > 0:
            ctx.log(f"{st['nome']} su {c['nome']}.", "status")
            deal(ctx, fonte, c, v, st.get("stat") or "puro", key=f"tick.{st['nome']}.{c['id']}", label=st["nome"],
                 dot=True)
        if mod.get("tick_cura") and v > 0:
            heal(ctx, fonte, c, v)
    if not c.get("vivo", True):
        return
    # Mantenuti: costo a turno ed effetti a inizio turno
    for mt in list(c.get("mantenuti") or []):
        ab = ability(c, mt["abilita"])
        if not ab:
            continue
        m = mech_of(ab)
        ok = True
        for k in m.costi:
            if k.per == "turno" and k.risorsa in ("MP", "SP", "KI", "HP"):
                key = k.risorsa.lower()
                if num(c.get(key)) < k.valore:
                    ok = False
                else:
                    c[key] = num(c.get(key)) - k.valore
        if not ok:
            c["mantenuti"].remove(mt)
            ctx.log(f"{c['nome']} non ha risorse per mantenere {ab['nome']}.", "avviso")
            continue
        mt["turni"] = int(mt.get("turni", 0)) + 1
        ctx.turni_mantenuto = mt["turni"]
        effs = [e for e in m.effetti if e.trigger.evento == "inizio_turno" and e.trigger.chi == "se"]
        if effs:
            run_effects(ctx, c, effs, mt.get("bersagli") or [], {**ab, "_m": m}, f"mt.{ab['nome']}", False,
                        only_event=None)
        ctx.turni_mantenuto = 0
    for x in list(enemies_of(s, c)):  # effetti mantenuti dai nemici con «inizio turno del bersaglio»
        for mt in x.get("mantenuti") or []:
            ab = ability(x, mt["abilita"])
            if ab and c["id"] in (mt.get("bersagli") or []):
                effs = [e for e in mech_of(ab).effetti if e.trigger.evento == "inizio_turno" and e.trigger.chi == "bersaglio"]
                if effs:
                    run_effects(ctx, x, effs, [c["id"]], {**ab, "_m": mech_of(ab)}, f"mtb.{ab['nome']}", False,
                                only_event=None, ev_target=c)
    # Canalizzazioni e bombe di questo combattente
    for w in list(s.get("in_attesa") or []):
        if w.get("fonte") != c["id"] or w.get("tipo") not in ("canalizzazione", "bomba"):
            continue
        if w.get("annullata"):
            s["in_attesa"].remove(w)
            ctx.log(f"{w.get('abilita')} di {c['nome']} è stato interrotto.", "azione")
            continue
        w["turni"] = int(w["turni"]) - 1
        if w["turni"] > 0:
            continue
        s["in_attesa"].remove(w)
        if w["tipo"] == "canalizzazione":
            ab = ability(c, w["abilita"])
            if ab:
                ctx.log(f"{c['nome']} completa {ab['nome']}.", "azione")
                run_effects(ctx, c, mech_of(ab).effetti, w.get("bersagli") or [], {**ab, "_m": mech_of(ab)}, "can",
                            True)
        else:
            e = Mech.model_validate({"effetti": [w["effetto"]]}).effetti[0].model_copy(update={"ritardo": 0})
            ctx.log(f"{w.get('abilita') or 'Bomba'} esplode!", "trigger")
            run_effects(ctx, c, [e], w.get("bersagli") or [], None, f"bomba.{w['id']}", False, only_event=None)
    for ab, m in listeners(c):
        effs = [e for e in m.effetti if e.trigger.evento == "inizio_turno" and m.tipo == "passiva"]
        if effs:
            run_effects(ctx, c, effs, [], {**ab, "_m": m}, f"pas.{ab['nome']}", False, only_event=None)
    drain(ctx)


def end_turn_of(ctx: Ctx, c: dict):
    s = ctx.s
    for ab, m in listeners(c):
        effs = [e for e in m.effetti if e.trigger.evento == "fine_turno"]
        if effs:
            run_effects(ctx, c, effs, [], {**ab, "_m": m}, f"fine.{ab['nome']}", False, only_event=None)
    if c.get("rif", "").startswith("pg:"):  # rigenerazione di fine turno del regolamento
        mg = rnd(num(c.get("mp_max")) * 0.15)
        sg = rnd(num(c.get("sp_max")) * 0.25)
        c["mp"] = min(num(c.get("mp_max")), num(c.get("mp")) + mg)
        c["sp"] = min(num(c.get("sp_max")), num(c.get("sp")) + sg)
        if "ki" in c:
            c["ki"] = min(num(c.get("ki_max")), num(c.get("ki")) + num(c.get("ki_regen")))
    gone, keep = [], []
    for st in c.get("status") or []:  # turni 0 = finché non viene rimosso
        if int(st.get("turni") or 0) > 0:
            st["turni"] = int(st["turni"]) - 1
            if st["turni"] <= 0:
                gone.append(st["nome"])
                continue
        keep.append(st)
    c["status"] = keep
    if gone:
        ctx.log(f"Terminati su {c['nome']}: {', '.join(gone)}.", "status")
    for k in list((c.get("cooldown") or {}).keys()):
        c["cooldown"][k] = int(c["cooldown"][k]) - 1
        if c["cooldown"][k] <= 0:
            del c["cooldown"][k]
    for mt in list(c.get("mantenuti") or []):
        if mt.get("resta"):
            mt["resta"] = int(mt["resta"]) - 1
            if mt["resta"] <= 0:
                c["mantenuti"].remove(mt)
                ctx.log(f"{mt['abilita']} di {c['nome']} termina.", "azione")
    ev = c.get("evocazione")
    if ev and ev.get("turni"):
        ev["turni"] = int(ev["turni"]) - 1
        if ev["turni"] <= 0 and c.get("vivo", True):
            c["vivo"] = False
            ctx.log(f"{c['nome']} svanisce.", "morte")


def next_turn(state: dict, rng: random.Random | None = None) -> dict:
    """Chiude il turno di chi agisce e apre quello del successivo vivo (saltando chi non può agire)."""
    ctx = Ctx(state, None, rng)
    start = len(state.get("registro") or [])
    order = state.get("ordine") or []
    if not order:
        raise EngineError("Lo scontro non ha combattenti.")
    for _ in range(len(order) * 2 + 2):
        cur = current(state)
        if cur is not None:
            end_turn_of(ctx, cur)
        state["in_attesa"] = [w for w in state.get("in_attesa") or [] if w.get("tipo") != "reazione"]
        i = state.get("turno", 0) + 1
        if i >= len(order):
            i = 0
            state["round"] = int(state.get("round", 1)) + 1
            ctx.log(f"Round {state['round']}.", "round")
            round_start(ctx)
        state["turno"] = i
        nxt = current(state)
        if nxt is None or not nxt.get("vivo", True):
            continue
        ctx.log(f"Turno di {nxt['nome']}.", "turno")
        start_turn(ctx, nxt)
        if not nxt.get("vivo", True):
            continue
        if has(nxt, "salta_turno"):
            ctx.log(f"{nxt['nome']} salta il turno ({', '.join(x['nome'] for x in statuses(nxt, 'salta_turno'))}).",
                    "status")
            continue
        break
    if not any(c["lato"] == "nemici" for c in alive(state)) or not any(c["lato"] == "alleati" for c in alive(state)):
        ctx.log("Uno schieramento non ha più combattenti in piedi.", "avviso")
    return {"esito": "ok", "eventi": state["registro"][start:]}


def round_start(ctx: Ctx):
    s = ctx.s
    keep = []
    for f in s.get("campo") or []:
        owner = s["combattenti"].get(f.get("fonte") or "")
        effs = Mech.model_validate({"effetti": f.get("effetti") or []}).effetti if f.get("effetti") else []
        if owner and effs:
            ctx.log(f"Campo {f['nome']}.", "trigger")
            run_effects(ctx, owner, effs, [], None, f"campo.{f['nome']}", False, only_event=None)
        if f.get("turni"):
            f["turni"] = int(f["turni"]) - 1
            if f["turni"] <= 0:
                ctx.log(f"Il campo {f['nome']} si dissolve.", "azione")
                continue
        keep.append(f)
    s["campo"] = keep
    drain(ctx)


def start(state: dict, rng: random.Random | None = None, tiri: dict | None = None) -> dict:
    """Ordine di iniziativa: iniziativa + d20 (o valore inserito, chiave "ini:<id>"). Applica le passive."""
    ctx = Ctx(state, tiri, rng)
    rolls = {}
    for c in state["combattenti"].values():
        d = ctx.value(f"ini:{c['id']}", f"Iniziativa di {c['nome']}", 1, 20)
        c["iniziativa"] = rnd(stat(c, "iniziativa") + d)
        rolls[c["id"]] = d
        c.setdefault("status", [])
        for ab in c.get("abilita") or []:  # passive «sempre»: statistiche e status permanenti
            m = mech_of(ab)
            if m.tipo == "passiva":
                run_effects(ctx, c, [e for e in m.effetti if e.trigger.evento == "passivo"], [], {**ab, "_m": m},
                            f"pas0.{ab['nome']}", False, only_event=None)
    state["ordine"] = [c["id"] for c in sorted(state["combattenti"].values(),
                                               key=lambda x: (-x["iniziativa"], x["lato"] != "alleati", x["nome"]))]
    state["turno"] = 0
    state["round"] = 1
    ctx.log("Inizia lo scontro. Ordine: " + ", ".join(
        f"{state['combattenti'][i]['nome']} {state['combattenti'][i]['iniziativa']}" for i in state["ordine"]) + ".",
            "round")
    first = current(state)
    if first:
        ctx.log(f"Turno di {first['nome']}.", "turno")
        start_turn(ctx, first)
    return {"esito": "ok", "tiri": rolls}


DEFAULT_STATS = {"precisione": 75, "evasione": 10, "critico": 5, "blocco": 0, "difesa": 0, "difesaMag": 0,
                 "moltFis": 1, "moltMag": 1, "iniziativa": 10}


def combatant(cid: str, nome: str, lato: str, hp: float, *, mp: float = 0, sp: float = 0, ki: float | None = None,
              ki_regen: float = 0, stat_vals: dict | None = None, arma: list | None = None,
              abilita: list[dict] | None = None, rif: str = "", tipo: str = "", taglia: str = "Normale",
              posizione: str = "Mischia", resistenze: dict | None = None, hp_cur: float | None = None,
              mp_cur: float | None = None, sp_cur: float | None = None, ki_cur: float | None = None) -> dict:
    """Nuovo combattente. Le abilità sono [{nome, grado, efficacia, mech}] già validate; l'Attacco base è aggiunto."""
    a = list(abilita or [])
    if not any(x.get("nome", "").lower() == "attacco" for x in a):
        a.insert(0, basic_attack(list(arma or [10, 10])))
    c = {"id": cid, "nome": nome, "rif": rif or cid, "lato": lato, "vivo": True, "tipo": tipo, "taglia": taglia,
         "hp": hp if hp_cur is None else min(hp, hp_cur), "hp_max": hp,
         "mp": mp if mp_cur is None else min(mp, mp_cur), "mp_max": mp,
         "sp": sp if sp_cur is None else min(sp, sp_cur), "sp_max": sp,
         "stat": {**DEFAULT_STATS, **(stat_vals or {})}, "arma": list(arma or [10, 10]), "posizione": posizione,
         "resistenze": dict(resistenze or {}), "status": [], "cooldown": {}, "usi": {}, "contatori": {},
         "storico": [], "mantenuti": [], "azioni": {"principale": 1, "bonus": 1, "reazione": 1}, "abilita": a}
    if ki is not None:
        c.update({"ki": ki if ki_cur is None else min(ki, ki_cur), "ki_max": ki, "ki_regen": ki_regen})
    if c["hp"] <= 0:
        c["vivo"] = False
    return c


def new_state(combattenti: list[dict]) -> dict:
    return {"round": 1, "turno": 0, "ordine": [], "combattenti": {c["id"]: c for c in combattenti}, "campo": [],
            "in_attesa": [], "registro": [], "seq": 0}


def public(state: dict) -> dict:
    """Stato per il client: delle abilità solo ciò che serve alla plancia (niente mech completo)."""
    s = copy.deepcopy(state)
    for c in s["combattenti"].values():
        out = []
        for ab in c.get("abilita") or []:
            m = mech_of(ab)
            first = m.effetti[0].bersaglio.model_dump() if m.effetti else None
            out.append({"nome": ab["nome"], "grado": ab.get("grado"), "tipo": m.tipo, "timing": m.timing,
                        "azione": m.azione, "durata": m.durata.tipo, "etichette": m.etichette,
                        "costi": [k.model_dump() for k in m.costi], "cd": m.cooldown.model_dump(),
                        "bersaglio": first, "descrizione": ab.get("descrizione", ""), "base": bool(ab.get("base")),
                        "testo": bool(ab.get("testo"))})
        c["abilita"] = out
    return s


def add_combatants(state: dict, new: list[dict], rng: random.Random | None = None, tiri: dict | None = None) -> dict:
    """Aggiunge combattenti a uno scontro in corso: tira l'iniziativa e li mette in ordine senza cambiare chi ha il
    turno. Gli id devono essere già unici nello stato."""
    ctx = Ctx(state, tiri, rng)
    cur = current(state)
    for c in new:
        if c["id"] in state["combattenti"]:
            raise EngineError(f"Combattente già presente: {c['nome']}.")
        d = ctx.value(f"ini:{c['id']}", f"Iniziativa di {c['nome']}", 1, 20)
        c["iniziativa"] = rnd(stat(c, "iniziativa") + d)
        state["combattenti"][c["id"]] = c
        for ab in c.get("abilita") or []:
            m = mech_of(ab)
            if m.tipo == "passiva":
                run_effects(ctx, c, [e for e in m.effetti if e.trigger.evento == "passivo"], [], {**ab, "_m": m},
                            f"pas0.{ab['nome']}", False, only_event=None)
    order = [x for x in state.get("ordine") or [] if x in state["combattenti"]] + [c["id"] for c in new]
    order.sort(key=lambda i: (-state["combattenti"][i].get("iniziativa", 0), state["combattenti"][i]["lato"] != "alleati",
                              state["combattenti"][i]["nome"]))
    state["ordine"] = order
    if cur is not None:
        state["turno"] = order.index(cur["id"])
    ctx.log("Entrano nello scontro: " + ", ".join(f"{c['nome']} (iniziativa {c['iniziativa']})" for c in new) + ".", "round")
    if cur is None:
        state["turno"] = 0
        first = current(state)
        if first:
            ctx.log(f"Turno di {first['nome']}.", "turno")
            start_turn(ctx, first)
    return {"esito": "ok"}
