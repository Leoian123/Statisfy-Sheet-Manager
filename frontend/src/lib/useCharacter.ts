import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "../api/client";
import type { Character } from "../api/types";

/** Carica un PG per id; `setChar` aggiorna con la risposta di una mutazione. */
export function useCharacter(id: number) {
  const [char, setChar] = useState<Character | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    setChar((c) => (c && c.id === id ? c : null));
    if (!Number.isFinite(id) || id <= 0) { setError("Personaggio non valido."); return; }
    api.character(id)
      .then((c) => { if (alive) setChar(c); })
      .catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [id, nonce]);

  const reload = useCallback(() => setNonce((x) => x + 1), []);
  return { char, setChar, error, reload };
}

/** Esegue una mutazione gestendo stato "in corso" ed errore. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
