(function () {
  const E = window.Elterngeld;
  const eur = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const pct = (x) => (x * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function readParent(id) {
    const el = $('#' + id);
    return {
      name: $('.name', el).value.trim() || id,
      netto: Math.max(0, parseFloat($('.netto', el).value) || 0),
      stundenAlt: Math.max(1, parseFloat($('.stunden-alt', el).value) || 0),
      stundenPlus: Math.max(0, parseFloat($('.stunden-plus', el).value) || 0),
      stundenBonus: Math.max(0, parseFloat($('.stunden-bonus', el).value) || 0),
      nettoPlus: optNum($('.netto-plus', el)),
      nettoBonus: optNum($('.netto-bonus', el)),
    };
  }

  function optNum(input) {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? Math.max(0, v) : undefined;
  }

  function monatBlock(p, e) {
    const row = (k, v, cls) => `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd>`;
    const kapp = (k) => (k === 'min' ? ' (Mindestbetrag)' : k === 'max' ? ' (Höchstbetrag)' : '');
    const b = e.basis;
    const h = (x) => x.toLocaleString('de-DE');
    const effekt = (m, netto) => row('Haushalts-Effekt / Monat', eur2(m + netto - p.netto), m + netto - p.netto < 0 ? 'neg' : '');
    const plusBlock = (titel, x, label) => `
      <p class="sub">${titel}</p><dl>
      ${row('Netto in Elternzeit', eur2(x.nettoNachher))}
      ${row('Max. (½ Basis ohne Einkommen)', eur2(x.halbOhneEinkommen))}
      ${row('Anteil aus Einkommensausfall', eur2(Math.round(x.rate * x.diff * 100) / 100))}
      ${row(label + ' / Monat' + kapp(x.kappung), eur2(x.mitZuschlag), 'ok')}
      ${effekt(x.mitZuschlag, x.nettoNachher)}
      </dl>`;
    return `<div class="card"><h3>${esc(p.name)}</h3><dl>
      ${row('Netto vor Geburt', eur2(p.netto))}
      ${row('Berücksichtigt (max. 2.770 €)', eur2(b.bemessung))}
      ${row('Ersatzrate', pct(b.rate))}
      </dl>
      <p class="sub">Basiselterngeld (ohne Arbeit)</p><dl>
      ${row('Wegfallendes Einkommen', eur2(b.diff))}
      ${row('× Ersatzrate', eur2(b.roh))}
      ${row('Elterngeld / Monat' + kapp(b.kappung), eur2(b.mitZuschlag), 'ok')}
      ${effekt(b.mitZuschlag, 0)}
      </dl>
      ${plusBlock(`ElterngeldPlus bei ${h(p.stundenPlus)} von ${h(p.stundenAlt)} Std./Woche`, e.plus, 'Plus')}
      ${plusBlock(`Partnerschaftsbonus bei ${h(p.stundenBonus)} von ${h(p.stundenAlt)} Std./Woche`, e.bonus, 'Bonus')}
      </div>`;
  }

  function planLabel(pl, n1, n2) {
    const f = (x) => [x.basis && `${x.basis}× Basis`, x.plus && `${x.plus}× Plus`, x.bonus && `${x.bonus}× Bonus`].filter(Boolean).join(', ') || '–';
    return `${esc(n1)}: ${f(pl.p1)} · ${esc(n2)}: ${f(pl.p2)}`;
  }

  function render() {
    const p1 = readParent('p1'), p2 = readParent('p2');
    $('.n1').textContent = p1.name; $('.n2').textContent = p2.name;
    const opts = { geschwister: $('#geschwister').checked, mehrlinge: parseInt($('#mehrlinge').value, 10) || 0 };
    const e1 = E.elternteil(p1, opts), e2 = E.elternteil(p2, opts);
    [['p1', p1, e1], ['p2', p2, e2]].forEach(([id, p, e]) => {
      const el = $('#' + id);
      $('.o-plus', el).textContent = `(${Math.round(e.plus.anteil * 100)} % der bisherigen Arbeit)`;
      $('.o-bonus', el).textContent = `(${Math.round(e.bonus.anteil * 100)} %)`;
      const warn = [];
      if (!e.plusErlaubt) warn.push('Über 32 Std./Woche in Plus-Monaten: kein Elterngeld.');
      if (!e.bonusMoeglich) warn.push('Partnerschaftsbonus braucht 24–32 Std./Woche in den Bonus-Monaten.');
      const w = $('.warn', el);
      w.textContent = warn.join(' ');
      w.hidden = warn.length === 0;
    });

    $('#monat').innerHTML = `<div class="calc">${monatBlock(p1, e1)}${monatBlock(p2, e2)}</div>`;

    const rows = E.standardPlaene().map((pl) => ({ pl, r: E.szenario(pl, e1, e2, p1, p2) }));
    const valid = rows.filter((x) => x.r.fehler.length === 0);
    const maxEg = Math.max(1, ...valid.map((x) => x.r.elterngeld));
    const best = valid.reduce((a, b) => (!a || b.r.elterngeld > a.r.elterngeld ? b : a), null);
    valid.sort((a, b) => b.r.elterngeld - a.r.elterngeld);
    const invalid = rows.filter((x) => x.r.fehler.length > 0);
    const tr = (x, ok) => ok
      ? `<tr${x === best ? ' class="best"' : ''}><td>${esc(x.pl.name)}<br><small>${planLabel(x.pl, p1.name, p2.name)}</small></td>
          <td>${eur(x.r.elterngeld)}<span class="bar" style="width:${(x.r.elterngeld / maxEg) * 100}%"></span></td>
          <td>${eur(x.r.lohn)}</td><td>${eur(x.r.gesamt)}</td>
          <td class="${x.r.verlust > 0 ? 'neg' : ''}">${eur(x.r.verlust)}</td></tr>`
      : `<tr class="invalid"><td>${esc(x.pl.name)}<br><small>${esc(x.r.fehler[0])}</small></td><td colspan="4">nicht möglich</td></tr>`;
    $('#szenarien').innerHTML = `<tr><th>Szenario</th><th>Elterngeld gesamt</th><th>Teilzeitgehalt</th><th>Summe</th><th>Verlust ggü. Vollverdienst</th></tr>`
      + valid.map((x) => tr(x, true)).join('') + invalid.map((x) => tr(x, false)).join('');

    // Eigene Aufteilung
    const plan = { p1: { basis: 0, plus: 0, bonus: 0 }, p2: { basis: 0, plus: 0, bonus: 0 } };
    document.querySelectorAll('#custom [data-k]').forEach((i) => {
      const [who, what] = i.dataset.k.split('.');
      plan[who][what] = Math.max(0, parseFloat(i.value) || 0);
    });
    const r = E.szenario(plan, e1, e2, p1, p2);
    const t = (n, x) => `<tr><td>${esc(n)}</td><td>${x.monate}</td><td>${eur(x.elterngeld)}</td><td>${eur(x.lohn)}</td><td>${eur(x.gesamt)}</td><td class="${x.verlust > 0 ? 'neg' : ''}">${eur(x.verlust)}</td></tr>`;
    $('#customOut').innerHTML = (r.fehler.length ? `<p class="err">${r.fehler.map(esc).join('<br>')}</p>` : '')
      + `<div class="scroll"><table><tr><th></th><th>Monate</th><th>Elterngeld</th><th>Teilzeitgehalt</th><th>Summe</th><th>Verlust</th></tr>`
      + t(p1.name, r.t1) + t(p2.name, r.t2)
      + `<tr class="best"><td>Zusammen</td><td>${r.t1.monate + r.t2.monate}</td><td>${eur(r.elterngeld)}</td><td>${eur(r.lohn)}</td><td>${eur(r.gesamt)}</td><td>${eur(r.verlust)}</td></tr></table></div>`;
  }

  document.addEventListener('input', render);
  render();
})();
