const { onCall, onRequest } = require("firebase-functions/v2/https");
// deploy fix: restore secrets binding 2026-03-28
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
// force redeploy 2026-03-29 webhook secret fix
const db = admin.firestore();

const { defineSecret } = require("firebase-functions/params");
const geminiKey = defineSecret("GEMINI_KEY");
const stripeKey = defineSecret("STRIPE_SECRET");
const stripeWebhookKey = defineSecret("STRIPE_WEBHOOK_SECRET");

// ============================================
// CREDITOS - Modulo de gestao de creditos
// ============================================
const creditService = require('./creditService');

// ============================================
// SEGURANÇA: Rate Limiting em memória
// ============================================
const rateLimits = new Map();
function checkRateLimit(uid, maxRequests = 30, windowMs = 60000) {
  const now = Date.now();
  const key = uid || 'anonymous';
  const entry = rateLimits.get(key);
  if (entry && now - entry.start < windowMs) {
    if (entry.count >= maxRequests) {
      throw new Error('Rate limit exceeded. Try again later.');
    }
    entry.count++;
  } else {
    rateLimits.set(key, { start: now, count: 1 });
  }
  // Cleanup old entries every 1000 requests
  if (rateLimits.size > 1000) {
    for (const [k, v] of rateLimits) {
      if (now - v.start > windowMs) rateLimits.delete(k);
    }
  }
}

// ============================================
// SEGURANÇA: Sanitização de inputs
// ============================================
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/<[^>]*>/g, '').trim();
}

