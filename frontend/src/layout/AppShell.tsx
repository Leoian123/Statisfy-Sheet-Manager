import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../auth/AppData";
import { ErrorBox, Loading } from "../components/Status";
import { TICKETS_CHANGED, ticketsApi } from "../api/tickets";
import { usePolling } from "../lib/usePolling";

const LAST_KEY = "statisfy-last-char";

type Theme = "dark" | "light";
function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readLast(): number | null {
  try { const v = Number(localStorage.getItem(LAST_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
}
function writeLast(id: number) {
  try { localStorage.setItem(LAST_KEY, String(id)); } catch { /* ignora */ }
}

/** Id del PG "corrente": quello nell'URL, altrimenti l'ultimo aperto, altrimenti il primo visibile. */
export function useCurrentCharId(): number | null {
  const { chars } = useAppData();
  const m = useMatch("/personaggi/:id/*");
  const fromUrl = m?.params.id ? Number(m.params.id) : null;
  if (fromUrl) return fromUrl;
  if (!chars || !chars.length) return null;
  const last = readLast();
  if (last && chars.some((c) => c.id === last)) return last;
  return chars[0].id;
}

type CharLite = { id: number; name: string; level: number; owner_name: string };

/** Menu account in alto a sinistra: funzioni dell'utente che non dipendono da una scheda (creazione PG, elenco PG, uscita). */
function BrandMenu(props: {
  chars: CharLite[];
  showOwner: boolean;
  onCreate: () => void;
  onOpen: (id: number) => void;
  onAccount: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="brand-menu" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="brand"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="brand-pop"
        onClick={() => setOpen((o) => !o)}
      >
        <b>STATISFY</b><span>Gestionale schede</span><i className="caret" aria-hidden="true">▾</i>
      </button>
      {open && (
        <div className="brand-pop" id="brand-pop" role="menu">
          <span className="label">Account</span>
          <button type="button" role="menuitem" className="brand-item primary" onClick={pick(props.onCreate)}>
            ＋ Crea nuovo personaggio
          </button>
          {props.chars.length > 0 && (
            <>
              <span className="label">{props.showOwner ? "Personaggi della campagna" : "I miei personaggi"}</span>
              <div className="brand-list">
                {props.chars.map((c) => (
                  <button key={c.id} type="button" role="menuitem" className="brand-item" onClick={pick(() => props.onOpen(c.id))}>
                    <span>{c.name}</span>
                    <span className="muted xs num">Lv {c.level}{props.showOwner ? ` · ${c.owner_name}` : ""}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="brand-sep" />
          <button type="button" role="menuitem" className="brand-item" onClick={pick(props.onAccount)}>Il mio account</button>
          <button type="button" role="menuitem" className="brand-item" onClick={pick(props.onLogout)}>Esci</button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { chars, error, reload } = useAppData();
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const currentId = useCurrentCharId();
  const m = useMatch("/personaggi/:id/*");
  const suffix = m ? (m.params["*"] ? `/${m.params["*"]}` : "") : "";
  const topRef = useRef<HTMLElement>(null);
  // Contatore delle richieste: per il Master le nuove, per il giocatore le risposte non lette (ogni 30 s, pagina visibile)
  const [ticketCount, setTicketCount] = useState(0);
  const refreshTickets = useCallback(async () => {
    try { setTicketCount((await ticketsApi.summary()).count); } catch { /* il contatore è facoltativo */ }
  }, []);
  usePolling(refreshTickets, 30000, [refreshTickets, location.pathname]);
  useEffect(() => {
    const on = () => { refreshTickets(); };
    window.addEventListener(TICKETS_CHANGED, on);
    return () => window.removeEventListener(TICKETS_CHANGED, on);
  }, [refreshTickets]);

  // Altezza della barra in alto (cambia quando va a capo): serve agli elementi sticky sotto di lei (HUD della plancia)
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (currentId) writeLast(currentId); }, [currentId]);

  // Su mobile la nav è una riga scorrevole: porta in vista la voce attiva
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - 16;
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  function pickTheme(t: Theme) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("statisfy-theme", t); } catch { /* ignora */ }
    setTheme(t);
  }

  function onPick(id: number) {
    navigate(`/personaggi/${id}${suffix}`);
  }

  const isMaster = user?.role === "master";
  const hasChar = currentId != null;
  const charLink = (s: string, label: string) =>
    hasChar
      ? <NavLink to={`/personaggi/${currentId}${s}`} end>{label}</NavLink>
      : <a aria-disabled="true" title="Crea prima un personaggio">{label}</a>;

  return (
    <>
      <header className="topbar" ref={topRef}>
        <BrandMenu
          chars={chars ?? []}
          showOwner={isMaster}
          onCreate={() => navigate("/crea")}
          onOpen={(id) => navigate(`/personaggi/${id}`)}
          onAccount={() => navigate("/account")}
          onLogout={logout}
        />
        {chars && chars.length > 0 && (
          <label className="char-pick small" htmlFor="char-select">
            <span className="label">Personaggio</span>
            <select
              className="input"
              id="char-select"
              value={currentId ?? ""}
              onChange={(e) => onPick(Number(e.target.value))}
            >
              {currentId != null && !chars.some((c) => c.id === currentId) && <option value={currentId}>PG #{currentId}</option>}
              {chars.map((c) => (
                <option key={c.id} value={c.id}>{c.name} · Lv {c.level}{isMaster ? ` · ${c.owner_name}` : ""}</option>
              ))}
            </select>
          </label>
        )}
        <span className="user">
          <NavLink to="/account" className="name" title="Il mio account: nome visibile, password, sessioni">{user?.display_name}</NavLink>
          <span className="chip muted role">{isMaster ? "Master" : "Giocatore"}</span>
          <button type="button" className="btn ghost" onClick={logout}>Esci</button>
        </span>
        <div className="seg" role="group" aria-label="Tema">
          <button type="button" aria-pressed={theme === "dark"} title="Tema scuro" onClick={() => pickTheme("dark")}>Scuro</button>
          <button type="button" aria-pressed={theme === "light"} title="Tema chiaro" onClick={() => pickTheme("light")}>Chiaro</button>
        </div>
      </header>

      <div className="app">
        <nav className="nav" aria-label="Sezioni" ref={navRef}>
          {charLink("", "Scheda personaggio")}
          {charLink("/plancia", "Plancia di gioco")}
          {charLink("/level-up", "Level up")}
          <NavLink to="/diario">Diario</NavLink>
          <NavLink to="/richieste">
            {isMaster ? "Richieste dei giocatori" : "Richieste al Master"}
            {ticketCount > 0 && <span className="chip gold num nav-count" aria-label={isMaster ? `${ticketCount} nuove` : `${ticketCount} con risposte da leggere`}>{ticketCount}</span>}
          </NavLink>
          {isMaster && (
            <>
              <div className="nav-sep" />
              <NavLink to="/master/plancia">Plancia di comando</NavLink>
              <NavLink to="/master" end>Area Master</NavLink>
              <NavLink to="/master/forgia">Forgia del Master</NavLink>
              <NavLink to="/master/amministrazione">Amministrazione</NavLink>
            </>
          )}
          <div className="nav-sep" />
          <p className="nav-note footnote">
            Le regole sono calcolate dal server: passa sopra un valore per vedere formula e origine dei punti.
          </p>
        </nav>
        <main id="view" tabIndex={-1} ref={mainRef}>
          {error ? (
            <ErrorBox title="Connessione" message={error} action={<button type="button" className="btn" onClick={reload}>Riprova</button>} />
          ) : !chars ? (
            <Loading />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </>
  );
}
