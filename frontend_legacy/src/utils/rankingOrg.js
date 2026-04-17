/**
 * Dados do Ranking dos Políticos (ranking.org.br) — posição e nota oficiais.
 * Fonte local: /ranking-org-seed.json (espelho do seed em engines/scripts).
 * Opcional: coleção Firestore `ranking_externo` quando preenchida pelo pipeline.
 */

import { collection, getDocs } from "firebase/firestore";

const SEED_PATH = "/ranking-org-seed.json";
const RANKING_ORG_PAGE = "https://ranking.org.br/ranking/politicos";
const RANKING_ORG_CRITERIA = "https://ranking.org.br/criterios-e-metodologia";

/** Cadeiras da Câmara dos Deputados (mandatos), independente do tamanho da lista publicada no ranking.org.br */
export const MANDATOS_CAMARA = 513;

let cachedMap = null;
let cachedMapByIdCamara = null;
let cachedTotal = 0;
let cachedListCount = 0;
let cachedMandatosNoSeed = 0;
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
  const mapByIdCamara = new Map();
  let maxRank = 0;
  let comNotaRankingOrg = 0;

  for (const r of records) {
    const nome = r.nome?.trim();
    if (!nome) continue;
    const key = normalizeNomeRankingKey(nome);
    const rank = Number(r.rank_externo);
    if (!Number.isFinite(rank) || rank <= 0) continue;
    maxRank = Math.max(maxRank, rank);

    const rawNota = r.nota_ranking_org ?? r.score;
    const hasNota = rawNota != null && rawNota !== "" && Number.isFinite(Number(rawNota));
    if (hasNota) comNotaRankingOrg++;

    const row = {
      rank_externo: rank,
      nota_ranking_org: hasNota ? Number(rawNota) : null,
      fonte: r.fonte || "ranking.org.br",
      slug_ranking_org: r.slug_ranking_org || "",
      nome_ranking_org: nome,
      partido: r.partido || "",
      uf: r.uf || "",
      idCamara: r.idCamara != null && Number.isFinite(Number(r.idCamara)) ? Number(r.idCamara) : null,
      nota_ranking_org_ausente: Boolean(r.nota_ranking_org_ausente) || !hasNota,
    };
    map.set(key, row);
    if (row.idCamara) mapByIdCamara.set(row.idCamara, row);
  }

  const listCount = map.size;
  const maxPosicao = maxRank || listCount;
  return {
    map,
    mapByIdCamara,
    /** Maior posição no seed (513 após merge) — escala do gradiente */
    total: maxPosicao,
    /** Linhas com nota publicada no ranking.org.br */
    listCount: comNotaRankingOrg,
    /** Total de mandatos no seed (deve ser 513) */
    mandatosNoSeed: listCount,
  };
}

/**
 * Carrega mapa nome→dados ranking.org (memoizado por sessão).
 * @param {import('firebase/firestore').Firestore | null} db
 */
