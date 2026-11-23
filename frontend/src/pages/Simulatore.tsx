/* Simulatore di danno (Mondo → Simulatore, solo Master). Chi attacca, contro chi, con quali modificatori:
   per ogni abilità danno o cura minimo, medio e massimo, probabilità di colpire, lanci per abbattere, resa per costo.
   Calcola il server con lo stesso motore delle plance; nessuna scheda cambia. */
import { useEffect, useMemo, useState } from "react";
import { errorText, request } from "../api/client";
import { Loading } from "../components/Status";
import { Win } from "../components/Win";
import "../styles/simulatore.css";

type Kind = "pg" | "creatura" | "voce";
interface Side { tipo: Kind; id?: number; nome?: string; level?: number; rarity?: string; size?: string; hp?: number; difesa?: number; evasione?: number; resistenza?: number }
interface Opts { pg: { id: number; nome: string; level: number; classe: string }[]; rarita: string[]; taglie: string[] }
interface Row {
  abilita: string; tipo: string; testo: boolean; costo: string; costo_valore: number; nota?: string;
  tipo_valore?: "danno" | "cura" | "scudo"; min?: number; max?: number; medio?: number; colpire?: number | null; critico?: number | null;
  lanci?: number | null; per_costo?: number | null; passi?: string[];
}
interface Result { attaccante: { nome: string }; bersaglio: { nome: string; hp: number }; risultati: Row[] }

const ni = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("it-IT");
const range = (r: Row) => (r.min === r.max ? ni(r.min) : `${ni(r.min)}–${ni(r.max)}`);

