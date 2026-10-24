// SEED-SW-20 — Plasma Cone: a short-range shotgun breath — one trigger, five thermal bolts
// inside a narrow forward cone that die young. Authored: >=5-bolt fan, thermal channel, short
// authored range — not a mid-range beam.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { weapons } from '../src/systems/weapons.js';
import { emitVolley } from '../src/combat/attackPropagation.js';
import { createLineage, resetLineageIds } from '../src/combat/attackLineage.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_plasma_cone_s');

test('plasma cone is a catalogued gun on the swarm shelf', () => {
  assert.ok(DEF);
  assert.equal(SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id)?.id, 'plasma_cone');
});

test('one trigger emits at least five thermal bolts inside a short cone', () => {
  const owner = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, team: 'player', data: {} };
  const state = { tick: 5, simTime: 0, playerId: 'player', entities: new Map(), entityList: [], entityIndex: null, spatialHash: null };
  const w = { defId: DEF.id, slotIndex: 0 };
  const host = { state, helpers: {}, bus: { emit: () => {} }, _attackQueryScratch: [] };
  const spec = weapons._attackSpecFor.call(host, w, DEF, state, owner);
  assert.ok(spec.emitter.rootCount >= 5, `rootCount ${spec.emitter.rootCount}`);
  assert.equal(spec.emitter.spreadDeg, 44);
  resetLineageIds(SEED);
  const volley = emitVolley(spec, createLineage({ spec, createdTick: 5, sourceEntityId: 'player' }));
  assert.ok(volley.emitted.length >= 5, `emitted ${volley.emitted.length} (suppressed: ${JSON.stringify(volley.suppressed)})`);
  // A cone, not a line: the outer bolts sit within ±spreadDeg/2 of the aim line.
  const offsets = volley.emitted.map((r) => r.offsetDeg);
  assert.equal(Math.max(...offsets), 22);
  assert.equal(Math.min(...offsets), -22);
  // Short-range, thermal: authored range reads like a breath weapon and the packet is heat.
  assert.ok(DEF.range <= 200, `authored range ${DEF.range}`);
  assert.equal(DEF.damageType, 'thermal');
});
