/**
 * Nepotismo & Emendas - Cloud Functions ISOLADAS
 * NAO editar functions/index.js - este arquivo e completamente independente
 * Prefixos: /api/nepotismo/* e /api/emendas/*
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Reutilizar inicializacao do admin (ja feita em index.js)
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// =============================================
// ENDPOINTS HTTP - NEPOTISMO (somente leitura)
// =============================================

/**
 * GET /api/nepotismo/deputado/{id}
 * Retorna score de nepotismo, parentes, flags
 */
exports.getDeputadoNepotismo = functions
  .region("southamerica-east1")
  .https.onCall(async (data) => {
    const { deputadoId, colecao } = data;
    if (!deputadoId) throw new functions.https.HttpsError("invalid-argument", "deputadoId obrigatorio");

    // Buscar relacoes
    const relSnap = await db.collection("relacoes_pessoa_parlamentar")
      .where("parlamentarId", "==", deputadoId).get();
    const relacoes = relSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Buscar detalhes dos parentes
    const parenteIds = [...new Set(relacoes.map(r => r.parenteId).filter(Boolean))];
    let parentes = [];
    if (parenteIds.length > 0) {
      const pSnap = await db.collection("pessoas_parente")
        .where(admin.firestore.FieldPath.documentId(), "in", parenteIds.slice(0, 10)).get();
      parentes = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Calcular score
    let score = 0;
    parentes.forEach(p => {
      if (p.vinculosPublicos && p.vinculosPublicos.length > 0) score += 30;
      if (p.multiGabinete) score += 20;
      if (p.remuneracao > 20000) score += 15;
    });
    score = Math.min(score, 100);

    return {
      score,
      totalParentes: relacoes.length,
      comVinculosPublicos: parentes.filter(p => p.vinculosPublicos && p.vinculosPublicos.length > 0).length,
      relacoes,
      parentes,
    };
  });

// =============================================
// ENDPOINTS HTTP - EMENDAS (somente leitura)
// =============================================

/**
 * GET /api/emendas/deputado/{id}
 * Lista emendas do parlamentar
 */
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

/**
 * Rastreamento de emenda: compras municipais + relacoes fornecedor
 */
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
// ETL JOBS (agendados - shadow mode)
// =============================================

/**
 * Job diario de nepotismo - popula pessoas_parente e relacoes
 * Roda em shadow mode (nao impacta o front ate feature flag ligar)
 */
exports.nepotismoDailyJob = functions
  .region("southamerica-east1")
  .pubsub.schedule("0 3 * * *")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    console.log("[nepotismoDailyJob] Iniciando coleta de dados de nepotismo...");
    // TODO: Implementar coleta de dados do Portal da Transparencia
    // 1. Buscar servidores por nome de familia dos deputados
    // 2. Cruzar com gabinetes parlamentares
    // 3. Identificar vinculos em outros orgaos
    // 4. Popular pessoas_parente e relacoes_pessoa_parlamentar
    console.log("[nepotismoDailyJob] Job finalizado (skeleton).");
    return null;
  });

/**
 * ETL de emendas - puxa do Portal da Transparencia
 */
exports.emendasEtlJob = functions
  .region("southamerica-east1")
  .pubsub.schedule("0 4 * * 1")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    console.log("[emendasEtlJob] Iniciando coleta de emendas...");
    // TODO: Implementar coleta via API Portal da Transparencia
    // 1. Para cada deputado, buscar emendas
    // 2. Gravar na colecao 'emendas'
    // 3. Enriquecer com dados de municipio/favorecido
    console.log("[emendasEtlJob] Job finalizado (skeleton).");
    return null;
  });

/**
 * Consolidador de fornecedores - agrega CNPJs/CPFs
 */
exports.fornecedoresEtlJob = functions
  .region("southamerica-east1")
  .pubsub.schedule("0 5 * * 2")
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    console.log("[fornecedoresEtlJob] Consolidando fornecedores...");
    // TODO: Agregar CNPJs de CEAP + emendas em fornecedores_publicos
    // Popular relacoes_parlamentar_fornecedor
    console.log("[fornecedoresEtlJob] Job finalizado (skeleton).");
    return null;
  });
