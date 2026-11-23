/* Scheda compatta di un combattente: vita (con scudo), risorse, status (dettagli al passaggio del mouse),
   ciò che mantiene, posizione. Selezionabile come bersaglio; il Master può correggerne i valori. */
import { useState } from "react";
import type { ActiveStatus, Combatant } from "../../api/scontri";

export const ni = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("it-IT");
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);

export function shieldOf(c: Combatant): number {
  return c.status.filter((s) => s.mod?.scudo).reduce((t, s) => t + (Number(s.valore) || 0), 0);
}

export function statusText(s: ActiveStatus): string {
  const parts = [s.nome];
  if (s.stack > 1) parts.push(`×${s.stack}`);
  if (s.valore && !s.mod?.scudo) parts.push(s.mod?.tick_danno || s.mod?.tick_cura ? `${ni(s.valore)}/turno` : `${ni(s.valore)}%`);
  if (s.stat) parts.push(s.stat);
  return parts.join(" ");
}

function StatusChip({ s }: { s: ActiveStatus }) {
  const tip = `${s.nome}${s.turni ? ` · ${s.turni} ${s.turni === 1 ? "turno" : "turni"}` : " · finché non viene rimosso"}`
    + (s.mod?.scudo ? ` · assorbe ${ni(s.valore)}` : "");
  return (
    <span className={`chip cb-st ${s.polarita === "buono" ? "good" : "bad"}`} title={tip}>
      {statusText(s)}{s.turni ? <small>{s.turni}t</small> : null}
    </span>
  );
}

interface Props {
  c: Combatant;
  current: boolean;
  selected: boolean;
  selectable: boolean;
  onToggle?: () => void;
  showRes: boolean;
  master: boolean;
  onAdjust?: (patch: { hp?: number; mp?: number; sp?: number; remove_status?: string; vivo?: boolean }) => void;
}

export function CombatantCard({ c, current, selected, selectable, onToggle, showRes, master, onAdjust }: Props) {
  const [edit, setEdit] = useState(false);
  const [hp, setHp] = useState("");
  const sh = shieldOf(c);
  const ally = c.lato === "alleati";
  return (
    <div className={`cb-card${current ? " is-cur" : ""}${selected ? " is-sel" : ""}${c.vivo ? "" : " is-down"}${ally ? " ally" : " foe"}`}>
      <div className="cb-card-h">
        <b className="cb-name">{current && <span className="cb-cur" aria-label="Turno attuale">▶</span>}{c.nome}</b>
        {c.evocazione && <span className="chip muted xs">evocazione{c.evocazione.turni ? ` · ${c.evocazione.turni}t` : ""}</span>}
        {!c.vivo && <span className="chip bad xs">a terra</span>}
        <span className="spacer" />
        {selectable && c.vivo && (
          <button type="button" className={`btn cb-pick${selected ? " primary" : ""}`} aria-pressed={selected} onClick={onToggle}>
            {selected ? "✓ Bersaglio" : "Bersaglio"}
          </button>
        )}
      </div>
      <div className="cb-res" title={`Vita ${ni(c.hp)} / ${ni(c.hp_max)}${sh ? ` · scudo ${ni(sh)}` : ""}`}>
        <span className="cb-res-l">HP</span>
        <div className="bar-track"><div className="cb-fill hp" style={{ width: `${pct(c.hp, c.hp_max)}%` }} /></div>
        <span className="mono xs">{ni(c.hp)}{sh ? <span className="cb-sh"> +{ni(sh)}</span> : null}</span>
      </div>
      {showRes && c.mp_max > 0 && (
        <div className="cb-res" title={`Mana ${ni(c.mp)} / ${ni(c.mp_max)}`}>
          <span className="cb-res-l">MP</span>
          <div className="bar-track"><div className="cb-fill mp" style={{ width: `${pct(c.mp, c.mp_max)}%` }} /></div>
          <span className="mono xs">{ni(c.mp)}</span>
        </div>
      )}
      {showRes && c.sp_max > 0 && (
        <div className="cb-res" title={`Stamina ${ni(c.sp)} / ${ni(c.sp_max)}`}>
          <span className="cb-res-l">SP</span>
          <div className="bar-track"><div className="cb-fill sp" style={{ width: `${pct(c.sp, c.sp_max)}%` }} /></div>
          <span className="mono xs">{ni(c.sp)}</span>
        </div>
      )}
      {(c.status.length > 0 || c.mantenuti.length > 0) && (
        <div className="cb-sts">
          {c.status.filter((s) => !s.mod?.scudo).map((s, i) => <StatusChip key={`${s.nome}-${i}`} s={s} />)}
          {c.mantenuti.map((m) => <span key={m.abilita} className="chip violet cb-st" title={`Mantiene ${m.abilita} da ${m.turni} turni`}>↻ {m.abilita}</span>)}
        </div>
      )}
      <div className="cb-meta xs muted">
        <span>{c.posizione}</span>
        {c.iniziativa != null && <span title="Iniziativa">ini {c.iniziativa}</span>}
        {Object.entries(c.cooldown).map(([k, v]) => <span key={k} title={`${k} in ricarica`}>⏳ {k} {v}</span>)}
        {master && onAdjust && (
          <button type="button" className="btn ghost cb-mini" onClick={() => setEdit((e) => !e)} aria-expanded={edit}>Correggi</button>
        )}
      </div>
      {edit && master && onAdjust && (
        <div className="cb-adj">
          <label className="cb-sr" htmlFor={`adj-${c.id}`}>Vita di {c.nome}</label>
          <input id={`adj-${c.id}`} className="input num" type="number" inputMode="numeric" min={0} placeholder={ni(c.hp)}
            value={hp} onChange={(e) => setHp(e.target.value)} />
          <button type="button" className="btn" disabled={hp === ""} onClick={() => { onAdjust({ hp: Math.max(0, Number(hp)) }); setHp(""); }}>Imposta HP</button>
          <button type="button" className="btn" onClick={() => onAdjust({ vivo: !c.vivo })}>{c.vivo ? "A terra" : "Rialza"}</button>
          {c.status.map((s, i) => (
            <button key={`${s.nome}-r${i}`} type="button" className="btn ghost" onClick={() => onAdjust({ remove_status: s.nome })}>Togli {s.nome}</button>
          ))}
        </div>
      )}
    </div>
  );
}
