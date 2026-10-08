// Usage: node tools/test-clipboard.js   — walks CB-1..CB-5, HO-2 (Clipboard leg), ST-1/ST-2 for Clipboard.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (n) => p.screenshot({ path: `/tmp/clipboard-${n}.png` });
  const key = (k) => p.keyboard.press(k);
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.map((c) => ({ id: c.id, kind: c.kind, text: c.text, pinned: c.pinned, at: c.at, source: c.source })));
  const rows = () => p.$$eval('#float .cb-r .t', (n) => n.map((x) => x.textContent));
  const floatOpen = () => p.evaluate(() => !document.querySelector('#float').hidden);
  const wrench = async (key) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${key}"]`); await key_('Escape'); };
  const front = () => p.evaluate(() => OS.front('#win')); // same as clicking the OneShot window
  const key_ = (k) => p.keyboard.press(k);
  const rail = async (id) => { if (await p.$eval('#win', (e) => e.hidden)) await p.evaluate((i) => OS.open(i), id); else { await front(); await p.click(`#rail [data-go=${id}]`); } };
  const copyInTextEdit = async (a, bb) => { await p.evaluate(([a, bb]) => { OS.host.textedit.select(a, bb); OS.host.textedit.el().dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })); }, [a, bb]); };
  const taVal = () => p.evaluate(() => OS.host.textedit.value());
  const setRange = (k, v) => p.$eval(`input[data-k="${k}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);

  /* CB-1 copy in app is kept; excluded app is not */
  const n0 = (await clips()).length;
  await copyInTextEdit(0, 21); // "Release notes — draft"
  let c = await clips();
  ok(c.length === n0 + 1 && c.some((x) => x.text === 'Release notes — draft' && x.source === 'TextEdit'), 'CB-1 TextEdit copy is recorded');
  await p.evaluate(() => { OS.host.safari.front(); const el = document.querySelector('#sf [data-ocr]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })); });
  c = await clips();
  ok(c.some((x) => x.source === 'Safari' && x.text.includes('Acme') || x.text.includes('Sign in')), 'CB-1 Safari copy is recorded');
  await p.evaluate(() => OS.openPrefs('permissions'));
  await p.click('[data-k="policy.TextEdit"]');
  await copyInTextEdit(22, 60);
  c = await clips();
  ok(!c.some((x) => x.text.startsWith('Ship the status endpoint before Friday.') && x.source === 'TextEdit' && x.at > Date.now() - 3000), 'CB-1 excluded source (TextEdit policy off) is not recorded');
  await shot('01-policy');
  await p.click('[data-k="policy.TextEdit"]');
  await p.evaluate(() => OS.host.textedit.select(0, 0));
  await p.evaluate(() => { document.querySelector('#win').hidden = true; });

  /* CB-2 float at caret, filter, paste, Esc */
  await p.evaluate(() => OS.host.textedit.select(40, 40));
  await key('Control+Alt+KeyV');
  ok(await floatOpen(), 'CB-2 hotkey opens the float');
  const fr = await p.$eval('#float', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  ok(fr.x > 36 && fr.x < 600 && fr.y > 80 && fr.y < 520, 'CB-2 float sits at the TextEdit caret (' + Math.round(fr.x) + ',' + Math.round(fr.y) + ')');
  let r0 = await rows();
  ok(r0.length === 8 && r0[0] !== 'maya@acme.io', 'CB-2 8 rows, newest first (pins do not lead by default): ' + r0[0]);
  ok(!(await p.evaluate(() => OS.pref('clipboard.pinnedFirst'))), 'D5 pinnedFirst defaults to off');
  await shot('02-float');
  await p.keyboard.type('standup');
  r0 = await rows();
  ok(r0.length === 1 && r0[0].startsWith('Standup'), 'CB-2 type-to-filter');
  await shot('03-float-filter');
  for (let i = 0; i < 7; i++) await key('Backspace');
  await key('ArrowDown'); await key('ArrowDown'); await key('ArrowUp');
  const sel = await p.$eval('#float .cb-r.sel .t', (e) => e.textContent);
  ok(!!sel, 'CB-2 arrow keys move selection: ' + sel);
  const before = await taVal();
  await key('Enter');
  ok(!(await floatOpen()), 'CB-2 Enter closes the float');
  const after = await taVal();
  ok(after.length > before.length && after.includes(sel.slice(0, 12)), 'CB-2 selected item pasted into the document');
  c = await clips();
  const top = c.filter((x) => !x.pinned).sort((a, b) => b.at - a.at)[0];
  ok(top.text.startsWith(sel.slice(0, 12)), 'CB-2 pasted item moved to top of history');
  await key('Control+Alt+KeyV');
  r0 = await rows();
  ok(r0[0].startsWith(sel.slice(0, 12)), 'D5 float shows the pasted item at index 0 with defaults');
  // click paste
  const len1 = (await taVal()).length;
  await p.click('#float .cb-r:nth-child(4)');
  ok((await taVal()).length > len1 && !(await floatOpen()), 'CB-2 click pastes');
  // Esc / outside click: nothing pasted
  const len2 = (await taVal()).length;
  await key('Control+Alt+KeyV'); await key('Escape');
  ok(!(await floatOpen()) && (await taVal()).length === len2, 'CB-2 Esc dismisses, nothing pasted');
  await key('Control+Alt+KeyV'); await p.mouse.click(900, 700);
  ok(!(await floatOpen()) && (await taVal()).length === len2, 'CB-2 outside click dismisses, nothing pasted');

  /* CB-3 view */
  await rail('clipboard');
  await p.waitForSelector('#view .split .row');
  ok((await p.$$('#view .row')).length >= 10, 'CB-3 list renders');
  const lastUsed = (await clips()).sort((a, b) => b.at - a.at)[0];
  ok((await p.$eval('#view .row .t', (e) => e.textContent)).startsWith(lastUsed.text.replace(/\s+/g, ' ').slice(0, 12)) && !(lastUsed.pinned), 'D5 history view shows the pasted item at index 0 with defaults');
  ok(await p.$eval('#view .row:nth-child(4)', (e) => !!e.querySelector('.cb-pin')) || (await p.$$('#view .cb-pin')).length === 1, 'D5 pinned item still shows the pin icon');
  /* D4 keyboard: list focused on mount; arrows move selection; Enter copies and moves to top */
  ok(await p.evaluate(() => document.activeElement.classList.contains('list')), 'D4 history list is focused on mount');
  const id0 = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await key('ArrowDown');
  const id1 = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  ok(id1 !== id0 && id1 === await p.$eval('#view .row:nth-child(2)', (e) => e.dataset.id), 'D4 ArrowDown selects the next item');
  await key('ArrowUp');
  ok((await p.$eval('#view .row.sel', (e) => e.dataset.id)) === id0, 'D4 ArrowUp selects the previous item');
  await key('ArrowDown'); await key('ArrowDown');
  const id2 = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await key('Enter');
  await p.waitForSelector('#toasts .toast:has-text("Copied")');
  ok((await p.$eval('#view .row .t', (e) => e.parentElement.dataset.id)) === id2, 'D4 Enter copies the selected item and moves it to the top');
  await p.fill('#view .search', 'x'); await key('ArrowDown');
  ok((await p.$$('#view .row')).length >= 0, 'D4 arrows in the search box do not throw'); await p.fill('#view .search', '');
  await shot('04-view');
  await p.fill('#view .search', 'pull/412');
  ok((await p.$$('#view .row')).length === 1, 'CB-3 search');
  await p.fill('#view .search', '');
  await p.click('[data-type] [data-v=json]');
  ok((await p.$$('#view .row')).length >= 2, 'CB-3 type filter JSON');
  await shot('05-view-json');
  await p.click('[data-type] [data-v=all]');
  // pin
  await p.click('#view .row:nth-child(5)');
  const pinId = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await p.click('[data-a=pin]');
  ok((await clips()).find((x) => x.id === pinId).pinned, 'CB-3 pin');
  await key('Control+Alt+KeyV');
  ok((await rows()).length > 0 && (await p.$$('#float .cb-pin')).length === 2, 'CB-3 pin shows in the float');
  await key('Escape');
  await front(); await p.click('#view .row.sel'); await p.click('[data-a=del]');
  ok(!(await clips()).some((x) => x.id === pinId), 'CB-3 delete');
  await p.click('[data-clear]');
  await shot('06-confirm-clear');
  await p.click('#dlg [data-r="1"]');
  c = await clips();
  ok(c.length >= 1 && c.every((x) => x.pinned), 'CB-3 clear all keeps only pinned (' + c.length + ')');
  ok(await p.$eval('[data-clear]', (e) => e.disabled), 'CB-3 clear all disabled with nothing to clear');
  await shot('07-view-pinned-only');

  /* CB-4 settings change history */
  await wrench('clipboard.empty'); await wrench('clipboard.empty'); // on -> off restores seed
  await p.waitForTimeout(100);
  await rail('clipboard'); await p.waitForSelector('#view .row');
  const seeded = (await clips()).length;
  ok(seeded === 10, 'CB-4 seed restored (10 clips)');
  await p.evaluate(() => OS.openPrefs('clipboard'));
  await setRange('clipboard.limit', 5);
  c = await clips();
  ok(c.filter((x) => !x.pinned).length === 5 && c.some((x) => x.pinned), 'CB-4 limit 5 prunes unpinned only (' + c.length + ' left)');
  await setRange('clipboard.floatCount', 4);
  await shot('08-prefs');
  await key('Control+Alt+KeyV');
  ok((await rows()).length === 4, 'CB-4 float size = 4 rows');
  await key('Escape'); await front();
  await key('Control+Alt+KeyV');
  const ordC = await clips(); const newest = ordC.sort((a, b) => b.at - a.at)[0];
  ok(await p.$eval('#float .cb-r .t', (e, t) => e.textContent.startsWith(t.slice(0, 10)), newest.text), 'CB-4 pinned-first off (default): newest leads');
  await key('Escape'); await front();
  await p.click('#prefs [data-k="clipboard.pinnedFirst"]');
  await key('Control+Alt+KeyV');
  const order = await p.$$eval('#float .cb-r', (n) => n.map((x) => !!x.querySelector('.cb-pin')));
  ok(order[0] === true, 'CB-4 pinned-first on: pinned item leads the float (' + order.join(',') + ')');
  await key('Escape'); await front();
  await p.click('#prefs [data-k="clipboard.pinnedFirst"]');
  // hotkey rebind
  await front(); await p.click('[data-hk="clipboard.open"]'); await key('Control+Alt+KeyB');
  ok((await p.textContent('[data-hk="clipboard.open"]')) === '⌃⌥B', 'CB-4 hotkey re-bound');
  await key('Control+Alt+KeyV'); ok(!(await floatOpen()), 'CB-4 old hotkey no longer opens');
  await key('Control+Alt+KeyB'); ok(await floatOpen(), 'CB-4 new hotkey opens float');
  await key('Escape'); await front();
  await p.click('[data-hk="clipboard.open"]'); await key('Control+Alt+KeyV');

  /* CB-5 / HO-2 Format leg */
  await p.evaluate(() => { const oc = OS.call; OS.call = (n, x) => { if (n === 'json.format') window.__fmt = x; return oc(n, x); }; });
  await rail('clipboard'); await p.waitForSelector('#view .row');
  await p.click('#view [data-type] [data-v=json]');
  await p.click('#view .row');
  const jid = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await shot('09-json-detail');
  await p.click('[data-a=format]');
  const fmt = await p.evaluate(() => window.__fmt);
  ok(fmt && fmt.source === 'Clipboard' && fmt.clipId === jid && fmt.text.startsWith('{') && typeof fmt.x === 'number', 'CB-5 Format calls json.format with the clip');
  await shot('10-after-format'); await key('Escape');

  /* ST-2 Accessibility missing -> grant in float; granting unblocks */
  await p.evaluate(() => { document.querySelector('#win').hidden = true; OS.perm.set('access', false); });
  await key('Control+Alt+KeyV');
  ok(await p.$('#float .state.permission'), 'ST-2 float shows the grant card');
  await shot('11-no-access');
  await p.click('#float [data-grant]');
  await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await p.waitForSelector('#float .cb-r');
  ok((await rows()).length > 0, 'ST-2 granting unblocks the float in place');
  await key('Escape');

  /* ST-1 states */
  await rail('clipboard');
  await wrench('slow'); await rail('clipboard');
  ok(await p.$('#view .state.loading'), 'ST-1 loading state'); await shot('12-loading');
  await wrench('slow');
  await wrench('clipboard.fail'); await rail('clipboard'); await p.waitForSelector('#view .state.failure');
  await shot('13-failure');
  await key('Control+Alt+KeyV'); ok(await p.$('#float .state.failure'), 'ST-1 failure state in the float'); await shot('14-float-failure'); await key('Escape');
  await wrench('clipboard.fail');
  await wrench('clipboard.empty'); await rail('clipboard'); await p.waitForSelector('#view .state.empty');
  await shot('15-empty');
  await key('Control+Alt+KeyV'); ok(await p.$('#float .state.empty'), 'ST-1 empty state in the float'); await shot('16-float-empty'); await key('Escape');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('clipboard: all passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