function SidePicker({ label, side, set, opts, allowVoce }: { label: string; side: Side; set: (s: Side) => void; opts: Opts; allowVoce: boolean }) {
  const num = (k: keyof Side, v: string, max = 1e12) => set({ ...side, [k]: Math.max(0, Math.min(max, Number(v) || 0)) });
  return (
    <fieldset className="sim-side">
      <legend className="label">{label}</legend>
      <div className="seg" role="group" aria-label={`${label}: tipo`}>
        <button type="button" aria-pressed={side.tipo === "pg"} onClick={() => set({ tipo: "pg", id: opts.pg[0]?.id })}>Personaggio</button>
        <button type="button" aria-pressed={side.tipo === "creatura"} onClick={() => set({ tipo: "creatura", nome: "Creatura", level: 50, rarity: "Raro", size: "Normale" })}>Creatura</button>
        {allowVoce && <button type="button" aria-pressed={side.tipo === "voce"} onClick={() => set({ tipo: "voce", nome: "Boss", hp: 40000, difesa: 0, evasione: 0, resistenza: 0 })}>Inventato</button>}
      </div>
      {side.tipo === "pg" && (
        <select className="input" aria-label="Personaggio" value={side.id ?? ""} onChange={(e) => set({ ...side, id: Number(e.target.value) })}>
          {opts.pg.map((p) => <option key={p.id} value={p.id}>{p.nome} · Lv {p.level} · {p.classe}</option>)}
        </select>
      )}
      {side.tipo === "creatura" && (
        <div className="sim-grid">
          <label><span className="xs muted">Nome</span><input className="input" maxLength={60} value={side.nome ?? ""} onChange={(e) => set({ ...side, nome: e.target.value })} /></label>
          <label><span className="xs muted">Livello</span><input className="input num" type="number" min={0} value={side.level ?? 1} onChange={(e) => num("level", e.target.value, 9999)} /></label>
          <label><span className="xs muted">Rarità</span><select className="input" value={side.rarity} onChange={(e) => set({ ...side, rarity: e.target.value })}>{opts.rarita.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label><span className="xs muted">Taglia</span><select className="input" value={side.size} onChange={(e) => set({ ...side, size: e.target.value })}>{opts.taglie.map((r) => <option key={r}>{r}</option>)}</select></label>
        </div>
      )}
      {side.tipo === "voce" && (
        <div className="sim-grid">
          <label><span className="xs muted">Nome</span><input className="input" maxLength={60} value={side.nome ?? ""} onChange={(e) => set({ ...side, nome: e.target.value })} /></label>
          <label><span className="xs muted">Vita</span><input className="input num" type="number" min={1} value={side.hp ?? 1} onChange={(e) => num("hp", e.target.value)} /></label>
          <label><span className="xs muted">Difesa</span><input className="input num" type="number" min={0} value={side.difesa ?? 0} onChange={(e) => num("difesa", e.target.value)} /></label>
          <label><span className="xs muted">Evasione %</span><input className="input num" type="number" min={0} max={95} value={side.evasione ?? 0} onChange={(e) => num("evasione", e.target.value, 95)} /></label>
          <label><span className="xs muted">Resistenza %</span><input className="input num" type="number" min={0} max={100} value={side.resistenza ?? 0} onChange={(e) => num("resistenza", e.target.value, 100)} /></label>
        </div>
      )}
    </fieldset>
  );
}

export function Simulatore() {
  const [opts, setOpts] = useState<Opts | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [att, setAtt] = useState<Side | null>(null);
  const [ber, setBer] = useState<Side>({ tipo: "voce", nome: "Boss", hp: 40000, difesa: 0, evasione: 0, resistenza: 0 });
  const [grado, setGrado] = useState("");
  const [bonus, setBonus] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [resErr, setResErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    request<Opts>("GET", "/simulatore/opzioni").then((o) => { setOpts(o); setAtt({ tipo: "pg", id: o.pg[0]?.id }); }).catch((e) => setErr(errorText(e)));
  }, []);

  const body = useMemo(() => (att ? {
    attaccante: att, bersaglio: ber,
    ...(grado ? { grado: Math.max(1, Math.min(100, Number(grado) || 1)) } : {}),
    ...(bonus ? { bonus_danni: Math.max(-100, Math.min(1000, Number(bonus) || 0)) } : {}),
  } : null), [att, ber, grado, bonus]);

  useEffect(() => {
    if (!body) return;
    let alive = true;
    const t = window.setTimeout(() => {
      request<Result>("POST", "/simulatore", body)
        .then((r) => { if (alive) { setRes(r); setResErr(null); } })
        .catch((e) => { if (alive) { setResErr(errorText(e)); } });
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [JSON.stringify(body)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <Win title="Simulatore di danno"><p className="hint bad">{err}</p></Win>;
  if (!opts || !att) return <Loading text="Preparo il simulatore…" />;

  const rows = res?.risultati ?? [];
  const num = rows.filter((r) => r.medio != null);
  const top = rows.find((r) => r.abilita === focus) ?? num[0] ?? null;
  const maxAvg = Math.max(1, ...num.map((r) => r.medio ?? 0));
  const maxEff = Math.max(0.0001, ...num.map((r) => r.per_costo ?? 0));

  return (
    <div className="sim">
      <Win title="Simulatore di danno">
        <p className="small muted">Per preparare scontri e boss: le schede non cambiano. I numeri sono quelli del motore delle plance.</p>
        <div className="sim-sides">
          <SidePicker label="Chi attacca" side={att} set={setAtt} opts={opts} allowVoce={false} />
          <SidePicker label="Contro" side={ber} set={setBer} opts={opts} allowVoce />
        </div>
        <details className="sim-mods">
          <summary className="small">Modificatori (facoltativi)</summary>
          <div className="sim-grid">
            <label><span className="xs muted">Grado delle abilità</span>
              <input className="input num" type="number" min={1} max={100} placeholder="come in scheda" value={grado} onChange={(e) => setGrado(e.target.value)} /></label>
            <label><span className="xs muted">Bonus danni %</span>
              <input className="input num" type="number" min={-100} max={1000} placeholder="0" value={bonus} onChange={(e) => setBonus(e.target.value)} /></label>
          </div>
        </details>
      </Win>

      {resErr && <p className="hint bad" role="alert">{resErr}</p>}
      {res && top && (
        <Win title={`${top.abilita} · ${res.attaccante.nome} contro ${res.bersaglio.nome}`}>
          {top.medio != null ? (
            <div className="sim-kpis">
              <div className="kv"><span className="label">{top.tipo_valore === "danno" ? "Danno a colpo" : top.tipo_valore === "cura" ? "Cura" : "Scudo"}</span><span className="v">{range(top)}</span></div>
              <div className="kv"><span className="label" title="Media del colpo per la probabilità di colpire, con i critici (×2)">Atteso a lancio</span><span className="v">{ni(top.medio)}</span></div>
              {top.colpire != null && <div className="kv"><span className="label">Colpire</span><span className="v">{top.colpire}%</span></div>}
              {top.critico != null && top.tipo_valore === "danno" && <div className="kv"><span className="label">Critico</span><span className="v">{top.critico}%</span></div>}
              {top.lanci != null && <div className="kv"><span className="label">Per abbatterlo</span><span className="v">~{ni(top.lanci)} <small>{top.lanci === 1 ? "lancio" : "lanci"}</small></span></div>}
              <div className="kv"><span className="label">Costo</span><span className="v">{top.costo || "—"}</span></div>
            </div>
          ) : <p className="small muted">{top.nota}</p>}
          {top.passi && top.passi.length > 0 && (
            <details className="cb-steps"><summary className="xs">Come è calcolato</summary>
              <ul className="xs mono">{top.passi.map((p, i) => <li key={i}>{p}</li>)}</ul></details>
          )}
          <p className="xs muted">Vita del bersaglio: {ni(res.bersaglio.hp)}. «Atteso» = media del colpo × probabilità di colpire, con i critici (×2): per questo può superare il danno a colpo.</p>
        </Win>
      )}

      {res && (
        <Win title="Confronto">
          <div className="sim-table" role="table" aria-label="Confronto delle abilità">
            <div className="sim-tr sim-th" role="row">
              <span role="columnheader">Abilità</span><span role="columnheader">Atteso</span><span role="columnheader">Costo</span>
              <span role="columnheader" className="sim-hide">Resa per costo</span>
            </div>
            {rows.map((r) => (
              <button key={r.abilita} type="button" role="row" className={`sim-tr${top?.abilita === r.abilita ? " on" : ""}`} onClick={() => setFocus(r.abilita)}
                title={r.nota ?? `${range(r)} ${r.tipo_valore ?? ""}`}>
                <span role="cell" className="sim-name">{r.abilita}{r.testo && <small className="muted"> · testo</small>}</span>
                <span role="cell" className="sim-avg">
                  {r.medio != null ? <><i style={{ width: `${(r.medio / maxAvg) * 100}%` }} className={r.tipo_valore} /><b>{ni(r.medio)}</b></> : <small className="muted">—</small>}
                </span>
                <span role="cell" className="mono small">{r.costo || "—"}</span>
                <span role="cell" className="sim-avg sim-hide">
                  {r.per_costo != null ? <><i style={{ width: `${(r.per_costo / maxEff) * 100}%` }} className="eff" /><b>{r.per_costo.toLocaleString("it-IT")}</b></> : <small className="muted">—</small>}
                </span>
              </button>
            ))}
            {!rows.length && <p className="small muted">Nessuna abilità da confrontare.</p>}
          </div>
        </Win>
      )}
    </div>
  );
}
