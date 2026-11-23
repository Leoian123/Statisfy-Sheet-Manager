/* Scontro in stile JRPG a turni (variante B1, vista laterale).
   In alto l'ordine dei turni; al centro il campo: nemici a sinistra, gruppo a destra (si clicca per mirare o per
   guardare un combattente); in basso tre finestre: stato del gruppo, comandi, sottomenu delle abilità.
   Una riga di conferma riassume l'azione con l'anteprima del server (danno o cura, probabilità di colpire).
   I numeri li calcola solo il backend (POST /scontri/{id}/anteprima). */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { errorText } from "../../api/client";
import { battleApi, type Battle, type BattlePreview, type CombatAbility, type Combatant } from "../../api/scontri";
import { blocked, costText, maxTargets, targetPool } from "./ActionPanel";
import { ni, shieldOf, statusText } from "./CombatantCard";
import "../../styles/battle-b1.css";

type Cmd = "attacca" | "magia" | "abilita" | "mantieni";
const CMD_LABEL: Record<Cmd, string> = { attacca: "Attacca", magia: "Magia", abilita: "Abilità", mantieni: "Mantenuti" };
const ofCmd = (a: CombatAbility, c: Cmd) =>
  c === "attacca" ? a.base || a.tipo === "attacco"
    : c === "magia" ? a.tipo === "incantesimo" || a.tipo === "miracolo"
      : c === "abilita" ? a.tipo === "skill" : false;
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const initials = (s: string) => s.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

interface Props {
  battle: Battle;
  busy: boolean;
  /** Chi agisce: chi ha il turno (o un altro scelto dal Master) */
  actor: Combatant | null;
  sel: string[];
  setSel: (ids: string[]) => void;
  onAct: (abilita: string, bersagli: string[], tiri: Record<string, number>, forza: boolean) => Promise<unknown>;
  onStop: (abilita: string) => void;
  onEndTurn: () => void;
  canEnd: boolean;
  /** Pannello di un combattente cliccato fuori dalla mira (dettagli e, per il Master, correzioni) */
  renderFocus: (c: Combatant, close: () => void) => ReactNode;
}

