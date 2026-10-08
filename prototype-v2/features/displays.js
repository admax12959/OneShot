/* Displays — menubar popover + management view. One source: OS.data.displays + prefs displays.*. */
(function () {
  const esc = OS.ui.esc, ic = OS.ui.icon;
  const mkBuiltin = () => ({ id: 'builtin', name: 'Built-in Retina Display', ddc: true, brightness: 0.7, main: true, res: '3024 × 1964', pos: { x: 0, y: 218, w: 1512, h: 982 } });
  const mkExternal = () => [
    { id: 'dell', name: 'DELL U2723QE', ddc: true, brightness: 0.55, res: '3840 × 2160', pos: { x: 1512, y: 0, w: 2560, h: 1440 } },
    { id: 'tv', name: 'LG TV (HDMI)', ddc: false, res: '1920 × 1080', pos: { x: 4072, y: 180, w: 1920, h: 1080 } },
  ];
  let stash = null; // externals removed by the "unplug" scenario
  const presets = () => [
    { id: 'p-day', name: 'Day', values: { builtin: 0.9, dell: 0.8 }, night: false },
    { id: 'p-night', name: 'Night', values: { builtin: 0.35, dell: 0.3 }, night: true },
    { id: 'p-cinema', name: 'Cinema', values: { builtin: 0.5, dell: 0.45 }, night: false },
  ];
  const lst = () => (OS.scn('displays.unplug') ? [mkBuiltin()] : [mkBuiltin(), ...mkExternal()]);
  const pct = (b) => Math.round(b * 100);
  const supported = (d = OS.data.displays) => d.list.filter((x) => x.ddc);
  const short = (n) => n.split(' ')[0];

  function setBrightness(id, p) {
    OS.commit('displays', (d) => {
      const t = d.list.find((x) => x.id === id); if (!t || !t.ddc) return;
      const b = p / 100;
      if (OS.pref('displays.link')) d.list.forEach((x) => { if (x.ddc) x.brightness = b; }); else t.brightness = b;
    });
  }
  function applyPreset(pr) {
    OS.commit('displays', (d) => { d.list.forEach((x) => { if (x.ddc && pr.values[x.id] != null) x.brightness = pr.values[x.id]; }); d.night = !!pr.night; });
  }
  const matches = (pr, d) => !!pr.night === !!d.night && d.list.filter((x) => x.ddc && pr.values[x.id] != null).every((x) => Math.abs(x.brightness - pr.values[x.id]) < 0.005) && d.list.some((x) => x.ddc && pr.values[x.id] != null);
  const isMaster = (d) => OS.pref('displays.link') && supported(d).length > 1;

  function applyDesk() {
    const d = OS.data.displays, b = d.list.find((x) => x.main);
    OS.desk.set({ dim: b ? (1 - b.brightness) * 0.6 : 0, warm: d.night ? (OS.pref('displays.warmth') / 100) * 0.35 : 0 });
  }

  /* one slider row (popover + pane). id '*' = linked master */
  function sliderRow(x, label) {
    const step = OS.pref('displays.step');
    if (!x.ddc) {
      return `<div class="dp-row" data-unsup="${x.id}"><div class="dp-h">${ic('i-disp', 's')}<span>${esc(x.name)}</span></div><div data-ph="${x.id}"></div></div>`;
    }
    return `<div class="dp-row"><div class="dp-h">${ic(x.brightness < 0.4 ? 'i-sundim' : 'i-sun', 's')}<span>${esc(label || x.name)}</span><span class="mono" data-out="${x.id}">${pct(x.brightness)}%</span></div>
      <input type="range" min="0" max="100" step="${step}" value="${pct(x.brightness)}" data-b="${x.id}" aria-label="Brightness — ${esc(label || x.name)}"></div>`;
  }
  const fillPh = (root) => root.querySelectorAll('[data-ph]').forEach((e) => OS.ui.state(e, { kind: 'unsupported', compact: true, title: 'Brightness control unavailable', body: 'This display doesn’t support DDC/CI.' }));
  const sigOf = (d, extra = '') => JSON.stringify([d.list.map((x) => [x.id, x.ddc]), OS.pref('displays.link'), OS.pref('displays.step'), d.presets.map((p) => [p.id, p.name]), extra]);
  function syncSliders(root, d) {
    const m = isMaster(d);
    root.querySelectorAll('[data-b]').forEach((s) => {
      const id = s.dataset.b, x = id === '*' ? supported(d)[0] : d.list.find((y) => y.id === id); if (!x) return;
      const v = pct(x.brightness);
      if (s !== document.activeElement) s.value = v;
      const o = root.querySelector(`[data-out="${id}"]`); if (o) o.textContent = v + '%';
    });
    return m;
  }
  function bindSliders(root) {
    root.addEventListener('input', (e) => {
      const s = e.target.closest('[data-b]'); if (!s) return;
      const id = s.dataset.b === '*' ? supported()[0].id : s.dataset.b;
      setBrightness(id, +s.value);
    });
  }
  /* rows for the popover: master or per display */
  function brightnessRows(d) {
    const noExt = d.list.length === 1;
    let html;
    if (isMaster(d)) {
      const sup = supported(d), first = sup[0];
      html = sliderRow({ id: '*', ddc: true, brightness: first.brightness, name: 'All displays' }, 'All displays') +
        `<div class="dp-sub" style="margin-top:-2px">Linked · ${sup.map((x) => esc(short(x.name))).join(', ')}</div>` + d.list.filter((x) => !x.ddc).map((x) => sliderRow(x)).join('');
    } else html = d.list.map((x) => sliderRow(x)).join('');
    return html + (noExt ? `<div data-noext></div>` : '');
  }
  const fillNoExt = (root) => root.querySelectorAll('[data-noext]').forEach((e) => OS.ui.state(e, { kind: 'empty', compact: true, icon: 'i-disp', title: 'No external displays', body: 'Connect a display to control it here.' }));

  /* ---------- popover ---------- */
  function popover(el) {
    el.innerHTML = '<div class="dp-pop"></div>';
    const root = el.firstElementChild; let sig = null;
    const build = () => {
      const d = OS.data.displays;
      root.innerHTML = `<div class="pop-h">${ic('i-disp')}Displays</div><div class="pop-b"><div data-rows>${brightnessRows(d)}</div>
        <div class="dp-night">${ic('i-moon')}<div><b>Night Look</b><div class="muted" data-warm></div></div><button class="sw" role="switch" data-night aria-label="Night Look"></button></div>
        ${d.presets.length ? `<div class="dp-chips">${d.presets.map((p) => `<button class="dp-chip" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : `<div class="dp-chips muted">No presets saved yet.</div>`}</div>
        <div class="pop-f"><button class="btn ghost" data-set>${ic('i-sliders', 's')}Display settings…</button></div>`;
      fillPh(root); fillNoExt(root);
      root.querySelector('[data-set]').onclick = () => OS.open('displays');
      root.querySelector('[data-night]').onclick = () => OS.commit('displays', (x) => { x.night = !x.night; });
      root.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => applyPreset(OS.data.displays.presets.find((p) => p.id === b.dataset.preset))));
    };
    const upd = () => {
      const d = OS.data.displays;
      if (OS.scn('displays.fail')) {
        if (sig !== 'fail') {
          sig = 'fail';
          root.innerHTML = `<div class="pop-h">${ic('i-disp')}Displays</div><div class="pop-b" data-f></div>`;
          OS.ui.state(root.querySelector('[data-f]'), { kind: 'failure', compact: true, title: 'Couldn’t load displays', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => { if (OS.scn('displays.fail')) OS.ui.toast('Still can’t reach the store', { icon: 'i-disp', ms: 2000 }); else upd(); } } });
        }
        return;
      }
      const s = sigOf(d);
      if (s !== sig) { sig = s; build(); }
      syncSliders(root, d);
      root.querySelector('[data-night]').setAttribute('aria-checked', !!d.night);
      root.querySelector('[data-warm]').textContent = d.night ? `On · warmth ${OS.pref('displays.warmth')}%` : `Off · warmth ${OS.pref('displays.warmth')}%`;
      root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', matches(d.presets.find((p) => p.id === b.dataset.preset), d)));
    };
    bindSliders(root); upd();
    OS.watch(el, 'change:displays prefs scn', upd);
  }

  /* ---------- management view ---------- */
  function view(el, params) {
    el.innerHTML = `<div class="dp-view"><div class="dp-main">
        <div class="sec-h">Arrangement</div><div class="dp-arr" data-arr></div>
        <div class="sec-h" style="padding-top:18px">Presets</div>
        <form class="dp-save" data-form><input class="field" data-name placeholder="Preset name" maxlength="24" aria-label="Preset name"><button class="btn primary" type="submit" data-save disabled>${ic('i-plus', 's')}Save current as preset</button></form>
        <div class="dp-plist" data-plist></div></div>
      <aside class="pane dp-pane"><div data-sel></div>
        <div class="dp-nightrow">${ic('i-moon')}<div><b>Night Look</b><div class="muted" style="font-size:11.5px" data-nl></div></div><button class="sw" role="switch" data-night aria-label="Night Look"></button></div>
        <div class="dp-pane-h" style="margin-top:12px">Settings</div><div data-prefs></div></aside></div>`;
    /* shell skips redrawing the control that has focus; a clicked switch/segment must not keep it */
    el.addEventListener('click', (e) => { const c = e.target.closest('.sw[data-k], .seg[data-k] button'); if (c) c.blur(); }, true);
    const q = (s) => el.querySelector(s);
    let sel = (params && params.select) || 'builtin', selSig = null;
    OS.prefs.render(q('[data-prefs]'), 'displays', { hotkeys: false });
    const sels = () => { const d = OS.data.displays; return d.list.find((x) => x.id === sel) || d.list[0]; };

    const drawArr = () => {
      const d = OS.data.displays, arr = q('[data-arr]');
      const x0 = Math.min(...d.list.map((x) => x.pos.x)), x1 = Math.max(...d.list.map((x) => x.pos.x + x.pos.w));
      const y0 = Math.min(...d.list.map((x) => x.pos.y)), y1 = Math.max(...d.list.map((x) => x.pos.y + x.pos.h));
      const k = Math.min(540 / (x1 - x0), 170 / (y1 - y0), 0.12);
      arr.innerHTML = `<div class="dp-canvas" style="width:${Math.round((x1 - x0) * k)}px;height:${Math.round((y1 - y0) * k)}px">${d.list.map((x) =>
        `<button class="dp-rect ${x.id === sels().id ? 'sel' : ''} ${x.ddc ? '' : 'nodc'}" data-d="${x.id}" aria-pressed="${x.id === sels().id}" style="left:${Math.round((x.pos.x - x0) * k)}px;top:${Math.round((x.pos.y - y0) * k)}px;width:${Math.round(x.pos.w * k)}px;height:${Math.round(x.pos.h * k)}px">
        <b>${esc(short(x.name))}${x.main ? ' · Main' : ''}</b><span class="muted">${esc(x.res)}</span><span>${x.ddc ? pct(x.brightness) + '%' : 'No DDC'}</span></button>`).join('')}</div>${d.list.length === 1 ? '<div data-noext></div>' : ''}`;
      fillNoExt(arr);
      arr.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { sel = b.dataset.d; drawArr(); drawSel(); }));
    };
    const drawSel = () => {
      const d = OS.data.displays, x = sels(), box = q('[data-sel]'), s = sigOf(d, x.id);
      if (s !== selSig) {
        selSig = s;
        box.innerHTML = `<div class="dp-pane-h">${esc(x.name)}${x.main ? ' <span class="tag">Main</span>' : ''}</div><div class="muted" style="font-size:11.5px;margin-bottom:6px">${esc(x.res)}${x.ddc && OS.pref('displays.link') && supported(d).length > 1 ? ' · linked, moves every supported display' : ''}</div>${sliderRow(x)}`;
        fillPh(box);
      }
      syncSliders(box, d);
    };
    const drawPlist = () => {
      const d = OS.data.displays, box = q('[data-plist]');
      if (!d.presets.length) return OS.ui.state(box, { kind: 'empty', icon: 'i-layers', title: 'No presets yet', body: 'Set your displays the way you like, name it above and save.' });
      box.innerHTML = d.presets.map((p) => {
        const vals = d.list.filter((x) => x.ddc && p.values[x.id] != null).map((x) => `${esc(short(x.name))} ${pct(p.values[x.id])}%`);
        const on = matches(p, d);
        return `<div class="row dp-prow ${on ? 'sel applied' : ''}" data-p="${p.id}" role="button" tabindex="0" aria-pressed="${on}" title="Apply “${esc(p.name)}”">${ic(p.night ? 'i-moon' : 'i-sun', 's')}<div class="t"><b>${esc(p.name)}</b>${on ? `<span class="tag ok dp-applied" data-applied>${ic('i-check', 's')}Applied</span>` : ''}</div><div class="m">${vals.join(' · ')}${p.night ? ' · Night Look' : ''}</div>
          <button class="btn" data-apply="${p.id}">Apply</button><button class="btn icon ghost" data-del="${p.id}" title="Delete preset" aria-label="Delete ${esc(p.name)}">${ic('i-trash', 's')}</button></div>`;
      }).join('');
      box.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); applyPreset(d.presets.find((p) => p.id === b.dataset.apply)); }));
      box.querySelectorAll('[data-p]').forEach((r) => {
        const go = () => applyPreset(d.presets.find((p) => p.id === r.dataset.p));
        r.onclick = go;
        r.onkeydown = (e) => { if (e.target === r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } };
      });
      box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation();
        const p = d.presets.find((x) => x.id === b.dataset.del);
        OS.commit('displays', (x) => { x.presets = x.presets.filter((y) => y.id !== p.id); }); OS.ui.toast(`Deleted “${p.name}”`, { icon: 'i-trash', ms: 2500 });
      }));
    };
    const drawNight = () => { const d = OS.data.displays; q('[data-night]').setAttribute('aria-checked', !!d.night); q('[data-nl]').textContent = (d.night ? 'On' : 'Off') + ` · warmth ${OS.pref('displays.warmth')}%`; };
    q('[data-night]').onclick = () => OS.commit('displays', (d) => { d.night = !d.night; });
    const name = q('[data-name]'), save = q('[data-save]');
    name.addEventListener('input', () => (save.disabled = !name.value.trim()));
    q('[data-form]').onsubmit = (e) => {
      e.preventDefault(); const n = name.value.trim(); if (!n) return;
      OS.commit('displays', (d) => {
        const values = {}; d.list.forEach((x) => { if (x.ddc) values[x.id] = x.brightness; });
        const ex = d.presets.find((p) => p.name.toLowerCase() === n.toLowerCase());
        if (ex) { ex.values = values; ex.night = !!d.night; } else d.presets.push({ id: OS.id('preset'), name: n, values, night: !!d.night });
      });
      name.value = ''; save.disabled = true; OS.ui.toast(`Saved “${n}”`, { ms: 2500 });
    };
    bindSliders(q('[data-sel]'));
    const all = () => { if (!sels()) return; drawArr(); drawSel(); drawPlist(); drawNight(); };
    all();
    OS.watch(el, 'change:displays prefs scn', all);
  }

  OS.feature({
    id: 'displays', name: 'Displays', icon: 'i-disp',
    seed: () => ({ list: lst(), presets: presets(), night: false }),
    empty: () => ({ list: lst(), presets: [], night: false }),
    prefs: [
      { key: 'link', label: 'Link brightness', type: 'toggle', default: true, effect: 'One slider moves every display that supports brightness control.' },
      { key: 'warmth', label: 'Night Look warmth', type: 'slider', min: 10, max: 100, step: 5, unit: '%', default: 50, effect: 'Sets how strongly Night Look tints the whole screen.' },
      { key: 'step', label: 'Slider step', type: 'select', options: [[1, '1%'], [5, '5%'], [10, '10%']], default: 5, effect: 'Brightness sliders in the menu bar and settings move by this amount.' },
    ],
    scenarios: [{ key: 'unplug', label: 'Disconnect external displays' }],
    menubar: { icon: 'i-disp', order: 20, render: popover },
    view: { title: 'Displays', mount: (el, params) => OS.ui.load(el, 'displays', (e) => view(e, params)) },
    init() {
      applyDesk();
      OS.on('change:displays prefs scn', applyDesk);
      OS.on('scn:displays.unplug', (on) => {
        OS.commit('displays', (d) => {
          if (on) { stash = d.list.filter((x) => !x.main); d.list = d.list.filter((x) => x.main); }
          else { const back = (stash && stash.length ? stash : mkExternal()); d.list = d.list.concat(back.filter((x) => !d.list.some((y) => y.id === x.id))); stash = null; }
        });
      });
    },
  });
})();
