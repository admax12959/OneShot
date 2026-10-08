/* JSON: Format pill (runtime) + JSON Studio (view). One source: OS.data.json.docs. Contract: SPEC.md */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;

  /* ---------- parsing with exact error position ---------- */
  function scan(t) {
    let i = 0;
    const E = (msg, p) => { throw { pos: p == null ? i : p, msg }; };
    const end = () => i >= t.length;
    const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
    const unexpected = () => (end() ? E('Unexpected end of input', t.length) : E('Unexpected character “' + t[i] + '”'));
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
          if (t[i] === '}') E('Trailing comma is not allowed');
          if (t[i] !== '"') end() ? unexpected() : E('Expected a property name in double quotes');
          str(); ws();
          if (t[i] !== ':') end() ? unexpected() : E('Expected “:” after the property name');
          i++; val(); ws();
          if (t[i] === ',') { i++; continue; }
          if (t[i] === '}') { i++; return; }
          end() ? unexpected() : E('Expected “,” or “}”');
        }
      }
      if (c === '[') {
        i++; ws();
        if (t[i] === ']') { i++; return; }
        for (;;) {
          ws();
          if (t[i] === ']') E('Trailing comma is not allowed');
          val(); ws();
          if (t[i] === ',') { i++; continue; }
          if (t[i] === ']') { i++; return; }
          end() ? unexpected() : E('Expected “,” or “]”');
        }
      }
      if (c === '"') return str();
      for (const lit of ['true', 'false', 'null']) if (t.startsWith(lit, i)) { i += lit.length; return; }
      const re = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y; re.lastIndex = i;
      const m = re.exec(t);
      if (m) { i += m[0].length; return; }
      unexpected();
    }
    val(); ws();
    if (!end()) E('Unexpected content after the JSON value');
  }
  function check(text) {
    try { scan(text); return { ok: true, value: JSON.parse(text) }; }
    catch (e) {
      if (e.pos == null) return { ok: false, line: 1, col: 1, msg: 'Not valid JSON' };
      const pos = Math.min(e.pos, text.length), before = text.slice(0, pos);
      return { ok: false, line: before.split('\n').length, col: pos - (before.lastIndexOf('\n') + 1) + 1, msg: e.msg };
    }
  }
  const errText = (r) => `Invalid JSON — line ${r.line}, column ${r.col}: ${r.msg}`;

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

  /* ---------- docs ---------- */
  const docs = () => OS.data.json.docs;
  const docById = (id) => docs().find((d) => d.id === id);
  function addDoc(o) {
    const d = Object.assign({ id: OS.id('doc'), at: OS.now() }, o);
    OS.commit('json', (s) => s.docs.unshift(d));
    return d.id;
  }
  function setDoc(id, patch) { OS.commit('json', () => { const d = docById(id); if (d) Object.assign(d, patch); }); }

  /* ---------- Format pill ---------- */
  function pillShell(el, o) {
    const pos = { x: o.x, y: o.y, above: o.above };
    OS.ui.float({ x: pos.x, y: pos.y, above: pos.above, el, cls: 'js-float', onClose: o.onClose, onKey: o.onKey });
  }
  const pillEl = () => h('<div class="js-pill"></div>');

  function failurePill(text, r, anchor, docKey) {
    const el = pillEl();
    el.innerHTML = `<div class="js-fail">${icon('i-x')}<div class="js-loc"><b>Invalid JSON — line ${r.line}, column ${r.col}:</b> ${esc(r.msg)}</div></div>
      <div class="js-acts"><span class="muted js-note">Text left unchanged</span><span class="js-sp"></span><button class="btn primary" data-open>${icon('i-braces', 's')}Open in Studio</button><span class="kbd">Esc</span></div>`;
    el.querySelector('[data-open]').onclick = () => {
      let doc = docs().find((d) => (docKey.clipId && d.clipId === docKey.clipId) || (!docKey.clipId && d.text === text && d.source === docKey.source));
      const id = doc ? doc.id : addDoc({ name: `${docKey.source} ${stamp()}`, text, source: docKey.source, clipId: docKey.clipId });
      OS.open('json', { select: id });
    };
    pillShell(el, anchor);
  }

  /* "Store fails to load": every runtime surface shows the same compact failure instead of data */
  function storeFailPill(retry, anchor) {
    const el = pillEl();
    const draw = () => OS.ui.state(el, { kind: 'failure', compact: true, title: 'Couldn’t load JSON', body: 'The local store didn’t respond. Nothing was lost.', action: { label: 'Try again', run: () => { if (OS.scn('json.fail')) OS.ui.toast('Still can’t reach the store', { icon: 'i-braces', ms: 2000 }); else { OS.ui.closeFloat(); retry(); } } } });
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
    let mode = 'Formatted', range = ctx.range, out = '';
    const doc = (() => {
      if (ctx.clipId) { const d = docs().find((x) => x.clipId === ctx.clipId); if (d) return d.id; }
      else if (ctx.kind === 'edit') {
        /* the same text formatted again from TextEdit (original or an earlier output) reuses its document */
        const d = docs().find((x) => x.source === ctx.source && !x.clipId && (x.orig === ctx.text || x.text === ctx.text));
        if (d) { if (!d.orig) setDoc(d.id, { orig: ctx.text }); return d.id; }
      }
      return addDoc({ name: `${ctx.source} ${stamp()}`, text: '', source: ctx.source, clipId: ctx.clipId, orig: ctx.kind === 'edit' ? ctx.text : undefined });
    })();
    const el = pillEl(), edit = ctx.kind === 'edit';
    el.innerHTML = `${edit ? '' : '<pre class="js-prev mono" data-prev></pre>'}
      <div class="js-acts"><div class="seg" data-seg>${MODES.map((m) => `<button data-m="${m}">${m}</button>`).join('')}</div><span class="js-sp"></span>
        ${edit ? `<button class="btn" data-undo>${icon('i-undo', 's')}Undo</button>` : `<button class="btn" data-copy>${icon('i-copy', 's')}Copy</button>`}
        <button class="btn primary" data-open>${icon('i-braces', 's')}Open in Studio</button></div>
      <div class="js-note muted" data-note></div>`;
    const ta = OS.host.textedit.el();
    const apply = (m) => {
      mode = m; out = render(parsed, m);
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
      ctx.anchorFn = () => { const c = OS.host.textedit.caret(range.end); return { x: c.x, y: c.y + c.lineHeight + 4, above: c.y }; };
      apply('Formatted');
      const a = ctx.anchorFn();
      pillShell(el, Object.assign(a, { onClose: () => ta.removeEventListener('input', typed) }));
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
    const ta = OS.host.textedit.el(), sel = OS.host.textedit.getSelection();
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
  function studio(el, params) {
    let sel = params.select || null, q = '', built = null;
    el.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search documents" data-q style="width:220px">
      <button class="btn" data-new>${icon('i-plus', 's')}New</button><span class="grow"></span><button class="btn danger" data-del>${icon('i-trash', 's')}Delete</button></div>
      <div class="split" data-body></div>`;
    const body = el.querySelector('[data-body]'), delBtn = el.querySelector('[data-del]');
    const visible = () => docs().filter((d) => !q || (d.name + ' ' + d.text).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.at - a.at);
    const cur = () => docById(sel);

    function skeleton() {
      if (built) return;
      body.innerHTML = `<div class="list js-list" tabindex="0" aria-label="Documents"></div><div class="detail js-ed">
        <div class="js-edh"><input class="field js-name" data-name aria-label="Document name"><span class="tag" data-valid></span></div>
        <textarea class="field mono js-text" data-text spellcheck="false" placeholder="Paste or type JSON"></textarea>
        <div class="js-acts"><button class="btn" data-fmt>${icon('i-format', 's')}Format</button><button class="btn" data-min>${icon('i-minify', 's')}Minify</button><button class="btn" data-sort>${icon('i-sort', 's')}Sort keys</button>
          <span class="muted js-fx" data-fx></span><span class="js-sp"></span><button class="btn" data-copy>${icon('i-copy', 's')}Copy</button></div></div>`;
      built = true;
      const name = body.querySelector('[data-name]'), ta = body.querySelector('[data-text]');
      name.oninput = () => cur() && setDoc(sel, { name: name.value });
      ta.oninput = () => cur() && setDoc(sel, { text: ta.value });
      const run = (mode) => { const d = cur(); const r = check(d.text); if (r.ok) setDoc(sel, { text: render(r.value, mode), at: OS.now() }); };
      body.querySelector('[data-fmt]').onclick = () => run('Formatted');
      body.querySelector('[data-min]').onclick = () => run('Minified');
      body.querySelector('[data-sort]').onclick = () => run('Sorted');
      body.querySelector('[data-copy]').onclick = () => {
        const d = cur(), ok = check(d.text).ok;
        const r = OS.pasteboard.copy({ kind: ok ? 'json' : 'text', text: d.text, source: 'OneShot' });
        OS.ui.toast('Copied', { sub: r.recorded ? 'Added to Clipboard history' : 'Not added to Clipboard history' });
      };
    }
    function drawList() {
      const list = body.querySelector('.js-list'); if (!list) return;
      const v = visible();
      list.innerHTML = v.length ? v.map((d) => { const r = check(d.text); return `<div class="row js-row ${d.id === sel ? 'sel' : ''}" data-id="${d.id}">${icon('i-braces', 's')}
        <div class="t"><div class="js-rn">${esc(d.name)}</div><div class="m">${esc(d.source)} · ${OS.ago(d.at)}</div></div>${d.text.trim() && !r.ok ? '<span class="tag bad">Invalid</span>' : ''}</div>`; }).join('')
        : '<div class="muted" style="padding:16px">No documents match.</div>';
      list.querySelectorAll('[data-id]').forEach((r) => (r.onclick = () => { sel = r.dataset.id; sync(); }));
      const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function drawEditor() {
      const d = cur(); if (!d) return;
      const name = body.querySelector('[data-name]'), ta = body.querySelector('[data-text]');
      if (document.activeElement !== name && name.value !== d.name) name.value = d.name;
      if (ta.value !== d.text) ta.value = d.text;
      const blank = !d.text.trim(), r = check(d.text), tag = body.querySelector('[data-valid]');
      tag.className = 'tag ' + (blank ? '' : r.ok ? 'ok' : 'bad');
      tag.textContent = blank ? 'Empty' : r.ok ? 'Valid' : `Invalid · line ${r.line} col ${r.col}`;
      tag.title = blank || r.ok ? '' : r.msg;
      body.querySelectorAll('[data-fmt],[data-min],[data-sort]').forEach((b) => (b.disabled = !r.ok));
      body.querySelector('[data-copy]').disabled = blank;
      body.querySelector('[data-fx]').textContent = r.ok ? `Format: ${modeFx('Formatted')}` : blank ? '' : r.msg;
    }
    function sync() {
      if (!docs().length) {
        built = null; delBtn.disabled = true;
        return OS.ui.state(body, { kind: 'empty', title: 'No JSON documents', body: 'Format JSON in any app and it shows up here, or start a new document.', action: { label: 'New document', run: create } });
      }
      if (!cur()) sel = (visible()[0] || docs()[0]).id;
      delBtn.disabled = false;
      const fresh = !built; skeleton(); drawList(); drawEditor();
      if (fresh && !params.noFocus) body.querySelector('.js-list').focus({ preventScroll: true });
    }
    function create() {
      const id = addDoc({ name: 'Untitled', text: '', source: 'Studio' });
      sel = id; q = ''; el.querySelector('[data-q]').value = ''; sync();
      const t = body.querySelector('[data-text]'); if (t) t.focus();
    }
    /* keyboard: ↑/↓ move through documents, ↵ jumps to the editor (not while typing) */
    el.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !built) return;
      const v = visible();
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && v.length) {
        e.preventDefault();
        const i = v.findIndex((d) => d.id === sel), n = Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        sel = v[n].id; sync(); body.querySelector('.js-list').focus({ preventScroll: true });
      } else if (e.key === 'Enter' && !e.target.closest('button') && cur()) { e.preventDefault(); body.querySelector('[data-text]').focus(); }
    });
    el.querySelector('[data-q]').oninput = (e) => { q = e.target.value; drawList(); };
    el.querySelector('[data-new]').onclick = create;
    delBtn.onclick = async () => {
      const d = cur(); if (!d) return;
      if (!(await OS.system.confirm(`Delete “${d.name}”?`, 'This document is removed from JSON Studio.', 'Delete', true))) return;
      const i = visible().findIndex((x) => x.id === d.id);
      OS.commit('json', (s) => (s.docs = s.docs.filter((x) => x.id !== d.id)));
      const v = visible(); sel = v.length ? v[Math.min(i, v.length - 1)].id : null; sync();
    };
    OS.watch(el, 'change:json prefs', () => { if (!built && docs().length) built = null; sync(); });
    sync();
  }

  OS.feature({
    id: 'json', name: 'JSON', icon: 'i-braces',
    seed: () => ({
      docs: [
        { id: 'doc-seed-1', name: 'Staging response', text: JSON.stringify({ service: 'status', ok: true, regions: ['us-east', 'eu-west'], latency: { p50: 42, p95: 118 } }, null, 2), source: 'TextEdit', at: Date.now() - 3600e3 },
        { id: 'doc-seed-2', name: 'Feature flags', text: '{"beta":true,"rollout":0.25,"groups":["staff","partners"]}', source: 'Clipboard', at: Date.now() - 86400e3 },
        { id: 'doc-seed-3', name: 'Broken webhook', text: '{"event":"deploy","tags":["api","web",]}', source: 'TextEdit', at: Date.now() - 2 * 86400e3 },
      ],
    }),
    empty: () => ({ docs: [] }),
    prefs: [
      { key: 'indent', label: 'Indent', type: 'select', options: [[2, '2 spaces'], [4, '4 spaces'], ['tab', 'Tab']], default: 2, effect: 'Formatted output and Studio’s Format use this indent.' },
      { key: 'sortKeys', label: 'Sort keys when formatting', type: 'toggle', default: false, effect: 'On: Formatted output lists object keys alphabetically. Minified keeps the original order.' },
    ],
    hotkeys: [{ id: 'format', label: 'Format selected JSON', default: '⌃⌥F', run: formatSelection }],
    view: { title: 'JSON Studio', mount: (el, params) => OS.ui.load(el, 'json', (e) => studio(e, params || {})) },
  });
})();
