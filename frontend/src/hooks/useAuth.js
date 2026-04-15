/**
 * useAuth.js — Hook central de autenticação e créditos do TransparenciaBR
 *
 * Responsabilidades:
 *  • Gerencia estado de autenticação Firebase (Google, GitHub, e-mail)
 *  • Ao criar conta nova, escreve usuarios/{uid} com creditos_bonus de boas-vindas
 *  • Saldo exibido = creditos + creditos_bonus (onSnapshot)
 *  • deductCredits — consome bônus primeiro (mesma regra que CreditGate)
 *  • Mantém compatibilidade com Cloud Functions legadas (getUser, session mgmt)
 *
 * NOTA: Usando signInWithRedirect em vez de signInWithPopup para evitar
 *       bloqueio de popups em domínios customizados (transparenciabr.com.br).
 */

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, googleProvider, githubProvider, functions, db } from "../lib/firebase";
import { spendUserCredits } from "../lib/creditsFirestore";
import {
  CREDITOS_COMPRADOS_INICIAIS,
  CREDITOS_BONUS_BOAS_VINDAS,
} from "../lib/creditConstants";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSessionId() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

const DAILY_QUOTA_DEFAULT = 2;

async function ensureUserDoc(u) {
  const ref  = doc(db, "usuarios", u.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid:                         u.uid,
      email:                       u.email ?? "",
      nome:                        u.displayName ?? "",
      photoURL:                    u.photoURL ?? "",
      creditos:                    CREDITOS_COMPRADOS_INICIAIS,
      creditos_bonus:              CREDITOS_BONUS_BOAS_VINDAS,
      dossies_gratuitos_restantes: DAILY_QUOTA_DEFAULT,
      plano:                       "free",
      isAdmin:                     u.uid === "X8cHski54Dd6FiHULRJSk3Mjbol2" ? true : false,
      criadoEm:                    serverTimestamp(),
      atualizadoEm:                serverTimestamp(),
    });
    return CREDITOS_BONUS_BOAS_VINDAS;
  }

  const d = snap.data();
  return (d?.creditos ?? 0) + (d?.creditos_bonus ?? 0);
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function useAuth() {
  const [user,              setUser             ] = useState(null);
  const [loading,           setLoading          ] = useState(true);
  const [credits,           setCredits          ] = useState(null);
  const [creditsComprado,   setCreditsComprado  ] = useState(null);
  const [creditsBonus,      setCreditsBonus     ] = useState(null);
  const [dailyQuota,        setDailyQuota       ] = useState(null);
  const [isAdmin,           setIsAdmin          ] = useState(null);
  const [adminFromClaims,   setAdminFromClaims  ] = useState(false);
  const [adminFromFirestore,setAdminFromFirestore] = useState(false);
  const [sessionError,      setSessionError     ] = useState(null);

  const [sessionId] = useState(() => {
    // sessionStorage pode falhar em contextos de terceiro — fallback para memória
    try {
      const existing = sessionStorage.getItem("tbr_session_id");
      if (existing) return existing;
      const newId = generateSessionId();
      sessionStorage.setItem("tbr_session_id", newId);
      return newId;
    } catch {
      return generateSessionId();
    }
  });

  // ── Processar resultado do redirect (Google / GitHub) ─────────────────────
  // Roda UMA vez ao montar — captura o resultado após o redirect OAuth e provisiona Firestore cedo.
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (result?.user) {
          try {
            await ensureUserDoc(result.user);
          } catch {
            /* onAuthStateChanged também chama ensureUserDoc */
          }
        }
      })
      .catch((err) => {
        if (!err?.code?.includes("cancelled") && !err?.code?.includes("popup-closed")) {
          console.warn("getRedirectResult error:", err.code, err.message);
        }
      });
  }, []);

  // ── Listener de autenticação ──────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);

      if (!u) {
        setCredits(null);
        setCreditsComprado(null);
        setCreditsBonus(null);
        setAdminFromClaims(false);
        setAdminFromFirestore(false);
        try { localStorage.removeItem("userCredits"); } catch { /* noop */ }
        return;
      }

      (async () => {
        try {
          const tr = await u.getIdTokenResult();
          setAdminFromClaims(tr.claims.admin === true || tr.claims.isAdmin === true);
        } catch {
          setAdminFromClaims(false);
        }
      })();

      try {
        const stored = localStorage.getItem("userCredits");
        if (stored) setCredits(parseInt(stored, 10));
      } catch { /* noop */ }

      (async () => {
        try { await ensureUserDoc(u); } catch (e) { console.warn("ensureUserDoc:", e.message); }

        try {
          const registerSess = httpsCallable(functions, "registerUserSession");
          await registerSess({ sessionId, deviceInfo: { ua: navigator.userAgent } });
        } catch (e) { console.warn("Session registration:", e.message); }

        try {
          const getUser  = httpsCallable(functions, "getUser");
          const result   = await getUser();
          const cloudCr  = result.data?.credits;
          if (cloudCr !== undefined) {
            setCredits(prev => (prev === null ? cloudCr : prev));
            try { localStorage.setItem("userCredits", String(cloudCr)); } catch { /* noop */ }
          }
        } catch (e) { console.warn("getUser (CF):", e.message); }

        try {
          const urlParams = new URLSearchParams(window.location.search);
          const refCode   = urlParams.get("ref");
          if (refCode) {
            const processRef = httpsCallable(functions, "processReferralCode");
            await processRef({ codigoReferral: refCode });
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch (e) { console.warn("Referral:", e.message); }
      })();
    });
  }, []);

  // ── Listener Firestore em tempo real (créditos + isAdmin) ────────────────
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setDailyQuota(null);
      return;
    }

    const ref   = doc(db, "usuarios", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data     = snap.data();
          const comprado = data?.creditos ?? 0;
          const bonus    = data?.creditos_bonus ?? 0;
          const total    = comprado + bonus;
          setCredits(total);
          setCreditsComprado(comprado);
          setCreditsBonus(bonus);
          try { localStorage.setItem("userCredits", String(total)); } catch { /* noop */ }
          setAdminFromFirestore(data?.isAdmin === true || data?.role === "admin");
          setDailyQuota(data?.dossies_gratuitos_restantes ?? 0);
        } else {
          setAdminFromFirestore(false);
          setDailyQuota(0);
          setCreditsComprado(0);
          setCreditsBonus(0);
        }
      },
      (err) => {
        console.warn("onSnapshot (usuarios):", err.message);
        setAdminFromFirestore(false);
        setDailyQuota(0);
      },
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    setIsAdmin(adminFromClaims || adminFromFirestore);
  }, [user, adminFromClaims, adminFromFirestore]);

  // ── Validação de sessão periódica ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const validate = httpsCallable(functions, "validateUserSession");
        const result   = await validate({ sessionId });
        if (!result.data.valid) {
          setSessionError(result.data.motivo || "Sessão encerrada em outro dispositivo.");
          await signOut(auth);
        }
      } catch (_) { /* silently fail */ }
    }, 60_000);
    return () => clearInterval(interval);
  }, [user, sessionId]);

  // ─── Ações de autenticação ────────────────────────────────────────────────
  // signInWithRedirect: compatível com domínios customizados e browsers que
  // bloqueiam popups (Chrome, Safari em mobile, etc).
  const login           = () => signInWithRedirect(auth, googleProvider);
  const loginWithGitHub = () => signInWithRedirect(auth, githubProvider);
  const loginWithEmail  = (email, password) => signInWithEmailAndPassword(auth, email, password);

  const registerWithEmail = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        uid:                         cred.user.uid,
        email,
        nome:                        "",
        photoURL:                    "",
        creditos:                    CREDITOS_COMPRADOS_INICIAIS,
        creditos_bonus:              CREDITOS_BONUS_BOAS_VINDAS,
        dossies_gratuitos_restantes: DAILY_QUOTA_DEFAULT,
        plano:                       "free",
        isAdmin:                     cred.user.uid === "X8cHski54Dd6FiHULRJSk3Mjbol2" ? true : false,
        criadoEm:                    serverTimestamp(),
        atualizadoEm:                serverTimestamp(),
      });
      setCredits(CREDITOS_BONUS_BOAS_VINDAS);
      setDailyQuota(DAILY_QUOTA_DEFAULT);
      try { localStorage.setItem("userCredits", String(CREDITOS_BONUS_BOAS_VINDAS)); } catch { /* noop */ }
    } catch (e) {
      console.warn("Erro ao criar doc usuário:", e.message);
    }
    return cred;
  };

  const logout = () => signOut(auth);

  const deductCredits = async (amount, descricao = "Consumo de créditos") => {
    if (!user) throw new Error("Usuário não autenticado.");
    await spendUserCredits(db, user.uid, amount, descricao);
  };

  const useQuota = async () => {
    if (!user) throw new Error("Usuário não autenticado.");
    const ref = doc(db, "usuarios", user.uid);
    await runTransaction(db, async (tx) => {
      const snap    = await tx.get(ref);
      const current = snap.data()?.dossies_gratuitos_restantes ?? 0;
      if (current <= 0) {
        throw new Error("Sua cota diária gratuita foi esgotada. Tente amanhã ou use créditos.");
      }
      tx.update(ref, {
        dossies_gratuitos_restantes: current - 1,
        atualizadoEm:                serverTimestamp(),
      });
    });
  };

  return {
    user, loading,
    login, loginWithGitHub, loginWithEmail, registerWithEmail, logout,
    credits, creditsComprado, creditsBonus, deductCredits,
    dailyQuota, useQuota,
    isAdmin, sessionId, sessionError, setSessionError,
  };
}
