/* Mondo → PNG (solo Master). Preset a strati in backend/png/, motore in backend/app/png/: qui si compone, si pesca,
   si riscrive a mano e si salva. Lo stesso motore e gli stessi pezzi servono il wizard PNG della Forgia.
   Vita e danno non si salvano mai: «Calcola combattimento» li chiede al server.
   Pensata per una partita in corso: la bozza sopravvive al cambio di pagina, i campi dell'archivio si salvano da soli
   quando si esce dal campo, niente finestre del browser. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { errorText } from "../api/client";
import {
  pngApi, type Bozza, type Catalogo, type Combattimento, type Comparsa, type Confronto, type Controllo, type NuovoOut, type Ritratto, type Strati,
} from "../api/png";
import type { Npc } from "../api/types";
import { Avatar, AttBar, Avvisi, ComposizioneView, RitrattoPanel, SchedaView, StratiForm, useCatalogo } from "../components/png/PngParts";
import { Loading } from "../components/Status";
import { Tabs } from "../components/Tabs";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import { ATT_LABEL, ATT_TONE, affinitaLabel, bozzaNuova, maiuscola, nuovoSeme, parola } from "../lib/png";

type Tab = "nuovo" | "comparse" | "archivio" | "preset" | "controlla";
const TABS: Tab[] = ["nuovo", "comparse", "archivio", "preset", "controlla"];

/** Stato che resta per la sessione del browser (cambio di pagina, ricarica), mai sul server. */
function useSessione<T>(chiave: string, iniziale: () => T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = sessionStorage.getItem(chiave); return s ? (JSON.parse(s) as T) : iniziale(); } catch { return iniziale(); }
  });
  const set = (x: T) => { setV(x); try { sessionStorage.setItem(chiave, JSON.stringify(x)); } catch { /* storage non disponibile */ } };
  return [v, set];
}

const haScritto = (b: Bozza) => Object.values(b.campi).some((v) => v.trim()) || !!b.nome?.trim();

export function Png() {
  const { cat, err } = useCatalogo();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "nuovo") as Tab;
  const apri = Number(params.get("id")) || null;
  const vai = (t: Tab, id?: number) => setParams(id ? { tab: t, id: String(id) } : { tab: t }, { replace: true });
  const [bozza, setBozza] = useSessione<Bozza>("png-bozza", () => bozzaNuova());
  const [comparse, setComparse] = useSessione<ComparseStato>("png-comparse", () => ({ righe: null, seme: null, salvate: false }));
  if (err) return <Win title="PNG"><p className="hint bad">{err}</p></Win>;
  if (!cat) return <Loading text="Leggo i preset dei PNG…" />;
  const tabs = [
    { key: "nuovo" as const, label: "Nuovo" }, { key: "comparse" as const, label: "Comparse" },
    { key: "archivio" as const, label: "Archivio" }, { key: "preset" as const, label: "Preset" }, { key: "controlla" as const, label: "Controlla" },
  ];
  return (
    <div className="png-page">
      <Tabs tabs={tabs} active={tab} onChange={(t) => vai(t)} label="Sezione PNG">
        {tab === "nuovo" && <Nuovo cat={cat} bozza={bozza} setBozza={setBozza} onSalvato={(id) => vai("archivio", id)} />}
        {tab === "comparse" && <Comparse cat={cat} stato={comparse} setStato={setComparse} onApri={(b) => {
          if (haScritto(bozza) && !window.confirm("Nella scheda Nuovo c'è un PNG con campi scritti a mano. Lo sostituisco con questa comparsa?")) return;
          setBozza(b);
          vai("nuovo");
        }} />}
        {tab === "archivio" && <Archivio apri={apri} onApri={(id) => vai("archivio", id)} />}
        {tab === "preset" && <Preset cat={cat} />}
        {tab === "controlla" && <Controlla />}
      </Tabs>
    </div>
  );
}

