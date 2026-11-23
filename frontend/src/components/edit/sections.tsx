// Moduli di modifica della scheda per il Master. Ogni modulo salva solo il proprio campo con PATCH /characters/{id}.
import { useState, type ReactNode } from "react";
import { api } from "../../api/client";
import type { Character, Profile, Pvp, ResourceKey, Resources, RulesConfig, StatRow } from "../../api/types";
import { useAppData } from "../../auth/AppData";
import { n, ROMAN } from "../../lib/format";
import { RESOURCE_DEFS } from "../../lib/resources";
import { useBusy } from "../../lib/useCharacter";
import { useToast } from "../Toast";
import { EditActions, NumField, SelectField, TextField } from "./fields";
import { ListEditor, type FieldDef, type Item, type ListDef } from "./ListEditor";

/** Bozza locale + Salva/Annulla. `toPatch` trasforma la bozza nel corpo del PATCH. */
function SectionForm<T>({ c, init, toPatch, onChange, onClose, what, children }: {
  c: Character; init: (c: Character) => T; toPatch: (d: T) => Record<string, unknown>;
  onChange: (c: Character) => void; onClose: () => void; what: string;
  children: (d: T, set: (d: T) => void) => ReactNode;
}) {
  const [start] = useState(() => init(c));
  const [draft, setDraft] = useState<T>(start);
  const { busy, error, run } = useBusy();
  const toast = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);

  async function save() {
    const res = await run(() => api.patchCharacter(c.id, toPatch(draft)));
    if (res) {
      onChange(res);
      toast("SISTEMA", [`${what}: modifiche salvate.`]);
      onClose();
    }
  }

  return (
    <div className="ed-form">
      {children(draft, setDraft)}
      <EditActions busy={busy} dirty={dirty} error={error} onSave={save} onCancel={onClose} />
    </div>
  );
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
type Props = { c: Character; onChange: (c: Character) => void; onClose: () => void };

/* ---------- Intestazione: livello, EXP, regno, PvP, gilda, monete ---------- */
interface HeadDraft { level: number; exp_pct: number; regno: string; pvp: Pvp; gilda: { nome: string; ruolo: string }; corone: number; scellini: number }

export function HeaderEditor(p: Props) {
  const { rules } = useAppData();
  const kingdoms = (rules?.kingdoms ?? []).map((k) => ({ value: k.name, label: k.name }));
  return (
    <SectionForm<HeadDraft> {...p} what="Finestra di stato"
      init={(c) => ({ level: c.level, exp_pct: c.exp_pct, regno: c.regno, pvp: c.pvp, gilda: { ...c.gilda }, corone: c.corone, scellini: c.scellini })}
      toPatch={(d) => ({ ...d })}>
      {(d, set) => (
        <div className="ed-grid">
          <NumField label="Livello" value={d.level} int min={1} onChange={(v) => set({ ...d, level: v })}
            hint="Cambia solo il livello: la colonna Level up delle statistiche si modifica a parte" />
          <NumField label="EXP %" value={d.exp_pct} min={0} max={100} onChange={(v) => set({ ...d, exp_pct: v })} />
          <SelectField label="Regno" value={d.regno} options={kingdoms} onChange={(v) => set({ ...d, regno: v })} />
          <SelectField label="PvP" value={d.pvp} options={["Bianco", "Grigio", "Rosso"].map((x) => ({ value: x, label: x }))}
            onChange={(v) => set({ ...d, pvp: v as Pvp })} />
          <TextField label="Gilda" value={d.gilda.nome} onChange={(v) => set({ ...d, gilda: { ...d.gilda, nome: v } })} />
          <TextField label="Ruolo in gilda" value={d.gilda.ruolo} onChange={(v) => set({ ...d, gilda: { ...d.gilda, ruolo: v } })} />
          <NumField label="Corone" value={d.corone} int min={0} onChange={(v) => set({ ...d, corone: v })} />
          <NumField label="Scellini" value={d.scellini} int min={0} onChange={(v) => set({ ...d, scellini: v })} />
        </div>
      )}
    </SectionForm>
  );
}

