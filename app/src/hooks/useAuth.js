import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, functions } from "../lib/firebase";

// Gerar ID unico de sessao
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
      if (u) {
        try {
          // Registrar sessao (anti-login simultaneo)
          try {
            const registerSess = httpsCallable(functions, "registerUserSession");
            await registerSess({ sessionId, deviceInfo: { ua: navigator.userAgent } });
          } catch (e) {
            console.warn('Session registration failed:', e.message);
          }

          // Buscar dados do usuario
          const getUser = httpsCallable(functions, "getUser");
          const result = await getUser();
          const userCredits = result.data?.credits ?? 5;
          setCredits(userCredits);
          localStorage.setItem('userCredits', String(userCredits));

          // Processar referral se houver
          const urlParams = new URLSearchParams(window.location.search);
          const refCode = urlParams.get('ref');
          if (refCode) {
            try {
              const processRef = httpsCallable(functions, "processReferralCode");
              await processRef({ codigoReferral: refCode });
              // Limpar URL
              window.history.replaceState({}, '', window.location.pathname);
            } catch (e) {
              console.warn('Referral processing failed:', e.message);
            }
          }
        } catch (e) {
          console.error("getUser error", e);
          const stored = localStorage.getItem('userCredits');
          setCredits(stored ? parseInt(stored, 10) : 5);
        }
      } else {
        setCredits(null);
        localStorage.removeItem('userCredits');
      }
      setLoading(false);
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
        // Silently fail on validation
      }
    }, 60000); // Verificar a cada 60 segundos
    return () => clearInterval(interval);
  }, [user, sessionId]);

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return { user, loading, login, logout, credits, sessionId, sessionError, setSessionError };
}
