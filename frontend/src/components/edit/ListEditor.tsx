// Editor generico per le liste della scheda (titoli, skill, talenti, oggetti, pet…).
// Righe compatte con riepilogo; il dettaglio si apre sul posto. I campi non previsti restano intatti.
import { useRef, useState, type ReactNode } from "react";
import { GradeField, MapField, NumField, PctField, RarityField, SelectField, TextField } from "./fields";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Item = Record<string, any>;

export interface FieldDef {
  key: string;
  label: string;
  kind: "text" | "area" | "num" | "int" | "rarity" | "rarityOpt" | "grade" | "pct" | "map" | "select" | "sublist" | "static";
  options?: string[];
  min?: number;
  max?: number;
  mapKeys?: string[];
  sub?: ListDef;
  hint?: string;
  /** Mostra il campo solo se la condizione vale (es. stats testuali o a mappa negli oggetti). */
  when?: (it: Item) => boolean;
  /** Per kind "static": valore in sola lettura (colonne calcolate). */
  render?: (it: Item) => ReactNode;
}

export interface ListDef {
  noun: string;
  fields: FieldDef[];
  blank: () => Item;
  summary: (it: Item) => ReactNode;
  nameKey?: string;
  /** Campi diversi per riga (es. codice modificabile solo per le statistiche nuove). */
  fieldsFor?: (it: Item) => FieldDef[];
  canRemove?: (it: Item) => boolean;
}

function FieldEditor({ f, it, set }: { f: FieldDef; it: Item; set: (k: string, v: unknown) => void }) {
  const v = it[f.key];
  switch (f.kind) {
    case "text": return <TextField label={f.label} value={v ?? ""} onChange={(x) => set(f.key, x)} hint={f.hint} />;
    case "area": return <TextField label={f.label} value={v ?? ""} onChange={(x) => set(f.key, x)} area hint={f.hint} />;
    case "num": return <NumField label={f.label} value={Number(v) || 0} onChange={(x) => set(f.key, x)} min={f.min} max={f.max} hint={f.hint} />;
    case "int": return <NumField label={f.label} value={Number(v) || 0} onChange={(x) => set(f.key, x)} int min={f.min} max={f.max} hint={f.hint} />;
    case "rarity": return <RarityField value={v ?? ""} onChange={(x) => set(f.key, x)} />;
    case "rarityOpt": return <RarityField value={v ?? ""} onChange={(x) => set(f.key, x)} optional />;
    case "grade": return <GradeField label={f.label} value={Number(v) || 1} onChange={(x) => set(f.key, x)} />;
    case "pct": return <PctField value={v ?? 0} onChange={(x) => set(f.key, x)} />;
    case "select": return <SelectField label={f.label} value={v ?? ""} onChange={(x) => set(f.key, x)} options={(f.options ?? []).map((o) => ({ value: o, label: o }))} hint={f.hint} />;
    case "map": return <MapField label={f.label} value={v ?? {}} keys={f.mapKeys ?? []} onChange={(x) => set(f.key, x)} hint={f.hint} />;
    case "static": return (
      <div className="field ed-f" title={f.hint}>
        <span className="label">{f.label}</span>
        <span className="ed-static num">{f.render ? f.render(it) : String(v ?? "—")}</span>
      </div>
    );
    case "sublist": return (
      <div className="field ed-f wide">
        <span className="label">{f.label}</span>
        <ListEditor items={v ?? []} onChange={(x) => set(f.key, x)} def={f.sub!} nested />
      </div>
    );
  }
}

let seq = 0;

export function ListEditor({ items, onChange, def, nested }: { items: Item[]; onChange: (items: Item[]) => void; def: ListDef; nested?: boolean }) {
  // Chiavi stabili per riga (gli oggetti vengono ricreati a ogni modifica)
  const ids = useRef<number[]>([]);
  if (ids.current.length !== items.length) ids.current = items.map(() => ++seq);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const nameKey = def.nameKey ?? "name";

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const update = (i: number, k: string, v: unknown) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    const k = [...ids.current];
    [k[i], k[j]] = [k[j], k[i]];
    ids.current = k;
    onChange(next);
  };
  const remove = (i: number) => {
    ids.current = ids.current.filter((_, j) => j !== i);
    onChange(items.filter((_, j) => j !== i));
  };
  const add = () => {
    const id = ++seq;
    ids.current = [...ids.current, id];
    setOpen((s) => new Set(s).add(id));
    onChange([...items, def.blank()]);
  };

  return (
    <div className={`ed-list${nested ? " nested" : ""}`}>
      {items.map((it, i) => {
        const id = ids.current[i];
        const isOpen = open.has(id);
        const name = String(it[nameKey] ?? "").trim();
        return (
          <div className={`ed-item${isOpen ? " open" : ""}`} key={id}>
            <div className="ed-item-h">
              <button type="button" className="ed-exp" aria-expanded={isOpen} onClick={() => toggle(id)}>
                <span className="ed-caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                <span className={`ed-name${name ? "" : " bad-t"}`}>{name || "(senza nome)"}</span>
                <span className="ed-sum xs muted">{def.summary(it)}</span>
              </button>
              <span className="ed-ctl">
                <button type="button" className="btn icon ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Sposta su ${name}`} title="Sposta su">↑</button>
                <button type="button" className="btn icon ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Sposta giù ${name}`} title="Sposta giù">↓</button>
                <button type="button" className="btn icon ghost ed-del" onClick={() => remove(i)} disabled={def.canRemove ? !def.canRemove(it) : false}
                  aria-label={`Elimina ${name}`} title={def.canRemove && !def.canRemove(it) ? "Non si può eliminare" : "Elimina"}>×</button>
              </span>
            </div>
            {isOpen && (
              <div className="ed-grid">
                {(def.fieldsFor ? def.fieldsFor(it) : def.fields).filter((f) => !f.when || f.when(it)).map((f) => (
                  <FieldEditor key={f.key} f={f} it={it} set={(k, v) => update(i, k, v)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!items.length && <span className="xs muted">Nessun elemento.</span>}
      <button type="button" className="btn ghost ed-add" onClick={add}>+ {def.noun}</button>
    </div>
  );
}
