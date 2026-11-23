// Tab della scheda in stile finestra di stato di Overgeared: Titoli, Skill, Skill attive, Incantesimi, Miracoli, Talenti.
// Una finestra OG per tab con un elenco compatto (una riga per voce); il dettaglio è nella finestra informativa
// che si apre al passaggio del mouse, al focus da tastiera e al tocco. Stessi pezzi dell'Inventario (og.tsx).
import { useEffect, useState, type ReactNode } from "react";
import type { ActiveSkill, Character, Skill, Talent, Title } from "../api/types";
import { useAppData } from "../auth/AppData";
import { rarityKey, romanN } from "../lib/format";
import type { Mech } from "../api/mech";
import { mechSummary } from "./mech/summary";
import { gradeRarity, initials, Kv, Mastery, OgOpts, OgRow, OgTipHead, roman, TipLayer, useOgTip } from "./og";
import { SysMsg } from "./Status";
import { Win } from "./Win";

/** Oltre questa lunghezza l'elenco ha la ricerca. */
const SEARCH_FROM = 7;

export type ActiveSection = "Skill" | "Incantesimo" | "Miracolo";
/** Tipo di una voce di `active_skills` (senza `kind` è una skill attiva). */
export function activeKind(s: ActiveSkill): ActiveSection {
  return s.kind === "Incantesimo" || s.kind === "Miracolo" ? s.kind : "Skill";
}

const signedN = (v: number) => `${v < 0 ? "−" : "+"}${Math.abs(Number(v) || 0).toLocaleString("it-IT")}`;
const bonusList = (b: Record<string, number> | undefined) => Object.entries(b || {}).filter(([, v]) => Number(v)).map(([k, v]) => `${k} ${signedN(v)}`);
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function useGradeName() {
  const { rules } = useAppData();
  return (lvl: number) => rules?.grades[(Number(lvl) || 0) - 1] ?? "";
}
function useRarityGrade() {
  const { rules } = useAppData();
  return (r: string) => rules?.rarities.find((x) => x.key === rarityKey(r))?.grade ?? 0;
}

/* ---------- Pezzi comuni delle tab ---------- */
function Search({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <input className="input og-search" type="search" placeholder={placeholder} aria-label={label} autoComplete="off"
      value={value} onChange={(e) => onChange(e.target.value)} />
  );
}

function Chips<T extends string>({ options, active, onChange, label, count, render }: {
  options: T[]; active: T; onChange: (v: T) => void; label: string; count?: (v: T) => number; render?: (v: T) => ReactNode;
}) {
  return (
    <div className="og-filters" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="btn ghost" aria-pressed={o === active} onClick={() => onChange(o)}>
          {render ? render(o) : o}{count && <span className="xs muted num"> {count(o)}</span>}
        </button>
      ))}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <><span className="inv-tsep" /><span className="inv-hint">{children}</span></>;
}

/** Distintivo «meccanica» per le abilità con meccanica strutturata: riepilogo nel tooltip. */
function MechBadge({ m }: { m?: Mech | null }) {
  if (!m) return null;
  const s = mechSummary(m);
  return <> · <span className="chip violet mc-badge" title={[s.short, ...s.lines].join("\n")}>meccanica</span></>;
}

/** Sezione «Meccanica» nella finestra informativa. */
function MechTip({ m }: { m?: Mech | null }) {
  if (!m) return null;
  const s = mechSummary(m);
  return <><div className="og-sep">Meccanica</div><OgOpts lines={s.lines.length ? s.lines : [s.short]} /></>;
}

/* ---------- Albero delle evoluzioni: la skill e, rientrate sotto, le passive dei suoi cicli ---------- */
const keyOf = (x: string) => x.trim().toLowerCase();
/** Passive di evoluzione di una skill (campo `origine`), in ordine di ciclo. */
function evoKids(skills: Skill[], parent: string): { s: Skill; i: number }[] {
  return skills.map((s, i) => ({ s, i })).filter(({ s }) => s.origine && keyOf(s.origine) === keyOf(parent))
    .sort((a, b) => (a.s.ciclo ?? 0) - (b.s.ciclo ?? 0) || a.s.name.localeCompare(b.s.name, "it"));
}
function useOpen(cid: number) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setOpen(new Set()), [cid]);
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return [open, toggle] as const;
}

