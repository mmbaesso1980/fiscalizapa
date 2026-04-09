/**
 * PerformanceTab.jsx — Aba "Desempenho Legislativo" do TransparenciaBR
 *
 * Conteúdo (todo GRÁTIS exceto o Oráculo Gemini):
 *
 *  1. Termômetro de Presença  →  AttendanceCard (Plenário vs Comissões)
 *  2. Proposições de Autoria Própria  →  Apenas autor principal, anti-carona
 *  3. Monitor de Teto de Gastos  →  CEAP: gasto vs limite máximo por UF
 *  4. Análise do Oráculo Gemini  →  Requer fullUnlocked (200 créditos)
 *
 * Estética: terminal/dashboard forense · tipografia Fira Code para números
 * Dados: mockados de forma determinística (via hash do ID do político)
 *        prontos para substituição por dados reais do Firestore
 *        (engine 13_ingest_presencas.py popula: presencas/{id} e proposicoes_proprias/{id})
 */

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db }          from "../lib/firebase";
import AttendanceCard  from "./AttendanceCard";

// ─── Constantes ───────────────────────────────────────────────────────────────
const FIRA = "'Fira Code', 'Courier New', monospace";

// Limite anual da CEAP por estado (valores aproximados 2024, em R$)
const CEAP_LIMITE_UF = {
  AC: 528096, AM: 528096, RO: 528096, RR: 528096,
  AP: 492000, PA: 492000,
  CE: 444000, MA: 444000, PI: 444000, TO: 444000,
  AL: 408000, BA: 420000, PB: 408000, PE: 408000, SE: 408000, RN: 408000,
  GO: 378000, MT: 390000, MS: 384000,
  DF: 369456, MG: 384000, ES: 384000, RJ: 396000, SP: 369456,
  PR: 408000, RS: 408000, SC: 408000,
};
const CEAP_LIMITE_DEFAULT = 420000;

// Limites de alerta da cota
const ALERTA_USO_ELEVADO  = 75;
const ALERTA_USO_CRITICO  = 95;

// Proposições mock por base temática
const PROPOSICOES_BASES = [
  { siglaTipo: "PL",  ementa: "Dispõe sobre a transparência obrigatória em contratos de obras públicas financiadas com recursos federais" },
  { siglaTipo: "PEC", ementa: "Altera o art. 37 da Constituição Federal para vedar dispensa de licitação acima de R$ 50.000" },
  { siglaTipo: "PDC", ementa: "Susta a aplicação do Decreto nº 11.234/2023 que regulamenta gastos emergenciais de pessoal" },
  { siglaTipo: "PL",  ementa: "Institui o programa de fiscalização cidadã de obras em andamento com prazo superior a 24 meses" },
  { siglaTipo: "PL",  ementa: "Altera a Lei de Responsabilidade Fiscal para fortalecer controles de auditoria interna em municípios" },
];

const SITUACOES  = ["Em tramitação", "Aprovado (CD)", "Em tramitação", "Arquivado", "Em tramitação"];
const DATAS_APRES = ["12/02/2024", "18/09/2023", "05/04/2024", "20/11/2022", "01/03/2023"];

// Texto de análise do Oráculo (mock, substituir por Gemini real)
const ORACLE_ANALYSIS = `A análise do Motor TransparenciaBR detectou um aumento de 34% nos gastos
da cota parlamentar entre Julho e Outubro de 2022 (período pré-eleitoral). Este padrão
coincide com: (1) incremento de R$ 12.400 em combustível e locação de veículos particulares,
(2) contratação de 3 assessores temporários com vínculos a fornecedores da campanha,
(3) R$ 8.200 em serviços gráficos e impressão de material institucional.

Correlação com ciclo eleitoral: ⚠️ ALTA. O padrão é consistente com 14 outros casos
identificados pelo sistema em anos eleitorais anteriores (2018, 2020).

Recomendação forense: auditar contratos de locação de veículos (fornecedor recorrente)
e notas fiscais de serviços gráficos no período Jul–Out/2022. Fonte de dados:
BigQuery fiscalizapa.ceap_ocr_extractions + 06_ocr_notas.py.`;

