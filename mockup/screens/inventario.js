/* Schermata: Inventario in stile MMORPG.
   Manichino con gli slot (S.rules.SLOTS), borsa a caselle, tooltip degli oggetti con confronto,
   equip/unequip con clic, tastiera e drag & drop, pannello "Effetto sulla scheda" collegato alle regole. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};

  /* ---------- CSS locale (solo token) ---------- */
  function injectStyle() {
    if (document.getElementById("inv-style")) return;
    const st = document.createElement("style");
    st.id = "inv-style";
    st.textContent = `
      .inv-root { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
      .inv-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; }
      .inv-name { font-size: var(--fs-2xl); color: var(--gold); overflow-wrap: anywhere; }
      .inv-sub { font-family: var(--font-display); font-weight: 600; letter-spacing: 0.04em; }
      .inv-head .inv-link { margin-left: auto; text-decoration: none; }
      .inv-layout { display: grid; gap: 20px; min-width: 0;
        grid-template-columns: min-content minmax(280px, 1fr) minmax(250px, 320px); grid-template-areas: "doll bag effect"; align-items: start; }
      .inv-a-doll { grid-area: doll; } .inv-a-bag { grid-area: bag; } .inv-a-effect { grid-area: effect; }
      @media (max-width: 1300px) {
        .inv-layout { grid-template-columns: min-content minmax(0, 1fr); grid-template-areas: "doll effect" "bag bag"; }
      }
      @media (max-width: 760px) {
        .inv-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "doll" "bag" "effect"; }
      }

      /* Slot e caselle: quadrati, bordo del colore di rarità (currentColor via [data-rarity]) */
      .inv-root { --inv-slot: 54px; }
      @media (max-width: 420px) { .inv-root { --inv-slot: 46px; } }
      .inv-cell {
        position: relative; width: var(--inv-slot); height: var(--inv-slot); aspect-ratio: 1; padding: 0; margin: 0;
        display: flex; align-items: center; justify-content: center; flex: none;
        border: 2px solid currentColor; border-radius: 5px; cursor: pointer;
        background: var(--panel-2);
        background: radial-gradient(circle at 50% 35%, color-mix(in srgb, currentColor 22%, var(--panel-2)), var(--panel-2) 75%);
        box-shadow: inset 0 0 0 1px var(--panel), 0 0 10px color-mix(in srgb, currentColor 25%, transparent);
        font-family: var(--font-display); overflow: hidden; touch-action: manipulation;
      }
      .inv-cell:hover { filter: brightness(1.12); }
      .inv-cell:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
      .inv-sig { font-weight: 700; font-size: 1.05rem; letter-spacing: 0.04em; line-height: 1; color: currentColor; }
      .inv-type { position: absolute; top: 2px; left: 4px; font-size: 9px; line-height: 1; color: var(--muted); font-family: var(--font-mono); }
      .inv-qty { position: absolute; right: 3px; bottom: 2px; font-size: 11px; line-height: 1; font-family: var(--font-mono); font-weight: 600;
        color: var(--fg); text-shadow: 0 0 3px var(--panel), 0 0 3px var(--panel); }
      .inv-dur { position: absolute; left: 4px; right: 4px; bottom: 3px; height: 3px; border-radius: 999px; background: var(--line); overflow: hidden; }
      .inv-dur > i { display: block; height: 100%; background: var(--good); }
      .inv-dur.mid > i { background: var(--warn); }
      .inv-dur.low > i { background: var(--bad); }
      .inv-cell.inv-empty { border-style: dashed; border-width: 1px; color: var(--line-strong); background: var(--panel-2); box-shadow: none; cursor: default; }
      .inv-slot.inv-empty { cursor: help; }
      .inv-elabel { font-size: 9px; line-height: 1.1; text-align: center; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; padding: 0 2px; overflow-wrap: anywhere; }
      .inv-ghost { opacity: 0.45; border-style: dashed; cursor: pointer; }
      .inv-lock { position: absolute; top: 2px; right: 3px; font-size: 9px; color: var(--muted); font-family: var(--font-mono); }
      .inv-drop-ok { box-shadow: 0 0 0 2px var(--gold), 0 0 14px var(--gold-soft) !important; color: var(--gold); }
      .inv-drop-hover { background: var(--gold-soft) !important; }
      .inv-dim { opacity: 0.35; }
      .inv-cell { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      [data-drag] { cursor: grab; }
      .inv-dragging { opacity: 0.3; }
      .inv-chip-wrap { white-space: normal; max-width: 100%; height: auto; line-height: 1.3; }
      .inv-drag-ghost { position: fixed; left: 0; top: 0; z-index: 60; pointer-events: none; cursor: grabbing;
        transform: translate(-50%, -50%) scale(1.12); box-shadow: 0 10px 26px rgba(0,0,0,.5), 0 0 16px color-mix(in srgb, currentColor 50%, transparent); }
      body.inv-grabbing, body.inv-grabbing * { cursor: grabbing !important; }
      .inv-bag.inv-drop-ok { box-shadow: inset 0 0 0 2px var(--gold); }
      .inv-layout.inv-emb { grid-template-columns: min-content minmax(0, 1fr); grid-template-areas: "doll bag"; }
      @media (max-width: 900px) { .inv-layout.inv-emb { grid-template-columns: minmax(0, 1fr); grid-template-areas: "doll" "bag"; } }
      .inv-emb .inv-a-doll, .inv-emb .inv-a-bag { margin: 0; }
      /* Con più colonne il manichino resta visibile mentre si scorre un inventario lungo */
      @media (min-width: 761px) and (min-height: 700px) { .inv-layout:not(.inv-emb) .inv-a-doll { position: sticky; top: 76px; } }
      @media (min-width: 901px) and (min-height: 700px) { .inv-layout.inv-emb .inv-a-doll { position: sticky; top: 76px; } }
      /* ---------- Stile "finestra di stato" alla Overgeared, nei colori del System ---------- */
      .og-win { background: linear-gradient(180deg, color-mix(in srgb, var(--violet) 16%, var(--panel)) 0%, var(--panel) 220px);
        border-color: color-mix(in srgb, var(--violet) 45%, var(--line)); }
      .og-h { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 16px 0; text-align: center; }
      .og-h::after { content: ""; align-self: stretch; height: 1px; margin-top: 10px;
        background: linear-gradient(90deg, transparent, var(--violet), var(--gold), var(--violet), transparent); opacity: .8; }
      .og-orn { width: 180px; max-width: 75%; height: auto; display: block; }
      .og-orn .og-wing { fill: color-mix(in srgb, var(--violet) 45%, transparent); stroke: var(--violet); stroke-width: .8; }
      .og-orn .og-gem { fill: var(--gold-soft); stroke: var(--gold); stroke-width: 1; }
      .og-t { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); font-weight: 700; letter-spacing: .1em;
        color: var(--fg); text-shadow: 0 0 14px var(--violet-soft); }
      .og-kv { line-height: 1.55; min-width: 0; overflow-wrap: anywhere; }
      .og-k { color: var(--fg); }
      .og-v { color: var(--gold); }
      .og-v.bad, .og-bad { color: var(--bad); } .og-v.good, .og-good { color: var(--good); }
      .og-pair { display: flex; flex-wrap: wrap; gap: 0 18px; }
      .og-lines { display: flex; flex-direction: column; gap: 0; }
      .og-sep { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; color: var(--violet); font-family: var(--font-display);
        font-size: var(--fs-xs); letter-spacing: .12em; text-transform: uppercase; }
      .og-sep::before, .og-sep::after { content: ""; flex: 1; height: 1px; background: color-mix(in srgb, var(--violet) 50%, transparent); }
      .og-opt { color: var(--good); }
      .og-flavor { color: var(--gold); font-style: italic; opacity: .9; margin-top: 4px; }

      /* Inventario: lista senza limite di oggetti */
      .og-info { display: flex; flex-direction: column; gap: 2px; }
      .og-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .og-tools .og-search { flex: 1 1 180px; min-width: 0; }
      .og-list { display: flex; flex-direction: column; gap: 2px; padding: 4px; margin: 0 -4px; border-radius: var(--radius); min-width: 0; }
      .og-group { padding: 8px 6px 2px; }
      .og-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; width: 100%;
        padding: 5px 8px; border: 1px solid transparent; border-radius: 6px; background: transparent; text-align: left;
        font: inherit; cursor: pointer; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
      .og-item:not([data-rarity]) { color: var(--fg); }
      .og-item:hover { background: color-mix(in srgb, currentColor 9%, var(--panel-2)); border-color: color-mix(in srgb, currentColor 35%, transparent); }
      .og-item:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
      .og-item[data-drag] { cursor: grab; }
      .og-item.inv-dragging { opacity: .3; }
      .og-item[hidden] { display: none; }
      .inv-ico { position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border: 2px solid currentColor;
        border-radius: 5px; font-family: var(--font-display); font-weight: 700; font-size: .8rem; letter-spacing: .03em;
        background: radial-gradient(circle at 50% 35%, color-mix(in srgb, currentColor 22%, var(--panel-2)), var(--panel-2) 75%); }
      .og-iname { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .og-imeta { grid-column: 2; font-size: var(--fs-xs); color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .og-iqty { grid-column: 3; grid-row: 1 / span 2; font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--fg); }
      .og-empty { padding: 10px 6px; color: var(--muted); font-size: var(--fs-sm); }
      #inv-bag.inv-drop-ok { box-shadow: inset 0 0 0 2px var(--gold); background: var(--gold-soft); }
      #inv-bag.inv-drop-hover { background: color-mix(in srgb, var(--gold) 22%, transparent); }

      /* Tooltip: la stessa finestra */
      #inv-tip { background: linear-gradient(180deg, color-mix(in srgb, var(--violet) 18%, var(--panel)) 0%, var(--panel) 160px);
        border-width: 1px; max-width: min(320px, calc(100vw - 16px)); font-size: var(--fs-sm); gap: 0; }
      #inv-tip .og-h { padding: 0 0 2px; }
      #inv-tip .og-h::after { margin-top: 6px; margin-bottom: 4px; }
      #inv-tip .og-orn { width: 140px; }
      #inv-tip .og-iname-big { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-md); line-height: 1.25; }


      /* Manichino */
      .inv-doll { display: grid; grid-template-columns: var(--inv-slot) 170px var(--inv-slot); gap: 8px 10px; align-items: stretch; }
      .inv-col { display: flex; flex-direction: column; gap: 8px; }
      .inv-fig { display: flex; align-items: center; justify-content: center; min-width: 110px; }
      .inv-fig svg { width: 100%; max-width: 170px; height: auto; }
      .inv-fig .inv-body { fill: var(--panel-2); stroke: var(--line-strong); stroke-width: 2; stroke-linejoin: round; }
      .inv-fig .inv-aura { fill: none; stroke: var(--violet); stroke-width: 1.5; opacity: 0.5; }
      .inv-fig .inv-base { fill: var(--violet-soft); stroke: var(--violet); stroke-width: 1; opacity: 0.8; }
      @media (max-width: 760px) { .inv-doll { grid-template-columns: var(--inv-slot) minmax(0, 1fr) var(--inv-slot); } }
      .inv-bottom { grid-column: 1 / -1; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; padding-top: 4px; border-top: 1px solid var(--line); margin-top: 2px; padding-top: 10px; }
      .inv-bottom .inv-gap { width: 10px; }

      /* Borsa */
      .inv-money { display: flex; flex-wrap: wrap; gap: 8px 18px; align-items: center; }
      .inv-coin { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); }
      .inv-coin i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--line-strong); }
      .inv-coin.gold i { background: var(--gold); border-color: var(--gold); }
      .inv-coin.silver i { background: var(--r-comune); border-color: var(--r-comune); }
      .inv-weight { display: flex; flex-direction: column; gap: 4px; }
      .inv-weight .bar-fill { background: var(--good); }
      .inv-weight.heavy .bar-fill { background: var(--warn); }
      .inv-weight.over .bar-fill { background: var(--bad); }
      .inv-filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .inv-filters .btn { padding: 4px 10px; font-size: var(--fs-xs); }
      .inv-filters .btn[aria-pressed="true"] { border-color: var(--gold); color: var(--gold); background: var(--gold-soft); }
      .inv-sort { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
      .inv-sort select { width: auto; padding: 4px 8px; font-size: var(--fs-xs); }
      .inv-bag { display: grid; grid-template-columns: repeat(6, var(--inv-slot)); gap: 6px; justify-content: start;
        padding: 8px; border-radius: var(--radius); background: var(--bg); border: 1px solid var(--line); width: max-content; max-width: 100%; }
      @media (max-width: 760px) {
        .inv-bag { width: auto; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; padding: 4px; }
        .inv-bag .inv-cell { width: 100%; height: auto; }
      }
      .inv-bag .inv-cell.inv-empty { border-color: var(--line); }

      /* Effetto sulla scheda */
      .inv-group { font-family: var(--font-display); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.1em; color: var(--violet); font-weight: 600; padding-top: 4px; }
      .inv-rows { display: flex; flex-direction: column; }
      .inv-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 5px 8px; margin: 0 -8px;
        border-bottom: 1px solid var(--line); border-radius: 4px; cursor: help; }
      .inv-row:hover, .inv-row:focus-visible { background: var(--panel-2); outline: none; }
      .inv-row:focus-visible { box-shadow: inset 0 0 0 1px var(--violet); }
      .inv-rl { color: var(--muted); font-size: var(--fs-sm); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .inv-rv { display: inline-flex; align-items: baseline; gap: 6px; white-space: nowrap; }
      .inv-rv .num { font-size: var(--fs-sm); }
      .inv-from { font-size: var(--fs-xs); color: var(--r-unico); font-family: var(--font-mono); }
      .inv-delta { font-size: var(--fs-xs); font-family: var(--font-mono); font-weight: 700; animation: sys-in .25s ease-out; }
      .inv-delta.up { color: var(--good); } .inv-delta.down { color: var(--bad); }
      .inv-row.inv-flash-up { background: color-mix(in srgb, var(--good) 14%, transparent); }
      .inv-row.inv-flash-down { background: color-mix(in srgb, var(--bad) 14%, transparent); }
      .inv-bonus { display: flex; flex-wrap: wrap; gap: 6px; }
      .inv-bonus .chip { color: var(--good); }

      /* Tooltip MMO: uno solo, position fixed, posizionato e limitato alla viewport via JS */
      #inv-tip {
        position: fixed; z-index: 40; left: 0; top: 0; width: max-content; max-width: min(300px, calc(100vw - 16px));
        display: flex; flex-direction: column; gap: 3px; padding: 10px 12px;
        background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--radius);
        box-shadow: 0 10px 28px var(--violet-soft), 0 0 0 1px var(--panel); font-size: var(--fs-xs); line-height: 1.45;
        pointer-events: none; visibility: hidden; opacity: 0; transition: opacity .1s;
        overflow-wrap: anywhere;
      }
      #inv-tip.on { visibility: visible; opacity: 1; }
      #inv-tip .inv-tn { font-family: var(--font-display); font-size: var(--fs-md); font-weight: 700; line-height: 1.2; }
      #inv-tip .inv-tsep { border-top: 1px solid var(--line); margin: 3px 0 1px; }
      #inv-tip .good { color: var(--good); } #inv-tip .bad { color: var(--bad); } #inv-tip .warn { color: var(--warn); }
      #inv-tip .gold { color: var(--gold); }
      #inv-tip .inv-tl { display: flex; justify-content: space-between; gap: 14px; }
      #inv-tip .inv-desc { font-style: italic; color: var(--gold); }
      #inv-tip .inv-hint { color: var(--muted); font-family: var(--font-mono); }
    `;
    document.head.appendChild(st);
  }

  /* ---------- Stato locale della schermata ---------- */
  let filter = "tutti";
  let sort = "rarita";
  let lastCharId = null;
  let flash = { stats: {}, der: {} };
  let flashUntil = 0;
  let flashTimer = null;
  let drag = null; // { id, from: "bag" | "slot", slot }

  const FILTERS = [
    { key: "tutti", label: "Tutti" },
    { key: "equip", label: "Equipaggiabili" },
    { key: "consumabili", label: "Consumabili" },
    { key: "materiali", label: "Materiali" },
    { key: "altro", label: "Altro" },
  ];
  const CONSUMABLE_TYPES = ["Cibo", "Pozione", "Consumabile", "Bevanda", "Pergamena"];
  const SORTS = [
    { key: "rarita", label: "Rarità" },
    { key: "tipo", label: "Tipo" },
    { key: "nome", label: "Nome" },
  ];
  const SHORT_SLOT = { manoPrincipale: "Mano P.", manoSecondaria: "Mano S.", mantello: "Mant.", ninnolo1: "Ninn.", ninnolo2: "Ninn.", cintura: "Cint." };
  const TYPE_ABBR = { Arma: "ARMA", Armatura: "ARM", Scudo: "SCU", Accessorio: "ACC", Strumento: "STR", Materiale: "MAT", Cibo: "CIB", Libro: "LIB", Pozione: "POZ" };
  /* Derivate mostrate nel pannello e usate nel confronto */
  const MAIN_DER = ["hp", "mp", "sp", "difesa", "difesaMag", "evasione", "critico", "blocco", "carico"];
  const SHORT_DER = { hp: "HP max", mp: "MP max", sp: "SP max", difesa: "Difesa", difesaMag: "Difesa magica", evasione: "Evasione",
    critico: "Critico", blocco: "Blocco", carico: "Carico", precisione: "Precisione", velocita: "Velocità", resElementi: "Res. elementi",
    resVeleni: "Res. veleni", iniziativa: "Iniziativa", attacchi: "Attacchi/turno", regen: "Regen HP", bonusExp: "Bonus EXP",
    moltFis: "Molt. fisico", moltMag: "Molt. magico" };
  /* Bonus degli oggetti che vanno nelle formule come "equipaggiamento" (valori assoluti) */
  const FLAT_BONUS = { difesa: "Difesa", difesaMagica: "Difesa magica", blocco: "Blocco" };

  /* ---------- Helper ---------- */
  const R = () => S.rules;
  const esc = (s) => S.ui.esc(s);
  const nf = (v) => (Math.round(Number(v || 0) * 10) / 10).toLocaleString("it-IT");
  function signed(v, kind) {
    const a = Math.abs(v);
    const txt = kind ? R().fmt(a, kind) : nf(a);
    return (v < 0 ? "−" : "+") + txt;
  }
  function hasDemo(c) { return !!(c && c.equipped && Array.isArray(c.inventory)); }
  function itemById(c, id) { return ((c && c.inventory) || []).find((i) => i.id === id) || null; }
  function equippedIds(c) { return new Set(Object.values((c && c.equipped) || {}).filter(Boolean)); }
  function isCoin(it) { return it.type === "Monete"; }
  function initials(name) {
    const stop = ["del", "della", "dello", "dei", "degli", "delle", "di", "da", "la", "il", "lo", "le", "gli", "un", "una"];
    const w = String(name || "?").replace(/['’]/g, " ").split(/\s+/).filter((x) => x && !stop.includes(x.toLowerCase()));
    const letters = (w.length ? w : [String(name || "?")]).slice(0, 2).map((x) => x[0]).join("");
    return letters.toUpperCase();
  }
  function rarityGrade(r) {
    const e = R().RARITY_SCALE.find((x) => R().rarityKey(x.name) === R().rarityKey(r));
    return e ? e.grade : 0;
  }
  function derDef(key) { return R().DERIVED.find((d) => d.key === key); }
  /* Valore finale come in Scheda: derivata + bonus oggetti, entro l'eventuale tetto */
  function finalDerived(c) {
    const d = R().derived(c);
    const ib = c.itemBonus || {};
    const out = {};
    for (const def of R().DERIVED) {
      const v = d[def.key] + (Number(ib[def.key]) || 0);
      out[def.key] = def.cap != null ? Math.min(def.cap, v) : v;
    }
    return out;
  }
  function snapshot(c) { return { stats: R().totals(c), der: finalDerived(c) }; }
  function slotLabelForItem(it) {
    const t = R().equipType(it);
    return t ? t.label : "";
  }
  function bonusLines(it) {
    const out = [];
    for (const [k, v] of Object.entries(it.stats || {})) if (v) out.push(`${signed(Number(v))} ${k}`);
    for (const [k, v] of Object.entries(it.bonus || {})) {
      if (!v) continue;
      if (k === "blocco") out.push(`Blocco ${nf(v)}%`);
      else if (FLAT_BONUS[k]) out.push(`${FLAT_BONUS[k]} ${nf(v)}`);
      else {
        const def = derDef(k);
        const label = SHORT_DER[k] || (def ? def.label : k);
        out.push(def && def.fmt === "pct" ? `${signed(Number(v))}% ${label}` : `${signed(Number(v))} ${label}`);
      }
    }
    return out;
  }
  function categoryOf(it) {
    if (it.slot) return "equip";
    if (CONSUMABLE_TYPES.includes(it.type)) return "consumabili";
    if (it.type === "Materiale") return "materiali";
    return "altro";
  }


  /* ---------- Finestre stile Overgeared ---------- */
  function ornament() {
    const wing = "M90 13 C 76 3, 52 1, 12 8 C 40 7, 62 9, 78 14 C 60 12, 38 14, 20 21 C 46 16, 68 17, 90 13 Z";
    return `<svg class="og-orn" viewBox="0 0 200 26" aria-hidden="true" focusable="false">
      <path class="og-wing" d="${wing}"/><path class="og-wing" d="${wing}" transform="matrix(-1 0 0 1 200 0)"/>
      <path class="og-gem" d="M100 2 L109 13 L100 24 L91 13 Z"/></svg>`;
  }
  function ogWin(title, body, cls) {
    return `<section class="win og-win ${cls || ""}"><header class="og-h">${ornament()}<h3 class="og-t">${esc(title)}</h3></header>
      <div class="win-b">${body}</div></section>`;
  }
  function kv(label, valueHtml, cls) {
    return `<div class="og-kv"><span class="og-k">${esc(label)}:</span> <span class="og-v ${cls || ""}">${valueHtml}</span></div>`;
  }

  /* ---------- Logica di equipaggiamento (pura sul PG passato: usata anche sui cloni per il confronto) ---------- */
  function compatibleSlots(it) {
    if (!R().equipType(it)) return [];
    return R().SLOTS.filter((s) => R().slotAccepts(s, it));
  }
  function clearSlot(c, key, removed) {
    const id = c.equipped[key];
    if (!id) return;
    for (const k of Object.keys(c.equipped)) if (c.equipped[k] === id) delete c.equipped[k];
    removed.add(id);
  }
  function equipItem(c, it, slotKey) {
    if (!it.slot || !compatibleSlots(it).length) return { ok: false, reason: "noslot" };
    const unmet = R().unmetRequirements(c, it);
    if (unmet.length) return { ok: false, reason: "req", unmet };
    c.equipped = c.equipped || {};
    const eq = c.equipped;
    const removed = new Set();
    let target;
    if (R().isTwoHanded(it)) {
      target = "manoPrincipale";
      clearSlot(c, "manoPrincipale", removed);
      clearSlot(c, "manoSecondaria", removed);
      eq.manoPrincipale = it.id;
      eq.manoSecondaria = it.id;
    } else {
      const cands = compatibleSlots(it);
      const pick = (slotKey && cands.find((s) => s.key === slotKey)) || cands.find((s) => !eq[s.key]) || cands[0];
      target = pick.key;
      if (target === "manoPrincipale" || target === "manoSecondaria") {
        const main = itemById(c, eq.manoPrincipale);
        if (main && R().isTwoHanded(main)) clearSlot(c, "manoPrincipale", removed);
      }
      clearSlot(c, target, removed);
      eq[target] = it.id;
    }
    removed.delete(it.id);
    R().applyEquipment(c);
    return { ok: true, slot: target, removed: [...removed].map((id) => itemById(c, id)).filter(Boolean) };
  }
  /* Sposta un oggetto già indossato in un altro slot compatibile; l'eventuale occupante fa il percorso inverso
     se può, altrimenti torna nella borsa. */
  function moveSlot(c, fromKey, toKey) {
    const eq = c.equipped || {};
    const it = itemById(c, eq[fromKey]);
    if (!it || fromKey === toKey || R().isTwoHanded(it)) return { ok: false };
    const slotTo = R().SLOTS.find((s) => s.key === toKey);
    const slotFrom = R().SLOTS.find((s) => s.key === fromKey);
    if (!slotTo || !R().slotAccepts(slotTo, it)) return { ok: false };
    const other = itemById(c, eq[toKey]);
    const removed = [];
    if (other && R().isTwoHanded(other)) { clearSlot(c, "manoPrincipale", new Set()); removed.push(other); delete eq[fromKey]; }
    else if (other && R().slotAccepts(slotFrom, other)) { eq[fromKey] = other.id; }
    else { delete eq[fromKey]; if (other) removed.push(other); }
    eq[toKey] = it.id;
    R().applyEquipment(c);
    return { ok: true, it, other: other && !removed.includes(other) ? other : null, removed };
  }
  function unequipSlot(c, slotKey) {
    const id = c.equipped && c.equipped[slotKey];
    if (!id) return null;
    clearSlot(c, slotKey, new Set());
    R().applyEquipment(c);
    return itemById(c, id);
  }
  /* Differenze se si indossasse l'oggetto (clone del PG) */
  function compare(c, it) {
    if (!it.slot || !compatibleSlots(it).length) return null;
    const before = snapshot(c);
    const clone = JSON.parse(JSON.stringify(c));
    const res = equipItem(clone, it);
    if (!res.ok) return { res };
    const after = snapshot(clone);
    return { res, before, after };
  }

  /* ---------- Markup ---------- */
  function durBar(it) {
    if (!it.durability || !it.durability.max) return "";
    const pct = Math.max(0, Math.min(100, (it.durability.cur / it.durability.max) * 100));
    const cls = pct < 25 ? "low" : pct < 50 ? "mid" : "";
    return `<span class="inv-dur ${cls}" aria-hidden="true"><i style="width:${pct.toFixed(0)}%"></i></span>`;
  }
  function itemFace(it) {
    return `<span class="inv-type" aria-hidden="true">${esc(TYPE_ABBR[it.type] || String(it.type || "").slice(0, 3).toUpperCase())}</span>
      <span class="inv-sig" aria-hidden="true">${esc(initials(it.name))}</span>${durBar(it)}`;
  }

  function slotCell(c, slot, interactive) {
    const eq = (c && c.equipped) || {};
    const it = interactive ? itemById(c, eq[slot.key]) : null;
    const short = SHORT_SLOT[slot.key] || slot.label;
    if (!it) {
      return `<button type="button" class="inv-cell inv-slot inv-empty" data-slot="${slot.key}" data-tip="slot" ${interactive ? "" : "disabled"}
        aria-label="${esc(slot.label)}: vuoto"><span class="inv-elabel">${esc(short)}</span></button>`;
    }
    const ghost = slot.key === "manoSecondaria" && R().isTwoHanded(it);
    if (ghost) {
      return `<button type="button" class="inv-cell inv-slot inv-ghost" data-slot="${slot.key}" data-ghost="1" data-item="${esc(it.id)}" data-tip="item" data-ctx="ghost"
        data-rarity="${R().rarityKey(it.rarity)}" aria-label="${esc(slot.label)}: bloccato da ${esc(it.name)} (due mani). Premi per togliere l'arma">
        <span class="inv-sig" aria-hidden="true">${esc(initials(it.name))}</span><span class="inv-lock" aria-hidden="true">2M</span></button>`;
    }
    return `<button type="button" class="inv-cell inv-slot" data-drag="1" data-slot="${slot.key}" data-item="${esc(it.id)}" data-tip="item" data-ctx="slot"
      data-rarity="${R().rarityKey(it.rarity)}" aria-label="${esc(slot.label)}: ${esc(it.name)}. Premi per rimettere nella borsa">${itemFace(it)}</button>`;
  }

  function figure() {
    return `<svg viewBox="0 0 120 250" aria-hidden="true" focusable="false">
      <ellipse class="inv-base" cx="60" cy="236" rx="40" ry="8"/>
      <circle class="inv-aura" cx="60" cy="118" r="56"/>
      <circle class="inv-body" cx="60" cy="28" r="16"/>
      <path class="inv-body" d="M52 44 L68 44 L70 52 Q88 54 92 66 L100 126 Q101 132 95 133 L88 132 L80 82 L78 128 L82 226 Q82 230 77 230 L66 230 L61 146 L59 146 L54 230 L43 230 Q38 230 38 226 L42 128 L40 82 L32 132 L25 133 Q19 132 20 126 L28 66 Q32 54 50 52 Z"/>
    </svg>`;
  }

  function dollPanel(c, interactive) {
    const SL = R().SLOTS;
    const col = (side) => SL.filter((s) => s.side === side).map((s) => slotCell(c, s, interactive)).join("");
    const bottom = SL.filter((s) => s.side === "bottom");
    const ninn = bottom.filter((s) => s.accepts === "ninnolo").map((s) => slotCell(c, s, interactive)).join("");
    const hands = bottom.filter((s) => s.accepts !== "ninnolo").map((s) => slotCell(c, s, interactive)).join("");
    const body = `<div class="inv-doll" id="inv-doll">
        <div class="inv-col">${col("left")}</div>
        <div class="inv-fig">${figure()}</div>
        <div class="inv-col">${col("right")}</div>
        <div class="inv-bottom">${hands}<span class="inv-gap" aria-hidden="true"></span>${ninn}</div>
      </div>
      ${interactive ? `<p class="footnote">Trascina un oggetto su uno slot illuminato per equipaggiarlo, tra due slot per scambiarli, nell'inventario per toglierlo. Su touch: tieni premuto e trascina. Clic o Invio fanno lo stesso senza trascinare.</p>` : ""}`;
    return ogWin("Equipaggiamento", body, "inv-a-doll");
  }

  function bagItems(c) {
    const ids = equippedIds(c);
    let list = (c.inventory || []).filter((it) => it.id && !ids.has(it.id) && !isCoin(it));
    if (filter !== "tutti") list = list.filter((it) => categoryOf(it) === filter);
    const byName = (a, b) => String(a.name).localeCompare(String(b.name), "it");
    if (sort === "rarita") list.sort((a, b) => rarityGrade(b.rarity) - rarityGrade(a.rarity) || byName(a, b));
    else if (sort === "tipo") list.sort((a, b) => String(a.type).localeCompare(String(b.type), "it") || byName(a, b));
    else list.sort(byName);
    return list;
  }
  function coins(c) {
    const inv = c.inventory || [];
    const q = (id, fallback) => { const it = inv.find((x) => x.id === id); return fallback != null ? fallback : it ? it.qty : 0; };
    return { corone: q("it-corone", c.corone), scellini: q("it-scellini", c.scellini) };
  }
  function carried(c) { return (c.inventory || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.weight) || 0), 0); }

  const GROUPS = [
    { key: "equip", label: "Equipaggiamento" },
    { key: "consumabili", label: "Consumabili" },
    { key: "materiali", label: "Materiali" },
    { key: "altro", label: "Altro" },
  ];
  function bagRow(c, it) {
    const t = R().equipType(it);
    const rk = R().rarityKey(it.rarity);
    const meta = [it.type, t ? t.label : "", it.rarity].filter(Boolean).join(" · ");
    return `<button type="button" class="og-item" ${t ? 'data-drag="1"' : ""} data-bag="${esc(it.id)}" data-item="${esc(it.id)}" data-tip="item" data-ctx="bag"
      data-rarity="${rk}" data-name="${esc(String(it.name).toLowerCase())}"
      aria-label="${esc(it.name)}, ${esc(it.rarity)}${it.qty > 1 ? `, quantità ${it.qty}` : ""}${t ? ". Premi per equipaggiare" : ". Non equipaggiabile"}">
      <span class="inv-ico" aria-hidden="true">${esc(initials(it.name))}</span>
      <span class="og-iname">[${esc(it.name)}]</span>
      <span class="og-iqty">${it.qty > 1 ? `×${esc(Number(it.qty).toLocaleString("it-IT"))}` : ""}</span>
      <span class="og-imeta">${esc(meta)}</span>
    </button>`;
  }
  function bagPanel(c, fin) {
    const list = bagItems(c);
    const all = (c.inventory || []).filter((it) => !isCoin(it));
    const m = coins(c);
    const w = carried(c), cap = fin.carico;
    const pct = cap > 0 ? Math.min(100, (w / cap) * 100) : 0;
    const wcls = w > cap ? "over" : pct >= 75 ? "heavy" : "";
    const filters = FILTERS.map((f) => `<button type="button" class="btn ghost" data-filter="${f.key}" aria-pressed="${f.key === filter}">${esc(f.label)}</button>`).join("");
    const groups = GROUPS.map((g) => {
      const rows = list.filter((it) => categoryOf(it) === g.key);
      if (!rows.length) return "";
      return `<div class="og-sep og-group" data-group="${g.key}">${esc(g.label)} <span class="num">(${rows.length})</span></div>${rows.map((it) => bagRow(c, it)).join("")}`;
    }).join("");
    const body = `
      <div class="og-info">
        ${kv("Oggetti", `${esc(all.length)} <span class="muted">· ${esc(equippedIds(c).size)} equipaggiati · spazio illimitato</span>`)}
        ${kv("Corone d'Oro", esc(Number(m.corone || 0).toLocaleString("it-IT")))}
        ${kv("Scellini", esc(Number(m.scellini || 0).toLocaleString("it-IT")))}
      </div>
      <div class="inv-weight ${wcls}" data-tip="weight" tabindex="0">
        <div class="bar-top"><span class="og-k">Peso:</span><span class="num ${w > cap ? "og-bad" : "og-v"}">${esc(nf(w))} / ${esc(nf(cap))} kg</span></div>
        <div class="bar-track" role="progressbar" aria-label="Peso trasportato" aria-valuemin="0" aria-valuemax="${Math.round(cap)}" aria-valuenow="${Math.round(w)}"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <div class="og-tools">
        <input class="input og-search" id="inv-q" type="search" placeholder="Cerca un oggetto…" aria-label="Cerca nell'inventario" autocomplete="off">
        <label class="inv-sort small"><span class="label">Ordina</span>
          <select class="input" id="inv-sort">${SORTS.map((s) => `<option value="${s.key}" ${s.key === sort ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>
        </label>
      </div>
      <div class="inv-filters" role="group" aria-label="Filtra oggetti">${filters}</div>
      <div class="og-list" id="inv-bag" aria-label="Borsa">
        ${groups || `<div class="og-empty">Nessun oggetto${filter !== "tutti" ? " in questa categoria" : ""}.</div>`}
        <div class="og-empty" id="inv-none" hidden>Nessun oggetto trovato.</div>
      </div>
      <p class="footnote">Nessun limite di oggetti: conta solo il peso. Trascina una riga su uno slot illuminato, oppure premila per equipaggiarla.</p>`;
    return ogWin("Inventario", body, "inv-a-bag");
  }

  function deltaBadge(v, kind) {
    if (!v || Date.now() > flashUntil) return "";
    return `<span class="inv-delta ${v > 0 ? "up" : "down"}">${esc(signed(v, kind))}</span>`;
  }
  function effectPanel(c, fin) {
    const t = R().totals(c);
    const statRows = (c.stats || []).map((row) => {
      const fromItems = Number(row.oggetti) || 0;
      const dv = flash.stats[row.code] || 0;
      const fl = dv && Date.now() <= flashUntil ? (dv > 0 ? "inv-flash-up" : "inv-flash-down") : "";
      return `<div class="inv-row ${fl}" tabindex="0" data-tip="stat" data-key="${esc(row.code)}">
        <span class="inv-rl">${esc(row.code)} <span class="muted">${esc(row.name)}</span></span>
        <span class="inv-rv">${fromItems ? `<span class="inv-from" title="da oggetti">${esc(signed(fromItems))} ogg.</span>` : ""}${deltaBadge(dv)}<b class="num">${esc(nf(t[row.code]))}</b></span>
      </div>`;
    }).join("");
    const derRows = MAIN_DER.map((key) => {
      const def = derDef(key);
      if (!def) return "";
      const dv = flash.der[key] || 0;
      const fl = dv && Date.now() <= flashUntil ? (dv > 0 ? "inv-flash-up" : "inv-flash-down") : "";
      return `<div class="inv-row ${fl}" tabindex="0" data-tip="der" data-key="${key}">
        <span class="inv-rl">${esc(SHORT_DER[key] || def.label)}</span>
        <span class="inv-rv">${deltaBadge(dv, def.fmt)}<b class="num">${esc(R().fmt(fin[key], def.fmt))}</b></span>
      </div>`;
    }).join("");
    /* Somma dei bonus degli oggetti equipaggiati */
    const sum = { stats: {}, bonus: {} };
    for (const it of R().equippedItems(c)) {
      for (const [k, v] of Object.entries(it.stats || {})) sum.stats[k] = (sum.stats[k] || 0) + Number(v || 0);
      for (const [k, v] of Object.entries(it.bonus || {})) sum.bonus[k] = (sum.bonus[k] || 0) + Number(v || 0);
    }
    let chips = bonusLines(sum).map((l) => `<span class="chip">${esc(l)}</span>`).join("");
    const ohw = R().offHandWeapon(c);
    if (ohw) {
      const oh = R().offHandPct(c);
      chips += `<span class="chip inv-chip-wrap ${oh.talent ? "good" : "warn"}" title="${esc(`Doppia impugnatura libera per tutti: il danno della mano secondaria lo decide il talento. Senza talento: ${R().OFFHAND_BASE_PCT}% (proposta).`)}">${esc(`${ohw.name} in mano secondaria: ${nf(oh.pct)}% danno`)}</span>`;
    }
    const bonusBox = `<div class="inv-group">Bonus attivi degli oggetti</div>
      <div class="inv-bonus">${chips || `<span class="muted small">Nessun bonus attivo.</span>`}</div>`;
    const body = `<div class="inv-group">Statistiche</div><div class="inv-rows">${statRows}</div>
      <div class="inv-group">Combattimento</div><div class="inv-rows">${derRows}</div>
      ${hasDemo(c) ? bonusBox : ""}
      <p class="footnote">Valori finali come nella Scheda. Passa sopra una riga per la formula.</p>`;
    return ogWin("Effetto sulla scheda", body, "inv-a-effect");
  }

  /* ---------- Tooltip ---------- */
  function tipEl() {
    let el = document.getElementById("inv-tip");
    if (!el) {
      el = document.createElement("div");
      el.id = "inv-tip";
      el.setAttribute("role", "tooltip");
      document.body.appendChild(el);
    }
    return el;
  }
  function hideTip() { const el = document.getElementById("inv-tip"); if (el) { el.classList.remove("on"); el.innerHTML = ""; } }
  function placeTip(el, anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const w = el.offsetWidth, h = el.offsetHeight, m = 8;
    let left = r.right + m;
    if (left + w > vw - m) left = r.left - w - m;          // a sinistra se non c'è spazio a destra
    let top = r.top;
    if (left < m) {                                        // schermi stretti: sopra o sotto l'elemento
      left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), vw - w - m);
      top = r.bottom + m;
      if (top + h > vh - m) top = r.top - h - m;
    }
    top = Math.min(Math.max(m, top), Math.max(m, vh - h - m));
    left = Math.min(Math.max(m, left), Math.max(m, vw - w - m));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function line(text, cls) { return `<span class="${cls || ""}">${esc(text)}</span>`; }
  function itemTip(c, it, ctx) {
    const rk = R().rarityKey(it.rarity);
    const t = R().equipType(it);
    const P = [];
    P.push(`<div class="og-h">${ornament()}<div class="og-iname-big" data-rarity="${rk}">[${esc(it.name)}]</div></div>`);
    P.push(kv("Rarità", `<span data-rarity="${rk}">${esc(it.rarity)}</span>`));
    const pair = [];
    if (it.durability && it.durability.max) {
      const low = it.durability.cur / it.durability.max < 0.25;
      pair.push(kv("Durabilità", `<span class="num">${esc(it.durability.cur)}/${esc(it.durability.max)}</span>`, low ? "bad" : ""));
    }
    if (it.weaponBase) pair.push(kv("Danno base", `<span class="num">${esc(nf(it.weaponBase))}</span>`));
    const b = it.bonus || {};
    if (b.difesa) pair.push(kv("Difesa", `<span class="num">${esc(nf(b.difesa))}</span>`));
    if (b.difesaMagica) pair.push(kv("Difesa magica", `<span class="num">${esc(nf(b.difesaMagica))}</span>`));
    if (pair.length) P.push(`<div class="og-pair">${pair.join("")}</div>`);
    P.push(kv("Tipo", esc([it.type || "Oggetto", t ? t.label : ""].filter(Boolean).join(" · "))));
    const opts = bonusLines({ stats: it.stats, bonus: Object.fromEntries(Object.entries(b).filter(([k]) => k !== "difesa" && k !== "difesaMagica")) });
    if (t === R().EQUIP_TYPES.unaMano && it.weaponBase) {
      const oh = R().offHandPct(c);
      opts.push(`In mano secondaria: ${nf(oh.pct)}% del danno (${oh.talent ? `talento ${oh.talent}` : "senza talento di doppia impugnatura"})`);
    }
    if (opts.length) P.push(`<div class="og-lines">${opts.map((l) => `<span class="og-opt">· ${esc(l)}</span>`).join("")}</div>`);
    else if (it.stats_text && !t) P.push(`<span class="og-opt">· ${esc(it.stats_text)}</span>`);
    const req = it.req || {};
    if (Object.keys(req).length) {
      const unmet = new Set(R().unmetRequirements(c, it));
      const parts = Object.entries(req).map(([k, v]) => {
        const label = k === "level" ? `Livello ${v}` : `${k} ${v}`;
        return `<span class="${unmet.has(label) ? "og-bad" : ""}">${esc(label)}</span>`;
      });
      P.push(kv("Restrizioni d'uso", parts.join(", ")));
    } else if (t) P.push(kv("Restrizioni d'uso", "Nessuna"));
    P.push(kv("Peso", `<span class="num">${esc(nf(it.weight))} kg${it.qty > 1 ? ` × ${esc(it.qty)} = ${esc(nf(it.qty * it.weight))} kg` : ""}</span>`));
    if (it.desc) P.push(`<div class="og-flavor">${esc(it.desc)}</div>`);

    if (ctx === "bag" && t) {
      const cmp = compare(c, it);
      P.push(`<div class="og-sep">Confronto</div>`);
      if (cmp && cmp.res && !cmp.res.ok && cmp.res.reason === "req") {
        P.push(`<span class="og-bad">Non indossabile: ${esc(cmp.res.unmet.join(", "))}</span>`);
      } else if (cmp && cmp.res && cmp.res.ok) {
        const repl = cmp.res.removed.map((x) => x.name);
        P.push(`<span class="muted">${esc(repl.length ? `Sostituisce: ${repl.join(", ")}` : "Slot libero: nessuna sostituzione")}</span>`);
        const diffs = [];
        for (const row of c.stats || []) {
          const dv = (cmp.after.stats[row.code] || 0) - (cmp.before.stats[row.code] || 0);
          if (Math.abs(dv) > 1e-9) diffs.push({ label: row.code, dv, kind: null });
        }
        const keys = [...MAIN_DER, ...R().DERIVED.map((d) => d.key).filter((k) => !MAIN_DER.includes(k))];
        for (const k of keys) {
          const dv = cmp.after.der[k] - cmp.before.der[k];
          if (Math.abs(dv) > 1e-9) diffs.push({ label: SHORT_DER[k] || derDef(k).label, dv, kind: derDef(k).fmt });
        }
        if (!diffs.length) P.push(`<span class="muted">Nessuna differenza sulle statistiche.</span>`);
        for (const d of diffs.slice(0, 12)) {
          P.push(`<span class="inv-tl"><span>${esc(d.label)}</span><span class="num ${d.dv > 0 ? "good" : "bad"}">${esc(signed(d.dv, d.kind))}</span></span>`);
        }
        if (diffs.length > 12) P.push(`<span class="muted">… e altre ${diffs.length - 12} differenze</span>`);
      }
    }
    let hint = "";
    if (ctx === "bag") hint = t ? "Clic: equipaggia · Trascina sugli slot illuminati" : "Non equipaggiabile";
    else if (ctx === "slot") hint = "Clic: rimetti nell'inventario · Trascina per spostare";
    else if (ctx === "ghost") hint = "Mano secondaria bloccata dall'arma a due mani. Clic: togli l'arma";
    if (hint) P.push(`<span class="inv-tsep"></span><span class="inv-hint">${esc(hint)}</span>`);
    return P.join("");
  }
  function slotTip(c, key) {
    const s = R().SLOTS.find((x) => x.key === key);
    if (!s) return "";
    const fits = ((c && c.inventory) || []).filter((it) => it.id && !equippedIds(c).has(it.id) && compatibleSlots(it).some((x) => x.key === key));
    const types = Object.values(R().EQUIP_TYPES).filter((t) => t.slots.includes(key)).map((t) => t.label);
    return `<span class="inv-tn">${esc(s.label)}</span>${line("Slot vuoto", "muted")}${line(`Accetta: ${types.join(", ")}`, "gold")}
      ${hasDemo(c) ? (fits.length ? line(`Nella borsa: ${fits.map((x) => x.name).join(", ")}`, "good") : line("Nessun oggetto compatibile nella borsa", "muted")) : ""}`;
  }
  function statTip(c, code) {
    const row = (c.stats || []).find((r) => r.code === code);
    if (!row) return "";
    const lines = R().SOURCES.filter((s) => Number(row[s.key])).map((s) =>
      `<span class="inv-tl"><span>${esc(s.label)}</span><span class="num ${s.key === "oggetti" ? "good" : ""}">${esc(nf(row[s.key]))}</span></span>`).join("");
    const from = R().equippedItems(c).filter((it) => it.stats && it.stats[code]).map((it) =>
      `<span class="inv-tl"><span data-rarity="${R().rarityKey(it.rarity)}">${esc(it.name)}</span><span class="num good">${esc(signed(it.stats[code]))}</span></span>`).join("");
    return `<span class="inv-tn">${esc(row.name)} (${esc(code)})</span>${lines}
      <span class="inv-tl gold"><span>Totale</span><b class="num">${esc(nf(R().statTotal(row)))}</b></span>
      ${from ? `<span class="inv-tsep"></span><span class="label">Da oggetti</span>${from}` : ""}`;
  }
  function derTip(c, key) {
    const def = derDef(key);
    if (!def) return "";
    const base = R().derived(c)[key];
    const bonus = Number((c.itemBonus || {})[key]) || 0;
    const fin = finalDerived(c)[key];
    return `<span class="inv-tn">${esc(def.label)}</span>
      <span class="label">Formula</span><span class="mono">${esc(R().formulaText(def, c))}</span>
      <span class="mono muted">= ${esc(R().explain(def, c))} = ${esc(R().fmt(base, def.fmt))}</span>
      ${bonus ? `<span>Bonus oggetti: <b class="num good">${esc(signed(bonus, def.fmt))}</b> → <b class="num gold">${esc(R().fmt(fin, def.fmt))}</b></span>` : ""}
      ${def.cap != null ? line(`Tetto massimo ${def.cap}%`, "muted") : ""}
      ${def.note ? line(def.note(c), "") : ""}
      ${line(`Fonte: ${def.src}`, "muted")}`;
  }
  function weightTip(c) {
    const def = derDef("carico");
    const w = carried(c), cap = finalDerived(c).carico;
    return `<span class="inv-tn">Peso trasportato</span>
      ${line("Somma di quantità × peso di tutto l'inventario (equipaggiato compreso).", "")}
      <span class="inv-tl"><span>Totale</span><b class="num">${esc(nf(w))} kg</b></span>
      <span class="inv-tl"><span>Carico massimo</span><b class="num">${esc(nf(cap))} kg</b></span>
      <span class="mono muted">${esc(R().formulaText(def, c))} = ${esc(R().explain(def, c))}</span>
      ${w > cap ? line("Sovraccarico!", "bad") : ""}`;
  }
  function showTip(c, anchor) {
    const kind = anchor.dataset.tip;
    let html = "";
    if (kind === "item") { const it = itemById(c, anchor.dataset.item); if (it) html = itemTip(c, it, anchor.dataset.ctx); }
    else if (kind === "slot") html = slotTip(c, anchor.dataset.slot);
    else if (kind === "stat") html = statTip(c, anchor.dataset.key);
    else if (kind === "der") html = derTip(c, anchor.dataset.key);
    else if (kind === "weight") html = weightTip(c);
    if (!html) { hideTip(); return; }
    const el = tipEl();
    el.innerHTML = html;
    el.classList.add("on");
    const it = kind === "item" ? itemById(c, anchor.dataset.item) : null;
    el.style.borderColor = it ? `var(--r-${R().rarityKey(it.rarity)})` : "";
    placeTip(el, anchor);
  }

  /* Il tooltip vive nel body: nascondilo quando si cambia schermata o si scorre */
  let globalsBound = false;
  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    window.addEventListener("hashchange", hideTip);
    window.addEventListener("scroll", hideTip, { passive: true, capture: true });
    window.addEventListener("resize", hideTip);
  }

  /* ---------- Azioni ---------- */
  function afterChange(state, c, before) {
    const after = snapshot(c);
    flash = { stats: {}, der: {} };
    let changed = false;
    for (const k of Object.keys(after.stats)) {
      const dv = after.stats[k] - (before.stats[k] || 0);
      if (Math.abs(dv) > 1e-9) { flash.stats[k] = dv; changed = true; }
    }
    for (const k of MAIN_DER) {
      const dv = after.der[k] - before.der[k];
      if (Math.abs(dv) > 1e-9) { flash.der[k] = dv; changed = true; }
    }
    flashUntil = changed ? Date.now() + 3500 : 0;
    clearTimeout(flashTimer);
    if (changed) {
      flashTimer = setTimeout(() => {
        flash = { stats: {}, der: {} };
        document.querySelectorAll(".inv-delta").forEach((x) => x.remove());
        document.querySelectorAll(".inv-flash-up, .inv-flash-down").forEach((x) => x.classList.remove("inv-flash-up", "inv-flash-down"));
      }, 3600);
    }
    // Le risorse correnti non possono superare i nuovi massimi
    if (c.resources) {
      for (const k of ["hp", "mp", "sp"]) {
        if (c.resources[k] != null && c.resources[k] > after.der[k]) c.resources[k] = Math.round(after.der[k]);
      }
    }
  }
  function doEquip(state, c, it, slotKey) {
    if (!it.slot) { S.ui.toast("SISTEMA", [`${it.name}: oggetto non equipaggiabile.`]); return null; }
    const before = snapshot(c);
    const res = equipItem(c, it, slotKey);
    if (!res.ok) {
      if (res.reason === "req") S.ui.toast("SISTEMA", [`Impossibile equipaggiare ${it.name}.`, `Requisiti non soddisfatti: ${res.unmet.join(", ")}.`]);
      else S.ui.toast("SISTEMA", [`${it.name}: nessuno slot compatibile.`]);
      return null;
    }
    afterChange(state, c, before);
    const slot = R().SLOTS.find((s) => s.key === res.slot);
    const lines = [`Equipaggiato: ${it.name} (${R().isTwoHanded(it) ? "Due mani" : slot ? slot.label : res.slot}).`];
    if (res.removed.length) lines.push(`Torna nella borsa: ${res.removed.map((x) => x.name).join(", ")}.`);
    S.ui.toast("SISTEMA", lines);
    return res.slot;
  }
  function doUnequip(state, c, slotKey) {
    const before = snapshot(c);
    const it = unequipSlot(c, slotKey);
    if (!it) return null;
    afterChange(state, c, before);
    S.ui.toast("SISTEMA", [`${it.name} torna nella borsa.`]);
    return it;
  }

  function doMove(state, c, fromKey, toKey) {
    const before = snapshot(c);
    const res = moveSlot(c, fromKey, toKey);
    if (!res.ok) return null;
    afterChange(state, c, before);
    const lbl = (k) => (R().SLOTS.find((s) => s.key === k) || {}).label || k;
    const lines = [`${res.it.name} → ${lbl(toKey)}.`];
    if (res.other) lines.push(`${res.other.name} → ${lbl(fromKey)}.`);
    if (res.removed.length) lines.push(`Torna nella borsa: ${res.removed.map((x) => x.name).join(", ")}.`);
    S.ui.toast("SISTEMA", lines);
    return toKey;
  }

  /* ---------- Drag & drop con pointer events (mouse, penna e touch) ----------
     Mouse: si trascina dopo 6px di movimento. Touch: si tiene premuto ~0,25 s, poi si trascina
     (così il dito che scorre la pagina non sposta oggetti per sbaglio). */
  const DRAG_PX = 6, HOLD_MS = 250;
  let dnd = null;          // gesto in corso
  let suppressClick = 0;   // timestamp: ignora il clic che segue un rilascio
  function dndTargets() {
    const { wrap, c, from, id, slot } = dnd;
    const it = itemById(c, id);
    const ok = new Set(compatibleSlots(it).map((s) => s.key));
    if (from === "slot") ok.delete(slot);
    if (from === "slot" && R().isTwoHanded(it)) ok.clear();
    wrap.querySelectorAll(".inv-slot").forEach((el) => {
      if (from === "slot" && el.dataset.slot === slot) return;
      el.classList.add(ok.has(el.dataset.slot) ? "inv-drop-ok" : "inv-dim");
    });
    if (from === "slot") { const bag = wrap.querySelector("#inv-bag"); if (bag) bag.classList.add("inv-drop-ok"); }
    return ok;
  }
  function dndStart(x, y) {
    hideTip();
    drag = { id: dnd.id };
    dnd.started = true;
    dnd.ok = dndTargets();
    const face = dnd.src.querySelector(".inv-ico");
    const g = (face || dnd.src).cloneNode(true);
    if (face) g.dataset.rarity = dnd.src.dataset.rarity;
    g.removeAttribute("id");
    g.classList.add("inv-drag-ghost");
    g.setAttribute("aria-hidden", "true");
    const r = (face || dnd.src).getBoundingClientRect();
    g.style.width = r.width + "px";
    g.style.height = r.height + "px";
    document.body.appendChild(g);
    dnd.ghost = g;
    dnd.src.classList.add("inv-dragging");
    document.body.classList.add("inv-grabbing");
    dndMove(x, y);
    dnd.raf = setInterval(dndAutoScroll, 16);
  }
  function dndTargetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !dnd.wrap.contains(el)) return null;
    const sl = el.closest(".inv-slot");
    if (sl && dnd.ok.has(sl.dataset.slot)) return sl;
    if (dnd.from === "slot" && el.closest("#inv-bag")) return dnd.wrap.querySelector("#inv-bag");
    return null;
  }
  /* Scorrimento automatico vicino ai bordi della finestra (serve su mobile: borsa e manichino non stanno insieme) */
  function dndAutoScroll() {
    if (!dnd || !dnd.started) return;
    const edge = 70, y = dnd.ly;
    let dy = 0;
    if (y < edge) dy = -Math.ceil((edge - y) / 5);
    else if (y > innerHeight - edge) dy = Math.ceil((y - (innerHeight - edge)) / 5);
    if (dy) { window.scrollBy(0, dy); dndMove(dnd.lx, dnd.ly); }
  }
  function dndMove(x, y) {
    dnd.ghost.style.left = x + "px";
    dnd.ghost.style.top = y + "px";
    const t = dndTargetAt(x, y);
    if (t !== dnd.hover) {
      if (dnd.hover) dnd.hover.classList.remove("inv-drop-hover");
      if (t) t.classList.add("inv-drop-hover");
      dnd.hover = t;
    }
  }
  function dndEnd(x, y, cancelled) {
    const d = dnd;
    if (!d) return;
    const t = d.started && !cancelled ? dndTargetAt(x, y) : null;
    dnd = null;
    drag = null;
    clearTimeout(d.timer);
    clearInterval(d.raf);
    document.body.classList.remove("inv-grabbing");
    if (!d.started) return;
    suppressClick = Date.now();
    if (d.ghost) d.ghost.remove();
    d.src.classList.remove("inv-dragging");
    d.wrap.querySelectorAll(".inv-drop-ok, .inv-drop-hover, .inv-dim").forEach((x) => x.classList.remove("inv-drop-ok", "inv-drop-hover", "inv-dim"));
    if (!t) return;
    const { c, state, rerender } = d;
    if (t.id === "inv-bag") {
      const it = doUnequip(state, c, d.slot === "manoSecondaria" && R().isTwoHanded(itemById(c, d.id)) ? "manoPrincipale" : d.slot);
      if (it) rerender(`[data-bag="${CSS.escape(it.id)}"]`);
      return;
    }
    const key = t.dataset.slot;
    if (d.from === "bag") {
      const it = itemById(c, d.id);
      const slot = it && doEquip(state, c, it, key);
      if (slot) rerender(`[data-slot="${slot}"]`);
    } else {
      const slot = doMove(state, c, d.slot, key);
      if (slot) rerender(`[data-slot="${slot}"]`);
    }
  }
  let dndBound = false;
  function bindDnd() {
    if (dndBound) return;
    dndBound = true;
    document.addEventListener("pointermove", (e) => {
      if (!dnd || e.pointerId !== dnd.pointerId) return;
      dnd.lx = e.clientX;
      dnd.ly = e.clientY;
      if (dnd.started) { e.preventDefault(); dndMove(e.clientX, e.clientY); return; }
      if (Math.hypot(e.clientX - dnd.x0, e.clientY - dnd.y0) > DRAG_PX) {
        if (dnd.touch) { dndEnd(0, 0, true); return; } // il dito sta scorrendo la pagina
        dndStart(e.clientX, e.clientY);
      }
    });
    document.addEventListener("pointerup", (e) => { if (dnd && e.pointerId === dnd.pointerId) dndEnd(e.clientX, e.clientY, false); });
    document.addEventListener("pointercancel", (e) => { if (dnd && e.pointerId === dnd.pointerId) dndEnd(0, 0, true); });
    /* Durante il trascinamento su touch blocca lo scorrimento della pagina */
    document.addEventListener("touchmove", (e) => { if (dnd && dnd.started) e.preventDefault(); }, { passive: false });
    document.addEventListener("keydown", (e) => { if (dnd && e.key === "Escape") dndEnd(0, 0, true); });
    window.addEventListener("blur", () => { if (dnd) dndEnd(0, 0, true); });
  }

  /* ---------- Render ----------
     opts.embedded: dentro il tab Inventario della Scheda (niente intestazione né pannello effetti);
     opts.onChange(focusSel): chi ospita ridisegna tutto (la Scheda aggiorna stats e derivate). */
  function render(root, state, opts) {
    opts = opts || {};
    injectStyle();
    bindGlobals();
    bindDnd();
    hideTip();
    const c = state.char;
    if (c.id !== lastCharId) { lastCharId = c.id; filter = "tutti"; flash = { stats: {}, der: {} }; flashUntil = 0; }
    const demo = hasDemo(c);
    if (demo) R().applyEquipment(c);
    const fin = finalDerived(c);

    const wrap = document.createElement("div");
    wrap.className = "inv-root";
    const head = opts.embedded ? "" : `
      <div class="inv-head">
        <h1 class="inv-name">${esc(c.name)}</h1>
        <span class="inv-sub">${esc(c.classe || "—")} · Livello <span class="num">${esc(c.level)}</span></span>
        <a class="btn ghost inv-link" href="#scheda">Apri scheda →</a>
      </div>`;
    wrap.innerHTML = `${head}
      ${demo ? "" : `<div class="sysmsg"><span class="tag">[SISTEMA]</span><span>Personaggio in forma riassuntiva: nessun oggetto con tipo e slot registrato.</span><span>Prova con Kelvin o con un personaggio nuovo dalla creazione guidata.</span></div>`}
      <div class="inv-layout ${opts.embedded ? "inv-emb" : ""}">
        ${dollPanel(c, demo)}
        ${demo ? bagPanel(c, fin) : ""}
        ${opts.embedded ? "" : effectPanel(c, fin)}
      </div>`;
    root.innerHTML = "";
    root.appendChild(wrap);

    wrap.addEventListener("mouseover", (e) => { if (drag) return; const a = e.target.closest("[data-tip]"); if (a && wrap.contains(a)) showTip(c, a); });
    wrap.addEventListener("mouseout", (e) => { const a = e.target.closest("[data-tip]"); if (a && !a.contains(e.relatedTarget)) hideTip(); });
    wrap.addEventListener("focusin", (e) => { const a = e.target.closest("[data-tip]"); if (a) showTip(c, a); });
    wrap.addEventListener("focusout", hideTip);
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });
    if (!demo) return;

    const rerender = (focusSel, fallbackSel) => {
      if (opts.onChange) { opts.onChange(focusSel || fallbackSel); return; }
      render(root, state, opts);
      const el = (focusSel && root.querySelector(focusSel)) || (fallbackSel && root.querySelector(fallbackSel));
      if (el) el.focus({ preventScroll: true });
    };

    /* Clic / tastiera (i bottoni ricevono Invio e Spazio come clic) */
    wrap.addEventListener("click", (e) => {
      if (Date.now() - suppressClick < 400) { e.preventDefault(); e.stopPropagation(); return; }
      const f = e.target.closest("[data-filter]");
      if (f) { filter = f.dataset.filter; rerender(`[data-filter="${filter}"]`); return; }
      const bag = e.target.closest("[data-bag]");
      if (bag) {
        const it = itemById(c, bag.dataset.bag);
        if (!it) return;
        const slot = doEquip(state, c, it);
        if (slot) rerender(`[data-slot="${slot}"]`);
        return;
      }
      const sl = e.target.closest("[data-slot]");
      if (sl && sl.dataset.item) {
        const key = sl.dataset.ghost ? "manoPrincipale" : sl.dataset.slot;
        const it = doUnequip(state, c, key);
        if (it) rerender(`[data-bag="${CSS.escape(it.id)}"]`, `[data-slot="${key}"]`);
      }
    });
    wrap.addEventListener("input", (e) => {
      if (e.target.id !== "inv-q") return;
      const q = e.target.value.trim().toLowerCase();
      let shown = 0;
      wrap.querySelectorAll(".og-item").forEach((row) => { const ok = !q || row.dataset.name.includes(q); row.hidden = !ok; if (ok) shown++; });
      wrap.querySelectorAll(".og-group").forEach((g) => {
        let n = g.nextElementSibling, any = false;
        while (n && n.classList.contains("og-item")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
        g.hidden = !any;
      });
      const none = wrap.querySelector("#inv-none");
      if (none) none.hidden = shown > 0 || !wrap.querySelector(".og-item");
    });
    wrap.addEventListener("change", (e) => {
      if (e.target.id === "inv-sort") { sort = e.target.value; rerender("#inv-sort"); }
    });
    wrap.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-drag]")) e.preventDefault(); });
    wrap.addEventListener("dragstart", (e) => e.preventDefault()); // niente drag nativo del browser

    wrap.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || dnd) return;
      const src = e.target.closest("[data-drag]");
      if (!src || !wrap.contains(src)) return;
      const touch = e.pointerType !== "mouse";
      dnd = { wrap, c, state, rerender, src, id: src.dataset.item, from: src.dataset.bag ? "bag" : "slot", slot: src.dataset.slot,
        pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, touch, started: false };
      if (touch) {
        const mine = dnd;
        dnd.timer = setTimeout(() => { if (dnd === mine && !mine.started) dndStart(mine.lx, mine.ly); }, HOLD_MS);
      }
    });
  }

  S.screens.inventario = { title: "Inventario", render };
  S.inv = { mount: (el, state, opts) => render(el, state, Object.assign({ embedded: true }, opts)), hasDemo };
})();
