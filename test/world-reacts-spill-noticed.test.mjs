/**
 * C2 spill listener — freight:cargoSpilled flags pods and calls a salvor.
 *
 * Traffic consumes the production spill event. Pods matching the encounter are marked
 * spillNoticed, traffic:spillNoticed fires once, and an idle salvor is preferred over a
 * busy one. A second copy of the same event must not dispatch again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const DT = 1 / 60;
const SECTOR_ID = 'sector_spill_notice';
const ENCOUNTER_ID = 'enc-spill-noticed';
const BUSY_JOB_ID = 'job:rec-busy-salvor';
const NOTICE_DELAY_S = 2;

function ship(id, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: extra.team != null ? extra.team : 2,
    isPlayer: !!extra.isPlayer,
    pos: { x: extra.x || 0, z: extra.z || 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {
      intent: {
        moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0,
      },
      ...(extra.data || {}),
    },
  };
}

function makeWorld(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 600;
  state.playerId = 1;
  state.world.currentSectorId = SECTOR_ID;

  const player = ship(1, { team: 0, isPlayer: true, x: 0, z: 0 });
  const station = {
    id: 10,
    type: 'station',
    alive: true,
    pos: { x: 0, z: 0 },
    data: { stationId: 'station_spill_yard', name: 'Spill Yard' },
  };
  // Busy first in the freighter list so preference is visible: the dispatcher
  // walks salvors in order and must skip a hull that already has a job.
  const busy = ship(21, {
    x: 40, z: 0,
    data: {
      trafficRole: 'salvor',
      role: 'salvor',
      worldRecordId: 'rec-busy-salvor',
      jobId: BUSY_JOB_ID,
      intent: {
        moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0,
      },
    },
  });
  const idle = ship(22, {
    x: 80, z: 0,
    data: {
      trafficRole: 'salvor',
      role: 'salvor',
      worldRecordId: 'rec-idle-salvor',
      intent: {
        moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0,
      },
    },
  });
  const podA = {
    id: 40, type: 'pickup', alive: true, pos: { x: 200, z: 20 },
    data: {
      freightCustodyPod: { custodyId: 'custody-spill', qty: 4 },
      encounterId: ENCOUNTER_ID,
      amount: 4,
    },
  };
  const podB = {
    id: 41, type: 'pickup', alive: true, pos: { x: 220, z: -15 },
    data: {
      freightCustodyPod: { custodyId: 'custody-spill', qty: 3 },
      encounterId: ENCOUNTER_ID,
      amount: 3,
    },
  };
  const decoy = {
    id: 42, type: 'pickup', alive: true, pos: { x: 240, z: 10 },
    data: {
      freightCustodyPod: { custodyId: 'custody-other', qty: 2 },
      encounterId: 'enc-other',
      amount: 2,
    },
  };
  const entities = [player, station, busy, idle, podA, podB, decoy];
  state.entities = new Map(entities.map((entity) => [entity.id, entity]));
  state.entityList = entities;
  state.nextEntityId = 43;
  state.traffic.freighters = [
    {
      id: busy.id, role: 'salvor', targetId: station.id,
      waitT: 0, nextTradeT: 8, dockSeq: 0, manifest: { lines: [], totalQty: 0 },
    },
    {
      id: idle.id, role: 'salvor', targetId: station.id,
      waitT: 0, nextTradeT: 8, dockSeq: 0, manifest: { lines: [], totalQty: 0 },
    },
  ];
  return { state, player, station, busy, idle, podA, podB, decoy };
}

function boot(world) {
  const helpers = {
    spawnEntity: () => null,
  };
  const bus = createBus();
  const noticed = [];
  bus.on('traffic:spillNoticed', (payload) => {
    noticed.push({
      encounterId: payload && payload.encounterId,
      custodyId: payload && payload.custodyId,
      podIds: payload && payload.podIds ? payload.podIds.slice() : [],
      sectorId: payload && payload.sectorId,
      t: payload && payload.t,
    });
  });
  const jobs = Object.assign({}, npcJobsRuntime);
  const sys = Object.assign({}, traffic);
  jobs.init({ state: world.state, bus, helpers, registry: null });
  const realAssign = helpers.npcJobs.assign;
  const assigns = [];
  helpers.npcJobs.assign = (entity, spec) => {
    assigns.push({
      id: entity && entity.id,
      worldRecordId: entity && entity.data && entity.data.worldRecordId,
      kind: spec && spec.kind,
      targetId: spec && spec.payload && spec.payload.targetId,
    });
    return realAssign(entity, spec);
  };
  sys.init({ state: world.state, bus, helpers, registry: null });
  return { bus, sys, jobs, helpers, noticed, assigns };
}

function spillPayload(podIds) {
  return {
    encounterId: ENCOUNTER_ID,
    custodyId: 'custody-spill',
    podIds: podIds.slice(),
    podCount: podIds.length,
    cause: 'carrier_destroyed',
    t: 10,
  };
}

function stepTraffic(sys, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (Number(state.simTime) || 0) + DT;
    sys.update(DT, state);
  }
}

function runSpill(seed) {
  const world = makeWorld(seed);
  const harness = boot(world);
  const podIds = [world.podA.id, world.podB.id];
  const emittedAt = world.state.simTime;
  harness.bus.emit('freight:cargoSpilled', spillPayload(podIds));
  return { world, harness, podIds, emittedAt };
}

for (const seed of [4242, 8008]) {
  test(`freight:cargoSpilled notices the pods and prefers an idle salvor (seed ${seed})`, () => {
    const { world, harness, podIds, emittedAt } = runSpill(seed);
    const { podA, podB, decoy, idle, busy, state } = world;

    assert.equal(podA.data.spillNoticed, true, 'the first spilled pod is noticed');
    assert.equal(podB.data.spillNoticed, true, 'the second spilled pod is noticed');
    assert.equal(podA.data.salvorNoticeAt, emittedAt + NOTICE_DELAY_S);
    assert.equal(podB.data.salvorNoticeAt, emittedAt + NOTICE_DELAY_S);
    assert.notEqual(decoy.data.spillNoticed, true, 'a pod from another encounter stays unnoticed');

    assert.equal(harness.noticed.length, 1, 'one spill emits traffic:spillNoticed once');
    assert.deepEqual(harness.noticed[0].podIds, podIds);
    assert.equal(harness.noticed[0].encounterId, ENCOUNTER_ID);
    assert.equal(harness.noticed[0].sectorId, SECTOR_ID);
    assert.equal(harness.assigns.length, 0, 'notice is t+2, so the event itself does not dispatch yet');
    assert.equal(busy.data.jobId, BUSY_JOB_ID);
    assert.equal(idle.data.jobId, undefined);

    // The listener stamped salvorNoticeAt = t+2. One traffic tick at that clock dispatches.
    state.simTime = emittedAt + NOTICE_DELAY_S;
    stepTraffic(harness.sys, state, 1);

    assert.equal(harness.assigns.length, 1, 'exactly one salvor is dispatched');
    assert.equal(harness.assigns[0].id, idle.id, 'the idle salvor is preferred over the busy one');
    assert.equal(harness.assigns[0].worldRecordId, 'rec-idle-salvor');
    assert.equal(harness.assigns[0].kind, 'salvor');
    assert.equal(harness.assigns[0].targetId, podA.id);
    assert.equal(idle.data.jobId, 'job:rec-idle-salvor');
    assert.equal(busy.data.jobId, BUSY_JOB_ID, 'the busy salvor keeps the job it already had');
    assert.equal(podA.data.salvorClaimedBy, 'rec-idle-salvor');

    const jobIdAfter = idle.data.jobId;
    const assignsAfter = harness.assigns.length;
    harness.bus.emit('freight:cargoSpilled', spillPayload(podIds));
    stepTraffic(harness.sys, state, 1);

    assert.equal(harness.assigns.length, assignsAfter, 'a duplicate spill does not re-dispatch');
    assert.equal(idle.data.jobId, jobIdAfter);
    assert.equal(busy.data.jobId, BUSY_JOB_ID);
    assert.equal(podA.data.salvorClaimedBy, 'rec-idle-salvor');
  });
}
