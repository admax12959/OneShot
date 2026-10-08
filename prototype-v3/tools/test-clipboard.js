// Usage: node tools/test-clipboard.js — walks CB-1..CB-5, HO-1/HO-2 (Clipboard side), ST-1/ST-2 and the v3 items
// (G1 retention, G8 large lists / background filter / no match, G10 menus, selection legibility, concealed copies).
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok   ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (name) => p.screenshot({ path: `/tmp/v3-clipboard-${String(++n).padStart(2, '0')}-${name}.png` });
  const key = (k) => p.keyboard.press(k);
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.map((c) => ({ id: c.id, kind: c.kind, text: c.text, pinned: c.pinned, at: c.at, source: c.source })));
  const rows = () => p.$$eval('#float .cb-r .t', (x) => x.map((e) => e.textContent));
  const floatOpen = () => p.evaluate(() => !document.querySelector('#float').hidden);
  const wrench = async (k) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${k}"]`); await key('Escape'); };
  const keyWin = () => p.click('#main > .vh', { position: { x: 560, y: 26 } });                         // click the window: it becomes key, OneShot active
  const open = async (params) => { await p.evaluate((x) => OS.open('clipboard', x || {}), params); await p.waitForSelector('#view .split .row, #view .state'); };
  const copyInTextEdit = (a, z) => p.evaluate(([a, z]) => { OS.host.textedit.select(a, z); OS.host.textedit.el().dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })); }, [a, z]);
  const taVal = () => p.evaluate(() => OS.host.textedit.value());
  const edit = () => p.evaluate(() => Object.fromEntries(OS.menus().find((m) => m.id === 'edit').items.filter((i) => i !== '-').map((i) => [i.label, !i.enabled || i.enabled()])));
  const toasts = () => p.locator('#toasts').innerText();
  const subtitle = () => p.textContent('#vhSub');

  /* CB-1 copy in an app is kept; an excluded app is not */
  const n0 = (await clips()).length;
  await copyInTextEdit(0, 21);
  let c = await clips();
  ok(c.length === n0 + 1 && c.some((x) => x.text === 'Release notes — draft' && x.source === 'TextEdit'), 'CB-1 TextEdit copy is recorded');
  await p.evaluate(() => { OS.host.safari.front(); const el = document.querySelector('#sf [data-ocr]'); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })); });
  c = await clips();
  ok(c.some((x) => x.source === 'Safari' && x.text.includes('Sign in')), 'CB-1 Safari copy is recorded');
  await p.evaluate(() => OS.openPrefs('privacy'));
  await p.click('[data-k="policy.TextEdit"]');
  await copyInTextEdit(22, 60);
  c = await clips();
  ok(!c.some((x) => x.text.startsWith('Ship the status endpoint before Friday.') && x.at > Date.now() - 3000), 'CB-1 excluded source (TextEdit off) is not recorded');
  await p.evaluate(() => OS.openPrefs('privacy'));
  await p.click('[data-k="policy.TextEdit"]');
  await p.evaluate(() => OS.closeWindow('#prefwin'));

  /* Concealed: Vault copies (marked or not) and concealed copies never enter history */
  const before = (await clips()).length;
  const r1 = await p.evaluate(() => OS.pasteboard.copy({ kind: 'text', text: 'hX7!pq2-Lm9v', source: 'Vault' }));
  await p.evaluate(() => OS.setScn('pb.unstamped', true));
  const r2 = await p.evaluate(() => OS.pasteboard.copy({ kind: 'text', text: 'Qr4#tz81-wKe', source: 'Vault' }));
  await p.evaluate(() => OS.setScn('pb.unstamped', false));
  c = await clips();
  ok(r1.concealed && !r1.recorded && !r2.concealed && !r2.recorded && c.length === before && !c.some((x) => /hX7!|Qr4#/.test(x.text)), 'Concealed: Vault copies are never recorded (stamped or not)');

  /* CB-2 float at the caret; non-activating */
  await p.evaluate(() => OS.host.textedit.select(40, 40));
  await key('Control+Alt+KeyV');
  ok(await floatOpen(), 'CB-2 hotkey opens the float');
  ok((await p.evaluate(() => OS.app.active())) === 'TextEdit', 'G10 float is non-activating: TextEdit stays the active app');
  const fr = await p.$eval('#float', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  ok(fr.x > 36 && fr.x < 600 && fr.y > 80 && fr.y < 520, 'CB-2 float sits at the TextEdit caret');
  let r0 = await rows();
  ok(r0.length === 8, 'CB-2 8 rows by default');
  await shot('float');
  ok(await p.$eval('#float .cb-r.sel .cb-ico', (e) => { const s = getComputedStyle(e), i = getComputedStyle(e.querySelector('.ic')); return s.backgroundColor !== 'rgb(255, 255, 255)' && i.color === 'rgb(255, 255, 255)' && s.backgroundColor.startsWith('rgba(255, 255, 255, 0.2'); }), 'Fix: selected float row icon is white on a translucent tile, not a white square');
  await p.keyboard.type('standup');
  r0 = await rows();
  ok(r0.length === 1 && r0[0].startsWith('Standup'), 'CB-2 type to filter');
  await p.keyboard.type('zzz');
  ok(await p.$('#float .state.nomatch'), 'CB-2 float no-match state');
  for (let i = 0; i < 10; i++) await key('Backspace');
  await key('ArrowDown'); await key('ArrowDown'); await key('ArrowUp');
  const sel = await p.$eval('#float .cb-r.sel .t', (e) => e.textContent);
  const tb = await taVal();
  await key('Enter');
  ok(!(await floatOpen()) && (await taVal()).length > tb.length && (await taVal()).includes(sel.slice(0, 12)), 'CB-2 Enter pastes the selected clip and closes');
  c = await clips();
  ok(c.filter((x) => !x.pinned).sort((a, b2) => b2.at - a.at)[0].text.startsWith(sel.slice(0, 12)), 'CB-2 pasted clip moves to top');
  const len2 = (await taVal()).length;
  await key('Control+Alt+KeyV'); await key('Escape');
  ok(!(await floatOpen()) && (await taVal()).length === len2, 'CB-2 Esc dismisses, nothing pasted');
  await key('Control+Alt+KeyV'); await p.mouse.click(900, 820);
  ok(!(await floatOpen()) && (await taVal()).length === len2, 'CB-2 outside click dismisses, nothing pasted');

  /* CB-3 history view + G10 menus + selection legibility */
  await open();
  ok((await p.$$('#view .row')).length >= 10, 'CB-3 list renders');
  ok(/\d+ clips · 1 pinned/.test(await subtitle()), 'G8 counts in the window subtitle: ' + await subtitle());
  ok((await p.textContent('#view .cb-foot')).includes('Keeps 50 unpinned clips · pinned clips stay'), 'G1 retention rule in the history footer');
  ok(await p.evaluate(() => document.activeElement.classList.contains('list')), 'CB-3 list is focused on mount');
  const keyTile = await p.$eval('#view .row.sel .cb-ico', (e) => ({ bg: getComputedStyle(e).backgroundColor, fg: getComputedStyle(e.querySelector('.ic')).color }));
  ok(keyTile.fg === 'rgb(255, 255, 255)' && keyTile.bg !== 'rgb(255, 255, 255)' && !/^rgb\(2[34]\d, 2[34]\d, 2[34]\d\)$/.test(keyTile.bg), 'Fix: key selection icon is white on a translucent tile (' + keyTile.bg + ')');
  await shot('view-key-selection');
  await p.click('#te .tb');                                                // TextEdit becomes key: our selection turns grey
  const greyTile = await p.$eval('#view .row.sel .cb-ico', (e) => ({ fg: getComputedStyle(e.querySelector('.ic')).color, row: getComputedStyle(e.closest('.row')).backgroundColor }));
  ok(greyTile.fg !== 'rgb(255, 255, 255)' && !greyTile.row.includes('10, 100, 216'), 'Fix: non-key selection is grey with a dark icon (' + greyTile.fg + ')');
  await shot('view-nonkey-selection');
  await keyWin();
  let m = await edit();
  ok(m['Copy Clip'] === true && m['Delete Clip'] === true && m['Find in History…'] === true && m['Select All'] === false, 'G10 Edit menu: Copy Clip / Delete Clip / Find enabled with a selection; Select All not offered');
  await p.click('#mbL [data-menu=edit]');
  await shot('edit-menu');
  await key('Escape');
  await p.click('#view .row.sel');
  const id0 = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await key('ArrowDown');
  ok((await p.$eval('#view .row.sel', (e) => e.dataset.id)) !== id0, 'CB-3 ArrowDown moves the selection');
  await key('ArrowDown');
  const id2 = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await key('Meta+KeyC');
  await p.waitForSelector('#toasts .toast:has-text("Copied")');
  ok((await p.$eval('#view .row', (e) => e.dataset.id)) === id2, 'G10 ⌘C (Copy Clip) copies the selection and moves it to the top');
  await key('Meta+KeyF');
  ok(await p.evaluate(() => document.activeElement.classList.contains('search')), 'G10 ⌘F focuses the search field');

  /* G8 background filter: indicator, results, no match with Clear Search */
  await p.evaluate(() => OS.setScn('slow', true));
  await p.fill('#view .search', 'pull/412');
  ok(await p.isVisible('#view .cb-q.busy .cb-spin') && await p.isVisible('#view [data-busy]'), 'G8 filtering indicator shows in the search field');
  await shot('filtering');
  await p.waitForSelector('#view .cb-q:not(.busy)');
  ok((await p.$$('#view .row')).length === 1 && /1 of \d+ clips/.test(await subtitle()), 'CB-3 search finds one clip; subtitle shows "1 of N"');
  await p.fill('#view .search', 'nothing-like-this');
  await p.waitForSelector('#view .state.nomatch');
  ok((await p.textContent('#view .state.nomatch')).includes('No clips match') && (await p.textContent('#view .state.nomatch [data-act]')) === 'Clear Search', 'G8 no-match state (distinct from empty) with Clear Search');
  m = await edit();
  ok(m['Copy Clip'] === false && m['Delete Clip'] === false, 'G10 Copy/Delete disable when nothing is selected');
  await shot('nomatch');
  await p.click('#view .state.nomatch [data-act]');
  await p.waitForSelector('#view .row');
  ok((await p.inputValue('#view .search')) === '' && (await p.$$('#view .row')).length >= 10, 'G8 Clear Search restores the list');
  await p.evaluate(() => OS.setScn('slow', false));
  await p.click('#view [data-type] [data-v=json]');
  await p.waitForSelector('#view .cb-q:not(.busy)');
  ok((await p.$$('#view .row')).length >= 2 && (await p.$$eval('#view .row .cb-ico', (x) => x.length)) >= 2, 'CB-3 type filter JSON');
  await p.click('#view [data-type] [data-v=image]');
  await p.waitForSelector('#view .state.nomatch');
  ok((await p.textContent('#view .state.nomatch [data-act]')) === 'Show All', 'G8 type filter with nothing in it offers Show All');
  await p.click('#view .state.nomatch [data-act]');
  await p.waitForSelector('#view .row');

  /* CB-3 pin, delete, clear */
  await p.click('#view .row:nth-child(5)');
  const pinId = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await p.click('[data-a=pin]');
  ok((await clips()).find((x) => x.id === pinId).pinned, 'CB-3 pin');
  await shot('detail-pinned');
  await key('Control+Alt+KeyV');
  ok((await p.$$('#float .cb-pin')).length === 2, 'CB-3 pins show in the float');
  await key('Escape');
  await keyWin(); await p.click(`#view .row[data-id="${pinId}"]`);
  await key('Meta+Backspace');
  ok(!(await clips()).some((x) => x.id === pinId), 'G10 ⌘⌫ (Delete Clip) deletes the selection');

  /* G1 retention: lowering the limit prunes and says so */
  await p.evaluate(() => { for (let i = 0; i < 6; i++) OS.pasteboard.copy({ kind: 'text', text: 'Build log line ' + i, source: 'TextEdit' }); });
  const un = (await clips()).filter((x) => !x.pinned).length;
  await p.evaluate(() => OS.openPrefs('clipboard'));
  ok((await p.textContent('#prefs')).includes('Keeps 50 unpinned clips · pinned clips stay'), 'G1 store rule shows in the Clipboard Preferences pane');
  await p.selectOption('select[data-k="clipboard.limit"]', '10');
  c = await clips();
  ok(c.filter((x) => !x.pinned).length === 10 && c.some((x) => x.pinned), `G1/CB-4 limit 10 prunes unpinned only (${un} → 10)`);
  ok((await toasts()).includes(`${un - 10} older clips removed`), 'G1 prune toast: ' + (un - 10) + ' older clips removed');
  await shot('prefs-pruned');
  await p.evaluate(() => OS.open('clipboard'));
  await p.waitForSelector('#view .row');
  ok((await p.textContent('#view .cb-foot')).includes(`Keeps 10 unpinned clips`) && (await p.textContent('#view .cb-foot')).includes(`${un - 10} older clips removed`), 'G1 footer shows the new rule and what was removed');
  await shot('view-footer-pruned');

  /* CB-4 float size, pinned-first, hotkey */
  await p.evaluate(() => OS.openPrefs('clipboard'));
  await p.$eval('input[data-k="clipboard.floatCount"]', (el) => { el.value = 4; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await key('Control+Alt+KeyV');
  ok((await rows()).length === 4, 'CB-4 float size = 4 rows');
  await key('Escape');
  await p.click('#prefs [data-k="clipboard.pinnedFirst"]');
  await key('Control+Alt+KeyV');
  ok(await p.$eval('#float .cb-r', (e) => !!e.querySelector('.cb-pin')), 'CB-4 pinned-first on: a pinned clip leads the float');
  await key('Escape');
  await p.click('#prefs [data-k="clipboard.pinnedFirst"]');
  await p.evaluate(() => OS.openPrefs('hotkeys'));
  await p.click('[data-hk="clipboard.open"]'); await key('Control+Alt+KeyB');
  ok((await p.textContent('[data-hk="clipboard.open"]')) === '⌃⌥B', 'CB-4 hotkey re-bound');
  await key('Control+Alt+KeyV'); ok(!(await floatOpen()), 'CB-4 old hotkey no longer opens');
  await key('Control+Alt+KeyB'); ok(await floatOpen(), 'CB-4 new hotkey opens the float');
  await key('Escape');
  await p.click('[data-hk="clipboard.open"]'); await key('Control+Alt+KeyV');

  /* Reload: data and prefs persist */
  const keepPinned = (await clips()).find((x) => x.pinned).id;
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(500);
  c = await clips();
  ok(c.filter((x) => !x.pinned).length === 10 && c.find((x) => x.id === keepPinned && x.pinned) && c.some((x) => x.text === 'Build log line 5'), 'Reload: history, pins and new copies persisted');
  ok((await p.evaluate(() => [OS.pref('clipboard.limit'), OS.pref('clipboard.floatCount')])).join() === '10,4', 'Reload: limit and float size persisted');
  await p.evaluate(() => OS.setPref('clipboard.floatCount', 8));

  /* HO-1 arrival: open with {select} */
  const target = c.find((x) => x.text === 'Build log line 2').id;
  await open({ select: target });
  ok((await p.$eval('#view .row.sel', (e) => e.dataset.id)) === target, 'HO-1 arrival: Clipboard opens with that clip selected');

  /* CB-5 / HO-2 Format leg */
  await p.evaluate(() => { const oc = OS.call; OS.call = (nm, x) => { if (nm === 'json.format') window.__fmt = x; return oc(nm, x); }; });
  await p.click('#view [data-type] [data-v=json]');
  await p.waitForSelector('#view .cb-q:not(.busy)');
  await p.click('#view .row');
  const jid = await p.$eval('#view .row.sel', (e) => e.dataset.id);
  await p.click('[data-a=format]');
  const f = await p.evaluate(() => window.__fmt);
  ok(f && f.source === 'Clipboard' && f.clipId === jid && f.text.startsWith('{'), 'CB-5 Format calls json.format with the clip');
  await shot('format');
  await key('Escape');

  /* G8 large history: synthetic, capped, never saved */
  const storedBefore = await p.evaluate(() => localStorage.getItem('oneshot.v3.data.clipboard').length);
  await wrench('clipboard.large');
  await open();
  ok((await subtitle()).startsWith('10,000 clips'), 'G8 large: subtitle counts 10,000 clips (' + await subtitle() + ')');
  ok((await p.$$('#view .row')).length === 200 && (await p.textContent('#view [data-cap]')) === 'Showing 200 of 10,000 · refine the search', 'G8 large: list capped at 200 with "Showing 200 of 10,000 · refine the search"');
  await shot('large');
  await p.fill('#view .search', 'invoice');
  await p.waitForSelector('#view .cb-q:not(.busy)');
  const sub = await subtitle();
  ok(/^[\d,]+ of 10,000 clips$/.test(sub) && (await p.$$('#view .row')).length <= 200, 'G8 large: background search narrows (' + sub + ')');
  await p.fill('#view .search', 'note 4242 ');
  await p.waitForSelector('#view .cb-q:not(.busy)');
  ok((await p.$$('#view .row')).length === 1 && !(await p.$('#view [data-cap]')), 'G8 large: a refined search drops the cap');
  await shot('large-refined');
  await p.click('#view .row'); await p.click('[data-a=pin]');
  await key('Control+Alt+KeyV');
  ok((await rows()).length === 8, 'G8 large: the float works on 10,000 clips');
  await key('Escape');
  await p.waitForTimeout(400);
  const storedAfter = await p.evaluate(() => localStorage.getItem('oneshot.v3.data.clipboard').length);
  ok(storedAfter < 20000 && Math.abs(storedAfter - storedBefore) < 2000 && (await clips()).length < 30, `G8 large: synthetic clips are never saved (store ${storedBefore} → ${storedAfter} bytes)`);
  await wrench('clipboard.large');
  await open();
  ok(!(await subtitle()).startsWith('10,000'), 'G8 large off: back to the stored history');

  /* ST-2 Accessibility missing → grant card in the float; granting unblocks */
  await p.evaluate(() => { OS.closeWindow('#win'); OS.perm.set('access', false); });
  await key('Control+Alt+KeyV');
  ok(await p.$('#float .state.permission'), 'ST-2 float shows the Accessibility grant card');
  await shot('float-permission');
  await p.click('#float [data-grant]');
  await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await p.waitForSelector('#float .cb-r');
  ok((await rows()).length > 0, 'ST-2 granting unblocks the float in place');
  await key('Escape');

  /* ST-1 loading (skeleton), failure, empty */
  await p.evaluate(() => OS.setScn('slow', true));
  await p.evaluate(() => OS.open('clipboard'));
  ok(await p.$('#view .skel'), 'ST-1/G8 loading uses the list skeleton');
  await shot('loading-skeleton');
  await p.waitForSelector('#view .row', { timeout: 4000 });
  await p.evaluate(() => OS.setScn('slow', false));
  await wrench('clipboard.fail');
  await open(); await p.waitForSelector('#view .state.failure');
  ok((await p.textContent('#view .state.failure')).includes('Try Again'), 'ST-1 failure state with Try Again');
  await shot('failure');
  await key('Control+Alt+KeyV'); ok(await p.$('#float .state.failure'), 'ST-1 failure state in the float'); await key('Escape');
  await wrench('clipboard.fail');
  await wrench('clipboard.empty');
  await open(); await p.waitForSelector('#view .state.empty');
  const emptyText = await p.textContent('#view .state.empty');
  ok(emptyText.includes('keeps the last 10 unpinned clips') && emptyText.includes('never kept') && emptyText.includes('Keeping copies from TextEdit, Safari'), 'ST-1/G1 empty state names the limit and the policy');
  ok((await subtitle()) === 'No clips', 'ST-1 empty subtitle');
  await keyWin();
  m = await edit();
  ok(m['Copy Clip'] === false && m['Delete Clip'] === false, 'G10 Copy/Delete disabled in the empty state');
  await shot('empty');
  await key('Control+Alt+KeyV'); ok(await p.$('#float .state.empty'), 'ST-1 empty state in the float'); await shot('float-empty'); await key('Escape');
  await p.click('#view .state.empty [data-act]');
  ok((await p.evaluate(() => OS.prefPane())) === 'privacy', 'Empty state "Clipboard Policy…" opens Privacy');
  await wrench('clipboard.empty');
  ok((await clips()).length > 5, 'Start empty never overwrote stored history');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('clipboard: all passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
