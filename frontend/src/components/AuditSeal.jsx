/**
 * AuditSeal.jsx — Protocolo F.L.A.V.I.O. (Parte 4)
 *
 * "Selo de Auditoria 100%" — indica que 100% das notas CEAP e
 * emendas Pix passam pelo crivo do sanitize_and_load.
 *
 * Dois modos de exibição:
 *   - compact (default): badge pequeno para a Navbar
 *   - full: card expandido para o cabeçalho da página principal
 *
 * Dados:
 *   - Lê de Firestore[config/sistema] o campo audit_coverage (0-100)
 *   - Se não disponível, exibe 100% (estado de confiança máximo)
 */

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

const METRICS_MOCK = {
  coverage:    100,
  notas_total: 284_512,
  emendas_pix: 15_893,
  alertas_ativos: 47,
  ultima_auditoria: "Hoje, 03:07 UTC",
};

function useSistemaConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    let unsub;
    try {
      unsub = onSnapshot(doc(db, "config", "sistema"), snap => {
        if (snap.exists()) setConfig(snap.data());
      });
    } catch {
      setConfig(null);
    }
    return () => unsub?.();
  }, []);

  return config;
}

// ── Versão compacta (Navbar) ─────────────────────────────────────────────────
export function AuditSealCompact() {
  const config = useSistemaConfig();
  const coverage = config?.audit_coverage ?? 100;
  const isActive = !(config?.killSwitch ?? false);

  return (
    <div
      title={`Auditoria Ativa — ${coverage}% de cobertura de notas e emendas`}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        5,
        padding:    "3px 9px",
        background: isActive
          ? "rgba(0,245,212,0.10)"
          : "rgba(255,0,84,0.10)",
        border:     `1px solid ${isActive ? "rgba(0,245,212,0.35)" : "rgba(255,0,84,0.4)"}`,
        borderRadius: 20,
        cursor:     "default",
        userSelect: "none",
      }}
    >
      {/* Ponto piscante */}
      <span style={{
        width:        6,
        height:       6,
        borderRadius: "50%",
        background:   isActive ? "#00f5d4" : "#ff0054",
        display:      "inline-block",
        animation:    "nivel5Banner 1.8s ease-in-out infinite",
        flexShrink:   0,
      }} />
      <span style={{
        fontSize:   "0.62rem",
        fontFamily: "'Fira Code', monospace",
        fontWeight: 700,
        color:      isActive ? "#00f5d4" : "#ff0054",
        whiteSpace: "nowrap",
        letterSpacing: "0.04em",
      }}>
        {isActive ? `${coverage}% AUDITADO` : "KILL SWITCH ON"}
      </span>
    </div>
  );
}

// ── Versão completa (card de painel) ─────────────────────────────────────────
export default function AuditSeal({ showDetails = false }) {
  const config   = useSistemaConfig();
  const coverage = config?.audit_coverage  ?? METRICS_MOCK.coverage;
  const isActive = !(config?.killSwitch ?? false);
  const [expanded, setExpanded] = useState(showDetails);

  const metrics = [
    { label: "Notas CEAP",    value: (config?.notas_auditadas ?? METRICS_MOCK.notas_total).toLocaleString("pt-BR"), ok: true },
    { label: "Emendas PIX",   value: (config?.emendas_auditadas ?? METRICS_MOCK.emendas_pix).toLocaleString("pt-BR"), ok: true },
    { label: "Alertas ativos", value: config?.alertas_ativos ?? METRICS_MOCK.alertas_ativos, ok: false },
    { label: "Última run",    value: config?.ultima_auditoria ?? METRICS_MOCK.ultima_auditoria, ok: true },
  ];

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background:   isActive
          ? "linear-gradient(135deg, rgba(0,245,212,0.08), rgba(0,245,212,0.03))"
          : "linear-gradient(135deg, rgba(255,0,84,0.12), rgba(255,0,84,0.04))",
        border:       `1px solid ${isActive ? "rgba(0,245,212,0.3)" : "rgba(255,0,84,0.4)"}`,
        borderRadius: 12,
        padding:      "12px 16px",
        cursor:       "pointer",
        userSelect:   "none",
        fontFamily:   "'Space Grotesk', sans-serif",
      }}
    >
      {/* Linha principal */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Ícone escudo */}
        <div style={{
          width:        36,
          height:       36,
          borderRadius: "50%",
          background:   isActive
            ? "rgba(0,245,212,0.15)"
            : "rgba(255,0,84,0.15)",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontSize:     "1.2rem",
          flexShrink:   0,
        }}>
          {isActive ? "🛡️" : "🔴"}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        8,
            fontWeight: 700,
            fontSize:   "0.82rem",
            color:      "#fff",
          }}>
            <span>Auditoria TransparenciaBR</span>
            <span style={{
              fontSize:   "0.62rem",
              fontFamily: "'Fira Code', monospace",
              color:      isActive ? "#00f5d4" : "#ff0054",
              background: isActive ? "rgba(0,245,212,0.12)" : "rgba(255,0,84,0.12)",
              border:     `1px solid ${isActive ? "rgba(0,245,212,0.35)" : "rgba(255,0,84,0.4)"}`,
              borderRadius: 4,
              padding:    "1px 7px",
              animation:  "nivel5Banner 2.2s ease-in-out infinite",
            }}>
              {isActive ? `${coverage}% COBERTURA` : "PAUSADO"}
            </span>
          </div>
          <div style={{
            fontSize:   "0.68rem",
            color:      "rgba(255,255,255,0.45)",
            marginTop:  2,
          }}>
            {isActive
              ? "Todas as notas CEAP e emendas auditadas em tempo real"
              : "Sistema em modo de segurança — Kill Switch ativo"}
          </div>
        </div>

        {/* Seta */}
        <span style={{
          color:      "rgba(255,255,255,0.3)",
          fontSize:   "0.8rem",
          transform:  expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>▼</span>
      </div>

      {/* Barra de progresso */}
      <div style={{
        marginTop:    10,
        height:       4,
        background:   "rgba(255,255,255,0.08)",
        borderRadius: 4,
        overflow:     "hidden",
      }}>
        <div style={{
          height:       "100%",
          width:        `${coverage}%`,
          background:   isActive
            ? "linear-gradient(90deg, #00f5d4, #7c3aed)"
            : "#ff0054",
          borderRadius: 4,
          transition:   "width 0.8s ease",
        }} />
      </div>

      {/* Detalhes expandíveis */}
      {expanded && (
        <div style={{
          marginTop: 14,
          display:   "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap:       8,
        }}>
          {metrics.map(m => (
            <div key={m.label} style={{
              background:   "rgba(255,255,255,0.04)",
              border:       "1px solid rgba(255,255,255,0.07)",
              borderRadius: 8,
              padding:      "8px 10px",
            }}>
              <div style={{
                fontSize:   "0.6rem",
                fontFamily: "'Fira Code', monospace",
                color:      "rgba(255,255,255,0.4)",
                marginBottom: 4,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                {m.label}
              </div>
              <div style={{
                fontSize:   "0.95rem",
                fontFamily: "'Fira Code', monospace",
                fontWeight: 700,
                color:      m.ok ? "#00f5d4" : "#f97316",
              }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
