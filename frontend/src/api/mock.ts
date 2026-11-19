// Mock in memoria del backend, attivo solo con VITE_MOCK=1 (npm run dev:mock).
// Simula il server: qui (e solo qui) le regole sono replicate dal mockup per poter sviluppare senza backend.
import type {
  Campaign, Character, CharacterSummary, Derived, DerivedFmt, Effect, Issue, Npc, RulesConfig, StatRow, User,
} from "./types";

type Res = { status: number; data: unknown };

/* ---------- Regole (copia di mockup/rules.js) ---------- */
const SOURCES = ["iniziale", "creazione", "investiti", "levelup", "altro", "titoli"] as const;
const statTotal = (r: Partial<StatRow>) => SOURCES.reduce((s, k) => s + (Number(r[k]) || 0), 0);

type Calc = { t: Record<string, number>; eq: Character["equip"]; mg: Character["magia"] };
interface Def {
  key: string; label: string; fmt: DerivedFmt; src: string; cap?: number; disputed?: boolean;
  calc: (x: Calc) => number; formula: (x: Calc) => string; explain?: (x: Calc) => string; note?: (x: Calc) => string;
}
const div = (mg: Calc["mg"]) => Math.max(10, 100 - 10 * ((mg.nucleo || 0) + (mg.talenti || 0)));
const f = (s: string) => () => s;
const DEFS: Def[] = [
  { key: "hp", label: "Vita (HP) max", fmt: "int", src: "Regole", calc: ({ t }) => 100 + t.VIT * 15, formula: f("100 + VIT×15") },
  { key: "mp", label: "Mana (MP) max", fmt: "int", src: "Regole", calc: ({ t }) => 50 + t.INT * 10, formula: f("50 + INT×10") },
  { key: "sp", label: "Stamina (SP) max", fmt: "int", src: "Regole (confermata il 19/11/2026)", calc: ({ t }) => 50 + (t.STR + t.DEX) * 5, formula: f("50 + (STR+DEX)×5") },
  { key: "carico", label: "Carico massimo", fmt: "kg", src: "Regole", calc: ({ t }) => 50 + t.STR * 2, formula: f("50 + STR×2 kg") },
  { key: "evasione", label: "Evasione", fmt: "pct", src: "Regole", calc: ({ t }) => t.DEX / 20, formula: f("DEX / 20 %") },
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
  };
  return DEFS.map((d) => {
    const raw = d.calc(x);
    const base = d.cap != null ? Math.min(d.cap, raw) : raw;
    const bonus = Number(ib[d.key]) || 0;
    const value = d.cap != null ? Math.min(d.cap, base + bonus) : base + bonus;
    const formula = d.formula(x);
    const explain = d.explain ? d.explain(x)
      : formula.replace(/ \(.*\)$/, "").replace(/ %$/, "").replace(/\b(STR|DEX|VIT|INT)\b/g, (m) => String(x.t[m] ?? m));
    return { key: d.key, label: d.label, fmt: d.fmt, base, bonus, value, formula, explain, src: d.src, note: d.note ? d.note(x) : null, cap: d.cap ?? null, disputed: false };
  });
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
      equip: [{ name: "Spada di Ferro (Req 15 STR)", type: "Arma", weight: 3 }, { name: "Armatura di Cuoio Rinforzato (+5 Difesa)", type: "Armatura", weight: 5 }, { name: "Scudo di Legno (Blocco 20%)", type: "Accessorio", weight: 1 }] },
    { id: "mago", name: "Mago", skill: "Dardo Magico", skill_text: "Colpisce sempre", cost: "20 MP", cooldown: 1,
      equip: [{ name: "Bastone di Frassino (Req 15 INT, +10% Mana)", type: "Arma", weight: 3 }, { name: "Vesti di Stoffa (+3 Regen Mana)", type: "Armatura", weight: 5 }, { name: "Grimorio Basilare (Dardo + 2 slot liberi)", type: "Accessorio", weight: 1 }] },
    { id: "ladro", name: "Ladro", skill: "Colpo Furtivo", skill_text: "+100% critico se non visto", cost: "10 SP", cooldown: 2,
      equip: [{ name: "Daga Affilata (Req 15 DEX, +5% Critico)", type: "Arma", weight: 3 }, { name: "Armatura di Cuoio Morbido (+10% Evasione)", type: "Armatura", weight: 5 }, { name: "Kit da Scasso", type: "Accessorio", weight: 1 }] },
    { id: "chierico", name: "Chierico", skill: "Cura Minore", skill_text: "Ripristina 40–60 HP", cost: "25 MP", cooldown: 1,
      equip: [{ name: "Mazza Benedetta (Req 12 STR, +10% vs non-morti)", type: "Arma", weight: 3 }, { name: "Vesti Sacre (+5 Difesa Magica)", type: "Armatura", weight: 5 }, { name: "Simbolo Sacro", type: "Accessorio", weight: 1 }] },
  ],
  kingdoms: [
    { id: "valeria", name: "Valeria", text: "Regno d'oro e grano. Il più comune per iniziare; moneta: Corone d'Oro." },
    { id: "qadesh", name: "Qadesh", text: "Sole e sabbia, rotte carovaniere." },
    { id: "frostland", name: "Frostland", text: "Ghiacci del nord, popoli duri." },
    { id: "eldermoor", name: "Eldermoor", text: "Foreste verde e oro, tradizioni antiche." },
  ],
  positions: ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"],
  power_ranks: POWER_RANKS,
};

