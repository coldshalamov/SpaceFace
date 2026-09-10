import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { isSurfaceContactReceipt } from '../src/core/surfaceContact.js';
import { bankShotOffPlate } from '../src/data/arenaModuleLibrary.js';
import { admitStructuralFxCue } from '../src/presentation/cueArbitration.js';
import { CRYO_ARENA_ID, survivalArena } from '../src/systems/survivalArena.js';

function boot(t) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 });
  Object.assign(run, { arenaId: CRYO_ARENA_ID, phase: 'active', wave: 1 });
  const state = { run, tick: 120, simTime: 2, playerId: 1, entities: new Map() };
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on,
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const system = Object.create(survivalArena);
  system.init({ state, bus });
  t.after(() => system.destroy());
  const install = () => bus.emit('run:wavePlanned', {
    wave: 1, plan: { arenaPhase: 'idle', schedule: [] },
  });
  install();
  const plates = system._toys.filter((toy) => toy.kind === 'plate');
  assert.equal(plates.length, 2, 'public wave event installs the authored Cryo plates');
  emitted.length = 0;
  return {
    system, state, bus, emitted, plates, install,
    banks: () => emitted.filter(({ event }) => event === 'combat:bankShot').map(({ payload }) => payload),
    tick() {
      system.update(1 / 60, state);
      state.tick++;
      state.simTime = state.tick / 60;
    },
  };
}

function aimAt(shot, plate, distance = 0, tangent = 0) {
  const n = plate.normal;
  shot.pos = {
    x: plate.pos.x + n.x * distance - n.z * tangent,
    z: plate.pos.z + n.z * distance + n.x * tangent,
  };
  shot.vel = { x: -n.x * 120, z: -n.z * 120 };
  shot.vx = shot.vel.x;
  shot.vz = shot.vel.z;
}

function addShot(h, { id = 10, plate = h.plates[0], distance = 0, tangent = 0 } = {}) {
  const shot = {
    id, type: 'projectile', alive: true, ownerId: h.state.playerId,
    radius: 0.7, mass: 0.1, ttl: 4, data: { ownerId: h.state.playerId, weaponId: 'autocannon' },
  };
  aimAt(shot, plate, distance, tangent);
  h.state.entities.set(id, shot);
  return shot;
}

test('authored plate publishes one causal bank receipt after reflecting the same live shot', (t) => {
  const h = boot(t);
  const shot = addShot(h, { distance: 12 });
  const before = structuredClone(shot);
  const expected = bankShotOffPlate(h.plates[0], shot);
  assert.equal(expected.ok, true);
  const vel = shot.vel;
  const observedVelocity = [];
  h.bus.on('combat:bankShot', () => observedVelocity.push({ ...shot.vel }));
  h.tick();

  assert.deepEqual(h.emitted.map(({ event }) => event), ['combat:bankShot']);
  const [event] = h.banks();
  assert.equal(event.id, shot.id);
  assert.equal(event.projectileId, shot.id);
  assert.equal(event.ownerId, h.state.playerId);
  assert.equal(event.weaponId, shot.data.weaponId);
  assert.equal(event.arenaId, CRYO_ARENA_ID);
  assert.equal(event.plateId, h.plates[0].id);
  assert.equal(event.tick, 120);
  assert.ok(isSurfaceContactReceipt(event.receipt), 'forward the issued receipt, not a lookalike');
  assert.deepEqual(event.receipt, expected.receipt);
  assert.strictEqual(event.pos, event.receipt.point);
  assert.strictEqual(event.normal, event.receipt.normal);
  assert.strictEqual(event.incomingVelocity, event.receipt.velocity);
  assert.deepEqual(event.approach, expected.receipt.velocity);
  assert.deepEqual(event.outgoingVelocity, expected.vel);
  assert.deepEqual(observedVelocity, [expected.vel], 'event observes the committed reflection');
  assert.strictEqual(h.state.entities.get(shot.id), shot);
  assert.strictEqual(shot.vel, vel);
  assert.equal(h.state.entities.size, 1);
  assert.deepEqual(shot, { ...before, vel: expected.vel, vx: expected.vel.x, vz: expected.vel.z });

  const cue = admitStructuralFxCue('combat:bankShot', event, h.state);
  assert.equal(cue.family, 'bank');
  assert.equal(cue.playerCaused, true);
  assert.equal(cue.audioCue, 'combat.causal.bank');
  shot.vel.x = 999;
  shot.pos.x = 999;
  assert.deepEqual(event.outgoingVelocity, expected.vel, 'payload must not alias mutable velocity');
  assert.deepEqual(event.pos, expected.receipt.point);
});

