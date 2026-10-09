#!/usr/bin/env node
// Usage: node scripts/check.mjs [--root <dir>]   — the single entry point for local runs and CI. Exit 1 on any problem.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from './lib/checks.mjs';

const i = process.argv.indexOf('--root');
const root = i > -1 ? resolve(process.argv[i + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
for (const [name, run] of CHECKS) {
  const { checked, problems } = run(root);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${name}: ${checked} checked`);
  for (const p of problems) console.log(`     - ${p.replaceAll('\n', '\n       ')}`);
  failed += problems.length;
}
console.log(failed ? `${failed} problem(s)` : 'all checks passed');
process.exit(failed ? 1 : 0);
