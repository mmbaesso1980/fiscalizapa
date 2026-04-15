import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

const PACKAGES = [
  {
    id: 'price_starter_50',
    name: 'Starter',
    credits: 50,
    price: 'R$ 19,90',
    perCredit: 'R$ 0,40',
    color: '#22c55e',
    icon: '\u26A1',
    popular: false,
    descricao: '50 créditos — ideal para explorar a plataforma',
  },
  {
    id: 'price_pro_200',
    name: 'Profissional',
    credits: 200,
    price: 'R$ 59,90',
    perCredit: 'R$ 0,30',
    color: '#3b82f6',
    icon: '\uD83D\uDE80',
    popular: true,
    descricao: '200 créditos — melhor custo-benefício',
  },
  {
    id: 'price_analista_500',
    name: 'Analista',
    credits: 500,
    price: 'R$ 129,90',
    perCredit: 'R$ 0,26',
    color: '#8b5cf6',
    icon: '\uD83D\uDC8E',
    popular: false,
    descricao: '500 créditos para uso intensivo e dossiês completos',
  },
  {
    id: 'price_enterprise',
    name: 'Enterprise',
    credits: 999999,
    price: 'R$ 299/mês',
    perCredit: 'Ilimitado',
    color: '#f59e0b',
    icon: '\u221E',
    popular: false,
    descricao: 'Créditos ilimitados + API dedicada + suporte prioritário',
  },
];

const TIPO_LABELS = {
  PURCHASE:         { label: 'Compra',      color: '#22c55e' },
  TRIAL:            { label: 'Boas-vindas', color: '#3b82f6' },
  CONSUME_CHAT:     { label: 'Chat IA',     color: '#ef4444' },
  CONSUME_ANALYSIS: { label: 'Análise IA',  color: '#ef4444' },
  BONUS:            { label: 'Bônus',       color: '#8b5cf6' },
  REFERRAL_BONUS:   { label: 'Indicação',   color: '#8b5cf6' },
  REFUND:           { label: 'Estorno',     color: '#f59e0b' },
};

