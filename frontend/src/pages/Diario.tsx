/* Diario dell'avventuriero: appunti in stile blog di giocatori e Master, con allegati (tiri, oggetti, titoli, skill,
   talenti, quest) salvati dal server come istantanee.
   - Timeline per sessione ("Sessione 15"), pagine fissate in cima; "Mostra altre" carica a blocchi di 20.
   - Filtri: testo, Tutto / Le mie / Del gruppo, personaggio, tag.
   - "Nuova pagina": compositore chiuso finché non serve (la bozza resta se lo richiudi); Ctrl+Invio salva.
   - Allegati come chip compatti: il dettaglio è nel tooltip (passaggio, focus o tocco).
   - Modifica in linea con la versione letta: 409 = cambiata altrove, si ricarica e la propria bozza resta copiabile.
   - "Annota nel diario" dal risultato di un tiro apre il compositore con ?char=&roll=.
   Titolo e testo sono testo dell'utente: si mostrano solo come testo (white-space: pre-wrap), mai come HTML. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, errorText } from "../api/client";
import { ATTACH_LABELS, journalApi, type Attachables, type AttachKind, type JournalAttachment, type JournalEntry, type JournalQuery, type JournalVisibility } from "../api/journal";
import type { CharacterSummary } from "../api/types";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { Kv, OgTipHead, TipLayer, useOgTip } from "../components/og";
import { InlineError, Loading, SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { rarityKey } from "../lib/format";
import {
  KIND_ICON, KIND_ONE, KINDS, LIMITS, NEEDS_CHAR, addTags, filterCandidates, fmtWhen, fromSnapshots, groupBySession, isLong,
  mergePage, pickKey, prefillFromQuery, pruneForChar, samePicks, toRefs, togglePick, type Picked,
} from "../lib/diario";
import "../styles/diario.css";

const PAGE = 20;
const CAND_SHOWN = 8;
type Scope = NonNullable<JournalQuery["scope"]>;
const SCOPES: [Scope, string][] = [["tutto", "Tutto"], ["miei", "Le mie"], ["gruppo", "Del gruppo"]];
const VIS_HINT: Record<JournalVisibility, string> = {
  privato: "Privata: la vedi solo tu (nemmeno il Master).",
  gruppo: "Del gruppo: la vedono tutti i giocatori e il Master.",
};

interface Seed { title: string; body: string; tags: string[]; char_id: number | null; visibility: JournalVisibility; pinned: boolean; picked: Picked[] }
const emptySeed = (charId: number | null): Seed => ({ title: "", body: "", tags: [], char_id: charId, visibility: "privato", pinned: false, picked: [] });
const seedOf = (e: JournalEntry): Seed => ({
  title: e.title, body: e.body, tags: e.tags, char_id: e.char_id, visibility: e.visibility, pinned: e.pinned, picked: fromSnapshots(e.attachments),
});

type TipBind = ReturnType<typeof useOgTip<string>>["bind"];

export function Diario() {
  const { user } = useAuth();
  const { chars } = useAppData();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const isMaster = user?.role === "master";
  const ownChars = useMemo(
    () => (chars ?? []).filter((c) => isMaster || c.owner_id === user?.id),
    [chars, isMaster, user?.id],
  );

  // Filtri
  const [scope, setScope] = useState<Scope>("tutto");
  const [charFilter, setCharFilter] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qq, setQq] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setQq(q.trim().slice(0, 100)), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  // Elenco
  const [items, setItems] = useState<JournalEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((x) => x + 1), []);
  const query = useMemo<JournalQuery>(() => ({ scope, char_id: charFilter ?? undefined, tag: tag ?? undefined, q: qq || undefined }), [scope, charFilter, tag, qq]);

  useEffect(() => {
    let alive = true;
    setErr(null);
    journalApi.list({ ...query, limit: PAGE, offset: 0 })
      .then((r) => { if (alive) { setItems(r.items); setTotal(r.total); setAllTags(r.tags); } })
      .catch((e) => { if (alive) { setErr(errorText(e)); setItems((x) => x ?? []); } });
    return () => { alive = false; };
  }, [query, nonce]);

  async function loadMore() {
    if (!items) return;
    setMore(true);
    try {
      const r = await journalApi.list({ ...query, limit: PAGE, offset: items.length });
      setItems((x) => mergePage(x ?? [], r.items));
      setTotal(r.total);
      setAllTags(r.tags);
    } catch (e) {
      toast("DIARIO", [errorText(e)], { bad: true });
    } finally {
      setMore(false);
    }
  }

  const replace = useCallback((e: JournalEntry) => setItems((x) => x?.map((y) => (y.id === e.id ? e : y)) ?? x), []);
  const removed = useCallback((id: number) => {
    setItems((x) => x?.filter((y) => y.id !== id) ?? x);
    setTotal((t) => Math.max(0, t - 1));
  }, []);

  // Compositore "Nuova pagina": resta montato (e con la bozza) anche da chiuso; `seedKey` lo azzera.
  const defaultChar = isMaster ? null : (charFilter != null && ownChars.some((c) => c.id === charFilter) ? charFilter : ownChars[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<Seed | null>(null);
  const [seedKey, setSeedKey] = useState(0);

  // "Annota nel diario": ?char=&roll= apre il compositore con il tiro allegato, poi l'URL si ripulisce.
  useEffect(() => {
    if (!chars || !user) return;
    const { charId, rollId } = prefillFromQuery(params);
    if (charId == null && rollId == null) return;
    const ch = charId != null && ownChars.some((c) => c.id === charId) ? charId : null;
    const s = emptySeed(ch ?? defaultChar);
    if (rollId) s.picked = [{ kind: "roll", ref: rollId, label: `Tiro #${rollId}`, detail: "", rarity: null }];
    setSeed(s);
    setSeedKey((k) => k + 1);
    setOpen(true);
    setParams({}, { replace: true });
  }, [chars, user, params, ownChars, defaultChar, setParams]);

  const { tip, tipId, bind } = useOgTip<string>();
  const tipAtt = useMemo<JournalAttachment | undefined>(() => {
    if (!tip || !items) return undefined;
    const [id, i] = tip.key.split(":").map(Number);
    return items.find((e) => e.id === id)?.attachments[i];
  }, [tip, items]);

  if (!user) return <Loading />;
  const groups = items ? groupBySession(items) : [];
  const filtered = scope !== "tutto" || charFilter != null || tag != null || qq !== "";

  return (
    <div className="dj-root">
      <Win og title="Diario dell'avventuriero">
        <div className="dj-intro">
          <p className="small muted">Appunti della campagna: scrivi cosa è successo e allega tiri, oggetti, titoli, skill, talenti e quest.</p>
          {!open && (
            <button type="button" className="btn primary dj-new" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="dj-composer">
              ＋ Nuova pagina
            </button>
          )}
        </div>
        <div id="dj-composer" hidden={!open}>
          <Composer key={seedKey} seed={seed ?? emptySeed(defaultChar)} chars={ownChars} tagsSuggest={allTags} heading="Nuova pagina"
            onCancel={() => setOpen(false)}
            onSaved={() => {
              toast("DIARIO", ["Pagina salvata."], { gold: true });
              setSeed(null);
              setSeedKey((k) => k + 1);
              setOpen(false);
              reload();
            }} />
        </div>
      </Win>

      <div className="dj-grid">
        <aside className="dj-side" aria-label="Filtri del diario">
          <Win title="Filtri" right={filtered ? (
            <button type="button" className="btn ghost dj-mini" onClick={() => { setScope("tutto"); setCharFilter(null); setTag(null); setQ(""); }}>Azzera</button>
          ) : undefined}>
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100}
              placeholder="Cerca nel diario…" aria-label="Cerca nel diario (titolo, testo, tag, allegati)" />
            <div className="seg dj-seg" role="group" aria-label="Quali pagine">
              {SCOPES.map(([k, l]) => <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>)}
            </div>
            <label className="field">
              <span className="label">Personaggio</span>
              <select className="input" value={charFilter ?? ""} onChange={(e) => setCharFilter(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Tutti</option>
                {(chars ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {allTags.length > 0 && (
              <div className="field">
                <span className="label" id="dj-f-tag">Tag</span>
                <div className="dj-tags" role="group" aria-labelledby="dj-f-tag">
                  {allTags.map((t) => (
                    <button key={t} type="button" className="dj-tag" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
                  ))}
                </div>
              </div>
            )}
          </Win>
        </aside>

        <section className="dj-main" aria-label="Pagine del diario">
          <InlineError message={err} />
          {err && <div className="row"><button type="button" className="btn" onClick={reload}>Riprova</button></div>}
          {items == null ? <Loading text="Si sfogliano le pagine…" /> : items.length === 0 && !err ? (
            <SysMsg lines={[filtered ? "Nessuna pagina con questi filtri." : "Il diario è vuoto: scrivi la prima pagina con «Nuova pagina»."]} />
          ) : (
            <>
              <p className="xs muted dj-count" aria-live="polite">{total === 1 ? "1 pagina" : `${total} pagine`}{filtered ? " trovate" : ""}</p>
              {groups.map((g) => (
                <section key={g.key} className="dj-group" aria-labelledby={`dj-g-${g.key}`}>
                  <h3 className="dj-sess" id={`dj-g-${g.key}`}>
                    <span>{g.key === "pinned" ? "📌 Fissate" : g.title}</span><span className="num xs muted">{g.items.length}</span>
                  </h3>
                  {g.items.map((e) => (
                    <EntryCard key={e.id} e={e} isMaster={isMaster} chars={ownChars} tagsSuggest={allTags} bind={bind}
                      onTag={(t) => setTag(t)} onChanged={replace} onRemoved={removed} onReorder={reload} />
                  ))}
                </section>
              ))}
              {items.length < total && (
                <button type="button" className="btn dj-more" onClick={loadMore} disabled={more}>
                  {more ? "Caricamento…" : `Mostra altre (${total - items.length})`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {tip && tipAtt && (
        <TipLayer id={tipId} anchor={tip.el} border={tipAtt.rarity ? `var(--r-${rarityKey(tipAtt.rarity)})` : undefined}>
          <AttachTip a={tipAtt} />
        </TipLayer>
      )}
    </div>
  );
}

function AttachTip({ a }: { a: JournalAttachment }) {
  return (
    <>
      <OgTipHead name={a.label} rarity={a.rarity ? rarityKey(a.rarity) : undefined} />
      <Kv k="Tipo">{KIND_ONE[a.kind]}</Kv>
      {a.rarity && <Kv k="Rarità">{a.rarity}</Kv>}
      {a.detail && <span className="dj-tip-detail">{a.detail}</span>}
      {a.at && <span className="xs muted">{fmtWhen(a.at)}</span>}
      <span className="xs muted">Istantanea del momento in cui è stato allegato.</span>
    </>
  );
}

/* ---------------------------------------------------------------- Pagina */

