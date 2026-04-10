/**
 * Dados do Ranking dos Políticos (ranking.org.br) — posição e nota oficiais.
 * Fonte local: /ranking-org-seed.json (espelho do seed em engines/scripts).
 * Opcional: coleção Firestore `ranking_externo` quando preenchida pelo pipeline.
 */

import { collection, getDocs } from "firebase/firestore";

const SEED_PATH = "/ranking-org-seed.json";
const RANKING_ORG_PAGE = "https://ranking.org.br/ranking/politicos";
const RANKING_ORG_CRITERIA = "https://ranking.org.br/criterios-e-metodologia";

let cachedMap = null;
let cachedTotal = 0;
let loadPromise = null;

/** Chave alinhada ao load-seed-firestore.js (doc id em ranking_externo). */
export function normalizeNomeRankingKey(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .toUpperCase()
    .substring(0, 60);
}

function buildMapFromRecords(records) {
  const map = new Map();
  let maxRank = 0;
  for (const r of records) {
    const nome = r.nome?.trim();
    if (!nome) continue;
    const key = normalizeNomeRankingKey(nome);
    const rank = Number(r.rank_externo);
    const nota = Number(r.nota_ranking_org ?? r.score);
    if (!Number.isFinite(rank) || rank <= 0) continue;
    maxRank = Math.max(maxRank, rank);
    map.set(key, {
      rank_externo: rank,
      nota_ranking_org: Number.isFinite(nota) ? nota : 0,
      fonte: r.fonte || "ranking.org.br",
      slug_ranking_org: r.slug_ranking_org || "",
      nome_ranking_org: nome,
      partido: r.partido || "",
      uf: r.uf || "",
    });
  }
  return { map, total: maxRank || map.size };
}

/**
 * Carrega mapa nome→dados ranking.org (memoizado por sessão).
 * @param {import('firebase/firestore').Firestore | null} db
 */
export async function loadRankingOrgExternoMap(db) {
  if (cachedMap) return { map: cachedMap, total: cachedTotal, sourceUrl: RANKING_ORG_PAGE };

  if (!loadPromise) {
    loadPromise = (async () => {
      // 1) JSON versionado no deploy — evita Firestore antigo sobrescrever o seed atual
      try {
        const res = await fetch(SEED_PATH, { cache: "no-store" });
        if (res.ok) {
          const records = await res.json();
          const { map, total } = buildMapFromRecords(records);
          if (map.size > 0) {
            cachedMap = map;
            cachedTotal = total;
            return;
          }
        }
      } catch {
        /* rede / arquivo ausente em dev */
      }

      // 2) Firestore (ingestão manual ou pipeline)
      if (db) {
        try {
          const snap = await getDocs(collection(db, "ranking_externo"));
          if (!snap.empty) {
            const rows = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
            const { map, total } = buildMapFromRecords(rows);
            if (map.size > 0) {
              cachedMap = map;
              cachedTotal = total;
              return;
            }
          }
        } catch {
          /* coleção ausente ou regras */
        }
      }

      throw new Error("Ranking externo: seed e Firestore indisponíveis ou vazios");
    })();
  }

  await loadPromise;
  return { map: cachedMap, total: cachedTotal, sourceUrl: RANKING_ORG_PAGE };
}

export function lookupRankingOrgExterno(map, nome) {
  if (!map || !nome) return null;
  return map.get(normalizeNomeRankingKey(nome)) ?? null;
}

/** Lista ordenada por posição (para fallback quando não há cruzamento com deputados_federais). */
export function rankingOrgMapToSortedList(map) {
  if (!map || map.size === 0) return [];
  return [...map.values()].sort((a, b) => a.rank_externo - b.rank_externo);
}

export function mergeDeputadoRankingOrg(base, externo) {
  if (!externo) return { ...base, ranking_org: null };
  const path = externo.slug_ranking_org ? `/${externo.slug_ranking_org}` : "";
  return {
    ...base,
    rank_externo: externo.rank_externo,
    nota_ranking_org: externo.nota_ranking_org,
    fonte_ranking_parlamentar: externo.fonte,
    ranking_org: {
      posicao: externo.rank_externo,
      nota: externo.nota_ranking_org,
      fonte: externo.fonte || "ranking.org.br",
      perfilPath: path,
      listaUrl: RANKING_ORG_PAGE,
      metodologiaUrl: RANKING_ORG_CRITERIA,
    },
  };
}

export { RANKING_ORG_PAGE, RANKING_ORG_CRITERIA };