/* ================= Nuovo ================= */
function Nuovo({ cat, bozza, setBozza, onSalvato }: { cat: Catalogo; bozza: Bozza; setBozza: (b: Bozza) => void; onSalvato: (id: number) => void }) {
  const toast = useToast();
  const [out, setOut] = useState<NuovoOut | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [comp, setComp] = useState<NuovoOut["composizione"] | null>(null);
  const [ritratto, setRitratto] = useState<Ritratto>({ descrizione: "", immagini: [] });
  const [descToccata, setDescToccata] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cambiata, setCambiata] = useState<string | null>(null);
  const seq = useRef(0);
  const prima = useRef<{ chiave: string; nome: string; difetto: string | null } | null>(null);

  // anteprima dal server a ogni modifica (composizione + scheda pescata con il seme), risposte vecchie scartate
  useEffect(() => {
    const n = ++seq.current;
    const t = window.setTimeout(() => {
      pngApi.componi(bozza).then((c) => { if (n === seq.current) setComp(c); }).catch(() => undefined);
      pngApi.nuovo(bozza)
        .then((r) => { if (n === seq.current) { setOut(r); setErrore(null); } })
        .catch((e) => { if (n === seq.current) { setOut(null); setErrore(errorText(e)); } });
    }, 200);
    return () => window.clearTimeout(t);
  }, [JSON.stringify(bozza)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (out && !descToccata) setRitratto((r) => ({ ...r, descrizione: out.scheda.ritratto.descrizione })); }, [out, descToccata]);

  // se strati o seme cambiano quando ci sono campi scritti a mano, la persona sotto è un'altra: va detto
  useEffect(() => {
    if (!out) return;
    const chiave = [bozza.ruolo, bozza.eta, bozza.razza, bozza.zona, bozza.regno, bozza.insediamento, bozza.seme, bozza.ritocchi.join("|")].join("/");
    const p = prima.current;
    const scritti = Object.values(bozza.campi).filter((v) => v.trim()).length;
    if (p && p.chiave !== chiave && scritti && (p.nome !== out.scheda.nome || p.difetto !== out.scheda.difetto)) {
      setCambiata(`La persona è stata ripescata (${p.nome} → ${out.scheda.nome}): i ${scritti} campi che hai scritto restano, controlla che tornino ancora (la contraddizione soprattutto).`);
    }
    prima.current = { chiave, nome: out.scheda.nome, difetto: out.scheda.difetto };
  }, [out]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = out?.scheda;
  const campo = (k: string, v: string) => setBozza({ ...bozza, campi: { ...bozza.campi, [k]: v } });
  const senzaNome = !!s && s.nome.startsWith("[") && !bozza.nome?.trim();
  const motivoBlocco = errore ?? (senzaNome ? "Scrivi un nome: per questa razza e questo regno i documenti non danno uno stile di nomi." : null);

  async function salva() {
    setBusy(true);
    try {
      const r = await pngApi.nuovo(bozza, { salva: true, ritratto });
      toast("PNG", [`«${r.scheda.nome}» è nell'archivio.`, ...r.avvisi.slice(0, 2)], { gold: true });
      setBozza(bozzaNuova({ ruolo: bozza.ruolo, eta: bozza.eta, razza: bozza.razza, zona: bozza.zona, regno: bozza.regno, insediamento: bozza.insediamento }));
      setRitratto({ descrizione: "", immagini: [] });
      setDescToccata(false);
      setCambiata(null);
      prima.current = null;
      if (r.npc) onSalvato(r.npc.id);
    } catch (e) {
      toast("PNG", [errorText(e)], { bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="png-nuovo">
      <Win title="Strati del preset">
        <StratiForm cat={cat} value={bozza} onChange={(v) => setBozza({ ...bozza, ...v })} />
        <div className="png-grid">
          <label className="png-f"><span className="label">Nome</span>
            <input className="input" maxLength={100} value={bozza.nome ?? ""} placeholder={s?.nome ?? ""} aria-invalid={senzaNome || undefined}
              onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} /></label>
          <label className="png-f"><span className="label">Livello</span>
            <input className="input num" type="number" min={1} max={999} value={bozza.livello ?? ""} placeholder={s ? String(s.livello) : ""}
              onChange={(e) => setBozza({ ...bozza, livello: e.target.value })} /></label>
          <label className="png-f"><span className="label">Genere</span>
            <select className="input" value={bozza.genere ?? ""} onChange={(e) => setBozza({ ...bozza, genere: e.target.value as Bozza["genere"] })}>
              <option value="">pescato{s ? ` (${s.genere === "f" ? "donna" : "uomo"})` : ""}</option><option value="f">donna</option><option value="m">uomo</option>
            </select></label>
          <div className="png-f"><span className="label">Seme</span>
            <div className="row"><span className="mono small">{bozza.seme}</span>
              <button type="button" className="btn" onClick={() => setBozza({ ...bozza, seme: nuovoSeme() })}>Rigenera</button></div>
            <span className="hint">Nuova pescata: ciò che hai scritto a mano resta.</span></div>
        </div>
        <Avvisi errori={errore ? [errore] : []} avvisi={out?.avvisi ?? []} />
        {cambiata && <p className="hint png-cambiata" role="status">{cambiata} <button type="button" className="btn xs" onClick={() => setCambiata(null)}>Ok</button></p>}
      </Win>
      <div className="png-cols">
        {comp && <Win title="Componi" className="png-col-comp"><ComposizioneView c={comp} /></Win>}
        <Win title={s ? s.nome : "Scheda semplificata"} className="png-col-scheda" right={s && <span className="chip muted">{s.id}</span>}>
          {s ? <SchedaView s={s} campi={bozza.campi} onCampo={campo} combattimento={out?.combattimento} /> : <p className="small muted">{errore ?? "Pesco…"}</p>}
        </Win>
        <Win title="Ritratto e immagini" className="png-col-rit">
          <RitrattoPanel r={ritratto} nome={s?.nome ?? "?"} busy={busy}
            onChange={(r) => { if (r.descrizione !== ritratto.descrizione) setDescToccata(true); setRitratto(r); }} />
        </Win>
      </div>
      <div className="png-barra" role="region" aria-label="Salvataggio">
        <button type="button" className="btn primary" disabled={!s || busy || senzaNome} onClick={salva}>{busy ? "Salvataggio…" : "Salva nell'archivio"}</button>
        <span className={`hint ${motivoBlocco ? "bad" : ""}`}>{motivoBlocco ?? (s ? `${s.nome}, Lv ${s.livello}: finisce nell'archivio come scheda; da lì si promuove a completa.` : "")}</span>
      </div>
    </div>
  );
}

/* ================= Comparse ================= */
interface ComparseStato { righe: Comparsa[] | null; seme: number | null; salvate: boolean; zona?: string; regno?: string; insediamento?: string; quante?: number }

function Comparse({ cat, stato, setStato, onApri }: { cat: Catalogo; stato: ComparseStato; setStato: (s: ComparseStato) => void; onApri: (b: Bozza) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const zonaN = stato.zona ?? cat.zone[0]?.nome ?? "";
  const luogo: Strati = { ruolo: "cittadino", eta: "adulto", razza: "umano", zona: zonaN, regno: stato.regno ?? "valeria", insediamento: stato.insediamento ?? "villaggio", ritocchi: [] };
  const zona = cat.zone.find((z) => z.nome === zonaN);
  const quante = stato.quante ?? 6;
  const set = (p: Partial<ComparseStato>) => setStato({ ...stato, ...p });
  async function genera(salva = false) {
    setBusy(true);
    try {
      const r = await pngApi.comparse(zona ? { zona: zonaN } : { regno: luogo.regno, insediamento: luogo.insediamento }, quante, salva,
                                      salva ? stato.seme ?? undefined : undefined);
      set({ righe: r.comparse, seme: r.seme, salvate: salva });
      if (salva) toast("PNG", [`${r.npc?.length ?? 0} comparse salvate nell'archivio.`], { gold: true });
    } catch (e) {
      toast("PNG", [errorText(e)], { bad: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Win title="Comparse">
      <p className="small muted">Righe per riempire una scena: al più un ben disposto se sono tre o più, difetto e voce che non si ripetono (Taratura §3).</p>
      <div className="png-grid">
        <label className="png-f"><span className="label">Zona</span>
          <select className="input" value={zonaN} onChange={(e) => set({ zona: e.target.value })}>
            {cat.zone.map((z) => <option key={z.nome} value={z.nome}>{z.titolo ?? z.nome}</option>)}
            <option value="">Nessuna</option>
          </select></label>
        <label className="png-f"><span className="label">Regno</span>
          <select className="input" disabled={!!zona} value={zona?.regno ?? luogo.regno} onChange={(e) => set({ regno: e.target.value })}>
            {cat.regni.map((r) => <option key={r.nome} value={r.nome}>{r.titolo ?? r.nome}</option>)}</select></label>
        <label className="png-f"><span className="label">Insediamento</span>
          <select className="input" disabled={!!zona} value={zona?.insediamento ?? luogo.insediamento} onChange={(e) => set({ insediamento: e.target.value })}>
            {cat.insediamenti.map((r) => <option key={r} value={r}>{r === "citta" ? "Città" : maiuscola(r)}</option>)}</select></label>
        <label className="png-f"><span className="label">Quante</span>
          <input className="input num" type="number" min={1} max={30} value={quante} onChange={(e) => set({ quante: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })} /></label>
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => genera(false)}>{stato.righe ? "Altre comparse" : "Genera"}</button>
        {stato.righe && <button type="button" className="btn" disabled={busy || stato.salvate} onClick={() => genera(true)}>
          {stato.salvate ? "Salvate nell'archivio ✓" : "Salva tutte nell'archivio"}</button>}
      </div>
      {stato.righe && (
        <ul className="png-comparse scroll-y">
          {stato.righe.map((c) => (
            <li key={c.id} className="png-cmp">
              <Avatar nome={c.nome} size={32} />
              <details className="png-cmp-t">
                <summary><b>{c.nome}</b> <span className="xs muted">{parola(c.ruolo)} · Lv {c.livello} · {c.tratto}</span></summary>
                <span className="xs muted">{parola(c.razza)}, {c.eta}. Difetto: {c.difetto}. Voce: {c.voce}</span>
              </details>
              <span className={`chip ${ATT_TONE[c.atteggiamento]}`}>{ATT_LABEL[c.atteggiamento]}</span>
              <button type="button" className="btn xs" title="Apre la comparsa nella scheda Nuovo: stessi strati, seme, nome e livello"
                onClick={() => {
                  const [regno, resto] = c.provenienza.luogo.split("/");
                  const zonaC = cat.zone.some((z) => z.nome === resto) ? resto : "";
                  onApri({ ...bozzaNuova({ ruolo: c.ruolo, eta: c.eta, razza: c.razza, zona: zonaC, regno: zonaC ? "" : regno, insediamento: zonaC ? "" : resto,
                                           ritocchi: [...c.provenienza.ritocchi] }, c.provenienza.seme),
                           nome: c.nome, livello: c.livello, genere: c.genere });
                }}>Apri come scheda</button>
            </li>
          ))}
        </ul>
      )}
    </Win>
  );
}

/* ================= Archivio ================= */
type Filtro = "tutti" | "comparsa" | "scheda" | "completa" | "vivi" | "morti";
const statoDi = (n: Npc) => Object.values(n.scheda?.stato ?? {})[0];

function Archivio({ apri, onApri }: { apri: number | null; onApri: (id: number) => void }) {
  const toast = useToast();
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("tutti");
  const [cerca, setCerca] = useState("");
  const [comb, setComb] = useState<Combattimento | null>(null);
  const [busy, setBusy] = useState(false);
  const [giorno, setGiorno] = useSessione<number>("png-giorno", () => 1);
  const [memoria, setMemoria] = useState("");
  const [causa, setCausa] = useState<string | null>(null);
  const [campi, setCampi] = useState<Record<string, string>>({});
  const [ultimi, setUltimi] = useState<string[]>([]);

  useEffect(() => { pngApi.schede().then(setNpcs).catch((e) => setErr(errorText(e))); }, []);
  const lista = useMemo(() => (npcs ?? []).filter((n) => {
    const st = statoDi(n);
    if (cerca.trim() && !`${n.name} ${n.role} ${n.place}`.toLowerCase().includes(cerca.trim().toLowerCase())) return false;
    if (filtro === "morti") return !!st && !st.vivo;
    if (filtro === "vivi") return !st || st.vivo;
    return filtro === "tutti" || n.dettaglio === filtro;
  }), [npcs, filtro, cerca]);
  const n = (npcs ?? []).find((x) => x.id === apri) ?? lista[0] ?? null;
  useEffect(() => { setComb(null); setCampi({}); setUltimi([]); setCausa(null); }, [n?.id]);

  const sostituisci = (x: Npc) => setNpcs((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)));
  async function fai<T>(f: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(true);
    try { const r = await f(); ok?.(r); } catch (e) { toast("PNG", [errorText(e)], { bad: true }); } finally { setBusy(false); }
  }
  // i campi scritti si salvano quando il campo perde il fuoco: cambiare PNG o pagina non perde niente
  function salvaCampo(k: string) {
    if (!n || campi[k] == null) return;
    const v = campi[k];
    void fai(() => pngApi.ritocca(n.id, { [k]: v.trim() || null }), (r) => {
      sostituisci(r.npc);
      setCampi((c) => { const x = { ...c }; delete x[k]; return x; });
      if (r.avvisi.length) setUltimi(r.avvisi.map((a) => a.testo));
    });
  }

  if (err) return <p className="hint bad">{err}</p>;
  if (!npcs) return <Loading text="Archivio dei PNG…" />;
  const s = n?.scheda;
  const stato = n ? statoDi(n) : undefined;
  const morto = !!stato && !stato.vivo;
  const aggiorna = (ev: Parameters<typeof pngApi.aggiorna>[1]) => n && fai(() => pngApi.aggiorna(n.id, ev), (r) => { sostituisci(r.npc); setUltimi(r.avvisi); });
  return (
    <div className="png-arch">
      <Win title="Archivio" right={<span className="chip muted">{lista.length}/{npcs.length}</span>} className="png-arch-l">
        <div className="png-arch-f">
          <input className="input" type="search" placeholder="Cerca nome, ruolo, luogo…" value={cerca} onChange={(e) => setCerca(e.target.value)} aria-label="Cerca nell'archivio" />
          <select className="input" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Filtro">
            <option value="tutti">Tutti</option><option value="comparsa">Comparse</option><option value="scheda">Schede</option>
            <option value="completa">Complete</option><option value="vivi">Vivi</option><option value="morti">Morti</option>
          </select>
        </div>
        <ul className="png-lista scroll-y">
          {lista.map((x) => {
            const m = statoDi(x) && !statoDi(x)!.vivo;
            return (
              <li key={x.id}><button type="button" className={`png-li${x.id === n?.id ? " on" : ""}${m ? " morto" : ""}`} onClick={() => onApri(x.id)}
                title={`${x.name} · Lv ${x.level} · ${parola(x.role)} · ${x.place}`}>
                <Avatar nome={x.name} scheda={x.scheda} size={32} />
                <span className="png-li-t"><b>{x.name}</b><span className="xs muted">Lv {x.level} · {parola(x.role)}</span></span>
                <span className={`chip ${m ? "bad" : x.dettaglio === "comparsa" ? "muted" : x.dettaglio === "completa" ? "gold" : "violet"}`}>{m ? "morto" : x.dettaglio}</span>
              </button></li>
            );
          })}
          {!lista.length && <li className="small muted">Nessun PNG.</li>}
        </ul>
      </Win>
      {n && s ? (
        <div className="png-arch-r">
          <Win title={n.name} right={<>{morto && <span className="chip bad">morto</span>} <span className="chip muted">{s.id}</span></>}>
            <div className="row png-azioni">
              {n.dettaglio !== "completa" && !morto && <button type="button" className="btn" disabled={busy}
                onClick={() => fai(() => pngApi.promuovi(n.id), (r) => { sostituisci(r.npc); setUltimi(r.avvisi); })}>
                Promuovi a {n.dettaglio === "comparsa" ? "scheda" : "scheda completa"}</button>}
              <button type="button" className="btn" disabled={busy}
                onClick={() => fai(() => pngApi.riga(n.id), async (r) => {
                  try { await navigator.clipboard.writeText(r.markdown); toast("PNG", ["Riga di zona copiata."]); }
                  catch { toast("PNG", ["Copia non riuscita: selezionala qui sotto."], { bad: true }); setUltimi([r.markdown]); }
                })}>Copia riga di zona</button>
            </div>
            {ultimi.length > 0 && <ul className="png-avvisi png-ultimi" role="status">{ultimi.map((a) => <li key={a} className="warn-t">{a}</li>)}</ul>}
            {n.dettaglio === "comparsa"
              ? <p className="small muted">Una comparsa è una riga: {parola(n.role)}, Lv {n.level}, {String((s as unknown as { tratto?: string }).tratto ?? "")}. Promuovila a scheda quando il forestiero ci torna o le chiede qualcosa che conta.</p>
              : <SchedaView s={s} campi={campi} onCampo={(k, v) => setCampi({ ...campi, [k]: v })} onBlurCampo={salvaCampo}
                  onStoria={(sez, k, v) => fai(() => pngApi.ritocca(n.id, { completa: { [sez]: { [k]: v } } }), (r) => sostituisci(r.npc))}
                  combattimento={comb} onCombattimento={() => fai(() => pngApi.combattimento(n.id), setComb)} />}
            {n.dettaglio !== "comparsa" && <p className="xs muted">I campi si salvano da soli quando esci dal campo.</p>}
          </Win>
          {n.dettaglio !== "comparsa" && stato && (
            <Win title="Dopo la sessione">
              {morto ? (
                <div className="stack">
                  <p className="small">Morto{stato.morte?.giorno != null ? ` il giorno ${stato.morte.giorno}` : ""}: {stato.morte?.causa}. La scheda resta, il suo posto è vuoto finché qualcuno non lo prende.</p>
                  <div className="row"><button type="button" className="btn" disabled={busy} onClick={() => aggiorna({ annulla_morte: true })}>Annulla: era un errore</button></div>
                </div>
              ) : (
                <div className="stack">
                  <p className="small muted">Affinità <b className="num">{stato.affinita > 0 ? "+" : ""}{stato.affinita}</b> ({affinitaLabel(stato.affinita)}). Al massimo +1 per giorno; le perdite valgono doppio (Taratura §4).</p>
                  <div className="row">
                    <label className="png-f png-giorno"><span className="label">Giorno di gioco</span>
                      <input className="input num" type="number" min={0} max={100000} value={giorno} onChange={(e) => setGiorno(Math.max(0, Math.min(100000, Number(e.target.value) || 0)))} /></label>
                    <button type="button" className="btn" disabled={busy} onClick={() => aggiorna({ giorno, affinita: -1 })}>Affinità −1</button>
                    <button type="button" className="btn" disabled={busy} onClick={() => aggiorna({ giorno, affinita: 1 })}>Affinità +1</button>
                  </div>
                  <div className="row">
                    <input className="input png-mem" maxLength={300} value={memoria} placeholder="Che cosa ricorda del forestiero…" onChange={(e) => setMemoria(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && memoria.trim()) { e.preventDefault(); void aggiorna({ giorno, memoria: [memoria.trim()] }); setMemoria(""); } }} />
                    <button type="button" className="btn" disabled={busy || !memoria.trim()} onClick={() => { void aggiorna({ giorno, memoria: [memoria.trim()] }); setMemoria(""); }}>Ricorda</button>
                  </div>
                  {causa == null
                    ? <div className="row"><button type="button" className="btn danger" disabled={busy} onClick={() => setCausa("")}>È morto…</button></div>
                    : <div className="row png-morte">
                        <input className="input png-mem" autoFocus maxLength={300} value={causa} placeholder="Come è morto? (es. lupi sulla strada delle Rovine)" onChange={(e) => setCausa(e.target.value)} />
                        <button type="button" className="btn danger" disabled={busy || !causa.trim()} onClick={() => { void aggiorna({ giorno, morto: causa.trim() }); setCausa(null); }}>Conferma la morte</button>
                        <button type="button" className="btn" onClick={() => setCausa(null)}>Lascia stare</button>
                      </div>}
                </div>
              )}
            </Win>
          )}
          <Win title="Ritratto e immagini">
            <RitrattoPanel r={s.ritratto ?? { descrizione: "", immagini: [] }} nome={n.name} busy={busy}
              onChange={(r) => fai(() => pngApi.ritocca(n.id, { ritratto: r }), (x) => sostituisci(x.npc))} />
          </Win>
        </div>
      ) : null}
    </div>
  );
}

/* ================= Preset ================= */
function Preset({ cat }: { cat: Catalogo }) {
  const [ruolo, setRuolo] = useState(cat.ruoli.find((r) => r.nome === "fabbro")?.nome ?? cat.ruoli[0]?.nome ?? "");
  const [conf, setConf] = useState<Confronto | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setConf(null); pngApi.confronta(ruolo).then(setConf).catch((e) => setErr(errorText(e))); }, [ruolo]);
  return (
    <div className="png-preset">
      <Win title="Ruoli">
        <p className="small muted">I preset sono file YAML in <span className="mono">backend/png/</span>: si ritoccano con un editor (vedi LEGGIMI.md), giocando non cambiano mai. Modello dei numeri: <b>{cat.modello_numeri}</b>.</p>
        <ul className="png-ruoli">
          {cat.ruoli.map((r) => (
            <li key={r.nome}><button type="button" className={`png-li${r.nome === ruolo ? " on" : ""}`} onClick={() => setRuolo(r.nome)}>
              <span className="png-li-t"><b>{maiuscola(parola(r.nome))}</b><span className="xs muted">{r.descrizione}{r.eredita ? ` · eredita da ${r.eredita}` : ""}</span></span>
            </button></li>
          ))}
        </ul>
      </Win>
      <Win title={`${maiuscola(parola(ruolo))}: varianti di razza`}>
        <p className="small muted">Solo ciò che cambia rispetto all'umano adulto di un villaggio di Valeria.</p>
        {err && <p className="hint bad">{err}</p>}
        {!conf ? <Loading text="Confronto…" /> : (
          <div className="png-conf scroll-y">
            {Object.entries(conf.varianti).map(([razza, v]) => (
              <section key={razza} className="png-conf-c">
                <header><b>{maiuscola(parola(razza))}</b>{v.errori.length > 0 && <span className="chip bad">serve un motivo</span>}</header>
                {v.errori.map((e) => <p key={e} className="xs bad-t">{e}</p>)}
                <ul>
                  {Object.entries(v.cambia).map(([k, d]) => (
                    <li key={k} className="xs"><span className="muted">{parola(k)}: </span>
                      {"aggiunte" in d
                        ? <>{(d.aggiunte as { voce: string }[]).map((x) => <span key={x.voce} className="good-t">+ {x.voce} </span>)}{(d.tolte as string[]).map((x) => <s key={x} className="muted">{x} </s>)}</>
                        : k === "atteggiamento" ? <AttBar f={d[razza] as Record<string, number>} />
                        : <><s className="muted">{JSON.stringify(d.umano)}</s> → <span className="good-t">{JSON.stringify(d[razza])}</span> <span className="muted">({String(d.da)})</span></>}
                    </li>
                  ))}
                  {!Object.keys(v.cambia).length && <li className="xs muted">Nessuna differenza: vale il preset del ruolo.</li>}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Win>
    </div>
  );
}

/* ================= Controlla ================= */
function Controlla() {
  const [r, setR] = useState<Controllo | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vedi, setVedi] = useState<"avviso" | "proposta" | "null">("avviso");
  useEffect(() => { pngApi.controlla().then(setR).catch((e) => setErr(errorText(e))); }, []);
  if (err) return <p className="hint bad">{err}</p>;
  if (!r) return <Loading text="Controllo preset e schede…" />;
  const conta = (g: string) => r.avvisi.filter((a) => (a.genere ?? "avviso") === g).length;
  return (
    <div className="png-ctrl">
      <Win title="Prove sui PNG già scritti" right={<span className={`chip ${r.prove_ok ? "good" : "bad"}`}>{r.prove_ok ? "tutte ok" : "da correggere"}</span>}>
        <ul className="png-prove">
          {r.prove.map((p) => (
            <li key={p.nome} title={[...p.dettagli, ...p.note].join("\n")}>
              <span className={`chip ${p.ok ? "good" : "bad"}`}>{p.ok ? "ok" : "no"}</span>
              <span className="png-li-t"><b>{p.nome}</b><span className="xs muted">{p.prova} · esito {p.esito}{p.dettagli.length ? ` · ${p.dettagli[0]}` : ""}</span></span>
            </li>
          ))}
        </ul>
      </Win>
      <Win title="Errori" right={<span className={`chip ${r.errori.length ? "bad" : "good"}`}>{r.errori.length}</span>}>
        {r.errori.length ? <ul className="png-note scroll-y">{r.errori.map((e, i) => <li key={i}><span className="mono xs muted">{e.dove}</span> {e.testo}</li>)}</ul>
          : <p className="hint good">Nessun errore nei preset e nelle schede.</p>}
      </Win>
      <Win title="Avvisi">
        <div className="seg" role="group" aria-label="Tipo di avviso">
          <button type="button" aria-pressed={vedi === "avviso"} onClick={() => setVedi("avviso")}>Avvisi {conta("avviso")}</button>
          <button type="button" aria-pressed={vedi === "proposta"} onClick={() => setVedi("proposta")}>Proposte {conta("proposta")}</button>
          <button type="button" aria-pressed={vedi === "null"} onClick={() => setVedi("null")}>I documenti tacciono {conta("null")}</button>
        </div>
        <ul className="png-note scroll-y">
          {r.avvisi.filter((a) => (a.genere ?? "avviso") === vedi).map((a, i) => <li key={i}><span className="mono xs muted">{a.dove}</span> {a.testo}</li>)}
          {!conta(vedi) && <li className="small muted">Niente.</li>}
        </ul>
      </Win>
    </div>
  );
}
