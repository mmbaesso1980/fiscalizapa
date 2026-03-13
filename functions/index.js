const { onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const { defineSecret } = require("firebase-functions/params");
const geminiKey = defineSecret("GEMINI_KEY");

async function callGemini(prompt) {
  const { GoogleGenerativeAI } = require("@google/generative-ai");
  const KEY = process.env.GEMINI_KEY || 'AIzaSyBAiwtbVkJah0SKKa--VLfeUkuFiLurooc';
  const genAI = new GoogleGenerativeAI(KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Stripe checkout
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

// IA Analysis - Analise critica de gastos de um deputado
exports.analyzeDeputado = onCall({ region: "southamerica-east1", timeoutSeconds: 120, secrets: [geminiKey] }, async (request) => {
  const { deputadoId, colecao } = request.data;
  const col = colecao || "deputados";
  const depSnap = await db.collection(col).doc(deputadoId).get();
  if (!depSnap.exists) throw new Error("Deputado nao encontrado");
  const dep = depSnap.data();

  let gastos = [];
  let emendas = [];
  try { const s = await db.collection(col).doc(deputadoId).collection("gastos").get(); gastos = s.docs.map(d => d.data()); } catch(e) {}
  try { const s = await db.collection(col).doc(deputadoId).collection("emendas").get(); emendas = s.docs.map(d => d.data()); } catch(e) {}

  const porCategoria = {};
  const porMes = {};
  gastos.forEach(g => {
    const cat = g.tipoDespesa || g.categoria || "Outros";
    porCategoria[cat] = (porCategoria[cat] || 0) + (g.valorLiquido || g.valor || 0);
    const mes = (g.dataDocumento || g.data || "").substring(0, 7);
    if (mes) porMes[mes] = (porMes[mes] || 0) + (g.valorLiquido || g.valor || 0);
  });

  const totalGastos = Object.values(porCategoria).reduce((a, b) => a + b, 0);
  const totalEmendas = emendas.reduce((a, b) => a + (b.valorEmpenhado || b.valor || 0), 0);

  const prompt = `Analise critica dos gastos do deputado ${dep.nome} (${dep.partido}-${dep.uf}).
Gastos por categoria: ${JSON.stringify(porCategoria)}
Gastos por mes: ${JSON.stringify(porMes)}
Total gastos: R$ ${totalGastos.toFixed(2)}
Total emendas: R$ ${totalEmendas.toFixed(2)}
Votos obtidos: ${dep.votos || "N/A"}
Custo por voto: R$ ${dep.votos ? (totalGastos / dep.votos).toFixed(2) : "N/A"}

Faca uma analise estilo agencia de inteligencia. Identifique gastos atipicos, padroes suspeitos, concentracao em fornecedores.
De um SCORE de 0-100 (0=limpo, 100=muito suspeito) no formato SCORE: XX.
Seja direto, tecnico e apartidario.`;

  const analysis = await callGemini(prompt);

  await db.collection(col).doc(deputadoId).update({
    analise: analysis,
    score: parseInt((analysis.match(/SCORE.*?(\d+)/)||[])[1] || "50"),
    gastos_total: dep.gastos_total || 0,
    emendas_total: dep.emendas_total || 0,
    updated: new Date()
  });

  return { analysis, deputado: dep.nome };
});

// Search politicians
exports.searchPoliticos = onCall({ region: "southamerica-east1" }, async (request) => {
  const { query, uf, partido, cargo } = request.data;
  const collections = ["deputados", "deputados_federais", "senadores", "governadores", "deputados_distritais"];
  let results = [];

  for (const col of collections) {
    let ref = db.collection(col);
    const snap = await ref.get();
    snap.docs.forEach(d => {
      const data = { id: d.id, colecao: col, ...d.data() };
      let match = true;
      if (query && !data.nome.toLowerCase().includes(query.toLowerCase())) match = false;
      if (uf && data.uf !== uf) match = false;
      if (partido && data.partido !== partido) match = false;
      if (cargo && data.cargo !== cargo) match = false;
      if (match) results.push(data);
    });
  }
  return { results: results.slice(0, 100), total: results.length };
});

// Get gastos detail
exports.getGastosDeputado = onCall({ region: "southamerica-east1" }, async (request) => {
  const { deputadoId, colecao } = request.data;
  const col = colecao || "deputados";
  const gastosSnap = await db.collection(col).doc(deputadoId).collection("gastos").get();
  const emendasSnap = await db.collection(col).doc(deputadoId).collection("emendas").get();
  return {
    gastos: gastosSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    emendas: emendasSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };
});

// Stats
exports.getStats = onCall({ region: "southamerica-east1" }, async (request) => {
  const collections = {
    deputados_estaduais: "deputados",
    deputados_federais: "deputados_federais",
    senadores: "senadores",
    governadores: "governadores",
    deputados_distritais: "deputados_distritais"
  };
  const stats = {};
  for (const [key, col] of Object.entries(collections)) {
    const snap = await db.collection(col).get();
    stats[key] = snap.size;
  }
  return stats;
});

// ============================================
// NOVA API REST - TransparenciaBR v2
// ============================================

function calcularSinaisRisco(indicadores) {
  if (!indicadores) return { nivel: "baixo", motivos: [] };
  const motivos = [];
  const ind = indicadores;
  if (ind.variacaoGastoVsMedia > 30) motivos.push("Gastos " + ind.variacaoGastoVsMedia.toFixed(0) + "% acima da media do grupo");
  if (ind.concentracaoTop3Fornecedores > 70) motivos.push("Alta concentracao: top 3 fornecedores = " + ind.concentracaoTop3Fornecedores.toFixed(0) + "% dos gastos");
  if (ind.presenca < 60 && ind.gastoTotal > (ind.gastoMedioGrupo || 0)) motivos.push("Baixa presenca (" + ind.presenca.toFixed(0) + "%) com gasto acima da media");
  if (ind.emendasRisco > 0) motivos.push(ind.emendasRisco + " emendas com padroes atipicos");
  let nivel = "baixo";
  if (motivos.length >= 3) nivel = "alto";
  else if (motivos.length >= 1) nivel = "medio";
  return { nivel, motivos };
}

async function calcularIndicadores(politicoId, col) {
  let gastos = [];
  let emendas = [];
  try { const s = await db.collection(col).doc(politicoId).collection("gastos").get(); gastos = s.docs.map(d => d.data()); } catch(e) {}
  try { const s = await db.collection(col).doc(politicoId).collection("emendas").get(); emendas = s.docs.map(d => d.data()); } catch(e) {}

  const gastoTotal = gastos.reduce((a, g) => a + (g.valorLiquido || g.valor || 0), 0);
  const fornecedores = {};
  gastos.forEach(g => {
    const cnpj = g.cnpjCpf || g.fornecedorCnpj || "desconhecido";
    fornecedores[cnpj] = (fornecedores[cnpj] || 0) + (g.valorLiquido || g.valor || 0);
  });
  const fornVals = Object.values(fornecedores).sort((a, b) => b - a);
  const top3 = fornVals.slice(0, 3).reduce((a, b) => a + b, 0);
  const concentracaoTop3 = gastoTotal > 0 ? (top3 / gastoTotal) * 100 : 0;
  const totalEmendas = emendas.reduce((a, e) => a + (e.valorEmpenhado || e.valor || 0), 0);

  return {
    gastoTotal,
    totalEmendas,
    numGastos: gastos.length,
    numEmendas: emendas.length,
    numFornecedores: Object.keys(fornecedores).length,
    concentracaoTop3Fornecedores: concentracaoTop3,
    variacaoGastoVsMedia: 0,
    presenca: 0,
    gastoMedioGrupo: 0,
    emendasRisco: 0
  };
}

// Ranking nacional - retorna politicos ordenados por score
exports.getRanking = onCall({ region: "southamerica-east1" }, async (request) => {
  const { uf, cargo, partido, limite } = request.data || {};
  const collections = ["deputados", "deputados_federais", "senadores", "governadores", "deputados_distritais"];
  let all = [];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    snap.docs.forEach(d => {
      const data = { id: d.id, colecao: col, ...d.data() };
      let match = true;
      if (uf && data.uf !== uf) match = false;
      if (partido && data.partido !== partido) match = false;
      if (cargo && data.cargo !== cargo) match = false;
      if (match) all.push(data);
    });
  }
  all.sort((a, b) => (b.score || 0) - (a.score || 0));
  all = all.map((p, i) => ({ ...p, ranking: i + 1 }));
  return { ranking: all.slice(0, limite || 100), total: all.length };
});

// Sinais de risco de um politico
exports.getSinaisRisco = onCall({ region: "southamerica-east1" }, async (request) => {
  const { politicoId, colecao } = request.data;
  const col = colecao || "deputados_federais";
  const docSnap = await db.collection(col).doc(politicoId).get();
  if (!docSnap.exists) throw new Error("Politico nao encontrado");
  const pol = docSnap.data();
  const indicadores = await calcularIndicadores(politicoId, col);
  const sinais = calcularSinaisRisco(indicadores);
  return { politico: { id: politicoId, nome: pol.nome, partido: pol.partido, uf: pol.uf }, indicadores, sinais };
});

// Criar denuncia
exports.criarDenuncia = onCall({ region: "southamerica-east1" }, async (request) => {
  const { politicoId, colecao, tipoDenuncia, resumo, despesaIds, emendaIds } = request.data;
  const col = colecao || "deputados_federais";
  let politicoData = null;
  if (politicoId) {
    const pSnap = await db.collection(col).doc(politicoId).get();
    if (pSnap.exists) politicoData = { id: politicoId, ...pSnap.data() };
  }
  const indicadores = politicoId ? await calcularIndicadores(politicoId, col) : null;
  const sinais = indicadores ? calcularSinaisRisco(indicadores) : null;

  const docRef = db.collection("denuncias").doc();
  const denuncia = {
    id: docRef.id,
    politicoId: politicoId || null,
    colecao: col,
    politicoNome: politicoData ? politicoData.nome : null,
    tipoDenuncia: tipoDenuncia || "outro",
    resumo: resumo || "",
    despesaIds: despesaIds || [],
    emendaIds: emendaIds || [],
    indicadores,
    sinais,
    status: "pronto",
    destinatarios: ["MPF", "TCU", "CGU"],
    criadoEm: admin.firestore.FieldValue.serverTimestamp(),
    criadoPor: request.auth?.uid || "anonimo"
  };
  await docRef.set(denuncia);
  return denuncia;
});

// Gerar dossie completo com IA
exports.gerarDossie = onCall({ region: "southamerica-east1", timeoutSeconds: 120, secrets: [geminiKey] }, async (request) => {
  const { politicoId, colecao } = request.data;
  const col = colecao || "deputados_federais";
  const pSnap = await db.collection(col).doc(politicoId).get();
  if (!pSnap.exists) throw new Error("Politico nao encontrado");
  const pol = pSnap.data();
  const indicadores = await calcularIndicadores(politicoId, col);
  const sinais = calcularSinaisRisco(indicadores);

  const prompt = `Gere um dossie tecnico e apartidario sobre o politico ${pol.nome} (${pol.partido}-${pol.uf}).
Dados:
- Gastos totais: R$ ${indicadores.gastoTotal.toFixed(2)}
- Num fornecedores: ${indicadores.numFornecedores}
- Concentracao top 3 fornecedores: ${indicadores.concentracaoTop3Fornecedores.toFixed(1)}%
- Total emendas: R$ ${indicadores.totalEmendas.toFixed(2)}
- Sinais de risco: ${sinais.motivos.join("; ") || "Nenhum"}
- Nivel de risco: ${sinais.nivel}

Formate como relatorio para orgaos de controle (MP, TCU, CGU).
Inclua: resumo executivo, detalhamento de riscos, recomendacoes.
Seja tecnico, imparcial, baseado apenas nos dados.`;

  const dossie = await callGemini(prompt);
  return { politico: pol.nome, dossie, indicadores, sinais };
});

// ============================================
// INGESTAO AUTOMATICA - API da Camara
// ============================================

async function fetchJSON(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { accept: "application/json" } }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// Ingestao manual via callable
exports.ingestCamara = onCall({ region: "southamerica-east1", timeoutSeconds: 540 }, async (request) => {
  const { uf, ano } = request.data || {};
  const targetUf = uf || "PA";
  const targetAno = ano || new Date().getFullYear();
  const log = [];

  // 1. Buscar deputados
  let url = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&ordem=ASC&ordenarPor=nome";
  if (targetUf !== "TODOS") url += "&siglaUf=" + targetUf;
  const depRes = await fetchJSON(url);
  const deputados = depRes.dados || [];
  log.push("Encontrados " + deputados.length + " deputados de " + targetUf);

  for (const dep of deputados) {
    const docId = String(dep.id);
    const docData = {
      nome: dep.nome,
      partido: dep.siglaPartido,
      uf: dep.siglaUf,
      cargo: "Deputado Federal",
      fotoUrl: dep.urlFoto,
      idCamara: dep.id,
      email: dep.email || "",
      legislatura: dep.idLegislatura,
      updated: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection("deputados_federais").doc(docId).set(docData, { merge: true });

    // 2. Buscar despesas
    let pagina = 1;
    let totalDespesas = 0;
    while (pagina <= 10) {
      const gUrl = "https://dadosabertos.camara.leg.br/api/v2/deputados/" + dep.id + "/despesas?ano=" + targetAno + "&itens=100&pagina=" + pagina + "&ordem=DESC&ordenarPor=dataDocumento";
      let gRes;
      try { gRes = await fetchJSON(gUrl); } catch(e) { break; }
      const despesas = gRes.dados || [];
      if (despesas.length === 0) break;

      const batch = db.batch();
      for (const d of despesas) {
        const gId = d.codDocumento ? String(d.codDocumento) : db.collection("_").doc().id;
        const ref = db.collection("deputados_federais").doc(docId).collection("gastos").doc(gId);
        batch.set(ref, {
          tipoDespesa: d.tipoDespesa,
          dataDocumento: d.dataDocumento,
          valor: d.valorDocumento || 0,
          valorLiquido: d.valorLiquido || 0,
          fornecedorNome: d.nomeFornecedor || "",
          cnpjCpf: d.cnpjCpfFornecedor || "",
          numDocumento: d.numDocumento || "",
          urlDocumento: d.urlDocumento || "",
          mes: d.mes,
          ano: d.ano
        }, { merge: true });
        totalDespesas++;
      }
      await batch.commit();
      if (despesas.length < 100) break;
      pagina++;
    }
    log.push(dep.nome + ": " + totalDespesas + " despesas");

    // Pequena pausa para nao sobrecarregar API
    await new Promise(r => setTimeout(r, 200));
  }

  log.push("Ingestao concluida!");
  return { log, total: deputados.length };
});

// Ingestao agendada - roda todo dia
exports.scheduledIngest = onSchedule({ schedule: "every 24 hours", region: "southamerica-east1", timeoutSeconds: 540 }, async (event) => {
  const ufs = ["PA"];
  const ano = new Date().getFullYear();
  for (const uf of ufs) {
    let url = "https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&ordem=ASC&ordenarPor=nome&siglaUf=" + uf;
    const depRes = await fetchJSON(url);
    const deputados = depRes.dados || [];
    for (const dep of deputados) {
      const docId = String(dep.id);
      await db.collection("deputados_federais").doc(docId).set({
        nome: dep.nome, partido: dep.siglaPartido, uf: dep.siglaUf,
        cargo: "Deputado Federal", fotoUrl: dep.urlFoto, idCamara: dep.id,
        updated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      let pagina = 1;
      while (pagina <= 5) {
        const gUrl = "https://dadosabertos.camara.leg.br/api/v2/deputados/" + dep.id + "/despesas?ano=" + ano + "&itens=100&pagina=" + pagina;
        let gRes;
        try { gRes = await fetchJSON(gUrl); } catch(e) { break; }
        const despesas = gRes.dados || [];
        if (despesas.length === 0) break;
        const batch = db.batch();
        for (const d of despesas) {
          const gId = d.codDocumento ? String(d.codDocumento) : db.collection("_").doc().id;
          const ref = db.collection("deputados_federais").doc(docId).collection("gastos").doc(gId);
          batch.set(ref, {
            tipoDespesa: d.tipoDespesa, dataDocumento: d.dataDocumento,
            valor: d.valorDocumento || 0, valorLiquido: d.valorLiquido || 0,
            fornecedorNome: d.nomeFornecedor || "", cnpjCpf: d.cnpjCpfFornecedor || "",
            mes: d.mes, ano: d.ano
          }, { merge: true });
        }
        await batch.commit();
        if (despesas.length < 100) break;
        pagina++;
      }
      await new Promise(r => setTimeout(r, 200));
    }
  }
});
