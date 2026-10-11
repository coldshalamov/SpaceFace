/**
 * THE WORLD REMEMBERS - the Record spine. One ledger of player deeds under state.story.record,
 * fed by receipts other owners already sign, read by hunters, fences, stations, rivalry, gossip
 * and the Codex. Lazy (no key until a deed lands), capped, deterministic, saved with story.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  deedRecord, recordDeed, deedsFor, notorietyIn, standingWith, pickDeedToTell, markTold,
  peekDeedRecord, deedToneFor, deedTally, DEED_CAP, DEED_KINDS,
} from '../src/systems/deedRecord.js';
import { deedLine } from '../src/data/deedPhrases.js';
import { WANTED_TIER } from '../src/systems/heat.js';

function makeCtx(seed) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.mode = 'flight';
  state.simTime = 300;
  state.tick = 18000;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_ceres_belt';
  const bus = createBus();
  const sys = { ...deedRecord };
  sys.init({ state, bus });
  return { state, bus, sys };
}

const SEEDS = [4242, 8008];

test('nothing happened: no record key, readers answer empty', () => {
  for (const seed of SEEDS) {
    const { state } = makeCtx(seed);
    assert.equal(peekDeedRecord(state), null);
    assert.equal('record' in state.story, false);
    assert.deepEqual(deedsFor(state, {}), []);
    assert.equal(notorietyIn(state, 'sector_ceres_belt'), 0);
    assert.equal(standingWith(state, 'faction_scn'), 0);
    assert.equal(pickDeedToTell(state, {}), null);
  }
});

test('every subscribed receipt writes one deed with the right kind and place', () => {
  for (const seed of SEEDS) {
    const { state, bus } = makeCtx(seed);
    bus.emit('station:slammed', { actorId: 1, stationId: 'station_ceres', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc', fineCr: 600, mass: 12, tick: 100 });
    bus.emit('economy:oreFlood', { sectorId: 'sector_ceres_belt', byPlayer: true, yieldU: 30, commodityId: 'iron_ore', tick: 110 });
    bus.emit('well:haulerDragged', { actorId: 1, haulerId: 55, factionId: 'faction_mts', destStationId: 'station_helios', sectorId: 'sector_ceres_belt', deflectionWu: 40 });
    bus.emit('survivorPod:rescued', { id: 'survivor:9', playerAnswered: true, factionId: 'faction_scn', sectorId: 'sector_helios_prime', victimId: 9, t: 310 });
    bus.emit('survivorPod:abandoned', { id: 'survivor:10', playerLeftIt: true, factionId: 'faction_mts', sectorId: 'sector_ceres_belt', victimId: 10, t: 320 });
    bus.emit('survivorPod:captured', { id: 'survivor:11', factionId: 'faction_mts', captorFactionId: 'faction_reach', sectorId: 'sector_ceres_belt', victimId: 11, t: 330 });
    bus.emit('entity:killed', { id: 70, killerId: 1, type: 'ship', factionId: 'faction_scn', factionLawful: true, targetHostileToPlayer: false, victimClass: 'corvette' });
    bus.emit('entity:killed', { id: 71, killerId: 1, type: 'ship', factionId: 'faction_reach', factionLawful: false, targetHostileToPlayer: true, victimClass: 'raider' });
    bus.emit('combat:baseDestroyed', { type: 'pirate_den', factionId: 'faction_reach', sectorId: 'sector_ceres_belt', killerId: 1 });
    bus.emit('deniable:fenceBurned', { stationId: 'station_ceres', sectorId: 'sector_ceres_belt', tick: 200 });
    bus.emit('deniable:fenceEmboldened', { stationId: 'station_ceres', sectorId: 'sector_ceres_belt', tick: 201 });
    bus.emit('deniable:fenceThanked', { stationId: 'station_ceres', sectorId: 'sector_ceres_belt', factionId: 'faction_reach', tick: 202 });
    bus.emit('bounty:cleared', { amount: 1500, source: 'economy:payBounty' });
    bus.emit('heat:changed', { previousValue: 0, value: 80, tier: WANTED_TIER.NETS, reason: 'test' });
    bus.emit('combat:tumbleRake', { hullId: 1, factionId: 'faction_reach', victims: [2, 3, 4], tick: 300 });
    bus.emit('stunt:salvageRights', { trickId: 'bolas', name: 'Bolas', rarity: 'rare', tick: 310 });

    const kinds = deedsFor(state, {}).map((d) => d.kind).sort();
    assert.deepEqual(kinds, [
      'base_destroyed', 'bounty_paid', 'dock_slam', 'fence_burned', 'fence_emboldened', 'fence_thanked',
      'hauler_dragged', 'kill_lawful', 'kill_outlaw', 'ore_flood', 'pod_abandoned', 'pod_captured',
      'pod_rescued', 'stunt', 'tumble_rake', 'wanted_tier',
    ]);
    assert.equal(Object.keys(DEED_KINDS).length, kinds.length, 'every kind has a producer wired');
    const slam = deedsFor(state, { kinds: ['dock_slam'] })[0];
    assert.equal(slam.stationId, 'station_ceres');
    assert.equal(slam.factionId, 'faction_dmc');
    assert.equal(slam.detail.fineCr, 600);
    const rescue = deedsFor(state, { kinds: ['pod_rescued'] })[0];
    assert.equal(rescue.sectorId, 'sector_helios_prime');
    assert.equal(rescue.id, 'pod:rescued:survivor:9');
    assert.equal(deedTally(state, 'kill_lawful'), 1);
    // Every deed has a line in every voice (praise/grievance fall back to neutral).
    for (const d of deedsFor(state, {})) {
      for (const voice of ['neutral', 'grievance', 'praise']) {
        const line = deedLine(d, { voice });
        assert.equal(typeof line, 'string', `${d.kind} ${voice}`);
        assert.ok(line.length > 10 && !/undefined|null|NaN/.test(line), `${d.kind}/${voice}: ${line}`);
      }
    }
  }
});

test('gates: foreign actors, unattended pods, downward heat and self-kills write nothing', () => {
  for (const seed of SEEDS) {
    const { state, bus } = makeCtx(seed);
    bus.emit('station:slammed', { actorId: 77, stationId: 'station_ceres', fineCr: 600 });
    bus.emit('economy:oreFlood', { sectorId: 'sector_ceres_belt', byPlayer: false, yieldU: 30 });
    bus.emit('well:haulerDragged', { actorId: 5, haulerId: 55 });
    bus.emit('survivorPod:rescued', { id: 'survivor:9', factionId: 'faction_scn' });
    bus.emit('survivorPod:abandoned', { id: 'survivor:10', factionId: 'faction_mts' });
    bus.emit('entity:killed', { id: 1, killerId: 1, type: 'ship' });
    bus.emit('entity:killed', { id: 70, killerId: 9, type: 'ship', factionId: 'faction_scn' });
    bus.emit('entity:killed', { id: 72, killerId: 1, type: 'asteroid' });
    bus.emit('combat:baseDestroyed', { type: 'pirate_den', killerId: 9 });
    bus.emit('heat:changed', { previousValue: 80, value: 10, tier: WANTED_TIER.SCAN });
    bus.emit('heat:changed', { previousValue: 0, value: 5, tier: WANTED_TIER.SCAN });
    bus.emit('combat:tumbleRake', { hullId: 2, victims: [1] });
    bus.emit('combat:tumbleRake', { hullId: 1, victims: [] });
    assert.equal(peekDeedRecord(state), null, `seed ${seed}`);
  }
});

test('explicit ids dedupe; the same pod never records twice', () => {
  const { state, bus } = makeCtx(4242);
  bus.emit('survivorPod:rescued', { id: 'survivor:9', playerAnswered: true, factionId: 'faction_scn' });
  bus.emit('survivorPod:rescued', { id: 'survivor:9', playerAnswered: true, factionId: 'faction_scn' });
  assert.equal(deedsFor(state, {}).length, 1);
  assert.equal(recordDeed(state, { kind: 'nonsense' }), null);
});

test('notoriety and standing read the axes and decay with the clock', () => {
  const { state } = makeCtx(8008);
  recordDeed(state, { kind: 'kill_lawful', sectorId: 'sector_ceres_belt', factionId: 'faction_scn' });
  recordDeed(state, { kind: 'dock_slam', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' });
  recordDeed(state, { kind: 'pod_rescued', sectorId: 'sector_helios_prime', factionId: 'faction_scn' });
  // notoriety counts only the crimes, only in that sector
  assert.equal(notorietyIn(state, 'sector_ceres_belt'), 5);
  assert.equal(notorietyIn(state, 'sector_helios_prime'), 0);
  // Concord: -3 (direct kill) + 3 (direct rescue) - 2*0.25 (slam elsewhere)
  assert.equal(standingWith(state, 'faction_scn'), -0.5);
  // an outlaw house reads the street axis: +3*0.25 for the lawful kill, nothing for the slam/rescue
  assert.equal(standingWith(state, 'faction_reach'), 0.75);
  // thirty minutes later everything weighs half
  assert.equal(notorietyIn(state, 'sector_ceres_belt', state.simTime + 1800), 2.5);
  assert.equal(deedToneFor(deedsFor(state, { kinds: ['kill_lawful'] })[0], 'faction_scn'), 'grievance');
  assert.equal(deedToneFor(deedsFor(state, { kinds: ['kill_lawful'] })[0], 'faction_reach'), 'praise');
  assert.equal(deedToneFor(deedsFor(state, { kinds: ['dock_slam'] })[0], 'faction_reach'), 'neutral');
});

test('pickDeedToTell prefers loud, untold, local deeds about the speaker; markTold quiets them', () => {
  for (const seed of SEEDS) {
    const { state } = makeCtx(seed);
    recordDeed(state, { kind: 'stunt', sectorId: 'sector_ceres_belt' });
    recordDeed(state, { kind: 'kill_lawful', sectorId: 'sector_helios_prime', factionId: 'faction_scn' });
    recordDeed(state, { kind: 'dock_slam', sectorId: 'sector_ceres_belt', factionId: 'faction_dmc' });
    const concord = pickDeedToTell(state, { speakerFactionId: 'faction_scn', sectorId: 'sector_helios_prime' });
    assert.equal(concord.kind, 'kill_lawful');
    const again = pickDeedToTell(state, { speakerFactionId: 'faction_scn', sectorId: 'sector_helios_prime' });
    assert.equal(again.id, concord.id, 'deterministic');
    markTold(state, concord.id, { by: 'bar:helios' });
    assert.equal(concord.told, 1);
    const next = pickDeedToTell(state, { speakerFactionId: 'faction_dmc', sectorId: 'sector_ceres_belt' });
    assert.equal(next.kind, 'dock_slam', 'local, direct, untold wins once the kill was told');
    // an outlaw speaker has no opinion about a dock slam: the fresh local stunt beats the
    // already-told kill elsewhere, and once the stunt is told the lawful kill is their praise line
    const reach = pickDeedToTell(state, { speakerFactionId: 'faction_reach', sectorId: 'sector_ceres_belt' });
    assert.equal(reach.kind, 'stunt');
    markTold(state, reach.id);
    const reachNext = pickDeedToTell(state, { speakerFactionId: 'faction_reach', sectorId: 'sector_ceres_belt' });
    assert.equal(reachNext.kind, 'kill_lawful');
    assert.equal(pickDeedToTell(state, { kinds: ['bounty_paid'] }), null);
  }
});

test('compaction keeps the record at the cap and drops the quiet told deed first', () => {
  const { state } = makeCtx(4242);
  const keep = recordDeed(state, { kind: 'base_destroyed', sectorId: 'sector_ceres_belt' });
  const toldQuiet = recordDeed(state, { kind: 'stunt', sectorId: 'sector_ceres_belt' });
  markTold(state, toldQuiet.id);
  for (let i = 0; i < DEED_CAP + 10; i++) recordDeed(state, { kind: 'ore_flood', sectorId: 'sector_ceres_belt', tick: 1000 + i });
  const record = peekDeedRecord(state);
  assert.equal(record.deeds.length, DEED_CAP);
  assert.ok(record.deeds.some((d) => d.id === keep.id), 'the loud deed survives');
  assert.ok(!record.deeds.some((d) => d.id === toldQuiet.id), 'the told stunt went first');
  assert.equal(deedTally(state, 'ore_flood'), DEED_CAP + 10, 'tallies outlive compaction');
});

test('the record survives a plain story clone (save shape) and destroy detaches listeners', () => {
  const { state, bus, sys } = makeCtx(8008);
  recordDeed(state, { kind: 'kill_lawful', sectorId: 'sector_ceres_belt', factionId: 'faction_scn', detail: { victimId: '70' } });
  const clone = JSON.parse(JSON.stringify(state.story));
  const restored = createGameState(8008);
  restored.story = clone;
  assert.equal(deedsFor(restored, {}).length, 1);
  assert.equal(deedsFor(restored, {})[0].detail.victimId, '70');
  sys.destroy();
  bus.emit('bounty:cleared', { amount: 100 });
  assert.equal(deedsFor(state, {}).length, 1, 'no writes after destroy');
});
