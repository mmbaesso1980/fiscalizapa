import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";

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
    <rect x="42" y="25" width="16" height="55" rx="2" fill="url(#lightBeam)" >
      <animate attributeName="opacity" values="0.5;0.9;0.5" dur="3s" repeatCount="indefinite" />
    </rect>
    <circle cx="50" cy="48" r="5" fill="#c9a84c" opacity="0.6">
      <animate attributeName="r" values="4;6;4" dur="3s" repeatCount="indefinite" />
    </circle>
  </svg>
);

export default function Navbar({ user, login, logout, credits }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,250,248,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-light)',
      padding: '0 24px', height: '60px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      maxWidth: '100%'
    }}>
      {/* Left: Logo */}
      <Link to={user ? "/dashboard" : "/"} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <LogoSVG />
        <div>
          <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>TransparenciaBR</span>
          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '-2px' }}>Fiscaliza com dados</span>
        </div>
      </Link>

      {/* Center: Navigation links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {user ? (
          <>
            <Link to="/dashboard" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Painel</Link>
            <Link to="/creditos" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Creditos</Link>
          </>
        ) : null}
        <Link to="/metodologia" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Metodologia</Link>
      </div>

      {/* Right: User area or login */}
      {user ? (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '4px 8px', borderRadius: '8px',
              transition: 'background 0.2s'
            }}
          >
            {/* User photo or initials */}
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={firstName}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--accent-green)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700
              }}>{initial}</div>
            )}
            {/* Name */}
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{firstName}</span>
            {/* Credits badge */}
            <span style={{
              fontSize: '11px', fontWeight: 700,
              background: 'var(--accent-gold)', color: '#fff',
              padding: '2px 8px', borderRadius: '10px',
              lineHeight: '18px'
            }}>{credits !== null ? credits : '...'}</span>
            {/* Chevron */}
            <svg width="12" height="12" viewBox="0 0 12 12" style={{ opacity: 0.5 }}>
              <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '8px',
              background: '#fff', borderRadius: '10px',
              border: '1px solid var(--border-light)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
              minWidth: '180px', overflow: 'hidden', zIndex: 100
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{user.displayName || 'Usuario'}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{user.email}</div>
              </div>
              <button
                onClick={() => { setDropdownOpen(false); navigate('/creditos'); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 16px', fontSize: '13px', fontWeight: 500,
                  color: 'var(--text-secondary)', background: 'transparent',
                  border: 'none', cursor: 'pointer', transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover, #f5f5f3)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >Comprar Creditos</button>
              <button
                onClick={() => { setDropdownOpen(false); logout(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 16px', fontSize: '13px', fontWeight: 500,
                  color: '#c0392b', background: 'transparent',
                  border: 'none', cursor: 'pointer',
                  borderTop: '1px solid var(--border-light)',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--bg-hover, #f5f5f3)'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >Sair</button>
            </div>
          )}
        </div>
      ) : (
        <button onClick={login} style={{
          fontSize: '13px', padding: '7px 16px', borderRadius: '6px',
          background: 'var(--accent-green)', color: '#fff', border: 'none',
          cursor: 'pointer', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" opacity="0.9"/>
            <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.7"/>
          </svg>
          Entrar com Google
        </button>
      )}
    </nav>
  );
}
