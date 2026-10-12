// The Helios tally bark is not the record. A counted hold stays on the traffic save.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { traffic, heliosFreightTallies } from '../src/systems/traffic.js';

const TALLY = sectorLocalToGlobalForSector({ x: 120, z: 180 }, 'sector_helios_prime');

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.simTime = 10;
  const station = sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 1280, z: -420 }, radius: 80,
    data: { stationId: 'station_helios', factionId: 'faction_scn' },
  });
  // createSimulation forks the system. Runtime fields live on the fork, not the export.
  return { sim, state, bus, station, traffic: sim.registry.get('traffic') };
}

function bargeAtTally(sim, manifest) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: TALLY.x, z: TALLY.z }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 120, hullMax: 120, radius: 9,
    data: {
      defId: 'ship_ironback',
      trafficRole: 'ore_carrier',
      activityActorSlotId: 'helios_starter_ore_carrier',
      worldRecordId: 'wr_tally_barge',
      cargoManifest: manifest,
    },
  });
}

function manifest(id, qty, commodityId = 'cmdty_ore_iron') {
  return {
    manifestId: id,
    freighterKey: 'wr_tally_barge',
    role: 'ore_carrier',
    lines: qty > 0 ? [{ commodityId, qty }] : [],
    totalQty: qty,
  };
}

