import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  createAssetResidencyRegistry,
  protectSharedGpuResource,
} from '../src/render/assetResidency.js';
import {
  awaitVisualProbeOperation,
  awaitVisualProbePhase,
  createVisualProbePhaseTracker,
  phaseError,
} from '../scripts/lib/visualProbePhases.mjs';

const RESIDENCY_NAVIGATION_TIMEOUT_MS = 90_000;
const RESIDENCY_READY_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.SF_RESIDENCY_READY_TIMEOUT_MS) || 60_000,
);
const RESIDENCY_IN_PAGE_AWAIT_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.SF_RESIDENCY_IN_PAGE_AWAIT_TIMEOUT_MS) || 30_000,
);
const RESIDENCY_FLIGHT_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.SF_RESIDENCY_FLIGHT_TIMEOUT_MS) || 90_000,
);

function gpuResource(label, byteSize = 1024) {
  let disposals = 0;
  const resource = {
    label,
    userData: {},
    byteSize,
    dispose() { disposals++; },
  };
  return { resource, disposals: () => disposals };
}

function register(registry, key, fixtures, options = {}) {
  return registry.registerAsset(key, fixtures.map((fixture) => fixture.resource), {
    byteSize: fixtures.reduce((sum, fixture) => sum + fixture.resource.byteSize, 0),
    ...options,
  });
}

const require = createRequire(import.meta.url);
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('exact owner refcounts restore and call original disposer only after the last release', () => {
  const registry = createAssetResidencyRegistry();
  const geometry = gpuResource('geometry', 12);
  const material = gpuResource('material', 4);
  protectSharedGpuResource(geometry.resource);
  protectSharedGpuResource(material.resource);
  register(registry, 'ship:kestrel', [geometry, material]);

  const flight = { name: 'flight-boundary' };
  const preview = { name: 'preview-boundary' };
  assert.equal(registry.retain('ship:kestrel', flight, { role: 'player', sectorId: 'helios' }), true);
  assert.equal(registry.retain('ship:kestrel', flight, { role: 'player', sectorId: 'helios' }), false,
    'duplicate retain by one owner is idempotent');
  assert.equal(registry.retain('ship:kestrel', preview, { role: 'preview' }), true);
  geometry.resource.dispose();
  assert.equal(geometry.disposals(), 0, 'ordinary graph cleanup remains harmless while shared');

  registry.releaseOwner(flight, 'sector-departed');
  assert.equal(geometry.disposals(), 0);
  assert.equal(registry.diagnostics().assets[0].refCount, 1);
  registry.releaseOwner(preview, 'preview-closed');
  assert.equal(geometry.disposals(), 1);
  assert.equal(material.disposals(), 1);
  geometry.resource.dispose();
  assert.equal(geometry.disposals(), 1, 'later parent graph teardown cannot double-dispose the resource');
  assert.equal(registry.diagnostics().residentAssets, 0);
  assert.deepEqual(
    registry.diagnostics().events.filter((event) => event.type === 'asset-evicted').map((event) => event.key),
    ['ship:kestrel'],
  );
});

test('resources shared across assets survive cross-owner release and dispose exactly once', () => {
  const registry = createAssetResidencyRegistry();
  const sharedGeometry = gpuResource('shared-geometry', 16);
  const sharedTexture = gpuResource('shared-texture', 32);
  const materialA = gpuResource('material-a', 4);
  const materialB = gpuResource('material-b', 4);
  for (const fixture of [sharedGeometry, sharedTexture, materialA, materialB]) {
    protectSharedGpuResource(fixture.resource);
  }
  register(registry, 'asset:a', [sharedGeometry, sharedTexture, materialA]);
  register(registry, 'asset:b', [sharedGeometry, sharedTexture, materialB]);
  const ownerA = {};
  const ownerB = {};
  registry.retain('asset:a', ownerA, { sectorId: 'a' });
  registry.retain('asset:b', ownerB, { sectorId: 'b' });

  registry.releaseOwner(ownerA, 'gone');
  assert.equal(materialA.disposals(), 1);
  assert.equal(sharedGeometry.disposals(), 0);
  assert.equal(sharedTexture.disposals(), 0);
  registry.releaseOwner(ownerB, 'gone');
  assert.equal(materialB.disposals(), 1);
  assert.equal(sharedGeometry.disposals(), 1);
  assert.equal(sharedTexture.disposals(), 1);
});

test('a live cache key cannot be replaced by a second decoded resource generation', () => {
  const registry = createAssetResidencyRegistry();
  const first = gpuResource('first-generation', 16);
  const second = gpuResource('second-generation', 16);
  register(registry, 'asset:stable-key', [first]);
  const owner = {};
  registry.retain('asset:stable-key', owner, { role: 'current-sector', sectorId: 'helios' });
  assert.throws(() => register(registry, 'asset:stable-key', [second]), /live generation/i);
  assert.equal(first.disposals(), 0);
  assert.equal(second.disposals(), 0, 'rejected decode is not converted into a protected leaked resource');
  registry.releaseOwner(owner, 'done');
  assert.equal(first.disposals(), 1);
});

