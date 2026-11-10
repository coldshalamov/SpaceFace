import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { DEFAULT_MASSLINE_DEF } from '../src/core/constraints/masslineController.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const B2_TAG = 'campaign47a:b2:elroy';

function bootAtTethys() {
  const state = createGameState(472);
  state.mode = 'flight';
  state.simTime = 30;
  state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
  state.player.targetId = null;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.factions.faction_scn = { ...(state.factions.faction_scn || {}), rep: 100 };

  let nextId = 10;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(player.id, player);
  const bus = createBus();
  const credits = [];
  const failures = [];
  const completions = [];
  bus.on('economy:grantCredits', (payload) => credits.push(payload));
  bus.on('mission:failed', (payload) => failures.push(payload));
  bus.on('mission:completed', (payload) => completions.push(payload));
  const helpers = {
    hash32,
    mulberry32,
    player: () => player,
    voice: { say: () => true },
    spawnEntity: (spec) => {
      const entity = {
        ...spec, id: nextId++, alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: spec.vel || { x: 0, z: 0 },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const missions = Object.assign({}, missionsProto);
  missions.init({ state, bus, helpers, registry: { get: () => null } });
  missions.newGame();
  state.missions.active = [];
  state.ui.trackedMissionId = null;
  state.story.beatIndex = 2;
  missions._syncCampaignSidecarAfterAdvance();
  return { state, bus, missions, player, credits, failures, completions };
}

// W-BOOKS-0-2: the default Book 2 route is the §34.7 list (cinder → compost → nest →
// register). The pod-rescue set piece is no longer board-posted, but an in-flight
// instance from a pre-list save must still spawn, settle, fail, and re-accept — this
// suite keeps covering that machinery by carrying the instance in directly, exactly
// the way serialize/deserialize restores one.
function acceptInFlightRescue(h) {
  const offer = {
    id: 'b2_pod_rescue_legacy', type: 'rescue_under_fire',
    storyTag: B2_TAG, storyContractId: B2_TAG, campaign47aBeat: 2,
    title: 'Pull the pods under fire',
    brief: 'Tow a pod to Expanse, or clear both Wasp escorts and reel a pod from stand-off.',
    factionId: 'faction_scn', stationId: 'station_tethys',
    destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
    reward_cr: 800, collateral_cr: 0, riskTier: 2, minRep: -149,
    source: 'campaign47a.embodied', distance: 3000,
    params: {
      physicalVerb: 'pull', completionMethods: ['stage_tow', 'corridor_pull'],
      authoredSetPieceId: 'pod_rescue', podCount: 2, escortCount: 2,
      escortsDown: 0, podsLost: 0, targetStrength: 1.3, fValue: 1.3, taskTime: 70,
    },
  };
  const mission = h.missions._instanceFromOffer(offer);
  h.state.missions.active.push(mission);
  h.missions.trackMission(mission.id, { silent: true });
  return mission;
}

function departForB2(h) {
  const mission = acceptInFlightRescue(h);
  assert.equal(mission.type, 'rescue_under_fire');
  h.state.world.currentSectorId = mission.destSectorId;
  h.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  const actors = mission.targetEntityIds.map((id) => h.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
  return {
    mission,
    pods: actors.filter((entity) => entity.data && entity.data.physicalRole === 'life_pod'),
    escorts: actors.filter((entity) => entity.data && entity.data.physicalRole === 'rescue_escort'),
  };
}

function kill(h, entity, killerId = h.player.id) {
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId, type: entity.type,
    physicalRole: entity.data && entity.data.physicalRole,
  });
}

function destroy(h, entity) {
  h.bus.emit('entity:destroyed', {
    id: entity.id, entity, pos: { ...entity.pos },
    physicalRole: entity.data && entity.data.physicalRole,
  });
}

test('B2 stages distinct reachable capsules and a clearable Wasp screen, then pays once on corridor pull', () => {
  const h = bootAtTethys();
  const { mission, pods, escorts } = departForB2(h);

  assert.equal(pods.length, 2);
  assert.equal(escorts.length, 2);
  assert.ok(pods.every((pod) => pod.type === 'payload'), 'B2 reuses the authored capsule payload body');
  assert.ok(pods.every((pod) => pod.data.packagedPropFile === 'places/place_47a_rescue_capsule.glb'));
  assert.deepEqual(
    pods.map((pod) => pod.data.missionActorId).sort(),
    [`${mission.id}:rescue-capsule:1`, `${mission.id}:rescue-capsule:2`].sort(),
  );
  assert.deepEqual(
    escorts.map((escort) => escort.data.missionActorId).sort(),
    [`${mission.id}:wasp-screen:1`, `${mission.id}:wasp-screen:2`].sort(),
  );

  const distances = pods.map((pod) => Math.hypot(pod.pos.x - h.player.pos.x, pod.pos.z - h.player.pos.z));
  assert.ok(distances.every((distance) => distance <= DEFAULT_MASSLINE_DEF.maxLength),
    'each capsule starts within the stock massline reach');
  assert.ok(escorts.every((escort) => Math.abs(escort.pos.z - h.player.pos.z) >= 115),
    'the Wasp pair screens the flanks and leaves the center lane open');

  for (const escort of escorts) kill(h, escort);
  assert.equal(mission.params.escortsDown, 2);
  assert.deepEqual(Object.values(mission.params.rescueActorOutcomes).sort(), ['cleared', 'cleared']);
  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: pods[0].id, after: 40 });
  assert.equal(h.completions.find((row) => row.missionId === mission.id).completionMethod, 'corridor_pull');
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1);

  h.bus.emit('tether:reel', { actorId: h.state.playerId, targetId: pods[1].id, after: 40 });
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1, 'a second reel cannot pay twice');
});

