// A01-03 — the eight drops are drawn, and drawn apart from chips and the repair cell.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualFactory, invalidateVisualFactoryCaches } from '../src/render/visualFactory.js';
import { lootTrailColorFor } from '../src/render/vfx.js';
import { SWARM_DROP_DEFS, SWARM_DROP_KIND } from '../src/data/swarmDrops.js';

globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
test.afterEach(() => invalidateVisualFactoryCaches());

const drop = (dropId, id = 1) => ({
  id, alive: true, type: 'pickup', radius: 5, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
  data: { kind: SWARM_DROP_KIND, dropId, swarmDrop: true, amount: 1 },
});

test('every drop builds its own crystal, hued per drop, with the pickup contract intact', () => {
  const factory = createVisualFactory();
  const hues = new Set();
  for (const def of SWARM_DROP_DEFS) {
    const g = factory.build(drop(def.id));
    assert.equal(g.name, 'SF_SwarmDrop', def.id);
    assert.equal(g.userData.visualLanguage, 'swarm-drop');
    assert.ok(g.userData.gem && g.userData.pickupHalo, 'gem + halo targets');
    hues.add(g.userData.gem.material.emissive.getHexString());
  }
  assert.equal(hues.size, SWARM_DROP_DEFS.length, 'all eight hues differ');
  const repair = factory.build({ ...drop('x'), data: { kind: 'swarm_repair', swarmRepair: true, amount: 1 } });
  assert.notEqual(repair.name, 'SF_SwarmDrop');
});

test('a drop pulls its own loot-trail colour, not ore amber or repair mint', () => {
  const c = lootTrailColorFor(drop('magnet'));
  assert.notEqual(c, '#84ffd2');
  assert.notEqual(c, '#d8a050');
});
