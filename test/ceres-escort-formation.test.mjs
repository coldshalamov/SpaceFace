// R6 escort-formation coverage: the authored Throughline escort follows its exact durable ward
// without changing the NPC job kernel, persisting a live entity id, or weakening lease/FLEE
// precedence.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  NPC_JOB_PHASE,
} from '../src/systems/npcJobs.js';
import { flightV3 } from '../src/systems/flightV3.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;
const ESCORT_SLOT_ID = 'ceres_ambush_escort';
const WARD_SLOT_ID = 'ceres_ambush_loaded_hauler';

function actorRow(slotId) {
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    const slot = pocket.actorSlots.find((candidate) => candidate.id === slotId);
    if (slot) return { pocket, slot };
  }
  throw new Error(`missing Ceres activity slot ${slotId}`);
}

const ESCORT_ROW = actorRow(ESCORT_SLOT_ID);
const WARD_ROW = actorRow(WARD_SLOT_ID);

function recordId(slot) {
  return stableRecordId(
    SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );
}

function jobId(slot) {
  return `job:${recordId(slot)}`;
}

function jobSpec({ pocket, slot }) {
  const route = slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES_ACTIVITY_SECTOR_ID),
    targetRef: mark.targetRef,
  }));
  return {
    kind: slot.jobKind,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    route,
    speed: Math.hypot(
      route[1].pos.x - route[0].pos.x,
      route[1].pos.z - route[0].pos.z,
    ) / slot.route.durationS,
  };
}

function boot(seed = SEED, systems = [npcJobsRuntime]) {
  const sim = createSimulation({ seed, systems });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
  sim.state.world.records = sim.state.world.records || { byId: {} };
  sim.state.world.records.byId = sim.state.world.records.byId || {};
  return sim;
}

function spawnActor(sim, row, pos) {
  const entity = sim.spawn({
    type: 'ship',
    team: 2,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    radius: 7,
  });
  entity.homeSectorId = CERES_ACTIVITY_SECTOR_ID;
  entity.data = entity.data || {};
  Object.assign(entity.data, {
    worldRecordId: recordId(row.slot),
    activityActorSlotId: row.slot.id,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    ceresActivityCast: true,
    ceresActivityJobOwned: true,
    ai: { passive: true, roe: 'hold_fire' },
    intent: null,
  });
  return entity;
}

function assignPair(sim) {
  const runtime = sim.registry.get('npcJobsRuntime');
  const ward = spawnActor(sim, WARD_ROW, { x: 5000, z: 5000 });
  const escort = spawnActor(sim, ESCORT_ROW, { x: 4920, z: 5100 });
  assert.equal(runtime.assign(ward, jobSpec(WARD_ROW)), jobId(WARD_ROW.slot));
  assert.equal(runtime.assign(escort, jobSpec(ESCORT_ROW)), jobId(ESCORT_ROW.slot));
  return {
    runtime,
    ward,
    escort,
    wardEntry: sim.helpers.npcJobs.get(jobId(WARD_ROW.slot)),
    escortEntry: sim.helpers.npcJobs.get(jobId(ESCORT_ROW.slot)),
  };
}

function setFormationPose(pair) {
  pair.ward.pos.x = 5000;
  pair.ward.pos.z = 5000;
  pair.ward.vel.x = 20;
  pair.ward.vel.z = 0;
  pair.ward.rot = Math.PI / 2; // velocity, not rotation, is the live heading authority here.
  pair.escort.pos.x = 4920;
  pair.escort.pos.z = 5100;
  pair.escort.rot = -Math.PI / 2;
  pair.escort.data.intent = null;
  pair.wardEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
  pair.wardEntry.job.materialized = true;
  pair.escortEntry.job.phase = NPC_JOB_PHASE.HOLD;
  pair.escortEntry.job.materialized = true;
}

function assertFormationIntent(entity) {
  const intent = entity.data.intent;
  assert.ok(intent, 'the runtime writes one civilian formation intent');
  assert.ok(intent.moveZ > 0 && intent.moveZ <= 0.65, 'catch-up is forward, bounded, and non-boost');
  assert.equal(intent.boost, false);
  assert.equal(intent.brake, false);
  assert.ok(Math.abs(intent.aimAngle + Math.PI / 2) < 1e-6,
    'velocity heading puts the 80-WU aft target directly south of the escort');
}

