import { useMemo, useState } from 'react';

const GOAL_PRESENCA = 75;

const CircularProgress = ({ value, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 75 ? 'var(--accent-green)' : value >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--bg-secondary)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: '18px', fontWeight: 'bold', fill: color, fontFamily: 'Space Grotesk' }}>
        {value}%
      </text>
    </svg>
  );
};

const PresencaSection = ({ presenca = 0, totalSessoes = 0, sessoesPresente = 0, sessoes = [] }) => {
  const [showSessoes, setShowSessoes] = useState(false);
  const [filtroSessao, setFiltroSessao] = useState('todas');

  const data = useMemo(() => {
    const absentSessions = totalSessoes - sessoesPresente;
    const status = presenca >= 75 ? 'Acima da media' : presenca >= 50 ? 'Abaixo da media' : 'Critico';
    const statusColor = presenca >= 75 ? 'var(--accent-green)' : presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
    const comparison = presenca - GOAL_PRESENCA;
    return { presenca, totalSessoes, sessoesPresente, absentSessions, status, statusColor, comparison };
  }, [presenca, totalSessoes, sessoesPresente]);

  const sessoesFiltradas = useMemo(() => {
    if (!sessoes || sessoes.length === 0) return [];
    const sorted = [...sessoes].sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    if (filtroSessao === 'presentes') return sorted.filter(s => s.presente);
    if (filtroSessao === 'ausentes') return sorted.filter(s => !s.presente);
    return sorted;
  }, [sessoes, filtroSessao]);

  if (!totalSessoes && !presenca) {
    return (
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Dados de presenca em processamento.
      </div>
    );
  }

  const statCards = [
    { label: 'Total de Sessoes', value: data.totalSessoes, color: 'var(--text-primary)', bg: 'var(--bg-secondary)' },
    { label: 'Sessoes Presentes', value: data.sessoesPresente, color: 'var(--accent-green)', bg: 'rgba(61,107,94,0.08)' },
    { label: 'Sessoes Ausentes', value: data.absentSessions, color: 'var(--accent-red)', bg: 'rgba(181,74,74,0.08)' },
    { label: `vs Meta (${GOAL_PRESENCA}%)`, value: `${data.comparison >= 0 ? '+' : ''}${data.comparison}%`, color: data.comparison >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', bg: 'var(--bg-secondary)' },
  ];

  const barColor = data.presenca >= 75 ? 'var(--accent-green)' : data.presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '24px', border: '1px solid var(--border-light)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
        Presenca nas Sessoes
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress value={data.presenca} size={140} strokeWidth={12} />
          <p style={{ marginTop: '8px', fontWeight: 600, fontSize: '14px', color: data.statusColor }}>
            {data.status}
          </p>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', minWidth: '260px' }}>
          {statCards.map((card, i) => (
            <div key={i} style={{ background: card.bg, borderRadius: 'var(--radius-sm)', padding: '14px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{card.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Space Grotesk', color: card.color }}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          <span>Indice de Presenca</span>
          <span style={{ fontWeight: 600 }}>{data.presenca}%</span>
        </div>
        <div style={{ height: '10px', background: 'var(--bg-secondary)', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '5px', transition: 'width 0.7s ease', width: `${data.presenca}%`, background: barColor }} />
        </div>
        <div style={{ marginTop: '4px', textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Meta: {GOAL_PRESENCA}%</span>
        </div>
      </div>

      {/* Detalhamento de Sessoes */}
      <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Detalhamento das Sessoes
          </h4>
          <button
            onClick={() => setShowSessoes(!showSessoes)}
            style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border-light)', background: showSessoes ? 'var(--accent-green)' : 'var(--bg-secondary)', color: showSessoes ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
            {showSessoes ? 'Ocultar lista' : 'Ver todas as sessoes'}
          </button>
        </div>

        {sessoes.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Lista detalhada de sessoes nao disponivel. Os dados de presenca sao obtidos da API da Camara dos Deputados.
          </p>
        )}

        {showSessoes && sessoes.length > 0 && (
          <div>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {[{ k: 'todas', l: 'Todas' }, { k: 'presentes', l: 'Presentes' }, { k: 'ausentes', l: 'Ausentes' }].map(f => (
                <button key={f.k}
                  onClick={() => setFiltroSessao(f.k)}
                  style={{ padding: '4px 12px', borderRadius: '4px', fontSize: '12px', border: filtroSessao === f.k ? '1px solid var(--accent-green)' : '1px solid var(--border-light)', background: filtroSessao === f.k ? 'var(--accent-green)' : 'transparent', color: filtroSessao === f.k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
                  {f.l} ({f.k === 'todas' ? sessoes.length : f.k === 'presentes' ? data.sessoesPresente : data.absentSessions})
                </button>
              ))}
            </div>

            {/* Lista de sessoes */}
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {sessoesFiltradas.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-light)', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                      {s.descricao || s.tipo || `Sessao ${i + 1}`}
                    </span>
                    {s.data && (
                      <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                        {s.data.substring(0, 10)}
                      </span>
                    )}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: s.presente ? 'rgba(61,107,94,0.12)' : 'rgba(181,74,74,0.12)', color: s.presente ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {s.presente ? 'Presente' : s.justificativa || 'Ausente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PresencaSection;
