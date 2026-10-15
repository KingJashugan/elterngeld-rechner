const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('./calc.js');

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('Ersatzrate', () => {
  near(E.ersatzrate(2000), 0.65, 1e-9);
  near(E.ersatzrate(1000), 0.67, 1e-9);
  near(E.ersatzrate(1220), 0.66, 1e-9);
  near(E.ersatzrate(800), 0.77, 1e-9);
  near(E.ersatzrate(100), 1, 1e-9);
});

test('Basiselterngeld ohne Einkommen', () => {
  near(E.basisMonat(2000, 0).betrag, 1300);
  near(E.basisMonat(1000, 0).betrag, 670);
  near(E.basisMonat(800, 0).betrag, 616);
  near(E.basisMonat(3500, 0).betrag, 1800); // Höchstbetrag
  near(E.basisMonat(200, 0).betrag, 300); // Mindestbetrag
});

test('Basiselterngeld mit Teilzeit-Kürzung', () => {
  near(E.basisMonat(2000, 1000).betrag, 650);
  near(E.basisMonat(2000, 2000).betrag, 300); // nur Mindestbetrag
});

test('ElterngeldPlus = max. Hälfte', () => {
  near(E.plusMonat(2000, 0).betrag, 650);
  near(E.plusMonat(2000, 1000).betrag, 650);
  near(E.plusMonat(2000, 1500).betrag, 325);
  near(E.plusMonat(3500, 0).betrag, 900);
  near(E.plusMonat(2000, 2000).betrag, 150);
});

test('Zuschläge', () => {
  near(E.zuschlaege(1000, 'basis', { geschwister: true }), 1100);
  near(E.zuschlaege(300, 'basis', { geschwister: true }), 375);
  near(E.zuschlaege(500, 'plus', { mehrlinge: 1 }), 650);
});

test('Szenario-Validierung und Summen', () => {
  const p = { netto: 2000, arbeitBasis: 0, arbeitPlus: 0.5, stunden: 30 };
  const o = {};
  const e = E.elternteil(p, o);
  const ok = E.szenario({ p1: { basis: 12, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.equal(ok.fehler.length, 0);
  near(ok.elterngeld, 14 * 1300);
  const zuViel = E.szenario({ p1: { basis: 13, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.ok(zuViel.fehler.length > 0);
  const bonus = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, e, e, p, p);
  assert.equal(bonus.fehler.length, 0);
  const q = { ...p, stunden: 40 };
  const eq = E.elternteil(q, o);
  const kein = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, eq, e, q, p);
  assert.ok(kein.fehler.some((f) => f.includes('24–32')));
});
