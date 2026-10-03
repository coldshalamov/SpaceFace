// MACH-08 — a null residency cap is the governor ceiling, and pinned roles stay.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAssetResidencyRegistry,
  residencyEvictionCeiling,
} from '../src/render/assetResidency.js';
import { GOVERNOR_RESIDENCY_BYTE_CEILING } from '../src/render/resourceGovernor.js';

test('null ceiling is the governor constant and a pinned role is not evicted', () => {
  assert.equal(GOVERNOR_RESIDENCY_BYTE_CEILING, 384 * 1024 * 1024);
  assert.equal(residencyEvictionCeiling(null), GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(residencyEvictionCeiling(undefined), GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(residencyEvictionCeiling(Number.NaN), GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(residencyEvictionCeiling(Number.POSITIVE_INFINITY), GOVERNOR_RESIDENCY_BYTE_CEILING);
  assert.equal(residencyEvictionCeiling(1024), 1024);

  let disposals = 0;
  const shell = {
    userData: {},
    byteSize: 4096,
    dispose() { disposals += 1; },
  };
  const pinned = createAssetResidencyRegistry({ maxSoftResidentBytes: 32 });
  pinned.registerAsset('shell:player', [shell]);
  assert.equal(pinned.retain('shell:player', { tag: 'player' }, { role: 'player' }), true);
  assert.equal(disposals, 0);
  assert.equal(pinned.diagnostics().residentAssets, 1);
});