function liveByRecordId(sim, worldRecordId) {
  return sim.state.entityList.find((entity) => entity && entity.alive && entity.data
    && entity.data.worldRecordId === worldRecordId) || null;
}

function bootProductionPair({ withSave = false } = {}) {
  const systems = withSave
    ? [world, npcJobsRuntime, traffic, save]
    : [world, npcJobsRuntime, traffic];
  const sim = createSimulation({ seed: SEED, systems });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);
  const wardEntry = sim.helpers.npcJobs.get(jobId(WARD_ROW.slot));
  const escortEntry = sim.helpers.npcJobs.get(jobId(ESCORT_ROW.slot));
  const ward = liveByRecordId(sim, recordId(WARD_ROW.slot));
  const escort = liveByRecordId(sim, recordId(ESCORT_ROW.slot));
  assert.ok(wardEntry && escortEntry && ward && escort,
    'the real seed-47 traffic cast materializes the exact job-owned pair');
  assert.equal(wardEntry.entityId, ward.id);
  assert.equal(escortEntry.entityId, escort.id);
  return { sim, runtime: sim.registry.get('npcJobsRuntime'), ward, escort, wardEntry, escortEntry };
}

test('fixed-seed production traffic pair holds the live 80-WU aft station', () => {
  const pair = bootProductionPair();
  try {
    setFormationPose(pair);
    const before = {
      phase: pair.escortEntry.job.phase,
      progress: pair.escortEntry.job.progress,
      routeIndex: pair.escortEntry.job.routeIndex,
      loopCount: pair.escortEntry.job.loopCount,
      simTime: pair.escortEntry.job.simTime,
      sequence: pair.escortEntry.job.sequence,
      wardX: pair.ward.pos.x,
      wardZ: pair.ward.pos.z,
      escortX: pair.escort.pos.x,
      escortZ: pair.escort.pos.z,
    };

    pair.runtime._drive(pair.escortEntry, pair.escort);
    assertFormationIntent(pair.escort);

    pair.escort.pos.x = 4920;
    pair.escort.pos.z = 5000;
    pair.escort.vel.x = 22;
    pair.escort.vel.z = 35;
    pair.escort.rot = 0;
    pair.escort.data.intent = null;
    assert.equal(Math.hypot(pair.escort.pos.x - 4920, pair.escort.pos.z - 5000), 0,
      'relative-speed cases start exactly on the moving ward\'s aft point');
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.equal(pair.escort.data.intent.moveX, 0);
    assert.ok(pair.escort.data.intent.moveZ > 0 && pair.escort.data.intent.moveZ <= 0.65,
      'at exactly +2 WU/s forward-relative speed, substantial lateral velocity still feed-forwards');
    assert.equal(pair.escort.data.intent.boost, false);
    assert.equal(pair.escort.data.intent.brake, false,
      'the overspeed threshold projects onto ward heading instead of braking on total relative speed');
    assert.equal(pair.escort.data.intent.aimAngle, 0);

    pair.escort.vel.x = 22.01;
    pair.escort.vel.z = 35;
    pair.escort.data.intent = null;
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.deepEqual({
      moveZ: pair.escort.data.intent.moveZ,
      boost: pair.escort.data.intent.boost,
      brake: pair.escort.data.intent.brake,
      aimAngle: pair.escort.data.intent.aimAngle,
    }, { moveZ: 0, boost: false, brake: true, aimAngle: 0 },
    'more than +2 WU/s along ward heading retains full braking despite unchanged lateral speed');

    pair.ward.vel.x = 0;
    pair.ward.vel.z = 0;
    pair.ward.rot = Math.PI / 2;
    pair.escort.pos.x = 5000;
    pair.escort.pos.z = 4920;
    pair.escort.vel.x = 0;
    pair.escort.vel.z = 0;
    pair.escort.rot = Math.PI / 2;
    pair.escort.data.intent = null;
    assert.equal(Math.hypot(pair.escort.pos.x - 5000, pair.escort.pos.z - 4920), 0,
      'the stationary regression pose is exactly on the rotation-derived aft point');
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.equal(pair.escort.data.intent.moveZ, 0,
      'a stationary ward commands no feed-forward at its exact aft point');
    assert.equal(pair.escort.data.intent.brake, true,
      'a stationary ward retains full braking inside the deadband');
    assert.ok(Math.abs(pair.escort.data.intent.aimAngle - Math.PI / 2) < 1e-6,
      'stationary deadband intent holds the finite live ward rotation');

    assert.deepEqual({
      phase: pair.escortEntry.job.phase,
      progress: pair.escortEntry.job.progress,
      routeIndex: pair.escortEntry.job.routeIndex,
      loopCount: pair.escortEntry.job.loopCount,
      simTime: pair.escortEntry.job.simTime,
      sequence: pair.escortEntry.job.sequence,
      wardX: pair.ward.pos.x,
      wardZ: pair.ward.pos.z,
      escortX: 5000,
      escortZ: 4920,
    }, { ...before, escortX: 5000, escortZ: 4920 },
    'formation authors intent only; job clocks/routes and physical poses remain owner-controlled');
  } finally {
    pair.sim.dispose();
  }
});

