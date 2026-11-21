/* «Il mio account»: nome visibile, cambio password, uscita da tutti i dispositivi.
   ForcedPassword è la schermata unica mostrata finché l'utente ha la password provvisoria data dal Master. */
import { useState, type FormEvent } from "react";
import { api, errorText } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PasswordForm } from "../components/PasswordForm";
import { SysMsg } from "../components/Status";
import { useToast } from "../components/Toast";
import { Win } from "../components/Win";
import "../styles/admin.css";

export function Account() {
  const { user, setCurrentUser, logout } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.display_name ?? "");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setNameErr("Il nome visibile non può essere vuoto."); return; }
    setBusy(true);
    setNameErr(null);
    try {
      const u = await api.updateProfile(name.trim());
      setCurrentUser(u);
      setName(u.display_name);
      toast("ACCOUNT", ["Nome visibile aggiornato."]);
    } catch (ex) {
      setNameErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  }

  async function logoutAll() {
    if (!window.confirm("Uscire da tutti i dispositivi? Dovrai accedere di nuovo anche qui.")) return;
    try {
      await api.logoutAll();
    } catch { /* il token è già stato invalidato o il server non risponde: si esce comunque */ }
    logout();
  }

  return (
    <div className="ad-account">
      <Win title="Il mio account" right={<span className="chip muted">{user.role === "master" ? "Master" : "Giocatore"}</span>}>
        <form className="stack" style={{ gap: 12 }} onSubmit={saveName} noValidate>
          <div className="field">
            <span className="label">Nome utente</span>
            <span className="ad-mono" title="Lo usi per accedere. Può cambiarlo solo il Master.">{user.username}</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="ac-name">Nome visibile</label>
            <input className="input" id="ac-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
            <span className="hint">Come ti vedono gli altri al tavolo, nel diario e nelle richieste.</span>
          </div>
          {nameErr && <p className="hint bad" role="alert">{nameErr}</p>}
          <div className="row">
            <button type="submit" className="btn" disabled={busy || name.trim() === user.display_name}>Salva nome</button>
          </div>
        </form>
      </Win>
      <Win title="Password">
        <PasswordForm onDone={() => toast("ACCOUNT", ["Password cambiata: gli altri dispositivi sono stati disconnessi."], { gold: true })} />
      </Win>
      <Win title="Sessioni">
        <div className="stack">
          <p className="small muted">Hai usato l'app su un computer non tuo? Chiudi tutte le sessioni aperte.</p>
          <div className="row"><button type="button" className="btn danger" onClick={logoutAll}>Esci da tutti i dispositivi</button></div>
        </div>
      </Win>
    </div>
  );
}

export function ForcedPassword() {
  const { user, logout } = useAuth();
  return (
    <div className="login-wrap">
      <div className="login-box stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="login-brand">STATISFY</span>
          <span className="muted small">Gestionale schede</span>
        </div>
        <Win title="Nuova password" gold>
          <div className="stack" style={{ gap: 14 }}>
            <SysMsg lines={[`Benvenuto, ${user?.display_name ?? ""}. Il Master ti ha dato una password provvisoria: scegline una tua per continuare.`]} />
            <PasswordForm currentLabel="Password provvisoria" />
            <button type="button" className="btn ghost" onClick={logout}>Esci</button>
          </div>
        </Win>
      </div>
    </div>
  );
}
