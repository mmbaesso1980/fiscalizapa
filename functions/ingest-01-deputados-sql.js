// functions/ingest-01-deputados-sql.js
const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASS, database: process.env.DB_NAME, port: 5432,
});

async function run() {
  console.log("Iniciando ingestão ZERO de deputados direto pro PostgreSQL...");
  const resp = await fetch("https://dadosabertos.camara.leg.br/api/v2/deputados?itens=1000");
  const data = await resp.json();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const dep of data.dados) {
      const query = `
        INSERT INTO deputados (id_camara, nome_urna, sigla_partido, sigla_uf, id_legislatura, url_foto, email)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id_camara) DO UPDATE SET sigla_partido = EXCLUDED.sigla_partido;
      `;
      const values = [dep.id, dep.nome, dep.siglaPartido, dep.siglaUf, dep.idLegislatura, dep.urlFoto, dep.email];
      await client.query(query, values);
    }
    await client.query('COMMIT');
    console.log(`✅ Sucesso! ${data.dados.length} deputados salvos.`);
  } catch (e) {
    await client.query('ROLLBACK'); console.error("❌ Erro:", e);
  } finally {
    client.release(); pool.end();
  }
}
run();