test('queued and in-flight requests cancel before decode or reject residency after departure', () => {
  const registry = createAssetResidencyRegistry();
  const beforeOwner = {};
  const before = registry.beginRequest('asset:queued', beforeOwner, { role: 'queued-job' });
  registry.releaseOwner(beforeOwner, 'boundary-removed');
  assert.equal(before.shouldDecode(), false, 'departure before admission cancels decode');

  const duringOwner = {};
  const during = registry.beginRequest('asset:decoding', duringOwner, { role: 'queued-job' });
  assert.equal(during.shouldDecode(), true);
  const decoded = gpuResource('decoded-during-race', 64);
  protectSharedGpuResource(decoded.resource);
  register(registry, 'asset:decoding', [decoded]);
  registry.releaseOwner(duringOwner, 'boundary-removed-during-decode');
  assert.equal(during.commit(), false, 'a departed owner cannot acquire the completed decode');
  assert.equal(decoded.disposals(), 1, 'orphaned decode is reclaimed immediately');
  assert.equal(registry.diagnostics().pendingRequests, 0);
});

test('release-before-first-retain is a durable owner tombstone', () => {
  const registry = createAssetResidencyRegistry();
  const departedBoundary = {};
  assert.equal(registry.releaseOwner(departedBoundary, 'detached-before-canonical-load'), 0);

  const decoded = gpuResource('late-canonical-result', 64);
  register(registry, 'asset:late', [decoded]);
  assert.equal(registry.retain('asset:late', departedBoundary, { role: 'preview' }), false,
    'the same detached owner object must never be resurrected after an await');
  assert.equal(registry.isOwnerReleased(departedBoundary), true);
});

test('bootstrap ownership hands off atomically only after every boot asset has a live owner', () => {
  const registry = createAssetResidencyRegistry();
  const bootstrap = {};
  const player = {};
  const hub = {};
  const kestrel = gpuResource('bootstrap-kestrel', 32);
  const station = gpuResource('bootstrap-hub', 32);
  register(registry, 'boot:kestrel', [kestrel]);
  register(registry, 'boot:hub', [station]);
  registry.retain('boot:kestrel', bootstrap, { role: 'bootstrap', sectorId: 'helios' });
  registry.retain('boot:hub', bootstrap, { role: 'bootstrap', sectorId: 'helios' });

  registry.retain('boot:kestrel', player, { role: 'player', sectorId: 'helios' });
  assert.equal(registry.handoffOwnerWhenCovered(bootstrap), false,
    'bootstrap remains until the critical hub is covered too');
  registry.retain('boot:hub', hub, { role: 'current-sector', sectorId: 'helios' });
  assert.equal(registry.handoffOwnerWhenCovered(bootstrap), true);

  registry.rotateSector('helios');
  registry.prepareSectorExit('helios');
  registry.releaseOwner(hub, 'sector-left');
  registry.rotateSector('next');
  registry.prepareSectorExit('next');
  registry.rotateSector('beyond-warm');
  assert.equal(registry.has('boot:kestrel'), true, 'the player owner survives sector rotation');
  assert.equal(registry.has('boot:hub'), false, 'the old hub leaves after one warm sector');
  assert.equal(station.disposals(), 1);
  assert.equal(kestrel.disposals(), 0);
});

test('same-sector save restore keeps one decoded generation until rebuilt boundaries cover it', () => {
  const registry = createAssetResidencyRegistry();
  const playerAsset = gpuResource('player-generation', 96 * 1024 * 1024);
  const hubAsset = gpuResource('hub-generation', 32 * 1024 * 1024);
  register(registry, 'helios:player', [playerAsset]);
  register(registry, 'helios:hub', [hubAsset]);
  registry.rotateSector('helios');

  const oldPlayer = {};
  const oldHub = {};
  registry.retain('helios:player', oldPlayer, { role: 'player', sectorId: 'helios' });
  registry.retain('helios:hub', oldHub, { role: 'current-sector', sectorId: 'helios' });

  registry.prepareSectorExit('helios', { includePlayer: true });
  registry.releaseOwner(oldPlayer, 'save-restore');
  registry.releaseOwner(oldHub, 'save-restore');
  registry.rotateSector('helios');
  assert.equal(playerAsset.disposals(), 0);
  assert.equal(hubAsset.disposals(), 0);
  assert.equal(registry.canonicalDiagnostics().residentAssets, 2);

  const newPlayer = {};
  const newHub = {};
  registry.retain('helios:player', newPlayer, { role: 'player', sectorId: 'helios' });
  assert.equal(registry.canonicalDiagnostics().warmSectorId, 'helios',
    'the warm hold stays until every restored boundary covers its asset');
  registry.retain('helios:hub', newHub, { role: 'current-sector', sectorId: 'helios' });
  const restored = registry.canonicalDiagnostics();
  assert.equal(restored.warmSectorId, null);
  assert.equal(restored.ownerCount, 2, 'only rebuilt live boundaries remain after atomic handoff');
  assert.equal(restored.residentBytes, 128 * 1024 * 1024);
  assert.ok(restored.assets.every((asset) => asset.refCount === 1));

  registry.releaseOwner(newPlayer, 'done');
  registry.releaseOwner(newHub, 'done');
  assert.equal(playerAsset.disposals(), 1);
  assert.equal(hubAsset.disposals(), 1);
});

