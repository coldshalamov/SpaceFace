import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const CERES = 'sector_ceres_belt';
const SEED = 47;
const ACTOR_SLOT = 'ceres_seam_miner';
const TARGET_ROW = Object.freeze({
  type: 'asteroid',
  radius: 40,
  identityField: 'activityObjectSlotId',
  identityValue: 'ceres_seam_ore_clast',
});

function dynamicJobShip() {
  return {
    type: 'ship',
    team: 2,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 8,
    collides: true,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    mass: 20,
    flightClass: 'hauler',
    flightModel: { inertia: 40 },
    data: {
      worldRecordId: 'ceres:test:late-audit-h2',
      ai: { passive: true, roe: 'hold_fire' },
      intent: null,
    },
  };
}

function ceresActivityActorRouteSpec(actorSlotId) {
  const pocket = CERES_ACTIVITY_POCKETS.find((candidate) => (
    candidate.actorSlots.some((actor) => actor.id === actorSlotId)
  ));
  const slot = pocket && pocket.actorSlots.find((candidate) => candidate.id === actorSlotId);
  assert.ok(pocket && slot, `the Ceres ${actorSlotId} route remains authored`);
  const route = slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES),
    targetRef: mark.targetRef,
  }));
  const distance = Math.hypot(
    route[1].pos.x - route[0].pos.x,
    route[1].pos.z - route[0].pos.z,
  );
  return {
    kind: slot.jobKind,
    sectorId: CERES,
    routeId: slot.route.id,
    speed: distance / slot.route.durationS,
    route,
    actorSlotId: slot.id,
    worldRecordSlotId: slot.worldRecordSlotId,
  };
}

function spawnCanonicalCeresJob(sim) {
  const spec = ceresActivityActorRouteSpec(ACTOR_SLOT);
  const worldRecordId = stableRecordId(
    SEED,
    CERES,
    RECORD_KIND.CONVOY,
    spec.worldRecordSlotId,
  );
  const entitySpec = dynamicJobShip();
  entitySpec.homeSectorId = CERES;
  entitySpec.data.worldRecordId = worldRecordId;
  entitySpec.data.identityKey = spec.worldRecordSlotId;
  entitySpec.data.homeSectorId = CERES;
  entitySpec.data.sectorId = CERES;
  entitySpec.data.activityActorSlotId = ACTOR_SLOT;
  entitySpec.data.ceresActivityCast = true;
  entitySpec.data.ceresActivityJobOwned = true;
  entitySpec.pos = { ...spec.route[0].pos };
  const entity = sim.spawn(entitySpec);
  const jobId = sim.helpers.npcJobs.assign(entity, spec);
  assert.equal(jobId, `job:${worldRecordId}`);
  return { entity, entry: sim.state.npcJobs.byId[jobId], jobId, spec };
}

function spawnCeresTarget(sim, pos) {
  const data = { homeSectorId: CERES, sectorId: CERES };
  data[TARGET_ROW.identityField] = TARGET_ROW.identityValue;
  const target = sim.spawn({
    type: TARGET_ROW.type,
    alive: true,
    collides: true,
    radius: TARGET_ROW.radius,
    pos: { ...pos },
    data,
  });
  target.homeSectorId = CERES;
  return target;
}

function removeFromLiveCollectionsWithoutDestroyEvent(state, entity) {
  state.entities.delete(entity.id);
  const index = state.entityList.indexOf(entity);
  if (index >= 0) state.entityList.splice(index, 1);
}

test('H2: unrelated id-only same-type destroyed events cannot re-admit an ambiguous target', () => {
  const sim = createSimulation({ seed: SEED, systems: [npcJobsRuntime] });
  try {
    sim.state.mode = 'flight';
    sim.state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(sim);
    const runtime = sim.registry.get('npcJobsRuntime');
    miner.entry.job.phase = NPC_JOB_PHASE.TRANSIT;
    miner.entry.job.routeIndex = 0;
    miner.entry.job.progress = 0;

    const authored = miner.spec.route[1].pos;
    const target = spawnCeresTarget(sim, { x: authored.x + 320, z: authored.z + 210 });
    const duplicate = spawnCeresTarget(sim, { x: authored.x + 370, z: authored.z + 180 });
    const unrelated = sim.spawn({
      type: TARGET_ROW.type,
      alive: true,
      collides: true,
      radius: 9,
      pos: { x: authored.x - 400, z: authored.z - 400 },
      data: { homeSectorId: CERES, sectorId: CERES, unrelatedSameTypeDeath: true },
    });
    const liveAim = Math.atan2(target.pos.z - miner.entity.pos.z, target.pos.x - miner.entity.pos.x);
    const authoredAim = Math.atan2(
      authored.z - miner.spec.route[0].pos.z,
      authored.x - miner.spec.route[0].pos.x,
    );

    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'two same-slot targets are ambiguous and fall back to the authored route');
    const ambiguousBindings = runtime._ensureCeresRealTargetAuthority().bindings.filter((binding) => (
      binding.jobId === miner.jobId && binding.targetAmbiguous === true
    ));
    assert.ok(ambiguousBindings.length > 0, 'the target ambiguity is retained before the unrelated event');

    removeFromLiveCollectionsWithoutDestroyEvent(sim.state, duplicate);
    removeFromLiveCollectionsWithoutDestroyEvent(sim.state, unrelated);
    sim.bus.emit('entity:destroyed', { id: unrelated.id, type: unrelated.type });

    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - authoredAim) < 1e-9,
      'an unrelated id-only same-type destroyed payload cannot authorize target re-admission');
    assert.ok(ambiguousBindings.every((binding) => (
      binding.targetAmbiguous === true && binding.targetRef === null && binding.targetMatches === 2
    )), 'the ambiguity state remains pinned to the original target contenders');

    sim.bus.emit('entity:destroyed', { id: duplicate.id, type: duplicate.type });
    miner.entity.rot = liveAim;
    runtime._drive(miner.entry, miner.entity);
    assert.ok(Math.abs(miner.entity.data.intent.aimAngle - liveAim) < 1e-9,
      'a destroyed payload naming an original ambiguous contender re-admits the sole surviving target');
  } finally {
    sim.dispose();
  }
});
