/* OneShot v3 shell. Owns: activation + windows (management, Preferences), the OneShot menus and their validation,
   the store (persistence), permissions, pasteboard writer + policy, hotkey registry, scenarios, system dialogs,
   toasts, floats, overlay, contract notes and the simulated desk. Contract: SPEC.md. Plan: PLAN.md. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (n, cls = '') => `<svg class="ic ${cls}"><use href="#${n}"/></svg>`;
  let uid = 0;

  const OS = (window.OS = {
    data: {}, features: [], $, $$, h, esc,
    version: '1.0 (100)', helperBundled: '1.1.0', helperInstalled: '1.0.2',
    id: (p = 'x') => p + '-' + (++uid) + '-' + Math.random().toString(36).slice(2, 6),
  });

  /* ---------- events ---------- */
  const ev = {};
  OS.on = (names, fn) => { names.split(' ').forEach((n) => (ev[n] = ev[n] || []).push(fn)); return () => names.split(' ').forEach((n) => (ev[n] = (ev[n] || []).filter((f) => f !== fn))); };
  OS.emit = (n, p) => (ev[n] || []).slice().forEach((f) => { try { f(p, n); } catch (e) { console.error(e); } });
  OS.watch = (el, names, fn) => { const off = OS.on(names, (p, n) => { if (!el.isConnected) return off(); fn(p, n); }); return off; };
  OS.commit = (id, fn) => { fn(OS.data[id]); OS.store.save(id); OS.emit('change:' + id, OS.data[id]); OS.emit('change', id); };

  /* ---------- simulated clock ---------- */
  let skew = 0;
  OS.now = () => Date.now() + skew;
  OS.skip = (ms) => { skew += ms; OS.emit('tick', ms); OS.emit('clock'); };
  setInterval(() => OS.emit('tick', 0), 1000);
  OS.ago = (t) => { const s = Math.max(0, (OS.now() - t) / 1000); if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h'; return Math.floor(s / 86400) + 'd'; };
  OS.bytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

  /* ---------- store: one durable file per feature (localStorage stands in for Application Support) ---------- */
  const NS = 'oneshot.v3.';
  const LS = {
    get(k) { try { const v = localStorage.getItem(NS + k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    clear() { try { Object.keys(localStorage).filter((k) => k.startsWith(NS)).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* storage unavailable */ } },
  };
  const meta = LS.get('meta') || {};      // id -> {at, bytes}
  const pending = {};
  function write(id) {
    delete pending[id];
    const s = JSON.stringify(OS.data[id]);
    if (!LS.set('data.' + id, OS.data[id])) return OS.emit('store:fail', id);
    meta[id] = { at: OS.now(), bytes: s.length }; LS.set('meta', meta); OS.emit('store', id);
  }
  OS.store = {
    path: (id) => `~/Library/Application Support/OneShot/${id}.store`,
    info: (id) => meta[id] || null,
    restored: {},
    save(id) {
      if (OS.scn(id + '.empty')) return;                  // a condition, never written over the user's data
      clearTimeout(pending[id]); pending[id] = setTimeout(() => write(id), 250);   // coalesced write
    },
    flush() { Object.keys(pending).forEach((id) => { clearTimeout(pending[id]); write(id); }); },
    reset() { LS.clear(); Object.keys(pending).forEach((id) => clearTimeout(pending[id])); location.reload(); },
  };
  window.addEventListener('pagehide', () => OS.store.flush());

  /* ---------- feature registry ---------- */
  const storedPrefs = LS.get('prefs') || {};
  const defPref = (k, v) => (prefs[k] = k in storedPrefs ? storedPrefs[k] : v);
  OS.feature = (def) => {
    def.prefs = def.prefs || []; def.hotkeys = def.hotkeys || []; def.scenarios = def.scenarios || [];
    OS.features.push(def);
    const saved = LS.get('data.' + def.id);
    OS.store.restored[def.id] = !!saved;
    OS.data[def.id] = saved || (def.seed ? def.seed() : {});
    def.prefs.forEach((p) => { p.full = def.id + '.' + p.key; prefDefs[p.full] = p; defPref(p.full, p.default); });
    def.hotkeys.forEach((k) => { k.full = def.id + '.' + k.id; k.feature = def; hotkeys[k.full] = k; defPref('hotkey.' + k.full, k.default); });
    if (def.menubar) defPref('menubar.' + def.id, true);
    if (!saved) OS.store.save(def.id);
  };
  OS.get = (id) => OS.features.find((f) => f.id === id);

  /* ---------- services for handoffs ---------- */
  const svc = {};
  OS.provide = (n, fn) => (svc[n] = fn);
  OS.call = (n, p) => { if (!svc[n]) { console.warn('no service', n); return; } return svc[n](p); };
  OS.has = (n) => !!svc[n];

  /* ---------- background work: latest-wins, cancelled runs never land (stands in for a cancellable Task) ---------- */
  const bgTok = {};
  OS.bg = (key, fn, ms) => {
    const tok = (bgTok[key] || 0) + 1; bgTok[key] = tok;
    const d = ms != null ? ms : OS.scn('slow') ? 900 : 140;
    return new Promise((res) => setTimeout(() => { if (bgTok[key] === tok) res(fn()); }, d));
  };
  OS.bg.cancel = (key) => { bgTok[key] = (bgTok[key] || 0) + 1; };

  /* ---------- preferences ---------- */
  const prefs = {}, prefDefs = {};
  OS.pref = (k) => prefs[k];
  OS.setPref = (k, v) => { if (prefs[k] === v) return; prefs[k] = v; LS.set('prefs', prefs); OS.emit('pref:' + k, v); OS.emit('prefs', k); };
  ['TextEdit', 'Safari', 'Screenshot', 'OneShot'].forEach((s) => defPref('policy.' + s, true));
  defPref('general.launchAtLogin', false);

  function control(p) {
    const v = OS.pref(p.full);
    if (p.type === 'toggle') return `<button class="sw" role="switch" data-k="${p.full}" aria-checked="${!!v}" aria-label="${esc(p.label)}"></button>`;
    if (p.type === 'select' && p.options.length <= 4) return `<div class="seg" data-k="${p.full}">${p.options.map(([ov, ol]) => `<button data-v="${esc(JSON.stringify(ov))}" aria-pressed="${ov === v}">${esc(ol)}</button>`).join('')}</div>`;
    if (p.type === 'select') return `<select class="field" data-k="${p.full}">${p.options.map(([ov, ol]) => `<option value='${esc(JSON.stringify(ov))}' ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
    if (p.type === 'slider') return `<input type="range" data-k="${p.full}" min="${p.min}" max="${p.max}" step="${p.step || 1}" value="${v}"><span class="mono val" data-out="${p.full}">${v}${p.unit || ''}</span>`;
    if (p.type === 'text') return `<input class="field" data-k="${p.full}" value="${esc(v)}" style="width:170px">`;
    return '';
  }
  function prefRow(p) {
    const st = p.needs ? OS.perm.state(p.needs) : 'granted';
    const need = st !== 'granted' ? `<div class="err">${esc(needLine(p.needs, st))}</div>` : '';
    return `<div class="prow" data-row="${p.full}"><div class="pl"><div class="pt">${esc(p.label)}</div><div class="fx">${esc(p.effect)}</div>${need}</div><div class="pc">${control(p)}</div></div>`;
  }
  const needLine = (id, st) => ({
    missing: `Needs ${PERMS[id].name}. Turning this on asks for it.`,
    approval: `${PERMS[id].name} is waiting for approval in System Settings.`,
    outdated: `The charge helper is out of date. Turning this on updates it.`,
    unsupported: `Not available on this Mac.`,
  }[st]);
  async function setFromControl(p, v) {
    if (p.needs && v === true && !OS.perm.has(p.needs)) { const ok = await OS.perm.request(p.needs); if (!ok) { OS.emit('prefs', p.full); return; } }
    OS.setPref(p.full, v);
  }
  function bindPrefControls(el) {
    el.addEventListener('click', (e) => {
      const sw = e.target.closest('.sw[data-k]'); if (sw) { const p = prefDefs[sw.dataset.k] || { full: sw.dataset.k, type: 'toggle' }; setFromControl(p, sw.getAttribute('aria-checked') !== 'true'); return; }
      const sb = e.target.closest('.seg[data-k] button'); if (sb) { setFromControl(prefDefs[sb.parentNode.dataset.k], JSON.parse(sb.dataset.v)); return; }
      const hk = e.target.closest('[data-hk]'); if (hk) return recordHotkey(hk);
      if (e.target.closest('[data-tohk]')) OS.openPrefs('hotkeys');
    });
    el.addEventListener('input', (e) => {
      const t = e.target; if (!t.dataset.k) return; const p = prefDefs[t.dataset.k];
      if (t.type === 'range') { const n = +t.value; const o = el.querySelector(`[data-out="${t.dataset.k}"]`); if (o) o.textContent = n + (p.unit || ''); setFromControl(p, n); }
      else if (t.tagName === 'SELECT') setFromControl(p, JSON.parse(t.value));
      else setFromControl(p, t.value);
    });
  }
  /* render a feature's controls into any container; keeps itself in sync */
  OS.prefs = {
    render(el, fid, opt = {}) {
      const f = OS.get(fid);
      const draw = () => {
        const keys = opt.keys;
        el.innerHTML = f.prefs.filter((p) => !keys || keys.includes(p.key)).map(prefRow).join('') +
          (opt.hotkeys === false ? '' : f.hotkeys.map((k) => `<div class="prow"><div class="pl"><div class="pt">${esc(k.label)}</div><div class="fx">Change it in Hotkeys.</div></div><div class="pc">${kbd(OS.hotkey.label(k.full))}<button class="btn" data-tohk>Edit…</button></div></div>`).join(''));
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
  const KEYMAP = { Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Space: 'Space', Backquote: '`',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', Enter: '↩', Tab: '⇥' };
  const comboOf = (e) => {
    let k = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : /^F\d+$/.test(e.code) ? e.code : KEYMAP[e.code];
    if (!k) return null;
    return (e.ctrlKey ? '⌃' : '') + (e.altKey ? '⌥' : '') + (e.shiftKey ? '⇧' : '') + (e.metaKey ? '⌘' : '') + k;
  };
  OS.comboOf = comboOf;
  /* what CopySymbolicHotKeys would report on a default Mac, plus the menu equivalents every app shares */
  const SYMBOLIC = {
    '⌘Space': 'Spotlight', '⌥⌘Space': 'Finder search window', '⌃Space': 'Select the previous input source', '⌃⌥Space': 'Select next source in Input menu',
    '⇧⌘3': 'Save picture of screen as a file', '⇧⌘4': 'Save picture of selected area as a file', '⇧⌘5': 'Screenshot and recording options',
    '⌃⇧⌘3': 'Copy picture of screen to the clipboard', '⌃⇧⌘4': 'Copy picture of selected area to the clipboard',
    '⌃↑': 'Mission Control', '⌃↓': 'Application windows', '⌃←': 'Move left a space', '⌃→': 'Move right a space',
    '⌃⌘Q': 'Lock Screen', '⌃⌘Space': 'Emoji & Symbols', '⌥⌘D': 'Turn Dock hiding on/off', '⌃F2': 'Move focus to the menu bar', '⌃F3': 'Move focus to the Dock',
  };
  const MENU_EQ = { '⌘C': 'Copy', '⌘V': 'Paste', '⌘X': 'Cut', '⌘Z': 'Undo', '⇧⌘Z': 'Redo', '⌘A': 'Select All', '⌘Q': 'Quit', '⌘W': 'Close Window', '⌘,': 'Settings',
    '⌘H': 'Hide', '⌘M': 'Minimize', '⌘S': 'Save', '⌘O': 'Open', '⌘N': 'New', '⌘P': 'Print', '⌘T': 'New Tab', '⌘F': 'Find', '⌘R': 'Reload', '⌥⌘H': 'Hide Others', '⌘G': 'Find Next' };
  OS.hotkey = {
    label: (full) => prefs['hotkey.' + full] || '',
    list: () => Object.values(hotkeys),
    run: (full) => hotkeys[full] && hotkeys[full].run(),
    owner: (combo) => Object.values(hotkeys).find((k) => OS.hotkey.label(k.full) === combo),
    /* the recorder's rules, in order: modifier, shift-only, system, shared menus, our own registry */
    validate(full, c) {
      if (!c) return { err: 'needsModifier' };
      const mods = c.match(/^[⌃⌥⇧⌘]*/)[0];
      if (!/[⌃⌥⌘]/.test(mods)) return { err: mods.includes('⇧') ? 'shiftOnly' : 'needsModifier' };
      if (SYMBOLIC[c]) return { err: 'reserved', by: SYMBOLIC[c] };
      if (MENU_EQ[c]) return { err: 'menu', by: MENU_EQ[c] };
      const o = OS.hotkey.owner(c);
      if (o && o.full !== full) return { err: 'conflict', owner: o };
      return { ok: true };
    },
    set(full, c) { const r = OS.hotkey.validate(full, c); if (r.ok) { OS.setPref('hotkey.' + full, c); hkErr[full] = null; } else hkErr[full] = { ...r, combo: c }; OS.emit('hotkey:result', { full, ...r }); return r; },
    reset(full) { hkErr[full] = null; OS.setPref('hotkey.' + full, hotkeys[full].default); },
    error: (full) => hkErr[full] || null,
  };
  const hkErr = {};
  const hkMsg = (e) => ({
    needsModifier: 'Add ⌃, ⌥ or ⌘. A single key would fire while you type.',
    shiftOnly: '⇧ alone isn’t enough. Add ⌃, ⌥ or ⌘.',
    reserved: `${e.combo} is used by macOS for “${e.by}”.`,
    menu: `${e.combo} is “${e.by}” in every app’s menus.`,
    conflict: e.owner ? `${e.combo} is already “${e.owner.feature.name} · ${e.owner.label}”.` : '',
  }[e.err]);
  OS.hotkey.message = hkMsg;
  const kbd = (c) => (c ? `<span class="kbd">${esc(c)}</span>` : '<span class="muted">None</span>');
  OS.ui = { kbd };
  let recording = null;
  function recordHotkey(btn) {
    if (recording) { recording.btn.classList.remove('rec'); recording.btn.innerHTML = kbd(OS.hotkey.label(recording.full)); }
    recording = { btn, full: btn.dataset.hk };
    btn.classList.add('rec'); btn.innerHTML = '<span class="rec-t">Type shortcut</span>';
  }
  function finishRecord(e) {
    const { btn, full } = recording; recording = null; btn.classList.remove('rec');
    if (e.key === 'Escape') { btn.innerHTML = kbd(OS.hotkey.label(full)); return; }
    OS.hotkey.set(full, comboOf(e));
    OS.emit('prefs', 'hotkey.' + full);
  }

  /* ---------- permissions: state, not a boolean ---------- */
  const PERMS = {
    screen: { name: 'Screen Recording', pane: 'Privacy & Security › Screen & System Audio Recording', why: 'Capture, record and read text from the screen.', icon: 'i-shot', usedBy: 'Screenshot · capture, record, OCR' },
    access: { name: 'Accessibility', pane: 'Privacy & Security › Accessibility', why: 'Paste into apps, read and replace selected text, fill login fields.', icon: 'i-cursor', usedBy: 'Clipboard paste, Format, Autofill' },
    helper: { name: 'Charge helper', pane: 'General › Login Items & Extensions', why: 'Holds charging at your limit. Runs in the background with its own permission.', icon: 'i-shield', usedBy: 'Battery · charge limit' },
  };
  const base = Object.assign({ screen: 'missing', access: 'granted', helper: 'missing' }, LS.get('perm') || {});
  const STATE_TAG = { granted: ['ok', 'Allowed'], missing: ['warn', 'Not allowed'], approval: ['warn', 'Needs approval'], outdated: ['warn', 'Out of date'], unsupported: ['', 'Not available'] };
  OS.perm = {
    defs: PERMS,
    state(id) {
      if (id === 'helper') {
        if (OS.scn('perm.unsupported')) return 'unsupported';
        if (base.helper === 'granted' && OS.scn('perm.helperApproval')) return 'approval';
        if (base.helper === 'granted' && OS.scn('perm.helperOutdated')) return 'outdated';
      }
      if (id === 'screen' && base.screen === 'granted' && OS.scn('perm.screenReapprove')) return 'approval';
      return base[id];
    },
    has: (id) => OS.perm.state(id) === 'granted',
    missing: () => Object.keys(PERMS).filter((k) => !['granted', 'unsupported'].includes(OS.perm.state(k))),
    set(id, v) { base[id] = v === true ? 'granted' : v === false ? 'missing' : v; LS.set('perm', base); permChanged(id); },
    tag(id) { const [c, t] = STATE_TAG[OS.perm.state(id)]; return `<span class="tag ${c}">${t}</span>`; },
    request(id) {
      const st = OS.perm.state(id);
      if (st === 'granted') return Promise.resolve(true);
      if (st === 'unsupported') return Promise.resolve(false);
      if (id === 'helper') {
        if (st === 'approval') return loginItems().then(() => OS.perm.has(id));
        if (st === 'outdated') return dialog(`${appTile()}<h3>Update the charge helper?</h3><p>Installed ${esc(OS.helperInstalled)}. This version of OneShot needs ${esc(OS.helperBundled)}. Charging stays under macOS control until it’s updated.</p>
          <div class="acts"><button class="btn" data-r="0">Not Now</button><button class="btn primary" data-r="1">Update Helper</button></div>`).then((r) => { if (r === '1') setScn('perm.helperOutdated', false); return OS.perm.has(id); });
        return dialog(`${appTile()}<h3>“OneShot” wants to add a background helper</h3><p>${esc(PERMS.helper.why)} Use Touch ID or enter your password to allow this.</p>
          <div class="acts"><button class="btn" data-r="0">Cancel</button><button class="btn primary" data-r="1">Allow</button></div>`).then((r) => { if (r === '1') OS.perm.set('helper', true); return OS.perm.has(id); });
      }
      if (st === 'approval') return dialog(`${appTile()}<h3>Keep allowing OneShot to record the screen?</h3><p>macOS asks again from time to time. OneShot uses it only while you capture, record or read text.</p>
        <div class="acts"><button class="btn" data-r="0">Open System Settings</button><button class="btn primary" data-r="1">Allow</button></div>`).then((r) => { if (r === '1') setScn('perm.screenReapprove', false); else systemSettings(id); return OS.perm.has(id); });
      return systemSettings(id);
    },
  };
  function permChanged(id) { OS.emit('perm', id); OS.emit('prefs', 'perm'); refreshRail(); OS.menubar.refresh(); }
  const appTile = () => `<div class="logo">1</div>`;
  function systemSettings(id) {
    const p = PERMS[id];
    let on = base[id] === 'granted';
    return dialog(`<div class="crumb">System Settings › ${esc(p.pane)}</div>
      <h3>Allow the apps below to use ${esc(p.name)}</h3>
      <div class="app">${appTile()}<div style="flex:1"><b>OneShot</b><div class="muted small">${esc(p.why)}</div></div><button class="sw" role="switch" aria-checked="${on}" data-t></button></div>
      <div class="acts"><button class="btn primary" data-r="done">Done</button></div>`, (box) => {
      box.querySelector('[data-t]').onclick = (e) => { on = !on; e.currentTarget.setAttribute('aria-checked', on); };
    }).then(() => { if (on !== (base[id] === 'granted')) OS.perm.set(id, on); return OS.perm.has(id); });
  }
  function loginItems() {
    let on = false;
    return dialog(`<div class="crumb">System Settings › General › Login Items &amp; Extensions</div>
      <h3>Allow in the Background</h3><p class="small">Items that run in the background when OneShot isn’t open.</p>
      <div class="app">${appTile()}<div style="flex:1"><b>OneShot Helper</b><div class="muted small">Charge limit · version ${esc(OS.helperBundled)}</div></div><button class="sw" role="switch" aria-checked="false" data-t></button></div>
      <div class="acts"><button class="btn primary" data-r="done">Done</button></div>`, (box) => {
      box.querySelector('[data-t]').onclick = (e) => { on = !on; e.currentTarget.setAttribute('aria-checked', on); };
    }).then(() => { if (on) setScn('perm.helperApproval', false); });
  }
  OS.perm.openSettings = systemSettings;

  /* the one grant card; it follows the permission's state */
  OS.ui.grant = (el, id, purpose) => {
    const p = PERMS[id];
    const draw = () => {
      const st = OS.perm.state(id);
      if (st === 'granted') { el.dispatchEvent(new CustomEvent('granted', { bubbles: true })); return; }
      if (st === 'unsupported') return OS.ui.state(el, { kind: 'unsupported', title: 'Charge limit isn’t available on this Mac', body: 'OneShot couldn’t verify a charge-hold control on this Mac. Charging stays under macOS control.', detail: 'Checked after the last macOS update', note: 'ChargeCapability.probe() found no verified key → .unsupported' });
      const c = {
        missing: { t: id === 'helper' ? 'Add the charge helper' : `Allow ${p.name}`, b: purpose || p.why, a: id === 'helper' ? 'Add Helper…' : 'Open System Settings…' },
        approval: { t: id === 'helper' ? 'The charge helper needs your approval' : `Confirm ${p.name} again`, b: id === 'helper' ? 'Turn on OneShot Helper in Login Items & Extensions. The limit applies as soon as it’s on.' : 'macOS asks again from time to time. Nothing was captured while it waited.', a: id === 'helper' ? 'Open Login Items…' : 'Review…' },
        outdated: { t: 'Update the charge helper', b: `Installed ${OS.helperInstalled}; OneShot needs ${OS.helperBundled}. Charging stays under macOS control until then.`, a: 'Update Helper…' },
      }[st];
      el.innerHTML = `<div class="state permission ${st}"><div class="k">${esc(STATE_TAG[st][1])}</div><div class="tile">${icon(p.icon, 'l')}</div><h3>${esc(c.t)}</h3><p>${esc(c.b)}</p>
        <div class="st-acts"><button class="btn primary" data-grant>${esc(c.a)}</button></div>
        <div class="foot">${st === 'missing' ? `System Settings › ${esc(p.pane)}` : st === 'approval' && id === 'helper' ? 'System Settings › General › Login Items & Extensions' : `Helper ${esc(OS.helperInstalled)} → ${esc(OS.helperBundled)}`}</div>
        ${OS.ui.note(id === 'helper' ? 'SMAppService.daemon status → ' + st : 'Re-checked only while this card is visible and on didBecomeActive')}</div>`;
      el.querySelector('[data-grant]').onclick = (e) => { e.stopPropagation(); OS.perm.request(id); };
    };
    draw();
    OS.watch(el, 'perm', (pid) => { if (pid === id && el.isConnected) draw(); });
  };

  /* ---------- state placeholders ---------- */
  const STATE_ICON = { empty: 'i-layers', loading: 'i-cycle', failure: 'i-x', permission: 'i-lock', unsupported: 'i-null', locked: 'i-lock', nomatch: 'i-search', info: 'i-clock' };
  const STATE_K = { empty: 'Empty', loading: 'Loading', failure: 'Failure', permission: 'No permission', unsupported: 'Unsupported', locked: 'Locked', nomatch: 'No match', info: 'Info' };
  OS.ui.state = (el, s) => {
    el.innerHTML = `<div class="state ${s.kind} ${s.compact ? 'compact' : ''}"><div class="k">${STATE_K[s.kind] || s.kind}</div>
      <div class="tile">${icon(s.icon || STATE_ICON[s.kind] || 'i-layers', s.compact ? '' : 'l')}</div>
      <h3>${esc(s.title)}</h3>${s.body ? `<p>${esc(s.body)}</p>` : ''}
      ${s.action || s.action2 ? `<div class="st-acts">${s.action ? `<button class="btn ${s.kind === 'failure' ? '' : 'primary'}" data-act>${esc(s.action.label)}</button>` : ''}${s.action2 ? `<button class="btn" data-act2>${esc(s.action2.label)}</button>` : ''}</div>` : ''}
      ${s.detail ? `<div class="foot">${esc(s.detail)}</div>` : ''}${s.note ? OS.ui.note(s.note) : ''}</div>`;
    if (s.action) el.querySelector('[data-act]').onclick = (e) => { e.stopPropagation(); s.action.run(); };
    if (s.action2) el.querySelector('[data-act2]').onclick = (e) => { e.stopPropagation(); s.action2.run(); };
  };
  OS.ui.skeleton = (el, n = 6) => { el.innerHTML = `<div class="skel" aria-label="Loading">${Array.from({ length: n }, (_, i) => `<div class="sk-row"><i></i><b style="width:${55 + ((i * 37) % 35)}%"></b></div>`).join('')}</div>`; };
  OS.ui.load = (el, fid, render, opt = {}) => {
    const f = OS.get(fid);
    if (opt.skeleton) OS.ui.skeleton(el); else OS.ui.state(el, { kind: 'loading', title: `Opening ${f.name}…`, body: 'Reading the local store.', detail: OS.store.path(fid) });
    const ms = OS.scn('slow') ? 1800 : 260;
    setTimeout(() => {
      if (!el.isConnected) return;
      if (OS.scn(fid + '.fail')) return OS.ui.state(el, { kind: 'failure', title: `Couldn’t open ${f.name}`, body: 'The store didn’t respond. Nothing was changed or lost.', detail: `${OS.store.path(fid)} · read failed`, action: { label: 'Try Again', run: () => OS.ui.load(el, fid, render, opt) }, note: 'Repository actor read failed → store stays empty, no writes' });
      el.innerHTML = ''; render(el);
    }, ms);
  };
  /* design-contract chips: native intent, hidden unless Scenarios → Show native contract notes */
  OS.ui.note = (text) => `<span class="cn" title="Native contract">${esc(text)}</span>`;
  OS.ui.icon = icon; OS.ui.esc = esc;

  /* ---------- toasts (notification banners) ---------- */
  OS.ui.toast = (text, o = {}) => {
    const t = h(`<div class="toast ${o.kind || ''}"><div class="tt">${icon(o.icon || (o.kind === 'failure' ? 'i-x' : 'i-check'))}</div><div class="t"><b>${esc(text)}</b>${o.sub ? `<div class="sub">${esc(o.sub)}</div>` : ''}${o.note ? OS.ui.note(o.note) : ''}</div>${o.action ? `<button class="btn">${esc(o.action.label)}</button>` : ''}</div>`);
    if (o.action) t.querySelector('button').onclick = () => { t.remove(); o.action.run(); };
    $('#toasts').prepend(t); setTimeout(() => t.remove(), o.ms || 6000);
    return t;
  };

  /* ---------- float: non-activating panel at caret / field; closes when it would resign key ---------- */
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
    open(el, o = {}) { OS.ui.closeFloat(); closePop(); closeMenu(); const box = $('#overlay'); box.innerHTML = ''; box.appendChild(el); box.hidden = false; ovl = o; },
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
      const f = d.querySelector('input'); if (f) f.focus();
    });
  }
  /* LocalAuthentication, device-owner policy: biometry first, the Mac's login password as the system fallback.
     resolves {ok, method:'biometry'|'password'} | {ok:false, reason:'nomatch'|'cancel'|'lockout'} */
  function authenticate(reason) {
    const pwStep = (why) => dialog(`<div class="tid pw">${icon('i-lock', 'l')}</div><h3>OneShot</h3><p>${esc(reason)}</p>${why ? `<p class="muted small">${esc(why)}</p>` : ''}
      <input class="field wide" type="password" placeholder="Password" data-pw autocomplete="off"><div class="err small" data-err></div>
      <div class="acts"><button class="btn" data-r="cancel">Cancel</button><button class="btn primary" data-ok>OK</button></div>`, (box, fin) => {
      const pw = box.querySelector('[data-pw]');
      const go = () => { if (pw.value) fin('password'); else { box.querySelector('[data-err]').textContent = 'Enter the password you use to log in to this Mac.'; pw.focus(); } };
      box.querySelector('[data-ok]').onclick = go; pw.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    }).then((r) => (r === 'password' ? { ok: true, method: 'password' } : { ok: false, reason: 'cancel' }));
    if (OS.scn('auth.unavailable')) return pwStep('Touch ID isn’t available right now.');
    if (OS.scn('auth.lockout')) return pwStep('Touch ID is locked after too many attempts. Enter your password to turn it back on.').then((r) => { if (r.ok) setScn('auth.lockout', false); return r; });
    return dialog(`<div class="tid" data-touch>${icon('i-finger', 'xl')}</div><h3>Touch ID</h3><p>${esc(reason)}</p><p class="muted small">Touch the sensor. In this simulation, click the fingerprint.</p>
      <div class="acts"><button class="btn" data-r="password">Use Password…</button><button class="btn" data-r="cancel">Cancel</button></div>`, (box, fin) => {
      box.querySelector('[data-touch]').onclick = (e) => {
        if (OS.scn('auth.nomatch')) { setScn('auth.nomatch', false); e.currentTarget.classList.add('bad'); setTimeout(() => fin('nomatch'), 350); } else fin('ok');
      };
    }).then((r) => (r === 'ok' ? { ok: true, method: 'biometry' } : r === 'password' ? pwStep() : { ok: false, reason: r }));
  }
  OS.system = {
    dialog,
    confirm: (title, body, ok = 'OK', danger) => dialog(`${appTile()}<h3>${esc(title)}</h3><p>${esc(body)}</p><div class="acts"><button class="btn" data-r="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(ok)}</button></div>`).then((r) => r === '1'),
    authenticate,
    touchId: authenticate,     // v2 name
  };

  /* ---------- pasteboard: one writer, one policy ---------- */
  const CONCEALED = 'org.nspasteboard.ConcealedType', TRANSIENT = 'org.nspasteboard.TransientType', ORIGIN = 'com.oneshot.origin';
  OS.policy = {
    sources: ['TextEdit', 'Safari', 'Screenshot', 'OneShot'],
    allows: (src) => src !== 'Vault' && prefs['policy.' + src] !== false,
  };
  OS.pasteboard = {
    current: null, changeCount: 0,
    types: { CONCEALED, TRANSIENT, ORIGIN },
    /* PasteboardWriter: stamps data type + origin; secrets get concealed + transient unless the writer bug scenario is on */
    copy(item) {
      const p = Object.assign({ kind: 'text', at: OS.now() }, item);
      p.types = [p.kind === 'image' ? 'public.png' : 'public.utf8-plain-text'];
      if (p.source !== 'TextEdit' && p.source !== 'Safari') p.types.push(ORIGIN);
      if (p.source === 'Vault' && !OS.scn('pb.unstamped')) p.types.push(CONCEALED, TRANSIENT);
      p.concealed = p.types.includes(CONCEALED);
      OS.pasteboard.current = p; OS.pasteboard.changeCount++;
      const recorded = OS.policy.allows(p.source) && !p.concealed;
      if (recorded) OS.emit('pasteboard:record', p); // Clipboard feature sets p.clipId
      OS.emit('pasteboard', p);
      return { recorded, clipId: p.clipId, concealed: p.concealed, types: p.types };
    },
  };

  /* ---------- scenarios: conditions, never navigation ---------- */
  const scn = {}, stash = {};
  OS.scn = (k) => !!scn[k];
  function setScn(k, v) {
    scn[k] = v;
    const m = k.match(/^(\w+)\.empty$/);
    if (m) {
      const f = OS.get(m[1]);
      if (v) { stash[f.id] = OS.data[f.id]; OS.data[f.id] = f.empty ? f.empty() : {}; } else { OS.data[f.id] = stash[f.id] || f.seed(); delete stash[f.id]; }
      OS.emit('change:' + f.id, OS.data[f.id]); OS.emit('change', f.id);
    }
    if (k === 'notes') { document.body.classList.toggle('notes', v); LS.set('notes', v); }
    if (k === 'pb.watcher') drawWatcher();
    OS.emit('scn', k); OS.emit('scn:' + k, v);
    if (k.startsWith('perm.')) permChanged(k);
    if (k === 'login.approval') OS.emit('prefs', k);
  }
  OS.setScn = setScn;
  const SHELL_SCN = [
    { h: 'View', items: [{ key: 'notes', label: 'Show native contract notes' }] },
    { h: 'Store', items: [{ key: 'slow', label: 'Slow disk (loading and filtering take longer)' }] },
    { h: 'Permissions · re-checked while a card is visible and on activation', items: [
      { key: 'perm.helperApproval', label: 'Charge helper waits for approval in Login Items' },
      { key: 'perm.helperOutdated', label: `Installed helper is out of date (${OS.helperInstalled})` },
      { key: 'perm.unsupported', label: 'Charge control unsupported on this Mac' },
      { key: 'perm.screenReapprove', label: 'Screen Recording asks for re-approval' },
      { key: 'login.approval', label: 'Launch at login waits for approval' },
    ] },
    { h: 'Authentication · LocalAuthentication', items: [
      { key: 'auth.nomatch', label: 'Touch ID: next touch doesn’t match' },
      { key: 'auth.unavailable', label: 'Touch ID unavailable (lid closed)' },
      { key: 'auth.lockout', label: 'Touch ID locked out (password required)' },
    ] },
    { h: 'Pasteboard', items: [
      { key: 'pb.watcher', label: 'Another clipboard app is running' },
      { key: 'pb.unstamped', label: 'Writer bug: concealed markers not stamped' },
    ] },
  ];

  /* ---------- activation: an agent app; the menu bar belongs to the frontmost app ---------- */
  const APP_OF = { '#te': 'TextEdit', '#sf': 'Safari', '#pw': 'Pasty', '#win': 'OneShot', '#prefwin': 'OneShot' };
  let active = 'TextEdit', lastHost = 'TextEdit';
  OS.app = {
    active: () => active,
    policy: () => ($('#win') && !$('#win').hidden) || ($('#prefwin') && !$('#prefwin').hidden) ? 'regular' : 'accessory',
    activate(app) {
      if (app !== 'OneShot' && app !== 'Finder') lastHost = app;
      const changed = active !== app; active = app;
      paintKey(); drawMenubarLeft();
      if (changed) { closeMenu(); OS.emit('activate', app); if (app === 'OneShot') OS.emit('perm:check'); }
    },
  };
  function keyWindow() {
    for (let i = zOrder.length - 1; i >= 0; i--) { const w = $(zOrder[i]); if (w && !w.hidden && APP_OF[zOrder[i]] === active) return zOrder[i]; }
    return null;
  }
  OS.app.keyWindow = keyWindow;
  function paintKey() {
    const k = keyWindow();
    Object.keys(APP_OF).forEach((s) => { const w = $(s); if (w) w.classList.toggle('key', s === k); });
  }

  /* ---------- the OneShot menus (validated against the key window's responder) ---------- */
  let responder = null;
  OS.responder = (el, actions) => { responder = { el, actions }; };
  const action = (name) => {
    if (keyWindow() !== '#win' || !responder || !responder.el.isConnected) return null;
    return responder.actions[name] || null;
  };
  const enabledAct = (a) => !!a && (!a.enabled || a.enabled());
  const STD = { new: ['New', '⌘N'], undo: ['Undo', '⌘Z'], copy: ['Copy', '⌘C'], delete: ['Delete', '⌘⌫'], selectAll: ['Select All', '⌘A'], find: ['Find…', '⌘F'] };
  const stdItem = (name) => { const a = action(name); return { label: (a && a.label) || STD[name][0], key: STD[name][1], enabled: () => enabledAct(action(name)), run: () => action(name).run() }; };
  const MENUS = () => [
    { id: 'app', title: 'OneShot', items: [
      { label: 'About OneShot', run: about }, '-',
      { label: 'Preferences…', key: '⌘,', run: () => OS.openPrefs() }, '-',
      { label: 'Close All Windows', key: '⌥⌘W', enabled: () => OS.app.policy() === 'regular', run: () => { closeWin('#win'); closeWin('#prefwin'); } },
    ] },
    { id: 'file', title: 'File', items: [stdItem('new'), '-', { label: 'Close Window', key: '⌘W', enabled: () => !!keyWindow(), run: () => closeWin(keyWindow()) }] },
    { id: 'edit', title: 'Edit', items: [stdItem('undo'), '-', stdItem('copy'), stdItem('delete'), stdItem('selectAll'), '-', stdItem('find')] },
    { id: 'view', title: 'View', items: OS.features.map((f, i) => ({ label: f.name, key: '⌘' + (i + 1), checked: () => !$('#win').hidden && currentId === f.id, run: () => OS.open(f.id) })) },
    { id: 'window', title: 'Window', items: [
      { label: 'OneShot', key: '⌘0', checked: () => keyWindow() === '#win', run: () => OS.open(currentId || OS.features[0].id) },
      { label: 'Preferences', checked: () => keyWindow() === '#prefwin', run: () => OS.openPrefs() },
    ] },
  ];
  OS.menus = MENUS;
  const HOST_MENUS = { TextEdit: ['File', 'Edit', 'Format', 'View', 'Window', 'Help'], Safari: ['File', 'Edit', 'View', 'History', 'Bookmarks', 'Window', 'Help'], Pasty: ['File', 'Edit', 'Window', 'Help'], Finder: ['File', 'Edit', 'View', 'Go', 'Window', 'Help'] };
  function drawMenubarLeft() {
    const l = $('#mbL'); if (!l) return;
    if (active === 'OneShot') {
      l.innerHTML = `<span class="apple"></span>` + MENUS().map((m) => `<button class="mm ${m.id === 'app' ? 'app' : ''} ${openMenuId === m.id ? 'on' : ''}" data-menu="${m.id}">${esc(m.title)}</button>`).join('');
      l.querySelectorAll('[data-menu]').forEach((b) => {
        b.onmousedown = (e) => { e.stopPropagation(); openMenuId === b.dataset.menu ? closeMenu() : openMenu(b.dataset.menu); };
        b.onmouseenter = () => { if (openMenuId && openMenuId !== b.dataset.menu) openMenu(b.dataset.menu); };
      });
    } else l.innerHTML = `<span class="apple"></span><span class="mm app inert">${esc(active)}</span>${(HOST_MENUS[active] || []).map((t) => `<span class="mm inert">${t}</span>`).join('')}`;
  }
  let openMenuId = null;
  function openMenu(id) {
    closePop(); OS.ui.closeFloat();
    openMenuId = id; drawMenubarLeft();
    const m = MENUS().find((x) => x.id === id), btn = $(`#mbL [data-menu="${id}"]`), box = $('#menu');
    box.innerHTML = `<div class="menu">${m.items.map((it, i) => it === '-' ? '<hr>' : `<button data-i="${i}" ${it.enabled && !it.enabled() ? 'disabled' : ''}><span class="chk">${it.checked && it.checked() ? '✓' : ''}</span>${esc(it.label)}${it.key ? `<span class="ks">${esc(it.key)}</span>` : ''}</button>`).join('')}</div>`;
    box.hidden = false; box.style.left = (btn.getBoundingClientRect().left - $('#screen').getBoundingClientRect().left) + 'px';
    box.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { closeMenu(); m.items[+b.dataset.i].run(); }));
  }
  function closeMenu() { if (!openMenuId) return; openMenuId = null; $('#menu').hidden = true; $('#menu').innerHTML = ''; drawMenubarLeft(); }
  function menuKey(e, c) {
    if (active !== 'OneShot') return false;
    const t = e.target, editable = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (editable && ['⌘C', '⌘V', '⌘X', '⌘A', '⌘Z', '⇧⌘Z', '⌘⌫'].includes(c)) return false;
    for (const m of MENUS()) for (const it of m.items) if (it !== '-' && it.key === c) { if (!it.enabled || it.enabled()) { it.run(); } return true; }
    return false;
  }
  function about() {
    return dialog(`<div class="logo big">1</div><h3>OneShot</h3><p class="muted">Version ${esc(OS.version)}</p>
      <div class="kv tight"><dt>Charge helper</dt><dd>${OS.perm.state('helper') === 'outdated' ? esc(OS.helperInstalled) + ' installed · needs ' + esc(OS.helperBundled) : OS.perm.has('helper') ? esc(OS.helperBundled) : 'Not added'}</dd><dt>Data</dt><dd class="mono small">~/Library/Application Support/OneShot</dd></div>
      <div class="acts"><button class="btn primary" data-r="ok">OK</button></div>`);
  }

  /* ---------- status items ---------- */
  let popFor = null;
  function closePop() { $('#pop').hidden = true; $('#pop').innerHTML = ''; $$('.mbi.on').forEach((b) => b.classList.remove('on')); const p = popFor; popFor = null; return p; }
  function openPop(key, btn, render) {
    closeMenu();
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
      const items = OS.features.filter((f) => f.menubar && OS.pref('menubar.' + f.id) !== false).sort((a, b) => (a.menubar.order || 0) - (b.menubar.order || 0));
      r.innerHTML = items.map((f) => `<button class="mbi ${popFor === f.id ? 'on' : ''} ${f.menubar.cls ? f.menubar.cls() : ''}" data-mb="${f.id}" title="${esc(f.name)}">${icon(f.menubar.icon)}${f.menubar.label ? `<span>${esc(f.menubar.label())}</span>` : ''}</button>`).join('') +
        `<button class="mbi ${popFor === 'oneshot' ? 'on' : ''}" data-mb="oneshot" title="OneShot"><span class="logo mini">1</span>${OS.perm.missing().length ? '<i class="badge"></i>' : ''}</button>
         <button class="mbi ${popFor === 'scn' ? 'on' : ''}" data-mb="scn" title="Scenarios">${icon('i-wrench')}</button>
         <span class="mbi clock">${clock()}</span>`;
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
      const miss = OS.perm.missing();
      el.innerHTML = `<div class="menu"><button data-a="open"><span class="logo mini">1</span>Open OneShot</button><hr>
        ${OS.hotkey.list().map((k) => `<button data-hk="${k.full}">${icon(k.feature.icon, 's')}${esc(k.label)}<span class="ks">${esc(OS.hotkey.label(k.full))}</span></button>`).join('')}
        <hr>${miss.length ? `<button data-a="perm">${icon('i-lock', 's')}${miss.length} permission${miss.length > 1 ? 's' : ''} need attention<span class="ks">Review</span></button>` : ''}
        <button data-a="prefs">${icon('i-gear', 's')}Preferences…<span class="ks">⌘,</span></button></div>`;
      el.querySelectorAll('[data-hk]').forEach((b) => (b.onclick = () => { closePop(); setTimeout(() => OS.hotkey.run(b.dataset.hk), 0); }));
      el.querySelector('[data-a=open]').onclick = () => { closePop(); OS.open(currentId || OS.features[0].id); };
      el.querySelector('[data-a=prefs]').onclick = () => { closePop(); OS.openPrefs(); };
      const pm = el.querySelector('[data-a=perm]'); if (pm) pm.onclick = () => { closePop(); OS.openPrefs('privacy'); };
    };
    draw(); OS.watch(el, 'prefs perm', draw);
  }
  function scenarioMenu(el) {
    const item = (s) => `<button data-s="${s.key}"><span class="chk">${OS.scn(s.key) ? '✓' : ''}</span>${esc(s.label)}</button>`;
    const draw = () => {
      el.innerHTML = `<div class="menu scn"><div class="mh">Scenarios · conditions, not navigation</div>
        ${SHELL_SCN.map((g) => `<div class="mh">${esc(g.h)}</div>${g.items.map(item).join('')}`).join('')}
        ${OS.features.map((f) => `<div class="mh">${esc(f.name)}</div>${[{ key: f.id + '.empty', label: 'Start empty' }, { key: f.id + '.fail', label: 'Store fails to load' }, ...f.scenarios.map((s) => ({ key: f.id + '.' + s.key, label: s.label }))].map(item).join('')}`).join('')}
        <hr><button data-skip="300000">${icon('i-clock', 's')}Skip ahead 5 minutes</button><button data-skip="86400000">${icon('i-calendar', 's')}Skip ahead 1 day</button>
        <button data-reset>${icon('i-trash', 's')}Reset all data and reload</button></div>`;
      el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => setScn(b.dataset.s, !OS.scn(b.dataset.s))));
      el.querySelectorAll('[data-skip]').forEach((b) => (b.onclick = () => { OS.skip(+b.dataset.skip); OS.ui.toast('Clock moved ahead', { icon: 'i-clock', sub: clock(), ms: 2000 }); }));
      el.querySelector('[data-reset]').onclick = () => OS.store.reset();
    };
    draw(); OS.watch(el, 'scn', draw);
    el.parentNode.style.maxHeight = '820px'; el.parentNode.style.overflow = 'auto';
  }

  /* ---------- windows: management (rail) and Preferences, each a single lazily created controller ---------- */
  let currentId = null;
  const lights = (sel) => `<div class="lights"><i class="x" data-close="${sel}" title="Close"></i><i></i><i></i></div>`;
  function showWin(sel) { const w = $(sel); const was = w.hidden; w.hidden = false; OS.front(sel); OS.app.activate('OneShot'); if (was) OS.emit('window', { sel, open: true }); }
  function closeWin(sel) {
    if (!sel) return; const w = $(sel); if (!w || w.hidden) return;
    w.hidden = true; if (sel === '#win') responder = null;
    OS.emit('window', { sel, open: false });
    if (APP_OF[sel] === 'OneShot' && OS.app.policy() === 'accessory') OS.app.activate(lastHost); else OS.app.activate(active);
  }
  OS.closeWindow = closeWin;
  function refreshRail() {
    const rail = $('#rail'); if (!rail) return;
    rail.innerHTML = `${lights('#win')}<div class="grp">OneShot</div>
      ${OS.features.map((f) => `<a data-go="${f.id}" class="${currentId === f.id ? 'on' : ''}">${icon(f.icon)}<span>${esc(f.name)}</span>${f.badge ? `<span class="rb">${esc(f.badge() || '')}</span>` : ''}</a>`).join('')}
      <div class="sp"></div><a data-go="prefs">${icon('i-gear')}<span>Preferences…</span>${OS.perm.missing().length ? '<i class="dot" title="Permissions need attention"></i>' : ''}</a>`;
    rail.querySelectorAll('[data-go]').forEach((a) => (a.onclick = () => (a.dataset.go === 'prefs' ? OS.openPrefs() : OS.open(a.dataset.go))));
  }
  OS.refreshRail = refreshRail;
  OS.open = (fid, params = {}) => {
    const f = OS.get(fid); if (!f) return;
    OS.ui.closeFloat(); closePop(); closeMenu();
    currentId = fid; responder = null; showWin('#win'); refreshRail();
    const main = $('#main');
    main.innerHTML = `<div class="vh drag"><h1>${esc(f.view.title || f.name)}</h1><div class="sub" id="vhSub"></div><div class="tools" id="vhTools"><button class="btn tb" data-pg title="${esc(f.name)} preferences">${icon('i-sliders')}</button></div></div><div id="view"></div>`;
    main.querySelector('[data-pg]').onclick = () => OS.openPrefs(fid);
    f.view.mount($('#view'), params);
    drawMenubarLeft();
  };
  OS.currentView = () => (!$('#win').hidden ? currentId : null);
  /* a feature may put a subtitle (counts) and extra toolbar buttons into the window toolbar */
  OS.ui.subtitle = (text) => { const s = $('#vhSub'); if (s) s.textContent = text || ''; };
  OS.ui.toolbarTools = () => $('#vhTools');

  /* Preferences window: toolbar panes, the selected pane names the window */
  let prefPane = 'general';
  const PANES = () => [
    { id: 'general', name: 'General', icon: 'i-gear' }, { id: 'privacy', name: 'Privacy', icon: 'i-shield' },
    { id: 'hotkeys', name: 'Hotkeys', icon: 'i-kbd' }, { id: 'storage', name: 'Storage', icon: 'i-layers' },
    ...OS.features.map((f) => ({ id: f.id, name: f.name, icon: f.icon, feature: f })),
  ];
  OS.openPrefs = (section) => {
    section = ({ permissions: 'privacy', prefs: 'general' })[section] || section;
    if (section && PANES().some((p) => p.id === section)) prefPane = section;
    OS.ui.closeFloat(); closePop(); closeMenu();
    showWin('#prefwin'); drawPrefs();
  };
  OS.prefPane = () => (!$('#prefwin').hidden ? prefPane : null);
  function drawPrefs() {
    const w = $('#prefwin'), panes = PANES(), cur = panes.find((p) => p.id === prefPane);
    w.innerHTML = `<div class="ptb drag">${lights('#prefwin')}<div class="ptitle">${esc(cur.name)}</div>
      <div class="ptabs">${panes.map((p, i) => `${i === 4 ? '<i class="psep"></i>' : ''}<button data-pane="${p.id}" class="${p.id === prefPane ? 'on' : ''}">${icon(p.icon, 'l')}<span>${esc(p.name)}</span>${p.id === 'privacy' && OS.perm.missing().length ? '<i class="dot"></i>' : ''}</button>`).join('')}</div></div>
      <div class="prefs" id="prefs"></div>`;
    w.querySelectorAll('[data-pane]').forEach((b) => (b.onclick = () => { prefPane = b.dataset.pane; drawPrefs(); }));
    bindClose(w);
    const body = $('#prefs');
    ({ general: paneGeneral, privacy: panePrivacy, hotkeys: paneHotkeys, storage: paneStorage }[prefPane] || paneFeature)(body, cur.feature);
  }
  const group = (title, inner, foot, attrs = '') => `<section class="pgroup" ${attrs}>${title ? `<h3>${title}</h3>` : ''}<div class="pg">${inner}</div>${foot ? `<p class="pgf">${foot}</p>` : ''}</section>`;
  const row = (label, fx, ctl, attrs = '') => `<div class="prow" ${attrs}><div class="pl"><div class="pt">${label}</div>${fx ? `<div class="fx">${fx}</div>` : ''}</div><div class="pc">${ctl}</div></div>`;

  function paneGeneral(el) {
    const draw = () => {
      const on = OS.pref('general.launchAtLogin'), waiting = on && OS.scn('login.approval');
      el.innerHTML =
        group('Startup', row('Open OneShot at login', waiting ? '<span class="warn-t">Waiting for approval in System Settings › Login Items.</span>' : 'Starts in the menu bar. No window opens.',
          `${waiting ? '<button class="btn" data-li>Open Login Items…</button>' : ''}<button class="sw" role="switch" data-k="general.launchAtLogin" aria-checked="${!!on}" aria-label="Open OneShot at login"></button>`) + OS.ui.note('SMAppService.mainApp.status drives this switch; it is not a stored flag')) +
        group('Menu bar', OS.features.filter((f) => f.menubar).map((f) => row(esc(f.name), `Shows the ${esc(f.name)} item. Its position is remembered.`, `<button class="sw" role="switch" data-k="menubar.${f.id}" aria-checked="${OS.pref('menubar.' + f.id) !== false}" aria-label="Show ${esc(f.name)} in the menu bar"></button>`)).join('') +
          row('OneShot', 'Always shown, so hotkeys, Preferences and permissions stay one click away.', '<span class="tag">Always</span>'), OS.ui.note('NSStatusItem.autosaveName = com.oneshot.<id>; isVisible follows this switch')) +
        group('', row('OneShot ' + esc(OS.version), 'A menu bar app. It shows in the Dock and ⌘-Tab only while one of its windows is open.', '<button class="btn" data-about>About OneShot</button>'));
      const li = el.querySelector('[data-li]'); if (li) li.onclick = () => dialog(`<div class="crumb">System Settings › General › Login Items &amp; Extensions</div><h3>Open at Login</h3>
        <div class="app">${appTile()}<div style="flex:1"><b>OneShot</b><div class="muted small">Waiting for your approval</div></div><button class="sw" role="switch" aria-checked="false" data-t></button></div>
        <div class="acts"><button class="btn primary" data-r="done">Done</button></div>`, (box) => { box.querySelector('[data-t]').onclick = (e) => { e.currentTarget.setAttribute('aria-checked', 'true'); setScn('login.approval', false); }; });
      el.querySelector('[data-about]').onclick = about;
    };
    draw(); bindPrefControls(el); OS.watch(el, 'prefs scn', draw);
  }
  function panePrivacy(el) {
    const draw = () => {
      const lw = OS.pasteboard.current;
      el.innerHTML =
        group('Permissions', Object.entries(PERMS).map(([id, p]) => {
          const st = OS.perm.state(id);
          const btn = st === 'unsupported' ? '' : st === 'granted' ? (id === 'helper' ? '<button class="btn" data-rm>Remove…</button>' : `<button class="btn" data-p="${id}">Open Settings…</button>`)
            : `<button class="btn" data-p="${id}">${{ missing: id === 'helper' ? 'Add Helper…' : 'Allow…', approval: 'Review…', outdated: 'Update…' }[st]}</button>`;
          return row(`${icon(p.icon, 's')} ${esc(p.name)}`, `${esc(p.why)} Used by ${esc(p.usedBy)}.${id === 'helper' && st !== 'missing' ? ` <span class="mono small">${st === 'outdated' ? esc(OS.helperInstalled) + ' → ' + esc(OS.helperBundled) : st === 'unsupported' ? 'No verified charge control' : 'v' + esc(OS.helperBundled)}</span>` : ''}`, OS.perm.tag(id) + btn, `data-perm="${id}"`);
        }).join(''), 'OneShot checks again when you come back to it. ' + OS.ui.note('No polling unless a grant card is on screen')) +
        group('Clipboard history', OS.policy.sources.map((s) => row(`Keep copies from ${s === 'OneShot' ? 'OneShot itself' : s}`, s === 'Screenshot' ? 'Copy & Close and copied OCR text appear in history.' : s === 'OneShot' ? 'Copies from JSON Studio and the Format pill appear in history.' : `Copying in ${s} adds an item.`,
          `<button class="sw" role="switch" data-k="policy.${s}" aria-checked="${prefs['policy.' + s] !== false}" aria-label="Keep copies from ${s}"></button>`)).join('') +
          row(`${icon('i-lock', 's')} Vault`, 'Never kept. Copies are marked concealed so other clipboard apps skip them too.', '<span class="tag">Always excluded</span>') +
          row('Concealed and transient copies', 'Copies another app marks as concealed or transient, such as passwords, are never kept.', '<span class="tag">Always skipped</span>')) +
        group('Last copy', lw ? row(`${esc(lw.source)} · ${esc(lw.kind)}`, lw.concealed ? 'Marked concealed. Clipboard apps that respect markers don’t keep it.' : lw.source === 'Vault' ? '<span class="bad-t">Not marked concealed. Another clipboard app could keep this password.</span>' : 'Written without secrecy markers.',
          `<span class="types">${lw.types.map((t) => `<span class="tag ${t === CONCEALED || t === TRANSIENT ? 'ok' : ''} mono">${esc(t.replace('org.nspasteboard.', '').replace('public.', ''))}</span>`).join('')}</span>`) : row('Nothing copied yet', 'Copy something to see the types OneShot writes.', ''), OS.ui.note('PasteboardWriter is the only writer; origin type lets our watcher skip our own and Vault copies'));
      el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => (OS.perm.state(b.dataset.p) === 'granted' ? systemSettings(b.dataset.p) : OS.perm.request(b.dataset.p))));
      const rm = el.querySelector('[data-rm]'); if (rm) rm.onclick = () => dialog(`${appTile()}<h3>Remove the charge helper?</h3><p>Charging goes back to macOS control right away. You can add it again later.</p><div class="acts"><button class="btn" data-r="0">Keep</button><button class="btn danger" data-r="1">Remove</button></div>`).then((r) => r === '1' && OS.perm.set('helper', false));
    };
    draw(); bindPrefControls(el); OS.watch(el, 'perm prefs pasteboard scn', draw);
  }
  function paneHotkeys(el) {
    const draw = () => {
      el.innerHTML = OS.features.filter((f) => f.hotkeys.length).map((f) => group(`${icon(f.icon, 's')} ${esc(f.name)}`, f.hotkeys.map((k) => {
        const e = hkErr[k.full];
        const changed = OS.hotkey.label(k.full) !== k.default;
        return `<div class="prow ${e ? 'bad' : ''}" data-hkrow="${k.full}"><div class="pl"><div class="pt">${esc(k.label)}</div>
          ${e ? `<div class="err">${esc(hkMsg(e))}${e.err === 'conflict' ? ` <button class="lnk" data-hkshow="${e.owner.full}">Show</button>` : ''}</div>` : `<div class="fx">Works in any app${changed ? ` · default ${esc(k.default)}` : ''}.</div>`}</div>
          <div class="pc">${changed ? `<button class="btn tb" data-hkreset="${k.full}" title="Restore ${esc(k.default)}">${icon('i-undo', 's')}</button>` : ''}<button class="hk" data-hk="${k.full}">${kbd(OS.hotkey.label(k.full))}</button></div></div>`;
      }).join(''))).join('') + `<p class="pgf">Click a shortcut, then type the new one. Esc cancels. Shortcuts macOS or every app’s menus already use are refused. ${OS.ui.note('Carbon RegisterEventHotKey; reserved set from CopySymbolicHotKeys + menu equivalents')}</p>`;
      el.querySelectorAll('[data-hkreset]').forEach((b) => (b.onclick = () => OS.hotkey.reset(b.dataset.hkreset)));
      el.querySelectorAll('[data-hkshow]').forEach((b) => (b.onclick = () => { const r = el.querySelector(`[data-hkrow="${b.dataset.hkshow}"]`); r.scrollIntoView({ block: 'center' }); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }));
    };
    draw(); bindPrefControls(el); OS.watch(el, 'prefs', (k) => (!k || String(k).startsWith('hotkey.')) && draw());
  }
  const storeLine = (f) => {
    const i = OS.store.info(f.id), d = OS.data[f.id], n = f.store && f.store.count ? f.store.count(d) : null;
    return `${n != null ? `${n} ${esc(f.store.unit || 'items')}` : ''}${i ? `${n != null ? ' · ' : ''}${OS.bytes(i.bytes)} · saved ${OS.ago(i.at) === 'now' ? 'just now' : OS.ago(i.at) + ' ago'}` : ' · not saved yet'}`;
  };
  OS.store.line = storeLine;
  function paneStorage(el) {
    const draw = () => {
      el.innerHTML = group('On this Mac', OS.features.map((f) => row(`${icon(f.icon, 's')} ${esc(f.name)}`, `${f.store && f.store.rule ? esc(f.store.rule()) + '<br>' : ''}<span class="mono small">${esc(OS.store.path(f.id))}</span>`,
        `<span class="muted small" data-line="${f.id}">${storeLine(f)}</span><button class="btn" data-show="${f.id}">Show</button>`)).join(''),
      'Everything stays on this Mac. Changes are saved a moment after you make them and again when OneShot quits. ' + OS.ui.note('@MainActor store per feature → actor repository; coalesced writes; pruning at launch and on pref change')) +
        group('', row('Reset OneShot', 'Removes history, documents, presets and Vault entries on this Mac, and restores default settings.', '<button class="btn danger" data-reset>Reset…</button>'));
      el.querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => OS.open(b.dataset.show)));
      el.querySelector('[data-reset]').onclick = () => OS.system.confirm('Reset OneShot?', 'All OneShot data on this Mac is removed and settings go back to their defaults. This can’t be undone.', 'Reset', true).then((ok) => ok && OS.store.reset());
    };
    draw(); OS.watch(el, 'store change prefs', draw);
  }
  function paneFeature(el, f) {
    el.innerHTML = `<div class="phead"><div class="tile">${icon(f.icon, 'l')}</div><div><h2>${esc(f.name)}</h2><p>${esc(f.about || '')}</p></div><button class="btn" data-openf>Open ${esc(f.name)}</button></div>
      ${f.prefs.length ? group('Behavior', '<div data-fp></div>') : ''}
      ${f.hotkeys.length ? group('Shortcuts', '<div data-fh></div>') : ''}
      ${f.menubar ? group('Menu bar', `<div data-fm></div>`) : ''}
      ${group('Data', '<div data-fd></div>')}`;
    el.querySelector('[data-openf]').onclick = () => OS.open(f.id);
    const fp = el.querySelector('[data-fp]'); if (fp) OS.prefs.render(fp, f.id, { hotkeys: false });
    const fh = el.querySelector('[data-fh]'); if (fh) { const d = () => (fh.innerHTML = f.hotkeys.map((k) => row(esc(k.label), 'Change it in Hotkeys.', `${kbd(OS.hotkey.label(k.full))}<button class="btn" data-tohk>Edit…</button>`)).join('')); d(); bindPrefControls(fh); OS.watch(fh, 'prefs', d); }
    const fm = el.querySelector('[data-fm]'); if (fm) { const d = () => (fm.innerHTML = row(`Show in the menu bar`, esc(f.menubar.about || `The ${f.name} item in the menu bar.`), `<button class="sw" role="switch" data-k="menubar.${f.id}" aria-checked="${OS.pref('menubar.' + f.id) !== false}" aria-label="Show ${esc(f.name)} in the menu bar"></button>`)); d(); bindPrefControls(fm); OS.watch(fm, 'prefs', d); }
    const fd = el.querySelector('[data-fd]'); const dd = () => (fd.innerHTML = row(esc(f.store && f.store.rule ? f.store.rule() : 'Stored on this Mac'), `<span class="mono small">${esc(OS.store.path(f.id))}</span>`, `<span class="muted small">${storeLine(f)}</span>`)); dd(); OS.watch(fd, 'store change prefs', dd);
  }

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
      <div class="hwin" id="te"><div class="tb">${lights('')}${icon('i-note', 's')} Notes.txt — TextEdit</div><textarea spellcheck="false"></textarea></div>
      <div class="hwin" id="sf"><div class="tb">${lights('')}${icon('i-globe', 's')} Safari</div>
        <div class="tabs"></div><div class="url">${icon('i-lock', 's')}<span data-url></span></div><div class="page"></div></div>
      <div class="hwin" id="pw" hidden><div class="tb">${lights('')}${icon('i-history', 's')} Pasty — another clipboard app</div><div class="pw-list"></div></div>`;
    $$('#desk .lights i').forEach((i) => i.removeAttribute('data-close'));
    const ta = $('#desk #te textarea'); ta.value = TE_TEXT;
    ta.addEventListener('copy', (e) => { const s = OS.host.textedit.getSelection(); if (!s.text) return; e.preventDefault(); OS.pasteboard.copy({ kind: kindOf(s.text), text: s.text, source: 'TextEdit' }); });
    ta.addEventListener('cut', (e) => { const s = OS.host.textedit.getSelection(); if (!s.text) return; e.preventDefault(); OS.pasteboard.copy({ kind: kindOf(s.text), text: s.text, source: 'TextEdit' }); OS.host.textedit.replace(s.start, s.end, ''); });
    ta.addEventListener('paste', (e) => { e.preventDefault(); const p = OS.pasteboard.current; if (p && p.text) OS.host.textedit.insert(p.text); });
    ta.addEventListener('focus', () => OS.app.activate('TextEdit'));
    drawSafari(); drawWatcher();
  }
  /* another clipboard app that respects concealed/transient markers, the way nspasteboard.org asks */
  const seen = [];
  function drawWatcher() {
    const w = $('#pw'); if (!w) return;
    w.hidden = !OS.scn('pb.watcher'); if (w.hidden) { paintKey(); return; }
    w.querySelector('.pw-list').innerHTML = seen.length ? seen.slice(0, 7).map((s) => s.skipped
      ? `<div class="pw-row skip">${icon('i-lock', 's')}<span>Skipped a concealed copy from ${esc(s.source)}</span></div>`
      : `<div class="pw-row ${s.source === 'Vault' ? 'leak' : ''}">${icon(s.source === 'Vault' ? 'i-key' : 'i-text', 's')}<span>${s.source === 'Vault' ? 'Password from Vault, kept in plain text' : esc(s.text.replace(/\s+/g, ' ').slice(0, 48))}</span><em>${esc(s.source)}</em></div>`).join('')
      : '<div class="pw-row skip"><span>Waiting for copies…</span></div>';
    OS.front('#pw');
  }
  OS.on('pasteboard', (p) => { if (!OS.scn('pb.watcher')) return; seen.unshift({ skipped: p.types.includes(CONCEALED) || p.types.includes(TRANSIENT), source: p.source, text: p.text || '' }); drawWatcher(); });
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
    sf.querySelectorAll('[data-login]').forEach((i) => i.addEventListener('focus', () => { OS.app.activate('Safari'); OS.emit('host:loginFocus', { field: i.dataset.login, el: i, host: s.host }); }));
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
      const inner = h(`<div class="desk-snap" style="position:absolute;left:0;top:0;width:1440px;height:872px;transform-origin:0 0;transform:scale(${k}) translate(${-rect.x}px,${-(rect.y - 28)}px);pointer-events:none"></div>`);
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
    if (dlgDone) { if (e.key === 'Escape') { e.preventDefault(); const c = $('#dlg [data-r="cancel"],#dlg [data-r="0"],#dlg [data-r="done"],#dlg [data-r="ok"]'); dlgDone(c ? c.dataset.r : 'cancel'); } return; }
    if (openMenuId) { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); } return; }
    if (ovl) { if (ovl.onKey && ovl.onKey(e)) return e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); return OS.ui.overlay.close(); } return; } // no hotkeys while the transient editor is up
    if (flt) { if (flt.onKey && flt.onKey(e)) return e.preventDefault(); if (e.key === 'Escape') { e.preventDefault(); return OS.ui.closeFloat(); } }
    if (popFor && e.key === 'Escape') { e.preventDefault(); return closePop(); }
    const c = comboOf(e); const k = c && OS.hotkey.owner(c);
    if (k && (e.ctrlKey || e.altKey || e.metaKey)) { e.preventDefault(); return k.run(); }   // global hotkeys work in any app
    if (c && e.metaKey && menuKey(e, c)) e.preventDefault();                                  // menu key equivalents only while OneShot is active
  }, true);
  /* outside click: closes menus, floats and popovers (resign key) and does nothing else */
  document.addEventListener('mousedown', (e) => {
    if (openMenuId && !e.target.closest('#menu') && !e.target.closest('#mbL')) closeMenu();
    if (dlgDone || ovl) return;
    if (flt && !e.target.closest('#float')) OS.ui.closeFloat();
    if (popFor && !e.target.closest('#pop') && !e.target.closest('[data-mb]')) closePop();
  }, true);

  /* window z-order, key window and dragging; a click activates the window's app */
  let zOrder = ['#pw', '#te', '#sf', '#win', '#prefwin'];   // z 20..; always under the menu bar (60) and floats (80)
  OS.front = (sel) => { zOrder = zOrder.filter((x) => x !== sel).concat(sel); zOrder.forEach((x, i) => { const w = $(x); if (w) w.style.zIndex = 20 + i; }); paintKey(); };
  const frames = LS.get('frames') || {};
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('#float, #pop, #menu, #dlg, #overlay, #menubar')) return;
    const w = e.target.closest('.hwin, .win');
    if (!w) { if (e.target.closest('#desk')) OS.app.activate('Finder'); return; }
    OS.front('#' + w.id); OS.app.activate(APP_OF['#' + w.id]);
    const bar = e.target.closest('.drag, .hwin > .tb');
    if (!bar || e.target.closest('button, input, a, .lights, select, textarea')) return;
    const sx = e.clientX, sy = e.clientY, ox = w.offsetLeft, oy = w.offsetTop;
    const mv = (m) => { w.style.left = Math.max(-200, Math.min(1340, ox + m.clientX - sx)) + 'px'; w.style.top = Math.max(28, Math.min(860, oy + m.clientY - sy)) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); if (w.classList.contains('win')) { frames[w.id] = { left: w.style.left, top: w.style.top }; LS.set('frames', frames); } };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
  function bindClose(root) { root.querySelectorAll('[data-close]').forEach((x) => { if (x.dataset.close) x.onclick = (e) => { e.stopPropagation(); closeWin(x.dataset.close); }; }); }
  OS.host.textedit.front = () => { OS.front('#te'); };
  OS.host.safari.front = () => { OS.front('#sf'); };

  /* ---------- boot ---------- */
  OS.boot = (start) => {
    document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute"><defs>${window.ICONS}</defs></svg>`);
    $('#screen').innerHTML = `<div id="menubar"><div class="mb-l" id="mbL"></div><div class="mb-r" id="mbR"></div></div>
      <div id="desk"></div><div id="win" class="win" hidden><nav class="rail" id="rail"></nav><div id="main"></div></div><div id="prefwin" class="win" hidden></div>
      <div id="menu" hidden></div><div id="pop" hidden></div><div id="float" hidden></div><div id="overlay" hidden></div><div id="dim"></div><div id="warm"></div><div id="toasts"></div><div id="dlg" hidden></div>`;
    Object.entries(frames).forEach(([id, f]) => { const w = $('#' + id); if (w) Object.assign(w.style, f); });
    mountDesk(); refreshRail(); OS.menubar.refresh(); OS.front('#sf'); OS.front('#te');
    const rail = $('#rail'); rail.addEventListener('click', (e) => { const x = e.target.closest('[data-close]'); if (x) { e.stopPropagation(); closeWin('#win'); } });
    OS.on('prefs perm change scn', () => OS.menubar.refresh());
    setInterval(() => OS.menubar.refresh(), 15000);
    OS.features.forEach((f) => f.init && f.init());
    const q = new URLSearchParams(location.hash.slice(1));
    if (LS.get('notes') || q.get('notes')) setScn('notes', true);
    OS.app.activate('TextEdit');
    OS.emit('boot');
    if (q.get('open')) (q.get('open') === 'prefs' ? OS.openPrefs(q.get('section')) : OS.open(q.get('open')));
    else if (start) OS.open(start);
  };
})();
