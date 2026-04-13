import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "react-router-dom";
import {
  normalizarScoresPorKim,
  classificarScoreTransparenciaBR,
} from "../utils/indiceTransparenciaBR";
import { CreditGate } from "./CreditGate";

const PLACEHOLDER_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23ddd'/%3E%3Ccircle cx='40' cy='30' r='14' fill='%23bbb'/%3E%3Cellipse cx='40' cy='70' rx='24' ry='18' fill='%23bbb'/%3E%3C/svg%3E";

function PilarRow({ label, valA, valB }) {
  const colorA =
    valA != null
      ? valA >= 70
        ? "var(--accent-green)"
        : valA >= 40
          ? "var(--accent-gold)"
          : "var(--accent-red)"
      : "var(--text-muted)";
  const colorB =
    valB != null
      ? valB >= 70
        ? "var(--accent-green)"
        : valB >= 40
          ? "var(--accent-gold)"
          : "var(--accent-red)"
      : "var(--text-muted)";
  return (
    <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
      <td style={{ padding: "10px 12px", fontWeight: 500, fontSize: "13px", color: "var(--text-primary)" }}>{label}</td>
      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: colorA }}>{valA != null ? valA : "-"}</td>
      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: colorB }}>{valB != null ? valB : "-"}</td>
    </tr>
  );
}

/**
 * Comparador lado a lado — uso embutido na página do deputado.
 * @param {{ currentDeputadoId?: string, defaultOtherId?: string }} props
 */
