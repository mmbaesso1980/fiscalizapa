/**
 * GlobalSearch.jsx — Barra de busca global do TransparenciaBR
 *
 * Busca políticos por nome no Firestore (deputados_federais) com:
 *  • Cache de módulo (5 min) — não recarrega a cada keystroke
 *  • Debounce de 500ms — sem chamadas excessivas ao Firestore
 *  • Dropdown glassmorphism com foto, cargo e partido
 *  • Ao clicar: navega para /dossie/:id
 *  • Fecha ao clicar fora ou pressionar Escape
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

// ─── Cache de módulo ──────────────────────────────────────────────────────────
let _cachedDeputados = null;
let _cacheTime       = 0;
const CACHE_TTL      = 5 * 60 * 1000; // 5 minutos
const MAX_RESULTS    = 7;

async function getDeputados() {
  if (_cachedDeputados && Date.now() - _cacheTime < CACHE_TTL) {
    return _cachedDeputados;
  }
  const snap = await getDocs(collection(db, "deputados_federais"));
  _cachedDeputados = snap.docs.map(d => ({
    id:       d.id,
    nome:     d.data().nome || d.data().nomeCompleto || d.id,
    partido:  d.data().partido || "–",
    uf:       d.data().uf || "",
    urlFoto:  d.data().urlFoto || d.data().foto || null,
    score:    parseFloat(d.data().score ?? 0),
  }));
  _cacheTime = Date.now();
  return _cachedDeputados;
}

function normalize(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ─── Placeholder de avatar ────────────────────────────────────────────────────
const AVATAR_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%23EDEBE8'/%3E%3Ccircle cx='20' cy='15' r='7' fill='%23CCC'/%3E%3Cellipse cx='20' cy='36' rx='12' ry='9' fill='%23CCC'/%3E%3C/svg%3E`;

// ─── Item do dropdown ─────────────────────────────────────────────────────────
function ResultItem({ dep, onSelect, isFocused }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onSelect(dep); }}
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            10,
        width:          "100%",
        padding:        "9px 14px",
        background:     isFocused ? "rgba(251,216,127,0.12)" : "transparent",
        border:         "none",
        borderBottom:   "1px solid rgba(237,235,232,0.6)",
        cursor:         "pointer",
        textAlign:      "left",
        transition:     "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(251,216,127,0.12)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = isFocused ? "rgba(251,216,127,0.12)" : "transparent"; }}
    >
      <img
        src={dep.urlFoto || AVATAR_SVG}
        alt={dep.nome}
        onError={e => { e.target.src = AVATAR_SVG; }}
        style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                 border: "1px solid #EDEBE8" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#2D2D2D",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dep.nome}
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          {dep.partido}{dep.uf ? ` · ${dep.uf}` : ""} · Deputado Federal
        </div>
      </div>
      <span style={{ fontSize: 10, color: "#CCC", flexShrink: 0 }}>Dossiê →</span>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function GlobalSearch({ className = "" }) {
  const navigate      = useNavigate();
  const [query,       setQuery      ] = useState("");
  const [results,     setResults    ] = useState([]);
  const [loading,     setLoading    ] = useState(false);
  const [open,        setOpen       ] = useState(false);
  const [focusIdx,    setFocusIdx   ] = useState(-1);
  const inputRef      = useRef(null);
  const containerRef  = useRef(null);
  const debounceRef   = useRef(null);

  // ── Fechar ao clicar fora ───────────────────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setFocusIdx(-1);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // ── Busca com debounce 500ms ────────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);
    const term = query.trim();

    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const all      = await getDeputados();
        const termNorm = normalize(term);
        const matched  = all
          .filter(d => normalize(d.nome).includes(termNorm))
          .sort((a, b) => {
            // Prioriza matches no início do nome
            const aStarts = normalize(a.nome).startsWith(termNorm) ? 0 : 1;
            const bStarts = normalize(b.nome).startsWith(termNorm) ? 0 : 1;
            return aStarts - bStarts || b.score - a.score;
          })
          .slice(0, MAX_RESULTS);

        setResults(matched);
        setOpen(matched.length > 0);
        setFocusIdx(-1);
      } catch (err) {
        console.warn("GlobalSearch error:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // ── Navegação por teclado ───────────────────────────────────────────────────
  const onKeyDown = useCallback(e => {
    if (!open) return;
    if (e.key === "Escape")     { setOpen(false); setFocusIdx(-1); return; }
    if (e.key === "ArrowDown")  { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === "ArrowUp")    { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && focusIdx >= 0) {
      e.preventDefault();
      navigate(`/dossie/${results[focusIdx].id}`);
      setOpen(false);
      setQuery("");
    }
  }, [open, results, focusIdx, navigate]);

  const onSelect = useCallback(dep => {
    navigate(`/dossie/${dep.id}`);
    setOpen(false);
    setQuery("");
  }, [navigate]);

  return (
    <div ref={containerRef} className={className} style={{ position: "relative", width: 260, maxWidth: "100%" }}>
      {/* Input */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            8,
        background:     "rgba(255,255,255,0.85)",
        border:         `1px solid ${open ? "#C9A84C" : "#EDEBE8"}`,
        borderRadius:   100,
        padding:        "6px 12px",
        backdropFilter: "blur(8px)",
        transition:     "border-color 0.2s, box-shadow 0.2s",
        boxShadow:      open ? "0 0 0 3px rgba(201,168,76,0.12)" : "none",
      }}>
        {/* Ícone lupa / spinner */}
        {loading ? (
          <div style={{
            width: 14, height: 14, border: "2px solid #DDD",
            borderTopColor: "#C9A84C", borderRadius: "50%",
            animation: "spin 0.7s linear infinite", flexShrink: 0,
          }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="#AAA" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Buscar político…"
          style={{
            flex:        1,
            border:      "none",
            background:  "transparent",
            fontSize:    13,
            color:       "#2D2D2D",
            outline:     "none",
            fontFamily:  "'Inter', sans-serif",
          }}
          aria-label="Buscar político"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: "#CCC", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}
            aria-label="Limpar busca"
          >×</button>
        )}
      </div>

      {/* Dropdown glassmorphism */}
      {open && results.length > 0 && (
        <div style={{
          position:          "absolute",
          top:               "calc(100% + 8px)",
          left:              "50%",
          transform:         "translateX(-50%)",
          width:             340,
          background:        "rgba(255,255,255,0.92)",
          backdropFilter:    "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderRadius:      14,
          boxShadow:         "0 12px 40px rgba(0,0,0,0.14), 0 0 0 1px rgba(255,255,255,0.6)",
          border:            "1px solid rgba(237,235,232,0.8)",
          overflow:          "hidden",
          zIndex:            300,
          animation:         "fadeInUp 0.15s ease-out",
        }}>
          <div style={{ padding: "8px 14px 6px", fontSize: 10, fontWeight: 700,
                        color: "#AAA", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Políticos — clique para ver o Dossiê
          </div>
          {results.map((dep, i) => (
            <ResultItem
              key={dep.id}
              dep={dep}
              onSelect={onSelect}
              isFocused={i === focusIdx}
            />
          ))}
          <div style={{ padding: "6px 14px 8px", fontSize: 10, color: "#CCC", textAlign: "right" }}>
            ↑↓ navegar · Enter selecionar · Esc fechar
          </div>
        </div>
      )}
    </div>
  );
}