/** Ramo espandibile: freccia + riga della skill; aperto mostra le passive collegate da una linea. */
function EvoBranch({ head, kids, open, onToggle, name }: { head: ReactNode; kids: ReactNode[]; open: boolean; onToggle: () => void; name: string }) {
  return (
    <div className={`og-tree${open ? " is-open" : ""}`}>
      <div className="og-tree-h">
        <button type="button" className="og-tree-t" aria-expanded={open} onClick={onToggle}
          aria-label={`${open ? "Chiudi" : "Apri"} le evoluzioni di ${name} (${kids.length})`} title={`${kids.length} ${kids.length === 1 ? "evoluzione" : "evoluzioni"}`}>
          <span className="og-tree-a" aria-hidden="true">▸</span><small className="num">{kids.length}</small>
        </button>
        {head}
      </div>
      {open && <div className="og-tree-k" role="group" aria-label={`Evoluzioni di ${name}`}>{kids}</div>}
    </div>
  );
}

/** Intestazione del ramo quando la skill di origine sta in un'altra scheda (es. un incantesimo). */
function EvoGroupHead({ name, where, lvl, cicli }: { name: string; where: string; lvl: number; cicli?: number }) {
  return (
    <div className="og-item og-row og-tree-g" data-rarity={gradeRarity(lvl || 10)}>
      <span className="og-ico" aria-hidden="true">{initials(name)}</span>
      <span className="og-iname">[{name}]</span>
      <span className="og-iqty"><span title={cycleTitle({ lvl, cicli })}>{cicli ? <small className="muted">{romanN(10 * cicli)}+</small> : null}{lvl ? roman(lvl) : ""}</span></span>
      <span className="og-imeta">{where}</span>
    </div>
  );
}

/** Riga di una passiva di evoluzione dentro il ramo. */
function evoRow(s: Skill, key: string | number, tipProps: ReturnType<ReturnType<typeof useOgTip>["bind"]>) {
  return (
    <OgRow key={key} rarity={gradeRarity(10)} icon={initials(s.name)} name={s.name}
      label={`Passiva di evoluzione ${s.name}${s.ciclo ? `, ciclo ${s.ciclo}` : ""}`}
      meta={<>Evoluzione{s.ciclo ? ` n. ${s.ciclo}` : ""} · <span className="og-good">Passiva</span><MechBadge m={s.mech} /></>}
      right={s.ciclo ? <small className="muted">ciclo {s.ciclo}</small> : null}
      tipProps={tipProps} />
  );
}

function ListBody({ rows, empty }: { rows: ReactNode[]; empty: string }) {
  return (
    <div className="og-list scroll-y">
      {rows.length ? rows : <div className="og-empty">{empty}</div>}
    </div>
  );
}

/** Ricerca per nome e reset quando cambia personaggio. */
function useQuery(cid: number) {
  const [q, setQ] = useState("");
  useEffect(() => setQ(""), [cid]);
  return [q, setQ, norm(q.trim())] as const;
}

