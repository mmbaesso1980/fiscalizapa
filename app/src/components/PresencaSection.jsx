import { useMemo } from 'react';

const GOAL_PRESENCA = 75;

const CircularProgress = ({ value, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 75 ? 'var(--accent-green)' : value >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--bg-secondary)" strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: '18px', fontWeight: 'bold', fill: color, fontFamily: 'Space Grotesk' }}
      >
        {value}%
      </text>
    </svg>
  );
};

const PresencaSection = ({ presenca = 0, totalSessoes = 0, sessoesPresente = 0 }) => {
  const data = useMemo(() => {
    const absentSessions = totalSessoes - sessoesPresente;
    const status = presenca >= 75 ? 'Acima da media' : presenca >= 50 ? 'Abaixo da media' : 'Critico';
    const statusColor = presenca >= 75 ? 'var(--accent-green)' : presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
    const comparison = presenca - GOAL_PRESENCA;
    return { presenca, totalSessoes, sessoesPresente, absentSessions, status, statusColor, comparison };
  }, [presenca, totalSessoes, sessoesPresente]);

  if (!totalSessoes && !presenca) {
    return (
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
        padding: '40px', textAlign: 'center', color: 'var(--text-muted)'
      }}>
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
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
      padding: '24px', border: '1px solid var(--border-light)'
    }}>
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
            <div key={i} style={{
              background: card.bg, borderRadius: 'var(--radius-sm)', padding: '14px'
            }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{card.label}</p>
              <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Space Grotesk', color: card.color }}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          <span>Indice de Presenca</span>
          <span style={{ fontWeight: 600 }}>{data.presenca}%</span>
        </div>
        <div style={{ height: '10px', background: 'var(--bg-secondary)', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '5px', transition: 'width 0.7s ease',
            width: `${data.presenca}%`, background: barColor
          }} />
        </div>
        <div style={{ marginTop: '4px', textAlign: 'right' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Meta: {GOAL_PRESENCA}%</span>
        </div>
      </div>
    </div>
  );
};

export default PresencaSection;
