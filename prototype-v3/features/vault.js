/* Vault: Autofill (runtime) + Vault view. One source: OS.data.vault. Contract: SPEC.md (G2, G3).
   No app password: unlocking is device-owner authentication (Touch ID, the Mac login password as the system fallback).
   Secrets are never drawn: no reveal, a fixed-length mask, write-only password changes. Copies go out concealed. */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;
  const D = () => OS.data.vault;
  const hostOf = (u) => String(u || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/^www\./i, '').split(/[\/?#]/)[0].toLowerCase();
  const MASK = '••••••••••••';    // same length for every password: the real length is never shown
  const BLOCKER = 'Release blocker: secrets live in Keychain (SecAccessControl .biometryCurrentSet / .userPresence) + LAContext; this simulation keeps them in the store';
  let quiet = false;              // refreshing the idle timer must not redraw anything
  let filling = false;            // our own fill() focuses the password field; don't reopen Autofill
  let method = null;              // how the current unlock happened: 'biometry' | 'password'

  const touch = () => { quiet = true; try { OS.commit('vault', (d) => { d.unlockedAt = OS.now(); }); } finally { quiet = false; } };
  const lock = () => { method = null; OS.commit('vault', (d) => { d.locked = true; d.unlockedAt = 0; }); };
  const unlock = (m) => { method = m; OS.commit('vault', (d) => { d.locked = false; d.unlockedAt = OS.now(); }); };
  const lockMin = () => OS.pref('vault.lockAfter');
  const lockMs = () => (lockMin() === 'never' ? Infinity : lockMin() * 60000);
  const lockLine = () => (lockMin() === 'never' ? 'Stays unlocked until you lock it or quit' : `Locks after ${lockMin()} min without use and at quit`);
  const avatar = (t) => `<span class="vt-av">${esc((t || '?').trim().charAt(0).toUpperCase())}</span>`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  /* ---------- device-owner authentication: one flow for the float and the view ---------- */
  const REASON = 'OneShot is trying to unlock Vault.';
  function authenticate(reason, usePassword) {
    return OS.system.authenticate(reason, usePassword ? { fallback: 'password' } : {});
  }
  function authUI(el, o = {}) {
    let st = 'locked';
    const compact = !!o.compact;
    async function go(usePassword) {
      st = 'prompt'; draw();
      const r = await authenticate(REASON, usePassword);
      if (r.ok) return unlock(r.method);
      st = r.reason === 'nomatch' ? 'failed' : 'locked'; draw();
    }
    let first = true;
    function draw() {
      if (!first && !el.isConnected) return;
      first = false;
      if (st === 'prompt') return OS.ui.state(el, { kind: 'locked', compact, icon: 'i-finger', title: 'Waiting for Touch ID…', body: 'Touch the sensor, or choose Use Password in the dialog.' });
      if (st === 'failed') {
        return OS.ui.state(el, { kind: 'failure', compact, icon: 'i-finger', title: 'Touch ID didn’t match', body: compact ? 'Try again or use your login password.' : 'Try again, or use the password you use to log in to this Mac.',
          action: { label: 'Try Again', run: () => go(false) }, action2: { label: 'Use Password…', run: () => go(true) }, note: compact ? '' : 'LAError.authenticationFailed → stay locked; fallback = device-owner password' });
      }
      OS.ui.state(el, { kind: 'locked', compact, title: 'Vault is locked', body: compact ? 'Unlock to fill this login.' : 'Unlock with Touch ID or your Mac login password to fill and manage logins.',
        action: { label: 'Unlock', run: () => go(false) }, detail: compact ? '' : lockLine(), note: compact ? '' : BLOCKER });
    }
    draw();
  }

  /* ---------- copying: always through the PasteboardWriter, and the writer's result is checked ---------- */
  function copySecret(e, k) {
    const r = OS.pasteboard.copy({ kind: 'text', text: e[k], source: 'Vault' });
    touch();
    if (r.concealed) {
      OS.ui.toast('Copied · concealed', { kind: 'concealed', icon: 'i-lock', sub: 'Not kept in Clipboard history. Clipboard apps that respect markers skip it.', note: 'org.nspasteboard.ConcealedType + TransientType stamped and read back', ms: 4000 });
    } else {
      OS.ui.toast('Copied without the concealed marker', { kind: 'failure', sub: `OneShot checked its own copy and the ${k === 'password' ? 'password' : 'username'} went out unmarked. Other clipboard apps may keep it.`,
        note: `PasteboardWriter verifies its own write → ConcealedType missing (${r.types.join(', ')})`, ms: 8000 });
    }
    return r;
  }
  async function fillEntry(e) {
    const host = OS.host.safari.host();
    if (OS.pref('vault.confirmFill')) {
      const r = await OS.system.authenticate(`OneShot is trying to fill your login for ${host}.`);
      if (!r.ok) { if (r.reason === 'nomatch') OS.ui.toast('Not filled', { kind: 'failure', sub: 'Touch ID didn’t match. Nothing was typed.' }); return false; }
    }
    filling = true; const ok = OS.host.safari.fill(e.username, e.password); filling = false;
    touch();
    if (ok) OS.ui.toast('Filled · nothing copied', { icon: 'i-key', sub: `${e.title}. Typed into the page; not added to Clipboard history.`, note: 'Typed through Accessibility; no pasteboard write' });
    return ok;
  }

  /* ---------- Autofill float (non-activating; Safari stays frontmost) ---------- */
  function openAutofill(field) {
    OS.host.safari.front();
    const host = OS.host.safari.host(), r = field.getBoundingClientRect();
    const el = h('<div class="vt-af"></div>');
    let idx = 0, rows = [];
    const header = () => `<div class="pop-h">${icon('i-key', 's')}Vault<span class="muted">${esc(host)}</span></div>`;
    const fill = (e) => { OS.ui.closeFloat(); fillEntry(e); };
    function draw() {
      if (!OS.perm.has('access')) { el.innerHTML = '<div data-g></div>'; rows = []; return OS.ui.grant(el.querySelector('[data-g]'), 'access', 'Autofill needs to type into the login fields of other apps.'); }
      if (OS.scn('vault.fail')) { el.innerHTML = header() + '<div data-a></div>'; rows = []; return OS.ui.state(el.querySelector('[data-a]'), { kind: 'failure', compact: true, title: 'Couldn’t load Vault', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try Again', run: () => { if (OS.scn('vault.fail')) OS.ui.toast('Still can’t reach the store', { kind: 'failure', icon: 'i-key', ms: 2000 }); else draw(); } } }); }
      if (D().locked) { el.innerHTML = header() + '<div data-a></div>'; rows = []; return authUI(el.querySelector('[data-a]'), { compact: true }); }
      rows = D().entries.filter((e) => hostOf(e.url) === host);
      if (!rows.length) {
        el.innerHTML = header() + '<div data-a></div>';
        return OS.ui.state(el.querySelector('[data-a]'), { kind: 'empty', compact: true, icon: 'i-key', title: `No login for ${host}`, body: 'Add one to Vault and it’s offered here next time.', action: { label: 'Add to Vault…', run: () => OS.open('vault', { create: { url: host } }) } });
      }
      idx = Math.min(idx, rows.length - 1);
      el.innerHTML = header() + `<div class="vt-afl">${rows.map((e, i) => `<div class="vt-row ${i === idx ? 'sel' : ''}" data-i="${i}">${avatar(e.title)}<div class="t"><b>${esc(e.title)}</b><div class="m">${esc(e.username)}</div></div>
        <button class="btn ghost vt-open" data-v="${e.id}" title="Open in Vault">${icon('i-chevr', 's')}</button></div>`).join('')}</div>` +
        `<div class="vt-aff"><span><span class="kbd">↑↓</span> choose</span><span><span class="kbd">↵</span> fill</span><span><span class="kbd">esc</span> close</span><span class="grow"></span><span class="muted">Nothing is copied</span></div>`;
      el.querySelectorAll('[data-i]').forEach((row) => {
        row.onclick = () => fill(rows[+row.dataset.i]);
        row.onmouseenter = () => { idx = +row.dataset.i; el.querySelectorAll('.vt-row').forEach((o) => o.classList.toggle('sel', o === row)); };
      });
      el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); OS.open('vault', { select: b.dataset.v }); }));
    }
    draw();
    if (!D().locked) touch();
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
    fillEntry(e);
  }

  /* ---------- Vault view ---------- */
  function vaultView(el, params) {
    let sel = null, draft = null, q = '', dirty = false, changing = false, mode = null, pending = params || {};
    let body, cd;
    const byId = (id) => D().entries.find((e) => e.id === id);
    const shown = () => D().entries.filter((e) => !q || (e.title + ' ' + e.url + ' ' + e.username).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title));
    const current = () => (!draft && sel && byId(sel)) || null;
    const newDraft = (url, fromAutofill) => { draft = { title: fromAutofill ? url : '', url: url || '', username: '', note: '', fromAutofill: !!fromAutofill }; sel = null; dirty = false; changing = false; };
    const startNew = () => { if (D().locked) return; newDraft(''); touch(); drawBody(); const t = body.querySelector('[data-f=title]'); if (t) t.focus(); };

    /* window toolbar: New Login (icon) lives next to the Preferences button */
    const tools = OS.ui.toolbarTools();
    let newBtn = tools && tools.querySelector('[data-new]');
    if (tools && !newBtn) { newBtn = h(`<button class="btn tb" data-new title="New Login (⌘N)" aria-label="New Login">${icon('i-plus')}</button>`); tools.insertBefore(newBtn, tools.firstChild); }
    if (newBtn) newBtn.onclick = startNew;

    function cdText() {
      if (lockMs() === Infinity) return 'Doesn’t lock on its own';
      const s = Math.max(0, Math.ceil((lockMs() - (OS.now() - D().unlockedAt)) / 1000));
      return `Locks in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    function subtitle() { OS.ui.subtitle(D().locked ? 'Locked' : `${plural(D().entries.length, 'login')} · unlocked`); }
    function render() {
      subtitle();
      if (newBtn) newBtn.disabled = !!D().locked;
      if (D().locked) { mode = 'locked'; body = cd = null; el.innerHTML = '<div class="vt-lock"></div>'; return authUI(el.firstChild); }
      mode = 'open';
      if (pending.create) { newDraft(pending.create.url, true); } else if (pending.select && byId(pending.select)) { sel = pending.select; draft = null; }
      pending = {};
      if (!sel && !draft && D().entries.length) sel = shown()[0] ? shown()[0].id : D().entries[0].id;
      el.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search" aria-label="Search logins" data-q style="width:220px" value="${esc(q)}">
        <span class="grow"></span><span class="muted vt-cd" data-cd title="${esc(lockLine())}"></span>
        <button class="btn" data-lock title="Lock Vault now">${icon('i-lock', 's')}Lock</button></div><div class="split" data-body></div>
        <div class="vt-foot"><span>${icon('i-lock', 's')} Passwords are stored in your keychain</span><span class="muted">· unlocked with ${method === 'password' ? 'your login password' : 'Touch ID'}</span><span class="grow"></span>${OS.ui.note(BLOCKER)}</div>`;
      body = el.querySelector('[data-body]'); cd = el.querySelector('[data-cd]'); cd.textContent = cdText();
      el.querySelector('[data-q]').oninput = (e) => { q = e.target.value; drawList(); };
      el.onkeydown = (e) => {
        if (mode !== 'open' || draft || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const v = shown();
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && v.length) {
          e.preventDefault();
          const i = v.findIndex((x) => x.id === sel), n = Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
          sel = v[n].id; dirty = false; changing = false; touch(); drawList(); drawDetail();
          const l = body.querySelector('.vt-list'); if (l) l.focus({ preventScroll: true });
        } else if (e.key === 'Enter' && !e.target.closest('button') && byId(sel)) { e.preventDefault(); const t = body.querySelector('[data-f=title]'); if (t) t.focus(); }
      };
      el.querySelector('[data-lock]').onclick = lock;
      drawBody();
    }
    function drawBody() {
      if (!D().entries.length && !draft) {
        return OS.ui.state(body, { kind: 'empty', icon: 'i-key', title: 'No logins yet', body: 'Add a login and Autofill offers it on that site.', detail: 'Passwords are stored in your keychain', action: { label: 'New Login', run: startNew } });
      }
      body.innerHTML = '<div class="list vt-list" tabindex="0" aria-label="Logins"></div><div class="detail vt-detail"></div>';
      drawList(); drawDetail();
      if (!draft) body.querySelector('.vt-list').focus({ preventScroll: true });
    }
    function drawList() {
      const list = body && body.querySelector('.vt-list'); if (!list) return;
      const v = shown();
      if (!v.length && !draft) {
        return OS.ui.state(list, { kind: 'nomatch', compact: true, title: `No logins match “${q.trim()}”`, body: 'Search looks in titles, websites and usernames.', action: { label: 'Clear Search', run: () => { q = ''; el.querySelector('[data-q]').value = ''; drawList(); drawDetail(); } } });
      }
      if (!draft && !v.some((e) => e.id === sel)) { sel = v[0].id; drawDetail(); }
      list.innerHTML = (draft ? `<div class="row vt-lr sel">${avatar(draft.title || '+')}<div class="t"><b>${esc(draft.title || 'New Login')}</b><div class="m">${esc(draft.url || 'Not saved yet')}</div></div></div>` : '') +
        v.map((e) => `<div class="row vt-lr ${e.id === sel && !draft ? 'sel' : ''}" data-id="${e.id}">${avatar(e.title)}<div class="t"><b>${esc(e.title)}</b><div class="m">${esc(e.username)} · ${esc(e.url)}</div></div></div>`).join('');
      list.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => { sel = r.dataset.id; draft = null; dirty = false; changing = false; touch(); drawList(); drawDetail(); }));
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function drawDetail() {
      const pane = body && body.querySelector('.vt-detail'); if (!pane) return;
      const e = draft || byId(sel);
      if (!e) { OS.ui.state(pane, { kind: 'empty', compact: true, title: 'No login selected', body: 'Pick a login to see it here.' }); return; }
      const isNew = !!draft;
      /* the password row never carries the secret: a fixed mask, or an empty write-only field */
      const pwRow = isNew
        ? `<input class="field" data-f="password" type="password" placeholder="Password" autocomplete="new-password">`
        : changing
          ? `<input class="field" data-f="password" type="password" placeholder="New password" autocomplete="new-password"><button class="btn" data-pwcancel>Cancel</button>`
          : `<span class="vt-mask" aria-label="Password, hidden">${MASK}</span><button class="btn" data-cp="password" title="Copy password (concealed)">${icon('i-copy', 's')}Copy</button><button class="btn" data-change>Change Password…</button>`;
      pane.innerHTML = `<div class="vt-form"><div class="vt-fh">${avatar(e.title || '+')}<div><h2>${esc(e.title || 'New Login')}</h2><div class="muted small">${isNew ? (e.fromAutofill ? 'From Autofill · website filled in' : 'Not saved yet') : `Updated ${OS.ago(e.at) === 'now' ? 'just now' : OS.ago(e.at) + ' ago'}`}</div></div></div>
        <div class="vt-grid">
          <label for="vt-title">Title</label><input id="vt-title" class="field" data-f="title" value="${esc(e.title)}" placeholder="Site name">
          <label for="vt-url">Website</label><input id="vt-url" class="field" data-f="url" value="${esc(e.url)}" placeholder="site.com">
          <label for="vt-user">Username</label><div class="vt-in"><input id="vt-user" class="field" data-f="username" value="${esc(e.username)}" autocomplete="off">${isNew ? '' : `<button class="btn" data-cp="username" title="Copy username (concealed)">${icon('i-copy', 's')}Copy</button>`}</div>
          <label>Password</label><div class="vt-in">${pwRow}</div>
          <span></span><div class="vt-hint">${isNew || changing ? 'Write-only. OneShot never shows a saved password.' : 'Hidden. Copy goes out concealed; Autofill types it without copying.'}${OS.ui.note(BLOCKER)}</div>
          <label for="vt-note">Note</label><textarea id="vt-note" class="field" data-f="note" rows="3">${esc(e.note)}</textarea>
        </div>
        <div class="vt-err" data-err></div>
        <div class="vt-acts"><span class="grow"></span>${isNew ? '<button class="btn" data-cancel>Cancel</button>' : '<button class="btn" data-del>' + icon('i-trash', 's') + 'Delete…</button>'}<button class="btn primary" data-save ${isNew || changing ? '' : 'disabled'}>${isNew ? 'Add Login' : 'Save'}</button></div></div>`;
      const val = (k) => { const n = pane.querySelector(`[data-f=${k}]`); return n ? n.value : ''; };
      const save = pane.querySelector('[data-save]');
      pane.querySelectorAll('[data-f]').forEach((i) => (i.oninput = () => { dirty = true; save.disabled = false; }));
      pane.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => copySecret(byId(sel), b.dataset.cp)));
      const ch = pane.querySelector('[data-change]'); if (ch) ch.onclick = () => { changing = true; touch(); drawDetail(); pane.querySelector('[data-f=password]').focus(); };
      const pc = pane.querySelector('[data-pwcancel]'); if (pc) pc.onclick = () => { changing = false; drawDetail(); };
      save.onclick = () => {
        const url = hostOf(val('url')), title = val('title').trim() || url;
        if (!title) return (pane.querySelector('[data-err]').textContent = 'Add a title or a website.');
        const pw = val('password');
        if (changing && !pw) return (pane.querySelector('[data-err]').textContent = 'Type the new password, or Cancel.');
        const patch = { title, url, username: val('username'), note: val('note'), at: OS.now() };
        if (isNew || pw) patch.password = pw;
        const pwChanged = !isNew && !!pw;
        dirty = false; changing = false;
        if (isNew) {
          const id = OS.id('v'), fromAf = e.fromAutofill; OS.commit('vault', (d) => d.entries.unshift(Object.assign({ id }, patch))); draft = null; sel = id; q = ''; el.querySelector('[data-q]').value = ''; drawBody();
          if (fromAf && url && hostOf(OS.host.safari.host()) === url) {
            OS.ui.toast(`Saved · Fill on ${url}`, { icon: 'i-key', sub: title, ms: 6000, action: { label: 'Fill Now', run: () => fillNow(id, url) } });
          } else OS.ui.toast('Added to Vault', { icon: 'i-key', sub: title, ms: 2500 });
        } else { OS.commit('vault', () => Object.assign(byId(sel), patch)); drawList(); drawDetail(); OS.ui.toast(pwChanged ? 'Password changed' : 'Saved', { icon: 'i-key', sub: title, ms: 2000 }); }
        touch();
      };
      const cancel = pane.querySelector('[data-cancel]');
      if (cancel) cancel.onclick = () => { draft = null; dirty = false; sel = D().entries.length ? (shown()[0] || D().entries[0]).id : null; drawBody(); };
      const del = pane.querySelector('[data-del]'); if (del) del.onclick = () => deleteEntry(e);
    }
    async function deleteEntry(e) {
      if (!e) return;
      if (!(await OS.system.confirm(`Delete “${e.title}”?`, 'This login is removed from Vault and Autofill.', 'Delete', true))) return;
      const v = shown(), i = v.findIndex((x) => x.id === e.id);
      OS.commit('vault', (d) => (d.entries = d.entries.filter((x) => x.id !== e.id)));
      const w = shown(); sel = w.length ? w[Math.min(Math.max(0, i), w.length - 1)].id : null; dirty = false; changing = false;
      if (body && body.isConnected) drawBody(); touch();
    }

    /* File / Edit menus: New Login, Copy Username (never the password via ⌘C), Delete, Find */
    const open = () => mode === 'open' && !D().locked;
    OS.responder(el, {
      new: { label: 'New Login', enabled: open, run: startNew },
      copy: { label: 'Copy Username', enabled: () => open() && !!current(), run: () => copySecret(current(), 'username') },
      delete: { label: 'Delete Login…', enabled: () => open() && !!current(), run: () => deleteEntry(current()) },
      find: { label: 'Find Login…', enabled: open, run: () => { const s = el.querySelector('[data-q]'); s.focus(); s.select(); } },
    });

    OS.watch(el, 'change:vault prefs', (p, n) => {
      if (quiet) return;
      if (D().locked !== (mode === 'locked')) return render();
      subtitle();
      if (mode === 'locked') { if (n === 'prefs') render(); return; }
      if (cd) cd.textContent = cdText();
      if (!body || !body.isConnected) return render();
      if (sel && !byId(sel) && !draft) { sel = null; return render(); }
      if (!D().entries.length && !draft) return drawBody();
      if (!body.querySelector('.vt-list')) return drawBody();
      drawList(); if (!dirty && !draft && !changing) drawDetail();
    });
    OS.watch(el, 'tick', () => { if (mode === 'open' && cd) cd.textContent = cdText(); });
    render();
  }

  OS.feature({
    id: 'vault', name: 'Vault', icon: 'i-key',
    about: 'Fills logins in Safari and other apps. Passwords are stored in your keychain and unlock with Touch ID.',
    store: {
      count: (d) => d.entries.length, unit: 'logins',
      rule: () => `Passwords are stored in your keychain · ${lockMin() === 'never' ? 'locks when OneShot quits' : `locks after ${lockMin()} min and at launch`}`,
    },
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
      { key: 'lockAfter', label: 'Lock after', type: 'select', options: [[1, '1 min'], [5, '5 min'], [15, '15 min'], ['never', 'Never']], default: 5, effect: 'Vault locks itself after this long without use; Autofill then asks to unlock again. It always locks when OneShot quits.' },
      { key: 'confirmFill', label: 'Confirm each fill with Touch ID', type: 'toggle', default: false, effect: 'On: every fill asks for Touch ID, even while Vault is unlocked. Off: fills go straight through until Vault locks.' },
      { key: 'showOnFocus', label: 'Show Autofill when a login field is focused', type: 'toggle', default: true, effect: 'On: clicking a login field opens Autofill under it. Off: only the hotkey opens it.', needs: 'access' },
    ],
    hotkeys: [{ id: 'autofill', label: 'Open Autofill', default: '⌃⌥P', run: autofillHotkey }],
    init() {
      method = null;
      if (!D().locked || D().unlockedAt) OS.commit('vault', (d) => { d.locked = true; d.unlockedAt = 0; });   // locked at every launch
      OS.on('tick', () => { const d = D(); if (d.locked) return; if (OS.now() - d.unlockedAt >= lockMs()) lock(); });
      OS.on('host:loginFocus', (p) => { if (filling || !OS.pref('vault.showOnFocus')) return; openAutofill(p.el); });
    },
    view: { title: 'Vault', mount: (el, params) => { OS.ui.subtitle(''); OS.ui.load(el, 'vault', (e) => vaultView(e, params || {}), { skeleton: true }); } },
  });
})();
