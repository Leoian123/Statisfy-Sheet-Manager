import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorText } from "../api/client";
import type { Campaign, Issue, Npc, Trust } from "../api/types";
import { useAppData } from "../auth/AppData";
import { Bar } from "../components/Bar";
import { RarityChip } from "../components/RarityChip";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { powerRankFor } from "../lib/format";
import { useBusy } from "../lib/useCharacter";
import { PvpChip } from "./Scheda";

const TRUST: Record<Trust, string> = { Scarso: "bad", Neutrale: "muted", Buono: "good", Eccellente: "gold" };
const TRUST_LEVELS = Object.keys(TRUST) as Trust[];

export function Master() {
  const { chars, refreshChars } = useAppData();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    refreshChars();
    Promise.all([api.campaign(), api.npcs(), api.issues()])
      .then(([c, np, is]) => { if (alive) { setCampaign(c); setNpcs(np); setIssues(is); } })
      .catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [nonce, refreshChars]);

  if (error) return <ErrorBox title="Area Master" message={error} action={<button type="button" className="btn" onClick={() => setNonce((x) => x + 1)}>Riprova</button>} />;
  if (!campaign || !npcs || !issues || !chars) return <Loading text="Caricamento campagna…" />;

  return (
    <div className="ms-root">
      <CampaignWin campaign={campaign} setCampaign={setCampaign} npcCount={npcs.length} />
      <PcsWin />
      <div className="ms-cols">
        <NpcsWin npcs={npcs} setNpcs={setNpcs} session={campaign.session} />
        <div className="stack" style={{ gap: 20 }}>
          <Win title="Quest aperte" right={<span className="chip muted">{campaign.open_quests.length}</span>}>
            {campaign.open_quests.length ? (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Quest</th><th>Assegnata a</th><th>Rarità</th><th>Scadenza</th></tr></thead>
                  <tbody>{campaign.open_quests.map((q, i) => (
                    <tr key={i}><td>{q.name}</td><td>{q.who}</td><td><RarityChip rarity={q.rarity} /></td><td>{q.due}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="ms-empty">Nessuna quest aperta.</p>}
          </Win>
          <IssuesWin issues={issues} setIssues={setIssues} />
        </div>
      </div>
    </div>
  );
}

function CampaignWin({ campaign, setCampaign, npcCount }: { campaign: Campaign; setCampaign: (c: Campaign) => void; npcCount: number }) {
  const { chars, rules } = useAppData();
  const toast = useToast();
  const { busy, error, run } = useBusy();
  const list = chars ?? [];
  const avg = list.length ? Math.round(list.reduce((s, c) => s + c.level, 0) / list.length) : 0;
  const low = list.filter((c) => c.hp_max > 0 && c.hp / c.hp_max < 0.3).length;

  async function newSession() {
    const res = await run(() => api.newSession());
    if (!res) return;
    setCampaign(res);
    toast("SISTEMA", [`Sessione ${res.session} aperta.`, "Le nuove interazioni con i PNG verranno registrate in questa sessione."], { gold: true });
  }

  return (
    <Win title="Sistema · Campagna" gold>
      <div className="ms-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="label">Campagna</span>
          <h1 className="ms-title">{campaign.name}</h1>
          <span className="muted small">Master: {campaign.master_name} · <span className="chip gold">Sessione {campaign.session}</span></span>
        </div>
        <button className="btn primary" type="button" disabled={busy} onClick={newSession}>Nuova sessione</button>
      </div>
      <InlineError message={error} />
      <div className="ms-kvs">
        <div className="kv"><span className="label">Personaggi</span><span className="v">{list.length} <small>PG</small></span></div>
        <div className="kv"><span className="label">Archivio</span><span className="v">{npcCount} <small>PNG</small></span></div>
        <div className="kv"><span className="label">Livello medio</span><span className="v">{avg} <small>{avg ? powerRankFor(rules, avg) : ""}</small></span></div>
        <div className="kv"><span className="label">Quest aperte</span><span className="v">{campaign.open_quests.length} <small>{low ? `${low} PG con HP critici` : "nessun PG in pericolo"}</small></span></div>
      </div>
    </Win>
  );
}

function PcsWin() {
  const { chars } = useAppData();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"level" | "name">("level");
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (chars ?? [])
      .filter((c) => !q || [c.name, c.owner_name, c.classe, c.gilda?.nome].some((v) => String(v || "").toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => (sortBy === "name" ? a.name.localeCompare(b.name, "it") : b.level - a.level || a.name.localeCompare(b.name, "it")));
  }, [chars, query, sortBy]);

  return (
    <Win title="Personaggi della campagna" right={<span className="chip muted">{chars?.length ?? 0} PG</span>}>
      <div className="ms-tools">
        <div className="field">
          <label className="label" htmlFor="ms-search">Cerca</label>
          <input className="input" id="ms-search" type="search" placeholder="Nome, giocatore, classe, gilda" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="field ms-sort">
          <label className="label" htmlFor="ms-sort">Ordina per</label>
          <select className="input" id="ms-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as "level" | "name")}>
            <option value="level">Livello</option>
            <option value="name">Nome</option>
          </select>
        </div>
      </div>
      <div className="ms-pcs">
        {!list.length ? <p className="ms-empty">{query ? `Nessun personaggio corrisponde a "${query}".` : "Nessun personaggio nella campagna."}</p> : list.map((c) => {
          const low = c.hp_max > 0 && c.hp / c.hp_max < 0.3;
          const hasGuild = c.gilda?.nome && c.gilda.nome !== "—";
          return (
            <article className={`ms-pc${low ? " ms-low" : ""}`} key={c.id}>
              <div className="ms-pc-top">
                <div className="stack" style={{ gap: 2 }}>
                  <span className="ms-pc-name">{c.name}</span>
                  <span className="small muted">{c.owner_name}</span>
                </div>
                <PvpChip flag={c.pvp} />
              </div>
              <div className="row small">
                <span>{c.classe}</span>
                <span className="num">Lv {c.level}</span>
                <span className="chip violet">{c.power_rank}</span>
              </div>
              <div className="small">
                <span className="label">Gilda</span>{" "}
                {hasGuild ? <>{c.gilda.nome}{c.gilda.ruolo && <span className="muted"> · {c.gilda.ruolo}</span>}</> : <span className="muted">Nessuna gilda</span>}
              </div>
              <Bar kind="hp" label={low ? "HP · critici" : "HP"} cur={c.hp} max={c.hp_max} />
              <div className="row">
                <Link className="btn" to={`/personaggi/${c.id}`}>Apri scheda</Link>
                <Link className="btn ghost" to={`/personaggi/${c.id}/combattimento`}>Combattimento</Link>
              </div>
            </article>
          );
        })}
      </div>
      <p className="footnote">HP sotto il 30% del massimo evidenziati in rosso.</p>
    </Win>
  );
}

function NpcsWin({ npcs, setNpcs, session }: { npcs: Npc[]; setNpcs: (n: Npc[]) => void; session: number }) {
  const toast = useToast();
  const { busy, error, setError, run } = useBusy();
  const [npcId, setNpcId] = useState<number | null>(npcs[0]?.id ?? null);
  const [logOpen, setLogOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const sel = npcs.find((x) => x.id === npcId) ?? npcs[0] ?? null;

  const replace = (np: Npc) => setNpcs(npcs.map((x) => (x.id === np.id ? np : x)));

  function select(id: number) {
    if (id !== npcId) { setNpcId(id); setLogOpen(false); setDraft(""); setError(null); }
  }
  async function setTrust(t: Trust) {
    if (!sel) return;
    const res = await run(() => api.patchNpc(sel.id, { trust: t }));
    if (res) { replace(res); toast("PNG", [`Fiducia di ${res.name}: ${res.trust}.`]); }
  }
  async function saveLog() {
    if (!sel) return;
    const text = draft.trim();
    if (!text) { setError("Scrivi almeno una riga prima di salvare."); return; }
    const res = await run(() => api.addInteraction(sel.id, text));
    if (res) { replace(res); setLogOpen(false); setDraft(""); toast("PNG", [`${res.name} ricorderà questa interazione.`]); }
  }

  return (
    <Win title="Archivio PNG" right={<span className="chip muted">{npcs.length} PNG</span>}>
      <div className="ms-npc-wrap">
        <div className="ms-npc">
          <div className="ms-npc-list" role="group" aria-label="PNG">
            {npcs.map((x) => (
              <button className="pick" type="button" key={x.id} aria-pressed={sel?.id === x.id} onClick={() => select(x.id)}>
                <span className="ms-npc-name">{x.name}</span>
                <span className="xs muted">{x.role}</span>
                <span className="xs muted">{x.place}</span>
                <span><span className={`chip ${TRUST[x.trust] || "muted"}`}>{x.trust}</span></span>
              </button>
            ))}
            {!npcs.length && <p className="ms-empty">Archivio vuoto.</p>}
          </div>
          {!sel ? <p className="ms-empty">Seleziona un PNG dalla lista.</p> : (
            <div className="ms-detail" aria-live="polite">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="ms-pc-name">{sel.name}</span>
                <span className={`chip ${TRUST[sel.trust] || "muted"}`}>Fiducia: {sel.trust}</span>
              </div>
              <div className="ms-facts">
                <div className="kv"><span className="label">Livello</span><span className="v num">{sel.level}</span></div>
                <div className="kv"><span className="label">Razza</span><span className="v">{sel.race}</span></div>
                <div className="kv"><span className="label">Luogo</span><span className="v">{sel.place}</span></div>
                <div className="kv"><span className="label">Ruolo</span><span className="v">{sel.role}</span></div>
              </div>
              <div className="field">
                <label className="label" htmlFor="ms-npc-trust">Fiducia verso il gruppo</label>
                <select className="input" id="ms-npc-trust" value={sel.trust} disabled={busy} onChange={(e) => setTrust(e.target.value as Trust)}>
                  {TRUST_LEVELS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="ms-block"><span className="label">Cosa sa dei PG</span><p>{sel.knows || "—"}</p></div>
              <div className="ms-block"><span className="label">Debiti e favori</span><p>{sel.debts || "—"}</p></div>
              <div className="ms-block"><span className="label">Ultima interazione</span><p>{sel.last || "—"}</p></div>
              <div className="ms-secret"><span className="label">Segreto (solo Master)</span><p>{sel.secret || "—"}</p></div>
              {logOpen ? (
                <>
                  <div className="field">
                    <label className="label" htmlFor="ms-npc-log">Nuova interazione · Sessione {session}</label>
                    <textarea className="input" id="ms-npc-log" rows={3} autoFocus placeholder="Cosa è successo? Cosa ricorderà questo PNG?"
                      value={draft} onChange={(e) => setDraft(e.target.value)} />
                    <span className="hint">La voce diventa l'ultima interazione e finisce nella cronologia.</span>
                  </div>
                  <div className="row">
                    <button className="btn primary" type="button" disabled={busy} onClick={saveLog}>Salva interazione</button>
                    <button className="btn ghost" type="button" onClick={() => { setLogOpen(false); setDraft(""); setError(null); }}>Annulla</button>
                  </div>
                </>
              ) : (
                <div className="row"><button className="btn" type="button" onClick={() => setLogOpen(true)}>Registra interazione</button></div>
              )}
              <InlineError message={error} />
              <div className="ms-block">
                <span className="label">Cronologia interazioni</span>
                {sel.history?.length ? (
                  <ol className="ms-history">
                    {sel.history.slice().reverse().map((h, i) => (
                      <li className="small" key={i}><span className="chip muted">Sessione {h.session}</span> {h.text}</li>
                    ))}
                  </ol>
                ) : <p className="small muted">Nessuna interazione registrata.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </Win>
  );
}

function IssuesWin({ issues, setIssues }: { issues: Issue[]; setIssues: (x: Issue[]) => void }) {
  const open = issues.filter((x) => !x.resolved).length;
  const replace = (it: Issue) => setIssues(issues.map((x) => (x.id === it.id ? it : x)));
  return (
    <Win title="Questioni aperte sulle regole" right={<span className={`chip ${open ? "warn" : "good"}`}>{open} aperte</span>}>
      <p className="small muted">Discrepanze trovate confrontando il regolamento con le schede Excel.</p>
      <ul className="ms-issues">
        {issues.map((it) => <IssueItem key={it.id} it={it} onChange={replace} />)}
      </ul>
    </Win>
  );
}

function IssueItem({ it, onChange }: { it: Issue; onChange: (x: Issue) => void }) {
  const { busy, error, run } = useBusy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(it.decision ?? "");
  const cbId = `ms-issue-${it.id}`;

  async function patch(p: { resolved?: boolean; decision?: string | null }) {
    const res = await run(() => api.patchIssue(it.id, p));
    if (res) { onChange(res); setEditing(false); }
  }

  const sev = it.resolved
    ? <span className="chip good">Decisa</span>
    : it.sev === "bad" ? <span className="chip bad">Blocca il modello dati</span> : <span className="chip warn">Da decidere</span>;

  return (
    <li className={`ms-issue${it.resolved ? " ms-done" : ""}`}>
      <div className="ms-issue-top">
        <span className="ms-issue-title">{it.title}</span>
        {sev}
      </div>
      <p className="small muted ms-issue-text">{it.text}</p>
      {editing ? (
        <div className="field">
          <label className="label" htmlFor={`${cbId}-dec`}>Decisione</label>
          <textarea className="input small" id={`${cbId}-dec`} rows={3} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="row">
            <button className="btn primary" type="button" disabled={busy} onClick={() => patch({ decision: draft.trim() || null })}>Salva</button>
            <button className="btn ghost" type="button" onClick={() => { setEditing(false); setDraft(it.decision ?? ""); }}>Annulla</button>
          </div>
        </div>
      ) : it.decision ? (
        <p className="small ms-decision"><b>Decisione:</b> {it.decision}</p>
      ) : null}
      <div className="row">
        <label className="ms-check" htmlFor={cbId}>
          <input type="checkbox" id={cbId} checked={it.resolved} disabled={busy} onChange={(e) => patch({ resolved: e.target.checked })} /> Risolta
        </label>
        {!editing && (
          <button type="button" className="cr-linkbtn small" onClick={() => { setDraft(it.decision ?? ""); setEditing(true); }}>
            {it.decision ? "Modifica decisione" : "Scrivi decisione"}
          </button>
        )}
      </div>
      <InlineError message={error} />
    </li>
  );
}

