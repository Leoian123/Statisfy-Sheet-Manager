import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api, errorText } from "../api/client";
import type { Character, PreviewResponse } from "../api/types";
import { useAppData } from "../auth/AppData";
import { ErrorBox, InlineError, Loading, SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { fmt, fmtDiff, n } from "../lib/format";
import { useBusy, useCharacter } from "../lib/useCharacter";

const MAIN_DERIVED = ["hp", "mp", "sp", "evasione", "moltFis"];

export function LevelUp() {
  const id = Number(useParams().id);
  const { char, setChar, error, reload } = useCharacter(id);
  if (error && !char) return <ErrorBox title="Level up" message={error} action={<button className="btn" type="button" onClick={reload}>Riprova</button>} />;
  if (!char) return <Loading />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="lu-head">
        <h1>Level up</h1>
        <p className="muted small">{char.name} · {char.classe} · Livello {n(char.level)}. Le modifiche vengono salvate sul server.</p>
      </div>
      <div className="lu-level-wrap"><LevelWin key={char.id} c={char} onChange={setChar} /></div>
    </div>
  );
}

function Diff({ diff, kind }: { diff: number; kind: Parameters<typeof fmtDiff>[1] }) {
  const t = fmtDiff(diff, kind);
  if (!t) return null;
  return <span className={diff > 0 ? "lu-up" : "lu-down"}>{t}</span>;
}

