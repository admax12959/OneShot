/* JSON (v3): Format pill (runtime) + JSON Studio (view). One source: OS.data.json.docs — the document repository,
   not prefs. Strict JSON only (no JSON5). v3: caret excerpt on failures, background validate/format for large
   documents and background search (G8), responder actions (G10), a native-feeling text view. Contract: SPEC.md */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;
  const HEAVY = 256 * 1024;                 // above this, validate/format run in the background
  const BIG_ID = 'doc-large';

  /* ---------- strict JSON scanner with exact error position ---------- */
  function scan(t) {
    let i = 0;
    const E = (msg, p) => { throw { pos: p == null ? i : p, msg }; };
    const end = () => i >= t.length;
    const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
    const unexpected = () => (end() ? E('Unexpected end of input', t.length) : ',:]}'.includes(t[i]) ? E('Expected a value') : E('Unexpected character “' + t[i] + '”'));
    function str() {
      i++;
      while (i < t.length) {
        const c = t[i];
        if (c === '"') { i++; return; }
        if (c === '\\') {
          const n = t[i + 1];
          if (n === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(t.slice(i + 2, i + 6))) E('Invalid unicode escape', i); i += 6; }
          else if (n && '"\\/bfnrt'.includes(n)) i += 2;
          else E('Invalid escape sequence', i);
        } else if (c < ' ') E('Line break inside a string');
        else i++;
      }
      E('Unterminated string', t.length);
    }
    function val() {
      ws();
      const c = t[i];
      if (c === '{') {
        i++; ws();
        if (t[i] === '}') { i++; return; }
        for (;;) {
          ws();
          if (t[i] !== '"') end() ? unexpected() : t[i] === "'" ? E('Property names need double quotes') : E('Expected a property name in double quotes');
          str(); ws();
          if (t[i] !== ':') end() ? unexpected() : E('Expected “:” after the property name');
          i++; val(); ws();
          if (t[i] === ',') { const comma = i; i++; ws(); if (t[i] === '}') E('Trailing comma isn’t allowed in JSON', comma); continue; }
          if (t[i] === '}') { i++; return; }
          end() ? unexpected() : E('Expected “,” or “}”');
        }
      }
      if (c === '[') {
        i++; ws();
        if (t[i] === ']') { i++; return; }
        for (;;) {
          val(); ws();
          if (t[i] === ',') { const comma = i; i++; ws(); if (t[i] === ']') E('Trailing comma isn’t allowed in JSON', comma); continue; }
          if (t[i] === ']') { i++; return; }
          end() ? unexpected() : E('Expected “,” or “]”');
        }
      }
      if (c === '"') return str();
      if (c === "'") E('Strings need double quotes');
      for (const lit of ['true', 'false', 'null']) if (t.startsWith(lit, i)) { i += lit.length; return; }
      const re = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y; re.lastIndex = i;
      const m = re.exec(t);
      if (m && m[0] !== '-') { i += m[0].length; return; }
      unexpected();
    }
    val(); ws();
    if (!end()) E('Unexpected content after the JSON value');
  }
  function check(text) {
    try { scan(text); return { ok: true, value: JSON.parse(text) }; }
    catch (e) {
      if (e.pos == null) return { ok: false, line: 1, col: 1, pos: 0, msg: 'Not valid JSON' };
      const pos = Math.min(e.pos, text.length), before = text.slice(0, pos);
      return { ok: false, line: before.split('\n').length, col: pos - (before.lastIndexOf('\n') + 1) + 1, pos, msg: e.msg };
    }
  }
  const lc = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  /* the offending line, windowed around the column, with a caret under it */
  function excerpt(text, r) {
    const line = text.split('\n')[r.line - 1] || '';
    let from = Math.max(0, r.col - 1 - 34), to = Math.min(line.length, from + 64);
    if (to - from < 64) from = Math.max(0, to - 64);
    const pre = from > 0 ? '…' : '', post = to < line.length ? '…' : '';
    return { gutter: String(r.line), text: pre + line.slice(from, to) + post, caret: ' '.repeat(pre.length + (r.col - 1 - from)) + '^' };
  }
  const countKeys = (v) => (Array.isArray(v) ? v.reduce((n, x) => n + countKeys(x), 0) : v && typeof v === 'object' ? Object.keys(v).reduce((n, k) => n + 1 + countKeys(v[k]), 0) : 0);
  const detectIndent = (t) => { const m = t.match(/\n([ \t]+)\S/); if (!m) return t.includes('\n') ? 'No indent' : 'Minified'; return m[1][0] === '\t' ? 'Tabs' : `${m[1].length} space${m[1].length === 1 ? '' : 's'}`; };
  function analyze(text) {
    const r = check(text); r.size = text.length; r.blank = !text.trim();
    if (r.ok) { r.keys = countKeys(r.value); r.indent = detectIndent(text); delete r.value; }
    return r;
  }

  /* ---------- output modes (read prefs at call time) ---------- */
  const MODES = ['Formatted', 'Minified', 'Sorted'];
  const indentStr = () => { const i = OS.pref('json.indent'); return i === 'tab' ? '\t' : ' '.repeat(+i || 2); };
  const indentLabel = () => { const i = OS.pref('json.indent'); return i === 'tab' ? 'tabs' : i + ' spaces'; };
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => (o[k] = sortDeep(v[k]))); return o; }
    return v;
  };
  const render = (value, mode) => {
    if (mode === 'Minified') return JSON.stringify(value);
    if (mode === 'Sorted') return JSON.stringify(sortDeep(value), null, indentStr());
    return JSON.stringify(OS.pref('json.sortKeys') ? sortDeep(value) : value, null, indentStr());
  };
  const modeFx = (m) => (m === 'Minified' ? 'No whitespace' : m === 'Sorted' ? `Keys sorted · ${indentLabel()}` : `${indentLabel()}${OS.pref('json.sortKeys') ? ' · keys sorted' : ''}`);
  const stamp = () => new Date(OS.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/, '');

  /* ---------- the repository: stored docs, plus the large synthetic document while its scenario is on ---------- */
  let big = null;   // never stored: generated while 'json.large' is on
  function genBig() {
    const T = ['deploy', 'build', 'alert', 'login', 'rollback'], A = ['maya', 'li', 'sam', 'noor', 'ben', 'ada', 'kai'], R = ['us-east', 'eu-west', 'ap-south'];
    const base = Date.UTC(2026, 8, 1), N = 10200, ev = new Array(N);
    for (let i = 0; i < N; i++) ev[i] = { id: i + 1, type: T[i % 5], at: new Date(base + i * 61000).toISOString(), actor: A[i % 7], region: R[i % 3], latency_ms: (i * 37) % 900, ok: i % 11 !== 0, tags: [T[(i + 2) % 5], R[(i + 1) % 3]] };
    return JSON.stringify({ export: 'events', count: N, events: ev }, null, 2);
  }
  const bigDoc = () => {
    if (!OS.scn('json.large')) return null;
    if (!big) big = { id: BIG_ID, name: 'Event export', source: 'Studio', at: OS.now(), big: true, text: genBig() };
    return big.removed ? null : big;
  };
  const stored = () => OS.data.json.docs;
  const docs = () => { const b = bigDoc(); return b ? [b, ...stored()] : stored(); };
  const docById = (id) => docs().find((d) => d.id === id);
  function addDoc(o) {
    const d = Object.assign({ id: OS.id('doc'), at: OS.now() }, o);
    OS.commit('json', (s) => s.docs.unshift(d));
    return d.id;
  }
  function setDoc(id, patch) {
    if (big && id === BIG_ID) { Object.assign(big, patch); OS.emit('change:json', OS.data.json); return; }   // in memory only
    OS.commit('json', () => { const d = stored().find((x) => x.id === id); if (d) Object.assign(d, patch); });
  }
  function removeDoc(id) {
    if (big && id === BIG_ID) { big.removed = true; OS.emit('change:json', OS.data.json); return; }
    OS.commit('json', (s) => (s.docs = s.docs.filter((x) => x.id !== id)));
  }

  /* ---------- Format pill: a non-activating float at the selection ---------- */
  const PILL_NOTE = 'NSPanel(.nonactivatingPanel) · never key; AX selected-text replace';
  function pillShell(el, o) {
    OS.ui.float({ x: o.x, y: o.y, above: o.above, el, cls: 'js-float', onClose: o.onClose, onKey: o.onKey });
  }
  const pillEl = () => h('<div class="js-pill"></div>');

  function failurePill(text, r, anchor, docKey) {
    const el = pillEl(), ex = excerpt(text, r);
    el.innerHTML = `<div class="js-fail">${icon('i-x')}<div class="js-loc"><b>Invalid JSON — line ${r.line}, column ${r.col}</b><div>${esc(r.msg)}</div></div></div>
      <pre class="js-ex mono" aria-label="Line ${r.line}"><span class="js-exg">${esc(ex.gutter)}</span><span>${esc(ex.text)}</span>\n<span class="js-exg">${' '.repeat(ex.gutter.length)}</span><span class="js-caret">${esc(ex.caret)}</span></pre>
      <div class="js-acts"><span class="muted js-note">Text left unchanged</span><span class="js-sp"></span><button class="btn" data-open>${icon('i-braces', 's')}Open in Studio</button><span class="kbd" title="Close">esc</span></div>${OS.ui.note('Strict JSON (RFC 8259) — no JSON5; JSONSerialization error index → line:col')}`;
    el.querySelector('[data-open]').onclick = () => {
      const doc = stored().find((d) => (docKey.clipId && d.clipId === docKey.clipId) || (!docKey.clipId && d.text === text && d.source === docKey.source));
      const id = doc ? doc.id : addDoc({ name: `${docKey.source} ${stamp()}`, text, source: docKey.source, clipId: docKey.clipId });
      OS.open('json', { select: id });
    };
    pillShell(el, anchor);
  }

  /* "Store fails to load": every runtime surface shows the same compact failure instead of data */
  function storeFailPill(retry, anchor) {
    const el = pillEl();
    const draw = () => OS.ui.state(el, { kind: 'failure', compact: true, title: 'Couldn’t load JSON documents', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try Again', run: () => { if (OS.scn('json.fail')) OS.ui.toast('Still can’t reach the store', { kind: 'failure', ms: 2000 }); else { OS.ui.closeFloat(); retry(); } } } });
    draw();
    OS.watch(el, 'scn', () => { if (OS.scn('json.fail')) draw(); else { OS.ui.closeFloat(); retry(); } });
    pillShell(el, anchor);
  }

  function hint(anchor) {
    const el = pillEl();
    el.innerHTML = `<div class="js-hint">${icon('i-cursor', 's')}Select JSON in the document first</div>`;
    pillShell(el, anchor);
  }

  /* ctx: {kind:'edit'|'clip', text, range?, source, clipId?, anchor} */
  function successPill(ctx, parsed) {
    let range = ctx.range, out = '';
    const doc = (() => {
      if (ctx.clipId) { const d = stored().find((x) => x.clipId === ctx.clipId); if (d) return d.id; }
      else if (ctx.kind === 'edit') {
        /* the same text formatted again from TextEdit (original or an earlier output) reuses its document */
        const d = stored().find((x) => x.source === ctx.source && !x.clipId && (x.orig === ctx.text || x.text === ctx.text));
        if (d) { if (!d.orig) setDoc(d.id, { orig: ctx.text }); return d.id; }
      }
      return addDoc({ name: `${ctx.source} ${stamp()}`, text: '', source: ctx.source, clipId: ctx.clipId, orig: ctx.kind === 'edit' ? ctx.text : undefined });
    })();
    const el = pillEl(), edit = ctx.kind === 'edit';
    el.innerHTML = `${edit ? '' : '<pre class="js-prev mono" data-prev></pre>'}
      <div class="js-acts"><div class="seg" data-seg>${MODES.map((m) => `<button data-m="${m}">${m}</button>`).join('')}</div><span class="js-sp"></span>
        ${edit ? `<button class="btn" data-undo>${icon('i-undo', 's')}Undo</button>` : `<button class="btn" data-copy>${icon('i-copy', 's')}Copy</button>`}
        <button class="btn" data-open>${icon('i-braces', 's')}Open in Studio</button></div>
      <div class="js-note muted" data-note></div>${OS.ui.note(PILL_NOTE)}`;
    const ta = OS.host.textedit.el();
    const apply = (m) => {
      out = render(parsed, m);
      if (edit) range = OS.host.textedit.replace(range.start, range.end, out);
      else el.querySelector('[data-prev]').textContent = out;
      setDoc(doc, { text: out, at: OS.now() });
      el.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === m));
      el.querySelector('[data-note]').textContent = edit ? `${m} · ${modeFx(m)} · ${ctx.text.length} → ${out.length} characters` : `${modeFx(m)} · ${out.length} characters`;
    };
    el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => apply(b.dataset.m)));
    el.querySelector('[data-open]').onclick = () => OS.open('json', { select: doc });
    if (edit) {
      el.querySelector('[data-undo]').onclick = () => { OS.host.textedit.replace(range.start, range.end, ctx.text); OS.ui.closeFloat(); };
      const typed = () => OS.ui.closeFloat();
      ta.addEventListener('input', typed, { once: true });
      apply('Formatted');
      const c = OS.host.textedit.caret(range.end);
      pillShell(el, { x: c.x, y: c.y + c.lineHeight + 4, above: c.y, onClose: () => ta.removeEventListener('input', typed) });
    } else {
      el.querySelector('[data-copy]').onclick = () => {
        const r = OS.pasteboard.copy({ kind: 'json', text: out, source: 'OneShot' });
        OS.ui.toast('Copied', { sub: r.recorded ? 'Added to Clipboard history' : 'Not added to Clipboard history' });
      };
      apply('Formatted');
      pillShell(el, ctx.anchor);
    }
    return doc;
  }

  function formatSelection() {
    OS.host.textedit.front();
    const sel = OS.host.textedit.getSelection();
    const c = OS.host.textedit.caret(sel.end);
    const anchor = { x: c.x, y: c.y + c.lineHeight + 4, above: c.y };
    if (!OS.perm.has('access')) {
      const el = pillEl();
      el.innerHTML = '<div data-g></div>';
      OS.ui.grant(el.querySelector('[data-g]'), 'access', 'Format reads the text you selected and replaces it in place.');
      OS.watch(el, 'perm', () => { if (OS.perm.has('access')) { OS.ui.closeFloat(); formatSelection(); } });
      return pillShell(el, anchor);
    }
    if (OS.scn('json.fail')) return storeFailPill(formatSelection, anchor);
    if (!sel.text.trim()) return hint(anchor);
    const r = check(sel.text);
    if (!r.ok) return failurePill(sel.text, r, anchor, { source: 'TextEdit' });
    successPill({ kind: 'edit', text: sel.text, range: { start: sel.start, end: sel.end }, source: 'TextEdit' }, r.value);
  }

  OS.provide('json.format', ({ text, source, clipId, x, y }) => {
    const anchor = { x: x == null ? 600 : x, y: y == null ? 200 : y, above: y == null ? 200 : y - 4 };
    const src = source || 'Clipboard';
    if (OS.scn('json.fail')) return storeFailPill(() => OS.call('json.format', { text, source, clipId, x, y }), anchor);
    const r = check(String(text || ''));
    if (!r.ok) return failurePill(String(text || ''), r, anchor, { source: src, clipId });
    return successPill({ kind: 'clip', text, source: src, clipId, anchor }, r.value);
  });

  /* ---------- Studio ---------- */
  const undoStacks = {};   // docId -> [{label, text}] ; Studio owns undo for its text view
  const VERB = { Formatted: 'Format', Minified: 'Minify', Sorted: 'Sort Keys' };

  function studio(el, params) {
    const st = { sel: params.select || null, q: '', applied: '', loaded: false, built: false, busy: null, info: null, infoFor: null, typing: null, caret: { ln: 1, col: 1 } };
    el.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search documents" aria-label="Search documents" data-q style="width:200px"><span class="js-busy" data-sbusy hidden><i class="js-spin"></i>Searching…</span>
      <span class="grow"></span>
      <div class="js-tgrp"><button class="btn" data-run="Formatted" title="Format with the indent from Preferences">${icon('i-format', 's')}Format</button><button class="btn" data-run="Minified" title="Remove all whitespace">${icon('i-minify', 's')}Minify</button><button class="btn" data-run="Sorted" title="Sort object keys">${icon('i-sort', 's')}Sort Keys</button></div>
      <i class="js-tsep"></i><button class="btn tb" data-copy title="Copy document (⌘C)">${icon('i-copy')}</button><button class="btn tb" data-del title="Delete document (⌘⌫)">${icon('i-trash')}</button></div>
      <div class="split js-split" data-body></div>`;
    const body = el.querySelector('[data-body]'), search = el.querySelector('[data-q]'), sbusy = el.querySelector('[data-sbusy]');
    const tools = OS.ui.toolbarTools();
    if (tools) { const b = h(`<button class="btn tb" data-js-new title="New Document (⌘N)">${icon('i-plus')}</button>`); b.onclick = () => create(); tools.insertBefore(b, tools.querySelector('[data-pg]')); }
    const visible = () => { const f = st.applied.trim().toLowerCase(); return docs().filter((d) => !f || d.name.toLowerCase().includes(f) || d.text.toLowerCase().includes(f)).sort((a, b) => b.at - a.at); };
    const cur = () => docById(st.sel);
    const shown = () => (st.built ? cur() : null);   // the document on screen (none in empty / no-match states)
    const heavy = (d) => d && d.text.length > HEAVY;
    const $ = (s) => body.querySelector(s);

    /* --- layout: list | text view (gutter + text) + status bar --- */
    function build() {
      if (st.built) return;
      body.innerHTML = `<div class="list js-list" tabindex="0" aria-label="Documents" role="listbox"></div>
        <div class="detail js-ed">
          <div class="js-head"><input class="js-name" data-name aria-label="Document name" spellcheck="false"><span class="js-meta muted" data-meta></span></div>
          <div class="js-tv"><pre class="js-gut" data-gut aria-hidden="true"></pre><textarea class="js-text" data-text spellcheck="false" autocomplete="off" placeholder="Paste or type JSON" aria-label="Document text"></textarea>
            <div class="js-work" data-work hidden><i class="js-spin"></i><span data-worktxt></span></div></div>
          <div class="js-status"><button class="js-st" data-st></button><span class="js-sp"></span><span class="js-pos mono" data-pos></span></div>
        </div>`;
      st.built = true;
      const name = $('[data-name]'), ta = $('[data-text]'), gut = $('[data-gut]');
      name.oninput = () => cur() && setDoc(st.sel, { name: name.value });
      ta.oninput = () => {
        const d = cur(); if (!d) return;
        if (!st.typing || st.typing.id !== d.id) { pushUndo(d.id, 'Undo Typing', d.text); }
        clearTimeout(st.typing && st.typing.t); st.typing = { id: d.id, t: setTimeout(() => (st.typing = null), 1200) };
        setDoc(st.sel, { text: ta.value, at: OS.now() });
      };
      ta.onscroll = () => { gut.scrollTop = ta.scrollTop; };
      const pos = () => { const v = ta.value.slice(0, ta.selectionStart); const ln = v.split('\n').length; st.caret = { ln, col: ta.selectionStart - v.lastIndexOf('\n') }; drawPos(); };
      ['keyup', 'click', 'select', 'focus'].forEach((e) => ta.addEventListener(e, pos));
      ta.addEventListener('keydown', (e) => {
        const c = OS.comboOf(e);
        if (c === '⌘Z' || c === '⇧⌘Z') { e.preventDefault(); e.stopPropagation(); if (c === '⌘Z') undo(); }   // Studio owns undo for its text
        if (e.key === 'Tab' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText(indentStr(), s, ta.selectionEnd, 'end'); ta.oninput(); }
      });
      $('[data-st]').onclick = () => { const r = st.info; if (!r || r.ok || r.blank || r.pos == null) return; ta.focus(); ta.setSelectionRange(r.pos, Math.min(ta.value.length, r.pos + 1)); pos(); };
    }

    /* --- undo (per document; format runs and typing bursts) --- */
    function pushUndo(id, label, text) { const s = (undoStacks[id] = undoStacks[id] || []); s.push({ label, text }); if (s.length > 50) s.shift(); }
    const topUndo = () => { const s = undoStacks[st.sel]; return s && s.length ? s[s.length - 1] : null; };
    function undo() {
      const u = topUndo(); if (!u || st.busy) return;
      undoStacks[st.sel].pop(); st.typing = null;
      setDoc(st.sel, { text: u.text, at: OS.now() });
    }

    /* --- format / minify / sort: inline for small documents, in the background for large ones --- */
    function run(mode) {
      const d = cur(); if (!d || st.busy) return;
      const id = d.id, before = d.text;
      const finish = (out) => {
        st.busy = null; if (out == null) return drawEditor();
        pushUndo(id, 'Undo ' + VERB[mode], before); st.typing = null;
        setDoc(id, { text: out, at: OS.now() });
        if (!el.isConnected) return;
        if (heavy(d)) OS.ui.toast(`${VERB[mode] === 'Format' ? 'Formatted' : VERB[mode] === 'Minify' ? 'Minified' : 'Sorted'} “${d.name}”`, { icon: 'i-braces', sub: `${OS.bytes(before.length)} → ${OS.bytes(out.length)}`, ms: 3000 });
      };
      const work = () => { const r = check(before); return r.ok ? render(r.value, mode) : null; };
      if (!heavy(d)) return finish(work());
      st.busy = { kind: mode === 'Formatted' ? 'Formatting' : mode === 'Minified' ? 'Minifying' : 'Sorting keys', id };
      drawEditor();
      OS.bg('json.work', work, OS.scn('slow') ? 2600 : 1100).then((out) => { if (st.busy && st.busy.id === id) finish(out); });
    }

    /* --- status: validity computed (never stored); large documents validate in the background --- */
    function validate(d) {
      if (st.infoFor === d.text) return;
      if (!heavy(d)) { st.info = analyze(d.text); st.infoFor = d.text; return; }
      st.info = null; st.infoFor = d.text;
      const text = d.text;
      OS.bg('json.validate', () => analyze(text), OS.scn('slow') ? 2000 : 800).then((r) => { if (st.infoFor === text) { st.info = r; drawStatus(); drawList(); } });
    }
    function drawStatus() {
      if (!st.built) return;
      const b = $('[data-st]'), r = st.info, d = cur();
      let cls = '', txt;
      if (st.busy) { cls = 'work'; txt = `${st.busy.kind} in the background…`; }
      else if (!r) { cls = 'work'; txt = 'Validating in the background…'; }
      else if (r.blank) txt = 'Empty document';
      else if (r.ok) { cls = 'ok'; txt = `Valid JSON · ${r.keys.toLocaleString('en-US')} key${r.keys === 1 ? '' : 's'} · ${r.indent}`; }
      else { cls = 'bad'; txt = `Line ${r.line}, column ${r.col}: ${lc(r.msg)}`; }
      b.className = 'js-st ' + cls; b.innerHTML = `${cls === 'work' ? '<i class="js-spin"></i>' : `<i class="js-dot"></i>`}<span>${esc(txt)}</span>`;
      b.title = r && !r.ok && !r.blank ? 'Show the error' : '';
      const ready = !!(d && r && r.ok && !st.busy);
      el.querySelectorAll('[data-run]').forEach((x) => (x.disabled = !ready));
      el.querySelector('[data-copy]').disabled = !copyable();
      el.querySelector('[data-del]').disabled = !d;
      drawPos(); register();
    }
    function drawPos() { const p = $('[data-pos]'), d = cur(); if (p && d) p.textContent = `Ln ${st.caret.ln}, Col ${st.caret.col} · ${OS.bytes(d.text.length)}`; }
    const copyable = () => { const d = shown(); return !!d && !!d.text.trim() && !d.big; };

    function drawList() {
      const list = $('.js-list'); if (!list) return;
      const v = visible();
      list.innerHTML = v.map((d) => {
        const bad = !d.big && d.text.trim() && !check(d.text).ok;
        return `<div class="row js-row ${d.id === st.sel ? 'sel' : ''}" data-id="${d.id}" role="option" aria-selected="${d.id === st.sel}">${icon('i-braces', 's')}
          <div class="t"><div class="js-rn">${esc(d.name)}</div><div class="m">${esc(d.source)} · ${OS.ago(d.at)}</div></div>${d.big ? `<span class="tag">${OS.bytes(d.text.length)}</span>` : bad ? '<span class="tag bad">Invalid</span>' : ''}</div>`;
      }).join('');
      list.querySelectorAll('[data-id]').forEach((r) => (r.onmousedown = (e) => { e.preventDefault(); select(r.dataset.id); list.focus({ preventScroll: true }); }));
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function drawEditor() {
      const d = cur(); if (!d || !st.built) return;
      const name = $('[data-name]'), ta = $('[data-text]'), gut = $('[data-gut]'), work = $('[data-work]');
      if (document.activeElement !== name && name.value !== d.name) name.value = d.name;
      name.readOnly = !!d.big;
      $('[data-meta]').textContent = d.big ? 'Not saved · generated for this session' : `${d.source} · edited ${OS.ago(d.at) === 'now' ? 'just now' : OS.ago(d.at) + ' ago'}`;
      if (ta.value !== d.text) { const keep = document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd] : null; ta.value = d.text; if (keep) ta.setSelectionRange(...keep); }
      const lines = d.text.split('\n').length;
      gut.hidden = lines > 5000;   // the gutter is cheap only for ordinary documents
      if (!gut.hidden) { const want = Math.max(lines, 1); if (gut.dataset.n !== String(want)) { gut.textContent = Array.from({ length: want }, (_, i) => i + 1).join('\n'); gut.dataset.n = want; } gut.scrollTop = ta.scrollTop; }
      ta.readOnly = !!st.busy; ta.classList.toggle('dim', !!st.busy);
      work.hidden = !st.busy; if (st.busy) $('[data-worktxt]').textContent = `${st.busy.kind} in the background…`;
      validate(d); drawStatus();
    }
    function select(id) {
      if (st.sel === id) return;
      if (st.busy) { OS.bg.cancel('json.work'); st.busy = null; }
      st.sel = id; st.typing = null; st.caret = { ln: 1, col: 1 }; st.infoFor = null;
      const ta = $('[data-text]'); if (ta) ta.scrollTop = 0;
      sync();
    }

    function register() {
      const d = cur(), u = topUndo();
      OS.responder(el, {
        new: { label: 'New Document', run: create },
        undo: { label: u ? u.label : 'Undo', enabled: () => !!shown() && !!topUndo() && !st.busy, run: undo },
        copy: { label: 'Copy Document', enabled: copyable, run: copyDoc },
        delete: { label: d && d.big ? 'Remove Document' : 'Delete Document', enabled: () => !!shown(), run: delDoc },
        find: { label: 'Find Documents…', run: () => { search.focus(); search.select(); } },
      });
    }
    function copyDoc() {
      const d = cur(); if (!copyable()) return;
      const r = OS.pasteboard.copy({ kind: check(d.text).ok ? 'json' : 'text', text: d.text, source: 'OneShot' });
      OS.ui.toast(`Copied “${d.name}”`, { icon: 'i-copy', sub: r.recorded ? 'Added to Clipboard history' : 'Not added to Clipboard history', ms: 3000 });
    }
    async function delDoc() {
      const d = shown(); if (!d) return;
      if (!(await OS.system.confirm(d.big ? `Remove “${d.name}”?` : `Delete “${d.name}”?`, d.big ? 'It was generated for this session and isn’t saved.' : 'The document is removed from JSON Studio. This can’t be undone.', d.big ? 'Remove' : 'Delete', true))) return;
      const v = visible(), i = v.findIndex((x) => x.id === d.id);
      removeDoc(d.id); delete undoStacks[d.id];
      const nv = visible(); st.sel = nv.length ? nv[Math.min(i, nv.length - 1)].id : null; st.infoFor = null; sync();
    }
    function create(o = {}) {
      const id = addDoc({ name: o.name || 'Untitled', text: o.text || '', source: o.source || 'Studio' });
      st.sel = id; st.q = st.applied = ''; search.value = ''; st.infoFor = null; sync();
      const t = $('[data-text]'); if (t) t.focus();
    }

    function sync() {
      if (!st.loaded || !el.isConnected) return;
      const all = docs();
      OS.ui.subtitle(`${all.length} document${all.length === 1 ? '' : 's'}`);
      if (!all.length) {
        st.built = false; register(); statusOff();
        return OS.ui.state(body, { kind: 'empty', title: 'No documents', body: `Format JSON in any app with ${OS.hotkey.label('json.format')} and it’s kept here, or start a new document. Documents stay until you delete them.`, detail: OS.store.path('json'), action: { label: 'New Document', run: () => create() } });
      }
      const v = visible();
      if (!v.length) {
        st.built = false; register(); statusOff();
        return OS.ui.state(body, { kind: 'nomatch', title: `No documents match “${st.applied.trim()}”`, body: 'Search looks at document names and text.', action: { label: 'Clear Search', run: () => { search.value = ''; search.oninput(); } } });
      }
      if (!cur() || !v.some((d) => d.id === st.sel)) { st.sel = v[0].id; st.infoFor = null; }
      const fresh = !st.built; build(); drawList(); drawEditor();
      if (fresh && !params.noFocus) $('.js-list').focus({ preventScroll: true });
    }
    function statusOff() { el.querySelectorAll('[data-run],[data-copy],[data-del]').forEach((x) => (x.disabled = true)); }

    /* keyboard: ↑/↓ move through documents, ↵ jumps into the text (not while typing) */
    el.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !st.built) return;
      const v = visible();
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && v.length) {
        e.preventDefault();
        const i = v.findIndex((d) => d.id === st.sel), n = Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        select(v[n].id); $('.js-list').focus({ preventScroll: true });
      } else if (e.key === 'Enter' && !e.target.closest('button') && cur()) { e.preventDefault(); $('[data-text]').focus(); }
    });
    /* G8: search runs in the background (latest wins) with an indicator */
    search.oninput = () => {
      st.q = search.value; sbusy.hidden = false; search.classList.add('busy');
      OS.bg('json.search', () => st.q).then((q) => { st.applied = q; sbusy.hidden = true; search.classList.remove('busy'); sync(); });
    };
    search.onkeydown = (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; search.oninput(); } };
    el.querySelectorAll('[data-run]').forEach((b) => (b.onclick = () => run(b.dataset.run)));
    el.querySelector('[data-copy]').onclick = copyDoc;
    el.querySelector('[data-del]').onclick = delDoc;

    function load() {
      st.loaded = false; st.built = false; statusOff(); OS.ui.subtitle('');
      body.innerHTML = '<div class="list js-list" data-skel></div><div class="detail js-ed"></div>';
      OS.ui.skeleton(body.querySelector('[data-skel]'), 5);
      OS.bg('json.load', () => !OS.scn('json.fail'), OS.scn('slow') ? 1800 : 260).then((ok) => {
        if (!el.isConnected) return;
        if (!ok) return OS.ui.state(body, { kind: 'failure', title: 'Couldn’t open JSON Studio', body: 'The document store didn’t respond. Nothing was changed or lost.', detail: `${OS.store.path('json')} · read failed`, action: { label: 'Try Again', run: load }, note: 'Repository actor read failed → store stays empty, no writes' });
        st.loaded = true;
        if (params.create) { const c = params.create; params.create = null; return create(typeof c === 'object' ? c : {}); }
        sync();
      });
    }
    OS.watch(el, 'change:json prefs', () => sync());
    OS.watch(el, 'scn', (k) => {
      if (k === 'json.fail') return load();
      if (k === 'json.large' && OS.scn('json.large') && st.loaded) { const b = bigDoc(); if (b) { search.value = ''; st.q = st.applied = ''; select(b.id); } return; }
      if (k === 'json.large' || k === 'json.empty') sync();
    });
    load();
  }

  OS.feature({
    id: 'json', name: 'JSON', icon: 'i-braces',
    about: 'Formats selected JSON in any app and keeps each run as a document in JSON Studio.',
    store: { count: (d) => d.docs.length, unit: 'documents', rule: () => 'Documents stay until you delete them' },
    seed: () => ({
      docs: [
        { id: 'doc-seed-1', name: 'Staging response', text: JSON.stringify({ service: 'status', ok: true, regions: ['us-east', 'eu-west'], latency: { p50: 42, p95: 118 } }, null, 2), source: 'TextEdit', at: Date.now() - 3600e3 },
        { id: 'doc-seed-2', name: 'Feature flags', text: '{"beta":true,"rollout":0.25,"groups":["staff","partners"]}', source: 'Clipboard', at: Date.now() - 86400e3 },
        { id: 'doc-seed-3', name: 'Broken webhook', text: '{\n  "event": "deploy",\n  "tags": ["api", "web",]\n}', source: 'TextEdit', at: Date.now() - 2 * 86400e3 },
      ],
    }),
    empty: () => ({ docs: [] }),
    init() {
      big = null;
      Object.keys(undoStacks).forEach((k) => delete undoStacks[k]);
      const d = OS.data.json; if (d && d.docs) d.docs = d.docs.filter((x) => x.id !== BIG_ID && !x.big);   // the large document is never stored
      OS.on('scn:json.large', (on) => { if (!on) { big = null; delete undoStacks[BIG_ID]; OS.emit('change:json', OS.data.json); } });
    },
    prefs: [
      { key: 'indent', label: 'Indent', type: 'select', options: [[2, '2 spaces'], [4, '4 spaces'], ['tab', 'Tab']], default: 2, effect: 'Formatted output, the pill and Studio’s Format use this indent.' },
      { key: 'sortKeys', label: 'Sort keys when formatting', type: 'toggle', default: false, effect: 'On: Formatted output lists object keys alphabetically. Minified keeps the original order.' },
    ],
    hotkeys: [{ id: 'format', label: 'Format selected JSON', default: '⌃⌥F', run: formatSelection }],
    scenarios: [{ key: 'large', label: 'Large document (2.4 MB)' }],
    view: { title: 'JSON Studio', mount: (el, params) => studio(el, Object.assign({}, params || {})) },
  });
})();
