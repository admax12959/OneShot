// Usage: node tools/capture.js   — curated v3 shots into prototype-v3/shots/ (one fresh browser context per shot).
// A failing shot is reported and skipped; the run exits non-zero if any shot failed or the page logged errors.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const DIR = path.resolve(__dirname, '../shots');
const URL = 'file://' + path.resolve(__dirname, '../index.html');
fs.mkdirSync(DIR, { recursive: true });

const SHOTS = [
  ['01-desk-textedit-active', async (p) => { await p.click('#te textarea', { position: { x: 200, y: 300 } }); }],
  ['02-window-clipboard', async (p) => { await open(p, 'clipboard'); await p.click('#view .row'); }],
  ['03-menu-edit-validated', async (p) => { await open(p, 'clipboard'); await p.click('#view .row'); await p.click('#mbL [data-menu=edit]'); }],
  ['04-prefs-general', async (p) => { await prefs(p, 'general'); }],
  ['05-prefs-privacy-last-copy', async (p) => { await p.evaluate(() => { OS.perm.set('helper', true); OS.setScn('perm.helperOutdated', true); OS.pasteboard.copy({ text: 's3cret', source: 'Vault' }); }); await prefs(p, 'privacy'); await p.evaluate(() => (OS.$('#prefs').scrollTop = 400)); }],
  ['06-prefs-hotkeys-conflict', async (p) => { await prefs(p, 'hotkeys'); await p.click('[data-hk="clipboard.open"]'); await p.keyboard.press('Control+Alt+KeyA'); }],
  ['07-prefs-hotkeys-reserved', async (p) => { await prefs(p, 'hotkeys'); await p.click('[data-hk="json.format"]'); await p.keyboard.press('Meta+Space'); }],
  ['08-prefs-storage', async (p) => { await p.waitForTimeout(400); await prefs(p, 'storage'); }],
  ['09-prefs-feature-clipboard', async (p) => { await prefs(p, 'clipboard'); }],
  ['10-clipboard-float', async (p) => { await p.evaluate(() => OS.host.textedit.select(40, 40)); await p.keyboard.press('Control+Alt+KeyV'); }],
  ['11-clipboard-nomatch', async (p) => { await open(p, 'clipboard'); await p.fill('#view .search', 'zebra'); await p.waitForTimeout(400); }],
  ['12-clipboard-large', async (p) => { await p.evaluate(() => OS.setScn('clipboard.large', true)); await open(p, 'clipboard'); await p.waitForTimeout(500); }],
  ['13-state-loading-skeleton', async (p) => { await p.evaluate(() => OS.setScn('slow', true)); await open(p, 'clipboard', 150); }],
  ['14-state-failure', async (p) => { await p.evaluate(() => OS.setScn('json.fail', true)); await open(p, 'json'); }],
  ['15-screenshot-gate', async (p) => { await p.keyboard.press('Control+Alt+KeyA'); }],
  ['16-screenshot-editor', async (p) => { await capture(p); }],
  ['17-screenshot-save-disk-full', async (p) => { await p.evaluate(() => OS.setScn('screenshot.diskFull', true)); await capture(p); await p.click('[data-a=save]'); await p.waitForTimeout(1800); }],
  ['18-screenshot-history', async (p) => { await open(p, 'screenshot'); }],
  ['19-battery-popover', async (p) => { await p.click('[data-mb=battery]'); }],
  ['20-battery-failsafe', async (p) => { await p.evaluate(() => { OS.perm.set('helper', true); OS.setPref('battery.limitOn', true); OS.setScn('battery.helperDisconnect', true); }); await open(p, 'battery'); await p.click('[data-mb=battery]'); }],
  ['21-battery-helper-outdated', async (p) => { await p.evaluate(() => { OS.perm.set('helper', true); OS.setScn('perm.helperOutdated', true); }); await open(p, 'battery'); }],
  ['22-displays-popover-backends', async (p) => { await p.click('[data-mb=displays]'); }],
  ['23-displays-view', async (p) => { await open(p, 'displays'); }],
  ['24-json-pill-formatted', async (p) => { await selectLine(p, '{"service"'); await p.keyboard.press('Control+Alt+KeyF'); }],
  ['25-json-pill-invalid', async (p) => { await selectLine(p, '{"event"'); await p.keyboard.press('Control+Alt+KeyF'); }],
  ['26-json-studio', async (p) => { await open(p, 'json'); await p.click('#view .js-row'); }],
  ['27-json-large-background', async (p) => { await p.evaluate(() => OS.setScn('json.large', true)); await open(p, 'json'); await p.waitForTimeout(1500); }],
  ['28-vault-autofill-locked', async (p) => { await p.evaluate(() => { OS.front('#sf'); OS.app.activate('Safari'); }); await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]'); }],
  ['29-vault-touch-id', async (p) => { await open(p, 'vault'); await p.click('#view .state.locked [data-act]'); }],
  ['30-vault-unlocked-masked', async (p) => { await unlockVault(p); }],
  ['31-vault-copy-concealed', async (p) => { await unlockVault(p); await p.click('#view [data-cp=password]'); }],
  ['32-vault-unstamped-leak', async (p) => { await p.evaluate(() => { OS.setScn('pb.watcher', true); OS.setScn('pb.unstamped', true); }); await unlockVault(p); await p.click('#view [data-cp=password]'); }],
  ['33-auth-password-fallback', async (p) => { await p.evaluate(() => OS.setScn('auth.unavailable', true)); await open(p, 'vault'); await p.click('#view .state.locked [data-act]'); }],
  ['34-contract-notes', async (p) => { await p.evaluate(() => { OS.setScn('notes', true); OS.setScn('perm.screenReapprove', true); OS.perm.set('screen', true); }); await prefs(p, 'privacy'); }],
  ['35-scenarios-menu', async (p) => { await p.click('[data-mb=scn]'); }],
];

async function open(p, id, wait = 600) { await p.evaluate((i) => OS.open(i), id); await p.waitForTimeout(wait); }
async function prefs(p, pane) { await p.evaluate((x) => OS.openPrefs(x), pane); await p.waitForTimeout(250); }
async function selectLine(p, pre) { await p.evaluate((x) => { const v = OS.host.textedit.value(), s = v.indexOf(x); OS.host.textedit.select(s, v.indexOf('\n', s)); }, pre); }
async function capture(p) {
  await p.evaluate(() => OS.perm.set('screen', true));
  await p.keyboard.press('Control+Alt+KeyA'); await p.waitForSelector('.ss-sel');
  await p.mouse.move(60, 150); await p.mouse.down(); await p.mouse.move(560, 330, { steps: 4 }); await p.mouse.up();
  await p.waitForSelector('.ss-ed');
}
async function unlockVault(p) {
  await open(p, 'vault'); await p.click('#view .state.locked [data-act]');
  await p.locator('#dlg [data-touch]').waitFor(); await p.click('#dlg [data-touch]'); await p.waitForTimeout(400);
  await p.click('#view .vt-list [data-id="v-billing"]');
}

(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  let failed = 0; const errs = [];
  for (const [name, run] of SHOTS) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errs.push(`${name}: ${m.text()}`));
    try {
      await p.goto(URL); await p.waitForTimeout(500);
      await run(p); await p.waitForTimeout(450);
      await p.screenshot({ path: path.join(DIR, name + '.png') });
      console.log('ok  ', name);
    } catch (e) { failed++; console.log('FAIL', name, '—', e.message.split('\n')[0]); }
    await ctx.close();
  }
  await b.close();
  console.log(errs.length ? errs.join('\n') : 'no errors');
  console.log(`${SHOTS.length - failed}/${SHOTS.length} shots → ${DIR}`);
  process.exit(failed || errs.length ? 1 : 0);
})();
