import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  gold?: boolean;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** "Finestra di sistema": pannello bordato con header telegrafico. */
export function Win({ title, gold, right, className, children }: Props) {
  return (
    <section className={`win${gold ? " gold" : ""}${className ? ` ${className}` : ""}`}>
      <header className="win-h">
        {title}
        {right != null && <><span className="spacer" />{right}</>}
      </header>
      <div className="win-b">{children}</div>
    </section>
  );
}