export async function loadRankingOrgExternoMap(db) {
  if (cachedMap) {
    return {
      map: cachedMap,
      mapByIdCamara: cachedMapByIdCamara,
      total: cachedTotal,
      listCount: cachedListCount,
      mandatosNoSeed: cachedMandatosNoSeed,
      sourceUrl: RANKING_ORG_PAGE,
    };
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      // 1) JSON versionado no deploy — evita Firestore antigo sobrescrever o seed atual
      try {
        const res = await fetch(SEED_PATH, { cache: "no-store" });
        if (res.ok) {
          const records = await res.json();
          const { map, mapByIdCamara, total, listCount, mandatosNoSeed } = buildMapFromRecords(records);
          if (map.size > 0) {
            cachedMap = map;
            cachedMapByIdCamara = mapByIdCamara;
            cachedTotal = total;
            cachedListCount = listCount;
            cachedMandatosNoSeed = mandatosNoSeed;
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
            const { map, mapByIdCamara, total, listCount, mandatosNoSeed } = buildMapFromRecords(rows);
            if (map.size > 0) {
              cachedMap = map;
              cachedMapByIdCamara = mapByIdCamara;
              cachedTotal = total;
              cachedListCount = listCount;
              cachedMandatosNoSeed = mandatosNoSeed;
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
  return {
    map: cachedMap,
    mapByIdCamara: cachedMapByIdCamara,
    total: cachedTotal,
    listCount: cachedListCount,
    mandatosNoSeed: cachedMandatosNoSeed,
    sourceUrl: RANKING_ORG_PAGE,
  };
}

function stripTratamentoNome(nome) {
  return String(nome || "")
    .replace(/^(dep\.|deputad[oa]|dr\.?|dra\.?|prof\.?|eng\.?)\s+/gi, "")
    .trim();
}

/** Variações de chave para cruzar nome do Firestore com o nome no ranking.org.br */
function nomeKeysForLookup(nome) {
  const keys = [];
  const raw = String(nome || "").trim();
  if (!raw) return keys;
  const add = (s) => {
    const k = normalizeNomeRankingKey(s);
    if (k && !keys.includes(k)) keys.push(k);
  };
  add(raw);
  const semTrat = stripTratamentoNome(raw);
  if (semTrat && semTrat !== raw) add(semTrat);
  const parts = semTrat.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    add(`${parts[0]} ${parts[parts.length - 1]}`);
  }
  return keys;
}

export function lookupRankingOrgExterno(map, nome) {
  if (!map || !nome) return null;
  for (const k of nomeKeysForLookup(nome)) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return null;
}

export function lookupRankingOrgExternoById(mapByIdCamara, idCamara) {
  if (!mapByIdCamara || idCamara == null) return null;
  const id = Number(idCamara);
  if (!Number.isFinite(id)) return null;
  return mapByIdCamara.get(id) ?? null;
}

/** Lista ordenada por posição (para fallback quando não há cruzamento com deputados_federais). */
export function rankingOrgMapToSortedList(map) {
  if (!map || map.size === 0) return [];
  return [...map.values()].sort((a, b) => a.rank_externo - b.rank_externo);
}

export function mergeDeputadoRankingOrg(base, externo) {
  if (!externo) return { ...base, ranking_org: null };
  const path = externo.slug_ranking_org ? `/${externo.slug_ranking_org}` : "";
  const semNota = externo.nota_ranking_org == null || externo.nota_ranking_org_ausente;
  const nomeSeed = externo.nome_ranking_org?.trim();
  const nomeBase = String(base.nome || "").trim();
  const nomeCompBase = String(base.nomeCompleto || "").trim();
  const missing = (v) => {
    const s = String(v ?? "").trim();
    return !s || s === "–" || s === "-" || s === "—";
  };
  return {
    ...base,
    idCamara:
      base.idCamara != null && Number.isFinite(Number(base.idCamara))
        ? Number(base.idCamara)
        : externo.idCamara != null && Number.isFinite(Number(externo.idCamara))
          ? Number(externo.idCamara)
          : base.idCamara,
    nome: !missing(nomeBase) ? nomeBase : (nomeSeed || base.nome),
    nomeCompleto: !missing(nomeCompBase)
      ? nomeCompBase
      : (nomeSeed || (!missing(nomeBase) ? nomeBase : base.nomeCompleto)),
    partido: !missing(base.partido) ? String(base.partido).trim() : (externo.partido || base.partido),
    uf: !missing(base.uf) ? String(base.uf).trim() : (externo.uf || base.uf),
    rank_externo: externo.rank_externo,
    nota_ranking_org: semNota ? null : externo.nota_ranking_org,
    fonte_ranking_parlamentar: externo.fonte,
    ranking_org: {
      posicao: externo.rank_externo,
      nota: semNota ? null : externo.nota_ranking_org,
      fonte: externo.fonte || "ranking.org.br",
      perfilPath: path,
      listaUrl: RANKING_ORG_PAGE,
      metodologiaUrl: RANKING_ORG_CRITERIA,
      semNotaPublicada: semNota,
    },
  };
}

export { RANKING_ORG_PAGE, RANKING_ORG_CRITERIA };
