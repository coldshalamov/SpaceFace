// fix-missions-truth — each player-facing mission line says what the ledger and the sim did.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  CAPITAL_BOSS, CAPITAL_BOSS_ALA, CAPITAL_BOSS_TOLLMAN, RANK_GATED_CONTRACTS, STORY_BEATS,
} from '../src/data/missions.js';
import {
  BEAT_HINT,
  CONTRACT_47A_B0_TAG,
  CONTRACT_47A_SAMPLE_ID,
  authoredMethodFor,
  missions as missionsProto,
} from '../src/systems/missions.js';

function harness(seed = 47) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const asteroid = { id: 2, type: 'asteroid', alive: true, pos: { x: 180, z: -60 }, data: { typeId: 'ast_common_rock' } };
  const station = { id: 3, type: 'station', alive: true, pos: { x: -420, z: 100 }, data: { stationId: 'station_helios', name: 'Helios Station' } };
  for (const e of [player, asteroid, station]) state.entities.set(e.id, e);
  state.entityList.push(asteroid, station);
  state.onboarding = { active: false, finished: true };
  state.settings.gameplay.tutorialHints = false;
  const bus = createBus();
  const credits = [];
  const toasts = [];
  const comms = [];
  const waypoints = [];
  bus.on('economy:grantCredits', (p) => credits.push(p));
  bus.on('toast', (p) => toasts.push(p));
  bus.on('comms:popup', (p) => comms.push(p));
  bus.on('nav:waypoint', (p) => waypoints.push(p));
  const helpers = {
    voice: { say: () => true },
    mulberry32: (value) => {
      let a = value >>> 0;
      return () => ((a = (a + 0x6D2B79F5) >>> 0) / 4294967296);
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  return { state, bus, missions, player, asteroid, station, credits, toasts, comms, waypoints };
}

const b0 = (h) => h.state.missions.active.find((m) => m.storyTag === CONTRACT_47A_B0_TAG);

test('capital bosses: a gun kill resolves the gunnery solution; thrown mass keeps the throw', () => {
  for (const boss of [CAPITAL_BOSS, CAPITAL_BOSS_TOLLMAN, CAPITAL_BOSS_ALA]) {
    assert.equal(authoredMethodFor(boss, 'kill', 'capital_hull'), 'outgun_the_capital', boss.id);
    assert.equal(authoredMethodFor(boss, 'throw', 'capital_hull'), 'throw_the_capital', boss.id);
    assert.equal(authoredMethodFor(boss, 'whip', 'capital_hull'), 'throw_the_capital', boss.id);
  }
});

test('the Drift rank contract is titled for the mining quota it actually is', () => {
  const drift = RANK_GATED_CONTRACTS.find((row) => row.factionId === 'faction_dmc');
  assert.equal(drift.type, 'mining_quota');
  assert.doesNotMatch(drift.title, /haul/i);
});

test('47-A turn-in: the toast and debrief name the withheld pay and the balance credit that lands', () => {
  const h = harness();
  const missionId = b0(h).id;
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...h.asteroid.pos } });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  const beatCredits = STORY_BEATS[0].reward.credits;
  const landed = h.credits.reduce((sum, row) => sum + row.amount, 0);
  assert.equal(landed, beatCredits, 'the only credits that land are the beat-0 balance grant');
  assert.ok(h.credits.every((row) => row.reason === 'story:cold_start'));
  const done = h.toasts.find((row) => /^Mission complete: Contract 47-A/.test(row.text));
  assert.ok(done, 'completion toast posts');
  assert.match(done.text, /contract pay withheld/);
  assert.match(done.text, new RegExp(`\\+${beatCredits} cr posted for balance`));
  const debrief = h.comms.find((row) => row.note && /withheld/i.test(row.note));
  assert.ok(debrief, 'the debrief payday note does not say "Paid"');
  assert.doesNotMatch(debrief.note, /^Paid /);
  const receipt = h.state.missions.receipts.find((row) => row.missionId === missionId);
  assert.equal(receipt.rewardCr, landed, 'the receipt records what actually landed');
});

