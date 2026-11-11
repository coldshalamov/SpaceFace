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
import { capturePatrolPaperwork, normalizePatrolPaperwork, normalizePatrolObservations, patrolPaperworkAction } from '../src/missions/patrolPaperwork.js';
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

test('real posted Sable kill captures before canonical settlement; ordinary scanner observes without rewards or Helix exposure', () => {
  const h = fight(), { marker, wreck } = kill(h);
  assert.ok(marker.patrolPaperwork, 'production ordering: aftermath before missions');
  assert.equal(h.state.missions.active.length, 0);
  assert.equal(h.state.story.chainProgress, 1);
  assert.equal(h.state.story.beatIndex, 5);
  assert.equal(h.state.story.flags.helix_unmasked, undefined);
  const paid = JSON.stringify(h.credits);
  assert.deepEqual(paperRows(h), {});
  assert.match(patrolPaperworkAction(h.state).title, /Scan Sable/);
  assert.match(objectInfoLine(wreck, h.state, h.player, 0), /Pulse scanner/);
  scan(h);
  assert.ok(paperRows(h).cap_sable_iask);
  assert.match(objectInfoLine(wreck, h.state, h.player, 0), /VALE HOLDINGS LLC/);
  assert.match(patrolPaperworkAction(h.state).body, /Weighing remains unverified/);
  assert.equal(JSON.stringify(h.credits), paid);
  assert.equal(h.state.story.chainProgress, 1);
  assert.equal(h.state.story.flags.helix_unmasked, undefined);
  const before = JSON.stringify(paperRows(h));
  resolved(h, marker, wreck); h.state.simTime += 15; scan(h);
  assert.equal(JSON.stringify(paperRows(h)), before);
});

test('real world-record roundtrip omits decorative data but authentic captain still captures', () => {
  const h = fight();
  const record = captureEntityRecord(h.target, { seed: h.state.meta.seed, sectorId: h.m.destSectorId, tick: h.state.tick, simTime: h.state.simTime });
  assert.ok(record);
  const spec = spawnSpecFromRecord(record);
  assert.ok(spec);
  const oldId = h.target.id;
  h.state.entities.delete(oldId); h.state.entityList = h.state.entityList.filter(e => e.id !== oldId);
  const restored = h.helpers.spawnEntity(spec);
  h.target = restored; h.m.targetEntityIds = [restored.id];
  h.player.pos = { ...restored.pos };
  assert.equal(restored.data.lastRegisteredOwner, undefined);
  assert.equal(restored.data.salvageCargo, undefined);
  const { marker } = kill(h);
  assert.ok(marker.patrolPaperwork);
  scan(h);
  assert.ok(paperRows(h).cap_sable_iask);
});

test('foreign, conflicting, missing and stale target identities cannot plant paperwork', () => {
  for (const change of [
    h => { h.target.data.worldRecordId = 'foreign'; },
    h => { h.target.data.identityKey = 'mission:foreign:0'; },
    h => { h.target.data.missionTargetSlot = 1; },
    h => { h.target.data.storyTargetId = 'cap_redcut_sorrel'; },
    h => { h.m.targetEntityIds = []; },
    h => { h.state.entities.delete(h.target.id); },
    h => { h.m.status = 'completed'; },
    h => { h.m.storyTag = 'campaign47a:b5:traders:1'; },
    h => { h.m.storyTarget.salvageCargo = 'invented cargo'; },
  ]) {
    const h = fight(); h.target.alive = false; change(h);
    assert.equal(capturePatrolPaperwork(h.state, h.target), null);
  }
});

test('missing, delayed, replayed and foreign scan evidence is rejected', () => {
  for (const attack of ['missing', 'late', 'foreignId', 'foreignSector', 'replaced', 'generation', 'ended', 'removed', 'outOfRange']) {
    const h = fight(), { marker, wreck } = kill(h);
    if (attack === 'outOfRange') h.player.pos.x += 10000;
    if (attack !== 'missing') pulse(h);
    wreck.data.scanned = true;
    if (attack === 'late') h.state.simTime += 1;
    if (attack === 'replaced') h.state.entities.set(wreck.id, { ...wreck });
    if (attack === 'generation') wreck.occupantGeneration = 999;
    if (attack === 'ended') h.bus.emit('scan:completed', {});
    if (attack === 'removed') h.state.entities.delete(wreck.id);
    resolved(h, marker, wreck, attack === 'foreignId' ? { wreckId: 'foreign' }
      : attack === 'foreignSector' ? { sectorId: 'sector_helios_prime' } : {});
    assert.deepEqual(paperRows(h), {}, attack);
  }
});

