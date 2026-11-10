// A chip titled to the claim miner is not free scrap. A witnessed player scoop is a theft the law keeps.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

const MINER = 'wr_helios_starter_cutter';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.tick = 40;
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 210, z: 50 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 1280, z: -420 }, radius: 80,
    data: { stationId: 'station_helios', factionId: 'faction_scn' },
  });
  const reports = [];
  bus.on('law:reportIncidentReceipt', (payload) => reports.push(payload));
  return { sim, state, bus, player, reports, system: sim.registry.get('lawSecurity') };
}

function addPatrol(sim, pos = { x: 220, z: 40 }) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos, radius: 8,
    hull: 80, hullMax: 80,
    data: { worldRecordId: 'wr_helios_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
  });
}

function addChip(sim, data) {
  return sim.spawn({
    type: 'pickup', team: 0, pos: { x: 200, z: 40 }, alive: true, radius: 1,
    data: {
      amount: 3,
      commodityId: 'cmdty_ore_iron',
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: MINER },
      ...data,
    },
  });
}

function scoop(bus, chip, collectorId, extra = {}) {
  bus.emit('pickup:collected', {
    collectorId,
    pickupId: chip.id,
    acceptedAmount: 3,
    pos: { x: chip.pos.x, z: chip.pos.z },
    ...extra,
  });
}

describe('titled Helios claim-chip theft', { concurrency: false }, () => {
  test('a witnessed player scoop of a titled chip is one payload-theft receipt that save keeps', () => {
    const { sim, state, bus, player, reports, system } = boot();
    addPatrol(sim);
    const chip = addChip(sim, { ownerId: MINER });
    scoop(bus, chip, player.id);
    scoop(bus, chip, player.id);
    assert.equal(reports.length, 2);
    assert.equal(reports[0].accepted, true);
    assert.equal(reports[1], reports[0], 'the second scoop returns the stored receipt');
    assert.equal(reports[0].kind, 'payload_theft');
    assert.equal(reports[0].validatedWitnessedTheft, true);
    assert.ok(reports[0].witnessCount >= 1);
    assert.equal(reports[0].reportId, `chip-theft:chip:${chip.id}:${MINER}`);
    assert.equal(reports[0].payloadStableId, `chip:${chip.id}`);
    const ledger = state.lawSecurity.reportedIncidents;
    assert.equal(Object.keys(ledger).length, 1);
    assert.equal(ledger[reports[0].reportId].incidentReceiptId, reports[0].incidentReceiptId);

    const saved = system.serialize();
    delete state.lawSecurity.reportedIncidents;
    system.deserialize(saved);
    const back = state.lawSecurity.reportedIncidents[reports[0].reportId];
    assert.equal(back.accepted, true);
    assert.equal(back.kind, 'payload_theft');
    assert.equal(back.incidentReceiptId, reports[0].incidentReceiptId);
    sim.dispose();
  });

  test('no witness, an untitled chip, the cutter\'s own chip, and a barge scoop leave no ledger', () => {
    const unwitnessed = boot();
    const hidden = addChip(unwitnessed.sim, { ownerId: MINER });
    scoop(unwitnessed.bus, hidden, unwitnessed.player.id);
    assert.equal(unwitnessed.reports.length, 1);
    assert.equal(unwitnessed.reports[0].accepted, false);
    assert.equal(unwitnessed.reports[0].reason, 'no_witness');
    assert.equal(unwitnessed.state.lawSecurity.reportedIncidents, undefined);
    assert.equal(unwitnessed.system.serialize().reportedIncidents, undefined);
    unwitnessed.sim.dispose();

    const quiet = boot();
    addPatrol(quiet.sim);
    const untitled = addChip(quiet.sim, {});
    const own = addChip(quiet.sim, {
      ownerId: String(quiet.player.id),
      npcMiningSource: { fieldId: 'f_helios_starter', minerWorldRecordId: String(quiet.player.id) },
    });
    const barge = quiet.sim.spawn({
      type: 'ship', team: 2, pos: { x: 180, z: 20 }, radius: 9,
      data: { activityActorSlotId: 'helios_starter_ore_carrier', worldRecordId: 'wr_barge' },
    });
    const titled = addChip(quiet.sim, { ownerId: MINER, amount: 2 });
    scoop(quiet.bus, untitled, quiet.player.id);
    scoop(quiet.bus, own, quiet.player.id);
    scoop(quiet.bus, titled, barge.id);
    quiet.bus.emit('traffic:oreCollected', {
      carrierId: barge.id, manifestId: 'fm_barge_scoop', qty: 2, commodityId: 'cmdty_ore_iron',
    });
    scoop(quiet.bus, titled, quiet.player.id, { acceptedAmount: 0 });
    assert.equal(quiet.reports.length, 0);
    assert.equal(quiet.state.lawSecurity.reportedIncidents, undefined);
    quiet.sim.dispose();
  });
});
