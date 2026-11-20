/* Sezione "Combattimento" della Plancia di gioco (ex pagina Combattimento), con progressive disclosure:
   chiusa quando non serve (una riga di riepilogo), si apre da sola quando il combattimento è in corso.
   Dentro: azioni e spese sulla quantità, effetti con durata, cooldown, Fine turno, Nuovo scontro, Morte con conferma
   e valori di combattimento. Barre, turno e posizione stanno nell'HUD; il registro è quello unico della plancia. */
import { useState } from "react";
import { api } from "../api/client";
import type { Character, CombatActionType, Death, RulesConfig } from "../api/types";
import { n, plural } from "../lib/format";
import { resourcesFor } from "../lib/resources";
import { DerivedRow } from "./DerivedRow";

const COMBAT_KEYS = ["iniziativa", "attacchi", "precisione", "evasione", "critico", "blocco", "difesa", "difesaMag", "moltFis", "moltMag"];

interface Props {
  c: Character;
  rules: RulesConfig | null;
  busy: boolean;
  amt: string;
  setAmt: (v: string) => void;
  apply: (fn: () => Promise<Character>) => Promise<Character | undefined>;
  onDied: () => void;
  open: boolean;
  /** Assente = sezione sempre aperta (telefono: ci si arriva dal selettore di sezione). */
  onToggle?: () => void;
}

type DeathMsg = { death: Death; from: { level: number; exp: number }; to: { level: number; exp: number }; respawn: string };

