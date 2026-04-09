/**
 * PoliticalTimeline.jsx — Linha do Tempo "Vida do Político"
 *
 * Exibe atos oficiais e menções em Diários Oficiais (DOU/DOE/DOM)
 * capturados pelo 10_universal_crawler.py numa linha do tempo vertical.
 *
 * Classificação de sentimento (local, sem chamadas de API):
 *  🔵 NOMEAÇÃO    → nomeação, exoneração, designação, cargo comissionado
 *  🟡 CONTRATO    → contrato, aditivo, dispensa, licitação, aquisição, pagamento
 *  🔴 PROCESSO    → processo, inquérito, auditoria, TCU, MPF, denúncia, irregularidade
 *  ⚪ OUTROS      → qualquer ato que não se enquadre acima
 *
 * Dados: Firestore coleção `diarios_atos` (populada por 10_universal_crawler.py)
 * Filtro por `parlamentar_id` se disponível; fallback a entradas recentes gerais.
 *
 * Props:
 *  @param {string}  politicoId  - ID do político (para filtrar menções específicas)
 *  @param {string}  politicoNome - Nome para busca textual como fallback
 *  @param {number}  limit       - Máximo de itens (default: 12)
 */

import { useState, useEffect, useMemo } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Configuração de sentimento ───────────────────────────────────────────────
const SENTIMENT_CONFIG = {
  NOMEACAO: {
    label:    "Nomeação / Exoneração",
    icon:     "🔵",
    color:    "#3b82f6",
    bgLight:  "rgba(59,130,246,0.08)",
    border:   "rgba(59,130,246,0.25)",
    dotBg:    "#3b82f6",
    keywords: ["nomeação", "nomeado", "nomeada", "exoneração", "exonerado",
               "designado", "designada", "cargo comissionado", "assessor especial",
               "admitido", "posse", "empossado"],
  },
  CONTRATO: {
    label:    "Contrato / Gastos",
    icon:     "🟡",
    color:    "#d97706",
    bgLight:  "rgba(217,119,6,0.07)",
    border:   "rgba(217,119,6,0.25)",
    dotBg:    "#f59e0b",
    keywords: ["contrato", "aditivo", "dispensa de licitação", "inexigibilidade",
               "licitação", "pregão", "aquisição", "compra", "fornecimento",
               "pagamento", "empenho", "autorização de despesa", "portaria de crédito"],
  },
  PROCESSO: {
    label:    "Processo / Investigação",
    icon:     "🔴",
    color:    "#dc2626",
    bgLight:  "rgba(220,38,38,0.07)",
    border:   "rgba(220,38,38,0.3)",
    dotBg:    "#ef4444",
    keywords: ["processo", "inquérito", "auditoria", "tcu", "mpf", "ministério público",
               "denúncia", "irregularidade", "sindicância", "investigação", "suspeito",
               "suspeita", "indiciado", "mandado", "fiscalização"],
  },
  OUTROS: {
    label:    "Outros",
    icon:     "⚪",
    color:    "#9ca3af",
    bgLight:  "rgba(156,163,175,0.07)",
    border:   "rgba(156,163,175,0.2)",
    dotBg:    "#d1d5db",
    keywords: [],
  },
};

const SENTIMENT_KEYS = ["NOMEACAO", "CONTRATO", "PROCESSO", "OUTROS"];

const FILTER_OPTIONS = [
  { key: "TODOS",    label: "Todos",          icon: "📋" },
  { key: "NOMEACAO", label: "Nomeações",       icon: "🔵" },
  { key: "CONTRATO", label: "Contratos",       icon: "🟡" },
  { key: "PROCESSO", label: "Processos",       icon: "🔴" },
];

// ─── Classificação de sentimento (local, sem IA) ──────────────────────────────
function classifySentiment(texto) {
  const t = (texto ?? "").toLowerCase();
  for (const key of ["PROCESSO", "CONTRATO", "NOMEACAO"]) {
    const cfg = SENTIMENT_CONFIG[key];
    if (cfg.keywords.some(k => t.includes(k))) return key;
  }
  return "OUTROS";
}

