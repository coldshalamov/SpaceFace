import test from 'node:test';
import assert from 'node:assert/strict';
import { npcTowAllowedInOpening } from '../src/onboarding/openingQuiet.js';

const world = (ob, held = null) => ({
  playerId: 1, onboarding: ob, player: { tether: held == null ? null : { targetId: held } },
  entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
});
const rail = { active: true, finished: false, beatDoneAt: {} };

test('in the opening no NPC tractor takes the body the pilot is latched to, whatever it is', () => {
  assert.equal(npcTowAllowedInOpening(world(rail, 77), { id: 77, pos: { x: 900, z: 0 } }), false);
});

test('in the opening no NPC tractor works within reach of the pilot', () => {
  assert.equal(npcTowAllowedInOpening(world(rail), { id: 5, pos: { x: 300, z: 0 } }), false);
  assert.equal(npcTowAllowedInOpening(world(rail), { id: 5, pos: { x: 2000, z: 0 } }), true);
});

test('after the raid, outside the tutorial and without a state, towing is untouched', () => {
  assert.equal(npcTowAllowedInOpening(world({ ...rail, beatDoneAt: { raid: 1 } }, 77), { id: 77, pos: { x: 10, z: 0 } }), true);
  assert.equal(npcTowAllowedInOpening(world({ finished: true }), { id: 5, pos: { x: 10, z: 0 } }), true);
  assert.equal(npcTowAllowedInOpening({}, { id: 5, pos: { x: 10, z: 0 } }), true);
});
