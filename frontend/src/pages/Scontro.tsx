/* Plancia di scontro (Master e giocatori) in stile JRPG a turni, vista laterale (BattleB1): ordine dei turni in alto,
   campo con nemici e gruppo, finestre di stato, comandi e sottomenu, conferma con anteprima del server.
   Registro e comandi del Master a scomparsa. Lo stato arriva dal server ogni 3 s (GET /api/scontri/attivo). */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorText } from "../api/client";
import { battleApi, type Battle } from "../api/scontri";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { BattleB1 } from "../components/combat/BattleB1";
import { AddCombatants, BattleLog, Pending, ReactionPrompt, StartBattle, TurnStrip, resultLines } from "../components/combat/BattleParts";
import { CombatantCard } from "../components/combat/CombatantCard";
import { ErrorBox, Loading, SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { usePolling } from "../lib/usePolling";
import "../styles/combat.css";


export function Scontro() {
  const toast = useToast();
  const { refreshChars } = useAppData();
  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [actorPick, setActorPick] = useState<string | null>(null);
  const mutations = useRef(0);
  const turnKey = battle ? `${battle.id}:${battle.state.round}:${battle.state.turno}` : "";
  useEffect(() => { setActorPick(null); setSel([]); }, [turnKey]);

  const load = useCallback(async () => {
    const seq = mutations.current;
    try {
      const r = await battleApi.active();
      if (seq === mutations.current) setBattle(r.scontro);
      setErr(null);
    } catch (e) { setErr(errorText(e)); }
  }, []);
  usePolling(load, 3000, [load]);

  async function run(fn: () => Promise<Battle>) {
    mutations.current += 1;
    setBusy(true);
    try {
      const b = await fn();
      mutations.current += 1;
      setBattle(b.active ? b : null);
      const lines = resultLines(b);
      if (b.result && lines.length) toast(b.result.esito === "reazione" ? "REAZIONE" : "SCONTRO", lines, { gold: b.result.esito === "reazione" });
      refreshChars();
      return b;
    } catch (e) {
      toast("SISTEMA", [errorText(e)], { bad: true });
      if (e instanceof ApiError && e.status === 409) load();
      return null;
    } finally { setBusy(false); }
  }

  if (err && battle === undefined) return <ErrorBox title="Scontro" message={err} action={<button type="button" className="btn" onClick={load}>Riprova</button>} />;
  if (battle === undefined) return <Loading text="Schieramento dei combattenti…" />;
  if (battle === null) return <NoBattle onStarted={(b) => setBattle(b)} />;

  const b = battle;
  const st = b.state;
  const curId = st.ordine[st.turno];
  const cur = st.combattenti[curId];
  const myTurn = !!cur && b.mine.includes(curId);
  // Chi agisce: chi ha il turno se è mio (o per il Master); il Master può far agire un altro fuori turno
  const actorId = b.master ? (actorPick && st.combattenti[actorPick] ? actorPick : curId) : myTurn ? curId : null;
  const actor = actorId ? st.combattenti[actorId] : null;
  const windows = st.in_attesa.filter((w) => w.tipo === "reazione");
  const canEnd = (b.master || myTurn) && !windows.length;

  return (
    <div className="b1-root">
      <div className="b1-top">
        <span className="b1-round">Round {st.round}</span>
        <TurnStrip battle={b} />
        <span className="spacer" />
        <button type="button" className="btn ghost" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>Registro</button>
        {b.master && (
          <details className="b1-menu">
            <summary className="btn ghost" aria-label="Comandi del Master">Master ▾</summary>
            <div className="b1-menu-pop">
              <label className="small">
                <span className="label">Fai agire</span>
                <select className="input" value={actorId ?? ""} onChange={(e) => { setActorPick(e.target.value === curId ? null : e.target.value || null); setSel([]); }}>
                  {st.ordine.map((id) => st.combattenti[id] && (
                    <option key={id} value={id}>{st.combattenti[id].nome}{id === curId ? " (turno)" : ""}{st.combattenti[id].vivo ? "" : " · a terra"}</option>
                  ))}
                </select>
              </label>
              <AddCombatants battle={b} busy={busy} onAdd={(body) => run(() => battleApi.add(b.id, b.version, body))} />
              <button type="button" className="btn ghost" disabled={busy || !b.can_undo} onClick={() => run(() => battleApi.undo(b.id, b.version))}>Annulla ultima azione</button>
              <button type="button" className="btn danger" disabled={busy}
                onClick={() => { if (window.confirm("Chiudere lo scontro? Le risorse dei PG restano come sono ora.")) run(() => battleApi.close(b.id, b.version)); }}>Chiudi scontro</button>
            </div>
          </details>
        )}
      </div>
      <Pending battle={b} />

      {windows.map((w) => (
        <ReactionPrompt key={w.id} battle={b} w={w} busy={busy} onReact={(f, a, ab) => run(() => battleApi.react(b.id, b.version, f, a, ab))} />
      ))}

      <div className={`b1-layout${showLog ? " with-log" : ""}`}>
        <BattleB1 battle={b} busy={busy} actor={actor} sel={sel} setSel={setSel} canEnd={canEnd}
          onAct={(ab, tg, tiri, forza) => actor ? run(() => battleApi.act(b.id, b.version, actor.id, ab, tg, tiri, forza)).then((r) => { if (r) setSel([]); }) : Promise.resolve()}
          onStop={(ab) => { if (actor) run(() => battleApi.stopMaintained(b.id, b.version, actor.id, ab)); }}
          onEndTurn={() => run(() => battleApi.endTurn(b.id, b.version))}
          renderFocus={(c, close) => (
            <div className="b1-focus-in">
              <CombatantCard c={c} current={c.id === curId} selected={false} selectable={false}
                showRes={b.master || c.lato === "alleati"} master={b.master}
                onAdjust={(patch) => run(() => battleApi.adjust(b.id, b.version, c.id, patch))} />
              <button type="button" className="btn ghost" onClick={close}>Chiudi</button>
            </div>
          )} />
        {showLog && (
          <aside className="b1-log win" aria-label="Registro">
            <header className="win-h">Registro<span className="spacer" /><button type="button" className="btn ghost cb-mini" onClick={() => setShowLog(false)}>Chiudi</button></header>
            <div className="win-b"><BattleLog battle={b} /></div>
          </aside>
        )}
      </div>
      {!actor && cur && <p className="small muted">Turno di <b>{cur.nome}</b>: aspetta il tuo.</p>}
      {!showLog && st.registro.length > 0 && (
        <p className="xs muted b1-last"><span className="label">Ultimo</span> {st.registro[st.registro.length - 1].t}</p>
      )}
    </div>
  );
}

function NoBattle({ onStarted }: { onStarted: (b: Battle) => void }) {
  const { user } = useAuth();
  if (user?.role !== "master") {
    return (
      <Win title="Scontro">
        <SysMsg lines={["Nessuno scontro in corso. Quando il Master ne avvia uno lo trovi qui."]} />
      </Win>
    );
  }
  return (
    <div className="stack">
      <QuickStart onStarted={onStarted} />
      <details className="cb-more">
        <summary className="small">Altri modi: da un incontro della Forgia o scegliendo PG e creature</summary>
        <StartBattle onStarted={onStarted} />
      </details>
    </div>
  );
}

/** Un clic: plancia con tutto il gruppo; i nemici si aggiungono dalla plancia quando servono. */
function QuickStart({ onStarted }: { onStarted: (b: Battle) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try { onStarted(await battleApi.start({ tutti: true })); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <Win title="Plancia di scontro">
      <p className="small muted">Apre la plancia con tutto il gruppo e tira l'iniziativa. I nemici li aggiungi dalla plancia (a mano o da un
        incontro della Forgia), anche a scontro iniziato. Ogni abilità della scheda è usabile: quelle senza meccanica pagano il costo e
        scrivono l'effetto nel registro, e lo applichi tu.</p>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={go}>Apri la plancia con il gruppo</button>
      </div>
      {err && <p className="hint bad" role="alert">{err}</p>}
    </Win>
  );
}
