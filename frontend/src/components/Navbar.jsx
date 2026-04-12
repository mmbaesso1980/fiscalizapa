import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CreditBadge from "./CreditBadge";
import GlobalSearch from "./GlobalSearch";
import { AuditSealCompact } from "./AuditSeal";

const LogoMark = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M20 3 L35 10 L35 22 C35 30 28 36 20 38 C12 36 5 30 5 22 L5 10 Z"
      fill="url(#shieldGrad)"
      stroke="#1B5E3B"
      strokeWidth="1.2"
    />
    <circle cx="20" cy="19" r="7" fill="none" stroke="#fff" strokeWidth="2" opacity="0.9" />
    <circle cx="20" cy="19" r="2.5" fill="#fff" opacity="0.95" />
    <line x1="25" y1="24" x2="30" y2="29" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <defs>
      <linearGradient id="shieldGrad" x1="5" y1="3" x2="35" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#2E7F6E" />
        <stop offset="100%" stopColor="#1B5E3B" />
      </linearGradient>
    </defs>
  </svg>
);

export default function Navbar({ user, logout, credits, isAdmin }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
      padding: '0 24px', height: 64, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(27,94,59,0.08)', position: 'sticky', top: 0, zIndex: 100,
      boxShadow: '0 1px 8px rgba(27,94,59,0.06)'
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
        <LogoMark size={30} />
        <span style={{
          fontFamily: "'Fraunces', serif",
          fontWeight: 700,
          fontSize: 16,
          color: '#1B5E3B',
          letterSpacing: '-0.5px'
        }}>
          transparência<span style={{ fontWeight: 400, color: '#2E7F6E' }}>br</span>
        </span>
      </Link>

      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <Link to="/ranking" style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Ranking</Link>
        <Link to="/alertas" style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Alertas</Link>
        <Link to="/mapa"    style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Mapa</Link>
        <Link to="/metodologia" style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Metodologia</Link>
        <Link to="/emendas" style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Emendas</Link>
        {user && <Link to="/comparador" style={navLink} onMouseEnter={navLinkHoverIn} onMouseLeave={navLinkHoverOut}>Comparar</Link>}
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
              <CreditBadge credits={credits} compact />
            </button>
            {dropdownOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', minWidth: 210, border: '1px solid #EDEBE8', zIndex: 200, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #F5F3F0' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#2D2D2D' }}>{user.displayName || 'Usuario'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{user.email}</div>
                </div>
                        <button onClick={() => { setDropdownOpen(false); navigate('/usuario'); }} style={dropItem}>👤 Minha conta</button>
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
          <button type="button" onClick={() => navigate('/login')} style={{ padding: '8px 18px', borderRadius: 100, border: 'none', background: 'linear-gradient(135deg, #2E7F6E, #1B5E3B)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Entrar</button>
        )}
      </div>
    </nav>
  );
}

const navLink = { fontSize: 13, fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'color 0.15s' };
function navLinkHoverIn(e) { e.currentTarget.style.color = '#1B5E3B'; }
function navLinkHoverOut(e) { e.currentTarget.style.color = '#374151'; }
const dropItem = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 13, fontWeight: 500, color: '#2D2D2D', background: 'transparent', border: 'none', cursor: 'pointer' };
