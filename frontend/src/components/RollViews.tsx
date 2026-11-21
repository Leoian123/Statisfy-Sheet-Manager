/* Risultato di un tiro d100 e righe compatte del registro, con il dettaglio al passaggio del mouse (TipRow).
   Critici (regola del Master): prima del tiro si dichiara sopra o sotto; il server calcola `crit` sul naturale. */
import { Link } from "react-router-dom";
import type { Roll, RollCall, RollCrit, RollMod } from "../api/types";
import { faceLabel } from "./DiceTray";
import { TipRow } from "./TipRow";

const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
export const signed = (x: number) => (x >= 0 ? "+" : "−") + nf(Math.abs(x));
export const modsSum = (mods: { mod: number }[]) => mods.reduce((s, m) => s + (Number(m.mod) || 0), 0);
const crit = (r: Roll) => (r.crit === "supercritico" ? " is-supercrit" : r.crit === "critico" ? " is-crit" : "");
export const CALL_LABEL: Record<RollCall, string> = { sopra: "Sopra", sotto: "Sotto" };
const CALL_ARROW: Record<RollCall, string> = { sopra: "↑", sotto: "↓" };
export const CALL_HINT: Record<RollCall, string> = {
  sopra: "Sopra: 91–99 critico, 100 supercritico (conta il naturale)",
  sotto: "Sotto: 2–9 critico, 1 supercritico (conta il naturale)",
};

/** Chip del critico: "Critico" o "Supercritico" (più marcato). Niente se il tiro non è critico. */
export function CritChip({ crit: c }: { crit: RollCrit }) {
  if (!c) return null;
  return c === "supercritico"
    ? <span className="chip crit-chip is-super">✦ Supercritico</span>
    : <span className="chip crit-chip">Critico</span>;
}

/** Dichiarazione del tiro: "↑ Sopra" / "↓ Sotto" (compatta: solo la freccia, con il testo per gli screen reader). */
export function CallTag({ call, compact }: { call: RollCall | null; compact?: boolean }) {
  if (!call) return compact ? <span className="call-tag is-none" aria-hidden="true" /> : null;
  return (
    <span className={`call-tag is-${call}`} title={`Dichiarato: ${CALL_LABEL[call]}`}>
      <span aria-hidden="true">{CALL_ARROW[call]}</span>{compact ? <span className="sr-only">{CALL_LABEL[call]}</span> : ` ${CALL_LABEL[call]}`}
    </span>
  );
}
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function ModLines({ mods }: { mods: RollMod[] }) {
  return <>{mods.map((m, i) => (
    <span key={i} className="tline"><span>{m.kind} · {m.name}{m.text ? <span className="muted"> — {m.text}</span> : null}</span><span className="mono">{signed(m.mod)}</span></span>
  ))}</>;
}

function Detail({ r, who }: { r: Roll; who?: boolean }) {
  return <>
    {who && <span><b>{r.char_name}</b>{r.secret ? " · segreto" : ""}{r.author_name && r.by === "giocatore" ? <span className="muted"> · tirato da {r.author_name}</span> : null}</span>}
    <span className="tline"><span>Dichiarato</span><span>{r.call ? CALL_LABEL[r.call] : "nessuna dichiarazione"}</span></span>
    <span className="tline"><span>Decine {faceLabel("tens", r.tens)} + unità {r.units}</span><span className="mono">{r.natural}{r.natural === 100 ? " (00 + 0)" : ""}</span></span>
    {r.crit && <span className="tline"><span>Esito sul naturale</span><span className="crit-t">{r.crit === "supercritico" ? "Supercritico" : "Critico"}</span></span>}
    <ModLines mods={r.mods} />
    <span className="tline tsum"><span>Totale</span><span className="mono">{nf(r.total)}</span></span>
    <span className="muted">{new Date(r.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
  </>;
}

/** Risultato dell'ultimo tiro sotto il vassoio: dichiarazione, chip del critico, dettaglio al passaggio del mouse. */
export function RollResult({ r, empty }: { r: Roll | null; empty: string }) {
  if (!r) return <p className="small muted dt-res-empty">{empty}</p>;
  return (<>
    <TipRow className={`dt-res${crit(r)}`} tip={<Detail r={r} />}>
      <div className="dt-res-main">
        <span className="dt-res-nat"><span className="label">d100</span><b className="num">{r.natural}</b></span>
        {r.mods.length > 0 && <span className="dt-res-op">{signed(r.total - r.natural)}</span>}
        <span className="dt-res-tot"><span className="label">Totale</span><b className="num">{nf(r.total)}</b></span>
        <CallTag call={r.call} />
        <CritChip crit={r.crit} />
        {r.secret && <span className="chip muted">segreto</span>}
      </div>
      <span className="small dt-res-why">{r.reason || "Tiro libero"}{r.mods.length ? ` · ${r.mods.map((m) => m.name).join(", ")}` : ""}</span>
    </TipRow>
    {r.char_id != null && (
      <Link className="xs dt-res-note" style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }} to={`/diario?char=${encodeURIComponent(r.char_id)}&roll=${encodeURIComponent(r.id)}`}>Annota nel diario</Link>
    )}
  </>);
}

/** Registro dei tiri: righe compatte (ora, chi, motivo + critico, dichiarazione, naturale, totale). */
export function RollLog({ rolls, showWho, empty }: { rolls: Roll[]; showWho?: boolean; empty: string }) {
  if (!rolls.length) return <p className="small muted">{empty}</p>;
  return (
    <div className="dt-log">
      {rolls.map((r, i) => (
        <TipRow key={r.id} className={`dt-log-row${showWho ? " has-who" : ""}${crit(r)}${i >= rolls.length - 3 && rolls.length > 4 ? " tip-up" : ""}`} tip={<Detail r={r} who={showWho} />}>
          <span className="xs muted num">{time(r.created_at)}</span>
          {showWho && <span className="dt-log-who">{r.char_name}{r.secret && <span className="chip muted">segreto</span>}</span>}
          <RollWhat r={r} />
          <CallTag call={r.call} compact />
          <span className="num dt-log-nat">{r.natural}</span>
          <b className="num dt-log-tot">{nf(r.total)}</b>
        </TipRow>
      ))}
    </div>
  );
}

/** Cella "per cosa" di una riga del registro: il testo si accorcia, il chip del critico resta intero. */
export function RollWhat({ r }: { r: Roll }) {
  return (
    <span className="dt-log-what small">
      <span className="dt-log-txt">{r.reason || "Tiro libero"}{r.mods.length > 0 && <span className="xs muted"> · {r.mods.length} allegat{r.mods.length === 1 ? "o" : "i"}</span>}</span>
      <CritChip crit={r.crit} />
    </span>
  );
}
