import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import LoginModal from "./LoginModal";

const LogoSVG = () => (
  <svg width="36" height="36" viewBox="0 0 100 100" className="logo-glow">
    <defs>
      <linearGradient id="portalGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#3d6b5e" />
        <stop offset="50%" stopColor="#c9a84c" />
        <stop offset="100%" stopColor="#e8d48b" />
      </linearGradient>
      <linearGradient id="lightBeam" x1="50%" y1="100%" x2="50%" y2="0%">
        <stop offset="0%" stopColor="#c9a84c" stopOpacity="0" />
        <stop offset="50%" stopColor="#c9a84c" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#e8d48b" stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="20" y="10" width="8" height="80" rx="4" fill="url(#portalGrad)" opacity="0.9" />
    <rect x="72" y="10" width="8" height="80" rx="4" fill="url(#portalGrad)" opacity="0.9" />
    <rect x="20" y="10" width="60" height="6" rx="3" fill="url(#portalGrad)" opacity="0.7" />
    <rect x="42" y="25" width="16" height="55" rx="2" fill="url(#lightBeam)">
      <animate attributeName="opacity" values="0.5;0.9;0.5" dur="3s" repeatCount="indefinite" />
    </rect>
    <circle cx="50" cy="48" r="5" fill="#c9a84c" opacity="0.6">
      <animate attributeName="r" values="4;6;4" dur="3s" repeatCount="indefinite" />
    </circle>
  </svg>
);

export default function Navbar({ user, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const firstName = user?.displayName ? user.displayName.split(' ')[0] : '';
  const initial = user?.displayName ? user.displayName.charAt(0).toUpperCase() : '?';

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 24px', background: 'var(--bg-nav, #fff)',
      borderBottom: '1px solid var(--border-light, #e5e5e5)', position: 'sticky', top: 0, zIndex: 100
    }}>
      {/* Left: Logo */}
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <LogoSVG />
        <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>TransparenciaBR</span>
        &nbsp;
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Fiscaliza com dados</span>
      </Link>

      {/* Center: Navigation links */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        {user ? (
          <>
            <Link to="/dashboard" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' }}>Painel</Link>
            <Link to="/creditos" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' }}>Creditos</Link>
          </>
        ) : null}
        <Link to="/metodologia" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', textDecoration: 'none' }}>Metodologia</Link>
      </div>

      {/* Right: User area or login */}
      {user ? (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button onClick={() => setDropdownOpen(!dropdownOpen)} style={{
            display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent',
            border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px', transition: 'background 0.2s'
          }}>
            {user.photoURL ? (
              <img src={user.photoURL} alt={firstName} style={{ width: 32, height: 32, borderRadius: '50%' }} />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: '#3d6b5e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 14
              }}>{initial}</div>
            )}
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{firstName}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, background: '#e8d48b', color: '#333',
              padding: '2px 8px', borderRadius: 12
            }}>{credits !== null ? credits : '...'}</span>
          </button>
          {dropdownOpen && (
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 8,
              background: 'var(--bg-card, #fff)', borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 200, overflow: 'hidden',
              border: '1px solid var(--border-light, #e5e5e5)', zIndex: 200
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{user.displayName || 'Usuario'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{user.email}</div>
              </div>
              <button onClick={() => { setDropdownOpen(false); navigate('/creditos'); }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px',
                fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)',
                background: 'transparent', border: 'none', cursor: 'pointer', transition: 'background 0.15s'
              }} onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover, #f5f5f3)'}
                 onMouseLeave={(e) => e.target.style.background = 'transparent'}>Comprar Creditos</button>
              <button onClick={() => { setDropdownOpen(false); logout(); }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px',
                fontSize: '13px', fontWeight: 500, color: '#c0392b',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderTop: '1px solid var(--border-light)', transition: 'background 0.15s'
              }} onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover, #f5f5f3)'}
                 onMouseLeave={(e) => e.target.style.background = 'transparent'}>Sair</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <button onClick={() => setShowLogin(true)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: '#3d6b5e', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer'
          }}>Entrar</button>
          {showLogin && (
            <LoginModal
              onClose={() => setShowLogin(false)}
              onGoogle={login}
              onGitHub={loginWithGitHub}
              onEmail={loginWithEmail}
              onRegister={registerWithEmail}
            />
          )}
        </>
      )}
    </nav>
  );
}
