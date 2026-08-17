import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  SALVAGE_RACE_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { missions } from '../src/systems/missions.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
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

function raceOffer(system) {
  return system.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === SALVAGE_RACE_VARIANT_ID
  ));
}

function findRaceSeed() {
  for (let seed = 1; seed <= 512; seed++) {
    const sim = createSimulation({ seed, systems: [missions] });
    primeBoardState(sim.state);
    const offer = raceOffer(sim.registry.get('missions'));
    sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Salvage Race offer');
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
  const events = { completed: [], failed: [], extracted: [] };
  bus.on('mission:completed', (payload) => events.completed.push(structuredClone(payload)));
  bus.on('mission:failed', (payload) => events.failed.push(structuredClone(payload)));
  bus.on('salvage:npcExtraction', (payload) => events.extracted.push(structuredClone(payload)));
  return { runtime, state, bus, player, missions: runtime.getSystem('missions'), events };
}

function raceFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'salvage_race_lost');
}

function liveGeneralSalvor(route, wreck) {
  return (route.state.traffic.freighters || [])
    .map((record) => route.state.entities.get(record.id))
    .find((entity) => entity && entity.alive !== false && entity.data
      && entity.data.trafficRole === 'salvor'
      && entity.data.generalSalvor === true
      && entity.data.rivalTrafficOwned !== true
      && route.state.npcJobs.byId[entity.data.jobId]?.job?.payload?.targetId === wreck.id);
}

async function enterRace(route, offer) {
  assert.equal(route.missions.acceptMission(offer.id), true);
  const mission = route.state.missions.active.find((row) => (
    row && row.variantId === SALVAGE_RACE_VARIANT_ID
  ));
  assert.ok(mission);
  route.state.mode = 'flight';
  route.state.ui.docked = false;
  route.state.ui.dockedStationId = null;
  route.runtime.getSystem('world').enterSector(mission.destSectorId, { placePlayer: true });
  for (let tick = 0; tick < 90 && mission.targetEntityIds.length === 0; tick++) {
    route.runtime.step(SIM_DT);
  }
  assert.equal(mission.targetEntityIds.length, 1);
  const wreck = route.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(wreck && wreck.alive !== false && wreck.type === 'wreck');
  assert.equal(wreck.data.salvageRaceMission, true);
  assert.equal(wreck.data.missionTag, mission.id);
  assert.deepEqual(wreck.data.salvagePool, {
    [mission.params.cmdtyId]: mission.params.qty,
  });
  wreck.data.salvorNoticeAt = route.state.simTime;
  route.runtime.runTicks(5, SIM_DT);
  route.runtime.getSystem('traffic').update(0.25, route.state);
  const salvor = liveGeneralSalvor(route, wreck);
  assert.ok(salvor, 'ordinary demand-driven Traffic dispatches one NPC cutter to the mission wreck');
  const job = route.state.npcJobs.byId[salvor.data.jobId]?.job;
  assert.ok(job && job.kind === 'salvor');
  return { mission, wreck, salvor, job };
}

function provePhysicalApproach(route, live) {
  const startDistance = Math.hypot(
    live.salvor.pos.x - live.wreck.pos.x,
    live.salvor.pos.z - live.wreck.pos.z,
  );
  let minimumDistance = startDistance;
  for (let tick = 0; tick < 20 * 60 && minimumDistance > startDistance - 80; tick++) {
    route.runtime.step(SIM_DT);
    minimumDistance = Math.min(minimumDistance, Math.hypot(
      live.salvor.pos.x - live.wreck.pos.x,
      live.salvor.pos.z - live.wreck.pos.z,
    ));
  }
  assert.ok(minimumDistance < startDistance - 80,
    `NPC Jobs plus Flight V3 and Rapier must close materially (${startDistance} -> ${minimumDistance})`);
}

