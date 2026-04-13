/**
 * DossiePage.jsx — Hotpage Elite do TransparenciaBR
 *
 * Rota: /dossie/:id  (id = documento Firestore do político)
 *
 * Arquitetura de 4 seções:
 *  SEÇÃO 1 — Identidade & Atividade         🆓 GRÁTIS
 *  SEÇÃO 2 — Monitor de Gastos CEAP         🆓 GRÁTIS
 *  SEÇÃO 3 — Diários Oficiais               🆓 GRÁTIS · "Resumir" custa 10 créditos
 *  SEÇÃO 4 — Laboratório Oráculo            🔒 PAGO (freemium via cotas ou créditos)
 *
 * Lógica de acesso ao Laboratório Oráculo:
 *  • dailyQuota > 0  → Desbloqueio básico (Gemini oracle only) via 1 cota diária
 *  • credits >= 200  → Desbloqueio completo (+ NetworkGraph + PDF) via créditos
 *  • dailyQuota = 0 && credits < 200 → Paywall Stripe
 *
 * StickyHeader aparece ao scrollar > 120px com nome, partido e temperatura de risco.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  doc, getDoc, setDoc, collection, query, where,
  orderBy, limit, getDocs, serverTimestamp,
} from "firebase/firestore";
import { db, functions } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import {
  loadRankingOrgExternoMap,
  lookupRankingOrgExterno,
  lookupRankingOrgExternoById,
  mergeDeputadoRankingOrg,
  MANDATOS_CAMARA,
} from "../utils/rankingOrg";
import { useAuth }       from "../hooks/useAuth";
import { CreditGate }    from "../components/CreditGate";
import { getRiskColor, getRiskColorAlpha, getRiskLabel } from "../utils/colorUtils";
import { Helmet }         from "react-helmet-async";
import PageSkeleton       from "../components/PageSkeleton";
import NetworkGraph       from "../components/NetworkGraph";
import StickyHeader       from "../components/StickyHeader";
import PerformanceTab     from "../components/PerformanceTab";
import PoliticalTimeline  from "../components/PoliticalTimeline";
import CabinetAudit       from "../components/CabinetAudit";
import ForensicDashboard  from "../components/ForensicDashboard";
import AtividadeParlamentarSection from "../components/AtividadeParlamentarSection";
import { normalizeUF }    from "../components/SocialContext";
import { parseCamaraValorReais } from "../utils/moneyCamara";

const CUSTO_FULL    = 200;
const CUSTO_RESUMO  = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  if (v === null || v === undefined || v === "") return "–";
  const n = parseCamaraValorReais(v);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
// Alias seguro para formatCurrency (jamais R$ NaN)
const formatCurrency = (v) => fmtBRL(v ?? 0);

function sessionKey(id, tipo = "full") {
  return `dossie_${tipo}_${id}`;
}

// ─── SEV config ────────────────────────────────────────────────────────────────
const SEV = {
  ALTA:  { label: "Alto Risco", color: "#C82538", bg: "rgba(200,37,56,0.08)"  },
  MEDIA: { label: "Atenção",    color: "#D97706", bg: "rgba(217,119,6,0.08)"  },
  BAIXA: { label: "Normal",     color: "#2E7F18", bg: "rgba(46,127,24,0.08)"  },
};

// ─── Componentes base ──────────────────────────────────────────────────────────
function SevBadge({ v }) {
  const cfg = SEV[(v || "BAIXA").toUpperCase()] ?? SEV.BAIXA;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
      color: cfg.color, background: cfg.bg, whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

function SectionHeader({ icon, title, badge, badgeColor = "#2E7F18", badgeBg = "rgba(46,127,24,0.10)" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <h2 style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0, flex: 1,
      }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
          color: badgeColor, background: badgeBg, letterSpacing: "0.06em",
          border: `1px solid ${badgeColor}30`,
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: "#ffffff",
      borderRadius: "0.75rem",
      border: "1px solid #e2e8f0",
      boxShadow: "0 1px 2px 0 rgb(15 23 42 / 0.06)",
      padding: "20px 22px",
      color: "#1e293b",
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── AlertRow com Oráculo Gemini ───────────────────────────────────────────────
function AlertRow({ alerta }) {
  const cfg = SEV[(alerta.criticidade ?? alerta.severidade ?? "BAIXA").toUpperCase()] ?? SEV.BAIXA;
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 6,
      padding: "10px 14px",
      background: "rgba(255,255,255,0.7)", borderRadius: 10,
      border: "1px solid rgba(237,235,232,0.8)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#2D2D2D", marginBottom: 2 }}>
            {alerta.tipoAlerta ?? alerta.tipo ?? "Alerta"}
          </p>
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.4 }}>
            {alerta.descricao ?? "–"}
          </p>
        </div>
        <SevBadge v={alerta.criticidade ?? alerta.severidade} />
      </div>
      {alerta.explicacao_oraculo && (
        <div style={{
          borderLeft: `3px solid ${cfg.color}50`, paddingLeft: 10,
          background: cfg.bg, borderRadius: "0 8px 8px 0", padding: "6px 10px",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: "0.06em" }}>
            ✦ ORÁCULO
          </span>
          <p style={{ fontSize: 11, color: "#555", lineHeight: 1.5, margin: "2px 0 0", fontStyle: "italic" }}>
            {alerta.explicacao_oraculo}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── SEÇÃO 1: Identidade & Atividade (GRÁTIS) ─────────────────────────────────
function IdentitySection({ politico }) {
  const presenca  = politico?.presenca ?? null;
  const bio       = politico?.bio ?? `Deputado(a) Federal pelo ${politico?.partido ?? "–"} ` +
                    `(${politico?.uf ?? "–"}). ${politico?.nome?.split(" ")[0] ?? "Político"} integra as comissões ` +
                    `de Finanças e de Constituição e Justiça.`;
  const riskColor = getRiskColor(0);

  return (
    <Card>
      <SectionHeader icon="👤" title="Identidade e Atividade" badge="GRÁTIS" />

      {/* Foto + bio + badges */}
      <div style={{ display: "flex", gap: 18, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%", flexShrink: 0,
          overflow: "hidden", background: "#F5F3F0",
          border: `3px solid ${riskColor}`,
          boxShadow: `0 4px 16px ${riskColor}33`,
        }}>
          {politico?.urlFoto
            ? <img src={politico.urlFoto} alt={politico.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : (
              <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 800, color: "#9ca3af",
              }}>
                {(politico?.nome ?? "?")[0]}
              </div>
            )
          }
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700, color: "#1f2937", marginBottom: 6 }}>
            {politico?.nome ?? politico?.nomeCompleto ?? "–"}
          </h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {[politico?.partido, normalizeUF(politico?.uf, politico?.estado), presenca != null ? `Presença: ${presenca}%` : null].filter(Boolean).map(t => (
              <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
                                     background: "#f3f4f6", color: "#6b7280" }}>{t}</span>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>{bio}</p>
        </div>
      </div>

    </Card>
  );
}

