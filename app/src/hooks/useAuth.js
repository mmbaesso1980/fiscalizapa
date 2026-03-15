import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, googleProvider, functions } from "../lib/firebase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const getUser = httpsCallable(functions, "getUser");
          const result = await getUser();
          const userCredits = result.data?.credits ?? 5;
          setCredits(userCredits);
          localStorage.setItem('userCredits', String(userCredits));
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

  const login = () => signInWithPopup(auth, googleProvider);
  const logout = () => signOut(auth);

  return { user, loading, login, logout, credits };
}
