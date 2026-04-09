/**
 * AdminDashboard.jsx — Sala do Trono (Painel de Controle Administrativo)
 *
 * Rota: /admin  (protegida — requer isAdmin = true em usuarios/{uid})
 *
 * Métricas exibidas:
 *  • Total de Bodes Detectados (contagem de alertas_bodes)
 *  • Créditos Gastos no Sistema (agregado via Firestore)
 *  • Usuários Ativos (contagem de usuarios)
 *  • Kill Switch — pausa todas as requisições de API externas
 *
 * Design: terminal escuro com tons de vermelho, verde neon e cinza metálico.
 * A flag isAdmin é definida manualmente no Firestore: usuarios/{uid}.isAdmin = true
 */

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, getDocs, doc, getDoc, setDoc,
  onSnapshot, serverTimestamp, query, limit,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import DataPulse from "../components/DataPulse";

// ─── Paleta Admin ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#0D1117",
  surface:   "#161B22",
  border:    "#30363D",
  text:      "#E6EDF3",
  muted:     "#8B949E",
  red:       "#FF4C4C",
  redDim:    "#C82538",
  green:     "#56D364",
  yellow:    "#D29922",
  blue:      "#58A6FF",
  orange:    "#F78166",
  mono:      "'Fira Code', 'Courier New', monospace",
};

