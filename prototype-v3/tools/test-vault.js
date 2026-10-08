// node tools/test-vault.js — walks VT-1..VT-7, HO-3, ST-1/2/3 for Vault, plus the v3 items: G2 device-owner unlock
// (no master password, locked at launch, nomatch / unavailable / lockout), secrets never rendered, G3 concealed copies
// (and the unstamped leak on the desk), release-blocker notes, G1 store, G10 menus.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
let n = 0;
const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok   ' + m); };
const SECRETS = ['hX7!pq2-Lm9v', 'Qr4#tz81-wKe', 'fG9$mm20-aPo', 'nT5&vb77-xCd', 'bL2^sa63-yUq', 'lN8*kr45-zWt'];
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html'));
  await p.waitForTimeout(500);
  const shot = (name) => p.screenshot({ path: `/tmp/v3-vault-${String(++n).padStart(2, '0')}-${name}.png` });
  const key = (k) => p.keyboard.press(k);
  const scn = async (k) => { await p.click('[data-mb=scn]'); await p.click(`[data-s="${k}"]`); await key('Escape'); };
  const float = () => p.locator('#float');
  const clips = () => p.evaluate(() => OS.data.clipboard.clips.length);
  const focusUser = async () => { await p.evaluate(() => { OS.front('#sf'); OS.app.activate('Safari'); }); await p.click('#sf [data-login=pass]'); await p.click('#sf [data-login=user]'); };
  const touch = async () => { await p.locator('#dlg [data-touch]').waitFor(); await p.click('#dlg [data-touch]'); };
  const password = async () => { await p.locator('#dlg [data-pw]').waitFor(); await p.fill('#dlg [data-pw]', 'login-password'); await p.click('#dlg [data-ok]'); };
  const toastText = () => p.locator('#toasts').innerText();
  const clearToasts = () => p.evaluate(() => { document.querySelector('#toasts').innerHTML = ''; });
  const openVault = async (params) => { await p.evaluate((x) => OS.open('vault', x || {}), params); await p.waitForSelector('#view .vt-list, #view .state'); };
  const unlockView = async () => { await p.click('#view .state.locked [data-act]'); await touch(); await p.waitForSelector('#view .vt-list'); };
  const keyWin = () => p.click('#main > .vh', { position: { x: 560, y: 26 } });
  const menu = () => p.evaluate(() => Object.fromEntries(OS.menus().filter((m) => m.id === 'edit' || m.id === 'file').flatMap((m) => m.items).filter((i) => i !== '-').map((i) => [i.label, !i.enabled || i.enabled()])));
  const leaks = () => p.evaluate((S) => { const html = document.querySelector('#screen').innerHTML.replace(/<div class="hwin" id="sf"[\s\S]*?<div class="hwin" id="pw"/, ''); return S.filter((s) => html.includes(s) || html.includes(s.replace(/&/g, '&amp;'))); }, SECRETS);
  const clip0 = await clips();

  /* G2: locked at launch; no master password anywhere */
  ok(await p.evaluate(() => OS.data.vault.locked === true), 'G2 Vault is locked at launch');
  ok(await p.evaluate(() => !OS.get('vault').prefs.some((x) => x.key === 'touchId')), 'G2 no master-password preference');

  /* VT-1/VT-2/ST-3 Autofill: locked → compact unlock in the float */
  await focusUser();
  await float().locator('.state.locked').waitFor();
  ok((await float().innerText()).includes('Vault is locked') && (await float().locator('[data-act]').innerText()) === 'Unlock', 'ST-3 locked state in Autofill with Unlock');
  ok((await p.evaluate(() => OS.app.active())) === 'Safari', 'Autofill float is non-activating (Safari stays active)');
  await shot('af-locked');
  await key('Escape');
  ok(!(await float().isVisible()) && (await p.inputValue('#sf [data-login=user]')) === '', 'VT-1 Esc closes, nothing filled');

  /* G2 failure: biometry doesn't match → Try Again / Use Password… → login password */
  await scn('auth.nomatch');
  await focusUser();
  await p.click('#float [data-act]');
  ok((await float().innerText()).includes('Waiting for Touch ID'), 'G2 biometry prompt state while the system dialog is up');
  await touch();
  await float().locator('.state.failure').waitFor();
  const ft = await float().innerText();
  ok(ft.includes('Touch ID didn’t match') && ft.includes('Try Again') && ft.includes('Use Password…'), 'ST-3/G2 failure: didn’t match → Try Again / Use Password…');
  await shot('af-nomatch');
  await p.click('#float [data-act2]');
  ok(await p.locator('#dlg [data-pw]').isVisible() && !(await p.locator('#dlg [data-touch]').count()), 'G2 Use Password… goes straight to the login-password prompt');
  await shot('login-password');
  await password();
  await float().locator('.vt-row').first().waitFor();
  ok((await p.evaluate(() => OS.data.vault.locked)) === false, 'VT-2 unlocked with the Mac login password');
  const rows = await float().locator('.vt-row').allInnerTexts();
  ok(rows.length === 2 && (await float().innerText()).includes('GitHub (personal)') && (await float().innerText()).includes('GitHub (work)'), 'VT-1 two github.com logins listed');
  ok(!(await leaks()).length, 'Secrets: no password in the DOM (float open)');
  await shot('af-entries');
  await key('ArrowDown');
  ok((await float().locator('.vt-row').nth(1).getAttribute('class')).includes('sel'), 'VT-1 arrow moves the selection');
  await key('Enter');
  await p.waitForTimeout(100);
  ok((await p.inputValue('#sf [data-login=user]')) === 'maya@acme.io' && (await p.inputValue('#sf [data-login=pass]')) === 'Qr4#tz81-wKe', 'VT-1 Enter fills the second login');
  ok(!(await float().isVisible()), 'VT-1 float closed after fill (no reopen)');
  ok((await toastText()).includes('Filled · nothing copied'), 'VT-6 fill toast: Filled · nothing copied');
  ok((await clips()) === clip0 && (await p.evaluate(() => OS.pasteboard.changeCount)) === 0, 'VT-6 fill wrote nothing to the pasteboard and added no clip');
  await shot('af-filled');

  /* VT-4 / HO-3 Open in Vault selects the same entry */
  await focusUser();
  await float().locator('.vt-row').first().waitFor();
  await p.click('#float [data-v="v-gh-personal"]');
  await p.waitForSelector('#view .vt-list .row.sel');
  ok((await p.$eval('#view .vt-list .row.sel', (e) => e.dataset.id)) === 'v-gh-personal', 'VT-4 Open in Vault selects the same login');
  ok((await p.textContent('#vhSub')).includes('6 logins'), 'G1 subtitle counts logins');

  /* Secrets never rendered: no reveal, fixed-length mask, write-only change */
  ok(!(await p.$('#view [data-eye]')) && !(await p.$('#view .vt-detail input[type=password]')), 'Secrets: no reveal button and no password input for a saved login');
  const mask1 = await p.textContent('#view .vt-mask');
  await p.click('#view .vt-list [data-id="v-billing"]');
  const mask2 = await p.textContent('#view .vt-mask');
  ok(mask1 === mask2 && mask1.length === 12, 'Secrets: the mask has the same fixed length for every login');
  ok(!(await leaks()).length, 'Secrets: no password anywhere in the DOM (view open)');
  await keyWin();
  await shot('view-detail');

  /* G10 menus follow the selection */
  let m = await menu();
  ok(m['New Login'] && m['Copy Username'] && m['Delete Login…'] && m['Find Login…'] && m['Select All'] === false, 'G10 New Login / Copy Username / Delete / Find enabled; Select All not offered');
  await p.click('#mbL [data-menu=edit]'); await shot('edit-menu'); await key('Escape');

  /* G3: copies are concealed; ⌘C copies the username, never the password */
  await clearToasts();
  await p.click('#view .vt-list [data-id="v-billing"]');
  await key('Meta+KeyC');
  ok((await p.evaluate(() => OS.pasteboard.current.text)) === 'finance@acme.io' && (await toastText()).includes('Copied · concealed'), 'G10/G3 ⌘C = Copy Username, concealed');
  await clearToasts();
  await p.click('#view [data-cp=password]');
  const pb = await p.evaluate(() => OS.pasteboard.current);
  ok(pb.concealed && pb.types.includes('org.nspasteboard.ConcealedType') && pb.types.includes('org.nspasteboard.TransientType'), 'G3 password copy is stamped concealed + transient');
  const tt = await toastText();
  ok(tt.includes('Copied · concealed') && tt.includes('Not kept in Clipboard history. Clipboard apps that respect markers skip it.') && await p.isVisible('#toasts .toast.concealed'), 'G3 concealed toast (kind concealed)');
  ok((await clips()) === clip0, 'VT-6 copies added no clip');
  await shot('copied-concealed');

  /* G3: the writer bug with another clipboard app running → failure toast + the leak on the desk */
  await clearToasts();
  await scn('pb.watcher'); await scn('pb.unstamped');
  await keyWin();
  await p.click('#view [data-cp=password]');
  ok(await p.isVisible('#toasts .toast.failure') && (await toastText()).includes('Copied without the concealed marker'), 'G3 unstamped copy → failure toast (writer verifies its own write)');
  ok(await p.isVisible('#pw .pw-row.leak'), 'G3 the other clipboard app kept the password (leak visible on the desk)');
  ok((await clips()) === clip0, 'VT-6 even an unstamped Vault copy never enters OneShot history');
  await shot('unstamped-leak');
  await scn('pb.unstamped');
  await keyWin();
  await p.click('#view [data-cp=password]');
  ok((await p.textContent('#pw .pw-row')).includes('Skipped a concealed copy from Vault'), 'G3 with markers the other app skips the copy');
  await shot('watcher-skips');
  await scn('pb.watcher');
  await clearToasts();

  /* Write-only password change */
  await keyWin();
  await p.click('#view [data-change]');
  ok((await p.inputValue('#view [data-f=password]')) === '', 'Secrets: Change Password… starts with an empty write-only field');
  await shot('change-password');
  await p.fill('#view [data-f=password]', 'new-Secret-42');
  await p.click('#view [data-save]');
  ok((await p.evaluate(() => OS.data.vault.entries.find((e) => e.id === 'v-billing').password)) === 'new-Secret-42' && (await toastText()).includes('Password changed'), 'Secrets: password changed without ever being shown');
  ok(!(await p.$('#view .vt-detail input[type=password]')) && (await p.textContent('#view .vt-mask')) === mask1, 'Secrets: mask unchanged after the change');

  /* VT-5 search, no match, new, edit, delete */
  await p.fill('#view [data-q]', 'figma');
  ok((await p.$$('#view .vt-list .row')).length === 1, 'VT-5 search');
  await p.fill('#view [data-q]', 'zzz');
  await p.waitForSelector('#view .vt-list .state.nomatch');
  ok((await p.textContent('#view .state.nomatch [data-act]')) === 'Clear Search', 'VT-5 no-match state with Clear Search');
  await shot('nomatch');
  await p.click('#view .state.nomatch [data-act]');
  ok((await p.$$('#view .vt-list .row')).length === 6, 'VT-5 Clear Search restores the list');
  await keyWin();
  await key('Meta+KeyN');
  ok(await p.isVisible('#view [data-f=title]') && (await p.textContent('#view .vt-detail h2')) === 'New Login', 'G10 ⌘N = New Login');
  m = await menu();
  ok(m['Copy Username'] === false && m['Delete Login…'] === false, 'G10 Copy/Delete disabled while a new login is a draft');
  await p.fill('#view [data-f=title]', 'Vercel');
  await p.fill('#view [data-f=url]', 'https://vercel.com/login');
  await p.fill('#view [data-f=username]', 'maya');
  await p.fill('#view [data-f=password]', 'vc-123');
  await p.click('#view [data-save]');
  const vid = await p.evaluate(() => OS.data.vault.entries.find((e) => e.title === 'Vercel').id);
  ok(await p.evaluate(() => OS.data.vault.entries.find((e) => e.title === 'Vercel').url === 'vercel.com'), 'VT-5 new login saved with the host');
  await p.fill('#view [data-f=title]', 'Vercel (team)');
  await p.click('#view [data-save]');
  ok(await p.evaluate((id) => OS.data.vault.entries.find((e) => e.id === id).title === 'Vercel (team)', vid), 'VT-5 edit saved');
  await keyWin();
  await p.click(`#view .vt-list [data-id="${vid}"]`);
  await key('Meta+Backspace');
  await p.locator('#dlg [data-r="1"]').waitFor();
  await shot('delete-confirm');
  await p.click('#dlg [data-r="1"]');
  ok(await p.evaluate((id) => !OS.data.vault.entries.some((e) => e.id === id), vid), 'G10/VT-5 ⌘⌫ deletes after confirmation');

  /* VT-5 edits show in Autofill */
  await p.click('#view .vt-list [data-id="v-gh-work"]');
  await p.fill('#view [data-f=title]', 'GitHub (Acme)');
  await p.click('#view [data-save]');
  await focusUser();
  await float().locator('.vt-row').first().waitFor();
  ok((await float().innerText()).includes('GitHub (Acme)'), 'VT-5 edit shows in Autofill');
  await key('Escape');

  /* VT-3 / HO-3: no login for this site → add with the URL filled → Fill Now */
  await p.evaluate(() => { OS.front('#sf'); OS.app.activate('Safari'); }); await p.click('#sf [data-tab="1"]');
  await focusUser();
  await float().locator('.state.empty').waitFor();
  ok((await float().innerText()).includes('No login for status.acme.io'), 'VT-3 no login for this site');
  await shot('af-nologin');
  await p.click('#float [data-act]');
  await p.waitForSelector('#view [data-f=url]');
  ok((await p.inputValue('#view [data-f=url]')) === 'status.acme.io' && (await p.inputValue('#view [data-f=password]')) === '', 'HO-3 new login with the URL filled, password empty');
  await shot('ho3-create');
  await p.fill('#view [data-f=username]', 'oncall@acme.io');
  await p.fill('#view [data-f=password]', 'st-Acme-77');
  await clearToasts();
  await p.click('#view [data-save]');
  await p.click('#toasts .toast button:has-text("Fill Now")');
  await p.waitForTimeout(100);
  ok((await p.inputValue('#sf [data-login=user]')) === 'oncall@acme.io' && (await toastText()).includes('Filled · nothing copied'), 'VT-3 Fill Now fills the new login');
  await p.evaluate(() => { OS.front('#sf'); OS.app.activate('Safari'); }); await p.click('#sf [data-tab="0"]');

  /* VT-2 lock: Lock button, timeout with countdown */
  await openVault();
  ok(/Locks in \d:\d\d/.test(await p.textContent('#view [data-cd]')), 'VT-2 countdown shows while unlocked');
  await p.click('#view [data-lock]');
  await p.waitForSelector('#view .state.locked');
  ok((await p.textContent('#vhSub')) === 'Locked', 'VT-2 Lock locks now');
  m = await menu();
  ok(!m['New Login'] && !m['Copy Username'] && !m['Delete Login…'] && !m['Find Login…'], 'G10 every Vault menu item is disabled while locked');
  ok(await p.$eval('#vhTools [data-new]', (e) => e.disabled), 'New Login toolbar button disabled while locked');
  await shot('view-locked');
  await unlockView();
  ok((await p.evaluate(() => OS.data.vault.locked)) === false, 'VT-2 unlock with Touch ID from the view');
  await p.evaluate(() => OS.skip(5 * 60000 + 1000));
  await p.waitForSelector('#view .state.locked');
  ok(await p.evaluate(() => OS.data.vault.locked), 'VT-2 locks after vault.lockAfter (5 min)');

  /* G2 auth.unavailable and auth.lockout go to the login password */
  await scn('auth.unavailable');
  await p.click('#view .state.locked [data-act]');
  ok((await p.textContent('#dlg')).includes('Touch ID isn’t available'), 'G2 Touch ID unavailable → login password prompt');
  await shot('auth-unavailable');
  await password(); await p.waitForSelector('#view .vt-list');
  ok((await p.textContent('#view .vt-foot')).includes('unlocked with your login password'), 'G2 footer says how Vault was unlocked');
  await scn('auth.unavailable');
  await p.click('#view [data-lock]');
  await scn('auth.lockout');
  await p.click('#view .state.locked [data-act]');
  ok((await p.textContent('#dlg')).includes('locked after too many attempts'), 'G2 lockout → login password prompt');
  await password(); await p.waitForSelector('#view .vt-list');
  ok(!(await p.evaluate(() => OS.scn('auth.lockout'))), 'G2 password clears the lockout');
  await key('Escape');

  /* Release blocker notes + honest Preferences copy */
  await scn('notes');
  await keyWin();
  ok((await p.textContent('#view .vt-foot .cn')).startsWith('Release blocker: secrets live in Keychain'), 'Release-blocker contract note in the view');
  await shot('view-notes');
  await p.click('#view [data-lock]');
  ok((await p.textContent('#view .state.locked .cn')).includes('SecAccessControl .biometryCurrentSet / .userPresence'), 'Release-blocker note on the locked state');
  await shot('locked-notes');
  await scn('notes');

  /* VT-7 settings change runtime */
  await p.evaluate(() => OS.openPrefs('vault'));
  const pane = await p.textContent('#prefs');
  ok(pane.includes('Passwords are stored in your keychain') && pane.includes('locks after 5 min and at launch') && pane.includes('logins'), 'G1 Vault pane: about, store rule and count');
  await p.click('#prefs .seg[data-k="vault.lockAfter"] button:has-text("1 min")');
  await p.click('#prefs [data-k="vault.confirmFill"]');
  await shot('prefs');
  await p.evaluate(() => OS.openPrefs('privacy'));
  ok((await p.textContent('#prefs')).includes('Vault') && (await p.textContent('#prefs')).includes('Always excluded'), 'SH-4 Vault always excluded in the clipboard policy');
  await p.evaluate(() => OS.closeWindow('#prefwin'));
  await focusUser();
  await p.click('#float [data-act]'); await touch();
  await float().locator('.vt-row').first().waitFor();
  await p.fill('#sf [data-login=user]', ''); await p.fill('#sf [data-login=pass]', '');
  await focusUser(); await float().locator('.vt-row').first().waitFor();
  await key('Enter');
  await p.locator('#dlg [data-touch]').waitFor();
  ok((await p.textContent('#dlg')).includes('fill your login for github.com') && (await p.inputValue('#sf [data-login=user]')) === '', 'VT-7 confirm-each-fill asks Touch ID before typing');
  await p.click('#dlg [data-touch]');
  await p.waitForTimeout(100);
  ok((await p.inputValue('#sf [data-login=user]')) === 'maya.chen', 'VT-7 fills after Touch ID');
  await p.evaluate(() => OS.skip(61000));
  ok(await p.evaluate(() => OS.data.vault.locked), 'VT-7 lock after 1 min takes effect');
  await p.evaluate(() => { OS.setPref('vault.showOnFocus', false); OS.setPref('vault.confirmFill', false); });
  await focusUser();
  ok(!(await float().isVisible()), 'VT-7 show-on-focus off: focusing does not open Autofill');
  await key('Control+Alt+KeyP');
  ok(await float().isVisible(), 'VT-7 hotkey still opens Autofill');
  await key('Escape');
  await p.evaluate(() => OS.setPref('vault.showOnFocus', true));

  /* ST-2 Accessibility missing → grant in the float */
  await p.evaluate(() => OS.perm.set('access', false));
  await focusUser();
  ok(await float().locator('.state.permission').isVisible(), 'ST-2 Accessibility grant card in Autofill');
  await shot('af-permission');
  await key('Escape');
  await p.evaluate(() => OS.perm.set('access', true));

  /* Reload: data and prefs persist; Vault locks at launch */
  await openVault(); await unlockView();
  await p.evaluate(() => OS.commit('vault', (d) => d.entries.push({ id: 'v-persist', title: 'Persisted', url: 'persist.io', username: 'p', password: 'pp', note: '', at: Date.now() })));
  await p.evaluate(() => OS.setPref('vault.lockAfter', 15));
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(500);
  ok(await p.evaluate(() => OS.data.vault.entries.some((e) => e.id === 'v-persist') && OS.data.vault.entries.some((e) => e.title === 'GitHub (Acme)')), 'Reload: new and edited logins persisted');
  ok((await p.evaluate(() => OS.pref('vault.lockAfter'))) === 15, 'Reload: lock-after preference persisted');
  ok(await p.evaluate(() => OS.data.vault.locked), 'Reload: Vault is locked again at launch');

  /* ST-1 loading (skeleton), failure, empty */
  await p.evaluate(() => OS.setScn('slow', true));
  await p.evaluate(() => OS.open('vault'));
  ok(await p.$('#view .skel'), 'ST-1 loading skeleton');
  await shot('loading');
  await p.waitForSelector('#view .state.locked', { timeout: 4000 });
  await p.evaluate(() => OS.setScn('slow', false));
  await scn('vault.fail');
  await openVault(); await p.waitForSelector('#view .state.failure');
  ok(await p.$('#view .state.failure [data-act]'), 'ST-1 failure state with Try Again');
  await shot('failure');
  await scn('vault.fail');
  await scn('vault.empty');
  await openVault(); await p.click('#view .state.locked [data-act]'); await touch();
  await p.waitForSelector('#view .state.empty');
  ok((await p.textContent('#view .state.empty')).includes('No logins yet'), 'ST-1 empty state');
  await shot('empty');
  await p.click('#view .state.empty [data-act]');
  ok(await p.isVisible('#view [data-f=title]'), 'Empty state New Login opens the form');
  await scn('vault.empty');
  ok(await p.evaluate(() => OS.data.vault.entries.length >= 7), 'Start empty never overwrote stored logins');

  ok(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
  console.log('vault: all passed');
})().catch((e) => { console.error(e.message); process.exit(1); });