export function CombatPanel({ c, rules, busy, amt, setAmt, apply, onDied, open, onToggle }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [eff, setEff] = useState({ name: "", kind: "bad" as "good" | "bad", turns: "3", hpPerTurn: "", absorb: "" });
  const [deathOpen, setDeathOpen] = useState(false);
  const [hubris, setHubris] = useState(false);
  const [respawn, setRespawn] = useState<"checkpoint" | "here">("checkpoint");
  const [deathMsg, setDeathMsg] = useState<DeathMsg | null>(null);

  const r = c.resources;
  const res = resourcesFor(c.derived);
  const hasKi = res.some((x) => x.key === "ki");
  const kiRegen = c.derived.find((d) => d.key === "kiCombat")?.value ?? 0;
  const amount = Math.floor(Number(amt));
  const amountOk = Number.isFinite(amount) && amount > 0;
  const effects = c.combat.effects;
  const cds = c.combat.cooldowns;
  const action = (type: CombatActionType) => { if (amountOk) apply(() => api.combatAction(c.id, type, amount)); };

  async function addEffect() {
    const name = eff.name.trim();
    if (!name) return;
    const turns = Math.max(1, Math.min(99, Math.floor(Number(eff.turns)) || 1));
    const hp = Math.trunc(Number(eff.hpPerTurn)) || 0;
    const absorb = Math.max(0, Math.trunc(Number(eff.absorb)) || 0);
    const out = await apply(() => api.addEffect(c.id, {
      name, kind: eff.kind, turns,
      ...(hp ? { hpPerTurn: hp } : {}),
      ...(absorb ? { absorb, text: `Assorbe ${n(absorb)} danni` } : hp ? { text: `${hp > 0 ? "+" : "−"}${n(Math.abs(hp))} HP/turno` } : {}),
    }));
    if (out) { setEff({ name: "", kind: eff.kind, turns: "3", hpPerTurn: "", absorb: "" }); setAddOpen(false); }
  }

  async function die() {
    const from = { level: c.level, exp: c.exp_pct };
    const out = await apply(() => api.death(c.id, hubris, respawn));
    if (!out) return;
    if (out.death) setDeathMsg({ death: out.death, from, to: { level: out.level, exp: out.exp_pct }, respawn });
    setDeathOpen(false);
    setHubris(false);
    onDied();
  }

  const summary = [
    `Turno ${n(c.combat.turn)}`,
    effects.length ? `${n(effects.length)} ${plural(effects.length, "effetto", "effetti")}` : "",
    cds.length ? `${n(cds.length)} in ricarica` : "",
  ].filter(Boolean).join(" · ");

  return (
    <section className={`win pg-combat${open ? " is-open" : ""}`} data-sec="combattimento" aria-labelledby="pg-cb-h">
      <header className="win-h pg-combat-h">
        {onToggle ? (
          <button type="button" className="pg-disclose" aria-expanded={open} aria-controls="pg-cb-body" id="pg-cb-h" onClick={onToggle}
            title={open ? "Chiudi la sezione (la scelta resta ricordata)" : "Apri la sezione"}>
            <span>Combattimento</span>
            <span className="pg-disclose-sum xs muted">{summary}</span>
            <span className="pg-caret" aria-hidden="true">▾</span>
          </button>
        ) : (
          <span className="pg-disclose" id="pg-cb-h"><span>Combattimento</span><span className="pg-disclose-sum xs muted">{summary}</span></span>
        )}
      </header>
      <div className="win-b pg-combat-body" id="pg-cb-body" hidden={!open}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="pg-amt-row">
            <div className="field pg-amt">
              <label className="label" htmlFor="pg-amt">Quantità</label>
              <input className="input num" id="pg-amt" type="number" min={1} inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </div>
            <div className="lu-actions pg-actions">
              <button type="button" className="btn danger" disabled={busy || !amountOk} onClick={() => action("damage")}>Danno</button>
              <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("heal")}>Cura</button>
              <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("spend_mp")}>Spendi MP</button>
              <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("spend_sp")}>Spendi SP</button>
              {hasKi && <button type="button" className="btn" disabled={busy || !amountOk} onClick={() => action("spend_ki")}>Spendi KI</button>}
            </div>
          </div>
          <p className="footnote">
            Il danno consuma prima gli scudi. HP non si rigenerano in combattimento.
            {rules && <> A fine turno: MP +{rules.regen.mp_pct}% e SP +{rules.regen.sp_pct}% del massimo{hasKi
              ? <>, KI +{n(Math.round(kiRegen))} (VIT/30)</> : null}.</>}
          </p>
        </div>

        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <span className="label">Effetti attivi</span>
            <span className="spacer" />
            {!addOpen && <button type="button" className="btn ghost tv-mini" onClick={() => setAddOpen(true)}>+ Aggiungi effetto</button>}
          </div>
          {effects.length ? (
            <ul className="lu-list pg-list">{effects.map((e, i) => (
              <li key={`${i}-${e.name}`} title={`${e.name}${e.text ? ` — ${e.text}` : ""}${e.hpPerTurn ? `\n${e.hpPerTurn > 0 ? "+" : "−"}${n(Math.abs(e.hpPerTurn))} HP a turno` : ""}${e.absorb ? `\nAssorbe ancora ${n(Number(e.absorb))} danni` : ""}`}>
                <span className={`chip ${e.kind === "good" ? "good" : "bad"}`}>{e.name}</span>
                <span className="small pg-list-txt">{e.text || ""}</span>
                <span className="lu-turns">{n(e.turns)} {plural(e.turns, "turno", "turni")}</span>
                <button type="button" className="btn icon ghost" disabled={busy} aria-label={`Rimuovi ${e.name}`}
                  onClick={() => apply(() => api.removeEffect(c.id, i))}>✕</button>
              </li>
            ))}</ul>
          ) : <p className="small muted">Nessun effetto attivo.</p>}
          {addOpen && (
            <div className="lu-form anim-in">
              <div className="field"><label className="label" htmlFor="pg-eff-name">Nome</label>
                <input className="input" id="pg-eff-name" type="text" autoComplete="off" placeholder="Es. Veleno" autoFocus value={eff.name}
                  onChange={(e) => setEff({ ...eff, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEffect(); } }} /></div>
              <div className="field"><label className="label" htmlFor="pg-eff-kind">Tipo</label>
                <select className="input" id="pg-eff-kind" value={eff.kind} onChange={(e) => setEff({ ...eff, kind: e.target.value as "good" | "bad" })}>
                  <option value="good">Buono</option>
                  <option value="bad">Malus</option>
                </select></div>
              <div className="field"><label className="label" htmlFor="pg-eff-turns">Turni</label>
                <input className="input num" id="pg-eff-turns" type="number" min={1} max={99} inputMode="numeric" value={eff.turns}
                  onChange={(e) => setEff({ ...eff, turns: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="pg-eff-hp">HP per turno</label>
                <input className="input num" id="pg-eff-hp" type="number" inputMode="numeric" placeholder="Es. −3" value={eff.hpPerTurn}
                  onChange={(e) => setEff({ ...eff, hpPerTurn: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="pg-eff-abs">Assorbe danni</label>
                <input className="input num" id="pg-eff-abs" type="number" min={0} inputMode="numeric" placeholder="Es. 50" value={eff.absorb}
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
          {cds.length ? (
            <ul className="lu-list pg-list">{cds.map((cd, i) => (
              <li key={i}><span className="small pg-list-txt">{cd.name}</span><span className="lu-turns">{n(cd.turns)} {plural(cd.turns, "turno", "turni")}</span></li>
            ))}</ul>
          ) : <p className="small muted">Nessuna abilità in ricarica.</p>}
        </div>

        <div className="row">
          <button type="button" className="btn primary" disabled={busy} onClick={() => apply(() => api.endTurn(c.id))}>Fine turno</button>
          <span className="small muted">Turno {n(c.combat.turn)}</span>
          <span className="spacer" />
          <button type="button" className="btn ghost" disabled={busy} onClick={() => { setDeathMsg(null); apply(() => api.resetCombat(c.id)); }}
            title="Turno 1, effetti, cooldown e registro del combattimento svuotati">Nuovo scontro</button>
        </div>

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
              ? `Rinascita al checkpoint: ${res.map((x) => `${x.short} ${n(r[x.key] ?? 0)}`).join(" · ")}.`
              : "Rinascita sul posto: 1 HP."}</span>
            <div className="row" style={{ marginTop: 6 }}><button type="button" className="btn ghost" onClick={() => setDeathMsg(null)}>Chiudi</button></div>
          </div>
        )}
        {deathOpen ? (
          <div className="lu-death anim-in" role="group" aria-labelledby="pg-death-t">
            <span className="lu-title" id="pg-death-t">Confermi la morte di {c.name}?</span>
            <span className="small mono">
              Livello {n(c.level)} · {n(c.exp_pct)}%. Penalità: −1,5 livelli (−3 per Hubris); i livelli 1–2 sono protetti. L'esito lo calcola il server.
            </span>
            <label className="lu-check small" htmlFor="pg-hubris">
              <input type="checkbox" id="pg-hubris" checked={hubris} onChange={(e) => setHubris(e.target.checked)} /> Morte per Hubris (−3 livelli invece di −1,5)
            </label>
            <div className="field"><label className="label" htmlFor="pg-respawn">Rinascita</label>
              <select className="input" id="pg-respawn" value={respawn} onChange={(e) => setRespawn(e.target.value as "checkpoint" | "here")}>
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

        <details className="pg-cs">
          <summary className="label">Valori di combattimento</summary>
          <div className="lu-cs">
            {COMBAT_KEYS.map((k) => c.derived.find((d) => d.key === k)).filter((d) => !!d).map((d) => <DerivedRow key={d!.key} d={d!} />)}
          </div>
          <p className="footnote">Passa sopra un valore per vedere la formula. In oro i valori con bonus degli oggetti.</p>
        </details>
      </div>
    </section>
  );
}
