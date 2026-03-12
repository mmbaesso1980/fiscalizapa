import { Link } from "react-router-dom";

export default function Navbar({ user, login, logout }) {
  return (
    <nav className="bg-indigo-700 text-white px-6 py-3 flex items-center justify-between shadow-lg">
      <Link to="/" className="text-xl font-bold flex items-center gap-2">
        <span>FiscalizaPA</span>
      </Link>
      <div className="flex items-center gap-4">
        <Link to="/creditos" className="hover:underline">Creditos</Link>
          <Link to="/dashboard" className="hover:underline">Dashboard</Link>
        {user ? (
          <div className="flex items-center gap-3">
            <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full" />
            <span className="text-sm">{user.displayName}</span>
            <button onClick={logout} className="bg-white/20 px-3 py-1 rounded text-sm hover:bg-white/30">Sair</button>
          </div>
        ) : (
          <button onClick={login} className="bg-white text-indigo-700 px-4 py-1.5 rounded font-medium hover:bg-indigo-50">Entrar com Google</button>
        )}
      </div>
    </nav>
  );
}
