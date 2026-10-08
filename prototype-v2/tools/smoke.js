// Usage: node tools/smoke.js [out.png] [hash]   — loads index.html, reports console errors, screenshots.
const path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../index.html') + (process.argv[3] ? '#' + process.argv[3] : ''));
  await p.waitForTimeout(700);
  await p.screenshot({ path: process.argv[2] || '/tmp/smoke.png' });
  console.log(errs.length ? errs.join('\n') : 'no errors');
  await b.close();
})();
