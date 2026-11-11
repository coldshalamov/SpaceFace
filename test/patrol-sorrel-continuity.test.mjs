import { missionCommandBrief, storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { combat as combatProto } from '../src/systems/combat.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { BRANCH_CHAIN, FAIL_RECOVERY_COOLDOWN_S } from '../src/story/campaign47a/index.js';
import { missions as missionsProto } from '../src/systems/missions.js';

import { aftermathWrecks as aftermathProto } from '../src/systems/aftermathWrecks.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { capturePatrolPaperwork, normalizePatrolPaperwork, normalizePatrolObservations, patrolPaperworkAction, patrolPaperworkComparison, patrolContractBrief } from '../src/missions/patrolPaperwork.js';
import { captureEntityRecord, spawnSpecFromRecord } from '../src/world/worldRecords.js';
import { objectInfoLine } from '../src/ui/targetPanel.js';
const EXPECTED = Object.freeze({
  custody: Object.freeze({ branch: 'patrol', stationId: 'station_coalition', variant: 'custody_patrol' }),
  force: Object.freeze({ branch: 'traders', stationId: 'station_tethys', variant: 'force_manifest' }),
});

function harness(outcome) {
  const expected = EXPECTED[outcome];
  const state = createGameState(outcome === 'custody' ? 477 : 478);
  state.mode = 'flight';
  state.simTime = 60;
  state.playerId = 1;
  state.player.credits = 100_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };
  state.factions.faction_mts = { ...(state.factions.faction_mts || {}), rep: 100 };

  let nextId = 30;
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const aftermath = Object.assign({}, aftermathProto);
  aftermath.init({ state, bus, helpers, registry: { get: () => null } });
  const scanner = Object.assign({}, scannerProto);
  scanner.init({ state, bus, helpers, registry: { get: () => null } });
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.nav.waypoint = null;
  state.story.beatIndex = 5;
  state.story.branch = expected.branch;
  state.story.chainProgress = 0;
  state.story.flags.elroy_outcome = outcome;
  state.story.flags.pick_a_side_stake = outcome === 'custody' ? 'evidence_patrol' : 'manifest_charter';
  missions._syncCampaignSidecarAfterAdvance();
  missions._refreshNavigation({ forceStory: true, silent: true });
  return { state, bus, missions, credits, expected, aftermath, scanner, helpers, player };
}

function chainOffer(h) {
  const board = h.missions.ensureBoard(h.expected.stationId);
  const step = h.state.story.chainProgress + 1;
  const tag = `campaign47a:b5:${h.expected.branch}:${step}`;
  const offer = board.slots.find((row) => row.storyTag === tag);
  assert.ok(offer, `physical chain leg ${step} is posted`);
  return offer;
}

function acceptChainLeg(h) {
  const offer = chainOffer(h);
  assert.equal(h.missions.acceptMission(offer.id), true);
  const mission = h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
  assert.ok(mission);
  return mission;
}

function completePhysicalLeg(h, mission) {
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  for (const targetId of [...mission.targetEntityIds]) {
    h.bus.emit('entity:killed', { id: targetId, killerId: h.state.playerId });
  }
}


function fight() {
  const h = harness('custody');
  h.state.story.flags.weighing_receipt = { outcome: 'cleared_unverified' };
  const m = acceptChainLeg(h);
  h.state.world.currentSectorId = m.destSectorId;
  h.bus.emit('sector:enter', { sectorId: m.destSectorId });
  const target = h.state.entities.get(m.targetEntityIds[0]);
  assert.ok(target);
  h.player.pos = { ...target.pos };
  return { ...h, m, target };
}
function kill(h) {
  h.target.alive = false;
  h.bus.emit('entity:killed', { id: h.target.id, killerId: h.player.id, type: 'ship', pos: { ...h.target.pos } });
  const marker = h.state.aftermathWrecks.bySector[h.m.destSectorId]?.find(row => row.victimId === h.target.id);
  assert.ok(marker);
  const wreck = h.aftermath._resolveBoundWreck(marker.markerId);
  assert.ok(wreck);
  return { marker, wreck };
}
function scan(h) {
  h.state.input.actions ||= {}; h.state.input.actions.scanPulse = true;
  h.scanner.update(1 / 60, h.state);
}
const paperRows = h => h.state.aftermathWrecks.patrolObservations;
function pulse(h, seq = 1) {
  h.bus.emit('scan:pulse', { source: 'player-scanner', scannerId: h.player.id,
    scannerGeneration: h.player.occupantGeneration, seq, simTime: h.state.simTime,
    pos: { ...h.player.pos }, radius: 600 });
}
function resolved(h, marker, wreck, override = {}) {
  h.bus.emit('scan:wreckResolved', { wreckId: wreck.id, markerId: marker.markerId,
    sectorId: marker.sectorId, pos: { ...wreck.pos }, ...override });
}


