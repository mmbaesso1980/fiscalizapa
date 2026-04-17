import { lazy, Suspense, useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { HelmetProvider, Helmet } from "react-helmet-async";
import { useAuth } from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import PageSkeleton from "./components/PageSkeleton";
import Layout from "./components/Layout";
import "./styles/tokens.css";

const HomePage = lazy(() => import("./pages/HomePage"));
const CreditosPage = lazy(() => import("./pages/CreditosPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const PoliticoPage = lazy(() => import("./pages/PoliticoPage"));
const EmendaPage = lazy(() => import("./pages/EmendaPage"));
const BancoEmendasPage = lazy(() => import("./pages/BancoEmendasPage"));
const MetodologiaPage = lazy(() => import("./pages/MetodologiaPage"));
const RankingPage = lazy(() => import("./pages/RankingPage"));
const ComparadorPage = lazy(() => import("./pages/ComparadorPage"));
const DossiePage       = lazy(() => import("./pages/DossiePage"));
const AdminDashboard   = lazy(() => import("./pages/AdminDashboard"));
const MapaPage         = lazy(() => import("./pages/MapaPage"));
const PerfilPage       = lazy(() => import("./pages/PerfilPage"));
const NotFoundPage     = lazy(() => import("./pages/NotFoundPage"));
const LoginPage        = lazy(() => import("./pages/LoginPage"));
const UsuarioPage      = lazy(() => import("./pages/UsuarioPage"));

/** Redireciona URLs legadas /politico/... para o dossiê canónico /dossie/:id */
function RedirectPoliticoParaDossie() {
  const { id } = useParams();
  if (!id) return <Navigate to="/ranking" replace />;
  return <Navigate to={`/dossie/${id}`} replace />;
}

const ROTAS_COLECAO = new Set(["deputados_federais", "senadores", "deputados"]);

/** /politico/:id (uma coluna) — evita colidir com nome de coleção */
function RedirectPoliticoLegadoUmaColuna() {
  const { id } = useParams();
  if (!id || ROTAS_COLECAO.has(id)) return <Navigate to="/ranking" replace />;
  return <Navigate to={`/dossie/${id}`} replace />;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [bootBypass, setBootBypass] = useState(false);
  useEffect(() => {
    if (!loading) {
      setBootBypass(false);
      return undefined;
    }
    setBootBypass(false);
    const id = setTimeout(() => setBootBypass(true), AUTH_BOOT_MS);
    return () => clearTimeout(id);
  }, [loading]);
  if (loading && !bootBypass) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

const AUTH_BOOT_MS = 5000;

export default function App() {
  const { user, loading, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits, isAdmin } = useAuth();
  const [authBootBypass, setAuthBootBypass] = useState(false);

  useEffect(() => {
    if (!loading) {
      setAuthBootBypass(false);
      return undefined;
    }
    setAuthBootBypass(false);
    const id = setTimeout(() => setAuthBootBypass(true), AUTH_BOOT_MS);
    return () => clearTimeout(id);
  }, [loading]);

  if (loading && !authBootBypass) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #A8D8B0", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <HelmetProvider>
    {/* Meta-tags padrão — sobrescritas por cada página via <Helmet> */}
    <Helmet>
      <title>TransparenciaBR | Auditoria Forense de Gastos Públicos</title>
      <meta name="description" content="Plataforma de inteligência forense para auditoria de gastos públicos, parlamentares e contratos governamentais no Brasil. TransparenciaBR." />
      <meta property="og:site_name" content="TransparenciaBR" />
      <meta property="og:type" content="website" />
      <meta name="robots" content="index, follow" />
      <meta name="theme-color" content="#0a0a1e" />
    </Helmet>
    <ErrorBoundary>
      <BrowserRouter>
        <Layout>
        <Navbar user={user} logout={logout} credits={credits} isAdmin={isAdmin} />
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<HomePage user={user} login={login} loginWithGitHub={loginWithGitHub} loginWithEmail={loginWithEmail} registerWithEmail={registerWithEmail} />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/mapa" element={<MapaPage />} />
            <Route path="/metodologia" element={<MetodologiaPage />} />

            {/* Rotas públicas — conteúdo premium protegido por CreditGate dentro da página */}
            <Route path="/politico/:colecao/:id" element={<RedirectPoliticoParaDossie />} />
            <Route path="/politico/:id" element={<RedirectPoliticoLegadoUmaColuna />} />
            <Route path="/deputado/:nome" element={<PoliticoPage user={user} />} />
            <Route path="/emenda/:id" element={<EmendaPage />} />
            <Route path="/emendas" element={<BancoEmendasPage />} />
            <Route path="/dossie/:id" element={<DossiePage />} />

            {/* Rotas autenticadas — redirecionam para /login se não autenticado */}
            <Route path="/dashboard" element={<RequireAuth><DashboardPage user={user} /></RequireAuth>} />
            <Route path="/creditos" element={<RequireAuth><CreditosPage user={user} /></RequireAuth>} />
            <Route path="/perfil" element={<RequireAuth><PerfilPage /></RequireAuth>} />
            <Route path="/usuario" element={<RequireAuth><UsuarioPage /></RequireAuth>} />
            <Route path="/comparador" element={<RequireAuth><ComparadorPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth>{isAdmin ? <AdminDashboard /> : <Navigate to="/" replace />}</RequireAuth>} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </Layout>
      </BrowserRouter>
    </ErrorBoundary>
    </HelmetProvider>
  );
}
