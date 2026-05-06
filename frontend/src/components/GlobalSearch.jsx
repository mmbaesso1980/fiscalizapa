import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

export default function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.trim().length > 2) {
        setIsSearching(true);
        try {
          const searchEntities = httpsCallable(functions, 'searchEntities');
          const response = await searchEntities({ q: query });
          setResults(response.data.results || []);
          setIsOpen(true);
        } catch (error) {
          console.error("Erro na busca:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const handleSelect = (id) => {
    setIsOpen(false);
    setQuery('');
    navigate(`/dossie/${id}`);
  };

  return (
    <div className="relative w-full max-w-2xl z-50">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar político, partido ou CNPJ..."
          aria-label="Pesquisar político, partido ou CNPJ"
          className="w-full bg-slate-900 border border-slate-700 text-sm rounded-full px-4 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
        />
        <span className="absolute right-3 top-2 text-slate-400 text-sm" aria-hidden="true">
          {isSearching ? '⏳' : '🔍'}
        </span>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {isSearching ? 'Buscando resultados...' : isOpen && results.length > 0 ? `${results.length} resultados encontrados` : ''}
      </div>

      {isOpen && results.length > 0 && (
        <ul role="list" className="absolute top-12 left-0 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-y-auto max-h-96 m-0 p-0 list-none">
          {results.map((item) => (
            <li key={item.id} className="border-b border-slate-700/50 last:border-0">
              <button
                type="button"
                onClick={() => handleSelect(item.id)}
                className="w-full text-left flex items-center gap-3 p-3 hover:bg-slate-700 cursor-pointer transition-colors focus:outline-none focus-visible:bg-slate-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              >
                {item.avatar_url ? (
                  <img src={item.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-900 border border-slate-600 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 border border-slate-600 shrink-0" aria-hidden="true">👤</div>
                )}
                <div className="flex-1 overflow-hidden">
                  <div className="text-white font-bold text-sm truncate">{item.nome}</div>
                  <div className="text-slate-400 text-xs font-mono truncate">{item.cargo} · {item.partido}/{item.uf}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Score</div>
                  <div className="text-red-400 font-bold">{item.score_sep}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
