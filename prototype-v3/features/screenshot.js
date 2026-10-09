/* Screenshot feature (v3). Data: OS.data.screenshot.shots[]. Capture / editor / recording runtime and the history
   view read the same data. v3: coordinated atomic saves with progress and failures (G9), retention as a store rule (G1),
   Screen Recording states via OS.ui.grant (G5), background search + skeleton (G8), responder actions (G10). */
(function () {
  const { esc, h } = OS, icon = OS.ui.icon;
  const DAY = 864e5;
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} at ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}`; };
  const dur = (s) => `${Math.floor(s / 60)}:${p2(s % 60)}`;
  const ago = (d) => OS.now() - d * DAY;
  const fileName = (kind, ext, t) => `${kind === 'recording' ? 'Recording' : 'Screenshot'} ${stamp(t)}.${ext}`;
  const shotAt = (d, ext, kind) => `~/Desktop/${fileName(kind, ext, ago(d))}`;
  const folderName = (f) => f.split('/').pop();
  const fallbackFor = (f) => (f === '~/Desktop' ? '~/Pictures' : '~/Desktop');
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const RED = '#ff3b30';
  /* toasts with an action put the button on its own row so long file names stay readable */
  const toast = (text, o = {}) => { const t = OS.ui.toast(text, o); if (o.action && o.action.label.length > 6) t.classList.add('ss-toast'); return t; };
  let rec = null;        // active recording {rect, start, snap, frame}
  let lastPrune = null;  // {n, days, at} for the history footer line

  const retention = () => OS.pref('screenshot.retention');
  const ruleText = () => (retention() ? `Keeps captures for ${retention()} days` : 'Keeps captures until you delete them');
  const keptText = () => (retention() ? `kept for ${retention()} days` : 'kept until you delete them');

  OS.feature({
    id: 'screenshot', name: 'Screenshot', icon: 'i-shot',
    about: 'Captures, annotates, records and reads text from a region of the screen.',
    store: { count: (d) => d.shots.length, unit: 'captures', rule: ruleText },
    seed: () => ({
      shots: [
        { id: 'sh1', kind: 'image', rect: { x: 36, y: 72, w: 560, h: 300 }, marks: [{ t: 'rect', x: 18, y: 56, w: 300, h: 44 }, { t: 'text', x: 330, y: 84, s: 'Fix this' }], ocr: 'Release notes — draft\nShip the status endpoint before Friday.', format: 'PNG', path: shotAt(1, 'png', 'image'), duration: null, at: ago(1) },
        { id: 'sh2', kind: 'recording', rect: { x: 640, y: 100, w: 640, h: 440 }, marks: [], ocr: '', format: 'MOV', path: shotAt(3, 'mov', 'recording'), duration: 12, at: ago(3) },
        { id: 'sh3', kind: 'image', rect: { x: 640, y: 72, w: 640, h: 300 }, marks: [{ t: 'arrow', x1: 120, y1: 230, x2: 300, y2: 150 }], ocr: 'GitHub\nSign in to GitHub\nUse your GitHub account.', format: 'PNG', path: shotAt(12, 'png', 'image'), duration: null, at: ago(12) },
        { id: 'sh4', kind: 'image', rect: { x: 36, y: 300, w: 560, h: 240 }, marks: [], ocr: 'copy the staging URL: https://status.acme.io/health', format: 'JPG', path: shotAt(20, 'jpg', 'image'), duration: null, at: ago(20) },
      ],
    }),
    empty: () => ({ shots: [] }),
    prefs: [
      { key: 'after', label: 'After capture', type: 'select', options: [['edit', 'Edit'], ['copy', 'Copy'], ['save', 'Save']], default: 'edit', effect: 'Edit opens the editor after you select an area; Copy and Save skip it and finish right away.' },
      { key: 'format', label: 'File format', type: 'select', options: [['PNG', 'PNG'], ['JPG', 'JPG']], default: 'PNG', effect: 'Sets the file extension of saved captures and the format label in history.' },
      { key: 'folder', label: 'Save folder', type: 'select', options: [['~/Desktop', '~/Desktop'], ['~/Documents', '~/Documents'], ['~/Downloads', '~/Downloads'], ['~/Pictures', '~/Pictures'], ['~/Pictures/Screenshots', '~/Pictures/Screenshots']], default: '~/Desktop', effect: 'Saved captures and recordings are written here; the path shows in the toast and in history.' },
      { key: 'retention', label: 'Keep captures', type: 'select', options: [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'Forever']], default: 30, effect: 'Captures older than this leave history. Shortening it removes them right away; saved files stay in their folder.' },
    ],
    hotkeys: [
      { id: 'capture', label: 'Capture region', default: '⌃⌥A', run: () => start('capture') },
      { id: 'record', label: 'Record region', default: '⌃⌥R', run: () => start('record') },
      { id: 'ocr', label: 'Extract text', default: '⌃⌥O', run: () => start('ocr') },
    ],
    scenarios: [
      { key: 'diskFull', label: 'Disk is full (saving fails)' },
      { key: 'folderMissing', label: 'Save folder is missing' },
    ],
    menubar: {
      icon: 'i-shot', order: 10, about: 'Capture, record and extract text from the menu bar. Shows a timer while recording.',
      label: () => (rec ? '● ' + dur(recSecs()) : ''),
      cls: () => (rec ? 'rec' : ''),
      render: popover,
    },
    view: { title: 'Screenshot', mount: (el, params) => mountView(el, params || {}) },
    init,
  });

  const data = () => OS.data.screenshot;
  const find = (id) => data().shots.find((s) => s.id === id);
  const recSecs = () => (rec ? Math.max(0, Math.floor((Date.now() - rec.start) / 1000)) : 0);

  /* retention: the store rule. 'pref' = the user shortened it (say so); otherwise aging out is quiet */
  function prune(why) {
    const days = retention(); if (!days) return 0;
    const cut = OS.now() - days * DAY, old = data().shots.filter((s) => s.at < cut);
    if (!old.length) return 0;
    OS.commit('screenshot', (d) => { d.shots = d.shots.filter((s) => s.at >= cut); });
    lastPrune = { n: old.length, days, at: Date.now() };
    if (why === 'pref') toast(`Removed ${plural(old.length, 'capture')} older than ${days} days`, { icon: 'i-clock', sub: 'Saved files stay in their folders.', note: 'Repository prunes on pref change and at launch' });
    OS.emit('screenshot:pruned');
    return old.length;
  }
  function init() {
    rec = null; lastPrune = null;
    OS.provide('screenshot.thumb', ({ shotId, width }) => { const s = find(shotId); return s ? thumb(s, width) : null; });
    OS.on('tick', () => { if (rec) OS.menubar.refresh(); prune(); });
    OS.on('pref:screenshot.retention', () => prune('pref'));
    window.addEventListener('keydown', (e) => { if (rec && e.key === 'Escape' && !e.defaultPrevented) stopRec(); });
    prune();
  }

  /* ---------- status item popover ---------- */
  function popover(el) {
    const hk = (id) => OS.hotkey.label('screenshot.' + id);
    const item = (m, ic, l) => `<button data-m="${m}">${icon(ic, 's')}${l}<span class="ss-ks">${esc(hk(m))}</span></button>`;
    const draw = () => {
      const st = OS.perm.state('screen'), recent = data().shots.slice().sort((a, b) => b.at - a.at).slice(0, 3);
      el.innerHTML = rec
        ? `<div class="pop-h ss-rech"><i class="ss-dot"></i>Recording<span class="mono ss-timer">${dur(recSecs())}</span><button class="btn" data-a="stop">Stop</button></div>
           <div class="pop-b muted small">Esc also stops. It’s saved to ${esc(OS.pref('screenshot.folder'))}.${OS.ui.note('SCStream + SCRecordingOutput')}</div>
           <div class="pop-f"><button data-a="history">${icon('i-history', 's')}Open History…</button></div>`
        : `<div class="pop-h">${icon('i-shot')}Screenshot<span class="muted small">${plural(data().shots.length, 'capture')}</span></div>
           ${st !== 'granted' ? `<div class="pop-b ss-perm">${OS.perm.tag('screen')}<span class="small">${st === 'approval' ? 'macOS asks to confirm Screen Recording again.' : 'Screen Recording is off.'}</span><button class="btn" data-a="grant">${st === 'approval' ? 'Review…' : 'Allow…'}</button></div>`
             : recent.length ? `<div class="pop-b ss-recent">${recent.map((s) => `<button class="ss-rt" data-id="${s.id}" title="${esc(s.path || 'Not saved to a file')}"></button>`).join('')}</div>` : ''}
           <div class="pop-f">${item('capture', 'i-crop', 'Capture Region')}${item('record', 'i-video', 'Record Region')}${item('ocr', 'i-ocr', 'Extract Text')}
             <button data-a="history">${icon('i-history', 's')}Open History…</button></div>`;
      el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { OS.closePopover(); setTimeout(() => start(b.dataset.m), 0); }));
      el.querySelectorAll('.ss-rt').forEach((b) => { b.appendChild(thumb(find(b.dataset.id), 92)); b.onclick = () => { OS.closePopover(); OS.open('screenshot', { select: b.dataset.id }); }; });
      const g = el.querySelector('[data-a=grant]'); if (g) g.onclick = () => { OS.closePopover(); OS.perm.request('screen'); };
      const sp = el.querySelector('[data-a=stop]'); if (sp) sp.onclick = () => { OS.closePopover(); stopRec(); };
      el.querySelector('[data-a=history]').onclick = () => { OS.closePopover(); OS.open('screenshot'); };
    };
    draw();
    OS.watch(el, 'prefs perm change:screenshot', draw);
    OS.watch(el, 'tick', () => { const t = el.querySelector('.ss-timer'); if (t) t.textContent = dur(recSecs()); else if (rec) draw(); });
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
    if (rec) { if (mode === 'record') stopRec(); else toast('Stop the recording first', { icon: 'i-video', sub: 'Use Stop in the menu bar or press Esc.', ms: 2500 }); return; }
    if (!OS.perm.has('screen')) return gate(mode);
    select(mode);
  }
  const swallow = (e) => e.ctrlKey || e.altKey || e.metaKey;
  /* G5: one grant card; it follows missing → approval (re-approval) → granted and proceeds in place */
  function gate(mode) {
    const el = h('<div class="ss-gate"><div class="ss-card"><div data-g></div><div class="ss-cf"><button class="btn ghost" data-cancel>Not Now</button></div></div></div>');
    const card = el.querySelector('[data-g]');
    OS.ui.grant(card, 'screen', 'Capturing, recording and reading text from the screen needs Screen Recording. OneShot uses it only while you do.');
    /* shell workaround: OS.ui.grant prints the charge helper's version under a Screen Recording 'approval' card */
    const fixFoot = () => { const f = card.querySelector('.state.approval .foot'); if (f) f.textContent = `System Settings › ${OS.perm.defs.screen.pane}`; };
    fixFoot();
    el.querySelector('[data-cancel]').onclick = () => OS.ui.overlay.close();
    el.onmousedown = (e) => { if (e.target === el) OS.ui.overlay.close(); };
    OS.watch(card, 'perm', () => { if (OS.perm.has('screen')) select(mode); else fixFoot(); });
    OS.ui.overlay.open(el, { onKey: swallow });
  }

  const LABEL = { capture: 'Drag to capture an area', record: 'Drag over the area to record · it starts when you let go', ocr: 'Drag over the text to read' };
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
    if (a === 'save') return saveDirect(draft);
    editor(draft);
  }

  /* ---------- actions shared by editor, direct modes and history ---------- */
  function addShot(s) { if (find(s.id)) return; OS.commit('screenshot', (d) => { d.shots.push(s); }); prune(); }
  function copyShot(s) {
    const { w, h: hh } = s.rect;
    const r = OS.pasteboard.copy({ kind: 'image', text: `Screenshot ${w}×${hh}`, image: { w, h: hh, shotId: s.id }, source: 'Screenshot' });
    if (r.recorded) toast('Copied to clipboard', { sub: 'Added to Clipboard history', action: { label: 'Open', run: () => { OS.ui.overlay.close(); OS.open('clipboard', { select: r.clipId }); } } });
    else toast('Copied to clipboard', { sub: 'Not added to Clipboard history', action: { label: 'Show in History', run: () => { OS.ui.overlay.close(); OS.open('screenshot', { select: s.id }); } } });
    return r;
  }
  function copyPath(s) {
    const rr = OS.pasteboard.copy({ kind: 'text', text: s.path, source: 'Screenshot' });
    toast('Path copied', { icon: 'i-copy', sub: rr.recorded ? 'Added to Clipboard history' : 'Not added to Clipboard history', ms: 2500 });
  }
  function copyClose(draft) {
    OS.ui.overlay.close(); draft.at = draft.at || OS.now(); addShot(draft); copyShot(draft);
  }

  /* G9 · simulated coordinated, atomic write: progress → rename into place, or fail with nothing written */
  function writeFile(draft, folder, onProgress) {
    const name = fileName('image', draft.format.toLowerCase(), draft.at);
    return new Promise((res) => {
      onProgress(0, name, folder);
      if (OS.scn('screenshot.folderMissing') && folder === OS.pref('screenshot.folder')) return setTimeout(() => res({ ok: false, err: 'folderMissing', name, folder }), 220);
      const total = OS.scn('slow') ? 1600 : 560, step = 40; let t = 0;
      const iv = setInterval(() => {
        t += step; const pct = Math.min(100, Math.round((t / total) * 100));
        if (OS.scn('screenshot.diskFull') && pct >= 70) { clearInterval(iv); return res({ ok: false, err: 'diskFull', name, folder }); }
        onProgress(pct, name, folder);
        if (pct >= 100) { clearInterval(iv); res({ ok: true, name, folder, path: `${folder}/${name}` }); }
      }, step);
    });
  }
  const failLine = (r) => (r.err === 'diskFull'
    ? `Couldn’t save “${r.name}”. The disk is full. Nothing was written — OneShot writes the file in one step, so no partial file was left.`
    : `Couldn’t save “${r.name}”. The folder ${r.folder} is missing. It may have been moved, renamed or be on a drive that isn’t connected. Nothing was written.`);
  const FAIL_NOTE = { diskFull: 'NSFileCoordinator + .atomic write; NSFileWriteOutOfSpaceError → this toast', folderMissing: 'NSFileNoSuchFileError on the folder URL → offer a fallback; the pref is not changed' };
  /* one save, shared by the editor and the direct "after = save" mode. ui: {progress(pct,name,folder), done(r)} */
  async function save(draft, folder, ui) {
    if (draft.saving || draft.path) return;
    draft.saving = true;
    const r = await writeFile(draft, folder, ui.progress);
    delete draft.saving;
    if (r.ok) {
      draft.path = r.path;
      OS.ui.overlay.close(); addShot(draft);
      toast(`Saved “${r.name}”`, { icon: 'i-save', sub: `${r.folder} · in history, ${keptText()}`, note: 'NSFileCoordinator + .atomic write', action: { label: 'Show in History', run: () => OS.open('screenshot', { select: draft.id }) } });
    } else {
      const fb = fallbackFor(r.folder);
      toast(`Couldn’t save “${r.name}”`, { kind: 'failure', sub: r.err === 'diskFull' ? 'The disk is full. Nothing was written.' : `The folder ${r.folder} is missing. Nothing was written.`, note: FAIL_NOTE[r.err], ms: 9000,
        action: r.err === 'folderMissing' ? { label: `Save to ${folderName(fb)} Instead`, run: () => save(draft, fb, ui) } : null });
    }
    ui.done(r);
  }
  /* "after = save": no editor; progress lives in a toast. A failure opens the editor so the capture isn't lost. */
  function saveDirect(draft) {
    OS.ui.overlay.close();
    let t = null;
    save(draft, OS.pref('screenshot.folder'), {
      progress(pct, name, folder) {
        if (!t) { t = toast(`Saving “${name}”`, { icon: 'i-save', sub: `To ${folder}`, ms: 60000 }); t.querySelector('.t').insertAdjacentHTML('beforeend', '<div class="ss-prog" role="progressbar"><i></i></div>'); }
        t.querySelector('.ss-prog i').style.width = pct + '%'; t.querySelector('.ss-prog').setAttribute('aria-valuenow', pct);
      },
      done(r) { if (t) t.remove(); t = null; if (!r.ok && !OS.ui.overlay.isOpen()) editor(draft, { fail: r }); },
    });
  }

  /* ---------- editor (full-screen transient; keeps its own keys) ---------- */
  function editor(draft, opt = {}) {
    const r = draft.rect;
    const ed = { tool: 'arrow', save: null, fail: opt.fail || null, ocr: null, alive: true, input: null };
    const el = h('<div class="ss-ed"></div>');
    const box = h(`<div class="ss-region" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px"></div>`);
    box.appendChild(OS.desk.view(draft.snap, r, r.w));
    const svg = h(`<svg class="ss-marks" viewBox="0 0 ${r.w} ${r.h}" width="${r.w}" height="${r.h}"></svg>`);
    box.appendChild(svg);
    const tb = h('<div class="ss-tb"></div>'), panel = h('<div class="ss-panel" hidden></div>');
    el.append(box, tb, panel);
    const drawMarks = (live) => { svg.innerHTML = marksSvg(draft.marks) + (live ? markSvg(live) : ''); };
    const busy = () => !!ed.save;

    function place() {
      const tw = tb.offsetWidth, th = tb.offsetHeight;
      let y = r.y + r.h + 10; if (y + th > 892) y = r.y - th - 10; if (y < 34) y = r.y + r.h - th - 8;
      tb.style.left = Math.max(8, Math.min(r.x, 1432 - tw)) + 'px'; tb.style.top = y + 'px';
      if (!panel.hidden) {
        const pw = panel.offsetWidth, ph = panel.offsetHeight, tt = y;
        let px = parseFloat(tb.style.left), py = tt + th + 8;
        if (tt < r.y) py = r.y + r.h + 10;
        if (py + ph > 892) { px = r.x + r.w + 12; py = 34; if (px + pw > 1432) px = Math.max(8, r.x - pw - 12); }
        panel.style.left = Math.max(8, Math.min(px, 1432 - pw)) + 'px'; panel.style.top = py + 'px';
      }
    }
    function footer() {
      if (ed.save) return `<div class="ss-foot-ed"><div class="ss-sv"><span>Saving “${esc(ed.save.name)}” to ${esc(ed.save.folder)}</span><span class="mono">${ed.save.pct}%</span></div><div class="ss-prog" role="progressbar" aria-valuenow="${ed.save.pct}"><i style="width:${ed.save.pct}%"></i></div></div>`;
      if (ed.fail) {
        const fb = fallbackFor(ed.fail.folder);
        return `<div class="ss-foot-ed ss-err" role="alert">${icon('i-x', 's')}<div><div>${esc(failLine(ed.fail))}</div>
          ${ed.fail.err === 'folderMissing' ? `<div class="ss-err-a"><button class="btn" data-a="fallback" data-f="${esc(fb)}">Save to ${esc(folderName(fb))} Instead</button><span class="muted small">Your Save folder setting doesn’t change.</span></div>` : '<div class="muted small ss-err-a">Free up space, then save again, or use Copy &amp; Close.</div>'}
          ${OS.ui.note(FAIL_NOTE[ed.fail.err])}</div></div>`;
      }
      return '';
    }
    function redraw() {
      const T = (id, ic, l) => `<button data-tool="${id}" aria-pressed="${ed.tool === id}" title="${l}">${icon(ic, 's')}${l}</button>`;
      const dis = busy() ? 'disabled' : '';
      tb.innerHTML = opt.ocrOnly
        ? `<div class="ss-bar"><span class="tag">${r.w} × ${r.h}</span><span class="muted">Reading text</span><span class="grow"></span><button class="btn primary" data-a="cancel" title="Close (esc)">Close</button></div>`
        : `<div class="ss-bar"><span class="tag">${r.w} × ${r.h}</span>
            <div class="seg">${T('arrow', 'i-arrow', 'Arrow')}${T('rect', 'i-rect', 'Rectangle')}${T('text', 'i-type', 'Text')}</div>
            <button class="btn" data-a="undo" title="Undo last mark (⌘Z)" ${draft.marks.length && !busy() ? '' : 'disabled'}>${icon('i-undo', 's')}Undo</button><span class="ss-sep"></span>
            <button class="btn" data-a="ocr" title="Read the text in this area" ${dis}>${icon('i-ocr', 's')}Read Text</button>
            <button class="btn" data-a="save" title="Save to ${esc(OS.pref('screenshot.folder'))} (⌘S)" ${dis}>${icon('i-save', 's')}${ed.save ? `Saving ${ed.save.pct}%` : 'Save'}</button>
            <button class="btn primary" data-a="copy" title="Copy and close (⌘C)" ${dis}>${icon('i-copy', 's')}Copy &amp; Close</button>
            <button class="btn ghost" data-a="cancel" title="Discard (esc)">Cancel</button></div>` + footer();
      place();
    }
    const doSave = (folder) => {
      if (busy() || opt.ocrOnly) return;
      ed.fail = null;
      save(draft, folder || OS.pref('screenshot.folder'), {
        progress(pct, name, f) { if (!ed.alive) return; ed.save = { pct, name, folder: f }; redraw(); },
        done(res) { if (!ed.alive) return; ed.save = null; ed.fail = res.ok ? null : res; redraw(); },
      });
    };
    const undoMark = () => { if (busy() || !draft.marks.length) return; draft.marks.pop(); drawMarks(); redraw(); };
    tb.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      commitInput();
      if (b.dataset.tool) { ed.tool = b.dataset.tool; return redraw(); }
      const a = b.dataset.a;
      if (a === 'undo') undoMark();
      else if (a === 'cancel') OS.ui.overlay.close();
      else if (a === 'ocr') runOcr();
      else if (a === 'copy') copyClose(draft);
      else if (a === 'save') doSave();
      else if (a === 'fallback') doSave(b.dataset.f);
    };

    /* drawing */
    function openInput(p) {
      const inp = h('<input class="ss-ti" placeholder="Type, then press Return" spellcheck="false">');
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
      if (e.button !== 0 || busy()) return; e.preventDefault(); commitInput();
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
    function copyOcr() {
      const t = ed.ocr && ed.ocr.text; if (!t) return;
      const rr = OS.pasteboard.copy({ kind: 'text', text: t, source: 'Screenshot' });
      toast('Text copied', rr.recorded
        ? { sub: 'Added to Clipboard history', action: { label: 'Open', run: () => { OS.ui.overlay.close(); OS.open('clipboard', { select: rr.clipId }); } } }
        : { sub: 'Not added to Clipboard history' });
    }
    function drawPanel() {
      const o = ed.ocr;
      if (!o) { panel.hidden = true; return; }
      panel.hidden = false;
      panel.innerHTML = `<div class="ss-ph"><b>Text in this area</b><button class="btn icon ghost" data-x title="Close">${icon('i-x', 's')}</button></div><div class="ss-pb"></div>`;
      const body = panel.querySelector('.ss-pb');
      if (o.loading) OS.ui.state(body, { kind: 'loading', compact: true, title: 'Reading text…', body: 'This takes a moment.', note: 'VNRecognizeTextRequest off the main actor' });
      else if (!o.text) OS.ui.state(body, { kind: 'empty', compact: true, title: 'No text found', body: 'Nothing readable in this area. Try a larger selection.' });
      else {
        body.innerHTML = `<pre class="ss-otxt mono"></pre><div class="ss-pf"><span class="muted small">${plural(o.text.split('\n').length, 'line')}</span><button class="btn primary" data-copytext title="Copy text (⌘C)">${icon('i-copy', 's')}Copy Text</button></div>`;
        body.querySelector('pre').textContent = o.text;
        body.querySelector('[data-copytext]').onclick = copyOcr;
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
        if (ed.input) { if (e.key === 'Escape') { const { inp } = ed.input; ed.input = null; inp.remove(); return true; } return false; }   // typing goes to the text field
        const c = OS.comboOf(e);
        if (c === '⌘Z') { undoMark(); return true; }
        if (c === '⌘C') { if (opt.ocrOnly) copyOcr(); else if (!busy()) copyClose(draft); return true; }
        if (c === '⌘S') { doSave(); return true; }
        return swallow(e);                       // Esc falls through: the shell closes the overlay (discard)
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
    OS.menubar.refresh();   // the timer in the menu bar is the recording's only chrome; Stop lives in its menu
  }
  function stopRec() {
    if (!rec) return;
    const r = rec; rec = null; r.frame.remove();
    const secs = Math.max(1, Math.round((Date.now() - r.start) / 1000)), at = OS.now(), folder = OS.pref('screenshot.folder'), name = fileName('recording', 'mov', at);
    const s = { id: OS.id('shot'), kind: 'recording', rect: r.rect, marks: [], ocr: '', format: 'MOV', path: `${folder}/${name}`, duration: secs, at, snap: r.snap };
    addShot(s); OS.menubar.refresh();
    toast('Recording saved', { icon: 'i-video', sub: `${dur(secs)} · “${name}” in ${folder}`, action: { label: 'Show in History', run: () => OS.open('screenshot', { select: s.id }) } });
  }

  /* ---------- history view ---------- */
  function mountView(root, params) {
    const st = { q: '', applied: '', kind: 'all', sel: new Set(params.select ? [params.select] : []), scrollTo: !!params.select, loaded: false, searching: false, undo: null, focusGrid: true };
    root.innerHTML = `<div class="toolbar"><input class="search" placeholder="Search text or file name" aria-label="Search captures" style="width:220px">
        <span class="ss-busy" hidden><i class="ss-spin"></i>Searching…</span><span class="grow"></span>
        <div class="seg" data-kind>${[['all', 'All'], ['image', 'Images'], ['recording', 'Recordings']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="split ss-split"><div class="ss-main"><div class="ss-gw"></div><div class="ss-foot"></div></div><div class="pane ss-pane"></div></div>`;
    const search = root.querySelector('.search'), busyEl = root.querySelector('.ss-busy');
    const split = root.querySelector('.ss-split'), gw = root.querySelector('.ss-gw'), foot = root.querySelector('.ss-foot'), pane = root.querySelector('.ss-pane');
    const tools = OS.ui.toolbarTools();
    if (tools) {
      const pg = tools.querySelector('[data-pg]');
      [['capture', 'i-crop', 'Capture Region'], ['record', 'i-video', 'Record Region'], ['ocr', 'i-ocr', 'Extract Text']].forEach(([m, ic, l]) => {
        const b = h(`<button class="btn tb" data-ss-tool="${m}" title="${l} (${esc(OS.hotkey.label('screenshot.' + m))})">${icon(ic)}</button>`);
        b.onclick = () => start(m); tools.insertBefore(b, pg);
      });
      if (pg) tools.insertBefore(h('<i class="ss-tsep"></i>'), pg);
    }

    const all = () => data().shots.slice().sort((a, b) => b.at - a.at);
    const visible = () => { const f = st.applied.trim().toLowerCase(); return all().filter((s) => (st.kind === 'all' || s.kind === st.kind) && (!f || (s.ocr || '').toLowerCase().includes(f) || (s.path || '').toLowerCase().includes(f))); };
    const selected = () => visible().filter((s) => st.sel.has(s.id));

    /* G8: search runs off the main thread (latest wins) with an indicator */
    search.oninput = () => {
      st.q = search.value; st.searching = true; busyEl.hidden = false; search.classList.add('busy');
      OS.bg('screenshot.search', () => st.q).then((q) => { st.applied = q; st.searching = false; busyEl.hidden = true; search.classList.remove('busy'); draw(); });
    };
    search.onkeydown = (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; search.oninput(); } };
    root.querySelectorAll('[data-kind] button').forEach((b) => (b.onclick = () => { st.kind = b.dataset.v; draw(); }));

    function copyPrimary(s) { if (s.kind === 'recording') copyPath(s); else copyShot(s); }
    function del(list) {
      const ids = new Set(list.map((s) => s.id));
      st.undo = data().shots.filter((s) => ids.has(s.id));
      OS.commit('screenshot', (d) => { d.shots = d.shots.filter((k) => !ids.has(k.id)); });
    }
    async function delSelected() {
      const l = selected(); if (!l.length) return;
      if (l.length > 1 && !(await OS.system.confirm(`Delete ${l.length} captures?`, 'They’re removed from history. Saved files stay in their folders.', 'Delete', true))) return;
      del(l);
    }
    function restore() {
      const u = st.undo; if (!u) return; st.undo = null;
      OS.commit('screenshot', (d) => { u.forEach((s) => { if (!d.shots.some((k) => k.id === s.id)) d.shots.push(s); }); });
      st.sel = new Set(u.map((s) => s.id)); st.scrollTo = true; draw();
    }
    function register() {
      const sl = selected(), one = sl.length === 1 ? sl[0] : null;
      OS.responder(root, {
        new: { label: 'New Capture', run: () => start('capture') },
        undo: { label: st.undo ? `Undo Delete${st.undo.length > 1 ? ` (${st.undo.length})` : ''}` : 'Undo', enabled: () => !!st.undo, run: restore },
        copy: { label: one && one.kind === 'recording' ? 'Copy Path' : 'Copy Capture', enabled: () => selected().length === 1, run: () => { const s = selected()[0]; if (s) copyPrimary(s); } },
        delete: { label: sl.length > 1 ? `Delete ${sl.length} Captures` : 'Delete Capture', enabled: () => selected().length > 0, run: delSelected },
        selectAll: { label: 'Select All Captures', enabled: () => visible().length > 0, run: () => { st.sel = new Set(visible().map((s) => s.id)); draw(); } },
        find: { label: 'Find…', run: () => { search.focus(); search.select(); } },
      });
    }

    /* keyboard: ↑↓ by row, ←→ by tile, ↵ copies the selected capture (not while typing) */
    root.addEventListener('keydown', (e) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !st.loaded) return;
      const l = visible(), grid = gw.querySelector('.ss-grid');
      if (e.key === 'Enter' && !e.target.closest('button')) { const s = selected(); if (s.length === 1) { e.preventDefault(); copyPrimary(s[0]); } return; }
      const d = { ArrowDown: 'v', ArrowUp: 'v', ArrowRight: 'h', ArrowLeft: 'h' }[e.key];
      if (!d || !l.length || !grid) return;
      e.preventDefault();
      const tiles = [...grid.querySelectorAll('.ss-tile')];
      const cols = Math.max(1, tiles.filter((t) => t.offsetTop === (tiles[0] ? tiles[0].offsetTop : 0)).length);
      const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight', step = d === 'v' ? cols : 1;
      const cur = l.findIndex((x) => st.sel.has(x.id)), i = Math.max(0, cur);
      const n = Math.max(0, Math.min(l.length - 1, cur < 0 ? 0 : i + (fwd ? step : -step)));
      st.sel = new Set([l[n].id]); st.scrollTo = true; st.focusGrid = true; draw();
    });

    function skeleton() {
      split.classList.remove('ss-full');
      gw.innerHTML = `<div class="ss-grid ss-skel" aria-label="Loading">${Array.from({ length: 6 }, () => '<div class="ss-skt"><div class="ss-tt"></div><div class="ss-tm"><b></b></div></div>').join('')}</div>`;
      foot.textContent = 'Reading history…'; pane.innerHTML = '';
    }
    function load() {
      st.loaded = false; skeleton(); OS.ui.subtitle('');
      OS.bg('screenshot.load', () => !OS.scn('screenshot.fail'), OS.scn('slow') ? 1800 : 260).then((ok) => {
        if (!root.isConnected) return;
        if (!ok) {
          split.classList.add('ss-full');
          return OS.ui.state(gw, { kind: 'failure', title: 'Couldn’t open capture history', body: 'The history store didn’t respond. Nothing was changed or lost.', detail: `${OS.store.path('screenshot')} · read failed`, action: { label: 'Try Again', run: load }, note: 'Repository actor read failed → store stays empty, no writes' });
        }
        st.loaded = true; draw();
      });
    }

    function draw() {
      if (!st.loaded || !root.isConnected) return;
      root.querySelectorAll('[data-kind] button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.kind));
      const shots = data().shots;
      OS.ui.subtitle(`${plural(shots.length, 'capture')} · ${keptText()}`);
      split.classList.toggle('ss-full', !shots.length);
      if (!shots.length) {
        st.sel.clear(); register(); foot.innerHTML = ''; pane.innerHTML = '';
        return OS.ui.state(gw, { kind: 'empty', title: 'No captures yet', body: `Press ${OS.hotkey.label('screenshot.capture')} to capture a region. Saved captures go to ${OS.pref('screenshot.folder')}, and history ${retention() ? `keeps them for ${retention()} days` : 'keeps them until you delete them'}.`, detail: OS.store.path('screenshot'), action: { label: 'Capture Region', run: () => start('capture') } });
      }
      const l = visible();
      st.sel = new Set([...st.sel].filter((id) => l.some((s) => s.id === id)));
      if (!st.sel.size && l[0]) st.sel.add(l[0].id);
      const old = gw.querySelector('.ss-grid'), top = old ? old.scrollTop : 0, hadFocus = !!old && old.contains(document.activeElement);
      if (!l.length) {
        const q = st.applied.trim();
        OS.ui.state(gw, q
          ? { kind: 'nomatch', title: `No captures match “${q}”`, body: 'Search looks at the text found in captures and at file names.', action: { label: 'Clear Search', run: () => { search.value = ''; search.oninput(); } } }
          : { kind: 'nomatch', title: st.kind === 'recording' ? 'No recordings' : 'No images', body: 'Nothing of this kind in history.', action: { label: 'Show All', run: () => { st.kind = 'all'; draw(); } } });
      } else {
        gw.innerHTML = '<div class="ss-grid" tabindex="0" aria-label="Capture history" role="listbox" aria-multiselectable="true"></div>';
        const grid = gw.firstChild;
        grid.innerHTML = l.map((s) => `<div class="ss-tile ${st.sel.has(s.id) ? 'sel' : ''}" data-id="${s.id}" role="option" aria-selected="${st.sel.has(s.id)}"><div class="ss-tt"></div>
          <div class="ss-tm"><span class="ss-tl">${icon(s.kind === 'recording' ? 'i-video' : 'i-image', 's')}${s.kind === 'recording' ? 'Recording' : `${s.rect.w}×${s.rect.h} ${esc(s.format)}`}</span><span class="ss-ta">${OS.ago(s.at)}</span></div></div>`).join('');
        grid.querySelectorAll('.ss-tile').forEach((t) => {
          const s = find(t.dataset.id), tt = t.querySelector('.ss-tt');
          tt.appendChild(thumb(s, 172));
          if (s.kind === 'recording') tt.insertAdjacentHTML('beforeend', `<span class="ss-play">${icon('i-play', 's')}${dur(s.duration)}</span>`);
          t.onmousedown = (e) => {
            if (e.metaKey || e.shiftKey) { st.sel.has(s.id) ? st.sel.delete(s.id) : st.sel.add(s.id); } else st.sel = new Set([s.id]);
            st.focusGrid = true; draw(); e.preventDefault();
          };
        });
        grid.scrollTop = top;
        if (st.scrollTo) { const t = grid.querySelector('.ss-tile.sel'); if (t) t.scrollIntoView({ block: 'nearest' }); st.scrollTo = false; }
        if (st.focusGrid || hadFocus) { grid.focus({ preventScroll: true }); st.focusGrid = false; }
      }
      const recent = lastPrune && Date.now() - lastPrune.at < 30000;
      foot.innerHTML = `<span>${l.length === shots.length ? plural(shots.length, 'capture') : `${l.length} of ${shots.length}`}${st.sel.size > 1 ? ` · ${st.sel.size} selected` : ''}</span><span class="ss-fsep">·</span>
        <span>${recent ? `Removed ${plural(lastPrune.n, 'capture')} older than ${lastPrune.days} days` : `History ${keptText()}`}</span><button class="lnk" data-ret>Change…</button>`;
      foot.querySelector('[data-ret]').onclick = () => OS.openPrefs('screenshot');
      drawPane();
      register();
    }
    function drawPane() {
      const sl = selected();
      if (!sl.length) { pane.innerHTML = ''; return OS.ui.state(pane, { kind: 'empty', compact: true, title: 'No selection', body: 'Pick a capture to see it here.' }); }
      if (sl.length > 1) {
        pane.innerHTML = `<div class="ss-multi">${sl.slice(0, 3).map(() => '<div class="ss-mt"></div>').join('')}</div><h3 class="ss-mh">${sl.length} captures selected</h3>
          <p class="muted small">${plural(sl.filter((s) => s.kind === 'image').length, 'image')}, ${plural(sl.filter((s) => s.kind === 'recording').length, 'recording')}.</p>
          <div class="ss-acts"><button class="btn danger" data-a="del">${icon('i-trash', 's')}Delete ${sl.length} Captures</button></div>`;
        pane.querySelectorAll('.ss-mt').forEach((m, i) => m.appendChild(thumb(sl[i], 200)));
        pane.querySelector('[data-a=del]').onclick = delSelected;
        return;
      }
      const s = sl[0], until = retention() ? new Date(s.at + retention() * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
      pane.innerHTML = `<div class="ss-pv"></div>
        <div class="ss-pn">${esc(s.path ? s.path.split('/').pop() : s.kind === 'recording' ? 'Recording' : 'Capture (not saved to a file)')}</div>
        <dl class="kv ss-kv"><dt>Type</dt><dd>${s.kind === 'recording' ? 'Recording · ' + dur(s.duration) : 'Image · ' + esc(s.format)}</dd><dt>Size</dt><dd>${s.rect.w} × ${s.rect.h}</dd>
          <dt>Taken</dt><dd>${esc(new Date(s.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</dd>
          <dt>Where</dt><dd class="mono">${s.path ? esc(s.path.slice(0, s.path.lastIndexOf('/')) || '/') : '<span class="muted">Clipboard only</span>'}</dd>
          <dt>In history</dt><dd>${until ? `Until ${esc(until)}` : 'Until you delete it'}</dd>
          ${s.ocr ? `<dt>Text</dt><dd class="ss-otxt-s">${esc(s.ocr)}</dd>` : ''}</dl>
        <div class="ss-acts"><button class="btn primary" data-a="copy">${icon('i-copy', 's')}${s.kind === 'recording' ? 'Copy Path' : 'Copy'}</button>
          ${s.path && s.kind !== 'recording' ? `<button class="btn" data-a="path">Copy Path</button>` : ''}
          <span class="grow"></span><button class="btn tb" data-a="del" title="Delete from history (⌘⌫)">${icon('i-trash')}</button></div>`;
      pane.querySelector('.ss-pv').appendChild(thumb(s, 270));
      pane.querySelector('[data-a=copy]').onclick = () => copyPrimary(s);
      const pb = pane.querySelector('[data-a=path]'); if (pb) pb.onclick = () => copyPath(s);
      pane.querySelector('[data-a=del]').onclick = () => del([s]);
    }

    OS.watch(root, 'change:screenshot prefs clock screenshot:pruned', draw);
    OS.watch(root, 'scn', (k) => { if (k === 'screenshot.fail' || k === 'screenshot.empty') load(); });
    load();
    if (params.create) setTimeout(() => start('capture'), 0);
  }
})();