function secondFight(h) {
  h.m = acceptChainLeg(h);
  h.bus.emit('sector:enter', { sectorId: h.m.destSectorId });
  h.target = h.state.entities.get(h.m.targetEntityIds[0]);
  assert.ok(h.target);
  h.player.pos = { ...h.target.pos };
  return h;
}

test('Sorrel briefing reads saved Sable evidence without asserting unseen second contents', () => {
  const h = fight(); kill(h); scan(h); secondFight(h);
  const brief = missionCommandBrief(h.m, h.state);
  assert.match(brief.why, /Sable’s label/);
  assert.match(brief.why, /compare its label yourself/);
  assert.match(brief.how, /scan.*optional/);
  assert.equal(patrolPaperworkComparison(h.state), '');
  delete paperRows(h).cap_sable_iask;
  assert.doesNotMatch(missionCommandBrief(h.m, h.state).why, /Sable/);
  assert.equal(patrolContractBrief(h.state, { ...h.m, storyTag: 'ordinary' }), null);
});

test('ordinary second kill closes Book 5 while Journal still offers the surviving optional scan', () => {
  const h = fight(); kill(h); scan(h); secondFight(h); const { marker } = kill(h);
  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(h.state.story.flags.proving_ground_complete, true);
  assert.equal(h.state.story.flags.proving_ground_variant, 'custody_patrol');
  const action = storyActionForBeat({beat:6}, h.state);
  assert.match(action.title, /Scan Redcut Sorrel/);
  assert.match(action.body, /Patrol is complete.*optional/);
  assert.match(action.body, /Weighing remains unverified/);
  assert.equal(patrolPaperworkComparison(h.state), '');
  marker.salvagePool = {};
  const missed = storyActionForBeat({beat:6}, h.state);
  assert.doesNotMatch(missed.title, /Scan|next Patrol/);
  assert.match(missed.body, /no second observed label/);
  assert.match(missed.body, /Deploy a drone/);
});

test('two actual scanner observations produce one comparison log, survive Continue and add no pay', () => {
  const h = fight(), logs=[];
  h.bus.on('comms:log', e=>logs.push(e));
  kill(h); scan(h); secondFight(h); const {marker,wreck}=kill(h);
  const paid = JSON.stringify(h.credits), receipt = JSON.stringify(h.state.story.flags.weighing_receipt);
  h.state.simTime += 20; scan(h);
  assert.ok(paperRows(h).cap_redcut_sorrel);
  assert.match(patrolPaperworkComparison(h.state), /Two defeated hulls/);
  assert.equal(logs.filter(e=>e.text.includes('Two defeated hulls')).length,1);
  assert.equal(JSON.stringify(h.credits), paid);
  assert.equal(JSON.stringify(h.state.story.flags.weighing_receipt), receipt);
  assert.equal(h.state.story.flags.helix_unmasked, undefined);
  const action = storyActionForBeat({beat:6}, h.state);
  assert.match(action.body, /both labels, not the records inside/);
  assert.match(action.body, /Deploy a drone/);
  assert.doesNotMatch(action.body, /Return to Coalition/);
  h.bus.emit('salvage:completed', {wreckId:wreck.id,markerId:marker.markerId,source:'player-beam'});
  const saved=JSON.parse(JSON.stringify(h.aftermath.serialize()));
  h.aftermath.deserialize(saved);h.aftermath.deserialize(saved);
  assert.deepEqual(storyActionForBeat({beat:6},h.state),action);
  resolved(h,marker,wreck);h.state.simTime+=20;scan(h);
  assert.equal(logs.filter(e=>e.text.includes('Two defeated hulls')).length,1);
  assert.equal(JSON.stringify(h.credits),paid);
});

test('unseen and malformed records cannot become a two-hull inference or override later books', () => {
  const h=fight();kill(h);scan(h);const row=paperRows(h).cap_sable_iask;
  h.state.story.beatIndex=6;
  paperRows(h).cap_redcut_sorrel={...row,captainId:'cap_redcut_sorrel'};
  assert.equal(patrolPaperworkComparison(h.state),'');
  assert.match(patrolPaperworkAction(h.state).body,/no second observed label/);
  h.state.story.beatIndex=7;assert.equal(patrolPaperworkAction(h.state),null);
  h.state.story.beatIndex=6;h.state.story.branch='traders';assert.equal(patrolPaperworkAction(h.state),null);
});


