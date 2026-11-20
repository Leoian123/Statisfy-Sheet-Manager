import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { errorText } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Win } from "../components/Win";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  // Dopo un 401 il client lascia un segno: qui si spiega perché si è tornati al login
  const [error, setError] = useState<string | null>(() => {
    try {
      if (sessionStorage.getItem("statisfy-expired")) { sessionStorage.removeItem("statisfy-expired"); return "Sessione scaduta: accedi di nuovo."; }
    } catch { /* storage non disponibile */ }
    return null;
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) { setError("Inserisci nome utente e password."); return; }
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      // Sempre dalla home: il redirect dipende dal ruolo dell'utente appena entrato
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box stack" style={{ gap: 16 }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="login-brand">STATISFY</span>
          <span className="muted small">Gestionale schede</span>
        </div>
        <Win title="Accesso al System" gold>
          <form className="stack" style={{ gap: 14 }} onSubmit={submit} noValidate>
            <div className="sysmsg"><span className="tag">[SISTEMA]</span><span>Identificati per accedere ai registri di Aethermoor.</span></div>
            <div className="field">
              <label className="label" htmlFor="lg-user">Nome utente</label>
              <input className="input" id="lg-user" autoComplete="username" autoCapitalize="off" spellCheck={false}
                value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label className="label" htmlFor="lg-pass">Password</label>
              <input className="input" id="lg-pass" type="password" autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="hint bad" role="alert">{error}</p>}
            <div className="row">
              <button type="submit" className="btn primary" disabled={busy}>{busy ? "Accesso…" : "Accedi"}</button>
            </div>
          </form>
        </Win>
      </div>
    </div>
  );
}