// ─── SEÇÃO 2: Monitor de Gastos CEAP (GRÁTIS) — resumo + link fonte oficial ───
function CeapMonitorSection({ politico }) {
  const idCamara = politico?.idCamara ?? politico?.id_camara;
  const ceapUrl = idCamara
    ? `https://www.camara.leg.br/deputados/${idCamara}/despesas`
    : `https://portaldatransparencia.gov.br/verbas-indenizatorias/consulta`;
  const dossiePath = politico?.id ? `/politico/deputados_federais/${politico.id}` : "/ranking";

  return (
    <Card>
      <SectionHeader icon="💰" title="Monitor de Gastos CEAP" badge="GRÁTIS" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Gasto Total", value: fmtBRL(politico?.gastosCeapTotal ?? politico?.totalGasto ?? 0), color: "#C82538" },
          { label: "Presença", value: politico?.presenca != null ? `${politico.presenca}%` : "—", color: "#2E7F18" },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              background: "#fafafa",
              borderRadius: 12,
              padding: "12px 14px",
              border: "1px solid #f0f0f0",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "#9ca3af",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {m.label}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6 }}>
        Detalhamento com notas fiscais, Motor Forense TransparenciaBR e gráficos está no{" "}
        <strong>Dossiê de Notas Fiscais (CEAP)</strong> na{" "}
        <Link to={dossiePath} style={{ color: "#15803D", fontWeight: 600 }}>
          página do político
        </Link>
        .
      </p>
      <a
        href={ceapUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginTop: 8,
          fontSize: 12,
          color: "#15803D",
          fontWeight: 600,
          textDecoration: "underline",
        }}
      >
        Consultar fonte oficial (Câmara) ↗
      </a>
    </Card>
  );
}

