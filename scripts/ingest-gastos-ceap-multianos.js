/**
 * ingest-gastos-ceap-multianos.js
 *
 * Puxa CEAP de todos os deputados federais para múltiplos anos
 * e grava em subcoleção:
 *   deputados_federais/{id}/gastos/{docId}
 *
 * Uso (na raiz do repo):
 *   cd scripts
 *   node ingest-gastos-ceap-multianos.js
 */

const admin = require("firebase-admin");
const fetch = require("node-fetch");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "fiscallizapa" });
}

const db = admin.firestore();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ajuste aqui se quiser menos anos
const ANOS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function safeNumber(n, fallback = 0) {
  if (typeof n === "number" && !Number.isNaN(n)) return n;
  if (typeof n === "string") {
    const parsed = Number(n.replace(",", "."));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function normalizeDataDocumento(raw) {
  if (!raw || typeof raw !== "string") return "";
  if (raw.length >= 10) return raw.substring(0, 10);
  return raw;
}

function montarDocId(depId, ano, g) {
  const base =
    g.codDocumento ||
    g.numDocumento ||
    `${normalizeDataDocumento(g.dataDocumento)}_${safeNumber(g.valorDocumento, 0)}`;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${depId}_${ano}_${base}_${rand}`;
}

// -----------------------------------------------------------------------------
// Fetch de dados da Câmara
// -----------------------------------------------------------------------------

async function fetchGastosCamara(depId, ano, pagina) {
  const url =
    `https://dadosabertos.camara.leg.br/api/v2/deputados/${depId}` +
    `/despesas?ano=${ano}&pagina=${pagina}&itens=100&ordem=DESC&ordenarPor=dataDocumento`;

  try {
    const res = await fetch(url);

    if (res.status === 429) {
      console.log(`429 rate limit para ${depId} ${ano} p${pagina}, aguardando...`);
      await sleep(5000);
      return fetchGastosCamara(depId, ano, pagina);
    }

    if (!res.ok) {
      console.log(`HTTP ${res.status} para ${depId} ${ano} p${pagina}`);
      return [];
    }

    const json = await res.json();
    if (!json || !Array.isArray(json.dados)) return [];
    return json.dados;
  } catch (err) {
    console.log(`ERR fetch ${depId} ${ano} p${pagina}: ${err.message}`);
    return [];
  }
}

async function fetchAllGastos(depId, ano) {
  let all = [];
  let pagina = 1;

  while (true) {
    const page = await fetchGastosCamara(depId, ano, pagina);
    if (!page.length) break;

    all = all.concat(page);
    console.log(
      `  dep ${depId} ano ${ano}: página ${pagina} com ${page.length} itens (acumulado: ${all.length})`
    );

    if (page.length < 100) break;
    pagina++;
    await sleep(300);
  }

  return all;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  console.log("=== INGEST GASTOS CEAP MULTI-ANO ===");

  const snap = await db.collection("deputados_federais").get();
  const deps = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`${deps.length} deputados.`);

  let totalGastos = 0;
  let depIndex = 0;

  for (const dep of deps) {
    depIndex++;
    const depId = dep.id;
    const nome = dep.nome || dep.nomeCivil || depId;

    let depTotal = 0;
    console.log(`\n>>> [${depIndex}/${deps.length}] ${nome} (${depId})`);

    for (const ano of ANOS) {
      console.log(`  Ano ${ano}...`);
      const gastos = await fetchAllGastos(depId, ano);

      if (!gastos.length) {
        console.log(`   - Nenhum gasto encontrado para ${ano}.`);
        continue;
      }

      console.log(`   - ${gastos.length} gastos retornados para ${ano}.`);

      let batch = db.batch();
      let batchCount = 0;
      let writtenForYear = 0;

      for (const g of gastos) {
        const docId = montarDocId(depId, ano, g);
        const ref = db
          .collection("deputados_federais")
          .doc(depId)
          .collection("gastos")
          .doc(docId);

        const docData = {
          ano,
          mes: safeNumber(g.numMes ?? g.mes, 0),
          tipoDespesa: g.tipoDespesa || "",
          descricao: g.descricao || g.tipoDespesa || "",
          nomeFornecedor: g.nomeFornecedor || "",
          cnpjCpfFornecedor: g.cnpjCpfFornecedor || "",
          valorDocumento: safeNumber(g.valorDocumento, 0),
          valorLiquido: safeNumber(g.valorLiquido ?? g.valorDocumento, 0),
          valorGlosa: safeNumber(g.valorGlosa, 0),
          urlDocumento: g.urlDocumento || "",
          dataDocumento: normalizeDataDocumento(g.dataDocumento),
          numDocumento: g.numDocumento || "",
          codDocumento: safeNumber(g.codDocumento, 0),
          parcela: safeNumber(g.parcela, 0),
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
          fonte: "camara_dados_abertos_ceap_multi_ano",
        };

        batch.set(ref, docData, { merge: true });
        batchCount++;
        writtenForYear++;

        if (batchCount >= 490) {
          await batch.commit();
          console.log(
            `   - Commit parcial (${writtenForYear} gastos ano ${ano}, últimos 490).`
          );
          batch = db.batch(); // batch novo depois do commit
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(
          `   - Commit final (${writtenForYear} gastos ano ${ano}, resto do batch).`
        );
      }

      depTotal += writtenForYear;
      await sleep(200);
    }

    if (depTotal > 0) {
      console.log(` ${nome}: ${depTotal} gastos gravados.`);
      totalGastos += depTotal;
    } else {
      console.log(` ${nome}: nenhum gasto gravado nos anos configurados.`);
    }
  }

  console.log(`\nTotal geral: ${totalGastos} gastos ingeridos.`);
  process.exit(0);
}

main().catch(err => {
  console.error("ERRO FATAL NA INGEST DO CEAP:", err);
  process.exit(1);
});
