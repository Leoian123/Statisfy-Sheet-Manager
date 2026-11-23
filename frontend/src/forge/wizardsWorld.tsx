/* Forgia · gruppo "Mondo": PNG (sul motore dei preset, come Mondo → PNG) e Incontro. */
import { useState } from "react";
import { errorText } from "../api/client";
import { forgeApi, type DropProfile, type Draft } from "../api/forge";
import type { Combattimento, Composizione, Scheda, Strati } from "../api/png";
import { Avvisi, ComposizioneView, StratiForm, useCatalogo } from "../components/png/PngParts";
import { SETTE, SETTE_HELP, SETTE_LABEL, bozzaNuova, maiuscola, nuovoSeme, parola } from "../lib/png";
import {
  DASH, Decided, filled, Lines, NameOr, NumF, Picks, Proposal, PvRow, PvSec, PvText, PvWin, RarityChip, Ref,
  SelF, TextF, nf, ni, useW, type WizardDef, GroupF } from "./engine";

/* =====================================================================
   5. PNG — stesso motore e stessi pezzi della pagina Mondo → PNG (app/png, components/png).
   La bozza è strati + seme + campi scritti a mano; il server pesca e compone a ogni modifica.
   Il wizard produce sempre una scheda completa (Sistema_PNG §4); comparse e schede veloci stanno in Mondo → PNG.
   ===================================================================== */
function PngStrati() {
  const x = useW();
  const { cat, err } = useCatalogo();
  if (err) return <p className="hint bad">{err}</p>;
  if (!cat) return <p className="small muted">Leggo i preset…</p>;
  const comp = x.c.composizione as Composizione | undefined;
  return <>
    <StratiForm cat={cat} idp="wz-png" value={x.d as Strati} onChange={(v) => x.upd((d) => { Object.assign(d, v); })} />
    {comp && <ComposizioneView c={comp} />}
    <Ref>Ogni valore porta lo strato che l'ha deciso: passaci sopra per il file, la riga e FONTE o PROPOSTA. I preset si ritoccano in <span className="mono">backend/png/</span>.</Ref>
  </>;
}

function PngPersona() {
  const x = useW();
  const s = x.c.scheda as Scheda | undefined;
  return <>
    <TextF path="nome" label="Nome" max={100} ph={s?.nome ?? ""} hint={s?.nome.startsWith("[") ? "Per questa razza e questo regno i documenti non danno uno stile di nomi: scrivilo tu." : "Vuoto = il nome pescato."} />
    <div className="wz-grid2">
      <NumF path="livello" label="Livello" min={1} max={999} ph={s ? String(s.livello) : ""} hint={x.c.rank ? `Rango di potere: ${x.c.rank}` : undefined} />
      <SelF path="genere" label="Genere" opts={[{ v: "", l: `pescato${s ? ` (${s.genere === "f" ? "donna" : "uomo"})` : ""}` }, { v: "f", l: "donna" }, { v: "m", l: "uomo" }]} />
    </div>
    <div className="png-wz-pesca">
      <span className="label">Seme</span><span className="mono small">{x.d.seme}</span>
      <button type="button" className="btn" onClick={() => x.upd((d) => { d.seme = nuovoSeme(); d.campi = {}; })}>Rigenera la pescata</button>
    </div>
    <Ref>Lo stesso seme ridà la stessa persona: è salvato nella scheda, così si sa sempre da dove viene.</Ref>
  </>;
}

function PngSette() {
  const x = useW();
  const s = x.c.scheda as Scheda | undefined;
  if (!s) return <p className="small muted">Scegli prima gli strati.</p>;
  const campi = ["vuole", "teme", "difetto", "forestieri", "prezzo", "vita", "contraddizione", ...("perche_qui" in s ? ["perche_qui"] : []), "voce"];
  return <>
    <Ref>Gli spunti pescati sono un punto di partenza: riscrivili sul luogo e sulla persona (non «teme il debito col fornitore» ma un nome, una cifra, una scadenza). La contraddizione non si pesca.</Ref>
    {campi.map((k) => (
      <TextF key={k} path={`campi.${k}`} label={SETTE_LABEL[k]} area rows={k === "voce" || k === "contraddizione" ? 2 : 1} max={300}
        req={k === "contraddizione" || k === "perche_qui"}
        ph={String((s as unknown as Record<string, unknown>)[k] ?? (k === "contraddizione" ? s.contraddizione_spunto ?? "" : ""))}
        hint={[SETTE_HELP[k], s.origine?.[k]].filter(Boolean).join(" · ")} />
    ))}
  </>;
}

