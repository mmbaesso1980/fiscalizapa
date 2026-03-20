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
        style={{ transform: 'rotate(90deg)', transformOrigin: `${size/2}px ${size/2}px`, fontSize: '18px',
        fontWeight: 'bold', fill: color, fontFamily: 'Space Grotesk' }}>
        {value}%
      </text>
    </svg>
  );
};

export default function PresencaSection({ deputadoId, colecao, presenca: propPresenca, totalSessoes: propTotal, sessoesPresente: propPresente }) {
  const [depEventos, setDepEventos] = useState([]);
  const [totalPlenarias, setTotalPlenarias] = useState(0);
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
        // 1. Buscar TODAS as sessoes plenarias da legislatura
        const hoje = new Date().toISOString().split('T')[0];
        const totalUrl = `https://dadosabertos.camara.leg.br/api/v2/eventos?dataInicio=2025-02-01&dataFim=${hoje}&itens=100&ordem=DESC&ordenarPor=dataHoraInicio`;
        let allPlenarias = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 20) {
          const tRes = await fetch(totalUrl + `&pagina=${page}`);
          const tJson = await tRes.json();
          const items = tJson.dados || [];
          // Filtrar apenas sessoes deliberativas/plenarias
          const sessoes = items.filter(e => {
            const desc = (e.descricaoTipo || '').toLowerCase();
            return desc.includes('sess') || desc.includes('plen') || desc.includes('deliber');
          });
          allPlenarias.push(...sessoes);
          hasMore = items.length === 100;
          page++;
        }

        // 2. Buscar eventos do deputado
        const depEvents = [];
        let pg = 1;
        let more = true;
        while (more && pg <= 10) {
          const dUrl = `https://dadosabertos.camara.leg.br/api/v2/deputados/${deputadoId}/eventos?dataInicio=2025-02-01&itens=100&pagina=${pg}&ordem=DESC&ordenarPor=dataHoraInicio`;
          const dRes = await fetch(dUrl);
          const dJson = await dRes.json();
          const dItems = dJson.dados || [];
          depEvents.push(...dItems);
          more = dItems.length === 100;
          pg++;
        }

        setTotalPlenarias(allPlenarias.length);
        setDepEventos(depEvents);
      } catch (err) {
        console.error('Erro ao carregar presenca:', err);
      }
      setLoading(false);
    }
    load();
  }, [deputadoId, colecao]);

  const data = useMemo(() => {
    if (totalPlenarias > 0) {
      // Filtrar eventos do deputado que sao plenarias
      const depPlenarias = depEventos.filter(e => {
        const desc = (e.descricaoTipo || '').toLowerCase();
        return desc.includes('sess') || desc.includes('plen') || desc.includes('deliber');
      });
      const presente = depPlenarias.length;
      const total = totalPlenarias;
      const ausente = Math.max(0, total - presente);
      const pct = total > 0 ? Math.round((presente / total) * 100) : 0;
      return {
        presenca: Math.min(pct, 100),
        totalSessoes: total,
        sessoesPresente: presente,
        sessoesAusente: ausente,
        totalEventos: depEventos.length,
        eventos: depPlenarias.length > 0 ? depPlenarias : depEventos
      };
    }
    const p = propPresenca || 0;
    const t = propTotal || 0;
    const s = propPresente || 0;
    return { presenca: p, totalSessoes: t, sessoesPresente: s, sessoesAusente: t - s, totalEventos: 0, eventos: [] };
  }, [depEventos, totalPlenarias, propPresenca, propTotal, propPresente]);

  const eventosToShow = useMemo(() => {
    return [...data.eventos].sort((a, b) => (b.dataHoraInicio || '').localeCompare(a.dataHoraInicio || ''));
  }, [data.eventos]);

  if (loading) {
    return (<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando dados de presenca...</div>);
  }

  if (!data.totalSessoes && !data.presenca) {
    return (<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Dados de presenca nao disponiveis para este politico.</div>);
  }

  const status = data.presenca >= 75 ? 'Presente' : data.presenca >= 50 ? 'Abaixo da media' : 'Critico';
  const statusColor = data.presenca >= 75 ? 'var(--accent-green)' : data.presenca >= 50 ? 'var(--accent-gold)' : 'var(--accent-red)';
  const comparison = data.presenca - GOAL_PRESENCA;

  // Estimar custo da ausencia
  const custoMedioDiario = 120000; // custo medio diario de um parlamentar para o contribuinte (~R$120k/dia)
  const custoAusencias = data.sessoesAusente * custoMedioDiario;

  const statCards = [
    { label: 'Sessoes Plenarias (Total)', value: data.totalSessoes, color: 'var(--text-primary)', bg: 'var(--bg-secondary)' },
    { label: 'Presente', value: data.sessoesPresente, color: 'var(--accent-green)', bg: 'rgba(61,107,94,0.08)' },
    { label: 'Ausente', value: data.sessoesAusente, color: 'var(--accent-red)', bg: 'rgba(233,69,96,0.08)' },
    { label: `vs Meta (${GOAL_PRESENCA}%)`, value: `${comparison >= 0 ? '+' : ''}${comparison}%`, color: comparison >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', bg: 'var(--bg-secondary)' },
  ];

  return (
    <div>
      <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Presenca nas Sessoes</h3>
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
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Indice de Presenca</span>
        <span style={{ fontWeight: 700, color: statusColor }}>{data.presenca}%</span>
        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: statusColor, color: '#fff' }}>{status}</span>
      </div>

      {data.sessoesAusente > 0 && (
        <div style={{ padding: '12px 16px', background: 'rgba(233,69,96,0.06)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-red)', marginBottom: '4px' }}>Custo estimado das ausencias para o contribuinte</div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {data.sessoesAusente} sessoes ausente x R$ 120.000/dia (custo medio parlamentar) = <strong style={{ color: 'var(--accent-red)' }}>R$ {custoAusencias.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>Inclui salario, gabinete, assessores, cota parlamentar proporcional. Fonte: Transparencia Camara.</div>
        </div>
      )}

      {eventosToShow.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Sessoes Registradas ({eventosToShow.length})</h4>
            <button onClick={() => setShowSessoes(!showSessoes)} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid var(--border-light)', background: showSessoes ? 'var(--accent-green)' : 'var(--bg-secondary)', color: showSessoes ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
              {showSessoes ? 'Ocultar' : 'Ver sessoes'}
            </button>
          </div>
          {showSessoes && (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {eventosToShow.slice(0, 50).map((ev, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: i % 2 === 0 ? 'var(--bg-secondary)' : 'transparent', borderRadius: '4px', marginBottom: '2px' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 500 }}>{ev.descricaoTipo || 'Evento'}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '8px' }}>{ev.dataHoraInicio ? ev.dataHoraInicio.substring(0, 10) : ''}</span>
                  </div>
                  <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(61,107,94,0.1)', color: 'var(--accent-green)' }}>{ev.situacao || 'Presente'}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px' }}>Fonte: API Dados Abertos da Camara dos Deputados. Presenca = sessoes do deputado / total sessoes plenarias.</div>
        </div>
      )}
    </div>
  );
}
