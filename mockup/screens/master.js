/* Area Master: PG della campagna, archivio PNG, quest e questioni aperte sulle regole. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};

  /* ---------- Stato locale ---------- */
  let sortBy = "level";       // "level" | "name"
  let query = "";
  let npcId = null;
  let logOpen = false;
  let logDraft = "";
  const resolved = new Set(); // indici delle questioni segnate come risolte
  (S.data?.campaign?.issues || []).forEach((it, i) => { if (it.resolved) resolved.add(i); });

  const PVP = { Bianco: "muted", Grigio: "warn", Rosso: "bad" };
  const TRUST = { Scarso: "bad", Neutrale: "muted", Buono: "good", Eccellente: "gold" };
  const TRUST_LEVELS = Object.keys(TRUST);

  /* ---------- CSS ---------- */
  function injectStyle() {
    if (document.getElementById("ms-style")) return;
    const st = document.createElement("style");
    st.id = "ms-style";
    st.textContent = `
      .ms-root { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
      .ms-head { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: flex-end; justify-content: space-between; }
      .ms-title { font-family: var(--font-display); font-size: var(--fs-xl); font-weight: 700; color: var(--gold); margin: 0; line-height: 1.15; }
      .ms-kvs { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .ms-kvs .kv { padding: 10px 12px; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); }
      .ms-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
      .ms-tools .field { flex: 1 1 200px; }
      .ms-tools .field.ms-sort { flex: 0 1 180px; }
      .ms-pcs { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); }
      .ms-pc { background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .ms-pc:hover { border-color: var(--line-strong); }
      .ms-pc.ms-low { border-color: var(--bad); }
      .ms-pc-name { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-lg); overflow-wrap: anywhere; }
      .ms-pc-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
      .ms-pc .row .btn { flex: 1 1 auto; }
      .ms-low .bar-top .num { color: var(--bad); font-weight: 600; }
      .ms-empty { padding: 14px; border: 1px dashed var(--line-strong); border-radius: var(--radius); color: var(--muted); }
      .ms-cols { display: grid; gap: 20px; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); align-items: start; }
      .ms-npc-wrap { container-type: inline-size; min-width: 0; }
      .ms-npc { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
      @container (min-width: 560px) { .ms-npc { grid-template-columns: minmax(0, 220px) minmax(0, 1fr); } }
      .ms-npc-list { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .ms-npc-list .pick { padding: 10px 12px; gap: 4px; }
      .ms-npc-name { font-weight: 600; overflow-wrap: anywhere; }
      .ms-detail { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .ms-facts { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ms-facts .kv .v { font-size: var(--fs-md); font-family: var(--font-body); }
      .ms-facts .kv .v.num { font-family: var(--font-mono); }
      .ms-block { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .ms-block p { overflow-wrap: anywhere; }
      .ms-secret { border: 1px dashed var(--violet); background: var(--violet-soft); border-radius: var(--radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
      .ms-secret .label { color: var(--violet); }
      .ms-history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .ms-history li { border-left: 2px solid var(--gold); padding: 2px 0 2px 10px; overflow-wrap: anywhere; }
      .ms-issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .ms-issue { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--panel-2); }
      .ms-issue-top { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; justify-content: space-between; }
      .ms-issue-title { font-weight: 600; }
      .ms-issue.ms-done .ms-issue-title, .ms-issue.ms-done .ms-issue-text { opacity: 0.6; }
      .ms-decision { border-left: 2px solid var(--good); padding-left: 10px; overflow-wrap: anywhere; }
      .ms-issue.ms-done .ms-issue-title, .ms-issue.ms-done .ms-issue-text { text-decoration: line-through; }
      .ms-check { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font-size: var(--fs-sm); }
      .ms-check input { accent-color: var(--gold); width: 16px; height: 16px; }
      .ms-quests td { overflow-wrap: anywhere; }
      @media (max-width: 1100px) { .ms-cols { grid-template-columns: minmax(0, 1fr); } }
      @media (max-width: 760px) { .ms-kvs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 420px) { .ms-facts { grid-template-columns: minmax(0, 1fr); } }
    `;
    document.head.appendChild(st);
  }

  /* ---------- Helper ---------- */
  const esc = (s) => S.ui.esc(s);

  function maxHp(c) { return S.rules.derived(c).hp; }
  function curHp(c) {
    const m = maxHp(c);
    return c.resources && c.resources.hp != null ? c.resources.hp : m;
  }

  function avgLevel(chars) {
    if (!chars.length) return 0;
    return Math.round(chars.reduce((s, c) => s + c.level, 0) / chars.length);
  }

  /* ---------- Sezioni ---------- */
  function headerHtml(state) {
    const camp = state.data.campaign;
    const chars = state.data.characters;
    const npcs = state.data.npcs;
    const avg = avgLevel(chars);
    const low = chars.filter((c) => curHp(c) / maxHp(c) < 0.3).length;
    const body = `
      <div class="ms-head">
        <div class="stack" style="gap:4px">
          <span class="label">Campagna</span>
          <h1 class="ms-title">${esc(camp.name)}</h1>
          <span class="muted small">Master: ${esc(camp.master)} · <span class="chip gold" id="ms-session-chip">Sessione ${esc(camp.session)}</span></span>
        </div>
        <button class="btn primary" type="button" data-act="new-session" id="ms-new-session">Nuova sessione</button>
      </div>
      <div class="ms-kvs">
        <div class="kv"><span class="label">Personaggi</span><span class="v">${chars.length} <small>PG</small></span></div>
        <div class="kv"><span class="label">Archivio</span><span class="v">${npcs.length} <small>PNG</small></span></div>
        <div class="kv"><span class="label">Livello medio</span><span class="v">${avg} <small>${esc(S.rules.powerRank(Math.max(1, avg)))}</small></span></div>
        <div class="kv"><span class="label">Quest aperte</span><span class="v">${camp.openQuests.length} <small>${low ? `${low} PG con HP critici` : "nessun PG in pericolo"}</small></span></div>
      </div>`;
    return S.ui.win("Sistema · Campagna", body, { gold: true });
  }

  function sortedChars(state) {
    const q = query.trim().toLowerCase();
    let list = state.data.characters.filter((c) =>
      !q || [c.name, c.owner, c.classe, c.gilda && c.gilda.nome].some((v) => String(v || "").toLowerCase().includes(q))
    );
    list = list.slice().sort((a, b) =>
      sortBy === "name" ? a.name.localeCompare(b.name, "it") : b.level - a.level || a.name.localeCompare(b.name, "it")
    );
    return list;
  }

  function pcCardsHtml(state) {
    const list = sortedChars(state);
    if (!list.length) return `<p class="ms-empty">Nessun personaggio corrisponde a "${esc(query)}".</p>`;
    return list.map((c) => {
      const max = maxHp(c);
      const cur = curHp(c);
      const low = max > 0 && cur / max < 0.3;
      const gilda = c.gilda && c.gilda.nome && c.gilda.nome !== "—"
        ? `${esc(c.gilda.nome)}${c.gilda.ruolo ? ` <span class="muted">· ${esc(c.gilda.ruolo)}</span>` : ""}`
        : `<span class="muted">Nessuna gilda</span>`;
      return `
        <article class="ms-pc ${low ? "ms-low" : ""}" data-pc="${esc(c.id)}">
          <div class="ms-pc-top">
            <div class="stack" style="gap:2px">
              <span class="ms-pc-name">${esc(c.name)}</span>
              <span class="small muted">${esc(c.owner)}</span>
            </div>
            <span class="chip ${PVP[c.pvp] || "muted"}" title="Stato PvP">PvP ${esc(c.pvp)}</span>
          </div>
          <div class="row small">
            <span>${esc(c.classe)}</span>
            <span class="num">Lv ${esc(c.level)}</span>
            <span class="chip violet">${esc(S.rules.powerRank(c.level))}</span>
          </div>
          <div class="small"><span class="label">Gilda</span> ${gilda}</div>
          ${S.ui.bar("hp", low ? "HP · critici" : "HP", cur, max)}
          <div class="row">
            <button class="btn" type="button" data-act="open" data-id="${esc(c.id)}">Apri scheda</button>
            <button class="btn ghost" type="button" data-act="combat" data-id="${esc(c.id)}">Combattimento</button>
          </div>
        </article>`;
    }).join("");
  }

  function pcsHtml(state) {
    const body = `
      <div class="ms-tools">
        <div class="field">
          <label class="label" for="ms-search">Cerca</label>
          <input class="input" id="ms-search" type="search" placeholder="Nome, giocatore, classe, gilda" value="${esc(query)}" autocomplete="off">
        </div>
        <div class="field ms-sort">
          <label class="label" for="ms-sort">Ordina per</label>
          <select class="input" id="ms-sort">
            <option value="level" ${sortBy === "level" ? "selected" : ""}>Livello</option>
            <option value="name" ${sortBy === "name" ? "selected" : ""}>Nome</option>
          </select>
        </div>
      </div>
      <div class="ms-pcs" id="ms-pcs">${pcCardsHtml(state)}</div>
      <p class="footnote">HP sotto il 30% del massimo evidenziati in rosso. Il massimo è calcolato dalle regole (100 + VIT×15).</p>`;
    return S.ui.win("Personaggi della campagna", body, { right: `<span class="chip muted">${state.data.characters.length} PG</span>` });
  }

  function npcDetailHtml(n, state) {
    if (!n) return `<p class="ms-empty">Seleziona un PNG dalla lista.</p>`;
    const history = Array.isArray(n.history) ? n.history : [];
    const trustOpts = TRUST_LEVELS.map((t) => `<option value="${t}" ${n.trust === t ? "selected" : ""}>${t}</option>`).join("");
    return `
      <div class="ms-detail" aria-live="polite">
        <div class="row" style="justify-content:space-between">
          <span class="ms-pc-name">${esc(n.name)}</span>
          <span class="chip ${TRUST[n.trust] || "muted"}">Fiducia: ${esc(n.trust)}</span>
        </div>
        <div class="ms-facts">
          <div class="kv"><span class="label">Livello</span><span class="v num">${esc(n.level)}</span></div>
          <div class="kv"><span class="label">Razza</span><span class="v">${esc(n.race)}</span></div>
          <div class="kv"><span class="label">Luogo</span><span class="v">${esc(n.place)}</span></div>
          <div class="kv"><span class="label">Ruolo</span><span class="v">${esc(n.role)}</span></div>
        </div>
        <div class="field">
          <label class="label" for="ms-npc-trust">Fiducia verso il gruppo</label>
          <select class="input" id="ms-npc-trust">${trustOpts}</select>
        </div>
        <div class="ms-block"><span class="label">Cosa sa dei PG</span><p>${esc(n.knows)}</p></div>
        <div class="ms-block"><span class="label">Debiti e favori</span><p>${esc(n.debts)}</p></div>
        <div class="ms-block"><span class="label">Ultima interazione</span><p id="ms-npc-last">${esc(n.last)}</p></div>
        <div class="ms-secret"><span class="label">Segreto (solo Master)</span><p>${esc(n.secret)}</p></div>
        ${logOpen ? `
          <div class="field">
            <label class="label" for="ms-npc-log">Nuova interazione · Sessione ${esc(state.data.campaign.session)}</label>
            <textarea class="input" id="ms-npc-log" rows="3" placeholder="Cosa è successo? Cosa ricorderà questo PNG?">${esc(logDraft)}</textarea>
            <span class="hint" id="ms-npc-log-hint">La voce diventa l'ultima interazione e finisce nella cronologia.</span>
          </div>
          <div class="row">
            <button class="btn primary" type="button" data-act="log-save" id="ms-npc-log-save">Salva interazione</button>
            <button class="btn ghost" type="button" data-act="log-cancel">Annulla</button>
          </div>` : `
          <div class="row"><button class="btn" type="button" data-act="log-open" id="ms-npc-log-open">Registra interazione</button></div>`}
        <div class="ms-block">
          <span class="label">Cronologia interazioni</span>
          ${history.length
            ? `<ol class="ms-history">${history.slice().reverse().map((h) => `<li class="small"><span class="chip muted">Sessione ${esc(h.session)}</span> ${esc(h.text)}</li>`).join("")}</ol>`
            : `<p class="small muted">Nessuna interazione registrata in questo mockup.</p>`}
        </div>
      </div>`;
  }

  function npcsHtml(state) {
    const npcs = state.data.npcs;
    if (!npcId || !npcs.some((n) => n.id === npcId)) npcId = npcs[0] ? npcs[0].id : null;
    const sel = npcs.find((n) => n.id === npcId);
    const list = npcs.map((n) => `
      <button class="pick" type="button" data-act="npc" data-id="${esc(n.id)}" aria-pressed="${n.id === npcId}">
        <span class="ms-npc-name">${esc(n.name)}</span>
        <span class="xs muted">${esc(n.role)}</span>
        <span class="xs muted">${esc(n.place)}</span>
        <span><span class="chip ${TRUST[n.trust] || "muted"}">${esc(n.trust)}</span></span>
      </button>`).join("");
    const body = `
      <div class="ms-npc-wrap">
        <div class="ms-npc">
          <div class="ms-npc-list" role="group" aria-label="PNG">${list}</div>
          <div id="ms-npc-detail">${npcDetailHtml(sel, state)}</div>
        </div>
      </div>`;
    return S.ui.win("Archivio PNG", body, { right: `<span class="chip muted">${npcs.length} PNG</span>` });
  }

  function questsHtml(state) {
    const rows = state.data.campaign.openQuests.map((q) => `
      <tr><td>${esc(q.name)}</td><td>${esc(q.who)}</td><td>${S.ui.rarityChip(q.rarity)}</td><td>${esc(q.due)}</td></tr>`).join("");
    const body = `
      <div class="table-wrap">
        <table class="t ms-quests">
          <thead><tr><th>Quest</th><th>Assegnata a</th><th>Rarità</th><th>Scadenza</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    return S.ui.win("Quest aperte", body);
  }

  function issuesHtml(state) {
    const issues = state.data.campaign.issues;
    const open = issues.filter((_, i) => !resolved.has(i)).length;
    const items = issues.map((it, i) => {
      const done = resolved.has(i);
      const sev = done
        ? `<span class="chip good">Decisa</span>`
        : it.sev === "bad" ? `<span class="chip bad">Blocca il modello dati</span>` : `<span class="chip warn">Da decidere</span>`;
      return `
        <li class="ms-issue ${done ? "ms-done" : ""}">
          <div class="ms-issue-top">
            <span class="ms-issue-title">${esc(it.title)}</span>
            ${sev}
          </div>
          <p class="small muted ms-issue-text">${esc(it.text)}</p>
          ${done && it.decision ? `<p class="small ms-decision"><b>Decisione:</b> ${esc(it.decision)}</p>` : ""}
          <label class="ms-check" for="ms-issue-${i}">
            <input type="checkbox" id="ms-issue-${i}" data-issue="${i}" ${done ? "checked" : ""}> Risolta
          </label>
        </li>`;
    }).join("");
    const body = `
      <p class="small muted">Discrepanze trovate confrontando il regolamento con le schede Excel.</p>
      <ul class="ms-issues">${items}</ul>`;
    return S.ui.win("Questioni aperte sulle regole", body, { right: `<span class="chip ${open ? "warn" : "good"}" id="ms-issues-count">${open} aperte</span>` });
  }

  /* ---------- Render ---------- */
  function render(root, state) {
    injectStyle();
    root.innerHTML = `
      <div class="ms-root">
        ${headerHtml(state)}
        ${pcsHtml(state)}
        <div class="ms-cols">
          <div id="ms-npcs">${npcsHtml(state)}</div>
          <div class="stack" style="gap:20px">
            ${questsHtml(state)}
            <div id="ms-issues">${issuesHtml(state)}</div>
          </div>
        </div>
      </div>`;

    const wrap = root.querySelector(".ms-root");
    const redrawPcs = () => { wrap.querySelector("#ms-pcs").innerHTML = pcCardsHtml(state); };
    const redrawNpcs = () => { wrap.querySelector("#ms-npcs").innerHTML = npcsHtml(state); };
    const redrawIssues = () => { wrap.querySelector("#ms-issues").innerHTML = issuesHtml(state); };
    const redrawAll = () => render(root, state);

    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn || !wrap.contains(btn)) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const camp = state.data.campaign;

      if (act === "new-session") {
        camp.session = (Number(camp.session) || 0) + 1;
        redrawAll();
        S.ui.toast("SISTEMA", [`Sessione ${camp.session} aperta.`, "Le nuove interazioni con i PNG verranno registrate in questa sessione."], true);
        const b = root.querySelector("#ms-new-session");
        if (b) b.focus();
      } else if (act === "open") {
        state.setChar(id);
        state.go("scheda");
      } else if (act === "combat") {
        state.setChar(id);
        state.go("combattimento");
      } else if (act === "npc") {
        if (npcId !== id) { npcId = id; logOpen = false; logDraft = ""; }
        redrawNpcs();
        const p = wrap.querySelector(`[data-act="npc"][data-id="${CSS.escape(id)}"]`);
        if (p) p.focus();
      } else if (act === "log-open") {
        logOpen = true;
        redrawNpcs();
        const ta = wrap.querySelector("#ms-npc-log");
        if (ta) ta.focus();
      } else if (act === "log-cancel") {
        logOpen = false; logDraft = "";
        redrawNpcs();
        const o = wrap.querySelector("#ms-npc-log-open");
        if (o) o.focus();
      } else if (act === "log-save") {
        const ta = wrap.querySelector("#ms-npc-log");
        const text = (ta ? ta.value : "").trim();
        if (!text) {
          const hint = wrap.querySelector("#ms-npc-log-hint");
          if (hint) { hint.textContent = "Scrivi almeno una riga prima di salvare."; hint.classList.add("bad"); }
          if (ta) ta.focus();
          return;
        }
        const n = state.data.npcs.find((x) => x.id === npcId);
        if (!n) return;
        if (!Array.isArray(n.history)) n.history = [];
        n.history.push({ session: camp.session, text });
        n.last = `Sessione ${camp.session} — ${text}`;
        logOpen = false; logDraft = "";
        redrawNpcs();
        S.ui.toast("PNG", [`${n.name} ricorderà questa interazione.`], false);
        const o = wrap.querySelector("#ms-npc-log-open");
        if (o) o.focus();
      }
    });

    wrap.addEventListener("input", (e) => {
      if (e.target.id === "ms-search") { query = e.target.value; redrawPcs(); }
      else if (e.target.id === "ms-npc-log") { logDraft = e.target.value; }
    });

    wrap.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "ms-sort") { sortBy = t.value; redrawPcs(); }
      else if (t.id === "ms-npc-trust") {
        const n = state.data.npcs.find((x) => x.id === npcId);
        if (!n) return;
        n.trust = t.value;
        redrawNpcs();
        const sel = wrap.querySelector("#ms-npc-trust");
        if (sel) sel.focus();
        S.ui.toast("PNG", [`Fiducia di ${n.name}: ${n.trust}.`], false);
      } else if (t.dataset.issue != null) {
        const i = Number(t.dataset.issue);
        if (t.checked) resolved.add(i); else resolved.delete(i);
        redrawIssues();
        const cb = wrap.querySelector(`#ms-issue-${i}`);
        if (cb) cb.focus();
      }
    });
  }

  S.screens.master = { title: "Area Master", render };
})();
