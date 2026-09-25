// ZERO_TO_HERO §7 item 5 — the demo Electron package is one command away and stays
// distinct from the full game: same entrypoint, demo define baked, different identity
// and output directory, base electron-builder config single-sourced in package.json.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const distDemoSrc = readFileSync(path.join(ROOT, 'scripts', 'dist-demo.mjs'), 'utf8');
const mainSrc = readFileSync(path.join(ROOT, 'electron', 'main.cjs'), 'utf8');
const require = createRequire(import.meta.url);
const { resolveReleaseIdentity } = require('../electron/releaseIdentity.cjs');

test('dist:demo builds the demo bundle then the Electron package', () => {
  const script = pkg.scripts['dist:demo'];
  assert.ok(script, 'package.json needs a dist:demo script');
  assert.match(script, /build-bundle\.mjs --demo/, 'dist:demo must bake the demo define');
  assert.match(script, /dist-demo\.mjs/, 'dist:demo must run the packager wrapper');
});

test('demo overrides keep the package distinct and single-source the base config', () => {
  assert.match(distDemoSrc, /-c\.productName=SpaceFace Demo/, 'demo productName');
  const expectedAppId = `${pkg.build.appId}.demo`;
  assert.match(distDemoSrc, new RegExp(`-c\\.appId=${expectedAppId.replace(/\./g, '\\.')}`),
    `demo appId must be ${expectedAppId}`);
  assert.match(distDemoSrc, /-c\.directories\.output=dist[\\/]demo/,
    'demo output must not overwrite the full package dir');
  assert.match(distDemoSrc, /-c\.win\.artifactName=[^\n]*Demo/, 'demo artifact name');
  // The overrides ride package.json's "build" block — no copied config file, no --config.
  assert.doesNotMatch(distDemoSrc, /--config/, 'must not swap to a second config file');
  assert.match(distDemoSrc, /electron-builder\/cli\.js/, 'must invoke the electron-builder CLI');
});

test('release identity marks a demo package from its product name', () => {
  const demo = resolveReleaseIdentity({
    appApi: { isPackaged: false, getVersion: () => '0.1.0', getName: () => 'SpaceFace Demo' },
    projectRoot: null,
    env: { SPACEFACE_BUILD_HASH: 'cafe1234beef' },
  });
  assert.equal(demo.demo, true);
  const full = resolveReleaseIdentity({
    appApi: { isPackaged: false, getVersion: () => '0.1.0', getName: () => 'SpaceFace' },
    projectRoot: null,
    env: { SPACEFACE_BUILD_HASH: 'cafe1234beef' },
  });
  assert.equal(full.demo, false);
});

test('a demo crash report carries the demo flag end to end', () => {
  assert.match(mainSrc, /extra\.demo = 'true'/, 'crashpad extras must name the demo build');
  assert.match(mainSrc, /demo: !!\(identity && identity\.demo\)/, 'JSON crash report must carry demo');
  assert.match(mainSrc, /appApi\.getName/, 'crash reporter must take the packaged product name');
});
