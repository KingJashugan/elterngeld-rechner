(function () {
  const E = window.Elterngeld;
  const KEY = 'egr-state-v2'; // v2: Mutterschutz-Regel, neue Beispiele (alter Stand v1 wird nicht übernommen)
  const eur = (x) => x.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0) + ' %';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  const opt = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? Math.max(0, x) : undefined; };

  // ---------- Zustand ----------
  const sp = (o) => ({ basis: 0, plus: 0, hPlus: 20, hBonus: 28, nettoPlus: undefined, nettoBonus: undefined, ...o });
  let nextId = 1;
  const scen = (name, p1, p2, bonus) => ({ id: nextId++, name, p1: sp(p1), p2: sp(p2), bonus: bonus || 0 });
  // Elternteil 1 = Vater, Elternteil 2 = Mutter (inkl. 2 Monate Mutterschutz in ihren Basis-Monaten)
  const MUTTERSCHUTZ_MONATE = 2;
  // Kontingent: 14 Basis-Monate, Plus zählt halb. Mutter: 2 Mutterschutz-Monate sind immer Basis.
  // Mutter 2 Basis + 12 Plus = 8, Vater 12 Plus = 6, zusammen 14.
  const beispiele = () => [
    scen('Mutter 12, Vater 2 Monate Basis', { basis: 2 }, { basis: 12 }),
    scen('Mutter 7, Vater 7 Monate Basis', { basis: 7 }, { basis: 7 }),
    scen('Vater 12 Basis, Mutter nur Mutterschutz (2)', { basis: 12 }, { basis: 2 }),
    scen('Mutter 2 Basis + 12 Plus, Vater 12 Plus (je 20 Std.)', { plus: 12 }, { plus: 12 }),
    scen('wie zuvor, dazu Bonus 4 Monate (je 28 Std.)', { plus: 12 }, { plus: 12 }, 4),
  ];
  const state = {
    parents: [
      { name: 'Ich (Vater)', netto: 3000, stundenAlt: 40 },
      { name: 'Partnerin (Mutter)', netto: 2200, stundenAlt: 40 },
    ],
    mutterschutz: true, geschwister: false, mehrlinge: 0,
    scenarios: beispiele(),
  };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw || !Array.isArray(raw.scenarios) || !Array.isArray(raw.parents) || raw.parents.length !== 2) return;
      state.parents = raw.parents.map((p) => ({ name: String(p.name || ''), netto: num(p.netto), stundenAlt: Math.max(1, num(p.stundenAlt)) }));
      state.mutterschutz = raw.mutterschutz !== false;
      state.geschwister = !!raw.geschwister;
      state.mehrlinge = Math.min(5, num(raw.mehrlinge));
      state.scenarios = raw.scenarios.map((s) => scen(String(s.name || ''), s.p1 || {}, s.p2 || {}, num(s.bonus)));
    } catch (e) { /* ohne Speicher weiterarbeiten */ }
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
        s[p] = { basis: Math.floor(num(g('basis'))), plus: Math.floor(num(g('plus'))), hPlus: num(g('hPlus')), hBonus: num(g('hBonus')), nettoPlus: opt(g('nettoPlus')), nettoBonus: opt(g('nettoBonus')) };
      });
    });
  }

  function writeParents() {
    ['p1', 'p2'].forEach((id, i) => {
      const el = $('#' + id), p = state.parents[i];
      $('.name', el).value = p.name; $('.netto', el).value = p.netto; $('.stunden-alt', el).value = p.stundenAlt;
    });
    $('#mutterschutz').checked = state.mutterschutz;
    $('#geschwister').checked = state.geschwister;
    $('#mehrlinge').value = state.mehrlinge;
  }

  // ---------- Szenario-Karten ----------
  function cardHtml(s) {
    const row = (p, i) => `
      <div class="prow">
        <strong class="pn">${esc(state.parents[i].name)}</strong>
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
    return `<div class="card scen" data-id="${s.id}">
      <div class="shead">
        <input type="text" class="sname" value="${esc(s.name)}" placeholder="Name des Szenarios" aria-label="Name des Szenarios">
        <button type="button" data-act="dup" class="secondary" title="Duplizieren">Kopie</button>
        <button type="button" data-act="del" class="secondary" title="Löschen">Löschen</button>
      </div>
      ${row('p1', 0)}${row('p2', 1)}
      <label class="bonus">Bonus-Monate (beide, 0 oder 2–4)<input type="number" min="0" max="4" step="1" data-k="bonus" value="${s.bonus}"></label>
      <p class="warn" hidden></p>
    </div>`;
  }

  function renderCards() {
    $('#scen').innerHTML = state.scenarios.map(cardHtml).join('');
  }

  // ---------- Berechnung ----------
  function compute() {
    const opts = { geschwister: state.geschwister, mehrlinge: state.mehrlinge };
    const [a, b] = state.parents;
    return state.scenarios.map((s) => {
      const mk = (par, x) => ({ netto: par.netto, stundenAlt: par.stundenAlt, stundenPlus: x.hPlus, stundenBonus: x.hBonus, nettoPlus: x.nettoPlus, nettoBonus: x.nettoBonus });
      const e1 = E.elternteil(mk(a, s.p1), opts), e2 = E.elternteil(mk(b, s.p2), opts);
      const plan = { p1: { basis: s.p1.basis, plus: s.p1.plus, bonus: s.bonus }, p2: { basis: s.p2.basis, plus: s.p2.plus, bonus: s.bonus } };
      const r = E.szenario(plan, e1, e2, a, b, state.mutterschutz ? MUTTERSCHUTZ_MONATE : 0);
      const warn = [...r.fehler];
      if (r.monate === 0) warn.push('Keine Monate eingetragen.');
      return { s, r, warn, ok: warn.length === 0 };
    });
  }

  function renderResults() {
    const res = compute();
    $$('.scen').forEach((el, i) => {
      const w = $('.warn', el), x = res[i];
      w.textContent = x.warn.join(' · ');
      w.hidden = x.ok;
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
      ['Verlust beim Elterngeld', (x) => `<strong class="neg">${eur(x.r.verlustElterngeld)}</strong><br><small>${pct(x.r.verlustElterngeld, x.r.maximum)} vom Maximum</small>`, (x) => (x.r.verlustElterngeld === bestEg ? 'best' : '')],
      ['Netto bei Vollverdienst (gleiche Monate)', (x) => eur(x.r.referenz), null],
      ['Verlust ggü. Vollverdienst', (x) => `<strong class="neg">${eur(x.r.verlust)}</strong><br><small>${pct(x.r.verlust, x.r.referenz)} vom Vollverdienst</small>`, (x) => (x.r.verlust === bestVerlust ? 'best' : '')],
    ];
    const head = `<tr><th></th>${res.map((x) => `<th>${esc(x.s.name || 'Szenario')}${x.ok ? '' : '<br><small class="neg">ungültig</small>'}</th>`).join('')}</tr>`;
    const body = rows.map(([label, fn, cls]) => `<tr><th scope="row">${label}</th>${res.map((x) => cell(x, fn, cls)).join('')}</tr>`).join('');
    $('#vergleich').innerHTML = res.length ? head + body : '<tr><td>Noch kein Szenario. Mit „+ Neues Szenario“ anlegen.</td></tr>';
  }

  function update() {
    readDom();
    $$('.pn').forEach((el, i) => { el.textContent = state.parents[i % 2].name; });
    save();
    renderResults();
  }

  // ---------- Aktionen ----------
  function act(a, id) {
    readDom();
    const i = state.scenarios.findIndex((s) => String(s.id) === String(id));
    if (a === 'add') state.scenarios.push(scen('Szenario ' + (state.scenarios.length + 1), { basis: 2 }, { basis: 12 }));
    else if (a === 'dup' && i >= 0) {
      const c = JSON.parse(JSON.stringify(state.scenarios[i]));
      state.scenarios.splice(i + 1, 0, scen((c.name || 'Szenario') + ' (Kopie)', c.p1, c.p2, c.bonus));
    } else if (a === 'del' && i >= 0) state.scenarios.splice(i, 1);
    else if (a === 'reset') state.scenarios = beispiele();
    else return;
    save();
    renderCards();
    renderResults();
  }

  document.addEventListener('input', (ev) => {
    update();
    if (ev.target.id === 'mutterschutz') { renderCards(); renderResults(); } // Beschriftung/Mindestwert der Mutter-Basis-Monate
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
    if (b) act(b.dataset.act, b.closest('.scen')?.dataset.id);
  });

  load();
  writeParents();
  renderCards();
  $$('.pn').forEach((el, i) => { el.textContent = state.parents[i % 2].name; });
  renderResults();
})();
