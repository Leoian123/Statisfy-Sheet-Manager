/* Parti della plancia di scontro: ordine dei turni, finestra di reazione, effetti in attesa, registro, avvio. */
import { useEffect, useState } from "react";
import { errorText } from "../../api/client";
import { battleApi, type Battle, type BattleCandidates, type ManualCreature, type Waiting } from "../../api/scontri";
import { Loading } from "../Status";
import { ni } from "./CombatantCard";

export function TurnStrip({ battle }: { battle: Battle }) {
  const st = battle.state;
  const cur = st.ordine[st.turno];
  return (
    <ol className="cb-turns" aria-label="Ordine di iniziativa">
      {st.ordine.map((id) => {
        const c = st.combattenti[id];
        if (!c) return null;
        return (
          <li key={id} className={`cb-turn ${c.lato}${id === cur ? " cur" : ""}${c.vivo ? "" : " down"}`}
            aria-current={id === cur ? "step" : undefined} title={`${c.nome} · iniziativa ${c.iniziativa ?? "—"}`}>
            {c.nome}<small>{c.iniziativa ?? ""}</small>
          </li>
        );
      })}
    </ol>
  );
}

interface ReactProps {
  battle: Battle;
  w: Waiting;
  busy: boolean;
  onReact: (finestra: string, attore: string | null, abilita: string | null) => void;
}

export function ReactionPrompt({ battle, w, busy, onReact }: ReactProps) {
  const st = battle.state;
  const actor = st.combattenti[w.attore ?? ""];
  const targets = (w.bersagli ?? []).map((id) => st.combattenti[id]?.nome).filter(Boolean).join(", ");
  const mineCand = (w.candidati ?? []).filter((c) => battle.master || battle.mine.includes(c.id));
  const canSkip = battle.master || battle.mine.includes(w.attore ?? "") || mineCand.length > 0;
  return (
    <div className="sysmsg gold cb-react" role="alert">
      <span className="tag">[REAZIONE]</span>
      <span><b>{actor?.nome ?? "?"}</b> sta per usare <b>{w.abilita}</b>{targets ? <> su {targets}</> : null}.</span>
      {mineCand.length > 0 ? (
        <div className="row">
          {mineCand.map((c) => (
            <button key={`${c.id}-${c.abilita}`} type="button" className="btn primary" disabled={busy}
              onClick={() => onReact(w.id, c.id, c.abilita)}>{c.nome}: {c.abilita}</button>
          ))}
          {canSkip && <button type="button" className="btn" disabled={busy} onClick={() => onReact(w.id, null, null)}>Nessuna reazione</button>}
        </div>
      ) : canSkip ? (
        <div className="row">
          <span className="xs muted">Può reagire: {(w.candidati ?? []).map((c) => `${c.nome} (${c.abilita})`).join(", ")}</span>
          <button type="button" className="btn" disabled={busy} onClick={() => onReact(w.id, null, null)}>Prosegui senza reazione</button>
        </div>
      ) : <span className="xs muted">In attesa della risposta degli avversari…</span>}
    </div>
  );
}

export function Pending({ battle }: { battle: Battle }) {
  const st = battle.state;
  const items = st.in_attesa.filter((w) => w.tipo !== "reazione");
  if (!items.length && !st.campo.length) return null;
  const who = (id?: string) => (id ? st.combattenti[id]?.nome ?? id : "");
  return (
    <div className="cb-pending">
      {st.campo.map((f, i) => <span key={`f${i}`} className="chip violet" title="Effetto di campo">{f.nome}{f.turni ? ` · ${f.turni}r` : ""}</span>)}
      {items.map((w) => (
        <span key={w.id} className={`chip ${w.tipo === "trappola" ? "warn" : "gold"}`}
          title={w.tipo === "canalizzazione" ? "Canalizzazione: si può interrompere" : w.tipo === "bomba" ? "Esplode quando scade" : "Scatta quando un nemico agisce"}>
          {w.tipo === "canalizzazione" ? "◷" : w.tipo === "bomba" ? "✹" : "⌖"} {w.abilita || w.tipo} · {who(w.fonte)}{w.turni ? ` · ${w.turni}t` : ""}
        </span>
      ))}
    </div>
  );
}

