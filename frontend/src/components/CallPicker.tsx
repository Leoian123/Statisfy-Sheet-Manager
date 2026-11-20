/* Selettore segmentato Sopra / Sotto: la dichiarazione che il giocatore fa a voce prima di tirare il d100.
   Per i PG è obbligatoria (il Lancia resta bloccato finché non si sceglie); il Master può anche non dichiarare. */
import type { RollCall } from "../api/types";
import { CALL_HINT } from "./RollViews";

interface Props {
  value: RollCall | null;
  onChange: (v: RollCall | null) => void;
  /** Il Master può tirare senza dichiarazione: aggiunge "Nessuna". */
  allowNone?: boolean;
  /** Evidenzia la scelta mancante (dopo un tentativo di lancio). */
  missing?: boolean;
  disabled?: boolean;
  id: string;
}

export function CallPicker({ value, onChange, allowNone, missing, disabled, id }: Props) {
  const opt = (v: RollCall, label: string, sub: string) => (
    <button type="button" aria-pressed={value === v} disabled={disabled} title={CALL_HINT[v]} onClick={() => onChange(v)}>
      <b>{label}</b><span>{sub}</span>
    </button>
  );
  return (
    <div className={`call-pick${missing && !value ? " is-missing" : ""}`} role="group" aria-labelledby={`${id}-l`} aria-describedby={`${id}-h`}>
      <span className="label" id={`${id}-l`}>Dichiara prima di tirare{allowNone ? " (facoltativo)" : ""}</span>
      <div className={`call-seg${allowNone ? " has-none" : ""}`}>
        {allowNone && (
          <button type="button" aria-pressed={value == null} disabled={disabled} title="Nessuna dichiarazione: nessun critico" onClick={() => onChange(null)}>
            <b>—</b><span>nessuna</span>
          </button>
        )}
        {opt("sopra", "↑ Sopra", "91–99 · 100")}
        {opt("sotto", "↓ Sotto", "2–9 · 1")}
      </div>
      <span className={`hint${missing && !value ? " warn" : ""}`} id={`${id}-h`} aria-live="polite">
        {missing && !value ? "Scegli Sopra o Sotto per lanciare."
          : value ? `${CALL_HINT[value]}.` : allowNone ? "Senza dichiarazione il tiro non ha critici." : "Conta il naturale, non il totale."}
      </span>
    </div>
  );
}
