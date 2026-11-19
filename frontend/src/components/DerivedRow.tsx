import type { Derived } from "../api/types";
import { fmt } from "../lib/format";
import { TipRow } from "./TipRow";

/** Derivata compatta: etichetta e valore; formula, calcolo, bonus, nota e fonte nel tooltip. */
export function DerivedRow({ d }: { d: Derived }) {
  const boosted = !!d.bonus;
  return (
    <TipRow
      className="drow"
      tip={
        <>
          <span className="label">Formula</span>
          <span className="mono">{d.formula}</span>
          <span className="mono muted">= {d.explain} = {fmt(d.base, d.fmt)}</span>
          {boosted && (
            <span>
              Bonus oggetti: <b className="num gold-t">{d.bonus > 0 ? "+" : ""}{fmt(d.bonus, d.fmt)}</b> → <b className="num gold-t">{fmt(d.value, d.fmt)}</b>
            </span>
          )}
          {d.cap != null && <span className="muted">Massimo: {fmt(d.cap, d.fmt)}</span>}
          {d.note && <span>{d.note}</span>}
          <span className="muted">Fonte: {d.src}</span>
          {d.disputed && <span className="warn-t">Formula non concordata fra le schede: da decidere.</span>}
        </>
      }
    >
      <span className="dlabel">
        {d.label}
        {d.disputed && <span className="dot warn" aria-hidden="true" />}
        {boosted && <span className="dot gold" aria-hidden="true" />}
      </span>
      <span className={`dval num${boosted ? " gold-t" : ""}`}>{fmt(d.value, d.fmt)}</span>
    </TipRow>
  );
}

export function DerivedLegend({ list }: { list: Derived[] }) {
  return (
    <div className="row xs muted legend">
      <span><span className="dot gold" /> include bonus oggetti</span>
      {list.some((x) => x.disputed) && <span><span className="dot warn" /> formula da decidere</span>}
      <span>Passa sopra un valore per vedere il calcolo</span>
    </div>
  );
}