test('co-moving exact escort holds its aft station through multi-second Flight V3 motion', async () => {
  const sim = boot(SEED, [flightV3, npcJobsRuntime, physics]);
  const physicsSystem = sim.registry.get('physics');
  try {
    const pair = assignPair(sim);
    const wardSpeed = 24;
    pair.ward.mass = 55;
    pair.ward.flightClass = 'hauler';
    pair.ward.propulsion = PROPULSION_PROFILES.drive_reaction_l;
    pair.ward.physicsBody = {
      schemaVersion: 1, radius: pair.ward.radius, mass: pair.ward.mass,
      inertiaY: 110, dynamic: true, ccd: true, material: 'ship', revision: 0,
    };
    pair.escort.mass = 18;
    pair.escort.flightClass = 'fighter';
    pair.escort.propulsion = PROPULSION_PROFILES.drive_reaction_s;
    pair.escort.physicsBody = {
      schemaVersion: 1, radius: pair.escort.radius, mass: pair.escort.mass,
      inertiaY: 18, dynamic: true, ccd: true, material: 'ship', revision: 0,
    };
    pair.ward.pos.x = 5000;
    pair.ward.pos.z = 5000;
    pair.ward.vel.x = wardSpeed;
    pair.ward.vel.z = 0;
    pair.ward.rot = 0;
    pair.ward.angVel = 0;
    pair.escort.pos.x = pair.ward.pos.x - 80;
    pair.escort.pos.z = pair.ward.pos.z;
    pair.escort.vel.x = wardSpeed;
    pair.escort.vel.z = 0;
    pair.escort.rot = 0;
    pair.escort.angVel = 0;
    pair.wardEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
    pair.wardEntry.job.materialized = true;
    pair.escortEntry.job.phase = NPC_JOB_PHASE.HOLD;
    pair.escortEntry.job.materialized = true;

    sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await physicsSystem.prepareBackend(sim.state), true,
      'the causal formation proof advances through prepared Flight V3 physics authority');

    const wardClaim = sim.helpers.npcJobs.claimControl(jobId(WARD_ROW.slot), {
      claimId: 'test:ceres-escort-moving-ward',
      holder: 'ceres-escort-formation-test',
    });
    assert.equal(wardClaim.granted, true);
    pair.ward.data.intent = {
      moveX: 0,
      moveZ: wardSpeed / pair.ward.propulsion.combatSpeed,
      boost: false,
      brake: false,
      aimAngle: 0,
    };
    pair.runtime._drive(pair.escortEntry, pair.escort);

    let minSeparation = Number.POSITIVE_INFINITY;
    let maxSeparation = 0;
    let minEscortSpeed = Number.POSITIVE_INFINITY;
    let maxThrottle = 0;
    for (let tick = 0; tick < Math.round(6 / SIM_DT); tick++) {
      sim.step(SIM_DT);
      const separation = Math.hypot(
        pair.ward.pos.x - pair.escort.pos.x,
        pair.ward.pos.z - pair.escort.pos.z,
      );
      const escortSpeed = Math.hypot(pair.escort.vel.x, pair.escort.vel.z);
      minSeparation = Math.min(minSeparation, separation);
      maxSeparation = Math.max(maxSeparation, separation);
      minEscortSpeed = Math.min(minEscortSpeed, escortSpeed);
      const intent = pair.escort.data.intent;
      assert.ok(intent, 'formation intent remains live throughout the physical proof');
      assert.equal(intent.boost, false, 'formation never boosts during station keeping');
      assert.ok(intent.moveZ >= 0 && intent.moveZ <= 0.65,
        `formation throttle remains bounded, got ${intent.moveZ}`);
      maxThrottle = Math.max(maxThrottle, intent.moveZ);
    }

    assert.ok(minSeparation >= 60 && maxSeparation <= 100,
      `escort separation stays near the 80-WU aft station (range ${minSeparation}..${maxSeparation})`);
    assert.ok(minEscortSpeed >= wardSpeed * 0.6,
      `escort velocity never collapses while the ward moves (minimum ${minEscortSpeed})`);
    assert.ok(maxThrottle > 0 && maxThrottle <= 0.65,
      `station keeping uses bounded non-zero feed-forward (maximum ${maxThrottle})`);
  } finally {
    if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
      physicsSystem._disableSg02DynamicAuthority();
    }
    sim.dispose();
  }
});

