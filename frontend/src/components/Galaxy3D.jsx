import React, { useRef, useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';
import ForensicPanel from './ForensicPanel';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export default function Galaxy3D() {
  const fgRef = useRef();
  const navigate = useNavigate();
  const [data, setData] = useState({ nodes: [], links: [] });
  const [statusMsg, setStatusMsg] = useState('Buscando telemetria forense...');
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);

  // Exemplo de estado Premium vindo do contexto de auth
  const isPremium = false;

  useEffect(() => {
    async function hydrateGraph() {
      try {
        const getPublicForensicData = httpsCallable(functions, 'getPublicForensicData');
        const result = await getPublicForensicData({});
        const payload = result.data || {};

        if (payload.status === 'processing' || payload.nodes?.length === 0) {
          setStatusMsg('Dados em processamento pela Cloud (ETL pipeline).');
          setData({ nodes: [], links: [] });
        } else if (payload.status === 'error') {
          setStatusMsg('Ocorreu um erro ao recuperar o radar.');
        } else {
          setData({ nodes: payload.nodes || [], links: payload.links || [] });
          setStatusMsg(''); // Remove texto ao carregar
        }
      } catch (error) {
         console.error('Erro na conexão do Radar:', error);
         setStatusMsg('Erro de conectividade com o Backend (us-central1).');
      } finally {
         setLoading(false);
      }
    }

    hydrateGraph();
  }, []);

  const handleNodeClick = (node) => {
    if (node && node.id) {
       // Em vez de navegar de imediato, abre o ForensicPanel
       setSelectedNode(node);
    }
  };

  return (
    <div className="w-full h-full bg-slate-900 relative overflow-hidden">
      <div className="absolute top-4 left-4 z-10 text-white bg-slate-800/80 p-4 rounded shadow">
        <h3 className="font-cabinet font-bold text-lg">Asmodeus v2.0 - Radar</h3>

        {loading || statusMsg ? (
           <div className="mt-2 text-sm font-satoshi text-amber-300 font-bold border border-amber-500/50 bg-amber-500/10 p-2 rounded">
              {statusMsg}
           </div>
        ) : (
           <p className="text-sm font-satoshi text-slate-300 max-w-xs mt-2">
             Radar operante. Linhas vermelhas indicarão Triangulação de Culpa (processos judiciais associados a emendas).
           </p>
        )}
      </div>
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeId="id"
        nodeLabel="name"
        nodeAutoColorBy="id"
        nodeVal={(node) => Math.sqrt(node.value || 0) / 100} // Tamanho baseado no volume financeiro
        linkWidth={(link) => link.value || 1}
        linkColor={(link) => (link.score_risco && link.score_risco > 7.5 ? '#ef4444' : '#cbd5e1')} // Vermelho estrito em risco extremo
        linkDirectionalParticles={(link) => (link.score_risco && link.score_risco > 7.5 ? 4 : 0)} // Pulsação baseada no score_risco do Asmodeus
        linkDirectionalParticleSpeed={0.01}
        onNodeClick={handleNodeClick}
        backgroundColor="#0f172a"
        showNavInfo={false}
      />

      {selectedNode && (
        <ForensicPanel
          node={selectedNode}
          isPremium={isPremium}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
