import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  ESCORT_THE_IDIOT_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';

function primeBoardState(state) {
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = BOARD_SECTOR_ID;
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  for (const record of Object.values(state.factions || {})) {
    if (record && typeof record === 'object') record.rep = 100;
  }
}

function scenicOffer(system) {
  return system.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === ESCORT_THE_IDIOT_VARIANT_ID
  ));
}

function findScenicSeed() {
  for (let seed = 1; seed <= 1024; seed++) {
    const sim = createSimulation({ seed, systems: [missions] });
    primeBoardState(sim.state);
    const offer = scenicOffer(sim.registry.get('missions'));
    sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Escort the Idiot offer');
}

async function bootRoute(t, seed) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed });
  t.after(() => runtime.dispose());
  const { state, bus } = runtime;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  runtime.getSystem('ships').newGame();
  primeBoardState(state);
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  }));
  player.flags = { ...(player.flags || {}), persistent: true };
  state.playerId = player.id;
  assert.equal(await runtime.getSystem('physics').prepareBackend(state, { reset: true }), true);
  runtime.runTicks(2, SIM_DT);
  const events = { completed: [], failed: [], killed: [], recovered: [] };
  bus.on('mission:completed', (payload) => events.completed.push(structuredClone(payload)));
  bus.on('mission:failed', (payload) => events.failed.push(structuredClone(payload)));
  bus.on('entity:killed', (payload) => events.killed.push(structuredClone(payload)));
  bus.on('cargo:podRecovered', (payload) => events.recovered.push(structuredClone(payload)));
  return { runtime, state, bus, player, missions: runtime.getSystem('missions'), events };
}

function blackBoxFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'escort_the_idiot_lost');
}

function liveRaid(route, mission) {
  const encounterId = mission.params.escortTheIdiot.encounterId;
  return encounterId && route.state.encounterDirector.live[encounterId] || null;
}

function runUntil(route, predicate, maxTicks) {
  for (let tick = 0; tick < maxTicks; tick++) {
    if (predicate()) return true;
    route.runtime.step(SIM_DT);
  }
  return predicate();
}

function enterScenicRoute(route, offer) {
  assert.equal(route.missions.acceptMission(offer.id), true);
  const mission = route.state.missions.active.find((row) => (
    row && row.variantId === ESCORT_THE_IDIOT_VARIANT_ID
  ));
  assert.ok(mission);
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.runtime.getSystem('world').enterSector(mission.destSectorId, { placePlayer: true });
  assert.equal(runUntil(route, () => (
    mission._escorteeId != null && liveRaid(route, mission)
  ), 360), true);
  const liner = route.state.entities.get(mission._escorteeId);
  assert.ok(liner && liner.alive !== false && liner.type === 'ship');
  assert.equal(liner.data.defId, 'ship_mule');
  assert.equal(liner.data.name, 'Sunward Scenic Liner');
  assert.equal(liner.data.ai.passive, true,
    'the liner has no tactical target or combat behavior; missions owns only its route intent');
  assert.equal(liner.data.ai.fsm, 'escort_route');
  assert.equal(liner.data.escortTheIdiot.missionId, mission.id);
  const raid = liveRaid(route, mission);
  const raiders = (raid.ids || []).map((id) => route.state.entities.get(id))
    .filter((entity) => entity && entity.alive !== false && entity.factionId === 'faction_reach');
  assert.ok(raiders.length >= 4, 'the shipped ambush_snare owns a real Reach raid squad');
  return { mission, liner, raid, raiders };
}

function destroyThroughCombat(route, target, ownerId) {
  route.bus.emit('projectile:hit', {
    targetId: target.id,
    ownerId,
    damage: 100000,
    damageType: 'kinetic',
    penetration: 1,
    pos: { ...target.pos },
  });
}

function recoverBlackBox(route, offer) {
  assert.equal(route.missions.acceptMission(offer.id), true);
  const recovery = route.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(recovery);
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.state.world.currentSectorId = recovery.destSectorId;
  route.bus.emit('sector:enter', { sectorId: recovery.destSectorId });
  assert.equal(recovery.targetEntityIds.length, 1);
  const pod = route.state.entities.get(recovery.targetEntityIds[0]);
  const player = route.state.entities.get(route.state.playerId);
  assert.ok(pod && pod.alive !== false && pod.type === 'payload');
  assert.equal(pod.physicsBody.dynamic, true);
  assert.equal(pod.data.recoverableCargoPod, true);
  pod.pos.x = player.pos.x + player.radius + pod.radius;
  pod.pos.z = player.pos.z;
  pod.vel = { ...player.vel };
  route.bus.emit('physics:impact', {
    aId: pod.id,
    bId: player.id,
    impulse: 8,
    tick: route.state.tick,
  });
  assert.equal(pod.alive, false);
  assert.equal(route.events.recovered.filter((row) => row.podId === pod.id).length, 1);
  assert.equal(route.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome,
    'completed');
}

