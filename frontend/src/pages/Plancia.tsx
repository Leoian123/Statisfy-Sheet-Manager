/* Plancia di comando del Master (design: artifact «Plancia del Master»).
   PC: tutto in una pagina. Telefono (≤ 760px): una sezione alla volta, con la barra in basso
   Gruppo · Incontro · Forgia · Assegna · Altro. Tutti i numeri vengono dal server (GET /api/forge/board). */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, errorText } from "../api/client";
import { forgeApi, type AssignPreview, type Board, type BoardEncounter, type BoardPc, type ForgeEntry, type ForgeKind, type ForgeMeta } from "../api/forge";
import { useAppData } from "../auth/AppData";
import { RarityChip } from "../components/RarityChip";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { TipRow } from "../components/TipRow";
import { useToast } from "../components/Toast";
import { CloseEncounter, WIZARDS } from "./Forgia";
import "../styles/forge.css";
import "../styles/plancia.css";

type Tab = "gruppo" | "incontro" | "forgia" | "assegna" | "altro";
const nf = (n: unknown) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("it-IT");
const ni = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("it-IT");
const pct = (a: number, b: number) => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
const TRUST: Record<string, string> = { Scarso: "bad", Neutrale: "muted", Buono: "good", Eccellente: "gold" };
const KIND_ORDER: ForgeKind[] = ["titles", "items", "skills", "spells", "miracles"];

