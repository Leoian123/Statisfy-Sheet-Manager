// Editor della meccanica strutturata di un'abilità (`mech`, backend: app/mech.py). Usato dal passo «Meccanica»
// della Forgia e dall'editor della scheda del Master. Tiene `mech` come oggetto JSON semplice, con le sole
// chiavi dello schema (il server rifiuta le chiavi sconosciute): i campi lasciati vuoti prendono il default.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type {
  Mech, MechAction, MechCondition, MechCost, MechEffect, MechFormula, MechKind, MechOp, MechScaling, MechTemplate, MechVocabulary,
} from "../../api/mech";
import { effectLine } from "./summary";

/** Che abilità si sta descrivendo: decide il `tipo` dei modelli e la formula di partenza. */
export type MechKindHint = "incantesimo" | "miracolo" | "skill" | "passiva";

export interface MechEditorProps {
  value: Mech | null;
  onChange: (m: Mech | null) => void;
  vocab: MechVocabulary;
  kindHint: MechKindHint;
  /** Nella Forgia il tipo lo decide il wizard: si sceglie solo se è una passiva. */
  lockKind?: boolean;
  /** Nella Forgia costo e ricarica li calcola il wizard: i modelli non portano i loro. */
  stripTemplateCosts?: boolean;
  /** Riepilogo leggibile ed errori calcolati dal server (anteprima della Forgia). */
  text?: string;
  errors?: string[];
  /** Codici delle statistiche, suggeriti per «Modifica statistica». */
  statKeys?: string[];
}

const FORMULA_OPS: MechOp[] = ["danno", "cura", "danno_e_cura", "scudo", "risorsa"];
const LAUNCH_RES = new Set(["MP", "SP", "KI", "HP", "FEDE"]);
const MAX_DEPTH = 3;
const MAX_KIDS = 6;
const MAX_COND = 6;
const MAX_SCAL = 4;
const MAX_TAGS = 12;

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const entries = (r: Record<string, string>) => Object.entries(r) as [string, string][];
/** «A vista (nessun limite di portata)» → «A vista»: il resto va nel tooltip. */
const shortL = (l: string) => l.split(" (")[0];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
type Obj = Record<string, unknown>;
/** Imposta un campo; vuoto o undefined lo toglie (vale il default dello schema). */
function put(o: object, k: string, v: unknown) {
  const r = o as Obj;
  if (v === undefined || v === "" || v === null) delete r[k]; else r[k] = v;
}

export function mechKind(hint: MechKindHint, tpl?: MechKind): MechKind {
  if (hint === "miracolo") return "miracolo";
  if (hint === "passiva" || tpl === "passiva") return "passiva";
  return hint === "incantesimo" ? "incantesimo" : "skill";
}
const isMagic = (k: MechKind) => k === "incantesimo" || k === "miracolo";
export const defaultFormula = (k: MechKind): MechFormula =>
  isMagic(k) ? { base: "incantesimo", tipo: "magico" } : { base: "arma", tipo: "fisico" };
export const blankEffect = (k: MechKind): MechEffect => ({
  trigger: { evento: "al_lancio" }, bersaglio: { lato: "nemico", forma: "singolo" }, azione: { op: "danno" }, formula: defaultFormula(k),
});
export function blankMech(hint: MechKindHint): Mech {
  const k = mechKind(hint);
  return { v: 1, tipo: k, effetti: [blankEffect(k)] };
}
export function fromTemplate(t: MechTemplate, hint: MechKindHint, stripCosts?: boolean): Mech {
  const m = clone(t.mech);
  m.tipo = mechKind(hint, t.mech.tipo);
  if (stripCosts) {
    const keep = (m.costi ?? []).filter((c) => !(c.per !== "turno" && LAUNCH_RES.has(c.risorsa)));
    if (keep.length) m.costi = keep; else delete m.costi;
    delete m.cooldown;
  }
  return m;
}

/* ---------------- Campi compatti ---------------- */
type Opt = [string, string];

function Chips({ label, value, opts, onPick, title }: { label: string; value: string; opts: Opt[]; onPick: (v: string) => void; title?: string }) {
  const gid = useId();
  return (
    <div className="mc-f" role="group" aria-labelledby={gid} title={title}>
      <span className="mc-k" id={gid}>{label}</span>
      <span className="mc-picks">
        {opts.map(([v, l]) => (
          <button key={v} type="button" className="pick mc-pick" aria-pressed={value === v} title={l !== shortL(l) ? l : undefined}
            onClick={() => onPick(v)}>{shortL(l)}</button>
        ))}
      </span>
    </div>
  );
}