describe('Helios freight tally ledger', { concurrency: false }, () => {
  test('a still laden barge records one tally, and the same manifest does not double', () => {
    const { sim, state, bus, station, traffic: lanes } = boot();
    const entity = bargeAtTally(sim, manifest('fm_counted_hold', 4));
    const rec = { role: 'ore_carrier', dockSeq: 0, tallyManifestId: null, tallyHoldSince: null };
    const events = [];
    bus.on('traffic:freightTallied', (payload) => events.push(payload));

    lanes._stepHeliosOreCarrier(entity, rec, [station], state);
    assert.equal(events.length, 0, 'the count takes the full still-hold');
    assert.deepEqual(heliosFreightTallies(state), []);

    state.simTime += 6;
    lanes._stepHeliosOreCarrier(entity, rec, [station], state);
    assert.equal(events.length, 1);
    assert.equal(events[0].manifestId, 'fm_counted_hold');
    assert.equal(events[0].commodityId, 'cmdty_ore_iron');
    assert.equal(events[0].totalQty, 4);
    assert.equal(events[0].destinationId, 'station_helios');
    const rows = heliosFreightTallies(state);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].manifestId, 'fm_counted_hold');
    assert.equal(rows[0].carrierWorldRecordId, 'wr_tally_barge');
    assert.equal(rows[0].commodityId, 'cmdty_ore_iron');
    assert.equal(rows[0].totalQty, 4);
    assert.equal(rows[0].destinationId, 'station_helios');
    assert.equal(rows[0].sectorId, 'sector_helios_prime');
    assert.equal(rows[0].simTime, 16);
    assert.equal(rows[0].disposition, 'counted');
    assert.equal(rows[0].dispositionSimTime, undefined);

    state.simTime += 6;
    lanes._stepHeliosOreCarrier(entity, rec, [station], state);
    assert.equal(events.length, 1, 'a counted manifest is not counted again');
    assert.equal(heliosFreightTallies(state).length, 1);
    sim.dispose();
  });

  test('an empty barge writes no tally', () => {
    const { sim, state, bus, station, traffic: lanes } = boot();
    const entity = bargeAtTally(sim, manifest('fm_empty', 0));
    const rec = { role: 'ore_carrier', dockSeq: 0, tallyManifestId: null, tallyHoldSince: null };
    let events = 0;
    bus.on('traffic:freightTallied', () => { events += 1; });
    lanes._stepHeliosOreCarrier(entity, rec, [station], state);
    state.simTime += 8;
    lanes._stepHeliosOreCarrier(entity, rec, [station], state);
    assert.equal(events, 0);
    assert.deepEqual(heliosFreightTallies(state), []);
    assert.equal(lanes.serialize().heliosFreightTallies, undefined);
    sim.dispose();
  });

  test('the ledger caps at eight, round-trips, and a new game starts clear', () => {
    const { sim, state, traffic: lanes } = boot();
    const entity = { data: { worldRecordId: 'wr_tally_barge' } };
    for (let i = 1; i <= 9; i++) {
      state.simTime = i;
      lanes._rememberHeliosFreightTally(entity, manifest(`fm_${i}`, i), 'cmdty_ore_iron');
    }
    const live = heliosFreightTallies(state);
    assert.deepEqual(live.map((row) => row.manifestId), [
      'fm_2', 'fm_3', 'fm_4', 'fm_5', 'fm_6', 'fm_7', 'fm_8', 'fm_9',
    ]);

    lanes._rememberHeliosFreightTally(entity, manifest('fm_9', 99), 'cmdty_ore_iron');
    assert.equal(heliosFreightTallies(state).length, 8, 'a repeated manifest id does not append');
    assert.equal(heliosFreightTallies(state).at(-1).totalQty, 9);

    const saved = lanes.serialize();
    assert.equal(saved.heliosFreightTallies.length, 8);
    delete state.traffic.heliosFreightTallies;
    lanes.deserialize(saved);
    assert.deepEqual(heliosFreightTallies(state).map((row) => row.manifestId), live.map((row) => row.manifestId));

    lanes.deserialize({
      schema: saved.schema,
      heliosFreightTallies: [
        { manifestId: 'fm_keep', totalQty: 2, commodityId: 'cmdty_ore_iron', simTime: 3 },
        { manifestId: '', totalQty: 5 },
        { totalQty: 0, manifestId: 'fm_zero' },
        null,
        { manifestId: 'fm_keep', totalQty: 8, commodityId: 'cmdty_ore_nickel' },
      ],
    });
    const restored = heliosFreightTallies(state);
    assert.equal(restored.length, 1);
    assert.equal(restored[0].manifestId, 'fm_keep');
    assert.equal(restored[0].totalQty, 2);
    assert.equal(restored[0].sectorId, 'sector_helios_prime');

    lanes.deserialize({ schema: 'not-a-traffic-save', heliosFreightTallies: saved.heliosFreightTallies });
    assert.deepEqual(heliosFreightTallies(state), []);

    lanes._rememberHeliosFreightTally(entity, manifest('fm_before_new', 1), 'cmdty_ore_iron');
    assert.equal(heliosFreightTallies(state).length, 1);
    lanes.newGame();
    assert.deepEqual(heliosFreightTallies(state), []);
    assert.equal(lanes.serialize().heliosFreightTallies, undefined);
    sim.dispose();
  });

  test('a counted hold closes once, as delivered or lost, and the other outcome cannot reopen it', () => {
    const delivered = boot();
    const deliveredHold = manifest('fm_docked_hold', 4);
    const deliveredBarge = bargeAtTally(delivered.sim, deliveredHold);
    const deliveredRec = { role: 'ore_carrier', id: deliveredBarge.id, dockSeq: 0, tallyManifestId: null, tallyHoldSince: null };
    delivered.state.simTime = 10;
    delivered.traffic._stepHeliosOreCarrier(deliveredBarge, deliveredRec, [delivered.station], delivered.state);
    delivered.state.simTime = 16;
    delivered.traffic._stepHeliosOreCarrier(deliveredBarge, deliveredRec, [delivered.station], delivered.state);
    assert.equal(delivered.traffic._emitArrival(deliveredBarge, deliveredRec, delivered.station, { manifest: deliveredHold }), true);
    let row = heliosFreightTallies(delivered.state)[0];
    assert.equal(row.disposition, 'delivered');
    assert.equal(row.dispositionSimTime, 16);
    deliveredBarge.data.cargoManifest = deliveredHold;
    delivered.traffic._onEntityKilled({ id: deliveredBarge.id, type: 'ship', pos: { ...deliveredBarge.pos } });
    row = heliosFreightTallies(delivered.state)[0];
    assert.equal(row.disposition, 'delivered', 'a later destruction does not un-deliver a hold that already docked');
    assert.equal(row.dispositionSimTime, 16);
    const deliveredSaved = delivered.traffic.serialize();
    delete delivered.state.traffic.heliosFreightTallies;
    delivered.traffic.deserialize(deliveredSaved);
    assert.equal(heliosFreightTallies(delivered.state)[0].disposition, 'delivered');
    assert.equal(heliosFreightTallies(delivered.state)[0].dispositionSimTime, 16);
    delivered.sim.dispose();

    const lost = boot();
    const lostHold = manifest('fm_lost_hold', 5, 'cmdty_silicate');
    const lostBarge = bargeAtTally(lost.sim, lostHold);
    lost.state.simTime = 20;
    lost.traffic._rememberHeliosFreightTally(lostBarge, lostHold, 'cmdty_silicate');
    lost.state.simTime = 28;
    lost.traffic._onEntityKilled({ id: lostBarge.id, killerId: 9, type: 'ship', pos: { ...lostBarge.pos } });
    row = heliosFreightTallies(lost.state)[0];
    assert.equal(row.manifestId, 'fm_lost_hold');
    assert.equal(row.disposition, 'lost');
    assert.equal(row.dispositionSimTime, 28);
    const lostRec = { role: 'ore_carrier', id: lostBarge.id, dockSeq: 0 };
    lostBarge.data.cargoManifest = lostHold;
    lost.state.simTime = 40;
    lost.traffic._emitArrival(lostBarge, lostRec, lost.station, { manifest: lostHold });
    row = heliosFreightTallies(lost.state)[0];
    assert.equal(row.disposition, 'lost', 'a later dock does not revive a hold the ledger already lost');
    assert.equal(row.dispositionSimTime, 28);
    lost.traffic.deserialize({
      schema: lost.traffic.serialize().schema,
      heliosFreightTallies: [{ manifestId: 'fm_old', totalQty: 2, disposition: 'smuggled', dispositionSimTime: 4 }],
    });
    const old = heliosFreightTallies(lost.state)[0];
    assert.equal(old.disposition, 'counted', 'an unknown disposition reads as still counted');
    assert.equal(old.dispositionSimTime, undefined);
    lost.sim.dispose();
  });
});
