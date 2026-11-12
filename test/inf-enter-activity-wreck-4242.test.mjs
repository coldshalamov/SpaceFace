// Entering a sector with an activity hull charts that hull. Seed 4242.
// Veil keeps its existing Vigilant surface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';

const HOMES = [
  ['sector_charon_expanse', 'wreck_understory_what_the_wreck_became', 'GARDEN HULL · STILL GROWING'],
  ['sector_sker_haven', 'wreck_pitborn_everything_else', 'BALLAST BARGE · TALLY STILL PAINTED'],
  ['sector_tethys_junction', 'wreck_fulfillment_route_88', 'RE-ROUTER · ORDER 0003-PIT STILL ABOARD'],
  ['sector_pallas_drift', 'wreck_archive_codex_ix', 'CENSOR FRIGATE · PAGES LOOSE'],
  ['sector_dione_lane', 'wreck_helix_due_diligence', 'ADJUDICATOR · TRANSPONDER READS MTS'],
];

function enter(sectorId) {
  const heard = [];
  uniqueWrecks.state = {
    simTime: 80,
    tick: 4800,
    meta: { seed: 4242 },
    playerId: 1,
    player: { flags: {} },
    world: { currentSectorId: sectorId },
    entities: { get() { return null; } },
  };
  uniqueWrecks.bus = {
    emit(name, payload) { heard.push({ name, payload }); },
    on() { return () => {}; },
  };
  uniqueWrecks.helpers = {};
  uniqueWrecks._entityByWreck = new Map();
  uniqueWrecks._wreckByEntity = new Map();
  uniqueWrecks._subscriptions = [];
  for (const _ of uniqueWrecks._onSectorEnterSteps({ sectorId })) { /* the enter drain */ }
  return {
    heard,
    bearing: uniqueWrecks.state.player.uniqueWrecks.bearings[HOMES.find((row) => row[0] === sectorId)?.[1]],
    bearings: uniqueWrecks.state.player.uniqueWrecks.bearings,
  };
}

test('seed 4242: entering the home sector charts the activity hull and speaks its scan line', () => {
  for (const [sectorId, wreckId, scanLabel] of HOMES) {
    const result = enter(sectorId);
    const rumor = result.heard.find((event) => event.name === 'uniqueWreck:rumorHeard'
      && event.payload && event.payload.wreckId === wreckId);
    assert.ok(rumor, `${sectorId} speaks ${wreckId}`);
    assert.equal(rumor.payload.text, scanLabel);
    assert.equal(rumor.payload.sourceRef, `bar.expansion.${wreckId}`);
    assert.equal(result.bearing && result.bearing.phase, 'rumored');
    assert.equal(result.bearing.sectorId, sectorId);
  }

  const veil = enter('sector_veil_nebula');
  assert.equal(veil.bearings.wreck_isc_vigilant && veil.bearings.wreck_isc_vigilant.phase, 'rumored');
  assert.equal(veil.bearings.wreck_vael_page_nine, undefined);
});
