// Mock in memoria del backend, attivo solo con VITE_MOCK=1 (npm run dev:mock).
// Simula il server: qui (e solo qui) le regole sono replicate dal mockup per poter sviluppare senza backend.
import type {
  Campaign, Character, CharacterSummary, Derived, DerivedFmt, Effect, EquipTypeDef, InventoryItem, ItemPreview, Issue, Npc,
  Resources, Roll, RollCall, RollCrit, RollMod, RollRequest, RulesConfig, SlotDef, SlotKey, StatRow, User,
} from "./types";

type Res = { status: number; data: unknown };

/* ---------- Regole (copia di mockup/rules.js) ---------- */
const SOURCES = ["iniziale", "creazione", "investiti", "levelup", "altro", "titoli", "oggetti"] as const;
const statTotal = (r: Partial<StatRow>) => SOURCES.reduce((s, k) => s + (Number(r[k]) || 0), 0);

type Calc = { t: Record<string, number>; eq: Character["equip"]; mg: Character["magia"]; has: (code: string) => boolean };
interface Def {
  key: string; label: string; fmt: DerivedFmt; src: string; cap?: number; disputed?: boolean;
  /** derivata di una statistica avanzata: vale solo se il PG ha quella statistica */
  onlyIf?: string;
  calc: (x: Calc) => number; formula: (x: Calc) => string; explain?: (x: Calc) => string; note?: (x: Calc) => string;
}
const div = (mg: Calc["mg"]) => Math.max(10, 100 - 10 * ((mg.nucleo || 0) + (mg.talenti || 0)));
const f = (s: string) => () => s;
const DEFS: Def[] = [
  { key: "hp", label: "Vita (HP) max", fmt: "int", src: "Regole", calc: ({ t }) => 100 + t.VIT * 15, formula: f("100 + VIT×15") },
  { key: "mp", label: "Mana (MP) max", fmt: "int", src: "Regole", calc: ({ t }) => 50 + t.INT * 10, formula: f("50 + INT×10") },
  { key: "sp", label: "Stamina (SP) max", fmt: "int", src: "Regole (confermata il 19/11/2026)", calc: ({ t }) => 50 + (t.STR + t.DEX) * 5, formula: f("50 + (STR+DEX)×5") },
  { key: "carico", label: "Carico massimo", fmt: "kg", src: "Regole", calc: ({ t }) => 50 + t.STR * 2, formula: f("50 + STR×2 kg") },
  // Con la Fortuna (LCK) l'Evasione è (DEX + LCK)/20, come nel foglio Excel di Dante
  { key: "evasione", label: "Evasione", fmt: "pct", src: "Regole + Excel (Fortuna)", calc: ({ t }) => (t.DEX + (t.LCK ?? 0)) / 20,
    formula: ({ has }) => (has("LCK") ? "(DEX + LCK) / 20 %" : "DEX / 20 %"),
    explain: ({ t, has }) => (has("LCK") ? `(${t.DEX} + ${t.LCK}) / 20` : `${t.DEX} / 20`) },
  { key: "precisione", label: "Precisione", fmt: "pct", src: "Regole", calc: ({ t }) => 70 + t.DEX / 10, formula: f("70 + DEX/10 %") },
  { key: "regen", label: "Regen HP", fmt: "permin", src: "Regole", calc: ({ t }) => t.VIT / 10, formula: f("VIT / 10 HP/min") },
  { key: "bonusExp", label: "Bonus EXP", fmt: "pct", src: "Regole", calc: ({ t }) => t.INT / 20, formula: f("INT / 20 %") },
  { key: "moltFis", label: "Molt. danno fisico", fmt: "mult", src: "Regole", calc: ({ t }) => 1 + t.STR / 100, formula: f("1 + STR/100") },
  { key: "moltMag", label: "Molt. danno magico", fmt: "mult", src: "Regole (decisa il 19/11/2026)",
    calc: ({ t, mg }) => 1 + t.INT / div(mg), formula: ({ mg }) => `1 + INT/${div(mg)}`, explain: ({ t, mg }) => `1 + ${t.INT}/${div(mg)}`,
    note: ({ mg }) => `Divisore base 100, −10 per ogni grado di nucleo e talento magico (nucleo ${mg.nucleo}, talenti ${mg.talenti}).` },
  { key: "difesa", label: "Difesa", fmt: "int1", src: "Regole (decisa il 19/11/2026)",
    calc: ({ t, eq }) => t.VIT / 10 + eq.difesa * (1 + t.VIT / 100), formula: f("VIT/10 + Difesa equip × (1 + VIT/100)"),
    explain: ({ t, eq }) => `${t.VIT}/10 + ${eq.difesa} × (1 + ${t.VIT}/100)`, note: f("Si sottrae al danno fisico subito (minimo 1).") },
  { key: "difesaMag", label: "Difesa magica", fmt: "int1", src: "Regole (decisa il 19/11/2026)",
    calc: ({ t, eq }) => t.INT / 10 + eq.difesaMagica * (1 + t.INT / 100), formula: f("INT/10 + Difesa magica equip × (1 + INT/100)"),
    explain: ({ t, eq }) => `${t.INT}/10 + ${eq.difesaMagica} × (1 + ${t.INT}/100)`, note: f("Riduce gli effetti magici ostili; il danno magico diretto ignora la Difesa fisica.") },
  { key: "iniziativa", label: "Iniziativa", fmt: "dec", src: "Regole (decisa il 19/11/2026)", calc: ({ t }) => 10 + t.DEX / 10, formula: f("10 + DEX/10"),
    note: f("Ordine di turno decrescente; a parità agisce chi ha più DEX.") },
  { key: "critico", label: "Prob. critico", fmt: "pct", src: "Regole (decisa il 19/11/2026)", cap: 75, calc: ({ t }) => 5 + t.DEX / 40,
    formula: f("5 + DEX/40 % (max 75%)"), note: f("Il critico raddoppia il danno. I bonus degli oggetti si sommano, sempre entro il 75%.") },
  { key: "blocco", label: "Prob. blocco", fmt: "pct", src: "Regole (decisa il 19/11/2026)", cap: 75,
    calc: ({ t, eq }) => (eq.blocco > 0 ? eq.blocco + t.STR / 40 : 0), formula: f("Blocco scudo + STR/40 % (solo con scudo, max 75%)"),
    explain: ({ t, eq }) => (eq.blocco > 0 ? `${eq.blocco} + ${t.STR}/40` : "nessuno scudo equipaggiato → 0"), note: f("Un blocco riuscito annulla il colpo.") },
  { key: "attacchi", label: "Attacchi per turno", fmt: "dec", src: "Excel", calc: ({ t }) => 1 + t.DEX * 0.005, formula: f("1 + DEX×0.005") },
  { key: "velocita", label: "Velocità movimento", fmt: "pct", src: "Excel", calc: ({ t }) => 100 + t.DEX / 5, formula: f("100 + DEX/5 %") },
  { key: "resVeleni", label: "Res. veleni", fmt: "pct", src: "Excel", calc: ({ t }) => t.VIT / 5, formula: f("VIT / 5 %") },
  { key: "resElementi", label: "Res. elementi", fmt: "pct", src: "Excel", calc: ({ t }) => t.VIT / 10, formula: f("VIT / 10 %") },
  // Derivate delle statistiche avanzate (formule dei fogli Excel)
  { key: "bonusFortuna", label: "Bonus Fortuna sui tiri", fmt: "dec", src: "Excel (Dante)", onlyIf: "LCK", calc: ({ t }) => t.LCK / 100, formula: f("LCK / 100"),
    note: f("Nel foglio di Dante la cella calcola LCK/100, ma la descrizione dice LCK/10: da confermare.") },
  { key: "ki", label: "KI max", fmt: "int", src: "Excel (Corax)", onlyIf: "KI", calc: ({ t }) => 100 + t.KI * 8, formula: f("100 + KI×8"),
    note: f("Risorsa come Vita e Mana: si spende in combattimento e rigenera a fine turno.") },
  { key: "kiCombat", label: "Regen KI in combattimento", fmt: "dec", src: "Excel (Corax)", onlyIf: "KI", calc: ({ t }) => t.VIT / 30, formula: f("VIT / 30 a turno") },
  { key: "kiFuori", label: "Regen KI fuori combattimento", fmt: "permin", src: "Excel (Corax)", onlyIf: "KI", calc: ({ t }) => t.VIT / 15, formula: f("VIT / 15 al minuto") },
  { key: "kiMeditazione", label: "Regen KI in meditazione", fmt: "permin", src: "Excel (Corax)", onlyIf: "KI", calc: ({ t }) => t.VIT / 5, formula: f("VIT / 5 al minuto") },
];

function totalsOf(stats: Partial<StatRow>[]): Record<string, number> {
  const o: Record<string, number> = { STR: 0, DEX: 0, VIT: 0, INT: 0 };
  for (const r of stats) if (r.code) o[r.code] = statTotal(r);
  return o;
}
function derivedOf(stats: Partial<StatRow>[], ib: Record<string, number> = {}, eq?: Partial<Character["equip"]>, mg?: Partial<Character["magia"]>): Derived[] {
  const x: Calc = {
    t: totalsOf(stats),
    eq: { difesa: 0, difesaMagica: 0, blocco: 0, ...(eq || {}) },
    mg: { nucleo: 0, talenti: 0, ...(mg || {}) },
    has: (code) => stats.some((r) => r.code === code),
  };
  return DEFS.filter((d) => !d.onlyIf || x.has(d.onlyIf)).map((d) => {
    const raw = d.calc(x);
    const base = d.cap != null ? Math.min(d.cap, raw) : raw;
    const bonus = Number(ib[d.key]) || 0;
    const value = d.cap != null ? Math.min(d.cap, base + bonus) : base + bonus;
    const formula = d.formula(x);
    const explain = d.explain ? d.explain(x)
      : formula.replace(/ \(.*\)$/, "").replace(/ %$/, "").replace(/\b(STR|DEX|VIT|INT|LCK|KI)\b/g, (m) => String(x.t[m] ?? m));
    return { key: d.key, label: d.label, fmt: d.fmt, base, bonus, value, formula, explain, src: d.src, note: d.note ? d.note(x) : null, cap: d.cap ?? null, disputed: false };
  });
}


