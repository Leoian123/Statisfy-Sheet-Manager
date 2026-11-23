import type { ReactNode } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppDataProvider, useAppData } from "./auth/AppData";
import { ToastProvider } from "./components/Toast";
import { Loading, SysMsg } from "./components/Status";
import { Win } from "./components/Win";
import { AppShell, useCurrentCharId } from "./layout/AppShell";
import { Login } from "./pages/Login";
import { Scheda } from "./pages/Scheda";
import { Crea } from "./pages/Crea";
import { LevelUp } from "./pages/LevelUp";
import { Master } from "./pages/Master";
import { Forgia } from "./pages/Forgia";
import { Plancia } from "./pages/Plancia";
import { PlanciaGiocatore } from "./pages/PlanciaGiocatore";
import { Scontro } from "./pages/Scontro";
import { Simulatore } from "./pages/Simulatore";
import { Png } from "./pages/Png";
import { Diario } from "./pages/Diario";
import { Richieste } from "./pages/Richieste";
import { Incanto } from "./pages/Incanto";
import { Account, ForcedPassword } from "./pages/Account";
import { Amministrazione } from "./pages/Amministrazione";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}

function Gate() {
  const { user, checking } = useAuth();
  if (checking) return <div className="login-wrap"><Loading text="Connessione al System…" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  if (user.must_change_password) return <ForcedPassword />;
  return (
    <AppDataProvider key={user.id}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/personaggi/:id" element={<Scheda />} />
          <Route path="/personaggi/:id/plancia" element={<PlanciaGiocatore />} />
          <Route path="/personaggi/:id/level-up" element={<LevelUp />} />
          <Route path="/personaggi/:id/combattimento" element={<ToPlancia />} />
          <Route path="/scontro" element={<Scontro />} />
          <Route path="/crea" element={<Crea />} />
          <Route path="/diario" element={<Diario />} />
          <Route path="/richieste" element={<Richieste />} />
          <Route path="/richieste/incanto" element={<Incanto />} />
          <Route path="/account" element={<Account />} />
          <Route path="/master" element={<MasterOnly><Master /></MasterOnly>} />
          <Route path="/master/forgia" element={<MasterOnly><Forgia /></MasterOnly>} />
          <Route path="/master/simulatore" element={<MasterOnly><Simulatore /></MasterOnly>} />
          <Route path="/master/png" element={<MasterOnly><Png /></MasterOnly>} />
          <Route path="/master/plancia" element={<MasterOnly><Plancia /></MasterOnly>} />
          <Route path="/master/amministrazione" element={<MasterOnly><Amministrazione /></MasterOnly>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}

function Home() {
  const { user } = useAuth();
  const { chars } = useAppData();
  const id = useCurrentCharId();
  if (user?.role === "master") return <Navigate to="/master/plancia" replace />;
  if (!chars) return <Loading />;
  if (id == null) return <Navigate to="/crea" replace />;
  return <Navigate to={`/personaggi/${id}`} replace />;
}

/** La vecchia pagina Combattimento è dentro la Plancia di gioco: i link e i preferiti vecchi ci portano lì. */
function ToPlancia() {
  const { id } = useParams();
  return <Navigate to={`/personaggi/${id}/plancia`} replace />;
}

function MasterOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "master") {
    return (
      <Win title="Accesso negato">
        <SysMsg lines={["Area riservata al Master."]} />
      </Win>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <Win title="Pagina non trovata">
      <SysMsg lines={["Questa sezione non esiste."]} />
    </Win>
  );
}