test('explicit preview leases plateau across root cycles and release to zero', async () => {
  const assetLoader = await import('../src/render/assetLoader.js');
  assert.equal(typeof assetLoader.createAuthoredAssetLease, 'function');
  const renderer = {};
  const registry = createAssetResidencyRegistry();
  let priorLease = null;

  for (let index = 0; index < 12; index++) {
    if (priorLease) priorLease.release('preview-root-replaced');
    const resource = gpuResource(`preview-${index}`, 8 * 1024 * 1024);
    register(registry, `preview:${index}`, [resource]);
    const lease = assetLoader.createAuthoredAssetLease(renderer, {
      registry,
      role: 'preview',
      ownerId: `preview-root-${index}`,
    });
    assert.equal(lease.retain(`preview:${index}`), true);
    priorLease = lease;
    const snapshot = registry.canonicalDiagnostics();
    assert.equal(snapshot.ownerCount, 1);
    assert.ok(snapshot.residentBytes <= 8 * 1024 * 1024);
  }

  priorLease.release('preview-closed');
  const final = registry.canonicalDiagnostics();
  assert.equal(final.ownerCount, 0);
  assert.equal(final.residentResources, 0);
  assert.equal(final.residentBytes, 0);
});

test('cache-only render-package owners are reclaimed without double disposal', () => {
  const registry = createAssetResidencyRegistry();
  const packageResource = gpuResource('cache-only-package', 64);
  protectSharedGpuResource(packageResource.resource);
  register(registry, 'render-package:cache-only', [packageResource]);
  const cacheOwner = {};
  registry.retain('render-package:cache-only', cacheOwner, { role: 'render-package-cache' });

  const first = registry.releaseUnreferencedCacheOwners('test-cache-only');
  assert.deepEqual(first.evicted, ['render-package:cache-only']);
  assert.equal(first.releasedOwners, 1);
  assert.equal(packageResource.disposals(), 1);
  assert.equal(registry.canonicalDiagnostics().residentAssets, 0);

  const second = registry.releaseUnreferencedCacheOwners('test-cache-only-repeat');
  assert.deepEqual(second.evicted, []);
  assert.equal(packageResource.disposals(), 1, 'repeated cleanup cannot double-dispose a released package');
});

test('mixed render-package cache and presentation owners stay pinned until the presentation owner leaves', () => {
  const registry = createAssetResidencyRegistry();
  const packageResource = gpuResource('mixed-package', 64);
  protectSharedGpuResource(packageResource.resource);
  register(registry, 'render-package:mixed', [packageResource]);
  const cacheOwner = {};
  const liveOwner = {};
  registry.retain('render-package:mixed', cacheOwner, { role: 'render-package-cache' });
  registry.retain('render-package:mixed', liveOwner, { role: 'sector-prewarm', sectorId: 'helios' });

  const held = registry.releaseUnreferencedCacheOwners('test-mixed');
  assert.deepEqual(held.evicted, []);
  assert.equal(registry.canonicalDiagnostics().residentAssets, 1);
  assert.equal(packageResource.disposals(), 0);

  registry.releaseOwner(liveOwner, 'test-live-owner-departed');
  const released = registry.releaseUnreferencedCacheOwners('test-mixed-after-live');
  assert.deepEqual(released.evicted, ['render-package:mixed']);
  assert.equal(packageResource.disposals(), 1);
});

test('active render-package cache requests block cache-only cleanup until the request finishes', () => {
  const registry = createAssetResidencyRegistry();
  const packageResource = gpuResource('pending-package', 64);
  protectSharedGpuResource(packageResource.resource);
  register(registry, 'render-package:pending', [packageResource]);
  const cacheOwner = {};
  registry.retain('render-package:pending', cacheOwner, { role: 'render-package-cache' });
  const request = registry.beginRequest('render-package:pending', cacheOwner, { role: 'render-package-cache' });

  const held = registry.releaseUnreferencedCacheOwners('test-pending');
  assert.deepEqual(held.evicted, []);
  assert.equal(packageResource.disposals(), 0);
  request.cancel('test-pending-finished');
  const released = registry.releaseUnreferencedCacheOwners('test-pending-after-finish');
  assert.deepEqual(released.evicted, ['render-package:pending']);
  assert.equal(packageResource.disposals(), 1);
});

test('one departed waiter cannot evict a shared decode before a surviving waiter commits', () => {
  const registry = createAssetResidencyRegistry();
  const departedOwner = {};
  const survivingOwner = {};
  const departed = registry.beginRequest('asset:shared-race', departedOwner, { role: 'queued-job' });
  const surviving = registry.beginRequest('asset:shared-race', survivingOwner, { role: 'queued-job' });
  const decoded = gpuResource('shared-race-resource', 64);
  protectSharedGpuResource(decoded.resource);
  register(registry, 'asset:shared-race', [decoded]);

  registry.releaseOwner(departedOwner, 'departed-after-shared-decode');
  assert.equal(departed.shouldDecode(), false);
  assert.equal(decoded.disposals(), 0, 'the surviving waiter still owns admission to the decoded result');
  assert.equal(surviving.commit(), true);
  assert.equal(registry.diagnostics().residentAssets, 1);
  registry.releaseOwner(survivingOwner, 'done');
  assert.equal(decoded.disposals(), 1);
});