test('47-A recovery site stays fixed across an empty index and a sector change', () => {
  const h = harness();
  const mission = b0(h);
  const fix = { ...mission.params.samplePos };
  assert.deepEqual(fix, { x: h.asteroid.pos.x, z: h.asteroid.pos.z });
  // Cold index: the marked rock is not present, the player is far away in another sector.
  h.state.entityList.splice(h.state.entityList.indexOf(h.asteroid), 1);
  const other = { id: 9, type: 'asteroid', alive: true, pos: { x: 5000, z: 5000 }, data: {} };
  h.state.entityList.push(other);
  h.player.pos = { x: 5000, z: 5010 };
  h.state.world.currentSectorId = 'sector_other';
  const source = h.missions._resolveContract47aSampleSource(mission);
  assert.deepEqual(source.pos, fix, 'the site reports its fix, not the rock beside the player');
  assert.deepEqual(mission.params.samplePos, fix, 'the saved fix is not rewritten');
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: 1, pos: { ...other.pos } });
  assert.equal(h.state.player.cargo.items[CONTRACT_47A_SAMPLE_ID], undefined, 'a yield elsewhere is not the sample');
  // Back home at the fix with the rock genuinely gone: the site re-marks onto the rock nearest it.
  h.state.world.currentSectorId = mission.destSectorId;
  const near = { id: 10, type: 'asteroid', alive: true, pos: { x: fix.x + 150, z: fix.z }, data: {} };
  h.state.entityList.push(near);
  h.player.pos = { x: fix.x, z: fix.z };
  const remarked = h.missions._resolveContract47aSampleSource(mission);
  assert.equal(remarked, near);
  assert.deepEqual(mission.params.samplePos, { x: near.pos.x, z: near.pos.z });
});

test('quiet passage: docking at Customs before the transport clears the checkpoint pays nothing', () => {
  const h = harness();
  const m = {
    id: 'qp1', type: 'passenger_transport', status: 'active', title: 'Quiet passage',
    destStationId: 'station_customs', destSectorId: 'sector_x', stationId: 'station_helios',
    reward_cr: 900, collateral_cr: 0, params: { quietPassage: { passedCheckpoint: false } },
    targetEntityIds: [],
  };
  h.state.missions.active.push(m);
  h.credits.length = 0;
  h.missions._onDockedObjectives('station_customs');
  assert.equal(m.status, 'active');
  assert.equal(h.credits.length, 0);
  assert.ok(h.toasts.some((row) => /not cleared the checkpoint/.test(row.text)));
});

test('race DNFs and broken terms name their cause on the failure toast', () => {
  const h = harness();
  const m = {
    id: 'race1', type: 'patrol_clear', status: 'active', title: 'Veil Ribbon',
    destStationId: 'station_helios', stationId: 'station_helios', reward_cr: 0, collateral_cr: 0,
    params: {}, targetEntityIds: [],
  };
  h.state.missions.active.push(m);
  h.missions._failMission(m, h.state.missions.active.indexOf(m), 'race_left_course');
  assert.ok(h.toasts.some((row) => row.text === 'Mission FAILED: Veil Ribbon — you left the course'));
});

test('a voided failure records the deposit it returned on the receipt', () => {
  const h = harness();
  const m = {
    id: 'void1', type: 'bounty_hunt', status: 'active', title: 'Mark', factionId: null,
    destStationId: 'station_helios', stationId: 'station_helios', reward_cr: 500, collateral_cr: 120,
    params: {}, targetEntityIds: [],
  };
  h.state.missions.active.push(m);
  h.missions._failMission(m, h.state.missions.active.indexOf(m), 'target_lost');
  const receipt = h.state.missions.receipts.find((row) => row.missionId === 'void1');
  assert.equal(receipt.collateralLostCr, 0);
  assert.equal(receipt.collateralRefundCr, 120);
});

test('story tracker lines name programs and branches, and the beat hints match the live beats', () => {
  const h = harness();
  h.state.story.branch = 'patrol';
  const b5 = h.missions._storyWaypointForBeat({ beat: 5, id: 'proving_ground' });
  assert.doesNotMatch(b5.reason, /complete patrol leg/, 'the internal branch id is not the copy');
  assert.match(b5.reason, /Accept and complete Concord patrol leg \d\/\d/);
  const b6 = h.missions._storyWaypointForBeat({ beat: 6, id: 'empire_seed' });
  assert.doesNotMatch(b6.reason, /patrol guard|mine to depot|_/);
  assert.match(b6.reason, /Drone program/);
  assert.doesNotMatch(BEAT_HINT[0], /mine ore|sell/);
  assert.match(BEAT_HINT[0], /47-A/);
  assert.doesNotMatch(BEAT_HINT[7], /wormhole/);
  assert.match(BEAT_HINT[7], /Ash Cache/);
});

test('a waypoint whose identity bind changes under the same id and position is republished', () => {
  const h = harness();
  const base = { kind: 'mission', missionId: 'm1', targetEntityId: 2, label: 'Mark', reason: 'r', pos: { x: 1, z: 1 } };
  h.missions._setNavWaypoint({ ...base, stable: { key: 'k1', durable: true, entityId: 2, stamp: null } });
  const before = h.waypoints.length;
  h.missions._setNavWaypoint({ ...base, stable: { key: 'k1', durable: true, entityId: 2, stamp: null } });
  assert.equal(h.waypoints.length, before, 'an identical bind is not re-emitted');
  h.missions._setNavWaypoint({ ...base, stable: { key: 'k2', durable: true, entityId: 2, stamp: null } });
  assert.equal(h.waypoints.length, before + 1, 'a changed bind is a new waypoint');
  assert.equal(h.state.nav.waypoint.stable.key, 'k2');
});
