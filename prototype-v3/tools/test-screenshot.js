// Usage: node tools/test-screenshot.js — walks SS-1..SS-8, HO-1, ST-1/ST-2 for Screenshot.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; globalThis.__errs = errs;
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (n) => p.screenshot({ path: `/tmp/screenshot-${n}.png` });
  const key = (k) => p.keyboard.press(k);
  const shots = () => p.evaluate(() => OS.data.screenshot.shots.map((s) => ({ id: s.id, kind: s.kind, path: s.path, format: s.format, duration: s.duration, marks: s.marks.length, ocr: s.ocr, w: s.rect.w, h: s.rect.h, at: s.at })));
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.map((c) => ({ id: c.id, kind: c.kind, text: c.text, source: c.source, image: c.image, at: c.at })));
  const overlayOpen = () => p.evaluate(() => !document.querySelector('#overlay').hidden);
  const scnToggle = async (k) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${k}"]`); await key('Escape'); };
  const skipDay = async () => { await p.click('[data-mb=scn]'); await p.click('[data-skip="86400000"]'); await key('Escape'); };
  const front = () => p.evaluate(() => OS.front('#win')); // same as clicking the OneShot window
  const rail = async (id) => { if (await p.$eval('#win', (e) => e.hidden)) await p.evaluate((i) => OS.open(i), id); else { await front(); await p.click(`#rail [data-go=${id}]`); } };
  const drag = async (x0, y0, x1, y1) => { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2); await p.mouse.move(x1, y1, { steps: 3 }); await p.mouse.up(); };
  const grantScreen = async () => { await p.click('#overlay [data-grant]'); await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]'); };
  const btn = (t) => p.click(`.ss-tb button:has-text("${t}")`);
  const setPref = async (k, v) => { await front(); await p.evaluate(() => OS.openPrefs('screenshot')); const sel = await p.$(`#prefs select[data-k="${k}"]`); if (sel) await sel.selectOption({ value: JSON.stringify(v) }); else await p.click(`#prefs [data-k="${k}"] button[data-v='${JSON.stringify(v)}']`); };
  const capture = async (r = [60, 150, 560, 330]) => { await key('Control+Alt+KeyA'); await p.waitForSelector('.ss-sel'); await drag(...r); };
  const toastBtn = (t) => p.click(`#toasts .toast button:has-text("${t}")`);

  /* SS-1 / ST-2: Screen Recording gate, then capture */
  await key('Control+Alt+KeyA');
  ok(await p.$('#overlay .state.permission'), 'ST-2 capture without Screen Recording shows the inline grant');
  await shot('01-no-permission');
  await grantScreen();
  await p.waitForSelector('.ss-sel');
  ok(true, 'SS-1 granting proceeds into the capture overlay');
  await shot('02-select');
  await key('Escape');
  ok(!(await overlayOpen()), 'SS-1 Esc cancels capture');
  await key('Control+Alt+KeyA'); await p.waitForSelector('.ss-sel');
  await p.mouse.move(60, 150); await p.mouse.down(); await p.mouse.move(560, 330, { steps: 4 });
  ok((await p.textContent('.ss-size')) === '500 × 180', 'SS-1 shows W×H while dragging (' + (await p.textContent('.ss-size')) + ')');
  await shot('03-dragging');
  await p.mouse.up();
  await p.waitForSelector('.ss-ed');
  ok(true, 'SS-1 releasing opens the editor (after = edit)');
  await shot('04-editor');

  /* SS-2 annotate */
  const nMarks = () => p.$$eval('.ss-marks > *', (n) => n.length);
  await btn('Arrow'); await drag(120, 250, 300, 190);
  ok((await nMarks()) === 2, 'SS-2 arrow drawn (line + head)');
  await btn('Rectangle'); await drag(90, 160, 330, 215);
  ok((await nMarks()) === 3, 'SS-2 rectangle drawn');
  await btn('Text'); await p.mouse.click(350, 290); await p.keyboard.type('Check this'); await key('Enter');
  ok((await nMarks()) === 4 && (await p.textContent('.ss-marks text')) === 'Check this', 'SS-2 text drawn');
  await shot('05-annotated');
  await btn('Undo');
  ok((await nMarks()) === 3 && !(await p.$('.ss-marks text')), 'SS-2 Undo removes the last mark');
  await btn('Text'); await p.mouse.click(350, 290); await p.keyboard.type('gone'); await key('Escape');
  ok((await overlayOpen()) && (await nMarks()) === 3, 'SS-2 Esc in the text field cancels only the text');

  /* SS-5 OCR in editor */
  await btn('OCR');
  ok(await p.$('.ss-panel .state.loading'), 'SS-5 OCR shows progress');
  await shot('06-ocr-loading');
  await p.waitForSelector('.ss-otxt');
  const ocrTxt = await p.textContent('.ss-otxt');
  ok(/Ship the status endpoint/.test(ocrTxt), 'SS-5 OCR text read from the region: ' + JSON.stringify(ocrTxt.slice(0, 40)));
  await shot('07-ocr-result');
  const cn0 = (await clips()).length;
  await p.click('[data-copytext]');
  let cl = await clips();
  ok(cl.some((c) => c.kind !== 'image' && c.source === 'Screenshot' && c.text === ocrTxt), 'SS-5 Copy text lands in Clipboard history with source Screenshot');
  await toastBtn('Open');
  await p.waitForSelector('#view .row.sel');
  const selTxt = await p.textContent('#view .row.sel .t');
  ok(!(await overlayOpen()) && selTxt.startsWith('Release notes') || selTxt.startsWith('Ship'), 'SS-5 toast Open selects the OCR clip');
  await front();

  /* SS-4 save failure keeps editor, then success */
  await scnToggle('screenshot.diskFull');
  await capture(); await p.waitForSelector('.ss-ed');
  await btn('Save');
  await p.waitForSelector('.ss-err');
  ok(await p.$('.ss-ed'), 'SS-4 failed save keeps the editor open and says why');
  ok((await shots()).length === 4, 'SS-4 failed save adds nothing to history');
  await shot('08-save-failed');
  await btn('Cancel');
  ok(!(await overlayOpen()), 'SS-2 Cancel discards');
  ok((await shots()).length === 4, 'SS-2 cancelled capture is not in history');
  await scnToggle('screenshot.diskFull');
  await capture(); await p.waitForSelector('.ss-ed');
  await btn('Save');
  await p.waitForSelector('#toasts .toast:has-text("Saved")');
  let s = await shots();
  const saved = s.find((x) => x.path && x.path.startsWith('~/Desktop/Screenshot ') && x.path.endsWith('.png') && x.at > Date.now() - 20000);
  ok(!!saved && !(await overlayOpen()), 'SS-4 Save writes to the folder as PNG: ' + (saved && saved.path));
  await shot('09-saved');

  /* SS-8 settings change capture */
  await setPref('screenshot.folder', '~/Documents');
  await setPref('screenshot.format', 'JPG');
  await setPref('screenshot.after', 'save');
  await capture();
  await p.waitForSelector('#toasts .toast:has-text("Saved to ~/Documents")');
  ok(!(await overlayOpen()), 'SS-8 after=save skips the editor');
  s = await shots();
  ok(s.some((x) => x.path && x.path.startsWith('~/Documents/Screenshot ') && x.path.endsWith('.jpg')), 'SS-8 folder and format apply to the saved path');
  const nClips = (await clips()).length;
  await setPref('screenshot.after', 'copy');
  await capture();
  await p.waitForSelector('#toasts .toast:has-text("Copied to clipboard")');
  ok(!(await overlayOpen()), 'SS-8 after=copy skips the editor');
  ok((await clips()).some((c) => c.kind === 'image' && c.source === 'Screenshot' && c.at > Date.now() - 5000), 'SS-8 after=copy writes an image clip');
  await setPref('screenshot.after', 'edit');
  await setPref('screenshot.format', 'PNG'); await setPref('screenshot.folder', '~/Desktop');
  await p.click('[data-hk="screenshot.capture"]'); await key('Control+Alt+KeyG');
  ok((await p.textContent('[data-hk="screenshot.capture"]')) === '⌃⌥G', 'SS-8 hotkey re-bound');
  await key('Control+Alt+KeyA'); ok(!(await overlayOpen()), 'SS-8 old hotkey no longer captures');
  await key('Control+Alt+KeyG'); ok(await overlayOpen(), 'SS-8 new hotkey captures'); await key('Escape');
  await p.click('[data-hk="screenshot.capture"]'); await key('Control+Alt+KeyA');
  await shot('10-prefs');

  /* SS-3 + HO-1: Copy & Close -> toast Open -> Clipboard with the new clip selected */
  await p.evaluate(() => { document.querySelector('#win').hidden = true; });
  const sh0 = (await shots()).length;
  await capture(); await p.waitForTimeout(300); await p.waitForSelector('.ss-ed');
  await btn('Arrow'); await drag(120, 250, 300, 190);
  await btn('Copy & Close');
  ok(!(await overlayOpen()), 'SS-3 Copy & Close closes the overlay');
  s = await shots();
  ok(s.length === sh0 + 1 && s[s.length - 1].marks === 1, 'SS-3 capture added to screenshot history with its marks');
  cl = await clips();
  const imgClip = cl.filter((c) => c.kind === 'image').sort((a, b) => b.at - a.at)[0];
  ok(imgClip && imgClip.source === 'Screenshot' && imgClip.image.shotId === s[s.length - 1].id && /^Screenshot \d+×\d+$/.test(imgClip.text), 'SS-3 image clip written to clipboard history');
  await shot('11-toast');
  await toastBtn('Open');
  await p.waitForSelector('#view .row.sel');
  ok((await p.getAttribute('#view .row.sel', 'data-id')) === imgClip.id, 'HO-1 Open lands in Clipboard with the new clip selected');
  ok(await p.$('#view .detail .cb-body img, #view .detail .cb-body svg, #view .detail .cb-body div'), 'HO-1 detail renders the screenshot');
  await shot('12-clipboard-handoff');
  // image clip pastes as text
  await p.evaluate(() => { OS.host.textedit.select(0, 0); }); await key('Control+Alt+KeyV');
  await p.waitForSelector('#float .cb-th');
  await shot('13-float-image');
  await p.click('#float .cb-r:has(.cb-th)');
  ok((await p.evaluate(() => OS.host.textedit.value())).startsWith('[Screenshot '), 'HO-1 image clip pastes as [Screenshot W×H]');
  // policy blocks recording
  await p.evaluate(() => OS.openPrefs('permissions')); await front();
  await p.click('[data-k="policy.Screenshot"]');
  await capture(); await p.waitForSelector('.ss-ed'); await btn('Copy & Close');
  await p.waitForSelector('#toasts .toast:has-text("Not added to Clipboard history")');
  await shot('14-not-recorded');
  const lastShot = (await shots()).slice(-1)[0];
  await toastBtn('Open');
  await p.waitForSelector('#view .ss-tile.sel');
  ok((await p.getAttribute('#view .ss-tile.sel', 'data-id')) === lastShot.id, 'HO-1 policy-blocked copy: Open goes to the screenshot');
  await front(); await p.evaluate(() => OS.openPrefs('permissions')); await p.click('[data-k="policy.Screenshot"]');

  /* SS-5 empty OCR + OCR hotkey */
  await p.evaluate(() => { document.querySelector('#win').hidden = true; });
  await key('Control+Alt+KeyO'); await p.waitForSelector('.ss-sel');
  await drag(700, 660, 920, 800);
  await p.waitForSelector('.ss-panel .state.empty');
  ok((await p.textContent('.ss-panel')).includes('No text found'), 'SS-5 empty result says "No text found"');
  await shot('15-ocr-empty');
  await key('Escape');

  /* SS-6 recording */
  await p.evaluate(() => { document.querySelector('#win').hidden = true; });
  await key('Control+Alt+KeyR'); await p.waitForSelector('.ss-sel');
  await drag(700, 150, 1000, 300);
  ok(!(await overlayOpen()) && (await p.$('.ss-recframe')), 'SS-6 selecting a region starts recording');
  await p.waitForTimeout(2300);
  const lbl = await p.textContent('.mbi.rec');
  ok(/^●\s*0:0[1-9]/.test(lbl.trim()), 'SS-6 menubar shows the timer: ' + lbl.trim());
  await shot('16-recording');
  await p.click('[data-mb=screenshot]');
  await shot('17-menubar-menu');
  await p.click('[data-a=stop]');
  s = await shots();
  const rc = s.filter((x) => x.kind === 'recording' && x.at > Date.now() - 10000)[0];
  ok(rc && rc.duration >= 2 && /Recording .*\.mov$/.test(rc.path) && !(await p.$('.mbi.rec')), 'SS-6 Stop saves the recording (' + (rc && rc.duration) + 's)');
  await key('Control+Alt+KeyR'); await p.waitForSelector('.ss-sel'); await drag(700, 150, 1000, 300);
  await p.waitForTimeout(1200); await key('Escape');
  s = await shots();
  ok(s.filter((x) => x.kind === 'recording').length === 3 && !(await p.$('.mbi.rec')), 'SS-6 Esc stops recording and keeps it');
  await toastBtn('Open');
  await p.waitForSelector('#view .ss-tile.sel');
  await shot('18-recording-in-history');

  /* menubar menu */
  await p.click('[data-mb=screenshot]');
  const menu = await p.textContent('#pop .menu');
  ok(['Capture region', 'Record region', 'Extract text', 'Open history', '⌃⌥A', '⌃⌥R', '⌃⌥O'].every((t) => menu.includes(t)), 'SS-1 menubar menu lists actions with hotkey labels');
  await p.click('#pop [data-m=capture]'); await p.waitForSelector('.ss-sel'); ok(true, 'SS-1 menubar Capture region starts capture'); await key('Escape');
  await p.click('[data-mb=oneshot]');
  ok((await p.textContent('#pop')).includes('Capture region'), 'SS-1 reachable from the OneShot menu'); await key('Escape');

  /* SS-7 history */
  await rail('screenshot'); await p.waitForSelector('#view .ss-tile');
  const tiles = () => p.$$eval('#view .ss-tile', (n) => n.length);
  const t0 = await tiles();
  ok(t0 >= 6, 'SS-7 grid shows tiles (' + t0 + ')');
  await shot('19-history');
  await p.fill('#view .search', 'GitHub');
  ok((await tiles()) === 1, 'SS-7 search by OCR text');
  await p.fill('#view .search', 'Documents'); ok((await tiles()) === 1, 'SS-7 search by path');
  await p.fill('#view .search', '');
  await p.click('#view [data-kind] [data-v=recording]');
  ok((await tiles()) === 3, 'SS-7 filter Recordings');
  await p.click('#view [data-kind] [data-v=image]');
  ok((await tiles()) === t0 - 3, 'SS-7 filter Images');
  await p.click('#view [data-kind] [data-v=all]');
  /* D4 keyboard: grid focused on mount; arrows move selection; Enter copies */
  await p.fill('#view .search', 'x'); await p.fill('#view .search', ''); await rail('screenshot'); await p.waitForSelector('#view .ss-tile');
  ok(await p.evaluate(() => document.activeElement.classList.contains('ss-grid')), 'D4 history grid is focused on mount');
  const g0 = await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id);
  await p.keyboard.press('ArrowRight');
  const g1 = await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id);
  ok(g1 !== g0 && g1 === (await p.$eval('#view .ss-tile:nth-child(2)', (e) => e.dataset.id)), 'D4 ArrowRight selects the next capture');
  await p.keyboard.press('ArrowDown');
  const g2 = await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id);
  ok(g2 !== g1, 'D4 ArrowDown moves down a row');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowLeft');
  ok((await p.$eval('#view .ss-tile.sel', (e) => e.dataset.id)) === g0, 'D4 arrows move back');
  const cbk = (await clips()).length;
  await p.keyboard.press('Enter');
  ok((await clips()).length >= cbk && (await p.$('#toasts .toast')), 'D4 Enter copies the selected capture');
  await p.click('#view .ss-tile:nth-child(2)');
  await shot('20-history-detail');
  const cb = (await clips()).length;
  await p.click('[data-a=copy]');
  ok((await clips()).length === cb + 1 || (await clips()).some((c) => c.at > Date.now() - 3000), 'SS-7 Copy writes to Clipboard history');
  await p.click('[data-a=reveal]'); ok(await p.$('#toasts .toast:has-text("Finder")'), 'SS-7 Reveal shows the path');
  const delId = await p.getAttribute('#view .ss-tile.sel', 'data-id');
  await p.click('[data-a=del]');
  ok(!(await shots()).some((x) => x.id === delId) && (await tiles()) === t0 - 1, 'SS-7 Delete removes the shot');

  /* SS-8 retention */
  ok((await shots()).some((x) => x.id === 'sh4') && (await shots()).some((x) => x.id === 'sh3'), 'D12 default 30-day retention keeps the 20-day and 12-day captures (seed sh4 is visible at boot)');
  await front(); await p.evaluate(() => OS.openPrefs('screenshot'));
  await p.click('#prefs [data-k="screenshot.retention"] button:has-text("7 days")');
  ok(!(await shots()).some((x) => x.id === 'sh3' || x.id === 'sh4') && (await shots()).some((x) => x.id === 'sh2'), 'SS-8 7-day retention prunes the 20-day and 12-day captures');
  for (let i = 0; i < 5; i++) await skipDay();
  ok(!(await shots()).some((x) => x.id === 'sh2') && (await shots()).some((x) => x.id === 'sh1'), 'SS-8 skipping ahead ages out the 3-day recording (now 8d), keeps 6d');
  await front(); await p.evaluate(() => OS.openPrefs('screenshot')); await shot('21-prefs');

  /* ST-1 states */
  await rail('screenshot'); await p.waitForSelector('#view .ss-tile');
  await scnToggle('slow'); await rail('screenshot');
  ok(await p.$('#view .state.loading'), 'ST-1 loading'); await shot('22-loading');
  await scnToggle('slow');
  await scnToggle('screenshot.fail'); await rail('screenshot'); await p.waitForSelector('#view .state.failure'); await shot('23-failure');
  await scnToggle('screenshot.fail');
  await scnToggle('screenshot.empty'); await rail('screenshot'); await p.waitForSelector('#view .state.empty');
  await shot('24-empty');
  await p.click('#view .state [data-act]');
  await p.waitForSelector('.ss-sel'); ok(true, 'ST-1 empty state action starts a capture'); await key('Escape');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('screenshot: all passed');
})().catch((e) => { console.error(e.message, globalThis.__errs || ''); process.exit(1); });
