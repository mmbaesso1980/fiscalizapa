import React, { useEffect, useState, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";

export default function Galaxy3D() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const handleNodeClick = node => {
    // Ação: Abre Dossiê em Cards (Elimina tabela)
    window.location.href = `/dossie/${node.id}`;
  };
  const graphRef = useRef();

  useEffect(() => {
    const loadGalaxyData = async () => {
      try {
        const storageUrl = `https://storage.googleapis.com/fiscallizapa.appspot.com/galaxy-data.json`;
        const res = await fetch(storageUrl);
        if (!res.ok) throw new Error("Falha ao ler dados da galáxia do storage.");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.warn("Bucket data not found, falling back to static file.");
        // Fallback para arquivo estático (para deploy inicial)
        const fallbackRes = await fetch("/galaxy-data.json");
        const fallbackJson = await fallbackRes.json();
        setData(fallbackJson);
      }
    };
    loadGalaxyData();
  }, []);

  return (
    <div style={{ height: "400px", width: "100%", position: "relative", background: "transparent", borderRadius: "12px", overflow: "hidden" }}>
      <ForceGraph3D
        ref={graphRef}
        graphData={data}
        nodeLabel="id"
        nodeAutoColorBy="group"
        nodeVal={node => Math.max(1, (node.val || 10) / 10)}
        nodeResolution={16}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={d => (d.value || 1) * 0.001}
        width={800} // responsive approach might need resize listener or flexible container
        height={400}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
        onNodeClick={handleNodeClick}
        linkColor={() => "rgba(255,255,255,0.2)"}
        linkWidth={1.5}
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
      />
    </div>
  );
}
