// Dati condivisi dopo il login: configurazione regole e lista dei PG visibili (per selettore e redirect).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, errorText } from "../api/client";
import type { CharacterSummary, RulesConfig } from "../api/types";

interface AppData {
  rules: RulesConfig | null;
  chars: CharacterSummary[] | null;
  error: string | null;
  refreshChars: () => Promise<void>;
  reload: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<RulesConfig | null>(null);
  const [chars, setChars] = useState<CharacterSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all([api.rules(), api.characters()])
      .then(([r, c]) => { if (alive) { setRules(r); setChars(c); } })
      .catch((e) => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [nonce]);

  const refreshChars = useCallback(async () => {
    try { setChars(await api.characters()); } catch { /* il selettore resta com'era */ }
  }, []);
  const reload = useCallback(() => setNonce((x) => x + 1), []);

  const value = useMemo(() => ({ rules, chars, error, refreshChars, reload }), [rules, chars, error, refreshChars, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppData(): AppData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAppData fuori da AppDataProvider");
  return v;
}
