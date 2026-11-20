// Inventario stile MMORPG / Overgeared (porting di mockup/screens/inventario.js).
// Manichino a 16 slot, inventario illimitato per categorie, tooltip oggetto con confronto, drag & drop con pointer
// events (mouse dopo 6px, touch con pressione lunga), clic per equipaggiare/togliere. Le regole sono sul server:
// qui si mostrano `equipped`, `item_previews` e `unmet` ricevuti e si chiamano gli endpoint di equipaggiamento.
import {
  useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent as RFocusEvent, type MouseEvent as RMouseEvent,
  type PointerEvent as RPointerEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { api, errorText } from "../api/client";
import type { Character, Derived, DerivedFmt, EquipTypeDef, InventoryItem, ItemCategory, RulesConfig, SlotDef, SlotKey } from "../api/types";
import { useAppData } from "../auth/AppData";
import { fmtDiff, rarityKey } from "../lib/format";
import { Loading } from "./Status";
import { useToast } from "./Toast";
import { Ornament, Win } from "./Win";

type Filter = "tutti" | ItemCategory;
type Sort = "rarita" | "tipo" | "nome";
type Ctx = "bag" | "slot" | "ghost";
type Tip =
  | { kind: "item"; id: string; ctx: Ctx; el: HTMLElement }
  | { kind: "slot"; slot: SlotKey; el: HTMLElement }
  | { kind: "weight"; el: HTMLElement };
interface Drag { id: string; from: "bag" | "slot"; slot: SlotKey | null; ok: Set<SlotKey>; hover: string | null }
interface Gesture {
  id: string; from: "bag" | "slot"; slot: SlotKey | null; src: HTMLElement; pointerId: number; touch: boolean;
  x0: number; y0: number; lx: number; ly: number; started: boolean; timer?: number; scroll?: number;
  ghost?: HTMLElement; hover: string | null; ok: Set<SlotKey>;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "tutti", label: "Tutti" },
  { key: "equipaggiamento", label: "Equipaggiabili" },
  { key: "consumabili", label: "Consumabili" },
  { key: "materiali", label: "Materiali" },
  { key: "altro", label: "Altro" },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: "rarita", label: "Rarità" },
  { key: "tipo", label: "Tipo" },
  { key: "nome", label: "Nome" },
];
const SHORT_SLOT: Partial<Record<SlotKey, string>> = {
  manoPrincipale: "Mano P.", manoSecondaria: "Mano S.", mantello: "Mant.", ninnolo1: "Ninn.", ninnolo2: "Ninn.", cintura: "Cint.",
};
const TYPE_ABBR: Record<string, string> = {
  Arma: "ARMA", Armatura: "ARM", Scudo: "SCU", Accessorio: "ACC", Strumento: "STR", Materiale: "MAT", Cibo: "CIB", Libro: "LIB", Pozione: "POZ",
};
/* Derivate mostrate per prime nel confronto */
const MAIN_DER = ["hp", "mp", "sp", "difesa", "difesaMag", "evasione", "critico", "blocco", "carico"];
const SHORT_DER: Record<string, string> = {
  hp: "HP max", mp: "MP max", sp: "SP max", difesa: "Difesa", difesaMag: "Difesa magica", evasione: "Evasione",
  critico: "Critico", blocco: "Blocco", carico: "Carico", precisione: "Precisione", velocita: "Velocità", resElementi: "Res. elementi",
  resVeleni: "Res. veleni", iniziativa: "Iniziativa", attacchi: "Attacchi/turno", regen: "Regen HP", bonusExp: "Bonus EXP",
  moltFis: "Molt. fisico", moltMag: "Molt. magico",
};
/* Bonus degli oggetti che entrano nelle formule come "equipaggiamento" (valori assoluti) */
const FLAT_BONUS: Record<string, string> = { difesa: "Difesa", difesaMagica: "Difesa magica", blocco: "Blocco" };
const DRAG_PX = 6;
const HOLD_MS = 250;