function validateId(id) {
  if (typeof id !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

// SEGURANÇA: chave obrigatória via Secret Manager, sem fallback hardcoded
async function callGemini(prompt) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const KEY = process.env.GEMINI_KEY;
  if (!KEY) throw new Error('GEMINI_KEY not configured in Secret Manager');
  const genAI = new GoogleGenerativeAI(KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ============================================
// STRIPE - Checkout e Webhook
// ============================================

// Criar sessão de checkout
exports.createCheckoutSession = onCall({ region: "southamerica-east1", secrets: [stripeKey] }, async (request) => {
  const stripe = require("stripe")((process.env.STRIPE_SECRET || "").trim());
  const { priceId } = request.data;
  const userId = request.auth?.uid;
  if (!userId) throw new Error("Auth required");
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "payment",
    success_url: "https://fiscallizapa.web.app/dashboard?success=true",
    cancel_url: "https://fiscallizapa.web.app/creditos?canceled=true",
    metadata: { userId },
  });
  return { sessionId: session.id, url: session.url };
});

// Webhook do Stripe para processar pagamentos e assinaturas
exports.stripeWebhook = onRequest({ region: "southamerica-east1" , secrets: [stripeKey, stripeWebhookKey]}, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const stripe = require("stripe")((process.env.STRIPE_SECRET || "").trim());
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook secret not configured");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  const session = event.data.object;
  if (event.type === "checkout.session.completed") {
    const userId = session.metadata?.userId;
    if (userId && session.amount_total) {
      const creditsMap = { 2900: 10, 3990: 999999, 4900: 25 };
      const credits = creditsMap[session.amount_total] || 0;
      if (credits > 0) {
        await db.collection("users").doc(userId).update({
          credits: admin.firestore.FieldValue.increment(credits),
        });
        await db.collection("purchases").add({
          userId,
          credits,
          amount: session.amount_total,
          sessionId: session.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }
  res.json({ received: true });
});

// ============================================
// CHAT - Análise com Gemini
// ============================================
exports.chat = onCall(
  { region: "southamerica-east1", secrets: [geminiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error("Authentication required");
    checkRateLimit(uid);
    const message = sanitizeString(request.data.message, 1000);
    const politicianId = request.data.politicianId ? sanitizeString(request.data.politicianId, 100) : null;
    const politicianName = request.data.politicianName ? sanitizeString(request.data.politicianName, 200) : null;
    if (!message) throw new Error("Message is required");
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const credits = userDoc.exists ? (userDoc.data().credits || 0) : 0;
    if (credits <= 0) throw new Error("Insufficient credits");
    let context = "";
    if (politicianId) {
      const docRef = db.collection("politicians").doc(politicianId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        context = `Contexto do político: Nome: ${data.nome || politicianName}, Partido: ${data.partido || "N/A"}, Estado: ${data.estado || "N/A"}, Cargo: ${data.cargo || "N/A"}, Presença: ${data.presenca || "N/A"}%, Projetos: ${data.projetos || 0}, Gastos: R$${data.gastos || 0}`;
      }
    }
    const prompt = context
      ? `${context}\n\nPergunta do usuário: ${message}\n\nResponda de forma objetiva e baseada nos dados disponíveis sobre este político brasileiro.`
      : `Pergunta sobre política brasileira: ${message}\n\nResponda de forma objetiva e informativa.`;
    const response = await callGemini(prompt);
    await userRef.update({
      credits: admin.firestore.FieldValue.increment(-1),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("chats").add({
      userId: uid,
      politicianId: politicianId || null,
      message,
      response,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { response };
  }
);

// ============================================
// PRESENÇA - Rastreamento de presença em sessões
// ============================================
exports.trackPresence = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const { politicianId, sessionDate, present } = request.data;
  if (!politicianId || !sessionDate) throw new Error("politicianId and sessionDate are required");
  await db.collection("presencas").add({
    politicianId,
    userId: uid,
    sessionDate,
    present: Boolean(present),
    recordedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Update politician's presence stats
  const politRef = db.collection("politicians").doc(politicianId);
  const politDoc = await politRef.get();
  if (politDoc.exists) {
    const data = politDoc.data();
    const totalSessions = (data.totalSessions || 0) + 1;
    const presentSessions = (data.presentSessions || 0) + (present ? 1 : 0);
    const presencaPercent = Math.round((presentSessions / totalSessions) * 100);
    await politRef.update({
      totalSessions,
      presentSessions,
      presenca: presencaPercent,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return { success: true };
});

// ============================================
// PROPOSIÇÕES - Buscar projetos de lei
// ============================================
exports.getPropositions = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const { politicianId, tipo, status, page = 1 } = request.data;
  let query = db.collection("proposicoes");
  if (politicianId) query = query.where("autorId", "==", politicianId);
  if (tipo) query = query.where("tipo", "==", tipo);
  if (status) query = query.where("status", "==", status);
  query = query.orderBy("dataApresentacao", "desc").limit(20);
  const snapshot = await query.get();
  const proposicoes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return { proposicoes, page };
});

// ============================================
// INGESTÃO NACIONAL - Câmara dos Deputados (513)
// ============================================
exports.ingestDeputados = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  // SEGURANÇA: verificar header de autenticação
  const authHeader = req.headers["x-admin-key"];
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || authHeader !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const axios = require("axios");
    let page = 1;
    let total = 0;
    const batchSize = 100;
    while (true) {
      const response = await axios.get(
        `https://dadosabertos.camara.leg.br/api/v2/deputados?pagina=${page}&itens=${batchSize}&ordem=ASC&ordenarPor=nome`,
        { timeout: 30000 }
      );
      const deputados = response.data.dados;
      if (!deputados || deputados.length === 0) break;
      const batch = db.batch();
      for (const dep of deputados) {
        const docRef = db.collection("politicians").doc(`dep_${dep.id}`);
        batch.set(docRef, {
          id: `dep_${dep.id}`,
          idCamara: dep.id,
          nome: dep.nome,
          partido: dep.siglaPartido,
          uf: dep.siglaUf,
          cargo: "Deputado Federal",
          fotoUrl: dep.urlFoto || "",
          email: dep.email || "",
          presenca: 0,
          projetos: 0,
          gastos: 0,
          totalSessions: 0,
          presentSessions: 0,
          source: "camara_api",
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
      total += deputados.length;
      if (deputados.length < batchSize) break;
      page++;
      await new Promise(r => setTimeout(r, 500));
    }
    res.json({ success: true, total, source: "camara" });
  } catch (error) {
    console.error("Error ingesting deputados:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INGESTÃO NACIONAL - Senado Federal (81)
// ============================================
exports.ingestSenadores = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  // SEGURANÇA: verificar header de autenticação
  const authHeader = req.headers["x-admin-key"];
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || authHeader !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const axios = require("axios");
    const response = await axios.get(
      "https://legis.senado.leg.br/dadosabertos/senador/lista/atual",
      {
        headers: { Accept: "application/json" },
        timeout: 30000,
      }
    );
    const parlamentares = response.data?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
    if (parlamentares.length === 0) {
      return res.json({ success: true, total: 0, message: "No senators found" });
    }
    const batchSize = 50;
    let total = 0;
    for (let i = 0; i < parlamentares.length; i += batchSize) {
      const chunk = parlamentares.slice(i, i + batchSize);
      const batch = db.batch();
      for (const parlamentar of chunk) {
        const id = parlamentar.IdentificacaoParlamentar?.CodigoParlamentar;
        const nome = parlamentar.IdentificacaoParlamentar?.NomeParlamentar;
        const partido = parlamentar.IdentificacaoParlamentar?.SiglaPartidoParlamentar;
        const estado = parlamentar.IdentificacaoParlamentar?.UfParlamentar;
        const foto = parlamentar.IdentificacaoParlamentar?.UrlFotoParlamentar || "";
        if (!id || !nome) continue;
        const docRef = db.collection("politicians").doc(`sen_${id}`);
        batch.set(docRef, {
          id: `sen_${id}`,
          idSenado: id,
          nome,
          partido: partido || "",
          uf: estado || "",
          cargo: "Senador",
          fotoUrl: foto,
          presenca: 0,
          projetos: 0,
          gastos: 0,
          totalSessions: 0,
          presentSessions: 0,
          source: "senado_api",
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        total++;
      }
      await batch.commit();
    }
    res.json({ success: true, total, source: "senado" });
  } catch (error) {
    console.error("Error ingesting senadores:", error);
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// ANÁLISE - Resumo do político
// ============================================
exports.analyzePolitician = onCall(
  { region: "southamerica-east1", secrets: [geminiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error("Authentication required");
    checkRateLimit(uid);
    // Aceita tanto politicianId quanto deputadoId (frontend envia deputadoId + colecao)
    const politicianId = sanitizeString(request.data.politicianId || request.data.deputadoId || '', 100);
    const colecao = sanitizeString(request.data.colecao || 'deputados_federais', 50);
    if (!politicianId) throw new Error("politicianId is required");
    if (!validateId(politicianId)) throw new Error("Invalid politicianId");
    const allowedCollections = ['deputados_federais', 'deputados', 'senadores', 'governadores', 'deputados_distritais', 'politicians'];
    if (!allowedCollections.includes(colecao)) throw new Error("Invalid collection");
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    const credits = userDoc.exists ? (userDoc.data().credits || 0) : 0;
    if (credits < 2) throw new Error("Insufficient credits (need 2 for analysis)");
    // Buscar na coleção correta
    const politRef = db.collection(colecao).doc(politicianId);
    const politDoc = await politRef.get();
    if (!politDoc.exists) throw new Error("Politician not found");
    const data = politDoc.data();
    const prompt = `Voce e um auditor fiscal especializado em controle de gastos publicos do TransparenciaBR. Gere um RELATORIO TECNICO DE FISCALIZACAO baseado EXCLUSIVAMENTE nos dados fornecidos. REGRAS: 1) Use linguagem tecnica e juridica. 2) Nunca faca acusacoes diretas - use os dados indicam, verifica-se padrao atipico, requer aprofundamento. 3) Cite artigos de lei (CF/88, Lei 8.429/92, Lei 8.666/93, Ato da Mesa 43/2009). 4) Classifique cada achado como ALERTA VERMELHO, ALERTA AMARELO ou CONFORME. 5) Inclua disclaimer legal ao final. Dados do politicoítico brasileiro com base nos dados disponíveis:

Nome: ${data.nome}
Partido: ${data.partido}
Estado: ${data.uf || data.estado}
Cargo: ${data.cargo}
Presença nas sessões: ${data.presenca || 0}%
Total de gastos: R$${data.totalGasto || data.gastos || 0}
Número de despesas: ${data.numGastos || 0}
Score de risco: ${data.score || 'N/A'}

Forneça uma análise tecnico-juridica com as seguintes secoes:
1. RESUMO EXECUTIVO: Sintese dos achados principais com classificacao de risco (ALERTA VERMELHO / AMARELO / CONFORME)ação do índice de presença
2. ANALISE DA COTA PARLAMENTAR: Detalhamento dos gastos, concentracao de fornecedores, valores atipicos. Cite Art. 37 CF/88 (principio da impessoalidade) e Lei 8.666/93 quando aplicavel
3. PRESENCA E ATIVIDADE PARLAMENTAR: Avaliacao da presenca em sessoes. Se abaixo de 70%, cite possivel descumprimento regimental
4. INDICIOS DE IRREGULARIDADE: Liste cada achado suspeito com: a) descricao factual do achado b) fundamentacao legal aplicavel c) classificacao de gravidade. Use termos como: indicios, padrao atipico, requer aprofundamento, incompativel com
5. RECOMENDACOES: Sugestoes de encaminhamento (CGU, MPF, TCU, Corregedoria da Camara) conforme gravidade dos achados. 6. DISCLAIMER: Este relatorio foi gerado automaticamente pelo TransparenciaBR com base em dados publicos da CEAP. Nao constitui acusacao formal e os achados requerem verificacao adicional por orgaos competentes. Fonte: dadosabertos.camara.leg.bração com a média nacional`;
    const analysis = await callGemini(prompt);
    await userRef.update({
      credits: admin.firestore.FieldValue.increment(-2),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("analyses").add({
      userId: uid,
      politicianId,
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { analysis };
  }
);

// ============================================
// USUÁRIO - Gestão de perfil e créditos
// ============================================
exports.getUser = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  const userRef = db.collection("users").doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    // Create user profile if doesn't exist
    const newUser = {
      credits: 5,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
      plan: "free",
    };
    await userRef.set(newUser);
    return { ...newUser, credits: 5 };
  }
  return userDoc.data();
});

exports.updateUserProfile = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const displayName = sanitizeString(request.data.displayName, 100);
  const photoURL = sanitizeString(request.data.photoURL, 500);
  const updates = {};
  if (displayName) updates.displayName = displayName;
  if (photoURL) updates.photoURL = photoURL;
  updates.lastActivity = admin.firestore.FieldValue.serverTimestamp();
  await db.collection("users").doc(uid).update(updates);
  return { success: true };
});

// ============================================
// BUSCA - Políticos por estado/partido
// ============================================
exports.searchPoliticians = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const estado = sanitizeString(request.data.estado, 2);
  const partido = sanitizeString(request.data.partido, 20);
  const cargo = sanitizeString(request.data.cargo, 50);
  const nome = sanitizeString(request.data.nome, 200);
  const limitParam = request.data.limit || 20;
  let query = db.collection("politicians");
  if (estado) query = query.where("estado", "==", estado);
  if (partido) query = query.where("partido", "==", partido);
  if (cargo) query = query.where("cargo", "==", cargo);
  const limitNum = Math.min(Number(limitParam) || 20, 100);
  query = query.limit(limitNum);
  const snapshot = await query.get();
  let politicians = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  if (nome) {
    const nomeLower = nome.toLowerCase();
    politicians = politicians.filter(p => p.nome?.toLowerCase().includes(nomeLower));
  }
  return { politicians };
});

// ============================================
// RELATÓRIOS - Dados agregados
// ============================================
exports.getReport = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const { type, estado } = request.data;
  if (type === "presenca_estado") {
    let query = db.collection("politicians");
    if (estado) query = query.where("estado", "==", estado);
    const snapshot = await query.get();
    const politicians = snapshot.docs.map(doc => doc.data());
    const avgPresenca = politicians.length > 0
      ? Math.round(politicians.reduce((sum, p) => sum + (p.presenca || 0), 0) / politicians.length)
      : 0;
    return {
      type,
      estado: estado || "Nacional",
      totalPoliticians: politicians.length,
      avgPresenca,
      politicians: politicians.slice(0, 10),
    };
  }
  return { error: "Report type not supported" };
});

// ============================================
// INGESTAO DESPESAS - Cloud Function HTTP Melhorada
// Traz gastos de 2023 a 2026 para todos os deputados
// Suporta ?force=true para reingestão completa
// ============================================
exports.ingestDespesas = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const axios = require("axios");
    const LEGISLATURA = 57;
    const BATCH_SIZE = parseInt(req.query.batch || "3");     // Reduzi default para ser mais seguro
    const FORCE_REINGEST = req.query.force === "true";

    try {
      // Buscar todos os deputados da legislatura 57
      const depResp = await axios.get(
        `https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=${LEGISLATURA}&itens=600&ordem=ASC&ordenarPor=nome`,
        { timeout: 30000 }
      );
      const allDeps = depResp.data.dados;

      let toProcess = allDeps;

      if (!FORCE_REINGEST) {
        // Só processa os que ainda não têm gastos
        const missing = [];
        for (const dep of allDeps) {
          const snap = await db.collection("deputados_federais")
            .doc(String(dep.id)).collection("gastos").limit(1).get();
          if (snap.empty) missing.push(dep);
        }
        toProcess = missing;
      }

      if (toProcess.length === 0) {
        return res.json({ 
          success: true, 
          message: FORCE_REINGEST ? "Forçando reingestão..." : "Todos os deputados já possuem gastos." 
        });
      }

      const batchToProcess = toProcess.slice(0, BATCH_SIZE);
      const results = [];

      for (const dep of batchToProcess) {
        let totalDesp = 0;
        let totalValor = 0;

        // Se for force=true, limpa os gastos antigos primeiro
        if (FORCE_REINGEST) {
          const existingSnap = await db.collection("deputados_federais")
            .doc(String(dep.id)).collection("gastos").get();
          
          const deleteBatch = db.batch();
          existingSnap.docs.forEach(doc => {
            if (!doc.id.startsWith("_")) {
              deleteBatch.delete(doc.ref);
            }
          });
          await deleteBatch.commit();
          console.log(`Limpou gastos antigos do deputado ${dep.id}`);
        }

        // Busca despesas por ano (2023 até 2026)
        for (let ano = 2023; ano <= 2026; ano++) {
          let pg = 1;
          while (true) {
            const r = await axios.get(
              `https://dadosabertos.camara.leg.br/api/v2/deputados/${dep.id}/despesas?ano=${ano}&itens=100&pagina=${pg}`,
              { timeout: 15000 }
            );

            const items = r.data.dados || [];
            if (items.length === 0) break;

            const fbBatch = db.batch();
            for (const d of items) {
              const docId = `${d.ano}_${d.mes}_${d.cnpjCpfFornecedor || 'semcnpj'}_${Math.floor((d.valorLiquido || 0) * 100)}`
                .replace(/[\/.#$[\]]/g, '_');

              fbBatch.set(
                db.collection("deputados_federais").doc(String(dep.id)).collection("gastos").doc(docId),
                {
                  ano: d.ano,
                  mes: d.mes,
                  tipoDespesa: d.tipoDespesa || '',
                  fornecedorNome: d.nomeFornecedor || '',
                  cnpjCpf: d.cnpjCpfFornecedor || '',
                  valorDocumento: d.valorDocumento || 0,
                  valorLiquido: d.valorLiquido || 0,
                  urlDocumento: d.urlDocumento || '',
                  dataDocumento: d.dataDocumento || '',
                  numDocumento: d.numDocumento || '',
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }
              );

              totalDesp++;
              totalValor += (d.valorLiquido || 0);
            }

            await fbBatch.commit();

            if (items.length < 100) break;
            pg++;
            await new Promise(r => setTimeout(r, 300));
          }

          await new Promise(r => setTimeout(r, 500)); // delay entre anos
        }

        // Atualiza totais no documento do deputado
        await db.collection("deputados_federais").doc(String(dep.id)).set({
          totalGastos: totalValor,
          totalDespesas: totalDesp,
          lastIngest: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        results.push({ 
          id: dep.id, 
          nome: dep.nome, 
          despesas: totalDesp, 
          valor: totalValor 
        });
      }

      res.json({
        success: true,
        forceMode: FORCE_REINGEST,
        processed: results.length,
        remaining: toProcess.length - results.length,
        totalToProcess: toProcess.length,
        results,
      });

    } catch (error) {
      console.error("ingestDespesas error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
// ============================================
// RANKING DE GASTOS - CEAP
// ============================================
exports.calcularRankings = onRequest(
  { timeoutSeconds: 120, memory: "512MiB", region: "southamerica-east1" },
  async (req, res) => {
    try {
      const snapshot = await db.collection("deputados_federais").get();
      const deputados = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const totalGastos = data.totalGastos || data.totalGasto || 0;
        const nome = data.nome || "";
        const partido = data.partido || "";
        const uf = data.uf || "";
        const score = data.score || 0;
        deputados.push({ id: docSnap.id, nome, partido, uf, totalGasto: totalGastos, score });
      });

      // Ordenar: menor gasto = rank 1 (mais economico)
      deputados.sort((a, b) => a.totalGasto - b.totalGasto);

      // Firestore batch limit = 500, split if needed
      const batchSize = 490;
      for (let i = 0; i < deputados.length; i += batchSize) {
        const batch = db.batch();
        const chunk = deputados.slice(i, i + batchSize);
        chunk.forEach((dep, idx) => {
          const pos = i + idx + 1;
          const ref = db.collection("deputados_federais").doc(dep.id);
          batch.set(ref, {
            ranking: {
              posicao_economia: pos,
              total_deputados: deputados.length,
              percentil: Math.round(((deputados.length - pos) / deputados.length) * 100),
              atualizado_em: new Date().toISOString(),
            }
          }, { merge: true });
        });
        await batch.commit();
      }

      res.json({
        success: true,
        total: deputados.length,
        top10_economicos: deputados.slice(0, 10).map((d, i) => ({
          rank: i + 1, nome: d.nome, partido: d.partido, uf: d.uf, gastos: d.totalGasto,
        })),
        top10_gastadores: deputados.slice(-10).reverse().map((d, i) => ({
          rank: deputados.length - i, nome: d.nome, partido: d.partido, uf: d.uf, gastos: d.totalGasto,
        })),
      });
    } catch (error) {
      console.error("calcularRankings error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// AUDIT BOT - Fretamento de Aeronaves
// Analisa despesas de fretamento e gera alertas
// ============================================

const ICAO_DB = {
  'SBEG': { cidade: 'Manaus', estado: 'AM' },
  'SBBE': { cidade: 'Belém', estado: 'PA' },
  'SBBR': { cidade: 'Brasília', estado: 'DF' },
  'SBKP': { cidade: 'Campinas', estado: 'SP' },
  'SBGR': { cidade: 'Guarulhos', estado: 'SP' },
  'SBRJ': { cidade: 'Rio de Janeiro (SDU)', estado: 'RJ' },
  'SBGL': { cidade: 'Rio de Janeiro (GIG)', estado: 'RJ' },
  'SBSP': { cidade: 'São Paulo (CGH)', estado: 'SP' },
  'SBCF': { cidade: 'Confins/BH', estado: 'MG' },
  'SBPA': { cidade: 'Porto Alegre', estado: 'RS' },
  'SBCT': { cidade: 'Curitiba', estado: 'PR' },
  'SBRF': { cidade: 'Recife', estado: 'PE' },
  'SBSV': { cidade: 'Salvador', estado: 'BA' },
  'SBFL': { cidade: 'Florianópolis', estado: 'SC' },
  'SBFZ': { cidade: 'Fortaleza', estado: 'CE' },
  'SBNT': { cidade: 'Natal', estado: 'RN' },
  'SBGO': { cidade: 'Goiânia', estado: 'GO' },
  'SBBV': { cidade: 'Boa Vista', estado: 'RR' },
  'SBMQ': { cidade: 'Macapá', estado: 'AP' },
  'SBPV': { cidade: 'Porto Velho', estado: 'RO' },
  'SBRB': { cidade: 'Rio Branco', estado: 'AC' },
  'SBSL': { cidade: 'São Luís', estado: 'MA' },
  'SBTE': { cidade: 'Teresina', estado: 'PI' },
  'SBPL': { cidade: 'Petrolina', estado: 'PE' },
  'SBMO': { cidade: 'Maceió', estado: 'AL' },
  'SBAR': { cidade: 'Aracaju', estado: 'SE' },
  'SBCG': { cidade: 'Campo Grande', estado: 'MS' },
  'SBCY': { cidade: 'Cuiabá', estado: 'MT' },
  'SBMN': { cidade: 'Manaus (Ponta Pelada)', estado: 'AM' },
  'SBSN': { cidade: 'Santarém', estado: 'PA' },
  'SBMA': { cidade: 'Marabá', estado: 'PA' },
  'SBHT': { cidade: 'Altamira', estado: 'PA' },
  'SNMZ': { cidade: 'Monte Alegre', estado: 'PA' },
};

// Routes that have regular commercial flights (interstate, main hubs)
const COMMERCIAL_ROUTES = [
  ['SP', 'RJ'], ['SP', 'MG'], ['SP', 'DF'], ['SP', 'RS'], ['SP', 'PR'],
  ['SP', 'BA'], ['SP', 'PE'], ['SP', 'CE'], ['RJ', 'MG'], ['RJ', 'DF'],
  ['RJ', 'BA'], ['RJ', 'RS'], ['DF', 'MG'], ['DF', 'BA'], ['DF', 'RS'],
  ['DF', 'PE'], ['DF', 'CE'], ['DF', 'PA'], ['DF', 'AM'], ['DF', 'GO'],
  ['DF', 'PR'], ['DF', 'SC'], ['DF', 'RJ'],
];

function hasCommercialFlight(state1, state2) {
  if (!state1 || !state2) return false;
  return COMMERCIAL_ROUTES.some(([a, b]) =>
    (a === state1 && b === state2) || (a === state2 && b === state1)
  );
}

function extractICAOCodes(text) {
  if (!text) return [];
  const pattern = /\b(SB[A-Z]{2}|SN[A-Z]{2})\b/g;
  return [...new Set((text.match(pattern) || []))];
}

function isWeekend(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

exports.auditFretamento = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const depSnapshot = await db.collection("deputados_federais").get();
      const stats = { totalDeputados: 0, totalAlertas: 0, deputadosComAlerta: 0 };

      for (const depDoc of depSnapshot.docs) {
        const depData = depDoc.data();
        const depId = depDoc.id;
        const depUf = depData.uf || '';
        stats.totalDeputados++;

        // Fetch all gastos for this deputy
        const gastosSnap = await db.collection("deputados_federais")
          .doc(depId).collection("gastos").get();

        // Filter for aircraft charter expenses
        const fretamentos = [];
        const allGastos = [];
        for (const gDoc of gastosSnap.docs) {
          const g = gDoc.data();
          if (gDoc.id === '_no_expenses') continue;
          allGastos.push({ id: gDoc.id, ...g });
          const tipo = (g.tipoDespesa || g.tipo || '').toUpperCase();
          if (tipo.includes('AERONAVE') || tipo.includes('FRETAMENTO') || tipo.includes('CHARTER')) {
            fretamentos.push({ id: gDoc.id, ...g });
          }
        }

        if (fretamentos.length === 0) continue;

        const alertas = [];

        // Supplier totals for concentration check
        const supplierTotals = {};
        let totalFretamentoValor = 0;
        for (const f of fretamentos) {
          const supplier = f.fornecedorNome || f.nomeFornecedor || f.fornecedor || 'Desconhecido';
          const valor = f.valorLiquido || f.valorDocumento || f.valor || 0;
          supplierTotals[supplier] = (supplierTotals[supplier] || 0) + valor;
          totalFretamentoValor += valor;
        }

        for (const f of fretamentos) {
          const valor = f.valorLiquido || f.valorDocumento || f.valor || 0;
          const supplier = f.fornecedorNome || f.nomeFornecedor || f.fornecedor || '';
          const cnpj = f.cnpjCpf || f.cnpjCpfFornecedor || f.cnpj || '';
          const descricao_campo = f.tipoDespesa || f.tipo || '';
          const observacao = f.detalhamento || f.numDocumento || '';

          // RULE 1: High value (>R$20,000)
          if (valor > 20000) {
            alertas.push({
              tipo: 'VALOR_ALTO',
              gravidade: valor > 50000 ? 'ALTA' : 'MEDIA',
              despesaId: f.id,
              data: f.dataDocumento || '',
              valor,
              fornecedor: supplier,
              cnpj,
              descricao: `Fretamento de aeronave com valor de ${fmt_brl(valor)} (acima de R$20.000)`,
              detalhes: { limiar: 20000, excesso: valor - 20000 },
              urlDocumento: f.urlDocumento || '',
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // RULE 2: ICAO route discrepancy
          const textToSearch = `${descricao_campo} ${observacao} ${supplier}`;
          const icaoCodes = extractICAOCodes(textToSearch);
          if (icaoCodes.length >= 2) {
            const states = icaoCodes
              .map(code => ICAO_DB[code]?.estado)
              .filter(Boolean);
            const uniqueStates = [...new Set(states)];
            // Check if route doesn't involve deputy's home state or DF
            const involvesHomeOrDF = uniqueStates.some(s => s === depUf || s === 'DF');
            if (!involvesHomeOrDF && uniqueStates.length >= 2) {
              alertas.push({
                tipo: 'ROTA_DISCREPANTE',
                gravidade: 'ALTA',
                despesaId: f.id,
                data: f.dataDocumento || '',
                valor,
                fornecedor: supplier,
                cnpj,
                descricao: `Rota de fretamento (${icaoCodes.join(' → ')}) nao envolve o estado do deputado (${depUf}) nem Brasilia (DF)`,
                detalhes: {
                  icaoCodes,
                  estadosRota: uniqueStates,
                  estadoDeputado: depUf,
                },
                urlDocumento: f.urlDocumento || '',
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }

          // RULE 3: Anti-economic interstate flights (commercial route available)
          if (icaoCodes.length >= 2) {
            const states = icaoCodes
              .map(code => ICAO_DB[code]?.estado)
              .filter(Boolean);
            const uniqueStates = [...new Set(states)];
            if (uniqueStates.length >= 2) {
              for (let i = 0; i < uniqueStates.length; i++) {
                for (let j = i + 1; j < uniqueStates.length; j++) {
                  if (hasCommercialFlight(uniqueStates[i], uniqueStates[j])) {
                    alertas.push({
                      tipo: 'VOO_ANTIECONOMICO',
                      gravidade: 'MEDIA',
                      despesaId: f.id,
                      data: f.dataDocumento || '',
                      valor,
                      fornecedor: supplier,
                      cnpj,
                      descricao: `Fretamento na rota ${uniqueStates[i]}-${uniqueStates[j]} que possui voos comerciais regulares`,
                      detalhes: {
                        icaoCodes,
                        rotaComercial: [uniqueStates[i], uniqueStates[j]],
                      },
                      urlDocumento: f.urlDocumento || '',
                      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    break;
                  }
                }
              }
            }
          }

          // RULE 5: Weekend flights
          if (isWeekend(f.dataDocumento)) {
            alertas.push({
              tipo: 'VOO_FIM_SEMANA',
              gravidade: 'BAIXA',
              despesaId: f.id,
              data: f.dataDocumento || '',
              valor,
              fornecedor: supplier,
              cnpj,
              descricao: `Fretamento de aeronave em fim de semana (${f.dataDocumento}) - possivel uso pessoal`,
              detalhes: {
                diaSemana: new Date(f.dataDocumento).toLocaleDateString('pt-BR', { weekday: 'long' }),
              },
              urlDocumento: f.urlDocumento || '',
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // RULE 4: Supplier concentration (>80% from single supplier)
        if (totalFretamentoValor > 0) {
          for (const [supplier, total] of Object.entries(supplierTotals)) {
            const pct = (total / totalFretamentoValor) * 100;
            if (pct > 80) {
              alertas.push({
                tipo: 'CONCENTRACAO_FORNECEDOR',
                gravidade: 'ALTA',
                despesaId: '',
                data: '',
                valor: total,
                fornecedor: supplier,
                cnpj: '',
                descricao: `Fornecedor "${supplier}" concentra ${pct.toFixed(0)}% de todos os fretamentos (${fmt_brl(total)} de ${fmt_brl(totalFretamentoValor)})`,
                detalhes: {
                  percentual: pct,
                  totalFornecedor: total,
                  totalFretamentos: totalFretamentoValor,
                  numFretamentos: fretamentos.length,
                },
                urlDocumento: '',
                criadoEm: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
        }

        // Write alerts to Firestore
        if (alertas.length > 0) {
          stats.deputadosComAlerta++;
          stats.totalAlertas += alertas.length;

          // Delete old alerts first
          const oldAlertas = await db.collection("deputados_federais")
            .doc(depId).collection("alertas_fretamento").get();
          if (!oldAlertas.empty) {
            const delBatch = db.batch();
            let delCount = 0;
            for (const old of oldAlertas.docs) {
              delBatch.delete(old.ref);
              delCount++;
              if (delCount >= 490) {
                await delBatch.commit();
                delCount = 0;
              }
            }
            if (delCount > 0) await delBatch.commit();
          }

          // Write new alerts in batches
          const BATCH_LIMIT = 490;
          for (let i = 0; i < alertas.length; i += BATCH_LIMIT) {
            const chunk = alertas.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            for (const alerta of chunk) {
              const ref = db.collection("deputados_federais")
                .doc(depId).collection("alertas_fretamento").doc();
              batch.set(ref, alerta);
            }
            await batch.commit();
          }

          // Update deputy doc with summary
          const totalValorAlertas = alertas.reduce((s, a) => s + (a.valor || 0), 0);
          await db.collection("deputados_federais").doc(depId).set({
            alertasFretamento: {
              total: alertas.length,
              totalValor: totalValorAlertas,
              ultimaAuditoria: admin.firestore.FieldValue.serverTimestamp(),
            },
          }, { merge: true });
        }
      }

      res.json({
        success: true,
        ...stats,
        message: `Auditoria concluida: ${stats.totalAlertas} alertas em ${stats.deputadosComAlerta} deputados`,
      });
    } catch (error) {
      console.error("auditFretamento error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

function fmt_brl(v) {
  return 'R$' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ============================================
// INGESTAO VERBA DE GABINETE - Versão Corrigida (completa)
// Suporta ?force=true e múltiplos anos (2026 por padrão)
// ============================================
exports.ingestVerbaGabinete = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const axios = require("axios");
    const cheerio = require("cheerio");
    const BATCH_SIZE = parseInt(req.query.batch || "5");
    const FORCE = req.query.force === "true";
    const ANO = parseInt(req.query.ano || "2026");

    try {
      // Buscar todos os deputados
      const depSnapshot = await db.collection("deputados_federais").get();
      const allDeps = [];
      depSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.idCamara || doc.id) allDeps.push({ firestoreId: doc.id, idCamara: d.idCamara || doc.id, nome: d.nome });
      });

      let toProcess = allDeps;
      if (!FORCE) {
        const missing = [];
        for (const dep of allDeps) {
          const vgSnap = await db.collection("deputados_federais")
            .doc(dep.firestoreId).collection("verbas_gabinete").limit(1).get();
          if (vgSnap.empty) missing.push(dep);
        }
        toProcess = missing;
      }

      if (toProcess.length === 0) {
        return res.json({ success: true, message: "Todos os deputados já possuem verba gabinete." });
      }

      const batch_deps = toProcess.slice(0, BATCH_SIZE);
      const results = [];

      for (const dep of batch_deps) {
        try {
          // Se for force=true, limpa os dados antigos
          if (FORCE) {
            const oldSnap = await db.collection("deputados_federais")
              .doc(dep.firestoreId).collection("verbas_gabinete").get();
            const delBatch = db.batch();
            oldSnap.docs.forEach(d => delBatch.delete(d.ref));
            await delBatch.commit();
          }

          // Scrape verba-gabinete
          const vgUrl = `https://www.camara.leg.br/deputados/${dep.idCamara}/verba-gabinete?ano=${ANO}`;
          const vgResp = await axios.get(vgUrl, { timeout: 15000, headers: { 'User-Agent': 'TransparenciaBR/1.0 (civic-tech)' } });
          const $ = cheerio.load(vgResp.data);

          const rows = [];
          $('table tbody tr').each((i, tr) => {
            const cells = $(tr).find('td');
            if (cells.length >= 3) {
              const mes = $(cells[0]).text().trim();
              const disponivel = $(cells[1]).text().trim().replace(/\./g, '').replace(',', '.');
              const gasto = $(cells[2]).text().trim().replace(/\./g, '').replace(',', '.');
              rows.push({
                mes: parseInt(mes) || 0,
                ano: ANO,
                valorDisponivel: parseFloat(disponivel) || 0,
                valorGasto: parseFloat(gasto) || 0,
                economia: (parseFloat(disponivel) || 0) - (parseFloat(gasto) || 0),
                percentualUtilizado: (parseFloat(disponivel) > 0) ? ((parseFloat(gasto) / parseFloat(disponivel)) * 100).toFixed(1) : '0',
              });
            }
          });

          // Scrape pessoal-gabinete
          const pgUrl = `https://www.camara.leg.br/deputados/${dep.idCamara}/pessoal-gabinete?ano=${ANO}`;
          const pgResp = await axios.get(pgUrl, { timeout: 15000, headers: { 'User-Agent': 'TransparenciaBR/1.0 (civic-tech)' } });
          const $pg = cheerio.load(pgResp.data);
          const pessoal = [];
          $pg('table tbody tr').each((i, tr) => {
            const cells = $pg(tr).find('td');
            if (cells.length >= 4) {
              pessoal.push({
                nome: $pg(cells[0]).text().trim(),
                grupoFuncional: $pg(cells[1]).text().trim(),
                cargo: $pg(cells[2]).text().trim(),
                periodo: $pg(cells[3]).text().trim(),
              });
            }
          });

          // Salvar no Firestore
          const fbBatch = db.batch();
          let totalGasto = 0;
          let totalDisponivel = 0;
          for (const row of rows) {
            const docId = `${ANO}_${String(row.mes).padStart(2, '0')}`;
            fbBatch.set(
              db.collection("deputados_federais").doc(dep.firestoreId)
                .collection("verbas_gabinete").doc(docId),
              row
            );
            totalGasto += row.valorGasto;
            totalDisponivel += row.valorDisponivel;
          }

          // Salvar pessoal
          for (const p of pessoal) {
            const pDocId = `${ANO}_${p.nome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}`;
            fbBatch.set(
              db.collection("deputados_federais").doc(dep.firestoreId)
                .collection("pessoal_gabinete").doc(pDocId),
              { ...p, ano: ANO }
            );
          }

          await fbBatch.commit();

          // Atualizar resumo no documento do deputado
          await db.collection("deputados_federais").doc(dep.firestoreId).set({
            verbaGabinete: {
              ano: ANO,
              totalGasto,
              totalDisponivel,
              percentualUtilizado: totalDisponivel > 0 ? ((totalGasto / totalDisponivel) * 100).toFixed(1) : '0',
              totalAssessores: pessoal.length,
              meses: rows.length,
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
            },
          }, { merge: true });

          results.push({ id: dep.idCamara, nome: dep.nome, meses: rows.length, pessoal: pessoal.length, totalGasto });

        } catch (e) {
          console.log(`Err verba gabinete dep ${dep.idCamara}: ${e.message}`);
          results.push({ id: dep.idCamara, nome: dep.nome, error: e.message });
        }
        await new Promise(r => setTimeout(r, 600));
      }

      res.json({
        success: true,
        force: FORCE,
        processed: results.length,
        remaining: toProcess.length - results.length,
        results,
      });
    } catch (error) {
      console.error("ingestVerbaGabinete error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// NOTICIAS - Busca noticias sobre parlamentar
// ============================================
var DOMINIOS_CONFIAVEIS = [
  'g1.globo.com', 'folha.uol.com.br', 'estadao.com.br',
  'uol.com.br', 'poder360.com.br', 'congressoemfoco.uol.com.br',
  'metropoles.com', 'bbc.com', 'reuters.com', 'gazetadopovo.com.br',
  'valor.globo.com', 'infomoney.com.br', 'cnnbrasil.com.br',
  'oglobo.globo.com', 'correiobraziliense.com.br', 'r7.com',
  'diariodepernambuco.com.br', 'jornaldocommercio.com.br',
  'cartacapital.com.br', 'band.uol.com.br',
];

var KW_POSITIVAS = [
  'reduzir cota', 'cortar privilegios', 'economia de gastos',
  'transparencia', 'fim de auxilio', 'cartao corporativo transparente',
  'austeridade', 'prestacao de contas',
];

var KW_NEGATIVAS = [
  'gastos recordes', 'escandalo', 'processo', 'investigado',
  'denunciado', 'condenado', 'corrupcao', 'esquema', 'rachadinha',
  'peculato', 'lavagem', 'fraude', 'improbidade',
];

function calcularRelevanciaNoticia(titulo, descricao) {
  var texto = ((titulo || '') + ' ' + (descricao || '')).toLowerCase();
  var score = 0;
  KW_POSITIVAS.forEach(function(kw) { if (texto.indexOf(kw) >= 0) score += 10; });
  KW_NEGATIVAS.forEach(function(kw) { if (texto.indexOf(kw) >= 0) score -= 5; });
  return score;
}

function extrairDominio(url) {
  try {
    var u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch(e) { return ''; }
}

exports.buscarNoticias = onRequest(
  { region: "southamerica-east1" },
  async (req, res) => {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
    var nome = (req.query.nome || '').trim();
    var idCamara = (req.query.idCamara || '').trim();
    if (!nome) return res.status(400).json({ error: 'Parametro nome obrigatorio' });

    try {
      var axios = require('axios');
      var query = nome + ' deputado';
      // Usar Google Custom Search (configurar GOOGLE_CSE_KEY e GOOGLE_CSE_CX como env vars)
      var apiKey = process.env.GOOGLE_CSE_KEY;
      var cx = process.env.GOOGLE_CSE_CX;

      var noticias = [];

      if (apiKey && cx) {
        var resp = await axios.get('https://www.googleapis.com/customsearch/v1', {
          params: { key: apiKey, cx: cx, q: query, num: 10, dateRestrict: 'y1' },
          timeout: 10000,
        });
        var items = (resp.data && resp.data.items) || [];
        items.forEach(function(item) {
          var dominio = extrairDominio(item.link || '');
          var confiavel = DOMINIOS_CONFIAVEIS.some(function(d) { return dominio.indexOf(d) >= 0; });
          if (confiavel) {
            noticias.push({
              titulo: item.title || '',
              fonte: dominio,
              data: item.snippet ? item.snippet.substring(0, 20) : '',
              url: item.link || '',
              relevancia: calcularRelevanciaNoticia(item.title, item.snippet),
            });
          }
        });
      } else {
        // Fallback: buscar noticias do Firestore se existirem
        var noticiasSnap = await db.collection('deputados_federais')
          .doc(String(idCamara)).collection('noticias').orderBy('data', 'desc').limit(10).get();
        noticiasSnap.forEach(function(doc) {
          var d = doc.data();
          noticias.push({
            titulo: d.titulo || '',
            fonte: d.fonte || '',
            data: d.data || '',
            url: d.url || '',
            relevancia: 0,
          });
        });
      }

      // Ordenar por relevancia e limitar
      noticias.sort(function(a, b) { return b.relevancia - a.relevancia; });
      var resultado = noticias.slice(0, 10).map(function(n) {
        return { titulo: n.titulo, fonte: n.fonte, data: n.data, url: n.url };
      });

      res.json(resultado);
    } catch (error) {
      console.error('buscarNoticias error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// RANKINGS - Top 10 e Bottom 10 TransparenciaBR
// ============================================
exports.getRankingsTransparencia = onRequest(
  { region: "southamerica-east1" },
  async (req, res) => {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
    try {
      var doc = await db.collection('system_data').doc('rankings_transparencia').get();
      if (!doc.exists) {
        return res.json({ top10: [], bottom10: [], message: 'Rankings nao calculados ainda. Execute run-ingest-score-transparencia.js' });
      }
      var data = doc.data();
      res.json({
        top10: data.top10 || [],
        bottom10: data.bottom10 || [],
        atualizadoEm: data.atualizadoEm || null,
      });
    } catch (error) {
      console.error('getRankingsTransparencia error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// RECALCULAR INDICE - Cloud Function HTTP
// Recalcula o Indice TransparenciaBR para todos os deputados
// ============================================
exports.recalcularIndiceTransparencia = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    var authHeader = req.headers['x-admin-key'];
    var adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      var indice = require('./indiceTransparenciaBR');
      var pilaresLib = require('./montarPilaresDeputado');
      var TETO = 5616000;

      var snapshot = await db.collection('deputados_federais').get();
      var deputadosRaw = [];
      snapshot.forEach(function(docSnap) {
        var data = docSnap.data();
        var idCamara = data.idCamara || parseInt(docSnap.id) || 0;
        var totalGastosCeap = data.totalGastos || data.totalGasto || 0;
        var vgGasto = (data.verbaGabinete && data.verbaGabinete.totalGasto) || 0;
        deputadosRaw.push({
          firestoreId: docSnap.id,
          idCamara: idCamara,
          nome: data.nome || '',
          partido: data.partido || '',
          uf: data.uf || '',
          gastoTotal: totalGastosCeap + vgGasto,
          tetoCota: TETO,
          sessoesPresente: data.presentSessions || 0,
          sessoesTotal: data.totalSessions || 0,
          totalProcessos: data.totalProcessos || 0,
          processosGraves: data.processosGraves || 0,
        });
      });

      var processosMap = indice.calcularProcessosScores(
        deputadosRaw.map(function(d) {
          return { idCamara: d.idCamara, totalProcessos: d.totalProcessos, processosGraves: d.processosGraves };
        })
      );

      var deputadosComScore = deputadosRaw.map(function(dep) {
        var pScore = processosMap[dep.idCamara];
        if (pScore === undefined) pScore = 100;
        var p = pilaresLib.montarPilares({
          gastoTotal: dep.gastoTotal, tetoCota: dep.tetoCota,
          sessoesPresente: dep.sessoesPresente, sessoesTotal: dep.sessoesTotal,
          proposicoes: [], discursos: [], processosScore: pScore,
        });
        return Object.assign({}, dep, {
          pilares: p, processosScore: pScore,
          scoreBrutoTransparenciaBR: indice.calcularScoreBrutoTransparenciaBR(p),
        });
      });

      var normalizados = indice.normalizarScoresPorKim(deputadosComScore);
      var rankings = indice.gerarRankings(normalizados);

      // Salvar scores no Firestore
      for (var i = 0; i < normalizados.length; i += 490) {
        var chunk = normalizados.slice(i, i + 490);
        var batch = db.batch();
        chunk.forEach(function(dep) {
          batch.set(db.collection('deputados_federais').doc(dep.firestoreId), {
            pilares: dep.pilares,
            scoreBrutoTransparenciaBR: dep.scoreBrutoTransparenciaBR,
            scoreFinalTransparenciaBR: dep.scoreFinalTransparenciaBR || null,
            classificacaoTransparenciaBR: dep.classificacaoTransparenciaBR || null,
            indiceAtualizado: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        });
        await batch.commit();
      }

      // Salvar rankings
      await db.collection('system_data').doc('rankings_transparencia').set({
        top10: rankings.top10.map(function(d) {
          return { idCamara: d.idCamara, nome: d.nome, partido: d.partido, uf: d.uf,
            scoreFinalTransparenciaBR: d.scoreFinalTransparenciaBR,
            classificacaoTransparenciaBR: d.classificacaoTransparenciaBR };
        }),
        bottom10: rankings.bottom10.map(function(d) {
          return { idCamara: d.idCamara, nome: d.nome, partido: d.partido, uf: d.uf,
            scoreFinalTransparenciaBR: d.scoreFinalTransparenciaBR,
            classificacaoTransparenciaBR: d.classificacaoTransparenciaBR };
        }),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ success: true, total: normalizados.length,
        top10: rankings.top10.map(function(d) { return d.nome + ': ' + d.scoreFinalTransparenciaBR; }),
        bottom10: rankings.bottom10.map(function(d) { return d.nome + ': ' + d.scoreFinalTransparenciaBR; }),
      });
    } catch (error) {
      console.error('recalcularIndiceTransparencia error:', error);
      res.status(500).json({ error: error.message });
    }
    
  }
);


// ============================================
// CREDITOS API - Endpoints de wallet e historico
// ============================================

// Consultar saldo do usuario
exports.getWalletCredits = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const wallet = await creditService.getWallet(uid);
  return wallet;
});

// Historico de transacoes de creditos
exports.getCreditHistory = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const limit = Math.min(Number(request.data.limit) || 20, 100);
  const historico = await creditService.getHistorico(uid, limit);
  return { historico };
});

// Comprar creditos - cria sessao Stripe com priceId do pacote
exports.buyCredits = onCall({ region: "southamerica-east1", secrets: [stripeKey] }, async (request) => {
  const stripe = require("stripe")((process.env.STRIPE_SECRET || "").trim());
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  
  const { packageId } = request.data;
  const pkg = creditService.CREDIT_PACKAGES[packageId];
  if (!pkg) throw new Error("Pacote invalido. Pacotes: " + Object.keys(creditService.CREDIT_PACKAGES).join(', '));
  
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "brl",
        product_data: { name: `TransparenciaBR - ${pkg.name} (${pkg.credits} creditos)` },
        unit_amount: pkg.amount,
      },
      quantity: 1,
    }],
    mode: "payment",
    success_url: "https://transparenciabr.com.br/creditos?success=true",
    cancel_url: "https://transparenciabr.com.br/creditos?canceled=true",
    metadata: { userId: uid, packageId, credits: String(pkg.credits) },
  });
  return { sessionId: session.id, url: session.url };
});

// Webhook Stripe V2 - integrado com creditService
exports.stripeWebhookV2 = onRequest({ region: "southamerica-east1", secrets: [stripeKey, stripeWebhookKey] }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const stripe = require("stripe")((process.env.STRIPE_SECRET || "").trim());
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return res.status(500).send("Webhook secret not configured");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook V2 signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  const session = event.data.object;
  if (event.type === "checkout.session.completed") {
    const userId = session.metadata?.userId;
    const packageId = session.metadata?.packageId;
    const metaCredits = parseInt(session.metadata?.credits) || 0;
    if (userId) {
      // Resolver creditos: metadata > packageId > amount
      const credits = metaCredits || creditService.resolveCredits(packageId, session.amount_total) || 0;
      if (credits > 0) {
        await creditService.creditarCompra(userId, credits, {
          stripeSessionId: session.id,
          packageId: packageId || null,
          amount: session.amount_total,
          paymentMethod: session.payment_method_types?.[0] || 'unknown',
        });
        // Manter compatibilidade com users collection
        await db.collection("users").doc(userId).set({
          credits: admin.firestore.FieldValue.increment(credits),
          lastPurchase: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`Credits V2: ${credits} creditos adicionados para ${userId}`);
      }
    }
  }
  res.json({ received: true });
});


// ============================================
// SESSAO - Registrar e validar sessao (anti-login simultaneo)
// ============================================
exports.registerUserSession = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  const { sessionId, deviceInfo } = request.data;
  if (!sessionId) throw new Error("sessionId required");
  await creditService.registerSession(uid, sessionId, deviceInfo || {});
  return { success: true };
});

exports.validateUserSession = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  const { sessionId } = request.data;
  if (!sessionId) throw new Error("sessionId required");
  return await creditService.validateSession(uid, sessionId);
});

// ============================================
// REFERRAL - Gerar link e processar indicacao
// ============================================
exports.getReferralCode = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  const codigo = await creditService.gerarCodigoReferral(uid);
  const link = `https://transparenciabr.com.br/?ref=${codigo}`;
  // Buscar stats
  const refDoc = await db.collection('referrals').doc(uid).get();
  const stats = refDoc.exists ? refDoc.data() : { totalIndicados: 0, totalCreditsGanhos: 0 };
  return { codigo, link, stats };
});

exports.processReferralCode = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  const { codigoReferral } = request.data;
  if (!codigoReferral) throw new Error("codigoReferral required");
  await creditService.processarReferral(codigoReferral, uid);
  return { success: true };
});

// ============================================
// TRIAL DIARIO - Verificar status
// ============================================
exports.checkTrialDiario = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  checkRateLimit(uid);
  return await creditService.checkTrialDiario(uid);
});

// ============================================
// ADMIN - Setar status admin (protegido por ADMIN_KEY)
// ============================================
exports.setAdminStatus = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  const authHeader = req.headers["x-admin-key"];
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || authHeader !== adminKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { userId, isAdmin } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  await db.collection("users").doc(userId).set({
    isAdmin: isAdmin === true,
    adminSetAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  res.json({ success: true, userId, isAdmin: isAdmin === true });
});

// ============================================
// EVENTOS DE USO - Big Data Collection (BLOCO 4)
// ============================================
exports.logUserEvent = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new Error("Authentication required");
  const { eventType, eventData } = request.data;
  if (!eventType) throw new Error("eventType required");
  const allowedEvents = [
    'PAGE_VIEW', 'PROFILE_VIEW', 'ANALYSIS_REQUEST', 'CHAT_MESSAGE',
    'SEARCH', 'FILTER_CHANGE', 'SHARE', 'EXPORT', 'CLICK',
    'CREDIT_PURCHASE', 'LOGIN', 'LOGOUT', 'REFERRAL_SHARE',
  ];
  if (!allowedEvents.includes(eventType)) throw new Error("eventType invalido");
  await db.collection('user_events').add({
    userId: uid,
    eventType: sanitizeString(eventType, 50),
    eventData: typeof eventData === 'object' ? eventData : {},
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    date: new Date().toISOString().slice(0, 10),
  });
  return { success: true };
});

// Agregacao diaria de eventos (para dashboard B2B)
exports.aggregateEvents = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 120 },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const snap = await db.collection('user_events')
      .where('date', '==', date).get();
    const counts = {};
    const uniqueUsers = new Set();
    const topPoliticians = {};
    snap.forEach(doc => {
      const d = doc.data();
      counts[d.eventType] = (counts[d.eventType] || 0) + 1;
      uniqueUsers.add(d.userId);
      if (d.eventType === 'PROFILE_VIEW' && d.eventData?.politicianId) {
        topPoliticians[d.eventData.politicianId] = (topPoliticians[d.eventData.politicianId] || 0) + 1;
      }
    });
    const topPols = Object.entries(topPoliticians)
      .sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([id, views]) => ({ id, views }));
    const aggregated = {
      date,
      totalEvents: snap.size,
      uniqueUsers: uniqueUsers.size,
      eventCounts: counts,
      topPoliticians: topPols,
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('daily_analytics').doc(date).set(aggregated);
    res.json(aggregated);
  }
);


// ============================================
// INGESTÃO OFICIAL DE PRESENÇAS (Câmara dos Deputados)
// Traz presença real 2023-2026 + calcula percentual
// Suporta ?force=true
// ============================================
exports.ingestPresencas = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const axios = require("axios");
    const BATCH_SIZE = parseInt(req.query.batch || "3");
    const FORCE = req.query.force === "true";

    try {
      const depSnap = await db.collection("deputados_federais").get();
      let toProcess = [];
      depSnap.forEach(doc => toProcess.push({ id: doc.id, ...doc.data() }));

      if (!FORCE) {
        const filtered = [];
        for (const dep of toProcess) {
          const s = await db.collection("deputados_federais")
            .doc(dep.id).collection("sessoes").limit(1).get();
          if (s.empty) filtered.push(dep);
        }
        toProcess = filtered;
      }

      if (toProcess.length === 0) {
        return res.json({ success: true, message: "Todos os deputados já possuem presenças." });
      }

      const batch = toProcess.slice(0, BATCH_SIZE);
      const results = [];

      for (const dep of batch) {
        let total = 0;
        const fbBatch = db.batch();

        for (let ano = 2023; ano <= 2026; ano++) {
          const resp = await axios.get(
            `https://dadosabertos.camara.leg.br/api/v2/deputados/${dep.idCamara || dep.id}/presencas?ano=${ano}&itens=100`,
            { timeout: 15000 }
          );
          const presencas = resp.data.dados || [];
          for (const p of presencas) {
            const docId = `${p.dataSessao || ano}-${p.tipoSessao || 'PLEN'}`;
            fbBatch.set(
              db.collection("deputados_federais").doc(dep.id).collection("sessoes").doc(docId),
              { ...p, ano, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
            );
            total++;
          }
        }
        await fbBatch.commit();

        await db.collection("deputados_federais").doc(dep.id).set({
          presenca: total > 0 ? Math.round((total / 320) * 100) : 0,
          totalSessoes: total,
          lastPresencaIngest: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        results.push({ id: dep.id, nome: dep.nome, sessoesImportadas: total });
      }

      res.json({
        success: true,
        force: FORCE,
        processed: results.length,
        remaining: toProcess.length - results.length,
        results,
      });
    } catch (e) {
      console.error("ingestPresencas error:", e);
      res.status(500).json({ error: e.message });
    }
  }
);

exports.checkInstantAlerts = onRequest(
  { region: "southamerica-east1", timeoutSeconds: 300 },
  async (req, res) => {
    const authHeader = req.headers["x-admin-key"];
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || authHeader !== adminKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const results = await alertaService.verificarNovosGastos();
      res.json({ success: true, ...results });
    } catch (error) {
      console.error("checkInstantAlerts error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// --- ADICIONAR NO FINAL DO FICHEIRO functions/index.js ---
const { Pool } = require('pg');

// O Pool de conexões fica fora da função para ser reaproveitado e garantir velocidade
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
});

exports.getEmendasSQL = onCall({ region: "southamerica-east1" }, async (request) => {
  const deputadoId = request.data.deputadoId;

  if (!deputadoId) {
    return { error: "ID do deputado não fornecido." };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM emendas WHERE deputado_id = $1 ORDER BY valor_empenhado DESC',
      [Number(deputadoId)]
    );
    return { emendas: result.rows };
  } catch (error) {
    console.error("Erro ao buscar emendas no SQL:", error);
    return { error: "Erro interno no servidor ao buscar emendas." };
  } finally {
    client.release();
  }
});

// --- NOVO MOTOR MASSIVO SQL (Versão Firebase v2 Safe) ---
const https = require('https');

// Função auxiliar para chamadas de API
function getAPINativa(url, apiKey = null) {
  return new Promise((resolve) => {
    const options = { headers: {} };
    if (apiKey) options.headers['chave-api-dados'] = apiKey;

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { console.error('JSON parse error', e); resolve(null); }
      });
    }).on('error', err => {
      console.error('HTTP error for', url, err);
      resolve(null);
    });
  });
}

exports.ingestMotorMassivo = onRequest(
  { region: 'southamerica-east1', timeoutSeconds: 540, memory: '1GiB' },
  async (req, res) => {
    const poolSQL = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      port: 5432,
    });

    const CGU_API_KEY = '717a95e01b072090f41940282eab700a';
    res.status(200).send('🔥 Motor Massivo Iniciado! Rodando em Background no Firebase.');

    let client;
    try {
      client = await poolSQL.connect();
      console.log('-> 1. Sugando Deputados da Câmara...');

      const reqCamara = await getAPINativa('https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1000');
      if (reqCamara && reqCamara.dados) {
        await client.query('BEGIN');
        for (const d of reqCamara.dados) {
          await client.query(
            `INSERT INTO politicos (id_politico, casa, nome_urna, sigla_partido, sigla_uf)
             VALUES ($1,'CAMARA',$2,$3,$4)
             ON CONFLICT (id_politico) DO NOTHING;`,
            [d.id, d.nome, d.siglaPartido, d.siglaUf],
          );
        }
        await client.query('COMMIT');
        console.log('✅ Deputados Inseridos.');
      }

      const { rows: deputados } = await client.query(
        "SELECT id_politico, nome_urna FROM politicos WHERE casa = 'CAMARA' LIMIT 5",
      );
      console.log(`-> 2. Varrendo Emendas para ${deputados.length} deputados...`);

      for (const dep of deputados) {
        const nomeAutor = dep.nome_urna
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase();

        const urlEmendas =
          'https://api.portaldatransparencia.gov.br/api-de-dados/emendas' +
          `?ano=2024&nomeAutor=${encodeURIComponent(nomeAutor)}&pagina=1`;

        const emendasReq = await getAPINativa(urlEmendas, CGU_API_KEY);
        if (emendasReq && emendasReq.length > 0) {
          await client.query('BEGIN');
          for (const em of emendasReq) {
            const recCNPJ =
              em.favorecido && em.favorecido.length > 0
                ? em.favorecido[0].cnpjFormatado
                : null;
            const recNome =
              em.favorecido && em.favorecido.length > 0
                ? em.favorecido[0].nome
                : null;

            await client.query(
              `INSERT INTO emendas_rastreadas
                 (codigo_emenda, id_politico_autor, ano, tipo_emenda,
                  municipio_beneficiado, cnpj_recebedor, nome_recebedor, valor_pago)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
               ON CONFLICT (codigo_emenda) DO NOTHING;`,
              [
                em.codigoEmenda,
                dep.id_politico,
                em.ano,
                em.tipoEmenda,
                em.localidadeDoGasto,
                recCNPJ,
                recNome,
                em.valorPago,
              ],
            );
          }
          await client.query('COMMIT');
        }
      }

      console.log('✅ INGESTÃO MASSIVA CONCLUÍDA NO BANCO SQL!');
    } catch (e) {
      if (client) await client.query('ROLLBACK');
      console.error('ERRO NO MOTOR SQL:', e);
    } finally {
      if (client) client.release();
      await poolSQL.end();
    }
  }
);


// ============================================
// SQL SERVICE - Endpoints Cloud SQL (Fase 3)
// ============================================
const sqlService = require('./sqlService');

// Health check do banco SQL
exports.sqlHealthCheck = onRequest(
  { region: 'southamerica-east1' },
  async (req, res) => {
    const result = await sqlService.healthCheck();
    res.json(result);
  }
);

// Perfil completo do parlamentar via SQL (substitui multiplas queries Firestore)
exports.getPerfilSQL = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Authentication required');
    checkRateLimit(uid);

    const politicoId = sanitizeString(request.data.politicoId || request.data.deputadoId || '', 100);
    const casa = sanitizeString(request.data.casa || 'CAMARA', 10);
    if (!politicoId) throw new Error('politicoId is required');
    if (!validateId(politicoId)) throw new Error('Invalid politicoId');

    const perfil = await sqlService.getPerfilCompleto(politicoId, casa);
    if (!perfil.politico) throw new Error('Politician not found');
    return perfil;
  }
);

// Busca de politicos via SQL
exports.searchPoliticosSQL = onCall(
  { region: 'southamerica-east1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Authentication required');
    checkRateLimit(uid);

    const { casa, uf, partido, nome, limit } = request.data;
    const politicos = await sqlService.searchPoliticos({
      casa: casa ? sanitizeString(casa, 10) : null,
      uf: uf ? sanitizeString(uf, 2) : null,
      partido: partido ? sanitizeString(partido, 20) : null,
      nome: nome ? sanitizeString(nome, 200) : null,
      limit: Math.min(Number(limit) || 50, 200),
    });
    return { politicos };
  }
);

// Rankings via SQL
exports.getRankingsSQL = onRequest(
  { region: 'southamerica-east1' },
  async (req, res) => {
    if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
    const casa = (req.query.casa || 'CAMARA').toUpperCase();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const rankings = casa === 'SENADO'
      ? await sqlService.getRankingSenado(limit)
      : await sqlService.getRankingCamara(limit);
    res.json({ casa, total: rankings.length, rankings });
  }
);

// Analise IA com dados SQL (Fase 4 - prompt enrichment via SQL)
exports.analyzePoliticianSQL = onCall(
  { region: 'southamerica-east1', secrets: [geminiKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new Error('Authentication required');
    checkRateLimit(uid);

    const politicoId = sanitizeString(request.data.politicoId || request.data.deputadoId || '', 100);
    const casa = sanitizeString(request.data.casa || request.data.colecao === 'senadores' ? 'SENADO' : 'CAMARA', 10);
    if (!politicoId) throw new Error('politicoId is required');
    if (!validateId(politicoId)) throw new Error('Invalid politicoId');

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const credits = userDoc.exists ? (userDoc.data().credits || 0) : 0;
    if (credits < 2) throw new Error('Insufficient credits (need 2 for analysis)');

    const dados = await sqlService.getDadosParaRelatorioIA(politicoId, casa);
    if (!dados) throw new Error('Politician not found');

    const p = dados.politico;
    const g = dados.gastos.resumo;
    const e = dados.emendas.resumo;
    const pres = dados.presenca;

    const prompt = `Voce e um auditor fiscal do TransparenciaBR. Gere RELATORIO TECNICO baseado nos dados SQL:

POLITICO: ${p.nome} (${p.sigla_partido}/${p.uf}) - ${p.casa}
GASTOS CEAP: ${g.total_notas} notas, Total R$${Number(g.total_valor || 0).toFixed(2)}, Media R$${Number(g.media_valor || 0).toFixed(2)}, Maior R$${Number(g.maior_gasto || 0).toFixed(2)}
EMENDAS: ${e.total_emendas} emendas, Empenhado R$${Number(e.total_empenhado || 0).toFixed(2)}, Pago R$${Number(e.total_pago || 0).toFixed(2)}
PRESENCA: ${pres.presentes}/${pres.total_sessoes} sessoes (${pres.percentual}%)

TOP FORNECEDORES:
${dados.gastos.topFornecedores.map(f => `- ${f.fornecedor_nome} (${f.cnpj_cpf}): R$${Number(f.total_valor).toFixed(2)} em ${f.num_notas} notas`).join('\n')}

MAIORES GASTOS:
${dados.gastosMaiores.slice(0, 10).map(g => `- ${g.tipo_despesa}: R$${Number(g.valor_liquido).toFixed(2)} (${g.fornecedor_nome})`).join('\n')}

ALERTAS: ${(dados.alertas || []).length} alertas ativos

Gere relatorio com: RESUMO EXECUTIVO, ANALISE CEAP, PRESENCA, INDICIOS, RECOMENDACOES, DISCLAIMER.`;

    const analysis = await callGemini(prompt);

    await userRef.update({
      credits: admin.firestore.FieldValue.increment(-2),
      lastActivity: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('analyses').add({
      userId: uid,
      politicianId: politicoId,
      casa,
      source: 'sql',
      analysis,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { analysis };
  }
);