// ─── Dados mock de linha do tempo ─────────────────────────────────────────────
function getMockTimelineItems(politicoNome) {
  const sn = politicoNome?.split(" ")[1] ?? "Silva";
  return [
    {
      id: "mock1", titulo: "Nomeação para cargo comissionado — Assessoria Especial",
      origem: "DOU Seção 2", data_publicacao: "2024-03-18",
      descricao: `PORTARIA Nº 1.234/2024. Nomeia ${politicoNome ?? "parlamentar"} para exercício de cargo DAS-4.`,
      conteudo: "nomeado", link: null,
    },
    {
      id: "mock2", titulo: "Contrato emergencial de segurança pública — R$ 2,4M",
      origem: "DOE", data_publicacao: "2024-03-12",
      descricao: `Dispensa de licitação nº 12/2024. Contratação de ${sn} Segurança Ltda para prestação de serviços de vigilância. Valor: R$ 2.400.000,00.`,
      conteudo: "dispensa de licitação contrato", link: null,
    },
    {
      id: "mock3", titulo: "Relatório de auditoria TCU — obras emergenciais",
      origem: "DOU Seção 1", data_publicacao: "2024-02-28",
      descricao: `TCU aponta irregularidades em contratos emergenciais analisados. Nome do parlamentar citado como indicador do contratado em processo TC-001.234/2024-1.`,
      conteudo: "irregularidade processo auditoria tcu", link: null,
    },
    {
      id: "mock4", titulo: "Aditivo contratual nº 3 — serviços de consultoria",
      origem: "DOU Seção 3", data_publicacao: "2024-02-15",
      descricao: `Aditivo ao contrato 045/2022 para acréscimo de 25% ao valor e prorrogação de 12 meses. Lei 8.666/93, art. 65 §1º.`,
      conteudo: "aditivo contrato", link: null,
    },
    {
      id: "mock5", titulo: "Exoneração de cargo comissionado — assessor gabinete",
      origem: "DOU Seção 2", data_publicacao: "2024-01-20",
      descricao: "PORTARIA Nº 89/2024. Exonera servidor de cargo de Assessor Especial de Nível Superior.",
      conteudo: "exonerado exoneração", link: null,
    },
    {
      id: "mock6", titulo: "Pregão Eletrônico 007/2024 — material de escritório",
      origem: "DOU Seção 3", data_publicacao: "2024-01-08",
      descricao: "Resultado de licitação. Vencedor: Papelaria Brasil Ltda. Valor: R$ 42.800,00.",
      conteudo: "pregão licitação aquisição", link: null,
    },
  ];
}