test('context loss never calls an old-context disposer and later generations dispose normally', () => {
  const registry = createAssetResidencyRegistry();
  const stale = gpuResource('old-context', 64);
  protectSharedGpuResource(stale.resource);
  register(registry, 'asset:old', [stale]);
  const owner = {};
  registry.retain('asset:old', owner, { sectorId: 'helios' });
  registry.handleContextLost();
  registry.releaseOwner(owner, 'removed-while-context-lost');
  assert.equal(stale.disposals(), 0, 'old-context resource is logically evicted without GL disposal');
  registry.handleContextRestored();

  const fresh = gpuResource('restored-context', 64);
  protectSharedGpuResource(fresh.resource);
  register(registry, 'asset:fresh', [fresh]);
  const freshOwner = {};
  registry.retain('asset:fresh', freshOwner, { sectorId: 'helios' });
  registry.releaseOwner(freshOwner, 'done');
  assert.equal(fresh.disposals(), 1);
  const diagnostics = registry.diagnostics();
  assert.equal(diagnostics.contextGeneration, 1);
  assert.equal(diagnostics.contextLost, false);
});

test('canonical diagnostics ignore clocks and insertion order, dedupe backing stores, and stay bounded', () => {
  const sharedBacking = new ArrayBuffer(1024);
  const makeGeometry = (label, offset) => ({
    label,
    userData: {},
    attributes: { position: { array: new Float32Array(sharedBacking, offset, 64) } },
    dispose() {},
  });
  const build = (reverse, clock) => {
    const registry = createAssetResidencyRegistry({ now: () => clock, maxEvents: 40 });
    const rows = reverse
      ? [['asset:b', makeGeometry('b', 256)], ['asset:a', makeGeometry('a', 0)]]
      : [['asset:a', makeGeometry('a', 0)], ['asset:b', makeGeometry('b', 256)]];
    for (const [key, resource] of rows) {
      registry.registerAsset(key, [resource]);
      registry.retain(key, { key }, { role: 'preview', sectorId: 'helios' });
    }
    for (let index = 0; index < 80; index++) {
      const requestOwner = {};
      const request = registry.beginRequest(`miss:${index}`, requestOwner, { role: 'probe' });
      request.cancel('probe-complete');
    }
    assert.ok(registry.diagnostics().events.length <= 40, 'event history obeys its hard cap');
    assert.deepEqual(registry.diagnostics({ includeEvents: false }).events, []);
    return registry.canonicalDiagnostics();
  };

  const first = build(false, 10);
  const second = build(true, 999999);
  assert.equal(first.residentBytes, 2 * 64 * Float32Array.BYTES_PER_ELEMENT,
    'distinct BufferAttributes upload distinct view ranges even when they share one ArrayBuffer');
  assert.deepEqual(first, second, 'canonical summaries are independent of insertion order and wall clock');
});

test('thirty-sector traversal plateaus at current plus one warm generation', () => {
  let now = 0;
  const evictionEvents = [];
  const registry = createAssetResidencyRegistry({
    now: () => now,
    onEvent: (event) => { if (event.type === 'asset-evicted') evictionEvents.push(event); },
  });
  let previousOwners = [];
  const samples = [];

  for (let sectorIndex = 0; sectorIndex < 30; sectorIndex++) {
    const sectorId = `sector-${sectorIndex}`;
    registry.rotateSector(sectorId);
    for (const owner of previousOwners) registry.releaseOwner(owner, 'sector-departed');
    const currentOwners = [];
    for (let assetIndex = 0; assetIndex < 4; assetIndex++) {
      const key = `${sectorId}:asset-${assetIndex}`;
      const resource = gpuResource(key, 8 * 1024 * 1024);
      protectSharedGpuResource(resource.resource);
      register(registry, key, [resource]);
      const owner = { sectorId, assetIndex };
      registry.retain(key, owner, { role: assetIndex === 0 ? 'player-visible' : 'current-sector', sectorId });
      currentOwners.push(owner);
    }
    previousOwners = currentOwners;
    now += 100;
    samples.push(registry.diagnostics().residentBytes);
  }

  const plateau = samples.slice(3);
  const drift = Math.max(...plateau) - Math.min(...plateau);
  const baseline = plateau[0];
  assert.ok(drift <= 128 * 1024 * 1024 || drift <= baseline * 0.10,
    `resident drift ${drift} must remain within 128MB or 10%`);
  assert.ok(Math.max(...plateau) <= 64 * 1024 * 1024,
    'only four current and four previous 8MB resources remain resident');
  assert.ok(evictionEvents.length >= 28 * 4);
  assert.ok(evictionEvents.every((event) => event.ageMs <= 2000),
    'evicted resource counts return inside the two-second acceptance window');
});