test('B2 retains its real latch-and-dock completion method', () => {
  const h = bootAtTethys();
  const { mission, pods } = departForB2(h);
  const berth = {
    id: 80, type: 'station', alive: true, pos: { x: 40, z: -20 }, radius: 40,
    data: { stationId: mission.destStationId, dockRadius: 80 },
  };
  h.state.entities.set(berth.id, berth);
  h.state.entityList.push(berth);

  h.bus.emit('tether:latched', { targetId: pods[0].id });
  pods[0].pos = { ...berth.pos };
  h.bus.emit('dock:docked', { stationId: mission.destStationId });

  assert.equal(h.completions.find((row) => row.missionId === mission.id).completionMethod, 'stage_tow');
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 1);
});

test('B2 actor losses survive Continue without respawn and a failed cast can be taken again', () => {
  const h = bootAtTethys();
  const first = departForB2(h);
  assert.equal(first.pods.length, 2);
  const lostPod = first.pods.find((pod) => pod.data.missionActorId === `${first.mission.id}:rescue-capsule:2`);
  assert.ok(lostPod, 'the higher-index authored capsule is present before loss');
  kill(h, lostPod);
  destroy(h, lostPod);
  assert.equal(first.mission.params.podsLost, 1);
  assert.equal(first.mission.params.rescueActorOutcomes[`${first.mission.id}:rescue-capsule:2`], 'lost');

  const save = JSON.parse(JSON.stringify(h.missions.serialize()));
  const liveEntityCount = h.state.entityList.length;
  h.missions.deserialize(save);
  h.bus.emit('sector:enter', { sectorId: first.mission.destSectorId });
  const resumed = h.state.missions.active.find((row) => row.storyTag === B2_TAG);
  const resumedActors = resumed.targetEntityIds.map((id) => h.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false);
  const resumedPods = resumedActors.filter((entity) => entity.data && entity.data.physicalRole === 'life_pod');
  assert.equal(resumedPods.length, 1);
  assert.equal(resumedPods[0].data.missionActorId, `${resumed.id}:rescue-capsule:1`);
  assert.equal(resumed.params.rescueActorOutcomes[`${resumed.id}:rescue-capsule:2`], 'lost');
  assert.equal(h.state.entityList.length, liveEntityCount, 'Continue adopts the survivors instead of spawning copies');

  const lastPod = resumedPods[0];
  kill(h, lastPod);
  destroy(h, lastPod);
  assert.equal(h.failures.length, 1, 'losing the complete cast reaches a finite failure outcome');
  assert.equal(h.failures[0].reason, 'pods_lost');
  assert.equal(h.state.story.beatIndex, 2, 'failure leaves the campaign beat available for recovery');
  assert.equal(h.credits.filter((row) => row.amount === 800).length, 0);

  // W-BOOKS-0-2: a failed in-flight set piece is not re-posted — the book hands the
  // player its next pending job instead (the cinder board opens Book 2).
  h.state.world.currentSectorId = 'sector_tethys_junction';
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  h.bus.emit('dock:undocked', {});
  const retry = h.state.missions.active.find((row) => row.storyTag === 'campaign47a:b2:cinder');
  assert.ok(retry, 'the departure rail re-posts the book’s pending job after a failed legacy cast');
  assert.equal(retry.type, 'patrol_clear');
  assert.equal(retry.stationId, 'station_tethys');
});
