import { Link } from "react-router-dom";

export default function HomePage({ user, login }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Hero */}
      <section style={{
        maxWidth: '800px', margin: '0 auto', padding: '100px 24px 60px',
        textAlign: 'center'
      }}>
        <div className="animate-fadeInUp">
          <p style={{ fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--accent-gold)', marginBottom: '16px', fontWeight: 500 }}>Dados publicos, analise independente</p>
          <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1, marginBottom: '20px' }}>
            Desmascarando o poder<br />
            <span style={{ color: 'var(--accent-green)' }}>com transparencia</span>
          </h1>
          <p style={{ fontSize: '17px', color: 'var(--text-secondary)', maxWidth: '560px', margin: '0 auto 36px', lineHeight: 1.7 }}>
            Fiscalize gastos, emendas e padroes suspeitos de todos os deputados federais do Brasil. Dados 100% oficiais, analisados com metodo aberto.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <Link to="/dashboard" style={{
                padding: '13px 28px', borderRadius: '8px',
                background: 'var(--accent-green)', color: '#fff',
                fontSize: '15px', fontWeight: 600, textDecoration: 'none',
                transition: 'all 0.2s'
              }}>Ir para o painel</Link>
            ) : (
              <Link to="/dashboard" style={{
                padding: '13px 28px', borderRadius: '8px',
                background: 'var(--accent-green)', color: '#fff',
                fontSize: '15px', fontWeight: 600, textDecoration: 'none',
                transition: 'all 0.2s'
              }}>Ver ranking nacional</Link>
            )}
            {!user && (
              <button onClick={login} style={{
                padding: '13px 28px', borderRadius: '8px',
                background: '#fff', color: 'var(--text-primary)',
                fontSize: '15px', fontWeight: 600,
                border: '1px solid var(--border-medium)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Entrar com Google
              </button>
            )}
            <a href="#como" style={{
              padding: '13px 28px', borderRadius: '8px',
              border: '1px solid var(--border-medium)', background: 'transparent',
              color: 'var(--text-secondary)', fontSize: '15px', fontWeight: 500,
              textDecoration: 'none'
            }}>Como funciona</a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{
        maxWidth: '900px', margin: '0 auto', padding: '0 24px 60px',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px'
      }}>
        {[
          { n: '513', label: 'Deputados federais', sub: 'monitorados' },
          { n: '12.000+', label: 'Despesas CEAP', sub: 'analisadas' },
          { n: '17', label: 'Sinais de risco', sub: 'calculados por perfil' },
          { n: 'IA', label: 'Analise automatica', sub: 'com metodo aberto' }
        ].map((s, i) => (
          <div key={i} className="card-hover grain-texture" style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
            padding: '24px 20px', textAlign: 'center',
            animationDelay: (i * 0.1) + 's'
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)' }}>{s.n}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px' }}>{s.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </section>

      {/* Como funciona */}
      <section id="como" style={{
        maxWidth: '800px', margin: '0 auto', padding: '60px 24px',
        borderTop: '1px solid var(--border-light)'
      }}>
        <h2 style={{ fontSize: '24px', textAlign: 'center', marginBottom: '40px', color: 'var(--text-primary)' }}>Como funciona</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
          {[
            { icon: '1', title: 'Dados oficiais', desc: 'Coletamos automaticamente gastos, emendas e atividade parlamentar das APIs oficiais da Camara e Portal da Transparencia.' },
            { icon: '2', title: 'Analise de risco', desc: 'Algoritmos identificam padroes atipicos: gastos acima da media, concentracao em poucos fornecedores, baixa presenca.' },
            { icon: '3', title: 'Dossie para acao', desc: 'Gere relatorios prontos para MP, TCU e CGU. Apartidario, tecnico e baseado apenas nos dados.' }
          ].map((s, i) => (
            <div key={i} style={{ padding: '24px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: 'var(--accent-green)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 700, marginBottom: '12px'
              }}>{s.icon}</div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>{s.title}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-light)', padding: '24px',
        textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)'
      }}>
        TransparenciaBR &mdash; Dados 100% publicos, metodologia aberta. Apartidario.
      </footer>
    </div>
  );
}
