/* Schermata: Creazione guidata del personaggio (wizard a 4 step).
   Stato del wizard in variabili di modulo: sopravvive ai render e ai cambi di schermata. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};

  const STYLE = `
.cr-steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; list-style: none; margin: 0; padding: 0; }
.cr-step {
  width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; cursor: pointer;
  background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 8px 10px;
  font-family: var(--font-display); font-weight: 600; letter-spacing: 0.03em; font-size: var(--fs-sm); color: var(--muted);
}
.cr-step:hover:not(:disabled) { border-color: var(--line-strong); color: var(--fg); }
.cr-step:disabled { opacity: 0.45; cursor: not-allowed; }
.cr-step[aria-current="step"] { color: var(--fg); border-color: var(--gold); box-shadow: inset 0 -2px 0 var(--gold); }
.cr-step .cr-n {
  flex: none; width: 24px; height: 24px; border-radius: 999px; display: inline-grid; place-items: center;
  border: 1px solid var(--line-strong); font-family: var(--font-mono); font-size: var(--fs-xs);
}
.cr-step.done .cr-n { border-color: var(--good); color: var(--good); }
.cr-step[aria-current="step"] .cr-n { border-color: var(--gold); color: var(--gold); }
.cr-step .cr-sl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 560px) {
  .cr-steps { gap: 4px; }
  .cr-step { flex-direction: column; gap: 4px; padding: 6px 4px; text-align: center; font-size: var(--fs-xs); }
  .cr-step .cr-sl { max-width: 100%; }
}
.cr-foot { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.cr-pick h3 { font-size: var(--fs-lg); }
.cr-pick ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 2px; }
.cr-counter { font-family: var(--font-mono); font-size: var(--fs-xl); line-height: 1.2; font-variant-numeric: tabular-nums; }
.cr-counter b { color: var(--gold); }
.cr-counter.ok b { color: var(--good); }
.cr-counter.over b { color: var(--warn); }
.cr-stat {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 12px; align-items: center;
  padding: 10px 0; border-bottom: 1px solid var(--line);
}
.cr-stat:last-child { border-bottom: 0; }
.cr-stat .cr-code { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.08em; }
.cr-ctl { display: flex; align-items: center; gap: 6px; }
.cr-val { min-width: 3ch; text-align: center; font-family: var(--font-mono); font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.cr-chips { grid-column: 1 / -1; display: flex; gap: 6px; flex-wrap: wrap; }
.cr-chips:empty { display: none; }
.cr-dgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cr-dgrid .kv { padding: 8px 10px; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); }
.cr-tele span { overflow-wrap: anywhere; }
.cr-tele .cr-k { color: var(--muted); }
.cr-issues { margin: 0; padding-left: 18px; }
.cr-linkbtn { background: none; border: 0; padding: 0; color: var(--violet); cursor: pointer; text-decoration: underline; font: inherit; }
`;
  function injectStyle() {
    if (document.getElementById("cr-style")) return;
    const st = document.createElement("style");
    st.id = "cr-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  const STEPS = ["Nome", "Classe", "Statistiche", "Riepilogo"];
  const STAT_INFO = {
    STR: { name: "Forza", desc: "Danno fisico, carico, stamina" },
    DEX: { name: "Destrezza", desc: "Evasione, precisione, stamina" },
    VIT: { name: "Vitalità", desc: "Vita, rigenerazione, resistenze" },
    INT: { name: "Intelligenza", desc: "Mana, bonus EXP, danno magico" },
  };
  const PREVIEW_KEYS = ["hp", "mp", "sp", "carico", "evasione", "precisione"];
  const EQUIP_META = [
    { type: "Arma", weight: 3 },
    { type: "Armatura", weight: 5 },
    { type: "Accessorio", weight: 1 },
  ];

  function fresh() {
    return { step: 1, name: "", classId: null, stats: { STR: 10, DEX: 10, VIT: 10, INT: 10 }, regno: "valeria" };
  }
  let w = fresh();
  let rootRef = null;
  let stateRef = null;

  const esc = (s) => S.ui.esc(s);
  const n = (x) => Math.round(Number(x) || 0).toLocaleString("it-IT");

  /* ---------- Validazione ---------- */
  function nameCheck() {
    const name = w.name.trim();
    if (!name) return { ok: false, empty: true, msg: "3–15 caratteri, solo lettere e numeri." };
    if (!/^[A-Za-z0-9]+$/.test(name)) return { ok: false, msg: "Solo lettere e numeri: niente spazi, accenti o simboli." };
    if (name.length < 3) return { ok: false, msg: `Troppo corto: ${name.length} caratteri su minimo 3.` };
    if (name.length > 15) return { ok: false, msg: `Troppo lungo: ${name.length} caratteri su massimo 15.` };
    const taken = stateRef.data.characters.some((c) => String(c.name).toLowerCase() === name.toLowerCase());
    if (taken) return { ok: false, msg: `Il nome "${name}" è già in uso su questo server.` };
    return { ok: true, msg: "Nome disponibile." };
  }
  function remaining() {
    const C = S.rules.CREATION;
    return C.bonusPoints - S.rules.BASE_STATS.reduce((sum, k) => sum + (w.stats[k] - C.base), 0);
  }
  function getClass() { return stateRef.data.classes.find((c) => c.id === w.classId) || null; }
  function getKingdom() { return stateRef.data.kingdoms.find((k) => k.id === w.regno) || stateRef.data.kingdoms[0]; }
  function valid(k) {
    if (k === 1) return nameCheck().ok;
    if (k === 2) return !!getClass();
    if (k === 3) return remaining() === 0;
    return valid(1) && valid(2) && valid(3);
  }
  function canReach(k) {
    for (let j = 1; j < k; j++) if (!valid(j)) return false;
    return true;
  }

  /* PG temporaneo per l'anteprima delle derivate */
  function tempChar() {
    const C = S.rules.CREATION;
    return {
      stats: S.rules.BASE_STATS.map((code) => ({
        code, name: STAT_INFO[code].name, kind: "base",
        iniziale: C.base, creazione: w.stats[code] - C.base, investiti: 0, levelup: 0, altro: 0, titoli: 0,
      })),
    };
  }

  /* ---------- HTML ---------- */
  function stepsHtml() {
    return STEPS.map((label, i) => {
      const k = i + 1;
      const cur = k === w.step;
      const done = k !== w.step && valid(k) && k < 4;
      const reach = canReach(k);
      return `<li><button type="button" class="cr-step ${done ? "done" : ""}" data-step="${k}" id="cr-step-${k}"
        ${cur ? 'aria-current="step"' : ""} ${!reach && !cur ? "disabled" : ""}>
        <span class="cr-n">${done ? "✓" : k}</span><span class="cr-sl">${esc(label)}</span></button></li>`;
    }).join("");
  }

  function nameHintHtml() {
    const r = nameCheck();
    return `<span class="hint ${r.empty ? "" : r.ok ? "good" : "bad"}" id="cr-name-hint" role="status">${esc(r.msg)}</span>`;
  }

  function footHtml() {
    const back = `<button type="button" class="btn ghost" id="cr-prev" ${w.step === 1 ? "disabled" : ""}>← Indietro</button>`;
    if (w.step === 4) {
      return `<div class="cr-foot">${back}<button type="button" class="btn primary" id="cr-confirm" ${valid(4) ? "" : "disabled"}>[CONFERMA]</button></div>`;
    }
    return `<div class="cr-foot">${back}<button type="button" class="btn primary" id="cr-next" ${valid(w.step) ? "" : "disabled"}>Avanti →</button></div>`;
  }

  function step1() {
    return S.ui.win("Passo 1 · Nome dell'Immortale", `
      <div class="sysmsg"><span class="tag">[SISTEMA]</span><span>Connessione neurale stabilita.</span><span>Inserisci il nome con cui gli abitanti di Aethermoor ti conosceranno.</span></div>
      <div class="field">
        <label class="label" for="cr-name">Nome del personaggio</label>
        <input class="input" id="cr-name" type="text" autocomplete="off" spellcheck="false" autocapitalize="off"
          value="${esc(w.name)}" aria-describedby="cr-name-hint cr-name-note" placeholder="Es. Kaelen">
        ${nameHintHtml()}
        <span class="footnote" id="cr-name-note">Il nome è unico sul server e non potrà essere modificato.</span>
      </div>
      ${footHtml()}`);
  }

  function step2() {
    const picks = stateRef.data.classes.map((c) => `
      <button type="button" class="pick cr-pick" data-class="${esc(c.id)}" id="cr-class-${esc(c.id)}" aria-pressed="${c.id === w.classId}">
        <h3>${esc(c.name)}</h3>
        <div class="stack" style="gap:2px">
          <span class="label">Abilità iniziale</span>
          <span><b>${esc(c.skill)}</b></span>
          <span class="small muted">${esc(c.skillText)}</span>
        </div>
        <div class="stack" style="gap:2px">
          <span class="label">Equipaggiamento</span>
          <ul class="small">${c.equip.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
        </div>
      </button>`).join("");
    return S.ui.win("Passo 2 · Classe", `
      <p class="small muted">La classe determina l'abilità e l'equipaggiamento di partenza. Le statistiche si distribuiscono al passo successivo.</p>
      <div class="grid-2">${picks}</div>
      ${footHtml()}`);
  }

  function step3() {
    const C = S.rules.CREATION;
    const rem = remaining();
    const rows = S.rules.BASE_STATS.map((code) => {
      const v = w.stats[code];
      const delta = v - C.base;
      const pen = S.rules.penaltyBand(v);
      const chips = [
        delta !== 0 ? `<span class="chip ${delta > 0 ? "good" : "muted"}">${delta > 0 ? "+" : "−"}${Math.abs(delta)} creazione</span>` : "",
        pen ? `<span class="chip ${pen.band === "7–9" ? "warn" : "bad"}">${esc(pen.text)} · ${esc(pen.band)}</span>` : "",
      ].join("");
      return `<div class="cr-stat">
        <div class="stack" style="gap:0">
          <span><span class="cr-code">${code}</span> <span class="small">${esc(STAT_INFO[code].name)}</span></span>
          <span class="xs muted">${esc(STAT_INFO[code].desc)}</span>
        </div>
        <div class="cr-ctl">
          <button type="button" class="btn icon" id="cr-dec-${code}" data-dec="${code}" aria-label="Diminuisci ${code}" ${v <= C.min ? "disabled" : ""}>−</button>
          <span class="cr-val" aria-live="polite">${v}</span>
          <button type="button" class="btn icon" id="cr-inc-${code}" data-inc="${code}" aria-label="Aumenta ${code}" ${rem <= 0 ? "disabled" : ""}>+</button>
        </div>
        <div class="cr-chips">${chips}</div>
      </div>`;
    }).join("");

    const d = S.rules.derived(tempChar());
    const dv = S.rules.DERIVED.filter((x) => PREVIEW_KEYS.includes(x.key)).map((x) => `
      <div class="kv"><span class="label">${esc(x.label)}</span><span class="v">${esc(S.rules.fmt(d[x.key], x.fmt))}</span><span class="xs muted mono">${esc(x.formula)}</span></div>`).join("");

    const cls = rem === 0 ? "ok" : rem > C.bonusPoints ? "over" : "";
    const hint = rem === 0
      ? `<span class="hint good">Tutti i punti sono distribuiti.</span>`
      : rem > 0
        ? `<span class="hint">Distribuisci ancora ${rem} ${rem === 1 ? "punto" : "punti"} per proseguire.</span>`
        : `<span class="hint bad">Hai speso ${Math.abs(rem)} punti di troppo.</span>`;

    return S.ui.win("Passo 3 · Statistiche", `
      <div class="grid-2">
        <div class="stack">
          <div class="cr-counter ${cls}" aria-live="polite">Punti bonus: <b>${rem}</b> / ${C.bonusPoints}</div>
          ${hint}
          <p class="xs muted">Ogni statistica parte da ${C.base}. Puoi scendere fino a ${C.min} per ottenere punti extra, con penalità sotto ${C.base}.</p>
          <div>${rows}</div>
          <div class="row">
            <button type="button" class="btn" id="cr-random">Distribuzione casuale</button>
            <button type="button" class="btn ghost" id="cr-reset">Azzera</button>
          </div>
        </div>
        <div class="stack">
          <span class="label">Anteprima derivate</span>
          <div class="cr-dgrid">${dv}</div>
          <p class="footnote">Valori calcolati in tempo reale sulle statistiche di creazione.</p>
        </div>
      </div>
      ${footHtml()}`);
  }

  function step4() {
    const c = getClass();
    const k = getKingdom();
    const d = S.rules.derived(tempChar());
    const statsLine = S.rules.BASE_STATS.map((code) => `${code} ${w.stats[code]}`).join(" · ");
    const issues = [];
    if (!valid(1)) issues.push({ step: 1, text: "Nome non valido" });
    if (!valid(2)) issues.push({ step: 2, text: "Classe non scelta" });
    if (!valid(3)) issues.push({ step: 3, text: "Punti bonus non distribuiti" });
    const line = (key, val) => `<span><span class="cr-k">${esc(key)}:</span> ${esc(val)}</span>`;
    const tele = `<div class="sysmsg gold cr-tele">
      <span class="tag">[SISTEMA] Registrazione Immortale</span>
      ${line("Nome", w.name.trim() || "—")}
      ${line("Classe", c ? c.name : "—")}
      ${line("Statistiche", statsLine)}
      ${line("Risorse", `HP ${n(d.hp)} · MP ${n(d.mp)} · SP ${n(d.sp)}`)}
      ${line("Abilità iniziale", c ? `${c.skill} (${c.skillText})` : "—")}
      ${line("Equipaggiamento", c ? c.equip.join(" · ") : "—")}
      ${line("Regno di partenza", k.name)}
    </div>`;
    const opts = stateRef.data.kingdoms.map((x) => `<option value="${esc(x.id)}" ${x.id === k.id ? "selected" : ""}>${esc(x.name)}</option>`).join("");
    return S.ui.win("Passo 4 · Riepilogo", `
      ${tele}
      <div class="field">
        <label class="label" for="cr-regno">Regno di partenza</label>
        <select class="input" id="cr-regno">${opts}</select>
        <span class="hint" id="cr-regno-desc">${esc(k.text)}</span>
      </div>
      <div class="sysmsg"><span class="tag">[AVVISO]</span><span>Dopo la conferma nome e statistiche non sono modificabili.</span></div>
      ${issues.length ? `<div class="stack" style="gap:4px"><span class="hint bad">Prima di confermare correggi:</span>
        <ul class="cr-issues small">${issues.map((i) => `<li><button type="button" class="cr-linkbtn" data-goto="${i.step}">${esc(i.text)}</button></li>`).join("")}</ul></div>` : ""}
      ${footHtml()}`, { gold: true });
  }

  function bodyHtml() {
    return [null, step1, step2, step3, step4][w.step]();
  }

  /* ---------- Render ---------- */
  function captureFocus(root) {
    const a = document.activeElement;
    if (!a || !a.id || !root.contains(a)) return null;
    const f = { id: a.id, s: null, e: null };
    try { f.s = a.selectionStart; f.e = a.selectionEnd; } catch (e) { /* input senza selezione */ }
    return f;
  }
  function restoreFocus(root, f) {
    if (!f) return;
    const el = root.querySelector("#" + CSS.escape(f.id));
    if (!el || el.disabled) return;
    el.focus({ preventScroll: true });
    if (f.s != null) { try { el.setSelectionRange(f.s, f.e); } catch (e) { /* ignora */ } }
  }

  function draw(focusId) {
    const root = rootRef;
    const f = focusId ? { id: focusId } : captureFocus(root);
    root.innerHTML = `<div class="cr-root stack anim-in" style="gap:16px">
      <div class="stack" style="gap:4px">
        <h1>Creazione guidata</h1>
        <p class="muted small">Il System registra un nuovo Immortale. Quattro passaggi, poi il tuo nome sarà inciso nei registri di Aethermoor.</p>
      </div>
      <ol class="cr-steps" id="cr-steps" aria-label="Passaggi della creazione">${stepsHtml()}</ol>
      <div id="cr-body">${bodyHtml()}</div>
    </div>`;
    bind(root.firstElementChild);
    restoreFocus(root, f);
  }

  function goStep(k) {
    if (k < 1 || k > 4) return;
    if (k !== w.step && !canReach(k)) return;
    w.step = k;
    draw(k === 1 ? "cr-name" : `cr-step-${k}`);
  }

  function randomize() {
    const C = S.rules.CREATION;
    const codes = S.rules.BASE_STATS;
    for (const c of codes) w.stats[c] = C.base;
    for (let i = 0; i < C.bonusPoints; i++) w.stats[codes[Math.floor(Math.random() * codes.length)]]++;
  }

  function uniqueId(name) {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "pg";
    let id = base, i = 2;
    while (stateRef.data.characters.some((c) => c.id === id)) id = `${base}-${i++}`;
    return id;
  }

  function confirmCreate() {
    if (!valid(4)) return;
    const C = S.rules.CREATION;
    const cls = getClass();
    const k = getKingdom();
    const name = w.name.trim();
    const id = uniqueId(name);
    const stats = S.rules.BASE_STATS.map((code) => ({
      code, name: STAT_INFO[code].name, kind: "base",
      iniziale: C.base, creazione: w.stats[code] - C.base, investiti: 0, levelup: 0, altro: 0, titoli: 0,
    }));
    const parts = String(cls.skillText).split("·").map((s) => s.trim());
    const cdMatch = /cooldown\s+(\d+)/i.exec(cls.skillText);
    const inventory = cls.equip.map((e, i) => {
      const m = /^(.*?)\s*\((.*)\)\s*$/.exec(e);
      const meta = EQUIP_META[i] || { type: "Equipaggiamento", weight: 1 };
      return { name: m ? m[1] : e, stats: m ? m[2] : "Equipaggiamento iniziale", rarity: "Comune", type: meta.type, qty: 1, weight: meta.weight };
    });
    inventory.push({ name: "Corone d'Oro", stats: "Moneta di Valeria", rarity: "Comune", type: "Monete", qty: 20, weight: 0 });

    const pc = {
      id, owner: "Giocatore 1", name, classe: cls.name, level: 1, expPct: 0, regno: k.name, pvp: "Bianco",
      gilda: { nome: "—", ruolo: "Nessuna gilda" }, corone: 20, scellini: 0,
      stats, itemBonus: {}, resources: null,
      titles: [], skills: [],
      activeSkills: [{
        name: cls.skill,
        effect: parts.filter((p) => !/cooldown/i.test(p)).slice(1).join(" · ") || cls.skillText,
        lvl: 1, pct: 0, cost: parts[0] || "—", cd: cdMatch ? Number(cdMatch[1]) : 0,
      }],
      talents: [], inventory, pets: [], curses: [], quests: [], reputation: [],
      combat: { position: "Mischia", effects: [], cooldowns: [] },
    };
    const d = S.rules.derived(pc);
    pc.resources = { hp: d.hp, mp: d.mp, sp: d.sp };

    stateRef.data.characters.push(pc);
    S.ui.toast("SISTEMA", [`Benvenuto in Aethermoor, ${name}.`], true);
    w = fresh();
    stateRef.setChar(id);
    stateRef.go("scheda");
  }

  /* Aggiornamento parziale mentre l'utente scrive il nome: niente re-render dell'input */
  function onNameInput(input) {
    w.name = input.value;
    const root = rootRef;
    const hint = root.querySelector("#cr-name-hint");
    if (hint) hint.outerHTML = nameHintHtml();
    const next = root.querySelector("#cr-next");
    if (next) next.disabled = !valid(1);
    const steps = root.querySelector("#cr-steps");
    if (steps) steps.innerHTML = stepsHtml();
  }

  function bind(el) {
    el.addEventListener("click", (ev) => {
      const t = ev.target.closest("button");
      if (!t || !el.contains(t) || t.disabled) return;
      const C = S.rules.CREATION;
      if (t.dataset.step) return goStep(Number(t.dataset.step));
      if (t.dataset.goto) return goStep(Number(t.dataset.goto));
      if (t.id === "cr-prev") return goStep(w.step - 1);
      if (t.id === "cr-next") { if (valid(w.step)) goStep(w.step + 1); return; }
      if (t.id === "cr-confirm") return confirmCreate();
      if (t.dataset.class) { w.classId = t.dataset.class; return draw(); }
      if (t.dataset.inc) {
        if (remaining() > 0) w.stats[t.dataset.inc]++;
        return draw();
      }
      if (t.dataset.dec) {
        if (w.stats[t.dataset.dec] > C.min) w.stats[t.dataset.dec]--;
        return draw();
      }
      if (t.id === "cr-random") { randomize(); return draw(); }
      if (t.id === "cr-reset") { for (const c of S.rules.BASE_STATS) w.stats[c] = C.base; return draw(); }
    });
    el.addEventListener("input", (ev) => {
      if (ev.target.id === "cr-name") onNameInput(ev.target);
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.target.id === "cr-name" && ev.key === "Enter") {
        ev.preventDefault();
        if (valid(1)) goStep(2);
      }
    });
    el.addEventListener("change", (ev) => {
      if (ev.target.id === "cr-regno") {
        w.regno = ev.target.value;
        const k = getKingdom();
        const desc = el.querySelector("#cr-regno-desc");
        if (desc) desc.textContent = k.text;
        const tele = el.querySelector(".cr-tele > span:last-child");
        if (tele) tele.innerHTML = `<span class="cr-k">Regno di partenza:</span> ${esc(k.name)}`;
      }
    });
  }

  S.screens.crea = {
    title: "Creazione guidata",
    render(root, state) {
      injectStyle();
      rootRef = root;
      stateRef = state;
      if (w.step > 1 && !canReach(w.step)) w.step = 1; // es. nome nel frattempo occupato
      draw();
    },
  };
})();
