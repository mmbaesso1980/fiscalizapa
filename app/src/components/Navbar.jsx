import { Link } from "react-router-dom";

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

export default function Navbar({ user, login, logout }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'rgba(250,250,248,0.92)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-light)',
      padding: '0 24px', height: '60px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      maxWidth: '100%'
    }}>
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <LogoSVG />
        <div>
          <span style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: '18px', color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>TransparenciaBR</span>
          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginTop: '-2px' }}>Fiscaliza com dados</span>
        </div>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <Link to="/dashboard" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Painel</Link>
        <Link to="/creditos" style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500 }}>Metodologia</Link>
        {user ? (
          <button onClick={logout} style={{
            fontSize: '13px', padding: '7px 16px', borderRadius: '6px',
            border: '1px solid var(--border-light)', background: 'transparent',
            color: 'var(--text-secondary)', cursor: 'pointer'
          }}>Sair</button>
        ) : (
          <button onClick={login} style={{
            fontSize: '13px', padding: '7px 16px', borderRadius: '6px',
            background: 'var(--accent-green)', color: '#fff', border: 'none',
            cursor: 'pointer', fontWeight: 500
          }}>Entrar</button>
        )}
      </div>
    </nav>
  );
}
