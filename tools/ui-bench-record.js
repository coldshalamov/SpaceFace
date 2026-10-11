// ui-bench-record.js - a lived-in Record for the bench's codex-record shot (THE WORLD REMEMBERS).
// Seeds deeds through the game's own writer, 14 of them across a few factions, a few already told.
// Shots without `record` get the bare state back; the bench state is never saved.

import { recordDeed, markTold } from '../src/systems/deedRecord.js';

const DEEDS = [
  ['stunt', 'sector_helios_prime', null, 'Corkscrew'],
  ['dock_slam', 'sector_helios_prime', 'faction_mts', 'station_helios', { fineCr: 840 }],
  ['kill_outlaw', 'sector_ceres_belt', 'faction_reach', 'raider'],
  ['pod_rescued', 'sector_ceres_belt', 'faction_scn', '3'],
  ['ore_flood', 'sector_ceres_belt', null, 'ore_iron'],
  ['hauler_dragged', 'sector_helios_prime', 'faction_mts', '41'],
  ['kill_lawful', 'sector_helios_prime', 'faction_scn', 'patrol'],
  ['wanted_tier', 'sector_helios_prime', null, 'bounty'],
  ['pod_abandoned', 'sector_ceres_belt', 'faction_dmc', '9'],
  ['tumble_rake', 'sector_ceres_belt', 'faction_reach', null],
  ['bounty_paid', 'sector_helios_prime', null, null, { amount: 1200 }],
  ['kill_outlaw', 'sector_ceres_belt', 'faction_reach', 'raider'],
  ['stunt', 'sector_ceres_belt', null, 'Rock Skimmer'],
  ['dock_slam', 'sector_helios_prime', 'faction_scn', 'station_helios', { fineCr: 1400 }],
];

let seeded = null;

export function seedRecordShot(state) {
  if (seeded) return;
  seeded = { story: state.story.record, simTime: state.simTime };
  state.simTime = 5400;
  DEEDS.forEach(([kind, sectorId, factionId, subject, detail], i) => {
    recordDeed(state, { kind, sectorId, factionId, subject, detail, t: 5400 - (DEEDS.length - i) * 260, tick: i + 1 });
  });
  markTold(state, state.story.record.deeds[1].id, { by: 'bench' });
  markTold(state, state.story.record.deeds[6].id, { by: 'bench' });
}

export function unseedRecordShot(state) {
  if (!seeded) return;
  if (seeded.story === undefined) delete state.story.record; else state.story.record = seeded.story;
  state.simTime = seeded.simTime;
  seeded = null;
}
