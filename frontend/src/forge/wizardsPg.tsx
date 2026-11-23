/* Forgia · gruppo "Personaggi": Skill, Classe, Razza, Titolo (porting di mockup/screens/wizards-master.js). */
import type { Draft, ForgeMeta } from "../api/forge";
import {
  CheckF, clone, DASH, Decided, filled, Lines, NameOr, NumF, Picks, PvRow, PvSec, PvText, PvWin, RarityChip, Ref, Req,
  RuleChip, SelF, TextF, charOpts, nf, ni, signed, type WCtx, type WizardDef, GroupF } from "./engine";
import { MechStep } from "./MechStep";

const STAT_NAME: Record<string, string> = { STR: "Forza", DEX: "Destrezza", VIT: "Vitalità", INT: "Intelligenza", FIN: "Finesse", AUT: "Autorità" };
const statOpts = (meta: ForgeMeta) => meta.stat_codes.map((k) => ({ v: k, l: STAT_NAME[k] ? `${k} · ${STAT_NAME[k]}` : k }));
const charName = (meta: ForgeMeta, id: unknown) => meta.characters.find((c) => String(c.id) === String(id))?.name;

/* =====================================================================
   1. SKILL
   ===================================================================== */
const DEC_GRADE = "ogni skill ha i suoi valori per Grado, scelti qui: non c'è una formula unica.";
const emptyRow = () => ({ what: "", unit: "%", vals: Array(10).fill("") });
const rowsKey = (rows: Draft[]) => JSON.stringify(rows.map((r) => [r.what, r.unit, (r.vals || []).map(Number)]));

function skillTypePick(x: WCtx, t: string) {
  x.upd((d) => {
    const weapon = rowsKey(d.rows) === rowsKey(x.meta.weapon_grade_rows);
    const blank = d.rows.length === 1 && !filled(d.rows[0].what) && d.rows[0].vals.every((v: unknown) => v === "");
    if (weapon || blank || !d.rows.length) d.rows = t === "Combat" ? clone(x.meta.weapon_grade_rows) : [emptyRow()];
    if (!filled(d.grade1) || Object.values(x.meta.grade1_rule).includes(d.grade1)) d.grade1 = x.meta.grade1_rule[t] || "";
    d.type = t;
  });
}