test('headless real release-GLB traversal plateaus through live sector events and preview leases', {
  // Cold navigation and authored-library readiness have their own phase-labelled bounds above.
  // Keep the outer test budget large enough for those bounds plus the 30-sector traversal and
  // cleanup, so Node does not erase the actionable phase error first.
  timeout: 480_000,
}, async () => {
  const phaseTracker = createVisualProbePhaseTracker();
  const server = createGameServer({ root: ROOT, async: true, devDiagnostics: false });
  const executablePath = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find(existsSync);
  let browser = null;
  let page = null;
  let probeFailure = null;
  try {
    await awaitVisualProbePhase(phaseTracker, 'server-ready', () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    }), { host: '127.0.0.1', port: 'ephemeral' });
    const address = server.address();
    browser = await awaitVisualProbeOperation(phaseTracker, 'browser-launch', () => chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-extensions'],
    }));
    page = await awaitVisualProbeOperation(
      phaseTracker,
      'new-page',
      () => browser.newPage({ viewport: { width: 800, height: 600 } }),
      { viewport: { width: 800, height: 600 } },
    );
    const pageMessages = [];
    page.on('console', (message) => pageMessages.push(`${message.type()}: ${message.text()}`));
    const url = `http://127.0.0.1:${address.port}/?debug=flight`;
    await awaitVisualProbePhase(phaseTracker, 'document-loaded', () => page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: RESIDENCY_NAVIGATION_TIMEOUT_MS,
    }), { url, timeoutMs: RESIDENCY_NAVIGATION_TIMEOUT_MS });
    await awaitVisualProbePhase(
      phaseTracker,
      'SF-boot-ready',
      () => page.waitForFunction(() => !!(
        window.SF
        && window.SF.state
        && window.SF.state.render
        && window.SF.state.render.renderer
      ), null, { timeout: RESIDENCY_READY_TIMEOUT_MS }),
      { timeoutMs: RESIDENCY_READY_TIMEOUT_MS },
    );
    await awaitVisualProbePhase(
      phaseTracker,
      'authored-library-ready',
      () => waitForAuthoredLibraryReadyInTest(page, RESIDENCY_READY_TIMEOUT_MS),
      { timeoutMs: RESIDENCY_READY_TIMEOUT_MS },
    );
    await awaitVisualProbeOperation(
      phaseTracker,
      'game:new',
      () => page.evaluate(() => window.SF.bus.emit('game:new', {
        name: 'Residency Traversal Probe',
        seed: 47,
      })),
    );
    await awaitVisualProbePhase(
      phaseTracker,
      'flight-ready',
      () => page.waitForFunction(() => {
        const state = window.SF && window.SF.state;
        const player = state && state.entities && state.entities.get(state.playerId);
        return !!(state && state.mode === 'flight' && player && player.alive !== false);
      }, null, { timeout: RESIDENCY_FLIGHT_TIMEOUT_MS }),
      { timeoutMs: RESIDENCY_FLIGHT_TIMEOUT_MS },
    );
    await awaitVisualProbePhase(
      phaseTracker,
      'first-playable-frame',
      () => page.waitForFunction(() => {
        const state = window.SF && window.SF.state;
        const canvas = document.getElementById('gl-canvas');
        return !!(state
          && state.mode === 'flight'
          && state.render
          && Number.isFinite(state.render.firstPlayableFrameAt)
          && canvas
          && canvas.width > 0
          && canvas.height > 0);
      }, null, { timeout: RESIDENCY_FLIGHT_TIMEOUT_MS }),
      { timeoutMs: RESIDENCY_FLIGHT_TIMEOUT_MS },
    );

    const proof = await awaitVisualProbePhase(phaseTracker, 'sample-started', () => page.evaluate(async ({ inPageAwaitTimeoutMs }) => {
      const traversalPhases = [];
      let activePhase = null;
      const markAwait = (phase, operation) => {
        activePhase = { phase, operation };
        traversalPhases.push({ ...activePhase, atMs: performance.now() });
        window.__SF_REAL_RESIDENCY_TRAVERSAL_PHASE__ = { ...activePhase };
      };
      const awaitStep = async (phase, operation, fn) => {
        markAwait(phase, operation);
        let timer = null;
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(
            new Error(`${phase}/${operation} timed out after ${inPageAwaitTimeoutMs}ms`),
          ), inPageAwaitTimeoutMs);
        });
        try {
          const value = await Promise.race([Promise.resolve().then(fn), timeout]);
          clearTimeout(timer);
          return value;
        } catch (error) {
          clearTimeout(timer);
          throw new Error(`${phase}/${operation}: ${error && error.message ? error.message : String(error)}`);
        }
      };
      const loader = await awaitStep('sample-started', 'import:assetLoader', () => import('/src/render/assetLoader.js'));
      const residencyModule = await awaitStep('sample-started', 'import:assetResidency', () => import('/src/render/assetResidency.js'));
      const renderer = window.SF.state.render.renderer;
      const residency = residencyModule.getAssetResidency(renderer);
      const baseline = residency.canonicalDiagnostics();
      const presentationRoles = new Set([
        'bootstrap',
        'player',
        'player-shell',
        'opening-shell',
        'gameplay-shell',
        'shell',
        'current-sector',
        'runway',
        'glass',
        'whole-ship-lod-family',
        'save-restore-hold',
        'current-interaction',
        'interaction',
        'active-interaction',
        'live-boundary',
        'render-package-instance',
        'flight-render-package-instance',
        'sector-prewarm',
        'sector-prepared-boundary',
        'sector-prepared-live-boundary',
        'preview',
        'warm-previous-sector',
        'in-flight',
        'inflight',
      ]);
      const residencyBudgets = (snapshot) => {
        let cacheOnlyBytes = 0;
        let cacheOnlyResources = 0;
        let cacheOnlyAssets = 0;
        let unexplainedBytes = 0;
        let unexplainedResources = 0;
        let unexplainedAssets = 0;
        for (const asset of snapshot.assets || []) {
          const roles = new Set(asset.roles || []);
          const cacheOnly = roles.size === 1 && roles.has('render-package-cache');
          if (cacheOnly) {
            cacheOnlyBytes += Number(asset.bytes) || 0;
            cacheOnlyResources += Number(asset.resourceCount) || 0;
            cacheOnlyAssets++;
            continue;
          }
          const hasPresentationOwner = [...roles].some((role) => presentationRoles.has(role));
          if (!hasPresentationOwner) {
            unexplainedBytes += Number(asset.bytes) || 0;
            unexplainedResources += Number(asset.resourceCount) || 0;
            unexplainedAssets++;
          }
        }
        return {
          cacheOnlyBytes,
          cacheOnlyResources,
          cacheOnlyAssets,
          unexplainedBytes,
          unexplainedResources,
          unexplainedAssets,
          activePresentationBytes: Math.max(
            0,
            (Number(snapshot.residentBytes) || 0) - cacheOnlyBytes - unexplainedBytes,
          ),
        };
      };
      const settleResidency = async (label) => {
        const renderState = window.SF.state.render;
        const readiness = renderState.pipelinePrecompileReady;
        if (readiness && typeof readiness.then === 'function') {
          try {
            await awaitStep('authored-library-ready', `pipeline-precompile:${label}`, () => readiness);
          } catch (error) {
            const renderSystem = window.SF.registry && window.SF.registry.get('render');
            const summarizePrewarm = (record) => {
              if (!record) return null;
              const boundaryRows = [...(record.boundaryRecords || [])];
              const boundaryStates = {};
              for (const prepared of boundaryRows) {
                const key = prepared?.state || 'UNKNOWN';
                boundaryStates[key] = (boundaryStates[key] || 0) + 1;
              }
              return {
                sectorId: record.sectorId,
                generation: record.generation,
                active: record.active,
                requestCount: record.requests?.length || 0,
                requestKeyCount: record.requestKeys?.size || 0,
                boundaryRevision: record.boundaryRevision,
                boundaryCount: boundaryRows.length,
                boundaryStates,
                boundaryFailures: boundaryRows.filter((prepared) => prepared?.failure || prepared?.error)
                  .slice(0, 8)
                  .map((prepared) => ({
                    id: prepared?.id,
                    state: prepared?.state,
                    failure: prepared?.failure?.message || prepared?.error?.message || null,
                  })),
                liveBoundaryIds: [...(record.liveBoundaryPromises?.keys?.() || [])].slice(0, 12),
                prefetchError: record.prefetchError?.message || null,
                rotationCertificationRequired: record.rotationCertificationRequired === true,
                certificationRevision: record.certification?.boundaryRevision ?? null,
              };
            };
            const residencySnapshot = residency.canonicalDiagnostics();
            const details = {
              label,
              currentSectorId: window.SF.state.world?.currentSectorId || null,
              incoming: summarizePrewarm(renderSystem?._incomingSectorPrewarm),
              pending: summarizePrewarm(renderSystem?._authoredSectorPrewarmPending),
              current: summarizePrewarm(renderSystem?._currentSectorPrewarm),
              pendingRequests: residencySnapshot.pendingRequests,
              sectorAssets: residencySnapshot.assets.filter((asset) => (
                asset.roles.includes('sector-prewarm')
                  || asset.roles.includes('sector-prepared-boundary')
                  || asset.roles.includes('sector-prepared-live-boundary')
              )).slice(0, 12).map((asset) => ({
                key: asset.key,
                roles: asset.roles,
                sectors: asset.sectors,
              })),
              preparationRecords: (() => {
                const rows = typeof renderState.sectorBoundaryPrewarm?.inspect === 'function'
                  ? renderState.sectorBoundaryPrewarm.inspect()
                  : [];
                const states = {};
                for (const row of rows) states[row.state] = (states[row.state] || 0) + 1;
                return { count: rows.length, states, sample: rows.slice(0, 12) };
              })(),
            };
            throw new Error(`${error.message}; prewarm=${JSON.stringify(details)}`);
          }
        }
        const deadline = performance.now() + 2_000;
        while (true) {
          const snapshot = residency.canonicalDiagnostics();
          const boundaryRecords = typeof renderState.sectorBoundaryPrewarm?.inspect === 'function'
            ? renderState.sectorBoundaryPrewarm.inspect()
            : [];
          const activePrewarm = boundaryRecords.some((record) => (
            record && record.active === true
            && ['RESERVED', 'PREPARING', 'PUBLISHING', 'ABORTING'].includes(record.state)
          ));
          if (snapshot.pendingRequests === 0 && !activePrewarm) return snapshot;
          if (performance.now() >= deadline) {
            throw new Error(
              `residency did not quiesce at ${label}: `
              + `pending=${snapshot.pendingRequests}, prewarm=${JSON.stringify(boundaryRecords)}`,
            );
          }
          await awaitStep('sample-started', `residency-settle:${label}`, () => new Promise((resolve) => setTimeout(resolve, 20)));
        }
      };
      const files = [
        { url: 'assets/ships/release/parts/hulls/hull_frigate.glb', slot: 'hull' },
        { url: 'assets/ships/release/parts/places/place_debris_chunk.glb', slot: 'place' },
        { url: 'assets/ships/release/parts/hulls/hull_gunship.glb', slot: 'hull' },
        { url: 'assets/ships/release/parts/places/place_conveyor_barge.glb', slot: 'place' },
        { url: 'assets/ships/release/parts/hulls/hull_multirole.glb', slot: 'hull' },
        { url: 'assets/ships/release/parts/places/place_dead_hulk.glb', slot: 'place' },
        { url: 'assets/ships/release/parts/hulls/hull_capital.glb', slot: 'hull' },
        { url: 'assets/ships/release/parts/places/place_asteroid_seamed.glb', slot: 'place' },
      ];
      const liveSectors = Object.values(window.SF.state.world && window.SF.state.world.sectors || {})
        .filter((sector) => sector && sector.id);
      if (liveSectors.length < 2) throw new Error('live traversal requires at least two authored sectors');
      const worldSystem = window.SF.registry && window.SF.registry.get('world');
      if (!worldSystem || typeof worldSystem.enterSector !== 'function') {
        throw new Error('live traversal requires the registered world.enterSector production seam');
      }
      const samples = [];
      let previousLease = null;
      let previousSector = window.SF.state.world && window.SF.state.world.currentSectorId || 'sector_helios_prime';

      for (let index = 0; index < 30; index++) {
        if (previousLease) previousLease.release('real-runtime-sector-departed');
        const sector = liveSectors[(index + 1) % liveSectors.length];
        const sectorId = sector.id;
        worldSystem.enterSector(sectorId, {
          fromJump: true,
          via: 'residency-traversal',
          fromSectorId: previousSector,
        });
        await settleResidency(`sector-enter:${index}`);
        const lease = loader.createAuthoredAssetLease(renderer, {
          role: 'preview',
          sectorId,
          ownerId: `sector-preview-${sectorId}-${index}`,
        });
        const file = files[index % files.length];
        const record = await awaitStep('sample-started', `preview-load:${index}:${file.url}`, () => lease.load(file.url, {
          slot: file.slot,
          optional: false,
        }));
        if (!record || !record.primitives || record.primitives.length === 0) {
          const runtime = await awaitStep('sample-started', `preview-diagnostics:${index}`, () => loader.getAuthoredAssetRuntimeInfo(renderer));
          throw new Error(`release GLB failed to decode for traversal sector ${index}: ${JSON.stringify(runtime)}`);
        }
        await settleResidency(`preview-load:${index}`);
        const snapshot = residency.canonicalDiagnostics();
        const budget = residencyBudgets(snapshot);
        samples.push({
          sectorId,
          residentBytes: snapshot.residentBytes,
          residentResources: snapshot.residentResources,
          residentAssets: snapshot.residentAssets,
          previewAssets: snapshot.assets.filter((asset) => asset.roles.includes('preview')).length,
          ...budget,
          assetSlot: file.slot,
        });
        previousLease = lease;
        previousSector = sectorId;
      }

      const evictionStartedAt = performance.now();
      previousLease.release('real-runtime-traversal-complete');
      const drainSectorOne = liveSectors[1];
      const drainSectorTwo = liveSectors[2 % liveSectors.length];
      worldSystem.enterSector(drainSectorOne.id, {
        fromJump: true,
        via: 'residency-traversal-drain',
        fromSectorId: previousSector,
      });
      worldSystem.enterSector(drainSectorTwo.id, {
        fromJump: true,
        via: 'residency-traversal-drain',
        fromSectorId: drainSectorOne.id,
      });
      let final = residency.canonicalDiagnostics();
      while (performance.now() - evictionStartedAt <= 2000) {
        const previewAssets = final.assets.filter((asset) => asset.roles.includes('preview'));
        const boundaryRecords = typeof window.SF.state.render.sectorBoundaryPrewarm?.inspect === 'function'
          ? window.SF.state.render.sectorBoundaryPrewarm.inspect()
          : [];
        const activePrewarm = boundaryRecords.some((record) => (
          record && record.active === true
          && ['RESERVED', 'PREPARING', 'PUBLISHING', 'ABORTING'].includes(record.state)
        ));
        if (previewAssets.length === 0 && final.pendingRequests === 0 && !activePrewarm) break;
        await awaitStep('sample-started', 'final-eviction-settle', () => new Promise((resolve) => setTimeout(resolve, 20)));
        final = residency.canonicalDiagnostics();
      }
      return {
        baseline,
        samples,
        final,
        finalBudget: residencyBudgets(final),
        evictionMs: performance.now() - evictionStartedAt,
        traversalPhases,
      };
    }, { inPageAwaitTimeoutMs: RESIDENCY_IN_PAGE_AWAIT_TIMEOUT_MS }).catch((error) => {
      throw new Error(`${error.message}\npage console:\n${pageMessages.slice(-20).join('\n')}`);
    }));
    phaseTracker.mark('sample-complete', { samples: proof.samples.length });

    const warmed = proof.samples.slice(3);
    assert.equal(proof.samples.length, 30, 'real traversal completes thirty live sector cycles');
    assert.ok(proof.traversalPhases.some((entry) => /preview-load:/.test(entry.operation)),
      'real traversal records the awaited release-GLB load phase');
    assert.ok(warmed.some((sample) => sample.assetSlot === 'hull')
      && warmed.some((sample) => sample.assetSlot === 'place'),
    'real traversal rotates both authored ship and place graphs');
    const cacheOnlyBytes = warmed.map((sample) => sample.cacheOnlyBytes);
    const unexplainedBytes = warmed.map((sample) => sample.unexplainedBytes);
    assert.ok(Math.max(...cacheOnlyBytes) <= 64 * 1024 * 1024,
      `cache-only render-package residency stays inside the 64MiB residual budget `
        + `(max=${Math.max(...cacheOnlyBytes)})`);
    assert.ok(Math.max(...unexplainedBytes) <= 64 * 1024 * 1024,
      'unexplained resident bytes stay inside the 64MiB residual budget');
    assert.ok(warmed.every((sample) => sample.previewAssets <= 2),
      'only the current and one warm preview generation remain resident');
    assert.equal(proof.final.assets.some((asset) => asset.roles.includes('preview')), false);
    assert.equal(proof.final.pendingRequests, 0, 'final traversal has no pending decode requests');
    assert.equal(proof.finalBudget.cacheOnlyAssets, 0,
      'final traversal leaves no cache-only render-package package behind');
    assert.ok(proof.finalBudget.cacheOnlyBytes <= 64 * 1024 * 1024,
      'final cache-only render-package bytes stay inside the 64MiB residual budget');
    assert.ok(proof.finalBudget.unexplainedBytes <= 64 * 1024 * 1024,
      'final unexplained resident bytes stay inside the 64MiB residual budget');
    assert.ok(proof.evictionMs <= 2000, `preview eviction recovery took ${proof.evictionMs}ms`);
    assert.ok(proof.final.residentBytes <= proof.baseline.residentBytes,
      'real traversal returns to the mandatory bootstrap baseline');
  } catch (error) {
    probeFailure = error && error.phaseReport ? error : phaseError(error, phaseTracker);
  } finally {
    phaseTracker.start('cleanup-complete', { scope: 'browser-and-server' });
    try {
      if (page) {
        await awaitVisualProbeOperation(phaseTracker, 'page-close', () => closeTraversalResource(page));
      }
      if (browser) {
        await awaitVisualProbeOperation(phaseTracker, 'browser-close', () => closeTraversalBrowser(browser));
      }
      if (server.listening) {
        await awaitVisualProbeOperation(phaseTracker, 'server-close', () => closeTraversalServer(server));
      }
    } catch (error) {
      process.stderr.write(`[asset-residency] cleanup phase failed: ${error.message}\n`);
    } finally {
      phaseTracker.complete('cleanup-complete');
    }
  }
  if (probeFailure) {
    throw new Error(
      `${probeFailure.message}\nprobePhase=${probeFailure.probePhase || 'unknown'}\nphaseReport=${JSON.stringify(phaseTracker.snapshot())}`,
      { cause: probeFailure },
    );
  }
});

