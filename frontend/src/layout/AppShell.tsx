import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useAppData } from "../auth/AppData";
import { ErrorBox, Loading } from "../components/Status";
import { battleApi } from "../api/scontri";
import { activeSection, sections, type Icon, type NavSection } from "./nav";
import "../styles/shell.css";
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

/** Icone della navigazione (tratto semplice, ereditano il colore). */
function NavIcon({ name }: { name: Icon }) {
  const d: Record<Icon, string> = {
    pg: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
    dice: "M5 4h14v14H5zM9 8h.01M15 8h.01M12 11h.01M9 14h.01M15 14h.01",
    inbox: "M4 13l3-8h10l3 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
    book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
    table: "M4 6h16v12H4zM4 10h16M10 10v8",
    users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 19a6 6 0 0 0-3-5",
    world: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
    flag: "M5 21V4h11l-2 4 2 4H5",
  };
  return <svg className="sh-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d[name]} /></svg>;
}

/** Menu del profilo: account, tema, personaggi (crea / apri), esci. */
function ProfileMenu(props: {
  name: string; role: string; chars: CharLite[]; showOwner: boolean; theme: Theme;
  onTheme: (t: Theme) => void; onCreate: () => void; onOpen: (id: number) => void; onAccount: () => void; onLogout: () => void;
  compact?: boolean;
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
  const initials = props.name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return (
    <div className={`sh-prof${props.compact ? " compact" : ""}`} ref={wrapRef}>
      <button type="button" ref={btnRef} className="sh-prof-b" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={`Menu di ${props.name}`}>
        <span className="sh-av" aria-hidden="true">{initials || "?"}</span>
        {!props.compact && <span className="sh-prof-t"><b>{props.name}</b><small>{props.role}</small></span>}
      </button>
      {open && (
        <div className="sh-pop" role="menu">
          <button type="button" role="menuitem" className="sh-pi" onClick={pick(props.onAccount)}>Il mio account</button>
          <div className="sh-pi sh-theme" role="group" aria-label="Tema">
            <span>Tema</span>
            <span className="seg">
              <button type="button" aria-pressed={props.theme === "dark"} onClick={() => props.onTheme("dark")}>Scuro</button>
              <button type="button" aria-pressed={props.theme === "light"} onClick={() => props.onTheme("light")}>Chiaro</button>
            </span>
          </div>
          <div className="sh-sep" />
          {props.chars.length > 0 && <span className="label sh-pl">{props.showOwner ? "Personaggi della campagna" : "I miei personaggi"}</span>}
          <div className="sh-plist">
            {props.chars.map((c) => (
              <button key={c.id} type="button" role="menuitem" className="sh-pi" onClick={pick(() => props.onOpen(c.id))}>
                <span>{c.name}</span><small className="muted num">Lv {c.level}{props.showOwner ? ` · ${c.owner_name}` : ""}</small>
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" className="sh-pi gold" onClick={pick(props.onCreate)}>＋ Crea un personaggio</button>
          <div className="sh-sep" />
          <button type="button" role="menuitem" className="sh-pi" onClick={pick(props.onLogout)}>Esci</button>
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
  const mainRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const currentId = useCurrentCharId();
  const m = useMatch("/personaggi/:id/*");
  const suffix = m ? (m.params["*"] ? `/${m.params["*"]}` : "") : "";
  const isMaster = user?.role === "master";

  // Richieste da guardare (Master: nuove; giocatore: risposte non lette) e scontro in corso: richiami nel menu
  const [ticketCount, setTicketCount] = useState(0);
  const [battle, setBattle] = useState(false);
  const refreshCounts = useCallback(async () => {
    try { setTicketCount((await ticketsApi.summary()).count); } catch { /* facoltativo */ }
    try { setBattle(!!(await battleApi.active()).scontro); } catch { /* facoltativo */ }
  }, []);
  usePolling(refreshCounts, 30000, [refreshCounts, location.pathname]);
  useEffect(() => {
    const on = () => { refreshCounts(); };
    window.addEventListener(TICKETS_CHANGED, on);
    return () => window.removeEventListener(TICKETS_CHANGED, on);
  }, [refreshCounts]);

  // Altezza dell'intestazione sticky: serve agli elementi sticky sotto di lei (HUD della plancia)
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { if (currentId) writeLast(currentId); }, [currentId]);
  useEffect(() => { mainRef.current?.focus({ preventScroll: true }); }, [location.pathname]);

  function pickTheme(t: Theme) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("statisfy-theme", t); } catch { /* ignora */ }
    setTheme(t);
  }

  const list = sections({ role: isMaster ? "master" : "player", charId: currentId, tickets: ticketCount, battle });
  const sec = activeSection(list, location.pathname);
  const title = location.pathname.startsWith("/account") ? "Il mio account" : sec?.label ?? "";
  const profile = (compact?: boolean) => (
    <ProfileMenu compact={compact} name={user?.display_name ?? ""} role={isMaster ? "Master" : "Giocatore"} chars={chars ?? []}
      showOwner={isMaster} theme={theme} onTheme={pickTheme} onCreate={() => navigate("/crea")}
      onOpen={(id) => navigate(`/personaggi/${id}`)} onAccount={() => navigate("/account")} onLogout={logout} />
  );
  const badge = (s: NavSection) => (s.badge ? <span className="sh-badge num" aria-label={`${s.badge} da guardare`}>{s.badge}</span>
    : s.dot ? <span className="sh-dot" aria-label="in corso" /> : null);
  const link = (s: NavSection, cls: string) => (
    <NavLink key={s.key} to={s.to} className={() => `${cls}${sec?.key === s.key ? " on" : ""}`}
      aria-current={sec?.key === s.key ? "page" : undefined}>
      <NavIcon name={s.icon} /><span className="sh-lt">{s.label}</span>{badge(s)}
    </NavLink>
  );

  return (
    <div className="sh">
      <nav className="sh-rail" aria-label="Sezioni">
        <span className="sh-logo"><b>STATISFY</b></span>
        {list.map((s) => link(s, "sh-link"))}
        <span className="sh-grow" />
        {profile()}
      </nav>

      <div className="sh-body">
        <header className="sh-head" ref={headRef}>
          <div className="sh-head-r">
            <h2 className="sh-title">{title}</h2>
            {sec?.charPicker && chars && chars.length > 0 && (
              <label className="sh-pick small">
                <span className="sh-sr">Personaggio</span>
                <select className="input" value={currentId ?? ""} onChange={(e) => navigate(`/personaggi/${e.target.value}${suffix}`)}>
                  {currentId != null && !chars.some((c) => c.id === currentId) && <option value={currentId}>PG #{currentId}</option>}
                  {chars.map((c) => <option key={c.id} value={c.id}>{c.name} · Lv {c.level}{isMaster ? ` · ${c.owner_name}` : ""}</option>)}
                </select>
              </label>
            )}
            <span className="sh-mobile-prof">{profile(true)}</span>
          </div>
          {sec && sec.tabs.length > 0 && (
            <nav className="sh-tabs" aria-label={`Sezione ${sec.label}`}>
              {sec.tabs.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className="sh-tab">{t.label}{t.dot && <span className="sh-dot" aria-label="in corso" />}</NavLink>
              ))}
            </nav>
          )}
        </header>
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

      <nav className="sh-bottom" aria-label="Sezioni">
        {list.map((s) => link(s, "sh-bl"))}
      </nav>
    </div>
  );
}
