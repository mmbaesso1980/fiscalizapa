import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

export default function App() {
  const { user, loading, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits, isAdmin } = useAuth();

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #A8D8B0', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

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
            <Route path="/politico/:colecao/:id" element={<PoliticoPage user={user} />} />
            <Route path="/deputado/:nome" element={<PoliticoPage user={user} />} />
            <Route path="/emenda/:id" element={<EmendaPage />} />
            <Route path="/emendas" element={<BancoEmendasPage />} />
            <Route path="/dossie/:id" element={<DossiePage />} />

            {/* Rotas autenticadas */}
            {user ? (
              <>
                <Route path="/dashboard" element={<DashboardPage user={user} />} />
                <Route path="/creditos" element={<CreditosPage user={user} />} />
                <Route path="/perfil" element={<PerfilPage />} />
                <Route path="/usuario" element={<UsuarioPage />} />
                <Route path="/comparador" element={<ComparadorPage />} />
                {isAdmin && <Route path="/admin" element={<AdminDashboard />} />}
              </>
            ) : null}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        </Layout>
      </BrowserRouter>
    </ErrorBoundary>
    </HelmetProvider>
  );
}
