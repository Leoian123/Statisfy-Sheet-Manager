/* Registro unico della Plancia di gioco: tiri d100 e righe del combattimento, dal più recente, con filtro
   Tutto / Tiri / Combattimento (ricordato nel browser). Le righe del combattimento hanno l'ora in `combat.log_at`;
   quelle vecchie senza ora vanno in fondo, nell'ordine in cui sono state scritte. */
import { useState, type ReactNode } from "react";
import type { Character, Roll } from "../api/types";
import { CallTag, RollWhat, signed } from "./RollViews";
import { TipRow } from "./TipRow";
import { faceLabel } from "./DiceTray";

type Filter = "tutto" | "tiri" | "combattimento";
const FILTER_KEY = "statisfy-register-filter";
const PAGE = 20;
const LABELS: Record<Filter, string> = { tutto: "Tutto", tiri: "Tiri", combattimento: "Combattimento" };
const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

function readFilter(): Filter {
  try { const v = localStorage.getItem(FILTER_KEY); return v === "tiri" || v === "combattimento" ? v : "tutto"; } catch { return "tutto"; }
}

type Entry =
  | { kind: "roll"; key: string; at: number; r: Roll }
  | { kind: "combat"; key: string; at: number; text: string; iso: string; seq: number };

/** Righe del combattimento con l'ora (log_at è parallelo a log dalla fine). */
function combatEntries(c: Character): Entry[] {
  const log = c.combat.log ?? [];
  const at = c.combat.log_at ?? [];
  const off = log.length - at.length;
  return log.map((text, i) => {
    const iso = i - off >= 0 ? at[i - off] || "" : "";
    const t = iso ? Date.parse(iso) : NaN;
    return { kind: "combat" as const, key: `c${i}-${text}`, at: Number.isFinite(t) ? t : -Infinity, text, iso, seq: i };
  });
}

export function PlayRegister({ c, rolls, error, loading }: { c: Character; rolls: Roll[]; error?: ReactNode; loading?: boolean }) {
  const [filter, setFilterRaw] = useState<Filter>(readFilter);
  const [max, setMax] = useState(PAGE);
  const setFilter = (f: Filter) => { setFilterRaw(f); try { localStorage.setItem(FILTER_KEY, f); } catch { /* facoltativo */ } };

  const rollE: Entry[] = rolls.map((r) => ({ kind: "roll", key: `r${r.id}`, at: Date.parse(r.created_at), r }));
  const combE = combatEntries(c);
  const sorted = (filter === "tiri" ? rollE : filter === "combattimento" ? combE : [...rollE, ...combE])
    .sort((a, b) => (b.at - a.at) || ((b.kind === "combat" ? b.seq : 0) - (a.kind === "combat" ? a.seq : 0)));
  const all = sorted.slice(0, max);
  const counts = { tutto: rollE.length + combE.length, tiri: rollE.length, combattimento: combE.length };

  return (
    <section className="win pg-log" aria-labelledby="pg-log-h">
      <header className="win-h" id="pg-log-h">
        Registro
        <span className="spacer" />
        <span className="seg pg-filter" role="group" aria-label="Filtro del registro">
          {(Object.keys(LABELS) as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {LABELS[f]} <span className="num xs muted">{counts[f]}</span>
            </button>
          ))}
        </span>
      </header>
      <div className="win-b">
        {error}
        {loading && !rolls.length && filter !== "combattimento" ? <p className="small muted">Caricamento…</p>
          : !all.length ? <p className="small muted">{filter === "tiri" ? "Ancora nessun tiro." : filter === "combattimento" ? "Nessun evento di combattimento." : "Ancora niente nel registro."}</p>
          : (
            <div className="dt-log pg-log-list">
              {all.map((e, i) => {
                const up = i >= all.length - 3 && all.length > 4 ? " tip-up" : "";
                if (e.kind === "roll") {
                  const r = e.r;
                  return (
                    <TipRow key={e.key} className={`dt-log-row pg-row-roll${r.crit === "supercritico" ? " is-supercrit" : r.crit ? " is-crit" : ""}${up}`} tip={<>
                      <span className="tline"><span>Dichiarato</span><span>{r.call === "sopra" ? "Sopra" : r.call === "sotto" ? "Sotto" : "nessuna dichiarazione"}</span></span>
                      <span className="tline"><span>Decine {faceLabel("tens", r.tens)} + unità {r.units}</span><span className="mono">{r.natural}</span></span>
                      {r.crit && <span className="tline"><span>Esito sul naturale</span><span className="crit-t">{r.crit === "supercritico" ? "Supercritico" : "Critico"}</span></span>}
                      {r.mods.map((m, j) => <span key={j} className="tline"><span>{m.kind} · {m.name}{m.text ? <span className="muted"> — {m.text}</span> : null}</span><span className="mono">{signed(m.mod)}</span></span>)}
                      <span className="tline tsum"><span>Totale</span><span className="mono">{nf(r.total)}</span></span>
                      <span className="muted">{when(r.created_at)}{r.author_name && r.by === "giocatore" ? ` · tirato da ${r.author_name}` : ""}</span>
                    </>}>
                      <span className="xs muted num">{time(r.created_at)}</span>
                      <RollWhat r={r} />
                      <CallTag call={r.call} compact />
                      <span className="num dt-log-nat">{r.natural}</span>
                      <b className="num dt-log-tot">{nf(r.total)}</b>
                    </TipRow>
                  );
                }
                const m = /^T(\d+) · (.*)$/.exec(e.text);
                return (
                  <TipRow key={e.key} className={`dt-log-row pg-row-cb${up}`} tip={<>
                    <span>{e.text}</span>
                    <span className="muted">{e.iso ? when(e.iso) : "Ora non registrata (riga di prima del registro unico)"}</span>
                  </>}>
                    <span className="xs muted num">{e.iso ? time(e.iso) : "—"}</span>
                    <span className="pg-cb-txt small">{m ? m[2] : e.text}</span>
                    <span className="chip violet num pg-cb-turn" title="Turno">T{m ? m[1] : "?"}</span>
                  </TipRow>
                );
              })}
            </div>
          )}
        {sorted.length > all.length && (
          <button type="button" className="btn ghost tv-mini pg-more" onClick={() => setMax((m) => m + PAGE)}>
            Mostra altri ({sorted.length - all.length})</button>
        )}
      </div>
    </section>
  );
}