test('formation overrides every normal patrol phase and both marks without taking kernel ownership', () => {
  const pair = bootProductionPair();
  try {
    const cases = [
      [NPC_JOB_PHASE.COMMISSION, 0],
      [NPC_JOB_PHASE.TRANSIT, 1],
      [NPC_JOB_PHASE.APPROACH, 0],
      [NPC_JOB_PHASE.HOLD, 1],
    ];
    for (const [phase, routeIndex] of cases) {
      setFormationPose(pair);
      Object.assign(pair.escortEntry.job, {
        phase,
        routeIndex,
        progress: 0.25,
        loopCount: 3,
        sequence: 17,
        simTime: 29.5,
      });
      pair.escort.data.intent = null;
      const before = {
        phase: pair.escortEntry.job.phase,
        routeIndex: pair.escortEntry.job.routeIndex,
        progress: pair.escortEntry.job.progress,
        loopCount: pair.escortEntry.job.loopCount,
        sequence: pair.escortEntry.job.sequence,
        simTime: pair.escortEntry.job.simTime,
      };
      pair.runtime._drive(pair.escortEntry, pair.escort);
      assertFormationIntent(pair.escort);
      assert.deepEqual({
        phase: pair.escortEntry.job.phase,
        routeIndex: pair.escortEntry.job.routeIndex,
        progress: pair.escortEntry.job.progress,
        loopCount: pair.escortEntry.job.loopCount,
        sequence: pair.escortEntry.job.sequence,
        simTime: pair.escortEntry.job.simTime,
      }, before, `${phase}/mark-${routeIndex} remains kernel-owned`);
    }
  } finally {
    pair.sim.dispose();
  }
});

test('exact Ceres escort follows its live ward during HOLD using velocity heading', () => {
  const sim = boot();
  try {
    const pair = assignPair(sim);
    setFormationPose(pair);
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assertFormationIntent(pair.escort);
    pair.escort.rot = Number.MAX_VALUE;
    pair.escort.data.intent = null;
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.equal(Number.isFinite(pair.escort.data.intent.aimAngle), true,
      'a huge finite restored rotation is normalized in constant time');
    assert.equal(Number.isFinite(pair.escort.data.intent.moveZ), true);
    assert.equal(pair.escortEntry.job.phase, NPC_JOB_PHASE.HOLD, 'formation never rewrites the kernel phase');
    assert.equal(pair.escortEntry.job.route[0].targetRef, `actor:${WARD_SLOT_ID}`);
  } finally {
    sim.dispose();
  }
});

