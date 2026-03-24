/**
 * alertaService.js
 * Bloco 7 - Servico de Alertas e Notificacoes
 * Gera alertas semanais sobre atividade parlamentar.
 * Salva em Firestore collection 'alertas' e notifica usuarios seguindo deputados.
 */
const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Gera resumo semanal de alertas para todos os deputados monitorados
 */
async function gerarAlertasSemanal() {
  const agora = new Date();
  const semanaAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
  console.log(`Gerando alertas semanais: ${semanaAtras.toISOString()} a ${agora.toISOString()}`);

  const polSnap = await db.collection("politicos").get();
  let totalAlertas = 0;

  for (const doc of polSnap.docs) {
    const pol = doc.data();
    if (!pol.nome) continue;
    const alertas = [];

    // 1. Novos gastos elevados
    try {
      const gastosSnap = await doc.ref.collection("gastos")
        .where("dataDocumento", ">=", semanaAtras.toISOString().slice(0, 10))
        .limit(50).get();
      const totalNovosGastos = gastosSnap.docs.reduce((s, g) => {
        const v = g.data().valorLiquido || g.data().valor || 0;
        return s + v;
      }, 0);
      if (totalNovosGastos > 50000) {
        alertas.push({
          tipo: 'GASTO_ELEVADO',
          msg: `${pol.nome} gastou R$ ${(totalNovosGastos/1000).toFixed(0)}k esta semana na CEAP.`,
          valor: totalNovosGastos,
          severidade: totalNovosGastos > 200000 ? 'ALTA' : 'MEDIA'
        });
      }
    } catch (e) { /* gastos sem indice de data */ }

    // 2. Emendas com baixa execucao
    try {
      const emendasSnap = await doc.ref.collection("emendas")
        .where("criticidade", "==", "ALTA").limit(10).get();
      if (emendasSnap.size > 0) {
        alertas.push({
          tipo: 'EMENDA_CRITICA',
          msg: `${pol.nome} tem ${emendasSnap.size} emendas com criticidade ALTA (baixa execucao, show em regiao carente, etc).`,
          count: emendasSnap.size,
          severidade: 'ALTA'
        });
      }
    } catch (e) {}

    // 3. Ausencia detectada
    if (pol.presenca != null && pol.presenca < 60) {
      alertas.push({
        tipo: 'BAIXA_PRESENCA',
        msg: `${pol.nome} tem presenca de apenas ${pol.presenca}% nas votacoes.`,
        valor: pol.presenca,
        severidade: pol.presenca < 40 ? 'ALTA' : 'MEDIA'
      });
    }

    // 4. Score baixo
    if (pol.scoreFinalTransparenciaBR != null && pol.scoreFinalTransparenciaBR < 3) {
      alertas.push({
        tipo: 'SCORE_BAIXO',
        msg: `${pol.nome} tem score TransparenciaBR de ${pol.scoreFinalTransparenciaBR.toFixed(1)} (Classe ${pol.classificacaoTransparenciaBR}).`,
        valor: pol.scoreFinalTransparenciaBR,
        severidade: 'ALTA'
      });
    }

    if (alertas.length === 0) continue;

    // Salvar alerta semanal
    const alertaId = `${doc.id}-${agora.toISOString().slice(0, 10)}`;
    await db.collection("alertas").doc(alertaId).set({
      politicoId: doc.id,
      politicoNome: pol.nome,
      partido: pol.partido || pol.siglaPartido,
      uf: pol.uf || pol.siglaUf,
      alertas,
      totalAlertas: alertas.length,
      severidadeMax: alertas.some(a => a.severidade === 'ALTA') ? 'ALTA' : 'MEDIA',
      semana: agora.toISOString().slice(0, 10),
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    totalAlertas += alertas.length;

    // Notificar usuarios que seguem este deputado
    try {
      const seguidoresSnap = await db.collection("user_follows")
        .where("politicoId", "==", doc.id).get();
      for (const seg of seguidoresSnap.docs) {
        const userId = seg.data().userId;
        await db.collection("users").doc(userId).collection("notifications").add({
          tipo: 'ALERTA_SEMANAL',
          politicoId: doc.id,
          politicoNome: pol.nome,
          resumo: `${alertas.length} alerta(s) para ${pol.nome}`,
          alertas: alertas.slice(0, 3),
          lido: false,
          criadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (e) { /* user_follows pode nao existir ainda */ }
  }

  console.log(`Alertas gerados: ${totalAlertas}`);
  return { totalAlertas };
}

/**
 * Verifica novos gastos nas ultimas 24h e gera alertas instantaneos
 */
async function verificarNovosGastos() {
  const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  console.log(`Verificando gastos desde ${ontem}`);

  const polSnap = await db.collection("politicos").get();
  let alertCount = 0;

  for (const doc of polSnap.docs) {
    const pol = doc.data();
    if (!pol.nome) continue;

    try {
      const gastosSnap = await doc.ref.collection("gastos")
        .where("dataDocumento", ">=", ontem).limit(20).get();

      for (const gDoc of gastosSnap.docs) {
        const g = gDoc.data();
        const val = g.valorLiquido || g.valor || 0;
        if (val > 100000) {
          await db.collection("alertas_instantaneos").add({
            politicoId: doc.id,
            politicoNome: pol.nome,
            tipo: 'GASTO_INSTANTANEO',
            msg: `${pol.nome}: gasto de R$ ${(val/1000).toFixed(0)}k em ${g.tipoDespesa || g.tipo || 'N/A'}`,
            valor: val,
            fornecedor: g.fornecedorNome || g.fornecedor || '',
            data: g.dataDocumento,
            severidade: val > 500000 ? 'ALTA' : 'MEDIA',
            criadoEm: admin.firestore.FieldValue.serverTimestamp()
          });
          alertCount++;
        }
      }
    } catch (e) {}
  }

  console.log(`Alertas instantaneos: ${alertCount}`);
  return { alertCount };
}

module.exports = { gerarAlertasSemanal, verificarNovosGastos };
