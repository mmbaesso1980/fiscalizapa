import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as pmtiles from 'pmtiles';

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (map.current) return;

    // Configura o protocolo PMTiles
    let protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-51.9253, -14.2350],
      zoom: 4,
    });

    map.current.on('load', () => {
      // Exemplo futuro de carregamento de PMTiles:
      /*
      map.current.addSource('source_id', {
          type: 'vector',
          url: 'pmtiles://path_to_tiles.pmtiles'
      });
      map.current.addLayer({
          'id': 'layer_id',
          'type': 'fill',
          'source': 'source_id',
          'source-layer': 'layer_name',
          'paint': {
              'fill-color': '#0080ff',
              'fill-opacity': 0.5
          }
      });
      */
    });

    return () => {
      maplibregl.removeProtocol('pmtiles');
      if (map.current) map.current.remove();
      map.current = null;
    };
  }, []);

  return <div ref={mapContainer} className="w-full h-full" />;
}
