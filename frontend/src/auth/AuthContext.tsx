import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { TOKEN_KEY, api, getToken, setToken, setUnauthorizedHandler } from "../api/client";
import type { User } from "../api/types";

interface AuthState {
  user: User | null;
  /** true finché non si sa se il token salvato è valido */
  checking: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  /** Dopo il cambio password: il server dà un token nuovo (i vecchi sono revocati). */
  replaceSession: (token: string, user: User) => void;
  /** Aggiorna i dati dell'utente (es. nome visibile) senza toccare il token. */
  setCurrentUser: (user: User) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState<boolean>(() => !!getToken());

  const logout = useCallback(() => {
    // Il server revoca il token (vale anche se qualcuno l'ha copiato); l'uscita locale non aspetta la risposta
    if (getToken()) api.logout().catch(() => { /* già scaduto o server irraggiungibile: si esce comunque */ });
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Più schede: il token è condiviso in localStorage. Se un'altra scheda esce o entra con un altro utente,
  // questa scheda non deve restare con l'interfaccia del vecchio utente e il token del nuovo: si ricarica.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== TOKEN_KEY && e.key !== null) return; // null = localStorage.clear()
      if (e.newValue === e.oldValue) return;
      window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    api.me()
      .then((u) => { if (alive) setUser(u); })
      .catch(() => { if (alive) { setToken(null); setUser(null); } })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const replaceSession = useCallback((token: string, u: User) => { setToken(token); setUser(u); }, []);
  const setCurrentUser = useCallback((u: User) => setUser(u), []);

  const value = useMemo(() => ({ user, checking, login, logout, replaceSession, setCurrentUser }),
    [user, checking, login, logout, replaceSession, setCurrentUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fuori da AuthProvider");
  return v;
}
