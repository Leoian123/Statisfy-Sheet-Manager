import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  gold?: boolean;
  /** Variante "finestra di stato" alla Overgeared: titolo centrato con ornamento alato */
  og?: boolean;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Ornamento alato con gemma centrale (finestre e tooltip stile Overgeared). */
export function Ornament() {
  const wing = "M90 13 C 76 3, 52 1, 12 8 C 40 7, 62 9, 78 14 C 60 12, 38 14, 20 21 C 46 16, 68 17, 90 13 Z";
  return (
    <svg className="og-orn" viewBox="0 0 200 26" aria-hidden="true" focusable="false">
      <path className="og-wing" d={wing} />
      <path className="og-wing" d={wing} transform="matrix(-1 0 0 1 200 0)" />
      <path className="og-gem" d="M100 2 L109 13 L100 24 L91 13 Z" />
    </svg>
  );
}

/** "Finestra di sistema": pannello bordato con header telegrafico. */
export function Win({ title, gold, og, right, className, children }: Props) {
  const cls = `win${gold ? " gold" : ""}${og ? " og-win" : ""}${className ? ` ${className}` : ""}`;
  if (og) {
    return (
      <section className={cls}>
        <header className="og-h"><Ornament /><h3 className="og-t">{title}</h3>{right}</header>
        <div className="win-b">{children}</div>
      </section>
    );
  }
  return (
    <section className={cls}>
      <header className="win-h">
        {title}
        {right != null && <><span className="spacer" />{right}</>}
      </header>
      <div className="win-b">{children}</div>
    </section>
  );
}
