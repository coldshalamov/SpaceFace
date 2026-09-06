import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';

function bootTow() {
  const sim = createSimulation({
    seed: 14301,
    systems: [physics, combat, npcJobsRuntime],
    updateOrder: [npcJobsRuntime, physics, combat],
  });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tow_test';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';

  const tug = sim.spawn({
    type: 'ship',
    team: 2,
    pos: { x: 0, z: 0 },
    vel: { x: 20, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    collides: true,
    hull: 100,
    hullMax: 100,
    data: {
      worldRecordId: 'sector:tow:test-tug',
      sectorId: 'sector_tow_test',
      trafficRole: 'tug',
      ai: { passive: true, roe: 'hold_fire' },
      cargoManifest: {
        schemaId: 'spaceface.freightCausality.v1',
        lines: [{ commodityId: 'cmdty_scrap_metal', qty: 4 }],
        totalQty: 4,
      },
      intent: null,
    },
  });
  const load = sim.spawn({
    type: 'payload',
    pos: { x: -30, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 4,
    mass: 80,
    collides: true,
    hull: 10,
    hullMax: 10,
    data: {
      sectorId: 'sector_tow_test',
      towable: true,
      salvagePool: { cmdty_scrap_metal: 3 },
    },
  });
  tug.data.towTargetId = load.id;
  const jobId = helpers.npcJobs.assign(tug, {
    kind: 'hauler',
    sectorId: 'sector_tow_test',
    speed: 20,
    commissionS: 0.05,
    loadS: 0.05,
    departS: 0.5,
    approachS: 0.05,
    unloadS: 0.05,
    route: [
      { id: 'tow:origin', pos: { x: 0, z: 0 } },
      { id: 'tow:destination', pos: { x: 100, z: 0 } },
    ],
    payload: { manifest: tug.data.cargoManifest, towTargetId: load.id },
  });
  assert.ok(jobId);
  return { sim, state, tug, load, jobId, physics: sim.registry.get('physics') };
}

function disposeTow(harness) {
  if (harness.physics && typeof harness.physics._disableSg02DynamicAuthority === 'function') {
    harness.physics._disableSg02DynamicAuthority();
  }
  harness.sim.dispose();
}

test('a tug binds finite freight to an existing payload through the live Rapier attachment', async () => {
  const harness = bootTow();
  const { sim, state, tug, load, jobId, physics: physicsSystem } = harness;
  try {
    assert.equal(await physicsSystem.prepareBackend(state), true,
      'the towing proof uses the prepared production dynamic-body owner');
    const start = { x: load.pos.x, z: load.pos.z };
    let attachmentId = null;
    let maxLoadStep = 0;
    let previous = { x: load.pos.x, z: load.pos.z };
    for (let tick = 0; tick < 120; tick += 1) {
      sim.step(SIM_DT);
      const entry = state.npcJobs.byId[jobId];
      if (entry && entry.towAttachmentId) attachmentId = entry.towAttachmentId;
      maxLoadStep = Math.max(maxLoadStep, Math.hypot(
        load.pos.x - previous.x,
        load.pos.z - previous.z,
      ));
      previous = { x: load.pos.x, z: load.pos.z };
      if (attachmentId) break;
    }
    assert.ok(attachmentId, 'the post-load tug phase creates a physical tow attachment');
    const attachment = state.combat.attachments.byId[attachmentId];
    assert.equal(attachment.ownerId, tug.id);
    assert.equal(attachment.targetId, load.id);
    assert.equal(attachment.controlMode, 'npc_tow');
    assert.ok(state.physicsRuntime.diagnostics.sg02Attachments > 0,
      'the SG-02 owner reports the live constraint');

    const cargoBefore = tug.data.cargoManifest.totalQty;
    for (let tick = 0; tick < 60; tick += 1) {
      sim.step(SIM_DT);
      maxLoadStep = Math.max(maxLoadStep, Math.hypot(
        load.pos.x - previous.x,
        load.pos.z - previous.z,
      ));
      previous = { x: load.pos.x, z: load.pos.z };
    }
    assert.ok(load.pos.x > start.x + 1,
      `the attached load moves under the physics constraint (${start.x} -> ${load.pos.x})`);
    assert.ok(maxLoadStep < 2, `the load follows through fixed physics steps (${maxLoadStep})`);
    assert.equal(tug.data.cargoManifest.totalQty, cargoBefore,
      'the tug carries the finite manifest without a second cargo writer');

    for (let tick = 0; tick < 480 && state.npcJobs.byId[jobId]; tick += 1) sim.step(SIM_DT);
    assert.equal(state.npcJobs.byId[jobId], undefined, 'delivery completes the finite hauler job');
    assert.equal(state.combat.attachments.byId[attachmentId].state, 'broken',
      'job completion cuts the physical tow');
    assert.equal(state.physicsRuntime.diagnostics.sg02Attachments, 0,
      'the dynamic owner has no orphaned tow joint after delivery');
    assert.equal(load.data.npcTowedByJobId, undefined, 'delivery clears the target ownership marker');
    assert.equal(tug.data.npcTowAttachmentId, undefined, 'delivery clears the tug attachment marker');
  } finally {
    disposeTow(harness);
  }
});

test('a destroyed tow target cuts the attachment and leaves the tug job finite', async () => {
  const harness = bootTow();
  const { sim, state, tug, load, jobId, physics: physicsSystem } = harness;
  try {
    assert.equal(await physicsSystem.prepareBackend(state), true);
    let attachmentId = null;
    for (let tick = 0; tick < 120 && !attachmentId; tick += 1) {
      sim.step(SIM_DT);
      attachmentId = state.npcJobs.byId[jobId]?.towAttachmentId || null;
    }
    assert.ok(attachmentId);
    load.alive = false;
    sim.bus.emit('entity:destroyed', { id: load.id, reason: 'test_target_despawn' });
    assert.equal(state.combat.attachments.byId[attachmentId].state, 'broken');
    assert.equal(state.npcJobs.byId[jobId]?.towAttachmentId, null,
      'target loss clears the runtime sidecar without deleting the finite tug job');
    assert.equal(tug.data.npcTowAttachmentId, undefined);
    assert.equal(load.data.npcTowedByJobId, undefined);
  } finally {
    disposeTow(harness);
  }
});

// Measured on the live Ceres route (seed 47, 2026-09-06): every loose "wreck" standing in that
// pocket is a `world_site_*` collision proxy or component owned by worldSiteKernel, nineteen of
// them, at mass 1e9. Both towable gates must refuse those bodies. Without this, the runtime's
// 390 WU fallback scan would bind an authored place to a tug and draw a line to something that
// cannot move — the decorative tow the packet forbids — while reporting a site as loose salvage.
test('an authored world-site body and a pinned mass are never towable', async () => {
  const harness = bootTow();
  const { sim, state, tug, load, jobId, physics: physicsSystem } = harness;
  try {
    assert.equal(await physicsSystem.prepareBackend(state), true);

    // The tug's own explicit target is now an authored site component.
    load.data.worldSiteId = 'site_ceres_works';
    load.data.worldObjectId = 'obj_ceres_works_frame';
    for (let tick = 0; tick < 240; tick += 1) sim.step(SIM_DT);
    assert.equal(state.npcJobs.byId[jobId]?.towAttachmentId ?? null, null,
      'an authored world-site body is never bound to a tow');

    // Same body, no site markers, but pinned scenery mass.
    delete load.data.worldSiteId;
    delete load.data.worldObjectId;
    load.mass = 1e9;
    for (let tick = 0; tick < 240 && state.npcJobs.byId[jobId]; tick += 1) sim.step(SIM_DT);
    assert.equal(state.npcJobs.byId[jobId]?.towAttachmentId ?? null, null,
      'a pinned-mass body is never bound to a tow');
  } finally {
    disposeTow(harness);
  }
});
