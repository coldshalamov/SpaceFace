import test from 'node:test';
import assert from 'node:assert/strict';

import { weapons } from '../src/systems/weapons.js';
import { flightV3 } from '../src/systems/flightV3.js';

// The combat:fire and ship:boost* emit paths hand every listener the same
// module-level receipt record per dispatch depth instead of minting a literal
// per shot. These tests pin the three properties that make that safe:
//   1. sequential emits reuse the record (the allocation the pool exists to remove);
//   2. a nested emit mid-dispatch takes a distinct record, so a listener that
//      synchronously causes another shot cannot rewrite a receipt its own
//      dispatch is still reading;
//   3. the event-bus snapshot contract is re-armed on every emit and freezes
//      the emit-time top level for deferred presentation tails, while nested
//      child refs (origin/from/to) stay emit-unique literals.

function weaponsHarness() {
  const state = {
    mode: 'flight',
    tick: 20,
    simTime: 20 / 60,
    playerId: null,
    player: {},
    input: {},
    combat: { beams: [] },
    entities: new Map(),
    entityList: [],
    entityIndex: { ships: [], weaponShips: [], projectiles: [] },
  };
  const system = Object.create(weapons);
  system.state = state;
  const emitted = [];
  const snapshots = new Map();
  const listeners = [];
  const bus = {
    emit(ev, p) {
      emitted.push({ ev, p });
      for (const fn of listeners) fn(ev, p);
    },
    setPayloadSnapshot(ev, fn) { snapshots.set(ev, fn); },
    onFire(fn) { listeners.push(fn); },
  };
  system.bus = bus;
  system.helpers = { getEntity: (id) => state.entities.get(id) || null };
  system._beamFiring = new Set();
  system._beamFiringPrev = new Set();
  system._beamActiveMeta = new Map();
  return { state, system, bus, emitted, snapshots };
}

const SHIP_A = { id: 'ship-a', pos: { x: 0, z: 0 }, rot: 0, vel: { x: 0, z: 0 }, team: 'a' };
const SHIP_B = { id: 'ship-b', pos: { x: 40, z: 0 }, rot: 1, vel: { x: 0, z: 0 }, team: 'b' };
const DEF_GUN = { id: 'wpn_test_gun', emergentPrimitive: 'sticky', rof: 0 };

test('sequential combat:fire emits reuse one pooled record', () => {
  const { state, system, emitted } = weaponsHarness();
  const w = { defId: DEF_GUN.id, slotIndex: 0, _cooldown: 0 };
  system._serviceEmergent(SHIP_A, w, DEF_GUN, true, 0, state, 0.5);
  w._cooldown = 0;
  system._serviceEmergent(SHIP_A, w, DEF_GUN, true, 0, state, 0.5);
  assert.equal(emitted.length, 2);
  assert.strictEqual(emitted[0].p, emitted[1].p);
  assert.equal(emitted[1].p.ownerId, 'ship-a');
  assert.equal(emitted[1].p.weaponId, DEF_GUN.id);
});

test('a nested combat:fire emit gets a distinct record and the outer receipt survives', () => {
  const { state, system, bus, emitted } = weaponsHarness();
  const w1 = { defId: DEF_GUN.id, slotIndex: 0, _cooldown: 0 };
  const w2 = { defId: DEF_GUN.id, slotIndex: 1, _cooldown: 0 };
  let nested = false;
  bus.onFire(() => {
    if (nested) return;
    nested = true;
    // A listener that synchronously causes another shot (impulseCharges does this
    // in production) must not rewrite the receipt the outer dispatch still holds.
    system._serviceEmergent(SHIP_B, w2, DEF_GUN, true, 0, state, 1.25);
  });
  system._serviceEmergent(SHIP_A, w1, DEF_GUN, true, 0, state, 0.5);
  assert.equal(emitted.length, 2);
  const [outer, inner] = emitted;
  assert.notStrictEqual(outer.p, inner.p);
  assert.equal(outer.p.ownerId, 'ship-a');
  assert.equal(outer.p.dir, 0.5);
  assert.equal(inner.p.ownerId, 'ship-b');
  assert.equal(inner.p.dir, 1.25);
});

test('combat:fire re-arms the bus snapshot each emit; the clone freezes the top level', () => {
  const { state, system, emitted, snapshots } = weaponsHarness();
  const w = { defId: DEF_GUN.id, slotIndex: 0, _cooldown: 0 };
  system._serviceEmergent(SHIP_A, w, DEF_GUN, true, 0, state, 0.5);
  const snapshot = snapshots.get('combat:fire');
  assert.equal(typeof snapshot, 'function');
  const frozen = snapshot(emitted[0].p);
  assert.notStrictEqual(frozen, emitted[0].p);
  assert.equal(frozen.ownerId, 'ship-a');
  assert.equal(frozen.dir, 0.5);
  // Nested children stay emit-unique literals, so the clone keeps the same ref —
  // a deferred tail never sees a later emit's refill through it.
  assert.strictEqual(frozen.origin, emitted[0].p.origin);
  // A second emit refills the same record; the frozen clone keeps the first values.
  w._cooldown = 0;
  system._serviceEmergent(SHIP_A, w, DEF_GUN, true, 0, state, 2.0);
  assert.equal(emitted[0].p.dir, 2.0);
  assert.equal(frozen.dir, 0.5);
});

function flightHarness() {
  const system = Object.create(flightV3);
  const emitted = [];
  const snapshots = new Map();
  const listeners = [];
  const bus = {
    emit(ev, p) {
      emitted.push({ ev, p });
      for (const fn of listeners) fn(ev, p);
    },
    setPayloadSnapshot(ev, fn) { snapshots.set(ev, fn); },
    onEvent(fn) { listeners.push(fn); },
  };
  system.bus = bus;
  return { system, bus, emitted, snapshots };
}

const boostingEntity = (id) => ({ id, boost: {}, flags: { boosting: true } });

test('sequential ship:boostStop emits reuse one pooled record with the right shipId', () => {
  const { system, emitted } = flightHarness();
  system._cancelPlayerBoost(boostingEntity('ship-a'));
  system._cancelPlayerBoost(boostingEntity('ship-b'));
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted.map((m) => m.ev), ['ship:boostStop', 'ship:boostStop']);
  assert.strictEqual(emitted[0].p, emitted[1].p);
  assert.equal(emitted[1].p.shipId, 'ship-b');
});

test('a nested ship:boostStop emit gets a distinct record and the outer receipt survives', () => {
  const { system, bus, emitted } = flightHarness();
  let nested = false;
  bus.onEvent((ev) => {
    if (ev !== 'ship:boostStop' || nested) return;
    nested = true;
    system._cancelPlayerBoost(boostingEntity('ship-b'));
  });
  system._cancelPlayerBoost(boostingEntity('ship-a'));
  assert.equal(emitted.length, 2);
  assert.notStrictEqual(emitted[0].p, emitted[1].p);
  assert.equal(emitted[0].p.shipId, 'ship-a');
  assert.equal(emitted[1].p.shipId, 'ship-b');
});

test('boost receipts re-arm a scalar snapshot clone per emit', () => {
  const { system, emitted, snapshots } = flightHarness();
  system._cancelPlayerBoost(boostingEntity('ship-a'));
  const snapshot = snapshots.get('ship:boostStop');
  assert.equal(typeof snapshot, 'function');
  const frozen = snapshot(emitted[0].p);
  assert.notStrictEqual(frozen, emitted[0].p);
  assert.deepEqual(frozen, { shipId: 'ship-a' });
});
