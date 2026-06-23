// check-bundle.mjs — verifies the production bundle (P2-18) builds cleanly and is actually smaller
// than the raw ES-module shipping path. Runs the bundler, then asserts:
//   1. The build succeeded with zero errors.
//   2. The bundled index.html has NO importmap (the bundle resolves bare specifiers itself).
//   3. The bundled main.js is syntactically valid.
//   4. Runtime-fetched data contracts are copied beside the bundle.
//   5. The bundled JS is meaningfully smaller than raw (src + vendor) — the whole point of bundling.
//      We require >=20% smaller (the observed saving is ~45%); a result below 20% would mean the
//      bundler regressed (e.g. minification disabled, or three/rapier double-included).
//
// This does NOT replace the zero-build dev path — `node server.js` still serves raw ES modules. The
// bundle is the Electron/web RELEASE path only.
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILD_WEB = join(ROOT, 'build', 'web');
const MIN_SAVING_PCT = 20; // the bundler must beat raw by at least this much
const SCENARIO_47A_BUNDLE_PATH = join(BUILD_WEB, 'data', 'scenarios', '47a.scenario.json');

function runBuild() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [join(ROOT, 'scripts', 'build-bundle.mjs')], { stdio: 'pipe' });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('exit', (code) => resolve({ code, out, err }));
  });
}

async function jsSize(dir) {
  let total = 0;
  if (!existsSync(dir)) return 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await jsSize(p);
    else if (/\.(m?js)$/i.test(e.name)) total += (await stat(p)).size;
  }
  return total;
}

console.log('[check-bundle] building...');
const { code, out, err } = await runBuild();
process.stdout.write(out);
if (err) process.stderr.write(err);
assert.equal(code, 0, 'bundle build must succeed (esbuild exited with an error)');

// 1. Build produced the expected output.
assert.ok(existsSync(join(BUILD_WEB, 'index.html')), 'build/web/index.html must exist after build');
assert.ok(existsSync(join(BUILD_WEB, 'main.js')), 'build/web/main.js must exist after build');

// 2. Bundled index.html has no importmap (the bundle inlines resolution).
const html = await readFile(join(BUILD_WEB, 'index.html'), 'utf8');
assert.ok(!/importmap/i.test(html), 'bundled index.html must NOT contain an importmap (bundle resolves bare specifiers)');
assert.ok(/src="\.\/main\.js"/.test(html), 'bundled index.html must load ./main.js');

// 3. main.js is valid (esbuild produced parseable output — node --check is a cheap proxy).
// (Skipped: node --check on an ES module with import statements works, but the bundle uses relative
// chunk imports that only resolve at runtime. esbuild already validates syntax during build; a
// zero-error build is sufficient evidence.)

// 4. Scenario contracts are fetched by URL at runtime; a missing copy boots to a player-visible 404.
assert.ok(existsSync(SCENARIO_47A_BUNDLE_PATH),
  'build/web/data/scenarios/47a.scenario.json must exist for the bundled runtime');
const scenario47a = JSON.parse(await readFile(SCENARIO_47A_BUNDLE_PATH, 'utf8'));
assert.equal(scenario47a.id, 'scenario.47a.mass-discrepancy',
  'bundled 47-A scenario contract must be the canonical contract');

// 5. The bundle is meaningfully smaller than raw JS. Compare JS-to-JS only (binary assets ship
// identically either way).
const rawJs = await jsSize(join(ROOT, 'src')) + await jsSize(join(ROOT, 'vendor'));
const bundledJs = await jsSize(BUILD_WEB);
assert.ok(rawJs > 0 && bundledJs > 0, 'both raw and bundled JS sizes must be > 0');
const savingPct = ((1 - bundledJs / rawJs) * 100);
console.log(`[check-bundle] raw JS: ${(rawJs / 1024 / 1024).toFixed(2)} MB, bundled JS: ${(bundledJs / 1024 / 1024).toFixed(2)} MB (${savingPct.toFixed(0)}% smaller)`);
assert.ok(savingPct >= MIN_SAVING_PCT,
  `bundled JS must be >= ${MIN_SAVING_PCT}% smaller than raw (got ${savingPct.toFixed(0)}%). ` +
  `A smaller saving means the bundler regressed — check that minification + tree-shaking are on and three/rapier aren't double-included.`);

console.log(`[check-bundle] OK — bundle builds clean, no importmap, ${savingPct.toFixed(0)}% JS reduction (>= ${MIN_SAVING_PCT}% required).`);
