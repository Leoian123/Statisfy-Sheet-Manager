import { useState, type FormEvent } from "react";
import { api, errorText } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PASSWORD_MIN, passwordError } from "../lib/admin";

/** Cambio password: attuale, nuova, conferma. Il server chiude le altre sessioni e dà un token nuovo a questa. */
export function PasswordForm({ currentLabel = "Password attuale", onDone }: { currentLabel?: string; onDone?: () => void }) {
  const { user, replaceSession } = useAuth();
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const liveErr = pw ? passwordError(pw, user?.username) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local = !cur ? "Inserisci la password attuale."
      : passwordError(pw, user?.username) ?? (pw !== pw2 ? "Le due password non coincidono."
        : pw === cur ? "La nuova password deve essere diversa da quella attuale." : null);
    if (local) { setErr(local); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await api.changePassword(cur, pw);
      replaceSession(res.token, res.user);
      setCur(""); setPw(""); setPw2("");
      onDone?.();
    } catch (ex) {
      setErr(errorText(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 12 }} onSubmit={submit} noValidate>
      {/* campo nascosto: i gestori di password associano la nuova password all'account giusto */}
      <input type="text" name="username" autoComplete="username" value={user?.username ?? ""} readOnly hidden />
      <div className="field">
        <label className="label" htmlFor="pw-cur">{currentLabel}</label>
        <input className="input" id="pw-cur" type="password" autoComplete="current-password" value={cur}
          onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-new">Nuova password</label>
        <input className="input" id="pw-new" type="password" autoComplete="new-password" value={pw}
          aria-invalid={liveErr ? true : undefined} aria-describedby="pw-hint" onChange={(e) => setPw(e.target.value)} />
        <span className={`hint${liveErr ? " bad" : ""}`} id="pw-hint">
          {liveErr ?? `Almeno ${PASSWORD_MIN} caratteri. Una frase di poche parole va benissimo.`}
        </span>
      </div>
      <div className="field">
        <label className="label" htmlFor="pw-new2">Ripeti la nuova password</label>
        <input className="input" id="pw-new2" type="password" autoComplete="new-password" value={pw2}
          aria-invalid={pw2 && pw2 !== pw ? true : undefined} onChange={(e) => setPw2(e.target.value)} />
      </div>
      {err && <p className="hint bad" role="alert">{err}</p>}
      <div className="row">
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Salvataggio…" : "Cambia password"}</button>
      </div>
    </form>
  );
}
