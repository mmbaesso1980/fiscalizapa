import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import HomePage from "./pages/HomePage";
import CreditosPage from "./pages/CreditosPage";
import DashboardPage from "./pages/DashboardPage";
import PoliticoPage from "./pages/PoliticoPage";
import MetodologiaPage from "./pages/MetodologiaPage"; import RankingPage from "./pages/RankingPage";

export default function App() {
  const { user, loading, login, logout, credits } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-[#3d6b5e] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Navbar user={user} login={login} logout={logout} credits={credits} />
        <Routes>
          {user ? (
            <>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage user={user} />} />
              <Route path="/creditos" element={<CreditosPage user={user} />} />
              <Route path="/politico/:colecao/:id" element={<PoliticoPage user={user} />} />
              <Route path="/deputado/:nome" element={<PoliticoPage user={user} />} />
              <Route path="/ranking" element={<RankingPage />} />               <Route path="/metodologia" element={<MetodologiaPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<HomePage user={user} login={login} />} />
              <Route path="/metodologia" element={<MetodologiaPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