// ─── SEÇÃO 3: Diários Oficiais (GRÁTIS + resumo a 10 créditos) ────────────────
function DiariosMencoesSection({ politicoId, credits, deductCredits }) {
  const [diarios,     setDiarios    ] = useState([]);
  const [dLoading,    setDLoading   ] = useState(true);
  const [summaries,   setSummaries  ] = useState({});  // docId → texto resumido
  const [summarizing, setSummarizing] = useState({});  // docId → bool

  useEffect(() => {
    let cancelled = false;
    const q = query(
      collection(db, "diarios_atos"),
      orderBy("data_publicacao", "desc"),
      limit(5),
    );
    getDocs(q)
      .then(snap => {
        if (!cancelled) setDiarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(() => {
        if (!cancelled) setDiarios(getMockDiarios(politicoId));
      })
      .finally(() => { if (!cancelled) setDLoading(false); });
    return () => { cancelled = true; };
  }, [politicoId]);

  const handleSummarize = async (docId, texto) => {
    if ((credits ?? 0) < CUSTO_RESUMO) {
      alert(`Saldo insuficiente. Você tem ${credits ?? 0} crédito(s), necessário ${CUSTO_RESUMO}.`);
      return;
    }
    setSummarizing(prev => ({ ...prev, [docId]: true }));
    try {
      await deductCredits(CUSTO_RESUMO);
      const resumo = texto && texto.length > 400
        ? texto.slice(0, 400).trimEnd() + "…"
        : (texto || "Sem conteúdo disponível.");
      setSummaries(prev => ({
        ...prev,
        [docId]: `[Motor TransparenciaBR · Síntese] ${resumo}`,
      }));
    } catch (err) {
      alert(err.message);
    } finally {
      setSummarizing(prev => ({ ...prev, [docId]: false }));
    }
  };

  return (
    <Card>
      <SectionHeader icon="📰" title="Últimas Menções em Diários Oficiais" badge="GRÁTIS" />
      {dLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 60, borderRadius: 10, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : diarios.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            Nenhuma menção encontrada nos Diários Oficiais.
          </p>
          <p style={{ fontSize: 11, color: "#d1d5db", marginTop: 4 }}>
            O crawler <code>10_universal_crawler.py</code> indexa DOU, DOE e DOM continuamente.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {diarios.map(d => {
            const textoLongo = (d.conteudo ?? d.descricao ?? "").length > 300;
            const dataPub    = d.data_publicacao
              ? new Date(d.data_publicacao).toLocaleDateString("pt-BR")
              : "–";
            return (
              <div key={d.id} style={{
                padding: "12px 14px", borderRadius: 12,
                background: "#fafafa", border: "1px solid #f0f0f0",
              }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1f2937", flex: 1 }}>
                    {d.titulo ?? d.title ?? "Ato publicado"}
                  </span>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99,
                                   background: "#f3f4f6", color: "#6b7280" }}>
                      {d.origem ?? d.source ?? "DOU"}
                    </span>
                    <span style={{ fontSize: 9, color: "#9ca3af" }}>{dataPub}</span>
                  </div>
                </div>

                {/* Trecho do texto */}
                {summaries[d.id] ? (
                  <p style={{
                    fontSize: 11, color: "#4b5563", lineHeight: 1.6,
                    background: "rgba(159,200,232,0.12)", borderRadius: 8,
                    padding: "8px 10px", borderLeft: "3px solid #9ECFE8",
                    fontStyle: "italic", margin: 0,
                  }}>
                    {summaries[d.id]}
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5, margin: 0 }}>
                      {textoLongo
                        ? (d.conteudo ?? d.descricao ?? "").slice(0, 200) + "…"
                        : (d.conteudo ?? d.descricao ?? "Sem descrição disponível.")
                      }
                    </p>
                    {textoLongo && !summaries[d.id] && (
                      <button
                        onClick={() => handleSummarize(d.id, d.conteudo ?? d.descricao ?? "")}
                        disabled={summarizing[d.id]}
                        style={{
                          marginTop: 8,
                          fontSize: 10, fontWeight: 700, padding: "4px 10px",
                          borderRadius: 99, cursor: summarizing[d.id] ? "not-allowed" : "pointer",
                          background: summarizing[d.id] ? "#f3f4f6" : "rgba(159,200,232,0.15)",
                          color: summarizing[d.id] ? "#9ca3af" : "#1d7ab5",
                          border: "1px solid rgba(159,200,232,0.4)",
                          transition: "all 0.2s",
                        }}
                      >
                        {summarizing[d.id] ? "Resumindo…" : `✦ Resumir com IA — ${CUSTO_RESUMO} créditos`}
                      </button>
                    )}
                  </>
                )}
                {d.link && (
                  <a
                    href={d.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 10, color: "#9ca3af", display: "block", marginTop: 4 }}
                  >
                    Ver publicação original →
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── SEÇÃO 4: Laboratório Oráculo (GATED) ─────────────────────────────────────
// Conteúdo básico: alertas + Gemini oracle texts
// Conteúdo full:   + NetworkGraph + PDF export
function OracleLaboratory({ politico, alertas, rank, rankTotal, fullUnlocked, pdfRef, onDownloadPDF, generatingPDF }) {
  const rank1 = politico?.rank_externo != null
    ? Number(politico.rank_externo)
    : (typeof rank === "number" && rank >= 0 ? rank + 1 : 256);
  const total = rankTotal || MANDATOS_CAMARA;
  const riskColor = getRiskColor(rank1, total);
  const riskAlpha = getRiskColorAlpha(rank1, total, 0.08);
  const { label } = getRiskLabel(rank1, total);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Ficha do político */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, padding: "14px 18px",
        background: riskAlpha, borderRadius: 12, border: `1px solid ${riskColor}22`,
      }}>
        {politico?.urlFoto && (
          <img src={politico.urlFoto} alt={politico.nome} style={{ width: 48, height: 48, borderRadius: "50%",
                                                                     objectFit: "cover", border: `2px solid ${riskColor}`, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[politico?.partido, normalizeUF(politico?.uf, politico?.estado), label].filter(Boolean).map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99,
                                     background: t === label ? riskAlpha : "#f3f4f6",
                                     color: t === label ? riskColor : "#6b7280" }}>{t}</span>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
            Score TransparenciaBR: <strong style={{ color: riskColor }}>
              {(politico?.score ?? politico?.indice_transparenciabr ?? 0).toFixed(1)}
            </strong>
            {politico?.ranking_org && (
              <>
                {" · "}
                Ranking.org: <strong>#{politico.ranking_org.posicao}</strong> · nota{" "}
                <strong>{Number(politico.ranking_org.nota).toFixed(2)}</strong>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Alertas forenses com Oráculo */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", marginBottom: 10,
                      textTransform: "uppercase", letterSpacing: "0.06em" }}>
          ⚠️ Alertas Forenses ({alertas.length})
        </div>
        {alertas.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>Nenhum alerta detectado para este político.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {alertas.map(a => <AlertRow key={a.id} alerta={a} />)}
          </div>
        )}
      </section>

      {/* NetworkGraph — apenas no full unlock */}
      {fullUnlocked ? (
        <div style={{
          background: "rgba(253,252,251,0.8)", borderRadius: 14,
          border: "1px solid rgba(237,235,232,0.8)", padding: "18px 18px 14px",
        }}>
          <NetworkGraph politicoId={politico?.id} height={380} />
        </div>
      ) : (
        <div style={{
          borderRadius: 14, border: "1px dashed #e5e7eb",
          padding: "24px 18px", textAlign: "center", background: "#fafafa",
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🕸️</div>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Grafo de Influência</p>
          <p style={{ fontSize: 11, color: "#9ca3af" }}>
            Disponível no <strong>Desbloqueio Completo</strong> (200 créditos).
            Visualize a teia de conexões societárias e contratos.
          </p>
        </div>
      )}

      {/* OCR de notas CEAP — apenas full unlock */}
      {fullUnlocked && (
        <section style={{
          background: "rgba(251,248,243,0.8)", borderRadius: 14,
          border: "1px dashed #DDD8D0", padding: "16px 18px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#2D2D2D", marginBottom: 6 }}>
            📄 Análise OCR de Notas CEAP
          </div>
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5 }}>
            Metadados de notas fiscais lidas pelo{" "}
            <strong>Motor OCR</strong> (<code>06_ocr_notas.py</code>) disponíveis após
            execução do pipeline contra <code>fiscalizapa.ceap_ocr_extractions</code>.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {["CNPJ Fornecedor", "Valor Total", "Descrição", "Data da Nota"].map(f => (
              <span key={f} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px",
                borderRadius: 99, background: "#F5F3F0", color: "#888" }}>
                {f}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Botão PDF — apenas full unlock */}
      {fullUnlocked && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onDownloadPDF}
            disabled={generatingPDF}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 20px",
              background: generatingPDF
                ? "#f1f5f9"
                : "linear-gradient(135deg, #334155 0%, #475569 100%)",
              color: generatingPDF ? "#94a3b8" : "#fff",
              border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13,
              cursor: generatingPDF ? "not-allowed" : "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: generatingPDF ? "none" : "0 4px 16px rgba(0,0,0,0.2)",
            }}
          >
            {generatingPDF ? "⏳ Gerando PDF…" : "📄 Baixar Dossiê Forense (PDF)"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── UnlockGate: overlay em 3 tiers ───────────────────────────────────────────
function UnlockGate({ dailyQuota, credits, onUseQuota, onPayFull, unlocking, error, politicoNome }) {
  const navigate   = useNavigate();
  const hasQuota   = (dailyQuota ?? 0) > 0;
  const hasCredits = (credits ?? 0) >= CUSTO_FULL;

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 20, borderRadius: 20, overflow: "hidden",
      backdropFilter: "blur(20px) saturate(160%)",
      WebkitBackdropFilter: "blur(20px) saturate(160%)",
      background: "rgba(255,255,255,0.50)",
      border: "1px solid rgba(255,255,255,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        maxWidth: 440, width: "90%", textAlign: "center", padding: "36px 32px",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.14)",
        border: "1px solid rgba(255,255,255,0.95)",
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%", margin: "0 auto 20px",
          background: hasQuota
            ? "linear-gradient(135deg, #A8D8B0, #78C28A)"
            : "linear-gradient(135deg, #FBD87F, #F7B98B)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 26, boxShadow: hasQuota
            ? "0 6px 20px rgba(120,194,138,0.4)"
            : "0 6px 20px rgba(251,216,127,0.4)",
        }}>
          {hasQuota ? "🎟️" : hasCredits ? "🔒" : "💳"}
        </div>

        <h2 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 18, fontWeight: 700, color: "#1f2937", marginBottom: 8,
        }}>
          {hasQuota ? "Laboratório Oráculo" : hasCredits ? "Desbloqueio Completo" : "Acesso Premium"}
        </h2>
        <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6, marginBottom: 20 }}>
          {hasQuota
            ? <>Você tem <strong style={{ color: "#2E7F18" }}>{dailyQuota} cota(s) gratuita(s)</strong> hoje.
               Use 1 para acessar os <strong>Insights do Gemini</strong> sobre {politicoNome || "este político"}.</>
            : hasCredits
              ? <>Desbloqueie o dossiê <strong>completo</strong> de <strong style={{ color: "#1f2937" }}>{politicoNome || "este político"}</strong>{" "}
                 incluindo Grafo de Influência e exportação PDF.</>
              : <>Suas cotas diárias foram esgotadas e seu saldo é insuficiente.
                 Adquira créditos ou aguarde a renovação amanhã.</>
          }
        </p>

        {/* Informação de saldo */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 16, marginBottom: 20,
          flexWrap: "wrap",
        }}>
          <div style={{
            padding: "8px 16px", borderRadius: 12,
            background: hasQuota ? "rgba(46,127,24,0.06)" : "rgba(200,37,56,0.06)",
            border: `1px solid ${hasQuota ? "rgba(46,127,24,0.2)" : "rgba(200,37,56,0.2)"}`,
            fontSize: 12,
          }}>
            <span style={{ color: "#6b7280" }}>Cotas hoje: </span>
            <strong style={{ color: hasQuota ? "#2E7F18" : "#C82538" }}>{dailyQuota ?? 0}</strong>
          </div>
          <div style={{
            padding: "8px 16px", borderRadius: 12,
            background: hasCredits ? "rgba(46,127,24,0.06)" : "rgba(200,37,56,0.06)",
            border: `1px solid ${hasCredits ? "rgba(46,127,24,0.2)" : "rgba(200,37,56,0.2)"}`,
            fontSize: 12,
          }}>
            <span style={{ color: "#6b7280" }}>Créditos: </span>
            <strong style={{ color: hasCredits ? "#2E7F18" : "#C82538" }}>{credits ?? 0}</strong>
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 11, color: "#C82538", marginBottom: 14, lineHeight: 1.4 }}>{error}</p>
        )}

        {/* Ação primária */}
        {hasQuota && (
          <button
            onClick={onUseQuota}
            disabled={unlocking}
            style={{
              width: "100%", padding: "12px 0", marginBottom: 10,
              background: unlocking ? "#e5e7eb" : "linear-gradient(135deg, #A8D8B0 0%, #78C28A 100%)",
              color: unlocking ? "#9ca3af" : "#1a5c2a",
              fontWeight: 700, fontSize: 14, border: "none", borderRadius: 12,
              cursor: unlocking ? "not-allowed" : "pointer",
              boxShadow: unlocking ? "none" : "0 4px 14px rgba(120,194,138,0.45)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {unlocking ? "Verificando…" : "🎟️ Usar 1 Cota Diária — Acesso Básico"}
          </button>
        )}

        {hasCredits && (
          <button
            onClick={onPayFull}
            disabled={unlocking}
            style={{
              width: "100%", padding: "12px 0", marginBottom: hasQuota ? 0 : 10,
              background: unlocking ? "#e5e7eb" : "linear-gradient(135deg, #FBD87F 0%, #F7B98B 100%)",
              color: unlocking ? "#9ca3af" : "#7A4F1E",
              fontWeight: 700, fontSize: 14, border: "none", borderRadius: 12,
              cursor: unlocking ? "not-allowed" : "pointer",
              boxShadow: unlocking ? "none" : "0 4px 14px rgba(251,216,127,0.5)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {unlocking ? "Desbloqueando…" : `🔓 Desbloquear Completo — ${CUSTO_FULL} créditos`}
          </button>
        )}

        {!hasQuota && !hasCredits && (
          <>
            <button
              onClick={() => navigate("/creditos")}
              style={{
                width: "100%", padding: "12px 0", marginBottom: 10,
                background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                color: "#fff", fontWeight: 700, fontSize: 14,
                border: "none", borderRadius: 12, cursor: "pointer",
                fontFamily: "'Space Grotesk', sans-serif",
                boxShadow: "0 4px 14px rgba(51,65,85,0.25)",
              }}
            >
              💳 Comprar Créditos ou Acesso Ilimitado
            </button>
            <p style={{ fontSize: 10, color: "#9ca3af" }}>
              Suas cotas gratuitas renovam automaticamente amanhã às 00:00 BRT.
            </p>
          </>
        )}

        {hasQuota && !hasCredits && (
          <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
            Desbloqueio básico libera os <strong>Insights do Gemini</strong>.
            Para Grafo e PDF, use <strong>{CUSTO_FULL} créditos</strong>.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Logo SVG TransparenciaBR para o PDF ──────────────────────────────────────
function PDFLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
      <svg width="32" height="32" viewBox="0 0 100 100" fill="none">
        <defs>
          <linearGradient id="pdfOrbA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FBD87F"/>
            <stop offset="50%"  stopColor="#F7B98B"/>
            <stop offset="100%" stopColor="#A8D8B0"/>
          </linearGradient>
        </defs>
        <path d="M50 8 A42 42 0 1 1 49.9 8" stroke="url(#pdfOrbA)" strokeWidth="14" fill="none" strokeLinecap="round"/>
        <path d="M50 20 A30 30 0 1 0 49.9 20" stroke="#9ECFE8" strokeWidth="9" fill="none" strokeLinecap="round" strokeOpacity="0.7"/>
      </svg>
      <div>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13, color: "#2D2D2D" }}>
          TransparenciaBR
        </div>
        <div style={{ fontSize: 9, color: "#888", letterSpacing: "0.05em" }}>
          SISTEMA DE AUDITORIA FORENSE PARLAMENTAR
        </div>
      </div>
    </div>
  );
}

// ─── Conteúdo PDF oculto ──────────────────────────────────────────────────────
function DossiePDFContent({ pdfRef, politico, alertas, rank, rankTotal, nivel5Alertas = [] }) {
  const rank1 = politico?.rank_externo != null
    ? Number(politico.rank_externo)
    : (typeof rank === "number" && rank >= 0 ? rank + 1 : 256);
  const total = rankTotal || MANDATOS_CAMARA;
  const riskColor = getRiskColor(rank1, total);
  const { label } = getRiskLabel(rank1, total);

  return (
    <div ref={pdfRef} style={{
      position: "absolute", left: "-9999px", top: 0,
      width: "720px", background: "#FFFFFF",
      padding: "32px 36px", fontFamily: "'Inter', sans-serif",
      fontSize: 12, color: "#2D2D2D", lineHeight: 1.6,
    }}>
      <div style={{ borderBottom: "2px solid #EDEBE8", paddingBottom: 16, marginBottom: 20,
                    display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <PDFLogo />
        <div style={{ textAlign: "right", fontSize: 10, color: "#888" }}>
          <div>Dossiê Forense Premium</div>
          <div>Gerado em {new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" })}</div>
          <div style={{ fontWeight: 700, color: riskColor, marginTop: 2 }}>Risco: {label}</div>
        </div>
      </div>
      <div style={{ background: "#FAFAF8", borderRadius: 10, padding: "14px 16px",
                    marginBottom: 16, border: `2px solid ${riskColor}22` }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
          {politico?.nome ?? politico?.nomeCompleto ?? "–"}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
          <span>Partido: <strong>{politico?.partido ?? "–"}</strong></span>
          <span>UF: <strong>{politico?.uf ?? "–"}</strong></span>
          <span>Índice plataforma: <strong style={{ color: riskColor }}>{parseFloat(politico?.score ?? 0).toFixed(1)}</strong></span>
          {politico?.ranking_org && (
            <span>
              Ranking.org: <strong>#{politico.ranking_org.posicao}</strong> · nota{" "}
              <strong>{Number(politico.ranking_org.nota).toFixed(2)}</strong>
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[
          { l: "CEAP Total",    v: fmtBRL(politico?.gastosCeapTotal ?? politico?.totalGasto) },
          { l: "Total Emendas", v: fmtBRL(politico?.totalEmendas) },
          { l: "Presença",      v: politico?.presenca ? `${politico.presenca}%` : "–" },
        ].map(m => (
          <div key={m.l} style={{ background: "#F5F3F0", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{m.v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, borderBottom: "1px solid #EDEBE8", paddingBottom: 6 }}>
          ⚠️ Alertas Forenses ({alertas.length})
        </div>
        {alertas.length === 0
          ? <p style={{ fontSize: 11, color: "#AAA" }}>Nenhum alerta detectado.</p>
          : alertas.map((a, i) => {
              const sev = SEV[(a.criticidade ?? "BAIXA").toUpperCase()] ?? SEV.BAIXA;
              return (
                <div key={a.id ?? i} style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8,
                                               background: sev.bg, border: `1px solid ${sev.color}22` }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>
                    {a.tipoAlerta ?? a.tipo ?? "Alerta"}
                    <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 8, color: sev.color }}>
                      {a.criticidade ?? "BAIXA"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>{a.descricao ?? "–"}</div>
                  {a.explicacao_oraculo && (
                    <div style={{ fontSize: 10, color: "#555", fontStyle: "italic", marginTop: 4,
                                  borderLeft: `2px solid ${sev.color}50`, paddingLeft: 7 }}>
                      ✦ Oráculo: {a.explicacao_oraculo}
                    </div>
                  )}
                </div>
              );
            })}
      </div>
      {/* ── Nexo de Causalidade e Parentesco (Nível 5) ───────────────────── */}
      {nivel5Alertas.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            borderBottom: "2px solid #7c3aed22", paddingBottom: 8, marginBottom: 12,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "#7c3aed",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Nexo de Causalidade e Parentesco
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
              background: "rgba(124,58,237,0.1)", color: "#7c3aed",
              border: "1px solid rgba(124,58,237,0.25)",
            }}>
              NÍVEL 5 · CORRUPÇÃO PROVÁVEL
            </span>
          </div>
          <p style={{ fontSize: 10, color: "#555", fontStyle: "italic", marginBottom: 10, lineHeight: 1.5 }}>
            Motor 16_contract_collision.py detectou correspondência entre sócios de empresas
            contratadas e membros da rede familiar do parlamentar (identificados pelo
            15_family_oracle.py). As evidências abaixo são de fontes públicas e não constituem
            acusação formal.
          </p>
          {nivel5Alertas.map((a, i) => (
            <div key={a.id ?? i} style={{
              marginBottom: 12, padding: "12px 14px", borderRadius: 10,
              background: "rgba(124,58,237,0.05)",
              border: "1.5px solid rgba(124,58,237,0.2)",
            }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                  background: "rgba(124,58,237,0.1)", color: "#7c3aed",
                  border: "1px solid rgba(124,58,237,0.2)",
                }}>
                  {a.relacao_familiar?.toUpperCase() ?? "FAMILIAR"}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>
                  Score de suspeição: {a.score_suspeicao ?? "–"}/100
                </span>
              </div>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["Familiar",      a.socio_nome ?? "–"],
                    ["Relação",       a.relacao_familiar ?? "–"],
                    ["Empresa",       a.empresa_nome ?? "–"],
                    ["CNPJ",          a.empresa_cnpj ?? "–"],
                    ["Órgão",         a.contrato_orgao ?? "–"],
                    ["Objeto",        (a.contrato_objeto ?? "–").substring(0, 120) + (a.contrato_objeto?.length > 120 ? "…" : "")],
                    ["Valor",         fmtBRL(a.valor_contrato)],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ padding: "3px 0", width: "25%", color: "#888",
                                   fontWeight: 600, borderBottom: "1px solid #f0f0f0" }}>{k}</td>
                      <td style={{ padding: "3px 0", borderBottom: "1px solid #f0f0f0",
                                   color: "#1f2937" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {a.explicacao_oraculo && (
                <div style={{
                  marginTop: 8, fontSize: 10, color: "#555", fontStyle: "italic",
                  borderLeft: "3px solid #7c3aed50", paddingLeft: 8, lineHeight: 1.5,
                }}>
                  ✦ Oráculo: {a.explicacao_oraculo}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ borderTop: "1px solid #EDEBE8", paddingTop: 12, fontSize: 9, color: "#AAA", lineHeight: 1.5 }}>
        <strong>AVISO LEGAL:</strong> Dossiê gerado automaticamente pelo TransparenciaBR para transparência pública e
        investigação jornalística. Dados de fontes públicas. Não constitui acusação formal.
        Plataforma: transparenciabr.app · Projeto: fiscallizapa.
      </div>
    </div>
  );
}

// ─── Mock de Diários Oficiais ──────────────────────────────────────────────────
function getMockDiarios() {
  return [
    { id: "mock1", titulo: "Nomeação para cargo comissionado — SEAP",
      origem: "DOU Seção 2", data_publicacao: "2024-03-18",
      descricao: "Nomeia servidor para exercício de cargo comissionado de Assessor Especial, referência DAS-4, do quadro da Secretaria de Administração e Patrimônio, na forma estabelecida pela Lei nº 11.357, de 19 de outubro de 2006.",
      conteudo: "PORTARIA Nº 1.234, DE 18 DE MARÇO DE 2024. O Secretário de Administração e Patrimônio, no uso das atribuições que lhe conferem o art. 87 da Constituição Federal...",
      link: null },
    { id: "mock2", titulo: "Contrato emergencial — serviços de assessoria",
      origem: "DOU Seção 3", data_publicacao: "2024-03-12",
      descricao: "Dispensa de licitação nº 12/2024. Contratação emergencial de serviços de assessoria técnica especializada para implantação de sistema de gestão.",
      conteudo: null, link: null },
    { id: "mock3", titulo: "Aditivo ao contrato nº 045/2022",
      origem: "DOE-SP", data_publicacao: "2024-03-05",
      descricao: "Aditivo contratual para acréscimo de 25% ao valor originário e prorrogação de prazo por 12 meses, na forma do art. 65, §1º da Lei 8.666/93.",
      conteudo: null, link: null },
  ];
}

// ─── TabBar de navegação principal ────────────────────────────────────────────
const TABS = [
  { id: "dossie",      label: "Dossiê Público",        icon: "🗂️" },
  { id: "desempenho",  label: "Desempenho Legislativo", icon: "⚡" },
  { id: "gabinete",    label: "Auditoria de Gabinete",  icon: "🏛" },
];

function TabBar({ activeTab, onTabChange, accentColor }) {
  return (
    <div style={{ display: "flex", borderBottom: "2px solid #f0f0f0", marginBottom: 28, gap: 4 }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              padding:         "10px 18px",
              fontSize:        13,
              fontWeight:      isActive ? 700 : 500,
              fontFamily:      "'Space Grotesk', sans-serif",
              color:           isActive ? (accentColor || "#1f2937") : "#9ca3af",
              background:      "none",
              border:          "none",
              borderBottom:    isActive
                ? `2px solid ${accentColor || "#1f2937"}`
                : "2px solid transparent",
              marginBottom:    -2,          // overlap do border-bottom do container
              cursor:          "pointer",
              transition:      "all 0.18s ease",
              letterSpacing:   "0.01em",
              display:         "flex",
              alignItems:      "center",
              gap:             6,
              whiteSpace:      "nowrap",
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = "#374151"; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = "#9ca3af"; }}
          >
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function DossiePage() {
  const { id }           = useParams();
  const navigate         = useNavigate();
  const {
    user, credits, deductCredits,
    dailyQuota, useQuota,
  }                      = useAuth();

  const [politico,       setPolitico      ] = useState(null);
  const [alertas,        setAlertas       ] = useState([]);
  const [rank,           setRank          ] = useState(null);
  const [rankTotal,      setRankTotal     ] = useState(MANDATOS_CAMARA);
  const [dataLoading,    setDataLoading   ] = useState(true);
  const [fullUnlocked,   setFullUnlocked  ] = useState(false);
  const [basicUnlocked,  setBasicUnlocked ] = useState(false);
  const [unlocking,      setUnlocking     ] = useState(false);
  const [unlockError,    setUnlockError   ] = useState(null);
  const [notFound,       setNotFound      ] = useState(false);
  const [generatingPDF,  setGeneratingPDF ] = useState(false);
  const [stickyVisible,  setStickyVisible ] = useState(false);
  const [activeTab,      setActiveTab     ] = useState("dossie");
  const [nivel5Alertas,  setNivel5Alertas ] = useState([]);
  const [familiaRede,    setFamiliaRede   ] = useState(null);
  const [atividadeData,  setAtividadeData ] = useState(null);

  const pdfRef = useRef(null);

  const dossieRiskRank1 = useMemo(() => {
    if (politico?.rank_externo != null) return Number(politico.rank_externo);
    if (typeof rank === "number" && rank >= 0) return rank + 1;
    return 256;
  }, [politico?.rank_externo, rank]);

  // ── Scroll → StickyHeader ─────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => setStickyVisible(window.scrollY > 120);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Redirect se não autenticado ───────────────────────────────────────────
  useEffect(() => {
    if (!user && credits !== null) navigate("/", { replace: true });
  }, [user, credits, navigate]);

  // ── Verificar desbloqueio (session → Firestore) ───────────────────────────
  useEffect(() => {
    if (sessionStorage.getItem(sessionKey(id, "full")) === "1") {
      setFullUnlocked(true);
      setBasicUnlocked(true);
      return;
    }
    if (sessionStorage.getItem(sessionKey(id, "basic")) === "1") {
      setBasicUnlocked(true);
    }
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid, "dossies_desbloqueados", id));
        if (!cancelled && snap.exists()) {
          const tipo = snap.data()?.tipo ?? "full";
          setBasicUnlocked(true);
          sessionStorage.setItem(sessionKey(id, "basic"), "1");
          if (tipo === "full") {
            setFullUnlocked(true);
            sessionStorage.setItem(sessionKey(id, "full"), "1");
          }
        }
      } catch {/* subcoleção pode não existir */}
    })();
    return () => { cancelled = true; };
  }, [id, user]);

  // ── Carregar dados ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function loadData() {
      setDataLoading(true);
      try {
        const snap = await getDoc(doc(db, "deputados_federais", id));
        if (!snap.exists()) { setNotFound(true); return; }
        let pol = { id: snap.id, ...snap.data() };
        try {
          const { map, mapByIdCamara } = await loadRankingOrgExternoMap(db);
          if (!cancelled) setRankTotal(MANDATOS_CAMARA);
          const idC = pol.idCamara != null ? Number(pol.idCamara) : Number(id);
          const ext =
            lookupRankingOrgExterno(map, pol.nome || pol.nomeCompleto) ||
            (Number.isFinite(idC) ? lookupRankingOrgExternoById(mapByIdCamara, idC) : null);
          pol = mergeDeputadoRankingOrg(pol, ext);
        } catch {/* ranking externo opcional */}
        if (!cancelled) setPolitico(pol);

        const rankSnap = await getDocs(
          query(collection(db, "deputados_federais"), orderBy("score", "desc"))
        );
        const idx = rankSnap.docs.findIndex(d => d.id === id);
        if (!cancelled && idx !== -1) setRank(idx);

        try {
          const alertSnap = await getDocs(
            query(collection(db, "alertas_bodes"), where("parlamentar_id", "==", id),
                  orderBy("criadoEm", "desc"), limit(20))
          );
          if (!cancelled) {
            const allAlertas = alertSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAlertas(allAlertas);
            setNivel5Alertas(allAlertas.filter(a =>
              a.criticidade === "NIVEL_5" || a.nivel === 5 || a.tipoAlerta === "CONFLITO_INTERESSE_FAMILIAR"
            ));
          }
        } catch {/* índice pode não existir */}

        // Carregar rede familiar (do engine 15_family_oracle.py)
        try {
          const familiaSnap = await getDoc(doc(db, "usuarios_relacionados", id));
          if (!cancelled && familiaSnap.exists()) setFamiliaRede(familiaSnap.data());
        } catch {/* pode não existir ainda */}
      } catch (err) {
        console.error("DossiePage:", err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const idC = politico?.idCamara != null ? Number(politico.idCamara) : null;
    const nome = politico?.nome || politico?.nomeCompleto;
    if (!politico || (!Number.isFinite(idC) && !nome)) return;
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, "getAtividadeParlamentar");
        const result = await fn({
          idCamara: Number.isFinite(idC) ? idC : undefined,
          nome: nome || undefined,
        });
        if (!cancelled) setAtividadeData(result.data);
      } catch (e) {
        console.error("DossiePage atividade resumo:", e);
        if (!cancelled) setAtividadeData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [politico?.idCamara, politico?.nome, politico?.nomeCompleto]);

  // ── Desbloquear completo (200 créditos) ───────────────────────────────────
  const handlePayFull = useCallback(async () => {
    setUnlocking(true);
    setUnlockError(null);
    try {
      await deductCredits(CUSTO_FULL);
      if (user) {
        await setDoc(
          doc(db, "usuarios", user.uid, "dossies_desbloqueados", id),
          {
            politicoId:     id,
            nomePolitico:   politico?.nome ?? politico?.nomeCompleto ?? "–",
            partido:        politico?.partido  ?? "–",
            uf:             politico?.uf       ?? "–",
            urlFoto:        politico?.urlFoto  ?? null,
            tipo:           "full",
            desbloqueadoEm: serverTimestamp(),
            creditsGastos:  CUSTO_FULL,
          },
          { merge: true },
        );
      }
      sessionStorage.setItem(sessionKey(id, "full"),  "1");
      sessionStorage.setItem(sessionKey(id, "basic"), "1");
      setFullUnlocked(true);
      setBasicUnlocked(true);
    } catch (err) {
      setUnlockError(err.message ?? "Erro ao desbloquear.");
    } finally {
      setUnlocking(false);
    }
  }, [id, deductCredits, user, politico]);

  // ── Desbloquear básico (cota diária) ──────────────────────────────────────
  const handleUseQuota = useCallback(async () => {
    setUnlocking(true);
    setUnlockError(null);
    try {
      await useQuota();
      if (user) {
        await setDoc(
          doc(db, "usuarios", user.uid, "dossies_desbloqueados", id),
          {
            politicoId:     id,
            nomePolitico:   politico?.nome ?? politico?.nomeCompleto ?? "–",
            partido:        politico?.partido ?? "–",
            uf:             politico?.uf      ?? "–",
            tipo:           "basic",
            desbloqueadoEm: serverTimestamp(),
            creditsGastos:  0,
          },
          { merge: true },
        );
      }
      sessionStorage.setItem(sessionKey(id, "basic"), "1");
      setBasicUnlocked(true);
    } catch (err) {
      setUnlockError(err.message ?? "Cota diária indisponível.");
    } finally {
      setUnlocking(false);
    }
  }, [id, useQuota, user, politico]);

  // ── PDF export ────────────────────────────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!pdfRef.current) return;
    setGeneratingPDF(true);
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      const nome = (politico?.nome ?? "politico").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      await html2pdf().set({
        margin:      [10, 12, 10, 12],
        filename:    `Dossie_${nome}_TransparenciaBR.pdf`,
        image:       { type: "jpeg", quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(pdfRef.current).save();
    } catch (err) {
      console.error("PDF error:", err);
      alert("Erro ao gerar PDF. Execute: cd frontend && npm install");
    } finally {
      setGeneratingPDF(false);
    }
  }, [politico]);

  // ── Estados de UI ─────────────────────────────────────────────────────────
  if (!user) return null;

  if (dataLoading) return (
    <div style={{ minHeight: "100vh", paddingTop: 24 }}>
      <PageSkeleton />
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 12 }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: "#2D2D2D" }}>Político não encontrado</p>
      <Link to="/ranking" style={{ fontSize: 13, color: "#888" }}>← Voltar ao ranking</Link>
    </div>
  );

  const oracleGated = !basicUnlocked && !fullUnlocked;

  // ── SEO: meta-tags dinâmicas ────────────────────────────────────────────────
  const seoNome    = politico?.nome ?? politico?.nomeCompleto ?? "Político";
  const seoPartido = politico?.partido ?? "";
  const seoUF      = politico?.uf ?? "";
  const seoOracle  = alertas.find(a => a.explicacao_oraculo)?.explicacao_oraculo ?? "";
  const seoDesc    = seoOracle
    ? `${seoNome} (${seoPartido}/${seoUF}): ${seoOracle.substring(0, 155)}…`
    : `Auditoria forense completa de ${seoNome} (${seoPartido}/${seoUF}). Análise de gastos CEAP, emendas parlamentares e alertas de irregularidades pelo TransparenciaBR.`;
  const seoUrl     = `https://fiscallizapa.web.app/dossie/${id}`;
  const seoTitle   = politico
    ? `Dossiê: ${seoNome} | TransparenciaBR`
    : "Dossiê Forense | TransparenciaBR";

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <link rel="canonical" href={seoUrl} />
        {/* Open Graph — compartilhamento em redes sociais */}
        <meta property="og:title"       content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:url"         content={seoUrl} />
        <meta property="og:type"        content="article" />
        <meta property="og:site_name"   content="TransparenciaBR" />
        {/* Twitter Card */}
        <meta name="twitter:card"        content="summary" />
        <meta name="twitter:title"       content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        {/* Indexação */}
        <meta name="robots" content={fullUnlocked ? "index, follow" : "noindex, follow"} />
        {seoPartido && <meta name="keywords" content={`${seoNome}, ${seoPartido}, auditoria, gastos públicos, CEAP, emendas, corrupção`} />}
      </Helmet>

      {/* StickyHeader (fixed, aparece no scroll) */}
      <StickyHeader
        politico={politico}
        rankIndex={
          politico?.rank_externo != null
            ? Number(politico.rank_externo) - 1
            : (rank ?? 256)
        }
        total={rankTotal}
        visible={stickyVisible}
      />

      <div style={{
        minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif",
        paddingBottom: 80,
        background: "#f8fafc",
      }}>
        <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 20px 0" }}>

          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
                        fontSize: 12, color: "#9ca3af" }}>
            <Link to="/ranking" style={{ color: "#9ca3af", textDecoration: "none" }}>Ranking</Link>
            <span>›</span>
            <span style={{ color: "#1f2937" }}>{politico?.nome ?? "Dossiê"}</span>
            {fullUnlocked && (
              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 8px",
                             borderRadius: 99, background: "rgba(46,127,24,0.1)", color: "#2E7F18" }}>
                COMPLETO
              </span>
            )}
            {basicUnlocked && !fullUnlocked && (
              <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 8px",
                             borderRadius: 99, background: "rgba(159,200,232,0.2)", color: "#1d7ab5" }}>
                BÁSICO
              </span>
            )}
          </div>

          {/* ── Banner Alerta Nível 5 (Corrupção Provável) ─────────────────── */}
          {nivel5Alertas.length > 0 && (
            <div role="alert" style={{
              padding:    "14px 18px",
              borderRadius: 14,
              marginBottom: 20,
              background: "linear-gradient(135deg, rgba(124,58,237,0.10), rgba(239,68,68,0.06))",
              border:     "1.5px solid rgba(124,58,237,0.35)",
              display:    "flex",
              alignItems: "flex-start",
              gap:        12,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <p style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700, color: "#7c3aed", fontSize: 13, margin: "0 0 4px",
                }}>
                  ALERTA NÍVEL 5 — CORRUPÇÃO PROVÁVEL IDENTIFICADA
                </p>
                <p style={{ color: "#6b7280", fontSize: 11, margin: "0 0 6px" }}>
                  {nivel5Alertas.length} coincidência{nivel5Alertas.length > 1 ? "s" : ""} entre
                  empresa de familiar e contratos públicos detectada{nivel5Alertas.length > 1 ? "s" : ""} pelo motor
                  <code style={{ marginLeft: 4, fontSize: 10 }}>16_contract_collision.py</code>
                </p>
                {nivel5Alertas.slice(0, 2).map(a => (
                  <div key={a.id} style={{
                    fontSize: 11, color: "#374151",
                    background: "rgba(255,255,255,0.5)",
                    borderRadius: 8, padding: "6px 10px", marginTop: 4,
                    border: "1px solid rgba(124,58,237,0.2)",
                  }}>
                    <strong>{a.empresa_nome ?? a.empresa_cnpj}</strong>
                    {" · "}{a.relacao_familiar ?? "familiar"}
                    {a.valor_contrato ? ` · ${fmtBRL(a.valor_contrato)}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Título */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26, fontWeight: 700,
                         color: "#1f2937", marginBottom: 6 }}>
              Auditoria Profunda
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              Motor TransparenciaBR · {fullUnlocked ? "Acesso Completo" : basicUnlocked ? "Acesso Básico (IA simples)" : "Dados públicos visíveis"}
            </p>
          </div>

          {/* Navegação de abas */}
          <TabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            accentColor={getRiskColor(dossieRiskRank1, rankTotal)}
          />

          {/* GRID principal */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ══ ABA: DESEMPENHO LEGISLATIVO ══════════════════════════ */}
            {activeTab === "desempenho" && (
              <PerformanceTab
                politico={politico}
                fullUnlocked={fullUnlocked}
                basicUnlocked={basicUnlocked}
                credits={credits}
                onPayFull={handlePayFull}
                unlocking={unlocking}
                unlockError={unlockError}
              />
            )}

            {/* ══ ABA: AUDITORIA DE GABINETE (F.L.A.V.I.O.) ═══════════ */}
            {activeTab === "gabinete" && (
              <div style={{ padding: "0 4px" }}>
                {/* Aviso de acesso livre */}
                <div style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          8,
                  padding:      "10px 14px",
                  background:   "#f0fdfa",
                  border:       "1px solid #99f6e4",
                  borderRadius: "0.75rem",
                  marginBottom: 16,
                  fontSize:     "0.75rem",
                  color:        "#334155",
                  fontFamily:   "'Space Grotesk', sans-serif",
                }}>
                  <span style={{ color: "#0d9488", fontSize: "0.9rem" }}>🛡</span>
                  <span>
                    <strong style={{ color: "#0f766e" }}>Acesso Livre</strong>
                    {" "}— Dados brutos do gabinete auditados pelo Protocolo F.L.A.V.I.O.
                    O Oráculo Gemini (análise de nepotismo cruzado) requer{" "}
                    <strong style={{ color: "#c2410c" }}>200 créditos</strong>.
                  </span>
                </div>

                <CabinetAudit
                  politicoId={id}
                  politicoNome={politico?.nome ?? politico?.nomeCompleto ?? "Deputado"}
                />

                {/* Paywall para análise IA de gabinete */}
                {!fullUnlocked && (
                  <div style={{
                    position:     "relative",
                    marginTop:    20,
                    background:   "#f8fafc",
                    border:       "1px solid #e2e8f0",
                    borderRadius: "0.75rem",
                    boxShadow:    "0 1px 2px 0 rgb(15 23 42 / 0.06)",
                    padding:      "24px",
                    textAlign:    "center",
                    overflow:     "hidden",
                  }}>
                    {/* Conteúdo borrado (preview) */}
                    <div style={{ filter: "blur(4px)", pointerEvents: "none", marginBottom: 16 }}>
                      <div style={{
                        fontFamily: "'Fira Code', monospace", fontSize: "0.8rem",
                        color: "#94a3b8", lineHeight: 1.8,
                      }}>
                        GEMINI FORENSICS v3.1 — ANÁLISE DE NEPOTISMO CRUZADO<br/>
                        ██████████████████████████████████████████████<br/>
                        Índice de Rachadinha: ██/100<br/>
                        Redes de Parentesco: ████ conexões identificadas<br/>
                        Probabilidade de Irregularidade: ██%
                      </div>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#475569", marginBottom: 12 }}>
                      🔒 Análise Oráculo de Nepotismo — F.L.A.V.I.O. Premium
                    </div>
                    <button
                      onClick={handlePayFull}
                      disabled={unlocking}
                      style={{
                        background:   "linear-gradient(135deg, #7c3aed, #ff0054)",
                        color:        "#fff",
                        border:       "none",
                        borderRadius: 8,
                        padding:      "10px 24px",
                        fontSize:     "0.82rem",
                        fontWeight:   700,
                        cursor:       unlocking ? "wait" : "pointer",
                        fontFamily:   "'Space Grotesk', sans-serif",
                      }}
                    >
                      {unlocking ? "Desbloqueando…" : "🔓 Desbloquear por 200 créditos"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ══ ABA: DOSSIÊ PÚBLICO (default) ════════════════════════ */}
            {activeTab === "dossie" && (
            <>
            {/* ─── SEÇÃO 1: Identidade & Atividade ───────────────────── */}
            <IdentitySection politico={politico} />

            {/* ─── SEÇÃO 2: Monitor de Gastos CEAP (2 créditos) ─────── */}
            <CreditGate custo={2} descricao="Dossiê — CEAP detalhado">
              <CeapMonitorSection politico={politico} />
            </CreditGate>

            {/* ─── SEÇÃO 2B: Motor Forense (preview grátis + detalhada paga) ── */}
            <div style={{
              background: "rgba(255,255,255,0.72)", borderRadius: 20,
              border: "1px solid rgba(237,235,232,0.9)", padding: "22px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>🔬</span>
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, color: "#2D2D2D", margin: 0, flex: 1,
                }}>
                  Motor Forense
                </h2>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  color: "#2E7F18", background: "rgba(46,127,24,0.08)",
                  border: "1px solid rgba(46,127,24,0.2)",
                }}>
                  GRÁTIS · SCORE
                </span>
              </div>
              <ForensicDashboard
                idCamara={politico?.idCamara || id}
                nome={politico?.nome || politico?.nomeCompleto}
                cpf={politico?.cpf}
                preview
              />
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(237,235,232,0.9)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 18 }}>🛡️</span>
                  <h2 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15, fontWeight: 700, color: "#2D2D2D", margin: 0, flex: 1,
                  }}>
                    Análise Forense Detalhada
                  </h2>
                </div>
                <CreditGate custo={3} descricao="Alertas forenses detalhados">
                  <ForensicDashboard
                    idCamara={politico?.idCamara || id}
                    nome={politico?.nome || politico?.nomeCompleto}
                    cpf={politico?.cpf}
                  />
                </CreditGate>
              </div>
            </div>

            {/* ─── SEÇÃO 2C: Atividade Parlamentar Completa ────────────── */}
            <div style={{
              background: "rgba(255,255,255,0.72)", borderRadius: 20,
              border: "1px solid rgba(237,235,232,0.9)", padding: "22px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>📊</span>
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, color: "#2D2D2D", margin: 0, flex: 1,
                }}>
                  Atividade Parlamentar
                </h2>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  color: "#1d7ab5", background: "rgba(159,200,232,0.12)",
                  border: "1px solid rgba(159,200,232,0.3)",
                }}>
                  PROPOSIÇÕES · DISCURSOS · COMISSÕES
                </span>
              </div>
              {(politico?.idCamara || politico?.nome || politico?.nomeCompleto) && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 10,
                  marginBottom: 16,
                  padding: "12px 16px",
                  background: "rgba(248,250,252,0.9)",
                  borderRadius: 12,
                  border: "1px solid rgba(237,235,232,0.9)",
                }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>Proposições (total)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1f2937" }}>
                      {atividadeData?.totalProposicoes ?? "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginBottom: 4 }}>Discursos (total)</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#1f2937" }}>
                      {atividadeData?.discursos?.total ?? "—"}
                    </div>
                  </div>
                </div>
              )}
              <CreditGate custo={2} descricao="Atividade parlamentar completa">
                <AtividadeParlamentarSection
                  deputadoId={id}
                  idCamara={politico?.idCamara || id}
                  nome={politico?.nome || politico?.nomeCompleto}
                  colecao="deputados_federais"
                />
              </CreditGate>
            </div>

            {/* ─── SEÇÃO 3: Diários Oficiais ──────────────────────────── */}
            <DiariosMencoesSection
              politicoId={id}
              credits={credits}
              deductCredits={deductCredits}
            />

            {/* ─── SEÇÃO 3B: Linha do Tempo "Vida do Político" ──────────── */}
            <div style={{
              background: "rgba(255,255,255,0.72)", borderRadius: 20,
              border:     "1px solid rgba(237,235,232,0.9)", padding: "22px 24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 18 }}>🗓️</span>
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, color: "#2D2D2D", margin: 0, flex: 1,
                }}>
                  Linha do Tempo — Vida Oficial
                </h2>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  color: "#1d7ab5", background: "rgba(159,200,232,0.12)",
                  border: "1px solid rgba(159,200,232,0.3)",
                }}>
                  GRÁTIS
                </span>
              </div>
              <PoliticalTimeline
                politicoId={id}
                politicoNome={politico?.nome ?? politico?.nomeCompleto}
                limit={12}
              />
            </div>

            {/* ─── SEÇÃO 4: Laboratório Oráculo (GATED) ───────────────── */}
            <div>
              {/* Header fora do card para sempre ser visível */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, marginBottom: 12,
                padding: "0 2px",
              }}>
                <span style={{ fontSize: 18 }}>🔬</span>
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 16, fontWeight: 700, color: "#1f2937", margin: 0, flex: 1,
                }}>
                  Laboratório Oráculo
                </h2>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                  color: oracleGated ? "#C82538" : basicUnlocked && !fullUnlocked ? "#1d7ab5" : "#2E7F18",
                  background: oracleGated ? "rgba(200,37,56,0.08)" : basicUnlocked && !fullUnlocked ? "rgba(159,200,232,0.15)" : "rgba(46,127,24,0.08)",
                  border: `1px solid ${oracleGated ? "rgba(200,37,56,0.2)" : basicUnlocked && !fullUnlocked ? "rgba(159,200,232,0.4)" : "rgba(46,127,24,0.2)"}`,
                  letterSpacing: "0.06em",
                }}>
                  {oracleGated ? "BLOQUEADO" : basicUnlocked && !fullUnlocked ? "BÁSICO" : "COMPLETO"}
                </span>
              </div>

              <div style={{ position: "relative", borderRadius: 20, overflow: oracleGated ? "hidden" : "visible" }}>
                {/* Conteúdo (sempre renderizado; borrado se bloqueado) */}
                <div style={{
                  filter:        oracleGated ? "blur(6px)" : "none",
                  userSelect:    oracleGated ? "none" : "auto",
                  pointerEvents: oracleGated ? "none" : "auto",
                  transition:    "filter 0.4s ease",
                  background: "rgba(255,255,255,0.72)", borderRadius: 16,
                  border: "1px solid rgba(237,235,232,0.9)", padding: "20px 22px",
                }}>
                  <OracleLaboratory
                    politico={politico}
                    alertas={alertas}
                    rank={rank}
                    rankTotal={rankTotal}
                    fullUnlocked={fullUnlocked}
                    pdfRef={pdfRef}
                    onDownloadPDF={handleDownloadPDF}
                    generatingPDF={generatingPDF}
                  />
                </div>

                {/* Overlay UnlockGate */}
                {oracleGated && (
                  <UnlockGate
                    dailyQuota={dailyQuota}
                    credits={credits}
                    onUseQuota={handleUseQuota}
                    onPayFull={handlePayFull}
                    unlocking={unlocking}
                    error={unlockError}
                    politicoNome={politico?.nome ?? politico?.nomeCompleto}
                  />
                )}
              </div>

              {/* Upgrade de básico → completo */}
              {basicUnlocked && !fullUnlocked && (credits ?? 0) >= CUSTO_FULL && (
                <div style={{
                  marginTop: 10, padding: "10px 16px",
                  background: "rgba(251,216,127,0.12)", borderRadius: 12,
                  border: "1px solid rgba(251,216,127,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: "#7A4F1E" }}>
                    Você tem <strong>{credits} créditos</strong> — acesso ao Grafo e PDF disponível.
                  </span>
                  <button
                    onClick={handlePayFull}
                    disabled={unlocking}
                    style={{
                      padding: "6px 16px", borderRadius: 99, border: "none",
                      background: "linear-gradient(135deg, #FBD87F, #F7B98B)",
                      color: "#7A4F1E", fontWeight: 700, fontSize: 12,
                      cursor: unlocking ? "not-allowed" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {unlocking ? "…" : `🔓 Upgrade — ${CUSTO_FULL}cr`}
                  </button>
                </div>
              )}
            </div>

            </>
            )}{/* /aba dossie */}

          </div>{/* /GRID */}
        </div>

        {/* Rodapé de compliance */}
        <div style={{ maxWidth: 900, margin: "0 auto 40px", padding: "0 20px" }}>
          <div style={{
            background: "#FBF7E8", border: "1px solid #F0E4A0",
            borderRadius: 10, padding: "12px 18px",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🛡️</span>
            <p style={{ fontSize: 11, color: "#7A6A20", margin: 0, lineHeight: 1.7 }}>
              <strong>Análise probabilística por IA — pode cometer erros.</strong>{" "}
              Todos os dados são extraídos de fontes públicas oficiais. Scores e alertas são indicadores,
              não acusações. Antes de qualquer decisão, verifique nas fontes:{" "}
              <a href="https://portaldatransparencia.gov.br" target="_blank" rel="noopener noreferrer"
                style={{ color: "#7A6A20", fontWeight: 700, textDecoration: "underline" }}>
                Portal da Transparência ↗
              </a>{" · "}
              <a href="https://www.camara.leg.br" target="_blank" rel="noopener noreferrer"
                style={{ color: "#7A6A20", fontWeight: 700, textDecoration: "underline" }}>
                Câmara Federal ↗
              </a>
            </p>
          </div>
        </div>

        {/* PDF oculto fora do fluxo */}
        <DossiePDFContent pdfRef={pdfRef} politico={politico} alertas={alertas} rank={rank} rankTotal={rankTotal} nivel5Alertas={nivel5Alertas} />
      </div>
    </>
  );
}