/* ---------- Equipaggiamento (copia di backend/app/rules.py) ---------- */
const SLOT_DEFS: SlotDef[] = [
  { key: "testa", label: "Testa", side: "left" }, { key: "collo", label: "Collo", side: "left" },
  { key: "spalle", label: "Spalle", side: "left" }, { key: "mantello", label: "Mantello", side: "left" },
  { key: "torso", label: "Torso", side: "left" }, { key: "polsi", label: "Polsi", side: "left" },
  { key: "mani", label: "Mani", side: "right" }, { key: "cintura", label: "Cintura", side: "right" },
  { key: "gambe", label: "Gambe", side: "right" }, { key: "piedi", label: "Piedi", side: "right" },
  { key: "anello1", label: "Anello", side: "right" }, { key: "anello2", label: "Anello", side: "right" },
  { key: "ninnolo1", label: "Ninnolo", side: "bottom" }, { key: "ninnolo2", label: "Ninnolo", side: "bottom" },
  { key: "manoPrincipale", label: "Mano principale", side: "bottom" }, { key: "manoSecondaria", label: "Mano secondaria", side: "bottom" },
];
const MAIN: SlotKey = "manoPrincipale";
const OFF: SlotKey = "manoSecondaria";
const et = (key: string, label: string, slots: SlotKey[], two_handed = false): EquipTypeDef => ({ key, label, slots, two_handed });
const EQUIP_TYPES: EquipTypeDef[] = [
  et("elmo", "Elmo", ["testa"]), et("amuleto", "Amuleto", ["collo"]), et("spallacci", "Spallacci", ["spalle"]),
  et("mantello", "Mantello", ["mantello"]), et("corazza", "Corazza / Veste", ["torso"]), et("bracciali", "Bracciali", ["polsi"]),
  et("guanti", "Guanti", ["mani"]), et("cintura", "Cintura", ["cintura"]), et("gambali", "Gambali", ["gambe"]),
  et("stivali", "Stivali", ["piedi"]), et("anello", "Anello", ["anello1", "anello2"]), et("ninnolo", "Ninnolo", ["ninnolo1", "ninnolo2"]),
  et("unaMano", "Una mano", [MAIN, OFF]), et("manoPrincipale", "Mano principale", [MAIN]), et("dueMani", "Due mani", [MAIN], true),
  et("scudo", "Scudo", [OFF]), et("tenuto", "Tenuto in mano secondaria", [OFF]),
];
const ET: Record<string, EquipTypeDef> = Object.fromEntries(EQUIP_TYPES.map((t) => [t.key, t]));
const FORMULA_KEYS = ["difesa", "difesaMagica", "blocco"] as const;
const CONSUMABLE_TYPES = ["Cibo", "Pozione", "Consumabile", "Bevanda", "Pergamena"];
const slotLabel = (k: string) => SLOT_DEFS.find((x) => x.key === k)?.label ?? k;

let itemSeq = 1;
type ItemIn = Partial<InventoryItem> & { name: string };
function mkItem(p: ItemIn): InventoryItem {
  const it: InventoryItem = {
    id: p.id || `mk-${itemSeq++}`, rarity: "Comune", type: "", category: "altro", equip_type: null, slot: null, stats: {}, bonus: {},
    req: {}, durability: null, weapon_base: null, weight: 0, qty: 1, desc: null, stats_text: "", unmet: [], ...p,
  };
  it.category = p.category || (it.equip_type ? "equipaggiamento" : CONSUMABLE_TYPES.includes(it.type) ? "consumabili" : it.type === "Materiale" ? "materiali" : "altro");
  return it;
}
const etOf = (it: InventoryItem) => (it.equip_type ? ET[it.equip_type] : undefined);
const twoHanded = (it: InventoryItem) => !!etOf(it)?.two_handed;
const worn = (it: InventoryItem) => !!it.slot && !!etOf(it)?.slots.includes(it.slot);
function eqMap(inv: InventoryItem[]): Partial<Record<SlotKey, string>> {
  const m: Partial<Record<SlotKey, string>> = {};
  for (const it of inv) if (worn(it)) { m[it.slot!] = it.id; if (twoHanded(it)) m[OFF] = it.id; }
  return m;
}
const occupant = (inv: InventoryItem[], slot: SlotKey) => { const id = eqMap(inv)[slot]; return id ? inv.find((x) => x.id === id) : undefined; };

type RulesIn = { stats: StatRow[]; equip: Character["equip"]; item_bonus: Record<string, number>; magia: Character["magia"]; inventory: InventoryItem[]; level: number };
function applied(c: RulesIn) {
  const st: Record<string, number> = {};
  const eq = { ...c.equip };
  const ib: Record<string, number> = { ...c.item_bonus };
  for (const it of c.inventory) {
    if (!worn(it)) continue;
    for (const [k, v] of Object.entries(it.stats)) st[k] = (st[k] || 0) + v;
    for (const [k, v] of Object.entries(it.bonus)) {
      if ((FORMULA_KEYS as readonly string[]).includes(k)) eq[k as keyof typeof eq] += v;
      else ib[k] = (ib[k] || 0) + v;
    }
  }
  return { stats: c.stats.map((r) => ({ ...r, oggetti: st[r.code] || 0 })), equip: eq, item_bonus: ib };
}
const derivedFor = (c: RulesIn) => { const a = applied(c); return derivedOf(a.stats, a.item_bonus, a.equip, c.magia); };
function unmetOf(c: RulesIn, it: InventoryItem, t = totalsOf(applied(c).stats)): string[] {
  return Object.entries(it.req).filter(([k, v]) => (k === "level" ? c.level : t[k] ?? 0) < v).map(([k, v]) => (k === "level" ? `Livello ${v}` : `${k} ${v}`));
}
class EqErr extends Error {}
const wrongSlot = (it: InventoryItem, slot: string) =>
  new EqErr(`${it.name} (${etOf(it)?.label}) non va nello slot ${slotLabel(slot)}. Slot ammessi: ${(etOf(it)?.slots || []).map(slotLabel).join(", ")}.`);
function equipOp(c: RulesIn, id: string, slot?: SlotKey): InventoryItem[] {
  const inv = clone(c.inventory);
  const it = inv.find((x) => x.id === id);
  if (!it) throw new EqErr("Oggetto non trovato nell'inventario.");
  const t = etOf(it);
  if (!t) throw new EqErr(`${it.name}: oggetto non equipaggiabile.`);
  if (it.qty !== 1) throw new EqErr(`${it.name}: si può equipaggiare solo un oggetto singolo (quantità 1).`);
  if (slot && !t.slots.includes(slot)) throw wrongSlot(it, slot);
  if (it.slot) return !slot || slot === it.slot ? inv : moveOp({ ...c, inventory: inv }, it.slot, slot);
  const unmet = unmetOf(c, it);
  if (unmet.length) throw new EqErr(`Impossibile equipaggiare ${it.name}: requisiti non soddisfatti (${unmet.join(", ")}).`);
  const clear = (k: SlotKey) => { const o = occupant(inv, k); if (o) o.slot = null; };
  let target: SlotKey;
  if (t.two_handed) { target = MAIN; clear(MAIN); clear(OFF); }
  else {
    const m = eqMap(inv);
    target = slot || t.slots.find((k) => !m[k]) || t.slots[0];
    if (target === MAIN || target === OFF) { const main = occupant(inv, MAIN); if (main && twoHanded(main)) main.slot = null; }
    clear(target);
  }
  it.slot = target;
  return inv;
}
function unequipOp(c: RulesIn, slot: SlotKey): InventoryItem[] {
  const inv = clone(c.inventory);
  const it = occupant(inv, slot);
  if (!it) throw new EqErr(`Lo slot ${slotLabel(slot)} è vuoto.`);
  it.slot = null;
  return inv;
}
function moveOp(c: RulesIn, from: SlotKey, to: SlotKey): InventoryItem[] {
  const inv = clone(c.inventory);
  const it = occupant(inv, from);
  if (!it) throw new EqErr(`Lo slot ${slotLabel(from)} è vuoto.`);
  if (from === to) throw new EqErr("Lo slot di partenza e quello di arrivo coincidono.");
  if (twoHanded(it)) throw new EqErr(`${it.name} è un'arma a due mani: occupa entrambe le mani e non si sposta.`);
  if (!etOf(it)!.slots.includes(to)) throw wrongSlot(it, to);
  const other = occupant(inv, to);
  if (other) other.slot = !twoHanded(other) && etOf(other)!.slots.includes(from) ? from : null;
  it.slot = to;
  return inv;
}
function finalVals(c: RulesIn) {
  const a = applied(c);
  return { stats: totalsOf(a.stats), der: Object.fromEntries(derivedOf(a.stats, a.item_bonus, a.equip, c.magia).map((d) => [d.key, d.value])) as Record<string, number> };
}
function diff(a: Record<string, number>, b: Record<string, number>) {
  const o: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = (b[k] || 0) - (a[k] || 0); if (Math.abs(d) > 1e-9) o[k] = d; }
  return o;
}
function previews(c: RulesIn): Record<string, ItemPreview> {
  const before = finalVals(c);
  const out: Record<string, ItemPreview> = {};
  for (const it of c.inventory) {
    if (it.slot || !etOf(it)) continue;
    try {
      const inv = equipOp(c, it.id);
      const after = finalVals({ ...c, inventory: inv });
      const was = new Set(Object.values(eqMap(c.inventory)));
      const now = new Set(Object.values(eqMap(inv)));
      const replaces = c.inventory.filter((x) => was.has(x.id) && !now.has(x.id)).map((x) => x.name);
      out[it.id] = { ok: true, error: null, unmet: [], slot: inv.find((x) => x.id === it.id)!.slot, replaces, stats: diff(before.stats, after.stats), derived: diff(before.der, after.der) };
    } catch (e) {
      out[it.id] = { ok: false, error: (e as Error).message, unmet: unmetOf(c, it), slot: null, replaces: [], stats: {}, derived: {} };
    }
  }
  return out;
}
function startingEquipment(c: RulesIn): InventoryItem[] {
  let inv = c.inventory;
  for (const it of c.inventory) {
    const t = etOf(it);
    if (!t) continue;
    const m = eqMap(inv);
    const free = t.slots.find((k) => !m[k]);
    if (!free || (t.two_handed && m[OFF])) continue;
    try { inv = equipOp({ ...c, inventory: inv }, it.id, free); } catch { /* requisiti non soddisfatti: resta in borsa */ }
  }
  return inv;
}

