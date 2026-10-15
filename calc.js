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
  // p: { netto, stundenAlt, stundenPlus, stundenBonus, nettoPlus?, nettoBonus? }
  // In Basis-Monaten wird nicht gearbeitet (Netto 0).
  // Netto in Plus-/Bonus-Monaten = Netto × (Stunden neu / Stunden alt), außer nettoPlus/nettoBonus ist angegeben.
  function elternteil(p, opts) {
    const anteil = (h) => (p.stundenAlt > 0 ? Math.min(1, Math.max(0, h) / p.stundenAlt) : 0);
    const gegeben = (x) => typeof x === 'number' && Number.isFinite(x);
    const nPlus = gegeben(p.nettoPlus) ? p.nettoPlus : p.netto * anteil(p.stundenPlus);
    const nBonus = gegeben(p.nettoBonus) ? p.nettoBonus : p.netto * anteil(p.stundenBonus);
    const b = basisMonat(p.netto, 0);
    const pl = plusMonat(p.netto, nPlus);
    const bo = plusMonat(p.netto, nBonus); // Bonusmonat wird wie ein Plusmonat berechnet
    const plusOhne = plusMonat(p.netto, 0);
    return {
      basis: { ...b, mitZuschlag: zuschlaege(b.betrag, 'basis', opts) },
      // Höchstbeträge ohne Arbeit (Referenz für den Verlust beim Elterngeld)
      ohneArbeit: {
        basis: zuschlaege(b.betrag, 'basis', opts),
        plus: zuschlaege(plusOhne.betrag, 'plus', opts),
      },
      plus: { ...pl, nettoNachher: nPlus, anteil: anteil(p.stundenPlus), mitZuschlag: zuschlaege(pl.betrag, 'plus', opts) },
      bonus: { ...bo, nettoNachher: nBonus, anteil: anteil(p.stundenBonus), mitZuschlag: zuschlaege(bo.betrag, 'plus', opts) },
      // Elterngeld nur bis 32 Wochenstunden; Partnerschaftsbonus nur bei 24–32 Wochenstunden
      plusErlaubt: p.stundenPlus <= C.BONUS_H_MAX,
      bonusMoeglich: p.stundenBonus >= C.BONUS_H_MIN && p.stundenBonus <= C.BONUS_H_MAX,
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
      if (plan.p1.bonus < 2) fehler.push('Partnerschaftsbonus: mindestens 2 Monate');
      if (!e1.bonusMoeglich || !e2.bonusMoeglich) fehler.push('Partnerschaftsbonus: beide müssen 24–32 Std./Woche arbeiten');
    }

    [[plan.p1, e1, 'Elternteil 1'], [plan.p2, e2, 'Elternteil 2']].forEach(([pl, e, n]) => {
      if (pl.plus > 0 && !e.plusErlaubt) fehler.push(`${n}: in Plus-Monaten mehr als 32 Std./Woche`);
    });

    const teil = (e, pl, p) => {
      const gBasis = pl.basis * e.basis.mitZuschlag;
      const gPlus = pl.plus * e.plus.mitZuschlag;
      const gBonus = pl.bonus * e.bonus.mitZuschlag;
      const elterngeld = gBasis + gPlus + gBonus;
      const lohn = pl.plus * e.plus.nettoNachher + pl.bonus * e.bonus.nettoNachher;
      const monate = pl.basis + pl.plus + pl.bonus;
      const referenz = monate * p.netto; // Netto ohne Elternzeit in denselben Monaten
      // Elterngeld, das ohne Arbeit für dieselben Monate gezahlt würde
      const maximum = pl.basis * e.ohneArbeit.basis + (pl.plus + pl.bonus) * e.ohneArbeit.plus;
      return {
        elterngeld: round2(elterngeld), lohn: round2(lohn), monate,
        gesamt: round2(elterngeld + lohn), referenz: round2(referenz),
        verlust: round2(referenz - elterngeld - lohn),
        maximum: round2(maximum), verlustElterngeld: round2(maximum - elterngeld),
      };
    };
    const t1 = teil(e1, plan.p1, p1);
    const t2 = teil(e2, plan.p2, p2);
    return {
      fehler, t1, t2,
      monate: t1.monate + t2.monate,
      elterngeld: round2(t1.elterngeld + t2.elterngeld),
      lohn: round2(t1.lohn + t2.lohn),
      gesamt: round2(t1.gesamt + t2.gesamt),
      referenz: round2(t1.referenz + t2.referenz),
      verlust: round2(t1.verlust + t2.verlust),
      maximum: round2(t1.maximum + t2.maximum),
      verlustElterngeld: round2(t1.verlustElterngeld + t2.verlustElterngeld),
    };
  }

  const api = { C, ersatzrate, basisMonat, plusMonat, zuschlaege, elternteil, szenario };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Elterngeld = api;
})(typeof self !== 'undefined' ? self : this);
