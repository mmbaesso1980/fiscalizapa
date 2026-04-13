import { useCallback, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "./useAuth";
import { db } from "../lib/firebase";
import { spendUserCredits, userHasEnoughCredits } from "../lib/creditsFirestore";
import { usuarioCreditosIlimitados } from "../lib/creditWallet";

/**
 * Sistema de créditos (saldo comprado + bônus) na coleção usuarios/{uid}.
 * Consome bônus antes do saldo principal.
 * creditos_ilimitados / role admin no Firestore → não debita (definir só no Console).
 */
export function useCreditSystem() {
  const { user, credits, isAdmin: isAdminClaim } = useAuth();

  const isAdmin = Boolean(isAdminClaim);

  const checkCredits = useCallback(
    async (custo) => {
      if (!user) return false;
      if (isAdmin) return true;
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (!snap.exists()) return true;
        if (usuarioCreditosIlimitados(snap.data())) return true;
        return userHasEnoughCredits(db, user.uid, custo);
      } catch (err) {
        console.error("checkCredits fail-open (transação é a barreira real):", err);
        return true;
      }
    },
    [user, isAdmin],
  );

  const consumirCreditos = useCallback(
    async (custo, descricao) => {
      if (!user) throw new Error("Não autenticado");
      if (isAdmin) return;
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (snap.exists() && usuarioCreditosIlimitados(snap.data())) return;
      await spendUserCredits(db, user.uid, custo, descricao);
    },
    [user, isAdmin],
  );

  const saldoExibicao = useMemo(() => {
    if (isAdmin) return credits ?? null;
    return credits ?? null;
  }, [isAdmin, credits]);

  return { checkCredits, consumirCreditos, saldoExibicao, isAdmin };
}
