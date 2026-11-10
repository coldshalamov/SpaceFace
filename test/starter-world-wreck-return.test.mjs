// The opening raid's barge dies before the cause is filed. A scan at the hulk must already
// name the raid, a partial strip must survive leaving the sector, and New Game must not let
// a recycled id spend the next wreck.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { aftermathWrecks, aftermathForSector } from '../src/systems/aftermathWrecks.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { runtime as openingRaid } from '../src/data/encounters/344-opening-hauler-raid.js';
import { buildWreckScanReveal } from '../src/data/scanReveal.js';

const SECTOR = 'sector_helios_prime';

function loadedCarrierSpec(pos, qty) {
  return {
    type: 'ship', team: 2, factionId: 'faction_scn', pos, vel: { x: 0, z: 0 },
    hull: 120, hullMax: 120, radius: 9,
    data: {
      activityActorSlotId: 'helios_starter_ore_carrier',
      worldRecordId: 'wr_starter_world_test_carrier',
      trafficRole: 'hauler',
      factionId: 'faction_scn',
      name: 'Helios Ore Barge',
      cargoManifest: {
        manifestId: 'fm_starter_world_seam_lot',
        freighterKey: 'wr_starter_world_test_carrier',
        role: 'ore_carrier',
        lines: [{ commodityId: 'cmdty_ore_iron', qty }],
        totalQty: qty,
      },
    },
  };
}

function fireOpeningRaid(seed) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, encounterDirector, aftermathWrecks],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.player = state.player || { flags: {}, credits: 0, cargo: { items: {} } };
  const carrier = sim.spawn(loadedCarrierSpec({ x: 40, z: 30 }, 12));
  const raidPlan = planEncounters(seed, SECTOR, 0, zonesForSector(SECTOR))
    .find((it) => it.shapeId === 'opening_hauler_raid');
  const dir = state.encounterDirector;
  dir.pending = [{ ...raidPlan, dueAt: raidPlan.delay, defers: 0 }];
  dir.pressure.combat = 30;
  state.simTime = raidPlan.delay + 1;
  sim.runTicks(120);
  const live = Object.values(dir.live).find((row) => row.shapeId === 'opening_hauler_raid');
  return {
    sim, state, bus, player, carrier, live,
    director: sim.registry.get('encounterDirector'),
    wrecks: sim.registry.get('aftermathWrecks'),
  };
}

function liveWreck(state, markerId) {
  return (state.entityList || []).find((entity) => entity
    && entity.alive !== false
    && entity.type === 'wreck'
    && entity.data
    && entity.data.markerId === markerId) || null;
}

function scanStory(state, wreck) {
  return buildWreckScanReveal(wreck, state, { origin: wreck.pos, now: state.simTime });
}

