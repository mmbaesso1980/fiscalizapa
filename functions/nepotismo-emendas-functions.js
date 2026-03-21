/**
 * Nepotismo & Emendas - Cloud Functions ISOLADAS
 * NAO editar functions/index.js - este arquivo e completamente independente
 * Prefixos: /api/nepotismo/* e /api/emendas/*
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");

// Reutilizar inicializacao do admin (ja feita em index.js)
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// =============================================
// HELPERS
// =============================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function apiGet(path, apiKey) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "api.portaldatransparencia.gov.br",
      path, method: "GET",
      headers: { "chave-api-dados": apiKey, "Accept": "application/json" }
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(data)); }
          catch(e) { reject(new Error("JSON parse")); }
        } else if (res.statusCode === 429) {
          reject(new Error("RATE_LIMIT"));
        } else { reject(new Error(`HTTP ${res.statusCode}`)); }
      });
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

function parseValor(v) {
  if (!v) return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

function parseLocalidade(loc) {
  if (!loc) return { municipioNome: null, uf: null };
  const parts = loc.split(" - ");
  if (parts.length >= 2) return { municipioNome: parts[0].trim(), uf: parts[parts.length-1].trim() };
  return { municipioNome: loc.trim(), uf: null };
}

// =============================================
// ENDPOINTS HTTP - NEPOTISMO (somente leitura)
// =============================================
exports.getDeputadoNepotismo = functions
  .region("southamerica-east1")
  .https.onCall(async (data) => {
    const { deputadoId } = data;
    if (!deputadoId) throw new functions.https.HttpsError("invalid-argument", "deputadoId obrigatorio");
    const relSnap = await db.collection("relacoes_pessoa_parlamentar")
      .where("parlamentarId", "==", deputadoId).get();
    const relacoes = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const parenteIds = [...new Set(relacoes.map(r => r.parenteId).filter(Boolean))];
    let parentes = [];
    if (parenteIds.length > 0) {
      const pSnap = await db.collection("pessoas_parente")
        .where(admin.firestore.FieldPath.documentId(), "in", parenteIds.slice(0, 10)).get();
      parentes = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    let score = 0;
    parentes.forEach(p => {
      if (p.vinculosPublicos && p.vinculosPublicos.length > 0) score += 30;
      if (p.multiGabinete) score += 20;
      if (p.remuneracao > 20000) score += 15;
    });
    score = Math.min(score, 100);
    return { score, totalParentes: relacoes.length,
      comVinculosPublicos: parentes.filter(p => p.vinculosPublicos && p.vinculosPublicos.length > 0).length,
      relacoes, parentes };
  });

// =============================================
// ENDPOINTS HTTP - EMENDAS (somente leitura)
// =============================================
exports.getDeputadoEmendas = functions
  .region("southamerica-east1")
  .https.onCall(async (data) => {
    const { deputadoId } = data;
    if (!deputadoId) throw new functions.https.HttpsError("invalid-argument", "deputadoId obrigatorio");
    const snap = await db.collection("emendas")
      .where("parlamentarId", "==", deputadoId).get();
    const emendas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emendas.sort((a, b) => (b.valorEmpenhado || b.valor || 0) - (a.valorEmpenhado || a.valor || 0));
    const totalEmpenhado = emendas.reduce((s, e) => s + (e.valorEmpenhado || e.valor || 0), 0);
    const totalPago = emendas.reduce((s, e) => s + (e.valorPago || 0), 0);
    const municipios = [...new Set(emendas.map(e => e.municipioNome).filter(Boolean))];
    return { emendas, totalEmpenhado, totalPago, totalMunicipios: municipios.length };
  });

exports.getEmendaRastreamento = functions
  .region("southamerica-east1")
  .https.onCall(async (data) => {
    const { emendaId } = data;
    if (!emendaId) throw new functions.https.HttpsError("invalid-argument", "emendaId obrigatorio");
    const comprasSnap = await db.collection("municipio_compras")
      .where("emendaId", "==", emendaId).get();
    const compras = comprasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const relSnap = await db.collection("relacoes_parlamentar_fornecedor")
      .where("emendaId", "==", emendaId).get();
    const fornRel = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    return { compras, fornRel };
  });

// =============================================
// ETL JOBS (agendados)
// =============================================
exports.nepotismoDailyJob = functions
  .region("southamerica-east1")
  .pubsub.schedule("0 3 * * *")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    console.log("[nepotismoDailyJob] Skeleton - nao implementado ainda.");
    return null;
  });

/**
 * ETL de emendas - puxa do Portal da Transparencia
 * Roda toda segunda-feira as 4h
 * Requer PORTAL_API_KEY nas env vars do Firebase Functions
 */
