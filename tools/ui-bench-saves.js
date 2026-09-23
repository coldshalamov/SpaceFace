// ui-bench-saves.js — a filed career for the UI bench's load screen.
//
// The bench's GameState says a save exists (state.save.currentSlot = 'quick'), but the load screen
// reads the SAVE SYSTEM, not the state, and the bench registers none: every slot drew empty and
// the screen could never be judged with a life on file. A shot marked `saves: 'filed'` in
// scripts/lib/uiBenchCatalog.mjs gets this stub instead: the index rows the save system's
// _updateIndex writes (src/save/saveSystem.js), and the envelopes peekSlot returns, so the
// portrait (scars, titles, rap sheet, the ace who fled) is built by the screen's own code from
// real save-shaped data. Fresh per mount, so a Delete tried by --walk never leaks into the next.

import { CURRENT_VERSION } from '../src/save/migrations.js';

function quickEnvelope() {
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-09-22T19:41:00.000Z',
    playtimeS: 4340,
    data: {
      player: {
        credits: 18400,
        heat: 0.4,
        bounty: 1200,
        activeShipIndex: 0,
        ownedShips: [{
          defId: 'ship_kestrel',
          fittings: ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s'],
          livingHull: {
            schema: 'spaceface.livingHull.v1',
            historyVersion: 2,
            scars: [
              { id: 'weapon:3101:starboard beam', cause: 'weapon', surface: 'weapon', band: 'heavy', facing: 'starboard beam', atT: 1880, tick: 3101, patchedAtT: null },
              { id: 'slam:3920:bow', cause: 'slam', band: 'graze', facing: 'bow', atT: 2410, tick: 3920, patchedAtT: 2600 },
            ],
          },
        }],
      },
      world: { currentSectorId: 'sector_helios_prime' },
      story: { beatIndex: 1, titles: { schemaVersion: 2, byId: {} } },
      aceMemory: {
        schemaVersion: 2,
        ace_yara_no_cut: {
          id: 'ace_yara_no_cut', name: 'Yara No-Cut', fled: true, defeated: false,
          returnTier: 1, fleeCount: 1, returnsBigger: true, encounterCount: 1,
        },
      },
    },
  };
}

function slotOneEnvelope() {
  return {
    fmt: 'spaceface-save',
    version: CURRENT_VERSION,
    savedAt: '2026-09-20T23:05:00.000Z',
    playtimeS: 23990,
    data: {
      player: {
        credits: 42150,
        heat: 0,
        bounty: 0,
        activeShipIndex: 0,
        ownedShips: [{ defId: 'ship_pelican', fittings: ['wpn_autocannon_s', 'mod_cargo_pod_m'] }],
      },
      world: { currentSectorId: 'sector_tethys_junction' },
      story: {
        beatIndex: 3,
        titles: {
          schemaVersion: 2,
          byId: { title_thunderchild: { status: 'held', holderKey: 'player', title: 'Thunderchild', titleId: 'title_thunderchild' } },
        },
      },
      aceMemory: { schemaVersion: 2 },
    },
  };
}

/** A save system with two lives on file (quick and slot 1); slots 2-4 stay empty. */
export function createBenchSaveSystem() {
  const envelopes = { quick: quickEnvelope(), 1: slotOneEnvelope() };
  const index = {
    quick: {
      slot: 'quick', savedAt: envelopes.quick.savedAt, playtimeS: envelopes.quick.playtimeS, credits: 18400,
      sectorName: 'Helios Prime', shipName: 'ship_kestrel',
      missionSummary: 'Mission: Contract 47-A: Mass Variance Sample',
      objectiveSummary: 'Mission: Contract 47-A: Mass Variance Sample',
      version: CURRENT_VERSION,
    },
    1: {
      slot: '1', savedAt: envelopes[1].savedAt, playtimeS: envelopes[1].playtimeS, credits: 42150,
      sectorName: 'Tethys Junction', shipName: 'ship_pelican',
      navObjectiveSummary: 'Route: Vesta Forge - Refined Alloys',
      objectiveSummary: 'Route: Vesta Forge - Refined Alloys',
      version: CURRENT_VERSION,
    },
  };
  return {
    listSlots() { return JSON.parse(JSON.stringify(index)); },
    peekSlot(slot) { return envelopes[slot] ? JSON.parse(JSON.stringify(envelopes[slot])) : null; },
    deleteSlot(slot) { delete index[slot]; delete envelopes[slot]; },
    exportSlot(slot) { return envelopes[slot] ? JSON.stringify(envelopes[slot]) : null; },
  };
}
