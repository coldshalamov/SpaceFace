// The opening raid's cause names the hold it actually hit, and only an open wound posts a job.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters, FIRE_READY_HOLD_S } from '../src/systems/encounterDirector.js';
import { aftermathWrecks, causalAftermathForSector } from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { runtime as openingRaid } from '../src/data/encounters/344-opening-hauler-raid.js';
import {
  buildEncounterCausality,
  causalAftermath,
} from '../src/world/encounterCausality.js';

function loadedCarrierSpec(pos, qty, commodityId = 'cmdty_ore_iron') {
  return {
    type: 'ship', team: 2, factionId: 'faction_scn', pos, vel: { x: 0, z: 0 },
    hull: 120, hullMax: 120, radius: 9,
    data: {
      activityActorSlotId: 'helios_starter_ore_carrier',
      worldRecordId: 'wr_starter_world_test_carrier',
      trafficRole: 'hauler',
      factionId: 'faction_scn',
      cargoManifest: qty > 0 ? {
        manifestId: 'fm_starter_world_seam_lot',
        freighterKey: 'wr_starter_world_test_carrier',
        role: 'ore_carrier',
        lines: [{ commodityId, qty }],
        totalQty: qty,
      } : null,
    },
  };
}

function fireOpeningRaid(seed, carrierSpec, { pastReadyHold = false } = {}) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, encounterDirector, aftermathWrecks],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const carrier = carrierSpec ? sim.spawn(carrierSpec) : null;
  const raidPlan = planEncounters(seed, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime'))
    .find((it) => it.shapeId === 'opening_hauler_raid');
  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30;
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120);
  let live = Object.values(dir.live).find((row) => row.shapeId === 'opening_hauler_raid');
  if (!live && pastReadyHold) {
    state.simTime += FIRE_READY_HOLD_S + 2;
    sim.runTicks(120);
    live = Object.values(dir.live).find((row) => row.shapeId === 'opening_hauler_raid');
  }
  return { sim, state, bus, player, carrier, live, director: sim.registry.get('encounterDirector') };
}

function settle(live, state, director, mutate) {
  if (mutate) mutate(live, state);
  openingRaid.tick(director, live, state, state.simTime);
}

function causeFor(state) {
  const causes = causalAftermathForSector(state, 'sector_helios_prime');
  assert.equal(causes.length, 1);
  return causes[0];
}

