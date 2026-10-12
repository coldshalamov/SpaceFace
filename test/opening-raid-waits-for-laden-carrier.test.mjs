import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import {
  encounterDirector, planEncounters, ENCOUNTER_FIRE_READY, FIRE_READY_HOLD_S,
} from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import * as openingRaidModule from '../src/data/encounters/344-opening-hauler-raid.js';

const SEED = 4242;
const RAID = 'opening_hauler_raid';

function harness() {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 180, z: 330 }, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const raidPlan = planEncounters(SEED, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime'))
    .find((it) => it.shapeId === RAID);
  assert.ok(raidPlan, `seed ${SEED}: the opening raid is planned on day 0`);
  const dir = state.encounterDirector;
  const item = { ...raidPlan, sectorId: 'sector_helios_prime', dueAt: 0, defers: 0 };
  dir.pending = [item];
  dir.pressure.combat = 30;
  const liveRaid = () => Object.values(dir.live).find((l) => l && l.shapeId === RAID) || null;
  return { sim, state, dir, item, liveRaid };
}

function withReadiness(fn, body) {
  const had = ENCOUNTER_FIRE_READY.has(RAID);
  const prev = ENCOUNTER_FIRE_READY.get(RAID);
  ENCOUNTER_FIRE_READY.set(RAID, fn);
  try { return body(); } finally {
    if (had) ENCOUNTER_FIRE_READY.set(RAID, prev); else ENCOUNTER_FIRE_READY.delete(RAID);
  }
}

test('the director consumes the opening raid module readiness seam when it is published', () => {
  const published = typeof openingRaidModule.fireReady === 'function'
    || typeof openingRaidModule.openingRaidCarrierReady === 'function';
  assert.equal(ENCOUNTER_FIRE_READY.has(RAID), published);
});

test(`seed ${SEED}: a due opening raid waits for the laden carrier, then fires on it`, () => {
  let laden = false;
  withReadiness(() => laden, () => {
    const { sim, dir, item, liveRaid } = harness();
    sim.runTicks(60 * 30);
    assert.equal(liveRaid(), null, 'no raid while the barge is empty');
    assert.ok(dir.pending.includes(item), 'the raid stays queued, not fizzled');
    assert.ok(Number.isFinite(item.fireReadyHoldSince), 'the hold is on the readiness seam');
    laden = true;
    sim.runTicks(90);
    assert.ok(liveRaid(), 'the raid fires within a pump of the barge loading');
    assert.equal(dir.stats.fireReadyExpired | 0, 0);
  });
});

test(`seed ${SEED}: the hold is bounded; an empty barge cannot cancel the opening fight`, () => {
  withReadiness(() => false, () => {
    const { sim, dir, liveRaid } = harness();
    sim.runTicks(60 * (FIRE_READY_HOLD_S - 5));
    assert.equal(liveRaid(), null);
    sim.runTicks(60 * 10);
    assert.ok(liveRaid(), `the raid fires anyway once ${FIRE_READY_HOLD_S} s of hold elapse`);
    assert.equal(dir.stats.fireReadyExpired, 1);
  });
});

test(`seed ${SEED}: a seam that throws is treated as not ready, never as a crash`, () => {
  withReadiness(() => { throw new Error('boom'); }, () => {
    const { sim, liveRaid } = harness();
    sim.runTicks(60 * 10);
    assert.equal(liveRaid(), null);
  });
});
