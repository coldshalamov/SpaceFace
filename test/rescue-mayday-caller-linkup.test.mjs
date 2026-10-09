/**
 * INFERENCE — Maydays reach the caller.
 *
 * Proves the two civilian rescue-loop breaks are fixed:
 * 1. A rescue craft answering a distress chases the CALLER's live position (not the stale
 *    snapshot the mayday was broadcast from), links up within 80 WU with exactly one throttled
 *    on-scene comms beat, holds `standing_by_caller` without dither-clearing, and hands off to
 *    the existing pod scan on caller death; nearby violence still sends it fleeing.
 * 2. A held worker's route-hold mayday (npcJobsRuntime `_holdForRouteThreat`, which carries no
 *    combat fire) reaches traffic through `npcjobs:distress`, is reshaped into the standard
 *    lastDistressCall (cause 'route_hold'), and dispatches the nearest rescue craft.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import { survivorPod } from '../src/systems/survivorPod.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

function bootHarness() {
  const bus = createBus();
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 10,
    playerId: 1,
    nextEntityId: 500,
    meta: { seed: 4242 },
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: 'sector_helios' },
    traffic: {
      freighters: [],
      nextDepotDispatchAt: 9999,
      depotServices: [],
    },
    survivorPod: {
      pods: {},
      causalHandoffs: {},
    },
    player: {
      tether: { active: false, targetId: null },
    },
    story: { flags: {} },
    ui: {},
  };

  function addEntity(entity) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  }

  // Station for docking / medical delivery
  const station = addEntity({
    id: 100,
    type: 'station',
    name: 'Helios Station',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 40,
    data: { role: 'hub' },
  });

  // Player at (50, 50)
  const player = addEntity({
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 50, z: 50 },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 100,
    hullMax: 100,
    data: {},
    flags: {},
  });

  traffic.init({ state, bus });
  survivorPod.init({ state, bus });
  npcJobsRuntime.init({ state, bus, helpers: {}, registry: null });

  return { state, bus, station, player, addEntity };
}

function addRescueCraft(state, id, x, z, label) {
  const rescueEnt = {
    id,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 12,
    rot: 0,
    data: {
      trafficRole: 'rescue',
      role: 'rescue',
      trafficLabel: label,
    },
    flags: {},
  };
  state.entities.set(id, rescueEnt);
  state.entityList.push(rescueEnt);
  const rescueRec = {
    id,
    role: 'rescue',
    targetId: null,
    waitT: 0,
    carryingSurvivor: false,
    rescueTargetId: null,
  };
  state.traffic.freighters.push(rescueRec);
  return { rescueEnt, rescueRec };
}

function aimToward(from, to) {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

test('a held miner route-hold mayday dispatches a rescue craft to the live worker', () => {
  const { state, bus, addEntity } = bootHarness();
  // Keep the whole scene on the sim glass around the player so the stepped hulls classify
  // S0_EXACT (the harness tick never advances, so a far tier would skip them forever).
  state.entities.get(1).pos = { x: 500, z: 310 };

  // The held worker: a miner job hull parked in a hot lane.
  const worker = addEntity({
    id: 410,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 400, z: 300 },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 100,
    hullMax: 100,
    data: { trafficRole: 'miner', jobKind: 'miner', trafficLabel: 'Rockbreaker 7' },
    flags: {},
  });

  // A route threat holds the miner's leg. Far enough away that the hold point is the worker.
  const pirate = addEntity({
    id: 9877,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 2400, z: 900 },
    vel: { x: 0, z: 0 },
    radius: 10,
    data: {},
    flags: {},
  });

  const entry = {
    jobId: 'j-mayday-1',
    entityId: worker.id,
    sectorId: 'sector_helios',
    job: {
      id: 'j-mayday-1',
      kind: 'miner',
      route: [
        { id: 'rock:a', pos: { x: 400, z: 300 }, label: 'Belt A' },
        { id: 'depot:b', pos: { x: 1200, z: 300 }, label: 'Depot B' },
      ],
      routeIndex: 1,
    },
    routeHold: null,
  };
  npcJobsRuntime._byId()['j-mayday-1'] = entry;

  const distressPayloads = [];
  bus.on('npcjobs:distress', (p) => distressPayloads.push(p));

  // The bounded route-hold cry fires immediately (distressT starts at -Infinity).
  npcJobsRuntime._holdForRouteThreat(entry, pirate, state.simTime);
  assert.ok(entry.routeHold, 'the route hold is chosen');
  assert.equal(distressPayloads.length, 1, 'the mayday went out on npcjobs:distress');
  assert.equal(distressPayloads[0].hullId, worker.id, 'the cry names the calling hull');

  // Rescue craft within dispatch range of the mayday.
  const { rescueEnt, rescueRec } = addRescueCraft(state, 411, 600, 320, 'SAR Cutter');

  traffic.update(0.1, state);
  assert.ok(state.traffic.lastDistressCall, 'traffic heard the mayday');
  assert.equal(state.traffic.lastDistressCall.cause, 'route_hold');
  assert.equal(state.traffic.lastDistressCall.callerId, worker.id);
  assert.equal(state.traffic.lastDistressCall.pos.x, 400);
  assert.equal(state.traffic.lastDistressCall.pos.z, 300);
  assert.equal(rescueRec.rescueTargetType, 'distress', 'the rescue record took the distress');
  assert.equal(rescueRec.rescueCallerId, worker.id, 'the rescue latched onto the caller');
  assert.equal(rescueEnt.data.civilianReaction, 'responding_distress');
  assert.equal(rescueEnt.data.intent.moveZ, 1, 'the cutter is under way');

  // The caller flees after crying out — the chase vector must track its LIVE position.
  worker.pos.x = 460;
  worker.pos.z = 340;
  traffic.update(0.1, state);
  assert.equal(rescueRec.rescueTargetType, 'distress');
  const expected = aimToward(rescueEnt.pos, worker.pos);
  assert.ok(
    Math.abs(rescueEnt.data.intent.aimAngle - expected) < 1e-9,
    `aim ${rescueEnt.data.intent.aimAngle} tracks the live caller at ${expected}`,
  );
  assert.equal(rescueEnt.data.intent.moveZ, 1);
});

test('rescue craft tracks the live caller, links up once, and hands off cleanly', () => {
  const { state, bus, addEntity } = bootHarness();
  // Whole scene on the sim glass around the player (see the route-hold test above).
  state.entities.get(1).pos = { x: 280, z: 210 };

  const { rescueEnt, rescueRec } = addRescueCraft(state, 420, 150, 280, 'SAR Cutter');

  // The caller: alive at (200,150) with the mayday snapshot from the same spot.
  const caller = addEntity({
    id: 421,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 200, z: 150 },
    vel: { x: 0, z: 0 },
    radius: 10,
    hull: 60,
    hullMax: 100,
    data: { trafficRole: 'hauler', trafficLabel: 'Hauler Vermillion' },
    flags: {},
  });
  const mayday = traffic._broadcastCivilianDistress(caller, null, 'combat_damage');
  assert.ok(mayday, 'the mayday broadcast went out');

  traffic.update(0.1, state);
  assert.equal(rescueRec.rescueTargetType, 'distress');
  assert.equal(rescueRec.rescueCallerId, caller.id);
  assert.equal(rescueEnt.data.civilianReaction, 'responding_distress');
  assert.equal(rescueEnt.data.intent.moveZ, 1);

  // The caller flees well away from the stale snapshot — chase the live hull.
  caller.pos.x = 400;
  caller.pos.z = 300;
  traffic.update(0.1, state);
  let expected = aimToward(rescueEnt.pos, caller.pos);
  assert.ok(
    Math.abs(rescueEnt.data.intent.aimAngle - expected) < 1e-9,
    'the intent vector points at the live caller, not the stale call position',
  );
  assert.equal(rescueEnt.data.intent.moveZ, 1);

  // Link-up: cutter closes to within 80 WU of the live caller.
  rescueEnt.pos.x = caller.pos.x + 40;
  const comms = [];
  bus.on('comms:message', (p) => comms.push(p));
  const onSceneBeats = () => comms.filter(
    (m) => m.channel === 'distress' && String(m.text || '').startsWith('On scene'),
  );
  traffic.update(0.1, state);
  assert.equal(onSceneBeats().length, 1, 'exactly one on-scene distress call');
  assert.equal(comms.filter((m) => m.channel === 'distress').length, 1,
    'the on-scene beat is the only distress-channel traffic the cutter emits');
  assert.equal(rescueRec.civilianReaction, 'standing_by_caller');
  assert.equal(rescueEnt.data.civilianReaction, 'standing_by_caller');
  assert.equal(rescueEnt.data.intent.moveZ, 0, 'the cutter holds station');
  assert.equal(rescueEnt.data.intent.brake, true);

  // Re-entry and repeated ticks: no dither-clear, no second beat.
  rescueEnt.pos.x = caller.pos.x + 300;
  traffic.update(0.1, state);
  assert.equal(rescueRec.civilianReaction, 'responding_distress');
  assert.equal(rescueRec.rescueTargetType, 'distress');
  rescueEnt.pos.x = caller.pos.x + 30;
  traffic.update(0.1, state);
  traffic.update(0.1, state);
  assert.equal(onSceneBeats().length, 1, 'the on-scene beat is throttled on re-entry');
  assert.equal(rescueRec.civilianReaction, 'standing_by_caller');
  assert.equal(rescueRec.rescueTargetType, 'distress', 'no dither-clear while the caller lives');

  // Caller dies with a survivor pod nearby — the existing pod scan takes over.
  const pod = addEntity({
    id: 422,
    type: 'payload',
    team: 0,
    alive: true,
    pos: { x: caller.pos.x + 10, z: caller.pos.z },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: { payloadType: 'survivor_pod', tetherRole: 'survivor_pod' },
    flags: {},
  });
  caller.alive = false;
  traffic.update(0.1, state);
  assert.equal(rescueRec.rescueTargetType, 'pod', 'the existing pod path takes over');
  assert.equal(rescueRec.rescueTargetId, pod.id);
  assert.equal(rescueRec.civilianReaction, 'responding_survivor');

  // Combat damage near the cutter — the existing flee path still wins.
  const victim = addEntity({
    id: 423,
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: rescueEnt.pos.x + 50, z: rescueEnt.pos.z },
    vel: { x: 0, z: 0 },
    radius: 12,
    data: { trafficRole: 'hauler' },
    flags: {},
  });
  bus.emit('combat:damage', {
    applied: 25,
    pos: { x: victim.pos.x, z: victim.pos.z },
    attackerId: 9899,
    targetId: victim.id,
  });
  traffic.update(0.1, state);
  assert.ok(rescueRec.violenceAlarmed, 'the cutter is alarmed by nearby combat');
  assert.equal(rescueEnt.data.intent.moveZ, 1, 'flee beats standing by');
});
