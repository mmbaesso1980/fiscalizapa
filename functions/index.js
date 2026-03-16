const { onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const { defineSecret } = require("firebase-functions/params");
const geminiKey = defineSecret("GEMINI_KEY");

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
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// ============================================
// STRIPE - Checkout e Webhook
// ============================================

// Criar sessão de checkout
exports.createCheckoutSession = onCall({ region: "southamerica-east1" }, async (request) => {
  const stripe = require("stripe")(process.env.STRIPE_SECRET || "");
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
exports.stripeWebhook = onRequest({ region: "southamerica-east1" }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  const stripe = require("stripe")(process.env.STRIPE_SECRET || "");
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
      const creditsMap = { 2990: 30, 7990: 100, 19990: 300 };
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
          estado: dep.siglaUf,
          cargo: "Deputado Federal",
          foto: dep.urlFoto || "",
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
          estado: estado || "",
          cargo: "Senador",
          foto,
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
// AGENDAMENTO - Ingestão automática semanal
// ============================================
exports.weeklyIngest = onSchedule(
  { schedule: "every monday 06:00", region: "southamerica-east1", timeZone: "America/Sao_Paulo" },
  async (event) => {
    console.log("Starting weekly ingestion...");
    // Note: onSchedule can't call onRequest functions directly
    // This would need to be refactored to call the ingestion logic directly
    console.log("Weekly ingestion scheduled - implement direct logic here");
  }
);

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
    const prompt = `Analise o perfil deste político brasileiro com base nos dados disponíveis:

Nome: ${data.nome}
Partido: ${data.partido}
Estado: ${data.uf || data.estado}
Cargo: ${data.cargo}
Presença nas sessões: ${data.presenca || 0}%
Total de gastos: R$${data.totalGasto || data.gastos || 0}
Número de despesas: ${data.numGastos || 0}
Score de risco: ${data.score || 'N/A'}

Forneça uma análise objetiva incluindo:
1. Avaliação do índice de presença
2. Produtividade legislativa
3. Uso da cota parlamentar
4. Pontos positivos e negativos
5. Comparação com a média nacional`;
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
// INGESTAO DESPESAS - Cloud Function HTTP
// Processa deputados sem gastos em lotes
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
    const BATCH_SIZE = parseInt(req.query.batch || "5");
    try {
      // 1. Buscar todos deputados da API
      const depResp = await axios.get(
        `https://dadosabertos.camara.leg.br/api/v2/deputados?idLegislatura=${LEGISLATURA}&itens=600&ordem=ASC&ordenarPor=nome`,
        { timeout: 30000 }
      );
      const allDeps = depResp.data.dados;
      // 2. Verificar quais ja tem gastos no Firestore
      const missing = [];
      for (const dep of allDeps) {
        const gastosSnap = await db.collection("deputados_federais")
          .doc(String(dep.id)).collection("gastos").limit(1).get();
        if (gastosSnap.empty) missing.push(dep);
      }
      if (missing.length === 0) {
        return res.json({ success: true, message: "All deputies already have expenses", total: allDeps.length });
      }
      // 3. Processar lote
      const batch = missing.slice(0, BATCH_SIZE);
      const results = [];
      for (const dep of batch) {
        let totalDesp = 0;
        let totalValor = 0;
        for (let ano = 2023; ano <= 2026; ano++) {
          try {
            let pg = 1;
            while (true) {
              const r = await axios.get(
                `https://dadosabertos.camara.leg.br/api/v2/deputados/${dep.id}/despesas?ano=${ano}&itens=100&pagina=${pg}`,
                { timeout: 15000 }
              );
              const items = r.data.dados;
              if (!items || items.length === 0) break;
              const fbBatch = db.batch();
              for (const d of items) {
                const docId = `${ano}_${d.mes}_${d.cnpjCpfFornecedor || 'x'}_${d.valorDocumento}`.replace(/[\/.]/g, '_');
                fbBatch.set(
                  db.collection("deputados_federais").doc(String(dep.id))
                    .collection("gastos").doc(docId),
                  {
                    ano: d.ano, mes: d.mes,
                    tipo: d.tipoDespesa || '',
                    descricao: d.tipoDespesa || '',
                    fornecedor: d.nomeFornecedor || '',
                    cnpj: d.cnpjCpfFornecedor || '',
                    valor: d.valorDocumento || 0,
                    valorLiquido: d.valorLiquido || 0,
                    urlDocumento: d.urlDocumento || '',
                    dataDocumento: d.dataDocumento || '',
                    numDocumento: d.numDocumento || '',
                  }
                );
                totalDesp++;
                totalValor += (d.valorLiquido || 0);
              }
              await fbBatch.commit();
              if (items.length < 100) break;
              pg++;
              await new Promise(r => setTimeout(r, 200));
            }
          } catch (e) {
            console.log(`Err dep ${dep.id} ano ${ano}: ${e.message}`);
          }
          await new Promise(r => setTimeout(r, 300));
        }
        // Atualizar doc do deputado

                // Mark deputies with 0 expenses so they don't appear as "missing"
        if (totalDesp === 0) {
          await db.collection("deputados_federais").doc(String(dep.id))
            .collection("gastos").doc("_no_expenses").set({
              marker: true,
              message: "Sem despesas registradas na API da Camara",
              checkedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        await db.collection("deputados_federais").doc(String(dep.id)).set({
          totalGasto: totalValor,
          numGastos: totalDesp,
          lastIngest: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        results.push({ id: dep.id, nome: dep.nome, despesas: totalDesp, valor: totalValor });
      }
      res.json({
        success: true,
        processed: results.length,
        remaining: missing.length - results.length,
        totalMissing: missing.length,
        results,
      });
    } catch (error) {
      console.error("ingestDespesas error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);