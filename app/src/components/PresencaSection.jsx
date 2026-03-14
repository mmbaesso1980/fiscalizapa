import React, { useMemo } from 'react';

const GOAL_PRESENCA = 75; // Meta mínima de presença (%)

const CircularProgress = ({ value, size = 120, strokeWidth = 10 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 75 ? '#22c55e' : value >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#1e3a5f"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        className="transform rotate-90"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px`, fontSize: '18px', fontWeight: 'bold', fill: color }}
      >
        {value}%
      </text>
    </svg>
  );
};

const PresencaSection = ({ politician }) => {
  const presencaData = useMemo(() => {
    if (!politician) return null;
    const presenca = politician.presenca || 0;
    const totalSessions = politician.totalSessions || 0;
    const presentSessions = politician.presentSessions || 0;
    const absentSessions = totalSessions - presentSessions;
    const status = presenca >= 75 ? 'Acima da média' : presenca >= 50 ? 'Abaixo da média' : 'Crítico';
    const statusColor = presenca >= 75 ? 'text-green-400' : presenca >= 50 ? 'text-yellow-400' : 'text-red-400';
    const comparison = presenca - GOAL_PRESENCA;
    return {
      presenca,
      totalSessions,
      presentSessions,
      absentSessions,
      status,
      statusColor,
      comparison,
    };
  }, [politician]);

  if (!presencaData) {
    return (
      <div className="bg-blue-950/50 rounded-xl p-6 border border-blue-800">
        <p className="text-blue-400">Selecione um político para ver dados de presença</p>
      </div>
    );
  }

  return (
    <div className="bg-blue-950/50 rounded-xl p-6 border border-blue-800">
      <h3 className="text-xl font-bold text-white mb-6">Presença nas Sessões</h3>
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Circular Progress */}
        <div className="flex flex-col items-center">
          <CircularProgress value={presencaData.presenca} size={140} strokeWidth={12} />
          <p className={`mt-2 font-semibold ${presencaData.statusColor}`}>
            {presencaData.status}
          </p>
        </div>
        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 gap-4">
          <div className="bg-blue-900/40 rounded-lg p-4">
            <p className="text-blue-300 text-sm">Total de Sessões</p>
            <p className="text-2xl font-bold text-white">{presencaData.totalSessions}</p>
          </div>
          <div className="bg-green-900/20 rounded-lg p-4">
            <p className="text-green-300 text-sm">Sessões Presentes</p>
            <p className="text-2xl font-bold text-green-400">{presencaData.presentSessions}</p>
          </div>
          <div className="bg-red-900/20 rounded-lg p-4">
            <p className="text-red-300 text-sm">Sessões Ausentes</p>
            <p className="text-2xl font-bold text-red-400">{presencaData.absentSessions}</p>
          </div>
          <div className="bg-blue-900/40 rounded-lg p-4">
            <p className="text-blue-300 text-sm">vs Meta ({GOAL_PRESENCA}%)</p>
            <p className={`text-2xl font-bold ${
              presencaData.comparison >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {presencaData.comparison >= 0 ? '+' : ''}{presencaData.comparison}%
            </p>
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-6">
        <div className="flex justify-between text-sm text-blue-300 mb-1">
          <span>Índice de Presença</span>
          <span>{presencaData.presenca}%</span>
        </div>
        <div className="h-3 bg-blue-900/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              presencaData.presenca >= 75 ? 'bg-green-500'
              : presencaData.presenca >= 50 ? 'bg-yellow-500'
              : 'bg-red-500'
            }`}
            style={{ width: `${presencaData.presenca}%` }}
          />
        </div>
        <div className="mt-1 flex justify-end">
          <span className="text-xs text-blue-400">Meta: {GOAL_PRESENCA}%</span>
        </div>
      </div>
    </div>
  );
};

export default PresencaSection;