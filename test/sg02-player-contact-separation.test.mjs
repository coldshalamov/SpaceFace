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

test('a coasting hull transfers finite momentum to a production dynamic rock without penetrating it', async () => {
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
    const records = [owner.records.get(player.id), owner.records.get(rock.id)];
    // Production density normalization, not the nominal spawn mass, owns the
    // actual solver masses. No thrust supplies momentum during this coast.
    const read = rec => {
      const v = rec.body.linvel(), w = rec.body.angvel().y, p = rec.body.translation();
      const mass = rec.body.mass();
      return { x: p.x, z: p.z, vx: v.x, vz: v.z, w, mass,
        energy: .5 * mass * (v.x*v.x + v.z*v.z) + .5 * rec.body.principalInertia().y * w*w };
    };
    const sample = () => records.map(read);
    const momentum = rows => rows.reduce((p, r) => ({ x: p.x+r.mass*r.vx, z: p.z+r.mass*r.vz }), { x: 0, z: 0 });
    const initial = sample(), initialMomentum = momentum(initial);
    const initialEnergy = initial.reduce((sum, r) => sum+r.energy, 0);
    // Check each native step before owner safety processing: a light partner
    // may hit the existing nonplayer contact-delta-v bound, which dissipates
    // momentum. The player must retain the native translational response.
    const momentumTolerance = Math.max(1, Math.hypot(initialMomentum.x, initialMomentum.z)) * 1e-4;
    let contacts = 0, maxMomentumError = 0, maxEnergyRatio = 0, minContactDistance = 0;
    let before, raw, contacted;
    const actualStep = owner.world.step;
    owner.world.step = function (...args) {
      before = sample();
      const result = actualStep.apply(this, args);
      raw = sample(); contacted = false;
      for (const a of records[0].colliders) for (const b of records[1].colliders) {
        this.contactPair(a, b, manifold => {
          if (manifold.numSolverContacts() > 0) contacted = true;
          for (let j = 0; j < manifold.numContacts(); j++) minContactDistance = Math.min(minContactDistance, manifold.contactDist(j));
        });
      }
      return result;
    };
    assert.equal(records[1].spec.dynamic, true);
    assert.ok(initial[1].mass > initial[0].mass, 'the actual field rock is heavier than the hull');
    for (let i = 0; i < 240; i++) {
      sim.step(DT);
      const depth = 30 - Math.hypot(player.pos.x - rock.pos.x, player.pos.z - rock.pos.z);
      assert.ok(depth <= SEPARATION_TOLERANCE,
        `hull center never deeper than ${SEPARATION_TOLERANCE} wu into the rock (depth ${depth.toFixed(2)})`);
      assert.ok(minContactDistance >= -SEPARATION_TOLERANCE, 'native skins stay within the solver penetration tolerance');
      const rows = sample(), p = momentum(raw), prior = momentum(before);
      assert.ok([...rows, ...raw].every(r => Object.values(r).every(Number.isFinite)), 'both native bodies remain finite');
      const error = Math.hypot(p.x-prior.x, p.z-prior.z);
      const ratio = rows.reduce((sum, r) => sum+r.energy, 0) / initialEnergy;
      maxMomentumError = Math.max(maxMomentumError, error); maxEnergyRatio = Math.max(maxEnergyRatio, ratio);
      assert.ok(error <= momentumTolerance, 'the native step transfers equal-and-opposite linear momentum');
      assert.ok(rows.reduce((sum, r) => sum+r.energy, 0) <= raw.reduce((sum, r) => sum+r.energy, 0)*(1+1e-4),
        'owner processing adds no kinetic energy to the native response');
      assert.ok(ratio <= 1+1e-4, 'an unpowered contact creates no pair kinetic energy');
      if (contacted) {
        contacts++;
        assert.equal(rows[0].vx, raw[0].vx, 'player retains native X response to its dynamic partner');
        assert.equal(rows[0].vz, raw[0].vz, 'player retains native Z response to its dynamic partner');
      }
    }
    const final = sample();
    assert.ok(contacts > 0, 'the real native pair has solver contact manifolds');
    assert.ok(final[1].vx < 0 && final[1].energy > 0, 'the rock receives approach momentum and kinetic energy');
    assert.ok(final[0].vx > initial[0].vx, 'the coasting hull supplies that momentum by slowing');
    console.log('DYNAMIC_ROCK_TRANSFER', JSON.stringify({ contacts, initial, final, maxMomentumError, maxEnergyRatio, minContactDistance }));
  } finally { t.sim.dispose(); }
});