const skill: WizardDef = {
  id: "skill", kind: "skills", group: "Personaggi", title: "Skill",
  desc: "Passiva o attiva, con un valore per ognuno dei 10 Gradi, passiva del Grado X e come si ottiene il Grado I.",
  heading: "Nuova skill",
  intro: "Le skill crescono per Gradi I–X (Progressione, Sezione 4). Al Grado X chi la usa crea la propria passiva; oltre il X nasce una scuola personale.",
  fresh: (meta) => ({ name: "", type: "Combat", mode: "passiva", res: "SP", cost: "", cd: "", effect: "",
    rows: clone(meta.weapon_grade_rows), costRed: 0, passiveX: "", school: false, schoolName: "",
    grade1: meta.grade1_rule.Combat || "", method: "Level up", charId: "", mech: null }),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome della skill" req max={40} ph="es. Lancia, Conciatura, Comando: Ritirata" />
      <Picks path="type" label="Tipo" opts={x.meta.skill_types} onPick={(v) => skillTypePick(x, String(v))} />
      <Picks path="mode" label="Natura" opts={[{ v: "passiva", l: "Passiva", sub: "sempre attiva, migliora con l'uso" }, { v: "attiva", l: "Attiva", sub: "si usa, costa MP o SP" }]} />
    </> },
    { render: (x) => x.d.mode === "attiva" ? <>
      <div className="wz-grid2">
        <Picks path="res" label="Risorsa" opts={[{ v: "SP", l: "Stamina (SP)" }, { v: "MP", l: "Mana (MP)" }]} />
        <div className="wz-grid2"><NumF path="cost" label="Costo" req min={1} ph="15" /><NumF path="cd" label="Cooldown (turni)" req min={0} max={99} ph="3" /></div>
      </div>
      <TextF path="effect" label="Effetto" req area ph="es. +50% danno fisico al prossimo colpo" />
      <Ref>Esempi dal regolamento: Attacco Possente 15 SP, +50% danno fisico, cooldown 3; Dardo Magico 20 MP, colpisce sempre, cooldown 1 (Creazione personaggio).</Ref>
    </> : <>
      <TextF path="effect" label="Effetto della passiva" req area ph="es. Riconosce le pelli migliori e ne ricava materiale di qualità superiore" />
      <Ref>Una skill passiva non ha costo né cooldown: lavora sempre, e migliora salendo di Grado.</Ref>
    </> },
    { render: (x) => <>
      <GroupF label={<>Cosa migliora, Grado per Grado {x.c.weapon_rule && <RuleChip src="Progressione, Sezione 4: +2% precisione e +1% danno per Grado" />} <Decided why={DEC_GRADE} /></>}>
        <Lines what="la riga" items={x.d.rows as Draft[]} onRemove={(i) => x.upd((d) => { d.rows.splice(i, 1); })} render={(r, i) => <>
          <TextF path={`rows.${i}.what`} label="Cosa" cls="wz-grow" ph="Precisione" />
          <SelF path={`rows.${i}.unit`} label="Unità" opts={["%", "punti"]} cls="wz-narrow" />
          <button type="button" className="btn ghost" aria-label={`Riempi la riga ${i + 1} moltiplicando il Grado I`}
            disabled={r.vals[0] === "" || !Number.isFinite(Number(r.vals[0]))}
            onClick={() => x.upd((d) => { const v1 = Number(d.rows[i].vals[0]); d.rows[i].vals = Array.from({ length: 10 }, (_, g) => Math.round(v1 * (g + 1) * 100) / 100); })}>
            Lineare dal I</button>
          <div className="wz-grades">{Array.from({ length: 10 }, (_, g) => <NumF key={g} path={`rows.${i}.vals.${g}`} label={x.meta.roman[g + 1]} step={0.5} />)}</div>
        </>} />
        <div className="row">
          <button type="button" className="btn" onClick={() => x.upd((d) => { d.rows.push(emptyRow()); })}>＋ Aggiungi riga</button>
          {x.d.type === "Combat" && !x.c.weapon_rule && <button type="button" className="btn ghost" onClick={() => x.set("rows", clone(x.meta.weapon_grade_rows))}>Usa la regola delle armi</button>}
        </div>
        <span className="hint">Un valore per Grado, cumulativo (quanto vale la skill a quel Grado). «Lineare dal I» moltiplica il valore del Grado I. Regola per le skill d'arma: +2% precisione e +1% danno per Grado.</span>
      </GroupF>
      {x.d.mode === "attiva" && <NumF path="costRed" label="Riduzione del costo per Grado (%)" min={0} max={10} step={0.5} hint="Il regolamento dice «costi ridotti» senza un numero: 0 lascia il costo fisso." />}
      <TextF path="passiveX" label="Passiva sbloccata al Grado X" req area rows={2} ph="es. Gli effetti dei consumabili ingeriti raddoppiano" />
      <CheckF path="school" label="Prevede una scuola o uno stile oltre il Grado X" />
      {x.d.school && <TextF path="schoolName" label="Nome della scuola" req ph="es. Lancia del Gelo" hint="Oltre il X la skill diventa una scuola personale con i suoi Gradi I–X (Progressione, Sezione 5)." />}
    </> },
    { render: (x) => <>
      <TextF path="grade1" label="Condizione per il Grado I" req area rows={2}
        after={x.c.grade1_rule && x.d.grade1 === x.c.grade1_rule ? <RuleChip src="Progressione, Sezione 3: primo Grado di una nuova abilità" /> : null}
        hint="Regola: armi al primo uso vero in combattimento; mestieri dopo un lavoro completo sotto la guida di un PNG del mestiere." />
      <SelF path="method" label="Come si acquisisce" opts={x.meta.acquire.map((a) => ({ v: a.v, l: a.l }))} hint="Metodi di acquisizione della Progressione, Sezione 3." />
    </> },
    { render: () => <MechStep kind={(x) => (x.d.mode === "attiva" ? "skill" : "passiva")}
      launch={(x) => (x.d.mode === "attiva" && Number(x.d.cost) > 0 ? { risorsa: x.d.res === "MP" ? "MP" : "SP", valore: Number(x.d.cost) } : null)} /> },
    { render: (x) => <>
      <SelF path="charId" label="Assegna a un PG (facoltativo)" opts={charOpts(x.meta)}
        hint={x.d.mode === "attiva" ? "Finisce tra le Skill attive del PG, al Grado I e 0%." : "Finisce tra le Skill del PG, al Grado I e 0%."} />
      <Ref>La skill entra comunque nella libreria della campagna, pronta per classi, titoli e libri.</Ref>
    </> },
  ],
  preview: (x) => {
    const { d, c, meta } = x;
    const grades: string[] = c.grades ?? [];
    const g = (n: number) => grades[n - 1] || DASH;
    const all = grades.map((t, i) => `${meta.roman[i + 1]} ${meta.grades[i]}: ${t || "—"}`);
    const att = d.mode === "attiva";
    return (
      <PvWin tag="SKILL" head={<NameOr s={d.name} ph="Skill senza nome" />}>
        <PvRow label="Tipo"><span className="chip violet">{d.type}</span></PvRow>
        <PvRow label="Natura">{att ? "Attiva" : "Passiva"}</PvRow>
        {att && <PvRow label="Costo" tip={c.cost_x != null ? [`Grado I: ${ni(d.cost)} ${d.res}`, `Grado X: ${nf(c.cost_x)} ${d.res}`, `= ${d.cost} × (1 − ${nf(d.costRed)}% × 9)`] : undefined}>
          {Number(d.cost) ? <span className="num">{ni(d.cost)} {d.res}</span> : DASH}</PvRow>}
        {att && <PvRow label="Cooldown">{d.cd !== "" ? <><span className="num">{d.cd}</span> turni</> : DASH}</PvRow>}
        <PvText label="Effetto" text={d.effect} />
        <PvSec label="Maestria" />
        <PvRow label="Grado I" tip={all}>{g(1)}</PvRow>
        <PvRow label="Grado V" tip={all}>{g(5)}</PvRow>
        <PvRow label="Grado X" tip={all}>{g(10)}</PvRow>
        <PvText label="Passiva al X" text={d.passiveX} />
        <PvRow label="Oltre il X" tip="Al Grado X la skill evolve in una scuola personale con i suoi Gradi I–X (Progressione, Sezione 5).">{d.school && filled(d.schoolName) ? d.schoolName : DASH}</PvRow>
        <PvSec label="Ottenimento" />
        <PvText label="Grado I" text={d.grade1} />
        <PvRow label="Metodo">{d.method}</PvRow>
        <PvRow label="Assegnata a">{charName(meta, d.charId) ?? DASH}</PvRow>
      </PvWin>
    );
  },
};