async function closeTraversalResource(resource, timeoutMs = 5_000) {
  if (!resource || typeof resource.close !== 'function') return { closed: true };
  let settled = false;
  let closeError = null;
  const closePromise = Promise.resolve()
    .then(() => resource.close())
    .then(() => { settled = true; }, (error) => { settled = true; closeError = error; });
  await Promise.race([closePromise, delay(timeoutMs)]);
  if (closeError) throw closeError;
  return { closed: settled, forced: !settled };
}

async function closeTraversalBrowser(browser, timeoutMs = 5_000) {
  const outcome = await closeTraversalResource(browser, timeoutMs);
  if (outcome.closed) return outcome;
  const processHandle = typeof browser.process === 'function' ? browser.process() : null;
  try { processHandle?.kill?.(); } catch (_) {}
  return { ...outcome, processKilled: !!processHandle };
}

async function closeTraversalServer(server, timeoutMs = 5_000) {
  if (!server?.listening) return { closed: true };
  let settled = false;
  let closeError = null;
  const closePromise = new Promise((resolve) => {
    server.close((error) => {
      settled = true;
      closeError = error || null;
      resolve();
    });
  });
  await Promise.race([closePromise, delay(timeoutMs)]);
  if (closeError) throw closeError;
  if (settled) return { closed: true };
  try { server.closeAllConnections?.(); } catch (_) {}
  return { closed: false, forced: true };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAuthoredLibraryReadyInTest(page, timeoutMs) {
  const result = await page.evaluate(async (limitMs) => {
    const state = window.SF && window.SF.state;
    const render = state && state.render;
    const ready = render && render.authoredPartLibraryReady;
    if (!ready || typeof ready.then !== 'function') {
      return {
        status: 'missing',
        mode: state && state.mode || null,
        hasRenderer: !!(render && render.renderer),
      };
    }
    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: 'timeout' }), Math.max(1, Number(limitMs) || 1));
    });
    const settled = Promise.resolve(ready).then(
      async (library) => {
        try {
          const partsLibrary = await import('/src/render/partsLibrary.js');
          const usable = !!(partsLibrary && typeof partsLibrary.isAuthoredPartLibraryUsable === 'function'
            && partsLibrary.isAuthoredPartLibraryUsable(library));
          return { status: usable ? 'resolved-usable' : 'resolved-unusable' };
        } catch (error) {
          return {
            status: 'resolved-but-uninspectable',
            error: error && error.message ? error.message : String(error),
          };
        }
      },
      (error) => ({
        status: 'rejected',
        error: error && error.message ? error.message : String(error),
      }),
    );
    try {
      return await Promise.race([settled, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }, timeoutMs);
  if (!result || result.status !== 'resolved-usable') {
    throw new Error(`authored library readiness ${result && result.status || 'unknown'}: ${JSON.stringify(result)}`);
  }
  return result;
}
