/* Schermata: Level up (simulazione + distribuzione punti) e Combattimento (risorse, effetti, turni, morte).
   Stato locale per personaggio in variabili di modulo: sopravvive ai render e ai cambi di schermata. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};

  const STYLE = `
.lu-head { display: flex; flex-direction: column; gap: 4px; }
.lu-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.lu-kpis .kv { padding: 8px 10px; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); }
.lu-big { font-family: var(--font-mono); font-size: var(--fs-xl); line-height: 1.2; font-variant-numeric: tabular-nums; }
.lu-big b { color: var(--gold); }
.lu-big.zero b { color: var(--good); }
.lu-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center;
  padding: 8px 0; border-bottom: 1px solid var(--line);
}
.lu-row:last-child { border-bottom: 0; }
.lu-code { font-family: var(--font-display); font-weight: 700; letter-spacing: 0.08em; }
.lu-ctl { display: flex; align-items: center; gap: 6px; }
.lu-val { min-width: 3ch; text-align: center; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.lu-up { color: var(--good); font-weight: 600; font-family: var(--font-mono); }
.lu-down { color: var(--bad); font-weight: 600; font-family: var(--font-mono); }
.lu-arrow { color: var(--muted); }
.lu-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; }
.lu-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lu-list li {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 6px 10px; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
}
.lu-list .lu-turns { margin-left: auto; font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
.lu-form {
  display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; align-items: end;
  padding: 10px; border: 1px dashed var(--line-strong); border-radius: var(--radius);
}
.lu-form .row { grid-column: 1 / -1; }
@media (max-width: 560px) { .lu-form { grid-template-columns: minmax(0, 1fr); } .lu-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.lu-amt { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.lu-log span { overflow-wrap: anywhere; }
.lu-sep { height: 1px; background: var(--line); }
.lu-death { border: 1px solid var(--bad); border-radius: var(--radius); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.lu-death .lu-title { color: var(--bad); font-family: var(--font-display); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: var(--fs-sm); }
.lu-check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.lu-check input { width: 18px; height: 18px; accent-color: var(--bad); }
.lu-tbl td .lu-up, .lu-tbl td .lu-down { margin-left: 6px; }
.lu-level-wrap { max-width: 760px; }
.lu-combat-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 320px); gap: 20px; align-items: start; }
@media (max-width: 960px) { .lu-combat-grid { grid-template-columns: minmax(0, 1fr); } }
.lu-cs { display: flex; flex-direction: column; }
.lu-cs-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 7px 8px; margin: 0 -8px;
  border-bottom: 1px solid var(--line); border-radius: 4px; cursor: help; }
.lu-cs-row:hover, .lu-cs-row:focus-visible { background: var(--panel-2); outline: none; }
.lu-gold { color: var(--gold); }
`;
  function injectStyle() {
    if (document.getElementById("lu-style")) return;
    const st = document.createElement("style");
    st.id = "lu-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  const POSITIONS = ["Mischia", "Media distanza", "Lunga distanza", "Elevato", "Coperto"];
  const MAIN_DERIVED = ["hp", "mp", "sp", "evasione", "moltFis"];

  const per = {}; // stato locale per id personaggio
  function local(c) {
    if (!per[c.id]) {
      per[c.id] = {
        free: 0, pending: {}, talentAt: null,
        turn: 1, log: [], amt: 50,
        addOpen: false, eff: { name: "", kind: "bad", turns: 3 },
        deathOpen: false, hubris: false, respawn: "checkpoint", deathMsg: null,
      };
    }
    return per[c.id];
  }

  let rootRef = null;
  let stateRef = null;

  const esc = (s) => S.ui.esc(s);
  const n = (x) => Math.round(Number(x) || 0).toLocaleString("it-IT");
  const sum = (o) => Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);

  function ensure(c) {
    if (!c.combat) c.combat = { position: "Mischia", effects: [], cooldowns: [] };
    if (!Array.isArray(c.combat.effects)) c.combat.effects = [];
    if (!Array.isArray(c.combat.cooldowns)) c.combat.cooldowns = [];
    if (!c.combat.position) c.combat.position = "Mischia";
    if (!c.resources) {
      const d = S.rules.derived(c);
      c.resources = { hp: d.hp, mp: d.mp, sp: d.sp };
    }
    if (c.expPct == null) c.expPct = 0;
  }

  function log(s, text) {
    s.log.push(`T${s.turn} · ${text}`);
    if (s.log.length > 6) s.log = s.log.slice(-6);
  }

  function withPending(c, pending) {
    return { ...c, stats: c.stats.map((r) => ({ ...r, investiti: (Number(r.investiti) || 0) + (pending[r.code] || 0) })) };
  }

  function fmtDiff(diff, kind) {
    if (Math.abs(diff) < 1e-9) return "";
    const digits = kind === "int" ? 0 : kind === "mult" ? 2 : 1;
    const v = Math.abs(diff).toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    const unit = kind === "pct" ? "%" : kind === "kg" ? " kg" : "";
    return `<span class="${diff > 0 ? "lu-up" : "lu-down"}">${diff > 0 ? "+" : "−"}${v}${unit}</span>`;
  }

  /* ---------- Finestra A: Level up ---------- */
  function levelWin(c, s) {
    const pend = sum(s.pending);
    const left = s.free - pend;
    const before = S.rules.totals(c);
    const after = S.rules.totals(withPending(c, s.pending));
    const dBefore = S.rules.derived(c);
    const dAfter = S.rules.derived(withPending(c, s.pending));

    const rows = c.stats.map((r) => {
      const p = s.pending[r.code] || 0;
      const diff = after[r.code] - before[r.code];
      return `<div class="lu-row">
        <div class="stack" style="gap:0">
          <span><span class="lu-code">${esc(r.code)}</span> <span class="small">${esc(r.name || "")}</span>
            ${r.kind === "avanzata" ? '<span class="chip violet">Avanzata</span>' : ""}</span>
          <span class="small mono">${n(before[r.code])} <span class="lu-arrow">→</span> ${n(after[r.code])} ${fmtDiff(diff, "int")}</span>
        </div>
        <div class="lu-ctl">
          <button type="button" class="btn icon" id="lu-dec-${esc(r.code)}" data-dec="${esc(r.code)}" aria-label="Togli un punto da ${esc(r.code)}" ${p <= 0 ? "disabled" : ""}>−</button>
          <span class="lu-val" aria-label="Punti in sospeso su ${esc(r.code)}">${p}</span>
          <button type="button" class="btn icon" id="lu-inc-${esc(r.code)}" data-inc="${esc(r.code)}" aria-label="Aggiungi un punto a ${esc(r.code)}" ${left <= 0 ? "disabled" : ""}>+</button>
        </div>
      </div>`;
    }).join("");

    const drows = S.rules.DERIVED.filter((d) => MAIN_DERIVED.includes(d.key)).map((d) => `
      <tr><td>${esc(d.label)}</td>
        <td class="num">${esc(S.rules.fmt(dBefore[d.key], d.fmt))}</td>
        <td class="num">${esc(S.rules.fmt(dAfter[d.key], d.fmt))}${fmtDiff(dAfter[d.key] - dBefore[d.key], d.fmt)}</td></tr>`).join("");

    const talent = s.talentAt && s.talentAt === c.level
      ? `<div class="sysmsg gold anim-in"><span class="tag">[SISTEMA] Livello ${n(c.level)} raggiunto</span><span>Nuovo talento disponibile — scelto dal Master in base allo stile di gioco.</span></div>`
      : "";

    const body = `
      <div class="lu-kpis">
        <div class="kv"><span class="label">Livello</span><span class="v">${n(c.level)}</span></div>
        <div class="kv"><span class="label">EXP</span><span class="v">${n(c.expPct)}<small>%</small></span></div>
        <div class="kv"><span class="label">Punti liberi</span><span class="v">${n(s.free)}</span></div>
      </div>
      <div class="row">
        <button type="button" class="btn primary" id="lu-sim">Simula level up</button>
        <span class="xs muted">+${S.rules.LEVEL.autoPerLevel} a ogni statistica, +${S.rules.LEVEL.freePerLevel} punti liberi. Talento ogni ${S.rules.LEVEL.talentEvery} livelli.</span>
      </div>
      ${talent}
      <div class="lu-sep"></div>
      <div class="stack" style="gap:4px">
        <span class="label">Distribuzione punti liberi</span>
        <div class="lu-big ${left === 0 ? "zero" : ""}" aria-live="polite">Residuo: <b>${n(left)}</b> / ${n(s.free)}</div>
        ${s.free === 0 ? '<span class="hint">Nessun punto da distribuire: simula un level up per riceverne 10.</span>' : '<span class="hint">I punti in sospeso finiscono nella colonna "Investiti" alla conferma.</span>'}
      </div>
      <div>${rows}</div>
      <div class="stack" style="gap:6px">
        <span class="label">Derivate principali</span>
        <div class="table-wrap"><table class="t lu-tbl">
          <thead><tr><th>Statistica</th><th class="num">Prima</th><th class="num">Dopo</th></tr></thead>
          <tbody>${drows}</tbody>
        </table></div>
      </div>
      <div class="row">
        <button type="button" class="btn primary" id="lu-confirm" ${pend > 0 ? "" : "disabled"}>Conferma distribuzione</button>
        <button type="button" class="btn ghost" id="lu-cancel" ${pend > 0 ? "" : "disabled"}>Annulla</button>
      </div>
      ${c.summary ? '<p class="footnote">Personaggio in forma riepilogativa: sono gestite solo le statistiche presenti.</p>' : ""}`;
    return S.ui.win("Level up", body, { gold: true, right: `<span class="chip gold">Lv ${n(c.level)}</span>` });
  }

  /* ---------- Finestra B: Combattimento ---------- */
  function combatWin(c, s) {
    const d = S.rules.derived(c);
    const r = c.resources;
    const shield = c.combat.effects.find((e) => Number(e.absorb) > 0);
    const posOpts = POSITIONS.map((p) => `<option ${p === c.combat.position ? "selected" : ""}>${esc(p)}</option>`).join("");

    const effects = c.combat.effects.length
      ? `<ul class="lu-list">${c.combat.effects.map((e, i) => `
          <li><span class="chip ${e.kind === "good" ? "good" : "bad"}">${esc(e.name)}</span>
            <span class="small">${esc(e.text || "")}</span>
            <span class="lu-turns">${n(e.turns)} ${Number(e.turns) === 1 ? "turno" : "turni"}</span>
            <button type="button" class="btn icon ghost" data-rm-eff="${i}" aria-label="Rimuovi ${esc(e.name)}">✕</button></li>`).join("")}</ul>`
      : '<p class="small muted">Nessun effetto attivo.</p>';

    const cds = c.combat.cooldowns.length
      ? `<ul class="lu-list">${c.combat.cooldowns.map((cd) => `
          <li><span class="small">${esc(cd.name)}</span><span class="lu-turns">${n(cd.turns)} ${Number(cd.turns) === 1 ? "turno" : "turni"}</span></li>`).join("")}</ul>`
      : '<p class="small muted">Nessuna abilità in ricarica.</p>';

    const form = s.addOpen ? `
      <div class="lu-form anim-in">
        <div class="field"><label class="label" for="lu-eff-name">Nome</label>
          <input class="input" id="lu-eff-name" type="text" autocomplete="off" value="${esc(s.eff.name)}" placeholder="Es. Veleno"></div>
        <div class="field"><label class="label" for="lu-eff-kind">Tipo</label>
          <select class="input" id="lu-eff-kind">
            <option value="good" ${s.eff.kind === "good" ? "selected" : ""}>Buono</option>
            <option value="bad" ${s.eff.kind === "bad" ? "selected" : ""}>Malus</option>
          </select></div>
        <div class="field"><label class="label" for="lu-eff-turns">Turni</label>
          <input class="input num" id="lu-eff-turns" type="number" min="1" max="99" inputmode="numeric" value="${esc(s.eff.turns)}"></div>
        <div class="row">
          <button type="button" class="btn primary" id="lu-eff-add" ${s.eff.name.trim() ? "" : "disabled"}>Aggiungi</button>
          <button type="button" class="btn ghost" id="lu-eff-cancel">Annulla</button>
        </div>
      </div>` : "";

    const logHtml = s.log.length
      ? `<div class="sysmsg lu-log" aria-live="polite"><span class="tag">[REGISTRO]</span>${s.log.map((l) => `<span>${esc(l)}</span>`).join("")}</div>`
      : '<p class="small muted">Nessun evento registrato.</p>';

    let death = "";
    if (s.deathMsg) {
      death += `<div class="sysmsg ${s.deathMsg.protected ? "" : "gold"} anim-in">${s.deathMsg.lines.map((l, i) => i === 0 ? `<span class="tag">${esc(l)}</span>` : `<span>${esc(l)}</span>`).join("")}
        <div class="row" style="margin-top:6px"><button type="button" class="btn ghost" id="lu-death-close">Chiudi</button></div></div>`;
    }
    if (s.deathOpen) {
      const p = S.rules.deathPenalty(c.level, c.expPct || 0, s.hubris);
      const preview = p.protected
        ? `Livello ${n(c.level)} protetto: nessuna perdita di livello.`
        : `Livello ${n(c.level)} · ${n(c.expPct)}% → ${n(p.level)} · ${n(p.expPct)}% (−${p.lost.toLocaleString("it-IT")} livelli)`;
      death += `<div class="lu-death anim-in" role="group" aria-labelledby="lu-death-t">
        <span class="lu-title" id="lu-death-t">Confermi la morte di ${esc(c.name)}?</span>
        <span class="small mono">${esc(preview)}</span>
        <label class="lu-check small" for="lu-hubris"><input type="checkbox" id="lu-hubris" ${s.hubris ? "checked" : ""}> Morte per Hubris (−3 livelli invece di −1,5)</label>
        <div class="field"><label class="label" for="lu-respawn">Rinascita</label>
          <select class="input" id="lu-respawn">
            <option value="checkpoint" ${s.respawn === "checkpoint" ? "selected" : ""}>Al checkpoint — risorse al 50%</option>
            <option value="posto" ${s.respawn === "posto" ? "selected" : ""}>Sul posto — 1 HP</option>
          </select></div>
        <div class="row">
          <button type="button" class="btn danger" id="lu-death-ok">Conferma morte</button>
          <button type="button" class="btn ghost" id="lu-death-no">Annulla</button>
        </div>
      </div>`;
    } else {
      death += `<div class="row"><button type="button" class="btn danger" id="lu-death">Morte del personaggio</button>
        <span class="xs muted">I livelli 1–2 sono protetti.</span></div>`;
    }

    const body = `
      <div class="field">
        <label class="label" for="lu-pos">Posizione</label>
        <select class="input" id="lu-pos">${posOpts}</select>
      </div>
      <div class="stack">
        ${S.ui.bar("hp", "Vita (HP)", r.hp, d.hp)}
        ${S.ui.bar("mp", "Mana (MP)", r.mp, d.mp)}
        ${S.ui.bar("sp", "Stamina (SP)", r.sp, d.sp)}
        ${shield ? `<div class="row"><span class="chip good">${esc(shield.name)}: assorbe ancora ${n(shield.absorb)} danni</span></div>` : ""}
      </div>
      <div class="lu-amt">
        <div class="field">
          <label class="label" for="lu-amt">Quantità</label>
          <input class="input num" id="lu-amt" type="number" min="0" inputmode="numeric" value="${esc(s.amt)}">
        </div>
        <div class="lu-actions">
          <button type="button" class="btn danger" id="lu-dmg">Danno</button>
          <button type="button" class="btn" id="lu-heal">Cura</button>
          <button type="button" class="btn" id="lu-mp">Spendi MP</button>
          <button type="button" class="btn" id="lu-sp">Spendi SP</button>
        </div>
        <p class="footnote">HP non si rigenerano in combattimento. A fine turno: MP +${S.rules.REGEN.mpPct}% e SP +${S.rules.REGEN.spPct}% del massimo.</p>
      </div>
      <div class="lu-sep"></div>
      <div class="stack" style="gap:6px">
        <div class="row"><span class="label">Effetti attivi</span><span class="spacer" style="margin-left:auto"></span>
          ${s.addOpen ? "" : '<button type="button" class="btn ghost" id="lu-eff-open">+ Aggiungi effetto</button>'}</div>
        ${effects}
        ${form}
      </div>
      <div class="stack" style="gap:6px">
        <span class="label">Cooldown</span>
        ${cds}
      </div>
      <div class="row">
        <button type="button" class="btn primary" id="lu-turn">Fine turno</button>
        <span class="small muted">Turno ${n(s.turn)}</span>
      </div>
      ${logHtml}
      <div class="lu-sep"></div>
      ${death}`;
    return S.ui.win("Combattimento", body, { right: `<span class="chip violet">Turno ${n(s.turn)}</span>` });
  }

  /* ---------- Azioni ---------- */
  function simulateLevelUp(c, s) {
    const from = c.level;
    c.level = from + 1;
    c.expPct = 0;
    for (const r of c.stats) r.levelup = (Number(r.levelup) || 0) + S.rules.LEVEL.autoPerLevel;
    s.free += S.rules.LEVEL.freePerLevel;
    s.talentAt = c.level % S.rules.LEVEL.talentEvery === 0 ? c.level : null;
    S.ui.toast("LEVEL UP", [`Livello ${n(from)} → ${n(c.level)}`, `+${S.rules.LEVEL.autoPerLevel} a ogni statistica`, `+${S.rules.LEVEL.freePerLevel} punti liberi da distribuire`], true);
    stateRef.setChar(c.id); // aggiorna anche il selettore in alto (livello)
  }

  function confirmDistribution(c, s) {
    const total = sum(s.pending);
    if (total <= 0) return;
    const parts = [];
    for (const r of c.stats) {
      const p = s.pending[r.code] || 0;
      if (p > 0) { r.investiti = (Number(r.investiti) || 0) + p; parts.push(`${r.code} +${p}`); }
    }
    s.free -= total;
    s.pending = {};
    S.ui.toast("SISTEMA", ["Distribuzione confermata.", parts.join(" · ")], false);
  }

  function damage(c, s, amt) {
    let rest = amt;
    const shield = c.combat.effects.find((e) => Number(e.absorb) > 0);
    if (shield) {
      const abs = Math.min(Number(shield.absorb), rest);
      shield.absorb = Number(shield.absorb) - abs;
      rest -= abs;
      if (shield.absorb <= 0) {
        c.combat.effects = c.combat.effects.filter((e) => e !== shield);
        log(s, `${shield.name} assorbe ${n(abs)} danni e si dissolve.`);
      } else {
        shield.text = `Assorbe ${n(shield.absorb)} danni`;
        log(s, `${shield.name} assorbe ${n(abs)} danni.`);
      }
    }
    if (rest > 0) {
      c.resources.hp = Math.max(0, c.resources.hp - rest);
      log(s, `Subiti ${n(rest)} danni. HP ${n(c.resources.hp)}.`);
      if (c.resources.hp === 0) log(s, "HP a zero: il personaggio è a terra.");
    }
  }

  function endTurn(c, s) {
    const d = S.rules.derived(c);
    const r = c.resources;
    const mpGain = Math.min(d.mp - r.mp, Math.round((d.mp * S.rules.REGEN.mpPct) / 100));
    const spGain = Math.min(d.sp - r.sp, Math.round((d.sp * S.rules.REGEN.spPct) / 100));
    r.mp = Math.min(d.mp, r.mp + Math.max(0, mpGain));
    r.sp = Math.min(d.sp, r.sp + Math.max(0, spGain));
    log(s, `Fine turno: MP +${n(Math.max(0, mpGain))}, SP +${n(Math.max(0, spGain))}.`);
    for (const e of c.combat.effects) {
      const h = Number(e.hpPerTurn) || 0;
      if (h) {
        r.hp = Math.max(0, Math.min(d.hp, r.hp + h));
        log(s, `${e.name}: ${h > 0 ? "+" : "−"}${n(Math.abs(h))} HP.`);
      }
      e.turns = (Number(e.turns) || 0) - 1;
    }
    const expired = c.combat.effects.filter((e) => e.turns <= 0).map((e) => e.name);
    c.combat.effects = c.combat.effects.filter((e) => e.turns > 0);
    if (expired.length) log(s, `Effetti terminati: ${expired.join(", ")}.`);
    for (const cd of c.combat.cooldowns) cd.turns = (Number(cd.turns) || 0) - 1;
    const ready = c.combat.cooldowns.filter((cd) => cd.turns <= 0).map((cd) => cd.name);
    c.combat.cooldowns = c.combat.cooldowns.filter((cd) => cd.turns > 0);
    if (ready.length) log(s, `Di nuovo pronte: ${ready.join(", ")}.`);
    s.turn += 1;
  }

  function die(c, s) {
    const fromLevel = c.level, fromExp = c.expPct || 0;
    const p = S.rules.deathPenalty(fromLevel, fromExp, s.hubris);
    if (!p.protected) { c.level = p.level; c.expPct = p.expPct; }
    const d = S.rules.derived(c);
    const r = c.resources;
    let resLine;
    if (s.respawn === "checkpoint") {
      r.hp = Math.round(d.hp / 2); r.mp = Math.round(d.mp / 2); r.sp = Math.round(d.sp / 2);
      resLine = `Rinascita al checkpoint: HP ${n(r.hp)} · MP ${n(r.mp)} · SP ${n(r.sp)} (50%).`;
    } else {
      r.hp = 1; r.mp = Math.min(r.mp, d.mp); r.sp = Math.min(r.sp, d.sp);
      resLine = "Rinascita sul posto: 1 HP.";
    }
    c.combat.effects = [];
    c.combat.cooldowns = [];
    const lines = ["[SISTEMA] Sei morto."];
    if (p.protected) {
      lines.push(`Livello ${n(fromLevel)} protetto: nessuna perdita di livello.`);
    } else {
      lines.push(`Perdita: −${p.lost.toLocaleString("it-IT")} livelli${s.hubris ? " (Hubris)" : ""}.`);
      lines.push(`Livello ${n(fromLevel)} · ${n(fromExp)}% → ${n(p.level)} · ${n(p.expPct)}%.`);
      lines.push(`Malus: ${p.malus}.`);
      lines.push(`Bonus: ${p.bonus}.`);
    }
    lines.push(resLine);
    s.deathMsg = { protected: !!p.protected, lines };
    s.deathOpen = false;
    s.hubris = false;
    s.turn = 1;
    s.log = [];
    s.talentAt = null;
    log(s, p.protected ? "Morte (livello protetto)." : `Morte: livello ${n(fromLevel)} → ${n(c.level)}.`);
    stateRef.setChar(c.id); // aggiorna il selettore in alto
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
    const c = stateRef.char;
    ensure(c);
    const s = local(c);
    const f = focusId ? { id: focusId } : captureFocus(root);
    const sub = `${esc(c.name)} · ${esc(c.classe || "")} · Livello ${n(c.level)}. Le modifiche restano solo in questa pagina.`;
    root.innerHTML = mode === "combat"
      ? `<div class="lu-root stack" style="gap:16px">
          <div class="lu-head"><h1>Combattimento</h1><p class="muted small">${sub}</p></div>
          <div class="lu-combat-grid">${combatWin(c, s)}${combatStatsWin(c)}</div>
          <p class="footnote">In questo mockup la morte aggiorna livello ed EXP ma non ritocca i punti già assegnati alle statistiche.</p>
        </div>`
      : `<div class="lu-root stack" style="gap:16px">
          <div class="lu-head"><h1>Level up</h1><p class="muted small">${sub}</p></div>
          <div class="lu-level-wrap">${levelWin(c, s)}</div>
        </div>`;
    bind(root.firstElementChild, c, s);
    restoreFocus(root, f);
  }

  function amount(el) {
    const v = Math.floor(Number(el.querySelector("#lu-amt")?.value));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  function bind(el, c, s) {
    el.addEventListener("click", (ev) => {
      const t = ev.target.closest("button");
      if (!t || !el.contains(t) || t.disabled) return;
      const id = t.id;
      if (t.dataset.inc) {
        if (s.free - sum(s.pending) > 0) s.pending[t.dataset.inc] = (s.pending[t.dataset.inc] || 0) + 1;
        return draw();
      }
      if (t.dataset.dec) {
        if ((s.pending[t.dataset.dec] || 0) > 0) s.pending[t.dataset.dec]--;
        return draw();
      }
      if (t.dataset.rmEff) {
        const e = c.combat.effects[Number(t.dataset.rmEff)];
        if (e) { c.combat.effects.splice(Number(t.dataset.rmEff), 1); log(s, `Effetto rimosso: ${e.name}.`); }
        return draw("lu-eff-open");
      }
      const amt = amount(el);
      const r = c.resources;
      const d = S.rules.derived(c);
      switch (id) {
        case "lu-sim": return simulateLevelUp(c, s);
        case "lu-confirm": confirmDistribution(c, s); return draw("lu-sim");
        case "lu-cancel": s.pending = {}; return draw("lu-sim");
        case "lu-dmg": if (amt) damage(c, s, amt); return draw();
        case "lu-heal":
          if (amt) { const g = Math.min(amt, d.hp - r.hp); r.hp = Math.min(d.hp, r.hp + amt); log(s, `Cura: +${n(Math.max(0, g))} HP. HP ${n(r.hp)}.`); }
          return draw();
        case "lu-mp":
        case "lu-sp": {
          const k = id === "lu-mp" ? "mp" : "sp";
          const L = k.toUpperCase();
          if (amt) {
            if (r[k] < amt) log(s, `${L} insufficienti: servono ${n(amt)}, disponibili ${n(r[k])}.`);
            else { r[k] -= amt; log(s, `Spesi ${n(amt)} ${L}. ${L} ${n(r[k])}.`); }
          }
          return draw();
        }
        case "lu-turn": endTurn(c, s); return draw();
        case "lu-eff-open": s.addOpen = true; return draw("lu-eff-name");
        case "lu-eff-cancel": s.addOpen = false; return draw("lu-eff-open");
        case "lu-eff-add": {
          const name = s.eff.name.trim();
          if (!name) return;
          const turns = Math.max(1, Math.min(99, Math.floor(Number(s.eff.turns)) || 1));
          c.combat.effects.push({ name, kind: s.eff.kind, text: s.eff.kind === "good" ? "Effetto positivo" : "Malus", turns });
          log(s, `Nuovo effetto: ${name} (${turns} ${turns === 1 ? "turno" : "turni"}).`);
          s.eff = { name: "", kind: s.eff.kind, turns: 3 };
          s.addOpen = false;
          return draw("lu-eff-open");
        }
        case "lu-death": s.deathOpen = true; return draw("lu-hubris");
        case "lu-death-no": s.deathOpen = false; s.hubris = false; return draw("lu-death");
        case "lu-death-ok": return die(c, s);
        case "lu-death-close": s.deathMsg = null; return draw();
      }
    });
    el.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.id === "lu-amt") s.amt = t.value;
      else if (t.id === "lu-eff-name") {
        s.eff.name = t.value;
        const b = el.querySelector("#lu-eff-add");
        if (b) b.disabled = !t.value.trim();
      } else if (t.id === "lu-eff-turns") s.eff.turns = t.value;
    });
    el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      if (ev.target.id === "lu-eff-name" || ev.target.id === "lu-eff-turns") {
        ev.preventDefault();
        el.querySelector("#lu-eff-add")?.click();
      }
    });
    el.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.id === "lu-pos") { c.combat.position = t.value; log(s, `Posizione: ${t.value}.`); draw(); }
      else if (t.id === "lu-eff-kind") s.eff.kind = t.value;
      else if (t.id === "lu-hubris") { s.hubris = t.checked; draw(); }
      else if (t.id === "lu-respawn") s.respawn = t.value;
    });
  }

  /* Pannello laterale: i valori che servono al tavolo durante lo scontro (con tooltip della formula) */
  const COMBAT_KEYS = ["iniziativa", "attacchi", "precisione", "evasione", "critico", "blocco", "difesa", "difesaMag", "moltFis", "moltMag"];
  function combatStatsWin(c) {
    const R = S.rules;
    const d = R.derived(c);
    const ib = c.itemBonus || {};
    const rows = COMBAT_KEYS.map((k) => R.DERIVED.find((def) => def.key === k)).filter(Boolean).map((def) => {
      const bonus = Number(ib[def.key]) || 0;
      const total = def.cap != null ? Math.min(def.cap, d[def.key] + bonus) : d[def.key] + bonus;
      return `<div class="lu-cs-row" tabindex="0" title="${esc(R.formulaText(def, c))} = ${esc(R.explain(def, c))}${bonus ? ` (+${esc(R.fmt(bonus, def.fmt))} oggetti)` : ""}">
        <span class="muted small">${esc(def.label)}</span>
        <b class="num ${bonus ? "lu-gold" : ""}">${esc(R.fmt(total, def.fmt))}</b>
      </div>`;
    }).join("");
    return S.ui.win("Valori di combattimento", `<div class="lu-cs">${rows}</div>
      <p class="footnote">Passa sopra un valore per vedere la formula. In oro i valori con bonus degli oggetti.</p>`);
  }

  let mode = "levelup";
  function screen(m, title) {
    return {
      title,
      render(root, state) {
        injectStyle();
        mode = m;
        rootRef = root;
        stateRef = state;
        draw();
      },
    };
  }
  S.screens.levelup = screen("levelup", "Level up");
  S.screens.combattimento = screen("combat", "Combattimento");
})();