const png: WizardDef = {
  id: "png", kind: "npcs", group: "Mondo", title: "PNG",
  desc: "Persona completa dai preset (ruolo, età, razza, luogo): entra nell'archivio di Mondo → PNG.",
  heading: "Nuovo PNG",
  intro: "I PNG non sanno che gli Immortali sono giocatori: li vedono come forestieri. La morte di un PNG è definitiva (Sistema PNG, Regola aurea). Il ritratto si aggiunge dall'archivio in Mondo → PNG.",
  fresh: () => ({ ...bozzaNuova(), storia: {}, knows: "", debts: "" }),
  steps: [
    { render: () => <PngStrati /> },
    { render: () => <PngPersona /> },
    { render: () => <PngSette /> },
    { render: () => <>
      <div className="wz-grid2"><TextF path="storia.origine" label="Origine" area rows={2} /><TextF path="storia.eventi" label="Eventi formativi" area rows={2} /></div>
      <TextF path="storia.relazioni" label="Relazioni importanti" ph="es. cognato del sergente Hald" />
      <TextF path="storia.obiettivo_lungo" label="Obiettivo a lungo termine" />
      <TextF path="storia.ganci" label="Ganci per le quest" area rows={2} />
      <div className="wz-secret"><TextF path="storia.segreto" label="Segreto (solo Master)" area rows={2} /></div>
      <Ref>Facoltativo: la scheda completa di Sistema_PNG §4. Personalità, paure e obiettivo a breve vengono dai sette campi.</Ref>
    </> },
    { render: () => <>
      <TextF path="knows" label="Che cosa sa dei forestieri del gruppo" area rows={2} hint="Per i PNG gli Immortali sono forestieri, non giocatori." />
      <TextF path="debts" label="Debiti e favori" ph="es. Kelvin le deve due notti non pagate" />
      <Ref>L'affinità parte dal valore del luogo (−1 in un villaggio, Taratura §4) e si aggiorna dopo ogni sessione dall'archivio.</Ref>
    </> },
  ],
  preview: ({ c }) => {
    const s = c.scheda as Scheda | undefined;
    const b = c.combattimento as Combattimento | undefined;
    return (
      <PvWin tag="PNG" head={s ? s.nome : <span className="muted">PNG senza strati validi</span>}>
        {!s ? <Avvisi errori={(c.errori as string[]) ?? []} /> : <>
          <PvRow label="Livello" tip={c.rank ? `Rango di potere: ${c.rank} · ${s.origine?.livello ?? ""}` : undefined}><span className="num">{s.livello}</span></PvRow>
          <PvRow label="Ruolo">{maiuscola(parola(s.ruolo))}{s.mestiere?.nome ? ` · ${s.mestiere.nome}${s.mestiere.grado ? ` ${s.mestiere.grado}` : ""}` : ""}</PvRow>
          <PvRow label="Razza · età">{parola(s.razza)} · {s.eta.apparente} anni{s.eta.vera && s.eta.vera !== s.eta.apparente ? ` (veri ${s.eta.vera})` : ""}</PvRow>
          <PvRow label="Luogo">{s.luogo}</PvRow>
          <PvRow label="Tratti">{s.tratti.join(", ")}</PvRow>
          <PvSec label="I sette campi" />
          {SETTE.map((k) => <PvText key={k} label={SETTE_LABEL[k]} text={(s as unknown as Record<string, unknown>)[k]} />)}
          {"perche_qui" in s && <PvText label="Perché è qui" text={s.perche_qui} />}
          <PvSec label="Voce e agganci" />
          <PvText label="Voce" text={s.voce} />
          <PvText label="Può dare" text={s.puo_dare.join("; ")} />
          <PvText label="Dice di no se" text={s.no_tipici.join("; ")} />
          <PvSec label="Combattimento" />
          {b?.combatte
            ? <><PvRow label="Vita" tip={b.formula_vita}><span className="num">{ni(b.vita)}</span></PvRow>
                <PvRow label="Danno base" tip={b.formula_danno}><span className="num">{ni(b.danno)}</span></PvRow></>
            : <PvRow label="Non combatte" tip={b?.nota}>{s.addestramento}</PvRow>}
          {(c.avvisi as string[])?.length > 0 && <><PvSec label="Avvisi" /><Avvisi avvisi={c.avvisi as string[]} /></>}
        </>}
      </PvWin>
    );
  },
};

