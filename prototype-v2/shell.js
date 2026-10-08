/* OneShot v1 shell. Owns: window + rail, Preferences, permissions, clipboard policy, hotkey registry,
   scenarios, system dialogs, toasts, floats, overlay, the simulated desk. Contract: SPEC.md. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#${n}"/></svg>`;
  let uid = 0;

  const OS = (window.OS = {
    data: {}, features: [], $, h, esc,
    id: (p = 'x') => p + '-' + (++uid) + '-' + Math.random().toString(36).slice(2, 6),
  });

  /* ---------- events ---------- */
  const ev = {};
  OS.on = (names, fn) => { names.split(' ').forEach((n) => (ev[n] = ev[n] || []).push(fn)); return () => names.split(' ').forEach((n) => (ev[n] = (ev[n] || []).filter((f) => f !== fn))); };
  OS.emit = (n, p) => (ev[n] || []).slice().forEach((f) => { try { f(p, n); } catch (e) { console.error(e); } });
  OS.watch = (el, names, fn) => { const off = OS.on(names, (p, n) => { if (!el.isConnected) return off(); fn(p, n); }); return off; };
  OS.commit = (id, fn) => { fn(OS.data[id]); OS.emit('change:' + id, OS.data[id]); OS.emit('change', id); };

  /* ---------- simulated clock ---------- */
  let skew = 0;
  OS.now = () => Date.now() + skew;
  OS.skip = (ms) => { skew += ms; OS.emit('tick', ms); OS.emit('clock'); };
  setInterval(() => OS.emit('tick', 0), 1000);
  OS.ago = (t) => { const s = Math.max(0, (OS.now() - t) / 1000); if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };

  /* ---------- feature registry ---------- */
  OS.feature = (def) => {
    def.prefs = def.prefs || []; def.hotkeys = def.hotkeys || []; def.scenarios = def.scenarios || [];
    OS.features.push(def);
    OS.data[def.id] = def.seed ? def.seed() : {};
    def.prefs.forEach((p) => { p.full = def.id + '.' + p.key; prefDefs[p.full] = p; prefs[p.full] = p.default; });
    def.hotkeys.forEach((k) => { k.full = def.id + '.' + k.id; k.feature = def; hotkeys[k.full] = k; prefs['hotkey.' + k.full] = k.default; });
  };
  OS.get = (id) => OS.features.find((f) => f.id === id);

  /* ---------- services for handoffs ---------- */
  const svc = {};
  OS.provide = (n, fn) => (svc[n] = fn);
  OS.call = (n, p) => { if (!svc[n]) { console.warn('no service', n); return; } return svc[n](p); };
  OS.has = (n) => !!svc[n];

  /* ---------- preferences ---------- */
  const prefs = {}, prefDefs = {};
  OS.pref = (k) => prefs[k];
  OS.setPref = (k, v) => { if (prefs[k] === v) return; prefs[k] = v; OS.emit('pref:' + k, v); OS.emit('prefs', k); };
  ['TextEdit', 'Safari', 'Screenshot', 'OneShot'].forEach((s) => (prefs['policy.' + s] = true));

  function control(p) {
    const v = OS.pref(p.full);
    if (p.type === 'toggle') return `<button class="sw" role="switch" data-k="${p.full}" aria-checked="${!!v}"></button>`;
    if (p.type === 'select' && p.options.length <= 4) return `<div class="seg" data-k="${p.full}">${p.options.map(([ov, ol]) => `<button data-v="${esc(JSON.stringify(ov))}" aria-pressed="${ov === v}">${esc(ol)}</button>`).join('')}</div>`;
    if (p.type === 'select') return `<select class="field" data-k="${p.full}">${p.options.map(([ov, ol]) => `<option value='${esc(JSON.stringify(ov))}' ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    if (p.type === 'slider') return `<input type="range" data-k="${p.full}" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${v}" style="width:130px"><span class="mono" style="width:44px;text-align:right" data-out="${p.full}">${v}${p.unit || ''}</span>`;
    if (p.type === 'text') return `<input class="field" data-k="${p.full}" value="${esc(v)}" style="width:170px">`;
    return '';
  }
  function prefRow(p) {
    const need = p.needs && !OS.perm.has(p.needs) ? `<div class="err">Needs ${esc(PERMS[p.needs].name)} — turning this on asks for it.</div>` : '';
    return `<div class="prow" data-row="${p.full}"><div class="pl"><b>${esc(p.label)}</b><div class="fx">${esc(p.effect)}</div>${need}</div><div class="pc">${control(p)}</div></div>`;
  }
  function hotkeyRow(k, withFeature) {
    return `<div class="prow"><div class="pl"><b>${withFeature ? esc(k.feature.name) + ' · ' : ''}${esc(k.label)}</b><div class="fx">Runs “${esc(k.label)}” from any app</div><div class="err" data-hkerr="${k.full}"></div></div>
      <div class="pc"><button class="btn hk" data-hk="${k.full}">${esc(OS.hotkey.label(k.full))}</button></div></div>`;
  }
  async function setFromControl(p, v) {
    if (p.needs && v === true && !OS.perm.has(p.needs)) { const ok = await OS.perm.request(p.needs); if (!ok) { OS.emit('prefs', p.full); return; } }
    OS.setPref(p.full, v);
  }
  function bindPrefControls(el) {
    el.addEventListener('click', (e) => {
      const sw = e.target.closest('.sw[data-k]'); if (sw) { const p = prefDefs[sw.dataset.k] || policyDef(sw.dataset.k); setFromControl(p, sw.getAttribute('aria-checked') !== 'true'); return; }
      const sb = e.target.closest('.seg[data-k] button'); if (sb) { setFromControl(prefDefs[sb.parentNode.dataset.k], JSON.parse(sb.dataset.v)); return; }
      const hk = e.target.closest('[data-hk]'); if (hk) recordHotkey(hk);
      if (e.target.closest('[data-tohk]')) OS.openPrefs('hotkeys');
    });
    el.addEventListener('input', (e) => {
      const t = e.target; if (!t.dataset.k) return; const p = prefDefs[t.dataset.k];
      if (t.type === 'range') { const n = +t.value; const o = el.querySelector(`[data-out="${t.dataset.k}"]`); if (o) o.textContent = n + (p.unit || ''); setFromControl(p, n); }
      else if (t.tagName === 'SELECT') setFromControl(p, JSON.parse(t.value));
      else setFromControl(p, t.value);
    });
  }
  function policyDef(full) { return { full, type: 'toggle' }; }
  /* render a feature's controls into any container; keeps itself in sync */
  OS.prefs = {
    render(el, fid, opt = {}) {
      const f = OS.get(fid);
      const draw = () => {
        const keys = opt.keys;
        el.innerHTML = f.prefs.filter((p) => !keys || keys.includes(p.key)).map(prefRow).join('') +
          (opt.hotkeys === false ? '' : f.hotkeys.map((k) => `<div class="prow"><div class="pl"><b>${esc(k.label)}</b><div class="fx">Change in Hotkeys</div></div><div class="pc"><span class="kbd">${esc(OS.hotkey.label(k.full))}</span><button class="btn ghost" data-tohk>Edit</button></div></div>`).join(''));
      };
      draw(); bindPrefControls(el);
      OS.watch(el, 'prefs perm', (k) => {
        const a = document.activeElement; if (typeof k === 'string' && el.contains(a) && a.type === 'range' && a.dataset.k === k) return; // don't redraw a control being dragged
        draw();
      });
    },
  };

  /* ---------- hotkey registry ---------- */
  const hotkeys = {};
  const KEYMAP = { Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Space: 'Space', Backquote: '`' };
  const comboOf = (e) => {
    let k = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : KEYMAP[e.code];
    if (!k) return null;
    return (e.ctrlKey ? '⌃' : '') + (e.altKey ? '⌥' : '') + (e.shiftKey ? '⇧' : '') + (e.metaKey ? '⌘' : '') + k;
  };
  OS.hotkey = {
    label: (full) => prefs['hotkey.' + full] || '',
    list: () => Object.values(hotkeys),
    run: (full) => hotkeys[full] && hotkeys[full].run(),
    owner: (combo) => Object.values(hotkeys).find((k) => OS.hotkey.label(k.full) === combo),
  };
  const RESERVED = ['⌘C', '⌘V', '⌘X', '⌘Z', '⇧⌘Z', '⌘A', '⌘Q', '⌘W', '⌘,', '⌘H', '⌘M', '⌘S', '⌘O', '⌘N', '⌘P', '⌘T', '⌘F', '⌘R'];
  let recording = null;
  function recordHotkey(btn) {
    if (recording) recording.btn.classList.remove('rec');
    recording = { btn, full: btn.dataset.hk };
    btn.classList.add('rec'); btn.textContent = 'Type keys…';
  }
  function finishRecord(e) {
    const { btn, full } = recording; recording = null; btn.classList.remove('rec');
    const errEl = document.querySelectorAll(`[data-hkerr="${full}"]`);
    if (e.key === 'Escape') { btn.textContent = OS.hotkey.label(full); return; }
    const c = comboOf(e);
    if (!c || !(e.ctrlKey || e.altKey || e.metaKey)) { btn.textContent = OS.hotkey.label(full); errEl.forEach((x) => (x.textContent = 'Use at least one of ⌃ ⌥ ⌘.')); return; }
    if (RESERVED.includes(c)) { btn.textContent = OS.hotkey.label(full); errEl.forEach((x) => (x.textContent = `${c} is a system shortcut.`)); return; }
    const o = OS.hotkey.owner(c);
    if (o && o.full !== full) { btn.textContent = OS.hotkey.label(full); errEl.forEach((x) => (x.textContent = `${c} is already “${o.feature.name} · ${o.label}”.`)); return; }
    OS.setPref('hotkey.' + full, c);
  }

  /* ---------- permissions ---------- */
  const PERMS = {
    screen: { name: 'Screen Recording', pane: 'Screen & System Audio Recording', why: 'Capture, record and OCR the screen.', icon: 'i-shot' },
    access: { name: 'Accessibility', pane: 'Accessibility', why: 'Paste into apps, read and replace selected text, fill login fields.', icon: 'i-cursor' },
    helper: { name: 'Privileged helper', pane: 'Login Items & Extensions', why: 'Hold charging at a limit (writes the SMC).', icon: 'i-shield' },
  };
  const granted = { screen: false, access: true, helper: false };
  OS.perm = {
    defs: PERMS,
    has: (id) => !!granted[id],
    missing: () => Object.keys(PERMS).filter((k) => !granted[k]),
    set(id, v) { granted[id] = v; OS.emit('perm', id); OS.emit('prefs', 'perm'); refreshRail(); OS.menubar.refresh(); },
    request(id) {
      const p = PERMS[id];
      if (id === 'helper') {
        return dialog(`<div class="logo">1</div><h3>OneShot wants to install a helper</h3><p>${esc(p.why)} Touch ID or enter your password to allow this.</p>
          <div class="acts"><button class="btn" data-r="0">Cancel</button><button class="btn primary" data-r="1">Install Helper</button></div>`).then((r) => { if (r === '1') OS.perm.set(id, true); return granted[id]; });
      }
      return systemSettings(id);
    },
  };
  function systemSettings(id) {
    const p = PERMS[id];
    let on = granted[id];
    return dialog(`<div class="crumb">System Settings › Privacy &amp; Security › ${esc(p.pane)}</div>
      <h3>Allow the apps below to use ${esc(p.name)}</h3>
      <div class="app"><div class="logo">1</div><div style="flex:1"><b>OneShot</b><div class="muted" style="font-size:11.5px">${esc(p.why)}</div></div><button class="sw" role="switch" aria-checked="${on}" data-t></button></div>
      <div class="acts"><button class="btn primary" data-r="done">Done</button></div>`, (box) => {
      box.querySelector('[data-t]').onclick = (e) => { on = !on; e.currentTarget.setAttribute('aria-checked', on); };
    }).then(() => { if (on !== granted[id]) OS.perm.set(id, on); return granted[id]; });
  }
  OS.perm.openSettings = systemSettings;
  /* the one inline grant pattern */
  OS.ui = {};
  OS.ui.grant = (el, id, purpose) => {
    const p = PERMS[id];
    const draw = () => {
      el.innerHTML = `<div class="state permission"><div class="k">No permission</div>${icon(p.icon, 'xl')}<h3>${esc(p.name)} is off</h3><p>${esc(purpose || p.why)}</p>
        <button class="btn primary" data-grant>${id === 'helper' ? 'Install helper' : 'Open System Settings'}</button></div>`;
      el.querySelector('[data-grant]').onclick = (e) => { e.stopPropagation(); OS.perm.request(id); };
    };
    draw();
    OS.watch(el, 'perm', (pid) => { if (pid === id && el.isConnected) el.dispatchEvent(new CustomEvent('granted', { bubbles: true })); });
  };

  /* ---------- state placeholders ---------- */
  const STATE_ICON = { empty: 'i-layers', loading: 'i-cycle', failure: 'i-x', permission: 'i-lock', unsupported: 'i-null', locked: 'i-lock' };
  const STATE_K = { empty: 'Empty', loading: 'Loading', failure: 'Failure', permission: 'No permission', unsupported: 'Unsupported', locked: 'Locked' };
  OS.ui.state = (el, s) => {
    el.innerHTML = `<div class="state ${s.kind} ${s.compact ? 'compact' : ''}"><div class="k">${STATE_K[s.kind] || s.kind}</div>${icon(s.icon || STATE_ICON[s.kind] || 'i-layers', 'xl')}
      <h3>${esc(s.title)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ''}${s.action ? `<button class="btn ${s.kind === 'failure' ? '' : 'primary'}" data-act>${esc(s.action.label)}</button>` : ''}
      ${s.action2 ? `<button class="btn ghost" data-act2>${esc(s.action2.label)}</button>` : ''}</div>`;
    if (s.action) el.querySelector('[data-act]').onclick = (e) => { e.stopPropagation(); s.action.run(); };
    if (s.action2) el.querySelector('[data-act2]').onclick = (e) => { e.stopPropagation(); s.action2.run(); };
  };
  OS.ui.load = (el, fid, render) => {
    const f = OS.get(fid);
    OS.ui.state(el, { kind: 'loading', title: `Loading ${f.name}…`, body: 'Reading the local store.' });
    const ms = OS.scn('slow') ? 1800 : 260;
    setTimeout(() => {
      if (!el.isConnected) return;
      if (OS.scn(fid + '.fail')) return OS.ui.state(el, { kind: 'failure', title: `Couldn’t load ${f.name}`, body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => OS.ui.load(el, fid, render) } });
      el.innerHTML = ''; render(el);
    }, ms);
  };
  OS.ui.icon = icon; OS.ui.esc = esc;

  /* ---------- toasts ---------- */
  OS.ui.toast = (text, o = {}) => {
    const t = h(`<div class="toast">${icon(o.icon || 'i-check')}<div class="t">${esc(text)}${o.sub ? `<div class="muted" style="font-size:11.5px">${esc(o.sub)}</div>` : ''}</div>${o.action ? `<button class="btn">${esc(o.action.label)}</button>` : ''}</div>`);
    if (o.action) t.querySelector('button').onclick = () => { t.remove(); o.action.run(); };
    $('#toasts').prepend(t); setTimeout(() => t.remove(), o.ms || 6000);
    return t;
  };

  /* ---------- float (runtime surfaces at caret / field) ---------- */
  let flt = null;
  OS.ui.float = (o) => {
    OS.ui.closeFloat();
    const box = $('#float'); box.className = o.cls || ''; box.innerHTML = ''; box.appendChild(o.el); box.hidden = false;
    const sr = $('#screen').getBoundingClientRect();
    let x = o.x - sr.left, y = o.y - sr.top;
    const w = box.offsetWidth, ht = box.offsetHeight;
    if (x + w > 1430) x = 1430 - w; if (y + ht > 890) y = Math.max(34, (o.above != null ? o.above - sr.top : y) - ht - 8);
    box.style.left = Math.max(8, x) + 'px'; box.style.top = Math.max(34, y) + 'px';
    flt = o;
    return box;
  };
  OS.ui.closeFloat = () => { if (!flt) return; const f = flt; flt = null; $('#float').hidden = true; $('#float').innerHTML = ''; if (f.onClose) f.onClose(); };
  OS.ui.floatOpen = () => !!flt;

  /* ---------- overlay (transient editor) ---------- */
  let ovl = null;
  OS.ui.overlay = {
    open(el, o = {}) { OS.ui.closeFloat(); closePop(); const box = $('#overlay'); box.innerHTML = ''; box.appendChild(el); box.hidden = false; ovl = o; },
    close() { if (!ovl) return; const o = ovl; ovl = null; $('#overlay').hidden = true; $('#overlay').innerHTML = ''; o.onClose && o.onClose(); },
    isOpen: () => !!ovl,
  };

  /* ---------- system dialogs ---------- */
  let dlgDone = null;
  function dialog(html, setup) {
    return new Promise((res) => {
      const d = $('#dlg'); d.innerHTML = `<div class="sys">${html}</div>`; d.hidden = false;
      const fin = (r) => { d.hidden = true; d.innerHTML = ''; dlgDone = null; res(r); };
      dlgDone = fin;
      d.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => fin(b.dataset.r)));
      setup && setup(d.firstElementChild, fin);
    });
  }
  OS.system = {
    dialog,
    confirm: (title, body, ok = 'OK', danger) => dialog(`<div class="logo">1</div><h3>${esc(title)}</h3><p>${esc(body)}</p><div class="acts"><button class="btn" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`).then((r) => r === '1'),
    /* resolves {ok:true} | {ok:false, reason:'nomatch'|'cancel'}; scenario 'vault.touchFail' makes the touch not match */
    touchId: (reason) => dialog(`<div class="tid" data-touch>${icon('i-finger', 'xl')}</div><h3>Touch ID</h3><p>${esc(reason)}</p><p class="muted" style="font-size:11.5px">Click the fingerprint to touch the sensor.</p>
      <div class="acts"><button class="btn" data-r="cancel">Cancel</button></div>`, (box, fin) => {
      box.querySelector('[data-touch]').onclick = (e) => {
        if (OS.scn('vault.touchFail')) { setScn('vault.touchFail', false); e.currentTarget.classList.add('bad'); setTimeout(() => fin('nomatch'), 350); } else fin('ok');
      };
    }).then((r) => (r === 'ok' ? { ok: true } : { ok: false, reason: r })),
  };

  /* ---------- clipboard policy + pasteboard ---------- */
  OS.policy = {
    sources: ['TextEdit', 'Safari', 'Screenshot', 'OneShot'],
    allows: (src) => src !== 'Vault' && prefs['policy.' + src] !== false,
  };
  OS.pasteboard = {
    current: null,
    copy(item) {
      const p = Object.assign({ kind: 'text', at: OS.now() }, item);
      OS.pasteboard.current = p;
      const recorded = OS.policy.allows(p.source);
      if (recorded) OS.emit('pasteboard:record', p); // Clipboard feature sets p.clipId
      OS.emit('pasteboard', p);
      return { recorded, clipId: p.clipId };
    },
  };

  /* ---------- scenarios ---------- */
  const scn = {};
  OS.scn = (k) => !!scn[k];
  function setScn(k, v) {
    scn[k] = v;
    const m = k.match(/^(\w+)\.empty$/);
    if (m) { const f = OS.get(m[1]); OS.data[f.id] = v ? (f.empty ? f.empty() : {}) : f.seed(); OS.emit('change:' + f.id, OS.data[f.id]); OS.emit('change', f.id); }
    OS.emit('scn', k); OS.emit('scn:' + k, v);
  }

  /* ---------- menubar ---------- */
  let popFor = null;
  function closePop() { $('#pop').hidden = true; $('#pop').innerHTML = ''; document.querySelectorAll('.mbi.on').forEach((b) => b.classList.remove('on')); const p = popFor; popFor = null; return p; }
  function openPop(key, btn, render) {
    if (closePop() === key) return;
    popFor = key; btn.classList.add('on');
    const pop = $('#pop'); pop.hidden = false; const body = h('<div></div>'); pop.appendChild(body); render(body);
    const r = btn.getBoundingClientRect(), sr = $('#screen').getBoundingClientRect();
    pop.style.left = Math.min(1440 - pop.offsetWidth - 8, Math.max(8, r.right - sr.left - pop.offsetWidth + 20)) + 'px';
  }
  OS.closePopover = closePop;
  OS.menubar = {
    refresh() {
      const r = $('#mbR'); if (!r) return;
      const items = OS.features.filter((f) => f.menubar).sort((a, b) => (a.menubar.order || 0) - (b.menubar.order || 0));
      r.innerHTML = items.map((f) => `<button class="mbi ${popFor === f.id ? 'on' : ''} ${f.menubar.cls ? f.menubar.cls() : ''}" data-mb="${f.id}" title="${esc(f.name)}">${icon(f.menubar.icon)}${f.menubar.label ? `<span>${esc(f.menubar.label())}</span>` : ''}</button>`).join('') +
        `<button class="mbi ${popFor === 'oneshot' ? 'on' : ''}" data-mb="oneshot" title="OneShot"><span class="logo" style="width:16px;height:16px;border-radius:4px;font-size:9px">1</span>${OS.perm.missing().length ? '<i class="badge"></i>' : ''}</button>
         <button class="mbi ${popFor === 'scn' ? 'on' : ''}" data-mb="scn" title="Scenarios">${icon('i-wrench')}</button>
         <span class="mbi" style="pointer-events:none">${clock()}</span>`;
      r.querySelectorAll('[data-mb]').forEach((b) => (b.onclick = (e) => {
        e.stopPropagation(); const k = b.dataset.mb;
        if (k === 'oneshot') return openPop(k, b, oneShotMenu);
        if (k === 'scn') return openPop(k, b, scenarioMenu);
        openPop(k, b, (el) => OS.get(k).menubar.render(el));
      }));
    },
  };
  const clock = () => new Date(OS.now()).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(/,/g, '');
  function oneShotMenu(el) {
    const draw = () => {
      el.innerHTML = `<div class="menu"><button data-a="open"><span class="logo" style="width:16px;height:16px;border-radius:4px;font-size:9px">1</span>Open OneShot</button><hr>
        ${OS.hotkey.list().map((k) => `<button data-hk="${k.full}">${icon(k.feature.icon, 's')}${esc(k.label)}<span class="kbd">${esc(OS.hotkey.label(k.full))}</span></button>`).join('')}
        <hr>${OS.perm.missing().length ? `<button data-a="perm">${icon('i-lock', 's')}${OS.perm.missing().length} permission${OS.perm.missing().length > 1 ? 's' : ''} missing<span class="r muted">Review</span></button>` : ''}
        <button data-a="prefs">${icon('i-gear', 's')}Preferences…<span class="kbd">⌘,</span></button></div>`;
      el.querySelectorAll('[data-hk]').forEach((b) => (b.onclick = () => { closePop(); setTimeout(() => OS.hotkey.run(b.dataset.hk), 0); }));
      el.querySelector('[data-a=open]').onclick = () => { closePop(); OS.open(currentId || OS.features[0].id); };
      el.querySelector('[data-a=prefs]').onclick = () => { closePop(); OS.openPrefs(); };
      const pm = el.querySelector('[data-a=perm]'); if (pm) pm.onclick = () => { closePop(); OS.openPrefs('permissions'); };
    };
    draw(); OS.watch(el, 'prefs perm', draw);
  }
  function scenarioMenu(el) {
    const all = [{ key: 'slow', label: 'Slow loading (all data views)' }];
    const draw = () => {
      el.innerHTML = `<div class="menu" style="min-width:300px"><div class="mh">Scenarios — conditions, not navigation</div>
        ${all.map((s) => item(s)).join('')}
        ${OS.features.map((f) => `<div class="mh">${esc(f.name)}</div>${[{ key: f.id + '.empty', label: 'Start empty' }, { key: f.id + '.fail', label: 'Store fails to load' }, ...f.scenarios.map((s) => ({ key: f.id + '.' + s.key, label: s.label }))].map(item).join('')}`).join('')}
        <hr><button data-skip="300000">${icon('i-clock', 's')}Skip ahead 5 minutes</button><button data-skip="86400000">${icon('i-calendar', 's')}Skip ahead 1 day</button></div>`;
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => setScn(b.dataset.s, !OS.scn(b.dataset.s))));
      el.querySelectorAll('[data-skip]').forEach((b) => (b.onclick = () => { OS.skip(+b.dataset.skip); OS.ui.toast('Clock moved ahead', { icon: 'i-clock', sub: clock(), ms: 2000 }); }));
    };
    const item = (s) => `<button data-s="${s.key}"><span class="chk">${OS.scn(s.key) ? '✓' : ''}</span>${esc(s.label)}</button>`;
    draw(); OS.watch(el, 'scn', draw);
    el.parentNode.style.maxHeight = '820px'; el.parentNode.style.overflow = 'auto';
  }

  /* ---------- window + rail + views ---------- */
  let currentId = null;
  function refreshRail() {
    const rail = $('#rail'); if (!rail) return;
    rail.innerHTML = `<div class="lights"><i class="x" data-close title="Close"></i><i></i><i></i></div>
      ${OS.features.map((f) => `<a data-go="${f.id}" class="${currentId === f.id ? 'on' : ''}">${icon(f.icon)}${esc(f.name)}</a>`).join('')}
      <div class="sp"></div><hr><a data-go="prefs" class="${currentId === 'prefs' ? 'on' : ''}">${icon('i-gear')}Preferences${OS.perm.missing().length ? '<i class="dot" title="Permissions missing"></i>' : ''}</a>`;
    rail.querySelector('[data-close]').onclick = () => { $('#win').hidden = true; };
    rail.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => (a.dataset.go === 'prefs' ? OS.openPrefs() : OS.open(a.dataset.go))));
  }
  OS.open = (fid, params = {}) => {
    const f = OS.get(fid); if (!f) return;
    OS.ui.closeFloat(); closePop();
    $('#win').hidden = false; OS.front('#win'); currentId = fid; refreshRail();
    const main = $('#main');
    main.innerHTML = `<div class="vh">${icon(f.icon)}<h1>${esc(f.view.title || f.name)}</h1><div class="tools"><button class="btn ghost" data-pg title="${esc(f.name)} preferences">${icon('i-gear')}Settings</button></div></div><div id="view"></div>`;
    main.querySelector('[data-pg]').onclick = () => OS.openPrefs(fid);
    const v = $('#view');
    f.view.mount(v, params);
  };
  OS.currentView = () => currentId;
  OS.openPrefs = (section) => {
    OS.ui.closeFloat(); closePop();
    $('#win').hidden = false; OS.front('#win'); currentId = 'prefs'; refreshRail();
    const main = $('#main');
    main.innerHTML = `<div class="vh">${icon('i-gear')}<h1>Preferences</h1></div><div class="prefs" id="prefs"></div>`;
    const sh = $('#prefs');
    sh.innerHTML = `<section class="psec" id="ps-permissions"><h2>${icon('i-shield')}Permissions &amp; Privacy<span class="muted">Shell</span></h2><div data-perm></div><div data-pol></div></section>
      <section class="psec" id="ps-hotkeys"><h2>${icon('i-kbd')}Hotkeys<span class="muted">Shell · one registry</span></h2><div data-hks></div></section>
      ${OS.features.map((f) => `<section class="psec" id="ps-${f.id}"><h2>${icon(f.icon)}${esc(f.name)}<span class="muted">${f.prefs.length} settings · ${f.hotkeys.length} hotkey${f.hotkeys.length === 1 ? '' : 's'}</span></h2><div data-fp="${f.id}"></div></section>`).join('')}`;
    const permEl = sh.querySelector('[data-perm]');
    const drawPerm = () => {
      permEl.innerHTML = Object.entries(PERMS).map(([id, p]) => `<div class="prow"><div class="pl"><b>${icon(p.icon, 's')} ${esc(p.name)}</b><div class="fx">${esc(p.why)} Used by ${esc(usedBy(id))}.</div></div>
        <div class="pc">${granted[id] ? '<span class="tag ok">Granted</span>' : '<span class="tag warn">Not granted</span>'}<button class="btn" data-p="${id}">${id === 'helper' ? (granted[id] ? 'Remove helper…' : 'Install helper') : granted[id] ? 'Open System Settings' : 'Grant'}</button></div></div>`).join('');
      permEl.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => (granted[b.dataset.p] && b.dataset.p !== 'helper' ? systemSettings(b.dataset.p) : granted[b.dataset.p] ? dialog(`<div class="logo">1</div><h3>Remove the helper?</h3><p>Charge limit stops working until it is installed again.</p><div class="acts"><button class="btn" data-r="0">Keep</button><button class="btn danger" data-r="1">Remove</button></div>`).then((r) => r === '1' && OS.perm.set('helper', false)) : OS.perm.request(b.dataset.p))));
    };
    drawPerm(); OS.watch(permEl, 'perm', drawPerm);
    const pol = sh.querySelector('[data-pol]');
    const drawPol = () => {
      pol.innerHTML = `<div class="sec-h" style="padding-left:16px">Clipboard policy — what may enter history</div>` +
        OS.policy.sources.map((s) => `<div class="prow"><div class="pl"><b>Record copies from ${s === 'OneShot' ? 'OneShot itself' : s}</b><div class="fx">${s === 'Screenshot' ? 'Copy & Close and OCR text land in Clipboard history' : s === 'OneShot' ? 'Copy in JSON Studio and the Format pill adds a clip' : `Copying in ${s} adds a clip`}</div></div><div class="pc"><button class="sw" role="switch" data-k="policy.${s}" aria-checked="${prefs['policy.' + s] !== false}"></button></div></div>`).join('') +
        `<div class="prow"><div class="pl"><b>Vault</b><div class="fx">Never recorded. Fill and copy put the value on the pasteboard only.</div></div><div class="pc"><span class="tag">${icon('i-lock', 's')}Always excluded</span></div></div>`;
    };
    drawPol(); bindPrefControls(pol); OS.watch(pol, 'prefs', drawPol);
    const hks = sh.querySelector('[data-hks]');
    const drawHk = () => (hks.innerHTML = OS.hotkey.list().map((k) => hotkeyRow(k, true)).join(''));
    drawHk(); bindPrefControls(hks); OS.watch(hks, 'prefs', (k) => k && String(k).startsWith('hotkey.') && drawHk());
    sh.querySelectorAll('[data-fp]').forEach((el) => OS.prefs.render(el, el.dataset.fp));
    if (section) { const s = $('#ps-' + section); if (s) { sh.style.scrollBehavior = 'auto'; sh.scrollTop = s.offsetTop - 8; sh.style.scrollBehavior = ''; s.classList.add('flash'); } }
  };
  const usedBy = (id) => ({ screen: 'Screenshot (capture, record, OCR)', access: 'Clipboard paste, Format, Autofill', helper: 'Battery charge limit' }[id]);

  /* ---------- desk: simulated host apps ---------- */
  const TE_TEXT = `Release notes — draft

Ship the status endpoint before Friday.
Response from staging (one line, needs formatting):
{"service":"status","ok":true,"regions":["us-east","eu-west"],"latency":{"p50":42,"p95":118},"version":"1.4.2"}

Payload from the webhook (broken — trailing comma):
{"event":"deploy","id":7781,"tags":["api","web",],"actor":"maya"}

Todo
- copy the staging URL: https://status.acme.io/health
- send the screenshot of the dashboard to the channel
`;
  function mountDesk() {
    $('#desk').innerHTML = `
      <div class="hwin" id="te"><div class="tb"><div class="lights dim"><i></i><i></i><i></i></div>${icon('i-note', 's')} Notes.txt — TextEdit</div><textarea spellcheck="false"></textarea></div>
      <div class="hwin" id="sf"><div class="tb"><div class="lights dim"><i></i><i></i><i></i></div>${icon('i-globe', 's')} Safari</div>
        <div class="tabs"></div><div class="url">${icon('i-lock', 's')}<span data-url></span></div><div class="page"></div></div>`;
    const ta = $('#desk #te textarea'); ta.value = TE_TEXT;
    ta.addEventListener('copy', (e) => { const s = OS.host.textedit.getSelection(); if (!s.text) return; e.preventDefault(); OS.pasteboard.copy({ kind: kindOf(s.text), text: s.text, source: 'TextEdit' }); });
    ta.addEventListener('cut', (e) => { const s = OS.host.textedit.getSelection(); if (!s.text) return; e.preventDefault(); OS.pasteboard.copy({ kind: kindOf(s.text), text: s.text, source: 'TextEdit' }); OS.host.textedit.replace(s.start, s.end, ''); });
    ta.addEventListener('paste', (e) => { e.preventDefault(); const p = OS.pasteboard.current; if (p && p.text) OS.host.textedit.insert(p.text); });
    drawSafari();
  }
  const SITES = [
    { host: 'github.com', path: '/login', title: 'Sign in to GitHub', tab: 'GitHub', blurb: 'Use your GitHub account.' },
    { host: 'status.acme.io', path: '/login', title: 'Acme Status', tab: 'Acme Status', blurb: 'Sign in to manage incidents.' },
  ];
  let site = 0, signed = null;
  function drawSafari() {
    const sf = $('#sf'), s = SITES[site];
    sf.querySelector('.tabs').innerHTML = SITES.map((x, i) => `<button class="${i === site ? 'on' : ''}" data-tab="${i}">${esc(x.tab)}</button>`).join('');
    sf.querySelector('[data-url]').textContent = s.host + s.path;
    sf.querySelector('.page').innerHTML = signed === site ? `<div class="login"><div class="ok" data-ocr>Signed in to ${esc(s.host)}</div></div>` :
      `<form class="login" autocomplete="off" onsubmit="return false"><h2 data-ocr>${esc(s.title)}</h2><p data-ocr>${esc(s.blurb)}</p>
        <input name="u" placeholder="Email or username" data-login="user"><input name="p" type="password" placeholder="Password" data-login="pass"><button class="go">Sign in</button></form>`;
    sf.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { site = +b.dataset.tab; signed = null; OS.ui.closeFloat(); drawSafari(); }));
    sf.querySelectorAll('[data-login]').forEach((i) => i.addEventListener('focus', () => OS.emit('host:loginFocus', { field: i.dataset.login, el: i, host: s.host })));
    const go = sf.querySelector('.go'); if (go) go.onclick = () => { const f = sf.querySelectorAll('[data-login]'); if (f[0].value && f[1].value) { signed = site; drawSafari(); } else f[f[0].value ? 1 : 0].focus(); };
    const page = sf.querySelector('.page');
    page.addEventListener('copy', (e) => { const t = String(window.getSelection()); if (!t) return; e.preventDefault(); OS.pasteboard.copy({ kind: kindOf(t), text: t, source: 'Safari' }); });
  }
  const kindOf = (t) => { const s = t.trim(); if (/^https?:\/\/\S+$/.test(s)) return 'url'; if (/^[\[{]/.test(s)) return 'json'; return 'text'; };
  OS.kindOf = kindOf;

  /* caret position in the textarea (mirror technique) */
  function caretPoint(ta, pos) {
    const cs = getComputedStyle(ta), m = document.createElement('div');
    ['font', 'padding', 'border', 'whiteSpace', 'letterSpacing', 'lineHeight', 'boxSizing', 'width'].forEach((p) => (m.style[p] = cs[p]));
    m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.whiteSpace = 'pre';
    m.textContent = ta.value.slice(0, pos); const sp = document.createElement('span'); sp.textContent = '​'; m.appendChild(sp);
    document.body.appendChild(m); const r = ta.getBoundingClientRect(); const x = r.left + sp.offsetLeft - ta.scrollLeft, y = r.top + sp.offsetTop - ta.scrollTop; m.remove();
    return { x: Math.min(r.right - 20, Math.max(r.left, x)), y: Math.min(r.bottom - 10, Math.max(r.top, y)), lineHeight: parseFloat(cs.lineHeight) || 20 };
  }
  const teUndo = [];
  OS.host = {
    textedit: {
      el: () => $('#desk #te textarea'),
      getSelection() { const ta = $('#desk #te textarea'); return { start: ta.selectionStart, end: ta.selectionEnd, text: ta.value.slice(ta.selectionStart, ta.selectionEnd) }; },
      select(start, end) { const ta = $('#desk #te textarea'); ta.focus(); ta.setSelectionRange(start, end); },
      replace(start, end, text) { const ta = $('#desk #te textarea'); teUndo.push(ta.value); ta.value = ta.value.slice(0, start) + text + ta.value.slice(end); ta.focus(); ta.setSelectionRange(start, start + text.length); OS.emit('host:edit'); return { start, end: start + text.length }; },
      insert(text) { const s = OS.host.textedit.getSelection(); const r = OS.host.textedit.replace(s.start, s.end, text); $('#desk #te textarea').setSelectionRange(r.end, r.end); return r; },
      caret(pos) { const ta = $('#desk #te textarea'); return caretPoint(ta, pos == null ? ta.selectionEnd : pos); },
      value: () => $('#desk #te textarea').value,
    },
    safari: {
      host: () => SITES[site].host,
      fields: () => { const f = document.querySelectorAll('#desk > #sf [data-login]'); return { user: f[0], pass: f[1] }; },
      fill(u, p) { const f = OS.host.safari.fields(); if (!f.user) return false; f.user.value = u; f.pass.value = p; f.pass.focus(); OS.emit('host:filled', { host: SITES[site].host }); return true; },
      signedIn: () => signed === site,
    },
    /* text visible inside a client rect (for OCR) */
    textInRect(r) {
      const out = [], ta = $('#desk #te textarea'), tr = ta.getBoundingClientRect();
      const ov = (a) => !(a.right < r.left || a.left > r.right || a.bottom < r.top || a.top > r.bottom);
      if (ov(tr)) {
        const lh = 20, pad = 16;
        ta.value.split('\n').forEach((line, i) => { const top = tr.top + pad + i * lh - ta.scrollTop; if (line.trim() && top + lh > r.top && top < r.bottom && top > tr.top - 4 && top < tr.bottom) out.push(line); });
      }
      document.querySelectorAll('#desk > #sf [data-ocr], #desk > #sf .tabs button, #desk > #sf [data-url]').forEach((e) => { if (ov(e.getBoundingClientRect())) out.push(e.textContent.trim()); });
      return out.join('\n');
    },
  };

  /* desk image for screenshots: a frozen copy of the desk */
  OS.desk = {
    snapshot() {
      const c = $('#desk').cloneNode(true); c.removeAttribute('id');
      const src = $('#desk').querySelectorAll('textarea,input');
      c.querySelectorAll('textarea,input').forEach((n, i) => { if (n.tagName === 'TEXTAREA') { n.textContent = src[i].value; n.setAttribute('data-st', src[i].scrollTop); } else n.setAttribute('value', src[i].value); });
      return c.innerHTML;
    },
    /* element showing rect (screen coords) of a snapshot, scaled to width */
    view(snap, rect, width) {
      const k = width / rect.w;
      const box = h(`<div style="position:relative;overflow:hidden;width:${width}px;height:${Math.round(rect.h * k)}px;background:#d8dde6;border-radius:6px"></div>`);
      const inner = h(`<div style="position:absolute;left:0;top:0;width:1440px;height:872px;transform-origin:0 0;transform:scale(${k}) translate(${-rect.x}px,${-(rect.y - 28)}px);pointer-events:none;background:radial-gradient(1200px 700px at 20% 10%,#c9d6ea,transparent),radial-gradient(900px 600px at 90% 90%,#e9d4c8,transparent),#d8dde6"></div>`);
      inner.innerHTML = snap; box.appendChild(inner);
      requestAnimationFrame(() => inner.querySelectorAll('textarea[data-st]').forEach((t) => (t.scrollTop = +t.dataset.st)));
      return box;
    },
    set(o) { if (o.dim != null) $('#dim').style.opacity = o.dim; if (o.warm != null) $('#warm').style.opacity = o.warm; },
    toScreen(r) { const sr = $('#screen').getBoundingClientRect(); return { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height }; },
    toClient(x, y) { const sr = $('#screen').getBoundingClientRect(); return { x: x + sr.left, y: y + sr.top }; },
  };

  /* ---------- global input ---------- */
  document.addEventListener('keydown', (e) => {
    if (recording) { e.preventDefault(); e.stopPropagation(); if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return; return finishRecord(e); }
    if (dlgDone) { if (e.key === 'Escape') { e.preventDefault(); const c = $('#dlg [data-r="cancel"],#dlg [data-r="0"],#dlg [data-r="done"]'); dlgDone(c ? c.dataset.r : 'cancel'); } return; }
    if (ovl) { if (ovl.onKey && ovl.onKey(e)) return e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); return OS.ui.overlay.close(); } return; } // no hotkeys while the transient editor is up
    if (flt) { if (flt.onKey && flt.onKey(e)) return e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); return OS.ui.closeFloat(); } }
    if (popFor && e.key === 'Escape') { e.preventDefault(); return closePop(); }
    if (e.metaKey && e.key === ',') { e.preventDefault(); return OS.openPrefs(); }
    const c = comboOf(e); const k = c && OS.hotkey.owner(c);
    if (k && (e.ctrlKey || e.altKey || e.metaKey)) { e.preventDefault(); k.run(); }
  }, true);
  /* outside click closes floats/popovers and does nothing else */
  document.addEventListener('mousedown', (e) => {
    if (dlgDone || ovl) return;
    if (flt && !e.target.closest('#float')) OS.ui.closeFloat();
    if (popFor && !e.target.closest('#pop') && !e.target.closest('[data-mb]')) closePop();
  }, true);

  /* window z-order: click raises; features raise a host app before acting on it */
  let zOrder = ['#te', '#sf', '#win'];   // z 20..22, always under menubar (60) and floats (80)
  OS.front = (sel) => { zOrder = zOrder.filter((x) => x !== sel).concat(sel); zOrder.forEach((x, i) => { const w = $(x); if (w) w.style.zIndex = 20 + i; }); };
  document.addEventListener('mousedown', (e) => { const w = e.target.closest('.hwin, #win'); if (w) OS.front('#' + w.id); });
  OS.host.textedit.front = () => OS.front('#te');
  OS.host.safari.front = () => OS.front('#sf');

  /* ---------- boot ---------- */
  OS.boot = (start) => {
    document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${window.ICONS}</defs></svg>`);
    $('#screen').innerHTML = `<div id="menubar"><div class="mb-l"><span style="font-size:15px"></span><b>OneShot</b><span>File</span><span>Edit</span><span>View</span><span>Window</span></div><div class="mb-r" id="mbR"></div></div>
      <div id="desk"></div><div id="win" hidden><nav class="rail" id="rail"></nav><div id="main"></div></div>
      <div id="pop" hidden></div><div id="float" hidden></div><div id="overlay" hidden></div><div id="dim"></div><div id="warm"></div><div id="toasts"></div><div id="dlg" hidden></div>`;
    mountDesk(); refreshRail(); OS.menubar.refresh();
    OS.on('prefs perm change scn', () => OS.menubar.refresh());
    setInterval(() => OS.menubar.refresh(), 15000);
    OS.features.forEach((f) => f.init && f.init());
    OS.emit('boot');
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.get('open')) (q.get('open') === 'prefs' ? OS.openPrefs(q.get('section')) : OS.open(q.get('open')));
    else if (start) OS.open(start);
  };
})();
