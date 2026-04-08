import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import HomePage from "./pages/HomePage";
import CreditosPage from "./pages/CreditosPage";
import DashboardPage from "./pages/DashboardPage";
import PoliticoPage from "./pages/PoliticoPage";
import EmendaPage from "./pages/EmendaPage";
import BancoEmendasPage from "./pages/BancoEmendasPage";
import MetodologiaPage from "./pages/MetodologiaPage";
import RankingPage from "./pages/RankingPage";
import ComparadorPage from "./pages/ComparadorPage";
import "./styles/tokens.css";

export default function App() {
  const { user, loading, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits } = useAuth();

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #A8D8B0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Navbar
          user={user}
          login={login}
          loginWithGitHub={loginWithGitHub}
          loginWithEmail={loginWithEmail}
          registerWithEmail={registerWithEmail}
          logout={logout}
          credits={credits}
        />
        <Routes>
          <Route path="/" element={<HomePage user={user} login={login} loginWithGitHub={loginWithGitHub} loginWithEmail={loginWithEmail} registerWithEmail={registerWithEmail} />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/metodologia" element={<MetodologiaPage />} />
          {user ? (
            <>
              <Route path="/dashboard" element={<DashboardPage user={user} />} />
              <Route path="/creditos" element={<CreditosPage user={user} />} />
              <Route path="/politico/:colecao/:id" element={<PoliticoPage user={user} />} />
              <Route path="/deputado/:nome" element={<PoliticoPage user={user} />} />
              <Route path="/emenda/:id" element={<EmendaPage />} />
              <Route path="/emendas" element={<BancoEmendasPage />} />
              <Route path="/comparador" element={<ComparadorPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/" replace />} />
          )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