const POWER_RANKS = [
  { min: 1, name: "Soldato Semplice" }, { min: 100, name: "Guerriero Scelto" }, { min: 200, name: "Guerriero Importante" },
  { min: 300, name: "Eroe" }, { min: 400, name: "Leggenda" }, { min: 500, name: "Mito" }, { min: 600, name: "Divinità" },
];
const powerRank = (lvl: number) => [...POWER_RANKS].reverse().find((r) => lvl >= r.min)!.name;

const RULES: RulesConfig = {
  creation: { base: 10, bonus_points: 20, min: 1, name_min: 3, name_max: 15 },
  level: { auto_per_level: 1, free_per_level: 10, talent_every: 5 },
  regen: { mp_pct: 15, sp_pct: 25 },
  sources: [
    { key: "iniziale", label: "Iniziale", help: "Valore di partenza della statistica" },
    { key: "creazione", label: "Creazione", help: "Punti bonus assegnati in creazione (20 da distribuire)" },
    { key: "investiti", label: "Investiti", help: "Punti liberi del level up investiti dal giocatore (+10 per livello)" },
    { key: "levelup", label: "Level up", help: "Incremento automatico: +1 a ogni statistica per livello" },
    { key: "altro", label: "Altro", help: "Bonus da talenti, oggetti permanenti o eventi" },
    { key: "titoli", label: "Titoli", help: "Somma dei bonus dei titoli posseduti" },
  ],
  grades: ["Assoluto Novizio", "Novizio", "Praticante", "Amatore", "Dilettante", "Specializzando", "Abile", "Esperto", "Professionista", "Maestro"],
  rarities: [
    ["Comune", 1, 15, 30], ["Non Comune", 2, 30, 60], ["Raro", 3, 60, 120], ["Epico", 4, 120, 250], ["Unico", 5, 250, 500],
    ["Leggendario", 6, 500, 1000], ["Mitico", 7, 1000, 2000], ["Divino", 8, 2000, null],
  ].map(([name, grade, a, b]) => ({
    name: name as string, key: String(name).toLowerCase().replace(/\s+/g, ""), grade: grade as number,
    weapon_base: [a as number, b as number | null], creature_mult: Math.pow(grade as number, 3),
  })),
  classes: [
    { id: "guerriero", name: "Guerriero", skill: "Attacco Possente", skill_text: "+50% danno fisico", cost: "15 SP", cooldown: 3,
      equip: [
        { name: "Spada di Ferro", type: "Arma", equip_type: "unaMano", weapon_base: 20, req: { STR: 15 }, weight: 3, stats_text: "Una mano · Base 20" },
        { name: "Armatura di Cuoio Rinforzato", type: "Armatura", equip_type: "corazza", bonus: { difesa: 5 }, weight: 5, stats_text: "Difesa 5" },
        { name: "Scudo di Legno", type: "Scudo", equip_type: "scudo", bonus: { blocco: 20 }, weight: 4, stats_text: "Blocco 20%" }] },
    { id: "mago", name: "Mago", skill: "Dardo Magico", skill_text: "Colpisce sempre", cost: "20 MP", cooldown: 1,
      equip: [
        { name: "Bastone di Frassino", type: "Arma", equip_type: "dueMani", weapon_base: 18, req: { INT: 15 }, weight: 3, stats_text: "Due mani · Base 18 · +10% Mana" },
        { name: "Vesti di Stoffa", type: "Armatura", equip_type: "corazza", bonus: { difesaMagica: 2 }, weight: 2, stats_text: "+3 Regen Mana" },
        { name: "Grimorio Basilare", type: "Libro", equip_type: null, weight: 1, stats_text: "Dardo Magico + 2 slot liberi" }] },
    { id: "ladro", name: "Ladro", skill: "Colpo Furtivo", skill_text: "+100% critico se non visto", cost: "10 SP", cooldown: 2,
      equip: [
        { name: "Daga Affilata", type: "Arma", equip_type: "unaMano", weapon_base: 15, bonus: { critico: 5 }, req: { DEX: 15 }, weight: 1, stats_text: "Una mano · Base 15 · +5% Critico" },
        { name: "Armatura di Cuoio Morbido", type: "Armatura", equip_type: "corazza", bonus: { evasione: 10 }, weight: 4, stats_text: "+10% Evasione" },
        { name: "Kit da Scasso", type: "Strumento", equip_type: null, weight: 1, stats_text: "Grimaldelli e lime" }] },
    { id: "chierico", name: "Chierico", skill: "Cura Minore", skill_text: "Ripristina 40–60 HP", cost: "25 MP", cooldown: 1,
      equip: [
        { name: "Mazza Benedetta", type: "Arma", equip_type: "unaMano", weapon_base: 20, req: { STR: 12 }, weight: 3, stats_text: "Una mano · Base 20 · +10% vs non-morti" },
        { name: "Vesti Sacre", type: "Armatura", equip_type: "corazza", bonus: { difesaMagica: 5 }, weight: 2, stats_text: "Difesa magica 5" },
        { name: "Simbolo Sacro", type: "Accessorio", equip_type: "tenuto", weight: 0.5, stats_text: "Tenuto in mano secondaria · Focus divino" }] },
  ],
  kingdoms: [
    { id: "valeria", name: "Valeria", text: "Regno d'oro e grano. Il più comune per iniziare; moneta: Corone d'Oro." },
    { id: "qadesh", name: "Qadesh", text: "Sole e sabbia, rotte carovaniere." },
    { id: "frostland", name: "Frostland", text: "Ghiacci del nord, popoli duri." },
    { id: "eldermoor", name: "Eldermoor", text: "Foreste verde e oro, tradizioni antiche." },
  ],
  positions: ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"],
  power_ranks: POWER_RANKS,
  slots: SLOT_DEFS,
  equip_types: EQUIP_TYPES,
  equip_formula_keys: [...FORMULA_KEYS],
  item_categories: [
    { key: "equipaggiamento", label: "Equipaggiamento" }, { key: "consumabili", label: "Consumabili" },
    { key: "materiali", label: "Materiali" }, { key: "altro", label: "Altro" },
  ],
};
type ClassItem = RulesConfig["classes"][number]["equip"][number] & Partial<InventoryItem>;

/* ---------- Dati ---------- */
const USERS: (User & { password: string })[] = [
  { id: 1, username: "master", password: "master", display_name: "Il Narratore", role: "master" },
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: i + 1, username: `giocatore${i}`, password: `giocatore${i}`, display_name: `Giocatore ${i}`, role: "player" as const })),
];

type Stored = Omit<Character, "derived" | "totals" | "free_points" | "power_rank" | "next_talent_level" | "equipped" | "item_previews">;

const st = (code: string, name: string, kind: "base" | "avanzata", iniziale: number, creazione: number, investiti: number, levelup: number, altro: number, titoli: number, note?: string): StatRow =>
  ({ code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, oggetti: 0, note: note ?? null, total: 0 });

const emptyLists = { titles: [], skills: [], active_skills: [], talents: [], inventory: [], pets: [], curses: [], quests: [], reputation: [] };

