import React, { useRef, useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useNavigate } from 'react-router-dom';

export default function Galaxy3D() {
  const fgRef = useRef();
  const navigate = useNavigate();
  const [data, setData] = useState({ nodes: [], links: [] });

  useEffect(() => {
    // Dados vazios para evitar alucinação; aguarda integração futura com Firestore.
    setData({ nodes: [], links: [] });
  }, []);

  const handleNodeClick = (node) => {
    if (node && node.id) {
       // Navega para o Dossier do nó correspondente
       navigate(`/dossie/${node.id}`);
    }
  };

  return (
    <div className="w-full h-full bg-slate-900 relative">
      <div className="absolute top-4 left-4 z-10 text-white bg-slate-800/80 p-4 rounded shadow">
        <h3 className="font-cabinet font-bold text-lg">Asmodeus v2.0 - Radar</h3>
        <p className="text-sm font-satoshi text-slate-300 max-w-xs">
          Visualizador de conexões aguardando integração. Linhas vermelhas indicarão
          Triangulação de Culpa (processos judiciais associados a emendas).
        </p>
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
    </div>
  );
}