/* ====================================================================== */
/* Titoli: [Titolo], rarità, bonus alle statistiche in verde, evoluzione   */
/* ====================================================================== */
export function TitlesTab({ c }: { c: Character }) {
  const gradeOf = useRarityGrade();
  const [q, setQ, nq] = useQuery(c.id);
  const [rar, setRar] = useState("Tutte");
  useEffect(() => setRar("Tutte"), [c.id]);
  const { tip, tipId, bind } = useOgTip<number>();
  const list = c.titles.map((t, i) => ({ t, i }));
  const rarities = ["Tutte", ...Array.from(new Set(c.titles.map((t) => t.rarity))).sort((a, b) => gradeOf(b) - gradeOf(a))];
  const activeR = rarities.includes(rar) ? rar : "Tutte";
  const shown = list
    .filter(({ t }) => activeR === "Tutte" || t.rarity === activeR)
    .filter(({ t }) => !nq || norm(t.name).includes(nq))
    .sort((a, b) => gradeOf(b.t.rarity) - gradeOf(a.t.rarity) || a.t.name.localeCompare(b.t.name, "it"));

  const total: Record<string, number> = {};
  for (const t of c.titles) for (const [k, v] of Object.entries(t.bonus || {})) total[k] = (total[k] || 0) + (Number(v) || 0);
  const totalLines = bonusList(total);
  const tipT = tip ? c.titles[tip.key] : undefined;

  return (
    <div className="og-tab">
      <Win og title="Titoli">
        <div className="og-info">
          <Kv k="Titoli posseduti">{c.titles.length}</Kv>
          <Kv k="Bonus totali" cls={totalLines.length ? "good" : ""}>{totalLines.length ? totalLines.join(" · ") : "Nessuno"}</Kv>
        </div>
        {c.titles.length >= SEARCH_FROM && (
          <div className="og-tools"><Search value={q} onChange={setQ} placeholder="Cerca un titolo…" label="Cerca tra i titoli" /></div>
        )}
        {rarities.length > 2 && (
          <Chips options={rarities} active={activeR} onChange={setRar} label="Filtra per rarità"
            count={(r) => (r === "Tutte" ? c.titles.length : c.titles.filter((t) => t.rarity === r).length)}
            render={(r) => (r === "Tutte" ? r : <span data-rarity={rarityKey(r)}>{r}</span>)} />
        )}
        <ListBody empty={c.titles.length ? "Nessun titolo trovato." : "Nessun titolo."} rows={shown.map(({ t, i }) => {
          const b = bonusList(t.bonus);
          return (
            <OgRow key={i} rarity={rarityKey(t.rarity)} icon={initials(t.name)} name={t.name}
              label={`Titolo ${t.name}, ${t.rarity}${b.length ? `, ${b.join(", ")}` : ""}`}
              meta={<>{t.rarity}{b.length > 0 && <> · <span className="og-good">{b.join(" · ")}</span></>}</>}
              tipProps={bind(i)} />
          );
        })} />
        <p className="footnote">Passa sopra un titolo (o toccalo) per la finestra del titolo. I bonus sono già sommati nella colonna Titoli delle statistiche.</p>
      </Win>
      {tip && tipT && (
        <TipLayer id={tipId} anchor={tip.el} border={`var(--r-${rarityKey(tipT.rarity)})`}><TitleTip t={tipT} /></TipLayer>
      )}
    </div>
  );
}

function TitleTip({ t }: { t: Title }) {
  const rk = rarityKey(t.rarity);
  const b = bonusList(t.bonus);
  const eff = typeof t.effect === "string" ? t.effect : t.effect?.text;
  return (
    <>
      <OgTipHead name={t.name} rarity={rk} />
      <Kv k="Rarità"><span data-rarity={rk}>{t.rarity}</span></Kv>
      <Kv k="Tipo">Titolo</Kv>
      {t.how && <Kv k="Condizione">{t.how}</Kv>}
      <div className="og-sep">Effetti</div>
      {b.length ? <OgOpts lines={b} /> : <span className="muted">Nessun bonus alle statistiche.</span>}
      {eff && <OgOpts lines={[eff]} />}
      {t.prev && <Kv k="Evoluzione di">{t.prev}</Kv>}
      {t.next && <Kv k="Evolve in">{t.next}{t.evoCond ? <span className="muted"> ({t.evoCond})</span> : null}</Kv>}
    </>
  );
}

/* ====================================================================== */
/* Skill (passive e di mestiere): Grado I–X, maestria, passiva del Grado X */
/* ====================================================================== */
type SkillSort = "grado" | "nome" | "tipo";

