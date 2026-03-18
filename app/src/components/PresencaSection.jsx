import { useState, useEffect, useMemo } from 'react';

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

export default function PresencaSection({ deputadoId, colecao, presenca: propPresenca, totalSessoes: propTotal, sessoesPresente: propPresente }) {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSessoes, setShowSessoes] = useState(false);

  useEffect(() => {
    if (!deputadoId || colecao !== 'deputados_federais') {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const allEvents = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 10) {
          const url = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/eventos?dataInicio=2025-02-01&itens=100&pagina=${page}&ordem=DESC&ordenarPor=dataHoraInicio`;
          const res = await fetch(url);
          const json = await res.json();
          const items = json.dados || [];
          allEvents.push(...items);
          hasMore = items.length === 100;
          page++;
        }
        setEventos(allEvents);
      } catch (err) {
        console.error('Erro ao carregar eventos:', err);
      }
      setLoading(false);
    }
    load();
  }, [deputadoId, colecao]);

  const data = useMemo(() => {
    if (eventos.length > 0) {
      const plenarias = eventos.filter(e => {
        const desc = (e.descricaoTipo || '').toLowerCase();
        return desc.includes('sess') || desc.includes('plen');
      });
      const total = plenarias.length || eventos.length;
      return { presenca: 100, totalSessoes: total, sessoesPresente: total, totalEventos: eventos.length, eventos: plenarias.length > 0 ? plenarias : eventos };
    }
    const p = propPresenca || 0;
    const t = propTotal || 0;
    const s = propPresente || 0;
    return { presenca: p, totalSessoes: t, sessoesPresente: s, totalEventos: 0, eventos: [] };
  }, [eventos, propPresenca, propTotal, propPresente]);

  const eventosToShow = useMemo(() => {
    return [...data.eventos].sort((a, b) => (b.dataHoraInicio || '').localeCompare(a.dataHoraInicio || ''));
  }, [data.eventos]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Carregando dados de presenca...
      </div>
    );
  }

  if (!data.totalSessoes && !data.presenca) {
    return (
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Dados de presenca nao disponiveis para este politico.
      </div>
    );
  }

  const status = data.presenca >= 75 ? 'Acima da media' : data.presenca >= 50 ? 'Abaixo da media' : 'Critico';
  const statusColor = data.presenca >= 75 ? 'var(--accent-green)' : data.presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
  const comparison = data.presenca - GOAL_PRESENCA;

  const statCards = [
    { label: 'Sessoes Plenarias', value: data.totalSessoes, color: 'var(--text-primary)', bg: 'var(--bg-secondary)' },
    { label: 'Eventos Presentes', value: data.sessoesPresente, color: 'var(--accent-green)', bg: 'rgba(61,107,94,0.08)' },
    { label: 'Total Eventos', value: data.totalEventos, color: 'var(--accent-gold)', bg: 'rgba(201,168,76,0.08)' },
    { label: `vs Meta (${GOAL_PRESENCA}%)`, value: `${comparison >= 0 ? '+' : ''}${comparison}%`, color: comparison >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', bg: 'var(--bg-secondary)' },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '24px', border: '1px solid var(--border-light)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '20px' }}>
        Presenca nas Sessoes
      </h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CircularProgress value={data.presenca} size={140} strokeWidth={12} />
          <p style={{ marginTop: '8px', fontWeight: 600, fontSize: '14px', color: statusColor }}>{status}</p>
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
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
          <span>Indice de Presenca</span>
          <span style={{ fontWeight: 600 }}>{data.presenca}%</span>
        </div>
        <div style={{ height: '10px', background: 'var(--bg-secondary)', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '5px', transition: 'width 0.7s ease', width: `${data.presenca}%`, background: statusColor }} />
        </div>
      </div>
      {eventosToShow.length > 0 && (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Eventos e Sessoes ({eventosToShow.length})
            </h4>
            <button onClick={() => setShowSessoes(!showSessoes)}
              style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border-light)', background: showSessoes ? 'var(--accent-green)' : 'var(--bg-secondary)', color: showSessoes ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {showSessoes ? 'Ocultar' : 'Ver sessoes'}
            </button>
          </div>
          {showSessoes && (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {eventosToShow.slice(0, 50).map((ev, i) => (
                <div key={ev.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border-light)', fontSize: '13px' }}>
                  <div>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{ev.descricaoTipo || 'Evento'}</span>
                    <span style={{ marginLeft: '8px', color: 'var(--text-muted)', fontSize: '11px' }}>
                      {ev.dataHoraInicio ? ev.dataHoraInicio.substring(0, 10) : ''}
                    </span>
                    {ev.descricao && (
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {ev.descricao.length > 80 ? ev.descricao.substring(0, 80) + '...' : ev.descricao}
                      </p>
                    )}
                  </div>
                  <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'rgba(61,107,94,0.12)', color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>
                    {ev.situacao || 'Registrado'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Fonte: API Dados Abertos da Camara dos Deputados
          </p>
        </div>
      )}
    </div>
  );
}