test('a light pebble yields through finite equal-and-opposite momentum transfer, not restored player speed', async () => {
  const t = await boot(4747);
  try {
    const { sim, state, player } = t;
    const pebble = sim.spawn({
      type: 'asteroid', pos: { x: 100, z: 0 }, radius: 3, mass: 20, collides: true,
      vel: { x: 0, z: 0 }, hull: 50, data: {},
    });
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    const owner = sim.registry.get('physics')._sg02;
    const records = [owner.records.get(player.id), owner.records.get(pebble.id)];
    const read = rec => {
      const v = rec.body.linvel(), w = rec.body.angvel().y, p = rec.body.translation();
      const mass = rec.body.mass();
      return { x: p.x, z: p.z, vx: v.x, vz: v.z, w, mass,
        energy: .5 * mass * (v.x*v.x + v.z*v.z) + .5 * rec.body.principalInertia().y * w*w };
    };
    const sample = () => records.map(read);
    const momentum = rows => rows.reduce((p, r) => ({ x: p.x+r.mass*r.vx, z: p.z+r.mass*r.vz }), { x: 0, z: 0 });
    const initial = sample(), initialMomentum = momentum(initial);
    const initialEnergy = initial.reduce((sum, r) => sum+r.energy, 0);
    const momentumTolerance = Math.max(1, Math.hypot(initialMomentum.x, initialMomentum.z)) * 1e-4;
    let contacts = 0, maxMomentumError = 0, maxEnergyRatio = 0, minContactDistance = 0;
    let before, raw, contacted;
    const actualStep = owner.world.step;
    owner.world.step = function (...args) {
      before = sample();
      const result = actualStep.apply(this, args);
      raw = sample(); contacted = false;
      for (const a of records[0].colliders) for (const b of records[1].colliders) {
        this.contactPair(a, b, manifold => {
          if (manifold.numSolverContacts() > 0) contacted = true;
          for (let j = 0; j < manifold.numContacts(); j++) minContactDistance = Math.min(minContactDistance, manifold.contactDist(j));
        });
      }
      return result;
    };
    assert.equal(records[1].spec.dynamic, true);
    assert.ok(initial[1].mass < initial[0].mass, 'the production-normalized pebble is lighter than the hull');
    for (let i = 0; i < 240; i++) {
      sim.step(DT);
      assert.ok(minContactDistance >= -SEPARATION_TOLERANCE, 'native skins stay within the solver penetration tolerance');
      assert.ok(player.pos.x > pebble.pos.x, 'the approaching hull never passes through the pebble');
      const rows = sample(), p = momentum(raw), prior = momentum(before);
      assert.ok([...rows, ...raw].every(r => Object.values(r).every(Number.isFinite)), 'both native bodies remain finite');
      const error = Math.hypot(p.x-prior.x, p.z-prior.z);
      const ratio = rows.reduce((sum, r) => sum+r.energy, 0) / initialEnergy;
      maxMomentumError = Math.max(maxMomentumError, error); maxEnergyRatio = Math.max(maxEnergyRatio, ratio);
      assert.ok(error <= momentumTolerance, 'the native pebble momentum comes from the hull');
      // The existing nonplayer safety bound can reduce a small pebble's first
      // response. Test that loss separately from native momentum conservation;
      // neither body may gain energy through owner processing.
      assert.ok(rows.reduce((sum, r) => sum+r.energy, 0) <= raw.reduce((sum, r) => sum+r.energy, 0)*(1+1e-4),
        'owner processing adds no kinetic energy to the native response');
      assert.ok(ratio <= 1+1e-4, 'a coasting debris contact creates no pair kinetic energy');
      if (contacted) {
        contacts++;
        assert.equal(rows[0].vx, raw[0].vx, 'player retains native X response to its dynamic partner');
        assert.equal(rows[0].vz, raw[0].vz, 'player retains native Z response to its dynamic partner');
      }
    }
    const final = sample();
    assert.ok(contacts > 0, 'the native hull/pebble pair actually contacted');
    assert.ok(final[1].vx < 0 && final[1].energy > 0, 'the pebble yields in the approach direction');
    assert.ok(final[0].vx > initial[0].vx, 'the hull loses the momentum transferred to the pebble');
    console.log('PEBBLE_TRANSFER', JSON.stringify({ contacts, initial, final, maxMomentumError, maxEnergyRatio, minContactDistance }));
  } finally { t.sim.dispose(); }
});