/* ---------- Helper di sola presentazione ---------- */
const nf = (v: number) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString("it-IT");
function signed(v: number, kind?: DerivedFmt): string {
  if (kind) return fmtDiff(v, kind);
  return `${v < 0 ? "−" : "+"}${nf(Math.abs(v))}`;
}
const isCoin = (it: InventoryItem) => it.type === "Monete";
function initials(name: string): string {
  const stop = ["del", "della", "dello", "dei", "degli", "delle", "di", "da", "la", "il", "lo", "le", "gli", "un", "una"];
  const w = String(name || "?").replace(/['’]/g, " ").split(/\s+/).filter((x) => x && !stop.includes(x.toLowerCase()));
  return (w.length ? w : [String(name || "?")]).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
}
function bonusLines(stats: Record<string, number>, bonus: Record<string, number>, der: Record<string, Derived>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(stats || {})) if (v) out.push(`${signed(v)} ${k}`);
  for (const [k, v] of Object.entries(bonus || {})) {
    if (!v) continue;
    if (k === "blocco") out.push(`Blocco ${nf(v)}%`);
    else if (FLAT_BONUS[k]) out.push(`${FLAT_BONUS[k]} ${nf(v)}`);
    else {
      const d = der[k];
      const label = SHORT_DER[k] || d?.label || k;
      out.push(d?.fmt === "pct" ? `${signed(v)}% ${label}` : `${signed(v)} ${label}`);
    }
  }
  return out;
}

function Kv({ k, children, cls }: { k: string; children: ReactNode; cls?: string }) {
  return <div className="og-kv"><span className="og-k">{k}:</span> <span className={`og-v${cls ? ` ${cls}` : ""}`}>{children}</span></div>;
}

function DurBar({ it }: { it: InventoryItem }) {
  if (!it.durability || !it.durability.max) return null;
  const pct = Math.max(0, Math.min(100, (it.durability.cur / it.durability.max) * 100));
  return <span className={`inv-dur${pct < 25 ? " low" : pct < 50 ? " mid" : ""}`} aria-hidden="true"><i style={{ width: `${pct.toFixed(0)}%` }} /></span>;
}

function Figure() {
  return (
    <svg viewBox="0 0 120 250" aria-hidden="true" focusable="false">
      <ellipse className="inv-base" cx="60" cy="236" rx="40" ry="8" />
      <circle className="inv-aura" cx="60" cy="118" r="56" />
      <circle className="inv-body" cx="60" cy="28" r="16" />
      <path className="inv-body" d="M52 44 L68 44 L70 52 Q88 54 92 66 L100 126 Q101 132 95 133 L88 132 L80 82 L78 128 L82 226 Q82 230 77 230 L66 230 L61 146 L59 146 L54 230 L43 230 Q38 230 38 226 L42 128 L40 82 L32 132 L25 133 Q19 132 20 126 L28 66 Q32 54 50 52 Z" />
    </svg>
  );
}

/** Tooltip unico, position fixed nel body, posizionato e limitato alla viewport. */
function TipLayer({ anchor, border, children }: { anchor: HTMLElement; border?: string; children: ReactNode }) {
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
    <div ref={ref} className={`inv-tip${pos ? " on" : ""}`} role="tooltip" style={style}>{children}</div>,
    document.body,
  );
}

export function Inventory({ c, onChange }: { c: Character; onChange: (c: Character) => void }) {
  const { rules } = useAppData();
  if (!rules) return <Loading text="Caricamento regole…" />;
  return <InventoryView c={c} rules={rules} onChange={onChange} />;
}

