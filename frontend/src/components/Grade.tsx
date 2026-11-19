import { ROMAN } from "../lib/format";
import { useAppData } from "../auth/AppData";

export function Grade({ lvl }: { lvl: number }) {
  const { rules } = useAppData();
  const l = Number(lvl) || 0;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className="num">{ROMAN[l] ?? String(l)}</span>{" "}
      <span className="muted xs">{rules?.grades[l - 1] ?? ""}</span>
    </span>
  );
}

export function Progress({ pct }: { pct: number | "MAX" }) {
  if (pct === "MAX") return <span className="chip gold">MAX</span>;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="row mini-wrap">
      <div className="mini" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><div style={{ width: `${p}%` }} /></div>
      <span className="num xs">{p}%</span>
    </div>
  );
}