/* =====================================================================
   6. INCONTRO
   ===================================================================== */
const PROP_DIFF = "difficoltà = (Vita totale creature × Danno totale creature) / (Vita totale gruppo × Danno totale gruppo). Danno di un PG = Base arma equipaggiata (o media della rarità tipica per il suo livello) × max(molt. fisico, molt. magico) × attacchi per turno. Soglie: <0,1 Banale, <0,3 Facile, <0,7 Equilibrato, <1,5 Difficile, <4 Mortale, oltre Impossibile.";
const DEC_DIFF = "la difficoltà la decide il Master al momento; la stima calcolata è solo un riferimento.";
const DEC_EXP = "la rarità moltiplica l'EXP per grado³, come la forza della creatura (Non Comune ×8, Raro ×27 … Divino ×512). Quando chiudi l'incontro scegli se ogni PG prende l'EXP intera o se va divisa nel gruppo.";
const DEC_LOOT = "il bottino lo decide il Master; il profilo di drop è un suggerimento generato al momento.";
const PROP_DROP = "profilo: un tiro d100 per creatura (max 6). Le soglie dipendono dal tipo di profilo (Avaro, Normale, Generoso, Tesoro), la rarità parte da quella della creatura più rara; monete: Corone = numero di creature × grado di rarità² / 4 (±50%) più 0–19 Scellini.";
const pad = (n: number) => String(n).padStart(2, "0");

function DropBox() {
  const x = useW();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pf = x.d.drop as DropProfile | null;
  const valid = (x.c.valid ?? 0) > 0;
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  return (
    <GroupF label={<>Profilo di drop <Decided why={DEC_LOOT} /> <Proposal why={PROP_DROP} /></>}>
      {pf ? <div className="wz-drop">
        <div className="small"><b>Profilo {pf.kind}</b> · <span className="muted">{pf.text}</span></div>
        <div className="table-wrap"><table className="t wz-drop-t"><thead><tr><th>d100</th><th>Risultato</th></tr></thead><tbody>
          {pf.rows.map((r) => <tr key={r.from}><td className="num">{pad(r.from)}–{r.to === 100 ? "100" : pad(r.to)}</td><td>{r.rarity && <><RarityChip rarity={r.rarity} /> </>}{r.what}</td></tr>)}
        </tbody></table></div>
        <div className="xs muted">Tiri: {pf.rolls} (uno per creatura, max 6) · Monete: {pf.corone} Corone, {pf.scellini} Scellini · {pf.mats.map((m) => `${m.qty}× ${m.name}`).join(", ")}</div>
      </div> : <p className="small muted">Nessun profilo: generane uno, oppure scrivi direttamente il bottino.</p>}
      <div className="row">
        <button type="button" className="btn" disabled={!valid || busy}
          onClick={() => run(async () => { const p = await forgeApi.dropProfile(x.d.creatures); x.set("drop", p); })}>
          {pf ? "Rigenera profilo" : "Genera profilo di drop"}</button>
        <button type="button" className="btn ghost" disabled={!pf || busy} title="Scrive il risultato nel bottino deciso dal Master, che puoi poi correggere"
          onClick={() => run(async () => { const r = await forgeApi.dropRoll(pf!); x.set("lootNote", r.text); })}>Tira il bottino</button>
      </div>
      {err && <span className="hint bad" role="alert">{err}</span>}
      <span className="hint">Rarità di riferimento: {x.c.top_rarity ?? "Comune"} (creatura più rara) · arma {x.c.top_rarity ?? "Comune"}: Base danno {x.c.weapon_base_range ?? "—"}.</span>
    </GroupF>
  );
}