test('remaining on the plate emits once while every original reflection still applies', (t) => {
  const h = boot(t);
  const shot = addShot(h);
  for (let i = 0; i < 6; i++) {
    const expected = bankShotOffPlate(h.plates[0], shot);
    assert.equal(expected.ok, true, 'on-plane contact repeats in the existing solver');
    h.tick();
    assert.deepEqual(shot.vel, expected.vel);
    assert.equal(shot.vx, expected.vel.x);
    assert.equal(shot.vz, expected.vel.z);
  }
  assert.equal(h.banks().length, 1);

  aimAt(shot, h.plates[0], 12);
  shot.vel.x *= -1;
  shot.vel.z *= -1;
  shot.vx = shot.vel.x;
  shot.vz = shot.vel.z;
  assert.equal(bankShotOffPlate(h.plates[0], shot).ok, false);
  h.tick();
  aimAt(shot, h.plates[0], 12);
  h.tick();
  assert.equal(h.banks().length, 1, 'an in-reach miss must not rearm feedback');
});

test('leaving the plate reach rearms a later bank of the same projectile', (t) => {
  const h = boot(t);
  const shot = addShot(h);
  h.tick();
  aimAt(shot, h.plates[0], 200);
  shot.pos.x += 500;
  h.tick();
  assert.equal(h.banks().length, 1);
  aimAt(shot, h.plates[0], 12);
  h.tick();
  assert.equal(h.banks().length, 2);
  assert.equal(h.banks()[1].projectileId, shot.id);
  assert.equal(h.banks()[1].plateId, h.plates[0].id);
  assert.equal(h.banks()[1].tick, 122);
});

test('feedback is independent per projectile and per plate', (t) => {
  const h = boot(t);
  const first = addShot(h, { id: 20 });
  addShot(h, { id: 10 });
  h.tick();
  assert.deepEqual(h.banks().map((event) => event.projectileId), [10, 20]);
  aimAt(first, h.plates[1]);
  h.tick();
  assert.equal(h.banks().length, 3);
  assert.equal(h.banks()[2].projectileId, first.id);
  assert.equal(h.banks()[2].plateId, h.plates[1].id);
});

test('misses, stationary and dead projectiles publish no bank feedback', (t) => {
  const h = boot(t);
  const miss = addShot(h, { id: 10, distance: 12, tangent: h.plates[0].halfWidth + 1 });
  const stationary = addShot(h, { id: 11 });
  stationary.vel = { x: 0, z: 0 };
  stationary.vx = 0;
  stationary.vz = 0;
  const dead = addShot(h, { id: 12 });
  dead.alive = false;
  assert.equal(bankShotOffPlate(h.plates[0], miss).reason, 'miss');
  h.tick();
  assert.deepEqual(h.emitted, []);
});

test('a shutter absorbing the shot before the plate publishes no bank feedback', (t) => {
  const h = boot(t);
  const shot = addShot(h);
  const shutter = h.system._toys.find((toy) => toy.kind === 'shutter');
  const n = h.plates[0].normal;
  // Overlap the existing shutter with the plate to exercise same-tick absorption ordering.
  h.system._installToys({ toys: [
    {
      ...shutter,
      a: { x: shot.pos.x + n.z * 20, z: shot.pos.z - n.x * 20 },
      b: { x: shot.pos.x - n.z * 20, z: shot.pos.z + n.x * 20 },
    },
    h.plates[0],
  ] });
  assert.equal(bankShotOffPlate(h.plates[0], shot).ok, true);
  const before = { ...shot.vel };
  h.tick();
  assert.equal(shot.alive, false);
  assert.deepEqual(shot.vel, before);
  assert.deepEqual(h.emitted, []);
});

test('reinstalling the wave clears old feedback contacts', (t) => {
  const h = boot(t);
  const shot = addShot(h);
  h.tick();
  h.install();
  aimAt(shot, h.plates[0]);
  h.tick();
  assert.equal(h.banks().length, 2);
});
