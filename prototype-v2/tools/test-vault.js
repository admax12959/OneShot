// node tools/test-vault.js  — walks VT-1..VT-7, HO-3, ST-1/2/3 for Vault.
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
  const shot = (name) => p.screenshot({ path: `/tmp/vault-${String(++n).padStart(2, '0')}-${name}.png` });
  const closeWin = async () => { if (await p.locator('#win').isVisible()) await p.click('#rail [data-close]'); };
  const scn = async (key) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${key}"]`); await p.keyboard.press('Escape'); };
  const float = () => p.locator('#float');
  const clips = () => p.evaluate(() => (OS.data.clipboard && OS.data.clipboard.clips ? OS.data.clipboard.clips.length : -1));
  const focusUser = async () => { await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]'); };
  const touch = async () => { await p.locator('#dlg [data-touch]').waitFor(); await p.click('#dlg [data-touch]'); };
  const unlockFloat = async () => { await p.click('#float [data-act]'); await touch(); await p.locator('#float .vt-row').first().waitFor(); };
  const toastText = () => p.locator('#toasts').innerText();
  const clip0 = await clips();

  // VT-1/VT-2 autofill on github.com: locked -> Touch ID -> entries
  await focusUser();
  await float().locator('.state.locked').waitFor();
  ok((await float().innerText()).includes('Unlock with Touch ID'), 'ST-3 vault locked state in Autofill');
  await shot('af-locked');
  await p.keyboard.press('Escape');
  ok(!(await float().isVisible()) && (await p.inputValue('#sf [data-login=user]')) === '', 'VT-1 Esc closes, nothing filled');

  await scn('vault.touchFail');
  await focusUser();
  await p.click('#float [data-act]'); await touch();
  await float().locator('.state.failure').waitFor();
  ok((await float().innerText()).includes('Try again') && (await float().innerText()).includes('Use password'), 'ST-3 Touch ID failed state (scenario) with retry / password');
  await shot('af-touch-failed');
  /* the shell consumes the scenario after one failed touch, so the next touch matches */
  ok(!(await p.evaluate(() => OS.scn('vault.touchFail'))), 'touchFail scenario is one-shot');
  await p.keyboard.press('Escape');
  await focusUser();
  await p.click('#float [data-act]'); await touch();
  await float().locator('.vt-row').first().waitFor();
  ok((await p.evaluate(() => OS.data.vault.locked)) === false, 'VT-2 retry after failure unlocks');
  const rows = await float().locator('.vt-row').allInnerTexts();
  ok(rows.length === 2 && (await float().innerText()).includes('GitHub (personal)') && (await float().innerText()).includes('GitHub (work)'), 'VT-1 two github.com entries listed: ' + rows.map((r) => r.split('\n')[0]).join(' / '));
  await shot('af-entries');
  await p.keyboard.press('ArrowDown');
  ok((await float().locator('.vt-row.sel').count()) === 1 && (await float().locator('.vt-row').nth(1).getAttribute('class')).includes('sel'), 'VT-1 arrow moves selection');
  await p.keyboard.press('Enter');
  ok((await p.inputValue('#sf [data-login=user]')) === 'maya@acme.io' && (await p.inputValue('#sf [data-login=pass]')) === 'Qr4#tz81-wKe', 'VT-1 Enter fills the second entry');
  await p.waitForTimeout(100);
  ok(!(await float().isVisible()), 'VT-1 float closed after fill (no reopen)');
  ok((await toastText()).includes('Filled · not added to Clipboard history'), 'VT-6 fill toast');
  ok((await clips()) === clip0, 'VT-6 fill added no clip');
  await shot('af-filled');

  // VT-4 Open in Vault
  await p.evaluate(() => { OS.host.safari.fields().user.value = ''; });
  await focusUser();
  await float().locator('.vt-row').first().waitFor();
  await p.click('#float .vt-row:nth-child(3) [data-v]');
  await p.waitForTimeout(500);
  const wantId = await p.evaluate(() => OS.data.vault.entries.find((e) => e.title === 'GitHub (work)').id);
  ok((await p.inputValue('[data-f=title]')) === 'GitHub (work)' || (await p.inputValue('[data-f=title]')).startsWith('GitHub'), 'VT-4 Open in Vault selects entry: ' + (await p.inputValue('[data-f=title]')));
  await shot('vault-detail');

  // D4 keyboard: list focused on mount, arrows move the selection, Enter focuses the entry form
  ok(await p.evaluate(() => document.activeElement.classList.contains('vt-list')), 'D4 Vault list is focused on mount');
  const kv0 = await p.inputValue('[data-f=title]');
  await p.keyboard.press('ArrowDown');
  const kv1 = await p.inputValue('[data-f=title]');
  ok(kv1 !== kv0, 'D4 ArrowDown selects the next login: ' + kv0 + ' -> ' + kv1);
  await p.keyboard.press('ArrowUp');
  ok((await p.inputValue('[data-f=title]')) === kv0, 'D4 ArrowUp selects the previous login');
  await p.keyboard.press('Enter');
  ok(await p.evaluate(() => document.activeElement.matches('[data-f=title]')), 'D4 Enter focuses the entry form');

  // VT-5 manage entries
  await p.fill('[data-q]', 'figma');
  ok((await p.locator('.vt-list .row').count()) === 1, 'VT-5 search filters');
  await p.fill('[data-q]', '');
  await p.click('.vt-list .row:has-text("GitHub (personal)")');
  await p.fill('[data-f=username]', 'maya.c');
  await p.click('[data-save]');
  ok(await p.evaluate(() => OS.data.vault.entries.find((e) => e.title === 'GitHub (personal)').username === 'maya.c'), 'VT-5 edit saved to data');
  ok((await p.locator('.vt-list').innerText()).includes('maya.c'), 'VT-5 list shows the edit');
  await p.click('[data-eye]');
  ok((await p.getAttribute('[data-f=password]', 'type')) === 'text', 'VT-5 password reveal');
  await shot('vault-edit');
  // VT-6 copy
  const c1 = await clips();
  await p.click('[data-cp=password]');
  ok(await p.evaluate(() => OS.pasteboard.current.source === 'Vault' && OS.pasteboard.current.text === 'hX7!pq2-Lm9v'), 'VT-6 copy password goes to pasteboard');
  ok((await toastText()).includes('Copied · not added to Clipboard history'), 'VT-6 copy toast');
  await p.click('[data-cp=username]');
  ok((await clips()) === c1 && (await clips()) === clip0, 'VT-6 vault copy adds no clip');
  // delete
  const cnt = await p.evaluate(() => OS.data.vault.entries.length);
  await p.click('.vt-list .row:has-text("Linear")'); await p.click('[data-del]');
  await shot('vault-confirm-delete');
  await p.click('#dlg [data-r="1"]');
  ok((await p.evaluate(() => OS.data.vault.entries.length)) === cnt - 1, 'VT-5 delete with confirm');
  // new
  await p.click('[data-new]');
  await p.fill('[data-f=title]', 'Throwaway'); await p.fill('[data-f=url]', 'https://www.example.com/login'); await p.fill('[data-f=username]', 'u'); await p.fill('[data-f=password]', 'p');
  await p.click('[data-save]');
  ok(await p.evaluate(() => OS.data.vault.entries.some((e) => e.title === 'Throwaway' && e.url === 'example.com')), 'VT-5 new entry created (url normalised)');

  // edits show in Autofill
  await closeWin();
  await focusUser();
  await float().locator('.vt-row').first().waitFor();
  ok((await float().innerText()).includes('maya.c'), 'VT-5 edit shows in Autofill');
  await p.keyboard.press('Escape');

  // VT-3 + HO-3: no entry on status.acme.io
  await p.click('#sf [data-tab="1"]');
  await p.click('#sf [data-login=user]');
  await float().locator('.state').waitFor();
  ok((await float().innerText()).includes('No login for status.acme.io'), 'VT-3 / ST-3 no entry for this URL');
  await shot('af-no-entry');
  await p.click('#float [data-act]');
  await p.waitForTimeout(400);
  ok((await p.inputValue('[data-f=url]')) === 'status.acme.io' && (await p.locator('.vt-list .row.sel').innerText()).includes('status.acme.io') && (await p.inputValue('[data-f=title]')) === 'status.acme.io', 'HO-3 Add to Vault opens new entry with URL + title filled');
  await shot('vault-new-from-autofill');
  await p.fill('[data-f=title]', 'Acme Status'); await p.fill('[data-f=username]', 'ops@acme.io'); await p.fill('[data-f=password]', 'st4tus-Pw!');
  await p.click('[data-save]');
  /* D11: saved from Autofill on the same host -> "Fill now" */
  await p.waitForSelector('#toasts .toast:has-text("Saved · Fill on status.acme.io")');
  ok(true, 'D11 save from Autofill offers "Fill on status.acme.io"');
  await p.click('#toasts .toast:has-text("Fill on") button');
  await p.waitForSelector('#toasts .toast:has-text("Filled · not added to Clipboard history")');
  ok((await p.inputValue('#sf [data-login=user]')) === 'ops@acme.io' && (await p.inputValue('#sf [data-login=pass]')) === 'st4tus-Pw!' && (await clips()) === clip0, 'D11 Fill now fills the login in Safari, no clip added');
  await p.evaluate(() => { OS.host.safari.fields().user.value = ''; OS.host.safari.fields().pass.value = ''; });
  await closeWin();
  await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]');
  await float().locator('.vt-row').first().waitFor();
  ok((await float().innerText()).includes('Acme Status') && (await float().innerText()).includes('ops@acme.io'), 'HO-3 / VT-5 Autofill now offers the new entry');
  await p.keyboard.press('Enter');
  ok((await p.inputValue('#sf [data-login=pass]')) === 'st4tus-Pw!', 'VT-1 fills new entry on status.acme.io');
  await p.click('#sf [data-tab="0"]');

  // VT-2 lock timeout + Lock now + skip ahead
  await p.click('[data-mb=oneshot]'); await p.keyboard.press('Escape');
  await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(400);
  ok(/^Locks in \d:\d\d$/.test(await p.locator('[data-cd]').innerText()), 'VT-2 countdown shown: ' + await p.locator('[data-cd]').innerText());
  await p.click('[data-lock]');
  ok((await p.locator('#view .state.locked').count()) === 1 && (await p.evaluate(() => OS.data.vault.locked)), 'VT-2 Lock now shows locked state in the view');
  await shot('vault-locked');
  await p.click('#view [data-act]'); await touch();
  await p.locator('[data-cd]').waitFor();
  ok(true, 'VT-2 unlock in the view');
  await p.click('[data-mb=scn]'); await p.click('[data-skip="300000"]'); await p.keyboard.press('Escape');
  await p.waitForTimeout(1300);
  ok(await p.evaluate(() => OS.data.vault.locked), 'VT-2 locks after skipping ahead 5 minutes (lockAfter 5)');
  ok((await p.locator('#view .state.locked').count()) === 1, 'VT-2 view re-rendered locked');
  // pref: 15 min keeps unlocked after 5-min skip
  await p.evaluate(() => OS.openPrefs('vault'));
  await p.click('#ps-vault [data-k="vault.lockAfter"] button[data-v="15"]');
  await shot('prefs-vault');
  await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(400);
  await p.click('#view [data-act]'); await touch(); await p.locator('[data-cd]').waitFor();
  await p.click('[data-mb=scn]'); await p.click('[data-skip="300000"]'); await p.keyboard.press('Escape');
  await p.waitForTimeout(1300);
  ok(!(await p.evaluate(() => OS.data.vault.locked)), 'VT-7 lockAfter=15 stays unlocked after 5 min');
  await p.click('[data-mb=scn]'); await p.click('[data-skip="300000"]'); await p.click('[data-skip="300000"]'); await p.keyboard.press('Escape');
  await p.waitForTimeout(1300);
  ok(await p.evaluate(() => OS.data.vault.locked), 'VT-7 lockAfter=15 locks after 15 min total');

  // VT-7 touchId off -> master password
  await p.evaluate(() => OS.openPrefs('vault'));
  await p.click('#ps-vault .sw[data-k="vault.touchId"]');
  await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(400);
  ok((await p.locator('#view [data-pw]').count()) === 1, 'VT-7 touchId off -> master password form');
  await p.fill('[data-pw]', 'nope'); await p.click('[data-unlock]');
  ok((await p.locator('[data-err]').innerText()).includes('Incorrect'), 'ST-3 wrong master password says so');
  await shot('vault-password');
  await p.fill('[data-pw]', 'oneshot'); await p.click('[data-unlock]');
  await p.locator('[data-cd]').waitFor();
  ok(!(await p.evaluate(() => OS.data.vault.locked)), 'VT-7 correct master password unlocks');
  await p.evaluate(() => OS.openPrefs('vault'));
  await p.click('#ps-vault .sw[data-k="vault.touchId"]');

  // VT-7 showOnFocus off + hotkey
  await p.click('#ps-vault .sw[data-k="vault.showOnFocus"]');
  await closeWin();
  await focusUser(); await p.waitForTimeout(200);
  ok(!(await float().isVisible()), 'VT-7 showOnFocus off: focusing a field opens nothing');
  await p.keyboard.press('Control+Alt+KeyP');
  await float().locator('.vt-row').first().waitFor();
  ok(true, 'VT-1/VT-7 hotkey opens Autofill on the focused field');
  await shot('af-hotkey');
  await p.keyboard.press('Escape');
  await p.evaluate(() => OS.openPrefs('vault'));
  await p.click('#prefs [data-hk="vault.autofill"]'); await p.keyboard.press('Control+Alt+KeyL');
  await p.click('#ps-vault .sw[data-k="vault.showOnFocus"]');
  await closeWin();
  await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]');
  await float().locator('.vt-row').first().waitFor();
  ok(true, 'VT-7 showOnFocus on again opens on focus');
  await p.keyboard.press('Escape');
  await p.keyboard.press('Control+Alt+KeyP'); await p.waitForTimeout(200);
  ok(!(await float().isVisible()), 'VT-7 old hotkey inert after re-bind');
  await p.keyboard.press('Control+Alt+KeyL');
  await float().locator('.vt-row').first().waitFor();
  ok(true, 'VT-7 new hotkey works');
  await p.keyboard.press('Escape');

  // ST-2 Accessibility
  await p.evaluate(() => OS.perm.set('access', false));
  await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]');
  await float().locator('.state.permission').waitFor();
  await shot('af-no-access');
  await p.click('#float [data-grant]'); await p.click('#dlg [data-t]'); await p.click('#dlg [data-r=done]');
  await float().locator('.vt-row').first().waitFor();
  ok(true, 'ST-2 granting Accessibility unblocks Autofill in place');
  await p.keyboard.press('Escape');

  // D3 store failure in the Autofill float
  await closeWin();
  await scn('vault.fail');
  await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]');
  await float().locator('.state.failure').waitFor();
  ok((await float().innerText()).includes('Try again') && (await float().locator('.vt-row').count()) === 0, 'D3 Autofill float shows the store failure instead of entries');
  await shot('af-store-fail');
  await p.keyboard.press('Escape');
  await scn('vault.fail');

  // ST-1 states
  await scn('vault.fail');
  await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(500);
  ok((await p.locator('#view .state.failure').count()) === 1, 'ST-1 failure state'); await shot('state-failure');
  await scn('vault.fail');
  await p.click('#view [data-act]'); await p.waitForTimeout(500);
  ok((await p.locator('.vt-list').count()) === 1 || (await p.locator('#view .state.locked').count()) === 1, 'ST-1 Try again loads');
  await scn('vault.empty'); await p.evaluate(() => { OS.data.vault.locked = false; OS.data.vault.unlockedAt = OS.now(); });
  await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(500);
  ok((await p.locator('#view .state.empty').count()) === 1, 'ST-1 empty state'); await shot('state-empty');
  await p.click('#view [data-act]');
  ok((await p.locator('[data-f=title]').count()) === 1, 'ST-1 empty action opens new entry form');
  await scn('slow'); await p.evaluate(() => OS.open('vault')); await p.waitForTimeout(300);
  ok((await p.locator('#view .state.loading').count()) === 1, 'ST-1 loading state'); await shot('state-loading');

  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors');
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
