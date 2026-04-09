/**
 * useInvestigationDraft.js — Persistência de Investigação via localStorage
 *
 * Protocolo S.E.N.T.I.N.E.L.A. — PARTE 3: Persistência de Estado
 *
 * Salva e restaura o estado de investigação do usuário no localStorage,
 * garantindo que ele retorne exatamente ao ponto onde parou ao recarregar.
 *
 * Uso:
 *   const [draft, setDraft, clearDraft] = useInvestigationDraft("health_map", {
 *     selectedUF:   null,
 *     modalUnitId:  null,
 *   });
 *
 * Chaves utilizadas no projeto:
 *   "health_map"     → { selectedUF, modalUnitId }
 *   "dossie_{id}"    → { activeTab }
 *   "ranking"        → { filterPartido, filterUF, page }
 *   "global_search"  → { lastQuery }
 *   "mapa"           → { selectedUF }
 */

import { useState, useCallback, useEffect, useRef } from "react";

const PREFIX         = "asmodeus_draft_";
const MAX_AGE_DAYS   = 7;     // drafts expiram em 7 dias
const MAX_STORE_SIZE = 50;    // máximo de chaves no localStorage

/**
 * Verifica se o draft está dentro do prazo de validade.
 */
function isExpired(savedObj) {
  if (!savedObj?.savedAt) return false;
  const age = Date.now() - new Date(savedObj.savedAt).getTime();
  return age > MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Hook principal de persistência de investigação.
 *
 * @param {string} key          - Chave única para o draft (será prefixada)
 * @param {any}    initialValue - Estado inicial (usado se não há draft ou expirou)
 * @param {object} options
 * @param {number} options.debounceMs - Delay antes de salvar (default: 400ms)
 * @param {boolean} options.enabled   - Habilita/desabilita (default: true)
 *
 * @returns {[any, function, function, object]} [state, setState, clearDraft, meta]
 *   meta: { hasDraft, savedAt, restored }
 */
export function useInvestigationDraft(key, initialValue, options = {}) {
  const {
    debounceMs = 400,
    enabled    = true,
  } = options;

  const storageKey = `${PREFIX}${key}`;
  const timerRef   = useRef(null);

  // Inicializar estado a partir do localStorage
  const [state, setState] = useState(() => {
    if (!enabled || typeof window === "undefined") return initialValue;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return initialValue;
      const saved = JSON.parse(raw);
      if (isExpired(saved)) {
        localStorage.removeItem(storageKey);
        return initialValue;
      }
      return saved.value ?? initialValue;
    } catch {
      return initialValue;
    }
  });

  const [meta, setMeta] = useState(() => {
    if (!enabled || typeof window === "undefined") return { hasDraft: false, savedAt: null, restored: false };
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return { hasDraft: false, savedAt: null, restored: false };
      const saved = JSON.parse(raw);
      if (isExpired(saved)) return { hasDraft: false, savedAt: null, restored: false };
      return { hasDraft: true, savedAt: saved.savedAt, restored: true };
    } catch {
      return { hasDraft: false, savedAt: null, restored: false };
    }
  });

  // Salvar no localStorage (com debounce para evitar escritas excessivas)
  const persistDraft = useCallback((value) => {
    if (!enabled || typeof window === "undefined") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        // Verificar espaço disponível (anti-bloat)
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
        if (allKeys.length >= MAX_STORE_SIZE) {
          // Remover o mais antigo
          const oldest = allKeys
            .map(k => ({ k, t: JSON.parse(localStorage.getItem(k) || "{}").savedAt ?? 0 }))
            .sort((a, b) => new Date(a.t) - new Date(b.t))[0];
          if (oldest) localStorage.removeItem(oldest.k);
        }
        const now = new Date().toISOString();
        localStorage.setItem(storageKey, JSON.stringify({ value, savedAt: now }));
        setMeta({ hasDraft: true, savedAt: now, restored: false });
      } catch {
        // localStorage cheio ou modo privado — falha silenciosa
      }
    }, debounceMs);
  }, [storageKey, debounceMs, enabled]);

  // Wrapper: atualiza estado E persiste
  const setDraft = useCallback((valueOrUpdater) => {
    setState(prev => {
      const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      persistDraft(next);
      return next;
    });
  }, [persistDraft]);

  // Limpar draft (restaura initialValue)
  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(initialValue);
    setMeta({ hasDraft: false, savedAt: null, restored: false });
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, initialValue]);

  // Cleanup do timer ao desmontar
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return [state, setDraft, clearDraft, meta];
}

/**
 * Hook simples para persistir um único valor escalar.
 * Wrapper de useInvestigationDraft para valores primitivos.
 */
export function useDraftValue(key, initialValue) {
  return useInvestigationDraft(key, initialValue, { debounceMs: 200 });
}

/**
 * Limpa todos os drafts do A.S.M.O.D.E.U.S. do localStorage.
 * Chamado no logout ou após limpeza manual.
 */
export function clearAllDrafts() {
  if (typeof window === "undefined") return 0;
  let count = 0;
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    keys.forEach(k => { localStorage.removeItem(k); count++; });
  } catch {}
  return count;
}

/**
 * Retorna um resumo dos drafts salvos (para debug/perfil).
 */
export function getDraftsSummary() {
  if (typeof window === "undefined") return [];
  try {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .map(k => {
        const raw = localStorage.getItem(k);
        const { savedAt } = JSON.parse(raw || "{}");
        return { key: k.replace(PREFIX, ""), savedAt, expired: isExpired({ savedAt }) };
      })
      .filter(d => !d.expired);
  } catch {
    return [];
  }
}

export default useInvestigationDraft;
