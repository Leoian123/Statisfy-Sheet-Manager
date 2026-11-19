import { Navigate, Route, Routes } from "react-router-dom";
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
import { Combattimento } from "./pages/Combattimento";
import { Master } from "./pages/Master";

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
  return (
    <AppDataProvider key={user.id}>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="/personaggi/:id" element={<Scheda />} />
          <Route path="/personaggi/:id/level-up" element={<LevelUp />} />
          <Route path="/personaggi/:id/combattimento" element={<Combattimento />} />
          <Route path="/crea" element={<Crea />} />
          <Route path="/master" element={<MasterOnly />} />
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
  if (user?.role === "master") return <Navigate to="/master" replace />;
  if (!chars) return <Loading />;
  if (id == null) return <Navigate to="/crea" replace />;
  return <Navigate to={`/personaggi/${id}`} replace />;
}

function MasterOnly() {
  const { user } = useAuth();
  if (user?.role !== "master") {
    return (
      <Win title="Accesso negato">
        <SysMsg lines={["Area riservata al Master."]} />
      </Win>
    );
  }
  return <Master />;
}

function NotFound() {
  return (
    <Win title="Pagina non trovata">
      <SysMsg lines={["Questa sezione non esiste."]} />
    </Win>
  );
}
