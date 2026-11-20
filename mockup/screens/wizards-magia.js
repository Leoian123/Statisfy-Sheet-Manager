/* Forgia del Master · wizard del gruppo "Magia":
     - Incantesimo (Mago, magia arcana per composizione di sfere)
     - Miracolo (Chierico, magia divina: niente sfere, Fede e favore del dio)
   Regole: statisfy/claude/Magia_Creazione_Incantesimi.txt (prevale), statisfy/Magic.txt.txt,
   Creazione personaggio.txt, Ambientazione.txt, Glossario_STATISFY.txt, Sistema_Status_Sociale.txt.
   Tutto ciò che non sta nei testi è marcato in UI con il chip "proposta" (title = spiegazione)
   ed è raccolto in PROPOSTE qui sotto. Le funzioni di calcolo sono pure ed esposte in S.wzMagia per i test. */
(function () {
  "use strict";
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.wizards = S.wizards || [];

  const esc = (s) => S.ui.esc(s);
  const roman = (n) => (n > 0 ? S.rules.ROMAN[Math.min(10, n)] || String(n) : "—");
  const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString("it-IT");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const isInt = (v) => typeof v === "number" && Number.isInteger(v);

  const SRC = {
    magic: "Magic.txt.txt",
    crea: "claude/Magia_Creazione_Incantesimi.txt",
    pg: "Creazione personaggio.txt",
    amb: "Ambientazione.txt",
    glo: "Glossario_STATISFY.txt",
    soc: "Sistema_Status_Sociale.txt",
  };

  /* Proposte (numeri e regole che i testi non danno): chiave → spiegazione mostrata nel title del chip */
  const PROPOSTE = {
    costo: "Costo Mana = 10 × L × (L+1), con L = livello di lancio. Tarato sul Dardo Magico (livello 1 = 20 MP); livello 3 = 120, livello 5 = 300, livello 10 = 1.100. Il narratore può contrattarlo.",
    tempo: "Tempo di lancio = 1 turno ogni 3 livelli di lancio (arrotondato per eccesso): 1–3 → 1 turno, 4–6 → 2, 7–9 → 3, 10 → 4.",
    ricarica: "Ricarica = livello di lancio / 2, arrotondato per eccesso (minimo 1 turno). Il Dardo Magico (livello 1) torna a 1 turno.",
    gravita: "Gravità del backlash = livello di lancio × 2 + fattori. Sostituisce il d20 del testo originale (i dadi sono aboliti); le fasce restano quelle di Magic.txt (≤8, 9–15, 16–20, 21–25, 26+).",
    sferaPura: "+2 alla gravità se l'incantesimo usa Spatium o Tempus: il testo dice che i loro backlash sono «più severi e impersonali», ma non dà un numero.",
    coppie: "+2 alla gravità se c'è una coppia Pericolosa, +1 se la peggiore è Debole (si conta solo la coppia peggiore).",
    severa: "Quando le due sfere si giudicano in modo diverso nella matrice (es. Anima «forte con Tempus», Tempus «pericolosa con tutte»), vale il giudizio più severo.",
    traverso: "Uso traverso: +1 livello di lancio per ogni sfera usata fuori dal suo campo naturale. Il testo dice solo che salgono difficoltà, costo e rischio.",
    gradoConsigliato: "Grado consigliato in ogni sfera ≥ livello di lancio (Grado I per il livello 1 … Grado X per il livello 10). Sotto, il lancio conta come overcast (+2 al backlash).",
    metaSfera: "Le metamagie di sfera (Ustionante, Fluente…) sono nel testo senza costo: proposto +2 livelli ciascuna.",
    sintonia: "Con più sfere la sintonia della zona si somma sfera per sfera e poi si limita a ±2.",
    efficacia: "Livello di efficacia = livello base + linea di potere + sintonia della zona (minimo 1). La metamagia alza il livello di lancio (costo e rischio), non la potenza: per quella ci sono Potenziata e Massimizzata.",
    danno: "Danno o cura = base 15–30 × livello di efficacia × molt. danno magico. Il testo fissa la base 15–30 solo per il livello 1 (Dardo); la crescita lineare per livello è una proposta.",
    composizione: "Più sfere = più controllo e meno danno («Palla di Fuoco di solo Ignis fa più danno»): ×1 con una sfera, ×0,85 con due, ×0,75 con tre.",
    curaArcana: "La cura arcana (Aqua, Vita) usa la stessa base del danno magico.",
    grimorio: "Grimorio e pratica partono entrambi da Grado I all'1%: la differenza è che lo slot del grimorio consolida subito, senza il periodo d'uso continuativo.",
    livelloMiracolo: "Livelli del miracolo 1–10, sulla stessa scala degli incantesimi: i testi non danno livelli per la magia divina.",
    fede: "Fede richiesta = 5 × L × (L+1): livello 1 = 10, livello 3 = 60, livello 5 = 150, livello 10 = 550.",
    costoMiracolo: "Costo Mana = 12,5 × L × (L+1), arrotondato. Tarato sulla Cura Minore (livello 1 = 25 MP); livello 3 = 150, livello 5 = 375.",
    favoreScala: "Scala del favore divino: i testi danno solo gli estremi (Maledizione divina ↔ Benedizione divina) e «Neutrale». I gradi intermedi (Rinnegato, In disgrazia, Notato, Favorito, Prescelto) e i valori da −3 a +4 sono una proposta.",
    favoreRichiesto: "Favore richiesto: livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione divina; +1 grado se la natura del miracolo è fuori dal dominio del dio.",
    affinita: "Natura affine al dio: elenco proposto a partire dal dominio scritto nei testi (es. Verdania → guarigione).",
    potenzaMiracolo: "Potenza = base × livello × (1 + Fede/100) × molt. favore. Molt. favore: ×1 al grado richiesto, +25% per ogni grado in più, ×0,5 un grado sotto (indebolito), 0 due o più gradi sotto (cessa).",
    castigo: "Il castigo usa la base del danno magico 15–30, come gli incantesimi.",
    tono: "Il tono del dio è una sintesi proposta dalle descrizioni dell'ambientazione.",
    voti: "Voti e tabù proposti a partire dal dominio del dio; il Master può aggiungerne di propri.",
    conseguenze: "Gradi di conseguenza oltre a «si indebolisce» e «cessa» (che vengono dal testo).",
  };
  const prop = (key, label = "proposta") =>
    `<span class="chip warn wm-prop" tabindex="0" role="note" title="${esc("Proposta: " + PROPOSTE[key])}" aria-label="${esc("Proposta: " + PROPOSTE[key])}">${esc(label)}</span>`;
  const src = (text) => `<span class="wm-src" title="${esc("Fonte: " + text)}">${esc(text)}</span>`;

  /* =====================================================================
     REGOLE: INCANTESIMI
     ===================================================================== */
  const SPHERES = [
    { key: "Ignis", it: "Fuoco", field: "Combustione, calore, passione, trasformazione rapida" },
    { key: "Aqua", it: "Acqua", field: "Liquidi, guarigione, ghiaccio e vapore, sogni" },
    { key: "Terra", it: "Terra", field: "Roccia, metallo, cristalli, crescita, stabilità" },
    { key: "Ventus", it: "Aria", field: "Venti, volo, suoni, comunicazione a distanza" },
    { key: "Mens", it: "Mente", field: "Pensiero, memoria, telepatia, illusioni" },
    { key: "Anima", it: "Spirito", field: "Spiriti, energia vitale, morte, protezione dalle influenze" },
    { key: "Vis", it: "Forza", field: "Energia pura, scudi, proiettili, gravità, dissolvere magie" },
    { key: "Vita", it: "Vita", field: "Guarigione, crescita, mutazione, cicli vitali" },
    { key: "Spatium", it: "Spazio", field: "Distanza, portali, teletrasporto · sfera pura", pure: true },
    { key: "Tempus", it: "Tempo", field: "Accelerare, rallentare, visioni · sfera pura", pure: true },
  ];
  const ROLES = ["forma", "innesco", "sostanza", "direzione", "potenza", "durata", "bersaglio", "protezione"];
  const CATEGORIES = [
    { key: "attacco", name: "Attacco" }, { key: "difesa", name: "Difesa" }, { key: "cura", name: "Cura" },
    { key: "controllo", name: "Controllo" }, { key: "utilita", name: "Utilità" }, { key: "movimento", name: "Movimento" },
    { key: "percezione", name: "Percezione" },
  ];
  const ORIGINS = [
    { key: "grimorio", name: "Grimorio", text: "Scritto in uno slot del Grimorio Basilare: si consolida subito, senza pratica.", skill: true },
    { key: "pratica", name: "Pratica", text: "Usato con continuità: entra «in pratica» come incantesimo di Grado I all'1%.", skill: true },
    { key: "improvvisato", name: "Improvvisato", text: "Composto sul momento: non diventa una skill finché non si consolida.", skill: false },
  ];

  /* Matrice di compatibilità (Magic.txt, "Compatibility matrix") */
  const COMPAT_RAW = {
    Ignis: { strong: ["Terra", "Ventus"], weak: ["Aqua"] },
    Aqua: { strong: ["Terra", "Vita"], weak: ["Ignis"] },
    Terra: { strong: ["Vita", "Ignis"], weak: ["Ventus"] },
    Ventus: { strong: ["Ignis", "Spatium"], weak: ["Terra"] },
    Mens: { strongAll: true, note: "forte con tutte (compatibilità universale)" },
    Anima: { strong: ["Vita", "Tempus"], dangerous: ["Vis"] },
    Vis: { note: "neutra con tutte, ma richiede un controllo preciso" },
    Vita: { strong: ["Aqua", "Terra"], weak: ["Anima"], note: "debole con Anima se manca un'etica" },
    Spatium: { strong: ["Tempus", "Ventus"], note: "pericolosa se usata di fretta" },
    Tempus: { strong: ["Spatium"], dangerousAll: true, note: "forte solo con Spatium, pericolosa con tutte le altre" },
  };
  const COMPAT_LEVELS = {
    S: { name: "Forte", cls: "good", rank: 0 },
    N: { name: "Neutra", cls: "muted", rank: 1 },
    W: { name: "Debole", cls: "warn", rank: 2 },
    D: { name: "Pericolosa", cls: "bad", rank: 3 },
  };
  function judge(a, b) {
    const r = COMPAT_RAW[a] || {};
    const strong = (r.strong || []).includes(b);
    if ((r.dangerous || []).includes(b) || (r.dangerousAll && !strong)) return "D";
    if ((r.weak || []).includes(b)) return "W";
    if (strong || r.strongAll) return "S";
    return "N";
  }
  /* Giudizio della coppia: vale il più severo dei due punti di vista (proposta "severa") */
  function pairCompat(a, b) {
    const x = judge(a, b), y = judge(b, a);
    const level = COMPAT_LEVELS[x].rank >= COMPAT_LEVELS[y].rank ? x : y;
    return { a, b, level, views: [`${a} → ${b}: ${COMPAT_LEVELS[x].name}`, `${b} → ${a}: ${COMPAT_LEVELS[y].name}`], disagree: x !== y };
  }
  function compatPairs(keys) {
    const out = [];
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) out.push(pairCompat(keys[i], keys[j]));
    return out;
  }
  function worstPair(pairs) {
    return pairs.reduce((w, p) => (!w || COMPAT_LEVELS[p.level].rank > COMPAT_LEVELS[w.level].rank ? p : w), null);
  }

  /* Metamagia (Magic.txt, "Metamagic enhancement") */
  const METAMAGIC = [
    { key: "extend", name: "Estesa", en: "Extend", lv: 1, text: "Durata doppia" },
    { key: "empower", name: "Potenziata", en: "Empower", lv: 2, text: "+50% agli effetti numerici" },
    { key: "maximize", name: "Massimizzata", en: "Maximize", lv: 3, text: "Danno o cura al massimo" },
    { key: "silent", name: "Silenziosa", en: "Silent", lv: 1, text: "Senza componenti verbali" },
    { key: "still", name: "Immobile", en: "Still", lv: 1, text: "Senza componenti gestuali" },
    { key: "subtle", name: "Sottile", en: "Subtle", lv: 2, text: "Difficile da individuare" },
    { key: "penetrating", name: "Penetrante", en: "Penetrating", lv: 2, text: "Ignora le resistenze" },
    { key: "persistent", name: "Persistente", en: "Persistent", lv: 4, text: "Continua senza concentrazione" },
  ];
  /* Metamagie di sfera (Magic.txt, "Sphere-specific metamagic"): livelli = proposta +2 */
  const SPHERE_META = {
    Ignis: { name: "Ustionante", text: "Le bruciature continuano a fare danno" },
    Aqua: { name: "Fluente", text: "L'incantesimo può muoversi e cambiare forma" },
    Terra: { name: "Duratura", text: "Durata lunghissima" },
    Ventus: { name: "Rapida", text: "Tempo di lancio ridotto" },
    Mens: { name: "In rete", text: "Colpisce più bersagli" },
    Anima: { name: "Vincolante", text: "Crea un legame spirituale duraturo" },
    Vis: { name: "Sovraccarica", text: "Potenza molto aumentata" },
    Vita: { name: "Adattiva", text: "Si evolve secondo le circostanze" },
    Spatium: { name: "Ancorata", text: "Non può essere spostata o dissolta" },
    Tempus: { name: "Sincronizzata", text: "Si attiva in un momento preciso" },
  };
  const SPHERE_META_LV = 2;

  /* Modificatori ambientali (Magic.txt, "Environmental magic modifier system") */
  const ZONES = [
    { key: "", name: "Nessuna zona particolare" },
    { key: "vulcano", name: "Vulcano / deserto", plus: "Ignis", minus: "Aqua" },
    { key: "oceano", name: "Oceano / lago", plus: "Aqua", minus: "Ignis" },
    { key: "montagna", name: "Montagna / caverna", plus: "Terra", minus: "Ventus" },
    { key: "alture", name: "Alture ventose", plus: "Ventus", minus: "Terra" },
    { key: "biblioteca", name: "Biblioteca / accademia", plus: "Mens" },
    { key: "cimitero", name: "Cimitero / campo di battaglia", plus: "Anima" },
    { key: "forgia", name: "Forgia / laboratorio", plus: "Vis" },
    { key: "foresta", name: "Giardino / foresta", plus: "Vita" },
    { key: "portale", name: "Portale / velo sottile", plus: "Spatium" },
    { key: "anomalia", name: "Anomalia temporale", plus: "Tempus" },
  ];
  const LEY = [
    { v: 0, name: "Nessuna linea di potere", surge: 0 },
    { v: 1, name: "Linea minore (+1)", surge: 0 },
    { v: 2, name: "Linea maggiore (+2)", surge: 10 },
    { v: 3, name: "Incrocio di linee (+3)", surge: 25 },
  ];

  /* Fasce di backlash (Magic.txt, "Backlash table"), senza dadi: restano scale di gravità */
  const BANDS = [
    { max: 8, name: "Minore", cls: "good", text: "Mal di testa o nausea, piccole fughe dell'elemento (scintille, brina). Dura 1–10 minuti." },
    { max: 15, name: "Moderato", cls: "warn", text: "L'incantesimo rimbalza sul mago o produce un effetto casuale; drenaggio temporaneo. Dura 1–24 ore." },
    { max: 20, name: "Maggiore", cls: "warn", text: "Ferita seria al mago, danni magici all'ambiente, piccola alterazione permanente. Dura 1–7 giorni." },
    { max: 25, name: "Grave", cls: "bad", text: "Ferita mortale, area vasta colpita, cicatrice magica permanente." },
    { max: Infinity, name: "Catastrofico", cls: "bad", text: "Morte, pietrificazione o follia; squarcio nella realtà, zona di pericolo magico." },
  ];
  function band(score) { return BANDS.find((b) => score <= b.max); }

  function zoneMod(sphereKeys, zoneKey) {
    const z = ZONES.find((x) => x.key === zoneKey);
    if (!z || !z.key) return { mod: 0, parts: [] };
    const parts = [];
    let sum = 0;
    for (const k of sphereKeys) {
      if (k === z.plus) { sum += 2; parts.push(`${k} +2`); }
      if (k === z.minus) { sum -= 2; parts.push(`${k} −2`); }
    }
    return { mod: clamp(sum, -2, 2), parts };
  }

  function spellLevels(w) {
    const keys = w.spheres.map((x) => x.s);
    const base = isInt(w.level) ? w.level : 0;
    const metaStd = METAMAGIC.filter((m) => w.meta.includes(m.key)).reduce((s, m) => s + m.lv, 0);
    const metaSph = keys.filter((k) => w.meta.includes("sph:" + k)).length * SPHERE_META_LV;
    const trav = w.spheres.filter((x) => x.trav).length;
    const cast = base + metaStd + metaSph + trav;
    const z = zoneMod(keys, w.env.zone);
    const ley = Number(w.env.ley) || 0;
    const eff = Math.max(1, base + ley + z.mod);
    return { base, metaStd, metaSph, meta: metaStd + metaSph, trav, cast, zone: z.mod, zoneParts: z.parts, ley, eff };
  }
  const spellCost = (cast, combo) => Math.round(10 * cast * (cast + 1) * (combo ? 1.5 : 1));
  const castTurns = (cast, combo) => Math.ceil(Math.max(1, Math.ceil(cast / 3)) * (combo ? 1.5 : 1));
  const spellCd = (cast) => Math.max(1, Math.ceil(cast / 2));

  /* Grado del PG in una sfera: skill di tipo Knowledge con il nome della sfera */
  function sphereSkill(char, key) {
    return ((char && char.skills) || []).find((s) => /knowledge/i.test(s.type || "") && String(s.name).toLowerCase() === key.toLowerCase()) || null;
  }
  function sphereGrade(char, key) { const s = sphereSkill(char, key); return s ? Number(s.lvl) || 0 : 0; }

  /* Requisiti per sfera: possederla (Grado I) o Grado VII per le combinazioni; consigliato ≥ livello di lancio */
  function sphereReqs(w, char) {
    const cast = spellLevels(w).cast;
    const need = w.combo ? 7 : 1;
    const rec = clamp(cast, 1, 10);
    return w.spheres.map((x) => {
      const has = sphereGrade(char, x.s);
      const status = has < need ? "missing" : has < rec ? "overcast" : "ok";
      return { s: x.s, need, rec, has, status };
    });
  }
  function overcastAuto(w, char) { return !!char && sphereReqs(w, char).some((r) => r.status !== "ok"); }

  function backlash(w, char) {
    const L = spellLevels(w);
    const factors = [{ label: `Livello di lancio ${L.cast} × 2`, v: L.cast * 2, prop: "gravita" }];
    const r = w.risk;
    if (r.fatigue) factors.push({ label: "Fatica (molti incantesimi oggi)", v: 1 });
    if (r.emotion) factors.push({ label: "Stato emotivo (stress, rabbia, paura)", v: 1 });
    if (r.interrupt) factors.push({ label: "Lancio interrotto", v: 3 });
    const over = r.overcast === "auto" ? overcastAuto(w, char) : r.overcast === "si";
    if (over) factors.push({ label: "Overcast (oltre le proprie capacità)", v: 2 });
    if (w.env.anti) factors.push({ label: "Zona antimagia", v: 2 });
    const prot = clamp(Number(r.protections) || 0, 0, 5);
    if (prot) factors.push({ label: `Protezioni prese (${prot})`, v: -prot });
    if (w.spheres.some((x) => SPHERES.find((s) => s.key === x.s)?.pure)) factors.push({ label: "Sfera pura (Spatium/Tempus)", v: 2, prop: "sferaPura" });
    const wp = worstPair(compatPairs(w.spheres.map((x) => x.s)));
    if (wp && wp.level === "D") factors.push({ label: `Coppia pericolosa ${wp.a} + ${wp.b}`, v: 2, prop: "coppie" });
    else if (wp && wp.level === "W") factors.push({ label: `Coppia debole ${wp.a} + ${wp.b}`, v: 1, prop: "coppie" });
    const score = Math.max(0, factors.reduce((s, f) => s + f.v, 0));
    return { score, band: band(score), factors, overcast: over };
  }

  function moltMag(char) {
    try { return S.rules.derived(char).moltMag; } catch (e) { return 1; }
  }
  /* Danno o cura stimati per un PG (null se la categoria non ha un numero) */
  function spellEffect(w, char) {
    if (!["attacco", "cura"].includes(w.category)) return null;
    const L = spellLevels(w);
    const n = clamp(w.spheres.length, 1, 3);
    const comp = [1, 0.85, 0.75][n - 1];
    const mm = char ? moltMag(char) : 1;
    let min = 15 * L.eff * comp * mm;
    let max = 30 * L.eff * comp * mm;
    const steps = [`base 15–30 × efficacia ${L.eff}`];
    if (comp !== 1) steps.push(`× ${String(comp).replace(".", ",")} (${n} sfere)`);
    steps.push(`× molt. magico ${(Math.round(mm * 100) / 100).toLocaleString("it-IT")}`);
    if (w.meta.includes("empower")) { min *= 1.5; max *= 1.5; steps.push("× 1,5 Potenziata"); }
    if (w.meta.includes("maximize")) { min = max; steps.push("Massimizzata: sempre il massimo"); }
    return { min: Math.round(min), max: Math.round(max), steps, kind: w.category === "cura" ? "Cura" : "Danno", mm };
  }

  /* =====================================================================
     REGOLE: MIRACOLI
     ===================================================================== */
  const GODS = [
    { key: "luxor", name: "Luxor", domain: "Luce", origin: true, epithet: "Il Padre Luminoso", sphere: "Ordine e giustizia; i suoi templi sono di cristallo puro",
      tone: "Solenne, inflessibile, giudica secondo la legge", affine: ["protezione", "castigo", "rivelazione", "benedizione"],
      vows: ["Non mentire sotto giuramento", "Non negare giustizia a chi la chiede", "Rispettare l'ordine legittimo"] },
    { key: "solaria", name: "Solaria", domain: "Luce", epithet: "La Madre Solare", sphere: "Protezione dei giusti e dei valorosi; a Qadesh è figlia di Luxor, meno pura del padre",
      tone: "Calda e marziale, premia il coraggio", affine: ["protezione", "guarigione", "benedizione"],
      vows: ["Non abbandonare un compagno in battaglia", "Proteggere chi non può difendersi", "Non colpire chi si arrende"] },
    { key: "verdania", name: "Verdania", domain: "Luce", epithet: "La Nutrice Verde", sphere: "Tutte le cose che crescono e fioriscono",
      tone: "Materna e paziente", affine: ["guarigione", "benedizione", "purificazione"],
      vows: ["Non distruggere ciò che cresce senza necessità", "Restituire alla terra ciò che si prende"] },
    { key: "ferrum", name: "Ferrum", domain: "Luce", epithet: "Il Fabbro Divino", sphere: "Forgiò le prime armi e insegnò l'arte agli umani",
      tone: "Pratico e burbero, rispetta il lavoro ben fatto", affine: ["benedizione", "protezione"],
      vows: ["Non rompere l'opera di un altro per invidia", "Onorare ogni dono con il lavoro"] },
    { key: "umbranis", name: "Umbranis", domain: "Ombra", origin: true, epithet: "L'Imperatrice del Vuoto (detta anche Umbris)", sphere: "Tessitrice del destino e del caos",
      tone: "Enigmatica e capricciosa", affine: ["rivelazione", "castigo", "intercessione"],
      vows: ["Non opporsi al destino rivelato", "Lasciare sempre una scelta al caso"] },
    { key: "morteus", name: "Morteus", domain: "Ombra", epithet: "Il Giudice Finale", sphere: "Pesa le anime e decide il loro destino ultraterreno",
      tone: "Impassibile e giudicante", affine: ["castigo", "rivelazione", "intercessione"],
      vows: ["Non profanare i morti", "Non sfuggire alla propria morte con l'inganno", "Rispettare il giudizio pronunciato"] },
    { key: "tempestus", name: "Tempestus", domain: "Ombra", epithet: "Il Distruttore", sphere: "Signore delle tempeste e della furia della natura",
      tone: "Furioso e impulsivo", affine: ["castigo", "benedizione"],
      vows: ["Non cercare riparo dalla tempesta", "Non trattenere la furia davanti a un affronto"] },
    { key: "venenum", name: "Venenum", domain: "Ombra", epithet: "Il Sussurratore", sphere: "Maestro dell'inganno e dei veleni sottili",
      tone: "Sussurrato e ambiguo", affine: ["castigo", "rivelazione", "purificazione"],
      vows: ["Non rivelare i segreti del culto", "Ripagare ogni debito, anche con l'inganno"] },
  ];
  const NATURES = [
    { key: "benedizione", name: "Benedizione", text: "Potenzia un alleato, un oggetto o un luogo" },
    { key: "guarigione", name: "Guarigione", text: "Ripristina Vita, chiude ferite, cura malattie", base: [40, 60] },
    { key: "protezione", name: "Protezione", text: "Scudi, santuari, difesa da influenze ostili" },
    { key: "castigo", name: "Castigo", text: "Danno o punizione inflitta in nome del dio", base: [15, 30] },
    { key: "rivelazione", name: "Rivelazione", text: "Visioni, verità nascoste, presagi" },
    { key: "purificazione", name: "Purificazione", text: "Scaccia maledizioni, veleni e corruzione" },
    { key: "intercessione", name: "Intercessione", text: "Chiede al dio di intervenire di persona" },
  ];
  const FAVOR = [
    { v: -3, name: "Maledizione divina", text: true },
    { v: -2, name: "Rinnegato" },
    { v: -1, name: "In disgrazia" },
    { v: 0, name: "Neutrale", text: true },
    { v: 1, name: "Notato" },
    { v: 2, name: "Favorito" },
    { v: 3, name: "Prescelto" },
    { v: 4, name: "Benedizione divina", text: true },
  ];
  const favorName = (v) => (FAVOR.find((f) => f.v === v) || FAVOR[3]).name;
  const AGAINST = [
    { key: "indebolito", name: "Il prodigio si indebolisce", text: "Effetto dimezzato; il Mana è speso per intero.", fromText: true },
    { key: "cessa", name: "Il prodigio non avviene", text: "Nessun effetto; il Mana è speso.", fromText: true },
    { key: "favore1", name: "Perdita di favore (−1 grado)", text: "Il prodigio riesce, ma il dio se ne ricorda." },
    { key: "favore2", name: "Perdita di favore (−2 gradi)", text: "Il prodigio fallisce e il chierico porta un segno del disfavore." },
    { key: "maledizione", name: "Maledizione divina", text: "Il favore crolla a Maledizione divina; il dio può mandare un castigo." },
  ];

  const miracleCost = (L) => Math.round(12.5 * L * (L + 1));
  const miracleFede = (L) => 5 * L * (L + 1);
  const miracleCd = (L) => Math.max(1, Math.ceil(L / 2));
  function isAffine(god, nature) { return !!god && god.affine.includes(nature); }
  function favorRequired(L, affine) {
    const base = L <= 2 ? 1 : L <= 5 ? 2 : L <= 8 ? 3 : 4;
    return Math.min(4, base + (affine ? 0 : 1));
  }
  function charFede(char) {
    const row = ((char && char.stats) || []).find((r) => /^(FED|FEDE)$/i.test(r.code) || /^fede$/i.test(r.name || ""));
    return row ? S.rules.statTotal(row) : 0;
  }
  function charFavor(char, god) {
    const rep = ((char && char.reputation) || []).find((r) => /cosmic/i.test(r.scope || "") && String(r.target).toLowerCase() === god.name.toLowerCase());
    if (!rep) return { v: 0, recorded: false };
    const byName = FAVOR.find((f) => f.name.toLowerCase() === String(rep.label || "").toLowerCase());
    return { v: byName ? byName.v : clamp(Math.round(Number(rep.value) || 0), -3, 4), recorded: true };
  }
  const isCleric = (char) => /chieric/i.test((char && char.classe) || "");
  function favorMult(have, need) {
    const d = have - need;
    if (d >= 0) return { mult: 1 + 0.25 * d, state: d > 0 ? "potenziato" : "pieno" };
    if (d === -1) return { mult: 0.5, state: "indebolito" };
    return { mult: 0, state: "cessa" };
  }
  function miracleValues(m) {
    const L = isInt(m.level) ? m.level : 0;
    const god = GODS.find((g) => g.key === m.god);
    const affine = isAffine(god, m.nature);
    const sugg = { fede: miracleFede(L), favor: favorRequired(L, affine), cost: miracleCost(L), cd: miracleCd(L) };
    const pick = (v, d) => (v === null || v === undefined ? d : v);
    return { L, god, affine, sugg, fede: pick(m.fede, sugg.fede), favor: pick(m.favor, sugg.favor), cost: pick(m.cost, sugg.cost), cd: pick(m.cd, sugg.cd) };
  }
  function miraclePower(m, char) {
    const V = miracleValues(m);
    const nat = NATURES.find((n) => n.key === m.nature);
    const fede = charFede(char);
    const fav = V.god ? charFavor(char, V.god) : { v: 0, recorded: false };
    const fm = favorMult(fav.v, Number(V.favor) || 0);
    if (!nat || !nat.base || !V.L) return { fede, fav, fm, value: null };
    const k = V.L * (1 + fede / 100) * fm.mult;
    return { fede, fav, fm, value: { min: Math.round(nat.base[0] * k), max: Math.round(nat.base[1] * k), kind: nat.key === "guarigione" ? "Cura" : "Danno", base: nat.base } };
  }

  S.wzMagia = {
    PROPOSTE, SPHERES, COMPAT_RAW, METAMAGIC, ZONES, LEY, BANDS, GODS, NATURES, FAVOR,
    pairCompat, compatPairs, zoneMod, spellLevels, spellCost, castTurns, spellCd, sphereGrade, sphereReqs, backlash, band, spellEffect,
    miracleCost, miracleFede, miracleCd, favorRequired, favorMult, charFede, charFavor, miracleValues, miraclePower, isCleric,
  };

  /* =====================================================================
     UI CONDIVISA
     ===================================================================== */
  const STYLE = `
.wm-main { gap: 16px; }
.wm-fs { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.wm-fs > legend { padding: 0; margin-bottom: 8px; }
.wm-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.wm-opt { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--line-strong); background: var(--panel-2); color: var(--muted);
  font-family: var(--font-display); font-weight: 600; font-size: var(--fs-sm); max-width: 100%; }
.wm-opt:hover:not(:disabled) { color: var(--fg); border-color: var(--violet); }
.wm-opt[aria-pressed="true"] { color: var(--fg); border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
.wm-opt:disabled { opacity: 0.45; cursor: not-allowed; }
.wm-lv { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--violet); }
.wm-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); gap: 8px; }
.wm-cards .pick { padding: 10px 12px; gap: 4px; }
.wm-spheres { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 96px), 1fr)); gap: 6px; }
.wm-sph { display: flex; flex-direction: column; align-items: flex-start; padding: 7px 10px; text-align: left; cursor: pointer; min-width: 0;
  background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); font-family: var(--font-display); }
.wm-sph:hover:not(:disabled) { border-color: var(--line-strong); }
.wm-sph[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.wm-sph:disabled { opacity: 0.4; cursor: not-allowed; }
.wm-sel { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.wm-selrow { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px; background: var(--panel-2);
  display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.wm-selh { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.wm-selh .wm-tools { margin-left: auto; display: flex; gap: 4px; }
.wm-check { display: flex; gap: 8px; align-items: flex-start; font-size: var(--fs-sm); cursor: pointer; min-width: 0; }
.wm-check input { margin-top: 3px; accent-color: var(--gold); flex: none; }
.wm-check.is-off { opacity: 0.55; cursor: not-allowed; }
.wm-num { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.wm-num .input { width: 9ch; text-align: center; font-family: var(--font-mono); }
.wm-calc { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--muted); overflow-wrap: anywhere; }
.wm-calc b { color: var(--fg); font-weight: 600; }
.wm-big { font-family: var(--font-mono); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.wm-box { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.wm-pairs { display: flex; flex-wrap: wrap; gap: 6px; }
.wm-pairs .chip { white-space: normal; }
.wm-prop { cursor: help; }
.wm-src { font-size: var(--fs-xs); color: var(--muted); cursor: help; text-decoration: underline dotted; text-underline-offset: 2px; }
.wm-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-sm); }
.wm-reqs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); }
.wm-reqs li { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; border-bottom: 1px dashed var(--line); padding: 4px 0; }
.wm-reqs li:last-child { border-bottom: 0; }
.wm-ok { color: var(--good); } .wm-warn { color: var(--warn); } .wm-bad { color: var(--bad); }
.wm-sys span { overflow-wrap: anywhere; }
.wm-sys .wm-sk { color: var(--muted); }
.wm-next { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; margin-left: auto; min-width: 0; }
.wm-next .hint { text-align: right; }
/* Anteprima: righe compatte, dettagli nel tooltip */
.wm-prev .win-b { gap: 0; padding: 10px 14px; }
.wm-row { position: relative; display: flex; justify-content: space-between; align-items: baseline; gap: 10px;
  padding: 5px 0; border-bottom: 1px dashed var(--line); font-size: var(--fs-sm); min-width: 0; }
.wm-row:last-of-type { border-bottom: 0; }
.wm-row[tabindex] { cursor: help; }
.wm-row:focus-visible { outline-offset: 0; }
.wm-k { color: var(--muted); display: inline-flex; align-items: center; gap: 5px; flex: none; max-width: 48%; }
.wm-v { text-align: right; min-width: 0; overflow-wrap: anywhere; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.wm-v.is-text { font-family: var(--font-body); }
.wm-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); display: inline-block; flex: none; }
.wm-tip { display: none; position: absolute; z-index: 15; left: 0; right: 0; top: calc(100% + 4px); flex-direction: column; gap: 3px;
  padding: 8px 10px; background: var(--panel); border: 1px solid var(--violet); border-radius: var(--radius);
  box-shadow: 0 8px 24px var(--violet-soft); font-size: var(--fs-xs); text-align: left; overflow-wrap: anywhere; pointer-events: none; }
.wm-row:nth-last-of-type(-n+4) .wm-tip { top: auto; bottom: calc(100% + 4px); }
.wm-row:hover .wm-tip, .wm-row:focus-visible .wm-tip { display: flex; }
.wm-legend { margin-top: 8px; display: flex; align-items: center; gap: 6px; }
@media (max-width: 560px) {
  .wm-next { justify-content: flex-start; margin-left: 0; }
  .wm-next .hint { text-align: left; }
}
`;
  function injectStyle() {
    if (document.getElementById("wm-style")) return;
    const st = document.createElement("style");
    st.id = "wm-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  let tipSeq = 0;
  /* Riga dell'anteprima: etichetta → valore; tip = righe del tooltip; propKey = c'è una proposta */
  function row(label, value, tip, opts = {}) {
    const lines = (tip || []).filter(Boolean);
    const id = `wm-tip-${++tipSeq}`;
    const dot = opts.prop ? `<span class="wm-dot" aria-hidden="true"></span>` : "";
    const val = `<span class="wm-v ${opts.text ? "is-text" : ""} ${opts.cls || ""}">${opts.html ? value : esc(value)}</span>`;
    if (!lines.length && !opts.prop) return `<div class="wm-row"><span class="wm-k">${esc(label)}</span>${val}</div>`;
    const propLine = opts.prop ? `<span class="wm-warn">Proposta: ${esc(PROPOSTE[opts.prop])}</span>` : "";
    return `<div class="wm-row" tabindex="0" aria-describedby="${id}"><span class="wm-k">${esc(label)}${dot}</span>${val}
      <div class="wm-tip" role="tooltip" id="${id}">${lines.map((l) => `<span>${esc(l)}</span>`).join("")}${propLine}</div></div>`;
  }
  const legend = () => `<p class="wm-legend xs muted"><span class="wm-dot" aria-hidden="true"></span>contiene una proposta da approvare · passa sopra a una riga per i calcoli</p>`;

  function setPath(obj, path, value) {
    const parts = path.split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[/^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]];
    o[parts[parts.length - 1]] = value;
  }
  function charById(ctx, id) {
    const list = (ctx.state && ctx.state.data && ctx.state.data.characters) || [];
    return list.find((c) => c.id === id) || ctx.state.char || list[0] || null;
  }
  function charOptions(ctx, selected) {
    const list = (ctx.state && ctx.state.data && ctx.state.data.characters) || [];
    return list.map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)} · ${esc(c.classe || "—")} · Lv ${esc(c.level)}</option>`).join("");
  }
  function charMpMax(char) { try { return S.rules.derived(char).mp; } catch (e) { return 0; } }
  /* Valore effettivo di un campo con proposta: null = usa la proposta */
  const pick = (v, d) => (v === null || v === undefined ? d : v);
  const badNum = (v, min) => v === "" || typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < min;

  /* Motore minimo del wizard: step, anteprima, piede, eventi con delegation, focus preservato */
  function mountWizard(root, ctx, def) {
    injectStyle();
    const w = def.init(ctx);
    w.step = 0;

    const check = (i) => def.steps[i].check(w, ctx);
    function reachable() {
      for (let i = 0; i < def.steps.length; i++) if (check(i)) return i;
      return def.steps.length - 1;
    }
    const stepsHtml = () => S.wz.steps(def.steps.map((s) => s.label), w.step, Math.max(w.step, reachable()));
    function footHtml() {
      const reason = check(w.step);
      const last = w.step === def.steps.length - 1;
      const rid = `${def.prefix}-why`;
      return `<div class="wz-foot">
        <div class="row">
          <button type="button" class="btn" data-act="back" id="${def.prefix}-back" ${w.step === 0 ? "disabled" : ""}>← Indietro</button>
          <button type="button" class="btn ghost" data-act="cancel" id="${def.prefix}-cancel">Annulla</button>
        </div>
        <div class="wm-next">
          ${reason ? `<span class="hint bad" id="${rid}" role="status">${esc(reason)}</span>` : ""}
          <button type="button" class="btn primary" data-act="${last ? "save" : "next"}" id="${def.prefix}-${last ? "save" : "next"}"
            ${reason ? `disabled aria-describedby="${rid}" title="${esc(reason)}"` : ""}>${esc(last ? def.saveLabel(w, ctx) : "Avanti →")}</button>
        </div>
      </div>`;
    }
    function previewHtml() {
      return S.ui.win("Anteprima", def.preview(w, ctx) + legend(), { cls: "wm-prev" });
    }
    function liveFill(scope) {
      scope.querySelectorAll("[data-live]").forEach((el) => {
        const fn = def.live && def.live[el.dataset.live];
        if (fn) el.innerHTML = fn(w, ctx);
      });
    }
    function draw() {
      const a = document.activeElement;
      let f = null;
      if (a && root.contains(a) && a.id) {
        f = { id: a.id, scroll: a.scrollTop };
        try { f.s = a.selectionStart; f.e = a.selectionEnd; } catch (e) { /* senza selezione */ }
      }
      root.innerHTML = S.ui.win(def.title, `
        <div data-region="steps">${stepsHtml()}</div>
        <div class="wz-body">
          <div class="stack wm-main" data-region="main">${def.steps[w.step].html(w, ctx)}</div>
          <aside class="wz-preview" data-region="preview" aria-label="Anteprima" aria-live="polite">${previewHtml()}</aside>
        </div>
        <div data-region="foot">${footHtml()}</div>`, { gold: true });
      liveFill(root);
      if (f) {
        const el = document.getElementById(f.id);
        if (el && !el.disabled) {
          el.focus({ preventScroll: true });
          try { if (f.s != null) el.setSelectionRange(f.s, f.e); } catch (e) { /* input senza selezione */ }
          if (f.scroll) el.scrollTop = f.scroll;
        }
      }
    }
    /* Aggiornamento parziale mentre l'utente scrive: il campo attivo non viene ricreato */
    function refresh() {
      root.querySelector('[data-region="steps"]').innerHTML = stepsHtml();
      root.querySelector('[data-region="preview"]').innerHTML = previewHtml();
      root.querySelector('[data-region="foot"]').innerHTML = footHtml();
      liveFill(root.querySelector('[data-region="main"]'));
    }
    function goStep(i) {
      w.step = i;
      draw();
      const top = root.getBoundingClientRect().top;
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 80 });
      const cur = root.querySelector(".wz-step.is-current");
      if (cur) cur.focus({ preventScroll: true });
    }
    function readField(f) {
      if (f.type === "checkbox") return f.checked;
      if (f.dataset.t === "num") return f.value.trim() === "" ? "" : Number(f.value);
      return f.value;
    }

    root.addEventListener("click", (e) => {
      const st = e.target.closest("[data-wz-step]");
      if (st && root.contains(st)) {
        if (st.disabled) return;
        const i = Number(st.dataset.wzStep);
        if (i !== w.step && i <= Math.max(w.step, reachable())) goStep(i);
        return;
      }
      const b = e.target.closest("[data-act]");
      if (!b || !root.contains(b) || b.disabled) return;
      const act = b.dataset.act;
      if (act === "back") { if (w.step > 0) goStep(w.step - 1); return; }
      if (act === "next") { if (!check(w.step)) goStep(w.step + 1); return; }
      if (act === "cancel") { ctx.close(); return; }
      if (act === "save") { if (!check(w.step)) def.save(w, ctx); return; }
      if (act === "set") { setPath(w, b.dataset.k, b.dataset.v); draw(); return; }
      if (act === "toggle") {
        const arr = w[b.dataset.k];
        const v = b.dataset.v;
        const i = arr.indexOf(v);
        if (i >= 0) arr.splice(i, 1); else arr.push(v);
        draw();
        return;
      }
      if (act === "reset") { setPath(w, b.dataset.k, null); draw(); return; }
      if (def.act) { def.act(act, b, w, ctx); draw(); }
    });
    root.addEventListener("input", (e) => {
      const f = e.target.closest("[data-f]");
      if (!f || f.type === "checkbox" || f.type === "radio" || f.tagName === "SELECT") return;
      setPath(w, f.dataset.f, readField(f));
      refresh();
    });
    root.addEventListener("change", (e) => {
      const t = e.target.closest("[data-arr]");
      if (t && root.contains(t)) {
        const arr = w[t.dataset.arr];
        const i = arr.indexOf(t.value);
        if (t.checked && i < 0) arr.push(t.value);
        if (!t.checked && i >= 0) arr.splice(i, 1);
        draw();
        return;
      }
      const f = e.target.closest("[data-f]");
      if (!f || !(f.type === "checkbox" || f.type === "radio" || f.tagName === "SELECT")) return;
      let v = readField(f);
      if (f.dataset.t === "num" && v !== "") v = Number(v);
      setPath(w, f.dataset.f, v);
      if (def.onChange) def.onChange(f.dataset.f, w, ctx);
      draw();
    });
    draw();
  }

  /* Campo numerico con valore proposto, pulsante "ripristina" e chip proposta */
  function numField({ id, path, label, value, sugg, min = 0, max, unit, propKey, overridden, help }) {
    return `<div class="field">
      <label class="label" for="${id}">${esc(label)}</label>
      <div class="wm-num">
        <input class="input" id="${id}" type="number" inputmode="numeric" data-f="${esc(path)}" data-t="num" min="${min}" ${max != null ? `max="${max}"` : ""} step="1" value="${esc(value)}">
        ${unit ? `<span class="small muted">${esc(unit)}</span>` : ""}
        ${propKey ? prop(propKey) : ""}
        ${overridden ? `<button type="button" class="btn ghost" data-act="reset" data-k="${esc(path)}" id="${id}-reset">Ripristina ${esc(fmtN(sugg))}</button>` : ""}
      </div>
      <span class="hint" data-live="${esc(id)}-hint">${help || ""}</span>
    </div>`;
  }

  /* =====================================================================
     WIZARD: INCANTESIMO
     ===================================================================== */
  function spellVals(w) {
    const L = spellLevels(w);
    const sugg = { cost: spellCost(L.cast, w.combo), cd: spellCd(L.cast) };
    return { L, sugg, cost: pick(w.cost, sugg.cost), cd: pick(w.cd, sugg.cd), turns: castTurns(L.cast, w.combo) };
  }
  function spellAssignState(w, ctx) {
    const char = charById(ctx, w.charId);
    const origin = ORIGINS.find((o) => o.key === w.origin);
    const reqs = sphereReqs(w, char);
    const missing = reqs.filter((r) => r.status === "missing");
    return { char, origin, reqs, missing, canSkill: !!(origin && origin.skill) };
  }

  const SPELL_STEPS = [
    {
      label: "Concetto",
      check(w) {
        const n = w.name.trim();
        if (n.length < 2) return "Dai un nome all'incantesimo (almeno 2 caratteri).";
        if (n.length > 40) return "Nome troppo lungo: massimo 40 caratteri.";
        if (w.effect.trim().length < 5) return "Descrivi l'effetto dichiarato dal giocatore.";
        return null;
      },
      html(w) {
        return `
        <div class="field">
          <label class="label" for="wm-s-name">Nome dell'incantesimo</label>
          <input class="input" id="wm-s-name" type="text" data-f="name" maxlength="40" autocomplete="off" value="${esc(w.name)}" placeholder="Es. Palla di Fuoco">
          <span class="hint" data-live="nameHint"></span>
        </div>
        <div class="field">
          <label class="label" for="wm-s-effect">Effetto dichiarato dal giocatore</label>
          <textarea class="input" id="wm-s-effect" rows="4" data-f="effect" maxlength="600" placeholder="Es. Una sfera di fuoco che esplode al contatto e incendia l'area.">${esc(w.effect)}</textarea>
          <span class="hint">È il giocatore a descrivere l'effetto; il narratore ne valuta costo, livello e rischi in base alle sfere. ${src(SRC.crea + ", Come nasce un incantesimo")}</span>
        </div>
        <fieldset class="wm-fs"><legend class="label">Categoria</legend>
          <div class="wm-opts">${CATEGORIES.map((c) => `<button type="button" class="wm-opt" id="wm-s-cat-${c.key}" data-act="set" data-k="category" data-v="${c.key}" aria-pressed="${w.category === c.key}">${esc(c.name)}</button>`).join("")}</div>
        </fieldset>
        <fieldset class="wm-fs"><legend class="label">Origine</legend>
          <div class="wm-cards">${ORIGINS.map((o) => `<button type="button" class="pick" id="wm-s-or-${o.key}" data-act="set" data-k="origin" data-v="${o.key}" aria-pressed="${w.origin === o.key}">
            <b>${esc(o.name)}</b><span class="xs muted">${esc(o.text)}</span></button>`).join("")}</div>
          <span class="hint">${src(SRC.crea + ", Improvvisazione e incantesimi consolidati; Grimorio Basilare")}</span>
        </fieldset>`;
      },
    },
    {
      label: "Sfere",
      check(w) {
        if (!w.spheres.length) return "Scegli almeno una sfera.";
        const empty = w.spheres.find((x) => !x.role.trim());
        if (empty) return `Indica il ruolo di ${empty.s} (es. forma, innesco).`;
        return null;
      },
      html(w, ctx) {
        const full = w.spheres.length >= 3;
        const sel = (k) => w.spheres.some((x) => x.s === k);
        const char = charById(ctx, w.charId);
        return `
        <p class="small muted">Scegli da 1 a 3 sfere: la prima è la principale. Il «come» decide il carattere dell'incantesimo: più sfere danno più controllo, non per forza più potenza. ${src(SRC.crea + ", Stesso effetto, sfere diverse")}</p>
        <div class="wm-spheres" role="group" aria-label="Sfere arcane">${SPHERES.map((s) => `
          <button type="button" class="wm-sph" id="wm-s-sph-${s.key}" data-act="sphere" data-v="${s.key}" aria-pressed="${sel(s.key)}"
            ${!sel(s.key) && full ? "disabled" : ""} title="${esc(s.field)}"><b>${esc(s.key)}</b><span class="xs muted">${esc(s.it)}${s.pure ? " · pura" : ""}</span></button>`).join("")}</div>
        ${w.spheres.length ? `<ol class="wm-sel">${w.spheres.map((x, i) => {
          const sp = SPHERES.find((s) => s.key === x.s);
          return `<li class="wm-selrow">
            <div class="wm-selh"><b>${i + 1}. ${esc(x.s)}</b>${i === 0 ? '<span class="chip gold">principale</span>' : ""}
              <span data-live="req${i}"></span>
              <span class="wm-tools">
                <button type="button" class="btn icon" data-act="up" data-i="${i}" id="wm-s-up-${i}" aria-label="Sposta ${esc(x.s)} in su" ${i === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn icon" data-act="rm" data-i="${i}" id="wm-s-rm-${i}" aria-label="Togli ${esc(x.s)}">×</button>
              </span></div>
            <div class="wz-grid2">
              <div class="field">
                <label class="label" for="wm-s-role-${i}">Ruolo di ${esc(x.s)}</label>
                <input class="input" id="wm-s-role-${i}" type="text" list="wm-roles" data-f="spheres.${i}.role" maxlength="40" autocomplete="off" value="${esc(x.role)}" placeholder="forma, innesco…">
              </div>
              <label class="wm-check" for="wm-s-trav-${i}"><input type="checkbox" id="wm-s-trav-${i}" data-f="spheres.${i}.trav" ${x.trav ? "checked" : ""}>
                <span>Uso traverso <span class="wm-lv">+1 lv</span> ${prop("traverso")}<br><span class="xs muted">Effetto fuori dal campo naturale: ${esc(sp.field.toLowerCase())}.</span></span></label>
            </div>
          </li>`;
        }).join("")}</ol>` : ""}
        <datalist id="wm-roles">${ROLES.map((r) => `<option value="${esc(r)}"></option>`).join("")}</datalist>
        <div class="wm-box"><span class="label">Compatibilità ${src(SRC.magic + ", Compatibility matrix")}</span><div data-live="compat"></div></div>
        <label class="wm-check" for="wm-s-combo"><input type="checkbox" id="wm-s-combo" data-f="combo" ${w.combo ? "checked" : ""}>
          <span>Combinazione di incantesimi già consolidati (fusione, layering…)<br>
          <span class="xs muted">Richiede Grado VII in ogni sfera, Mana ×1,5 della somma, tempo di lancio +50%. ${src(SRC.magic + ", Regole base combinazione (70% ≈ Grado VII)")}</span></span></label>
        <p class="xs muted">Requisiti verificati su ${esc(char ? char.name : "—")} (si cambia all'ultimo step). Ogni sfera va posseduta: almeno Grado I. ${src(SRC.crea + ", Le sfere servono")}</p>`;
      },
    },
    {
      label: "Potenza",
      check(w) {
        if (!isInt(w.level) || w.level < 1 || w.level > 10) return "Il livello base va da 1 a 10.";
        const L = spellLevels(w);
        if (L.cast > 10) return `Livello di lancio ${L.cast}: oltre 10. Togli metamagia o abbassa il livello.`;
        return null;
      },
      html(w) {
        const keys = w.spheres.map((x) => x.s);
        return `
        <div class="field">
          <label class="label" for="wm-s-level">Livello base (1–10)</label>
          <div class="wm-num">
            <button type="button" class="btn icon" data-act="lvl" data-d="-1" id="wm-s-lvl-dn" aria-label="Livello −1" ${w.level <= 1 ? "disabled" : ""}>−</button>
            <input class="input" id="wm-s-level" type="number" inputmode="numeric" data-f="level" data-t="num" min="1" max="10" step="1" value="${esc(w.level)}">
            <button type="button" class="btn icon" data-act="lvl" data-d="1" id="wm-s-lvl-up" aria-label="Livello +1" ${w.level >= 10 ? "disabled" : ""}>+</button>
            <span class="xs muted">${src(SRC.magic + ", Come leggere: livelli 1–10")}</span>
          </div>
        </div>
        <fieldset class="wm-fs"><legend class="label">Metamagia ${src(SRC.magic + ", Metamagic enhancement")}</legend>
          <div class="wm-opts">${METAMAGIC.map((m) => `<button type="button" class="wm-opt" id="wm-s-mm-${m.key}" data-act="toggle" data-k="meta" data-v="${m.key}"
            aria-pressed="${w.meta.includes(m.key)}" title="${esc(m.en + ": " + m.text)}">${esc(m.name)}<span class="wm-lv">+${m.lv}</span></button>`).join("")}</div>
          ${keys.length ? `<span class="xs muted">Di sfera ${prop("metaSfera")}</span>
          <div class="wm-opts">${keys.map((k) => `<button type="button" class="wm-opt" id="wm-s-mms-${k}" data-act="toggle" data-k="meta" data-v="sph:${k}"
            aria-pressed="${w.meta.includes("sph:" + k)}" title="${esc(k + ": " + SPHERE_META[k].text)}">${esc(SPHERE_META[k].name)} <span class="xs muted">${esc(k)}</span><span class="wm-lv">+${SPHERE_META_LV}</span></button>`).join("")}</div>` : ""}
        </fieldset>
        <fieldset class="wm-fs"><legend class="label">Ambiente (facoltativo) ${src(SRC.magic + ", Environmental magic modifier system")}</legend>
          <div class="wz-grid2">
            <div class="field"><label class="label" for="wm-s-zone">Sintonia della zona</label>
              <select class="input" id="wm-s-zone" data-f="env.zone">${ZONES.map((z) => `<option value="${z.key}" ${w.env.zone === z.key ? "selected" : ""}>${esc(z.name)}${z.plus ? ` · ${z.plus} +2${z.minus ? `, ${z.minus} −2` : ""}` : ""}</option>`).join("")}</select></div>
            <div class="field"><label class="label" for="wm-s-ley">Linea di potere</label>
              <select class="input" id="wm-s-ley" data-f="env.ley" data-t="num">${LEY.map((l) => `<option value="${l.v}" ${Number(w.env.ley) === l.v ? "selected" : ""}>${esc(l.name)}${l.surge ? ` · ${l.surge}% sbalzo selvaggio` : ""}</option>`).join("")}</select></div>
          </div>
          <label class="wm-check" for="wm-s-anti"><input type="checkbox" id="wm-s-anti" data-f="env.anti" ${w.env.anti ? "checked" : ""}>
            <span>Zona antimagia <span class="xs muted">(+2 al backlash; un campo antimagia vero sopprime l'incantesimo)</span></span></label>
        </fieldset>
        <div class="wm-box" data-live="levels"></div>`;
      },
    },
    {
      label: "Costo e rischi",
      check(w) {
        const V = spellVals(w);
        if (badNum(V.cost, 1)) return "Il costo Mana deve essere un intero ≥ 1.";
        if (badNum(V.cd, 0)) return "La ricarica deve essere un intero ≥ 0.";
        if (badNum(Number(w.risk.protections), 0) || w.risk.protections > 5) return "Protezioni: da 0 a 5.";
        return null;
      },
      html(w, ctx) {
        const V = spellVals(w);
        const char = charById(ctx, w.charId);
        return `
        <div class="wz-grid2">
          ${numField({ id: "wm-s-cost", path: "cost", label: "Costo Mana", value: V.cost, sugg: V.sugg.cost, min: 1, unit: "MP", propKey: "costo", overridden: w.cost !== null })}
          ${numField({ id: "wm-s-cd", path: "cd", label: "Ricarica", value: V.cd, sugg: V.sugg.cd, min: 0, unit: "turni", propKey: "ricarica", overridden: w.cd !== null })}
        </div>
        <p class="xs muted">Il costo lo decide il narratore e si può contrattare: il valore proposto è un punto di partenza. ${src(SRC.crea + ", Come nasce un incantesimo")}</p>
        <div class="wm-box"><span class="label">Tempo di lancio ${prop("tempo")}</span><div data-live="turns"></div></div>
        <fieldset class="wm-fs"><legend class="label">Fattori di backlash ${src(SRC.magic + ", Fattori che influenzano il backlash")}</legend>
          <label class="wm-check" for="wm-s-fat"><input type="checkbox" id="wm-s-fat" data-f="risk.fatigue" ${w.risk.fatigue ? "checked" : ""}><span>Fatica: molti incantesimi oggi <span class="wm-lv">+1</span></span></label>
          <label class="wm-check" for="wm-s-emo"><input type="checkbox" id="wm-s-emo" data-f="risk.emotion" ${w.risk.emotion ? "checked" : ""}><span>Stato emotivo: stress, rabbia, paura <span class="wm-lv">+1</span></span></label>
          <label class="wm-check" for="wm-s-int"><input type="checkbox" id="wm-s-int" data-f="risk.interrupt" ${w.risk.interrupt ? "checked" : ""}><span>Valuta con lancio interrotto <span class="wm-lv">+3</span></span></label>
          <div class="wz-grid2">
            <div class="field"><label class="label" for="wm-s-over">Overcast <span class="wm-lv">+2</span></label>
              <select class="input" id="wm-s-over" data-f="risk.overcast">
                <option value="auto" ${w.risk.overcast === "auto" ? "selected" : ""}>Automatico da ${esc(char ? char.name : "PG")} (${overcastAuto(w, char) ? "sì" : "no"})</option>
                <option value="si" ${w.risk.overcast === "si" ? "selected" : ""}>Sì</option>
                <option value="no" ${w.risk.overcast === "no" ? "selected" : ""}>No</option>
              </select>
              <span class="hint">Automatico: Grado in una sfera sotto il livello di lancio ${prop("gradoConsigliato")}</span></div>
            <div class="field"><label class="label" for="wm-s-prot">Protezioni prese <span class="wm-lv">−1 ciascuna</span></label>
              <input class="input" id="wm-s-prot" type="number" inputmode="numeric" data-f="risk.protections" data-t="num" min="0" max="5" step="1" value="${esc(w.risk.protections)}"></div>
          </div>
        </fieldset>
        <div class="wm-box" data-live="backlash"></div>
        <div class="wm-box" data-live="effect"></div>`;
      },
    },
    {
      label: "Anteprima",
      check(w, ctx) {
        if (!w.assign) return null;
        const A = spellAssignState(w, ctx);
        if (!A.char) return "Nessun PG da assegnare.";
        if (!A.canSkill) return null; // improvvisato: si salva solo nella libreria
        if (A.missing.length && !w.force) return `${A.char.name} non possiede ${A.missing.map((r) => `${r.s} Grado ${roman(r.need)}`).join(", ")}: forza o togli l'assegnazione.`;
        return null;
      },
      html(w, ctx) {
        const A = spellAssignState(w, ctx);
        return `
        <div data-live="card"></div>
        <div class="field">
          <label class="label" for="wm-s-char">PG</label>
          <select class="input" id="wm-s-char" data-f="charId">${charOptions(ctx, A.char && A.char.id)}</select>
        </div>
        <div class="wm-box"><span class="label">Requisiti su ${esc(A.char ? A.char.name : "—")}</span><div data-live="reqs"></div></div>
        <label class="wm-check ${A.canSkill ? "" : "is-off"}" for="wm-s-assign"><input type="checkbox" id="wm-s-assign" data-f="assign" ${w.assign && A.canSkill ? "checked" : ""} ${A.canSkill ? "" : "disabled"}>
          <span>Aggiungi al grimorio di ${esc(A.char ? A.char.name : "—")}<br><span class="xs muted">${A.canSkill ? `Diventa una skill attiva di Grado I all'1%. ${prop("grimorio")}` : "Un incantesimo improvvisato non diventa una skill."}</span></span></label>
        ${w.assign && A.canSkill && A.missing.length ? `<label class="wm-check" for="wm-s-force"><input type="checkbox" id="wm-s-force" data-f="force" ${w.force ? "checked" : ""}>
          <span>Forza l'assegnazione (decisione del Master)<br><span class="xs muted">Le sfere mancanti restano da imparare: il PG non può ancora lanciarlo.</span></span></label>` : ""}`;
      },
    },
  ];

  const SPELL_LIVE = {
    nameHint(w, ctx) {
      const n = w.name.trim().toLowerCase();
      const lib = (S.data.library && S.data.library.spells) || [];
      if (n && lib.some((e) => String(e.name).toLowerCase() === n)) return `<span class="wm-warn">Esiste già un incantesimo con questo nome nella libreria.</span>`;
      return "Da 2 a 40 caratteri.";
    },
    compat(w) {
      const keys = w.spheres.map((x) => x.s);
      if (keys.length < 2) {
        const note = keys.length ? COMPAT_RAW[keys[0]].note : "";
        return `<span class="small muted">${keys.length ? "Una sola sfera: nessuna coppia da valutare." : "Nessuna sfera scelta."}${note ? ` ${esc(keys[0])}: ${esc(note)}.` : ""}</span>`;
      }
      const pairs = compatPairs(keys);
      const chips = pairs.map((p) => `<span class="chip ${COMPAT_LEVELS[p.level].cls}" tabindex="0" title="${esc(p.views.join(" · ") + (p.disagree ? " → vale la più severa (proposta)" : ""))}">${esc(p.a)} + ${esc(p.b)}: ${esc(COMPAT_LEVELS[p.level].name)}</span>`).join("");
      const notes = keys.map((k) => COMPAT_RAW[k].note && `${k}: ${COMPAT_RAW[k].note}`).filter(Boolean);
      const danger = pairs.filter((p) => p.level === "D");
      const disagree = pairs.some((p) => p.disagree);
      return `<div class="wm-pairs">${chips}${disagree ? prop("severa") : ""}</div>
        ${danger.length ? `<div class="sysmsg" role="alert" style="border-color:var(--bad);background:transparent"><span class="tag" style="color:var(--bad)">[AVVISO]</span>
          <span>Coppia pericolosa: ${danger.map((p) => `${esc(p.a)} + ${esc(p.b)}`).join(", ")}. Il narratore può chiedere una prova di controllo; il backlash sale.</span></div>` : ""}
        ${notes.length ? `<span class="xs muted">${notes.map(esc).join(" · ")}</span>` : ""}`;
    },
    levels(w) {
      const L = spellLevels(w);
      const ley = LEY.find((l) => l.v === L.ley);
      return `<div class="row" style="justify-content:space-between"><span class="label">Livello di lancio</span><span class="wm-big ${L.cast > 10 ? "wm-bad" : ""}">${L.cast || "—"}</span></div>
        <span class="wm-calc">= base <b>${L.base}</b> + metamagia <b>${L.meta}</b>${L.trav ? ` + traverso <b>${L.trav}</b>` : ""}${L.cast > 10 ? " · massimo 10" : ""}</span>
        <div class="row" style="justify-content:space-between"><span class="label">Livello di efficacia ${prop("efficacia")}</span><span class="wm-big">${L.eff}</span></div>
        <span class="wm-calc">= base <b>${L.base}</b> + linea <b>${L.ley}</b> + sintonia <b>${L.zone >= 0 ? "+" : "−"}${Math.abs(L.zone)}</b>${L.zoneParts.length ? ` (${esc(L.zoneParts.join(", "))}${L.zoneParts.length > 1 ? " " : ""})` : ""}</span>
        ${L.zoneParts.length > 1 ? prop("sintonia") : ""}
        ${ley && ley.surge ? `<span class="small wm-warn">Sbalzo selvaggio: +${ley.surge}% di probabilità ${src(SRC.magic + ", Ley line proximity")}</span>` : ""}`;
    },
    "wm-s-cost-hint"(w, ctx) {
      const V = spellVals(w);
      const char = charById(ctx, w.charId);
      const mp = charMpMax(char);
      const parts = [`Proposta: ${fmtN(V.sugg.cost)} MP (10 × ${V.L.cast} × ${V.L.cast + 1}${w.combo ? " × 1,5 combinazione" : ""}).`];
      if (char && mp && !badNum(V.cost, 1)) parts.push(`${Math.round((V.cost / mp) * 100)}% del Mana massimo di ${char.name} (${fmtN(mp)}).`);
      return esc(parts.join(" "));
    },
    "wm-s-cd-hint"(w) {
      const V = spellVals(w);
      return esc(`Proposta: ${V.sugg.cd} turni (⌈${V.L.cast} / 2⌉).`);
    },
    turns(w) {
      const V = spellVals(w);
      const base = Math.max(1, Math.ceil(V.L.cast / 3));
      return `<span class="wm-big">${V.turns} ${V.turns === 1 ? "turno" : "turni"}</span>
        <span class="wm-calc">⌈${V.L.cast} / 3⌉ = ${base}${w.combo ? ` × 1,5 combinazione → ${V.turns}` : ""}</span>`;
    },
    backlash(w, ctx) {
      const B = backlash(w, charById(ctx, w.charId));
      return `<div class="row" style="justify-content:space-between"><span class="label">Fascia di backlash ${prop("gravita")}</span>
          <span class="chip ${B.band.cls}">${esc(B.band.name)} · ${B.score}</span></div>
        <ul class="wm-list">${B.factors.map((f) => `<li><span class="num">${f.v >= 0 ? "+" : "−"}${Math.abs(f.v)}</span> ${esc(f.label)} ${f.prop ? prop(f.prop) : ""}</li>`).join("")}</ul>
        <span class="small">${esc(B.band.text)}</span>
        <span class="xs muted">Fasce: Minore ≤8 · Moderato 9–15 · Maggiore 16–20 · Grave 21–25 · Catastrofico 26+ ${src(SRC.magic + ", Backlash table")}</span>`;
    },
    effect(w, ctx) {
      const char = charById(ctx, w.charId);
      const E = spellEffect(w, char);
      if (!E) return `<span class="label">Danno o cura stimati</span><span class="small muted">La categoria «${esc((CATEGORIES.find((c) => c.key === w.category) || {}).name || "")}» non ha un numero: l'effetto lo descrive il narratore.</span>`;
      return `<div class="row" style="justify-content:space-between"><span class="label">${esc(E.kind)} stimat${E.kind === "Cura" ? "a" : "o"} per ${esc(char ? char.name : "—")}</span>
          <span class="wm-big">${fmtN(E.min)}–${fmtN(E.max)}</span></div>
        <span class="wm-calc">${esc(E.steps.join(" "))}</span>
        <span class="xs muted">${prop("danno")} ${w.spheres.length > 1 ? prop("composizione", "proposta: sfere") : ""} ${E.kind === "Cura" ? prop("curaArcana", "proposta: cura") : ""}
          Il danno magico puro non sottrae la Difesa. ${src(SRC.crea + ", Danno magico")}</span>`;
    },
    card(w, ctx) {
      const V = spellVals(w);
      const B = backlash(w, charById(ctx, w.charId));
      const cat = (CATEGORIES.find((c) => c.key === w.category) || {}).name || "—";
      const ori = (ORIGINS.find((o) => o.key === w.origin) || {}).name || "—";
      const metas = spellMetaNames(w);
      return `<div class="sysmsg gold wm-sys anim-in" role="group" aria-label="Scheda dell'incantesimo">
        <span class="tag">[INCANTESIMO] ${esc(w.name.trim() || "Senza nome")}</span>
        <span><span class="wm-sk">Livello</span> ${V.L.cast} (base ${V.L.base}${V.L.meta ? ` + metamagia ${V.L.meta}` : ""}${V.L.trav ? ` + traverso ${V.L.trav}` : ""}) · ${esc(cat)}</span>
        <span><span class="wm-sk">Sfere</span> ${esc(w.spheres.map((x) => `${x.s} (${x.role.trim() || "?"}${x.trav ? ", traverso" : ""})`).join(" + ") || "—")}</span>
        ${metas.length ? `<span><span class="wm-sk">Metamagia</span> ${esc(metas.join(", "))}</span>` : ""}
        <span><span class="wm-sk">Costo</span> ${esc(fmtN(V.cost))} MP · <span class="wm-sk">Lancio</span> ${V.turns} t · <span class="wm-sk">Ricarica</span> ${esc(V.cd)} t</span>
        <span><span class="wm-sk">Rischio</span> backlash ${esc(B.band.name)} (${B.score})</span>
        <span><span class="wm-sk">Effetto</span> ${esc(w.effect.trim() || "—")}</span>
        <span><span class="wm-sk">Origine</span> ${esc(ori)}${w.combo ? " · combinazione" : ""}</span>
      </div>`;
    },
    reqs(w, ctx) {
      const A = spellAssignState(w, ctx);
      if (!A.char) return `<span class="small muted">Nessun PG.</span>`;
      const V = spellVals(w);
      const mp = charMpMax(A.char);
      const items = A.reqs.map((r) => {
        const sk = sphereSkill(A.char, r.s);
        const have = r.has ? `Grado ${roman(r.has)}${sk && sk.pct != null ? ` · ${sk.pct}${sk.pct === "MAX" ? "" : "%"}` : ""}` : "non posseduta";
        const cls = r.status === "ok" ? "wm-ok" : r.status === "overcast" ? "wm-warn" : "wm-bad";
        const msg = r.status === "ok" ? "✓" : r.status === "overcast" ? `overcast (consigliato ${roman(r.rec)})` : `serve Grado ${roman(r.need)}`;
        return `<li><span>${esc(r.s)} <span class="xs muted">${esc(have)}</span></span><span class="${cls}">${esc(msg)}</span></li>`;
      });
      const mpOk = !badNum(V.cost, 1) && V.cost <= mp;
      items.push(`<li><span>Mana massimo <span class="xs muted">${esc(fmtN(mp))} MP</span></span><span class="${mpOk ? "wm-ok" : "wm-warn"}">${mpOk ? "✓" : "costo oltre il massimo"}</span></li>`);
      const mage = /mago/i.test(A.char.classe || "");
      items.push(`<li><span>Classe <span class="xs muted">${esc(A.char.classe || "—")}</span></span><span class="${mage ? "wm-ok" : "muted"}">${mage ? "✓ Mago" : "basta possedere le sfere"}</span></li>`);
      return `<ul class="wm-reqs">${items.join("")}</ul>
        <span class="xs muted">Grado della sfera = skill di tipo Knowledge con lo stesso nome. Consigliato ≥ livello di lancio ${prop("gradoConsigliato")}</span>`;
    },
  };
  for (let i = 0; i < 3; i++) {
    SPELL_LIVE["req" + i] = (w, ctx) => {
      const x = w.spheres[i];
      if (!x) return "";
      const r = sphereReqs(w, charById(ctx, w.charId))[i];
      const cls = r.status === "ok" ? "good" : r.status === "overcast" ? "warn" : "bad";
      return `<span class="chip ${cls}" title="${esc(`Richiede Grado ${roman(r.need)}${w.combo ? " (combinazione)" : ""}; consigliato Grado ${roman(r.rec)} (proposta). Il PG ha ${r.has ? "Grado " + roman(r.has) : "nessun grado"}.`)}">Grado ${roman(r.need)}+ · PG ${roman(r.has)}</span>`;
    };
  }
  function spellMetaNames(w) {
    return w.meta.map((k) => {
      if (k.startsWith("sph:")) { const s = k.slice(4); return SPHERE_META[s] ? `${SPHERE_META[s].name} (${s})` : null; }
      const m = METAMAGIC.find((x) => x.key === k);
      return m ? m.name : null;
    }).filter(Boolean);
  }

  function spellPreview(w, ctx) {
    const V = spellVals(w);
    const char = charById(ctx, w.charId);
    const B = backlash(w, char);
    const E = spellEffect(w, char);
    const pairs = compatPairs(w.spheres.map((x) => x.s));
    const wp = worstPair(pairs);
    const cat = (CATEGORIES.find((c) => c.key === w.category) || {}).name || "—";
    const ori = ORIGINS.find((o) => o.key === w.origin);
    const metas = spellMetaNames(w);
    const reqs = sphereReqs(w, char);
    const miss = reqs.filter((r) => r.status === "missing").length;
    const over = reqs.filter((r) => r.status === "overcast").length;
    return [
      row("Nome", w.name.trim() || "—", null, { text: true }),
      row("Categoria", cat, null, { text: true }),
      row("Origine", ori ? ori.name : "—", [ori && ori.text], { text: true }),
      row("Sfere", w.spheres.map((x) => x.s).join(" + ") || "—", w.spheres.map((x, i) => `${i + 1}. ${x.s}: ${x.role.trim() || "ruolo da indicare"}${x.trav ? " · uso traverso (+1 lv)" : ""}`), { text: true }),
      row("Compatibilità", wp ? COMPAT_LEVELS[wp.level].name : "—", pairs.map((p) => `${p.a} + ${p.b}: ${COMPAT_LEVELS[p.level].name}${p.disagree ? " (vale la più severa)" : ""}`),
        { cls: wp ? "wm-" + ({ good: "ok", warn: "warn", bad: "bad", muted: "" }[COMPAT_LEVELS[wp.level].cls]) : "", text: true, prop: pairs.some((p) => p.disagree) ? "severa" : null }),
      row("Livello di lancio", V.L.cast ? String(V.L.cast) : "—", [`Base ${V.L.base} + metamagia ${V.L.meta}${V.L.trav ? ` + traverso ${V.L.trav}` : ""}`, metas.length ? `Metamagia: ${metas.join(", ")}` : "", "Fonte: Magic.txt, Metamagic (livelli 1–10)"],
        { cls: V.L.cast > 10 ? "wm-bad" : "", prop: V.L.trav ? "traverso" : V.L.metaSph ? "metaSfera" : null }),
      row("Efficacia", String(V.L.eff), [`Base ${V.L.base} + linea di potere ${V.L.ley} + sintonia ${V.L.zone}`, w.env.anti ? "Zona antimagia attiva" : ""], { prop: "efficacia" }),
      row("Costo Mana", badNum(V.cost, 1) ? "—" : `${fmtN(V.cost)} MP`, [`Proposta: 10 × ${V.L.cast} × ${V.L.cast + 1}${w.combo ? " × 1,5" : ""} = ${fmtN(V.sugg.cost)} MP`, w.cost !== null ? "Valore modificato a mano (contrattato)" : "", "Dardo Magico: 20 MP a livello 1 (Creazione personaggio.txt)"], { prop: "costo" }),
      row("Tempo di lancio", `${V.turns} t`, [`⌈${V.L.cast}/3⌉${w.combo ? " × 1,5 (combinazione, Magic.txt)" : ""}`], { prop: "tempo" }),
      row("Ricarica", badNum(V.cd, 0) ? "—" : `${V.cd} t`, [`Proposta: ⌈${V.L.cast}/2⌉ = ${V.sugg.cd}`], { prop: "ricarica" }),
      row("Backlash", `${B.band.name} · ${B.score}`, B.factors.map((f) => `${f.v >= 0 ? "+" : "−"}${Math.abs(f.v)} ${f.label}`).concat([B.band.text]), { cls: "wm-" + ({ good: "ok", warn: "warn", bad: "bad" }[B.band.cls]), prop: "gravita" }),
      row(E ? `${E.kind} (${char ? char.name : "PG"})` : "Danno/cura", E ? `${fmtN(E.min)}–${fmtN(E.max)}` : "—", E ? E.steps : ["Categoria senza numero: lo descrive il narratore"], { prop: E ? "danno" : null }),
      row("Requisiti PG", !char ? "—" : miss ? `${miss} sfer${miss === 1 ? "a" : "e"} mancant${miss === 1 ? "e" : "i"}` : over ? "overcast" : "ok",
        reqs.map((r) => `${r.s}: PG ${roman(r.has)} · richiesto ${roman(r.need)} · consigliato ${roman(r.rec)}`), { cls: miss ? "wm-bad" : over ? "wm-warn" : "wm-ok", text: true }),
    ].join("");
  }

  S.wizards.push({
    id: "incantesimo",
    kind: "spells",
    group: "Magia",
    title: "Incantesimo",
    desc: "Il mago compone le sfere: livello, metamagia, costo Mana, backlash e grimorio.",
    render(root, ctx) {
      mountWizard(root, ctx, {
        prefix: "wm-s",
        title: "Forgia · Incantesimo",
        init(c) {
          return {
            name: "", effect: "", category: "attacco", origin: "grimorio",
            spheres: [], combo: false, level: 1, meta: [],
            env: { zone: "", ley: 0, anti: false },
            risk: { fatigue: false, emotion: false, interrupt: false, overcast: "auto", protections: 0 },
            cost: null, cd: null,
            charId: c.state && c.state.char ? c.state.char.id : null,
            assign: true, force: false,
          };
        },
        steps: SPELL_STEPS,
        live: SPELL_LIVE,
        preview: spellPreview,
        act(act, b, w) {
          const i = Number(b.dataset.i);
          if (act === "sphere") {
            const k = b.dataset.v;
            const at = w.spheres.findIndex((x) => x.s === k);
            if (at >= 0) { w.spheres.splice(at, 1); w.meta = w.meta.filter((m) => m !== "sph:" + k); }
            else if (w.spheres.length < 3) w.spheres.push({ s: k, role: w.spheres.length ? "" : "forma", trav: false });
          } else if (act === "rm") {
            const k = w.spheres[i] && w.spheres[i].s;
            w.spheres.splice(i, 1);
            w.meta = w.meta.filter((m) => m !== "sph:" + k);
          } else if (act === "up" && i > 0) {
            [w.spheres[i - 1], w.spheres[i]] = [w.spheres[i], w.spheres[i - 1]];
          } else if (act === "lvl") {
            const cur = isInt(w.level) ? w.level : 1;
            w.level = clamp(cur + Number(b.dataset.d), 1, 10);
          }
        },
        onChange(path, w) { if (path === "charId") w.force = false; },
        saveLabel(w, ctx) {
          const A = spellAssignState(w, ctx);
          return w.assign && A.canSkill && A.char ? `Salva e aggiungi a ${A.char.name}` : "Salva nella libreria";
        },
        save(w, ctx) {
          const V = spellVals(w);
          const A = spellAssignState(w, ctx);
          const B = backlash(w, A.char);
          const name = w.name.trim();
          const sph = w.spheres.map((x) => x.s).join("+");
          const assign = w.assign && A.canSkill && A.char;
          const entry = {
            name,
            summary: `Lv ${V.L.cast} · ${sph} · ${V.cost} MP · ${(CATEGORIES.find((c) => c.key === w.category) || {}).name} · backlash ${B.band.name}`,
            type: "Incantesimo", effect: w.effect.trim(), category: w.category, origin: w.origin,
            spheres: w.spheres.map((x) => ({ sphere: x.s, role: x.role.trim(), traverso: x.trav })),
            combo: w.combo, level: V.L.base, castLevel: V.L.cast, efficacy: V.L.eff, metamagic: spellMetaNames(w),
            env: { ...w.env }, cost: V.cost, castTurns: V.turns, cd: V.cd, backlash: { score: B.score, band: B.band.name },
            assignedTo: assign ? A.char.id : null,
          };
          if (assign) {
            A.char.activeSkills = A.char.activeSkills || [];
            A.char.activeSkills.push({ name, effect: w.effect.trim(), lvl: 1, pct: 1, cost: `${V.cost} MP`, cd: V.cd, kind: "Incantesimo", spheres: entry.spheres.map((x) => x.sphere) });
          }
          ctx.save(entry);
          if (assign) S.ui.toast("FORGIA", [`Incantesimo «${name}» aggiunto alla libreria.`, `Aggiunto al grimorio di ${A.char.name}: Grado I · 1%.`], true);
        },
      });
    },
  });

  /* =====================================================================
     WIZARD: MIRACOLO
     ===================================================================== */
  function miracleAssignState(m, ctx) {
    const char = charById(ctx, m.charId);
    const V = miracleValues(m);
    const fede = charFede(char);
    const fav = V.god && char ? charFavor(char, V.god) : { v: 0, recorded: false };
    const issues = [];
    if (char && !isCleric(char)) issues.push(`${char.name} non è un chierico (${char.classe || "—"})`);
    if (char && !badNum(V.fede, 0) && fede < V.fede) issues.push(`Fede ${fmtN(fede)} su ${fmtN(V.fede)} richiesta`);
    if (char && V.god && fav.v < V.favor) issues.push(`favore di ${V.god.name}: ${favorName(fav.v)}, serve ${favorName(Number(V.favor))}`);
    return { char, V, fede, fav, issues };
  }

  const MIRACLE_STEPS = [
    {
      label: "Divinità",
      check(m) { return m.god ? null : "Scegli la divinità che concede il miracolo."; },
      html(m) {
        const group = (dom) => `<fieldset class="wm-fs"><legend class="label">Signori ${dom === "Luce" ? "della Luce" : "dell'Ombra"}</legend>
          <div class="wm-cards">${GODS.filter((g) => g.domain === dom).map((g) => `
            <button type="button" class="pick" id="wm-m-god-${g.key}" data-act="set" data-k="god" data-v="${g.key}" aria-pressed="${m.god === g.key}">
              <span class="row" style="gap:6px"><b>${esc(g.name)}</b>${g.origin ? '<span class="chip gold">originario</span>' : ""}</span>
              <span class="xs muted">${esc(g.epithet)} · ${esc(g.sphere)}</span>
              <span class="xs"><span class="muted">Tono:</span> ${esc(g.tone)}</span>
            </button>`).join("")}</div></fieldset>`;
        return `
        <p class="small muted">Il chierico non usa le sfere arcane: riceve il potere dal dio in cui crede. I domini sono due, Luce e Ombra; gli altri dèi ne sono derivati. ${src(SRC.amb + ", Natura degli dèi; " + SRC.glo + ", Domini divini")}</p>
        ${group("Luce")}${group("Ombra")}
        <span class="xs muted">Tono di ogni dio ${prop("tono")}</span>`;
      },
    },
    {
      label: "Natura",
      check(m) {
        const n = m.name.trim();
        if (n.length < 2) return "Dai un nome al miracolo (almeno 2 caratteri).";
        if (n.length > 40) return "Nome troppo lungo: massimo 40 caratteri.";
        if (m.effect.trim().length < 5) return "Descrivi l'effetto del miracolo.";
        return null;
      },
      html(m) {
        return `
        <div class="field">
          <label class="label" for="wm-m-name">Nome del miracolo</label>
          <input class="input" id="wm-m-name" type="text" data-f="name" maxlength="40" autocomplete="off" value="${esc(m.name)}" placeholder="Es. Luce che Risana">
          <span class="hint" data-live="nameHint"></span>
        </div>
        <fieldset class="wm-fs"><legend class="label">Natura</legend>
          <div class="wm-opts">${NATURES.map((n) => `<button type="button" class="wm-opt" id="wm-m-nat-${n.key}" data-act="set" data-k="nature" data-v="${n.key}" aria-pressed="${m.nature === n.key}" title="${esc(n.text)}">${esc(n.name)}</button>`).join("")}</div>
          <div data-live="affinity"></div>
        </fieldset>
        <div class="field">
          <label class="label" for="wm-m-effect">Effetto</label>
          <textarea class="input" id="wm-m-effect" rows="4" data-f="effect" maxlength="600" placeholder="Es. Una luce calda chiude le ferite di un alleato a portata di voce.">${esc(m.effect)}</textarea>
        </div>`;
      },
    },
    {
      label: "Requisiti e costo",
      check(m) {
        if (!isInt(m.level) || m.level < 1 || m.level > 10) return "Il livello va da 1 a 10.";
        const V = miracleValues(m);
        if (badNum(V.fede, 0)) return "La Fede richiesta deve essere un intero ≥ 0.";
        if (badNum(V.cost, 1)) return "Il costo Mana deve essere un intero ≥ 1.";
        if (badNum(V.cd, 0)) return "La ricarica deve essere un intero ≥ 0.";
        return null;
      },
      html(m) {
        const V = miracleValues(m);
        return `
        <div class="field">
          <label class="label" for="wm-m-level">Livello del miracolo (1–10) ${prop("livelloMiracolo")}</label>
          <div class="wm-num">
            <button type="button" class="btn icon" data-act="lvl" data-d="-1" id="wm-m-lvl-dn" aria-label="Livello −1" ${m.level <= 1 ? "disabled" : ""}>−</button>
            <input class="input" id="wm-m-level" type="number" inputmode="numeric" data-f="level" data-t="num" min="1" max="10" step="1" value="${esc(m.level)}">
            <button type="button" class="btn icon" data-act="lvl" data-d="1" id="wm-m-lvl-up" aria-label="Livello +1" ${m.level >= 10 ? "disabled" : ""}>+</button>
          </div>
        </div>
        <p class="xs muted">Il miracolo costa Mana come ogni magia; potenza e accesso dipendono dalla Fede e dal favore del dio. ${src(SRC.magic + ", Come leggere: magia divina")}</p>
        <div class="wz-grid2">
          ${numField({ id: "wm-m-fede", path: "fede", label: "Fede richiesta", value: V.fede, sugg: V.sugg.fede, min: 0, propKey: "fede", overridden: m.fede !== null })}
          <div class="field">
            <label class="label" for="wm-m-favor">Favore divino richiesto</label>
            <div class="wm-num">
              <select class="input" id="wm-m-favor" data-f="favor" data-t="num" style="width:auto;max-width:100%">${FAVOR.map((f) => `<option value="${f.v}" ${Number(V.favor) === f.v ? "selected" : ""}>${f.v > 0 ? "+" : ""}${f.v} · ${esc(f.name)}</option>`).join("")}</select>
              ${prop("favoreScala", "proposta: scala")}
              ${m.favor !== null ? `<button type="button" class="btn ghost" data-act="reset" data-k="favor" id="wm-m-favor-reset">Ripristina ${esc(favorName(V.sugg.favor))}</button>` : ""}
            </div>
            <span class="hint" data-live="favorHint"></span>
          </div>
          ${numField({ id: "wm-m-cost", path: "cost", label: "Costo Mana", value: V.cost, sugg: V.sugg.cost, min: 1, unit: "MP", propKey: "costoMiracolo", overridden: m.cost !== null })}
          ${numField({ id: "wm-m-cd", path: "cd", label: "Ricarica", value: V.cd, sugg: V.sugg.cd, min: 0, unit: "turni", propKey: "ricarica", overridden: m.cd !== null })}
        </div>
        <div class="wm-box" data-live="power"></div>`;
      },
    },
    {
      label: "Voti e tabù",
      check(m) {
        if (!miracleVowList(m).length) return "Indica almeno una condizione, un voto o un tabù del dio.";
        return null;
      },
      html(m) {
        const god = GODS.find((g) => g.key === m.god);
        return `
        <fieldset class="wm-fs"><legend class="label">Condizioni, voti e tabù di ${esc(god ? god.name : "—")} ${prop("voti")}</legend>
          <div class="stack" style="gap:6px">${(god ? god.vows : []).map((v, i) => `<label class="wm-check" for="wm-m-vow-${i}"><input type="checkbox" id="wm-m-vow-${i}" data-arr="vows" value="${esc(v)}" ${m.vows.includes(v) ? "checked" : ""}><span>${esc(v)}</span></label>`).join("")}</div>
          <div class="field">
            <label class="label" for="wm-m-custom">Altri voti o condizioni (uno per riga)</label>
            <textarea class="input" id="wm-m-custom" rows="3" data-f="customVows" maxlength="400" placeholder="Es. Solo alla luce del giorno">${esc(m.customVows)}</textarea>
          </div>
        </fieldset>
        <fieldset class="wm-fs"><legend class="label">Se usato contro la volontà del dio</legend>
          <div class="stack" style="gap:6px">${AGAINST.map((a) => `<label class="wm-check" for="wm-m-ag-${a.key}"><input type="radio" name="wm-m-against" id="wm-m-ag-${a.key}" data-f="against" value="${a.key}" ${m.against === a.key ? "checked" : ""}>
            <span>${esc(a.name)} ${a.fromText ? src(SRC.magic + ", Come leggere: se il dio ritira il favore i prodigi si indeboliscono o cessano") : prop("conseguenze")}<br><span class="xs muted">${esc(a.text)}</span></span></label>`).join("")}</div>
          <div class="field">
            <label class="label" for="wm-m-agnote">Nota del Master (facoltativa)</label>
            <input class="input" id="wm-m-agnote" type="text" data-f="againstNote" maxlength="200" autocomplete="off" value="${esc(m.againstNote)}" placeholder="Es. Morteus manda un corvo a reclamare il debito">
          </div>
        </fieldset>`;
      },
    },
    {
      label: "Anteprima",
      check(m, ctx) {
        if (!m.assign) return null;
        const A = miracleAssignState(m, ctx);
        if (!A.char) return "Nessun PG da assegnare.";
        if (A.issues.length && !m.force) return `${A.issues[0]}: forza o togli l'assegnazione.`;
        return null;
      },
      html(m, ctx) {
        const A = miracleAssignState(m, ctx);
        return `
        <div data-live="card"></div>
        <div class="field">
          <label class="label" for="wm-m-char">PG</label>
          <select class="input" id="wm-m-char" data-f="charId">${charOptions(ctx, A.char && A.char.id)}</select>
        </div>
        <div class="wm-box"><span class="label">Requisiti su ${esc(A.char ? A.char.name : "—")}</span><div data-live="reqs"></div></div>
        <label class="wm-check" for="wm-m-assign"><input type="checkbox" id="wm-m-assign" data-f="assign" ${m.assign ? "checked" : ""}>
          <span>Assegna a ${esc(A.char ? A.char.name : "—")}<br><span class="xs muted">Diventa una skill attiva di Grado I all'1%.</span></span></label>
        ${m.assign && A.issues.length ? `<div class="sysmsg" role="alert" style="border-color:var(--warn);background:transparent"><span class="tag" style="color:var(--warn)">[AVVISO]</span>${A.issues.map((t) => `<span>${esc(t)}.</span>`).join("")}</div>
          <label class="wm-check" for="wm-m-force"><input type="checkbox" id="wm-m-force" data-f="force" ${m.force ? "checked" : ""}>
          <span>Forza l'assegnazione (decisione del Master)</span></label>` : ""}`;
      },
    },
  ];

  function miracleVowList(m) {
    const god = GODS.find((g) => g.key === m.god);
    return [...m.vows.filter((v) => god && god.vows.includes(v)), ...m.customVows.split("\n").map((s) => s.trim()).filter(Boolean)];
  }

  const MIRACLE_LIVE = {
    nameHint(m) {
      const n = m.name.trim().toLowerCase();
      const lib = (S.data.library && S.data.library.miracles) || [];
      if (n && lib.some((e) => String(e.name).toLowerCase() === n)) return `<span class="wm-warn">Esiste già un miracolo con questo nome nella libreria.</span>`;
      return "Da 2 a 40 caratteri.";
    },
    affinity(m) {
      const god = GODS.find((g) => g.key === m.god);
      if (!god) return "";
      const ok = isAffine(god, m.nature);
      return `<span class="small"><span class="chip ${ok ? "good" : "warn"}">${ok ? "Affine" : "Fuori dominio"}</span>
        ${ok ? `Rientra nel dominio di ${esc(god.name)}.` : `${esc(god.name)} lo concede a fatica: favore richiesto +1 grado.`} ${prop("affinita")}</span>`;
    },
    favorHint(m) {
      const V = miracleValues(m);
      return esc(`Proposta: ${favorName(V.sugg.favor)} (livello ${V.L}${V.affine ? "" : ", +1 fuori dominio"}).`) + " " + prop("favoreRichiesto");
    },
    "wm-m-fede-hint"(m) { const V = miracleValues(m); return esc(`Proposta: ${fmtN(V.sugg.fede)} (5 × ${V.L} × ${V.L + 1}).`); },
    "wm-m-cost-hint"(m, ctx) {
      const V = miracleValues(m);
      const char = charById(ctx, m.charId);
      const mp = charMpMax(char);
      return esc(`Proposta: ${fmtN(V.sugg.cost)} MP (12,5 × ${V.L} × ${V.L + 1}). Cura Minore: 25 MP.`
        + (char && mp && !badNum(V.cost, 1) ? ` ${Math.round((V.cost / mp) * 100)}% del Mana di ${char.name}.` : ""));
    },
    "wm-m-cd-hint"(m) { const V = miracleValues(m); return esc(`Proposta: ${V.sugg.cd} turni (⌈${V.L} / 2⌉).`); },
    power(m, ctx) {
      const char = charById(ctx, m.charId);
      const P = miraclePower(m, char);
      const V = miracleValues(m);
      const state = `${favorName(P.fav.v)}${P.fav.recorded ? "" : " (non registrato)"} su ${favorName(Number(V.favor))} richiesto → ${P.fm.state}`;
      if (!P.value) return `<span class="label">Potenza per ${esc(char ? char.name : "—")}</span>
        <span class="small">Fede ${fmtN(P.fede)} · favore ${esc(state)}</span>
        <span class="xs muted">Questa natura non ha un numero: l'effetto lo descrive il narratore, più forte con più Fede e favore.</span>`;
      return `<div class="row" style="justify-content:space-between"><span class="label">${esc(P.value.kind)} stimat${P.value.kind === "Cura" ? "a" : "o"} per ${esc(char ? char.name : "—")}</span>
          <span class="wm-big">${P.fm.mult ? `${fmtN(P.value.min)}–${fmtN(P.value.max)}` : "nessun effetto"}</span></div>
        <span class="wm-calc">${P.value.base[0]}–${P.value.base[1]} × livello ${V.L} × (1 + Fede ${fmtN(P.fede)}/100) × favore ${String(P.fm.mult).replace(".", ",")}</span>
        <span class="small">Favore: ${esc(state)}</span>
        <span class="xs muted">${prop("potenzaMiracolo")} ${P.value.kind === "Cura" ? `Base 40–60 dalla Cura Minore ${src(SRC.pg + ", Chierico")}` : prop("castigo", "proposta: base")}</span>`;
    },
    card(m, ctx) {
      const V = miracleValues(m);
      const nat = NATURES.find((n) => n.key === m.nature);
      const ag = AGAINST.find((a) => a.key === m.against);
      const vows = miracleVowList(m);
      return `<div class="sysmsg gold wm-sys anim-in" role="group" aria-label="Scheda del miracolo">
        <span class="tag">[MIRACOLO] ${esc(m.name.trim() || "Senza nome")}</span>
        <span><span class="wm-sk">Dio</span> ${esc(V.god ? `${V.god.name} · ${V.god.domain}` : "—")} · <span class="wm-sk">Natura</span> ${esc(nat ? nat.name : "—")}${V.affine ? "" : " (fuori dominio)"}</span>
        <span><span class="wm-sk">Livello</span> ${V.L} · <span class="wm-sk">Fede</span> ${esc(fmtN(V.fede))} · <span class="wm-sk">Favore</span> ${esc(favorName(Number(V.favor)))}</span>
        <span><span class="wm-sk">Costo</span> ${esc(fmtN(V.cost))} MP · <span class="wm-sk">Ricarica</span> ${esc(V.cd)} t</span>
        <span><span class="wm-sk">Effetto</span> ${esc(m.effect.trim() || "—")}</span>
        <span><span class="wm-sk">Voti</span> ${esc(vows.join(" · ") || "—")}</span>
        <span><span class="wm-sk">Contro la volontà del dio</span> ${esc(ag ? ag.name : "—")}${m.againstNote.trim() ? ` — ${esc(m.againstNote.trim())}` : ""}</span>
      </div>`;
    },
    reqs(m, ctx) {
      const A = miracleAssignState(m, ctx);
      if (!A.char) return `<span class="small muted">Nessun PG.</span>`;
      const mp = charMpMax(A.char);
      const cleric = isCleric(A.char);
      const fedeOk = badNum(A.V.fede, 0) || A.fede >= A.V.fede;
      const favOk = A.fav.v >= A.V.favor;
      const mpOk = !badNum(A.V.cost, 1) && A.V.cost <= mp;
      return `<ul class="wm-reqs">
        <li><span>Classe <span class="xs muted">${esc(A.char.classe || "—")}</span></span><span class="${cleric ? "wm-ok" : "wm-warn"}">${cleric ? "✓ Chierico" : "non è un chierico"}</span></li>
        <li><span>Fede <span class="xs muted">${esc(fmtN(A.fede))}${A.fede ? "" : " (statistica assente)"}</span></span><span class="${fedeOk ? "wm-ok" : "wm-bad"}">${fedeOk ? "✓" : `serve ${esc(fmtN(A.V.fede))}`}</span></li>
        <li><span>Favore di ${esc(A.V.god ? A.V.god.name : "—")} <span class="xs muted">${esc(favorName(A.fav.v))}${A.fav.recorded ? "" : " · non registrato"}</span></span><span class="${favOk ? "wm-ok" : "wm-bad"}">${favOk ? "✓" : `serve ${esc(favorName(Number(A.V.favor)))}`}</span></li>
        <li><span>Mana massimo <span class="xs muted">${esc(fmtN(mp))} MP</span></span><span class="${mpOk ? "wm-ok" : "wm-warn"}">${mpOk ? "✓" : "costo oltre il massimo"}</span></li>
      </ul>
      <span class="xs muted">Favore = reputazione cosmica del PG verso il dio ${src(SRC.soc + ", Livello 5: Cosmico")}</span>`;
    },
  };

  function miraclePreview(m, ctx) {
    const V = miracleValues(m);
    const char = charById(ctx, m.charId);
    const P = miraclePower(m, char);
    const nat = NATURES.find((n) => n.key === m.nature);
    const ag = AGAINST.find((a) => a.key === m.against);
    const vows = miracleVowList(m);
    const A = miracleAssignState(m, ctx);
    return [
      row("Nome", m.name.trim() || "—", null, { text: true }),
      row("Divinità", V.god ? V.god.name : "—", V.god ? [V.god.epithet, V.god.sphere, `Tono: ${V.god.tone}`] : null, { text: true, prop: V.god ? "tono" : null }),
      row("Dominio", V.god ? V.god.domain : "—", V.god ? [`Opposto: ${V.god.domain === "Luce" ? "Ombra" : "Luce"}`, "Fonte: Glossario, Domini divini"] : null, { text: true }),
      row("Natura", nat ? `${nat.name}${V.god && !V.affine ? " · fuori dominio" : ""}` : "—", nat ? [nat.text] : null, { text: true, cls: V.god && !V.affine ? "wm-warn" : "", prop: V.god ? "affinita" : null }),
      row("Livello", V.L ? String(V.L) : "—", null, { prop: "livelloMiracolo" }),
      row("Fede richiesta", badNum(V.fede, 0) ? "—" : fmtN(V.fede), [`Proposta: 5 × ${V.L} × ${V.L + 1} = ${fmtN(V.sugg.fede)}`, m.fede !== null ? "Valore modificato a mano" : ""], { prop: "fede" }),
      row("Favore richiesto", favorName(Number(V.favor)), [`Proposta: ${favorName(V.sugg.favor)}`, m.favor !== null ? "Valore modificato a mano" : ""], { text: true, prop: "favoreRichiesto" }),
      row("Costo Mana", badNum(V.cost, 1) ? "—" : `${fmtN(V.cost)} MP`, [`Proposta: 12,5 × ${V.L} × ${V.L + 1} = ${fmtN(V.sugg.cost)} MP`, "Cura Minore: 25 MP a livello 1 (Creazione personaggio.txt)"], { prop: "costoMiracolo" }),
      row("Ricarica", badNum(V.cd, 0) ? "—" : `${V.cd} t`, [`Proposta: ⌈${V.L}/2⌉ = ${V.sugg.cd}`], { prop: "ricarica" }),
      row(P.value ? `${P.value.kind} (${char ? char.name : "PG"})` : "Potenza", P.value ? (P.fm.mult ? `${fmtN(P.value.min)}–${fmtN(P.value.max)}` : "nessun effetto") : P.fm.state,
        [`Fede del PG ${fmtN(P.fede)} · favore ${favorName(P.fav.v)}${P.fav.recorded ? "" : " (non registrato)"}`, `Molt. favore ×${String(P.fm.mult).replace(".", ",")} (${P.fm.state})`], { prop: "potenzaMiracolo", text: !P.value }),
      row("Voti e tabù", vows.length ? String(vows.length) : "—", vows, {}),
      row("Contro la volontà", ag ? ag.name : "—", ag ? [ag.text, m.againstNote.trim()] : null, { text: true, prop: ag && !ag.fromText ? "conseguenze" : null }),
      row("Assegnazione", !m.assign ? "solo libreria" : A.issues.length ? (m.force ? "forzata" : "da verificare") : `a ${char ? char.name : "—"}`, A.issues, { text: true, cls: m.assign && A.issues.length ? "wm-warn" : "" }),
    ].join("");
  }

  S.wizards.push({
    id: "miracolo",
    kind: "miracles",
    group: "Magia",
    title: "Miracolo",
    desc: "Il chierico chiede al suo dio: Fede, favore divino, costo Mana, voti e tabù.",
    render(root, ctx) {
      mountWizard(root, ctx, {
        prefix: "wm-m",
        title: "Forgia · Miracolo",
        init(c) {
          return {
            god: "", name: "", nature: "guarigione", effect: "", level: 1,
            fede: null, favor: null, cost: null, cd: null,
            vows: [], customVows: "", against: "indebolito", againstNote: "",
            charId: c.state && c.state.char ? c.state.char.id : null,
            assign: true, force: false,
          };
        },
        steps: MIRACLE_STEPS,
        live: MIRACLE_LIVE,
        preview: miraclePreview,
        act(act, b, m) {
          if (act === "lvl") { const cur = isInt(m.level) ? m.level : 1; m.level = clamp(cur + Number(b.dataset.d), 1, 10); }
        },
        onChange(path, m) {
          if (path === "charId") m.force = false;
          if (path === "favor" && m.favor === miracleValues({ ...m, favor: null }).sugg.favor) m.favor = null;
        },
        saveLabel(m, ctx) {
          const A = miracleAssignState(m, ctx);
          return m.assign && A.char ? `Salva e assegna a ${A.char.name}` : "Salva nella libreria";
        },
        save(m, ctx) {
          const A = miracleAssignState(m, ctx);
          const V = A.V;
          const nat = NATURES.find((n) => n.key === m.nature);
          const name = m.name.trim();
          const assign = m.assign && A.char;
          const entry = {
            name,
            summary: `${V.god.name} · ${nat.name} · Lv ${V.L} · ${V.cost} MP · Fede ${V.fede} · ${favorName(Number(V.favor))}`,
            type: "Miracolo", god: V.god.name, domain: V.god.domain, nature: m.nature, effect: m.effect.trim(), level: V.L,
            fede: V.fede, favor: Number(V.favor), favorName: favorName(Number(V.favor)), cost: V.cost, cd: V.cd,
            vows: miracleVowList(m), against: m.against, againstNote: m.againstNote.trim(),
            assignedTo: assign ? A.char.id : null, forced: !!(assign && A.issues.length),
          };
          if (assign) {
            A.char.activeSkills = A.char.activeSkills || [];
            A.char.activeSkills.push({ name, effect: m.effect.trim(), lvl: 1, pct: 1, cost: `${V.cost} MP`, cd: V.cd, kind: "Miracolo", god: V.god.name });
          }
          ctx.save(entry);
          if (assign) S.ui.toast("FORGIA", [`Miracolo «${name}» aggiunto alla libreria.`, `Assegnato a ${A.char.name}: Grado I · 1%.`], true);
        },
      });
    },
  });

})();
