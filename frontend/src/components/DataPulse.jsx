/**
 * DataPulse.jsx — Atividade em Tempo Real (Sala do Trono)
 *
 * Mostra um log visual "terminal hacker" das APIs que o Motor TransparenciaBR
 * está consultando em tempo real, lido da coleção Firestore `crawler_activity`.
 *
 * Fonte de dados:
 *   Firestore: crawler_activity/{run_id}
 *     - apis: Array<{ api_id, api_name, api_type, status, records, bodes, duration_ms }>
 *     - total_records, total_bodes, status, updatedAt
 *
 * Fallback: se Firestore estiver vazio, exibe atividade mock simulada
 * com animação contínua para demonstração visual.
 *
 * Status de API:
 *   running  → ponto azul pulsante  [>>>]
 *   done     → ponto verde fixo     [OK ]
 *   error    → ponto vermelho       [ERR]
 */

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Paleta (compatível com AdminDashboard) ───────────────────────────────────
const C = {
  bg:       "#0D1117",
  surface:  "#161B22",
  border:   "#30363D",
  text:     "#E6EDF3",
  muted:    "#8B949E",
  green:    "#56D364",
  blue:     "#58A6FF",
  cyan:     "#39D2F0",
  yellow:   "#D29922",
  red:      "#FF4C4C",
  purple:   "#BC8CFF",
  mono:     "'Fira Code', 'Cascadia Code', 'Courier New', monospace",
};

// ─── Mock de APIs para fallback ───────────────────────────────────────────────
const MOCK_APIS = [
  { api_id: "dou_rss_edicao1",           api_name: "DOU RSS Ed.1",                   api_type: "rss"      },
  { api_id: "transparencia_contratos",   api_name: "Transparência · Contratos",       api_type: "json_api" },
  { api_id: "transparencia_emendas",     api_name: "Transparência · Emendas",         api_type: "json_api" },
  { api_id: "compras_contratos",         api_name: "Compras.gov · Contratos SIASG",  api_type: "json_api" },
  { api_id: "camara_deputados",          api_name: "Câmara · Deputados",             api_type: "json_api" },
  { api_id: "camara_despesas_ceap",      api_name: "Câmara · Despesas CEAP",         api_type: "json_api" },
  { api_id: "bcb_cambio_usd",            api_name: "BCB · Câmbio USD",               api_type: "json_api" },
  { api_id: "dou_sp_imesp_rss",          api_name: "DO SP · IMESP",                  api_type: "rss"      },
  { api_id: "transparencia_cnep",        api_name: "CNEP · Empresas Punidas",        api_type: "json_api" },
  { api_id: "dou_pa_belem_rss",          api_name: "DO Belém/PA",                    api_type: "rss"      },
];

// ─── Gerador de mock (ciclo contínuo) ────────────────────────────────────────
function* mockActivityGenerator() {
  let i = 0;
  while (true) {
    const api = MOCK_APIS[i % MOCK_APIS.length];
    yield {
      ...api,
      status:     "running",
      records:    0,
      bodes:      0,
      duration_ms: 0,
      ts:          new Date(),
    };
    yield {
      ...api,
      status:      Math.random() > 0.08 ? "done" : "error",
      records:     Math.floor(Math.random() * 480) + 20,
      bodes:       Math.random() > 0.75 ? Math.floor(Math.random() * 3) + 1 : 0,
      duration_ms: Math.floor(Math.random() * 4000) + 400,
      ts:          new Date(),
    };
    i++;
  }
}

// ─── Badge de tipo de API ─────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const cfg = {
    rss:      { label: "RSS",  color: C.purple, bg: `${C.purple}18` },
    json_api: { label: "API",  color: C.cyan,   bg: `${C.cyan}18`   },
    html:     { label: "HTML", color: C.yellow, bg: `${C.yellow}18` },
  }[type] ?? { label: "API", color: C.muted, bg: "transparent" };

  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: "0.05em",
      padding: "1px 5px", borderRadius: 4,
      color: cfg.color, background: cfg.bg,
      fontFamily: C.mono,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Indicador de status ──────────────────────────────────────────────────────
