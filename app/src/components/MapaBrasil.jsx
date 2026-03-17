import { useState } from 'react';

const ESTADOS = [
  { id: 'AC', nome: 'Acre', d: 'M 120 280 L 140 270 L 160 280 L 155 300 L 135 310 L 115 295 Z' },
  { id: 'AL', nome: 'Alagoas', d: 'M 520 310 L 540 305 L 550 320 L 535 330 L 518 322 Z' },
  { id: 'AM', nome: 'Amazonas', d: 'M 160 200 L 220 180 L 280 190 L 300 230 L 280 270 L 240 280 L 200 270 L 170 250 L 155 225 Z' },
  { id: 'AP', nome: 'Amapa', d: 'M 370 120 L 395 110 L 410 130 L 400 155 L 378 148 Z' },
  { id: 'BA', nome: 'Bahia', d: 'M 440 280 L 510 265 L 545 300 L 540 360 L 510 390 L 470 380 L 440 350 L 430 320 Z' },
  { id: 'CE', nome: 'Ceara', d: 'M 480 215 L 520 205 L 535 230 L 520 255 L 490 258 L 472 240 Z' },
  { id: 'DF', nome: 'Distrito Federal', d: 'M 420 350 L 430 345 L 435 355 L 425 360 Z' },
  { id: 'ES', nome: 'Espirito Santo', d: 'M 520 380 L 535 375 L 542 395 L 528 405 L 515 395 Z' },
  { id: 'GO', nome: 'Goias', d: 'M 390 320 L 440 305 L 455 345 L 440 380 L 405 380 L 385 355 Z' },
  { id: 'MA', nome: 'Maranhao', d: 'M 400 210 L 450 200 L 465 230 L 450 260 L 415 260 L 398 238 Z' },
  { id: 'MG', nome: 'Minas Gerais', d: 'M 450 355 L 530 340 L 550 380 L 535 420 L 495 435 L 455 420 L 440 390 Z' },
  { id: 'MS', nome: 'Mato Grosso do Sul', d: 'M 330 380 L 390 365 L 400 400 L 385 430 L 345 430 L 325 408 Z' },
  { id: 'MT', nome: 'Mato Grosso', d: 'M 290 280 L 370 265 L 390 310 L 380 360 L 335 370 L 290 350 L 275 315 Z' },
  { id: 'PA', nome: 'Para', d: 'M 290 160 L 380 145 L 415 175 L 410 220 L 375 240 L 320 235 L 285 210 Z' },
  { id: 'PB', nome: 'Paraiba', d: 'M 520 255 L 550 248 L 558 265 L 540 272 L 520 268 Z' },
  { id: 'PE', nome: 'Pernambuco', d: 'M 480 268 L 530 258 L 545 275 L 530 288 L 485 285 L 472 275 Z' },
  { id: 'PI', nome: 'Piaui', d: 'M 450 230 L 485 220 L 492 255 L 475 272 L 448 262 L 440 245 Z' },
  { id: 'PR', nome: 'Parana', d: 'M 380 430 L 445 418 L 452 450 L 430 468 L 388 462 L 372 448 Z' },
  { id: 'RJ', nome: 'Rio de Janeiro', d: 'M 508 400 L 535 390 L 545 408 L 525 420 L 505 415 Z' },
  { id: 'RN', nome: 'Rio Grande do Norte', d: 'M 525 230 L 555 225 L 562 245 L 548 255 L 525 248 Z' },
  { id: 'RO', nome: 'Rondonia', d: 'M 220 280 L 270 270 L 280 305 L 260 318 L 225 310 Z' },
  { id: 'RR', nome: 'Roraima', d: 'M 210 130 L 250 118 L 268 148 L 255 175 L 225 178 L 205 158 Z' },
  { id: 'RS', nome: 'Rio Grande do Sul', d: 'M 368 462 L 430 450 L 440 490 L 415 515 L 375 510 L 355 488 Z' },
  { id: 'SC', nome: 'Santa Catarina', d: 'M 375 448 L 440 438 L 445 458 L 420 468 L 378 462 Z' },
  { id: 'SE', nome: 'Sergipe', d: 'M 528 305 L 545 300 L 550 318 L 535 325 L 522 318 Z' },
  { id: 'SP', nome: 'Sao Paulo', d: 'M 430 398 L 500 382 L 512 415 L 498 440 L 455 445 L 432 425 Z' },
  { id: 'TO', nome: 'Tocantins', d: 'M 400 245 L 445 238 L 455 280 L 440 318 L 405 315 L 392 278 Z' },
];