const incontro: WizardDef = {
  id: "incontro", kind: "encounters", group: "Mondo", title: "Incontro",
  desc: "Scontro con creature dalle formule del Combat: difficoltà stimata, EXP × grado³ della rarità, profilo di drop.",
  heading: "Nuovo incontro",
  intro: "Le creature seguono il Combat: Danno base = (10 + livello×6) × rarità; Vita = (40 + livello×20) × rarità × taglia. La rarità vale grado³ (Raro ×27), anche per l'EXP.",
  fresh: (meta) => {
    const party = meta.characters.map((c) => c.id);
    const level = meta.characters.length ? Math.round(meta.characters.reduce((s, c) => s + c.level, 0) / meta.characters.length) : 1;
    return { name: "", place: "", env: "Foresta", conditions: "", party, level,
      creatures: [{ name: "", level, rarity: "Comune", size: "Normale", count: 1 }], hooks: "", lootNote: "", masterDiff: "", drop: null };
  },
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome dell'incontro" req max={60} ph="es. Imboscata al guado" />
      <div className="wz-grid2">
        <TextF path="place" label="Luogo" req ph="es. Guado del Salice, a nord di Alba Chiara" />
        <SelF path="env" label="Ambiente" opts={x.meta.environments} />
      </div>
      <TextF path="conditions" label="Condizioni ambientali" area rows={2} ph="es. Nebbia fitta: −20% precisione a distanza; acqua alle ginocchia" />
    </> },
    { render: (x) => <>
      <Picks path="party" label="PG che partecipano" multi req opts={x.meta.characters.map((c) => ({ v: c.id, l: c.name, sub: `Lv ${c.level} · ${c.classe}` }))} />
      <div className="wz-grid2">
        <NumF path="level" label="Livello del gruppo" req min={1} max={999} />
        <GroupF label="Media">
          <div className="row"><span className="small">Media dei PG scelti: <b className="num">{x.c.avg_level ?? "—"}</b></span>
            <button type="button" className="btn ghost" disabled={!x.c.avg_level} onClick={() => x.set("level", x.c.avg_level)}>Usa la media</button></div>
        </GroupF>
      </div>
      <Ref>Il livello del gruppo serve per l'EXP indicativa e come livello iniziale delle creature; difficoltà ed EXP alla chiusura usano i PG scelti, uno per uno.</Ref>
    </> },
    { render: (x) => <>
      <Lines what="la creatura" items={x.d.creatures as Draft[]} minItems={1} onRemove={(i) => x.upd((d) => { d.creatures.splice(i, 1); d.drop = null; })} render={(_, i) => {
        const k = (x.c.creatures ?? [])[i];
        return <>
          <TextF path={`creatures.${i}.name`} label="Creatura" cls="wz-grow" ph="es. Lupo grigio" />
          <NumF path={`creatures.${i}.level`} label="Livello" cls="wz-narrow" min={1} max={999} />
          <NumF path={`creatures.${i}.count`} label="Numero" cls="wz-narrow" min={1} max={99} />
          <SelF path={`creatures.${i}.rarity`} label="Rarità" opts={x.meta.rarities.map((r) => r.name)} />
          <SelF path={`creatures.${i}.size`} label="Taglia" opts={x.meta.sizes.map((s) => ({ v: s.v, l: `${s.v} ×${nf(s.m)}` }))} />
          {k && <div className="wz-calc">
            <span className="chip muted" title={`(40 + livello×20) × rarità × taglia = ${k.hp_formula}`}>Vita {ni(k.hp)}</span>
            <span className="chip muted" title={`(10 + livello×6) × rarità = ${k.dmg_formula}`}>Danno {ni(k.dmg)}</span>
          </div>}
        </>;
      }} />
      <div className="row"><button type="button" className="btn" disabled={x.d.creatures.length >= 12}
        onClick={() => x.upd((d) => { d.creatures.push({ name: "", level: Number(d.level) || 1, rarity: "Comune", size: "Normale", count: 1 }); })}>＋ Aggiungi creatura</button></div>
      <Ref>Goblin, lupi e bestie ordinarie sono Comuni; i draghi Leggendari. La taglia cambia solo la Vita: Fragile ×0,5, Normale ×1, Robusta ×1,5.</Ref>
    </> },
    { render: (x) => <>
      <DropBox />
      <SelF path="masterDiff" label="Difficoltà decisa dal Master" opts={[{ v: "", l: "Usa la stima" }, ...x.meta.difficulty.map((d) => d.label)]}
        hint="Facoltativa: la stima calcolata nell'anteprima è solo un riferimento." />
      <TextF path="lootNote" label="Bottino deciso dal Master" area rows={4} ph="es. Zanna di lupo (Comune), 12 Scellini" />
      <TextF path="hooks" label="Ganci narrativi" area rows={3} ph="es. Uno dei lupi porta un collare con lo stemma di Orsino" />
      <Ref>Bersagli inermi o inattivi danno metà EXP (Progressione, Sezione 2).</Ref>
    </> },
  ],
  preview: ({ d, c }) => {
    const cs = ((d.creatures ?? []) as Draft[]).map((cr, i) => ({ cr, k: (c.creatures ?? [])[i] })).filter(({ cr, k }) => k && filled(cr.name));
    const diff = c.difficulty as Draft | null;
    const exp = c.exp as { pct: number; parts: string[] } | undefined;
    const byPc = (c.exp_by_pc ?? []) as Draft[];
    const powers = (c.powers ?? []) as Draft[];
    const pf = d.drop as DropProfile | null;
    return (
      <PvWin tag="INCONTRO" head={<NameOr s={d.name} ph="Incontro senza nome" />}>
        <PvRow label="Luogo">{filled(d.place) ? <>{d.place.trim()} <span className="muted">· {d.env}</span></> : DASH}</PvRow>
        <PvRow label="Gruppo" tip={((c.party ?? []) as Draft[]).map((p) => `${p.name} · Lv ${p.level}`)}>{(c.party ?? []).length} PG · lv <span className="num">{d.level}</span></PvRow>
        <PvSec label="Creature" />
        {cs.length ? cs.map(({ cr, k }, i) => (
          <PvRow key={i} label={`${cr.count}× ${String(cr.name).trim()}`} tip={[`Lv ${cr.level} · ${cr.rarity} · ${cr.size}`, `Vita = ${k.hp_formula} = ${ni(k.hp)}`, `Danno base = ${k.dmg_formula} = ${ni(k.dmg)}`]}>
            <span className="num">{ni(k.hp)}</span> <span className="xs muted">Vita</span> · <span className="num">{ni(k.dmg)}</span> <span className="xs muted">danno</span>
          </PvRow>)) : <PvRow label="Creature">{DASH}</PvRow>}
        <PvSec label="Valutazione" extra={<Decided why={DEC_DIFF} />} />
        {d.masterDiff && <PvRow label="Difficoltà"><span className={`chip ${c.master_tone ?? "muted"}`}>{d.masterDiff}</span> <span className="xs muted">decisa dal Master</span></PvRow>}
        <PvRow label={d.masterDiff ? "Stima" : "Difficoltà (stima)"} tip={diff ? [
          `Creature: Vita ${ni(diff.c_hp)} × Danno ${ni(diff.c_dmg)}`, `Gruppo: Vita ${ni(diff.p_hp)} × Danno ${ni(diff.p_dmg)}`, `Rapporto: ${diff.ratio == null ? "∞" : nf(diff.ratio)}`,
          ...powers.map((p) => `${p.name}: Vita ${ni(p.hp)}, danno ${ni(p.dmg)} (${p.weapon}: ${ni(p.base)} × ${nf(p.molt)} × ${nf(p.att)})`)] : undefined}>
          {diff ? <><span className={`chip ${diff.tone}`}>{diff.label}</span> <Proposal why={PROP_DIFF} /></> : DASH}
        </PvRow>
        <PvRow label="EXP intera per PG" tip={exp && cs.length ? [`PG di livello ${d.level}: ${nf(exp.pct)}%`, ...exp.parts, "",
          ...byPc.map((p) => `${p.name} (Lv ${p.level}): ${nf(p.pct)}%`), "",
          "Pari livello 2%, ±1 punto per livello di differenza (0–10%); dal lv 10 metà, dal 50 un quarto; poi × grado³ della rarità.",
          "Intera o divisa: si sceglie alla chiusura dell'incontro, nella Libreria della Forgia."] : undefined}>
          {exp && cs.length ? <><span className="num">{nf(exp.pct)}%</span> <Decided why={DEC_EXP} /></> : DASH}
        </PvRow>
        <PvRow label="Profilo di drop" tip={pf ? pf.rows.map((r) => `${pad(r.from)}–${r.to === 100 ? "100" : pad(r.to)}: ${r.what}`) : "Il bottino lo decide il Master; il profilo è facoltativo."}>
          {pf ? <>{pf.kind} · <RarityChip rarity={pf.top} /></> : DASH}</PvRow>
        <PvSec label="Scena" />
        <PvText label="Condizioni" text={d.conditions} />
        <PvText label="Ganci" text={d.hooks} />
        {filled(d.lootNote) && <PvText label="Bottino deciso" text={d.lootNote} />}
      </PvWin>
    );
  },
};

export const WORLD_WIZARDS = [png, incontro];