export function SkillsTab({ c }: { c: Character }) {
  const gradeName = useGradeName();
  const [q, setQ, nq] = useQuery(c.id);
  const [type, setType] = useState("Tutti");
  const [sort, setSort] = useState<SkillSort>("grado");
  useEffect(() => { setType("Tutti"); }, [c.id]);
  const { tip, tipId, bind } = useOgTip<number>();
  const types = ["Tutti", ...Array.from(new Set(c.skills.map((s) => s.type || "—")))];
  const activeT = types.includes(type) ? type : "Tutti";
  const pctN = (s: Skill) => (s.pct === "MAX" ? 100 : Number(s.pct) || 0);
  const shown = c.skills.map((s, i) => ({ s, i }))
    .filter(({ s }) => activeT === "Tutti" || (s.type || "—") === activeT)
    .filter(({ s }) => !nq || norm(s.name).includes(nq) || norm(s.type || "").includes(nq))
    .sort((a, b) => sort === "nome" ? a.s.name.localeCompare(b.s.name, "it")
      : sort === "tipo" ? (a.s.type || "").localeCompare(b.s.type || "", "it") || b.s.lvl - a.s.lvl
        : b.s.lvl - a.s.lvl || pctN(b.s) - pctN(a.s) || a.s.name.localeCompare(b.s.name, "it"));
  const maxed = c.skills.filter((s) => s.lvl >= 10).length;
  const tipS = tip ? c.skills[tip.key] : undefined;
  const [open, toggle] = useOpen(c.id);
  // Albero solo con «Tutti» e senza ricerca: le passive di evoluzione stanno sotto la loro skill
  const tree = activeT === "Tutti" && !nq;
  const own = new Set(c.skills.map((s) => keyOf(s.name)));
  const isKid = (s: Skill) => !!s.origine;
  const skillRow = (s: Skill, i: number) => (
    <OgRow key={i} rarity={gradeRarity(s.lvl)} icon={initials(s.name)} name={s.name}
      label={`Skill ${s.name}, Grado ${roman(s.lvl)} ${gradeName(s.lvl)}, maestria ${s.pct === "MAX" ? "massima" : `${s.pct}%`}`}
      meta={<>{s.type || "—"} · {gradeName(s.lvl) || `Grado ${roman(s.lvl)}`}{s.passive ? <> · <span className="og-good">Passiva</span></> : null}<MechBadge m={s.mech} /></>}
      right={<><span title={cycleTitle(s)}>{s.cicli ? <small className="muted">{romanN(10 * s.cicli)}+</small> : null}{roman(s.lvl)}</span><Mastery pct={s.pct} /></>}
      tipProps={bind(i)} />
  );
  const rows: ReactNode[] = [];
  if (tree) {
    // Rami con la skill di origine in un'altra scheda (incantesimi, skill attive): in cima
    const away = Array.from(new Set(c.skills.filter((s) => s.origine && !own.has(keyOf(s.origine))).map((s) => s.origine as string)));
    for (const name of away) {
      const parent = c.active_skills.find((a) => keyOf(a.name) === keyOf(name));
      const kids = evoKids(c.skills, name);
      rows.push(<EvoBranch key={`g-${name}`} name={name} open={open.has(`g-${name}`)} onToggle={() => toggle(`g-${name}`)}
        head={<EvoGroupHead name={parent?.name ?? name} lvl={parent?.lvl ?? 0} cicli={parent?.cicli}
          where={parent ? `${parent.kind === "Incantesimo" ? "Incantesimo" : parent.kind === "Miracolo" ? "Miracolo" : "Skill attiva"} · ${kids.length} evoluzioni` : "Skill di origine non trovata"} />}
        kids={kids.map(({ s, i }) => evoRow(s, i, bind(i)))} />);
    }
    for (const { s, i } of shown) {
      if (isKid(s)) continue; // sta nel ramo della sua skill
      const kids = evoKids(c.skills, s.name);
      rows.push(kids.length
        ? <EvoBranch key={i} name={s.name} open={open.has(String(i))} onToggle={() => toggle(String(i))} head={skillRow(s, i)}
          kids={kids.map((k) => evoRow(k.s, k.i, bind(k.i)))} />
        : skillRow(s, i));
    }
  } else {
    for (const { s, i } of shown) rows.push(skillRow(s, i));
  }

  return (
    <div className="og-tab">
      <Win og title="Skill">
        <div className="og-pair">
          <Kv k="Skill">{c.skills.length}</Kv>
          <Kv k="Al Grado X">{maxed}</Kv>
          <Kv k="Passive sbloccate">{c.skills.filter((s) => s.passive).length}</Kv>
        </div>
        {c.skills.length >= SEARCH_FROM && (
          <div className="og-tools">
            <Search value={q} onChange={setQ} placeholder="Cerca una skill…" label="Cerca tra le skill" />
            <label className="og-sortsel small"><span className="label">Ordina</span>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SkillSort)}>
                <option value="grado">Grado</option><option value="nome">Nome</option><option value="tipo">Tipo</option>
              </select>
            </label>
          </div>
        )}
        {types.length > 2 && (
          <Chips options={types} active={activeT} onChange={setType} label="Filtra per tipo"
            count={(t) => (t === "Tutti" ? c.skills.length : c.skills.filter((s) => (s.type || "—") === t).length)} />
        )}
        <ListBody empty={c.skills.length ? "Nessuna skill trovata." : "Nessuna skill."} rows={rows} />
        <p className="footnote">Grado di maestria da I a X: al 100% la skill sale di grado. Passa sopra una skill (o toccala) per i dettagli.</p>
      </Win>
      {tip && tipS && (
        <TipLayer id={tipId} anchor={tip.el} border={`var(--r-${gradeRarity(tipS.lvl)})`}><SkillTip s={tipS} gradeName={gradeName} /></TipLayer>
      )}
    </div>
  );
}

