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

test('Stunden statt Prozent, Plus und Bonus getrennt', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenPlus: 20, stundenBonus: 30 };
  const e = E.elternteil(p, {});
  near(e.basis.betrag, 1300); // Basis: immer ohne Arbeit
  near(e.plus.nettoNachher, 1000);
  near(e.plus.anteil, 0.5, 1e-9);
  near(e.plus.betrag, 650);
  near(e.bonus.nettoNachher, 1500); // Bonus mit eigenen Stunden
  near(e.bonus.betrag, 325);
  assert.equal(e.bonusMoeglich, true); // Bonus-Stunden 30 h
  assert.equal(E.elternteil({ ...p, stundenBonus: 20 }, {}).bonusMoeglich, false);
  assert.equal(E.elternteil({ ...p, stundenBonus: 36 }, {}).bonusMoeglich, false);
  assert.equal(E.elternteil({ ...p, stundenPlus: 36 }, {}).plusErlaubt, false);
  near(E.elternteil({ ...p, nettoPlus: 1200 }, {}).plus.nettoNachher, 1200); // Override
  near(E.elternteil({ ...p, nettoBonus: 1200 }, {}).bonus.nettoNachher, 1200);
});

test('Szenario-Validierung und Summen', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenPlus: 30, stundenBonus: 30 };
  const o = {};
  const e = E.elternteil(p, o);
  const ok = E.szenario({ p1: { basis: 12, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.equal(ok.fehler.length, 0);
  near(ok.elterngeld, 14 * 1300);
  const zuViel = E.szenario({ p1: { basis: 13, plus: 0, bonus: 0 }, p2: { basis: 2, plus: 0, bonus: 0 } }, e, e, p, p);
  assert.ok(zuViel.fehler.length > 0);
  const bonus = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, e, e, p, p);
  assert.equal(bonus.fehler.length, 0);
  // Verlust beim Elterngeld: Maximum ohne Arbeit minus tatsächliches Elterngeld
  const plusTz = E.szenario({ p1: { basis: 0, plus: 10, bonus: 0 }, p2: { basis: 0, plus: 0, bonus: 0 } }, e, e, p, p);
  near(plusTz.maximum, 10 * 650);
  near(plusTz.elterngeld, 10 * E.plusMonat(2000, 2000 * 0.75).betrag);
  near(plusTz.verlustElterngeld, plusTz.maximum - plusTz.elterngeld);
  near(ok.verlustElterngeld, 0); // Basis ohne Arbeit = Maximum
  const einMonatBonus = E.szenario({ p1: { basis: 0, plus: 0, bonus: 1 }, p2: { basis: 0, plus: 0, bonus: 1 } }, e, e, p, p);
  assert.ok(einMonatBonus.fehler.some((f) => f.includes('mindestens 2')));
  const q = { ...p, stundenBonus: 20 };
  const eq = E.elternteil(q, o);
  const kein = E.szenario({ p1: { basis: 0, plus: 14, bonus: 4 }, p2: { basis: 0, plus: 14, bonus: 4 } }, eq, e, q, p);
  assert.ok(kein.fehler.some((f) => f.includes('24–32')));
});

test('Mutterschutz: 2 Monate zählen als Basis der Mutter, ohne zusätzliches Elterngeld', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenPlus: 20, stundenBonus: 28 };
  const e = E.elternteil(p, {});
  const z = (basis, plus, bonus) => ({ basis, plus, bonus: bonus || 0 });
  // Mutter 12 Basis (davon 2 Mutterschutz) + Vater 2 Basis: nur 10 + 2 Monate Elterngeld
  const r = E.szenario({ p1: z(2, 0), p2: z(12, 0) }, e, e, p, p, 2);
  assert.equal(r.fehler.length, 0);
  near(r.t2.elterngeld, 10 * 1300);
  assert.equal(r.t2.monate, 10);
  near(r.elterngeld, 12 * 1300);
  near(r.verlustElterngeld, 0);
  // Mutter ohne eigene Basis-Monate: 2 Mutterschutz-Monate werden trotzdem verbraucht
  const nur = E.szenario({ p1: z(12, 0), p2: z(0, 0) }, e, e, p, p, 2);
  assert.equal(nur.basis2, 2);
  assert.equal(nur.fehler.length, 0); // 12 + 2 = 14
  const zuViel = E.szenario({ p1: z(13, 0), p2: z(0, 0) }, e, e, p, p, 2);
  assert.ok(zuViel.fehler.length > 0); // 13 + 2 > 14
  // Mutter 2 Basis + 10 Plus (= 7) und Vater 14 Plus (= 7): genau 14
  const ok = E.szenario({ p1: z(0, 14), p2: z(0, 10) }, e, e, p, p, 2);
  assert.equal(ok.fehler.length, 0);
  // ohne Mutterschutz-Option bleibt alles beim Alten
  const alt = E.szenario({ p1: z(2, 0), p2: z(12, 0) }, e, e, p, p);
  near(alt.t2.elterngeld, 12 * 1300);
});

