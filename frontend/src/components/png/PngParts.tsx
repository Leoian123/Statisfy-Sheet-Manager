/* Sezione PNG: pezzi condivisi fra la pagina Mondo → PNG e il wizard PNG della Forgia.
   Ogni valore composto porta lo strato che l'ha deciso; file, riga e FONTE/PROPOSTA stanno nel tooltip. */
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { errorText } from "../../api/client";
import { pngApi, type Campo, type Catalogo, type Combattimento, type Composizione, type Immagine, type Ritratto, type Scheda, type Strati } from "../../api/png";
import {
  ATT_LABEL, ATT_TONE, ATTEGGIAMENTI, RITRATTO_LATO, RITRATTO_MAX, RITRATTO_QUALITA, SETTE, SETTE_HELP, SETTE_LABEL, aggiungiImmagine,
  iniziali, maiuscola, misureRidotte, nomeStrato, parola, principale, ritrattoPrincipale, togliImmagine, tipoNota, tonoStrato,
} from "../../lib/png";
import { TipRow } from "../TipRow";
import "../../styles/png.css";

/* ---------------- catalogo (una lettura per sessione) ---------------- */
let catalogoCache: Promise<Catalogo> | null = null;
export function useCatalogo(): { cat: Catalogo | null; err: string | null } {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    catalogoCache ??= pngApi.catalogo().catch((e) => { catalogoCache = null; throw e; });
    catalogoCache.then((c) => alive && setCat(c)).catch((e) => alive && setErr(errorText(e)));
    return () => { alive = false; };
  }, []);
  return { cat, err };
}

/* ---------------- chip dello strato con tooltip ---------------- */
export function tipCampo(c: Pick<Campo, "da" | "dove" | "nota">): ReactNode {
  const t = tipoNota(c.nota);
  return (
    <>
      <span>Deciso da: <b>{c.da}</b></span>
      {c.dove && <span className="mono">{c.dove}</span>}
      {c.nota && <span className={t === "proposta" ? "warn-t" : t === "fonte" ? "good-t" : ""}>{c.nota}</span>}
    </>
  );
}
export const StratoChip = ({ da }: { da: string }) => <span className={`chip png-strato ${tonoStrato(da)}`}>{nomeStrato(da)}</span>;

