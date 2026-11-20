// Campi dei moduli di modifica del Master. Compatti, a griglia fluida: niente scroll orizzontale a 375px.
import { useEffect, useId, useState, type ReactNode } from "react";
import { useAppData } from "../../auth/AppData";
import { ROMAN } from "../../lib/format";

function Field({ label, wide, hint, children }: { label: string; wide?: boolean; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={`field ed-f${wide ? " wide" : ""}`}>
      <label className="label" htmlFor={id} title={hint}>{label}</label>
      {children(id)}
    </div>
  );
}

const parse = (s: string) => Number(s.trim().replace(",", "."));

/** Numero digitato come testo: accetta "-", la virgola e lo stato vuoto durante la digitazione. */
export function NumInput({ id, value, onChange, int, min, max, label }: {
  id?: string; value: number; onChange: (v: number) => void; int?: boolean; min?: number; max?: number; label?: string;
}) {
  const [s, setS] = useState(String(value ?? 0));
  useEffect(() => { if (parse(s) !== value) setS(String(value ?? 0)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = parse(s);
  const bad = s.trim() === "" || !Number.isFinite(n) || (int && !Number.isInteger(n)) || (min != null && n < min) || (max != null && n > max);
  return (
    <input
      id={id} className={`input num${bad ? " ed-bad" : ""}`} inputMode={int ? "numeric" : "decimal"} value={s}
      aria-label={label} aria-invalid={bad || undefined}
      onChange={(e) => {
        setS(e.target.value);
        const v = parse(e.target.value);
        if (e.target.value.trim() !== "" && Number.isFinite(v)) onChange(v);
      }}
      onBlur={() => setS(String(value ?? 0))}
    />
  );
}

export function NumField(p: { label: string; value: number; onChange: (v: number) => void; int?: boolean; min?: number; max?: number; hint?: string }) {
  return <Field label={p.label} hint={p.hint}>{(id) => <NumInput id={id} {...p} />}</Field>;
}

export function TextField({ label, value, onChange, wide, area, hint, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; wide?: boolean; area?: boolean; hint?: string; placeholder?: string;
}) {
  return (
    <Field label={label} wide={wide || area} hint={hint}>
      {(id) => area
        ? <textarea id={id} className="input" rows={2} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input id={id} className="input" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function SelectField({ label, value, options, onChange, hint }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; hint?: string;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {!known && <option value={value ?? ""}>{value ? `${value} (non valido)` : "—"}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

export function RarityField({ value, onChange, optional }: { value: string; onChange: (v: string) => void; optional?: boolean }) {
  const { rules } = useAppData();
  const opts = (rules?.rarities ?? []).map((r) => ({ value: r.name, label: r.name }));
  return <SelectField label="Rarità" value={value} onChange={onChange} options={optional ? [{ value: "", label: "—" }, ...opts] : opts} />;
}

export function GradeField({ value, onChange, label = "Grado" }: { value: number; onChange: (v: number) => void; label?: string }) {
  const { rules } = useAppData();
  const grades = rules?.grades ?? [];
  const opts = grades.map((g, i) => ({ value: String(i + 1), label: `${ROMAN[i + 1] ?? i + 1} · ${g}` }));
  return <SelectField label={label} value={String(value)} onChange={(v) => onChange(Number(v))} options={opts} hint="Grado di maestria I–X" />;
}

/** Progresso verso il Grado successivo: 0–100 oppure MAX. */
export function PctField({ value, onChange }: { value: number | "MAX"; onChange: (v: number | "MAX") => void }) {
  const isMax = value === "MAX";
  return (
    <Field label="%" hint="Progresso verso il Grado successivo">
      {(id) => (
        <div className="ed-pct">
          {isMax ? <span className="chip gold">MAX</span>
            : <NumInput id={id} value={Number(value) || 0} onChange={onChange} min={0} max={100} />}
          <label className="ed-check xs"><input type="checkbox" checked={isMax} onChange={(e) => onChange(e.target.checked ? "MAX" : 0)} />MAX</label>
        </div>
      )}
    </Field>
  );
}

/** Mappa codice → numero (bonus dei titoli, statistiche degli oggetti). */
export function MapField({ label, value, keys, onChange, hint }: {
  label: string; value: Record<string, number>; keys: string[]; onChange: (v: Record<string, number>) => void; hint?: string;
}) {
  const entries = Object.entries(value || {});
  const free = keys.filter((k) => !(k in (value || {})));
  const set = (k: string, v: number) => onChange({ ...value, [k]: v });
  const del = (k: string) => { const o = { ...value }; delete o[k]; onChange(o); };
  return (
    <div className="field ed-f wide">
      <span className="label" title={hint}>{label}</span>
      <div className="ed-map">
        {entries.map(([k, v]) => (
          <span className="ed-map-row" key={k}>
            <span className={`mono small${keys.includes(k) ? "" : " bad-t"}`} title={keys.includes(k) ? undefined : "Statistica inesistente"}>{k}</span>
            <NumInput value={v} onChange={(x) => set(k, x)} label={`${label} ${k}`} />
            <button type="button" className="btn icon ghost" onClick={() => del(k)} aria-label={`Togli ${k}`} title="Togli">×</button>
          </span>
        ))}
        {free.length > 0 && (
          <select className="input ed-map-add" value="" aria-label={`Aggiungi a ${label}`} onChange={(e) => e.target.value && set(e.target.value, 0)}>
            <option value="">+ aggiungi…</option>
            {free.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {!entries.length && !free.length && <span className="muted xs">—</span>}
      </div>
    </div>
  );
}

/** Barra Salva/Annulla in fondo a un modulo di modifica. */
export function EditActions({ busy, dirty, error, onSave, onCancel }: {
  busy: boolean; dirty: boolean; error: string | null; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="ed-actions">
      {error && <p className="hint bad" role="alert">{error}</p>}
      <div className="row">
        <span className="xs muted">{dirty ? "Modifiche non salvate." : "Nessuna modifica."}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>Annulla</button>
        <button type="button" className="btn primary" onClick={onSave} disabled={busy || !dirty}>{busy ? "Salvataggio…" : "Salva"}</button>
      </div>
    </div>
  );
}

/** Bottone "Modifica" nell'header di una finestra (solo Master). */
export function EditToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`btn ghost ed-toggle${on ? " on" : ""}`} onClick={onClick} aria-pressed={on} aria-label={`${on ? "Chiudi modifica" : "Modifica"}: ${label}`}>
      {on ? "Chiudi" : "✎ Modifica"}
    </button>
  );
}