const kelvin: Stored = {
  id: 1, owner_id: 2, owner_name: "Giocatore 1", name: "Kelvin", classe: "Domatore", level: 77, exp_pct: 0, regno: "Valeria", pvp: "Bianco",
  gilda: { nome: "—", ruolo: "Nessuna gilda" }, corone: 25, scellini: 30,
  stats: [
    st("STR", "Forza", "base", 10, 0, 84, 76, 0, 0), st("DEX", "Destrezza", "base", 10, 0, 401, 76, 0, 5),
    st("VIT", "Vitalità", "base", 10, 20, 75, 76, 0, 5), st("INT", "Intelligenza", "base", 10, 0, 0, 76, 0, 0),
    st("FIN", "Finesse", "avanzata", 0, 0, 200, 35, 354, 60, "Altro = talento Finesse IV: (somma+titoli)×1,2"),
    st("AUT", "Autorità", "avanzata", 5, 0, 0, 7, 0, 50, "Sbloccata al livello 70"),
  ],
  // Difesa, critico ed evasione arrivano dagli oggetti equipaggiati
  item_bonus: {}, equip: { difesa: 0, difesaMagica: 0, blocco: 0 }, magia: { nucleo: 4, talenti: 0 },
  resources: { hp: 2410, mp: 640, sp: 2900 },
  titles: [
    { name: "Artigiano Talentuoso", rarity: "Raro", bonus: { DEX: 5, VIT: 5, FIN: 10 } },
    { name: "Il Primo Passo verso l'Artigiano", rarity: "Raro", bonus: { FIN: 50 } },
    { name: "Domatore delle Epoche", rarity: "Epico", bonus: { AUT: 50 } },
  ],
  skills: [
    { name: "Cooking", lvl: 10, pct: "MAX", type: "Craft", passive: "Gli effetti dei consumabili ingeriti raddoppiano" },
    { name: "Crafting", lvl: 10, pct: "MAX", type: "Craft", passive: "Passiva di Grado X sbloccata" },
    { name: "Leatherworking", lvl: 9, pct: 20, type: "Craft" }, { name: "Ispeziona", lvl: 8, pct: 85, type: "Utility" },
    { name: "Domare", lvl: 6, pct: 40, type: "Classe" }, { name: "Gathering", lvl: 7, pct: 12, type: "Gathering" },
    { name: "Spear", lvl: 4, pct: 66, type: "Combat" }, { name: "Schivata", lvl: 5, pct: 30, type: "Defense" },
    { name: "Vis", lvl: 1, pct: 80, type: "Knowledge" }, { name: "Lingua Eldarin", lvl: 1, pct: 85, type: "Language" },
  ],
  active_skills: [
    { name: "Comando: Sottomissione", effect: "Tenta di sottomettere una creatura indebolita", lvl: 1, pct: 0, cost: "120 MP", cd: 5 },
    { name: "Comando: Battaglia", effect: "I compagni attaccano il bersaglio indicato con +20% danno", lvl: 1, pct: 60, cost: "80 SP", cd: 3 },
  ],
  talents: [
    { name: "Ispeziona", rarity: "Non Comune", origin: "Lvl 05", effect: "Rivela statistiche base di oggetti e creature" },
    { name: "Gatherer", rarity: "Comune", origin: "Lvl 10", effect: "+20% materiali raccolti" },
    { name: "Segugio", rarity: "Non Comune", origin: "Lvl 15", effect: "Segue le tracce di creature fino a 24 ore" },
    { name: "Finesse I", rarity: "Raro", origin: "Lvl 20", effect: "Sblocca la statistica Finesse" },
    { name: "Finesse II", rarity: "Raro", origin: "Libro Abilità", effect: "Finesse ×1,05" },
    { name: "Giant Killer", rarity: "Epico", origin: "Lvl 45", effect: "+30% danno contro creature di taglia grande" },
    { name: "Linguistica", rarity: "Non Comune", origin: "Lvl 55", effect: "Apprendimento lingue raddoppiato" },
    { name: "Finesse IV", rarity: "Epico", origin: "Lvl 75", effect: "Finesse ×1,2 su somma e titoli" },
  ],
  inventory: ([
    { id: "it-thanatos", name: "La Promessa di Thanatos", rarity: "Unico", type: "Arma", equip_type: "dueMani", slot: "manoPrincipale", weapon_base: 410,
      bonus: { critico: 12 }, durability: { cur: 182, max: 200 }, req: { level: 70, DEX: 300 }, stats_text: "Lancia a due mani · Base 410 · +12% critico",
      desc: "Una promessa fatta a un dio non si spezza: si consuma.", weight: 6 },
    { id: "it-simbionte", name: "Spalla del Simbionte", rarity: "Epico", type: "Armatura", equip_type: "spallacci", slot: "spalle", bonus: { difesa: 85, evasione: 10 },
      durability: { cur: 95, max: 120 }, req: { level: 60 }, stats_text: "Difesa 85 · +10% Evasione", desc: "Cresce di qualche fibra ogni notte.", weight: 4 },
    { id: "it-elmo", name: "Elmo del Domatore", rarity: "Raro", type: "Armatura", equip_type: "elmo", stats: { VIT: 8, AUT: 5 }, bonus: { difesa: 30 },
      durability: { cur: 70, max: 70 }, req: { level: 50 }, weight: 3 },
    { id: "it-mantello", name: "Mantello del Gelo", rarity: "Raro", type: "Armatura", equip_type: "mantello", stats: { VIT: 5 }, bonus: { difesaMagica: 15, resElementi: 5 },
      durability: { cur: 40, max: 60 }, weight: 2 },
    { id: "it-stivali", name: "Stivali del Segugio", rarity: "Non Comune", type: "Armatura", equip_type: "stivali", stats: { DEX: 6 }, bonus: { difesa: 12, velocita: 5 },
      durability: { cur: 50, max: 50 }, weight: 2 },
    { id: "it-anello-wyrm", name: "Anello del Wyrm", rarity: "Epico", type: "Accessorio", equip_type: "anello", stats: { INT: 12 }, bonus: { difesaMagica: 20 }, req: { level: 75 }, weight: 0.1 },
    { id: "it-anello-fin", name: "Anello dell'Artigiano", rarity: "Non Comune", type: "Accessorio", equip_type: "anello", stats: { FIN: 15 }, weight: 0.1 },
    { id: "it-scudo", name: "Scudo di pelle di Wyrm", rarity: "Raro", type: "Scudo", equip_type: "scudo", bonus: { blocco: 20, difesa: 25 },
      durability: { cur: 80, max: 80 }, req: { STR: 150 }, weight: 5 },
    { id: "it-zanna", name: "Zanna del Topo dei Ghiacci", rarity: "Non Comune", type: "Accessorio", equip_type: "ninnolo", bonus: { critico: 3 }, weight: 0.2 },
    { id: "it-corazza", name: "Corazza di scaglie di Wyrm", rarity: "Raro", type: "Armatura", equip_type: "corazza", stats: { VIT: 6 }, bonus: { difesa: 55 },
      durability: { cur: 90, max: 110 }, req: { level: 55, STR: 120 }, weight: 9 },
    { id: "it-gambali", name: "Gambali da battitore", rarity: "Non Comune", type: "Armatura", equip_type: "gambali", stats: { DEX: 4 }, bonus: { difesa: 18 }, durability: { cur: 60, max: 60 }, weight: 4 },
    { id: "it-guanti", name: "Guanti del Conciatore", rarity: "Non Comune", type: "Armatura", equip_type: "guanti", stats: { FIN: 8 }, bonus: { difesa: 6 }, durability: { cur: 30, max: 40 }, weight: 1 },
    { id: "it-bracciali", name: "Bracciali di corda gelata", rarity: "Comune", type: "Armatura", equip_type: "bracciali", bonus: { difesa: 5, resElementi: 2 }, durability: { cur: 35, max: 35 }, weight: 0.5 },
    { id: "it-cintura", name: "Cintura delle esche", rarity: "Comune", type: "Armatura", equip_type: "cintura", stats: { STR: 3 }, bonus: { difesa: 4 }, weight: 0.5 },
    { id: "it-amuleto", name: "Amuleto del Branco", rarity: "Epico", type: "Accessorio", equip_type: "amuleto", stats: { AUT: 14 }, bonus: { difesaMagica: 10 }, req: { level: 65 }, weight: 0.2 },
    { id: "it-pugnale", name: "Pugnale da scuoiatore", rarity: "Non Comune", type: "Arma", equip_type: "unaMano", weapon_base: 24, stats: { DEX: 4 }, bonus: { critico: 4 },
      durability: { cur: 45, max: 50 }, weight: 1 },
    { id: "it-coltello", name: "Coltello d'osso", rarity: "Comune", type: "Arma", equip_type: "unaMano", weapon_base: 18, bonus: { critico: 2 }, durability: { cur: 20, max: 40 }, weight: 0.8 },
    { id: "it-frusta", name: "Frusta del Domatore", rarity: "Raro", type: "Arma", equip_type: "manoPrincipale", weapon_base: 120, stats: { AUT: 10 },
      durability: { cur: 70, max: 70 }, req: { level: 40 }, weight: 2 },
    { id: "it-fischietto", name: "Fischietto del Branco", rarity: "Raro", type: "Accessorio", equip_type: "tenuto", stats: { AUT: 8 }, desc: "Un fischio, e il branco risponde.", weight: 0.1 },
    { id: "it-kit", name: "Kit del conciatore", stats_text: "+5% qualità pelli", rarity: "Non Comune", type: "Strumento", weight: 3 },
    { id: "it-pelle", name: "Pelle di Wyrm", stats_text: "Materiale grezzo", rarity: "Raro", type: "Materiale", qty: 4, weight: 2 },
    { id: "it-razione", name: "Razione da viaggio", stats_text: "+50% recupero per 1h", rarity: "Comune", type: "Cibo", qty: 12, weight: 0.5 },
    { id: "it-diario", name: "Diario di caccia", stats_text: "Appunti sulle creature domate", rarity: "Comune", type: "Libro", weight: 1 },
    { id: "it-pozione-hp", name: "Pozione di cura maggiore", stats_text: "Ripristina 600 HP", rarity: "Raro", type: "Pozione", qty: 7, weight: 0.3 },
    { id: "it-pozione-mp", name: "Pozione di mana", stats_text: "Ripristina 250 MP", rarity: "Non Comune", type: "Pozione", qty: 4, weight: 0.3 },
    { id: "it-stufato", name: "Stufato di Wyrm", stats_text: "+15% STR per 2h (raddoppiato da Cooking)", rarity: "Raro", type: "Cibo", qty: 3, weight: 0.8 },
    { id: "it-pergamena", name: "Pergamena del ritorno", stats_text: "Teletrasporto alla città vincolata", rarity: "Non Comune", type: "Pergamena", qty: 2, weight: 0.1 },
    { id: "it-zanne", name: "Zanne di lupo grigio", stats_text: "Materiale di conciatura", rarity: "Comune", type: "Materiale", qty: 46, weight: 0.1 },
    { id: "it-cristallo", name: "Cristallo di gelo", stats_text: "Catalizzatore magico", rarity: "Epico", type: "Materiale", weight: 0.5 },
    { id: "it-uovo", name: "Frammento di guscio di Wyrm", stats_text: "Indizio per la quest «Il Wyrm che non brucia»", rarity: "Raro", type: "Oggetto quest", qty: 2, weight: 0.4 },
    { id: "it-corone", name: "Corone d'Oro", stats_text: "Moneta di Valeria", rarity: "Comune", type: "Monete", qty: 25, weight: 0 },
    { id: "it-scellini", name: "Scellini", stats_text: "Moneta minore", rarity: "Comune", type: "Monete", qty: 30, weight: 0 },
  ] as ItemIn[]).map(mkItem),
  pets: [
    { name: "Celsius", species: "Topo dei Ghiacci", lvl: 56, passive: "Aura di gelo", skills: [{ name: "Morso glaciale", lvl: 6, pct: 30 }, { name: "Mimetismo nella neve", lvl: 4, pct: 10 }] },
    { name: "Fahrenheit", species: "Wyrm del Fuoco", lvl: 3, passive: "Immunità alla lava", skills: [{ name: "Ignis", lvl: 9, pct: 0 }] },
  ],
  curses: [{ name: "Braccio degli antichi", desc: "Il braccio destro è posseduto da uno spirito antico.", bonus: "+20% FOR nelle prove con il braccio posseduto", malus: "−2 livelli di skill nei lavori di precisione" }],
  quests: [
    { name: "Il Wyrm che non brucia", progress: "2/3 indizi", reward: "Uovo di Wyrm (Raro)", rarity: "Raro" },
    { name: "Pelli per la gilda dei conciatori", progress: "8/20 pelli", reward: "120 Corone, +Reputazione Valeria", rarity: "Comune" },
  ],
  reputation: [
    { scope: "Regionale", target: "Valeria", value: 340, range: 1000, label: "Benvoluto" },
    { scope: "Gruppo", target: "Gilda dei Conciatori", value: 42, range: 100, label: "Amico" },
    { scope: "PNG", target: "Marta la Locandiera", value: 6, range: 10, label: "Fiducia" },
    { scope: "Cosmica", target: "Luxor", value: 0, range: 0, label: "Neutrale" },
  ],
  combat: {
    position: "Media distanza", turn: 1,
    effects: [
      { name: "Emorragia", kind: "bad", text: "−3 HP/turno", turns: 2, hpPerTurn: -3 },
      { name: "Scudo Magico", kind: "good", text: "Assorbe 50 danni", turns: 3, absorb: 50 },
      { name: "Concentrazione", kind: "good", text: "+50% al prossimo attacco", turns: 1 },
    ],
    cooldowns: [{ name: "Comando: Battaglia", turns: 2 }, { name: "Comando: Sottomissione", turns: 4 }],
    log: [],
  },
  death: null,
};

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const RES_KEYS = ["hp", "mp", "sp", "ki"] as const;
type ResKey = (typeof RES_KEYS)[number];
/** Massimi delle risorse: hp, mp, sp e ki solo per chi ha la statistica KI (come serialize.maxes_of). */
function maxesOf(c: RulesIn): Resources {
  const d = Object.fromEntries(derivedFor(c).map((x) => [x.key, x.value]));
  return asRes(Object.fromEntries(RES_KEYS.filter((k) => k in d).map((k) => [k, d[k]])));
}
/** Applica `fn` a ogni risorsa presente (hp, mp, sp e l'eventuale ki). */
const asRes = (o: Record<string, number>) => o as unknown as Resources;
const mapRes = (r: Resources, fn: (v: number, k: ResKey) => number) =>
  asRes(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fn(v, k as ResKey)])));
