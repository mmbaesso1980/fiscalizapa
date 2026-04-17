const test = require('node:test');
const assert = require('node:assert');
const { calcularScoreAsmodeusV2 } = require('./forensicEngine');

test('Sprint 3: Asmodeus v2.0 - Lógica Matemática', async (t) => {
  await t.test('Cálculo Base (cnaeRisco 10 + parentesco 20) * fator 1', () => {
    const result = calcularScoreAsmodeusV2(10, 20, 1);
    assert.strictEqual(result, 30); // (10 + 20) * 1 = 30
  });

  await t.test('Limites Cap internos (inputs > 50 são travados em 50)', () => {
    const result = calcularScoreAsmodeusV2(100, 70, 1);
    assert.strictEqual(result, 100); // (50 max + 50 max) * 1 = 100
  });

  await t.test('Fator Inidoneidade Ativo (CEIS/CNEP/CEPIM = 2) dobra o risco final', () => {
    const result = calcularScoreAsmodeusV2(25, 25, 2);
    assert.strictEqual(result, 100); // (25 + 25) * 2 = 100
  });

  await t.test('Max Cap Absoluto de 200 pontos (Nível máximo: Audit)', () => {
    const result = calcularScoreAsmodeusV2(50, 50, 2);
    assert.strictEqual(result, 200); // (50 + 50) * 2 = 200, limite não é estourado
  });

  await t.test('Tratamento de inputs absurdos ou não numéricos (volta pra 0)', () => {
     const result = calcularScoreAsmodeusV2("lixo", undefined, null);
     assert.strictEqual(result, 0); // (0 + 0) * 1 = 0
  });
});
