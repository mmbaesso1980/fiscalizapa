import React from 'react';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtPct(v) { return `${toNum(v).toFixed(1).replace('.', ',')}%`; }
function fmtNum(v) { return new Intl.NumberFormat('pt-BR').format(toNum(v)); }

const BADGE_STYLES = {
  Excelente: { background: '#d1fae5', color: '#047857', border: '1px solid #a7f3d0' },
  Bom: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' },
  Regular: { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' },
  Ruim: { background: '#ffe4e6', color: '#be123c', border: '1px solid #fecdd3' },
};

const BAR_COLORS = ['#059669', '#0284c7', '#4f46e5'];

function GaugeBar({ pct, label, colorIdx }) {
  const color = BAR_COLORS[colorIdx] || BAR_COLORS[0];
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
        <span style={{ fontWeight: 500, color: '#334155' }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{fmtPct(pct)}</span>
      </div>
      <div style={{ height: 12, width: '100%', borderRadius: 9999, background: '#f1f5f9', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 9999, background: color, width: `${Math.min(toNum(pct), 100)}%`, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

function StatCard({ value, label, color, href }) {
  const cardStyle = {
    borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 16,
    textAlign: 'center', flex: '1 1 0', minWidth: 120,
    cursor: href ? 'pointer' : 'default',
    transition: 'all 0.2s',
    textDecoration: 'none',
  };
  const Tag = href ? 'a' : 'div';
  const extraProps = href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {};
  return (
    <Tag {...extraProps} style={cardStyle}
      onMouseEnter={e => { if (href) { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; e.currentTarget.style.borderColor = '#94a3b8'; } }}
      onMouseLeave={e => { if (href) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; } }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
      {href && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>Clique para detalhes \u2192</div>}
    </Tag>
  );
}

export default function PresencaSection({ politico, colecao, politicoId }) {
  const pol = politico || {};
  const id = politicoId || pol.id || '';

  const overallPct = toNum(pol.presencaPct);
  const plenarioPct = toNum(pol.presencaPlenarioPct);
  const comissoesPct = toNum(pol.presencaComissoesPct);
  const classificacao = pol.presencaClassificacao || '';
  const sessoesPresente = toNum(pol.sessoesPresente);
  const sessoesTotal = toNum(pol.sessoesTotal || pol.totalSessions);
  const totalEventos = toNum(pol.totalEventos);
  const totalProposicoes = toNum(pol.totalProposicoes);
  const hasData = overallPct > 0 || sessoesPresente > 0 || sessoesTotal > 0;

  const year = new Date().getFullYear();
  const camaraBase = `https://www.camara.leg.br/deputados/${id}`;
  const linkSessoes = id ? `${camaraBase}/presenca-plenario/${year}` : null;
  const linkEventos = id ? `${camaraBase}/agenda` : null;
  const linkProposicoes = id ? `https://www.camara.leg.br/busca-portal?contextoBusca=BuscaProposicoes&pagina=1&order=data&abaEspecifica=true&q=autores.ideCadastro:%20${id}` : null;

  const sectionStyle = { borderRadius: 24, border: '1px solid #e2e8f0', background: '#f8fafc', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };

  if (!hasData) {
    return (
      <section style={sectionStyle}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Presenca parlamentar</h2>
        <div style={{ marginTop: 16, borderRadius: 16, border: '2px dashed #cbd5e1', background: '#fff', padding: 24, fontSize: 14, color: '#64748b' }}>
          Ainda nao ha dados de presenca disponiveis para este parlamentar.
        </div>
      </section>
    );
  }

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Presenca parlamentar no mandato</h2>
          <p style={{ marginTop: 8, fontSize: 14, color: '#475569', lineHeight: 1.6 }}>Dados consolidados de presenca em plenario, comissoes e atividade legislativa.</p>
        </div>
        {classificacao && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...(BADGE_STYLES[classificacao] || { background: '#f1f5f9', color: '#475569' }), borderRadius: 9999, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>{classificacao}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#0f172a' }}>{fmtPct(overallPct)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>presenca geral</div>
            </div>
          </div>
        )}
      </div>

      {hasData && (
        <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 16, marginBottom: 24 }}>
          {overallPct > 0 && <GaugeBar pct={overallPct} label="Presenca Geral" colorIdx={0} />}
          {plenarioPct > 0 && <GaugeBar pct={plenarioPct} label="Plenario" colorIdx={1} />}
          {comissoesPct > 0 && <GaugeBar pct={comissoesPct} label="Comissoes" colorIdx={2} />}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {sessoesPresente > 0 && <StatCard value={fmtNum(sessoesPresente)} label="Sessoes presente" color="#059669" href={linkSessoes} />}
        {sessoesTotal > 0 && <StatCard value={fmtNum(sessoesTotal)} label="Total sessoes" color="#334155" href={linkSessoes} />}
        {totalEventos > 0 && <StatCard value={fmtNum(totalEventos)} label="Eventos" color="#0284c7" href={linkEventos} />}
        {totalProposicoes > 0 && <StatCard value={fmtNum(totalProposicoes)} label="Proposicoes" color="#4f46e5" href={linkProposicoes} />}
      </div>

      <p style={{ marginTop: 0, fontSize: 12, color: '#94a3b8' }}>Fonte: Dados publicos da Camara dos Deputados. Atualizado automaticamente.</p>
    </section>
  );
}
