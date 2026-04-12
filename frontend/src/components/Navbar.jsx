import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import CreditBadge from "./CreditBadge";
import GlobalSearch from "./GlobalSearch";
import { AuditSealCompact } from "./AuditSeal";

const LogoOrb = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="orbA" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FBD87F" />
        <stop offset="35%" stopColor="#F7B98B" />
        <stop offset="65%" stopColor="#A8D8B0" />
        <stop offset="100%" stopColor="#9ECFE8" />
      </linearGradient>
      <linearGradient id="orbB" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FBD87F" stopOpacity="0.7" />
        <stop offset="50%" stopColor="#F7B98B" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#9ECFE8" stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id="orbC" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#A8D8B0" stopOpacity="0.6" />
        <stop offset="100%" stopColor="#F7B98B" stopOpacity="0.4" />
      </linearGradient>
    </defs>
    <path d="M50 8 A42 42 0 1 1 49.9 8" stroke="url(#orbA)" strokeWidth="14" fill="none" strokeLinecap="round" />
    <path d="M50 16 A34 34 0 1 0 49.9 16" stroke="url(#orbB)" strokeWidth="10" fill="none" strokeLinecap="round" />
    <path d="M50 26 A24 24 0 1 1 49.9 26" stroke="url(#orbC)" strokeWidth="7" fill="none" strokeLinecap="round" />
  </svg>
);

export default function Navbar({ user, logout, credits, isAdmin }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const firstName = user?.displayName ? user.displayName.split(" ")[0] : "";
  const initial = user?.displayName ? user.displayName.charAt(0).toUpperCase() : "?";

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 24px",
        height: 64,
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky",
        top: 0,
        zIndex: 100,
        isolation: "isolate",
      }}
    >
      <Link
        to="/"
        style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}
        onClick={() => setMobileMenuOpen(false)}
      >
        <LogoOrb size={34} />
        <span
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontWeight: 600,
            fontSize: 18,
            color: "#1a1a1a",
            letterSpacing: "-0.3px",
          }}
        >
          transparência<span style={{ color: "#9ca3af", fontWeight: 400 }}>br</span>
        </span>
      </Link>

      <div className="desktop-nav-links" style={{ display: "flex", gap: 24, alignItems: "center", flex: 1, justifyContent: "center" }}>
        <Link to="/ranking" style={navLink} className="tbr-nav-link">
          Ranking
        </Link>
      </div>

      <div className="desktop-search" style={{ flexShrink: 0 }}>
        <GlobalSearch />
      </div>

      <button
        type="button"
        className="mobile-hamburger"
        aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
        onClick={() => setMobileMenuOpen((o) => !o)}
        style={{
          display: "none",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 8,
          flexShrink: 0,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a1a1a" strokeWidth="2">
          {mobileMenuOpen ? (
            <path d="M6 6l12 12M6 18L18 6" />
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }} className="desktop-user-block">
        {user ? (
          <div ref={dropdownRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "1px solid #e5e7eb",
                borderRadius: 100,
                cursor: "pointer",
                padding: "4px 10px 4px 6px",
              }}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt={firstName} style={{ width: 26, height: 26, borderRadius: "50%" }} />
              ) : (
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg,#A8D8B0,#9ECFE8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {initial}
                </div>
              )}
              <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{firstName}</span>
              <AuditSealCompact />
              <CreditBadge credits={credits} compact />
            </button>
            {dropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  background: "#fff",
                  borderRadius: 12,
                  boxShadow: "0 8px 30px rgba(0,0,0,0.12)",
                  minWidth: 210,
                  border: "1px solid #e5e7eb",
                  zIndex: 200,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{user.displayName || "Usuario"}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{user.email}</div>
                </div>
                <button type="button" onClick={() => { setDropdownOpen(false); navigate("/usuario"); }} style={dropItem}>
                  👤 Minha conta
                </button>
                <button type="button" onClick={() => { setDropdownOpen(false); navigate("/perfil"); }} style={dropItem}>
                  🗄️ Meu Cofre
                </button>
                <button type="button" onClick={() => { setDropdownOpen(false); navigate("/creditos"); }} style={dropItem}>
                  💳 Comprar Créditos
                </button>
                <button type="button" onClick={() => { setDropdownOpen(false); navigate("/dashboard"); }} style={dropItem}>
                  ⚡ Meu Painel
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => { setDropdownOpen(false); navigate("/admin"); }}
                    style={{ ...dropItem, color: "#C82538", fontWeight: 700 }}
                  >
                    ☠️ Sala do Trono
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setDropdownOpen(false); logout(); }}
                  style={{ ...dropItem, color: "#C0392B", borderTop: "1px solid #f3f4f6" }}
                >
                  ← Sair
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="desktop-entrar-btn"
            style={{
              padding: "10px 22px",
              borderRadius: 100,
              border: "none",
              background: "#1B5E3B",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Entrar
          </button>
        )}
      </div>

      {mobileMenuOpen && (
        <div
          style={{
            position: "absolute",
            top: 64,
            left: 0,
            right: 0,
            background: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            padding: "16px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            zIndex: 99,
          }}
        >
          <div className="mobile-search" style={{ width: "100%", maxWidth: "100%" }}>
            <GlobalSearch />
          </div>
          <Link
            to="/ranking"
            style={{ fontSize: 16, color: "#1a1a1a", textDecoration: "underline", textDecorationColor: "#1B5E3B", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}
            onClick={() => setMobileMenuOpen(false)}
          >
            Ranking
          </Link>
          {user && (
            <>
              <Link
                to="/usuario"
                style={{ fontSize: 16, color: "#1a1a1a", textDecoration: "underline", textDecorationColor: "#1B5E3B", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Minha conta
              </Link>
              <Link
                to="/creditos"
                style={{ fontSize: 16, color: "#1a1a1a", textDecoration: "underline", textDecorationColor: "#1B5E3B", padding: "8px 0" }}
                onClick={() => setMobileMenuOpen(false)}
              >
                Créditos
              </Link>
            </>
          )}
          {!user && (
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate("/login");
              }}
              style={{
                padding: "12px 0",
                background: "#1B5E3B",
                color: "#fff",
                borderRadius: 10,
                border: "none",
                fontWeight: 600,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Entrar
            </button>
          )}
        </div>
      )}
    </nav>
  );
}

const navLink = {
  fontSize: 14,
  fontWeight: 500,
  color: "#1a1a1a",
  textDecoration: "underline",
  textDecorationColor: "#1B5E3B",
  textUnderlineOffset: 3,
};

const dropItem = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 16px",
  fontSize: 13,
  fontWeight: 500,
  color: "#1a1a1a",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