exports.emendasEtlJob = functions
  .region("southamerica-east1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .pubsub.schedule("0 4 * * 1")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const apiKey = functions.config().portal?.api_key;
    if (!apiKey) {
      console.error("[emendasEtlJob] PORTAL_API_KEY nao configurada. Use: firebase functions:config:set portal.api_key=SUA_CHAVE");
      return null;
    }
    console.log("[emendasEtlJob] Iniciando coleta de emendas...");

    const anos = [2024, 2025];
    const colecoes = ["deputados_federais"];
    let total = 0;

    for (const col of colecoes) {
      const snap = await db.collection(col).get();
      console.log(`[emendasEtlJob] ${col}: ${snap.size} deputados`);

      for (const depDoc of snap.docs) {
        const dep = depDoc.data();
        const nome = (dep.nome || dep.nomeCompleto || "").toUpperCase();
        if (!nome || nome.length < 3) continue;

        for (const ano of anos) {
          let pagina = 1;
          while (true) {
            const path = `/api-de-dados/emendas?nomeAutor=${encodeURIComponent(nome)}&ano=${ano}&pagina=${pagina}`;
            try {
              const results = await apiGet(path, apiKey);
              if (!Array.isArray(results) || results.length === 0) break;

              const batch = db.batch();
              for (const em of results) {
                const { municipioNome, uf } = parseLocalidade(em.localidadeDoGasto);
                const docId = `${depDoc.id}_${em.codigoEmenda}`;
                batch.set(db.collection("emendas").doc(docId), {
                  parlamentarId: depDoc.id, autorId: depDoc.id, colecao: col,
                  nomeAutor: em.nomeAutor || nome,
                  codigoEmenda: em.codigoEmenda || "", numeroEmenda: em.numeroEmenda || "",
                  tipoEmenda: em.tipoEmenda || "", ano: em.ano || 0,
                  funcao: em.funcao || "", subfuncao: em.subfuncao || "",
                  localidadeDoGasto: em.localidadeDoGasto || "",
                  municipioNome, uf,
                  valorEmpenhado: parseValor(em.valorEmpenhado),
                  valorLiquidado: parseValor(em.valorLiquidado),
                  valorPago: parseValor(em.valorPago),
                  valor: parseValor(em.valorEmpenhado),
                  objetoResumo: `${em.funcao || ""} / ${em.subfuncao || ""}`.trim(),
                  status: em.tipoEmenda || "",
                  ingestedAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                total++;
              }
              await batch.commit();
              pagina++;
              await sleep(600);
            } catch (err) {
              if (err.message === "RATE_LIMIT") { await sleep(10000); continue; }
              console.error(`[emendasEtlJob] ${nome} ${ano} p${pagina}: ${err.message}`);
              break;
            }
          }
          await sleep(300);
        }
      }
    }
    console.log(`[emendasEtlJob] Concluido. Total: ${total} emendas gravadas.`);
    return null;
  });

/**
 * Consolidador de fornecedores - skeleton
 */
exports.fornecedoresEtlJob = functions
  .region("southamerica-east1")
  .pubsub.schedule("0 5 * * 2")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    console.log("[fornecedoresEtlJob] Skeleton - nao implementado ainda.");
    return null;
  });
