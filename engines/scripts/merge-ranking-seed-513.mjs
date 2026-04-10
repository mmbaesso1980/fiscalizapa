#!/usr/bin/env node
/**
 * Completa o seed do ranking até 513 mandatos:
 * 1) Lê engines/scripts/ranking-seed-2025.json (saída do scrape ranking.org)
 * 2) Busca todos os deputados em exercício na API da Câmara
 * 3) Anexa os que não estão no ranking.org com nota null e rank_externo sequencial
 *
 * Uso (após o scrape):
 *   node engines/scripts/scrape-ranking-org-only.mjs
 *   node engines/scripts/merge-ranking-seed-513.mjs
 *   cp engines/scripts/ranking-seed-2025.json frontend/public/ranking-org-seed.json
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, "ranking-seed-2025.json");
const MANDATOS = 513;
const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2/deputados";
const CARGO = "Deputado Federal";

function normalizeNome(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function fetchAllDeputados() {
  const all = [];
  let pagina = 1;
  const itens = 100;
  for (;;) {
    const url = `${CAMARA_BASE}?pagina=${pagina}&itens=${itens}&ordem=ASC&ordenarPor=nome&idLegislatura=57`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Câmara API ${res.status}: ${url}`);
    const j = await res.json();
    const dados = j.dados || [];
    all.push(...dados);
    if (dados.length < itens) break;
    pagina++;
  }
  return all;
}

function main() {
  const raw = readFileSync(SEED_PATH, "utf-8");
  const fromRanking = JSON.parse(raw);
  if (!Array.isArray(fromRanking) || fromRanking.length === 0) {
    throw new Error(`Seed vazio ou inválido: ${SEED_PATH}`);
  }

  return (async () => {
    const apiList = await fetchAllDeputados();
    if (apiList.length < MANDATOS) {
      console.warn(`API retornou ${apiList.length} deputados (< ${MANDATOS})`);
    }

    const apiByNome = new Map();
    for (const d of apiList) {
      const k = normalizeNome(d.nome);
      if (k && !apiByNome.has(k)) apiByNome.set(k, d);
    }

    const usedIds = new Set();
    const enriched = fromRanking.map((r) => {
      let id = r.idCamara != null ? Number(r.idCamara) : null;
      if (!id || !Number.isFinite(id)) {
        const hit = apiByNome.get(normalizeNome(r.nome));
        if (hit) id = hit.id;
      }
      if (id && Number.isFinite(id)) usedIds.add(id);
      return { ...r, idCamara: id && Number.isFinite(id) ? id : r.idCamara ?? null, cargo: r.cargo || CARGO };
    });

    const missingFromApi = apiList.filter((d) => !usedIds.has(d.id));
    missingFromApi.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

    let nextRank = enriched.length > 0
      ? Math.max(...enriched.map((x) => Number(x.rank_externo) || 0)) + 1
      : 1;

    for (const d of missingFromApi) {
      if (enriched.length >= MANDATOS) break;
      enriched.push({
        rank_externo: nextRank++,
        nome: d.nome,
        partido: d.siglaPartido || "",
        uf: d.siglaUf || "",
        idCamara: d.id,
        nota_ranking_org: null,
        score: null,
        cargo: CARGO,
        fonte: "dadosabertos.camara.leg.br",
        slug_ranking_org: "",
        nota_ranking_org_ausente: true,
        observacao:
          "Deputado ativo na Câmara sem linha publicada no ranking.org.br (Câmara) na data da montagem do seed.",
      });
    }

    enriched.sort((a, b) => (a.rank_externo || 0) - (b.rank_externo || 0));

    async function resolveIdBySearch(nome) {
      const url = `${CAMARA_BASE}?nome=${encodeURIComponent(nome)}&itens=20&idLegislatura=57`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const j = await res.json();
      const dados = j.dados || [];
      const want = normalizeNome(nome);
      const exact = dados.find((d) => normalizeNome(d.nome) === want);
      if (exact) return exact.id;
      if (dados.length === 1) return dados[0].id;
      const loose = dados.find(
        (d) =>
          normalizeNome(d.nome).includes(want) ||
          want.includes(normalizeNome(d.nome)),
      );
      return loose ? loose.id : null;
    }

    for (const r of enriched) {
      if (r.idCamara != null && Number.isFinite(Number(r.idCamara))) continue;
      const id = await resolveIdBySearch(r.nome);
      if (id) r.idCamara = id;
    }

    if (enriched.length !== MANDATOS) {
      console.warn(`Aviso: seed tem ${enriched.length} linhas (esperado ${MANDATOS})`);
    }

    const stillNoId = enriched.filter((r) => !r.idCamara).length;
    if (stillNoId) console.warn(`Aviso: ${stillNoId} linhas sem idCamara após busca na API`);

    writeFileSync(SEED_PATH, JSON.stringify(enriched, null, 2), "utf-8");
    console.log(`OK: ${enriched.length} registros → ${SEED_PATH}`);
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
