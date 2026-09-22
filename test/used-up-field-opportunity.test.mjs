// After the starter field is used up, another minable field sits within a few minutes
// of cruise, with rocks on the way. Not a slower beam, a smaller hold, or a tax.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import {
  FIELD_USED_UP_DEPLETION,
  NEXT_FIELD_CRUISE_WU_S,
  NEXT_FIELD_FLIGHT_S,
  NEXT_FIELD_HOP_WU,
  NEXT_FIELD_MAX_WU,
  fieldDepletion,
  planUsedUpFieldOpportunity,
  recordFieldExtraction,
} from '../src/systems/fieldDepletion.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { dropAsteroidFieldSector } from '../src/world/asteroidField.js';

const HELIOS = 'sector_helios_prime';
const EMPTY_HAUL_WU = 14000;

function bootWorld(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, world };
}

function liveRocks(state) {
  const out = [];
  for (const entity of state.entityList || []) {
    if (entity && entity.alive !== false && entity.type === 'asteroid' && entity.data && entity.data.yieldU > 0) {
      out.push(entity);
    }
  }
  return out;
}

function useUp(state, fieldId) {
  for (let i = 0; i < 12; i++) {
    recordFieldExtraction(state, { fieldId, sectorId: HELIOS, yieldU: 32 });
  }
  assert.ok(state.fieldDepletion.fields[fieldId].depletion >= FIELD_USED_UP_DEPLETION);
}

test('the placed field is inside a few minutes of cruise and short of the empty haul', () => {
  assert.equal(NEXT_FIELD_CRUISE_WU_S, MISSION_TUNING.cruiseSpeedRef);
  assert.ok(NEXT_FIELD_MAX_WU <= NEXT_FIELD_CRUISE_WU_S * 180);
  const plan = planUsedUpFieldOpportunity({
    from: { x: 720, z: -260 },
    fromRadius: 240,
    toward: { x: -2388, z: 1592 },
    sectorOrigin: { x: 0, z: 0 },
    sectorRadius: 3500,
    seed: 4242,
    fieldId: 'f_helios_starter',
    sectorId: HELIOS,
  });
  assert.ok(plan);
  assert.ok(plan.distanceWU < EMPTY_HAUL_WU, `placed field ${plan.distanceWU} must beat the 14,000 WU haul`);
  assert.ok(plan.distanceWU <= NEXT_FIELD_MAX_WU);
  assert.ok(plan.rocks.some((rock) => rock.role === 'trail'));
  assert.ok(plan.rocks.filter((rock) => rock.role === 'cluster').length >= 3);
  const again = planUsedUpFieldOpportunity({
    from: { x: 720, z: -260 },
    fromRadius: 240,
    toward: { x: -2388, z: 1592 },
    sectorOrigin: { x: 0, z: 0 },
    sectorRadius: 3500,
    seed: 4242,
    fieldId: 'f_helios_starter',
    sectorId: HELIOS,
  });
  assert.deepEqual(again, plan);
});

test('a used-up starter field gains a nearer minable field with rocks on the way', () => {
  const run = (seed) => {
    const h = bootWorld(seed);
    h.world.enterSector(HELIOS, {});
    const starter = (h.state.world.activeSector.fields || []).find((field) => field.id === 'f_helios_starter');
    assert.ok(starter && starter.center, 'Helios materializes the starter field');
    useUp(h.state, starter.id);
    for (const entity of liveRocks(h.state)) entity.alive = false;
    // Authored field rocks idle as dormant records, not entities — "used up" means the
    // dormant stock is gone too, or the world's own used-up guards still see a full belt.
    dropAsteroidFieldSector(h.state, HELIOS);
    assert.equal(liveRocks(h.state).length, 0, 'the local belts are used up');
    h.state.simTime = 90;
    h.state.tick = 300;
    const events = [];
    h.bus.on('field:opportunity', (payload) => events.push(payload));
    const capBefore = h.state.player.cargo.capVolume;
    h.world.update(1 / 60, h.state);
    assert.equal(h.state.player.cargo.capVolume, capBefore, 'the hold is unchanged');
    const rocks = liveRocks(h.state).filter((entity) => entity.data.opportunity === true);
    h.world.destroy && h.world.destroy();
    return { starter, events, rocks };
  };

  const assertRun = (result, seed) => {
    assert.equal(result.events.length, 1, `seed ${seed}: one opportunity event`);
    assert.equal(result.events[0].reason, 'used_up_field');
    assert.ok(result.events[0].distanceWU < EMPTY_HAUL_WU);
    assert.ok(result.events[0].distanceWU <= NEXT_FIELD_MAX_WU);
    assert.ok(result.rocks.length >= 2, 'trail plus cluster');
    const flightS = result.events[0].distanceWU / NEXT_FIELD_CRUISE_WU_S;
    assert.ok(flightS <= NEXT_FIELD_FLIGHT_S, `seed ${seed}: flight ${flightS}s is a few minutes`);

    const distances = result.rocks.map((rock) => Math.hypot(
      rock.pos.x - result.starter.center.x,
      rock.pos.z - result.starter.center.z,
    )).sort((a, b) => a - b);
    assert.ok(distances[0] <= NEXT_FIELD_HOP_WU + 400, 'the first rock is on the way, not a 14,000 WU jump');
    assert.ok(distances[distances.length - 1] < EMPTY_HAUL_WU);
    for (let i = 1; i < distances.length; i++) {
      assert.ok(distances[i] - distances[i - 1] <= NEXT_FIELD_HOP_WU + 400,
        `seed ${seed}: gap ${distances[i] - distances[i - 1]} leaves a dead haul`);
    }
    for (const rock of result.rocks) {
      assert.ok(rock.data.yieldU >= 1);
      assert.ok(rock.hull > 0);
      assert.equal(rock.homeSectorId, HELIOS);
    }
    assert.ok(result.rocks.some((rock) => rock.data.opportunityRole === 'trail'));
    assert.ok(result.rocks.filter((rock) => rock.data.opportunityRole === 'cluster').length >= 3);
  };

  const first = run(4242);
  assertRun(first, 4242);
  assertRun(run(8008), 8008);

  const second = run(4242);
  const pos = (rocks) => rocks.map((rock) => ({
    x: Math.round(rock.pos.x * 1000) / 1000,
    z: Math.round(rock.pos.z * 1000) / 1000,
    yieldU: rock.data.yieldU,
  })).sort((a, b) => (a.x - b.x) || (a.z - b.z));
  assert.deepEqual(pos(second.rocks), pos(first.rocks));

  const saved = fieldDepletion.serialize.call({ state: bootWorld(1).state });
  assert.equal(saved.nextFields, undefined, 'an unused ledger does not grow a next-field blob');
});