/* =====================================================================
   2. CLASSE
   ===================================================================== */
const classe: WizardDef = {
  id: "classe", kind: "classes", group: "Personaggi", title: "Classe",
  desc: "Classe base, avanzata o di produzione: come si sblocca, abilità iniziale, equipaggiamento e talenti.",
  heading: "Nuova classe",
  intro: "Alla creazione esistono solo le quattro classi base; le altre si sbloccano giocando, e la via la decide il narratore caso per caso (Progressione, Sezione 2).",
  fresh: (meta) => ({ name: "", ctype: "avanzata", focus: "", from: "", unlock: "", teacher: "", minLevel: "", keyStats: [],
    abMode: meta.library_skills.length ? "lib" : "new", abLib: meta.library_skills[0]?.name ?? "",
    ab: { name: "", res: "SP", cost: "", cd: "", effect: "" }, equip: [{ name: "", note: "" }], tal: { 5: "", 10: "", 15: "", 20: "" } }),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome della classe" req max={40} ph="es. Paladino, Domatore, Conciatore" />
      <Picks path="ctype" label="Tipo" opts={x.meta.class_types} />
      {x.d.ctype === "base" && <div className="sysmsg"><span className="tag">[ATTENZIONE]</span><span>Il regolamento prevede solo quattro classi base (Guerriero, Mago, Ladro, Chierico). Una quinta cambia la creazione per tutti.</span></div>}
      <TextF path="focus" label="Descrizione e focus" req area ph="es. Combattente sacro: protegge gli alleati e punisce i non-morti" />
    </> },
    { render: (x) => <>
      {x.d.ctype === "base"
        ? <div className="sysmsg gold"><span className="tag">[SBLOCCO]</span><span>Classe base: disponibile alla creazione del personaggio.</span></div>
        : <>
          <SelF path="from" label="Classe di partenza" opts={[{ v: "", l: "Qualsiasi" }, ...(x.c.from_options ?? x.meta.classes)]} />
          <TextF path="unlock" label="Come si sblocca giocando" req area ph="es. Completare l'addestramento al Tempio di Luxor e farsi benedire da un Paladino di livello 200+"
            hint="Non c'è uno schema unico: un Paladino finisce un addestramento, un domatore di draghi o una maid hanno strade diverse." />
          <div className="wz-grid2"><TextF path="teacher" label="Chi la insegna o dove" ph="es. Fra' Teodoro, Tempio di Luxor" /><NumF path="minLevel" label="Livello minimo (facoltativo)" min={1} max={999} /></div>
        </>}
      <Picks path="keyStats" label="Statistiche chiave" multi req opts={Object.keys(STAT_NAME).map((k) => ({ v: k, l: k, sub: STAT_NAME[k] }))} />
    </> },
    { render: (x) => {
      const skills = x.meta.library_skills;
      return <>
        <Picks path="abMode" label="Origine" opts={[
          { v: "lib", l: "Dalla libreria", sub: skills.length ? `${skills.length} skill create` : "nessuna skill ancora", disabled: !skills.length, title: skills.length ? undefined : "Crea prima una skill con il wizard Skill" },
          { v: "new", l: "Nuova qui", sub: "abilità attiva" }]} />
        {x.d.abMode === "lib"
          ? <SelF path="abLib" label="Skill della libreria" opts={skills.map((s) => ({ v: s.name, l: `${s.name} · ${s.type} · ${s.mode}` }))} />
          : <>
            <TextF path="ab.name" label="Nome dell'abilità" req max={40} ph="es. Giuramento" />
            <div className="wz-grid2">
              <Picks path="ab.res" label="Risorsa" opts={["SP", "MP"]} />
              <div className="wz-grid2"><NumF path="ab.cost" label="Costo" req min={1} /><NumF path="ab.cd" label="Cooldown" req min={0} max={99} /></div>
            </div>
            <TextF path="ab.effect" label="Effetto" req area rows={2} />
          </>}
        <Ref>Riferimento, classi base: Attacco Possente (15 SP, +50% danno fisico, cd 3) · Dardo Magico (20 MP, colpisce sempre, cd 1) · Colpo Furtivo (10 SP, +100% critico se non visto, cd 2) · Cura Minore (25 MP, 40–60 HP, cd 1).</Ref>
      </>;
    } },
    { render: (x) => <>
      <GroupF label={<>Equipaggiamento iniziale<Req /></>}>
        <Lines what="l'oggetto" items={x.d.equip as Draft[]} minItems={1} onRemove={(i) => x.upd((d) => { d.equip.splice(i, 1); })} render={(_, i) => <>
          <TextF path={`equip.${i}.name`} label="Oggetto" cls="wz-grow" ph="es. Spada di Ferro" />
          <TextF path={`equip.${i}.note`} label="Nota" ph="es. Req 15 STR" />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.equip.push({ name: "", note: "" }); })}>＋ Aggiungi oggetto</button></div>
      </GroupF>
      <GroupF label="Percorso talenti suggerito">
        <div className="wz-grid2">{x.meta.talent_levels.map((l) => <TextF key={l} path={`tal.${l}`} label={`Livello ${l}`} ph={l === 5 ? "es. Ispeziona" : ""} />)}</div>
        <span className="hint">Talenti e abilità di classe arrivano ogni 5 livelli. Il regolamento non fissa un elenco: il sistema offre ciò che è coerente con come il PG ha giocato, quindi questo è solo un suggerimento al Master.</span>
      </GroupF>
    </> },
  ],
  preview: ({ d, c, meta }) => {
    const sk = c.skill as Draft | null | undefined;
    const eq = (d.equip as Draft[]).filter((e) => filled(e.name));
    return (
      <PvWin tag="CLASSE" head={<NameOr s={d.name} ph="Classe senza nome" />}>
        <PvRow label="Tipo">{c.label || DASH}</PvRow>
        {d.ctype === "base" ? <PvRow label="Sblocco">Alla creazione</PvRow> : <PvText label="Sblocco" text={d.unlock} />}
        {d.ctype !== "base" && <PvRow label="Da">{d.from || "Qualsiasi classe"}</PvRow>}
        {d.ctype !== "base" && filled(d.teacher) && <PvText label="Chi insegna" text={d.teacher} />}
        {d.minLevel !== "" && <PvRow label="Livello minimo"><span className="num">{d.minLevel}</span></PvRow>}
        <PvRow label="Stat chiave">{d.keyStats.length ? <span className="pv-chips">{(d.keyStats as string[]).map((k) => <span key={k} className="chip violet" title={STAT_NAME[k]}>{k}</span>)}</span> : DASH}</PvRow>
        <PvText label="Focus" text={d.focus} />
        <PvSec label="Abilità iniziale" />
        {sk && filled(sk.name)
          ? <PvRow label={sk.name} tip={[c.skill_line, sk.fromLibrary ? "Collegata alla libreria." : ""]}>{sk.mode === "attiva" && sk.cost ? <span className="num">{sk.cost} {sk.res}</span> : "Passiva"}</PvRow>
          : <PvRow label="Abilità">{DASH}</PvRow>}
        <PvSec label="Equipaggiamento" />
        {eq.length ? eq.map((e, i) => <PvRow key={i} label={e.name.trim()}>{filled(e.note) ? e.note.trim() : DASH}</PvRow>) : <PvRow label="Oggetti">{DASH}</PvRow>}
        <PvSec label="Percorso talenti" />
        {meta.talent_levels.map((l) => <PvText key={l} label={`Livello ${l}`} text={d.tal[l]} n={30} />)}
      </PvWin>
    );
  },
};

