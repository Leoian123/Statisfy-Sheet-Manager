/* Forgia · gruppo "Magia": Incantesimo e Miracolo (porting di mockup/screens/wizards-magia.js).
   Che cosa fa l'abilità lo dice la meccanica (passo obbligatorio subito dopo il concetto: danno, cura, status… con le
   loro formule). Gli altri passi danno ciò che la meccanica non copre: sfere, livello ed efficacia, costo Mana,
   ricarica, backlash (incantesimo); Fede, favore, voti (miracolo). Tutti i numeri li calcola il server: decisioni 6–22
   di docs/PROPOSTE.md; costo e ricarica entrano nella meccanica salvata. */
import type { Draft } from "../api/forge";
import { MechStep, PvMech } from "./MechStep";
import { CheckF, DASH, Decided, NameOr, Picks, PvRow, PvWin, Ref, SelF, TextF, ni, nf, readNum, useW, type WCtx, type WizardDef } from "./engine";

const D = {
  costo: "Costo Mana = 10 × L × (L+1), con L = livello di lancio (livello 1 = 20, come il Dardo Magico; livello 10 = 1.100).",
  tempo: "Tempo di lancio ⌈L/3⌉ turni; combinazione +50%.",
  ricarica: "Ricarica ⌈L/2⌉ turni (minimo 1).",
  gravita: "Gravità del backlash = L × 2 + fattori, al posto del d20; +2 con Spatium o Tempus; +2 con una coppia Pericolosa, +1 se la peggiore è Debole.",
  severa: "Se due sfere si giudicano diversamente nella matrice vale il giudizio più severo.",
  traverso: "Uso traverso: +1 livello di lancio per ogni sfera usata fuori dal suo campo naturale.",
  metaSfera: "Metamagie di sfera: +2 livelli ciascuna.",
  gradoConsigliato: "Grado consigliato in ogni sfera ≥ livello di lancio, altrimenti il lancio conta come overcast (+2 al backlash).",
  sintonia: "Con più sfere la sintonia della zona si somma sfera per sfera, limite ±2.",
  efficacia: "Efficacia = livello base + linea di potere + sintonia. La metamagia aumenta costo e rischio, non la potenza. Le formule «Incantesimo» della meccanica la usano: 15–30 × efficacia × molt. magico.",
  miracoli: "I miracoli sono skill come gli incantesimi: entrano tra le skill attive del PG (Grado I · 1%) e salgono di Grado. Livelli 1–10.",
  fede: "Fede richiesta = 5 × L × (L+1).",
  costoMiracolo: "Costo = 12,5 × L × (L+1) Mana (livello 1 = 25, come Cura Minore).",
  favore: "Scala del favore: −3 Maledizione divina … 0 Neutrale … +4 Benedizione divina. Richiesto: livello 1–2 Notato, 3–5 Favorito, 6–8 Prescelto, 9–10 Benedizione; un grado in più fuori dal dominio del dio.",
  potenza: "Molt. favore: al favore richiesto ×1, +25% per ogni grado in più; un grado sotto ×0,5, due o più gradi sotto 0 (il miracolo non funziona).",
  profilo: "Profilo di ogni dio: nature affini, tono, voti e tabù.",
  abuso: "Conseguenze dell'abuso: −1 o −2 favore, oppure Maledizione divina.",
};
const roman = (x: WCtx, n: number) => (n > 0 ? x.meta.roman[Math.min(10, n)] : "—");
const toneCls = (t: string) => ({ good: "wz-ok", warn: "wz-warn", bad: "wz-bad" } as Record<string, string>)[t] ?? "";

/** Numero con valore suggerito dal server: vuoto (null) = usa il suggerito; "Ripristina" torna al suggerito. */
function SuggNum({ path, label, sugg, unit, why, hint, min = 0 }: { path: string; label: string; sugg: number | undefined; unit?: string; why: string; hint?: string; min?: number }) {
  const x = useW();
  const own = x.d[path];
  const v = own ?? sugg ?? "";
  const id = `wz-${x.id}-${path}`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label} <Decided why={why} /></label>
      <div className="wz-num">
        <input className="input" id={id} type="number" inputMode="numeric" min={min} step={1} value={String(v)}
          onChange={(e) => x.set(path, readNum(e.target.value))} />
        {unit && <span className="small muted">{unit}</span>}
        {own != null && <button type="button" className="btn ghost" onClick={() => x.set(path, null)}>Ripristina {sugg != null ? ni(sugg) : ""}</button>}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function LevelStepper({ label, why }: { label: string; why?: string }) {
  const x = useW();
  const lv = Number(x.d.level) || 1;
  const id = `wz-${x.id}-level`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label} {why && <Decided why={why} />}</label>
      <div className="wz-num">
        <button type="button" className="btn icon" aria-label="Livello −1" disabled={lv <= 1} onClick={() => x.set("level", Math.max(1, lv - 1))}>−</button>
        <input className="input" id={id} type="number" inputMode="numeric" min={1} max={10} step={1} value={String(x.d.level ?? "")} onChange={(e) => x.set("level", readNum(e.target.value))} />
        <button type="button" className="btn icon" aria-label="Livello +1" disabled={lv >= 10} onClick={() => x.set("level", Math.min(10, lv + 1))}>+</button>
      </div>
    </div>
  );
}