describe('opening raid wreck return', { concurrency: false }, () => {
  test('a scan at the hulk names the raid, and a partial strip is what comes back', () => {
    const { sim, state, bus, carrier, live, director, wrecks } = fireOpeningRaid(4242);
    assert.ok(live && live.data.adoptedCarrier);
    const fingerprint = live.causality.fingerprint;
    const raider = live.ids.map((id) => state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.ai && entity.data.ai.encounterRole === 'raider');
    assert.ok(raider);
    // Custody has already emptied the hold in production. The wreck keeps the lot's name
    // and the generic hull scrap, not a second copy of the ore.
    carrier.data.cargoManifest = {
      ...carrier.data.cargoManifest,
      lines: [],
      totalQty: 0,
    };
    carrier.alive = false;
    bus.emit('entity:killed', {
      id: carrier.id,
      killerId: raider.id,
      type: 'ship',
      pos: { ...carrier.pos },
      sectorId: SECTOR,
    });
    openingRaid.tick(director, live, state, state.simTime);
    assert.equal(live.outcome, 'hauler_destroyed');

    const markers = aftermathForSector(state, SECTOR)
      .filter((marker) => marker.freightIdentity && marker.freightIdentity.manifestId === 'fm_starter_world_seam_lot');
    assert.equal(markers.length, 1);
    const marker = markers[0];
    assert.equal(marker.encounterFingerprint, fingerprint);
    assert.equal(marker.cause && marker.cause.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(marker.cause.remedyType, 'salvage_retrieval');
    assert.equal(marker.manifestResidue, null);

    const wreck = liveWreck(state, marker.markerId);
    assert.ok(wreck, 'the kill materializes a hulk before the player leaves');
    assert.equal(wreck.data.causeContract.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(wreck.data.causeContract.carrierWorldRecordId, 'wr_starter_world_test_carrier');
    const here = scanStory(state, wreck);
    assert.equal(here.quality, 'deep');
    assert.match(here.story, /Helios Ore Barge/);
    assert.match(here.story, /Reach raid wing/);
    assert.match(here.story, /cargo_raid/);

    // A salvor replaces the pool object instead of draining the marker's own.
    wreck.data.salvagePool = { cmdty_scrap_metal: 1 };
    const markerId = marker.markerId;
    const firstWreckId = wreck.id;

    bus.emit('sector:exit', { sectorId: SECTOR });
    wreck.alive = false;
    bus.emit('sector:enter', { sectorId: SECTOR });

    const returned = liveWreck(state, markerId);
    assert.ok(returned, 'the same marker comes back');
    assert.notEqual(returned.id, firstWreckId);
    assert.deepEqual(returned.data.salvagePool, { cmdty_scrap_metal: 1 });
    assert.equal(returned.data.causeContract.manifestId, 'fm_starter_world_seam_lot');
    assert.equal(returned.data.provenance.freightIdentity.freighterKey, 'wr_starter_world_test_carrier');
    assert.equal(returned.data.aftermath.freightIdentity.freighterKey, 'wr_starter_world_test_carrier');
    const again = scanStory(state, returned);
    assert.match(again.story, /Reach raid wing/);
    assert.equal(again.salvageHint, 'cmdty_scrap_metal (1u aboard)');

    const saved = JSON.parse(JSON.stringify(wrecks.serialize()));
    assert.equal(saved.runToken, 0);
    wrecks.deserialize(saved);
    bus.emit('sector:enter', { sectorId: SECTOR });
    const loaded = liveWreck(state, markerId);
    assert.ok(loaded);
    assert.deepEqual(loaded.data.salvagePool, { cmdty_scrap_metal: 1 });
    assert.equal(loaded.data.causeContract.remedyType, 'salvage_retrieval');

    loaded.data.salvagePool = {};
    bus.emit('sector:exit', { sectorId: SECTOR });
    loaded.alive = false;
    bus.emit('sector:enter', { sectorId: SECTOR });
    const emptied = liveWreck(state, markerId);
    assert.ok(emptied, 'an emptied hulk is still the place');
    assert.deepEqual(emptied.data.salvagePool, {}, 'exhausted salvage does not refill');
    assert.equal(scanStory(state, emptied).salvageHint, 'picked clean');

    bus.emit('salvage:completed', { wreckId: emptied.id, markerId });
    assert.equal(aftermathForSector(state, SECTOR)
      .some((row) => row.markerId === markerId), false);
    bus.emit('salvage:completed', { wreckId: emptied.id, markerId });
    bus.emit('sector:exit', { sectorId: SECTOR });
    emptied.alive = false;
    bus.emit('sector:enter', { sectorId: SECTOR });
    assert.equal(liveWreck(state, markerId), null, 'a completed wreck does not come back');
    sim.dispose();
  });

  test('New Game on the same instance ignores a stale salvage receipt for a reused id', () => {
    const { sim, state, bus, carrier, live, director, wrecks } = fireOpeningRaid(4242);
    const raider = live.ids.map((id) => state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.ai && entity.data.ai.encounterRole === 'raider');
    carrier.data.cargoManifest = { ...carrier.data.cargoManifest, lines: [], totalQty: 0 };
    carrier.alive = false;
    const killedTick = state.tick || 0;
    bus.emit('entity:killed', {
      id: carrier.id,
      killerId: raider.id,
      type: 'ship',
      pos: { ...carrier.pos },
      sectorId: SECTOR,
    });
    openingRaid.tick(director, live, state, state.simTime);
    const marker = aftermathForSector(state, SECTOR)
      .find((row) => row.freightIdentity && row.freightIdentity.manifestId === 'fm_starter_world_seam_lot');
    assert.ok(marker);
    const wreck = liveWreck(state, marker.markerId);
    assert.ok(wreck);
    const oldMarkerId = marker.markerId;
    const oldWreckId = wreck.id;
    const oldVictimId = carrier.id;
    const oldKillerId = raider.id;
    const oldFingerprint = marker.encounterFingerprint;

    bus.emit('game:newGame', { seed: state.meta.seed });
    assert.equal(aftermathForSector(state, SECTOR).length, 0);
    assert.equal(state.aftermathWrecks.runToken, 1);
    assert.equal(wrecks._spawned.size, 0);

    wreck.alive = false;
    state.entities.delete(oldWreckId);
    state.entityList = state.entityList.filter((entity) => entity.id !== oldWreckId);
    state.freeIds = [oldWreckId];
    state.tick = killedTick;
    const replacement = {
      id: oldVictimId,
      type: 'ship',
      alive: false,
      team: 2,
      pos: { x: 40, z: 30 },
      vel: { x: 0, z: 0 },
      data: { name: 'Replacement Hauler', encounterFingerprint: oldFingerprint },
    };
    state.entities.set(oldVictimId, replacement);
    state.entityList.push(replacement);
    bus.emit('entity:killed', {
      id: oldVictimId,
      killerId: oldKillerId,
      type: 'ship',
      pos: { x: 40, z: 30 },
      sectorId: SECTOR,
    });

    const fresh = aftermathForSector(state, SECTOR);
    assert.equal(fresh.length, 1);
    assert.notEqual(fresh[0].markerId, oldMarkerId, 'the next run does not inherit the raid marker');
    assert.equal(fresh[0].freightIdentity, null);
    const freshWreck = liveWreck(state, fresh[0].markerId);
    assert.ok(freshWreck);
    assert.equal(freshWreck.id, oldWreckId, 'the fixture reused the wreck entity id');
    assert.notEqual(freshWreck.data.causeContract && freshWreck.data.causeContract.manifestId,
      'fm_starter_world_seam_lot');

    bus.emit('salvage:completed', { wreckId: oldWreckId, markerId: oldMarkerId });
    bus.emit('salvage:completed', { wreckId: freshWreck.id, markerId: oldMarkerId });
    assert.equal(aftermathForSector(state, SECTOR).length, 1, 'the previous run cannot spend this wreck');
    assert.equal(liveWreck(state, fresh[0].markerId).id, freshWreck.id);
    sim.dispose();
  });
});