function EntryCard({ e, isMaster, chars, tagsSuggest, bind, onTag, onChanged, onRemoved, onReorder }: {
  e: JournalEntry; isMaster: boolean; chars: CharacterSummary[]; tagsSuggest: string[]; bind: TipBind;
  onTag: (t: string) => void; onChanged: (e: JournalEntry) => void; onRemoved: (id: number) => void; onReorder: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [stash, setStash] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canDelete = e.mine || (isMaster && e.visibility === "gruppo");
  const long = isLong(e.body);
  const when = fmtWhen(e.created_at);
  const edited = e.updated_at && e.updated_at !== e.created_at ? fmtWhen(e.updated_at) : "";

  async function refetch() {
    try { onChanged(await journalApi.get(e.id)); } catch (x) {
      if (x instanceof ApiError && x.status === 404) onRemoved(e.id);
      else setErr(errorText(x));
    }
  }

  async function togglePin() {
    setBusy(true);
    setErr(null);
    try {
      onChanged(await journalApi.update(e.id, { pinned: !e.pinned, version: e.version }));
      onReorder();
    } catch (x) {
      if (x instanceof ApiError && x.status === 409) { toast("DIARIO", [x.message], { bad: true }); await refetch(); } else setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await journalApi.remove(e.id);
      toast("DIARIO", [`Pagina «${e.title}» eliminata.`]);
      onRemoved(e.id);
    } catch (x) {
      setErr(errorText(x));
      setBusy(false);
      setConfirm(false);
    }
  }

  if (editing) {
    return (
      <article className="dj-card is-editing" aria-label={`Modifica: ${e.title}`}>
        <Composer key={`${e.id}:${e.version}`} entry={e} seed={seedOf(e)} chars={chars} tagsSuggest={tagsSuggest} heading="Modifica pagina" stash={stash}
          onCancel={() => { setEditing(false); setStash(null); }}
          onSaved={(saved) => { onChanged(saved); setEditing(false); setStash(null); toast("DIARIO", ["Modifiche salvate."], { gold: true }); if (saved.pinned !== e.pinned) onReorder(); }}
          onConflict={async (mine) => { setStash(mine); await refetch(); }} />
      </article>
    );
  }

  return (
    <article className={`dj-card${e.pinned ? " is-pinned" : ""}`} aria-labelledby={`dj-t-${e.id}`}>
      <header className="dj-card-h">
        <h4 className="dj-title" id={`dj-t-${e.id}`}>{e.pinned && <span className="dj-pin" aria-label="Fissata">📌 </span>}{e.title}</h4>
        <span className={`chip ${e.visibility === "gruppo" ? "violet" : "muted"}`} title={VIS_HINT[e.visibility]}>
          {e.visibility === "gruppo" ? "Gruppo" : "Privata"}
        </span>
      </header>
      <p className="xs muted dj-meta">
        <span>{e.mine ? "Tu" : e.author_name}</span>
        {e.char_name && <> · <span className="dj-char">{e.char_name}</span></>}
        {when && <> · <time dateTime={e.created_at} title={edited ? `Modificata il ${edited}` : undefined}>{when}{edited ? " ✎" : ""}</time></>}
      </p>
      {e.body && (
        <>
          <p className={`dj-body${long && !expanded ? " is-clamped" : ""}`}>{e.body}</p>
          {long && <button type="button" className="dj-link" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>{expanded ? "Riduci" : "Leggi tutto"}</button>}
        </>
      )}
      {e.attachments.length > 0 && (
        <ul className="dj-atts" aria-label="Allegati">
          {e.attachments.map((a, i) => (
            <li key={`${a.kind}:${a.ref}`}>
              <button type="button" className="dj-att" data-rarity={a.rarity ? rarityKey(a.rarity) : undefined}
                aria-label={`${KIND_ONE[a.kind]}: ${a.label}${a.detail ? `, ${a.detail}` : ""}`} {...bind(`${e.id}:${i}`)}>
                <span className="dj-att-ico" aria-hidden="true">{KIND_ICON[a.kind]}</span>
                <span className="dj-att-l">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(e.tags.length > 0 || e.mine || canDelete) && (
        <footer className="dj-card-f">
          <span className="dj-ctags">
            {e.tags.map((t) => <button key={t} type="button" className="dj-tag" onClick={() => onTag(t)} title={`Mostra le pagine con #${t}`}>#{t}</button>)}
          </span>
          {confirm ? (
            <span className="dj-acts" role="group" aria-label="Conferma eliminazione">
              <span className="xs">{e.mine ? "Eliminare la pagina?" : "Eliminare la pagina del gruppo?"}</span>
              <button type="button" className="btn danger dj-mini" onClick={remove} disabled={busy}>Elimina</button>
              <button type="button" className="btn ghost dj-mini" onClick={() => setConfirm(false)} disabled={busy}>Annulla</button>
            </span>
          ) : (
            <span className="dj-acts">
              {e.mine && <button type="button" className="btn ghost dj-mini" onClick={() => { setErr(null); setEditing(true); }}>Modifica</button>}
              {e.mine && <button type="button" className="btn ghost dj-mini" onClick={togglePin} disabled={busy} aria-pressed={e.pinned}>{e.pinned ? "Sblocca" : "Fissa"}</button>}
              {canDelete && <button type="button" className="btn ghost dj-mini dj-del" onClick={() => setConfirm(true)}
                title={e.mine ? undefined : "Moderazione del Master"}>Elimina</button>}
            </span>
          )}
        </footer>
      )}
      <InlineError message={err} />
    </article>
  );
}

/* ---------------------------------------------------------------- Compositore */

function Composer({ seed, entry, chars, tagsSuggest, heading, stash, onSaved, onCancel, onConflict }: {
  seed: Seed; entry?: JournalEntry; chars: CharacterSummary[]; tagsSuggest: string[]; heading: string; stash?: string | null;
  onSaved: (e: JournalEntry) => void; onCancel: () => void; onConflict?: (myBody: string) => void;
}) {
  const [title, setTitle] = useState(seed.title);
  const [body, setBody] = useState(seed.body);
  const [tags, setTags] = useState(seed.tags);
  const [tagIn, setTagIn] = useState("");
  const [charId, setCharId] = useState<number | null>(seed.char_id);
  const [vis, setVis] = useState<JournalVisibility>(seed.visibility);
  const [pinned, setPinned] = useState(seed.pinned);
  const [picked, setPicked] = useState<Picked[]>(seed.picked);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const uid = entry ? `e${entry.id}` : "new";
  // Il PG della pagina può non essere tra i propri (pagina vecchia): resta selezionabile.
  const charOpts = useMemo(() => {
    if (charId == null || chars.some((c) => c.id === charId)) return chars.map((c) => ({ id: c.id, name: c.name }));
    return [...chars.map((c) => ({ id: c.id, name: c.name })), { id: charId, name: entry?.char_name ?? `PG #${charId}` }];
  }, [chars, charId, entry?.char_name]);

  useEffect(() => {
    if (seed.picked.length > 0 && !entry) titleRef.current?.focus(); // solo al montaggio (prefill da "Annota nel diario")
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function changeChar(id: number | null) {
    setPicked((p) => pruneForChar(p, id, charId));
    setCharId(id);
  }

  function commitTags(raw = tagIn) {
    if (!raw.trim()) return tags;
    const next = addTags(tags, raw);
    setTags(next);
    setTagIn("");
    return next;
  }

  async function save() {
    const t = title.trim();
    if (!t) { setErr("Il titolo è obbligatorio."); titleRef.current?.focus(); return; }
    const finalTags = commitTags();
    setBusy(true);
    setErr(null);
    const draft = { title: t, body, tags: finalTags, char_id: charId, visibility: vis, pinned, attachments: toRefs(picked) };
    // In modifica gli allegati si rimandano solo se cambiati: il server li risolverebbe di nuovo sulla scheda attuale
    // (un oggetto venduto nel frattempo farebbe fallire il salvataggio del solo testo).
    const same = entry != null && samePicks(picked, seed.picked);
    try {
      const saved = entry
        ? await journalApi.update(entry.id, same ? { ...draft, attachments: undefined, version: entry.version } : { ...draft, version: entry.version })
        : await journalApi.create(draft);
      onSaved(saved);
    } catch (x) {
      if (x instanceof ApiError && x.status === 409 && entry) setConflict(true);
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  function onKey(ev: RKeyboardEvent) {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (!busy) void save(); }
  }

  const tagsLeft = LIMITS.tags - tags.length;
  return (
    <form className="dj-comp" onSubmit={(ev) => { ev.preventDefault(); void save(); }} onKeyDown={onKey} aria-labelledby={`dj-h-${uid}`}>
      <p className="label" id={`dj-h-${uid}`}>{heading}</p>
      {stash != null && (
        <details className="dj-stash" open>
          <summary className="small">La tua versione non salvata (copiala prima di riscrivere)</summary>
          <textarea className="input" readOnly value={stash} rows={4} aria-label="La tua versione non salvata" />
        </details>
      )}
      <input ref={titleRef} className="input dj-in-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title}
        placeholder="Titolo della pagina" aria-label="Titolo" required />
      <textarea className="input dj-in-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.body} rows={6}
        placeholder="Cosa è successo? Indizi, nomi, promesse, debiti…" aria-label="Testo" />
      {body.length > LIMITS.body * 0.9 && <p className="hint">{body.length.toLocaleString("it-IT")} / {LIMITS.body.toLocaleString("it-IT")} caratteri</p>}

      <div className="dj-comp-row">
        <label className="field dj-f-char">
          <span className="label">Personaggio</span>
          <select className="input" value={charId ?? ""} onChange={(e) => changeChar(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Nessuno</option>
            {charOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="label" id={`dj-vis-${uid}`}>Visibilità</span>
          <div className="seg dj-seg" role="group" aria-labelledby={`dj-vis-${uid}`}>
            {(["privato", "gruppo"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={vis === v} title={VIS_HINT[v]} onClick={() => setVis(v)}>
                {v === "privato" ? "Privata" : "Gruppo"}
              </button>
            ))}
          </div>
        </div>
        <label className="dj-check">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Fissa in cima
        </label>
      </div>
      <p className="hint">{VIS_HINT[vis]}</p>

      <div className="field">
        <label className="label" htmlFor={`dj-tagin-${uid}`}>Tag {tagsLeft < LIMITS.tags && <span className="muted">({tagsLeft} liberi)</span>}</label>
        <div className="dj-tagbox">
          {tags.map((t) => (
            <span key={t} className="dj-tag is-on">#{t}
              <button type="button" className="dj-x" aria-label={`Togli il tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
            </span>
          ))}
          {tagsLeft > 0 && (
            <input id={`dj-tagin-${uid}`} className="input dj-tagin" value={tagIn} list={`dj-tags-${uid}`} maxLength={LIMITS.tag * 2}
              placeholder="indizi, png…" onChange={(e) => { const v = e.target.value; if (v.includes(",")) commitTags(v); else setTagIn(v); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); commitTags(); }
                else if (e.key === "Backspace" && !tagIn && tags.length) setTags(tags.slice(0, -1));
              }}
              onBlur={() => commitTags()} />
          )}
          <datalist id={`dj-tags-${uid}`}>{tagsSuggest.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
        </div>
      </div>

      <div className="field" role="group" aria-labelledby={`dj-att-${uid}`}>
        <div className="dj-att-head">
          <span className="label" id={`dj-att-${uid}`}>Allegati <span className="muted num">{picked.length}/{LIMITS.attachments}</span></span>
          <button type="button" className="btn ghost dj-mini" aria-expanded={pickerOpen} aria-controls={pickerOpen ? `dj-picker-${uid}` : undefined} onClick={() => setPickerOpen((x) => !x)}>
            {pickerOpen ? "Chiudi" : "＋ Allega"}
          </button>
        </div>
        {picked.length > 0 && (
          <ul className="dj-atts" aria-label="Allegati scelti">
            {picked.map((a) => (
              <li key={pickKey(a)} className="dj-att is-picked" data-rarity={a.rarity ? rarityKey(a.rarity) : undefined}
                title={[KIND_ONE[a.kind], a.detail].filter(Boolean).join(" · ")}>
                <span className="dj-att-ico" aria-hidden="true">{KIND_ICON[a.kind]}</span>
                <span className="dj-att-l">{a.label}</span>
                <button type="button" className="dj-x" aria-label={`Togli ${KIND_ONE[a.kind]} ${a.label}`}
                  onClick={() => setPicked((p) => p.filter((x) => pickKey(x) !== pickKey(a)))}>×</button>
              </li>
            ))}
          </ul>
        )}
        {pickerOpen && <AttachPicker id={`dj-picker-${uid}`} charId={charId} picked={picked} setPicked={setPicked} />}
      </div>

      <InlineError message={err} />
      {conflict && onConflict && (
        <div className="row">
          <button type="button" className="btn" onClick={() => onConflict(body)}>Ricarica la pagina</button>
          <span className="xs muted">Vedrai la versione aggiornata; il tuo testo resta qui sopra da copiare.</span>
        </div>
      )}
      <div className="dj-comp-acts">
        <span className="xs muted dj-kbd">Ctrl+Invio per salvare</span>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>{entry ? "Annulla" : "Chiudi"}</button>
        <button type="submit" className="btn primary" disabled={busy || conflict}>{busy ? "Salvataggio…" : entry ? "Salva modifiche" : "Salva pagina"}</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- Scelta degli allegati */

function AttachPicker({ id, charId, picked, setPicked }: {
  id: string; charId: number | null; picked: Picked[]; setPicked: (f: (p: Picked[]) => Picked[]) => void;
}) {
  const [data, setData] = useState<Attachables | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<AttachKind>(() => (charId == null ? "quest" : "roll"));
  const [q, setQ] = useState("");
  const [all, setAll] = useState(false);
  const [limitMsg, setLimitMsg] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(null);
    journalApi.attachables(charId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        // Completa etichetta e dettagli degli allegati arrivati solo con il riferimento (es. "Annota nel diario")
        setPicked((p) => p.map((x) => {
          if (x.detail) return x;
          const c = d[x.kind]?.find((y) => pickKey({ kind: x.kind, ref: y.ref }) === pickKey(x));
          return c ? { ...x, label: c.label, detail: c.detail, rarity: c.rarity ?? null } : x;
        }));
      })
      .catch((e) => { if (alive) setErr(errorText(e)); });
    return () => { alive = false; };
  }, [charId, setPicked]);

  useEffect(() => { setAll(false); }, [kind, q]);

  const keys = useMemo(() => new Set(picked.map(pickKey)), [picked]);
  const list = data ? filterCandidates(data[kind] ?? [], q) : [];
  const shown = all ? list : list.slice(0, CAND_SHOWN);
  const needChar = charId == null && kind !== "quest";

  return (
    <div className="dj-picker" id={id}>
      <div className="tabs dj-ptabs" role="tablist" aria-label="Tipo di allegato">
        {KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}>
            {ATTACH_LABELS[k]}{data && <span className="count">{data[k]?.length ?? 0}</span>}
          </button>
        ))}
      </div>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cerca tra ${ATTACH_LABELS[kind].toLowerCase()}…`}
        aria-label={`Cerca tra ${ATTACH_LABELS[kind].toLowerCase()}`} />
      <InlineError message={err} />
      {limitMsg && <p className="hint bad" role="alert">Al massimo {LIMITS.attachments} allegati per pagina.</p>}
      {!data && !err ? <Loading text="Si cercano gli allegati…" /> : needChar ? (
        <p className="small muted">{NEEDS_CHAR.has(kind) ? `Per allegare ${ATTACH_LABELS[kind].toLowerCase()} scegli il personaggio della pagina.` : "Scegli il personaggio della pagina per vedere i suoi tiri recenti."}</p>
      ) : list.length === 0 ? (
        <p className="small muted">{q ? "Nessun risultato." : `Nessun elemento in ${ATTACH_LABELS[kind]}.`}</p>
      ) : (
        <div className="dj-cands" role="group" aria-label={ATTACH_LABELS[kind]}>
          {shown.map((c) => {
            const p: Picked = { kind, ref: c.ref, label: c.label, detail: c.detail, rarity: c.rarity ?? null };
            const on = keys.has(pickKey(p));
            const meta = [c.rarity, c.detail, c.at ? fmtWhen(c.at) : ""].filter(Boolean).join(" · ");
            return (
              <button key={c.ref} type="button" className="dj-cand" aria-pressed={on} data-rarity={c.rarity ? rarityKey(c.rarity) : undefined}
                title={meta || undefined}
                onClick={() => { const next = togglePick(picked, p); setLimitMsg(next == null); if (next) setPicked(() => next); }}>
                <span className="dj-cand-ico" aria-hidden="true">{on ? "✓" : KIND_ICON[kind]}</span>
                <span className="dj-cand-n">{c.label}</span>
                {meta && <span className="dj-cand-m">{meta}</span>}
              </button>
            );
          })}
          {list.length > shown.length && (
            <button type="button" className="dj-link" onClick={() => setAll(true)}>Mostrane altri {list.length - shown.length}</button>
          )}
        </div>
      )}
    </div>
  );
}
