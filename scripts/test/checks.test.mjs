// Run: node --test scripts/test/   — every negative case mutates a temporary fixture, never the repo.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkAssets, checkBuild, checkJsSyntax } from '../lib/checks.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CHECK = join(REPO, 'scripts/check.mjs');
const tmps = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'oneshot-fixture-')); tmps.push(d); return d; };
after(() => tmps.forEach((d) => rmSync(d, { recursive: true, force: true })));

const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const messages = (r) => r.problems.join('\n');

/** A small valid page with one script, one stylesheet and one feature of each kind. */
function pageFixture() {
  const root = tmp();
  put(root, 'p/index.html', '<link rel="stylesheet" href="a.css">\n<script src="a.js"></script>\n<script src="features/f.js"></script>\n<link rel="stylesheet" href="features/f.css">\n<script>var x = 1;</script>');
  put(root, 'p/a.css', 'a{background:url("data:image/svg+xml,%3Csvg/%3E");fill:url(#g)}');
  put(root, 'p/a.js', 'var a = 1;');
  put(root, 'p/features/f.js', 'var f = 1;');
  put(root, 'p/features/f.css', 'b{}');
  return root;
}
const OPTS = { jsDirs: ['p'], pages: ['p/index.html'] };

/** A copy of the real v1 build inputs and output. */
function buildFixture() {
  const root = tmp();
  cpSync(join(REPO, 'prototype/src'), join(root, 'prototype/src'), { recursive: true });
  cpSync(join(REPO, 'prototype/prototype.html'), join(root, 'prototype/prototype.html'));
  return root;
}
const rebuildInPlace = (root) =>
  assert.equal(spawnSync('python3', ['-I', join(root, 'prototype/src/build.py')], { cwd: root }).status, 0);

describe('current tree', () => {
  test('passes through the CLI with exit 0', () => {
    const r = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /all checks passed/);
  });
});

describe('js-syntax', () => {
  test('valid fixture passes', () => assert.deepEqual(checkJsSyntax(pageFixture(), OPTS).problems, []));

  test('syntax error in a file is reported with its path', () => {
    const root = pageFixture();
    put(root, 'p/features/f.js', 'var = ;');
    assert.match(messages(checkJsSyntax(root, OPTS)), /p\/features\/f\.js: syntax error/);
  });

  test('syntax error in an inline script is reported', () => {
    const root = pageFixture();
    put(root, 'p/index.html', '<script>function (</script>');
    assert.match(messages(checkJsSyntax(root, OPTS)), /inline script 1 does not compile/);
  });

  test('files are parsed, never executed', () => {
    const root = pageFixture();
    const sentinel = join(root, 'ran');
    put(root, 'p/tool.js', `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'x'); require('/no/such/module'); process.exit(3);`);
    put(root, 'p/index.html', '<script>require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ', "x")</script>');
    assert.deepEqual(checkJsSyntax(root, OPTS).problems, []);
    assert.equal(existsSync(sentinel), false);
  });

  test('a missing configured directory is a failure, not a silent pass', () => {
    assert.match(messages(checkJsSyntax(tmp(), OPTS)), /p: directory missing/);
  });
});

