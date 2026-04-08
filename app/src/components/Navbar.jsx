import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoginModal from "./LoginModal";

const LogoOrb = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="orbA" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FBD87F" />
        <stop offset="35%" stopColor="#F7B98B" />
        <stop offset="65%" stopColor="#A8D8B0" />
        <stop offset="100%" stopColor="#9ECFE8" />
      </linearGradient>
      <linearGradient id="orbB" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FBD87F" stopOpacity="0.7" />
        <stop offset="50%" stopColor="#F7B98B" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#9ECFE8" stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id="orbC" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#A8D8B0" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#F7B98B" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    <path d="M50 8 A42 42 0 1 1 49.9 8" stroke="url(#orbA)" strokeWidth="14" fill="none" strokeLinecap="round" />
    <path d="M50 16 A34 34 0 1 0 49.9 16" stroke="url(#orbB)" strokeWidth="10" fill="none" strokeLinecap="round" />
    <path d="M50 26 A24 24 0 1 1 49.9 26" stroke="url(#orbC)" strokeWidth="7" fill="none" strokeLinecap="round" />
  </svg>
);

export default function Navbar({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const firstName = user?.displayName ? user.displayName.split(' ')[0] : '';
  const initial = user?.displayName ? user.displayName.charAt(0).toUpperCase() : '?';

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', height: 60, background: '#FFFFFF',
      borderBottom: '1px solid #EDEBE8', position: 'sticky', top: 0, zIndex: 100,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
        <LogoOrb size={30} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: '#2D2D2D', letterSpacing: '-0.3px' }}>transparenciabr</span>
      </Link>

      <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
        <Link to="/ranking" style={navLink}>Ranking</Link>
        <Link to="/metodologia" style={navLink}>Metodologia</Link>
        {user && <Link to="/emendas" style={navLink}>Emendas</Link>}
        {user && <Link to="/comparador" style={navLink}>Comparar</Link>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {user ? (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button onClick={() => setDropdownOpen(!dropdownOpen)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'transparent', border: '1px solid #EDEBE8',
              borderRadius: 100, cursor: 'pointer', padding: '4px 10px 4px 6px'
            }}>
              {user.photoURL
                ? <img src={user.photoURL} alt={firstName} style={{ width: 26, height: 26, borderRadius: '50%' }} />
                : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#A8D8B0,#9ECFE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>{initial}</div>
              }
              <span style={{ fontSize: 13, fontWeight: 500, color: '#2D2D2D' }}>{firstName}</span>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'linear-gradient(90deg,#FBD87F,#F7B98B)', color: '#7A4F1E', padding: '2px 8px', borderRadius: 12 }}>
                {credits !== null ? credits : '—'} cr
              </span>
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 210, border: '1px solid #EDEBE8', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5F3F0' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#2D2D2D' }}>{user.displayName || 'Usuario'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{user.email}</div>
                </div>
                <button onClick={() => { setDropdownOpen(false); navigate('/creditos'); }} style={dropItem}>💳 Comprar Creditos</button>
                <button onClick={() => { setDropdownOpen(false); navigate('/dashboard'); }} style={dropItem}>⚡ Meu Painel</button>
                <button onClick={() => { setDropdownOpen(false); logout(); }} style={{ ...dropItem, color: '#C0392B', borderTop: '1px solid #F5F3F0' }}>← Sair</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button onClick={() => setShowLogin(true)} style={{ padding: '8px 18px', borderRadius: 100, border: 'none', background: '#2D2D2D', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Entrar</button>
            {showLogin && <LoginModal onClose={() => setShowLogin(false)} onGoogle={login} onGitHub={loginWithGitHub} onEmail={loginWithEmail} onRegister={registerWithEmail} />}
          </>
        )}
      </div>
    </nav>
  );
}

const navLink = { fontSize: 13, fontWeight: 500, color: '#5A5A6E', textDecoration: 'none' };
const dropItem = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#2D2D2D', background: 'transparent', border: 'none', cursor: 'pointer' };