/* ---------- Profilo: identità, alleanze, aspetto (solo testo) ---------- */
export const PROFILE_FIELDS: { key: keyof Profile; label: string; area?: boolean; group: "id" | "look" }[] = [
  { key: "razza", label: "Razza / Specie", group: "id" },
  { key: "eta", label: "Età", group: "id" },
  { key: "sesso", label: "Sesso", group: "id" },
  { key: "patria", label: "Patria / Regno d'origine", group: "id" },
  { key: "alleanze", label: "Alleanze e legami", area: true, group: "id" },
  { key: "capelli", label: "Capelli", area: true, group: "look" },
  { key: "occhi", label: "Occhi", area: true, group: "look" },
  { key: "statura", label: "Statura e corporatura", group: "look" },
  { key: "abbigliamento", label: "Vestiti / Armatura", area: true, group: "look" },
  { key: "segni", label: "Segni particolari", area: true, group: "look" },
];

export function ProfileEditor(p: Props) {
  return (
    <SectionForm<Profile> {...p} what="Profilo" init={(c) => ({ ...c.profile })} toPatch={(d) => ({ profile: d })}>
      {(d, set) => (
        <div className="ed-grid">
          {PROFILE_FIELDS.map((f) => (
            <TextField key={f.key} label={f.label} area={f.area} value={d[f.key]} onChange={(v) => set({ ...d, [f.key]: v })} />
          ))}
        </div>
      )}
    </SectionForm>
  );
}

