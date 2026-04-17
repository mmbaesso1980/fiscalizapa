import test from "node:test";
import assert from "node:assert/strict";
import { calcScoreSEP } from "./indiceTransparenciaBR.js";

test("calcScoreSEP matches Asmodeus (mediaGeral <= 0 → 0)", () => {
  assert.equal(calcScoreSEP({ producao: 50, fiscalizacao: 50, gastos: 100, mediaGeral: 0 }), 0);
});

test("calcScoreSEP matches Asmodeus (ratio + 1.2 when gastos > media)", () => {
  // scoreBase = 0.4*1 + 0.4*1 = 0.8; fatorGastos = (200/100)*1.2 = 2.4; sep = (0.8/2.4)*100 ≈ 33.33 → 33
  const score = calcScoreSEP({
    producao: 1,
    fiscalizacao: 1,
    gastos: 200,
    mediaGeral: 100,
  });
  assert.equal(score, 33);
});

test("calcScoreSEP uses fatorGastos 0.1 when ratio is 0", () => {
  const score = calcScoreSEP({
    producao: 40,
    fiscalizacao: 40,
    gastos: 0,
    mediaGeral: 100,
  });
  assert.equal(score, 100);
});
