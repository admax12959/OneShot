// node tools/test-json.js — walks JS-1..JS-5, HO-2 (Format → Studio), ST-1/2/3 for JSON, plus the v3 items:
// strict JSON with caret excerpt, Studio as a document repository (store), G8 background search + large document,
// G10 responder (new/undo/copy/delete/find) with menu validation, and a reload check.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok   ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; globalThis.__errs = errs;
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (name) => p.screenshot({ path: `/tmp/v3-json-${String(++n).padStart(2, '0')}-${name}.png` });
  const key = (k) => p.keyboard.press(k);
  const ta = () => p.evaluate(() => OS.host.textedit.value());
  const selectLine = (prefix) => p.evaluate((pre) => { if (OS.host.textedit.value().indexOf(pre) < 0) OS.host.textedit.el().value = window.__orig; const v = OS.host.textedit.value(); const s = v.indexOf(pre); const e = v.indexOf('\n', s); OS.host.textedit.select(s, e); return v.slice(s, e); }, prefix);
  const docs = () => p.evaluate(() => OS.data.json.docs.map((d) => ({ id: d.id, name: d.name, text: d.text, source: d.source, at: d.at })));
  const pill = () => p.locator('#float .js-pill');
  const floatOpen = () => p.locator('#float').isVisible();
  const closeWin = () => p.evaluate(() => { OS.closeWindow('#win'); OS.closeWindow('#prefwin'); });
  const scn = (k, v) => p.evaluate(([k, v]) => OS.setScn(k, v), [k, v]);
  const studio = async (sel) => { await p.evaluate((s) => OS.open('json', s ? { select: s } : {}), sel); await p.waitForSelector('#view .js-row, #view .state:not(.loading)'); };
  const selId = () => p.evaluate(() => { const r = document.querySelector('.js-row.sel'); return r && r.dataset.id; });
  const status = () => p.locator('[data-st]').innerText();
  const menuItem = (label) => p.evaluate((l) => { for (const m of OS.menus()) for (const it of m.items) if (it !== '-' && it.label.startsWith(l)) return { label: it.label, enabled: it.enabled ? it.enabled() : true }; return null; }, label);
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));

  await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
  const VALID = '{"service":"status"', INVALID = '{"event":"deploy"';

  /* ---------- JS-1 format in place; the pill is a non-activating float ---------- */
  const orig = await selectLine(VALID);
  const before = (await docs()).length;
  await key('Control+Alt+KeyF');
  await pill().waitFor();
  let t = await ta();
  ok(t.includes('{\n  "service": "status",'), 'JS-1 selection replaced with 2-space Formatted output');
  ok(await p.evaluate(() => OS.app.active() === 'TextEdit'), 'JS-1 the pill never activates OneShot (TextEdit keeps the menu bar)');
  const sel = await p.evaluate(() => OS.host.textedit.getSelection());
  ok(sel.text.startsWith('{') && sel.text.endsWith('}') && sel.text.includes('\n'), 'JS-1 replaced range stays selected');
  const ds = await docs();
  ok(ds.length === before + 1 && /^TextEdit \d+:\d\d$/.test(ds[0].name) && ds[0].text === sel.text, 'JS-1 the run is kept as a Studio document ("' + ds[0].name + '")');
  await shot('pill-formatted');
  await p.click('#float [data-m=Minified]');
  ok((await ta()).includes(orig), 'JS-1 Minified re-replaces the same range');
  await p.click('#float [data-m=Sorted]');
  t = await ta();
  ok(t.indexOf('"latency"') < t.indexOf('"ok"') && t.indexOf('"ok"') < t.indexOf('"regions"'), 'JS-1 Sorted orders keys');
  ok((await docs()).length === before + 1, 'JS-1 switching modes updates the same document');
  await p.click('#float [data-undo]');
  ok((await ta()).includes(orig) && !(await floatOpen()), 'JS-1 Undo restores the original and closes');
  // Esc + desk click close; desk click never re-runs
  await selectLine(VALID); await key('Control+Alt+KeyF'); await pill().waitFor();
  const afterFmt = await ta(), cnt = (await docs()).length;
  await key('Escape');
  ok(!(await floatOpen()) && (await ta()) === afterFmt, 'JS-1 Esc closes the pill, text kept');
  await key('Control+Alt+KeyF'); await pill().waitFor();
  await p.mouse.click(700, 760); await p.waitForTimeout(150);
  ok(!(await floatOpen()), 'JS-1 outside click closes the pill');
  ok(cnt === before + 1, 'JS-1 formatting the same text again reuses its document');
  const cnt2 = (await docs()).length, t2 = await ta();
  await p.mouse.click(700, 700); await p.waitForTimeout(150);
  ok((await docs()).length === cnt2 && (await ta()) === t2 && !(await floatOpen()), 'JS-1 clicking the desk later does NOT re-run Format');
  await p.evaluate(() => OS.host.textedit.select(5, 5));
  await key('Control+Alt+KeyF');
  await p.locator('#float .js-hint').waitFor();
  ok((await p.locator('#float').innerText()).includes('Select JSON in the document first'), 'JS-1 no selection → hint');
  await key('Escape');

  /* ---------- JS-2 strict JSON: trailing comma → line:col + caret excerpt, text unchanged ---------- */
  const bad = await selectLine(INVALID);
  const txtBefore = await ta();
  await key('Control+Alt+KeyF');
  await pill().waitFor();
  const col = bad.indexOf(',]') + 1;
  const pt = await p.locator('#float').innerText();
  ok(pt.includes(`Invalid JSON — line 1, column ${col}`) && pt.includes('Trailing comma isn’t allowed in JSON'), 'JS-2 failure pill: line 1, column ' + col + ' (the trailing comma)');
  const ex = await p.evaluate(() => { const e = document.querySelector('#float .js-ex'); const sp = e.querySelectorAll(':scope > span'); return { line: sp[1].textContent, caret: sp[3].textContent }; });
  ok(ex.line[ex.caret.length - 1] === ',' && ex.caret.trim() === '^', 'JS-2 caret excerpt points at the offending comma: ' + JSON.stringify(ex.line.slice(Math.max(0, ex.caret.length - 12), ex.caret.length + 4)));
  ok((await ta()) === txtBefore, 'JS-2 text unchanged');
  await shot('pill-invalid');
  for (const [txt, msg] of [["{'a':1}", 'Property names need double quotes'], ['{"a":1,}', 'Trailing comma'], ['{"a":,}', 'Expected a value'], ['[1,2]//x', 'Unexpected content']]) {
    const r = await p.evaluate((s) => { OS.call('json.format', { text: s, source: 'Clipboard', clipId: 'strict-' + s.length, x: 700, y: 300 }); return document.querySelector('#float').innerText; }, txt);
    ok(r.includes('Invalid JSON') && r.includes(msg), `JS-2 strict JSON rejects ${txt} (“${msg}”)`);
    await key('Escape');
  }
  await selectLine(INVALID); await key('Control+Alt+KeyF'); await pill().waitFor();
  const c0 = (await docs()).length;
  await p.click('#float [data-open]');
  await p.waitForSelector('#view .js-row.sel');
  const sid = await selId(); const d1 = (await docs()).find((d) => d.id === sid);
  ok(d1 && d1.text === bad && (await docs()).length === c0 + 1, 'JS-2/JS-3 Open in Studio opens a document with the invalid text');
  await p.waitForTimeout(50);
  ok((await status()) === `Line 1, column ${col}: trailing comma isn’t allowed in JSON`, 'JS-4 status bar: ' + (await status()));
  await shot('studio-invalid');
  await p.click('[data-st]');
  ok(await p.evaluate((c) => { const a = document.activeElement; return a.matches('[data-text]') && a.selectionStart === c - 1; }, col), 'JS-4 clicking the error puts the caret on it');
  ok(await p.locator('[data-run=Formatted]').isDisabled() && !(await menuItem('Undo')).enabled, 'G10 Format disabled for invalid JSON; Undo disabled with no history');
  await p.fill('[data-text]', bad.replace(',]', ']'));
  ok((await status()).startsWith('Valid JSON · 4 keys · Minified'), 'JS-4 fixing the text validates live: ' + (await status()));
  ok((await menuItem('Undo')).label === 'Undo Typing', 'G10 Undo Typing after an edit');
  await p.click('[data-run=Formatted]');
  ok((await p.inputValue('[data-text]')).includes('{\n  "event": "deploy",') && (await status()).includes('2 spaces'), 'JS-4 Studio Format uses the indent pref');
  ok((await menuItem('Undo')).label === 'Undo Format' && (await menuItem('Undo')).enabled, 'G10 Edit › Undo Format enabled after Format');
  await p.click('[data-text]'); await key('Meta+KeyZ');
  ok(!(await p.inputValue('[data-text]')).includes('\n'), 'G10 ⌘Z undoes Format');
  await p.evaluate(() => document.querySelector('.js-list').focus());
  await p.click('#mbL [data-menu=edit]'); await shot('edit-menu'); await key('Escape');

  /* ---------- JS-3 / HO-2: Open in Studio selects the same document ---------- */
  await closeWin();
  await selectLine(VALID); await key('Control+Alt+KeyF'); await pill().waitFor();
  const newest = (await docs()).sort((a, b) => b.at - a.at)[0];
  await p.click('#float [data-open]');
  await p.waitForSelector('#view .js-row.sel');
  ok((await selId()) === newest.id && (await p.inputValue('[data-text]')) === newest.text, 'JS-3/HO-2 Open in Studio selects that same document');
  ok(await p.evaluate(() => document.activeElement.classList.contains('js-list')), 'JS-4 the list has focus on open');
  const k0 = await selId();
  await key('ArrowDown'); const k1 = await selId();
  ok(k1 !== k0, 'JS-4 ↓ moves the selection'); await key('ArrowUp');
  ok((await selId()) === k0, 'JS-4 ↑ moves back');
  await key('Enter');
  ok(await p.evaluate(() => document.activeElement.matches('[data-text]')), 'JS-4 ↵ focuses the text view');
  await shot('studio');

  /* ---------- JS-4 + G10: new / copy / delete / find through the responder ---------- */
  await key('Meta+KeyN');
  ok((await p.inputValue('[data-name]')) === 'Untitled' && (await status()) === 'Empty document', 'G10 ⌘N = New Document');
  ok(!(await menuItem('Copy')).enabled && (await menuItem('Delete')).enabled, 'G10 Copy disabled for an empty document; Delete enabled');
  await p.fill('[data-text]', '{"b":2,"a":[1,2]}');
  await p.click('[data-run=Sorted]');
  ok((await p.inputValue('[data-text]')).indexOf('"a"') < (await p.inputValue('[data-text]')).indexOf('"b"'), 'JS-4 Sort Keys');
  await p.click('[data-run=Minified]');
  ok((await p.inputValue('[data-text]')) === '{"a":[1,2],"b":2}', 'JS-4 Minify');
  await p.evaluate(() => document.querySelector('.js-list').focus());
  ok((await menuItem('Copy')).label === 'Copy Document' && (await menuItem('Copy')).enabled, 'G10 Copy Document enabled once there is text');
  await key('Meta+KeyC');
  ok(await p.evaluate(() => OS.pasteboard.current.text === '{"a":[1,2],"b":2}' && OS.pasteboard.current.source === 'OneShot'), 'G10 ⌘C copies the document text (source OneShot)');
  ok(await p.evaluate(() => OS.data.clipboard.clips.some((c) => c.text === '{"a":[1,2],"b":2}' && c.source === 'OneShot')), 'JS-4 the copy lands in Clipboard history');
  await p.fill('[data-name]', 'Sorted sample');
  await key('Meta+KeyF');
  ok(await p.evaluate(() => document.activeElement.matches('[data-q]')), 'G10 ⌘F focuses search');
  await scn('slow', true);
  await p.keyboard.type('Feature');
  ok(await p.isVisible('[data-sbusy]'), 'G8 search runs in the background with an indicator');
  await shot('studio-searching');
  await p.waitForSelector('[data-sbusy]', { state: 'hidden' });
  await scn('slow', false);
  ok((await p.locator('.js-row').count()) === 1, 'JS-4 search filters the list');
  await p.fill('[data-q]', 'zebra'); await p.waitForTimeout(250);
  ok(await p.locator('#view .state.nomatch').count() === 1 && (await p.locator('#view .state').innerText()).includes('No documents match “zebra”'), 'G8 no-match state (not the empty state)');
  ok(!(await menuItem('Delete')).enabled && !(await menuItem('Copy')).enabled, 'G10 Delete/Copy disabled with no document shown');
  await shot('studio-nomatch');
  await p.click('#view .state [data-act]'); await p.waitForTimeout(250);
  ok((await p.locator('.js-row').count()) >= 5, 'G8 Clear Search restores the list');
  const nd = (await docs()).length;
  await p.click('[data-js-new]');
  ok((await docs()).length === nd + 1, 'JS-4 New from the window toolbar');
  await p.evaluate(() => document.querySelector('.js-list').focus());
  await key('Meta+Backspace');
  await p.waitForSelector('#dlg:not([hidden])'); await shot('confirm-delete');
  await p.click('#dlg [data-r="1"]');
  ok((await docs()).length === nd, 'G10 ⌘⌫ deletes the document after confirming');
  await p.click('[data-del]'); await p.click('#dlg [data-r="0"]');
  ok((await docs()).length === nd, 'JS-4 Cancel keeps the document');

  /* ---------- G8: large document — background validate + format, never stored ---------- */
  await scn('json.large', true);
  await p.waitForFunction(() => document.querySelector('.js-row.sel') && document.querySelector('.js-row.sel').dataset.id === 'doc-large');
  ok(/Event export[\s\S]*2\.4 MB/.test(await p.locator('.js-row.sel').innerText()), 'G8 scenario adds and opens “Event export” (2.4 MB)');
  ok((await status()).includes('Validating in the background'), 'G8 large document validates in the background');
  await shot('large-validating');
  await p.waitForFunction(() => /^Valid JSON/.test(document.querySelector('[data-st]').innerText), null, { timeout: 5000 });
  ok(/^Valid JSON · [\d,]+ keys · 2 spaces$/.test(await status()), 'G8 then shows the result: ' + (await status()));
  await p.click('[data-run=Minified]');
  ok(await p.isVisible('[data-work]') && (await p.locator('[data-work]').innerText()).includes('Minifying in the background'), 'G8 Minify shows a background state');
  await p.waitForSelector('[data-work]', { state: 'hidden', timeout: 6000 });
  ok(!(await p.evaluate(() => document.querySelector('[data-text]').value.includes('\n'))), 'G8 minified result lands');
  await p.click('[data-run=Formatted]');
  ok((await p.locator('[data-work]').innerText()).includes('Formatting in the background…'), 'G8 Format shows “Formatting in the background…”');
  await shot('large-formatting');
  await p.waitForSelector('[data-work]', { state: 'hidden', timeout: 6000 });
  await p.waitForFunction(() => /^Valid JSON/.test(document.querySelector('[data-st]').innerText), null, { timeout: 5000 });
  ok((await status()).includes('2 spaces'), 'G8 formatted result + status');
  ok(!(await menuItem('Copy')).enabled, 'G10 Copy disabled for the 2.4 MB document (kept out of Clipboard history)');
  await shot('large-done');
  await p.waitForTimeout(400);
  const stored = await p.evaluate(() => localStorage.getItem('oneshot.v3.data.json') || '');
  ok(!stored.includes('Event export') && stored.length < 20000, 'G8 the large document is never written to the store (' + stored.length + ' bytes)');
  await scn('json.large', false);
  ok(!(await p.locator('.js-row').allInnerTexts()).some((x) => x.includes('Event export')), 'G8 turning the scenario off removes it');

  /* ---------- JS-5 prefs: indent, sort keys, hotkey ---------- */
  await p.evaluate(() => OS.openPrefs('json'));
  await p.click('#prefs [data-k="json.indent"] button[data-v="4"]');
  await shot('prefs-json');
  await closeWin();
  const o2 = await selectLine(VALID);
  await key('Control+Alt+KeyF'); await pill().waitFor();
  ok((await ta()).includes('{\n    "service": "status",'), 'JS-5 indent 4 changes output');
  await p.click('#float [data-undo]');
  await p.evaluate(() => OS.openPrefs('json'));
  await p.click('#prefs [data-k="json.indent"] button[data-v=\'"tab"\']');
  await p.click('#prefs .sw[data-k="json.sortKeys"]');
  await closeWin();
  await selectLine(VALID); await key('Control+Alt+KeyF'); await pill().waitFor();
  t = await ta();
  ok(t.includes('{\n\t"latency"') && t.indexOf('"latency"') < t.indexOf('"ok"'), 'JS-5 tab indent + sort keys change output');
  await p.click('#float [data-undo]');
  ok((await ta()).includes(o2), 'JS-5 undo again');
  await p.evaluate(() => OS.openPrefs('hotkeys'));
  await p.click('#prefs [data-hk="json.format"]'); await key('Control+Alt+KeyJ');
  ok((await p.locator('#prefs [data-hk="json.format"]').innerText()) === '⌃⌥J', 'JS-5 hotkey re-bound');
  await closeWin();
  await selectLine(VALID);
  await key('Control+Alt+KeyF'); await p.waitForTimeout(200);
  ok(!(await floatOpen()), 'JS-5 old hotkey no longer fires');
  await key('Control+Alt+KeyJ'); await pill().waitFor();
  ok(true, 'JS-5 new hotkey fires'); await key('Escape');
  await p.evaluate(() => { OS.hotkey.reset('json.format'); OS.setPref('json.sortKeys', false); });

  /* ---------- reload: data + pref persist; Studio docs live in the store, not prefs ---------- */
  await studio();
  await p.click('[data-js-new]'); await p.fill('[data-name]', 'Kept across launches'); await p.fill('[data-text]', '{"kept":true}');
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(600);
  ok((await docs()).some((d) => d.name === 'Kept across launches' && d.text === '{"kept":true}'), 'G1 reload keeps the new document');
  ok(await p.evaluate(() => OS.pref('json.indent')) === 'tab', 'G1 reload keeps the indent pref');
  ok(await p.evaluate(() => !JSON.stringify(JSON.parse(localStorage.getItem('oneshot.v3.prefs'))).includes('Kept across launches')), 'G1 documents are not stored in prefs');
  await p.evaluate(() => OS.openPrefs('storage'));
  ok((await p.locator('#prefs').innerText()).includes('Documents stay until you delete them'), 'G1 Storage pane shows the store rule');
  await p.evaluate(() => OS.setPref('json.indent', 2));

  /* ---------- HO-2 service: Clipboard → Format → Studio ---------- */
  await closeWin();
  await p.evaluate(() => OS.call('json.format', { text: '{"z":1,"y":{"b":2,"a":3}}', source: 'Clipboard', clipId: 'clip-test-1', x: 700, y: 300 }));
  await pill().waitFor();
  ok((await p.locator('#float [data-prev]').innerText()).includes('"z": 1'), 'HO-2 service shows a formatted preview');
  await shot('service-pill');
  await p.click('#float [data-m=Sorted]');
  const prev = await p.locator('#float [data-prev]').innerText();
  ok(prev.indexOf('"y"') < prev.indexOf('"z"'), 'HO-2 service modes work');
  await p.click('#float [data-copy]');
  ok(await p.evaluate(() => OS.pasteboard.current.kind === 'json' && OS.pasteboard.current.text.includes('"y"')), 'HO-2 service Copy writes the pasteboard');
  await p.click('#float [data-open]'); await p.waitForSelector('#view .js-row.sel');
  const cd = (await docs()).find((d) => d.source === 'Clipboard' && d.text.includes('"y"'));
  ok(cd && (await selId()) === cd.id, 'HO-2 Studio opens the clip document, selected');

  /* ---------- store failure on runtime surfaces ---------- */
  await closeWin();
  await scn('json.fail', true);
  await selectLine(VALID); await key('Control+Alt+KeyF');
  await p.locator('#float .state.failure').waitFor();
  ok((await p.locator('#float').innerText()).includes('Try Again'), 'ST-1 Format pill shows the store failure');
  await shot('pill-store-fail');
  await key('Escape');

  /* ---------- ST-1 states in Studio ---------- */
  await p.evaluate(() => OS.open('json'));
  await p.waitForSelector('#view .state.failure');
  ok(true, 'ST-1 failure state'); await shot('state-failure');
  await scn('json.fail', false);
  await p.waitForSelector('#view .js-row');
  ok(true, 'ST-1 recovers when the store answers');
  await scn('slow', true); await p.evaluate(() => OS.open('json'));
  ok(await p.locator('#view .skel').count() === 1, 'ST-1/G8 loading skeleton'); await shot('state-loading');
  await scn('slow', false); await p.waitForSelector('#view .js-row', { timeout: 4000 });
  await scn('json.empty', true);
  await p.waitForSelector('#view .state.empty');
  ok((await p.locator('#view .state').innerText()).includes('Documents stay until you delete them'), 'ST-1 empty state explains the repository');
  await shot('state-empty');
  await p.click('#view .state [data-act]');
  ok((await p.locator('.js-ed').count()) === 1, 'ST-1 empty-state action creates a document');
  await scn('json.empty', false);

  /* ---------- ST-2 Accessibility ---------- */
  await closeWin();
  await p.evaluate(() => OS.perm.set('access', false));
  await selectLine(VALID); await key('Control+Alt+KeyF');
  await p.locator('#float .state.permission').waitFor();
  await shot('pill-no-access');
  const tb = await ta();
  await p.click('#float [data-grant]'); await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await pill().waitFor();
  ok((await ta()) !== tb, 'ST-2 granting Accessibility unblocks Format in place');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('json: all passed');
})().catch((e) => { console.error(e.message, globalThis.__errs || ''); process.exit(1); });
