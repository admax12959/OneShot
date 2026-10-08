/* Vault: Autofill (runtime) + Vault view. One source: OS.data.vault. Contract: SPEC.md */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;
  const D = () => OS.data.vault;
  const hostOf = (u) => String(u || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0].toLowerCase();
  const MASTER = 'oneshot';
  let quiet = false;              // refreshing the idle timer must not redraw anything
  let filling = false;            // our own fill() focuses the password field; don't reopen Autofill

  const touch = () => { quiet = true; try { OS.commit('vault', (d) => { d.unlockedAt = OS.now(); }); } finally { quiet = false; } };
  const lock = () => OS.commit('vault', (d) => { d.locked = true; });
  const unlock = () => OS.commit('vault', (d) => { d.locked = false; d.unlockedAt = OS.now(); });
  const lockMs = () => { const m = OS.pref('vault.lockAfter'); return m === 'never' ? Infinity : m * 60000; };
  const avatar = (t) => `<span class="vt-av">${esc((t || '?').trim().charAt(0).toUpperCase())}</span>`;

  /* ---------- the one locked / Touch ID / failed / password flow (float and view) ---------- */
  function authUI(el, o = {}) {
    let st = 'locked', err = '';
    const compact = !!o.compact;
    async function touchId() {
      const r = await OS.system.touchId('OneShot is trying to unlock Vault');
      if (r.ok) return unlock();
      st = r.reason === 'nomatch' ? 'failed' : 'locked'; draw();
    }
    let first = true;
    function draw() {
      if (!first && !el.isConnected) return;
      first = false;
      const useTouch = OS.pref('vault.touchId');
      if (st === 'failed' && useTouch) {
        return OS.ui.state(el, { kind: 'failure', compact, title: 'Touch ID didn’t match', body: 'Try again, or use your master password.', action: { label: 'Try again', run: touchId }, action2: { label: 'Use password', run: () => { st = 'password'; err = ''; draw(); } } });
      }
      if (st === 'password' || !useTouch) {
        el.innerHTML = `<div class="state locked ${compact ? 'compact' : ''}"><div class="k">Locked</div>${icon('i-lock', 'xl')}<h3>Enter your master password</h3>
          <p>${useTouch ? 'Use the password instead of Touch ID.' : 'Touch ID is off in Vault settings.'}</p>
          <input class="field vt-pw" type="password" placeholder="Master password" data-pw autocomplete="off"><div class="vt-err" data-err>${esc(err)}</div>
          <button class="btn primary" data-unlock>Unlock</button>${useTouch ? '<button class="btn ghost" data-usetouch>Use Touch ID</button>' : ''}</div>`;
        const pw = el.querySelector('[data-pw]');
        const go = () => { if (pw.value === MASTER) unlock(); else { err = 'Incorrect password. Try again.'; el.querySelector('[data-err]').textContent = err; pw.select(); } };
        el.querySelector('[data-unlock]').onclick = (e) => { e.stopPropagation(); go(); };
        pw.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
        const tb = el.querySelector('[data-usetouch]'); if (tb) tb.onclick = (e) => { e.stopPropagation(); st = 'locked'; draw(); };
        setTimeout(() => pw.focus(), 0);
        return;
      }
      OS.ui.state(el, { kind: 'locked', compact, title: 'Vault is locked', body: 'Unlock to fill logins and manage entries.', action: { label: 'Unlock with Touch ID', run: touchId } });
    }
    draw();
  }

  /* ---------- Autofill float ---------- */
  function openAutofill(field) {
    OS.host.safari.front();
    const host = OS.host.safari.host(), r = field.getBoundingClientRect();
    const el = h('<div class="vt-af"></div>');
    let idx = 0, rows = [];
    const header = () => `<div class="pop-h">${icon('i-key', 's')}Vault<span class="muted">${esc(host)}</span></div>`;
    const fill = (e) => {
      filling = true; const ok = OS.host.safari.fill(e.username, e.password); filling = false;
      touch(); OS.ui.closeFloat();
      if (ok) OS.ui.toast('Filled · not added to Clipboard history', { icon: 'i-key', sub: e.title });
    };
    function draw() {
      if (!OS.perm.has('access')) { el.innerHTML = '<div data-g></div>'; rows = []; return OS.ui.grant(el.querySelector('[data-g]'), 'access', 'Autofill needs to type into the login fields of other apps.'); }
      if (OS.scn('vault.fail')) { el.innerHTML = header() + '<div data-a></div>'; rows = []; return OS.ui.state(el.querySelector('[data-a]'), { kind: 'failure', compact: true, title: 'Couldn’t load Vault', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => { if (OS.scn('vault.fail')) OS.ui.toast('Still can’t reach the store', { icon: 'i-key', ms: 2000 }); else draw(); } } }); }
      if (D().locked) { el.innerHTML = header() + '<div data-a></div>'; rows = []; return authUI(el.querySelector('[data-a]'), { compact: true }); }
      touch();
      rows = D().entries.filter((e) => hostOf(e.url) === host);
      if (!rows.length) {
        el.innerHTML = header() + '<div data-a></div>';
        return OS.ui.state(el.querySelector('[data-a]'), { kind: 'empty', compact: true, title: `No login for ${host}`, body: 'Add one to Vault and it is offered here next time.', action: { label: 'Add to Vault', run: () => OS.open('vault', { create: { url: host } }) } });
      }
      idx = Math.min(idx, rows.length - 1);
      el.innerHTML = header() + rows.map((e, i) => `<div class="row vt-row ${i === idx ? 'sel' : ''}" data-i="${i}">${avatar(e.title)}<div class="t"><b>${esc(e.title)}</b><div class="m">${esc(e.username)}</div></div>
        <button class="btn ghost" data-v="${e.id}" title="Open in Vault">Open in Vault</button></div>`).join('') +
        '<div class="pop-f"><span class="muted vt-hint"><span class="kbd">↑↓</span> choose <span class="kbd">↵</span> fill <span class="kbd">Esc</span> close</span></div>';
      el.querySelectorAll('[data-i]').forEach((row) => (row.onclick = () => fill(rows[+row.dataset.i])));
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); OS.open('vault', { select: b.dataset.v }); }));
    }
    draw();
    OS.ui.float({
      x: r.left, y: r.bottom + 4, above: r.top, el, cls: 'vt-float',
      onKey: (e) => {
        if (!rows.length) return false;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { idx = (idx + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length; draw(); return true; }
        if (e.key === 'Enter') { fill(rows[idx]); return true; }
        return false;
      },
    });
    OS.watch(el, 'change:vault prefs perm', () => { if (!quiet) draw(); });
    OS.watch(el, 'scn', (k) => { if (k === 'vault.fail') draw(); });
  }
  function autofillHotkey() {
    OS.host.safari.front();
    const a = document.activeElement, f = a && a.dataset && a.dataset.login ? a : OS.host.safari.fields().user;
    if (!f) return OS.ui.toast('No login field on this page', { icon: 'i-key', ms: 2500 });
    openAutofill(f);
  }

  /* "Fill now" after saving from Autofill's "Add to Vault": front Safari and fill the login there */
  function fillNow(id, url) {
    const e = D().entries.find((x) => x.id === id); if (!e) return;
    OS.host.safari.front();
    if (hostOf(OS.host.safari.host()) !== url) return OS.ui.toast(`Open ${url} in Safari to fill`, { icon: 'i-key', ms: 3000 });
    filling = true; const ok = OS.host.safari.fill(e.username, e.password); filling = false;
    touch();
    if (ok) OS.ui.toast('Filled · not added to Clipboard history', { icon: 'i-key', sub: e.title });
  }

  /* ---------- Vault view ---------- */
  function vaultView(el, params) {
    let sel = null, draft = null, q = '', reveal = false, dirty = false, mode = null, pending = params || {};
    let body, cd;
    const byId = (id) => D().entries.find((e) => e.id === id);
    const shown = () => D().entries.filter((e) => !q || (e.title + ' ' + e.url + ' ' + e.username).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title));
    const newDraft = (url, fromAutofill) => { draft = { title: fromAutofill ? url : '', url: url || '', username: '', password: '', note: '', fromAutofill: !!fromAutofill }; sel = null; dirty = false; reveal = false; };

    function cdText() {
      if (lockMs() === Infinity) return 'Never auto-locks';
      const s = Math.max(0, Math.ceil((lockMs() - (OS.now() - D().unlockedAt)) / 1000));
      return `Locks in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function render() {
      if (D().locked) { mode = 'locked'; return authUI(el); }
      mode = 'open';
      if (pending.create) { newDraft(pending.create.url, true); } else if (pending.select && byId(pending.select)) { sel = pending.select; draft = null; }
      pending = {};
      if (!sel && !draft && D().entries.length) sel = shown()[0] ? shown()[0].id : D().entries[0].id;
      el.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search logins" data-q style="width:220px" value="${esc(q)}">
        <button class="btn" data-new>${icon('i-plus', 's')}New</button><span class="grow"></span><span class="muted vt-cd" data-cd></span>
        <button class="btn" data-lock>${icon('i-lock', 's')}Lock now</button></div><div class="split" data-body></div>`;
      body = el.querySelector('[data-body]'); cd = el.querySelector('[data-cd]'); cd.textContent = cdText();
      el.querySelector('[data-q]').oninput = (e) => { q = e.target.value; drawList(); };
      el.onkeydown = (e) => {
        if (mode !== 'open' || draft || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const v = shown();
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && v.length) {
          e.preventDefault();
          const i = v.findIndex((x) => x.id === sel), n = Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
          sel = v[n].id; dirty = false; reveal = false; touch(); drawList(); drawDetail();
          const l = body.querySelector('.vt-list'); if (l) l.focus({ preventScroll: true });
        } else if (e.key === 'Enter' && !e.target.closest('button') && byId(sel)) { e.preventDefault(); const t = body.querySelector('[data-f=title]'); if (t) t.focus(); }
      };
      el.querySelector('[data-new]').onclick = () => { newDraft(''); touch(); drawBody(); };
      el.querySelector('[data-lock]').onclick = lock;
      drawBody();
    }
    function drawBody() {
      if (!D().entries.length && !draft) {
        return OS.ui.state(body, { kind: 'empty', title: 'No logins yet', body: 'Add a login and Autofill offers it on that site.', action: { label: 'New entry', run: () => { newDraft(''); drawBody(); } } });
      }
      body.innerHTML = '<div class="list vt-list" tabindex="0" aria-label="Logins"></div><div class="detail vt-detail"></div>';
      drawList(); drawDetail();
      if (!draft) body.querySelector('.vt-list').focus({ preventScroll: true });
    }
    function drawList() {
      const list = body.querySelector('.vt-list'); if (!list) return;
      const v = shown();
      list.innerHTML = (draft ? `<div class="row sel">${avatar(draft.title || '+')}<div class="t"><b>${esc(draft.title || 'New entry')}</b><div class="m">${esc(draft.url || 'Not saved yet')}</div></div></div>` : '') +
        v.map((e) => `<div class="row ${e.id === sel && !draft ? 'sel' : ''}" data-id="${e.id}">${avatar(e.title)}<div class="t"><b>${esc(e.title)}</b><div class="m">${esc(e.url)} · ${esc(e.username)}</div></div></div>`).join('') +
        (!v.length && !draft ? '<div class="muted" style="padding:16px">No logins match.</div>' : '');
      list.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => { sel = r.dataset.id; draft = null; dirty = false; reveal = false; touch(); drawList(); drawDetail(); }));
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function drawDetail() {
      const pane = body.querySelector('.vt-detail'); if (!pane) return;
      const e = draft || byId(sel);
      if (!e) { pane.innerHTML = '<div class="muted">Select a login.</div>'; return; }
      const isNew = !!draft;
      pane.innerHTML = `<div class="vt-form"><div class="vt-fh">${avatar(e.title || '+')}<h2>${esc(e.title || 'New entry')}</h2></div>
        <label>Title<input class="field" data-f="title" value="${esc(e.title)}" placeholder="Site name"></label>
        <label>Website<input class="field" data-f="url" value="${esc(e.url)}" placeholder="site.com"></label>
        <label>Username<div class="vt-in"><input class="field" data-f="username" value="${esc(e.username)}" autocomplete="off"><button class="btn" data-cp="username" title="Copy username">${icon('i-copy', 's')}Copy</button></div></label>
        <label>Password<div class="vt-in"><input class="field" data-f="password" type="${reveal ? 'text' : 'password'}" value="${esc(e.password)}" autocomplete="off">
          <button class="btn icon" data-eye title="${reveal ? 'Hide' : 'Show'} password">${icon('i-eye', 's')}</button><button class="btn" data-cp="password" title="Copy password">${icon('i-copy', 's')}Copy</button></div></label>
        <label>Note<textarea class="field" data-f="note" rows="3">${esc(e.note)}</textarea></label>
        <div class="vt-err" data-err></div>
        <div class="vt-acts"><button class="btn primary" data-save ${isNew ? '' : 'disabled'}>${isNew ? 'Add entry' : 'Save'}</button>${isNew ? '<button class="btn" data-cancel>Cancel</button>' : ''}<span class="grow"></span>${isNew ? '' : '<button class="btn danger" data-del>' + icon('i-trash', 's') + 'Delete</button>'}</div>
        ${isNew ? '' : `<div class="muted vt-up">Updated ${OS.ago(e.at) === 'now' ? 'just now' : OS.ago(e.at) + ' ago'}</div>`}</div>`;
      const val = (k) => pane.querySelector(`[data-f=${k}]`).value;
      const save = pane.querySelector('[data-save]');
      pane.querySelectorAll('[data-f]').forEach((i) => (i.oninput = () => { dirty = true; save.disabled = false; }));
      pane.querySelector('[data-eye]').onclick = () => { reveal = !reveal; const p = pane.querySelector('[data-f=password]'); p.type = reveal ? 'text' : 'password'; pane.querySelector('[data-eye]').title = (reveal ? 'Hide' : 'Show') + ' password'; };
      pane.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => {
        const k = b.dataset.cp, r = OS.pasteboard.copy({ kind: 'text', text: val(k), source: 'Vault' }); touch();
        OS.ui.toast(r.recorded ? 'Copied' : 'Copied · not added to Clipboard history', { icon: 'i-key', sub: k === 'password' ? 'Password' : 'Username', ms: 3000 });
      }));
      save.onclick = () => {
        const url = hostOf(val('url')), title = val('title').trim() || url;
        if (!title) return (pane.querySelector('[data-err]').textContent = 'Add a title or a website.');
        const patch = { title, url, username: val('username'), password: val('password'), note: val('note'), at: OS.now() };
        dirty = false;
        if (isNew) {
          const id = OS.id('v'), fromAf = e.fromAutofill; OS.commit('vault', (d) => d.entries.unshift(Object.assign({ id }, patch))); draft = null; sel = id; q = ''; el.querySelector('[data-q]').value = ''; drawBody();
          if (fromAf && url && hostOf(OS.host.safari.host()) === url) {
            OS.ui.toast(`Saved · Fill on ${url}`, { icon: 'i-key', sub: title, ms: 6000, action: { label: 'Fill now', run: () => fillNow(id, url) } });
          } else OS.ui.toast('Added to Vault', { icon: 'i-key', sub: title, ms: 2500 });
        }
        else { OS.commit('vault', () => Object.assign(byId(sel), patch)); drawList(); drawDetail(); OS.ui.toast('Saved', { icon: 'i-key', sub: title, ms: 2000 }); }
        touch();
      };
      const cancel = pane.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => { draft = null; dirty = false; sel = D().entries.length ? shown()[0].id : null; drawBody(); };
      const del = pane.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        if (!(await OS.system.confirm(`Delete “${e.title}”?`, 'This login is removed from Vault and Autofill.', 'Delete', true))) return;
        const v = shown(), i = v.findIndex((x) => x.id === e.id);
        OS.commit('vault', (d) => (d.entries = d.entries.filter((x) => x.id !== e.id)));
        const w = shown(); sel = w.length ? w[Math.min(i, w.length - 1)].id : null; dirty = false; drawBody(); touch();
      };
    }
    OS.watch(el, 'change:vault prefs', (p, n) => {
      if (quiet) return;
      if (D().locked !== (mode === 'locked')) return render();
      if (mode === 'locked') { if (n === 'prefs') render(); return; }
      if (cd) cd.textContent = cdText();
      if (!body || !body.isConnected) return render();
      if (sel && !byId(sel) && !draft) { sel = null; return render(); }
      if (!D().entries.length && !draft) return drawBody();
      if (!body.querySelector('.vt-list')) return drawBody();
      drawList(); if (!dirty && !draft) drawDetail();
    });
    OS.watch(el, 'tick', () => { if (mode === 'open' && cd) cd.textContent = cdText(); });
    render();
  }

  OS.feature({
    id: 'vault', name: 'Vault', icon: 'i-key',
    seed: () => {
      const now = Date.now(), d = 86400e3;
      return {
        locked: true, unlockedAt: 0,
        entries: [
          { id: 'v-gh-personal', title: 'GitHub (personal)', url: 'github.com', username: 'maya.chen', password: 'hX7!pq2-Lm9v', note: 'Personal account', at: now - 9 * d },
          { id: 'v-gh-work', title: 'GitHub (work)', url: 'github.com', username: 'maya@acme.io', password: 'Qr4#tz81-wKe', note: 'Acme organization, SSO', at: now - 3 * d },
          { id: 'v-figma', title: 'Figma', url: 'figma.com', username: 'maya@acme.io', password: 'fG9$mm20-aPo', note: '', at: now - 21 * d },
          { id: 'v-notion', title: 'Notion', url: 'notion.so', username: 'maya.chen', password: 'nT5&vb77-xCd', note: 'Team wiki', at: now - 14 * d },
          { id: 'v-billing', title: 'Acme Billing', url: 'billing.acme.io', username: 'finance@acme.io', password: 'bL2^sa63-yUq', note: 'Shared finance login', at: now - 40 * d },
          { id: 'v-linear', title: 'Linear', url: 'linear.app', username: 'maya@acme.io', password: 'lN8*kr45-zWt', note: '', at: now - 6 * d },
        ],
      };
    },
    empty: () => ({ locked: true, unlockedAt: 0, entries: [] }),
    prefs: [
      { key: 'lockAfter', label: 'Lock after', type: 'select', options: [[1, '1 min'], [5, '5 min'], [15, '15 min'], ['never', 'Never']], default: 5, effect: 'Vault locks itself after this long without use; Autofill then asks to unlock again.' },
      { key: 'touchId', label: 'Unlock with Touch ID', type: 'toggle', default: true, effect: 'On: unlocking asks for Touch ID. Off: unlocking asks for the master password.' },
      { key: 'showOnFocus', label: 'Show Autofill when a login field is focused', type: 'toggle', default: true, effect: 'On: clicking a login field opens Autofill under it. Off: only the hotkey opens it.', needs: 'access' },
    ],
    hotkeys: [{ id: 'autofill', label: 'Open Autofill', default: '⌃⌥P', run: autofillHotkey }],
    scenarios: [{ key: 'touchFail', label: 'Touch ID: next touch doesn’t match' }],
    init() {
      OS.on('tick', () => { const d = D(); if (d.locked) return; if (OS.now() - d.unlockedAt >= lockMs()) lock(); });
      OS.on('host:loginFocus', (p) => { if (filling || !OS.pref('vault.showOnFocus')) return; openAutofill(p.el); });
    },
    view: { title: 'Vault', mount: (el, params) => OS.ui.load(el, 'vault', (e) => vaultView(e, params || {})) },
  });
})();
