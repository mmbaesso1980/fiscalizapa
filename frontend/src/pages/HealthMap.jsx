/**
 * HealthMap.jsx — Mapa de Calor da Saúde Pública + Modal AFRODITE
 *
 * Operação D.R.A.C.U.L.A. · Protocolo A.F.R.O.D.I.T.E.
 * Rota: /saude
 *
 * Funcionalidades:
 *  • Tile grid dos 27 estados colorido por índice de corrupção na saúde
 *  • Ao clicar num estado → lista de unidades de saúde suspeitas
 *  • Ao clicar numa unidade → Modal AFRODITE:
 *      - Equipamentos comprados vs. existentes
 *      - Tempo de espera (se disponível)
 *      - Índice de Corrupção da OSS gestora
 *      - Fluxo financeiro (SankeyChart inline)
 *      - Alertas ativos (motor 17 + 18)
 *
 * Dados: Firestore[alertas_saude] + Firestore[oss_contratos]
 * Fallback: dados mock detalhados
 *
 * Estética: Protocolo AFRODITE
 *  - Fundo escuro (#0a0a1a)
 *  - Verde Médico (#00f5d4) para dados limpos
 *  - Carmesim Pulsante (#ff0054) para anomalias
 *  - Glassmorphism 25px nos cards
 */

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import SankeyChart, { MOCK_SANKEY_DATA } from "../components/SankeyChart";

// ─── Constantes de cor AFRODITE ───────────────────────────────────────────────
const C_CLEAN      = "#00f5d4";
const C_SUSPICIOUS = "#ff0054";
const C_DARK       = "#0a0a1e";
const C_CARD       = "rgba(15,15,35,0.75)";
const C_BORDER     = "rgba(255,255,255,0.08)";
const C_TEXT_MAIN  = "#e2e8f0";
const C_TEXT_MUTED = "#64748b";

// ─── Grid dos estados (reutilizado de BrazilHeatmap) ─────────────────────────
const CELLS = [
  { uf: "RR", name: "Roraima",            row: 0, col: 2 },
  { uf: "AP", name: "Amapá",              row: 0, col: 5 },
  { uf: "AM", name: "Amazonas",           row: 1, col: 1 },
  { uf: "PA", name: "Pará",               row: 1, col: 4 },
  { uf: "AC", name: "Acre",               row: 2, col: 0 },
  { uf: "RO", name: "Rondônia",           row: 2, col: 1 },
  { uf: "TO", name: "Tocantins",          row: 2, col: 3 },
  { uf: "MA", name: "Maranhão",           row: 1, col: 5 },
  { uf: "PI", name: "Piauí",              row: 2, col: 5 },
  { uf: "CE", name: "Ceará",              row: 1, col: 6 },
  { uf: "RN", name: "Rio G. Norte",       row: 1, col: 7 },
  { uf: "PB", name: "Paraíba",            row: 2, col: 7 },
  { uf: "PE", name: "Pernambuco",         row: 3, col: 6 },
  { uf: "AL", name: "Alagoas",            row: 3, col: 7 },
  { uf: "SE", name: "Sergipe",            row: 4, col: 7 },
  { uf: "BA", name: "Bahia",              row: 3, col: 5 },
  { uf: "MT", name: "Mato Grosso",        row: 3, col: 2 },
  { uf: "MS", name: "Mato G. do Sul",     row: 4, col: 2 },
  { uf: "GO", name: "Goiás",              row: 3, col: 3 },
  { uf: "DF", name: "Distrito Federal",   row: 4, col: 3 },
  { uf: "MG", name: "Minas Gerais",       row: 4, col: 4 },
  { uf: "ES", name: "Espírito Santo",     row: 4, col: 5 },
  { uf: "RJ", name: "Rio de Janeiro",     row: 5, col: 5 },
  { uf: "SP", name: "São Paulo",          row: 5, col: 3 },
  { uf: "PR", name: "Paraná",             row: 6, col: 3 },
  { uf: "SC", name: "Santa Catarina",     row: 7, col: 3 },
  { uf: "RS", name: "Rio G. do Sul",      row: 8, col: 3 },
];

const CELL_SIZE = 54;
const CELL_GAP  = 4;
const GRID_ROWS = 9;
const GRID_COLS = 8;

