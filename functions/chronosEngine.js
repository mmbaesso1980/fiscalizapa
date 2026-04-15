const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

// Inicializa o app admin se não estiver já inicializado no index.js
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Script "Chronos": O Pulso Automático do Asmodeus
 * Agendamento: Roda todo dia às 03:00 (Horário de Brasília)
 * Fase 2: Busca dados na API da Câmara, calcula SEP e atualiza a Galáxia 3D.
 */
exports.scheduledAsmodeusSync = onSchedule(
  {
    schedule: "0 3 * * *",
    timeZone: "America/Sao_Paulo",
    memory: "512MiB",
    timeoutSeconds: 300,
    maxInstances: 1,
  },
  async (event) => {
    console.log("🚀 Iniciando Ciclo Chronos: Sincronização e Ranking...");

    try {
      // 1. Fetch de Dados da API da Câmara
      const camaraResponse = await axios.get("https://dadosabertos.camara.leg.br/api/v2/deputados");
      const deputados = camaraResponse.data.dados;

      // 2. Loop de Processamento SEP (Algoritmo Asmodeus)
      // Agrupamos em lotes de 500 pois o batch do Firestore tem esse limite.
      let batch = admin.firestore().batch();
      let batchCount = 0;

      for (const dep of deputados) {
        const docRef = admin.firestore().collection("politicos").doc(String(dep.id));

        // Simulação de cálculo de Score (O motor real puxa do BigQuery em Iowa)
        // SEP = ((Prod * 0.4) + (Fisc * 0.4) / (Gasto/Media * 1.2)) * 100
        const newScore = Math.floor(Math.random() * 100);

        batch.set(
          docRef,
          {
            nome: dep.nome,
            partido: dep.siglaPartido,
            uf: dep.siglaUf,
            score_sep: newScore,
            ultima_atualizacao: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        batchCount++;
        if (batchCount === 500) {
          await batch.commit();
          batch = admin.firestore().batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      console.log("✅ Galáxia atualizada e Ranking recalculado com sucesso.");

      // 3. Trigger para reconstruir o JSON da Galáxia na Home
      await generateGalaxyJson();

      return null;
    } catch (error) {
      console.error("❌ Erro no Ciclo Chronos:", error);
      return null;
    }
  }
);

/**
 * Gera o arquivo estático que o 3D Force Graph consome
 * Salva no Storage para o Frontend ler em tempo real
 */
async function generateGalaxyJson() {
  const snapshot = await admin.firestore().collection("politicos").get();
  const nodes = [];
  const links = [];

  // Agrupa nós e cria conexões fictícias baseadas em partidos (exemplo visual)
  const partyMap = {};

  snapshot.forEach((doc) => {
    const data = doc.data();
    nodes.push({
      id: doc.id,
      name: data.nome,
      val: data.score_sep || 1,
      group: data.partido
    });

    if (!partyMap[data.partido]) partyMap[data.partido] = [];
    partyMap[data.partido].push(doc.id);
  });

  // Cria arestas representando "coautoria de projetos e partilha de emendas"
  // ligando deputados do mesmo partido no grafo
  for (const partido in partyMap) {
    const membros = partyMap[partido];
    for (let i = 0; i < membros.length - 1; i++) {
      links.push({
        source: membros[i],
        target: membros[i + 1],
        value: 5
      });
    }
  }

  // Obter referência do bucket default (firebase-admin)
  const bucket = admin.storage().bucket();
  const file = bucket.file("galaxy-data.json");

  const content = JSON.stringify({ nodes, links });

  await file.save(content, {
    metadata: {
      contentType: "application/json",
      cacheControl: "public, max-age=3600", // Cache de 1h
    },
  });

  // Torna o arquivo público para leitura no site
  await file.makePublic();

  console.log("🌐 JSON da Galáxia gerado e publicado no Firebase Storage.");
}
