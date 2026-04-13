/**
 * Transação atômica: consome créditos (creditos_bonus primeiro, depois creditos)
 * e registra em usuarios/{uid}/historico_creditos.
 * Coleção canônica: usuarios (projeto Firebase / Codex).
 */
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { usuarioCreditosIlimitados } from "./creditWallet";

function histDocId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} userId
 * @param {number} custo - inteiro > 0
 * @param {string} descricao
 */
export async function spendUserCredits(db, userId, custo, descricao) {
  const amount = Math.floor(Number(custo));
  if (!userId) throw new Error("Usuário não autenticado.");
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error("Valor de créditos inválido.");
  }

  const ref = doc(db, "usuarios", userId);
  const histCol = collection(db, "usuarios", userId, "historico_creditos");

  // Passo 0: Garantir que o doc existe (cria se não existir)
  const preCheck = await getDoc(ref);
  if (!preCheck.exists()) {
    await setDoc(ref, {
      uid: userId,
      email: "",
      nome: "",
      photoURL: "",
      creditos: 0,
      creditos_bonus: 10,
      dossies_gratuitos_restantes: 2,
      plano: "free",
      isAdmin: false,
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp(),
    });
    throw new Error(
      "Bem-vindo! Você recebeu 10 créditos de boas-vindas. Toque novamente para desbloquear.",
    );
  }

  const preData = preCheck.data();
  if (usuarioCreditosIlimitados(preData)) {
    return;
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Perfil não encontrado. Recarregue a página.");

    const dados = snap.data();
    if (usuarioCreditosIlimitados(dados)) {
      return;
    }
    const saldoComprado = Number(dados.creditos ?? 0);
    const saldoBonus = Number(dados.creditos_bonus ?? 0);
    const total = saldoComprado + saldoBonus;

    if (total < amount) {
      throw new Error(
        `Saldo insuficiente: você tem ${total} crédito(s), necessário ${amount}.`,
      );
    }

    let novoBonus = saldoBonus;
    let novoSaldo = saldoComprado;
    if (novoBonus >= amount) {
      novoBonus -= amount;
    } else {
      const resto = amount - novoBonus;
      novoBonus = 0;
      novoSaldo -= resto;
    }

    tx.update(ref, {
      creditos: novoSaldo,
      creditos_bonus: novoBonus,
      atualizadoEm: serverTimestamp(),
    });

    const histRef = doc(histCol, histDocId());
    tx.set(histRef, {
      tipo: "uso",
      valor: -amount,
      descricao: String(descricao || "").slice(0, 500),
      ts: serverTimestamp(),
    });
  });
}

/**
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} userId
 * @param {number} custo
 */
export async function userHasEnoughCredits(db, userId, custo) {
  const amount = Math.floor(Number(custo));
  if (!userId || !Number.isFinite(amount) || amount < 1) return false;
  const snap = await getDoc(doc(db, "usuarios", userId));
  if (!snap.exists()) return false;
  const d = snap.data();
  if (usuarioCreditosIlimitados(d)) return true;
  const total = Number(d.creditos ?? 0) + Number(d.creditos_bonus ?? 0);
  return total >= amount;
}
