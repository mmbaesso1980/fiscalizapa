/**
 * PerfilPage.jsx — O Cofre do Arquiteto  (/perfil)
 *
 * Rota protegida: exibe o perfil do usuário autenticado,
 * o saldo de créditos em tempo real e a lista completa dos
 * dossiês já desbloqueados (subcoleção usuarios/{uid}/dossies_desbloqueados).
 *
 * Usuários que retornam podem acessar dossiês pagos sem gastar créditos novamente.
 */

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div style={{
      padding: "14px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.6)", border: "1px solid #EDEBE8",
      display: "flex", gap: 12, alignItems: "center",
      animation: "pulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#F0EDE8", flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ height: 13, width: "55%", background: "#F0EDE8", borderRadius: 6 }} />
        <div style={{ height: 10, width: "35%", background: "#F5F3F0", borderRadius: 6 }} />
      </div>
    </div>
  );
}

// ─── Card de dossiê desbloqueado ──────────────────────────────────────────────
function DossieCard({ dossie }) {
  const dt = dossie.desbloqueadoEm?.toDate?.();
  const dateStr = dt
    ? dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : "–";

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            14,
      padding:        "14px 18px",
      background:     "rgba(255,255,255,0.75)",
      borderRadius:   14,
      border:         "1px solid rgba(237,235,232,0.9)",
      backdropFilter: "blur(8px)",
      boxShadow:      "0 2px 12px rgba(0,0,0,0.04)",
      transition:     "box-shadow 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.04)"}
    >
      {/* Foto ou avatar */}
      <div style={{ flexShrink: 0, position: "relative" }}>
        {dossie.urlFoto ? (
          <img
            src={dossie.urlFoto}
            alt={dossie.nomePolitico}
            style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover",
                     border: "2px solid #FBD87F" }}
            onError={e => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "linear-gradient(135deg, #FBD87F, #F7B98B)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: "#7A4F1E",
          }}>
            {(dossie.nomePolitico ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        {/* Ícone de desbloqueado */}
        <div style={{
          position: "absolute", bottom: -2, right: -2,
          width: 16, height: 16, borderRadius: "50%",
          background: "rgba(46,127,24,0.9)", border: "2px solid #FFF",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8,
        }}>
          ✓
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#2D2D2D",
                    marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {dossie.nomePolitico ?? "Político"}
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {dossie.partido && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px",
                           borderRadius: 99, background: "#F5F3F0", color: "#666" }}>
              {dossie.partido}
            </span>
          )}
          {dossie.uf && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px",
                           borderRadius: 99, background: "#F5F3F0", color: "#666" }}>
              {dossie.uf}
            </span>
          )}
          <span style={{ fontSize: 10, color: "#AAA" }}>Desbloqueado {dateStr}</span>
        </div>
      </div>

      {/* Botão */}
      <Link
        to={`/dossie/${dossie.politicoId}`}
        style={{
          flexShrink:   0,
          padding:      "7px 16px",
          background:   "linear-gradient(135deg, #1A1A2E, #2D2D2D)",
          color:        "#FBD87F",
          borderRadius: 9,
          fontSize:     12,
          fontWeight:   700,
          textDecoration: "none",
          fontFamily:   "'Space Grotesk', sans-serif",
          whiteSpace:   "nowrap",
          boxShadow:    "0 2px 8px rgba(0,0,0,0.15)",
          transition:   "opacity 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
      >
        🔓 Acessar Dossiê
      </Link>
    </div>
  );
}

