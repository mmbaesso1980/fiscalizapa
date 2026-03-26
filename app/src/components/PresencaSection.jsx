import { useState, useMemo } from 'react';

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
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fontSize: '18px',
          fontWeight: 'bold', fill: color, fontFamily: 'Space Grotesk' }}>
        {value}%
      </text>
    </svg>
  );
};

export default function PresencaSection({ deputadoId, colecao, presenca: propPresenca, totalSessoes: propTotal, sessoesPresente: propPresente, presencaAnual: propAnual }) {
  const [showDetalhes, setShowDetalhes] = useState(false);

  const data = useMemo(() => {
    const p = typeof propPresenca === 'number' ? propPresenca : 0;
    const t = propTotal || 0;
    const s = propPresente || 0;
    const a = Math.max(0, t - s);
    return {
      presenca: Math.min(p, 100),
      totalSessoes: t,
      sessoesPresente: s,
      sessoesAusente: a,
      anual: propAnual || null
    };
  }, [propPresenca, propTotal, propPresente, propAnual]);

  if (!data.totalSessoes && !data.presenca) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Dados de presença não disponíveis para este político.
      </div>
    );
  }

  const status = data.presenca >= 75 ? 'Presente' : data.presenca >= 50 ? 'Abaixo da média' : 'Crítico';
  const statusColor = data.presenca >= 75 ? 'var(--accent-green)' : data.presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
  const comparison = (data.presenca - GOAL_PRESENCA).toFixed(1);

  const custoMedioDiario = 120000;
  const custoAusencias = data.sessoesAusente * custoMedioDiario;

  const statCards = [
    { label: 'Sessões Plenárias (Total)', value: data.totalSessoes, color: 'var(--text-primary)', bg: 'var(--bg-secondary)' },
    { label: 'Presente', value: data.sessoesPresente, color: 'var(--accent-green)', bg: 'rgba(61,107,94,0.08)' },
    { label: 'Ausente', value: data.sessoesAusente, color: 'var(--accent-red)', bg: 'rgba(233,69,96,0.08)' },
    { label: `vs Meta (${GOAL_PRESENCA}%)`, value: `${comparison >= 0 ? '+' : ''}${comparison}%`, color: comparison >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', bg: 'var(--bg-secondary)' },
  ];

  return (
    <div>
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Presença nas Sessões</h3>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
        <CircularProgress value={data.presenca} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', flex: 1 }}>
          {statCards.map((card, i) => (
            <div key={i} style={{ padding: '12px', background: card.bg, borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{card.label}</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Índice de Presença</span>
        <span style={{ fontWeight: 700, color: statusColor }}>{data.presenca}%</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: statusColor, color: '#fff' }}>{status}</span>
      </div>

      {data.sessoesAusente > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(233,69,96,0.06)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '4px' }}>Custo estimado das ausências para o contribuinte</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {data.sessoesAusente} sessões ausente x R$ 120.000/dia (custo médio parlamentar) = <strong style={{ color: 'var(--accent-red)' }}>R$ {custoAusencias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Inclui salário, gabinete, assessores, cota parlamentar proporcional. Fonte: Transparência Câmara.</div>
        </div>
      )}

      {data.anual && Object.keys(data.anual).length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Detalhamento por Ano</h4>
            <button onClick={() => setShowDetalhes(!showDetalhes)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border-light)', background: showDetalhes ? 'var(--accent-green)' : 'var(--bg-secondary)', color: showDetalhes ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {showDetalhes ? 'Ocultar' : 'Ver detalhes'}
            </button>
          </div>
          {showDetalhes && (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {Object.keys(data.anual).sort().map((ano, i) => {
                const d = data.anual[ano];
                return (
                  <div key={ano} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: i % 2 === 0 ? 'var(--bg-secondary)' : 'transparent', borderRadius: '4px', marginBottom: '2px' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{ano}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{d.presentes || 0}/{d.total || 0} sessões</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: (d.pct || 0) >= 75 ? 'var(--accent-green)' : (d.pct || 0) >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>{(d.pct || 0).toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '12px' }}>Fonte: API Dados Abertos da Câmara dos Deputados. Presença = sessões deliberativas presentes / total sessões deliberativas do período.</div>
    </div>
  );
}
