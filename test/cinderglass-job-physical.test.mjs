// Isolated native-owner fixtures. They initialize actors/operation; not ordinary player-route proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ATTACHMENT_DEFS, COMBAT_PROFILES } from '../src/data/combatDefs.js';
import { lineCanThrow, lineThrowTierForBody } from '../src/data/lineRating.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  CINDERGLASS_JOB_COMBAT_PROFILE, CINDERGLASS_JOB_MOUNT_DEFINITION,
  CINDERGLASS_JOB_POD_ID, CINDERGLASS_JOB_POINTS, CINDERGLASS_JOB_ROUTE,
  CINDERGLASS_JOB_ROLES, CINDERGLASS_JOB_LATCH_HULL,
} from '../src/features/cinderglassJob/definition.js';
import {
  cinderglassJobAdmit, cinderglassJobStepConvoy, cinderglassJobDismissConvoy, podSpec,
} from '../src/features/cinderglassJob/convoy.js';
import { cinderglassJobTrafficTarget, cinderglassJobTrafficDt,
  cinderglassJobClearLatchMount } from '../src/features/cinderglassJob/physical.js';

async function scene() {
  let ctx;
  const catalog = createCombatCatalog({
    profiles: [...COMBAT_PROFILES.filter(x => x.id !== CINDERGLASS_JOB_COMBAT_PROFILE.id), CINDERGLASS_JOB_COMBAT_PROFILE],
    attachments: [...ATTACHMENT_DEFS.filter(x => x.id !== CINDERGLASS_JOB_MOUNT_DEFINITION.id), CINDERGLASS_JOB_MOUNT_DEFINITION],
  });
  const fixture = { name: 'cinderglassPhysicalFixture', init(value) {
    ctx = value;
    getCombatKernel(value, { catalog });
  }};
  const sim = createSimulation({ seed: 4242, systems: [physics, fixture, npcJobsRuntime, flightV3, combat] });
  const state = sim.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  state.world ||= {};
  state.world.currentSectorId = 'sector_tethys_junction';
  const st = state.world.cinderglassJob = { operationId: 'cg-physical-fixture-1', entities: {},
    custody: 'carried', suspicion: 0, captainAlive: true, actors: { dask: { alive: true } } };
  const sys = { ...ctx, _cg: st };
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: {
    x: CINDERGLASS_JOB_POINTS.marshal.x - 120, z: CINDERGLASS_JOB_POINTS.marshal.z + 130 }, team: 0, isPlayer: true }));
  state.playerId = player.id;
  function step(n = 1) { for (let i = 0; i < n; i++) { sim.step(SIM_DT); cinderglassJobStepConvoy(sys, state); } }
  let admitted = false;
  for (let i = 0; i < 20 && !admitted; i++) { admitted = cinderglassJobAdmit(sys, state); step(); }
  assert.equal(admitted, true, st.admissionReason);
  const carrier = state.entities.get(st.entities.carrierId), pod = state.entities.get(st.entities.podId);
  const made = sim.registry.get('combat').kernel.attachments.create({ defId: 'attachment_transport_clamp', ownerId: carrier.id, targetId: pod.id });
  assert.equal(made.ok, true, made.reason);
  st.entities.clampAttachmentId = made.attachment.id;
  st.cohortAdmitted = true;
  return { sim, sys, state, st, player, carrier, pod, step,
    latch: state.entities.get(st.entities.latchId),
    attachments: sim.registry.get('combat').kernel.attachments };
}

