/* Forgia del Master: wizard Skill, Classe, Razza, Titolo, PNG, Incontro.
   Segue il contratto di screens/forgia.js (S.wizards.push, ctx.save/close, S.wz.steps, classi .wz-*).
   Motore comune in testa al file: ogni wizard dichiara steps [{label, check, html}], preview, build, apply.
   - check(st) ritorna "" se lo step è valido, altrimenti il motivo (mostrato accanto ad Avanti disabilitato);
   - i campi hanno data-f="percorso.nello.stato": l'input aggiorna stato, anteprima, barra step e piede
     senza ridisegnare il modulo (il focus resta dov'è); select, checkbox e bottoni ridisegnano tutto
     ripristinando il focus per id;
   - le bozze sopravvivono a "Torna alla Forgia"; "Annulla" le scarta.
   Ogni numero o regola non presente nel regolamento è marcato in UI con il chip "proposta". */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.wizards = S.wizards || [];
  const esc = (s) => S.ui.esc(s);

  /* ================= Formattazione ================= */
  const ni = (n) => Math.round(Number(n) || 0).toLocaleString("it-IT");
  const nf = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("it-IT");
  const signed = (n) => (Number(n) > 0 ? "+" : Number(n) < 0 ? "−" : "±") + nf(Math.abs(Number(n) || 0));
  const isInt = (v, min, max) => v !== "" && v != null && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
  const filled = (s, min = 1) => String(s ?? "").trim().length >= min;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const lib = (kind) => (S.data && S.data.library && S.data.library[kind]) || [];
  const chars = (ctx) => (ctx && ctx.state && ctx.state.data && ctx.state.data.characters) || (S.data && S.data.characters) || [];
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
  const DASH = `<span class="muted">—</span>`;

  /* ================= Regole usate (con fonte) ================= */
  const STAT_NAME = { STR: "Forza", DEX: "Destrezza", VIT: "Vitalità", INT: "Intelligenza", FIN: "Finesse", AUT: "Autorità", ALL: "Tutte le base" };
  const BASE = ["STR", "DEX", "VIT", "INT"];

  // Progressione_Personaggio_Completo.txt, Sezione 3–4
  const SKILL_TYPES = ["Combat", "Craft", "Utility", "Gathering", "Defense", "Knowledge", "Language", "Social", "Classe"];
  const WEAPON_GRADE = [{ what: "Precisione", amount: 2, unit: "%" }, { what: "Danno", amount: 1, unit: "%" }];
  const GRADE1_RULE = {
    Combat: "Al primo uso vero in combattimento.",
    Craft: "Dopo un lavoro completo fatto sotto la guida di un PNG che pratica il mestiere.",
    Gathering: "Dopo un lavoro completo fatto sotto la guida di un PNG che pratica il mestiere.",
  };
  const ACQUIRE = [
    { v: "Level up", l: "Level up (abilità di classe ogni 5 livelli)" },
    { v: "Libro", l: "Libro (tomi rari)" },
    { v: "Quest training", l: "Quest training con un PNG Maestro" },
    { v: "Titolo", l: "Inclusa in un titolo" },
    { v: "Sviluppo organico", l: "Sviluppo organico (rarissimo)" },
  ];

  // Sistema_Status_Sociale.txt, Sezione 1
  const TITLE_ACQ = { "Comune": "Impegno normale", "Non Comune": "Dedizione specifica", "Raro": "Imprese notevoli", "Epico": "Gesta che cambiano il mondo",
    "Leggendario": "Solo 1–2 per server", "Mitico": "Trascende la mortalità", "Divino": "Intervento diretto di una divinità" };
  const TITLE_EX = { "Comune": "Primo Sangue: +2 STR, +1 VIT, +5% critici vs umanoidi", "Raro": "Ammazzadraghi: +10 STR/VIT, +5 tutte",
    "Epico": "Salvatore di Regni: +15 tutte", "Leggendario": "Primo tra i Mortali: +25 tutte, regen raddoppiata" };

  // master.js / Sistema_PNG_Completo.txt
  const TRUST = { Scarso: "bad", Neutrale: "muted", Buono: "good", Eccellente: "gold" };

  // Combat.txt, "Creature" e "Taglia"; moltiplicatore = RARITY_SCALE.creatureMult (grado³)
  const SIZES = [{ v: "Fragile", m: 0.5 }, { v: "Normale", m: 1 }, { v: "Robusta", m: 1.5 }];
  function rarity(name) { return S.rules.RARITY_SCALE.find((r) => r.name === name) || S.rules.RARITY_SCALE[0]; }
  function creature(level, rar, size) {
    const r = rarity(rar);
    const sz = SIZES.find((x) => x.v === size) || SIZES[1];
    const L = Math.max(0, Number(level) || 0);
    return {
      dmg: (10 + L * 6) * r.creatureMult,
      hp: (40 + L * 20) * r.creatureMult * sz.m,
      dmgF: `(10 + ${L}×6) × ${r.creatureMult}`,
      hpF: `(40 + ${L}×20) × ${r.creatureMult} × ${nf(sz.m)}`,
    };
  }
  // Progressione, Sezione 2 "Esperienza": pari livello 2%, ±1 punto per livello, 0–10%; dal lv 10 metà, dal 50 un quarto
  function expGain(pgLevel, cLevel) {
    const base = Math.max(0, Math.min(10, 2 + (Number(cLevel) - Number(pgLevel))));
    const factor = pgLevel >= 50 ? 0.25 : pgLevel >= 10 ? 0.5 : 1;
    return { base, factor, pct: base * factor };
  }
  function expFor(pgLevel, creatures) {
    let tot = 0;
    const parts = [];
    for (const c of creatures) {
      const n = Math.max(0, Number(c.count) || 0);
      if (!n) continue;
      const g = expGain(pgLevel, Number(c.level) || 0);
      tot += g.pct * n;
      parts.push(`${n}× ${c.name || "creatura"}: ${nf(g.base)}%${g.factor < 1 ? ` × ${nf(g.factor)}` : ""}`);
    }
    return { pct: tot, parts };
  }

  /* PROPOSTA: rarità tipica dell'arma per livello (serve solo a stimare il danno dei PG senza arma registrata) */
  const LEVEL_RARITY = [[24, "Comune"], [59, "Non Comune"], [119, "Raro"], [199, "Epico"], [299, "Unico"], [399, "Leggendario"], [499, "Mitico"], [Infinity, "Divino"]];
  function rarityForLevel(lv) { return LEVEL_RARITY.find(([max]) => lv <= max)[1]; }
  function midBase(rar) { const [a, b] = rarity(rar).weaponBase; return b == null ? a : (a + b) / 2; }
  function baseRange(rar) { const [a, b] = rarity(rar).weaponBase; return b == null ? `${ni(a)}+` : `${ni(a)}–${ni(b)}`; }
  /* PROPOSTA: danno per turno di un PG = Base arma × max(molt. fisico, molt. magico) × attacchi per turno */
  function pgPower(c) {
    const d = S.rules.derived(c);
    const w = S.rules.equippedItems(c).find((it) => it.weaponBase);
    const base = w ? w.weaponBase : midBase(rarityForLevel(c.level));
    const molt = Math.max(d.moltFis, d.moltMag);
    return { hp: d.hp, dmg: base * molt * d.attacchi, base, weapon: w ? w.name : `stima ${rarityForLevel(c.level)}`, molt, att: d.attacchi };
  }
  /* PROPOSTA: difficoltà = (ΣVita creature × ΣDanno creature) / (ΣVita gruppo × ΣDanno gruppo).
     Coerente con "grado N vale N³ Comuni": 27 goblin insieme valgono quanto una creatura Rara. */
  const DIFF = [[0.1, "Banale", "muted"], [0.3, "Facile", "good"], [0.7, "Equilibrato", "violet"], [1.5, "Difficile", "warn"], [4, "Mortale", "bad"], [Infinity, "Impossibile", "bad"]];
  function difficulty(creatures, pcs) {
    let cHP = 0, cD = 0, pHP = 0, pD = 0;
    for (const c of creatures) {
      const n = Math.max(0, Number(c.count) || 0);
      const k = creature(c.level, c.rarity, c.size);
      cHP += k.hp * n; cD += k.dmg * n;
    }
    for (const p of pcs) { const w = pgPower(p); pHP += w.hp; pD += w.dmg; }
    const ratio = pHP * pD > 0 ? (cHP * cD) / (pHP * pD) : Infinity;
    const band = DIFF.find(([max]) => ratio < max) || DIFF[DIFF.length - 1];
    return { cHP, cD, pHP, pD, ratio, label: band[1], tone: band[2] };
  }

  /* Bonus di un titolo: "ALL" si espande sulle 4 stat base, codici ripetuti si sommano */
  function expandBonus(rows) {
    const out = {};
    for (const r of rows || []) {
      const v = Number(r.val);
      if (!r.code || !Number.isFinite(v) || !v) continue;
      for (const k of r.code === "ALL" ? BASE : [r.code]) out[k] = (out[k] || 0) + v;
    }
    return out;
  }
  /* Aggiunge (sign=+1) o toglie (−1) i bonus alla colonna Titoli delle stat; ritorna i codici che il PG non ha */
  function addTitleBonus(c, bonus, sign) {
    const missing = [];
    for (const [k, v] of Object.entries(bonus || {})) {
      const row = (c.stats || []).find((r) => r.code === k);
      if (!row) { missing.push(k); continue; }
      row.titoli = (Number(row.titoli) || 0) + sign * Number(v);
    }
    return missing;
  }
  function assignTitle(c, t, replaceName) {
    c.titles = c.titles || [];
    if (replaceName) {
      const i = c.titles.findIndex((x) => x.name === replaceName);
      if (i >= 0) { addTitleBonus(c, c.titles[i].bonus, -1); c.titles.splice(i, 1); }
    }
    c.titles.push({ name: t.name, rarity: t.rarity, bonus: { ...t.bonus } });
    return addTitleBonus(c, t.bonus, +1);
  }

  /* ================= Motore dei wizard ================= */
  const drafts = {};
  let C = null;     // wizard in disegno: { def, st, ctx }
  let tipN = 0;

  function getP(o, path) { return String(path).split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
  function setP(o, path, v) {
    const ks = String(path).split(".");
    const last = ks.pop();
    const t = ks.reduce((a, k) => a[k], o);
    if (t) t[last] = v;
  }
  function fid(path) { return `wmr-${C.def.id}-${String(path).replace(/[^A-Za-z0-9]+/g, "-")}`; }

  function define(def) {
    S.wizards.push({ id: def.id, kind: def.kind, group: def.group, title: def.title, desc: def.desc, render(root, ctx) { mount(def, root, ctx); } });
    (S.wmr.defs[def.id] = def);
  }

  function mount(def, root, ctx) {
    injectStyle();
    if (!drafts[def.id]) drafts[def.id] = Object.assign({ step: 0 }, def.fresh(ctx));
    const W = { def, root, ctx, get st() { return drafts[def.id]; } };
    root.addEventListener("input", (e) => onInput(W, e));
    root.addEventListener("change", (e) => onChange(W, e));
    root.addEventListener("click", (e) => onClick(W, e));
    draw(W);
  }
  function withC(W, fn) {
    const prev = C;
    C = { def: W.def, st: W.st, ctx: W.ctx };
    try { return fn(); } finally { C = prev; }
  }
  function status(W) {
    const msgs = W.def.steps.map((s) => (s.check ? s.check(W.st, W.ctx) || "" : ""));
    const firstBad = msgs.findIndex((m) => m);
    return { msgs, firstBad, reachable: firstBad === -1 ? W.def.steps.length - 1 : firstBad };
  }
  function footHtml(W, s) {
    const st = W.st;
    const n = W.def.steps.length;
    const last = st.step === n - 1;
    const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
    let reason = cap(s.msgs[st.step]);
    if (last && !reason && s.firstBad !== -1) reason = `Passo ${s.firstBad + 1} (${W.def.steps[s.firstBad].label}): ${s.msgs[s.firstBad]}`;
    const blocked = !!reason;
    const id = W.def.id;
    return `<button type="button" class="btn ghost" data-nav="cancel" id="wmr-${id}-cancel" title="Scarta la bozza e torna alla Forgia">Annulla</button>
      <div class="wmr-foot-r">
        <span class="hint ${reason ? "bad" : "good"} wmr-reason" id="wmr-${id}-reason">${reason ? esc(reason) : last ? "Pronto: salva per aggiungerlo alla libreria." : "Passo completo."}</span>
        <div class="row">
          <button type="button" class="btn" data-nav="prev" id="wmr-${id}-prev" ${st.step === 0 ? "disabled" : ""}>Indietro</button>
          ${last
            ? `<button type="button" class="btn primary" data-nav="save" id="wmr-${id}-save" ${blocked ? `disabled aria-describedby="wmr-${id}-reason"` : ""}>Salva nella libreria</button>`
            : `<button type="button" class="btn primary" data-nav="next" id="wmr-${id}-next" ${blocked ? `disabled aria-describedby="wmr-${id}-reason"` : ""}>Avanti</button>`}
        </div>
      </div>`;
  }
  function captureFocus(root) {
    const a = document.activeElement;
    if (!a || !a.id || !root.contains(a)) return null;
    const f = { id: a.id, s: null, e: null };
    try { f.s = a.selectionStart; f.e = a.selectionEnd; } catch (e) { /* senza selezione */ }
    return f;
  }
  function focusForm(W) {
    const body = W.root.querySelector(".wmr-form-b");
    if (body) body.focus({ preventScroll: true });
  }
  function restoreFocus(W, f) {
    if (!f) return;
    const el = W.root.querySelector("#" + CSS.escape(f.id));
    if (!el || el.disabled) { focusForm(W); return; }
    el.focus({ preventScroll: true });
    if (f.s != null) { try { el.setSelectionRange(f.s, f.e); } catch (e) { /* ignora */ } }
  }
  function draw(W, opts = {}) {
    withC(W, () => {
      const f = opts.focusId ? { id: opts.focusId } : opts.stepChange ? null : captureFocus(W.root);
      const s = status(W);
      const st = W.st;
      const step = W.def.steps[st.step];
      const n = W.def.steps.length;
      W.root.innerHTML = `<div class="wmr stack">
        <div class="stack wmr-head"><h2>${esc(W.def.heading)}</h2><p class="muted small">${W.def.intro}</p></div>
        <div data-wmr="steps">${S.wz.steps(W.def.steps.map((x) => x.label), st.step, s.reachable)}</div>
        <div class="wz-body">
          <section class="win wmr-form" aria-labelledby="wmr-${W.def.id}-h">
            <header class="win-h" id="wmr-${W.def.id}-h">Passo ${st.step + 1} di ${n} · ${esc(step.label)}</header>
            <div class="win-b wmr-form-b" tabindex="-1">
              ${step.html(st, W.ctx)}
              <div class="wz-foot" data-wmr="foot">${footHtml(W, s)}</div>
            </div>
          </section>
          <aside class="wz-preview" data-wmr="preview" aria-label="Anteprima">${W.def.preview(st, W.ctx)}</aside>
        </div>
      </div>`;
      if (opts.stepChange) {
        focusForm(W);
        const top = W.root.getBoundingClientRect().top;
        if (top < 0) window.scrollBy({ top: top - 90 });
      } else restoreFocus(W, f);
    });
  }
  /* Aggiornamento leggero mentre si scrive: il modulo (e il focus) restano intatti */
  function refresh(W) {
    withC(W, () => {
      const s = status(W);
      const q = (k) => W.root.querySelector(`[data-wmr="${k}"]`);
      if (q("steps")) q("steps").innerHTML = S.wz.steps(W.def.steps.map((x) => x.label), W.st.step, s.reachable);
      if (q("foot")) q("foot").innerHTML = footHtml(W, s);
      if (q("preview")) q("preview").innerHTML = W.def.preview(W.st, W.ctx);
      W.root.querySelectorAll("[data-live]").forEach((el) => {
        const fn = W.def.live && W.def.live[el.dataset.live];
        if (fn) el.innerHTML = fn(W.st, W.ctx, el);
      });
    });
  }
  function readVal(el) {
    if (el.type === "checkbox") return el.checked;
    if (el.dataset.type === "num") {
      const v = String(el.value).trim().replace(",", ".");
      if (v === "") return "";
      const x = Number(v);
      return Number.isFinite(x) ? x : v;
    }
    return el.value;
  }
  function onInput(W, e) {
    const el = e.target.closest && e.target.closest("[data-f]");
    if (!el || el.tagName === "SELECT" || el.type === "checkbox") return;
    setP(W.st, el.dataset.f, readVal(el));
    if (W.def.onField) W.def.onField(W.st, el.dataset.f, W.ctx);
    refresh(W);
  }
  function onChange(W, e) {
    const el = e.target.closest && e.target.closest("[data-f]");
    if (!el || !(el.tagName === "SELECT" || el.type === "checkbox")) return;
    setP(W.st, el.dataset.f, readVal(el));
    if (W.def.onField) W.def.onField(W.st, el.dataset.f, W.ctx);
    draw(W);
  }
  function onClick(W, e) {
    const t = e.target.closest && e.target.closest("button");
    if (!t || !W.root.contains(t) || t.disabled) return;
    const st = W.st;
    const s = status(W);
    if (t.dataset.wzStep != null) {
      const i = Number(t.dataset.wzStep);
      if (i <= s.reachable && i !== st.step) { st.step = i; draw(W, { stepChange: true }); }
      return;
    }
    const nav = t.dataset.nav;
    if (nav === "next") { if (!s.msgs[st.step] && st.step < W.def.steps.length - 1) { st.step++; draw(W, { stepChange: true }); } return; }
    if (nav === "prev") { if (st.step > 0) { st.step--; draw(W, { stepChange: true }); } return; }
    if (nav === "cancel") { delete drafts[W.def.id]; W.ctx.close(); return; }
    if (nav === "save") {
      if (s.firstBad !== -1) return;
      const entry = W.def.build(st, W.ctx);
      if (W.def.apply) W.def.apply(st, W.ctx, entry);
      delete drafts[W.def.id];
      W.ctx.save(entry);
      return;
    }
    if (t.dataset.set) {
      const path = t.dataset.set;
      const v = t.dataset.type === "num" ? Number(t.dataset.val) : t.dataset.val;
      if (t.dataset.multi) {
        const arr = (getP(st, path) || []).slice();
        const i = arr.indexOf(v);
        if (i === -1) arr.push(v); else arr.splice(i, 1);
        setP(st, path, arr);
      } else setP(st, path, v);
      if (W.def.onField) W.def.onField(st, path, W.ctx);
      draw(W);
      return;
    }
    if (t.dataset.a && W.def.act) {
      const focusPath = W.def.act(st, t.dataset.a, t, W.ctx);
      draw(W, focusPath ? { focusId: `wmr-${W.def.id}-${String(focusPath).replace(/[^A-Za-z0-9]+/g, "-")}` } : {});
    }
  }

  /* ================= Helper dei campi ================= */
  function lab(path, label, o) {
    return `<label class="label" for="${fid(path)}">${esc(label)}${o.req ? ` <span class="wmr-req" aria-hidden="true">*</span>` : ""}${o.after ? " " + o.after : ""}</label>`;
  }
  function hintH(o) { return o.hint ? `<span class="hint">${o.hint}</span>` : ""; }
  function fText(path, label, o = {}) {
    const v = getP(C.st, path) ?? "";
    const common = `class="input" id="${fid(path)}" data-f="${esc(path)}" ${o.max ? `maxlength="${o.max}"` : ""} ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.req ? 'aria-required="true"' : ""}`;
    const ctl = o.area
      ? `<textarea ${common} rows="${o.rows || 3}">${esc(v)}</textarea>`
      : `<input ${common} type="text" value="${esc(v)}" autocomplete="off" ${o.list ? `list="${o.list}"` : ""}>`;
    return `<div class="field ${o.cls || ""}">${lab(path, label, o)}${ctl}${hintH(o)}</div>`;
  }
  function fNum(path, label, o = {}) {
    const v = getP(C.st, path) ?? "";
    return `<div class="field ${o.cls || ""}">${lab(path, label, o)}
      <input class="input num" type="number" inputmode="numeric" id="${fid(path)}" data-f="${esc(path)}" data-type="num" value="${esc(v)}"
        ${o.min != null ? `min="${o.min}"` : ""} ${o.max != null ? `max="${o.max}"` : ""} step="${o.step || 1}" ${o.ph ? `placeholder="${esc(o.ph)}"` : ""} ${o.req ? 'aria-required="true"' : ""}>
      ${hintH(o)}</div>`;
  }
  function fSel(path, label, opts, o = {}) {
    const v = String(getP(C.st, path) ?? "");
    const list = opts.map((x) => (typeof x === "string" ? { v: x, l: x } : x));
    return `<div class="field ${o.cls || ""}">${lab(path, label, o)}
      <select class="input" id="${fid(path)}" data-f="${esc(path)}">
        ${list.map((x) => `<option value="${esc(x.v)}" ${String(x.v) === v ? "selected" : ""} ${x.disabled ? "disabled" : ""}>${esc(x.l)}</option>`).join("")}
      </select>${hintH(o)}</div>`;
  }
  function fCheck(path, label, o = {}) {
    const v = !!getP(C.st, path);
    return `<div class="field ${o.cls || ""}"><label class="wmr-check"><input type="checkbox" id="${fid(path)}" data-f="${esc(path)}" ${v ? "checked" : ""}><span>${esc(label)}</span>${o.after ? " " + o.after : ""}</label>${hintH(o)}</div>`;
  }
  function fPicks(path, label, opts, o = {}) {
    const cur = getP(C.st, path);
    const gid = fid(path) + "-g";
    const btns = opts.map((x0) => {
      const x = typeof x0 === "string" ? { v: x0, l: x0 } : x0;
      const on = o.multi ? (cur || []).includes(x.v) : String(cur) === String(x.v);
      return `<button type="button" class="pick" id="${fid(path + "-" + x.v)}" data-set="${esc(path)}" data-val="${esc(x.v)}"
        ${o.multi ? 'data-multi="1"' : ""} ${o.num ? 'data-type="num"' : ""} aria-pressed="${on}" ${x.disabled ? "disabled" : ""}
        ${x.rarity ? `data-rarity="${S.rules.rarityKey(x.rarity)}"` : ""} ${x.title ? `title="${esc(x.title)}"` : ""}>
        <span>${esc(x.l)}</span>${x.sub ? `<span class="wmr-pick-sub">${esc(x.sub)}</span>` : ""}</button>`;
    }).join("");
    return `<div class="field ${o.cls || ""}" role="group" aria-labelledby="${gid}">
      <span class="label" id="${gid}">${esc(label)}${o.req ? ` <span class="wmr-req" aria-hidden="true">*</span>` : ""}${o.after ? " " + o.after : ""}</span>
      <div class="wmr-picks">${btns}</div>${hintH(o)}</div>`;
  }
  function btn(a, text, o = {}) {
    const id = o.id ? fid(o.id) : "";
    return `<button type="button" class="btn ${o.cls || ""}" data-a="${a}" ${o.i != null ? `data-i="${o.i}"` : ""} ${o.k ? `data-k="${esc(o.k)}"` : ""} ${o.d != null ? `data-d="${o.d}"` : ""}
      ${id ? `id="${id}"` : ""} ${o.disabled ? "disabled" : ""} ${o.label ? `aria-label="${esc(o.label)}"` : ""} ${o.title ? `title="${esc(o.title)}"` : ""}>${esc(text)}</button>`;
  }
  /* Chip "proposta": numero o regola inventati, da far approvare */
  function prop(why) { return `<span class="chip warn wmr-prop" tabindex="0" title="${esc("Proposta, non nel regolamento: " + why)}" aria-label="${esc("Proposta: " + why)}">proposta</span>`; }
  function ruleChip(src) { return `<span class="chip good wmr-prop" tabindex="0" title="${esc("Dal regolamento: " + src)}" aria-label="${esc("Regola: " + src)}">regola</span>`; }
  function ref(html) { return `<p class="small muted wmr-ref">${html}</p>`; }

  /* ================= Helper dell'anteprima ================= */
  function row(label, value, tip) {
    if (!tip) return `<div class="wmr-r"><span class="wmr-k">${esc(label)}</span><span class="wmr-v">${value}</span></div>`;
    const id = `wmr-tip-${++tipN}`;
    return `<div class="wmr-r" tabindex="0" aria-describedby="${id}"><span class="wmr-k">${esc(label)}</span><span class="wmr-v">${value}</span><span class="wmr-tip" role="tooltip" id="${id}">${tip}</span></div>`;
  }
  function trow(label, text, n = 48) {
    const s = String(text ?? "").trim();
    if (!s) return row(label, DASH);
    if (s.length <= n) return row(label, esc(s));
    return row(label, esc(s.slice(0, n - 1).trimEnd()) + "…", esc(s));
  }
  function sec(label, extra = "") { return `<div class="wmr-sec"><span class="label">${esc(label)}</span>${extra}</div>`; }
  function pvWin(tag, head, body) {
    return S.ui.win("Anteprima del System", `<div class="sysmsg gold"><span class="tag">[${esc(tag)}]</span><span class="wmr-pv-name">${head}</span></div>${body}`, { gold: true, cls: "wmr-pv" });
  }
  const nameOr = (s, ph) => (filled(s) ? esc(String(s).trim()) : `<span class="muted">${esc(ph)}</span>`);
  function charOpts(ctx) { return [{ v: "", l: "Nessuno: solo libreria" }, ...chars(ctx).map((c) => ({ v: c.id, l: `${c.name} · Lv ${c.level}` }))]; }
  function charById(ctx, id) { return chars(ctx).find((c) => c.id === id) || null; }

  /* ================= Stile ================= */
  function injectStyle() {
    if (document.getElementById("wmr-style")) return;
    const st = document.createElement("style");
    st.id = "wmr-style";
    st.textContent = `
      .wmr { gap: 16px; }
      .wmr-head { gap: 4px; }
      .wmr-form-b:focus { outline: none; }
      .wmr-foot-r { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-left: auto; min-width: 0; }
      .wmr-reason { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
      .wmr-picks { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
      .wmr-picks .pick { padding: 6px 12px; gap: 0; flex: 0 1 auto; font-size: var(--fs-sm); min-width: 0; }
      .wmr-picks .pick:disabled { opacity: 0.45; cursor: not-allowed; }
      .wmr-pick-sub { font-size: var(--fs-xs); color: var(--muted); }
      .wmr-lines { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .wmr-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; padding: 10px; min-width: 0;
        border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); }
      .wmr-line > .field { flex: 1 1 120px; }
      .wmr-line > .field.wmr-grow { flex: 2 1 180px; }
      .wmr-line > .field.wmr-narrow { flex: 1 1 72px; max-width: 120px; }
      .wmr-line > .btn { flex: none; }
      .wmr-calc { flex: 1 1 100%; display: flex; gap: 6px; flex-wrap: wrap; font-size: var(--fs-sm); min-width: 0; }
      .wmr-check { display: inline-flex; gap: 8px; align-items: center; cursor: pointer; font-size: var(--fs-sm); flex-wrap: wrap; }
      .wmr-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--gold); }
      .wmr-req { color: var(--gold); }
      .wmr-prop { cursor: help; margin-left: 4px; text-transform: none; letter-spacing: 0.02em; }
      .wmr-ref { border-left: 2px solid var(--line-strong); padding-left: 10px; overflow-wrap: anywhere; }
      .wmr-pv .win-b { gap: 2px; }
      .wmr-pv .sysmsg { margin-bottom: 6px; }
      .wmr-pv-name { font-size: var(--fs-md); color: var(--fg); overflow-wrap: anywhere; }
      .wmr-sec { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; padding: 12px 0 2px; }
      .wmr-sec .label { color: var(--violet); }
      .wmr-r { position: relative; display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
        padding: 5px 8px; margin: 0 -8px; border-bottom: 1px solid var(--line); border-radius: 4px; min-width: 0; }
      .wmr-r[tabindex] { cursor: help; }
      .wmr-r[tabindex]:hover, .wmr-r:focus-visible { background: var(--panel-2); outline: none; }
      .wmr-r:focus-visible { box-shadow: inset 0 0 0 1px var(--violet); }
      .wmr-k { color: var(--muted); font-size: var(--fs-sm); flex: none; max-width: 48%; }
      .wmr-v { font-size: var(--fs-sm); text-align: right; min-width: 0; overflow-wrap: anywhere; }
      .wmr-tip { position: absolute; z-index: 15; left: 0; right: 0; top: calc(100% + 4px); padding: 8px 10px;
        background: var(--panel); border: 1px solid var(--violet); border-radius: var(--radius); box-shadow: 0 8px 24px var(--violet-soft);
        font-size: var(--fs-xs); font-family: var(--font-mono); color: var(--fg); white-space: pre-line; overflow-wrap: anywhere; text-align: left;
        opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .12s, transform .12s, visibility .12s; pointer-events: none; }
      .wmr-r:hover .wmr-tip, .wmr-r:focus-visible .wmr-tip { opacity: 1; visibility: visible; transform: none; }
      .wmr-stat { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 12px;
        padding: 8px 0; border-bottom: 1px solid var(--line); }
      .wmr-stat:last-child { border-bottom: 0; }
      .wmr-ctl { display: flex; align-items: center; gap: 6px; }
      .wmr-val { min-width: 3ch; text-align: center; font-family: var(--font-mono); font-size: var(--fs-lg); }
      .wmr-net { font-family: var(--font-mono); }
      .wmr-secret { border-left: 2px solid var(--gold); padding-left: 10px; }
    `;
    document.head.appendChild(st);
  }

  S.wmr = { defs: {}, creature, expGain, expFor, difficulty, pgPower, expandBonus, assignTitle, addTitleBonus, rarityForLevel, drafts };

  /* =====================================================================
     1. SKILL
     ===================================================================== */
  const PROP_GRADE = "il bonus di ogni riga si moltiplica per il Grado (al Grado I vale già una volta, al Grado X dieci volte).";
  function gradeText(rows, g) {
    const ok = (rows || []).filter((r) => filled(r.what) && Number(r.amount) > 0);
    if (!ok.length) return "";
    return ok.map((r) => `+${nf(r.amount * g)}${r.unit === "%" ? "%" : " " + r.unit} ${r.what.trim()}`).join(", ");
  }
  const isWeaponRule = (st) => st.type === "Combat" && JSON.stringify(st.rows.map((r) => [r.what, Number(r.amount), r.unit])) === JSON.stringify(WEAPON_GRADE.map((r) => [r.what, r.amount, r.unit]));

  define({
    id: "skill", kind: "skills", group: "Personaggi", title: "Skill",
    desc: "Passiva o attiva, con scala dei Gradi I–X, passiva del Grado X e come si ottiene il Grado I.",
    heading: "Nuova skill",
    intro: "Le skill crescono per Gradi I–X (Progressione, Sezione 4). Al Grado X chi la usa crea la propria passiva; oltre il X nasce una scuola personale.",
    fresh: () => ({ name: "", type: "Combat", mode: "passiva", res: "SP", cost: "", cd: "", effect: "",
      rows: clone(WEAPON_GRADE), rowsAuto: true, costRed: 0, passiveX: "", school: false, schoolName: "",
      grade1: GRADE1_RULE.Combat, grade1Auto: true, method: "Level up", charId: "", startGrade: 1 }),
    onField(st, path) {
      if (path === "type") {
        if (st.rowsAuto) st.rows = st.type === "Combat" ? clone(WEAPON_GRADE) : [{ what: "", amount: "", unit: "%" }];
        if (st.grade1Auto) st.grade1 = GRADE1_RULE[st.type] || "";
      }
      if (path.startsWith("rows.")) st.rowsAuto = false;
      if (path === "grade1") st.grade1Auto = false;
    },
    act(st, a, el) {
      if (a === "row-add") { st.rows.push({ what: "", amount: "", unit: "%" }); st.rowsAuto = false; return `rows.${st.rows.length - 1}.what`; }
      if (a === "row-rm") { st.rows.splice(Number(el.dataset.i), 1); st.rowsAuto = false; return "row-add"; }
      if (a === "row-rule") { st.rows = clone(WEAPON_GRADE); st.rowsAuto = true; }
    },
    steps: [
      { label: "Identità",
        check(st) {
          const n = st.name.trim();
          if (n.length < 2) return "dai un nome alla skill (almeno 2 caratteri).";
          if (lib("skills").some((x) => x.name.toLowerCase() === n.toLowerCase())) return `«${n}» esiste già nella libreria.`;
          return "";
        },
        html: () => `
          ${fText("name", "Nome della skill", { req: true, max: 40, ph: "es. Lancia, Conciatura, Comando: Ritirata" })}
          ${fPicks("type", "Tipo", SKILL_TYPES)}
          ${fPicks("mode", "Natura", [{ v: "passiva", l: "Passiva", sub: "sempre attiva, migliora con l'uso" }, { v: "attiva", l: "Attiva", sub: "si usa, costa MP o SP" }])}` },
      { label: "Effetto",
        check(st) {
          if (st.mode === "attiva") {
            if (!isInt(st.cost, 1, 99999)) return "indica il costo in " + st.res + " (intero ≥ 1).";
            if (!isInt(st.cd, 0, 99)) return "indica il cooldown in turni (0–99).";
          }
          if (!filled(st.effect, 5)) return "descrivi l'effetto (almeno 5 caratteri).";
          return "";
        },
        html: (st) => st.mode === "attiva" ? `
          <div class="wz-grid2">
            ${fPicks("res", "Risorsa", [{ v: "SP", l: "Stamina (SP)" }, { v: "MP", l: "Mana (MP)" }])}
            <div class="wz-grid2">${fNum("cost", "Costo", { req: true, min: 1, ph: "15" })}${fNum("cd", "Cooldown (turni)", { req: true, min: 0, max: 99, ph: "3" })}</div>
          </div>
          ${fText("effect", "Effetto", { req: true, area: true, ph: "es. +50% danno fisico al prossimo colpo" })}
          ${ref("Esempi dal regolamento: Attacco Possente 15 SP, +50% danno fisico, cooldown 3; Dardo Magico 20 MP, colpisce sempre, cooldown 1 (Creazione personaggio).")}`
          : `${fText("effect", "Effetto della passiva", { req: true, area: true, ph: "es. Riconosce le pelli migliori e ne ricava materiale di qualità superiore" })}
          ${ref("Una skill passiva non ha costo né cooldown: lavora sempre, e migliora salendo di Grado.")}` },
      { label: "Gradi",
        check(st) {
          if (!st.rows.length) return "aggiungi almeno una riga a «cosa migliora per Grado».";
          if (st.rows.some((r) => !filled(r.what) || !(Number(r.amount) > 0))) return "ogni riga della scala vuole cosa migliora e un valore maggiore di 0.";
          if (st.mode === "attiva" && !(Number(st.costRed) >= 0 && Number(st.costRed) <= 10)) return "la riduzione del costo per Grado va da 0 a 10%.";
          if (!filled(st.passiveX, 5)) return "descrivi la passiva sbloccata al Grado X.";
          if (st.school && !filled(st.schoolName, 2)) return "dai un nome alla scuola oltre il Grado X, o togli la spunta.";
          return "";
        },
        html: (st) => `
          <div class="field">
            <span class="label">Cosa migliora per Grado ${isWeaponRule(st) ? ruleChip("Progressione, Sezione 4: +2% precisione e +1% danno per Grado") : ""} ${prop(PROP_GRADE)}</span>
            <div class="wmr-lines">${st.rows.map((r, i) => `<div class="wmr-line">
              ${fText(`rows.${i}.what`, "Cosa", { cls: "wmr-grow", ph: "Precisione" })}
              ${fNum(`rows.${i}.amount`, "Per Grado", { cls: "wmr-narrow", min: 0, step: 0.5, ph: "2" })}
              ${fSel(`rows.${i}.unit`, "Unità", ["%", "punti"], { cls: "wmr-narrow" })}
              ${btn("row-rm", "✕", { cls: "icon ghost", i, id: `rm-${i}`, label: `Togli la riga ${i + 1}` })}
            </div>`).join("")}</div>
            <div class="row">${btn("row-add", "＋ Aggiungi riga", { id: "row-add", disabled: st.rows.length >= 6 })}
              ${st.type === "Combat" && !isWeaponRule(st) ? btn("row-rule", "Usa la regola delle armi", { cls: "ghost", id: "row-rule" }) : ""}</div>
            <span class="hint">Regola per le skill d'arma: +2% precisione e +1% danno per Grado; il regolamento cita anche costi di stamina ridotti e 1–2 tecniche nuove per Grado.</span>
          </div>
          ${st.mode === "attiva" ? fNum("costRed", "Riduzione del costo per Grado (%)", { min: 0, max: 10, step: 0.5, hint: "Il regolamento dice «costi ridotti» senza un numero: 0 lascia il costo fisso.", after: Number(st.costRed) > 0 ? prop("percentuale di riduzione del costo per Grado decisa qui") : "" }) : ""}
          ${fText("passiveX", "Passiva sbloccata al Grado X", { req: true, area: true, rows: 2, ph: "es. Gli effetti dei consumabili ingeriti raddoppiano" })}
          ${fCheck("school", "Prevede una scuola o uno stile oltre il Grado X")}
          ${st.school ? fText("schoolName", "Nome della scuola", { req: true, ph: "es. Lancia del Gelo", hint: "Oltre il X la skill diventa una scuola personale con i suoi Gradi I–X (Progressione, Sezione 5)." }) : ""}` },
      { label: "Ottenimento",
        check(st) { return filled(st.grade1, 5) ? "" : "scrivi come si ottiene il Grado I."; },
        html: (st) => `
          ${fText("grade1", "Condizione per il Grado I", { req: true, area: true, rows: 2, after: GRADE1_RULE[st.type] && st.grade1 === GRADE1_RULE[st.type] ? ruleChip("Progressione, Sezione 3: primo Grado di una nuova abilità") : "",
            hint: "Regola: armi al primo uso vero in combattimento; mestieri dopo un lavoro completo sotto la guida di un PNG del mestiere." })}
          ${fSel("method", "Come si acquisisce", ACQUIRE, { hint: "Metodi di acquisizione della Progressione, Sezione 3." })}` },
      { label: "Assegna",
        check(st, ctx) {
          const c = charById(ctx, st.charId);
          if (!c) return "";
          const list = st.mode === "attiva" ? c.activeSkills || [] : c.skills || [];
          if (list.some((x) => String(x.name).toLowerCase() === st.name.trim().toLowerCase())) return `${c.name} ha già una skill chiamata «${st.name.trim()}».`;
          return "";
        },
        html: (st, ctx) => `
          ${fSel("charId", "Assegna a un PG (facoltativo)", charOpts(ctx), { hint: st.mode === "attiva" ? "Finisce tra le Skill attive del PG, al Grado I e 0%." : "Finisce tra le Skill del PG, al Grado I e 0%." })}
          ${ref("La skill entra comunque nella libreria della campagna, pronta per classi, titoli e libri.")}` },
    ],
    preview(st, ctx) {
      const R = S.rules;
      const g = (n) => gradeText(st.rows, n) || DASH;
      const allGrades = st.rows.length ? R.GRADES.map((nm, i) => `${R.ROMAN[i + 1]} ${nm}: ${gradeText(st.rows, i + 1) || "—"}`).join("\n") : "";
      const cost = Number(st.cost) || 0;
      const red = Number(st.costRed) || 0;
      const costX = cost * (1 - (red * 9) / 100);
      const c = charById(ctx, st.charId);
      return pvWin("SKILL", nameOr(st.name, "Skill senza nome"), `
        ${row("Tipo", `<span class="chip violet">${esc(st.type)}</span>`)}
        ${row("Natura", st.mode === "attiva" ? "Attiva" : "Passiva")}
        ${st.mode === "attiva" ? row("Costo", cost ? `<span class="num">${ni(cost)} ${esc(st.res)}</span>` : DASH, red > 0 && cost ? `Grado I: ${ni(cost)} ${st.res}\nGrado X: ${nf(costX)} ${st.res}\n= ${cost} × (1 − ${nf(red)}% × 9)` : "") : ""}
        ${st.mode === "attiva" ? row("Cooldown", st.cd !== "" ? `<span class="num">${esc(st.cd)}</span> turni` : DASH) : ""}
        ${trow("Effetto", st.effect)}
        ${sec("Maestria")}
        ${row("Grado I", g(1), allGrades)}
        ${row("Grado V", g(5), allGrades)}
        ${row("Grado X", g(10), allGrades)}
        ${trow("Passiva al X", st.passiveX)}
        ${row("Oltre il X", st.school && filled(st.schoolName) ? esc(st.schoolName) : DASH, "Al Grado X la skill evolve in una scuola personale con i suoi Gradi I–X (Progressione, Sezione 5).")}
        ${sec("Ottenimento")}
        ${trow("Grado I", st.grade1)}
        ${row("Metodo", esc(st.method))}
        ${row("Assegnata a", c ? esc(c.name) : DASH)}`);
    },
    build(st, ctx) {
      const c = charById(ctx, st.charId);
      const name = st.name.trim();
      const att = st.mode === "attiva";
      return {
        name, type: st.type, mode: st.mode, res: att ? st.res : null, cost: att ? Number(st.cost) : null, cd: att ? Number(st.cd) : null,
        effect: st.effect.trim(), perGrade: clone(st.rows), costRedPerGrade: att ? Number(st.costRed) || 0 : 0,
        passiveX: st.passiveX.trim(), school: st.school ? st.schoolName.trim() : null, grade1: st.grade1.trim(), method: st.method,
        assignedTo: c ? c.id : null,
        summary: `${st.type} · ${att ? `attiva, ${st.cost} ${st.res}, cd ${st.cd}` : "passiva"} · Grado I: +${gradeText(st.rows, 1).replace(/^\+/, "")}${c ? ` · assegnata a ${c.name}` : ""}`,
      };
    },
    apply(st, ctx, e) {
      const c = charById(ctx, e.assignedTo);
      if (!c) return;
      if (e.mode === "attiva") (c.activeSkills = c.activeSkills || []).push({ name: e.name, effect: e.effect, lvl: 1, pct: 0, cost: `${e.cost} ${e.res}`, cd: e.cd });
      else (c.skills = c.skills || []).push({ name: e.name, lvl: 1, pct: 0, type: e.type });
    },
  });

  /* =====================================================================
     2. CLASSE
     ===================================================================== */
  const CLASS_TYPES = [{ v: "base", l: "Base", sub: "scelta alla creazione" }, { v: "avanzata", l: "Avanzata", sub: "si sblocca giocando" }, { v: "produzione", l: "Di produzione", sub: "mestiere, si sblocca giocando" }];
  const CLASS_LABEL = { base: "Classe base", avanzata: "Classe avanzata", produzione: "Classe di produzione" };
  function classSkill(st) {
    if (st.abMode === "lib") {
      const s = lib("skills").find((x) => x.name === st.abLib);
      return s ? { name: s.name, res: s.res, cost: s.cost, cd: s.cd, effect: s.effect, mode: s.mode, fromLibrary: true } : null;
    }
    return { name: st.ab.name.trim(), res: st.ab.res, cost: Number(st.ab.cost), cd: Number(st.ab.cd), effect: st.ab.effect.trim(), mode: "attiva", fromLibrary: false };
  }
  function skillLine(s) {
    if (!s) return "";
    return s.mode === "attiva" ? `${s.cost} ${s.res} · ${s.effect} · cooldown ${s.cd} turni` : `Passiva · ${s.effect}`;
  }

  define({
    id: "classe", kind: "classes", group: "Personaggi", title: "Classe",
    desc: "Classe base, avanzata o di produzione: come si sblocca, abilità iniziale, equipaggiamento e talenti.",
    heading: "Nuova classe",
    intro: "Alla creazione esistono solo le quattro classi base; le altre si sbloccano giocando, e la via la decide il narratore caso per caso (Progressione, Sezione 2).",
    fresh: () => ({ name: "", ctype: "avanzata", focus: "", from: "", unlock: "", teacher: "", minLevel: "", keyStats: [],
      abMode: lib("skills").length ? "lib" : "new", abLib: (lib("skills")[0] || {}).name || "", ab: { name: "", res: "SP", cost: "", cd: "", effect: "" },
      equip: [{ name: "", note: "" }], tal: { 5: "", 10: "", 15: "", 20: "" } }),
    act(st, a, el) {
      if (a === "eq-add") { st.equip.push({ name: "", note: "" }); return `equip.${st.equip.length - 1}.name`; }
      if (a === "eq-rm") { st.equip.splice(Number(el.dataset.i), 1); return "eq-add"; }
    },
    steps: [
      { label: "Identità",
        check(st, ctx) {
          const n = st.name.trim();
          if (n.length < 2) return "dai un nome alla classe.";
          const taken = [...lib("classes").map((x) => x.name), ...((ctx.state.data.classes || []).map((x) => x.name))];
          if (taken.some((x) => x.toLowerCase() === n.toLowerCase())) return `la classe «${n}» esiste già.`;
          if (!filled(st.focus, 5)) return "descrivi la classe e il suo focus.";
          return "";
        },
        html: (st) => `
          ${fText("name", "Nome della classe", { req: true, max: 40, ph: "es. Paladino, Domatore, Conciatore" })}
          ${fPicks("ctype", "Tipo", CLASS_TYPES)}
          ${st.ctype === "base" ? `<div class="sysmsg"><span class="tag">[ATTENZIONE]</span><span>Il regolamento prevede solo quattro classi base (Guerriero, Mago, Ladro, Chierico). Una quinta cambia la creazione per tutti.</span></div>` : ""}
          ${fText("focus", "Descrizione e focus", { req: true, area: true, ph: "es. Combattente sacro: protegge gli alleati e punisce i non-morti" })}` },
      { label: "Sblocco",
        check(st) {
          if (st.ctype !== "base" && !filled(st.unlock, 10)) return "spiega come si sblocca giocando (almeno 10 caratteri).";
          if (st.minLevel !== "" && !isInt(st.minLevel, 1, 999)) return "il livello minimo va da 1 a 999, o lascialo vuoto.";
          if (!st.keyStats.length) return "scegli almeno una statistica chiave.";
          return "";
        },
        html: (st, ctx) => `
          ${st.ctype === "base"
            ? `<div class="sysmsg gold"><span class="tag">[SBLOCCO]</span><span>Classe base: disponibile alla creazione del personaggio.</span></div>`
            : `${fSel("from", "Classe di partenza", [{ v: "", l: "Qualsiasi" }, ...(ctx.state.data.classes || []).map((c) => c.name), ...lib("classes").map((c) => c.name)])}
               ${fText("unlock", "Come si sblocca giocando", { req: true, area: true, ph: "es. Completare l'addestramento al Tempio di Luxor e farsi benedire da un Paladino di livello 200+",
                 hint: "Non c'è uno schema unico: un Paladino finisce un addestramento, un domatore di draghi o una maid hanno strade diverse." })}
               <div class="wz-grid2">${fText("teacher", "Chi la insegna o dove", { ph: "es. Fra' Teodoro, Tempio di Luxor" })}${fNum("minLevel", "Livello minimo (facoltativo)", { min: 1, max: 999 })}</div>`}
          ${fPicks("keyStats", "Statistiche chiave", ["STR", "DEX", "VIT", "INT", "FIN", "AUT"].map((k) => ({ v: k, l: k, sub: STAT_NAME[k] })), { multi: true, req: true })}` },
      { label: "Abilità iniziale",
        check(st) {
          if (st.abMode === "lib") return lib("skills").some((x) => x.name === st.abLib) ? "" : "scegli una skill della libreria.";
          if (!filled(st.ab.name, 2)) return "dai un nome all'abilità.";
          if (!isInt(st.ab.cost, 1, 99999)) return "indica il costo (intero ≥ 1).";
          if (!isInt(st.ab.cd, 0, 99)) return "indica il cooldown in turni (0–99).";
          if (!filled(st.ab.effect, 5)) return "descrivi l'effetto dell'abilità.";
          return "";
        },
        html: (st) => {
          const skills = lib("skills");
          return `
          ${fPicks("abMode", "Origine", [{ v: "lib", l: "Dalla libreria", sub: skills.length ? `${skills.length} skill create` : "nessuna skill ancora", disabled: !skills.length, title: skills.length ? "" : "Crea prima una skill con il wizard Skill" }, { v: "new", l: "Nuova qui", sub: "abilità attiva" }])}
          ${st.abMode === "lib"
            ? fSel("abLib", "Skill della libreria", skills.map((s) => ({ v: s.name, l: `${s.name} · ${s.type} · ${s.mode}` })))
            : `${fText("ab.name", "Nome dell'abilità", { req: true, max: 40, ph: "es. Giuramento" })}
               <div class="wz-grid2">${fPicks("ab.res", "Risorsa", [{ v: "SP", l: "SP" }, { v: "MP", l: "MP" }])}
                 <div class="wz-grid2">${fNum("ab.cost", "Costo", { req: true, min: 1 })}${fNum("ab.cd", "Cooldown", { req: true, min: 0, max: 99 })}</div></div>
               ${fText("ab.effect", "Effetto", { req: true, area: true, rows: 2 })}`}
          ${ref("Riferimento, classi base: Attacco Possente (15 SP, +50% danno fisico, cd 3) · Dardo Magico (20 MP, colpisce sempre, cd 1) · Colpo Furtivo (10 SP, +100% critico se non visto, cd 2) · Cura Minore (25 MP, 40–60 HP, cd 1).")}`;
        } },
      { label: "Equipaggiamento e talenti",
        check(st) { return st.equip.some((e) => filled(e.name, 2)) ? (st.equip.some((e) => !filled(e.name) && filled(e.note)) ? "una riga di equipaggiamento ha la nota ma non il nome." : "") : "indica almeno un oggetto di equipaggiamento iniziale."; },
        html: (st) => `
          <div class="field"><span class="label">Equipaggiamento iniziale <span class="wmr-req" aria-hidden="true">*</span></span>
            <div class="wmr-lines">${st.equip.map((e, i) => `<div class="wmr-line">
              ${fText(`equip.${i}.name`, "Oggetto", { cls: "wmr-grow", ph: "es. Spada di Ferro" })}
              ${fText(`equip.${i}.note`, "Nota", { ph: "es. Req 15 STR" })}
              ${btn("eq-rm", "✕", { cls: "icon ghost", i, id: `eqrm-${i}`, label: `Togli l'oggetto ${i + 1}`, disabled: st.equip.length <= 1 })}
            </div>`).join("")}</div>
            <div class="row">${btn("eq-add", "＋ Aggiungi oggetto", { id: "eq-add", disabled: st.equip.length >= 8 })}</div>
          </div>
          <div class="field"><span class="label">Percorso talenti suggerito</span>
            <div class="wz-grid2">${[5, 10, 15, 20].map((l) => fText(`tal.${l}`, `Livello ${l}`, { ph: l === 5 ? "es. Ispeziona" : "" })).join("")}</div>
            <span class="hint">Talenti e abilità di classe arrivano ogni 5 livelli. Il regolamento non fissa un elenco: il sistema offre ciò che è coerente con come il PG ha giocato, quindi questo è solo un suggerimento al Master.</span>
          </div>` },
    ],
    preview(st, ctx) {
      const sk = classSkill(st);
      const eq = st.equip.filter((e) => filled(e.name));
      return pvWin("CLASSE", nameOr(st.name, "Classe senza nome"), `
        ${row("Tipo", esc(CLASS_LABEL[st.ctype]))}
        ${st.ctype === "base" ? row("Sblocco", "Alla creazione") : trow("Sblocco", st.unlock)}
        ${st.ctype !== "base" ? row("Da", st.from ? esc(st.from) : "Qualsiasi classe") : ""}
        ${st.ctype !== "base" && filled(st.teacher) ? trow("Chi insegna", st.teacher) : ""}
        ${st.minLevel !== "" ? row("Livello minimo", `<span class="num">${esc(st.minLevel)}</span>`) : ""}
        ${row("Stat chiave", st.keyStats.length ? st.keyStats.map((k) => `<span class="chip violet" title="${esc(STAT_NAME[k])}">${k}</span>`).join(" ") : DASH)}
        ${trow("Focus", st.focus)}
        ${sec("Abilità iniziale")}
        ${sk && filled(sk.name) ? row(sk.name, sk.mode === "attiva" && sk.cost ? `<span class="num">${esc(sk.cost)} ${esc(sk.res)}</span>` : "Passiva", esc(skillLine(sk)) + (sk.fromLibrary ? "\nCollegata alla libreria." : "")) : row("Abilità", DASH)}
        ${sec("Equipaggiamento")}
        ${eq.length ? eq.map((e) => row(e.name.trim(), filled(e.note) ? esc(e.note.trim()) : DASH)).join("") : row("Oggetti", DASH)}
        ${sec("Percorso talenti")}
        ${[5, 10, 15, 20].map((l) => trow(`Livello ${l}`, st.tal[l], 30)).join("")}`);
    },
    build(st) {
      const sk = classSkill(st);
      const eq = st.equip.filter((e) => filled(e.name)).map((e) => ({ name: e.name.trim(), note: e.note.trim() }));
      const name = st.name.trim();
      return {
        name, type: st.ctype, focus: st.focus.trim(),
        unlock: st.ctype === "base" ? "Disponibile alla creazione" : st.unlock.trim(), from: st.from || null, teacher: st.teacher.trim(),
        minLevel: st.minLevel === "" ? null : Number(st.minLevel), keyStats: st.keyStats.slice(), skill: sk, equip: eq,
        talents: { 5: st.tal[5].trim(), 10: st.tal[10].trim(), 15: st.tal[15].trim(), 20: st.tal[20].trim() },
        class: { id: slug(name), name, skill: sk.name, skillText: skillLine(sk), equip: eq.map((e) => (e.note ? `${e.name} (${e.note})` : e.name)) },
        summary: `${CLASS_LABEL[st.ctype]} · abilità ${sk.name} · stat ${st.keyStats.join("/")}`,
      };
    },
  });

  /* =====================================================================
     3. RAZZA
     ===================================================================== */
  const RACE_TPL = [
    { name: "Elfi di Eldermoor", origin: "Eldermoor", desc: "Longevi, custodi della magia naturale, legati all'Albero Mondo; saggi ma distaccati dalle faccende dei mortali." },
    { name: "Nani delle Montagne", origin: "Montagne", desc: "Artigiani della forgia dalla resistenza leggendaria, in clan patriarcali fondati sull'onore.", rel: [{ race: "Umani", rel: "Alleati" }] },
    { name: "Dragonborn dei Vulcani", origin: "Regioni vulcaniche", desc: "Discendenti dei draghi, in tribù dove il potere magico fa la gerarchia; respirano l'elemento del loro lignaggio." },
    { name: "Drow", origin: "Profondità", desc: "Elfi corrotti dall'oscurità, esiliati nelle caverne: una società crudele e raffinata." },
    { name: "Svirfneblin", origin: "Profondità", desc: "Gnomi delle profondità, minatori che comunicano con vibrazioni nella roccia." },
    { name: "Duergar", origin: "Profondità", desc: "Nani grigi con poteri psionici, forgiano metalli impossibili alla luce dei funghi." },
    { name: "Halfling", origin: "Eldermoor", desc: "" },
    { name: "Elementali minori", origin: "Qadesh", desc: "" },
  ];
  const RELATIONS = ["Alleati", "Cordiali", "Neutrali", "Diffidenti", "Ostili"];
  const PROP_RACE = "il regolamento non dà statistiche alle razze (gli Immortali arrivano tutti umani). Modificatori da −5 a +5 con somma netta tra −2 e +2.";
  function raceChar(mods) {
    return { level: 1, stats: BASE.map((code) => ({ code, name: STAT_NAME[code], kind: "base", iniziale: 10, creazione: 0, investiti: 0, levelup: 0, altro: Number(mods[code]) || 0, titoli: 0 })) };
  }
  const netMods = (m) => BASE.reduce((s, k) => s + (Number(m[k]) || 0), 0);

  define({
    id: "razza", kind: "races", group: "Personaggi", title: "Razza",
    desc: "Razza nativa con origine, tratti passivi, modificatori alle statistiche, lingue e rapporti.",
    heading: "Nuova razza",
    intro: "Chi arriva ad Aethermoor si manifesta umano; tratti di altre razze si acquisiscono con benedizioni, trasformazioni o rituali (Ambientazione, Razze e popolazioni).",
    fresh: () => ({ name: "", origin: "", originNote: "", desc: "", acquire: "", traits: [{ name: "", effect: "" }],
      mods: { STR: 0, DEX: 0, VIT: 0, INT: 0 }, langs: "", life: "", rel: [{ race: "Umani", rel: "Neutrali" }] }),
    act(st, a, el) {
      if (a === "tpl") {
        const t = RACE_TPL[Number(el.dataset.i)];
        st.name = t.name; st.origin = t.origin; if (t.desc) st.desc = t.desc;
        if (t.rel) st.rel = clone(t.rel);
        return "name";
      }
      if (a === "tr-add") { st.traits.push({ name: "", effect: "" }); return `traits.${st.traits.length - 1}.name`; }
      if (a === "tr-rm") { st.traits.splice(Number(el.dataset.i), 1); return "tr-add"; }
      if (a === "rel-add") { st.rel.push({ race: "", rel: "Neutrali" }); return `rel.${st.rel.length - 1}.race`; }
      if (a === "rel-rm") { st.rel.splice(Number(el.dataset.i), 1); return "rel-add"; }
      if (a === "mod") {
        const k = el.dataset.k;
        st.mods[k] = Math.max(-5, Math.min(5, (Number(st.mods[k]) || 0) + Number(el.dataset.d)));
        return `mod-${k}-${el.dataset.d > 0 ? "p" : "m"}`;
      }
    },
    steps: [
      { label: "Identità",
        check(st) {
          const n = st.name.trim();
          if (n.length < 2) return "dai un nome alla razza.";
          if (lib("races").some((x) => x.name.toLowerCase() === n.toLowerCase())) return `«${n}» esiste già nella libreria.`;
          if (!st.origin) return "scegli l'origine o il regno.";
          if (!filled(st.desc, 10)) return "scrivi una descrizione (almeno 10 caratteri).";
          return "";
        },
        html: (st, ctx) => `
          <div class="field"><span class="label">Parti da una razza dell'ambientazione</span>
            <div class="wmr-picks">${RACE_TPL.map((t, i) => btn("tpl", t.name, { cls: "ghost", i, id: `tpl-${i}` })).join("")}</div>
            <span class="hint">Riempie nome, origine e descrizione da Ambientazione.txt. Tratti e numeri restano da decidere.</span></div>
          ${fText("name", "Nome", { req: true, max: 40 })}
          <div class="wz-grid2">
            ${fSel("origin", "Origine o regno", [{ v: "", l: "Scegli…" }, ...((ctx.state.data.kingdoms || []).map((k) => k.name)), "Montagne", "Regioni vulcaniche", "Profondità", "Altro"], { req: true })}
            ${fText("originNote", "Dettaglio del luogo", { ph: "es. Heartwood, foreste del nord" })}
          </div>
          ${fText("desc", "Descrizione", { req: true, area: true })}
          ${fText("acquire", "Come la ottiene un Immortale (facoltativo)", { area: true, rows: 2, ph: "es. Rituale ancestrale nel cuore di Heartwood", hint: "Benedizione divina, trasformazione magica o rituale ancestrale." })}` },
      { label: "Tratti",
        check(st) {
          const ok = st.traits.filter((t) => filled(t.name, 2) && filled(t.effect, 5));
          if (!ok.length) return "aggiungi almeno un tratto con nome ed effetto.";
          if (st.traits.some((t) => (filled(t.name) || filled(t.effect)) && !(filled(t.name, 2) && filled(t.effect, 5)))) return "completa o togli i tratti a metà.";
          return "";
        },
        html: (st) => `
          <div class="field"><span class="label">Tratti razziali (passivi) <span class="wmr-req" aria-hidden="true">*</span></span>
            <div class="wmr-lines">${st.traits.map((t, i) => `<div class="wmr-line">
              ${fText(`traits.${i}.name`, "Tratto", { ph: "es. Scurovisione" })}
              ${fText(`traits.${i}.effect`, "Effetto", { cls: "wmr-grow", ph: "es. Vede al buio fino a 30 metri" })}
              ${btn("tr-rm", "✕", { cls: "icon ghost", i, id: `trrm-${i}`, label: `Togli il tratto ${i + 1}`, disabled: st.traits.length <= 1 })}
            </div>`).join("")}</div>
            <div class="row">${btn("tr-add", "＋ Aggiungi tratto", { id: "tr-add", disabled: st.traits.length >= 6 })}</div>
          </div>` },
      { label: "Statistiche",
        check(st) {
          const net = netMods(st.mods);
          if (Math.abs(net) > 2) return `somma netta ${signed(net)}: tienila tra −2 e +2 (bilanciamento proposto).`;
          return "";
        },
        html: (st) => `
          <div class="sysmsg"><span class="tag">[PROPOSTA]</span><span>Il regolamento non definisce statistiche razziali. Modificatori da −5 a +5, somma netta tra −2 e +2: ciò che una razza guadagna lo paga altrove.</span></div>
          <div class="field"><span class="label">Modificatori alle statistiche base ${prop(PROP_RACE)}</span>
            <div>${BASE.map((k) => `<div class="wmr-stat">
              <span><b>${k}</b> <span class="muted small">${STAT_NAME[k]}</span></span>
              <span class="wmr-ctl">
                ${btn("mod", "−", { cls: "icon", k, d: -1, id: `mod-${k}-m`, label: `${k} meno 1`, disabled: st.mods[k] <= -5 })}
                <span class="wmr-val" aria-live="polite">${signed(st.mods[k])}</span>
                ${btn("mod", "+", { cls: "icon", k, d: 1, id: `mod-${k}-p`, label: `${k} più 1`, disabled: st.mods[k] >= 5 })}
              </span></div>`).join("")}</div>
            <span class="hint ${Math.abs(netMods(st.mods)) > 2 ? "bad" : ""}">Somma netta: <span class="wmr-net">${signed(netMods(st.mods))}</span>. L'anteprima mostra un PG di livello 1 della razza rispetto a un umano.</span>
          </div>` },
      { label: "Lingue e rapporti",
        check(st) {
          if (!filled(st.langs, 2)) return "indica almeno una lingua.";
          if (!isInt(st.life, 1, 100000)) return "indica la durata della vita in anni (intero ≥ 1).";
          if (st.rel.some((r) => !filled(r.race, 2))) return "dai un nome a ogni razza nei rapporti, o togli la riga.";
          return "";
        },
        html: (st) => `
          <div class="wz-grid2">
            ${fText("langs", "Lingue", { req: true, ph: "es. Comune, Eldarin" })}
            ${fNum("life", "Durata della vita (anni)", { req: true, min: 1, ph: "es. 120" })}
          </div>
          <div class="field"><span class="label">Rapporti con le altre razze</span>
            <div class="wmr-lines">${st.rel.map((r, i) => `<div class="wmr-line">
              ${fText(`rel.${i}.race`, "Razza", { cls: "wmr-grow", ph: "es. Nani" })}
              ${fSel(`rel.${i}.rel`, "Rapporto", RELATIONS)}
              ${btn("rel-rm", "✕", { cls: "icon ghost", i, id: `relrm-${i}`, label: `Togli il rapporto ${i + 1}` })}
            </div>`).join("")}</div>
            <div class="row">${btn("rel-add", "＋ Aggiungi rapporto", { id: "rel-add", disabled: st.rel.length >= 8 })}</div>
            <span class="hint">Dall'ambientazione: i Nani sono alleati tradizionali degli umani.</span>
          </div>` },
    ],
    preview(st) {
      const R = S.rules;
      const race = R.derived(raceChar(st.mods));
      const human = R.derived(raceChar({}));
      const keys = ["hp", "mp", "sp", "evasione", "precisione", "carico"];
      const tc = raceChar(st.mods);
      const traits = st.traits.filter((t) => filled(t.name));
      const nonzero = BASE.filter((k) => Number(st.mods[k]));
      return pvWin("RAZZA", nameOr(st.name, "Razza senza nome"), `
        ${row("Origine", st.origin ? esc(st.origin + (filled(st.originNote) ? " · " + st.originNote.trim() : "")) : DASH)}
        ${trow("Descrizione", st.desc)}
        ${filled(st.acquire) ? trow("Per gli Immortali", st.acquire) : ""}
        ${sec("Tratti")}
        ${traits.length ? traits.map((t) => trow(t.name.trim(), t.effect, 32)).join("") : row("Tratti", DASH)}
        ${sec("Modificatori", prop(PROP_RACE))}
        ${row("Statistiche", nonzero.length ? nonzero.map((k) => `<span class="num">${k} ${signed(st.mods[k])}</span>`).join(" · ") : "nessuno", `Somma netta ${signed(netMods(st.mods))}`)}
        ${sec("PG di livello 1")}
        ${keys.map((k) => {
          const d = R.DERIVED.find((x) => x.key === k);
          const delta = race[k] - human[k];
          const v = `<span class="num">${R.fmt(race[k], d.fmt)}</span>${R.fmt(race[k], d.fmt) !== R.fmt(human[k], d.fmt) ? ` <span class="xs ${delta > 0 ? "" : "muted"}">(${delta > 0 ? "+" : "−"}${R.fmt(Math.abs(delta), d.fmt)})</span>` : ""}`;
          return row(d.label, v, `${d.formula}\n= ${R.explain(d, tc)}\nUmano: ${R.fmt(human[k], d.fmt)}`);
        }).join("")}
        ${sec("Vita e rapporti")}
        ${trow("Lingue", st.langs)}
        ${row("Durata della vita", isInt(st.life, 1, 100000) ? `<span class="num">${ni(st.life)}</span> anni` : DASH)}
        ${st.rel.filter((r) => filled(r.race)).map((r) => row(r.race.trim(), esc(r.rel))).join("")}`);
    },
    build(st) {
      const traits = st.traits.filter((t) => filled(t.name)).map((t) => ({ name: t.name.trim(), effect: t.effect.trim() }));
      const mods = { ...st.mods };
      const ms = BASE.filter((k) => mods[k]).map((k) => `${k} ${signed(mods[k])}`).join(", ") || "nessun modificatore";
      return {
        name: st.name.trim(), origin: st.origin, originNote: st.originNote.trim(), desc: st.desc.trim(), acquire: st.acquire.trim(),
        traits, mods, modsProposal: true, langs: st.langs.split(",").map((s) => s.trim()).filter(Boolean), lifespan: Number(st.life),
        relations: st.rel.filter((r) => filled(r.race)).map((r) => ({ race: r.race.trim(), rel: r.rel })),
        summary: `${st.origin} · ${traits.length} tratti · ${ms} (proposta) · vita ${ni(st.life)} anni`,
      };
    },
  });

  /* =====================================================================
     4. TITOLO
     ===================================================================== */
  const PROP_EVO = "quando un PG ottiene l'evoluzione, il titolo precedente viene sostituito e i suoi bonus tolti.";
  function knownTitles(ctx) {
    const map = new Map();
    for (const t of lib("titles")) map.set(t.name, t.rarity);
    for (const c of chars(ctx)) for (const t of c.titles || []) if (!map.has(t.name)) map.set(t.name, t.rarity);
    return [...map.entries()].map(([name, r]) => ({ name, rarity: r }));
  }
  function incompatList(st) {
    const free = String(st.incompatFree || "").split(",").map((s) => s.trim()).filter(Boolean);
    return [...new Set([...st.incompat, ...free])];
  }
  function titleClash(st, c) {
    if (!c) return "";
    const has = (c.titles || []).map((t) => t.name);
    if (has.some((n) => n.toLowerCase() === st.name.trim().toLowerCase())) return `${c.name} ha già il titolo «${st.name.trim()}».`;
    const bad = incompatList(st).filter((n) => has.includes(n));
    if (bad.length) return `${c.name} ha «${bad.join("», «")}», incompatibile con questo titolo.`;
    return "";
  }

  define({
    id: "titolo", kind: "titles", group: "Personaggi", title: "Titolo",
    desc: "Titolo con rarità, bonus, effetto, requisiti, segreti, incompatibilità ed evoluzione.",
    heading: "Nuovo titolo",
    intro: "Struttura di un titolo: nome, rarità, effetti (bonus, attiva, passiva, stat sbloccate) e requisiti: azione, contesto, testimoni (Sistema Status Sociale, Sezione 1).",
    fresh: () => ({ name: "", rarity: "Comune", how: "", bonus: [{ code: "STR", val: "" }], effType: "nessuno", effText: "", unlocks: "",
      trigger: "", context: "", witnesses: "", secret: false, reveal: "", incompat: [], incompatFree: "", prev: "", next: "", evoCond: "", replacePrev: true, charId: "" }),
    act(st, a, el) {
      if (a === "b-add") { st.bonus.push({ code: "STR", val: "" }); return `bonus.${st.bonus.length - 1}.val`; }
      if (a === "b-rm") { st.bonus.splice(Number(el.dataset.i), 1); return "b-add"; }
    },
    steps: [
      { label: "Identità",
        check(st, ctx) {
          const n = st.name.trim();
          if (n.length < 2) return "dai un nome al titolo.";
          if (lib("titles").some((t) => t.name.toLowerCase() === n.toLowerCase())) return `«${n}» esiste già nella libreria.`;
          if (!filled(st.how, 5)) return "scrivi come si ottiene, in una frase.";
          return "";
        },
        html: (st) => `
          ${fText("name", "Nome evocativo", { req: true, max: 50, ph: "es. Ammazzadraghi" })}
          ${fPicks("rarity", "Rarità", S.rules.RARITY_SCALE.map((r) => ({ v: r.name, l: r.name, rarity: r.name })))}
          ${ref(TITLE_ACQ[st.rarity] ? `Rarità ${esc(st.rarity)}: ${esc(TITLE_ACQ[st.rarity])}.` : `La tabella dei titoli non descrive il grado ${esc(st.rarity)}: sta tra Epico e Leggendario nella scala unica.`)}
          ${fText("how", "Come si ottiene", { req: true, area: true, rows: 2, ph: "es. Uccidere da solo un drago di oltre 300 anni" })}` },
      { label: "Effetti",
        check(st) {
          if (st.bonus.some((b) => !isInt(b.val, -999, 999) || Number(b.val) === 0)) return "ogni bonus vuole un valore intero diverso da 0 (o togli la riga).";
          if (st.effType !== "nessuno" && !filled(st.effText, 5)) return "descrivi l'effetto " + st.effType + ".";
          if (!st.bonus.length && st.effType === "nessuno" && !filled(st.unlocks)) return "un titolo deve dare almeno un bonus, un effetto o una stat sbloccata.";
          return "";
        },
        html: (st) => `
          <div class="field"><span class="label">Bonus alle statistiche</span>
            <div class="wmr-lines">${st.bonus.map((b, i) => `<div class="wmr-line">
              ${fSel(`bonus.${i}.code`, "Statistica", [...["STR", "DEX", "VIT", "INT", "FIN", "AUT"].map((k) => ({ v: k, l: `${k} · ${STAT_NAME[k]}` })), { v: "ALL", l: "Tutte le base (STR, DEX, VIT, INT)" }], { cls: "wmr-grow" })}
              ${fNum(`bonus.${i}.val`, "Valore", { cls: "wmr-narrow", min: -999, max: 999, ph: "+5" })}
              ${btn("b-rm", "✕", { cls: "icon ghost", i, id: `brm-${i}`, label: `Togli il bonus ${i + 1}` })}
            </div>`).join("")}</div>
            <div class="row">${btn("b-add", "＋ Aggiungi bonus", { id: "b-add", disabled: st.bonus.length >= 8 })}</div>
            <span class="hint">I bonus finiscono nella colonna «Titoli» delle statistiche del PG. ${TITLE_EX[st.rarity] ? "Esempio " + esc(st.rarity) + " dal regolamento: " + esc(TITLE_EX[st.rarity]) + "." : ""}</span>
          </div>
          ${fPicks("effType", "Effetto speciale", [{ v: "nessuno", l: "Nessuno" }, { v: "passivo", l: "Passivo" }, { v: "attivo", l: "Attivo" }])}
          ${st.effType !== "nessuno" ? fText("effText", st.effType === "attivo" ? "Effetto attivo (costo, durata, ricarica)" : "Effetto passivo", { req: true, area: true, rows: 2, ph: st.effType === "attivo" ? "es. Invulnerabile per 10 secondi, una volta al giorno" : "es. +5% critici contro umanoidi" }) : ""}
          ${fText("unlocks", "Statistiche sbloccate (facoltativo)", { ph: "es. Autorità" })}` },
      { label: "Requisiti",
        check(st) {
          if (!filled(st.trigger, 5)) return "descrivi l'azione scatenante.";
          if (st.secret && !filled(st.reveal, 5)) return "un titolo segreto vuole il momento in cui si rivela.";
          return "";
        },
        html: (st, ctx) => {
          const others = knownTitles(ctx).filter((t) => t.name !== st.name.trim());
          return `
          ${fText("trigger", "Azione scatenante", { req: true, area: true, rows: 2, ph: "es. Infliggere il colpo di grazia a un drago" })}
          <div class="wz-grid2">${fText("context", "Contesto", { ph: "es. Combattendo da solo" })}${fText("witnesses", "Testimoni", { ph: "es. Almeno un PNG sopravvissuto" })}</div>
          ${fCheck("secret", "Titolo segreto", { hint: "I titoli segreti si rivelano solo in momenti specifici." })}
          ${st.secret ? fText("reveal", "Quando si rivela", { req: true, ph: "es. Al cospetto di un drago antico" }) : ""}
          ${others.length ? fPicks("incompat", "Incompatibile con", others.map((t) => ({ v: t.name, l: t.name, rarity: t.rarity })), { multi: true }) : ""}
          ${fText("incompatFree", others.length ? "Altri titoli incompatibili" : "Titoli incompatibili", { ph: "separati da virgola, es. Santo, Signore delle Tenebre", hint: "Regola: titoli contraddittori non coesistono («Santo» e «Signore delle Tenebre»)." })}`;
        } },
      { label: "Evoluzione",
        check(st) {
          if (st.prev && st.prev === st.next) return "precedente e successivo non possono coincidere.";
          if (st.next && !filled(st.evoCond, 5)) return "scrivi la condizione per evolvere nel titolo successivo.";
          return "";
        },
        html: (st, ctx) => {
          const opts = [{ v: "", l: "Nessuno" }, ...knownTitles(ctx).filter((t) => t.name !== st.name.trim()).map((t) => ({ v: t.name, l: `${t.name} · ${t.rarity}` }))];
          return `
          ${ref("Esempio dal regolamento: «Ammazzadraghi» → «Flagello dei Draghi» dopo 10+ draghi.")}
          <div class="wz-grid2">${fSel("prev", "Evolve da (precedente)", opts)}${fSel("next", "Evolve in (successivo)", opts)}</div>
          ${st.next ? fText("evoCond", "Condizione per evolvere", { req: true, ph: "es. Uccidere 10 draghi" }) : ""}
          ${st.prev ? fCheck("replacePrev", "Sostituisce il precedente sul PG", { after: prop(PROP_EVO) }) : ""}
          ${!knownTitles(ctx).length ? ref("La libreria non ha ancora altri titoli: potrai collegarli quando ne creerai.") : ""}`;
        } },
      { label: "Assegna",
        check(st, ctx) { return titleClash(st, charById(ctx, st.charId)); },
        html: (st, ctx) => `
          ${fSel("charId", "Assegna a un PG (facoltativo)", charOpts(ctx), { hint: "Il titolo entra tra i Titoli del PG e i bonus si sommano alla colonna «Titoli» delle statistiche." })}
          ${ref("Le statistiche che il PG non ha (es. FIN su chi non l'ha sbloccata) restano fuori: l'anteprima le segnala.")}` },
    ],
    preview(st, ctx) {
      const bonus = expandBonus(st.bonus);
      const bonusRows = st.bonus.filter((b) => Number(b.val));
      const c = charById(ctx, st.charId);
      const inc = incompatList(st);
      let assign = "";
      if (c) {
        const prevOwned = st.prev && st.replacePrev && (c.titles || []).find((t) => t.name === st.prev);
        const delta = { ...bonus };
        if (prevOwned) for (const [k, v] of Object.entries(prevOwned.bonus || {})) delta[k] = (delta[k] || 0) - v;
        const lines = Object.entries(delta).filter(([, v]) => v).map(([k, v]) => {
          const r = (c.stats || []).find((x) => x.code === k);
          if (!r) return row(`Titoli ${k}`, `<span class="chip warn">non presente</span>`, `${c.name} non ha la statistica ${k}: il bonus non si applica.`);
          const before = Number(r.titoli) || 0;
          return row(`Titoli ${k}`, `<span class="num">${ni(before)} → <b>${ni(before + v)}</b></span>`, `Colonna Titoli di ${k}: ${before} ${v >= 0 ? "+" : "−"} ${Math.abs(v)}\nTotale ${k}: ${ni(S.rules.statTotal(r))} → ${ni(S.rules.statTotal(r) + v)}`);
        });
        const clash = titleClash(st, c);
        assign = `${sec("Assegnazione")}${row("PG", esc(c.name))}
          ${prevOwned ? row("Sostituisce", esc(prevOwned.name), "Il titolo precedente lascia il posto all'evoluzione e i suoi bonus vengono tolti.") : ""}
          ${clash ? row("Blocco", `<span class="chip bad">incompatibile</span>`, esc(clash)) : ""}
          ${lines.join("") || row("Statistiche", "nessuna variazione")}`;
      }
      return pvWin("TITOLO", `${nameOr(st.name, "Titolo senza nome")} ${S.ui.rarityChip(st.rarity)}`, `
        ${trow("Acquisizione", st.how)}
        ${sec("Effetti")}
        ${bonusRows.length ? row("Bonus", bonusRows.map((b) => `<span class="num">${b.code === "ALL" ? "Tutte" : esc(b.code)} ${signed(b.val)}</span>`).join(" · "), Object.entries(bonus).map(([k, v]) => `${k} ${signed(v)}`).join("\n")) : row("Bonus", DASH)}
        ${st.effType !== "nessuno" ? trow(st.effType === "attivo" ? "Attivo" : "Passivo", st.effText) : ""}
        ${filled(st.unlocks) ? trow("Sblocca", st.unlocks) : ""}
        ${sec("Requisiti")}
        ${trow("Azione", st.trigger)}
        ${filled(st.context) ? trow("Contesto", st.context) : ""}
        ${filled(st.witnesses) ? trow("Testimoni", st.witnesses) : ""}
        ${row("Segreto", st.secret ? `<span class="chip gold">Sì</span>` : "No", st.secret && filled(st.reveal) ? "Si rivela: " + esc(st.reveal.trim()) : "")}
        ${row("Incompatibile", inc.length ? `${inc.length} titol${inc.length === 1 ? "o" : "i"}` : DASH, inc.length ? esc(inc.join("\n")) : "")}
        ${sec("Evoluzione")}
        ${row("Catena", `${st.prev ? esc(st.prev) + " → " : ""}<b>${nameOr(st.name, "questo")}</b>${st.next ? " → " + esc(st.next) : ""}`, st.next && filled(st.evoCond) ? "Evolve quando: " + esc(st.evoCond.trim()) : "")}
        ${assign}`);
    },
    build(st, ctx) {
      const c = charById(ctx, st.charId);
      const bonus = expandBonus(st.bonus);
      return {
        name: st.name.trim(), rarity: st.rarity, how: st.how.trim(), bonus, bonusRows: clone(st.bonus),
        effect: st.effType === "nessuno" ? null : { type: st.effType, text: st.effText.trim() }, unlocks: st.unlocks.trim(),
        trigger: st.trigger.trim(), context: st.context.trim(), witnesses: st.witnesses.trim(),
        secret: st.secret, reveal: st.secret ? st.reveal.trim() : "", incompatible: incompatList(st),
        prev: st.prev || null, next: st.next || null, evoCond: st.next ? st.evoCond.trim() : "", replacePrev: !!(st.prev && st.replacePrev),
        assignedTo: c ? c.id : null,
        summary: `${st.rarity} · ${Object.entries(bonus).map(([k, v]) => `${k} ${signed(v)}`).join(", ") || "nessun bonus"}${st.secret ? " · segreto" : ""}${c ? ` · assegnato a ${c.name}` : ""}`,
      };
    },
    apply(st, ctx, e) {
      const c = charById(ctx, e.assignedTo);
      if (!c) return;
      const missing = assignTitle(c, e, e.replacePrev ? e.prev : null);
      if (missing.length) e.summary += ` (ignorati: ${missing.join(", ")})`;
    },
  });

  /* =====================================================================
     5. PNG
     ===================================================================== */
  const RACES_KNOWN = ["Umano", "Umana", "Elfo", "Nano", "Dragonborn", "Drow", "Svirfneblin", "Duergar", "Halfling", "Elementale minore"];

  define({
    id: "png", kind: "npcs", group: "Mondo", title: "PNG",
    desc: "Personaggio non giocante completo: entra anche nell'archivio PNG dell'Area Master.",
    heading: "Nuovo PNG",
    intro: "I PNG non sanno che gli Immortali sono giocatori: li vedono come forestieri insoliti. La morte di un PNG è definitiva (Sistema PNG, Regola aurea).",
    fresh: () => ({ name: "", level: "", race: "Umano", place: "", role: "", kingdom: "", age: "",
      traits: "", speech: "", motives: "", fears: "", habits: "",
      origin: "", events: "", relations: "", goalShort: "", goalLong: "", conflict: "", skills: "", influence: "", wealth: "", connections: "",
      trust: "Neutrale", knows: "", debts: "", secret: "", fight: false, size: "Normale" }),
    live: {
      rank: (st) => (isInt(st.level, 1, 999) ? `Rango di potere: <b>${esc(S.rules.powerRank(Number(st.level)))}</b>` : "Il livello dà il rango di potere (1–99 Soldati Semplici … 600+ Divinità)."),
    },
    steps: [
      { label: "Anagrafica",
        check(st) {
          if (!filled(st.name, 2)) return "dai un nome al PNG.";
          if (!isInt(st.level, 1, 999)) return "il livello va da 1 a 999.";
          if (!filled(st.race, 2)) return "indica la razza.";
          if (!filled(st.place, 2)) return "indica dove si trova.";
          if (!filled(st.role, 2)) return "indica il ruolo.";
          return "";
        },
        html: (st, ctx) => `
          ${fText("name", "Nome completo", { req: true, max: 60, ph: "es. Elena la Saggia" })}
          <div class="wz-grid2">
            ${fNum("level", "Livello", { req: true, min: 1, max: 999, ph: "45" })}
            ${fText("race", "Razza", { req: true, list: "wmr-races" })}
          </div>
          <datalist id="wmr-races">${[...new Set([...RACES_KNOWN, ...lib("races").map((r) => r.name)])].map((r) => `<option value="${esc(r)}">`).join("")}</datalist>
          <span class="hint" data-live="rank">${C.def.live.rank(st)}</span>
          <div class="wz-grid2">
            ${fText("place", "Luogo", { req: true, ph: "es. Alba Chiara — Il Gallo Storto" })}
            ${fText("role", "Ruolo", { req: true, ph: "es. Locandiera, informatrice" })}
            ${fSel("kingdom", "Regno", [{ v: "", l: "—" }, ...((ctx.state.data.kingdoms || []).map((k) => k.name))])}
            ${fText("age", "Età (apparente / reale)", { ph: "es. 40 / 212" })}
          </div>
          ${ref("Nei villaggi le cariche stanno molto più in basso: un sergente o un sindaco di paese possono essere sotto il livello 100.")}` },
      { label: "Personalità",
        check(st) {
          if (!filled(st.traits, 3)) return "scrivi i tratti dominanti.";
          if (!filled(st.speech, 3)) return "descrivi come parla.";
          return "";
        },
        html: () => `
          ${fText("traits", "Tratti dominanti (3–4)", { req: true, ph: "es. Curiosa, diffidente, generosa con chi paga" })}
          ${fText("speech", "Modo di parlare", { req: true, area: true, rows: 2, ph: "es. Frasi brevi, chiama tutti «ragazzo», ride delle proprie battute" })}
          <div class="wz-grid2">
            ${fText("motives", "Motivazioni profonde", { area: true, rows: 2 })}
            ${fText("fears", "Paure e debolezze", { area: true, rows: 2 })}
          </div>
          ${fText("habits", "Manie e abitudini", { ph: "es. Conta le monete due volte" })}` },
      { label: "Background",
        check(st) {
          if (!filled(st.origin, 3) && !filled(st.events, 3)) return "scrivi almeno l'origine o un evento formativo.";
          if (!filled(st.goalShort, 3) && !filled(st.goalLong, 3)) return "indica almeno un obiettivo (breve o lungo termine).";
          return "";
        },
        html: () => `
          <div class="wz-grid2">
            ${fText("origin", "Origine", { area: true, rows: 2 })}
            ${fText("events", "Eventi formativi", { area: true, rows: 2 })}
          </div>
          ${fText("relations", "Relazioni importanti", { ph: "es. Sorella del capitano Orsino" })}
          <div class="wz-grid2">
            ${fText("goalShort", "Obiettivo a breve termine")}
            ${fText("goalLong", "Obiettivo a lungo termine")}
          </div>
          ${fText("conflict", "Conflitto interno")}
          <div class="wz-grid2">
            ${fText("skills", "Competenze")}
            ${fText("influence", "Influenza")}
            ${fText("wealth", "Ricchezze")}
            ${fText("connections", "Connessioni")}
          </div>` },
      { label: "Rapporto con i PG",
        check(st) { return filled(st.knows, 3) ? "" : "scrivi cosa sa dei PG (anche «Niente»)."; },
        html: () => `
          ${fPicks("trust", "Fiducia iniziale verso il gruppo", Object.keys(TRUST))}
          ${fText("knows", "Cosa sa dei PG", { req: true, area: true, rows: 2, hint: "Ricorda: per i PNG gli Immortali sono forestieri, non giocatori." })}
          ${fText("debts", "Debiti e favori", { ph: "es. Kelvin le deve due notti non pagate" })}
          <div class="wmr-secret">${fText("secret", "Segreto (solo Master)", { area: true, rows: 2 })}</div>` },
      { label: "Combattimento",
        html: (st) => {
          const k = creature(st.level, "Comune", st.size);
          return `
          ${fCheck("fight", "Ha statistiche di combattimento")}
          ${st.fight ? `${fPicks("size", "Taglia", SIZES.map((s) => ({ v: s.v, l: s.v, sub: `Vita ×${nf(s.m)}` })))}
            <div class="sysmsg"><span class="tag">[COMBAT]</span><span>Creatura Comune, livello ${esc(st.level)}: Vita ${ni(k.hp)} · Danno base ${ni(k.dmg)}</span></div>
            ${ref("Formule delle creature (Combat): Danno base = (10 + livello×6) × rarità; Vita = (40 + livello×20) × rarità × taglia. Un PNG è calcolato come creatura Comune (×1); le creature nominate possono avere di più, a giudizio del narratore.")}`
            : ref("Facoltativo: spunta per calcolare Vita e danno come creatura di rarità Comune.")}`;
        } },
    ],
    preview(st, ctx) {
      const k = creature(st.level, "Comune", st.size);
      const lv = isInt(st.level, 1, 999) ? Number(st.level) : null;
      return pvWin("PNG", nameOr(st.name, "PNG senza nome"), `
        ${row("Livello", lv ? `<span class="num">${lv}</span>` : DASH, lv ? "Rango di potere: " + esc(S.rules.powerRank(lv)) : "")}
        ${trow("Razza", st.race)}
        ${trow("Luogo", st.place)}
        ${trow("Ruolo", st.role)}
        ${st.kingdom ? row("Regno", esc(st.kingdom)) : ""}
        ${filled(st.age) ? trow("Età", st.age) : ""}
        ${sec("Personalità")}
        ${trow("Tratti", st.traits)}
        ${trow("Parla", st.speech)}
        ${filled(st.motives) ? trow("Motivazioni", st.motives) : ""}
        ${filled(st.fears) ? trow("Paure", st.fears) : ""}
        ${sec("Background e obiettivi")}
        ${trow("Origine", st.origin || st.events)}
        ${filled(st.goalShort) ? trow("Breve termine", st.goalShort) : ""}
        ${filled(st.goalLong) ? trow("Lungo termine", st.goalLong) : ""}
        ${row("Risorse", [st.skills, st.influence, st.wealth, st.connections].filter((x) => filled(x)).length ? "vedi dettaglio" : DASH,
          [["Competenze", st.skills], ["Influenza", st.influence], ["Ricchezze", st.wealth], ["Connessioni", st.connections]].filter(([, v]) => filled(v)).map(([l, v]) => `${l}: ${esc(v.trim())}`).join("\n"))}
        ${sec("Rapporto con i PG")}
        ${row("Fiducia", `<span class="chip ${TRUST[st.trust]}">${esc(st.trust)}</span>`)}
        ${trow("Sa", st.knows)}
        ${trow("Debiti e favori", st.debts)}
        ${row("Segreto", filled(st.secret) ? `<span class="chip gold">solo Master</span>` : DASH, filled(st.secret) ? esc(st.secret.trim()) : "")}
        ${st.fight ? `${sec("Combattimento")}
          ${row("Vita", `<span class="num">${ni(k.hp)}</span>`, `(40 + livello×20) × rarità × taglia\n= ${k.hpF}`)}
          ${row("Danno base", `<span class="num">${ni(k.dmg)}</span>`, `(10 + livello×6) × rarità\n= ${k.dmgF}`)}
          ${row("Rarità · taglia", `Comune · ${esc(st.size)}`)}` : ""}`);
    },
    build(st, ctx) {
      const name = st.name.trim();
      const ids = new Set((ctx.state.data.npcs || []).map((n) => n.id));
      let id = slug(name), i = 2;
      while (ids.has(id)) id = `${slug(name)}-${i++}`;
      const k = creature(st.level, "Comune", st.size);
      const t = (s) => String(s || "").trim();
      const session = (ctx.state.data.campaign && ctx.state.data.campaign.session) || "—";
      const npc = {
        id, name, level: Number(st.level), race: t(st.race), place: t(st.place), role: t(st.role), trust: st.trust,
        knows: t(st.knows), debts: t(st.debts) || "—", last: `Sessione ${session} — creato nella Forgia del Master.`, secret: t(st.secret) || "—",
        kingdom: st.kingdom, age: t(st.age),
        personality: { traits: t(st.traits), speech: t(st.speech), motives: t(st.motives), fears: t(st.fears), habits: t(st.habits) },
        background: { origin: t(st.origin), events: t(st.events), relations: t(st.relations) },
        goals: { short: t(st.goalShort), long: t(st.goalLong), conflict: t(st.conflict) },
        resources: { skills: t(st.skills), influence: t(st.influence), wealth: t(st.wealth), connections: t(st.connections) },
        combat: st.fight ? { rarity: "Comune", size: st.size, hp: k.hp, dmg: k.dmg } : null,
        history: [],
      };
      return { name, npc, summary: `Lv ${npc.level} · ${npc.race} · ${npc.role} · ${npc.place} · fiducia ${npc.trust}` };
    },
  });

  /* =====================================================================
     6. INCONTRO
     ===================================================================== */
  const ENVS = ["Foresta", "Montagna", "Grotta o dungeon", "Città", "Deserto", "Ghiacci", "Mare o costa", "Palude", "Sottosuolo", "Rovine", "Piano oscuro"];
  const PROP_DIFF = "difficoltà = (Vita totale creature × Danno totale creature) / (Vita totale gruppo × Danno totale gruppo). Danno di un PG = Base arma equipaggiata (o media della rarità tipica per il suo livello) × max(molt. fisico, molt. magico) × attacchi per turno. Soglie: <0,1 Banale, <0,3 Facile, <0,7 Equilibrato, <1,5 Difficile, <4 Mortale, oltre Impossibile. Non conta Difesa, critici, abilità.";
  const PROP_LOOT = "il bottino ha la rarità della creatura più rara dell'incontro.";
  const PROP_EXP = "ogni PG che partecipa riceve l'EXP intera di ogni creatura (nessuna divisione nel gruppo).";
  function avgLevel(ctx, ids) {
    const cs = chars(ctx).filter((c) => ids.includes(c.id));
    return cs.length ? Math.round(cs.reduce((s, c) => s + c.level, 0) / cs.length) : 1;
  }
  const validCreatures = (st) => st.creatures.filter((c) => filled(c.name) && isInt(c.level, 1, 999) && isInt(c.count, 1, 99));
  function topRarity(cs) {
    return cs.reduce((best, c) => (rarity(c.rarity).grade > rarity(best).grade ? c.rarity : best), "Comune");
  }

  define({
    id: "incontro", kind: "encounters", group: "Mondo", title: "Incontro",
    desc: "Scontro con creature calcolate dalle formule del Combat, difficoltà, EXP e bottino stimati.",
    heading: "Nuovo incontro",
    intro: "Le creature seguono il Combat: Danno base = (10 + livello×6) × rarità; Vita = (40 + livello×20) × rarità × taglia. La rarità vale grado³ (Raro ×27).",
    fresh(ctx) {
      const party = chars(ctx).map((c) => c.id);
      const level = avgLevel(ctx, party);
      return { name: "", place: "", env: "Foresta", conditions: "", party, level,
        creatures: [{ name: "", level, rarity: "Comune", size: "Normale", count: 1 }], hooks: "", lootNote: "" };
    },
    act(st, a, el, ctx) {
      if (a === "avg") { st.level = avgLevel(ctx, st.party); return "avg"; }
      if (a === "c-add") { st.creatures.push({ name: "", level: Number(st.level) || 1, rarity: "Comune", size: "Normale", count: 1 }); return `creatures.${st.creatures.length - 1}.name`; }
      if (a === "c-rm") { st.creatures.splice(Number(el.dataset.i), 1); return "c-add"; }
    },
    live: {
      avg: (st, ctx) => `Media dei PG scelti: <b class="num">${avgLevel(ctx, st.party)}</b>`,
      crow(st, ctx, el) {
        const c = st.creatures[Number(el.dataset.i)];
        if (!c) return "";
        const k = creature(c.level, c.rarity, c.size);
        return `<span class="chip muted" title="${esc(`(40 + livello×20) × rarità × taglia = ${k.hpF}`)}">Vita ${ni(k.hp)}</span>
          <span class="chip muted" title="${esc(`(10 + livello×6) × rarità = ${k.dmgF}`)}">Danno ${ni(k.dmg)}</span>`;
      },
    },
    steps: [
      { label: "Scena",
        check(st) {
          if (!filled(st.name, 2)) return "dai un nome all'incontro.";
          if (!filled(st.place, 2)) return "indica il luogo.";
          return "";
        },
        html: () => `
          ${fText("name", "Nome dell'incontro", { req: true, max: 60, ph: "es. Imboscata al guado" })}
          <div class="wz-grid2">
            ${fText("place", "Luogo", { req: true, ph: "es. Guado del Salice, a nord di Alba Chiara" })}
            ${fSel("env", "Ambiente", ENVS)}
          </div>
          ${fText("conditions", "Condizioni ambientali", { area: true, rows: 2, ph: "es. Nebbia fitta: −20% precisione a distanza; acqua alle ginocchia" })}` },
      { label: "Gruppo",
        check(st) {
          if (!st.party.length) return "scegli almeno un PG che partecipa.";
          if (!isInt(st.level, 1, 999)) return "il livello del gruppo va da 1 a 999.";
          return "";
        },
        html: (st, ctx) => `
          ${fPicks("party", "PG che partecipano", chars(ctx).map((c) => ({ v: c.id, l: c.name, sub: `Lv ${c.level} · ${c.classe || ""}` })), { multi: true, req: true })}
          <div class="wz-grid2">
            ${fNum("level", "Livello del gruppo", { req: true, min: 1, max: 999 })}
            <div class="field"><span class="label">Media</span>
              <div class="row"><span class="small" data-live="avg">${C.def.live.avg(st, ctx)}</span>${btn("avg", "Usa la media", { cls: "ghost", id: "avg" })}</div></div>
          </div>
          ${ref("Il livello del gruppo serve per l'EXP indicativa e come livello iniziale delle creature; la difficoltà usa i PG scelti, uno per uno.")}` },
      { label: "Creature",
        check(st) {
          if (!st.creatures.length) return "aggiungi almeno una creatura.";
          for (const [i, c] of st.creatures.entries()) {
            if (!filled(c.name)) return `la creatura ${i + 1} non ha un nome.`;
            if (!isInt(c.level, 1, 999)) return `livello della creatura ${i + 1}: da 1 a 999.`;
            if (!isInt(c.count, 1, 99)) return `numero della creatura ${i + 1}: da 1 a 99.`;
          }
          return "";
        },
        html: (st) => `
          <div class="wmr-lines">${st.creatures.map((c, i) => `<div class="wmr-line">
            ${fText(`creatures.${i}.name`, "Creatura", { cls: "wmr-grow", ph: "es. Lupo grigio" })}
            ${fNum(`creatures.${i}.level`, "Livello", { cls: "wmr-narrow", min: 1, max: 999 })}
            ${fNum(`creatures.${i}.count`, "Numero", { cls: "wmr-narrow", min: 1, max: 99 })}
            ${fSel(`creatures.${i}.rarity`, "Rarità", S.rules.RARITIES)}
            ${fSel(`creatures.${i}.size`, "Taglia", SIZES.map((s) => ({ v: s.v, l: `${s.v} ×${nf(s.m)}` })))}
            ${btn("c-rm", "✕", { cls: "icon ghost", i, id: `crm-${i}`, label: `Togli la creatura ${i + 1}`, disabled: st.creatures.length <= 1 })}
            <div class="wmr-calc" data-live="crow" data-i="${i}">${C.def.live.crow(st, C.ctx, { dataset: { i } })}</div>
          </div>`).join("")}</div>
          <div class="row">${btn("c-add", "＋ Aggiungi creatura", { id: "c-add", disabled: st.creatures.length >= 12 })}</div>
          ${ref("Goblin, lupi e bestie ordinarie sono Comuni; i draghi Leggendari. La taglia cambia solo la Vita: Fragile ×0,5, Normale ×1, Robusta ×1,5.")}` },
      { label: "Bottino e ganci",
        html: (st) => {
          const cs = validCreatures(st);
          const top = topRarity(cs);
          return `
          <div class="sysmsg gold"><span class="tag">[BOTTINO]</span><span>Suggerito: oggetti ${esc(top)} — arma con Base danno ${baseRange(top)}. ${prop(PROP_LOOT)}</span></div>
          ${fText("lootNote", "Bottino deciso dal Master", { area: true, rows: 2, ph: "es. Zanna di lupo (Comune), 12 Scellini" })}
          ${fText("hooks", "Ganci narrativi", { area: true, rows: 3, ph: "es. Uno dei lupi porta un collare con lo stemma di Orsino" })}
          ${ref("Bersagli inermi o inattivi danno metà EXP (Progressione, Sezione 2).")}`;
        } },
    ],
    preview(st, ctx) {
      const cs = validCreatures(st);
      const pcs = chars(ctx).filter((c) => st.party.includes(c.id));
      const lv = Number(st.level) || 1;
      const d = cs.length && pcs.length ? difficulty(cs, pcs) : null;
      const exp = expFor(lv, cs);
      const expTip = [`PG di livello ${lv}: ${nf(exp.pct)}%`, ...exp.parts, "", ...pcs.map((p) => `${p.name} (Lv ${p.level}): ${nf(expFor(p.level, cs).pct)}%`),
        "", "Pari livello 2%, ±1 punto per livello di differenza (0–10%); dal lv 10 metà, dal 50 un quarto."].join("\n");
      const top = topRarity(cs);
      const diffTip = d ? [`Creature: Vita ${ni(d.cHP)} × Danno ${ni(d.cD)}`, `Gruppo: Vita ${ni(d.pHP)} × Danno ${ni(d.pD)}`, `Rapporto: ${nf(d.ratio)}`, "",
        ...pcs.map((p) => { const w = pgPower(p); return `${p.name}: Vita ${ni(w.hp)}, danno ${ni(w.dmg)} (${w.weapon}: ${ni(w.base)} × ${nf(w.molt)} × ${nf(w.att)})`; })].join("\n") : "";
      return pvWin("INCONTRO", nameOr(st.name, "Incontro senza nome"), `
        ${row("Luogo", filled(st.place) ? esc(st.place.trim()) + ` <span class="muted">· ${esc(st.env)}</span>` : DASH)}
        ${row("Gruppo", `${pcs.length} PG · lv <span class="num">${esc(st.level)}</span>`, pcs.map((p) => `${p.name} · Lv ${p.level}`).join("\n"))}
        ${sec("Creature")}
        ${cs.length ? cs.map((c) => {
          const k = creature(c.level, c.rarity, c.size);
          return row(`${c.count}× ${c.name.trim()}`, `<span class="num">${ni(k.hp)}</span> <span class="xs muted">Vita</span> · <span class="num">${ni(k.dmg)}</span> <span class="xs muted">danno</span>`,
            `Lv ${c.level} · ${c.rarity} · ${c.size}\nVita = ${k.hpF} = ${ni(k.hp)}\nDanno base = ${k.dmgF} = ${ni(k.dmg)}`);
        }).join("") : row("Creature", DASH)}
        ${sec("Valutazione", prop(PROP_DIFF))}
        ${row("Difficoltà", d ? `<span class="chip ${d.tone}">${d.label}</span>` : DASH, diffTip)}
        ${row("EXP per PG", cs.length ? `<span class="num">${nf(exp.pct)}%</span> ${prop(PROP_EXP)}` : DASH, cs.length ? esc(expTip) : "")}
        ${row("Bottino", cs.length ? `${S.ui.rarityChip(top)} ${prop(PROP_LOOT)}` : DASH, cs.length ? `Arma ${top}: Base danno ${baseRange(top)} (scala di rarità)` : "")}
        ${sec("Scena")}
        ${trow("Condizioni", st.conditions)}
        ${trow("Ganci", st.hooks)}
        ${filled(st.lootNote) ? trow("Bottino deciso", st.lootNote) : ""}`);
    },
    build(st, ctx) {
      const cs = validCreatures(st).map((c) => {
        const k = creature(c.level, c.rarity, c.size);
        return { name: c.name.trim(), level: Number(c.level), rarity: c.rarity, size: c.size, count: Number(c.count), hp: k.hp, dmg: k.dmg };
      });
      const pcs = chars(ctx).filter((c) => st.party.includes(c.id));
      const d = difficulty(cs, pcs);
      const exp = expFor(Number(st.level), cs);
      const top = topRarity(cs);
      return {
        name: st.name.trim(), place: st.place.trim(), env: st.env, conditions: st.conditions.trim(), party: st.party.slice(), level: Number(st.level),
        creatures: cs, difficulty: { label: d.label, ratio: d.ratio, proposal: true }, expPct: exp.pct,
        expByPc: Object.fromEntries(pcs.map((p) => [p.id, expFor(p.level, cs).pct])),
        loot: { rarity: top, weaponBase: rarity(top).weaponBase, note: st.lootNote.trim() }, hooks: st.hooks.trim(),
        summary: `${st.place.trim()} · ${cs.reduce((s, c) => s + c.count, 0)} creature · ${d.label} (proposta) · EXP ${nf(exp.pct)}% a lv ${st.level}`,
      };
    },
  });
})();
