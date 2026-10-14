// Test verifying initialPoolForMarker respects custom/authored salvage pools and manifest residue correctly
import test from 'node:test';
import assert from 'node:assert/strict';

import { initialPoolForMarker } from '../src/systems/aftermathWrecks.js';

test('initialPoolForMarker preserves custom authored salvage pool on marker', () => {
  const marker = {
    salvagePool: {
      cmdty_rare_mineral: 4,
      cmdty_salvage_electronics: 2,
    },
  };
  const pool = initialPoolForMarker(marker);
  assert.equal(pool.cmdty_rare_mineral, 4);
  assert.equal(pool.cmdty_salvage_electronics, 2);
  assert.equal(pool.cmdty_scrap_metal, undefined);
});

test('initialPoolForMarker uses manifest residue when present', () => {
  const marker = {
    manifestResidue: {
      cmdty_ore_iron: 3,
    },
  };
  const pool = initialPoolForMarker(marker);
  assert.equal(pool.cmdty_ore_iron, 3);
  assert.equal(pool.cmdty_scrap_metal, 1, 'adds +1 hull scrap');
});

test('initialPoolForMarker falls back to role or default pool when no custom pool exists', () => {
  const droneMarker = { victimClass: 'drone_scout' };
  const dronePool = initialPoolForMarker(droneMarker);
  assert.equal(dronePool.cmdty_scrap_metal, 2);
  assert.equal(dronePool.cmdty_ore_iron, 1);

  const defaultMarker = {};
  const defaultPool = initialPoolForMarker(defaultMarker);
  assert.equal(defaultPool.cmdty_scrap_metal, 3);
  assert.equal(defaultPool.cmdty_salvage_electronics, 1);
});