/* ---------- Dati ---------- */
const USERS: (User & { password: string })[] = [
  { id: 1, username: "master", password: "master", display_name: "Il Narratore", role: "master" },
  ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: i + 1, username: `giocatore${i}`, password: `giocatore${i}`, display_name: `Giocatore ${i}`, role: "player" as const })),
];

type Stored = Omit<Character, "derived" | "totals" | "free_points" | "power_rank" | "next_talent_level">;

const st = (code: string, name: string, kind: "base" | "avanzata", iniziale: number, creazione: number, investiti: number, levelup: number, altro: number, titoli: number, note?: string): StatRow =>
  ({ code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note: note ?? null, total: 0 });

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
  item_bonus: { evasione: 10, critico: 12 }, equip: { difesa: 85, difesaMagica: 0, blocco: 0 }, magia: { nucleo: 4, talenti: 0 },
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
  inventory: [
    { name: "La Promessa di Thanatos", stats: "Lancia · Base 410 · +12% critico", rarity: "Unico", type: "Arma", qty: 1, weight: 6 },
    { name: "Spalla del Simbionte", stats: "Difesa 85 · +10% Evasione", rarity: "Epico", type: "Armatura", qty: 1, weight: 4 },
    { name: "Kit del conciatore", stats: "+5% qualità pelli", rarity: "Non Comune", type: "Strumento", qty: 1, weight: 3 },
    { name: "Pelle di Wyrm", stats: "Materiale grezzo", rarity: "Raro", type: "Materiale", qty: 4, weight: 2 },
    { name: "Razione da viaggio", stats: "+50% recupero per 1h", rarity: "Comune", type: "Cibo", qty: 12, weight: 0.5 },
    { name: "Diario di caccia", stats: "Appunti sulle creature domate", rarity: "Comune", type: "Libro", qty: 1, weight: 1 },
    { name: "Corone d'Oro", stats: "Moneta di Valeria", rarity: "Comune", type: "Monete", qty: 25, weight: 0 },
    { name: "Scellini", stats: "Moneta minore", rarity: "Comune", type: "Monete", qty: 30, weight: 0 },
  ],
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

function quick(id: number, owner: number, name: string, classe: string, level: number, s: number[], inv: number[], extra: Partial<Stored> = {}): Stored {
  const names: [string, string][] = [["STR", "Forza"], ["DEX", "Destrezza"], ["VIT", "Vitalità"], ["INT", "Intelligenza"]];
  const stats = names.map(([c, n], i) => st(c, n, "base", 10, s[i], inv[i], level - 1, 0, 0));
  const c: Stored = {
    id, owner_id: owner + 1, owner_name: `Giocatore ${owner}`, name, classe, level, exp_pct: 30, regno: "Valeria", pvp: "Bianco",
    gilda: { nome: "—", ruolo: "" }, corone: 0, scellini: 0, stats, item_bonus: {}, equip: { difesa: 0, difesaMagica: 0, blocco: 0 },
    magia: { nucleo: 0, talenti: 0 }, resources: { hp: 0, mp: 0, sp: 0 }, ...emptyLists,
    combat: { position: "Mischia", turn: 1, effects: [], cooldowns: [], log: [] }, death: null, ...extra,
  };
  const d = derivedOf(c.stats);
  const v = (k: string) => d.find((x) => x.key === k)!.value;
  if (!extra.resources) c.resources = { hp: v("hp"), mp: v("mp"), sp: v("sp") };
  return c;
}

const db = {
  nextId: 7,
  chars: [
    kelvin,
    quick(2, 2, "Eric", "Faro della Civiltà", 64, [0, 0, 10, 10], [40, 60, 210, 320], { gilda: { nome: "Lanterne di Valeria", ruolo: "Diplomatico" } }),
    quick(3, 3, "Corax", "Monaco", 181, [10, 10, 0, 0], [600, 700, 400, 100], { pvp: "Grigio", gilda: { nome: "Pugno di Raijin", ruolo: "Ufficiale" } }),
    quick(4, 4, "Deniel", "Guerriero", 110, [10, 0, 10, 0], [620, 200, 270, 0]),
    quick(5, 5, "Connor", "Ladro", 52, [0, 20, 0, 0], [60, 330, 80, 40], { regno: "Qadesh" }),
    quick(6, 6, "Dante", "Ladro", 88, [0, 15, 5, 0], [120, 500, 150, 100], { pvp: "Rosso" }),
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
    { id: 4, title: "Punti Level Up incoerenti", text: "Corax (lv 181) ha 185 punti invece di 180.", sev: "warn", resolved: false, decision: null },
    { id: 5, title: "Formule non definite", text: "Difesa, iniziativa, probabilità di critico e di blocco non hanno formula.", sev: "bad", resolved: true,
      decision: "Difesa = VIT/10 + Difesa equip × (1 + VIT/100); Iniziativa = 10 + DEX/10; Critico = 5 + DEX/40 % (max 75%); Blocco = Blocco scudo + STR/40 % (solo con scudo, max 75%)." },
  ] as Issue[],
};