// ─── Componente de métrica ─────────────────────────────────────────────────────
function MetricCard({ icon, label, value, sub, accent = C.green, loading }) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      padding:      "20px 22px",
      position:     "relative",
      overflow:     "hidden",
    }}>
      {/* Glow de canto */}
      <div style={{
        position: "absolute", top: 0, right: 0,
        width: 80, height: 80,
        background: `radial-gradient(circle at top right, ${accent}18, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                       letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {label}
        </span>
      </div>

      {loading ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: "50%",
              background: accent, animation: `blink 1.2s ${i * 0.2}s infinite` }} />
          ))}
        </div>
      ) : (
        <>
          <div style={{ fontFamily: C.mono, fontSize: 32, fontWeight: 700,
                        color: accent, lineHeight: 1, marginBottom: 4 }}>
            {value ?? "–"}
          </div>
          {sub && (
            <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Log entry ────────────────────────────────────────────────────────────────
function LogEntry({ time, level, message }) {
  const color = level === "ERROR" ? C.red : level === "WARN" ? C.yellow : C.green;
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0",
                  borderBottom: `1px solid ${C.border}22` }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, flexShrink: 0 }}>
        {time}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color, fontWeight: 700, flexShrink: 0, minWidth: 42 }}>
        [{level}]
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.text }}>{message}</span>
    </div>
  );
}

// ─── Kill Switch ──────────────────────────────────────────────────────────────
function KillSwitch({ killed, onToggle, toggling }) {
  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${killed ? C.red : C.border}`,
      borderRadius: 12,
      padding:      "20px 22px",
      boxShadow:    killed ? `0 0 24px ${C.red}30` : "none",
      transition:   "all 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 20 }}>☠️</span>
            <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700,
                           color: C.red, letterSpacing: "0.06em" }}>
              KILL SWITCH
            </span>
            {killed && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                             background: `${C.red}22`, color: C.red,
                             animation: "blink 1s infinite" }}>
                ATIVO
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: C.muted, maxWidth: 340 }}>
            Pausa todas as requisições externas (Portal da Transparência, IBGE, OCR).
            Use se os custos de API subirem acima do threshold.
          </p>
        </div>

        <button
          onClick={onToggle}
          disabled={toggling}
          style={{
            padding:      "12px 24px",
            borderRadius: 10,
            border:       `2px solid ${killed ? C.green : C.red}`,
            background:   killed ? `${C.green}15` : `${C.red}15`,
            color:        killed ? C.green : C.red,
            fontFamily:   C.mono,
            fontWeight:   700,
            fontSize:     12,
            cursor:       toggling ? "not-allowed" : "pointer",
            transition:   "all 0.2s",
            letterSpacing:"0.05em",
            opacity:      toggling ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!toggling) e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          {toggling ? "AGUARDE…" : killed ? "▶ RELIGAR SISTEMA" : "⏹ DESLIGAR SISTEMA"}
        </button>
      </div>

      {killed && (
        <div style={{ marginTop: 14, padding: "10px 14px",
                      background: `${C.red}10`, borderRadius: 8,
                      border: `1px solid ${C.red}30` }}>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.red }}>
            &gt; SISTEMA PAUSADO — nenhuma requisição externa será processada.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Painel principal ─────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate              = useNavigate();
  const { user, isAdmin }     = useAuth();

  const [metrics,    setMetrics   ] = useState({ bodes: null, usuarios: null, creditos: null });
  const [loadingM,   setLoadingM  ] = useState(true);
  const [killed,     setKilled    ] = useState(false);
  const [toggling,   setToggling  ] = useState(false);
  const [killError,  setKillError ] = useState(null);
  const [logs,       setLogs      ] = useState([]);
  const [liveTime,   setLiveTime  ] = useState(new Date().toLocaleTimeString("pt-BR"));

  // ── Proteção de rota ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) { navigate("/", { replace: true }); return; }
    // isAdmin pode ser null (ainda carregando) — só redireciona se false explícito
    if (isAdmin === false) { navigate("/dashboard", { replace: true }); return; }
  }, [user, isAdmin, navigate]);

  // ── Relógio em tempo real ───────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Status do Kill Switch (Firestore) ───────────────────────────────────────
  useEffect(() => {
    const ref   = doc(db, "config", "sistema");
    const unsub = onSnapshot(ref, snap => {
      setKilled(snap.data()?.apiPausada === true);
    }, () => setKilled(false));
    return unsub;
  }, []);

  // ── Métricas ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || isAdmin !== true) return;
    let cancelled = false;

    async function loadMetrics() {
      setLoadingM(true);
      addLog("INFO", "Carregando métricas do sistema…");
      try {
        const [bodesSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, "alertas_bodes"), limit(1000))),
          getDocs(query(collection(db, "usuarios"),     limit(5000))),
        ]);

        if (cancelled) return;

        // Somar créditos gastos: (créditos_iniciais_esperados - saldo_atual)
        // Simulado: assume 10 créditos iniciais por usuário
        let creditosGastos = 0;
        usersSnap.docs.forEach(d => {
          const dados = d.data();
          const inicial  = 10;
          const atual    = dados.creditos ?? 0;
          creditosGastos += Math.max(0, inicial - atual);
        });

        setMetrics({
          bodes:    bodesSnap.size,
          usuarios: usersSnap.size,
          creditos: creditosGastos,
        });

        addLog("INFO", `Métricas carregadas: ${bodesSnap.size} bodes, ${usersSnap.size} usuários`);
      } catch (err) {
        addLog("ERROR", `Falha ao carregar métricas: ${err.message}`);
      } finally {
        if (!cancelled) setLoadingM(false);
      }
    }

    loadMetrics();
    return () => { cancelled = true; };
  }, [user, isAdmin]);

  // ── Log helper ───────────────────────────────────────────────────────────────
  function addLog(level, message) {
    const time = new Date().toLocaleTimeString("pt-BR");
    setLogs(prev => [{ time, level, message }, ...prev].slice(0, 50));
  }

  // ── Toggle Kill Switch ───────────────────────────────────────────────────────
  const handleKillSwitch = useCallback(async () => {
    setToggling(true);
    setKillError(null);
    try {
      const ref  = doc(db, "config", "sistema");
      const next = !killed;
      await setDoc(ref, {
        apiPausada:   next,
        atualizadoEm: serverTimestamp(),
        atualizadoPor: user?.uid ?? "unknown",
      }, { merge: true });
      addLog(next ? "WARN" : "INFO",
        next ? "KILL SWITCH ATIVADO — APIs externas pausadas." : "Sistema religar — APIs externas reativas.");
    } catch (err) {
      setKillError(err.message);
      addLog("ERROR", `Kill Switch falhou: ${err.message}`);
    } finally {
      setToggling(false);
    }
  }, [killed, user]);

  // ── Não renderiza antes de verificar admin ───────────────────────────────────
  if (!user || isAdmin !== true) return null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
                  fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 64px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: C.mono, fontSize: 13, color: C.red }}>
                &gt;_
              </span>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22,
                           fontWeight: 700, color: C.text, margin: 0 }}>
                Sala do Trono
              </h1>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
                             background: `${C.red}20`, color: C.red, letterSpacing: "0.06em" }}>
                ADMIN
              </span>
            </div>
            <p style={{ fontSize: 12, color: C.muted }}>
              TransparenciaBR Control Panel · {user?.email}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%",
                          background: killed ? C.red : C.green,
                          animation: "blink 2s infinite" }} />
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>
              {killed ? "SISTEMA PAUSADO" : "SISTEMA ATIVO"}
            </span>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted,
                           marginLeft: 8 }}>
              {liveTime}
            </span>
          </div>
        </div>

        {/* ── Grade de métricas ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12, marginBottom: 20 }}>
          <MetricCard
            icon="🐐" label="Bodes Detectados"
            value={metrics.bodes?.toLocaleString("pt-BR")}
            sub="alertas forenses ativos"
            accent={C.red} loading={loadingM}
          />
          <MetricCard
            icon="✦" label="Créditos Gastos"
            value={metrics.creditos?.toLocaleString("pt-BR")}
            sub="descontados de usuários"
            accent={C.yellow} loading={loadingM}
          />
          <MetricCard
            icon="👤" label="Usuários Cadastrados"
            value={metrics.usuarios?.toLocaleString("pt-BR")}
            sub="na coleção usuarios"
            accent={C.blue} loading={loadingM}
          />
          <MetricCard
            icon="⚡" label="Engines Ativas"
            value={killed ? "0" : "5"}
            sub={killed ? "todas pausadas" : "01–05 operando"}
            accent={killed ? C.red : C.green} loading={false}
          />
        </div>

        {/* ── Kill Switch ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          {killError && (
            <div style={{ fontSize: 12, color: C.red, marginBottom: 8,
                          fontFamily: C.mono }}>
              ERRO: {killError}
            </div>
          )}
          <KillSwitch killed={killed} onToggle={handleKillSwitch} toggling={toggling} />
        </div>

        {/* ── Data Pulse — atividade em tempo real do crawler ────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.cyan }}>▶</span>
            <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted,
                           textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Motor · Atividade em Tempo Real
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <DataPulse maxLines={35} />
        </div>

        {/* ── Log terminal ────────────────────────────────────────────────── */}
        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.border}`,
          borderRadius: 12,
          overflow:     "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", gap: 5 }}>
                {["#FF5F56","#FFBD2E","#27C93F"].map(c => (
                  <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />
                ))}
              </div>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted }}>
                asmodeus@control:~$ tail -f /var/log/system.log
              </span>
            </div>
            <button
              onClick={() => setLogs([])}
              style={{ fontFamily: C.mono, fontSize: 10, color: C.muted, background: "none",
                       border: "none", cursor: "pointer" }}>
              limpar
            </button>
          </div>

          <div style={{ padding: "12px 16px", maxHeight: 240, overflowY: "auto",
                        fontFamily: C.mono }}>
            {logs.length === 0 ? (
              <span style={{ fontSize: 11, color: C.muted }}>
                &gt; aguardando eventos…
              </span>
            ) : (
              logs.map((l, i) => <LogEntry key={i} {...l} />)
            )}
          </div>
        </div>

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between",
                      flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
            TransparenciaBR v2 · projeto-codex-br / fiscallizapa
          </span>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
            para dar isAdmin a um usuário: Firestore → usuarios/[uid] → isAdmin: true
          </span>
        </div>

      </div>

      {/* ── Keyframes globais (injetados inline) ────────────────────────── */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
