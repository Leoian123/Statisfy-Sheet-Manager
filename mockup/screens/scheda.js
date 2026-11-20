/* Schermata: Scheda personaggio.
   Header, risorse, statistiche, derivate e tab con titoli/skill/talenti/inventario/pet/maledizioni/quest/reputazione. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};

  /* ---------- CSS locale (solo token) ---------- */
  function injectStyle() {
    if (document.getElementById("sc-style")) return;
    const st = document.createElement("style");
    st.id = "sc-style";
    st.textContent = `
      .sc-head { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-start; }
      .sc-head-main { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .sc-name { font-size: var(--fs-2xl); color: var(--gold); overflow-wrap: anywhere; }
      .sc-sub { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.04em; }
      .sc-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px 16px; flex: 2 1 320px; min-width: 0; }
      .sc-meta .kv .v { font-size: var(--fs-md); overflow-wrap: anywhere; }
      .sc-res { display: flex; flex-direction: column; gap: 14px; }
      .sc-res-row { display: flex; gap: 8px; align-items: flex-end; }
      .sc-res-row .bar { flex: 1 1 auto; }
      .sc-res-btns { display: flex; gap: 4px; flex: none; }
      table.t td.sc-tot, table.t th.sc-tot { color: var(--gold); font-weight: 700; background: var(--gold-soft); }
      table.t tr.sc-group td { background: var(--panel-2); font-family: var(--font-display); font-size: var(--fs-xs);
        text-transform: uppercase; letter-spacing: 0.1em; color: var(--violet); font-weight: 600; }
      table.t th[title] { cursor: help; text-decoration: underline dotted var(--line-strong); text-underline-offset: 3px; }
      .sc-dgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); column-gap: 24px; }
      .sc-drow {
        position: relative; display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
        padding: 7px 8px; margin: 0 -8px; border-bottom: 1px solid var(--line); border-radius: 4px; cursor: help;
      }
      .sc-drow:hover, .sc-drow:focus-visible { background: var(--panel-2); outline: none; }
      .sc-drow:focus-visible { box-shadow: inset 0 0 0 1px var(--violet); }
      .sc-dlabel { color: var(--muted); font-size: var(--fs-sm); display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
      .sc-dval { font-size: var(--fs-md); white-space: nowrap; }
      .sc-dval.boosted, .sc-gold { color: var(--gold); }
      .sc-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
      .sc-dot.gold { background: var(--gold); } .sc-dot.warn { background: var(--warn); }
      .sc-warn { color: var(--warn); }
      .sc-tip {
        position: absolute; z-index: 15; left: 0; right: 0; top: calc(100% + 4px);
        display: flex; flex-direction: column; gap: 3px; padding: 10px 12px;
        background: var(--panel); border: 1px solid var(--violet); border-radius: var(--radius);
        box-shadow: 0 8px 24px var(--violet-soft); font-size: var(--fs-xs);
        opacity: 0; visibility: hidden; transform: translateY(-4px); transition: opacity .12s, transform .12s, visibility .12s;
        pointer-events: none;
      }
      .sc-drow:hover .sc-tip, .sc-drow:focus-visible .sc-tip,
      .sc-srow:hover .sc-tip, .sc-srow:focus-visible .sc-tip { opacity: 1; visibility: visible; transform: none; }
      .sc-dot.violet { background: var(--violet); }
      .sc-sgroup { font-family: var(--font-display); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.1em;
        color: var(--violet); font-weight: 600; padding: 10px 0 4px; }
      .sc-sgroup:first-child { padding-top: 0; }
      .sc-srow {
        position: relative; display: grid; grid-template-columns: 3.2em minmax(0, 7.5em) minmax(40px, 1fr) 4.5em;
        align-items: center; gap: 10px; padding: 7px 8px; margin: 0 -8px; border-bottom: 1px solid var(--line);
        border-radius: 4px; cursor: help;
      }
      .sc-srow:hover, .sc-srow:focus-visible { background: var(--panel-2); outline: none; }
      .sc-srow:focus-visible { box-shadow: inset 0 0 0 1px var(--violet); }
      .sc-scode { font-weight: 700; }
      .sc-sname { color: var(--muted); font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-flex; align-items: center; gap: 6px; }
      .sc-sbar { display: flex; height: 6px; border-radius: 999px; overflow: hidden; background: var(--panel-2); }
      .sc-seg { height: 100%; }
      .sc-stot { text-align: right; color: var(--gold); font-size: var(--fs-md); }
      .sc-sw { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: 0; }
      .sc-src-iniziale { background: var(--muted); }
      .sc-src-creazione { background: var(--sp); }
      .sc-src-investiti { background: var(--violet); }
      .sc-src-levelup { background: var(--mp); }
      .sc-src-altro { background: var(--warn); }
      .sc-src-titoli { background: var(--gold); }
      .sc-src-oggetti { background: var(--r-unico); }
      .sc-tline { display: flex; justify-content: space-between; gap: 12px; }
      .sc-tsum { border-top: 1px solid var(--line); padding-top: 3px; margin-top: 2px; color: var(--gold); }
      @media (max-width: 420px) { .sc-srow { grid-template-columns: 3em minmax(0, 1fr) 4.5em; } .sc-sbar { display: none; } }
      .sc-legend { gap: 14px; padding-top: 4px; }
      .sc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
      .sc-card { background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px;
        display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .sc-card h4 { font-size: var(--fs-md); overflow-wrap: anywhere; }
      .sc-tabpanel { padding-top: 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .sc-mini { height: 6px; min-width: 70px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--line); overflow: hidden; }
      .sc-mini > div { height: 100%; background: var(--violet); }
      .sc-filter .btn[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: var(--gold-soft); }
      .sc-rep { display: flex; flex-direction: column; gap: 4px; }
      .sc-rep-track { position: relative; height: 10px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--line); overflow: hidden; }
      .sc-rep-track::after { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--line-strong); }
      .sc-rep-fill { position: absolute; top: 0; bottom: 0; }
      .sc-rep-fill.pos { background: var(--good); }
      .sc-rep-fill.neg { background: var(--bad); }
      .sc-rep-scale { display: flex; justify-content: space-between; }
      .sc-empty { text-align: center; padding: 24px 12px; }
      .sc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .sc-list li { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; background: var(--panel-2);
        display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; }
      .sc-list li .sc-grow { flex: 1 1 200px; min-width: 0; }
    `;
    document.head.appendChild(st);
  }

  /* ---------- Stato locale ---------- */
  let tab = "titoli";
  let skillFilter = "Tutti";
  let lastCharId = null;

  const TABS = [
    { key: "titoli", label: "Titoli", list: "titles" },
    { key: "skill", label: "Skill", list: "skills" },
    { key: "attive", label: "Skill attive", list: "activeSkills" },
    { key: "talenti", label: "Talenti", list: "talents" },
    { key: "inventario", label: "Inventario", list: "inventory" },
    { key: "pet", label: "Pet", list: "pets" },
    { key: "maledizioni", label: "Maledizioni", list: "curses" },
    { key: "quest", label: "Quest", list: "quests" },
    { key: "reputazione", label: "Reputazione", list: "reputation" },
  ];

  const SOURCE_HELP = {
    iniziale: "Valore di partenza della statistica",
    creazione: "Punti bonus assegnati in creazione (20 da distribuire)",
    investiti: "Punti liberi del level up investiti dal giocatore (+10 per livello)",
    levelup: "Incremento automatico: +1 a ogni stat base per livello",
    altro: "Bonus da talenti, oggetti permanenti o eventi",
    titoli: "Somma dei bonus dei titoli posseduti",
  };

  const EMPTY = "Nel mockup la scheda completa è disponibile solo per Kelvin.";

  /* ---------- Helper ---------- */
  function n(v) { return Number(v || 0).toLocaleString("it-IT"); }
  function arr(c, key) { return Array.isArray(c[key]) ? c[key] : []; }
  function empty(text) {
    return `<div class="sc-empty muted small">${S.ui.esc(text || EMPTY)}</div>`;
  }
  function pvpChip(flag) {
    const cls = { Bianco: "muted", Grigio: "warn", Rosso: "bad" }[flag] || "muted";
    return `<span class="chip ${cls}" title="Flag PvP">PvP ${S.ui.esc(flag || "—")}</span>`;
  }
  function miniBar(pct) {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="sc-mini" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><div style="width:${p}%"></div></div><span class="num xs">${p}%</span></div>`;
  }
  function progress(pct) {
    return pct === "MAX" ? `<span class="chip gold">MAX</span>` : miniBar(pct);
  }
  function grade(lvl) {
    const R = S.rules;
    const l = Number(lvl) || 0;
    return `<span class="num">${S.ui.esc(R.ROMAN[l] || "—")}</span> <span class="muted xs">${S.ui.esc(R.GRADES[l - 1] || "")}</span>`;
  }
  function bonusText(b) {
    return Object.entries(b || {}).map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`).join(", ");
  }

  /* ---------- Sezioni ---------- */
  function header(c) {
    const R = S.rules, esc = S.ui.esc;
    const gilda = c.gilda || {};
    const money = [];
    if (c.corone != null) money.push(`<div class="kv"><span class="label">Corone</span><span class="v">${n(c.corone)}</span></div>`);
    if (c.scellini != null) money.push(`<div class="kv"><span class="label">Scellini</span><span class="v">${n(c.scellini)}</span></div>`);
    const body = `
      <div class="sc-head">
        <div class="sc-head-main">
          <h1 class="sc-name">${esc(c.name)}</h1>
          <div class="row">
            <span class="sc-sub">${esc(c.classe)}</span>
            <span class="chip gold num">Lv ${esc(c.level)}</span>
            <span class="chip violet" title="Rango di potere per livello">${esc(R.powerRank(c.level))}</span>
            ${pvpChip(c.pvp)}
          </div>
          ${S.ui.bar("exp", "EXP %", Number(c.expPct) || 0, 100)}
        </div>
        <div class="sc-meta">
          <div class="kv"><span class="label">Regno</span><span class="v">${esc(c.regno || "—")}</span></div>
          <div class="kv"><span class="label">Gilda</span><span class="v">${esc(gilda.nome || "—")}</span>${gilda.ruolo ? `<span class="xs muted">${esc(gilda.ruolo)}</span>` : ""}</div>
          ${money.join("")}
        </div>
      </div>`;
    return S.ui.win("Finestra di stato", body, { gold: true, right: `<span class="xs muted">${esc(c.owner || "")}</span>` });
  }

  function resources(c, d) {
    const res = c.resources || { hp: d.hp, mp: d.mp, sp: d.sp };
    const rows = [
      ["hp", "Vita (HP)"], ["mp", "Mana (MP)"], ["sp", "Stamina (SP)"],
    ].map(([k, label]) => `
      <div class="sc-res-row">
        ${S.ui.bar(k, label, Math.min(res[k] ?? d[k], d[k]), d[k])}
        <div class="sc-res-btns">
          <button type="button" class="btn icon" data-res="${k}" data-dir="-1" aria-label="${S.ui.esc(label)}: −10%" title="−10% del massimo">−</button>
          <button type="button" class="btn icon" data-res="${k}" data-dir="1" aria-label="${S.ui.esc(label)}: +10%" title="+10% del massimo">+</button>
        </div>
      </div>`).join("");
    return S.ui.win("Risorse", `<div class="sc-res">${rows}</div><p class="footnote">I bottoni spostano la risorsa del 10% del massimo (dimostrativo, non salvato).</p>`);
  }

  function statsTable(c) {
    const R = S.rules, esc = S.ui.esc;
    const groups = [
      { kind: "base", label: "Statistiche base" },
      { kind: "avanzata", label: "Statistiche avanzate" },
    ];
    let body = "";
    for (const g of groups) {
      const rows = c.stats.filter((r) => r.kind === g.kind);
      if (!rows.length) continue;
      body += `<div class="sc-sgroup">${esc(g.label)}</div>`;
      body += rows.map((r) => {
        const tot = R.statTotal(r);
        const segs = R.SOURCES.map((s) => {
          const v = Number(r[s.key]) || 0;
          return v > 0 && tot > 0 ? `<span class="sc-seg sc-src-${s.key}" style="width:${(v / tot) * 100}%"></span>` : "";
        }).join("");
        const lines = R.SOURCES.map((s) => `<span class="sc-tline"><span><span class="sc-sw sc-src-${s.key}"></span>${esc(s.label)}</span><b class="num">${n(r[s.key])}</b></span>`).join("");
        return `<div class="sc-srow" tabindex="0" aria-describedby="sc-stip-${esc(r.code)}">
          <span class="sc-scode mono">${esc(r.code)}</span>
          <span class="sc-sname">${esc(r.name)}${r.note ? ` <span class="sc-dot violet" aria-hidden="true"></span>` : ""}</span>
          <span class="sc-sbar" aria-hidden="true">${segs}</span>
          <b class="sc-stot num">${n(tot)}</b>
          <div class="sc-tip" role="tooltip" id="sc-stip-${esc(r.code)}">
            <span class="label">${esc(r.code)} · ${esc(r.name)}</span>
            ${lines}
            <span class="sc-tline sc-tsum"><span>Totale</span><b class="num">${n(tot)}</b></span>
            ${r.note ? `<span class="muted">${esc(r.note)}</span>` : ""}
          </div>
        </div>`;
      }).join("");
    }
    const legend = `<div class="row xs muted sc-legend">${R.SOURCES.map((s) => `<span title="${esc(SOURCE_HELP[s.key] || s.label)}"><span class="sc-sw sc-src-${s.key}"></span>${esc(s.label)}</span>`).join("")}</div>`;
    const total = R.freePointsTotal(c.level);
    const used = c.stats.reduce((sum, r) => sum + (Number(r.investiti) || 0), 0);
    const left = total - used;
    const chip = left === 0
      ? `<span class="chip good">Residuo 0</span>`
      : `<span class="chip warn">Residuo ${n(left)}</span>`;
    const counters = `<div class="row small">
      <span>Punti liberi level up: <b class="num">${n(used)}</b> investiti / <b class="num">${n(total)}</b> totali</span>
      ${chip}
    </div>
    <p class="footnote">Totale punti liberi = (livello − 1) × ${R.LEVEL.freePerLevel}.</p>`;
    return S.ui.win("Statistiche", `<div class="sc-stats">${body}</div>${legend}${counters}`);
  }

  function derivedPanel(c, d) {
    const R = S.rules, esc = S.ui.esc;
    const ib = c.itemBonus || {};
    const t = R.totals(c);
    const cells = R.derivedFor(c).map((def) => {
      const base = d[def.key];
      const bonus = Number(ib[def.key]) || 0;
      const total = def.cap != null ? Math.min(def.cap, base + bonus) : base + bonus;
      // Formula con i valori del personaggio: "100 + VIT×15" -> "100 + 186×15"
      const withValues = R.explain(def, c);
      const note = def.note ? def.note(c) : "";
      const flags = `${def.disputed ? `<span class="sc-dot warn" aria-hidden="true"></span>` : ""}${bonus ? `<span class="sc-dot gold" aria-hidden="true"></span>` : ""}`;
      return `<div class="sc-drow" tabindex="0" aria-describedby="sc-tip-${def.key}">
        <span class="sc-dlabel">${esc(def.label)}${flags}</span>
        <span class="sc-dval num ${bonus ? "boosted" : ""}">${esc(R.fmt(total, def.fmt))}</span>
        <div class="sc-tip" role="tooltip" id="sc-tip-${def.key}">
          <span class="label">Formula</span>
          <span class="mono">${esc(R.formulaText(def, c))}</span>
          <span class="mono muted">= ${esc(withValues)} = ${esc(R.fmt(base, def.fmt))}</span>
          ${bonus ? `<span>Bonus oggetti: <b class="num sc-gold">+${esc(R.fmt(bonus, def.fmt))}</b> → <b class="num sc-gold">${esc(R.fmt(total, def.fmt))}</b></span>` : ""}
          ${note ? `<span>${esc(note)}</span>` : ""}
          <span class="muted">Fonte: ${esc(def.src)}</span>
          ${def.disputed ? `<span class="sc-warn">Formula non concordata fra le schede: da decidere.</span>` : ""}
        </div>
      </div>`;
    }).join("");
    const legend = `<div class="row xs muted sc-legend">
      <span><span class="sc-dot gold"></span> include bonus oggetti</span>
      ${R.DERIVED.some((x) => x.disputed) ? `<span><span class="sc-dot warn"></span> formula da decidere</span>` : ""}
      <span>Passa sopra un valore per vedere il calcolo</span>
    </div>`;
    return S.ui.win("Statistiche derivate", `<div class="sc-dgrid">${cells}</div>${legend}`);
  }

  /* ---------- Tab ---------- */
  function tabTitoli(c) {
    const list = arr(c, "titles");
    if (!list.length) return empty();
    return `<div class="table-wrap"><table class="t">
      <thead><tr><th>Titolo</th><th>Rarità</th><th>Bonus</th></tr></thead>
      <tbody>${list.map((t) => `<tr><td>${S.ui.esc(t.name)}</td><td>${S.ui.rarityChip(t.rarity)}</td><td class="mono small">${S.ui.esc(bonusText(t.bonus) || "—")}</td></tr>`).join("")}</tbody>
    </table></div>`;
  }

  function tabSkill(c) {
    const esc = S.ui.esc;
    const list = arr(c, "skills");
    if (!list.length) return empty();
    const types = ["Tutti", ...Array.from(new Set(list.map((s) => s.type)))];
    if (!types.includes(skillFilter)) skillFilter = "Tutti";
    const shown = skillFilter === "Tutti" ? list : list.filter((s) => s.type === skillFilter);
    const filter = `<div class="row sc-filter" role="group" aria-label="Filtra per tipo">
      ${types.map((t) => `<button type="button" class="btn ghost" data-skill-filter="${esc(t)}" aria-pressed="${t === skillFilter}">${esc(t)}${t !== "Tutti" ? ` <span class="xs muted num">${list.filter((s) => s.type === t).length}</span>` : ""}</button>`).join("")}
    </div>`;
    return `${filter}<div class="table-wrap"><table class="t">
      <thead><tr><th>Skill</th><th>Tipo</th><th title="Grado di maestria I–X">Grado</th><th title="Progresso verso il grado successivo">Progresso</th><th>Passiva</th></tr></thead>
      <tbody>${shown.map((s) => `<tr>
        <td>${esc(s.name)}</td>
        <td><span class="chip violet">${esc(s.type)}</span></td>
        <td style="white-space:nowrap">${grade(s.lvl)}</td>
        <td>${progress(s.pct)}</td>
        <td class="small">${s.passive ? esc(s.passive) : `<span class="muted">—</span>`}</td>
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function tabAttive(c) {
    const esc = S.ui.esc;
    const list = arr(c, "activeSkills");
    if (!list.length) return empty();
    return `<div class="sc-cards">${list.map((s) => `<article class="sc-card">
      <h4>${esc(s.name)}</h4>
      <p class="small">${esc(s.effect)}</p>
      <div class="row">
        <span class="chip" style="color:var(--mp)">Costo ${esc(s.cost)}</span>
        <span class="chip muted">Cooldown ${esc(s.cd)} turni</span>
      </div>
      <div class="row small"><span>Grado ${grade(s.lvl)}</span></div>
      ${progress(s.pct)}
    </article>`).join("")}</div>`;
  }

  function tabTalenti(c) {
    const esc = S.ui.esc;
    const every = S.rules.LEVEL.talentEvery;
    const next = (Math.floor(c.level / every) + 1) * every;
    const msg = `<div class="sysmsg"><span class="tag">[SISTEMA]</span><span>Prossimo talento al Lv ${next} (ogni ${every} livelli).</span></div>`;
    const list = arr(c, "talents");
    if (!list.length) return msg + empty();
    return `${msg}<div class="table-wrap"><table class="t">
      <thead><tr><th>Talento</th><th>Rarità</th><th>Origine</th><th>Effetto</th></tr></thead>
      <tbody>${list.map((t) => `<tr><td>${esc(t.name)}</td><td>${S.ui.rarityChip(t.rarity)}</td><td class="mono small" style="white-space:nowrap">${esc(t.origin)}</td><td class="small">${esc(t.effect)}</td></tr>`).join("")}</tbody>
    </table></div>`;
  }

  function tabInventario(c, d) {
    const esc = S.ui.esc;
    const list = arr(c, "inventory");
    if (S.inv && S.inv.hasDemo(c)) return '<div id="sc-inv-mount"></div>';
    if (!list.length) return empty();
    const tot = list.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.weight) || 0), 0);
    const kg = (v) => `${(Math.round(v * 10) / 10).toLocaleString("it-IT")} kg`;
    const pct = d.carico > 0 ? (tot / d.carico) * 100 : 0;
    const top = `<div class="bar ${pct > 100 ? "hp" : "sp"}">
      <div class="bar-top"><span class="label">Peso trasportato</span><span class="num">${kg(tot)} / ${kg(d.carico)}</span></div>
      <div class="bar-track" role="progressbar" aria-label="Peso trasportato" aria-valuemin="0" aria-valuemax="${Math.round(d.carico)}" aria-valuenow="${Math.round(tot)}"><div class="bar-fill" style="width:${Math.min(100, pct)}%"></div></div>
    </div>`;
    return `${top}<div class="table-wrap"><table class="t">
      <thead><tr><th>Oggetto</th><th>Stats</th><th>Rarità</th><th>Tipo</th><th class="num">Q.tà</th><th class="num" title="Quantità × peso unitario">Peso tot.</th></tr></thead>
      <tbody>${list.map((i) => `<tr>
        <td>${esc(i.name)}${Object.values(c.equipped || {}).includes(i.id) ? ` <span class="chip gold">Equipaggiato</span>` : ""}</td><td class="small">${esc(i.stats_text || (typeof i.stats === "string" ? i.stats : ""))}</td><td>${S.ui.rarityChip(i.rarity)}</td><td class="small">${esc(i.type)}</td>
        <td class="num">${n(i.qty)}</td><td class="num" style="white-space:nowrap">${kg((Number(i.qty) || 0) * (Number(i.weight) || 0))}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="5">Totale</td><td class="num" style="white-space:nowrap">${kg(tot)}</td></tr></tfoot>
    </table></div>`;
  }

  function tabPet(c) {
    const esc = S.ui.esc;
    const list = arr(c, "pets");
    if (!list.length) return empty();
    return `<div class="sc-cards">${list.map((p) => `<article class="sc-card">
      <div class="row"><h4>${esc(p.name)}</h4><span class="chip gold num">Lv ${esc(p.lvl)}</span></div>
      <span class="small muted">${esc(p.species)}</span>
      <div class="small"><span class="label">Passiva</span> ${esc(p.passive || "—")}</div>
      <div class="stack" style="gap:6px">
        <span class="label">Skill</span>
        ${(p.skills || []).map((s) => `<div class="row small" style="justify-content:space-between"><span>${esc(s.name)} · ${grade(s.lvl)}</span>${progress(s.pct)}</div>`).join("") || `<span class="muted small">—</span>`}
      </div>
    </article>`).join("")}</div>`;
  }

  function tabMaledizioni(c) {
    const esc = S.ui.esc;
    const list = arr(c, "curses");
    if (!list.length) return empty();
    return `<div class="sc-cards">${list.map((m) => `<article class="sc-card">
      <h4>${esc(m.name)}</h4>
      <p class="small">${esc(m.desc)}</p>
      <div class="row"><span class="chip good">Bonus</span><span class="small">${esc(m.bonus)}</span></div>
      <div class="row"><span class="chip bad">Malus</span><span class="small">${esc(m.malus)}</span></div>
    </article>`).join("")}</div>`;
  }

  function tabQuest(c) {
    const esc = S.ui.esc;
    const list = arr(c, "quests");
    if (!list.length) return empty();
    return `<ul class="sc-list">${list.map((q) => `<li>
      <div class="sc-grow"><b>${esc(q.name)}</b> ${q.rarity ? S.ui.rarityChip(q.rarity) : ""}<div class="xs muted">Ricompensa: ${esc(q.reward)}</div></div>
      <span class="chip violet num">${esc(q.progress)}</span>
    </li>`).join("")}</ul>`;
  }

  function tabReputazione(c) {
    const esc = S.ui.esc;
    const list = arr(c, "reputation");
    if (!list.length) return empty();
    return `<div class="stack" style="gap:16px">${list.map((r) => {
      const title = `<div class="row" style="justify-content:space-between">
        <span><span class="label">${esc(r.scope)}</span> <b>${esc(r.target)}</b></span>
        <span class="small">${esc(r.label)}${r.range ? ` · <span class="num">${r.value > 0 ? "+" : ""}${n(r.value)}</span>` : ""}</span>
      </div>`;
      if (!r.range) return `<div class="sc-rep">${title}<span class="xs muted">Scala non numerica.</span></div>`;
      const v = Math.max(-r.range, Math.min(r.range, Number(r.value) || 0));
      const w = (Math.abs(v) / r.range) * 50;
      const left = v >= 0 ? 50 : 50 - w;
      return `<div class="sc-rep">${title}
        <div class="sc-rep-track" role="meter" aria-label="Reputazione ${esc(r.target)}" aria-valuemin="${-r.range}" aria-valuemax="${r.range}" aria-valuenow="${v}">
          <div class="sc-rep-fill ${v >= 0 ? "pos" : "neg"}" style="left:${left}%;width:${w}%"></div>
        </div>
        <div class="sc-rep-scale xs muted num"><span>−${n(r.range)}</span><span>0</span><span>+${n(r.range)}</span></div>
      </div>`;
    }).join("")}</div>`;
  }

  function tabsPanel(c, d) {
    const esc = S.ui.esc;
    const renderers = {
      titoli: tabTitoli, skill: tabSkill, attive: tabAttive, talenti: tabTalenti, inventario: tabInventario,
      pet: tabPet, maledizioni: tabMaledizioni, quest: tabQuest, reputazione: tabReputazione,
    };
    const bar = `<div class="tabs" role="tablist" aria-label="Sezioni della scheda">${TABS.map((t) => `
      <button type="button" role="tab" id="sc-tab-${t.key}" aria-controls="sc-panel" data-tab="${t.key}"
        aria-selected="${t.key === tab}" tabindex="${t.key === tab ? 0 : -1}">${esc(t.label)}<span class="count">${arr(c, t.list).length}</span></button>`).join("")}
    </div>`;
    const panel = `<div class="sc-tabpanel" role="tabpanel" id="sc-panel" aria-labelledby="sc-tab-${tab}" tabindex="0">${renderers[tab](c, d)}</div>`;
    return S.ui.win("Dettagli", bar + panel);
  }

  /* ---------- Render ---------- */
  function render(root, state) {
    injectStyle();
    const c = state.char;
    if (c.id !== lastCharId) { lastCharId = c.id; skillFilter = "Tutti"; }
    const d = S.rules.derived(c);
    if (!c.resources) c.resources = { hp: d.hp, mp: d.mp, sp: d.sp };

    root.innerHTML = `
      ${header(c)}
      ${c.summary ? `<div class="sysmsg"><span class="tag">[SISTEMA]</span><span>Scheda in forma riassuntiva: solo statistiche e risorse.</span></div>` : ""}
      <div class="grid-2">
        <div class="stack" style="gap:20px">${resources(c, d)}${statsTable(c)}</div>
        <div class="stack" style="gap:20px">${derivedPanel(c, d)}</div>
      </div>
      ${tabsPanel(c, d)}
    `;

    const rerender = (focusSel) => {
      render(root, state);
      if (focusSel) { const el = root.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
    };

    /* Tab Inventario: manichino e borsa con drag & drop; ogni cambio ridisegna la scheda (stats e derivate) */
    const invMount = root.querySelector("#sc-inv-mount");
    if (invMount) S.inv.mount(invMount, state, { onChange: rerender });

    root.onclick = (e) => {
      const resBtn = e.target.closest("[data-res]");
      if (resBtn && root.contains(resBtn)) {
        const k = resBtn.dataset.res, dir = Number(resBtn.dataset.dir);
        const max = S.rules.derived(c)[k];
        const step = Math.max(1, Math.round(max * 0.1));
        const cur = Math.min(Number(c.resources[k] ?? max), max);
        c.resources[k] = Math.max(0, Math.min(max, cur + dir * step));
        rerender(`[data-res="${k}"][data-dir="${dir}"]`);
        return;
      }
      const tabBtn = e.target.closest("[data-tab]");
      if (tabBtn && root.contains(tabBtn)) {
        tab = tabBtn.dataset.tab;
        rerender(`[data-tab="${tab}"]`);
        return;
      }
      const f = e.target.closest("[data-skill-filter]");
      if (f && root.contains(f)) {
        skillFilter = f.dataset.skillFilter;
        rerender(`[data-skill-filter="${CSS.escape(skillFilter)}"]`);
      }
    };

    root.onkeydown = (e) => {
      const t = e.target.closest && e.target.closest('[role="tab"]');
      if (!t) return;
      const keys = TABS.map((x) => x.key);
      let i = keys.indexOf(t.dataset.tab);
      if (e.key === "ArrowRight") i = (i + 1) % keys.length;
      else if (e.key === "ArrowLeft") i = (i - 1 + keys.length) % keys.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = keys.length - 1;
      else return;
      e.preventDefault();
      tab = keys[i];
      rerender(`[data-tab="${tab}"]`);
    };
  }

  S.screens.scheda = { title: "Scheda personaggio", render };
})();