// ─── Dados mock de unidades de saúde ─────────────────────────────────────────
const MOCK_HEALTH_UNITS = {
  SP: [
    {
      id: "sp1", nome: "Hospital Estadual A — OSS Instituto Saúde Plena",
      tipo: "Hospital", municipio: "São Paulo",
      oss: "Instituto Saúde Plena",
      oss_indice: 78,
      valor_contrato: 45_000_000,
      equipamentos: {
        comprados: [
          { item: "Tomógrafo Philips 128-slice", qtd_pago: 2, qtd_verificado: 1, status: "DIVERGÊNCIA" },
          { item: "Respiradores UTI",           qtd_pago: 20, qtd_verificado: 18, status: "OK" },
          { item: "Desfibriladores",            qtd_pago: 15, qtd_verificado: 8,  status: "DIVERGÊNCIA" },
          { item: "Bisturis elétricos",         qtd_pago: 30, qtd_verificado: 30, status: "OK" },
        ],
        totalPago: 3_800_000,
        totalVerificado: 2_650_000,
      },
      tempo_espera: { consulta: "47 dias", urgencia: "4h 20min", cirurgia_eletiva: "8 meses" },
      alertas: [
        { tipo: "EQUIPAMENTO_FANTASMA", descricao: "1 tomógrafo pago não localizado na unidade", score: 85 },
        { tipo: "OSS_BAIXA_ACCOUNTABILITY", descricao: "Contrato sem indicadores mensuráveis", score: 78 },
      ],
    },
    {
      id: "sp2", nome: "UPA Zona Norte — Gestão LabFácil / OSS SP",
      tipo: "UPA", municipio: "São Paulo",
      oss: "OSS Saúde SP",
      oss_indice: 52,
      valor_contrato: 12_000_000,
      equipamentos: {
        comprados: [
          { item: "Kits de Exame PCR",       qtd_pago: 5000, qtd_verificado: 5000, status: "OK" },
          { item: "Aparelho de Raio-X",       qtd_pago: 3,    qtd_verificado: 3,    status: "OK" },
          { item: "Autoclave 75L",            qtd_pago: 4,    qtd_verificado: 2,    status: "DIVERGÊNCIA" },
        ],
        totalPago: 980_000,
        totalVerificado: 855_000,
      },
      tempo_espera: { consulta: "12 dias", urgencia: "2h 10min", cirurgia_eletiva: "N/A" },
      alertas: [
        { tipo: "LABORATORIO_FANTASMA", descricao: "Laboratório subcontratado sem ANVISA", score: 72 },
      ],
    },
  ],
  RJ: [
    {
      id: "rj1", nome: "UPA Central Zona Norte — Fundação Vida e Saúde",
      tipo: "UPA", municipio: "Rio de Janeiro",
      oss: "Fundação Vida e Saúde",
      oss_indice: 65,
      valor_contrato: 28_000_000,
      equipamentos: {
        comprados: [
          { item: "Monitores Multiparamétricos", qtd_pago: 30, qtd_verificado: 22, status: "DIVERGÊNCIA" },
          { item: "Mesas Cirúrgicas",            qtd_pago: 5,  qtd_verificado: 5,  status: "OK" },
          { item: "Ventiladores Mecânicos",      qtd_pago: 15, qtd_verificado: 15, status: "OK" },
        ],
        totalPago: 2_200_000,
        totalVerificado: 1_680_000,
      },
      tempo_espera: { consulta: "22 dias", urgencia: "3h 45min", cirurgia_eletiva: "6 meses" },
      alertas: [
        { tipo: "OSS_BAIXA_ACCOUNTABILITY", descricao: "Saldo não revertido ao erário (R$ 1.2M)", score: 65 },
        { tipo: "LABORATORIO_FANTASMA", descricao: "Lab diagnóstico sem alvará sanitário", score: 62 },
      ],
    },
  ],
  MG: [
    {
      id: "mg1", nome: "Hospital Regional Norte — IBGS",
      tipo: "Hospital", municipio: "Belo Horizonte",
      oss: "Instituto Brasileiro de Gestão em Saúde",
      oss_indice: 22,
      valor_contrato: 12_000_000,
      equipamentos: {
        comprados: [
          { item: "Ressonância Magnética 1.5T", qtd_pago: 1, qtd_verificado: 1, status: "OK" },
          { item: "Endoscópios",               qtd_pago: 8, qtd_verificado: 8, status: "OK" },
        ],
        totalPago: 4_500_000,
        totalVerificado: 4_500_000,
      },
      tempo_espera: { consulta: "8 dias", urgencia: "1h 20min", cirurgia_eletiva: "4 meses" },
      alertas: [],
    },
  ],
};

