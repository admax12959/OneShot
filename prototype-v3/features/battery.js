/* Battery — menubar popover + management view. One source: OS.data.battery + prefs battery.*.
   v3: BatterySampler card + persisted history (5 min for 24 h, hourly for 7 d), helper states (G5), fail-safe, wake re-apply. */
(function () {
  const esc = OS.ui.esc, ic = OS.ui.icon;
  const HOT = 40, MIN = 60000, HOUR = 3600000, DAY = 86400000, FIVE = 5 * MIN;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (min) => { min = Math.max(1, Math.round(min)); const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h} h ${pad(m)} m` : `${h} h`) : `${m} m`; };
  const agoText = (t) => { const s = Math.max(0, Math.round((OS.now() - t) / 1000)); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`; };

  /* history: [{t, c}] ascending. Seeded on the simulated clock: 5-minute samples for 24 h, hourly before that. */
  function mkHist(charge) {
    const now = OS.now(), h = [];
    const raw = (t) => 60 + 27 * Math.sin((t - now) / HOUR / 3.6 + 0.8) + 8 * Math.sin((t - now) / HOUR / 1.3);
    const at = (t) => Math.round(clamp(raw(t) + (charge - raw(now)) * Math.max(0, 1 - (now - t) / (4 * HOUR)), 18, 100));   // lands on the current charge
    for (let t = now - 7 * DAY + HOUR; t < now - DAY; t += HOUR) h.push({ t: Math.round(t), c: at(t) });
    for (let t = now - DAY; t < now - 2 * MIN; t += FIVE) h.push({ t: Math.round(t), c: at(t) });
    h.push({ t: now, c: charge });
    return h;
  }
  /* keep it bounded: nothing older than 7 d; before the last 24 h only one sample per hour */
  function prune(b, now) {
    const c7 = now - 7 * DAY, c24 = now - DAY; let lastH = null;
    b.hist = b.hist.filter((s) => {
      if (s.t < c7) return false;
      if (s.t >= c24) return true;
      const hb = Math.floor(s.t / HOUR); if (hb === lastH) return false; lastH = hb; return true;
    });
  }
  const base = (hist) => ({ charge: 62, plugged: true, temp: 33, health: 91, cycles: 214, hist, sampledAt: OS.now() - 12000 });

  /* effective conditions (scenarios are conditions, not data) */
  const plugged = (d) => d.plugged && !OS.scn('battery.unplugged');
  const temp = (d) => (OS.scn('battery.hot') ? 41 : d.temp);
  const hot = (d) => temp(d) >= HOT;
  const hs = () => OS.perm.state('helper');
  const failsafe = () => hs() === 'granted' && OS.scn('battery.helperDisconnect');
  const limitActive = () => OS.pref('battery.limitOn') && hs() === 'granted' && !failsafe();
  const helperLine = () => (hs() === 'granted' ? `Helper ${OS.helperBundled}` : hs() === 'outdated' ? `Helper ${OS.helperInstalled} · update to ${OS.helperBundled}` : '');

  function status(d) {
    const s = hs(), limitOn = OS.pref('battery.limitOn'), limit = OS.pref('battery.limit'), c = d.charge;
    if (!plugged(d)) return { k: 'battery', step: -1, line: c <= 0 ? 'On battery · empty' : `On battery · ${fmt(c * 6)} left` };
    if (failsafe()) return { k: 'failsafe', step: c < 100 ? 1 : 0, line: 'Charging is back under macOS control', est: c < 100 ? `Charging · ${fmt((100 - c) * 1.3)} to 100%` : 'Fully charged' };
    if (OS.pref('battery.pauseHot') && hot(d)) return { k: 'paused', step: 0, line: 'Paused — Mac is hot' };
    if (limitOn && (s === 'missing' || s === 'approval' || s === 'outdated')) {
      return { k: 'nohelper', step: c < 100 ? 1 : 0, line: s === 'missing' ? 'Limit off — helper not installed' : s === 'approval' ? 'Limit off — helper needs approval' : `Limit off — helper ${OS.helperInstalled} needs updating` };
    }
    if (limitOn && s === 'granted') {
      if (OS.scn('battery.wake')) return { k: 'reapply', step: 0, line: 'Re-applying limit…' };
      if (c >= limit) return { k: 'holding', step: 0, line: `Holding at ${limit}%` };
      return { k: 'charging', step: 1, line: `Charging · ${fmt((limit - c) * 1.3)} to ${limit}%` };
    }
    if (c >= 100) return { k: 'full', step: 0, line: 'Fully charged' };
    return { k: 'charging', step: 1, line: `Charging · ${fmt((100 - c) * 1.3)} to 100%` };
  }
  const TAG = { charging: ['ok', 'Charging'], holding: ['ok', 'Holding'], reapply: ['', 'Re-applying'], paused: ['warn', 'Paused — hot'], battery: ['', 'On battery'], nohelper: ['warn', 'Limit off'], full: ['ok', 'Full'], failsafe: ['', 'macOS control'] };

  /* ---------- sampler: charge moves 1 % per ~2 s live, 1 % per simulated minute on a clock skip ---------- */
  let beat = 0;
  function advance(n, skipped) {
    OS.commit('battery', (b) => {
      const now = OS.now();
      for (let i = 1; i <= n; i++) {
        const st = status(b).step;
        if (st) { b.charge = clamp(b.charge + st, 0, 100); b.sampledAt = now; }
        const t = skipped ? now - (n - i) * MIN : now, last = b.hist[b.hist.length - 1];
        if (!last || t - last.t >= FIVE) b.hist.push({ t, c: b.charge });
      }
      if (skipped) b.sampledAt = now;
      prune(b, now);
    });
  }
  function onTick(ms) {
    if (typeof ms === 'number' && ms > 0) return advance(Math.min(10080, Math.max(1, Math.round(ms / MIN))), true);
    const b = OS.data.battery;
    if (++beat % 2 === 0 && status(b).step) return advance(1, false);
    if (OS.now() - b.sampledAt >= MIN) OS.commit('battery', (x) => { x.sampledAt = OS.now(); });   // temperature every minute
  }
  const sampleNow = () => OS.commit('battery', (b) => { const now = OS.now(); b.sampledAt = now; b.hist.push({ t: now, c: b.charge }); prune(b, now); });

  /* ---------- helper pieces ---------- */
  function reconnect() {
    OS.setScn('battery.helperDisconnect', false);
    OS.ui.toast('Charge helper reconnected', { sub: OS.pref('battery.limitOn') ? 'The charge limit is applied again.' : 'Charge limit is available again.', icon: 'i-shield', ms: 2600 });
  }
  const failNote = () => OS.ui.note('XPC invalidationHandler → helper re-enables charging; app shows .failSafe');

  /* ---------- limit control (popover) ---------- */
  function limitSlot(slot) {
    slot.innerHTML = '';
    if (hs() !== 'granted') {
      slot.className = 'bt-lim bt-compact';
      const g = document.createElement('div'); slot.appendChild(g);
      OS.ui.grant(g, 'helper', 'Charge limit needs the privileged helper to hold charging at a level.');
      return false;
    }
    slot.className = 'bt-lim';
    const p = OS.get('battery').prefs.find((x) => x.key === 'limit'), fs = failsafe();
    slot.innerHTML = `<div class="bt-lrow"><b>Limit charging</b><button class="sw" role="switch" data-lt aria-label="Limit charging" ${fs ? 'disabled' : ''}></button></div>
      <div class="bt-lrow"><input type="range" data-ls min="${p.min}" max="${p.max}" step="${p.step}" aria-label="Charge limit"><span class="mono" data-lo></span></div>
      ${fs ? '<div class="bt-why">Available again when the helper reconnects.</div>' : ''}`;
    slot.querySelector('[data-lt]').onclick = () => OS.setPref('battery.limitOn', !OS.pref('battery.limitOn'));
    slot.querySelector('[data-ls]').addEventListener('input', (e) => { const n = +e.target.value; slot.querySelector('[data-lo]').textContent = n + '%'; OS.setPref('battery.limit', n); });
    return true;
  }

  function popover(el) {
    let failed = null, update = () => {};
    const draw = () => {
      if (OS.scn('battery.fail')) {
        failed = true;
        el.innerHTML = `<div class="bt-pop"><div class="pop-h">${ic('i-bat')}Battery</div><div class="pop-b" data-f></div></div>`;
        OS.ui.state(el.querySelector('[data-f]'), { kind: 'failure', compact: true, title: 'Couldn’t load battery', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => { OS.scn('battery.fail') ? OS.ui.toast('Still can’t reach the store', { icon: 'i-bat', ms: 2000 }) : draw(); } } });
      } else if (failed !== false) { failed = false; main(); }
    };
    function main() {
      el.innerHTML = `<div class="bt-pop"><div class="pop-h">${ic('i-bat')}Battery<span class="muted" data-src></span></div>
        <div class="pop-b"><div class="bt-big"><b data-pct></b><span class="bt-line" data-line></span></div>
          <div class="bt-bar" data-bar><i class="bt-fill" data-fill></i><u class="bt-mark" data-mark><em data-ml></em></u></div>
          <div class="bt-meta muted" data-meta></div><div class="bt-meta muted" data-sampled></div>
          <div class="bt-safe" data-safe hidden>${ic('i-shield', 's')}<span>Charging is back under macOS control</span><button class="btn" data-rc>Reconnect</button></div>
          <div data-slot></div></div>
        <div class="pop-f"><button data-set>Battery Settings…</button><div class="bt-hv muted" data-hv></div></div></div>`;
      const q = (s) => el.querySelector(s), slot = q('[data-slot]');
      q('[data-set]').onclick = () => OS.open('battery');
      q('[data-rc]').onclick = reconnect;
      let sig = null, has = false;
      const upd = () => {
        const d = OS.data.battery, st = status(d), lim = OS.pref('battery.limit'), on = OS.pref('battery.limitOn');
        const s = hs() + '|' + failsafe();
        if (s !== sig) { sig = s; has = limitSlot(slot); }
        q('[data-pct]').textContent = d.charge + '%'; q('[data-line]').textContent = st.est || st.line;
        q('[data-src]').textContent = plugged(d) ? 'Power adapter' : 'Battery';
        const f = q('[data-fill]'); f.style.width = d.charge + '%'; f.className = 'bt-fill ' + (st.k === 'paused' ? 'paused' : st.k === 'battery' ? (d.charge <= 20 ? 'low' : 'battery') : '');
        const m = q('[data-mark]'); m.hidden = !limitActive(); m.style.left = lim + '%'; q('[data-ml]').textContent = lim + '%';
        q('[data-meta]').textContent = `${temp(d)} °C · Health ${d.health}% · ${d.cycles} cycles` + (limitActive() ? ` · Limit ${lim}%` : '');
        q('[data-sampled]').textContent = `Sampled ${agoText(d.sampledAt)}`;
        q('[data-safe]').hidden = !failsafe();
        q('[data-hv]').textContent = helperLine();
        if (has) {
          const t = slot.querySelector('[data-lt]'); t.setAttribute('aria-checked', on);
          const sl = slot.querySelector('[data-ls]'); sl.disabled = !on || failsafe();
          if (sl !== document.activeElement) sl.value = lim;
          slot.querySelector('[data-lo]').textContent = lim + '%';
        }
      };
      upd(); update = upd;
    }
    draw();
    OS.watch(el, 'change:battery prefs scn perm', () => { draw(); if (!failed) update(); });
    OS.watch(el, 'tick', () => { const s = el.querySelector('[data-sampled]'); if (s && !failed) s.textContent = `Sampled ${agoText(OS.data.battery.sampledAt)}`; });
  }

  /* ---------- management view ---------- */
  let range = 'h24';
  function chart(host, d) {
    const now = OS.now(), span = range === 'h24' ? DAY : 7 * DAY, t0 = now - span;
    const inR = d.hist.filter((s) => s.t >= t0);
    if (inR.length < 12) return OS.ui.state(host, { kind: 'info', icon: 'i-chart', title: 'History fills in as OneShot runs', body: 'Charge is sampled every 5 minutes while your Mac is on. The chart appears after about an hour.', note: 'BatterySampler: IOPSNotificationCreateRunLoopSource + 60 s temperature timer' });
    const hist = inR.map((s) => [s.t, s.c]).concat([[now, d.charge]]);
    const W = 640, H = 230, L = 34, R = 12, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
    const X = (t) => L + ((t - t0) / span) * iw, Y = (v) => T + ih - (v / 100) * ih;
    const pts = hist.map(([t, v]) => `${X(t).toFixed(1)},${Y(v).toFixed(1)}`);
    const lim = OS.pref('battery.limit'), on = limitActive();
    const ticks = range === 'h24' ? [['−24 h', 0], ['−12 h', .5], ['now', 1]] : [['−7 d', 0], ['−3.5 d', .5], ['now', 1]];
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Charge history">
      ${[0, 25, 50, 75, 100].map((v) => `<line class="bt-grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="bt-ax" x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${v}%</text>`).join('')}
      ${ticks.map(([t, f]) => `<text class="bt-ax" x="${L + f * iw}" y="${H - 8}" text-anchor="${f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}">${t}</text>`).join('')}
      <polygon class="bt-area" points="${X(hist[0][0]).toFixed(1)},${Y(0)} ${pts.join(' ')} ${X(now).toFixed(1)},${Y(0)}"/>
      <polyline class="bt-line-p" data-line points="${pts.join(' ')}"/>
      <line class="bt-limit-line ${on ? '' : 'off'}" data-limit-line data-limit="${lim}" data-on="${on}" x1="${L}" x2="${W - R}" y1="${Y(lim)}" y2="${Y(lim)}"/>
      <text class="bt-limit-lbl ${on ? '' : 'off'}" x="${W - R - 4}" y="${Y(lim) - 5}" text-anchor="end">${on ? `Limit ${lim}%` : `Limit ${lim}% (off)`}</text></svg>`;
  }

  function view(el) {
    el.innerHTML = `<div class="bt-view"><div class="bt-col"><div class="toolbar"><div class="seg" data-seg><button data-r="h24">24 h</button><button data-r="d7">7 d</button></div><span class="grow"></span><span class="muted small" data-count></span></div>
      <div class="bt-main" data-main></div></div><aside class="pane">
      <div class="bt-pane-h">Charge limit</div><div data-lim></div>
      <div class="bt-pane-h" style="margin-top:14px">When charging</div><div data-oth></div>
      <div class="bt-pane-h" style="margin-top:14px">Menu bar</div><div data-bar></div>
      <div class="bt-pane-f muted small" data-hv></div></aside></div>`;
    /* shell skips redrawing the control that has focus; a clicked switch/segment must not keep it */
    el.addEventListener('click', (e) => { const c = e.target.closest('.sw[data-k], .seg[data-k] button'); if (c) c.blur(); }, true);
    const tb = OS.ui.toolbarTools();
    if (tb) {
      const b = document.createElement('button'); b.className = 'btn tb'; b.title = 'Sample now'; b.setAttribute('aria-label', 'Sample now'); b.dataset.sample = '1'; b.innerHTML = ic('i-cycle');
      b.onclick = () => { sampleNow(); OS.ui.toast('Battery sampled', { icon: 'i-bat', ms: 1600 }); };
      tb.insertBefore(b, tb.firstChild);
    }
    const q = (s) => el.querySelector(s), main = q('[data-main]'), lim = q('[data-lim]');
    const drawLim = () => {
      lim.innerHTML = '';
      const g = document.createElement('div');
      if (hs() === 'granted') {
        lim.className = failsafe() ? 'bt-locked' : '';
        lim.appendChild(g);
        OS.prefs.render(g, 'battery', { keys: ['limitOn', 'limit'], hotkeys: false });
        if (failsafe()) { g.inert = true; lim.insertAdjacentHTML('beforeend', '<div class="bt-why">Available again when the helper reconnects.</div>'); }
      } else { lim.className = 'bt-compact'; lim.appendChild(g); OS.ui.grant(g, 'helper', 'Charge limit needs the privileged helper to hold charging at a level.'); }
      q('[data-hv]').textContent = helperLine();
    };
    drawLim();
    OS.watch(lim, 'perm scn', drawLim);
    OS.prefs.render(q('[data-oth]'), 'battery', { keys: ['pauseHot'], hotkeys: false });
    OS.prefs.render(q('[data-bar]'), 'battery', { keys: ['showPercent'], hotkeys: false });
    q('[data-seg]').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { range = b.dataset.r; draw(); }));
    const draw = () => {
      const d = OS.data.battery, st = status(d), tag = TAG[st.k];
      OS.ui.subtitle(`${d.charge}% · ${plugged(d) ? 'Power adapter' : 'Battery'}`);
      q('[data-count]').textContent = `${d.hist.length} samples kept`;
      q('[data-seg]').querySelectorAll('[data-r]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.r === range));
      const safe = st.k === 'failsafe';
      main.innerHTML = `<div class="bt-note ${safe ? 'safe' : ''}">${safe ? ic('i-shield') : `<span class="tag ${tag[0]}">${tag[1]}</span>`}<span class="bt-nl"><b>${esc(st.line)}</b>${safe ? '<span class="muted small">The charge helper stopped responding. macOS manages charging until it reconnects.</span>' : ''}</span>${safe ? '<button class="btn" data-rc>Reconnect</button>' : ''}</div>${safe ? failNote() : ''}
        <section class="bt-sample"><div class="bt-sh"><b>Now</b><span class="muted small" data-ago>Sampled ${agoText(d.sampledAt)}</span></div>
          <div class="bt-stats">
            <div class="bt-stat"><div class="l">${ic('i-bat', 's')}Charge</div><div class="v" data-v="charge">${d.charge}%</div></div>
            <div class="bt-stat"><div class="l">${ic('i-bolt', 's')}State</div><div class="v" data-v="state">${esc(tag[1] === 'Limit off' || st.k === 'failsafe' ? 'Charging' : tag[1])}</div></div>
            <div class="bt-stat"><div class="l">${ic('i-plug', 's')}Power source</div><div class="v" data-v="source">${plugged(d) ? 'Power adapter' : 'Battery'}</div></div>
            <div class="bt-stat"><div class="l">${ic('i-thermo', 's')}Temperature</div><div class="v" data-v="temp">${temp(d)} °C</div></div></div>
          <div class="bt-fine muted small">Updates when power changes; temperature every minute</div></section>
        <section class="bt-hist"><div class="bt-ch"><h2>Charge history</h2><span class="muted small">${range === 'h24' ? 'Last 24 hours' : 'Last 7 days'}</span></div>
          <div class="bt-chart" data-chart></div>
          <div class="bt-fine muted small">Shown every 5 minutes for 24 h, hourly for 7 days, then removed</div></section>
        <section class="bt-health"><dl class="kv"><dt>Health</dt><dd data-v="health">${d.health}%</dd><dt>Cycles</dt><dd data-v="cycles">${d.cycles}</dd></dl></section>`;
      chart(main.querySelector('[data-chart]'), d);
      const rc = main.querySelector('[data-rc]'); if (rc) rc.onclick = reconnect;
    };
    draw();
    OS.watch(el, 'change:battery prefs scn perm', draw);
    OS.watch(el, 'tick', () => { const a = el.querySelector('[data-ago]'); if (a) a.textContent = `Sampled ${agoText(OS.data.battery.sampledAt)}`; });
  }

  OS.feature({
    id: 'battery', name: 'Battery', icon: 'i-bat',
    about: 'Charge, health and a 7-day history. An optional helper holds charging at your limit.',
    store: { count: (d) => (d.hist || []).length, unit: 'samples', rule: () => 'Keeps 5-minute samples for 24 h and hourly samples for 7 days' },
    seed: () => base(mkHist(62)),
    empty: () => base([]),
    prefs: [
      { key: 'limitOn', label: 'Limit charging', type: 'toggle', default: false, needs: 'helper', effect: 'Charging holds at the limit instead of continuing to 100%.' },
      { key: 'limit', label: 'Charge limit', type: 'slider', min: 50, max: 100, step: 5, unit: '%', default: 80, effect: 'Sets the hold point, the chart limit line and the time estimate target.' },
      { key: 'pauseHot', label: 'Pause charging when hot', type: 'toggle', default: true, effect: 'When the Mac is hot, charging pauses and the popover says “Paused — Mac is hot”.' },
      { key: 'showPercent', label: 'Show percentage in menu bar', type: 'toggle', default: true, effect: 'Adds the charge level next to the battery icon in the menu bar.' },
    ],
    scenarios: [
      { key: 'hot', label: 'Mac is hot (41 °C)' }, { key: 'unplugged', label: 'On battery power' },
      { key: 'helperDisconnect', label: 'Charge helper stops responding' }, { key: 'wake', label: 'Wake from sleep' },
    ],
    menubar: { icon: 'i-bat', order: 10, label: () => (OS.pref('battery.showPercent') ? OS.data.battery.charge + '%' : ''), render: popover },
    view: { title: 'Battery', mount: (el) => OS.ui.load(el, 'battery', view) },
    init() {
      OS.commit('battery', (b) => {
        if (!Array.isArray(b.hist)) {      /* v2 shape: history {h24, d7} → timestamped samples */
          b.hist = mkHist(b.charge); delete b.history;
        }
        b.sampledAt = OS.now() - 12000;    /* transient: the first sample after launch */
      });
      OS.on('tick', onTick);
      OS.on('scn:battery.unplugged', () => OS.commit('battery', (b) => { b.sampledAt = OS.now(); }));   // power changed → sampled
      OS.on('scn:battery.wake', (on) => { if (on) OS.bg('battery.wake', () => OS.setScn('battery.wake', false), 1600); });
    },
  });
})();
