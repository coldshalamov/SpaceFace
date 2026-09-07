// PQ-029.03 — NPCs use the heads.
//
// Tugs couple, salvage cutters tractor, scrap sweepers whip, and a patrol nets a raider with
// the same whip snap the player can buy. Proof is the snapshotted tetherPolicy.headId on the
// live npc_tow line. Range stays untouched; no headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import npcJobsRuntime from '../src/systems/npcJobsRuntime.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SECTOR = 'sector_heads_test';

function boot() {
  const sim = createSimulation({
    seed: 2903,
    systems: [physics, combat, npcJobsRuntime],
    updateOrder: [npcJobsRuntime, physics, combat],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  return sim;
}

async function waitForHead(sim, jobId, headId, ticks = 240) {
  const { state, registry } = sim;
  const physicsSystem = registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(state), true);
  let attachmentId = null;
  for (let tick = 0; tick < ticks; tick += 1) {
    sim.step(SIM_DT);
    const entry = state.npcJobs.byId[jobId];
    if (entry && entry.towAttachmentId) {
      attachmentId = entry.towAttachmentId;
      break;
    }
  }
  assert.ok(attachmentId, `expected an npc line with head ${headId}`);
  const attachment = state.combat.attachments.byId[attachmentId];
  assert.equal(attachment.controlMode, 'npc_tow');
  assert.equal(attachment.tetherPolicy && attachment.tetherPolicy.headId, headId);
  return { attachment, physicsSystem };
}

function dispose(sim) {
  const physicsSystem = sim.registry.get('physics');
  if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
    physicsSystem._disableSg02DynamicAuthority();
  }
  sim.dispose();
}

test('a yard tug snapshots the frame coupler hitch on its tow', async () => {
  const sim = boot();
  try {
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
        worldRecordId: 'sector:heads:tug',
        sectorId: SECTOR,
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
        sectorId: SECTOR,
        towable: true,
        salvagePool: { cmdty_scrap_metal: 3 },
      },
    });
    tug.data.towTargetId = load.id;
    const jobId = sim.helpers.npcJobs.assign(tug, {
      kind: 'hauler',
      sectorId: SECTOR,
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
      payload: { manifest: tug.data.cargoManifest, towTargetId: load.id, freightRole: 'tug' },
    });
    assert.ok(jobId);
    const { attachment } = await waitForHead(sim, jobId, 'frame_coupler');
    assert.equal(attachment.ownerId, tug.id);
    assert.equal(attachment.targetId, load.id);
    assert.equal(attachment.tetherPolicy.spring.mode, 'frame_coupler');
  } finally {
    dispose(sim);
  }
});

test('a salvage cutter snapshots the tractor head on a live wreck', async () => {
  const sim = boot();
  try {
    const salvor = sim.spawn({
      type: 'ship',
      team: 2,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 24,
      collides: true,
      hull: 100,
      hullMax: 100,
      data: {
        worldRecordId: 'sector:heads:salvor',
        sectorId: SECTOR,
        trafficRole: 'salvor',
        ai: { passive: true, roe: 'hold_fire' },
      },
    });
    const wreck = sim.spawn({
      type: 'wreck',
      pos: { x: 24, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 40,
      collides: true,
      hull: 20,
      hullMax: 20,
      data: {
        sectorId: SECTOR,
        salvagePool: { cmdty_scrap_metal: 8 },
      },
    });
    const jobId = sim.helpers.npcJobs.assign(salvor, {
      kind: 'salvor',
      sectorId: SECTOR,
      speed: 40,
      commissionS: 0.05,
      transitS: 0.05,
      approachS: 0.05,
      workS: 2,
      loadS: 0.05,
      unloadS: 0.05,
      route: [
        { id: 'salvage:home', pos: { x: -80, z: 0 } },
        { id: 'salvage:wreck', pos: { x: 24, z: 0 } },
      ],
      payload: { targetId: wreck.id, targetType: 'wreck' },
    });
    assert.ok(jobId);
    const { attachment } = await waitForHead(sim, jobId, 'tractor');
    assert.equal(attachment.ownerId, salvor.id);
    assert.equal(attachment.targetId, wreck.id);
    assert.equal(attachment.tetherPolicy.spring.K, 110);
  } finally {
    dispose(sim);
  }
});

test('a scrap sweeper snapshots the elastic whip on loose debris', async () => {
  const sim = boot();
  try {
    const sweeper = sim.spawn({
      type: 'ship',
      team: 2,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 22,
      collides: true,
      hull: 100,
      hullMax: 100,
      data: {
        worldRecordId: 'sector:heads:sweeper',
        sectorId: SECTOR,
        trafficRole: 'sweeper',
        ai: { passive: true, roe: 'hold_fire' },
      },
    });
    const scrap = sim.spawn({
      type: 'payload',
      pos: { x: 22, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 4,
      mass: 12,
      collides: true,
      hull: 8,
      hullMax: 8,
      data: {
        sectorId: SECTOR,
        towable: true,
        salvagePool: { cmdty_scrap_metal: 2 },
      },
    });
    sweeper.data.towTargetId = scrap.id;
    const jobId = sim.helpers.npcJobs.assign(sweeper, {
      kind: 'miner',
      sectorId: SECTOR,
      speed: 28,
      commissionS: 0.05,
      approachS: 0.05,
      workS: 2,
      unloadS: 0.05,
      route: [
        { id: 'sweep:home', pos: { x: 0, z: 0 } },
        { id: 'sweep:scrap', pos: { x: 22, z: 0 } },
      ],
      payload: { towTargetId: scrap.id },
    });
    assert.ok(jobId);
    const { attachment } = await waitForHead(sim, jobId, 'elastic_whip', 360);
    assert.equal(attachment.ownerId, sweeper.id);
    assert.equal(attachment.targetId, scrap.id);
    assert.equal(attachment.tetherPolicy.spring.zeta, 0.28);
  } finally {
    dispose(sim);
  }
});

test('a patrol nets a raider with the elastic whip', async () => {
  const sim = boot();
  try {
    const patrol = sim.spawn({
      type: 'ship',
      team: 2,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 7,
      mass: 16,
      collides: true,
      hull: 100,
      hullMax: 100,
      data: {
        worldRecordId: 'sector:heads:patrol',
        sectorId: SECTOR,
        trafficRole: 'patrol',
        ai: { passive: true, roe: 'hold_fire' },
      },
    });
    const raider = sim.spawn({
      type: 'ship',
      team: 2,
      pos: { x: 28, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 14,
      collides: true,
      hull: 80,
      hullMax: 80,
      data: {
        sectorId: SECTOR,
        trafficRole: 'pirate',
        ai: { pirate: true, passive: true, roe: 'hold_fire' },
      },
    });
    const jobId = sim.helpers.npcJobs.assign(patrol, {
      kind: 'patrol',
      sectorId: SECTOR,
      speed: 44,
      commissionS: 0.05,
      transitS: 0.05,
      approachS: 0.05,
      dwellS: 2,
      route: [
        { id: 'beat:0', pos: { x: 0, z: 0 } },
        { id: 'beat:1', pos: { x: 12, z: 0 } },
      ],
    });
    assert.ok(jobId);
    const { attachment } = await waitForHead(sim, jobId, 'elastic_whip', 360);
    assert.equal(attachment.ownerId, patrol.id);
    assert.equal(attachment.targetId, raider.id);
  } finally {
    dispose(sim);
  }
});
