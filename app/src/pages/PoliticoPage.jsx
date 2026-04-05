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
import EncaminhamentoEmendas from "../components/EncaminhamentoEmendas";
import useFeatureFlags from "../hooks/useFeatureFlags";
import ScorePilaresCard from "../components/ScorePilaresCard";

function fmt(v) {
  const n = Number(v || 0);
  return "R$ " + n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseMoneyFlexible(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v
      .replace(/\s/g, "")
      .replace(/^R\$\s?/, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseBRL(v) {
  return parseMoneyFlexible(v);
}

function riskBadge(score) {
  if (!score || score < 30) return { label: "Baixo risco", cls: "risk-badge-low" };
  if (score < 60) return { label: "Risco médio", cls: "risk-badge-medium" };
  return { label: "Alto risco", cls: "risk-badge-high" };
}

function getVal(g) {
  // Agora ele reconhece o vlrLiquido do BigQuery
  return g.vlrLiquido || g.valorLiquido || g.valor || g.valorDocumento || 0;
}

function getTipo(g) {
  // Agora ele reconhece o txtDescricao do BigQuery
  return g.txtDescricao || g.tipoDespesa || g.tipo || g.descricao || g.categoria || "Outros";
}

function getFornecedor(g) {
  // Agora ele reconhece o txtFornecedor do BigQuery
  return g.txtFornecedor || g.fornecedorNome || g.nomeFornecedor || g.fornecedor || "Desconhecido";
}

function getCnpj(g) {
  return g.txtCNPJCPF || g.cnpjCpf || g.cnpjCpfFornecedor || g.cnpj || "";
}

function simpleMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/### (.*)/g, "\n\n### $1\n\n")
    .replace(/## (.*)/g, "\n\n$1\n--\n\n")
    .replace(/\*\*(.*?)\*\*/g, "**$1**")
    .replace(/^\* (.*)/gm, "*   $1\n")
    .replace(/---/g, "\n\n* * *\n\n")
    .replace(/\n/g, "  \n");
}

function normalizarTexto(v) {
  return String(v || "").trim();
}

function extrairMunicipioEmenda(e) {
  return (
    normalizarTexto(e.municipioNome) ||
    normalizarTexto(e.municipio) ||
    normalizarTexto(e.localidade) ||
    "N/A"
  );
}

function extrairUfEmenda(e) {
  const uf =
    normalizarTexto(e.uf) ||
    normalizarTexto(e.uf_destino) ||
    normalizarTexto(e.autorUf);

  if (/^[A-Z]{2}$/.test(uf)) return uf;

  const localidade = normalizarTexto(e.localidade).toUpperCase();

  const matchParen = localidade.match(/\(([A-Z]{2})\)$/);
  if (matchParen) return matchParen[1];

  const matchDash = localidade.match(/[-–]\s*([A-Z]{2})$/);
  if (matchDash) return matchDash[1];

  if (localidade.endsWith("(UF)")) return "";

  return uf;
}

function extrairDescricaoEmenda(e) {
  return (
    normalizarTexto(e.objetoResumo) ||
    normalizarTexto(e.beneficiario) ||
    normalizarTexto(e.nome_recebedor) ||
    normalizarTexto(e.nomeRecebedor) ||
    normalizarTexto(e.programa) ||
    normalizarTexto(e.tipo) ||
    normalizarTexto(e.tipoEmenda) ||
    "Sem descrição"
  );
}

function montarUrlPortalEmenda(e, nomeAutor = "") {
  if (e.urlPortal) return e.urlPortal;
  if (e.url_portal) return e.url_portal;

  const base = "https://portaldatransparencia.gov.br/emendas/consulta";
  const params = new URLSearchParams({
    de: "01/01/2023",
    ate: "31/12/2026"
  });

  const codigo =
    normalizarTexto(e.codigo) ||
    normalizarTexto(e.codigo_emenda) ||
    normalizarTexto(e.codigoEmenda);

  const autor =
    normalizarTexto(e.autorNome) ||
    normalizarTexto(nomeAutor);

  if (autor) params.set("autor", autor);
  if (codigo) params.set("codigoEmenda", codigo);

  return `${base}?${params.toString()}`;
}

/* === SECTION WRAPPER === */
function Section({ title, icon, children, id }) {
  return (
    <section
      id={id}
      style={{
        marginBottom: 28,
        scrollMarginTop: 100,
        background: "var(--bg-card)",
        border: "1px solid var(--border-light)",
        borderRadius: 18,
        padding: 20,
      }}
    >
      {title && (
        <h2
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "0 0 14px 0",
            fontSize: 20,
            fontWeight: 800,
            color: "var(--text-primary)"
          }}
        >
          {icon && <span>{icon}</span>}
          <span>{title}</span>
        </h2>
      )}
      {children}
    </section>
  );
}

export default function PoliticoPage({ user }) {
  const { colecao, id } = useParams();
  const [pol, setPol] = useState(null);
  const [gastos, setGastos] = useState([]); // Vamos manter o nome 'gastos' para não quebrar os componentes abaixo
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
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "auto";
    };
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let nomeDoPolitico = ""; // Criamos a variável para guardar o nome com segurança

      const snap = await getDoc(doc(db, col, id));
      if (snap.exists()) {
        const data = snap.data();
        nomeDoPolitico = data.nome; // Salvamos o nome antes de chamar o BigQuery
        setPol({ id: snap.id, ...data });
        if (data.analise) setAnalysis(data.analise);
      }

      // Chamando nossa ponte do BigQuery (Agora com o nome correto)
      if (nomeDoPolitico) {
        try {
          const getAuditoria = httpsCallable(functions, "getAuditoriaPolitico");
          const result = await getAuditoria({ 
            nome: nomeDoPolitico, 
            ano: 2024 
          });

          if (result.data && result.data.despesas) {
            setGastos(result.data.despesas); // Popula os gráficos com os dados limpos
          }
        } catch (auditError) {
          console.error("Erro na auditoria BigQuery:", auditError);
        }
      }

      const eSnap = await getDocs(
        query(collection(db, "emendas"), where("parlamentarId", "==", id))
      );
      const eSubSnap = await getDocs(collection(db, col, id, "emendas"));
      const eMerged = [
        ...eSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ...eSubSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      ];
      setEmendas(eMerged);

      try {
        const sSnap = await getDocs(collection(db, col, id, "sessoes"));
        setSessoes(sSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.log("Sessões não disponíveis");
      }

      try {
        const vSnap = await getDocs(collection(db, col, id, "verbas_gabinete"));
        setVerbasGabinete(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.log("Verbas gabinete não disponíveis");
      }

      setLoading(false);
    }

    load();
  }, [col, id]);

  const totalGastos = gastos.reduce((a, g) => a + getVal(g), 0);
  const totalEmendas = emendas.reduce(
    (a, e) => a + parseMoneyFlexible(e.valorEmpenhado || e.valor_empenhado || e.valorPago || e.valor),
    0
  );
  const totalVerbasGab = verbasGabinete.reduce(
    (a, v) => a + (v.valor || v.remuneracao || 0),
    0
  );

  const porCategoria = {};
  gastos.forEach((g) => {
    const cat = getTipo(g);
    porCategoria[cat] = (porCategoria[cat] || 0) + getVal(g);
  });

  const catSorted = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]);
  const porFornecedor = {};
  gastos.forEach((g) => {
    const f = getFornecedor(g);
    porFornecedor[f] = (porFornecedor[f] || 0) + getVal(g);
  });

  const fornSorted = Object.entries(porFornecedor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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
    if (
      catSorted.some(
        ([cat]) =>
          (cat || "").toUpperCase().includes("FRETAMENTO") ||
          (cat || "").toUpperCase().includes("AERONAVE")
      )
    ) s += 20;
    if (gastos.length > 300) s += 5;
    return Math.min(s, 100);
  })();

  const emendasResumo = pol?.emendasResumo || {};
  const emendasTotal = emendasResumo.total || emendas.length || 0;

  const emendasPorTipo = {};
  const emendasPorAno = {};
  const emendasPorDestino = {};
  const emendasPorBeneficiario = {};

  emendas.forEach((e) => {
    const tipo = e.tipoEmenda || e.tipo_emenda || e.tipo || "Não informado";
    const ano = e.ano || "N/A";
    const destino =
      e.localidade || e.municipioNome || e.municipio || e.uf_destino || e.uf || "Não informado";
    const benef =
      e.beneficiario || e.nome_recebedor || e.nomeRecebedor || "Não informado";
    const val = parseMoneyFlexible(e.valorEmpenhado || e.valor_empenhado || e.valor);

    emendasPorTipo[tipo] = (emendasPorTipo[tipo] || 0) + val;
    emendasPorAno[ano] = (emendasPorAno[ano] || 0) + val;
    emendasPorDestino[destino] = (emendasPorDestino[destino] || 0) + val;
    emendasPorBeneficiario[benef] = (emendasPorBeneficiario[benef] || 0) + val;
  });

  const tipoEmendasSorted = Object.entries(emendasPorTipo).sort((a, b) => b[1] - a[1]);
  const anoEmendasSorted = Object.entries(emendasPorAno).sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );
  const destinosSorted = Object.entries(emendasPorDestino)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const beneficiariosSorted = Object.entries(emendasPorBeneficiario)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  function gerarRelatorioDenuncia() {
    const achados = [];
    if (Number(concentracao) > 50) {
      achados.push(
        "- CONCENTRAÇÃO DE FORNECEDORES: Top 3 fornecedores concentram " +
          concentracao +
          "% dos gastos totais."
      );
    }
    if (
      catSorted.some(
        ([cat]) =>
          (cat || "").toUpperCase().includes("FRETAMENTO") ||
          (cat || "").toUpperCase().includes("AERONAVE")
      )
    ) achados.push("- FRETAMENTO DE AERONAVES detectado.");
    if (totalGastos > 1000000) achados.push("- VOLUME ELEVADO: " + fmt(totalGastos) + " na CEAP.");
    if (fornSorted.length > 0 && fornSorted[0][1] > 200000) {
      achados.push("- FORNECEDOR ELEVADO: " + fornSorted[0][0] + " recebeu " + fmt(fornSorted[0][1]));
    }

    const texto = `RELATÓRIO DE FISCALIZAÇÃO PARLAMENTAR
Gerado por: TransparenciaBR
Data: ${new Date().toLocaleDateString("pt-BR")}

PARLAMENTAR: ${pol.nome}
PARTIDO/UF: ${pol.partido || pol.siglaPartido} - ${pol.uf || pol.estado || pol.siglaUf}
CARGO: ${pol.cargo || "Deputado Federal"}

RESUMO FINANCEIRO:
- Gastos totais (CEAP): ${fmt(totalGastos)}
- Notas fiscais: ${gastos.length}
- Fornecedores: ${Object.keys(porFornecedor).length}
- Concentração top 3: ${concentracao}%

ACHADOS:
${achados.length > 0 ? achados.join("\n") : "- Nenhuma irregularidade automática detectada."}

TOP 5 FORNECEDORES:
${fornSorted
  .slice(0, 5)
  .map((f, i) => `${i + 1}. ${f[0]} - ${fmt(f[1])}`)
  .join("\n")}`;

    navigator.clipboard
      .writeText(texto)
      .then(() => alert("Relatório copiado!"))
      .catch(() => {
        const w = window.open("", "_blank");
        w.document.write(`<pre>${texto}</pre>`);
      });
  }

  async function runAI() {
    setAnalyzing(true);
    try {
      const functions = getFunctions(undefined, "southamerica-east1");
      const analyze = httpsCallable(functions, "analyzePolitician");
      const result = await analyze({ deputadoId: id, colecao: col });
      setAnalysis(result.data.analysis);
    } catch (e) {
      setAnalysis("Erro na análise: " + e.message);
    }
    setAnalyzing(false);
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Carregando dossiê...</div>;
  }

  if (!pol) {
    return <div style={{ padding: 24 }}>Político não encontrado.</div>;
  }

  const risk = riskBadge(calcScore);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 48px" }}>
      <section
        style={{
          display: "grid",
          gap: 16,
          marginBottom: 24,
          padding: 24,
          borderRadius: 20,
          background: "var(--bg-card)",
          border: "1px solid var(--border-light)"
        }}
      >
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={pol.fotoUrl || pol.urlFoto || "/placeholder-avatar.png"}
            alt={pol.nome}
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid var(--border-light)"
            }}
            onError={(e) => {
              e.target.src = "/placeholder-avatar.png";
            }}
          />

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
              Dossiê Parlamentar
            </div>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: "var(--text-primary)" }}>
              {pol.nome}
            </h1>
            <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>
              {pol.partido || pol.siglaPartido} — {pol.uf || pol.estado || pol.siglaUf} ·{" "}
              {pol.cargo || "Deputado Federal"}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              {calcScore != null && (
                <span className={risk.cls} style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-light)"
                }}>
                  Score {calcScore} · {risk.label}
                </span>
              )}
              {Number(concentracao) > 70 && (
                <span style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  background: "rgba(255,193,7,0.12)",
                  border: "1px solid rgba(255,193,7,0.35)"
                }}>
                  Alta concentração fornecedores
                </span>
              )}
              <a
                href={`https://www.camara.leg.br/deputados/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontWeight: 700,
                  textDecoration: "none",
                  color: "var(--accent-green)",
                  border: "1px solid var(--border-light)"
                }}
              >
                Perfil oficial ↗
              </a>
            </div>
          </div>
        </div>

        {pol.scorePilares && <ScorePilaresCard scorePilares={pol.scorePilares} />}
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24
        }}
      >
        {[
          { label: "Gastos CEAP", value: fmt(totalGastos), link: "#gastos" },
          { label: "Emendas", value: emendasTotal > 0 ? fmt(totalEmendas) : "0", link: "#emendas" },
          { label: "Notas fiscais", value: gastos.length, link: "#gastos" },
          {
            label: "Presença Plenário",
            value: (pol.presencaPct || pol.presenca || "-") + "%",
            link: "#presenca"
          },
          { label: "Gastos Gabinete", value: fmt(totalVerbasGab), link: "#gabinete" }
        ].map((c, i) => (
          <a
            key={i}
            href={c.link}
            style={{
              textDecoration: "none",
              color: "inherit",
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
              borderRadius: 18,
              padding: 18,
              display: "block"
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
              {c.value}
            </div>
            <div style={{ marginTop: 6, color: "var(--text-secondary)", fontSize: 14 }}>
              {c.label}
            </div>
          </a>
        ))}
      </section>

      {pol.indice_transparenciabr && (
        <Section title="Índice TransparenciaBR" icon="📊">
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {pol.indice_transparenciabr}/100
          </div>
          {pol.presencaClassificacao && (
            <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>
              {pol.presencaClassificacao}
            </div>
          )}
        </Section>
      )}

      {gastos.length > 0 && (
        <Section title="Alertas automáticos" icon="🚨">
          <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
            Análise automática baseada em dados públicos da CEAP.
          </p>

          <div style={{ display: "grid", gap: 10 }}>
            {Number(concentracao) > 50 && (
              <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-elevated)" }}>
                <strong>Concentração excessiva de fornecedores</strong>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  Top 3 concentram {concentracao}% dos gastos totais.
                </div>
              </div>
            )}

            {catSorted.some(
              ([cat]) =>
                (cat || "").toUpperCase().includes("FRETAMENTO") ||
                (cat || "").toUpperCase().includes("AERONAVE")
            ) && (
              <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-elevated)" }}>
                <strong>Gastos com fretamento aéreo detectados</strong>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  Requer justificativa de economicidade.
                </div>
              </div>
            )}

            {totalGastos > 1000000 && (
              <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-elevated)" }}>
                <strong>Volume acima de R$ 1 milhão</strong>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  Gastos de {fmt(totalGastos)} requerem maior escrutínio.
                </div>
              </div>
            )}

            {fornSorted.length > 0 && fornSorted[0][1] > 200000 && (
              <div style={{ padding: 14, borderRadius: 12, background: "var(--bg-elevated)" }}>
                <strong>Fornecedor com recebimento elevado</strong>
                <div style={{ marginTop: 4, color: "var(--text-secondary)" }}>
                  {fornSorted[0][0]}: {fmt(fornSorted[0][1])}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Relatório IA TransparenciaBR" icon="🤖">
        <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>
          Análise completa com inteligência artificial.
        </p>
        <ul style={{ color: "var(--text-secondary)" }}>
          <li>Cruzamento de {gastos.length} notas fiscais com {Object.keys(porFornecedor).length} fornecedores</li>
          <li>Concentração de {concentracao}% nos top 3 fornecedores</li>
          <li>Análise de {emendasTotal} emendas parlamentares</li>
        </ul>

        {!analysis && (
          <div style={{ marginBottom: 16, color: "var(--text-secondary)" }}>
            Foram identificados padrões de concentração em fornecedores específicos que merecem atenção.
          </div>
        )}

        {analysis ? (
          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-light)",
              borderRadius: 12,
              padding: 16,
              color: "var(--text-primary)"
            }}
          >
            {simpleMarkdown(analysis)}
          </pre>
        ) : (
          <button
            onClick={runAI}
            disabled={analyzing}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-light)",
              background: "var(--accent-green)",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            {analyzing ? "Analisando dados..." : "🤖 Gerar Relatório IA Completo"}
          </button>
        )}
      </Section>

      <Section title="Encaminhamento" icon="📣">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={gerarRelatorioDenuncia}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--border-light)",
              background: "var(--bg-elevated)",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            Copiar Relatório
          </button>
          <a href="https://falabr.cgu.gov.br" target="_blank" rel="noopener noreferrer">Denunciar CGU</a>
          <a href="https://www.mpf.mp.br/servicos/sac" target="_blank" rel="noopener noreferrer">MPF</a>
          <a href="https://portal.tcu.gov.br/ouvidoria/" target="_blank" rel="noopener noreferrer">TCU</a>
        </div>
      </Section>

      {catSorted.length > 0 && (
        <Section title="Categorias de gasto" icon="💳" id="gastos">
          <GastosChart data={catSorted.slice(0, 8)} />
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {catSorted.slice(0, 8).map(([cat, val]) => (
              <div key={cat} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{cat}</span>
                <strong>{fmt(val)}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}

      {fornSorted.length > 0 && (
        <Section title="Maiores fornecedores" icon="🏢">
          <div style={{ display: "grid", gap: 8 }}>
            {fornSorted.map(([f, val], i) => (
              <div
                key={f}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--bg-elevated)",
                  borderRadius: 10
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{f}</div>
                  {i < 3 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>TOP {i + 1}</div>
                  )}
                </div>
                <strong>{fmt(val)}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}

      {(emendas.length > 0 || emendasTotal > 0) &&
        (tipoEmendasSorted.length > 0 || anoEmendasSorted.length > 0) && (
          <Section title="Distribuição das emendas" icon="🧩">
            {tipoEmendasSorted.length > 0 && (
              <>
                <h4>Por Tipo de Emenda</h4>
                <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                  {tipoEmendasSorted.map(([tipo, val]) => (
                    <div key={tipo} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{tipo}</span>
                      <strong>{fmt(val)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}

            {anoEmendasSorted.length > 0 && (
              <>
                <h4>Por Ano</h4>
                <div style={{ display: "grid", gap: 8 }}>
                  {anoEmendasSorted.map(([ano, val]) => (
                    <div key={ano} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{ano}</span>
                      <strong>{fmt(val)}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Section>
        )}

      {destinosSorted.length > 0 && (
        <Section title="Destinos principais" icon="📍">
          <div style={{ display: "grid", gap: 8 }}>
            {destinosSorted.map(([destino, val], i) => (
              <div
                key={destino}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--bg-elevated)",
                  borderRadius: 10
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{destino}</div>
                  {i < 3 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>TOP {i + 1}</div>
                  )}
                </div>
                <strong>{fmt(val)}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}

      {beneficiariosSorted.length > 0 && (
        <Section title="Maiores beneficiários" icon="🏥">
          <div style={{ display: "grid", gap: 8 }}>
            {beneficiariosSorted.map(([benef, val], i) => (
              <div
                key={benef}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--bg-elevated)",
                  borderRadius: 10
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{benef}</div>
                  {i < 3 && (
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>TOP {i + 1}</div>
                  )}
                </div>
                <strong>{fmt(val)}</strong>
              </div>
            ))}
          </div>
        </Section>
      )}

      {gastos.length > 0 && (
        <Section title="Gastos detalhados" icon="🧾" id="gastos-detalhados">
          {(showAllGastos ? gastos : gastos.slice(0, 20)).map((g) => (
            <div
              key={g.id}
              onClick={() => {
                const url = g.urlDocumento || g.url;
                if (url) window.open(url, "_blank");
              }}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 14px",
                background: "var(--bg-elevated)",
                borderRadius: 8,
                marginBottom: 6,
                cursor: g.urlDocumento || g.url ? "pointer" : "default",
                border: "1px solid transparent"
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{getTipo(g)}</div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  {getFornecedor(g)} {getCnpj(g) ? "| " + getCnpj(g) : ""}{" "}
                  {g.dataDocumento ? "| " + g.dataDocumento.substring(0, 10) : ""}
                </div>
              </div>
              <strong>{fmt(getVal(g))}</strong>
            </div>
          ))}

          {gastos.length > 20 && !showAllGastos && (
            <button
              onClick={() => setShowAllGastos(true)}
              style={{
                width: "100%",
                padding: 12,
                marginTop: 8,
                border: "1px solid var(--accent-green)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--accent-green)",
                cursor: "pointer",
                fontWeight: 600
              }}
            >
              Ver todos os {gastos.length} gastos
            </button>
          )}
        </Section>
      )}

      <Section title={`Emendas Parlamentares (${emendasTotal})`} icon="📝" id="emendas">
        {emendas.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {emendas
              .slice()
              .sort((a, b) => {
                const anoA = Number(a.ano || 0);
                const anoB = Number(b.ano || 0);
                if (anoA !== anoB) return anoB - anoA;

                const valA = parseMoneyFlexible(
                  a.valorEmpenhado || a.valor_empenhado || a.valorPago || a.valor
                );
                const valB = parseMoneyFlexible(
                  b.valorEmpenhado || b.valor_empenhado || b.valorPago || b.valor
                );
                return valB - valA;
              })
              .slice(0, 15)
              .map((e) => {
                const municipio = extrairMunicipioEmenda(e);
                const uf = extrairUfEmenda(e);
                const descricao = extrairDescricaoEmenda(e);
                const valor = parseMoneyFlexible(
                  e.valorEmpenhado || e.valor_empenhado || e.valorPago || e.valor
                );
                const urlPortal = montarUrlPortalEmenda(e, pol?.nome);
                const ano = e.ano || "";
                const tipo = e.tipo || e.tipoEmenda || "";
                const codigo = e.codigo || e.codigo_emenda || "";

                return (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      alignItems: "flex-start",
                      padding: "14px 16px",
                      background: "var(--bg-elevated)",
                      borderRadius: 10,
                      border: "1px solid var(--border-light)"
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--text-primary)",
                          marginBottom: 4
                        }}
                      >
                        {municipio}
                        {uf ? ` - ${uf}` : ""}
                      </div>

                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          lineHeight: 1.45,
                          marginBottom: 6
                        }}
                      >
                        {descricao}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          fontSize: 12,
                          color: "var(--text-muted)"
                        }}
                      >
                        {ano ? <span>Ano: {ano}</span> : null}
                        {tipo ? <span>Tipo: {tipo}</span> : null}
                        {codigo ? <span>Código: {codigo}</span> : null}
                      </div>

                      {urlPortal ? (
                        <div style={{ marginTop: 8 }}>
                          <a
                            href={urlPortal}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--accent-green)",
                              textDecoration: "none",
                              fontSize: 13,
                              fontWeight: 600
                            }}
                          >
                            Ver no Portal ↗
                          </a>
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        whiteSpace: "nowrap",
                        fontWeight: 700,
                        color: "var(--text-primary)"
                      }}
                    >
                      {fmt(valor)}
                    </div>
                  </div>
                );
              })}
          </div>
        ) : emendasTotal > 0 ? (
          <div style={{ color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: 10 }}>
              {emendasTotal} emendas registradas no Portal da Transparência.
            </p>
            <a
              href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "none" }}
            >
              Consultar no Portal da Transparência ↗
            </a>
          </div>
        ) : (
          <div style={{ color: "var(--text-secondary)" }}>
            <p style={{ marginBottom: 10 }}>Nenhuma emenda encontrada.</p>
            <a
              href={`https://portaldatransparencia.gov.br/emendas/consulta?de=01%2F01%2F2023&ate=31%2F12%2F2026&autor=${encodeURIComponent(pol.nome)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-green)", fontWeight: 600, textDecoration: "none" }}
            >
              Consultar Portal da Transparência ↗
            </a>
          </div>
        )}
      </Section>

      <Section title="Presença" icon="🏛️" id="presenca">
        <PresencaSection politico={pol} colecao={col} politicoId={id} />
      </Section>

      <Section title="Encaminhamento das Emendas" icon="📨">
        <EncaminhamentoEmendas politico={pol} emendas={emendas} />
      </Section>

      <Section title="Proposições" icon="📚">
        <ProjetosSection deputadoId={id} colecao={col} />
      </Section>

      {(verbasGabinete.length > 0 || totalVerbasGab > 0) && (
        <Section title="Gabinete" icon="🏢" id="gabinete">
          <VerbaGabineteSection verbas={verbasGabinete} politico={pol} />
        </Section>
      )}

      {flags.nepotismo && (
        <Section title="Nepotismo" icon="🧬">
          <NepotismoCard politico={pol} />
        </Section>
      )}

      {flags.emendas && (
        <Section title="Emendas Avançadas" icon="🗂️">
          <EmendasAba politico={pol} emendas={emendas} />
        </Section>
      )}

      {gastos.length > 0 && (
        <Section title="Alertas de fretamento" icon="✈️">
          <AlertasFretamento gastos={gastos} politico={pol} />
        </Section>
      )}

      <div style={{ marginTop: 24 }}>
        <Link to="/" style={{ color: "var(--accent-green)", textDecoration: "none", fontWeight: 700 }}>
          ← Voltar
        </Link>
      </div>
    </div>
  );
}