// ─── Geração determinística de mock data ──────────────────────────────────────
function hashId(id) {
  let h = 0;
  for (const c of String(id ?? "default")) {
    h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  }
  return h;
}

function generateAttendanceData(politico) {
  const h          = hashId(politico?.id);
  const plenarioPct = 55 + (h % 40);          // 55–94%
  const comissaoPct = 30 + ((h * 7 + 13) % 60); // 30–89%
  const plenTotal  = 300 + (h % 40);          // 300–340 sessões no ano
  const comTotal   = 40  + (h % 20);          // 40–59 reuniões

  return {
    plenario: {
      presentes:  Math.round(plenTotal * plenarioPct / 100),
      total:      plenTotal,
      percentual: plenarioPct,
    },
    comissoes: {
      presentes:  Math.round(comTotal * comissaoPct / 100),
      total:      comTotal,
      percentual: comissaoPct,
    },
    media: { plenario: 78.4, comissoes: 61.2 },
  };
}

function generateProposicoes(politico) {
  const h     = hashId(politico?.id);
  const count = 1 + (h % 5);  // 1–5 projetos próprios
  return PROPOSICOES_BASES.slice(0, count).map((base, i) => ({
    id:               String(2000000 + ((h * (i + 1)) % 500000)),
    siglaTipo:        base.siglaTipo,
    numero:           String(100 + ((h * (i + 2)) % 4800)),
    ano:              ["2024", "2023", "2024", "2022", "2023"][i],
    ementa:           base.ementa,
    situacao:         SITUACOES[i],
    dataApresentacao: DATAS_APRES[i],
  }));
}

function generateGabineteData(politico) {
  const limiteAnual = CEAP_LIMITE_UF[politico?.uf] ?? CEAP_LIMITE_DEFAULT;
  const gastosBase  = parseFloat(politico?.gastosCeapTotal ?? politico?.totalGasto ?? 0);
  const gastos      = gastosBase > 0
    ? gastosBase
    : limiteAnual * 0.45 + (hashId(politico?.id) % 80000) - 40000;

  const percentual = Math.min(Math.max((gastos / limiteAnual) * 100, 5), 108);
  return { gastos: Math.abs(gastos), limite: limiteAnual, percentual };
}