test('formation sanitizes authored assist dead zones at and above its throttle ceiling', async (t) => {
  for (const deadInput of [0.65, Number.MAX_VALUE]) {
    await t.test(`deadInput=${deadInput}`, () => {
      const sim = boot();
      try {
        const pair = assignPair(sim);
        setFormationPose(pair);
        pair.escort.data.derived = {
          propulsion: {
            combatSpeed: 100,
            assist: { deadInput },
          },
        };

        pair.runtime._drive(pair.escortEntry, pair.escort);

        assert.equal(Number.isFinite(pair.escort.data.intent.moveZ), true);
        assert.ok(pair.escort.data.intent.moveZ >= 0
          && pair.escort.data.intent.moveZ <= 0.65,
        `formation throttle must remain inside [0, 0.65], got ${pair.escort.data.intent.moveZ}`);
        assert.equal(pair.escort.data.intent.boost, false);
      } finally {
        sim.dispose();
      }
    });
  }
});

test('a duplicate durable ward fails closed instead of selecting the first live body', () => {
  const sim = boot();
  try {
    const pair = assignPair(sim);
    const duplicate = spawnActor(sim, WARD_ROW, { x: 5100, z: 5000 });
    assert.equal(pair.runtime.assign(duplicate, jobSpec(WARD_ROW)), null,
      'a second entity object with the same durable identity is refused');
    setFormationPose(pair);
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.equal(pair.escort.data.intent.moveZ, 0,
      'ambiguous authority falls through to the pre-existing stationary HOLD behavior');
  } finally {
    sim.dispose();
  }
});

test('assignment marks malformed identity and replacement wrappers ambiguous', async (t) => {
  await t.test('malformed same-record contender', () => {
    const sim = boot();
    try {
      const pair = assignPair(sim);
      const contender = spawnActor(sim, WARD_ROW, { x: 5100, z: 5000 });
      contender.data.activityActorSlotId = 'spoofed-slot';
      assert.equal(pair.runtime.assign(contender, jobSpec(WARD_ROW)), null);
      assert.equal(pair.runtime._ceresEscortAuthority.ward.ambiguous, true);
      setFormationPose(pair);
      pair.runtime._drive(pair.escortEntry, pair.escort);
      assert.equal(pair.escort.data.intent.moveZ, 0);
    } finally {
      sim.dispose();
    }
  });

  await t.test('same-entity replacement entry and job wrappers', () => {
    const sim = boot();
    try {
      const pair = assignPair(sim);
      const replacement = { ...pair.wardEntry, job: { ...pair.wardEntry.job } };
      pair.runtime._byId()[jobId(WARD_ROW.slot)] = replacement;
      assert.equal(pair.runtime.assign(pair.ward, jobSpec(WARD_ROW)), null);
      assert.equal(pair.runtime._ceresEscortAuthority.ward.ambiguous, true);
      assert.equal(pair.ward.data.jobId, jobId(WARD_ROW.slot),
        'refusal does not rewrite or clear the live producer marker');
    } finally {
      sim.dispose();
    }
  });
});