function InventoryView({ c, rules, onChange }: { c: Character; rules: RulesConfig; onChange: (c: Character) => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("tutti");
  const [sort, setSort] = useState<Sort>("rarita");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(0);
  const startDrag = useRef<((g: Gesture, x: number, y: number) => void) | null>(null);

  useEffect(() => { setFilter("tutti"); setQuery(""); }, [c.id]);

  const slots = rules.slots;
  const types: Record<string, EquipTypeDef> = Object.fromEntries(rules.equip_types.map((t) => [t.key, t]));
  const slotLabel = (k: string) => slots.find((s) => s.key === k)?.label ?? k;
  const der: Record<string, Derived> = Object.fromEntries(c.derived.map((d) => [d.key, d]));
  const byId: Record<string, InventoryItem> = Object.fromEntries(c.inventory.map((it) => [it.id, it]));
  const eq = c.equipped || {};
  const typeOf = (it: InventoryItem | undefined) => (it?.equip_type ? types[it.equip_type] : undefined);
  const twoHanded = (it: InventoryItem | undefined) => !!typeOf(it)?.two_handed;
  const compatible = (it: InventoryItem) => typeOf(it)?.slots ?? [];
  const gradeOf = (r: string) => rules.rarities.find((x) => x.key === rarityKey(r))?.grade ?? 0;

  /* ---------- Azioni (server) ---------- */
  function equippedNames(ch: Character): Map<string, SlotKey> {
    const m = new Map<string, SlotKey>();
    for (const it of ch.inventory) if (it.slot) m.set(it.id, it.slot);
    return m;
  }
  async function run(call: () => Promise<Character>) {
    if (busy) return;
    setTip(null);
    setBusy(true);
    const before = equippedNames(c);
    try {
      const next = await call();
      const after = equippedNames(next);
      const names = Object.fromEntries(next.inventory.map((it) => [it.id, it]));
      const lines: string[] = [];
      for (const [id, slot] of after) {
        const it = names[id];
        if (!before.has(id)) lines.push(`Equipaggiato: ${it.name} (${twoHanded(it) ? "Due mani" : slotLabel(slot)}).`);
        else if (before.get(id) !== slot) lines.push(`${it.name} → ${slotLabel(slot)}.`);
      }
      const back = [...before.keys()].filter((id) => !after.has(id)).map((id) => names[id]?.name ?? byId[id]?.name).filter(Boolean);
      if (back.length === 1 && !lines.length) lines.push(`${back[0]} torna nella borsa.`);
      else if (back.length) lines.push(`Torna nella borsa: ${back.join(", ")}.`);
      onChange(next);
      if (lines.length) toast("SISTEMA", lines);
    } catch (e) {
      toast("SISTEMA", [errorText(e)], { bad: true });
    } finally {
      setBusy(false);
    }
  }
  function equipItem(it: InventoryItem, slot?: SlotKey) {
    if (!it.equip_type) { toast("SISTEMA", [`${it.name}: oggetto non equipaggiabile.`]); return; }
    const p = c.item_previews[it.id];
    if (p && !p.ok) { toast("SISTEMA", [p.error || `Impossibile equipaggiare ${it.name}.`], { bad: true }); return; }
    if (slot && !compatible(it).includes(slot)) {
      toast("SISTEMA", [`${it.name} non va nello slot ${slotLabel(slot)}.`], { bad: true });
      return;
    }
    void run(() => api.equip(c.id, it.id, slot));
  }
  function unequip(slot: SlotKey) {
    const it = byId[eq[slot] || ""];
    void run(() => api.unequip(c.id, slot === "manoSecondaria" && twoHanded(it) ? "manoPrincipale" : slot));
  }
  function move(from: SlotKey, to: SlotKey) {
    void run(() => api.moveSlot(c.id, from, to));
  }

  /* ---------- Drag & drop con pointer events (mouse, penna e touch) ----------
     Mouse: si trascina dopo 6px di movimento. Touch: si tiene premuto ~0,25 s, poi si trascina
     (così il dito che scorre la pagina non sposta oggetti per sbaglio). */
  const latest = useRef({ c, byId, equipItem, unequip, move, compatible, twoHanded });
  latest.current = { c, byId, equipItem, unequip, move, compatible, twoHanded };

  useEffect(() => {
    function targetAt(g: Gesture, x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y);
      const root = rootRef.current;
      if (!el || !root || !root.contains(el)) return null;
      const sl = (el as HTMLElement).closest<HTMLElement>("[data-slot]");
      if (sl && g.ok.has(sl.dataset.slot as SlotKey)) return sl.dataset.slot!;
      if (g.from === "slot" && (el as HTMLElement).closest("[data-bagzone]")) return "bag";
      return null;
    }
    function moveTo(g: Gesture, x: number, y: number) {
      if (g.ghost) { g.ghost.style.left = `${x}px`; g.ghost.style.top = `${y}px`; }
      const t = targetAt(g, x, y);
      if (t !== g.hover) { g.hover = t; setDrag((d) => (d ? { ...d, hover: t } : d)); }
    }
    function autoScroll() {
      const g = gesture.current;
      if (!g || !g.started) return;
      const edge = 70, y = g.ly;
      let dy = 0;
      if (y < edge) dy = -Math.ceil((edge - y) / 5);
      else if (y > window.innerHeight - edge) dy = Math.ceil((y - (window.innerHeight - edge)) / 5);
      if (dy) { window.scrollBy(0, dy); moveTo(g, g.lx, g.ly); }
    }
    function start(g: Gesture, x: number, y: number) {
      const L = latest.current;
      const it = L.byId[g.id];
      if (!it) return;
      setTip(null);
      const ok = new Set<SlotKey>(L.compatible(it));
      if (g.from === "slot" && g.slot) ok.delete(g.slot);
      if (g.from === "slot" && L.twoHanded(it)) ok.clear();
      g.ok = ok;
      g.started = true;
      const face = g.src.querySelector<HTMLElement>(".inv-ico") || g.src;
      const ghost = face.cloneNode(true) as HTMLElement;
      ghost.dataset.rarity = g.src.dataset.rarity || "";
      ghost.removeAttribute("id");
      ghost.classList.add("inv-drag-ghost");
      ghost.setAttribute("aria-hidden", "true");
      const r = face.getBoundingClientRect();
      ghost.style.width = `${r.width}px`;
      ghost.style.height = `${r.height}px`;
      document.body.appendChild(ghost);
      g.ghost = ghost;
      document.body.classList.add("inv-grabbing");
      setDrag({ id: g.id, from: g.from, slot: g.slot, ok, hover: null });
      moveTo(g, x, y);
      g.scroll = window.setInterval(autoScroll, 16);
    }
    function end(x: number, y: number, cancelled: boolean) {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      window.clearTimeout(g.timer);
      window.clearInterval(g.scroll);
      document.body.classList.remove("inv-grabbing");
      if (!g.started) return;
      const t = cancelled ? null : targetAt(g, x, y);
      suppressClick.current = Date.now();
      g.ghost?.remove();
      setDrag(null);
      if (!t) return;
      const L = latest.current;
      if (t === "bag") {
        if (g.slot) L.unequip(g.slot);
        return;
      }
      const it = L.byId[g.id];
      if (g.from === "bag" && it) L.equipItem(it, t as SlotKey);
      else if (g.from === "slot" && g.slot) L.move(g.slot, t as SlotKey);
    }
    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      g.lx = e.clientX; g.ly = e.clientY;
      if (g.started) { e.preventDefault(); moveTo(g, e.clientX, e.clientY); return; }
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > DRAG_PX) {
        if (g.touch) { end(0, 0, true); return; } // il dito sta scorrendo la pagina
        start(g, e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => { const g = gesture.current; if (g && e.pointerId === g.pointerId) end(e.clientX, e.clientY, false); };
    const onCancel = (e: PointerEvent) => { const g = gesture.current; if (g && e.pointerId === g.pointerId) end(0, 0, true); };
    /* Durante il trascinamento su touch blocca lo scorrimento della pagina */
    const onTouchMove = (e: TouchEvent) => { if (gesture.current?.started) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (gesture.current) end(0, 0, true); setTip(null); } };
    const onBlur = () => { if (gesture.current) end(0, 0, true); };
    const hide = () => setTip(null);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    startDrag.current = start;
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
      const g = gesture.current;
      if (g) { window.clearTimeout(g.timer); window.clearInterval(g.scroll); g.ghost?.remove(); gesture.current = null; }
      document.body.classList.remove("inv-grabbing");
    };
  }, []);

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || gesture.current || busy) return;
    const src = (e.target as HTMLElement).closest<HTMLElement>("[data-drag]");
    if (!src || !rootRef.current?.contains(src)) return;
    const g: Gesture = {
      id: src.dataset.item || "", from: src.dataset.from === "slot" ? "slot" : "bag", slot: (src.dataset.slot as SlotKey) || null,
      src, pointerId: e.pointerId, touch: e.pointerType !== "mouse", x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY,
      started: false, hover: null, ok: new Set(),
    };
    gesture.current = g;
    if (g.touch) {
      g.timer = window.setTimeout(() => { if (gesture.current === g && !g.started) startDrag.current?.(g, g.lx, g.ly); }, HOLD_MS);
    }
  }
  const clickOk = () => Date.now() - suppressClick.current > 400;

  /* ---------- Tooltip ---------- */
  function tipHandlers(make: (el: HTMLElement) => Tip) {
    return {
      onMouseEnter: (e: RMouseEvent<HTMLElement>) => { if (!gesture.current?.started) setTip(make(e.currentTarget)); },
      onMouseLeave: () => setTip(null),
      onFocus: (e: RFocusEvent<HTMLElement>) => setTip(make(e.currentTarget)),
      onBlur: () => setTip(null),
    };
  }

  function itemTip(it: InventoryItem, ctx: Ctx): ReactNode {
    const rk = rarityKey(it.rarity);
    const t = typeOf(it);
    const b = it.bonus || {};
    const pair: ReactNode[] = [];
    if (it.durability && it.durability.max) {
      const low = it.durability.cur / it.durability.max < 0.25;
      pair.push(<Kv key="dur" k="Durabilità" cls={low ? "bad" : ""}><span className="num">{it.durability.cur}/{it.durability.max}</span></Kv>);
    }
    if (it.weapon_base) pair.push(<Kv key="wb" k="Danno base"><span className="num">{nf(it.weapon_base)}</span></Kv>);
    if (b.difesa) pair.push(<Kv key="def" k="Difesa"><span className="num">{nf(b.difesa)}</span></Kv>);
    if (b.difesaMagica) pair.push(<Kv key="dm" k="Difesa magica"><span className="num">{nf(b.difesaMagica)}</span></Kv>);
    const rest = Object.fromEntries(Object.entries(b).filter(([k]) => k !== "difesa" && k !== "difesaMagica"));
    const opts = bonusLines(it.stats, rest, der);
    const unmet = new Set(it.unmet || []);
    const req = Object.entries(it.req || {});
    const p = ctx === "bag" && t ? c.item_previews[it.id] : undefined;
    const hint = ctx === "bag" ? (t ? "Clic: equipaggia · Trascina sugli slot illuminati" : "Non equipaggiabile")
      : ctx === "slot" ? "Clic: rimetti nell'inventario · Trascina per spostare"
        : "Mano secondaria bloccata dall'arma a due mani. Clic: togli l'arma";
    let diffs: { label: string; dv: number; kind?: DerivedFmt }[] = [];
    if (p?.ok) {
      diffs = [
        ...c.stats.filter((r) => p.stats[r.code]).map((r) => ({ label: r.code, dv: p.stats[r.code] })),
        ...[...MAIN_DER, ...c.derived.map((d) => d.key).filter((k) => !MAIN_DER.includes(k))]
          .filter((k) => p.derived[k] && der[k])
          .map((k) => ({ label: SHORT_DER[k] || der[k].label, dv: p.derived[k], kind: der[k].fmt })),
      ];
    }
    return (
      <>
        <div className="og-h"><Ornament /><div className="og-iname-big" data-rarity={rk}>[{it.name}]</div></div>
        <Kv k="Rarità"><span data-rarity={rk}>{it.rarity}</span></Kv>
        {pair.length > 0 && <div className="og-pair">{pair}</div>}
        <Kv k="Tipo">{[it.type || "Oggetto", t?.label].filter(Boolean).join(" · ")}</Kv>
        {opts.length > 0
          ? <div className="og-lines">{opts.map((l) => <span className="og-opt" key={l}>· {l}</span>)}</div>
          : it.stats_text && <span className="og-opt">· {it.stats_text}</span>}
        {req.length > 0
          ? <Kv k="Restrizioni d'uso">{req.map(([k, v], i) => {
            const label = k === "level" ? `Livello ${v}` : `${k} ${v}`;
            return <span key={k}>{i > 0 && ", "}<span className={unmet.has(label) ? "og-bad" : ""}>{label}</span></span>;
          })}</Kv>
          : t && <Kv k="Restrizioni d'uso">Nessuna</Kv>}
        <Kv k="Peso"><span className="num">{nf(it.weight)} kg{it.qty > 1 ? ` × ${it.qty} = ${nf(it.qty * it.weight)} kg` : ""}</span></Kv>
        {it.desc && <div className="og-flavor">{it.desc}</div>}
        {p && (
          <>
            <div className="og-sep">Confronto</div>
            {!p.ok && <span className="og-bad">Non indossabile: {p.unmet.length ? p.unmet.join(", ") : p.error}</span>}
            {p.ok && <span className="muted">{p.replaces.length ? `Sostituisce: ${p.replaces.join(", ")}` : "Slot libero: nessuna sostituzione"}</span>}
            {p.ok && !diffs.length && <span className="muted">Nessuna differenza sulle statistiche.</span>}
            {diffs.slice(0, 12).map((d) => (
              <span className="inv-tl" key={d.label}><span>{d.label}</span><span className={`num ${d.dv > 0 ? "good" : "bad"}`}>{signed(d.dv, d.kind)}</span></span>
            ))}
            {diffs.length > 12 && <span className="muted">… e altre {diffs.length - 12} differenze</span>}
          </>
        )}
        <span className="inv-tsep" /><span className="inv-hint">{hint}</span>
      </>
    );
  }
  function slotTip(key: SlotKey): ReactNode {
    const accepts = rules.equip_types.filter((t) => t.slots.includes(key)).map((t) => t.label);
    const fits = c.inventory.filter((it) => !it.slot && compatible(it).includes(key));
    return (
      <>
        <span className="inv-tn">{slotLabel(key)}</span>
        <span className="muted">Slot vuoto</span>
        <span className="gold">Accetta: {accepts.join(", ")}</span>
        {fits.length ? <span className="good">Nella borsa: {fits.map((x) => x.name).join(", ")}</span>
          : <span className="muted">Nessun oggetto compatibile nella borsa</span>}
      </>
    );
  }
  function weightTip(w: number, cap: number): ReactNode {
    const d = der.carico;
    return (
      <>
        <span className="inv-tn">Peso trasportato</span>
        <span>Somma di quantità × peso di tutto l'inventario (equipaggiato compreso).</span>
        <span className="inv-tl"><span>Totale</span><b className="num">{nf(w)} kg</b></span>
        <span className="inv-tl"><span>Carico massimo</span><b className="num">{nf(cap)} kg</b></span>
        {d && <span className="mono muted">{d.formula} = {d.explain}</span>}
        {w > cap && <span className="bad">Sovraccarico!</span>}
      </>
    );
  }

  /* ---------- Manichino ---------- */
  function dragCls(key: SlotKey): string {
    if (!drag) return "";
    if (drag.from === "slot" && drag.slot === key) return "";
    return `${drag.ok.has(key) ? " inv-drop-ok" : " inv-dim"}${drag.hover === key ? " inv-drop-hover" : ""}`;
  }
  function slotCell(s: SlotDef) {
    const it = byId[eq[s.key] || ""];
    const short = SHORT_SLOT[s.key] || s.label;
    if (!it) {
      return (
        <button key={s.key} type="button" className={`inv-cell inv-slot inv-empty${dragCls(s.key)}`} data-slot={s.key}
          aria-label={`${s.label}: vuoto`} {...tipHandlers((el) => ({ kind: "slot", slot: s.key, el }))}>
          <span className="inv-elabel">{short}</span>
        </button>
      );
    }
    const rk = rarityKey(it.rarity);
    if (s.key === "manoSecondaria" && twoHanded(it)) {
      return (
        <button key={s.key} type="button" className={`inv-cell inv-slot inv-ghost${dragCls(s.key)}`} data-slot={s.key} data-rarity={rk}
          aria-label={`${s.label}: bloccato da ${it.name} (due mani). Premi per togliere l'arma`} disabled={busy}
          onClick={() => { if (clickOk()) unequip(s.key); }} {...tipHandlers((el) => ({ kind: "item", id: it.id, ctx: "ghost", el }))}>
          <span className="inv-sig" aria-hidden="true">{initials(it.name)}</span><span className="inv-lock" aria-hidden="true">2M</span>
        </button>
      );
    }
    const dragging = drag && drag.from === "slot" && drag.slot === s.key;
    return (
      <button key={s.key} type="button" className={`inv-cell inv-slot${dragCls(s.key)}${dragging ? " inv-dragging" : ""}`}
        data-slot={s.key} data-item={it.id} data-from="slot" data-drag="1" data-rarity={rk} disabled={busy}
        aria-label={`${s.label}: ${it.name}. Premi per rimettere nella borsa`}
        onClick={() => { if (clickOk()) unequip(s.key); }} {...tipHandlers((el) => ({ kind: "item", id: it.id, ctx: "slot", el }))}>
        <span className="inv-type" aria-hidden="true">{TYPE_ABBR[it.type] || String(it.type || "").slice(0, 3).toUpperCase()}</span>
        <span className="inv-sig" aria-hidden="true">{initials(it.name)}</span>
        <DurBar it={it} />
      </button>
    );
  }
  const side = (k: SlotDef["side"]) => slots.filter((s) => s.side === k);
  const bottom = side("bottom");
  const hands = bottom.filter((s) => s.key === "manoPrincipale" || s.key === "manoSecondaria");
  const trinkets = bottom.filter((s) => !hands.includes(s));

  /* ---------- Borsa ---------- */
  const equippedIds = new Set(Object.values(eq));
  const all = c.inventory.filter((it) => !isCoin(it));
  const q = query.trim().toLowerCase();
  let list = all.filter((it) => !equippedIds.has(it.id));
  if (filter !== "tutti") list = list.filter((it) => it.category === filter);
  const filtered = q ? list.filter((it) => it.name.toLowerCase().includes(q)) : list;
  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name, "it");
  const sorted = [...filtered].sort(sort === "rarita" ? (a, b) => gradeOf(b.rarity) - gradeOf(a.rarity) || byName(a, b)
    : sort === "tipo" ? (a, b) => a.type.localeCompare(b.type, "it") || byName(a, b) : byName);
  const w = c.inventory.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.weight) || 0), 0);
  const cap = der.carico?.value ?? 0;
  const pct = cap > 0 ? Math.min(100, (w / cap) * 100) : 0;
  const wcls = w > cap ? " over" : pct >= 75 ? " heavy" : "";
  const bagDrop = drag?.from === "slot" ? ` inv-drop-ok${drag.hover === "bag" ? " inv-drop-hover" : ""}` : "";

  function bagRow(it: InventoryItem) {
    const t = typeOf(it);
    const rk = rarityKey(it.rarity);
    const meta = [it.type, t?.label, it.rarity].filter(Boolean).join(" · ");
    const dragging = drag && drag.from === "bag" && drag.id === it.id;
    const blocked = !!t && c.item_previews[it.id]?.ok === false;
    return (
      <button key={it.id} type="button" className={`og-item${dragging ? " inv-dragging" : ""}`} data-item={it.id} data-from="bag"
        {...(t ? { "data-drag": "1" } : {})} data-rarity={rk} disabled={busy}
        aria-label={`${it.name}, ${it.rarity}${it.qty > 1 ? `, quantità ${it.qty}` : ""}${t ? (blocked ? ". Requisiti non soddisfatti" : ". Premi per equipaggiare") : ". Non equipaggiabile"}`}
        onClick={() => { if (clickOk()) equipItem(it); }} {...tipHandlers((el) => ({ kind: "item", id: it.id, ctx: "bag", el }))}>
        <span className="inv-ico" aria-hidden="true">{initials(it.name)}</span>
        <span className={`og-iname${blocked ? " og-blocked" : ""}`}>[{it.name}]</span>
        <span className="og-iqty num">{it.qty > 1 ? `×${it.qty.toLocaleString("it-IT")}` : ""}</span>
        <span className="og-imeta">{meta}{blocked && <span className="og-bad"> · requisiti</span>}</span>
      </button>
    );
  }

  let tipNode: ReactNode = null;
  let tipBorder: string | undefined;
  if (tip && !drag) {
    if (tip.kind === "item" && byId[tip.id]) {
      tipNode = itemTip(byId[tip.id], tip.ctx);
      tipBorder = `var(--r-${rarityKey(byId[tip.id].rarity)})`;
    } else if (tip.kind === "slot") tipNode = slotTip(tip.slot);
    else if (tip.kind === "weight") tipNode = weightTip(w, cap);
  }

  return (
    <div className={`inv-root${busy ? " inv-busy" : ""}`} ref={rootRef} onPointerDown={onPointerDown}
      onContextMenu={(e) => { if ((e.target as HTMLElement).closest("[data-drag]")) e.preventDefault(); }}
      onDragStart={(e) => e.preventDefault()}>
      <div className="inv-layout">
        <Win og title="Equipaggiamento" className="inv-a-doll">
          <div className="inv-doll">
            <div className="inv-col">{side("left").map(slotCell)}</div>
            <div className="inv-fig"><Figure /></div>
            <div className="inv-col">{side("right").map(slotCell)}</div>
            <div className="inv-bottom">{hands.map(slotCell)}<span className="inv-gap" aria-hidden="true" />{trinkets.map(slotCell)}</div>
          </div>
          <p className="footnote">Trascina un oggetto su uno slot illuminato, tra due slot per scambiarli, nell'inventario per toglierlo. Su touch: tieni premuto e trascina. Il clic fa lo stesso senza trascinare.</p>
        </Win>
        <Win og title="Inventario" className="inv-a-bag">
          <div className="og-info">
            <Kv k="Oggetti">{all.length} <span className="muted">· {new Set(Object.values(eq)).size} equipaggiati · spazio illimitato</span></Kv>
            <div className="og-pair">
              <Kv k="Corone d'Oro"><span className="num">{(c.corone || 0).toLocaleString("it-IT")}</span></Kv>
              <Kv k="Scellini"><span className="num">{(c.scellini || 0).toLocaleString("it-IT")}</span></Kv>
            </div>
          </div>
          <div className={`inv-weight${wcls}`} tabIndex={0} {...tipHandlers((el) => ({ kind: "weight", el }))}>
            <div className="bar-top"><span className="og-k">Peso:</span><span className={`num ${w > cap ? "og-bad" : "og-v"}`}>{nf(w)} / {nf(cap)} kg</span></div>
            <div className="bar-track" role="progressbar" aria-label="Peso trasportato" aria-valuemin={0} aria-valuemax={Math.round(cap)} aria-valuenow={Math.round(w)}>
              <div className="bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
            </div>
          </div>
          <div className="og-tools">
            <input className="input og-search" type="search" placeholder="Cerca un oggetto…" aria-label="Cerca nell'inventario" autoComplete="off"
              value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="inv-sort small"><span className="label">Ordina</span>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
          <div className="inv-filters" role="group" aria-label="Filtra oggetti">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className="btn ghost" aria-pressed={f.key === filter} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className={`og-list${bagDrop}`} data-bagzone="1" aria-label="Borsa">
            {rules.item_categories.map((g) => {
              const rows = sorted.filter((it) => it.category === g.key);
              if (!rows.length) return null;
              return (
                <div key={g.key} className="og-groupbox">
                  <div className="og-sep og-group">{g.label} <span className="num">({rows.length})</span></div>
                  {rows.map(bagRow)}
                </div>
              );
            })}
            {!sorted.length && (
              <div className="og-empty">{q ? "Nessun oggetto trovato." : `Nessun oggetto${filter !== "tutti" ? " in questa categoria" : ""}.`}</div>
            )}
          </div>
          <p className="footnote">Nessun limite di oggetti: conta solo il peso. I requisiti non soddisfatti impediscono di equipaggiare.</p>
        </Win>
      </div>
      {tipNode && tip && <TipLayer anchor={tip.el} border={tipBorder}>{tipNode}</TipLayer>}
    </div>
  );
}
