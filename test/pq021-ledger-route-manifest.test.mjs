// PQ-021 Phase 4 — the route harness and broker manifest are BUILT and ready, without being run.
//
// PQ-034 holds the validation-broker / browser-gpu leases, so no claim has been issued against
// pq021-ledger-route. This file proves the cell is executable in one command when the lease frees:
// the manifest is registered and well formed, every path it declares actually exists, and the probe
// is inert without a broker claim. Nothing here spawns the broker, a browser, or Electron.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq021LedgerRouteManifest,
  PQ021_LEDGER_ROUTE_FIXED_SEED,
} from '../scripts/validation-manifests/pq021-ledger-route.mjs';
import {
  MAX_FIGURE_WIDTH_PX,
  PQ021_ROUTE_SCHEMA,
  PQ021_SCREENSHOTS,
  SECTOR_ID,
  SITE_ID,
} from '../scripts/lib/pq021LedgerPublicRoute.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));

test('the pq021-ledger-route manifest matches the broker contract', () => {
  assert.equal(manifest.id, 'pq021-ledger-route');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/probe-pq021-ledger-route.mjs']);
  assert.equal(manifest.requireBrokerClaim, true, 'the cell must not run unclaimed');
  assert.equal(manifest.maxLaunchesPerCandidate, 1,
    'one acceptance attempt per candidate digest, per the packet verification budget');
  assert.equal(manifest.fixedSeed, PQ021_LEDGER_ROUTE_FIXED_SEED, 'the seed is fixed, not wall-clock');
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq021-ledger-route$/);
  assert.ok(manifest.timeoutMs >= 60_000, 'a full boot + two read routes needs a real timeout');
  // Overrides must not be silently dropped.
  assert.equal(createPq021LedgerRouteManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('every source path the manifest declares exists on disk', () => {
  const groups = ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths'];
  const missing = [];
  for (const group of groups) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, [], `manifest declares paths that do not exist: ${missing.join(', ')}`);
});

test('the manifest pins the paths that can invalidate a route receipt', () => {
  // If any of these change, a previously accepted route receipt must not still count.
  for (const required of [
    'src/systems/shipLedger.js',
    'src/ui/screens/shipLedger.js',
    'src/ui/station/screens/ledger.js',
    'src/ui/screens/codex.js',
    'src/data/wreckCathedralEvidenceCatalog.js',
    'src/systems/worldSiteKernel.js',
    'src/ui/bindings.js',
    'styles/station.css',
  ]) {
    assert.ok(manifest.productionSourcePaths.includes(required),
      `${required} must invalidate a stale route receipt`);
  }
});

test('the deterministic fast gates run before any claim is issued', () => {
  const commands = manifest.fastGateCommands.join('\n');
  assert.match(commands, /test\/pq021-ledger-natural-earning\.test\.mjs/,
    'natural earning must be green before the route cell is authorized');
  assert.match(commands, /scripts\/check-pq021-ledger-hosts\.mjs/,
    'the two-host DOM proof must be green before the route cell is authorized');
});

test('the tracked registry resolves the manifest so one command runs the cell', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq021-ledger-route',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq021-ledger-route\.mjs$/);
});

test('the probe is inert without a broker claim', () => {
  const probe = read('scripts/probe-pq021-ledger-route.mjs');
  assert.ok(probe.includes('requireBrokerClaimOrDiagnostic'), 'the probe gates on the broker claim');
  assert.ok(probe.includes('process.env.SF_BROKER_CLAIM'), 'the claim arrives by environment');
  assert.ok(probe.includes('process.exit(2)'), 'an unclaimed direct run exits 2, it does not run the route');
  assert.ok(probe.includes('BUILT, NOT RUN'), 'the probe states that it has never been executed');
});

test('both runtime entries share one route module and one schema', () => {
  const browser = read('scripts/probe-pq021-ledger-route.mjs');
  const electron = read('scripts/check-pq021-ledger-route-electron.mjs');
  for (const [label, source] of [['browser', browser], ['electron', electron]]) {
    assert.ok(source.includes('pq021LedgerPublicRoute.mjs'),
      `${label} entry must share the one route module`);
    assert.ok(source.includes('runStationReadRoute') && source.includes('runFlightReadRoute'),
      `${label} entry must drive BOTH ordinary read routes`);
    assert.ok(source.includes('earnInRuntime'),
      `${label} entry must earn through the ordinary operation API rather than injecting receipts`);
  }
  assert.equal(PQ021_ROUTE_SCHEMA, 'spaceface.pq021-ledger-route.v1');
  assert.equal(PQ021_SCREENSHOTS.length, 4, 'both hosts capture a list view and an evidence view');
});

test('the Electron entry follows the proven isolated canonical-root bootstrap', () => {
  const electron = read('scripts/check-pq021-ledger-route-electron.mjs');
  assert.ok(electron.includes('loadPlaywright'),
    'the Electron entry must load and launch Playwright rather than treating a launch descriptor as an app');
  assert.ok(electron.includes('createIsolatedElectronLaunch'),
    'the Electron entry must use an isolated evidence profile and non-player port');
  assert.ok(electron.includes('createElectronCanonicalUrlTracker'),
    'the Electron entry must tolerate about:blank bootstrap and establish the canonical loopback root');
  assert.ok(electron.includes('waitForCanonicalRoot'),
    'the Electron entry must establish its root before waiting for the routed document');
  assert.ok(electron.includes('closeOwnedElectronRuntime'),
    'the Electron entry must prove owned shutdown before deleting the isolated profile');
});

test('the route module drives the ordinary keyboard and destination routes, not internal APIs', () => {
  const route = read('scripts/lib/pq021LedgerPublicRoute.mjs');
  assert.ok(route.includes("page.keyboard.press('k')"),
    'the flight route presses the real K binding rather than calling pushScreen directly');
  assert.ok(route.includes("[data-nav=\"ledger\"]"),
    'the station route clicks the real Ledger destination tile');
  assert.ok(route.includes('.sf-tabbar .sf-tab'),
    'the flight route clicks the real Codex tab');
  assert.ok(!route.includes('evidenceReceiptsByPageId ='),
    'the route module must never write the receipt map');
  assert.equal(SITE_ID, 'world_site_wreck_cathedral');
  assert.equal(SECTOR_ID, 'sector_ceres_belt');
  assert.ok(MAX_FIGURE_WIDTH_PX > 0);
});

test('the ordinary input bindings the route depends on are the shipped ones', () => {
  // If these move, the route harness is driving a binding the player does not have.
  const bindings = read('src/ui/bindings.js');
  assert.ok(bindings.includes("codex: { key: 'k', code: 'KeyK'"),
    'K is the shipped Codex binding (src/ui/bindings.js)');
  const input = read('src/ui/input.js');
  assert.ok(input.includes("screenManager.pushScreen('codex')"),
    'the Codex binding pushes the Codex screen');
  // Controller: button 3 (Y / Triangle) maps to the same Codex action. Asserted as a shipped config
  // fact; a physical-controller pass is an open row, not a claim.
  const gamepad = read('src/systems/gamepad.js');
  assert.ok(gamepad.includes('Y / Triangle'), 'the gamepad map documents Y/Triangle');
  assert.ok(/codex:\s*\[/.test(gamepad), 'codex is a mapped gamepad action');
  assert.ok(input.includes('gp.actions.codex'), 'the gamepad Codex action opens the same screen');
});
