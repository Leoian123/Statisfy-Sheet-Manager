/* Richieste al Master: i giocatori propongono funzioni e contenuti o fanno domande sul regolamento; il Master le smista.
   Stessa pagina per i due ruoli. PC: elenco a sinistra e dettaglio a destra; telefono (≤ 760px): uno alla volta.
   Tutto il testo degli utenti (titolo, testo, messaggi, risposta) è reso come testo semplice (pre-wrap), mai come HTML. */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, errorText } from "../api/client";
import {
  KIND_LABELS, STATUS_LABELS, TICKET_LIMITS, incantoMeta, ticketsApi,
  type PlayerTicketKind, type Ticket, type TicketList, type TicketPatch, type TicketStatus,
} from "../api/tickets";
import { EvolutionForm } from "../components/EvolutionForm";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { InlineError, Loading, SysMsg } from "../components/Status";
import { Tabs } from "../components/Tabs";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import {
  BUCKET_EMPTY, BUCKET_LABELS, KIND_GROUPS, KIND_HINTS, KIND_ORDER, KIND_SHORT, STATUS_TONE, ageText, archiveText,
  bucketOf, canEdit, canReviseIncanto, canWithdraw, countBuckets, dayText, isClosed, isFormKind, isUnread, masterMoves, newTicketError, pruneSeen, sortTickets,
  type Bucket, type Move,
} from "../lib/richieste";
import { usePolling } from "../lib/usePolling";
import "../styles/richieste.css";

type Scope = "attive" | "archivio";
type View = Bucket | "archivio";
type Role = "master" | "giocatore";
const POLL_MS = 20000;
const LIST_LIMIT = 200;
const SEEN_KEY = "statisfy-rq-seen";

function loadSeen(): Record<string, string> {
  try { return pruneSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || "{}")); } catch { return {}; }
}
function saveSeen(s: Record<string, string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(pruneSeen(s))); } catch { /* storage non disponibile */ }
}
const fullDate = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString("it-IT") : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

function StatusChip({ s }: { s: TicketStatus }) {
  return <span className={`chip ${STATUS_TONE[s]}`}>{STATUS_LABELS[s]}</span>;
}