const charSel = (x: WCtx) => <SelF path="charId" label="PG" opts={x.meta.characters.map((c) => ({ v: String(c.id), l: `${c.name} · ${c.classe || "—"} · Lv ${c.level}` }))} />;

/* =====================================================================
   7. INCANTESIMO
   ===================================================================== */
function toggleSphere(x: WCtx, k: string) {
  x.upd((d) => {
    const at = (d.spheres as Draft[]).findIndex((s) => s.s === k);
    if (at >= 0) { d.spheres.splice(at, 1); d.meta = (d.meta as string[]).filter((m) => m !== `sph:${k}`); }
    else if (d.spheres.length < 3) d.spheres.push({ s: k, role: d.spheres.length ? "" : "forma", trav: false });
  });
}

const incantesimo: WizardDef = {
  id: "incantesimo", kind: "spells", group: "Magia", title: "Incantesimo",
  desc: "Il mago compone le sfere: livello, metamagia, costo Mana, backlash e grimorio.",
  heading: "Nuovo incantesimo",
  intro: "Il giocatore descrive l'effetto, il Master lo traduce in meccanica e ne valuta sfere, livello, costo e rischi (Magia_Creazione_Incantesimi.txt, Magic.txt).",
  fresh: (meta) => ({ name: "", effect: "", origin: "grimorio", spheres: [], combo: false, level: 1, meta: [],
    env: { zone: "", ley: 0, anti: false }, risk: { fatigue: false, emotion: false, interrupt: false, overcast: "auto", protections: 0 },
    cost: null, cd: null, mech: null, charId: meta.characters[0] ? String(meta.characters[0].id) : "", assign: true, force: false }),
  saveLabel: (x) => (x.d.assign && x.c.can_skill && x.c.char ? `Salva e aggiungi a ${x.c.char.name}` : "Salva nella libreria"),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome dell'incantesimo" req max={40} ph="Es. Palla di Fuoco"
        hint={x.c.name_taken ? <span className="wz-warn">Esiste già un incantesimo con questo nome nella libreria.</span> : "Da 2 a 40 caratteri."} />
      <TextF path="effect" label="Effetto dichiarato dal giocatore" req area rows={4} max={600} ph="Es. Una sfera di fuoco che esplode al contatto e incendia l'area."
        hint="È il giocatore a descrivere l'effetto; al passo successivo diventa una meccanica, poi il narratore ne valuta sfere, costo e rischi." />
      <Picks path="origin" label="Origine" cls="wz-cards" opts={x.meta.spell_origins.map((o) => ({ v: o.key, l: <b>{o.name}</b>, sub: o.text }))} />
    </> },
    { render: () => <MechStep kind={() => "incantesimo"} required /> },
    { render: (x) => {
      const sel = x.d.spheres as Draft[];
      const reqs = (x.c.reqs ?? []) as Draft[];
      const pairs = (x.c.pairs ?? []) as Draft[];
      return <>
        <p className="small muted">Scegli da 1 a 3 sfere: la prima è la principale. Più sfere danno più controllo, non per forza più potenza.</p>
        <div className="wz-spheres" role="group" aria-label="Sfere arcane">
          {x.meta.spheres.map((s) => {
            const on = sel.some((y) => y.s === s.key);
            return <button key={s.key} type="button" className="wz-sph" aria-pressed={on} disabled={!on && sel.length >= 3} title={s.field} onClick={() => toggleSphere(x, s.key)}>
              <b>{s.key}</b><span className="xs muted">{s.it}{s.pure ? " · pura" : ""}</span></button>;
          })}
        </div>
        {sel.length > 0 && <ol className="wz-sel">{sel.map((y, i) => {
          const sp = x.meta.spheres.find((s) => s.key === y.s);
          const r = reqs[i];
          return <li key={y.s} className="wz-selrow">
            <div className="wz-selh"><b>{i + 1}. {y.s}</b>{i === 0 && <span className="chip gold">principale</span>}
              {r && <span className={`chip ${r.status === "ok" ? "good" : r.status === "overcast" ? "warn" : "bad"}`}
                title={`Richiede Grado ${roman(x, r.need)}${x.d.combo ? " (combinazione)" : ""}; consigliato Grado ${roman(x, r.rec)}. Il PG ha ${r.has ? "Grado " + roman(x, r.has) : "nessun grado"}.`}>
                Grado {roman(x, r.need)}+ · PG {roman(x, r.has)}</span>}
              <span className="wz-tools">
                <button type="button" className="btn icon" aria-label={`Sposta ${y.s} in su`} disabled={i === 0}
                  onClick={() => x.upd((d) => { [d.spheres[i - 1], d.spheres[i]] = [d.spheres[i], d.spheres[i - 1]]; })}>↑</button>
                <button type="button" className="btn icon" aria-label={`Togli ${y.s}`} onClick={() => toggleSphere(x, y.s)}>×</button>
              </span></div>
            <div className="wz-grid2">
              <TextF path={`spheres.${i}.role`} label={`Ruolo di ${y.s}`} list="wz-roles" max={40} ph="forma, innesco…" />
              <CheckF path={`spheres.${i}.trav`} label="Uso traverso (+1 lv)" after={<Decided why={D.traverso} />} hint={`Effetto fuori dal campo naturale: ${sp?.field.toLowerCase()}.`} />
            </div>
          </li>;
        })}</ol>}
        <datalist id="wz-roles">{x.meta.spell_roles.map((r) => <option key={r} value={r} />)}</datalist>
        <div className="wz-box"><span className="label">Compatibilità (Magic.txt, Compatibility matrix)</span>
          {sel.length < 2
            ? <span className="small muted">{sel.length ? "Una sola sfera: nessuna coppia da valutare." : "Nessuna sfera scelta."} {sel.length && x.meta.compat_notes[sel[0].s] ? `${sel[0].s}: ${x.meta.compat_notes[sel[0].s]}.` : ""}</span>
            : <>
              <div className="wz-pairs">{pairs.map((p) => <span key={p.a + p.b} className={`chip ${p.tone}`} tabIndex={0} title={p.views.join(" · ") + (p.disagree ? " → vale la più severa" : "")}>{p.a} + {p.b}: {p.name}</span>)}
                {pairs.some((p) => p.disagree) && <Decided why={D.severa} />}</div>
              {pairs.some((p) => p.level === "D") && <div className="sysmsg bad" role="alert"><span className="tag">[AVVISO]</span>
                <span>Coppia pericolosa: {pairs.filter((p) => p.level === "D").map((p) => `${p.a} + ${p.b}`).join(", ")}. Il narratore può chiedere una prova di controllo; il backlash sale.</span></div>}
            </>}
        </div>
        <CheckF path="combo" label="Combinazione di incantesimi già consolidati (fusione, layering…)"
          hint={`Richiede Grado ${roman(x, x.meta.combo_grade)} in ogni sfera, Mana ×1,5, tempo di lancio +50% (Magic.txt).`} />
        <p className="xs muted">Requisiti verificati su {x.c.char?.name ?? "—"} (si cambia all'ultimo passo). Ogni sfera va posseduta: almeno Grado I.</p>
      </>;
    } },
    { render: (x) => {
      const L = x.c.levels as Draft | undefined;
      const keys = (x.d.spheres as Draft[]).map((s) => s.s as string);
      return <>
        <LevelStepper label="Livello base (1–10)" />
        <Picks path="meta" label="Metamagia (Magic.txt, Metamagic enhancement)" multi opts={x.meta.metamagic.map((m) => ({ v: m.key, l: <>{m.name} <span className="wz-lv">+{m.lv}</span></>, title: `${m.en}: ${m.text}` }))} />
        {keys.length > 0 && <Picks path="meta" label="Metamagia di sfera" multi after={<Decided why={D.metaSfera} />}
          opts={keys.map((k) => ({ v: `sph:${k}`, l: <>{x.meta.sphere_meta[k]?.name} <span className="xs muted">{k}</span> <span className="wz-lv">+{x.meta.sphere_meta_lv}</span></>, title: `${k}: ${x.meta.sphere_meta[k]?.text}` }))} />}
        <div className="wz-grid2">
          <SelF path="env.zone" label="Sintonia della zona" opts={x.meta.zones.map((z) => ({ v: z.key, l: `${z.name}${z.plus ? ` · ${z.plus} +2${z.minus ? `, ${z.minus} −2` : ""}` : ""}` }))} />
          <SelF path="env.ley" label="Linea di potere" num opts={x.meta.ley_lines.map((l) => ({ v: l.v, l: `${l.name}${l.surge ? ` · ${l.surge}% sbalzo selvaggio` : ""}` }))} />
        </div>
        <CheckF path="env.anti" label="Zona antimagia (+2 al backlash; un campo antimagia vero sopprime l'incantesimo)" />
        {L && <div className="wz-box">
          <div className="row wz-between"><span className="label">Livello di lancio</span><span className={`wz-big ${L.cast > 10 ? "wz-bad" : ""}`}>{L.cast || "—"}</span></div>
          <span className="wz-calc">= base <b>{L.base}</b> + metamagia <b>{L.meta}</b>{L.trav ? <> + traverso <b>{L.trav}</b></> : null}{L.cast > 10 ? " · massimo 10" : ""}</span>
          <div className="row wz-between"><span className="label">Livello di efficacia <Decided why={D.efficacia} /></span><span className="wz-big">{L.eff}</span></div>
          <span className="wz-calc">= base <b>{L.base}</b> + linea <b>{L.ley}</b> + sintonia <b>{L.zone >= 0 ? "+" : "−"}{Math.abs(L.zone)}</b>{L.zone_parts.length ? ` (${L.zone_parts.join(", ")})` : ""}</span>
          {L.zone_parts.length > 1 && <Decided why={D.sintonia} />}
          {x.c.ley_surge > 0 && <span className="small wz-warn">Sbalzo selvaggio: +{x.c.ley_surge}% di probabilità (Magic.txt, Ley line proximity)</span>}
        </div>}
      </>;
    } },
    { render: (x) => {
      const B = x.c.backlash as Draft | undefined;
      const L = x.c.levels as Draft | undefined;
      const mp = x.c.char?.mp;
      const cost = Number(x.d.cost ?? x.c.sugg?.cost);
      return <>
        <div className="wz-grid2">
          <SuggNum path="cost" label="Costo Mana" sugg={x.c.sugg?.cost} unit="MP" min={1} why={D.costo}
            hint={L ? `Suggerito: ${ni(x.c.sugg?.cost)} MP (10 × ${L.cast} × ${L.cast + 1}${x.d.combo ? " × 1,5 combinazione" : ""}).${mp && cost ? ` ${Math.round((cost / mp) * 100)}% del Mana massimo di ${x.c.char.name} (${ni(mp)}).` : ""}` : undefined} />
          <SuggNum path="cd" label="Ricarica" sugg={x.c.sugg?.cd} unit="turni" why={D.ricarica} hint={L ? `Suggerito: ${x.c.sugg?.cd} turni (⌈${L.cast} / 2⌉).` : undefined} />
        </div>
        <p className="xs muted">Il costo lo decide il narratore e si può contrattare: il valore suggerito è un punto di partenza.</p>
        <div className="wz-box"><span className="label">Tempo di lancio <Decided why={D.tempo} /></span>
          <span className="wz-big">{x.c.turns ?? "—"} {x.c.turns === 1 ? "turno" : "turni"}</span></div>
        <fieldset className="wz-fs"><legend className="label">Fattori di backlash (Magic.txt)</legend>
          <CheckF path="risk.fatigue" label="Fatica: molti incantesimi oggi (+1)" />
          <CheckF path="risk.emotion" label="Stato emotivo: stress, rabbia, paura (+1)" />
          <CheckF path="risk.interrupt" label="Valuta con lancio interrotto (+3)" />
          <div className="wz-grid2">
            <SelF path="risk.overcast" label="Overcast (+2)" after={<Decided why={D.gradoConsigliato} />} opts={[
              { v: "auto", l: `Automatico da ${x.c.char?.name ?? "PG"} (${x.c.overcast_auto ? "sì" : "no"})` }, { v: "si", l: "Sì" }, { v: "no", l: "No" }]} />
            <SelF path="risk.protections" label="Protezioni prese (−1 ciascuna)" num opts={[0, 1, 2, 3, 4, 5].map((n) => ({ v: n, l: String(n) }))} />
          </div>
        </fieldset>
        {B && <div className="wz-box">
          <div className="row wz-between"><span className="label">Fascia di backlash <Decided why={D.gravita} /></span><span className={`chip ${B.tone}`}>{B.band} · {B.score}</span></div>
          <ul className="wz-list">{(B.factors as Draft[]).map((f, i) => <li key={i}><span className="num">{f.v >= 0 ? "+" : "−"}{Math.abs(f.v)}</span> {f.label}</li>)}</ul>
          <span className="small">{B.text}</span>
          <span className="xs muted">Fasce: Minore ≤8 · Moderato 9–15 · Maggiore 16–20 · Grave 21–25 · Catastrofico 26+ (Magic.txt, Backlash table)</span>
        </div>}
      </>;
    } },
    { render: (x) => {
      const reqs = (x.c.reqs ?? []) as Draft[];
      const ch = x.c.char as Draft | null;
      const cost = Number(x.c.cost);
      return <>
        <SpellCard />
        {charSel(x)}
        <div className="wz-box"><span className="label">Requisiti su {ch?.name ?? "—"}</span>
          {ch ? <ul className="wz-reqs">
            {reqs.map((r) => <li key={r.s}><span>{r.s} <span className="xs muted">{r.has ? `Grado ${roman(x, r.has)}${r.pct != null ? ` · ${r.pct}${r.pct === "MAX" ? "" : "%"}` : ""}` : "non posseduta"}</span></span>
              <span className={r.status === "ok" ? "wz-ok" : r.status === "overcast" ? "wz-warn" : "wz-bad"}>{r.status === "ok" ? "✓" : r.status === "overcast" ? `overcast (consigliato ${roman(x, r.rec)})` : `serve Grado ${roman(x, r.need)}`}</span></li>)}
            <li><span>Mana massimo <span className="xs muted">{ni(ch.mp)} MP</span></span><span className={cost <= ch.mp ? "wz-ok" : "wz-warn"}>{cost <= ch.mp ? "✓" : "costo oltre il massimo"}</span></li>
            <li><span>Classe <span className="xs muted">{ch.classe || "—"}</span></span><span className={ch.mage ? "wz-ok" : "muted"}>{ch.mage ? "✓ Mago" : "basta possedere le sfere"}</span></li>
          </ul> : <span className="small muted">Nessun PG.</span>}
          <span className="xs muted">Grado della sfera = skill di tipo Knowledge con lo stesso nome.</span>
        </div>
        <CheckF path="assign" disabled={!x.c.can_skill} label={`Aggiungi al grimorio di ${ch?.name ?? "—"}`}
          hint={x.c.can_skill ? "Diventa una skill attiva di Grado I all'1%." : "Un incantesimo improvvisato non diventa una skill."} />
        {x.d.assign && x.c.can_skill && x.c.missing > 0 && <CheckF path="force" label="Forza l'assegnazione (decisione del Master)" hint="Le sfere mancanti restano da imparare: il PG non può ancora lanciarlo." />}
      </>;
    } },
  ],
  preview: (x) => {
    const { d, c } = x;
    const L = c.levels as Draft | undefined;
    const B = c.backlash as Draft | undefined;
    const pairs = (c.pairs ?? []) as Draft[];
    const w = c.worst as Draft | null | undefined;
    const reqs = (c.reqs ?? []) as Draft[];
    const miss = reqs.filter((r) => r.status === "missing").length;
    const over = reqs.filter((r) => r.status === "overcast").length;
    const ori = x.meta.spell_origins.find((o) => o.key === d.origin);
    return (
      <PvWin tag="INCANTESIMO" head={<NameOr s={d.name} ph="Incantesimo senza nome" />}>
        <PvMech />
        <PvRow label="Origine" tip={ori?.text}>{ori?.name ?? "—"}</PvRow>
        <PvRow label="Sfere" tip={(d.spheres as Draft[]).map((s, i) => `${i + 1}. ${s.s}: ${String(s.role).trim() || "ruolo da indicare"}${s.trav ? " · uso traverso (+1 lv)" : ""}`)}>
          {(d.spheres as Draft[]).map((s) => s.s).join(" + ") || DASH}</PvRow>
        <PvRow label="Compatibilità" tip={pairs.map((p) => `${p.a} + ${p.b}: ${p.name}${p.disagree ? " (vale la più severa)" : ""}`)}>
          {w ? <span className={toneCls(w.tone)}>{w.name}</span> : DASH}</PvRow>
        <PvRow label="Livello di lancio" tip={L ? [`Base ${L.base} + metamagia ${L.meta}${L.trav ? ` + traverso ${L.trav}` : ""}`, (c.meta_names ?? []).length ? `Metamagia: ${c.meta_names.join(", ")}` : ""] : undefined}>
          <span className={L && L.cast > 10 ? "wz-bad" : ""}>{L?.cast || "—"}</span></PvRow>
        <PvRow label="Efficacia" tip={L ? [`Base ${L.base} + linea di potere ${L.ley} + sintonia ${L.zone}`, d.env.anti ? "Zona antimagia attiva" : "", D.efficacia] : undefined}>{L?.eff ?? "—"}</PvRow>
        <PvRow label="Costo Mana" tip={L ? [`Suggerito: 10 × ${L.cast} × ${L.cast + 1}${d.combo ? " × 1,5" : ""} = ${ni(c.sugg?.cost)} MP`, d.cost != null ? "Valore modificato a mano (contrattato)" : ""] : undefined}>
          {c.cost != null ? `${ni(c.cost)} MP` : "—"}</PvRow>
        <PvRow label="Tempo di lancio" tip={D.tempo}>{c.turns ?? "—"} t</PvRow>
        <PvRow label="Ricarica" tip={c.sugg ? `Suggerito: ${c.sugg.cd}` : undefined}>{c.cd ?? "—"} t</PvRow>
        <PvRow label="Backlash" tip={B ? [...(B.factors as Draft[]).map((f) => `${f.v >= 0 ? "+" : "−"}${Math.abs(f.v)} ${f.label}`), B.text] : undefined}>
          {B ? <span className={toneCls(B.tone)}>{B.band} · {B.score}</span> : "—"}</PvRow>
        <PvRow label="Requisiti PG" tip={reqs.map((r) => `${r.s}: PG ${roman(x, r.has)} · richiesto ${roman(x, r.need)} · consigliato ${roman(x, r.rec)}`)}>
          <span className={miss ? "wz-bad" : over ? "wz-warn" : "wz-ok"}>{!c.char ? "—" : miss ? `${miss} sfer${miss === 1 ? "a" : "e"} mancant${miss === 1 ? "e" : "i"}` : over ? "overcast" : "ok"}</span></PvRow>
      </PvWin>
    );
  },
};

