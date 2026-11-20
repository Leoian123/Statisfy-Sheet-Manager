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
        grid-template-columns: min-content min-content minmax(250px, 1fr); grid-template-areas: "doll bag effect"; align-items: start; }
      .inv-a-doll { grid-area: doll; } .inv-a-bag { grid-area: bag; } .inv-a-effect { grid-area: effect; }
      @media (max-width: 1300px) {
        .inv-layout { grid-template-columns: min-content minmax(0, 1fr); grid-template-areas: "doll effect" "bag bag"; }
      }
      @media (max-width: 760px) {
        .inv-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: "doll" "effect" "bag"; }
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
    if (!it.slot) return "";
    if (it.twoHanded) return "Due mani";
    const s = R().SLOTS.find((x) => (x.accepts || x.key) === it.slot);
    return s ? s.label : it.slot;
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

  /* ---------- Logica di equipaggiamento (pura sul PG passato: usata anche sui cloni per il confronto) ---------- */
  function compatibleSlots(it) {
    if (!it || !it.slot) return [];
    if (it.twoHanded) return R().SLOTS.filter((s) => s.key === "manoPrincipale");
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
    if (it.twoHanded) {
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
        if (main && main.twoHanded) clearSlot(c, "manoPrincipale", removed);
      }
      clearSlot(c, target, removed);
      eq[target] = it.id;
    }
    removed.delete(it.id);
    R().applyEquipment(c);
    return { ok: true, slot: target, removed: [...removed].map((id) => itemById(c, id)).filter(Boolean) };
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
    const ghost = slot.key === "manoSecondaria" && it.twoHanded;
    if (ghost) {
      return `<button type="button" class="inv-cell inv-slot inv-ghost" data-slot="${slot.key}" data-ghost="1" data-item="${esc(it.id)}" data-tip="item" data-ctx="ghost"
        data-rarity="${R().rarityKey(it.rarity)}" aria-label="${esc(slot.label)}: bloccato da ${esc(it.name)} (due mani). Premi per togliere l'arma">
        <span class="inv-sig" aria-hidden="true">${esc(initials(it.name))}</span><span class="inv-lock" aria-hidden="true">2M</span></button>`;
    }
    return `<button type="button" class="inv-cell inv-slot" draggable="true" data-slot="${slot.key}" data-item="${esc(it.id)}" data-tip="item" data-ctx="slot"
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
      ${interactive ? `<p class="footnote">Clic o Invio su uno slot: rimetti l'oggetto nella borsa. Trascina dalla borsa a uno slot evidenziato per equipaggiare.</p>` : ""}`;
    return S.ui.win("Equipaggiamento", body, { cls: "inv-a-doll" });
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

  function bagPanel(c, fin) {
    const list = bagItems(c);
    const size = Math.max(30, Math.ceil(list.length / 6) * 6);
    const cells = [];
    for (let i = 0; i < size; i++) {
      const it = list[i];
      if (!it) { cells.push(`<div class="inv-cell inv-empty" aria-hidden="true"></div>`); continue; }
      const canEquip = !!it.slot;
      cells.push(`<button type="button" class="inv-cell" ${canEquip ? 'draggable="true"' : ""} data-bag="${esc(it.id)}" data-item="${esc(it.id)}" data-tip="item" data-ctx="bag"
        data-rarity="${R().rarityKey(it.rarity)}" aria-label="${esc(it.name)}${it.qty > 1 ? `, quantità ${it.qty}` : ""}${canEquip ? ". Premi per equipaggiare" : ". Non equipaggiabile"}">
        ${itemFace(it)}${it.qty > 1 ? `<span class="inv-qty">${esc(it.qty)}</span>` : ""}</button>`);
    }
    const m = coins(c);
    const w = carried(c), cap = fin.carico;
    const pct = cap > 0 ? Math.min(100, (w / cap) * 100) : 0;
    const wcls = w > cap ? "over" : pct >= 75 ? "heavy" : "";
    const filters = FILTERS.map((f) => `<button type="button" class="btn ghost" data-filter="${f.key}" aria-pressed="${f.key === filter}">${esc(f.label)}</button>`).join("");
    const body = `
      <div class="inv-money" aria-label="Monete">
        <span class="label">Monete</span>
        <span class="inv-coin gold" title="Corone d'Oro"><i aria-hidden="true"></i>${esc(Number(m.corone || 0).toLocaleString("it-IT"))} <span class="muted small">Corone</span></span>
        <span class="inv-coin silver" title="Scellini"><i aria-hidden="true"></i>${esc(Number(m.scellini || 0).toLocaleString("it-IT"))} <span class="muted small">Scellini</span></span>
      </div>
      <div class="inv-weight ${wcls}" data-tip="weight" tabindex="0">
        <div class="bar-top"><span class="label">Peso trasportato</span><span class="num">${esc(nf(w))} / ${esc(nf(cap))} kg</span></div>
        <div class="bar-track" role="progressbar" aria-label="Peso trasportato" aria-valuemin="0" aria-valuemax="${Math.round(cap)}" aria-valuenow="${Math.round(w)}"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      </div>
      <div class="inv-filters">
        <div class="inv-filters" role="group" aria-label="Filtra oggetti">${filters}</div>
        <label class="inv-sort small"><span class="label">Ordina</span>
          <select class="input" id="inv-sort">${SORTS.map((s) => `<option value="${s.key}" ${s.key === sort ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>
        </label>
      </div>
      <div class="inv-bag" id="inv-bag" aria-label="Borsa">${cells.join("")}</div>
      <p class="footnote">${list.length} oggett${list.length === 1 ? "o" : "i"} nella borsa${filter !== "tutti" ? " (filtrati)" : ""}. Clic o Invio per equipaggiare; trascina nella borsa uno slot per togliere l'oggetto.</p>`;
    return S.ui.win("Borsa", body, { cls: "inv-a-bag" });
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
    const chips = bonusLines(sum).map((l) => `<span class="chip">${esc(l)}</span>`).join("");
    const bonusBox = `<div class="inv-group">Bonus attivi degli oggetti</div>
      <div class="inv-bonus">${chips || `<span class="muted small">Nessun bonus attivo.</span>`}</div>`;
    const body = `<div class="inv-group">Statistiche</div><div class="inv-rows">${statRows}</div>
      <div class="inv-group">Combattimento</div><div class="inv-rows">${derRows}</div>
      ${hasDemo(c) ? bonusBox : ""}
      <p class="footnote">Valori finali come nella Scheda. Passa sopra una riga per la formula.</p>`;
    return S.ui.win("Effetto sulla scheda", body, { cls: "inv-a-effect" });
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
    const parts = [];
    parts.push(`<span class="inv-tn" data-rarity="${R().rarityKey(it.rarity)}">${esc(it.name)}</span>`);
    parts.push(`<span class="muted"><span data-rarity="${R().rarityKey(it.rarity)}">${esc(it.rarity)}</span> · ${esc(it.type || "Oggetto")}${it.slot ? ` · ${esc(slotLabelForItem(it))}` : ""}</span>`);
    if (it.weaponBase) parts.push(`<span class="inv-tl"><span>Base danno</span><b class="num">${esc(nf(it.weaponBase))}</b></span>`);
    const bl = bonusLines(it);
    if (bl.length) parts.push(bl.map((l) => line(l, "good")).join(""));
    else if (it.stats_text) parts.push(line(it.stats_text, "good"));
    const req = it.req || {};
    if (Object.keys(req).length) {
      const unmet = new Set(R().unmetRequirements(c, it));
      for (const [k, v] of Object.entries(req)) {
        const label = k === "level" ? `Livello ${v}` : `${k} ${v}`;
        parts.push(line(`Richiede ${label}`, unmet.has(label) ? "bad" : "muted"));
      }
    }
    if (it.durability && it.durability.max) {
      const pct = (it.durability.cur / it.durability.max) * 100;
      parts.push(`<span class="inv-tl"><span>Durabilità</span><span class="num ${pct < 25 ? "bad" : ""}">${esc(it.durability.cur)} / ${esc(it.durability.max)}</span></span>`);
    }
    parts.push(`<span class="muted num">Peso ${esc(nf(it.weight))} kg${it.qty > 1 ? ` · Quantità ${esc(it.qty)} (${esc(nf(it.qty * it.weight))} kg)` : ""}</span>`);
    if (it.desc) parts.push(`<span class="inv-desc">“${esc(it.desc)}”</span>`);

    if (ctx === "bag" && it.slot) {
      const cmp = compare(c, it);
      parts.push(`<span class="inv-tsep"></span><span class="label">Confronto con l'equipaggiato</span>`);
      if (cmp && cmp.res && !cmp.res.ok && cmp.res.reason === "req") {
        parts.push(line(`Non indossabile: ${cmp.res.unmet.join(", ")}`, "bad"));
      } else if (cmp && cmp.res && cmp.res.ok) {
        const repl = cmp.res.removed.map((x) => x.name);
        parts.push(line(repl.length ? `Sostituisce: ${repl.join(", ")}` : "Slot libero: nessuna sostituzione", "muted"));
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
        if (!diffs.length) parts.push(line("Nessuna differenza sulle statistiche.", "muted"));
        for (const d of diffs.slice(0, 14)) {
          parts.push(`<span class="inv-tl"><span>${esc(d.label)}</span><span class="num ${d.dv > 0 ? "good" : "bad"}">${esc(signed(d.dv, d.kind))}</span></span>`);
        }
        if (diffs.length > 14) parts.push(line(`… e altre ${diffs.length - 14} differenze`, "muted"));
      }
    }
    let hint = "";
    if (ctx === "bag") hint = it.slot ? "Clic / Invio: equipaggia" : "Non equipaggiabile";
    else if (ctx === "slot") hint = "Clic / Invio: rimetti nella borsa";
    else if (ctx === "ghost") hint = "Mano secondaria bloccata dall'arma a due mani. Clic: togli l'arma";
    if (hint) parts.push(`<span class="inv-tsep"></span>${line(hint, "inv-hint")}`);
    return parts.join("");
  }
  function slotTip(c, key) {
    const s = R().SLOTS.find((x) => x.key === key);
    if (!s) return "";
    const fits = ((c && c.inventory) || []).filter((it) => it.id && !equippedIds(c).has(it.id) && compatibleSlots(it).some((x) => x.key === key));
    return `<span class="inv-tn">${esc(s.label)}</span>${line("Slot vuoto", "muted")}
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
    const lines = [`Equipaggiato: ${it.name} (${it.twoHanded ? "Due mani" : slot ? slot.label : res.slot}).`];
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

  /* ---------- Render ---------- */
  function render(root, state) {
    injectStyle();
    bindGlobals();
    hideTip();
    const c = state.char;
    if (c.id !== lastCharId) { lastCharId = c.id; filter = "tutti"; flash = { stats: {}, der: {} }; flashUntil = 0; }
    const demo = hasDemo(c);
    if (demo) R().applyEquipment(c);
    const fin = finalDerived(c);

    const wrap = document.createElement("div");
    wrap.className = "inv-root";
    wrap.innerHTML = `
      <div class="inv-head">
        <h1 class="inv-name">${esc(c.name)}</h1>
        <span class="inv-sub">${esc(c.classe || "—")} · Livello <span class="num">${esc(c.level)}</span></span>
        <a class="btn ghost inv-link" href="#scheda">Apri scheda →</a>
      </div>
      ${demo ? "" : `<div class="sysmsg"><span class="tag">[SISTEMA]</span><span>Inventario di esempio disponibile solo per Kelvin.</span><span>Questo personaggio è in forma riassuntiva: nessun oggetto registrato.</span></div>`}
      <div class="inv-layout">
        ${dollPanel(c, demo)}
        ${demo ? bagPanel(c, fin) : ""}
        ${effectPanel(c, fin)}
      </div>`;
    root.innerHTML = "";
    root.appendChild(wrap);
    if (!demo) {
      wrap.addEventListener("mouseover", (e) => { const a = e.target.closest("[data-tip]"); if (a && wrap.contains(a)) showTip(c, a); });
      wrap.addEventListener("mouseout", (e) => { const a = e.target.closest("[data-tip]"); if (a && !a.contains(e.relatedTarget)) hideTip(); });
      wrap.addEventListener("focusin", (e) => { const a = e.target.closest("[data-tip]"); if (a) showTip(c, a); });
      wrap.addEventListener("focusout", hideTip);
      return;
    }

    const rerender = (focusSel, fallbackSel) => {
      render(root, state);
      const el = (focusSel && root.querySelector(focusSel)) || (fallbackSel && root.querySelector(fallbackSel));
      if (el) el.focus({ preventScroll: true });
    };

    /* Clic / tastiera (i bottoni ricevono Invio e Spazio come clic) */
    wrap.addEventListener("click", (e) => {
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
    wrap.addEventListener("change", (e) => {
      if (e.target.id === "inv-sort") { sort = e.target.value; rerender("#inv-sort"); }
    });

    /* Tooltip su hover e focus */
    wrap.addEventListener("mouseover", (e) => {
      if (drag) return;
      const a = e.target.closest("[data-tip]");
      if (a && wrap.contains(a)) showTip(c, a);
    });
    wrap.addEventListener("mouseout", (e) => {
      const a = e.target.closest("[data-tip]");
      if (a && !a.contains(e.relatedTarget)) hideTip();
    });
    wrap.addEventListener("focusin", (e) => { const a = e.target.closest("[data-tip]"); if (a) showTip(c, a); });
    wrap.addEventListener("focusout", hideTip);
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

    /* Drag & drop: borsa → slot compatibile, slot → borsa */
    const clearDrop = () => {
      wrap.querySelectorAll(".inv-drop-ok, .inv-drop-hover, .inv-dim").forEach((x) => x.classList.remove("inv-drop-ok", "inv-drop-hover", "inv-dim"));
    };
    const canDropOnSlot = (key) => {
      if (!drag || drag.from !== "bag") return false;
      const it = itemById(c, drag.id);
      return !!it && compatibleSlots(it).some((s) => s.key === key);
    };
    wrap.addEventListener("dragstart", (e) => {
      const src = e.target.closest("[draggable='true']");
      if (!src) return;
      hideTip();
      if (src.dataset.bag) {
        const it = itemById(c, src.dataset.bag);
        if (!it || !it.slot) { e.preventDefault(); return; }
        drag = { id: it.id, from: "bag" };
        const ok = new Set(compatibleSlots(it).map((s) => s.key));
        wrap.querySelectorAll(".inv-slot").forEach((s) => s.classList.add(ok.has(s.dataset.slot) ? "inv-drop-ok" : "inv-dim"));
      } else if (src.dataset.slot) {
        drag = { id: src.dataset.item, from: "slot", slot: src.dataset.slot };
        const bagEl = wrap.querySelector("#inv-bag");
        if (bagEl) bagEl.classList.add("inv-drop-ok");
      }
      try { e.dataTransfer.setData("text/plain", drag.id); e.dataTransfer.effectAllowed = "move"; } catch (err) { /* alcuni browser */ }
    });
    wrap.addEventListener("dragend", () => { drag = null; clearDrop(); });
    wrap.addEventListener("dragover", (e) => {
      if (!drag) return;
      const sl = e.target.closest(".inv-slot");
      if (sl && canDropOnSlot(sl.dataset.slot)) { e.preventDefault(); sl.classList.add("inv-drop-hover"); return; }
      if (drag.from === "slot" && e.target.closest("#inv-bag")) { e.preventDefault(); wrap.querySelector("#inv-bag").classList.add("inv-drop-hover"); }
    });
    wrap.addEventListener("dragleave", (e) => {
      const t = e.target.closest(".inv-slot, #inv-bag");
      if (t && !t.contains(e.relatedTarget)) t.classList.remove("inv-drop-hover");
    });
    wrap.addEventListener("drop", (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      const sl = e.target.closest(".inv-slot");
      if (sl && d.from === "bag") {
        const key = sl.dataset.slot;
        const it = itemById(c, d.id);
        if (it && compatibleSlots(it).some((s) => s.key === key)) {
          e.preventDefault();
          const slot = doEquip(state, c, it, key);
          if (slot) rerender(`[data-slot="${slot}"]`); else clearDrop();
          return;
        }
      }
      if (d.from === "slot" && e.target.closest("#inv-bag")) {
        e.preventDefault();
        const it = doUnequip(state, c, d.slot);
        if (it) rerender(`[data-bag="${CSS.escape(it.id)}"]`);
        return;
      }
      clearDrop();
    });
  }

  S.screens.inventario = { title: "Inventario", render };
})();
