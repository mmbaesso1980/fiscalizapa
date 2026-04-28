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
          className="w-full bg-slate-900 border border-slate-700 text-sm rounded-full px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
        />
        <span className="absolute right-3 top-2 text-slate-400 text-sm">
          {isSearching ? '⏳' : '🔍'}
        </span>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-12 left-0 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-y-auto max-h-96">
          {results.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => handleSelect(item.id)}
              className="w-full text-left flex items-center gap-3 p-3 hover:bg-slate-700 cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors focus:outline-none focus:bg-slate-700"
            >
              {item.avatar_url ? (
                <img src={item.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover bg-slate-900 border border-slate-600" />
              ) : (
                <div aria-hidden="true" className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 border border-slate-600">👤</div>
              )}
              <div className="flex-1">
                <div className="text-white font-bold text-sm">{item.nome}</div>
                <div className="text-slate-400 text-xs font-mono">{item.cargo} · {item.partido}/{item.uf}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-widest mb-1">Score</div>
                <div className="text-red-400 font-bold">{item.score_sep}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {!isSearching && query.trim().length > 2 && isOpen && results.length === 0 && (
        <div role="status" className="absolute top-12 left-0 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl p-4 text-center text-slate-400 text-sm">
          Nenhum resultado encontrado.
        </div>
      )}
    </div>
  );
}
