import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export default function DossieGroundedPage() {
  const { nome } = useParams();
  const [dossie, setDossie] = useState(null);
  const [erro, setErro] = useState(null);

  const URL_V3 = import.meta.env.VITE_VERTEX_DOSSIE_GROUNDED_URL;

  useEffect(() => {
    if (!URL_V3) {
      return;
    }
    fetch(`${URL_V3}?q=${encodeURIComponent(nome)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(setDossie)
      .catch((e) => setErro(`Falha na API Vertex RAG: ${e}`));
  }, [nome, URL_V3]);

  if (!URL_V3) return <div className="p-6 text-red-500">Aviso: RAG Grounded Dossier não configurado (variável VITE_VERTEX_DOSSIE_GROUNDED_URL em falta).</div>;
  if (erro) return <div className="p-6 text-red-500">Erro: {erro}</div>;
  if (!dossie) return <div className="p-6">Carregando dossiê factual...</div>;

  return (
    <article className="max-w-4xl mx-auto p-6 prose prose-invert">
      <h1>Dossiê factual: {dossie.query}</h1>
      <p className="text-xs text-slate-500">
        Gerado em {dossie.elapsed_ms}ms · modelo {dossie.modelo}
      </p>
      <ReactMarkdown>{dossie.dossie_factual}</ReactMarkdown>
    </article>
  );
}