export function Richieste() {
  const { user } = useAuth();
  const role: Role = user?.role === "master" ? "master" : "giocatore";
  const master = role === "master";
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const selId = Number(params.get("t")) || null;

  const [view, setView] = useState<View>("todo");
  const scope: Scope = view === "archivio" ? "archivio" : "attive";
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<TicketList | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<Ticket | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>(loadSeen);
  const [rotating, setRotating] = useState(false);
  const reqNo = useRef(0);
  const selRef = useRef(selId);
  selRef.current = selId;
  const rootRef = useRef<HTMLDivElement>(null);

  // ricerca in archivio: aspetta che si smetta di scrivere
  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const loadList = useCallback(async () => {
    const n = ++reqNo.current;
    try {
      const res = await ticketsApi.list({ scope, limit: LIST_LIMIT, q: scope === "archivio" && q ? q : undefined });
      if (n !== reqNo.current) return; // risposta superata da una più recente
      setList(res);
      setListErr(null);
    } catch (e) {
      if (n === reqNo.current) setListErr(errorText(e));
    }
  }, [scope, q]);

  usePolling(loadList, POLL_MS, [loadList]);

  const markSeen = useCallback((t: Ticket) => {
    if (!master) return;
    setSeen((s) => {
      if (s[String(t.id)] === t.updated_at) return s;
      const next = { ...s, [String(t.id)]: t.updated_at };
      saveSeen(next);
      return next;
    });
  }, [master]);

  /** Nuova versione della richiesta (azione, ricarica): aggiorna dettaglio e riga dell'elenco. */
  const applyTicket = useCallback((t: Ticket) => {
    setDetail((d) => (d ? (d.id === t.id ? t : d) : selRef.current === t.id ? t : null));
    setList((l) => (l ? { ...l, items: l.items.map((x) => (x.id === t.id ? t : x)) } : l));
    markSeen(t);
  }, [markSeen]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const t = await ticketsApi.get(id); // per l'autore la segna come letta
      if (selRef.current !== id) return; // nel frattempo se n'è aperta un'altra
      setDetailErr(null);
      applyTicket(t);
    } catch (e) {
      if (selRef.current === id) setDetailErr(errorText(e));
    }
  }, [applyTicket]);

  // apertura di una richiesta
  useEffect(() => {
    setDetailErr(null);
    if (selId == null) { setDetail(null); return; }
    setDetail((d) => (d?.id === selId ? d : null));
    loadDetail(selId);
  }, [selId, loadDetail]);

  // l'elenco (polling) dice che la richiesta aperta è cambiata altrove: la ricarica
  const listedVersion = list?.items.find((x) => x.id === selId)?.version;
  useEffect(() => {
    if (selId != null && detail?.id === selId && listedVersion != null && listedVersion !== detail.version) loadDetail(selId);
  }, [listedVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // telefono: aprire o chiudere il dettaglio riporta in cima
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 760px)").matches) rootRef.current?.scrollIntoView({ block: "start" });
  }, [selId]);

  function open(id: number) {
    const next = new URLSearchParams(params);
    next.set("t", String(id));
    setParams(next);
  }
  function close() {
    const next = new URLSearchParams(params);
    next.delete("t");
    setParams(next);
  }
  function changeView(v: View) {
    if ((v === "archivio") !== (view === "archivio")) setList(null);
    setView(v);
    if (selId != null) close();
  }

  async function rotate() {
    setRotating(true);
    try {
      const r = await ticketsApi.rotate();
      toast("RICHIESTE", [r.archived ? `${r.archived === 1 ? "1 richiesta chiusa archiviata" : `${r.archived} richieste chiuse archiviate`}.` : "Nessuna richiesta da archiviare.",
        `Si archiviano le chiuse da almeno ${r.archive_days} giorni.`]);
      await loadList();
    } catch (e) {
      toast("RICHIESTE", [errorText(e)], { bad: true });
    } finally { setRotating(false); }
  }

  function created(t: Ticket) {
    setList((l) => (l ? { ...l, items: [t, ...l.items], counts: { ...l.counts, aperta: l.counts.aperta + 1 } } : l));
    setView("waiting");
    open(t.id);
    loadList();
  }

  // Coda di lavoro: compiti (da fare, in attesa, chiuse) e gruppi di tipi; l'archivio a parte
  const all = list?.items ?? [];
  const buckets = useMemo(() => countBuckets(scope === "attive" ? all : [], role), [all, scope, role]);
  const inView = scope === "archivio" ? all : all.filter((t) => bucketOf(t, role) === view);
  const groups = KIND_GROUPS.filter((g) => inView.some((t) => g.kinds.includes(t.kind)));
  const activeGroup = groups.find((g) => g.key === group) ?? null;
  const items = useMemo(() => sortTickets(activeGroup ? inView.filter((t) => activeGroup.kinds.includes(t.kind)) : inView, role, seen),
    [inView, activeGroup, role, seen]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = list?.counts;
  const archiveDays = list?.archive_days;
  const L = BUCKET_LABELS[role];

  const viewHint = view === "todo" ? (master ? "Tocca a te: rispondi o risolvi." : "Il Master ti ha scritto: leggi e rispondi.")
    : view === "waiting" ? (master ? "Hai risposto: si aspetta il giocatore." : "Hai scritto: si aspetta il Master.") : null;
  const chips = groups.length > 1 && (
    <div className="rq-filters" role="group" aria-label="Filtra per tipo">
      <button type="button" className="rq-fbtn" aria-pressed={!activeGroup} onClick={() => setGroup("")}>Tutte <span className="num">{inView.length}</span></button>
      {groups.map((g) => (
        <button key={g.key} type="button" className="rq-fbtn" aria-pressed={activeGroup?.key === g.key} onClick={() => setGroup(activeGroup?.key === g.key ? "" : g.key)}>
          {g.label} <span className="num">{inView.filter((t) => g.kinds.includes(t.kind)).length}</span>
        </button>
      ))}
    </div>
  );
  const toolbar = scope === "archivio" ? (
    <div className="stack rq-tools-m">
      <div className="field rq-search">
        <label className="label" htmlFor="rq-q">Cerca in archivio</label>
        <input className="input" id="rq-q" type="search" autoComplete="off" maxLength={100} placeholder="Titolo, testo o decisione"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {chips}
    </div>
  ) : (
    <div className="stack rq-tools-m">
      {viewHint && <p className="xs muted rq-sum">{viewHint}</p>}
      {chips}
      {master && view === "closed" && (
        <div className="rq-rotate">
          <button type="button" className="btn ghost" disabled={rotating} onClick={rotate}>Archivia le chiuse scadute</button>
          {archiveDays != null && <span className="hint">Vanno in archivio da sole dopo {archiveDays} {archiveDays === 1 ? "giorno" : "giorni"}.</span>}
        </div>
      )}
    </div>
  );

  const emptyText = scope === "archivio"
    ? (q ? `Nessuna richiesta in archivio contiene "${q}".` : "L'archivio è vuoto.")
    : activeGroup ? "Nessuna richiesta di questo tipo qui." : BUCKET_EMPTY[role][view as Bucket];

  return (
    <div className="rq-root" ref={rootRef}>
      <div className={`rq-split${selId != null ? " has-sel" : ""}`}>
        <div className="rq-listcol">
          {!master && <NewTicket startOpen={list != null && list.items.length === 0 && !list.counts.archivio} onCreated={created} />}
          <Win title={master ? "Coda delle richieste" : "Le tue richieste"}>
            <Tabs<View> label="Richieste" active={view} onChange={changeView}
              tabs={[
                { key: "todo", label: L.todo, count: scope === "attive" && list ? buckets.todo : undefined },
                { key: "waiting", label: L.waiting, count: scope === "attive" && list ? buckets.waiting : undefined },
                { key: "closed", label: L.closed, count: scope === "attive" && list ? buckets.closed : undefined },
                { key: "archivio", label: "Archivio", count: counts?.archivio },
              ]}>
              <div className="stack rq-panel">
                {toolbar}
                {listErr && <InlineError message={listErr} />}
                {!list ? (!listErr && <Loading text="Caricamento richieste…" />) : !items.length ? <p className="ms-empty">{emptyText}</p> : (
                  <ul className="rq-list">
                    {items.map((t) => <Row key={t.id} t={t} role={role} unread={isUnread(t, role, seen)} selected={t.id === selId} onOpen={open} />)}
                  </ul>
                )}
                {list && list.total > list.items.length && (
                  <p className="footnote">Mostrate {list.items.length} di {list.total}: {scope === "archivio" ? "affina la ricerca." : "chiudi o archivia le più vecchie."}</p>
                )}
              </div>
            </Tabs>
          </Win>
        </div>
        <div className="rq-detailcol">
          {selId == null ? (
            <div className="rq-placeholder ms-empty">
              {master ? "Scegli una richiesta dalla coda: rispondi, risolvila con il suo modulo o chiedi altro al giocatore." : "Scegli una richiesta per leggere la risposta del Master e rispondere."}
            </div>
          ) : detail ? (
            <Detail key={detail.id} t={detail} role={role} onChange={applyTicket} onReload={() => loadDetail(detail.id)} onBack={close}
              onListChanged={loadList} />
          ) : (
            <Win title="Richiesta">
              <button type="button" className="btn ghost rq-back" onClick={close}>← Torna all'elenco</button>
              {detailErr ? <InlineError message={detailErr} /> : <Loading text="Apro la richiesta…" />}
            </Win>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ t, role, unread, selected, onOpen }: { t: Ticket; role: Role; unread: boolean; selected: boolean; onOpen: (id: number) => void }) {
  const tipId = `rq-tip-${t.id}`;
  const done = t.status === "risolta" || t.status === "respinta";
  const who = role === "master" ? (t.kind === "comunicazione" ? `a ${t.recipient_name ?? "giocatore"}` : t.kind === "evoluzione" ? null : t.author_name) : null;
  const meta = [KIND_SHORT[t.kind], who, t.char_name, ageText(t.updated_at)].filter(Boolean).join(" · ");
  const msgs = t.messages.length;
  const arch = archiveText(t.archive_at);
  return (
    <li className="rq-li">
      <button type="button" className={`rq-row${unread ? " is-unread" : ""}${done ? " is-done" : ""}`} aria-pressed={selected}
        aria-describedby={tipId} onClick={() => onOpen(t.id)}>
        <span className="rq-dot" aria-hidden="true" />
        <span className="rq-row-main">
          <span className="rq-row-title">{unread && <span className="rq-sr">Da leggere: </span>}{t.title}</span>
          <span className="rq-row-meta xs muted">{meta}{msgs > 0 && <> · {msgs} msg</>}</span>
        </span>
        <StatusChip s={t.status} />
      </button>
      <div className="rq-tip" role="tooltip" id={tipId}>
        <span className="label">{KIND_LABELS[t.kind]}</span>
        <span className="rq-pre">{clip(t.body, 280)}</span>
        {t.answer && <span className="rq-pre rq-tip-ans"><b>{isClosed(t.status) ? "Decisione:" : "Risposta:"}</b> {clip(t.answer, 160)}</span>}
        {(arch || t.archived_at) && <span className="muted">{t.archived_at ? `In archivio dal ${dayText(t.archived_at)}` : arch}</span>}
      </div>
    </li>
  );
}

function NewTicket({ startOpen, onCreated }: { startOpen: boolean; onCreated: (t: Ticket) => void }) {
  const { user } = useAuth();
  const { chars } = useAppData();
  const toast = useToast();
  const [openForm, setOpenForm] = useState(false);
  const [kind, setKind] = useState<PlayerTicketKind>("funzione");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [charId, setCharId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shown = openForm || startOpen;
  const mine = (chars ?? []).filter((c) => user?.role === "master" || c.owner_id === user?.id);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const bad = newTicketError(title, body, TICKET_LIMITS);
    if (bad) { setErr(bad); return; }
    setBusy(true); setErr(null);
    try {
      const t = await ticketsApi.create({ kind, title: title.trim(), body, char_id: charId ? Number(charId) : null });
      toast("RICHIESTE", ["Richiesta inviata al Master.", "Ti avviso qui quando risponde."], { gold: true });
      setTitle(""); setBody(""); setCharId(""); setOpenForm(false);
      onCreated(t);
    } catch (ex) {
      setErr(errorText(ex));
    } finally { setBusy(false); }
  }

  const spellBtn = (
    <Link className="btn rq-new-open" to="/richieste/incanto" title="Componi un incantesimo o un miracolo con il wizard e mandalo al Master">
      ✦ Richiedi un incantesimo
    </Link>
  );
  if (!shown) {
    return (
      <div className="rq-new-btns">
        <button type="button" className="btn primary rq-new-open" onClick={() => setOpenForm(true)}>+ Nuova richiesta</button>
        {spellBtn}
      </div>
    );
  }
  return (
    <>
    <div className="rq-new-btns">{spellBtn}</div>
    <Win title="Nuova richiesta" gold>
      <form className="stack rq-new" onSubmit={submit}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="seg rq-kinds" role="group" aria-label="Tipo di richiesta">
            {KIND_ORDER.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_SHORT[k]}</button>
            ))}
          </div>
          <span className="hint" aria-live="polite">{KIND_HINTS[kind]}</span>
        </div>
        <div className="field">
          <label className="label" htmlFor="rq-new-title">Titolo</label>
          <input className="input" id="rq-new-title" autoComplete="off" maxLength={TICKET_LIMITS.title} value={title}
            placeholder={kind === "regola" ? "Es. Il critico raddoppia anche i bonus?" : kind === "contenuto" ? "Es. Una spada leggendaria del Nord" : "Es. Ordinare l'inventario per peso"}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="label" htmlFor="rq-new-body">Testo</label>
          <textarea className="input" id="rq-new-body" rows={3} maxLength={TICKET_LIMITS.body} value={body}
            placeholder={kind === "regola" ? "Cita la pagina o la situazione di gioco." : "Descrivi l'idea: cosa, perché, un esempio."}
            onChange={(e) => setBody(e.target.value)} />
          {body.length > TICKET_LIMITS.body * 0.9 && <span className="hint">{TICKET_LIMITS.body - body.length} caratteri rimasti</span>}
        </div>
        {mine.length > 0 && (
          <div className="field">
            <label className="label" htmlFor="rq-new-char">Personaggio (facoltativo)</label>
            <select className="input" id="rq-new-char" value={charId} onChange={(e) => setCharId(e.target.value)}>
              <option value="">Nessuno</option>
              {mine.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <InlineError message={err} />
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy}>Invia al Master</button>
          {!startOpen && <button type="button" className="btn ghost" onClick={() => { setOpenForm(false); setErr(null); }}>Chiudi</button>}
        </div>
      </form>
    </Win>
    </>
  );
}

interface DetailProps {
  t: Ticket;
  role: Role;
  onChange: (t: Ticket) => void;
  onReload: () => void;
  onBack: () => void;
  onListChanged: () => void;
}

function Detail({ t, role, onChange, onReload, onBack, onListChanged }: DetailProps) {
  const master = role === "master";
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState(t.title);
  const [eBody, setEBody] = useState(t.body);
  const [reply, setReply] = useState("");
  const [ans, setAns] = useState(t.answer);
  const ansBase = useRef(t.answer);
  const ansRef = useRef<HTMLTextAreaElement>(null);
  const [promote, setPromote] = useState(true);
  const [ask, setAsk] = useState<null | "ritira" | "archivia">(null);

  // la risposta cambia sul server: aggiorna la bozza solo se non la si stava modificando
  useEffect(() => {
    setAns((a) => (a === ansBase.current ? t.answer : a));
    ansBase.current = t.answer;
  }, [t.answer]);
  // lo stato cambia: annulla le conferme in sospeso e la modifica non più permessa
  useEffect(() => {
    setAsk(null);
    if (!canEdit(t)) setEditing(false);
  }, [t.status, t.archived_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const archived = !!t.archived_at;
  const closed = isClosed(t.status);
  const decided = t.status === "risolta" || t.status === "respinta";
  const arch = archiveText(t.archive_at);

  async function act(fn: () => Promise<Ticket>, ok?: string[]): Promise<boolean> {
    setBusy(true); setErr(null);
    try {
      const res = await fn();
      onChange(res);
      onListChanged();
      if (ok) toast("RICHIESTE", ok);
      return true;
    } catch (e) {
      const msg = errorText(e);
      setErr(msg);
      if (e instanceof ApiError && e.status === 409) {
        toast("RICHIESTE", [msg, "Ho ricaricato la richiesta: controlla e riprova."], { bad: true });
        onReload();
        onListChanged();
      }
      return false;
    } finally { setBusy(false); }
  }

  function move(m: Move) {
    const a = ans.trim();
    if (m.needsAnswer && !a) {
      setErr("Scrivi la risposta o la decisione prima di chiudere la richiesta.");
      ansRef.current?.focus();
      return;
    }
    const patch: TicketPatch = { version: t.version, status: m.to };
    if (a !== t.answer) patch.answer = a;
    const promoting = m.to === "risolta" && t.kind === "regola" && promote && t.issue_id == null;
    if (promoting) patch.promote_issue = true;
    act(() => ticketsApi.update(t.id, patch), [`«${clip(t.title, 60)}»: ${STATUS_LABELS[m.to].toLowerCase()}.`,
      ...(promoting ? ["Aggiunta alle Questioni sulle regole."] : [])]);
  }

  async function saveAnswer() {
    await act(() => ticketsApi.update(t.id, { version: t.version, answer: ans.trim() }), ["Risposta salvata."]);
  }
  async function saveEdit() {
    const bad = newTicketError(eTitle, eBody, TICKET_LIMITS);
    if (bad) { setErr(bad); return; }
    if (await act(() => ticketsApi.update(t.id, { version: t.version, title: eTitle.trim(), body: eBody }), ["Richiesta aggiornata."])) setEditing(false);
  }
  async function send() {
    const text = reply.trim();
    if (!text) return;
    if (await act(() => ticketsApi.message(t.id, text))) setReply("");
  }
  function onReplyKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); }
  }

  return (
    <Win className={`rq-detail${decided ? " is-done" : ""}`} title={`Richiesta #${t.id}`} right={<StatusChip s={t.status} />}>
      <button type="button" className="btn ghost rq-back" onClick={onBack}>← Torna all'elenco</button>
      <div className="stack rq-d">
        {editing ? (
          <div className="stack">
            <div className="field">
              <label className="label" htmlFor="rq-e-title">Titolo</label>
              <input className="input" id="rq-e-title" maxLength={TICKET_LIMITS.title} value={eTitle} onChange={(e) => setETitle(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="rq-e-body">Testo</label>
              <textarea className="input" id="rq-e-body" rows={5} maxLength={TICKET_LIMITS.body} value={eBody} onChange={(e) => setEBody(e.target.value)} />
            </div>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={saveEdit}>Salva</button>
              <button type="button" className="btn ghost" onClick={() => { setEditing(false); setETitle(t.title); setEBody(t.body); setErr(null); }}>Annulla</button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="rq-d-title">{t.title}</h2>
            <div className="row rq-d-chips">
              <span className="chip violet" title={KIND_HINTS[t.kind]}>{KIND_LABELS[t.kind]}</span>
              {t.char_name && <span className="chip muted">{t.char_name}</span>}
              {t.issue_id != null && (master
                ? <Link className="chip good rq-chiplink" to="/master">Nelle Questioni sulle regole</Link>
                : <span className="chip good">Nelle Questioni sulle regole</span>)}
            </div>
            <p className="xs muted">
              {master || !t.mine ? <>Da <b className="rq-fg">{t.author_name}</b> · </> : null}
              <span title={fullDate(t.created_at)}>scritta {ageText(t.created_at)}</span>
              {t.updated_at !== t.created_at && <> · <span title={fullDate(t.updated_at)}>aggiornata {ageText(t.updated_at)}</span></>}
              {arch && <> · <span className="rq-arch" title={fullDate(t.archive_at)}>{arch}</span></>}
              {t.archived_at && <> · <span title={fullDate(t.archived_at)}>in archivio dal {dayText(t.archived_at)}</span></>}
            </p>
            {incantoMeta(t) ? <IncantoBox t={t} master={master} /> : <p className="rq-pre rq-body">{t.body}</p>}
            {canEdit(t) && (
              <div className="row">
                <button type="button" className="cr-linkbtn small rq-link" onClick={() => { setETitle(t.title); setEBody(t.body); setEditing(true); setErr(null); }}>
                  Modifica titolo e testo
                </button>
                <span className="hint">Possibile finché il Master non la prende in esame.</span>
              </div>
            )}
          </>
        )}

        {t.answer && (
          <div className={`rq-decision rq-dec-${decided ? STATUS_TONE[t.status] : "violet"}`}>
            <b>{decided ? "Decisione:" : "Risposta del Master:"}</b> <span className="rq-pre">{t.answer}</span>
          </div>
        )}
        {!t.answer && !master && !closed && <p className="small muted">Il Master non ha ancora risposto.</p>}

        {archived && <SysMsg lines={["In archivio: solo lettura."]} />}

        {master && !archived && t.kind === "evoluzione" && t.meta && (t.status === "aperta" || t.status === "in_esame") && (
          <EvolutionForm t={t} busy={busy} onDone={(x) => { onChange(x); onListChanged(); toast("RICHIESTE", ["Evoluzione definita: passiva aggiunta e nuovo ciclo."], { gold: true }); onReload(); }}
            onError={(m) => setErr(m)} />
        )}

        {master && !archived && (
          <div className="stack rq-master">
            <div className="field">
              <label className="label" htmlFor="rq-ans">Risposta o decisione</label>
              <textarea ref={ansRef} className="input" id="rq-ans" rows={3} maxLength={TICKET_LIMITS.body} value={ans}
                placeholder={t.kind === "regola" ? "La regola è…" : "Cosa hai deciso e perché"} onChange={(e) => setAns(e.target.value)} />
              <span className="hint">{t.kind === "incanto" ? "Obbligatoria per respingere; per approvare usa «Rivedi e approva»." : "Obbligatoria per risolvere o respingere: il giocatore la legge come decisione."}</span>
            </div>
            {t.kind === "regola" && t.issue_id == null && (t.status === "aperta" || t.status === "in_esame") && (
              <label className="ms-check rq-check" htmlFor="rq-promote">
                <input type="checkbox" id="rq-promote" checked={promote} onChange={(e) => setPromote(e.target.checked)} />
                Aggiungi alle Questioni sulle regole quando la risolvi
              </label>
            )}
            <div className="row rq-actions">
              {masterMoves(t.status).filter((m) => !(isFormKind(t.kind) && m.to === "risolta") && !(t.kind === "comunicazione" && m.to !== "respinta")).map((m) => (
                <button key={m.to + m.label} type="button" disabled={busy} className={`btn${m.primary ? " primary" : ""}${m.danger ? " danger" : ""}`} onClick={() => move(m)}>
                  {m.label}
                </button>
              ))}
              {ans.trim() !== t.answer && (
                <button type="button" className="btn ghost" disabled={busy} onClick={saveAnswer}>Salva risposta</button>
              )}
              {t.kind === "regola" && t.status === "risolta" && t.issue_id == null && (
                <button type="button" className="btn" disabled={busy}
                  onClick={() => act(() => ticketsApi.update(t.id, { version: t.version, promote_issue: true }), ["Aggiunta alle Questioni sulle regole."])}>
                  Aggiungi alle Questioni sulle regole
                </button>
              )}
              {closed && ask !== "archivia" && <button type="button" className="btn ghost" disabled={busy} onClick={() => setAsk("archivia")}>Archivia ora</button>}
            </div>
            {ask === "archivia" && (
              <div className="rq-confirm" role="group" aria-label="Conferma archiviazione">
                <span className="small">In archivio non si potrà più modificare né rispondere.</span>
                <div className="row">
                  <button type="button" className="btn primary" disabled={busy}
                    onClick={() => act(() => ticketsApi.archive(t.id), ["Richiesta archiviata."])}>Archivia</button>
                  <button type="button" className="btn ghost" onClick={() => setAsk(null)}>Annulla</button>
                </div>
              </div>
            )}
          </div>
        )}

        {!master && canWithdraw(t) && (
          ask === "ritira" ? (
            <div className="rq-confirm" role="group" aria-label="Conferma ritiro">
              <span className="small">Ritirarla? Il Master non dovrà più occuparsene.</span>
              <div className="row">
                <button type="button" className="btn danger" disabled={busy}
                  onClick={() => act(() => ticketsApi.update(t.id, { version: t.version, status: "ritirata" }), ["Richiesta ritirata."])}>Sì, ritira</button>
                <button type="button" className="btn ghost" onClick={() => setAsk(null)}>No</button>
              </div>
            </div>
          ) : (
            <div className="row"><button type="button" className="btn ghost danger" disabled={busy} onClick={() => setAsk("ritira")}>Ritira</button></div>
          )
        )}

        <InlineError message={err} />

        <div className="stack rq-thread-wrap">
          <span className="label" id="rq-msgs">Messaggi {t.messages.length > 0 && <span className="num">· {t.messages.length}</span>}</span>
          {t.messages.length ? (
            <ol className="rq-thread" aria-labelledby="rq-msgs">
              {t.messages.map((m, i) => (
                <li key={`${m.at}-${i}`} className={`rq-msg${m.role === "master" ? " is-master" : ""}`}>
                  <span className="xs rq-msg-h">
                    <b>{m.by_name}</b>{m.role === "master" && <span className="chip gold">Master</span>}
                    <span className="muted" title={fullDate(m.at)}>{ageText(m.at)}</span>
                  </span>
                  <span className="rq-pre small">{m.text}</span>
                </li>
              ))}
            </ol>
          ) : <p className="small muted">{archived ? "Nessun messaggio." : "Nessun messaggio: scrivi qui sotto per chiarire o aggiungere dettagli."}</p>}
          {!archived && (
            <div className="field rq-reply">
              <label className="rq-sr" htmlFor="rq-reply">Rispondi</label>
              <textarea className="input" id="rq-reply" rows={2} maxLength={TICKET_LIMITS.message} value={reply}
                placeholder={master ? "Scrivi al giocatore…" : t.kind === "comunicazione" ? "Scrivi la tua proposta al Master…" : "Scrivi al Master…"} onChange={(e) => setReply(e.target.value)} onKeyDown={onReplyKey} />
              <div className="row">
                <button type="button" className="btn" disabled={busy || !reply.trim()} onClick={send}>Invia</button>
                <span className="hint">Ctrl+Invio per inviare{reply.length > TICKET_LIMITS.message * 0.9 ? ` · ${TICKET_LIMITS.message - reply.length} caratteri rimasti` : ""}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Win>
  );
}

/** Scheda dell'incantesimo nella richiesta: riepilogo del System, requisiti da valutare e azioni del wizard. */
function IncantoBox({ t, master }: { t: Ticket; master: boolean }) {
  const navigate = useNavigate();
  const m = incantoMeta(t)!;
  const c = m.card;
  const active = (t.status === "aperta" || t.status === "in_esame") && !t.archived_at;
  return (
    <div className="stack rq-spell">
      <div className="sysmsg gold" role="group" aria-label={`Scheda: ${c.name}`}>
        <span className="tag">[{c.type.toUpperCase()}] {c.name}</span>
        <span className="small">{c.summary}</span>
        {c.mech_text && <span className="small"><span className="muted">Meccanica</span> {c.mech_text}</span>}
        <span className="small rq-pre"><span className="muted">Effetto</span> {c.effect}</span>
        {m.note && <span className="small rq-pre"><span className="muted">Note per il Master</span> {m.note}</span>}
      </div>
      {c.issues.length > 0 && (
        <div className="sysmsg bad" role="status">
          <span className="tag">[DA VALUTARE{t.char_name ? ` · ${t.char_name}` : ""}]</span>
          {c.issues.map((x) => <span key={x} className="small">{x}.</span>)}
        </div>
      )}
      {t.status === "risolta" && m.entry_id != null && (
        <p className="hint good">{m.learned ? `Nel grimorio di ${t.char_name ?? "—"}: skill attiva Grado I · 1%.` : "Nella libreria della campagna."}</p>
      )}
      {active && (master ? (
        <div className="row">
          <button type="button" className="btn primary" onClick={() => navigate(`/richieste/incanto?t=${t.id}`)}>Rivedi e approva</button>
          <span className="hint">Apre il wizard completo: puoi ritoccare costo, livello e meccanica prima di approvare.</span>
        </div>
      ) : canReviseIncanto(t) && (
        <div className="row">
          <button type="button" className="btn" onClick={() => navigate(`/richieste/incanto?t=${t.id}`)}>Modifica l'incantesimo</button>
          <span className="hint">Riapre il wizard; la nuova versione torna al Master.</span>
        </div>
      ))}
    </div>
  );
}
