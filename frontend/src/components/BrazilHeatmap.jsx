/**
 * BrazilHeatmap.jsx — Mapa de Calor Forense do Brasil (por UF)
 *
 * Renderiza um tile grid map do Brasil (27 estados + DF) colorido pelo
 * volume de alertas de risco detectados pelo A.S.M.O.D.E.U.S.
 *
 * Lógica de cores:
 *  • Sem alertas      → cinza neutro
 *  • 1-5 alertas      → verde (hsl 120)
 *  • 6-20 alertas     → âmbar (hsl 60)
 *  • 21+ alertas      → vermelho pulsante (hsl 0)
 *
 * Fonte de dados: Firestore coleção alertas_bodes (campo `uf`)
 * Fallback: dados mock se Firestore vazio ou inacessível
 *
 * Compatível com react-simple-maps no futuro — a estrutura de dados
 * já usa `{ uf, count, totalRisco }` que alimentará qualquer renderer.
 */

import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Tile grid geográfico do Brasil ───────────────────────────────────────────
// Layout inspirado em cartogramas de data journalism brasileiros
const CELLS = [
  // Norte
  { uf: "RR", name: "Roraima",               row: 0, col: 2, region: "N"  },
  { uf: "AP", name: "Amapá",                  row: 0, col: 5, region: "N"  },
  { uf: "AM", name: "Amazonas",               row: 1, col: 1, region: "N"  },
  { uf: "PA", name: "Pará",                   row: 1, col: 4, region: "N"  },
  { uf: "AC", name: "Acre",                   row: 2, col: 0, region: "N"  },
  { uf: "RO", name: "Rondônia",               row: 2, col: 1, region: "N"  },
  { uf: "TO", name: "Tocantins",              row: 2, col: 3, region: "N"  },
  // Nordeste
  { uf: "MA", name: "Maranhão",               row: 1, col: 5, region: "NE" },
  { uf: "PI", name: "Piauí",                  row: 2, col: 5, region: "NE" },
  { uf: "CE", name: "Ceará",                  row: 1, col: 6, region: "NE" },
  { uf: "RN", name: "Rio Grande do Norte",    row: 1, col: 7, region: "NE" },
  { uf: "PB", name: "Paraíba",                row: 2, col: 7, region: "NE" },
  { uf: "PE", name: "Pernambuco",             row: 3, col: 6, region: "NE" },
  { uf: "AL", name: "Alagoas",                row: 3, col: 7, region: "NE" },
  { uf: "SE", name: "Sergipe",                row: 4, col: 7, region: "NE" },
  { uf: "BA", name: "Bahia",                  row: 3, col: 5, region: "NE" },
  // Centro-Oeste
  { uf: "MT", name: "Mato Grosso",            row: 3, col: 2, region: "CO" },
  { uf: "MS", name: "Mato Grosso do Sul",     row: 4, col: 2, region: "CO" },
  { uf: "GO", name: "Goiás",                  row: 3, col: 3, region: "CO" },
  { uf: "DF", name: "Distrito Federal",       row: 4, col: 3, region: "CO" },
  // Sudeste
  { uf: "MG", name: "Minas Gerais",           row: 4, col: 4, region: "SE" },
  { uf: "ES", name: "Espírito Santo",         row: 4, col: 5, region: "SE" },
  { uf: "RJ", name: "Rio de Janeiro",         row: 5, col: 5, region: "SE" },
  { uf: "SP", name: "São Paulo",              row: 5, col: 3, region: "SE" },
  // Sul
  { uf: "PR", name: "Paraná",                 row: 6, col: 3, region: "S"  },
  { uf: "SC", name: "Santa Catarina",         row: 7, col: 3, region: "S"  },
  { uf: "RS", name: "Rio Grande do Sul",      row: 8, col: 3, region: "S"  },
];

const GRID_ROWS = 9;
const GRID_COLS = 8;
const CELL_SIZE = 58;   // px
const CELL_GAP  = 5;    // px

// ─── Dados mock ───────────────────────────────────────────────────────────────
const MOCK_DATA = {
  SP: 42, RJ: 38, MG: 31, BA: 28, PA: 24,
  RS: 19, PR: 17, GO: 15, AM: 14, CE: 12,
  MA: 11, PE: 10, MT: 9,  MS: 8,  TO: 7,
  SC: 7,  ES: 6,  DF: 5,  PB: 4,  AL: 4,
  PI: 3,  SE: 3,  RN: 3,  RO: 2,  AC: 2,
  RR: 1,  AP: 1,
};

// ─── Cor para alerta Nível 5 (Corrupção Provável — roxo pulsante) ─────────────
const NIVEL5_COLOR = "#7c3aed";  // Violet-700

