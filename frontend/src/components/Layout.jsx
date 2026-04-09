/**
 * Layout.jsx — Camada visual global do A.S.M.O.D.E.U.S.
 *
 * Protocolo A.F.R.O.D.I.T.E. — Redesign estético (Operação D.R.A.C.U.L.A.)
 *
 * 5 orbs com parallax e animações de drift:
 *  1. Âmbar dourado   — canto superior esquerdo  (identidade original)
 *  2. Verde Médico    — canto superior direito   (AFRODITE clean data)
 *  3. Carmesim suave  — meio esquerda            (DRACULA alert tone)
 *  4. Azul profundo   — centro-baixo             (dados forenses / inteligência)
 *  5. Violeta         — rodapé direito           (Nível 5 / parentesco)
 *
 * Cada orb reage ao scroll com parallax via requestAnimationFrame.
 * Backdrop: fundo levemente off-white (#fafaf8) — compatível com ambos os temas.
 */

import { useEffect, useRef } from "react";

// Taxas de parallax por orb (multiplicador de window.scrollY em px)
const PARALLAX_RATES = [0.07, -0.06, 0.09, -0.04, 0.05];

export default function Layout({ children }) {
  const wrapperRefs = [
    useRef(null), useRef(null), useRef(null),
    useRef(null), useRef(null),
  ];

  useEffect(() => {
    let rafId = null;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const y = window.scrollY;
        wrapperRefs.forEach((ref, i) => {
          if (ref.current) {
            ref.current.style.transform = `translateY(${y * PARALLAX_RATES[i]}px)`;
          }
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen">

      {/* ── Orbs decorativas — A.F.R.O.D.I.T.E. + parallax ─────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ zIndex: -10 }}
      >
        {/* Orb 1 — Âmbar dourado · superior esquerdo (identidade fiscal) */}
        <div ref={wrapperRefs[0]} style={{ position: "absolute", top: -200, left: -200 }}>
          <div
            className="rounded-full orb-drift-1"
            style={{
              width:      700,
              height:     700,
              background: "radial-gradient(circle at 35% 40%, #FBD87F 0%, #F7B98B 45%, rgba(247,185,139,0) 72%)",
              filter:     "blur(80px)",
              opacity:    0.22,
              mixBlendMode: "multiply",
            }}
          />
        </div>

        {/* Orb 2 — Verde Médico · superior direito (AFRODITE clean) */}
        <div ref={wrapperRefs[1]} style={{ position: "absolute", top: 40, right: -180 }}>
          <div
            className="rounded-full orb-drift-2"
            style={{
              width:      560,
              height:     560,
              background: "radial-gradient(circle at 55% 45%, #00f5d4 0%, #00d4b4 40%, rgba(0,245,212,0) 70%)",
              filter:     "blur(90px)",
              opacity:    0.12,
              mixBlendMode: "multiply",
            }}
          />
        </div>

        {/* Orb 3 — Carmesim suave · meio esquerda (DRACULA alert) */}
        <div ref={wrapperRefs[2]} style={{ position: "absolute", top: "38%", left: "-5%" }}>
          <div
            className="rounded-full orb-drift-3"
            style={{
              width:      420,
              height:     420,
              background: "radial-gradient(circle at 40% 50%, #ff0054 0%, #cc0044 45%, rgba(255,0,84,0) 70%)",
              filter:     "blur(80px)",
              opacity:    0.07,
              mixBlendMode: "multiply",
            }}
          />
        </div>

        {/* Orb 4 — Azul índigo · centro-baixo (inteligência forense) */}
        <div ref={wrapperRefs[3]} style={{ position: "absolute", bottom: "18%", left: "30%" }}>
          <div
            className="rounded-full orb-drift-4"
            style={{
              width:      500,
              height:     500,
              background: "radial-gradient(circle at 50% 50%, #818cf8 0%, #6366f1 40%, rgba(99,102,241,0) 72%)",
              filter:     "blur(85px)",
              opacity:    0.10,
              mixBlendMode: "multiply",
            }}
          />
        </div>

        {/* Orb 5 — Violeta · rodapé direito (Nível 5 / parentesco) */}
        <div ref={wrapperRefs[4]} style={{ position: "absolute", bottom: -100, right: "8%" }}>
          <div
            className="rounded-full orb-drift-1"
            style={{
              width:      380,
              height:     380,
              background: "radial-gradient(circle at 50% 50%, #a855f7 0%, #7c3aed 45%, rgba(124,58,237,0) 72%)",
              filter:     "blur(70px)",
              opacity:    0.09,
              mixBlendMode: "multiply",
              animationDuration: "36s",
            }}
          />
        </div>
      </div>

      {/* ── Conteúdo da aplicação ─────────────────────────────────────────── */}
      {children}
    </div>
  );
}
