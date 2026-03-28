import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, githubProvider, functions } from "../lib/firebase";

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
}

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(null);
  const [sessionId] = useState(() => {
    const existing = sessionStorage.getItem('tbr_session_id');
    if (existing) return existing;
    const newId = generateSessionId();
    sessionStorage.setItem('tbr_session_id', newId);
    return newId;
  });
  const [sessionError, setSessionError] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      // FIX: setLoading(false) imediatamente - nao bloquear na Cloud Function
      setLoading(false);

      if (u) {
        // Carregar dados em background (nao bloqueia o login)
        const stored = localStorage.getItem('userCredits');
        if (stored) setCredits(parseInt(stored, 10));

        // Cloud Functions em background - sem bloquear
        (async () => {
          try {
            const registerSess = httpsCallable(functions, "registerUserSession");
            await registerSess({ sessionId, deviceInfo: { ua: navigator.userAgent } });
          } catch (e) {
            console.warn('Session registration failed:', e.message);
          }

          try {
            const getUser = httpsCallable(functions, "getUser");
            const result = await getUser();
            const userCredits = result.data?.credits ?? 5;
            setCredits(userCredits);
            localStorage.setItem('userCredits', String(userCredits));
          } catch (e) {
            console.warn('getUser failed:', e.message);
            if (!stored) setCredits(5);
          }

          // Processar referral se houver
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            if (refCode) {
              const processRef = httpsCallable(functions, "processReferralCode");
              await processRef({ codigoReferral: refCode });
              window.history.replaceState({}, '', window.location.pathname);
            }
          } catch (e) {
            console.warn('Referral processing failed:', e.message);
          }
        })();
      } else {
        setCredits(null);
        localStorage.removeItem('userCredits');
      }
    });
  }, []);

  // Validar sessao periodicamente (anti-login simultaneo)
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const validate = httpsCallable(functions, "validateUserSession");
        const result = await validate({ sessionId });
        if (!result.data.valid) {
          setSessionError(result.data.motivo || 'Sessao encerrada em outro dispositivo.');
          await signOut(auth);
        }
      } catch (e) {
        // Silently fail
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [user, sessionId]);

  const login = () => signInWithPopup(auth, googleProvider);
  const loginWithGitHub = () => signInWithPopup(auth, githubProvider);
  const loginWithEmail = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const registerWithEmail = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  return { user, loading, login, loginWithGitHub, loginWithEmail, registerWithEmail, logout, credits, sessionId, sessionError, setSessionError };
}
