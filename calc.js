// Elterngeld-Rechenlogik (BEEG). Reine Funktionen, keine DOM-Zugriffe.
// Alle Werte sind Schätzungen; maßgeblich ist der Bescheid der Elterngeldstelle.
(function (root) {
  const C = {
    NETTO_CAP: 2770, // max. berücksichtigtes Netto vor Geburt
    BASIS_MIN: 300,
    BASIS_MAX: 1800,
    PLUS_MIN: 150,
    PLUS_MAX: 900,
    GESCHWISTER_MIN_BASIS: 75,
    GESCHWISTER_MIN_PLUS: 37.5,
    MEHRLING_ZUSCHLAG: 300, // je weiteres Kind, Basis (Plus: Hälfte)
    BONUS_H_MIN: 24,
    BONUS_H_MAX: 32,
    BONUS_MONTHS: 4,
    MONTHS_BASE: 12,
    MONTHS_TOTAL: 14,
  };

  const round2 = (x) => Math.round(x * 100) / 100;

  // Ersatzrate abhängig vom Netto vor der Geburt (gedeckelt bei 2.770 €).
  function ersatzrate(nettoVorher) {
    const n = Math.min(Math.max(nettoVorher, 0), C.NETTO_CAP);
    if (n < 1000) return Math.min(1, 0.67 + ((1000 - n) / 2) * 0.001);
    if (n <= 1200) return 0.67;
    if (n < 1240) return 0.67 - ((n - 1200) / 2) * 0.001;
    return 0.65;
  }

  // Basiselterngeld pro Monat (ohne Zuschläge) bei gegebenem Netto in der Elternzeit.
  function basisMonat(nettoVorher, nettoNachher) {
    const rate = ersatzrate(nettoVorher);
    const bemessung = Math.min(Math.max(nettoVorher, 0), C.NETTO_CAP);
    const diff = Math.max(0, bemessung - Math.max(0, nettoNachher));
    const roh = rate * diff;
    const betrag = Math.min(C.BASIS_MAX, Math.max(C.BASIS_MIN, roh));
    return {
      rate, bemessung, nettoNachher: Math.max(0, nettoNachher), diff,
      roh: round2(roh),
      betrag: round2(betrag),
      kappung: roh < C.BASIS_MIN ? 'min' : roh > C.BASIS_MAX ? 'max' : null,
    };
  }

  // ElterngeldPlus pro Monat: höchstens die Hälfte des Basis-Betrags ohne Einkommen.
  function plusMonat(nettoVorher, nettoNachher) {
    const ohne = basisMonat(nettoVorher, 0).betrag;
    const mit = basisMonat(nettoVorher, nettoNachher);
    const halb = ohne / 2;
    const roh = Math.min(halb, mit.roh);
    const betrag = Math.min(C.PLUS_MAX, Math.max(C.PLUS_MIN, roh));
    return {
      rate: mit.rate, bemessung: mit.bemessung, nettoNachher: mit.nettoNachher,
      diff: mit.diff, roh: round2(roh), halbOhneEinkommen: round2(halb),
      betrag: round2(betrag),
      kappung: roh < C.PLUS_MIN ? 'min' : roh > C.PLUS_MAX ? 'max' : null,
    };
  }

  // Zuschläge: Geschwisterbonus (+10 %, mind. 75 €/37,50 €), Mehrlinge (+300 €/150 € je weiteres Kind).
  function zuschlaege(betrag, art, opts) {
    let b = betrag;
    const plus = art !== 'basis';
    if (opts && opts.geschwister) {
      b += Math.max(betrag * 0.1, plus ? C.GESCHWISTER_MIN_PLUS : C.GESCHWISTER_MIN_BASIS);
    }
    if (opts && opts.mehrlinge > 0) {
      b += opts.mehrlinge * (plus ? C.MEHRLING_ZUSCHLAG / 2 : C.MEHRLING_ZUSCHLAG);
    }
    return round2(b);
  }

  // Monatsbeträge eines Elternteils.
  // p: { netto, stundenAlt, stundenBasis, stundenPlus, nettoBasis?, nettoPlus? }
  // Netto in der Elternzeit = Netto × (Stunden neu / Stunden alt), außer nettoBasis/nettoPlus ist angegeben.
  function elternteil(p, opts) {
    const anteil = (h) => (p.stundenAlt > 0 ? Math.min(1, Math.max(0, h) / p.stundenAlt) : 0);
    const gegeben = (x) => typeof x === 'number' && Number.isFinite(x);
    const nBasis = gegeben(p.nettoBasis) ? p.nettoBasis : p.netto * anteil(p.stundenBasis);
    const nPlus = gegeben(p.nettoPlus) ? p.nettoPlus : p.netto * anteil(p.stundenPlus);
    const b = basisMonat(p.netto, nBasis);
    const pl = plusMonat(p.netto, nPlus);
    return {
      basis: { ...b, nettoNachher: nBasis, anteil: anteil(p.stundenBasis), mitZuschlag: zuschlaege(b.betrag, 'basis', opts) },
      plus: { ...pl, nettoNachher: nPlus, anteil: anteil(p.stundenPlus), mitZuschlag: zuschlaege(pl.betrag, 'plus', opts) },
      // Elterngeld nur bis 32 Wochenstunden; Bonusmonat wird wie ein Plusmonat berechnet
      basisErlaubt: p.stundenBasis <= C.BONUS_H_MAX,
      plusErlaubt: p.stundenPlus <= C.BONUS_H_MAX,
      bonusMoeglich: p.stundenPlus >= C.BONUS_H_MIN && p.stundenPlus <= C.BONUS_H_MAX,
    };
  }

  // Szenario: { p1:{basis,plus,bonus}, p2:{basis,plus,bonus} } (Monate).
  // Gültig: je Elternteil Basis + Plus/2 <= 12; Summe <= 14; Bonus nur mit 24–32 h beider.
  function szenario(plan, e1, e2, p1, p2) {
    const fehler = [];
    const equiv = (x) => x.basis + x.plus / 2;
    if (equiv(plan.p1) > C.MONTHS_BASE) fehler.push('Elternteil 1: mehr als 12 Basismonate-Äquivalent');
    if (equiv(plan.p2) > C.MONTHS_BASE) fehler.push('Elternteil 2: mehr als 12 Basismonate-Äquivalent');
    if (equiv(plan.p1) + equiv(plan.p2) > C.MONTHS_TOTAL) fehler.push('Zusammen mehr als 14 Basismonate-Äquivalent');
    const bonus = plan.p1.bonus + plan.p2.bonus;
    if (bonus > 0) {
      if (plan.p1.bonus !== plan.p2.bonus) fehler.push('Partnerschaftsbonus: beide gleich viele Monate');
      if (plan.p1.bonus > C.BONUS_MONTHS) fehler.push('Partnerschaftsbonus: max. 4 Monate');
      if (!e1.bonusMoeglich || !e2.bonusMoeglich) fehler.push('Partnerschaftsbonus: beide müssen 24–32 Std./Woche arbeiten');
    }

    [[plan.p1, e1, 'Elternteil 1'], [plan.p2, e2, 'Elternteil 2']].forEach(([pl, e, n]) => {
      if (pl.basis > 0 && !e.basisErlaubt) fehler.push(`${n}: in Basis-Monaten mehr als 32 Std./Woche`);
      if (pl.plus + pl.bonus > 0 && !e.plusErlaubt) fehler.push(`${n}: in Plus-/Bonus-Monaten mehr als 32 Std./Woche`);
    });

    const teil = (e, pl, p) => {
      const gBasis = pl.basis * e.basis.mitZuschlag;
      const gPlus = pl.plus * e.plus.mitZuschlag;
      const gBonus = pl.bonus * e.plus.mitZuschlag;
      const elterngeld = gBasis + gPlus + gBonus;
      const lohn = pl.basis * e.basis.nettoNachher + (pl.plus + pl.bonus) * e.plus.nettoNachher;
      const monate = pl.basis + pl.plus + pl.bonus;
      const referenz = monate * p.netto; // Netto ohne Elternzeit in denselben Monaten
      return {
        elterngeld: round2(elterngeld), lohn: round2(lohn), monate,
        gesamt: round2(elterngeld + lohn), referenz: round2(referenz),
        verlust: round2(referenz - elterngeld - lohn),
      };
    };
    const t1 = teil(e1, plan.p1, p1);
    const t2 = teil(e2, plan.p2, p2);
    return {
      fehler, t1, t2,
      elterngeld: round2(t1.elterngeld + t2.elterngeld),
      lohn: round2(t1.lohn + t2.lohn),
      gesamt: round2(t1.gesamt + t2.gesamt),
      referenz: round2(t1.referenz + t2.referenz),
      verlust: round2(t1.verlust + t2.verlust),
    };
  }

  // Standard-Szenarien zum Vergleich.
  function standardPlaene() {
    const z = (b, p, bo) => ({ basis: b, plus: p, bonus: bo || 0 });
    const basisPlaene = [
      { id: 'A', name: '12 + 2 Basis (Elternteil 1 lang)', p1: z(12, 0), p2: z(2, 0) },
      { id: 'B', name: '12 + 2 Basis (Elternteil 2 lang)', p1: z(2, 0), p2: z(12, 0) },
      { id: 'C', name: '7 + 7 Basis', p1: z(7, 0), p2: z(7, 0) },
      { id: 'D', name: 'ElterngeldPlus: 24 + 4 Monate', p1: z(0, 24), p2: z(0, 4) },
      { id: 'E', name: 'ElterngeldPlus: 14 + 14 Monate', p1: z(0, 14), p2: z(0, 14) },
    ];
    const mitBonus = basisPlaene.map((s) => ({
      id: s.id + '+', name: s.name + ' + Partnerschaftsbonus',
      p1: { ...s.p1, bonus: C.BONUS_MONTHS }, p2: { ...s.p2, bonus: C.BONUS_MONTHS },
    }));
    return basisPlaene.concat(mitBonus);
  }

  const api = { C, ersatzrate, basisMonat, plusMonat, zuschlaege, elternteil, szenario, standardPlaene };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Elterngeld = api;
})(typeof self !== 'undefined' ? self : this);
