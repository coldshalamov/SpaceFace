// INFERENCE (WF-18) — every spoken encounter outcome speaks: shapes without their own
// receipt row fall back to their script's classic family voice instead of resolving
// silently. Own rows always win; silent-by-design and unreachable outcomes stay ''.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import {
  ENCOUNTERS,
  ENCOUNTER_RECEIPTS,
  RECEIPT_FAMILY_BY_SCRIPT,
  receiptTextWithFallback,
} from '../src/data/encounters.js';

const VARS = Object.freeze({
  amount: 240, pay: 120, fine: 400, dest: 'Ceres', cargo: 'ORE',
  faction: 'MTS', name: 'Vane the Ash', tithe: '2u Machine Parts',
});

// [shapeId, script, outcome, expected match (RegExp) or '' for silent-by-design]
const CASES = [
  ['foreman_lane_toll', 'toll', 'paid', /TOLL PAID — 240 cr/],
  ['foreman_lane_toll', 'toll', 'cleared', /RAIDERS DOWN/],
  ['foreman_lane_toll', 'toll', 'escaped', /TOLL EVADED/],
  ['foreman_wreck_herd', 'ambush', 'cleared', /AMBUSH BROKEN/],
  ['foreman_wreck_herd', 'ambush', 'escaped', /AMBUSH EVADED/],
  ['foreman_wreck_herd', 'ambush', 'paid', ''],
  ['foreman_claim_breaker', 'ambush', 'cleared', /AMBUSH BROKEN/],
  ['foreman_claim_breaker', 'ambush', 'escaped', /AMBUSH EVADED/],
  ['ghost_on_the_bearing', 'ambush', 'cleared', /GHOST BROKEN/],
  ['ghost_on_the_bearing', 'ambush', 'escaped', /GHOST EVADED/],
  ['pattern_refrain', 'ambush', 'cleared', /REFRAIN BROKEN/],
  ['pattern_refrain', 'ambush', 'escaped', /REFRAIN EVADED/],
  ['vael_station_screen', 'ambush', 'cleared', /unguarded/],
  ['vael_station_screen', 'ambush', 'escaped', /hold their station/],
  ['pd_screen_wall', 'ambush', 'cleared', /AMBUSH BROKEN/],
  ['field_anchor_controller', 'ambush', 'escaped', /AMBUSH EVADED/],
  ['customs_logic_net', 'patrolScan', 'clean', /SCAN CLEAR/],
  ['customs_logic_net', 'patrolScan', 'bribed', /BRIBE TAKEN/],
  ['customs_logic_net', 'patrolScan', 'fined', /FINED 400 cr/],
  ['customs_logic_net', 'patrolScan', 'ran', /SCAN REFUSED/],
  ['customs_logic_net', 'patrolScan', 'dumped', /CARGO DUMPED/],
  ['customs_logic_net', 'patrolScan', 'cloak_evaded', ''],
  ['k1_fulfillment_fixed_route', 'convoy', 'arrived', /CONVOY ARRIVED/],
  ['k1_fulfillment_fixed_route', 'convoy', 'guarded', /owes you/],
  ['k1_fulfillment_fixed_route', 'convoy', 'lost', /Ceres/],
  ['k1_fulfillment_fixed_route', 'convoy', 'escorted', ''],
  ['k1_pitborn_yard', 'traderRun', 'arrived', /HAULER ARRIVED/],
  ['k1_pitborn_yard', 'traderRun', 'robbed', /HAULER RAIDED/],
  ['k1_pitborn_yard', 'traderRun', 'lost', /HAULER LOST/],
  ['k1_understory_salvager', 'salvageSignal', 'recovered', /BLACK BOX RECOVERED/],
  ['k1_understory_salvager', 'salvageSignal', 'stripped', /CACHE STRIPPED/],
  ['k1_archive_reading_room', 'whisper', 'identified', /SIGNAL IDENTIFIED/],
  ['k1_verge_observer_prism', 'whisper', 'broken', /SIGNAL BROKEN/],
  ['resonance_obelisk_patrol', 'patrolBeat', 'completed', ''],
  ['minefield_wake', 'ambush', 'paid', /TITHE PAID/],
  ['vael_lane_tithe', 'toll', 'paid', /TITHE/],
];

test('spoken outcomes speak through own rows or family fallback; quiet stays quiet', () => {
  for (const [shapeId, script, outcome, expected] of CASES) {
    assert.equal(ENCOUNTERS[shapeId].script, script, `${shapeId} still rides ${script}`);
    const text = receiptTextWithFallback(shapeId, script, outcome, VARS);
    if (expected === '') {
      assert.equal(text, '', `${shapeId}.${outcome} stays silent by design`);
    } else {
      assert.match(text, expected, `${shapeId}.${outcome} speaks`);
    }
  }
});

test('every mapped family carries live rows', () => {
  for (const [script, family] of Object.entries(RECEIPT_FAMILY_BY_SCRIPT)) {
    const rows = Object.keys(ENCOUNTER_RECEIPTS).filter((k) => k.startsWith(`${family}.`));
    assert.ok(rows.length >= 2, `${script} family ${family} carries rows (${rows.length})`);
  }
});

function bootSim(seed) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_io_reach';
  return { sim, player };
}

test('a paid foreman toll speaks the family receipt on the production route', () => {
  const { sim, player } = bootSim(33701);
  player.credits = 5000;
  sim.state.player.credits = 5000;
  const rows = [];
  for (const name of ['encounter:receipt', 'encounter:resolved']) {
    sim.bus.on(name, (payload) => rows.push({ name, payload }));
  }
  const director = sim.registry.get('encounterDirector');
  const result = director.requestAuthoredEncounter({
    shapeId: 'foreman_lane_toll', encounterId: 'receipt-prod:toll',
    sectorId: 'sector_io_reach', anchor: { x: 300, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  sim.bus.emit('encounter:choose', { encounterId: 'receipt-prod:toll', choiceId: 'pay' });
  const resolved = rows.find((r) => r.name === 'encounter:resolved');
  assert.equal(resolved.payload.outcome, 'paid');
  const receipt = rows.find((r) => r.name === 'encounter:receipt');
  assert.ok(receipt, 'the paid toll emits a receipt instead of resolving silently');
  assert.match(receipt.payload.text, /TOLL PAID — 50 cr/, 'empty hold prices the floor, spoken aloud');
});

test('a clean customs scan speaks the family receipt on the production route', () => {
  const { sim } = bootSim(32602);
  const rows = [];
  for (const name of ['encounter:receipt', 'encounter:resolved']) {
    sim.bus.on(name, (payload) => rows.push({ name, payload }));
  }
  const director = sim.registry.get('encounterDirector');
  const result = director.requestAuthoredEncounter({
    shapeId: 'customs_logic_net', encounterId: 'receipt-prod:customs',
    sectorId: 'sector_io_reach', anchor: { x: 300, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  sim.bus.emit('encounter:choose', { encounterId: 'receipt-prod:customs', choiceId: 'comply' });
  const resolved = rows.find((r) => r.name === 'encounter:resolved');
  assert.equal(resolved.payload.outcome, 'clean');
  const receipt = rows.find((r) => r.name === 'encounter:receipt');
  assert.ok(receipt, 'the clean scan emits a receipt instead of resolving silently');
  assert.match(receipt.payload.text, /SCAN CLEAR/);
});
