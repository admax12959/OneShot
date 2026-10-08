/* Displays — menubar popover + management view. One source: OS.data.displays + prefs displays.*.
   v3: each display has a backend (native | ddc | software | unsupported), a reason and the controls it supports (G6). */
(function () {
  const esc = OS.ui.esc, ic = OS.ui.icon;
  const BE = { native: 'Native', ddc: 'DDC', software: 'Software', unsupported: 'Unsupported' };
  const REASON = {
    native: 'macOS controls brightness', ddc: 'DDC/CI over USB-C',
    software: 'Dims with an overlay; the panel’s own brightness doesn’t change',
    unsupported: 'This display doesn’t answer DDC/CI brightness requests',
  };
  const mkList = () => [
    { id: 'builtin', name: 'Built-in Retina Display', short: 'Built-in', glyph: 'i-laptop', backend: 'native', reason: REASON.native, controls: ['brightness'], brightness: 0.7, main: true, res: '3024 × 1964', pos: { x: 0, y: 218, w: 1512, h: 982 } },
    { id: 'dell', name: 'Dell U2723QE', short: 'Dell', glyph: 'i-disp', backend: 'ddc', reason: REASON.ddc, controls: ['brightness'], brightness: 0.55, res: '3840 × 2160', pos: { x: 1512, y: 0, w: 2560, h: 1440 } },
    { id: 'tv', name: 'LG TV', short: 'LG TV', glyph: 'i-disp', backend: 'unsupported', reason: 'This TV doesn’t answer DDC/CI brightness requests over HDMI', controls: [], res: '1920 × 1080', pos: { x: 4072, y: 180, w: 1920, h: 1080 } },
    { id: 'ipad', name: 'iPad Pro (Sidecar)', short: 'iPad', glyph: 'i-portrait', backend: 'software', reason: REASON.software, controls: ['brightness'], brightness: 0.8, res: '2732 × 2048', pos: { x: -1180, y: 330, w: 1180, h: 880 } },
  ];
  const presets = () => [
    { id: 'p-day', name: 'Day', values: { builtin: 0.9, dell: 0.8, ipad: 0.9 }, night: false },
    { id: 'p-night', name: 'Night', values: { builtin: 0.35, dell: 0.3, ipad: 0.4 }, night: true },
    { id: 'p-cinema', name: 'Cinema', values: { builtin: 0.5, dell: 0.45, ipad: 0.5 }, night: false },
  ];

  /* conditions, not data: the unplug scenario hides externals; re-probe scenarios make every display "Checking…" */
  const PROBES = ['wake', 'rearrange', 'rescan'];
  const probing = () => PROBES.some((k) => OS.scn('displays.' + k));
  const vis = (d = OS.data.displays) => d.list.filter((x) => x.main || !OS.scn('displays.unplug'));
  const can = (x) => !probing() && x.controls.includes('brightness');
  const ctl = (d = OS.data.displays) => vis(d).filter(can);
  const pct = (b) => Math.round(b * 100);
  const isMaster = (d) => OS.pref('displays.link') && ctl(d).length > 1;
  let fail = null;   // {id, value}: a DDC write the display never confirmed (transient)

  function write(x, b) {
    if (x.backend === 'ddc' && OS.scn('displays.ddcFail')) { fail = { id: x.id, value: b }; return false; }
    x.brightness = b; if (fail && fail.id === x.id) fail = null; return true;
  }
  function setBrightness(id, p) {
    OS.commit('displays', (d) => {
      const t = vis(d).find((x) => x.id === id); if (!t || !can(t)) return;
      (OS.pref('displays.link') ? ctl(d) : [t]).forEach((x) => write(x, p / 100));
    });
  }
  function retry() {
    if (!fail) return; const f = fail; fail = null;
    OS.setScn('displays.ddcFail', false);          // the display answered this time
    setBrightness(f.id, pct(f.value));
  }
  function applyPreset(pr) {
    OS.commit('displays', (d) => { ctl(d).forEach((x) => { if (pr.values[x.id] != null) write(x, pr.values[x.id]); }); d.night = !!pr.night; });
  }
  const matches = (pr, d) => { const c = ctl(d).filter((x) => pr.values[x.id] != null); return !!pr.night === !!d.night && c.length > 0 && c.every((x) => Math.abs(x.brightness - pr.values[x.id]) < 0.005); };

  /* Night Look and the desk: a gentle dim so the built-in's brightness never greys the whole screen */
  function applyDesk() {
    const d = OS.data.displays, b = d.list.find((x) => x.main);
    OS.desk.set({ dim: b ? 0.34 * Math.pow(1 - b.brightness, 1.7) : 0, warm: d.night ? (OS.pref('displays.warmth') / 100) * 0.35 : 0 });
  }

  /* ---------- shared rows (popover + settings pane) ---------- */
  const cap = (x) => `<div class="dp-cap" data-cap="${x.id}"><span class="dp-be ${x.backend}">${BE[x.backend]}</span>${esc(x.reason)}</div>`;
  const failHtml = (x) => (fail && fail.id === x.id ? `<div class="dp-fail" data-fail="${x.id}"><span>${esc(x.name)} didn’t confirm the change.</span><button class="lnk" data-retry>Try Again</button></div>` : '');
  const nameRow = (x, right = '') => `<div class="dp-h">${ic(x.glyph || 'i-disp', 's')}<span>${esc(x.name)}</span>${right}</div>`;

  function sliderRow(x, label) {
    const step = OS.pref('displays.step');
    if (x.master) {
      return `<div class="dp-row"><div class="dp-h">${ic(x.brightness < 0.4 ? 'i-sundim' : 'i-sun', 's')}<span>${esc(label)}</span><span class="mono" data-out="*">${pct(x.brightness)}%</span></div>
        <input type="range" min="0" max="100" step="${step}" value="${pct(x.brightness)}" data-b="*" aria-label="Brightness — ${esc(label)}"></div>`;
    }
    if (probing()) return `<div class="dp-row" data-chk="${x.id}">${nameRow(x)}<div class="dp-chk">${ic('i-cycle', 's')}Checking…</div></div>`;
    if (!x.controls.includes('brightness')) return `<div class="dp-row" data-unsup="${x.id}">${nameRow(x)}<div data-ph="${x.id}"></div></div>`;
    return `<div class="dp-row">${nameRow(x, `<span class="mono" data-out="${x.id}">${pct(x.brightness)}%</span>`)}
      <input type="range" min="0" max="100" step="${step}" value="${pct(x.brightness)}" data-b="${x.id}" aria-label="Brightness — ${esc(x.name)}">${cap(x)}${failHtml(x)}</div>`;
  }
  /* master mode: the display lists with capability lines, no slider of their own */
  function listRow(x) {
    if (!x.controls.includes('brightness')) return `<div class="dp-row" data-unsup="${x.id}">${nameRow(x)}<div data-ph="${x.id}"></div></div>`;
    return `<div class="dp-row dp-lrow">${nameRow(x, `<span class="mono" data-lv="${x.id}">${pct(x.brightness)}%</span>`)}${cap(x)}${failHtml(x)}</div>`;
  }
  const fillPh = (root, d) => root.querySelectorAll('[data-ph]').forEach((e) => {
    const x = d.list.find((y) => y.id === e.dataset.ph);
    OS.ui.state(e, { kind: 'unsupported', compact: true, title: 'Brightness control unavailable', body: x ? x.reason : '', detail: x ? `Backend: ${BE[x.backend]}` : '', note: 'DisplayController.probe() → .unsupported(reason); the UI never draws a dead slider' });
  });
  const sigOf = (d, extra = '') => JSON.stringify([vis(d).map((x) => [x.id, x.backend, x.controls.length, x.name]), OS.pref('displays.link'), OS.pref('displays.step'), d.presets.map((p) => [p.id, p.name]), probing(), fail && fail.id, extra]);
  function syncSliders(root, d) {
    root.querySelectorAll('[data-b]').forEach((s) => {
      const id = s.dataset.b, x = id === '*' ? ctl(d)[0] : d.list.find((y) => y.id === id); if (!x) return;
      const v = pct(x.brightness); s.value = v;
      const o = root.querySelector(`[data-out="${id}"]`); if (o) o.textContent = v + '%';
    });
    root.querySelectorAll('[data-lv]').forEach((e) => { const x = d.list.find((y) => y.id === e.dataset.lv); if (x) e.textContent = pct(x.brightness) + '%'; });
  }
  function bindSliders(root) {
    root.addEventListener('input', (e) => {
      const s = e.target.closest('[data-b]'); if (!s) return;
      const c = ctl(); const id = s.dataset.b === '*' ? (c[0] && c[0].id) : s.dataset.b;
      if (id) setBrightness(id, +s.value);
    });
    root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) retry(); });
  }
  function brightnessRows(d) {
    const L = vis(d);
    if (isMaster(d)) {
      const c = ctl(d);
      return sliderRow({ master: true, brightness: c[0].brightness }, 'All displays') + `<div class="dp-sub">Linked · ${c.map((x) => esc(x.short)).join(', ')}</div>` + L.map(listRow).join('');
    }
    return L.map((x) => sliderRow(x)).join('');
  }
  const noExt = (d) => (vis(d).length === 1 ? '<div data-noext></div>' : '');
  const fillNoExt = (root) => root.querySelectorAll('[data-noext]').forEach((e) => OS.ui.state(e, { kind: 'empty', compact: true, icon: 'i-disp', title: 'No external displays', body: 'Connect a display to control it here.' }));

  /* ---------- popover ---------- */
  function popover(el) {
    el.innerHTML = '<div class="dp-pop"></div>';
    const root = el.firstElementChild; let sig = null;
    const build = () => {
      const d = OS.data.displays;
      root.innerHTML = `<div class="pop-h">${ic('i-disp')}Displays</div><div class="pop-b"><div data-rows>${brightnessRows(d)}${noExt(d)}</div>
        <div class="dp-night">${ic('i-moon')}<div><b>Night Look</b><div class="muted" data-warm></div></div><button class="sw" role="switch" data-night aria-label="Night Look"></button></div>
        ${d.presets.length ? `<div class="dp-chips">${d.presets.map((p) => `<button class="dp-chip" data-preset="${p.id}">${esc(p.name)}</button>`).join('')}</div>` : `<div class="dp-chips muted">No presets saved yet.</div>`}</div>
        <div class="pop-f"><button data-set>Display Settings…</button></div>`;
      fillPh(root, d); fillNoExt(root);
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
      root.querySelector('[data-warm]').innerHTML = (d.night ? `On · warmth ${OS.pref('displays.warmth')}%` : `Off · warmth ${OS.pref('displays.warmth')}%`) + OS.ui.note('Night Look: gamma table primary (CGSetDisplayTransferByTable); overlay window fallback');
      root.querySelectorAll('[data-preset]').forEach((b) => b.classList.toggle('on', matches(d.presets.find((p) => p.id === b.dataset.preset), d)));
    };
    bindSliders(root); upd();
    OS.watch(el, 'change:displays prefs scn', upd);
  }

  /* ---------- management view ---------- */
  function view(el, params) {
    el.innerHTML = `<div class="dp-view"><div class="dp-col">
        <form class="toolbar dp-save" data-form><input class="field" data-name placeholder="Preset name" maxlength="24" aria-label="Preset name"><button class="btn primary" type="submit" data-save>${ic('i-plus', 's')}Save Current as Preset</button><span class="grow"></span><span class="muted small" data-count></span></form>
        <div class="dp-main"><div class="sec-h">Arrangement</div><div class="dp-arr" data-arr></div>
          <div class="sec-h" style="padding-top:18px">Presets</div><div class="dp-plist" data-plist></div></div></div>
      <aside class="pane dp-pane"><div data-sel></div>
        <div class="dp-nightrow">${ic('i-moon')}<div><b>Night Look</b><div class="muted" style="font-size:11.5px" data-nl></div></div><button class="sw" role="switch" data-night aria-label="Night Look"></button></div>
        <div class="dp-pane-h" style="margin-top:12px">Settings</div><div data-prefs></div></aside></div>`;
    /* shell skips redrawing the control that has focus; a clicked switch/segment must not keep it */
    el.addEventListener('click', (e) => { const c = e.target.closest('.sw[data-k], .seg[data-k] button'); if (c) c.blur(); }, true);
    const q = (s) => el.querySelector(s);
    let sel = (params && params.select && OS.data.displays.list.some((x) => x.id === params.select) && params.select) || 'builtin', selSig = null;
    let selP = (params && params.select && OS.data.displays.presets.some((p) => p.id === params.select) && params.select) || null;
    let lastDel = null;
    OS.prefs.render(q('[data-prefs]'), 'displays', { hotkeys: false });
    const sels = () => { const L = vis(); return L.find((x) => x.id === sel) || L[0]; };
    const selPreset = () => OS.data.displays.presets.find((p) => p.id === selP) || null;

    const tb = OS.ui.toolbarTools();
    if (tb) {
      const b = document.createElement('button'); b.className = 'btn tb'; b.dataset.recheck = '1'; b.title = 'Check displays again'; b.setAttribute('aria-label', 'Check displays again'); b.innerHTML = ic('i-cycle');
      b.onclick = () => { if (!probing()) OS.setScn('displays.rescan', true); };
      tb.insertBefore(b, tb.firstChild);
    }

    const drawArr = () => {
      const d = OS.data.displays, L = vis(d), arr = q('[data-arr]'), cur = sels();
      const x0 = Math.min(...L.map((x) => x.pos.x)), x1 = Math.max(...L.map((x) => x.pos.x + x.pos.w));
      const y0 = Math.min(...L.map((x) => x.pos.y)), y1 = Math.max(...L.map((x) => x.pos.y + x.pos.h));
      const k = Math.min(Math.max(300, (arr.clientWidth || 470) - 30) / (x1 - x0), 170 / (y1 - y0), 0.12);
      arr.innerHTML = `<div class="dp-canvas" style="width:${Math.round((x1 - x0) * k)}px;height:${Math.round((y1 - y0) * k)}px">${L.map((x) => {
        const third = probing() ? 'Checking…' : x.controls.includes('brightness') ? pct(x.brightness) + '%' : 'Unsupported';
        return `<button class="dp-rect ${x.id === cur.id ? 'sel' : ''} ${x.controls.includes('brightness') ? '' : 'nodc'} ${probing() ? 'chk' : ''}" data-d="${x.id}" aria-pressed="${x.id === cur.id}" title="${esc(x.name)} — ${esc(x.reason)}" style="left:${Math.round((x.pos.x - x0) * k)}px;top:${Math.round((x.pos.y - y0) * k)}px;width:${Math.round(x.pos.w * k)}px;height:${Math.round(x.pos.h * k)}px">
        <b>${esc(x.short)}${x.main ? ' · Main' : ''}</b><span class="muted">${esc(x.res)}</span><span>${third}</span></button>`;
      }).join('')}</div>${noExt(d)}`;
      fillNoExt(arr);
      arr.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { sel = b.dataset.d; drawArr(); drawSel(); }));
    };
    const drawSel = () => {
      const d = OS.data.displays, x = sels(), box = q('[data-sel]'), s = sigOf(d, x.id);
      if (s !== selSig) {
        selSig = s;
        box.innerHTML = `<div class="dp-pane-h">${esc(x.name)}${x.main ? ' <span class="tag">Main</span>' : ''}</div><div class="muted" style="font-size:11.5px;margin-bottom:6px">${esc(x.res)}${can(x) && isMaster(d) ? ' · linked, moves every display with brightness control' : ''}</div>${sliderRow(x)}${probing() ? '' : `<dl class="kv dp-kv"><dt>Backend</dt><dd>${BE[x.backend]}</dd><dt>Controls</dt><dd>${x.controls.length ? x.controls.map((c) => c[0].toUpperCase() + c.slice(1)).join(', ') : 'None'}</dd></dl>`}`;
        fillPh(box, d);
      }
      syncSliders(box, d);
    };
    const drawPlist = () => {
      const d = OS.data.displays, box = q('[data-plist]');
      OS.ui.subtitle(`${vis(d).length} displays · ${d.presets.length} presets`);
      q('[data-count]').textContent = `${d.presets.length} preset${d.presets.length === 1 ? '' : 's'}`;
      if (!d.presets.length) return OS.ui.state(box, { kind: 'empty', icon: 'i-layers', title: 'No presets yet', body: 'Set your displays the way you like, name it above and save.' });
      box.innerHTML = d.presets.map((p) => {
        const vals = vis(d).filter((x) => x.controls.includes('brightness') && p.values[x.id] != null).map((x) => `${esc(x.short)} ${pct(p.values[x.id])}%`);
        const on = matches(p, d);
        return `<div class="row dp-prow ${p.id === selP ? 'sel' : ''}" data-p="${p.id}" role="option" tabindex="0" aria-selected="${p.id === selP}">${ic(p.night ? 'i-moon' : 'i-sun', 's')}<div class="t"><b>${esc(p.name)}</b>${on ? `<span class="tag ok dp-applied" data-applied>${ic('i-check', 's')}Applied</span>` : ''}</div><div class="m">${vals.join(' · ')}${p.night ? ' · Night Look' : ''}</div>
          <button class="btn" data-apply="${p.id}">Apply</button><button class="btn icon ghost" data-del="${p.id}" title="Delete preset" aria-label="Delete ${esc(p.name)}">${ic('i-trash', 's')}</button></div>`;
      }).join('');
      const find = (id) => d.presets.find((p) => p.id === id);
      box.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); selP = b.dataset.apply; applyPreset(find(selP)); }));
      box.querySelectorAll('[data-p]').forEach((r) => {
        r.onclick = () => { selP = r.dataset.p; drawPlist(); box.querySelector(`[data-p="${selP}"]`).focus(); };
        r.ondblclick = () => applyPreset(find(r.dataset.p));
        r.onkeydown = (e) => {
          if (e.target !== r) return;
          const i = d.presets.findIndex((p) => p.id === r.dataset.p);
          if (e.key === 'Enter') { e.preventDefault(); applyPreset(find(r.dataset.p)); }
          else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = d.presets[clampI(i + (e.key === 'ArrowDown' ? 1 : -1), d.presets.length)]; selP = n.id; drawPlist(); box.querySelector(`[data-p="${selP}"]`).focus(); }
          else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); selP = r.dataset.p; removeSel(); }
        };
      });
      box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); selP = b.dataset.del; removeSel(); }));
    };
    const clampI = (i, n) => Math.max(0, Math.min(n - 1, i));
    function removeSel() {
      const p = selPreset(); if (!p) return;
      const idx = OS.data.displays.presets.indexOf(p);
      lastDel = { p, idx };
      OS.commit('displays', (x) => { x.presets = x.presets.filter((y) => y.id !== p.id); });
      selP = null; drawPlist();
      OS.ui.toast(`Deleted “${p.name}”`, { icon: 'i-trash', ms: 4000, action: { label: 'Undo', run: undoDel } });
    }
    function undoDel() {
      if (!lastDel) return; const { p, idx } = lastDel; lastDel = null;
      OS.commit('displays', (x) => { if (!x.presets.some((y) => y.id === p.id)) x.presets.splice(Math.min(idx, x.presets.length), 0, p); });
      selP = p.id; drawPlist();
    }
    function savePreset(nameIn) {
      const d0 = OS.data.displays; let n = (nameIn || '').trim();
      if (!n) { let i = d0.presets.length + 1; while (d0.presets.some((p) => p.name === 'Preset ' + i)) i++; n = 'Preset ' + i; }
      let id = null;
      OS.commit('displays', (d) => {
        const values = {}; ctl(d).forEach((x) => { values[x.id] = x.brightness; });
        const ex = d.presets.find((p) => p.name.toLowerCase() === n.toLowerCase());
        if (ex) { Object.assign(ex.values, values); ex.night = !!d.night; id = ex.id; } else { id = OS.id('preset'); d.presets.push({ id, name: n, values, night: !!d.night }); }
      });
      selP = id; name.value = ''; drawPlist(); OS.ui.toast(`Saved “${n}”`, { ms: 2500 });
      const r = q(`[data-p="${id}"]`); if (r) r.scrollIntoView({ block: 'nearest' });
    }
    const drawNight = () => { const d = OS.data.displays; q('[data-night]').setAttribute('aria-checked', !!d.night); q('[data-nl]').innerHTML = (d.night ? 'On' : 'Off') + ` · warmth ${OS.pref('displays.warmth')}%` + OS.ui.note('Night Look: gamma table primary (CGSetDisplayTransferByTable); overlay window fallback'); };
    q('[data-night]').onclick = () => OS.commit('displays', (d) => { d.night = !d.night; });
    const name = q('[data-name]');
    q('[data-form]').onsubmit = (e) => { e.preventDefault(); savePreset(name.value); };
    bindSliders(q('[data-sel]'));

    /* G10: Edit/File menus act on the selected preset */
    OS.responder(el, {
      new: { get label() { return 'Save Current as Preset'; }, run: () => savePreset(name.value) },
      delete: { get label() { const p = selPreset(); return p ? `Delete “${p.name}”` : 'Delete Preset'; }, enabled: () => !!selPreset(), run: removeSel },
      undo: { get label() { return lastDel ? `Undo Delete “${lastDel.p.name}”` : 'Undo'; }, enabled: () => !!lastDel, run: undoDel },
    });

    const all = () => { if (!sels()) return; drawArr(); drawSel(); drawPlist(); drawNight(); const rb = OS.ui.toolbarTools() && OS.ui.toolbarTools().querySelector('[data-recheck]'); if (rb) rb.disabled = probing(); };
    all();
    if (params && params.create) name.focus();
    OS.watch(el, 'change:displays prefs scn', all);
  }

  /* v2 stored a `ddc` boolean per display; v3 stores backend + reason + controls */
  function migrate(d) {
    d.list.forEach((x) => {
      if (!x.backend) x.backend = x.ddc === false ? 'unsupported' : x.main ? 'native' : 'ddc';
      delete x.ddc;
      if (!x.reason) x.reason = REASON[x.backend];
      if (!x.controls) x.controls = x.backend === 'unsupported' ? [] : ['brightness'];
      if (!x.short) x.short = x.name.split(' ')[0];
      if (!x.glyph) x.glyph = x.main ? 'i-laptop' : 'i-disp';
    });
  }

  OS.feature({
    id: 'displays', name: 'Displays', icon: 'i-disp',
    about: 'Brightness, Night Look and presets for each display, through whichever backend that display supports.',
    store: { count: (d) => (d.presets || []).length, unit: 'presets', rule: () => 'Keeps your presets: each display’s brightness and Night Look' },
    seed: () => ({ list: mkList(), presets: presets(), night: false }),
    empty: () => ({ list: mkList(), presets: [], night: false }),
    prefs: [
      { key: 'link', label: 'Link brightness', type: 'toggle', default: true, effect: 'One slider moves every display whose controls include brightness.' },
      { key: 'warmth', label: 'Night Look warmth', type: 'slider', min: 10, max: 100, step: 5, unit: '%', default: 50, effect: 'Sets how strongly Night Look tints the whole screen.' },
      { key: 'step', label: 'Slider step', type: 'select', options: [[1, '1%'], [5, '5%'], [10, '10%']], default: 5, effect: 'Brightness sliders in the menu bar and settings move by this amount.' },
    ],
    scenarios: [
      { key: 'unplug', label: 'Disconnect external displays' }, { key: 'wake', label: 'Wake from sleep' },
      { key: 'rearrange', label: 'Display arrangement changed' }, { key: 'ddcFail', label: 'DDC write fails' },
    ],
    menubar: { icon: 'i-disp', order: 20, render: popover },
    view: { title: 'Displays', mount: (el, params) => OS.ui.load(el, 'displays', (e) => view(e, params)) },
    init() {
      fail = null;
      OS.commit('displays', migrate);
      applyDesk();
      OS.on('change:displays prefs scn', applyDesk);
      PROBES.forEach((k) => OS.on('scn:displays.' + k, (on) => {
        if (!on) return;
        fail = null;
        OS.bg('displays.probe', () => PROBES.forEach((p) => OS.scn('displays.' + p) && OS.setScn('displays.' + p, false)), 1400);   // DisplayController.probe() per display
      }));
    },
  });
})();
