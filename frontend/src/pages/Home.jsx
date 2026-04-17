import React from 'react';
import Galaxy3D from '../components/Galaxy3D';

export default function Home() {
  return (
    <div className="w-full h-[80vh] flex flex-col items-center justify-center">
      <h2 className="text-3xl font-cabinet font-bold mb-4">Universo Político</h2>
      <div className="w-full h-full rounded shadow-lg overflow-hidden border border-slate-200">
        <Galaxy3D />
      </div>
    </div>
  );
}
