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
  const { user, credits, isAdmin: isAdminFromAuth } = useAuth();

  const checkCredits = useCallback(
    async (custo) => {
      if (!user) return false;
      try {
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        if (!snap.exists()) return true;
        const data = snap.data();
        if (usuarioCreditosIlimitados(data)) return true;
        if (isAdminFromAuth === true) return true;
        return userHasEnoughCredits(db, user.uid, custo);
      } catch (err) {
        console.error("checkCredits fail-open (transação é a barreira real):", err);
        return true;
      }
    },
    [user, isAdminFromAuth],
  );

  const consumirCreditos = useCallback(
    async (custo, descricao) => {
      if (!user) throw new Error("Não autenticado");
      const snap = await getDoc(doc(db, "usuarios", user.uid));
      if (snap.exists() && usuarioCreditosIlimitados(snap.data())) return;
      if (isAdminFromAuth === true) return;
      await spendUserCredits(db, user.uid, custo, descricao);
    },
    [user, isAdminFromAuth],
  );

  const saldoExibicao = useMemo(() => credits ?? null, [credits]);

  return {
    checkCredits,
    consumirCreditos,
    saldoExibicao,
    isAdmin: isAdminFromAuth === true,
  };
}