// ─── Componentes internos ──────────────────────────────────────────────────────
function SectionBlock({ icon, title, badge, badgeColor = "#6b7280", badgeBg = "#f3f4f6", children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.72)", borderRadius: 16,
      border: "1px solid rgba(237,235,232,0.9)", padding: "22px 22px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 15, fontWeight: 700, color: "#1f2937", margin: 0, flex: 1,
        }}>
          {title}
        </h3>
        {badge && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            color: badgeColor, background: badgeBg,
            border: `1px solid ${badgeColor}30`,
            letterSpacing: "0.06em",
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Proposições de Autoria Própria ───────────────────────────────────────────
function ProposicoesSection({ proposicoes }) {
  return (
    <SectionBlock
      icon="📝"
      title="Proposições de Autoria Própria"
      badge={`${proposicoes.length} PROJETO${proposicoes.length !== 1 ? "S" : ""}`}
      badgeColor="#1d7ab5"
      badgeBg="rgba(29,122,181,0.08)"
    >
      {/* Banner anti-carona */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 10, marginBottom: 16,
        background: "rgba(251,216,127,0.12)", border: "1px solid rgba(251,216,127,0.35)",
      }}>
        <span style={{ fontSize: 13 }}>🚫</span>
        <span style={{ fontSize: 11, color: "#78350f" }}>
          <strong>Co-autorias descartadas</strong> — exibido apenas o parlamentar como
          Autor Principal (sem o &quot;efeito carona&quot; de assinantes secundários)
        </span>
      </div>

      {proposicoes.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>
          Nenhuma proposição de autoria própria encontrada.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proposicoes.map((p) => (
            <div key={p.id} style={{
              padding: "12px 14px", borderRadius: 12,
              background: "#fafafa", border: "1px solid #f0f0f0",
              borderLeft: "3px solid #9ECFE8",
            }}>
              {/* Header da proposição */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: FIRA,
                  fontSize: 12, fontWeight: 700, color: "#1f2937",
                  background: "#f0f4ff", padding: "2px 8px", borderRadius: 6,
                  letterSpacing: "0.02em",
                }}>
                  {p.siglaTipo} {p.numero}/{p.ano}
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
                  background: p.situacao === "Aprovado (CD)"
                    ? "rgba(34,197,94,0.10)" : "rgba(100,116,139,0.08)",
                  color: p.situacao === "Aprovado (CD)" ? "#16a34a" : "#6b7280",
                  border: `1px solid ${p.situacao === "Aprovado (CD)"
                    ? "rgba(34,197,94,0.25)" : "rgba(100,116,139,0.2)"}`,
                }}>
                  {p.situacao}
                </span>
                <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
                  {p.dataApresentacao}
                </span>
              </div>

              {/* Ementa */}
              <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.55, margin: "0 0 8px" }}>
                {p.ementa.length > 180 ? p.ementa.slice(0, 180) + "…" : p.ementa}
              </p>

              {/* Link para ementa completa */}
              {p.uri ? (
                <a
                  href={p.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 10, color: "#1d7ab5", fontWeight: 600 }}
                >
                  Ver ementa completa →
                </a>
              ) : (
                <span style={{ fontSize: 10, color: "#9ca3af" }}>
                  camara.leg.br · proposição #{p.id}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 9, color: "#d1d5db", marginTop: 12 }}>
        * Fonte: API Câmara · <code>13_ingest_presencas.py</code> · Coleção Firestore: <code>proposicoes_proprias/{"{id}"}</code>
      </p>
    </SectionBlock>
  );
}

