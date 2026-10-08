/* Clipboard feature. Data: OS.data.clipboard.clips[]. The float (at the caret) and the history view read the same data.
   v3: retention is visible (G1), filtering runs in the background with empty vs no-match and capped large lists (G8),
   the view answers the Edit menu (G10). The "large" scenario shows 10,000 synthetic clips that are never saved. */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;
  const ICON = { text: 'i-text', json: 'i-braces', url: 'i-link', image: 'i-image' };
  const KIND = { text: 'Text', json: 'JSON', url: 'Link', image: 'Image' };
  const CAP = 200;                                   // rows drawn at most; the rest is reached by refining the search
  const LARGE = 10000;
  const min = (n) => OS.now() - n * 60000;
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const plural = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
  const limit = () => OS.pref('clipboard.limit');
  const ruleText = () => `Keeps ${fmt(limit())} unpinned clips · pinned clips stay`;

  OS.feature({
    id: 'clipboard', name: 'Clipboard', icon: 'i-clip',
    about: 'Keeps what you copy and pastes it again at the caret. Passwords and concealed copies are never kept.',
    store: { count: (d) => d.clips.length, unit: 'clips', rule: ruleText },
    seed: () => ({
      clips: [
        { id: 'c1', kind: 'url', text: 'https://status.acme.io/health', source: 'Safari', pinned: false, at: min(2) },
        { id: 'c2', kind: 'json', text: '{"service":"status","ok":true,"regions":["us-east","eu-west"],"latency":{"p50":42,"p95":118},"version":"1.4.2"}', source: 'TextEdit', pinned: false, at: min(6) },
        { id: 'c3', kind: 'text', text: 'Ship the status endpoint before Friday.', source: 'TextEdit', pinned: false, at: min(14) },
        { id: 'c4', kind: 'text', text: 'maya@acme.io', source: 'Safari', pinned: true, at: min(40) },
        { id: 'c5', kind: 'text', text: 'Standup moved to 10:30 — room Birch', source: 'Safari', pinned: false, at: min(120) },
        { id: 'c6', kind: 'url', text: 'https://github.com/acme/api/pull/412', source: 'Safari', pinned: false, at: min(190) },
        { id: 'c7', kind: 'json', text: '{"event":"deploy","id":7781,"tags":["api","web"],"actor":"maya"}', source: 'TextEdit', pinned: false, at: min(300) },
        { id: 'c8', kind: 'text', text: "SELECT id, status\nFROM deploys\nWHERE region = 'eu-west'\nORDER BY at DESC;", source: 'TextEdit', pinned: false, at: min(1500) },
        { id: 'c9', kind: 'text', text: 'Invoice #20418 — due Oct 28', source: 'Safari', pinned: false, at: min(1700) },
        { id: 'c10', kind: 'text', text: 'brew install ripgrep fd jq', source: 'TextEdit', pinned: false, at: min(2900) },
      ],
    }),
    empty: () => ({ clips: [] }),
    prefs: [
      { key: 'limit', label: 'History size', type: 'select', options: [[10, '10 clips'], [20, '20 clips'], [50, '50 clips'], [100, '100 clips'], [500, '500 clips'], [1000, '1,000 clips']], default: 50,
        effect: 'Unpinned clips beyond this number are removed, oldest first. Pinned clips always stay.' },
      { key: 'floatCount', label: 'Items in the float', type: 'slider', min: 3, max: 10, step: 1, unit: '', default: 8, effect: 'How many rows the float shows at the caret.' },
      { key: 'pinnedFirst', label: 'Pinned clips first', type: 'toggle', default: false, effect: 'On: pinned clips lead the float and the list. Off: pins only protect from pruning and sort by last use.' },
    ],
    hotkeys: [{ id: 'open', label: 'Open clipboard history', default: '⌃⌥V', run: () => openFloat() }],
    scenarios: [{ key: 'large', label: `Large history (${fmt(LARGE)} clips)` }],
    view: { title: 'Clipboard', mount: (el, params) => mountView(el, params || {}) },
    init,
  });

  /* ---------- the one list: stored clips, plus synthetic ones while the "large" scenario is on (memory only) ---------- */
  const data = () => OS.data.clipboard;
  const big = () => OS.scn('clipboard.large');
  let synth = null;
  function makeSynth(n) {
    const W = ['deploy', 'status', 'invoice', 'standup', 'token', 'release', 'branch', 'review', 'design', 'metrics', 'billing', 'incident', 'draft', 'schedule', 'roadmap', 'support'];
    const out = [], now = OS.now();
    for (let i = 0; i < n; i++) {
      const a = W[i % W.length], b = W[(i * 7 + 3) % W.length];
      const kind = i % 9 === 4 ? 'url' : i % 13 === 6 ? 'json' : 'text';
      const text = kind === 'url' ? `https://${a}.acme.io/${b}/${1000 + i}` : kind === 'json' ? `{"${a}":${i},"${b}":"${a}-${i % 97}"}` : `${a[0].toUpperCase() + a.slice(1)} ${b} · note ${i + 1}`;
      out.push({ id: 'syn-' + i, kind, text, source: i % 3 ? 'Safari' : 'TextEdit', pinned: i % 1700 === 11, at: now - (i + 30) * 7 * 60000 });
    }
    return out;
  }
  const synthList = () => synth || (synth = makeSynth(Math.max(0, LARGE - data().clips.length)));
  const all = () => (big() ? data().clips.concat(synthList()) : data().clips);
  const isSynth = (id) => String(id).startsWith('syn-');
  const find = (id) => all().find((c) => c.id === id);
  const ordered = () => {
    const l = all().slice().sort((a, b) => b.at - a.at);
    return OS.pref('clipboard.pinnedFirst') ? l.filter((c) => c.pinned).concat(l.filter((c) => !c.pinned)) : l;
  };
  /* mutate one clip: stored clips go through OS.commit; synthetic ones stay in memory */
  function editClip(id, fn) {
    if (isSynth(id)) { const x = synthList().find((c) => c.id === id); if (x) fn(x); OS.emit('clipboard:synth'); return; }
    OS.commit('clipboard', (d) => { const x = d.clips.find((c) => c.id === id); if (x) fn(x); });
  }
  function removeClip(id) {
    if (isSynth(id)) { synth = synthList().filter((c) => c.id !== id); OS.emit('clipboard:synth'); return; }
    OS.commit('clipboard', (d) => { d.clips = d.clips.filter((c) => c.id !== id); });
  }
  function clearUnpinned() {
    if (big()) synth = synthList().filter((c) => c.pinned);
    OS.commit('clipboard', (d) => { d.clips = d.clips.filter((c) => c.pinned); });
  }

  const oneLine = (c) => (c.kind === 'image' ? c.text || 'Screenshot' : c.text.replace(/\s+/g, ' ').trim());
  const pasteText = (c) => (c.kind === 'image' ? `[Screenshot ${c.image.w}×${c.image.h}]` : c.text);
  const thumb = (c, w) => { try { return c.image && OS.call('screenshot.thumb', { shotId: c.image.shotId, width: w }); } catch (e) { return null; } };
  function fillThumbs(root, w) {
    root.querySelectorAll('[data-shot]').forEach((n) => {
      const c = find(n.closest('[data-id]').dataset.id), t = c && thumb(c, w);
      if (t) { n.innerHTML = ''; n.appendChild(t); }
    });
  }
  const icoHtml = (c) => (c.kind === 'image' ? `<span class="cb-th" data-shot>${icon('i-image', 's')}</span>` : `<span class="cb-ico">${icon(ICON[c.kind], 's')}</span>`);
  const keeping = () => OS.policy.sources.filter((s) => OS.pref('policy.' + s) !== false).map((s) => (s === 'OneShot' ? 'OneShot' : s));

  /* retention: unpinned clips beyond the limit go, oldest first; returns how many were removed */
  const overLimit = (d) => d.clips.filter((c) => !c.pinned).sort((a, b) => b.at - a.at).slice(limit()).map((c) => c.id);
  function prune(d) {
    const drop = new Set(overLimit(d));
    if (drop.size) d.clips = d.clips.filter((c) => !drop.has(c.id));
    return drop.size;
  }
  let lastPrune = null;   // {n, at}: shown in the history footer after the limit was lowered

  function init() {
    if (overLimit(data()).length) OS.commit('clipboard', prune);   // pruning at launch
    OS.on('pasteboard:record', (p) => {
      if (p.concealed || p.source === 'Vault') return;              // never kept (the shell already gates this; belt and braces)
      if (p.source === 'Clipboard' && p.clipId && find(p.clipId)) { editClip(p.clipId, (x) => { x.at = p.at; }); return; }   // our own copy: move to top
      const id = OS.id('clip');
      OS.commit('clipboard', (d) => {
        const same = d.clips.find((c) => c.kind === p.kind && (p.kind === 'image' ? c.image && p.image && c.image.shotId === p.image.shotId : c.text === p.text));
        if (same) { same.at = p.at; same.source = p.source; p.clipId = same.id; }
        else { p.clipId = id; d.clips.push({ id, kind: p.kind, text: p.text || '', image: p.image, source: p.source, pinned: false, at: p.at }); }
        prune(d);
      });
    });
    OS.on('pref:clipboard.limit', () => {
      const n = overLimit(data()).length;
      if (!n) return;
      OS.commit('clipboard', prune);
      lastPrune = { n, at: OS.now() };
      OS.ui.toast(`${plural(n, 'older clip')} removed`, { icon: 'i-trash', sub: `History now keeps ${fmt(limit())} unpinned clips. Pinned clips stay.`, ms: 4500 });
      OS.emit('clipboard:synth');
    });
    OS.on('scn:clipboard.large', (v) => { if (!v) synth = null; });
  }

  /* ---------- float at the caret: a non-activating panel; the host app stays frontmost ---------- */
  function openFloat() {
    const te = OS.host.textedit; te.front();
    const c = te.caret();
    const el = h('<div class="cb-float"></div>');
    let q = '', sel = 0, input = null, list = null;
    const items = () => {
      const f = q.trim().toLowerCase();
      const out = [];
      for (const x of ordered()) { if (!f || oneLine(x).toLowerCase().includes(f) || x.source.toLowerCase().includes(f)) out.push(x); if (out.length >= OS.pref('clipboard.floatCount')) break; }
      return out;
    };
    const paste = (id) => {
      editClip(id, (x) => { x.at = OS.now(); });
      const x = find(id); OS.ui.closeFloat(); if (x) te.insert(pasteText(x));
    };
    const drawList = () => {
      if (!list) return;
      if (OS.scn('clipboard.fail')) { OS.ui.state(list, { kind: 'failure', compact: true, title: 'Couldn’t load history', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Close', run: () => OS.ui.closeFloat() } }); return; }
      const l = items(); sel = Math.max(0, Math.min(sel, l.length - 1));
      if (!l.length) {
        if (q) OS.ui.state(list, { kind: 'nomatch', compact: true, title: 'No matches', body: `Nothing in history contains “${q.trim()}”.` });
        else OS.ui.state(list, { kind: 'empty', compact: true, title: 'Nothing copied yet', body: `Copy in TextEdit or Safari. Keeps the last ${fmt(limit())} unpinned clips.` });
        return;
      }
      list.innerHTML = l.map((x, i) => `<div class="cb-r ${i === sel ? 'sel' : ''}" data-id="${x.id}" data-i="${i}">${icoHtml(x)}<span class="t">${esc(oneLine(x))}</span>${x.pinned ? icon('i-pin', 's cb-pin') : ''}<span class="m">${esc(x.source)} · ${OS.ago(x.at)}</span></div>`).join('');
      fillThumbs(list, 32);
      list.querySelectorAll('.cb-r').forEach((r) => {
        r.onmouseenter = () => { sel = +r.dataset.i; list.querySelectorAll('.cb-r').forEach((o) => o.classList.toggle('sel', o === r)); };
        r.onclick = () => paste(r.dataset.id);
      });
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    };
    const build = () => {
      if (!OS.perm.has('access')) { OS.ui.grant(el, 'access', 'Pasting from history into your document needs Accessibility.'); input = list = null; return; }
      el.innerHTML = `<div class="cb-fh">${icon('i-search', 's')}<input class="cb-fq" placeholder="Filter history" spellcheck="false" aria-label="Filter history"><span class="cb-fn">${big() ? fmt(all().length) : ''}</span></div><div class="cb-fl"></div>
        <div class="cb-ff"><span><span class="kbd">↑↓</span> select</span><span><span class="kbd">↵</span> paste</span><span><span class="kbd">esc</span> close</span></div>`;
      input = el.querySelector('input'); list = el.querySelector('.cb-fl'); input.value = q;
      input.oninput = () => { q = input.value; sel = 0; drawList(); };
      drawList(); input.focus();
    };
    build();
    OS.watch(el, 'change:clipboard clipboard:synth prefs', drawList);
    OS.watch(el, 'perm scn', () => { build(); });
    OS.ui.float({
      x: c.x, y: c.y + c.lineHeight + 4, above: c.y, el, cls: 'cb-fbox',
      onKey: (e) => {
        if (!input) return false;
        const l = items();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + l.length) % Math.max(1, l.length); drawList(); return true; }
        if (e.key === 'Enter') { if (l[sel]) paste(l[sel].id); return true; }
        return false;
      },
    });
    if (input) input.focus();
  }

  /* ---------- management view ---------- */
  function mountView(el, params) {
    OS.ui.subtitle('');
    OS.ui.load(el, 'clipboard', (root) => buildView(root, params), { skeleton: true });
  }

  function buildView(root, params) {
    let q = '', type = 'all', busy = false, res = null, first = true;
    let sel = params.select && find(params.select) ? params.select : null, scrollTo = !!sel;
    root.innerHTML = `<div class="toolbar">
        <div class="cb-q"><input class="search" placeholder="Search" aria-label="Search clipboard" spellcheck="false"><span class="cb-spin" aria-label="Filtering" hidden></span></div>
        <div class="seg" data-type>${[['all', 'All'], ['text', 'Text'], ['json', 'JSON'], ['url', 'Links'], ['image', 'Images']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <span class="grow"></span><span class="muted small cb-busy" data-busy hidden>Filtering…</span></div>
      <div class="split"></div>
      <div class="cb-foot"><span data-rule></span><span data-pruned></span><span class="grow"></span>${OS.ui.note('Pruned at launch and on limit change; concealed / transient pasteboard types are never recorded')}<button class="lnk" data-limit>Change Limit…</button></div>`;
    const split = root.querySelector('.split'), search = root.querySelector('.search'), qbox = root.querySelector('.cb-q');
    const tools = OS.ui.toolbarTools();
    let clear = tools && tools.querySelector('[data-clear]');
    if (tools && !clear) {
      clear = h(`<button class="btn tb" data-clear title="Clear History…" aria-label="Clear History">${icon('i-trash')}</button>`);
      tools.insertBefore(clear, tools.firstChild);
    }
    clear.onclick = async () => {
      if (!(await OS.system.confirm('Clear clipboard history?', 'Pinned clips stay. Everything else is removed and can’t be restored.', 'Clear', true))) return;
      clearUnpinned();
    };
    root.querySelector('[data-limit]').onclick = () => OS.openPrefs('clipboard');

    /* filtering: a background job, latest wins; the field shows it's working */
    const run = (qq, tt) => {
      const f = qq.trim().toLowerCase(), src = ordered();
      return { l: f || tt !== 'all' ? src.filter((c) => (tt === 'all' || c.kind === tt) && (!f || c.text.toLowerCase().includes(f) || c.source.toLowerCase().includes(f))) : src, total: src.length, q: qq, type: tt };
    };
    const setBusy = (b) => { busy = b; qbox.classList.toggle('busy', b); qbox.querySelector('.cb-spin').hidden = !b; root.querySelector('[data-busy]').hidden = !b; };
    function refilter() {
      if (!q.trim() && type === 'all') { OS.bg.cancel('clipboard.filter'); setBusy(false); res = run(q, type); draw(); return; }
      setBusy(true);
      const qq = q, tt = type;
      OS.bg('clipboard.filter', () => run(qq, tt)).then((r) => { if (!root.isConnected) return; res = r; setBusy(false); draw(); });
    }
    search.oninput = () => { q = search.value; refilter(); };
    search.onkeydown = (e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); clearSearch(); } };
    root.querySelectorAll('[data-type] button').forEach((b) => (b.onclick = () => { type = b.dataset.v; refilter(); }));
    const clearSearch = () => { q = ''; search.value = ''; type = 'all'; refilter(); };
    const shown = () => (res ? res.l.slice(0, CAP) : []);
    const current = () => (sel && find(sel)) || null;

    function draw() {
      root.querySelectorAll('[data-type] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === type));
      const everything = all(), pinned = everything.filter((c) => c.pinned).length;
      clear.disabled = !everything.some((c) => !c.pinned);
      root.querySelector('[data-rule]').textContent = ruleText();
      root.querySelector('[data-pruned]').textContent = lastPrune && OS.now() - lastPrune.at < 600000 ? ` · ${plural(lastPrune.n, 'older clip')} removed when the limit changed` : '';
      const filtered = res && (res.q.trim() || res.type !== 'all');
      OS.ui.subtitle(!everything.length ? 'No clips' : filtered ? `${fmt(res.l.length)} of ${plural(res.total, 'clip')}` : `${plural(everything.length, 'clip')} · ${fmt(pinned)} pinned`);
      if (!everything.length) {
        const src = keeping();
        split.innerHTML = '<div class="cb-empty"></div>';
        OS.ui.state(split.firstChild, { kind: 'empty', title: 'Nothing copied yet',
          body: `Copy in TextEdit or Safari and it shows up here. Clipboard keeps the last ${fmt(limit())} unpinned clips, and pinned clips stay. Passwords and other concealed copies are never kept.`,
          detail: src.length ? `Keeping copies from ${src.join(', ')}` : 'Not keeping copies from any app',
          action: { label: 'Clipboard Policy…', run: () => OS.openPrefs('privacy') } });
        return;
      }
      const l = shown();
      if (!l.some((c) => c.id === sel)) sel = l[0] ? l[0].id : null;
      const old = split.querySelector('.list'), top = old ? old.scrollTop : 0, hadFocus = !!old && old.contains(document.activeElement);
      split.innerHTML = '<div class="list cb-list"></div><div class="detail"></div>';
      const list = split.querySelector('.list'), det = split.querySelector('.detail');
      list.tabIndex = 0; list.setAttribute('aria-label', 'Clipboard history');
      if (!l.length) {
        const what = res.q.trim() ? `“${res.q.trim()}”` : '';
        OS.ui.state(list, { kind: 'nomatch', compact: true, title: what ? `No clips match ${what}` : `No ${KIND[res.type].toLowerCase()} clips`,
          body: what ? `Search looks in the text and the app it came from${res.type !== 'all' ? `, within ${KIND[res.type]}` : ''}.` : 'Nothing of this type is in history.',
          action: { label: what ? 'Clear Search' : 'Show All', run: clearSearch } });
      } else {
        list.innerHTML = l.map((c) => `<div class="row cb-row ${c.id === sel ? 'sel' : ''}" data-id="${c.id}">${icoHtml(c)}<span class="t">${esc(oneLine(c).slice(0, 160))}</span>${c.pinned ? icon('i-pin', 's cb-pin') : ''}<span class="m">${OS.ago(c.at)}</span></div>`).join('') +
          (res.l.length > CAP ? `<div class="cb-cap" data-cap>Showing ${fmt(CAP)} of ${fmt(res.l.length)} · refine the search</div>` : '');
      }
      fillThumbs(list, 32);
      list.scrollTop = top;
      if (!l.length) { det.innerHTML = ''; first = false; return; }
      list.querySelectorAll('.row').forEach((r) => (r.onclick = () => { sel = r.dataset.id; draw(); }));
      if (scrollTo) { const s = list.querySelector('.row.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); scrollTo = false; }
      drawDetail(det);
      if (first || hadFocus) list.focus({ preventScroll: true });
      first = false;
    }
    function copyItem(c) {
      OS.pasteboard.copy({ kind: c.kind, text: c.text, image: c.image, source: 'Clipboard', clipId: c.id });
      OS.ui.toast('Copied', { sub: 'Moved to the top of history', ms: 2200 });
    }
    /* keyboard: ↑/↓ move the selection, ↵ copies it (not while typing or on a button) */
    root.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      const l = shown();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!l.length) return; e.preventDefault();
        const i = l.findIndex((c) => c.id === sel), n = Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        sel = l[n].id; scrollTo = true; draw(); split.querySelector('.list').focus({ preventScroll: true });
      } else if (e.key === 'Enter' && !e.target.closest('button')) { const c = current(); if (c) { e.preventDefault(); copyItem(c); } }
    });
    function drawDetail(det) {
      const c = current();
      if (!c) { OS.ui.state(det, { kind: 'empty', compact: true, title: 'No clip selected', body: 'Pick a clip to see it here.' }); return; }
      det.innerHTML = `<div class="cb-dh"><span class="tag">${KIND[c.kind]}</span><span class="tag">${esc(c.source)}</span>${c.pinned ? `<span class="tag warn">${icon('i-pin', 's')}Pinned</span>` : ''}<span class="muted small" style="margin-left:auto">${esc(new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span></div>
        <div class="cb-body ${c.kind === 'image' ? 'img' : ''}"></div>
        <div class="cb-acts"><button class="btn primary" data-a="copy">${icon('i-copy', 's')}Copy</button>
          ${c.kind === 'json' ? `<button class="btn" data-a="format">${icon('i-format', 's')}Format</button>` : ''}
          ${c.kind === 'image' && thumb(c, 10) ? `<button class="btn" data-a="shot">${icon('i-shot', 's')}Open in Screenshot</button>` : ''}
          <button class="btn" data-a="pin">${icon('i-pin', 's')}${c.pinned ? 'Unpin' : 'Pin'}</button>
          <span class="grow"></span><button class="btn" data-a="del">${icon('i-trash', 's')}Delete</button></div>
        <dl class="kv"><dt>Type</dt><dd>${KIND[c.kind]}</dd><dt>Copied from</dt><dd>${esc(c.source)}</dd>${c.kind === 'image' ? `<dt>Size</dt><dd>${c.image.w} × ${c.image.h}</dd>` : `<dt>Length</dt><dd>${plural(c.text.length, 'character')}</dd>`}
          <dt>Kept</dt><dd>${c.pinned ? 'Pinned · stays until you unpin it' : 'Until it falls past the history size'}</dd></dl>`;
      const body = det.querySelector('.cb-body');
      if (c.kind === 'image') {
        const t = thumb(c, 360);
        if (t) body.appendChild(t); else body.innerHTML = `<div class="muted">${icon('i-image')} This screenshot is no longer in Screenshot history.</div>`;
      } else { body.classList.add('mono'); body.textContent = c.text; }
      det.querySelector('[data-a=copy]').onclick = () => copyItem(c);
      const fm = det.querySelector('[data-a=format]');
      if (fm) fm.onclick = () => { const r = fm.getBoundingClientRect(); OS.call('json.format', { text: c.text, source: 'Clipboard', clipId: c.id, x: r.left, y: r.bottom + 6 }); };
      const sh = det.querySelector('[data-a=shot]'); if (sh) sh.onclick = () => OS.open('screenshot', { select: c.image.shotId });
      det.querySelector('[data-a=pin]').onclick = () => editClip(c.id, (x) => { x.pinned = !x.pinned; });
      det.querySelector('[data-a=del]').onclick = () => removeClip(c.id);
    }

    /* Edit menu: Copy, Delete and Find follow the selection (NSMenuItemValidation) */
    OS.responder(root, {
      copy: { label: 'Copy Clip', enabled: () => !!current(), run: () => copyItem(current()) },
      delete: { label: 'Delete Clip', enabled: () => !!current(), run: () => removeClip(sel) },
      find: { label: 'Find in History…', run: () => { search.focus(); search.select(); } },
    });

    OS.watch(root, 'change:clipboard clipboard:synth', () => { res = run(q, type); draw(); });
    OS.watch(root, 'prefs scn', () => { res = run(q, type); draw(); });
    OS.watch(root, 'clock', draw);
    res = run(q, type);
    draw();
  }
})();
