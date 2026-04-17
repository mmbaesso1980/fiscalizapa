const fs = require('fs');
const readline = require('readline');

// LGPD Masking Function
function maskCpf(cpf) {
  if (!cpf) return cpf;
  // Assumes string could be only digits or formatted
  const digits = cpf.replace(/\D/g, '');
  if (digits.length === 11) {
    return `***.${digits.substring(3, 6)}.${digits.substring(6, 9)}-**`;
  }
  return cpf; // Return as is if not a valid CPF length
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Uppercase and remove special weird characters (keeping basic punctuation and accents)
  return str.toUpperCase().replace(/[^\w\sÀ-ÿ.,-]/g, '').trim();
}

function processLine(line) {
  try {
    const record = JSON.parse(line);

    // Sanitize string fields
    for (const key of Object.keys(record)) {
      if (typeof record[key] === 'string') {
        record[key] = sanitizeString(record[key]);
      }
    }

    // Mask sensitive data
    if (record.cpf_beneficiario) {
      record.cpf_beneficiario = maskCpf(record.cpf_beneficiario);
    }

    return record;
  } catch (err) {
    console.error('Error parsing line:', err.message);
    return null;
  }
}

// Ensure the module can be executed or imported
module.exports = { maskCpf, sanitizeString, processLine };

const { BigQuery } = require('@google-cloud/bigquery');

const DATASET_ID = 'dados_legados';
const TABLE_ID = 'transacoes';

const schema = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'data_transacao', type: 'DATE', mode: 'REQUIRED' },
  { name: 'cnpj_empresa', type: 'STRING', mode: 'NULLABLE' },
  { name: 'codigo_parlamentar', type: 'STRING', mode: 'NULLABLE' },
  { name: 'cpf_beneficiario', type: 'STRING', mode: 'NULLABLE' },
  { name: 'nome_beneficiario', type: 'STRING', mode: 'NULLABLE' },
  { name: 'valor', type: 'FLOAT', mode: 'NULLABLE' }
];

async function configureBigQuerySchema(bigquery) {
  const dataset = bigquery.dataset(DATASET_ID);

  // Ensure dataset exists
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    console.log(`Creating dataset ${DATASET_ID}...`);
    await dataset.create({ location: 'US' });
  }

  const table = dataset.table(TABLE_ID);
  const [tableExists] = await table.exists();

  const options = {
    schema,
    timePartitioning: {
      type: 'DAY',
      field: 'data_transacao',
    },
    clustering: {
      fields: ['cnpj_empresa', 'codigo_parlamentar'],
    },
  };

  if (!tableExists) {
    console.log(`Creating table ${TABLE_ID}...`);
    await dataset.createTable(TABLE_ID, options);
    console.log(`Table ${TABLE_ID} created with partitioning and clustering.`);
  } else {
    console.log(`Table ${TABLE_ID} already exists. Updating metadata...`);
    // Note: updating partitioning/clustering on existing tables might have restrictions,
    // but we can update schema/metadata. For now, setting metadata.
    await table.setMetadata(options);
    console.log(`Table ${TABLE_ID} metadata updated.`);
  }

  return table;
}

module.exports.configureBigQuerySchema = configureBigQuerySchema;

async function runPipeline(filePath, projectId) {
  const bigquery = new BigQuery({ projectId });
  const table = await configureBigQuerySchema(bigquery);

  console.log(`Starting ETL pipeline for file: ${filePath}`);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const BATCH_SIZE = 1000;
  let batch = [];
  let totalProcessed = 0;
  let totalInserted = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const record = processLine(line);
    if (record) {
      batch.push(record);
      totalProcessed++;
    }

    if (batch.length >= BATCH_SIZE) {
      // Pause reading to prevent memory buildup
      const currentBatch = [...batch];
      batch = [];

      try {
        await table.insert(currentBatch);
        totalInserted += currentBatch.length;
        console.log(`Inserted ${totalInserted} records so far...`);
      } catch (insertError) {
        console.error('Error inserting batch:', insertError.name);
        if (insertError.errors) {
            console.error(JSON.stringify(insertError.errors, null, 2));
        }
      }
    }
  }

  // Insert remaining records
  if (batch.length > 0) {
    try {
      await table.insert(batch);
      totalInserted += batch.length;
      console.log(`Inserted final batch. Total inserted: ${totalInserted}`);
    } catch (insertError) {
      console.error('Error inserting final batch:', insertError.name);
      if (insertError.errors) {
          console.error(JSON.stringify(insertError.errors, null, 2));
      }
    }
  }

  console.log(`ETL pipeline completed. Processed: ${totalProcessed}, Inserted: ${totalInserted}`);
}

// Execute if run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const filePath = args[0];
  const projectId = args[1] || 'projeto-codex-br';

  if (!filePath) {
    console.error('Usage: node masterPipeline.js <path_to_jsonl_file> [project_id]');
    process.exit(1);
  }

  runPipeline(filePath, projectId).catch(console.error);
}

module.exports.runPipeline = runPipeline;
