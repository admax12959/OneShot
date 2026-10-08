/* Battery — menubar popover + management view. One source: OS.data.battery + prefs battery.*. */
(function () {
  const esc = OS.ui.esc, ic = OS.ui.icon;
  const HOT = 40;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (min) => { min = Math.max(1, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${pad(m)} m` : `${h} h`) : `${m} m`; };

  function mkHistory(charge) {
    const h24 = [], d7 = [];
    for (let i = 0; i < 24; i++) h24.push(Math.round(clamp(58 + 24 * Math.sin(i / 3.4 + 0.8), 20, 100)));
    for (let d = 0; d < 7; d++) { const day = []; for (let i = 0; i < 24; i++) day.push(Math.round(clamp(62 + 28 * Math.sin((d * 24 + i) / 4.2 + d), 18, 100))); d7.push(day); }
    h24[23] = charge; d7[6][23] = charge;
    return { h24, d7 };
  }
  const base = (history) => ({ charge: 62, plugged: true, temp: 33, health: 91, cycles: 214, history });

  /* effective conditions (scenarios are conditions, not data) */
  const plugged = (d) => d.plugged && !OS.scn('battery.unplugged');
  const temp = (d) => (OS.scn('battery.hot') ? 41 : d.temp);
  const hot = (d) => temp(d) >= HOT;

  function status(d) {
    const helper = OS.perm.has('helper'), limitOn = OS.pref('battery.limitOn'), limit = OS.pref('battery.limit'), c = d.charge;
    if (!plugged(d)) return { k: 'battery', step: -1, line: c <= 0 ? 'On battery · empty' : `On battery · ${fmt(c * 6)} left` };
    if (OS.pref('battery.pauseHot') && hot(d)) return { k: 'paused', step: 0, line: 'Paused — Mac is hot' };
    if (limitOn && !helper) return { k: 'nohelper', step: c < 100 ? 1 : 0, line: 'Limit off — helper not installed' };
    if (limitOn) {
      if (c >= limit) return { k: 'holding', step: 0, line: `Holding at ${limit}%` };
      return { k: 'charging', step: 1, line: `Charging · ${fmt((limit - c) * 1.3)} to ${limit}%` };
    }
    if (c >= 100) return { k: 'full', step: 0, line: 'Fully charged' };
    return { k: 'charging', step: 1, line: `Charging · ${fmt((100 - c) * 1.3)} to 100%` };
  }
  const limitActive = () => OS.pref('battery.limitOn') && OS.perm.has('helper');

  /* simulated tick: 1 % every ~2 s; a clock skip moves 1 % per simulated minute */
  let beat = 0;
  function step(n) {
    const d = OS.data.battery; let moved = false;
    OS.commit('battery', (b) => {
      for (let i = 0; i < n; i++) {
        const s = status(b).step;
        if (!s) break;
        b.charge = clamp(b.charge + s, 0, 100); moved = true;
        if (b.history.h24.length) b.history.h24[b.history.h24.length - 1] = b.charge;
        if (b.history.d7.length) { const last = b.history.d7[b.history.d7.length - 1]; if (last.length) last[last.length - 1] = b.charge; }
      }
    });
    return moved && d;
  }
  function onTick(ms) {
    if (typeof ms === 'number' && ms > 0) return step(Math.min(100, Math.max(1, Math.round(ms / 60000))));
    if (++beat % 2 === 0) step(1);
  }

  /* ---------- limit control (popover) ---------- */
  function limitSlot(slot) {
    slot.innerHTML = '';
    if (!OS.perm.has('helper')) {
      slot.className = 'bt-lim bt-compact';
      const g = document.createElement('div'); slot.appendChild(g);
      OS.ui.grant(g, 'helper', 'Charge limit needs the privileged helper to hold charging at a level.');
      return false;
    }
    slot.className = 'bt-lim';
    const p = OS.get('battery').prefs.find((x) => x.key === 'limit');
    slot.innerHTML = `<div class="bt-lrow"><b>Limit charging</b><button class="sw" role="switch" data-lt aria-label="Limit charging"></button></div>
      <div class="bt-lrow"><input type="range" data-ls min="${p.min}" max="${p.max}" step="${p.step}" aria-label="Charge limit"><span class="mono" data-lo></span></div>`;
    slot.querySelector('[data-lt]').onclick = () => OS.setPref('battery.limitOn', !OS.pref('battery.limitOn'));
    slot.querySelector('[data-ls]').addEventListener('input', (e) => { const n = +e.target.value; slot.querySelector('[data-lo]').textContent = n + '%'; OS.setPref('battery.limit', n); });
    return true;
  }

  function popover(el) {
    let failed = null, update = () => {}, rePerm = () => {};
    const draw = () => {
      const f = OS.scn('battery.fail');
      if (f) {
        failed = true;
        el.innerHTML = `<div class="bt-pop"><div class="pop-h">${ic('i-bat')}Battery</div><div class="pop-b" data-f></div></div>`;
        OS.ui.state(el.querySelector('[data-f]'), { kind: 'failure', compact: true, title: 'Couldn’t load battery', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => { OS.scn('battery.fail') ? OS.ui.toast('Still can’t reach the store', { icon: 'i-bat', ms: 2000 }) : draw(); } } });
      } else if (failed !== false) { failed = false; main(); }
    };
    function main() {
    el.innerHTML = `<div class="bt-pop"><div class="pop-h">${ic('i-bat')}Battery<span class="muted" data-src></span></div>
      <div class="pop-b"><div class="bt-big"><b data-pct></b><span class="bt-line" data-line></span></div>
        <div class="bt-bar" data-bar><i class="bt-fill" data-fill></i><u class="bt-mark" data-mark><em data-ml></em></u></div>
        <div class="bt-meta muted" data-meta></div><div data-slot></div></div>
      <div class="pop-f"><button class="btn ghost" data-set>${ic('i-sliders', 's')}Battery settings…</button></div></div>`;
    const q = (s) => el.querySelector(s), slot = q('[data-slot]');
    q('[data-set]').onclick = () => OS.open('battery');
    let has = limitSlot(slot);
    const upd = () => {
      const d = OS.data.battery, st = status(d), lim = OS.pref('battery.limit'), on = OS.pref('battery.limitOn');
      q('[data-pct]').textContent = d.charge + '%'; q('[data-line]').textContent = st.line;
      q('[data-src]').textContent = plugged(d) ? 'Power adapter' : 'Battery';
      const f = q('[data-fill]'); f.style.width = d.charge + '%'; f.className = 'bt-fill ' + (st.k === 'paused' ? 'paused' : st.k === 'battery' ? (d.charge <= 20 ? 'low' : 'battery') : '');
      const m = q('[data-mark]'); m.hidden = !limitActive(); m.style.left = lim + '%'; q('[data-ml]').textContent = lim + '%';
      q('[data-meta]').textContent = `${temp(d)} °C · Health ${d.health}% · ${d.cycles} cycles` + (limitActive() ? ` · Limit ${lim}%` : '');
      if (has) {
        const t = slot.querySelector('[data-lt]'); t.setAttribute('aria-checked', on);
        const s = slot.querySelector('[data-ls]'); s.disabled = !on;
        if (s !== document.activeElement) s.value = lim;
        slot.querySelector('[data-lo]').textContent = lim + '%';
      }
    };
    upd();
    update = upd; rePerm = () => { has = limitSlot(slot); upd(); };
    }
    draw();
    OS.watch(el, 'change:battery prefs scn', () => { draw(); if (!failed) update(); });
    OS.watch(el, 'perm', () => { if (!failed) rePerm(); });
  }

  /* ---------- management view ---------- */
  let range = 'h24';
  function chart(host, d) {
    const hist = range === 'h24' ? d.history.h24 : [].concat(...d.history.d7);
    if (!hist.length) return OS.ui.state(host, { kind: 'empty', icon: 'i-chart', title: 'Collecting battery history', body: 'Charge history appears here after the first hours of use.' });
    const W = 640, H = 240, L = 34, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
    const X = (i) => L + (hist.length === 1 ? iw : (i / (hist.length - 1)) * iw), Y = (v) => T + ih - (v / 100) * ih;
    const pts = hist.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    const lim = OS.pref('battery.limit'), on = limitActive();
    const ticks = range === 'h24' ? [['−24 h', 0], ['−12 h', .5], ['now', 1]] : [['−7 d', 0], ['−3 d', 3 / 7], ['now', 1]];
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Charge history">
      ${[0, 25, 50, 75, 100].map((v) => `<line class="bt-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="bt-ax" x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${v}%</text>`).join('')}
      ${ticks.map(([t, f]) => `<text class="bt-ax" x="${L + f * iw}" y="${H - 8}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${t}</text>`).join('')}
      <polygon class="bt-area" points="${X(0)},${Y(0)} ${pts.join(' ')} ${X(hist.length - 1)},${Y(0)}"/>
      <polyline class="bt-line-p" data-line points="${pts.join(' ')}"/>
      <line class="bt-limit-line ${on ? '' : 'off'}" data-limit-line data-limit="${lim}" data-on="${on}" x1="${L}" x2="${W - R}" y1="${Y(lim)}" y2="${Y(lim)}"/>
      <text class="bt-limit-lbl ${on ? '' : 'off'}" x="${W - R - 4}" y="${Y(lim) - 5}" text-anchor="end">${on ? `Limit ${lim}%` : `Limit ${lim}% (off)`}</text></svg>`;
  }

  function view(el) {
    el.innerHTML = `<div class="bt-view"><div class="bt-main" data-main></div><aside class="pane">
      <div class="bt-pane-h">Charge limit</div><div data-lim></div>
      <div class="bt-pane-h" style="margin-top:14px">When charging</div><div data-oth></div>
      <div class="bt-pane-h" style="margin-top:14px">Menu bar</div><div data-bar></div></aside></div>`;
    /* shell skips redrawing the control that has focus; a clicked switch/segment must not keep it */
    el.addEventListener('click', (e) => { const c = e.target.closest('.sw[data-k], .seg[data-k] button'); if (c) c.blur(); }, true);
    const main = el.querySelector('[data-main]'), lim = el.querySelector('[data-lim]');
    const drawLim = () => {
      if (OS.perm.has('helper')) { lim.className = ''; lim.innerHTML = ''; const g = document.createElement('div'); lim.appendChild(g); OS.prefs.render(g, 'battery', { keys: ['limitOn', 'limit'], hotkeys: false }); }
      else { lim.className = 'bt-compact'; lim.innerHTML = ''; const g = document.createElement('div'); lim.appendChild(g); OS.ui.grant(g, 'helper', 'Charge limit needs the privileged helper to hold charging at a level.'); }
    };
    drawLim();
    OS.watch(lim, 'perm', drawLim);
    OS.prefs.render(el.querySelector('[data-oth]'), 'battery', { keys: ['pauseHot'], hotkeys: false });
    OS.prefs.render(el.querySelector('[data-bar]'), 'battery', { keys: ['showPercent'], hotkeys: false });
    const draw = () => {
      const d = OS.data.battery, st = status(d);
      const tag = { charging: ['ok', 'Charging'], holding: ['ok', 'Holding'], paused: ['warn', 'Paused — hot'], battery: ['', 'On battery'], nohelper: ['warn', 'Limit off'], full: ['ok', 'Full'] }[st.k];
      main.innerHTML = `<div class="bt-note"><span class="tag ${tag[0]}">${tag[1]}</span><span>${esc(st.line)}</span></div>
        <div class="bt-stats">
          <div class="bt-stat"><div class="l">${ic('i-bat', 's')}Charge</div><div class="v" data-v="charge">${d.charge}%</div></div>
          <div class="bt-stat"><div class="l">${ic('i-heart', 's')}Health</div><div class="v" data-v="health">${d.health}%</div></div>
          <div class="bt-stat"><div class="l">${ic('i-cycle', 's')}Cycles</div><div class="v" data-v="cycles">${d.cycles}</div></div>
          <div class="bt-stat"><div class="l">${ic('i-thermo', 's')}Temperature</div><div class="v" data-v="temp">${temp(d)} °C</div></div></div>
        <div class="bt-ch"><h2>Charge history</h2><div class="seg"><button data-r="h24" aria-pressed="${range === 'h24'}">24 h</button><button data-r="d7" aria-pressed="${range === 'd7'}">7 d</button></div></div>
        <div class="bt-chart" data-chart></div>`;
      chart(main.querySelector('[data-chart]'), d);
      main.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; draw(); }));
    };
    draw();
    OS.watch(el, 'change:battery prefs scn perm', draw);
  }

  OS.feature({
    id: 'battery', name: 'Battery', icon: 'i-bat',
    seed: () => base(mkHistory(62)),
    empty: () => base({ h24: [], d7: [] }),
    prefs: [
      { key: 'limitOn', label: 'Limit charging', type: 'toggle', default: false, needs: 'helper', effect: 'Charging holds at the limit instead of continuing to 100%.' },
      { key: 'limit', label: 'Charge limit', type: 'slider', min: 50, max: 100, step: 5, unit: '%', default: 80, effect: 'Sets the hold point, the chart limit line and the time estimate target.' },
      { key: 'pauseHot', label: 'Pause charging when hot', type: 'toggle', default: true, effect: 'When the Mac is hot, charging pauses and the popover says “Paused — Mac is hot”.' },
      { key: 'showPercent', label: 'Show percentage in menu bar', type: 'toggle', default: true, effect: 'Adds the charge level next to the battery icon in the menu bar.' },
    ],
    scenarios: [{ key: 'hot', label: 'Mac is hot (41 °C)' }, { key: 'unplugged', label: 'On battery power' }],
    menubar: { icon: 'i-bat', order: 10, label: () => (OS.pref('battery.showPercent') ? OS.data.battery.charge + '%' : ''), render: popover },
    view: { title: 'Battery', mount: (el) => OS.ui.load(el, 'battery', view) },
    init() { OS.on('tick', onTick); },
  });
})();
