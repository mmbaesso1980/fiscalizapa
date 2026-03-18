import { useState, useEffect } from "react";

export default function ProjetosSection({ deputadoId, colecao }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deputadoId || colecao !== 'deputados_federais') {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      try {
        const url = `https://dadosabertos.camara.leg.br/api/v2/proposicoes?idDeputadoAutor=${deputadoId}&ordem=DESC&ordenarPor=id&itens=30`;
        const res = await fetch(url);
        const data = await res.json();
        setProjetos(data.dados || []);
      } catch (err) {
        console.error('Erro ao buscar proposicoes:', err);
      }
      setLoading(false);
    }
    load();
  }, [deputadoId, colecao]);

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Carregando proposicoes...
    </div>
  );

  if (projetos.length === 0) return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Nenhuma proposicao encontrada para este politico.
    </div>
  );

  const tipoColors = { PL: '#4caf50', PEC: '#e53935', PLP: '#ff9800', PDL: '#2196f3', REQ: '#9e9e9e' };

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '24px', border: '1px solid var(--border-light)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
        Proposicoes Legislativas
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        {projetos.length} proposicoes encontradas (autor principal)
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {projetos.map(p => (
          <a key={p.id} href={p.uri ? `https://www.camara.leg.br/propostas-legislativas/${p.id}` : '#'}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, background: (tipoColors[p.siglaTipo] || '#666') + '20', color: tipoColors[p.siglaTipo] || '#666' }}>
                  {p.siglaTipo} {p.numero}/{p.ano}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.ementa || 'Sem ementa'}
              </p>
            </div>
            <span style={{ fontSize: '20px', marginLeft: '12px', color: 'var(--text-muted)' }}>&#8250;</span>
          </a>
        ))}
      </div>
    </div>
  );
}
