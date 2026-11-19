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
  ];

  function statTotal(row) {
    return SOURCES.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
  }

  /* Ritorna { STR: 170, DEX: 492, ... } per un personaggio (stat base + avanzate) */
  function totals(char) {
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
    { key: "evasione", label: "Evasione", fmt: "pct", src: "Regole", calc: (t) => t.DEX / 20, formula: "DEX / 20 %" },
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
  ];

  /* Nucleo magico: divisore base 100, −10 per ogni grado di nucleo o talento apposito (minimo 10). */
  function magic(c) { return { nucleo: 0, talenti: 0, ...((c && c.magia) || {}) }; }
  function magicDivisor(c) { const m = magic(c); return Math.max(10, 100 - 10 * (m.nucleo + m.talenti)); }
  /* Valori dell'equipaggiamento indossato che entrano nelle formule */
  function equip(c) { return { difesa: 0, difesaMagica: 0, blocco: 0, ...((c && c.equip) || {}) }; }

  /* Valore della derivata senza bonus oggetti (con eventuale tetto) */
  function derived(char) {
    const t = totals(char);
    const out = {};
    for (const d of DERIVED) out[d.key] = d.cap != null ? Math.min(d.cap, d.calc(t, char)) : d.calc(t, char);
    return out;
  }
  /* Testo della formula e calcolo con i valori del personaggio, per i tooltip */
  function formulaText(def, c) { return def.formulaFor ? def.formulaFor(c) : def.formula; }
  function explain(def, c) {
    const t = totals(c);
    if (def.explain) return def.explain(t, c);
    return def.formula.replace(/ \(.*\)$/, "").replace(/ %$/, "").replace(/\b(STR|DEX|VIT|INT)\b/g, (m) => String(t[m] ?? m));
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

  S.rules = { BASE_STATS, SOURCES, statTotal, totals, DERIVED, derived, formulaText, explain, magicDivisor, equip, fmt, CREATION, penaltyBand, LEVEL, freePointsTotal, deathPenalty, REGEN, GRADES, ROMAN, RARITIES, RARITY_SCALE, rarityKey, powerRank };
  S.ui = { esc, rarityChip, bar, win, toast };
})();
