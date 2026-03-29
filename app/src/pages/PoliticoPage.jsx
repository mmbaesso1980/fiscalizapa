import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import GastosChart from "../components/GastosChart";
import PresencaSection from "../components/PresencaSection";
import AlertasFretamento from "../components/AlertasFretamento";
import ProjetosSection from "../components/ProjetosSection";
import VerbaGabineteSection from "../components/VerbaGabineteSection";
import NepotismoCard from "../components/NepotismoCard";
import EmendasAba from "../components/EmendasAba";
import useFeatureFlags from "../hooks/useFeatureFlags";
import ScorePilaresCard from "../components/ScorePilaresCard";

function fmt(v) {
  if (!v) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function riskBadge(score) {
  if (!score || score < 30) return { label: "Baixo risco", cls: "risk-badge-low" };
  if (score < 60) return { label: "Risco médio", cls: "risk-badge-medium" };
  return { label: "Alto risco", cls: "risk-badge-high" };
}

function simpleMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/### (.*)/g, '<h3>$1</h3>')
    .replace(/## (.*)/g, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\* (.*)/gm, '>$1</li>')
    .replace(/---/g, '<hr/>')
    .replace(/\n/g, '<br/>');
}

function getVal(g) { return g.valorLiquido || g.valor || g.valorDocumento || 0; }
function getTipo(g) { return g.tipoDespesa || g.tipo || g.descricao || g.categoria || "Outros"; }
function getFornecedor(g) { return g.fornecedorNome || g.nomeFornecedor || g.fornecedor || "Desconhecido"; }
function getCnpj(g) { return g.cnpjCpf || g.cnpjCpfFornecedor || g.cnpj || ""; }

export default function PoliticoPage({ user }) {
  const { colecao, id } = useParams();
  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [sessoes, setSessoes] = useState([]);
  const [verbasGabinete, setVerbasGabinete] = useState([]);
  const [tab, setTab] = useState("visao-geral");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const col = colecao || "deputados_federais";
  const { flags } = useFeatureFlags();

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
      try {
        const sSnap = await getDocs(collection(db, col, id, "sessoes"));
        setSessoes(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.log('Sessoes nao disponiveis'); }
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

  const calcScore = (() => {
    let s = 0;
    if (Number(concentracao) > 70) s += 30;
    else if (Number(concentracao) > 50) s += 15;
    if (totalGastos > 2000000) s += 30;
    else if (totalGastos > 1000000) s += 20;
    else if (totalGastos > 500000) s += 10;
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) s += 20;
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) s += 20;
    if (gastos.length > 300) s += 5;
    return Math.min(s, 100);
  })();

  function gerarRelatorioDenuncia() {
    const achados = [];
    if (Number(concentracao) > 50) achados.push('- CONCENTRACAO DE FORNECEDORES: Top 3 fornecedores concentram ' + concentracao + '% dos gastos totais.');
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) achados.push('- FRETAMENTO DE AERONAVES detectado.');
    if (totalGastos > 1000000) achados.push('- VOLUME ELEVADO: ' + fmt(totalGastos) + ' na CEAP.');
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) achados.push('- FORNECEDOR ELEVADO: ' + fornSorted[0][0] + ' recebeu ' + fmt(fornSorted[0][1]));
    const texto = `RELATORIO DE FISCALIZACAO PARLAMENTAR\nGerado por: TransparenciaBR\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nPARLAMENTAR: ${pol.nome}\nPARTIDO/UF: ${pol.partido || pol.siglaPartido} - ${pol.uf || pol.estado || pol.siglaUf}\nCARGO: ${pol.cargo || 'Deputado Federal'}\n\nRESUMO FINANCEIRO:\n- Gastos totais (CEAP): ${fmt(totalGastos)}\n- Notas fiscais: ${gastos.length}\n- Fornecedores: ${Object.keys(porFornecedor).length}\n- Concentracao top 3: ${concentracao}%\n\nACHADOS:\n${achados.length > 0 ? achados.join('\n') : '- Nenhuma irregularidade automatica detectada.'}\n\nTOP 5 FORNECEDORES:\n${fornSorted.slice(0, 5).map((f, i) => (i+1) + '. ' + f[0] + ' - ' + fmt(f[1])).join('\n')}`;
    navigator.clipboard.writeText(texto).then(() => alert('Relatorio copiado!')).catch(() => { const w = window.open('', '_blank'); w.document.write('<pre>' + texto + '</pre>'); });
  }

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

  if (loading) return <div className="loading-container"><div className="loading-spinner" /><p>Carregando dossiê...</p></div>;
  if (!pol) return <div className="loading-container"><p>Político não encontrado.</p></div>;

  const risk = riskBadge(calcScore);
  const TABS = [
    { k: 'visao-geral', l: 'Visão Geral' },
    { k: 'gastos', l: 'Gastos (' + gastos.length + ')' },
    { k: 'presenca', l: 'Presença' },
    { k: 'emendas', l: 'Emendas (' + emendas.length + ')' },
    { k: 'projetos', l: 'Proposições' },
    { k: 'gabinete', l: 'Gabinete' },
    { k: 'alertas', l: 'Alertas' },
  ];
  if (flags.nepotismo) TABS.push({ k: 'nepotismo', l: 'Nepotismo' });
  if (flags.emendas) TABS.push({ k: 'emendasV2', l: 'Emendas V2' });
    return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px' }}>

      {/* HERO EDITORIAL */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 32, background: 'var(--bg-card)', borderRadius: 16, padding: '32px 28px', border: '1px solid var(--border-light)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: 'var(--accent-green)' }} />
        <img src={pol.foto || pol.urlFoto || '/placeholder-avatar.png'} alt={pol.nome}
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border-light)', flexShrink: 0 }}
          onError={(e) => { e.target.src = '/placeholder-avatar.png'; }} />
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--text-muted)', marginBottom: 4 }}>Dossiê Parlamentar</p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', fontFamily: 'Space Grotesk, sans-serif' }}>{pol.nome}</h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0 }}>
            {pol.partido || pol.siglaPartido} — {pol.uf || pol.estado || pol.siglaUf} · {pol.cargo || 'Deputado Federal'}
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {calcScore != null && (
              <span className={risk.cls} style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                Score {calcScore} · {risk.label}
              </span>
            )}
            {Number(concentracao) > 70 && (
              <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'rgba(233,69,96,0.1)', color: 'var(--accent-red)' }}>
                Alta concentração fornecedores
              </span>
            )}
            <a href={`https://www.camara.leg.br/deputados/${id}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent-green)', textDecoration: 'none' }}>
              Perfil oficial ↗
            </a>
          </div>
        </div>
      </div>

      {/* KPIs RESUMO */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Gastos CEAP', value: fmt(totalGastos), color: 'var(--accent-orange)' },
          { label: 'Emendas', value: fmt(totalEmendas), color: 'var(--accent-gold)' },
          { label: 'Notas fiscais', value: gastos.length, color: 'var(--accent-green)' },
          { label: 'Fornecedores', value: Object.keys(porFornecedor).length, color: 'var(--text-primary)' },
          { label: 'Concentração Top 3', value: concentracao + '%', color: Number(concentracao) > 70 ? 'var(--accent-red)' : 'var(--accent-green)' },
        ].map((c, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '18px 16px', border: '1px solid var(--border-light)', textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Space Grotesk', color: c.color, margin: 0 }}>{c.value}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* CTA RELATÓRIO IA - PREMIUM */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #122240 100%)', borderRadius: 16, padding: '28px 24px', marginBottom: 24, border: '1px solid rgba(76,202,163,0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: 'rgba(76,202,163,0.08)' }} />
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--accent-green)', marginBottom: 8, fontWeight: 600 }}>Relatório IA TransparenciaBR</p>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Análise completa com inteligência artificial</h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 16, maxWidth: 600 }}>
          Cruzamento de dados, detecção de padrões suspeitos, fundamentação legal e relatório pronto para denúncia — tudo gerado por IA em segundos.
        </p>
        {analysis ? (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: simpleMarkdown(typeof analysis === 'string' ? analysis : JSON.stringify(analysis)) }} />
          </div>
        ) : (
          <button onClick={runAI} disabled={analyzing} style={{ padding: '12px 28px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: analyzing ? 'wait' : 'pointer', background: 'var(--accent-green)', color: '#fff' }}>
            {analyzing ? 'Analisando...' : 'Gerar Relatório IA'}
          </button>
        )}
      </div>
            {/* RANKING */}
      {pol.ranking && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--border-light)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ textAlign: 'center', minWidth: 70 }}>
            <p style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Space Grotesk', color: 'var(--accent-green)', margin: 0 }}>#{pol.ranking.posicao_economia}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>de {pol.ranking.total_deputados}</p>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Ranking de Economia Parlamentar</p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top {100 - pol.ranking.percentil}% mais econômico (CEAP)</p>
          </div>
          <span style={{ padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: pol.ranking.percentil > 70 ? 'rgba(76,202,163,0.15)' : pol.ranking.percentil > 40 ? 'rgba(255,193,7,0.15)' : 'rgba(233,69,96,0.15)', color: pol.ranking.percentil > 70 ? 'var(--accent-green)' : pol.ranking.percentil > 40 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
            {pol.ranking.percentil > 70 ? 'Econômico' : pol.ranking.percentil > 40 ? 'Médio' : 'Gastador'}
          </span>
        </div>
      )}

      <ScorePilaresCard pol={pol} />

      {/* TABS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24, borderBottom: '1px solid var(--border-light)', paddingBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: '8px 18px', borderRadius: 6, fontSize: 13, fontWeight: tab === t.k ? 600 : 400, border: 'none', background: tab === t.k ? 'var(--accent-green)' : 'transparent', color: tab === t.k ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s' }}>{t.l}</button>
        ))}
      </div>

      {/* TAB: VISÃO GERAL */}
      {tab === 'visao-geral' && (
        <div>
          {/* Verbas Gabinete resumo */}
          {(totalVerbasGab > 0 || verbasGabinete.length > 0) && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 16, border: '1px solid var(--border-light)', marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Verbas de Gabinete</h4>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div><p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-orange)', margin: 0 }}>{fmt(totalVerbasGab)}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>TOTAL</p></div>
                <div><p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk', margin: 0 }}>{verbasGabinete.length}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>ASSESSORES</p></div>
                <div><p style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)', margin: 0 }}>{fmt(totalGastos + totalVerbasGab)}</p><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>CUSTO TOTAL</p></div>
              </div>
            </div>
          )}

          {/* Irregularidades */}
          {gastos.length > 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--border-light)', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 6 }}>⚠️ Irregularidades Detectadas</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontStyle: 'italic' }}>Análise automática baseada em dados públicos da CEAP.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Number(concentracao) > 50 && (
                  <div style={{ padding: '12px 16px', borderLeft: '3px solid var(--accent-red)', background: 'rgba(181,74,74,0.06)', borderRadius: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>Concentração excessiva de fornecedores</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Top 3 concentram {concentracao}% dos gastos.</p>
                  </div>
                )}
                {catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE')) && (
                  <div style={{ padding: '12px 16px', borderLeft: '3px solid var(--accent-orange)', background: 'rgba(255,193,7,0.06)', borderRadius: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>Gastos com fretamento aéreo detectados</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Requer justificativa de economicidade (Ato da Mesa 43/2009).</p>
                  </div>
                )}
                {totalGastos > 1000000 && (
                  <div style={{ padding: '12px 16px', borderLeft: '3px solid var(--accent-orange)', background: 'rgba(255,193,7,0.06)', borderRadius: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>Volume acima de R$ 1 milhão</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Gastos de {fmt(totalGastos)} requerem maior escrutínio.</p>
                  </div>
                )}
                {fornSorted.length > 0 && fornSorted[0][1] > 200000 && (
                  <div style={{ padding: '12px 16px', borderLeft: '3px solid var(--accent-red)', background: 'rgba(181,74,74,0.06)', borderRadius: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>Fornecedor com recebimento elevado</p>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{fornSorted[0][0]}: {fmt(fornSorted[0][1])}</p>
                  </div>
                )}
                {Number(concentracao) <= 50 && totalGastos <= 1000000 && (!fornSorted.length || fornSorted[0][1] <= 200000) && !catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO')) && (
                  <div style={{ padding: '12px 16px', borderLeft: '3px solid var(--accent-green)', background: 'rgba(61,107,94,0.06)', borderRadius: 4 }}>
                    <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent-green)' }}>Nenhuma irregularidade automática detectada</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top Categorias mini */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--border-light)', marginBottom: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Top Categorias de Gasto</h4>
            {catSorted.slice(0, 5).map(([cat, val]) => (
              <div key={cat} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{cat}</span><span style={{ fontWeight: 600, fontFamily: 'Space Grotesk' }}>{fmt(val)}</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3 }}>
                  <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent-green)', width: `${(val / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top Fornecedores mini */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--border-light)', marginBottom: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Top Fornecedores</h4>
            {fornSorted.slice(0, 5).map(([f, val], i) => (
              <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border-light)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>{f}</span>
                  {i < 3 && <span style={{ padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700, background: 'rgba(233,69,96,0.1)', color: 'var(--accent-red)' }}>TOP {i+1}</span>}
                </div>
                <span style={{ fontWeight: 600, fontFamily: 'Space Grotesk', fontSize: 13, color: 'var(--accent-green)' }}>{fmt(val)}</span>
              </div>
            ))}
          </div>

          {/* Denúncia */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <button onClick={gerarRelatorioDenuncia} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', background: '#1a5276', color: '#fff' }}>Copiar Relatório</button>
            <a href="https://falabr.cgu.gov.br" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--accent-red, #b54a4a)', color: '#fff', textDecoration: 'none' }}>Denunciar CGU</a>
            <a href="https://www.mpf.mp.br/servicos/sac" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}>MPF</a>
            <a href="https://portal.tcu.gov.br/ouvidoria/" target="_blank" rel="noopener noreferrer" style={{ padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none' }}>TCU</a>
          </div>
        </div>
      )}
            {/* TAB: GASTOS */}
      {tab === 'gastos' && (
        <div>
          {gastos.slice(0, 80).map(g => (
            <div key={g.id} onClick={() => { const url = g.urlDocumento || g.url; if (url) window.open(url, '_blank'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border-light)', cursor: (g.urlDocumento || g.url) ? 'pointer' : 'default' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-green)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-light)'}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{getTipo(g)}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{getFornecedor(g)} {getCnpj(g) ? '| ' + getCnpj(g) : ''} {g.dataDocumento ? '| ' + g.dataDocumento.substring(0, 10) : ''}</p>
              </div>
              <p style={{ fontWeight: 700, fontSize: 15, fontFamily: 'Space Grotesk', color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>{fmt(getVal(g))}</p>
            </div>
          ))}
          <GastosChart gastos={gastos} />
        </div>
      )}

      {/* TAB: PRESENÇA */}
      {tab === 'presenca' && <PresencaSection politico={pol} colecao={col} politicoId={id} />}

      {/* TAB: EMENDAS */}
      {tab === 'emendas' && (
        <div>
          {emendas.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-muted)' }}>Emendas não encontradas no banco local.</p>
              <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 12, padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--accent-green)', color: '#fff', textDecoration: 'none' }}>Consultar Portal da Transparência</a>
            </div>
          )}
          {emendas.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--bg-card)', borderRadius: 8, marginBottom: 8, border: '1px solid var(--border-light)' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: 14 }}>{e.municipioNome || e.municipio || 'N/A'} - {e.uf || ''}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.objetoResumo || e.beneficiario || ''} | {e.status || ''}</p>
              </div>
              <span style={{ fontWeight: 700, fontFamily: 'Space Grotesk', color: 'var(--accent-gold)' }}>{fmt(e.valorEmpenhado || e.valor)}</span>
            </div>
          ))}
        </div>
      )}

      {/* TAB: PROPOSIÇÕES */}
      {tab === 'projetos' && <ProjetosSection deputadoId={id} colecao={col} />}

      {/* TAB: GABINETE */}
      {tab === 'gabinete' && <VerbaGabineteSection idCamara={pol.idCamara || id} verbasGabinete={verbasGabinete} totalVerbasGab={totalVerbasGab} />}

      {/* TAB: ALERTAS */}
      {tab === 'alertas' && <AlertasFretamento colecao={col} politicoId={id} gastos={gastos} />}

      {/* TAB: NEPOTISMO */}
      {tab === 'nepotismo' && flags.nepotismo && <NepotismoCard deputadoId={id} colecao={col} />}

      {/* TAB: EMENDAS V2 */}
      {tab === 'emendasV2' && flags.emendas && <EmendasAba deputadoId={id} colecao={col} nomeDeputado={pol.nome} />}

    </div>
  );
}
