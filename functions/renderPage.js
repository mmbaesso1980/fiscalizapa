const { onRequest } = require('firebase-functions/v2/https');
const fs = require('fs');
const path = require('path');

exports.renderPage = onRequest({ region: 'us-central1' }, async (req, res) => {
  try {
    let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>TransparênciaBR</title><link rel="stylesheet" href="/assets/index.css"></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>`;

    // Tenta ler o index.html embutido durante o build localmente
    const indexPath = path.resolve(__dirname, 'index.html');
    if (fs.existsSync(indexPath)) {
      html = fs.readFileSync(indexPath, 'utf-8');
    }

    // Lógica básica de injeção baseada no path
    const routePath = req.path;
    let title = 'TransparênciaBR - O Universo Político Brasileiro';
    let description = 'Sistema de fiscalização e monitoramento de políticas públicas.';

    if (routePath.startsWith('/dossie/')) {
       title = 'Dossiê do Parlamentar - TransparênciaBR';
       description = 'Consulte os gastos, presenças e a evolução patrimonial detalhada do parlamentar.';
    } else if (routePath.startsWith('/mapa')) {
       title = 'Mapa de Emendas Coroplético - TransparênciaBR';
    }

    html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);

    // Inserção simples de metas OG antes do fechamento de head
    const ogTags = `
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
    `;
    html = html.replace('</head>', `${ogTags}</head>`);

    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
  } catch(error) {
    console.error('Erro na renderização dinâmica:', error);
    res.status(500).send('Erro interno do servidor');
  }
});
