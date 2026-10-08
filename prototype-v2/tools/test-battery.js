// Battery walkthrough: BT-1..BT-4, ST-1..ST-3. Usage: node tools/test-battery.js
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('  ok  ' + m); };
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (name) => p.screenshot({ path: `/tmp/battery-${String(++n).padStart(2, '0')}-${name}.png` });
  const txt = (s) => p.evaluate((s) => (document.querySelector(s) || {}).textContent || '', s);
  const setRange = (sel, v) => p.evaluate(([s, v]) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);
  const popOpen = async () => { if (await p.$('#pop:not([hidden]) .bt-pop')) return; await p.click('[data-mb=battery]'); await p.waitForSelector('#pop .bt-pop'); };
  const popClose = async () => { await p.keyboard.press('Escape'); };
  const scn = async (key) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${key}"]`); await p.keyboard.press('Escape'); };
  const charge = () => p.evaluate(() => OS.data.battery.charge);
  const pref = (k) => p.evaluate((k) => OS.pref(k), k);
  const aria = (s) => p.getAttribute(s, 'aria-checked');
  const installHelper = async () => { await p.click('[data-grant]'); await p.click('#dlg [data-r="1"]'); await p.waitForSelector('#dlg', { state: 'hidden' }); };

  console.log('BT-1 menubar + popover');
  ok(/62%/.test(await txt('[data-mb=battery]')), 'menubar shows 62%');
  await popOpen();
  let t = await txt('#pop');
  ok(/62%/.test(t) && /Charging · .* to 100%/.test(t), 'popover: charge + charging estimate (limit off)');
  ok(/Battery settings/.test(t), 'footer has Battery settings');
  ok(!!(await p.$('#pop .bt-bar')), 'big bar present');
  console.log('ST-2 helper missing');
  ok(!!(await p.$('#pop .state.permission')) && !(await p.$('#pop [data-ls]')), 'popover shows helper grant in place of limit control');
  await shot('popover-helper-missing');

  console.log('BT-2 limit from popover');
  await installHelper();
  ok(!!(await p.$('#pop [data-ls]')) && !(await p.$('#pop .state.permission')), 'after install: toggle + slider replace the grant');
  ok((await p.getAttribute('#pop [data-ls]', 'step')) === '5' && (await p.getAttribute('#pop [data-ls]', 'min')) === '50', 'slider 50-100 step 5');
  ok(await p.isDisabled('#pop [data-ls]'), 'slider disabled while limit off');
  await p.click('#pop [data-lt]');
  ok((await pref('battery.limitOn')) === true && (await aria('#pop [data-lt]')) === 'true', 'toggle on sets pref');
  ok(!(await p.isDisabled('#pop [data-ls]')), 'slider enabled');
  await setRange('#pop [data-ls]', 70);
  ok((await pref('battery.limit')) === 70, 'slider sets pref limit=70');
  t = await txt('#pop');
  ok(/Charging · .* to 70%/.test(t), 'state line targets 70%: ' + t.match(/Charging[^B]*?70%/));
  ok(await p.$eval('#pop [data-mark]', (e) => e.style.left === '70%' && !e.hidden), 'limit marker at 70%');
  await shot('popover-limit-on');

  console.log('BT-2 popover -> view');
  await p.click('#pop [data-set]');
  await p.waitForSelector('.bt-view');
  ok((await aria('.pane [data-k="battery.limitOn"]')) === 'true', 'pane toggle reflects popover');
  ok((await p.inputValue('.pane [data-k="battery.limit"]')) === '70', 'pane slider reflects popover (70)');
  ok((await p.getAttribute('[data-limit-line]', 'data-limit')) === '70' && (await p.getAttribute('[data-limit-line]', 'data-on')) === 'true', 'chart limit line at 70, active');
  await shot('view');

  console.log('BT-2 view pane -> popover');
  await setRange('.pane [data-k="battery.limit"]', 60);
  ok((await pref('battery.limit')) === 60, 'pane sets pref 60');
  ok((await p.getAttribute('[data-limit-line]', 'data-limit')) === '60', 'chart line moved to 60');
  await popOpen();
  t = await txt('#pop');
  ok(/Holding at 60%/.test(t), 'popover: Holding at 60% (charge 62 >= limit)');
  ok((await p.inputValue('#pop [data-ls]')) === '60', 'popover slider = 60');
  ok((await aria('#pop [data-lt]')) === 'true', 'popover toggle on');
  await shot('popover-holding');
  const c0 = await charge(); await p.waitForTimeout(4600);
  ok((await charge()) === c0, 'holding: charge does not move on ticks');

  console.log('live: pref changed elsewhere updates the open popover');
  await p.evaluate(() => OS.setPref('battery.limit', 90));
  ok((await p.inputValue('#pop [data-ls]')) === '90' && /to 90%/.test(await txt('#pop')), 'open popover follows pref (90)');
  await p.click('#pop [data-lt]');
  ok((await pref('battery.limitOn')) === false, 'popover toggle off');
  await p.click('#pop [data-set]');
  await p.waitForSelector('.bt-view');
  ok((await aria('.pane [data-k="battery.limitOn"]')) === 'false' && (await p.inputValue('.pane [data-k="battery.limit"]')) === '90', 'view agrees: off, 90');
  ok((await p.getAttribute('[data-limit-line]', 'data-on')) === 'false', 'chart line shown as inactive when limit off');

  console.log('BT-2 Preferences -> popover');
  await p.click('[data-go=prefs]');
  await p.waitForSelector('#ps-battery');
  await p.click('#ps-battery [data-k="battery.limitOn"]');
  await setRange('#ps-battery [data-k="battery.limit"]', 75);
  ok((await pref('battery.limitOn')) === true && (await pref('battery.limit')) === 75, 'Preferences sets limitOn + 75');
  ok(/Limit charging/.test(await txt('#ps-battery')) && /No sooner|Charging holds/.test(await txt('#ps-battery')), 'prefs rows show effect lines');
  await shot('preferences');
  await popOpen();
  ok((await aria('#pop [data-lt]')) === 'true' && (await p.inputValue('#pop [data-ls]')) === '75', 'popover reflects Preferences');
  ok(/Holding at 75%/.test(await txt('#pop')) === false && /Charging · .* to 75%/.test(await txt('#pop')), 'state line charges toward 75% (charge 62)');
  await popClose();

  console.log('BT-3 hot pauses charging');
  await scn('battery.hot');
  await popOpen();
  t = await txt('#pop');
  ok(/Paused — Mac is hot/.test(t), 'popover: Paused — Mac is hot');
  ok(/41 °C/.test(t), 'popover shows 41 °C');
  ok(await p.$eval('#pop .bt-fill', (e) => e.classList.contains('paused')), 'bar tinted as paused');
  await shot('popover-paused-hot');
  const c1 = await charge(); await p.waitForTimeout(4600);
  ok((await charge()) === c1, 'paused: charge holds while hot');
  await p.click('#pop [data-set]'); await p.waitForSelector('.bt-view');
  ok(/Paused — hot/.test(await txt('.bt-note')) && /41 °C/.test(await txt('[data-v=temp]')), 'view shows Paused — hot, 41 °C');
  // turn pause-when-hot off in the pane -> charging resumes
  await p.click('.pane [data-k="battery.pauseHot"]');
  ok((await pref('battery.pauseHot')) === false, 'pauseHot off');
  await p.waitForTimeout(4600);
  ok((await charge()) > c1, 'charging continues when pause-when-hot is off');
  await p.click('.pane [data-k="battery.pauseHot"]');
  await scn('battery.hot');

  console.log('ST-2 helper removed while limit on');
  await p.click('[data-go=prefs]'); await p.waitForSelector('#ps-battery');
  await p.click('#ps-permissions [data-p="helper"]');
  await p.click('#dlg [data-r="1"]'); await p.waitForSelector('#dlg', { state: 'hidden' });
  await popOpen();
  ok(/Limit off — helper not installed/.test(await txt('#pop')), 'state line: Limit off — helper not installed');
  ok(!!(await p.$('#pop .state.permission')), 'grant shown in popover again');
  await shot('popover-no-helper-limit-on');
  await p.click('#pop [data-set]'); await p.waitForSelector('.bt-view');
  ok(!!(await p.$('.pane .state.permission')) && !(await p.$('.pane [data-k="battery.limit"]')), 'view pane shows compact grant instead of limit control');
  await shot('view-helper-missing');
  await installHelper();
  ok(!!(await p.$('.pane [data-k="battery.limit"]')), 'view restores limit control after install');
  await p.click('.pane [data-k="battery.limitOn"]'); // off, so charging is not capped below

  console.log('on battery + showPercent');
  await scn('battery.unplugged');
  await popOpen();
  t = await txt('#pop');
  ok(/On battery · \d+ h/.test(t), 'popover: On battery · N h left');
  const c2 = await charge(); await p.waitForTimeout(4600);
  ok((await charge()) < c2, 'unplugged: charge drops on ticks');
  await shot('popover-on-battery');
  await p.click('#pop [data-set]'); await p.waitForSelector('.bt-view');
  await p.click('.pane [data-k="battery.showPercent"]');
  ok((await txt('[data-mb=battery]')).trim() === '', 'menubar percent hidden when showPercent off');
  await p.click('.pane [data-k="battery.showPercent"]');
  ok(/\d+%/.test(await txt('[data-mb=battery]')), 'menubar percent back on');
  await scn('battery.unplugged');

  console.log('BT-4 history chart');
  await p.click('[data-go=battery]'); await p.waitForSelector('.bt-chart svg');
  ok((await p.$$eval('[data-line]', (e) => e[0].getAttribute('points').split(' ').length)) === 24, '24 h chart has 24 points');
  await p.click('.seg [data-r=d7]');
  ok((await p.$$eval('[data-line]', (e) => e[0].getAttribute('points').split(' ').length)) === 168, '7 d chart has 7×24 points');
  ok(/%/.test(await txt('[data-v=health]')) && /^\d+$/.test((await txt('[data-v=cycles]')).trim()), 'health % and cycles shown');
  await shot('view-7d');
  await p.click('.seg [data-r=h24]');

  await p.click('[data-go=battery]'); await p.waitForSelector('.bt-view');
  ok(!(await p.$('[data-oth] [data-k="battery.showPercent"]')) && !!(await p.$('[data-bar] [data-k="battery.showPercent"]')) && !!(await p.$('[data-oth] [data-k="battery.pauseHot"]')), 'D12 Show percentage sits under Menu bar, not When charging');

  console.log('ST-1 empty / failure');
  await scn('battery.empty');
  await p.click('[data-go=battery]'); await p.waitForSelector('.bt-view');
  ok(/Collecting battery history/.test(await txt('.bt-chart')), 'empty: Collecting battery history');
  await shot('view-empty');
  await scn('battery.empty');
  await scn('battery.fail');
  await popOpen();
  ok(!!(await p.$('#pop .state.failure')) && !(await p.$('#pop .bt-big')) && /Try again/.test(await txt('#pop')), 'D3 Battery popover shows the store failure instead of data');
  await shot('popover-store-fail');
  await popClose();
  await p.click('[data-go=battery]'); await p.waitForSelector('.state.failure');
  ok(/Couldn’t load Battery/.test(await txt('#view')), 'failure state shown');
  await shot('view-failure');
  await scn('battery.fail');
  await p.click('#view [data-act]'); await p.waitForSelector('.bt-view');
  ok(true, 'Try again recovers');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('battery: all passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
