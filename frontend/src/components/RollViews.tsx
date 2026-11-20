/* Risultato di un tiro d100 e righe compatte del registro, con il dettaglio al passaggio del mouse (TipRow). */
import type { Roll, RollMod } from "../api/types";
import { faceLabel } from "./DiceTray";
import { TipRow } from "./TipRow";

const nf = (x: number) => (Math.round(x * 100) / 100).toLocaleString("it-IT");
export const signed = (x: number) => (x >= 0 ? "+" : "−") + nf(Math.abs(x));
export const modsSum = (mods: { mod: number }[]) => mods.reduce((s, m) => s + (Number(m.mod) || 0), 0);
const crit = (r: Roll) => (r.natural === 100 ? " is-crit-hi" : r.natural === 1 ? " is-crit-lo" : "");
const time = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

function ModLines({ mods }: { mods: RollMod[] }) {
  return <>{mods.map((m, i) => (
    <span key={i} className="tline"><span>{m.kind} · {m.name}{m.text ? <span className="muted"> — {m.text}</span> : null}</span><span className="mono">{signed(m.mod)}</span></span>
  ))}</>;
}

function Detail({ r, who }: { r: Roll; who?: boolean }) {
  return <>
    {who && <span><b>{r.char_name}</b>{r.secret ? " · segreto" : ""}{r.author_name && r.by === "giocatore" ? <span className="muted"> · tirato da {r.author_name}</span> : null}</span>}
    <span className="tline"><span>Decine {faceLabel("tens", r.tens)} + unità {r.units}</span><span className="mono">{r.natural}{r.natural === 100 ? " (00 + 0)" : ""}</span></span>
    <ModLines mods={r.mods} />
    <span className="tline tsum"><span>Totale</span><span className="mono">{nf(r.total)}</span></span>
    <span className="muted">{new Date(r.created_at).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
  </>;
}

/** Risultato dell'ultimo tiro sotto il vassoio: 100 e 01 naturali evidenziati, dettaglio al passaggio del mouse. */
export function RollResult({ r, empty }: { r: Roll | null; empty: string }) {
  if (!r) return <p className="small muted dt-res-empty">{empty}</p>;
  return (
    <TipRow className={`dt-res${crit(r)}`} tip={<Detail r={r} />}>
      <div className="dt-res-main">
        <span className="dt-res-nat"><span className="label">d100</span><b className="num">{r.natural}</b></span>
        {r.mods.length > 0 && <span className="dt-res-op">{signed(r.total - r.natural)}</span>}
        <span className="dt-res-tot"><span className="label">Totale</span><b className="num">{nf(r.total)}</b></span>
        {r.natural === 100 ? <span className="chip gold">100 naturale</span> : r.natural === 1 ? <span className="chip bad">01 naturale</span> : null}
        {r.secret && <span className="chip muted">segreto</span>}
      </div>
      <span className="small dt-res-why">{r.reason || "Tiro libero"}{r.mods.length ? ` · ${r.mods.map((m) => m.name).join(", ")}` : ""}</span>
    </TipRow>
  );
}

/** Registro dei tiri: righe compatte (ora, chi, motivo, naturale, totale). */
export function RollLog({ rolls, showWho, empty }: { rolls: Roll[]; showWho?: boolean; empty: string }) {
  if (!rolls.length) return <p className="small muted">{empty}</p>;
  return (
    <div className="dt-log">
      {rolls.map((r, i) => (
        <TipRow key={r.id} className={`dt-log-row${showWho ? " has-who" : ""}${crit(r)}${i >= rolls.length - 3 && rolls.length > 4 ? " tip-up" : ""}`} tip={<Detail r={r} who={showWho} />}>
          <span className="xs muted num">{time(r.created_at)}</span>
          {showWho && <span className="dt-log-who">{r.char_name}{r.secret && <span className="chip muted">segreto</span>}</span>}
          <span className="dt-log-what small">{r.reason || "Tiro libero"}{r.mods.length > 0 && <span className="xs muted"> · {r.mods.length} allegat{r.mods.length === 1 ? "o" : "i"}</span>}</span>
          <span className="num dt-log-nat">{r.natural}</span>
          <b className="num dt-log-tot">{nf(r.total)}</b>
        </TipRow>
      ))}
    </div>
  );
}
