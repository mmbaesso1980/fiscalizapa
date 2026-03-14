import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ESTADOS = [
  { id: 'AC', nome: 'Acre', d: 'M 120 280 L 140 270 L 160 280 L 155 300 L 135 310 L 115 295 Z' },
  { id: 'AL', nome: 'Alagoas', d: 'M 520 310 L 540 305 L 550 320 L 535 330 L 518 322 Z' },
  { id: 'AM', nome: 'Amazonas', d: 'M 160 200 L 220 180 L 280 190 L 300 230 L 280 270 L 240 280 L 200 270 L 170 250 L 155 225 Z' },
  { id: 'AP', nome: 'Amapá', d: 'M 370 120 L 395 110 L 410 130 L 400 155 L 378 148 Z' },
  { id: 'BA', nome: 'Bahia', d: 'M 440 280 L 510 265 L 545 300 L 540 360 L 510 390 L 470 380 L 440 350 L 430 320 Z' },
  { id: 'CE', nome: 'Ceará', d: 'M 480 215 L 520 205 L 535 230 L 520 255 L 490 258 L 472 240 Z' },
  { id: 'DF', nome: 'Distrito Federal', d: 'M 420 350 L 430 345 L 435 355 L 425 360 Z' },
  { id: 'ES', nome: 'Espírito Santo', d: 'M 520 380 L 535 375 L 542 395 L 528 405 L 515 395 Z' },
  { id: 'GO', nome: 'Goiás', d: 'M 390 320 L 440 305 L 455 345 L 440 380 L 405 380 L 385 355 Z' },
  { id: 'MA', nome: 'Maranhão', d: 'M 400 210 L 450 200 L 465 230 L 450 260 L 415 260 L 398 238 Z' },
  { id: 'MG', nome: 'Minas Gerais', d: 'M 450 355 L 530 340 L 550 380 L 535 420 L 495 435 L 455 420 L 440 390 Z' },
  { id: 'MS', nome: 'Mato Grosso do Sul', d: 'M 330 380 L 390 365 L 400 400 L 385 430 L 345 430 L 325 408 Z' },
  { id: 'MT', nome: 'Mato Grosso', d: 'M 290 280 L 370 265 L 390 310 L 380 360 L 335 370 L 290 350 L 275 315 Z' },
  { id: 'PA', nome: 'Pará', d: 'M 290 160 L 380 145 L 415 175 L 410 220 L 375 240 L 320 235 L 285 210 Z' },
  { id: 'PB', nome: 'Paraíba', d: 'M 520 255 L 550 248 L 558 265 L 540 272 L 520 268 Z' },
  { id: 'PE', nome: 'Pernambuco', d: 'M 480 268 L 530 258 L 545 275 L 530 288 L 485 285 L 472 275 Z' },
  { id: 'PI', nome: 'Piauí', d: 'M 450 230 L 485 220 L 492 255 L 475 272 L 448 262 L 440 245 Z' },
  { id: 'PR', nome: 'Paraná', d: 'M 380 430 L 445 418 L 452 450 L 430 468 L 388 462 L 372 448 Z' },
  { id: 'RJ', nome: 'Rio de Janeiro', d: 'M 508 400 L 535 390 L 545 408 L 525 420 L 505 415 Z' },
  { id: 'RN', nome: 'Rio Grande do Norte', d: 'M 525 230 L 555 225 L 562 245 L 548 255 L 525 248 Z' },
  { id: 'RO', nome: 'Rondônia', d: 'M 220 280 L 270 270 L 280 305 L 260 318 L 225 310 Z' },
  { id: 'RR', nome: 'Roraima', d: 'M 210 130 L 250 118 L 268 148 L 255 175 L 225 178 L 205 158 Z' },
  { id: 'RS', nome: 'Rio Grande do Sul', d: 'M 368 462 L 430 450 L 440 490 L 415 515 L 375 510 L 355 488 Z' },
  { id: 'SC', nome: 'Santa Catarina', d: 'M 375 448 L 440 438 L 445 458 L 420 468 L 378 462 Z' },
  { id: 'SE', nome: 'Sergipe', d: 'M 528 305 L 545 300 L 550 318 L 535 325 L 522 318 Z' },
  { id: 'SP', nome: 'São Paulo', d: 'M 430 398 L 500 382 L 512 415 L 498 440 L 455 445 L 432 425 Z' },
  { id: 'TO', nome: 'Tocantins', d: 'M 400 245 L 445 238 L 455 280 L 440 318 L 405 315 L 392 278 Z' },
];

const MapaBrasil = ({ onEstadoSelect }) => {
  const [hoveredEstado, setHoveredEstado] = useState(null);
  const [selectedEstado, setSelectedEstado] = useState(null);
  const navigate = useNavigate();

  const handleEstadoClick = (estado) => {
    setSelectedEstado(estado.id);
    if (onEstadoSelect) {
      onEstadoSelect(estado);
    } else {
      navigate(`/politicos?estado=${estado.id}`);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-2xl font-bold text-white mb-4">Selecione seu Estado</h2>
      <div className="relative w-full max-w-2xl">
        <svg
          viewBox="0 0 700 600"
          className="w-full h-auto"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' }}
        >
          {ESTADOS.map((estado) => (
            <g key={estado.id}>
              <path
                d={estado.d}
                fill={
                  selectedEstado === estado.id
                    ? '#f59e0b'
                    : hoveredEstado === estado.id
                    ? '#3b82f6'
                    : '#1e3a5f'
                }
                stroke="#0f172a"
                strokeWidth="1.5"
                className="cursor-pointer transition-colors duration-200"
                onMouseEnter={() => setHoveredEstado(estado.id)}
                onMouseLeave={() => setHoveredEstado(null)}
                onClick={() => handleEstadoClick(estado)}
              />
              <text
                x={parseFloat(estado.d.match(/M (\d+)/)?.[1] || 0) + 10}
                y={parseFloat(estado.d.match(/M \d+ (\d+)/)?.[1] || 0) + 15}
                fontSize="8"
                fill="white"
                className="pointer-events-none select-none"
                style={{ fontSize: '8px' }}
              >
                {estado.id}
              </text>
            </g>
          ))}
        </svg>
        {hoveredEstado && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-900 text-white px-4 py-2 rounded-lg shadow-lg">
            <p className="font-semibold">{ESTADOS.find(e => e.id === hoveredEstado)?.nome}</p>
          </div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 w-full max-w-2xl">
        {ESTADOS.map((estado) => (
          <button
            key={estado.id}
            onClick={() => handleEstadoClick(estado)}
            className={`py-1 px-2 rounded text-xs font-medium transition-colors ${
              selectedEstado === estado.id
                ? 'bg-amber-500 text-white'
                : 'bg-blue-900/50 text-blue-200 hover:bg-blue-700'
            }`}
          >
            {estado.id}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MapaBrasil;