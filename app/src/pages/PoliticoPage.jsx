import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import GastosChart from "../components/GastosChart";
import PresencaSection from "../components/PresencaSection";
import AlertasFretamento from "../components/AlertasFretamento";
import ProjetosSection from "../components/ProjetosSection";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function riskBadge(score) {
  if (!score || score < 30) return { label: "Baixo risco", cls: "risk-badge-low" };
  if (score < 60) return { label: "Risco medio", cls: "risk-badge-medium" };
  return { label: "Alto risco", cls: "risk-badge-high" };
}

function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\* (.*)/gm, '<li>$1</li>')
    .replace(/---/g, '<hr/>')
    .replace(/\n/g, '<br/>');
}

function getVal(g) {
  return g.valorLiquido || g.valor || g.valorDocumento || 0;
}

function getTipo(g) {
  return g.tipoDespesa || g.tipo || g.descricao || g.categoria || "Outros";
}

function getFornecedor(g) {
  return g.fornecedorNome || g.nomeFornecedor || g.fornecedor || "Desconhecido";
}

function getCnpj(g) {
  return g.cnpjCpf || g.cnpjCpfFornecedor || g.cnpj || "";
}

export default function PoliticoPage({ user }) {
  const { colecao, id } = useParams();
  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [tab, setTab] = useState("gastos");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);

  const col = colecao || "deputados_federais";

  useEffect(() => {
    async function load() {
      setLoading(true);
      const snap = await getDoc(doc(db, col, id));
      if (snap.exists()) {
        setPol({ id: snap.id, ...snap.data() });
        if (snap.data().analise) setAnalysis(snap.data().analise);
      }
      const gSnap = await getDocs(collection(db, col, id, "gastos"));
      const gList = gSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      gList.sort((a, b) => getVal(b) - getVal(a));
      setGastos(gList);
      const eSnap = await getDocs(collection(db, col, id, "emendas"));
      setEmendas(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }
    load();
  }, [col, id]);

  const totalGastos = gastos.reduce((a, g) => a + getVal(g), 0);
  const totalEmendas = emendas.reduce((a, e) => a + (e.valorEmpenhado || e.valor || 0), 0);

  const porCategoria = {};
  gastos.forEach(g => {
    const cat = getTipo(g);
    porCategoria[cat] = (porCategoria[cat] || 0) + getVal(g);
  });
  const catSorted = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = catSorted.length > 0 ? catSorted[0][1] : 1;

  const porFornecedor = {};
  gastos.forEach(g => {
    const f = getFornecedor(g);
    porFornecedor[f] = (porFornecedor[f] || 0) + getVal(g);
  });
  const fornSorted = Object.entries(porFornecedor).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const top3Total = fornSorted.slice(0, 3).reduce((a, b) => a + b[1], 0);
  const concentracao = totalGastos > 0 ? ((top3Total / totalGastos) * 100).toFixed(0) : 0;

  async function runAI() {
    setAnalyzing(true);
    try {
      const functions = getFunctions(undefined, "southamerica-east1");
      const analyze = httpsCallable(functions, "analyzePolitician");
      const result = await analyze({ deputadoId: id, colecao: col });
      setAnalysis(result.data.analysis);
    } catch (e) { setAnalysis("Erro na analise: " + e.message); }
    setAnalyzing(false);
  }

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Carregando dossie...</div>;
  if (!pol) return <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>Politico nao encontrado.</div>;

  const risk = riskBadge(pol.score);

  const TABS = [
    { k: 'gastos', l: 'Gastos (' + gastos.length + ')' },
    { k: 'graficos', l: 'Graficos' },
    { k: 'categorias', l: 'Por Categoria' },
    { k: 'fornecedores', l: 'Fornecedores' },
    { k: 'emendas', l: 'Emendas (' + emendas.length + ')' },
    { k: 'presenca', l: 'Presenca' },
    { k: 'alertas', l: 'Alertas de Fretamento' },
    { k: 'projetos', l: 'Proposicoes' },
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header do politico */}
      <div className="grain-texture" style={{
        background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
        padding: '28px', border: '1px solid var(--border-light)',
        marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap'
      }}>
        <img src={pol.fotoUrl || pol.foto || ''} alt="" style={{
          width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover',
          border: '3px solid var(--border-light)', background: 'var(--bg-secondary)'
        }} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>{pol.nome}</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            {pol.partido} - {pol.uf} &middot; {pol.cargo || 'Deputado Federal'}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {pol.score != null && (
              <span className={risk.cls} style={{ padding: '5px 14px', borderRadius: '14px', fontSize: '12px', fontWeight: 600 }}>
                Score {pol.score} &middot; {risk.label}
              </span>
            )}
            {Number(concentracao) > 70 && (
              <span className="risk-badge-medium" style={{ padding: '5px 14px', borderRadius: '14px', fontSize: '12px', fontWeight: 600 }}>
                Alta concentracao fornecedores
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Gastos totais', value: fmt(totalGastos), color: 'var(--accent-orange)' },
          { label: 'Emendas', value: fmt(totalEmendas), color: 'var(--accent-gold)' },
          { label: 'Notas fiscais', value: gastos.length, color: 'var(--accent-green)' },
          { label: 'Fornecedores', value: Object.keys(porFornecedor).length, color: 'var(--text-primary)' },
          { label: 'Top 3 fornecedores', value: concentracao + '%', color: Number(concentracao) > 70 ? 'var(--accent-red)' : 'var(--accent-green)' }
        ].map((c, i) => (
          <div key={i} style={{
            background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
            padding: '18px', border: '1px solid var(--border-light)', textAlign: 'center'
          }}>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Space Grotesk', color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Ranking de Economia */}
      {pol.ranking && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px',
          background: 'linear-gradient(135deg, var(--bg-card), var(--bg-surface))',
          border: '1px solid var(--accent-green)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 24px', marginBottom: '24px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'Space Grotesk' }}>
              #{pol.ranking.posicao_economia}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>de {pol.ranking.total_deputados}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              Ranking de Economia Parlamentar
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Top {100 - pol.ranking.percentil}% mais economico na Camara dos Deputados (CEAP)
            </div>
          </div>
          <div style={{
            padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
            background: pol.ranking.percentil > 70 ? 'rgba(76,202,163,0.15)' : pol.ranking.percentil > 40 ? 'rgba(255,193,7,0.15)' : 'rgba(233,69,96,0.15)',
            color: pol.ranking.percentil > 70 ? 'var(--accent-green)' : pol.ranking.percentil > 40 ? 'var(--accent-gold)' : 'var(--accent-red)'
          }}>
            {pol.ranking.percentil > 70 ? 'Economico' : pol.ranking.percentil > 40 ? 'Medio' : 'Gastador'}
          </div>
        </div>
      )}

      {/* Botao IA */}
      <div style={{ marginBottom: '24px' }}>
        <button onClick={runAI} disabled={analyzing} style={{
          padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
          background: 'var(--accent-green)', color: '#fff', border: 'none',
          cursor: analyzing ? 'wait' : 'pointer', opacity: analyzing ? 0.7 : 1,
          transition: 'all 0.2s'
        }}>
          {analyzing ? 'Analisando com IA...' : 'Gerar analise com IA'}
        </button>
      </div>

      {/* Analise IA */}
      {analysis && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-md)',
          padding: '24px', border: '1px solid var(--accent-gold)',
          marginBottom: '24px', boxShadow: 'var(--shadow-glow)'
        }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-gold)', marginBottom: '12px' }}>
            Analise da IA FiscalizaBR
          </h3>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: simpleMarkdown(analysis) }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
            border: tab === t.k ? '1px solid var(--accent-green)' : '1px solid transparent',
            background: tab === t.k ? 'var(--accent-green)' : 'transparent',
            color: tab === t.k ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer'
          }}>{t.l}</button>
        ))}
      </div>

      {/* Gastos */}
      {tab === 'gastos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {gastos.slice(0, 80).map(g => (
            <div key={g.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'var(--bg-card)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
              fontSize: '13px'
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getTipo(g)}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {getFornecedor(g)} {getCnpj(g) ? '| ' + getCnpj(g) : ''} {g.dataDocumento ? '| ' + g.dataDocumento.substring(0, 10) : ''}
                </div>
              </div>
              <div style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                {fmt(getVal(g))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Graficos */}
      {tab === 'graficos' && (
        <GastosChart gastos={gastos} />
      )}

      {/* Categorias */}
      {tab === 'categorias' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {catSorted.map(([cat, val]) => (
            <div key={cat} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{cat}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)' }}>{fmt(val)}</span>
              </div>
              <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: (val / maxCat * 100) + '%', background: 'linear-gradient(90deg, var(--accent-green), var(--accent-gold))', borderRadius: '3px', transition: 'width 0.5s' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fornecedores */}
      {tab === 'fornecedores' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {fornSorted.map(([f, val], i) => (
            <div key={f} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'var(--bg-card)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
              borderLeft: i < 3 ? '3px solid var(--accent-orange)' : '3px solid var(--border-light)'
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>{f}</span>
                {i < 3 && <span style={{ fontSize: '10px', color: 'var(--accent-orange)', marginLeft: '8px' }}>TOP {i+1}</span>}
              </div>
              <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)' }}>{fmt(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Emendas */}
      {tab === 'emendas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {emendas.length === 0 && <p style={{ color: 'var(--text-muted)', padding: '20px' }}>Nenhuma emenda encontrada para este politico.</p>}
          {emendas.map(e => (
            <div key={e.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', background: 'var(--bg-card)',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)'
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{e.municipioNome || e.municipio || 'N/A'} - {e.uf || ''}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{e.objetoResumo || e.beneficiario || ''} | {e.status || ''}</div>
              </div>
              <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)' }}>{fmt(e.valorEmpenhado || e.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Presenca */}
      {tab === 'presenca' && (
        <PresencaSection
          presenca={pol.presenca || 0}
          totalSessoes={pol.totalSessions || 0}
          sessoesPresente={pol.presentSessions || 0}
        />
      )}

      {/* Alertas de Fretamento */}
      {tab === 'alertas' && (
        <AlertasFretamento colecao={col} politicoId={id} />
      )}

      {/* Proposicoes */}
      {tab === 'projetos' && (
        <ProjetosSection />
      )}
    </div>
  );
}
