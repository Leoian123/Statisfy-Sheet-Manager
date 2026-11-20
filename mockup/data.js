/* Dati di esempio per il mockup.
   Kelvin: valori presi da Scheda_Personaggio_STATISFY_Kelvin.xlsx (alcuni pesi, PNG e stati di combattimento sono inventati).
   Gli altri PG: solo nome/classe/livello reali dove noti, statistiche inventate. */
(function () {
  const S = window.STATISFY;

  const stat = (code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note) =>
    ({ code, name, kind, iniziale, creazione, investiti, levelup, altro, titoli, note });

  const kelvin = {
    id: "kelvin",
    owner: "Giocatore 1",
    name: "Kelvin",
    classe: "Domatore",
    level: 77,
    expPct: 0,
    regno: "Valeria",
    pvp: "Bianco",
    gilda: { nome: "—", ruolo: "Nessuna gilda" },
    corone: 25,
    scellini: 30,
    stats: [
      stat("STR", "Forza", "base", 10, 0, 84, 76, 0, 0),
      stat("DEX", "Destrezza", "base", 10, 0, 401, 76, 0, 5),
      stat("VIT", "Vitalità", "base", 10, 20, 75, 76, 0, 5),
      stat("INT", "Intelligenza", "base", 10, 0, 0, 76, 0, 0),
      stat("FIN", "Finesse", "avanzata", 0, 0, 200, 35, 354, 60, "Altro = talento Finesse IV: (somma+titoli)×1,2"),
      stat("AUT", "Autorità", "avanzata", 5, 0, 0, 7, 0, 50, "Sbloccata al livello 70"),
    ],
    // itemBonus ed equip vengono ricalcolati dagli oggetti equipaggiati (rules.applyEquipment)
    equipped: { manoPrincipale: "it-thanatos", manoSecondaria: "it-thanatos", spalle: "it-simbionte" },
    magia: { nucleo: 4, talenti: 0 },                 // gradi che riducono il divisore del danno magico (100 − 4×10 = 60)
    resources: { hp: 2410, mp: 640, sp: 2900 },
    titles: [
      { name: "Artigiano Talentuoso", rarity: "Raro", bonus: { DEX: 5, VIT: 5, FIN: 10 } },
      { name: "Il Primo Passo verso l'Artigiano", rarity: "Raro", bonus: { FIN: 50 } },
      { name: "Domatore delle Epoche", rarity: "Epico", bonus: { AUT: 50 } },
    ],
    skills: [
      { name: "Cooking", lvl: 10, pct: "MAX", type: "Craft", passive: "Gli effetti dei consumabili ingeriti raddoppiano" },
      { name: "Crafting", lvl: 10, pct: "MAX", type: "Craft", passive: "Passiva di Grado X sbloccata" },
      { name: "Leatherworking", lvl: 9, pct: 20, type: "Craft" },
      { name: "Ispeziona", lvl: 8, pct: 85, type: "Utility" },
      { name: "Domare", lvl: 6, pct: 40, type: "Classe" },
      { name: "Gathering", lvl: 7, pct: 12, type: "Gathering" },
      { name: "Spear", lvl: 4, pct: 66, type: "Combat" },
      { name: "Schivata", lvl: 5, pct: 30, type: "Defense" },
      { name: "Vis", lvl: 1, pct: 80, type: "Knowledge" },
      { name: "Lingua Eldarin", lvl: 1, pct: 85, type: "Language" },
    ],
    activeSkills: [
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
    /* Oggetti: vedi il modello in rules.js (SLOTS). Gli equipaggiabili hanno slot, stats (→ colonna Oggetti)
       e bonus (→ derivate). Quelli senza slot restano in borsa. Pesi e numeri degli oggetti nuovi sono di esempio. */
    inventory: [
      { id: "it-thanatos", name: "La Promessa di Thanatos", rarity: "Unico", type: "Arma", slot: "manoPrincipale", twoHanded: true,
        weaponBase: 410, stats: {}, bonus: { critico: 12 }, durability: { cur: 182, max: 200 }, req: { level: 70, DEX: 300 },
        stats_text: "Lancia a due mani · Base 410 · +12% critico", desc: "Una promessa fatta a un dio non si spezza: si consuma.", qty: 1, weight: 6 },
      { id: "it-simbionte", name: "Spalla del Simbionte", rarity: "Epico", type: "Armatura", slot: "spalle",
        stats: {}, bonus: { difesa: 85, evasione: 10 }, durability: { cur: 95, max: 120 }, req: { level: 60 },
        stats_text: "Difesa 85 · +10% Evasione", desc: "Cresce di qualche fibra ogni notte.", qty: 1, weight: 4 },
      { id: "it-elmo", name: "Elmo del Domatore", rarity: "Raro", type: "Armatura", slot: "testa",
        stats: { VIT: 8, AUT: 5 }, bonus: { difesa: 30 }, durability: { cur: 70, max: 70 }, req: { level: 50 },
        stats_text: "Difesa 30 · VIT +8 · AUT +5", qty: 1, weight: 3 },
      { id: "it-mantello", name: "Mantello del Gelo", rarity: "Raro", type: "Armatura", slot: "mantello",
        stats: { VIT: 5 }, bonus: { difesaMagica: 15, resElementi: 5 }, durability: { cur: 40, max: 60 },
        stats_text: "Difesa magica 15 · VIT +5 · +5% Res. elementi", qty: 1, weight: 2 },
      { id: "it-stivali", name: "Stivali del Segugio", rarity: "Non Comune", type: "Armatura", slot: "piedi",
        stats: { DEX: 6 }, bonus: { difesa: 12, velocita: 5 }, durability: { cur: 50, max: 50 },
        stats_text: "Difesa 12 · DEX +6 · +5% velocità", qty: 1, weight: 2 },
      { id: "it-anello-wyrm", name: "Anello del Wyrm", rarity: "Epico", type: "Accessorio", slot: "anello",
        stats: { INT: 12 }, bonus: { difesaMagica: 20 }, req: { level: 75 },
        stats_text: "INT +12 · Difesa magica 20", qty: 1, weight: 0.1 },
      { id: "it-anello-fin", name: "Anello dell'Artigiano", rarity: "Non Comune", type: "Accessorio", slot: "anello",
        stats: { FIN: 15 }, bonus: {}, stats_text: "FIN +15", qty: 1, weight: 0.1 },
      { id: "it-scudo", name: "Scudo di pelle di Wyrm", rarity: "Raro", type: "Scudo", slot: "manoSecondaria",
        stats: {}, bonus: { blocco: 20, difesa: 25 }, durability: { cur: 80, max: 80 }, req: { STR: 150 },
        stats_text: "Blocco 20% · Difesa 25", qty: 1, weight: 5 },
      { id: "it-zanna", name: "Zanna del Topo dei Ghiacci", rarity: "Non Comune", type: "Accessorio", slot: "ninnolo",
        stats: {}, bonus: { critico: 3 }, stats_text: "+3% critico", qty: 1, weight: 0.2 },
      { id: "it-kit", name: "Kit del conciatore", stats_text: "+5% qualità pelli", rarity: "Non Comune", type: "Strumento", slot: null, qty: 1, weight: 3 },
      { id: "it-pelle", name: "Pelle di Wyrm", stats_text: "Materiale grezzo", rarity: "Raro", type: "Materiale", slot: null, qty: 4, weight: 2 },
      { id: "it-razione", name: "Razione da viaggio", stats_text: "+50% recupero per 1h", rarity: "Comune", type: "Cibo", slot: null, qty: 12, weight: 0.5 },
      { id: "it-diario", name: "Diario di caccia", stats_text: "Appunti sulle creature domate", rarity: "Comune", type: "Libro", slot: null, qty: 1, weight: 1 },
      { id: "it-corone", name: "Corone d'Oro", stats_text: "Moneta di Valeria", rarity: "Comune", type: "Monete", slot: null, qty: 25, weight: 0 },
      { id: "it-scellini", name: "Scellini", stats_text: "Moneta minore", rarity: "Comune", type: "Monete", slot: null, qty: 30, weight: 0 },
    ],
    pets: [
      { name: "Celsius", species: "Topo dei Ghiacci", lvl: 56, passive: "Aura di gelo", skills: [{ name: "Morso glaciale", lvl: 6, pct: 30 }, { name: "Mimetismo nella neve", lvl: 4, pct: 10 }] },
      { name: "Fahrenheit", species: "Wyrm del Fuoco", lvl: 3, passive: "Immunità alla lava", skills: [{ name: "Ignis", lvl: 9, pct: 0 }] },
    ],
    curses: [
      { name: "Braccio degli antichi", desc: "Il braccio destro è posseduto da uno spirito antico.", bonus: "+20% FOR nelle prove con il braccio posseduto", malus: "−2 livelli di skill nei lavori di precisione" },
    ],
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
      position: "Media distanza",
      effects: [
        { name: "Emorragia", kind: "bad", text: "−3 HP/turno", turns: 2, hpPerTurn: -3 },
        { name: "Scudo Magico", kind: "good", text: "Assorbe 50 danni", turns: 3, absorb: 50 },
        { name: "Concentrazione", kind: "good", text: "+50% al prossimo attacco", turns: 1 },
      ],
      cooldowns: [
        { name: "Comando: Battaglia", turns: 2 },
        { name: "Comando: Sottomissione", turns: 4 },
      ],
    },
  };

  /* Altri PG della campagna: riepilogo per l'Area Master (statistiche inventate) */
  const quick = (id, name, owner, classe, level, s, str, dex, vit, int, extra = {}) => ({
    id, name, owner, classe, level, expPct: extra.expPct ?? 30, regno: extra.regno || "Valeria", pvp: extra.pvp || "Bianco",
    gilda: extra.gilda || { nome: "—", ruolo: "" }, summary: true,
    stats: [
      stat("STR", "Forza", "base", 10, s[0], str, level - 1, 0, 0),
      stat("DEX", "Destrezza", "base", 10, s[1], dex, level - 1, 0, 0),
      stat("VIT", "Vitalità", "base", 10, s[2], vit, level - 1, 0, 0),
      stat("INT", "Intelligenza", "base", 10, s[3], int, level - 1, 0, 0),
    ],
    resources: extra.resources || null,
  });

  const others = [
    quick("eric", "Eric", "Giocatore 2", "Faro della Civiltà", 64, [0, 0, 10, 10], 40, 60, 210, 320, { gilda: { nome: "Lanterne di Valeria", ruolo: "Diplomatico" } }),
    quick("corax", "Corax", "Giocatore 3", "Monaco", 181, [10, 10, 0, 0], 600, 700, 400, 100, { pvp: "Grigio", gilda: { nome: "Pugno di Raijin", ruolo: "Ufficiale" } }),
    quick("deniel", "Deniel", "Giocatore 4", "Guerriero", 110, [10, 0, 10, 0], 620, 200, 270, 0),
    quick("connor", "Connor", "Giocatore 5", "Ladro", 52, [0, 20, 0, 0], 60, 330, 80, 40, { regno: "Qadesh" }),
    quick("dante", "Dante", "Giocatore 6", "Ladro", 88, [0, 15, 5, 0], 120, 500, 150, 100, { pvp: "Rosso" }),
  ];

  const npcs = [
    { id: "marta", name: "Marta la Locandiera", level: 12, race: "Umana", place: "Alba Chiara — Il Gallo Storto", role: "Locandiera, informatrice", trust: "Buono",
      knows: "Sa che Kelvin è un Immortale e che cerca uova di Wyrm.", debts: "Kelvin le deve un favore (2 notti non pagate).", last: "Sessione 14 — gli ha venduto una mappa delle grotte.", secret: "Paga una tassa ai contrabbandieri del porto." },
    { id: "orsino", name: "Capitano Orsino", level: 95, race: "Umano", place: "Alba Chiara — Caserma", role: "Capitano della guardia", trust: "Neutrale",
      knows: "Conosce Kelvin solo di nome.", debts: "—", last: "Sessione 11 — ha multato Dante per rissa.", secret: "Ha perso il fratello contro un Wyrm del Fuoco." },
    { id: "teodoro", name: "Fra' Teodoro", level: 40, race: "Umano", place: "Tempio di Luxor", role: "Chierico, guaritore", trust: "Eccellente",
      knows: "Ha curato la maledizione di Kelvin per due volte.", debts: "Kelvin ha promesso una donazione di 50 Corone.", last: "Sessione 13 — ha studiato il Braccio degli antichi.", secret: "Sospetta che lo spirito nel braccio sia un antico re." },
  ];

  const campaign = {
    name: "Campagna di Alba Chiara",
    session: 15,
    master: "Il Narratore",
    openQuests: [
      { name: "Il Wyrm che non brucia", who: "Kelvin", rarity: "Raro", due: "—" },
      { name: "Taglia su Dante", who: "Dante", rarity: "Epico", due: "24h di gioco" },
      { name: "Ambasceria a Qadesh", who: "Eric, Connor", rarity: "Raro", due: "Sessione 18" },
    ],
    issues: [
      { title: "Moltiplicatore danno magico", text: "Le schede usano INT/50, INT/60 e INT/80. Serve un divisore unico.", sev: "bad", resolved: true,
        decision: "1 + INT/100. Ogni grado di nucleo magico o talento apposito abbassa il divisore di 10 (90, 80, …, minimo 10)." },
      { title: "Stamina assente nell'Excel", text: "Il regolamento definisce SP = 50 + (STR+DEX)×5, ma nessuna scheda la calcola.", sev: "warn", resolved: true,
        decision: "Confermata SP = 50 + (STR+DEX)×5. Va aggiunta al modello e calcolata in automatico." },
      { title: "Scala di rarità", text: "Combat unisce Unico/Leggendario, il Crafting li separa e aggiunge Evolutivo; i titoli aggiungono Divino.", sev: "warn", resolved: true,
        decision: "Scala unica a 8 gradi: Comune, Non Comune, Raro, Epico, Unico, Leggendario, Mitico, Divino. Base danno arma: Unico 250–500, Leggendario 500–1000, Mitico 1000–2000, Divino 2000+. Moltiplicatore creature = grado³ (fino a ×512). Evolutivo è un tipo di oggetto con rarità effettiva, non un grado." },
      { title: "Punti Level Up incoerenti", text: "Corax (lv 181) ha 185 punti invece di 180.", sev: "warn" },
      { title: "Formule non definite", text: "Difesa, iniziativa, probabilità di critico e di blocco non hanno formula.", sev: "bad", resolved: true,
        decision: "Difesa = VIT/10 + Difesa equip × (1 + VIT/100); Difesa magica = INT/10 + Difesa magica equip × (1 + INT/100); Iniziativa = 10 + DEX/10; Critico = 5 + DEX/40 % (max 75%); Blocco = Blocco scudo + STR/40 % (solo con scudo, max 75%)." },
    ],
  };

  const classes = [
    { id: "guerriero", name: "Guerriero", skill: "Attacco Possente", skillText: "15 SP · +50% danno fisico · cooldown 3 turni",
      equip: ["Spada di Ferro (Req 15 STR)", "Armatura di Cuoio Rinforzato (+5 Difesa)", "Scudo di Legno (Blocco 20%)"] },
    { id: "mago", name: "Mago", skill: "Dardo Magico", skillText: "20 MP · colpisce sempre · cooldown 1 turno",
      equip: ["Bastone di Frassino (Req 15 INT, +10% Mana)", "Vesti di Stoffa (+3 Regen Mana)", "Grimorio Basilare (Dardo + 2 slot liberi)"] },
    { id: "ladro", name: "Ladro", skill: "Colpo Furtivo", skillText: "10 SP · +100% critico se non visto · cooldown 2 turni",
      equip: ["Daga Affilata (Req 15 DEX, +5% Critico)", "Armatura di Cuoio Morbido (+10% Evasione)", "Kit da Scasso"] },
    { id: "chierico", name: "Chierico", skill: "Cura Minore", skillText: "25 MP · ripristina 40–60 HP · cooldown 1 turno",
      equip: ["Mazza Benedetta (Req 12 STR, +10% vs non-morti)", "Vesti Sacre (+5 Difesa Magica)", "Simbolo Sacro"] },
  ];

  const kingdoms = [
    { id: "valeria", name: "Valeria", text: "Regno d'oro e grano. Il più comune per iniziare; moneta: Corone d'Oro." },
    { id: "qadesh", name: "Qadesh", text: "Sole e sabbia, rotte carovaniere." },
    { id: "frostland", name: "Frostland", text: "Ghiacci del nord, popoli duri." },
    { id: "eldermoor", name: "Eldermoor", text: "Foreste verde e oro, tradizioni antiche." },
  ];

  S.data = { characters: [kelvin, ...others], npcs, campaign, classes, kingdoms };
})();