/** Cicli di 10 Gradi completati: livello totale e passive ottenute a ogni Grado X. */
function cycleTitle(s: { lvl: number; cicli?: number }): string | undefined {
  return s.cicli ? `Livello ${s.cicli * 10 + (Number(s.lvl) || 0)}: ${s.cicli} ${s.cicli === 1 ? "ciclo completato" : "cicli completati"} + Grado ${roman(s.lvl)}` : undefined;
}
function CycleKv({ s }: { s: { lvl: number; cicli?: number; evoluzioni?: { ciclo: number; passiva: string }[] } }) {
  if (!s.cicli) return null;
  return (
    <>
      <Kv k="Livello">{s.cicli * 10 + (Number(s.lvl) || 0)} <span className="muted">· {s.cicli} {s.cicli === 1 ? "ciclo" : "cicli"} + {roman(s.lvl)}</span></Kv>
      {s.evoluzioni?.length ? <Kv k="Evoluzioni">{s.evoluzioni.map((e) => e.passiva).join(", ")}</Kv> : null}
    </>
  );
}

function GradeKv({ lvl, gradeName }: { lvl: number; gradeName: (l: number) => string }) {
  return <Kv k="Grado"><span data-rarity={gradeRarity(lvl)}>{roman(lvl)}</span>{gradeName(lvl) && <> · {gradeName(lvl)}</>}</Kv>;
}

function SkillTip({ s, gradeName }: { s: Skill; gradeName: (l: number) => string }) {
  return (
    <>
      <OgTipHead name={s.name} rarity={gradeRarity(s.lvl)} />
      <GradeKv lvl={s.lvl} gradeName={gradeName} />
      <CycleKv s={s} />
      <Kv k="Maestria"><Mastery pct={s.pct} /></Kv>
      <Kv k="Tipo">Passiva{s.type ? ` · ${s.type}` : ""}</Kv>
      <div className="og-sep">Passiva del Grado X</div>
      {s.passive ? <OgOpts lines={[s.passive]} />
        : <span className="muted">{s.lvl >= 10 ? "Nessuna passiva registrata." : `Si sblocca al Grado X (ora ${roman(s.lvl)}).`}</span>}
      <MechTip m={s.mech} />
      <Hint>Le skill passive non hanno costo né cooldown.</Hint>
    </>
  );
}

/* ====================================================================== */
/* Skill attive, incantesimi e miracoli: costo, cooldown, effetto          */
/* ====================================================================== */
const ACTIVE_TEXT: Record<ActiveSection, { title: string; one: string; empty: string; search: string; type: string }> = {
  Skill: { title: "Skill attive", one: "Skill attiva", empty: "Nessuna skill attiva.", search: "Cerca una skill attiva…", type: "Attiva" },
  Incantesimo: { title: "Incantesimi", one: "Incantesimo", empty: "Nessun incantesimo nel grimorio.", search: "Cerca un incantesimo…", type: "Incantesimo (attivo)" },
  Miracolo: { title: "Miracoli", one: "Miracolo", empty: "Nessun miracolo concesso.", search: "Cerca un miracolo…", type: "Miracolo (attivo)" },
};