test('observation survives serialized consumed wreck; restoring unobserved body requires a new real pulse', () => {
  const h = fight(), { marker, wreck } = kill(h);
  const unobserved = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  scan(h);
  const observed = JSON.stringify(paperRows(h));
  h.bus.emit('salvage:completed', { wreckId: wreck.id, markerId: marker.markerId, source: 'player-beam' });
  const consumed = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  assert.equal(consumed.bySector[marker.sectorId]?.some(m => m.markerId === marker.markerId) || false, false);
  h.aftermath.deserialize(consumed);
  assert.equal(JSON.stringify(paperRows(h)), observed);
  h.aftermath.deserialize(consumed);
  assert.equal(JSON.stringify(paperRows(h)), observed);
  resolved(h, marker, wreck);
  assert.equal(JSON.stringify(paperRows(h)), observed);
  h.state.entities.delete(wreck.id); h.state.entityList = h.state.entityList.filter(e => e.id !== wreck.id);
  h.aftermath.deserialize(unobserved); h.bus.emit('save:loaded', {});
  assert.deepEqual(paperRows(h), {});
  const restored = h.aftermath._resolveBoundWreck(marker.markerId);
  assert.ok(restored && restored !== wreck);
  resolved(h, marker, wreck);
  assert.deepEqual(paperRows(h), {});
  h.player.pos = { ...restored.pos }; h.state.simTime += 15; scan(h);
  assert.ok(paperRows(h).cap_sable_iask);
});

test('normalization bounds history, rejects malformed records and leaves legacy saves and other branches alone', () => {
  assert.deepEqual(normalizePatrolObservations({ fake: { version: 1 } }), {});
  assert.equal(normalizePatrolPaperwork({ version: 2 }), null);
  const h = fight(); kill(h); scan(h);
  const row = paperRows(h).cap_sable_iask;
  assert.deepEqual(normalizePatrolObservations({ cap_sable_iask: { ...row, observedAt: Infinity } }), {});
  assert.deepEqual(normalizePatrolObservations({ cap_sable_iask: { ...row, markerId: 'x'.repeat(161) } }), {});
  h.state.story.branch = 'traders'; assert.equal(patrolPaperworkAction(h.state), null);
  h.aftermath.deserialize({ schemaVersion: 2, bySector: {}, causes: {} });
  assert.deepEqual(paperRows(h), {});
  h.aftermath.newGame(); assert.deepEqual(paperRows(h), undefined);
});

test('Journal defers to an active next leg and never promises an exhausted record', () => {
  const h = fight(), { marker, wreck } = kill(h);
  assert.match(patrolPaperworkAction(h.state).title, /Scan/);
  marker.salvagePool = {};
  assert.equal(patrolPaperworkAction(h.state), null);
  marker.salvagePool = { cmdty_scrap_metal: 1 };
  scan(h);
  assert.match(patrolPaperworkAction(h.state).title, /next Patrol/);
  acceptChainLeg(h);
  assert.equal(patrolPaperworkAction(h.state), null);
});

test('stripping an unscanned body cannot become a recovered-label receipt', () => {
  const h = fight(), { marker, wreck } = kill(h);
  h.bus.emit('salvage:completed', { wreckId: wreck.id, markerId: marker.markerId, source: 'player-beam' });
  pulse(h); wreck.data.scanned = true; resolved(h, marker, wreck);
  assert.deepEqual(paperRows(h), {});
  assert.equal(patrolPaperworkAction(h.state), null);
});

test('foreign pulse source, scanner, generation, stale clock and replayed sequence carry no witness', () => {
  for (const edit of [
    p => { p.source = 'ambient'; }, p => { p.scannerId = 999; },
    p => { p.scannerGeneration = 999; }, p => { p.simTime -= 1; },
    p => { p.pos.x += 1; }, p => { p.seq = 0; },
  ]) {
    const h = fight(), { marker, wreck } = kill(h);
    const p = { source: 'player-scanner', scannerId: h.player.id, scannerGeneration: h.player.occupantGeneration,
      seq: 1, simTime: h.state.simTime, pos: { ...h.player.pos }, radius: 600 };
    edit(p); h.bus.emit('scan:pulse', p); wreck.data.scanned = true; resolved(h, marker, wreck);
    assert.deepEqual(paperRows(h), {});
  }
  const h = fight(), { marker, wreck } = kill(h);
  pulse(h); h.bus.emit('scan:completed', {}); pulse(h);
  wreck.data.scanned = true; resolved(h, marker, wreck);
  assert.deepEqual(paperRows(h), {});
});


