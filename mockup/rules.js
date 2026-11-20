/* Regole STATISFY usate dal mockup.
   Anticipa il modulo regole che vivrà nel backend Python: ogni formula cita la fonte. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });

  const BASE_STATS = ["STR", "DEX", "VIT", "INT"];
  /* Colonne di origine dei punti, come nell'Excel (Iniziale + Creazione + Investiti + LevelUp + Altro + Titoli) */
  const SOURCES = [
    { key: "iniziale", label: "Iniziale" },
    { key: "creazione", label: "Creazione" },
    { key: "investiti", label: "Investiti" },
    { key: "levelup", label: "Level up" },
    { key: "altro", label: "Altro" },
    { key: "titoli", label: "Titoli" },
    { key: "oggetti", label: "Oggetti" }, // calcolata dagli oggetti equipaggiati (applyEquipment), mai inserita a mano
  ];

  function statTotal(row) {
    return SOURCES.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
  }

  /* ---------- Equipaggiamento stile MMORPG (deciso 20/11/2026) ----------
     Slot del manichino. Un'arma a due mani occupa manoPrincipale e blocca manoSecondaria.
     Oggetto: { id, name, rarity, type, slot|null, twoHanded?, weight, qty, quality?,
                stats: {STR: n, ...},          // bonus alle statistiche → colonna "Oggetti"
                bonus: {difesa, difesaMagica, blocco, evasione, critico, ...},  // bonus alle derivate
                weaponBase?: number, durability?: {cur, max}, req?: {level, STR, ...}, desc?, stats_text? }
     Personaggio: inventory: Oggetto[], equipped: { slotKey: itemId } */
  const SLOTS = [
    { key: "testa", label: "Testa", side: "left" },
    { key: "collo", label: "Collo", side: "left" },
    { key: "spalle", label: "Spalle", side: "left" },
    { key: "mantello", label: "Mantello", side: "left" },
    { key: "torso", label: "Torso", side: "left" },
    { key: "polsi", label: "Polsi", side: "left" },
    { key: "mani", label: "Mani", side: "right" },
    { key: "cintura", label: "Cintura", side: "right" },
    { key: "gambe", label: "Gambe", side: "right" },
    { key: "piedi", label: "Piedi", side: "right" },
    { key: "anello1", label: "Anello", side: "right", accepts: "anello" },
    { key: "anello2", label: "Anello", side: "right", accepts: "anello" },
    { key: "ninnolo1", label: "Ninnolo", side: "bottom", accepts: "ninnolo" },
    { key: "ninnolo2", label: "Ninnolo", side: "bottom", accepts: "ninnolo" },
    { key: "manoPrincipale", label: "Mano principale", side: "bottom" },
    { key: "manoSecondaria", label: "Mano secondaria", side: "bottom" },
  ];
  /* Bonus che entrano nelle formule come "equipaggiamento" (moltiplicati dalla statistica), non sommati dopo */
  const EQUIP_FORMULA_KEYS = ["difesa", "difesaMagica", "blocco"];

  /* Tipo di equipaggiamento → slot del manichino. Ricalca lo standard MMORPG (WoW "InventoryType"):
     ogni oggetto dichiara un tipo, il tipo decide in quali slot può entrare.
     - Una mano: mano principale o secondaria (doppia impugnatura);
     - Mano principale: solo principale; Due mani: principale e blocca la secondaria;
     - Scudo e "Tenuto in mano secondaria" (focus, tomo, simbolo sacro): solo secondaria;
     - Anelli e ninnoli: uno qualsiasi dei due slot. */
  const EQUIP_TYPES = {
    elmo:           { label: "Elmo",               slots: ["testa"] },
    amuleto:        { label: "Amuleto",            slots: ["collo"] },
    spallacci:      { label: "Spallacci",          slots: ["spalle"] },
    mantello:       { label: "Mantello",           slots: ["mantello"] },
    corazza:        { label: "Corazza / Veste",    slots: ["torso"] },
    bracciali:      { label: "Bracciali",          slots: ["polsi"] },
    guanti:         { label: "Guanti",             slots: ["mani"] },
    cintura:        { label: "Cintura",            slots: ["cintura"] },
    gambali:        { label: "Gambali",            slots: ["gambe"] },
    stivali:        { label: "Stivali",            slots: ["piedi"] },
    anello:         { label: "Anello",             slots: ["anello1", "anello2"] },
    ninnolo:        { label: "Ninnolo",            slots: ["ninnolo1", "ninnolo2"] },
    unaMano:        { label: "Una mano",           slots: ["manoPrincipale", "manoSecondaria"] },
    manoPrincipale: { label: "Mano principale",    slots: ["manoPrincipale"] },
    dueMani:        { label: "Due mani",           slots: ["manoPrincipale"], twoHanded: true },
    scudo:          { label: "Scudo",              slots: ["manoSecondaria"] },
    tenuto:         { label: "Tenuto in mano secondaria", slots: ["manoSecondaria"] },
  };
  function equipType(item) { return (item && item.slot && EQUIP_TYPES[item.slot]) || null; }
  function isTwoHanded(item) { return !!(item && (item.twoHanded || (equipType(item) || {}).twoHanded)); }
  function slotAccepts(slot, item) {
    const t = equipType(item);
    return !!t && t.slots.includes(slot.key);
  }
  function equippedItems(c) {
    const ids = new Set(Object.values((c && c.equipped) || {}).filter(Boolean));
    return ((c && c.inventory) || []).filter((it) => it.id && ids.has(it.id));
  }
  /* Ricalcola dagli oggetti equipaggiati: colonna "oggetti" delle stat, c.equip e c.itemBonus.
     Solo per i PG con c.equipped (gli altri mantengono i valori inseriti a mano). Idempotente. */
  function applyEquipment(c) {
    if (!c || !c.equipped) return;
    const statSum = {};
    const equip = { difesa: 0, difesaMagica: 0, blocco: 0 };
    const itemBonus = {};
    for (const it of equippedItems(c)) {
      for (const [k, v] of Object.entries(it.stats || {})) statSum[k] = (statSum[k] || 0) + Number(v || 0);
      for (const [k, v] of Object.entries(it.bonus || {})) {
        if (EQUIP_FORMULA_KEYS.includes(k)) equip[k] += Number(v || 0);
        else itemBonus[k] = (itemBonus[k] || 0) + Number(v || 0);
      }
    }
    for (const row of c.stats || []) row.oggetti = statSum[row.code] || 0;
    c.equip = equip;
    c.itemBonus = itemBonus;
  }
  /* Doppia impugnatura (deciso 20/11/2026): libera per tutti, il danno della mano secondaria lo decide un talento.
     Deciso anche il numero: senza talento la mano secondaria fa il 50% del danno; un talento "Doppia impugnatura"
     (o "Ambidestria") porta la sua percentuale nell'effetto, es. "Mano secondaria al 75% del danno". */
  const OFFHAND_BASE_PCT = 50;
  function offHandPct(c) {
    const tal = ((c && c.talents) || []).find((t) => /doppia impugnatura|ambidestr/i.test(t.name || ""));
    const m = tal && /(\d+(?:[.,]\d+)?)\s*%/.exec(tal.effect || "");
    return { pct: m ? Number(m[1].replace(",", ".")) : OFFHAND_BASE_PCT, talent: tal ? tal.name : null };
  }
  /* Arma nella mano secondaria (solo armi a una mano: scudi e oggetti tenuti non fanno danno) */
  function offHandWeapon(c) {
    const id = c && c.equipped && c.equipped.manoSecondaria;
    const it = id && ((c.inventory || []).find((x) => x.id === id));
    return it && it.weaponBase && (equipType(it) || {}) === EQUIP_TYPES.unaMano ? it : null;
  }

  /* Requisiti non soddisfatti, es. ["Livello 80", "STR 200"] */
  function unmetRequirements(c, item) {
    const out = [];
    const req = (item && item.req) || {};
    const t = totals(c);
    for (const [k, v] of Object.entries(req)) {
      if (k === "level") { if (c.level < v) out.push(`Livello ${v}`); }
      else if ((t[k] ?? 0) < v) out.push(`${k} ${v}`);
    }
    return out;
  }

  /* Ritorna { STR: 170, DEX: 492, ... } per un personaggio (stat base + avanzate) */
  function totals(char) {
    applyEquipment(char);
    const out = {};
    for (const row of char.stats) out[row.code] = statTotal(row);
    return out;
  }

  /* Statistiche derivate. Fonte: Creazione personaggio.txt / Glossario + fogli Excel (vedi "src"). */
  const DERIVED = [
    { key: "hp", label: "Vita (HP) max", fmt: "int", src: "Regole", calc: (t) => 100 + t.VIT * 15, formula: "100 + VIT×15" },
    { key: "mp", label: "Mana (MP) max", fmt: "int", src: "Regole", calc: (t) => 50 + t.INT * 10, formula: "50 + INT×10" },
    { key: "sp", label: "Stamina (SP) max", fmt: "int", src: "Regole (confermata il 19/11/2026)", calc: (t) => 50 + (t.STR + t.DEX) * 5, formula: "50 + (STR+DEX)×5" },
    { key: "carico", label: "Carico massimo", fmt: "kg", src: "Regole", calc: (t) => 50 + t.STR * 2, formula: "50 + STR×2 kg" },
    /* Con la Fortuna (LCK) l'Evasione è (DEX + LCK)/20, come nel foglio Excel di Dante */
    { key: "evasione", label: "Evasione", fmt: "pct", src: "Regole + Excel (Fortuna)", calc: (t) => (t.DEX + (t.LCK || 0)) / 20, formula: "DEX / 20 %",
      formulaFor: (c) => (hasStat(c, "LCK") ? "(DEX + LCK) / 20 %" : "DEX / 20 %"),
      explain: (t, c) => (hasStat(c, "LCK") ? `(${t.DEX} + ${t.LCK}) / 20` : `${t.DEX} / 20`) },
    { key: "precisione", label: "Precisione", fmt: "pct", src: "Regole", calc: (t) => 70 + t.DEX / 10, formula: "70 + DEX/10 %" },
    { key: "regen", label: "Regen HP", fmt: "permin", src: "Regole", calc: (t) => t.VIT / 10, formula: "VIT / 10 HP/min" },
    { key: "bonusExp", label: "Bonus EXP", fmt: "pct", src: "Regole", calc: (t) => t.INT / 20, formula: "INT / 20 %" },
    { key: "moltFis", label: "Molt. danno fisico", fmt: "mult", src: "Regole", calc: (t) => 1 + t.STR / 100, formula: "1 + STR/100" },
    { key: "moltMag", label: "Molt. danno magico", fmt: "mult", src: "Regole (decisa il 19/11/2026)",
      calc: (t, c) => 1 + t.INT / magicDivisor(c),
      formula: "1 + INT / divisore",
      formulaFor: (c) => `1 + INT/${magicDivisor(c)}`,
      explain: (t, c) => `1 + ${t.INT}/${magicDivisor(c)}`,
      note: (c) => `Divisore base 100, −10 per ogni grado di nucleo e talento magico (nucleo ${magic(c).nucleo}, talenti ${magic(c).talenti}).` },
    /* Formule decise il 19/11/2026, ricavate per analogia con quelle del regolamento:
       la statistica scala l'equipaggiamento come STR scala l'arma (× (1 + stat/100)). */
    { key: "difesa", label: "Difesa", fmt: "int1", src: "Regole (decisa il 19/11/2026)",
      calc: (t, c) => t.VIT / 10 + equip(c).difesa * (1 + t.VIT / 100),
      formula: "VIT/10 + Difesa equip × (1 + VIT/100)",
      explain: (t, c) => `${t.VIT}/10 + ${equip(c).difesa} × (1 + ${t.VIT}/100)`,
      note: () => "Si sottrae al danno fisico subito (minimo 1)." },
    { key: "difesaMag", label: "Difesa magica", fmt: "int1", src: "Regole (decisa il 19/11/2026)",
      calc: (t, c) => t.INT / 10 + equip(c).difesaMagica * (1 + t.INT / 100),
      formula: "INT/10 + Difesa magica equip × (1 + INT/100)",
      explain: (t, c) => `${t.INT}/10 + ${equip(c).difesaMagica} × (1 + ${t.INT}/100)`,
      note: () => "Riduce gli effetti magici ostili; il danno magico diretto ignora la Difesa fisica." },
    { key: "iniziativa", label: "Iniziativa", fmt: "dec", src: "Regole (decisa il 19/11/2026)",
      calc: (t) => 10 + t.DEX / 10,
      formula: "10 + DEX/10",
      note: () => "Ordine di turno decrescente; a parità agisce chi ha più DEX." },
    { key: "critico", label: "Prob. critico", fmt: "pct", src: "Regole (decisa il 19/11/2026)", cap: 75,
      calc: (t) => 5 + t.DEX / 40,
      formula: "5 + DEX/40 % (max 75%)",
      note: () => "Il critico raddoppia il danno. I bonus degli oggetti si sommano, sempre entro il 75%." },
    { key: "blocco", label: "Prob. blocco", fmt: "pct", src: "Regole (decisa il 19/11/2026)", cap: 75,
      calc: (t, c) => (equip(c).blocco > 0 ? equip(c).blocco + t.STR / 40 : 0),
      formula: "Blocco scudo + STR/40 % (solo con scudo, max 75%)",
      explain: (t, c) => (equip(c).blocco > 0 ? `${equip(c).blocco} + ${t.STR}/40` : "nessuno scudo equipaggiato → 0"),
      note: () => "Un blocco riuscito annulla il colpo." },
    { key: "attacchi", label: "Attacchi per turno", fmt: "dec", src: "Excel", calc: (t) => 1 + t.DEX * 0.005, formula: "1 + DEX×0.005" },
    { key: "velocita", label: "Velocità movimento", fmt: "pct", src: "Excel", calc: (t) => 100 + t.DEX / 5, formula: "100 + DEX/5 %" },
    { key: "resVeleni", label: "Res. veleni", fmt: "pct", src: "Excel", calc: (t) => t.VIT / 5, formula: "VIT / 5 %" },
    { key: "resElementi", label: "Res. elementi", fmt: "pct", src: "Excel", calc: (t) => t.VIT / 10, formula: "VIT / 10 %" },
    /* Derivate delle statistiche avanzate: solo per chi ha quella statistica (formule dei fogli Excel) */
    { key: "bonusFortuna", label: "Bonus Fortuna sui tiri", fmt: "dec", src: "Excel (Dante)", onlyIf: "LCK", calc: (t) => (t.LCK || 0) / 100, formula: "LCK / 100",
      explain: (t) => `${t.LCK} / 100`, note: () => "Nel foglio di Dante la cella calcola LCK/100, ma la descrizione dice LCK/10: da confermare." },
    { key: "ki", label: "KI max", fmt: "int", src: "Excel (Corax)", onlyIf: "KI", calc: (t) => 100 + (t.KI || 0) * 8, formula: "100 + KI×8" },
    { key: "kiCombat", label: "Regen KI in combattimento", fmt: "dec", src: "Excel (Corax)", onlyIf: "KI", calc: (t) => t.VIT / 30, formula: "VIT / 30 a turno" },
    { key: "kiFuori", label: "Regen KI fuori combattimento", fmt: "permin", src: "Excel (Corax)", onlyIf: "KI", calc: (t) => t.VIT / 15, formula: "VIT / 15 al minuto" },
    { key: "kiMeditazione", label: "Regen KI in meditazione", fmt: "permin", src: "Excel (Corax)", onlyIf: "KI", calc: (t) => t.VIT / 5, formula: "VIT / 5 al minuto" },
  ];
  function hasStat(c, code) { return ((c && c.stats) || []).some((r) => r.code === code); }
  /* Derivate che valgono per questo PG */
  function derivedFor(c) { return DERIVED.filter((d) => !d.onlyIf || hasStat(c, d.onlyIf)); }

  /* Nucleo magico: divisore base 100, −10 per ogni grado di nucleo o talento apposito (minimo 10). */
  function magic(c) { return { nucleo: 0, talenti: 0, ...((c && c.magia) || {}) }; }
  function magicDivisor(c) { const m = magic(c); return Math.max(10, 100 - 10 * (m.nucleo + m.talenti)); }
  /* Valori dell'equipaggiamento indossato che entrano nelle formule */
  function equip(c) { return { difesa: 0, difesaMagica: 0, blocco: 0, ...((c && c.equip) || {}) }; }

  /* Valore della derivata senza bonus oggetti (con eventuale tetto) */
  function derived(char) {
    const t = totals(char);
    const out = {};
    for (const d of derivedFor(char)) out[d.key] = d.cap != null ? Math.min(d.cap, d.calc(t, char)) : d.calc(t, char);
    return out;
  }
  /* Testo della formula e calcolo con i valori del personaggio, per i tooltip */
  function formulaText(def, c) { return def.formulaFor ? def.formulaFor(c) : def.formula; }
  function explain(def, c) {
    const t = totals(c);
    if (def.explain) return def.explain(t, c);
    return def.formula.replace(/ \(.*\)$/, "").replace(/ %$/, "").replace(/\b(STR|DEX|VIT|INT|LCK|KI)\b/g, (m) => String(t[m] ?? m));
  }

  function fmt(value, kind) {
    const n = Number(value);
    switch (kind) {
      case "int": return Math.round(n).toLocaleString("it-IT");
      case "kg": return `${round1(n)} kg`;
      case "int1": return round1(n);
      case "pct": return `${round1(n)}%`;
      case "permin": return `${round1(n)}/min`;
      case "mult": return `×${(Math.round(n * 100) / 100).toLocaleString("it-IT")}`;
      case "dec": return (Math.round(n * 100) / 100).toLocaleString("it-IT");
      default: return String(value);
    }
  }
  function round1(n) { return (Math.round(n * 10) / 10).toLocaleString("it-IT"); }

  /* Creazione: base 10, 20 punti bonus, si può scendere fino a 1 (penalità sotto 10). */
  const CREATION = { base: 10, bonusPoints: 20, min: 1 };
  function penaltyBand(value) {
    if (value >= 10) return null;
    if (value >= 7) return { band: "7–9", text: "Penalità lieve" };
    if (value >= 4) return { band: "4–6", text: "Penalità marcata" };
    return { band: "1–3", text: "Penalità grave" };
  }

  /* Progressione: +1 a ogni stat base per livello, +10 punti liberi per livello. */
  const LEVEL = { autoPerLevel: 1, freePerLevel: 10, talentEvery: 5 };
  function freePointsTotal(level) { return (level - 1) * LEVEL.freePerLevel; }

  /* Morte (Sistema_Conflitto_Morte.txt): −1,5 livelli (−3 per Hubris), lv 1–2 protetti, −10% stat per 1h. */
  function deathPenalty(level, expPct, hubris) {
    if (level <= 2) return { level, expPct, protected: true };
    const lost = hubris ? 3 : 1.5;
    let pos = level + expPct / 100 - lost;
    pos = Math.max(1, pos);
    const newLevel = Math.floor(pos);
    const newExp = Math.round((pos - newLevel) * 100);
    return { level: newLevel, expPct: newExp, lost, malus: "−10% a tutte le statistiche per 1 ora", bonus: "+50% EXP per 30 minuti" };
  }

  /* Rigenerazione per turno (Combat.txt): MP 10–20%, SP 25–30%. HP: nessuna in combattimento. */
  const REGEN = { mpPct: 15, spPct: 25 };

  /* Maestria: Gradi I–X */
  const GRADES = ["Assoluto Novizio", "Novizio", "Praticante", "Amatore", "Dilettante", "Specializzando", "Abile", "Esperto", "Professionista", "Maestro"];
  const ROMAN = ["—", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

  /* Scala di rarità unica (decisa il 20/11/2026): vale per oggetti, titoli, talenti, quest e creature.
     Base danno arma: i primi 5 gradi da Combat.txt; Unico e Leggendario ora separati, poi raddoppio per grado.
     Moltiplicatore creature: grado al cubo (Combat.txt), esteso a 8 gradi.
     "Evolutivo" non è un grado: è un tipo di oggetto che ha una rarità effettiva e la fa salire evolvendo. */
  const RARITY_SCALE = [
    { name: "Comune",      grade: 1, weaponBase: [15, 30],     creatureMult: 1 },
    { name: "Non Comune",  grade: 2, weaponBase: [30, 60],     creatureMult: 8 },
    { name: "Raro",        grade: 3, weaponBase: [60, 120],    creatureMult: 27 },
    { name: "Epico",       grade: 4, weaponBase: [120, 250],   creatureMult: 64 },
    { name: "Unico",       grade: 5, weaponBase: [250, 500],   creatureMult: 125 },
    { name: "Leggendario", grade: 6, weaponBase: [500, 1000],  creatureMult: 216 },
    { name: "Mitico",      grade: 7, weaponBase: [1000, 2000], creatureMult: 343 },
    { name: "Divino",      grade: 8, weaponBase: [2000, null], creatureMult: 512 },
  ];
  const RARITIES = RARITY_SCALE.map((r) => r.name);
  function rarityKey(r) { return String(r || "").toLowerCase().replace(/\s+/g, "").trim(); }

  /* Rango di potere per livello (Sistema_Status_Sociale.txt) */
  const POWER_RANKS = [
    { min: 1, name: "Soldato Semplice" }, { min: 100, name: "Guerriero Scelto" }, { min: 200, name: "Guerriero Importante" },
    { min: 300, name: "Eroe" }, { min: 400, name: "Leggenda" }, { min: 500, name: "Mito" }, { min: 600, name: "Divinità" },
  ];
  function powerRank(level) { return [...POWER_RANKS].reverse().find((r) => level >= r.min).name; }

  /* ---------- Utility UI condivise ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function rarityChip(r) {
    return `<span class="chip" data-rarity="${rarityKey(r)}">${esc(r)}</span>`;
  }
  function bar(kind, label, cur, max) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
    return `<div class="bar ${kind}">
      <div class="bar-top"><span class="label">${esc(label)}</span><span class="num">${Math.round(cur).toLocaleString("it-IT")} / ${Math.round(max).toLocaleString("it-IT")}</span></div>
      <div class="bar-track" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${Math.round(max)}" aria-valuenow="${Math.round(cur)}"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }
  function win(title, body, opts = {}) {
    return `<section class="win ${opts.gold ? "gold" : ""} ${opts.cls || ""}" ${opts.id ? `id="${opts.id}"` : ""}>
      <header class="win-h">${esc(title)}${opts.right ? `<span class="spacer"></span>${opts.right}` : ""}</header>
      <div class="win-b">${body}</div>
    </section>`;
  }
  let toastTimer;
  function toast(tag, lines, gold) {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    el.innerHTML = `<div class="sysmsg ${gold ? "gold" : ""} anim-in" role="status"><span class="tag">[${esc(tag)}]</span>${lines.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.innerHTML = ""; }, 4000);
  }

  S.rules = { derivedFor, hasStat, BASE_STATS, SOURCES, SLOTS, EQUIP_TYPES, equipType, isTwoHanded, OFFHAND_BASE_PCT, offHandPct, offHandWeapon, EQUIP_FORMULA_KEYS, slotAccepts, equippedItems, applyEquipment, unmetRequirements, statTotal, totals, DERIVED, derived, formulaText, explain, magicDivisor, equip, fmt, CREATION, penaltyBand, LEVEL, freePointsTotal, deathPenalty, REGEN, GRADES, ROMAN, RARITIES, RARITY_SCALE, rarityKey, powerRank };
  S.ui = { esc, rarityChip, bar, win, toast };
})();
