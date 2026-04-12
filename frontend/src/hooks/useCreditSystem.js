import { useCallback } from "react";
import { useAuth } from "./useAuth";
import { db } from "../lib/firebase";
import { spendUserCredits, userHasEnoughCredits } from "../lib/creditsFirestore";

/**
 * Sistema de créditos (saldo comprado + bônus) na coleção usuarios/{uid}.
 * Consome bônus antes do saldo principal.
 */
export function useCreditSystem() {
  const { user } = useAuth();

  const checkCredits = useCallback(
    async (custo) => {
      if (!user) return false;
      return userHasEnoughCredits(db, user.uid, custo);
    },
    [user],
  );

  const consumirCreditos = useCallback(
    async (custo, descricao) => {
      if (!user) throw new Error("Não autenticado");
      await spendUserCredits(db, user.uid, custo, descricao);
    },
    [user],
  );

  return { checkCredits, consumirCreditos };
}
