/**
 * SocialContext.jsx — Medidor de Impacto Social (IDH)
 *
 * Exibe o IDH da região do político como contexto social,
 * não como alerta de erro. (Tarefa 4 do roadmap de correções)
 *
 * Props:
 *   idh       — número entre 0 e 1 (ex: 0.742)
 *   localidade — nome do município ou estado (string)
 *   uf        — sigla do estado (string)
 */

// ─── Mapa de UFs corretas (evita bug MT → MA) ─────────────────────────────────
const ESTADO_TO_UF = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
  "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
  "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
  "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
  "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO",
};

const UF_SIGLAS = new Set(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);

/** Força MT / MA / MS a partir de texto (evita “Mato Grosso” → slice “MA”). */
function ufFromNomeCompleto(...parts) {
  const blob = parts.filter(Boolean).join(" ");
  if (!blob) return null;
  const t = blob.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (t.includes("MATO GROSSO DO SUL")) return "MS";
  if (t.includes("MATO GROSSO")) return "MT";
  if (t.includes("MARANHAO")) return "MA";
  return null;
}

export function normalizeUF(uf, estadoNome) {
  const forced = ufFromNomeCompleto(estadoNome, uf);
  if (forced) return forced;
  if (estadoNome && ESTADO_TO_UF[estadoNome]) return ESTADO_TO_UF[estadoNome];
  const u = String(uf ?? "").trim();
  if (!u || u === "–") return "–";
  const up = u.toUpperCase();
  if (up.length === 2 && UF_SIGLAS.has(up)) return up;
  return uf ?? "–";
}

// ─── Categorias IDH (tom neutro — contexto social, não alerta) ────────────────
function idhCategory(val) {
  if (val === null || val === undefined) return { label: "Sem dados", color: "#64748b", bg: "#f8fafc", fill: 0 };
  if (val >= 0.8)  return { label: "Muito Alto",  color: "#1e40af", bg: "#eff6ff", fill: val * 100 };
  if (val >= 0.7)  return { label: "Alto",        color: "#2563eb", bg: "#eff6ff", fill: val * 100 };
  if (val >= 0.6)  return { label: "Médio",       color: "#475569", bg: "#f1f5f9", fill: val * 100 };
  if (val >= 0.5)  return { label: "Baixo",       color: "#64748b", bg: "#f8fafc", fill: val * 100 };
  return              { label: "Muito Baixo",  color: "#475569", bg: "#f1f5f9", fill: val * 100 };
}

export default function SocialContext({ idh, localidade, uf }) {
  if (idh === null && !localidade) return null;

  const idhNum = parseFloat(idh);
  const { label, color, bg, fill } = idhCategory(isNaN(idhNum) ? null : idhNum);

  return (
    <div style={{
      background: bg,
      border: `1px solid ${color}30`,
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Contexto Social Local
          </span>
          {localidade && (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
              {localidade}{uf ? ` (${normalizeUF(uf)})` : ""}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          {!isNaN(idhNum) && (
            <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
              {idhNum.toFixed(3)}
            </div>
          )}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
            background: `${color}15`, color, marginTop: 4, display: "inline-block",
          }}>
            {label}
          </span>
        </div>
      </div>

      {!isNaN(idhNum) && (
        <div style={{ width: "100%", height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(fill, 100)}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            borderRadius: 99,
            transition: "width 0.6s ease",
          }} />
        </div>
      )}

      <p style={{ fontSize: 10, color: "#9ca3af", margin: "8px 0 0", lineHeight: 1.5 }}>
        IDH de 0 a 1 · Fonte: PNUD / Atlas Brasil. Contexto de desenvolvimento humano da região onde este recurso foi aplicado.
      </p>
    </div>
  );
}
