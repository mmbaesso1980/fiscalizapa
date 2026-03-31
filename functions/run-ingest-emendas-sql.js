/**
 * run-ingest-emendas-sql.js
 * Novo Motor v5 - Bulk Insert no PostgreSQL
 */
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { Pool } = require('pg');

if (!admin.apps.length) {
  admin.initializeApp({ projectId: "fiscallizapa" });
}
const db = admin.firestore();

// Conexão com o Cloud SQL
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 5432,
});

const API_KEY = process.env.PORTAL_API_KEY || "717a95e01b072090f41940282eab700a";
const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const BATCH_SIZE = 2000;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchEmendasCGU(autor, ano) {
  const url = `${BASE}/emendas?ano=${ano}&autor=${encodeURIComponent(autor)}&pagina=1`;
  try {
    const res = await fetch(url, { headers: { "chave-api-dados": API_KEY, "Accept": "application/json" } });
    if (res.status === 429) { await sleep(10000); return fetchEmendasCGU(autor, ano); }
    if (!res.ok) return [];
    return await res.json();
  } catch (e) {
    return [];
  }
}

async function insertBatch(lote) {
  if (lote.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let queryText = 'INSERT INTO emendas (codigo, deputado_id, ano, localidade, uf_destino, valor_empenhado, valor_pago, funcao, taxa_execucao) VALUES ';
    let values = [];
    let paramsIndex = 1;

    for (let i = 0; i < lote.length; i++) {
      queryText += `($${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++}, $${paramsIndex++})`;
      if (i < lote.length - 1) queryText += ', ';
      values.push(...lote[i]);
    }

    queryText += ' ON CONFLICT (codigo) DO UPDATE SET valor_empenhado = EXCLUDED.valor_empenhado, valor_pago = EXCLUDED.valor_pago, taxa_execucao = EXCLUDED.taxa_execucao;';
    
    await client.query(queryText, values);
    await client.query('COMMIT');
    console.log(`✅ Lote de ${lote.length} emendas inserido/atualizado no SQL com sucesso.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Erro no Bulk Insert:", error.message);
  } finally {
    client.release();
  }
}

async function main() {
  console.log("🚀 Iniciando Ingestão de Emendas para PostgreSQL...");
  
  // 1. Puxar lista de deputados do Firestore
  const snap = await db.collection("deputados_federais").get();
  const deputados = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Encontrados ${deputados.length} deputados.`);

  let loteAtual = [];
  let totalProcessado = 0;

  for (const dep of deputados) {
    console.log(`Buscando emendas para: ${dep.nome}`);
    
    // Busca anos 2023, 2024 e 2025
    for (const ano of [2023, 2024, 2025]) {
      const nomeLimpo = dep.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      const emendasCGU = await fetchEmendasCGU(nomeLimpo, ano);
      
      for (const e of emendasCGU) {
        const taxa = (e.valorPago && e.valorEmpenhado) ? Math.min(100, (e.valorPago / e.valorEmpenhado) * 100) : 0;
        
        loteAtual.push([
          e.codigoEmenda || `EM-${dep.id}-${Math.random().toString(36).substr(2,5)}`, // codigo
          Number(dep.id), // deputado_id
          ano, // ano
          e.localidadeDoGasto || 'N/A', // localidade
          e.uf || 'BR', // uf_destino
          e.valorEmpenhado ? parseFloat(e.valorEmpenhado.replace(',','.')) : 0, // valor_empenhado
          e.valorPago ? parseFloat(e.valorPago.replace(',','.')) : 0, // valor_pago
          e.nomeFuncao || 'N/A', // funcao
          Math.round(taxa) // taxa_execucao
        ]);

        if (loteAtual.length >= BATCH_SIZE) {
          await insertBatch(loteAtual);
          loteAtual = [];
        }
      }
      await sleep(300); // Evitar rate limit da CGU
    }
    totalProcessado++;
  }

  if (loteAtual.length > 0) {
    await insertBatch(loteAtual);
  }

  console.log(`🎉 Processo concluído. Emendas processadas para ${totalProcessado} deputados.`);
  process.exit(0);
}

main();