test('native 18 tonne original preserves Mule55 and starter Line T0; full cohort is measured', async () => {
  const t = await scene(); t.step(3);
  const native = t.sim.registry.get('physics')._sg02;
  assert.equal(resolvePhysicsBodySpec(t.pod).mass, 18);
  assert.equal(native.records.get(t.pod.id).body.mass(), 18);
  assert.equal(native.records.get(t.carrier.id).body.mass(), 55);
  assert.equal(lineThrowTierForBody(t.pod), 0);
  assert.equal(lineCanThrow(0, t.pod), true);
  assert.equal(t.latch.hullMax, 60);
  for (const [key, descriptor] of Object.entries(CINDERGLASS_JOB_ROLES)) {
    const e = t.state.entities.get(t.st.entities[key]);
    assert.equal(e.data.worldRecordId, descriptor.worldRecordId);
    assert.equal(e.data.cinderglassOperationId, t.st.operationId);
    assert.ok(native.records.get(e.id));
    if (['latch', 'cradle', 'broker', 'layby'].includes(descriptor.role)) {
      assert.ok(e.physicsBody.collisionProxyManifest.primitives.length);
      assert.ok(e.data.packagedPropFile.endsWith('.glb'));
    }
  }
  t.attachments.cut(t.st.entities.clampAttachmentId, t.player.id, 'fixture-release');
  // A real standard starter line accepts this original; no rating bypass or mass rewrite.
  const line = t.attachments.create({ defId: 'tether_standard', ownerId: t.player.id, targetId: t.pod.id });
  assert.equal(line.ok, true, line.reason);
  assert.ok(line.attachment.restLength < 390, 'real starter line at a reachable authored separation');
  t.step(3);
  assert.equal(t.attachments.get(line.attachment.id).state, 'active');
  t.sim.dispose();
});

test('actual projectile damage reaches external hull60 once; tick does not heal or carrier-subsystem swap', async () => {
  const t = await scene();
  const c = t.sim.registry.get('combat');
  const initialCarrierHull = t.carrier.hull;
  const first = c.onHit({ targetId: t.latch.id, ownerId: t.player.id, damage: 23, damageType: 'kinetic', pos: t.latch.pos });
  assert.equal(first.ok, true, first.reason);
  assert.ok(t.latch.hull < CINDERGLASS_JOB_LATCH_HULL);
  const after = t.latch.hull;
  t.step(3);
  assert.equal(t.latch.hull, after, 'no per-tick health writer');
  const killed = [];
  t.state.bus?.on?.('entity:death', e => killed.push(e));
  c.onHit({ targetId: t.latch.id, ownerId: t.player.id, damage: 80, damageType: 'kinetic', pos: t.latch.pos });
  assert.equal(t.latch.alive, false);
  assert.equal(t.carrier.hull, initialCarrierHull, 'physical latch is separate from the transport hull');
  t.step(2);
  assert.equal(t.attachments.get(t.st.entities.latchMountId).state, 'broken');
  const podHit = c.onHit({ targetId: t.pod.id, ownerId: t.player.id, damage: 25, damageType: 'kinetic', pos: t.pod.pos });
  assert.equal(podHit.ok, true, podHit.reason);
  assert.ok(t.pod.hull < t.pod.hullMax, 'same original has canonical finite prize damage');
  // Root exact-occupant death handler cuts the carrier's pod clamp; this fixture does not claim
  // that unintegrated handler or ordinary weapon aiming has been exercised.
  t.sim.dispose();
});

