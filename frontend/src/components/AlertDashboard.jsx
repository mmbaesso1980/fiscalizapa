/**
 * AlertDashboard — painel de alertas Firestore (coleção alertas_bodes).
 *
 * Exibe os 20 alertas mais recentes em cards minimalistas com:
 *   • Nome do político + partido / UF
 *   • Tipo de alerta
 *   • Badge de severidade (ALTA / MEDIA / BAIXA)
 *   • Tempo relativo
 *
 * O componente usa seu próprio skeleton interno enquanto o Firestore
 * responde. A página que importa este componente deve ser carregada via
 * React.lazy, garantindo que o Suspense externo cubra o split de código.
 */

import { useEffect, useState } from "react";
import { collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

const LIMIT = 20;

const SEV = {
  ALTA:  { label: "Alto Risco", color: "var(--risk-high)",  bg: "var(--risk-high-bg)",  border: "#C82538" },
  MEDIA: { label: "Atenção",    color: "var(--risk-mid)",   bg: "var(--risk-mid-bg)",   border: "#D97706" },
  BAIXA: { label: "Normal",     color: "var(--risk-low)",   bg: "var(--risk-low-bg)",   border: "#2E7F18" },
};

function sev(raw) {
  const k = (raw || "BAIXA").toUpperCase();
  return SEV[k] ?? SEV.BAIXA;
}

function relativeTime(raw) {
  if (!raw) return "";
  const ms = raw?.toDate ? raw.toDate().getTime() : new Date(raw).getTime();
  if (isNaN(ms)) return "";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60)        return "agora";
  if (diff < 3600)      return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 2592000)   return `${Math.floor(diff / 86400)}d atrás`;
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Skeleton interno (enquanto o Firestore carrega) ──────────────────────────
function CardSkeleton() {
  return (
    <div
      className="rounded-[var(--r-md)] bg-[var(--brand-surface)] border border-[var(--brand-border)]
                 p-4 space-y-3 animate-pulse"
    >
      <div className="flex justify-between items-start gap-3">
        <div className="h-4 w-2/5 rounded bg-[var(--brand-border)]" />
        <div className="h-5 w-16 rounded-full bg-[var(--brand-border)]" />
      </div>
      <div className="h-3 w-3/5 rounded bg-[var(--brand-border)]" />
      <div className="h-3 w-1/3 rounded bg-[var(--brand-border)]" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

// ─── Card de alerta ───────────────────────────────────────────────────────────
function AlertCard({ alerta }) {
  const cfg = sev(alerta.criticidade ?? alerta.severidade);
  const nome =
    alerta.parlamentarNome ?? alerta.nome ?? alerta.autor ?? "Desconhecido";
  const tipo =
    alerta.tipoAlerta ?? alerta.tipo ?? alerta.assunto ?? "Alerta detectado";
  const partido = alerta.partido ?? alerta.autorPartido ?? "";
  const uf      = alerta.uf ?? alerta.autorUf ?? "";
  const tempo   = relativeTime(alerta.criadoEm ?? alerta.createdAt ?? alerta.timestamp);

  return (
    <article
      className="group rounded-[var(--r-md)] bg-[var(--brand-surface)] border border-[var(--brand-border)]
                 p-4 flex flex-col gap-2.5
                 hover:shadow-[var(--shadow-md)] hover:-translate-y-px
                 transition-all duration-150"
      style={{ borderLeftWidth: "3px", borderLeftColor: cfg.border }}
    >
      {/* Linha 1 — nome + badge severidade */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-sm text-[var(--brand-text)] leading-snug">
          {nome}
        </p>
        <span
          className="shrink-0 text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          {cfg.label}
        </span>
      </div>

      {/* Linha 2 — tipo de alerta */}
      <p className="text-xs text-[var(--brand-text)] opacity-80 leading-snug line-clamp-2">
        {tipo}
      </p>

      {/* Linha 3 — meta (partido · UF · tempo) */}
      <div className="flex items-center gap-2 flex-wrap">
        {partido && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded
                           bg-[var(--brand-border)] text-[var(--brand-text)] opacity-70">
            {partido}
          </span>
        )}
        {uf && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded
                           bg-[var(--brand-border)] text-[var(--brand-text)] opacity-70">
            {uf}
          </span>
        )}
        {tempo && (
          <span className="text-[10px] text-[var(--brand-text)] opacity-40 ml-auto">
            {tempo}
          </span>
        )}
      </div>
    </article>
  );
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────
function Empty() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3
                    text-[var(--brand-text)] opacity-40">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0
                 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424
                 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0
                 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0
                 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0
                 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095
                 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504
                 -1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0
                 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"/>
      </svg>
      <p className="text-sm">Nenhum alerta disponível ainda.</p>
      <p className="text-xs">Os bodes aparecerão aqui após a primeira ingestão.</p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AlertDashboard() {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError  ] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAlertas() {
      setLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, "alertas_bodes"),
          orderBy("criadoEm", "desc"),
          limit(LIMIT),
        );
        const snap = await getDocs(q);
        if (!cancelled) {
          setAlertas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        // Coleção pode não existir ainda — trata silenciosamente
        if (!cancelled) {
          if (err?.code === "failed-precondition" || err?.code === "not-found") {
            setAlertas([]);
          } else {
            setError("Erro ao carregar alertas. Tente novamente.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAlertas();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="w-full max-w-2xl mx-auto px-4 py-6">
      {/* Cabeçalho */}
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--brand-text)]
                         font-[var(--font-head)]">
            Alertas Recentes
          </h2>
          <p className="text-xs text-[var(--brand-text)] opacity-50 mt-0.5">
            Últimos {LIMIT} bodes detectados pelo motor TransparenciaBR
          </p>
        </div>
        {!loading && alertas.length > 0 && (
          <span className="text-xs text-[var(--brand-text)] opacity-40">
            {alertas.length} resultado{alertas.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <p className="text-sm text-[var(--risk-high)] text-center py-10">{error}</p>
      ) : alertas.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {alertas.map(a => (
            <AlertCard key={a.id} alerta={a} />
          ))}
        </div>
      )}
    </section>
  );
}