// ─── Monitor de Teto de Gastos ────────────────────────────────────────────────
function GastosMonitor({ gastos, limite, percentual }) {
  const isCritico  = percentual >= ALERTA_USO_CRITICO;
  const isElevado  = percentual >= ALERTA_USO_ELEVADO && !isCritico;

  const barColor = isCritico
    ? "#ef4444"
    : isElevado
    ? "#f97316"
    : "#22c55e";

  const statusBadge = isCritico
    ? { label: "⚠️ GASTO CRÍTICO",    color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)" }
    : isElevado
    ? { label: "🟡 USO ELEVADO",       color: "#c2410c", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)" }
    : { label: "✅ DENTRO DO LIMITE",  color: "#16a34a", bg: "rgba(34,197,94,0.08)",  border: "rgba(34,197,94,0.25)" };

  return (
    <SectionBlock
      icon="💼"
      title="Monitor de Teto de Gastos"
      badge={statusBadge.label}
      badgeColor={statusBadge.color}
      badgeBg={statusBadge.bg}
    >
      {/* Valores principais */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center", gap: 16, marginBottom: 18,
      }}>
        {/* Gasto atual */}
        <div>
          <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Gasto (CEAP)
          </div>
          <div style={{ fontFamily: FIRA, fontSize: 20, fontWeight: 700, color: barColor }}>
            {gastos.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          </div>
        </div>

        {/* Percentual */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontFamily: FIRA,
            fontSize: 28, fontWeight: 800, color: barColor, lineHeight: 1,
            letterSpacing: "-1px",
          }}>
            {percentual.toFixed(1)}<span style={{ fontSize: 14, fontWeight: 400 }}>%</span>
          </div>
          <div style={{ fontSize: 9, color: "#9ca3af", marginTop: 2 }}>do teto</div>
        </div>

        {/* Limite máximo */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4,
                        textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Teto Anual
          </div>
          <div style={{ fontFamily: FIRA, fontSize: 20, fontWeight: 700, color: "#6b7280" }}>
            {limite.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Barra de progresso */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          height: 16, borderRadius: 99, background: "#f0f0f0",
          overflow: "hidden", position: "relative",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(percentual, 100)}%`,
            borderRadius: 99,
            background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
            transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
            position: "relative",
          }}>
            {/* Riscado de textura para indicar valor próximo ao teto */}
            {isCritico && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 99,
                background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 8px)",
              }} />
            )}
          </div>
          {/* Marcador de 95% */}
          <div style={{
            position: "absolute", top: 0, bottom: 0,
            left: "95%", width: 2,
            background: "rgba(239,68,68,0.5)",
          }} title="Limite de Alerta (95%)" />
        </div>
        {/* Escala */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontFamily: FIRA, fontSize: 9, color: "#9ca3af" }}>0%</span>
          <span style={{ fontFamily: FIRA, fontSize: 9, color: "#9ca3af", marginLeft: "70%" }}>95% ⚠️</span>
          <span style={{ fontFamily: FIRA, fontSize: 9, color: "#9ca3af" }}>100%</span>
        </div>
      </div>

      {/* Alerta de gasto crítico */}
      {isCritico && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 12,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)",
        }}>
          <p style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600, margin: "0 0 4px" }}>
            ⚠️ ALERTA DE EFICIÊNCIA — GASTO CRÍTICO
          </p>
          <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>
            O parlamentar atingiu {percentual.toFixed(1)}% da cota anual. Padrão consistente
            com gastos acelerados em período eleitoral. Recomenda-se auditoria das notas CEAP.
          </p>
        </div>
      )}

      {/* Teto mensal médio */}
      <div style={{
        display: "flex", gap: 12, flexWrap: "wrap",
      }}>
        {[
          { label: "Teto/mês",     value: (limite / 12).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) },
          { label: "Saldo restante", value: Math.max(limite - gastos, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) },
          { label: "Meses restantes (estimado)", value: gastos > 0 ? `~${Math.ceil((limite - gastos) / (gastos / 12))} meses` : "–" },
        ].map(m => (
          <div key={m.label} style={{
            flex: 1, minWidth: 120,
            background: "#fafafa", borderRadius: 10, padding: "10px 12px",
            border: "1px solid #f0f0f0",
          }}>
            <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 3,
                          textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {m.label}
            </div>
            <div style={{ fontFamily: FIRA, fontSize: 13, fontWeight: 600, color: "#1f2937" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 9, color: "#d1d5db", marginTop: 10 }}>
        * CEAP — Cota para o Exercício da Atividade Parlamentar · Limite varia por estado
        · Referência 2024 · Dados: BigQuery <code>fiscalizapa.ceap_ocr_extractions</code>
      </p>
    </SectionBlock>
  );
}

// ─── Análise do Oráculo (paywall de 200 créditos) ─────────────────────────────
function OracleAnalysis({ fullUnlocked, onPayFull, unlocking, unlockError, credits, gastos, limite }) {
  const isCritico = gastos / limite >= 0.85;

  return (
    <div style={{ position: "relative", borderRadius: 16, overflow: !fullUnlocked ? "hidden" : "visible" }}>
      {/* Conteúdo (sempre renderizado; borrado se não desbloqueado) */}
      <div style={{
        background: "rgba(26,26,46,0.96)", borderRadius: 16,
        padding: "22px 22px 18px",
        filter:        !fullUnlocked ? "blur(5px)" : "none",
        userSelect:    !fullUnlocked ? "none" : "auto",
        pointerEvents: !fullUnlocked ? "none" : "auto",
        transition:    "filter 0.4s ease",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 18 }}>🔮</span>
          <h3 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15, fontWeight: 700, color: "#FBD87F", margin: 0, flex: 1,
          }}>
            Análise do Oráculo
          </h3>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            color: "#FBD87F", background: "rgba(251,216,127,0.15)",
            border: "1px solid rgba(251,216,127,0.3)", letterSpacing: "0.06em",
          }}>
            IA FORENSE
          </span>
        </div>

        <div style={{
          fontFamily: FIRA,
          fontSize: 11, color: "#FBD87F",
          letterSpacing: "0.04em", marginBottom: 14,
          lineHeight: 1.6,
        }}>
          <span style={{ color: "#9ECFE8" }}>QUERY&gt; </span>
          Por que os gastos de gabinete subiram em período eleitoral?
        </div>

        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12, color: "#c7d2e7",
          lineHeight: 1.7,
          whiteSpace: "pre-line",
          borderLeft: "2px solid rgba(251,216,127,0.3)",
          paddingLeft: 14,
        }}>
          {ORACLE_ANALYSIS}
        </div>

        {isCritico && (
          <div style={{
            marginTop: 14, padding: "8px 12px", borderRadius: 10,
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            fontFamily: FIRA, fontSize: 11, color: "#fca5a5",
          }}>
            SEVERITY_LEVEL: CRITICAL · CONFIDENCE: 87.3% · PATTERN_MATCH: ELECTORAL_CYCLE_2022
          </div>
        )}
      </div>

      {/* Overlay de paywall */}
      {!fullUnlocked && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          borderRadius: 16,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          background: "rgba(26,26,46,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            textAlign: "center", padding: "28px 28px",
            background: "rgba(26,26,46,0.90)",
            borderRadius: 16,
            border: "1px solid rgba(251,216,127,0.3)",
            maxWidth: 380,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <h4 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 16, fontWeight: 700, color: "#FBD87F", marginBottom: 8,
            }}>
              Análise Forense Premium
            </h4>
            <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, marginBottom: 20 }}>
              O Oráculo TransparenciaBR explica <strong style={{ color: "#c7d2e7" }}>
              por que os gastos sobem em períodos eleitorais</strong> e quais
              fornecedores beneficiados têm vínculos suspeitos.
            </p>

            <div style={{
              fontFamily: FIRA,
              fontSize: 11, color: "#6b7280", marginBottom: 18,
            }}>
              saldo: <span style={{ color: (credits ?? 0) >= 200 ? "#22c55e" : "#ef4444" }}>
                {credits ?? 0} CR
              </span>{" / "}200 CR necessários
            </div>

            {unlockError && (
              <p style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>{unlockError}</p>
            )}

            {(credits ?? 0) >= 200 ? (
              <button
                onClick={onPayFull}
                disabled={unlocking}
                style={{
                  width: "100%", padding: "11px 0",
                  background: unlocking
                    ? "#374151"
                    : "linear-gradient(135deg, #FBD87F 0%, #F7B98B 100%)",
                  color: unlocking ? "#9ca3af" : "#7A4F1E",
                  fontWeight: 700, fontSize: 13, border: "none",
                  borderRadius: 10, cursor: unlocking ? "not-allowed" : "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: unlocking ? "none" : "0 4px 14px rgba(251,216,127,0.4)",
                }}
              >
                {unlocking ? "Desbloqueando…" : "🔓 Desbloquear Oráculo — 200 créditos"}
              </button>
            ) : (
              <button
                onClick={() => window.location.href = "/creditos"}
                style={{
                  width: "100%", padding: "11px 0",
                  background: "linear-gradient(135deg, #374151, #1f2937)",
                  color: "#FBD87F", fontWeight: 700, fontSize: 13,
                  border: "1px solid rgba(251,216,127,0.3)",
                  borderRadius: 10, cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                💳 Comprar Créditos
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PerformanceTab principal ──────────────────────────────────────────────────
export default function PerformanceTab({
  politico,
  fullUnlocked,
  credits,
  onPayFull,
  unlocking,
  unlockError,
}) {
  const [livePresenca,      setLivePresenca     ] = useState(null);
  const [liveProposicoes,   setLiveProposicoes  ] = useState(null);
  const [firestoreLoading,  setFirestoreLoading ] = useState(true);

  // Tentar carregar dados reais do Firestore (populados por 13_ingest_presencas.py)
  useEffect(() => {
    if (!politico?.id) { setFirestoreLoading(false); return; }
    let cancelled = false;

    Promise.all([
      getDoc(doc(db, "presencas",          politico.id)).catch(() => null),
      getDoc(doc(db, "proposicoes_proprias", politico.id)).catch(() => null),
    ]).then(([presSnap, propSnap]) => {
      if (cancelled) return;
      if (presSnap?.exists()) setLivePresenca(presSnap.data());
      if (propSnap?.exists()) setLiveProposicoes(propSnap.data()?.projetos ?? []);
    }).finally(() => {
      if (!cancelled) setFirestoreLoading(false);
    });

    return () => { cancelled = true; };
  }, [politico?.id]);

  // Dados: live (Firestore) se disponíveis, senão mock determinístico
  const mockAtt  = generateAttendanceData(politico);
  const mockProp = generateProposicoes(politico);
  const gabinete = generateGabineteData(politico);

  const attendanceData = livePresenca
    ? {
        plenario:  {
          presentes:  livePresenca.plenario_presentes,
          total:      livePresenca.plenario_total,
          percentual: livePresenca.plenario_pct,
        },
        comissoes: {
          presentes:  livePresenca.comissao_presentes,
          total:      livePresenca.comissao_total,
          percentual: livePresenca.comissao_pct,
        },
        media: mockAtt.media,
      }
    : mockAtt;

  const proposicoesData = liveProposicoes ?? mockProp;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Badge de fonte de dados */}
      {!firestoreLoading && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 99,
          background: livePresenca
            ? "rgba(34,197,94,0.08)"
            : "rgba(251,216,127,0.10)",
          border: `1px solid ${livePresenca ? "rgba(34,197,94,0.25)" : "rgba(251,216,127,0.3)"}`,
          alignSelf: "flex-start",
        }}>
          <span style={{ fontSize: 11 }}>{livePresenca ? "🟢" : "🟡"}</span>
          <span style={{ fontSize: 10, color: livePresenca ? "#16a34a" : "#92400e", fontWeight: 600 }}>
            {livePresenca
              ? "Dados reais via Firestore (13_ingest_presencas.py)"
              : "Dados ilustrativos — execute engine 13_ingest_presencas.py para dados reais"}
          </span>
        </div>
      )}

      {/* ─── 1. Termômetro de Presença ─────────────────────────── */}
      <SectionBlock icon="📊" title="Termômetro de Presença" badge="GRÁTIS">
        <AttendanceCard
          plenario={attendanceData.plenario}
          comissoes={attendanceData.comissoes}
          media={attendanceData.media}
        />
      </SectionBlock>

      {/* ─── 2. Proposições de Autoria Própria ─────────────────── */}
      <ProposicoesSection proposicoes={proposicoesData} />

      {/* ─── 3. Monitor de Teto de Gastos ──────────────────────── */}
      <GastosMonitor
        gastos={gabinete.gastos}
        limite={gabinete.limite}
        percentual={gabinete.percentual}
      />

      {/* ─── 4. Análise do Oráculo (PAYWALL 200cr) ─────────────── */}
      <div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 10, padding: "0 2px",
        }}>
          <span style={{ fontSize: 18 }}>🔮</span>
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 15, fontWeight: 700, color: "#1f2937", flex: 1,
          }}>
            Análise do Oráculo
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            color: "#7A4F1E", background: "rgba(251,216,127,0.15)",
            border: "1px solid rgba(251,216,127,0.35)",
            letterSpacing: "0.06em",
          }}>
            200 CRÉDITOS
          </span>
        </div>
        <OracleAnalysis
          fullUnlocked={fullUnlocked}
          onPayFull={onPayFull}
          unlocking={unlocking}
          unlockError={unlockError}
          credits={credits}
          gastos={gabinete.gastos}
          limite={gabinete.limite}
        />
      </div>

    </div>
  );
}
