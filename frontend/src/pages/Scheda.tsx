import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Character, Derived, ResourceKey } from "../api/types";
import { resourceMaxes, resourcesFor } from "../lib/resources";
import { useAppData } from "../auth/AppData";
import { useAuth } from "../auth/AuthContext";
import { EditToggle } from "../components/edit/fields";
import { HeaderEditor, ListSectionEditor, PROFILE_FIELDS, ProfileEditor, ResourcesEditor, StatsEditor, type ListKey, type ListSubset } from "../components/edit/sections";
import { Bar } from "../components/Bar";
import { DerivedLegend, DerivedRow } from "../components/DerivedRow";
import { Grade, Progress } from "../components/Grade";
import { Inventory } from "../components/Inventory";
import { activeKind, ActiveListTab, SkillsTab, TalentsTab, TitlesTab, type ActiveSection } from "../components/SheetLists";
import { RarityChip } from "../components/RarityChip";
import { SourceLegend, StatRow } from "../components/StatRow";
import { ErrorBox, InlineError, Loading } from "../components/Status";
import { Tabs, type TabDef } from "../components/Tabs";
import { Win } from "../components/Win";
import { n } from "../lib/format";
import { useBusy, useCharacter } from "../lib/useCharacter";

type TabKey = "profilo" | "titoli" | "skill" | "attive" | "incantesimi" | "miracoli" | "talenti" | "inventario" | "pet" | "maledizioni" | "quest" | "reputazione";

export function PvpChip({ flag }: { flag: string }) {
  const cls = ({ Bianco: "muted", Grigio: "warn", Rosso: "bad" } as Record<string, string>)[flag] || "muted";
  return <span className={`chip ${cls}`} title="Flag PvP">PvP {flag || "—"}</span>;
}

export function dmap(list: Derived[]): Record<string, Derived> {
  return Object.fromEntries(list.map((d) => [d.key, d]));
}

function Empty({ text = "Nessun elemento." }: { text?: string }) {
  return <div className="sc-empty muted small">{text}</div>;
}

export function Scheda() {
  const id = Number(useParams().id);
  const { char, setChar, error, reload } = useCharacter(id);
  if (error && !char) return <ErrorBox title="Scheda personaggio" message={error} action={<button className="btn" type="button" onClick={reload}>Riprova</button>} />;
  if (!char) return <Loading text="Caricamento scheda…" />;
  return <SchedaView c={char} onChange={setChar} />;
}

/** Il Master modifica ogni sezione; il giocatore resta in sola lettura sui campi del Master. */
function useIsMaster() {
  return useAuth().user?.role === "master";
}