describe('opening hauler raid cause', { concurrency: false }, () => {
  test('adopting the working barge stamps the counted hold onto the cause and the hull', () => {
    const { sim, state, carrier, live } = fireOpeningRaid(4242, loadedCarrierSpec({ x: 40, z: 30 }, 3));
    assert.ok(live);
    assert.equal(live.causality.motiveId, 'cargo_raid');
    assert.equal(live.causality.actor, 'Reach raid wing');
    assert.equal(live.causality.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(live.causality.freightRole, 'ore_carrier');
    assert.equal(live.causality.totalQty, 3);
    assert.equal(live.causality.commodityId, 'cmdty_ore_iron');
    assert.equal(live.causality.carrierWorldRecordId, 'wr_starter_world_test_carrier');
    assert.equal(live.causality.adoptedWorkingBarge, true);
    assert.match(live.causality.evidence, /fm_starter_world_seam_lot \(3\)/);
    assert.equal(carrier.data.encounterFingerprint, live.causality.fingerprint);
    assert.equal(carrier.data.encounterCausality.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(carrier.data.encounterCausality.fingerprint, live.causality.fingerprint);
    sim.dispose();
  });

  test('a saved hauler is contained and posts no job; flying on and a theft stay open', () => {
    const defended = fireOpeningRaid(4242, loadedCarrierSpec({ x: 40, z: 30 }, 3));
    settle(defended.live, defended.state, defended.director, (live, state) => {
      for (const id of live.ids) {
        const entity = state.entities.get(id);
        if (entity && entity.id !== defended.carrier.id) entity.alive = false;
      }
    });
    assert.equal(defended.live.outcome, 'defended');
    assert.equal(defended.carrier.data.encounterFingerprint, undefined, 'a living release drops the raid fingerprint');
    const defendedCause = causeFor(defended.state);
    assert.equal(defendedCause.status, 'contained');
    assert.equal(defendedCause.consequenceKind, 'economic');
    assert.equal(defendedCause.remedyType, 'cargo_delivery');
    assert.equal(defendedCause.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(defendedCause.adoptedWorkingBarge, true);
    const defendedOffers = [];
    defended.bus.on('mission:offered', (offer) => defendedOffers.push(offer));
    defended.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(defendedOffers.length, 0);
    defended.sim.dispose();

    const flown = fireOpeningRaid(8008, loadedCarrierSpec({ x: 40, z: 30 }, 5));
    flown.live.deadlineAt = flown.state.simTime;
    settle(flown.live, flown.state, flown.director);
    assert.equal(flown.live.outcome, 'raid_over');
    assert.equal(flown.carrier.alive, true);
    assert.equal(flown.carrier.data.encounterFingerprint, undefined);
    const patrol = causeFor(flown.state);
    assert.equal(patrol.status, 'open');
    assert.equal(patrol.consequenceKind, 'security');
    assert.equal(patrol.remedyType, 'patrol_clear');
    assert.equal(patrol.commodityId, 'cmdty_ore_iron');
    assert.notEqual(patrol.remedyType, 'cargo_delivery');
    const patrolOffers = [];
    flown.bus.on('mission:offered', (offer) => patrolOffers.push(offer));
    flown.bus.emit('dock:docked', { stationId: 'station_helios' });
    flown.bus.emit('mission:offerBoarded', {
      offerId: patrolOffers[0] && patrolOffers[0].id,
      source: 'encounterAftermath',
      causeFingerprint: patrol.fingerprint,
    });
    flown.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(patrolOffers.length, 1);
    assert.equal(patrolOffers[0].type, 'patrol_clear');
    assert.match(patrolOffers[0].summary, /fm_starter_world_seam_lot/);
    flown.sim.dispose();

    const robbed = fireOpeningRaid(4242, loadedCarrierSpec({ x: 40, z: 30 }, 3));
    settle(robbed.live, robbed.state, robbed.director, (live, state) => {
      live.data.freightCargoCustody = { terminal: true, raiderEscaped: true };
      for (const id of live.ids) {
        const entity = state.entities.get(id);
        if (entity && entity.id !== robbed.carrier.id) entity.alive = false;
      }
    });
    assert.equal(robbed.live.outcome, 'robbed');
    assert.equal(robbed.carrier.data.encounterFingerprint, undefined);
    const theft = causeFor(robbed.state);
    assert.equal(theft.status, 'open');
    assert.equal(theft.consequenceKind, 'economic');
    assert.equal(theft.remedyType, 'cargo_delivery');
    assert.equal(theft.totalQty, 3);
    assert.match(theft.evidence, /working ore barge/);
    robbed.sim.dispose();
  });

  test('a barge the raid kills keeps the fingerprint, and the cause asks for the wreck', () => {
    const { sim, state, bus, carrier, live, director } = fireOpeningRaid(4242, loadedCarrierSpec({ x: 40, z: 30 }, 12));
    const fingerprint = live.causality.fingerprint;
    settle(live, state, director, () => { carrier.alive = false; });
    assert.equal(live.outcome, 'hauler_destroyed');
    assert.equal(carrier.alive, false);
    assert.equal(carrier.data.encounterFingerprint, fingerprint, 'a dead hull keeps the link the wreck can read');
    assert.equal(carrier.data.encounterCausality.manifestId, 'fm_starter_world_seam_lot');
    const cause = causeFor(state);
    assert.equal(cause.status, 'open');
    assert.equal(cause.consequenceKind, 'wreck');
    assert.equal(cause.remedyType, 'salvage_retrieval');
    assert.equal(cause.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(cause.carrierWorldRecordId, 'wr_starter_world_test_carrier');
    const offers = [];
    bus.on('mission:offered', (offer) => offers.push(offer));
    bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(offers.length, 1);
    assert.equal(offers[0].type, 'salvage_retrieval');
    assert.match(offers[0].summary, /fm_starter_world_seam_lot \(12\)/);

    const wrecks = sim.registry.get('aftermathWrecks');
    const saved = wrecks.serialize();
    wrecks.deserialize(saved);
    const back = causeFor(state);
    assert.equal(back.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(back.adoptedWorkingBarge, true);
    assert.equal(back.status, 'open');
    sim.dispose();
  });

  test('the expired-hold mule is marked as not the working barge and carries fuel cells', () => {
    const { sim, state, carrier, live } = fireOpeningRaid(4242, loadedCarrierSpec({ x: 900, z: -400 }, 3), {
      pastReadyHold: true,
    });
    assert.ok(live);
    assert.equal(live.data.adoptedCarrier == null, true);
    assert.equal(live.ids.includes(carrier.id), false);
    const mule = live.ids.map((id) => state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.ai && entity.data.ai.encounterRole === 'hauler');
    assert.ok(mule && mule.id !== carrier.id);
    assert.equal(live.causality.adoptedWorkingBarge, false);
    assert.equal(live.causality.manifestId, `fm_encounter_${live.id}`);
    assert.equal(live.causality.commodityId, 'cmdty_fuel_cells');
    assert.equal(live.causality.freightRole, 'hauler');
    assert.ok(live.causality.totalQty > 0);
    // Spawn stamps the squad fingerprint before the hold is named. The mule keeps that
    // pre-stamp copy: it is not rewritten as the working ore barge.
    assert.equal(mule.data.encounterFingerprint, live.causality.fingerprint);
    assert.equal(mule.data.encounterCausality.manifestId, undefined);
    assert.equal(mule.data.encounterCausality.adoptedWorkingBarge, undefined);
    assert.match(live.causality.evidence, /hauler already under way/);
    sim.dispose();
  });

  test('an unknown opening-raid outcome records nothing, and other shapes gain no freight fields', () => {
    const opening = buildEncounterCausality({
      seed: 4242, encounterId: 'enc_open', shapeId: 'opening_hauler_raid',
      sectorId: 'sector_helios_prime', zoneId: 'helios_lane',
    });
    opening.manifestId = 'fm_should_not_land';
    opening.totalQty = 4;
    opening.adoptedWorkingBarge = true;
    assert.equal(causalAftermath(opening, 'escaped'), null);
    assert.equal(causalAftermath(opening, 'aborted:no_budget'), null);
    const toll = causalAftermath(buildEncounterCausality({
      seed: 7, encounterId: 'enc_toll', shapeId: 'pirate_toll',
      sectorId: 'sector_helios_prime', zoneId: 'helios_lane',
    }), 'escaped');
    assert.equal(toll.manifestId, undefined);
    assert.equal(toll.adoptedWorkingBarge, undefined);
    assert.equal(toll.remedyType, 'patrol_clear');
    assert.equal(toll.status, 'open');
  });
});
