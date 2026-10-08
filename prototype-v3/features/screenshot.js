/* Screenshot feature. Data: OS.data.screenshot.shots[]. Capture / editor / recording runtime and the history view read the same data. */
(function () {
  const { esc, h } = OS;
  const DAY = 864e5;
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} at ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}`; };
  const dur = (s) => `${Math.floor(s / 60)}:${p2(s % 60)}`;
  const ago = (d) => OS.now() - d * DAY;
  const shotAt = (d, ext, name) => `~/Desktop/${name} ${stamp(ago(d))}.${ext}`;
  const RED = '#ff3b30';
  let rec = null;       // active recording {rect, start, snap, frame}

  OS.feature({
    id: 'screenshot', name: 'Screenshot', icon: 'i-shot',
    seed: () => ({
      shots: [
        { id: 'sh1', kind: 'image', rect: { x: 36, y: 72, w: 560, h: 300 }, marks: [{ t: 'rect', x: 18, y: 56, w: 300, h: 44 }, { t: 'text', x: 330, y: 84, s: 'Fix this' }], ocr: 'Release notes — draft\nShip the status endpoint before Friday.', format: 'PNG', path: shotAt(1, 'png', 'Screenshot'), duration: null, at: ago(1) },
        { id: 'sh2', kind: 'recording', rect: { x: 640, y: 100, w: 640, h: 440 }, marks: [], ocr: '', format: 'MOV', path: shotAt(3, 'mov', 'Recording'), duration: 12, at: ago(3) },
        { id: 'sh3', kind: 'image', rect: { x: 640, y: 72, w: 640, h: 300 }, marks: [{ t: 'arrow', x1: 120, y1: 230, x2: 300, y2: 150 }], ocr: 'GitHub\nSign in to GitHub\nUse your GitHub account.', format: 'PNG', path: shotAt(12, 'png', 'Screenshot'), duration: null, at: ago(12) },
        { id: 'sh4', kind: 'image', rect: { x: 36, y: 300, w: 560, h: 240 }, marks: [], ocr: 'copy the staging URL: https://status.acme.io/health', format: 'JPG', path: shotAt(20, 'jpg', 'Screenshot'), duration: null, at: ago(20) },
      ],
    }),
    empty: () => ({ shots: [] }),
    prefs: [
      { key: 'after', label: 'After capture', type: 'select', options: [['edit', 'Edit'], ['copy', 'Copy'], ['save', 'Save']], default: 'edit', effect: 'Edit opens the editor after you select an area; Copy and Save skip it and finish right away.' },
      { key: 'format', label: 'File format', type: 'select', options: [['PNG', 'PNG'], ['JPG', 'JPG']], default: 'PNG', effect: 'Sets the file extension of saved captures and the format label in history.' },
      { key: 'folder', label: 'Save folder', type: 'select', options: [['~/Desktop', '~/Desktop'], ['~/Documents', '~/Documents'], ['~/Downloads', '~/Downloads'], ['~/Pictures', '~/Pictures'], ['~/Pictures/Screenshots', '~/Pictures/Screenshots']], default: '~/Desktop', effect: 'New captures are saved here and the path shows in the toast and in history.' },
      { key: 'retention', label: 'Keep captures', type: 'select', options: [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'Forever']], default: 30, effect: 'Captures older than this are removed from history.' },
    ],
    hotkeys: [
      { id: 'capture', label: 'Capture region', default: '⌃⌥A', run: () => start('capture') },
      { id: 'record', label: 'Record region', default: '⌃⌥R', run: () => start('record') },
      { id: 'ocr', label: 'Extract text', default: '⌃⌥O', run: () => start('ocr') },
    ],
    scenarios: [{ key: 'diskFull', label: 'Disk is full (saving fails)' }],
    menubar: {
      icon: 'i-shot', order: 10,
      label: () => (rec ? '● ' + dur(recSecs()) : ''),
      cls: () => (rec ? 'rec' : ''),
      render: (el) => {
        const hk = (id) => OS.hotkey.label('screenshot.' + id);
        const draw = () => {
          el.innerHTML = `<div class="menu">${rec ? `<button data-a="stop">${OS.ui.icon('i-x', 's')}Stop recording<span class="r muted">${dur(recSecs())}</span></button><hr>` : ''}
            <button data-m="capture">${OS.ui.icon('i-crop', 's')}Capture region<span class="kbd">${esc(hk('capture'))}</span></button>
            ${rec ? '' : `<button data-m="record">${OS.ui.icon('i-video', 's')}Record region<span class="kbd">${esc(hk('record'))}</span></button>`}
            <button data-m="ocr">${OS.ui.icon('i-ocr', 's')}Extract text<span class="kbd">${esc(hk('ocr'))}</span></button><hr>
            <button data-a="history">${OS.ui.icon('i-history', 's')}Open history</button></div>`;
          el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { OS.closePopover(); setTimeout(() => start(b.dataset.m), 0); }));
          const st = el.querySelector('[data-a=stop]'); if (st) st.onclick = () => { OS.closePopover(); stopRec(); };
          el.querySelector('[data-a=history]').onclick = () => { OS.closePopover(); OS.open('screenshot'); };
        };
        draw(); OS.watch(el, 'tick prefs', draw);
      },
    },
    view: { title: 'Screenshot', mount: (el, params) => mountView(el, params || {}) },
    init,
  });

  const data = () => OS.data.screenshot;
  const find = (id) => data().shots.find((s) => s.id === id);
  const recSecs = () => (rec ? Math.max(0, Math.floor((Date.now() - rec.start) / 1000)) : 0);

  function prune() {
    const days = OS.pref('screenshot.retention'); if (!days) return;
    const cut = OS.now() - days * DAY;
    if (data().shots.some((s) => s.at < cut)) OS.commit('screenshot', (d) => { d.shots = d.shots.filter((s) => s.at >= cut); });
  }
  function init() {
    OS.provide('screenshot.thumb', ({ shotId, width }) => { const s = find(shotId); return s ? thumb(s, width) : null; });
    OS.on('tick', () => { if (rec) OS.menubar.refresh(); prune(); });
    OS.on('pref:screenshot.retention', prune);
    window.addEventListener('keydown', (e) => { if (rec && e.key === 'Escape' && !e.defaultPrevented) stopRec(); });
    prune();
  }

  /* ---------- marks ---------- */
  function markSvg(m) {
    if (m.t === 'arrow') {
      const a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1), L = 15, hd = (d) => `${(m.x2 - L * Math.cos(a + d)).toFixed(1)},${(m.y2 - L * Math.sin(a + d)).toFixed(1)}`;
      return `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${RED}" stroke-width="3" stroke-linecap="round"/><polygon points="${m.x2},${m.y2} ${hd(0.45)} ${hd(-0.45)}" fill="${RED}"/>`;
    }
    if (m.t === 'rect') return `<rect x="${m.x}" y="${m.y}" width="${m.w}" height="${m.h}" rx="3" fill="none" stroke="${RED}" stroke-width="3"/>`;
    return `<text x="${m.x}" y="${m.y}" fill="${RED}" font-size="18" font-weight="700" font-family="-apple-system,Helvetica,sans-serif" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(m.s)}</text>`;
  }
  const marksSvg = (marks) => marks.map(markSvg).join('');
  function thumb(s, width) {
    if (!s.snap) s.snap = OS.desk.snapshot();
    const v = OS.desk.view(s.snap, s.rect, width);
    if (s.marks && s.marks.length) v.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${s.rect.w} ${s.rect.h}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none">${marksSvg(s.marks)}</svg>`);
    return v;
  }

  /* ---------- entry ---------- */
  function start(mode) {
    if (rec) { if (mode === 'record') stopRec(); else OS.ui.toast('Stop the recording first', { icon: 'i-video', sub: 'Use the menubar or press Esc.', ms: 2500 }); return; }
    if (!OS.perm.has('screen')) return gate(mode);
    select(mode);
  }
  const swallow = (e) => e.ctrlKey || e.altKey || e.metaKey;
  function gate(mode) {
    const el = h('<div class="ss-gate"><div class="ss-card"></div></div>'), card = el.firstChild;
    OS.ui.grant(card, 'screen', 'Capturing, recording and reading text from the screen needs Screen Recording.');
    card.querySelector('.state').insertAdjacentHTML('beforeend', '<button class="btn ghost" data-cancel>Not now</button>');
    card.querySelector('[data-cancel]').onclick = () => OS.ui.overlay.close();
    el.onmousedown = (e) => { if (e.target === el) OS.ui.overlay.close(); };
    OS.watch(card, 'perm', () => { if (OS.perm.has('screen')) select(mode); });
    OS.ui.overlay.open(el, { onKey: swallow });
  }

  const LABEL = { capture: 'Drag to capture an area', record: 'Drag to choose the area to record', ocr: 'Drag over the text to read' };
  function select(mode) {
    const snap = OS.desk.snapshot();
    const el = h(`<div class="ss-sel"><div class="ss-hint">${LABEL[mode]} · <span class="kbd">esc</span> to cancel</div><div class="ss-box" hidden><span class="ss-size"></span></div></div>`);
    const box = el.querySelector('.ss-box'), size = el.querySelector('.ss-size');
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; e.preventDefault();
      const sr = OS.$('#screen').getBoundingClientRect(), x0 = e.clientX - sr.left, y0 = e.clientY - sr.top;
      const geo = (ev) => {
        const x1 = Math.max(0, Math.min(1440, ev.clientX - sr.left)), y1 = Math.max(28, Math.min(900, ev.clientY - sr.top));
        return { x: Math.round(Math.min(x0, x1)), y: Math.round(Math.max(28, Math.min(y0, y1))), w: Math.round(Math.abs(x1 - x0)), h: Math.round(Math.abs(y1 - Math.max(28, y0))) };
      };
      const paint = (r) => { box.hidden = false; el.classList.add('drag'); Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); size.textContent = `${r.w} × ${r.h}`; };
      const mv = (ev) => paint(geo(ev));
      const up = (ev) => {
        document.removeEventListener('mousemove', mv);
        const r = geo(ev);
        if (r.w < 10 || r.h < 10) { box.hidden = true; el.classList.remove('drag'); return; }
        afterSelect(mode, r, snap);
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up, { once: true });
    });
    OS.ui.overlay.open(el, { onKey: swallow });
  }

  function afterSelect(mode, rect, snap) {
    if (mode === 'record') return startRec(rect, snap);
    const draft = { id: OS.id('shot'), kind: 'image', rect, marks: [], ocr: '', format: OS.pref('screenshot.format'), path: null, duration: null, at: OS.now(), snap };
    if (mode === 'ocr') return editor(draft, { ocrOnly: true });
    const a = OS.pref('screenshot.after');
    if (a === 'copy') return copyClose(draft);
    if (a === 'save') return trySave(draft, (ok, err) => (ok ? null : editor(draft, { err })), true);
    editor(draft);
  }

  /* ---------- actions shared by editor, direct modes and history ---------- */
  function addShot(s) { OS.commit('screenshot', (d) => { d.shots.push(s); }); prune(); }
  function copyShot(s) {
    const { w, h: hh } = s.rect;
    const r = OS.pasteboard.copy({ kind: 'image', text: `Screenshot ${w}×${hh}`, image: { w, h: hh, shotId: s.id }, source: 'Screenshot' });
    if (r.recorded) OS.ui.toast('Copied to clipboard', { sub: 'Added to Clipboard history', action: { label: 'Open', run: () => { OS.ui.overlay.close(); OS.open('clipboard', { select: r.clipId }); } } });
    else OS.ui.toast('Copied to clipboard', { sub: 'Not added to Clipboard history', action: { label: 'Open', run: () => { OS.ui.overlay.close(); OS.open('screenshot', { select: s.id }); } } });
    return r;
  }
  function copyClose(draft) {
    OS.ui.overlay.close(); draft.at = OS.now(); addShot(draft); copyShot(draft);
  }
  /* save: simulated write; fails under the diskFull scenario */
  function trySave(draft, done, direct) {
    const folder = OS.pref('screenshot.folder'), path = `${folder}/Screenshot ${stamp(OS.now())}.${draft.format.toLowerCase()}`;
    setTimeout(() => {
      if (OS.scn('screenshot.diskFull')) {
        const msg = 'Couldn’t save — the disk is full. Nothing was written.';
        OS.ui.toast('Couldn’t save the capture', { icon: 'i-x', sub: 'The disk is full.', ms: 5000 });
        return done(false, msg);
      }
      OS.ui.overlay.close(); draft.path = path; draft.at = OS.now(); addShot(draft);
      OS.ui.toast('Saved to ' + folder, { sub: path.split('/').pop(), action: { label: 'Show in history', run: () => OS.open('screenshot', { select: draft.id }) } });
      done(true);
    }, 450);
  }

  /* ---------- editor ---------- */
  function editor(draft, opt = {}) {
    const r = draft.rect;
    const ed = { tool: 'arrow', busy: false, err: opt.err || '', ocr: null, alive: true, input: null };
    const el = h('<div class="ss-ed"></div>');
    const box = h(`<div class="ss-region" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"></div>`);
    box.appendChild(OS.desk.view(draft.snap, r, r.w));
    const svg = h(`<svg class="ss-marks" viewBox="0 0 ${r.w} ${r.h}" width="${r.w}" height="${r.h}"></svg>`);
    box.appendChild(svg);
    const tb = h('<div class="ss-tb"></div>'), panel = h('<div class="ss-panel" hidden></div>');
    el.append(box, tb, panel);
    const drawMarks = (live) => { svg.innerHTML = marksSvg(draft.marks) + (live ? markSvg(live) : ''); };

    function place() {
      const tw = tb.offsetWidth, th = tb.offsetHeight;
      let y = r.y + r.h + 10; if (y + th > 892) y = r.y - th - 10; if (y < 34) y = r.y + r.h - th - 8;
      tb.style.left = Math.max(8, Math.min(r.x, 1432 - tw)) + 'px'; tb.style.top = y + 'px';
      if (!panel.hidden) {
        const pw = panel.offsetWidth, ph = panel.offsetHeight, tl = parseFloat(tb.style.left), tt = y;
        let px = tl, py = tt + th + 8;
        if (tt < r.y) { py = r.y + r.h + 10; }                       // toolbar above the region: panel goes below it
        if (py + ph > 892) { px = r.x + r.w + 12; py = 34; if (px + pw > 1432) px = Math.max(8, r.x - pw - 12); }
        panel.style.left = Math.max(8, Math.min(px, 1432 - pw)) + 'px'; panel.style.top = py + 'px';
      }
    }
    function redraw() {
      const T = (id, ic, l) => `<button data-tool="${id}" aria-pressed="${ed.tool === id}">${OS.ui.icon(ic, 's')}${l}</button>`;
      tb.innerHTML = opt.ocrOnly
        ? `<div class="ss-bar"><span class="tag">${r.w} × ${r.h}</span><span class="muted">Reading text</span><button class="btn primary" data-a="cancel">Close</button></div>`
        : `<div class="ss-bar"><span class="tag">${r.w} × ${r.h}</span>
            <div class="seg">${T('arrow', 'i-arrow', 'Arrow')}${T('rect', 'i-rect', 'Rectangle')}${T('text', 'i-type', 'Text')}</div>
            <button class="btn" data-a="undo" ${draft.marks.length && !ed.busy ? '' : 'disabled'}>${OS.ui.icon('i-undo', 's')}Undo</button><span class="ss-sep"></span>
            <button class="btn" data-a="ocr" ${ed.busy ? 'disabled' : ''}>${OS.ui.icon('i-ocr', 's')}OCR</button>
            <button class="btn" data-a="save" ${ed.busy ? 'disabled' : ''}>${OS.ui.icon('i-save', 's')}${ed.busy ? 'Saving…' : 'Save'}</button>
            <button class="btn primary" data-a="copy" ${ed.busy ? 'disabled' : ''}>${OS.ui.icon('i-copy', 's')}Copy &amp; Close</button>
            <button class="btn ghost" data-a="cancel">Cancel</button></div>` +
          (ed.err ? `<div class="ss-err">${OS.ui.icon('i-x', 's')}${esc(ed.err)}</div>` : '');
      place();
    }
    tb.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      commitInput();
      if (b.dataset.tool) { ed.tool = b.dataset.tool; return redraw(); }
      const a = b.dataset.a;
      if (a === 'undo') { draft.marks.pop(); drawMarks(); redraw(); }
      else if (a === 'cancel') OS.ui.overlay.close();
      else if (a === 'ocr') runOcr();
      else if (a === 'copy') copyClose(draft);
      else if (a === 'save') { ed.busy = true; ed.err = ''; redraw(); trySave(draft, (ok, err) => { if (!ed.alive) return; ed.busy = false; ed.err = err || ''; redraw(); }); }
    };

    /* drawing */
    function openInput(p) {
      const inp = h('<input class="ss-ti" placeholder="Type, then press Enter" spellcheck="false">');
      inp.style.left = p.x + 'px'; inp.style.top = Math.max(0, p.y - 13) + 'px';
      box.appendChild(inp); ed.input = { inp, p }; inp.focus();
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commitInput(); } };
      inp.onblur = () => commitInput();
    }
    function commitInput() {
      if (!ed.input) return; const { inp, p } = ed.input; ed.input = null;
      const s = inp.value.trim(); inp.remove();
      if (s) { draft.marks.push({ t: 'text', x: p.x, y: p.y + 6, s }); drawMarks(); redraw(); }
    }
    svg.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); commitInput();
      const b = svg.getBoundingClientRect(), pt = (ev) => ({ x: Math.round(ev.clientX - b.left), y: Math.round(ev.clientY - b.top) }), p0 = pt(e);
      if (ed.tool === 'text') return openInput(p0);
      const mk = (p) => (ed.tool === 'arrow' ? { t: 'arrow', x1: p0.x, y1: p0.y, x2: p.x, y2: p.y } : { t: 'rect', x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) });
      const mv = (ev) => drawMarks(mk(pt(ev)));
      const up = (ev) => {
        document.removeEventListener('mousemove', mv);
        const m = mk(pt(ev));
        if (m.t === 'arrow' ? Math.hypot(m.x2 - m.x1, m.y2 - m.y1) > 6 : m.w > 4 && m.h > 4) draft.marks.push(m);
        drawMarks(); redraw();
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up, { once: true });
    });

    /* OCR */
    function drawPanel() {
      const o = ed.ocr;
      if (!o) { panel.hidden = true; return; }
      panel.hidden = false;
      panel.innerHTML = `<div class="ss-ph"><b>Text in this area</b><button class="btn icon ghost" data-x title="Close">${OS.ui.icon('i-x', 's')}</button></div><div class="ss-pb"></div>`;
      const body = panel.querySelector('.ss-pb');
      if (o.loading) OS.ui.state(body, { kind: 'loading', compact: true, title: 'Reading text…', body: 'This takes a moment.' });
      else if (!o.text) OS.ui.state(body, { kind: 'empty', compact: true, title: 'No text found', body: 'Nothing readable in this area. Try a larger selection.' });
      else {
        body.innerHTML = `<pre class="ss-otxt mono"></pre><div class="ss-pf"><button class="btn primary" data-copytext>${OS.ui.icon('i-copy', 's')}Copy text</button></div>`;
        body.querySelector('pre').textContent = o.text;
        body.querySelector('[data-copytext]').onclick = () => {
          const rr = OS.pasteboard.copy({ kind: 'text', text: o.text, source: 'Screenshot' });
          OS.ui.toast('Text copied', rr.recorded
            ? { sub: 'Added to Clipboard history', action: { label: 'Open', run: () => { OS.ui.overlay.close(); OS.open('clipboard', { select: rr.clipId }); } } }
            : { sub: 'Not added to Clipboard history' });
        };
      }
      panel.querySelector('[data-x]').onclick = () => { ed.ocr = null; drawPanel(); };
      place();
    }
    function runOcr() {
      ed.ocr = { loading: true }; drawPanel();
      setTimeout(() => {
        if (!ed.alive || !ed.ocr) return;
        const c = OS.desk.toClient(r.x, r.y);
        const text = OS.host.textInRect({ left: c.x, top: c.y, right: c.x + r.w, bottom: c.y + r.h }).trim();
        draft.ocr = text; ed.ocr = { text }; drawPanel();
      }, OS.scn('slow') ? 2400 : 900);
    }

    OS.ui.overlay.open(el, {
      onKey: (e) => {
        if (ed.input && e.key === 'Escape') { const { inp } = ed.input; ed.input = null; inp.remove(); return true; }
        return swallow(e);
      },
      onClose: () => { ed.alive = false; },
    });
    drawMarks(); redraw();
    if (opt.ocrOnly) runOcr();
  }

  /* ---------- recording ---------- */
  function startRec(rect, snap) {
    OS.ui.overlay.close();
    const frame = h(`<div class="ss-recframe" style="left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px"></div>`);
    OS.$('#screen').appendChild(frame);
    rec = { rect, snap, start: Date.now(), frame };
    OS.menubar.refresh();
    OS.ui.toast('Recording', { icon: 'i-video', sub: 'Stop from the menubar or press Esc.', ms: 2600 });
  }
  function stopRec() {
    if (!rec) return;
    const r = rec; rec = null; r.frame.remove();
    const secs = Math.max(1, Math.round((Date.now() - r.start) / 1000));
    const s = { id: OS.id('shot'), kind: 'recording', rect: r.rect, marks: [], ocr: '', format: 'MOV', path: `${OS.pref('screenshot.folder')}/Recording ${stamp(OS.now())}.mov`, duration: secs, at: OS.now(), snap: r.snap };
    addShot(s); OS.menubar.refresh();
    OS.ui.toast('Recording saved', { icon: 'i-video', sub: `${dur(secs)} · ${s.path.split('/').pop()}`, action: { label: 'Open', run: () => OS.open('screenshot', { select: s.id }) } });
  }

  /* ---------- history view ---------- */
  function mountView(el, params) {
    OS.ui.load(el, 'screenshot', (root) => {
      let first = true, q = '', kind = 'all', sel = params.select && find(params.select) ? params.select : null, scrollTo = !!sel;
      root.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search text or path" style="width:220px">
        <div class="seg" data-kind>${[['all', 'All'], ['image', 'Images'], ['recording', 'Recordings']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
        <span class="grow"></span><button class="btn primary" data-cap>${OS.ui.icon('i-crop', 's')}Capture</button></div><div class="split"></div>`;
      const split = root.querySelector('.split'), cap = root.querySelector('[data-cap]');
      root.querySelector('.search').oninput = (e) => { q = e.target.value; draw(); };
      root.querySelectorAll('[data-kind] button').forEach((b) => (b.onclick = () => { kind = b.dataset.v; draw(); }));
      cap.onclick = () => start('capture');
      const visible = () => {
        const f = q.trim().toLowerCase();
        return data().shots.slice().sort((a, b) => b.at - a.at).filter((s) => (kind === 'all' || s.kind === kind) && (!f || (s.ocr || '').toLowerCase().includes(f) || (s.path || '').toLowerCase().includes(f)));
      };
      function copyPrimary(s) {
        if (s.kind === 'recording') { const rr = OS.pasteboard.copy({ kind: 'text', text: s.path, source: 'Screenshot' }); OS.ui.toast('Path copied', { sub: rr.recorded ? 'Added to Clipboard history' : 'Not added to Clipboard history', ms: 2500 }); }
        else copyShot(s);
      }
      /* keyboard: ↑↓ move by row, ←→ by tile, ↵ copies the selected capture (not while typing) */
      root.addEventListener('keydown', (e) => {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
        const l = visible(), grid = split.querySelector('.ss-grid');
        if (e.key === 'Enter' && !e.target.closest('button')) { const s = sel && find(sel); if (s) { e.preventDefault(); copyPrimary(s); } return; }
        const d = { ArrowDown: 'v', ArrowUp: 'v', ArrowRight: 'h', ArrowLeft: 'h' }[e.key];
        if (!d || !l.length || !grid) return;
        e.preventDefault();
        const tiles = [...grid.querySelectorAll('.ss-tile')];
        const cols = Math.max(1, tiles.filter((t) => t.offsetTop === (tiles[0] ? tiles[0].offsetTop : 0)).length);
        const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight', step = d === 'v' ? cols : 1;
        const i = Math.max(0, l.findIndex((x) => x.id === sel)), n = Math.max(0, Math.min(l.length - 1, i + (fwd ? step : -step)));
        sel = l[n].id; scrollTo = true; draw(); split.querySelector('.ss-grid').focus({ preventScroll: true });
      });
      function draw() {
        root.querySelectorAll('[data-kind] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === kind));
        cap.innerHTML = `${OS.ui.icon('i-crop', 's')}Capture <span class="kbd">${esc(OS.hotkey.label('screenshot.capture'))}</span>`;
        if (!data().shots.length) {
          split.innerHTML = '<div class="cb-empty" style="flex:1;display:flex"></div>';
          OS.ui.state(split.firstChild, { kind: 'empty', title: 'No captures yet', body: `Press ${OS.hotkey.label('screenshot.capture')} to capture a region.`, action: { label: 'Capture', run: () => start('capture') } });
          return;
        }
        const l = visible();
        if (!l.some((s) => s.id === sel)) sel = l[0] ? l[0].id : null;
        const old = split.querySelector('.ss-grid'), top = old ? old.scrollTop : 0, hadFocus = !!old && old.contains(document.activeElement);
        split.innerHTML = '<div class="ss-grid"></div><div class="pane ss-pane"></div>';
        const grid = split.querySelector('.ss-grid'), pane = split.querySelector('.ss-pane');
        grid.tabIndex = 0; grid.setAttribute('aria-label', 'Capture history');
        if (!l.length) { grid.style.display = 'flex'; OS.ui.state(grid, { kind: 'empty', compact: true, title: 'No matches', body: 'Change the search or the filter.' }); }
        else {
          grid.innerHTML = l.map((s) => `<button class="ss-tile ${s.id === sel ? 'sel' : ''}" data-id="${s.id}"><div class="ss-tt"></div>
            <div class="ss-tm"><span>${OS.ui.icon(s.kind === 'recording' ? 'i-video' : 'i-image', 's')}${s.kind === 'recording' ? 'Recording · ' + dur(s.duration) : `${s.rect.w}×${s.rect.h} · ${esc(s.format)}`}</span><span class="muted">${OS.ago(s.at)}</span></div></button>`).join('');
          grid.querySelectorAll('.ss-tile').forEach((t) => {
            const s = find(t.dataset.id), tt = t.querySelector('.ss-tt');
            tt.appendChild(thumb(s, 168));
            if (s.kind === 'recording') tt.insertAdjacentHTML('beforeend', `<span class="ss-play">${OS.ui.icon('i-play', 's')}${dur(s.duration)}</span>`);
            t.onclick = () => { sel = s.id; draw(); };
          });
          grid.scrollTop = top;
          if (scrollTo) { const t = grid.querySelector('.ss-tile.sel'); if (t) t.scrollIntoView({ block: 'nearest' }); scrollTo = false; }
        }
        drawPane(pane);
        if (first || hadFocus) grid.focus({ preventScroll: true });
        first = false;
      }
      function drawPane(pane) {
        const s = sel && find(sel);
        if (!s) { OS.ui.state(pane, { kind: 'empty', compact: true, title: 'Nothing selected', body: 'Pick a capture to see it here.' }); return; }
        pane.innerHTML = `<div class="ss-pv"></div>
          <dl class="kv" style="grid-template-columns:84px 1fr"><dt>Type</dt><dd>${s.kind === 'recording' ? 'Recording · ' + dur(s.duration) : 'Image'}</dd><dt>Size</dt><dd>${s.rect.w} × ${s.rect.h}</dd><dt>Format</dt><dd>${esc(s.format)}</dd>
            <dt>Taken</dt><dd>${esc(new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</dd>
            <dt>Saved to</dt><dd class="mono" style="font-size:11.5px">${s.path ? esc(s.path) : '<span class="muted">Not saved to a file</span>'}</dd>
            ${s.ocr ? `<dt>Text</dt><dd class="ss-otxt-s">${esc(s.ocr)}</dd>` : ''}</dl>
          <div class="cb-acts"><button class="btn primary" data-a="copy">${OS.ui.icon('i-copy', 's')}${s.kind === 'recording' ? 'Copy path' : 'Copy'}</button>
            ${s.path ? `<button class="btn" data-a="reveal">${OS.ui.icon('i-file', 's')}Reveal</button>` : ''}
            <button class="btn danger" data-a="del">${OS.ui.icon('i-trash', 's')}Delete</button></div>`;
        pane.querySelector('.ss-pv').appendChild(thumb(s, 268));
        pane.querySelector('[data-a=copy]').onclick = () => {
          copyPrimary(s);
        };
        const rv = pane.querySelector('[data-a=reveal]'); if (rv) rv.onclick = () => OS.ui.toast('Showing in Finder', { icon: 'i-file', sub: s.path, ms: 3000 });
        pane.querySelector('[data-a=del]').onclick = () => OS.commit('screenshot', (d) => { d.shots = d.shots.filter((k) => k.id !== s.id); });
      }
      OS.watch(root, 'change:screenshot prefs clock', draw);
      draw();
    });
  }
})();
