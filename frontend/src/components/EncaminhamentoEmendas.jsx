import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

function fmt(v) {
  if (!v) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

const FASE_COLORS = {
  'Empenho': '#4ecdc4',
  'Liquidacao': '#45b7d1',
  'Pagamento': '#96ceb4',
  'Restos a Pagar': '#ffeaa7',
};

export default function EncaminhamentoEmendas({ politicoId, nomeAutor }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [expandido, setExpandido] = useState(false);
  const [anoFiltro, setAnoFiltro] = useState('');

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const functions = getFunctions(undefined, 'southamerica-east1');
      const fn = httpsCallable(functions, 'getEmendasEncaminhamento');
      const result = await fn({ politicoId, nomeAutor, ano: anoFiltro || null, limit: 100 });
      setDados(result.data);
    } catch (e) {
      setErro(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (politicoId || nomeAutor) carregar();
  }, [politicoId, nomeAutor]);

  if (!politicoId && !nomeAutor) return null;

  const containerStyle = {
    background: 'var(--bg-card, #1a1a2e)',
    borderRadius: 12,
    padding: '24px',
    marginBottom: 24,
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    fontSize: '1.2rem',
    fontWeight: 700,
    color: 'var(--text-primary, #fff)',
  };

  if (loading) return (
    <div style={containerStyle}>
      <div style={headerStyle}>Encaminhamento das Emendas</div>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>
        Carregando dados de encaminhamento...
      </div>
    </div>
  );

  if (erro) return (
    <div style={containerStyle}>
      <div style={headerStyle}>Encaminhamento das Emendas</div>
      <div style={{ padding: 20, color: 'var(--accent-red, #e94560)', background: 'rgba(233,69,96,0.1)', borderRadius: 8 }}>
        Dados de encaminhamento ainda nao disponiveis. Os CSVs do Portal da Transparencia precisam ser importados.
      </div>
    </div>
  );

  if (!dados || !dados.documentos || dados.documentos.length === 0) return (
    <div style={containerStyle}>
      <div style={headerStyle}>Encaminhamento das Emendas</div>
      <div style={{ padding: 20, color: 'var(--text-secondary)', textAlign: 'center' }}>
        Nenhum documento de encaminhamento encontrado para este parlamentar.
        <br/>
        <a href={'https://portaldatransparencia.gov.br/emendas/consulta?autor=' + encodeURIComponent(nomeAutor || '')}
           target="_blank" rel="noopener noreferrer"
           style={{ color: 'var(--accent-green)', marginTop: 8, display: 'inline-block' }}>
          Consultar no Portal da Transparencia
        </a>
      </div>
    </div>
  );

  const r = dados.resumo || {};
  const fases = dados.fases || [];
  const docs = dados.documentos || [];
  const maxFaseVal = Math.max(...fases.map(f => Number(f.valor) || 0), 1);

  return (
    <div style={containerStyle} id="encaminhamento">
      <div style={headerStyle}>
        <span>Encaminhamento das Emendas</span>
        <span style={{ fontSize: '0.75rem', background: 'var(--accent-green)', color: '#000', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
          {r.total || docs.length} registros
        </span>
      </div>

      {/* RESUMO CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Emendas Unicas', value: r.emendas_unicas || 0 },
          { label: 'Empenhado', value: fmt(r.total_empenhado) },
          { label: 'Liquidado', value: fmt(r.total_liquidado) },
          { label: 'Pago', value: fmt(r.total_pago) },
          { label: 'Favorecidos', value: r.favorecidos || 0 },
          { label: 'Fases', value: r.fases_distintas || 0 },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated, #16213e)', borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-green, #4ecdc4)' }}>{c.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* FASES - PIPELINE */}
      {fases.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: 10, fontSize: '0.95rem' }}>Pipeline de Execucao</h4>
          {fases.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
                {f.fase_despesa || 'N/A'}
              </span>
              <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 4, height: 24, overflow: 'hidden' }}>
                <div style={{
                  width: ((Number(f.valor) || 0) / maxFaseVal * 100) + '%',
                  height: '100%',
                  background: FASE_COLORS[f.fase_despesa] || '#4ecdc4',
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                  minWidth: 2,
                }} />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', minWidth: 100, textAlign: 'right' }}>
                {fmt(f.valor)} ({f.qtd})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* DOCUMENTOS TABLE */}
      <div style={{ marginBottom: 10 }}>
        <h4 style={{ color: 'var(--text-primary)', marginBottom: 10, fontSize: '0.95rem' }}>Detalhamento dos Documentos</h4>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)' }}>Emenda</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)' }}>Tipo</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)' }}>Favorecido</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--text-secondary)' }}>Fase</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-secondary)' }}>Empenhado</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--text-secondary)' }}>Pago</th>
            </tr>
          </thead>
          <tbody>
            {(expandido ? docs : docs.slice(0, 15)).map((d, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px 6px', color: 'var(--text-primary)' }}>{d.codigo_emenda}</td>
                <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{d.tipo_emenda}</td>
                <td style={{ padding: '8px 6px', color: 'var(--text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome_favorecido}</td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{ background: FASE_COLORS[d.fase_despesa] || 'rgba(78,205,196,0.2)', color: '#fff', padding: '2px 6px', borderRadius: 4, fontSize: '0.7rem' }}>
                    {d.fase_despesa || 'N/A'}
                  </span>
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--accent-gold, #ffd700)' }}>{fmt(d.valor_empenhado)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--accent-green)' }}>{fmt(d.valor_pago)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {docs.length > 15 && !expandido && (
        <button onClick={() => setExpandido(true)} style={{
          width: '100%', padding: 12, marginTop: 10, border: '1px solid var(--accent-green)',
          borderRadius: 8, background: 'transparent', color: 'var(--accent-green)',
          cursor: 'pointer', fontWeight: 600
        }}>
          Ver todos os {docs.length} documentos
        </button>
      )}

      {/* CONVENIOS */}
      {docs.some(d => d.numero_convenio) && (
        <div style={{ marginTop: 20 }}>
          <h4 style={{ color: 'var(--text-primary)', marginBottom: 10, fontSize: '0.95rem' }}>Convenios Vinculados</h4>
          {docs.filter(d => d.numero_convenio).slice(0, 10).map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 6, marginBottom: 4 }}>
              <div>
                <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>Conv. {d.numero_convenio}</span>
                <span style={{ color: 'var(--text-secondary)', marginLeft: 10, fontSize: '0.8rem' }}>{d.nome_programa_convenio}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{d.situacao_convenio}</span>
                <span style={{ color: 'var(--accent-gold)', marginLeft: 10 }}>{fmt(d.valor_repasse_convenio)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
