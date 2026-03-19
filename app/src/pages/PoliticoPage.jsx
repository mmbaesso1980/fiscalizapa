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
  const [sessoes, setSessoes] = useState([]);
  const [verbasGabinete, setVerbasGabinete] = useState([]);
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
      // Carregar sessoes detalhadas
      try {
        const sSnap = await getDocs(collection(db, col, id, "sessoes"));
        setSessoes(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.log('Sessoes nao disponiveis'); }
      // Carregar verbas de gabinete
      try {
        const vSnap = await getDocs(collection(db, col, id, "verbas_gabinete"));
        setVerbasGabinete(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.log('Verbas gabinete nao disponiveis'); }
      setLoading(false);
    }
    load();
  }, [col, id]);

  const totalGastos = gastos.reduce((a, g) => a + getVal(g), 0);
  const totalEmendas = emendas.reduce((a, e) => a + (e.valorEmpenhado || e.valor || 0), 0);
  const totalVerbasGab = verbasGabinete.reduce((a, v) => a + (v.valor || v.remuneracao || 0), 0);
  const porCategoria = {};
  gastos.forEach(g => { const cat = getTipo(g); porCategoria[cat] = (porCategoria[cat] || 0) + getVal(g); });
  const catSorted = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = catSorted.length > 0 ? catSorted[0][1] : 1;
  const porFornecedor = {};
  gastos.forEach(g => { const f = getFornecedor(g); porFornecedor[f] = (porFornecedor[f] || 0) + getVal(g); });
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

  if (loading) return <div className="loading-container"><div className="loading-spinner" /><p>Carregando dossie...</p></div>;
  if (!pol) return <div className="loading-container"><p>Politico nao encontrado.</p></div>;
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
    <div className="page-container" style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
      {/* Header do politico */}
      <div className="politico-header" style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '24px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '24px', border: '1px solid var(--border-light)' }}>
        <img src={pol.foto || pol.urlFoto || '/placeholder-avatar.png'} alt={pol.nome}
          style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }}
          onError={(e) => { e.target.src = '/placeholder-avatar.png'; }} />
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{pol.nome}</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '4px 0' }}>
            {pol.partido || pol.siglaPartido} - {pol.uf || pol.estado || pol.siglaUf} · {pol.cargo || 'Deputado Federal'}
          </p>
          {pol.score != null && (
            <span className={risk.cls} style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
              Score {pol.score} · {risk.label}
            </span>
          )}
          {Number(concentracao) > 70 && (
            <span style={{ display: 'inline-block', marginLeft: '8px', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: 'rgba(233,69,96,0.1)', color: 'var(--accent-red)' }}>
              Alta concentracao fornecedores
            </span>
          )}
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Gastos totais', value: fmt(totalGastos), color: 'var(--accent-orange)' },
          { label: 'Emendas', value: fmt(totalEmendas), color: 'var(--accent-gold)' },
          { label: 'Notas fiscais', value: gastos.length, color: 'var(--accent-green)' },
          { label: 'Fornecedores', value: Object.keys(porFornecedor).length, color: 'var(--text-primary)' },
          { label: 'Top 3 fornecedores', value: concentracao + '%', color: Number(concentracao) > 70 ? 'var(--accent-red)' : 'var(--accent-green)' }
        ].map((c, i) => (
          <div key={i} style={{ flex: '1 1 140px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
            <p style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'Space Grotesk', color: c.color }}>{c.value}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Verbas de Gabinete - Resumo */}
      {(totalVerbasGab > 0 || verbasGabinete.length > 0) && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', padding: '16px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Verbas de Gabinete</h4>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)' }}>{fmt(totalVerbasGab)}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>TOTAL VERBAS GABINETE</p>
            </div>
            <div>
              <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--text-primary)' }}>{verbasGabinete.length}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ASSESSORES/SERVIDORES</p>
            </div>
            <div>
              <p style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)' }}>{fmt(totalGastos + totalVerbasGab)}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CUSTO TOTAL PARLAMENTAR</p>
            </div>
          </div>
        </div>
      )}

      {/* Ranking de Economia */}
      {pol.ranking && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-light)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '32px', fontWeight: 800, fontFamily: 'Space Grotesk', color: 'var(--accent-green)' }}>#{pol.ranking.posicao_economia}</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>de {pol.ranking.total_deputados}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Ranking de Economia Parlamentar</p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Top {100 - pol.ranking.percentil}% mais economico na Camara dos Deputados (CEAP)</p>
          </div>
          <span style={{ padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: pol.ranking.percentil > 70 ? 'rgba(76,202,163,0.15)' : pol.ranking.percentil > 40 ? 'rgba(255,193,7,0.15)' : 'rgba(233,69,96,0.15)', color: pol.ranking.percentil > 70 ? 'var(--accent-green)' : pol.ranking.percentil > 40 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
            {pol.ranking.percentil > 70 ? 'Economico' : pol.ranking.percentil > 40 ? 'Medio' : 'Gastador'}
          </span>
        </div>
      )}

      {/* Botao IA */}
      <button onClick={runAI} disabled={analyzing} className="btn-primary" style={{ marginBottom: '20px', padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, border: 'none', cursor: analyzing ? 'wait' : 'pointer', background: 'var(--accent-green)', color: '#fff' }}>
        {analyzing ? 'Analisando com IA...' : 'Gerar analise com IA'}
      </button>

      {/* Denuncia */}       <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>         <a href="https://falabr.cgu.gov.br" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer', background: 'var(--accent-red, #b54a4a)', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>Denunciar a CGU</a>         <a href="https://www.mpf.mp.br/servicos/sac" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border-light)', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}>MPF</a>         <a href="https://portal.tcu.gov.br/ouvidoria/" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border-light)', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}>TCU</a>         <a href={`https://www.camara.leg.br/deputados/${id}`} target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--border-light)', cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}>Perfil Oficial</a>       </div>        {/* Analise IA */}
      {analysis && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--border-light)', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '12px' }}>Analise da IA FiscalizaBR</h3>
          <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(analysis) }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, border: tab === t.k ? '1px solid var(--accent-green)' : '1px solid transparent', background: tab === t.k ? 'var(--accent-green)' : 'transparent', color: tab === t.k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>{t.l}</button>
        ))}
      </div>

      {/* Gastos */}
      {tab === 'gastos' && (
        <div>
          {gastos.slice(0, 80).map(g => (
            <div key={g.id} onClick={() => { const url = g.urlDocumento || g.url; if (url) window.open(url, '_blank'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--border-light)', cursor: (g.urlDocumento || g.url) ? 'pointer' : 'default', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-green)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{getTipo(g)}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {getFornecedor(g)} {getCnpj(g) ? '| ' + getCnpj(g) : ''} {g.dataDocumento ? '| ' + g.dataDocumento.substring(0, 10) : ''}
                </p>
              </div>
              <p style={{ fontWeight: 700, fontSize: '15px', fontFamily: 'Space Grotesk', color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>{fmt(getVal(g))}</p>
            </div>
          ))}
          {/* Lista de verbas de gabinete dentro de gastos */}
          {verbasGabinete.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px', borderTop: '2px solid var(--border-light)', paddingTop: '16px' }}>Verbas de Gabinete - Assessores</h4>
              {verbasGabinete.map((v, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'rgba(255,193,7,0.04)', borderRadius: 'var(--radius-sm)', marginBottom: '6px', border: '1px solid var(--border-light)' }}>
                  <div>
                    <p style={{ fontWeight: 500, fontSize: '13px', color: 'var(--text-primary)' }}>{v.nome || v.servidor || 'Assessor'}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.cargo || v.funcao || 'Gabinete'} {v.periodo ? '| ' + v.periodo : ''}</p>
                  </div>
                  <p style={{ fontWeight: 700, fontSize: '14px', fontFamily: 'Space Grotesk', color: 'var(--accent-gold)', whiteSpace: 'nowrap' }}>{fmt(v.valor || v.remuneracao)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Graficos */}
      {tab === 'graficos' && (<GastosChart gastos={gastos} />)}

      {/* Categorias */}
      {tab === 'categorias' && (
        <div>
          {catSorted.map(([cat, val]) => (
            <div key={cat} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-primary)' }}>{cat}</span>
                <span style={{ fontWeight: 600, fontFamily: 'Space Grotesk' }}>{fmt(val)}</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '4px', background: 'var(--accent-green)', width: `${(val / maxCat) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fornecedores */}
      {tab === 'fornecedores' && (
        <div>
          {fornSorted.map(([f, val], i) => (
            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{f}</span>
                {i < 3 && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, background: 'rgba(233,69,96,0.1)', color: 'var(--accent-red)' }}>TOP {i+1}</span>}
              </div>
              <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-green)' }}>{fmt(val)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Emendas */}
      {tab === 'emendas' && (
        <div>
          {emendas.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Nenhuma emenda encontrada para este politico.</p>}
          {emendas.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', marginBottom: '8px', border: '1px solid var(--border-light)' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{e.municipioNome || e.municipio || 'N/A'} - {e.uf || ''}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{e.objetoResumo || e.beneficiario || ''} | {e.status || ''}</p>
              </div>
              <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)' }}>{fmt(e.valorEmpenhado || e.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Presenca */}
      {tab === 'presenca' && (
        <PresencaSection deputadoId={id} colecao={col} presenca={pol.presenca} totalSessoes={pol.totalSessoes} sessoesPresente={pol.sessoesPresente} sessoes={sessoes} />
      )}

            {tab === 'alertas' && (<AlertasFretamento colecao={col} politicoId={id} />)}
      {/* Proposicoes */}
      {tab === 'projetos' && (<ProjetosSection deputadoId={id} colecao={col} />)}

    </div>
  );
}
