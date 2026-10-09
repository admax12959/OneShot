/* Clipboard feature. Data: OS.data.clipboard.clips[]. Float (at the caret) and the history view read the same data. */
(function () {
  const { esc, h } = OS;
  const ICON = { text: 'i-text', json: 'i-braces', url: 'i-link', image: 'i-image' };
  const KIND = { text: 'Text', json: 'JSON', url: 'Link', image: 'Image' };
  const min = (n) => OS.now() - n * 60000;

  OS.feature({
    id: 'clipboard', name: 'Clipboard', icon: 'i-clip',
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
      { key: 'limit', label: 'History size', type: 'slider', min: 5, max: 100, step: 5, unit: ' items', default: 50, effect: 'Unpinned items beyond this number are removed from the float and the history list.' },
      { key: 'floatCount', label: 'Items in the float', type: 'slider', min: 3, max: 10, step: 1, unit: '', default: 8, effect: 'How many rows the float shows at the caret.' },
      { key: 'pinnedFirst', label: 'Pinned items first', type: 'toggle', default: false, effect: 'Pinned items lead the float and list; when off, pins only protect from pruning and sort by last use.' },
    ],
    hotkeys: [{ id: 'open', label: 'Open clipboard history', default: '⌃⌥V', run: () => openFloat() }],
    view: { title: 'Clipboard', mount: (el, params) => mountView(el, params || {}) },
    init,
  });

  const data = () => OS.data.clipboard;
  const find = (id) => data().clips.find((c) => c.id === id);
  const ordered = () => {
    const l = data().clips.slice().sort((a, b) => b.at - a.at);
    return OS.pref('clipboard.pinnedFirst') ? l.filter((c) => c.pinned).concat(l.filter((c) => !c.pinned)) : l;
  };
  const oneLine = (c) => c.kind === 'image' ? c.text || 'Screenshot' : c.text.replace(/\s+/g, ' ').trim();
  const pasteText = (c) => c.kind === 'image' ? `[Screenshot ${c.image.w}×${c.image.h}]` : c.text;
  const thumb = (c, w) => { try { return c.image && OS.call('screenshot.thumb', { shotId: c.image.shotId, width: w }); } catch (e) { return null; } };
  function fillThumbs(root, w) {
    root.querySelectorAll('[data-shot]').forEach((n) => {
      const c = find(n.closest('[data-id]').dataset.id), t = c && thumb(c, w);
      if (t) { n.innerHTML = ''; n.appendChild(t); }
    });
  }
  const icoHtml = (c) => c.kind === 'image' ? `<span class="cb-th" data-shot>${OS.ui.icon('i-image', 's')}</span>` : `<span class="cb-ico">${OS.ui.icon(ICON[c.kind], 's')}</span>`;

  function prune(d) {
    const un = d.clips.filter((c) => !c.pinned).sort((a, b) => b.at - a.at);
    const drop = new Set(un.slice(OS.pref('clipboard.limit')).map((c) => c.id));
    if (drop.size) d.clips = d.clips.filter((c) => !drop.has(c.id));
  }

  function init() {
    OS.on('pasteboard:record', (p) => {
      const id = OS.id('clip');
      OS.commit('clipboard', (d) => {
        const same = p.kind !== 'image' && d.clips.find((c) => c.kind === p.kind && c.text === p.text);
        if (same) { same.at = p.at; same.source = p.source; p.clipId = same.id; }
        else { p.clipId = id; d.clips.push({ id, kind: p.kind, text: p.text || '', image: p.image, source: p.source, pinned: false, at: p.at }); }
        prune(d);
      });
    });
    OS.on('pref:clipboard.limit', () => OS.commit('clipboard', prune));
  }

  /* ---------- float at the caret ---------- */
  function openFloat() {
    const te = OS.host.textedit; te.front();
    const c = te.caret();
    const el = h('<div class="cb-float"></div>');
    let q = '', sel = 0, input = null, list = null;
    const items = () => {
      const f = q.trim().toLowerCase();
      return ordered().filter((x) => !f || oneLine(x).toLowerCase().includes(f) || x.source.toLowerCase().includes(f)).slice(0, OS.pref('clipboard.floatCount'));
    };
    const paste = (id) => {
      OS.commit('clipboard', (d) => { const x = d.clips.find((k) => k.id === id); if (x) x.at = OS.now(); });
      const x = find(id); OS.ui.closeFloat(); if (x) te.insert(pasteText(x));
    };
    const drawList = () => {
      if (!list) return;
      if (OS.scn('clipboard.fail')) { OS.ui.state(list, { kind: 'failure', compact: true, title: 'Couldn’t load history', body: 'The local store didn’t respond.', action: { label: 'Close', run: () => OS.ui.closeFloat() } }); return; }
      const l = items(); sel = Math.max(0, Math.min(sel, l.length - 1));
      if (!l.length) { OS.ui.state(list, { kind: 'empty', compact: true, title: q ? 'No matches' : 'Nothing copied yet', body: q ? 'Try a different word.' : 'Copy something in TextEdit or Safari.' }); return; }
      list.innerHTML = l.map((x, i) => `<div class="cb-r ${i === sel ? 'sel' : ''}" data-id="${x.id}" data-i="${i}">${icoHtml(x)}<span class="t">${esc(oneLine(x))}</span>${x.pinned ? OS.ui.icon('i-pin', 's cb-pin') : ''}<span class="m">${esc(x.source)} · ${OS.ago(x.at)}</span></div>`).join('');
      fillThumbs(list, 40);
      list.querySelectorAll('.cb-r').forEach((r) => {
        r.onmouseenter = () => { sel = +r.dataset.i; list.querySelectorAll('.cb-r').forEach((o) => o.classList.toggle('sel', o === r)); };
        r.onclick = () => paste(r.dataset.id);
      });
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    };
    const build = () => {
      if (!OS.perm.has('access')) { OS.ui.grant(el, 'access', 'Pasting from history into your document needs Accessibility.'); input = list = null; return; }
      el.innerHTML = `<div class="cb-fh">${OS.ui.icon('i-search', 's')}<input class="cb-fq" placeholder="Filter history" spellcheck="false"></div><div class="cb-fl"></div><div class="cb-ff"><span><span class="kbd">↑↓</span> select</span><span><span class="kbd">↵</span> paste</span><span><span class="kbd">esc</span> close</span></div>`;
      input = el.querySelector('input'); list = el.querySelector('.cb-fl'); input.value = q;
      input.oninput = () => { q = input.value; sel = 0; drawList(); };
      drawList(); input.focus();
    };
    build();
    OS.watch(el, 'change:clipboard prefs', drawList);
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
    OS.ui.load(el, 'clipboard', (root) => {
      let first = true, q = '', type = 'all', sel = params.select && find(params.select) ? params.select : null, scrollTo = !!sel;
      root.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search clipboard" style="width:220px">
        <div class="seg" data-type>${[['all', 'All'], ['text', 'Text'], ['json', 'JSON'], ['url', 'Link'], ['image', 'Image']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <span class="grow"></span><button class="btn" data-clear>${OS.ui.icon('i-trash', 's')}Clear all</button></div><div class="split"></div>`;
      const split = root.querySelector('.split'), search = root.querySelector('.search'), clear = root.querySelector('[data-clear]');
      search.oninput = () => { q = search.value; draw(); };
      root.querySelectorAll('[data-type] button').forEach((b) => (b.onclick = () => { type = b.dataset.v; draw(); }));
      clear.onclick = async () => {
        if (!(await OS.system.confirm('Clear clipboard history?', 'Pinned items stay. Everything else is removed and can’t be restored.', 'Clear', true))) return;
        OS.commit('clipboard', (d) => { d.clips = d.clips.filter((c) => c.pinned); });
      };
      const visible = () => { const f = q.trim().toLowerCase(); return ordered().filter((c) => (type === 'all' || c.kind === type) && (!f || oneLine(c).toLowerCase().includes(f) || c.text.toLowerCase().includes(f))); };
      function draw() {
        root.querySelectorAll('[data-type] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === type));
        clear.disabled = !data().clips.some((c) => !c.pinned);
        if (!data().clips.length) { split.innerHTML = '<div class="cb-empty"></div>'; OS.ui.state(split.firstChild, { kind: 'empty', title: 'Nothing copied yet', body: 'Copy text in TextEdit or Safari and it appears here.' }); return; }
        const l = visible();
        if (!l.some((c) => c.id === sel)) sel = l[0] ? l[0].id : null;
        const old = split.querySelector('.list'), top = old ? old.scrollTop : 0, hadFocus = !!old && old.contains(document.activeElement);
        split.innerHTML = `<div class="list"></div><div class="detail"></div>`;
        const list = split.querySelector('.list'), det = split.querySelector('.detail');
        list.tabIndex = 0; list.setAttribute('aria-label', 'Clipboard history');
        if (!l.length) OS.ui.state(list, { kind: 'empty', compact: true, title: 'No matches', body: 'Change the search or the type filter.' });
        else list.innerHTML = l.map((c) => `<div class="row ${c.id === sel ? 'sel' : ''}" data-id="${c.id}">${icoHtml(c)}<span class="t">${esc(oneLine(c))}</span>${c.pinned ? OS.ui.icon('i-pin', 's cb-pin') : ''}<span class="m">${OS.ago(c.at)}</span></div>`).join('');
        fillThumbs(list, 40);
        list.scrollTop = top;
        list.querySelectorAll('.row').forEach((r) => (r.onclick = () => { sel = r.dataset.id; draw(); }));
        if (scrollTo) { const s = list.querySelector('.row.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); scrollTo = false; }
        drawDetail(det);
        if (first || hadFocus) list.focus({ preventScroll: true });
        first = false;
      }
      function copyItem(c) {
        OS.commit('clipboard', (d) => { const x = d.clips.find((k) => k.id === c.id); if (x) x.at = OS.now(); });
        OS.pasteboard.current = { kind: c.kind, text: c.text, image: c.image, source: 'Clipboard', clipId: c.id, at: OS.now() };
        OS.ui.toast('Copied', { sub: 'Moved to the top of history', ms: 2200 });
      }
      /* keyboard: ↑/↓ move the selection, ↵ copies it (not while typing or on a button) */
      root.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
        const l = visible();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!l.length) return; e.preventDefault();
          const i = l.findIndex((c) => c.id === sel), n = Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
          sel = l[n].id; scrollTo = true; draw(); split.querySelector('.list').focus({ preventScroll: true });
        } else if (e.key === 'Enter' && !e.target.closest('button')) { const c = sel && find(sel); if (c) { e.preventDefault(); copyItem(c); } }
      });
      function drawDetail(det) {
        const c = sel && find(sel);
        if (!c) { OS.ui.state(det, { kind: 'empty', compact: true, title: 'Nothing selected', body: 'Pick an item to see it here.' }); return; }
        det.innerHTML = `<div class="cb-dh"><span class="tag">${KIND[c.kind]}</span><span class="tag">${esc(c.source)}</span>${c.pinned ? `<span class="tag warn">${OS.ui.icon('i-pin', 's')}Pinned</span>` : ''}<span class="muted" style="margin-left:auto">${esc(new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span></div>
          <div class="cb-body ${c.kind === 'image' ? 'img' : ''}"></div>
          <div class="cb-acts"><button class="btn primary" data-a="copy">${OS.ui.icon('i-copy', 's')}Copy</button>
            ${c.kind === 'json' ? `<button class="btn" data-a="format">${OS.ui.icon('i-format', 's')}Format</button>` : ''}
            ${c.kind === 'image' && thumb(c, 10) ? `<button class="btn" data-a="shot">${OS.ui.icon('i-shot', 's')}Open in Screenshot</button>` : ''}
            <button class="btn" data-a="pin">${OS.ui.icon('i-pin', 's')}${c.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="btn danger" data-a="del">${OS.ui.icon('i-trash', 's')}Delete</button></div>
          <dl class="kv"><dt>Type</dt><dd>${KIND[c.kind]}</dd><dt>Copied from</dt><dd>${esc(c.source)}</dd>${c.kind === 'image' ? `<dt>Size</dt><dd>${c.image.w} × ${c.image.h}</dd>` : `<dt>Length</dt><dd>${c.text.length} characters</dd>`}</dl>`;
        const body = det.querySelector('.cb-body');
        if (c.kind === 'image') {
          const t = thumb(c, 360);
          if (t) body.appendChild(t); else body.innerHTML = `<div class="muted">${OS.ui.icon('i-image')} This screenshot is no longer in Screenshot history.</div>`;
        } else { body.classList.add('mono'); body.textContent = c.text; }
        det.querySelector('[data-a=copy]').onclick = () => copyItem(c);
        const fm = det.querySelector('[data-a=format]');
        if (fm) fm.onclick = () => { const r = fm.getBoundingClientRect(); OS.call('json.format', { text: c.text, source: 'Clipboard', clipId: c.id, x: r.left, y: r.bottom + 6 }); };
        const sh = det.querySelector('[data-a=shot]'); if (sh) sh.onclick = () => OS.open('screenshot', { select: c.image.shotId });
        det.querySelector('[data-a=pin]').onclick = () => OS.commit('clipboard', (d) => { const x = d.clips.find((k) => k.id === c.id); if (x) x.pinned = !x.pinned; });
        det.querySelector('[data-a=del]').onclick = () => OS.commit('clipboard', (d) => { d.clips = d.clips.filter((k) => k.id !== c.id); });
      }
      OS.watch(root, 'change:clipboard prefs clock', draw);
      draw();
    });
  }
})();
