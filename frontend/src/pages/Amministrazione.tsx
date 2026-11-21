/* Amministrazione (solo Master): account e ruoli, password provvisorie, assegnazione dei personaggi, registro.
   Righe compatte con i dettagli al passaggio del mouse; un account si gestisce aprendo la sua riga.
   Il server applica comunque tutte le regole (ultimo Master, sé stessi, account usati): qui servono solo ad avvisare prima. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { adminApi, type AdminLogEntry, type AdminUser } from "../api/admin";
import { errorText } from "../api/client";
import type { Role } from "../api/types";
import { useAppData } from "../auth/AppData";
import { InlineError, Loading } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import {
  ACTION_LABELS, blockReason, counts, lastSeen, matches, passwordError, userState, usernameError,
} from "../lib/admin";
import "../styles/admin.css";

const ROLE_LABEL: Record<Role, string> = { master: "Master", player: "Giocatore" };
const fullDate = (iso: string) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleString("it-IT") : "—");

interface Temp { name: string; username: string; password: string }

export function Amministrazione() {
  const toast = useToast();
  const { refreshChars } = useAppData();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [log, setLog] = useState<AdminLogEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [temp, setTemp] = useState<Temp | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([adminApi.users(), adminApi.log(40)]);
      setUsers(u);
      setLog(l);
      setErr(null);
    } catch (e) {
      setErr(errorText(e));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const after = useCallback(async (msg?: string) => {
    await load();
    refreshChars();
    if (msg) toast("AMMINISTRAZIONE", [msg]);
  }, [load, refreshChars, toast]);

  const shown = useMemo(() => (users ?? []).filter((u) => matches(u, q)), [users, q]);

  if (!users) return err ? <Win title="Amministrazione"><InlineError message={err} /></Win> : <Loading />;
  const c = counts(users);

  return (
    <div className="ad-root">
      <div className="ad-main">
        <Win title="Account" right={
          <button type="button" className="btn primary ad-new" aria-expanded={creating} onClick={() => { setCreating((x) => !x); setTemp(null); }}>
            {creating ? "Chiudi" : "＋ Nuovo account"}
          </button>}>
          <div className="stack">
            <p className="ad-sum small" aria-label="Riepilogo">
              <span className="chip gold num">{c.master} Master</span>
              <span className="chip violet num">{c.player} Giocatori</span>
              {c.pending > 0 && <span className="chip warn num" title="Account con la password provvisoria ancora da cambiare">{c.pending} in attesa</span>}
              {c.inactive > 0 && <span className="chip bad num">{c.inactive} disattivati</span>}
            </p>
            {creating && (
              <NewAccount users={users} onCreated={(u, pw) => {
                setCreating(false);
                if (pw) setTemp({ name: u.display_name, username: u.username, password: pw });
                after(`Account «${u.username}» creato.`);
              }} />
            )}
            {temp && <TempCard t={temp} onClose={() => setTemp(null)} />}
            {err && <InlineError message={err} />}
            {users.length > 6 && (
              <input className="input ad-search" type="search" placeholder="Cerca per nome, nome utente o personaggio" aria-label="Cerca account"
                value={q} onChange={(e) => setQ(e.target.value)} />
            )}
            <ul className="ad-list">
              {shown.map((u) => (
                <li key={u.id} className={`ad-li${open === u.id ? " is-open" : ""}`}>
                  <UserRow u={u} open={open === u.id} onToggle={() => setOpen(open === u.id ? null : u.id)} />
                  {open === u.id && (
                    <UserEditor
                      u={u}
                      users={users}
                      onDone={(msg) => after(msg)}
                      onTemp={(pw) => { setTemp({ name: u.display_name, username: u.username, password: pw }); after(); }}
                      onRemoved={() => { setOpen(null); after(`Account «${u.username}» eliminato.`); }}
                    />
                  )}
                </li>
              ))}
              {!shown.length && <li className="muted small">Nessun account corrisponde alla ricerca.</li>}
            </ul>
          </div>
        </Win>
      </div>
      <div className="ad-side">
        <Assignments users={users} onDone={after} />
        <Win title="Registro">
          {log.length ? (
            <ol className="ad-log">
              {log.map((e) => (
                <li key={e.id} title={`${fullDate(e.at)} · ${e.actor}${e.detail ? `\n${e.detail}` : ""}`}>
                  <span className="muted xs num ad-log-when">{lastSeen(e.at)}</span>
                  <span className="ad-log-what small">
                    <b>{ACTION_LABELS[e.action] ?? e.action}</b> {e.target}
                    {e.detail && <span className="muted"> · {e.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="muted small">Nessuna operazione registrata.</p>}
        </Win>
      </div>
    </div>
  );
}

function UserRow({ u, open, onToggle }: { u: AdminUser; open: boolean; onToggle: () => void }) {
  const st = userState(u);
  const pgs = u.characters.map((c) => `${c.name} (Lv ${c.level})`).join(", ");
  const tip = [`@${u.username}`, `Ultimo accesso: ${fullDate(u.last_login_at)}`, `Creato: ${fullDate(u.created_at)}`,
    pgs ? `Personaggi: ${pgs}` : "Nessun personaggio"].join("\n");
  return (
    <button type="button" className={`ad-row${u.active ? "" : " is-off"}`} aria-expanded={open} title={tip} onClick={onToggle}>
      <span className="ad-row-main">
        <span className="ad-row-name">{u.display_name}{u.is_self && <span className="muted xs"> (tu)</span>}</span>
        <span className="muted xs ad-mono ad-row-user">@{u.username}</span>
      </span>
      <span className={`chip ${u.role === "master" ? "gold" : "violet"}`}>{ROLE_LABEL[u.role]}</span>
      <span className={`chip ${st.tone} ad-hide-sm`}>{st.label}</span>
      <span className="muted xs num ad-hide-sm ad-row-pg">{u.characters.length ? `${u.characters.length} PG` : "—"}</span>
      <span className="muted xs num ad-row-seen">{lastSeen(u.last_login_at)}</span>
      <i className="caret" aria-hidden="true">▾</i>
    </button>
  );
}

function NewAccount({ users, onCreated }: { users: AdminUser[]; onCreated: (u: AdminUser, temp?: string) => void }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("player");
  const [own, setOwn] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uErr = username ? usernameError(username, users) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = usernameError(username, users) ?? (own ? passwordError(pw, username) : null);
    if (local) { setErr(local); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await adminApi.create({ username: username.trim(), display_name: name.trim(), role, ...(own ? { password: pw } : {}) });
      onCreated(res.user, res.temporary_password);
    } catch (ex) {
      setErr(errorText(ex));
      setBusy(false);
    }
  }

  return (
    <form className="ad-panel stack" onSubmit={submit} noValidate aria-label="Nuovo account">
      <div className="ad-grid">
        <div className="field">
          <label className="label" htmlFor="na-user">Nome utente (per accedere)</label>
          <input className="input" id="na-user" autoCapitalize="off" spellCheck={false} autoComplete="off" maxLength={30} autoFocus
            value={username} aria-invalid={uErr ? true : undefined} onChange={(e) => setUsername(e.target.value)} />
          {uErr && <span className="hint bad">{uErr}</span>}
        </div>
        <div className="field">
          <label className="label" htmlFor="na-name">Nome visibile</label>
          <input className="input" id="na-name" maxLength={100} placeholder={username || "es. Luca"} value={name}
            onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <span className="label" id="na-role">Ruolo</span>
        <RoleSeg value={role} onChange={setRole} labelledBy="na-role" />
      </div>
      <label className="row small ad-check">
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
        Scelgo io la password iniziale (altrimenti ne genero una provvisoria)
      </label>
      {own && (
        <div className="field">
          <label className="label" htmlFor="na-pw">Password iniziale</label>
          <input className="input" id="na-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <span className="hint">Al primo accesso dovrà comunque sceglierne una sua.</span>
        </div>
      )}
      {err && <p className="hint bad" role="alert">{err}</p>}
      <div className="row"><button type="submit" className="btn primary" disabled={busy}>{busy ? "Creazione…" : "Crea account"}</button></div>
    </form>
  );
}

function RoleSeg({ value, onChange, disabled, why, labelledBy }: {
  value: Role; onChange: (r: Role) => void; disabled?: boolean; why?: string | null; labelledBy: string;
}) {
  return (
    <div className="seg ad-seg" role="group" aria-labelledby={labelledBy} title={why ?? undefined}>
      {(["player", "master"] as Role[]).map((r) => (
        <button key={r} type="button" aria-pressed={value === r} disabled={disabled && value !== r} onClick={() => onChange(r)}>{ROLE_LABEL[r]}</button>
      ))}
    </div>
  );
}

function TempCard({ t, onClose }: { t: Temp; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Nome utente: ${t.username}\nPassword provvisoria: ${t.password}`);
      setCopied(true);
    } catch { /* appunti non disponibili: si copia a mano */ }
  }
  return (
    <div className="ad-temp" role="status">
      <span className="label">Credenziali per {t.name}</span>
      <dl className="ad-cred">
        <dt>Nome utente</dt><dd className="ad-mono">{t.username}</dd>
        <dt>Password provvisoria</dt><dd className="ad-mono ad-pw">{t.password}</dd>
      </dl>
      <p className="hint">Mostrata una sola volta: comunicala di persona o in privato. Al primo accesso dovrà sceglierne una nuova.</p>
      <div className="row">
        <button type="button" className="btn" onClick={copy}>{copied ? "Copiato ✓" : "Copia"}</button>
        <button type="button" className="btn ghost" onClick={onClose}>Fatto</button>
      </div>
    </div>
  );
}

