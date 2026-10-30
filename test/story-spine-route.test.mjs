// Story spine on the live missions route. Seed 4242.
// Signals go through the missions bus. The sidecar is read back, not poked.
//
// Run: node --test --test-timeout=120000 test/story-spine-route.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { freshMorrowMemory } from '../src/data/morrow.js';
import { STORY_BRANCH_INTRO_TAG } from '../src/data/missions.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { addCargo } from '../src/systems/cargo.js';
// Books 1–2 are physical work, not emitted claims: the refinery mites are borrowed
// ecology fauna, the disposal pods cross the real CR-FEED intake, a Cinder hull reaches
// Rook's pad as an aftermath-bound wreck, the Compost Run reads the garden owner's
// persisted growth, and the Nest receipt comes from the encounter owner itself.
import { aftermathWrecks as aftermathProto } from '../src/systems/aftermathWrecks.js';
import { createRookBooth } from '../src/systems/rookBooth.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { understoryGardens as understoryProto } from '../src/systems/faction_understory.js';
import { UNDERSTORY_RECEIVER } from '../src/data/understoryReceiver.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { furnaceMouthGlobal } from '../src/missions/furnaceWorksite.js';
import { materializeAlienEcology, handleAlienEcologyEvent } from '../src/systems/alienEcology.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { encounterDirector as encounterDirectorProto } from '../src/systems/encounterDirector.js';
import { runtime as nestRuntime } from '../src/data/encounters/705-the-nest.js';
import { tickNestVisit } from '../src/systems/nestVisit.js';
import { NEST_VISIT, nestApproach } from '../src/data/nestVisit.js';
import {
  BRANCH_CHAIN,
  CAMPAIGN_BEATS,
  FAIL_RECOVERY_COOLDOWN_S,
  buildMissionBoardContract,
  recoveryCommsForBeat,
} from '../src/story/campaign47a/index.js';
import { depthContactsForStation } from '../src/story/campaign47a/embodiedDialogue.js';
import { readSpine } from '../src/story/campaign47a/storySpine.js';
import { createWrittenFinale } from '../src/story/endings/finaleRuntime.js';
import { readLifeLedger } from '../src/story/endings/lifeLedger.js';

const SEED = 4242;

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

function makeHarness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = state.factions[id] || { rep: 0, aggro: false };
    state.factions[id].rep = 0;
  }
  state.run = { ...(state.run || {}), kind: 'adventure' };
  state.entities = state.entities || new Map();
  state.entities.set(1, {
    id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 },
    flags: {}, hull: 100, maxHull: 100,
  });
  state.entityList = [state.entities.get(1)];
  state.onboarding = { active: false, finished: true };
  if (state.settings && state.settings.gameplay) state.settings.gameplay.tutorialHints = false;

  const bus = createBus();
  bus.on('economy:grantCredits', (p) => {
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });
  bus.on('faction:repDelta', (p) => {
    if (!p || !p.factionId) return;
    const faction = state.factions[p.factionId] || (state.factions[p.factionId] = { rep: 0 });
    faction.rep = (faction.rep || 0) + (p.delta || 0);
  });
  const helpers = {
    hash32, mulberry32,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const id = state.entities.size ? Math.max(...state.entities.keys()) + 1 : 1;
      const entity = { id, alive: true, ...spec, data: structuredClone(spec.data || {}) };
      state.entities.set(id, entity);
      state.entityList = state.entityList || [];
      state.entityList.push(entity);
      return entity;
    },
    removeEntity: (id) => {
      const e = state.entities.get(id);
      if (e) e.alive = false;
      state.entityList = (state.entityList || []).filter((row) => row !== e);
      state.entities.delete(id);
    },
  };
  const missions = cloneSystem(missionsProto);
  const story = cloneSystem(storyProto);
  const heat = cloneSystem(heatProto);
  const aftermath = cloneSystem(aftermathProto);
  const understory = cloneSystem(understoryProto);
  const rook = createRookBooth();
  const furnace = createFurnaceIntake();
  const systems = {
    missions, story, heat,
    aftermathWrecks: aftermath, rookBooth: rook, furnaceIntake: furnace,
    understoryGardens: understory,
  };
  const registry = { get: (name) => systems[name] || null };
  const ctx = { state, bus, helpers, registry };
  missions.init(ctx);
  story.init(ctx);
  heat.init(ctx);
  aftermath.init(ctx);
  rook.init(ctx);
  furnace.init(ctx);
  understory.init(ctx);
  missions.newGame();
  story._ensureState(true);
  // Same ecology functions the world calls: real cast creation and the durable
  // death ledger the furnace worksite borrows its clearance count from.
  const ecologyWorld = { state, bus, helpers, registry, active: { dressing: [], pois: [] },
    _toGlobal: sectorLocalToGlobalForSector };
  bus.on('entity:killed', (p) => handleAlienEcologyEvent(ecologyWorld, 'entity:killed', p));
  return { state, bus, missions, story, heat, helpers,
    aftermath, rook, furnace, understory, ecologyWorld, systems, registry };
}

