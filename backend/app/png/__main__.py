"""Riga di comando della sezione PNG (dalla cartella backend/):

    .venv/Scripts/python -m app.png controlla
    .venv/Scripts/python -m app.png componi fabbro adulto nano --regno frostland --insediamento citta
    .venv/Scripts/python -m app.png nuovo fabbro adulto umano --zona alba-chiara -r "ex soldato" --seme 11
    .venv/Scripts/python -m app.png comparse --zona alba-chiara --quante 6
    .venv/Scripts/python -m app.png confronta fabbro

Legge i preset in backend/png/ e stampa YAML. Non scrive niente: salvare una scheda si fa dall'app (API /api/png).
"""
from __future__ import annotations

import argparse
import sys

import yaml

from . import controlla as K
from . import genera as G
from .componi import ErroreStrato, componi, vista


def _stampa(x) -> None:
    sys.stdout.write(yaml.safe_dump(x, allow_unicode=True, sort_keys=False, width=110))


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(prog="python -m app.png", description="Sezione PNG: preset, schede, comparse.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for nome in ("componi", "nuovo"):
        p = sub.add_parser(nome)
        p.add_argument("ruolo")
        p.add_argument("eta", nargs="?", default="adulto")
        p.add_argument("razza", nargs="?", default="umano")
    for p in (sub.choices["componi"], sub.choices["nuovo"], sub.add_parser("comparse")):
        p.add_argument("--regno")
        p.add_argument("--insediamento")
        p.add_argument("--zona")
        p.add_argument("--seme", type=int)
    for nome in ("componi", "nuovo"):
        sub.choices[nome].add_argument("-r", "--ritocco", action="append", default=[], help="«ex soldato», «livello 61»…")
    sub.choices["comparse"].add_argument("--quante", type=int, default=5)
    c = sub.add_parser("confronta")
    c.add_argument("ruolo")
    sub.add_parser("controlla")
    a = ap.parse_args(argv)
    luogo = {k: getattr(a, k) for k in ("regno", "insediamento", "zona") if getattr(a, k, None)}
    try:
        if a.cmd == "componi":
            _stampa(vista(componi(a.ruolo, a.eta, a.razza, luogo, a.ritocco)))
        elif a.cmd == "nuovo":
            out = G.nuovo(a.ruolo, a.eta, a.razza, luogo, a.ritocco, a.seme)
            _stampa({k: out[k] for k in ("scheda", "errori", "avvisi") if k in out} | {"seme": out.get("seme")})
        elif a.cmd == "comparse":
            _stampa(G.comparse(luogo, a.quante, None, a.seme))
        elif a.cmd == "confronta":
            _stampa(G.confronta(a.ruolo))
        else:
            r = K.controlla()
            _stampa(r)
            return 1 if r["errori"] or not r["prove_ok"] else 0
    except ErroreStrato as x:
        print(f"errore: {x}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
