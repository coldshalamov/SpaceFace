// Player contact separation law (SG-02 authority, real Rapier).
//
// The ordinary-contact give bounds how hard a contact may knock the pilot (≤5 WU/s per
// episode, 10% of governed cruise, PLAYER_CONTACT_MAX_CRUISE_FRACTION) — it must never let
// the hull pass through solids. Previously the budgeted branch rewrote the body translation
// to predicted + accepted·dt, cancelling the solver's de-penetration every tick, so a
// sustained push slid the hull clean through fixed bodies. The pose now survives the cap:
// the kick is budgeted, the wall is real.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';

const DT = SIM_DT;
// The solver may hold a hull a couple of wu inside the skin while it depenetrates; a center
// deeper than this inside the surface is a pass-through, not a scrape.
const SEPARATION_TOLERANCE = 4;

async function boot(seed = 4545) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 200, z: 0 }, radius: 14, mass: 32, collides: true,
    vel: { x: -50, z: 0 }, rot: Math.PI, angVel: 0, hull: 200, hullMax: 200, flags: {}, data: {},
  });
  state.playerId = player.id;
  player.isPlayer = true;
  return { sim, state, player };
}

function ship(spec) {
  return {
    type: 'ship', team: 0, pos: { x: 200, z: 0 }, radius: 14, mass: 32, collides: true,
    vel: { x: -50, z: 0 }, rot: Math.PI, angVel: 0, hull: 200, hullMax: 200, flags: {}, data: {},
    ...spec,
  };
}

test('a hull driven into a fixed ball never passes through and stays inside the episode budget', async () => {
  const t = await boot(4545);
  try {
    const { sim, state, player } = t;
    const rock = sim.spawn({
      type: 'asteroid', pos: { x: 0, z: 0 }, radius: 30, mass: 5000, collides: true,
      vel: { x: 0, z: 0 }, hull: 500, data: {},
      physicsBody: { schemaVersion: 1, radius: 30, mass: 5000, inertiaY: 1e6, dynamic: false, shape: 'ball', revision: 0 },
    });
    player.pos.x = 100;
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    const owner = sim.registry.get('physics')._sg02;
    let maxDepth = -Infinity;
    for (let i = 0; i < 240; i++) {
      sim.step(DT);
      // Depth past the body's surface; positive means the center is inside the skin.
      const depth = 30 - Math.hypot(player.pos.x - rock.pos.x, player.pos.z - rock.pos.z);
      if (depth > maxDepth) maxDepth = depth;
      assert.ok(player.pos.x > -30, 'the hull never reaches the far side');
    }
    assert.ok(maxDepth <= SEPARATION_TOLERANCE,
      `center stays within ${SEPARATION_TOLERANCE} wu of the surface, never tunnels (deepest ${maxDepth.toFixed(2)})`);
    const rec = owner.records.get(player.id);
    assert.ok((rec._playerContactCumulativeDeltaV || 0) <= 5 + 1e-6,
      `accepted contact Δv stays inside the 5 WU/s episode ceiling (got ${rec._playerContactCumulativeDeltaV})`);
  } finally { t.sim.dispose(); }
});

test('a hull pushing a production dynamic rock shoves it without ever being inside it', async () => {
  const t = await boot(4646);
  try {
    const { sim, state, player } = t;
    // Ordinary spawn path: a field rock is a dynamic Rapier body (no authored physicsBody).
    const rock = sim.spawn({
      type: 'asteroid', pos: { x: 0, z: 0 }, radius: 30, mass: 5000, collides: true,
      vel: { x: 0, z: 0 }, hull: 500, data: { typeId: 'ast_common_rock' },
    });
    player.pos.x = 120;
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    const owner = sim.registry.get('physics')._sg02;
    const startX = rock.pos.x;
    for (let i = 0; i < 240; i++) {
      sim.step(DT);
      const depth = 30 - Math.hypot(player.pos.x - rock.pos.x, player.pos.z - rock.pos.z);
      assert.ok(depth <= SEPARATION_TOLERANCE,
        `hull center never deeper than ${SEPARATION_TOLERANCE} wu into the rock (depth ${depth.toFixed(2)})`);
    }
    assert.ok(startX - rock.pos.x > 5, `the rock gets pushed (moved ${(startX - rock.pos.x).toFixed(1)} wu)`);
    const rec = owner.records.get(player.id);
    assert.ok((rec._playerContactCumulativeDeltaV || 0) <= 5 + 1e-6,
      `the shove is still budgeted (got ${rec._playerContactCumulativeDeltaV})`);
  } finally { t.sim.dispose(); }
});

test('a light pebble still yields to the hull — the give is not a wall for small debris', async () => {
  const t = await boot(4747);
  try {
    const { sim, state, player } = t;
    sim.spawn({
      type: 'asteroid', pos: { x: 100, z: 0 }, radius: 3, mass: 20, collides: true,
      vel: { x: 0, z: 0 }, hull: 50, data: {},
    });
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    for (let i = 0; i < 240; i++) sim.step(DT);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    assert.ok(speed >= 50 * 0.9 - 0.5, `the pebble never brakes the hull (speed ${speed.toFixed(1)} of 50)`);
  } finally { t.sim.dispose(); }
});
