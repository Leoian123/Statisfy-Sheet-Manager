/* Forgia · gruppo "Mondo": PNG e Incontro (porting di mockup/screens/wizards-master.js). */
import { useState } from "react";
import { errorText } from "../api/client";
import { forgeApi, type DropProfile, type Draft } from "../api/forge";
import {
  CheckF, DASH, Decided, filled, Lines, NameOr, NumF, Picks, Proposal, PvRow, PvSec, PvText, PvWin, RarityChip, Ref,
  SelF, TextF, nf, ni, useW, type WizardDef, GroupF } from "./engine";

const TRUST_TONE: Record<string, string> = { Scarso: "bad", Neutrale: "muted", Buono: "good", Eccellente: "gold" };

/* =====================================================================
   5. PNG
   ===================================================================== */
const png: WizardDef = {
  id: "png", kind: "npcs", group: "Mondo", title: "PNG",
  desc: "Personaggio non giocante completo: entra anche nell'archivio PNG dell'Area Master.",
  heading: "Nuovo PNG",
  intro: "I PNG non sanno che gli Immortali sono giocatori: li vedono come forestieri insoliti. La morte di un PNG è definitiva (Sistema PNG, Regola aurea).",
  fresh: () => ({ name: "", level: "", race: "Umano", place: "", role: "", kingdom: "", age: "",
    traits: "", speech: "", motives: "", fears: "", habits: "", origin: "", events: "", relations: "", goalShort: "", goalLong: "",
    conflict: "", skills: "", influence: "", wealth: "", connections: "", trust: "Neutrale", knows: "", debts: "", secret: "", fight: false, size: "Normale" }),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome completo" req max={60} ph="es. Elena la Saggia" />
      <div className="wz-grid2">
        <NumF path="level" label="Livello" req min={1} max={999} ph="45" />
        <TextF path="race" label="Razza" req list="wz-races" />
      </div>
      <datalist id="wz-races">{[...new Set([...x.meta.races_known, ...x.meta.races])].map((r) => <option key={r} value={r} />)}</datalist>
      <span className="hint">{x.c.rank ? <>Rango di potere: <b>{x.c.rank}</b></> : "Il livello dà il rango di potere (1–99 Soldati Semplici … 600+ Divinità)."}</span>
      <div className="wz-grid2">
        <TextF path="place" label="Luogo" req ph="es. Alba Chiara — Il Gallo Storto" />
        <TextF path="role" label="Ruolo" req ph="es. Locandiera, informatrice" />
        <SelF path="kingdom" label="Regno" opts={[{ v: "", l: "—" }, ...x.meta.kingdoms]} />
        <TextF path="age" label="Età (apparente / reale)" ph="es. 40 / 212" />
      </div>
      <Ref>Nei villaggi le cariche stanno molto più in basso: un sergente o un sindaco di paese possono essere sotto il livello 100.</Ref>
    </> },
    { render: () => <>
      <TextF path="traits" label="Tratti dominanti (3–4)" req ph="es. Curiosa, diffidente, generosa con chi paga" />
      <TextF path="speech" label="Modo di parlare" req area rows={2} ph="es. Frasi brevi, chiama tutti «ragazzo», ride delle proprie battute" />
      <div className="wz-grid2"><TextF path="motives" label="Motivazioni profonde" area rows={2} /><TextF path="fears" label="Paure e debolezze" area rows={2} /></div>
      <TextF path="habits" label="Manie e abitudini" ph="es. Conta le monete due volte" />
    </> },
    { render: () => <>
      <div className="wz-grid2"><TextF path="origin" label="Origine" area rows={2} /><TextF path="events" label="Eventi formativi" area rows={2} /></div>
      <TextF path="relations" label="Relazioni importanti" ph="es. Sorella del capitano Orsino" />
      <div className="wz-grid2"><TextF path="goalShort" label="Obiettivo a breve termine" /><TextF path="goalLong" label="Obiettivo a lungo termine" /></div>
      <TextF path="conflict" label="Conflitto interno" />
      <div className="wz-grid2">
        <TextF path="skills" label="Competenze" /><TextF path="influence" label="Influenza" />
        <TextF path="wealth" label="Ricchezze" /><TextF path="connections" label="Connessioni" />
      </div>
    </> },
    { render: (x) => <>
      <Picks path="trust" label="Fiducia iniziale verso il gruppo" opts={x.meta.trust} />
      <TextF path="knows" label="Cosa sa dei PG" req area rows={2} hint="Ricorda: per i PNG gli Immortali sono forestieri, non giocatori." />
      <TextF path="debts" label="Debiti e favori" ph="es. Kelvin le deve due notti non pagate" />
      <div className="wz-secret"><TextF path="secret" label="Segreto (solo Master)" area rows={2} /></div>
    </> },
    { render: (x) => <>
      <CheckF path="fight" label="Ha statistiche di combattimento" />
      {x.d.fight ? <>
        <Picks path="size" label="Taglia" opts={x.meta.sizes.map((s) => ({ v: s.v, l: s.v, sub: `Vita ×${nf(s.m)}` }))} />
        {x.c.creature && <div className="sysmsg"><span className="tag">[COMBAT]</span><span>Creatura Comune, livello {x.d.level || "—"}: Vita {ni(x.c.creature.hp)} · Danno base {ni(x.c.creature.dmg)}</span></div>}
        <Ref>Formule delle creature (Combat): Danno base = (10 + livello×6) × rarità; Vita = (40 + livello×20) × rarità × taglia. Un PNG è calcolato come creatura Comune (×1); le creature nominate possono avere di più, a giudizio del narratore.</Ref>
      </> : <Ref>Facoltativo: spunta per calcolare Vita e danno come creatura di rarità Comune.</Ref>}
    </> },
  ],
  preview: ({ d, c }) => (
    <PvWin tag="PNG" head={<NameOr s={d.name} ph="PNG senza nome" />}>
      <PvRow label="Livello" tip={c.rank ? `Rango di potere: ${c.rank}` : undefined}>{c.rank ? <span className="num">{d.level}</span> : DASH}</PvRow>
      <PvText label="Razza" text={d.race} />
      <PvText label="Luogo" text={d.place} />
      <PvText label="Ruolo" text={d.role} />
      {d.kingdom && <PvRow label="Regno">{d.kingdom}</PvRow>}
      {filled(d.age) && <PvText label="Età" text={d.age} />}
      <PvSec label="Personalità" />
      <PvText label="Tratti" text={d.traits} />
      <PvText label="Parla" text={d.speech} />
      {filled(d.motives) && <PvText label="Motivazioni" text={d.motives} />}
      {filled(d.fears) && <PvText label="Paure" text={d.fears} />}
      <PvSec label="Background e obiettivi" />
      <PvText label="Origine" text={d.origin || d.events} />
      {filled(d.goalShort) && <PvText label="Breve termine" text={d.goalShort} />}
      {filled(d.goalLong) && <PvText label="Lungo termine" text={d.goalLong} />}
      {(() => {
        const res = [["Competenze", d.skills], ["Influenza", d.influence], ["Ricchezze", d.wealth], ["Connessioni", d.connections]].filter(([, v]) => filled(v));
        return <PvRow label="Risorse" tip={res.map(([l, v]) => `${l}: ${String(v).trim()}`)}>{res.length ? "vedi dettaglio" : DASH}</PvRow>;
      })()}
      <PvSec label="Rapporto con i PG" />
      <PvRow label="Fiducia"><span className={`chip ${TRUST_TONE[d.trust] ?? "muted"}`}>{d.trust}</span></PvRow>
      <PvText label="Sa" text={d.knows} />
      <PvText label="Debiti e favori" text={d.debts} />
      <PvRow label="Segreto" tip={filled(d.secret) ? d.secret.trim() : undefined}>{filled(d.secret) ? <span className="chip gold">solo Master</span> : DASH}</PvRow>
      {d.fight && c.creature && <>
        <PvSec label="Combattimento" />
        <PvRow label="Vita" tip={["(40 + livello×20) × rarità × taglia", `= ${c.creature.hp_formula}`]}><span className="num">{ni(c.creature.hp)}</span></PvRow>
        <PvRow label="Danno base" tip={["(10 + livello×6) × rarità", `= ${c.creature.dmg_formula}`]}><span className="num">{ni(c.creature.dmg)}</span></PvRow>
        <PvRow label="Rarità · taglia">Comune · {d.size}</PvRow>
      </>}
    </PvWin>
  ),
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
