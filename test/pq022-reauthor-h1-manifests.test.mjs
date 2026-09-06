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
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const probe = readFileSync(new URL('scripts/probe-pq022-corridor-asset-leaves.mjs', ROOT), 'utf8');
const rootPath = fileURLToPath(ROOT);

function assertH1Manifest(manifest, { id, runtimeKind, selector, artifactRoot }) {
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
  assert.ok(manifest.fastGateCommands.includes('npm run check:assets:live'));
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
  assert.match(probe, /\['relay-collar', 'refinery', 'billboard-buoy'\]/);
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
