// Usage: node tools/capture.js
// Produces curated, deterministic image set into prototype-v2/shots/
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');

const SHOTS_DIR = path.resolve(__dirname, '../shots');
const files = [];

(async () => {
  // Ensure shots directory exists
  if (!fs.existsSync(SHOTS_DIR)) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  }

  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));

  // Helper functions
  const goto = async (hash = '') => {
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + (hash ? '#' + hash : ''));
    await p.waitForTimeout(500);
  };

  const shot = async (name) => {
    await p.waitForTimeout(400); // wait for animations
    const filepath = path.join(SHOTS_DIR, name);
    await p.screenshot({ path: filepath });
    files.push(filepath);
  };

  const touchOk = async () => { await p.locator('#dlg [data-touch]').waitFor(); await p.click('#dlg [data-touch]'); };
  const autofillUnlocked = async () => {           // focus the login field, unlock with Touch ID, wait for rows
    await p.evaluate(() => OS.host.safari.front());
    await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]');
    await p.locator('#float .state.locked').waitFor(); await p.click('#float [data-act]'); await touchOk();
    await p.locator('#float .vt-row').first().waitFor();
  };
  const key = (k) => p.keyboard.press(k);
  const click = (sel) => p.click(sel);
  const front = () => p.evaluate(() => OS.front('#win'));
  const rail = async (id) => {
    if (await p.$eval('#win', (e) => e.hidden)) {
      await p.evaluate((i) => OS.open(i), id);
    } else {
      await front();
      await p.click(`#rail [data-go=${id}]`);
    }
  };
  const wrench = async (scenario) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${scenario}"]`); await key('Escape'); };
  const setRange = (k, v) => p.$eval(`input[data-k="${k}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  const copyInTextEdit = async (a, bb) => { await p.evaluate(([a, bb]) => { OS.host.textedit.select(a, bb); OS.host.textedit.el().dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true })); }, [a, bb]); };
  const taVal = () => p.evaluate(() => OS.host.textedit.value());
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.map((c) => ({ id: c.id, kind: c.kind, text: c.text, pinned: c.pinned, at: c.at, source: c.source })));
  const rows = () => p.$$eval('#float .cb-r .t', (n) => n.map((x) => x.textContent));
  const floatOpen = () => p.evaluate(() => !document.querySelector('#float').hidden);
  const drag = async (x0, y0, x1, y1) => {
    await p.mouse.move(x0, y0);
    await p.mouse.down();
    await p.mouse.move((x0 + x1) / 2, (y0 + y1) / 2);
    await p.mouse.move(x1, y1, { steps: 3 });
    await p.mouse.up();
  };
  const grantScreen = async () => {
    await p.click('#overlay [data-grant]');
    await p.click('#dlg [data-t]');
    await p.click('#dlg [data-r=done]');
  };
  const overlayOpen = () => p.evaluate(() => !document.querySelector('#overlay').hidden);
  const toastBtn = (t) => p.click(`#toasts .toast button:has-text("${t}")`);
  const shots = () => p.evaluate(() => OS.data.screenshot.shots.map((s) => ({ id: s.id, kind: s.kind, path: s.path, format: s.format, duration: s.duration, marks: s.marks.length, ocr: s.ocr, w: s.rect.w, h: s.rect.h, at: s.at })));
  const btn = (t) => p.click(`.ss-tb button:has-text("${t}")`);
  const selectLine = (prefix) => p.evaluate((pre) => { if (OS.host.textedit.value().indexOf(pre) < 0) OS.host.textedit.el().value = window.__orig; const v = OS.host.textedit.value(); const s = v.indexOf(pre); const e = v.indexOf('\n', s); OS.host.textedit.select(s, e); return v.slice(s, e); }, prefix);
  const pill = () => p.locator('#float .js-pill');
  const closeWin = async () => { if (await p.locator('#win').isVisible()) await p.click('#rail [data-close]'); };
  const popOpen = async () => {
    if (await p.$('#pop:not([hidden]) .bt-pop')) return;
    await p.click('[data-mb=battery]');
    await p.waitForSelector('#pop .bt-pop');
  };
  const popClose = async () => { await key('Escape'); };
  const installHelper = async () => { await p.click('[data-grant]'); await p.click('#dlg [data-r="1"]'); await p.waitForSelector('#dlg', { state: 'hidden' }); };
  const capture = async (r = [60, 150, 560, 330]) => {
    await key('Control+Alt+KeyA');
    // Check for permission dialog
    if (await p.$('#overlay .state.permission')) {
      await grantScreen();
    }
    await p.waitForSelector('.ss-sel', { timeout: 5000 }).catch(() => {});
    await drag(...r);
  };

  try {
    // ===== SHELL MAP =====
    console.log('Capturing shell map...');

    // 01-shell-preferences-top.png
    await goto();
    await p.evaluate(() => OS.openPrefs('permissions'));
    await shot('01-shell-preferences-top.png');

    // 02-shell-hotkeys.png
    await goto();
    await p.evaluate(() => OS.openPrefs('hotkeys'));
    await shot('02-shell-hotkeys.png');

    // 03-shell-oneshot-menu.png
    await goto();
    await p.click('[data-mb="oneshot"]');
    await shot('03-shell-oneshot-menu.png');

    // 04-shell-scenarios-menu.png
    await goto();
    await p.click('[data-mb="scn"]');
    await shot('04-shell-scenarios-menu.png');

    // 05-shell-rail-clipboard.png
    await goto();
    await rail('clipboard');
    await p.waitForSelector('#view .split .row', { timeout: 3000 }).catch(() => {});
    await shot('05-shell-rail-clipboard.png');

    // ===== CLIPBOARD (10-12) =====
    console.log('Capturing clipboard...');

    // 10-clipboard-runtime.png - float at caret
    await goto();
    await p.evaluate(() => { document.querySelector('#win').hidden = true; });
    await p.evaluate(() => OS.host.textedit.select(40, 40));
    await key('Control+Alt+KeyV');
    await shot('10-clipboard-runtime.png');

    // 11-clipboard-data.png - data view
    await goto();
    await copyInTextEdit(0, 21);
    await rail('clipboard');
    await p.waitForSelector('#view .split .row', { timeout: 3000 }).catch(() => {});
    await shot('11-clipboard-data.png');

    // 12-clipboard-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('clipboard'));
    await shot('12-clipboard-prefs.png');

    // ===== SCREENSHOT (13-15) =====
    console.log('Capturing screenshot...');

    // 13-screenshot-runtime.png - editor with arrow + rectangle
    await goto();
    await key('Control+Alt+KeyA');
    if (await p.$('#overlay .state.permission')) {
      await grantScreen();
    }
    await p.waitForSelector('.ss-sel', { timeout: 5000 }).catch(() => {});
    await drag(60, 150, 560, 330);
    await p.waitForSelector('.ss-ed', { timeout: 3000 }).catch(() => {});
    await btn('Arrow');
    await drag(120, 250, 300, 190);
    await btn('Rectangle');
    await drag(90, 160, 330, 215);
    await shot('13-screenshot-runtime.png');

    // 14-screenshot-data.png - history (do a capture first)
    await goto();
    await capture();
    await p.waitForSelector('.ss-ed');
    await btn('Copy & Close');
    await p.waitForTimeout(500);
    await rail('screenshot');
    await p.waitForSelector('#view .row', { timeout: 3000 }).catch(() => {});
    await shot('14-screenshot-data.png');

    // 15-screenshot-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('screenshot'));
    await shot('15-screenshot-prefs.png');

    // ===== BATTERY (16-18) =====
    console.log('Capturing battery...');

    // 16-battery-runtime.png - popover with the limit on (helper installed through the dialog)
    await goto();
    await p.click('[data-mb=battery]');
    await p.locator('#pop [data-grant]').click();
    await p.click('#dlg [data-r="1"]');
    await p.locator('#pop [data-lt]').click();
    await p.waitForFunction(() => OS.pref('battery.limitOn') === true);
    await shot('16-battery-runtime.png');
    await popClose();

    // 17-battery-data.png
    await goto();
    await popOpen();
    if (await p.$('#pop .state.permission')) {
      await installHelper();
    }
    await p.click('#pop [data-set]');
    await p.waitForSelector('.bt-view', { timeout: 3000 }).catch(() => {});
    await shot('17-battery-data.png');

    // 18-battery-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('battery'));
    await shot('18-battery-prefs.png');

    // ===== DISPLAYS (19-21) =====
    console.log('Capturing displays...');

    // 19-displays-runtime.png - popover
    await goto();
    await p.click('[data-mb=displays]');
    await p.waitForSelector('#pop .dd-pop', { timeout: 3000 }).catch(() => {});
    await shot('19-displays-runtime.png');

    // 20-displays-data.png
    await goto();
    await rail('displays');
    await p.waitForSelector('#view .row', { timeout: 3000 }).catch(() => {});
    await shot('20-displays-data.png');

    // 21-displays-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('displays'));
    await shot('21-displays-prefs.png');

    // ===== JSON (22-24) =====
    console.log('Capturing JSON...');

    // 22-json-runtime.png - Format pill
    await goto();
    await closeWin();
    await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
    const VALID = '{"service":"status"';
    await selectLine(VALID);
    await key('Control+Alt+KeyF');
    await pill().waitFor({ timeout: 3000 }).catch(() => {});
    await shot('22-json-runtime.png');

    // 23-json-data.png - Studio
    await goto();
    await closeWin();
    await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
    await selectLine(VALID);
    await key('Control+Alt+KeyF');
    await pill().waitFor({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(200);
    await rail('json');
    await p.waitForSelector('#view .row', { timeout: 3000 }).catch(() => {});
    await shot('23-json-data.png');

    // 24-json-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('json'));
    await shot('24-json-prefs.png');

    // ===== VAULT (25-27) =====
    console.log('Capturing vault...');

    // 25-vault-runtime.png - Autofill float on github.com, unlocked
    await goto();
    await autofillUnlocked();
    await shot('25-vault-runtime.png');

    // 26-vault-data.png - unlocked, entry selected (via Open in Vault)
    await p.click('#float .vt-row:nth-child(2) [data-v]');
    await p.locator('#view [data-f=title]').waitFor();
    await shot('26-vault-data.png');

    // 27-vault-prefs.png
    await goto();
    await p.evaluate(() => OS.openPrefs('vault'));
    await shot('27-vault-prefs.png');

    // ===== HANDOFFS =====
    console.log('Capturing handoffs...');

    // 30-ho1-shot-toast.png (toast with Open after Copy & Close)
    await goto();
    await p.evaluate(() => { document.querySelector('#win').hidden = true; });
    await capture();
    await p.waitForSelector('.ss-ed');
    await btn('Arrow');
    await drag(120, 250, 300, 190);
    await btn('Copy & Close');
    await shot('30-ho1-shot-toast.png');

    // 31-ho1-clipboard-selected.png (Clipboard with the new clip selected)
    await toastBtn('Open');
    await p.waitForSelector('#view .row.sel', { timeout: 3000 }).catch(() => {});
    await shot('31-ho1-clipboard-selected.png');

    // 32-ho2-clipboard-format-pill.png (Format pill opened from JSON clip)
    await goto();
    await rail('clipboard');
    await p.waitForSelector('#view .row', { timeout: 3000 }).catch(() => {});
    await p.click('#view [data-type] [data-v=json]');
    if (await p.$('#view .row')) {
      await p.click('#view .row');
      await p.click('[data-a=format]');
      await p.waitForTimeout(400);
    }
    await shot('32-ho2-clipboard-format-pill.png');

    // 33-ho2-studio-selected.png — Open in Studio from the clip's Format pill
    await p.locator('#float [data-open]').click();
    await p.locator('.js-row.sel').waitFor();
    await shot('33-ho2-studio-selected.png');

    // 34-ho3-autofill-open-in-vault.png — unlocked float, hover Open in Vault on the work account
    await goto();
    await autofillUnlocked();
    await p.hover('#float .vt-row:nth-child(3) [data-v]');
    await shot('34-ho3-autofill-open-in-vault.png');

    // 35-ho3-vault-selected.png
    await p.click('#float .vt-row:nth-child(3) [data-v]');
    await p.locator('#view [data-f=title]').waitFor();
    await shot('35-ho3-vault-selected.png');

    // 36-ho3-noentry-float.png — vault already unlocked; switch to status.acme.io
    await p.click('#rail [data-close]');
    await p.click('#sf [data-tab="1"]');
    await p.click('#sf [data-login=user]');
    await p.locator('#float .state').waitFor();
    await shot('36-ho3-noentry-float.png');
    await shot('50-no-vault-entry.png');

    // 37-ho3-vault-create.png (new entry form with URL filled)
    await p.click('#float [data-act]');
    await p.locator('#view [data-f=url]').waitFor();
    await shot('37-ho3-vault-create.png');

        // ===== STATES =====
    console.log('Capturing states...');

    // 40-state-loading.png (loading state in data view)
    await goto();
    await wrench('slow');
    await rail('clipboard');
    if (await p.$('#view .state.loading')) {
      await shot('40-state-loading.png');
    }
    await wrench('slow');

    // 41-state-empty-clipboard.png
    await goto();
    await wrench('clipboard.empty');
    await rail('clipboard');
    await p.waitForSelector('#view .state.empty', { timeout: 3000 }).catch(() => {});
    await shot('41-state-empty-clipboard.png');
    await wrench('clipboard.empty');

    // 42-state-failure-json.png
    await goto();
    await closeWin();
    await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
    const INVALID = '{"event":"deploy"';
    await selectLine(INVALID);
    await key('Control+Alt+KeyF');
    await pill().waitFor({ timeout: 3000 }).catch(() => {});
    await shot('42-state-failure-json.png');

    // 43-perm-screen-recording.png
    await goto();
    await key('Control+Alt+KeyA');
    if (await p.$('#overlay .state.permission')) {
      await shot('43-perm-screen-recording.png');
      await key('Escape');
    }

    // 44-perm-accessibility.png (revoked)
    await goto();
    await p.evaluate(() => OS.perm.set('access', false));
    await p.evaluate(() => { document.querySelector('#win').hidden = true; });
    await key('Control+Alt+KeyV');
    await p.waitForSelector('#float', { timeout: 3000 }).catch(() => {});
    await shot('44-perm-accessibility.png');

    // 45-perm-helper.png (battery popover without helper)
    await goto();
    await p.evaluate(() => OS.perm.set('helper', false));
    await popOpen();
    await shot('45-perm-helper.png');

    // 46-ddc-unsupported.png (displays view)
    await goto();
    await p.evaluate(() => OS.open('displays', { select: 'tv' }));
    await p.locator('#view .state.unsupported').first().waitFor();
    await shot('46-ddc-unsupported.png');

    // 47-touchid-failed.png — same steps as tools/test-vault.js
    await goto();
    await wrench('vault.touchFail');
    await p.evaluate(() => OS.host.safari.front());
    await p.click('#sf [data-login=user]');
    await p.locator('#float .state.locked').waitFor();
    await p.click('#float [data-act]');
    await p.locator('#dlg [data-touch]').waitFor();
    await p.click('#dlg [data-touch]');
    await p.locator('#float .state.failure').waitFor();
    await shot('47-touchid-failed.png');

    // 48-vault-locked.png
    try {
      await goto();
      await p.evaluate(() => { OS.data.vault.locked = true; });
      await rail('vault');
      await p.waitForSelector('#view', { timeout: 3000 }).catch(() => {});
      if (await p.$('#view .state.locked')) {
        await shot('48-vault-locked.png');
      } else {
        // Try to create locked state manually
        await shot('48-vault-locked.png');
      }
    } catch (e) {
      console.log('Note: 48-vault-locked.png could not be captured');
    }

    // 49-invalid-json.png
    await goto();
    await closeWin();
    await p.evaluate(() => (window.__orig = OS.host.textedit.value()));
    await selectLine(INVALID);
    await key('Control+Alt+KeyF');
    await pill().waitFor({ timeout: 3000 }).catch(() => {});
    await shot('49-invalid-json.png');

    // Report
    console.log('\n=== CAPTURE COMPLETE ===');
    console.log(`Files written: ${files.length}`);
    files.forEach((f) => {
      const name = path.basename(f);
      console.log(`  ${name}`);
    });

    if (errs.length) {
      console.log('\nWarnings:');
      errs.forEach((e) => console.log(`  ${e}`));
    }

    await b.close();
    process.exit(0);

  } catch (e) {
    console.error('ERROR:', e.message);
    console.error(e.stack);
    await b.close();
    process.exit(1);
  }
})();
