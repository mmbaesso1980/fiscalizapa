import React from 'react';
import { useParams } from 'react-router-dom';

export default function Dossie() {
  const { id } = useParams();
  return (
    <div className="w-full max-w-4xl mx-auto py-8">
      <h2 className="text-3xl font-cabinet font-bold mb-4">Dossiê do Parlamentar</h2>
      <p>Visualizando dossiê do ID: {id}</p>
    </div>
  );
}
