import React, { useState, useMemo } from 'react';

const TIPOS_PROJETO = [
  { value: '', label: 'Todos os tipos' },
  { value: 'PL', label: 'Projeto de Lei (PL)' },
  { value: 'PEC', label: 'PEC - Emenda Constitucional' },
  { value: 'MPV', label: 'Medida Provisória' },
  { value: 'PDL', label: 'Projeto de Decreto Legislativo' },
  { value: 'PRC', label: 'Projeto de Resolução' },
];

const STATUS_PROJETO = [
  { value: '', label: 'Todos os status' },
  { value: 'Em tramitação', label: 'Em Tramitação' },
  { value: 'Aprovado', label: 'Aprovado' },
  { value: 'Rejeitado', label: 'Rejeitado' },
  { value: 'Arquivado', label: 'Arquivado' },
];

const MOCK_PROJETOS = [
  {
    id: '1',
    numero: 'PL 1234/2024',
    tipo: 'PL',
    ementa: 'Dispõe sobre a transparência nos gastos públicos municipais e estaduais, criando mecanismos de fiscalização popular.',
    status: 'Em tramitação',
    dataApresentacao: '2024-03-15',
    tema: 'Transparência Pública',
  },
  {
    id: '2',
    numero: 'PEC 42/2023',
    tipo: 'PEC',
    ementa: 'Altera a Constituição Federal para incluir o direito ao acesso à internet como direito fundamental.',
    status: 'Aprovado',
    dataApresentacao: '2023-08-20',
    tema: 'Direitos Digitais',
  },
  {
    id: '3',
    numero: 'PL 5678/2024',
    tipo: 'PL',
    ementa: 'Estabelece normas para o uso de inteligência artificial no serviço público federal.',
    status: 'Em tramitação',
    dataApresentacao: '2024-06-10',
    tema: 'Tecnologia',
  },
  {
    id: '4',
    numero: 'PDL 89/2023',
    tipo: 'PDL',
    ementa: 'Susta os efeitos da Portaria nº 123 do Ministério da Fazenda sobre tributação de importações.',
    status: 'Rejeitado',
    dataApresentacao: '2023-11-05',
    tema: 'Economia',
  },
  {
    id: '5',
    numero: 'PL 9012/2024',
    tipo: 'PL',
    ementa: 'Institui o Programa Nacional de Apoio à Agricultura Familiar Orgânica.',
    status: 'Em tramitação',
    dataApresentacao: '2024-09-18',
    tema: 'Agricultura',
  },
];

const StatusBadge = ({ status }) => {
  const styles = {
    'Em tramitação': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    'Aprovado': 'bg-green-500/20 text-green-300 border-green-500/30',
    'Rejeitado': 'bg-red-500/20 text-red-300 border-red-500/30',
    'Arquivado': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status] || styles['Arquivado']}`}>
      {status}
    </span>
  );
};

const ProjetosSection = ({ politician, projetos: projetosProp }) => {
  const [filterTipo, setFilterTipo] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const projetos = projetosProp || MOCK_PROJETOS;

  const filteredProjetos = useMemo(() => {
    return projetos.filter((p) => {
      if (filterTipo && p.tipo !== filterTipo) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !p.ementa?.toLowerCase().includes(term) &&
          !p.numero?.toLowerCase().includes(term) &&
          !p.tema?.toLowerCase().includes(term)
        ) return false;
      }
      return true;
    });
  }, [projetos, filterTipo, filterStatus, searchTerm]);

  const totalPages = Math.ceil(filteredProjetos.length / ITEMS_PER_PAGE);
  const paginatedProjetos = filteredProjetos.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };

  return (
    <div className="bg-blue-950/50 rounded-xl p-6 border border-blue-800">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h3 className="text-xl font-bold text-white">Proposições Legislativas</h3>
          {politician && (
            <p className="text-blue-400 text-sm mt-1">{politician.nome} · {filteredProjetos.length} proposições</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Buscar proposição..."
            value={searchTerm}
            onChange={handleFilterChange(setSearchTerm)}
            className="bg-blue-900/50 border border-blue-700 text-white placeholder-blue-400 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <select
            value={filterTipo}
            onChange={handleFilterChange(setFilterTipo)}
            className="bg-blue-900/50 border border-blue-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {TIPOS_PROJETO.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={handleFilterChange(setFilterStatus)}
            className="bg-blue-900/50 border border-blue-700 text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {STATUS_PROJETO.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Projects list */}
      {paginatedProjetos.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-blue-400">Nenhuma proposição encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedProjetos.map((projeto) => (
            <div
              key={projeto.id}
              className="bg-blue-900/30 rounded-lg p-4 border border-blue-800/50 hover:border-blue-600 transition-colors"
            >
              <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-blue-300 font-mono text-sm font-semibold">{projeto.numero}</span>
                    {projeto.tema && (
                      <span className="bg-blue-800/50 text-blue-300 text-xs px-2 py-0.5 rounded">
                        {projeto.tema}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-sm leading-relaxed">{projeto.ementa}</p>
                  <p className="text-blue-400 text-xs mt-2">
                    Apresentado em {new Date(projeto.dataApresentacao).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <StatusBadge status={projeto.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex justify-center items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded bg-blue-900/50 text-blue-300 disabled:opacity-40 hover:bg-blue-800 transition-colors text-sm"
          >
            Anterior
          </button>
          <span className="text-blue-400 text-sm">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded bg-blue-900/50 text-blue-300 disabled:opacity-40 hover:bg-blue-800 transition-colors text-sm"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
};

export default ProjetosSection;