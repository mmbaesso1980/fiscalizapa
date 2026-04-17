import React from 'react';
import { X, AlertOctagon, Network, Clock, Lock } from 'lucide-react';

export default function ForensicPanel({ node, onClose, isPremium = false }) {
  if (!node) return null;

  // Lógica de Progressive Disclosure
  // O nó só ativa as informações profundas se o usuário possuir cota Premium ou Auditor
  // A identidade básica é gratuita.

  const maskCpf = (cpf) => {
    if (!cpf) return '***.***.***-**';
    const s = String(cpf).replace(/\D/g, '');
    if (s.length === 11) return `***.${s.substring(3, 6)}.${s.substring(6, 9)}-**`;
    if (s.length === 14) return `**.***.${s.substring(5, 8)}/0001-**`;
    return '***.***.***-**';
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Lateral */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 translate-x-0">

        {/* Header */}
        <header className="p-6 bg-slate-900 text-white flex justify-between items-start border-b border-slate-700">
          <div>
            <span className="text-xs uppercase tracking-wider font-cabinet text-slate-400 mb-1 block">
              Raio-X Forense
            </span>
            <h2 className="text-xl font-bold font-cabinet">{node.name || 'Entidade Desconhecida'}</h2>
            <div className="mt-2 inline-flex items-center bg-red-500/20 text-red-400 px-2 py-1 rounded text-sm font-satoshi">
              <AlertOctagon size={14} className="mr-1" />
              Score Asmodeus: {node.score_risco || 0}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 font-satoshi space-y-8 bg-slate-50">

          {/* Seção 1: Ficha Asmodeus */}
          <section>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center border-b border-slate-200 pb-2">
              <AlertOctagon size={16} className="mr-2 text-slate-500" />
              Breakdown de Risco
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white rounded border border-slate-200 shadow-sm">
                <span className="text-slate-600">Desvio CNAE</span>
                <span className="font-mono font-medium">{node.cnae_risco || 0} pts</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded border border-slate-200 shadow-sm">
                <span className="text-slate-600">Malha de Parentesco</span>
                <span className="font-mono font-medium">{node.parentesco_risco || 0} pts</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white rounded border border-slate-200 shadow-sm">
                <span className="text-slate-600">Fator Inidoneidade</span>
                <span className="font-mono font-medium">{node.inidoneidade_fator || 1}x</span>
              </div>
            </div>
          </section>

          {/* Paywall Gate */}
          {!isPremium ? (
            <div className="relative mt-8 p-6 bg-slate-900 rounded-lg shadow-lg text-center overflow-hidden border border-slate-700">
               {/* Fundo borrado imitando dados */}
               <div className="absolute inset-0 opacity-10 filter blur-sm pointer-events-none select-none flex flex-col space-y-4 p-4 text-left">
                  <div className="h-4 bg-slate-400 w-3/4 rounded"></div>
                  <div className="h-4 bg-slate-400 w-1/2 rounded"></div>
                  <div className="h-10 bg-slate-400 w-full rounded mt-4"></div>
                  <div className="h-4 bg-slate-400 w-2/3 rounded"></div>
               </div>

               <Lock size={32} className="mx-auto mb-4 text-amber-400" />
               <h3 className="text-lg font-bold font-cabinet text-white mb-2">Acesso Auditor Restrito</h3>
               <p className="text-sm text-slate-400 mb-6">
                 Desbloqueie a Teia Societária (QSA) e a Timeline Financeira cruzada com emendas parlamentares.
               </p>
               <button className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded transition-colors shadow-sm font-cabinet">
                 Desbloquear Dossiê Completo
               </button>
            </div>
          ) : (
            <>
              {/* Seção 2: Teia Societária (Gated) */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center border-b border-slate-200 pb-2">
                  <Network size={16} className="mr-2 text-slate-500" />
                  Teia Societária (QSA)
                </h3>
                <ul className="space-y-2">
                  {(node.qsa || []).map((socio, idx) => (
                    <li key={idx} className="p-3 bg-white border border-slate-200 rounded shadow-sm flex flex-col">
                      <span className="font-bold text-slate-700">{socio.nome || 'Sócio Oculto'}</span>
                      <span className="text-xs text-slate-500 font-mono mt-1">CPF/CNPJ: {maskCpf(socio.documento)}</span>
                    </li>
                  ))}
                  {(!node.qsa || node.qsa.length === 0) && (
                    <li className="p-3 bg-slate-100 border border-slate-200 rounded text-slate-500 text-sm italic text-center">
                      Nenhum sócio mapeado na malha atual.
                    </li>
                  )}
                </ul>
              </section>

              {/* Seção 3: Timeline Financeira (Gated) */}
              <section>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 flex items-center border-b border-slate-200 pb-2">
                  <Clock size={16} className="mr-2 text-slate-500" />
                  Timeline Financeira
                </h3>
                <div className="relative border-l-2 border-slate-200 ml-3 pl-4 space-y-6 pb-4">

                  <div className="relative">
                    <span className="absolute -left-[25px] w-3 h-3 bg-slate-300 rounded-full border-2 border-white"></span>
                    <p className="text-xs font-bold text-slate-500">2022</p>
                    <p className="text-sm text-slate-700 mt-1">Abertura da empresa</p>
                  </div>

                  <div className="relative">
                    <span className="absolute -left-[25px] w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                    <p className="text-xs font-bold text-slate-500">2024</p>
                    <p className="text-sm text-slate-700 mt-1">
                      <span className="font-bold text-slate-900">R$ 1.5M</span> via Emenda Parlamentar
                    </p>
                  </div>

                </div>
              </section>
            </>
          )}

        </div>
      </div>
    </>
  );
}
