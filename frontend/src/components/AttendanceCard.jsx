/**
 * AttendanceCard.jsx — Termômetro de Presença do Deputado
 *
 * Exibe métricas de assiduidade separadas por tipo:
 *  • Plenário (Sessões Deliberativas — Votações oficiais)
 *  • Comissões (Reuniões técnicas — Trabalho legislativo real)
 *
 * Lógica de alertas (Fantasma):
 *  • Presença < 80% (ausência > 20%) em qualquer tipo → badge vermelho
 *  • Comparação com a média geral dos 513 deputados
 *
 * Fonte Fira Code para os números (terminal/dashboard aesthetic).
 *
 * Props:
 *  @param {object}  plenario   - { presentes: number, total: number, percentual: number }
 *  @param {object}  comissoes  - { presentes: number, total: number, percentual: number }
 *  @param {object}  media      - { plenario: number, comissoes: number } (média dos deputados)
 */

const FIRA = "'Fira Code', 'Courier New', monospace";
const THRESHOLD_ALERTA = 80;  // < 80% de presença → Alerta de Fantasma

function presenceColor(pct) {
  if (pct >= 85) return "#22c55e";  // verde
  if (pct >= 70) return "#eab308";  // amarelo
  if (pct >= 55) return "#f97316";  // laranja
  return "#ef4444";                  // vermelho
}

function presenceLabel(pct) {
  if (pct >= 85) return { icon: "✅", text: "Acima da média" };
  if (pct >= 70) return { icon: "🟡", text: "Próximo da média" };
  if (pct >= 55) return { icon: "🟠", text: "Abaixo da média" };
  return               { icon: "👻", text: "Alerta de Fantasma" };
}

function GaugeBar({ pct, color }) {
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 99, background: "#f0f0f0", overflow: "hidden" }}>
      <div style={{
        position:   "absolute",
        left:       0,
        top:        0,
        height:     "100%",
        width:      `${Math.min(pct, 100)}%`,
        borderRadius: 99,
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        transition: "width 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
      }} />
      {/* Linha de threshold (80%) */}
      <div style={{
        position:   "absolute",
        left:       "80%",
        top:        0,
        height:     "100%",
        width:      2,
        background: "rgba(0,0,0,0.15)",
      }} title="Limite de 80%" />
    </div>
  );
}

function AttendancePillar({ tipo, icon, presentes, total, percentual, mediaDeputados }) {
  const color  = presenceColor(percentual);
  const status = presenceLabel(percentual);
  const isAlert = percentual < THRESHOLD_ALERTA;

  return (
    <div style={{
      flex: 1, minWidth: 180,
      background: isAlert ? "rgba(239,68,68,0.04)" : "rgba(255,255,255,0.6)",
      borderRadius: 14,
      border: `1px solid ${isAlert ? "rgba(239,68,68,0.2)" : "rgba(237,235,232,0.8)"}`,
      padding: "18px 18px 14px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#374151",
                         textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {tipo}
          </span>
        </div>
        {isAlert && (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99,
            background: "rgba(239,68,68,0.10)", color: "#ef4444",
            letterSpacing: "0.05em", border: "1px solid rgba(239,68,68,0.25)",
          }}>
            👻 FANTASMA
          </span>
        )}
      </div>

      {/* Percentual principal */}
      <div style={{
        fontFamily:  FIRA,
        fontSize:    36,
        fontWeight:  700,
        color:       color,
        lineHeight:  1,
        letterSpacing: "-1px",
        marginBottom: 4,
      }}>
        {percentual.toFixed(1)}<span style={{ fontSize: 16, fontWeight: 400, color: "#9ca3af" }}>%</span>
      </div>

      {/* Contagem */}
      <div style={{
        fontFamily: FIRA,
        fontSize:   12,
        color:      "#6b7280",
        marginBottom: 12,
        letterSpacing: "0.02em",
      }}>
        <span style={{ color: color, fontWeight: 600 }}>{presentes}</span>
        {" / "}
        <span>{total}</span>
        <span style={{ color: "#9ca3af" }}> sessões</span>
      </div>

      {/* Gauge bar */}
      <GaugeBar pct={percentual} color={color} />

      {/* Comparação com média */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginTop: 10,
      }}>
        <span style={{ fontSize: 10, color: "#9ca3af" }}>
          {status.icon} {status.text}
        </span>
        <span style={{
          fontFamily: FIRA,
          fontSize: 10, color: "#9ca3af",
        }}>
          média: {mediaDeputados?.toFixed(1) ?? "–"}%
        </span>
      </div>

      {/* Delta vs média */}
      {mediaDeputados != null && (
        <div style={{ marginTop: 6 }}>
          {(() => {
            const delta = percentual - mediaDeputados;
            const pos   = delta >= 0;
            return (
              <span style={{
                fontFamily: FIRA,
                fontSize: 11, fontWeight: 600,
                color: pos ? "#22c55e" : "#ef4444",
              }}>
                {pos ? "+" : ""}{delta.toFixed(1)}% vs. média
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function AttendanceCard({ plenario, comissoes, media }) {
  const mediaP = media?.plenario  ?? 78.4;
  const mediaC = media?.comissoes ?? 61.2;

  const anyAlert = (plenario?.percentual ?? 0)  < THRESHOLD_ALERTA
                || (comissoes?.percentual ?? 0) < THRESHOLD_ALERTA;

  return (
    <div>
      {/* Sub-título + badge global */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.04em" }}>
          Presença oficial registrada pela Câmara dos Deputados
        </span>
        {anyAlert ? (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 99,
            background: "rgba(239,68,68,0.10)", color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.3)",
            letterSpacing: "0.06em",
          }}>
            ⚠️ AUSÊNCIA CRÍTICA DETECTADA
          </span>
        ) : (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            background: "rgba(34,197,94,0.08)", color: "#16a34a",
            border: "1px solid rgba(34,197,94,0.2)",
          }}>
            ASSIDUIDADE REGULAR
          </span>
        )}
      </div>

      {/* Dois pilares */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <AttendancePillar
          tipo="Plenário"
          icon="🏛️"
          presentes={plenario?.presentes ?? 0}
          total={plenario?.total ?? 0}
          percentual={plenario?.percentual ?? 0}
          mediaDeputados={mediaP}
        />
        <AttendancePillar
          tipo="Comissões"
          icon="🔬"
          presentes={comissoes?.presentes ?? 0}
          total={comissoes?.total ?? 0}
          percentual={comissoes?.percentual ?? 0}
          mediaDeputados={mediaC}
        />
      </div>

      {/* Nota metodológica */}
      <p style={{ fontSize: 9, color: "#d1d5db", marginTop: 12, lineHeight: 1.5 }}>
        * Dados via API da Câmara dos Deputados · Fonte:{" "}
        <code>engines/13_ingest_presencas.py</code> · Plenário = Sessões Deliberativas ·
        Comissões = Reuniões técnicas de trabalho
      </p>
    </div>
  );
}
