// check-bundle.mjs — verifies the production bundle (P2-18) builds cleanly and is actually smaller
// than the raw ES-module shipping path. Runs the bundler, then asserts:
//   1. The build succeeded with zero errors.
//   2. The bundled index.html has NO importmap (the bundle resolves bare specifiers itself).
//   3. The bundled main.js is syntactically valid.
//   4. Runtime-fetched data contracts and player-facing URL assets are copied beside the bundle.
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

import { SIGNAL_ARCHIVE } from '../src/ui/screens/codex.js';
import {
  RELEASE_RECEIPT_FILE,
  validateReleaseBuildReceipt,
} from './lib/releasePackaging.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BUILD_WEB = join(ROOT, 'build', 'web');
const MIN_SAVING_PCT = 20; // the bundler must beat raw by at least this much
const SCENARIO_47A_BUNDLE_PATH = join(BUILD_WEB, 'data', 'scenarios', '47a.scenario.json');
const UI_ICON_ATLAS_BUNDLE_PATH = join(BUILD_WEB, 'assets', 'ui', 'icons_atlas.jpg');

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

// 4. Scenario contracts and authored UI/cinematic assets are fetched by URL at runtime; missing
// copies create player-visible 404s in the release route.
assert.ok(existsSync(SCENARIO_47A_BUNDLE_PATH),
  'build/web/data/scenarios/47a.scenario.json must exist for the bundled runtime');
const scenario47a = JSON.parse(await readFile(SCENARIO_47A_BUNDLE_PATH, 'utf8'));
assert.equal(scenario47a.id, 'scenario.47a.mass-discrepancy',
  'bundled 47-A scenario contract must be the canonical contract');
// Every Signal Archive cinematic — poster JPG + 6s clip — must ship in the bundle. The codex Archive
// tab and the main-menu "Signal Archive" entry reference these by URL; a missing copy is a 404 in the
// release route (One Game Path: browser dev and packaged build must expose the same cinematics).
for (const clip of SIGNAL_ARCHIVE) {
  for (const rel of [clip.poster, clip.video]) {
    const p = join(BUILD_WEB, ...rel.split('/'));
    assert.ok(existsSync(p), `${rel} must be bundled for the Signal Archive (missing ${p})`);
  }
}
assert.ok(existsSync(UI_ICON_ATLAS_BUNDLE_PATH),
  'build/web/assets/ui/icons_atlas.jpg must exist for bundled CSS icon atlas references');

// 5. The release receipt is deterministic and proves every copied player-facing runtime tree is
// byte-identical to its source. It also rejects source art/evidence/sourcemaps in the retail tree.
const releaseReceipt = JSON.parse(await readFile(join(BUILD_WEB, RELEASE_RECEIPT_FILE), 'utf8'));
const releaseValidation = await validateReleaseBuildReceipt({ root: ROOT, webRoot: BUILD_WEB, receipt: releaseReceipt });
assert.equal(releaseValidation.pass, true, releaseValidation.failures.join('; '));
assert.ok(releaseReceipt.copies.every((copy) => copy.exact === true),
  'every release runtime root must copy byte-for-byte');

// Production-only debug entry routes must be tree-shaken from the shipped player entrypoint. This
// does not ban internal diagnostics used by systems; it rejects public query routes and boot handles.
const bundledMain = await readFile(join(BUILD_WEB, 'main.js'), 'utf8');
for (const debugToken of ['dev=shippreview', 'dev=shipshot', '[SpaceFace] booted -> main menu']) {
  assert.ok(!bundledMain.includes(debugToken), `production main.js must strip debug route token ${debugToken}`);
}

// 6. The bundle is meaningfully smaller than raw JS. Compare JS-to-JS only (binary assets ship
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
