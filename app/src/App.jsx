import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import CreditosPage from "./pages/CreditosPage";
import DashboardPage from "./pages/DashboardPage";
import PoliticoPage from "./pages/PoliticoPage";

export default function App() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center"><div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /></div>;
  return (
    <BrowserRouter>
      <Navbar user={user} login={login} logout={logout} />
      <Routes>
        <Route path="/" element={<HomePage user={user} login={login} />} />
        <Route path="/dashboard" element={<DashboardPage user={user} />} />
        <Route path="/creditos" element={<CreditosPage user={user} />} />
        <Route path="/politico/:colecao/:id" element={<PoliticoPage user={user} />} />
        <Route path="/deputado/:nome" element={<PoliticoPage user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}