/* ---------- Risorse ---------- */
export function ResourcesEditor(p: Props & { max: Partial<Record<ResourceKey, number>> }) {
  // KI solo se il PG ha la statistica (il server calcola la derivata "ki"); se manca parte dal massimo
  const defs = RESOURCE_DEFS.filter((r) => p.max[r.key] != null);
  const init = (c: Character): Resources =>
    ({ ...c.resources, ...(p.max.ki != null ? { ki: c.resources.ki ?? p.max.ki } : {}) });
  return (
    <SectionForm<Resources> {...p} what="Risorse" init={init} toPatch={(d) => ({ resources: d })}>
      {(d, set) => (
        <>
          <div className="ed-grid">
            {defs.map(({ key: k, label }) => (
              <NumField key={k} label={`${label} / ${n(p.max[k]!)}`} value={d[k] ?? 0} min={0} max={p.max[k]!} onChange={(v) => set({ ...d, [k]: v })} />
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => set({ ...d, ...p.max } as Resources)}>Tutto al massimo</button>
          </div>
        </>
      )}
    </SectionForm>
  );
}

/* ---------- Statistiche ---------- */
const COMPUTED = new Set(["oggetti"]);

function sourceDefs(rules: RulesConfig | null) {
  const list = rules?.sources ?? [];
  return list.length ? list : (["iniziale", "creazione", "investiti", "levelup", "altro", "titoli"] as const).map((k) => ({ key: k, label: k, help: "" }));
}

function rowTotal(r: Item, keys: string[]) {
  return keys.reduce((s, k) => s + (Number(r[k]) || 0), 0) + (Number(r.oggetti) || 0);
}

export function StatsEditor(p: Props) {
  const { rules } = useAppData();
  const srcs = sourceDefs(rules).filter((s) => !COMPUTED.has(s.key));
  const keys = srcs.map((s) => s.key as string);
  const base = new Set(["STR", "DEX", "VIT", "INT"]);
  const known = new Set(p.c.stats.map((r) => r.code));
  const def: ListDef = {
    noun: "Statistica avanzata",
    nameKey: "code",
    blank: () => ({ code: "", name: "", kind: "avanzata", ...Object.fromEntries(keys.map((k) => [k, 0])), note: null }),
    summary: (r) => <>{r.name} · <b className="num gold-t">{n(rowTotal(r, keys))}</b></>,
    canRemove: (r) => !base.has(r.code),
    fields: [],
    fieldsFor: (r) => {
      const f: FieldDef[] = [];
      if (!known.has(r.code) || !r.code) f.push({ key: "code", label: "Codice", kind: "text", hint: "2–5 lettere maiuscole, es. FED" });
      f.push({ key: "name", label: "Nome", kind: "text" });
      f.push(...srcs.map((s): FieldDef => ({ key: s.key, label: s.label, kind: "num", hint: s.help })));
      if ("oggetti" in r) f.push({ key: "oggetti", label: "Oggetti", kind: "static", hint: "Calcolata dagli oggetti equipaggiati", render: (x) => n(Number(x.oggetti) || 0) });
      f.push({ key: "total", label: "Totale", kind: "static", render: (x) => <b className="gold-t">{n(rowTotal(x, keys))}</b> });
      f.push({ key: "note", label: "Nota", kind: "area" });
      return f;
    },
  };
  return (
    <SectionForm<Item[]> {...p} what="Statistiche" init={(c) => clone(c.stats) as Item[]}
      toPatch={(d) => ({
        stats: d.map((r) => {
          const { total: _t, ...rest } = r;
          void _t;
          return { ...rest, code: String(rest.code || "").trim().toUpperCase(), note: rest.note || null };
        }),
      })}>
      {(d, set) => (
        <>
          <ListEditor items={d} onChange={set} def={def} />
          <p className="footnote">«Oggetti» è calcolata dagli oggetti equipaggiati e non si modifica. Le risorse correnti scendono al nuovo massimo se serve.</p>
        </>
      )}
    </SectionForm>
  );
}

/* ---------- Liste dei tab ---------- */
/* Tipi di equipaggiamento (backend/app/rules.py, EQUIP_TYPES) */
const EQUIP_TYPE_OPTIONS = ["", "elmo", "amuleto", "spallacci", "mantello", "corazza", "bracciali", "guanti", "cintura", "gambali",
  "stivali", "anello", "ninnolo", "unaMano", "manoPrincipale", "dueMani", "scudo", "tenuto"];

export type ListKey = "titles" | "skills" | "active_skills" | "talents" | "inventory" | "pets" | "curses" | "quests" | "reputation";

const pctText = (p: unknown) => (p === "MAX" ? "MAX" : `${Number(p) || 0}%`);
const gradeText = (l: unknown) => `Grado ${ROMAN[Number(l)] ?? l}`;
const skillFields: FieldDef[] = [
  { key: "name", label: "Nome", kind: "text" },
  { key: "lvl", label: "Grado", kind: "grade" },
  { key: "pct", label: "%", kind: "pct" },
];

function listDefs(c: Character): Record<ListKey, ListDef> {
  const codes = c.stats.map((s: StatRow) => s.code);
  const dkeys = c.derived.map((d) => d.key);
  return {
    titles: {
      noun: "Titolo", blank: () => ({ name: "", rarity: "Comune", bonus: {} }),
      summary: (t) => <>{t.rarity}{Object.keys(t.bonus || {}).length ? ` · ${Object.entries(t.bonus).map(([k, v]) => `${k} ${Number(v) >= 0 ? "+" : ""}${v}`).join(", ")}` : ""}</>,
      fields: [
        { key: "name", label: "Nome", kind: "text" },
        { key: "rarity", label: "Rarità", kind: "rarity" },
        { key: "bonus", label: "Bonus alle statistiche", kind: "map", mapKeys: codes, hint: "Riportali anche nella colonna Titoli delle statistiche" },
      ],
    },
    skills: {
      noun: "Skill", blank: () => ({ name: "", lvl: 1, pct: 0, type: "", passive: null }),
      summary: (s) => <>{s.type || "—"} · {gradeText(s.lvl)} · {pctText(s.pct)}</>,
      fields: [...skillFields, { key: "type", label: "Tipo", kind: "text", hint: "Craft, Combat, Utility…" }, { key: "passive", label: "Passiva", kind: "area" }],
    },
    active_skills: {
      noun: "Skill attiva", blank: () => ({ name: "", effect: "", lvl: 1, pct: 0, cost: "", cd: 0 }),
      summary: (s) => <>{gradeText(s.lvl)} · {pctText(s.pct)} · {s.cost || "—"} · CD {s.cd}</>,
      fields: [...skillFields, { key: "cost", label: "Costo", kind: "text", hint: "es. 20 MP" },
        { key: "cd", label: "Cooldown (turni)", kind: "int", min: 0 },
        { key: "kind", label: "Tipo", kind: "select", options: ["", "Skill", "Incantesimo", "Miracolo"],
          hint: "Decide il tab: Skill attive, Incantesimi o Miracoli (vuoto = skill attiva)" },
        { key: "god", label: "Divinità", kind: "text", when: (s) => s.kind === "Miracolo" || !!s.god },
        { key: "spheres", label: "Sfere", kind: "static", when: (s) => Array.isArray(s.spheres) && s.spheres.length > 0,
          render: (s) => (s.spheres as string[]).join(", "), hint: "Dalla Forgia (wizard Incantesimo)" },
        { key: "effect", label: "Effetto", kind: "area" }],
    },
    talents: {
      noun: "Talento", blank: () => ({ name: "", rarity: "Comune", origin: `Lvl ${String(c.level).padStart(2, "0")}`, effect: "" }),
      summary: (t) => <>{t.rarity} · {t.origin || "—"}</>,
      fields: [{ key: "name", label: "Nome", kind: "text" }, { key: "rarity", label: "Rarità", kind: "rarity" },
        { key: "origin", label: "Origine", kind: "text" }, { key: "effect", label: "Effetto", kind: "area" }],
    },
    inventory: {
      noun: "Oggetto", blank: () => ({ name: "", rarity: "Comune", type: "", equip_type: "", qty: 1, weight: 0, stats: {}, bonus: {}, req: {}, stats_text: "" }),
      summary: (i) => <>{i.rarity} · {i.type || "—"} · ×{n(Number(i.qty) || 0)}</>,
      fields: [
        { key: "name", label: "Nome", kind: "text" }, { key: "rarity", label: "Rarità", kind: "rarity" },
        { key: "type", label: "Tipo", kind: "text" },
        { key: "equip_type", label: "Tipo di equipaggiamento", kind: "select", options: EQUIP_TYPE_OPTIONS,
          hint: "Decide gli slot del manichino (vuoto = non indossabile). Un oggetto indossato si sposta dal tab Inventario." },
        { key: "qty", label: "Quantità", kind: "int", min: 0 }, { key: "weight", label: "Peso unitario (kg)", kind: "num", min: 0 },
        { key: "stats", label: "Stats", kind: "area", when: (i) => typeof i.stats !== "object" || i.stats === null },
        { key: "stats_text", label: "Descrizione stats", kind: "area", when: (i) => "stats_text" in i },
        { key: "stats", label: "Bonus alle statistiche", kind: "map", mapKeys: codes, when: (i) => typeof i.stats === "object" && i.stats !== null,
          hint: "Equipaggiato, finisce nella colonna Oggetti" },
        { key: "bonus", label: "Bonus alle derivate", kind: "map", mapKeys: dkeys, when: (i) => "bonus" in i },
        { key: "weapon_base", label: "Danno base (armi)", kind: "num", min: 0, when: (i) => ["unaMano", "manoPrincipale", "dueMani"].includes(String(i.equip_type || "")) },
        { key: "req", label: "Requisiti", kind: "map", mapKeys: ["level", ...codes], when: (i) => !!i.equip_type,
          hint: "Livello e statistiche minime: se mancano l'oggetto non si equipaggia" },
        { key: "desc", label: "Descrizione", kind: "area" },
      ],
    },
    pets: {
      noun: "Pet", blank: () => ({ name: "", species: "", lvl: 1, passive: "", skills: [] }),
      summary: (p) => <>{p.species || "—"} · Lv {p.lvl} · {(p.skills || []).length} skill</>,
      fields: [
        { key: "name", label: "Nome", kind: "text" }, { key: "species", label: "Specie", kind: "text" },
        { key: "lvl", label: "Livello", kind: "int", min: 1 }, { key: "passive", label: "Passiva", kind: "text" },
        { key: "skills", label: "Skill del pet", kind: "sublist",
          sub: { noun: "Skill", blank: () => ({ name: "", lvl: 1, pct: 0 }), summary: (s) => <>{gradeText(s.lvl)} · {pctText(s.pct)}</>, fields: skillFields } },
      ],
    },
    curses: {
      noun: "Maledizione", blank: () => ({ name: "", desc: "", bonus: "", malus: "" }),
      summary: (m) => <>{m.malus || m.desc || ""}</>,
      fields: [{ key: "name", label: "Nome", kind: "text" }, { key: "desc", label: "Descrizione", kind: "area" },
        { key: "bonus", label: "Bonus", kind: "area" }, { key: "malus", label: "Malus", kind: "area" }],
    },
    quests: {
      noun: "Quest", blank: () => ({ name: "", progress: "", reward: "", rarity: "Comune" }),
      summary: (q) => <>{q.rarity || "—"} · {q.progress || "—"}</>,
      fields: [{ key: "name", label: "Nome", kind: "text" }, { key: "rarity", label: "Rarità", kind: "rarityOpt" },
        { key: "progress", label: "Progresso", kind: "text", hint: "es. 2/3 indizi" }, { key: "reward", label: "Ricompensa", kind: "area" }],
    },
    reputation: {
      noun: "Reputazione", nameKey: "target", blank: () => ({ scope: "PNG", target: "", value: 0, range: 10, label: "Neutrale" }),
      summary: (r) => <>{r.scope} · {r.label}{Number(r.range) ? ` · ${Number(r.value) > 0 ? "+" : ""}${n(Number(r.value) || 0)}/${n(Number(r.range))}` : ""}</>,
      fields: [
        { key: "target", label: "Verso", kind: "text" },
        { key: "scope", label: "Ambito", kind: "text", hint: "Regionale, Gruppo, PNG, Cosmica…" },
        { key: "value", label: "Valore", kind: "num" }, { key: "range", label: "Scala ±", kind: "num", min: 0, hint: "0 = scala non numerica" },
        { key: "label", label: "Etichetta", kind: "text", hint: "es. Benvoluto, Fiducia" },
      ],
    },
  };
}

/** Parte di una lista modificata da sola (es. gli incantesimi dentro `active_skills`): le altre voci restano
    al loro posto, le voci nuove prendono i campi di `blank`. */
export interface ListSubset { match: (it: Item) => boolean; blank?: Item; noun?: string }

function mergeSubset(all: Item[], edited: Item[], match: (it: Item) => boolean): Item[] {
  const queue = [...edited];
  const out: Item[] = [];
  for (const it of all) {
    if (!match(it)) out.push(it);
    else if (queue.length) out.push(queue.shift()!);
  }
  return [...out, ...queue];
}

export function ListSectionEditor({ field, what, subset, ...p }: Props & { field: ListKey; what: string; subset?: ListSubset }) {
  const base = listDefs(p.c)[field];
  const def: ListDef = subset
    ? { ...base, noun: subset.noun ?? base.noun, blank: () => ({ ...base.blank(), ...(subset.blank ?? {}) }) }
    : base;
  const all = (p.c[field] ?? []) as Item[];
  return (
    <SectionForm<Item[]> {...p} what={what}
      init={(c) => clone((c[field] as Item[]).filter((it) => !subset || subset.match(it)))}
      toPatch={(d) => ({ [field]: subset ? mergeSubset(all, d, subset.match) : d })}>
      {(d, set) => <ListEditor items={d} onChange={set} def={def} />}
    </SectionForm>
  );
}