test('ordinary Escort the Idiot crosses a real raid; liner loss becomes one Continue-safe black box', async (t) => {
  const seed = findScenicSeed();
  const success = await bootRoute(t, seed);
  const replay = createSimulation({ seed, systems: [missions] });
  t.after(() => replay.dispose());
  primeBoardState(replay.state);

  const offer = scenicOffer(success.missions);
  const replayOffer = scenicOffer(replay.registry.get('missions'));
  assert.ok(offer, 'ordinary Contracts board exposes Escort the Idiot before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Escort the Idiot — Scenic Liner to /);
  assert.match(offer.brief, /tourist liner.*scenic route.*live raid zone.*intact.*collateral/i);
  assert.equal(offer.duration_s, null, 'the physical liner is the stake, not a mission countdown');

  const live = enterScenicRoute(success, offer);
  for (const raider of live.raiders) destroyThroughCombat(success, raider, success.player.id);
  const station = success.state.entityList.find((entity) => entity && entity.alive !== false
    && entity.type === 'station' && entity.data && entity.data.stationId === live.mission.destStationId);
  assert.ok(station);
  const startPos = { ...live.liner.pos };
  const startDistance = Math.hypot(live.liner.pos.x - station.pos.x, live.liner.pos.z - station.pos.z);
  assert.equal(runUntil(success, () => live.mission._escorteeArrived === true, 30 * 60), true);
  const finishDistance = Math.hypot(live.liner.pos.x - station.pos.x, live.liner.pos.z - station.pos.z);
  assert.ok(Math.hypot(live.liner.pos.x - startPos.x, live.liner.pos.z - startPos.z) > 20,
    'mission intent plus Flight V3 and Rapier materially move the civilian liner');
  assert.ok(finishDistance < startDistance - 20,
    `the real liner closes on its berth (${startDistance} -> ${finishDistance})`);
  success.bus.emit('dock:docked', { stationId: live.mission.destStationId });
  assert.equal(success.events.completed.filter((row) => row.missionId === live.mission.id).length, 1);
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === live.mission.id)?.outcome,
    'completed');
  assert.equal(blackBoxFollowups(success.state).length, 0);

  const failed = await bootRoute(t, seed);
  const doomed = enterScenicRoute(failed, scenicOffer(failed.missions));
  const attacker = doomed.raiders[0];
  destroyThroughCombat(failed, doomed.liner, attacker.id);
  assert.equal(doomed.liner.alive, false, 'combat owns the liner loss');
  assert.equal(failed.events.killed.filter((row) => (
    row.id === doomed.liner.id && row.killerId === attacker.id
  )).length, 1);
  assert.equal(failed.events.failed.filter((row) => row.missionId === doomed.mission.id).length, 1);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === doomed.mission.id)?.reason,
    'escortee_lost');
  assert.equal(blackBoxFollowups(failed.state).length, 1);
  const firstFollowup = blackBoxFollowups(failed.state)[0];
  assert.equal(firstFollowup.cause.killerId, attacker.id);
  assert.equal(firstFollowup.cause.encounterId, doomed.raid.id);
  assert.equal(firstFollowup.params.debrisRecovery.generation, 1);
  assert.equal(firstFollowup.params.debrisRecovery.pods.length, 1);
  destroyThroughCombat(failed, doomed.liner, attacker.id);
  assert.equal(blackBoxFollowups(failed.state).length, 1, 'replayed damage cannot duplicate the follow-on');

  const saveOwner = failed.runtime.getSystem('save');
  const envelope = saveOwner.serialize('plan51-escort-the-idiot');
  assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan51-escort-the-idiot'), true);
  failed.state.simTime += 1200;
  failed.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(blackBoxFollowups(failed.state).length, 1,
    'Continue plus board refresh preserves exactly one causal black-box recovery');
  recoverBlackBox(failed, blackBoxFollowups(failed.state)[0]);
  assert.equal(blackBoxFollowups(failed.state).length, 0, 'the accepted recovery cannot recurse');
});