function barLine(state, id) {
  const card = depthContactsForStation('station_helios', state).find((row) => row.id === id);
  return card ? card.blurb : null;
}

function acceptEmbodiedOffer(h, stationId, expectedTag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((row) => row && row.storyTag === expectedTag);
  assert.ok(offer, `missing authored offer ${expectedTag} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${expectedTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === expectedTag);
  assert.ok(mission, `missing active mission ${expectedTag}`);
  return mission;
}

function acceptStoryOffer(h, stationId, tagPrefix) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board.slots.find((row) => String(row.storyTag || '').startsWith(tagPrefix));
  assert.ok(offer, `missing story offer ${tagPrefix} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${offer.storyTag}`);
  const mission = h.state.missions.active.find((row) => row.storyTag === offer.storyTag);
  assert.ok(mission, `missing active mission ${offer.storyTag}`);
  return mission;
}

function completeSpineSetPiece(h, mission) {
  assert.equal(mission.status, 'active');
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  if (mission.type === 'demolition' || mission.type === 'authored_set_piece') {
    const role = mission.type === 'authored_set_piece' ? (mission.params && mission.params.primaryRole) : null;
    const target = role
      ? mission.targetEntityIds.map((id) => h.state.entities.get(id)).find((entity) => entity && entity.data && entity.data.physicalRole === role)
      : h.state.entities.get(mission.targetEntityIds[0]);
    assert.ok(target, `${mission.type} needs a physical target`);
    h.bus.emit('tether:whipImpact', {
      victimId: target.id, targetId: h.state.playerId, rating: 'solid', relSpeed: 90,
    });
    return;
  }
  if (mission.type === 'rescue_under_fire' || mission.type === 'tow_recovery') {
    const role = mission.type === 'rescue_under_fire' ? 'life_pod' : 'slag_core';
    const target = mission.targetEntityIds
      .map((id) => h.state.entities.get(id))
      .find((entity) => entity && entity.data && entity.data.physicalRole === role);
    assert.ok(target, `${mission.type} needs ${role}`);
    let berth = [...h.state.entities.values()].find((entity) => (
      entity && entity.type === 'station' && entity.data && entity.data.stationId === mission.destStationId
    ));
    if (!berth) {
      berth = h.helpers.spawnEntity({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 80 },
      });
    }
    h.bus.emit('tether:latched', { targetId: target.id });
    target.pos = { x: berth.pos.x, z: berth.pos.z };
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
  }
}

/** A real death: the body dies first, then the kill event reports it — the same
 *  observable contract combat's kill producer publishes on the live route. */
function killEntity(h, entity) {
  assert.ok(entity && entity.alive !== false, 'a live body to kill');
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId: h.state.playerId, type: entity.type,
    pos: { x: entity.pos.x, z: entity.pos.z },
  });
}

/** Move one owned disposal pod across the CR-FEED lip and let the real intake emit
 *  its canonical receipt. Unbound furnace:fed payloads are not evidence. */
function feedFurnaceLot(h, m, slot) {
  const lot = m.params.furnaceLots.find((row) => row.slot === slot);
  const pod = h.state.entities.get(lot.entityId);
  assert.ok(pod && pod.alive && pod.data.furnaceMissionId === m.id, 'real owned disposal pod');
  pod.pos = { ...furnaceMouthGlobal() };
  pod.vel = { x: 0, z: 0 };
  h.furnace.update();
  assert.equal(lot.received, true, 'intake emitted the canonical owned receipt');
  assert.equal(pod.alive, false);
}

/** The furnace worksite's targets are borrowed ecology fauna: the site cast must exist
 *  before the mission borrows it, exactly as the world's sector materialization does. */
function materializeWorksiteDest(h, m) {
  h.state.world.currentSectorId = m.destSectorId;
  materializeAlienEcology(h.ecologyWorld, { id: m.destSectorId }, h.ecologyWorld.active,
    [ALIEN_SITES.closed_refinery]);
  h.bus.emit('sector:enter', { sectorId: m.destSectorId });
  h.missions.spawnTargetsForSector(m.destSectorId);
  h.missions._ensureMissionTargets(m);
}

/** Book 1's furnace detail: clear the four marked mite sites, then settle all three
 *  owned disposal lots through the CR-FEED intake. Kills alone never settle it. */
function completeFurnaceDetail(h, m) {
  materializeWorksiteDest(h, m);
  assert.equal(m.targetEntityIds.length, 4, 'four real refinery mites');
  for (const id of [...m.targetEntityIds]) killEntity(h, h.state.entities.get(id));
  // Ecology's durable death ledger is written on entity:killed; reconcile it into progress.
  h.missions._ensureMissionTargets(m);
  assert.equal(m.objectiveProgress, 4, 'mite clearance is the cleared-site ledger');
  for (let slot = 0; slot < 3; slot++) feedFurnaceLot(h, m, slot);
  assert.equal(m.status, 'completed', 'clearance plus three settled lots completes the detail');
}

/** Book 2's Cinder board: three real marked Wasps down, one of their actual hulls parked
 *  inside Rook's 100-WU ring at rest — the booth owner emits the canonical receipt. */
function deliverCinderHull(h, m) {
  assert.equal(m.objectiveProgress, 3);
  assert.equal(m.params.cinderMarkedWrecks.length, 3, 'real deaths produced canonical markers');
  const ref = m.params.cinderMarkedWrecks[0];
  const wreck = h.aftermath._resolveBoundWreck(ref.markerId);
  assert.ok(wreck && wreck.alive, 'recover the real aftermath hull');
  wreck.pos = { ...rookPadPosition() };
  wreck.vel = { x: 0, z: 0 };
  h.rook.update();
  assert.equal(m.params.cinderDeliveredMarkerId, ref.markerId);
  assert.equal(m.status, 'completed', 'the marked hull delivered settles the Cinder board');
}

/** Book 2's Compost Run: a surviving marked hull is fed to the real authored receiver
 *  while player-tethered, so the garden owner's persisted first-growth receipt exists. */
function feedReceivingGarden(h, m) {
  h.understory.update(1 / 60, h.state);
  const garden = h.state.entityList.find((e) => e.alive !== false
    && e.data?.gardenId === UNDERSTORY_RECEIVER.gardenId);
  assert.ok(garden, 'the real authored receiving garden is present');
  const wreck = m.params.cinderMarkedWrecks
    .map((ref) => h.aftermath._resolveBoundWreck(ref.markerId))
    .find((e) => e && e.alive !== false);
  assert.ok(wreck, 'feed one surviving actual Cinder hull, not a synthetic garden event');
  wreck.pos = { ...garden.pos };
  wreck.vel = { x: 0, z: 0 };
  h.state.player.tether = { active: true, targetId: wreck.id };
  h.understory.update(1 / 60, h.state);
  h.state.player.tether = null;
  assert.equal(wreck.alive, false, 'the garden actually consumed the bound hull');
  assert.ok(garden.data.gardenFirstPlayerGrowth, 'the owner persisted the player growth receipt');
}

/** Book 2's Nest: the authored arrival admits through the encounter owner; withdrawing
 *  alive is a real outcome the owner's terminal receipt records — not a claimed event. */
function visitNest(h) {
  const { state, bus, helpers, registry } = h;
  const director = Object.assign({}, encounterDirectorProto);
  h.systems.encounterDirector = director;
  director.init({ state, bus, helpers, registry });
  state.world.currentSectorId = NEST_VISIT.sectorId;
  state.entities.get(state.playerId).pos = { ...nestApproach() };
  // This harness attaches the director late. Accrue the preceding flight through its
  // real owner rather than granting pressure or forcing past the pacing gate.
  state.simTime += 600;
  director._accrue(state.encounterDirector, state, 600);
  const admission = tickNestVisit(director);
  assert.equal(admission.ok, true, `Nest admission: ${admission.reason}`);
  const live = Object.values(state.encounterDirector.live || {})
    .find((row) => row.shapeId === 'the_nest');
  assert.ok(live, 'the ordinary authored approach admits the real encounter');
  const carrier = state.entities.get(live.data.nest.carrierId);
  assert.ok(carrier && carrier.alive !== false, 'a real carrier was admitted');
  state.simTime = live.data.nest.nextLaunchS + 0.1;
  nestRuntime.tick(director, live, state, state.simTime);
  const wasp = state.entities.get(live.data.nest.waspIds[0]);
  assert.ok(wasp && wasp.alive !== false, 'one genuine Wasp launched');
  state.entities.get(state.playerId).pos = { x: carrier.pos.x + 3100, z: carrier.pos.z };
  nestRuntime.tick(director, live, state, state.simTime);
  assert.equal(live.outcome, 'carrier_escapes');
}

function completePhysicalMission(h, mission) {
  assert.equal(mission.status, 'active');
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  if (mission.type === 'smuggling_run') {
    const qty = Math.max(1, mission.params.qty || 1);
    assert.equal(addCargo(h.state, mission.params.cmdtyId, qty), qty);
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  // W-BOOKS-3-4: Spine Break is an escort — the convoy lead must reach the dock
  // ring alive, then the berth read settles it. Killing the escortee fails the op.
  if (mission.type === 'escort') {
    h.missions._ensureMissionTargets(mission);
    const berth = [...h.state.entities.values()].find((entity) => (
      entity && entity.type === 'station' && entity.data && entity.data.stationId === mission.destStationId
    )) || h.helpers.spawnEntity({
      type: 'station', pos: { x: 0, z: 0 }, radius: 40,
      data: { stationId: mission.destStationId, dockRadius: 140 },
    });
    const lead = h.state.entities.get(mission._escorteeId);
    assert.ok(lead, `${mission.storyTag} must spawn a convoy lead`);
    lead.pos = { x: berth.pos.x + 20, z: berth.pos.z };
    h.missions.update(0.016, h.state);
    assert.equal(mission._escorteeArrived, true, 'the convoy lead reaches the dock ring');
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  // Deaths are real: the body dies and the canonical kill event follows. A kill
  // that settles the mission despawns the rest of its cast — only living bodies
  // can die.
  for (const targetId of [...mission.targetEntityIds]) {
    const entity = h.state.entities.get(targetId);
    if (entity && entity.alive !== false) killEntity(h, entity);
  }
}

function postedB1(h) {
  const board = h.missions.ensureBoard('station_helios');
  return board.slots.find((row) => row && row.storyTag === 'campaign47a:b1:alloy_run');
}

// W-BOOKS-0-2 (§34.7): the book plays contracts alternating with world signals.
function completeBookContract(h, mission) {
  if (mission.type === 'cargo_delivery') {
    addCargo(h.state, mission.params.cmdtyId, Math.max(1, mission.params.qty || 1));
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  if (mission.type === 'patrol_clear' || mission.type === 'bounty_hunt') {
    if (mission.params?.furnaceWorksiteVersion === 1) {
      completeFurnaceDetail(h, mission);
      return;
    }
    h.state.world.currentSectorId = mission.destSectorId;
    h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
    h.missions.spawnTargetsForSector(mission.destSectorId);
    h.missions._ensureMissionTargets(mission);
    if (mission.type === 'bounty_hunt') {
      const targetId = mission.targetEntityIds[0];
      // The scan reads proximity: close on the contact before resolving it.
      h.state.entities.get(h.state.playerId).pos = { x: 0, z: 0 };
      h.state.entities.get(targetId).pos = { x: 5, z: 0 };
      h.bus.emit('scan:completed', { targetId });
    }
    for (const id of [...mission.targetEntityIds]) {
      const entity = h.state.entities.get(id);
      if (entity && entity.alive !== false) killEntity(h, entity);
    }
    return;
  }
  completeSpineSetPiece(h, mission);
}

function playBookBeat1(h) {
  completeBookContract(h, acceptEmbodiedOffer(h, 'station_helios', 'campaign47a:b1:alloy_run'));
  h.bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  completeBookContract(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b1:infested'));
}

function playBookBeat2(h) {
  // B2's book list is physical: three real marked Wasps down, a bound hull on
  // Rook's pad, a surviving hull fed to the authored garden, the owner's Nest
  // receipt — then the Elroy writ.
  const cinder = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:cinder');
  completeBookContract(h, cinder);
  deliverCinderHull(h, cinder);
  feedReceivingGarden(h, cinder);
  visitNest(h);
  completeBookContract(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:elroy'));
}

// W-BOOKS-3-4 (§34.7): Book 3 is Slate's yard list — the berth tow, the maw fed
// on three slag stuns, then the Foreman's capital hull down.
function playBookBeat3(h) {
  completeSpineSetPiece(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:berth'));
  const maw = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:maw');
  h.state.world.currentSectorId = maw.destSectorId;
  h.bus.emit('sector:enter', { sectorId: maw.destSectorId });
  h.missions.spawnTargetsForSector(maw.destSectorId);
  h.missions._ensureMissionTargets(maw);
  const mawBody = maw.targetEntityIds
    .map((id) => h.state.entities.get(id))
    .find((e) => e && e.data && e.data.furnaceMaw === true);
  assert.ok(mawBody, 'the maw materializes as a furnace-marked body');
  for (let i = 0; i < (maw.params.mawStunsNeeded || 3); i++) {
    h.bus.emit('tether:whipImpact', { victimId: mawBody.id, rating: 'solid' });
  }
  completeSpineSetPiece(h, maw);
  assert.equal(maw.status, 'completed', 'three slag stuns and the maw tows off the lane');
  completePhysicalMission(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:foreman'));
}

test('Cold Start ignores freight and a kill, then remembers the sample and R-07', () => {
  const h = makeHarness();
  const morrow = freshMorrowMemory();
  morrow.met = true;
  morrow.visits = 1;
  h.state.morrow = morrow;
  const morrowJson = JSON.stringify(h.state.morrow);

  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0);
  h.bus.emit('economy:tradeCompleted', {
    side: 'sell', stationId: 'station_helios', commodityId: 'cmdty_food', qty: 4,
  });
  h.bus.emit('entity:killed', { id: 404, killerId: h.state.playerId });
  assert.equal(h.state.story.beatIndex, 0, 'a sale or a kill is not the Cold Start sample');
  assert.equal(barLine(h.state, 'contact_maera_vols'), 'R-07 has your hull. The engines stayed warm.');

  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(h.state.story.beatIndex, 0);
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);
  assert.equal(readSpine(h.state).solved['0'].stepId, 'dock');
  assert.equal(barLine(h.state, 'contact_maera_vols'), 'You docked the variance sample here.');
  assert.equal(barLine(h.state, 'contact_halev_doss'), 'Filed in the margin: you met R-07.');
  assert.equal(JSON.stringify(h.state.morrow), morrowJson);
});

test('a missed job stays beat 1, the book re-posts, and both contacts remember the furnace', () => {
  const h = makeHarness();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  const mission = acceptEmbodiedOffer(h, 'station_helios', 'campaign47a:b1:alloy_run');
  h.missions._failMission(mission, h.state.missions.active.indexOf(mission), 'crate_lost');
  assert.equal(h.state.story.beatIndex, 1);
  assert.equal(h.state.story.campaign47a.beatStatus, 'failed');
  const ask = readSpine(h.state).situation;
  assert.equal(ask.beat, 1);
  assert.equal(ask.attempt, 1);
  assert.equal(ask.closedMethod, null);
  assert.ok(ask.instruction, 'a miss still names the open job');
  assert.equal(CAMPAIGN_BEATS[1].recovery.line, 'Honest work still on the board. The book re-posts the next job.');
  assert.match(recoveryCommsForBeat(1).text, /book|board/i);

  const live = postedB1(h);
  assert.ok(live, 'the alloy run is back on the Helios board');
  assert.equal(live.storyTag, 'campaign47a:b1:alloy_run');
  const remembered = buildMissionBoardContract(1, { seed: SEED, epoch: 1, state: h.state });
  assert.equal(remembered.brief, ask.instruction);
  assert.equal(remembered.title, live.title);
  assert.equal(remembered.type, live.type);
  assert.equal(remembered.storyTag, live.storyTag);

  h.state.simTime += FAIL_RECOVERY_COOLDOWN_S + 1;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.campaign47a.beatStatus, 'tracking');
  assert.equal(readSpine(h.state).situation.askId, ask.askId);
  assert.equal(readSpine(h.state).situation.rearmed, true);

  playBookBeat1(h);
  assert.equal(h.state.story.beatIndex, 2);
  const solved = readSpine(h.state).solved['1'];
  assert.equal(solved.verb, 'burn');
  assert.equal(solved.stepId, 'infested');
  assert.equal(readSpine(h.state).situation, null);
  assert.equal(readSpine(h.state).closed.at(-1).askId, ask.askId);
  assert.equal(barLine(h.state, 'contact_maera_vols'), 'You fed the hauler to the furnace.');
  assert.equal(barLine(h.state, 'contact_halev_doss'), 'Filed: a miss, then the furnace.');
});

test('the played road survives save and Continue and is cited at the ending', () => {
  const h = makeHarness();
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  playBookBeat1(h);
  assert.equal(h.state.story.beatIndex, 2, 'the book list closes Honest Work');
  playBookBeat2(h);
  assert.equal(h.state.story.beatIndex, 3, 'the writ closes First Blood');
  h.bus.emit('ship:purchased', {
    defId: 'ship_drifter', hullId: 'ship_drifter', stationId: 'station_tethys', price: 9000,
  });
  assert.equal(h.state.story.beatIndex, 3, 'buying a hull does not tow the core');
  playBookBeat3(h);
  assert.equal(h.state.story.beatIndex, 4);

  const intro = acceptStoryOffer(h, 'station_tethys', STORY_BRANCH_INTRO_TAG);
  assert.equal(h.state.story.branch, null);
  assert.equal(readSpine(h.state).door, 'traders');
  completePhysicalMission(h, intro);
  assert.equal(h.state.story.branch, 'traders');
  // W-BOOKS-3-4: the intro settles the door; the door's own operation closes the book.
  assert.equal(h.state.story.beatIndex, 4, 'the door operation still owes');
  const doorOp = acceptStoryOffer(h, 'station_tethys', 'campaign47a:b4:operation');
  completePhysicalMission(h, doorOp);
  assert.equal(h.state.story.beatIndex, 5);
  assert.deepEqual(readSpine(h.state).refused.slice().sort(), ['free', 'patrol']);

  for (let step = 0; step < BRANCH_CHAIN.traders.count; step += 1) {
    completePhysicalMission(h, acceptStoryOffer(h, 'station_tethys', `campaign47a:b5:traders:${step + 1}`));
  }
  assert.equal(h.state.story.beatIndex, 6);
  assert.equal(readSpine(h.state).solved['5'].stepId, 'chain_complete');

  h.bus.emit('asset:deployed', {
    kind: 'drone', id: 'seed-live', defId: 'drone_mk1', sectorId: 'sector_helios_prime',
  });
  assert.equal(h.state.story.beatIndex, 6);
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-live', templateId: 'mine_to_depot' });
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(readSpine(h.state).solved['6'].stepId, 'asset_deploy');

  h.state.player.credits = Math.max(250_000, h.state.player.credits || 0);
  for (const factionId of ['faction_scn', 'faction_mts', 'faction_free']) {
    h.state.factions[factionId].rep = Math.max(80, h.state.factions[factionId].rep || 0);
  }
  h.missions.update(0.016, h.state);
  const climax = acceptStoryOffer(h, 'station_ashcache', 'campaign47a:b7:');
  completeSpineSetPiece(h, climax);
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.beatIndex, 7);

  const road = readSpine(h.state);
  assert.equal(road.door, 'traders');
  assert.equal(road.solved['1'].verb, 'burn');
  assert.equal(road.solved['2'].verb, 'hunt');
  // W-BOOKS-3-4: the yard list's last filed verb is the Foreman's feud.
  assert.equal(road.solved['3'].verb, 'throw');
  assert.equal(road.solved['3'].stepId, 'foreman');

  const blob = JSON.parse(JSON.stringify(h.missions.serialize()));
  const continued = makeHarness();
  continued.missions.deserialize(blob);
  continued.story.deserialize({ story: blob.story });
  assert.equal(continued.state.story.beatIndex, 7);
  assert.equal(continued.state.story.branch, 'traders');
  assert.equal(readSpine(continued.state).door, 'traders');
  assert.deepEqual(readSpine(continued.state).refused.slice().sort(), ['free', 'patrol']);
  assert.equal(readSpine(continued.state).solved['1'].verb, 'burn');
  assert.equal(readSpine(continued.state).solved['6'].stepId, 'asset_deploy');
  assert.equal(continued.state.story.flags.deep_reach_variant, 'ashfall_siege');
  assert.equal(barLine(continued.state, 'contact_maera_vols'), 'You finished the siege. I watched it leave.');
  // The taken door is the later fact — it files ahead of the persistent furnace row.
  assert.equal(barLine(continued.state, 'contact_halev_doss'), 'Filed: the grain door. Patrol and free refused.');

  const facts = readLifeLedger(continued.state);
  assert.match(facts.spineRoad.cite, /the grain door taken/);
  assert.match(facts.spineRoad.cite, /2 doors refused/);
  assert.match(facts.spineRoad.cite, /the variance sample docked/);
  assert.match(facts.spineRoad.cite, /the hauler fed to the furnace/);
  assert.match(facts.spineRoad.cite, /the register answered/);
  assert.match(facts.spineRoad.cite, /the yard feud settled/);
  assert.match(facts.spineRoad.cite, /the cargo spine held/);
  assert.match(facts.spineRoad.cite, /the proving runs finished/);
  assert.match(facts.spineRoad.cite, /the yard drone deployed/);
  assert.match(facts.spineRoad.cite, /the siege finished/);
  assert.equal(readSpine(continued.state).solved['6'].asset, 'drone');
  assert.ok(facts.spineRoad.solved.some((row) => row.beat === 1 && row.verb === 'burn'));
  const finale = createWrittenFinale('E', facts, 'spine-played-road');
  const archive = finale.beats.find((row) => row.evidenceSlot === 'archive');
  assert.match(archive.text, /The road retained: the grain door taken/);
  assert.equal(finale.basis.spineRoad.cite, facts.spineRoad.cite);
});
