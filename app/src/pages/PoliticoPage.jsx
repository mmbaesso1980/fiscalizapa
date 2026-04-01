import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
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

// RESTAURADO: Necessário para formatar a resposta da IA corretamente
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

/* === SECTION WRAPPER === */
// Melhoria: Adicionado scrollMarginTop para âncoras funcionarem bem com headers fixos
function Section({ title, icon, children, id }) {
  return (
    <div id={id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '24px 20px', marginBottom: 20, border: '1px solid var(--border-light)', scrollMarginTop: '80px' }}>
      {title && <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>{icon && <span>{icon}</span>}{title}</h3>}
      {children}
    </div>
  );
}

export default function PoliticoPage({ user }) {
  const { colecao, id } = useParams();
  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [emendas, setEmendas] = useState([]);
  const [sessoes, setSessoes] = useState([]);
  const [verbasGabinete, setVerbasGabinete] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAllGastos, setShowAllGastos] = useState(false);
  const col = colecao || "deputados_federais";
  const { flags } = useFeatureFlags();

  // Permite smooth scrolling nativo para os links do Resumo Executivo
  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => { document.documentElement.style.scrollBehavior = 'auto'; };
  }, []);

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
      
      const eSnap = await getDocs(query(collection(db, "emendas"), where("parlamentarId", "==", id))); const eSubSnap = await getDocs(collection(db, col, id, "emendas"));
      const eMerged = [...eSnap.docs.map(d => ({ id: d.id, ...d.data() })), ...eSubSnap.docs.map(d => ({ id: d.id, ...d.data() }))]; setEmendas(eMerged);
      
      try {
        const sSnap = await getDocs(collection(db, col, id, "sessoes"));
        setSessoes(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.log('Sessões não disponíveis'); }
      
      try {
        const vSnap = await getDocs(collection(db, col, id, "verbas_gabinete"));
        setVerbasGabinete(vSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch(e) { console.log('Verbas gabinete não disponíveis'); }
      
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
    if (Number(concentracao) > 70) s += 30; else if (Number(concentracao) > 50) s += 15;
    if (totalGastos > 2000000) s += 30; else if (totalGastos > 1000000) s += 20;
    else if (totalGastos > 500000) s += 10;
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) s += 20;
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) s += 20;
    if (gastos.length > 300) s += 5;
    return Math.min(s, 100);
  })();

  const emendasResumo = pol?.emendasResumo || {};
  const emendasTotal = emendasResumo.total || emendas.length || 0;

    // === EMENDAS AGGREGATIONS (Issue #15) ===
  const emendasPorTipo = {};
  const emendasPorAno = {};
  const emendasPorDestino = {};
  const emendasPorBeneficiario = {};
  emendas.forEach(e => {
    const tipo = e.tipoEmenda || e.tipo_emenda || e.tipo || 'Não informado';
    const ano = e.ano || 'N/A';
    const destino = e.localidade || e.municipioNome || e.municipio || e.uf_destino || e.uf || 'Não informado';
    const benef = e.beneficiario || e.nome_recebedor || e.nomeRecebedor || 'Não informado';
    const val = e.valorEmpenhado || e.valor_empenhado || e.valor || 0;
    emendasPorTipo[tipo] = (emendasPorTipo[tipo] || 0) + val;
    emendasPorAno[ano] = (emendasPorAno[ano] || 0) + val;
    emendasPorDestino[destino] = (emendasPorDestino[destino] || 0) + val;
    emendasPorBeneficiario[benef] = (emendasPorBeneficiario[benef] || 0) + val;
  });
  const tipoEmendasSorted = Object.entries(emendasPorTipo).sort((a, b) => b[1] - a[1]);
  const anoEmendasSorted = Object.entries(emendasPorAno).sort((a, b) => Number(a[0]) - Number(b[0]));
  const destinosSorted = Object.entries(emendasPorDestino).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const beneficiariosSorted = Object.entries(emendasPorBeneficiario).sort((a, b) => b[1] - a[1]).slice(0, 10);

  function gerarRelatorioDenuncia() {
    const achados = [];
    if (Number(concentracao) > 50) achados.push('- CONCENTRAÇÃO DE FORNECEDORES: Top 3 fornecedores concentram ' + concentracao + '% dos gastos totais.');
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) achados.push('- FRETAMENTO DE AERONAVES detectado.');
    if (totalGastos > 1000000) achados.push('- VOLUME ELEVADO: ' + fmt(totalGastos) + ' na CEAP.');
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) achados.push('- FORNECEDOR ELEVADO: ' + fornSorted[0][0] + ' recebeu ' + fmt(fornSorted[0][1]));
    
    const texto = `RELATÓRIO DE FISCALIZAÇÃO PARLAMENTAR\nGerado por: TransparenciaBR\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nPARLAMENTAR: ${pol.nome}\nPARTIDO/UF: ${pol.partido || pol.siglaPartido} - ${pol.uf || pol.estado || pol.siglaUf}\nCARGO: ${pol.cargo || 'Deputado Federal'}\n\nRESUMO FINANCEIRO:\n- Gastos totais (CEAP): ${fmt(totalGastos)}\n- Notas fiscais: ${gastos.length}\n- Fornecedores: ${Object.keys(porFornecedor).length}\n- Concentração top 3: ${concentracao}%\n\nACHADOS:\n${achados.length > 0 ? achados.join('\n') : '- Nenhuma irregularidade automática detectada.'}\n\nTOP 5 FORNECEDORES:\n${fornSorted.slice(0, 5).map((f, i) => (i+1) + '. ' + f[0] + ' - ' + fmt(f[1])).join('\n')}`;
    
    navigator.clipboard.writeText(texto).then(() => alert('Relatório copiado!')).catch(() => {
      const w = window.open('', '_blank'); w.document.write('<pre>' + texto + '</pre>');
    });
  }

  async function runAI() {
    setAnalyzing(true);
    try {
      const functions = getFunctions(undefined, "southamerica-east1");
      const analyze = httpsCallable(functions, "analyzePolitician");
      const result = await analyze({ deputadoId: id, colecao: col });
      setAnalysis(result.data.analysis);
    } catch (e) { setAnalysis("Erro na análise: " + e.message); }
    setAnalyzing(false);
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando dossiê...</div>;
  if (!pol) return <div style={{ padding: 60, textAlign: 'center' }}>Político não encontrado.</div>;
  
  const risk = riskBadge(calcScore);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px' }}>
      
      {/* ========== HEADER / HERO ========== */}
      <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(76,202,163,0.08) 100%)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, border: '1px solid var(--border-light)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={pol.foto || pol.fotoUrl || `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpgmaior`} alt={pol.nome} style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-green)' }} onError={e => { e.target.src = '/placeholder-avatar.png'; }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--accent-green)', fontWeight: 700, marginBottom: 4 }}>Dossiê Parlamentar</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>{pol.nome}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{pol.partido || pol.siglaPartido} — {pol.uf || pol.estado || pol.siglaUf} · {pol.cargo || 'Deputado Federal'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {calcScore != null && <span className={risk.cls} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Score {calcScore} · {risk.label}</span>}
            {Number(concentracao) > 70 && <span style={{ background: 'rgba(233,69,96,0.15)', color: 'var(--accent-red)', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Alta concentração fornecedores</span>}
            <a href={`https://www.camara.leg.br/deputados/${id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent-green)' }}>Perfil oficial ↗</a>
          </div>
        </div>
      </div>

      {/* RESTAURADO: Pilares visuais (Caso existam no banco) */}
      <ScorePilaresCard pol={pol} />

      {/* ========== RESUMO EXECUTIVO (KPIs) - AGORA SÃO LINKS CLICÁVEIS ========== */}
      <Section title="Resumo Executivo" icon="📊" id="resumo">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Gastos CEAP', value: fmt(totalGastos), color: 'var(--accent-orange)', link: '#gastos' },
            { label: 'Emendas', value: emendasTotal > 0 ? fmt(totalEmendas > 0 ? totalEmendas : 0) : emendasTotal, color: 'var(--accent-gold)', link: '#emendas' },
            { label: 'Notas fiscais', value: gastos.length, color: 'var(--accent-green)', link: '#gastos' },
            { label: 'Presença Plenário', value: (pol.presencaPct || pol.presenca || '-') + '%', color: 'var(--accent-green)', link: '#presenca' },
            { label: 'Gastos Gabinete', value: fmt(totalVerbasGab), color: 'var(--text-primary)', link: '#gabinete' },
          ].map((c, i) => (
            <a href={c.link} key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '16px 14px', textAlign: 'center', textDecoration: 'none', transition: 'transform 0.2s ease', cursor: 'pointer', display: 'block' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{c.label}</div>
            </a>
          ))}
        </div>

        {/* Índice TransparenciaBR */}
        {pol.indice_transparenciabr && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(76,202,163,0.08)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Índice TransparenciaBR</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-green)', marginLeft: 12 }}>{pol.indice_transparenciabr}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>/100</span>
            </div>
            {pol.presencaClassificacao && <span style={{ background: 'var(--accent-green)', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{pol.presencaClassificacao}</span>}
          </div>
        )}
      </Section>

      {/* ========== ALERTAS E IRREGULARIDADES (Movido para cima) ========== */}
      {gastos.length > 0 && (
        <Section title="Alertas e Irregularidades" icon="⚠️" id="alertas">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>Análise automática baseada em dados públicos da CEAP.</p>
          
          {Number(concentracao) > 50 && (
            <div style={{ padding: '10px 14px', background: 'rgba(233,69,96,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-red)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-red)' }}>Concentração excessiva de fornecedores</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top 3 concentram {concentracao}% dos gastos totais.</div>
            </div>
          )}
          
          {catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE')) && (
            <div style={{ padding: '10px 14px', background: 'rgba(233,69,96,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-red)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-red)' }}>Gastos com fretamento aéreo detectados</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Requer justificativa de economicidade (Ato da Mesa 43/2009).</div>
            </div>
          )}
          
          {totalGastos > 1000000 && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,193,7,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-gold)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold)' }}>Volume acima de R$ 1 milhão</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gastos de {fmt(totalGastos)} requerem maior escrutínio.</div>
            </div>
          )}
          
          {fornSorted.length > 0 && fornSorted[0][1] > 200000 && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,193,7,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-gold)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold)' }}>Fornecedor com recebimento elevado</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fornSorted[0][0]}: {fmt(fornSorted[0][1])}</div>
            </div>
          )}
          
          {Number(concentracao) <= 50 && totalGastos <= 1000000 && (!fornSorted.length || fornSorted[0][1] <= 200000) && !catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO')) && (
            <div style={{ padding: '14px', background: 'rgba(76,202,163,0.08)', borderRadius: 8, textAlign: 'center', color: 'var(--accent-green)', fontWeight: 600 }}>
              Nenhuma irregularidade automática detectada
            </div>
          )}
          
          <AlertasFretamento gastos={gastos} colecao={col} politicoId={id} />
        </Section>
      )}

      {/* ========== RELATORIO IA (Movido para cima) ========== */}
      <div style={{ background: 'linear-gradient(135deg, rgba(76,202,163,0.1) 0%, rgba(255,193,7,0.08) 100%)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, border: '2px solid var(--accent-green)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--accent-green)', fontWeight: 700, marginBottom: 8 }}>Relatório IA TransparenciaBR</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Análise completa com inteligência artificial</h3>
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>• Cruzamento de {gastos.length} notas fiscais com {Object.keys(porFornecedor).length} fornecedores</div>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>• Concentração de {concentracao}% nos top 3 fornecedores {Number(concentracao) > 50 ? '⚠️' : '✅'}</div>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>• Análise de {emendasTotal} emendas parlamentares</div>
        </div>
        
        {!analysis && (
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              Foram identificados padrões de concentração em fornecedores específicos que merecem atenção.
              A análise cruzada dos dados da CEAP com o portal da transparência revela inconsistências nos valores declarados...
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ background: 'var(--accent-green)', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14 }}>🔒 Conteúdo Premium</span>
            </div>
          </div>
        )}
        
        {analysis ? (
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.7, maxHeight: 400, overflow: 'auto' }}>
             {/* Renderizando o Markdown Restaurado */}
             <div dangerouslySetInnerHTML={{ __html: simpleMarkdown(typeof analysis === 'string' ? analysis : JSON.stringify(analysis)) }} />
          </div>
        ) : (
          <button onClick={runAI} disabled={analyzing} style={{ width: '100%', padding: '14px 24px', borderRadius: 10, border: 'none', background: 'var(--accent-green)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: analyzing ? 'wait' : 'pointer', transition: 'opacity 0.2s' }}>
            {analyzing ? 'Analisando dados...' : '🤖 Gerar Relatório IA Completo'}
          </button>
        )}
      </div>

      {/* ========== DENÚNCIA (Movido para cima) ========== */}
      <Section title="Ações de Fiscalização" icon="📢" id="denuncia">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={gerarRelatorioDenuncia} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-green)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Copiar Relatório</button>
          <a href="https://falabr.cgu.gov.br" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--accent-red)', color: 'var(--accent-red)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>Denunciar CGU</a>
          <a href="https://www.mpf.mp.br/servicos/sac" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>MPF</a>
          <a href="https://portal.tcu.gov.br/ouvidoria/" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>TCU</a>
        </div>
      </Section>

      {/* ========== RANKING ========== */}
      {pol.ranking && (
        <Section title="Ranking de Economia" icon="🏆" id="ranking">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--accent-green)' }}>#{pol.ranking.posicao_economia}</div>
            <div>
              <div style={{ fontSize: 14 }}>de {pol.ranking.total_deputados} deputados</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top {100 - pol.ranking.percentil}% mais econômico (CEAP)</div>
            </div>
            <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: pol.ranking.percentil > 70 ? 'rgba(76,202,163,0.15)' : pol.ranking.percentil > 40 ? 'rgba(255,193,7,0.15)' : 'rgba(233,69,96,0.15)', color: pol.ranking.percentil > 70 ? 'var(--accent-green)' : pol.ranking.percentil > 40 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
              {pol.ranking.percentil > 70 ? 'Econômico' : pol.ranking.percentil > 40 ? 'Médio' : 'Gastador'}
            </span>
          </div>
        </Section>
      )}

      {/* ========== TOP CATEGORIAS DE GASTO ========== */}
      {catSorted.length > 0 && (
        <Section title="Distribuição por Tipo de Gasto" icon="📁" id="categorias">
          
          {/* RESTAURADO: Gráfico Visual de Gastos */}
          <div style={{ marginBottom: 24 }}>
             <GastosChart gastos={gastos} />
          </div>

          {catSorted.slice(0, 8).map(([cat, val]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                <span>{cat}</span><span style={{ fontWeight: 700 }}>{fmt(val)}</span>
              </div>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ width: (val / maxCat * 100) + '%', height: '100%', background: 'var(--accent-green)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* ========== MAIORES FORNECEDORES ========== */}
      {fornSorted.length > 0 && (
        <Section title="Maiores Fornecedores" icon="🏢" id="fornecedores">
          {fornSorted.map(([f, val], i) => (
            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <span style={{ fontSize: 14 }}>{f}</span>
                {i < 3 && <span style={{ marginLeft: 8, background: 'rgba(233,69,96,0.12)', color: 'var(--accent-red)', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>TOP {i + 1}</span>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(val)}</span>
            </div>
          ))}
        </Section>
      )}

            {/* ========== DISTRIBUIÇÃO DAS EMENDAS (Issue #15) ========== */}
      {(emendas.length > 0 || emendasTotal > 0) && (tipoEmendasSorted.length > 0 || anoEmendasSorted.length > 0) && (
        <Section title="Distribuição das Emendas" icon="📊" id="emendas-distribuicao">
          {tipoEmendasSorted.length > 0 && (
            <>
              <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>Por Tipo de Emenda</h4>
              {tipoEmendasSorted.map(([tipo, val]) => (
                <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{tipo}</span>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(val)}</span>
                </div>
              ))}
            </>
          )}
          {anoEmendasSorted.length > 0 && (
            <>
              <h4 style={{ margin: '20px 0 12px', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>Por Ano</h4>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {anoEmendasSorted.map(([ano, val]) => (
                  <div key={ano} style={{ flex: '1 1 120px', padding: '14px', background: 'var(--bg-elevated)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent-green)' }}>{ano}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{fmt(val)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {/* ========== DESTINOS PRINCIPAIS (Issue #15) ========== */}
      {destinosSorted.length > 0 && (
        <Section title="Destinos Principais" icon="📍" id="destinos">
          {destinosSorted.map(([destino, val], i) => (
            <div key={destino} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 14 }}>{destino}</span>
                {i < 3 && <span style={{ marginLeft: 8, background: 'rgba(76,202,163,0.12)', color: 'var(--accent-green)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>TOP {i + 1}</span>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(val)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ========== MAIORES FAVORECIDOS/BENEFICIÁRIOS (Issue #15) ========== */}
      {beneficiariosSorted.length > 0 && (
        <Section title="Maiores Favorecidos" icon="👥" id="beneficiarios">
          {beneficiariosSorted.map(([benef, val], i) => (
            <div key={benef} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 14 }}>{benef}</span>
                {i < 3 && <span style={{ marginLeft: 8, background: 'rgba(255,193,7,0.12)', color: 'var(--accent-gold)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>TOP {i + 1}</span>}
              </div>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{fmt(val)}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ========== GASTOS DETALHADOS ========== */}
      {gastos.length > 0 && (
        <Section title={`Gastos Detalhados (${gastos.length})`} icon="💳" id="gastos">
          {(showAllGastos ? gastos : gastos.slice(0, 20)).map(g => (
            <div key={g.id} onClick={() => { const url = g.urlDocumento || g.url; if (url) window.open(url, '_blank'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 6, cursor: (g.urlDocumento || g.url) ? 'pointer' : 'default', border: '1px solid transparent', transition: 'border-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-green)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{getTipo(g)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{getFornecedor(g)} {getCnpj(g) ? '| ' + getCnpj(g) : ''} {g.dataDocumento ? '| ' + g.dataDocumento.substring(0, 10) : ''}</div>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', color: 'var(--accent-green)' }}>{fmt(getVal(g))}</span>
            </div>
          ))}
          {gastos.length > 20 && !showAllGastos && (
            <button onClick={() => setShowAllGastos(true)} style={{ width: '100%', padding: 12, marginTop: 8, border: '1px solid var(--accent-green)', borderRadius: 8, background: 'transparent', color: 'var(--accent-green)', cursor: 'pointer', fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(76,202,163,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Ver todos os {gastos.length} gastos
            </button>
          )}
        </Section>
      )}

      {/* ========== EMENDAS ========== */}
      <Section title={`Emendas Parlamentares (${emendasTotal})`} icon="📝" id="emendas">
        {emendas.length > 0 ? (
          emendas.slice(0, 15).map(e => (
            <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{e.municipioNome || e.municipio || 'N/A'} - {e.uf || ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{e.objetoResumo || e.beneficiario || ''} | {e.status || ''}</div>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--accent-gold)' }}>{fmt(e.valorEmpenhado || e.valor)}</span>
              </div>
            </div>
          ))
        ) : emendasTotal > 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
            <p>{emendasTotal} emendas registradas no Portal da Transparência.</p>
            <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 13 }}>Consultar no Portal da Transparência ↗</a>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
            <p>Nenhuma emenda encontrada.</p>
            <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 13 }}>Consultar Portal da Transparência ↗</a>
          </div>
        )}
      </Section>

      {/* ========== PRESENCA ========== */}
      <Section title="Presença Parlamentar" icon="✅" id="presenca">
        <PresencaSection colecao={col} politicoId={id} sessoes={sessoes} />
      </Section>

      {/* ========== PROPOSICOES ========== */}
      <Section title="Proposições Legislativas" icon="📜" id="projetos">
        <ProjetosSection colecao={col} politicoId={id} />
      </Section>

      {/* ========== GABINETE ========== */}
      {(verbasGabinete.length > 0 || totalVerbasGab > 0) && (
        <Section title="Verba de Gabinete" icon="👥" id="gabinete">
          <VerbaGabineteSection colecao={col} politicoId={id} verbas={verbasGabinete} />
        </Section>
      )}

      {/* ========== NEPOTISMO (feature flag) ========== */}
      {flags.nepotismo && <Section title="Análise de Nepotismo" icon="🔍" id="nepotismo"><NepotismoCard colecao={col} politicoId={id} /></Section>}
      
      {/* ========== EMENDAS V2 (feature flag) ========== */}
      {flags.emendas && <Section title="Emendas V2" icon="📦" id="emendasV2"><EmendasAba colecao={col} politicoId={id} nomeDeputado={pol.nome} /></Section>}
      
    </div>
  );
}