describe('assets', () => {
  test('valid fixture passes', () => assert.deepEqual(checkAssets(pageFixture(), OPTS).problems, []));

  test('missing script is reported', () => {
    const root = pageFixture();
    appendFileSync(join(root, 'p/index.html'), '\n<script src="gone.js"></script>');
    assert.match(messages(checkAssets(root, OPTS)), /src="gone\.js" does not exist/);
  });

  test('missing stylesheet is reported', () => {
    const root = pageFixture();
    appendFileSync(join(root, 'p/index.html'), '\n<link rel="stylesheet" href="gone.css">');
    assert.match(messages(checkAssets(root, OPTS)), /href="gone\.css" does not exist/);
  });

  test('orphan feature file is reported', () => {
    const root = pageFixture();
    put(root, 'p/features/orphan.js', 'var o = 1;');
    assert.match(messages(checkAssets(root, OPTS)), /p\/features\/orphan\.js: not loaded by p\/index\.html/);
  });

  test('remote script is reported', () => {
    const root = pageFixture();
    appendFileSync(join(root, 'p/index.html'), '\n<script src="https://example.invalid/x.js"></script>');
    assert.match(messages(checkAssets(root, OPTS)), /remote or non-file URL: https:\/\/example\.invalid/);
  });

  test('unquoted attribute values are checked (missing script and stylesheet)', () => {
    const root = tmp();
    put(root, 'p/index.html', '<script src=missing.js></script><link href=missing.css>');
    const r = checkAssets(root, OPTS);
    assert.equal(r.checked, 2);
    assert.match(messages(r), /src="missing\.js" does not exist/);
    assert.match(messages(r), /href="missing\.css" does not exist/);
  });

  test('unquoted remote URL is reported', () => {
    const root = tmp();
    put(root, 'p/index.html', '<script src=https://example.invalid/x.js></script>');
    assert.match(messages(checkAssets(root, OPTS)), /remote or non-file URL: https:\/\/example\.invalid/);
  });

  test('existing unquoted refs pass and count as loaded', () => {
    const root = pageFixture();
    put(root, 'p/index.html', '<link rel=stylesheet href=a.css><SCRIPT SRC=a.js></SCRIPT><script src=features/f.js></script><link href=features/f.css>');
    assert.deepEqual(checkAssets(root, OPTS).problems, []);
  });

  test('css URL() and @IMPORT are matched case-insensitively', () => {
    const root = pageFixture();
    put(root, 'p/a.css', '@IMPORT "other.css"; a{background:URL(missing.png)} b{background:Url( "x.png" )}');
    const m = messages(checkAssets(root, OPTS));
    assert.match(m, /found missing\.png/);
    assert.match(m, /found x\.png/);
    assert.match(m, /@import is not allowed/);
  });

  test('css url() to a file and @import are reported', () => {
    const root = pageFixture();
    put(root, 'p/a.css', '@import "other.css"; a{background:url(img.png)}');
    const m = messages(checkAssets(root, OPTS));
    assert.match(m, /url\(\) must be data: or #fragment, found img\.png/);
    assert.match(m, /@import is not allowed/);
  });

  test('tag-like text inside script bodies is ignored', () => {
    const root = pageFixture();
    put(root, 'p/index.html', '<script src="a.js"></script><script src="features/f.js"></script><link href="features/f.css"><link href="a.css"><script>el.innerHTML = \'<img src="${u}">\';</script>');
    assert.deepEqual(checkAssets(root, OPTS).problems, []);
  });

  test('a missing configured page is a failure', () => {
    assert.match(messages(checkAssets(tmp(), OPTS)), /p\/index\.html: page missing/);
  });
});

describe('build', () => {
  test('unmodified copy of the real inputs reproduces the committed output', () => {
    const r = checkBuild(buildFixture());
    assert.deepEqual(r.problems, []);
    assert.equal(r.checked, 1);
  });

  test('one extra byte in the committed output is drift', () => {
    const root = buildFixture();
    appendFileSync(join(root, 'prototype/prototype.html'), '\n');
    assert.match(messages(checkBuild(root)), /prototype\.html differs from a fresh build/);
  });

  test('a changed source without a rebuilt output is drift', () => {
    const root = buildFixture();
    appendFileSync(join(root, 'prototype/src/a-css.css'), '\n.x{color:red}\n');
    assert.match(messages(checkBuild(root)), /differs from a fresh build/);
  });

  test('a forbidden word is the only problem when the output is otherwise current', () => {
    const root = buildFixture();
    appendFileSync(join(root, 'prototype/src/c-body.html'), '\n<p>lorem</p>\n');
    rebuildInPlace(root); // the fixture's committed output now matches its sources
    const p = checkBuild(root).problems;
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /forbidden words \['lorem'/);
  });

  test('CJK text in the build fails the build step', () => {
    const root = buildFixture();
    appendFileSync(join(root, 'prototype/src/c-body.html'), `\n<p>${String.fromCodePoint(0x4e2d)}</p>\n`);
    assert.match(messages(checkBuild(root)), /build\.py failed.*\n.*CJK/s);
  });

  test('missing inputs are a failure', () => {
    assert.match(messages(checkBuild(tmp())), /prototype\.html or src\/build\.py missing/);
  });

  test('the repo copy of prototype.html is never written to', () => {
    const before = readFileSync(join(REPO, 'prototype/prototype.html'));
    checkBuild(REPO);
    assert.ok(readFileSync(join(REPO, 'prototype/prototype.html')).equals(before));
  });
});

describe('CLI exit status', () => {
  test('exits 1 and names the problem for a broken fixture root', () => {
    const root = buildFixture();
    appendFileSync(join(root, 'prototype/prototype.html'), '\n');
    const r = spawnSync(process.execPath, [CHECK, '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL build/);
  });
});