function fmt(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length === 2 && typeof v[0] === "number" ? (v[0] === v[1] ? String(v[0]) : `${v[0]}–${v[1]}`) : v.join(", ");
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${x}`).join(", ");
  if (v === true) return "sì";
  return parola(String(v));
}

/** Riga compatta: etichetta, valore, chip dello strato; file, riga e nota nel tooltip. */
export function RigaCampo({ label, campo, children }: { label: string; campo: Campo | undefined; children?: ReactNode }) {
  if (!campo) return null;
  return (
    <TipRow className="png-r" tip={tipCampo(campo)}>
      <span className="png-k">{label}</span>
      <span className="png-v">{children ?? fmt(campo.valore)}</span>
      <StratoChip da={campo.da} />
    </TipRow>
  );
}

/* ---------------- strati ---------------- */
interface StratiProps { value: Strati; onChange: (s: Strati) => void; cat: Catalogo; idp?: string }

/** Ruolo, età, razza, luogo (zona, oppure regno e insediamento) e ritocchi liberi. */
export function StratiForm({ value, onChange, cat, idp }: StratiProps) {
  const auto = useId();
  const id = idp ?? auto;
  const [riga, setRiga] = useState("");
  const set = (k: keyof Strati, v: string) => onChange({ ...value, [k]: v });
  const zona = cat.zone.find((z) => z.nome === value.zona);
  function aggiungi() {
    const t = riga.trim();
    if (!t || value.ritocchi.includes(t) || value.ritocchi.length >= 20) return;
    onChange({ ...value, ritocchi: [...value.ritocchi, t.slice(0, 120)] });
    setRiga("");
  }
  const sel = (k: "ruolo" | "eta" | "razza", label: string, opts: { nome: string; descrizione: string | null }[]) => (
    <label className="png-f">
      <span className="label">{label}</span>
      <select className="input" id={`${id}-${k}`} value={value[k]} onChange={(e) => set(k, e.target.value)}>
        {opts.map((o) => <option key={o.nome} value={o.nome} title={o.descrizione ?? undefined}>{maiuscola(parola(o.nome))}</option>)}
      </select>
    </label>
  );
  return (
    <div className="png-strati">
      <div className="png-grid">
        {sel("ruolo", "Ruolo", cat.ruoli)}
        {sel("eta", "Età", cat.eta)}
        {sel("razza", "Razza", cat.razze)}
        <label className="png-f">
          <span className="label">Zona</span>
          <select className="input" value={value.zona ?? ""} onChange={(e) => {
            const z = cat.zone.find((x) => x.nome === e.target.value);
            onChange({ ...value, zona: e.target.value, regno: z ? "" : value.regno || "valeria", insediamento: z ? "" : value.insediamento || "villaggio" });
          }}>
            {cat.zone.map((z) => <option key={z.nome} value={z.nome}>{z.titolo ?? z.nome}</option>)}
            <option value="">Nessuna: scelgo regno e taglia</option>
          </select>
        </label>
        <label className="png-f">
          <span className="label">Regno</span>
          <select className="input" disabled={!!zona} value={zona ? zona.regno : value.regno ?? ""} onChange={(e) => set("regno", e.target.value)}>
            {cat.regni.map((r) => <option key={r.nome} value={r.nome}>{r.titolo ?? r.nome}</option>)}
          </select>
        </label>
        <label className="png-f">
          <span className="label">Insediamento</span>
          <select className="input" disabled={!!zona} value={zona ? zona.insediamento : value.insediamento ?? ""} onChange={(e) => set("insediamento", e.target.value)}>
            {cat.insediamenti.map((r) => <option key={r} value={r}>{r === "citta" ? "Città" : maiuscola(r)}</option>)}
          </select>
        </label>
      </div>
      <div className="png-f">
        <label className="label" htmlFor={`${id}-rit`}>Ritocchi</label>
        <div className="png-ritocchi">
          {value.ritocchi.map((r) => (
            <span key={r} className="chip gold png-rit">{r}
              <button type="button" aria-label={`Togli il ritocco ${r}`} onClick={() => onChange({ ...value, ritocchi: value.ritocchi.filter((x) => x !== r) })}>×</button>
            </span>
          ))}
          <input className="input" id={`${id}-rit`} value={riga} maxLength={120} placeholder="«ex soldato», «livello 61», «STR alta»…"
            onChange={(e) => setRiga(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungi(); } }}
            onBlur={aggiungi} />
        </div>
        <span className="hint">Un ritocco vince su ogni strato. «livello N», «anni N», «STR alta», «grado VII» fissano un valore; ogni altra riga vale come motivo.</span>
      </div>
    </div>
  );
}

/* ---------------- composizione ---------------- */
const CAMPI_VISTI: [string, string][] = [
  ["livello", "Fascia di livello"], ["anni", "Anni"], ["corporatura", "Corporatura"], ["addestramento", "Addestramento"],
  ["profilo.STR", "STR"], ["profilo.DEX", "DEX"], ["profilo.VIT", "VIT"], ["profilo.INT", "INT"],
  ["mestiere.nome", "Mestiere"], ["mestiere.grado", "Grado"], ["ricchezza", "Ricchezza"], ["conta", "Conta nel gruppo"],
  ["affinita_iniziale", "Affinità iniziale"], ["longevita", "Longevità"], ["giornata", "Giornata"], ["compito", "Compito"],
];
const ELENCHI_VISTI: [string, string][] = [
  ["vuole", "Vuole"], ["teme", "Teme"], ["difetto", "Difetto"], ["forestieri", "Forestieri"], ["prezzo", "Prezzo"], ["vita", "In questi giorni"],
  ["tratti", "Tratti"], ["puo_dare", "Può dare"], ["no_tipici", "Motivi per dire no"], ["malizia", "Malizia"], ["sa", "Sa"], ["segni", "Segni"],
];

export function AttBar({ f }: { f: Record<string, number> }) {
  return (
    <div className="png-att" role="img" aria-label={ATTEGGIAMENTI.map((a) => `${ATT_LABEL[a]} ${f[a] ?? 0}%`).join(", ")}>
      {ATTEGGIAMENTI.map((a) => (f[a] ?? 0) > 0 && (
        <span key={a} className={`png-att-${ATT_TONE[a]}`} style={{ flexGrow: f[a] }} title={`${ATT_LABEL[a]}: ${f[a]}%`}><b>{f[a]}</b></span>
      ))}
    </div>
  );
}

export function ComposizioneView({ c }: { c: Composizione }) {
  return (
    <div className="png-comp">
      <div className="png-f">
        <span className="label">Primo contatto (Taratura §3)</span>
        <AttBar f={c.atteggiamento.frequenze} />
        <span className="hint">{ATTEGGIAMENTI.map((a) => `${ATT_LABEL[a]} ${c.atteggiamento.frequenze[a]}%`).join(" · ")}</span>
      </div>
      <div className="png-rows scroll-y" style={{ ["--scroll-max" as string]: "300px" }}>
        {CAMPI_VISTI.map(([k, l]) => c.campi[k] && c.campi[k].valore != null && (
          <RigaCampo key={k} label={l} campo={c.campi[k]}>
            {k === "mestiere.grado" && Array.isArray(c.campi[k].valore) ? (c.campi[k].valore as string[]).join("–") : undefined}
          </RigaCampo>
        ))}
        {ELENCHI_VISTI.map(([k, l]) => c.elenchi[k]?.length ? (
          <details key={k} className="png-el">
            <summary><span className="png-k">{l}</span><span className="png-v muted">{c.elenchi[k].length} voci</span></summary>
            <ul>{c.elenchi[k].map((v) => (
              <li key={v.voce}><TipRow className="png-r" tip={tipCampo(v)}><span className="png-v">{v.voce}</span><StratoChip da={v.da} /></TipRow></li>
            ))}</ul>
          </details>
        ) : null)}
      </div>
    </div>
  );
}

export function Avvisi({ errori = [], avvisi = [] }: { errori?: string[]; avvisi?: string[] }) {
  if (!errori.length && !avvisi.length) return <p className="hint good">Nessun errore, nessun avviso.</p>;
  return (
    <ul className="png-avvisi">
      {errori.map((e) => <li key={`e${e}`} className="bad-t" role="alert">{e}</li>)}
      {avvisi.map((a) => <li key={`a${a}`} className="warn-t">{a}</li>)}
    </ul>
  );
}

/* ---------------- avatar ---------------- */
export function Avatar({ nome, scheda, size = 40 }: { nome: string; scheda?: Pick<Scheda, "ritratto"> | null; size?: number }) {
  const img = ritrattoPrincipale(scheda);
  return (
    <span className="png-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {img ? <img src={img.src} alt="" /> : iniziali(nome)}
    </span>
  );
}

/* ---------------- scheda semplificata ---------------- */
interface SchedaProps {
  s: Scheda;
  /** Campi scritti a mano (bozza): se c'è, i sette campi diventano modificabili. */
  campi?: Record<string, string>;
  onCampo?: (k: string, v: string) => void;
  combattimento?: Combattimento | null;
  onCombattimento?: () => void;
  partita?: string;
}

const PROFILO = ["STR", "DEX", "VIT", "INT"] as const;

export function SchedaView({ s, campi, onCampo, combattimento, onCombattimento, partita }: SchedaProps) {
  const o = s.origine ?? {};
  const riga = (label: string, v: ReactNode, tip?: string) => tip
    ? <TipRow key={label} className="png-r" tip={<span>{tip}</span>}><span className="png-k">{label}</span><span className="png-v">{v}</span></TipRow>
    : <div key={label} className="png-r"><span className="png-k">{label}</span><span className="png-v">{v}</span></div>;
  const sette = [...SETTE, ...("perche_qui" in s ? ["perche_qui"] : [])];
  const stato = partita ? s.stato?.[partita] : Object.values(s.stato ?? {})[0];
  return (
    <div className="png-scheda">
      <section className="png-sec">
        <span className="label">Chi è</span>
        {riga("Livello", <span className="num">{s.livello}</span>, o.livello && `Livello da ${o.livello}`)}
        {riga("Ruolo", <>{maiuscola(parola(s.ruolo))}{s.mestiere?.nome && <span className="muted"> · {s.mestiere.nome}{s.mestiere.grado ? ` ${s.mestiere.grado}` : ""}</span>}</>, o.mestiere)}
        {riga("Razza", maiuscola(parola(s.razza)))}
        {riga("Età", <>{s.eta.apparente ?? "—"} anni{s.eta.vera && s.eta.vera !== s.eta.apparente ? <span className="muted"> (veri {s.eta.vera})</span> : null} · {s.eta.fase}</>, o.anni && `Anni da ${o.anni}`)}
        {riga("Luogo", s.luogo)}
        {riga("Conta", s.conta, o.conta && `Da ${o.conta} (Status Sociale §3)`)}
        {riga("Tratti", s.tratti.join(", ") || "—", o.tratti)}
        {s.motivo && riga("Motivo", s.motivo, "Dal ritocco: giustifica un livello nel terzo alto o una variante che dice di no")}
      </section>
      <section className="png-sec">
        <span className="label">I sette campi {onCampo && <span className="hint">· tratteggiati: spunti pescati, da riscrivere sulla persona</span>}</span>
        {sette.map((k) => {
          const pescato = (s as unknown as Record<string, string | null>)[k];
          const scritto = campi?.[k] ?? "";
          const daRiscrivere = (s.da_ritoccare ?? []).includes(k);
          if (!onCampo) return riga(SETTE_LABEL[k], pescato || <span className="muted">—</span>, o[k] ? `${o[k]}. ${SETTE_HELP[k] ?? ""}` : SETTE_HELP[k]);
          return (
            <label key={k} className="png-sette">
              <span className="png-k" title={SETTE_HELP[k]}>{SETTE_LABEL[k]}{o[k] && <small className="muted">{o[k]}</small>}</span>
              <textarea className={`input${daRiscrivere && !scritto ? " png-spunto" : ""}`} rows={k === "contraddizione" ? 2 : 1} maxLength={300}
                value={scritto} placeholder={pescato || (k === "contraddizione" ? s.contraddizione_spunto ?? "" : "")}
                onChange={(e) => onCampo(k, e.target.value)} />
            </label>
          );
        })}
      </section>
      <section className="png-sec">
        <span className="label">Come parla, che cosa sa e che cosa può dare</span>
        {riga("Voce", s.voce, o.voce)}
        {riga("Sa", s.sa.join("; ") || "—")}
        {riga("Dicerie", s.dicerie.join("; ") || "—", "Per sentito dire, anche sbagliato")}
        {riga("Può dare", s.puo_dare.join("; ") || "—")}
        {riga("Dice di no se", s.no_tipici.join("; ") || "—", "Motivi tipici, da Taratura §5")}
        {s.segni.length > 0 && riga("Segni", s.segni.join("; "))}
        {s.limiti.length > 0 && riga("Limiti", s.limiti.join("; "))}
      </section>
      <section className="png-sec">
        <span className="label">Numeri: solo gli ingressi</span>
        <div className="png-profilo">
          {PROFILO.map((k) => <span key={k} className={`png-st ${s.profilo[k]}`}><small>{k}</small>{s.profilo[k]}</span>)}
        </div>
        {riga("Corporatura", s.corporatura, o.corporatura)}
        {riga("Addestramento", s.addestramento, o.addestramento)}
        {riga("Ricchezza", s.ricchezza)}
        <CombattimentoView b={combattimento ?? null} onCalcola={onCombattimento} />
      </section>
      {stato && (
        <section className="png-sec">
          <span className="label">Stato per partita</span>
          {riga("Affinità", <span className="num">{stato.affinita > 0 ? `+${stato.affinita}` : stato.affinita}</span>, "Scala −10/+10 di Status Sociale §3")}
          {riga("Primo contatto", stato.atteggiamento_iniziale ? ATT_LABEL[stato.atteggiamento_iniziale] : "—")}
          {riga("Vivo", stato.vivo ? "sì" : `no${stato.morte ? ` · ${stato.morte.causa}` : ""}`)}
          {stato.memoria.length > 0 && riga("Memoria", stato.memoria.map((m) => m.testo).join("; "))}
          {stato.legami.length > 0 && riga("Legami", stato.legami.map((m) => m.testo).join("; "))}
        </section>
      )}
    </div>
  );
}

export function CombattimentoView({ b, onCalcola }: { b: Combattimento | null; onCalcola?: () => void }) {
  if (!b) return onCalcola ? <button type="button" className="btn png-calc" onClick={onCalcola}>Calcola combattimento</button> : null;
  if (!b.combatte) return <p className="small muted png-nocomb">{b.nota}</p>;
  return (
    <div className="png-comb">
      <TipRow className="kv" tip={<><span>{b.formula_vita}</span><span>Combat.txt, creature di rarità {b.rarita} · taglia {b.taglia}</span></>}>
        <span className="label">Vita</span><span className="v">{(b.vita ?? 0).toLocaleString("it-IT")}</span>
      </TipRow>
      <TipRow className="kv" tip={<span>{b.formula_danno}</span>}>
        <span className="label">Danno base</span><span className="v">{(b.danno ?? 0).toLocaleString("it-IT")}</span>
      </TipRow>
      <div className="kv"><span className="label">Rango</span><span className="v small">{b.rango}</span></div>
      {b.abilita && <p className="xs muted">Veterano: {b.abilita.join("–")} abilità a scelta del narratore.</p>}
      <p className="xs muted png-span">Calcolato al momento con il modello «{b.modello}», mai salvato.</p>
    </div>
  );
}

/* ---------------- ritratto e immagini ---------------- */
async function riduci(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.type)) throw new Error("Serve un'immagine (JPEG, PNG, WebP).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Immagine non leggibile."));
      i.src = url;
    });
    const { w, h } = misureRidotte(img.naturalWidth, img.naturalHeight, RITRATTO_LATO);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(img, 0, 0, w, h);
    let out = c.toDataURL("image/webp", RITRATTO_QUALITA);
    if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", RITRATTO_QUALITA);
    if (out.length > 300_000) out = c.toDataURL("image/jpeg", 0.6);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface RitrattoProps { r: Ritratto; nome: string; onChange: (r: Ritratto) => void; busy?: boolean; nota?: ReactNode }

/** Ritratto, galleria, descrizione da usare in un generatore esterno e anteprima del gettone per la plancia. */
export function RitrattoPanel({ r, nome, onChange, busy, nota }: RitrattoProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copiato, setCopiato] = useState(false);
  const p = ritrattoPrincipale({ ritratto: r });
  async function carica(files: FileList | null) {
    setErr(null);
    let imm: Immagine[] = r.immagini;
    for (const f of Array.from(files ?? []).slice(0, RITRATTO_MAX)) {
      try {
        imm = aggiungiImmagine(imm, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, src: await riduci(f), principale: false });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
    if (imm !== r.immagini) onChange({ ...r, immagini: imm });
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void carica(e.dataTransfer.files);
  }
  async function copia() {
    try { await navigator.clipboard.writeText(r.descrizione); setCopiato(true); window.setTimeout(() => setCopiato(false), 1500); }
    catch { setErr("Copia non riuscita: seleziona il testo a mano."); }
  }
  return (
    <div className="png-ritratto">
      <div className="png-rit-main">
        <button type="button" className={`png-drop${over ? " over" : ""}`} disabled={busy} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
          aria-describedby={`${id}-h`}>
          {p ? <img src={p.src} alt={`Ritratto di ${nome}`} /> : <span className="png-drop-t"><b>Trascina qui un'immagine</b><span className="xs muted">o fai clic per sceglierla</span></span>}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { void carica(e.target.files); e.target.value = ""; }} />
        <span className="hint" id={`${id}-h`}>Ridotta nel browser a {RITRATTO_LATO} px prima di salvarla; al più {RITRATTO_MAX} immagini.</span>
        {r.immagini.length > 0 && (
          <ul className="png-gal" aria-label="Galleria">
            {r.immagini.map((i) => (
              <li key={i.id} className={i.principale ? "on" : ""}>
                <img src={i.src} alt="" />
                <div className="png-gal-a">
                  <button type="button" className="btn xs" disabled={busy || i.principale} onClick={() => onChange({ ...r, immagini: principale(r.immagini, i.id) })}>
                    {i.principale ? "Principale" : "Usa"}</button>
                  <button type="button" className="btn xs danger" disabled={busy} aria-label="Togli l'immagine" onClick={() => onChange({ ...r, immagini: togliImmagine(r.immagini, i.id) })}>×</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="png-gettoni" aria-label="Gettone sulla plancia">
          <span className="label">Gettone</span>
          <span className="png-tok big">{p ? <img src={p.src} alt="" /> : iniziali(nome)}</span>
          <span className="png-tok">{p ? <img src={p.src} alt="" /> : iniziali(nome)}</span>
        </div>
      </div>
      <div className="png-rit-desc">
        <div className="row"><span className="label">Descrizione per il ritratto</span><span className="spacer" />
          <button type="button" className="btn xs" onClick={copia} disabled={!r.descrizione}>{copiato ? "Copiata" : "Copia"}</button></div>
        <textarea className="input" rows={4} maxLength={2000} value={r.descrizione} disabled={busy}
          onChange={(e) => onChange({ ...r, descrizione: e.target.value })} aria-label="Descrizione per il ritratto" />
        <span className="hint">Composta dagli strati (razza e segni, età, corporatura, mestiere, tratti): incollala in un generatore di immagini, o ritoccala.</span>
        {nota}
        {err && <p className="hint bad" role="alert">{err}</p>}
      </div>
    </div>
  );
}
