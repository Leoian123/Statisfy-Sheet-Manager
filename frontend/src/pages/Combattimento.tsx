import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Character, CombatActionType, Death } from "../api/types";
import { useAppData } from "../auth/AppData";
import { Bar } from "../components/Bar";
import { DerivedRow } from "../components/DerivedRow";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { Win } from "../components/Win";
import { n, plural } from "../lib/format";
import { useBusy, useCharacter } from "../lib/useCharacter";
import { dmap } from "./Scheda";

const COMBAT_KEYS = ["iniziativa", "attacchi", "precisione", "evasione", "critico", "blocco", "difesa", "difesaMag", "moltFis", "moltMag"];
const FALLBACK_POSITIONS = ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"];

export function Combattimento() {
  const id = Number(useParams().id);
  const { char, setChar, error, reload } = useCharacter(id);
  if (error && !char) return <ErrorBox title="Combattimento" message={error} action={<button className="btn" type="button" onClick={reload}>Riprova</button>} />;
  if (!char) return <Loading />;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="lu-head">
        <h1>Combattimento</h1>
        <p className="muted small">{char.name} · {char.classe} · Livello {n(char.level)}. Ogni azione viene registrata sul server.</p>
      </div>
      <div className="lu-combat-grid">
        <CombatWin key={char.id} c={char} onChange={setChar} />
        <Win title="Valori di combattimento">
          <div className="lu-cs">
            {COMBAT_KEYS.map((k) => char.derived.find((d) => d.key === k)).filter((d) => !!d).map((d) => <DerivedRow key={d!.key} d={d!} />)}
          </div>
          <p className="footnote">Passa sopra un valore per vedere la formula. In oro i valori con bonus degli oggetti.</p>
        </Win>
      </div>
    </div>
  );
}

