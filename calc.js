// Elterngeld-Rechenlogik (BEEG). Reine Funktionen, keine DOM-Zugriffe.
// Alle Werte sind Schätzungen; maßgeblich ist der Bescheid der Elterngeldstelle.
(function (root) {
  // Rechtslagen. "aktuell": BEEG für Geburten bis Oktober 2027 (gegen den offiziellen Planer geprüft).
  // "reform": Referentenentwurf vom Juli 2026, geplant für Geburten ab 1.11.2027 (noch kein Gesetz!).
  // Belegt (Ratgeber/Presse): 12 statt 14 Monate, 3 Monate je Elternteil reserviert + 6 frei (3-3-6), 330–1.900 €, 65 %.
  // ANNAHMEN (nicht belegt): Plus = halbe Beträge (165–950 €), Netto-Obergrenze 2.923 € (= 1.900 / 0,65),
  // übrige Regeln (Staffel der Ersatzrate, 2 Monate Mindestbezug, Mutterschutz zählt als Basis, Fristen) unverändert.
  const RECHT = {
    aktuell: { name: 'aktuell', NETTO_CAP: 2770, BASIS_MIN: 300, BASIS_MAX: 1800, PLUS_MIN: 150, PLUS_MAX: 900, MONTHS_PER_PARENT: 12, MONTHS_TOTAL: 14 },
    reform: { name: 'reform', NETTO_CAP: 2923, BASIS_MIN: 330, BASIS_MAX: 1900, PLUS_MIN: 165, PLUS_MAX: 950, MONTHS_PER_PARENT: 9, MONTHS_TOTAL: 12 },
  };
  const C = {
    GESCHWISTER_MIN_BASIS: 75,
    GESCHWISTER_MIN_PLUS: 37.5,
    MEHRLING_ZUSCHLAG: 300, // je weiteres Kind, Basis (Plus: Hälfte)
    BONUS_H_MIN: 24,
    BONUS_H_MAX: 32,
    BONUS_MONTHS: 4,
    BASIS_BIS_LM: 14, // Basiselterngeld nur bis zum 14. Lebensmonat
    PLUS_BIS_LM: 32, // ElterngeldPlus/Partnerschaftsbonus bis zum 32. Lebensmonat
  };

  const round2 = (x) => Math.round(x * 100) / 100;
  // Monatsbeträge werden auf volle Euro aufgerundet (so zeigt es der offizielle Planer: 1279,10 → 1.280 €).
  const aufEuro = (x) => Math.ceil(round2(x) - 1e-9);

  // Ersatzrate abhängig vom Netto vor der Geburt (gedeckelt bei 2.770 €).
  function ersatzrate(nettoVorher, R) {
    R = R || RECHT.aktuell;
    const n = Math.min(Math.max(nettoVorher, 0), R.NETTO_CAP);
    if (n < 1000) return Math.min(1, 0.67 + ((1000 - n) / 2) * 0.001);
    if (n <= 1200) return 0.67;
    if (n < 1240) return 0.67 - ((n - 1200) / 2) * 0.001;
    return 0.65;
  }

  // Basiselterngeld pro Monat (ohne Zuschläge) bei gegebenem Netto in der Elternzeit.
  function basisMonat(nettoVorher, nettoNachher, R) {
    R = R || RECHT.aktuell;
    const rate = ersatzrate(nettoVorher, R);
    const bemessung = Math.min(Math.max(nettoVorher, 0), R.NETTO_CAP);
    const diff = Math.max(0, bemessung - Math.max(0, nettoNachher));
    const roh = rate * diff;
    const betrag = Math.min(R.BASIS_MAX, Math.max(R.BASIS_MIN, roh));
    return {
      rate, bemessung, nettoNachher: Math.max(0, nettoNachher), diff,
      roh: round2(roh),
      betrag: aufEuro(betrag),
      kappung: roh < R.BASIS_MIN ? 'min' : roh > R.BASIS_MAX ? 'max' : null,
    };
  }

  // ElterngeldPlus pro Monat: höchstens die Hälfte des Basis-Betrags ohne Einkommen.
  function plusMonat(nettoVorher, nettoNachher, R) {
    R = R || RECHT.aktuell;
    const ohne = basisMonat(nettoVorher, 0, R).betrag;
    const mit = basisMonat(nettoVorher, nettoNachher, R);
    const halb = ohne / 2;
    const roh = Math.min(halb, mit.roh);
    const betrag = Math.min(R.PLUS_MAX, Math.max(R.PLUS_MIN, roh));
    return {
      rate: mit.rate, bemessung: mit.bemessung, nettoNachher: mit.nettoNachher,
      diff: mit.diff, roh: round2(roh), halbOhneEinkommen: round2(halb),
      betrag: aufEuro(betrag),
      kappung: roh < R.PLUS_MIN ? 'min' : roh > R.PLUS_MAX ? 'max' : null,
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
    return aufEuro(b);
  }

  // Monatsbeträge eines Elternteils.
  // p: { netto, stundenAlt, stundenPlus, stundenBonus, nettoPlus?, nettoBonus? }
  // In Basis-Monaten wird nicht gearbeitet (Netto 0).
  // Netto in Plus-/Bonus-Monaten = Netto × (Stunden neu / Stunden alt), außer nettoPlus/nettoBonus ist angegeben.
  // opts: { recht: 'aktuell'|'reform', geschwister, mehrlinge, bonusErlaubt (Standard true) }
  function elternteil(p, opts) {
    const R = RECHT[opts && opts.recht] || RECHT.aktuell;
    const anteil = (h) => (p.stundenAlt > 0 ? Math.min(1, Math.max(0, h) / p.stundenAlt) : 0);
    const gegeben = (x) => typeof x === 'number' && Number.isFinite(x);
    const nPlus = gegeben(p.nettoPlus) ? p.nettoPlus : p.netto * anteil(p.stundenPlus);
    const nBonus = gegeben(p.nettoBonus) ? p.nettoBonus : p.netto * anteil(p.stundenBonus);
    const b = basisMonat(p.netto, 0, R);
    const pl = plusMonat(p.netto, nPlus, R);
    const bo = plusMonat(p.netto, nBonus, R); // Bonusmonat wird wie ein Plusmonat berechnet
    const plusOhne = plusMonat(p.netto, 0, R);
    return {
      recht: R,
      bonusErlaubt: !(opts && opts.bonusErlaubt === false),
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
  // mutterschutz: Monate, die bei Elternteil 2 (Mutter) automatisch als Basis-Monate zählen. Das
  // Mutterschaftsgeld wird voll auf das Elterngeld angerechnet; diese Monate bringen daher kein
  // zusätzliches Elterngeld und gelten nicht als Einkommensverlust (Mutterschaftsgeld + Zuschuss ≈ Netto).
  function szenario(plan, e1, e2, p1, p2, mutterschutz) {
    const fehler = [];
    const ms = mutterschutz || 0;
    plan = { p1: plan.p1, p2: { ...plan.p2, basis: Math.max(plan.p2.basis, ms) } };
    const equiv = (x) => x.basis + x.plus / 2;
    // Wer Elterngeld nimmt, braucht mindestens 2 Monate (Basis oder Plus). Der offizielle Planer lehnt 1 Monat ab.
    [[plan.p1, 'Elternteil 1'], [plan.p2, 'Elternteil 2']].forEach(([pl, n]) => {
      const bezug = pl.basis + pl.plus;
      if (bezug > 0 && bezug < 2) fehler.push(`${n}: mindestens 2 Monate Elterngeld (Basis oder Plus)`);
    });
    const R = e1.recht || RECHT.aktuell;
    const proElternteil = R.name === 'reform' ? ' (3 reserviert + 6 frei)' : '';
    if (equiv(plan.p1) > R.MONTHS_PER_PARENT) fehler.push(`Elternteil 1: mehr als ${R.MONTHS_PER_PARENT} Basismonate-Äquivalent${proElternteil}`);
    if (equiv(plan.p2) > R.MONTHS_PER_PARENT) fehler.push(`Elternteil 2: mehr als ${R.MONTHS_PER_PARENT} Basismonate-Äquivalent${proElternteil}`);
    if (equiv(plan.p1) + equiv(plan.p2) > R.MONTHS_TOTAL) fehler.push(`Zusammen mehr als ${R.MONTHS_TOTAL} Basismonate-Äquivalent` + (ms ? ' (inkl. Mutterschutz-Monate der Mutter; 1 Basis = 2 Plus)' : ' (1 Basis = 2 Plus)'));
    const bonus = plan.p1.bonus + plan.p2.bonus;
    if (bonus > 0) {
      if (e1.bonusErlaubt === false) fehler.push('Partnerschaftsbonus: im Reformentwurf als entfallend angenommen');
      if (plan.p1.bonus !== plan.p2.bonus) fehler.push('Partnerschaftsbonus: beide gleich viele Monate');
      if (plan.p1.bonus > C.BONUS_MONTHS) fehler.push('Partnerschaftsbonus: max. 4 Monate');
      if (plan.p1.bonus < 2) fehler.push('Partnerschaftsbonus: mindestens 2 Monate');
      if (!e1.bonusMoeglich || !e2.bonusMoeglich) fehler.push('Partnerschaftsbonus: beide müssen 24–32 Std./Woche arbeiten');
    }

    [[plan.p1, e1, 'Elternteil 1'], [plan.p2, e2, 'Elternteil 2']].forEach(([pl, e, n]) => {
      if (pl.plus > 0 && !e.plusErlaubt) fehler.push(`${n}: in Plus-Monaten mehr als 32 Std./Woche`);
    });

    const teil = (e, pl, p, abzugBasis) => {
      pl = { ...pl, basis: pl.basis - abzugBasis }; // Mutterschutz-Monate: kein zusätzliches Elterngeld
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
    const t1 = teil(e1, plan.p1, p1, 0);
    const t2 = teil(e2, plan.p2, p2, ms);
    return {
      fehler, t1, t2, mutterschutz: ms, basis2: plan.p2.basis,
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

  // Zeitliche Abfolge in Lebensmonaten (1-basiert).
  // sc: { p1:{basis,plus,basisStart?,plusStart?}, p2:{…}, bonus, bonusStart? }; Elternteil 2 = Mutter.
  // Ohne Startwert werden die Blöcke nacheinander gelegt: Mutter-Mutterschutz in Monat 1..ms, dann ihre
  // restlichen Basis-Monate, danach Vater-Basis; Plus je nach Basis-Ende (Vater ohne Basis: parallel zur Mutter);
  // Bonus am Ende (beide gleichzeitig).
  // Rückgabe: rows (Typ je Monat: M Mutterschutz, B Basis, P Plus, K Bonus, X Überschneidung),
  // laenge, starts (wirksame Startmonate), fehler (ungültig), hinweise (nur Warnung).
  // opts.parallelBasisErlaubt: gleichzeitiges Basis in mehreren Monaten erlaubt (Ausnahmen, z. B. Mehrlinge)
  function zeitplan(sc, ms, opts) {
    ms = ms || 0;
    const parallelErlaubt = !!(opts && opts.parallelBasisErlaubt);
    if (Array.isArray(sc.p1.blocks) || Array.isArray(sc.p2.blocks)) return zeitplanBloecke(sc, ms, parallelErlaubt);
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    const st = (x, d) => (Number.isFinite(x) && x >= 1 ? Math.floor(x) : d);
    const a = { basis: n(sc.p1.basis), plus: n(sc.p1.plus) };
    const m = { basis: Math.max(n(sc.p2.basis), ms), plus: n(sc.p2.plus) };
    const bonus = n(sc.bonus);
    const mRest = Math.max(0, m.basis - ms);

    const mStartB = st(sc.p2.basisStart, ms + 1);
    const mEndB = mRest > 0 ? mStartB + mRest - 1 : ms;
    const aStartB = st(sc.p1.basisStart, mEndB + 1);
    const aEndB = a.basis > 0 ? aStartB + a.basis - 1 : 0;
    const mStartP = st(sc.p2.plusStart, mEndB + 1);
    const aStartP = st(sc.p1.plusStart, a.basis > 0 ? aEndB + 1 : mStartP);
    const mEndP = m.plus > 0 ? mStartP + m.plus - 1 : 0;
    const aEndP = a.plus > 0 ? aStartP + a.plus - 1 : 0;
    const bonusStart = st(sc.bonusStart, Math.max(mEndB, aEndB, mEndP, aEndP) + 1);

    const rows = { p1: [], p2: [] };
    const konflikt = { p1: false, p2: false };
    const put = (who, from, count, typ) => {
      for (let i = 0; i < count; i++) {
        const mo = from + i;
        if (rows[who][mo]) { rows[who][mo] = 'X'; konflikt[who] = true; } else rows[who][mo] = typ;
      }
    };
    put('p2', 1, ms, 'M');
    put('p2', mStartB, mRest, 'B');
    put('p1', aStartB, a.basis, 'B');
    put('p2', mStartP, m.plus, 'P');
    put('p1', aStartP, a.plus, 'P');
    put('p1', bonusStart, bonus, 'K');
    put('p2', bonusStart, bonus, 'K');

    return auswerten(rows, konflikt, { p1: { basis: aStartB, plus: aStartP }, p2: { basis: mStartB, plus: mStartP }, bonus: bonusStart }, parallelErlaubt);
  }

  // Prüft einen belegten Zeitplan (Überschneidung, Fristen, Parallelbezug) und liefert das Ergebnis von zeitplan().
  function auswerten(rows, konflikt, starts, parallelErlaubt) {
    const fehler = [], hinweise = [];
    if (konflikt.p1) fehler.push('Elternteil 1: Zeiträume überschneiden sich');
    if (konflikt.p2) fehler.push('Elternteil 2: Zeiträume überschneiden sich');
    let spaetB = false, spaetP = false, last = 0, parallel = 0;
    ['p1', 'p2'].forEach((w) => rows[w].forEach((t, mo) => {
      if (!t) return;
      last = Math.max(last, mo);
      if ((t === 'B' || t === 'M') && mo > C.BASIS_BIS_LM) spaetB = true;
      if ((t === 'P' || t === 'K') && mo > C.PLUS_BIS_LM) spaetP = true;
    }));
    for (let mo = 1; mo <= 12; mo++) {
      const basisT = (t) => t === 'B' || t === 'M';
      if (basisT(rows.p1[mo]) && basisT(rows.p2[mo])) parallel++;
    }
    if (spaetB) fehler.push(`Basiselterngeld nur bis zum ${C.BASIS_BIS_LM}. Lebensmonat`);
    if (spaetP) fehler.push(`Plus/Bonus nur bis zum ${C.PLUS_BIS_LM}. Lebensmonat`);
    if (parallel > 1) {
      // Offizieller Planer sperrt gleichzeitiges Basis nach dem ersten gemeinsamen Monat (1.–12. Lebensmonat);
      // der Mutterschutz-Monat der Mutter zählt als Basis. Plus parallel bleibt erlaubt.
      const text = `Basiselterngeld bei beiden gleichzeitig in ${parallel} Monaten: im 1.–12. Lebensmonat nur für 1 Monat möglich (Mutterschutz zählt mit).`;
      if (parallelErlaubt) hinweise.push(text + ' Ausnahme (z. B. Mehrlinge) angenommen.');
      else fehler.push(text);
    }

    return {
      rows, laenge: Math.max(C.BASIS_BIS_LM, last), ende: last,
      starts,
      fehler, hinweise,
    };
  }

  // Zeitplan aus frei eintragbaren Blöcken: sc.p1.blocks / sc.p2.blocks = [{ typ: 'basis'|'plus', start?, n }].
  // Ohne start folgt ein Block direkt auf den vorigen desselben Elternteils. Die Mutter beginnt hinter dem
  // Mutterschutz (Monat 1..ms, immer Basis); der Vater beginnt hinter dem letzten Basis-Block der Mutter.
  // Bonus (beide gleichzeitig) beginnt ohne bonusStart hinter allem anderen.
  // Rückgabe wie zeitplan(), dazu starts.blocks = wirksame Startmonate je Block (gleiche Reihenfolge wie die Eingabe).
  function zeitplanBloecke(sc, ms, parallelErlaubt) {
    const n = (x) => Math.max(0, Math.floor(Number(x) || 0));
    const st = (x) => (Number.isFinite(x) && x >= 1 ? Math.floor(x) : undefined);
    const lies = (p) => (Array.isArray(p.blocks) ? p.blocks : []).map((b) => ({ typ: b && b.typ === 'plus' ? 'plus' : 'basis', start: st(b && b.start), n: n(b && b.n) }));
    const lege = (liste, cursor) => liste.map((b) => {
      const start = b.start || cursor;
      cursor = start + b.n;
      return { ...b, start };
    });
    const m = lege(lies(sc.p2), ms + 1);
    const mEndBasis = m.reduce((e, b) => (b.typ === 'basis' && b.n > 0 ? Math.max(e, b.start + b.n - 1) : e), ms);
    const a = lege(lies(sc.p1), mEndBasis + 1);
    const ende = (liste) => liste.reduce((e, b) => (b.n > 0 ? Math.max(e, b.start + b.n - 1) : e), 0);
    const bonus = n(sc.bonus);
    const bonusStart = st(sc.bonusStart) || Math.max(ms, ende(m), ende(a)) + 1;

    const rows = { p1: [], p2: [] };
    const konflikt = { p1: false, p2: false };
    const put = (who, from, count, typ) => {
      for (let i = 0; i < count; i++) {
        const mo = from + i;
        if (rows[who][mo]) { rows[who][mo] = 'X'; konflikt[who] = true; } else rows[who][mo] = typ;
      }
    };
    put('p2', 1, ms, 'M');
    m.forEach((b) => put('p2', b.start, b.n, b.typ === 'plus' ? 'P' : 'B'));
    a.forEach((b) => put('p1', b.start, b.n, b.typ === 'plus' ? 'P' : 'B'));
    put('p1', bonusStart, bonus, 'K');
    put('p2', bonusStart, bonus, 'K');
    return auswerten(rows, konflikt, { blocks: { p1: a.map((b) => b.start), p2: m.map((b) => b.start) }, bonus: bonusStart }, parallelErlaubt);
  }

  const api = { C, RECHT, ersatzrate, basisMonat, plusMonat, zuschlaege, elternteil, szenario, zeitplan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Elterngeld = api;
})(typeof self !== 'undefined' ? self : this);