export function ActiveListTab({ c, kind }: { c: Character; kind: ActiveSection }) {
  const gradeName = useGradeName();
  const [q, setQ, nq] = useQuery(c.id);
  const { tip, tipId, bind } = useOgTip<string>();
  const [open, toggle] = useOpen(c.id);
  const T = ACTIVE_TEXT[kind];
  const all = c.active_skills.map((s, i) => ({ s, i })).filter(({ s }) => activeKind(s) === kind);
  const shown = all.filter(({ s }) => !nq || norm(s.name).includes(nq) || norm(s.effect || "").includes(nq)
    || (s.spheres || []).some((x) => norm(x).includes(nq)) || norm(s.god || "").includes(nq));
  const spheres = Array.from(new Set(all.flatMap(({ s }) => s.spheres || [])));
  const gods = Array.from(new Set(all.map(({ s }) => s.god).filter(Boolean) as string[]));
  const tipS = tip && tip.key.startsWith("a") ? c.active_skills[Number(tip.key.slice(1))] : undefined;
  const tipK = tip && tip.key.startsWith("s") ? c.skills[Number(tip.key.slice(1))] : undefined;

  return (
    <div className="og-tab">
      <Win og title={T.title}>
        <div className="og-info">
          <Kv k={T.title}>{all.length}</Kv>
          {spheres.length > 0 && <Kv k="Sfere">{spheres.join(", ")}</Kv>}
          {gods.length > 0 && <Kv k="Divinità">{gods.join(", ")}</Kv>}
        </div>
        {all.length >= SEARCH_FROM && (
          <div className="og-tools"><Search value={q} onChange={setQ} placeholder={T.search} label={`Cerca tra ${T.title.toLowerCase()}`} /></div>
        )}
        <ListBody empty={all.length ? "Nessun risultato." : T.empty} rows={shown.map(({ s, i }) => {
          const extra = kind === "Incantesimo" ? (s.spheres || []).join(" + ") : kind === "Miracolo" ? s.god : "";
          const row = (
            <OgRow key={i} rarity={gradeRarity(s.lvl)} icon={initials(s.name)} name={s.name}
              label={`${T.one} ${s.name}, Grado ${roman(s.lvl)}, costo ${s.cost || "nessuno"}, cooldown ${s.cd} turni`}
              meta={<>{s.cost || "—"} · CD {s.cd}{extra ? ` · ${extra}` : ""}<MechBadge m={s.mech} /></>}
              right={<><span title={cycleTitle(s)}>{s.cicli ? <small className="muted">{romanN(10 * s.cicli)}+</small> : null}{roman(s.lvl)}</span><Mastery pct={s.pct} /></>}
              tipProps={bind(`a${i}`)} />
          );
          const kids = evoKids(c.skills, s.name);
          return kids.length
            ? <EvoBranch key={i} name={s.name} open={open.has(String(i))} onToggle={() => toggle(String(i))} head={row}
              kids={kids.map((k) => evoRow(k.s, `s${k.i}`, bind(`s${k.i}`)))} />
            : row;
        })} />
        <p className="footnote">Cooldown in turni. Passa sopra una voce (o toccala) per i dettagli.</p>
      </Win>
      {tip && tipS && (
        <TipLayer id={tipId} anchor={tip.el} border={`var(--r-${gradeRarity(tipS.lvl)})`}>
          <ActiveTip s={tipS} type={T.type} gradeName={gradeName} />
        </TipLayer>
      )}
      {tip && tipK && (
        <TipLayer id={tipId} anchor={tip.el} border={`var(--r-${gradeRarity(10)})`}><SkillTip s={tipK} gradeName={gradeName} /></TipLayer>
      )}
    </div>
  );
}

