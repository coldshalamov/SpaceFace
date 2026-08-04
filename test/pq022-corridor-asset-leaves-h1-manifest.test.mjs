// PQ-022 Phase H1 — static readiness for the one-use headed corridor-asset presentation cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import manifest, {
  createPq022CorridorAssetLeavesManifest,
  PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED,
} from '../scripts/validation-manifests/pq022-corridor-asset-leaves.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));
const probe = () => read('scripts/probe-pq022-corridor-asset-leaves.mjs');

const REQUIRED_ASSETS = Object.freeze([
  'place_claim_outpost_relay',
  'place_station_trade_hub',
  'place_station_refinery',
  'place_station_military',
  'place_station_mining',
  'place_gate_jump_ring',
  'place_station_billboard',
  'place_nav_buoy',
  'wholeship_helios_lark',
  'wholeship_helios_span',
  'wholeship_helios_cradle',
]);

const REQUIRED_STILLS = Object.freeze([
  '01-relay-close.png',
  '02-relay-default.png',
  '03-relay-far.png',
  '04-station-trade-hub.png',
  '05-station-military.png',
  '06-station-refinery.png',
  '07-station-mining.png',
  '08-gate-jump-ring.png',
  '09-station-billboard.png',
  '10-nav-buoy.png',
  '11-helios-lark-courier.png',
  '12-helios-span-hauler.png',
  '13-helios-cradle-miner.png',
]);

test('pq022-corridor-asset-leaves is a one-use fixed-seed Browser acceptance manifest', () => {
  assert.equal(manifest.id, 'pq022-corridor-asset-leaves');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/probe-pq022-corridor-asset-leaves.mjs']);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED);
  assert.equal(PQ022_CORRIDOR_ASSET_LEAVES_FIXED_SEED, 47);
  assert.equal(manifest.timeoutMs, 540_000);
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq022-corridor-asset-leaves$/);
  assert.equal(createPq022CorridorAssetLeavesManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('every source path declared by the manifest exists', () => {
  const missing = [];
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, [], `manifest declares missing paths: ${missing.join(', ')}`);
});

test('deterministic asset, relay, static, and sim gates precede claim issue', () => {
  assert.deepEqual(manifest.fastGateCommands, [
    'npm run check:pq022:corridor-assets',
    'npm run check:pq022:relay-collar',
    'node --test test/pq022-corridor-asset-set-contract.test.mjs test/pq022-corridor-asset-leaves-h1-manifest.test.mjs',
    'npm run check:sim:compare',
  ]);
});

test('the tracked registry resolves pq022-corridor-asset-leaves', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq022-corridor-asset-leaves',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq022-corridor-asset-leaves\.mjs$/);
});