const MapaBrasil = ({ onEstadoSelect, selectedEstado: selectedProp, politicoCounts = {} }) => {
  const [hoveredEstado, setHoveredEstado] = useState(null);
  const [selectedEstado, setSelectedEstado] = useState(selectedProp || null);

  const handleEstadoClick = (estado) => {
    const newSelected = selectedEstado === estado.id ? null : estado.id;
    setSelectedEstado(newSelected);
    if (onEstadoSelect) {
      onEstadoSelect(newSelected);
    }
  };

  const hoveredInfo = hoveredEstado ? ESTADOS.find(e => e.id === hoveredEstado) : null;
  const hoveredCount = hoveredEstado && politicoCounts[hoveredEstado] != null ? politicoCounts[hoveredEstado] : null;

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
      padding: '24px', border: '1px solid var(--border-light)', marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Filtrar por Estado
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Clique em um estado para filtrar {selectedEstado ? `| Selecionado: ${selectedEstado}` : ''}
        </p>
        <div style={{ position: 'relative', width: '100%', maxWidth: '500px' }}>
          <svg viewBox="0 0 700 600" style={{ width: '100%', height: 'auto' }}>
            {ESTADOS.map((estado) => (
              <g key={estado.id}>
                <path
                  d={estado.d}
                  fill={
                    selectedEstado === estado.id
                      ? '#c9a84c'
                      : hoveredEstado === estado.id
                      ? '#5a9e8f'
                      : '#3d6b5e'
                  }
                  stroke="var(--bg-primary)"
                  strokeWidth="1.5"
                  style={{ cursor: 'pointer', transition: 'fill 0.2s' }}
                  onMouseEnter={() => setHoveredEstado(estado.id)}
                  onMouseLeave={() => setHoveredEstado(null)}
                  onClick={() => handleEstadoClick(estado)}
                />
                <text
                  x={parseFloat(estado.d.match(/M (\d+)/)?.[1] || 0) + 10}
                  y={parseFloat(estado.d.match(/M \d+ (\d+)/)?.[1] || 0) + 15}
                  fontSize="8"
                  fill="#fff"
                  style={{ pointerEvents: 'none', userSelect: 'none', fontSize: '8px' }}
                >
                  {estado.id}
                </text>
              </g>
            ))}
          </svg>
          {hoveredInfo && (
            <div style={{
              position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
              background: 'var(--text-primary)', color: '#fff',
              padding: '8px 16px', borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-medium)', fontSize: '13px', whiteSpace: 'nowrap'
            }}>
              <span style={{ fontWeight: 600 }}>{hoveredInfo.nome}</span>
              {hoveredCount != null && (
                <span style={{ marginLeft: '8px', opacity: 0.8 }}>{hoveredCount} politicos</span>
              )}
            </div>
          )}
        </div>
        {selectedEstado && (
          <button onClick={() => { setSelectedEstado(null); onEstadoSelect && onEstadoSelect(null); }} style={{
            marginTop: '12px', padding: '6px 16px', borderRadius: '16px', fontSize: '12px', fontWeight: 500,
            border: '1px solid var(--border-light)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', cursor: 'pointer'
          }}>
            Limpar filtro
          </button>
        )}
      </div>
    </div>
  );
};

export default MapaBrasil;
