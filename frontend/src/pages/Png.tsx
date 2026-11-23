/* Mondo → PNG (solo Master). Preset a strati in backend/png/, motore in backend/app/png/: qui si compone, si pesca,
   si riscrive a mano e si salva. Lo stesso motore e gli stessi pezzi servono il wizard PNG della Forgia.
   Vita e danno non si salvano mai: «Calcola combattimento» li chiede al server. */
import { useEffect, useMemo, useRef, useState } from "react";
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

export function Png() {
  const { cat, err } = useCatalogo();
  const [tab, setTab] = useState<Tab>("nuovo");
  const [bozza, setBozza] = useState<Bozza>(() => bozzaNuova());
  const [apri, setApri] = useState<number | null>(null);
  if (err) return <Win title="PNG"><p className="hint bad">{err}</p></Win>;
  if (!cat) return <Loading text="Leggo i preset dei PNG…" />;
  const tabs = [
    { key: "nuovo" as const, label: "Nuovo PNG" }, { key: "comparse" as const, label: "Comparse" },
    { key: "archivio" as const, label: "Archivio" }, { key: "preset" as const, label: "Preset" }, { key: "controlla" as const, label: "Controlla" },
  ];
  return (
    <div className="png-page">
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Sezione PNG">
        {tab === "nuovo" && <Nuovo cat={cat} bozza={bozza} setBozza={setBozza} onSalvato={(id) => { setApri(id); setTab("archivio"); }} />}
        {tab === "comparse" && <Comparse cat={cat} onApri={(b) => { setBozza(b); setTab("nuovo"); }} />}
        {tab === "archivio" && <Archivio apri={apri} />}
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
  const seq = useRef(0);

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

  const s = out?.scheda;
  const campo = (k: string, v: string) => setBozza({ ...bozza, campi: { ...bozza.campi, [k]: v } });

  async function salva() {
    setBusy(true);
    try {
      const r = await pngApi.nuovo(bozza, { salva: true, ritratto });
      toast("PNG", [`«${r.scheda.nome}» salvato come scheda (bozza).`, ...r.avvisi.slice(0, 2)], { gold: true });
      setBozza(bozzaNuova({ ruolo: bozza.ruolo, eta: bozza.eta, razza: bozza.razza, zona: bozza.zona, regno: bozza.regno, insediamento: bozza.insediamento }));
      setRitratto({ descrizione: "", immagini: [] });
      setDescToccata(false);
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
            <input className="input" maxLength={100} value={bozza.nome ?? ""} placeholder={s?.nome ?? ""} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} /></label>
          <label className="png-f"><span className="label">Livello</span>
            <input className="input num" type="number" min={1} max={999} value={bozza.livello ?? ""} placeholder={s ? String(s.livello) : ""}
              onChange={(e) => setBozza({ ...bozza, livello: e.target.value })} /></label>
          <label className="png-f"><span className="label">Genere</span>
            <select className="input" value={bozza.genere ?? ""} onChange={(e) => setBozza({ ...bozza, genere: e.target.value as Bozza["genere"] })}>
              <option value="">pescato{s ? ` (${s.genere === "f" ? "donna" : "uomo"})` : ""}</option><option value="f">donna</option><option value="m">uomo</option>
            </select></label>
          <div className="png-f"><span className="label">Seme</span>
            <div className="row"><span className="mono small">{bozza.seme}</span>
              <button type="button" className="btn" onClick={() => setBozza({ ...bozza, seme: nuovoSeme(), campi: {} })}>Rigenera</button></div></div>
        </div>
        <Avvisi errori={errore ? [errore] : []} avvisi={out?.avvisi ?? []} />
        <div className="row">
          <button type="button" className="btn primary" disabled={!s || busy || s.nome.startsWith("[") && !bozza.nome?.trim()} onClick={salva}
            title={s?.nome.startsWith("[") && !bozza.nome?.trim() ? "Scegli un nome: per questa razza e questo regno non c'è uno stile di nomi" : undefined}>
            {busy ? "Salvataggio…" : "Salva come scheda"}</button>
          <span className="hint">Si salva come bozza nell'archivio; le comparse e le schede si promuovono da lì.</span>
        </div>
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
    </div>
  );
}

/* ================= Comparse ================= */
function Comparse({ cat, onApri }: { cat: Catalogo; onApri: (b: Bozza) => void }) {
  const toast = useToast();
  const [luogo, setLuogo] = useState<Strati>({ ruolo: "cittadino", eta: "adulto", razza: "umano", zona: cat.zone[0]?.nome ?? "", ritocchi: [] });
  const [quante, setQuante] = useState(6);
  const [righe, setRighe] = useState<Comparsa[] | null>(null);
  const [seme, setSeme] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  async function genera(salva = false) {
    setBusy(true);
    try {
      const r = await pngApi.comparse(luogo, quante, salva, salva ? seme ?? undefined : undefined);
      setRighe(r.comparse);
      setSeme(r.seme);
      if (salva) toast("PNG", [`${r.npc?.length ?? 0} comparse salvate nell'archivio.`], { gold: true });
    } catch (e) {
      toast("PNG", [errorText(e)], { bad: true });
    } finally {
      setBusy(false);
    }
  }
  const zona = cat.zone.find((z) => z.nome === luogo.zona);
  return (
    <Win title="Comparse">
      <p className="small muted">Righe per riempire una scena: atteggiamenti dalle frequenze di Taratura §3, al più un ben disposto se sono tre o più, difetto e voce che non si ripetono.</p>
      <div className="png-grid">
        <label className="png-f"><span className="label">Zona</span>
          <select className="input" value={luogo.zona ?? ""} onChange={(e) => setLuogo({ ...luogo, zona: e.target.value, regno: e.target.value ? "" : "valeria", insediamento: e.target.value ? "" : "villaggio" })}>
            {cat.zone.map((z) => <option key={z.nome} value={z.nome}>{z.titolo ?? z.nome}</option>)}
            <option value="">Nessuna</option>
          </select></label>
        <label className="png-f"><span className="label">Regno</span>
          <select className="input" disabled={!!zona} value={zona?.regno ?? luogo.regno} onChange={(e) => setLuogo({ ...luogo, regno: e.target.value })}>
            {cat.regni.map((r) => <option key={r.nome} value={r.nome}>{r.titolo ?? r.nome}</option>)}</select></label>
        <label className="png-f"><span className="label">Insediamento</span>
          <select className="input" disabled={!!zona} value={zona?.insediamento ?? luogo.insediamento} onChange={(e) => setLuogo({ ...luogo, insediamento: e.target.value })}>
            {cat.insediamenti.map((r) => <option key={r} value={r}>{r === "citta" ? "Città" : maiuscola(r)}</option>)}</select></label>
        <label className="png-f"><span className="label">Quante</span>
          <input className="input num" type="number" min={1} max={30} value={quante} onChange={(e) => setQuante(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => genera(false)}>{righe ? "Rigenera" : "Genera"}</button>
        {righe && <button type="button" className="btn" disabled={busy} onClick={() => genera(true)}>Salva tutte nell'archivio</button>}
      </div>
      {righe && (
        <ul className="png-comparse scroll-y">
          {righe.map((c) => (
            <li key={c.id} className="png-cmp">
              <Avatar nome={c.nome} size={36} />
              <div className="png-cmp-t">
                <b>{c.nome}</b>
                <span className="xs muted">{maiuscola(parola(c.ruolo))} · {parola(c.razza)} · {c.eta} · Lv {c.livello} · {c.tratto}</span>
              </div>
              <span className={`chip ${ATT_TONE[c.atteggiamento]}`} title={c.voce}>{ATT_LABEL[c.atteggiamento]}</span>
              <button type="button" className="btn" title="Apre la comparsa come scheda nuova: stessi strati, seme, nome e livello"
                onClick={() => {
                  const [regno, resto] = c.provenienza.luogo.split("/");
                  const zonaC = cat.zone.some((z) => z.nome === resto) ? resto : "";
                  onApri({ ...bozzaNuova({ ruolo: c.ruolo, eta: c.eta, razza: c.razza, zona: zonaC, regno: zonaC ? "" : regno, insediamento: zonaC ? "" : resto,
                                           ritocchi: [...c.provenienza.ritocchi] }, c.provenienza.seme),
                           nome: c.nome, livello: c.livello, genere: c.genere });
                }}>Promuovi</button>
            </li>
          ))}
        </ul>
      )}
    </Win>
  );
}

/* ================= Archivio ================= */
function Archivio({ apri }: { apri: number | null }) {
  const toast = useToast();
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<number | null>(apri);
  const [filtro, setFiltro] = useState<"tutti" | "comparsa" | "scheda" | "completa" | "morti">("tutti");
  const [comb, setComb] = useState<Combattimento | null>(null);
  const [busy, setBusy] = useState(false);
  const [giorno, setGiorno] = useState(1);
  const [memoria, setMemoria] = useState("");
  const [campi, setCampi] = useState<Record<string, string>>({});

  useEffect(() => { pngApi.schede().then(setNpcs).catch((e) => setErr(errorText(e))); }, []);
  const lista = useMemo(() => (npcs ?? []).filter((n) => {
    const st = Object.values(n.scheda?.stato ?? {})[0];
    if (filtro === "morti") return st && !st.vivo;
    return filtro === "tutti" || n.dettaglio === filtro;
  }), [npcs, filtro]);
  const n = (npcs ?? []).find((x) => x.id === sel) ?? lista[0] ?? null;
  useEffect(() => { setComb(null); setCampi({}); }, [n?.id]);

  const sostituisci = (x: Npc) => setNpcs((l) => (l ?? []).map((y) => (y.id === x.id ? x : y)));
  async function fai<T>(f: () => Promise<T>, ok?: (r: T) => void) {
    setBusy(true);
    try { const r = await f(); ok?.(r); } catch (e) { toast("PNG", [errorText(e)], { bad: true }); } finally { setBusy(false); }
  }

  if (err) return <p className="hint bad">{err}</p>;
  if (!npcs) return <Loading text="Archivio dei PNG…" />;
  const s = n?.scheda;
  const stato = s ? Object.values(s.stato ?? {})[0] : undefined;
  const scritti = Object.fromEntries(Object.entries(campi).filter(([, v]) => v.trim()));
  return (
    <div className="png-arch">
      <Win title="Archivio" right={<span className="chip muted">{npcs.length}</span>} className="png-arch-l">
        <div className="seg png-filtri" role="group" aria-label="Filtro">
          {(["tutti", "comparsa", "scheda", "completa", "morti"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{f === "tutti" ? "Tutti" : maiuscola(f === "morti" ? "morti" : f)}</button>
          ))}
        </div>
        <ul className="png-lista scroll-y">
          {lista.map((x) => (
            <li key={x.id}><button type="button" className={`png-li${x.id === n?.id ? " on" : ""}`} onClick={() => setSel(x.id)}>
              <Avatar nome={x.name} scheda={x.scheda} size={32} />
              <span className="png-li-t"><b>{x.name}</b><span className="xs muted">Lv {x.level} · {parola(x.role)} · {x.place}</span></span>
              <span className={`chip ${x.dettaglio === "comparsa" ? "muted" : x.dettaglio === "completa" ? "gold" : "violet"}`}>{x.dettaglio}</span>
            </button></li>
          ))}
          {!lista.length && <li className="small muted">Nessun PNG.</li>}
        </ul>
      </Win>
      {n && s ? (
        <div className="png-arch-r">
          <Win title={n.name} right={<span className="chip muted">{s.id}</span>}>
            <div className="row png-azioni">
              {n.dettaglio !== "completa" && <button type="button" className="btn" disabled={busy}
                onClick={() => fai(() => pngApi.promuovi(n.id), (r) => { sostituisci(r.npc); toast("PNG", [`${r.npc.name}: ${r.npc.dettaglio}.`, ...r.avvisi]); })}>
                Promuovi a {n.dettaglio === "comparsa" ? "scheda" : "completa"}</button>}
              <button type="button" className="btn" disabled={busy}
                onClick={() => fai(() => pngApi.riga(n.id), async (r) => {
                  try { await navigator.clipboard.writeText(r.markdown); toast("PNG", ["Riga di zona copiata.", r.markdown]); }
                  catch { toast("PNG", [r.markdown]); }
                })}>Copia riga di zona</button>
              {Object.keys(scritti).length > 0 && <button type="button" className="btn primary" disabled={busy}
                onClick={() => fai(() => pngApi.ritocca(n.id, scritti), (r) => { sostituisci(r.npc); setCampi({});
                  toast("PNG", ["Scheda aggiornata.", ...r.avvisi.map((a) => a.testo)]); })}>Salva i campi</button>}
            </div>
            {n.dettaglio === "comparsa"
              ? <p className="small muted">Una comparsa è una riga: {parola(n.role)}, Lv {n.level}, {String((s as unknown as { tratto?: string }).tratto ?? "")}. Promuovila a scheda quando il forestiero ci torna o le chiede qualcosa che conta.</p>
              : <SchedaView s={s} campi={campi} onCampo={(k, v) => setCampi({ ...campi, [k]: v })} combattimento={comb}
                  onCombattimento={() => fai(() => pngApi.combattimento(n.id), setComb)} />}
          </Win>
          {n.dettaglio !== "comparsa" && stato && (
            <Win title="Dopo la sessione">
              <p className="small muted">Affinità {stato.affinita > 0 ? "+" : ""}{stato.affinita} ({affinitaLabel(stato.affinita)}). Al massimo +1 per interazione e per giorno; le perdite valgono doppio (Taratura §4). Il sistema avvisa e obbedisce.</p>
              <div className="row">
                <label className="png-f png-giorno"><span className="label">Giorno</span>
                  <input className="input num" type="number" min={0} value={giorno} onChange={(e) => setGiorno(Math.max(0, Number(e.target.value) || 0))} /></label>
                <button type="button" className="btn" disabled={busy} onClick={() => fai(() => pngApi.aggiorna(n.id, { giorno, affinita: -1 }), (r) => { sostituisci(r.npc); if (r.avvisi.length) toast("PNG", r.avvisi); })}>Affinità −1</button>
                <button type="button" className="btn" disabled={busy} onClick={() => fai(() => pngApi.aggiorna(n.id, { giorno, affinita: 1 }), (r) => { sostituisci(r.npc); if (r.avvisi.length) toast("PNG", r.avvisi); })}>Affinità +1</button>
              </div>
              <div className="row">
                <input className="input png-mem" maxLength={300} value={memoria} placeholder="Che cosa ricorda del forestiero…" onChange={(e) => setMemoria(e.target.value)} />
                <button type="button" className="btn" disabled={busy || !memoria.trim()} onClick={() => fai(() => pngApi.aggiorna(n.id, { giorno, memoria: [memoria.trim()] }), (r) => { sostituisci(r.npc); setMemoria(""); })}>Ricorda</button>
                {stato.vivo && <button type="button" className="btn danger" disabled={busy} onClick={() => {
                  const causa = window.prompt(`Come è morto ${n.name}? La scheda resta; il suo posto resta vuoto.`);
                  if (causa) void fai(() => pngApi.aggiorna(n.id, { giorno, morto: causa }), (r) => { sostituisci(r.npc); toast("PNG", r.avvisi); });
                }}>È morto…</button>}
              </div>
            </Win>
          )}
          <Win title="Ritratto e immagini">
            <RitrattoPanel r={s.ritratto ?? { descrizione: "", immagini: [] }} nome={n.name} busy={busy}
              onChange={(r) => fai(() => pngApi.ritocca(n.id, { ritratto: r }), (x) => sostituisci(x.npc))} />
          </Win>
        </div>
      ) : n ? (
        <Win title={n.name}><p className="small muted">Questo PNG è stato scritto a mano prima della sezione PNG: lo trovi in Campagna → Sessioni e regole.</p></Win>
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
