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

// Referenzwerte aus dem offiziellen Rechner (familienportal.de/egr, Okt. 2026).
// Dessen Netto = Brutto - 102,50 € Werbungskostenpauschale - Pauschalen für SV/Steuer.
test('Abgleich mit offiziellem Rechner', () => {
  near(E.basisMonat(397.5, 0).betrag, 386, 1); // Minijob 500 € brutto
  near(E.plusMonat(397.5, 0).betrag, 193, 1);
  near(E.basisMonat(1082.5, 0).betrag, 726, 1); // 1.500 € brutto, StKl 1
  near(E.plusMonat(1082.5, 0).betrag, 363, 1);
  near(E.basisMonat(1961.5, 0).betrag, 1275, 1); // 3.000 € brutto, StKl 1
  near(E.plusMonat(1961.5, 0).betrag, 638, 1);
  near(E.basisMonat(1961.5, 1961.5 - 581.5).betrag, 378, 1); // Teilzeit-Netto 1.380 €
  near(E.plusMonat(1961.5, 1961.5 - 287.7).betrag, 187, 1); // Plus unter Basis-Mindestbetrag
  near(E.basisMonat(3100, 0).betrag, 1800, 0.01);
  near(E.plusMonat(3100, 0).betrag, 900, 0.01);
});

test('Stunden statt Prozent', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenBasis: 0, stundenPlus: 20 };
  const e = E.elternteil(p, {});
  near(e.plus.nettoNachher, 1000);
  near(e.plus.anteil, 0.5, 1e-9);
  near(e.plus.betrag, 650);
  assert.equal(e.bonusMoeglich, false); // 20 h < 24 h
  assert.equal(E.elternteil({ ...p, stundenPlus: 30 }, {}).bonusMoeglich, true);
  const ueber = E.elternteil({ ...p, stundenBasis: 36 }, {});
  assert.equal(ueber.basisErlaubt, false);
  near(E.elternteil({ ...p, nettoPlus: 1200 }, {}).plus.nettoNachher, 1200); // Override
});

test('Szenario-Validierung und Summen', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenBasis: 0, stundenPlus: 30 };
  const o = {};
  const e = E.elternteil(p, o);
  const ok = E.szenario({ p1: { basis: 12, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.equal(ok.fehler.length, 0);
  near(ok.elterngeld, 14 * 1300);
  const zuViel = E.szenario({ p1: { basis: 13, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.ok(zuViel.fehler.length > 0);
  const bonus = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, e, e, p, p);
  assert.equal(bonus.fehler.length, 0);
  const q = { ...p, stundenPlus: 20 };
  const eq = E.elternteil(q, o);
  const kein = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, eq, e, q, p);
  assert.ok(kein.fehler.some((f) => f.includes('24–32')));
});