test('formation rejects stale, terminal, malformed, or replaced authority with one static-route write', async (t) => {
  const cases = [
    ['absent ward job', (pair) => { delete pair.runtime._byId()[jobId(WARD_ROW.slot)]; }],
    ['dead ward', (pair) => { pair.ward.alive = false; }],
    ['wrong-sector ward', (pair) => { pair.ward.data.sectorId = 'sector_helios_prime'; }],
    ['wrong current sector', (pair) => { pair.runtime.state.world.currentSectorId = 'sector_helios_prime'; }],
    ['wrong entry kind', (pair) => { pair.wardEntry.kind = 'patrol'; }],
    ['wrong job kind', (pair) => { pair.wardEntry.job.kind = 'patrol'; }],
    ['illegal ward phase', (pair) => { pair.wardEntry.job.phase = NPC_JOB_PHASE.HOLD; }],
    ['malformed ward route', (pair) => { pair.wardEntry.job.route = []; }],
    ['nonfinite ward speed', (pair) => { pair.wardEntry.job.speed = Number.NaN; }],
    ['complete ward job', (pair) => { pair.wardEntry.job.phase = NPC_JOB_PHASE.COMPLETE; }],
    ['complete escort job', (pair) => { pair.escortEntry.job.phase = NPC_JOB_PHASE.COMPLETE; }],
    ['nonfinite ward pose', (pair) => { pair.ward.pos.x = Number.NaN; }],
    ['malformed relationship', (pair) => {
      pair.escortEntry.job.route[pair.escortEntry.job.routeIndex].targetRef = 'actor:spoof';
    }],
    ['same-id replacement object', (pair) => {
      const replacement = { ...pair.ward, data: pair.ward.data, pos: pair.ward.pos, vel: pair.ward.vel };
      pair.runtime.state.entities.set(pair.ward.id, replacement);
    }],
    ['replacement data wrapper', (pair) => { pair.ward.data = { ...pair.ward.data }; }],
    ['terminal durable tombstone', (pair) => {
      pair.runtime.state.world.records.byId[recordId(WARD_ROW.slot)] = {
        recordId: recordId(WARD_ROW.slot),
        kind: RECORD_KIND.CONVOY,
        sectorId: CERES_ACTIVITY_SECTOR_ID,
        alive: false,
        outcome: 'destroyed',
      };
    }],
    ['missing exact source job marker', (pair) => { delete pair.escort.data.jobId; }],
  ];

  for (const [label, mutate] of cases) {
    await t.test(label, () => {
      const sim = boot();
      try {
        const pair = assignPair(sim);
        setFormationPose(pair);
        mutate(pair);
        let writes = 0;
        const originalWrite = pair.runtime._writeIntent;
        pair.runtime._writeIntent = function wrappedWrite(...args) {
          writes++;
          return originalWrite.apply(this, args);
        };
        try {
          pair.runtime._drive(pair.escortEntry, pair.escort);
        } finally {
          pair.runtime._writeIntent = originalWrite;
        }
        assert.equal(writes, 1, `${label} falls through without a neutral prewrite`);
        assert.deepEqual({
          moveX: pair.escort.data.intent.moveX,
          moveZ: pair.escort.data.intent.moveZ,
          boost: pair.escort.data.intent.boost,
          brake: pair.escort.data.intent.brake,
        }, { moveX: 0, moveZ: 0, boost: false, brake: false },
        `${label} retains the pre-existing stationary HOLD controller`);
      } finally {
        sim.dispose();
      }
    });
  }
});

test('serialize/deserialize relinks fresh numeric identities and reacquires formation authority', () => {
  const outgoing = boot();
  let saved;
  let oldIds;
  try {
    const pair = assignPair(outgoing);
    setFormationPose(pair);
    oldIds = [pair.ward.id, pair.escort.id];
    saved = pair.runtime.serialize();
  } finally {
    outgoing.dispose();
  }

  const incoming = boot();
  try {
    incoming.spawn({ type: 'fx', team: 2, pos: { x: 0, z: 0 }, radius: 1 });
    incoming.spawn({ type: 'fx', team: 2, pos: { x: 0, z: 0 }, radius: 1 });
    const ward = spawnActor(incoming, WARD_ROW, { x: 5000, z: 5000 });
    const escort = spawnActor(incoming, ESCORT_ROW, { x: 4920, z: 5100 });
    const runtime = incoming.registry.get('npcJobsRuntime');
    runtime.deserialize(saved);
    runtime._onSectorEnter({ sectorId: CERES_ACTIVITY_SECTOR_ID });
    const pair = {
      runtime,
      ward,
      escort,
      wardEntry: incoming.helpers.npcJobs.get(jobId(WARD_ROW.slot)),
      escortEntry: incoming.helpers.npcJobs.get(jobId(ESCORT_ROW.slot)),
    };
    assert.notDeepEqual([ward.id, escort.id], oldIds, 'the restored run uses fresh numeric identities');
    setFormationPose(pair);
    runtime._drive(pair.escortEntry, escort);
    assertFormationIntent(escort);
    assert.equal(JSON.stringify(saved).includes(`\"entityId\":${oldIds[0]}`), false,
      'the save-side job bag contains no retained live ward id');
  } finally {
    incoming.dispose();
  }
});

