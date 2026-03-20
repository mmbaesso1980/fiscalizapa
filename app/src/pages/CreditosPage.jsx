import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';

// Pacotes de creditos disponiveis
const PACKAGES = [
  {
    id: 'price_starter_10',
    name: 'Starter',
    credits: 10,
    price: 'R$ 9,90',
    priceNum: 9.90,
    perCredit: 'R$ 0,99',
    color: '#22c55e',
    icon: '\u26A1',
    popular: false,
  },
  {
    id: 'price_pro_50',
    name: 'Pro',
    credits: 50,
    price: 'R$ 39,90',
    priceNum: 39.90,
    perCredit: 'R$ 0,80',
    color: '#3b82f6',
    icon: '\uD83D\uDE80',
    popular: true,
  },
  {
    id: 'price_ultra_200',
    name: 'Ultra',
    credits: 200,
    price: 'R$ 99,90',
    priceNum: 99.90,
    perCredit: 'R$ 0,50',
    color: '#8b5cf6',
    icon: '\uD83D\uDC8E',
    popular: false,
  },
  {
    id: 'price_ilimitado',
    name: 'Ilimitado',
    credits: 999999,
    price: 'R$ 49,90/mes',
    priceNum: 49.90,
    perCredit: 'Ilimitado',
    color: '#f59e0b',
    icon: '\u221E',
    popular: false,
  },
];

const TIPO_LABELS = {
  PURCHASE: { label: 'Compra', color: '#22c55e' },
  TRIAL: { label: 'Boas-vindas', color: '#3b82f6' },
  CONSUME_CHAT: { label: 'Chat IA', color: '#ef4444' },
  CONSUME_ANALYSIS: { label: 'Analise IA', color: '#ef4444' },
  BONUS: { label: 'Bonus', color: '#8b5cf6' },
  REFUND: { label: 'Estorno', color: '#f59e0b' },
};

export default function CreditosPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess('Pagamento confirmado! Seus creditos serao adicionados em instantes.');
      window.history.replaceState({}, '', '/creditos');
    }
    if (params.get('canceled') === 'true') {
      setError('Pagamento cancelado.');
      window.history.replaceState({}, '', '/creditos');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const [walletRes, histRes] = await Promise.all([
        httpsCallable(functions, 'getWalletCredits')({}),
        httpsCallable(functions, 'getCreditHistory')({ limit: 20 }),
      ]);
      setWallet(walletRes.data);
      setHistorico(histRes.data.historico || []);
    } catch (e) {
      console.error('Erro ao carregar creditos:', e);
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBuy(packageId) {
    setBuying(packageId);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'buyCredits')({ packageId });
      if (result.data.url) window.location.href = result.data.url;
    } catch (e) {
      setError(e.message || 'Erro ao processar compra.');
    } finally {
      setBuying(null);
    }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 800, margin: '40px auto', padding: 20, textAlign: 'center' }}>
        <h2>Faca login para gerenciar seus creditos</h2>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 16px' }}>
      {/* Header com saldo */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        borderRadius: 16, padding: '32px 24px', color: '#fff', marginBottom: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Meus Creditos</h1>
          <p style={{ margin: '8px 0 0', opacity: 0.8, fontSize: 14 }}>
            Use creditos para analises com IA e chat inteligente
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '16px 32px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 42, fontWeight: 800 }}>
            {loading ? '...' : (wallet?.plano === 'ilimitado' ? '\u221E' : (wallet?.saldo || 0))}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {wallet?.plano === 'ilimitado' ? 'Plano Ilimitado' : 'creditos disponiveis'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#dc2626' }}>
          {error}
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>X</button>
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#16a34a' }}>
          {success}
          <button onClick={() => setSuccess(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}>X</button>
        </div>
      )}

      <h2 style={{ marginBottom: 16 }}>Comprar Creditos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
        {PACKAGES.map(pkg => (
          <div key={pkg.id} style={{
            border: pkg.popular ? `2px solid ${pkg.color}` : '1px solid #e5e7eb',
            borderRadius: 12, padding: 24, textAlign: 'center',
            position: 'relative', background: '#fff',
            boxShadow: pkg.popular ? `0 4px 20px ${pkg.color}33` : 'none',
          }}>
            {pkg.popular && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: pkg.color, color: '#fff', padding: '4px 16px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>MAIS POPULAR</div>
            )}
            <div style={{ fontSize: 36, marginBottom: 8 }}>{pkg.icon}</div>
            <h3 style={{ margin: '0 0 4px', fontSize: 20 }}>{pkg.name}</h3>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>
              {pkg.credits === 999999 ? 'Uso ilimitado' : `${pkg.credits} creditos`}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: pkg.color, marginBottom: 4 }}>{pkg.price}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>
              {pkg.credits === 999999 ? 'Cancele quando quiser' : `${pkg.perCredit} por credito`}
            </div>
            <button onClick={() => handleBuy(pkg.id)} disabled={buying !== null} style={{
              width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
              cursor: buying ? 'wait' : 'pointer',
              background: buying === pkg.id ? '#9ca3af' : pkg.color,
              color: '#fff', fontWeight: 700, fontSize: 15,
            }}>
              {buying === pkg.id ? 'Processando...' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>

      <h2 style={{ marginBottom: 16 }}>Historico de Transacoes</h2>
      {loading ? <p>Carregando...</p> : historico.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>Nenhuma transacao ainda.</p>
      ) : (
        <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Tipo</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Creditos</th>
                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => {
                const info = TIPO_LABELS[h.tipo] || { label: h.tipo, color: '#6b7280' };
                const data = h.criadoEm?.seconds ? new Date(h.criadoEm.seconds * 1000).toLocaleDateString('pt-BR') : '-';
                return (
                  <tr key={h.id || i} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: `${info.color}15`, color: info.color, fontSize: 12, fontWeight: 600 }}>{info.label}</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: h.credits > 0 ? '#22c55e' : '#ef4444' }}>
                      {h.credits > 0 ? '+' : ''}{h.credits}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 32, padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
        <strong>Como funcionam os creditos?</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>Chat com IA: 1 credito por mensagem</li>
          <li>Analise completa de politico: 2 creditos</li>
          <li>Novos usuarios recebem 5 creditos gratis</li>
          <li>Pagamento seguro via Stripe (cartao ou PIX)</li>
        </ul>
      </div>
    </div>
  );
}