/* =====================================================================
   3. RAZZA
   ===================================================================== */
const DEC_RACE = "le razze aggiungono statistiche e talenti razziali, decisi qui dal Master senza limiti fissi.";
const fmtDer = (v: number, fmt: string) => (fmt === "pct" ? `${nf(v)}%` : fmt === "kg" ? `${nf(v)} kg` : fmt === "mult" ? `×${nf(v)}` : ni(v));

const razza: WizardDef = {
  id: "razza", kind: "races", group: "Personaggi", title: "Razza",
  desc: "Razza nativa con origine, talenti razziali e statistiche libere, lingue e rapporti.",
  heading: "Nuova razza",
  intro: "Chi arriva ad Aethermoor si manifesta umano; tratti di altre razze si acquisiscono con benedizioni, trasformazioni o rituali (Ambientazione, Razze e popolazioni).",
  fresh: () => ({ name: "", origin: "", originNote: "", desc: "", acquire: "", traits: [{ name: "", effect: "" }],
    mods: ["STR", "DEX", "VIT", "INT"].map((code) => ({ code, val: 0 })), langs: "", life: "", rel: [{ race: "Umani", rel: "Neutrali" }] }),
  steps: [
    { render: (x) => <>
      <GroupF label="Parti da una razza dell'ambientazione">
        <div className="wz-picks">{x.meta.race_templates.map((t) => (
          <button key={t.name} type="button" className="btn ghost" onClick={() => x.upd((d) => {
            d.name = t.name; d.origin = t.origin; if (t.desc) d.desc = t.desc; if (t.rel) d.rel = clone(t.rel);
          })}>{t.name}</button>))}</div>
        <span className="hint">Riempie nome, origine e descrizione da Ambientazione.txt. Talenti e numeri restano da decidere.</span>
      </GroupF>
      <TextF path="name" label="Nome" req max={40} />
      <div className="wz-grid2">
        <SelF path="origin" label="Origine o regno" req opts={[{ v: "", l: "Scegli…" }, ...x.meta.kingdoms, ...x.meta.race_origins_extra]} />
        <TextF path="originNote" label="Dettaglio del luogo" ph="es. Heartwood, foreste del nord" />
      </div>
      <TextF path="desc" label="Descrizione" req area />
      <TextF path="acquire" label="Come la ottiene un Immortale (facoltativo)" area rows={2} ph="es. Rituale ancestrale nel cuore di Heartwood" hint="Benedizione divina, trasformazione magica o rituale ancestrale." />
    </> },
    { render: (x) => <GroupF label={<>Talenti razziali<Req /> <Decided why={DEC_RACE} /></>}>
      <Lines what="il talento" items={x.d.traits as Draft[]} minItems={1} onRemove={(i) => x.upd((d) => { d.traits.splice(i, 1); })} render={(_, i) => <>
        <TextF path={`traits.${i}.name`} label="Talento" ph="es. Scurovisione" />
        <TextF path={`traits.${i}.effect`} label="Effetto" cls="wz-grow" ph="es. Vede al buio fino a 30 metri" />
      </>} />
      <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.traits.push({ name: "", effect: "" }); })}>＋ Aggiungi talento</button></div>
    </GroupF> },
    { render: (x) => <GroupF label={<>Statistiche aggiunte dalla razza <Decided why={DEC_RACE} /></>}>
      <Lines what="la statistica" items={x.d.mods as Draft[]} onRemove={(i) => x.upd((d) => { d.mods.splice(i, 1); })} render={(_, i) => <>
        <SelF path={`mods.${i}.code`} label="Statistica" cls="wz-grow" opts={statOpts(x.meta)} />
        <NumF path={`mods.${i}.val`} label="Valore" cls="wz-narrow" ph="+5" />
      </>} />
      <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => {
        const used = new Set((d.mods as Draft[]).map((m) => m.code));
        d.mods.push({ code: x.meta.stat_codes.find((k) => !used.has(k)) ?? "STR", val: 0 });
      })}>＋ Aggiungi statistica</button></div>
      <span className="hint">Qualsiasi statistica, anche avanzata e anche negativa, senza limiti. Finiscono nella colonna «Altro» del PG. L'anteprima mostra un PG di livello 1 della razza rispetto a un umano.</span>
    </GroupF> },
    { render: (x) => <>
      <div className="wz-grid2">
        <TextF path="langs" label="Lingue" req ph="es. Comune, Eldarin" />
        <NumF path="life" label="Durata della vita (anni)" req min={1} ph="es. 120" />
      </div>
      <GroupF label="Rapporti con le altre razze">
        <Lines what="il rapporto" items={x.d.rel as Draft[]} onRemove={(i) => x.upd((d) => { d.rel.splice(i, 1); })} render={(_, i) => <>
          <TextF path={`rel.${i}.race`} label="Razza" cls="wz-grow" ph="es. Nani" />
          <SelF path={`rel.${i}.rel`} label="Rapporto" opts={x.meta.relations} />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.rel.push({ race: "", rel: "Neutrali" }); })}>＋ Aggiungi rapporto</button></div>
        <span className="hint">Dall'ambientazione: i Nani sono alleati tradizionali degli umani.</span>
      </GroupF>
    </> },
  ],
  preview: ({ d, c }) => {
    const traits = (d.traits as Draft[]).filter((t) => filled(t.name));
    const mods = Object.entries((c.mods ?? {}) as Record<string, number>).filter(([, v]) => v);
    return (
      <PvWin tag="RAZZA" head={<NameOr s={d.name} ph="Razza senza nome" />}>
        <PvRow label="Origine">{d.origin ? `${d.origin}${filled(d.originNote) ? " · " + d.originNote.trim() : ""}` : DASH}</PvRow>
        <PvText label="Descrizione" text={d.desc} />
        {filled(d.acquire) && <PvText label="Per gli Immortali" text={d.acquire} />}
        <PvSec label="Talenti razziali" />
        {traits.length ? traits.map((t, i) => <PvText key={i} label={t.name.trim()} text={t.effect} n={32} />) : <PvRow label="Talenti">{DASH}</PvRow>}
        <PvSec label="Statistiche" />
        <PvRow label="Bonus razziali">{mods.length ? mods.map(([k, v]) => `${k} ${signed(v)}`).join(" · ") : "nessuno"}</PvRow>
        <PvSec label="PG di livello 1" />
        {((c.level1 ?? []) as Draft[]).map((r) => {
          const delta = r.value - r.human;
          return <PvRow key={r.key} label={r.label} tip={[r.formula, `= ${r.explain}`, `Umano: ${fmtDer(r.human, r.fmt)}`]}>
            <span className="num">{fmtDer(r.value, r.fmt)}</span>{Math.abs(delta) > 1e-9 && <span className={`xs ${delta > 0 ? "" : "muted"}`}> ({delta > 0 ? "+" : "−"}{fmtDer(Math.abs(delta), r.fmt)})</span>}
          </PvRow>;
        })}
        <PvSec label="Vita e rapporti" />
        <PvText label="Lingue" text={d.langs} />
        <PvRow label="Durata della vita">{Number(d.life) >= 1 ? <><span className="num">{ni(d.life)}</span> anni</> : DASH}</PvRow>
        {(d.rel as Draft[]).filter((r) => filled(r.race)).map((r, i) => <PvRow key={i} label={r.race.trim()}>{r.rel}</PvRow>)}
      </PvWin>
    );
  },
};

