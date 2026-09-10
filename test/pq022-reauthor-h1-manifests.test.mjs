import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import refineryBrowser, {
  createPq022RefineryReauthorBrowserManifest,
  PQ022_REFINERY_REAUTHOR_FIXED_SEED,
} from '../scripts/validation-manifests/pq022-refinery-reauthor-browser.mjs';
import refineryElectron from '../scripts/validation-manifests/pq022-refinery-reauthor-electron.mjs';
import billboardBuoyBrowser, {
  createPq022BillboardBuoyReauthorBrowserManifest,
  PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED,
} from '../scripts/validation-manifests/pq022-billboard-buoy-reauthor-browser.mjs';
import billboardBuoyElectron from '../scripts/validation-manifests/pq022-billboard-buoy-reauthor-electron.mjs';
import navBuoyRepairBrowser, {
  createPq022NavBuoyRepairBrowserManifest,
  PQ022_NAV_BUOY_REPAIR_FIXED_SEED,
} from '../scripts/validation-manifests/pq022-nav-buoy-repair-browser.mjs';
import navBuoyRepairElectron from '../scripts/validation-manifests/pq022-nav-buoy-repair-electron.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const probe = readFileSync(new URL('scripts/probe-pq022-corridor-asset-leaves.mjs', ROOT), 'utf8');
const rootPath = fileURLToPath(ROOT);

function assertH1Manifest(manifest, { id, runtimeKind, selector, artifactRoot, liveGate = true }) {
  assert.equal(manifest.id, id);
  assert.equal(manifest.runtimeKind, runtimeKind);
  assert.equal(manifest.mode, 'acceptance');
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.deepEqual(manifest.commandArgs, [
    'scripts/probe-pq022-corridor-asset-leaves.mjs',
    `--only=${selector}`,
    `--runtime=${runtimeKind}`,
  ]);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), artifactRoot);
  assert.ok(manifest.fastGateCommands.includes('npm run check:pq022:corridor-assets'));
  if (liveGate) {
    assert.ok(manifest.fastGateCommands.includes('npm run check:assets:live'));
  } else {
    // The repair cell drops the generic live probe: it is environment-gated on
    // HEAD == origin/master and cannot run on the shared concurrent tree. The corridor gate
    // carries the live hash-binding proof for this cell.
    assert.equal(manifest.fastGateCommands.includes('npm run check:assets:live'), false);
  }
  assert.ok(manifest.fastGateCommands.includes('node --test test/pq022-reauthor-h1-manifests.test.mjs'));
}