test('the onward seam re-materializes after sector eviction; a mined rock stays mined', () => {
  // The nextFields record is durable while the spawned rocks are not: demoting the sector used
  // to strand the record with no rocks and suppress the planner forever. Re-entry must re-place
  // the same deterministic rocks, with the resourceBodies bag suppressing what was mined.
  for (const seed of [4242, 8008]) {
    const h = bootWorld(seed);
    h.world.enterSector(HELIOS, {});
    const starter = (h.state.world.activeSector.fields || []).find((f) => f.id === 'f_helios_starter');
    assert.ok(starter && starter.center, `seed ${seed}: starter field materializes`);
    useUp(h.state, starter.id);
    for (const entity of liveRocks(h.state)) entity.alive = false;
    dropAsteroidFieldSector(h.state, HELIOS);
    h.state.simTime = 90;
    h.state.tick = 300;
    h.world.update(1 / 60, h.state);
    const first = liveRocks(h.state)
      .filter((e) => e.data.opportunity === true)
      .sort((a, b) => String(a.data.asteroidSlotId).localeCompare(String(b.data.asteroidSlotId)));
    assert.ok(first.length >= 2, `seed ${seed}: the seam places rocks`);

    // A rock mined to destruction leaves a durable resource body (the mining touch persists it).
    const mined = first[0];
    mined.alive = false;
    h.world.persistResourceBody(mined);
    const minedSlot = mined.data.asteroidSlotId;

    // The canonical flow perturbs the live spawn stream before re-entry: depletion discovery
    // shrinks the used-up field's rock count, which shifts the rng offset gates re-roll from.
    // Placement must come from the frozen record, not a re-derived plan over drifted gates.
    const disc = h.world._discoveryFor(HELIOS);
    if (disc && disc.fieldsDepleted) disc.fieldsDepleted[starter.id] = 0.96;

    // Sector evicts to record-only, then re-materializes on re-entry.
    h.world._demoteSectorToRecordOnly(HELIOS);
    assert.equal(liveRocks(h.state).filter((e) => e.data.opportunity === true).length, 0,
      `seed ${seed}: eviction clears the live seam`);
    h.world.enterSector(HELIOS, {});

    const back = liveRocks(h.state)
      .filter((e) => e.data.opportunity === true)
      .sort((a, b) => String(a.data.asteroidSlotId).localeCompare(String(b.data.asteroidSlotId)));
    assert.equal(back.length, first.length - 1,
      `seed ${seed}: the seam returns minus the rock that was mined out`);
    assert.ok(!back.some((e) => e.data.asteroidSlotId === minedSlot),
      `seed ${seed}: the mined rock stays mined`);
    const slotPos = (rocks) => rocks.map((e) => ({ slot: e.data.asteroidSlotId, x: e.pos.x, z: e.pos.z }));
    assert.deepEqual(slotPos(back), slotPos(first).filter((p) => p.slot !== minedSlot),
      `seed ${seed}: the same deterministic rocks re-place`);

    // And the planner stays suppressed — no second opportunity, no duplicate rocks.
    const events = [];
    h.bus.on('field:opportunity', (payload) => events.push(payload));
    h.state.tick += 600;
    h.world.update(1 / 60, h.state);
    assert.equal(events.length, 0, `seed ${seed}: the recorded seam does not re-announce`);
    assert.equal(liveRocks(h.state).filter((e) => e.data.opportunity === true).length, back.length,
      `seed ${seed}: no duplicate seam spawns`);
  }
});
