// Kit "finestra di stato" alla Overgeared, condiviso da Inventario, Titoli, Skill, Incantesimi, Miracoli e Talenti.
// Finestra: <Win og> (Win.tsx, con l'ornamento alato). Qui: riga "Etichetta: valore", intestazione del tooltip,
// riga compatta della lista, tooltip unico nel body e l'hook che lo apre al passaggio del mouse, al focus e al tocco.
import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as RFocusEvent,
  type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ROMAN } from "../lib/format";
import { Ornament } from "./Win";

export { Ornament };

/** Riga "Etichetta: valore" con il valore in oro (cls: "good" | "bad" per verde/rosso). */
export function Kv({ k, children, cls }: { k: string; children: ReactNode; cls?: string }) {
  return <div className="og-kv"><span className="og-k">{k}:</span> <span className={`og-v${cls ? ` ${cls}` : ""}`}>{children}</span></div>;
}

/** Intestazione del tooltip: ornamento e `[Nome]` colorato per rarità (o per Grado). */
export function OgTipHead({ name, rarity }: { name: string; rarity?: string }) {
  return <div className="og-h"><Ornament /><div className="og-iname-big" data-rarity={rarity || undefined}>[{name}]</div></div>;
}

/** Opzioni in verde, una per riga, con "·". */
export function OgOpts({ lines, cls = "og-opt" }: { lines: ReactNode[]; cls?: string }) {
  if (!lines.length) return null;
  return <div className="og-lines">{lines.map((l, i) => <span className={cls} key={i}>· {l}</span>)}</div>;
}

/** Iniziali per l'icona quadrata (stesso criterio dell'inventario). */
export function initials(name: string): string {
  const stop = ["del", "della", "dello", "dei", "degli", "delle", "di", "da", "la", "il", "lo", "le", "gli", "un", "una"];
  const w = String(name || "?").replace(/['’:]/g, " ").split(/\s+/).filter((x) => x && !stop.includes(x.toLowerCase()));
  return (w.length ? w : [String(name || "?")]).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
}

/** Colore del Grado di maestria (I–X) sulla scala delle rarità: I–II Comune … IX Leggendario, X Mitico. */
const GRADE_RARITY = ["comune", "comune", "comune", "noncomune", "noncomune", "raro", "raro", "epico", "epico", "leggendario", "mitico"];
export function gradeRarity(lvl: number): string {
  const l = Math.max(0, Math.min(10, Math.round(Number(lvl) || 0)));
  return GRADE_RARITY[l];
}
export const roman = (lvl: number) => ROMAN[Number(lvl) || 0] ?? String(lvl);

/** Maestria: barra sottile e percentuale (MAX in oro). */
export function Mastery({ pct }: { pct: number | "MAX" }) {
  const max = pct === "MAX";
  const p = max ? 100 : Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <span className={`og-mastery${max ? " max" : ""}`}>
      <span className="og-mtrack" aria-hidden="true"><i style={{ width: `${p}%` }} /></span><b className="num">{max ? "MAX" : `${p}%`}</b>
    </span>
  );
}

/** Tooltip unico, position fixed nel body, posizionato e limitato alla viewport. */
export function TipLayer({ anchor, border, id, children }: { anchor: HTMLElement; border?: string; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    let left = r.right + m;
    if (left + w > vw - m) left = r.left - w - m;          // a sinistra se non c'è spazio a destra
    let top = r.top;
    if (left < m) {                                        // schermi stretti: sotto o sopra l'elemento
      left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), vw - w - m);
      top = r.bottom + m;
      if (top + h > vh - m) top = r.top - h - m;
    }
    top = Math.min(Math.max(m, top), Math.max(m, vh - h - m));
    left = Math.min(Math.max(m, left), Math.max(m, vw - w - m));
    setPos({ left: Math.round(left), top: Math.round(top) });
  }, [anchor, children]);
  const style: CSSProperties = { left: pos?.left ?? 0, top: pos?.top ?? 0, borderColor: border };
  return createPortal(
    <div ref={ref} id={id} className={`og-tip${pos ? " on" : ""}`} role="tooltip" style={style}>{children}</div>,
    document.body,
  );
}

/** Tooltip delle liste (titoli, skill…): mouse = passaggio, tastiera = focus, tocco/clic = fissa o chiude.
    Si chiude con Esc, scorrendo, ridimensionando o toccando fuori dalle righe. */
export function useOgTip<K extends string | number>() {
  const tipId = useId();
  const [tip, setTip] = useState<{ key: K; el: HTMLElement; pinned: boolean } | null>(null);
  const cur = useRef(tip);
  cur.current = tip;
  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTip(null); };
    const onDown = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest?.("[data-og-tip]")) setTip(null); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [tip, hide]);

  function bind(key: K) {
    const mine = cur.current?.key === key;
    return {
      "data-og-tip": "1",
      "aria-describedby": mine ? tipId : undefined,
      onPointerEnter: (e: RPointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") { const el = e.currentTarget; setTip((t) => (t?.pinned && t.key !== key ? t : { key, el, pinned: t?.key === key && t.pinned })); }
      },
      onPointerLeave: (e: RPointerEvent<HTMLElement>) => {
        if (e.pointerType === "mouse") setTip((t) => (t && t.key === key && !t.pinned ? null : t));
      },
      onFocus: (e: RFocusEvent<HTMLElement>) => { const el = e.currentTarget; setTip((t) => (t?.key === key ? t : { key, el, pinned: false })); },
      onBlur: () => setTip((t) => (t?.key === key ? null : t)),
      onClick: (e: RMouseEvent<HTMLElement>) => {
        const el = e.currentTarget;
        setTip((t) => (t?.key === key && t.pinned ? null : { key, el, pinned: true }));
      },
    };
  }
  return { tip, tipId, bind, hide };
}

/** Riga compatta di una lista OG: icona, `[Nome]`, dettagli in grigio, valore a destra. Apre il tooltip. */
export function OgRow({ rarity, icon, name, meta, right, label, dim, tipProps }: {
  rarity?: string; icon: ReactNode; name: string; meta?: ReactNode; right?: ReactNode; label: string; dim?: boolean;
  tipProps: ReturnType<ReturnType<typeof useOgTip>["bind"]>;
}) {
  return (
    <button type="button" className="og-item og-row" data-rarity={rarity || undefined} aria-label={label} {...tipProps}>
      <span className="og-ico" aria-hidden="true">{icon}</span>
      <span className={`og-iname${dim ? " og-blocked" : ""}`}>[{name}]</span>
      <span className="og-iqty">{right}</span>
      {meta != null && <span className="og-imeta">{meta}</span>}
    </button>
  );
}
