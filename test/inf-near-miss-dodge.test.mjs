// The near miss is remembered (Lane 2 seed: "the near miss rewarded"). A hostile round threading
// past the player inside the near-miss margin, fast enough to have killed, records a stunt the
// street reads — one per window, so a fight is one story, not a bullet count. The indicator,
// bark and crack already carry the moment; this is only the durable notice. Driven through the
// real deedRecord system.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { deedRecord, NEAR_MISS_DODGE_MIN_SPEED, NEAR_MISS_DODGE_WINDOW_S, peekDeedRecord }
  from '../src/systems/deedRecord.js';

function system() {
  const state = { playerId: 'player', tick: 900, simTime: 120, world: { currentSectorId: 'sector_helios_prime' } };
  const sys = Object.create(deedRecord);
  sys.init({ state, bus: createBus(), registry: null });
  return { sys, state };
}

const dodge = (over = {}) => ({
  targetId: 'player', ownerId: 'raider-1', speed: 340, distance: 14,
  pos: { x: 10, z: 0 }, ...over,
});

test('a lethal-speed near miss records one dodge stunt', () => {
  const { sys, state } = system();
  sys._onNearMissDodge(dodge());
  const deeds = peekDeedRecord(state).deeds;
  const stunt = deeds.find((d) => d.kind === 'stunt');
  assert.ok(stunt, 'the dodge is on the Record');
  assert.equal(stunt.id, 'near-miss-dodge:2', 'one stunt per 45 s window');
  assert.equal(stunt.detail.speed, 340);
});

test('a slow round was never a threat: no claim', () => {
  const { sys, state } = system();
  sys._onNearMissDodge(dodge({ speed: NEAR_MISS_DODGE_MIN_SPEED - 20 }));
  assert.equal(peekDeedRecord(state), null, 'the Record stays empty');
});

test('a fight is one story: repeats inside the window dedupe by id', () => {
  const { sys, state } = system();
  sys._onNearMissDodge(dodge());
  sys._onNearMissDodge(dodge({ speed: 420 }));
  const stunts = peekDeedRecord(state).deeds.filter((d) => d.kind === 'stunt');
  assert.equal(stunts.length, 1, 'the window holds one dodge');
});

test('someone else\'s near miss is not yours', () => {
  const { sys, state } = system();
  sys._onNearMissDodge(dodge({ targetId: 'npc-wing' }));
  assert.equal(peekDeedRecord(state), null);
});

test('constants are honest shapes', () => {
  assert.ok(NEAR_MISS_DODGE_MIN_SPEED > 0);
  assert.ok(NEAR_MISS_DODGE_WINDOW_S >= 30);
});
