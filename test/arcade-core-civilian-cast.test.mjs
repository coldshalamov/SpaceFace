import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  CIVILIAN_CAST_SECTOR_ID,
  CIVILIAN_CAST_TOW_PAYLOAD_ID,
  HELIOS_CIVILIAN_CAST,
} from '../src/data/civilianCast.js';
import { combat } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';

function castEntities(state) {
  return state.entityList.filter((entity) => (
    entity?.alive !== false && entity.data?.civilianCast === true
  ));
}

function castEntity(state, castId) {
  return castEntities(state).find((entity) => entity.data.civilianCastId === castId) || null;
}

function towWreck(state) {
  return state.entityList.find((entity) => (
    entity?.alive !== false
      && entity.data?.civilianCastTowPayloadId === CIVILIAN_CAST_TOW_PAYLOAD_ID
  )) || null;
}

function distance(a, b) {
  return Math.hypot((b?.x || 0) - (a?.x || 0), (b?.z || 0) - (a?.z || 0));
}

async function boot() {
  const systems = [flightV3, physics, combat, world, npcJobsRuntime, traffic];
  const updateOrder = [flightV3, physics, combat, world, npcJobsRuntime, traffic];
  // Seed 80's ordinary Helios mix includes the already-shipped rescue and tender roles, letting the
  // coexistence route prove the authored additions do not replace either one.
  const sim = createSimulation({ seed: 80, systems, updateOrder });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.playerId = null;
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  sim.registry.get('world').enterSector(CIVILIAN_CAST_SECTOR_ID, {
    continuous: true,
    noTeleport: true,
    placePlayer: false,
  });
  return {
    sim,
    state,
    physicsOwner: sim.registry.get('physics'),
    trafficOwner: sim.registry.get('traffic'),
  };
}

function stepUntil(sim, predicate, maxTicks, message, observe = null) {
  for (let tick = 0; tick < maxTicks; tick += 1) {
    sim.step(SIM_DT);
    observe?.();
    if (predicate()) return tick + 1;
  }
  assert.fail(message);
}

test('Plan 18 authored cast has distinct physical identities and the existing rescue route gains its white-orange world tell', async (t) => {
  assert.deepEqual(
    HELIOS_CIVILIAN_CAST.map((entry) => entry.role),
    ['tug', 'news_drone', 'tourist_liner', 'pilgrim', 'pilgrim', 'pilgrim'],
  );
  assert.equal(new Set(HELIOS_CIVILIAN_CAST.map((entry) => entry.id)).size, 6);
  assert.equal(new Set(HELIOS_CIVILIAN_CAST.map((entry) => entry.worldRecordSlotId)).size, 6);
  for (const entry of HELIOS_CIVILIAN_CAST) {
    assert.ok(entry.route.length >= 2, `${entry.id} owns a real route`);
    assert.ok(entry.appearance.hullColor && entry.appearance.accentColor, `${entry.id} has a non-audio tell`);
    assert.ok(entry.playerUse, `${entry.id} states a player exploit/help use`);
  }

  const h = await boot();
  t.after(() => {
    h.physicsOwner._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });
  const rescue = h.sim.spawn(makeShipEntitySpec('ship_drifter', {
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 1320, z: -420 },
    ai: { archetype: 'passive', passive: true },
  }));
  h.trafficOwner._stampTrafficDurableIdentity(
    rescue,
    CIVILIAN_CAST_SECTOR_ID,
    'rescue',
    { label: 'Rescue Craft' },
    900,
  );
  assert.deepEqual(rescue.data.appearance, {
    version: 1,
    hullColor: '#f2efe7',
    accentColor: '#ff7417',
    finish: 'satin',
    wear: 0.12,
    decalId: 'concord',
  });
  assert.deepEqual(rescue.data.rescuePriorityTell, {
    palette: 'white-orange',
    priorityLights: true,
    nonAudio: true,
  });
});