/* =====================================================================
   4. TITOLO
   ===================================================================== */
const DEC_EVO = "quando un PG ottiene l'evoluzione, il titolo precedente viene sostituito e i suoi bonus tolti (l'evoluzione di solito dà di più).";

const titolo: WizardDef = {
  id: "titolo", kind: "titles", group: "Personaggi", title: "Titolo",
  desc: "Titolo con rarità, bonus, effetto, requisiti, segreti, incompatibilità ed evoluzione (che sostituisce il precedente).",
  heading: "Nuovo titolo",
  intro: "Struttura di un titolo: nome, rarità, effetti (bonus, attiva, passiva, stat sbloccate) e requisiti: azione, contesto, testimoni (Sistema Status Sociale, Sezione 1).",
  fresh: () => ({ name: "", rarity: "Comune", how: "", bonus: [{ code: "STR", val: "" }], effType: "nessuno", effText: "", unlocks: "",
    trigger: "", context: "", witnesses: "", secret: false, reveal: "", incompat: [], incompatFree: "", prev: "", next: "", evoCond: "", charId: "" }),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome evocativo" req max={50} ph="es. Ammazzadraghi" />
      <Picks path="rarity" label="Rarità" opts={x.meta.rarities.map((r) => ({ v: r.name, l: r.name, rarity: r.name }))} />
      <Ref>{x.meta.title_acq[x.d.rarity] ? `Rarità ${x.d.rarity}: ${x.meta.title_acq[x.d.rarity]}.` : `La tabella dei titoli non descrive il grado ${x.d.rarity}: sta tra Epico e Leggendario nella scala unica.`}</Ref>
      <TextF path="how" label="Come si ottiene" req area rows={2} ph="es. Uccidere da solo un drago di oltre 300 anni" />
    </> },
    { render: (x) => <>
      <GroupF label="Bonus alle statistiche">
        <Lines what="il bonus" items={x.d.bonus as Draft[]} onRemove={(i) => x.upd((d) => { d.bonus.splice(i, 1); })} render={(_, i) => <>
          <SelF path={`bonus.${i}.code`} label="Statistica" cls="wz-grow" opts={[...statOpts(x.meta), { v: "ALL", l: "Tutte le base (STR, DEX, VIT, INT)" }]} />
          <NumF path={`bonus.${i}.val`} label="Valore" cls="wz-narrow" min={-999} max={999} ph="+5" />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.bonus.push({ code: "STR", val: "" }); })}>＋ Aggiungi bonus</button></div>
        <span className="hint">I bonus finiscono nella colonna «Titoli» delle statistiche del PG. {x.meta.title_examples[x.d.rarity] ? `Esempio ${x.d.rarity} dal regolamento: ${x.meta.title_examples[x.d.rarity]}.` : ""}</span>
      </GroupF>
      <Picks path="effType" label="Effetto speciale" opts={[{ v: "nessuno", l: "Nessuno" }, { v: "passivo", l: "Passivo" }, { v: "attivo", l: "Attivo" }]} />
      {x.d.effType !== "nessuno" && <TextF path="effText" label={x.d.effType === "attivo" ? "Effetto attivo (costo, durata, ricarica)" : "Effetto passivo"} req area rows={2}
        ph={x.d.effType === "attivo" ? "es. Invulnerabile per 10 secondi, una volta al giorno" : "es. +5% critici contro umanoidi"} />}
      <TextF path="unlocks" label="Statistiche sbloccate (facoltativo)" ph="es. Autorità" />
    </> },
    { render: (x) => {
      const others = ((x.c.known ?? x.meta.known_titles) as { name: string; rarity: string }[]).filter((t) => t.name !== String(x.d.name).trim());
      return <>
        <TextF path="trigger" label="Azione scatenante" req area rows={2} ph="es. Infliggere il colpo di grazia a un drago" />
        <div className="wz-grid2"><TextF path="context" label="Contesto" ph="es. Combattendo da solo" /><TextF path="witnesses" label="Testimoni" ph="es. Almeno un PNG sopravvissuto" /></div>
        <CheckF path="secret" label="Titolo segreto" hint="I titoli segreti si rivelano solo in momenti specifici." />
        {x.d.secret && <TextF path="reveal" label="Quando si rivela" req ph="es. Al cospetto di un drago antico" />}
        {others.length > 0 && <Picks path="incompat" label="Incompatibile con" multi opts={others.map((t) => ({ v: t.name, l: t.name, rarity: t.rarity }))} cls="wz-scroll" />}
        <TextF path="incompatFree" label={others.length ? "Altri titoli incompatibili" : "Titoli incompatibili"} ph="separati da virgola, es. Santo, Signore delle Tenebre"
          hint="Regola: titoli contraddittori non coesistono («Santo» e «Signore delle Tenebre»)." />
      </>;
    } },
    { render: (x) => {
      const known = (x.c.known ?? x.meta.known_titles) as { name: string; rarity: string }[];
      const opts = [{ v: "", l: "Nessuno" }, ...known.filter((t) => t.name !== String(x.d.name).trim()).map((t) => ({ v: t.name, l: `${t.name} · ${t.rarity}` }))];
      return <>
        <Ref>Esempio dal regolamento: «Ammazzadraghi» → «Flagello dei Draghi» dopo 10+ draghi.</Ref>
        <div className="wz-grid2"><SelF path="prev" label="Evolve da (precedente)" opts={opts} after={<Decided why={DEC_EVO} />} /><SelF path="next" label="Evolve in (successivo)" opts={opts} /></div>
        {x.d.next && <TextF path="evoCond" label="Condizione per evolvere" req ph="es. Uccidere 10 draghi" />}
        {x.d.prev && <Ref>Al PG che ha «{x.d.prev}» questo titolo lo sostituisce: i bonus del precedente vengono tolti.</Ref>}
      </>;
    } },
    { render: (x) => <>
      <SelF path="charId" label="Assegna a un PG (facoltativo)" opts={charOpts(x.meta)} hint="Il titolo entra tra i Titoli del PG e i bonus si sommano alla colonna «Titoli» delle statistiche." />
      <Ref>Le statistiche che il PG non ha (es. FIN su chi non l'ha sbloccata) restano fuori: l'anteprima le segnala.</Ref>
    </> },
  ],
  preview: ({ d, c, meta }) => {
    const bonus = (c.bonus ?? {}) as Record<string, number>;
    const rows = (d.bonus as Draft[]).filter((b) => Number(b.val));
    const inc = (c.incompat ?? []) as string[];
    const a = c.assign as Draft | null | undefined;
    return (
      <PvWin tag="TITOLO" head={<><NameOr s={d.name} ph="Titolo senza nome" /> <RarityChip rarity={d.rarity} /></>}>
        <PvText label="Acquisizione" text={d.how} />
        <PvSec label="Effetti" />
        <PvRow label="Bonus" tip={Object.entries(bonus).map(([k, v]) => `${k} ${signed(v)}`)}>
          {rows.length ? rows.map((b) => `${b.code === "ALL" ? "Tutte" : b.code} ${signed(b.val)}`).join(" · ") : DASH}</PvRow>
        {d.effType !== "nessuno" && <PvText label={d.effType === "attivo" ? "Attivo" : "Passivo"} text={d.effText} />}
        {filled(d.unlocks) && <PvText label="Sblocca" text={d.unlocks} />}
        <PvSec label="Requisiti" />
        <PvText label="Azione" text={d.trigger} />
        {filled(d.context) && <PvText label="Contesto" text={d.context} />}
        {filled(d.witnesses) && <PvText label="Testimoni" text={d.witnesses} />}
        <PvRow label="Segreto" tip={d.secret && filled(d.reveal) ? `Si rivela: ${d.reveal.trim()}` : undefined}>{d.secret ? <span className="chip gold">Sì</span> : "No"}</PvRow>
        <PvRow label="Incompatibile" tip={inc}>{inc.length ? `${inc.length} titol${inc.length === 1 ? "o" : "i"}` : DASH}</PvRow>
        <PvSec label="Evoluzione" />
        <PvRow label="Catena" tip={d.next && filled(d.evoCond) ? `Evolve quando: ${d.evoCond.trim()}` : undefined}>
          {d.prev ? `${d.prev} → ` : ""}<b><NameOr s={d.name} ph="questo" /></b>{d.next ? ` → ${d.next}` : ""}</PvRow>
        {a && <>
          <PvSec label="Assegnazione" />
          <PvRow label="PG">{charName(meta, d.charId)}</PvRow>
          {a.replaces && <PvRow label="Sostituisce" tip="Il titolo precedente lascia il posto all'evoluzione e i suoi bonus vengono tolti.">{a.replaces}</PvRow>}
          {a.clash && <PvRow label="Blocco" tip={a.clash}><span className="chip bad">incompatibile</span></PvRow>}
          {(a.lines as Draft[]).length ? (a.lines as Draft[]).map((l) => l.missing
            ? <PvRow key={l.code} label={`Titoli ${l.code}`} tip={`Il PG non ha la statistica ${l.code}: il bonus non si applica.`}><span className="chip warn">non presente</span></PvRow>
            : <PvRow key={l.code} label={`Titoli ${l.code}`} tip={[`Colonna Titoli di ${l.code}: ${ni(l.before)} ${l.delta >= 0 ? "+" : "−"} ${ni(Math.abs(l.delta))}`, `Totale ${l.code}: ${ni(l.total_before)} → ${ni(l.total_after)}`]}>
                <span className="num">{ni(l.before)} → <b>{ni(l.after)}</b></span></PvRow>)
            : <PvRow label="Statistiche">nessuna variazione</PvRow>}
        </>}
      </PvWin>
    );
  },
};

export const PG_WIZARDS = [skill, classe, razza, titolo];
