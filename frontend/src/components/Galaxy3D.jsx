import React, { useEffect, useState, useRef } from "react";
import ForceGraph3D from "react-force-graph-3d";

export default function Galaxy3D() {
  const [data, setData] = useState({ nodes: [], links: [] });
  const graphRef = useRef();

  useEffect(() => {
    fetch("/galaxy-data.json")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch((err) => console.error("Error loading galaxy data", err));
  }, []);

  return (
    <div style={{ height: "400px", width: "100%", position: "relative", background: "transparent", borderRadius: "12px", overflow: "hidden" }}>
      <ForceGraph3D
        ref={graphRef}
        graphData={data}
        nodeLabel="id"
        nodeAutoColorBy="group"
        nodeRelSize={6}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={d => (d.value || 1) * 0.001}
        width={800} // responsive approach might need resize listener or flexible container
        height={400}
        backgroundColor="rgba(0,0,0,0)"
        showNavInfo={false}
      />
    </div>
  );
}