test('FLEE and an external control lease outrank formation, then formation resumes next tick', () => {
  const sim = boot();
  try {
    const pair = assignPair(sim);
    setFormationPose(pair);
    const threat = sim.spawn({
      type: 'ship', team: 1, pos: { x: 4900, z: 5100 }, vel: { x: 0, z: 0 },
      hull: 100, hullMax: 100, radius: 6,
    });
    pair.escortEntry.job.phase = NPC_JOB_PHASE.FLEE;
    pair.escortEntry.threatId = threat.id;
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assert.equal(pair.escort.data.intent.boost, true);
    assert.equal(pair.escort.data.intent.moveZ, 1, 'existing FLEE branch remains first');

    threat.alive = false;
    sim.state.entities.delete(threat.id);
    pair.escortEntry.job.phase = NPC_JOB_PHASE.HOLD;
    pair.escortEntry.threatId = null;
    const claim = sim.helpers.npcJobs.claimControl(jobId(ESCORT_ROW.slot), {
      claimId: 'lawSecurity:test:formation',
      holder: 'lawSecurity',
    });
    assert.equal(claim.granted, true);
    pair.escort.data.intent = {
      moveX: 0.25, moveZ: -0.5, boost: false, brake: false,
      fire: false, fireGroup: null, aimAngle: 0.75,
    };
    const sentinel = { ...pair.escort.data.intent };
    const beforeSimTime = pair.escortEntry.job.simTime;
    pair.runtime.update(1 / 60, sim.state);
    assert.deepEqual(pair.escort.data.intent, sentinel,
      'the claimed hull receives no route or formation write');
    assert.ok(pair.escortEntry.job.simTime > beforeSimTime,
      'the kernel clock continues while the movement lease owns the hull');

    assert.equal(sim.helpers.npcJobs.releaseControl(
      jobId(ESCORT_ROW.slot),
      claim.claim.claimId,
    ).released, true);
    pair.runtime.update(0, sim.state);
    assertFormationIntent(pair.escort);
  } finally {
    sim.dispose();
  }
});

test('steady formation performs no entity-list scan and other jobs retain static-route behavior', () => {
  const sim = boot();
  try {
    const pair = assignPair(sim);
    setFormationPose(pair);
    const entityList = sim.state.entityList;
    sim.state.entityList = {
      [Symbol.iterator]() { throw new Error('steady formation must not scan entityList'); },
    };
    pair.runtime._drive(pair.escortEntry, pair.escort);
    assertFormationIntent(pair.escort);
    sim.state.entityList = entityList;

    const otherRow = actorRow('ceres_cathedral_patrol');
    const other = spawnActor(sim, otherRow, { x: 7000, z: 7000 });
    const otherJobId = pair.runtime.assign(other, jobSpec(otherRow));
    const otherEntry = sim.helpers.npcJobs.get(otherJobId);
    otherEntry.job.phase = NPC_JOB_PHASE.HOLD;
    other.data.intent = null;
    pair.runtime._drive(otherEntry, other);
    assert.deepEqual({
      moveX: other.data.intent.moveX,
      moveZ: other.data.intent.moveZ,
      boost: other.data.intent.boost,
      brake: other.data.intent.brake,
    }, { moveX: 0, moveZ: 0, boost: false, brake: false },
    'an unrelated authored Ceres patrol keeps the exact stationary controller');

    const ordinary = sim.spawn({
      type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      hull: 100, hullMax: 100, radius: 6,
    });
    ordinary.data = { worldRecordId: 'ordinary-static-route', sectorId: CERES_ACTIVITY_SECTOR_ID };
    const ordinaryJobId = pair.runtime.assign(ordinary, {
      kind: 'patrol',
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      route: [
        { id: 'ordinary-a', pos: { x: 0, z: 0 } },
        { id: 'ordinary-b', pos: { x: 100, z: 0 } },
      ],
      speed: 40,
    });
    const ordinaryEntry = sim.helpers.npcJobs.get(ordinaryJobId);
    ordinaryEntry.job.phase = NPC_JOB_PHASE.TRANSIT;
    ordinary.data.intent = null;
    pair.runtime._drive(ordinaryEntry, ordinary);
    assert.ok(ordinary.data.intent.moveZ > 0, 'ordinary transit retains its authored forward command');
    assert.ok(Math.abs(ordinary.data.intent.aimAngle) < 1e-9,
      'ordinary transit still aims at its static +X waypoint');
  } finally {
    sim.dispose();
  }
});

