import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

// ─── PLANOS DE ASSINATURA (price_ids a configurar no Stripe Dashboard) ─────────
// Após criar os produtos no Stripe, substitua os price_id abaixo pelos IDs reais.
const PLANS = [
  {
    id: 'free',
    stripeProductId: null, // sem cobrança
    name: 'Gratuito',
    price: 'R$ 0',
    priceDetail: 'para sempre',
    credits: 0,
    creditsLabel: '— créditos/mês',
    color: '#6b7280',
    icon: '👁',
    popular: false,
    features: [
      'Ranking público completo',
      'Top 10 / Bottom 10',
      'Score público dos políticos',
      '10 créditos bônus no cadastro',
    ],
    cta: 'Começar grátis',
    ctaLink: null,
  },
  {
    id: 'cidadao',
    stripeProductId: 'price_cidadao_monthly', // ← substituir pelo ID real do Stripe
    name: 'Cidadão',
    price: 'R$ 19,90',
    priceDetail: '/mês',
    credits: 200,
    creditsLabel: '200 créditos/mês',
    color: '#22c55e',
    icon: '🗳',
    popular: false,
    features: [
      '200 créditos por mês',
      'Dossiê básico (5 cr)',
      'Detalhes CEAP (2 cr)',
      'Lista de emendas (1 cr)',
      'Score detalhado + alertas (3 cr)',
    ],
    cta: 'Assinar',
    ctaLink: null,
  },
  {
    id: 'jornalista',
    stripeProductId: 'price_jornalista_monthly', // ← substituir pelo ID real do Stripe
    name: 'Jornalista',
    price: 'R$ 59,90',
    priceDetail: '/mês',
    credits: 750,
    creditsLabel: '750 créditos/mês',
    color: '#3b82f6',
    icon: '📰',
    popular: true,
    features: [
      '750 créditos por mês',
      'Tudo do plano Cidadão',
      'Análise forense (10 cr)',
      'Cruzamento CNPJ+CEIS+emendas (15 cr)',
      'Dossiê completo (20 cr)',
      'Export CSV/PDF',
    ],
    cta: 'Assinar',
    ctaLink: null,
  },
  {
    id: 'pro',
    stripeProductId: 'price_pro_monthly', // ← substituir pelo ID real do Stripe
    name: 'Pro',
    price: 'R$ 149,90',
    priceDetail: '/mês',
    credits: 2000,
    creditsLabel: '2.000 créditos/mês',
    color: '#8b5cf6',
    icon: '⚡',
    popular: false,
    features: [
      '2.000 créditos por mês',
      'Tudo do plano Jornalista',
      'Badge Ficha Limpa automático',
      'Alertas de novos registros',
      'Comparador avançado',
      'Suporte prioritário',
    ],
    cta: 'Assinar',
    ctaLink: null,
  },
  {
    id: 'institucional',
    stripeProductId: 'price_institucional_monthly', // ← substituir pelo ID real do Stripe
    name: 'Institucional',
    price: 'R$ 499,90',
    priceDetail: '/mês',
    credits: 999999,
    creditsLabel: 'Créditos ilimitados',
    color: '#f59e0b',
    icon: '🏛',
    popular: false,
    features: [
      'Créditos ilimitados',
      'Tudo do plano Pro',
      'API dedicada',
      'Múltiplos usuários (até 5)',
      'Onboarding personalizado',
      'SLA e suporte 24h',
    ],
    cta: 'Falar com equipe',
    ctaLink: 'mailto:contato@transparenciabr.com.br',
  },
];

// ─── PACOTES AVULSOS DE CRÉDITOS (one-time payment) ────────────────────────────
const PACKAGES = [
  {
    id: 'price_avulso_150',   // ← substituir pelo ID real do Stripe
    name: 'Mini',
    credits: 150,
    price: 'R$ 9,90',
    perCredit: 'R$ 0,066/cr',
    color: '#22c55e',
    icon: '⚡',
    popular: false,
    descricao: '150 créditos — ótimo para uma pesquisa pontual',
  },
  {
    id: 'price_avulso_500',   // ← substituir pelo ID real do Stripe
    name: 'Padrão',
    credits: 500,
    price: 'R$ 29,90',
    perCredit: 'R$ 0,060/cr',
    color: '#3b82f6',
    icon: '🚀',
    popular: true,
    descricao: '500 créditos — para jornalistas e pesquisadores',
  },
  {
    id: 'price_avulso_2000',  // ← substituir pelo ID real do Stripe
    name: 'Profissional',
    credits: 2000,
    price: 'R$ 99,90',
    perCredit: 'R$ 0,050/cr',
    color: '#8b5cf6',
    icon: '💎',
    popular: false,
    descricao: '2.000 créditos — uso intensivo e dossiês completos',
  },
  {
    id: 'price_avulso_5000',  // ← substituir pelo ID real do Stripe
    name: 'Analista',
    credits: 5000,
    price: 'R$ 149,90',
    perCredit: 'R$ 0,030/cr',
    color: '#f59e0b',
    icon: '🏆',
    popular: false,
    descricao: '5.000 créditos — maior volume, menor custo por crédito',
  },
];

