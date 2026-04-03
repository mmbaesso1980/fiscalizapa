import React from 'react';

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'string') {
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtPct(v) {
  return `${toNum(v).toFixed(1).replace('.', ',')}%`;
}

function fmtNum(v) {
  return new Intl.NumberFormat('pt-BR').format(toNum(v));
}

const BADGE_STYLES = {
  Excelente: {
    background: '#d1fae5',
    color: '#047857',
    border: '1px solid #a7f3d0'
  },
  Bom: {
    background: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #bae6fd'
  },
  Regular: {
    background: '#fef3c7',
    color: '#b45309',
    border: '1px solid #fde68a'
  },
  Ruim: {
    background: '#ffe4e6',
    color: '#be123c',
    border: '1px solid #fecdd3'
  }
};

const BAR_COLORS = ['#059669', '#0284c7', '#4f46e5'];

function GaugeBar({ pct, label, colorIdx }) {
  const color = BAR_COLORS[colorIdx] || BAR_COLORS[0];

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6,
          fontSize: 13,
          color: 'var(--text-secondary)'
        }}
      >
        <span>{label}</span>
        <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(pct)}</strong>
      </div>

      <div
        style={{
          width: '100%',
          height: 10,
          background: '#e5e7eb',
          borderRadius: 999,
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
            transition: 'width 0.4s ease'
          }}
        />
      </div>
    </div>
  );
}

function StatCard({ value, label, color, href }) {
  const cardStyle = {
    borderRadius: 16,
    border: '1px solid #e2e8f0',
    background: '#fff',
    padding: 16,
    textAlign: 'center',
    flex: '1 1 0',
    minWidth: 120,
    cursor: href ? 'pointer' : 'default',
    transition: 'all 0.2s',
    textDecoration: 'none'
  };

  const Tag = href ? 'a' : 'div';
  const extraProps = href
    ? { href, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Tag
      {...extraProps}
      style={cardStyle}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
          e.currentTarget.style.borderColor = '#94a3b8';
        }
      }}
      onMouseLeave={(e) => {
        if (href) {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.borderColor = '#e2e8f0';
        }
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--text-primary)' }}>
        {value}
      </div>

      <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
        {label}
      </div>

      {href && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent-green)' }}>
          Clique para detalhes ↗
        </div>
      )}
    </Tag>
  );
}

export default function PresencaSection({ politico, colecao, politicoId }) {
  const pol = politico || {};
  const id = politicoId || pol.id || '';

  const overallPct = toNum(
    pol.presencaPct ?? pol.presenca ?? pol.presenca_geral_pct
  );
  const plenarioPct = toNum(
    pol.presencaPlenarioPct ?? pol.presenca_plenario_pct
  );
  const comissoesPct = toNum(
    pol.presencaComissoesPct ?? pol.presenca_comissoes_pct
  );
  const classificacao =
    pol.presencaClassificacao || pol.presenca_classificacao || '';

  const sessoesPresente = toNum(
    pol.sessoesPresente ?? pol.presencas ?? pol.total_presencas
  );
  const sessoesTotal = toNum(
    pol.sessoesTotal ?? pol.totalSessions ?? pol.total_sessoes
  );
  const totalEventos = toNum(pol.totalEventos ?? pol.total_eventos);
  const totalProposicoes = toNum(pol.totalProposicoes ?? pol.total_proposicoes);

  const hasData =
    overallPct > 0 ||
    plenarioPct > 0 ||
    comissoesPct > 0 ||
    sessoesPresente > 0 ||
    sessoesTotal > 0;

  const year = new Date().getFullYear();
  const camaraBase = `https://www.camara.leg.br/deputados/${id}`;
  const linkSessoes = id ? `${camaraBase}/presenca-plenario/${year}` : null;
  const linkEventos = id ? `${camaraBase}/agenda` : null;
  const linkProposicoes = id
    ? `https://www.camara.leg.br/busca-portal?contextoBusca=BuscaProposicoes&pagina=1&order=data&abaEspecifica=true&q=autores.ideCadastro:%20${id}`
    : null;

  const sectionStyle = {
    borderRadius: 24,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    padding: 24,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
  };

  if (!hasData) {
    return (
      <div style={sectionStyle}>
        <h3 style={{ margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
          Presença parlamentar
        </h3>

        <p style={{ margin: 0, color: 'var(--text-muted)', marginBottom: 12 }}>
          Ainda não há dados consolidados de presença disponíveis no documento principal deste parlamentar.
        </p>

        {linkSessoes && (
          <a
            href={linkSessoes}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-green)',
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            Ver presença oficial na Câmara ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <h3 style={{ margin: 0, marginBottom: 8, color: 'var(--text-primary)' }}>
        Presença parlamentar no mandato
      </h3>

      <p style={{ marginTop: 0, marginBottom: 18, color: 'var(--text-secondary)' }}>
        Dados consolidados de presença em plenário, comissões e atividade legislativa.
      </p>

      {classificacao && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 999,
            marginBottom: 18,
            fontSize: 13,
            fontWeight: 700,
            ...(BADGE_STYLES[classificacao] || {
              background: '#eef2ff',
              color: '#3730a3',
              border: '1px solid #c7d2fe'
            })
          }}
        >
          <span>{classificacao}</span>
          <span>•</span>
          <span>{fmtPct(overallPct)}</span>
        </div>
      )}

      {(overallPct > 0 || plenarioPct > 0 || comissoesPct > 0) && (
        <div style={{ marginBottom: 18 }}>
          {overallPct > 0 && <GaugeBar pct={overallPct} label="Presença geral" colorIdx={0} />}
          {plenarioPct > 0 && <GaugeBar pct={plenarioPct} label="Plenário" colorIdx={1} />}
          {comissoesPct > 0 && <GaugeBar pct={comissoesPct} label="Comissões" colorIdx={2} />}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 18
        }}
      >
        {sessoesPresente > 0 && (
          <StatCard
            value={fmtNum(sessoesPresente)}
            label="Sessões com presença"
            color="#059669"
            href={linkSessoes}
          />
        )}

        {sessoesTotal > 0 && (
          <StatCard
            value={fmtNum(sessoesTotal)}
            label="Sessões monitoradas"
            color="#0284c7"
            href={linkSessoes}
          />
        )}

        {totalEventos > 0 && (
          <StatCard
            value={fmtNum(totalEventos)}
            label="Eventos/atividades"
            color="#7c3aed"
            href={linkEventos}
          />
        )}

        {totalProposicoes > 0 && (
          <StatCard
            value={fmtNum(totalProposicoes)}
            label="Proposições"
            color="#ea580c"
            href={linkProposicoes}
          />
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {linkSessoes && (
          <a
            href={linkSessoes}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-green)',
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            Presença oficial ↗
          </a>
        )}

        {linkEventos && (
          <a
            href={linkEventos}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-green)',
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            Agenda ↗
          </a>
        )}

        {linkProposicoes && (
          <a
            href={linkProposicoes}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-green)',
              fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            Buscar proposições ↗
          </a>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
        Fonte: dados públicos da Câmara dos Deputados. Atualizado automaticamente.
      </div>
    </div>
  );
}
