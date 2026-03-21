/**
 * run-ingest-emendas.js
 * Script standalone para ingestao de emendas parlamentares
 * Fonte: API Portal da Transparencia (api.portaldatransparencia.gov.br)
 *
 * USO:
 *   cd functions
 *   node run-ingest-emendas.js
 *
 * REQUISITOS:
 *   - Variavel de ambiente PORTAL_API_KEY com chave da API
 *   - Ou arquivo .env na pasta functions com PORTAL_API_KEY=xxx
 *   - Cadastro em: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
 */

const admin = require("firebase-admin");
const https = require("https");

// Carregar .env se existir
try { require("dotenv").config(); } catch(e) {}

// Inicializar Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const API_KEY = process.env.PORTAL_API_KEY;
if (!API_KEY) {
  console.error("ERRO: Defina PORTAL_API_KEY no .env ou variavel de ambiente.");
  console.error("Cadastre-se em: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email");
  process.exit(1);
}

const ANOS = [2023, 2024, 2025];
const DELAY_MS = 600; // rate limit ~100 req/min
const BASE_URL = "api.portaldatransparencia.gov.br";

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Faz GET na API do Portal da Transparencia
 */
function apiGet(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE_URL,
      path: path,
      method: "GET",
      headers: { "chave-api-dados": API_KEY, "Accept": "application/json" }
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error("JSON parse error: " + data.substring(0, 200))); }
        } else if (res.statusCode === 429) {
          reject(new Error("RATE_LIMIT"));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

/**
 * Busca todas as emendas de um autor (paginado)
 */
async function fetchEmendasPorAutor(nomeAutor, ano) {
  const all = [];
  let pagina = 1;
  while (true) {
    const path = `/api-de-dados/emendas?nomeAutor=${encodeURIComponent(nomeAutor)}&ano=${ano}&pagina=${pagina}`;
    try {
      const results = await apiGet(path);
      if (!Array.isArray(results) || results.length === 0) break;
      all.push(...results);
      pagina++;
      await sleep(DELAY_MS);
    } catch (err) {
      if (err.message === "RATE_LIMIT") {
        console.log("  Rate limit, aguardando 10s...");
        await sleep(10000);
        continue;
      }
      console.error(`  Erro pagina ${pagina}: ${err.message}`);
      break;
    }
  }
  return all;
}

/**
 * Extrai municipio e UF da localidadeDoGasto
 * Formato tipico: "MUNICIPIO - UF" ou "Nacional"
 */
function parseLocalidade(loc) {
  if (!loc) return { municipioNome: null, uf: null };
  const parts = loc.split(" - ");
  if (parts.length >= 2) {
    return { municipioNome: parts[0].trim(), uf: parts[parts.length - 1].trim() };
  }
  return { municipioNome: loc.trim(), uf: null };
}

/**
 * Converte string monetaria para numero
 */
function parseValor(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

async function main() {
  console.log("=== INGESTAO DE EMENDAS PARLAMENTARES ===");
  console.log(`Anos: ${ANOS.join(", ")}`);
  console.log();

  // 1. Buscar todos os deputados do Firestore
  const colecoes = ["deputados_federais", "deputados_estaduais"];
  const deputados = [];

  for (const col of colecoes) {
    const snap = await db.collection(col).get();
    snap.docs.forEach(d => {
      const data = d.data();
      deputados.push({
        id: d.id,
        colecao: col,
        nome: data.nome || data.nomeCompleto || data.ultimoStatus?.nome || "",
        nomeCompleto: data.nomeCompleto || data.nome || ""
      });
    });
    console.log(`Colecao ${col}: ${snap.size} deputados`);
  }

  console.log(`Total de deputados: ${deputados.length}`);
  console.log();

  let totalEmendas = 0;
  let totalErros = 0;
  let deputadosComEmendas = 0;

  // 2. Para cada deputado, buscar emendas na API
  for (let i = 0; i < deputados.length; i++) {
    const dep = deputados[i];
    const nomeQuery = dep.nome.toUpperCase();
    if (!nomeQuery || nomeQuery.length < 3) {
      console.log(`[${i+1}/${deputados.length}] ${dep.id} - nome vazio, pulando`);
      continue;
    }

    console.log(`[${i+1}/${deputados.length}] ${nomeQuery} (${dep.colecao}/${dep.id})`);

    let emendasDep = [];
    for (const ano of ANOS) {
      try {
        const result = await fetchEmendasPorAutor(nomeQuery, ano);
        if (result.length > 0) {
          console.log(`  ${ano}: ${result.length} emendas`);
          emendasDep.push(...result);
        }
        await sleep(DELAY_MS);
      } catch (err) {
        console.error(`  ${ano} ERRO: ${err.message}`);
        totalErros++;
      }
    }

    if (emendasDep.length === 0) continue;
    deputadosComEmendas++;

    // 3. Gravar no Firestore
    const batch = db.batch();
    let batchCount = 0;

    for (const em of emendasDep) {
      const { municipioNome, uf } = parseLocalidade(em.localidadeDoGasto);
      const docId = `${dep.id}_${em.codigoEmenda}`;

      const docRef = db.collection("emendas").doc(docId);
      batch.set(docRef, {
        parlamentarId: dep.id,
        autorId: dep.id,
        colecao: dep.colecao,
        nomeAutor: em.nomeAutor || nomeQuery,
        codigoEmenda: em.codigoEmenda || "",
        numeroEmenda: em.numeroEmenda || "",
        tipoEmenda: em.tipoEmenda || "",
        ano: em.ano || 0,
        funcao: em.funcao || "",
        subfuncao: em.subfuncao || "",
        localidadeDoGasto: em.localidadeDoGasto || "",
        municipioNome: municipioNome,
        uf: uf,
        valorEmpenhado: parseValor(em.valorEmpenhado),
        valorLiquidado: parseValor(em.valorLiquidado),
        valorPago: parseValor(em.valorPago),
        valorRestoInscrito: parseValor(em.valorRestoInscrito),
        valorRestoCancelado: parseValor(em.valorRestoCancelado),
        valorRestoPago: parseValor(em.valorRestoPago),
        valor: parseValor(em.valorEmpenhado),
        favorecido: em.localidadeDoGasto || "",
        objetoResumo: `${em.funcao || ""} / ${em.subfuncao || ""}`.trim(),
        status: em.tipoEmenda || "",
        ingestedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      batchCount++;
      if (batchCount >= 450) {
        await batch.commit();
        console.log(`  Batch commit: ${batchCount} docs`);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`  Gravadas ${emendasDep.length} emendas para ${nomeQuery}`);
    }

    totalEmendas += emendasDep.length;
  }

  console.log();
  console.log("=== RESUMO ===");
  console.log(`Deputados com emendas: ${deputadosComEmendas}`);
  console.log(`Total emendas gravadas: ${totalEmendas}`);
  console.log(`Erros: ${totalErros}`);
  console.log("Concluido!");
}

main().catch(err => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
