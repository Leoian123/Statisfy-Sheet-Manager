import { useId, type ReactNode } from "react";

interface Props {
  className: string;
  tip: ReactNode;
  children: ReactNode;
}

/**
 * Riga compatta (etichetta + valore) con dettagli in un tooltip che compare al passaggio del mouse
 * o al focus da tastiera. Il tooltip occupa la larghezza della riga: niente scroll orizzontale.
 */
export function TipRow({ className, tip, children }: Props) {
  const id = useId();
  return (
    <div className={`tiprow ${className}`} tabIndex={0} aria-describedby={id}>
      {children}
      <div className="tip" role="tooltip" id={id}>{tip}</div>
    </div>
  );
}
