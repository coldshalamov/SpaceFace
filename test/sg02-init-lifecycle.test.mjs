// SG-02 bring-up lifecycle — the D26 powered-flight pin.
//
// The live flight route used to enter `mode:flight` while the dynamic physics authority was
// still an unresolved promise: the loading route runs at timeScale 0, so no tick could begin the
// async Rapier bring-up; the first unfrozen ticks started it and early-returned until it
// resolved. Held thrust reported healthy demand while speed and displacement stayed exactly 0.
// These tests pin the contract the launch gate now relies on: a step while the owner is pending
// integrates nothing, `prepareBackend` leaves a stepped-ready authority before flight, and a
// discarded init releases the slot so the authority re-initializes instead of pinning flight
// forever on a settled promise.
//
// Commands use writePhysicsControl (continuous force — the same membrane flightV3 writes to),
// not a one-shot impulse: Rapier computes effective mass lazily on the body's first world.step,
// so an impulse delivered on the creation tick would be dropped before any mass exists.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';

const THRUST_FORCE = { x: 0, z: 2400 };

function boot() {
  const bus = createBus();
  const sim = createSimulation({ seed: 260926, bus, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  return { sim, state, player, phys: sim.registry.get('physics') };
}

function thrust(player) {
  writePhysicsControl(player, {
    mode: 'thrust',
    force: THRUST_FORCE,
    source: 'test',
    maxSpeed: 1000,
  });
}

test('a live tick while the authority initializes integrates nothing — the D26 pin window', async () => {
  const { sim, state, player, phys } = boot();
  thrust(player);
  // The first unfrozen flight tick begins async bring-up and returns without stepping the body.
  sim.step(SIM_DT);
  assert.equal(player.vel.z, 0,
    'no writeback may run while the owner is still initializing');
  assert.equal(player.pos.z, 0);

  await phys.prepareBackend(state);
  for (let i = 0; i < 3; i++) {
    thrust(player);
    sim.step(SIM_DT);
  }
  assert.ok(player.vel.z > 0.5,
    `held thrust must produce speed once the authority exists (vel.z=${player.vel.z})`);
});

test('prepareBackend leaves the authority ready so the first flight tick already steps', async () => {
  const { sim, state, player, phys } = boot();
  assert.equal(await phys.prepareBackend(state, { reset: true }), true,
    'the launch gate may enter flight only once the authority reports ready');
  assert.equal(state.physicsRuntime.diagnostics.sg02Ready, true);
  for (let i = 0; i < 3; i++) {
    thrust(player);
    sim.step(SIM_DT);
  }
  assert.ok(player.vel.z > 0.5,
    `a prepared authority integrates commands on the first live ticks (vel.z=${player.vel.z})`);
});

test('a discarded init releases the slot so the authority re-initializes', async () => {
  const { sim, state, player, phys } = boot();
  phys._updateSg02DynamicAuthority(0, state);
  const init = phys._sg02Init;
  assert.ok(init, 'update must start async bring-up');
  // The backend flag flickers off before bring-up resolves: the arriving owner is discarded.
  state.settings.gameplay.physicsBackend = 'custom';
  await init;
  assert.equal(phys._sg02, null);
  assert.equal(phys._sg02Init, null,
    'a discarded init must free the slot — a settled promise here pinned flight forever (D26)');

  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.step(SIM_DT);
  assert.ok(phys._sg02Init, 'the authority must re-initialize once the backend returns');
  await phys._sg02Init;
  assert.ok(phys._sg02, 'the retried bring-up must deliver a live owner');
  for (let i = 0; i < 3; i++) {
    thrust(player);
    sim.step(SIM_DT);
  }
  assert.ok(player.vel.z > 0.5,
    `the recovered authority integrates commands (vel.z=${player.vel.z})`);
});