function Sel({ label, value, opts, onChange, wide }: { label: string; value: string; opts: Opt[]; onChange: (v: string) => void; wide?: boolean }) {
  const id = useId();
  const known = opts.some(([v]) => v === value);
  return (
    <span className={`mc-f${wide ? " mc-wide" : ""}`}>
      <label className="mc-k" htmlFor={id}>{label}</label>
      <select id={id} className="input mc-in" value={value} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value={value}>{value || "—"}</option>}
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

const parseN = (s: string) => Number(s.trim().replace(",", "."));
function Num({ label, value, onChange, min, max, int, unit, ph, title }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void;
  min?: number; max?: number; int?: boolean; unit?: string; ph?: string; title?: string;
}) {
  const id = useId();
  const [s, setS] = useState(value == null ? "" : String(value));
  useEffect(() => {
    const cur = s.trim() === "" ? undefined : parseN(s);
    if (cur !== value) setS(value == null ? "" : String(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = parseN(s);
  const bad = s.trim() !== "" && (!Number.isFinite(n) || (int && !Number.isInteger(n)) || (min != null && n < min) || (max != null && n > max));
  return (
    <span className="mc-f" title={title}>
      <label className="mc-k" htmlFor={id}>{label}</label>
      <span className="mc-numw">
        <input id={id} className={`input mc-in mc-num${bad ? " mc-bad" : ""}`} inputMode={int ? "numeric" : "decimal"} value={s}
          placeholder={ph} aria-invalid={bad || undefined} autoComplete="off"
          onChange={(e) => {
            const raw = e.target.value;
            setS(raw);
            if (raw.trim() === "") { onChange(undefined); return; }
            const v = parseN(raw);
            if (Number.isFinite(v) && (!int || Number.isInteger(v))) onChange(v);
          }}
          onBlur={() => setS(value == null ? "" : String(value))} />
        {unit && <span className="mc-unit">{unit}</span>}
      </span>
    </span>
  );
}

function Txt({ label, value, onChange, ph, max = 80, list, wide }: {
  label: string; value: string | undefined; onChange: (v: string) => void; ph?: string; max?: number; list?: string; wide?: boolean;
}) {
  const id = useId();
  return (
    <span className={`mc-f${wide ? " mc-wide" : ""}`}>
      <label className="mc-k" htmlFor={id}>{label}</label>
      <input id={id} className="input mc-in mc-txt" value={value ?? ""} placeholder={ph} maxLength={max} list={list} autoComplete="off"
        onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

function Check({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="mc-check" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Axis({ label, children, tip }: { label: string; children: ReactNode; tip?: string }) {
  return (
    <div className="mc-axis">
      <span className="mc-ax" title={tip}>{label}</span>
      <div className="mc-axb">{children}</div>
    </div>
  );
}

/** Etichette: Invio o virgola aggiungono, ✕ toglie. */
function Tags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  const [s, setS] = useState("");
  const add = (raw: string) => {
    const next = [...value];
    for (const p of raw.split(",").map((x) => x.trim().replace(/^#/, "").slice(0, 80)).filter(Boolean)) {
      if (!next.includes(p) && next.length < MAX_TAGS) next.push(p);
    }
    if (next.length !== value.length) onChange(next);
    setS("");
  };
  return (
    <span className="mc-f mc-wide">
      <label className="mc-k" htmlFor={id}>Etichette</label>
      <span className="mc-tags">
        {value.map((t) => (
          <span key={t} className="chip violet mc-tag">#{t}
            <button type="button" className="mc-x" aria-label={`Togli l'etichetta ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>✕</button>
          </span>
        ))}
        {value.length < MAX_TAGS && (
          <input id={id} className="input mc-in mc-tagin" value={s} placeholder="es. Ignis, Proiettile" autoComplete="off" maxLength={200}
            onChange={(e) => { if (e.target.value.includes(",")) add(e.target.value); else setS(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(s); } else if (e.key === "Backspace" && !s && value.length) onChange(value.slice(0, -1)); }}
            onBlur={() => s.trim() && add(s)} />
        )}
      </span>
    </span>
  );
}

/* ---------------- Contesto condiviso dalle card ---------------- */
interface K { vocab: MechVocabulary; kind: MechKind; statusList: string; statList: string }

let kseq = 0;
/** Chiavi stabili per le righe di una lista (gli oggetti vengono ricreati a ogni modifica). */
function useKeys(n: number) {
  const ref = useRef<number[]>([]);
  if (ref.current.length !== n) ref.current = Array.from({ length: n }, (_, i) => ref.current[i] ?? ++kseq);
  return ref;
}

function EffectList({ items, onChange, max, depth, k, noun, addLabel }: {
  items: MechEffect[]; onChange: (v: MechEffect[]) => void; max: number; depth: number; k: K; noun: string; addLabel: string;
}) {
  const keys = useKeys(items.length);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    const ks = [...keys.current];
    [ks[i], ks[j]] = [ks[j], ks[i]];
    keys.current = ks;
    onChange(next);
  };
  const remove = (i: number) => {
    keys.current = keys.current.filter((_, j) => j !== i);
    onChange(items.filter((_, j) => j !== i));
  };
  const add = () => {
    keys.current = [...keys.current, ++kseq];
    const parent = items[items.length - 1];
    const e = blankEffect(k.kind);
    if (depth > 1 && parent) e.bersaglio = { ...e.bersaglio, lato: parent.bersaglio?.lato ?? "nemico" };
    onChange([...items, e]);
  };
  return (
    <div className={`mc-effs${depth > 1 ? " mc-sub" : ""}`}>
      {items.map((e, i) => (
        <EffectCard key={keys.current[i]} eff={e} i={i} n={items.length} depth={depth} k={k} noun={noun}
          initOpen={mounted.current || items.length === 1}
          onChange={(ne) => onChange(items.map((x, j) => (j === i ? ne : x)))}
          onMove={(d) => move(i, d)} onRemove={() => remove(i)} />
      ))}
      <button type="button" className="btn ghost mc-add" disabled={items.length >= max} onClick={add}
        title={items.length >= max ? `Al massimo ${max}` : undefined}>＋ {addLabel}</button>
    </div>
  );
}

/* ---------------- Card di un effetto: cinque assi ---------------- */
function EffectCard({ eff, i, n, depth, k, noun, initOpen, onChange, onMove, onRemove }: {
  eff: MechEffect; i: number; n: number; depth: number; k: K; noun: string; initOpen: boolean;
  onChange: (e: MechEffect) => void; onMove: (d: -1 | 1) => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(initOpen);
  const bodyId = useId();
  const { vocab } = k;
  const up = (fn: (e: MechEffect) => void) => { const e = clone(eff); fn(e); onChange(e); };
  const t = eff.trigger ?? { evento: "al_lancio" };
  const b = eff.bersaglio ?? { lato: "nemico", forma: "singolo" };
  const a = eff.azione;
  const f = eff.formula ?? null;
  const op = a.op;
  const ev = t.evento;
  const line = effectLine(eff);
  const setA = (key: keyof MechAction, v: unknown) => up((e) => put(e.azione, key, v));
  const setF = (key: keyof MechFormula, v: unknown) => up((e) => { if (e.formula) put(e.formula, key, v); });
  const setT = (key: string, v: unknown) => up((e) => { e.trigger = e.trigger ?? { evento: "al_lancio" }; put(e.trigger, key, v); });
  const setB = (key: string, v: unknown) => up((e) => { e.bersaglio = e.bersaglio ?? { lato: "nemico", forma: "singolo" }; put(e.bersaglio, key, v); });
  const pct = (label: string, title?: string) => <Num label={label} unit="%" min={0} max={1000} value={a.pct} onChange={(v) => setA("pct", v)} title={title} />;
  const turni = <Num label="Turni" int min={0} max={99} value={a.turni} ph="0" onChange={(v) => setA("turni", v)} />;
  const statusF = <Txt label="Status" value={a.status} list={k.statusList} ph="es. Bruciatura" onChange={(v) => setA("status", v)} />;
  const known = !!a.status && a.status in vocab.status.status;

  return (
    <div className={`mc-eff${open ? " is-open" : ""}`}>
      <div className="mc-effh">
        <button type="button" className="mc-exp" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)} title={line}>
          <span className="mc-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
          <span className="mc-effn">{depth > 1 ? "↳ " : ""}{noun} {i + 1}</span>
          <span className="mc-effs-t">{line}</span>
        </button>
        <span className="mc-ctl">
          <button type="button" className="btn icon ghost" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Sposta su ${noun} ${i + 1}`} title="Sposta su">↑</button>
          <button type="button" className="btn icon ghost" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Sposta giù ${noun} ${i + 1}`} title="Sposta giù">↓</button>
          <button type="button" className="btn icon ghost" onClick={onRemove} aria-label={`Togli ${noun} ${i + 1}`} title="Togli">✕</button>
        </span>
      </div>
      {open && <div className="mc-effb" id={bodyId}>
        <Axis label="Quando" tip="Trigger: quando scatta l'effetto">
          <Sel label="Evento" value={ev} opts={entries(vocab.events)} onChange={(v) => up((e) => { e.trigger = { evento: v as MechEffect["trigger"]["evento"] }; })} />
          {(ev === "inizio_turno" || ev === "fine_turno") &&
            <Chips label="Turno di" value={t.chi ?? "se"} opts={[["se", "Chi lancia"], ["bersaglio", "Bersaglio"]]} onPick={(v) => setT("chi", v)} />}
          {ev === "dopo_abilita" && <Txt label="Dopo l'abilità" value={t.abilita} ph="Nome o #etichetta" onChange={(v) => setT("abilita", v)} />}
          {ev === "azione_nemica" && <Chips label="Azione" value={t.abilita ?? ""}
            opts={[["", "Qualsiasi"], ["lancio", "Lancio"], ["attacco", "Attacco"], ["movimento", "Movimento"]]} onPick={(v) => setT("abilita", v)} />}
          {ev === "soglia_hp" && <Num label="Soglia vita" unit="%" min={1} max={99} value={t.soglia} ph="30" onChange={(v) => setT("soglia", v)} />}
        </Axis>

        <Axis label="Su chi" tip="Bersaglio: lato, forma e portata">
          <Chips label="Lato" value={b.lato} opts={entries(vocab.sides)} onPick={(v) => setB("lato", v)} />
          <Chips label="Forma" value={b.forma} opts={entries(vocab.shapes)} onPick={(v) => up((e) => {
            e.bersaglio = { ...b, forma: v as typeof b.forma };
            if (v === "catena" && (e.bersaglio.n ?? 1) < 2) e.bersaglio.n = 3;
          })} />
          {(b.forma === "catena" || b.forma === "casuale" || b.forma === "area") &&
            <Num label={b.forma === "catena" ? "Salti" : "Max bersagli"} int min={b.forma === "catena" ? 2 : 1} max={50} value={b.n} ph="1" onChange={(v) => setB("n", v)} />}
          {b.forma === "area" && <Num label="Raggio" unit="m" min={0} value={b.raggio} ph="0" onChange={(v) => setB("raggio", v)} />}
          {b.forma === "catena" && <Num label="Calo a salto" unit="%" min={0} max={1000} value={b.calo} ph="0" onChange={(v) => setB("calo", v)} />}
          {b.lato !== "se" && <Chips label="Portata" value={b.portata ?? "distanza"} opts={entries(vocab.reach)} onPick={(v) => setB("portata", v)} />}
        </Axis>

        <Axis label="Cosa fa" tip="Azione">
          <Sel label="Effetto" value={op} wide opts={entries(vocab.ops)} onChange={(v) => up((e) => {
            e.azione = { op: v as MechOp };
            if (FORMULA_OPS.includes(v as MechOp) && !e.formula) e.formula = defaultFormula(k.kind);
          })} />
          {op === "cura" && <Check label="L'eccesso diventa scudo" checked={!!a.eccesso_scudo} onChange={(v) => setA("eccesso_scudo", v || undefined)} />}
          {op === "danno_e_cura" && pct("Cura", "% del danno che diventa cura (vuoto = 100%)")}
          {op === "scudo" && turni}
          {op.startsWith("status_") && <>
            {statusF}
            {op !== "status_rimuovi" && <Num label="Stack" int min={1} max={99} value={a.stack} ph="1" onChange={(v) => setA("stack", v)} />}
            {op === "status_applica" && turni}
            {op === "status_applica" && a.status && !known &&
              <Chips label="Status nuovo" value={a.polarita ?? ""} opts={[["", "—"], ["buono", "Positivo"], ["cattivo", "Negativo"]]}
                onPick={(v) => setA("polarita", v)} title="Lo status non è nel catalogo: indica se è positivo o negativo" />}
          </>}
          {op === "stat_mod" && <>
            <Txt label="Statistica" value={a.stat} max={20} list={k.statList} ph="es. difesa, STR" onChange={(v) => setA("stat", v)} />
            <Num label="Variazione" unit="%" value={a.valore} ph="+20" onChange={(v) => setA("valore", v)} />
            {turni}
          </>}
          {op === "evoca" && <>
            <Txt label="Nome" value={a.nome} ph="es. Lupo spettrale" onChange={(v) => setA("nome", v)} />
            <Num label="Vita" unit="HP" min={0} value={a.hp} onChange={(v) => setA("hp", v)} />
            {turni}
          </>}
          {(op === "trasforma" || op === "campo") && <>
            <Txt label="Nome" value={a.nome} ph={op === "campo" ? "es. Nebbia" : "es. Forma d'orso"} onChange={(v) => setA("nome", v)} />
            {turni}
          </>}
          {op === "sposta" && <Chips label="Modo" value={a.modo ?? ""} opts={[["spingi", "Spingi"], ["attira", "Attira"], ["scambia", "Scambia"]]} onPick={(v) => setA("modo", v)} />}
          {op === "dispel" && <Chips label="Dissolve" value={a.modo === "cattivi" ? "cattivi" : "buoni"} opts={[["buoni", "Effetti positivi"], ["cattivi", "Effetti negativi"]]} onPick={(v) => setA("modo", v)} />}
          {op === "risorsa" && <>
            <Chips label="Risorsa" value={a.risorsa ?? ""} opts={[["hp", "HP"], ["mp", "MP"], ["sp", "SP"], ["ki", "KI"]]} onPick={(v) => setA("risorsa", v)} />
            <Chips label="Modo" value={a.modo ?? ""} opts={[["dai", "Dai"], ["togli", "Togli"], ["ruba", "Ruba"]]} onPick={(v) => setA("modo", v)} />
          </>}
          {op === "cd_mod" && <Num label="Turni di cooldown" value={a.valore} ph="−1" title="Negativo riduce, positivo allunga" onChange={(v) => setA("valore", v)} />}
          {op === "turno_mod" && <Chips label="Modo" value={a.modo ?? ""} opts={[["extra", "Turno extra"], ["anticipa", "Anticipa"], ["ritarda", "Ritarda"]]} onPick={(v) => setA("modo", v)} />}
          {op === "esegui_sotto" && pct("Soglia", "Uccide se la vita è sotto questa percentuale")}
          {op === "resuscita" && pct("Vita", "% di vita al ritorno (vuoto = 10%)")}
          {(op === "legame" || op === "riflesso") && <>{pct(op === "legame" ? "Diviso" : "Riflesso", op === "legame" ? "% del danno diviso (vuoto = 50%)" : "% del danno subito")}{turni}</>}
          {op === "doma" && pct("Sotto vita", "Soglia di vita per domare (vuoto = 25%)")}
          {op === "narrativo" && <Txt label="Testo" wide max={600} value={a.testo} ph="Cosa succede" onChange={(v) => setA("testo", v)} />}
        </Axis>

        <Axis label="Quanto" tip="Formula del valore">
          {!FORMULA_OPS.includes(op) &&
            <Check label="Usa una formula" checked={!!f} onChange={(v) => up((e) => { if (v) e.formula = defaultFormula(k.kind); else delete e.formula; })} />}
          {f && <>
            <Sel label="Base" value={f.base} opts={entries(vocab.bases)} onChange={(v) => up((e) => {
              const o = e.formula!;
              const nf: MechFormula = { base: v as MechFormula["base"] };
              for (const key of ["molt", "tipo", "penetrazione"] as const) if (o[key] !== undefined) (nf as unknown as Obj)[key] = o[key];
              if (v === "incantesimo" || v === "arma") delete nf.molt;
              e.formula = nf;
            })} />
            {f.base === "fissa" && <Num label="Valore" value={f.min} ph="0" onChange={(v) => setF("min", v)} />}
            {f.base === "intervallo" && <>
              <Num label="Min" value={f.min} ph="0" onChange={(v) => setF("min", v)} />
              <Num label="Max" value={f.max} ph="0" onChange={(v) => setF("max", v)} />
            </>}
            {f.base === "dadi" && <Txt label="Dadi" max={20} value={f.dadi} ph="2d6+3" onChange={(v) => setF("dadi", v)} />}
            {(f.base === "pct_hp" || f.base === "pct_danno" || f.base === "pct_eccesso") &&
              <Num label="Percentuale" unit="%" min={0} max={1000} value={f.pct} onChange={(v) => setF("pct", v)} />}
            {f.base === "pct_hp" && <>
              <Chips label="Di" value={f.di ?? "bersaglio"} opts={[["se", "Chi lancia"], ["bersaglio", "Bersaglio"]]} onPick={(v) => setF("di", v)} />
              <Chips label="Vita" value={f.quale ?? "max"} opts={[["max", "Massima"], ["attuale", "Attuale"], ["mancante", "Mancante"]]} onPick={(v) => setF("quale", v)} />
            </>}
            {f.base !== "incantesimo" && f.base !== "arma" &&
              <Sel label="Moltiplicatore" value={f.molt ?? "nessuno"} opts={entries(vocab.mults)} onChange={(v) => setF("molt", v === "nessuno" ? undefined : v)} />}
            <Sel label="Tipo" value={f.tipo ?? "magico"} opts={vocab.damage_types.map((d) => [d, d] as Opt)} onChange={(v) => setF("tipo", v)} />
            <Num label="Penetrazione" unit="%" min={0} max={1000} value={f.penetrazione} ph="0" title="% di resistenza ignorata" onChange={(v) => setF("penetrazione", v)} />
          </>}
        </Axis>

        <Axis label="Se" tip="Condizioni: tutte devono valere">
          {(eff.condizioni ?? []).map((c, ci) => (
            <CondRow key={ci} c={c} k={k} onRemove={() => up((e) => { e.condizioni!.splice(ci, 1); if (!e.condizioni!.length) delete e.condizioni; })}
              onChange={(nc) => up((e) => { e.condizioni![ci] = nc; })} />
          ))}
          <button type="button" className="btn ghost mc-add" disabled={(eff.condizioni?.length ?? 0) >= MAX_COND}
            onClick={() => up((e) => { e.condizioni = [...(e.condizioni ?? []), { soggetto: "bersaglio", test: "ha_status" }]; })}>＋ Condizione</button>
        </Axis>

        <Axis label="Scala" tip="Scaling: aumenta in percentuale per ogni unità">
          {(eff.scaling ?? []).map((s, si) => (
            <ScaleRow key={si} s={s} k={k} onRemove={() => up((e) => { e.scaling!.splice(si, 1); if (!e.scaling!.length) delete e.scaling; })}
              onChange={(ns) => up((e) => { e.scaling![si] = ns; })} />
          ))}
          <button type="button" className="btn ghost mc-add" disabled={(eff.scaling?.length ?? 0) >= MAX_SCAL}
            onClick={() => up((e) => { e.scaling = [...(e.scaling ?? []), { da: "stack", passo: 10 }]; })}>＋ Scaling</button>
        </Axis>

        <Axis label="Altro">
          <Num label="Probabilità" unit="%" min={0} max={100} value={eff.probabilita} ph="100" onChange={(v) => up((e) => put(e, "probabilita", v))} />
          <Num label="Critico extra" unit="%" min={0} max={1000} value={eff.critico} ph="0" onChange={(v) => up((e) => put(e, "critico", v))} />
          <Num label="Ritardo" unit="turni" int min={0} max={20} value={eff.ritardo} ph="0" title="Turni prima che scatti (bomba)" onChange={(v) => up((e) => put(e, "ritardo", v))} />
        </Axis>

        {depth < MAX_DEPTH && (
          <div className="mc-kids">
            <span className="mc-ax" title="Effetti che scattano quando questo colpisce">Al colpo</span>
            <EffectList items={eff.figli ?? []} max={MAX_KIDS} depth={depth + 1} k={k} noun="Sotto-effetto" addLabel="Sotto-effetto al colpo"
              onChange={(v) => up((e) => { if (v.length) e.figli = v; else delete e.figli; })} />
          </div>
        )}
      </div>}
    </div>
  );
}

function CondRow({ c, k, onChange, onRemove }: { c: MechCondition; k: K; onChange: (c: MechCondition) => void; onRemove: () => void }) {
  const set = (key: keyof MechCondition, v: unknown) => { const n = clone(c); put(n, key, v); onChange(n); };
  const t = c.test;
  return (
    <div className="mc-line">
      <Sel label="Chi" value={c.soggetto ?? "bersaglio"} opts={[["se", "Chi lancia"], ["bersaglio", "Bersaglio"]]} onChange={(v) => set("soggetto", v)} />
      <Sel label="Test" value={t} opts={entries(k.vocab.tests)} onChange={(v) => onChange({ soggetto: c.soggetto ?? "bersaglio", test: v })} />
      {(t === "ha_status" || t === "non_ha_status" || t === "stack_min") &&
        <Txt label="Status" value={c.status} list={k.statusList} onChange={(v) => set("status", v)} />}
      {(t === "hp_sotto" || t === "hp_sopra") && <Num label="Vita" unit="%" value={c.valore} onChange={(v) => set("valore", v)} />}
      {(t === "stack_min" || t === "lanci_min") && <Num label="Almeno" value={c.valore} onChange={(v) => set("valore", v)} />}
      {(t === "tipo" || t === "taglia") && <Txt label={t === "tipo" ? "Tipo" : "Taglia"} value={c.testo} ph={t === "tipo" ? "es. Non morto" : "es. Grande"} onChange={(v) => set("testo", v)} />}
      {t === "storico" && <>
        <Txt label="Evento" value={c.testo} ph="es. uccide" onChange={(v) => set("testo", v)} />
        <Num label="Negli ultimi" unit="round" int min={0} max={99} value={c.entro} ph="0" title="0 = in tutto lo scontro" onChange={(v) => set("entro", v)} />
      </>}
      <button type="button" className="btn icon ghost mc-rm" aria-label="Togli la condizione" title="Togli" onClick={onRemove}>✕</button>
    </div>
  );
}

function ScaleRow({ s, k, onChange, onRemove }: { s: MechScaling; k: K; onChange: (s: MechScaling) => void; onRemove: () => void }) {
  const set = (key: keyof MechScaling, v: unknown) => { const n = clone(s); put(n, key, v); onChange(n); };
  return (
    <div className="mc-line">
      <Sel label="Per ogni" value={s.da} opts={entries(k.vocab.scales)} onChange={(v) => {
        const n: MechScaling = { da: v, passo: s.passo ?? 0 };
        if (s.max !== undefined) n.max = s.max;
        onChange(n);
      }} />
      {(s.da === "stack" || s.da === "consumati") && <Txt label="Status" value={s.status} list={k.statusList} onChange={(v) => set("status", v)} />}
      {s.da === "storico" && <Txt label="Evento" value={s.evento} ph="es. uccide" onChange={(v) => set("evento", v)} />}
      <Num label="Passo" unit="%" value={s.passo} ph="10" onChange={(v) => set("passo", v ?? 0)} />
      <Num label="Tetto" unit="%" min={0} max={1000} value={s.max} ph="nessuno" onChange={(v) => set("max", v)} />
      <button type="button" className="btn icon ghost mc-rm" aria-label="Togli lo scaling" title="Togli" onClick={onRemove}>✕</button>
    </div>
  );
}

/* ---------------- Galleria dei modelli ---------------- */
function Gallery({ templates, onPick, onClose }: { templates: MechTemplate[]; onPick: (t: MechTemplate) => void; onClose: () => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  const nq = norm(q.trim());
  const shown = templates.filter((t) => !nq || norm(`${t.nome} ${t.desc} ${t.gruppo}`).includes(nq));
  const groups = Array.from(new Set(shown.map((t) => t.gruppo)));
  return (
    <div className="mc-gal" role="region" aria-labelledby={id}>
      <div className="mc-galh">
        <span className="label" id={id}>Modelli ({shown.length})</span>
        <input className="input mc-galq" type="search" placeholder="Cerca un modello…" aria-label="Cerca un modello" value={q} autoComplete="off"
          onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn ghost" onClick={onClose}>Chiudi</button>
      </div>
      {groups.map((g) => (
        <div key={g} className="mc-galg">
          <span className="mc-ax">{g}</span>
          <div className="mc-galgrid">
            {shown.filter((t) => t.gruppo === g).map((t) => (
              <button key={t.id} type="button" className="pick mc-tpl" onClick={() => onPick(t)} title={t.desc}>
                <b>{t.nome}</b><span className="xs muted">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!shown.length && <span className="small muted">Nessun modello trovato.</span>}
    </div>
  );
}

/* ---------------- Editor ---------------- */
export function MechEditor({ value, onChange, vocab, kindHint, lockKind, stripTemplateCosts, text, errors, statKeys }: MechEditorProps) {
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const [gallery, setGallery] = useState(false);
  const m = value;
  const kind: MechKind = m?.tipo ?? mechKind(kindHint);
  const k: K = { vocab, kind, statusList: `${uid}-st`, statList: `${uid}-sk` };
  const edit = (fn: (m: Mech) => void) => { if (!m) return; const n = clone(m); fn(n); onChange(n); };

  const pick = (t: MechTemplate) => {
    if (m && m.effetti?.length && !window.confirm(`Sostituire la meccanica attuale con il modello «${t.nome}»?`)) return;
    onChange(fromTemplate(t, kindHint, stripTemplateCosts));
    setGallery(false);
  };
  const scratch = () => {
    if (m && m.effetti?.length && !window.confirm("Ricominciare da zero? La meccanica attuale si perde.")) return;
    onChange(blankMech(kindHint));
    setGallery(false);
  };

  const dur = m?.durata?.tipo ?? "istantaneo";
  const turnCost = (m?.costi ?? []).find((c) => c.per === "turno" && c.risorsa !== "stack");
  const setTurnCost = (patch: Partial<MechCost> | null) => edit((n) => {
    const rest = (n.costi ?? []).filter((c) => !(c.per === "turno" && c.risorsa !== "stack"));
    if (patch && (patch.valore ?? turnCost?.valore)) {
      rest.push({ risorsa: patch.risorsa ?? turnCost?.risorsa ?? "MP", valore: patch.valore ?? turnCost?.valore ?? 0, per: "turno" });
    }
    if (rest.length) n.costi = rest; else delete n.costi;
  });
  const statOpts = [...(statKeys ?? []), ...Object.keys(vocab.status.modifiers)];

  return (
    <div className="mc">
      <datalist id={k.statusList}>
        {Object.entries(vocab.status.status).map(([s, d]) => <option key={s} value={s}>{d.desc}</option>)}
      </datalist>
      <datalist id={k.statList}>
        {Array.from(new Set(statOpts)).map((s) => <option key={s} value={s}>{vocab.status.modifiers[s] ?? s}</option>)}
      </datalist>

      {!m && <p className="small muted mc-intro">Facoltativa: descrive l'abilità in effetti che il motore del combattimento sa applicare
        (quando scatta, su chi, cosa fa, quanto, a quali condizioni). Senza meccanica l'abilità resta solo testo.</p>}
      <div className="mc-bar">
        <button type="button" className="btn" aria-expanded={gallery} onClick={() => setGallery(!gallery)}>Parti da un modello</button>
        <button type="button" className="btn" onClick={scratch}>{m ? "Ricomincia da zero" : "Da zero"}</button>
        {m && <button type="button" className="btn ghost" onClick={() => {
          if (window.confirm("Togliere la meccanica? L'abilità resta solo testo.")) onChange(null);
        }}>Togli la meccanica</button>}
      </div>
      {gallery && <Gallery templates={vocab.templates} onPick={pick} onClose={() => setGallery(false)} />}

      {m && <>
        <div className="mc-head">
          {lockKind
            ? (kindHint !== "miracolo" && kindHint !== "passiva") &&
              <Check label="Passiva (sempre attiva, non si lancia)" checked={m.tipo === "passiva"}
                onChange={(v) => edit((n) => { n.tipo = v ? "passiva" : mechKind(kindHint); })} />
            : <Chips label="Tipo" value={m.tipo} opts={entries(vocab.kinds)} onPick={(v) => edit((n) => { n.tipo = v as MechKind; })} />}
          <Chips label="Quando si usa" value={m.timing ?? "mio_turno"} opts={entries(vocab.timings)} onPick={(v) => edit((n) => { n.timing = v as Mech["timing"]; })} />
          <Chips label="Azione" value={m.azione ?? "principale"} opts={entries(vocab.actions)} onPick={(v) => edit((n) => { n.azione = v as Mech["azione"]; })} />
          <Chips label="Durata" value={dur} opts={entries(vocab.durations)} onPick={(v) => edit((n) => {
            const d = { ...(n.durata ?? { tipo: "istantaneo" }), tipo: v as NonNullable<Mech["durata"]>["tipo"] };
            if (v === "istantaneo") delete d.turni;
            if (v !== "mantenuto") { const c = (n.costi ?? []).filter((x) => x.per !== "turno" || x.risorsa === "stack"); if (c.length) n.costi = c; else delete n.costi; }
            n.durata = d;
          })} />
          {(dur === "turni" || dur === "canalizzato") &&
            <Num label="Turni" int min={1} max={99} value={m.durata?.turni} ph="3" onChange={(v) => edit((n) => { n.durata = { ...(n.durata ?? { tipo: dur }) }; put(n.durata, "turni", v); })} />}
          {(dur === "mantenuto" || dur === "canalizzato") &&
            <Check label="Interrompibile" checked={m.durata?.interrompibile ?? true} onChange={(v) => edit((n) => { n.durata = { ...(n.durata ?? { tipo: dur }), interrompibile: v }; })} />}
          {dur === "mantenuto" && <>
            <Num label="Costo per turno" min={0} value={turnCost?.valore} ph="0" onChange={(v) => setTurnCost(v ? { valore: v } : null)} />
            {turnCost && <Sel label="Risorsa" value={turnCost.risorsa} opts={entries(vocab.resources).filter(([r]) => r !== "stack")}
              onChange={(v) => setTurnCost({ risorsa: v as MechCost["risorsa"] })} />}
          </>}
          <Check label="Tiro per colpire" checked={m.tiro_colpire ?? true} title="Senza tiro l'effetto colpisce sempre (come il Dardo Magico)"
            onChange={(v) => edit((n) => { n.tiro_colpire = v; })} />
          <Tags value={m.etichette ?? []} onChange={(v) => edit((n) => { if (v.length) n.etichette = v; else delete n.etichette; })} />
        </div>

        <EffectList items={m.effetti ?? []} max={vocab.max_effects} depth={1} k={k} noun="Effetto" addLabel="Effetto"
          onChange={(v) => edit((n) => { n.effetti = v; })} />

        {(m.interazioni?.length || m.rider?.length || m.fusione?.length || m.usi || m.rischio) ? (
          <p className="xs muted">Il modello ha anche interazioni, rider, usi o rischio: restano invariati (qui non si modificano).</p>
        ) : null}

        <div className="mc-sum" aria-live="polite">
          <span className="mc-ax">Riepilogo</span>
          {text ? <p className="small mc-text">{text}</p>
            : (m.effetti ?? []).length ? <ul className="small mc-lines">{m.effetti.map((e, i) => <li key={i}>{effectLine(e)}</li>)}</ul>
              : <p className="small muted">Nessun effetto.</p>}
          {!!errors?.length && <ul className="mc-errs" role="alert">{errors.map((e, i) => <li key={i} className="hint bad">{e}</li>)}</ul>}
        </div>
      </>}
    </div>
  );
}