// ─── Componente de ponto da timeline ─────────────────────────────────────────
function TimelineItem({ item, isLast }) {
  const [expanded, setExpanded] = useState(false);

  const sentiment = useMemo(
    () => classifySentiment((item.conteudo ?? "") + " " + (item.descricao ?? "") + " " + (item.titulo ?? "")),
    [item]
  );
  const cfg     = SENTIMENT_CONFIG[sentiment];
  const datePub = item.data_publicacao
    ? new Date(item.data_publicacao).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : "–";

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {/* Eixo da timeline */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 36 }}>
        {/* Ponto */}
        <div style={{
          width: 14, height: 14, borderRadius: "50%",
          background: cfg.dotBg,
          border: "2.5px solid white",
          boxShadow: `0 0 0 3px ${cfg.dotBg}40`,
          flexShrink: 0, marginTop: 4,
          zIndex: 1,
        }} />
        {/* Linha vertical */}
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 20,
            background: "linear-gradient(180deg, #e5e7eb, #f3f4f6)",
            marginTop: 4,
          }} />
        )}
      </div>

      {/* Conteúdo */}
      <div style={{
        flex: 1, marginBottom: isLast ? 0 : 16,
        paddingBottom: isLast ? 0 : 4,
      }}>
        {/* Header */}
        <div style={{
          background: cfg.bgLight,
          border: `1px solid ${cfg.border}`,
          borderRadius: 12, padding: "10px 14px",
          cursor: "pointer",
        }}
          onClick={() => setExpanded(e => !e)}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12 }}>{cfg.icon}</span>
            <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#1f2937", lineHeight: 1.4 }}>
              {item.titulo ?? "Ato oficial"}
            </span>
            <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
              color: cfg.color, background: `${cfg.dotBg}18`,
              border: `1px solid ${cfg.dotBg}30`,
            }}>
              {cfg.label.toUpperCase()}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 99,
              background: "#f3f4f6", color: "#6b7280",
            }}>
              {item.origem ?? "DOU"}
            </span>
            <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>{datePub}</span>
          </div>
        </div>

        {/* Expandido */}
        {expanded && (
          <div style={{
            background: "rgba(255,255,255,0.7)", borderRadius: "0 0 12px 12px",
            border: `1px solid ${cfg.border}`, borderTop: "none",
            padding: "10px 14px",
          }}>
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6, margin: "0 0 8px" }}>
              {item.descricao ?? item.conteudo ?? "Sem descrição disponível."}
            </p>
            {item.link && (
              <a href={item.link} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: "#1d7ab5", fontWeight: 600 }}>
                Ver publicação original →
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PoliticalTimeline principal ──────────────────────────────────────────────
export default function PoliticalTimeline({ politicoId, politicoNome, limit: maxItems = 12 }) {
  const [items,        setItems       ] = useState([]);
  const [loading,      setLoading     ] = useState(true);
  const [activeFilter, setActiveFilter] = useState("TODOS");
  const [isMock,       setIsMock      ] = useState(false);

  // Carregar dados do Firestore
  useEffect(() => {
    if (!politicoId) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Tentar query filtrada por parlamentar_id
        let snap = null;
        try {
          const q = query(
            collection(db, "diarios_atos"),
            where("parlamentar_id", "==", politicoId),
            orderBy("data_publicacao", "desc"),
            limit(maxItems),
          );
          snap = await getDocs(q);
        } catch {
          // Índice não disponível — fallback para query geral
        }

        // Fallback: entradas recentes gerais
        if (!snap || snap.empty) {
          const q2 = query(
            collection(db, "diarios_atos"),
            orderBy("data_publicacao", "desc"),
            limit(maxItems),
          );
          snap = await getDocs(q2);
        }

        if (!cancelled) {
          if (snap && !snap.empty) {
            setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsMock(false);
          } else {
            setItems(getMockTimelineItems(politicoNome));
            setIsMock(true);
          }
        }
      } catch {
        if (!cancelled) {
          setItems(getMockTimelineItems(politicoNome));
          setIsMock(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [politicoId, politicoNome, maxItems]);

  // Filtrar por sentimento
  const filteredItems = useMemo(() => {
    if (activeFilter === "TODOS") return items;
    return items.filter(item =>
      classifySentiment((item.conteudo ?? "") + " " + (item.descricao ?? "") + " " + (item.titulo ?? "")) === activeFilter
    );
  }, [items, activeFilter]);

  // Contagem por sentimento
  const counts = useMemo(() => {
    const c = { TODOS: items.length, NOMEACAO: 0, CONTRATO: 0, PROCESSO: 0 };
    items.forEach(item => {
      const s = classifySentiment((item.conteudo ?? "") + " " + (item.descricao ?? "") + " " + (item.titulo ?? ""));
      if (s in c) c[s]++;
    });
    return c;
  }, [items]);

  return (
    <div>
      {/* Header com badge de fonte */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          Atos e menções capturados pelo <code>10_universal_crawler.py</code>
        </span>
        {isMock ? (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
            background: "rgba(251,216,127,0.15)", color: "#92400e",
            border: "1px solid rgba(251,216,127,0.35)",
          }}>
            🟡 Dados ilustrativos
          </span>
        ) : (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
            background: "rgba(34,197,94,0.08)", color: "#16a34a",
            border: "1px solid rgba(34,197,94,0.2)",
          }}>
            🟢 Dados do crawler
          </span>
        )}
      </div>

      {/* Filtros de sentimento */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {FILTER_OPTIONS.map(f => {
          const isActive = activeFilter === f.key;
          const cnt      = counts[f.key] ?? 0;
          const cfg      = f.key !== "TODOS" ? SENTIMENT_CONFIG[f.key] : null;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              style={{
                display:     "inline-flex",
                alignItems:  "center",
                gap:         5,
                padding:     "5px 12px",
                fontSize:    11,
                fontWeight:  isActive ? 700 : 500,
                borderRadius: 99,
                cursor:      "pointer",
                border:      `1.5px solid ${isActive ? (cfg?.dotBg ?? "#1f2937") : "#e5e7eb"}`,
                background:  isActive ? (cfg?.bgLight ?? "rgba(31,41,55,0.06)") : "#fafafa",
                color:       isActive ? (cfg?.color ?? "#1f2937") : "#6b7280",
                transition:  "all 0.15s",
              }}
            >
              {f.icon} {f.label}
              {cnt > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, borderRadius: 99,
                  padding: "0px 5px",
                  background: isActive ? `${cfg?.dotBg ?? "#374151"}22` : "#f3f4f6",
                  color: isActive ? (cfg?.color ?? "#374151") : "#9ca3af",
                }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Timeline vertical */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 64, borderRadius: 12, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9ca3af", fontSize: 13 }}>
          Nenhum ato encontrado para este filtro.
        </div>
      ) : (
        <div style={{ paddingLeft: 8 }}>
          {filteredItems.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              isLast={idx === filteredItems.length - 1}
            />
          ))}
        </div>
      )}

      {/* Nota */}
      <p style={{ fontSize: 9, color: "#d1d5db", marginTop: 12 }}>
        * Diários Oficiais: DOU, DOE, DOM · Classificação de sentimento: análise local de palavras-chave ·
        Engine: <code>10_universal_crawler.py</code> → Firestore <code>diarios_atos</code>
      </p>
    </div>
  );
}