function recoverFollowup(route, offer) {
  assert.equal(route.missions.acceptMission(offer.id), true);
  const recovery = route.state.missions.active.find((row) => row.sourceOfferId === offer.id);
  assert.ok(recovery);
  route.state.mode = 'flight';
  route.state.world.currentSectorId = recovery.destSectorId;
  route.bus.emit('sector:enter', { sectorId: recovery.destSectorId });
  assert.equal(recovery.targetEntityIds.length, 1);
  const pod = route.state.entities.get(recovery.targetEntityIds[0]);
  assert.ok(pod && pod.alive !== false && pod.type === 'payload');
  assert.equal(pod.physicsBody.dynamic, true);
  pod.pos.x = route.player.pos.x + route.player.radius + pod.radius;
  pod.pos.z = route.player.pos.z;
  pod.vel = { ...route.player.vel };
  route.bus.emit('physics:impact', {
    aId: pod.id,
    bId: route.player.id,
    impulse: 8,
    tick: route.state.tick,
  });
  assert.equal(pod.alive, false);
  assert.equal(route.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome,
    'completed');
}

test('ordinary Salvage Race reaches one physical wreck; either cutter wins and NPC loss mutates once', async (t) => {
  const seed = findRaceSeed();
  const success = await bootRoute(t, seed);
  const replay = createSimulation({ seed, systems: [missions] });
  t.after(() => replay.dispose());
  primeBoardState(replay.state);

  const offer = raceOffer(success.missions);
  const replayOffer = raceOffer(replay.registry.get('missions'));
  assert.ok(offer, 'ordinary Contracts board exposes Salvage Race before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Salvage Race — First Cut near /);
  assert.match(offer.brief, /NPC scavenger crew.*same wreck.*same clock.*Cut.*first/i);
  assert.equal(offer.destStationId, null);
  assert.equal(offer.duration_s, null, 'the physical competing cutter is the only race clock');

  const live = await enterRace(success, offer);
  provePhysicalApproach(success, live);
  success.player.pos.x = live.wreck.pos.x - 80;
  success.player.pos.z = live.wreck.pos.z;
  success.runtime.getSystem('mining')._drainWreck(success.player, live.wreck, 18, 8);
  assert.equal(success.events.completed.filter((row) => row.missionId === live.mission.id).length, 1);
  assert.equal(success.state.missions.receipts.find((row) => row.missionId === live.mission.id)?.outcome,
    'completed');
  assert.equal(raceFollowups(success.state).length, 0);

  const failed = await bootRoute(t, seed);
  const doomed = await enterRace(failed, raceOffer(failed.missions));
  provePhysicalApproach(failed, doomed);
  doomed.job.phase = NPC_JOB_PHASE.WORK;
  doomed.job.routeIndex = 1;
  doomed.job.progress = 0.99;
  doomed.job.workS = 1;
  for (let tick = 0; tick < 12 && failed.events.extracted.length === 0; tick++) {
    failed.runtime.step(0.5);
  }
  assert.equal(failed.events.extracted.filter((row) => row.targetId === doomed.wreck.id).length, 1,
    'Traffic completes one real NPC WORK extraction from the shared wreck');
  assert.equal(failed.events.failed.filter((row) => row.missionId === doomed.mission.id).length, 1);
  assert.equal(failed.state.missions.receipts.find((row) => row.missionId === doomed.mission.id)?.reason,
    'npc_salvor_won');
  assert.equal(raceFollowups(failed.state).length, 1);
  const followup = raceFollowups(failed.state)[0];
  assert.equal(followup.params.debrisRecovery.generation, 1);
  assert.equal(followup.params.debrisRecovery.pods.length, 1);
  assert.equal(followup.cause.salvorId, doomed.salvor.id);

  const saveOwner = failed.runtime.getSystem('save');
  const envelope = saveOwner.serialize('plan51-salvage-race');
  assert.equal(saveOwner.loadEnvelope(structuredClone(envelope), 'plan51-salvage-race'), true);
  failed.state.simTime += 1200;
  failed.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(raceFollowups(failed.state).length, 1,
    'Continue plus board refresh preserves exactly one causal cutter-wake recovery');
  recoverFollowup(failed, raceFollowups(failed.state)[0]);
  assert.equal(raceFollowups(failed.state).length, 0, 'the accepted recovery cannot recurse');
});
