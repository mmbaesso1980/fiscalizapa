import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import CreditosPage from './pages/CreditosPage';
import DashboardPage from "./pages/DashboardPage";
import DeputadoPage from "./pages/DeputadoPage";

export default function App() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-lg text-gray-500">Carregando...</div>;
  return (
    <BrowserRouter>
      <Navbar user={user} login={login} logout={logout} />
      <Routes>
        <Route path="/" element={<HomePage user={user} login={login} />} />
        <Route path="/dashboard" element={<DashboardPage user={user} />} />
        <Route path="/creditos" element={<CreditosPage user={user} />} />
          <Route path="/deputado/:nome" element={<DeputadoPage user={user} />} />
      </Routes>
    </BrowserRouter>
  );
}