function SpellCard() {
  const { d, c, meta } = useW();
  const ori = meta.spell_origins.find((o) => o.key === d.origin)?.name ?? "—";
  const L = c.levels as Draft | undefined;
  return (
    <div className="sysmsg gold wz-sys anim-in" role="group" aria-label="Scheda dell'incantesimo">
      <span className="tag">[INCANTESIMO] {String(d.name).trim() || "Senza nome"}</span>
      <span><span className="muted">Livello</span> {L?.cast} (base {L?.base}{L?.meta ? ` + metamagia ${L.meta}` : ""}{L?.trav ? ` + traverso ${L.trav}` : ""}) · <span className="muted">efficacia</span> {L?.eff}</span>
      <span><span className="muted">Sfere</span> {(d.spheres as Draft[]).map((s) => `${s.s} (${String(s.role).trim() || "?"}${s.trav ? ", traverso" : ""})`).join(" + ") || "—"}</span>
      {(c.meta_names ?? []).length > 0 && <span><span className="muted">Metamagia</span> {c.meta_names.join(", ")}</span>}
      <span><span className="muted">Costo</span> {ni(c.cost)} MP · <span className="muted">Lancio</span> {c.turns} t · <span className="muted">Ricarica</span> {c.cd} t</span>
      <span><span className="muted">Rischio</span> backlash {c.backlash?.band} ({c.backlash?.score})</span>
      <span><span className="muted">Effetto</span> {String(d.effect).trim() || "—"}</span>
      {c.mech?.text && <span><span className="muted">Meccanica</span> {c.mech.text}</span>}
      <span><span className="muted">Origine</span> {ori}{d.combo ? " · combinazione" : ""}</span>
    </div>
  );
}

