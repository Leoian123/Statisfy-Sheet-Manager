/* Motore dei wizard della Forgia (porting di mockup/screens/wizards-master.js e wizards-magia.js).
   Ogni wizard dichiara passi, bozza iniziale e anteprima; validazione per passo e numeri li calcola il server
   (POST /api/forge/preview) a ogni modifica della bozza, con un breve debounce. */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { errorText } from "../api/client";
import { forgeApi, type Computed, type Draft, type ForgeEntry, type ForgeKind, type ForgeMeta, type ForgePreview } from "../api/forge";
import { RarityChip } from "../components/RarityChip";
import { TipRow } from "../components/TipRow";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";

export interface WCtx {
  d: Draft;
  /** Imposta un campo per percorso ("rows.0.vals.3"). */
  set: (path: string, v: unknown) => void;
  /** Modifica la bozza con una funzione (su una copia). */
  upd: (fn: (d: Draft) => void) => void;
  c: Computed;
  meta: ForgeMeta;
  id: string;
}

export interface StepDef { render: (x: WCtx) => ReactNode }

export interface WizardDef {
  id: string;
  kind: ForgeKind;
  group: "Personaggi" | "Mondo" | "Magia";
  title: string;
  desc: string;
  heading: string;
  intro: ReactNode;
  fresh: (meta: ForgeMeta) => Draft;
  steps: StepDef[];
  preview: (x: WCtx) => ReactNode;
  saveLabel?: (x: WCtx) => string;
}

export interface DraftState { d: Draft; step: number }

/* ---------------- Formattazione ---------------- */
export const ni = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("it-IT");
export const nf = (n: unknown) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("it-IT");
export const signed = (n: unknown) => (Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : "±") + nf(Math.abs(Number(n) || 0));
export const filled = (s: unknown, min = 1) => String(s ?? "").trim().length >= min;
export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export function getP(o: unknown, path: string): unknown {
  return String(path).split(".").reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o);
}
function setP(o: Draft, path: string, v: unknown): void {
  const ks = String(path).split(".");
  const last = ks.pop()!;
  const t = ks.reduce<Record<string, unknown> | undefined>((a, k) => (a == null ? a : (a[k] as Record<string, unknown>)), o);
  if (t) t[last] = v;
}
const fid = (id: string, path: string) => `wz-${id}-${String(path).replace(/[^A-Za-z0-9]+/g, "-")}`;

/* ---------------- Contesto dei campi ---------------- */
const Ctx = createContext<WCtx | null>(null);
export function useW(): WCtx {
  const x = useContext(Ctx);
  if (!x) throw new Error("Campo fuori da un wizard");
  return x;
}

interface FieldBase { label: string; req?: boolean; hint?: ReactNode; cls?: string; after?: ReactNode }
function Lab({ path, label, req, after }: { path: string; label: string; req?: boolean; after?: ReactNode }) {
  const { id } = useW();
  return <label className="label" htmlFor={fid(id, path)}>{label}{req && <span className="wz-req" aria-hidden="true"> *</span>}{after && <> {after}</>}</label>;
}