test('real native route reaches low-speed inspection, holds one nested job, then resumes', async () => {
  const t = await scene();
  const entry = t.state.npcJobs.byId[t.st.entities.carrierJobId];
  assert.deepEqual(entry.job.route.map(x => x.pos), CINDERGLASS_JOB_ROUTE.map(x => x.pos));
  assert.deepEqual(entry.job.route[0].pos, CINDERGLASS_JOB_POINTS.marshal);
  const start = { ...t.carrier.pos };
  let reachedAt = null, heldProgress = null, heldAt = null, resumed = false, completedAt = null;
  t.sys.bus.on('npcjobs:complete', event => {
    if (event.jobId === entry.job.id) completedAt = t.state.simTime;
  });
  for (let i = 0; i < 18000; i++) {
    t.step();
    if (t.st.atLayby && reachedAt == null) {
      assert.equal(t.st.rememberedFacts.filter(f => f.id === 'inspection_arrived').length, 1);
      assert.equal(t.st.rememberedFacts.some(f => f.id === 'inspection_departed'), false);
      assert.notEqual(t.st.scanDone, true, 'radio never grants a scanner read');
      reachedAt = t.state.simTime; heldAt = { ...t.carrier.pos }; heldProgress = entry.job.progress;
      assert.equal(entry.job.routeIndex, 1);
      assert.ok(Math.hypot(t.carrier.vel.x, t.carrier.vel.z) < 3.5);
    }
    if (reachedAt != null && t.state.simTime - reachedAt > 2 && t.st.laybyHoldActive) {
      assert.equal(entry.job.progress, heldProgress, 'lease pauses canonical job clock');
      assert.ok(Math.hypot(t.carrier.pos.x - heldAt.x, t.carrier.pos.z - heldAt.z) < 10,
        `canonical brake holds native hull ${JSON.stringify({ at: t.carrier.pos, heldAt, vel: t.carrier.vel, intent: t.carrier.data.intent, since: t.state.simTime - reachedAt })}`);
    }
    if (reachedAt != null && t.st.laybyDone && !t.st.laybyHoldActive
      && Math.hypot(t.carrier.pos.x - heldAt.x, t.carrier.pos.z - heldAt.z) > 40) resumed = true;
    if (completedAt != null) break;
  }
  assert.ok(reachedAt != null, `physical inspection reached from ${JSON.stringify(start)}; final ${JSON.stringify(t.carrier.pos)} leg ${entry.job.routeIndex} phase ${entry.job.phase}`);
  assert.equal(t.st.rememberedFacts.filter(f => f.id === 'inspection_arrived').length, 1);
  assert.equal(t.st.rememberedFacts.filter(f => f.id === 'inspection_departed').length, 1);
  assert.ok(t.st.rememberedFacts.find(f => f.id === 'inspection_departed').atS > reachedAt + 30);
  assert.equal(t.st.custody, 'carried', 'radio does not transfer the original');
  assert.equal(resumed, true, 'same original resumes the outbound bend after finite hold');
  assert.ok(completedAt != null, 'canonical finite hauler emits actual completion');
  assert.ok(Math.hypot(t.carrier.pos.x - CINDERGLASS_JOB_POINTS.marshal.x,
    t.carrier.pos.z - CINDERGLASS_JOB_POINTS.marshal.z) <= 18, 'actual final low-speed original returns to marshal');
  assert.ok(completedAt >= 120 && completedAt <= 240, `authored 2–4 minute physical itinerary: ${completedAt}`);
  console.log(JSON.stringify({ layer: 'isolated production native route with proposed owner hunks', inspectionAtS: reachedAt,
    completedAtS: completedAt, nativePodMassT: t.sim.registry.get('physics')._sg02.records.get(t.pod.id).body.mass() }));
  t.sim.dispose();
});

test('missing/restoring handle never finishes run and admitted originals never respawn', async () => {
  const t = await scene();
  t.st.entities.carrierJobId = null;
  cinderglassJobStepConvoy(t.sys, t.state);
  assert.notEqual(t.st.runFinished, true);
  const originalPodId = t.st.entities.podId;
  t.sys.helpers.removeEntity(originalPodId);
  const originalCount = [...t.state.entities.values()].filter(e => e.data?.worldRecordId === CINDERGLASS_JOB_POD_ID).length;
  assert.equal(cinderglassJobAdmit(t.sys, t.state), false);
  assert.equal([...t.state.entities.values()].filter(e => e.data?.worldRecordId === CINDERGLASS_JOB_POD_ID).length, originalCount);
  cinderglassJobClearLatchMount(t.sys, t.state);
  assert.equal(t.st.entities.latchMountId, null);
  cinderglassJobDismissConvoy(t.sys, t.state);
  assert.equal(t.sys.helpers.npcJobs.activeControlClaimCount(), 0);
  // Adversarial synchronous reset during the canonical spawn receipt. Roll back only
  // that just-created old-life occupant; all unrelated originals stay untouched.
  const previous = [...t.state.entities.values()].filter(e => e.alive !== false);
  const originalSpawn = t.sys.helpers.spawnEntity;
  t.sys._cg = { operationId: 'cg-reset-during-spawn', entities: {} };
  t.sys.helpers = { ...t.sys.helpers, spawnEntity: spec => {
    const e = originalSpawn(spec);
    t.sys._cg = { operationId: 'cg-next-life', entities: {} };
    return e;
  } };
  assert.equal(cinderglassJobAdmit(t.sys, t.state), false);
  assert.deepEqual([...t.state.entities.values()].filter(e => e.alive !== false), previous,
    'canonical removal leaves no live old-life orphan and preserves every earlier occupant');
  t.sim.dispose();
});