function StatusDot({ status }) {
  const cfg = {
    running: { color: C.blue,   label: ">>>", anim: "pulse 1s infinite" },
    done:    { color: C.green,  label: " OK", anim: "none"              },
    error:   { color: C.red,    label: "ERR", anim: "blink 1s infinite" },
    skipped: { color: C.muted,  label: "SKP", anim: "none"              },
  }[status] ?? { color: C.muted, label: "???", anim: "none" };

  return (
    <span style={{ fontFamily: C.mono, fontSize: 9, color: cfg.color,
                   animation: cfg.anim, letterSpacing: "0.04em" }}>
      {cfg.label}
    </span>
  );
}

// ─── Linha de atividade ───────────────────────────────────────────────────────
function PulseLine({ entry }) {
  const { api_name, api_type, status, records, bodes, duration_ms, ts } = entry;
  const timeStr = (ts instanceof Date ? ts : ts?.toDate?.() ?? new Date())
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const lineColor = status === "error" ? C.red
                  : status === "running" ? C.blue
                  : bodes > 0 ? C.yellow
                  : C.text;

  return (
    <div style={{
      display:        "grid",
      gridTemplateColumns: "52px 28px 60px 1fr 60px 52px",
      gap:            6,
      alignItems:     "center",
      padding:        "3px 0",
      borderBottom:   `1px solid ${C.border}18`,
      animation:      status === "running" ? "fadeInLine 0.3s ease-out" : "none",
    }}>
      <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>{timeStr}</span>
      <StatusDot status={status} />
      <TypeBadge type={api_type} />
      <span style={{ fontFamily: C.mono, fontSize: 10, color: lineColor,
                     overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {api_name}
      </span>
      <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, textAlign: "right" }}>
        {status === "running" ? "…" : `${(records ?? 0).toLocaleString("pt-BR")} rec`}
      </span>
      <span style={{
        fontFamily: C.mono, fontSize: 9, textAlign: "right",
        color: bodes > 0 ? C.yellow : C.muted,
        fontWeight: bodes > 0 ? 700 : 400,
      }}>
        {status === "running" ? "" : bodes > 0 ? `🐐 ${bodes}` : `${duration_ms}ms`}
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function DataPulse({ maxLines = 40 }) {
  const [lines,      setLines    ] = useState([]);
  const [runInfo,    setRunInfo  ] = useState(null);
  const [useMock,    setUseMock  ] = useState(false);
  const [connected,  setConnected] = useState(false);
  const scrollRef  = useRef(null);
  const mockGenRef = useRef(null);
  const mockTimer  = useRef(null);

  // ── Firestore real-time ───────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, "crawler_activity"),
      orderBy("updatedAt", "desc"),
      limit(3),
    );

    const unsub = onSnapshot(q,
      (snap) => {
        if (snap.empty) {
          setUseMock(true);
          setConnected(false);
          return;
        }
        setUseMock(false);
        setConnected(true);

        const latest = snap.docs[0].data();
        setRunInfo(latest);

        const apiLines = (latest.apis ?? []).map(a => ({
          api_id:      a.api_id,
          api_name:    a.api_name,
          api_type:    a.api_type,
          status:      a.status,
          records:     a.records,
          bodes:       a.bodes,
          duration_ms: a.duration_ms,
          ts:          latest.updatedAt?.toDate?.() ?? new Date(),
          key:         `${a.api_id}_${Date.now()}`,
        }));

        setLines(prev => {
          const combined = [...apiLines, ...prev].slice(0, maxLines);
          return combined;
        });
      },
      () => { setUseMock(true); setConnected(false); }
    );

    return unsub;
  }, [maxLines]);

  // ── Mock animado quando Firestore vazio ───────────────────────────────────
  useEffect(() => {
    if (!useMock) {
      if (mockTimer.current) clearInterval(mockTimer.current);
      return;
    }
    if (!mockGenRef.current) {
      mockGenRef.current = mockActivityGenerator();
    }
    const tick = () => {
      const { value } = mockGenRef.current.next();
      setLines(prev => [{ ...value, key: `mock_${Date.now()}` }, ...prev].slice(0, maxLines));
    };
    tick();
    mockTimer.current = setInterval(tick, 900);
    return () => clearInterval(mockTimer.current);
  }, [useMock, maxLines]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [lines.length]);

  // ── Métricas do run ───────────────────────────────────────────────────────
  const totalRec   = lines.filter(l => l.status === "done").reduce((a, l) => a + (l.records ?? 0), 0);
  const totalBodes = lines.filter(l => l.bodes > 0).reduce((a, l) => a + (l.bodes ?? 0), 0);
  const running    = lines.filter(l => l.status === "running").length;
  const errors     = lines.filter(l => l.status === "error").length;

  return (
    <div style={{
      background:   C.surface,
      border:       `1px solid ${C.border}`,
      borderRadius: 12,
      overflow:     "hidden",
    }}>
      {/* Header tipo terminal */}
      <div style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        padding:         "10px 16px",
        borderBottom:    `1px solid ${C.border}`,
        background:      "#0D1117",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Botões macOS style */}
          <div style={{ display: "flex", gap: 5 }}>
            {["#FF5F56","#FFBD2E","#27C93F"].map(c => (
              <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
            asmodeus@crawler:~$ tail -f /engine/activity.log
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Indicador de conexão */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: connected ? C.green : C.yellow,
              animation: "blink 2s infinite",
            }} />
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>
              {connected ? "live" : "mock"}
            </span>
          </div>

          {/* Contadores */}
          {running > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.blue }}>
              {running} running
            </span>
          )}
          {errors > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.red }}>
              {errors} err
            </span>
          )}
          {totalBodes > 0 && (
            <span style={{ fontFamily: C.mono, fontSize: 9, color: C.yellow,
                           fontWeight: 700 }}>
              🐐 {totalBodes} bodes
            </span>
          )}
        </div>
      </div>

      {/* Header de colunas */}
      <div style={{
        display:    "grid",
        gridTemplateColumns: "52px 28px 60px 1fr 60px 52px",
        gap:        6,
        padding:    "5px 16px",
        borderBottom: `1px solid ${C.border}30`,
        background: "#0D111799",
      }}>
        {["HORA","ST","TIPO","API","RECS","BODES/MS"].map(h => (
          <span key={h} style={{ fontFamily: C.mono, fontSize: 8, color: C.muted,
                                  letterSpacing: "0.08em", textAlign: h === "RECS" || h === "BODES/MS" ? "right" : "left" }}>
            {h}
          </span>
        ))}
      </div>

      {/* Log de atividade */}
      <div
        ref={scrollRef}
        style={{
          padding:     "6px 16px 10px",
          maxHeight:   300,
          overflowY:   "auto",
          scrollbarWidth: "thin",
          scrollbarColor: `${C.border} transparent`,
        }}
      >
        {lines.length === 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>
              &gt; aguardando atividade do motor…
            </span>
          </div>
        ) : (
          lines.map((line, i) => (
            <PulseLine key={line.key ?? i} entry={line} />
          ))
        )}
        {/* Cursor piscante */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>
            &gt;
          </span>
          <div style={{
            width: 6, height: 11, background: C.green,
            animation: "blink 1s step-end infinite",
          }} />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding:      "7px 16px",
        borderTop:    `1px solid ${C.border}`,
        display:      "flex",
        justifyContent: "space-between",
        alignItems:   "center",
        background:   "#0D111766",
      }}>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>
          {useMock
            ? "⚠ mock · execute 10_universal_crawler.py para dados reais"
            : `run: ${runInfo?.run_id ?? "–"}`}
        </span>
        <span style={{ fontFamily: C.mono, fontSize: 9, color: C.muted }}>
          {totalRec > 0 ? `${totalRec.toLocaleString("pt-BR")} rec ingeridos` : ""}
        </span>
      </div>

      <style>{`
        @keyframes fadeInLine {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
