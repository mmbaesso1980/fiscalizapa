import test from 'node:test';
import assert from 'node:assert';
import { parseCamaraValorReais, sumValoresLiquidos } from './moneyCamara.js';

test('parseCamaraValorReais', async (t) => {
  await t.test('handles null and undefined', () => {
    assert.strictEqual(parseCamaraValorReais(null), 0);
    assert.strictEqual(parseCamaraValorReais(undefined), 0);
  });

  await t.test('handles empty strings', () => {
    assert.strictEqual(parseCamaraValorReais(""), 0);
    assert.strictEqual(parseCamaraValorReais("   "), 0);
  });

  await t.test('handles numbers directly', () => {
    assert.strictEqual(parseCamaraValorReais(123.45), 123.45);
    assert.strictEqual(parseCamaraValorReais(0), 0);
    assert.strictEqual(parseCamaraValorReais(Infinity), 0);
    assert.strictEqual(parseCamaraValorReais(NaN), 0);
  });

  await t.test('normalizes large integers (>= 1B)', () => {
    // 1,000,000,000 should be divided by 100 -> 10,000,000
    assert.strictEqual(parseCamaraValorReais(1000000000), 10000000);
    assert.strictEqual(parseCamaraValorReais(1500000000), 15000000);
    // Strings that parse to large integers should also be normalized
    assert.strictEqual(parseCamaraValorReais("1000000000"), 10000000);
  });

  await t.test('handles Brazilian currency strings', () => {
    assert.strictEqual(parseCamaraValorReais("R$ 1.234,56"), 1234.56);
    assert.strictEqual(parseCamaraValorReais("1.234,56"), 1234.56);
    assert.strictEqual(parseCamaraValorReais("1234,56"), 1234.56);
    assert.strictEqual(parseCamaraValorReais("R$1234,56"), 1234.56);
  });

  await t.test('handles dot as decimal separator if no comma', () => {
    assert.strictEqual(parseCamaraValorReais("1234.56"), 1234.56);
  });

  await t.test('handles multiple dots (thousands separator) with comma', () => {
    assert.strictEqual(parseCamaraValorReais("1.234.567,89"), 1234567.89);
  });

  await t.test('handles multiple dots without comma (assumes thousands separator)', () => {
    assert.strictEqual(parseCamaraValorReais("1.234.567"), 1234567);
  });
});

test('sumValoresLiquidos', async (t) => {
  await t.test('returns 0 for non-array inputs', () => {
    assert.strictEqual(sumValoresLiquidos(null, x => x), 0);
    assert.strictEqual(sumValoresLiquidos({}, x => x), 0);
    assert.strictEqual(sumValoresLiquidos("not an array", x => x), 0);
  });

  await t.test('returns 0 for empty arrays', () => {
    assert.strictEqual(sumValoresLiquidos([], x => x), 0);
  });

  await t.test('sums values correctly using pick function', () => {
    const itens = [
      { valor: 10.5 },
      { valor: "20,50" },
      { valor: "R$ 30,00" },
      { other: 100 } // should be 0 if pick(item) is undefined
    ];
    const pick = (item) => item.valor;
    // 10.5 + 20.5 + 30.0 + 0 = 61.0
    assert.strictEqual(sumValoresLiquidos(itens, pick), 61.0);
  });

  await t.test('handles items where pick returns null/undefined', () => {
    const itens = [
      { v: 10 },
      { v: null },
      { v: undefined },
      {}
    ];
    assert.strictEqual(sumValoresLiquidos(itens, i => i.v), 10);
  });
});
