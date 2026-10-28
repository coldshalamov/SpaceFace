// FB-063 — the back half of the spine (B4–B7) rides the authored step machine, and a player who
// fails a proving leg hears the authored recovery line once the beat re-arms.
//
// What this pins, on the live route (missions + story + heat over a real bus, seed 4242):
//   1. The eight-beat walk B0→B7 advances only through authored accept signals — the sidecar's
//      per-beat step rows (requiresPrior/accept) are what gate story:beatAdvanced, in order.
//   2. A scripted beat-5 failure puts the sidecar in 'failed', speaks NO rearm line while the
//      cooldown holds, then speaks CAMPAIGN_BEATS[5].recovery.line exactly once on the rearm
//      signal (dock:docked) — through the one-voice comms path — and the chain resumes.
//
// Run: node --test test/fb-spine-back-half.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
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
  CAMPAIGN_BEATS,
  BRANCH_CHAIN,
  FAIL_RECOVERY_COOLDOWN_S,
  beatDefAt,
  getBeatStepStatus,
  isBeatStepsComplete,
} from '../src/story/campaign47a/index.js';

const SEED = 4242;

function cloneSystem(proto) {
  return Object.assign({}, proto);
}

function makeHarness(seed = SEED) {
  const state = createGameState(seed);
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
  const beatAdvances = [];
  const commsPopups = [];
  const voiceLines = [];
  const grantCredits = [];
  const repDeltas = [];
  bus.on('story:beatAdvanced', (p) => beatAdvances.push(p));
  bus.on('comms:popup', (p) => commsPopups.push(p));
  bus.on('economy:grantCredits', (p) => {
    grantCredits.push(p);
    if (p && p.amount) state.player.credits = (state.player.credits | 0) + (p.amount | 0);
  });
  bus.on('faction:repDelta', (p) => {
    repDeltas.push(p);
    if (!p || !p.factionId) return;
    const f = state.factions[p.factionId] || (state.factions[p.factionId] = { rep: 0 });
    f.rep = (f.rep || 0) + (p.delta || 0);
  });

  const helpers = {
    hash32, mulberry32,
    voice: { say: (line) => { voiceLines.push(line); return true; } },
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

  return { state, bus, missions, story, heat, helpers, beatAdvances, commsPopups, voiceLines,
    grantCredits, repDeltas, aftermath, rook, furnace, understory, ecologyWorld, systems, registry };
}

// ── The live-route walk (the same physical mechanics story-campaign47a-live proves). ─────────

function acceptEmbodiedOffer(h, stationId, expectedTag) {
  const board = h.missions.ensureBoard(stationId);
  const offer = board && board.slots.find((c) => c && c.storyTag === expectedTag);
  assert.ok(offer, `missing authored offer ${expectedTag} at ${stationId}`);
  assert.equal(h.missions.acceptMission(offer.id), true, `failed to accept ${expectedTag}`);
  const mission = h.state.missions.active.find((c) => c.storyTag === expectedTag);
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
  assert.ok(mission && mission.status === 'active', 'set piece must be active');
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  if (mission.type === 'demolition' || mission.type === 'authored_set_piece') {
    const role = mission.type === 'authored_set_piece'
      ? (mission.params && mission.params.primaryRole)
      : null;
    const targetId = role
      ? mission.targetEntityIds
        .map((id) => h.state.entities.get(id))
        .find((e) => e && e.data && e.data.physicalRole === role).id
      : mission.targetEntityIds[0];
    assert.ok(targetId, `${mission.type} needs a physical target`);
    h.bus.emit('tether:whipImpact', {
      victimId: targetId, targetId: h.state.playerId, rating: 'solid', relSpeed: 90,
    });
    return;
  }
  if (mission.type === 'rescue_under_fire' || mission.type === 'tow_recovery') {
    const role = mission.type === 'rescue_under_fire' ? 'life_pod' : 'slag_core';
    const target = mission.targetEntityIds
      .map((id) => h.state.entities.get(id))
      .find((e) => e && e.data && e.data.physicalRole === role);
    assert.ok(target, `${mission.type} needs ${role}`);
    let berth = [...h.state.entities.values()].find((e) => (
      e && e.type === 'station' && e.data && e.data.stationId === mission.destStationId
    ));
    if (!berth) {
      berth = h.helpers.spawnEntity({
        type: 'station', pos: { x: 80, z: 40 }, radius: 40,
        data: { stationId: mission.destStationId, dockRadius: 80 },
      });
    }
    // The living maw refuses the line until the slag stuns land.
    const stuns = mission.params && mission.params.mawStunsNeeded;
    for (let i = 0; i < (stuns || 0); i++) {
      h.bus.emit('tether:whipImpact', { victimId: target.id, rating: 'solid' });
    }
    h.bus.emit('tether:latched', { targetId: target.id });
    target.pos = { x: berth.pos.x, z: berth.pos.z };
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  completePhysicalMission(h, mission);
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
  assert.ok(mission && mission.status === 'active', 'physical mission must be active');
  if (mission.type === 'bulk_trade') {
    h.bus.emit('economy:tradeCompleted', {
      side: 'sell', stationId: mission.destStationId,
      commodityId: mission.params.cmdtyId, qty: mission.objectiveTarget,
    });
    return;
  }
  if (mission.type === 'smuggling_run') {
    const qty = Math.max(1, mission.params.qty || 1);
    const loaded = addCargo(h.state, mission.params.cmdtyId, qty);
    assert.equal(loaded, qty, `${mission.storyTag} contraband must fit the hold`);
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  if (mission.params?.furnaceWorksiteVersion === 1) {
    completeFurnaceDetail(h, mission);
    return;
  }
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  h.missions.spawnTargetsForSector(mission.destSectorId);
  h.missions._ensureMissionTargets(mission);
  assert.ok(mission.targetEntityIds.length > 0, `${mission.storyTag} must materialize targets`);
  if (mission.type === 'escort') {
    const station = h.helpers.spawnEntity({
      type: 'station', pos: { x: 0, z: 0 },
      data: { stationId: mission.destStationId, dockRadius: 140 },
    });
    const lead = h.state.entities.get(mission._escorteeId);
    assert.ok(lead, `${mission.storyTag} must spawn a convoy lead`);
    lead.pos = { x: station.pos.x + 20, z: station.pos.z };
    h.missions.update(0.016, h.state);
    assert.equal(mission._escorteeArrived, true, 'convoy lead reaches the dock ring');
    h.bus.emit('dock:docked', { stationId: mission.destStationId });
    return;
  }
  // Deaths are real: the body dies and the canonical kill event follows, so
  // aftermath binding, ecology records and mission bookkeeping all observe fact.
  // A kill that settles the mission despawns the rest of its cast — only living
  // bodies can die.
  for (const targetId of [...mission.targetEntityIds]) {
    const entity = h.state.entities.get(targetId);
    if (entity && entity.alive !== false) killEntity(h, entity);
  }
}

function completeB0(h) {
  const { state, bus } = h;
  assert.equal(state.story.beatIndex, 0);
  bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(state.story.beatIndex, 1, 'B0 completes on ordered mine then dock');
}

/** The live B1→B4 route: the authored book lists (w533/w534) driven physically. */
function advanceB1ToB5(h) {
  const { state, bus } = h;
  assert.equal(state.story.beatIndex, 1);

  // B1 book list: the alloy run (+ the optional pod weigh) then the infested lane's
  // furnace count.
  const alloy = acceptEmbodiedOffer(h, 'station_helios', 'campaign47a:b1:alloy_run');
  addCargo(state, 'cmdty_alloys', Math.max(1, alloy.params.qty || 6));
  bus.emit('dock:docked', { stationId: 'station_tethys' });
  bus.emit('kesslerPod:weighed', { variance: true, massT: 6 });
  completePhysicalMission(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b1:infested'));
  assert.equal(state.story.beatIndex, 2);

  // B2 book list: the cinder lane (three real marked Wasps down, one hull on Rook's
  // pad), a surviving hull fed to the authored receiver garden, the real Nest
  // receipt, then the Elroy writ (force).
  const cinder = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:cinder');
  completePhysicalMission(h, cinder);
  deliverCinderHull(h, cinder);
  feedReceivingGarden(h, cinder);
  visitNest(h);
  const elroy = acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b2:elroy');
  h.state.world.currentSectorId = elroy.destSectorId;
  bus.emit('sector:enter', { sectorId: elroy.destSectorId });
  h.missions.spawnTargetsForSector(elroy.destSectorId);
  h.missions._ensureMissionTargets(elroy);
  const elroyTarget = elroy.targetEntityIds[0];
  state.entities.get(elroyTarget).pos = { x: 5, z: 0 };
  bus.emit('scan:completed', { targetId: elroyTarget });
  killEntity(h, state.entities.get(elroyTarget));
  assert.equal(state.story.beatIndex, 3);

  // B3 book list: the berth delivery (the long tow), the maw's stuns + tow, the Foreman.
  completeSpineSetPiece(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:berth'));
  completeSpineSetPiece(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:maw'));
  completePhysicalMission(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b3:foreman'));
  assert.equal(state.story.beatIndex, 4);

  const intro = acceptStoryOffer(h, 'station_tethys', STORY_BRANCH_INTRO_TAG);
  assert.equal(state.story.branch, null, 'accepting the intro only pends the branch');
  completePhysicalMission(h, intro);
  assert.equal(state.story.branch, 'traders');
  assert.equal(state.story.beatIndex, 4, 'the intro settles the door; the operation closes the book');
  completePhysicalMission(h, acceptEmbodiedOffer(h, 'station_tethys', 'campaign47a:b4:operation'));
  assert.equal(state.story.beatIndex, 5);
}

function completeB5Chain(h) {
  const count = BRANCH_CHAIN.traders.count;
  for (let completed = 0; completed < count; completed++) {
    const mission = acceptStoryOffer(h, 'station_tethys', `campaign47a:b5:traders:${completed + 1}`);
    completePhysicalMission(h, mission);
    if (completed < count - 1) assert.equal(h.state.story.beatIndex, 5);
  }
  assert.equal(h.state.story.beatIndex, 6);
}

function completeB6(h) {
  h.bus.emit('asset:deployed', {
    kind: 'drone', id: 'seed-live', defId: 'drone_mk1', sectorId: 'sector_helios_prime',
  });
  assert.equal(h.state.story.beatIndex, 6, 'deployment alone cannot settle B6');
  h.bus.emit('automation:programAssigned', { kind: 'drone', id: 'seed-live', templateId: 'mine_to_depot' });
  assert.equal(h.state.story.beatIndex, 7);
}

function completeB7(h) {
  h.state.player.credits = Math.max(250_000, h.state.player.credits || 0);
  for (const factionId of ['faction_scn', 'faction_mts', 'faction_free']) {
    h.state.factions[factionId].rep = Math.max(80, h.state.factions[factionId].rep || 0);
  }
  h.missions.update(0.016, h.state);
  assert.equal(h.state.story.flags.endgame, undefined, 'net worth alone must not bypass the climax');
  const board = h.missions.ensureBoard('station_ashcache');
  const ops = board.slots.filter((row) => String(row.storyTag || '').startsWith('campaign47a:b7:'));
  assert.equal(ops.length, 1, 'exactly one authored Deep Reach op posts');
  const mission = acceptStoryOffer(h, 'station_ashcache', 'campaign47a:b7:');
  completeSpineSetPiece(h, mission);
  assert.equal(h.state.story.beatIndex, 7);
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.endgame, true);
}

// ── Tests ──────────────────────────────────────────────────────────────────────────────────

test('FB-063: the eight-beat walk on seed 4242 advances only through authored steps', () => {
  const h = makeHarness();
  const sidecar = () => h.state.story.campaign47a;

  // B0's ordered recipe: dock alone and mine alone cannot advance; the sidecar records each step.
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 0, 'dock before mine must not advance B0');
  assert.equal(isBeatStepsComplete(h.state, 0), false);
  h.bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 2 });
  assert.equal(h.state.story.beatIndex, 0, 'mine without the dock step must not advance B0');
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.story.beatIndex, 1);

  // B4's authored step is a mission:accepted carrying the branch-intro tag — nothing else counts.
  advanceB1ToB5(h);
  const b4 = getBeatStepStatus(h.state, 4);
  assert.equal(b4.stepsComplete, true, 'B4 recorded its authored accept step');
  assert.deepEqual(b4.completed, ['branch_intro_accept', 'operation']);

  // B5's authored step requires the chain count, not any mission:completed.
  completeB5Chain(h);
  const b5 = getBeatStepStatus(h.state, 5);
  assert.equal(b5.stepsComplete, true);
  assert.deepEqual(b5.completed, ['chain_complete']);

  completeB6(h);
  const b6 = getBeatStepStatus(h.state, 6);
  assert.deepEqual(b6.completed, ['asset_deploy']);

  completeB7(h);
  assert.equal(h.state.story.beatIndex, 7);

  // Ordered advances only — each canonical beat fires once, in sequence, off the authored steps.
  const froms = h.beatAdvances.map((p) => p.fromIndex);
  for (let i = 0; i <= 6; i++) {
    assert.equal(froms.filter((f) => f === i).length, 1, `beat ${i} advanced exactly once`);
  }
  assert.deepEqual(
    froms.slice(0, 7),
    [0, 1, 2, 3, 4, 5, 6],
    'beats advance in authored order',
  );
  assert.equal(sidecar().observedBeatIndex, 7, 'the sidecar tracks the canonical B7 cursor');
  assert.equal(beatDefAt(7).observeOnly, true, 'B7 is observe-only — the sidecar owns no completion');
});

test('FB-063: a scripted beat-5 failure speaks the authored recovery line once, after cooldown', () => {
  const h = makeHarness();
  completeB0(h);
  advanceB1ToB5(h);
  const recoveryLine = CAMPAIGN_BEATS[5].recovery.line;
  assert.ok(recoveryLine, 'beat 5 carries an authored recovery line');
  const heard = () => h.commsPopups.filter((p) => p && p.text === recoveryLine);

  // A non-chain completion cannot satisfy the authored step; a chain failure fails the beat.
  const leg = acceptStoryOffer(h, 'station_tethys', 'campaign47a:b5:traders:1');
  h.missions._failMission(leg, h.state.missions.active.indexOf(leg), 'proving_failure');
  const own = h.state.story.campaign47a;
  assert.equal(own.beatStatus, 'failed');
  assert.equal(own.failuresByBeat['5'], 1);
  assert.equal(h.state.story.beatIndex, 5, 'failure never advances the cursor');
  // The failure-time missions line is a different authored row; the rearm line has not spoken.
  assert.equal(heard().length, 0, 'no rearm line while the cooldown holds');

  // Cooldown is real: an immediate rearm signal stays silent.
  h.state.simTime += 1;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(heard().length, 0);
  assert.equal(own.beatStatus, 'failed');

  // After the cooldown, the authored rearmOn signal recovers the beat and speaks its line once —
  // through the voice arbiter and onto the comms feed, with a story fact receipt.
  h.state.simTime += FAIL_RECOVERY_COOLDOWN_S + 1;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.story.update(0.016, h.state);
  assert.equal(heard().length, 1, 'exactly one authored recovery line');
  const line = heard()[0];
  assert.equal(line.sender, beatDefAt(5).title);
  assert.equal(line.category, 'story');
  assert.ok(h.voiceLines.some((v) => v && String(v.text).includes(recoveryLine)),
    'the one-voice arbiter voiced the recovery line');
  assert.equal(own.beatStatus, 'tracking', 'the beat re-armed');
  assert.equal(h.state.story.seenComms['story_recovery_5_1'], true);
  assert.ok(h.state.story.facts.some((f) => f.id === 'story_recovery_5_1' && f.kind === 'recovery'));

  // It does not repeat: another dock keeps the once-per-failure count.
  h.state.simTime += 30;
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.story.update(0.016, h.state);
  assert.equal(heard().length, 1);

  // Recovery is real, not cosmetic: the proving chain still completes the beat.
  completeB5Chain(h);
  completeB6(h);
  completeB7(h);
  assert.equal(h.state.story.beatIndex, 7);
});
