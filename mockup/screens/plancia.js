/* Plancia: il tavolo da gioco.
   Giocatore: allega skill, skill attive, titoli e talenti al tiro, poi lancia un d100 vero
   (due d10 — decine e unità — che rotolano nel vassoio con fisica, rimbalzi e suono).
   Master: il gruppo a colpo d'occhio, richieste di tiro ai PG, registro di tutti i tiri e un tiro proprio (anche segreto).
   Il regolamento non dà regole sul d100 ("niente dadi, decide il narratore"): il tiro somma i modificatori allegati
   e l'esito lo legge il Master. I valori suggeriti per gli allegati sono proposte, modificabili a ogni tiro. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};
  const esc = (s) => S.ui.esc(s);
  const nf = (x) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
  const signed = (x) => (x >= 0 ? "+" : "−") + nf(Math.abs(x));

  /* ---------- Stato condiviso del tavolo (in pagina, non salvato) ---------- */
  S.data = S.data || {};
  S.data.rolls = S.data.rolls || [];
  S.data.rollRequests = S.data.rollRequests || [];
  let seeded = false;
  function seedTable() {
    if (seeded) return;
    seeded = true;
    const t = Date.now();
    S.data.rolls.push(
      { id: "r-ex1", charId: "dante", charName: "Dante", reason: "Svuotare la tasca della guardia", tens: 7, units: 1, natural: 71,
        mods: [{ kind: "Talento", name: "Re dei Giochi", mod: 13, text: "Bonus Fortuna sui tiri = LCK/100" }], total: 84, by: "giocatore", at: t - 9 * 60000 },
      { id: "r-ex2", charId: "corax", charName: "Corax", reason: "Restare in equilibrio sul tetto", tens: 0, units: 4, natural: 4,
        mods: [{ kind: "Titolo", name: "Prima Maestra", mod: 5, text: "DEX +25" }], total: 9, by: "giocatore", at: t - 4 * 60000 },
    );
    S.data.rollRequests.push({ id: "q-ex1", charId: "kelvin", what: "Domare il lupo ferito", note: "Il lupo è spaventato, non aggressivo.", status: "aperta", at: t - 60000 });
  }

  /* ---------- Stato locale ---------- */
  const attached = {};            // charId -> { key: {key, kind, name, mod, text} }
  let reason = "";
  let requestId = null;
  let secret = false;
  let pickerQ = "";
  let lastResult = null;          // ultimo tiro mostrato sotto il vassoio
  let sound = true;
  try { sound = localStorage.getItem("statisfy-dice-sound") !== "off"; } catch (e) { /* storage non disponibile */ }

  /* ---------- Cosa si può allegare ---------- */
  const R = () => S.rules;
  const roman = (n) => R().ROMAN[Math.max(1, Math.min(10, Number(n) || 1))];
  const statText = (b) => Object.entries(b || {}).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ");
  function attachables(c) {
    const d = R().derived(c);
    const groups = [];
    const sk = (c.skills || []).map((s) => ({ key: "sk:" + s.name, kind: "Skill", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.type || "—"}`,
      mod: 2 * (Number(s.lvl) || 0), text: s.passive || `Skill ${s.type || ""} di Grado ${roman(s.lvl)}` }));
    if (sk.length) groups.push({ label: "Skill", items: sk });
    const ak = (c.activeSkills || []).map((s) => ({ key: "as:" + s.name, kind: "Skill attiva", name: s.name, sub: `Grado ${roman(s.lvl)} · ${s.cost || ""}`,
      mod: 2 * (Number(s.lvl) || 0), text: s.effect || "" }));
    if (ak.length) groups.push({ label: "Skill attive", items: ak });
    const ti = (c.titles || []).map((t) => ({ key: "ti:" + t.name, kind: "Titolo", name: t.name, sub: t.rarity, rarity: t.rarity,
      mod: 0, text: statText(t.bonus) || "Effetto narrativo" }));
    if (ti.length) groups.push({ label: "Titoli", items: ti });
    const ta = (c.talents || []).map((t) => {
      const luck = /re dei giochi/i.test(t.name) && d.bonusFortuna != null;
      return { key: "ta:" + t.name, kind: "Talento", name: t.name, sub: t.rarity + (t.origin ? ` · ${t.origin}` : ""), rarity: t.rarity,
        mod: luck ? Math.round(d.bonusFortuna) : 0, text: (t.effect || "") + (luck ? ` · ora +${nf(d.bonusFortuna)} (LCK ${R().totals(c).LCK}/100)` : "") };
    });
    if (ta.length) groups.push({ label: "Talenti", items: ta });
    if (d.bonusFortuna != null && !ta.some((x) => x.mod)) {
      groups.push({ label: "Statistiche", items: [{ key: "der:fortuna", kind: "Fortuna", name: "Bonus Fortuna sui tiri", sub: "LCK / 100", mod: Math.round(d.bonusFortuna), text: "Dalla Fortuna (LCK)" }] });
    }
    return groups;
  }
  const mine = (c) => (attached[c.id] = attached[c.id] || {});
  const modsSum = (c) => Object.values(mine(c)).reduce((s, a) => s + (Number(a.mod) || 0), 0);

  /* ---------- Dadi: due d10 in un vassoio con fisica 2.5D ---------- */
  const DIE = 64;                 // lato del dado in px
  const REDUCED = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function rand10() {             // casuale crittografico e senza distorsione
    const a = new Uint32Array(1);
    for (;;) { crypto.getRandomValues(a); if (a[0] < 4294967290) return a[0] % 10; }
  }
  function dieSvg(cls) {
    return `<svg viewBox="0 0 100 100" width="${DIE}" height="${DIE}" aria-hidden="true">
      <defs>
        <radialGradient id="pl-g-${cls}" cx="38%" cy="30%" r="80%">
          <stop offset="0" class="pl-g1"/><stop offset="1" class="pl-g2"/>
        </radialGradient>
      </defs>
      <polygon class="pl-side" points="50,2 96,38 82,80 50,98 18,80 4,38"/>
      <polygon class="pl-facet" points="50,2 96,38 80,42"/>
      <polygon class="pl-facet" points="50,2 4,38 20,42"/>
      <polygon class="pl-facet pl-facet-d" points="80,42 96,38 82,80 50,86"/>
      <polygon class="pl-facet pl-facet-d" points="20,42 4,38 18,80 50,86"/>
      <polygon class="pl-face" fill="url(#pl-g-${cls})" points="50,8 80,42 50,86 20,42"/>
      <text class="pl-num" x="50" y="56" text-anchor="middle"></text>
      <line class="pl-ul" x1="40" y1="64" x2="60" y2="64"/>
    </svg>`;
  }
  const faceLabel = (kind, v) => (kind === "tens" ? `${v}0`.replace(/^0(0)$/, "00") : String(v));
  function setFace(d, v) {
    d.val = v;
    const label = faceLabel(d.kind, v);
    d.num.textContent = label;
    d.ul.style.display = d.kind === "units" && (v === 6 || v === 9) ? "" : "none";
  }

  let audio = null;
  function clack(power) {
    if (!sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const len = 0.05;
      const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * len), audio.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 4);
      const src = audio.createBufferSource();
      src.buffer = buf;
      const bp = audio.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 1400;
      bp.Q.value = 3;
      const g = audio.createGain();
      g.gain.value = Math.min(0.5, 0.05 + power * 0.45);
      src.connect(bp).connect(g).connect(audio.destination);
      src.start(t);
    } catch (e) { /* audio non disponibile: si tira in silenzio */ }
  }

  /* Un tiro: anima i due dadi e chiama done({tens, units}) quando si fermano */
  let rolling = false;
  function throwDice(tray, opts, done) {
    const dice = [...tray.querySelectorAll(".pl-die")].map((el, i) => ({
      el, sh: tray.querySelectorAll(".pl-shadow")[i], kind: el.dataset.kind,
      num: el.querySelector(".pl-num"), ul: el.querySelector(".pl-ul"), final: rand10(),
    }));
    const W = tray.clientWidth, H = tray.clientHeight, r = DIE / 2;
    rolling = true;
    tray.classList.add("is-rolling");
    const finish = () => {
      for (const d of dice) { setFace(d, d.final); d.el.classList.add("pl-land"); }
      rolling = false;
      tray.classList.remove("is-rolling");
      done({ tens: dice[0].final, units: dice[1].final });
    };
    if (REDUCED()) {
      dice.forEach((d, i) => { place(d, W / 2 + (i ? 44 : -44), H / 2, 0, 0); setFace(d, d.final); });
      setTimeout(finish, 250);
      return;
    }
    const sx = opts.x ?? 40, sy = opts.y ?? H - 40;
    dice.forEach((d, i) => {
      d.x = Math.max(r, Math.min(W - r, sx + (i ? 26 : -6)));
      d.y = Math.max(r, Math.min(H - r, sy + (i ? -14 : 12)));
      d.z = 60 + Math.random() * 30;
      d.vx = (opts.vx ?? 520 + Math.random() * 260) * (0.85 + Math.random() * 0.3);
      d.vy = (opts.vy ?? -(160 + Math.random() * 220)) * (0.85 + Math.random() * 0.3);
      d.vz = 180 + Math.random() * 160;
      d.a = Math.random() * 360;
      d.va = (Math.random() < 0.5 ? -1 : 1) * (900 + Math.random() * 900);
      d.swap = 0;
      d.el.classList.remove("pl-land");
      setFace(d, rand10());
    });
    let last = performance.now(), elapsed = 0, settling = 0, moving = true;
    /* Fisica a passi fissi di 1/120 s recuperando il tempo reale: il tiro dura uguale anche se i fotogrammi sono pochi */
    const phys = (dt) => {
      moving = false;
      for (const d of dice) {
        d.vz -= 1500 * dt;
        d.z += d.vz * dt;
        if (d.z <= 0) {
          d.z = 0;
          if (Math.abs(d.vz) > 60) { clack(Math.min(1, Math.abs(d.vz) / 500)); d.va *= 0.75; d.vx *= 0.82; d.vy *= 0.82; }
          d.vz = Math.abs(d.vz) > 60 ? -d.vz * 0.42 : 0;
        }
        const grounded = d.z === 0 && d.vz === 0;
        if (grounded) { d.vx *= 0.955; d.vy *= 0.955; d.va *= 0.93; }
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x < r) { d.x = r; d.vx = Math.abs(d.vx) * 0.6; clack(Math.min(1, Math.abs(d.vx) / 600)); }
        if (d.x > W - r) { d.x = W - r; d.vx = -Math.abs(d.vx) * 0.6; clack(Math.min(1, Math.abs(d.vx) / 600)); }
        if (d.y < r) { d.y = r; d.vy = Math.abs(d.vy) * 0.6; clack(Math.min(1, Math.abs(d.vy) / 600)); }
        if (d.y > H - r) { d.y = H - r; d.vy = -Math.abs(d.vy) * 0.6; clack(Math.min(1, Math.abs(d.vy) / 600)); }
        d.a += d.va * dt;
        d.swap += Math.abs(d.va) * dt + Math.hypot(d.vx, d.vy) * dt * 0.4;
        if (d.swap > 70) { d.swap = 0; setFace(d, rand10()); }
        if (Math.hypot(d.vx, d.vy) > 12 || Math.abs(d.va) > 40 || d.z > 0) moving = true;
      }
      // urto tra i due dadi
      const [p, q] = dice;
      const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 1;
      if (dist < DIE * 0.9 && p.z < 20 && q.z < 20) {
        const nx = dx / dist, ny = dy / dist, push = (DIE * 0.9 - dist) / 2;
        p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
        const rel = (p.vx - q.vx) * nx + (p.vy - q.vy) * ny;
        if (rel > 0) {
          p.vx -= rel * nx; p.vy -= rel * ny; q.vx += rel * nx; q.vy += rel * ny;
          p.va += (Math.random() - 0.5) * 600; q.va += (Math.random() - 0.5) * 600;
          clack(Math.min(1, rel / 500));
        }
      }
    };
    const step = (now) => {
      let left = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (!settling) {
        while (left > 0) { const dt = Math.min(1 / 120, left); phys(dt); elapsed += dt; left -= dt; }
        for (const d of dice) place(d, d.x, d.y, d.z, d.a);
      }
      if ((!moving || elapsed > 3.4) && !settling) settling = now;
      if (settling) {
        // gli ultimi 260 ms: il dado si raddrizza e mostra la faccia uscita
        const k = Math.min(1, (now - settling) / 260);
        for (const d of dice) {
          if (k > 0.3 && d.val !== d.final) setFace(d, d.final);
          const target = Math.round(d.a / 360) * 360 + (d.kind === "tens" ? -8 : 6);
          place(d, d.x, d.y, 0, d.a + (target - d.a) * easeOut(k));
          if (k === 1) d.a = target;
        }
        if (k === 1) { finish(); return; }
      }
      tick(step);
    };
    tick(step);
  }
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  /* rAF, ma se la pagina è nascosta (anteprime, schede in background) va avanti a timer */
  /* rAF e, come riserva, un timer: parte il primo che arriva (in un pannello nascosto rAF può non arrivare mai) */
  const tick = (f) => {
    let done = false;
    const go = (t) => { if (done) return; done = true; f(typeof t === "number" ? t : performance.now()); };
    requestAnimationFrame(go);
    setTimeout(() => go(performance.now()), 34);
  };
  function place(d, x, y, z, a) {
    const s = 1 + z * 0.0028;
    d.el.style.transform = `translate(${x - DIE / 2}px, ${y - DIE / 2 - z * 0.55}px) rotate(${a}deg) scale(${s})`;
    d.sh.style.transform = `translate(${x - DIE / 2 + z * 0.25}px, ${y - DIE / 2 + 6 + z * 0.1}px) scale(${1 + z * 0.004})`;
    d.sh.style.opacity = String(Math.max(0.15, 0.55 - z * 0.004));
  }

  /* ---------- Pezzi di interfaccia ---------- */
  function trayHtml(id, hint = true) {
    return `<div class="pl-tray" id="${id}" role="img" aria-label="Vassoio dei dadi: d100 con un dado delle decine e uno delle unità">
      <div class="pl-felt" aria-hidden="true"></div>
      <span class="pl-shadow"></span><span class="pl-shadow"></span>
      <span class="pl-die pl-tens" data-kind="tens">${dieSvg("tens")}</span>
      <span class="pl-die pl-units" data-kind="units">${dieSvg("units")}</span>
      ${hint ? `<span class="pl-tray-hint xs">Trascina e lascia andare per lanciare, oppure usa il pulsante</span>` : ""}
    </div>`;
  }
  function initTray(tray) {
    const dice = tray.querySelectorAll(".pl-die");
    const shadows = tray.querySelectorAll(".pl-shadow");
    const W = tray.clientWidth || 320, H = tray.clientHeight || 220;
    [[0, "tens", 0], [1, "units", 0]].forEach(([i, kind]) => {
      const d = { el: dice[i], sh: shadows[i], kind, num: dice[i].querySelector(".pl-num"), ul: dice[i].querySelector(".pl-ul") };
      setFace(d, 0);
      place(d, W / 2 + (i ? 46 : -46), H / 2, 0, i ? 8 : -10);
    });
  }
  function resultHtml(res) {
    if (!res) return `<p class="small muted pl-res-empty">Allega quello che serve, scrivi per cosa tiri e lancia.</p>`;
    const crit = res.natural === 100 ? "pl-crit-hi" : res.natural === 1 ? "pl-crit-lo" : "";
    const tip = [`Decine ${faceLabel("tens", res.tens)} + unità ${res.units} = ${res.natural}${res.natural === 100 ? " (00 + 0 = 100)" : ""}`,
      ...res.mods.map((m) => `${m.kind} · ${m.name}: ${signed(m.mod)}${m.text ? ` — ${m.text}` : ""}`)].join("\n");
    return `<div class="pl-res ${crit}" tabindex="0" title="${esc(tip)}">
      <div class="pl-res-main">
        <span class="pl-res-nat"><span class="label">d100</span><b class="num">${res.natural}</b></span>
        ${res.mods.length ? `<span class="pl-res-op">${signed(res.mods.reduce((s, m) => s + m.mod, 0))}</span>` : ""}
        <span class="pl-res-tot"><span class="label">Totale</span><b class="num">${nf(res.total)}</b></span>
      </div>
      ${res.natural === 100 ? `<span class="chip gold">100 naturale</span>` : res.natural === 1 ? `<span class="chip bad">01 naturale</span>` : ""}
      <span class="small">${esc(res.reason || "Tiro libero")}${res.mods.length ? ` · ${res.mods.map((m) => esc(m.name)).join(", ")}` : ""}</span>
    </div>`;
  }
  function logRow(r, showWho) {
    const tip = [`${r.charName} · ${r.reason || "Tiro libero"}`, `d100 ${r.natural} (decine ${faceLabel("tens", r.tens)}, unità ${r.units})`,
      ...r.mods.map((m) => `${m.kind} · ${m.name}: ${signed(m.mod)}${m.text ? ` — ${m.text}` : ""}`), `Totale ${nf(r.total)}`].join("\n");
    const time = new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    const crit = r.natural === 100 ? "pl-crit-hi" : r.natural === 1 ? "pl-crit-lo" : "";
    return `<li class="pl-log-row ${showWho ? "has-who" : ""} ${crit}" tabindex="0" title="${esc(tip)}">
      <span class="xs muted num">${time}</span>
      ${showWho ? `<span class="pl-log-who">${esc(r.charName)}${r.secret ? ` <span class="chip muted">segreto</span>` : ""}</span>` : ""}
      <span class="pl-log-what small">${esc(r.reason || "Tiro libero")}${r.mods.length ? ` <span class="xs muted">· ${r.mods.length} allegat${r.mods.length === 1 ? "o" : "i"}</span>` : ""}</span>
      <span class="num pl-log-nat">${r.natural}</span>
      <b class="num pl-log-tot">${nf(r.total)}</b>
    </li>`;
  }

  /* ---------- Vista giocatore ---------- */
  function playerView(c) {
    const groups = attachables(c);
    const reqs = S.data.rollRequests.filter((q) => q.charId === c.id && q.status === "aperta");
    const myLog = S.data.rolls.filter((r) => r.charId === c.id && !r.secret).slice(-8).reverse();
    return `
      ${reqs.map((q) => `<div class="sysmsg gold pl-req"><span class="tag">[RICHIESTA DEL MASTER]</span>
        <span>Tiro d100: <b>${esc(q.what)}</b>${q.note ? ` <span class="muted">— ${esc(q.note)}</span>` : ""}</span>
        <span><button type="button" class="btn primary pl-mini" data-answer="${q.id}">${requestId === q.id ? "In risposta ✓" : "Rispondi con un tiro"}</button></span></div>`).join("")}
      <div class="pl-grid">
        ${S.ui.win(`Tavolo · ${c.name}`, `
          <div class="field"><label class="label" for="pl-reason">Per cosa tiri</label>
            <input class="input" id="pl-reason" maxlength="80" placeholder="es. Scassinare la serratura del forziere" value="${esc(reason)}"></div>
          ${trayHtml("pl-tray", !(lastResult && lastResult.charId === c.id))}
          <div class="row pl-actions">
            <button type="button" class="btn primary pl-roll" id="pl-roll">Lancia d100</button>
            <span class="small muted" id="pl-modsum">Allegati: <b class="num">${signed(modsSum(c))}</b></span>
            <button type="button" class="btn ghost pl-mini" id="pl-sound" aria-pressed="${sound}">${sound ? "Suono: sì" : "Suono: no"}</button>
          </div>
          <div id="pl-result" aria-live="polite">${resultHtml(lastResult && lastResult.charId === c.id ? lastResult : null)}</div>`, { gold: true, cls: "pl-table" })}
        <div class="stack pl-side">
          ${S.ui.win("Allegati al tiro", `<div id="pl-attached">${attachedHtml(c)}</div>`)}
          ${S.ui.win("Skill, titoli e talenti", groups.length ? `
            <input class="input" id="pl-q" placeholder="Cerca…" value="${esc(pickerQ)}" aria-label="Cerca tra skill, titoli e talenti">
            <div class="pl-picker" id="pl-picker">${pickerHtml(c, groups)}</div>
            <p class="footnote">Valori suggeriti: skill e skill attive +2 per Grado; titoli e talenti 0 (scrivi tu l'effetto sul tiro); Re dei Giochi = bonus Fortuna. Sono una proposta: cambiali sugli allegati.</p>`
            : `<p class="small muted">Nessuna skill, titolo o talento da allegare.</p>`)}
        </div>
      </div>
      ${S.ui.win("I miei tiri", myLog.length ? `<ol class="pl-log">${myLog.map((r) => logRow(r, false)).join("")}</ol>` : `<p class="small muted">Ancora nessun tiro.</p>`)}`;
  }
  function attachedHtml(c) {
    const list = Object.values(mine(c));
    if (!list.length) return `<p class="small muted">Niente allegato: il tiro sarà un d100 secco. Scegli dall'elenco qui sotto.</p>`;
    return `<ul class="pl-att">${list.map((a) => `<li class="pl-att-row" title="${esc(`${a.kind} · ${a.name}${a.text ? `\n${a.text}` : ""}`)}">
        <span class="pl-att-name"><span class="xs muted">${esc(a.kind)}</span> ${esc(a.name)}</span>
        <input class="input num pl-att-mod" type="number" step="1" value="${esc(a.mod)}" data-mod="${esc(a.key)}" aria-label="Modificatore di ${esc(a.name)}">
        <button type="button" class="btn icon ghost" data-detach="${esc(a.key)}" aria-label="Togli ${esc(a.name)}">✕</button>
      </li>`).join("")}</ul>`;
  }
  function pickerHtml(c, groups) {
    const q = pickerQ.trim().toLowerCase();
    const sel = mine(c);
    let any = false;
    const html = groups.map((g) => {
      const items = g.items.filter((it) => !q || (it.name + " " + it.sub + " " + it.text).toLowerCase().includes(q));
      if (!items.length) return "";
      any = true;
      return `<div class="pl-pk-group"><span class="label">${esc(g.label)}</span>
        ${items.map((it) => `<button type="button" class="pl-pk ${sel[it.key] ? "is-on" : ""}" data-attach="${esc(it.key)}" aria-pressed="${!!sel[it.key]}"
            title="${esc(`${it.name}\n${it.sub}\n${it.text}\nSuggerito sul tiro: ${signed(it.mod)}`)}">
          <span class="pl-pk-name" ${it.rarity ? `data-rarity="${R().rarityKey(it.rarity)}"` : ""}>${esc(it.name)}</span>
          <span class="xs muted pl-pk-sub">${esc(it.sub)}</span>
          <span class="num xs pl-pk-mod">${it.mod ? signed(it.mod) : "—"}</span>
        </button>`).join("")}</div>`;
    }).join("");
    return any ? html : `<p class="small muted">Nessun risultato.</p>`;
  }

  /* ---------- Vista Master ---------- */
  function masterView() {
    const chars = S.data.characters;
    const cards = chars.map((c) => {
      const d = R().derived(c);
      const r = c.resources || { hp: d.hp, mp: d.mp, sp: d.sp };
      const last = [...S.data.rolls].reverse().find((x) => x.charId === c.id);
      const open = S.data.rollRequests.filter((q) => q.charId === c.id && q.status === "aperta").length;
      return `<article class="pl-pc">
        <header class="pl-pc-h"><b>${esc(c.name)}</b><span class="xs muted">Lv ${c.level} · ${esc(c.classe || "")}</span></header>
        ${S.ui.bar("hp", "HP", Math.min(r.hp ?? d.hp, d.hp), d.hp)}
        ${S.ui.bar("mp", "MP", Math.min(r.mp ?? d.mp, d.mp), d.mp)}
        ${d.ki != null ? S.ui.bar("ki", "KI", Math.min(r.ki ?? d.ki, d.ki), d.ki) : S.ui.bar("sp", "SP", Math.min(r.sp ?? d.sp, d.sp), d.sp)}
        <div class="pl-pc-foot xs">
          <span class="muted" title="${last ? esc(`${last.reason || "Tiro libero"}: d100 ${last.natural} → ${nf(last.total)}`) : ""}">Ultimo tiro: ${last ? `<b class="num">${nf(last.total)}</b>` : "—"}</span>
          <button type="button" class="btn pl-mini" data-ask="${c.id}">${open ? `Richiesta aperta (${open})` : "Chiedi un tiro"}</button>
        </div>
      </article>`;
    }).join("");
    const reqs = S.data.rollRequests.slice().reverse();
    const feed = S.data.rolls.slice().reverse();
    const charOpts = chars.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    return `
      ${S.ui.win("Il gruppo", `<div class="pl-party">${cards}</div>`)}
      <div class="pl-grid">
        ${S.ui.win("Tiro del Master", `
          <div class="field"><label class="label" for="pl-reason">Per cosa tiri</label>
            <input class="input" id="pl-reason" maxlength="80" placeholder="es. La guardia nota il furto?" value="${esc(reason)}"></div>
          ${trayHtml("pl-tray", !(lastResult && lastResult.charId === "master"))}
          <div class="row pl-actions">
            <button type="button" class="btn primary pl-roll" id="pl-roll">Lancia d100</button>
            <label class="row small pl-secret"><input type="checkbox" id="pl-secret" ${secret ? "checked" : ""}> Tiro segreto</label>
            <button type="button" class="btn ghost pl-mini" id="pl-sound" aria-pressed="${sound}">${sound ? "Suono: sì" : "Suono: no"}</button>
          </div>
          <div id="pl-result" aria-live="polite">${resultHtml(lastResult && lastResult.charId === "master" ? lastResult : null)}</div>`, { gold: true, cls: "pl-table" })}
        <div class="stack pl-side">
          ${S.ui.win("Chiedi un tiro", `
            <form class="stack" id="pl-ask">
              <div class="pl-ask-row">
                <div class="field"><label class="label" for="pl-ask-pc">A chi</label><select class="input" id="pl-ask-pc">${charOpts}</select></div>
                <div class="field pl-grow"><label class="label" for="pl-ask-what">Cosa</label><input class="input" id="pl-ask-what" maxlength="60" placeholder="es. Furtività nel corridoio"></div>
              </div>
              <div class="field"><label class="label" for="pl-ask-note">Nota per il giocatore (facoltativa)</label><input class="input" id="pl-ask-note" maxlength="120"></div>
              <div class="row"><button type="submit" class="btn">Invia richiesta</button><span class="xs muted" id="pl-ask-msg" aria-live="polite"></span></div>
            </form>
            ${reqs.length ? `<ul class="pl-reqs">${reqs.map((q) => {
              const c = chars.find((x) => x.id === q.charId);
              const roll = q.rollId && S.data.rolls.find((r) => r.id === q.rollId);
              return `<li class="small"><b>${esc(c ? c.name : "?")}</b> · ${esc(q.what)} ${roll ? `<span class="chip good">${nf(roll.total)}</span>` : `<span class="chip warn">in attesa</span>`}</li>`;
            }).join("")}</ul>` : ""}`)}
          ${S.ui.win("Registro dei tiri", feed.length ? `<ol class="pl-log">${feed.map((r) => logRow(r, true)).join("")}</ol>` : `<p class="small muted">Nessun tiro.</p>`)}
        </div>
      </div>`;
  }

  /* ---------- Render ---------- */
  function render(root, state) {
    injectStyle();
    seedTable();
    const master = state.role === "master";
    const c = state.char;
    root.innerHTML = `<div class="stack pl-root" style="gap:20px">${master ? masterView() : playerView(c)}</div>`;
    const tray = root.querySelector("#pl-tray");
    initTray(tray);
    const redraw = () => render(root, state);

    const doRoll = (opts) => {
      if (rolling) return;
      const by = master ? "master" : "giocatore";
      const who = master ? { id: "master", name: "Master" } : { id: c.id, name: c.name };
      const mods = master ? [] : Object.values(mine(c)).map((a) => ({ kind: a.kind, name: a.name, mod: Number(a.mod) || 0, text: a.text }));
      const why = (root.querySelector("#pl-reason") || {}).value || "";
      root.querySelector("#pl-roll").disabled = true;
      root.querySelector("#pl-result").innerHTML = `<p class="small muted">I dadi rotolano…</p>`;
      throwDice(tray, opts || {}, ({ tens, units }) => {
        const natural = tens * 10 + units || 100;
        const res = { id: "r-" + Date.now(), charId: who.id, charName: who.name, reason: why.trim(), tens, units, natural, mods,
          total: natural + mods.reduce((s, m) => s + m.mod, 0), by, secret: master && secret, at: Date.now(), requestId };
        S.data.rolls.push(res);
        if (requestId) {
          const q = S.data.rollRequests.find((x) => x.id === requestId);
          if (q) { q.status = "risolta"; q.rollId = res.id; }
          requestId = null;
        }
        lastResult = res;
        S.ui.toast("TIRO", [`${who.name}: d100 ${natural}${mods.length ? ` ${signed(res.total - natural)} = ${nf(res.total)}` : ""}${res.reason ? ` · ${res.reason}` : ""}`], natural === 100);
        // ridisegna senza rimettere i dadi al centro: il risultato resta dove sono caduti
        const keep = [...tray.querySelectorAll(".pl-die, .pl-shadow")].map((el) => [el.style.transform, el.style.opacity]);
        const faces = [tens, units];
        redraw();
        const t2 = root.querySelector("#pl-tray");
        [...t2.querySelectorAll(".pl-die, .pl-shadow")].forEach((el, i) => { el.style.transform = keep[i][0]; el.style.opacity = keep[i][1]; });
        t2.querySelectorAll(".pl-die").forEach((el, i) => {
          setFace({ kind: el.dataset.kind, num: el.querySelector(".pl-num"), ul: el.querySelector(".pl-ul") }, faces[i]);
          el.classList.add("pl-land");
        });
        const b = root.querySelector("#pl-roll");
        if (b) b.focus({ preventScroll: true });
      });
    };

    root.querySelector("#pl-roll").addEventListener("click", () => doRoll());
    root.querySelector("#pl-sound").addEventListener("click", () => {
      sound = !sound;
      try { localStorage.setItem("statisfy-dice-sound", sound ? "on" : "off"); } catch (e) { /* facoltativo */ }
      redraw();
    });
    root.querySelector("#pl-reason").addEventListener("input", (e) => { reason = e.target.value; });

    /* Lancio trascinando: la velocità del gesto diventa la velocità dei dadi */
    let drag = null;
    tray.addEventListener("pointerdown", (e) => {
      if (rolling || e.button !== 0) return;
      const b = tray.getBoundingClientRect();
      drag = { pts: [{ x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() }], id: e.pointerId };
      try { tray.setPointerCapture(e.pointerId); } catch (err) { /* puntatore già rilasciato */ }
      tray.classList.add("is-aiming");
    });
    tray.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const b = tray.getBoundingClientRect();
      drag.pts.push({ x: e.clientX - b.left, y: e.clientY - b.top, t: performance.now() });
      if (drag.pts.length > 12) drag.pts.shift();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      tray.classList.remove("is-aiming");
      const pts = drag.pts;
      drag = null;
      const a = pts.find((p) => performance.now() - p.t < 120) || pts[0], z = pts[pts.length - 1];
      const dt = Math.max(0.016, (z.t - a.t) / 1000);
      const vx = (z.x - a.x) / dt, vy = (z.y - a.y) / dt;
      const sp = Math.hypot(vx, vy);
      if (sp < 250) return; // un clic o un trascinamento lento non lancia
      const k = Math.min(1, 1600 / sp);
      doRoll({ x: z.x, y: z.y, vx: vx * k, vy: vy * k });
    };
    tray.addEventListener("pointerup", release);
    tray.addEventListener("pointercancel", () => { drag = null; tray.classList.remove("is-aiming"); });

    if (master) {
      const sc = root.querySelector("#pl-secret");
      sc.addEventListener("change", () => { secret = sc.checked; });
      root.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => {
        root.querySelector("#pl-ask-pc").value = b.dataset.ask;
        const w = root.querySelector("#pl-ask-what");
        w.focus();
        w.scrollIntoView({ block: "center", behavior: "smooth" });
      }));
      root.querySelector("#pl-ask").addEventListener("submit", (e) => {
        e.preventDefault();
        const what = root.querySelector("#pl-ask-what").value.trim();
        const msg = root.querySelector("#pl-ask-msg");
        if (what.length < 2) { msg.textContent = "Scrivi cosa deve tirare."; root.querySelector("#pl-ask-what").focus(); return; }
        const id = root.querySelector("#pl-ask-pc").value;
        S.data.rollRequests.push({ id: "q-" + Date.now(), charId: id, what, note: root.querySelector("#pl-ask-note").value.trim(), status: "aperta", at: Date.now() });
        const who = S.data.characters.find((x) => x.id === id);
        S.ui.toast("SISTEMA", [`Richiesta inviata a ${who ? who.name : id}: ${what}.`, "La vede sulla sua plancia."], true);
        redraw();
      });
      return;
    }

    /* Giocatore: allegati */
    const groups = attachables(c);
    const all = Object.fromEntries(groups.flatMap((g) => g.items).map((it) => [it.key, it]));
    const refreshSide = (focusKey) => {
      root.querySelector("#pl-attached").innerHTML = attachedHtml(c);
      const pk = root.querySelector("#pl-picker");
      if (pk) pk.innerHTML = pickerHtml(c, groups);
      root.querySelector("#pl-modsum").innerHTML = `Allegati: <b class="num">${signed(modsSum(c))}</b>`;
      if (focusKey) { const el = root.querySelector(`[data-attach="${CSS.escape(focusKey)}"]`); if (el) el.focus({ preventScroll: true }); }
    };
    const wrap = root.querySelector(".pl-root"); // nuovo a ogni render: niente ascoltatori accumulati su #view
    wrap.addEventListener("click", (e) => {
      const at = e.target.closest("[data-attach]");
      if (at) {
        const it = all[at.dataset.attach];
        if (!it) return;
        const sel = mine(c);
        if (sel[it.key]) delete sel[it.key];
        else sel[it.key] = { key: it.key, kind: it.kind, name: it.name, mod: it.mod, text: it.text };
        refreshSide(it.key);
        return;
      }
      const de = e.target.closest("[data-detach]");
      if (de) { delete mine(c)[de.dataset.detach]; refreshSide(); return; }
      const an = e.target.closest("[data-answer]");
      if (an) {
        const q = S.data.rollRequests.find((x) => x.id === an.dataset.answer);
        requestId = q.id;
        reason = q.what;
        redraw();
        root.querySelector("#pl-roll").focus();
      }
    });
    wrap.addEventListener("input", (e) => {
      if (e.target.dataset.mod) {
        const a = mine(c)[e.target.dataset.mod];
        if (a) { a.mod = Number(e.target.value) || 0; root.querySelector("#pl-modsum").innerHTML = `Allegati: <b class="num">${signed(modsSum(c))}</b>`; }
      }
      if (e.target.id === "pl-q") {
        pickerQ = e.target.value;
        root.querySelector("#pl-picker").innerHTML = pickerHtml(c, groups);
      }
    });
  }

  function injectStyle() {
    if (document.getElementById("pl-style")) return;
    const st = document.createElement("style");
    st.id = "pl-style";
    st.textContent = `
      .pl-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(280px, 1fr); gap: 20px; align-items: start; }
      @media (max-width: 960px) { .pl-grid { grid-template-columns: minmax(0, 1fr); } }
      .pl-side { gap: 20px; }
      .pl-mini { padding: 4px 10px; font-size: var(--fs-xs); }
      .pl-actions { justify-content: space-between; }
      .pl-roll { font-size: var(--fs-md); padding: 10px 22px; letter-spacing: 0.08em; }
      .pl-req .btn { margin-top: 6px; }

      /* Vassoio */
      .pl-tray { position: relative; height: 240px; border-radius: 10px; overflow: hidden; touch-action: none; cursor: grab;
        border: 1px solid var(--line-strong); background: radial-gradient(120% 90% at 50% 40%, #2b1f4a, #120e22 75%);
        box-shadow: inset 0 0 0 6px #0b0916, inset 0 0 40px #000a; user-select: none; -webkit-user-select: none; }
      :root[data-theme="light"] .pl-tray { background: radial-gradient(120% 90% at 50% 40%, #3a2a62, #1a1432 75%); }
      .pl-tray.is-aiming { cursor: grabbing; box-shadow: inset 0 0 0 6px #0b0916, inset 0 0 40px #000a, 0 0 0 2px var(--gold); }
      .pl-felt { position: absolute; inset: 0; opacity: 0.22; pointer-events: none;
        background-image: radial-gradient(#ffffff22 1px, transparent 1px); background-size: 6px 6px; }
      .pl-die, .pl-shadow { position: absolute; left: 0; top: 0; width: ${DIE}px; height: ${DIE}px; will-change: transform; pointer-events: none; }
      .pl-shadow { border-radius: 50%; background: radial-gradient(closest-side, #000c, transparent); transform-origin: center; }
      .pl-die svg { display: block; filter: drop-shadow(0 2px 2px #0008); overflow: visible; }
      .pl-tens .pl-side, .pl-tens .pl-facet { fill: #a87a22; } .pl-tens .pl-facet-d { fill: #7d5914; }
      .pl-tens .pl-g1 { stop-color: #ffe7a6; } .pl-tens .pl-g2 { stop-color: #d9a43c; }
      .pl-units .pl-side, .pl-units .pl-facet { fill: #5a3fb8; } .pl-units .pl-facet-d { fill: #3e2a86; }
      .pl-units .pl-g1 { stop-color: #c9b6ff; } .pl-units .pl-g2 { stop-color: #7c5ce6; }
      .pl-num { font-family: var(--font-display); font-weight: 700; font-size: 26px; }
      .pl-tens .pl-num { fill: #2a1c03; } .pl-units .pl-num { fill: #ffffff; }
      .pl-tens .pl-num { font-size: 23px; }
      .pl-ul { stroke-width: 3; stroke-linecap: round; } .pl-tens .pl-ul { stroke: #2a1c03; } .pl-units .pl-ul { stroke: #fff; }
      .pl-land svg { animation: pl-land .35s ease-out; }
      @keyframes pl-land { 0% { transform: scale(1.12); } 60% { transform: scale(0.97); } 100% { transform: none; } }
      .pl-tray-hint { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; color: #ffffff70; pointer-events: none; }
      .pl-tray.is-rolling .pl-tray-hint { opacity: 0; }

      /* Risultato */
      .pl-res { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: var(--radius);
        background: var(--panel-2); animation: sys-in .25s ease-out; }
      .pl-res-main { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
      .pl-res-nat, .pl-res-tot { display: flex; flex-direction: column; }
      .pl-res-nat b { font-size: 1.6rem; } .pl-res-tot b { font-size: 2.2rem; color: var(--gold); }
      .pl-res-op { font-family: var(--font-mono); color: var(--muted); font-size: 1.1rem; }
      .pl-res.pl-crit-hi { border-color: var(--gold); box-shadow: 0 0 22px var(--gold-soft); }
      .pl-res.pl-crit-lo { border-color: var(--bad); }
      .pl-res-empty { padding: 4px 2px; }

      /* Allegati e scelta */
      .pl-att { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .pl-att-row { display: grid; grid-template-columns: minmax(0, 1fr) 76px auto; gap: 8px; align-items: center;
        padding: 6px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); }
      .pl-att-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-sm); }
      .pl-att-mod { padding: 4px 6px; text-align: right; }
      .pl-picker { display: flex; flex-direction: column; gap: 10px; }
      .pl-pk-group { display: flex; flex-direction: column; gap: 3px; }
      .pl-pk { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "n m" "s m"; gap: 0 10px; text-align: left;
        padding: 5px 8px; border: 1px solid transparent; border-radius: var(--radius); background: transparent; cursor: pointer; }
      .pl-pk:hover { background: var(--panel-2); border-color: var(--line); }
      .pl-pk.is-on { border-color: var(--gold); background: var(--gold-soft); }
      .pl-pk-name { grid-area: n; font-size: var(--fs-sm); font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pl-pk-name:not([data-rarity]) { color: var(--fg); }
      .pl-pk-sub { grid-area: s; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pl-pk-mod { grid-area: m; align-self: center; color: var(--gold); }

      /* Registro */
      .pl-log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      .pl-log-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 36px 56px; gap: 8px; align-items: center;
        padding: 6px 4px; border-bottom: 1px solid var(--line); }
      .pl-log-row.has-who { grid-template-columns: 44px minmax(0, 0.8fr) minmax(0, 2fr) 36px 56px; }
      .pl-log-who { font-weight: 600; font-size: var(--fs-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pl-log-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .pl-log-nat { text-align: right; color: var(--muted); font-size: var(--fs-sm); }
      .pl-log-tot { text-align: right; }
      .pl-log-row.pl-crit-hi .pl-log-tot { color: var(--gold); } .pl-log-row.pl-crit-lo .pl-log-tot { color: var(--bad); }

      /* Master */
      .pl-party { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
      .pl-pc { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel-2); min-width: 0; }
      .pl-pc-h { display: flex; flex-direction: column; }
      .pl-pc-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap; }
      .pl-ask-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 10px; }
      @media (max-width: 480px) { .pl-ask-row { grid-template-columns: minmax(0, 1fr); } }
      .pl-reqs { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
      .pl-secret { gap: 6px; }
      @media (max-width: 560px) { .pl-tray { height: 200px; } .pl-log-row.has-who { grid-template-columns: 40px minmax(0, 0.9fr) minmax(0, 1.4fr) 30px 46px; } }
    `;
    document.head.appendChild(st);
  }

  S.screens.plancia = { title: "Plancia", render };
})();