function ActiveTip({ s, type, gradeName }: { s: ActiveSkill; type: string; gradeName: (l: number) => string }) {
  return (
    <>
      <OgTipHead name={s.name} rarity={gradeRarity(s.lvl)} />
      <GradeKv lvl={s.lvl} gradeName={gradeName} />
      <CycleKv s={s} />
      <Kv k="Maestria"><Mastery pct={s.pct} /></Kv>
      <Kv k="Tipo">{type}</Kv>
      <div className="og-pair">
        <Kv k="Costo"><span className="num">{s.cost || "—"}</span></Kv>
        <Kv k="Cooldown"><span className="num">{s.cd} {Number(s.cd) === 1 ? "turno" : "turni"}</span></Kv>
      </div>
      {s.spheres && s.spheres.length > 0 && <Kv k="Sfere">{s.spheres.join(", ")}</Kv>}
      {s.god && <Kv k="Divinità">{s.god}</Kv>}
      <div className="og-sep">Effetto</div>
      {s.effect ? <OgOpts lines={[s.effect]} /> : <span className="muted">Nessun effetto descritto.</span>}
      <MechTip m={s.mech} />
    </>
  );
}

/* ====================================================================== */
/* Talenti: rarità, origine, effetto, evoluzione                           */
/* ====================================================================== */
const isEvolving = (t: Talent) => /evolutiv/i.test(`${t.origin} ${t.effect}`);

export function TalentsTab({ c }: { c: Character }) {
  const { rules } = useAppData();
  const every = rules?.level.talent_every;
  const [q, setQ, nq] = useQuery(c.id);
  const { tip, tipId, bind } = useOgTip<number>();
  const shown = c.talents.map((t, i) => ({ t, i })).filter(({ t }) => !nq || norm(t.name).includes(nq) || norm(t.effect || "").includes(nq));
  const tipT = tip ? c.talents[tip.key] : undefined;
  return (
    <div className="og-tab">
      <SysMsg lines={[`Prossimo talento al Lv ${c.next_talent_level}${every ? ` (ogni ${every} livelli)` : ""}.`]} />
      <Win og title="Talenti">
        <div className="og-info"><Kv k="Talenti">{c.talents.length}</Kv></div>
        {c.talents.length >= SEARCH_FROM && (
          <div className="og-tools"><Search value={q} onChange={setQ} placeholder="Cerca un talento…" label="Cerca tra i talenti" /></div>
        )}
        <ListBody empty={c.talents.length ? "Nessun talento trovato." : "Nessun talento."} rows={shown.map(({ t, i }) => (
          <OgRow key={i} rarity={rarityKey(t.rarity)} icon={initials(t.name)} name={t.name}
            label={`Talento ${t.name}, ${t.rarity}, ${t.origin}${isEvolving(t) ? ", evolutivo" : ""}`}
            meta={<>{t.rarity} · {t.origin || "—"}<MechBadge m={t.mech} />{t.effect ? ` · ${t.effect}` : ""}</>}
            right={isEvolving(t) ? <span className="og-v xs">EVO</span> : undefined}
            tipProps={bind(i)} />
        ))} />
      </Win>
      {tip && tipT && (
        <TipLayer id={tipId} anchor={tip.el} border={`var(--r-${rarityKey(tipT.rarity)})`}><TalentTip t={tipT} /></TipLayer>
      )}
    </div>
  );
}

function TalentTip({ t }: { t: Talent }) {
  const rk = rarityKey(t.rarity);
  const evo = isEvolving(t);
  return (
    <>
      <OgTipHead name={t.name} rarity={rk} />
      <Kv k="Rarità"><span data-rarity={rk}>{t.rarity}</span></Kv>
      <Kv k="Tipo">Talento{evo ? " evolutivo" : ""}</Kv>
      {t.origin && <Kv k="Origine">{t.origin}</Kv>}
      <div className="og-sep">Effetto</div>
      {t.effect ? <OgOpts lines={t.effect.split(/(?<=\.)\s+/).filter(Boolean)} /> : <span className="muted">Nessun effetto descritto.</span>}
      <MechTip m={t.mech} />
      {evo && <Kv k="Evoluzione">Cresce evolvendo</Kv>}
    </>
  );
}