test('the probe is broker-gated before exactly one headed system-browser launch', () => {
  const source = probe();
  const claim = source.indexOf('requireBrokerClaimOrDiagnostic');
  const launch = source.indexOf('chromium.launch({');
  assert.ok(claim >= 0 && launch > claim, 'claim authorization must precede the Browser launch');
  assert.equal((source.match(/chromium\.launch\(/g) || []).length, 1);
  assert.ok(source.includes('headless: false'));
  assert.ok(source.includes('findSystemBrowser()'));
  assert.ok(source.includes('SwiftShader|llvmpipe|software'));
});

test('the headed route uses canonical visible fixed-seed New Game and the production game renderer', () => {
  const source = probe();
  for (const required of [
    "assert.equal(url.search, '',",
    "assert.equal(url.hash, '',",
    "getByRole('button', { name: 'New Game', exact: true })",
    "targetPage.fill('#sf-ng-seed', String(FIXED_SEED))",
    "getByRole('button', { name: 'Launch', exact: true })",
    'window.SF?.state?.render?.renderer?.getContext?.()',
    "typeof render.warmPostProcess === 'function'",
    "render.renderer.domElement.toDataURL('image/png')",
  ]) assert.ok(source.includes(required), `missing public/render route contract: ${required}`);
  assert.doesNotMatch(source, /new\s+THREE\.WebGLRenderer|createRenderer\s*\(/);
});

test('the one cell pins all eleven exact identities and thirteen required stills', () => {
  const source = probe();
  for (const assetId of REQUIRED_ASSETS) {
    assert.ok(source.includes(assetId), `missing exact asset identity ${assetId}`);
  }
  for (const still of REQUIRED_STILLS) {
    assert.ok(source.includes(still), `missing required still ${still}`);
  }
  assert.ok(source.includes("assert.equal(captures.length, ACTIVE_SHOT_PLAN.length"));
  assert.ok(source.includes("uniqueAssetCount: capturedKeys.size"));
});

test('relay, sector, and traffic fixtures retain their shipped production owners', () => {
  const source = probe();
  for (const required of [
    "sf.registry.get('world')",
    'world.enterSector(wantedSectorId',
    "import('/src/systems/asteroidSites.js')",
    'asteroidSites._ensureBeacon(site)',
    "import('/src/systems/ships.js')",
    'makeShipEntitySpec(def.ship',
    "sf.registry.get('traffic')",
    'owner._stampTrafficDurableIdentity(entity',
    'owner._assignManifest(entity',
    'wholeShipVisualForEntity(entity)',
    "for (const role of ['courier', 'hauler', 'miner'])",
    'distributionClaim: false',
  ]) assert.ok(source.includes(required), `missing production-owner contract: ${required}`);
  assert.doesNotMatch(source, /entity\.data\.trafficRole\s*=/,
    'the harness must ask the traffic owner to stamp the role');
  assert.doesNotMatch(source, /(?:entity|player)\.presentationAdmission\s*=(?!=)/,
    'the harness must not assign authored admission state');
});

test('move and explicit focus precede the ordinary authored-admission wait', () => {
  const source = probe();
  const primeCall = source.indexOf('await primeSubjectAdmission(targetPage, subjectId)');
  const admissionWait = source.indexOf("entity?.presentationAdmission === 'ready'", primeCall);
  assert.ok(primeCall >= 0 && admissionWait > primeCall,
    'player placement/focus must happen before waiting for authored admission');
  const prime = source.slice(source.indexOf('async function primeSubjectAdmission'),
    source.indexOf('async function readManifestIdentity'));
  for (const required of [
    'player.pos.set(x, 0, z)',
    'state.player.targetId = entity.id',
    "sf.registry.get('render')",
    'renderSystem?.reconcileMeshes?.()',
    'request(state.render.renderer, state.render.scene)',
  ]) assert.ok(prime.includes(required), `missing admission runway contract: ${required}`);
  for (const required of [
    "frame.presentationAdmission, 'ready'",
    "frame.authoredAssetState, 'authored'",
    "frame.authoredAssetMode, 'release'",
    'frame.authoredReadableFallbackRetained, false',
    'frame.centerOnScreen, true',
    'frame.authoredSlots[asset.slot]',
  ]) assert.ok(source.includes(required), `missing admitted-visual assertion: ${required}`);
});

test('the report carries exact manifest hashes, bounded fixture disclosure, failure artifacts, and no H1 performance claim', () => {
  const source = probe();
  for (const required of [
    "assets', 'ships', 'parts', 'parts_manifest.json'",
    "assets', 'ships', 'release', 'release_manifest.json'",
    'sourceSha256: releaseRow.sourceSha256',
    'releaseSha256: releaseRow.releaseSha256',
    "path.join(ARTIFACT_ROOT, 'failure-row7.png')",
    "path.join(ARTIFACT_ROOT, 'report.json')",
    'informational_contended: true',
    'noPerformanceEvidence: true',
    'Matched performance remains Phase H3',
  ]) assert.ok(source.includes(required), `missing evidence boundary: ${required}`);
  assert.doesNotMatch(source, /renderer\.info(?:\.|\[)|performance\.now\(|requestAnimationFrame\(/,
    'H1 must not collect a renderer/per-frame performance sample');
});
