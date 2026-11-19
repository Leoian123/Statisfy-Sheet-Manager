import type { ReactNode } from "react";
import { Win } from "./Win";

export function Loading({ text = "Caricamento…" }: { text?: string }) {
  return <p className="loading muted small" role="status"><span className="loading-dot" aria-hidden="true" />{text}</p>;
}

export function ErrorBox({ title = "Errore", message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <Win title={title}>
      <div className="sysmsg bad" role="alert">
        <span className="tag">[SISTEMA]</span>
        <span>{message}</span>
      </div>
      {action && <div className="row">{action}</div>}
    </Win>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="hint bad" role="alert">{message}</p>;
}

export function SysMsg({ tag = "[SISTEMA]", gold, lines, children }: { tag?: string; gold?: boolean; lines?: ReactNode[]; children?: ReactNode }) {
  return (
    <div className={`sysmsg${gold ? " gold" : ""}`}>
      <span className="tag">{tag}</span>
      {lines?.map((l, i) => <span key={i}>{l}</span>)}
      {children}
    </div>
  );
}