function LevelWin({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const { rules, refreshChars } = useAppData();
  const toast = useToast();
  const { busy, error, run } = useBusy();
  const [pending, setPending] = useState<Record<string, number>>({});
  const [talentAt, setTalentAt] = useState<number | null>(null);
  const [after, setAfter] = useState<PreviewResponse | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const pend = Object.values(pending).reduce((a, b) => a + b, 0);
  const free = c.free_points.left;
  const left = free - pend;
  const pendKey = JSON.stringify(pending);

  // Anteprima "dopo" dal server (debounce); senza punti in sospeso coincide con lo stato attuale.
  useEffect(() => {
    if (pend === 0) { setAfter(null); setStale(false); setPreviewErr(null); return; }
    setStale(true);
    const t = window.setTimeout(() => {
      const stats = c.stats.map((r) => ({ ...r, investiti: r.investiti + (pending[r.code] || 0) }));
      api.preview({ stats, item_bonus: c.item_bonus, equip: c.equip, magia: c.magia, inventory: c.inventory })
        .then((r) => { setAfter(r); setPreviewErr(null); })
        .catch((e) => setPreviewErr(errorText(e)))
        .finally(() => setStale(false));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendKey, c]);

  const afterTotals = after?.totals ?? c.totals;
  const afterDerived = useMemo(() => Object.fromEntries((after?.derived ?? c.derived).map((d) => [d.key, d])), [after, c.derived]);

  async function levelUp() {
    const from = c.level;
    const res = await run(() => api.levelUp(c.id));
    if (!res) return;
    onChange(res);
    setPending({});
    const every = rules?.level.talent_every ?? 0;
    setTalentAt(every && res.level % every === 0 ? res.level : null);
    const auto = rules?.level.auto_per_level ?? 1;
    const gained = res.free_points.left - c.free_points.left;
    toast("LEVEL UP", [`Livello ${n(from)} → ${n(res.level)}`, `+${auto} a ogni statistica`, `+${n(gained)} punti liberi da distribuire`], { gold: true });
    refreshChars();
  }

  async function confirm() {
    const alloc = Object.fromEntries(Object.entries(pending).filter(([, v]) => v > 0));
    const res = await run(() => api.distribute(c.id, alloc));
    if (!res) return;
    onChange(res);
    setPending({});
    toast("SISTEMA", ["Distribuzione confermata.", Object.entries(alloc).map(([k, v]) => `${k} +${v}`).join(" · ")]);
  }

  const inc = (code: string) => { if (left > 0) setPending((p) => ({ ...p, [code]: (p[code] || 0) + 1 })); };
  const dec = (code: string) => setPending((p) => ((p[code] || 0) > 0 ? { ...p, [code]: p[code] - 1 } : p));

  const L = rules?.level;
  const mainDerived = MAIN_DERIVED.map((k) => c.derived.find((d) => d.key === k)).filter((d): d is NonNullable<typeof d> => !!d);

  return (
    <Win title="Level up" gold right={<span className="chip gold">Lv {n(c.level)}</span>}>
      <div className="lu-kpis">
        <div className="kv"><span className="label">Livello</span><span className="v">{n(c.level)}</span></div>
        <div className="kv"><span className="label">EXP</span><span className="v">{n(c.exp_pct)}<small>%</small></span></div>
        <div className="kv"><span className="label">Punti liberi</span><span className="v">{n(free)}</span></div>
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={levelUp}>Level up</button>
        {L && <span className="xs muted">+{L.auto_per_level} a ogni statistica, +{L.free_per_level} punti liberi. Talento ogni {L.talent_every} livelli.</span>}
      </div>
      {talentAt === c.level && (
        <SysMsg gold tag={`[SISTEMA] Livello ${n(c.level)} raggiunto`} lines={["Nuovo talento disponibile — scelto dal Master in base allo stile di gioco."]} />
      )}
      <div className="lu-sep" />
      <div className="stack" style={{ gap: 4 }}>
        <span className="label">Distribuzione punti liberi</span>
        <div className={`lu-big${left === 0 ? " zero" : ""}`} aria-live="polite">Residuo: <b>{n(left)}</b> / {n(free)}</div>
        {free === 0
          ? <span className="hint">Nessun punto da distribuire: esegui un level up per riceverne {L?.free_per_level ?? 10}.</span>
          : <span className="hint">I punti in sospeso finiscono nella colonna "Investiti" alla conferma.</span>}
      </div>
      <div>
        {c.stats.map((r) => {
          const p = pending[r.code] || 0;
          const before = c.totals[r.code] ?? r.total;
          const aft = afterTotals[r.code] ?? before;
          return (
            <div className="lu-row" key={r.code}>
              <div className="stack" style={{ gap: 0 }}>
                <span>
                  <span className="lu-code">{r.code}</span> <span className="small">{r.name}</span>{" "}
                  {r.kind === "avanzata" && <span className="chip violet">Avanzata</span>}
                </span>
                <span className="small mono">
                  {n(before)} <span className="lu-arrow">→</span> {n(aft)}<Diff diff={aft - before} kind="int" />
                </span>
              </div>
              <div className="lu-ctl">
                <button type="button" className="btn icon" aria-label={`Togli un punto da ${r.code}`} disabled={p <= 0 || busy} onClick={() => dec(r.code)}>−</button>
                <span className="lu-val" aria-label={`Punti in sospeso su ${r.code}`}>{p}</span>
                <button type="button" className="btn icon" aria-label={`Aggiungi un punto a ${r.code}`} disabled={left <= 0 || busy} onClick={() => inc(r.code)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Derivate principali</span>
        <div className="table-wrap" style={stale ? { opacity: 0.6 } : undefined} aria-busy={stale}>
          <table className="t">
            <thead><tr><th>Statistica</th><th className="num">Prima</th><th className="num">Dopo</th></tr></thead>
            <tbody>{mainDerived.map((d) => {
              const a = afterDerived[d.key] ?? d;
              return (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td className="num nowrap">{fmt(d.value, d.fmt)}</td>
                  <td className="num nowrap">{fmt(a.value, a.fmt)}<Diff diff={a.value - d.value} kind={d.fmt} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <InlineError message={previewErr} />
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={pend <= 0 || busy} onClick={confirm}>Conferma distribuzione</button>
        <button type="button" className="btn ghost" disabled={pend <= 0 || busy} onClick={() => setPending({})}>Annulla</button>
      </div>
      <InlineError message={error} />
    </Win>
  );
}
