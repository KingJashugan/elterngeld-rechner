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

  // ---------- Zustand ----------
  // Je Elternteil eine Liste von Blöcken { typ: 'basis'|'plus', start, n }: n Monate ab Lebensmonat start
  // (start undefined = automatisch direkt hinter dem vorigen Block). bonusStart: dasselbe für den Bonus.
  // basis/plus sind die Summen aus den Blöcken (bei der Mutter plus Mutterschutz) und werden in derive() gesetzt.
  // Alte Stände (basis/plus + basisStart/plusStart) werden mit legacyBlocks() umgewandelt; abzug = Mutterschutz-Monate in p2.basis.
  const legacyBlocks = (o, abzug) => {
    const b = [];
    const nb = Math.max(0, Math.floor(num(o.basis)) - (abzug || 0)), np = Math.floor(num(o.plus));
    if (nb > 0) b.push({ typ: 'basis', start: start(o.basisStart), n: nb });
    if (np > 0) b.push({ typ: 'plus', start: start(o.plusStart), n: np });
    return b;
  };
  const sp = (o, abzug) => ({ hPlus: 20, hBonus: 28, nettoPlus: undefined, nettoBonus: undefined, ...o, blocks: Array.isArray(o.blocks) ? o.blocks : legacyBlocks(o, abzug) });
  let nextId = 1;
  const scen = (name, p1, p2, bonus, bonusStart, abzug) => ({ id: nextId++, name, p1: sp(p1), p2: sp(p2, abzug), bonus: bonus || 0, bonusStart });
  const summe = (blocks, typ) => blocks.reduce((t, b) => (b.typ === typ ? t + Math.max(0, Math.floor(num(b.n))) : t), 0);
  const derive = (s) => {
    s.p1.basis = summe(s.p1.blocks, 'basis'); s.p1.plus = summe(s.p1.blocks, 'plus');
    s.p2.basis = ms() + summe(s.p2.blocks, 'basis'); s.p2.plus = summe(s.p2.blocks, 'plus');
  };
  // Elternteil 1 = Vater, Elternteil 2 = Mutter (inkl. 2 Monate Mutterschutz in ihren Basis-Monaten)
  const MUTTERSCHUTZ_MONATE = 2;
  // Kontingent: 14 Basis-Monate, Plus zählt halb. Mutter: 2 Mutterschutz-Monate sind immer Basis.
  // Mutter 2 Basis + 12 Plus = 8, Vater 12 Plus = 6, zusammen 14.
  // Reformentwurf: 12 Monate, je Elternteil max. 9 (3 reserviert + 6 frei); Mutter 2 Basis + 8 Plus = 6, Vater 12 Plus = 6.
  // m = Mutterschutz-Monate: Die Basis-Angaben der Mutter in den Beispielen enthalten sie (Blöcke zählen nur den Rest).
  const beispiele = (recht, m = MUTTERSCHUTZ_MONATE) => {
    const S = (name, p1, p2, bonus) => scen(name, p1, p2, bonus, undefined, m);
    return recht === 'reform' ? [
      S('Mutter 6, Vater 6 Monate Basis', { basis: 6 }, { basis: 6 }),
      S('Mutter 9, Vater 3 Monate Basis', { basis: 3 }, { basis: 9 }),
      S('Vater 9 Basis, Mutter 3 (inkl. Mutterschutz)', { basis: 9 }, { basis: 3 }),
      S('Mutter 2 Basis + 8 Plus, Vater 12 Plus (je 20 Std.)', { plus: 12 }, { plus: 8 }),
      S('wie zuvor, dazu Bonus 4 Monate (je 28 Std.)', { plus: 12 }, { plus: 8 }, 4),
    ] : [
      S('Mutter 12, Vater 2 Monate Basis', { basis: 2 }, { basis: 12 }),
      S('Mutter 7, Vater 7 Monate Basis', { basis: 7 }, { basis: 7 }),
      S('Vater 12 Basis, Mutter nur Mutterschutz (2)', { basis: 12 }, { basis: 2 }),
      S('Mutter 2 Basis + 12 Plus, Vater 12 Plus (je 20 Std.)', { plus: 12 }, { plus: 12 }),
      S('wie zuvor, dazu Bonus 4 Monate (je 28 Std.)', { plus: 12 }, { plus: 12 }, 4),
    ];
  };
  // true, wenn die Szenarien noch unverändert die Beispiele der Rechtslage sind
  const sindBeispiele = (recht) => {
    const key = (s) => JSON.stringify([s.name, s.p1.blocks, s.p2.blocks, s.bonus, s.bonusStart, s.p1.hPlus, s.p2.hPlus, s.p1.hBonus, s.p2.hBonus, s.p1.nettoPlus, s.p2.nettoPlus, s.p1.nettoBonus, s.p2.nettoBonus]);
    const ref = beispiele(recht, ms()).map(key);
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
  const MAX_BLOECKE = 12; // je Elternteil
  function applyState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scenarios) || !Array.isArray(raw.parents) || raw.parents.length !== 2) return false;
    const text = (v, max, fallback) => String(v == null ? '' : v).slice(0, max).trim() || fallback;
    const msRaw = raw.mutterschutz !== false ? MUTTERSCHUTZ_MONATE : 0;
    const cleanP = (p, abzug) => {
      p = p && typeof p === 'object' ? p : {};
      const quelle = Array.isArray(p.blocks) ? p.blocks : legacyBlocks(p, abzug); // ohne blocks: alter Stand
      const blocks = quelle.slice(0, MAX_BLOECKE).map((b) => ({ typ: b && b.typ === 'plus' ? 'plus' : 'basis', start: start(b && b.start), n: Math.min(32, Math.floor(num(b && b.n))) }));
      return {
        blocks,
        hPlus: Math.min(60, num(p.hPlus)), hBonus: Math.min(60, num(p.hBonus)),
        nettoPlus: opt(p.nettoPlus), nettoBonus: opt(p.nettoBonus),
      };
    };
    const parents = raw.parents.map((p, i) => ({
      name: text(p && p.name, 60, i === 0 ? 'Ich (Vater)' : 'Partnerin (Mutter)'),
      netto: Math.min(100000, num(p && p.netto)), stundenAlt: Math.min(60, Math.max(1, num(p && p.stundenAlt))),
    }));
    const scenarios = raw.scenarios.slice(0, MAX_SZENARIEN).map((s) => {
      s = s && typeof s === 'object' ? s : {};
      return scen(text(s.name, 80, 'Szenario'), cleanP(s.p1, 0), cleanP(s.p2, msRaw), Math.min(4, Math.floor(num(s.bonus))), start(s.bonusStart));
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
      s.bonusStart = start($('[data-k=bonusStart]', el).value);
      ['p1', 'p2'].forEach((p) => {
        const g = (k) => $(`[data-k="${p}.${k}"]`, el).value;
        const blocks = $$(`.blk[data-who="${p}"]`, el).map((b) => ({ typ: $('[data-b=typ]', b).value === 'plus' ? 'plus' : 'basis', start: start($('[data-b=start]', b).value), n: Math.floor(num($('[data-b=n]', b).value)) }));
        s[p] = { ...s[p], blocks, hPlus: num(g('hPlus')), hBonus: num(g('hBonus')), nettoPlus: opt(g('nettoPlus')), nettoBonus: opt(g('nettoBonus')) };
      });
      derive(s);
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

  // Zeitleiste neu zeichnen; bei Blöcken ohne eigenen Start zeigt das Feld den automatischen Startmonat als Platzhalter.
  function syncTimeline(card, s, zp) {
    $('.tl-bars', card).innerHTML = barsHtml(zp, false);
    ['p1', 'p2'].forEach((p) => {
      const starts = (zp.starts.blocks && zp.starts.blocks[p]) || [];
      $$(`.blk[data-who="${p}"]`, card).forEach((b, i) => { $('[data-b=start]', b).placeholder = starts[i] ? `auto: ${starts[i]}` : 'auto'; });
    });
    $('[data-k=bonusStart]', card).placeholder = zp.starts.bonus ? `auto: ${zp.starts.bonus}` : 'auto';
  }

  // ---------- Szenario-Karten ----------
  function cardHtml(s) {
    const block = (p, b, i) => `<div class="blk" data-who="${p}">
          <select data-b="typ" aria-label="Art des Blocks"><option value="basis"${b.typ === 'basis' ? ' selected' : ''}>Basis</option><option value="plus"${b.typ === 'plus' ? ' selected' : ''}>Plus</option></select>
          <label>Monate<input type="number" min="0" max="32" step="1" data-b="n" value="${b.n}"></label>
          <label>ab Lebensmonat<input type="number" min="1" max="32" step="1" data-b="start" placeholder="auto" value="${b.start ?? ''}"></label>
          <button type="button" class="secondary" data-act="delblk" data-who="${p}" data-i="${i}" title="Block entfernen" aria-label="Block entfernen">×</button>
        </div>`;
    const row = (p, i) => `
      <div class="prow">
        <strong class="pn" data-who="${i}">${esc(state.parents[i].name)}</strong>
        <div class="blocks">
          ${p === 'p2' && state.mutterschutz ? `<p class="vnote">Mutterschutz: Lebensmonat 1–${MUTTERSCHUTZ_MONATE} (zählt automatisch als Basis)</p>` : ''}
          ${s[p].blocks.map((b, k) => block(p, b, k)).join('')}
          <button type="button" class="secondary" data-act="addblk" data-who="${p}">+ Zeitraum hinzufügen</button>
        </div>
        <label>Std./Woche Plus<input type="number" min="0" max="60" step="0.5" data-k="${p}.hPlus" value="${s[p].hPlus}"></label>
        <label>Std./Woche Bonus<input type="number" min="0" max="60" step="0.5" data-k="${p}.hBonus" value="${s[p].hBonus}"></label>
        <details class="ov">
          <summary>Teilzeit-Netto selbst eintragen</summary>
          <label>Netto Plus, €<input type="number" min="0" step="10" placeholder="Schätzung" data-k="${p}.nettoPlus" value="${s[p].nettoPlus ?? ''}"></label>
          <label>Netto Bonus, €<input type="number" min="0" step="10" placeholder="Schätzung" data-k="${p}.nettoBonus" value="${s[p].nettoBonus ?? ''}"></label>
        </details>
      </div>`;
    return `<div class="card scen" data-id="${s.id}">
      <div class="shead">
        <input type="text" class="sname" value="${esc(s.name)}" placeholder="Name des Szenarios" aria-label="Name des Szenarios">
        <button type="button" data-act="dup" class="secondary" title="Duplizieren">Kopie</button>
        <button type="button" data-act="del" class="secondary" title="Löschen">Löschen</button>
      </div>
      ${row('p1', 0)}${row('p2', 1)}
      <div class="bonusrow">
        <label class="bonus">Bonus-Monate (beide, 0 oder 2–4)<input type="number" min="0" max="4" step="1" data-k="bonus" value="${s.bonus}"></label>
        <label class="bonus">Bonus ab Lebensmonat<input type="number" min="1" max="32" step="1" data-k="bonusStart" placeholder="auto" value="${s.bonusStart ?? ''}"></label>
      </div>
      <div class="tl">
        <div class="tl-title">Zeitplan (Lebensmonate)</div>
        <div class="tl-bars"></div>
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
      derive(s);
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
    + 'Der Link „Woher kommt das?“ unter dem Betrag öffnet den Rechenweg unter der Tabelle.';
  // Rechenweg als Karte je Szenario (Mini-Tabelle statt langer Textliste)
  function verlustKarte(x) {
    const [n1, n2] = state.parents.map((p) => esc(p.name));
    const kopf = `<h4><span>${esc(x.s.name || 'Szenario')}</span> <span class="neg">Verlust ${eur(x.r.verlustElterngeld)}</span></h4>`;
    if (!x.ok) return `<article class="vcard" id="vc-${x.s.id}">${kopf}<p class="vnote">Szenario ungültig, daher kein Rechenweg.</p></article>`;
    const bloecke = [];
    [['p1', x.e1, n1], ['p2', x.e2, n2]].forEach(([w, e, n]) => {
      [['plus', 'Plus', x.s[w].plus, x.s[w].hPlus], ['bonus', 'Bonus', x.s.bonus, x.s[w].hBonus]].forEach(([k, label, monate, std]) => {
        if (!(monate > 0)) return;
        const b = e[k], max = e.ohneArbeit.plus, proMonat = max - b.mitZuschlag, anteil = b.rate * b.diff;
        const grund = b.kappung === 'min' ? ' Das liegt unter dem Mindestbetrag, gezahlt wird dieser.'
          : anteil >= b.halbOhneEinkommen ? ' Das erreicht die Obergrenze (½ Basis).' : '';
        bloecke.push(`<section class="vblock"><div class="vwer"><strong>${n}</strong> <small>${label} · ${monate} Monate · ${std.toLocaleString('de-DE')} Std./Woche</small></div>`
          + `<dl class="vzahlen">`
          + `<div><dt>Netto Teilzeit</dt><dd>${eur2(b.nettoNachher)}</dd></div>`
          + `<div><dt>Elterngeld pro Monat</dt><dd><strong>${eur2(b.mitZuschlag)}</strong><small>statt ${eur2(max)}</small></dd></div>`
          + `<div><dt>Verlust</dt><dd class="${proMonat > 0 ? 'neg' : ''}">${proMonat > 0 ? `<strong>${eur2(proMonat * monate)}</strong><small>${eur2(proMonat)} × ${monate}</small>` : '<strong>kein Verlust</strong>'}</dd></div>`
          + `</dl>`
          + `<p class="vformel">${rate(b.rate)} × (${eur2(b.bemessung)} − ${eur2(b.nettoNachher)}) = ${eur2(anteil)}.${grund} Obergrenze ½ Basis: ${eur2(b.halbOhneEinkommen)}.</p></section>`);
      });
    });
    const notes = [];
    if (x.s.p1.basis > 0 || x.r.basis2 > x.r.mutterschutz) notes.push('Basis-Monate ohne Arbeit: volles Elterngeld, kein Verlust.');
    if (x.r.mutterschutz > 0) notes.push(`Mutterschutz (${x.r.mutterschutz} Monate): Mutterschaftsgeld wird angerechnet, kein zusätzliches Elterngeld, zählt nicht als Verlust.`);
    if (!bloecke.length) notes.push('Keine Plus- oder Bonus-Monate: volles Elterngeld ohne Anrechnung.');
    return `<article class="vcard" id="vc-${x.s.id}">${kopf}${bloecke.join('')}${notes.map((t) => `<p class="vnote">${t}</p>`).join('')}`
      + `<p class="sum">Maximum ${eur(x.r.maximum)} − Elterngeld ${eur(x.r.elterngeld)} = <strong class="neg">${eur(x.r.verlustElterngeld)}</strong></p></article>`;
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
        (x) => `<strong class="neg">${eur(x.r.verlustElterngeld)}</strong><br><small>${pct(x.r.verlustElterngeld, x.r.maximum)} vom Maximum</small><br><button type="button" class="linkbtn" data-act="why" data-sid="${x.s.id}">Woher kommt das? ↓</button>`,
        (x) => (x.r.verlustElterngeld === bestEg ? 'best' : '')],
      ['Netto bei Vollverdienst (gleiche Monate)', (x) => eur(x.r.referenz), null],
      ['Verlust ggü. Vollverdienst', (x) => `<strong class="neg">${eur(x.r.verlust)}</strong><br><small>${pct(x.r.verlust, x.r.referenz)} vom Vollverdienst</small>`, (x) => (x.r.verlust === bestVerlust ? 'best' : '')],
    ];
    const head = `<tr><th></th>${res.map((x) => `<th>${esc(x.s.name || 'Szenario')}${x.ok ? '' : '<br><small class="neg">ungültig</small>'}</th>`).join('')}</tr>`;
    const body = rows.map(([label, fn, cls]) => `<tr><th scope="row">${label}</th>${res.map((x) => cell(x, fn, cls)).join('')}</tr>`);
    // Zeitplan zeigt auch ungültige Szenarien (dort sieht man, was nicht passt)
    body.splice(2, 0, `<tr><th scope="row">Zeitplan</th>${res.map((x) => `<td>${barsHtml(x.zp, true)}<small>bis Lebensmonat ${x.zp.ende}</small></td>`).join('')}</tr>`);
    $('#verlustCards').innerHTML = res.map(verlustKarte).join('');
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
  function act(a, id, d) {
    readDom();
    const i = state.scenarios.findIndex((s) => String(s.id) === String(id));
    if (a === 'add') state.scenarios.push(scen('Szenario ' + (state.scenarios.length + 1), { basis: 2 }, { basis: 12 }, 0, undefined, ms()));
    else if (a === 'dup' && i >= 0) {
      const c = JSON.parse(JSON.stringify(state.scenarios[i]));
      state.scenarios.splice(i + 1, 0, scen((c.name || 'Szenario') + ' (Kopie)', c.p1, c.p2, c.bonus, c.bonusStart));
    } else if (a === 'del' && i >= 0) state.scenarios.splice(i, 1);
    else if (a === 'addblk' && i >= 0 && (d.who === 'p1' || d.who === 'p2')) {
      const blocks = state.scenarios[i][d.who].blocks;
      if (blocks.length < MAX_BLOECKE) blocks.push({ typ: 'basis', start: undefined, n: 2 });
    } else if (a === 'delblk' && i >= 0 && (d.who === 'p1' || d.who === 'p2')) state.scenarios[i][d.who].blocks.splice(+d.i, 1);
    else if (a === 'reset') state.scenarios = beispiele(state.recht, ms());
    else return;
    save();
    renderCards();
    renderResults();
  }

  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile') { importFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; }
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'importFile') return;
    const t = ev.target;
    if (t.name === 'recht') { // Beispiele der alten Rechtslage gegen die der neuen austauschen (eigene Szenarien bleiben)
      const alt = state.recht;
      readDom();
      if (state.recht !== alt && sindBeispiele(alt)) state.scenarios = beispiele(state.recht, ms());
      save(); updateRecht(); renderCards(); renderResults();
      return;
    }
    update();
    if (t.id === 'mutterschutz') { renderCards(); renderResults(); } // Beschriftung/Mindestwert der Mutter-Basis-Monate
  });
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'why') { // Rechenweg-Feld unter der Tabelle öffnen und zur passenden Karte springen
      $('#verlustPanel').open = true;
      const karte = $('#vc-' + b.dataset.sid);
      if (karte) {
        karte.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        karte.classList.add('flash');
        setTimeout(() => karte.classList.remove('flash'), 1800);
      }
      return;
    }
    if (b.dataset.act === 'export') { exportFile(); return; }
    act(b.dataset.act, b.closest('.scen')?.dataset.id, b.dataset);
  });

  load();
  writeParents();
  renderCards();
  updateRecht();
  updateNames();
  renderResults();
})();