function impactOwner(h) {
  const combat = Object.assign({}, combatProto);
  combat.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } });
  return (target, amount) => {
    const packet = scalarHitToDamagePacket({ damage: amount, damageType: 'kinetic', pos: target.pos,
      source: { kind: 'collision', impulseProvenance: 'direct_contact' } });
    // Same packet admission as collisionConsequences: dead hulls still take physical blows.
    packet.flags = { allowAnyTarget: true, ignoreFriendlyFire: true };
    return combat.ensureKernel().routeDamage({ attackerId: null, targetId: target.id,
      packet, origin: { kind: 'collision', id: 'craft' } });
  };
}

test('new paper hulk survives ordinary scrape damage, saves damage, and still dies through the canonical combat owner', () => {
  const h = fight(), { marker, wreck } = kill(h), hit = impactOwner(h);
  assert.equal(wreck.hull, 60); assert.equal(wreck.hullMax, 60);
  assert.equal(wreck.data.invulnerable, undefined); assert.equal(wreck.flags?.invuln, undefined);
  const paid = JSON.stringify(h.credits);
  const result = hit(wreck, 3.80159919433598);
  assert.ok(result.ok);
  assert.ok(wreck.alive && wreck.hull > 56 && wreck.hull < 57);
  const remaining = wreck.hull;
  const saved = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  assert.equal(saved.bySector[marker.sectorId].find(m => m.markerId === marker.markerId).wreckHull, remaining);
  h.state.entities.delete(wreck.id); h.state.entityList = h.state.entityList.filter(e => e !== wreck);
  h.aftermath.deserialize(saved); h.bus.emit('save:loaded', {});
  const restored = h.aftermath._resolveBoundWreck(marker.markerId);
  assert.equal(restored.hull, remaining); assert.equal(restored.hullMax, 60);
  h.player.pos = { ...restored.pos }; scan(h);
  assert.ok(paperRows(h).cap_sable_iask, 'normal scan remains possible after scrape and Continue');
  const observation = JSON.stringify(paperRows(h));
  assert.ok(hit(restored, 100).ok);
  assert.equal(restored.alive, false);
  assert.equal(h.aftermath._markerById(marker.markerId), null);
  assert.equal(JSON.stringify(paperRows(h)), observation);
  assert.equal(JSON.stringify(h.credits), paid);
  const terminal = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  h.aftermath.deserialize(terminal); h.bus.emit('save:loaded', {});
  assert.equal(h.aftermath._resolveBoundWreck(marker.markerId), null);
  assert.equal(h.aftermath._markerById(marker.markerId), null);
  assert.equal(JSON.stringify(paperRows(h)), observation);
});

test('saved legacy paperwork and unrelated wrecks retain 1HP; explicit zero never rematerializes', () => {
  const h = fight(), { marker, wreck } = kill(h);
  const saved = JSON.parse(JSON.stringify(h.aftermath.serialize()));
  const row = saved.bySector[marker.sectorId].find(m => m.markerId === marker.markerId);
  delete row.wreckHull; delete row.wreckHullMax;
  h.state.entities.delete(wreck.id); h.state.entityList = h.state.entityList.filter(e => e !== wreck);
  h.aftermath.deserialize(saved); h.bus.emit('save:loaded', {});
  const legacy = h.aftermath._resolveBoundWreck(marker.markerId);
  assert.equal(legacy.hull, 1); assert.equal(legacy.hullMax, 1);
  h.state.entities.delete(legacy.id); h.state.entityList = h.state.entityList.filter(e => e !== legacy);
  row.wreckHull = 0; row.wreckHullMax = 1;
  h.aftermath.deserialize(saved); h.bus.emit('save:loaded', {});
  assert.equal(h.aftermath._resolveBoundWreck(marker.markerId), null);
  const ordinary = fight(); ordinary.m.storyTarget.namedCaptainId = 'not_authored';
  const foreign = kill(ordinary);
  assert.equal(foreign.marker.patrolPaperwork, null);
  assert.equal(foreign.wreck.hull, 1); assert.equal(foreign.wreck.hullMax, 1);
});