function SchedaView({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const d = dmap(c.derived);
  return (
    <>
      <Header c={c} onChange={onChange} />
      <div className="grid-2">
        <div className="stack" style={{ gap: 20 }}>
          <ResourcesWin c={c} d={d} onChange={onChange} />
          <StatsWin c={c} onChange={onChange} />
        </div>
        <div className="stack" style={{ gap: 20 }}>
          <Win title="Statistiche derivate">
            <div className="dgrid">{c.derived.map((x) => <DerivedRow key={x.key} d={x} />)}</div>
            <DerivedLegend list={c.derived} />
          </Win>
        </div>
      </div>
      <Details c={c} onChange={onChange} />
    </>
  );
}

function Header({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const master = useIsMaster();
  const [edit, setEdit] = useState(false);
  return (
    <Win title="Finestra di stato" gold right={<>
      <span className="xs muted">{c.owner_name}</span>
      {master && <EditToggle on={edit} onClick={() => setEdit((x) => !x)} label="finestra di stato" />}
    </>}>
      {edit ? <HeaderEditor key={c.id} c={c} onChange={onChange} onClose={() => setEdit(false)} /> : (
      <div className="sc-head">
        <div className="sc-head-main">
          <h1 className="sc-name">{c.name}</h1>
          <div className="row">
            <span className="sc-sub">{c.classe}</span>
            <span className="chip gold num">Lv {c.level}</span>
            <span className="chip violet" title="Rango di potere per livello">{c.power_rank}</span>
            <PvpChip flag={c.pvp} />
          </div>
          <Bar kind="exp" label="EXP %" cur={c.exp_pct} max={100} valueText={`${n(c.exp_pct)}%`} />
        </div>
        <div className="sc-meta">
          <div className="kv"><span className="label">Regno</span><span className="v">{c.regno || "—"}</span></div>
          <div className="kv">
            <span className="label">Gilda</span><span className="v">{c.gilda?.nome || "—"}</span>
            {c.gilda?.ruolo && <span className="xs muted">{c.gilda.ruolo}</span>}
          </div>
          <div className="kv"><span className="label">Corone</span><span className="v">{n(c.corone)}</span></div>
          <div className="kv"><span className="label">Scellini</span><span className="v">{n(c.scellini)}</span></div>
        </div>
      </div>
      )}
    </Win>
  );
}

function ResourcesWin({ c, d, onChange }: { c: Character; d: Record<string, Derived>; onChange: (c: Character) => void }) {
  const { busy, error, run } = useBusy();
  const master = useIsMaster();
  const [edit, setEdit] = useState(false);

  const res = resourcesFor(d);
  const curOf = (k: ResourceKey, max: number) => c.resources[k] ?? max;  // KI mancante = al massimo

  async function move(k: ResourceKey, dir: 1 | -1) {
    const max = d[k]?.value ?? 0;
    const step = Math.max(1, Math.round(max * 0.1));
    const cur = Math.min(curOf(k, max), max);
    const next = Math.max(0, Math.min(max, cur + dir * step));
    if (next === c.resources[k]) return;
    // solo la risorsa cambiata: le altre restano quelle salvate (anche se un'altra sessione le ha modificate)
    const res = await run(() => api.patchCharacter(c.id, { resources: { [k]: next } }));
    if (res) onChange(res);
  }

  if (edit) {
    return (
      <Win title="Risorse" right={<EditToggle on onClick={() => setEdit(false)} label="risorse" />}>
        <ResourcesEditor key={c.id} c={c} max={resourceMaxes(d)} onChange={onChange} onClose={() => setEdit(false)} />
      </Win>
    );
  }

  return (
    <Win title="Risorse" right={master ? <EditToggle on={false} onClick={() => setEdit(true)} label="risorse" /> : undefined}>
      <div className="sc-res">
        {res.map(({ key: k, label, max }) => {
          const cur = curOf(k, max);
          return (
            <div className="sc-res-row" key={k}>
              <Bar kind={k} label={label} cur={Math.min(cur, max)} max={max} />
              <div className="sc-res-btns">
                <button type="button" className="btn icon" disabled={busy || cur <= 0} onClick={() => move(k, -1)}
                  aria-label={`${label}: −10%`} title="−10% del massimo">−</button>
                <button type="button" className="btn icon" disabled={busy || cur >= max} onClick={() => move(k, 1)}
                  aria-label={`${label}: +10%`} title="+10% del massimo">+</button>
              </div>
            </div>
          );
        })}
      </div>
      <InlineError message={error} />
      <p className="footnote">I bottoni spostano la risorsa del 10% del massimo e salvano subito.</p>
    </Win>
  );
}

function StatsWin({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const { rules } = useAppData();
  const master = useIsMaster();
  const [edit, setEdit] = useState(false);
  if (edit) {
    return (
      <Win title="Statistiche" right={<EditToggle on onClick={() => setEdit(false)} label="statistiche" />}>
        <StatsEditor key={c.id} c={c} onChange={onChange} onClose={() => setEdit(false)} />
      </Win>
    );
  }
  const groups = [
    { kind: "base", label: "Statistiche base" },
    { kind: "avanzata", label: "Statistiche avanzate" },
  ] as const;
  const fp = c.free_points;
  return (
    <Win title="Statistiche" right={master ? <EditToggle on={false} onClick={() => setEdit(true)} label="statistiche" /> : undefined}>
      <div>
        {groups.map((g) => {
          const rows = c.stats.filter((r) => r.kind === g.kind);
          if (!rows.length) return null;
          return (
            <div key={g.kind}>
              <div className="sgroup">{g.label}</div>
              {rows.map((r) => <StatRow key={r.code} row={r} rules={rules} />)}
            </div>
          );
        })}
      </div>
      <SourceLegend rules={rules} />
      <div className="row small">
        <span>Punti liberi level up: <b className="num">{n(fp.used)}</b> investiti / <b className="num">{n(fp.total)}</b> totali</span>
        <span className={`chip ${fp.left === 0 ? "good" : "warn"}`}>Residuo {n(fp.left)}</span>
      </div>
      {rules && <p className="footnote">Totale punti liberi = (livello − 1) × {rules.level.free_per_level}.</p>}
    </Win>
  );
}

/* ---------- Tab ---------- */
const TAB_FIELD: Record<Exclude<TabKey, "profilo">, ListKey> = {
  titoli: "titles", skill: "skills", attive: "active_skills", incantesimi: "active_skills", miracoli: "active_skills",
  talenti: "talents", inventario: "inventory", pet: "pets", maledizioni: "curses", quest: "quests", reputazione: "reputation",
};
/* Skill attive, incantesimi e miracoli sono tutti in active_skills (campo `kind`): ogni tab ne modifica solo la sua parte. */
const ACTIVE_TABS: Partial<Record<TabKey, ActiveSection>> = { attive: "Skill", incantesimi: "Incantesimo", miracoli: "Miracolo" };
function tabSubset(tab: TabKey): ListSubset | undefined {
  const kind = ACTIVE_TABS[tab];
  if (!kind) return undefined;
  return {
    match: (it) => activeKind(it as never) === kind,
    blank: kind === "Skill" ? {} : { kind, cost: "0 MP", ...(kind === "Miracolo" ? { god: "" } : { spheres: [] }) },
    noun: kind === "Skill" ? "Skill attiva" : kind,
  };
}

function Details({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const [tab, setTab] = useState<TabKey>(() => (hasProfile(c) ? "profilo" : "titoli"));
  const master = useIsMaster();
  const [edit, setEdit] = useState(false);
  const tabs: TabDef<TabKey>[] = [
    { key: "profilo", label: "Profilo" },
    { key: "titoli", label: "Titoli", count: c.titles.length },
    { key: "skill", label: "Skill", count: c.skills.length },
    { key: "attive", label: "Skill attive", count: c.active_skills.filter((s) => activeKind(s) === "Skill").length },
    { key: "incantesimi", label: "Incantesimi", count: c.active_skills.filter((s) => activeKind(s) === "Incantesimo").length },
    { key: "miracoli", label: "Miracoli", count: c.active_skills.filter((s) => activeKind(s) === "Miracolo").length },
    { key: "talenti", label: "Talenti", count: c.talents.length },
    { key: "inventario", label: "Inventario", count: c.inventory.length },
    { key: "pet", label: "Pet", count: c.pets.length },
    { key: "maledizioni", label: "Maledizioni", count: c.curses.length },
    { key: "quest", label: "Quest", count: c.quests.length },
    { key: "reputazione", label: "Reputazione", count: c.reputation.length },
  ];
  const label = tabs.find((t) => t.key === tab)?.label ?? "";
  if (edit) {
    return (
      <Win title={<>Dettagli · Modifica {label}</>} right={<EditToggle on onClick={() => setEdit(false)} label={label} />}>
        {tab === "profilo"
          ? <ProfileEditor key={c.id} c={c} onChange={onChange} onClose={() => setEdit(false)} />
          : <ListSectionEditor key={`${c.id}-${tab}`} c={c} field={TAB_FIELD[tab]} subset={tabSubset(tab)} what={label} onChange={onChange} onClose={() => setEdit(false)} />}
      </Win>
    );
  }
  return (
    <Win title="Dettagli" right={master ? <EditToggle on={false} onClick={() => setEdit(true)} label={label} /> : undefined}>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Sezioni della scheda">
        {tab === "profilo" && <TabProfilo c={c} />}
        {tab === "titoli" && <TitlesTab c={c} />}
        {tab === "skill" && <SkillsTab c={c} />}
        {ACTIVE_TABS[tab] && <ActiveListTab key={tab} c={c} kind={ACTIVE_TABS[tab]!} />}
        {tab === "talenti" && <TalentsTab c={c} />}
        {tab === "inventario" && <Inventory c={c} onChange={onChange} />}
        {tab === "pet" && <TabPet c={c} />}
        {tab === "maledizioni" && <TabMaledizioni c={c} />}
        {tab === "quest" && <TabQuest c={c} />}
        {tab === "reputazione" && <TabReputazione c={c} />}
      </Tabs>
    </Win>
  );
}

function hasProfile(c: Character) {
  return PROFILE_FIELDS.some((f) => c.profile?.[f.key]);
}

function TabProfilo({ c }: { c: Character }) {
  if (!hasProfile(c)) return <Empty text="Profilo non compilato." />;
  const group = (g: "id" | "look", title: string) => {
    const rows = PROFILE_FIELDS.filter((f) => f.group === g && c.profile[f.key]);
    if (!rows.length) return null;
    return (
      <section className="sc-prof-g" aria-label={title}>
        <h4 className="label">{title}</h4>
        <dl className="sc-prof">
          {rows.map((f) => (
            <div key={f.key} className={f.area ? "wide" : undefined}><dt className="xs muted">{f.label}</dt><dd className="small">{c.profile[f.key]}</dd></div>
          ))}
        </dl>
      </section>
    );
  };
  return <div className="sc-prof-wrap">{group("id", "Identità")}{group("look", "Aspetto")}</div>;
}

function TabPet({ c }: { c: Character }) {
  if (!c.pets.length) return <Empty text="Nessun pet." />;
  return (
    <div className="sc-cards">{c.pets.map((p, i) => (
      <article className="sc-card" key={i}>
        <div className="row"><h4>{p.name}</h4><span className="chip gold num">Lv {p.lvl}</span></div>
        <span className="small muted">{p.species}</span>
        <div className="small"><span className="label">Passiva</span> {p.passive || "—"}</div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Skill</span>
          {p.skills?.length ? p.skills.map((s, j) => (
            <div className="row small" style={{ justifyContent: "space-between" }} key={j}>
              <span>{s.name} · <Grade lvl={s.lvl} /></span><Progress pct={s.pct} />
            </div>
          )) : <span className="muted small">—</span>}
        </div>
      </article>
    ))}</div>
  );
}

function TabMaledizioni({ c }: { c: Character }) {
  if (!c.curses.length) return <Empty text="Nessuna maledizione." />;
  return (
    <div className="sc-cards">{c.curses.map((m, i) => (
      <article className="sc-card" key={i}>
        <h4>{m.name}</h4>
        <p className="small">{m.desc}</p>
        <div className="row"><span className="chip good">Bonus</span><span className="small">{m.bonus}</span></div>
        <div className="row"><span className="chip bad">Malus</span><span className="small">{m.malus}</span></div>
      </article>
    ))}</div>
  );
}

function TabQuest({ c }: { c: Character }) {
  if (!c.quests.length) return <Empty text="Nessuna quest." />;
  return (
    <ul className="sc-list">{c.quests.map((q, i) => (
      <li key={i}>
        <div className="sc-grow"><b>{q.name}</b> {q.rarity && <RarityChip rarity={q.rarity} />}<div className="xs muted">Ricompensa: {q.reward}</div></div>
        <span className="chip violet num">{q.progress}</span>
      </li>
    ))}</ul>
  );
}

function TabReputazione({ c }: { c: Character }) {
  if (!c.reputation.length) return <Empty text="Nessuna reputazione registrata." />;
  return (
    <div className="stack" style={{ gap: 16 }}>{c.reputation.map((r, i) => {
      const title = (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span><span className="label">{r.scope}</span> <b>{r.target}</b></span>
          <span className="small">{r.label}{r.range ? <> · <span className="num">{r.value > 0 ? "+" : ""}{n(r.value)}</span></> : null}</span>
        </div>
      );
      if (!r.range) return <div className="sc-rep" key={i}>{title}<span className="xs muted">Scala non numerica.</span></div>;
      const v = Math.max(-r.range, Math.min(r.range, Number(r.value) || 0));
      const w = (Math.abs(v) / r.range) * 50;
      const left = v >= 0 ? 50 : 50 - w;
      return (
        <div className="sc-rep" key={i}>
          {title}
          <div className="sc-rep-track" role="meter" aria-label={`Reputazione ${r.target}`} aria-valuemin={-r.range} aria-valuemax={r.range} aria-valuenow={v}>
            <div className={`sc-rep-fill ${v >= 0 ? "pos" : "neg"}`} style={{ left: `${left}%`, width: `${w}%` }} />
          </div>
          <div className="sc-rep-scale xs muted num"><span>−{n(r.range)}</span><span>0</span><span>+{n(r.range)}</span></div>
        </div>
      );
    })}</div>
  );
}
