import { n } from "../lib/format";

interface Props {
  kind: "hp" | "mp" | "sp" | "ki" | "exp";
  label: string;
  cur: number;
  max: number;
  /** testo a destra al posto di "cur / max" */
  valueText?: string;
}

export function Bar({ kind, label, cur, max, valueText }: Props) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return (
    <div className={`bar ${kind}`}>
      <div className="bar-top">
        <span className="label">{label}</span>
        <span className="num">{valueText ?? `${n(cur)} / ${n(max)}`}</span>
      </div>
      <div className="bar-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(cur)}>
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
