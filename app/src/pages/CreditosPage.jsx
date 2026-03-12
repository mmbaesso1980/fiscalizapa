import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
const planos = [
  { nome: 'Basico', creditos: 10, preco: 'R$ 29,00', priceId: 'price_basic' },
  { nome: 'Premium', creditos: 25, preco: 'R$ 49,00', priceId: 'price_premium' },
  { nome: 'Assinatura', creditos: 'Ilimitado', preco: 'R$ 39,90/mes', priceId: 'price_sub' },
];
export default function CreditosPage({ user }) {
  const [loading, setLoading] = useState(false);
  if (!user) return <div className='p-6 text-center'><h1 className='text-2xl font-bold'>Faca login</h1></div>;
  const buy = async (p) => {
    setLoading(true);
    try {
      const r = await httpsCallable(getFunctions(), 'createCheckoutSession')({ priceId: p.priceId });
      if (r.data.url) window.location.href = r.data.url;
    } catch(e) { alert('Erro no pagamento'); }
    setLoading(false);
  };
  return (<div className='max-w-4xl mx-auto p-6'><h1 className='text-3xl font-bold mb-2 text-center'>Comprar Creditos</h1><p className='text-gray-600 mb-8 text-center'>Escolha um plano</p><div className='grid md:grid-cols-3 gap-6'>{planos.map(p => (<div key={p.nome} className='border rounded-xl p-6 shadow hover:shadow-lg'><h2 className='text-xl font-bold mb-2'>{p.nome}</h2><p className='text-3xl font-bold text-green-700 mb-2'>{p.preco}</p><p className='text-gray-500 mb-4'>{p.creditos} creditos</p><button onClick={() => buy(p)} disabled={loading} className='w-full bg-green-700 text-white py-2 rounded-lg hover:bg-green-800 disabled:opacity-50'>{loading ? 'Aguarde...' : 'Comprar'}</button></div>))}</div></div>);
}
