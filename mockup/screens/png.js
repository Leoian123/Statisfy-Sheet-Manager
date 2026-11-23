/* PNG: preset a strati (ruolo, età, razza, luogo, ritocchi) → componi → scheda semplificata, comparse, catalogo dei preset,
   controlli del canone, archivio di zona e ritratto. Dati statici in png-data.js (copiati dagli output reali del motore). */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};
  const esc = (s) => S.ui.esc(s);
  const D = () => S.pngData;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- Stato locale ---------- */
  const st = {
    tab: "nuovo",
    sel: { ruolo: "fabbro", eta: "adulto", razza: "umano", regno: "valeria", ins: "villaggio", zona: "alba-chiara" },
    ritocchi: ["ex soldato della Corona"],
    seme: 11,
    scheda: null,           // scheda corrente (da esempio + ritocchi + rigenerazioni)
    combat: false,
    salvata: false,
    comp: { luogo: "alba-chiara", n: 6, seme: 42, righe: null },
    presetRuolo: null,
    arch: { dett: "tutti", vivi: "tutti", q: "" },
    ctrlAt: null,
  };
  const portraits = {};      // id PNG → { imgs: [{ id, url, name }], main }
  const userRefs = [];       // riferimenti aggiunti dal master: { id, strato, titolo, url }
  let uid = 0;

  const NOMI_VALERIA = {
    m: ["Gualtiero", "Ottone", "Lapo", "Cecco", "Brunello", "Folco", "Rinaldo", "Ugo", "Martino", "Corrado", "Ilario", "Tancredi", "Guido", "Bernardo"],
    f: ["Agnese", "Bice", "Clelia", "Dora", "Fiora", "Gemma", "Ida", "Mira", "Ornella", "Tilde", "Vanna", "Zita", "Teodora", "Sabina"],
    cognomi: ["Lupacchi", "Mulinari", "Carradori", "Pecorari", "Dal Pozzo", "Spigatti", "Fornari", "Bottai", "Tessitori", "Vacchetti", "Grigi", "Volpini", "Cardoni", "Bianchi"],
  };
  const LONGEVITA = { umano: { tipo: "umana", fattore: 1 }, elfo: { tipo: "lunghissima", fattore: 5 } };
  const ATT = [
    { k: "ostile", t: "Ostile", c: "var(--bad)" },
    { k: "diffidente", t: "Diffidente", c: "var(--warn)" },
    { k: "indifferente", t: "Indifferente", c: "var(--muted)" },
    { k: "interessato", t: "Interessato", c: "var(--mp)" },
    { k: "ben_disposto", t: "Ben disposto", c: "var(--good)" },
  ];
  const ATT_CHIP = { ostile: "bad", diffidente: "warn", indifferente: "muted", interessato: "violet", ben_disposto: "good" };
  const ROLE_COLOR = { fabbro: "#f08c3e", guardia: "#e35d5d", contadino: "#62c375", mercante_ambulante: "#e3b55a", viaggiatore: "#a874f2", cittadino: "#5590f2" };
  const TAGLIA = { fragile: { t: "Fragile", m: 0.5 }, normale: { t: "Normale", m: 1 }, robusta: { t: "Robusta", m: 1.5 } };
  const ADDESTR = { nessuno: null, improvvisato: 0.5, addestrato: 1, veterano: 1 };
  const nf = (x) => Number(x).toLocaleString("it-IT");

  /* ---------- Utilità ---------- */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const nomeRuolo = (id) => (D().catalogo.ruoli.find((x) => x.id === id) || { nome: id }).nome;
  const nomeRazza = (id) => (D().catalogo.razze.find((x) => x.id === id) || { nome: id }).nome;
  const regno = (id) => D().catalogo.regni.find((x) => x.id === id);
  const fmtVal = (v) => Array.isArray(v) ? v.join("–") : v && typeof v === "object" ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(", ") : v == null ? "—" : String(v);

  /* Strato che ha deciso un valore: colore e sigla del chip */
  function layer(da) {
    const s = String(da || "");
    if (/variante/.test(s)) return { k: "razza", t: "variante" };
    if (s.startsWith("ruolo")) return { k: "ruolo", t: "ruolo" };
    if (s.startsWith("età") || s.startsWith("eta")) return { k: "eta", t: "età" };
    if (s.startsWith("razza")) return { k: "razza", t: "razza" };
    if (s.startsWith("regno")) return { k: "regno", t: "regno" };
    if (s.startsWith("insediamento")) return { k: "ins", t: "insed." };
    if (s.startsWith("zona")) return { k: "zona", t: "zona" };
    if (s.startsWith("ritocco")) return { k: "rit", t: "ritocco" };
    return { k: "reg", t: "regole" };
  }
  const layerChip = (da) => { const l = layer(da); return `<span class="pn-lc pn-l-${l.k}">${esc(l.t)}</span>`; };
  function notaHtml(nota) {
    if (!nota) return "";
    return esc(nota).replace(/\b(FONTE|PROPOSTA)\b/g, (m) => `<b class="${m === "FONTE" ? "good" : "warn"}">${m}</b>`);
  }

  /* ---------- Tooltip (uno solo, nel body; hover e focus) ---------- */
  let tips = [];
  const tip = (html) => { tips.push(html); return `data-pt="${tips.length - 1}"`; };
  function tipEl() {
    let el = document.getElementById("pn-tip");
    if (!el) { el = document.createElement("div"); el.id = "pn-tip"; el.setAttribute("role", "tooltip"); document.body.appendChild(el); }
    return el;
  }
  function hideTip() { const el = document.getElementById("pn-tip"); if (el) el.classList.remove("on"); }
  function showTip(anchor) {
    const html = tips[Number(anchor.dataset.pt)];
    if (!html) return hideTip();
    const el = tipEl();
    el.innerHTML = html;
    el.classList.add("on");
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight, w = el.offsetWidth, h = el.offsetHeight, m = 8;
    let left = r.right + m, top = r.top;
    if (left + w > vw - m) left = r.left - w - m;
    if (left < m) { left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), vw - w - m); top = r.bottom + m; if (top + h > vh - m) top = r.top - h - m; }
    top = Math.min(Math.max(m, top), Math.max(m, vh - h - m));
    el.style.left = `${Math.round(left)}px`; el.style.top = `${Math.round(top)}px`;
  }
  let globals = false;
  function bindGlobals() {
    if (globals) return; globals = true;
    window.addEventListener("hashchange", hideTip);
    window.addEventListener("scroll", hideTip, { passive: true, capture: true });
    window.addEventListener("resize", hideTip);
  }

  /* ---------- Avatar segnaposto: sagoma per ruolo × razza (finché non c'è un ritratto) ---------- */
  function initials(n) { return String(n || "?").replace(/[\[\]]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?"; }
  function silhouette(ruolo, razza, eta) {
    const col = ROLE_COLOR[ruolo] || "#8b91ad";
    const kid = eta === "bambino" || eta === "ragazzo";
    const short = razza === "nano" || razza === "halfling" || kid;
    const hy = short ? 17 : 14, hr = razza === "goblin" ? 6.5 : kid ? 5.5 : 6;
    const sw = razza === "nano" ? 15 : razza === "goblin" || kid ? 9 : 12;
    let extra = "";
    if (razza === "elfo") extra += `<path d="M${20 - hr} ${hy}l-4 -5 2 6zM${20 + hr} ${hy}l4 -5 -2 6z"/>`;
    if (razza === "goblin") extra += `<path d="M${20 - hr} ${hy}l-7 -2 6 4zM${20 + hr} ${hy}l7 -2 -6 4z"/>`;
    if (razza === "dragonide") extra += `<path d="M16 ${hy - 4}l-2 -5 4 3zM24 ${hy - 4}l2 -5 -4 3z"/>`;
    if (razza === "nano") extra += `<path d="M15 ${hy + 3}h10l-2 7h-6z"/>`;
    let acc = "";
    if (ruolo === "fabbro") acc = `<path d="M30 20h6v3h-6zM32 23h2v9h-2z" opacity=".9"/>`;
    if (ruolo === "guardia") acc = `<path d="M33 6l1.5 4h-1v26h-1V10h-1z" opacity=".9"/>`;
    if (ruolo === "contadino") acc = `<ellipse cx="20" cy="${hy - hr + 1}" rx="10" ry="2.2"/>`;
    if (ruolo === "viaggiatore") acc = `<path d="M${20 - hr - 1} ${hy + 1}L20 ${hy - hr - 4}L${20 + hr + 1} ${hy + 1}z" opacity=".85"/>`;
    if (ruolo === "mercante_ambulante") acc = `<circle cx="9" cy="28" r="4" opacity=".9"/>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect width="40" height="40" fill="color-mix(in srgb, ${col} 28%, #141826)"/>
      <g fill="color-mix(in srgb, ${col} 70%, #e6e8f2)"><circle cx="20" cy="${hy}" r="${hr}"/><path d="M${20 - sw} 40c0-${short ? 10 : 12} ${sw * 0.4}-${short ? 13 : 15} ${sw} -${short ? 13 : 15}s${sw} ${short ? 3 : 3} ${sw} ${short ? 13 : 15}z"/>${extra}${acc}</g></svg>`;
  }
  function avatar(p, size, cls = "") {
    const pr = portraits[p.id];
    const img = pr && pr.imgs.find((x) => x.id === pr.main);
    const inner = img ? `<img src="${img.url}" alt="">` : silhouette(p.ruolo, p.razza, typeof p.eta === "object" ? p.eta.fase : p.eta);
    return `<span class="pn-av ${cls}" style="--sz:${size}px" role="img" aria-label="${esc(img ? `Ritratto di ${p.nome}` : `${initials(p.nome)}: segnaposto ${nomeRuolo(p.ruolo)} ${nomeRazza(p.razza)}`)}">${inner}</span>`;
  }

  /* ---------- Motore finto: sceglie l'esempio reale più vicino e lo adatta agli strati ---------- */
  function baseKey(sel) {
    if (sel.ruolo === "cittadino" && sel.razza === "goblin") return "goblin_cittadino_bloccato";
    if (sel.eta === "bambino" || sel.eta === "ragazzo") return "nuovo_bambino";
    if (sel.eta === "anziano" || (sel.ruolo !== "fabbro" && sel.razza !== "umano")) return "nuovo_elfo_anziano_rara";
    if (sel.ruolo === "fabbro" && (sel.regno !== "valeria" || sel.razza === "nano")) return "componi_fabbro_nano_frostland_citta";
    if (sel.ruolo === "fabbro") return "nuovo_fabbro_alba_chiara";
    return "goblin_cittadino_bloccato";
  }
  function esatto(sel, key) {
    const s = D().esempi[key]; const str = (s.composizione || s).strati;
    return str.ruolo === sel.ruolo && str.eta === sel.eta && str.razza === sel.razza && str.regno === sel.regno && str.insediamento === sel.ins && (str.zona || "") === (sel.zona || "");
  }
  const ROLE_DEF = { fabbro: ["robusta", "improvvisato"], guardia: ["normale", "addestrato"], cittadino: ["normale", "nessuno"], contadino: ["normale", "improvvisato"], mercante_ambulante: ["normale", "nessuno"], viaggiatore: ["normale", "improvvisato"] };
  /* Composizione dell'esempio, riscritta sugli strati scelti quando l'esempio non coincide (solo mockup) */
  function composizione(key, sel = st.sel) {
    const ex = D().esempi[key];
    const c = clone(ex.composizione || ex);
    const str = c.strati;
    const subs = [];
    if (str.ruolo !== sel.ruolo) subs.push([`ruolo ${str.ruolo}`, `ruolo ${sel.ruolo}`], [`ruoli/${str.ruolo}.yaml`, `ruoli/${sel.ruolo}.yaml`], [`${str.ruolo} · variante`, `${sel.ruolo} · variante`]);
    if (str.eta !== sel.eta) subs.push([`età ${str.eta}`, `età ${sel.eta}`], [`eta/${str.eta}.yaml`, `eta/${sel.eta}.yaml`]);
    if (str.razza !== sel.razza) subs.push([`razza ${str.razza}`, `razza ${sel.razza}`], [`razze/${str.razza}.yaml`, `razze/${sel.razza}.yaml`], [`variante ${str.razza}`, `variante ${sel.razza}`]);
    if (str.regno !== sel.regno) subs.push([`regno ${str.regno}`, `regno ${sel.regno}`]);
    if (!subs.length) return c;
    const fix = (o) => { for (const k of ["da", "dove"]) if (typeof o[k] === "string") for (const [a, b] of subs) o[k] = o[k].split(a).join(b); };
    Object.values(c.campi).forEach(fix);
    Object.values(c.elenchi || {}).forEach((l) => l.forEach(fix));
    ((c.atteggiamento || {}).storia || []).forEach(fix);
    if (str.ruolo !== sel.ruolo && ROLE_DEF[sel.ruolo]) {
      const [corp, add] = ROLE_DEF[sel.ruolo];
      if (c.campi.corporatura) Object.assign(c.campi.corporatura, { valore: corp, da: `ruolo ${sel.ruolo}`, nota: "" });
      if (c.campi.addestramento) Object.assign(c.campi.addestramento, { valore: add, da: `ruolo ${sel.ruolo}`, nota: "" });
    }
    if (c.campi.longevita) c.campi.longevita.valore = LONGEVITA[sel.razza] || null;
    c.strati = { ...str, ruolo: sel.ruolo, eta: sel.eta, razza: sel.razza, regno: sel.regno, insediamento: sel.ins, zona: sel.zona || null };
    c._da = str;
    return c;
  }
  function ritoccoLivello() { for (const r of st.ritocchi) { const m = /^livello\s+(\d+)/i.exec(r.trim()); if (m) return Number(m[1]); } return null; }
  const motivi = () => st.ritocchi.filter((r) => !/^livello\s+\d+/i.test(r.trim()));
  function fascia(sel) { const r = D().catalogo.ruoli.find((x) => x.id === sel.ruolo); return r ? r.fasce[sel.ins] : null; }
  function luogoTxt(sel) { return sel.zona ? `${sel.regno}/${sel.zona}` : `${sel.regno} · ${sel.ins}`; }

  function controlli(sel) {
    const err = [], avv = [];
    const rz = sel.razza, rg = regno(sel.regno);
    const f = fascia(sel), lvR = ritoccoLivello(), mot = motivi();
    if ((sel.ruolo === "cittadino" || sel.ruolo === "guardia") && rz === "goblin" && sel.regno === "valeria" && !mot.length)
      err.push(`serve un motivo — ${sel.ruolo} · variante goblin: i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo`);
    if (!f && lvR == null) err.push(`nessuna fascia di livello per ${nomeRuolo(sel.ruolo).toLowerCase()} in ${sel.ins}: aggiungi il ritocco «livello N»`);
    if (!LONGEVITA[rz]) avv.push(`razza ${rz}: la longevità non è scritta; uso quella umana`);
    const quota = rg && rg.popoli ? rg.popoli[rz] : undefined;
    if (!(quota >= 10)) avv.push(mot.length ? `razza rara nel luogo: ${rz} a ${rg ? rg.nome : sel.regno}; motivo dichiarato: «${mot[0]}»` : `razza rara nel luogo: ${rz} a ${rg ? rg.nome : sel.regno} (non elencata); la scheda deve dire perché è lì`);
    if (!(sel.regno === "valeria" && rz === "umano")) avv.push(`nessuno stile di nomi scritto per ${rz} a ${sel.regno}: il nome va scelto a mano`);
    if (lvR != null && f && (lvR < f[0] || lvR > f[1])) avv.push(`il ritocco «livello ${lvR}» sfonda la fascia di ${sel.ruolo} (${f[0]}-${f[1]}): avvisa e obbedisce`);
    return { err, avv };
  }

  /* Scheda: copia dell'esempio reale, adattata agli strati scelti e ripescata con il seme */
  function genera() {
    const sel = st.sel;
    const key = baseKey(sel);
    const ex = D().esempi[key];
    const comp = composizione(key);
    let s = ex.scheda ? clone(ex.scheda) : null;
    if (!s) {
      const donor = key === "goblin_cittadino_bloccato" ? D().esempi.nuovo_elfo_anziano_rara.scheda : D().esempi.nuovo_fabbro_alba_chiara.scheda;
      s = clone(donor);
    }
    const sampleSeed = ex.scheda ? (ex.scheda.provenienza || {}).seme : null;
    const r = rng(st.seme * 7919 + 17);
    const reroll = st.seme !== sampleSeed || !esatto(sel, key);
    s.ruolo = sel.ruolo; s.razza = sel.razza; s.luogo = luogoTxt(sel);
    s.provenienza = { ruolo: sel.ruolo, eta: sel.eta, razza: sel.razza, luogo: luogoTxt(sel), insediamento: sel.ins, ritocchi: [...st.ritocchi], seme: st.seme };
    s.eta = s.eta || { fase: sel.eta };
    if (s.eta.fase !== sel.eta || reroll) {
      const range = { bambino: [5, 12], ragazzo: [13, 17], adulto: [18, 59], anziano: [60, 85] }[sel.eta];
      const ap = range[0] + Math.floor(r() * (range[1] - range[0] + 1));
      const fat = (LONGEVITA[sel.razza] || LONGEVITA.umano).fattore;
      s.eta = { fase: sel.eta, apparente: ap, vera: ap * fat };
    }
    const segni = (D().catalogo.razze.find((x) => x.id === sel.razza) || {}).segni || [];
    s.segni = [...segni];
    if (ROLE_DEF[sel.ruolo] && ex.scheda && ex.scheda.ruolo === sel.ruolo) { /* valori dell'esempio */ }
    else if (ROLE_DEF[sel.ruolo]) { [s.corporatura, s.addestramento] = ROLE_DEF[sel.ruolo]; }
    if (sel.eta === "anziano" && s.corporatura === "robusta") s.corporatura = "normale";
    if (sel.razza === "goblin" || sel.eta === "bambino") s.corporatura = "fragile";
    if (sel.eta === "bambino") { s.addestramento = "nessuno"; s.mestiere = null; }
    // ripesca i sette campi e i tratti dalle rose della composizione
    const el = comp.elenchi || {};
    if (reroll) {
      for (const k of ["vuole", "teme", "difetto", "forestieri", "prezzo", "vita"]) if (el[k] && el[k].length) s[k] = pick(r, el[k]).voce;
      const tr = (el.tratti || []).map((x) => x.voce).filter((x) => x !== s.difetto);
      s.tratti = [s.difetto, tr.length ? pick(r, tr) : null].filter(Boolean);
      s.genere = r() < 0.5 ? "m" : "f";
      if (sel.regno === "valeria" && sel.razza === "umano") s.nome = `${pick(r, NOMI_VALERIA[s.genere])} ${pick(r, NOMI_VALERIA.cognomi)}`;
      else s.nome = "[nome da scegliere]";
      const f = fascia(sel) || (comp.campi.livello || {}).valore;
      if (sel.eta === "bambino" || sel.eta === "ragazzo") s.livello = Math.max(1, Math.round(s.eta.apparente * (0.5 + r() * 0.5)));
      else if (Array.isArray(f)) s.livello = f[0] + Math.floor(r() * (f[1] - f[0] + 1));
    }
    const lvR = ritoccoLivello();
    if (lvR != null) s.livello = lvR;
    s.motivo = motivi()[0] || null;
    s.contraddizione = null;
    s.contraddizione_spunto = s.tratti && s.tratti.length ? `smentisci «${s.tratti.join("» o «")}»: in che cosa questa persona fa il contrario?` : s.contraddizione_spunto;
    s.id = `${sel.zona || sel.regno}/${String(s.nome).toLowerCase().replace(/[^a-zà-ù]+/g, "-").replace(/^-|-$/g, "") || "senza-nome"}-${st.seme}`;
    s.dettaglio = "scheda";
    s.ritratto = { descrizione: descrizione(s, comp), immagini: [] };
    s.stato = { affinita: (s.stato_iniziale || {}).affinita ?? -1, atteggiamento: (s.stato_iniziale || {}).atteggiamento_iniziale || "indifferente", memoria: [], legami: [] };
    if (!s.stato.memoria.length && st.seme === 11) s.stato.memoria = ["ha visto il gruppo entrare in paese armato"];
    const scritto = {};
    return { s, key, comp, esatto: esatto(sel, key) && !reroll ? true : esatto(sel, key), checks: controlli(sel), scritto };
  }

  /* Descrizione per il ritratto, a pezzi: ogni pezzo sa da quale strato arriva */
  function descrizione(s, comp) {
    const f = s.genere === "f";
    const fase = s.eta.fase;
    const faseT = { bambino: f ? "bambina" : "bambino", ragazzo: f ? "ragazza" : "ragazzo", adulto: f ? "adulta" : "adulto", anziano: f ? "anziana" : "anziano" }[fase];
    const o = s.origine || {};
    const c = comp.campi || {};
    const ric = { povero: "Vestiti consumati.", modesto: "Vestiti semplici e puliti.", agiato: "Vestiti buoni, qualche anello." }[s.ricchezza] || "Vestiti semplici.";
    const pezzi = [
      { t: `${nomeRazza(s.razza)}, ${faseT}, sui ${s.eta.apparente} anni all'aspetto.`, da: `razza ${s.razza} + età ${fase}`, dove: `preset/razze/${s.razza}.yaml · preset/eta/${fase}.yaml` },
      { t: `Corporatura ${s.corporatura}.`, da: o.corporatura ? (/^ruolo|^età|^razza/.test(o.corporatura) ? o.corporatura : `ruolo ${s.ruolo}`) : `ruolo ${s.ruolo}`, dove: (c.corporatura || {}).dove || `preset/ruoli/${s.ruolo}.yaml` },
      ...s.segni.map((g) => ({ t: `${g[0].toUpperCase()}${g.slice(1)}.`, da: `razza ${s.razza}`, dove: `preset/razze/${s.razza}.yaml · segni` })),
      { t: `${nomeRuolo(s.ruolo)}${s.mestiere ? `, ${s.mestiere.nome}` : ""}.`, da: `ruolo ${s.ruolo}`, dove: (c["mestiere.nome"] || {}).dove || `preset/ruoli/${s.ruolo}.yaml` },
      { t: `Di solito ${((c.giornata || {}).valore || "al mercato").split(";")[0]}.`, da: (c.giornata || {}).da || `ruolo ${s.ruolo}`, dove: (c.giornata || {}).dove || "" },
      { t: `Si vede che è ${(s.tratti || []).join(" e ")}.`, da: o.tratti ? `età ${fase} + difetto` : `ruolo ${s.ruolo}`, dove: "tratti: difetto pescato + età", nota: o.tratti || "" },
      { t: ric, da: (c.ricchezza || {}).da || `ruolo ${s.ruolo}`, dove: (c.ricchezza || {}).dove || "", nota: `ricchezza: ${s.ricchezza}` },
    ];
    return pezzi;
  }
  const descrTesto = (s) => s.ritratto.descrizione.map((p) => p.t).join(" ") + (s.ritratto.extra ? ` ${s.ritratto.extra}` : "");

  function combattimento(s) {
    if (s.dettaglio === "comparsa") return { combatte: null, nota: "una comparsa non ha i numeri: promuovila a scheda" };
    if (s.eta.fase === "bambino") return { combatte: false, nota: "un bambino non è un bersaglio: non ha blocco di combattimento (Lia Orso, «mai in pericolo reale»)" };
    const f = ADDESTR[s.addestramento || "nessuno"];
    if (f == null) return { combatte: false, nota: "non combatte: scappa, grida, si arrende. La morte è definitiva e non rischia senza motivo (Sistema_PNG §3)." };
    const t = TAGLIA[s.corporatura] || TAGLIA.normale, L = s.livello;
    const vita = Math.round((40 + L * 20) * 1 * t.m), danno = Math.round((10 + L * 6) * 1 * f * 10) / 10;
    return { combatte: true, vita, danno, taglia: t.t, rarita: "Comune", rango: S.rules.powerRank(L),
      formula_vita: `(40 + ${L}×20) × 1 × ${nf(t.m)}`, formula_danno: `(10 + ${L}×6) × 1${f !== 1 ? ` × ${nf(f)} (addestramento)` : ""}` };
  }
  function rigaZona(s) {
    const celle = [s.nome, String(s.livello), s.ruolo, (s.tratti || []).join(", "), s.forestieri || "", (s.puo_dare || []).slice(0, 3).join("; ")];
    return `| ${celle.map((c) => String(c).replace(/\|/g, "/")).join(" | ")} |`;
  }

  /* ---------- CSS ---------- */
  function injectStyle() {
    if (document.getElementById("pn-style")) return;
    const el = document.createElement("style");
    el.id = "pn-style";
    el.textContent = `
      .pn { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
      .pn .scroll-y { max-height: var(--scroll-max, min(60vh, 520px)); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain;
        scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; padding-right: 2px; }
      .pn .scroll-y::-webkit-scrollbar { width: 8px; } .pn .scroll-y::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 999px; }
      .pn-head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; justify-content: space-between; }
      .pn-title { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 700; color: var(--gold); }
      .pn-tabs { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
      .pn-win .win-b { padding: 12px 14px; gap: 10px; }
      .pn-cols { display: grid; gap: 16px; align-items: start; grid-template-columns: minmax(0, 1fr); }
      @media (min-width: 1100px) { .pn-cols { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.25fr); } .pn-cols > .pn-ritr { grid-column: 1 / -1; } }
      @media (min-width: 1360px) { .pn-cols { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.2fr) minmax(0, 0.95fr); } .pn-cols > .pn-ritr { grid-column: auto; } }

      /* Strati */
      .pn-layers { display: grid; gap: 8px 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 130px), 1fr)); }
      .pn-layers .field { gap: 3px; }
      .pn-layers select.input { padding: 6px 8px; font-size: var(--fs-sm); }
      .pn-esempi { display: flex; flex-wrap: wrap; gap: 6px; }
      .pn-esempi button { font-size: var(--fs-xs); padding: 3px 9px; }
      .pn-rit { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 5px 6px; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--panel-2); min-width: 0; }
      .pn-rit input { flex: 1 1 140px; min-width: 0; background: transparent; border: 0; outline: none; padding: 3px 4px; font-size: var(--fs-sm); }
      .pn-rit .chip { color: var(--r-leggendario); }
      .pn-rit .chip button { background: none; border: 0; color: inherit; cursor: pointer; padding: 0 0 0 2px; line-height: 1; }
      .pn-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .pn-actions .seed { margin-left: auto; }
      .pn-msgs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); }
      .pn-msgs li { display: flex; gap: 8px; align-items: baseline; padding: 4px 8px; border-radius: 4px; border-left: 3px solid var(--warn); background: color-mix(in srgb, var(--warn) 8%, transparent); overflow-wrap: anywhere; }
      .pn-msgs li.err { border-left-color: var(--bad); background: color-mix(in srgb, var(--bad) 10%, transparent); }
      .pn-msgs li .chip { flex: none; }

      /* Chip di strato */
      .pn-lc { display: inline-block; font-family: var(--font-mono); font-size: 0.6875rem; line-height: 1.2; padding: 1px 5px; border-radius: 3px;
        border: 1px solid currentColor; white-space: nowrap; color: var(--muted); flex: none; }
      .pn-l-ruolo { color: var(--gold); } .pn-l-eta { color: var(--violet); } .pn-l-razza { color: var(--r-unico); }
      .pn-l-regno { color: var(--r-raro); } .pn-l-ins, .pn-l-zona { color: var(--r-noncomune); } .pn-l-rit { color: var(--r-leggendario); }
      .pn-legend { display: flex; flex-wrap: wrap; gap: 4px; }

      /* Righe compatte: etichetta + valore */
      .pn-rows { display: flex; flex-direction: column; min-width: 0; }
      .pn-r { display: grid; grid-template-columns: minmax(84px, 38%) minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 4px 6px;
        border-bottom: 1px solid var(--line); font-size: var(--fs-sm); border-radius: 3px; }
      .pn-r:last-child { border-bottom: 0; }
      .pn-r[data-pt] { cursor: help; }
      .pn-r[data-pt]:hover, .pn-r[data-pt]:focus-visible { background: var(--panel-2); }
      .pn-r .k { color: var(--muted); overflow-wrap: anywhere; }
      .pn-r .v { overflow-wrap: anywhere; min-width: 0; }
      .pn-r.two { grid-template-columns: minmax(84px, 38%) minmax(0, 1fr); }
      .pn-sec { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .pn-sec + .pn-sec { border-top: 1px solid var(--line-strong); padding-top: 10px; }
      .pn-sec > .label { display: flex; gap: 8px; align-items: center; }
      .pn-sec > .label .spacer { margin-left: auto; }
      .pn-comp.scroll-y { --scroll-max: min(62vh, 560px); }

      /* Barra degli atteggiamenti */
      .pn-att { display: flex; height: 8px; border-radius: 999px; overflow: hidden; border: 1px solid var(--line); cursor: help; }
      .pn-att span { display: block; height: 100%; }
      .pn-att-leg { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: var(--fs-xs); color: var(--muted); }
      .pn-att-leg i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 4px; }

      /* Scheda */
      .pn-id { display: flex; gap: 12px; align-items: center; min-width: 0; }
      .pn-name { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-lg); line-height: 1.2; overflow-wrap: anywhere; }
      .pn-name.todo { color: var(--warn); font-style: italic; }
      .pn-field { display: grid; grid-template-columns: minmax(84px, 30%) minmax(0, 1fr); gap: 8px; align-items: center; padding: 3px 6px; font-size: var(--fs-sm); }
      .pn-field .k { color: var(--muted); display: flex; flex-direction: column; gap: 1px; }
      .pn-field input { width: 100%; min-width: 0; background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; font-size: var(--fs-sm); }
      .pn-field input:focus { border-color: var(--violet); outline: none; box-shadow: 0 0 0 2px var(--violet-soft); }
      .pn-field.todo input { border-style: dashed; border-color: var(--warn); }
      .pn-field .todo-tag { font-size: 0.6875rem; line-height: 1.2; color: var(--warn); }
      .pn-field:not(.todo) .todo-tag { visibility: hidden; height: 0; }
      .pn-list { margin: 0; padding: 0 0 0 16px; font-size: var(--fs-sm); display: flex; flex-direction: column; gap: 1px; }
      .pn-list li { overflow-wrap: anywhere; }
      .pn-list.no { list-style: "✕  "; color: var(--muted); }
      .pn-list.inl { list-style: none; padding: 0; display: block; }
      .pn-list.inl li { display: inline; }
      .pn-list.inl li:not(:last-child)::after { content: " · "; color: var(--muted); }
      .pn-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
      .pn-stat { border: 1px solid var(--line); border-radius: 4px; padding: 4px 6px; text-align: center; background: var(--panel-2); cursor: help; }
      .pn-stat .label { display: block; font-size: 0.6875rem; }
      .pn-stat b { font-family: var(--font-mono); font-size: var(--fs-sm); }
      .pn-stat .alta { color: var(--good); } .pn-stat .bassa { color: var(--bad); }
      .pn-combat { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
      .pn-combat .kv { padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; background: var(--panel-2); cursor: help; }
      .pn-combat .kv .v { font-size: var(--fs-md); }
      .pn-aff { display: inline-flex; align-items: center; gap: 4px; }
      .pn-aff b { min-width: 3ch; text-align: center; font-family: var(--font-mono); }
      .pn-aff .neg { color: var(--bad); } .pn-aff .pos { color: var(--good); }
      .pn-mini-in { display: flex; gap: 6px; }
      .pn-mini-in input { flex: 1; min-width: 0; padding: 4px 8px; font-size: var(--fs-sm); }
      .pn-mini-in .btn { padding: 4px 10px; }
      .pn-note { font-size: var(--fs-xs); color: var(--muted); }
      .pn-riga { font-family: var(--font-mono); font-size: var(--fs-xs); background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; overflow-wrap: anywhere; white-space: pre-wrap; margin: 0; }

      /* Avatar e ritratto */
      .pn-av { --sz: 32px; width: var(--sz); height: var(--sz); border-radius: 50%; overflow: hidden; flex: none; display: inline-block; border: 1px solid var(--line-strong); background: var(--panel-2); }
      .pn-av svg, .pn-av img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .pn-av.ring { box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--gold); border-color: transparent; }
      .pn-drop { position: relative; display: grid; place-items: center; aspect-ratio: 4 / 5; max-height: 340px; width: 100%; border: 1px dashed var(--line-strong); border-radius: var(--radius);
        background: var(--panel-2); overflow: hidden; cursor: pointer; text-align: center; color: var(--muted); font-size: var(--fs-sm); }
      .pn-drop:hover, .pn-drop:focus-visible, .pn-drop.over { border-color: var(--gold); color: var(--fg); box-shadow: 0 0 18px var(--gold-soft); }
      .pn-drop img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      @media (max-width: 560px) { .pn-drop { max-height: 240px; } }
      .pn-win .win-h .pn-hid { text-transform: none; letter-spacing: 0; font-weight: 400; overflow-wrap: anywhere; }
      .pn-drop .ph { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; }
      .pn-drop .ph .pn-av { --sz: 96px; }
      .pn-drop .cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 6px 10px; font-size: var(--fs-xs); background: linear-gradient(transparent, rgba(0,0,0,.75)); color: #fff; text-align: left; }
      .pn-portrait { display: grid; gap: 12px; grid-template-columns: minmax(0, 1fr); }
      @container pnritr (min-width: 520px) { .pn-portrait { grid-template-columns: minmax(0, 220px) minmax(0, 1fr); } }
      .pn-ritr-wrap { container: pnritr / inline-size; min-width: 0; }
      .pn-gal { display: flex; flex-wrap: wrap; gap: 6px; }
      .pn-th { position: relative; width: 56px; height: 70px; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); background: var(--panel-2); }
      .pn-th img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .pn-th.main { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
      .pn-th .ops { position: absolute; inset: auto 0 0 0; display: flex; justify-content: space-between; background: rgba(0,0,0,.65); }
      .pn-th .ops button { background: none; border: 0; color: #fff; cursor: pointer; font-size: 12px; padding: 2px 5px; line-height: 1.2; }
      .pn-th .ops button[aria-pressed="true"] { color: var(--gold); }
      .pn-desc { font-size: var(--fs-sm); line-height: 1.6; background: var(--panel-2); border: 1px solid var(--line); border-radius: 4px; padding: 8px 10px; }
      .pn-desc span[data-pt] { border-bottom: 2px solid var(--lc, var(--line-strong)); cursor: help; border-radius: 1px; }
      .pn-desc span[data-pt]:hover, .pn-desc span[data-pt]:focus-visible { background: color-mix(in srgb, var(--lc) 18%, transparent); }
      .pn-desc .extra { color: var(--r-leggendario); }
      .pn-mood { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
      .pn-ref { position: relative; aspect-ratio: 1; border-radius: 4px; overflow: hidden; border: 1px solid var(--line); cursor: help; display: grid; place-items: center; }
      .pn-ref svg { width: 42%; height: 42%; opacity: .85; color: rgba(255,255,255,.85); }
      .pn-ref img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .pn-ref .tag { position: absolute; left: 3px; bottom: 3px; }
      .pn-ref .tag .pn-lc { background: rgba(0,0,0,.6); }
      .pn-ref .rm { position: absolute; right: 2px; top: 2px; background: rgba(0,0,0,.65); color: #fff; border: 0; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 0 5px; }
      .pn-addref { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .pn-addref select { width: auto; flex: 1 1 140px; padding: 4px 8px; font-size: var(--fs-sm); }
      .pn-tokens { display: flex; gap: 18px; align-items: flex-end; flex-wrap: wrap; }
      .pn-tokens figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
      .pn-tokens figcaption { font-size: var(--fs-xs); color: var(--muted); }
      .pn-board { display: grid; grid-template-columns: repeat(5, 34px); grid-auto-rows: 34px; border: 1px solid var(--line); border-radius: 4px;
        background: repeating-linear-gradient(0deg, transparent 0 33px, var(--line) 33px 34px), repeating-linear-gradient(90deg, transparent 0 33px, var(--line) 33px 34px), var(--panel-2); }
      .pn-board .pn-av { --sz: 30px; margin: 2px; grid-column: 3; grid-row: 2; }
      .pn-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

      /* Liste di PNG (comparse, archivio) */
      .pn-plist { container: pnlist / inline-size; display: flex; flex-direction: column; min-width: 0; }
      .pn-pr { display: grid; gap: 2px 10px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm);
        grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "av who act" "av meta act"; }
      .pn-pr:last-child { border-bottom: 0; }
      .pn-pr:hover { background: var(--panel-2); }
      .pn-pr > .pn-av { grid-area: av; }
      .pn-pr .who { grid-area: who; display: flex; gap: 6px; align-items: baseline; min-width: 0; flex-wrap: wrap; }
      .pn-pr .who b { overflow-wrap: anywhere; }
      .pn-pr .meta { grid-area: meta; display: flex; gap: 4px 8px; flex-wrap: wrap; align-items: center; color: var(--muted); font-size: var(--fs-xs); min-width: 0; }
      .pn-pr .act { grid-area: act; display: flex; gap: 6px; }
      .pn-pr .act .btn { padding: 4px 10px; font-size: var(--fs-xs); }
      .pn-pr.dead { opacity: .65; } .pn-pr.dead b { text-decoration: line-through; text-decoration-color: var(--bad); }
      .pn-plist.scroll-y { --scroll-max: min(60vh, 560px); }
      .pn-tools { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: flex-end; }
      .pn-tools .field { flex: 1 1 160px; gap: 3px; }
      .pn-tools .field.narrow { flex: 0 1 110px; }
      .pn-tools .input { padding: 6px 8px; font-size: var(--fs-sm); }
      .pn-badge-comparsa { color: var(--muted); } .pn-badge-scheda { color: var(--violet); } .pn-badge-completa { color: var(--gold); }

      /* Preset */
      .pn-matrix-wrap { container: pnmx / inline-size; min-width: 0; }
      .pn-matrix { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); table-layout: fixed; }
      .pn-matrix th, .pn-matrix td { padding: 5px 4px; border-bottom: 1px solid var(--line); text-align: center; overflow-wrap: anywhere; }
      .pn-matrix th { font-family: var(--font-display); font-size: var(--fs-xs); color: var(--muted); font-weight: 600; letter-spacing: .04em; }
      .pn-matrix th:first-child, .pn-matrix td:first-child { text-align: left; width: 24%; }
      .pn-matrix td:first-child button { background: none; border: 0; color: var(--fg); cursor: pointer; font-family: var(--font-display); font-weight: 600; padding: 2px 0; text-align: left; }
      .pn-matrix td:first-child button:hover, .pn-matrix td:first-child button[aria-pressed="true"] { color: var(--gold); }
      .pn-cell { display: inline-block; width: 18px; height: 18px; border-radius: 4px; line-height: 18px; font-size: 11px; font-family: var(--font-mono); cursor: help; }
      .pn-cell.eredita { color: var(--muted); } .pn-cell.variante { background: var(--violet-soft); color: var(--violet); border: 1px solid var(--violet); }
      .pn-cell.motivo { background: color-mix(in srgb, var(--warn) 15%, transparent); color: var(--warn); border: 1px solid var(--warn); }
      .pn-mx-list { display: none; }
      @container pnmx (max-width: 560px) { .pn-matrix { display: none; } .pn-mx-list { display: flex; } }
      .pn-mx-list { flex-direction: column; }
      .pn-mx-list > div { display: flex; flex-direction: column; gap: 4px; padding: 6px 4px; border-bottom: 1px solid var(--line); }
      .pn-mx-list .races { display: flex; flex-wrap: wrap; gap: 4px; }
      .pn-cmp { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
      .pn-cmp-card { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .pn-cmp-card h4 { font-size: var(--fs-md); display: flex; gap: 6px; align-items: center; }
      .pn-diff { font-size: var(--fs-sm); display: grid; grid-template-columns: minmax(70px, 35%) minmax(0, 1fr); gap: 6px; padding: 2px 0; cursor: help; }
      .pn-diff > span { min-width: 0; overflow-wrap: anywhere; }
      .pn-diff .old { color: var(--muted); text-decoration: line-through; } .pn-diff .new { color: var(--fg); }
      .pn-diff .add { color: var(--good); }
      .pn-cmp.scroll-y { --scroll-max: min(60vh, 620px); }

      /* Controlla */
      .pn-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .pn-checks li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--line); font-size: var(--fs-sm); cursor: help; }
      .pn-checks li:last-child { border-bottom: 0; }
      .pn-checks li:hover, .pn-checks li:focus-visible { background: var(--panel-2); }
      .pn-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: var(--on-accent); }
      .pn-dot.passa { background: var(--good); } .pn-dot.avviso { background: var(--warn); } .pn-dot.motivo { background: var(--violet); } .pn-dot.fallisce { background: var(--bad); }
      .pn-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .pn-kpis .kv { padding: 8px 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); }
      @media (max-width: 560px) { .pn-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pn-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

      #pn-tip { position: fixed; z-index: 40; left: 0; top: 0; width: max-content; max-width: min(320px, calc(100vw - 16px));
        display: flex; flex-direction: column; gap: 3px; padding: 9px 11px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius);
        box-shadow: 0 10px 28px var(--violet-soft), 0 0 0 1px var(--panel); font-size: var(--fs-xs); line-height: 1.45;
        pointer-events: none; visibility: hidden; opacity: 0; transition: opacity .1s; overflow-wrap: anywhere; }
      #pn-tip.on { visibility: visible; opacity: 1; }
      #pn-tip .tn { font-family: var(--font-display); font-size: var(--fs-sm); font-weight: 700; }
      #pn-tip .mono { color: var(--muted); }
      #pn-tip .good { color: var(--good); } #pn-tip .warn { color: var(--warn); } #pn-tip .bad { color: var(--bad); } #pn-tip .gold { color: var(--gold); }
      #pn-tip .sep { border-top: 1px solid var(--line); margin: 2px 0; }
    `;
    document.head.appendChild(el);
  }

  /* ---------- Tooltip standard di un valore composto ---------- */
  function campoTip(nome, c) {
    return tip(`<span class="tn">${esc(nome)}</span>
      <span>${layerChip(c.da)} deciso da <b>${esc(c.da)}</b></span>
      <span class="mono">${esc(c.dove || "")}</span>
      ${c.nota ? `<span>${notaHtml(c.nota)}</span>` : ""}
      ${c.prima != null ? `<span class="sep"></span><span class="muted">prima (strato sotto): ${esc(fmtVal(c.prima))}</span>` : ""}`);
  }

  /* ================= 1. NUOVO PNG ================= */
  const CAMPI_LABEL = {
    livello: "Livello", anni: "Anni", longevita: "Longevità", corporatura: "Corporatura", addestramento: "Addestramento",
    "profilo.STR": "Profilo STR", "profilo.DEX": "Profilo DEX", "profilo.VIT": "Profilo VIT", "profilo.INT": "Profilo INT",
    "mestiere.nome": "Mestiere", "mestiere.grado": "Grado", ricchezza: "Ricchezza", conta: "Conta", giornata: "Giornata", voce: "Voce", note: "Note",
    moneta: "Moneta", conta_nel_regno: "Conta nel regno", voci_girano: "Le voci girano", affinita_iniziale: "Affinità iniziale",
  };
  const ELENCHI_LABEL = { vuole: "Vuole", teme: "Teme", difetto: "Difetto", forestieri: "Forestieri", prezzo: "Prezzo", vita: "Vita", tratti: "Tratti", intercalare: "Intercalare", dove: "Dove sta", sa: "Sa", dicerie: "Dicerie", puo_dare: "Può dare", no_tipici: "No tipici", malizia: "Malizia" };

  function stratiHtml(g) {
    const c = D().catalogo;
    const opt = (arr, v) => arr.map((x) => `<option value="${esc(x.id)}" ${x.id === v ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
    const sel = st.sel;
    const zone = c.zone.filter((z) => z.regno === sel.regno);
    const errs = g.checks.err, avv = g.checks.avv;
    const ESEMPI = [
      ["fabbro-ac", "Fabbro di Alba Chiara"], ["bambino", "Bambino"], ["elfo", "Elfa anziana (rara)"], ["goblin", "Goblin dentro le mura"], ["nano", "Fabbro nano, Frostland"], ["hald", "Sergente Hald"],
    ];
    const field = (id, label, inner, tipTxt) => `<div class="field" ${tip(tipTxt)}><label class="label" for="pn-${id}">${label}</label>${inner}</div>`;
    return S.ui.win("Strati del preset", `
      <div class="pn-esempi" aria-label="Esempi rapidi"><span class="label" style="align-self:center">Esempi</span>${ESEMPI.map(([k, t]) => `<button type="button" class="btn ghost" data-esempio="${k}">${esc(t)}</button>`).join("")}</div>
      <div class="pn-layers">
        ${field("ruolo", "Ruolo", `<select class="input" id="pn-ruolo" data-sel="ruolo">${opt(c.ruoli, sel.ruolo)}</select>`, `<span class="tn">Ruolo</span><span>Il mestiere: fascia di livello, numeri, rose di vuole/teme, che cosa può dare.</span><span class="mono">preset/ruoli/*.yaml</span>`)}
        ${field("eta", "Età", `<select class="input" id="pn-eta" data-sel="eta">${opt(c.eta, sel.eta)}</select>`, `<span class="tn">Età</span><span>Sposta corporatura, addestramento e rose. Un bambino non è un bersaglio.</span><span class="mono">preset/eta/*.yaml</span>`)}
        ${field("razza", "Razza", `<select class="input" id="pn-razza" data-sel="razza">${opt(c.razze, sel.razza)}</select>`, `<span class="tn">Razza</span><span>Segni, longevità, tratti; può avere una variante del ruolo (anche una che dice di no).</span><span class="mono">preset/razze/*.yaml</span>`)}
        ${field("regno", "Regno", `<select class="input" id="pn-regno" data-sel="regno">${opt(c.regni, sel.regno)}</select>`, `<span class="tn">Regno</span><span>Moneta, che cosa conta, stile dei nomi, popoli (sotto 10 su cento una razza è rara).</span><span class="mono">preset/luoghi/regni.yaml</span>`)}
        ${field("ins", "Insediamento", `<select class="input" id="pn-ins" data-sel="ins" ${sel.zona ? "disabled" : ""}>${opt(c.insediamenti, sel.ins)}</select>`, `<span class="tn">Insediamento</span><span>Sceglie la fascia di livello del ruolo e quanto in fretta gira una voce.</span><span class="mono">preset/luoghi/insediamenti.yaml</span>`)}
        ${field("zona", "Zona", `<select class="input" id="pn-zona" data-sel="zona"><option value="">— nessuna —</option>${opt(zone, sel.zona)}</select>`, `<span class="tn">Zona</span><span>Canone locale: vince sui preset per tutto ciò che nomina (prezzi, affinità iniziale, nomi già usati).</span><span class="mono">preset/luoghi/zone.yaml</span>`)}
      </div>
      <div class="field"><label class="label" for="pn-rit-in">Ritocchi</label>
        <div class="pn-rit">${st.ritocchi.map((r, i) => `<span class="chip">${esc(r)}<button type="button" data-rit-del="${i}" aria-label="Togli il ritocco ${esc(r)}">×</button></span>`).join("")}
          <input id="pn-rit-in" placeholder="${st.ritocchi.length ? "altro ritocco…" : "es. «ex soldato», «livello 61» — Invio per aggiungere"}" autocomplete="off"></div>
        <span class="hint">Un ritocco vince su ogni strato. «livello N» fissa il livello; ogni altro ritocco vale come motivo.</span>
      </div>
      ${errs.length || avv.length ? `<ul class="pn-msgs" aria-label="Errori e avvisi">
        ${errs.map((e) => `<li class="err"><span class="chip bad">errore</span><span>${esc(e)}</span></li>`).join("")}
        ${avv.map((a) => `<li><span class="chip warn">avviso</span><span>${esc(a)}</span></li>`).join("")}</ul>` : `<p class="hint good">Nessun errore, nessun avviso.</p>`}
      <div class="pn-actions">
        <button type="button" class="btn" data-act="rigenera" ${tip(`<span class="tn">Rigenera</span><span>Nuovo seme: ripesca nome, livello, anni e i sette campi dalle rose. Gli strati e i ritocchi restano.</span>`)}>↻ Rigenera</button>
        <button type="button" class="btn primary" data-act="salva" ${errs.length ? "disabled" : ""} ${tip(errs.length ? `<span class="bad">Non si salva: c'è un errore da risolvere.</span><span>${esc(errs[0])}</span>` : `<span>Salva nell'archivio di ${esc(sel.zona || sel.regno)} come bozza.</span>`)}>Salva come bozza</button>
        <button type="button" class="btn" data-act="promuovi" ${errs.length || (st.scheda && st.scheda.dettaglio === "completa") ? "disabled" : ""}>Promuovi a completa</button>
        <button type="button" class="btn ghost" data-act="riga" ${errs.length ? "disabled" : ""}>Copia riga di zona</button>
        <span class="seed small muted mono" ${tip(`<span>Stesso seme e stessi strati → stessa scheda.</span>`)}>seme ${st.seme}</span>
      </div>`, { cls: "pn-win", gold: true });
  }

  function componiHtml(g) {
    const comp = g.comp;
    const campi = { ...comp.campi };
    const lvR = ritoccoLivello();
    const f = fascia(st.sel);
    if (f) campi.livello = { ...(campi.livello || {}), valore: f, da: `ruolo ${st.sel.ruolo} (${st.sel.ins})`, dove: `preset/ruoli/${st.sel.ruolo}.yaml:5` };
    if (lvR != null) campi.livello = { valore: lvR, da: `ritocco «livello ${lvR}»`, dove: "ritocchi", nota: f && (lvR < f[0] || lvR > f[1]) ? `sfonda la fascia ${f[0]}-${f[1]}: avvisa e obbedisce` : "", prima: f };
    const order = ["livello", "anni", "longevita", "corporatura", "addestramento", "profilo.STR", "profilo.DEX", "profilo.VIT", "profilo.INT", "mestiere.nome", "mestiere.grado", "ricchezza", "conta", "giornata", "voce", "moneta", "conta_nel_regno", "voci_girano", "affinita_iniziale", "note"];
    const rows = order.filter((k) => campi[k]).map((k) => {
      const c = campi[k];
      return `<div class="pn-r" tabindex="0" ${campoTip(CAMPI_LABEL[k] || k, c)}><span class="k">${esc(CAMPI_LABEL[k] || k)}</span><span class="v">${esc(fmtVal(c.valore))}</span>${layerChip(c.da)}</div>`;
    }).join("");
    const el = comp.elenchi || {};
    const rose = Object.keys(el).map((k) => {
      const voci = el[k];
      const per = {};
      voci.forEach((v) => { const l = layer(v.da).k; per[l] = (per[l] || 0) + 1; });
      const t = tip(`<span class="tn">${esc(ELENCHI_LABEL[k] || k)} · ${voci.length} voci</span>${voci.slice(0, 12).map((v) => `<span>${layerChip(v.da)} ${esc(v.voce)}</span>`).join("")}${voci.length > 12 ? `<span class="muted">… e altre ${voci.length - 12}</span>` : ""}<span class="mono">${esc(voci[0] ? voci[0].dove : "")}</span>`);
      return `<div class="pn-r" tabindex="0" ${t}><span class="k">${esc(ELENCHI_LABEL[k] || k)}</span><span class="v">${voci.length} voci</span><span>${Object.keys(per).map((l) => `<span class="pn-lc pn-l-${l}">${per[l]}</span>`).join(" ")}</span></div>`;
    }).join("");
    const att = comp.atteggiamento || { frequenze: {} };
    const tot = Object.values(att.frequenze).reduce((a, b) => a + b, 0) || 1;
    const attTip = tip(`<span class="tn">Atteggiamento verso il forestiero</span>${ATT.map((a) => `<span>${esc(a.t)}: <b>${att.frequenze[a.k] || 0}%</b></span>`).join("")}<span class="sep"></span>${(att.storia || []).map((s) => `<span>${layerChip(s.da)} ${esc(s.da)} <span class="mono">${esc(s.dove)}</span></span>${s.nota ? `<span>${notaHtml(s.nota)}</span>` : ""}${s.sposta ? `<span class="muted">sposta: ${esc(Object.entries(s.sposta).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", "))}</span>` : ""}`).join("")}`);
    const strati = comp.strati;
    return S.ui.win("Componi", `
      <p class="pn-note">Lo stampo composto: ogni valore porta lo strato che l'ha deciso. Passa sopra (o col tasto Tab) per file:riga e FONTE/PROPOSTA.</p>
      ${g.esatto || !comp._da ? "" : `<p class="hint">Mockup: anteprima costruita dall'esempio reale più vicino (${esc(comp._da.ruolo)} · ${esc(comp._da.eta)} · ${esc(comp._da.razza)}), riscritto sugli strati scelti.</p>`}
      <div class="pn-legend">${[["ruolo", "ruolo"], ["eta", "età"], ["razza", "razza"], ["regno", "regno"], ["zona", "luogo"], ["rit", "ritocco"], ["reg", "regole"]].map(([k, t]) => `<span class="pn-lc pn-l-${k}">${t}</span>`).join("")}</div>
      <div class="pn-comp scroll-y">
        <div class="pn-sec"><span class="label">Atteggiamento iniziale</span>
          <div class="pn-att" tabindex="0" ${attTip} aria-label="Frequenze degli atteggiamenti">${ATT.map((a) => `<span style="width:${((att.frequenze[a.k] || 0) / tot) * 100}%;background:${a.c}"></span>`).join("")}</div>
          <div class="pn-att-leg">${ATT.map((a) => `<span><i style="background:${a.c}"></i>${esc(a.t)} ${att.frequenze[a.k] || 0}</span>`).join("")}</div>
        </div>
        <div class="pn-sec"><span class="label">Valori</span><div class="pn-rows">${rows}</div></div>
        <div class="pn-sec"><span class="label">Rose da cui si pesca</span><div class="pn-rows">${rose}</div></div>
        ${(comp.canone || []).length ? `<div class="pn-sec"><span class="label">Canone</span><p class="small">${esc(comp.canone.join(", "))}</p></div>` : ""}
      </div>`, { cls: "pn-win" });
  }

  function schedaHtml(g) {
    const s = st.scheda;
    const o = s.origine || {};
    const todo = new Set(s.da_ritoccare || []);
    const scritto = s._scritto || {};
    const row = (k, v, src) => `<div class="pn-r two" ${src ? `tabindex="0" ${tip(`<span class="tn">${esc(k)}</span><span>${esc(src)}</span>`)}` : ""}><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
    const sette = [["vuole", "Vuole"], ["teme", "Teme"], ["difetto", "Difetto"], ["forestieri", "Forestieri"], ["prezzo", "Prezzo"], ["vita", "Vita"], ["contraddizione", "Contraddizione"]];
    const setteHtml = sette.map(([k, t]) => {
      const isTodo = todo.has(k) && !scritto[k];
      const val = s[k] || "";
      const ph = k === "contraddizione" ? (s.contraddizione_spunto || "") : "";
      return `<label class="pn-field ${isTodo ? "todo" : ""}" ${tip(`<span class="tn">${esc(t)}</span><span>${esc(o[k] || (k === "contraddizione" ? "non si pesca: si scrive sulla persona" : "scritto a mano"))}</span>${isTodo ? `<span class="warn">spunto: da riscrivere sul posto</span>` : ""}`)}>
        <span class="k">${esc(t)}<span class="todo-tag">da riscrivere sul posto</span></span>
        <input data-sette="${k}" value="${esc(val)}" placeholder="${esc(ph)}" aria-label="${esc(t)}"></label>`;
    }).join("");
    const lvTip = `${o.livello || ""}${s.motivo ? ` · motivo: ${s.motivo}` : ""}`;
    const eta = s.eta;
    const vera = eta.vera !== eta.apparente ? ` <span class="muted">(vera ${eta.vera})</span>` : "";
    const stats = Object.entries(s.profilo || {}).map(([k, v]) => `<div class="pn-stat" tabindex="0" ${tip(`<span class="tn">${k}: ${esc(v)}</span><span>${esc((o.profilo || "").split(", ").find((x) => x.startsWith(k)) || "")}</span><span class="mono">bassa ×0,6 · media ×1 · alta ×1,5 del valore automatico di pari livello (regole.yaml:21, PROPOSTA)</span>`)}><span class="label">${k}</span><b class="${esc(v)}">${esc(v)}</b></div>`).join("");
    let combat = "";
    if (st.combat) {
      const cb = combattimento(s);
      combat = cb.combatte ? `<div class="pn-combat anim-in">
          <div class="kv" tabindex="0" ${tip(`<span class="tn">Vita</span><span class="mono">${esc(cb.formula_vita)}</span><span>(40 + Lv×20) × rarità × taglia ${esc(cb.taglia)}</span><span class="muted">Calcolata ora, mai salvata.</span>`)}><span class="label">Vita</span><span class="v" style="color:var(--hp)">${nf(cb.vita)}</span></div>
          <div class="kv" tabindex="0" ${tip(`<span class="tn">Danno</span><span class="mono">${esc(cb.formula_danno)}</span><span class="muted">Calcolato ora, mai salvato.</span>`)}><span class="label">Danno</span><span class="v">${nf(cb.danno)}</span></div>
          <div class="kv" tabindex="0" ${tip(`<span>Taglia dalla corporatura «${esc(s.corporatura)}» (Combat.txt)</span>`)}><span class="label">Taglia</span><span class="v small">${esc(cb.taglia)}</span></div>
          <div class="kv" tabindex="0" ${tip(`<span>Scala di potere per livello ${s.livello}</span>`)}><span class="label">Rango</span><span class="v small">${esc(cb.rango)}</span></div>
        </div>` : `<div class="sysmsg anim-in"><span class="tag">[SISTEMA]</span><span>${esc(cb.nota)}</span></div>`;
    }
    const aff = s.stato.affinita;
    const att = s.stato.atteggiamento;
    const nomeTodo = /^\[/.test(s.nome);
    return S.ui.win("Scheda semplificata", `
      <div class="pn-id">${avatar(s, 48, "ring")}
        <div class="stack" style="gap:2px;min-width:0">
          <span class="pn-name ${nomeTodo ? "todo" : ""}">${esc(s.nome)}</span>
          <span class="row small" style="gap:6px"><span class="chip pn-badge-${s.dettaglio}">${esc(s.dettaglio)}</span>${st.salvata ? `<span class="chip good">bozza salvata</span>` : ""}<span class="chip ${ATT_CHIP[att] || "muted"}">${esc(att.replace("_", " "))}</span></span>
        </div></div>
      <div class="pn-sec"><span class="label">Chi è</span><div class="pn-rows">
        ${row("Livello", `<b class="num">${s.livello}</b>`, lvTip)}
        ${row("Ruolo", esc(nomeRuolo(s.ruolo)) + (s.mestiere ? ` <span class="muted">· ${esc(s.mestiere.nome)} ${esc(s.mestiere.grado)}</span>` : ""), o.mestiere || `ruolo ${s.ruolo}`)}
        ${row("Razza", esc(nomeRazza(s.razza)) + (s.segni.length ? ` <span class="muted">· ${esc(s.segni[0])}</span>` : ""), `razza ${s.razza}`)}
        ${row("Età", `${eta.apparente} anni${vera} <span class="muted">· ${esc(eta.fase)}</span>`, `${o.anni || `età ${eta.fase}`}${eta.vera !== eta.apparente ? ` · anni veri = apparenti × longevità` : ""}`)}
        ${row("Luogo", esc(s.luogo), "strati regno + insediamento/zona")}
        ${row("Conta", esc(s.conta), o.conta || "")}
        ${row("Tratti", esc((s.tratti || []).join(", ")), o.tratti || "")}
        ${s.motivo ? row("Motivo", esc(s.motivo), "dal ritocco: giustifica un livello nel terzo alto o una variante che dice di no") : ""}
        ${"perche_qui" in s ? row("Perché è qui", esc(s.perche_qui || "da scrivere"), "razza rara nel luogo: la scheda deve dire perché è lì") : ""}
      </div></div>
      <div class="pn-sec"><span class="label">I sette campi <span class="spacer"></span><span class="pn-note" style="text-transform:none;letter-spacing:0">tratteggiati: spunti da riscrivere sul posto</span></span>${setteHtml}</div>
      <div class="pn-sec"><span class="label">Come parla e che cosa può dare</span>
        <div class="pn-rows">${row("Voce", esc(s.voce), o.voce || "")}</div>
        <div class="pn-r two"><span class="k">Sa</span><ul class="pn-list inl">${(s.sa || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="pn-r two"><span class="k">Dicerie</span><ul class="pn-list inl">${(s.dicerie || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div class="pn-r two"><span class="k">Può dare</span><ul class="pn-list">${(s.puo_dare || []).map((x) => `<li>${esc(x)}</li>`).join("") || "<li class='muted'>niente</li>"}</ul></div>
        <div class="pn-r two"><span class="k">No tipici</span><ul class="pn-list no">${(s.no_tipici || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      <div class="pn-sec"><span class="label">Numeri <span class="spacer"></span><span class="pn-note" style="text-transform:none;letter-spacing:0">solo gli ingressi: Vita e danno si calcolano</span></span>
        <div class="pn-rows">
          ${row("Corporatura", esc(s.corporatura), o.corporatura || "")}
          ${row("Addestramento", esc(s.addestramento), o.addestramento || "")}
          ${row("Ricchezza", esc(s.ricchezza), "")}
        </div>
        <div class="pn-stats">${stats}</div>
        <div class="row"><button type="button" class="btn" data-act="combat" aria-expanded="${st.combat}">${st.combat ? "Nascondi combattimento" : "Calcola combattimento"}</button></div>
        ${combat}
      </div>
      ${s.dettaglio === "completa" ? `<div class="pn-sec"><span class="label">Scheda completa</span>
        <label class="pn-field"><span class="k">Segreto</span><input placeholder="che cosa non dice a nessuno"></label>
        <label class="pn-field"><span class="k">Gancio</span><input placeholder="come entra nella storia del gruppo"></label></div>` : ""}
      <div class="pn-sec"><span class="label">Stato per partita</span>
        <div class="pn-r two"><span class="k" ${tip(`<span class="tn">Affinità</span><span>da -10 a +10, verso il gruppo. Parte da ${(s.stato_iniziale || {}).affinita ?? -1}: ${esc((g.comp.campi.affinita_iniziale || {}).nota || "un forestiero parte da -1")}</span>`)} tabindex="0">Affinità</span>
          <span class="pn-aff"><button type="button" class="btn icon" data-aff="-1" aria-label="Affinità meno uno" ${aff <= -10 ? "disabled" : ""}>−</button><b class="${aff < 0 ? "neg" : aff > 0 ? "pos" : ""}" aria-live="polite">${aff > 0 ? "+" : ""}${aff}</b><button type="button" class="btn icon" data-aff="1" aria-label="Affinità più uno" ${aff >= 10 ? "disabled" : ""}>+</button></span></div>
        <div class="pn-r two"><span class="k">Memoria</span><div class="stack" style="gap:4px">${s.stato.memoria.length ? `<ul class="pn-list">${s.stato.memoria.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : `<span class="muted small">niente ancora</span>`}
          <div class="pn-mini-in"><input class="input" id="pn-mem-in" placeholder="che cosa ricorda del gruppo"><button type="button" class="btn" data-add="memoria">+</button></div></div></div>
        <div class="pn-r two"><span class="k">Legami</span><div class="stack" style="gap:4px">${s.stato.legami.length ? `<ul class="pn-list">${s.stato.legami.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : `<span class="muted small">nessuno</span>`}
          <div class="pn-mini-in"><input class="input" id="pn-leg-in" placeholder="es. figlia di Bram Ferraguto"><button type="button" class="btn" data-add="legami">+</button></div></div></div>
      </div>`, { cls: "pn-win", right: `<span class="xs muted mono pn-hid">${esc(s.id)}</span>` });
  }

  const MOTIVI = {
    forgia: `<path d="M3 9h15v3h-4l2 5H6l2-5H3z" fill="currentColor"/>`,
    barba: `<path d="M7 5h10v4c0 6-3 10-5 10s-5-4-5-10z" fill="currentColor"/>`,
    occhi: `<path d="M2 12c4-6 16-6 20 0-4 6-16 6-20 0z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
    corona: `<path d="M3 17l2-9 4 4 3-6 3 6 4-4 2 9z" fill="currentColor"/>`,
    piazza: `<path d="M3 20v-8l5-4 5 4v8zM13 20v-6l4-3 4 3v6z" fill="currentColor"/>`,
    rughe: `<path d="M5 8q7-3 14 0M5 12q7-3 14 0M5 16q7-3 14 0" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    lancia: `<path d="M12 2l2.5 5H13v15h-2V7H9.5z" fill="currentColor"/>`,
  };

  function ritrattoHtml() {
    const s = st.scheda;
    const pr = portraits[s.id] || { imgs: [], main: null };
    const main = pr.imgs.find((x) => x.id === pr.main);
    const LC = { ruolo: "var(--gold)", eta: "var(--violet)", razza: "var(--r-unico)", regno: "var(--r-raro)", zona: "var(--r-noncomune)", ins: "var(--r-noncomune)", rit: "var(--r-leggendario)", reg: "var(--muted)" };
    const pezzi = s.ritratto.descrizione.map((p) => `<span tabindex="0" style="--lc:${LC[layer(p.da).k]}" ${tip(`<span>${layerChip(p.da)} da <b>${esc(p.da)}</b></span><span class="mono">${esc(p.dove || "")}</span>${p.nota ? `<span>${esc(p.nota)}</span>` : ""}`)}>${esc(p.t)}</span>`).join(" ");
    const sel = st.sel;
    const strati = [`ruolo ${sel.ruolo}`, `età ${sel.eta}`, `razza ${sel.razza}`, `regno ${sel.regno}`, ...(sel.zona ? [`zona ${sel.zona}`] : [])];
    const refs = [...D().riferimenti, ...userRefs].filter((r) => strati.includes(r.strato));
    const mood = refs.map((r) => `<div class="pn-ref" tabindex="0" style="background:linear-gradient(135deg, ${r.tinta ? r.tinta[0] : "#2a3150"}, ${r.tinta ? r.tinta[1] : "#8f6ff2"})" ${tip(`<span class="tn">${esc(r.titolo)}</span><span>${layerChip(r.strato)} riferimento dello strato <b>${esc(r.strato)}</b></span><span class="muted">Vale per ogni PNG composto con questo strato: è un'idea di stile, non la persona.</span>`)}>
        ${r.url ? `<img src="${r.url}" alt="">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${MOTIVI[r.motivo] || MOTIVI.piazza}</svg>`}
        <span class="tag">${layerChip(r.strato)}</span>
        ${r.url ? `<button type="button" class="rm" data-ref-del="${r.id}" aria-label="Togli il riferimento ${esc(r.titolo)}">×</button>` : ""}
        <span class="pn-sr">${esc(r.titolo)}</span></div>`).join("");
    const tokenP = { id: s.id, nome: s.nome, ruolo: s.ruolo, razza: s.razza, eta: s.eta };
    return S.ui.win("Ritratto e immagini", `<div class="pn-ritr-wrap"><div class="pn-portrait">
      <div class="stack" style="gap:8px">
        <input type="file" id="pn-file" accept="image/*" multiple hidden>
        <div class="pn-drop" role="button" tabindex="0" data-act="pick" aria-label="${main ? "Cambia ritratto: scegli un'immagine o trascinala qui" : "Aggiungi ritratto: scegli un'immagine o trascinala qui"}">
          ${main ? `<img src="${main.url}" alt="Ritratto principale di ${esc(s.nome)}"><span class="cap">${esc(main.name)} · principale</span>`
            : `<span class="ph">${avatar(tokenP, 96)}<span><b>Trascina qui un'immagine</b><br>o fai clic per sceglierla dal disco</span><span class="xs">resta su questo computer: nessun caricamento</span></span>`}
        </div>
        ${pr.imgs.length ? `<div class="pn-gal" aria-label="Alternative">${pr.imgs.map((im) => `<div class="pn-th ${im.id === pr.main ? "main" : ""}"><img src="${im.url}" alt="${esc(im.name)}">
            <div class="ops"><button type="button" data-img-main="${im.id}" aria-pressed="${im.id === pr.main}" aria-label="Usa ${esc(im.name)} come principale" title="Principale">★</button><button type="button" data-img-del="${im.id}" aria-label="Togli ${esc(im.name)}" title="Togli">×</button></div></div>`).join("")}
            <button type="button" class="pn-th btn ghost" data-act="pick" aria-label="Aggiungi un'alternativa" style="display:grid;place-items:center">＋</button></div>` : ""}
        <div class="stack" style="gap:4px"><span class="label">Gettone sulla plancia</span>
          <div class="pn-tokens">
            <figure>${avatar(tokenP, 64, "ring")}<figcaption>64 px · scheda</figcaption></figure>
            <figure>${avatar(tokenP, 32, "ring")}<figcaption>32 px · lista</figcaption></figure>
            <figure><div class="pn-board" aria-hidden="true">${avatar(tokenP, 30, "ring")}</div><figcaption>casella della plancia</figcaption></figure>
          </div></div>
      </div>
      <div class="stack" style="gap:12px;min-width:0">
        <div class="stack" style="gap:6px"><div class="row" style="justify-content:space-between"><span class="label">Descrizione per il ritratto</span><button type="button" class="btn" data-act="copia-desc">Copia</button></div>
          <p class="pn-desc">${pezzi}${s.ritratto.extra ? ` <span class="extra">${esc(s.ritratto.extra)}</span>` : ""}</p>
          <div class="pn-mini-in"><input class="input" id="pn-desc-extra" placeholder="aggiunta del master (luce, posa, stile…)" value=""><button type="button" class="btn" data-act="desc-extra">Aggiungi</button></div>
          <span class="hint">Composta dagli strati: incollala in un generatore di immagini esterno. Passa sopra un pezzo per vedere da dove arriva.</span>
        </div>
        <div class="stack" style="gap:6px"><span class="label">Riferimenti dei preset</span>
          ${refs.length ? `<div class="pn-mood">${mood}</div>` : `<p class="small muted">Nessun riferimento sugli strati scelti.</p>`}
          <div class="pn-addref"><select class="input" id="pn-ref-strato" aria-label="Strato a cui attaccare il riferimento">${strati.map((x) => `<option>${esc(x)}</option>`).join("")}</select>
            <input type="file" id="pn-ref-file" accept="image/*" hidden><button type="button" class="btn" data-act="ref-pick">＋ Riferimento allo strato</button></div>
        </div>
      </div>
    </div></div>`, { cls: "pn-win pn-ritr" });
  }

  function nuovoHtml() {
    if (!st.scheda) rigenera(false);
    const g = st._g;
    if (!st.scheda.ritratto) st.scheda.ritratto = { descrizione: [], immagini: [] };
    return `${stratiHtml(g)}
      <div class="pn-cols">${componiHtml(g)}${g.checks.err.length ? bloccata(g) : schedaHtml(g)}${g.checks.err.length ? "" : ritrattoHtml()}</div>`;
  }
  function bloccata(g) {
    return S.ui.win("Scheda semplificata", `<div class="sysmsg"><span class="tag">[SISTEMA]</span><span>La composizione dice di no: la scheda non esce.</span>${g.checks.err.map((e) => `<span>${esc(e)}</span>`).join("")}</div>
      <p class="small">Aggiungi un ritocco con il motivo (es. «porta messaggi da Silverleaf al tempio») oppure cambia razza o luogo.</p>
      <div class="row"><button type="button" class="btn" data-motivo="porta messaggi da Silverleaf al tempio">Usa motivo d'esempio</button></div>`, { cls: "pn-win" });
  }
  function rigenera(newSeed) {
    if (newSeed) st.seme = 1 + Math.floor(Math.random() * 999);
    const g = genera();
    st._g = g;
    st.scheda = g.s;
    st.combat = false;
    st.salvata = false;
  }

  /* ================= 2. COMPARSE ================= */
  function comparseRighe() {
    const base = D().esempi.comparse.comparse;
    const out = [];
    const r = rng(st.comp.seme);
    const ruoli = ["cittadino", "contadino", "guardia", "mercante_ambulante", "cittadino", "viaggiatore"];
    const tratti = ["stanco", "pratico", "chiacchierone", "diffidente", "curioso", "burbero"];
    const atts = ["indifferente", "diffidente", "interessato", "indifferente", "ostile", "ben_disposto"];
    for (let i = 0; i < st.comp.n; i++) {
      if (i < base.length && st.comp.seme === 42) { out.push(clone(base[i])); continue; }
      const g = r() < 0.5 ? "m" : "f";
      const ruolo = pick(r, ruoli);
      const f = (D().catalogo.ruoli.find((x) => x.id === ruolo).fasce.villaggio) || [5, 20];
      const nome = `${pick(r, NOMI_VALERIA[g])}${r() < 0.6 ? " " + pick(r, NOMI_VALERIA.cognomi) : ""}`;
      out.push({ dettaglio: "comparsa", id: `alba-chiara/${nome.toLowerCase().replace(/\s+/g, "-")}-${i}`, nome, genere: g, ruolo, razza: r() < 0.92 ? "umano" : "halfling", eta: r() < 0.15 ? "anziano" : "adulto",
        livello: f[0] + Math.floor(r() * (f[1] - f[0] + 1)), tratto: pick(r, tratti), atteggiamento: pick(r, atts), voce: "" });
    }
    return out;
  }
  function comparseHtml() {
    if (!st.comp.righe) st.comp.righe = comparseRighe();
    const rows = st.comp.righe.map((c, i) => `<div class="pn-pr">${avatar(c, 34)}
        <div class="who"><b>${esc(c.nome)}</b><span class="xs muted">Lv <span class="num">${c.livello}</span></span></div>
        <div class="meta"><span>${esc(nomeRuolo(c.ruolo))}</span><span>· ${esc(nomeRazza(c.razza))}</span><span ${tip(`<span class="tn">${esc(c.nome)}</span><span>tratto: ${esc(c.tratto)}${c.difetto ? ` · difetto: ${esc(c.difetto)}` : ""}</span>${c.voce ? `<span>voce: ${esc(c.voce)}</span>` : ""}<span class="mono">seme ${esc((c.provenienza || {}).seme ?? st.comp.seme)}</span>`)} tabindex="0">· ${esc(c.tratto)}</span>
          <span class="chip ${ATT_CHIP[c.atteggiamento] || "muted"}">${esc(c.atteggiamento.replace("_", " "))}</span>${c.dettaglio !== "comparsa" ? `<span class="chip pn-badge-scheda">scheda</span>` : ""}</div>
        <div class="act">${c.dettaglio === "comparsa" ? `<button type="button" class="btn" data-promuovi="${i}">Promuovi</button>` : `<button type="button" class="btn ghost" data-apri="${i}">Apri scheda</button>`}</div>
      </div>`).join("");
    const opts = [["alba-chiara", "Alba Chiara (Valeria, villaggio)"], ["valeria-citta", "Valeria · città"], ["frostland-villaggio", "Frostland · villaggio"]];
    return S.ui.win("Comparse", `
      <p class="pn-note">Una riga per comparsa: nome, ruolo, razza, livello, un tratto e l'atteggiamento. Niente numeri: si promuove a scheda quando serve.</p>
      <div class="pn-tools">
        <div class="field"><label class="label" for="pn-c-luogo">Luogo</label><select class="input" id="pn-c-luogo">${opts.map(([v, t]) => `<option value="${v}" ${v === st.comp.luogo ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="field narrow"><label class="label" for="pn-c-n">Quante</label><input class="input" type="number" min="1" max="30" id="pn-c-n" value="${st.comp.n}"></div>
        <button type="button" class="btn primary" data-act="estrai">Estrai</button>
        <span class="small muted mono" style="margin-left:auto">seme ${st.comp.seme}</span>
      </div>
      <div class="pn-plist scroll-y">${rows}</div>`, { cls: "pn-win" });
  }

  /* ================= 3. PRESET ================= */
  function presetHtml() {
    const c = D().catalogo;
    const v = c.varianti;
    const cellTip = (ru, rz, k) => tip(`<span class="tn">${esc(nomeRuolo(ru))} × ${esc(nomeRazza(rz))}</span><span>${k === "motivo" ? `<b class="warn">la variante dice di no</b>: serve un motivo` : k === "variante" ? "c'è una variante: cambia qualche campo" : "nessuna variante: eredita dal ruolo e dalla razza"}</span><span class="mono">preset/ruoli/${esc(ru)}.yaml · varianti_razza.${esc(rz)}</span>`);
    const sym = { eredita: "·", variante: "◆", motivo: "!" };
    const matrix = `<table class="pn-matrix"><thead><tr><th>Ruolo</th>${c.razze.map((r) => `<th ${tip(`<span class="tn">${esc(r.nome)}</span><span>${esc(r.desc)}</span>`)} tabindex="0">${esc(r.nome.split(" ")[0])}</th>`).join("")}</tr></thead><tbody>
      ${c.ruoli.map((ru) => `<tr><td><button type="button" data-ruolo="${ru.id}" aria-pressed="${st.presetRuolo === ru.id}" ${tip(`<span class="tn">${esc(ru.nome)}</span><span>${esc(ru.desc)}</span><span>Fasce: ${Object.entries(ru.fasce).map(([k, x]) => `${k} ${x ? x.join("-") : "—"}`).join(" · ")}</span><span class="mono">${esc(ru.file)}</span>`)}>${esc(ru.nome)}</button></td>
        ${c.razze.map((rz) => { const k = rz.id === "umano" ? "eredita" : ((v[ru.id] || {})[rz.id] || "eredita"); return `<td><span class="pn-cell ${k}" tabindex="0" ${cellTip(ru.id, rz.id, k)}>${sym[k]}</span></td>`; }).join("")}</tr>`).join("")}
    </tbody></table>
    <div class="pn-mx-list">${c.ruoli.map((ru) => `<div><button type="button" class="btn ghost" style="align-self:flex-start" data-ruolo="${ru.id}" aria-pressed="${st.presetRuolo === ru.id}">${esc(ru.nome)} <span class="xs muted">villaggio ${ru.fasce.villaggio ? ru.fasce.villaggio.join("-") : "—"}</span></button>
      <div class="races">${c.razze.filter((rz) => rz.id !== "umano").map((rz) => { const k = (v[ru.id] || {})[rz.id] || "eredita"; return `<span class="chip ${k === "motivo" ? "warn" : k === "variante" ? "violet" : "muted"}" tabindex="0" ${cellTip(ru.id, rz.id, k)}>${sym[k]} ${esc(rz.nome)}</span>`; }).join("")}</div></div>`).join("")}</div>`;
    return S.ui.win("Catalogo dei preset", `
      <p class="pn-note">Sola lettura. <span class="pn-cell variante">◆</span> variante · <span class="pn-cell motivo">!</span> serve un motivo · <span class="pn-cell eredita">·</span> eredita. Scegli un ruolo per confrontare le razze con la variante umana.</p>
      <div class="pn-matrix-wrap">${matrix}</div>`, { cls: "pn-win" }) + (st.presetRuolo ? confrontaHtml(st.presetRuolo) : "");
  }
  function confrontaHtml(ru) {
    const c = D().catalogo;
    if (ru !== "fabbro") {
      const vv = c.varianti[ru] || {};
      const keys = Object.keys(vv);
      return S.ui.win(`Confronta · ${nomeRuolo(ru)}`, keys.length ? `<div class="pn-cmp">${keys.map((rz) => `<div class="pn-cmp-card"><h4>${esc(nomeRazza(rz))} ${vv[rz] === "motivo" ? `<span class="chip warn">serve un motivo</span>` : `<span class="chip violet">variante</span>`}</h4>
          ${vv[rz] === "motivo" ? `<p class="small">i goblin vivono fuori dalle mura, al margine di Silverleaf; dentro solo con un motivo</p><span class="mono xs muted">FONTE Zona_Alba_Chiara</span>` : `<div class="pn-diff"><span class="k muted">mestiere</span><span><span class="old">uno dei lavori del luogo</span> → <span class="new">legato al suo elemento</span></span></div><span class="mono xs muted">PROPOSTA</span>`}</div>`).join("")}</div>`
        : `<p class="small muted">Nessuna variante scritta: ogni razza eredita il ruolo così com'è (cambiano solo i campi della razza).</p>`, { cls: "pn-win" });
    }
    const cf = D().esempi.confronta_fabbro;
    const cards = Object.entries(cf.varianti).map(([rz, v]) => {
      const diffs = Object.entries(v.cambia).map(([k, d]) => {
        const t = tip(`<span class="tn">${esc(k)}</span><span>${layerChip(d.da)} da <b>${esc(d.da)}</b></span>`);
        if (d.aggiunte || d.tolte) return `<div class="pn-diff" tabindex="0" ${t}><span class="muted">${esc(k)}</span><span>${(d.aggiunte || []).map((a) => `<span class="add">+ ${esc(a.voce)}</span>`).join("<br>")}${(d.tolte || []).map((a) => `<br><span class="old">− ${esc(a.voce)}</span>`).join("")}</span></div>`;
        return `<div class="pn-diff" tabindex="0" ${t}><span class="muted">${esc(k)}</span><span><span class="old">${esc(fmtVal(d.umano))}</span> → <span class="new">${esc(fmtVal(d[rz]))}</span></span></div>`;
      }).join("");
      return `<div class="pn-cmp-card"><h4>${avatar({ id: "x", nome: rz, ruolo: "fabbro", razza: rz, eta: "adulto" }, 24)} ${esc(nomeRazza(rz))} <span class="xs muted">${Object.keys(v.cambia).length} campi</span></h4>${diffs}
        ${(v.errori || []).length ? `<span class="chip bad">${esc(v.errori[0])}</span>` : ""}</div>`;
    }).join("");
    return S.ui.win(`Confronta · Fabbro (${cf.luogo.regno}, ${cf.luogo.insediamento})`, `<p class="pn-note">Solo i campi che cambiano rispetto al fabbro umano.</p><div class="pn-cmp scroll-y">${cards}</div>`, { cls: "pn-win" });
  }

  /* ================= 4. CONTROLLA ================= */
  function controllaHtml() {
    const ctl = D().controlli, prove = D().prove;
    const n = (e) => prove.filter((p) => p.esito === e).length;
    const okAtteso = prove.filter((p) => p.esito === p.atteso).length;
    const ICON = { passa: "✓", avviso: "!", motivo: "?", fallisce: "✕" };
    return S.ui.win("Controlla", `
      <div class="pn-kpis">
        <div class="kv"><span class="label">Prove</span><span class="v">${okAtteso}<small> / ${prove.length} come atteso</small></span></div>
        <div class="kv"><span class="label">Passano</span><span class="v" style="color:var(--good)">${n("passa")}</span></div>
        <div class="kv"><span class="label">Avvisano</span><span class="v" style="color:var(--warn)">${n("avviso")}</span></div>
        <div class="kv"><span class="label">Errori nei preset</span><span class="v" style="color:var(--bad)">${ctl.errori.length}</span></div>
      </div>
      <div class="row"><button type="button" class="btn" data-act="ricontrolla">↻ Rilancia il controllo</button><span class="small muted">${st.ctrlAt ? `ultimo controllo alle ${st.ctrlAt}` : "python -m app.png controlla"}</span></div>
      <div class="pn-sec"><span class="label">Errori</span><ul class="pn-msgs">${ctl.errori.map((e) => `<li class="err" tabindex="0" ${tip(`<span class="mono">${esc(e.dove)}</span>`)}><span class="chip bad">errore</span><span>${esc(e.testo)}</span></li>`).join("")}</ul></div>
      <div class="pn-sec"><span class="label">Avvisi</span><ul class="pn-msgs scroll-y" style="--scroll-max:200px">${ctl.avvisi.map((e) => `<li tabindex="0" ${tip(`<span class="mono">${esc(e.dove)}</span>`)}><span class="chip warn">avviso</span><span>${esc(e.testo)}</span></li>`).join("")}</ul></div>
      <div class="pn-sec"><span class="label">Prove del canone</span>
        <ul class="pn-checks scroll-y">${prove.map((p) => `<li tabindex="0" ${tip(`<span class="tn">${esc(p.nome)}</span><span>${esc(p.componi)}</span>${p.ritocchi.length ? `<span>ritocchi: ${esc(p.ritocchi.join(", "))}</span>` : ""}<span>${esc(p.nota)}</span><span class="mono">${esc(p.dove)} · atteso: ${esc(p.atteso)}</span>`)}>
          <span class="pn-dot ${p.esito}" aria-hidden="true">${ICON[p.esito]}</span>
          <span><b>${esc(p.nome)}</b>${p.lv ? ` <span class="xs muted">Lv ${p.lv}</span>` : ""}<br><span class="xs muted">${esc(p.esito === "motivo" ? "richiede motivo" : p.nota)}</span></span>
          <span class="chip ${p.esito === "passa" ? "good" : p.esito === "avviso" ? "warn" : "violet"}">${esc(p.esito === "motivo" ? "richiede motivo" : p.esito)}</span></li>`).join("")}</ul></div>`, { cls: "pn-win" });
  }

  /* ================= 5. ARCHIVIO ================= */
  function archivioHtml() {
    const a = st.arch;
    const all = D().archivio;
    const q = a.q.trim().toLowerCase();
    const rows = all.filter((p) => (a.dett === "tutti" || p.dettaglio === a.dett) && (a.vivi === "tutti" || (a.vivi === "vivi") === p.vivo) && (!q || `${p.nome} ${p.ruolo} ${p.razza}`.toLowerCase().includes(q)));
    const cnt = (k) => all.filter((p) => p.dettaglio === k).length;
    const list = rows.map((p) => `<div class="pn-pr ${p.vivo ? "" : "dead"}">${avatar(p, 34)}
      <div class="who"><b>${esc(p.nome)}</b><span class="xs muted">Lv <span class="num">${p.livello}</span></span>${p.canone ? `<span class="chip gold" ${tip(`<span>Scritto nei documenti (Zona_Alba_Chiara): canone locale.</span>`)} tabindex="0">canone</span>` : ""}${p.bozza ? `<span class="chip muted">bozza</span>` : ""}</div>
      <div class="meta"><span>${esc(nomeRuolo(p.ruolo))} · ${esc(nomeRazza(p.razza))} · ${esc(p.eta)}</span><span>· ${esc(p.tratto)}</span><span class="chip pn-badge-${p.dettaglio}">${esc(p.dettaglio)}</span>
        ${p.vivo ? `<span class="chip good">vivo</span>` : `<span class="chip bad" tabindex="0" ${tip(`<span>${esc(p.nota || "morto")}</span><span class="muted">La morte di un PNG è definitiva.</span>`)}>✝ morto</span>`}
        ${p.vivo && p.nota ? `<span tabindex="0" ${tip(`<span>${esc(p.nota)}</span>`)}>ⓘ</span>` : ""}</div>
      <div class="act"></div></div>`).join("");
    const opt = (arr, v) => arr.map(([k, t]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("");
    return S.ui.win("Archivio · Alba Chiara", `
      <div class="pn-tools">
        <div class="field"><label class="label" for="pn-a-q">Cerca</label><input class="input" id="pn-a-q" value="${esc(a.q)}" placeholder="nome, ruolo, razza" autocomplete="off"></div>
        <div class="field narrow" style="flex-basis:150px"><label class="label" for="pn-a-dett">Dettaglio</label><select class="input" id="pn-a-dett">${opt([["tutti", `Tutti (${all.length})`], ["comparsa", `Comparsa (${cnt("comparsa")})`], ["scheda", `Scheda (${cnt("scheda")})`], ["completa", `Completa (${cnt("completa")})`]], a.dett)}</select></div>
        <div class="field narrow" style="flex-basis:120px"><label class="label" for="pn-a-vivi">Stato</label><select class="input" id="pn-a-vivi">${opt([["tutti", "Tutti"], ["vivi", "Vivi"], ["morti", "Morti"]], a.vivi)}</select></div>
      </div>
      <p class="small muted" aria-live="polite">${rows.length} PNG</p>
      <div class="pn-plist scroll-y">${list || `<p class="small muted" style="padding:10px">Nessun PNG con questi filtri.</p>`}</div>`, { cls: "pn-win" });
  }

  /* ================= Shell ================= */
  const TABS = [["nuovo", "Nuovo PNG"], ["comparse", "Comparse"], ["preset", "Preset"], ["controlla", "Controlla"], ["archivio", "Archivio"]];
  function html() {
    tips = [];
    const body = { nuovo: nuovoHtml, comparse: comparseHtml, preset: presetHtml, controlla: controllaHtml, archivio: archivioHtml }[st.tab]();
    return `<div class="pn-head"><h1 class="pn-title">PNG</h1><span class="small muted">Preset a strati → scheda. Vita e danno si calcolano, non si salvano.</span></div>
      <div class="tabs pn-tabs" role="tablist" aria-label="Sezioni PNG">${TABS.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${st.tab === k}">${t}${k === "archivio" ? `<span class="count">${D().archivio.length}</span>` : k === "controlla" ? `<span class="count">${D().controlli.errori.length + D().controlli.avvisi.length}</span>` : ""}</button>`).join("")}</div>
      ${body}`;
  }

  function copy(text, what) {
    const done = () => S.ui.toast("SISTEMA", [`${what} copiata negli appunti.`, text.length > 140 ? text.slice(0, 140) + "…" : text], true);
    try { navigator.clipboard.writeText(text).then(done, done); } catch (e) { done(); }
  }

  const ESEMPI = {
    "fabbro-ac": { sel: { ruolo: "fabbro", eta: "adulto", razza: "umano", regno: "valeria", ins: "villaggio", zona: "alba-chiara" }, rit: ["ex soldato della Corona"], seme: 11 },
    bambino: { sel: { ruolo: "cittadino", eta: "bambino", razza: "umano", regno: "valeria", ins: "villaggio", zona: "alba-chiara" }, rit: [], seme: D => D.esempi.nuovo_bambino.scheda.provenienza.seme },
    elfo: { sel: { ruolo: "cittadino", eta: "anziano", razza: "elfo", regno: "valeria", ins: "villaggio", zona: "alba-chiara" }, rit: [], seme: D => D.esempi.nuovo_elfo_anziano_rara.scheda.provenienza.seme },
    goblin: { sel: { ruolo: "cittadino", eta: "adulto", razza: "goblin", regno: "valeria", ins: "villaggio", zona: "alba-chiara" }, rit: [], seme: 7 },
    nano: { sel: { ruolo: "fabbro", eta: "adulto", razza: "nano", regno: "frostland", ins: "citta", zona: "" }, rit: [], seme: 23 },
    hald: { sel: { ruolo: "guardia", eta: "adulto", razza: "umano", regno: "valeria", ins: "villaggio", zona: "alba-chiara" }, rit: ["livello 72", "capo delle guardie"], seme: 72, nome: "Sergente Hald", genere: "m" },
  };

  function render(root) {
    injectStyle();
    bindGlobals();
    const wrap = document.createElement("div");
    wrap.className = "pn";
    root.innerHTML = "";
    root.appendChild(wrap);

    const paint = (focusSel) => {
      const active = document.activeElement;
      const key = focusSel || (active && wrap.contains(active) ? (active.id ? `#${active.id}` : active.dataset.act ? `[data-act="${active.dataset.act}"]` : active.dataset.tab ? `[data-tab="${active.dataset.tab}"]` : null) : null);
      hideTip();
      wrap.innerHTML = html();
      if (key) { const el = wrap.querySelector(key); if (el) el.focus({ preventScroll: true }); }
    };
    paint();

    const portraitOf = () => (portraits[st.scheda.id] = portraits[st.scheda.id] || { imgs: [], main: null });
    const addFiles = (files) => {
      const imgs = [...files].filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) { S.ui.toast("SISTEMA", ["Serve un file immagine (png, jpg, webp…)."]); return; }
      const pr = portraitOf();
      for (const f of imgs) { const im = { id: `i${++uid}`, url: URL.createObjectURL(f), name: f.name }; pr.imgs.push(im); if (!pr.main) pr.main = im.id; }
      paint();
      S.ui.toast("SISTEMA", [`${imgs.length === 1 ? "Immagine aggiunta" : `${imgs.length} immagini aggiunte`} al ritratto di ${st.scheda.nome}.`, "Anteprima locale: nessun caricamento."], true);
    };

    // Tooltip: hover e focus
    wrap.addEventListener("mouseover", (e) => { const a = e.target.closest("[data-pt]"); if (a && wrap.contains(a)) showTip(a); });
    wrap.addEventListener("mouseout", (e) => { const a = e.target.closest("[data-pt]"); if (a && !a.contains(e.relatedTarget)) hideTip(); });
    wrap.addEventListener("focusin", (e) => { const a = e.target.closest("[data-pt]"); if (a) showTip(a); else hideTip(); });
    wrap.addEventListener("focusout", hideTip);

    wrap.addEventListener("click", (e) => {
      const t = e.target;
      const tab = t.closest("[data-tab]");
      if (tab) { st.tab = tab.dataset.tab; paint(`[data-tab="${st.tab}"]`); return; }
      const ex = t.closest("[data-esempio]");
      if (ex) { const E = ESEMPI[ex.dataset.esempio]; st.sel = { ...E.sel }; st.ritocchi = [...E.rit]; st.seme = typeof E.seme === "function" ? E.seme(D()) : E.seme; rigenera(false);
        if (E.nome) { const sc = st.scheda; sc.nome = E.nome; sc.genere = E.genere; sc.ritratto.descrizione = descrizione(sc, st._g.comp); }
        paint(); return; }
      const rd = t.closest("[data-rit-del]");
      if (rd) { st.ritocchi.splice(Number(rd.dataset.ritDel), 1); rigenera(false); paint("#pn-rit-in"); return; }
      const mo = t.closest("[data-motivo]");
      if (mo) { st.ritocchi.push(mo.dataset.motivo); rigenera(false); paint(); return; }
      const af = t.closest("[data-aff]");
      if (af) { const s = st.scheda; s.stato.affinita = Math.max(-10, Math.min(10, s.stato.affinita + Number(af.dataset.aff))); paint(`[data-aff="${af.dataset.aff}"]`); return; }
      const ad = t.closest("[data-add]");
      if (ad) { const inp = wrap.querySelector(ad.dataset.add === "memoria" ? "#pn-mem-in" : "#pn-leg-in"); const v = inp.value.trim(); if (v) { st.scheda.stato[ad.dataset.add].push(v); paint(`#${inp.id}`); } return; }
      const im = t.closest("[data-img-main]");
      if (im) { portraitOf().main = im.dataset.imgMain; paint(); return; }
      const idl = t.closest("[data-img-del]");
      if (idl) { const pr = portraitOf(); const i = pr.imgs.findIndex((x) => x.id === idl.dataset.imgDel); if (i >= 0) { URL.revokeObjectURL(pr.imgs[i].url); pr.imgs.splice(i, 1); } if (pr.main === idl.dataset.imgDel) pr.main = pr.imgs[0] ? pr.imgs[0].id : null; paint(); return; }
      const rfd = t.closest("[data-ref-del]");
      if (rfd) { const i = userRefs.findIndex((x) => x.id === rfd.dataset.refDel); if (i >= 0) userRefs.splice(i, 1); paint(); return; }
      const pm = t.closest("[data-promuovi]");
      if (pm) { const c = st.comp.righe[Number(pm.dataset.promuovi)]; c.dettaglio = "scheda"; S.ui.toast("SISTEMA", [`${c.nome}: da comparsa a scheda.`, "Si pescano i sette campi, i numeri e lo stato per partita."], true); paint(`[data-apri="${pm.dataset.promuovi}"]`); return; }
      const ap = t.closest("[data-apri]");
      if (ap) { const c = st.comp.righe[Number(ap.dataset.apri)]; st.sel = { ...st.sel, ruolo: c.ruolo, eta: c.eta, razza: c.razza, regno: "valeria", ins: "villaggio", zona: "alba-chiara" }; st.ritocchi = []; st.seme = (c.provenienza || {}).seme % 1000 || 5; rigenera(false); st.scheda.nome = c.nome; st.scheda.livello = c.livello; st.scheda.id = c.id; st.tab = "nuovo"; paint('[data-tab="nuovo"]'); window.scrollTo({ top: 0 }); return; }
      const ru = t.closest("[data-ruolo]");
      if (ru) { st.presetRuolo = st.presetRuolo === ru.dataset.ruolo ? null : ru.dataset.ruolo; paint(`[data-ruolo="${ru.dataset.ruolo}"]`); return; }
      const act = t.closest("[data-act]");
      if (!act) return;
      const s = st.scheda;
      switch (act.dataset.act) {
        case "rigenera": rigenera(true); paint(); break;
        case "salva": {
          st.salvata = true;
          const arch = D().archivio;
          if (!arch.some((p) => p.id === s.id)) arch.unshift({ id: s.id, nome: s.nome, ruolo: s.ruolo, razza: s.razza, eta: s.eta.fase, livello: s.livello, dettaglio: s.dettaglio, vivo: true, tratto: (s.tratti || [])[0] || "", atteggiamento: s.stato.atteggiamento, canone: false, bozza: true, nota: s.motivo ? `motivo: ${s.motivo}` : "" });
          S.ui.toast("SISTEMA", [`${s.nome} salvato come bozza nell'archivio di ${st.sel.zona || st.sel.regno}.`, `Restano da riscrivere: ${(s.da_ritoccare || []).filter((k) => !(s._scritto || {})[k]).join(", ") || "niente"}.`], true);
          paint(); break;
        }
        case "promuovi": s.dettaglio = "completa"; S.ui.toast("SISTEMA", [`${s.nome}: promosso a scheda completa.`, "Si aggiungono segreto e gancio."], true); paint(); break;
        case "riga": copy(rigaZona(s), "Riga di zona"); break;
        case "combat": st.combat = !st.combat; paint('[data-act="combat"]'); break;
        case "pick": wrap.querySelector("#pn-file").click(); break;
        case "ref-pick": wrap.querySelector("#pn-ref-file").click(); break;
        case "copia-desc": copy(descrTesto(s), "Descrizione per il ritratto"); break;
        case "desc-extra": { const v = wrap.querySelector("#pn-desc-extra").value.trim(); if (v) { s.ritratto.extra = s.ritratto.extra ? `${s.ritratto.extra} ${v}` : v; paint("#pn-desc-extra"); } break; }
        case "estrai": { const n = Number(wrap.querySelector("#pn-c-n").value) || 6; st.comp.n = Math.max(1, Math.min(30, n)); st.comp.luogo = wrap.querySelector("#pn-c-luogo").value; st.comp.seme = 1 + Math.floor(Math.random() * 9999); st.comp.righe = null; paint('[data-act="estrai"]'); break; }
        case "ricontrolla": st.ctrlAt = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); paint('[data-act="ricontrolla"]'); break;
      }
    });

    wrap.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t.id === "pn-rit-in" && e.key === "Enter") { e.preventDefault(); const v = t.value.trim(); if (v) { st.ritocchi.push(v); rigenera(false); paint("#pn-rit-in"); } return; }
      if (t.id === "pn-rit-in" && e.key === "Backspace" && !t.value && st.ritocchi.length) { st.ritocchi.pop(); rigenera(false); paint("#pn-rit-in"); return; }
      if ((t.id === "pn-mem-in" || t.id === "pn-leg-in" || t.id === "pn-desc-extra") && e.key === "Enter") { e.preventDefault(); t.nextElementSibling.click(); return; }
      if (t.classList.contains("pn-drop") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); wrap.querySelector("#pn-file").click(); }
      if (t.getAttribute("role") === "tab" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const i = TABS.findIndex(([k]) => k === st.tab); const n = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
        st.tab = TABS[n][0]; paint(`[data-tab="${st.tab}"]`);
      }
    });

    wrap.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.sette) {
        const s = st.scheda; s[t.dataset.sette] = t.value; (s._scritto = s._scritto || {})[t.dataset.sette] = true;
        t.closest(".pn-field").classList.remove("todo");
      }
      if (t.id === "pn-a-q") { st.arch.q = t.value; paint("#pn-a-q"); const el = wrap.querySelector("#pn-a-q"); el.setSelectionRange(el.value.length, el.value.length); }
    });

    wrap.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.sel) {
        const k = t.dataset.sel; st.sel[k] = t.value;
        if (k === "zona" && t.value) { const z = D().catalogo.zone.find((x) => x.id === t.value); st.sel.regno = z.regno; st.sel.ins = z.insediamento; }
        if (k === "regno" && !D().catalogo.zone.some((z) => z.id === st.sel.zona && z.regno === t.value)) st.sel.zona = "";
        rigenera(false); paint(`#${t.id}`); return;
      }
      if (t.id === "pn-file" && t.files.length) { addFiles(t.files); return; }
      if (t.id === "pn-ref-file" && t.files.length) {
        const f = t.files[0];
        if (!f.type.startsWith("image/")) return;
        const strato = wrap.querySelector("#pn-ref-strato").value;
        userRefs.push({ id: `u${++uid}`, strato, titolo: f.name, url: URL.createObjectURL(f) });
        S.ui.toast("SISTEMA", [`Riferimento aggiunto allo strato «${strato}».`, "Comparirà per ogni PNG composto con questo strato."], true);
        paint(); return;
      }
      if (t.id === "pn-a-dett") { st.arch.dett = t.value; paint("#pn-a-dett"); }
      if (t.id === "pn-a-vivi") { st.arch.vivi = t.value; paint("#pn-a-vivi"); }
      if (t.id === "pn-c-luogo") { st.comp.luogo = t.value; }
    });

    // Trascina e rilascia sul ritratto
    wrap.addEventListener("dragover", (e) => { const d = e.target.closest(".pn-drop"); if (!d) return; e.preventDefault(); d.classList.add("over"); });
    wrap.addEventListener("dragleave", (e) => { const d = e.target.closest(".pn-drop"); if (d && !d.contains(e.relatedTarget)) d.classList.remove("over"); });
    wrap.addEventListener("drop", (e) => { const d = e.target.closest(".pn-drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  }

  S.screens.png = { title: "PNG", render };
})();
