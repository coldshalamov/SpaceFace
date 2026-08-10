import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { CERES_ACTIVITY_POCKETS } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';

const CERES = 'sector_ceres_belt';
const SEED = 47;
const ACTOR_SLOT = 'ceres_seam_miner';

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
      worldRecordId: 'ceres:test:late-audit-h1',
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
  return { entity, entry: sim.state.npcJobs.byId[jobId], jobId };
}

function assertReplacementUnchanged(replacement, jobId, message) {
  assert.deepEqual(replacement.data, {
    jobId,
    intent: { brake: true },
    unrelatedSameIdReplacement: true,
  }, message);
}

test('H1: release and sector exit do not clean up a live same-id replacement', () => {
  let watchedDestroyId = null;
  let replacement = null;
  let replacementJobId = null;
  const idReuseBeforeRuntime = {
    name: 'pq045H1ReleaseIdReuseProbe',
    init({ bus, helpers }) {
      bus.on('entity:destroyed', (payload) => {
        if (payload?.id !== watchedDestroyId || replacement) return;
        replacement = helpers.spawnEntity({
          type: 'projectile',
          alive: true,
          collides: false,
          radius: 1,
          pos: { x: 0, z: 0 },
          vel: { x: 0, z: 0 },
          data: {
            jobId: replacementJobId,
            intent: { brake: true },
            unrelatedSameIdReplacement: true,
          },
        });
      });
    },
  };

  const released = createSimulation({
    seed: SEED,
    systems: [idReuseBeforeRuntime, npcJobsRuntime],
    updateOrder: [],
  });
  try {
    released.state.mode = 'flight';
    released.state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(released);
    watchedDestroyId = miner.entity.id;
    replacementJobId = miner.jobId;

    released.helpers.removeEntity(miner.entity.id);
    released.step(SIM_DT);

    assert.ok(replacement, 'the probe reused the actor id before npcJobsRuntime observed destruction');
    assert.equal(replacement.id, miner.entity.id);
    assert.strictEqual(released.state.entities.get(replacement.id), replacement);
    assert.equal(released.state.npcJobs.byId[miner.jobId], undefined,
      'the retained terminal actor still releases its job');
    assertReplacementUnchanged(replacement, miner.jobId,
      'release must not clear brake or jobId on the unrelated same-id replacement');
  } finally {
    released.dispose();
  }

  const exited = createSimulation({ seed: SEED, systems: [npcJobsRuntime] });
  try {
    exited.state.mode = 'flight';
    exited.state.world.currentSectorId = CERES;
    const miner = spawnCanonicalCeresJob(exited);
    const successor = {
      ...miner.entity,
      type: 'projectile',
      alive: true,
      data: {
        jobId: miner.jobId,
        intent: { brake: true },
        unrelatedSameIdReplacement: true,
      },
    };
    exited.state.entities.set(successor.id, successor);

    exited.bus.emit('sector:exit', { sectorId: CERES, continuous: true, noTeleport: true });

    assert.equal(miner.entry.entityId, null, 'sector exit virtualizes the retained job record');
    assert.equal(miner.entry.job.materialized, false, 'the job kernel is dematerialized for offscreen catch-up');
    assertReplacementUnchanged(successor, miner.jobId,
      'sector exit must not clear brake or jobId on the unrelated same-id replacement');
  } finally {
    exited.dispose();
  }
});
