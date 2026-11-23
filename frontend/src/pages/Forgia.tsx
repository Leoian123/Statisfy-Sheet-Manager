/* Forgia del Master: wizard di creazione dei contenuti e libreria della campagna (porting di mockup/screens/forgia.js).
   Le bozze restano finché non si salva o si annulla, anche tornando alla Forgia. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { errorText } from "../api/client";
import { forgeApi, type ExpMode, type ExpRow, type ForgeEntry, type ForgeKind, type ForgeMeta } from "../api/forge";
import { useAppData } from "../auth/AppData";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { Tabs } from "../components/Tabs";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { Wizard, nf, type DraftState, type WizardDef } from "../forge/engine";
import { MAGIC_WIZARDS } from "../forge/wizardsMagic";
import { oggetto } from "../forge/wizardsItem";
import { PG_WIZARDS } from "../forge/wizardsPg";
import { WORLD_WIZARDS } from "../forge/wizardsWorld";
import "../styles/forge.css";

export const WIZARDS: WizardDef[] = [...PG_WIZARDS, oggetto, ...WORLD_WIZARDS, ...MAGIC_WIZARDS];
const GROUPS = [
  { key: "Personaggi", text: "Ciò che i giocatori possono diventare e ottenere." },
  { key: "Mondo", text: "Chi e cosa incontrano ad Aethermoor." },
  { key: "Magia", text: "Incantesimi dei maghi e miracoli dei chierici." },
] as const;

export function Forgia() {
  const { refreshChars } = useAppData();
  const [meta, setMeta] = useState<ForgeMeta | null>(null);
  const [lib, setLib] = useState<ForgeEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  // le bozze restano per la sessione del browser: cambiare pagina a metà wizard non le perde
  const [drafts, setDraftsRaw] = useState<Record<string, DraftState & { dirty?: boolean }>>(() => {
    try { return JSON.parse(sessionStorage.getItem("forgia-bozze") || "{}"); } catch { return {}; }
  });
  const setDrafts = useCallback((f: (ds: Record<string, DraftState & { dirty?: boolean }>) => Record<string, DraftState & { dirty?: boolean }>) => {
    setDraftsRaw((ds) => {
      const n = f(ds);
      try { sessionStorage.setItem("forgia-bozze", JSON.stringify(n)); } catch { /* storage pieno o non disponibile */ }
      return n;
    });
  }, []);
  const [libKind, setLibKind] = useState<ForgeKind | "all">("all");
  const topRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();

  const reload = useCallback(() => Promise.all([forgeApi.meta(), forgeApi.library()]).then(([m, l]) => { setMeta(m); setLib(l); }), []);
  useEffect(() => {
    setError(null);
    reload().catch((e) => setError(errorText(e)));
  }, [nonce, reload]);

  // ?w=<wizard> (dalla Plancia di comando: «Crea al volo») apre subito quel wizard
  const wanted = params.get("w");
  useEffect(() => {
    if (!meta || !wanted) return;
    const def = WIZARDS.find((x) => x.id === wanted);
    if (def) {
      setDrafts((ds) => (ds[def.id] ? ds : { ...ds, [def.id]: { d: def.fresh(meta), step: 0 } }));
      setActive(def.id);
    }
    setParams({}, { replace: true });
  }, [meta, wanted, setParams]);

  if (error) return <ErrorBox title="Forgia del Master" message={error} action={<button type="button" className="btn" onClick={() => setNonce((x) => x + 1)}>Riprova</button>} />;
  if (!meta || !lib) return <Loading text="Accensione della Forgia…" />;

  const w = active ? WIZARDS.find((x) => x.id === active) : null;
  function open(id: string) {
    const def = WIZARDS.find((x) => x.id === id)!;
    if (!drafts[id]) setDrafts((ds) => ({ ...ds, [id]: { d: def.fresh(meta!), step: 0 } }));
    setActive(id);
    window.scrollTo({ top: 0 });
  }
  function back() {
    setActive(null);
    requestAnimationFrame(() => topRef.current?.querySelector<HTMLButtonElement>(`[data-open="${w?.id}"]`)?.focus());
  }

  if (w) {
    const state = drafts[w.id] ?? { d: w.fresh(meta), step: 0 };
    return (
      <div className="stack fg-root">
        <button type="button" className="btn ghost fg-back" onClick={back}>← Torna alla Forgia</button>
        <Wizard key={w.id} def={w} meta={meta} state={state}
          setState={(s) => setDrafts((ds) => ({ ...ds, [w.id]: { ...s, dirty: true } }))}
          onCancel={() => {
            if (drafts[w.id]?.dirty && !window.confirm(`Scarto la bozza di «${w.title}»? Quello che hai scritto si perde.`)) return;
            setDrafts((ds) => { const n = { ...ds }; delete n[w.id]; return n; });
            setActive(null);
          }}
          onSaved={(e) => {
            if (!e) return;
            setDrafts((ds) => { const n = { ...ds }; delete n[w.id]; return n; });
            setLibKind(e.kind);
            setActive(null);
            reload().catch((err) => setError(errorText(err)));
            if (e.assigned_to) refreshChars();
            window.scrollTo({ top: 0 });
          }} />
      </div>
    );
  }

  const counts = (k: ForgeKind) => lib.filter((e) => e.kind === k).length;
  return (
    <div className="stack fg-root" ref={topRef}>
      <Win title="Forgia del Master" gold>
        <p className="muted">Wizard guidati per creare contenuti di gioco. Ogni wizard applica le regole di STATISFY (calcolate dal server) e mostra un'anteprima nel formato del System prima di salvare.</p>
        <div className="fg-groups">
          {GROUPS.map((g) => (
            <section key={g.key} className="stack">
              <div><h3>{g.key}</h3><p className="small muted">{g.text}</p></div>
              <div className="fg-cards">
                {WIZARDS.filter((x) => x.group === g.key).map((x) => (
                  <button key={x.id} type="button" className="fg-card" data-open={x.id} onClick={() => open(x.id)}>
                    <span className="label">{meta.kinds.find((k) => k.key === x.kind)?.label}</span>
                    <h3>{x.title}{drafts[x.id]?.dirty && <span className="chip warn fg-draft" title="Bozza non salvata: riprendi da dove eri">bozza</span>}</h3>
                    <span className="small muted">{x.desc}</span>
                    <span className="fg-count xs muted">{counts(x.kind)} nella libreria</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Win>
      <Library meta={meta} lib={lib} setLib={setLib} kind={libKind} setKind={setLibKind} onChars={refreshChars} />
    </div>
  );
}

function Library({ meta, lib, setLib, kind, setKind, onChars }: {
  meta: ForgeMeta; lib: ForgeEntry[]; setLib: (l: ForgeEntry[]) => void; kind: ForgeKind | "all"; setKind: (k: ForgeKind | "all") => void; onChars: () => void;
}) {
  const toast = useToast();
  const [closing, setClosing] = useState<ForgeEntry | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Un elemento è uno solo: «Titolo», non «Titoli» (le schede e i filtri restano al plurale)
  const label = (k: ForgeKind) => WIZARDS.find((w) => w.kind === k)?.title ?? meta.kinds.find((x) => x.key === k)?.label ?? k;
  const rows = lib.filter((e) => kind === "all" || e.kind === kind).slice().reverse();
  const tabs = [{ key: "all" as const, label: "Tutto", count: lib.length }, ...meta.kinds.map((k) => ({ key: k.key, label: k.label, count: lib.filter((e) => e.kind === k.key).length }))];

  async function remove(e: ForgeEntry) {
    if (!window.confirm(`Togliere «${e.name}» dalla libreria? Le assegnazioni già fatte ai PG restano.`)) return;
    setErr(null);
    try {
      await forgeApi.remove(e.id);
      setLib(lib.filter((x) => x.id !== e.id));
      toast("FORGIA", [`«${e.name}» tolto dalla libreria.`]);
    } catch (ex) {
      setErr(errorText(ex));
    }
  }

  return (
    <Win title="Libreria della campagna" right={<span className="chip muted">{lib.length}</span>}>
      <Tabs tabs={tabs} active={kind} onChange={setKind} label="Filtra libreria">
        <InlineError message={err} />
        {rows.length ? (
          <ul className="fg-lib">
            {rows.map((e) => (
              <li key={e.id} className="fg-lib-row">
                <div className="fg-lib-main">
                  <span className="fg-lib-name">{e.name}</span>
                  <span className="chip violet">{label(e.kind)}</span>
                  {e.assigned_name && <span className="chip gold" title="Assegnato a questo PG al salvataggio">{e.assigned_name}</span>}
                </div>
                <p className="small muted fg-lib-sum">{e.summary}</p>
                <div className="fg-lib-act">
                  {e.kind === "encounters" && (e.closed
                    ? <span className="chip good" tabIndex={0} title={e.closed.text}>Chiuso · EXP {e.closed.mode}</span>
                    : <button type="button" className="btn" onClick={() => setClosing(e)}>Chiudi incontro</button>)}
                  <button type="button" className="btn ghost icon" aria-label={`Togli ${e.name} dalla libreria`} title="Togli dalla libreria" onClick={() => remove(e)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="fg-lib-empty small muted">Ancora niente qui. Apri un wizard qui sopra: ciò che crei compare in questa libreria.</p>}
      </Tabs>
      {closing && <CloseEncounter entry={closing} onDone={(updated, msgs) => {
        setClosing(null);
        if (updated) {
          setLib(lib.map((x) => (x.id === updated.id ? updated : x)));
          toast("SISTEMA", msgs, { gold: true });
          onChars();
        }
      }} />}
    </Win>
  );
}

/* Chiusura di un incontro (deciso il 20/11/2026): pop-up con EXP intera o divisa tra i PG che partecipano e level up. */
export function CloseEncounter({ entry, onDone }: { entry: ForgeEntry; onDone: (e: ForgeEntry | null, msgs: string[]) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<ExpMode>("intera");
  const [rows, setRows] = useState<ExpRow[] | null>(null);
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    let alive = true;
    setRows(null);
    forgeApi.encounterExp(entry.id, mode)
      .then((r) => { if (alive) { setRows(r.rows); setN(r.party); } })
      .catch((e) => { if (alive) setErr(errorText(e)); });
    return () => { alive = false; };
  }, [entry.id, mode]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const r = await forgeApi.closeEncounter(entry.id, mode);
      ref.current?.close();
      onDone(r.entry, r.messages);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }
  const cancel = () => { ref.current?.close(); onDone(null, []); };
  const diff = (entry.data.difficulty ?? {}) as { label?: string };

  return (
    <dialog ref={ref} className="fg-dlg" aria-labelledby="fg-dlg-t" onCancel={(e) => { e.preventDefault(); cancel(); }}>
      <div className="stack">
        <h2 id="fg-dlg-t" className="fg-dlg-t">Chiudi «{entry.name}»</h2>
        <p className="small muted">{entry.data.place} · difficoltà {diff.label ?? "—"}</p>
        <fieldset className="fg-dlg-modes">
          <legend className="label">Come si assegna l'EXP</legend>
          <label className="fg-dlg-opt"><input type="radio" name="fg-mode" value="intera" checked={mode === "intera"} onChange={() => setMode("intera")} />
            <span><b>Intera</b><br /><span className="xs muted">Ogni PG prende tutta l'EXP dell'incontro, calcolata sul suo livello.</span></span></label>
          <label className="fg-dlg-opt"><input type="radio" name="fg-mode" value="divisa" checked={mode === "divisa"} onChange={() => setMode("divisa")} />
            <span><b>Divisa nel gruppo</b><br /><span className="xs muted">Ognuno prende la sua parte: EXP ÷ {n || "?"} PG.</span></span></label>
        </fieldset>
        {!rows ? <Loading text="Calcolo dell'EXP…" /> : rows.length ? (
          <table className="t fg-dlg-t2">
            <thead><tr><th>PG</th><th className="num">EXP</th><th>Dopo</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name} <span className="xs muted">Lv {r.level}</span></td>
                <td className="num" title={mode === "divisa" ? `${nf(r.full)}% ÷ ${n} PG` : `${nf(r.full)}% sul livello ${r.level}`}>+{nf(r.pct)}%</td>
                <td className="small">{r.ups ? <><span className="chip gold">Level up! Lv {r.after_level}</span> {nf(r.after_exp)}%</> : `${nf(r.after_exp)}%`}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="small muted">Nessun PG dell'incontro esiste ancora.</p>}
        <p className="xs muted">EXP = 2% a pari livello, ±1 punto per livello di differenza (0–10%), dal lv 10 metà e dal 50 un quarto, × grado³ della rarità. Il level up dà +1 a ogni statistica e 10 punti liberi.</p>
        <InlineError message={err} />
        <div className="row fg-dlg-foot">
          <button type="button" className="btn ghost" onClick={cancel}>Annulla</button>
          <button type="button" className="btn primary" disabled={busy || !rows} onClick={confirm}>Chiudi e assegna EXP</button>
        </div>
      </div>
    </dialog>
  );
}
