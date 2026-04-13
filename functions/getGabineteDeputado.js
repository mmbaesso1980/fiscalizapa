/**
 * Lista pessoal de gabinete a partir da página HTML pública da Câmara.
 * Cache em gabinete_cache/{idCamara}_{ano} (escrita só Admin/CF).
 */
'use strict';

const cheerio = require('cheerio');

function registerGetGabineteDeputado(deps) {
  const { onCall, HttpsError, admin, OPTS } = deps;
  const db = admin.firestore();

  const getGabineteDeputado = onCall(OPTS, async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');

    const idCamara = Number(req.data?.idCamara);
    if (!Number.isFinite(idCamara) || idCamara < 1) {
      throw new HttpsError('invalid-argument', 'idCamara inválido.');
    }
    const ano = Number(req.data?.ano) || new Date().getFullYear();
    const cacheId = `${idCamara}_${ano}`;
    const cacheRef = db.collection('gabinete_cache').doc(cacheId);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      const cached = cacheSnap.data();
      const ts = cached.fetchedAt?.toMillis?.() ?? 0;
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) {
        return { pessoal: cached.pessoal || [], fromCache: true, ano };
      }
    }

    const url = `https://www.camara.leg.br/deputados/${idCamara}/pessoal-gabinete?ano=${ano}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 18000);
    let res;
    try {
      res = await fetch(url, {
        signal: ac.signal,
        headers: {
          Accept: 'text/html',
          'User-Agent': 'TransparenciaBR-Ingest/1.0 (dados públicos; contato via site)',
        },
      });
    } catch (e) {
      clearTimeout(t);
      throw new HttpsError('unavailable', `Falha ao buscar página da Câmara: ${e.message}`);
    }
    clearTimeout(t);
    if (!res.ok) {
      throw new HttpsError('unavailable', `Câmara retornou HTTP ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const pessoal = [];

    $('table tbody tr').each((_, el) => {
      const cols = $(el).find('td');
      if (cols.length < 2) return;
      const nome = $(cols[0]).text().trim();
      if (!nome || nome.length < 3 || /^nome$/i.test(nome)) return;
      let grupoFuncional = '';
      let cargo = '';
      let periodo = '';
      if (cols.length >= 5) {
        grupoFuncional = $(cols[1]).text().trim();
        cargo = $(cols[2]).text().trim();
        periodo = $(cols[3]).text().trim();
      } else if (cols.length >= 4) {
        cargo = $(cols[1]).text().trim();
        periodo = $(cols[2]).text().trim();
      } else {
        cargo = $(cols[1]).text().trim();
      }
      pessoal.push({ nome, grupoFuncional, cargo, periodo });
    });

    await cacheRef.set({
      pessoal,
      idCamara,
      ano,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { pessoal, fromCache: false, ano };
  });

  return { getGabineteDeputado };
}

module.exports = { registerGetGabineteDeputado };
