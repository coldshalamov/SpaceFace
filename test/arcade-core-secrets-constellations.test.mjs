import test from 'node:test';
import assert from 'node:assert/strict';

import { CONTRIBUTOR_CONSTELLATIONS } from '../src/data/constellationLabels.js';
import { buildGalaxyModel } from '../src/ui/galaxyMap.js';

function state() {
  return {
    meta: { seed: 0x47a },
    playerId: 1,
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, rot: 0 }]]),
    world: {
      currentSectorId: 'sector_helios_prime',
      discovery: {},
      sectors: {},
    },
    story: { flags: {} },
  };
}

test('Plan30 contributor constellations are bounded static chart signatures, never destinations', () => {
  assert.equal(CONTRIBUTOR_CONSTELLATIONS.length, 3);
  assert.deepEqual(
    CONTRIBUTOR_CONSTELLATIONS.map((entry) => entry.label),
    ['COLD SHALAMOV', 'SPACEFACE ORCHESTRATOR', 'GFX REMASTER'],
  );
  for (const entry of CONTRIBUTOR_CONSTELLATIONS) {
    assert.equal(entry.interactive, false);
    assert.ok(entry.points.length >= 4);
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.points));
    assert.ok(entry.points.every((point) => Number.isFinite(point.x) && point.x > 0 && point.x < 1
      && Number.isFinite(point.y) && point.y > 0 && point.y < 1));
  }

  const first = buildGalaxyModel(state());
  const second = buildGalaxyModel(state());
  assert.strictEqual(first.constellations, CONTRIBUTOR_CONSTELLATIONS);
  assert.strictEqual(second.constellations, CONTRIBUTOR_CONSTELLATIONS);
  assert.ok(first.nodes.every((node) => !CONTRIBUTOR_CONSTELLATIONS.some((entry) => entry.id === node.id)));
  assert.ok(first.edges.every((edge) => !String(edge.from).startsWith('constellation_')
    && !String(edge.to).startsWith('constellation_')));
});
