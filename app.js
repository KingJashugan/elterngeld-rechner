(function () {
  const E = window.Elterngeld;
  const KEY = 'egr-state-v2'; // v2: Mutterschutz-Regel, neue Beispiele (alter Stand v1 wird nicht übernommen)
  const eur = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const eur2 = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0) + ' %';
  const rate = (r) => (r * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' %';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  const opt = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.max(0, x) : undefined; };
  const start = (v) => { const x = Math.floor(parseFloat(v)); return Number.isFinite(x) && x >= 1 ? x : undefined; };
  const getPath = (o, key) => key.split('.').reduce((a, k) => a[k], o);
  const setPath = (o, key, v) => { const ks = key.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

  // ---------- Zustand ----------
  // basisStart/plusStart/bonusStart: Lebensmonat; undefined = automatisch hinter dem vorigen Block
  const sp = (o) => ({ basis: 0, plus: 0, hPlus: 20, hBonus: 28, nettoPlus: undefined, nettoBonus: undefined, basisStart: undefined, plusStart: undefined, ...o });
  let nextId = 1;
  const scen = (name, p1, p2, bonus, bonusStart) => ({ id: nextId++, name, p1: sp(p1), p2: sp(p2), bonus: bonus || 0, bonusStart });
  // Elternteil 1 = Vater, Elternteil 2 = Mutter (inkl. 2 Monate Mutterschutz in ihren Basis-Monaten)
  const MUTTERSCHUTZ_MONATE = 2;
  // Kontingent: 14 Basis-Monate, Plus zählt halb. Mutter: 2 Mutterschutz-Monate sind immer Basis.
  // Mutter 2 Basis + 12 Plus = 8, Vater 12 Plus = 6, zusammen 14.
  // Reformentwurf: 12 Monate, je Elternteil max. 9 (3 reserviert + 6 frei); Mutter 2 Basis + 8 Plus = 6, Vater 12 Plus = 6.
  const beispiele = (recht) => (recht === 'reform' ? [
    scen('Mutter 6, Vater 6 Monate Basis', { basis: 6 }, { basis: 6 }),
    scen('Mutter 9, Vater 3 Monate Basis', { basis: 3 }, { basis: 9 }),
    scen('Vater 9 Basis, Mutter 3 (inkl. Mutterschutz)', { basis: 9 }, { basis: 3 }),
    scen('Mutter 2 Basis + 8 Plus, Vater 12 Plus (je 20 Std.)', { plus: 12 }, { plus: 8 }),
    scen('wie zuvor, dazu Bonus 4 Monate (je 28 Std.)', { plus: 12 }, { plus: 8 }, 4),
  ] : [
    scen('Mutter 12, Vater 2 Monate Basis', { basis: 2 }, { basis: 12 }),
    scen('Mutter 7, Vater 7 Monate Basis', { basis: 7 }, { basis: 7 }),
    scen('Vater 12 Basis, Mutter nur Mutterschutz (2)', { basis: 12 }, { basis: 2 }),
    scen('Mutter 2 Basis + 12 Plus, Vater 12 Plus (je 20 Std.)', { plus: 12 }, { plus: 12 }),
    scen('wie zuvor, dazu Bonus 4 Monate (je 28 Std.)', { plus: 12 }, { plus: 12 }, 4),
  ]);
  // true, wenn die Szenarien noch unverändert die Beispiele der Rechtslage sind
  const sindBeispiele = (recht) => {
    const key = (s) => [s.name, s.p1.basis, s.p1.plus, Math.max(s.p2.basis, ms()), s.p2.plus, s.bonus, s.p1.hPlus, s.p2.hPlus, s.p1.hBonus, s.p2.hBonus, s.p1.basisStart, s.p1.plusStart, s.p2.basisStart, s.p2.plusStart, s.bonusStart].join('|');
    const ref = beispiele(recht).map(key);
    return state.scenarios.length === ref.length && state.scenarios.every((s, i) => key(s) === ref[i]);
  };
  const state = {
    parents: [
      { name: 'Ich (Vater)', netto: 3000, stundenAlt: 40 },
      { name: 'Partnerin (Mutter)', netto: 2200, stundenAlt: 40 },
    ],
    recht: 'aktuell', bonusReform: true,
    mutterschutz: true, geschwister: false, mehrlinge: 0,
    scenarios: beispiele('aktuell'),
  };
  const ms = () => (state.mutterschutz ? MUTTERSCHUTZ_MONATE : 0);

  function load() {
    try {
      applyState(JSON.parse(localStorage.getItem(KEY)));
    } catch (e) { /* ohne Speicher weiterarbeiten */ }
  }

  // Übernimmt einen gespeicherten/importierten Stand. Alle Werte werden einzeln geprüft und begrenzt,
  // unbekannte Felder werden verworfen. Gibt true zurück, wenn der Stand brauchbar war.
  const MAX_SZENARIEN = 30;
  function applyState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenarios) || !Array.isArray(raw.parents) || raw.parents.length !== 2) return false;
    const text = (v, max, fallback) => String(v == null ? '' : v).slice(0, max).trim() || fallback;
    const cleanP = (p) => {
      p = p && typeof p === 'object' ? p : {};
      return {
        basis: Math.min(14, Math.floor(num(p.basis))), plus: Math.min(28, Math.floor(num(p.plus))),
        hPlus: Math.min(60, num(p.hPlus)), hBonus: Math.min(60, num(p.hBonus)),
        nettoPlus: opt(p.nettoPlus), nettoBonus: opt(p.nettoBonus),
        basisStart: start(p.basisStart), plusStart: start(p.plusStart),
      };
    };
    const parents = raw.parents.map((p, i) => ({
      name: text(p && p.name, 60, i === 0 ? 'Ich (Vater)' : 'Partnerin (Mutter)'),
      netto: Math.min(100000, num(p && p.netto)), stundenAlt: Math.min(60, Math.max(1, num(p && p.stundenAlt))),
    }));
    const scenarios = raw.scenarios.slice(0, MAX_SZENARIEN).map((s) => {
      s = s && typeof s === 'object' ? s : {};
      return scen(text(s.name, 80, 'Szenario'), cleanP(s.p1), cleanP(s.p2), Math.min(4, Math.floor(num(s.bonus))), start(s.bonusStart));
    });
    state.parents = parents;
    state.recht = raw.recht === 'reform' ? 'reform' : 'aktuell';
    state.bonusReform = raw.bonusReform !== false;
    state.mutterschutz = raw.mutterschutz !== false;
    state.geschwister = !!raw.geschwister;
    state.mehrlinge = Math.min(5, Math.floor(num(raw.mehrlinge)));
    state.scenarios = scenarios;
    return true;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignorieren */ }
  }

  // ---------- Eingaben lesen / schreiben ----------
  function readDom() {
    ['p1', 'p2'].forEach((id, i) => {
      const el = $('#' + id);
      state.parents[i] = {
        name: $('.name', el).value.trim() || 'Elternteil ' + (i + 1),
        netto: num($('.netto', el).value),
        stundenAlt: Math.max(1, num($('.stunden-alt', el).value)),
      };
    });
    state.recht = $('input[name=recht]:checked').value === 'reform' ? 'reform' : 'aktuell';
    state.bonusReform = $('#bonusReform').checked;
    state.mutterschutz = $('#mutterschutz').checked;
    state.geschwister = $('#geschwister').checked;
    state.mehrlinge = Math.min(5, Math.floor(num($('#mehrlinge').value)));
    $$('.scen').forEach((el, i) => {
      const s = state.scenarios[i];
      if (!s) return;
      s.name = $('.sname', el).value;
      s.bonus = Math.floor(num($('[data-k=bonus]', el).value));
      ['p1', 'p2'].forEach((p) => {
        const g = (k) => $(`[data-k="${p}.${k}"]`, el).value;
        s[p] = { ...s[p], basis: Math.floor(num(g('basis'))), plus: Math.floor(num(g('plus'))), hPlus: num(g('hPlus')), hBonus: num(g('hBonus')), nettoPlus: opt(g('nettoPlus')), nettoBonus: opt(g('nettoBonus')) };
      });
      // Startmonate: nur gesetzt, wenn der Regler bewegt wurde (sonst automatisch)
      $$('input[data-sk$="Start"]', el).forEach((sl) => setPath(s, sl.dataset.sk, sl.dataset.explicit === '1' ? start(sl.value) : undefined));
    });
  }

  function writeParents() {
    ['p1', 'p2'].forEach((id, i) => {
      const el = $('#' + id), p = state.parents[i];
      $('.name', el).value = p.name; $('.netto', el).value = p.netto; $('.stunden-alt', el).value = p.stundenAlt;
    });
    $(`input[name=recht][value=${state.recht}]`).checked = true;
    $('#bonusReform').checked = state.bonusReform;
    $('#mutterschutz').checked = state.mutterschutz;
    $('#geschwister').checked = state.geschwister;
    $('#mehrlinge').value = state.mehrlinge;
  }

  const RECHT_INFO = {
    aktuell: 'Aktuelles Recht (Geburt bis Oktober 2027): bis 14 Monate Basis (12 + 2 Partnermonate), 300–1.800 €, Ersatzrate 65 %. Gegen den offiziellen Planer geprüft.',
    reform: 'Reformentwurf (Referentenentwurf Juli 2026, geplant für Geburten ab 1.11.2027, noch kein Gesetz): 12 Monate Basis bzw. 24 Plus, davon 3 je Elternteil reserviert und 6 frei aufteilbar (max. 9 je Elternteil), 330–1.900 €, Ersatzrate 65 %. Annahmen ohne Beleg: Plus 165–950 €, Netto-Obergrenze 2.923 €, übrige Regeln wie heute (2 Monate Mindestbezug, Mutterschutz zählt als Basis). Der Entwurf kann sich noch ändern.',
  };
  function updateRecht() {
    $('#rechtInfo').textContent = RECHT_INFO[state.recht];
    $('#bonusReformWrap').hidden = state.recht !== 'reform';
    $('#rechtBadge').textContent = state.recht === 'reform' ? '(Reformentwurf ab 1.11.2027)' : '(aktuelles Recht)';
  }

  function updateNames() {
    $$('.pn').forEach((el) => { el.textContent = state.parents[+el.dataset.who].name; });
  }

  // ---------- Zeitleiste ----------
  const LBL = { M: 'Mutterschutz', B: 'Basis', P: 'Plus', K: 'Bonus', X: 'Überschneidung' };
  function barsHtml(zp, compact) {
    const N = zp.laenge;
    const cols = `grid-template-columns:repeat(${N},1fr)`;
    const ruler = compact ? '' : `<div class="tl-row"><span class="tl-name"></span><div class="tl-cells tl-ruler" style="${cols}">${Array.from({ length: N }, (_, i) => `<i>${i === 0 || (i + 1) % 6 === 0 ? i + 1 : ''}</i>`).join('')}</div></div>`;
    const row = (who, idx) => {
      const name = state.parents[idx].name;
      const cells = Array.from({ length: N }, (_, i) => {
        const m = i + 1, t = zp.rows[who][m];
        return `<i class="c${t ? ' c-' + t : ''}${m === E.C.BASIS_BIS_LM ? ' lm14' : ''}" title="${m}. Lebensmonat${t ? ': ' + LBL[t] : ''}">${compact ? '' : t === 'X' ? '!' : t || ''}</i>`;
      }).join('');
      return `<div class="tl-row"><span class="tl-name" title="${esc(name)}">${esc(compact ? name.charAt(0).toUpperCase() : name)}</span><div class="tl-cells" style="${cols}">${cells}</div></div>`;
    };
    return `<div class="tl-grid${compact ? ' tl-compact' : ''}">${ruler}${row('p1', 0)}${row('p2', 1)}</div>`;
  }

  const effStart = (zp, key) => ({ 'p1.basisStart': zp.starts.p1.basis, 'p1.plusStart': zp.starts.p1.plus, 'p2.basisStart': zp.starts.p2.basis, 'p2.plusStart': zp.starts.p2.plus, bonusStart: zp.starts.bonus }[key]);

  function sliderHtml(key, label, max) {
    const isStart = /Start$/.test(key);
    return `<div class="sl" data-sl="${key}">
      <label><span>${label}</span> <output></output>
        <input type="range" data-sk="${key}" data-explicit="0" min="${isStart ? 1 : 0}" max="${isStart ? 32 : max}" step="1" value="0"></label>
      ${isStart ? `<button type="button" class="secondary auto" data-act="auto" data-sk="${key}" title="Wieder automatisch anordnen" hidden>auto</button>` : ''}
    </div>`;
  }

  function syncTimeline(card, s, zp) {
    $('.tl-bars', card).innerHTML = barsHtml(zp, false);
    $$('input[data-sk]', card).forEach((sl) => {
      const key = sl.dataset.sk, isStart = /Start$/.test(key), row = sl.closest('.sl');
      let v, explicit = false;
      if (isStart) {
        explicit = getPath(s, key) != null;
        sl.dataset.explicit = explicit ? '1' : '0';
        v = explicit ? getPath(s, key) : effStart(zp, key);
        const countKey = key.replace('Start', '');
        const count = key === 'p2.basisStart' ? Math.max(s.p2.basis, ms()) - ms() : num(getPath(s, countKey));
        row.hidden = count <= 0;
        $('.auto', row).hidden = !explicit;
      } else {
        sl.min = key === 'p2.basis' ? ms() : 0;
        v = Math.max(num(getPath(s, key)), key === 'p2.basis' ? ms() : 0);
      }
      if (document.activeElement !== sl) sl.value = v;
      $('output', row).textContent = isStart ? `Monat ${v}${explicit ? '' : ' (auto)'}` : v;
    });
  }

  // ---------- Szenario-Karten ----------
  function cardHtml(s) {
    const row = (p, i) => `
      <div class="prow">
        <strong class="pn" data-who="${i}">${esc(state.parents[i].name)}</strong>
        <label>${p === 'p2' && state.mutterschutz ? 'Basis-Monate (inkl. 2 Mutterschutz, mind. 2)' : 'Basis-Monate'}<input type="number" min="${p === 'p2' && state.mutterschutz ? MUTTERSCHUTZ_MONATE : 0}" max="14" step="1" data-k="${p}.basis" value="${p === 'p2' && state.mutterschutz ? Math.max(s[p].basis, MUTTERSCHUTZ_MONATE) : s[p].basis}"></label>
        <label>Plus-Monate<input type="number" min="0" max="28" step="1" data-k="${p}.plus" value="${s[p].plus}"></label>
        <label>Std./Woche Plus<input type="number" min="0" max="60" step="0.5" data-k="${p}.hPlus" value="${s[p].hPlus}"></label>
        <label>Std./Woche Bonus<input type="number" min="0" max="60" step="0.5" data-k="${p}.hBonus" value="${s[p].hBonus}"></label>
        <details class="ov">
          <summary>Teilzeit-Netto selbst eintragen</summary>
          <label>Netto Plus, €<input type="number" min="0" step="10" placeholder="Schätzung" data-k="${p}.nettoPlus" value="${s[p].nettoPlus ?? ''}"></label>
          <label>Netto Bonus, €<input type="number" min="0" step="10" placeholder="Schätzung" data-k="${p}.nettoBonus" value="${s[p].nettoBonus ?? ''}"></label>
        </details>
      </div>`;
    const grp = (p, i) => `<div class="slgrp"><strong class="pn" data-who="${i}">${esc(state.parents[i].name)}</strong>
        ${sliderHtml(p + '.basis', 'Basis-Monate', 14)}${sliderHtml(p + '.basisStart', 'Beginn Basis')}
        ${sliderHtml(p + '.plus', 'Plus-Monate', 28)}${sliderHtml(p + '.plusStart', 'Beginn Plus')}</div>`;
    return `<div class="card scen" data-id="${s.id}">
      <div class="shead">
        <input type="text" class="sname" value="${esc(s.name)}" placeholder="Name des Szenarios" aria-label="Name des Szenarios">
        <button type="button" data-act="dup" class="secondary" title="Duplizieren">Kopie</button>
        <button type="button" data-act="del" class="secondary" title="Löschen">Löschen</button>
      </div>
      ${row('p1', 0)}${row('p2', 1)}
      <label class="bonus">Bonus-Monate (beide, 0 oder 2–4)<input type="number" min="0" max="4" step="1" data-k="bonus" value="${s.bonus}"></label>
      <div class="tl">
        <div class="tl-title">Zeitplan (Lebensmonate)</div>
        <div class="tl-bars"></div>
        <details class="tl-ctl" open>
          <summary>Zeitplan mit Reglern anpassen</summary>
          ${grp('p1', 0)}${grp('p2', 1)}
          <div class="slgrp"><strong>Partnerschaftsbonus</strong>${sliderHtml('bonus', 'Bonus-Monate (beide)', 4)}${sliderHtml('bonusStart', 'Beginn Bonus')}</div>
        </details>
      </div>
      <p class="warn" hidden></p>
      <p class="note" hidden></p>
    </div>`;
  }

  function renderCards() {
    $('#scen').innerHTML = state.scenarios.map(cardHtml).join('');
  }

  // ---------- Berechnung ----------
  function compute() {
    const opts = { recht: state.recht, bonusErlaubt: state.recht !== 'reform' || state.bonusReform, geschwister: state.geschwister, mehrlinge: state.mehrlinge };
    const [a, b] = state.parents;
    return state.scenarios.map((s) => {
      const mk = (par, x) => ({ netto: par.netto, stundenAlt: par.stundenAlt, stundenPlus: x.hPlus, stundenBonus: x.hBonus, nettoPlus: x.nettoPlus, nettoBonus: x.nettoBonus });
      const e1 = E.elternteil(mk(a, s.p1), opts), e2 = E.elternteil(mk(b, s.p2), opts);
      const plan = { p1: { basis: s.p1.basis, plus: s.p1.plus, bonus: s.bonus }, p2: { basis: s.p2.basis, plus: s.p2.plus, bonus: s.bonus } };
      const r = E.szenario(plan, e1, e2, a, b, ms());
      const zp = E.zeitplan(s, ms(), { parallelBasisErlaubt: state.mehrlinge > 0 });
      const warn = [...r.fehler, ...zp.fehler];
      if (r.monate === 0) warn.push('Keine Monate eingetragen.');
      return { s, r, zp, e1, e2, warn, ok: warn.length === 0 };
    });
  }

  // ---------- Erklärung: Verlust beim Elterngeld ----------
  const VERLUST_ERKLAERUNG = 'Verglichen wird mit dem Elterngeld, das für dieselben Monate ohne Arbeit gezahlt würde (Maximum). '
    + 'Ein Verlust entsteht nur in Plus- und Bonus-Monaten mit Teilzeit: Das Teilzeit-Netto wird angerechnet. '
    + 'Elterngeld = Ersatzrate (meist 65 %) × (Netto vor Geburt − Teilzeit-Netto), höchstens die Hälfte des Basis-Betrags, mindestens der Mindestbetrag. '
    + 'Je mehr du in Teilzeit verdienst, desto weniger Elterngeld. Basis-Monate ohne Arbeit und Mutterschutz-Monate bringen keinen Verlust. '
    + 'Monatsbeträge werden auf volle Euro aufgerundet. '
    + 'Aufklappen unter dem Betrag zeigt den Rechenweg für das Szenario.';
  const offen = new Set(); // aufgeklappte Rechenwege überleben das Neuzeichnen der Tabelle

  function verlustHtml(x) {
    const [n1, n2] = state.parents.map((p) => esc(p.name));
    const items = [];
    [['p1', x.e1, n1], ['p2', x.e2, n2]].forEach(([w, e, n]) => {
      const stdAlt = state.parents[w === 'p1' ? 0 : 1].stundenAlt.toLocaleString('de-DE');
      [['plus', 'Plus', x.s[w].plus, x.s[w].hPlus], ['bonus', 'Bonus', x.s.bonus, x.s[w].hBonus]].forEach(([k, label, monate, std]) => {
        if (!(monate > 0)) return;
        const b = e[k], max = e.ohneArbeit.plus, proMonat = max - b.mitZuschlag;
        const anteil = b.rate * b.diff;
        const grund = b.kappung === 'min' ? ' (liegt unter dem Mindestbetrag, gezahlt wird dieser)'
          : anteil >= b.halbOhneEinkommen ? ' (erreicht die Obergrenze von ½ Basis)' : '';
        items.push(`<li><strong>${n} · ${label}, ${monate} Monate</strong> bei ${std.toLocaleString('de-DE')} von ${stdAlt} Std./Woche<br>`
          + `Teilzeit-Netto ${eur2(b.nettoNachher)} wird angerechnet: ${rate(b.rate)} × (${eur2(b.bemessung)} − ${eur2(b.nettoNachher)}) = ${eur2(anteil)}${grund}.<br>`
          + `Obergrenze ohne Arbeit (½ Basis): ${eur2(b.halbOhneEinkommen)}. Gezahlt: ${eur2(b.mitZuschlag)} statt ${eur2(max)} pro Monat`
          + (proMonat > 0 ? ` → <span class="neg">Verlust ${eur2(proMonat)} × ${monate} = ${eur2(proMonat * monate)}</span>` : ' → <strong>kein Verlust</strong>') + '.</li>');
      });
    });
    const hat = (w, k) => x.s[w][k] > 0;
    if (hat('p1', 'basis') || hat('p2', 'basis') || x.r.basis2 > x.r.mutterschutz) {
      items.push('<li><strong>Basis-Monate</strong> ohne Arbeit: es gibt das volle Elterngeld, also kein Verlust.</li>');
    }
    if (x.r.mutterschutz > 0) {
      items.push(`<li><strong>Mutterschutz (${x.r.mutterschutz} Monate)</strong>: Das Mutterschaftsgeld wird angerechnet, deshalb gibt es kein zusätzliches Elterngeld. Diese Monate zählen nicht als Verlust.</li>`);
    }
    if (!items.length) items.push('<li>Keine Plus- oder Bonus-Monate: Es gibt volles Elterngeld ohne Anrechnung.</li>');
    return `<details class="why" data-sid="${x.s.id}"${offen.has(x.s.id) ? ' open' : ''}><summary>Woher kommt das?</summary>`
      + `<ul>${items.join('')}</ul>`
      + `<p class="sum">Summe: Maximum ${eur(x.r.maximum)} − Elterngeld ${eur(x.r.elterngeld)} = <strong class="neg">${eur(x.r.verlustElterngeld)}</strong></p></details>`;
  }

  function renderResults() {
    const res = compute();
    $$('.scen').forEach((el, i) => {
      const w = $('.warn', el), n = $('.note', el), x = res[i];
      w.textContent = x.warn.join(' · ');
      w.hidden = x.ok;
      n.textContent = x.zp.hinweise.join(' ');
      n.hidden = x.zp.hinweise.length === 0;
      syncTimeline(el, x.s, x.zp);
    });

    const valid = res.filter((x) => x.ok);
    const bestSumme = Math.max(...valid.map((x) => x.r.gesamt), 0);
    const bestVerlust = Math.min(...valid.map((x) => x.r.verlust), Infinity);
    const bestEg = Math.min(...valid.map((x) => x.r.verlustElterngeld), Infinity);
    const [n1, n2] = state.parents.map((p) => esc(p.name));
    const cell = (x, fn, cls) => `<td class="${x.ok ? (cls ? cls(x) : '') : 'na'}">${x.ok ? fn(x) : '–'}</td>`;
    const rows = [
      ['Monate', (x) => `${esc(n1)}: ${x.s.p1.basis} Basis, ${x.s.p1.plus} Plus<br>${esc(n2)}: ${x.r.basis2} Basis${x.r.mutterschutz ? ` (davon ${x.r.mutterschutz} Mutterschutz)` : ''}, ${x.s.p2.plus} Plus<br>Bonus: ${x.s.bonus} je Elternteil`, null],
      ['Std./Woche', (x) => [[n1, x.s.p1], [n2, x.s.p2]].map(([n, p]) => {
        const t = [p.plus > 0 && `Plus ${p.hPlus}`, x.s.bonus > 0 && `Bonus ${p.hBonus}`].filter(Boolean).join(', ');
        return `${esc(n)}: ${t || 'keine Arbeit'}`;
      }).join('<br>'), null],
      ['Elterngeld gesamt', (x) => `<strong>${eur(x.r.elterngeld)}</strong><br><small>${esc(n1)} ${eur(x.r.t1.elterngeld)} · ${esc(n2)} ${eur(x.r.t2.elterngeld)}</small>`, null],
      ['Teilzeit-Netto in Bezugsmonaten', (x) => eur(x.r.lohn), null],
      ['Einkommen gesamt (Elterngeld + Teilzeit)', (x) => `<strong>${eur(x.r.gesamt)}</strong><span class="bar" style="width:${bestSumme ? (x.r.gesamt / bestSumme) * 100 : 0}%"></span>`, (x) => (x.r.gesamt === bestSumme ? 'best' : '')],
      ['Max. Elterngeld ohne Arbeit', (x) => eur(x.r.maximum), null],
      [`Verlust beim Elterngeld <span class="tip" tabindex="0" aria-label="Erklärung zum Verlust beim Elterngeld">ⓘ<span class="tip-box" role="tooltip">${esc(VERLUST_ERKLAERUNG)}</span></span>`,
        (x) => `<strong class="neg">${eur(x.r.verlustElterngeld)}</strong><br><small>${pct(x.r.verlustElterngeld, x.r.maximum)} vom Maximum</small>${verlustHtml(x)}`,
        (x) => (x.r.verlustElterngeld === bestEg ? 'best' : '')],
      ['Netto bei Vollverdienst (gleiche Monate)', (x) => eur(x.r.referenz), null],
      ['Verlust ggü. Vollverdienst', (x) => `<strong class="neg">${eur(x.r.verlust)}</strong><br><small>${pct(x.r.verlust, x.r.referenz)} vom Vollverdienst</small>`, (x) => (x.r.verlust === bestVerlust ? 'best' : '')],
    ];
    const head = `<tr><th></th>${res.map((x) => `<th>${esc(x.s.name || 'Szenario')}${x.ok ? '' : '<br><small class="neg">ungültig</small>'}</th>`).join('')}</tr>`;
    const body = rows.map(([label, fn, cls]) => `<tr><th scope="row">${label}</th>${res.map((x) => cell(x, fn, cls)).join('')}</tr>`);
    // Zeitplan zeigt auch ungültige Szenarien (dort sieht man, was nicht passt)
    body.splice(2, 0, `<tr><th scope="row">Zeitplan</th>${res.map((x) => `<td>${barsHtml(x.zp, true)}<small>bis Lebensmonat ${x.zp.ende}</small></td>`).join('')}</tr>`);
    $('#vergleich').innerHTML = res.length ? head + body.join('') : '<tr><td>Noch kein Szenario. Mit „+ Neues Szenario“ anlegen.</td></tr>';
  }

  function update() {
    readDom();
    updateRecht();
    updateNames();
    save();
    renderResults();
  }

  // ---------- Export / Import als Datei ----------
  const FORMAT = 'elterngeld-rechner';
  const MAX_DATEI = 1024 * 1024; // 1 MB reicht weit
  function meldung(text, fehler) {
    const el = $('#ioMsg');
    el.textContent = text;
    el.classList.toggle('err', !!fehler);
  }

  function exportFile() {
    readDom();
    const daten = { format: FORMAT, version: 1, exportiert: new Date().toISOString(), ...JSON.parse(JSON.stringify(state)) };
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elterngeld-szenarien-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    meldung(`${state.scenarios.length} Szenarien exportiert (Datei im Download-Ordner).`);
  }

  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_DATEI) { meldung('Datei zu groß (max. 1 MB).', true); return; }
    const reader = new FileReader();
    reader.onerror = () => meldung('Datei konnte nicht gelesen werden.', true);
    reader.onload = () => {
      let raw;
      try { raw = JSON.parse(String(reader.result)); } catch (e) { meldung('Keine gültige JSON-Datei.', true); return; }
      if (!raw || raw.format !== FORMAT) { meldung('Das ist keine Export-Datei dieses Rechners.', true); return; }
      readDom();
      const vorher = JSON.stringify(state);
      const eigene = !sindBeispiele(state.recht);
      if (eigene && !window.confirm('Der aktuelle Stand (inkl. eurer Szenarien) wird durch die Datei ersetzt. Fortfahren?')) { meldung('Import abgebrochen.'); return; }
      if (!applyState(raw)) { applyState(JSON.parse(vorher)); meldung('Die Datei hat nicht das erwartete Format.', true); return; }
      save();
      writeParents();
      renderCards();
      updateRecht();
      updateNames();
      renderResults();
      meldung(`${state.scenarios.length} Szenarien importiert.`);
    };
    reader.readAsText(file);
  }

  // ---------- Aktionen ----------
  function act(a, id) {
    readDom();
    const i = state.scenarios.findIndex((s) => String(s.id) === String(id));
    if (a === 'add') state.scenarios.push(scen('Szenario ' + (state.scenarios.length + 1), { basis: 2 }, { basis: 12 }));
    else if (a === 'dup' && i >= 0) {
      const c = JSON.parse(JSON.stringify(state.scenarios[i]));
      state.scenarios.splice(i + 1, 0, scen((c.name || 'Szenario') + ' (Kopie)', c.p1, c.p2, c.bonus, c.bonusStart));
    } else if (a === 'del' && i >= 0) state.scenarios.splice(i, 1);
    else if (a === 'reset') state.scenarios = beispiele(state.recht);
    else return;
    save();
    renderCards();
    renderResults();
  }

  // Aufgeklappte Rechenwege merken (toggle bubbelt nicht, daher Capture)
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d.matches && d.matches('details.why[data-sid]')) {
      const id = Number(d.dataset.sid);
      if (d.open) offen.add(id); else offen.delete(id);
    }
  }, true);
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile') { importFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'importFile') return;
    const t = ev.target;
    if (t.dataset && t.dataset.sk) {
      if (/Start$/.test(t.dataset.sk)) t.dataset.explicit = '1'; // Regler bewegt: fester Startmonat
      else { const n = $(`[data-k="${t.dataset.sk}"]`, t.closest('.scen')); if (n) n.value = t.value; } // Monate: Zahlenfeld mitführen
    }
    if (t.name === 'recht') { // Beispiele der alten Rechtslage gegen die der neuen austauschen (eigene Szenarien bleiben)
      const alt = state.recht;
      readDom();
      if (state.recht !== alt && sindBeispiele(alt)) state.scenarios = beispiele(state.recht);
      save(); updateRecht(); renderCards(); renderResults();
      return;
    }
    update();
    if (t.id === 'mutterschutz') { renderCards(); renderResults(); } // Beschriftung/Mindestwert der Mutter-Basis-Monate
  });
  // Beim Verlassen des Felds: Basis-Monate der Mutter auf mindestens 2 anheben (nicht während des Tippens)
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (state.mutterschutz && t.dataset && t.dataset.k === 'p2.basis' && num(t.value) < MUTTERSCHUTZ_MONATE) {
      t.value = MUTTERSCHUTZ_MONATE;
      update();
    }
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'export') { exportFile(); return; }
    if (b.dataset.act === 'auto') { // Startmonat wieder automatisch
      const sl = $(`input[data-sk="${b.dataset.sk}"]`, b.closest('.scen'));
      if (sl) { sl.dataset.explicit = '0'; update(); }
      return;
    }
    act(b.dataset.act, b.closest('.scen')?.dataset.id);
  });

  load();
  writeParents();
  renderCards();
  updateRecht();
  updateNames();
  renderResults();
})();