function UserEditor({ u, users, onDone, onTemp, onRemoved }: {
  u: AdminUser; users: AdminUser[]; onDone: (msg: string) => void; onTemp: (pw: string) => void; onRemoved: () => void;
}) {
  const [name, setName] = useState(u.display_name);
  const [username, setUsername] = useState(u.username);
  const [role, setRole] = useState<Role>(u.role);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(u.display_name); setUsername(u.username); setRole(u.role); }, [u]);

  const demoteWhy = blockReason(users, u, "demote");
  const offWhy = u.active ? blockReason(users, u, "deactivate") : null;
  const delWhy = blockReason(users, u, "delete");
  const resetWhy = blockReason(users, u, "reset");
  const uErr = username !== u.username ? usernameError(username, users, u.id) : null;
  const dirty = name.trim() !== u.display_name || username.trim() !== u.username || role !== u.role;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try { await fn(); } catch (ex) { setErr(errorText(ex)); } finally { setBusy(false); }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (uErr) { setErr(uErr); return; }
    if (!name.trim()) { setErr("Il nome visibile non può essere vuoto."); return; }
    if (role !== u.role && !window.confirm(role === "master"
      ? `Rendere ${u.display_name} Master? Vedrà tutte le schede, le richieste e questa pagina.`
      : `Togliere il ruolo di Master a ${u.display_name}?`)) return;
    run(async () => {
      const patch: Record<string, unknown> = {};
      if (name.trim() !== u.display_name) patch.display_name = name.trim();
      if (username.trim() !== u.username) patch.username = username.trim();
      if (role !== u.role) patch.role = role;
      await adminApi.patch(u.id, patch);
      onDone(role !== u.role ? `Ruolo di «${u.username}» cambiato: deve accedere di nuovo.` : "Account aggiornato.");
    });
  }

  return (
    <div className="ad-panel ad-editor">
      <form className="stack" onSubmit={save} noValidate>
        <div className="ad-grid">
          <div className="field">
            <label className="label" htmlFor={`ed-name-${u.id}`}>Nome visibile</label>
            <input className="input" id={`ed-name-${u.id}`} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor={`ed-user-${u.id}`}>Nome utente</label>
            <input className="input" id={`ed-user-${u.id}`} maxLength={30} autoCapitalize="off" spellCheck={false} value={username}
              aria-invalid={uErr ? true : undefined} onChange={(e) => setUsername(e.target.value)} />
            {uErr && <span className="hint bad">{uErr}</span>}
          </div>
        </div>
        <div className="row">
          <span className="label" id={`ed-role-${u.id}`}>Ruolo</span>
          <RoleSeg value={role} onChange={setRole} disabled={!!demoteWhy} why={demoteWhy} labelledBy={`ed-role-${u.id}`} />
          {demoteWhy && <span className="hint">{demoteWhy}</span>}
        </div>
        <div className="row"><button type="submit" className="btn primary" disabled={busy || !dirty}>Salva</button></div>
      </form>

      <div className="ad-meta small">
        <span><span className="muted">Personaggi: </span>
          {u.characters.length ? u.characters.map((c, i) => (
            <span key={c.id}>{i > 0 && ", "}<Link to={`/personaggi/${c.id}`}>{c.name}</Link> <span className="muted xs">Lv {c.level}</span></span>
          )) : <span className="muted">nessuno</span>}
        </span>
        <span className="muted xs">Ultimo accesso {fullDate(u.last_login_at)} · creato {fullDate(u.created_at)}</span>
      </div>

      <div className="ad-acts">
        <button type="button" className="btn" disabled={busy || !!resetWhy} title={resetWhy ?? "Genera una password provvisoria e chiude le sue sessioni"}
          onClick={() => window.confirm(`Generare una password provvisoria per ${u.display_name}? Quella attuale smette di funzionare.`)
            && run(async () => { onTemp((await adminApi.resetPassword(u.id)).temporary_password ?? ""); })}>
          Password provvisoria
        </button>
        <button type="button" className="btn" disabled={busy} title="Chiude le sessioni aperte su tutti i suoi dispositivi"
          onClick={() => run(async () => { await adminApi.logoutAll(u.id); onDone(`«${u.username}» disconnesso da tutti i dispositivi.`); })}>
          Disconnetti ovunque
        </button>
        {u.active ? (
          <button type="button" className="btn danger" disabled={busy || !!offWhy} title={offWhy ?? "Non potrà più accedere; i suoi dati restano"}
            onClick={() => window.confirm(`Disattivare ${u.display_name}? Non potrà più accedere; personaggi, diario e richieste restano.`)
              && run(async () => { await adminApi.patch(u.id, { active: false }); onDone(`«${u.username}» disattivato.`); })}>
            Disattiva
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy}
            onClick={() => run(async () => { await adminApi.patch(u.id, { active: true }); onDone(`«${u.username}» riattivato.`); })}>
            Riattiva
          </button>
        )}
        <button type="button" className="btn danger ghost" disabled={busy || !!delWhy}
          title={delWhy ?? "Solo per account mai usati (senza tiri, diario o richieste)"}
          onClick={() => window.confirm(`Eliminare definitivamente l'account «${u.username}»? Non si può annullare.`)
            && run(async () => { await adminApi.remove(u.id); onRemoved(); })}>
          Elimina
        </button>
      </div>
      <InlineError message={err} />
    </div>
  );
}