// ─── Badge de créditos ────────────────────────────────────────────────────────
function CreditBadgeLarge({ credits }) {
  const c = credits ?? 0;
  const color = c >= 200 ? "#2E7F18" : c >= 50 ? "#D97706" : "#C82538";
  const bg    = c >= 200 ? "rgba(46,127,24,0.08)"  : c >= 50 ? "rgba(217,119,6,0.08)"  : "rgba(200,37,56,0.08)";
  const label = c >= 200 ? "Saldo premium"          : c >= 50 ? "Saldo baixo"           : "Saldo crítico";

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      gap:            16,
      padding:        "18px 24px",
      background:     bg,
      borderRadius:   16,
      border:         `1px solid ${color}22`,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: `${color}15`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24,
      }}>
        💳
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, fontFamily: "'Space Grotesk',sans-serif" }}>
          {credits !== null ? c.toLocaleString("pt-BR") : "…"}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
          créditos disponíveis · <span style={{ color, fontWeight: 600 }}>{label}</span>
        </div>
      </div>
      <Link
        to="/creditos"
        style={{
          marginLeft:   "auto",
          padding:      "8px 16px",
          background:   "linear-gradient(135deg, #FBD87F, #F7B98B)",
          color:        "#7A4F1E",
          borderRadius: 10,
          fontSize:     12,
          fontWeight:   700,
          textDecoration: "none",
          fontFamily:   "'Space Grotesk',sans-serif",
          boxShadow:    "0 3px 10px rgba(251,216,127,0.4)",
          whiteSpace:   "nowrap",
        }}
      >
        + Comprar créditos
      </Link>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PerfilPage() {
  const { user, credits } = useAuth();
  const navigate          = useNavigate();

  const [dossies,  setDossies ] = useState([]);
  const [loading,  setLoading ] = useState(true);

  // Redireciona se não autenticado
  useEffect(() => {
    if (user === null) navigate("/", { replace: true });
  }, [user, navigate]);

  // Carregar dossiês desbloqueados
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const q = query(
          collection(db, "usuarios", user.uid, "dossies_desbloqueados"),
          orderBy("desbloqueadoEm", "desc"),
        );
        const snap = await getDocs(q);
        if (!cancelled) {
          setDossies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch {
        // Índice pode não existir — tenta sem orderBy
        try {
          const q2 = collection(db, "usuarios", user.uid, "dossies_desbloqueados");
          const snap2 = await getDocs(q2);
          if (!cancelled) {
            setDossies(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
          }
        } catch { if (!cancelled) setDossies([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return null;

  const nome       = user.displayName ?? user.email?.split("@")[0] ?? "Arquiteto";
  const emailStr   = user.email ?? "–";
  const iniciais   = nome.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 64 }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "36px 20px" }}>

        {/* ── Cabeçalho ────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 26,
                       fontWeight: 700, color: "#2D2D2D", marginBottom: 6 }}>
            O Cofre do Arquiteto
          </h1>
          <p style={{ fontSize: 13, color: "#888" }}>
            Seus dossiês adquiridos e saldo de créditos do sistema A.S.M.O.D.E.U.S.
          </p>
        </div>

        {/* ── Card do usuário ───────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16, padding: "18px 22px",
          background: "rgba(255,255,255,0.75)", borderRadius: 18,
          border: "1px solid rgba(237,235,232,0.8)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          marginBottom: 18,
        }}>
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={nome}
              style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover",
                       border: "3px solid #FBD87F", flexShrink: 0 }}
            />
          ) : (
            <div style={{
              width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg, #FBD87F, #F7B98B)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22, fontWeight: 800, color: "#7A4F1E",
            }}>
              {iniciais}
            </div>
          )}
          <div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#2D2D2D",
                         fontFamily: "'Space Grotesk',sans-serif", marginBottom: 3 }}>
              {nome}
            </p>
            <p style={{ fontSize: 12, color: "#888" }}>{emailStr}</p>
          </div>
        </div>

        {/* ── Saldo de créditos ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <CreditBadgeLarge credits={credits} />
        </div>

        {/* ── Dossiês desbloqueados ─────────────────────────────────────── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 14, gap: 8 }}>
            <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16,
                         fontWeight: 700, color: "#2D2D2D" }}>
              Dossiês Adquiridos
              {!loading && (
                <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "#AAA" }}>
                  ({dossies.length})
                </span>
              )}
            </h2>
            <Link
              to="/ranking"
              style={{ fontSize: 12, color: "#888", textDecoration: "none",
                       fontWeight: 500, whiteSpace: "nowrap" }}
            >
              + Explorar políticos
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
            </div>
          ) : dossies.length === 0 ? (
            <div style={{
              padding: "36px 24px", textAlign: "center",
              background: "rgba(255,255,255,0.6)", borderRadius: 16,
              border: "1px dashed #DDD8D0",
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#2D2D2D", marginBottom: 6 }}>
                Nenhum dossiê adquirido ainda
              </p>
              <p style={{ fontSize: 12, color: "#AAA", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 20px" }}>
                Explore o Ranking de Transparência Parlamentar e desbloqueie a
                Auditoria Profunda de qualquer político por 200 créditos.
              </p>
              <Link
                to="/ranking"
                style={{
                  display: "inline-block",
                  padding: "10px 24px",
                  background: "linear-gradient(135deg, #FBD87F, #F7B98B)",
                  color: "#7A4F1E", borderRadius: 10,
                  fontWeight: 700, fontSize: 13, textDecoration: "none",
                  fontFamily: "'Space Grotesk',sans-serif",
                  boxShadow: "0 4px 12px rgba(251,216,127,0.4)",
                }}
              >
                🔍 Ver Ranking
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dossies.map(d => <DossieCard key={d.id} dossie={d} />)}
            </div>
          )}
        </div>

        {/* ── Nota de rodapé ────────────────────────────────────────────── */}
        <p style={{ marginTop: 32, fontSize: 11, color: "#CCC", textAlign: "center" }}>
          Dossiês desbloqueados permanecem acessíveis indefinidamente. ·{" "}
          <Link to="/metodologia" style={{ color: "#CCC" }}>Ver metodologia</Link>
        </p>

      </div>
    </div>
  );
}