export default function ComparadorEmbed({ currentDeputadoId = "", defaultOtherId = "" }) {
  const [deputados, setDeputados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA] = useState(currentDeputadoId || "");
  const [idB, setIdB] = useState(defaultOtherId || "");

  useEffect(() => {
    getDocs(collection(db, "deputados_federais"))
      .then((snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.nome);
        const normalized = normalizarScoresPorKim(list);
        normalized.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
        setDeputados(normalized);
        setLoading(false);
      })
      .catch((err) => {
        console.error("ComparadorEmbed:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (currentDeputadoId) setIdA(currentDeputadoId);
  }, [currentDeputadoId]);

  useEffect(() => {
    if (defaultOtherId) setIdB(defaultOtherId);
  }, [defaultOtherId]);

  const depA = deputados.find((d) => d.id === idA);
  const depB = deputados.find((d) => d.id === idB);

  if (loading) {
    return <div style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>Carregando deputados...</div>;
  }

  const selectStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border-light)",
    background: "var(--bg-card)",
    color: "var(--text-primary)",
    fontSize: "14px",
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
        Compare indicadores com outro deputado federal. Os dados vêm do índice TransparenciaBR e das mesmas fontes abertas do ranking.
      </p>
      <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Deputado A</div>
          <select value={idA} onChange={(e) => setIdA(e.target.value)} style={selectStyle}>
            <option value="">Selecione...</option>
            {deputados.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome} ({d.partido || "?"}-{d.uf || "?"})
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Deputado B</div>
          <select value={idB} onChange={(e) => setIdB(e.target.value)} style={selectStyle}>
            <option value="">Selecione...</option>
            {deputados.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome} ({d.partido || "?"}-{d.uf || "?"})
              </option>
            ))}
          </select>
        </div>
      </div>

      <CreditGate custo={3} descricao="Comparador de deputados — perfil">
        {depA && depB ? (
          (() => {
            const vA = classificarScoreTransparenciaBR(depA.idx);
            const vB = classificarScoreTransparenciaBR(depB.idx);
            const idCamaraA = depA.idCamara || depA.id;
            const idCamaraB = depB.idCamara || depB.id;
            const fotoA = depA.urlFoto || `https://www.camara.leg.br/internet/deputado/bandep/${idCamaraA}.jpg`;
            const fotoB = depB.urlFoto || `https://www.camara.leg.br/internet/deputado/bandep/${idCamaraB}.jpg`;
            const colorA = depA.idx >= 80 ? "var(--accent-green)" : depA.idx >= 50 ? "var(--accent-gold)" : "var(--accent-red)";
            const colorB = depB.idx >= 80 ? "var(--accent-green)" : depB.idx >= 50 ? "var(--accent-gold)" : "var(--accent-red)";
            return (
              <div style={{ background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-light)", overflow: "hidden" }}>
                <div className="grid-responsive comparador-embed-header" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "var(--bg-secondary)" }}>
                  <div
                    style={{
                      padding: "20px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    Pilar
                  </div>
                  <div style={{ padding: "20px", textAlign: "center" }}>
                    <img
                      src={fotoA}
                      alt={depA.nome}
                      onError={(e) => {
                        e.target.src = PLACEHOLDER_AVATAR;
                      }}
                      style={{ width: "44px", height: "44px", borderRadius: "50%", display: "block", margin: "0 auto 8px" }}
                    />
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-primary)" }}>{depA.nome}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {depA.partido || "?"}-{depA.uf || "?"}
                    </div>
                    <div style={{ marginTop: "6px", fontWeight: "700", fontSize: "24px", color: colorA }}>{depA.idx}</div>
                    <span style={{ color: colorA, fontWeight: "600", fontSize: "12px" }}>{vA?.label || "-"}</span>
                  </div>
                  <div style={{ padding: "20px", textAlign: "center" }}>
                    <img
                      src={fotoB}
                      alt={depB.nome}
                      onError={(e) => {
                        e.target.src = PLACEHOLDER_AVATAR;
                      }}
                      style={{ width: "44px", height: "44px", borderRadius: "50%", display: "block", margin: "0 auto 8px" }}
                    />
                    <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-primary)" }}>{depB.nome}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {depB.partido || "?"}-{depB.uf || "?"}
                    </div>
                    <div style={{ marginTop: "6px", fontWeight: "700", fontSize: "24px", color: colorB }}>{depB.idx}</div>
                    <span style={{ color: colorB, fontWeight: "600", fontSize: "12px" }}>{vB?.label || "-"}</span>
                  </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <tbody>
                    <PilarRow label="Indice Final" valA={depA.idx} valB={depB.idx} />
                    <PilarRow
                      label="Gastos CEAP"
                      valA={depA.totalGastos ? Math.round(depA.totalGastos / 1000) : null}
                      valB={depB.totalGastos ? Math.round(depB.totalGastos / 1000) : null}
                    />
                    <PilarRow
                      label="Presenca (%)"
                      valA={depA.presencaScore ?? depA.presenca ?? null}
                      valB={depB.presencaScore ?? depB.presenca ?? null}
                    />
                    <PilarRow label="Proposicoes" valA={depA.proposicoesScore ?? null} valB={depB.proposicoesScore ?? null} />
                    <PilarRow
                      label="Score Processos"
                      valA={depA.score ?? depA.riskScore ?? null}
                      valB={depB.score ?? depB.riskScore ?? null}
                    />
                  </tbody>
                </table>
                <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", padding: "16px" }}>
                  <Link
                    to={`/politico/deputados_federais/${depA.id}`}
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "var(--accent-green)",
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: "600",
                      fontSize: "13px",
                    }}
                  >
                    Ver perfil
                  </Link>
                  <Link
                    to={`/politico/deputados_federais/${depB.id}`}
                    style={{
                      display: "block",
                      textAlign: "center",
                      padding: "10px",
                      borderRadius: "8px",
                      background: "var(--accent-green)",
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: "600",
                      fontSize: "13px",
                    }}
                  >
                    Ver perfil
                  </Link>
                </div>
              </div>
            );
          })()
        ) : (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)", fontSize: "14px" }}>
            Selecione dois deputados para comparar.
          </div>
        )}
      </CreditGate>
    </div>
  );
}