function Assignments({ users, onDone }: { users: AdminUser[]; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chars = useMemo(() => users.flatMap((u) => u.characters.map((c) => ({ ...c, owner: u })))
    .sort((a, b) => a.name.localeCompare(b.name, "it")), [users]);
  const owners = users.filter((u) => u.active);

  async function assign(charId: number, charName: string, from: AdminUser, toId: number) {
    const to = users.find((u) => u.id === toId);
    if (!to || to.id === from.id) return;
    if (!window.confirm(`Assegnare ${charName} a ${to.display_name}? ${from.display_name} non lo vedrà più.`)) return;
    setBusy(charId);
    setErr(null);
    try {
      await adminApi.assign(charId, toId);
      onDone(`${charName} ora è di ${to.display_name}.`);
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Win title="Personaggi">
      {chars.length ? (
        <ul className="ad-chars">
          {chars.map((c) => (
            <li key={c.id} className="ad-char" title={`${c.name} · ${c.classe} · Lv ${c.level}\nGiocatore: ${c.owner.display_name} (@${c.owner.username})`}>
              <span className="ad-char-main">
                <Link to={`/personaggi/${c.id}`} className="ad-char-name">{c.name}</Link>
                <span className="muted xs">{c.classe} · Lv {c.level}</span>
              </span>
              <select className="input ad-owner" aria-label={`Giocatore di ${c.name}`} value={c.owner.id} disabled={busy === c.id}
                onChange={(e) => assign(c.id, c.name, c.owner, Number(e.target.value))}>
                {!c.owner.active && <option value={c.owner.id}>{c.owner.display_name} (disattivato)</option>}
                {owners.map((o) => <option key={o.id} value={o.id}>{o.display_name}{o.role === "master" ? " (Master)" : ""}</option>)}
              </select>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Nessun personaggio nella campagna.</p>}
      <InlineError message={err} />
    </Win>
  );
}
