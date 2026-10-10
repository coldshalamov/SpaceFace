import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetResidencyRegistry,
} from '../src/render/assetResidency.js';

const STALE_MS = 120000;
const PRUNE_MS = 30000;

function gpuResource(label, byteSize = 8) {
  const resource = {
    label,
    userData: {},
    byteSize,
    dispose() {},
  };
  return resource;
}

function clock() {
  let t = 1000;
  return {
    now: () => t,
    advance(ms) { t += ms; },
  };
}

function sectorsOf(registry, key) {
  const row = registry.diagnostics().assets.find((a) => a.key === key);
  return row ? row.sectors : null;
}

function drain(iterator) {
  if (!iterator) return null;
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

test('warm-arm claims lapse at the horizon on ALL four exit-warm mint sites; live rows never lapse', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:warm', [gpuResource('w')], { byteSize: 8 });
  registry.registerAsset('k:live', [gpuResource('l')], { byteSize: 8 });
  const warmArm = { type: 'warm-arm' };
  const boundary = { type: 'boundary' };
  assert.equal(registry.retain('k:warm', warmArm, { role: 'warm-sector-decode', sectorId: 'X' }), true);
  assert.equal(registry.retain('k:live', boundary, { role: 'live-boundary', sectorId: 'X' }), true);
  t.advance(STALE_MS + 10000);

  // prepareSectorExit: only the live row qualifies — the arm that posted k:warm
  // never re-posted, while the mounted boundary's row presence is the claim.
  assert.equal(registry.prepareSectorExit('X'), 1);
});

test('warm-arm lapse gated on rotateSector + rotateSectorDeferred, not just prepares', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:warm', [gpuResource('w')], { byteSize: 8 });
  registry.registerAsset('k:live', [gpuResource('l')], { byteSize: 8 });
  const warmArm = { type: 'warm-arm' };
  const boundary = { type: 'boundary' };
  registry.retain('k:warm', warmArm, { role: 'warm-sector-decode', sectorId: 'X' });
  registry.retain('k:live', boundary, { role: 'live-boundary', sectorId: 'X' });

  // Park in X, age the claims, then rotate away — the sync rotate's warm mint
  // must apply the same claim gate as the prepares.
  assert.equal(registry.rotateSector('X'), true);
  t.advance(STALE_MS + 10000);
  assert.equal(registry.rotateSector('Y'), true);
  assert.equal(
    registry.diagnostics().assets.find((a) => a.key === 'k:warm').roles.includes('warm-previous-sector'),
    false,
    'lapsed warm claim must not ride the rotate hold',
  );
  assert.equal(
    registry.diagnostics().assets.find((a) => a.key === 'k:live').roles.includes('warm-previous-sector'),
    true,
    'live claim rides the rotate hold',
  );

  // Same gate on the deferred twin: park in Z, age, drain the deferred rotate.
  const t2 = clock();
  const registry2 = createAssetResidencyRegistry({ now: t2.now });
  registry2.registerAsset('k:warm', [gpuResource('w2')], { byteSize: 8 });
  registry2.registerAsset('k:live', [gpuResource('l2')], { byteSize: 8 });
  const warmArm2 = { type: 'warm-arm-2' };
  const boundary2 = { type: 'boundary-2' };
  registry2.retain('k:warm', warmArm2, { role: 'warm-sector-decode', sectorId: 'Z' });
  registry2.retain('k:live', boundary2, { role: 'live-boundary', sectorId: 'Z' });
  assert.equal(registry2.rotateSector('Z'), true);
  t2.advance(STALE_MS + 10000);
  const it = registry2.rotateSectorDeferred('W');
  assert.ok(it && typeof it.next === 'function', 'deferred rotate returns an iterator for a real mint');
  drain(it);
  assert.equal(
    registry2.diagnostics().assets.find((a) => a.key === 'k:warm').roles.includes('warm-previous-sector'),
    false,
    'lapsed warm claim must not ride the deferred rotate hold',
  );
  assert.equal(
    registry2.diagnostics().assets.find((a) => a.key === 'k:live').roles.includes('warm-previous-sector'),
    true,
    'live claim rides the deferred rotate hold',
  );
});

