import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

const GRAU_LABELS = {
  conjuge: "Conjuge",
  filho: "Filho(a)",
  irmao: "Irmao/Irma",
  pai: "Pai",
  mae: "Mae",
  sobrinho: "Sobrinho(a)",
  primo: "Primo(a)",
  cunhado: "Cunhado(a)",
  genro: "Genro/Nora",
  outro: "Outro",
};

export default function NepotismoCard({ deputadoId, colecao }) {
  const [parentes, setParentes] = useState([]);
  const [relacoes, setRelacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(null);

  useEffect(() => {
    if (!deputadoId || !colecao) return;
    async function load() {
      setLoading(true);
      try {
        // Read from new collections only
        const pSnap = await getDocs(collection(db, "relacoes_pessoa_parlamentar"));
        const allRel = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const myRel = allRel.filter(r => r.parlamentarId === deputadoId);
        setRelacoes(myRel);

        // Get parente details
        if (myRel.length > 0) {
          const parenteIds = [...new Set(myRel.map(r => r.parenteId).filter(Boolean))];
          const pDetSnap = await getDocs(collection(db, "pessoas_parente"));
          const allParentes = pDetSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const myParentes = allParentes.filter(p => parenteIds.includes(p.id));
          setParentes(myParentes);

          // Calculate simple score
          let s = 0;
          myParentes.forEach(p => {
            if (p.vinculosPublicos && p.vinculosPublicos.length > 0) s += 30;
            if (p.multiGabinete) s += 20;
            if (p.remuneracao > 20000) s += 15;
          });
          setScore(Math.min(s, 100));
        }
      } catch (err) {
        console.log("NepotismoCard: colecoes novas ainda nao disponiveis", err.message);
      }
      setLoading(false);
    }
    load();
  }, [deputadoId, colecao]);

  if (loading) {
    return (
      <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Analisando relacoes familiares...
      </div>
    );
  }

  if (relacoes.length === 0) {
    return (
      <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center', color: 'var(--text-muted)' }}>
        Nenhuma relacao familiar detectada nos dados disponiveis para este parlamentar.
      </div>
    );
  }

  const scoreBg = score >= 60 ? 'rgba(181,74,74,0.12)' : score >= 30 ? 'rgba(201,168,76,0.15)' : 'rgba(61,107,94,0.12)';
  const scoreColor = score >= 60 ? 'var(--accent-red)' : score >= 30 ? '#b8860b' : 'var(--accent-green)';
  const scoreLabel = score >= 60 ? 'Alto Risco' : score >= 30 ? 'Atencao' : 'Baixo Risco';

  return (
    <div>
      {/* Score card */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: scoreColor }}>{score}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>SCORE NEPOTISMO</div>
          <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '4px', background: scoreBg, color: scoreColor, fontSize: '11px', fontWeight: 600 }}>{scoreLabel}</span>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>{relacoes.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>PARENTES IDENTIFICADOS</div>
        </div>
        <div style={{ flex: 1, minWidth: '120px', padding: '14px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-orange)' }}>
            {parentes.filter(p => p.vinculosPublicos && p.vinculosPublicos.length > 0).length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>COM VINCULOS PUBLICOS</div>
        </div>
      </div>

      {/* Parentes list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {relacoes.map(rel => {
          const parente = parentes.find(p => p.id === rel.parenteId);
          const nome = parente?.nome || rel.nomeParente || 'Desconhecido';
          const grau = GRAU_LABELS[rel.grau] || rel.grau || 'Parente';
          const cargo = parente?.cargo || rel.cargo || '';
          const orgao = parente?.orgao || rel.orgao || '';
          const remuneracao = parente?.remuneracao || rel.remuneracao || 0;
          const vinculos = parente?.vinculosPublicos || [];
          const hasFlags = parente?.multiGabinete || vinculos.length > 0;

          return (
            <div key={rel.id} style={{
              padding: '14px 16px',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-light)',
              borderLeft: hasFlags ? '3px solid var(--accent-red)' : '1px solid var(--border-light)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                    {nome}
                    <span style={{ marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-secondary)', fontSize: '11px', color: 'var(--text-muted)' }}>{grau}</span>
                  </p>
                  {cargo && <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0' }}>{cargo}{orgao ? ` - ${orgao}` : ''}</p>}
                </div>
                {remuneracao > 0 && (
                  <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)', fontSize: '14px' }}>{fmt(remuneracao)}</span>
                )}
              </div>
              {vinculos.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {vinculos.map((v, i) => (
                    <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(181,74,74,0.1)', color: 'var(--accent-red)', fontSize: '11px' }}>
                      {v.tipo || v.orgao || 'Vinculo publico'}
                    </span>
                  ))}
                </div>
              )}
              {parente?.multiGabinete && (
                <span style={{ display: 'inline-block', marginTop: '6px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(233,69,96,0.1)', color: 'var(--accent-red)', fontSize: '11px', fontWeight: 600 }}>
                  Multi-gabinete detectado
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
