/**
 * Cliente para a Cloud Function portalTransparenciaProxy (API de Dados do Portal).
 * A chave fica só no servidor; o front só envia path+query permitidos.
 *
 * Ex.: callPortalTransparenciaProxy(functions, "/api-de-dados/contratos?pagina=1")
 */
import { httpsCallable } from "firebase/functions";

export const PORTAL_PROXY_HINT =
  "Rotas GET permitidas (prefixo): /api-de-dados/emendas, contratos, despesas, servidores, cnep, ceis, licitacoes, transferencias.";

/**
 * @param {import('firebase/functions').Functions} functions
 * @param {string} pathAndQuery path com / inicial, ex. /api-de-dados/emendas?ano=2024&pagina=1
 */
export async function callPortalTransparenciaProxy(functions, pathAndQuery) {
  const fn = httpsCallable(functions, "portalTransparenciaProxy");
  const res = await fn({ path: pathAndQuery });
  return res.data;
}