export default function CreditosPage() {
  const { user } = useAuth();
  const [wallet, setWallet]       = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState(null);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccess('Pagamento confirmado! Seus créditos serão adicionados em instantes.');
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
    setError(null);
    try {
      let walletData = null;
      try {
        const res = await httpsCallable(functions, 'getWalletCredits')({});
        walletData = res.data;
      } catch (fnErr) {
        console.warn('getWalletCredits falhou, usando fallback:', fnErr.message);
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
          const d = snap.data();
          let plano = d.plano ?? 'free';
          if (plano !== 'premium' && plano !== 'ilimitado') {
            const leg = await getDoc(doc(db, 'usuarios', user.uid));
            if (leg.exists() && leg.data()?.plan === 'premium') plano = 'premium';
          }
          walletData = {
            saldo: d.creditos ?? d.credits ?? 0,
            plano,
            totalComprado: 0,
            totalConsumido: 0
          };
        } else {
          walletData = { saldo: 0, plano: 'free', totalComprado: 0, totalConsumido: 0 };
        }
      }
      setWallet(walletData);

      try {
        const histRes = await httpsCallable(functions, 'getCreditHistory')({ limit: 20 });
        setHistorico(histRes.data.historico || []);
      } catch (e) {
        console.warn('getCreditHistory falhou:', e.message);
        setHistorico([]);
      }
    } catch (e) {
      setError('Erro ao carregar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleBuy(packageId) {
    setBuying(packageId);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'buyCredits')({
        packageId,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      if (result.data && result.data.url) {
        window.location.href = result.data.url;
      } else {
        setError('Não foi possível iniciar o pagamento. Tente novamente.');
      }
    } catch (e) {
      setError(e.message || 'Erro ao processar compra.');
    } finally {
      setBuying(null);
    }
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: '#1e293b' }}>Faça login para gerenciar seus créditos</h2>
      </div>
    );
  }

  const saldo = wallet?.plano === 'ilimitado' ? '∞' : (wallet?.saldo ?? 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px', fontFamily: 'sans-serif' }}>

      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Meus Créditos</h1>
        <p style={{ color: '#64748b', marginBottom: 20 }}>Use créditos para análises com IA e chat inteligente</p>
        <div style={{ display: 'inline-block', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', borderRadius: 16, padding: '24px 48px' }}>
          <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1 }}>{loading ? '...' : saldo}</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>
            {wallet?.plano === 'ilimitado' ? 'Plano Ilimitado' : 'créditos disponíveis'}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#dc2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 20, fontWeight: 700 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#16a34a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontSize: 20, fontWeight: 700 }}>×</button>
        </div>
      )}

      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Comprar Créditos</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
        {PACKAGES.map(pkg => (
          <div key={pkg.id} style={{ border: pkg.popular ? `2px solid ${pkg.color}` : '1.5px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#fff', position: 'relative', boxShadow: pkg.popular ? `0 4px 20px ${pkg.color}33` : '0 1px 4px rgba(0,0,0,0.06)' }}>
            {pkg.popular && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: pkg.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>
                MAIS POPULAR
              </div>
            )}
            <div style={{ fontSize: 32, marginBottom: 8 }}>{pkg.icon}</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>{pkg.name}</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px', minHeight: 36 }}>{pkg.descricao}</p>
            <div style={{ fontSize: 22, fontWeight: 800, color: pkg.color, marginBottom: 4 }}>{pkg.price}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              {pkg.credits === 999999 ? 'Cancele quando quiser' : `${pkg.perCredit} por crédito`}
            </div>
            <button
              onClick={() => handleBuy(pkg.id)}
              disabled={buying !== null}
              style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: buying ? 'wait' : 'pointer', background: buying === pkg.id ? '#9ca3af' : pkg.color, color: '#fff', fontWeight: 700, fontSize: 15 }}
            >
              {buying === pkg.id ? 'Redirecionando...' : 'Comprar'}
            </button>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Histórico de Transações</h2>
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Carregando...</p>
      ) : historico.length === 0 ? (
        <p style={{ color: '#94a3b8' }}>Nenhuma transação registrada ainda.</p>
      ) : (
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Tipo</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Créditos</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b', fontWeight: 600 }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h, i) => {
                const info = TIPO_LABELS[h.tipo] || { label: h.tipo, color: '#6b7280' };
                const data = h.criadoEm?.seconds ? new Date(h.criadoEm.seconds * 1000).toLocaleDateString('pt-BR') : '-';
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: info.color + '22', color: info.color, borderRadius: 6, padding: '2px 10px', fontWeight: 600, fontSize: 12 }}>{info.label}</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: h.credits > 0 ? '#22c55e' : '#ef4444' }}>
                      {h.credits > 0 ? '+' : ''}{h.credits}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#64748b' }}>{data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20, marginTop: 32 }}>
        <strong style={{ color: '#1e293b' }}>Como funcionam os créditos?</strong>
        <ul style={{ marginTop: 12, color: '#64748b', lineHeight: 2, paddingLeft: 20 }}>
          <li>Ver ranking de deputados e score público: <strong>Gratuito</strong></li>
          <li>Detalhes CEAP de um deputado: <strong>2 créditos</strong></li>
          <li>Lista de emendas de um deputado: <strong>1 crédito</strong></li>
          <li>Score detalhado com alertas: <strong>3 créditos</strong></li>
          <li>Dossiê PDF básico: <strong>5 créditos</strong></li>
          <li>Análise forense de funcionários: <strong>10 créditos</strong></li>
          <li>Cruzamento CNPJ + CEIS + emendas: <strong>15 créditos</strong></li>
          <li>Dossiê completo: <strong>20 créditos</strong></li>
          <li>Novos usuários recebem <strong>10 créditos bônus</strong></li>
          <li>Pagamento seguro via Stripe (cartão)</li>
        </ul>
      </div>

    </div>
  );
}
          
          
