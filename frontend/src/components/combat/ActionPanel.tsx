/* Pannello azione: abilità di chi agisce (per tipo), bersagli, anteprima del calcolo dal server e tiri
   (del server oppure inseriti dal tavolo). I numeri li calcola solo il backend (POST /scontri/{id}/anteprima). */
import { useEffect, useMemo, useState } from "react";
import { errorText } from "../../api/client";
import { battleApi, type Battle, type BattlePreview, type CombatAbility, type Combatant } from "../../api/scontri";
import { ni } from "./CombatantCard";

const ROMAN = ["—", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const KIND_TABS: { key: string; label: string }[] = [
  { key: "incantesimo", label: "Incantesimi" }, { key: "miracolo", label: "Miracoli" },
  { key: "skill", label: "Skill" }, { key: "attacco", label: "Attacco" },
];
const RES_KEY: Record<string, keyof Combatant> = { MP: "mp", SP: "sp", KI: "ki", HP: "hp" };

export function costText(a: CombatAbility): string {
  const parts = a.costi.map((k) => `${ni(k.valore)} ${k.risorsa === "stack" ? k.status : k.risorsa}${k.per === "turno" ? "/t" : ""}`);
  if (a.cd?.valore) parts.push(`CD ${a.cd.valore}${a.cd.unita === "turni" ? "" : ` ${a.cd.unita}`}`);
  return parts.join(" · ") || "gratis";
}

/** Perché l'abilità non si può usare adesso (controllo indicativo: decide comunque il server). */
export function blocked(c: Combatant, a: CombatAbility, myTurn: boolean, forza: boolean): string | null {
  if (!c.vivo) return "a terra";
  if (a.timing === "reazione") return "solo come reazione";
  if (!myTurn && !forza) return "non è il tuo turno";
  const cd = c.cooldown?.[a.nome];
  if (cd) return `in ricarica (${cd})`;
  if (c.ricarica_reale?.[a.nome]) return `ricarica fino a ${c.ricarica_reale[a.nome]}`;
  for (const k of a.costi) {
    const key = RES_KEY[k.risorsa];
    if (k.per === "lancio" && key && Number(c[key] ?? 0) < k.valore) return `${k.risorsa} insufficienti`;
  }
  if (!forza && a.azione !== "libera") {
    const slot = a.azione === "reazione" ? "reazione" : a.azione;
    if ((c.azioni?.[slot as "principale"] ?? 0) <= 0) return `azione ${slot} già usata`;
  }
  const stun = c.status.find((s) => s.mod?.salta_turno);
  if (stun) return stun.nome.toLowerCase();
  if ((a.tipo === "incantesimo" || a.tipo === "miracolo") && c.status.some((s) => s.mod?.silenzio)) return "silenziato";
  return null;
}

/** Combattenti che l'abilità può scegliere come bersaglio. */
export function targetPool(b: Battle, actor: Combatant, a: CombatAbility | null): Combatant[] {
  if (!a?.bersaglio || a.bersaglio.lato === "se") return [];
  const all = Object.values(b.state.combattenti).filter((x) => x.vivo);
  const L = a.bersaglio.lato;
  return all.filter((x) => L === "qualsiasi" || (L === "nemico" ? x.lato !== actor.lato : x.lato === actor.lato));
}

export function maxTargets(a: CombatAbility | null): number {
  const t = a?.bersaglio;
  if (!t || t.lato === "se" || t.forma === "tutti" || t.forma === "casuale") return 0;
  if (t.forma === "singolo") return 1;
  return Math.max(1, Number(t.n) || 1);
}

interface Props {
  battle: Battle;
  actor: Combatant;
  myTurn: boolean;
  sel: string[];
  setSel: (ids: string[]) => void;
  busy: boolean;
  onAct: (abilita: string, bersagli: string[], tiri: Record<string, number>, forza: boolean) => void;
  onStop: (abilita: string) => void;
}

export function ActionPanel({ battle, actor, myTurn, sel, setSel, busy, onAct, onStop }: Props) {
  const usable = actor.abilita.filter((a) => a.tipo !== "passiva");
  const passives = actor.abilita.filter((a) => a.tipo === "passiva");
  const tabs = KIND_TABS.filter((t) => usable.some((a) => a.tipo === t.key));
  const [kind, setKind] = useState(tabs[0]?.key ?? "attacco");
  const [abName, setAbName] = useState<string | null>(null);
  const [forza, setForza] = useState(false);
  const [mode, setMode] = useState<"server" | "tavolo">("server");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<BattlePreview | null>(null);
  const [pvErr, setPvErr] = useState<string | null>(null);

  const ab = usable.find((a) => a.nome === abName) ?? null;
  const pool = useMemo(() => targetPool(battle, actor, ab), [battle, actor, ab]);
  const maxT = maxTargets(ab);
  const why = ab ? blocked(actor, ab, myTurn, forza) : null;
  const validSel = sel.filter((id) => pool.some((p) => p.id === id)).slice(0, maxT || 20);

  useEffect(() => { setAbName(null); setVals({}); setPv(null); }, [actor.id]);
  useEffect(() => { if (!tabs.some((t) => t.key === kind) && tabs[0]) setKind(tabs[0].key); }, [tabs, kind]);

  // Anteprima dal server (debounce), a ogni cambio di abilità, bersagli o stato dello scontro
  const key = `${battle.id}:${battle.version}:${actor.id}:${abName}:${validSel.join(",")}`;
  useEffect(() => {
    if (!ab) { setPv(null); setPvErr(null); return; }
    let alive = true;
    const t = window.setTimeout(() => {
      battleApi.preview(battle.id, actor.id, ab.nome, validSel)
        .then((p) => { if (alive) { setPv(p); setPvErr(null); } })
        .catch((e) => { if (alive) { setPv(null); setPvErr(errorText(e)); } });
    }, 250);
    return () => { alive = false; window.clearTimeout(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(a: CombatAbility) {
    setAbName(a.nome);
    setVals({});
    const p = targetPool(battle, actor, a);
    const m = maxTargets(a);
    const keep = sel.filter((id) => p.some((x) => x.id === id)).slice(0, m || 20);
    if (!keep.length && p.length === 1) setSel([p[0].id]);
    else setSel(keep);
  }

  function submit() {
    if (!ab) return;
    const tiri: Record<string, number> = {};
    if (mode === "tavolo") for (const [k, v] of Object.entries(vals)) if (v.trim() !== "" && Number.isFinite(Number(v))) tiri[k] = Number(v);
    onAct(ab.nome, validSel, tiri, forza);
  }

  const names = (id: string) => battle.state.combattenti[id]?.nome ?? id;
  const list = usable.filter((a) => a.tipo === kind);

  return (
    <div className="cb-act">
      <div className="cb-act-h">
        <div className="stack" style={{ gap: 0 }}>
          <span className="label">{myTurn ? "Tocca a" : "Agisce"}</span>
          <b className="cb-act-name">{actor.nome}</b>
        </div>
        <span className="spacer" />
        <span className="chip muted xs" title="Azioni rimaste in questo turno">
          Azione {actor.azioni?.principale ?? 0} · Bonus {actor.azioni?.bonus ?? 0} · Reazione {actor.azioni?.reazione ?? 0}
        </span>
        {battle.master && (
          <label className="cb-force small" title="Il Master ignora turno, azioni e timing">
            <input type="checkbox" checked={forza} onChange={(e) => setForza(e.target.checked)} /> Forza
          </label>
        )}
      </div>

      <div className="seg cb-tabs-k" role="tablist" aria-label="Tipo di abilità">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={kind === t.key} aria-pressed={kind === t.key}
            onClick={() => setKind(t.key)}>{t.label} <small>{usable.filter((a) => a.tipo === t.key).length}</small></button>
        ))}
      </div>

      <div className="cb-abs" role="list">
        {list.map((a) => {
          const no = blocked(actor, a, myTurn, forza);
          return (
            <button key={a.nome} type="button" role="listitem" className={`cb-ab${abName === a.nome ? " on" : ""}${no ? " off" : ""}`}
              onClick={() => pick(a)} title={[a.descrizione, no ? `Ora non disponibile: ${no}` : ""].filter(Boolean).join("\n")}>
              <span className="cb-ab-t"><b>{a.nome}</b>{a.grado ? <span className="muted"> {ROMAN[Math.min(10, a.grado)] ?? a.grado}</span> : null}</span>
              <span className="xs muted">{[a.etichette.slice(0, 2).join(" · "), a.durata !== "istantaneo" ? a.durata : "", costText(a)].filter(Boolean).join(" · ")}</span>
              {no && <span className="xs cb-ab-no">{no}</span>}
            </button>
          );
        })}
        {!list.length && <p className="small muted">Nessuna abilità di questo tipo.</p>}
      </div>
      {passives.length > 0 && (
        <p className="xs muted" title={passives.map((p) => `${p.nome}: ${p.descrizione || "passiva"}`).join("\n")}>
          Passive attive: {passives.map((p) => p.nome).join(", ")}
        </p>
      )}

      {actor.mantenuti.length > 0 && (
        <div className="cb-maint">
          {actor.mantenuti.map((m) => (
            <div key={m.abilita} className="cb-maint-r">
              <span className="small">↻ <b>{m.abilita}</b> <span className="muted">da {m.turni} turni</span></span>
              <button type="button" className="btn ghost" disabled={busy} onClick={() => onStop(m.abilita)}>Interrompi</button>
            </div>
          ))}
        </div>
      )}

      {ab && (
        <div className="cb-pv">
          <div className="cb-pv-row">
            <span className="label">Bersaglio</span>
            {ab.bersaglio?.lato === "se" ? <span className="small">{actor.nome} (sé)</span>
              : maxT === 0 ? <span className="small">{ab.bersaglio?.forma === "tutti" ? "tutti" : "casuali"}</span>
                : (
                  <div className="cb-tg">
                    {pool.map((p) => {
                      const on = validSel.includes(p.id);
                      return (
                        <button key={p.id} type="button" className={`chip cb-tg-b${on ? " on" : ""}`} aria-pressed={on}
                          onClick={() => setSel(on ? validSel.filter((x) => x !== p.id) : maxT === 1 ? [p.id] : [...validSel, p.id].slice(0, maxT))}>
                          {p.nome}
                        </button>
                      );
                    })}
                    {maxT > 1 && <span className="xs muted">fino a {maxT}</span>}
                  </div>
                )}
          </div>
          {pvErr && <p className="hint bad" role="alert">{pvErr}</p>}
          {pv && (
            <>
              {Object.entries(pv.stima).map(([cid, s]) => (
                <div key={cid} className="cb-pv-row">
                  <span className="small">{names(cid)}</span>
                  <span className="mono small">
                    {Object.entries(s).map(([k, [lo, hi]]) => (
                      <span key={k} className={`cb-pv-v ${k}`}>{k} {lo === hi ? ni(lo) : `${ni(lo)}–${ni(hi)}`}</span>
                    ))}
                  </span>
                </div>
              ))}
              {!Object.keys(pv.stima).length && <p className="xs muted">Nessun numero da stimare: effetti di status o di controllo.</p>}
              {pv.passi.length > 0 && (
                <details className="cb-steps">
                  <summary className="xs">Passaggi del calcolo</summary>
                  <ul className="xs mono">{pv.passi.slice(0, 30).map((p, i) => <li key={i}>{p}</li>)}</ul>
                </details>
              )}
              {pv.reazioni.length > 0 && (
                <p className="xs warn">Possibile reazione: {pv.reazioni.map((r) => `${r.nome} (${r.abilita})`).join(", ")}</p>
              )}
            </>
          )}
          <div className="seg cb-mode" role="group" aria-label="Chi tira i dadi">
            <button type="button" aria-pressed={mode === "server"} onClick={() => setMode("server")}>Tira il server</button>
            <button type="button" aria-pressed={mode === "tavolo"} onClick={() => setMode("tavolo")}>Dadi del tavolo</button>
          </div>
          {mode === "tavolo" && pv && (
            <div className="cb-rolls">
              {pv.richieste.filter((r) => !r.key.startsWith("ini:")).map((r) => (
                <label key={r.key} className="cb-roll">
                  <span className="xs">{r.label}{r.tipo === "d100" ? <span className="muted"> · d100{r.soglia != null ? ` ≤ ${r.soglia}` : ""}</span>
                    : <span className="muted"> · {ni(r.min)}–{ni(r.max)}</span>}</span>
                  <input className="input num" type="number" inputMode="numeric" min={r.tipo === "d100" ? 1 : r.min} max={r.tipo === "d100" ? 100 : r.max}
                    placeholder="server" value={vals[r.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [r.key]: e.target.value }))} />
                </label>
              ))}
              <p className="xs muted">I tiri lasciati vuoti li fa il server.</p>
            </div>
          )}
          {why && <p className="hint warn">{why}{battle.master && !forza ? " — puoi forzare." : ""}</p>}
          <button type="button" className="btn primary cb-go" disabled={busy || !!why || (maxT > 0 && !validSel.length && pool.length > 1)}
            onClick={submit}>
            {mode === "server" ? "Tira e risolvi" : "Risolvi con questi tiri"}
          </button>
        </div>
      )}
      {!ab && <p className="small muted">Scegli un'abilità: vedrai l'anteprima del calcolo prima di confermare.</p>}
    </div>
  );
}