// Scores por UF (índice de corrupção saúde médio 0-100)
const MOCK_HEALTH_SCORES = {
  SP: 74, RJ: 68, BA: 55, PA: 62, AM: 58,
  CE: 45, MG: 30, RS: 25, PR: 32, GO: 48,
  MA: 52, PE: 42, MT: 38, MS: 30, TO: 44,
  SC: 20, ES: 35, DF: 60, PB: 40, AL: 48,
  PI: 36, SE: 38, RN: 32, RO: 28, AC: 22,
  RR: 18, AP: 20,
};

// ─── Cor do tile baseada no índice ────────────────────────────────────────────
function healthColor(score) {
  if (!score) return { bg: "rgba(255,255,255,0.04)", text: "#475569", glow: false };
  if (score >= 70) return { bg: `rgba(255,0,84,${0.25 + score / 400})`,  text: C_SUSPICIOUS, glow: true  };
  if (score >= 45) return { bg: `rgba(255,100,0,${0.2 + score / 500})`,  text: "#ff6622", glow: false };
  if (score >= 20) return { bg: `rgba(0,245,212,${0.1 + score / 800})`,  text: C_CLEAN,   glow: false };
  return { bg: "rgba(0,245,212,0.05)", text: "#2dd4bf", glow: false };
}

