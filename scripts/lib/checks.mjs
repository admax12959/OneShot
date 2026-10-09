// Browser-free checks for the committed prototype artifacts. Nothing here executes prototype or tool code:
// JS is only parsed (node --check, vm.Script) and the one build step runs in a temporary copy.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';

export const DEFAULTS = {
  jsDirs: ['prototype', 'prototype-v2', 'prototype-v3', 'scripts'],
  pages: ['prototype/prototype.html', 'prototype-v2/index.html', 'prototype-v3/index.html'],
  buildDir: 'prototype',
};

const SKIP_DIRS = new Set(['.git', 'node_modules']);

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...walk(join(dir, e.name)));
    } else out.push(join(dir, e.name));
  }
  return out.sort();
}

const isJs = (f) => /\.(js|mjs|cjs)$/.test(f);

function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(m[1])?.[1]?.toLowerCase();
    const classic = !type || type === 'text/javascript' || type === 'application/javascript';
    if (classic && !/\bsrc\s*=/i.test(m[1]) && m[2].trim()) out.push(m[2]);
  }
  return out;
}

/** Every .js/.mjs/.cjs under jsDirs parses (node --check), and every classic inline <script> in the pages compiles. */
export function checkJsSyntax(root, { jsDirs = DEFAULTS.jsDirs, pages = DEFAULTS.pages } = {}) {
  const problems = [];
  let checked = 0;
  for (const d of jsDirs) {
    if (!existsSync(join(root, d))) { problems.push(`${d}: directory missing`); continue; }
    for (const f of walk(join(root, d)).filter(isJs)) {
      checked++;
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      if (r.status !== 0) problems.push(`${relative(root, f)}: syntax error\n${r.stderr.trim()}`);
    }
  }
  for (const p of pages) {
    if (!existsSync(join(root, p))) continue; // reported by checkAssets
    inlineScripts(readFileSync(join(root, p), 'utf8')).forEach((code, i) => {
      checked++;
      try { new vm.Script(code, { filename: `${p}#inline${i + 1}` }); } catch (e) {
        problems.push(`${p}: inline script ${i + 1} does not compile: ${e.message}`);
      }
    });
  }
  return { checked, problems };
}

const external = (u) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u) && !/^data:/i.test(u);

/**
 * Each page: every <script src>, <link href> and <img src> exists and none is remote; every features/* file beside it
 * is loaded; CSS under the page's directory only uses url(data:...) or url(#fragment) and has no @import.
 */
export function checkAssets(root, { pages = DEFAULTS.pages } = {}) {
  const problems = [];
  let checked = 0;
  for (const p of pages) {
    const file = join(root, p);
    if (!existsSync(file)) { problems.push(`${p}: page missing`); continue; }
    const dir = dirname(file);
    // script bodies can contain markup-looking strings; only tags matter here
    const html = readFileSync(file, 'utf8').replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2');
    const loaded = new Set();
    for (const m of html.matchAll(/<(script|link|img)\b([^>]*)>/gi)) {
      const attr = m[1].toLowerCase() === 'link' ? 'href' : 'src';
      const ref = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(m[2]);
      const url = ref && (ref[1] ?? ref[2] ?? ref[3]);
      if (!url || url.startsWith('data:') || url.startsWith('#')) continue;
      checked++;
      if (external(url)) { problems.push(`${p}: <${m[1]}> loads a remote or non-file URL: ${url}`); continue; }
      const target = join(dir, url.split(/[?#]/)[0]);
      loaded.add(target);
      if (!existsSync(target)) problems.push(`${p}: <${m[1]}> ${attr}="${url}" does not exist`);
    }
    const features = join(dir, 'features');
    if (existsSync(features)) {
      for (const f of walk(features).filter((x) => /\.(js|css)$/.test(x))) {
        checked++;
        if (!loaded.has(f)) problems.push(`${relative(root, f)}: not loaded by ${p}`);
      }
    }
    for (const css of walk(dir).filter((x) => /\.css$/i.test(x))) {
      const src = readFileSync(css, 'utf8');
      for (const m of src.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gis)) {
        checked++;
        if (!/^(data:|#)/i.test(m[2].trim())) problems.push(`${relative(root, css)}: url() must be data: or #fragment, found ${m[2].trim().slice(0, 60)}`);
      }
      if (/@import\b/i.test(src)) problems.push(`${relative(root, css)}: @import is not allowed`);
    }
  }
  return { checked, problems };
}

/**
 * Rebuild <buildDir>/prototype.html from <buildDir>/src in a temporary copy (build.py writes next to src, so it is never
 * run in place) and require byte equality with the committed file. build.py only prints its forbidden-word list; here a
 * non-empty list is a failure, as is any build error or CJK text.
 */
export function checkBuild(root, { buildDir = DEFAULTS.buildDir } = {}) {
  const committed = join(root, buildDir, 'prototype.html');
  const src = join(root, buildDir, 'src');
  if (!existsSync(committed) || !existsSync(join(src, 'build.py'))) {
    return { checked: 0, problems: [`${buildDir}: prototype.html or src/build.py missing`] };
  }
  const tmp = mkdtempSync(join(tmpdir(), 'oneshot-build-'));
  try {
    cpSync(src, join(tmp, buildDir, 'src'), { recursive: true });
    const r = spawnSync('python3', ['-I', join(tmp, buildDir, 'src', 'build.py')], { cwd: tmp, encoding: 'utf8' });
    if (r.error) return { checked: 1, problems: [`${buildDir}: cannot run python3: ${r.error.message}`] };
    if (r.status !== 0) return { checked: 1, problems: [`${buildDir}: build.py failed (exit ${r.status})\n${(r.stderr || r.stdout).trim()}`] };
    const problems = [];
    const report = /forbidden: (\[.*?\]) total_cjk_runs: (\d+)/.exec(r.stdout);
    if (!report) problems.push(`${buildDir}: build.py report line not recognised: ${r.stdout.trim()}`);
    else if (report[1] !== '[]') problems.push(`${buildDir}: built HTML contains forbidden words ${report[1]}`);
    const built = readFileSync(join(tmp, buildDir, 'prototype.html'));
    if (!built.equals(readFileSync(committed))) {
      problems.push(`${buildDir}/prototype.html differs from a fresh build of ${buildDir}/src (${built.length} bytes rebuilt)`);
    }
    return { checked: 1, problems };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export const CHECKS = [
  ['js-syntax', checkJsSyntax],
  ['assets', checkAssets],
  ['build', checkBuild],
];
