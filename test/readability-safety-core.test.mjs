import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runMaterialSharingContractProbe,
  shouldBuildReadabilitySafetyCore,
} from '../src/render/partsLibrary.js';

test('emergency silhouette geometry is absent when an authored hull exists', () => {
  assert.equal(shouldBuildReadabilitySafetyCore({ wholeShip: true, authoredHullLevelCount: 1 }), false);
  assert.equal(shouldBuildReadabilitySafetyCore({ wholeShip: false, authoredHullLevelCount: 2 }), false);
  assert.equal(shouldBuildReadabilitySafetyCore({ wholeShip: false, authoredHullLevelCount: 0 }), true);
});

test('fallback readability material remains constructible and shared', () => {
  const result = runMaterialSharingContractProbe();
  assert.equal(result.readabilityShellMerged, true);
});