test('PQ-022 refinery H1 has distinct one-use Browser and Electron cells', () => {
  assert.equal(PQ022_REFINERY_REAUTHOR_FIXED_SEED, 47);
  assertH1Manifest(refineryBrowser, {
    id: 'pq022-refinery-reauthor-browser', runtimeKind: 'browser', selector: 'refinery',
    artifactRoot: /^\.devshots\/pq022-refinery-reauthor\/browser$/,
  });
  assertH1Manifest(refineryElectron, {
    id: 'pq022-refinery-reauthor-electron', runtimeKind: 'electron', selector: 'refinery',
    artifactRoot: /^\.devshots\/pq022-refinery-reauthor\/electron$/,
  });
  assert.equal(createPq022RefineryReauthorBrowserManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('PQ-022 billboard/buoy H1 has distinct one-use Browser and Electron cells', () => {
  assert.equal(PQ022_BILLBOARD_BUOY_REAUTHOR_FIXED_SEED, 47);
  assertH1Manifest(billboardBuoyBrowser, {
    id: 'pq022-billboard-buoy-reauthor-browser', runtimeKind: 'browser', selector: 'billboard-buoy',
    artifactRoot: /^\.devshots\/pq022-billboard-buoy-reauthor\/browser$/,
  });
  assertH1Manifest(billboardBuoyElectron, {
    id: 'pq022-billboard-buoy-reauthor-electron', runtimeKind: 'electron', selector: 'billboard-buoy',
    artifactRoot: /^\.devshots\/pq022-billboard-buoy-reauthor\/electron$/,
  });
  assert.equal(createPq022BillboardBuoyReauthorBrowserManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('the selected routes use current live subjects and preserve the aggregate selector', () => {
  assert.match(probe, /\['relay-collar', 'refinery', 'billboard-buoy', 'nav-buoy-repair'\]/);
  assert.match(probe, /type: 'fx', placeId: 'place_station_billboard'/);
  assert.doesNotMatch(probe, /poiId: 'poi_memorial', placeId: 'place_station_billboard'/);
  assert.match(probe, /poi_tethys_customs_log/);
  assert.match(probe, /stationId: 'station_ceres', archetypeGlb: 'place_station_refinery'/);
  assert.match(probe, /const AGGREGATE = ONLY == null/);
  assert.doesNotMatch(probe, /ELECTRON_RUNTIME \? relayElectronManifest : relayBrowserManifest\)\n  : corridorManifest/);
  assert.ok(rootPath.endsWith('SpaceFace\\') || rootPath.endsWith('SpaceFace/'));
});

test('the tracked registry resolves all four leaf/runtime manifests', async () => {
  for (const manifest of [refineryBrowser, refineryElectron, billboardBuoyBrowser, billboardBuoyElectron]) {
    const registered = await loadValidationManifestById({ root: rootPath, id: manifest.id });
    assert.equal(registered.id, manifest.id);
    assert.equal(registered.runtimeKind, manifest.runtimeKind);
  }
});

test('probe synchronizes player physics bodies and isolates electron background execution', () => {
  assert.match(probe, /--disable-background-timer-throttling/);
  assert.match(probe, /--ignore-gpu-blocklist/);
  assert.match(probe, /--enable-webgl/);
  assert.match(probe, /--window-size=/);
  assert.match(probe, /setViewportSize\(VIEWPORT\)/);
  assert.match(probe, /_maybeResyncBodyPose/);
  assert.match(probe, /phys\?._sg02\?\.records/);
});

test('probe configures billboard and buoy shot plan and subjects', () => {
  assert.match(probe, /01-core-station-billboard-ordinary\.png/);
  assert.match(probe, /02-tethys-customs-buoy-ordinary\.png/);
  assert.match(probe, /BILLBOARD_BUOY_REAUTHOR_SHOT_PLAN/);
  assert.match(probe, /places\/place_station_billboard\.glb/);
  assert.match(probe, /places\/place_nav_buoy\.glb/);
});

test('PQ-022 nav-buoy repair H1 has distinct one-use Browser and Electron cells', () => {
  assert.equal(PQ022_NAV_BUOY_REPAIR_FIXED_SEED, 47);
  assertH1Manifest(navBuoyRepairBrowser, {
    id: 'pq022-nav-buoy-repair-browser', runtimeKind: 'browser', selector: 'nav-buoy-repair',
    artifactRoot: /^\.devshots\/pq022-nav-buoy-repair\/browser$/, liveGate: false,
  });
  assertH1Manifest(navBuoyRepairElectron, {
    id: 'pq022-nav-buoy-repair-electron', runtimeKind: 'electron', selector: 'nav-buoy-repair',
    artifactRoot: /^\.devshots\/pq022-nav-buoy-repair\/electron$/, liveGate: false,
  });
  assert.equal(createPq022NavBuoyRepairBrowserManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('nav-buoy repair cell captures only the returned buoy at ordinary and diagnostic-close', () => {
  assert.match(probe, /NAV_BUOY_REPAIR_SHOT_PLAN/);
  assert.match(probe, /01-tethys-customs-buoy-ordinary\.png/);
  assert.match(probe, /02-tethys-customs-buoy-diagnostic-close\.png/);
  const registry = [...probe.matchAll(/NAV_BUOY_REPAIR_ONLY\b/g)].length;
  assert.ok(registry >= 6, 'the repair selector must gate manifest, assets, plan, tethys, framing, and schema');
});