test('ordinary Helios entry keeps ambient traffic while every missing cast job moves and the tug completes a physical Massline tow', async (t) => {
  const h = await boot();
  t.after(() => {
    h.physicsOwner._disableSg02DynamicAuthority?.();
    h.sim.dispose();
  });

  const cast = castEntities(h.state);
  assert.equal(cast.length, 6, 'one tug, observer, liner and three-ship procession materialize');
  assert.equal(new Set(cast.map((entity) => entity.id)).size, 6);
  assert.equal(new Set(cast.map((entity) => entity.data.worldRecordId)).size, 6);
  const castIds = new Set(cast.map((entity) => entity.id));
  const ordinary = h.state.traffic.freighters.filter((record) => !castIds.has(record.id));
  assert.ok(ordinary.length >= 6, 'the additive authored cast does not displace Helios ambient workers');
  assert.ok(ordinary.some((record) => ['miner', 'hauler', 'patrol', 'courier', 'express'].includes(record.role)),
    'ordinary island traffic remains scheduled beside the authored cast');
  const rescueRecord = ordinary.find((record) => record.role === 'rescue');
  const tenderRecord = ordinary.find((record) => record.role === 'tender');
  assert.ok(rescueRecord && tenderRecord,
    'the existing rescue and tender cast remain present beside the six authored hulls');
  assert.equal(h.state.entities.get(rescueRecord.id)?.data?.rescuePriorityTell?.palette, 'white-orange');
  for (const entity of cast) {
    const entry = h.state.npcJobs.byId[entity.data.jobId];
    assert.ok(entry?.job?.materialized, `${entity.data.civilianCastId} owns a materialized production job`);
    assert.equal(entry.entityId, entity.id);
  }

  const start = new Map(cast.map((entity) => [entity.data.civilianCastId, { ...entity.pos }]));
  const maxTravel = new Map(cast.map((entity) => [entity.data.civilianCastId, 0]));
  const visits = [];
  const landmarks = [];
  const towAttached = [];
  const towDelivered = [];
  h.sim.bus.on('civilianCast:waypointVisited', (payload) => visits.push(structuredClone(payload)));
  h.sim.bus.on('civilianCast:landmarkVisit', (payload) => landmarks.push(structuredClone(payload)));
  h.sim.bus.on('civilianCast:towAttached', (payload) => towAttached.push(structuredClone(payload)));
  h.sim.bus.on('civilianCast:towDelivered', (payload) => towDelivered.push(structuredClone(payload)));

  const wreck = towWreck(h.state);
  assert.ok(wreck && wreck.physicsBody?.dynamic === true && wreck.collides === true,
    'the recovery hulk is a real dynamic Rapier body');
  const wreckStart = { ...wreck.pos };
  const observe = () => {
    for (const entity of castEntities(h.state)) {
      const origin = start.get(entity.data.civilianCastId);
      maxTravel.set(
        entity.data.civilianCastId,
        Math.max(maxTravel.get(entity.data.civilianCastId) || 0, distance(origin, entity.pos)),
      );
    }
  };

  stepUntil(
    h.sim,
    () => towAttached.length === 1,
    2400,
    'the recovery tug never attached its real Massline at the yard',
    observe,
  );
  const active = h.state.combat.attachments.byId[towAttached[0].attachmentId];
  assert.equal(active?.state, 'active');
  assert.equal(active?.ownerId, castEntity(h.state, 'helios_recovery_tug').id);
  assert.equal(active?.targetId, wreck.id);
  assert.equal(active?.controlMode, 'civilian_recovery_tow');
  const tug = castEntity(h.state, 'helios_recovery_tug');
  const tugEntry = h.state.npcJobs.byId[tug.data.jobId];
  const tugJob = tugEntry.job;
  const beforeReensure = {
    phase: tugJob.phase,
    progress: tugJob.progress,
    sequence: tugJob.sequence,
    loopCount: tugJob.loopCount,
  };
  h.trafficOwner._ensureHeliosCivilianCast(CIVILIAN_CAST_SECTOR_ID);
  assert.strictEqual(h.state.npcJobs.byId[tug.data.jobId], tugEntry,
    'repeated island ensure keeps the existing job entry');
  assert.strictEqual(h.state.npcJobs.byId[tug.data.jobId].job, tugJob,
    'npcJobs.assign is idempotent for the same durable actor');
  assert.deepEqual({
    phase: tugJob.phase,
    progress: tugJob.progress,
    sequence: tugJob.sequence,
    loopCount: tugJob.loopCount,
  }, beforeReensure, 'repeated top-up does not reset live route progress');

  stepUntil(
    h.sim,
    () => towDelivered.length === 1,
    7200,
    'the physical recovery tow never reached its scheduled salvage-yard release',
    observe,
  );
  assert.equal(h.state.combat.attachments.byId[towAttached[0].attachmentId].state, 'broken');
  assert.equal(h.state.combat.attachments.byId[towAttached[0].attachmentId].breakReason,
    'civilian_tow_delivered');
  assert.ok(distance(wreckStart, wreck.pos) > 120,
    `the Rapier-owned hulk must physically move, not just receive a receipt (${distance(wreckStart, wreck.pos)})`);
  assert.equal(castEntity(h.state, 'helios_news_observer').data.coverageStatus, 'filed',
    'the news drone observes the live tow without publishing a second news/story outcome');
  assert.ok(landmarks.some((row) => row.castId === 'helios_scenic_liner'),
    'the scenic liner physically reaches and works at a landmark');
  for (const id of ['helios_news_observer', 'helios_pilgrim_1', 'helios_pilgrim_2', 'helios_pilgrim_3']) {
    assert.ok(visits.some((row) => row.castId === id), `${id} reaches a scheduled physical stop`);
  }
  for (const [id, travelled] of maxTravel) {
    assert.ok(travelled > 40, `${id} physically travels under Flight V3 (${travelled})`);
  }

  // The acceptance window is 15 minutes of the real deterministic fixed-step runtime, not a wall
  // timer or detached extrapolation. The same live bodies, jobs, physics and ambient island advance
  // for 900 sim-seconds here.
  const loopCounts = new Map(castEntities(h.state).map((entity) => [
    entity.data.civilianCastId,
    h.state.npcJobs.byId[entity.data.jobId].job.loopCount,
  ]));
  const soakStartedAt = h.state.simTime;
  h.sim.runTicks(Math.ceil(900 / SIM_DT), SIM_DT);
  assert.ok(h.state.simTime >= soakStartedAt + 900 - SIM_DT,
    'the combined island advances a full deterministic 15 sim-minutes');
  for (const entity of castEntities(h.state)) {
    const liveJob = h.state.npcJobs.byId[entity.data.jobId].job;
    assert.ok(liveJob.loopCount > loopCounts.get(entity.data.civilianCastId),
      `${entity.data.civilianCastId} remains physically scheduled across 15 sim-minutes`);
  }
  assert.equal(h.state.entities.get(rescueRecord.id)?.alive, true,
    'the existing rescue hull survives alongside the new cast');
  assert.equal(h.state.entities.get(tenderRecord.id)?.alive, true,
    'the existing tender hull survives alongside the new cast');
  h.trafficOwner._ensureHeliosCivilianCast(CIVILIAN_CAST_SECTOR_ID);
  assert.equal(castEntities(h.state).length, 6, 're-ensuring the island never duplicates the cast');
  assert.ok(h.state.traffic.freighters.filter((record) => !castIds.has(record.id)).length >= 6,
    'ordinary traffic remains present after the combined cast route');
});
