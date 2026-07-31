import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import browserManifest, {
  PQ007_CONTROL_FIXED_SEED,
} from '../scripts/validation-manifests/pq007-control-browser.mjs';
import electronManifest from '../scripts/validation-manifests/pq007-control-electron.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const browserProbe = read('scripts/probe-auto-target-steering.mjs');
const electronProbe = read('scripts/probe-dod-flight-acceptance.mjs');
const brokerCli = read('scripts/validation-broker-cli.mjs');

test('PQ-007 cells pin separate one-use Browser and Electron broker authority', () => {
  assert.equal(PQ007_CONTROL_FIXED_SEED, 47);
  assert.equal(browserManifest.id, 'pq007-control-browser');
  assert.equal(browserManifest.runtimeKind, 'browser');
  assert.deepEqual(browserManifest.commandArgs,
    ['scripts/probe-auto-target-steering.mjs', '--acceptance']);
  assert.equal(electronManifest.id, 'pq007-control-electron');
  assert.equal(electronManifest.runtimeKind, 'electron');
  assert.deepEqual(electronManifest.commandArgs,
    ['scripts/probe-dod-flight-acceptance.mjs', '--acceptance']);
  for (const manifest of [browserManifest, electronManifest]) {
    assert.equal(manifest.command, process.execPath);
    assert.equal(manifest.fixedSeed, PQ007_CONTROL_FIXED_SEED);
    assert.equal(manifest.maxLaunchesPerCandidate, 1);
    assert.equal(manifest.requireBrokerClaim, true);
    assert.equal(manifest.cleanupPolicy, 'kill-tree');
    assert.match(manifest.artifactRoot.replaceAll('\\', '/'), /\.devshots\/pq007-control-route$/);
    assert.ok(manifest.fastGateCommands.includes(
      'node --test test/pq007-control-route-manifest.test.mjs'));
    for (const sourcePath of [
      ...manifest.regressionSourcePaths,
      ...manifest.productionSourcePaths,
      ...manifest.harnessSourcePaths,
    ]) {
      assert.equal(existsSync(path.join(ROOT, sourcePath)), true,
        `${manifest.id} fingerprints a missing source: ${sourcePath}`);
    }
  }
  assert.match(brokerCli, /'pq007-control-browser'/);
  assert.match(brokerCli, /'pq007-control-electron'/);
});

test('acceptance gates on a broker claim before loading Playwright or launching a runtime', () => {
  assertBefore(browserProbe, 'requireBrokerClaimOrDiagnostic({', 'await loadPlaywright()');
  assertBefore(browserProbe, 'requireBrokerClaimOrDiagnostic({', 'chromium.launch({');
  assertBefore(electronProbe, 'requireBrokerClaimOrDiagnostic({', 'await loadPlaywright()');
  assertBefore(electronProbe, 'requireBrokerClaimOrDiagnostic({', 'electron.launch(');
});

test('the shared actor route uses only visible fixed-seed controls and native Playwright input', () => {
  for (const token of [
    "[data-screen=\"mainMenu\"]",
    "getByRole('button', { name: 'New Game'",
    "page.fill('#sf-ng-seed', String(fixedSeed))",
    "getByRole('button', { name: 'Launch'",
    "page.keyboard.press('KeyJ')",
    'mission-log-career-chip',
    'originAccept',
    "page.keyboard.press('KeyM')",
    "page.keyboard.press('KeyG')",
    'document.pointerLockElement',
    'page.mouse.move(',
    'AUTO-TGT',
    'auto-target-flight-path',
    'Rook Nine',
  ]) {
    assert.ok(browserProbe.includes(token), `missing public actor-route token: ${token}`);
  }
  assert.match(browserProbe, /page\.keyboard\.down\('KeyW'\)/);
  assert.match(browserProbe, /page\.keyboard\.down\('KeyA'\)/);
  assert.match(browserProbe, /page\.keyboard\.up\('KeyW'\)/);
  assert.match(browserProbe, /page\.keyboard\.up\('KeyA'\)/);
  assert.match(browserProbe, /actions\?\.autopursuit/);
  assert.match(browserProbe, /_flightFrame\?\.autopursuit/);
  assert.match(browserProbe, /sf-pursuit-slot/);
  const route = browserProbe.slice(
    browserProbe.indexOf('export async function runPq007PublicActorRoute'),
    browserProbe.indexOf('async function runBrowserAcceptance'),
  );
  assert.doesNotMatch(route, /keyboard\.press\('Tab'\)/,
    'G itself must select the useful hostile');
  assert.doesNotMatch(route, /rookContact\.click\(/,
    'the actor may observe the visible contact but cannot preselect it');
});

test('historical synthetic input and product-state mutation cannot return', () => {
  const routeStart = browserProbe.indexOf('export async function runPq007PublicActorRoute');
  const routeEnd = browserProbe.indexOf('async function runBrowserAcceptance');
  const electronStart = electronProbe.indexOf('async function runElectronAcceptance');
  assert.ok(routeStart >= 0 && routeEnd > routeStart);
  assert.ok(electronStart >= 0);
  const combined = `${browserProbe.slice(routeStart, routeEnd)}\n${electronProbe.slice(electronStart)}`;
  const forbidden = [
    ['synthetic DOM event dispatch', /\.dispatchEvent\s*\(/],
    ['synthetic MouseEvent', /new\s+MouseEvent\s*\(/],
    ['manual product-system tick', /registry\.get\([^)]*\)\s*\?*\.?\s*update\s*\(/],
    ['direct mode assignment', /state\.mode\s*=(?!=)/],
    ['direct screen-stack assignment', /screenStack\.length\s*=(?!=)/],
    ['direct auto-fire assignment', /autoFire\s*=(?!=)/],
    ['direct path assignment', /autoTargetPath\s*=(?!=)/],
    ['direct entity insertion', /entities\.(?:set|add|push)\s*\(/],
    ['product-owner invocation', /registry\.get\([^)]*\)\s*\.\s*(?:enterSector|setCourse|track|toggle)/],
    ['debug-handle mutation', /window\.SF(?:\?*\.[\w$]+)+\s*=(?!=)/],
  ];
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(combined, pattern, label);
  }
});

test('default fixture modes remain available without broker or runtime launch', () => {
  assert.match(browserProbe, /createGameState/);
  assert.match(browserProbe, /toggleAutoTarget/);
  assert.match(browserProbe, /Auto-target steering probe OK/);
  assert.match(electronProbe, /stepPropulsion/);
  assert.match(electronProbe, /reaction-drive coast/);
  assert.match(electronProbe, /All 3 DoD §22 flight acceptance scenarios PASS/);
  assert.match(browserProbe, /process\.argv\.includes\('--acceptance'\)/);
  assert.match(electronProbe, /process\.argv\.includes\('--acceptance'\)/);
});

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assertBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.ok(firstIndex >= 0, `missing ${first}`);
  assert.ok(secondIndex >= 0, `missing ${second}`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}`);
}