const TIPO_LABELS = {
  PURCHASE:         { label: 'Compra',      color: '#22c55e' },
  SUBSCRIPTION:     { label: 'Assinatura',  color: '#3b82f6' },
  TRIAL:            { label: 'Boas-vindas', color: '#3b82f6' },
  CONSUME_CHAT:     { label: 'Chat IA',     color: '#ef4444' },
  CONSUME_ANALYSIS: { label: 'Análise IA',  color: '#ef4444' },
  BONUS:            { label: 'Bônus',       color: '#8b5cf6' },
  REFERRAL_BONUS:   { label: 'Indicação',   color: '#8b5cf6' },
  REFUND:           { label: 'Estorno',     color: '#f59e0b' },
};

// Custo em créditos por feature
const CREDIT_COST = [
  { label: 'Ranking e score público',           cost: 'Grátis' },
  { label: 'Lista de emendas do deputado',       cost: '1 cr' },
  { label: 'Detalhes CEAP',                     cost: '2 cr' },
  { label: 'Score detalhado + alertas',          cost: '3 cr' },
  { label: 'Dossiê PDF básico',                  cost: '5 cr' },
  { label: 'Análise forense de funcionários',    cost: '10 cr' },
  { label: 'Cruzamento CNPJ + CEIS + emendas',   cost: '15 cr' },
  { label: 'Dossiê completo',                    cost: '20 cr' },
  { label: 'Badge Ficha Limpa automático',        cost: '5 cr' },
  { label: 'Bônus cadastro (novos usuários)',     cost: '+10 cr' },
];