export function BattleB1({ battle, busy, actor, sel, setSel, onAct, onStop, onEndTurn, canEnd, renderFocus }: Props) {
  const st = battle.state;
  const curId = st.ordine[st.turno];
  const [cmd, setCmd] = useState<Cmd | null>(null);
  const [abName, setAbName] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<BattlePreview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);

  const myTurn = !!actor && actor.id === curId;
  const forza = battle.master && !!actor && !myTurn;
  const usable = actor ? actor.abilita.filter((a) => a.tipo !== "passiva") : [];
  const ab = usable.find((a) => a.nome === abName) ?? null;
  const pool = useMemo(() => (actor ? targetPool(battle, actor, ab) : []), [battle, actor, ab]);
  const maxT = maxTargets(ab);
  const chosen = sel.filter((id) => pool.some((p) => p.id === id)).slice(0, maxT || 20);
  const why = actor && ab ? blocked(actor, ab, myTurn, forza) : null;

  // Nuovo turno o nuovo attore: si riparte dal menu dei comandi
  useEffect(() => { setCmd(null); setAbName(null); setVals({}); setPv(null); setTable(false); }, [actor?.id, st.round, st.turno]);

  // Anteprima dal server a ogni cambio di abilità, bersagli o stato
  const key = `${battle.version}:${actor?.id}:${abName}:${chosen.join(",")}`;
  useEffect(() => {
    if (!actor || !ab) { setPv(null); setPvErr(null); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      battleApi.preview(battle.id, actor.id, ab.nome, chosen)
        .then((p) => { if (alive) { setPv(p); setPvErr(null); } })
        .catch((e) => { if (alive) { setPv(null); setPvErr(errorText(e)); } });
    }, 200);
    return () => { alive = false; window.clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseCmd(c: Cmd) {
    setCmd(c);
    setAbName(null);
    setSel([]);
    const list = usable.filter((a) => ofCmd(a, c));
    if (c === "attacca" && list.length === 1) pickAb(list[0]);
  }
  function pickAb(a: CombatAbility) {
    if (!actor) return;
    setAbName(a.nome);
    setVals({});
    const p = targetPool(battle, actor, a);
    const keep = sel.filter((id) => p.some((x) => x.id === id)).slice(0, maxTargets(a) || 20);
    setSel(!keep.length && p.length === 1 ? [p[0].id] : keep);
  }
  function clickToken(c: Combatant) {
    if (ab && pool.some((p) => p.id === c.id)) {
      const on = chosen.includes(c.id);
      setSel(on ? chosen.filter((x) => x !== c.id) : maxT === 1 ? [c.id] : [...chosen, c.id].slice(0, maxT));
      return;
    }
    setFocus((f) => (f === c.id ? null : c.id));
  }
  async function confirm() {
    if (!ab) return;
    const tiri: Record<string, number> = {};
    if (table) for (const [k, v] of Object.entries(vals)) if (v.trim() !== "" && Number.isFinite(Number(v))) tiri[k] = Number(v);
    await onAct(ab.nome, chosen, tiri, forza);
    setCmd(null);
    setAbName(null);
  }

  const foes = Object.values(st.combattenti).filter((c) => c.lato === "nemici");
  const party = Object.values(st.combattenti).filter((c) => c.lato === "alleati");
  const targeting = !!ab && maxT > 0;
  const token = (c: Combatant) => {
    const can = targeting && pool.some((p) => p.id === c.id);
    const on = chosen.includes(c.id);
    const cls = ["b1-tok", c.lato === "nemici" ? "foe" : "ally", c.id === curId ? "cur" : "", on ? "sel" : "",
      targeting && !can ? "dim" : "", can && !on ? "can" : "", c.vivo ? "" : "down", focus === c.id ? "focus" : ""].filter(Boolean).join(" ");
    return (
      <button key={c.id} type="button" className={cls} onClick={() => clickToken(c)} aria-pressed={on || focus === c.id}
        title={`${c.nome} · HP ${ni(c.hp)}/${ni(c.hp_max)}${c.status.length ? ` · ${c.status.map(statusText).join(", ")}` : ""}`}>
        {c.id === curId && <span className="b1-arrow" aria-hidden="true">▶</span>}
        <span className="b1-sp">{initials(c.nome)}</span>
        <span className="b1-tn">{c.nome}</span>
        <span className="b1-hp"><i style={{ width: `${pct(c.hp, c.hp_max)}%` }} /></span>
        {on && <span className="b1-mark">bersaglio</span>}
        {!c.vivo && <span className="b1-mark down">a terra</span>}
      </button>
    );
  };

  const list = cmd ? usable.filter((a) => ofCmd(a, cmd)) : [];
  const cmds: Cmd[] = ["attacca", "magia", "abilita"];
  if (actor?.mantenuti.length) cmds.push("mantieni");
  const hit = pv?.richieste.find((r) => r.key.startsWith("colpo:"))?.soglia;
  const est = pv ? Object.entries(pv.stima).map(([cid, s]) => {
    const parts = Object.entries(s).map(([k, [lo, hi]]) => `${lo === hi ? ni(lo) : `${ni(lo)}–${ni(hi)}`} ${k}`);
    return `${st.combattenti[cid]?.nome ?? cid}: ${parts.join(", ")}`;
  }) : [];
  const focused = focus ? st.combattenti[focus] : null;

  return (
    <div className="b1">
      <div className="b1-stage" aria-label="Campo di battaglia">
        <div className="b1-side foes" aria-label="Nemici">{foes.map(token)}{!foes.length && <p className="xs muted">Nessun nemico in campo.</p>}</div>
        <div className="b1-side party" aria-label="Gruppo">{party.map(token)}</div>
      </div>

      {focused && <div className="b1-win b1-focus">{renderFocus(focused, () => setFocus(null))}</div>}

      <div className="b1-wins">
        <div className="b1-win b1-status scroll-y" aria-label="Stato del gruppo">
          {party.map((c) => (
            <div key={c.id} className={`b1-srow${c.id === actor?.id ? " me" : ""}${c.vivo ? "" : " down"}`}>
              <b>{c.nome}</b>
              <span className="b1-sb" title={`HP ${ni(c.hp)}/${ni(c.hp_max)}${shieldOf(c) ? ` + scudo ${ni(shieldOf(c))}` : ""}`}>
                <small>HP {ni(c.hp)}</small><i className="hp"><em style={{ width: `${pct(c.hp, c.hp_max)}%` }} /></i>
              </span>
              <span className="b1-sb" title={`MP ${ni(c.mp)}/${ni(c.mp_max)} · SP ${ni(c.sp)}/${ni(c.sp_max)}`}>
                <small>MP {ni(c.mp)}</small><i className="mp"><em style={{ width: `${pct(c.mp, c.mp_max)}%` }} /></i>
              </span>
            </div>
          ))}
        </div>

        <div className="b1-win b1-cmd" role="menu" aria-label="Comandi">
          {actor ? (
            <>
              <span className="b1-who">{myTurn ? actor.nome : `${actor.nome} (fuori turno)`}</span>
              {cmds.map((c) => {
                const n = c === "mantieni" ? actor.mantenuti.length : usable.filter((a) => ofCmd(a, c)).length;
                return (
                  <button key={c} type="button" role="menuitem" className={`b1-ci${cmd === c ? " on" : ""}`} disabled={!n}
                    onClick={() => chooseCmd(c)}>{cmd === c ? "▶ " : ""}{CMD_LABEL[c]}</button>
                );
              })}
              <button type="button" role="menuitem" className="b1-ci" disabled={busy || !canEnd} onClick={onEndTurn}
                title="Chiude il turno: rigenerazione, status e ricariche">Passa</button>
            </>
          ) : <span className="xs muted">Non è il turno di uno dei tuoi personaggi.</span>}
        </div>

        <div className="b1-win b1-sub scroll-y" aria-label="Sottomenu">
          {!cmd && <span className="xs muted">{actor ? "Scegli un comando." : ""}</span>}
          {cmd === "mantieni" && actor?.mantenuti.map((m) => (
            <div key={m.abilita} className="b1-si row-between">
              <span>↻ {m.abilita} <small className="muted">{m.turni}t</small></span>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => onStop(m.abilita)}>Interrompi</button>
            </div>
          ))}
          {cmd && cmd !== "mantieni" && list.map((a) => {
            const no = actor ? blocked(actor, a, myTurn, forza) : null;
            const cd = actor?.cooldown?.[a.nome];
            return (
              <button key={a.nome} type="button" className={`b1-si${abName === a.nome ? " on" : ""}${no ? " off" : ""}`}
                onClick={() => pickAb(a)} title={[a.descrizione, no ? `Ora non disponibile: ${no}` : "", a.testo ? "Senza meccanica: effetto applicato dal Master" : ""].filter(Boolean).join("\n")}>
                <span>{abName === a.nome ? "▶ " : ""}{a.nome}{a.testo && <small className="muted"> · testo</small>}</span>
                <small className="muted">{cd ? `⏳${cd}` : costText(a).replace("gratis", "")}</small>
              </button>
            );
          })}
        </div>
      </div>

      {ab && actor && (
        <div className="b1-win b1-confirm">
          <div className="b1-line">
            <span>
              <b>{actor.nome}</b> → {ab.bersaglio?.lato === "se" ? "sé" : maxT === 0 ? (ab.bersaglio?.forma === "tutti" ? "tutti" : "a caso")
                : chosen.length ? chosen.map((id) => st.combattenti[id]?.nome).join(", ") : <em className="muted">tocca un bersaglio sul campo</em>}
              {" · "}{ab.nome}
              {est.length > 0 && <> · <b>{est.join(" · ")}</b></>}
              {hit != null && <> · {hit}% di colpire</>}
            </span>
          </div>
          {ab.testo && <p className="xs muted">Senza meccanica: paga il costo e scrive l'effetto nel registro; lo applichi tu.</p>}
          {pvErr && chosen.length > 0 && <p className="hint bad" role="alert">{pvErr}</p>}
          {why && <p className="hint warn">{why}</p>}
          {table && pv && (
            <div className="b1-rolls">
              {pv.richieste.filter((r) => !r.key.startsWith("ini:")).map((r) => (
                <label key={r.key} className="b1-roll">
                  <span className="xs">{r.label}<span className="muted"> · {r.tipo === "d100" ? `d100${r.soglia != null ? ` ≤ ${r.soglia}` : ""}` : `${ni(r.min)}–${ni(r.max)}`}</span></span>
                  <input className="input num" type="number" inputMode="numeric" placeholder="server" value={vals[r.key] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value }))} />
                </label>
              ))}
            </div>
          )}
          {pv && pv.passi.length > 0 && (
            <details className="cb-steps"><summary className="xs">Come è calcolato</summary>
              <ul className="xs mono">{pv.passi.slice(0, 30).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </details>
          )}
          <div className="b1-actions">
            <button type="button" className="btn ghost" onClick={() => { setAbName(null); setSel([]); }}>Indietro</button>
            <button type="button" className="btn ghost" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? "Tira il server" : "Tiro io i dadi"}</button>
            <button type="button" className="btn primary" disabled={busy || !!why || (maxT > 0 && !chosen.length && pool.length > 1)} onClick={confirm}>Conferma</button>
          </div>
        </div>
      )}
    </div>
  );
}
