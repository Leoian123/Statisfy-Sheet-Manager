/* «Usa abilità» nel pannello combattimento: niente scontro da aprire.
   Scegli l'abilità → su chi (te stesso, un PG, una creatura dell'incontro in corso, oppure «a voce») → vedi il calcolo
   del server → tira (o inserisci i tuoi dadi) e applica. Costo, ricarica ed effetti finiscono sulla scheda. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { errorText, request } from "../../api/client";
import type { CombatAbility } from "../../api/scontri";
import type { Character } from "../../api/types";
import "../../styles/use-ability.css";

type TargetKind = "nessuno" | "pg" | "creatura" | "voce";
interface Target { tipo: TargetKind; id?: number; index?: number; nome?: string; difesa?: number; resistenza?: number }
interface Ability extends CombatAbility { ricarica: number }
interface Options {
  abilita: Ability[];
  bersagli: { pg: { id: number; nome: string }[]; creature: { encounter_id: number; index: number; nome: string; count: number; hp: number; max: number }[] };
}
interface Preview { stima: Record<string, Record<string, [number, number]>>; passi: string[]; colpire: number | null;
  richieste: { key: string; tipo: "d100" | "valore"; label: string; min: number; max: number; soglia: number | null }[] }
interface UseResult { character: Character; eventi: string[] }

const enc = encodeURIComponent;
const ni = (n: unknown) => Math.round(Number(n) || 0).toLocaleString("it-IT");
const KIND_LABEL: Record<string, string> = { incantesimo: "Incantesimi", miracolo: "Miracoli", skill: "Skill", attacco: "Attacchi" };
const ORDER = ["attacco", "incantesimo", "miracolo", "skill"];

function costText(a: CombatAbility): string {
  const parts = a.costi.map((k) => `${ni(k.valore)} ${k.risorsa === "stack" ? k.status : k.risorsa}${k.per === "turno" ? "/t" : ""}`);
  return parts.join(" + ");
}

export function UseAbility({ c, busy, apply }: {
  c: Character; busy: boolean; apply: (fn: () => Promise<Character>) => Promise<Character | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<Options | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ tipo: "nessuno" });
  const [pv, setPv] = useState<Preview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [last, setLast] = useState<string[]>([]);

  // Cambia quando la scheda cambia (risorse, ricariche): ricarica elenco e anteprima
  const ver = JSON.stringify([c.resources, c.combat.cooldowns]);
  const load = useCallback(() => {
    request<Options>("GET", `/characters/${enc(c.id)}/abilita`).then((o) => { setOpts(o); setErr(null); }).catch((e) => setErr(errorText(e)));
  }, [c.id]);
  useEffect(() => { if (open) load(); }, [open, load, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const ab = opts?.abilita.find((a) => a.nome === name) ?? null;
  const side = ab?.bersaglio?.lato ?? "se";
  const needsTarget = side !== "se";
  const body = useMemo(() => ({ abilita: name ?? "", bersaglio: target }), [name, target]);
  const ready = !!ab && (!needsTarget || target.tipo !== "nessuno" || side === "alleato");

  // Anteprima dal server
  useEffect(() => {
    if (!ab || !ready) { setPv(null); setPvErr(null); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      request<Preview>("POST", `/characters/${enc(c.id)}/abilita/anteprima`, body)
        .then((p) => { if (alive) { setPv(p); setPvErr(null); } })
        .catch((e) => { if (alive) { setPv(null); setPvErr(errorText(e)); } });
    }, 200);
    return () => { alive = false; window.clearTimeout(t); };
  }, [JSON.stringify(body), ready, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(a: Ability) {
    setName(a.nome);
    setVals({});
    const s = a.bersaglio?.lato ?? "se";
    setTarget((t) => (s === "se" ? { tipo: "nessuno" } : s === "alleato" ? (t.tipo === "pg" ? t : { tipo: "nessuno" })
      : t.tipo === "creatura" || t.tipo === "voce" ? t : opts?.bersagli.creature[0]
        ? { tipo: "creatura", id: opts.bersagli.creature[0].encounter_id, index: opts.bersagli.creature[0].index } : { tipo: "voce", nome: "Bersaglio" }));
  }

  async function go() {
    if (!ab) return;
    const tiri: Record<string, number> = {};
    if (mine) for (const [k, v] of Object.entries(vals)) if (v.trim() !== "" && Number.isFinite(Number(v))) tiri[k] = Number(v);
    let lines: string[] = [];
    const out = await apply(async () => {
      const r = await request<UseResult>("POST", `/characters/${enc(c.id)}/abilita`, { ...body, tiri });
      lines = r.eventi;
      return r.character;
    });
    if (out) { setLast(lines.slice(-4)); setName(null); setVals({}); }
  }

  if (!open) {
    return (
      <div className="ua-closed">
        <button type="button" className="btn primary" onClick={() => setOpen(true)}>Usa abilità</button>
        {last.length > 0 && <span className="xs muted ua-last" title={last.join("\n")}>{last[last.length - 1]}</span>}
      </div>
    );
  }

  const groups = ORDER.map((k) => ({ k, list: (opts?.abilita ?? []).filter((a) => (a.base ? "attacco" : a.tipo) === k) })).filter((g) => g.list.length);
  const est = pv ? Object.entries(pv.stima).map(([who, s]) =>
    `${who}: ${Object.entries(s).map(([k, [lo, hi]]) => `${lo === hi ? ni(lo) : `${ni(lo)}–${ni(hi)}`} ${k}`).join(", ")}`) : [];

  return (
    <div className="ua" role="group" aria-label="Usa abilità">
      <div className="ua-h">
        <b>Usa abilità</b>
        <span className="spacer" />
        <button type="button" className="btn ghost tv-mini" onClick={() => { setOpen(false); setName(null); }}>Chiudi</button>
      </div>
      {err && <p className="hint bad" role="alert">{err}</p>}
      {!opts && !err && <p className="small muted">Carico le abilità…</p>}

      {opts && !ab && (
        <div className="ua-list">
          {groups.map((g) => (
            <div key={g.k} className="ua-g">
              <span className="label">{KIND_LABEL[g.k]}</span>
              {g.list.map((a) => (
                <button key={a.nome} type="button" className={`ua-it${a.ricarica ? " off" : ""}`} onClick={() => pick(a)}
                  title={[a.descrizione, a.testo ? "Senza meccanica: paga il costo e scrive l'effetto nel registro" : "", a.ricarica ? `In ricarica: ${a.ricarica} turni` : ""].filter(Boolean).join("\n")}>
                  <span>{a.nome}{a.testo && <small className="muted"> · testo</small>}</span>
                  <small className="muted">{a.ricarica ? `⏳ ${a.ricarica}` : costText(a)}</small>
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <p className="small muted">Nessuna abilità.</p>}
        </div>
      )}

      {opts && ab && (
        <div className="ua-step">
          <div className="ua-row"><span className="label">Abilità</span>
            <span><b>{ab.nome}</b> <small className="muted">{costText(ab)}</small></span>
            <button type="button" className="btn ghost tv-mini" onClick={() => setName(null)}>Cambia</button></div>

          {needsTarget && (
            <div className="ua-row ua-targets"><span className="label">Su chi</span>
              <div className="ua-chips">
                {(side === "alleato" || side === "qualsiasi") && (
                  <>
                    <button type="button" className="chip" aria-pressed={target.tipo === "nessuno"} onClick={() => setTarget({ tipo: "nessuno" })}>{c.name} (te)</button>
                    {opts.bersagli.pg.filter((p) => p.id !== c.id).map((p) => (
                      <button key={p.id} type="button" className="chip" aria-pressed={target.tipo === "pg" && target.id === p.id}
                        onClick={() => setTarget({ tipo: "pg", id: p.id })}>{p.nome}</button>
                    ))}
                  </>
                )}
                {(side === "nemico" || side === "qualsiasi") && (
                  <>
                    {opts.bersagli.creature.map((k) => (
                      <button key={`${k.encounter_id}-${k.index}`} type="button" className="chip foe"
                        aria-pressed={target.tipo === "creatura" && target.id === k.encounter_id && target.index === k.index}
                        onClick={() => setTarget({ tipo: "creatura", id: k.encounter_id, index: k.index })}
                        title={`Vita ${ni(k.hp)} / ${ni(k.max)}`}>{k.count > 1 ? `${k.count}× ` : ""}{k.nome} · {ni(k.hp)}</button>
                    ))}
                    <button type="button" className="chip" aria-pressed={target.tipo === "voce"}
                      onClick={() => setTarget({ tipo: "voce", nome: target.nome || "Bersaglio" })}
                      title="Un bersaglio non registrato: dici tu difesa e resistenza">A voce</button>
                  </>
                )}
              </div>
            </div>
          )}
          {target.tipo === "voce" && (
            <div className="ua-row ua-voce">
              <label><span className="xs muted">Nome</span><input className="input" maxLength={60} value={target.nome ?? ""}
                onChange={(e) => setTarget({ ...target, nome: e.target.value })} /></label>
              <label><span className="xs muted">Difesa</span><input className="input num" type="number" min={0} value={target.difesa ?? 0}
                onChange={(e) => setTarget({ ...target, difesa: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label><span className="xs muted">Resistenza %</span><input className="input num" type="number" min={0} max={100} value={target.resistenza ?? 0}
                onChange={(e) => setTarget({ ...target, resistenza: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} /></label>
            </div>
          )}

          <div className="ua-res">
            {ab.testo ? <span className="small">Senza meccanica: paga il costo e scrive nel registro «{ab.descrizione || ab.nome}». Gli effetti li applichi a mano.</span>
              : pv ? <span><b>{est.join(" · ") || "Effetto senza numeri (status o controllo)"}</b>{pv.colpire != null && <> · {pv.colpire}% di colpire</>}</span>
                : pvErr ? <span className="hint bad">{pvErr}</span> : <span className="small muted">Calcolo…</span>}
          </div>
          {mine && pv && (
            <div className="ua-rolls">
              {pv.richieste.map((r) => (
                <label key={r.key}><span className="xs">{r.label}<span className="muted"> · {r.tipo === "d100" ? `d100${r.soglia != null ? ` ≤ ${r.soglia}` : ""}` : `${ni(r.min)}–${ni(r.max)}`}</span></span>
                  <input className="input num" type="number" inputMode="numeric" placeholder="server" value={vals[r.key] ?? ""}
                    onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value }))} /></label>
              ))}
            </div>
          )}
          {pv && pv.passi.length > 0 && (
            <details className="ua-steps"><summary className="xs">Come è calcolato</summary>
              <ul className="xs mono">{pv.passi.slice(0, 30).map((p, i) => <li key={i}>{p}</li>)}</ul></details>
          )}
          <div className="ua-act">
            <button type="button" className="btn ghost" aria-pressed={mine} onClick={() => setMine((m) => !m)}>{mine ? "Tira il server" : "Tiro io i dadi"}</button>
            <button type="button" className="btn primary" disabled={busy || !ready || ab.ricarica > 0 || (!!pvErr && !ab.testo)} onClick={go}>
              {ab.ricarica > 0 ? `In ricarica (${ab.ricarica})` : mine ? "Applica" : "Tira e applica"}
            </button>
          </div>
        </div>
      )}
      {last.length > 0 && <ul className="ua-out xs">{last.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </div>
  );
}
