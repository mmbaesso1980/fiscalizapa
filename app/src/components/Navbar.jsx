import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function Navbar() {
  const { user } = useAuth();
  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  return (
    <nav className="sticky top-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-gray-800/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center text-black font-black text-sm">FB</div>
          <span className="font-bold text-white hidden sm:block">FiscalizaBR</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link to="/creditos" className="text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition">Creditos</Link>
          <Link to="/dashboard" className="text-gray-400 hover:text-white px-3 py-2 rounded-lg text-sm font-medium transition">Dashboard</Link>
          {user ? (
            <div className="flex items-center gap-2 ml-2">
              <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full border border-gray-700" />
              <button onClick={logout} className="text-gray-500 hover:text-white text-xs transition">Sair</button>
            </div>
          ) : (
            <button onClick={login} className="ml-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black px-4 py-2 rounded-lg text-sm font-bold hover:shadow-lg hover:shadow-emerald-500/25 transition-all">Entrar</button>
          )}
        </div>
      </div>
    </nav>
  );
}
