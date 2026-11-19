import type { RulesConfig, StatRow as Row } from "../api/types";
import { SOURCE_KEYS } from "../api/types";
import { n } from "../lib/format";
import { TipRow } from "./TipRow";

const FALLBACK_LABELS: Record<string, string> = {
  iniziale: "Iniziale", creazione: "Creazione", investiti: "Investiti", levelup: "Level up", altro: "Altro", titoli: "Titoli",
};

export function sourceLabel(rules: RulesConfig | null, key: string): string {
  return rules?.sources.find((s) => s.key === key)?.label ?? FALLBACK_LABELS[key] ?? key;
}

/** Statistica compatta: codice, nome, barra segmentata per origine dei punti, totale. Dettagli nel tooltip. */
export function StatRow({ row, rules }: { row: Row; rules: RulesConfig | null }) {
  const tot = row.total;
  const sum = SOURCE_KEYS.reduce((s, k) => s + Math.max(0, Number(row[k]) || 0), 0);
  return (
    <TipRow
      className="srow"
      tip={
        <>
          <span className="label">{row.code} · {row.name}</span>
          {SOURCE_KEYS.map((k) => (
            <span className="tline" key={k}>
              <span><span className={`sw src-${k}`} />{sourceLabel(rules, k)}</span>
              <b className="num">{n(row[k])}</b>
            </span>
          ))}
          <span className="tline tsum"><span>Totale</span><b className="num">{n(tot)}</b></span>
          {row.note && <span className="muted">{row.note}</span>}
        </>
      }
    >
      <span className="scode mono">{row.code}</span>
      <span className="sname">{row.name}{row.note && <span className="dot violet" aria-hidden="true" />}</span>
      <span className="sbar" aria-hidden="true">
        {SOURCE_KEYS.map((k) => {
          const v = Number(row[k]) || 0;
          return v > 0 && sum > 0 ? <span key={k} className={`seg src-${k}`} style={{ width: `${(v / sum) * 100}%` }} /> : null;
        })}
      </span>
      <b className="stot num">{n(tot)}</b>
    </TipRow>
  );
}

export function SourceLegend({ rules }: { rules: RulesConfig | null }) {
  return (
    <div className="row xs muted legend">
      {SOURCE_KEYS.map((k) => {
        const help = rules?.sources.find((s) => s.key === k)?.help;
        return <span key={k} title={help || undefined}><span className={`sw src-${k}`} />{sourceLabel(rules, k)}</span>;
      })}
    </div>
  );
}
