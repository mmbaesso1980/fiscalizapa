import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const planos = [
  {
    nome: 'Explorador',
    creditos: '10',
    preco: 'R$ 29,00',
    precoNum: '29',
    priceId: 'price_1T6Jt1DH8L5YettyWqrMMeMH',
    destaque: false,
    features: [
      '10 analises com IA',
      'Acesso a todos os rankings',
      'Exportar relatorios'
    ]
  },
  {
    nome: 'Premium',
    creditos: 'Ilimitado',
    preco: 'R$ 39,90/mes',
    precoNum: '39,90',
    periodo: '/mes',
    priceId: 'price_1T9QSSDH8L5Yettym8IMuxmS',
    destaque: true,
    features: [
      'Analises ilimitadas',
      'Acesso total a plataforma',
      'Exportar relatorios',
      'Suporte prioritario',
      'Novos recursos primeiro'
    ]
  },
  {
    nome: 'Profissional',
    creditos: '25',
    preco: 'R$ 49,00',
    precoNum: '49',
    priceId: 'price_1T9XoJDH8L5YettyYh0jtpNy',
    destaque: false,
    features: [
      '25 analises com IA',
      'Acesso a todos os rankings',
      'Exportar relatorios',
      'Suporte prioritario'
    ]
  }
];

export default function CreditosPage({ user }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buy = async (plano) => {
    setError('');
    setLoading(true);
    try {
      const createCheckout = httpsCallable(functions, 'createCheckoutSession');
      const result = await createCheckout({ priceId: plano.priceId });
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    } catch (e) {
      console.error('Checkout error:', e);
      setError('Erro ao processar pagamento. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '60px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--accent-gold)', marginBottom: '12px', fontWeight: 500 }}>Planos e precos</p>
          <h1 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Invista em transparencia
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto', lineHeight: 1.6 }}>
            Cada credito permite uma analise aprofundada com inteligencia artificial sobre qualquer politico.
          </p>
        </div>

        {error && (
          <div style={{
            maxWidth: '480px', margin: '0 auto 24px', padding: '12px 16px',
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
            color: '#991b1b', fontSize: '13px', textAlign: 'center'
          }}>{error}</div>
        )}

        {/* Plans grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
          {planos.map((p) => (
            <div key={p.nome} style={{
              position: 'relative',
              background: p.destaque ? 'linear-gradient(135deg, #3d6b5e 0%, #2d5248 100%)' : 'var(--bg-card)',
              borderRadius: '16px',
              border: p.destaque ? '2px solid var(--accent-gold)' : '1px solid var(--border-light)',
              padding: '32px 28px',
              display: 'flex', flexDirection: 'column',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: p.destaque ? '0 8px 32px rgba(61,107,94,0.2)' : '0 2px 8px rgba(0,0,0,0.04)'
            }}>
              {/* Popular badge */}
              {p.destaque && (
                <div style={{
                  position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                  background: 'var(--accent-gold)', color: '#fff',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px',
                  padding: '4px 16px', borderRadius: '20px',
                  textTransform: 'uppercase'
                }}>Mais popular</div>
              )}

              {/* Plan name */}
              <h2 style={{
                fontSize: '18px', fontWeight: 700, fontFamily: 'Space Grotesk',
                color: p.destaque ? '#fff' : 'var(--text-primary)',
                marginBottom: '8px', marginTop: p.destaque ? '8px' : 0
              }}>{p.nome}</h2>

              {/* Credits */}
              <div style={{
                fontSize: '13px', fontWeight: 500,
                color: p.destaque ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                marginBottom: '16px'
              }}>{p.creditos} creditos</div>

              {/* Price */}
              <div style={{ marginBottom: '24px' }}>
                <span style={{
                  fontSize: '36px', fontWeight: 700, fontFamily: 'Space Grotesk',
                  color: p.destaque ? '#fff' : 'var(--text-primary)'
                }}>R$ {p.precoNum}</span>
                {p.periodo && (
                  <span style={{
                    fontSize: '14px',
                    color: p.destaque ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)'
                  }}>{p.periodo}</span>
                )}
              </div>

              {/* Features */}
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px', flex: 1 }}>
                {p.features.map((f, i) => (
                  <li key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px', lineHeight: '20px',
                    color: p.destaque ? 'rgba(255,255,255,0.85)' : 'var(--text-secondary)',
                    padding: '5px 0'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                      <circle cx="7" cy="7" r="7" fill={p.destaque ? 'rgba(255,255,255,0.15)' : 'rgba(61,107,94,0.1)'} />
                      <path d="M4 7l2 2 4-4" stroke={p.destaque ? '#e8d48b' : 'var(--accent-green)'} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Buy button */}
              <button
                onClick={() => buy(p)}
                disabled={loading}
                style={{
                  width: '100%', padding: '12px 20px',
                  borderRadius: '8px', fontSize: '14px', fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  border: p.destaque ? 'none' : '1px solid var(--border-medium)',
                  background: p.destaque ? 'var(--accent-gold)' : 'transparent',
                  color: p.destaque ? '#fff' : 'var(--text-primary)',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? 'Processando...' : 'Escolher plano'}
              </button>
            </div>
          ))}
        </div>

        {/* Trust section */}
        <div style={{ textAlign: 'center', marginTop: '48px', padding: '24px', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '32px', flexWrap: 'wrap' }}>
            {[
              { icon: '🔒', text: 'Pagamento seguro via Stripe' },
              { icon: '⚡', text: 'Creditos liberados na hora' },
              { icon: '📊', text: 'Dados 100% oficiais' }
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