test('Zeitplan: automatische Anordnung', () => {
  const sc = (p1, p2, bonus, extra) => ({ p1, p2, bonus: bonus || 0, ...extra });
  const typ = (zp, who, from, to) => Array.from({ length: to - from + 1 }, (_, i) => zp.rows[who][from + i] || '.').join('');
  // Mutter 12 (2 Mutterschutz), Vater 2: Mutter 1-12, Vater 13-14
  let zp = E.zeitplan(sc({ basis: 2, plus: 0 }, { basis: 12, plus: 0 }), 2);
  assert.equal(typ(zp, 'p2', 1, 14), 'MMBBBBBBBBBB..');
  assert.equal(typ(zp, 'p1', 1, 14), '............BB');
  assert.equal(zp.fehler.length, 0);
  assert.equal(zp.laenge, 14);
  // Mutter 2 + 12 Plus, Vater 12 Plus: Plus parallel ab Monat 3; Bonus danach
  zp = E.zeitplan(sc({ basis: 0, plus: 12 }, { basis: 0, plus: 12 }, 4), 2);
  assert.equal(typ(zp, 'p2', 1, 18), 'MMPPPPPPPPPPPPKKKK'.slice(0, 18));
  assert.equal(typ(zp, 'p1', 3, 18), 'PPPPPPPPPPPPKKKK');
  assert.equal(zp.starts.bonus, 15);
  assert.equal(zp.laenge, 18);
  assert.equal(zp.fehler.length, 0);
});

test('Zeitplan: Regler-Startwerte, Überschneidung, Fristen, Parallelbezug', () => {
  const base = { p1: { basis: 2, plus: 0 }, p2: { basis: 12, plus: 0 }, bonus: 0 };
  // Vater-Basis ab Monat 20: nach dem 14. Lebensmonat nicht mehr möglich
  let zp = E.zeitplan({ ...base, p1: { basis: 2, plus: 0, basisStart: 20 } }, 2);
  assert.ok(zp.fehler.some((f) => f.includes('14. Lebensmonat')));
  // Plus nach dem 32. Lebensmonat
  zp = E.zeitplan({ p1: { basis: 0, plus: 4, plusStart: 31 }, p2: { basis: 0, plus: 0 }, bonus: 0 }, 2);
  assert.ok(zp.fehler.some((f) => f.includes('32. Lebensmonat')));
  // Überschneidung: Plus der Mutter über ihrem Basis-Block
  zp = E.zeitplan({ p1: { basis: 0, plus: 0 }, p2: { basis: 6, plus: 4, plusStart: 5 }, bonus: 0 }, 2);
  assert.ok(zp.fehler.some((f) => f.includes('überschneiden')));
  // Vater-Basis parallel zur Mutter in 3 Monaten: nur Hinweis, kein Fehler
  zp = E.zeitplan({ p1: { basis: 3, plus: 0, basisStart: 3 }, p2: { basis: 6, plus: 0 }, bonus: 0 }, 2);
  assert.ok(zp.fehler.some((f) => f.includes('nur für 1 Monat'))); // wie im offiziellen Planer gesperrt
  zp = E.zeitplan({ p1: { basis: 3, plus: 0, basisStart: 3 }, p2: { basis: 6, plus: 0 }, bonus: 0 }, 2, { parallelBasisErlaubt: true });
  assert.equal(zp.fehler.length, 0); // Ausnahme (z. B. Mehrlinge): nur Hinweis
  assert.ok(zp.hinweise.length > 0);
  // Plus parallel zum anderen Elternteil bleibt erlaubt
  zp = E.zeitplan({ p1: { basis: 0, plus: 6, plusStart: 3 }, p2: { basis: 0, plus: 6 }, bonus: 0 }, 2);
  assert.equal(zp.fehler.length, 0);
  assert.equal(zp.hinweise.length, 0);
  // 1 Monat parallel (Mutterschutz-Monat 2 + Vater-Basis ab Monat 2) ist erlaubt
  zp = E.zeitplan({ p1: { basis: 1, plus: 0, basisStart: 2 }, p2: { basis: 2, plus: 0 }, bonus: 0 }, 2);
  assert.equal(zp.hinweise.length, 0);
});

