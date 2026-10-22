// EXP-09 / EXP-10: activity wrecks beside the closed sixteen. Seed 4242.
// A dock rumor mints the bearing; taking the hold pays the named cargo and no unique.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  uniqueWreckById,
  uniqueWreckForDrop,
  uniqueWreckForSource,
} from '../src/data/uniqueWrecks.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const EXPECTED = [
  {
    id: 'wreck_understory_what_the_wreck_became',
    name: '*What-the-Wreck-Became*',
    factionId: 'faction_understory',
    sectorId: 'sector_charon_expanse',
    scanLabel: 'GARDEN HULL · STILL GROWING',
    donorId: 'wreck_isc_lighthouse',
    cargo: { cmdty_spore_catalyst: 1, cmdty_classified_salvage: 1 },
  },
  {
    id: 'wreck_pitborn_everything_else',
    name: '*Everything Else*',
    factionId: 'faction_pitborn',
    sectorId: 'sector_sker_haven',
    scanLabel: 'BALLAST BARGE · TALLY STILL PAINTED',
    donorId: 'wreck_nestbreaker',
    cargo: { cmdty_scrap_metal: 4 },
  },
  {
    id: 'wreck_fulfillment_route_88',
    name: 'Re-router Route 88',
    factionId: 'faction_fulfillment',
    sectorId: 'sector_tethys_junction',
    scanLabel: 'RE-ROUTER · ORDER 0003-PIT STILL ABOARD',
    donorId: 'wreck_isc_double_entry',
    cargo: { cmdty_consumer_goods: 2, cmdty_classified_salvage: 1 },
  },
  {
    id: 'wreck_archive_codex_ix',
    name: '*Severed Codex, vol. IX*',
    factionId: 'faction_archive',
    sectorId: 'sector_pallas_drift',
    scanLabel: 'CENSOR FRIGATE · PAGES LOOSE',
    donorId: 'wreck_mts_regular',
    cargo: { cmdty_classified_salvage: 1 },
  },
  {
    id: 'wreck_vael_page_nine',
    name: '*Page Nine*',
    factionId: 'faction_vael',
    sectorId: 'sector_veil_nebula',
    scanLabel: 'OVERRIDE TENDER · ADDENDUM ATTACHED',
    donorId: 'wreck_isc_vigilant',
    cargo: { cmdty_classified_salvage: 2 },
  },
  {
    id: 'wreck_helix_due_diligence',
    name: 'Adjudicator *Due Diligence*',
    factionId: 'faction_helix',
    sectorId: 'sector_dione_lane',
    scanLabel: 'ADJUDICATOR · TRANSPONDER READS MTS',
    donorId: 'wreck_isc_double_entry',
    cargo: { cmdty_classified_salvage: 1 },
  },
];

function claimCargo(def) {
  const events = [];
  uniqueWrecks.state = {
    simTime: 120,
    tick: 7200,
    meta: { seed: 4242 },
    playerId: 1,
    player: { cargo: { items: {} }, flags: {} },
    world: { currentSectorId: 'sector_nowhere' },
    entities: { get() { return null; } },
  };
  uniqueWrecks.bus = { emit(name, payload) { events.push({ name, payload }); } };
  uniqueWrecks.registry = null;
  const record = uniqueWrecks._recordRumor({
    wreckId: def.id,
    sourceRef: def.bearingSourceRef,
    channelId: 'bar',
  });
  assert.equal(record && record.phase, 'rumored', `${def.id} rumor charts a bearing`);
  assert.equal(record.sectorId, def.sectorId);
  record.phase = 'decision';
  const resolved = uniqueWrecks._onChoose({ wreckId: def.id, choiceId: 'claim_hold' });
  assert.ok(resolved, `${def.id} claim resolves`);
  const cargo = {};
  for (const event of events) {
    if (event.name !== 'pickup:collected') continue;
    cargo[event.payload.commodityId] = (cargo[event.payload.commodityId] || 0) + event.payload.amount;
  }
  return cargo;
}

test('seed 4242: the six activity wrecks copy a donor and pay only their cargo', () => {
  assert.equal(UNIQUE_WRECKS.length, 16);
  const programSeed = programSeedFor(4242);
  for (const row of EXPECTED) {
    const def = uniqueWreckById(row.id);
    const donor = uniqueWreckById(row.donorId);
    assert.ok(def, row.id);
    assert.equal(def.name, row.name);
    assert.equal(def.victimLabel, row.name);
    assert.equal(def.factionId, row.factionId);
    assert.equal(def.sectorId, row.sectorId);
    assert.equal(def.scanLabel, row.scanLabel);
    assert.equal(def.wreckClass, donor.wreckClass);
    assert.deepEqual(def.placement, donor.placement);
    assert.deepEqual(def.scanGate, donor.scanGate);
    assert.deepEqual(def.salvageLaw, donor.salvageLaw);
    assert.equal(def.decision.choices.find((choice) => choice.id === 'claim_hold').uniqueDrop, false);
    assert.equal(uniqueWreckForSource(def.bearingSourceRef).id, def.id);
    assert.equal(uniqueWreckForSource(donor.bearingSourceRef).id, donor.id);
    if (donor.uniqueDropId) assert.equal(uniqueWreckForDrop(donor.uniqueDropId).id, donor.id);
    const placed = placementForUniqueWreck(programSeed, def.id, def.sectorId);
    assert.equal(placed.sectorId, def.sectorId);
    assert.ok(Number.isFinite(placed.exactGlobal.x) && Number.isFinite(placed.exactGlobal.z));
    assert.deepEqual(claimCargo(def), row.cargo);
  }
});
