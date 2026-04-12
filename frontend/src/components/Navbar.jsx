import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoginModal from "./LoginModal";
import CreditWallet from "./CreditWallet";
import GlobalSearch from "./GlobalSearch";
import { AuditSealCompact } from "./AuditSeal";

const LogoMark = ({ size = 30 }) => (
  <img
    src="/brand/logo-symbol.svg"
    alt=""
    width={size}
    height={size}
    className="logo-glow"
    style={{ display: "block", flexShrink: 0 }}
  />
);

export default function Navbar({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits, isAdmin }) {
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
        <LogoMark size={30} />
        <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, color: '#2D2D2D', letterSpacing: '-0.3px' }}>transparenciabr</span>
      </Link>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <Link to="/ranking" style={navLink}>Ranking</Link>
        <Link to="/alertas" style={navLink}>Alertas</Link>
        <Link to="/mapa"    style={navLink}>Mapa</Link>
        <Link to="/metodologia" style={navLink}>Metodologia</Link>
        {user && <Link to="/emendas" style={navLink}>Emendas</Link>}
        {user && <Link to="/comparador" style={navLink}>Comparar</Link>}
      </div>

      {/* Busca global */}
      <GlobalSearch />

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
              <AuditSealCompact />
              <CreditWallet credits={credits} compact />
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 210, border: '1px solid #EDEBE8', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5F3F0' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#2D2D2D' }}>{user.displayName || 'Usuario'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{user.email}</div>
                </div>
                        <button onClick={() => { setDropdownOpen(false); navigate('/perfil'); }} style={dropItem}>🗄️ Meu Cofre</button>
                        <button onClick={() => { setDropdownOpen(false); navigate('/creditos'); }} style={dropItem}>💳 Comprar Créditos</button>
                        <button onClick={() => { setDropdownOpen(false); navigate('/dashboard'); }} style={dropItem}>⚡ Meu Painel</button>
                {isAdmin && (
                  <button onClick={() => { setDropdownOpen(false); navigate('/admin'); }} style={{ ...dropItem, color: '#C82538', fontWeight: 700 }}>☠️ Sala do Trono</button>
                )}
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
