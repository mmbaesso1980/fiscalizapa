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
  if (score < 60) return { label: "Risco m\u00e9dio", cls: "risk-badge-medium" };
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

/* === SECTION WRAPPER === */
function Section({ title, icon, children, id }) {
  return (
    <div id={id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '24px 20px', marginBottom: 20, border: '1px solid var(--border-light)' }}>
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
    if (Number(concentracao) > 70) s += 30; else if (Number(concentracao) > 50) s += 15;
    if (totalGastos > 2000000) s += 30; else if (totalGastos > 1000000) s += 20; else if (totalGastos > 500000) s += 10;
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) s += 20;
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) s += 20;
    if (gastos.length > 300) s += 5;
    return Math.min(s, 100);
  })();

  /* Emendas por ano (do emendasResumo no doc principal) */
  const emendasResumo = pol?.emendasResumo || {};
  const emendasTotal = emendasResumo.total || emendas.length || 0;
  const emendasEmpenhado = emendasResumo.empenhado || '';
  const emendasPago = emendasResumo.pago || '';

  function gerarRelatorioDenuncia() {
    const achados = [];
    if (Number(concentracao) > 50) achados.push('- CONCENTRACAO DE FORNECEDORES: Top 3 fornecedores concentram ' + concentracao + '% dos gastos totais.');
    if (catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE'))) achados.push('- FRETAMENTO DE AERONAVES detectado.');
    if (totalGastos > 1000000) achados.push('- VOLUME ELEVADO: ' + fmt(totalGastos) + ' na CEAP.');
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) achados.push('- FORNECEDOR ELEVADO: ' + fornSorted[0][0] + ' recebeu ' + fmt(fornSorted[0][1]));
    const texto = `RELATORIO DE FISCALIZACAO PARLAMENTAR\nGerado por: TransparenciaBR\nData: ${new Date().toLocaleDateString('pt-BR')}\n\nPARLAMENTAR: ${pol.nome}\nPARTIDO/UF: ${pol.partido || pol.siglaPartido} - ${pol.uf || pol.estado || pol.siglaUf}\nCARGO: ${pol.cargo || 'Deputado Federal'}\n\nRESUMO FINANCEIRO:\n- Gastos totais (CEAP): ${fmt(totalGastos)}\n- Notas fiscais: ${gastos.length}\n- Fornecedores: ${Object.keys(porFornecedor).length}\n- Concentracao top 3: ${concentracao}%\n\nACHADOS:\n${achados.length > 0 ? achados.join('\n') : '- Nenhuma irregularidade automatica detectada.'}\n\nTOP 5 FORNECEDORES:\n${fornSorted.slice(0, 5).map((f, i) => (i+1) + '. ' + f[0] + ' - ' + fmt(f[1])).join('\n')}`;
    navigator.clipboard.writeText(texto).then(() => alert('Relatorio copiado!')).catch(() => {
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
    } catch (e) { setAnalysis("Erro na analise: " + e.message); }
    setAnalyzing(false);
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando dossi\u00ea...</div>;
  if (!pol) return <div style={{ padding: 60, textAlign: 'center' }}>Pol\u00edtico n\u00e3o encontrado.</div>;

  const risk = riskBadge(calcScore);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 60px' }}>

      {/* ========== HEADER / HERO ========== */}
      <div style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(76,202,163,0.08) 100%)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, border: '1px solid var(--border-light)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <img src={pol.foto || pol.fotoUrl || `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpgmaior`} alt={pol.nome} style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--accent-green)' }} onError={e => { e.target.src = '/placeholder-avatar.png'; }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--accent-green)', fontWeight: 700, marginBottom: 4 }}>Dossi\u00ea Parlamentar</p>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>{pol.nome}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{pol.partido || pol.siglaPartido} \u2014 {pol.uf || pol.estado || pol.siglaUf} \u00b7 {pol.cargo || 'Deputado Federal'}</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {calcScore != null && <span className={risk.cls} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Score {calcScore} \u00b7 {risk.label}</span>}
            {Number(concentracao) > 70 && <span style={{ background: 'rgba(233,69,96,0.15)', color: 'var(--accent-red)', padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>Alta concentra\u00e7\u00e3o fornecedores</span>}
            <a href={`https://www.camara.leg.br/deputados/${id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent-green)' }}>Perfil oficial \u2197</a>
          </div>
        </div>
      </div>

      {/* ========== RESUMO EXECUTIVO (KPIs) ========== */}
      <Section title="Resumo Executivo" icon="\ud83d\udcca" id="resumo">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {[
            { label: 'Gastos CEAP', value: fmt(totalGastos), color: 'var(--accent-orange)' },
            { label: 'Emendas', value: emendasTotal > 0 ? fmt(totalEmendas > 0 ? totalEmendas : 0) : emendasTotal + ' emendas', color: 'var(--accent-gold)' },
            { label: 'Notas fiscais', value: gastos.length, color: 'var(--accent-green)' },
            { label: 'Fornecedores', value: Object.keys(porFornecedor).length, color: 'var(--text-primary)' },
            { label: 'Concentra\u00e7\u00e3o Top 3', value: concentracao + '%', color: Number(concentracao) > 70 ? 'var(--accent-red)' : 'var(--accent-green)' },
            { label: 'Presen\u00e7a Plen\u00e1rio', value: (pol.presencaPct || pol.presenca || '-') + '%', color: 'var(--accent-green)' },
          ].map((c, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '16px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* Indice TransparenciaBR */}
        {pol.indice_transparenciabr && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(76,202,163,0.08)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>\u00cdndice TransparenciaBR</span>
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-green)', marginLeft: 12 }}>{pol.indice_transparenciabr}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>/100</span>
            </div>
            {pol.presencaClassificacao && <span style={{ background: 'var(--accent-green)', color: '#fff', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{pol.presencaClassificacao}</span>}
          </div>
        )}

        {/* Verbas Gabinete resumo */}
        {(totalVerbasGab > 0 || verbasGabinete.length > 0) && (
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(totalVerbasGab)}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Verbas Gabinete</div></div>
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{verbasGabinete.length}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Assessores</div></div>
            <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(totalGastos + totalVerbasGab)}</div><div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Custo Total</div></div>
          </div>
        )}
      </Section>

      {/* ========== RANKING ========== */}
      {pol.ranking && (
        <Section title="Ranking de Economia" icon="\ud83c\udfc6" id="ranking">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 40, fontWeight: 900, color: 'var(--accent-green)' }}>#{pol.ranking.posicao_economia}</div>
            <div>
              <div style={{ fontSize: 14 }}>de {pol.ranking.total_deputados} deputados</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top {100 - pol.ranking.percentil}% mais econ\u00f4mico (CEAP)</div>
            </div>
            <span style={{ padding: '4px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: pol.ranking.percentil > 70 ? 'rgba(76,202,163,0.15)' : pol.ranking.percentil > 40 ? 'rgba(255,193,7,0.15)' : 'rgba(233,69,96,0.15)', color: pol.ranking.percentil > 70 ? 'var(--accent-green)' : pol.ranking.percentil > 40 ? 'var(--accent-gold)' : 'var(--accent-red)' }}>
              {pol.ranking.percentil > 70 ? 'Econ\u00f4mico' : pol.ranking.percentil > 40 ? 'M\u00e9dio' : 'Gastador'}
            </span>
          </div>
        </Section>
      )}

      {/* ========== TOP CATEGORIAS DE GASTO ========== */}
      {catSorted.length > 0 && (
        <Section title="Distribui\u00e7\u00e3o por Tipo de Gasto" icon="\ud83d\udcc1" id="categorias">
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
        <Section title="Maiores Fornecedores" icon="\ud83c\udfe2" id="fornecedores">
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

      {/* ========== GASTOS DETALHADOS ========== */}
      {gastos.length > 0 && (
        <Section title={`Gastos Detalhados (${gastos.length})`} icon="\ud83d\udcb3" id="gastos">
          {(showAllGastos ? gastos : gastos.slice(0, 20)).map(g => (
            <div key={g.id} onClick={() => { const url = g.urlDocumento || g.url; if (url) window.open(url, '_blank'); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 6, cursor: (g.urlDocumento || g.url) ? 'pointer' : 'default', border: '1px solid transparent' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-green)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{getTipo(g)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{getFornecedor(g)} {getCnpj(g) ? '| ' + getCnpj(g) : ''} {g.dataDocumento ? '| ' + g.dataDocumento.substring(0, 10) : ''}</div>
              </div>
              <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{fmt(getVal(g))}</span>
            </div>
          ))}
          {gastos.length > 20 && !showAllGastos && (
            <button onClick={() => setShowAllGastos(true)} style={{ width: '100%', padding: 12, marginTop: 8, border: '1px solid var(--accent-green)', borderRadius: 8, background: 'transparent', color: 'var(--accent-green)', cursor: 'pointer', fontWeight: 600 }}>Ver todos os {gastos.length} gastos</button>
          )}
        </Section>
      )}

      {/* ========== EMENDAS ========== */}
      <Section title={`Emendas Parlamentares (${emendasTotal})`} icon="\ud83d\udcdd" id="emendas">
        {emendas.length > 0 ? (
          emendas.slice(0, 15).map(e => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
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
            <p>{emendasTotal} emendas registradas no Portal da Transpar\u00eancia.</p>
            <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 13 }}>Consultar no Portal da Transpar\u00eancia \u2197</a>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>
            <p>Nenhuma emenda encontrada.</p>
            <a href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-green)', fontWeight: 600, fontSize: 13 }}>Consultar Portal da Transpar\u00eancia \u2197</a>
          </div>
        )}
      </Section>

      {/* ========== PRESENCA ========== */}
      <Section title="Presen\u00e7a Parlamentar" icon="\u2705" id="presenca">
        <PresencaSection colecao={col} politicoId={id} sessoes={sessoes} />
      </Section>

      {/* ========== PROPOSICOES ========== */}
      <Section title="Proposi\u00e7\u00f5es Legislativas" icon="\ud83d\udcdc" id="projetos">
        <ProjetosSection colecao={col} politicoId={id} />
      </Section>

      {/* ========== GABINETE ========== */}
      {(verbasGabinete.length > 0 || totalVerbasGab > 0) && (
        <Section title="Verba de Gabinete" icon="\ud83d\udc65" id="gabinete">
          <VerbaGabineteSection colecao={col} politicoId={id} verbas={verbasGabinete} />
        </Section>
      )}

      {/* ========== ALERTAS E IRREGULARIDADES ========== */}
      {gastos.length > 0 && (
        <Section title="Alertas e Irregularidades" icon="\u26a0\ufe0f" id="alertas">
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>An\u00e1lise autom\u00e1tica baseada em dados p\u00fablicos da CEAP.</p>
          {Number(concentracao) > 50 && (
            <div style={{ padding: '10px 14px', background: 'rgba(233,69,96,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-red)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-red)' }}>Concentra\u00e7\u00e3o excessiva de fornecedores</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top 3 concentram {concentracao}% dos gastos.</div>
            </div>
          )}
          {catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO') || (cat || '').toUpperCase().includes('AERONAVE')) && (
            <div style={{ padding: '10px 14px', background: 'rgba(233,69,96,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-red)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-red)' }}>Gastos com fretamento a\u00e9reo detectados</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Requer justificativa de economicidade (Ato da Mesa 43/2009).</div>
            </div>
          )}
          {totalGastos > 1000000 && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,193,7,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-gold)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold)' }}>Volume acima de R$ 1 milh\u00e3o</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Gastos de {fmt(totalGastos)} requerem maior escrut\u00ednio.</div>
            </div>
          )}
          {fornSorted.length > 0 && fornSorted[0][1] > 200000 && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,193,7,0.08)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--accent-gold)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-gold)' }}>Fornecedor com recebimento elevado</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{fornSorted[0][0]}: {fmt(fornSorted[0][1])}</div>
            </div>
          )}
          {Number(concentracao) <= 50 && totalGastos <= 1000000 && (!fornSorted.length || fornSorted[0][1] <= 200000) && !catSorted.some(([cat]) => (cat || '').toUpperCase().includes('FRETAMENTO')) && (
            <div style={{ padding: '14px', background: 'rgba(76,202,163,0.08)', borderRadius: 8, textAlign: 'center', color: 'var(--accent-green)', fontWeight: 600 }}>Nenhuma irregularidade autom\u00e1tica detectada</div>
          )}
          <AlertasFretamento gastos={gastos} />
        </Section>
      )}

      {/* ========== NEPOTISMO (feature flag) ========== */}
      {flags.nepotismo && <Section title="An\u00e1lise de Nepotismo" icon="\ud83d\udd0d" id="nepotismo"><NepotismoCard colecao={col} politicoId={id} /></Section>}

      {/* ========== EMENDAS V2 (feature flag) ========== */}
      {flags.emendas && <Section title="Emendas V2" icon="\ud83d\udce6" id="emendasV2"><EmendasAba colecao={col} politicoId={id} /></Section>}

      {/* ========== PREVIA + CTA RELATORIO IA ========== */}
      <div style={{ background: 'linear-gradient(135deg, rgba(76,202,163,0.1) 0%, rgba(255,193,7,0.08) 100%)', borderRadius: 16, padding: '28px 24px', marginBottom: 20, border: '2px solid var(--accent-green)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--accent-green)', fontWeight: 700, marginBottom: 8 }}>Relat\u00f3rio IA TransparenciaBR</div>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>An\u00e1lise completa com intelig\u00eancia artificial</h3>

        {/* Preview bullets */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>\u2022 Cruzamento de {gastos.length} notas fiscais com {Object.keys(porFornecedor).length} fornecedores</div>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>\u2022 Concentra\u00e7\u00e3o de {concentracao}% nos top 3 fornecedores {Number(concentracao) > 50 ? '\u26a0\ufe0f' : '\u2705'}</div>
          <div style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>\u2022 An\u00e1lise de {emendasTotal} emendas parlamentares</div>
        </div>

        {/* Blurred preview */}
        {!analysis && (
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              Foram identificados padr\u00f5es de concentra\u00e7\u00e3o em fornecedores espec\u00edficos que merecem aten\u00e7\u00e3o. A an\u00e1lise cruzada dos dados da CEAP com o portal da transpar\u00eancia revela inconsist\u00eancias nos valores declarados...
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ background: 'var(--accent-green)', color: '#fff', padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14 }}>\ud83d\udd12 Conte\u00fado Premium</span>
            </div>
          </div>
        )}

        {analysis ? (
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{analysis}</div>
        ) : (
          <button onClick={runAI} disabled={analyzing} style={{ width: '100%', padding: '14px 24px', borderRadius: 10, border: 'none', background: 'var(--accent-green)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: analyzing ? 'wait' : 'pointer' }}>
            {analyzing ? 'Analisando...' : '\ud83e\udd16 Gerar Relat\u00f3rio IA Completo'}
          </button>
        )}
      </div>

      {/* ========== DENUNCIA ========== */}
      <Section title="A\u00e7\u00f5es de Fiscaliza\u00e7\u00e3o" icon="\ud83d\udce3" id="denuncia">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={gerarRelatorioDenuncia} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--accent-green)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Copiar Relat\u00f3rio</button>
          <a href="https://falabr.cgu.gov.br" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--accent-red)', color: 'var(--accent-red)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>Denunciar CGU</a>
          <a href="https://www.mpf.mp.br/servicos/sac" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>MPF</a>
          <a href="https://portal.tcu.gov.br/ouvidoria/" target="_blank" rel="noreferrer" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border-light)', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600, display: 'inline-block' }}>TCU</a>
        </div>
      </Section>

    </div>
  );
}
