// One Helios starter-field miner holds the live mining beam on one rock, then stops.
// Seed 4242. Run: node --test test/inference-miner-shift.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { mining } from '../src/systems/mining.js';
import { barkFor } from '../src/data/barks.js';

const DT = 1 / 60;
const REASON = barkFor('faction_dmc', 'patrol-greeting', 1);

function boot() {
  const sim = createSimulation({
    seed: 4242,
    systems: [world, traffic, npcJobsRuntime, mining],
  });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, hull: 100, hullMax: 100,
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector('sector_helios_prime');
  return sim;
}

function stepUntil(sim, pred, maxSteps) {
  for (let i = 0; i < maxSteps; i++) {
    sim.step(DT);
    if (pred()) return true;
  }
  return false;
}

test('seed 4242: one Helios starter miner cuts one rock with the live beam, then stops', () => {
  const sim = boot();
  const locked = [];
  sim.bus.on('mining:beamLocked', (payload) => locked.push(payload));
  const pickupCount = () => sim.state.entityList
    .filter((entity) => entity && entity.alive !== false && entity.type === 'pickup').length;
  const pickupsBefore = pickupCount();

  assert.equal(stepUntil(sim, () => {
    for (const entity of sim.state.entities.values()) {
      if (entity && entity.data && entity.data.minerShiftRockId != null) return true;
    }
    return false;
  }, 30), true, 'a starter miner is commissioned');

  let miner = null;
  for (const entity of sim.state.entities.values()) {
    if (entity && entity.data && entity.data.minerShiftRockId != null) miner = entity;
  }
  const rock = sim.state.entities.get(miner.data.minerShiftRockId);
  assert.ok(rock && rock.data, 'the shift names a live rock');
  assert.equal(rock.data.fieldId, 'f_helios_starter');
  assert.equal(miner.data.trafficRole, 'miner');
  // This focused host has no flight/physics. Place the cutter at the face, rather than
  // accidentally testing the old ability to mine from the refinery hundreds of units away.
  miner.pos.x = rock.pos.x + (rock.radius || 6) + 25;
  miner.pos.z = rock.pos.z;
  const oreBefore = Number(rock.data.oreHP);
  assert.ok(oreBefore > 0, 'the rock starts with ore');

  assert.equal(stepUntil(
    sim,
    () => (miner.data.minerShiftBeamS || 0) > 0,
    40 * 60,
  ), true, 'the beam holds during the shift');

  assert.equal(stepUntil(
    sim,
    () => miner.data.minerShiftActive !== true && (miner.data.minerShiftBeamS || 0) > 0,
    20 * 60,
  ), true, 'the beam stops when the shift ends');

  const beam = miner.data.minerShiftBeamS;
  for (let i = 0; i < 120; i++) sim.step(DT);

  const oreAfter = Number(rock.data.oreHP);
  const pickups = pickupCount() - pickupsBefore;
  const reasons = [];
  for (const entity of sim.state.entities.values()) {
    if (entity && entity.data && entity.data.shiftReason) reasons.push(entity.data.shiftReason);
  }

  assert.equal(miner.data.minerShiftBeamS, beam, 'beam time does not grow after the shift');
  assert.equal(miner.data.minerShiftActive, false);
  assert.ok(beam > 0 && beam <= 6.25, `beam time ${beam} is a bounded shift`);
  assert.ok(oreAfter < oreBefore || pickups > 0, 'the rock lost ore or a pickup appeared');
  assert.equal(reasons.length, 1, 'exactly one reason line');
  assert.equal(reasons[0], REASON);
  assert.equal(locked.length, 0, 'the beam never locks');

  console.log(
    `MINER_SHIFT miner=${miner.id} rock=${rock.id} beam=${beam}`
    + ` ore0=${oreBefore} ore1=${oreAfter} pickups=${pickups} reasons=${reasons.length}`,
  );
});
