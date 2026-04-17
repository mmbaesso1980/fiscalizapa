import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CreditBadge from "./CreditBadge";
import GlobalSearch from "./GlobalSearch";
import { AuditSealCompact } from "./AuditSeal";
import LogoOrb from "./LogoOrb";

export default function Navbar({ user, logout, credits, isAdmin }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
    <>
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 60,
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
          <LogoOrb size={32} />
          <span style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontWeight: 700, fontSize: 16,
            color: '#1B5E3B', letterSpacing: '-0.5px',
          }}>
            transparência<span style={{ fontWeight: 400, color: '#6b7280' }}>br</span>
          </span>
        </Link>

        {/* Desktop: Ranking link + Search */}
        <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, justifyContent: 'center' }}>
          <Link to="/ranking" style={navLink}>Ranking</Link>
          <div style={{ maxWidth: 320, flex: 1 }}>
            <GlobalSearch />
          </div>
        </div>

        {/* Desktop: user area */}
        <div className="nav-desktop" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {user ? (
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: '1px solid #e5e7eb',
                borderRadius: 100, cursor: 'pointer', padding: '4px 10px 4px 6px',
              }}>
                {user.photoURL
                  ? <img src={user.photoURL} alt={firstName} style={{ width: 26, height: 26, borderRadius: '50%' }} />
                  : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#A8D8B0,#9ECFE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>{initial}</div>
                }
                <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{firstName}</span>
                <AuditSealCompact />
                <CreditBadge credits={credits} compact />
              </button>
              {dropdownOpen && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 210, border: '1px solid #e5e7eb', zIndex: 200, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>{user.displayName || 'Usuário'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
                  </div>
                  <button onClick={() => { setDropdownOpen(false); navigate('/usuario'); }} style={dropItem}>Minha conta</button>
                  <button onClick={() => { setDropdownOpen(false); navigate('/perfil'); }} style={dropItem}>Meu Cofre</button>
                  <button onClick={() => { setDropdownOpen(false); navigate('/creditos'); }} style={dropItem}>Comprar Créditos</button>
                  <button onClick={() => { setDropdownOpen(false); navigate('/dashboard'); }} style={dropItem}>Meu Painel</button>
                  {isAdmin && (
                    <button onClick={() => { setDropdownOpen(false); navigate('/admin'); }} style={{ ...dropItem, color: '#C82538', fontWeight: 700 }}>Admin</button>
                  )}
                  <button onClick={() => { setDropdownOpen(false); logout(); }} style={{ ...dropItem, color: '#C0392B', borderTop: '1px solid #f3f4f6' }}>Sair</button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => navigate('/login')} style={{
              padding: '8px 20px', borderRadius: 100, border: 'none',
              background: '#1B5E3B', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              Entrar
            </button>
          )}
        </div>

        {/* Mobile: hamburger */}
        <button
          className="nav-mobile-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            display: 'none', background: 'none', border: 'none',
            cursor: 'pointer', padding: 6, flexShrink: 0,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round">
            {mobileOpen
              ? <path d="M6 6l12 12M6 18L18 6" />
              : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>
            }
          </svg>
        </button>
      </nav>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: 60, left: 0, right: 0, bottom: 0,
          background: '#ffffff', zIndex: 99,
          padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 4,
          overflowY: 'auto',
        }}>
          <div style={{ marginBottom: 12 }}>
            <GlobalSearch />
          </div>
          <MobileLink to="/ranking" label="Ranking" onClick={() => setMobileOpen(false)} />
          <MobileLink to="/emendas" label="Emendas" onClick={() => setMobileOpen(false)} />
          <MobileLink to="/mapa" label="Mapa" onClick={() => setMobileOpen(false)} />
          <MobileLink to="/metodologia" label="Metodologia" onClick={() => setMobileOpen(false)} />
          {user && (
            <>
              <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />
              <MobileLink to="/creditos" label="Comprar Créditos" onClick={() => setMobileOpen(false)} />
              <MobileLink to="/perfil" label="Meu Cofre" onClick={() => setMobileOpen(false)} />
              <MobileLink to="/dashboard" label="Meu Painel" onClick={() => setMobileOpen(false)} />
              <MobileLink to="/usuario" label="Minha Conta" onClick={() => setMobileOpen(false)} />
              {isAdmin && <MobileLink to="/admin" label="Admin" onClick={() => setMobileOpen(false)} />}
              <button onClick={() => { setMobileOpen(false); logout(); }} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 0', fontSize: 15, color: '#C0392B', fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                borderTop: '1px solid #f3f4f6',
              }}>
                Sair
              </button>
            </>
          )}
          {!user && (
            <>
              <div style={{ height: 1, background: '#f3f4f6', margin: '8px 0' }} />
              <button onClick={() => { setMobileOpen(false); navigate('/login'); }} style={{
                padding: '14px 0', background: '#1B5E3B', color: '#fff',
                borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 15,
                cursor: 'pointer', width: '100%', marginTop: 4,
              }}>
                Entrar
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function MobileLink({ to, label, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      style={{
        display: 'block', padding: '12px 0',
        fontSize: 15, color: '#1a1a1a', textDecoration: 'none',
        fontWeight: 500, borderBottom: '1px solid #f3f4f6',
      }}
    >
      {label}
    </Link>
  );
}

const navLink = { fontSize: 14, fontWeight: 500, color: '#374151', textDecoration: 'none' };
const dropItem = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#1a1a1a', background: 'transparent', border: 'none', cursor: 'pointer' };