// ─── Calcular cor baseada no count de alertas ─────────────────────────────────
function alertColor(count, maxCount, isNivel5 = false) {
  // Nível 5: roxo especial independente do volume
  if (isNivel5) {
    return { bg: NIVEL5_COLOR, text: "#FFF", pulse: true, nivel5: true };
  }
  if (!count || count === 0) return { bg: "#EDEBE8", text: "#AAA", pulse: false, nivel5: false };
  const pct = Math.min(count / Math.max(maxCount, 1), 1);
  // Hue: 120 (verde) → 0 (vermelho)
  const hue  = Math.round(120 * (1 - pct));
  const sat  = Math.round(80 + pct * 15);    // 80% → 95%
  const lig  = Math.round(42 + pct * 6);     // 42% → 48%
  return {
    bg:     `hsl(${hue}, ${sat}%, ${lig}%)`,
    text:   "#FFF",
    pulse:  pct >= 0.7,   // pulsa se >= 70% do máximo
    nivel5: false,
  };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ cell, count, maxCount, isNivel5, x, y }) {
  if (!cell) return null;
  const { bg } = alertColor(count, maxCount, isNivel5);
  return (
    <div style={{
      position:    "fixed",
      left:        x + 12,
      top:         y - 8,
      background:  "rgba(26,26,46,0.95)",
      backdropFilter: "blur(12px)",
      color:       "#FFF",
      borderRadius: 10,
      padding:     "10px 14px",
      fontSize:    12,
      lineHeight:  1.5,
      pointerEvents: "none",
      zIndex:      500,
      boxShadow:   "0 8px 24px rgba(0,0,0,0.3)",
      minWidth:    160,
      border:      "1px solid rgba(255,255,255,0.12)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{cell.name}</div>
      {isNivel5 && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#c4b5fd", marginBottom: 4 }}>
          ⚠️ CORRUPÇÃO PROVÁVEL — Nível 5
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: bg, flexShrink: 0 }} />
        <span>{count > 0 ? `${count} alertas detectados` : "Sem alertas registrados"}</span>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
        Região: {cell.region} · Clique para filtrar
      </div>
    </div>
  );
}

// ─── Célula do mapa ───────────────────────────────────────────────────────────
function MapCell({ cell, count, maxCount, isNivel5, isSelected, onClick, onMouseEnter, onMouseLeave }) {
  const { bg, text, pulse, nivel5 } = alertColor(count, maxCount, isNivel5);
  const animName = nivel5 ? "cellPulseNivel5" : pulse ? "cellPulse" : "none";

  return (
    <div
      onClick={() => onClick(cell.uf)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        gridColumn: cell.col + 1,
        gridRow:    cell.row + 1,
        width:      CELL_SIZE,
        height:     CELL_SIZE,
        background: bg,
        borderRadius: 10,
        display:    "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor:     "pointer",
        border:     isSelected
          ? "2px solid #2D2D2D"
          : nivel5 ? "2px solid #c4b5fd" : "2px solid rgba(255,255,255,0.35)",
        boxShadow:  isSelected
          ? "0 0 0 3px rgba(0,0,0,0.3)"
          : nivel5 ? `0 0 18px ${NIVEL5_COLOR}88`
          : count > 0 ? `0 2px 10px ${bg}55` : "none",
        transition: "transform 0.15s, box-shadow 0.15s",
        animation:  animName !== "none" ? `${animName} ${nivel5 ? "1.4s" : "2s"} ease-in-out infinite` : "none",
        transform:  isSelected ? "scale(1.08)" : "scale(1)",
        userSelect: "none",
      }}
      onMouseOver={e => { e.currentTarget.style.transform = "scale(1.06)"; }}
      onMouseOut={e => { e.currentTarget.style.transform = isSelected ? "scale(1.08)" : "scale(1)"; }}
    >
      <span style={{ fontSize: 13, fontWeight: 800, color: text, letterSpacing: "-0.3px" }}>
        {cell.uf}
      </span>
      {nivel5 && (
        <span style={{ fontSize: 11, marginTop: -2 }}>⚠️</span>
      )}
      {count > 0 && (
        <span style={{ fontSize: 9, fontWeight: 600, color: text, opacity: 0.85 }}>
          {nivel5 ? "N5" : count}
        </span>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
/**
 * @param {function}  onStateSelect - Callback quando UF é selecionada
 * @param {Set<string>} criticalUFs - UFs com alerta Nível 5 (pulso roxo)
 *                                   Populado por 16_contract_collision.py
 */
export default function BrazilHeatmap({ onStateSelect, criticalUFs }) {
  const [counts,    setCounts   ] = useState({});
  const [loading,   setLoading  ] = useState(true);
  const [tooltip,   setTooltip  ] = useState(null);   // { cell, x, y }
  const [selected,  setSelected ] = useState(null);
  const [useMock,   setUseMock  ] = useState(false);

  // ── Carregar alertas do Firestore ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "alertas_bodes"));
        if (cancelled) return;

        if (snap.empty) {
          setCounts(MOCK_DATA);
          setUseMock(true);
          return;
        }

        const agg = {};
        snap.docs.forEach(d => {
          const uf = d.data().uf;
          if (uf) agg[uf] = (agg[uf] ?? 0) + 1;
        });
        setCounts(agg);
      } catch {
        if (!cancelled) { setCounts(MOCK_DATA); setUseMock(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const maxCount = Math.max(...Object.values(counts), 1);

  const handleCellClick = (uf) => {
    const next = selected === uf ? null : uf;
    setSelected(next);
    onStateSelect?.(next);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15,
                       fontWeight: 700, color: "#2D2D2D", marginBottom: 2 }}>
            Mapa de Calor Forense — Brasil
          </h3>
          <p style={{ fontSize: 11, color: "#888" }}>
            {loading ? "Carregando dados…"
              : useMock
                ? "Dados simulados · Conecte o engine 05_sync_bodes.py para dados reais"
                : `${Object.values(counts).reduce((a,b)=>a+b,0)} alertas em ${Object.keys(counts).length} estados`}
          </p>
        </div>
        {selected && (
          <button onClick={() => { setSelected(null); onStateSelect?.(null); }}
            style={{ fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 99,
                     background: "#F5F3F0", border: "1px solid #DDD", cursor: "pointer",
                     color: "#555" }}>
            ✕ Limpar filtro ({selected})
          </button>
        )}
      </div>

      {/* Grid do mapa */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${GRID_COLS}, ${CELL_SIZE}px)`,
        gridTemplateRows:    `repeat(${GRID_ROWS}, ${CELL_SIZE}px)`,
        gap:                 CELL_GAP,
        width:               "fit-content",
        margin:              "0 auto",
        position:            "relative",
      }}>
        {loading ? (
          Array.from({ length: 27 }).map((_, i) => (
            <div key={i} style={{
              width: CELL_SIZE, height: CELL_SIZE, borderRadius: 10,
              background: "#EDEBE8", animation: "pulse 1.5s infinite",
            }} />
          ))
        ) : (
          CELLS.map(cell => {
            const isN5 = criticalUFs instanceof Set
              ? criticalUFs.has(cell.uf)
              : Array.isArray(criticalUFs)
              ? criticalUFs.includes(cell.uf)
              : false;
            return (
              <MapCell
                key={cell.uf}
                cell={cell}
                count={counts[cell.uf] ?? 0}
                maxCount={maxCount}
                isNivel5={isN5}
                isSelected={selected === cell.uf}
                onClick={handleCellClick}
                onMouseEnter={e => setTooltip({ cell, x: e.clientX, y: e.clientY, isNivel5: isN5 })}
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <Tooltip
          cell={tooltip.cell}
          count={counts[tooltip.cell.uf] ?? 0}
          maxCount={maxCount}
          isNivel5={tooltip.isNivel5}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}

      {/* Legenda */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
                    gap: 4, marginTop: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "#AAA", marginRight: 6 }}>Risco:</span>
        {[
          { label: "Nenhum",    bg: "#EDEBE8" },
          { label: "Baixo",     bg: "hsl(120,85%,44%)" },
          { label: "Moderado",  bg: "hsl(80,90%,44%)"  },
          { label: "Alto",      bg: "hsl(40,95%,44%)"  },
          { label: "Crítico",   bg: "hsl(0,90%,48%)"   },
          { label: "Corrupção Crítica (N5)", bg: NIVEL5_COLOR },
        ].map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: l.bg }} />
            <span style={{ fontSize: 10, color: "#888" }}>{l.label}</span>
          </div>
        ))}
        {useMock && (
          <span style={{ fontSize: 9, color: "#CCC", marginLeft: "auto" }}>* dados mock</span>
        )}
      </div>

      {/* Keyframes de pulse */}
      <style>{`
        @keyframes cellPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.72; }
        }
        @keyframes cellPulseNivel5 {
          0%, 100% { opacity: 1;    box-shadow: 0 0 18px #7c3aed88; filter: brightness(1);   }
          50%       { opacity: 0.82; box-shadow: 0 0 32px #7c3aedcc; filter: brightness(1.15); }
        }
      `}</style>
    </div>
  );
}
