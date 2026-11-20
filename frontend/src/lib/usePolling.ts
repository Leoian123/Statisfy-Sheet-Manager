import { useEffect, useRef } from "react";

/**
 * Polling leggero: chiama `fn` subito, poi ogni `ms` millisecondi solo con la pagina visibile;
 * quando la pagina torna visibile aggiorna subito. Gli errori restano a `fn` (qui vengono ignorati).
 */
export function usePolling(fn: () => Promise<unknown> | void, ms = 5000, deps: unknown[] = []) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let timer: number | undefined;
    let alive = true;
    let busy = false;
    const run = async () => {
      window.clearTimeout(timer);
      if (!alive || busy) return;
      busy = true;
      try {
        if (document.visibilityState === "visible") await ref.current();
      } catch { /* il chiamante mostra l'errore */ } finally { busy = false; }
      if (alive) timer = window.setTimeout(run, ms);
    };
    const onVis = () => { if (document.visibilityState === "visible") run(); };
    run();
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [ms, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}
