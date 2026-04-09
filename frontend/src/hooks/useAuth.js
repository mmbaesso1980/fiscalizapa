/**
 * useAuth.js — Hook central de autenticação e créditos do TransparenciaBR
 *
 * Responsabilidades:
 *  • Gerencia estado de autenticação Firebase (Google, GitHub, e-mail)
 *  • Ao criar conta nova, escreve documento em Firestore: usuarios/{uid}
 *    com campo creditos: 10
 *  • Mantém créditos em tempo real via onSnapshot (Firestore)
 *  • Expõe deductCredits(amount) — transação atômica que desconta créditos
 *  • Mantém compatibilidade com Cloud Functions legadas (getUser, session mgmt)
 */

import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSessionId() {
  return "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

const CREDITOS_INICIAIS    = 10;
const DAILY_QUOTA_DEFAULT  = 2;  // cotas gratuitas por dia (resetadas por 12_reset_quotes.py)

/**
 * Garante que o documento usuarios/{uid} existe no Firestore.
 * Se não existir, cria com creditos + dossies_gratuitos_restantes iniciais.
 * Se existir, atualiza apenas campos de perfil (sem tocar em creditos ou cota).
 */
async function ensureUserDoc(u) {
  const ref  = doc(db, "usuarios", u.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid:                         u.uid,
      email:                       u.email ?? "",
      nome:                        u.displayName ?? "",
      photoURL:                    u.photoURL ?? "",
      creditos:                    CREDITOS_INICIAIS,
      dossies_gratuitos_restantes: DAILY_QUOTA_DEFAULT,
      plano:                       "free",
      isAdmin:                     false,
      criadoEm:                    serverTimestamp(),
      atualizadoEm:                serverTimestamp(),
    });
    return CREDITOS_INICIAIS;
  }

  // Doc já existe: não escreve nada — onSnapshot já lê os dados em tempo real.
  return snap.data()?.creditos ?? 0;
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function useAuth() {
  const [user,         setUser        ] = useState(null);
  const [loading,      setLoading     ] = useState(true);
  const [credits,      setCredits     ] = useState(null);
  const [dailyQuota,   setDailyQuota  ] = useState(null); // dossies_gratuitos_restantes
  const [isAdmin,      setIsAdmin     ] = useState(null); // null = carregando
  const [sessionError, setSessionError] = useState(null);

  const [sessionId] = useState(() => {
    const existing = sessionStorage.getItem("tbr_session_id");
    if (existing) return existing;
    const newId = generateSessionId();
    sessionStorage.setItem("tbr_session_id", newId);
    return newId;
  });

  // ── Listener de autenticação ──────────────────────────────────────────────
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);

      if (!u) {
        setCredits(null);
        localStorage.removeItem("userCredits");
        return;
      }

      // Créditos do localStorage enquanto aguarda Firestore
      const stored = localStorage.getItem("userCredits");
      if (stored) setCredits(parseInt(stored, 10));

      // Cloud Functions legadas em background (não bloqueiam)
      // ensureUserDoc também roda em background — onSnapshot já entrega os dados.
      (async () => {
        try {
          await ensureUserDoc(u);
        } catch (e) {
          console.warn("ensureUserDoc failed:", e.message);
        }

        try {
          const registerSess = httpsCallable(functions, "registerUserSession");
          await registerSess({ sessionId, deviceInfo: { ua: navigator.userAgent } });
        } catch (e) {
          console.warn("Session registration failed:", e.message);
        }

        try {
          const getUser = httpsCallable(functions, "getUser");
          const result  = await getUser();
          const cloudCredits = result.data?.credits;
          if (cloudCredits !== undefined) {
            // Apenas atualiza se o Firestore ainda não respondeu
            setCredits(prev => (prev === null ? cloudCredits : prev));
            localStorage.setItem("userCredits", String(cloudCredits));
          }
        } catch (e) {
          console.warn("getUser (CF) failed:", e.message);
        }

        try {
          const urlParams = new URLSearchParams(window.location.search);
          const refCode   = urlParams.get("ref");
          if (refCode) {
            const processRef = httpsCallable(functions, "processReferralCode");
            await processRef({ codigoReferral: refCode });
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch (e) {
          console.warn("Referral processing failed:", e.message);
        }
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
          const creditos = data?.creditos ?? 0;
          setCredits(creditos);
          localStorage.setItem("userCredits", String(creditos));
          setIsAdmin(data?.isAdmin === true);
          setDailyQuota(data?.dossies_gratuitos_restantes ?? 0);
        } else {
          setIsAdmin(false);
          setDailyQuota(0);
        }
      },
      (err) => {
        console.warn("onSnapshot (usuarios) error:", err.message);
        setIsAdmin(false);
        setDailyQuota(0);
      },
    );
    return unsub;
  }, [user]);

  // ── Validação de sessão periódica (anti-login simultâneo) ─────────────────
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
      } catch (_) {
        // silently fail
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [user, sessionId]);

  // ─── Ações de autenticação ────────────────────────────────────────────────
  const login           = () => signInWithPopup(auth, googleProvider);
  const loginWithGitHub = () => signInWithPopup(auth, githubProvider);
  const loginWithEmail  = (email, password) => signInWithEmailAndPassword(auth, email, password);

  /**
   * Cria conta com e-mail + senha e já provisiona o documento Firestore
   * com creditos: 10, garantindo que o novo usuário tenha saldo inicial.
   */
  const registerWithEmail = async (email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try {
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        uid:                         cred.user.uid,
        email,
        nome:                        "",
        photoURL:                    "",
        creditos:                    CREDITOS_INICIAIS,
        dossies_gratuitos_restantes: DAILY_QUOTA_DEFAULT,
        plano:                       "free",
        isAdmin:                     false,
        criadoEm:                    serverTimestamp(),
        atualizadoEm:                serverTimestamp(),
      });
      setCredits(CREDITOS_INICIAIS);
      setDailyQuota(DAILY_QUOTA_DEFAULT);
      localStorage.setItem("userCredits", String(CREDITOS_INICIAIS));
    } catch (e) {
      console.warn("Erro ao criar documento de usuário:", e.message);
    }
    return cred;
  };

  const logout = () => signOut(auth);

  /**
   * Desconta `amount` créditos do usuário via transação atômica no Firestore.
   * Lança Error se saldo insuficiente ou usuário não autenticado.
   * O onSnapshot atualizará setCredits automaticamente após a transação.
   */
  const deductCredits = async (amount) => {
    if (!user) throw new Error("Usuário não autenticado.");

    const ref = doc(db, "usuarios", user.uid);
    await runTransaction(db, async (tx) => {
      const snap    = await tx.get(ref);
      const current = snap.data()?.creditos ?? 0;
      if (current < amount) {
        throw new Error(`Saldo insuficiente: você tem ${current} crédito(s), necessário ${amount}.`);
      }
      tx.update(ref, { creditos: current - amount, atualizadoEm: serverTimestamp() });
    });
  };

  /**
   * Consome 1 cota diária gratuita via transação atômica no Firestore.
   * Chamada no desbloqueio básico da Hotpage (IA simples).
   * Reseta automaticamente todo dia via engines/12_reset_quotes.py.
   */
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
    user,
    loading,
    login,
    loginWithGitHub,
    loginWithEmail,
    registerWithEmail,
    logout,
    credits,
    deductCredits,
    dailyQuota,
    useQuota,
    isAdmin,
    sessionId,
    sessionError,
    setSessionError,
  };
}