function CombatWin({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const { rules, refreshChars } = useAppData();
  const { busy, error, run } = useBusy();
  const [amt, setAmt] = useState("50");
  const [addOpen, setAddOpen] = useState(false);
  const [eff, setEff] = useState({ name: "", kind: "bad" as "good" | "bad", turns: "3", hpPerTurn: "", absorb: "" });
  const [deathOpen, setDeathOpen] = useState(false);
  const [hubris, setHubris] = useState(false);
  const [respawn, setRespawn] = useState<"checkpoint" | "here">("checkpoint");
  const [deathMsg, setDeathMsg] = useState<{ death: Death; from: { level: number; exp: number }; to: { level: number; exp: number }; respawn: string } | null>(null);

  const d = dmap(c.derived);
  const r = c.resources;
  const max = { hp: d.hp?.value ?? 0, mp: d.mp?.value ?? 0, sp: d.sp?.value ?? 0 };
  const shield = c.combat.effects.find((e) => Number(e.absorb) > 0);
  const positions = rules?.positions ?? FALLBACK_POSITIONS;
  const amount = Math.floor(Number(amt));
  const amountOk = Number.isFinite(amount) && amount > 0;

  async function apply(fn: () => Promise<Character>) {
    const res = await run(fn);
    if (res) onChange(res);
    return res;
  }
  const action = (type: CombatActionType) => { if (amountOk) apply(() => api.combatAction(c.id, type, amount)); };

  async function addEffect() {
    const name = eff.name.trim();
    if (!name) return;
    const turns = Math.max(1, Math.min(99, Math.floor(Number(eff.turns)) || 1));
    const hp = Math.trunc(Number(eff.hpPerTurn)) || 0;
    const absorb = Math.max(0, Math.trunc(Number(eff.absorb)) || 0);
    const res = await apply(() => api.addEffect(c.id, {
      name, kind: eff.kind, turns,
      ...(hp ? { hpPerTurn: hp } : {}),
      ...(absorb ? { absorb, text: `Assorbe ${n(absorb)} danni` } : hp ? { text: `${hp > 0 ? "+" : "−"}${n(Math.abs(hp))} HP/turno` } : {}),
    }));
    if (res) { setEff({ name: "", kind: eff.kind, turns: "3", hpPerTurn: "", absorb: "" }); setAddOpen(false); }
  }

  async function die() {
    const from = { level: c.level, exp: c.exp_pct };
    const res = await apply(() => api.death(c.id, hubris, respawn));
    if (!res) return;
    if (res.death) setDeathMsg({ death: res.death, from, to: { level: res.level, exp: res.exp_pct }, respawn });
    setDeathOpen(false);
    setHubris(false);
    refreshChars();
  }

  const log = c.combat.log ?? [];

  return (
    <Win title="Combattimento" right={<span className="chip violet">Turno {n(c.combat.turn)}</span>}>
      <div className="field">
        <label className="label" htmlFor="lu-pos">Posizione</label>
        <select className="input" id="lu-pos" value={c.combat.position} disabled={busy}
          onChange={(e) => apply(() => api.patchCharacter(c.id, { combat: { position: e.target.value } }))}>
          {!positions.includes(c.combat.position) && <option value={c.combat.position}>{c.combat.position}</option>}
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="stack">
        <Bar kind="hp" label="Vita (HP)" cur={r.hp} max={max.hp} />
        <Bar kind="mp" label="Mana (MP)" cur={r.mp} max={max.mp} />
        <Bar kind="sp" label="Stamina (SP)" cur={r.sp} max={max.sp} />
        {shield && <div className="row"><span className="chip good">{shield.name}: assorbe ancora {n(Number(shield.absorb))} danni</span></div>}
      </div>
      <div className="lu-amt">
        <div className="field">
          <label className="label" htmlFor="lu-amt">Quantità</label>
          <input className="input num" id="lu-amt" type="number" min={1} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </div>
        <div className="lu-actions">
          <button type="button" className="btn danger" disabled={busy || !amountOk} onClick={() => action("damage")}>Danno</button>
          <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("heal")}>Cura</button>
          <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("spend_mp")}>Spendi MP</button>
          <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("spend_sp")}>Spendi SP</button>
        </div>
        <p className="footnote">
          HP non si rigenerano in combattimento.
          {rules && <> A fine turno: MP +{rules.regen.mp_pct}% e SP +{rules.regen.sp_pct}% del massimo.</>}
        </p>
      </div>
      <InlineError message={error} />
      <div className="lu-sep" />
      <div className="stack" style={{ gap: 6 }}>
        <div className="row">
          <span className="label">Effetti attivi</span>
          <span className="spacer" />
          {!addOpen && <button type="button" className="btn ghost" onClick={() => setAddOpen(true)}>+ Aggiungi effetto</button>}
        </div>
        {c.combat.effects.length ? (
          <ul className="lu-list">{c.combat.effects.map((e, i) => (
            <li key={`${i}-${e.name}`}>
              <span className={`chip ${e.kind === "good" ? "good" : "bad"}`}>{e.name}</span>
              <span className="small">{e.text || ""}</span>
              <span className="lu-turns">{n(e.turns)} {plural(e.turns, "turno", "turni")}</span>
              <button type="button" className="btn icon ghost" disabled={busy} aria-label={`Rimuovi ${e.name}`}
                onClick={() => apply(() => api.removeEffect(c.id, i))}>✕</button>
            </li>
          ))}</ul>
        ) : <p className="small muted">Nessun effetto attivo.</p>}
        {addOpen && (
          <div className="lu-form anim-in">
            <div className="field"><label className="label" htmlFor="lu-eff-name">Nome</label>
              <input className="input" id="lu-eff-name" type="text" autoComplete="off" placeholder="Es. Veleno" autoFocus value={eff.name}
                onChange={(e) => setEff({ ...eff, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEffect(); } }} /></div>
            <div className="field"><label className="label" htmlFor="lu-eff-kind">Tipo</label>
              <select className="input" id="lu-eff-kind" value={eff.kind} onChange={(e) => setEff({ ...eff, kind: e.target.value as "good" | "bad" })}>
                <option value="good">Buono</option>
                <option value="bad">Malus</option>
              </select></div>
            <div className="field"><label className="label" htmlFor="lu-eff-turns">Turni</label>
              <input className="input num" id="lu-eff-turns" type="number" min={1} max={99} inputMode="numeric" value={eff.turns}
                onChange={(e) => setEff({ ...eff, turns: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="lu-eff-hp">HP per turno</label>
              <input className="input num" id="lu-eff-hp" type="number" inputMode="numeric" placeholder="Es. −3" value={eff.hpPerTurn}
                onChange={(e) => setEff({ ...eff, hpPerTurn: e.target.value })} /></div>
            <div className="field"><label className="label" htmlFor="lu-eff-abs">Assorbe danni</label>
              <input className="input num" id="lu-eff-abs" type="number" min={0} inputMode="numeric" placeholder="Es. 50" value={eff.absorb}
                onChange={(e) => setEff({ ...eff, absorb: e.target.value })} /></div>
            <div className="row">
              <button type="button" className="btn primary" disabled={!eff.name.trim() || busy} onClick={addEffect}>Aggiungi</button>
              <button type="button" className="btn ghost" onClick={() => setAddOpen(false)}>Annulla</button>
            </div>
          </div>
        )}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Cooldown</span>
        {c.combat.cooldowns.length ? (
          <ul className="lu-list">{c.combat.cooldowns.map((cd, i) => (
            <li key={i}><span className="small">{cd.name}</span><span className="lu-turns">{n(cd.turns)} {plural(cd.turns, "turno", "turni")}</span></li>
          ))}</ul>
        ) : <p className="small muted">Nessuna abilità in ricarica.</p>}
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => apply(() => api.endTurn(c.id))}>Fine turno</button>
        <span className="small muted">Turno {n(c.combat.turn)}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" disabled={busy} onClick={() => { setDeathMsg(null); apply(() => api.resetCombat(c.id)); }}
          title="Turno 1, effetti, cooldown e registro svuotati">Nuovo scontro</button>
      </div>
      {log.length ? (
        <div className="sysmsg lu-log" aria-live="polite">
          <span className="tag">[REGISTRO]</span>
          {log.slice(-8).map((l, i) => <span key={i}>{l}</span>)}
        </div>
      ) : <p className="small muted">Nessun evento registrato.</p>}
      <div className="lu-sep" />
      {deathMsg && (
        <div className={`sysmsg anim-in${deathMsg.death.protected ? "" : " gold"}`} role="status">
          <span className="tag">[SISTEMA] Sei morto.</span>
          {deathMsg.death.protected ? (
            <span>Livello {n(deathMsg.from.level)} protetto: nessuna perdita di livello.</span>
          ) : (
            <>
              <span>Perdita: −{deathMsg.death.lost.toLocaleString("it-IT")} livelli.</span>
              <span>Livello {n(deathMsg.from.level)} · {n(deathMsg.from.exp)}% → {n(deathMsg.to.level)} · {n(deathMsg.to.exp)}%.</span>
              <span>Malus: {deathMsg.death.malus}.</span>
              <span>Bonus: {deathMsg.death.bonus}.</span>
            </>
          )}
          <span>{deathMsg.respawn === "checkpoint"
            ? `Rinascita al checkpoint: HP ${n(r.hp)} · MP ${n(r.mp)} · SP ${n(r.sp)}.`
            : "Rinascita sul posto: 1 HP."}</span>
          <div className="row" style={{ marginTop: 6 }}><button type="button" className="btn ghost" onClick={() => setDeathMsg(null)}>Chiudi</button></div>
        </div>
      )}
      {deathOpen ? (
        <div className="lu-death anim-in" role="group" aria-labelledby="lu-death-t">
          <span className="lu-title" id="lu-death-t">Confermi la morte di {c.name}?</span>
          <span className="small mono">
            Livello {n(c.level)} · {n(c.exp_pct)}%. Penalità: −1,5 livelli (−3 per Hubris); i livelli 1–2 sono protetti. L'esito lo calcola il server.
          </span>
          <label className="lu-check small" htmlFor="lu-hubris">
            <input type="checkbox" id="lu-hubris" checked={hubris} onChange={(e) => setHubris(e.target.checked)} /> Morte per Hubris (−3 livelli invece di −1,5)
          </label>
          <div className="field"><label className="label" htmlFor="lu-respawn">Rinascita</label>
            <select className="input" id="lu-respawn" value={respawn} onChange={(e) => setRespawn(e.target.value as "checkpoint" | "here")}>
              <option value="checkpoint">Al checkpoint — risorse al 50%</option>
              <option value="here">Sul posto — 1 HP</option>
            </select></div>
          <div className="row">
            <button type="button" className="btn danger" disabled={busy} onClick={die}>Conferma morte</button>
            <button type="button" className="btn ghost" onClick={() => { setDeathOpen(false); setHubris(false); }}>Annulla</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn danger" onClick={() => { setDeathOpen(true); setDeathMsg(null); }}>Morte del personaggio</button>
          <span className="xs muted">I livelli 1–2 sono protetti.</span>
        </div>
      )}
    </Win>
  );
}
