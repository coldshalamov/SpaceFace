import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrucibleWarmPackageResidency } from '../src/render/crucibleWarmPackageResidency.js';

// Ledger D21 — the bounded roster warm instantiated census packages with no live owner retain,
// so a cache/bootstrap-only package threw "must be retained before creating an instance" and the
// roster paid full acquire on first spawn. The warm path now retains under a dedicated owner,
// re-acquires a stale package through the normal loader, and releases the owner at teardown.

test('a cache/bootstrap-only package is retained before createInstance and released on teardown', async () => {
  const calls = [];
  const pkg = {
    retain(owner, meta) { calls.push(['retain', owner, meta]); return true; },
    createInstance(options) {
      calls.push(['createInstance', options]);
      return { root: { name: 'root' }, dispose() {} };
    },
  };
  const released = [];
  const residency = {
    releaseOwner: (owner, reason) => released.push([owner, reason]),
  };
  const warm = createCrucibleWarmPackageResidency({ residency, profile: 'crucible' });
  const record = { renderPackage: pkg, assetId: 'sf.render.kestrel' };
  const kept = await warm.retainForInstance(
    { record, url: 'parts/kestrel.glb', slot: 'hull' },
    { loadPart: () => { throw new Error('retained package must not reload'); }, sectorId: 'sec' },
  );
  assert.equal(kept, record);
  assert.equal(warm.retained, true);
  pkg.createInstance(warm.instanceOptions({ name: 'SF_CrucibleWarm_kestrel', residencyRole: 'crucible-roster-warm' }));
  const kinds = calls.map(([kind]) => kind);
  assert.ok(kinds.indexOf('retain') < kinds.indexOf('createInstance'), 'retain must precede createInstance');
  assert.equal(calls[0][1], warm.owner, 'retain runs under the dedicated warm owner');
  assert.equal(calls[1][1].residencyOwner, warm.owner, 'instance retains under the same owner');
  warm.release('render-boundary-disposed');
  assert.equal(released.length, 1);
  assert.equal(released[0][0], warm.owner, 'teardown releases the dedicated warm owner');
  assert.equal(warm.retained, false);
});

test('a released package re-acquires through the normal loader instead of skipping', async () => {
  const stale = {
    retain() { return false; },   // released/evicted — package owner is gone
    createInstance() { throw new Error('must be retained before creating an instance'); },
  };
  const freshPkg = {
    retain() { return true; },
    createInstance() { return { root: {}, dispose() {} }; },
  };
  const freshRecord = { renderPackage: freshPkg, assetId: 'sf.render.kestrel' };
  const loads = [];
  const warm = createCrucibleWarmPackageResidency({ residency: { releaseOwner() {} } });
  const kept = await warm.retainForInstance(
    { record: { renderPackage: stale, assetId: 'sf.render.kestrel' }, url: 'parts/kestrel.glb', slot: 'hull' },
    { loadPart: async (url, options) => { loads.push([url, options]); return freshRecord; }, sectorId: 'sec' },
  );
  assert.equal(kept, freshRecord, 'the re-acquired record replaces the stale census record');
  assert.equal(loads.length, 1);
  assert.equal(loads[0][0], 'parts/kestrel.glb');
  assert.equal(loads[0][1].residencyOwner, warm.owner, 're-acquire retains under the warm owner');
  assert.equal(loads[0][1].residencyRole, 'crucible-roster-warm');
  assert.equal(warm.retained, true);
});

test('a failed re-acquire keeps the stale record so the warm warn path still reports it', async () => {
  const stale = { retain() { return false; }, createInstance() { throw new Error('gone'); } };
  const record = { renderPackage: stale, assetId: 'sf.render.kestrel' };
  const warm = createCrucibleWarmPackageResidency({ residency: null });
  const kept = await warm.retainForInstance(
    { record, url: 'parts/kestrel.glb', slot: '*' },
    { loadPart: async () => null, sectorId: null },
  );
  assert.equal(kept, record);
  assert.equal(warm.retained, false);
});
