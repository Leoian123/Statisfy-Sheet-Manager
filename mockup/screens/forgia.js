/* Forgia del Master: elenco dei wizard di creazione e libreria dei contenuti creati.

   CONTRATTO PER I WIZARD (screens/wizards-*.js):
     S.wizards.push({
       id: "incantesimo",            // univoco, ASCII
       kind: "spells",               // chiave in S.data.library dove finisce il risultato
       group: "Magia",               // "Personaggi" | "Mondo" | "Magia"
       title: "Incantesimo",         // nome breve sulla card
       desc: "Una riga su cosa crea",
       render(root, ctx) { ... }     // root: <div> nuovo e vuoto, tutto del wizard (può riscriverne innerHTML;
                                     //       colleghi gli eventi UNA volta su root, con delegation)
     });
   ctx = {
     state,                          // lo stato globale del mockup (state.char, state.data, ...)
     save(entry),                    // salva in S.data.library[kind], mostra un toast e torna alla Forgia
     close(),                        // annulla e torna alla Forgia
   }
   entry: oggetto libero ma con almeno { name, summary } (summary = una riga per la libreria).
   Helper UI condivisi: S.wz.steps(labels, current, reachable) e le classi CSS .wz-* qui sotto. */
(function () {
  const S = (window.STATISFY = window.STATISFY || { screens: {} });
  S.screens = S.screens || {};
  S.wizards = S.wizards || [];
  S.data = S.data || {};
  S.data.library = S.data.library || { skills: [], classes: [], races: [], titles: [], npcs: [], encounters: [], spells: [], miracles: [] };

  const GROUPS = [
    { key: "Personaggi", text: "Ciò che i giocatori possono diventare e ottenere." },
    { key: "Mondo", text: "Chi e cosa incontrano ad Aethermoor." },
    { key: "Magia", text: "Incantesimi dei maghi e miracoli dei chierici." },
  ];
  const KIND_LABEL = { skills: "Skill", classes: "Classi", races: "Razze", titles: "Titoli", npcs: "PNG", encounters: "Incontri", spells: "Incantesimi", miracles: "Miracoli" };

  /* ---------- Helper condivisi per i wizard ---------- */
  S.wz = {
    /* Barra degli step: labels = ["Base", "Effetto", ...]; current = indice; reachable = indice massimo cliccabile.
       I bottoni hanno data-wz-step="i": il wizard gestisce il click. */
    steps(labels, current, reachable) {
      return `<ol class="wz-steps">${labels.map((l, i) => `
        <li><button type="button" class="wz-step ${i === current ? "is-current" : ""} ${i < current ? "is-done" : ""}"
          data-wz-step="${i}" ${i > reachable ? "disabled" : ""} ${i === current ? 'aria-current="step"' : ""}>
          <span class="wz-n">${i < current ? "✓" : i + 1}</span><span>${S.ui.esc(l)}</span></button></li>`).join("")}</ol>`;
    },
  };

  function injectStyle() {
    if (document.getElementById("fg-style")) return;
    const st = document.createElement("style");
    st.id = "fg-style";
    st.textContent = `
      .fg-groups { display: flex; flex-direction: column; gap: 20px; }
      .fg-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
      .fg-card { text-align: left; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius);
        padding: 14px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .fg-card:hover, .fg-card:focus-visible { border-color: var(--gold); box-shadow: 0 0 18px var(--gold-soft); outline: none; }
      .fg-card h3 { font-size: var(--fs-md); }
      .fg-card .fg-count { margin-top: auto; }
      .fg-back { align-self: flex-start; }
      .fg-lib-empty { padding: 18px 8px; text-align: center; }
      .fg-dlg { border: 1px solid var(--gold); border-radius: var(--radius); background: var(--panel); color: var(--fg);
        padding: 20px; width: min(520px, calc(100vw - 32px)); box-shadow: 0 0 32px var(--gold-soft); }
      .fg-close-btn { padding: 4px 10px; font-size: var(--fs-sm); white-space: nowrap; }
      .fg-dlg::backdrop { background: rgba(0, 0, 0, 0.6); }
      .fg-dlg-t { font-size: var(--fs-lg); }
      .fg-dlg-modes { border: 0; padding: 0; margin: 0; display: grid; gap: 8px; }
      .fg-dlg-opt { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border: 1px solid var(--line);
        border-radius: var(--radius); background: var(--panel-2); cursor: pointer; }
      .fg-dlg-opt:has(input:checked) { border-color: var(--gold); }
      /* Wizard condivisi */
      .wz-steps { list-style: none; margin: 0; padding: 0; display: flex; gap: 6px; flex-wrap: wrap; }
      .wz-step { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border-radius: 999px;
        border: 1px solid var(--line); background: var(--panel-2); color: var(--muted); cursor: pointer;
        font-family: var(--font-display); font-weight: 600; font-size: var(--fs-sm); }
      .wz-step:disabled { cursor: not-allowed; opacity: 0.5; }
      .wz-step.is-current { border-color: var(--gold); color: var(--fg); }
      .wz-step.is-done { color: var(--fg); }
      .wz-n { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
        background: var(--line); color: var(--fg); font-family: var(--font-mono); font-size: var(--fs-xs); }
      .wz-step.is-current .wz-n { background: var(--gold); color: var(--on-accent); }
      .wz-step.is-done .wz-n { background: var(--good); color: var(--on-accent); }
      .wz-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 20px; align-items: start; }
      @media (max-width: 960px) { .wz-body { grid-template-columns: minmax(0, 1fr); } }
      .wz-foot { display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: 14px; }
      .wz-preview { position: sticky; top: 80px; }
      .wz-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      @media (max-width: 560px) { .wz-grid2 { grid-template-columns: minmax(0, 1fr); } }
    `;
    document.head.appendChild(st);
  }

  /* ---------- Stato locale ---------- */
  let active = null;      // id del wizard aperto
  let libKind = "all";

  function hub(state) {
    const esc = S.ui.esc;
    const lib = S.data.library;
    const groups = GROUPS.map((g) => {
      const ws = S.wizards.filter((w) => w.group === g.key);
      if (!ws.length) return "";
      return `<section class="stack">
        <div><h3>${esc(g.key)}</h3><p class="small muted">${esc(g.text)}</p></div>
        <div class="fg-cards">${ws.map((w) => `
          <button type="button" class="fg-card" data-open="${esc(w.id)}">
            <span class="label">${esc(KIND_LABEL[w.kind] || w.kind)}</span>
            <h3>${esc(w.title)}</h3>
            <span class="small muted">${esc(w.desc)}</span>
            <span class="fg-count xs muted">${(lib[w.kind] || []).length} nella libreria</span>
          </button>`).join("")}</div>
      </section>`;
    }).join("");

    const kinds = Object.keys(KIND_LABEL);
    const all = kinds.flatMap((k) => (lib[k] || []).map((e, i) => ({ ...e, _kind: k, _i: i })));
    const rows = all.filter((e) => libKind === "all" || e._kind === libKind);
    const tabs = `<div class="tabs" role="tablist" aria-label="Filtra libreria">
      <button type="button" role="tab" data-lib="all" aria-selected="${libKind === "all"}">Tutto<span class="count">${all.length}</span></button>
      ${kinds.map((k) => `<button type="button" role="tab" data-lib="${k}" aria-selected="${libKind === k}">${KIND_LABEL[k]}<span class="count">${(lib[k] || []).length}</span></button>`).join("")}
    </div>`;
    const table = rows.length
      ? `<div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>Tipo</th><th>Riepilogo</th><th aria-label="Azioni"></th></tr></thead><tbody>
          ${rows.map((e) => `<tr><td>${esc(e.name)}</td><td><span class="chip violet">${esc(KIND_LABEL[e._kind])}</span></td><td class="small">${esc(e.summary || "")}</td>
            <td>${e._kind === "encounters" ? (e.closed
              ? `<span class="chip good" title="${esc(e.closed.text)}">Chiuso · EXP ${e.closed.mode === "divisa" ? "divisa" : "intera"}</span>`
              : `<button type="button" class="btn fg-close-btn" data-close-enc="${e._i}">Chiudi incontro</button>`) : ""}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<p class="fg-lib-empty small muted">Ancora niente qui. Apri un wizard qui sopra: ciò che crei compare in questa libreria.</p>`;

    return `
      ${S.ui.win("Forgia del Master", `<p class="muted">Wizard guidati per creare contenuti di gioco. Ogni wizard applica le regole di STATISFY e mostra un'anteprima nel formato del System prima di salvare.</p>
        <div class="fg-groups">${groups || '<p class="muted">Nessun wizard disponibile.</p>'}</div>`, { gold: true })}
      ${S.ui.win("Libreria della campagna", tabs + table)}
      <p class="footnote">Mockup: i contenuti creati restano solo in questa pagina.</p>`;
  }

  /* ---------- Chiusura di un incontro: pop-up con la divisione dell'EXP (deciso 20/11/2026) ----------
     L'EXP di ogni PG è già calcolata sul suo livello (Progressione, Sezione 2, × rarità). "Intera": ognuno prende la sua.
     "Divisa": ognuno prende la sua diviso il numero di PG che partecipano. */
  function expShare(enc, mode) {
    const pcs = (enc.party || []).map((id) => S.data.characters.find((c) => c.id === id)).filter(Boolean);
    const n = Math.max(1, pcs.length);
    return pcs.map((c) => {
      const full = (enc.expByPc && enc.expByPc[c.id]) ?? (S.wmr ? S.wmr.expFor(c.level, enc.creatures || []).pct : 0);
      return { c, full, pct: mode === "divisa" ? full / n : full };
    });
  }
  function giveExp(c, pct) {
    let exp = (Number(c.expPct) || 0) + pct;
    let ups = 0;
    while (exp >= 100) { exp -= 100; ups++; }
    c.expPct = Math.round(exp * 100) / 100;
    c.level += ups;
    return ups;
  }
  function closeEncounterDialog(enc, done) {
    const esc = S.ui.esc;
    const nf = (x) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
    const dlg = document.createElement("dialog");
    dlg.className = "fg-dlg";
    dlg.setAttribute("aria-labelledby", "fg-dlg-t");
    let mode = "intera";
    const n = (enc.party || []).length;
    const body = () => {
      const rows = expShare(enc, mode);
      return `
      <form method="dialog" class="stack">
        <h2 id="fg-dlg-t" class="fg-dlg-t">Chiudi «${esc(enc.name)}»</h2>
        <p class="small muted">${esc(enc.place || "")} · difficoltà ${esc((enc.difficulty || {}).label || "—")}</p>
        <fieldset class="fg-dlg-modes">
          <legend class="label">Come si assegna l'EXP</legend>
          <label class="fg-dlg-opt"><input type="radio" name="mode" value="intera" ${mode === "intera" ? "checked" : ""}>
            <span><b>Intera</b><br><span class="xs muted">Ogni PG prende tutta l'EXP dell'incontro.</span></span></label>
          <label class="fg-dlg-opt"><input type="radio" name="mode" value="divisa" ${mode === "divisa" ? "checked" : ""}>
            <span><b>Divisa nel gruppo</b><br><span class="xs muted">Ognuno prende la sua parte: EXP ÷ ${n} PG.</span></span></label>
        </fieldset>
        <div class="table-wrap"><table class="t"><thead><tr><th>PG</th><th class="num">EXP</th><th>Dopo</th></tr></thead><tbody>
          ${rows.map((r) => {
            const lv = r.c.level, e = (Number(r.c.expPct) || 0) + r.pct;
            const ups = Math.floor(e / 100);
            return `<tr><td>${esc(r.c.name)} <span class="xs muted">Lv ${lv}</span></td>
              <td class="num" title="${esc(mode === "divisa" ? `${nf(r.full)}% ÷ ${n} PG` : `${nf(r.full)}% sul livello ${lv}`)}">+${nf(r.pct)}%</td>
              <td class="small">${ups ? `<span class="chip gold">Level up! Lv ${lv + ups}</span> ${nf(e - ups * 100)}%` : `${nf(e)}%`}</td></tr>`;
          }).join("")}
        </tbody></table></div>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn ghost" value="cancel">Annulla</button>
          <button type="submit" class="btn primary" value="ok">Chiudi e assegna EXP</button>
        </div>
      </form>`;
    };
    dlg.innerHTML = body();
    document.body.appendChild(dlg);
    dlg.addEventListener("change", (e) => {
      if (e.target.name !== "mode") return;
      mode = e.target.value;
      dlg.innerHTML = body();
      const r = dlg.querySelector(`input[value="${mode}"]`);
      if (r) r.focus();
    });
    /* Gestione esplicita di invio ed Escape: non dipende dall'evento "close" (asincrono) */
    let finished = false;
    const finish = (ok) => {
      if (finished) return;
      finished = true;
      if (ok) {
        const lines = [];
        for (const r of expShare(enc, mode)) {
          const ups = giveExp(r.c, r.pct);
          lines.push(`${r.c.name}: +${nf(r.pct)}% EXP${ups ? ` · LEVEL UP → Lv ${r.c.level}` : ""}`);
        }
        enc.closed = { mode, text: lines.join("\n") };
        S.ui.toast("SISTEMA", [`Incontro «${enc.name}» chiuso, EXP ${mode === "divisa" ? "divisa nel gruppo" : "intera a ogni PG"}.`, ...lines], true);
      }
      if (dlg.open) dlg.close();
      dlg.remove();
      done(ok);
    };
    dlg.addEventListener("submit", (e) => { e.preventDefault(); finish(!!e.submitter && e.submitter.value === "ok"); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    dlg.addEventListener("close", () => finish(false));
    dlg.showModal();
  }

  function render(root, state) {
    injectStyle();
    const wrap = document.createElement("div");
    wrap.className = "stack";
    wrap.style.gap = "20px";
    root.innerHTML = "";
    root.appendChild(wrap);

    const w = active && S.wizards.find((x) => x.id === active);
    if (w) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn ghost fg-back";
      back.textContent = "← Torna alla Forgia";
      back.addEventListener("click", () => { active = null; render(root, state); });
      const host = document.createElement("div");
      host.className = "stack";
      wrap.append(back, host);
      const ctx = {
        state,
        save(entry) {
          (S.data.library[w.kind] = S.data.library[w.kind] || []).push(entry);
          if (w.kind === "npcs" && Array.isArray(S.data.npcs) && entry.npc) S.data.npcs.push(entry.npc);
          S.ui.toast("FORGIA", [`${KIND_LABEL[w.kind] || w.kind}: «${entry.name}» aggiunto alla libreria.`], true);
          active = null;
          libKind = w.kind;
          render(root, state);
        },
        close() { active = null; render(root, state); },
      };
      try { w.render(host, ctx); }
      catch (err) { console.error(err); host.innerHTML = S.ui.win("Errore nel wizard", `<p class="muted">${S.ui.esc(err.message)}</p>`); }
      return;
    }

    wrap.innerHTML = hub(state);
    wrap.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) { active = open.dataset.open; render(root, state); window.scrollTo({ top: 0 }); return; }
      const lib = e.target.closest("[data-lib]");
      if (lib) { libKind = lib.dataset.lib; render(root, state); return; }
      const ce = e.target.closest("[data-close-enc]");
      if (ce) {
        const enc = S.data.library.encounters[Number(ce.dataset.closeEnc)];
        if (enc) closeEncounterDialog(enc, (ok) => { if (ok) render(root, state); else ce.focus(); });
      }
    });
  }

  S.screens.forgia = { title: "Forgia del Master", render };
})();
