import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';
import ForensicPanel from './ForensicPanel';

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  const [selectedNode, setSelectedNode] = React.useState(null);

  useEffect(() => {
    if (map.current) return;

    // Configura o protocolo PMTiles
    let protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-51.9253, -14.2350], // Foco no Brasil Inteiro
      zoom: 4,
    });

    map.current.on('load', () => {
      // Sprint 4.5: MapLibre Nacional com Clustering (Zero Hallucination)
      // Fonte inicial vazia; será populada pelo Firestore via PMTiles ou GeoJSON APIs futuramente
      map.current.addSource('forensic-points', {
          type: 'geojson',
          data: {
              type: 'FeatureCollection',
              features: []
          },
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50
      });

      // Layer 1: Círculos agrupados (Clustered nodes)
      map.current.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'forensic-points',
          filter: ['has', 'point_count'],
          paint: {
              'circle-color': [
                  'step',
                  ['get', 'point_count'],
                  '#cbd5e1', // 0-20 pts
                  20,
                  '#f59e0b', // 20-50 pts
                  50,
                  '#ef4444'  // 50+ pts (Risco de malha massiva)
              ],
              'circle-radius': [
                  'step',
                  ['get', 'point_count'],
                  15, // 0-20 pts
                  20, // 20-50 pts
                  20,
                  50, // 50+ pts
                  25
              ]
          }
      });

      // Layer 2: Label do número de itens agrupados
      map.current.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'forensic-points',
          filter: ['has', 'point_count'],
          layout: {
              'text-field': '{point_count_abbreviated}',
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
              'text-size': 12
          },
          paint: {
              'text-color': '#ffffff'
          }
      });

      // Layer 3: Nós individuais (Drill-down alcançado)
      map.current.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'forensic-points',
          filter: ['!', ['has', 'point_count']],
          paint: {
              'circle-color': '#ef4444',
              'circle-radius': 6,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#fff'
          }
      });

      // Evento de Clique para Expandir a Teia/Abrir o ForensicPanel
      map.current.on('click', 'unclustered-point', (e) => {
          const feature = e.features[0];
          // Quando houver dados, acionará o ForensicPanel
          setSelectedNode(feature.properties);
      });

      // Clique no Cluster para zoom
      map.current.on('click', 'clusters', (e) => {
          const features = map.current.queryRenderedFeatures(e.point, { layers: ['clusters'] });
          const clusterId = features[0].properties.cluster_id;
          map.current.getSource('forensic-points').getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err) return;
              map.current.easeTo({
                  center: features[0].geometry.coordinates,
                  zoom: zoom
              });
          });
      });

      // Cursor pointer (UX)
      map.current.on('mouseenter', 'clusters', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'clusters', () => { map.current.getCanvas().style.cursor = ''; });
    });

    return () => {
      maplibregl.removeProtocol('pmtiles');
      if (map.current) map.current.remove();
      map.current = null;
    };
  }, []);

  return (
    <div className="w-full h-full relative">
       <div ref={mapContainer} className="w-full h-full" />

       {selectedNode && (
         <ForensicPanel
           node={selectedNode}
           isPremium={false}
           onClose={() => setSelectedNode(null)}
         />
       )}
    </div>
  );
}
