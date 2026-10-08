// node tools/test-json.js   — walks JS-1..JS-5, HO-2 (Format -> Studio), ST-1/2/3 for JSON.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
let n = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; throw new Error(m); };
const ok = (c, m) => { if (!c) fail(m); console.log('ok   ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (name) => p.screenshot({ path: `/tmp/json-${String(++n).padStart(2, '0')}-${name}.png` });
  const ta = () => p.evaluate(() => OS.host.textedit.value());
  const selectLine = (prefix) => p.evaluate((pre) => { if (OS.host.textedit.value().indexOf(pre) < 0) OS.host.textedit.el().value = window.__orig; const v = OS.host.textedit.value(); const s = v.indexOf(pre); const e = v.indexOf('\n', s); OS.host.textedit.select(s, e); return v.slice(s, e); }, prefix);
  const docs = () => p.evaluate(() => OS.data.json.docs.map((d) => ({ id: d.id, name: d.name, text: d.text, source: d.source, at: d.at })));
  const pill = () => p.locator('#float .js-pill');
  const closeWin = async () => { if (await p.locator('#win').isVisible()) await p.click('#rail [data-close]'); };
  const scn = async (key) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${key}"]`); await p.keyboard.press('Escape'); };

  await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
  await closeWin();
  const VALID = '{"service":"status"', INVALID = '{"event":"deploy"';

  // JS-1 format
  const orig = await selectLine(VALID);
  const before = (await docs()).length;
  await p.keyboard.press('Control+Alt+KeyF');
  await pill().waitFor();
  let t = await ta();
  ok(t.includes('{\n  "service": "status",'), 'JS-1 selection replaced with 2-space Formatted output');
  const sel = await p.evaluate(() => OS.host.textedit.getSelection());
  ok(sel.text.startsWith('{') && sel.text.endsWith('}') && sel.text.includes('\n'), 'JS-1 replaced range stays selected');
  const ds = await docs();
  ok(ds.length === before + 1 && /^TextEdit \d+:\d\d$/.test(ds[0].name) && ds[0].source === 'TextEdit' && ds[0].text === sel.text, 'JS-1 doc created in Studio data ("' + ds[0].name + '")');
  await shot('pill-formatted');
  await p.click('#float [data-m=Minified]');
  ok((await ta()).includes(orig), 'JS-1 Minified re-replaces the same range');
  await p.click('#float [data-m=Sorted]');
  t = await ta();
  ok(t.indexOf('"latency"') < t.indexOf('"ok"') && t.indexOf('"ok"') < t.indexOf('"regions"'), 'JS-1 Sorted orders keys');
  ok((await docs()).length === before + 1, 'JS-1 mode switch updates the same doc');
  await shot('pill-sorted');
  await p.click('#float [data-undo]');
  ok((await ta()).includes(orig) && !(await p.locator('#float').isVisible()), 'JS-1 Undo restores original and closes');

  // Esc + desk click do not re-run
  await selectLine(VALID); await p.keyboard.press('Control+Alt+KeyF'); await pill().waitFor();
  const afterFmt = await ta(), cnt = (await docs()).length;
  await p.keyboard.press('Escape');
  ok(!(await p.locator('#float').isVisible()) && (await ta()) === afterFmt, 'JS-1 Esc closes the pill, text kept');
  await p.keyboard.press('Control+Alt+KeyF'); await pill().waitFor();
  await p.mouse.click(700, 760);
  await p.waitForTimeout(150);
  ok(!(await p.locator('#float').isVisible()), 'JS-1 outside click closes pill');
  ok((await docs()).length === cnt + 1 || (await docs()).length === cnt, 'JS-1 desk click creates nothing further');
  ok(cnt === before + 1, 'D8 formatting the same text again reuses its document (' + cnt + ' docs)');
  const cnt2 = (await docs()).length, t2 = await ta();
  await p.mouse.click(700, 700); await p.waitForTimeout(150);
  ok((await docs()).length === cnt2 && (await ta()) === t2 && !(await p.locator('#float').isVisible()), 'JS-1 clicking the desk later does NOT re-run Format');

  // no selection hint
  await p.evaluate(() => OS.host.textedit.select(5, 5));
  await p.keyboard.press('Control+Alt+KeyF');
  await p.locator('#float .js-hint').waitFor();
  ok((await p.locator('#float').innerText()).includes('Select JSON in the document first'), 'JS-1 no selection -> hint');
  await shot('hint');
  await p.keyboard.press('Escape');

  // JS-2 invalid
  const bad = await selectLine(INVALID);
  const txtBefore = await ta();
  await p.keyboard.press('Control+Alt+KeyF');
  await pill().waitFor();
  const col = bad.indexOf(',]') + 2;
  const pt = await p.locator('#float').innerText();
  ok(pt.includes('Invalid JSON') && pt.includes(`line 1, column ${col}`), 'JS-2 failure pill: ' + pt.replace(/\n/g, ' | '));
  ok((await ta()) === txtBefore, 'JS-2 text unchanged');
  await shot('pill-invalid');
  const c0 = (await docs()).length;
  await p.click('#float [data-open]');
  await p.waitForTimeout(500);
  const selId = await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id);
  const d1 = (await docs()).find((d) => d.id === selId);
  ok(d1 && d1.text === bad && (await docs()).length === c0 + 1, 'JS-2/JS-3 Open in Studio opens a doc with the invalid text');
  ok((await p.locator('[data-valid]').innerText()).startsWith('Invalid · line 1 col ' + col), 'JS-4 Studio shows Invalid · line/col');
  await shot('studio-invalid');
  // fix it in the editor
  await p.fill('[data-text]', bad.replace(',]', ']'));
  ok((await p.locator('[data-valid]').innerText()) === 'Valid', 'JS-4 editing fixes validity live');
  ok((await docs()).find((d) => d.id === selId).text === bad.replace(',]', ']'), 'JS-4 edit saved to the doc');
  await p.click('[data-fmt]');
  ok((await p.inputValue('[data-text]')).includes('{\n  "event": "deploy",'), 'JS-4 Studio Format uses prefs');

  // JS-3 handoff selects same doc
  await closeWin();
  await selectLine(VALID); await p.keyboard.press('Control+Alt+KeyF'); await pill().waitFor();
  const newest = (await docs()).sort((a, b) => b.at - a.at)[0];
  await p.click('#float [data-open]');
  await p.waitForTimeout(500);
  ok((await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id)) === newest.id && (await p.inputValue('[data-text]')) === newest.text, 'JS-3/HO-2 Open in Studio selects that same document');
  await shot('studio-handoff');
  // D4 keyboard: list has focus on mount, arrows move selection, Enter focuses the editor
  ok(await p.evaluate(() => document.activeElement.classList.contains('js-list')), 'D4 Studio list is focused on mount');
  const k0 = await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id);
  await p.keyboard.press('ArrowDown');
  const k1 = await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id);
  ok(k1 !== k0, 'D4 ArrowDown moves the Studio selection');
  await p.keyboard.press('ArrowUp');
  ok((await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id)) === k0, 'D4 ArrowUp moves back');
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement.matches('[data-text]')), 'D4 Enter focuses the editor');
  await p.keyboard.press('ArrowDown');
  ok((await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id)) === k0, 'D4 arrows in the editor do not move the selection');

  // JS-4 list / new / search / delete
  await p.click('[data-new]');
  ok((await p.inputValue('[data-name]')) === 'Untitled' && (await p.locator('[data-valid]').innerText()) === 'Empty', 'JS-4 New document');
  await p.fill('[data-text]', '{"b":2,"a":[1,2]}');
  await p.click('[data-sort]');
  ok((await p.inputValue('[data-text]')).indexOf('"a"') < (await p.inputValue('[data-text]')).indexOf('"b"'), 'JS-4 Sort keys button');
  await p.click('[data-min]');
  ok((await p.inputValue('[data-text]')) === '{"a":[1,2],"b":2}', 'JS-4 Minify button');
  await p.click('[data-copy]');
  ok(await p.evaluate(() => OS.pasteboard.current.text === '{"a":[1,2],"b":2}'), 'JS-4 Copy writes pasteboard');
  await p.fill('[data-q]', 'Feature');
  ok((await p.locator('.js-row').count()) === 1, 'JS-4 search filters list');
  await p.fill('[data-q]', '');
  const nd = (await docs()).length;
  await p.click('[data-new]'); await p.click('[data-del]');
  await shot('confirm-delete');
  await p.click('#dlg [data-r="1"]');
  ok((await docs()).length === nd, 'JS-4 Delete with confirm removes document');
  await p.click('[data-del]'); await p.click('#dlg [data-r="0"]');
  ok((await docs()).length === nd, 'JS-4 Cancel keeps document');
  await shot('studio-list');

  // JS-5 prefs: indent, sortKeys, hotkey
  await p.click('#rail [data-go=prefs]');
  await p.click('#ps-json [data-k="json.indent"] button[data-v="4"]');
  await shot('prefs-json');
  await closeWin();
  const o2 = await selectLine(VALID);
  await p.keyboard.press('Control+Alt+KeyF'); await pill().waitFor();
  ok((await ta()).includes('{\n    "service": "status",'), 'JS-5 indent=4 changes output');
  await p.click('#float [data-undo]');
  await p.click('[data-mb=oneshot]'); await p.keyboard.press('Escape');
  await p.evaluate(() => OS.openPrefs('json'));
  await p.click('#ps-json [data-k="json.indent"] button[data-v="\\"tab\\""]');
  await p.click('#ps-json .sw[data-k="json.sortKeys"]');
  await closeWin();
  await selectLine(VALID); await p.keyboard.press('Control+Alt+KeyF'); await pill().waitFor();
  t = await ta();
  ok(t.includes('{\n\t"latency"') && t.indexOf('"latency"') < t.indexOf('"ok"'), 'JS-5 tab indent + sort keys change output');
  await p.click('#float [data-undo]');
  ok((await ta()).includes(o2), 'JS-5 undo again');
  await p.evaluate(() => OS.openPrefs('json'));
  await p.click('#prefs [data-hk="json.format"]');
  await p.keyboard.press('Control+Alt+KeyJ');
  ok((await p.locator('#prefs [data-hk="json.format"]').innerText()) === '⌃⌥J', 'JS-5 hotkey re-bound label');
  await closeWin();
  await selectLine(VALID);
  await p.keyboard.press('Control+Alt+KeyF'); await p.waitForTimeout(200);
  ok(!(await p.locator('#float').isVisible()), 'JS-5 old hotkey no longer fires');
  await p.keyboard.press('Control+Alt+KeyJ'); await pill().waitFor();
  ok(true, 'JS-5 new hotkey fires');
  await p.keyboard.press('Escape');
  await p.evaluate(() => { OS.openPrefs('json'); });
  await p.click('#prefs [data-hk="json.format"]'); await p.keyboard.press('Control+Alt+KeyF');
  await p.click('#ps-json [data-k="json.indent"] button[data-v="2"]');
  await p.click('#ps-json .sw[data-k="json.sortKeys"]');
  await closeWin();

  // HO-2 service: Clipboard -> Format -> Studio
  await p.evaluate(() => OS.call('json.format', { text: '{"z":1,"y":{"b":2,"a":3}}', source: 'Clipboard', clipId: 'clip-test-1', x: 700, y: 300 }));
  await pill().waitFor();
  ok((await p.locator('#float [data-prev]').innerText()).includes('"z": 1'), 'HO-2 service shows formatted preview');
  await shot('service-pill');
  await p.click('#float [data-m=Sorted]');
  ok((await p.locator('#float [data-prev]').innerText()).indexOf('"y"') < (await p.locator('#float [data-prev]').innerText()).indexOf('"z"'), 'HO-2 service modes work');
  await p.click('#float [data-copy]');
  ok(await p.evaluate(() => OS.pasteboard.current.kind === 'json' && OS.pasteboard.current.text.includes('"y"')), 'HO-2 service Copy writes pasteboard');
  await p.click('#float [data-open]'); await p.waitForTimeout(400);
  const cd = (await docs()).find((d) => d.source === 'Clipboard' && d.text.includes('"y"'));
  ok(cd && (await p.evaluate(() => document.querySelector('.js-row.sel').dataset.id)) === cd.id, 'HO-2 Studio opens the clip document, selected');
  await p.evaluate(() => OS.call('json.format', { text: '{"a":,}', source: 'Clipboard', clipId: 'clip-test-2', x: 700, y: 300 }));
  ok((await p.locator('#float').innerText()).includes('Invalid JSON'), 'HO-2 service invalid shows failure pill');
  await p.keyboard.press('Escape');

  // D3 store failure on the runtime surfaces
  await scn('json.fail');
  await selectLine(VALID); await p.keyboard.press('Control+Alt+KeyF');
  await p.locator('#float .state.failure').waitFor();
  ok((await p.locator('#float').innerText()).includes('Try again'), 'D3 Format pill shows the store failure with Try again');
  await shot('pill-store-fail');
  await p.keyboard.press('Escape');
  await p.evaluate(() => OS.call('json.format', { text: '{"a":1}', source: 'Clipboard', clipId: 'clip-test-3', x: 700, y: 300 }));
  await p.locator('#float .state.failure').waitFor();
  ok(true, 'D3 json.format service pill shows the store failure');
  await scn('json.fail');

  // ST-1 states
  await scn('json.fail');
  await p.evaluate(() => OS.front('#win'));
  await p.click('#rail [data-go=json]'); await p.waitForTimeout(500);
  ok((await p.locator('#view .state.failure').count()) === 1, 'ST-1 failure state'); await shot('state-failure');
  await scn('json.fail');
  await p.click('#view [data-act]'); await p.waitForTimeout(500);
  ok((await p.locator('.js-row').count()) > 0, 'ST-1 Try again loads');
  await scn('json.empty');
  await p.waitForTimeout(300);
  ok((await p.locator('#view .state.empty').count()) === 1, 'ST-1 empty state'); await shot('state-empty');
  await p.click('#view [data-act]');
  ok((await p.locator('.js-ed').count()) === 1 && (await docs()).length === 1, 'ST-1 empty-state action creates a document');
  await scn('json.empty');
  await scn('slow'); await p.click('#rail [data-go=json]');
  await p.waitForTimeout(300); ok((await p.locator('#view .state.loading').count()) === 1, 'ST-1 loading state'); await shot('state-loading');
  await scn('slow'); await p.waitForTimeout(2000);

  // ST-2 Accessibility
  await closeWin();
  await p.evaluate(() => OS.perm.set('access', false));
  await selectLine(VALID); await p.keyboard.press('Control+Alt+KeyF');
  await p.locator('#float .state.permission').waitFor();
  await shot('pill-no-access');
  const tb = await ta();
  await p.click('#float [data-grant]'); await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await pill().waitFor();
  ok((await ta()) !== tb, 'ST-2 granting Accessibility unblocks Format in place');

  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors');
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