test('Mindestens 2 Monate je Elternteil (wie im offiziellen Planer)', () => {
  const p = { netto: 2000, stundenAlt: 40, stundenPlus: 20, stundenBonus: 28 };
  const e = E.elternteil(p, {});
  const z = (basis, plus) => ({ basis, plus, bonus: 0 });
  // Mutter 12 (inkl. Mutterschutz) + Vater 1 Basis-Monat: ungültig
  let r = E.szenario({ p1: z(1, 0), p2: z(12, 0) }, e, e, p, p, 2);
  assert.ok(r.fehler.some((f) => f.includes('mindestens 2 Monate')));
  // Vater 1 Plus-Monat: ungültig; 2 Plus-Monate neben Mutter 12: gültig (offizieller Planer)
  r = E.szenario({ p1: z(0, 1), p2: z(12, 0) }, e, e, p, p, 2);
  assert.ok(r.fehler.some((f) => f.includes('mindestens 2 Monate')));
  r = E.szenario({ p1: z(0, 2), p2: z(12, 0) }, e, e, p, p, 2);
  assert.equal(r.fehler.length, 0);
  // Mutter nur Mutterschutz (2 Monate) + Vater 12: gültig
  r = E.szenario({ p1: z(12, 0), p2: z(0, 0) }, e, e, p, p, 2);
  assert.equal(r.fehler.length, 0);
  // Ohne Mutterschutz: Mutter mit nur 1 Plus-Monat ist ungültig
  r = E.szenario({ p1: z(2, 0), p2: z(0, 1) }, e, e, p, p, 0);
  assert.ok(r.fehler.some((f) => f.includes('Elternteil 2')));
});

// Offizieller Planer (familienportal.de/egr, Okt. 2026, Geburt 05/2027, RLP): Mutter 3.000 € brutto, Vater 3.800 € brutto,
// Mutter 12 Monate (2 Mutterschutz), Vater 2 Monate Basis: Mutter 12.800 €, Vater 3.140 €, zusammen 15.940 €.
// Netto-Werte rückgerechnet aus den angezeigten Beträgen (1279,10 € bzw. 1569,26 € bei 65 %).
test('Abgleich Zwei-Personen-Planung mit offiziellem Planer (Aufrunden auf volle Euro)', () => {
  const mutter = { netto: 1279.1 / 0.65, stundenAlt: 40, stundenPlus: 0, stundenBonus: 0 };
  const vater = { netto: 1569.26 / 0.65, stundenAlt: 40, stundenPlus: 0, stundenBonus: 0 };
  const em = E.elternteil(mutter, {}), ev = E.elternteil(vater, {});
  near(em.basis.betrag, 1280, 0.001);
  near(ev.basis.betrag, 1570, 0.001);
  const r = E.szenario({ p1: { basis: 2, plus: 0, bonus: 0 }, p2: { basis: 12, plus: 0, bonus: 0 } }, ev, em, vater, mutter, 2);
  assert.equal(r.fehler.length, 0);
  near(r.t2.elterngeld, 12800, 0.001);
  near(r.t1.elterngeld, 3140, 0.001);
  near(r.elterngeld, 15940, 0.001);
});