/** Risorse entro i massimi: una mancante (KI appena sbloccato) parte dal massimo, una non più valida sparisce. */
function clampRes(c: Stored) {
  const mx = maxesOf(c);
  c.resources = mapRes(mx, (m, k) => Math.min(c.resources[k] ?? m, m));
}

/** Gli altri PG: dati reali da backend/app/seed.py (OTHERS), cioè dalle schede Excel STATISFY. */
type RealIn = Pick<Stored, "name" | "classe" | "level" | "exp_pct" | "regno" | "pvp" | "gilda" | "corone" | "scellini" | "stats"> & Partial<Stored>;
function real(id: number, owner: number, data: RealIn): Stored {
  const c: Stored = {
    id, owner_id: owner + 1, owner_name: `Giocatore ${owner}`, item_bonus: {}, equip: { difesa: 0, difesaMagica: 0, blocco: 0 },
    magia: { nucleo: 0, talenti: 0 }, resources: { hp: 0, mp: 0, sp: 0 }, ...clone(emptyLists),
    combat: { position: "Mischia", turn: 1, effects: [], cooldowns: [], log: [] }, death: null, ...data,
  };
  if (!data.resources) c.resources = maxesOf(c);
  return c;
}

const db = {
  nextId: 7,
  chars: [
    kelvin,
    real(2, 2, {
      name: "Eric", classe: "Faro della Civiltà", level: 110, exp_pct: 0, regno: "Valeria", pvp: "Bianco",
      gilda: {"nome": "Lanterne di Valeria", "ruolo": "Diplomatico"}, corone: 0, scellini: 0,
      stats: [
        st("STR", "Forza", "base", 10, 0, 0, 109, 0, 213),
        st("DEX", "Destrezza", "base", 10, 5, 0, 109, 0, 220),
        st("VIT", "Vitalità", "base", 10, 5, 0, 109, 0, 410),
        st("INT", "Intelligenza", "base", 10, 10, 1000, 109, 30, 283),
        st("CHA", "Carisma", "avanzata", 5, 0, 90, 109, 0, 265),
        st("WIS", "Saggezza", "avanzata", 5, 0, 0, 129, 0, 180, "Excel: Punti Level Up 129, più dei 109 level up del livello 110"),
      ],
      titles: [{"name": "Questo Matrimonio non s'ha da fare", "rarity": "Raro", "bonus": {"STR": 5, "VIT": 10}}, {"name": "Fratello d'Armi del Passo dell'Aquila", "rarity": "Raro", "bonus": {"STR": 8, "VIT": 10}}, {"name": "EROE DELL'ECLISSI", "rarity": "Unico", "bonus": {"VIT": 20, "INT": 25, "CHA": 30}}, {"name": "Primo Erudito", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Portatore di Eclissi", "rarity": "Epico", "bonus": {"VIT": 12, "INT": 8, "CHA": 10}}, {"name": "Primo Maestro della Sfera del Flusso", "rarity": "Epico", "bonus": {"DEX": 10, "VIT": 8, "INT": 15}}, {"name": "Amico delle scaglie Blu", "rarity": "Raro", "bonus": {"VIT": 5, "INT": 10}}, {"name": "Pionoere di Abyssos", "rarity": "Epico", "bonus": {"VIT": 10, "INT": 10, "CHA": 15}}, {"name": "Cacciatore di Maghi", "rarity": "Epico", "bonus": {"DEX": 5, "VIT": 10, "INT": 5}}, {"name": "Portatore di Calamità", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Amici dei Draghi", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "CHA": 50, "WIS": 50}}, {"name": "Maestro dell'accademia Magica di Valeria", "rarity": "Raro", "bonus": {"INT": 30}}, {"name": "Pioniere di Karak'Ktur", "rarity": "Epico", "bonus": {"VIT": 30}}, {"name": "Uccisore del Corvo", "rarity": "Leggendario", "bonus": {"STR": 30, "DEX": 30, "VIT": 30, "INT": 30, "CHA": 30, "WIS": 30}}, {"name": "Cacciatori degli Abissi", "rarity": "Unico", "bonus": {"STR": 20, "DEX": 25, "VIT": 50}}, {"name": "Mano destra e Mano sinistra del dottore", "rarity": "Raro", "bonus": {"VIT": 15}}, {"name": "Signore dei Nani", "rarity": "Unico", "bonus": {"VIT": 50, "CHA": 30}}],
    }),
    real(3, 3, {
      name: "Corax", classe: "Monaco", level: 181, exp_pct: 0, regno: "Valeria", pvp: "Grigio",
      gilda: {"nome": "Pugno di Raijin", "ruolo": "Ufficiale"}, corone: 0, scellini: 0,
      stats: [
        st("STR", "Forza", "base", 10, -2, 150, 185, 0, 180, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
        st("DEX", "Destrezza", "base", 10, 10, 300, 185, 0, 235, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
        st("VIT", "Vitalità", "base", 10, -3, 100, 185, 20, 193, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
        st("INT", "Intelligenza", "base", 10, 15, 300, 185, 62, 156, "Excel: Punti Level Up 185, al livello 181 sarebbero 180"),
        st("SHA", "Shadow", "avanzata", 5, 0, 300, 178, 10, 220),
        st("KI", "KI", "avanzata", 5, 10, 430, 144, 0, 140),
        st("CHA", "Carisma", "avanzata", 10, 0, 100, 108, 30, 150, "Titoli: +150 dai bonus CHA dei titoli (nell’Excel la cella Punti Titoli era 0 senza formula)"),
      ],
      titles: [{"name": "La Santa del Mattatoio", "rarity": "Epico", "bonus": {"DEX": 10, "VIT": 8, "INT": 6, "SHA": 10}}, {"name": "Prima Maestra", "rarity": "Epico", "bonus": {"DEX": 25}}, {"name": "Primo Monaco", "rarity": "Epico", "bonus": {"DEX": 15, "VIT": 15, "KI": 10}}, {"name": "Il Primo Agente dei Nocturn", "rarity": "Unico", "bonus": {"VIT": -20, "INT": 15, "SHA": 30, "CHA": 20}}, {"name": "Mano DX e Mano Sx del Doc", "rarity": "Raro", "bonus": {"VIT": 15}}, {"name": "Underdog", "rarity": "Epico", "bonus": {"DEX": 50}}, {"name": "Cacciatore di Maghi", "rarity": "Epico", "bonus": {"DEX": 5, "VIT": 10, "INT": 5}}, {"name": "Portatori di Calamità", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "SHA": 50, "KI": 50, "CHA": 50}}, {"name": "Amici dei Draghi", "rarity": "Leggendario", "bonus": {"STR": 50, "DEX": 50, "VIT": 50, "INT": 50, "SHA": 50, "KI": 50, "CHA": 50}}, {"name": "Come Russel", "rarity": "Leggendario", "bonus": {"STR": 30, "DEX": 30, "VIT": 30, "INT": 30, "SHA": 30, "KI": 30, "CHA": 30}}, {"name": "Confessore della Madre", "rarity": "Raro", "bonus": {"SHA": 50}}, {"name": "Sangue di Oni", "rarity": "Epico", "bonus": {"STR": 50, "VIT": 35}}],
    }),
    real(4, 4, {
      name: "Deniel", classe: "Guerriero", level: 110, exp_pct: 0, regno: "Valeria", pvp: "Bianco",
      gilda: {"nome": "—", "ruolo": ""}, corone: 0, scellini: 0,
      stats: [
        st("STR", "Forza", "base", 10, 15, 600, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
        st("DEX", "Destrezza", "base", 10, 5, 100, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
        st("VIT", "Vitalità", "base", 10, 0, 390, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
        st("INT", "Intelligenza", "base", 10, 0, 0, 110, 0, 0, "Excel: Punti Level Up 110, al livello 110 sarebbero 109"),
      ],
      talents: [{"name": "Rabbia del Berserker", "rarity": "Raro", "origin": "Excel", "effect": "Sotto il 25% della vita"}],
    }),
    real(5, 5, {
      name: "Connor", classe: "Guerriero", level: 111, exp_pct: 0, regno: "Qadesh", pvp: "Bianco",
      gilda: {"nome": "—", "ruolo": ""}, corone: 0, scellini: 0,
      stats: [
        st("STR", "Forza", "base", 10, 10, 150, 110, 0, 13),
        st("DEX", "Destrezza", "base", 10, 5, 163, 110, 0, 0),
        st("VIT", "Vitalità", "base", 10, 5, 731, 110, 0, 40),
        st("INT", "Intelligenza", "base", 10, 0, 56, 110, 0, 25),
        st("CHA", "Carisma", "avanzata", 0, 0, 0, 69, 0, 30),
      ],
      titles: [{"name": "Questo Matrimonio non s'ha da fare", "rarity": "Raro", "bonus": {"STR": 5, "VIT": 10}}, {"name": "Fratello d'Armi del Passo dell'Aquila", "rarity": "Raro", "bonus": {"STR": 8, "VIT": 10}}, {"name": "EROE DELL'ECLISSI", "rarity": "Unico", "bonus": {"VIT": 20, "INT": 25, "CHA": 30}}],
    }),
    real(6, 6, {
      name: "Dante", classe: "Ladro", level: 120, exp_pct: 0, regno: "Valeria", pvp: "Rosso",
      gilda: {"nome": "—", "ruolo": ""}, corone: 0, scellini: 0,
      stats: [
        st("STR", "Forza", "base", 10, 0, 0, 119, 0, 0),
        st("DEX", "Destrezza", "base", 10, 10, 0, 119, 0, 0),
        st("VIT", "Vitalità", "base", 10, 0, 0, 119, 0, 0),
        st("INT", "Intelligenza", "base", 10, 10, 0, 119, 0, 0),
        st("LCK", "Fortuna", "avanzata", 5, 0, 1190, 113, 25, 0, "Fortuna: la gimmick di Dante. Altro = +25 dal talento Re dei Giochi. Entra nell’Evasione: (DEX + LCK)/20"),
      ],
      talents: [{"name": "Re dei Giochi", "rarity": "Epico", "origin": "Evolutivo", "effect": "Fortuna +25. Talento evolutivo: cresce evolvendo. Bonus Fortuna sui tiri = LCK/100."}],
    }),
  ] as Stored[],
  campaign: {
    id: 1, name: "Campagna di Alba Chiara", session: 15, master_name: "Il Narratore",
    open_quests: [
      { name: "Il Wyrm che non brucia", who: "Kelvin", rarity: "Raro", due: "—" },
      { name: "Taglia su Dante", who: "Dante", rarity: "Epico", due: "24h di gioco" },
      { name: "Ambasceria a Qadesh", who: "Eric, Connor", rarity: "Raro", due: "Sessione 18" },
    ],
  } as Campaign,
  npcs: [
    { id: 1, name: "Marta la Locandiera", level: 12, race: "Umana", place: "Alba Chiara — Il Gallo Storto", role: "Locandiera, informatrice", trust: "Buono",
      knows: "Sa che Kelvin è un Immortale e che cerca uova di Wyrm.", debts: "Kelvin le deve un favore (2 notti non pagate).", last: "Sessione 14 — gli ha venduto una mappa delle grotte.", secret: "Paga una tassa ai contrabbandieri del porto.",
      history: [{ session: 14, text: "Gli ha venduto una mappa delle grotte.", at: "2026-11-10T20:00:00Z" }] },
    { id: 2, name: "Capitano Orsino", level: 95, race: "Umano", place: "Alba Chiara — Caserma", role: "Capitano della guardia", trust: "Neutrale",
      knows: "Conosce Kelvin solo di nome.", debts: "—", last: "Sessione 11 — ha multato Dante per rissa.", secret: "Ha perso il fratello contro un Wyrm del Fuoco.", history: [] },
    { id: 3, name: "Fra' Teodoro", level: 40, race: "Umano", place: "Tempio di Luxor", role: "Chierico, guaritore", trust: "Eccellente",
      knows: "Ha curato la maledizione di Kelvin per due volte.", debts: "Kelvin ha promesso una donazione di 50 Corone.", last: "Sessione 13 — ha studiato il Braccio degli antichi.", secret: "Sospetta che lo spirito nel braccio sia un antico re.", history: [] },
  ] as Npc[],
  issues: [
    { id: 1, title: "Moltiplicatore danno magico", text: "Le schede usano INT/50, INT/60 e INT/80. Serve un divisore unico.", sev: "bad", resolved: true,
      decision: "1 + INT/100. Ogni grado di nucleo magico o talento apposito abbassa il divisore di 10 (90, 80, …, minimo 10)." },
    { id: 2, title: "Stamina assente nell'Excel", text: "Il regolamento definisce SP = 50 + (STR+DEX)×5, ma nessuna scheda la calcola.", sev: "warn", resolved: true,
      decision: "Confermata SP = 50 + (STR+DEX)×5. Va aggiunta al modello e calcolata in automatico." },
    { id: 3, title: "Scala di rarità", text: "Combat unisce Unico/Leggendario, il Crafting li separa e aggiunge Evolutivo; i titoli aggiungono Divino.", sev: "warn", resolved: true,
      decision: "Scala unica a 8 gradi: Comune, Non Comune, Raro, Epico, Unico, Leggendario, Mitico, Divino." },
    { id: 4, title: "Punti Level Up incoerenti", text: "Corax (lv 181) ha 185 punti invece di 180 su STR, DEX, VIT e INT; Deniel (lv 110) ne ha 110 invece di 109; Eric (lv 110) ha 129 punti su WIS, più dei 109 level up.", sev: "warn",
      resolved: true, decision: "Si tengono come nell'Excel (deciso dal Master il 20/11/2026): i punti restano e sono annotati sulla statistica." },
    { id: 5, title: "Formule non definite", text: "Difesa, iniziativa, probabilità di critico e di blocco non hanno formula.", sev: "bad", resolved: true,
      decision: "Difesa = VIT/10 + Difesa equip × (1 + VIT/100); Iniziativa = 10 + DEX/10; Critico = 5 + DEX/40 % (max 75%); Blocco = Blocco scudo + STR/40 % (solo con scudo, max 75%)." },
  ] as Issue[],
};

/* ---------- Helper ---------- */
const ok = (data: unknown, status = 200): Res => ({ status, data: clone(data) });
const err = (status: number, detail: string): Res => ({ status, data: { detail } });
const dmax = (c: Stored, k: string) => derivedFor(c).find((d) => d.key === k)!.value;
const nf = (x: number) => Math.round(x).toLocaleString("it-IT");

function full(c: Stored): Character {
  const a = applied(c);
  const stats = a.stats.map((r) => ({ ...r, total: statTotal(r) }));
  const t = totalsOf(a.stats);
  const used = c.stats.reduce((s, r) => s + (Number(r.investiti) || 0), 0);
  const total = (c.level - 1) * RULES.level.free_per_level;
  const every = RULES.level.talent_every;
  return {
    ...clone(c), stats,
    inventory: c.inventory.map((it) => ({ ...clone(it), unmet: unmetOf(c, it, t) })),
    equipped: eqMap(c.inventory), item_previews: previews(c),
    derived: derivedOf(a.stats, a.item_bonus, a.equip, c.magia), totals: t,
    free_points: { total, used, left: total - used }, power_rank: powerRank(c.level),
    next_talent_level: (Math.floor(c.level / every) + 1) * every,
  };
}
function summary(c: Stored): CharacterSummary {
  return { id: c.id, owner_id: c.owner_id, owner_name: c.owner_name, name: c.name, classe: c.classe, level: c.level, exp_pct: c.exp_pct,
    regno: c.regno, pvp: c.pvp, gilda: c.gilda, power_rank: powerRank(c.level), hp: c.resources.hp, hp_max: dmax(c, "hp") };
}
function log(c: Stored, text: string) {
  const n = c.combat.log.length;
  const at = (c.combat.log_at ?? []).slice(n ? -n : 0, n ? undefined : 0);
  c.combat.log_at = [...Array(n - at.length).fill(""), ...at, new Date().toISOString()].slice(-20);
  c.combat.log.push(`T${c.combat.turn} · ${text}`);
  if (c.combat.log.length > 20) c.combat.log = c.combat.log.slice(-20);
}

/* ---------- Tavolo: tiri d100 (come backend/app/routers/table.py) ---------- */
const table = { rolls: [] as (Roll & { secret: boolean })[], requests: [] as Omit<RollRequest, "char_name" | "roll_total" | "roll_natural" | "roll_crit">[], seq: 1 };
const MOD_KINDS = ["Skill", "Skill attiva", "Titolo", "Talento", "Fortuna"] as const;
/* Dadi forzati per le prove (solo mock): da console `__mockDice(9, 9)` → il prossimo tiro dà 99 (decine 9, unità 9). */
const forcedDice: number[] = [];
(globalThis as unknown as { __mockDice: (...v: number[]) => void }).__mockDice = (...v: number[]) => { forcedDice.push(...v.map((x) => Math.abs(Math.trunc(x)) % 10)); };
function d10(): number {
  if (forcedDice.length) return forcedDice.shift()!;
  const a = new Uint32Array(1);
  for (;;) { crypto.getRandomValues(a); if (a[0] < 4294967290) return a[0] % 10; }
}
/** Critici del d100 (come table.crit_of): conta il naturale. Sopra: 100 super, 91–99 critico. Sotto: 1 super, 2–9 critico. */
export function critOf(natural: number, call: RollCall | null): RollCrit {
  if (call === "sopra") return natural === 100 ? "supercritico" : natural > 90 ? "critico" : null;
  if (call === "sotto") return natural === 1 ? "supercritico" : natural < 10 ? "critico" : null;
  return null;
}
const isCall = (v: unknown): v is RollCall => v === "sopra" || v === "sotto";
const charName = (id: number) => db.chars.find((c) => c.id === id)?.name ?? "PG eliminato";
function requestOut(q: (typeof table.requests)[number]): RollRequest {
  const r = q.roll_id ? table.rolls.find((x) => x.id === q.roll_id) : undefined;
  return { ...q, char_name: charName(q.char_id), roll_total: r ? r.total : null, roll_natural: r ? r.natural : null, roll_crit: r ? r.crit : null };
}
function checkMods(c: Stored, raw: unknown): RollMod[] | string {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 30) return "Dati non validi — mods: deve essere una lista (max 30).";
  const hasLuck = derivedFor(c).some((d) => d.key === "bonusFortuna");
  const names: Record<string, string[]> = {
    Skill: c.skills.map((x) => x.name), "Skill attiva": c.active_skills.map((x) => x.name), Titolo: c.titles.map((x) => x.name),
    Talento: c.talents.map((x) => x.name), Fortuna: hasLuck ? ["Bonus Fortuna sui tiri"] : [],
  };
  const out: RollMod[] = [];
  for (const m of raw as Record<string, unknown>[]) {
    const kind = m?.kind as RollMod["kind"];
    if (!MOD_KINDS.includes(kind)) return "Dati non validi — mods.kind: valore non ammesso.";
    if (!Number.isInteger(m.mod) || Math.abs(m.mod as number) > 999) return "Dati non validi — mods.mod: deve essere un intero tra −999 e 999.";
    const name = String(m.name ?? "");
    if (!names[kind].includes(name)) return `«${name}» non è tra le voci di tipo ${kind} nella scheda di ${c.name}.`;
    out.push({ kind, name, mod: m.mod as number, text: String(m.text ?? "").slice(0, 300).trim() });
  }
  return out;
}
function newRoll(charId: number | null, me: User, reason: string, mods: RollMod[], secret: boolean, requestId: number | null, call: RollCall | null) {
  const tens = d10(), units = d10();
  const natural = tens * 10 + units || 100;
  const r = {
    id: table.seq++, char_id: charId, char_name: charId == null ? "Master" : charName(charId), by: charId == null ? "master" as const : "giocatore" as const,
    author_id: me.id, author_name: me.display_name, reason: reason.trim().slice(0, 120), tens, units, natural, mods,
    total: natural + mods.reduce((s, m) => s + m.mod, 0), call, crit: critOf(natural, call), secret, request_id: requestId, created_at: new Date().toISOString(),
  };
  table.rolls.push(r);
  return r;
}

/* ---------- Router ---------- */
export async function handle(method: string, path: string, body: unknown, token: string | null): Promise<Res> {
  await new Promise((r) => setTimeout(r, 120));
  const b = (body || {}) as Record<string, unknown>;

  if (method === "POST" && path === "/auth/login") {
    const u = USERS.find((x) => x.username === b.username && x.password === b.password);
    if (!u) return err(401, "Credenziali non valide.");
    const { password: _pw, ...user } = u;
    void _pw;
    return ok({ token: `mock-${u.id}`, user });
  }
  const uid = token?.startsWith("mock-") ? Number(token.slice(5)) : NaN;
  const found = USERS.find((x) => x.id === uid);
  if (!found) return err(401, "Sessione scaduta: accedi di nuovo.");
  const { password: _p, ...me } = found;
  void _p;
  const isMaster = me.role === "master";

  if (method === "GET" && path === "/auth/me") return ok(me);
  if (method === "GET" && path === "/rules") return ok(RULES);
  if (method === "POST" && path === "/rules/preview") {
    let stats = (b.stats as StatRow[]) || [];
    let ib = (b.item_bonus as Record<string, number>) || {};
    let eq: Character["equip"] = { difesa: 0, difesaMagica: 0, blocco: 0, ...((b.equip || {}) as Partial<Character["equip"]>) };
    let inventory = Array.isArray(b.inventory) ? (b.inventory as ItemIn[]).map(mkItem) : null;
    if (b.classe_id != null) {
      // Creazione guidata: equipaggiamento iniziale della classe, indossato come alla creazione
      const cls = RULES.classes.find((x) => x.id === b.classe_id);
      if (!cls) return err(422, "Classe inesistente.");
      const start = cls.equip.map((e) => mkItem({ ...(e as ClassItem), equip_type: (e as ClassItem).equip_type ?? null }));
      inventory = startingEquipment({ stats, item_bonus: ib, equip: eq, magia: { nucleo: 0, talenti: 0 }, inventory: [...(inventory ?? []), ...start], level: 1 });
    }
    if (inventory) {
      const a = applied({ stats, item_bonus: ib, equip: eq, magia: { nucleo: 0, talenti: 0 }, inventory, level: 1 });
      stats = a.stats; ib = a.item_bonus; eq = a.equip;
    }
    return ok({ totals: totalsOf(stats), derived: derivedOf(stats, ib, eq, b.magia as Character["magia"]) });
  }

  if (path === "/characters" && method === "GET") {
    return ok(db.chars.filter((c) => isMaster || c.owner_id === me.id).map(summary));
  }
  if (path === "/characters" && method === "POST") {
    const name = String(b.name || "").trim();
    const C = RULES.creation;
    if (!/^[A-Za-z0-9]+$/.test(name) || name.length < C.name_min || name.length > C.name_max) return err(422, "Nome non valido: 3–15 caratteri, solo lettere e numeri.");
    if (db.chars.some((c) => c.name.toLowerCase() === name.toLowerCase())) return err(422, `Il nome "${name}" è già in uso su questo server.`);
    const cls = RULES.classes.find((x) => x.id === b.classe_id);
    if (!cls) return err(422, "Classe inesistente.");
    const reg = RULES.kingdoms.find((x) => x.id === b.regno_id);
    if (!reg) return err(422, "Regno inesistente.");
    const s = (b.stats || {}) as Record<string, number>;
    const codes = ["STR", "DEX", "VIT", "INT"];
    if (codes.some((k) => !(Number(s[k]) >= C.min))) return err(422, "Ogni statistica deve valere almeno 1.");
    if (codes.reduce((a, k) => a + Number(s[k]) - C.base, 0) !== C.bonus_points) return err(422, "Devi distribuire esattamente 20 punti bonus.");
    const names: Record<string, string> = { STR: "Forza", DEX: "Destrezza", VIT: "Vitalità", INT: "Intelligenza" };
    const owner = isMaster && typeof b.owner_id === "number" ? USERS.find((u) => u.id === b.owner_id) || me : me;
    const c: Stored = {
      id: db.nextId++, owner_id: owner.id, owner_name: owner.display_name, name, classe: cls.name, level: 1, exp_pct: 0, regno: reg.name, pvp: "Bianco",
      gilda: { nome: "—", ruolo: "Nessuna gilda" }, corone: 20, scellini: 0,
      stats: codes.map((k) => st(k, names[k], "base", C.base, Number(s[k]) - C.base, 0, 0, 0, 0)),
      item_bonus: {}, equip: { difesa: 0, difesaMagica: 0, blocco: 0 }, magia: { nucleo: 0, talenti: 0 }, resources: { hp: 0, mp: 0, sp: 0 },
      ...clone(emptyLists),
      active_skills: [{ name: cls.skill, effect: cls.skill_text, lvl: 1, pct: 0, cost: cls.cost, cd: cls.cooldown }],
      inventory: [
        ...cls.equip.map((e) => mkItem({ ...(e as ClassItem), equip_type: (e as ClassItem).equip_type ?? null })),
        mkItem({ name: "Corone d'Oro", stats_text: "Moneta di Valeria", type: "Monete", qty: 20, weight: 0 }),
      ],
      combat: { position: "Mischia", turn: 1, effects: [], cooldowns: [], log: [] }, death: null,
    };
    c.inventory = startingEquipment(c);
    c.resources = maxesOf(c);
    db.chars.push(c);
    return ok(full(c), 201);
  }

  let m = /^\/characters\/(\d+)(\/.*)?$/.exec(path);
  if (m) {
    const c = db.chars.find((x) => x.id === Number(m![1]));
    if (!c) return err(404, "Personaggio non trovato.");
    if (!isMaster && c.owner_id !== me.id) return err(403, "Questo personaggio non ti appartiene.");
    const sub = m[2] || "";
    if (sub === "" && method === "GET") return ok(full(c));
    if (sub === "" && method === "DELETE") {
      if (!isMaster) return err(403, "Solo il Master può eliminare un personaggio.");
      db.chars = db.chars.filter((x) => x !== c);
      return { status: 204, data: null };
    }
    if (sub === "" && method === "PATCH") {
      const masterKeys = ["level", "exp_pct", "regno", "pvp", "gilda", "corone", "scellini", "stats", "item_bonus", "equip", "magia",
        "titles", "skills", "active_skills", "talents", "inventory", "pets", "curses", "quests", "reputation"];
      const sent = Object.keys(b).filter((k) => masterKeys.includes(k));
      if (sent.length && !isMaster) return err(403, `Solo il Master può modificare: ${sent.join(", ")}.`);
      for (const k of sent) {
        const v = clone(b[k]);
        if (k === "stats") (v as Record<string, unknown>[]).forEach((r) => delete r.total);
        (c as unknown as Record<string, unknown>)[k] = v;
      }
      const mx = maxesOf(c);
      if (b.resources) {
        const r = b.resources as Partial<Character["resources"]>;
        if (r.ki != null && mx.ki == null) return err(422, "KI: il personaggio non ha la statistica KI.");
        for (const k of RES_KEYS) {
          if (r[k] != null && mx[k] != null) c.resources[k] = Math.max(0, Math.min(mx[k]!, Math.round(Number(r[k]))));
        }
      }
      clampRes(c);
      const cb = b.combat as Partial<Character["combat"]> | undefined;
      if (cb?.position) { c.combat.position = cb.position; log(c, `Posizione: ${cb.position}.`); }
      return ok(full(c));
    }
    if (sub.startsWith("/equipment/") && method === "POST") {
      try {
        const slot = (k: unknown) => {
          if (!SLOT_DEFS.some((x) => x.key === k)) throw new EqErr(`Slot inesistente: ${String(k)}.`);
          return k as SlotKey;
        };
        if (sub === "/equipment/equip") c.inventory = equipOp(c, String(b.item_id || ""), b.slot ? slot(b.slot) : undefined);
        else if (sub === "/equipment/unequip") c.inventory = unequipOp(c, slot(b.slot));
        else if (sub === "/equipment/move") c.inventory = moveOp(c, slot(b.from_slot), slot(b.to_slot));
        else return err(404, "Rotta mock non implementata.");
      } catch (e) {
        if (e instanceof EqErr) return err(422, e.message);
        throw e;
      }
      clampRes(c);
      return ok(full(c));
    }
    if (sub === "/level-up" && method === "POST") {
      c.level += 1; c.exp_pct = 0;
      for (const r of c.stats) r.levelup += RULES.level.auto_per_level;
      if (c.level % RULES.level.talent_every === 0) log(c, `Nuovo talento disponibile al livello ${c.level}.`);
      return ok(full(c));
    }
    if (sub === "/distribute" && method === "POST") {
      const alloc = (b.alloc || {}) as Record<string, number>;
      const left = full(c).free_points.left;
      const tot = Object.values(alloc).reduce((a, v) => a + (Number(v) || 0), 0);
      if (tot > left) return err(422, `Punti insufficienti: ne restano ${left}.`);
      for (const [k, v] of Object.entries(alloc)) {
        const r = c.stats.find((x) => x.code === k);
        if (!r) return err(422, `Statistica inesistente: ${k}.`);
        r.investiti += Number(v) || 0;
      }
      return ok(full(c));
    }
    if (sub === "/combat/action" && method === "POST") {
      const amt = Math.floor(Number(b.amount));
      if (!(amt > 0)) return err(422, "La quantità deve essere maggiore di zero.");
      const r = c.resources;
      if (b.type === "damage") {
        let rest = amt;
        const sh = c.combat.effects.find((e) => Number(e.absorb) > 0);
        if (sh) {
          const abs = Math.min(Number(sh.absorb), rest);
          sh.absorb = Number(sh.absorb) - abs; rest -= abs;
          if (sh.absorb <= 0) { c.combat.effects = c.combat.effects.filter((e) => e !== sh); log(c, `${sh.name} assorbe ${nf(abs)} danni e si dissolve.`); }
          else { sh.text = `Assorbe ${nf(sh.absorb)} danni`; log(c, `${sh.name} assorbe ${nf(abs)} danni.`); }
        }
        if (rest > 0) {
          r.hp = Math.max(0, r.hp - rest);
          log(c, `Subiti ${nf(rest)} danni. HP ${nf(r.hp)}.`);
          if (r.hp === 0) log(c, "HP a zero: il personaggio è a terra.");
        }
      } else if (b.type === "heal") {
        const max = dmax(c, "hp"); const g = Math.max(0, Math.min(amt, max - r.hp));
        r.hp = Math.min(max, r.hp + amt); log(c, `Cura: +${nf(g)} HP. HP ${nf(r.hp)}.`);
      } else if (b.type === "spend_mp" || b.type === "spend_sp" || b.type === "spend_ki") {
        const k = String(b.type).slice(6) as "mp" | "sp" | "ki"; const L = k.toUpperCase();
        const max = maxesOf(c)[k];
        if (max == null) return err(422, `${c.name} non ha la statistica ${L}.`);
        const cur = r[k] ?? max;
        if (cur < amt) return err(422, `${L} insufficienti: servono ${nf(amt)}, disponibili ${nf(cur)}.`);
        r[k] = cur - amt; log(c, `Spesi ${nf(amt)} ${L}. ${L} ${nf(cur - amt)}.`);
      } else return err(422, "Azione sconosciuta.");
      return ok(full(c));
    }
    if (sub === "/combat/end-turn" && method === "POST") {
      const r = c.resources;
      const mpMax = dmax(c, "mp"), spMax = dmax(c, "sp"), hpMax = dmax(c, "hp");
      const mpG = Math.max(0, Math.min(mpMax - r.mp, Math.round((mpMax * RULES.regen.mp_pct) / 100)));
      const spG = Math.max(0, Math.min(spMax - r.sp, Math.round((spMax * RULES.regen.sp_pct) / 100)));
      r.mp += mpG; r.sp += spG;
      let line = `Fine turno: MP +${nf(mpG)}, SP +${nf(spG)}`;
      const kiMax = maxesOf(c).ki;
      if (kiMax != null) {  // KI: VIT/30 a turno (derivata kiCombat), entro il massimo
        const regen = derivedFor(c).find((x) => x.key === "kiCombat")?.value ?? 0;
        const cur = r.ki ?? kiMax;
        const kiG = Math.max(0, Math.min(kiMax - cur, Math.round(regen)));
        r.ki = cur + kiG; line += `, KI +${nf(kiG)}`;
      }
      log(c, `${line}.`);
      for (const e of c.combat.effects) {
        const h = Number(e.hpPerTurn) || 0;
        if (h) { r.hp = Math.max(0, Math.min(hpMax, r.hp + h)); log(c, `${e.name}: ${h > 0 ? "+" : "−"}${nf(Math.abs(h))} HP.`); }
        e.turns -= 1;
      }
      const exp = c.combat.effects.filter((e) => e.turns <= 0).map((e) => e.name);
      c.combat.effects = c.combat.effects.filter((e) => e.turns > 0);
      if (exp.length) log(c, `Effetti terminati: ${exp.join(", ")}.`);
      for (const cd of c.combat.cooldowns) cd.turns -= 1;
      const ready = c.combat.cooldowns.filter((x) => x.turns <= 0).map((x) => x.name);
      c.combat.cooldowns = c.combat.cooldowns.filter((x) => x.turns > 0);
      if (ready.length) log(c, `Di nuovo pronte: ${ready.join(", ")}.`);
      c.combat.turn += 1;
      return ok(full(c));
    }
    if (sub === "/combat/effects" && method === "POST") {
      const name = String(b.name || "").trim();
      if (!name) return err(422, "Il nome dell'effetto è obbligatorio.");
      const turns = Math.max(1, Math.floor(Number(b.turns)) || 1);
      const e: Effect = { name, kind: b.kind === "good" ? "good" : "bad", text: String(b.text || (b.kind === "good" ? "Effetto positivo" : "Malus")), turns };
      if (b.hpPerTurn) e.hpPerTurn = Number(b.hpPerTurn);
      if (b.absorb) e.absorb = Number(b.absorb);
      c.combat.effects.push(e);
      log(c, `Nuovo effetto: ${name} (${turns} ${turns === 1 ? "turno" : "turni"}).`);
      return ok(full(c));
    }
    m = /^\/combat\/effects\/(\d+)$/.exec(sub);
    if (m && method === "DELETE") {
      const i = Number(m[1]); const e = c.combat.effects[i];
      if (!e) return err(404, "Effetto non trovato.");
      c.combat.effects.splice(i, 1); log(c, `Effetto rimosso: ${e.name}.`);
      return ok(full(c));
    }
    if (sub === "/combat/reset" && method === "POST") {
      c.combat = { ...c.combat, turn: 1, effects: [], cooldowns: [], log: [] };
      return ok(full(c));
    }
    if (sub === "/death" && method === "POST") {
      const hubris = !!b.hubris;
      const from = c.level;
      let death: Character["death"];
      if (c.level <= 2) death = { lost: 0, malus: "—", bonus: "—", protected: true };
      else {
        const lost = hubris ? 3 : 1.5;
        const pos = Math.max(1, c.level + c.exp_pct / 100 - lost);
        c.level = Math.floor(pos); c.exp_pct = Math.round((pos - c.level) * 100);
        death = { lost, malus: "−10% a tutte le statistiche per 1 ora", bonus: "+50% EXP per 30 minuti", protected: false };
      }
      const r = c.resources;
      if (b.respawn === "here") r.hp = 1;
      else c.resources = mapRes(maxesOf(c), (m) => Math.round(m / 2));
      c.combat = { ...c.combat, turn: 1, effects: [], cooldowns: [], log: [] };
      c.death = death;
      log(c, death.protected ? "Morte (livello protetto)." : `Morte: livello ${from} → ${c.level}.`);
      const res = full(c);
      c.death = null;
      return ok(res);
    }
    return err(404, "Rotta non trovata.");
  }

  /* Tavolo */
  m = /^\/table\/characters\/(\d+)\/rolls$/.exec(path);
  if (m && method === "POST") {
    const c = db.chars.find((x) => x.id === Number(m![1]));
    if (!c || (!isMaster && c.owner_id !== me.id)) return err(404, "Personaggio non trovato.");
    if (!isCall(b.call)) return err(422, "Dati non validi — call: campo obbligatorio mancante (ammessi: 'sopra' o 'sotto').");
    const mods = checkMods(c, b.mods);
    if (typeof mods === "string") return err(422, mods);
    const q = typeof b.request_id === "number" ? table.requests.find((x) => x.id === b.request_id && x.char_id === c.id && x.status === "aperta") : undefined;
    const r = newRoll(c.id, me, String(b.reason ?? ""), mods, false, q ? q.id : null, b.call);
    if (q) { q.status = "risolta"; q.roll_id = r.id; }
    return ok(r, 201);
  }
  const mine = () => db.chars.filter((c) => c.owner_id === me.id).map((c) => c.id);
  if (path.startsWith("/table/rolls")) {
    const qs = new URLSearchParams(path.split("?")[1] || "");
    if (method === "POST" && path === "/table/rolls") {
      if (!isMaster) return err(403, "Operazione riservata al Master.");
      if (b.call != null && !isCall(b.call)) return err(422, "Dati non validi — call: valore non ammesso (ammessi: 'sopra' o 'sotto').");
      return ok(newRoll(null, me, String(b.reason ?? ""), [], !!b.secret, null, isCall(b.call) ? b.call : null), 201);
    }
    if (method === "GET") {
      const ids = mine();
      const cid = qs.get("char_id");
      const lim = Math.max(1, Math.min(200, Number(qs.get("limit")) || 50));
      return ok(table.rolls.filter((r) => (isMaster || (r.char_id != null && ids.includes(r.char_id) && !r.secret)) && (cid == null || r.char_id === Number(cid)))
        .slice().reverse().slice(0, lim));
    }
  }
  if (path.startsWith("/table/requests")) {
    const qs = new URLSearchParams(path.split("?")[1] || "");
    if (method === "GET") {
      const ids = mine();
      const stt = qs.get("status");
      return ok(table.requests.filter((q) => (isMaster || ids.includes(q.char_id)) && (!stt || q.status === stt)).slice().reverse().map(requestOut));
    }
    if (!isMaster) return err(403, "Operazione riservata al Master.");
    if (method === "POST" && path === "/table/requests") {
      const c = db.chars.find((x) => x.id === b.char_id);
      if (!c) return err(404, "Personaggio non trovato.");
      const what = String(b.what ?? "").trim();
      if (what.length < 2 || what.length > 80) return err(422, "Dati non validi — what: da 2 a 80 caratteri.");
      const q = { id: table.seq++, char_id: c.id, what, note: String(b.note ?? "").trim().slice(0, 200), status: "aperta" as const, roll_id: null, created_at: new Date().toISOString() };
      table.requests.push(q);
      return ok(requestOut(q), 201);
    }
    m = /^\/table\/requests\/(\d+)$/.exec(path);
    if (m && method === "DELETE") {
      const i = table.requests.findIndex((x) => x.id === Number(m![1]));
      if (i < 0) return err(404, "Richiesta di tiro non trovata.");
      table.requests.splice(i, 1);
      return { status: 204, data: null };
    }
  }

  if (!isMaster && (path.startsWith("/campaign") || path.startsWith("/npcs") || path.startsWith("/issues"))) {
    return err(403, "Area riservata al Master.");
  }
  if (path === "/campaign" && method === "GET") return ok(db.campaign);
  if (path === "/campaign/session" && method === "POST") { db.campaign.session += 1; return ok(db.campaign); }
  if (path === "/npcs" && method === "GET") return ok(db.npcs);
  m = /^\/npcs\/(\d+)(\/interactions)?$/.exec(path);
  if (m) {
    const n = db.npcs.find((x) => x.id === Number(m![1]));
    if (!n) return err(404, "PNG non trovato.");
    if (m[2] && method === "POST") {
      const text = String(b.text || "").trim();
      if (!text) return err(422, "Scrivi almeno una riga.");
      n.history.push({ session: db.campaign.session, text, at: new Date().toISOString() });
      n.last = `Sessione ${db.campaign.session} — ${text}`;
      return ok(n);
    }
    if (!m[2] && method === "PATCH") { Object.assign(n, b, { id: n.id, history: n.history }); return ok(n); }
  }
  if (path === "/issues" && method === "GET") return ok(db.issues);
  m = /^\/issues\/(\d+)$/.exec(path);
  if (m && method === "PATCH") {
    const it = db.issues.find((x) => x.id === Number(m![1]));
    if (!it) return err(404, "Questione non trovata.");
    if (typeof b.resolved === "boolean") it.resolved = b.resolved;
    if ("decision" in b) it.decision = (b.decision as string | null) || null;
    return ok(it);
  }
  return err(404, "Rotta non trovata.");
}
