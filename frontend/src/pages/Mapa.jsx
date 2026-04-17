import React from 'react';
import Map from '../components/Map';

export default function Mapa() {
  return (
    <div className="w-full h-[80vh] flex flex-col items-center justify-center">
      <h2 className="text-3xl font-cabinet font-bold mb-4">Mapa Coroplético</h2>
      <div className="w-full h-full rounded shadow-lg overflow-hidden border border-slate-200">
        <Map />
      </div>
    </div>
  );
}