// ─── Modal AFRODITE ───────────────────────────────────────────────────────────
function AfroditeModal({ unit, onClose }) {
  const [activeTab, setActiveTab] = useState("equipamentos");
  if (!unit) return null;

  const indexColor = unit.oss_indice >= 60 ? C_SUSPICIOUS : unit.oss_indice >= 30 ? "#ff9944" : C_CLEAN;
  const totalDiverg = unit.equipamentos.comprados.filter(e => e.status === "DIVERGÊNCIA").length;
  const economiaFantasma = unit.equipamentos.totalPago - unit.equipamentos.totalVerificado;

  return (
    <div style={{
      position:  "fixed", inset: 0, zIndex: 800,
      background: "rgba(5,5,15,0.88)",
      backdropFilter: "blur(10px)",
      display:   "flex", alignItems: "center", justifyContent: "center",
      padding:   20,
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width:         "min(820px, 96vw)",
        maxHeight:     "90vh",
        overflowY:     "auto",
        background:    "rgba(10,10,30,0.95)",
        backdropFilter: "blur(25px)",
        border:        `1px solid ${C_BORDER}`,
        borderRadius:  20,
        padding:       "28px 30px",
        boxShadow:     "0 24px 80px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.1)",
      }}>
        {/* Header AFRODITE */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      marginBottom: 24, gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
                background: "rgba(0,245,212,0.1)", color: C_CLEAN,
                border: `1px solid ${C_CLEAN}30`, letterSpacing: "0.12em",
              }}>
                PROTOCOLO A.F.R.O.D.I.T.E.
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
                background: unit.alertas.length > 0 ? "rgba(255,0,84,0.1)" : "rgba(0,245,212,0.08)",
                color: unit.alertas.length > 0 ? C_SUSPICIOUS : C_CLEAN,
                border: `1px solid ${unit.alertas.length > 0 ? C_SUSPICIOUS : C_CLEAN}30`,
              }}>
                {unit.alertas.length > 0 ? `${unit.alertas.length} ALERTAS ATIVOS` : "SEM ALERTAS"}
              </div>
            </div>
            <h2 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 18, fontWeight: 700, color: C_TEXT_MAIN, margin: "0 0 4px",
            }}>
              {unit.nome}
            </h2>
            <p style={{ fontSize: 12, color: C_TEXT_MUTED, margin: 0 }}>
              {unit.tipo} · {unit.municipio} · Contrato: R$ {(unit.valor_contrato / 1_000_000).toFixed(1)}M
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#94a3b8", borderRadius: 10, padding: "8px 14px",
            cursor: "pointer", fontSize: 13, fontWeight: 600, flexShrink: 0,
          }}>
            ✕ Fechar
          </button>
        </div>

        {/* KPIs rápidos */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 22 }}>
          {[
            {
              label: "Índice de Corrupção OSS",
              value: `${unit.oss_indice}/100`,
              sub:   unit.oss,
              color: indexColor,
            },
            {
              label: "Economia Fantasma",
              value: economiaFantasma > 0 ? `R$ ${(economiaFantasma/1000).toFixed(0)}k` : "R$ 0",
              sub:   "equipamentos pagos não encontrados",
              color: economiaFantasma > 0 ? C_SUSPICIOUS : C_CLEAN,
            },
            {
              label: "Tempo médio de espera",
              value: unit.tempo_espera.urgencia,
              sub:   "urgência · " + unit.tempo_espera.consulta + " consulta",
              color: C_TEXT_MAIN,
            },
          ].map(k => (
            <div key={k.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${C_BORDER}`,
              borderRadius: 12, padding: "14px 16px",
            }}>
              <div style={{ fontSize: 9, color: C_TEXT_MUTED, textTransform: "uppercase",
                            letterSpacing: "0.08em", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: k.color,
                            fontFamily: "'Fira Code', monospace" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C_BORDER}`, marginBottom: 20 }}>
          {[
            { id: "equipamentos", label: "🔧 Equipamentos" },
            { id: "alertas",      label: "⚠️ Alertas" },
            { id: "fluxo",        label: "💸 Fluxo Financeiro" },
          ].map(t => (
            <button key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "8px 16px", fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400,
                background: "none", border: "none",
                borderBottom: activeTab === t.id ? `2px solid ${C_CLEAN}` : "2px solid transparent",
                color: activeTab === t.id ? C_CLEAN : C_TEXT_MUTED,
                cursor: "pointer", marginBottom: -1,
                fontFamily: "'Space Grotesk', sans-serif",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Equipamentos */}
        {activeTab === "equipamentos" && (
          <div>
            {totalDiverg > 0 && (
              <div style={{
                background: "rgba(255,0,84,0.08)", border: `1px solid ${C_SUSPICIOUS}30`,
                borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12,
              }}>
                <span style={{ color: C_SUSPICIOUS, fontWeight: 700 }}>⚠️ {totalDiverg} divergência(s) detectada(s):</span>
                <span style={{ color: "#f87171", marginLeft: 8 }}>
                  R$ {(economiaFantasma / 1000).toFixed(0)}k em equipamentos pagos não confirmados na unidade.
                </span>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Equipamento", "Qtd. Pago", "Qtd. Verificado", "Status"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "8px 12px",
                        color: C_TEXT_MUTED, fontWeight: 600, fontSize: 10,
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        borderBottom: `1px solid ${C_BORDER}`,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unit.equipamentos.comprados.map((eq, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                      <td style={{ padding: "10px 12px", color: C_TEXT_MAIN }}>{eq.item}</td>
                      <td style={{ padding: "10px 12px", color: C_TEXT_MUTED, fontFamily: "'Fira Code', monospace" }}>
                        {eq.qtd_pago}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "'Fira Code', monospace",
                                   color: eq.qtd_verificado < eq.qtd_pago ? C_SUSPICIOUS : C_CLEAN }}>
                        {eq.qtd_verificado}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                          background: eq.status === "DIVERGÊNCIA" ? "rgba(255,0,84,0.12)" : "rgba(0,245,212,0.08)",
                          color: eq.status === "DIVERGÊNCIA" ? C_SUSPICIOUS : C_CLEAN,
                          border: `1px solid ${eq.status === "DIVERGÊNCIA" ? C_SUSPICIOUS : C_CLEAN}25`,
                        }}>
                          {eq.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 16 }}>
              <div style={{ fontSize: 11, color: C_TEXT_MUTED }}>
                Total pago: <strong style={{ color: C_TEXT_MAIN, fontFamily: "'Fira Code', monospace" }}>
                  R$ {(unit.equipamentos.totalPago / 1000).toFixed(0)}k
                </strong>
              </div>
              <div style={{ fontSize: 11, color: C_TEXT_MUTED }}>
                Total verificado: <strong style={{
                  color: economiaFantasma > 0 ? C_SUSPICIOUS : C_CLEAN,
                  fontFamily: "'Fira Code', monospace",
                }}>
                  R$ {(unit.equipamentos.totalVerificado / 1000).toFixed(0)}k
                </strong>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Alertas */}
        {activeTab === "alertas" && (
          <div>
            {unit.alertas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: C_CLEAN }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>Nenhum alerta detectado nesta unidade.</p>
              </div>
            ) : unit.alertas.map((alerta, i) => (
              <div key={i} style={{
                background: "rgba(255,0,84,0.07)",
                border: `1px solid ${C_SUSPICIOUS}25`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 99,
                                  color: C_SUSPICIOUS, background: `${C_SUSPICIOUS}15`,
                                  border: `1px solid ${C_SUSPICIOUS}25` }}>
                    {alerta.tipo.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Fira Code', monospace" }}>
                    Score: {alerta.score}/100
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "#cbd5e1", margin: 0, lineHeight: 1.5 }}>
                  {alerta.descricao}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Fluxo Financeiro */}
        {activeTab === "fluxo" && (
          <div>
            <SankeyChart
              data={MOCK_SANKEY_DATA}
              width={Math.min(740, window.innerWidth - 120)}
              height={360}
              title={`Fluxo Financeiro — ${unit.oss}`}
            />
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${C_BORDER}`, paddingTop: 12, marginTop: 20,
                      fontSize: 9, color: "#334155" }}>
          Motor: 17_health_scanner.py + 18_oss_scanner.py · Protocolo A.F.R.O.D.I.T.E. ·
          Dados: Firestore[alertas_saude] + BigQuery[fiscalizapa.health_anomalies]
        </div>
      </div>
    </div>
  );
}

// ─── Tile do mapa ─────────────────────────────────────────────────────────────
function HealthTile({ cell, score, isSelected, onClick }) {
  const { bg, text, glow } = healthColor(score);
  const units = MOCK_HEALTH_UNITS[cell.uf]?.length ?? 0;

  return (
    <div
      onClick={() => onClick(cell.uf)}
      style={{
        gridColumn:   cell.col + 1,
        gridRow:      cell.row + 1,
        width:        CELL_SIZE,
        height:       CELL_SIZE,
        background:   bg,
        backdropFilter: "blur(8px)",
        border:       isSelected
          ? `2px solid ${C_CLEAN}`
          : `1px solid ${score >= 70 ? `${C_SUSPICIOUS}40` : C_BORDER}`,
        borderRadius: 10,
        display:      "flex",
        flexDirection: "column",
        alignItems:   "center",
        justifyContent: "center",
        cursor:       "pointer",
        boxShadow:    glow ? `0 0 16px ${C_SUSPICIOUS}55` : "none",
        animation:    glow ? "healthPulse 2s ease-in-out infinite" : "none",
        transition:   "transform 0.15s",
        userSelect:   "none",
      }}
      onMouseOver={e => { e.currentTarget.style.transform = "scale(1.06)"; }}
      onMouseOut={e => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: text }}>{cell.uf}</span>
      {score > 0 && (
        <span style={{ fontSize: 8, fontWeight: 600, color: text, opacity: 0.8,
                       fontFamily: "'Fira Code', monospace" }}>
          {score}
        </span>
      )}
      {units > 0 && (
        <span style={{ fontSize: 7, color: C_SUSPICIOUS, fontWeight: 700, marginTop: 1 }}>
          ●{units}
        </span>
      )}
    </div>
  );
}

// ─── Painel de unidades por estado ───────────────────────────────────────────
function StateSidePanel({ uf, onUnitClick }) {
  const units = MOCK_HEALTH_UNITS[uf] ?? [];
  const cell  = CELLS.find(c => c.uf === uf);

  if (!uf) return null;

  return (
    <div style={{
      background:    C_CARD,
      backdropFilter: "blur(25px)",
      border:        `1px solid ${C_BORDER}`,
      borderRadius:  16,
      padding:       "20px 22px",
      minWidth:      280,
      maxWidth:      320,
    }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700,
                     color: C_TEXT_MAIN, margin: "0 0 4px" }}>
          {cell?.name ?? uf}
        </h3>
        <p style={{ fontSize: 11, color: C_TEXT_MUTED, margin: 0 }}>
          {units.length > 0 ? `${units.length} unidade(s) com alertas` : "Sem alertas registrados"}
        </p>
      </div>

      {units.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: C_CLEAN, opacity: 0.6, fontSize: 13 }}>
          ✅ Estado sem alertas de saúde
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {units.map(unit => {
            const indexColor = unit.oss_indice >= 60 ? C_SUSPICIOUS : unit.oss_indice >= 30 ? "#ff9944" : C_CLEAN;
            return (
              <div
                key={unit.id}
                onClick={() => onUnitClick(unit)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${unit.alertas.length > 0 ? `${C_SUSPICIOUS}30` : C_BORDER}`,
                  borderRadius: 12, padding: "12px 14px",
                  cursor: "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseOver={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseOut={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: C_TEXT_MAIN, marginBottom: 4,
                               lineHeight: 1.3 }}>
                  {unit.nome.length > 42 ? unit.nome.substring(0, 40) + "…" : unit.nome}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99,
                                  background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
                    {unit.tipo}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: indexColor,
                                  fontFamily: "'Fira Code', monospace" }}>
                    OSS {unit.oss_indice}/100
                  </span>
                  {unit.alertas.length > 0 && (
                    <span style={{ fontSize: 9, color: C_SUSPICIOUS, fontWeight: 700 }}>
                      ⚠️ {unit.alertas.length}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#334155", marginTop: 4 }}>
                  → Clique para abrir dossiê AFRODITE
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function HealthMap() {
  const [healthScores, setHealthScores ] = useState({});
  const [loading,      setLoading      ] = useState(true);
  const [selectedUF,   setSelectedUF   ] = useState(null);
  const [modalUnit,    setModalUnit    ] = useState(null);
  const [useMock,      setUseMock      ] = useState(false);

  // Total de alertas de saúde
  const [totalAlertas, setTotalAlertas] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "alertas_saude"));
        if (!cancelled) {
          if (snap.empty) {
            setHealthScores(MOCK_HEALTH_SCORES);
            setUseMock(true);
          } else {
            const agg = {};
            let total = 0;
            snap.docs.forEach(d => {
              const { uf, score_suspeicao, indice_corrupcao } = d.data();
              if (uf) {
                const s = score_suspeicao ?? indice_corrupcao ?? 50;
                agg[uf] = Math.max(agg[uf] ?? 0, s);
                total++;
              }
            });
            setHealthScores(agg);
            setTotalAlertas(total);
          }
        }
      } catch {
        if (!cancelled) { setHealthScores(MOCK_HEALTH_SCORES); setUseMock(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const totalUnidades = Object.values(MOCK_HEALTH_UNITS).flat().length;
  const totalSuspeitas = Object.values(MOCK_HEALTH_UNITS).flat().filter(u => u.alertas.length > 0).length;
  const scoreMax = Math.max(...Object.values(healthScores), 1);

  return (
    <div style={{
      minHeight: "100vh",
      background: C_DARK,
      fontFamily: "'Inter', system-ui, sans-serif",
      color: C_TEXT_MAIN,
      paddingBottom: 80,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px 0" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
              color: C_CLEAN, background: `${C_CLEAN}12`, border: `1px solid ${C_CLEAN}30`,
              letterSpacing: "0.12em",
            }}>
              OPERAÇÃO D.R.A.C.U.L.A. · SETOR SAÚDE
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 10px", borderRadius: 99,
              color: C_SUSPICIOUS, background: `${C_SUSPICIOUS}10`, border: `1px solid ${C_SUSPICIOUS}25`,
            }}>
              A.F.R.O.D.I.T.E. ATIVO
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 28, fontWeight: 700, color: C_TEXT_MAIN, marginBottom: 8,
          }}>
            Mapa de Corrupção na Saúde
          </h1>
          <p style={{ fontSize: 13, color: C_TEXT_MUTED }}>
            OSS · Laboratórios · Hospitais — Motor 17_health_scanner + 18_oss_scanner
          </p>

          {/* Métricas */}
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            {[
              { label: "Estados analisados",  v: Object.keys(healthScores).length,  c: C_CLEAN },
              { label: "Unidades suspeitas",  v: `${totalSuspeitas}/${totalUnidades}`, c: C_SUSPICIOUS },
              { label: "Score máximo",        v: `${scoreMax}/100`,                  c: scoreMax >= 70 ? C_SUSPICIOUS : "#ff9944" },
              { label: "Dados",               v: useMock ? "Ilustrativos" : "Reais", c: useMock ? "#f59e0b" : C_CLEAN },
            ].map(m => (
              <div key={m.label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${C_BORDER}`,
                borderRadius: 10, padding: "10px 16px",
              }}>
                <div style={{ fontSize: 9, color: C_TEXT_MUTED, textTransform: "uppercase",
                              letterSpacing: "0.07em" }}>{m.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: m.c,
                              fontFamily: "'Fira Code', monospace" }}>{m.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Layout: Mapa + Painel lateral */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>

          {/* Mapa */}
          <div style={{
            background:    C_CARD,
            backdropFilter: "blur(25px)",
            border:        `1px solid ${C_BORDER}`,
            borderRadius:  20,
            padding:       "22px 24px",
            flex:          "0 0 auto",
          }}>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: C_TEXT_MUTED, margin: 0 }}>
                {loading ? "Carregando…" :
                 useMock ? "🟡 Dados ilustrativos" :
                 `${totalAlertas} alertas ativos em ${Object.keys(healthScores).length} estados`}
              </p>
            </div>

            {/* Grid */}
            <div style={{
              display:             "grid",
              gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
              gridTemplateRows:    `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`,
              gap:                 CELL_GAP,
              width:               "fit-content",
            }}>
              {loading ? (
                Array.from({ length: 27 }).map((_, i) => (
                  <div key={i} style={{ width: CELL_SIZE, height: CELL_SIZE,
                    borderRadius: 10, background: "rgba(255,255,255,0.04)",
                    animation: "pulse 1.5s infinite" }} />
                ))
              ) : (
                CELLS.map(cell => (
                  <HealthTile
                    key={cell.uf}
                    cell={cell}
                    score={healthScores[cell.uf] ?? 0}
                    isSelected={selectedUF === cell.uf}
                    onClick={uf => setSelectedUF(prev => prev === uf ? null : uf)}
                  />
                ))
              )}
            </div>

            {/* Legenda */}
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: C_TEXT_MUTED }}>Índice corrupção saúde:</span>
              {[
                { label: "Limpo",     bg: "rgba(0,245,212,0.08)",  color: "#2dd4bf" },
                { label: "Moderado",  bg: "rgba(0,245,212,0.18)",  color: C_CLEAN  },
                { label: "Elevado",   bg: "rgba(255,100,0,0.25)",  color: "#ff6622" },
                { label: "Crítico",   bg: "rgba(255,0,84,0.35)",   color: C_SUSPICIOUS },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: l.bg,
                                border: `1px solid ${l.color}40` }} />
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Painel lateral */}
          {selectedUF && (
            <StateSidePanel uf={selectedUF} onUnitClick={setModalUnit} />
          )}

          {!selectedUF && (
            <div style={{
              flex: 1, minWidth: 280,
              background:    C_CARD,
              backdropFilter: "blur(25px)",
              border:        `1px solid ${C_BORDER}`,
              borderRadius:  16, padding: "24px",
              display:       "flex", flexDirection: "column", gap: 12,
              alignItems:    "center", justifyContent: "center",
              textAlign:     "center", minHeight: 200,
            }}>
              <div style={{ fontSize: 32 }}>🗺️</div>
              <p style={{ fontSize: 14, color: C_TEXT_MUTED, margin: 0 }}>
                Clique num estado para ver as unidades de saúde suspeitas
              </p>
              <p style={{ fontSize: 11, color: "#334155", margin: 0 }}>
                Estados em vermelho possuem alertas ativos de corrupção em saúde
              </p>
            </div>
          )}
        </div>

        {/* Seção: Fluxo financeiro global */}
        <div style={{
          marginTop: 32,
          background:    C_CARD,
          backdropFilter: "blur(25px)",
          border:        `1px solid ${C_BORDER}`,
          borderRadius:  20, padding: "24px 26px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
            <span style={{ fontSize: 18 }}>💸</span>
            <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 700,
                          color: C_TEXT_MAIN, margin: 0 }}>
              Visualização de Fluxo — Estado → OSS → Destinos
            </h2>
          </div>
          <SankeyChart
            data={MOCK_SANKEY_DATA}
            width={Math.min(1040, typeof window !== "undefined" ? window.innerWidth - 100 : 1040)}
            height={380}
          />
        </div>

      </div>

      {/* Modal AFRODITE */}
      {modalUnit && (
        <AfroditeModal unit={modalUnit} onClose={() => setModalUnit(null)} />
      )}

      <style>{`
        @keyframes healthPulse {
          0%, 100% { box-shadow: 0 0 14px rgba(255,0,84,0.45); }
          50%       { box-shadow: 0 0 28px rgba(255,0,84,0.75); }
        }
      `}</style>
    </div>
  );
}
