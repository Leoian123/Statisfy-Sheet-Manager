/* Plancia di scontro (Master e giocatori): ordine dei turni, schieramenti, abilità con anteprima del calcolo,
   reazioni, registro. PC: tre colonne. Telefono (≤ 760px): una sezione alla volta (Azione · Campo · Registro)
   con i comandi del turno in basso. Lo stato arriva dal server ogni 3 s (GET /api/scontri/attivo). */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errorText } from "../api/client";
import { battleApi, type Battle } from "../api/scontri";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { ActionPanel } from "../components/combat/ActionPanel";
import { AddCombatants, BattleLog, Pending, ReactionPrompt, StartBattle, TurnStrip, resultLines } from "../components/combat/BattleParts";
import { CombatantCard } from "../components/combat/CombatantCard";
import { ErrorBox, Loading, SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { usePolling } from "../lib/usePolling";
import "../styles/combat.css";

type Tab = "azione" | "campo" | "registro";

export function Scontro() {
  const toast = useToast();
  const { refreshChars } = useAppData();
  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("azione");
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
  // Chi agisce nel pannello: chi ha il turno se è mio; il Master può scegliere chiunque (con «Forza»)
  const actorId = b.master ? (actorPick && st.combattenti[actorPick] ? actorPick : curId)
    : myTurn ? curId : b.mine.find((id) => st.combattenti[id]?.vivo) ?? null;
  const actor = actorId ? st.combattenti[actorId] : null;
  const windows = st.in_attesa.filter((w) => w.tipo === "reazione");
  const allies = Object.values(st.combattenti).filter((c) => c.lato === "alleati");
  const foes = Object.values(st.combattenti).filter((c) => c.lato === "nemici");
  const canEnd = b.master || myTurn;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const side = (title: string, list: typeof allies) => (
    <div className="cb-side-g">
      <span className="label">{title} <span className="muted">{list.filter((c) => c.vivo).length}/{list.length}</span></span>
      {list.map((c) => (
        <CombatantCard key={c.id} c={c} current={c.id === curId} selected={sel.includes(c.id)} selectable={!!actor}
          onToggle={() => toggle(c.id)} showRes={b.master || c.lato === "alleati"} master={b.master}
          onAdjust={(patch) => run(() => battleApi.adjust(b.id, b.version, c.id, patch))} />
      ))}
    </div>
  );

  return (
    <div className="cb-root" data-tab={tab}>
      <header className="cb-head win">
        <div className="cb-head-t">
          <span className="label">Scontro · round {st.round}</span>
          <h1 className="cb-title">{b.name}</h1>
        </div>
        <TurnStrip battle={b} />
        {b.master && (
          <div className="row cb-head-m">
            <button type="button" className="btn ghost" disabled={busy || !b.can_undo} onClick={() => run(() => battleApi.undo(b.id, b.version))}>Annulla ultima azione</button>
            <button type="button" className="btn danger" disabled={busy}
              onClick={() => { if (window.confirm("Chiudere lo scontro? Le risorse dei PG restano come sono ora.")) run(() => battleApi.close(b.id, b.version)); }}>Chiudi scontro</button>
          </div>
        )}
        <Pending battle={b} />
      </header>

      <nav className="cb-tabs" aria-label="Sezioni dello scontro">
        {(["azione", "campo", "registro"] as Tab[]).map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "azione" ? "Azione" : t === "campo" ? "Campo" : "Registro"}</button>
        ))}
      </nav>

      <div className="cb-grid">
        <section className="cb-sec cb-side" data-sec="campo" aria-label="Schieramenti">
          {side("Alleati", allies)}
          {side("Nemici", foes)}
          {b.master && <AddCombatants battle={b} busy={busy} onAdd={(body) => run(() => battleApi.add(b.id, b.version, body))} />}
        </section>

        <section className="cb-sec cb-main" data-sec="azione" aria-label="Azione">
          {windows.map((w) => (
            <ReactionPrompt key={w.id} battle={b} w={w} busy={busy}
              onReact={(f, a, ab) => run(() => battleApi.react(b.id, b.version, f, a, ab))} />
          ))}
          {actor ? (
            <Win title={actor.id === curId ? "Turno" : "Azione fuori turno"} className="cb-win">
              <ActionPanel battle={b} actor={actor}
                picker={b.master ? (
                  <select className="input cb-actor" aria-label="Chi agisce" value={actorId ?? ""}
                    onChange={(e) => { setActorPick(e.target.value === curId ? null : e.target.value || null); setSel([]); }}>
                    {st.ordine.map((id) => st.combattenti[id] && (
                      <option key={id} value={id}>{st.combattenti[id].nome}{id === curId ? " (turno)" : ""}{st.combattenti[id].vivo ? "" : " · a terra"}</option>
                    ))}
                  </select>
                ) : undefined} myTurn={actor.id === curId && (b.master || myTurn)} sel={sel} setSel={setSel} busy={busy}
                onAct={(ab, tg, tiri, forza) => run(() => battleApi.act(b.id, b.version, actor.id, ab, tg, tiri, forza)).then((r) => { if (r) setSel([]); })}
                onStop={(ab) => run(() => battleApi.stopMaintained(b.id, b.version, actor.id, ab))} />
            </Win>
          ) : (
            <SysMsg lines={["Non hai personaggi in questo scontro: puoi seguirlo dal registro."]} />
          )}
          {!myTurn && !b.master && cur && <p className="small muted">Turno di <b>{cur.nome}</b>.</p>}
        </section>

        <section className="cb-sec cb-logs" data-sec="registro" aria-label="Registro">
          <Win title="Registro">
            <BattleLog battle={b} />
          </Win>
        </section>
      </div>

      <div className="cb-bar">
        <span className="small cb-bar-t">{cur ? <>Turno di <b>{cur.nome}</b></> : "—"}</span>
        <button type="button" className="btn primary" disabled={busy || !canEnd || windows.length > 0}
          title={windows.length ? "Risolvi prima la reazione in sospeso" : canEnd ? "Chiude il turno: rigenerazione, status e ricariche" : "Non è il tuo turno"}
          onClick={() => run(() => battleApi.endTurn(b.id, b.version))}>Fine turno</button>
      </div>
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