test('duplicate rematerialization is ambiguous, then a unique relink rebuilds exact authority', () => {
  const outgoing = boot();
  let saved;
  try {
    assignPair(outgoing);
    saved = outgoing.registry.get('npcJobsRuntime').serialize();
  } finally {
    outgoing.dispose();
  }

  const incoming = boot();
  try {
    const ward = spawnActor(incoming, WARD_ROW, { x: 5000, z: 5000 });
    const duplicate = spawnActor(incoming, WARD_ROW, { x: 5100, z: 5000 });
    const escort = spawnActor(incoming, ESCORT_ROW, { x: 4920, z: 5100 });
    const runtime = incoming.registry.get('npcJobsRuntime');
    runtime.deserialize(saved);
    runtime._onSectorEnter({ sectorId: CERES_ACTIVITY_SECTOR_ID });
    const wardEntry = incoming.helpers.npcJobs.get(jobId(WARD_ROW.slot));
    const escortEntry = incoming.helpers.npcJobs.get(jobId(ESCORT_ROW.slot));
    assert.equal(wardEntry.entityId, null);
    assert.equal(runtime._ceresEscortAuthority.ward.ambiguous, true);
    escortEntry.job.phase = NPC_JOB_PHASE.HOLD;
    escort.data.intent = null;
    runtime._drive(escortEntry, escort);
    assert.equal(escort.data.intent.moveZ, 0, 'ambiguous relink falls back to the static HOLD route');

    incoming.state.entities.delete(duplicate.id);
    incoming.state.entityList = incoming.state.entityList.filter((entity) => entity !== duplicate);
    assert.equal(runtime._tryRelink(wardEntry, incoming.state.simTime), true);
    assert.equal(wardEntry.entityId, ward.id);
    assert.equal(runtime._ceresEscortAuthority.ward.ambiguous, false);
    const pair = { runtime, ward, escort, wardEntry, escortEntry };
    setFormationPose(pair);
    runtime._drive(escortEntry, escort);
    assertFormationIntent(escort);
  } finally {
    incoming.dispose();
  }
});

test('real save/Continue reacquires the production pair through stable jobs after numeric-id churn', () => {
  const pair = bootProductionPair({ withSave: true });
  try {
    setFormationPose(pair);
    pair.escortEntry.job.progress = 0.375;
    pair.escortEntry.job.sequence = 19;
    const oldIds = [pair.ward.id, pair.escort.id];
    const saveSystem = pair.sim.registry.get('save');
    const envelope = saveSystem.serialize('r6-escort-formation');
    const savedEscort = envelope.data.npcJobs.byId[jobId(ESCORT_ROW.slot)];
    assert.ok(savedEscort && savedEscort.job);
    assert.equal(Object.hasOwn(savedEscort, 'entityId'), false,
      'the persisted runtime entry never carries the live escort id');

    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'r6-escort-formation',
    ), true);
    const runtime = pair.sim.registry.get('npcJobsRuntime');
    const wardEntry = pair.sim.helpers.npcJobs.get(jobId(WARD_ROW.slot));
    const escortEntry = pair.sim.helpers.npcJobs.get(jobId(ESCORT_ROW.slot));
    const ward = liveByRecordId(pair.sim, recordId(WARD_ROW.slot));
    const escort = liveByRecordId(pair.sim, recordId(ESCORT_ROW.slot));
    assert.ok(wardEntry && escortEntry && ward && escort);
    assert.notDeepEqual([ward.id, escort.id], oldIds,
      'Continue rematerializes fresh numeric identities under the stable pair');
    assert.deepEqual({ phase: escortEntry.job.phase, progress: escortEntry.job.progress, sequence: escortEntry.job.sequence }, {
      phase: NPC_JOB_PHASE.HOLD,
      progress: 0.375,
      sequence: 19,
    }, 'Continue preserves the kernel clock/state rather than recommissioning the escort');
    const restored = { runtime, ward, escort, wardEntry, escortEntry };
    setFormationPose(restored);
    runtime._drive(escortEntry, escort);
    assertFormationIntent(escort);
  } finally {
    pair.sim.dispose();
  }
});