export function Plancia() {
  const { refreshChars } = useAppData();
  const toast = useToast();
  const [board, setBoard] = useState<Board | null>(null);
  const [meta, setMeta] = useState<ForgeMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<Tab>("gruppo");
  const [assignPc, setAssignPc] = useState<number | null>(null);
  const assignRef = useRef<HTMLElement>(null);

  const reload = useCallback(async () => {
    const [b, m] = await Promise.all([forgeApi.board(), forgeApi.meta()]);
    setBoard(b);
    setMeta(m);
  }, []);
  useEffect(() => {
    setError(null);
    reload().catch((e) => setError(errorText(e)));
  }, [nonce, reload]);
  const refresh = useCallback(() => { reload().catch((e) => setError(errorText(e))); refreshChars(); }, [reload, refreshChars]);

  if (error) return <ErrorBox title="Plancia di comando" message={error} action={<button type="button" className="btn" onClick={() => setNonce((x) => x + 1)}>Riprova</button>} />;
  if (!board || !meta) return <Loading text="Accensione della plancia…" />;

  const camp = board.campaign;
  const avg = board.party.length ? Math.round(board.party.reduce((s, p) => s + p.level, 0) / board.party.length) : 0;
  const active = board.encounters.find((e) => e.id === board.active_encounter_id) ?? null;

  function goAssign(id: number) {
    setAssignPc(id);
    setTab("assegna");
    requestAnimationFrame(() => assignRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  async function newSession() {
    try {
      const c = await api.newSession();
      toast("SISTEMA", [`Sessione ${c.session} aperta.`], { gold: true });
      refresh();
    } catch (e) { toast("SISTEMA", [errorText(e)], { bad: true }); }
  }

  return (
    <div className="pl-root" data-tab={tab}>
      <header className="pl-head">
        <div className="pl-head-t">
          <span className="label pl-gold">Plancia di comando · {camp?.master_name ?? "Master"}</span>
          <h1 className="pl-title">{camp?.name ?? "Campagna"}</h1>
          <span className="small muted">Sessione <b className="pl-fg">{camp?.session ?? "—"}</b>{active ? <> · in gioco: {active.name}{active.data.place ? `, ${active.data.place}` : ""}</> : null}</span>
        </div>
        <div className="pl-kpis">
          <div className="kv"><span className="label">PG</span><span className="v">{board.party.length}</span></div>
          <div className="kv"><span className="label">Livello medio</span><span className="v">{avg}</span></div>
          <div className="kv"><span className="label">Quest aperte</span><span className="v">{camp?.open_quests.length ?? 0}</span></div>
          <div className="kv"><span className="label">Libreria</span><span className="v">{Object.values(board.counts).reduce((a, b) => a + b, 0)}</span></div>
        </div>
        <div className="row">
          <Link className="btn" to="/master/forgia">Apri la Forgia</Link>
          <button type="button" className="btn primary" onClick={newSession}>Nuova sessione</button>
        </div>
      </header>

      <nav className="pl-sec pl-quick" data-sec="forgia" aria-label="Crea al volo">
        <span className="label">Crea al volo</span>
        <div className="pl-quick-b">
          {WIZARDS.map((w) => <Link key={w.id} className="btn ghost" to={`/master/forgia?w=${w.id}`}>{w.title}</Link>)}
        </div>
      </nav>

      <div className="pl-cols">
        <div className="pl-main">
          {active && <EncounterBanner enc={active} onOpen={() => setTab("incontro")} />}
          <Party board={board} onAssign={goAssign} onChanged={refresh} />
          <AssignPanel ref={assignRef} board={board} meta={meta} pc={assignPc} setPc={setAssignPc} onDone={refresh} />
        </div>
        <div className="pl-side">
          <EncounterPanel board={board} active={active} onChanged={refresh} />
          <NpcPanel board={board} onChanged={refresh} />
          <section className="win pl-sec" data-sec="altro" aria-labelledby="pl-q">
            <header className="win-h" id="pl-q">Quest aperte<span className="spacer" /><span className="chip muted">{camp?.open_quests.length ?? 0}</span></header>
            <div className="win-b pl-list">
              {camp?.open_quests.length ? camp.open_quests.map((q, i) => (
                <div key={i} className="pl-li"><div className="pl-li-t"><b>{q.name}</b><span className="xs muted">{q.who} · scadenza {q.due}</span></div><RarityChip rarity={q.rarity} /></div>
              )) : <p className="small muted">Nessuna quest aperta.</p>}
            </div>
          </section>
          <section className="win pl-sec" data-sec="altro" aria-labelledby="pl-log">
            <header className="win-h" id="pl-log">Registro della sessione</header>
            <div className="win-b pl-log">
              {board.log.length ? board.log.map((l, i) => (
                <div key={i} className="pl-log-r"><span className="mono xs muted">{new Date(l.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span><span className="small">{l.text}</span></div>
              )) : <p className="small muted">Ancora niente in questa sessione: creazioni, assegnazioni e incontri compaiono qui.</p>}
            </div>
          </section>
        </div>
      </div>

      <nav className="pl-tabbar" aria-label="Sezioni della plancia">
        {([["gruppo", "Gruppo", ICONS.gruppo], ["incontro", "Incontro", ICONS.incontro], ["forgia", "Forgia", ICONS.forgia], ["assegna", "Assegna", ICONS.assegna], ["altro", "Altro", ICONS.altro]] as [Tab, string, ReactNode][])
          .map(([k, label, icon]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => { setTab(k); window.scrollTo({ top: 0 }); }}>
              {icon}<span>{label}</span>{k === "incontro" && active && <span className="pl-dot" aria-label="incontro in corso" />}
            </button>
          ))}
      </nav>
    </div>
  );
}

const svg = (d: ReactNode) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICONS = {
  gruppo: svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5a3 3 0 010 6M21 20c0-2.6-1.6-4.8-4-5.6" /></>),
  incontro: svg(<path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2" />),
  forgia: svg(<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5" />),
  assegna: svg(<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />),
  altro: svg(<path d="M4 6h16M4 12h16M4 18h16" />),
};

/* ---------------- Gruppo ---------------- */
function Bar({ label, cur, max, cls }: { label: string; cur: number; max: number; cls: string }) {
  return (
    <div className="pl-bar">
      <div className="pl-bar-t"><span className={`label pl-${cls}`}>{label}</span><span className="mono xs">{ni(cur)} / {ni(max)}</span></div>
      <div className="bar-track"><div className={`pl-fill pl-${cls}-bg`} style={{ width: `${pct(cur, max)}%` }} /></div>
    </div>
  );
}

function Party({ board, onAssign, onChanged }: { board: Board; onAssign: (id: number) => void; onChanged: () => void }) {
  const [sortBy, setSortBy] = useState<"level" | "hp">("level");
  const list = useMemo(() => board.party.slice().sort((a, b) => (sortBy === "hp"
    ? pct(a.resources.hp, a.maxes.hp) - pct(b.resources.hp, b.maxes.hp)
    : b.level - a.level || a.name.localeCompare(b.name, "it"))), [board.party, sortBy]);
  return (
    <section className="win pl-sec" data-sec="gruppo" aria-labelledby="pl-g">
      <header className="win-h" id="pl-g">Il gruppo<span className="spacer" />
        <label className="pl-sort small"><span className="muted">Ordina per</span>
          <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as "level" | "hp")}>
            <option value="level">Livello</option><option value="hp">HP più bassi</option>
          </select></label>
      </header>
      <div className="win-b">
        <div className="pl-party">{list.map((p) => <PcCard key={p.id} p={p} onAssign={onAssign} onChanged={onChanged} />)}</div>
        <span className="xs muted">Bordo rosso sotto il 30% di HP. Passa sopra a un PG (o toccalo) per MP, SP, KI e stati attivi.</span>
      </div>
    </section>
  );
}

function PcCard({ p, onAssign, onChanged }: { p: BoardPc; onAssign: (id: number) => void; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const hp = p.resources.hp ?? 0;
  const low = pct(hp, p.maxes.hp) < 30;
  async function act(type: "damage" | "heal") {
    const n = Math.round(Number(amount));
    if (!n || n < 0) return;
    setBusy(true);
    try {
      await api.combatAction(p.id, type, n);
      toast("COMBAT", [`${p.name}: ${type === "damage" ? "−" : "+"}${ni(n)} HP.`]);
      setAmount(""); setOpen(false); onChanged();
    } catch (e) { toast("SISTEMA", [errorText(e)], { bad: true }); } finally { setBusy(false); }
  }
  const tip = <>
    {(["mp", "sp", "ki"] as const).filter((k) => p.maxes[k] != null).map((k) => <span key={k} className="tline"><span>{k.toUpperCase()}</span><span className="mono">{ni(p.resources[k])} / {ni(p.maxes[k])}</span></span>)}
    <span className="tline"><span>Rango</span><span>{p.power_rank}</span></span>
    {p.effects.length ? p.effects.map((e, i) => <span key={i} className="tline"><span>{e.name}</span><span>{e.turns} turni</span></span>) : <span className="muted">Nessuno stato attivo.</span>}
    {p.dead && <span className="pl-bad">Morto: in attesa di rinascita.</span>}
  </>;
  return (
    <article className={`pl-pc${low ? " is-low" : ""}`}>
      <TipRow className="pl-pc-top" tip={tip}>
        <div className="pl-pc-h"><h3>{p.name}</h3><span className="mono xs muted">Lv <b className="pl-fg">{p.level}</b></span></div>
        <span className="xs muted">{p.classe} · {p.owner_name}{p.effects.length ? ` · ${p.effects.length} stati` : ""}</span>
        <Bar label="HP" cur={hp} max={p.maxes.hp} cls="hp" />
        <div className="pl-bar">
          <div className="pl-bar-t"><span className="label pl-gold">EXP</span><span className="mono xs">{nf(p.exp_pct)}%</span></div>
          <div className="bar-track pl-thin"><div className="pl-fill pl-gold-bg" style={{ width: `${pct(p.exp_pct, 100)}%` }} /></div>
        </div>
      </TipRow>
      {open ? (
        <div className="pl-dmg">
          <label className="pl-sr" htmlFor={`pl-amt-${p.id}`}>Quantità per {p.name}</label>
          <input id={`pl-amt-${p.id}`} className="input num" type="number" inputMode="numeric" min={1} placeholder="HP" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !Number(amount)} onClick={() => act("damage")}>Danno</button>
          <button type="button" className="btn" disabled={busy || !Number(amount)} onClick={() => act("heal")}>Cura</button>
          <button type="button" className="btn ghost icon" aria-label="Chiudi" onClick={() => setOpen(false)}>✕</button>
        </div>
      ) : (
        <div className="pl-pc-act">
          <button type="button" className="btn" onClick={() => setOpen(true)}>Danno / cura</button>
          <button type="button" className="btn" onClick={() => onAssign(p.id)}>Assegna</button>
          <Link className="btn ghost" to={`/personaggi/${p.id}`} aria-label={`Scheda di ${p.name}`}>Scheda</Link>
        </div>
      )}
    </article>
  );
}

/* ---------------- Assegna dalla libreria ---------------- */
interface AssignProps { board: Board; meta: ForgeMeta; pc: number | null; setPc: (id: number) => void; onDone: () => void }

const AssignPanel = forwardRef<HTMLElement, AssignProps>(function AssignPanel({ board, meta, pc, setPc, onDone }, ref) {
  const toast = useToast();
  const [kind, setKind] = useState<ForgeKind>("titles");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [pv, setPv] = useState<AssignPreview | null>(null);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const charId = pc ?? board.party[0]?.id ?? null;
  const ch = board.party.find((p) => p.id === charId);
  const label = (k: ForgeKind) => meta.kinds.find((x) => x.key === k)?.label ?? k;
  const items = board.library.filter((e) => e.kind === kind && (!q.trim() || `${e.name} ${e.summary}`.toLowerCase().includes(q.trim().toLowerCase())));
  const entry = board.library.find((e) => e.id === sel) ?? null;

  useEffect(() => {
    setPv(null); setForce(false); setErr(null);
    if (!entry || charId == null) return;
    let alive = true;
    forgeApi.assignPreview(entry.id, charId).then((r) => { if (alive) setPv(r); }).catch((e) => { if (alive) setErr(errorText(e)); });
    return () => { alive = false; };
  }, [entry?.id, charId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function assign() {
    if (!entry || charId == null) return;
    setBusy(true); setErr(null);
    try {
      const r = await forgeApi.assign(entry.id, charId, force);
      toast("FORGIA", r.messages, { gold: true });
      setSel(null);
      onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  const owners = (e: ForgeEntry) => ((e.data.assignments ?? []) as { name: string }[]).map((a) => a.name);
  const blocked = !entry || !pv || !!pv.error || (pv.issues.length > 0 && !force);

  return (
    <section className="win gold pl-sec" data-sec="assegna" aria-labelledby="pl-a" ref={ref}>
      <header className="win-h" id="pl-a">Assegna a un PG<span className="spacer" /><span className="chip gold">dalla libreria della campagna</span></header>
      <div className="win-b">
        <div className="field"><span className="label">1 · Personaggio</span>
          <div className="pl-chips">{board.party.map((p) => (
            <button key={p.id} type="button" className="btn pl-chipbtn" aria-pressed={p.id === charId} onClick={() => setPc(p.id)}>{p.name}</button>
          ))}</div>
        </div>
        <div className="field"><span className="label">2 · Che cosa</span>
          <div className="pl-kinds" role="tablist" aria-label="Tipo da assegnare">{KIND_ORDER.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => { setKind(k); setSel(null); }}>
              {label(k)} <span className="mono xs muted">{board.counts[k] ?? 0}</span></button>
          ))}</div>
        </div>
        <div className="pl-assign">
          <div className="pl-assign-l">
            <label className="label" htmlFor="pl-cerca">3 · Dalla libreria</label>
            <input id="pl-cerca" className="input" type="search" placeholder={`Cerca tra ${label(kind).toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
            {items.length ? items.map((e) => (
              <button key={e.id} type="button" className="pl-entry" aria-pressed={e.id === sel} onClick={() => setSel(e.id === sel ? null : e.id)}>
                <span className="pl-entry-n">{e.name} {e.data.rarity && <RarityChip rarity={e.data.rarity} />}</span>
                <span className="xs muted">{e.summary}</span>
                {owners(e).length > 0 && <span className="xs pl-gold">Già a: {owners(e).join(", ")}</span>}
              </button>
            )) : <p className="small muted">Nessuna voce. <Link to={`/master/forgia?w=${WIZARD_FOR[kind]}`}>Creane una nella Forgia</Link>.</p>}
          </div>
          <aside className="pl-effect" aria-label={`Effetto su ${ch?.name ?? "PG"}`}>
            <span className="label pl-gold">Effetto su {ch?.name ?? "—"}</span>
            {!entry ? <p className="small muted">Scegli una voce della libreria: qui vedi cosa cambia sulla scheda prima di confermare.</p> : <>
              <b>{entry.name}</b>
              {!pv && !err && <Loading text="Calcolo…" />}
              {pv && <>
                {pv.error && <p className="hint bad" role="alert">{pv.error}</p>}
                {pv.replaces && <span className="xs muted">Evolve «{pv.replaces}»: lo sostituisce e ne toglie i bonus.</span>}
                {pv.lines.map((l) => (
                  <div key={l.code} className="pl-delta"><span className="muted">Titoli {l.code}</span>
                    {l.missing ? <span className="chip warn">non presente</span>
                      : <span className="mono">{ni(l.before)} → <b className={l.delta >= 0 ? "pl-good" : "pl-bad"}>{ni(l.after)}</b> <span className="xs muted">(tot. {ni(l.total_after)})</span></span>}</div>
                ))}
                {kind === "items" && <span className="small">{pv.unmet.length ? <span className="pl-warn">Nella borsa, ma per equipaggiarlo servono: {pv.unmet.join(", ")}.</span> : "Va nella borsa; i requisiti sono soddisfatti."}</span>}
                {(kind === "skills" || kind === "spells" || kind === "miracles") && !pv.error && <span className="small">Nuova skill al Grado I.</span>}
                {pv.issues.length > 0 && <>
                  <div className="sysmsg bad"><span className="tag">[AVVISO]</span>{pv.issues.map((t) => <span key={t}>{t}.</span>)}</div>
                  <label className="wz-check"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /><span>Forza l'assegnazione (decisione del Master)</span></label>
                </>}
              </>}
              <InlineError message={err} />
              <button type="button" className="btn primary" disabled={blocked || busy} onClick={assign}>{busy ? "Assegnazione…" : `Assegna a ${ch?.name ?? "PG"}`}</button>
            </>}
          </aside>
        </div>
      </div>
    </section>
  );
});

const WIZARD_FOR: Record<string, string> = { titles: "titolo", items: "oggetto", skills: "skill", spells: "incantesimo", miracles: "miracolo" };

/* ---------------- Incontro in corso ---------------- */
function EncounterBanner({ enc, onOpen }: { enc: BoardEncounter; onOpen: () => void }) {
  const tot = enc.creatures.reduce((s, c) => s + c.hp, 0);
  const max = enc.creatures.reduce((s, c) => s + c.max, 0);
  return (
    <button type="button" className="pl-banner pl-sec" data-sec="gruppo" onClick={onOpen}>
      <span className="label pl-gold">Incontro in corso · Turno {enc.live.turn ?? 1}</span>
      <b>{enc.name}</b>
      <div className="bar-track"><div className="pl-fill pl-hp-bg" style={{ width: `${pct(tot, max)}%` }} /></div>
      <span className="mono xs muted">Creature: {ni(tot)} / {ni(max)} Vita</span>
    </button>
  );
}

function EncounterPanel({ board, active, onChanged }: { board: Board; active: BoardEncounter | null; onChanged: () => void }) {
  const toast = useToast();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [loot, setLoot] = useState<string | null>(null);
  const [closing, setClosing] = useState<ForgeEntry | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast("SISTEMA", [errorText(e)], { bad: true }); } finally { setBusy(false); }
  }
  const live = (id: number, action: "start" | "stop" | "next_turn" | "damage" | "heal", index?: number, amount?: number) =>
    run(async () => { const r = await forgeApi.live(id, action, index, amount); if (action !== "damage" && action !== "heal") toast("SISTEMA", [r.message]); onChanged(); });

  async function rollLoot(e: BoardEncounter) {
    await run(async () => {
      const pf = e.data.loot?.profile ?? await forgeApi.dropProfile(e.data.creatures);
      const r = await forgeApi.dropRoll(pf);
      setLoot(r.text || "Niente: solo polvere.");
    });
  }

  return (
    <section className={`win pl-sec${active ? " gold" : ""}`} data-sec="incontro" aria-labelledby="pl-i">
      <header className="win-h" id="pl-i">{active ? "Incontro in corso" : "Incontri"}<span className="spacer" />{active && <span className="chip bad">Turno {active.live.turn ?? 1}</span>}</header>
      <div className="win-b">
        {active ? <>
          <div className="stack" style={{ gap: 2 }}>
            <b className="pl-enc-t">{active.name}</b>
            <span className="xs muted">{[active.data.place, active.data.env, `${(active.data.party ?? []).length} PG, livello ${active.data.level}`].filter(Boolean).join(" · ")}</span>
          </div>
          {active.creatures.map((c, i) => (
            <div key={i} className="pl-cr">
              <div className="pl-cr-h"><b>{c.count}× {c.name}</b><RarityChip rarity={c.rarity} /></div>
              <span className="mono xs muted">Lv {c.level} · Vita {ni(c.hp)} / {ni(c.max)}{c.hp === 0 ? " · sconfitta" : ""}</span>
              <div className="bar-track"><div className="pl-fill pl-hp-bg" style={{ width: `${pct(c.hp, c.max)}%` }} /></div>
              <div className="pl-dmg">
                <label className="pl-sr" htmlFor={`pl-cr-${i}`}>Vita da togliere o ridare a {c.name}</label>
                <input id={`pl-cr-${i}`} className="input num" type="number" inputMode="numeric" min={1} placeholder="Vita" value={amounts[i] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [i]: e.target.value }))} />
                <button type="button" className="btn" disabled={busy || !Number(amounts[i])} onClick={() => { live(active.id, "damage", i, Math.round(Number(amounts[i]))); setAmounts((a) => ({ ...a, [i]: "" })); }}>− Vita</button>
                <button type="button" className="btn" disabled={busy || !Number(amounts[i])} onClick={() => { live(active.id, "heal", i, Math.round(Number(amounts[i]))); setAmounts((a) => ({ ...a, [i]: "" })); }}>+ Vita</button>
              </div>
            </div>
          ))}
          <div className="pl-kv2">
            <div className="kv"><span className="label">Difficoltà</span><span><span className={`chip ${active.data.difficulty?.byMaster ? "gold" : "muted"}`}>{active.data.difficulty?.label ?? "—"}</span></span></div>
            <div className="kv"><span className="label">EXP intera a lv {active.data.level}</span><span className="v">{nf(active.data.expPct)}%</span></div>
          </div>
          {loot && <div className="sysmsg gold"><span className="tag">[BOTTINO]</span><span className="pl-pre">{loot}</span></div>}
          <div className="pl-enc-act">
            <button type="button" className="btn" disabled={busy} onClick={() => live(active.id, "next_turn")}>Prossimo turno</button>
            <button type="button" className="btn" disabled={busy} onClick={() => rollLoot(active)}>Tira il bottino</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => live(active.id, "stop")}>Sospendi</button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => setClosing(active)}>Chiudi incontro</button>
          </div>
        </> : <>
          <p className="small muted">Nessun incontro in corso. Avvia uno degli incontri preparati nella Forgia.</p>
          {board.encounters.map((e) => (
            <div key={e.id} className="pl-li"><div className="pl-li-t"><b>{e.name}</b><span className="xs muted">{e.summary}</span></div>
              <button type="button" className="btn" disabled={busy} onClick={() => live(e.id, "start")}>Avvia</button></div>
          ))}
          <Link className="btn" to="/master/forgia?w=incontro">Prepara un incontro</Link>
        </>}
      </div>
      {closing && <CloseEncounter entry={closing} onDone={(updated, msgs) => {
        setClosing(null);
        if (updated) { toast("SISTEMA", msgs, { gold: true }); setLoot(null); onChanged(); }
      }} />}
    </section>
  );
}

/* ---------------- PNG ---------------- */
function NpcPanel({ board, onChanged }: { board: Board; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState("");
  async function save(id: number) {
    try {
      await api.addInteraction(id, text);
      toast("SISTEMA", ["Interazione registrata."]);
      setOpen(null); setText(""); onChanged();
    } catch (e) { toast("SISTEMA", [errorText(e)], { bad: true }); }
  }
  return (
    <section className="win pl-sec" data-sec="altro" aria-labelledby="pl-n">
      <header className="win-h" id="pl-n">PNG<span className="spacer" /><Link className="small" to="/master">Archivio</Link></header>
      <div className="win-b pl-list">
        {board.npcs.map((n) => (
          <div key={n.id} className="pl-npc">
            <div className="pl-li">
              <div className="pl-li-t"><b>{n.name}</b><span className="xs muted">{n.role} · Lv {n.level}</span></div>
              <span className={`chip ${TRUST[n.trust] ?? "muted"}`}>{n.trust}</span>
              <button type="button" className="btn ghost" aria-expanded={open === n.id} onClick={() => { setOpen(open === n.id ? null : n.id); setText(""); }}>Nota</button>
            </div>
            {open === n.id && (
              <div className="pl-note">
                <label className="pl-sr" htmlFor={`pl-note-${n.id}`}>Interazione con {n.name}</label>
                <input id={`pl-note-${n.id}`} className="input" placeholder="Cosa è successo in questa sessione" value={text} onChange={(e) => setText(e.target.value)} />
                <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => save(n.id)}>Registra</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
