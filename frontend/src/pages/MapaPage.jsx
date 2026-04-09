/**
 * MapaPage.jsx — Página pública /mapa
 * Exibe o BrazilHeatmap + lista de alertas filtrada pelo estado selecionado.
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import BrazilHeatmap, { BRAZIL_HEATMAP_MOCK_COUNTS } from "../components/BrazilHeatmap";

function buildIllustrativeAlertas(uf, count) {
  const n = Math.min(Math.max(0, count), 20);
  return Array.from({ length: n }, (_, i) => ({
    id: `mapa-ilustrativo-${uf}-${i}`,
    parlamentarNome: `Registro ilustrativo ${i + 1}`,
    nome: `Registro ilustrativo ${i + 1}`,
    tipoAlerta: "Modo demonstração",
    tipo: "Modo demonstração",
    criticidade: "BAIXA",
    explicacao_oraculo:
      "Sem documentos em alertas_bodes para esta UF: o mapa está em modo demonstração e esta lista replica o mesmo volume exibido no tooltip até o engine 05_sync_bodes.py popular dados reais.",
  }));
}

const SEV_COLOR = {
  ALTA:  { color: "#C82538", bg: "rgba(200,37,56,0.08)"  },
  MEDIA: { color: "#D97706", bg: "rgba(217,119,6,0.08)"  },
  BAIXA: { color: "#2E7F18", bg: "rgba(46,127,24,0.08)"  },
};

function AlertCard({ alerta }) {
  const sev = SEV_COLOR[(alerta.criticidade || "BAIXA").toUpperCase()] ?? SEV_COLOR.BAIXA;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 10,
      background: sev.bg, border: `1px solid ${sev.color}22`,
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#2D2D2D" }}>
          {alerta.parlamentarNome ?? alerta.nome ?? "–"}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                       color: sev.color, background: `${sev.color}15`, flexShrink: 0 }}>
          {alerta.criticidade ?? "BAIXA"}
        </span>
      </div>
      <span style={{ fontSize: 11, color: "#888" }}>{alerta.tipoAlerta ?? alerta.tipo ?? "Alerta"}</span>
      {alerta.explicacao_oraculo && (
        <p style={{ fontSize: 11, color: "#555", fontStyle: "italic",
                    lineHeight: 1.5, marginTop: 2, borderLeft: `2px solid ${sev.color}40`,
                    paddingLeft: 8 }}>
          {alerta.explicacao_oraculo}
        </p>
      )}
    </div>
  );
}

export default function MapaPage() {
  const [selectedUF,  setSelectedUF ] = useState(null);
  const [alertas,     setAlertas    ] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [heatmapMock, setHeatmapMock ] = useState(false);

  useEffect(() => {
    if (!selectedUF) { setAlertas([]); return; }
    let cancelled = false;
    async function loadAlertas() {
      setLoadingList(true);
      try {
        const q = query(
          collection(db, "alertas_bodes"),
          where("uf", "==", selectedUF),
          orderBy("criadoEm", "desc"),
          limit(20),
        );
        const snap = await getDocs(q);
        let rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!cancelled && rows.length === 0 && heatmapMock) {
          const mockN = BRAZIL_HEATMAP_MOCK_COUNTS[selectedUF] ?? 0;
          if (mockN > 0) rows = buildIllustrativeAlertas(selectedUF, mockN);
        }
        if (!cancelled) setAlertas(rows);
      } catch {
        // índice pode não existir — tenta sem orderBy
        try {
          const q2 = query(
            collection(db, "alertas_bodes"),
            where("uf", "==", selectedUF),
            limit(20),
          );
          const snap2 = await getDocs(q2);
          let rows2 = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
          if (!cancelled && rows2.length === 0 && heatmapMock) {
            const mockN = BRAZIL_HEATMAP_MOCK_COUNTS[selectedUF] ?? 0;
            if (mockN > 0) rows2 = buildIllustrativeAlertas(selectedUF, mockN);
          }
          if (!cancelled) setAlertas(rows2);
        } catch { if (!cancelled) setAlertas([]); }
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }
    loadAlertas();
    return () => { cancelled = true; };
  }, [selectedUF, heatmapMock]);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 64 }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "36px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26,
                       fontWeight: 700, color: "#2D2D2D", marginBottom: 6 }}>
            Mapa da Fraude
          </h1>
          <p style={{ fontSize: 13, color: "#888", maxWidth: 560 }}>
            Distribuição geográfica de alertas forenses do TransparenciaBR.
            Clique em um estado para ver os alertas detectados.
          </p>
        </div>

        {/* Mapa de calor */}
        <div style={{
          background: "rgba(255,255,255,0.75)", borderRadius: 18,
          padding: "24px", border: "1px solid rgba(237,235,232,0.8)",
          backdropFilter: "blur(10px)", marginBottom: 24,
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}>
          <BrazilHeatmap onStateSelect={setSelectedUF} onMockModeChange={setHeatmapMock} />
        </div>

        {/* Lista de alertas do estado */}
        {selectedUF && (
          <div style={{ animation: "fadeInUp 0.3s ease-out" }}>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16,
                         fontWeight: 700, color: "#2D2D2D", marginBottom: 12 }}>
              Alertas em {selectedUF} {loadingList ? "(carregando…)" : `(${alertas.length})`}
            </h2>

            {loadingList ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ height: 72, borderRadius: 10,
                                        background: "#F5F3F0", animation: "pulse 1.5s infinite" }} />
                ))}
              </div>
            ) : alertas.length === 0 ? (
              <p style={{ fontSize: 13, color: "#AAA", padding: "16px 0" }}>
                Nenhum alerta encontrado para {selectedUF}. Execute o engine{" "}
                <code>05_sync_bodes.py</code> para popular a coleção.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {alertas.map(a => <AlertCard key={a.id} alerta={a} />)}
              </div>
            )}

            {!loadingList && alertas.length > 0 && (
              <p style={{ marginTop: 12, fontSize: 11, color: "#CCC", textAlign: "right" }}>
                Clique no alerta para ver o dossiê completo ·{" "}
                <Link to="/alertas" style={{ color: "#AAA" }}>Ver todos os alertas</Link>
              </p>
            )}
          </div>
        )}

        {!selectedUF && (
          <p style={{ fontSize: 13, color: "#AAA", textAlign: "center", paddingTop: 12 }}>
            ↑ Clique em um estado no mapa para ver os alertas detectados
          </p>
        )}
      </div>
    </div>
  );
}
