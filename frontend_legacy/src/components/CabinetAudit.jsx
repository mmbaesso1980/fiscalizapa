/**
 * CabinetAudit.jsx — Protocolo F.L.A.V.I.O.
 *
 * Componente de Auditoria de Gabinete com:
 *   1. Árvore de Pessoal (Hierarchy Tree) com alertas de risco por servidor
 *   2. Gráfico de Dispersão: Gasto com Combustível × Quilometragem Estimada
 *   3. Painel de métricas F.L.A.V.I.O. (fantasmas + nepotismo)
 *   4. Badge de alertas por tipo
 *
 * Dados: Firestore[cabinet_staff] + Firestore[alertas_fantasma]
 * Mock determinístico baseado no politicoId para desenvolvimento.
 */

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Constantes ───────────────────────────────────────────────────────────────
const TERRA_KM       = 40_075;
const PRECO_L        = 6.0;
const CONSUMO_L100   = 12;
const LIMITE_SALARIAL = 110_000;

// ─── Mock determinístico ──────────────────────────────────────────────────────
function hashInt(id = "", salt = 0) {
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function buildMockStaff(politicoId, politicoNome) {
  const base    = hashInt(politicoId, 7);
  const sobr    = politicoNome?.split(" ").filter(p => p.length > 3).pop() || "Silva";
  const ufs     = ["SP", "MG", "RJ", "BA", "PE", "CE", "DF"];
  const cargos  = [
    "Secretário Parlamentar A",
    "Assessor Especial A",
    "Assessor Técnico",
    "Consultor Legislativo",
    "Secretário Parlamentar B",
    "Apoio Administrativo",
  ];

  return Array.from({ length: 6 }, (_, i) => {
    const h       = hashInt(politicoId, i + base);
    const isParente = i < 3;
    const nome    = isParente
      ? ["Ana Paula", "Roberto", "Maria"][i] + " " + sobr + (i === 1 ? " Filho" : "")
      : ["Carlos Eduardo Ferreira", "Thiago Almeida Santos", "Juliana Ramos"][i - 3];
    const ufIdx   = (h >> 3) % ufs.length;
    const ufDom   = ufs[ufIdx];
    const viagens = isParente ? (h % 3) : 20 + (h % 40);
    const salario = 9_000 + ((h % 8) * 1_000);
    const doacao  = isParente ? 3_000 + ((h % 5) * 1_200) : 0;

    return {
      id:            `${politicoId}_S0${i + 1}`,
      nome,
      cargo:         cargos[i],
      lotacao:       "BRASÍLIA-DF",
      uf_domicilio:  ufDom,
      salario,
      viagens_registradas: viagens,
      doacoes_campanha:    doacao,
      is_parente:    isParente,
      score_risco:   isParente ? 55 + (h % 30) : 5 + (h % 20),
    };
  });
}

function buildMockFuelData(politicoId) {
  const base = hashInt(politicoId, 99);
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun"];
  return meses.map((mes, i) => {
    const h       = hashInt(politicoId, base + i);
    const gasto   = 2_000 + ((h % 40) * 1_000); // R$ 2k a R$ 42k
    const litros  = gasto / PRECO_L;
    const km_real = 200 + ((h % 800));           // km reais muito menores que o possível
    const km_poss = litros * (100 / CONSUMO_L100);
    return { mes, gasto, km_real, km_possivel: km_poss };
  });
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function RiskBadge({ score }) {
  const color =
    score >= 75 ? "#ff0054" :
    score >= 55 ? "#f97316" :
    score >= 35 ? "#eab308" : "#22c55e";
  const label =
    score >= 75 ? "CRÍTICO" :
    score >= 55 ? "ALTO"    :
    score >= 35 ? "MÉDIO"   : "OK";

  return (
    <span style={{
      fontSize: "0.55rem",
      fontFamily: "'Fira Code', monospace",
      fontWeight: 700,
      color,
      border: `1px solid ${color}`,
      borderRadius: 4,
      padding: "1px 5px",
      letterSpacing: "0.08em",
    }}>
      {label}
    </span>
  );
}

function StaffCard({ servidor }) {
  const [expanded, setExpanded] = useState(false);
  const isGhost   = servidor.viagens_registradas < 5 && servidor.uf_domicilio !== "DF";
  const isParente = servidor.is_parente;
  const hasRacha  = servidor.doacoes_campanha > 0;

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background:   "rgba(255,255,255,0.04)",
        border:       `1px solid ${servidor.score_risco >= 55 ? "rgba(255,0,84,0.35)" : "rgba(255,255,255,0.08)"}`,
        borderRadius: 10,
        padding:      "10px 14px",
        cursor:       "pointer",
        transition:   "all 0.2s",
        marginBottom: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize:   "0.82rem",
            fontWeight: 600,
            color:      isGhost || isParente ? "#fff" : "rgba(255,255,255,0.75)",
            display:    "flex",
            alignItems: "center",
            gap:        6,
          }}>
            {isGhost    && <span title="Possível Fantasma">👻</span>}
            {isParente  && <span title="Possível Parente">🔴</span>}
            {hasRacha   && <span title="Doação de Campanha">💸</span>}
            {servidor.nome}
          </div>
          <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
            {servidor.cargo} · {servidor.uf_domicilio} · {servidor.viagens_registradas} viagens
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{
            fontFamily: "'Fira Code', monospace",
            fontSize:   "0.8rem",
            color:      "rgba(255,255,255,0.7)",
          }}>
            R$ {servidor.salario.toLocaleString("pt-BR")}
          </span>
          <RiskBadge score={servidor.score_risco} />
        </div>
      </div>

      {expanded && (
        <div style={{
          marginTop:  10,
          paddingTop: 10,
          borderTop:  "1px solid rgba(255,255,255,0.08)",
          fontSize:   "0.72rem",
          color:      "rgba(255,255,255,0.55)",
          display:    "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:        6,
        }}>
          <span>Lotação: <strong style={{ color: "#fff" }}>{servidor.lotacao}</strong></span>
          <span>Domicílio UF: <strong style={{ color: isGhost ? "#f97316" : "#fff" }}>{servidor.uf_domicilio}</strong></span>
          <span>Viagens registradas: <strong style={{ color: servidor.viagens_registradas < 5 ? "#ff0054" : "#22c55e" }}>{servidor.viagens_registradas}</strong></span>
          {hasRacha && (
            <span>Doações ao deputado: <strong style={{ color: "#ff0054" }}>R$ {servidor.doacoes_campanha.toLocaleString("pt-BR")}</strong></span>
          )}
          {isGhost && (
            <div style={{ gridColumn: "1/-1", color: "#f97316", marginTop: 4 }}>
              ⚠️ Indício de Fantasma: lotado em BSB, domicílio em {servidor.uf_domicilio}, {servidor.viagens_registradas} viagem(ns) registrada(s).
            </div>
          )}
          {isParente && (
            <div style={{ gridColumn: "1/-1", color: "#ff0054", marginTop: 4 }}>
              🔴 Sobrenome similar ao parlamentar — Protocolo F.L.A.V.I.O. ativo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HierarchyTree({ staff, politicoNome }) {
  const parentes   = staff.filter(s => s.is_parente);
  const naoParentes = staff.filter(s => !s.is_parente);

  return (
    <div style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
      {/* Root: deputado */}
      <div style={{
        background: "linear-gradient(135deg, rgba(255,0,84,0.18), rgba(124,58,237,0.12))",
        border:     "1px solid rgba(255,0,84,0.4)",
        borderRadius: 10,
        padding:    "10px 16px",
        textAlign:  "center",
        fontWeight: 700,
        fontSize:   "0.85rem",
        color:      "#fff",
        marginBottom: 20,
        position:   "relative",
      }}>
        👑 {politicoNome}
        <span style={{
          position: "absolute", top: -8, right: 10,
          fontSize: "0.6rem", fontFamily: "'Fira Code', monospace",
          background: "#ff0054", color: "#fff", borderRadius: 4, padding: "1px 6px",
        }}>PARLAMENTAR</span>
      </div>

      {/* Conector vertical */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <div style={{ width: 2, height: 20, background: "rgba(255,255,255,0.2)" }} />
      </div>

      {/* Linha horizontal */}
      <div style={{ display: "flex", justifyContent: "center", gap: 0, marginBottom: 20 }}>
        <div style={{ flex: 1, borderBottom: "2px solid rgba(255,255,255,0.15)", marginTop: 10 }} />
        <div style={{ width: 2, height: 20, background: "rgba(255,255,255,0.2)", alignSelf: "flex-end" }} />
        <div style={{ flex: 1, borderBottom: "2px solid rgba(255,255,255,0.15)", marginTop: 10 }} />
      </div>

      {/* Cards dos servidores */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {parentes.length > 0 && (
          <div style={{
            fontSize: "0.65rem",
            fontFamily: "'Fira Code', monospace",
            color: "#ff0054",
            fontWeight: 700,
            marginBottom: 6,
            letterSpacing: "0.06em",
          }}>
            ⚠ NUVEM DE SOBRENOMES ({parentes.length} parentes detectados)
          </div>
        )}
        {staff.map(srv => <StaffCard key={srv.id} servidor={srv} />)}
      </div>
    </div>
  );
}

function FuelScatterChart({ fuelData }) {
  const W = 460, H = 260;
  const PAD = { top: 20, right: 20, bottom: 45, left: 65 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top  - PAD.bottom;

  const maxGasto = Math.max(...fuelData.map(d => d.gasto), 1);
  const maxKm    = Math.max(...fuelData.map(d => Math.max(d.km_real, d.km_possivel)), 1);

  const xScale = (v) => (v / maxGasto) * innerW;
  const yScale = (v) => innerH - (v / maxKm) * innerH;

  // Linha de referência: proporção normal (1 km por R$ 0.72 gasto)
  const refPoints = [
    { x: 0,        y: 0 },
    { x: maxGasto, y: maxGasto * (100 / CONSUMO_L100 / PRECO_L) },
  ];

  return (
    <div>
      <div style={{
        fontSize: "0.7rem",
        color: "rgba(255,255,255,0.5)",
        fontFamily: "'Fira Code', monospace",
        marginBottom: 8,
      }}>
        Gasto com Combustível (R$) × Quilometragem Real
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        <defs>
          <filter id="glow-fuel">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <g key={t}>
              <line
                x1={0} y1={yScale(maxKm * t)}
                x2={innerW} y2={yScale(maxKm * t)}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1}
              />
              <text
                x={-8} y={yScale(maxKm * t) + 4}
                textAnchor="end" fontSize={9}
                fill="rgba(255,255,255,0.35)"
                fontFamily="'Fira Code', monospace"
              >
                {Math.round(maxKm * t / 1000)}k
              </text>
            </g>
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map(t => (
            <text
              key={t}
              x={xScale(maxGasto * t)}
              y={innerH + 16}
              textAnchor="middle"
              fontSize={9}
              fill="rgba(255,255,255,0.35)"
              fontFamily="'Fira Code', monospace"
            >
              {(maxGasto * t / 1000).toFixed(0)}k
            </text>
          ))}

          {/* Linha de referência (esperado) */}
          <line
            x1={xScale(refPoints[0].x)} y1={yScale(Math.min(refPoints[0].y, maxKm))}
            x2={xScale(refPoints[1].x)} y2={yScale(Math.min(refPoints[1].y, maxKm))}
            stroke="#00f5d4" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.5}
          />
          <text
            x={innerW - 5} y={yScale(Math.min(refPoints[1].y, maxKm)) - 6}
            textAnchor="end" fontSize={8} fill="#00f5d4" opacity={0.7}
            fontFamily="'Fira Code', monospace"
          >
            Esperado
          </text>

          {/* Zona de alerta (abaixo da linha = anomalia) */}
          <text x={innerW / 2} y={innerH - 8}
            textAnchor="middle" fontSize={8}
            fill="rgba(255,0,84,0.5)" fontFamily="'Fira Code', monospace"
          >
            ▲ ZONA DE ANOMALIA (gasto alto, km baixa)
          </text>

          {/* Pontos */}
          {fuelData.map((d, i) => {
            const cx    = xScale(d.gasto);
            const cy    = yScale(d.km_real);
            const isAno = d.km_real < d.km_possivel * 0.15; // usou < 15% do km possível
            return (
              <g key={i}>
                {isAno && (
                  <circle
                    cx={cx} cy={cy} r={14}
                    fill="rgba(255,0,84,0.1)"
                    stroke="#ff0054" strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
                <circle
                  cx={cx} cy={cy} r={7}
                  fill={isAno ? "#ff0054" : "#00f5d4"}
                  opacity={0.9}
                  filter="url(#glow-fuel)"
                />
                <text
                  x={cx} y={cy - 11}
                  textAnchor="middle" fontSize={9}
                  fill={isAno ? "#ff0054" : "rgba(255,255,255,0.6)"}
                  fontWeight={isAno ? 700 : 400}
                  fontFamily="'Fira Code', monospace"
                >
                  {d.mes}
                  {isAno && " ⚠"}
                </text>
              </g>
            );
          })}

          {/* Eixos */}
          <line x1={0} y1={0} x2={0} y2={innerH}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <line x1={0} y1={innerH} x2={innerW} y2={innerH}
            stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <text
            x={-innerH / 2} y={-50}
            transform="rotate(-90)"
            textAnchor="middle" fontSize={9}
            fill="rgba(255,255,255,0.45)" fontFamily="'Fira Code', monospace"
          >
            Km Real
          </text>
          <text
            x={innerW / 2} y={innerH + 36}
            textAnchor="middle" fontSize={9}
            fill="rgba(255,255,255,0.45)" fontFamily="'Fira Code', monospace"
          >
            Gasto com Combustível (R$)
          </text>
        </g>
      </svg>

      {/* Legenda */}
      <div style={{
        display:    "flex", gap: 16, marginTop: 8,
        fontSize:   "0.65rem", fontFamily: "'Fira Code', monospace",
        color:      "rgba(255,255,255,0.5)",
      }}>
        <span><span style={{ color: "#00f5d4" }}>●</span> Normal</span>
        <span><span style={{ color: "#ff0054" }}>●</span> Anomalia</span>
        <span style={{ color: "#00f5d4", opacity: 0.6 }}>--- Esperado</span>
      </div>
    </div>
  );
}

function FlavioMetrics({ staff, alertas }) {
  const parentes    = staff.filter(s => s.is_parente);
  const fantasmas   = staff.filter(s => s.viagens_registradas < 5 && s.uf_domicilio !== "DF");
  const salarioTotal = staff.reduce((acc, s) => acc + s.salario, 0);
  const doacoesTotal = staff.reduce((acc, s) => acc + (s.doacoes_campanha || 0), 0);
  const pctLimite    = (salarioTotal / LIMITE_SALARIAL) * 100;

  const metrics = [
    { label: "Servidores",       value: staff.length,                   unit: "",   ok: true },
    { label: "Fantasmas",        value: fantasmas.length,               unit: "",   ok: fantasmas.length === 0 },
    { label: "Parentes F.L.A.V.I.O.", value: `${parentes.length}/${staff.length}`, unit: "", ok: parentes.length === 0 },
    { label: "Doações → deputado", value: `R$ ${doacoesTotal.toLocaleString("pt-BR")}`, unit: "", ok: doacoesTotal === 0 },
    { label: "Custo pessoal/mês", value: `R$ ${salarioTotal.toLocaleString("pt-BR")}`, unit: "", ok: pctLimite < 95 },
    { label: "% do limite",       value: `${pctLimite.toFixed(0)}%`,    unit: "",   ok: pctLimite < 95 },
  ];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap:                 10,
    }}>
      {metrics.map(m => (
        <div key={m.label} style={{
          background:   "rgba(255,255,255,0.04)",
          border:       `1px solid ${m.ok ? "rgba(0,245,212,0.2)" : "rgba(255,0,84,0.3)"}`,
          borderRadius: 8,
          padding:      "10px 12px",
        }}>
          <div style={{
            fontSize:   "0.62rem",
            fontFamily: "'Fira Code', monospace",
            color:      "rgba(255,255,255,0.45)",
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            {m.label}
          </div>
          <div style={{
            fontSize:   "1.1rem",
            fontFamily: "'Fira Code', monospace",
            fontWeight: 700,
            color:      m.ok ? "#00f5d4" : "#ff0054",
          }}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CabinetAudit({ politicoId, politicoNome }) {
  const [staff,   setStaff]   = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState("tree"); // "tree" | "fuel" | "metrics"

  // Dados mock determinísticos por politicoId
  const mockStaff    = useMemo(() => buildMockStaff(politicoId, politicoNome), [politicoId, politicoNome]);
  const mockFuelData = useMemo(() => buildMockFuelData(politicoId), [politicoId]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    const loadData = async () => {
      try {
        // Tentar Firestore primeiro
        const staffSnap = await getDocs(
          query(collection(db, "cabinet_staff"),
                where("parlamentar_id", "==", politicoId))
        );
        const fsStaff = staffSnap.docs.flatMap(d => d.data().servidores || []);

        const alertSnap = await getDocs(
          query(collection(db, "alertas_fantasma"),
                where("parlamentar_id", "==", politicoId))
        );
        const fsAlertas = alertSnap.docs.map(d => d.data());

        if (active) {
          setStaff(fsStaff.length > 0 ? fsStaff : mockStaff);
          setAlertas(fsAlertas);
        }
      } catch {
        if (active) setStaff(mockStaff);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, [politicoId, mockStaff]);

  const hasAlerts = staff.some(s => s.is_parente || s.viagens_registradas < 5);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const TABS = [
    { id: "tree",    label: "🏛 Árvore de Pessoal" },
    { id: "fuel",    label: "⛽ Combustível × Km" },
    { id: "metrics", label: "📊 Métricas de gabinete" },
  ];

  return (
    <div style={{
      background:   "rgba(255,255,255,0.02)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding:      "20px 22px",
      fontFamily:   "'Space Grotesk', sans-serif",
    }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h3 style={{
            margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            Auditoria de Gabinete
            {hasAlerts && (
              <span style={{
                fontSize: "0.6rem", fontFamily: "'Fira Code', monospace",
                background: "rgba(255,0,84,0.18)", color: "#ff0054",
                border: "1px solid rgba(255,0,84,0.4)",
                borderRadius: 4, padding: "2px 8px",
                animation: "nivel5Banner 2s ease-in-out infinite",
              }}>
                ⚠ Auditoria ativa
              </span>
            )}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>
            Protocolo de gabinete — funcionários, lotação e vínculos
          </p>
        </div>
        <div style={{
          fontFamily: "'Fira Code', monospace",
          fontSize:   "0.7rem",
          color:      "rgba(255,255,255,0.35)",
        }}>
          {loading ? "carregando…" : `${staff.length} serv.`}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 16,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        paddingBottom: 8,
      }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background:   tab === t.id ? "rgba(255,255,255,0.1)" : "transparent",
              border:       `1px solid ${tab === t.id ? "rgba(255,255,255,0.25)" : "transparent"}`,
              borderRadius: 6,
              padding:      "5px 12px",
              fontSize:     "0.72rem",
              color:        tab === t.id ? "#fff" : "rgba(255,255,255,0.45)",
              cursor:       "pointer",
              fontFamily:   "'Space Grotesk', sans-serif",
              transition:   "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{
          height: 200, display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.3)", fontFamily: "'Fira Code', monospace", fontSize: "0.8rem",
        }}>
          Carregando dados do gabinete…
        </div>
      ) : (
        <>
          {tab === "tree"    && <HierarchyTree staff={staff} politicoNome={politicoNome} />}
          {tab === "fuel"    && <FuelScatterChart fuelData={mockFuelData} />}
          {tab === "metrics" && <FlavioMetrics staff={staff} alertas={alertas} />}
        </>
      )}

      {/* Footer */}
      <div style={{
        marginTop:  16,
        paddingTop: 10,
        borderTop:  "1px solid rgba(255,255,255,0.06)",
        display:    "flex",
        justifyContent: "space-between",
        fontSize:   "0.62rem",
        fontFamily: "'Fira Code', monospace",
        color:      "rgba(255,255,255,0.25)",
      }}>
        <span>Fonte: Portal da Transparência + Câmara API</span>
        <span>Atualizado: {new Date().toLocaleDateString("pt-BR")}</span>
      </div>
    </div>
  );
}