/* =====================================================================
   8. MIRACOLO
   ===================================================================== */
const miracolo: WizardDef = {
  id: "miracolo", kind: "miracles", group: "Magia", title: "Miracolo",
  desc: "Il chierico chiede al suo dio: Fede, favore divino, costo Mana, voti e tabù. Diventa una skill.",
  heading: "Nuovo miracolo",
  intro: "Il chierico non usa le sfere arcane: riceve il potere dal dio in cui crede. I domini sono due, Luce e Ombra; gli altri dèi ne sono derivati.",
  fresh: (meta) => ({ god: "", name: "", nature: "guarigione", effect: "", level: 1, fede: null, favor: null, cost: null, cd: null,
    vows: [], customVows: "", against: "indebolito", againstNote: "", mech: null,
    charId: String((meta.characters.find((c) => /chieric/i.test(c.classe)) ?? meta.characters[0])?.id ?? ""), assign: true, force: false }),
  saveLabel: (x) => (x.d.assign && x.c.char ? `Salva e assegna a ${x.c.char.name}` : "Salva nella libreria"),
  steps: [
    { render: (x) => <>
      {(["Luce", "Ombra"] as const).map((dom) => (
        <Picks key={dom} path="god" label={`Signori ${dom === "Luce" ? "della Luce" : "dell'Ombra"}`} cls="wz-cards"
          opts={x.meta.gods.filter((g) => g.domain === dom).map((g) => ({ v: g.key, l: <span className="row" style={{ gap: 6 }}><b>{g.name}</b>{g.origin && <span className="chip gold">originario</span>}</span>,
            sub: <>{g.epithet} · {g.sphere}<br /><span className="muted">Tono:</span> {g.tone}</> }))} />
      ))}
      <span className="xs muted">Profilo di ogni dio <Decided why={D.profilo} /></span>
    </> },
    { render: (x) => <>
      <TextF path="name" label="Nome del miracolo" req max={40} ph="Es. Luce che Risana"
        hint={x.c.name_taken ? <span className="wz-warn">Esiste già un miracolo con questo nome nella libreria.</span> : "Da 2 a 40 caratteri."} />
      <Picks path="nature" label="Natura" opts={x.meta.natures.map((n) => ({ v: n.key, l: n.name, title: n.text }))} />
      {x.d.god && <span className="small"><span className={`chip ${x.c.affine ? "good" : "warn"}`}>{x.c.affine ? "Affine" : "Fuori dominio"}</span>{" "}
        {x.c.affine ? `Rientra nel dominio del dio.` : "Il dio lo concede a fatica: favore richiesto +1 grado."}</span>}
      <TextF path="effect" label="Effetto" req area rows={4} max={600} ph="Es. Una luce calda chiude le ferite di un alleato a portata di voce." />
    </> },
    { render: () => <MechStep kind={() => "miracolo"} required /> },
    { render: (x) => {
      const P = x.c.power as Draft | undefined;
      return <>
        <LevelStepper label="Livello del miracolo (1–10)" why={D.miracoli} />
        <p className="xs muted">Il miracolo costa Mana come ogni magia; l'effetto è quello della meccanica, l'accesso dipende dalla Fede e dal favore del dio.</p>
        <div className="wz-grid2">
          <SuggNum path="fede" label="Fede richiesta" sugg={x.c.sugg?.fede} why={D.fede} hint={`Suggerito: ${ni(x.c.sugg?.fede)} (5 × ${x.c.level} × ${(x.c.level ?? 0) + 1}).`} />
          <div className="field">
            <label className="label" htmlFor="wz-miracolo-favor">Favore divino richiesto <Decided why={D.favore} /></label>
            <div className="wz-num">
              <select className="input" id="wz-miracolo-favor" value={String(x.d.favor ?? x.c.sugg?.favor ?? 1)}
                onChange={(e) => { const v = Number(e.target.value); x.set("favor", v === x.c.sugg?.favor ? null : v); }}>
                {x.meta.favor.map((f) => <option key={f.v} value={f.v}>{f.v > 0 ? "+" : ""}{f.v} · {f.name}</option>)}
              </select>
              {x.d.favor != null && <button type="button" className="btn ghost" onClick={() => x.set("favor", null)}>Ripristina {x.c.sugg_favor_name}</button>}
            </div>
            <span className="hint">Suggerito: {x.c.sugg_favor_name} (livello {x.c.level}{x.c.affine ? "" : ", +1 fuori dominio"}).</span>
          </div>
          <SuggNum path="cost" label="Costo Mana" sugg={x.c.sugg?.cost} unit="MP" min={1} why={D.costoMiracolo} hint={`Suggerito: ${ni(x.c.sugg?.cost)} MP. Cura Minore: 25 MP.`} />
          <SuggNum path="cd" label="Ricarica" sugg={x.c.sugg?.cd} unit="turni" why={D.ricarica} />
        </div>
        {P && <div className="wz-box">
          <div className="row wz-between"><span className="label">Favore di {x.c.char?.name ?? "—"} <Decided why={D.potenza} /></span>
            <span className={`wz-big ${P.fm.mult ? "" : "wz-bad"}`}>×{nf(P.fm.mult)}</span></div>
          <span className="small">Fede {ni(x.c.char_fede)} · favore {x.c.char_favor_name}{x.c.char_favor?.recorded ? "" : " (non registrato)"} su {x.c.favor_name} richiesto → {P.fm.state}</span>
        </div>}
      </>;
    } },
    { render: (x) => {
      const god = x.meta.gods.find((g) => g.key === x.d.god);
      return <>
        <Picks path="vows" label={`Condizioni, voti e tabù di ${god?.name ?? "—"}`} multi cls="wz-vows" after={<Decided why={D.profilo} />} opts={(god?.vows ?? []).map((v) => ({ v, l: v }))} />
        <TextF path="customVows" label="Altri voti o condizioni (uno per riga)" area rows={3} max={400} ph="Es. Solo alla luce del giorno" />
        <Picks path="against" label="Se usato contro la volontà del dio" cls="wz-cards" after={<Decided why={D.abuso} />}
          opts={x.meta.against.map((a) => ({ v: a.key, l: <b>{a.name}</b>, sub: a.text }))} />
        <TextF path="againstNote" label="Nota del Master (facoltativa)" max={200} ph="Es. Morteus manda un corvo a reclamare il debito" />
      </>;
    } },
    { render: (x) => {
      const ch = x.c.char as Draft | null;
      const issues = (x.c.issues ?? []) as string[];
      const fedeOk = Number(x.c.char_fede) >= Number(x.c.fede);
      const favOk = (x.c.char_favor?.v ?? 0) >= Number(x.c.favor);
      return <>
        <div className="sysmsg gold wz-sys anim-in" role="group" aria-label="Scheda del miracolo">
          <span className="tag">[MIRACOLO] {String(x.d.name).trim() || "Senza nome"}</span>
          <span><span className="muted">Dio</span> {x.meta.gods.find((g) => g.key === x.d.god)?.name ?? "—"} · <span className="muted">Natura</span> {x.meta.natures.find((n) => n.key === x.d.nature)?.name}{x.c.affine ? "" : " (fuori dominio)"}</span>
          <span><span className="muted">Livello</span> {x.c.level} · <span className="muted">Fede</span> {ni(x.c.fede)} · <span className="muted">Favore</span> {x.c.favor_name}</span>
          <span><span className="muted">Costo</span> {ni(x.c.cost)} MP · <span className="muted">Ricarica</span> {x.c.cd} t</span>
          <span><span className="muted">Voti</span> {(x.c.vows ?? []).join(" · ") || "—"}</span>
          {x.c.mech?.text && <span><span className="muted">Meccanica</span> {x.c.mech.text}</span>}
        </div>
        {charSel(x)}
        <div className="wz-box"><span className="label">Requisiti su {ch?.name ?? "—"}</span>
          {ch && <ul className="wz-reqs">
            <li><span>Classe <span className="xs muted">{ch.classe || "—"}</span></span><span className={ch.cleric ? "wz-ok" : "wz-warn"}>{ch.cleric ? "✓ Chierico" : "non è un chierico"}</span></li>
            <li><span>Fede <span className="xs muted">{ni(x.c.char_fede)}{x.c.char_fede ? "" : " (si sblocca quando il PG crede in un dio)"}</span></span><span className={fedeOk ? "wz-ok" : "wz-bad"}>{fedeOk ? "✓" : `serve ${ni(x.c.fede)}`}</span></li>
            <li><span>Favore <span className="xs muted">{x.c.char_favor_name}{x.c.char_favor?.recorded ? "" : " · non registrato"}</span></span><span className={favOk ? "wz-ok" : "wz-bad"}>{favOk ? "✓" : `serve ${x.c.favor_name}`}</span></li>
            <li><span>Mana massimo <span className="xs muted">{ni(ch.mp)} MP</span></span><span className={Number(x.c.cost) <= ch.mp ? "wz-ok" : "wz-warn"}>{Number(x.c.cost) <= ch.mp ? "✓" : "costo oltre il massimo"}</span></li>
          </ul>}
          <span className="xs muted">Favore = reputazione cosmica del PG verso il dio (Sistema Status Sociale, Livello 5).</span>
        </div>
        <CheckF path="assign" label={`Assegna a ${ch?.name ?? "—"}`} hint="Diventa una skill attiva di Grado I all'1%." />
        {x.d.assign && issues.length > 0 && <>
          <div className="sysmsg bad" role="alert"><span className="tag">[AVVISO]</span>{issues.map((t) => <span key={t}>{t}.</span>)}</div>
          <CheckF path="force" label="Forza l'assegnazione (decisione del Master)" />
        </>}
        <Ref>Il miracolo entra comunque nella libreria della campagna.</Ref>
      </>;
    } },
  ],
  preview: (x) => {
    const { d, c } = x;
    const god = x.meta.gods.find((g) => g.key === d.god);
    const nat = x.meta.natures.find((n) => n.key === d.nature);
    const ag = x.meta.against.find((a) => a.key === d.against);
    const P = c.power as Draft | undefined;
    const issues = (c.issues ?? []) as string[];
    return (
      <PvWin tag="MIRACOLO" head={<NameOr s={d.name} ph="Miracolo senza nome" />}>
        <PvMech />
        <PvRow label="Divinità" tip={god ? [god.epithet, god.sphere, `Tono: ${god.tone}`] : undefined}>{god?.name ?? DASH}</PvRow>
        <PvRow label="Dominio" tip={god ? `Opposto: ${god.domain === "Luce" ? "Ombra" : "Luce"}` : undefined}>{god?.domain ?? DASH}</PvRow>
        <PvRow label="Natura" tip={nat?.text}><span className={god && !c.affine ? "wz-warn" : ""}>{nat ? `${nat.name}${god && !c.affine ? " · fuori dominio" : ""}` : "—"}</span></PvRow>
        <PvRow label="Livello" tip={D.miracoli}>{c.level || "—"}</PvRow>
        <PvRow label="Fede richiesta" tip={c.sugg ? [`Suggerito: 5 × ${c.level} × ${c.level + 1} = ${ni(c.sugg.fede)}`, d.fede != null ? "Valore modificato a mano" : ""] : undefined}>{c.fede != null ? ni(c.fede) : "—"}</PvRow>
        <PvRow label="Favore richiesto" tip={c.sugg ? [`Suggerito: ${c.sugg_favor_name}`, d.favor != null ? "Valore modificato a mano" : ""] : undefined}>{c.favor_name ?? "—"}</PvRow>
        <PvRow label="Costo Mana" tip={c.sugg ? [`Suggerito: 12,5 × ${c.level} × ${c.level + 1} = ${ni(c.sugg.cost)} MP`, "Cura Minore: 25 MP a livello 1"] : undefined}>{c.cost != null ? `${ni(c.cost)} MP` : "—"}</PvRow>
        <PvRow label="Ricarica" tip={c.sugg ? `Suggerito: ${c.sugg.cd}` : undefined}>{c.cd ?? "—"} t</PvRow>
        {P && <PvRow label={`Favore (${c.char?.name ?? "PG"})`} tip={[`Fede del PG ${ni(c.char_fede)} · favore ${c.char_favor_name}${c.char_favor?.recorded ? "" : " (non registrato)"}`, `Molt. favore ×${nf(P.fm.mult)}`, D.potenza]}>
          <span className={P.fm.mult ? "" : "wz-bad"}>{P.fm.state}</span></PvRow>}
        <PvRow label="Voti e tabù" tip={c.vows}>{(c.vows ?? []).length || DASH}</PvRow>
        <PvRow label="Contro la volontà" tip={ag ? [ag.text, String(d.againstNote ?? "").trim()] : undefined}>{ag?.name ?? DASH}</PvRow>
        <PvRow label="Assegnazione" tip={issues}><span className={d.assign && issues.length ? "wz-warn" : ""}>{!d.assign ? "solo libreria" : issues.length ? (d.force ? "forzata" : "da verificare") : `a ${c.char?.name ?? "—"}`}</span></PvRow>
      </PvWin>
    );
  },
};

export const MAGIC_WIZARDS = [incantesimo, miracolo];