test('deferred prepare sweep applies the same gate', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:warm', [gpuResource('w')], { byteSize: 8 });
  registry.registerAsset('k:live', [gpuResource('l')], { byteSize: 8 });
  registry.retain('k:warm', { type: 'warm-arm' }, { role: 'warm-sector-decode', sectorId: 'X' });
  registry.retain('k:live', { type: 'boundary' }, { role: 'live-boundary', sectorId: 'X' });
  t.advance(STALE_MS + 10000);
  const retained = drain(registry.prepareSectorExitDeferred('X'));
  assert.equal(retained, 1, 'only the live claim joins the deferred exit cohort');
});

test('same-sid warm re-posts prune lapsed union members (amortized)', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:warm', [gpuResource('w')], { byteSize: 8 });
  const warmArm = { type: 'warm-arm' };
  registry.retain('k:warm', warmArm, { role: 'warm-sector-decode', sectorId: 'A' });
  assert.equal(registry.reclaimWarm('k:warm', warmArm, 'B'), true);
  assert.deepEqual(sectorsOf(registry, 'k:warm'), ['A', 'B']);

  // Age both members past the claim horizon, then re-post A past the prune
  // interval — the live re-post sweeps B out of the union and its index row.
  t.advance(STALE_MS + PRUNE_MS + 10000);
  assert.equal(registry.reclaimWarm('k:warm', warmArm, 'A'), true);
  assert.deepEqual(sectorsOf(registry, 'k:warm'), ['A'], 'lapsed member B pruned on the re-post');
  assert.equal(registry.prepareSectorExit('B'), 0, 'pruned member no longer qualifies for B');
});

test('claim lapse-ability follows the POSTING class, not the stored row role', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:shared', [gpuResource('s')], { byteSize: 8 });
  registry.registerAsset('k:cache', [gpuResource('c')], { byteSize: 8 });
  registry.registerAsset('k:req2', [gpuResource('r2')], { byteSize: 8 });
  const sharedOwner = { type: 'session-owner' };
  const decodeOwner = { type: 'decode-cache-owner' };

  // Vector 1 — reclaimWarm posts arm demand onto a runtime-cache-minted shared
  // row: the arm claim must lapse while the row's own live claim survives.
  registry.retain('k:shared', sharedOwner, { role: 'runtime-cache', sectorId: 'A' });
  assert.equal(registry.reclaimWarm('k:shared', sharedOwner, 'B'), true);

  // Vector 2 — a decodeWarm retain on the decode-cache owner is arm provenance
  // even though the row's role is non-arm.
  registry.retain('k:cache', decodeOwner, { role: 'decode-cache', sectorId: 'C', decodeWarm: true });

  // Vector 3 — a non-warm request racing a reclaim consult propagates the
  // consult's arm claim at commit, not a live one keyed to the request role.
  const request = registry.beginRequest('k:req2', sharedOwner, { role: 'runtime-cache' });
  registry.reclaimWarm('k:req2', sharedOwner, 'D');
  assert.equal(request.commit(), true);

  t.advance(STALE_MS + 10000);
  assert.equal(registry.prepareSectorExit('B'), 0, 'arm post on a shared row lapses');
  assert.equal(registry.prepareSectorExit('A'), 1, "the row's own live claim survives");
  assert.equal(registry.prepareSectorExit('C'), 0, 'decodeWarm claim lapses with the arm');
  assert.equal(registry.prepareSectorExit('D'), 0, 'reclaim stamp on a racing request lapses');
});

test('request claims pending past the horizon commit clamped to it — not born lapsed', () => {
  const t = clock();
  const registry = createAssetResidencyRegistry({ now: t.now });
  registry.registerAsset('k:req', [gpuResource('r')], { byteSize: 8 });
  const arm = { type: 'warm-arm' };
  const request = registry.beginRequest('k:req', arm, { role: 'warm-sector-decode', sectorId: 'C' });
  registry.reclaimWarm('k:req', arm, 'D');
  t.advance(STALE_MS + 10000);
  assert.equal(request.commit(), true);

  // At mint the propagated stamps sit at the horizon: still fresh (<=), so the
  // committed arm row qualifies — the lapsed window starts now, not 130s ago.
  assert.equal(registry.prepareSectorExit('C'), 1);
  // And it lapses normally once that horizon passes — the clamp does not mint
  // an immortal claim.
  t.advance(5000);
  assert.equal(registry.prepareSectorExit('D'), 0, 'arm-provenance claim lapses normally after commit');
});