export function BattleLog({ battle }: { battle: Battle }) {
  const lines = battle.state.registro.slice(-80).reverse();
  return (
    <ol className="cb-log scroll-y" aria-label="Registro dello scontro" tabIndex={0}>
      {lines.map((l, i) => (
        <li key={battle.state.registro.length - i} className={`cb-l k-${l.k}`}>
          <span className="cb-l-r mono">R{l.r}</span><span>{l.t}</span>
        </li>
      ))}
      {!lines.length && <li className="xs muted">Ancora niente.</li>}
    </ol>
  );
}

const EMPTY_CREATURE: ManualCreature = { name: "", count: 1, level: 1, rarity: "Comune" };
const RARITIES = ["Comune", "Non Comune", "Raro", "Epico", "Unico", "Leggendario", "Mitico", "Divino"];

/** Avvio di uno scontro (Master): da un incontro della Forgia o al volo (PG + creature). */
export function StartBattle({ onStarted }: { onStarted: (b: Battle) => void }) {
  const [cand, setCand] = useState<BattleCandidates | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enc, setEnc] = useState<string>("");
  const [pcs, setPcs] = useState<number[]>([]);
  const [cr, setCr] = useState<ManualCreature[]>([{ ...EMPTY_CREATURE }]);

  useEffect(() => { battleApi.candidates().then(setCand).catch((e) => setErr(errorText(e))); }, []);
  if (!cand) return err ? <p className="hint bad">{err}</p> : <Loading />;

  async function go(body: Parameters<typeof battleApi.start>[0]) {
    setBusy(true);
    setErr(null);
    try { onStarted(await battleApi.start(body)); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  const quickOk = pcs.length > 0 && cr.some((c) => c.name.trim());
  return (
    <div className="cb-start">
      <section className="win">
        <header className="win-h">Da un incontro della Forgia</header>
        <div className="win-b">
          {cand.encounters.length ? (
            <>
              <select className="input" value={enc} onChange={(e) => setEnc(e.target.value)} aria-label="Incontro">
                <option value="">Scegli un incontro…</option>
                {cand.encounters.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.creatures} creature · {e.party.length} PG</option>)}
              </select>
              <button type="button" className="btn primary" disabled={busy || !enc} onClick={() => go({ encounter_id: Number(enc) })}>Avvia lo scontro</button>
            </>
          ) : <p className="small muted">Nessun incontro aperto: preparane uno nella Forgia, oppure avvia uno scontro al volo.</p>}
        </div>
      </section>
      <section className="win">
        <header className="win-h">Scontro al volo</header>
        <div className="win-b">
          <fieldset className="cb-fs">
            <legend className="label">Personaggi</legend>
            <div className="cb-pcs">
              {cand.characters.map((c) => (
                <label key={c.id} className="cb-pc" title={`${c.abilities} abilità con meccanica`}>
                  <input type="checkbox" checked={pcs.includes(c.id)}
                    onChange={(e) => setPcs((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                  <span>{c.name} <span className="xs muted">Lv {c.level}{c.abilities ? ` · ${c.abilities} abilità` : ""}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="cb-fs">
            <legend className="label">Creature</legend>
            {cr.map((c, i) => (
              <div key={i} className="cb-cr-row">
                <input className="input" placeholder="Lupo" aria-label="Nome" value={c.name} maxLength={60}
                  onChange={(e) => setCr((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input num" type="number" min={1} max={20} aria-label="Quante" value={c.count}
                  onChange={(e) => setCr((l) => l.map((x, j) => (j === i ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))} />
                <input className="input num" type="number" min={0} aria-label="Livello" value={c.level}
                  onChange={(e) => setCr((l) => l.map((x, j) => (j === i ? { ...x, level: Math.max(0, Number(e.target.value) || 0) } : x)))} />
                <select className="input" aria-label="Rarità" value={c.rarity}
                  onChange={(e) => setCr((l) => l.map((x, j) => (j === i ? { ...x, rarity: e.target.value } : x)))}>
                  {RARITIES.map((r) => <option key={r}>{r}</option>)}
                </select>
                <button type="button" className="btn ghost" aria-label="Togli" disabled={cr.length === 1}
                  onClick={() => setCr((l) => l.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="row">
              <button type="button" className="btn ghost" disabled={cr.length >= 12} onClick={() => setCr((l) => [...l, { ...EMPTY_CREATURE }])}>+ Creatura</button>
              <span className="xs muted">numero · livello · rarità</span>
            </div>
          </fieldset>
          <button type="button" className="btn primary" disabled={busy || !quickOk}
            onClick={() => go({ pg_ids: pcs, creature: cr.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })) })}>
            Avvia lo scontro
          </button>
        </div>
      </section>
      {err && <p className="hint bad" role="alert">{err}</p>}
    </div>
  );
}

export function resultLines(b: Battle): string[] {
  return (b.result?.eventi ?? []).filter((e) => e.k !== "turno").slice(-6).map((e) => e.t);
}

export { ni };

/** Master: aggiunge nemici (a mano o da un incontro della Forgia) o PG a uno scontro in corso. */
export function AddCombatants({ battle, busy, onAdd }: {
  battle: Battle; busy: boolean;
  onAdd: (body: { creature?: ManualCreature[]; encounter_id?: number | null; pg_ids?: number[] }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [cand, setCand] = useState<BattleCandidates | null>(null);
  const [c, setC] = useState<ManualCreature>({ ...EMPTY_CREATURE });
  const [enc, setEnc] = useState("");
  const [pc, setPc] = useState("");
  useEffect(() => { if (open && !cand) battleApi.candidates().then(setCand).catch(() => setCand({ encounters: [], characters: [] })); }, [open, cand]);
  const inBattle = new Set(Object.values(battle.state.combattenti).map((x) => x.rif));
  const freePcs = (cand?.characters ?? []).filter((x) => !inBattle.has(`pg:${x.id}`));
  return (
    <details className="cb-add" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>+ Aggiungi nemici o personaggi</summary>
      <div className="cb-add-row">
        <input className="input" placeholder="Lupo" aria-label="Nome della creatura" maxLength={60} value={c.name}
          onChange={(e) => setC({ ...c, name: e.target.value })} />
        <input className="input num" type="number" min={1} max={20} aria-label="Quante" value={c.count}
          onChange={(e) => setC({ ...c, count: Math.max(1, Number(e.target.value) || 1) })} />
        <input className="input num" type="number" min={0} aria-label="Livello" value={c.level}
          onChange={(e) => setC({ ...c, level: Math.max(0, Number(e.target.value) || 0) })} />
      </div>
      <div className="row">
        <select className="input" aria-label="Rarità" value={c.rarity} style={{ flex: 1 }} onChange={(e) => setC({ ...c, rarity: e.target.value })}>
          {RARITIES.map((r) => <option key={r}>{r}</option>)}
        </select>
        <button type="button" className="btn" disabled={busy || !c.name.trim()}
          onClick={() => onAdd({ creature: [{ ...c, name: c.name.trim() }] }).then(() => setC({ ...EMPTY_CREATURE }))}>Aggiungi</button>
      </div>
      <span className="xs muted">nome · quante · livello · rarità</span>
      {cand && cand.encounters.length > 0 && (
        <div className="row">
          <select className="input" aria-label="Incontro della Forgia" value={enc} style={{ flex: 1 }} onChange={(e) => setEnc(e.target.value)}>
            <option value="">Creature da un incontro…</option>
            {cand.encounters.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.creatures} creature</option>)}
          </select>
          <button type="button" className="btn" disabled={busy || !enc} onClick={() => onAdd({ encounter_id: Number(enc) }).then(() => setEnc(""))}>Aggiungi</button>
        </div>
      )}
      {freePcs.length > 0 && (
        <div className="row">
          <select className="input" aria-label="Personaggio" value={pc} style={{ flex: 1 }} onChange={(e) => setPc(e.target.value)}>
            <option value="">Personaggio non in scontro…</option>
            {freePcs.map((x) => <option key={x.id} value={x.id}>{x.name} · Lv {x.level}</option>)}
          </select>
          <button type="button" className="btn" disabled={busy || !pc} onClick={() => onAdd({ pg_ids: [Number(pc)] }).then(() => setPc(""))}>Aggiungi</button>
        </div>
      )}
    </details>
  );
}
