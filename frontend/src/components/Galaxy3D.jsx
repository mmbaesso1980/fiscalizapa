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
    <div className="w-full h-full bg-slate-900">
      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        nodeId="id"
        nodeLabel="name"
        nodeAutoColorBy="id"
        nodeVal={(node) => Math.sqrt(node.value) / 100} // Tamanho baseado no volume financeiro
        linkWidth={(link) => link.value} // Espessura reage a risco/volume financeiro
        onNodeClick={handleNodeClick}
        backgroundColor="#0f172a"
        showNavInfo={false}
      />
    </div>
  );
}