test('restored duplicate mission or marker identities cannot claim two independent hulls', () => {
  for (const duplicate of ['missionId', 'markerId', 'both']) {
    const h=fight();kill(h);scan(h);secondFight(h);kill(h);h.state.simTime+=20;scan(h);
    const rows=paperRows(h);
    if(duplicate!=='markerId')rows.cap_redcut_sorrel.missionId=rows.cap_sable_iask.missionId;
    if(duplicate!=='missionId')rows.cap_redcut_sorrel.markerId=rows.cap_sable_iask.markerId;
    h.aftermath.deserialize(JSON.parse(JSON.stringify(h.aftermath.serialize())));
    assert.equal(patrolPaperworkComparison(h.state),'',duplicate);
    const action=storyActionForBeat({beat:6},h.state);
    assert.match(action.body,/no second observed label/,duplicate);
    assert.doesNotMatch(action.body,/Two defeated hulls/,duplicate);
  }
});

test('Sorrel then surviving Sable scan order produces one comparison and preserves it', () => {
  const h = fight(), logs = [];
  h.bus.on('comms:log', e => logs.push(e));
  const first = kill(h); secondFight(h); const second = kill(h);
  // Controlled owner fixture: separate the wrecks so one physical scanner pulse cannot hit both.
  first.wreck.pos.x = second.wreck.pos.x + 1600; first.wreck.pos.z = second.wreck.pos.z;
  h.player.pos = { ...second.wreck.pos }; scan(h);
  assert.equal(paperRows(h).cap_sable_iask, undefined);
  assert.ok(paperRows(h).cap_redcut_sorrel);
  assert.equal(patrolPaperworkComparison(h.state), '');
  const paid = JSON.stringify(h.credits), receipt = JSON.stringify(h.state.story.flags.weighing_receipt);
  assert.match(storyActionForBeat({ beat: 6 }, h.state).title, /Sable/);
  h.player.pos = { ...first.wreck.pos }; h.state.simTime += 20; scan(h);
  assert.ok(paperRows(h).cap_sable_iask);
  assert.match(patrolPaperworkComparison(h.state), /Two defeated hulls/);
  assert.equal(logs.filter(e => e.text.includes('Two defeated hulls')).length, 1);
  assert.equal(JSON.stringify(h.credits), paid);
  assert.equal(JSON.stringify(h.state.story.flags.weighing_receipt), receipt);
  h.state.simTime += 20; scan(h);
  assert.equal(logs.filter(e => e.text.includes('Two defeated hulls')).length, 1);
  const action = storyActionForBeat({ beat: 6 }, h.state);
  const saved = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  h.aftermath.deserialize(saved); h.aftermath.deserialize(saved);
  assert.deepEqual(storyActionForBeat({ beat: 6 }, h.state), action);
});

test('consuming both unobserved hulks leaves the normal Book 6 asset route', () => {
  const h = fight(); const first = kill(h); secondFight(h); const second = kill(h);
  for (const item of [first, second]) h.bus.emit('salvage:completed', { wreckId: item.wreck.id, markerId: item.marker.markerId, source: 'player-beam' });
  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(patrolPaperworkComparison(h.state), '');
  const action = storyActionForBeat({ beat: 6 }, h.state);
  assert.equal(action.title, 'Plant income');
  assert.doesNotMatch(action.body, /Sable|Sorrel|Helix|sealed/);
});


test('generic identified wreck story cannot suppress independently scanned sealed paperwork', () => {
  const h=fight();kill(h);scan(h);secondFight(h);const {wreck}=kill(h);
  h.state.simTime+=20;scan(h);
  const base=objectInfoLine(wreck,h.state,h.player,0);
  assert.match(base,/Owner: VALE HOLDINGS LLC/);
  wreck.data.scanRevealed={story:'The scanner identifies the ordinary wreck story.'};
  assert.match(objectInfoLine(wreck,h.state,h.player,0),/Owner: VALE HOLDINGS LLC/);
  assert.match(objectInfoLine(wreck,h.state,h.player,0),/Seal closed/);
  wreck.data.scanned=false;
  assert.doesNotMatch(objectInfoLine(wreck,h.state,h.player,0),/Owner: VALE HOLDINGS LLC/);
  wreck.data.scanned=true;wreck.data.patrolPaperwork={...wreck.data.patrolPaperwork,missionId:''};
  assert.doesNotMatch(objectInfoLine(wreck,h.state,h.player,0),/Owner: VALE HOLDINGS LLC/);
});
