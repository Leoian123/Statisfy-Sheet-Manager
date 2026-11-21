/* Forgia · Oggetto: oggetto dell'inventario MMORPG (tipo → slot, bonus a statistiche e derivate, requisiti, peso).
   Assegnato a un PG finisce nella sua borsa, da equipaggiare dalla scheda. */
import type { Draft } from "../api/forge";
import { DASH, Decided, Lines, NameOr, NumF, Picks, PvRow, PvSec, PvText, PvWin, RarityChip, Ref, SelF, TextF, charOpts, ni, signed, type WizardDef, GroupF } from "./engine";

const TYPES = ["Arma", "Armatura", "Scudo", "Accessorio", "Pozione", "Cibo", "Pergamena", "Materiale", "Strumento", "Libro", "Oggetto quest"];
const DEC_REQ = "requisiti di livello e statistiche: se non sono soddisfatti l'oggetto non si equipaggia.";
const DEC_BONUS = "bonus alle statistiche nella colonna «Oggetti»; Difesa, Difesa magica e Blocco entrano nelle formule, gli altri bonus si sommano dopo la formula.";

export const oggetto: WizardDef = {
  id: "oggetto", kind: "items", group: "Personaggi", title: "Oggetto",
  desc: "Arma, armatura, accessorio o consumabile: slot, bonus, requisiti e peso. Va nella borsa del PG.",
  heading: "Nuovo oggetto",
  intro: "Il tipo di equipaggiamento decide gli slot (come in World of Warcraft); senza tipo l'oggetto resta nella borsa (consumabili, materiali, oggetti quest).",
  fresh: () => ({ name: "", rarity: "Comune", type: "Arma", equip_type: "unaMano", weapon_base: "", stats: [], bonus: [],
    reqLevel: "", req: [], weight: 1, qty: 1, stats_text: "", desc: "", charId: "" }),
  steps: [
    { render: (x) => <>
      <TextF path="name" label="Nome" req max={60} ph="es. Lama del Gelo" />
      <Picks path="rarity" label="Rarità" opts={x.meta.rarities.map((r) => ({ v: r.name, l: r.name, rarity: r.name }))} />
      <div className="wz-grid2">
        <TextF path="type" label="Tipo" req list="wz-item-types" hint="Arma, Armatura, Pozione, Materiale…" />
        <SelF path="equip_type" label="Si equipaggia come" opts={[{ v: "", l: "Non equipaggiabile (resta nella borsa)" }, ...x.meta.equip_types.map((t) => ({ v: t.key, l: `${t.label} · ${t.slots.join(" o ")}` }))]} />
      </div>
      <datalist id="wz-item-types">{TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <TextF path="desc" label="Descrizione (facoltativa)" area rows={2} />
    </> },
    { render: (x) => <>
      {x.d.equip_type && ["unaMano", "manoPrincipale", "dueMani"].includes(x.d.equip_type) &&
        <NumF path="weapon_base" label="Base danno dell'arma" min={0} hint={`Scala di rarità: ${x.d.rarity} ${x.c.weapon_range ?? ""}.`} />}
      <GroupF label={<>Bonus alle statistiche <Decided why={DEC_BONUS} /></>}>
        <Lines what="la statistica" items={x.d.stats as Draft[]} onRemove={(i) => x.upd((d) => { d.stats.splice(i, 1); })} render={(_, i) => <>
          <SelF path={`stats.${i}.code`} label="Statistica" cls="wz-grow" opts={x.meta.stat_codes} />
          <NumF path={`stats.${i}.val`} label="Valore" cls="wz-narrow" ph="+5" />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.stats.push({ code: "STR", val: "" }); })}>＋ Statistica</button></div>
      </GroupF>
      <GroupF label="Bonus ai valori derivati">
        <Lines what="il bonus" items={x.d.bonus as Draft[]} onRemove={(i) => x.upd((d) => { d.bonus.splice(i, 1); })} render={(_, i) => <>
          <SelF path={`bonus.${i}.key`} label="Valore" cls="wz-grow" opts={x.meta.item_bonus} />
          <NumF path={`bonus.${i}.val`} label="Bonus" cls="wz-narrow" step={0.5} ph="+3" />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.bonus.push({ key: "difesa", val: "" }); })}>＋ Bonus</button></div>
      </GroupF>
      <TextF path="stats_text" label="Testo breve (facoltativo)" ph={x.c.item?.stats_text || "si compone da solo dai bonus"} hint="Lascialo vuoto: la Forgia lo scrive dai bonus." />
    </> },
    { render: (x) => <>
      <GroupF label={<>Requisiti <Decided why={DEC_REQ} /></>}>
        <NumF path="reqLevel" label="Livello minimo (facoltativo)" min={1} max={999} />
        <Lines what="il requisito" items={x.d.req as Draft[]} onRemove={(i) => x.upd((d) => { d.req.splice(i, 1); })} render={(_, i) => <>
          <SelF path={`req.${i}.code`} label="Statistica" cls="wz-grow" opts={x.meta.stat_codes} />
          <NumF path={`req.${i}.val`} label="Almeno" cls="wz-narrow" min={1} />
        </>} />
        <div className="row"><button type="button" className="btn" onClick={() => x.upd((d) => { d.req.push({ code: "STR", val: "" }); })}>＋ Requisito</button></div>
      </GroupF>
      <div className="wz-grid2">
        <NumF path="weight" label="Peso (kg)" min={0} step={0.1} />
        <NumF path="qty" label="Quantità" min={1} />
      </div>
      <Ref>L'inventario non ha limiti di caselle: conta solo il peso rispetto al Carico massimo.</Ref>
    </> },
    { render: (x) => <>
      <SelF path="charId" label="Dai a un PG (facoltativo)" opts={charOpts(x.meta)} hint="Finisce nella borsa del PG; si equipaggia dalla scheda, se i requisiti sono soddisfatti." />
      {x.c.char && (x.c.unmet ?? []).length > 0 && <div className="sysmsg"><span className="tag">[REQUISITI]</span><span>{x.c.char.name} non può ancora equipaggiarlo: {x.c.unmet.join(", ")}.</span></div>}
      <Ref>L'oggetto entra comunque nella libreria: lo puoi dare ad altri PG dalla Plancia di comando.</Ref>
    </> },
  ],
  preview: (x) => {
    const { d, c } = x;
    const it = (c.item ?? {}) as Draft;
    const stats = Object.entries((it.stats ?? {}) as Record<string, number>);
    const bonus = Object.entries((it.bonus ?? {}) as Record<string, number>);
    const req = Object.entries((it.req ?? {}) as Record<string, number>);
    return (
      <PvWin tag="OGGETTO" head={<><NameOr s={d.name} ph="Oggetto senza nome" /> <RarityChip rarity={d.rarity} /></>}>
        <PvRow label="Tipo">{d.type || DASH}</PvRow>
        <PvRow label="Slot" tip={c.two_handed ? "Due mani: occupa la mano principale e blocca la secondaria." : undefined}>{(c.slots ?? []).length ? c.slots.join(" o ") : "borsa"}</PvRow>
        <PvRow label="Categoria">{c.category || DASH}</PvRow>
        {it.weapon_base ? <PvRow label="Base danno" tip={`Scala ${d.rarity}: ${c.weapon_range}`}><span className="num">{ni(it.weapon_base)}</span></PvRow> : null}
        <PvSec label="Bonus" />
        {stats.length || bonus.length
          ? <>{stats.map(([k, v]) => <PvRow key={k} label={k}><span className="num">{signed(v)}</span></PvRow>)}
              {bonus.map(([k, v]) => <PvRow key={k} label={x.meta.item_bonus.find((o) => o.v === k)?.l ?? k}><span className="num">{signed(v)}</span></PvRow>)}</>
          : <PvRow label="Bonus">{DASH}</PvRow>}
        <PvText label="Testo" text={it.stats_text} />
        <PvSec label="Requisiti e peso" />
        <PvRow label="Requisiti" tip={c.char ? (c.unmet?.length ? `${c.char.name} non soddisfa: ${c.unmet.join(", ")}` : `${c.char.name} li soddisfa.`) : undefined}>
          {req.length ? req.map(([k, v]) => (k === "level" ? `Lv ${v}` : `${k} ${v}`)).join(" · ") : "nessuno"}</PvRow>
        <PvRow label="Peso · quantità"><span className="num">{d.weight || 0} kg · ×{d.qty || 1}</span></PvRow>
        <PvRow label="Assegnato a">{c.char?.name ?? DASH}</PvRow>
      </PvWin>
    );
  },
};
