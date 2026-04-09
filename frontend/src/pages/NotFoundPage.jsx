import { Link } from "react-router-dom";
export default function NotFoundPage() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '72px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)', marginBottom: '16px' }}>404</div>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>Pagina nao encontrada</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>A pagina que voce procura nao existe ou foi movida.</p>
      <Link to="/" style={{ padding: '12px 24px', borderRadius: '8px', background: 'var(--accent-green)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>Voltar ao inicio</Link>
    </div>
  );
}
