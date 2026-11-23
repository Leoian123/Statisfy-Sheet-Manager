/* Avviso «scontro in corso» per le plance: link alla plancia di scontro e, se tocca a te, lo dice. */
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { battleApi, type Battle } from "../../api/scontri";
import { usePolling } from "../../lib/usePolling";
import "../../styles/combat.css";

export function BattleBanner({ charId }: { charId?: number }) {
  const [b, setB] = useState<Battle | null>(null);
  const load = useCallback(async () => {
    try { setB((await battleApi.active()).scontro); } catch { /* la plancia funziona anche senza */ }
  }, []);
  usePolling(load, 8000, [load]);
  if (!b) return null;
  const st = b.state;
  const mine = charId != null ? b.mine.filter((id) => st.combattenti[id]?.rif === `pg:${charId}`) : b.mine;
  if (!b.master && !mine.length) return null;
  const cur = st.combattenti[st.ordine[st.turno]];
  const myTurn = cur && (charId != null ? cur.rif === `pg:${charId}` : false);
  return (
    <div className={`sysmsg ${myTurn ? "gold" : ""} cb-banner`} role="status">
      <span className="tag">[SCONTRO]</span>
      <span><b>{b.name}</b> · round {st.round} · {myTurn ? <b>tocca a te</b> : <>turno di {cur?.nome ?? "—"}</>}</span>
      <Link className="btn primary" to="/scontro">Apri la plancia di scontro</Link>
    </div>
  );
}