export function TextF({ path, label, req, hint, cls, after, max, ph, area, rows, list }: FieldBase & { path: string; max?: number; ph?: string; area?: boolean; rows?: number; list?: string }) {
  const x = useW();
  const v = String(getP(x.d, path) ?? "");
  const common = { className: "input", id: fid(x.id, path), maxLength: max, placeholder: ph, "aria-required": req || undefined, value: v };
  return (
    <div className={`field ${cls ?? ""}`}>
      <Lab path={path} label={label} req={req} after={after} />
      {area
        ? <textarea {...common} rows={rows ?? 3} onChange={(e) => x.set(path, e.target.value)} />
        : <input {...common} type="text" autoComplete="off" list={list} onChange={(e) => x.set(path, e.target.value)} />}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function readNum(s: string): number | string {
  const v = s.trim().replace(",", ".");
  if (v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n : s;
}

export function NumF({ path, label, req, hint, cls, after, min, max, step, ph }: FieldBase & { path: string; min?: number; max?: number; step?: number; ph?: string }) {
  const x = useW();
  const v = getP(x.d, path);
  return (
    <div className={`field ${cls ?? ""}`}>
      <Lab path={path} label={label} req={req} after={after} />
      <input className="input num" type="number" inputMode="decimal" id={fid(x.id, path)} value={v == null ? "" : String(v)}
        min={min} max={max} step={step ?? 1} placeholder={ph} aria-required={req || undefined}
        onChange={(e) => x.set(path, readNum(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export type SelOpt = string | { v: string | number; l: string; disabled?: boolean };
export function SelF({ path, label, opts, req, hint, cls, after, num }: FieldBase & { path: string; opts: SelOpt[]; num?: boolean }) {
  const x = useW();
  const v = String(getP(x.d, path) ?? "");
  const list = opts.map((o) => (typeof o === "string" ? { v: o, l: o } : o));
  return (
    <div className={`field ${cls ?? ""}`}>
      <Lab path={path} label={label} req={req} after={after} />
      <select className="input" id={fid(x.id, path)} value={v} onChange={(e) => x.set(path, num ? Number(e.target.value) : e.target.value)}>
        {list.map((o) => <option key={String(o.v)} value={String(o.v)} disabled={"disabled" in o ? o.disabled : undefined}>{o.l}</option>)}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function CheckF({ path, label, hint, cls, after, disabled }: Omit<FieldBase, "req"> & { path: string; disabled?: boolean }) {
  const x = useW();
  return (
    <div className={`field ${cls ?? ""}`}>
      <label className={`wz-check${disabled ? " is-off" : ""}`}>
        <input type="checkbox" id={fid(x.id, path)} checked={!!getP(x.d, path)} disabled={disabled} onChange={(e) => x.set(path, e.target.checked)} />
        <span>{label}{after && <> {after}</>}</span>
      </label>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export interface PickOpt { v: string | number; l: ReactNode; sub?: ReactNode; disabled?: boolean; title?: string; rarity?: string }
/** Bottoni a scelta singola o multipla (aria-pressed). */
export function Picks({ path, label, opts, multi, req, hint, cls, after, onPick }: FieldBase & { path: string; opts: (string | PickOpt)[]; multi?: boolean; onPick?: (v: string | number) => void }) {
  const x = useW();
  const gid = useId();
  const cur = getP(x.d, path);
  return (
    <div className={`field ${cls ?? ""}`} role="group" aria-labelledby={gid}>
      <span className="label" id={gid}>{label}{req && <span className="wz-req" aria-hidden="true"> *</span>}{after && <> {after}</>}</span>
      <div className="wz-picks">
        {opts.map((o0) => {
          const o: PickOpt = typeof o0 === "string" ? { v: o0, l: o0 } : o0;
          const on = multi ? ((cur as unknown[]) || []).includes(o.v) : String(cur) === String(o.v);
          return (
            <button key={String(o.v)} type="button" className="pick" id={fid(x.id, `${path}-${o.v}`)} aria-pressed={on} disabled={o.disabled}
              title={o.title} data-rarity={o.rarity ? rarityKeyOf(o.rarity) : undefined}
              onClick={() => {
                if (onPick) { onPick(o.v); return; }
                if (multi) {
                  const arr = ((cur as unknown[]) || []).slice();
                  const i = arr.indexOf(o.v);
                  if (i === -1) arr.push(o.v); else arr.splice(i, 1);
                  x.set(path, arr);
                } else x.set(path, o.v);
              }}>
              <span>{o.l}</span>{o.sub && <span className="wz-pick-sub">{o.sub}</span>}
            </button>
          );
        })}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

const rarityKeyOf = (r: string) => r.toLowerCase().replace(/\s+/g, "");

/* ---------------- Chip delle regole ---------------- */
function InfoChip({ cls, text, label, title }: { cls: string; text: string; label: string; title: string }) {
  return <span className={`chip ${cls} wz-prop`} tabIndex={0} title={title} aria-label={`${label}: ${text}`}>{label}</span>;
}
export const Decided = ({ why }: { why: string }) => <InfoChip cls="good" label="deciso" text={why} title={`Deciso il 20/11/2026: ${why}`} />;
export const Proposal = ({ why }: { why: string }) => <InfoChip cls="warn" label="proposta" text={why} title={`Proposta, non nel regolamento: ${why}`} />;
export const RuleChip = ({ src }: { src: string }) => <InfoChip cls="good" label="regola" text={src} title={`Dal regolamento: ${src}`} />;
export const Ref = ({ children }: { children: ReactNode }) => <p className="small muted wz-ref">{children}</p>;
export const Req = () => <span className="wz-req" aria-hidden="true"> *</span>;

/** Riga di elenco modificabile (creature, bonus, talenti…) con pulsante di rimozione. */
export function Lines<T>({ items, render, onRemove, minItems = 0, what }: { items: T[]; render: (it: T, i: number) => ReactNode; onRemove: (i: number) => void; minItems?: number; what: string }) {
  return (
    <div className="wz-lines">
      {items.map((it, i) => (
        <div className="wz-line" key={i}>
          {render(it, i)}
          <button type="button" className="btn icon ghost" aria-label={`Togli ${what} ${i + 1}`} disabled={items.length <= minItems} onClick={() => onRemove(i)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Anteprima ---------------- */
export const DASH = <span className="muted">—</span>;

/** Riga compatta dell'anteprima; i dettagli (formule, calcoli) nel tooltip al passaggio del mouse. */
export function PvRow({ label, children, tip }: { label: ReactNode; children: ReactNode; tip?: ReactNode }) {
  const empty = tip == null || tip === "" || (Array.isArray(tip) && !tip.length);
  if (empty) return <div className="pv-r"><span className="pv-k">{label}</span><span className="pv-v">{children}</span></div>;
  return (
    <TipRow className="pv-r" tip={Array.isArray(tip) ? tip.filter(Boolean).map((l, i) => <span key={i}>{l}</span>) : tip}>
      <span className="pv-k">{label}</span><span className="pv-v">{children}</span>
    </TipRow>
  );
}

/** Testo lungo: troncato nella riga, intero nel tooltip. */
export function PvText({ label, text, n = 48 }: { label: ReactNode; text: unknown; n?: number }) {
  const s = String(text ?? "").trim();
  if (!s) return <PvRow label={label}>{DASH}</PvRow>;
  if (s.length <= n) return <PvRow label={label}>{s}</PvRow>;
  return <PvRow label={label} tip={<span className="pv-pre">{s}</span>}>{s.slice(0, n - 1).trimEnd()}…</PvRow>;
}

export const PvSec = ({ label, extra }: { label: string; extra?: ReactNode }) => (
  <div className="pv-sec"><span className="label">{label}</span>{extra}</div>
);

export function PvWin({ tag, head, children }: { tag: string; head: ReactNode; children: ReactNode }) {
  return (
    <Win title="Anteprima del System" gold className="pv-win">
      <div className="sysmsg gold"><span className="tag">[{tag}]</span><span className="pv-name">{head}</span></div>
      <div className="pv-rows">{children}</div>
    </Win>
  );
}

export const NameOr = ({ s, ph }: { s: unknown; ph: string }) => (filled(s) ? <>{String(s).trim()}</> : <span className="muted">{ph}</span>);
export { RarityChip };

export function charOpts(meta: ForgeMeta, none = "Nessuno: solo libreria") {
  return [{ v: "", l: none }, ...meta.characters.map((c) => ({ v: String(c.id), l: `${c.name} · Lv ${c.level}` }))];
}

/* ---------------- Barra degli step ---------------- */
function Steps({ labels, current, reachable, onGo }: { labels: string[]; current: number; reachable: number; onGo: (i: number) => void }) {
  return (
    <ol className="wz-steps">
      {labels.map((l, i) => (
        <li key={l}>
          <button type="button" className={`wz-step${i === current ? " is-current" : ""}${i < current ? " is-done" : ""}`}
            disabled={i > reachable} aria-current={i === current ? "step" : undefined} onClick={() => i !== current && onGo(i)}>
            <span className="wz-n">{i < current ? "✓" : i + 1}</span><span>{l}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/* ---------------- Wizard ---------------- */
interface WizardProps {
  def: WizardDef;
  meta: ForgeMeta;
  state: DraftState;
  setState: (s: DraftState) => void;
  onCancel: () => void;
  onSaved: (e: ForgeEntry) => void;
}

export function Wizard({ def, meta, state, setState, onCancel, onSaved }: WizardProps) {
  const toast = useToast();
  const [pv, setPv] = useState<ForgePreview | null>(null);
  const [pvError, setPvError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seq = useRef(0);
  const formRef = useRef<HTMLDivElement>(null);
  const labels = meta.steps[def.kind];
  const { d, step } = state;

  // Anteprima e validazione dal server, a ogni modifica della bozza (debounce 150 ms, risposte vecchie scartate)
  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      forgeApi.preview(def.kind, d)
        .then((r) => { if (n === seq.current) { setPv(r); setPvError(null); } })
        .catch((e) => { if (n === seq.current) setPvError(errorText(e)); });
    }, pv ? 150 : 0);
    return () => window.clearTimeout(t);
  }, [d, def.kind]);

  const x: WCtx = {
    d, c: pv?.computed ?? {}, meta, id: def.id,
    set: (path, v) => { const nd = clone(d); setP(nd, path, v); setState({ d: nd, step }); },
    upd: (fn) => { const nd = clone(d); fn(nd); setState({ d: nd, step }); },
  };

  const msgs = pv?.steps ?? labels.map(() => "");
  const firstBad = pv ? pv.first_bad : 0;
  const reachable = firstBad === -1 ? labels.length - 1 : firstBad;
  const last = step === labels.length - 1;
  let reason = msgs[step] || "";
  if (last && !reason && firstBad !== -1 && pv) reason = `Passo ${firstBad + 1} (${labels[firstBad]}): ${msgs[firstBad]}`;
  const blocked = !pv || !!reason;

  function go(i: number) {
    setState({ d, step: i });
    requestAnimationFrame(() => {
      formRef.current?.focus({ preventScroll: true });
      const top = formRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) window.scrollBy({ top: top - 90 });
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await forgeApi.save(def.kind, d);
      toast("FORGIA", r.messages, { gold: true });
      onSaved(r.entry);
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Ctx.Provider value={x}>
      <div className="stack wz">
        <div className="stack wz-head"><h2>{def.heading}</h2><p className="muted small">{def.intro}</p></div>
        <Steps labels={labels} current={step} reachable={reachable} onGo={go} />
        <div className="wz-body">
          <section className="win wz-form" aria-labelledby={`wz-${def.id}-h`}>
            <header className="win-h" id={`wz-${def.id}-h`}>Passo {step + 1} di {labels.length} · {labels[step]}</header>
            <div className="win-b wz-form-b" tabIndex={-1} ref={formRef}>
              {def.steps[step].render(x)}
              {pvError && <p className="hint bad" role="alert">Anteprima non disponibile: {pvError}</p>}
              {saveError && <p className="hint bad" role="alert">{saveError}</p>}
              <div className="wz-foot">
                <button type="button" className="btn ghost" title="Scarta la bozza e torna alla Forgia" onClick={onCancel}>Annulla</button>
                <div className="wz-foot-r">
                  <span className={`hint wz-reason ${reason ? "bad" : "good"}`} id={`wz-${def.id}-reason`} role="status">
                    {!pv ? "Verifica in corso…" : reason || (last ? "Pronto: salva per aggiungerlo alla libreria." : "Passo completo.")}
                  </span>
                  <div className="row">
                    <button type="button" className="btn" disabled={step === 0} onClick={() => go(step - 1)}>Indietro</button>
                    {last
                      ? <button type="button" className="btn primary" disabled={blocked || saving} aria-describedby={`wz-${def.id}-reason`} onClick={save}>
                          {saving ? "Salvataggio…" : def.saveLabel ? def.saveLabel(x) : "Salva nella libreria"}
                        </button>
                      : <button type="button" className="btn primary" disabled={blocked} aria-describedby={`wz-${def.id}-reason`} onClick={() => go(step + 1)}>Avanti</button>}
                  </div>
                </div>
              </div>
            </div>
          </section>
          <aside className="wz-preview" aria-label="Anteprima">{def.preview(x)}</aside>
        </div>
      </div>
    </Ctx.Provider>
  );
}
