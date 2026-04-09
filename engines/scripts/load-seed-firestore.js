/**
 * ASMODEUS — Carga do Seed via Browser Console
 * ==============================================
 * Cole este script inteiro no Console do Firebase Emulator
 * ou no Console do navegador em transparenciabr.com.br
 * (onde o Firebase já está inicializado)
 *
 * Alternativa: rodar via Node com firebase-admin (ver README-ingestao.md)
 */

const SEED_URL = 'https://raw.githubusercontent.com/mmbaesso1980/fiscalizapa/main/engines/scripts/ranking-seed-2025.json';

async function loadSeedToFirestore() {
  const { getFirestore, collection, doc, setDoc, writeBatch } = await import('https://www.gstatic.com/firebasejs/10.x.x/firebase-firestore.js')
    .catch(() => ({ 
      getFirestore: () => window.db || window.firebase?.firestore?.(),
      collection: (db, col) => db.collection(col),
      doc: (col, id) => col.doc(id),
      setDoc: (ref, data) => ref.set(data),
      writeBatch: (db) => db.batch(),
    }));

  // Busca o seed do GitHub
  const res  = await fetch(SEED_URL);
  const seed = await res.json();
  console.log(`✅ ${seed.length} registros carregados do seed`);

  // Usa o db global já inicializado na página
  const firestore = window.db || getFirestore();
  const colRef    = firestore.collection ? firestore.collection('ranking_externo') : collection(firestore, 'ranking_externo');

  let batch    = firestore.batch ? firestore.batch() : writeBatch(firestore);
  let count    = 0;

  for (const p of seed) {
    const docId = p.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').toUpperCase().substring(0, 60);
    const ref   = colRef.doc ? colRef.doc(docId) : doc(colRef, docId);
    batch.set(ref, { ...p, atualizado_em: new Date().toISOString() });
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = firestore.batch ? firestore.batch() : writeBatch(firestore);
      console.log(`   ✔ ${count} gravados...`);
    }
  }
  await batch.commit();
  console.log(`🔥 Seed completo! ${count} docs em ranking_externo`);
}

loadSeedToFirestore().catch(console.error);