/* ---------- Helper ---------- */
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const ok = (data: unknown, status = 200): Res => ({ status, data: clone(data) });
const err = (status: number, detail: string): Res => ({ status, data: { detail } });
const dmax = (c: Stored, k: string) => derivedOf(c.stats, c.item_bonus, c.equip, c.magia).find((d) => d.key === k)!.value;
const nf = (x: number) => Math.round(x).toLocaleString("it-IT");

function full(c: Stored): Character {
  const stats = c.stats.map((r) => ({ ...r, total: statTotal(r) }));
  const used = c.stats.reduce((s, r) => s + (Number(r.investiti) || 0), 0);
  const total = (c.level - 1) * RULES.level.free_per_level;
  const every = RULES.level.talent_every;
  return {
    ...clone(c), stats,
    derived: derivedOf(c.stats, c.item_bonus, c.equip, c.magia), totals: totalsOf(c.stats),
    free_points: { total, used, left: total - used }, power_rank: powerRank(c.level),
    next_talent_level: (Math.floor(c.level / every) + 1) * every,
  };
}
function summary(c: Stored): CharacterSummary {
  return { id: c.id, owner_id: c.owner_id, owner_name: c.owner_name, name: c.name, classe: c.classe, level: c.level, exp_pct: c.exp_pct,
    regno: c.regno, pvp: c.pvp, gilda: c.gilda, power_rank: powerRank(c.level), hp: c.resources.hp, hp_max: dmax(c, "hp") };
}
function log(c: Stored, text: string) {
  c.combat.log.push(`T${c.combat.turn} · ${text}`);
  if (c.combat.log.length > 20) c.combat.log = c.combat.log.slice(-20);
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
    const stats = (b.stats as StatRow[]) || [];
    return ok({ totals: totalsOf(stats), derived: derivedOf(stats, b.item_bonus as Record<string, number>, b.equip as Character["equip"], b.magia as Character["magia"]) });
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
        ...cls.equip.map((e) => ({ name: e.name, stats: "Equipaggiamento iniziale", rarity: "Comune", type: e.type, qty: 1, weight: e.weight })),
        { name: "Corone d'Oro", stats: "Moneta di Valeria", rarity: "Comune", type: "Monete", qty: 20, weight: 0 },
      ],
      combat: { position: "Mischia", turn: 1, effects: [], cooldowns: [], log: [] }, death: null,
    };
    c.resources = { hp: dmax(c, "hp"), mp: dmax(c, "mp"), sp: dmax(c, "sp") };
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
      if (b.resources) {
        const r = b.resources as Partial<Character["resources"]>;
        for (const k of ["hp", "mp", "sp"] as const) {
          if (r[k] != null) c.resources[k] = Math.max(0, Math.min(dmax(c, k), Math.round(Number(r[k]))));
        }
      }
      const cb = b.combat as Partial<Character["combat"]> | undefined;
      if (cb?.position) { c.combat.position = cb.position; log(c, `Posizione: ${cb.position}.`); }
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
      } else if (b.type === "spend_mp" || b.type === "spend_sp") {
        const k = b.type === "spend_mp" ? "mp" : "sp"; const L = k.toUpperCase();
        if (r[k] < amt) return err(422, `${L} insufficienti: servono ${nf(amt)}, disponibili ${nf(r[k])}.`);
        r[k] -= amt; log(c, `Spesi ${nf(amt)} ${L}. ${L} ${nf(r[k])}.`);
      } else return err(422, "Azione sconosciuta.");
      return ok(full(c));
    }
    if (sub === "/combat/end-turn" && method === "POST") {
      const r = c.resources;
      const mpMax = dmax(c, "mp"), spMax = dmax(c, "sp"), hpMax = dmax(c, "hp");
      const mpG = Math.max(0, Math.min(mpMax - r.mp, Math.round((mpMax * RULES.regen.mp_pct) / 100)));
      const spG = Math.max(0, Math.min(spMax - r.sp, Math.round((spMax * RULES.regen.sp_pct) / 100)));
      r.mp += mpG; r.sp += spG;
      log(c, `Fine turno: MP +${nf(mpG)}, SP +${nf(spG)}.`);
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
      else { r.hp = Math.round(dmax(c, "hp") / 2); r.mp = Math.round(dmax(c, "mp") / 2); r.sp = Math.round(dmax(c, "sp") / 2); }
      c.combat = { ...c.combat, turn: 1, effects: [], cooldowns: [], log: [] };
      c.death = death;
      log(c, death.protected ? "Morte (livello protetto)." : `Morte: livello ${from} → ${c.level}.`);
      const res = full(c);
      c.death = null;
      return ok(res);
    }
    return err(404, "Rotta non trovata.");
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
