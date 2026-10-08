// Usage: node tools/test-screenshot.js — walks SS-1..SS-8, HO-1 (sending side), ST-1/ST-2 and the v3 items
// (G9 saves, G1 retention, G5 re-approval, G8 skeleton/search/nomatch, G10 responder + overlay keys) for Screenshot.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; globalThis.__errs = errs;
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  let n = 0;
  const shot = (name) => p.screenshot({ path: `/tmp/v3-screenshot-${String(++n).padStart(2, '0')}-${name}.png` });
  const key = (k) => p.keyboard.press(k);
  const shots = () => p.evaluate(() => OS.data.screenshot.shots.map((s) => ({ id: s.id, kind: s.kind, path: s.path, format: s.format, duration: s.duration, marks: s.marks.length, ocr: s.ocr, w: s.rect.w, h: s.rect.h, at: s.at })));
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.map((c) => ({ id: c.id, kind: c.kind, text: c.text, source: c.source, image: c.image, at: c.at })));
  const overlayOpen = () => p.evaluate(() => !document.querySelector('#overlay').hidden);
  const scn = (k, v) => p.evaluate(([k, v]) => OS.setScn(k, v), [k, v]);
  const closeWin = () => p.evaluate(() => { OS.closeWindow('#win'); OS.closeWindow('#prefwin'); });
  const openView = async (sel) => { await p.evaluate((s) => OS.open('screenshot', s ? { select: s } : {}), sel); await p.waitForSelector('#view .ss-tile, #view .state'); };
  const drag = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); await p.mouse.move(x1, y1, { steps: 3 }); await p.mouse.up(); };
  const btn = (t) => p.click(`.ss-tb button:has-text("${t}")`);
  const setPref = async (k, v) => { await p.evaluate(() => OS.openPrefs('screenshot')); const sel = await p.$(`#prefs select[data-k="screenshot.${k}"]`); if (sel) await sel.selectOption({ value: JSON.stringify(v) }); else await p.click(`#prefs [data-k="screenshot.${k}"] button[data-v='${JSON.stringify(v)}']`); };
  const capture = async (r = [60, 150, 560, 330]) => { await key('Control+Alt+KeyA'); await p.waitForSelector('.ss-sel'); await drag(...r); };
  const toastBtn = (t) => p.click(`#toasts .toast button:has-text("${t}")`);
  const clearToasts = () => p.evaluate(() => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()));
  const menuItem = (label) => p.evaluate((l) => { for (const m of OS.menus()) for (const it of m.items) if (it !== '-' && it.label.startsWith(l)) return { label: it.label, enabled: it.enabled ? it.enabled() : true }; return null; }, label);
  const tiles = () => p.$$eval('#view .ss-tile', (x) => x.length);

  /* ---------- SS-1 / ST-2 / G5: Screen Recording gate, then capture ---------- */
  await key('Control+Alt+KeyA');
  ok(await p.$('#overlay .state.permission.missing'), 'ST-2/G5 capture without Screen Recording shows the inline grant (missing)');
  await shot('gate-missing');
  await p.click('#overlay [data-grant]'); await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await p.waitForSelector('.ss-sel');
  ok(true, 'SS-1 granting proceeds into the capture overlay in place');
  await key('Escape');
  ok(!(await overlayOpen()), 'SS-1 Esc cancels capture');
  await key('Control+Alt+KeyA'); await p.waitForSelector('.ss-sel');
  await p.mouse.move(60, 150); await p.mouse.down(); await p.mouse.move(560, 330, { steps: 4 });
  ok((await p.textContent('.ss-size')) === '500 × 180', 'SS-1 shows W×H while dragging');
  await shot('selecting');
  await p.mouse.up();
  await p.waitForSelector('.ss-ed');
  ok(true, 'SS-1 releasing opens the editor (after = Edit)');

  /* ---------- SS-2 annotate; G10 overlay keys ---------- */
  const nMarks = () => p.$$eval('.ss-marks > *', (x) => x.length);
  await btn('Arrow'); await drag(120, 250, 300, 190);
  ok((await nMarks()) === 2, 'SS-2 arrow drawn');
  await btn('Rectangle'); await drag(90, 160, 330, 215);
  ok((await nMarks()) === 3, 'SS-2 rectangle drawn');
  await btn('Text'); await p.mouse.click(350, 290); await p.keyboard.type('Check this'); await key('Enter');
  ok((await nMarks()) === 4 && (await p.textContent('.ss-marks text')) === 'Check this', 'SS-2 text drawn');
  await shot('editor-annotated');
  await key('Meta+KeyZ');
  ok((await nMarks()) === 3 && !(await p.$('.ss-marks text')), 'G10 ⌘Z in the overlay undoes the last mark (overlay onKey)');
  await btn('Undo');
  ok((await nMarks()) === 2, 'SS-2 Undo button removes the last mark');
  await btn('Text'); await p.mouse.click(350, 290); await p.keyboard.type('gone'); await key('Escape');
  ok((await overlayOpen()) && (await nMarks()) === 2, 'SS-2 Esc in the text field cancels only the text');

  /* ---------- SS-5 OCR in the editor ---------- */
  await p.click('.ss-tb [data-a=ocr]');
  ok(await p.$('.ss-panel .state.loading'), 'SS-5 OCR shows progress');
  await p.waitForSelector('.ss-otxt');
  const ocrTxt = await p.textContent('.ss-otxt');
  ok(/Ship the status endpoint/.test(ocrTxt), 'SS-5 OCR reads the text in the region');
  await shot('editor-ocr');
  await p.click('[data-copytext]');
  ok((await clips()).some((c) => c.kind !== 'image' && c.source === 'Screenshot' && c.text === ocrTxt), 'SS-5 Copy Text lands in Clipboard history (source Screenshot)');
  await toastBtn('Open');
  await p.waitForSelector('#view .row.sel');
  ok(!(await overlayOpen()), 'SS-5 toast Open closes the editor and lands in Clipboard');
  await closeWin(); await clearToasts();

  /* ---------- G9 save: progress, then success with a working "Show in History" ---------- */
  await scn('slow', true);
  await capture(); await p.waitForSelector('.ss-ed');
  await key('Meta+KeyS');
  await p.waitForSelector('.ss-tb .ss-prog');
  await p.waitForTimeout(350);
  const pct1 = +(await p.getAttribute('.ss-tb .ss-prog', 'aria-valuenow'));
  await p.waitForTimeout(450);
  const pct2 = +(await p.getAttribute('.ss-tb .ss-prog', 'aria-valuenow'));
  ok(pct2 > pct1 && pct1 > 0 && pct2 < 100, `G9 ⌘S saves with determinate progress (${pct1}% → ${pct2}%)`);
  ok(/Saving \d+%/.test(await p.textContent('.ss-tb [data-a=save]')) && (await p.textContent('.ss-foot-ed')).includes('to ~/Desktop'), 'G9 Save button and editor footer show progress and destination');
  await shot('save-progress');
  await p.waitForSelector('#toasts .toast:has-text("Saved “Screenshot ")', { timeout: 5000 });
  await scn('slow', false);
  const savedToast = await p.textContent('#toasts .toast');
  ok(/Saved “Screenshot \d{4}-\d\d-\d\d at \d\d\.\d\d\.\d\d\.png”/.test(savedToast) && savedToast.includes('~/Desktop'), 'G9 success toast names the file and folder');
  let s = await shots();
  const saved = s.find((x) => x.path && x.path.startsWith('~/Desktop/Screenshot ') && x.path.endsWith('.png') && x.marks === 0);
  ok(!!saved && !(await overlayOpen()), 'SS-4 Save writes to the folder as PNG and closes the editor');
  await shot('save-success-toast');
  await toastBtn('Show in History');
  await p.waitForSelector('#view .ss-tile.sel');
  ok((await p.getAttribute('#view .ss-tile.sel', 'data-id')) === saved.id, 'G9 "Show in History" lands in history with the file selected');
  await closeWin(); await clearToasts();

  /* ---------- G9 failure: disk full (atomic-write language), nothing written ---------- */
  await scn('notes', true);
  await scn('screenshot.diskFull', true);
  const before = (await shots()).length;
  await capture(); await p.waitForSelector('.ss-ed');
  await btn('Save');
  await p.waitForSelector('.ss-err');
  const errText = await p.textContent('.ss-err');
  ok(/Couldn’t save “Screenshot .*\.png”\. The disk is full\. Nothing was written — OneShot writes the file in one step, so no partial file was left\./.test(errText), 'G9 inline editor error uses atomic-write language');
  ok(await p.$('#toasts .toast.failure:has-text("Couldn’t save")'), 'G9 failure toast shown');
  ok((await p.textContent('#toasts .toast.failure')).includes('NSFileWriteOutOfSpaceError'), 'G9 contract note: NSFileCoordinator + .atomic write; NSFileWriteOutOfSpaceError');
  ok((await shots()).length === before && (await overlayOpen()), 'SS-4 failed save adds nothing and keeps the editor');
  await shot('save-disk-full');
  await key('Escape');
  ok(!(await overlayOpen()) && (await shots()).length === before, 'SS-2 Esc discards the capture');
  await scn('screenshot.diskFull', false); await scn('notes', false); await clearToasts();

  /* ---------- G9 failure: save folder missing → "Save to Desktop Instead" ---------- */
  await setPref('folder', '~/Pictures/Screenshots'); await closeWin();
  await scn('screenshot.folderMissing', true);
  await capture(); await p.waitForSelector('.ss-ed');
  await btn('Save');
  await p.waitForSelector('.ss-err');
  ok((await p.textContent('.ss-err')).includes('The folder ~/Pictures/Screenshots is missing') && await p.$('.ss-err button:has-text("Save to Desktop Instead")'), 'G9 folder missing: inline error offers Save to Desktop Instead');
  ok(await p.$('#toasts .toast.failure button:has-text("Save to Desktop Instead")'), 'G9 folder missing: failure toast has the same action');
  await shot('save-folder-missing');
  await toastBtn('Save to Desktop Instead');
  await p.waitForSelector('#toasts .toast:has-text("Saved “Screenshot ")', { timeout: 4000 });
  s = await shots();
  ok(s.some((x) => x.path && x.path.startsWith('~/Desktop/Screenshot ')) && !(await overlayOpen()), 'G9 fallback writes to ~/Desktop and closes the editor');
  ok(await p.evaluate(() => OS.pref('screenshot.folder')) === '~/Pictures/Screenshots', 'G9 fallback does not change the Save folder setting');
  await scn('screenshot.folderMissing', false); await clearToasts();

  /* ---------- SS-8 settings change capture (direct modes) ---------- */
  await setPref('folder', '~/Documents');
  await setPref('format', 'JPG');
  await setPref('after', 'save');
  await closeWin();
  await scn('slow', true);
  await capture();
  await p.waitForSelector('#toasts .toast .ss-prog');
  ok(!(await overlayOpen()), 'SS-8 after=Save skips the editor and shows progress in a toast');
  await shot('direct-save-progress');
  await p.waitForSelector('#toasts .toast:has-text("Saved “Screenshot ")', { timeout: 5000 });
  await scn('slow', false);
  s = await shots();
  ok(s.some((x) => x.path && x.path.startsWith('~/Documents/Screenshot ') && x.path.endsWith('.jpg')), 'SS-8 folder and format apply to the saved path');
  await scn('screenshot.diskFull', true);
  await capture();
  await p.waitForSelector('.ss-ed .ss-err');
  ok((await p.textContent('.ss-err')).includes('The disk is full'), 'G9 after=Save failure opens the editor with the error so the capture isn’t lost');
  await key('Escape'); await scn('screenshot.diskFull', false); await clearToasts();
  await setPref('after', 'copy'); await closeWin();
  await capture();
  await p.waitForSelector('#toasts .toast:has-text("Copied to clipboard")');
  ok(!(await overlayOpen()) && (await clips()).some((c) => c.kind === 'image' && c.source === 'Screenshot'), 'SS-8 after=Copy skips the editor and writes an image clip');
  await setPref('after', 'edit'); await setPref('format', 'PNG'); await setPref('folder', '~/Desktop');
  await p.evaluate(() => OS.openPrefs('hotkeys'));
  await p.click('[data-hk="screenshot.capture"]'); await key('Control+Alt+KeyG');
  ok((await p.textContent('[data-hk="screenshot.capture"]')) === '⌃⌥G', 'SS-8 hotkey re-bound');
  await closeWin();
  await key('Control+Alt+KeyA'); ok(!(await overlayOpen()), 'SS-8 old hotkey no longer captures');
  await key('Control+Alt+KeyG'); ok(await overlayOpen(), 'SS-8 new hotkey captures'); await key('Escape');
  await p.evaluate(() => OS.hotkey.reset('screenshot.capture'));
  await clearToasts();

  /* ---------- SS-3 + HO-1: ⌘C (Copy & Close) → toast Open → Clipboard with the clip selected ---------- */
  const sh0 = (await shots()).length;
  await capture(); await p.waitForSelector('.ss-ed');
  await btn('Arrow'); await drag(120, 250, 300, 190);
  await key('Meta+KeyC');
  ok(!(await overlayOpen()), 'G10 ⌘C in the overlay = Copy & Close');
  s = await shots();
  ok(s.length === sh0 + 1 && s[s.length - 1].marks === 1, 'SS-3 capture added to history with its marks');
  const imgClip = (await clips()).filter((c) => c.kind === 'image').sort((a, b) => b.at - a.at)[0];
  ok(imgClip && imgClip.image.shotId === s[s.length - 1].id, 'SS-3 image clip written to Clipboard history');
  await toastBtn('Open');
  await p.waitForSelector('#view .row.sel');
  ok((await p.getAttribute('#view .row.sel', 'data-id')) === imgClip.id, 'HO-1 Open lands in Clipboard with the new clip selected');
  await shot('ho1-clipboard');
  // policy blocks recording → toast offers Show in History instead
  await p.evaluate(() => OS.openPrefs('privacy'));
  await p.click('#prefs [data-k="policy.Screenshot"]');
  await closeWin(); await clearToasts();
  await capture(); await p.waitForSelector('.ss-ed'); await btn('Copy & Close');
  await p.waitForSelector('#toasts .toast:has-text("Not added to Clipboard history")');
  const lastShot = (await shots()).slice(-1)[0];
  await toastBtn('Show in History');
  await p.waitForSelector('#view .ss-tile.sel');
  ok((await p.getAttribute('#view .ss-tile.sel', 'data-id')) === lastShot.id, 'HO-1 policy-blocked copy: toast lands on the capture in history');
  await p.evaluate(() => OS.openPrefs('privacy')); await p.click('#prefs [data-k="policy.Screenshot"]');
  await closeWin(); await clearToasts();

  /* ---------- SS-5 empty OCR via hotkey ---------- */
  await key('Control+Alt+KeyO'); await p.waitForSelector('.ss-sel');
  await drag(700, 660, 920, 800);
  await p.waitForSelector('.ss-panel .state.empty');
  ok((await p.textContent('.ss-panel')).includes('No text found'), 'SS-5 empty result says "No text found"');
  await key('Escape');

  /* ---------- SS-6 recording: menubar timer, Stop, saved toast ---------- */
  await key('Control+Alt+KeyR'); await p.waitForSelector('.ss-sel');
  await drag(700, 150, 1000, 300);
  ok(!(await overlayOpen()) && (await p.$('.ss-recframe')), 'SS-6 selecting a region starts recording');
  await p.waitForTimeout(2300);
  const lbl = (await p.textContent('.mbi.rec')).trim();
  ok(/^●\s*0:0[1-9]/.test(lbl), 'SS-6 menu bar shows the timer: ' + lbl);
  await p.click('[data-mb=screenshot]');
  ok((await p.textContent('#pop')).includes('Recording') && await p.$('#pop [data-a=stop]'), 'SS-6 popover shows Recording + Stop');
  await shot('recording-popover');
  await p.click('#pop [data-a=stop]');
  s = await shots();
  const rc = s.filter((x) => x.kind === 'recording').sort((a, b) => b.at - a.at)[0];
  ok(rc && rc.duration >= 2 && /Recording .*\.mov$/.test(rc.path) && !(await p.$('.mbi.rec')), 'SS-6 Stop saves the recording (' + rc.duration + 's)');
  const recToast = await p.textContent('#toasts .toast');
  ok(recToast.includes('Recording saved') && recToast.includes('.mov') && recToast.includes('Show in History'), 'SS-6 recording saved toast names the file');
  await shot('recording-saved');
  await key('Control+Alt+KeyR'); await p.waitForSelector('.ss-sel'); await drag(700, 150, 1000, 300);
  await p.waitForTimeout(1200); await key('Escape');
  ok((await shots()).filter((x) => x.kind === 'recording').length === 3 && !(await p.$('.mbi.rec')), 'SS-6 Esc stops recording and keeps it');
  await toastBtn('Show in History');
  await p.waitForSelector('#view .ss-tile.sel');
  await closeWin(); await clearToasts();

  /* ---------- status item popover + G5 re-approval ---------- */
  await p.click('[data-mb=screenshot]');
  const pop = await p.textContent('#pop');
  ok(['Capture Region', 'Record Region', 'Extract Text', 'Open History', '⌃⌥A', '⌃⌥R', '⌃⌥O'].every((t) => pop.includes(t)) && (await p.$$('#pop .ss-rt')).length === 3, 'SS-1 popover: actions with hotkeys and recent captures');
  await shot('popover');
  await p.click('#pop .ss-rt'); await p.waitForSelector('#view .ss-tile.sel');
  ok(true, 'SS-7 a recent capture in the popover opens it in history');
  await closeWin();
  await scn('perm.screenReapprove', true);
  await p.click('[data-mb=screenshot]');
  ok((await p.textContent('#pop')).includes('confirm Screen Recording again'), 'G5 popover reflects the re-approval state');
  await key('Escape');
  await key('Control+Alt+KeyA');
  await p.waitForSelector('#overlay .state.permission.approval');
  ok((await p.textContent('#overlay .state')).includes('Confirm Screen Recording again') && !(await p.textContent('#overlay .state .foot')).includes('Helper'), 'G5 capture gate shows the re-approval card (OS.ui.grant, approval)');
  await shot('gate-reapproval');
  await p.click('#overlay [data-grant]'); await p.click('#dlg [data-r="1"]');
  await p.waitForSelector('.ss-sel');
  ok(await p.evaluate(() => OS.perm.state('screen') === 'granted'), 'G5 re-approving proceeds into capture');
  await key('Escape');

  /* ---------- SS-7 history + G8 search/nomatch + G10 responder ---------- */
  await openView();
  const t0 = await tiles();
  ok(t0 >= 8, 'SS-7 grid shows captures (' + t0 + ')');
  ok(await p.evaluate(() => document.activeElement.classList.contains('ss-grid')), 'SS-7 grid is focused on mount');
  ok((await p.textContent('#vhSub')).includes('kept for 30 days') && (await p.textContent('#view .ss-foot')).includes('History kept for 30 days'), 'G1 the grid shows the retention rule (subtitle + footer)');
  await shot('history');
  await scn('slow', true);
  await p.fill('#view .search', 'GitHub');
  ok(await p.isVisible('#view .ss-busy') && (await tiles()) === t0, 'G8 search runs in the background with an indicator');
  await shot('history-searching');
  await p.waitForSelector('#view .ss-busy', { state: 'hidden' });
  ok((await tiles()) === 1, 'SS-7 search by OCR text');
  await scn('slow', false);
  await p.fill('#view .search', 'Documents'); await p.waitForTimeout(250);
  ok((await tiles()) === 1, 'SS-7 search by file name/path');
  await p.fill('#view .search', 'zebra'); await p.waitForTimeout(250);
  ok(await p.$('#view .state.nomatch') && (await p.textContent('#view .state')).includes('No captures match “zebra”'), 'G8 no-match state differs from empty');
  ok(!(await menuItem('Copy')).enabled && !(await menuItem('Delete')).enabled, 'G10 Copy/Delete disabled with nothing to act on');
  await shot('history-nomatch');
  await p.click('#view .state [data-act]'); await p.waitForTimeout(250);
  ok((await tiles()) === t0, 'G8 Clear Search restores the grid');
  await p.click('#view [data-kind] [data-v=recording]');
  ok((await tiles()) === 3, 'SS-7 filter Recordings');
  await p.click('#view [data-kind] [data-v=all]');
  // keyboard
  await p.click('#view .ss-tile:nth-child(1)');
  const g0 = await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id);
  await key('ArrowRight');
  ok((await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id)) === (await p.$eval('#view .ss-tile:nth-child(2)', (e) => e.dataset.id)), 'SS-7 ArrowRight selects the next capture');
  await key('ArrowLeft');
  ok((await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id)) === g0, 'SS-7 ArrowLeft moves back');
  // menus follow the selection
  let mi = await menuItem('Copy');
  ok(mi.enabled && /^Copy (Capture|Path)$/.test(mi.label), 'G10 Edit › ' + mi.label + ' enabled for one selected capture');
  await p.click('#mbL [data-menu=edit]');
  await shot('edit-menu');
  await key('Escape');
  const cb = (await clips()).length;
  await key('Meta+KeyC');
  ok((await clips()).length >= cb && await p.$('#toasts .toast'), 'G10 ⌘C copies the selected capture');
  await key('Meta+KeyA');
  ok((await p.$$('#view .ss-tile.sel')).length === t0 && (await menuItem('Delete')).label === `Delete ${t0} Captures` && !(await menuItem('Copy')).enabled, 'G10 ⌘A selects all; Delete says how many; Copy disables');
  await shot('history-select-all');
  await p.click('#view .ss-tile:nth-child(2)');
  const delId = await p.getAttribute('#view .ss-tile.sel', 'data-id');
  await key('Meta+Backspace');
  ok(!(await shots()).some((x) => x.id === delId) && (await tiles()) === t0 - 1, 'G10 ⌘⌫ deletes the selected capture');
  ok((await menuItem('Undo')).label === 'Undo Delete' && (await menuItem('Undo')).enabled, 'G10 Undo Delete enabled after a delete');
  await key('Meta+KeyZ');
  ok((await shots()).some((x) => x.id === delId) && (await tiles()) === t0, 'G10 ⌘Z restores the capture');
  ok(!(await menuItem('Undo')).enabled, 'G10 Undo disables once used');
  await key('Meta+KeyF');
  ok(await p.evaluate(() => document.activeElement.classList.contains('search')), 'G10 ⌘F focuses search');
  await p.click('#view .ss-tile:nth-child(1)');
  await p.click('#view .ss-pane [data-a=copy]');
  ok(await p.$('#toasts .toast'), 'SS-7 Copy from the detail pane');
  await p.click('#view .ss-tile:nth-child(3)');
  await shot('history-detail');
  await p.click('#view .ss-pane [data-a=del]');
  ok((await tiles()) === t0 - 1, 'SS-7 Delete from the detail pane');

  /* ---------- G1 retention: store rule, prune on shortening with an info toast ---------- */
  await clearToasts();
  await p.evaluate(() => OS.openPrefs('storage'));
  ok((await p.textContent('#prefs')).includes('Keeps captures for 30 days'), 'G1 Storage pane shows the store rule');
  ok((await shots()).some((x) => x.id === 'sh3') && (await shots()).some((x) => x.id === 'sh4'), 'G1 30-day retention keeps the 12- and 20-day captures');
  await setPref('retention', 7);
  await p.waitForSelector('#toasts .toast:has-text("Removed 2 captures older than 7 days")');
  ok(!(await shots()).some((x) => x.id === 'sh3' || x.id === 'sh4'), 'SS-8/G1 shortening retention prunes right away with an info toast');
  await shot('prefs-retention-pruned');
  await p.evaluate(() => OS.open('screenshot')); await p.waitForSelector('#view .ss-tile');
  ok((await p.textContent('#view .ss-foot')).includes('Removed 2 captures older than 7 days'), 'G1 history footer explains the prune');
  await p.evaluate(() => OS.openPrefs('storage'));
  ok((await p.textContent('#prefs')).includes('Keeps captures for 7 days'), 'G1 store rule follows the pref');

  /* ---------- reload: data + pref persist ---------- */
  const keep = (await shots()).map((x) => x.id).sort().join(',');
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(600);
  ok((await shots()).map((x) => x.id).sort().join(',') === keep, 'G1 reload keeps the captures (store)');
  ok(await p.evaluate(() => OS.pref('screenshot.retention')) === 7, 'G1 reload keeps the retention pref');
  for (let i = 0; i < 5; i++) await p.evaluate(() => OS.skip(864e5));
  ok(!(await shots()).some((x) => x.id === 'sh2') && (await shots()).some((x) => x.id === 'sh1'), 'SS-8 aging past 7 days removes the 3-day recording (now 8d), keeps 6d');

  /* ---------- ST-1 states ---------- */
  await scn('slow', true);
  await p.evaluate(() => OS.open('screenshot'));
  ok(await p.$('#view .ss-skel'), 'G8/ST-1 loading skeleton'); await shot('state-loading');
  await scn('slow', false);
  await scn('screenshot.fail', true); await p.evaluate(() => OS.open('screenshot'));
  await p.waitForSelector('#view .state.failure'); await shot('state-failure');
  ok(true, 'ST-1 failure state');
  await scn('screenshot.fail', false); await p.waitForSelector('#view .ss-tile');
  ok(true, 'ST-1 recovers when the store answers');
  await scn('screenshot.empty', true);
  await p.waitForSelector('#view .state.empty');
  const emp = await p.textContent('#view .state');
  ok(emp.includes('Saved captures go to ~/Desktop') && emp.includes('keeps them for 7 days'), 'G1 empty state says where captures land and how long they’re kept');
  await shot('state-empty');
  await p.click('#view .state [data-act]');
  await p.waitForSelector('.ss-sel'); ok(true, 'ST-1 empty-state action starts a capture'); await key('Escape');
  await scn('screenshot.empty', false);
  await p.evaluate(() => OS.openPrefs('screenshot')); await shot('prefs-pane');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('screenshot: all passed');
})().catch((e) => { console.error(e.message, globalThis.__errs || ''); process.exit(1); });