export default function CreditosPage() {
  const { user } = useAuth();
  const [wallet, setWallet]       = useState(null);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [buying, setBuying]       = useState(null);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);
  const [tab, setTab]             = useState('planos'); // 'planos' | 'avulso'

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
            const leg = await getDoc(doc(db, 'users', user.uid));
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

  async function handleSubscribe(planId) {
    if (!planId) return;
    setBuying(planId);
    setError(null);
    try {
      const result = await httpsCallable(functions, 'createSubscription')({
        planId,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
      });
      if (result.data && result.data.url) {
        window.location.href = result.data.url;
      } else {
        setError('Não foi possível iniciar a assinatura. Tente novamente.');
      }
    } catch (e) {
      setError(e.message || 'Erro ao processar assinatura.');
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

  const saldo = wallet?.plano === 'ilimitado' || wallet?.plano === 'institucional'
    ? '∞'
    : (wallet?.saldo ?? 0);

  const planoAtual = PLANS.find(p => p.id === wallet?.plano) || PLANS[0];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 16px', fontFamily: "'Inter', sans-serif" }}>

      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Créditos & Planos</h1>
        <p style={{ color: '#64748b', marginBottom: 24 }}>Dado público grátis · Inteligência forense por crédito</p>

        {/* Saldo + plano atual */}
        <div style={{ display: 'inline-flex', gap: 16, alignItems: 'center', background: 'linear-gradient(135deg,#1B5E3B,#22c55e)', color: '#fff', borderRadius: 16, padding: '20px 40px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{loading ? '...' : saldo}</div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>créditos disponíveis</div>
          </div>
          <div style={{ width: 1, height: 48, background: 'rgba(255,255,255,0.3)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 2 }}>{planoAtual.icon}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Plano {planoAtual.name}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{planoAtual.creditsLabel}</div>
          </div>
        </div>
      </div>

      {/* ALERTAS */}
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

      {/* TABS */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f1f5f9', borderRadius: 10, padding: 4, maxWidth: 360, margin: '0 auto 28px' }}>
        {[{ key: 'planos', label: '📋 Planos mensais' }, { key: 'avulso', label: '⚡ Créditos avulsos' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t.key ? '#fff' : 'transparent',
            color: tab === t.key ? '#1e293b' : '#64748b',
            boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* PLANOS MENSAIS */}
      {tab === 'planos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 40 }}>
          {PLANS.map(plan => {
            const isAtual = wallet?.plano === plan.id;
            return (
              <div key={plan.id} style={{
                border: plan.popular ? `2px solid ${plan.color}` : isAtual ? `2px solid ${plan.color}` : '1.5px solid #e2e8f0',
                borderRadius: 14, padding: 20, background: '#fff', position: 'relative',
                boxShadow: plan.popular ? `0 4px 20px ${plan.color}33` : '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    MAIS POPULAR
                  </div>
                )}
                {isAtual && !plan.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    PLANO ATUAL
                  </div>
                )}
                <div style={{ fontSize: 28, marginBottom: 8 }}>{plan.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 2px' }}>{plan.name}</h3>
                <div style={{ fontSize: 22, fontWeight: 800, color: plan.color, margin: '8px 0 2px' }}>{plan.price}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>{plan.priceDetail}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: plan.color, marginBottom: 14, background: plan.color + '15', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>
                  {plan.creditsLabel}
                </div>
                <ul style={{ paddingLeft: 16, margin: '0 0 16px', color: '#475569', fontSize: 12, lineHeight: 1.9 }}>
                  {plan.features.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                {plan.ctaLink ? (
                  <a href={plan.ctaLink} style={{ display: 'block', width: '100%', padding: '10px 0', borderRadius: 8, textAlign: 'center', background: plan.color, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxSizing: 'border-box' }}>
                    {plan.cta}
                  </a>
                ) : plan.id === 'free' ? (
                  <button disabled style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#e2e8f0', color: '#94a3b8', fontWeight: 700, fontSize: 14, cursor: 'default' }}>
                    {isAtual ? 'Plano atual' : plan.cta}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(plan.stripeProductId)}
                    disabled={buying !== null || isAtual}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', cursor: (buying || isAtual) ? 'default' : 'pointer', background: isAtual ? '#e2e8f0' : buying === plan.stripeProductId ? '#9ca3af' : plan.color, color: isAtual ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: 14 }}
                  >
                    {isAtual ? 'Plano atual' : buying === plan.stripeProductId ? 'Redirecionando...' : plan.cta}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CRÉDITOS AVULSOS */}
      {tab === 'avulso' && (
        <>
          <p style={{ textAlign: 'center', color: '#64748b', marginBottom: 20, fontSize: 14 }}>
            Sem assinatura — pague uma vez e use quando quiser.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
            {PACKAGES.map(pkg => (
              <div key={pkg.id} style={{ border: pkg.popular ? `2px solid ${pkg.color}` : '1.5px solid #e2e8f0', borderRadius: 12, padding: 20, background: '#fff', position: 'relative', boxShadow: pkg.popular ? `0 4px 20px ${pkg.color}33` : '0 1px 4px rgba(0,0,0,0.06)' }}>
                {pkg.popular && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: pkg.color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>
                    MAIS POPULAR
                  </div>
                )}
                <div style={{ fontSize: 30, marginBottom: 8 }}>{pkg.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>{pkg.name}</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px', minHeight: 32 }}>{pkg.descricao}</p>
                <div style={{ fontSize: 22, fontWeight: 800, color: pkg.color, marginBottom: 2 }}>{pkg.price}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 14 }}>{pkg.perCredit}</div>
                <button
                  onClick={() => handleBuy(pkg.id)}
                  disabled={buying !== null}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 8, border: 'none', cursor: buying ? 'wait' : 'pointer', background: buying === pkg.id ? '#9ca3af' : pkg.color, color: '#fff', fontWeight: 700, fontSize: 15 }}
                >
                  {buying === pkg.id ? 'Redirecionando...' : `Comprar ${pkg.credits.toLocaleString('pt-BR')} cr`}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* HISTÓRICO */}
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>Histórico de Transações</h2>
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Carregando...</p>
      ) : historico.length === 0 ? (
        <p style={{ color: '#94a3b8', marginBottom: 32 }}>Nenhuma transação registrada ainda.</p>
      ) : (
        <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 32 }}>
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

      {/* TABELA DE CUSTOS */}
      <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <strong style={{ color: '#1e293b', fontSize: 15 }}>💡 Tabela de créditos por funcionalidade</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 6, marginTop: 14 }}>
          {CREDIT_COST.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: 13, color: '#475569' }}>{item.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: item.cost === 'Grátis' ? '#22c55e' : item.cost.startsWith('+') ? '#3b82f6' : '#1e293b', marginLeft: 12, whiteSpace: 'nowrap' }}>{item.cost}</span>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: '#94a3b8' }}>Pagamento seguro via Stripe · Cancele quando quiser · Créditos não expiram</p>
      </div>

    </div>
  );
}
