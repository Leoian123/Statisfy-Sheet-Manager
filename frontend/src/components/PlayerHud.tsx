/* HUD della Plancia di gioco: compatto e sticky sotto la barra in alto. Nome, barre HP/MP/SP (KI se c'è) con −/+
   rapidi sulla quantità, turno e posizione. I dettagli (formule, scudo, effetti) stanno nei tooltip.
   HP: − = Danno (consuma prima gli scudi), + = Cura. MP/SP/KI: − = Spendi, + = Recupera (riporta la risorsa verso il
   massimo: non è un'azione di combattimento e non va nel registro). */
import type { Character, CombatActionType, ResourceKey } from "../api/types";
import { n } from "../lib/format";
import { resourcesFor } from "../lib/resources";
import { InlineError } from "./Status";

interface Props {
  c: Character;
  amt: string;
  setAmt: (v: string) => void;
  busy: boolean;
  error: string | null;
  positions: string[];
  onAction: (type: CombatActionType) => void;
  onRestore: (key: Exclude<ResourceKey, "hp">) => void;
  onPosition: (p: string) => void;
}

const SPEND: Record<Exclude<ResourceKey, "hp">, CombatActionType> = { mp: "spend_mp", sp: "spend_sp", ki: "spend_ki" };

export function PlayerHud({ c, amt, setAmt, busy, error, positions, onAction, onRestore, onPosition }: Props) {
  const res = resourcesFor(c.derived);
  const r = c.resources;
  const amount = Math.floor(Number(amt));
  const ok = Number.isFinite(amount) && amount > 0;
  const shield = c.combat.effects.find((e) => Number(e.absorb) > 0);
  const q = ok ? n(amount) : "…";

  return (
    <section className="pg-hud" aria-label={`Stato di ${c.name}`}>
      <div className="pg-hud-top">
        <span className="pg-hud-id" title={`${c.name} · ${c.classe} · Livello ${n(c.level)} · EXP ${n(c.exp_pct)}%`}>
          <b className="pg-hud-name">{c.name}</b>
          <span className="xs muted pg-hud-sub">Lv {n(c.level)} · {c.classe}</span>
        </span>
        <span className="chip violet num" title="Turno di combattimento">T{n(c.combat.turn)}</span>
        {shield && <span className="chip good pg-hud-shield" title={`${shield.name}: assorbe ancora ${n(Number(shield.absorb))} danni`}>⛨ {n(Number(shield.absorb))}</span>}
        <label className="pg-hud-pos">
          <span className="sr-only">Posizione</span>
          <select className="input" value={c.combat.position} disabled={busy} title="Posizione" onChange={(e) => onPosition(e.target.value)}>
            {!positions.includes(c.combat.position) && <option value={c.combat.position}>{c.combat.position}</option>}
            {positions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="pg-hud-amt" title="Quantità per i −/+ e per le azioni di combattimento">
          <span className="xs muted">Q.tà</span>
          <input className="input num" type="number" min={1} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)}
            aria-label="Quantità" aria-invalid={!ok || undefined} />
        </label>
      </div>
      <div className={`pg-hud-bars${res.length > 3 ? " has-4" : ""}`}>
        {res.map((x) => {
          const cur = r[x.key] ?? x.max;
          const pct = x.max > 0 ? Math.max(0, Math.min(100, (cur / x.max) * 100)) : 0;
          const minus = x.key === "hp" ? `Danno ${q} (prima gli scudi)` : `Spendi ${q} ${x.short}`;
          const plus = x.key === "hp" ? `Cura ${q} HP` : `Recupera ${q} ${x.short} (fino al massimo, non registrato)`;
          return (
            <div key={x.key} className={`pg-res bar ${x.key}${x.max > 0 && cur / x.max <= 0.25 ? " is-low" : ""}`}>
              <button type="button" className="pg-res-btn" disabled={busy || !ok} aria-label={minus} title={minus}
                onClick={() => (x.key === "hp" ? onAction("damage") : onAction(SPEND[x.key as Exclude<ResourceKey, "hp">]))}>−</button>
              <div className="pg-res-mid" title={`${x.label}: ${n(cur)} / ${n(x.max)}`}>
                <div className="pg-res-t"><span className="label">{x.short}</span><span className="num">{n(cur)}<span className="muted">/{n(x.max)}</span></span></div>
                <div className="bar-track" role="progressbar" aria-label={x.label} aria-valuemin={0} aria-valuemax={Math.round(x.max)} aria-valuenow={Math.round(cur)}>
                  <div className="bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <button type="button" className="pg-res-btn" disabled={busy || !ok || cur >= x.max} aria-label={plus} title={plus}
                onClick={() => (x.key === "hp" ? onAction("heal") : onRestore(x.key as Exclude<ResourceKey, "hp">))}>+</button>
            </div>
          );
        })}
      </div>
      {error && <div className="pg-hud-err"><InlineError message={error} /></div>}
    </section>
  );
}
