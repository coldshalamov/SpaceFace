import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import {
  COMET_ICE,
  CRYSTAL_RESONANCE,
  cometPassAt,
  resonanceTiming,
} from '../src/data/miningDepth.js';
import { SITE_MACHINE_BY_ID } from '../src/data/sites.js';
import { reduceTechProgression } from '../src/data/techProgression.js';
import { cargo } from '../src/systems/cargo.js';
import { generateDrillField } from '../src/systems/drill.js';
import { mining } from '../src/systems/mining.js';
import { contactProfile, machineCapability } from '../src/systems/siteProduction.js';
import { selectSurveyTarget } from '../src/systems/siteSurvey.js';
import { world } from '../src/systems/world.js';

function playerSpec(x = 0, z = 0) {
  return {
    type: 'ship', team: 0, collides: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 7, mass: 28, hull: 300, hullMax: 300,
    flags: { docked: false },
    physicsBody: {
      schemaVersion: 1, radius: 7, mass: 28, inertiaY: 240,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: true } },
  };
}

function preparePlayer(sim, player) {
  const { state } = sim;
  state.playerId = player.id;
  state.player.miningBeam = player.data.miningBeam;
  state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 1000, capMass: 1000,
  };
  state.mode = 'flight';
  state.ui.docked = false;
  state.input.actions = {};
  return player;
}

function crystalSpec() {
  return {
    type: 'asteroid', collides: true,
    pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, hull: 10, hullMax: 10,
    data: {
      typeId: 'ast_crystalline', tierCap: 2,
      oreHP: 10, oreHPMax: 10, yieldU: 10,
      // Beam from the origin first contacts the negative-X face; make that authored seam explicit.
      seams: [{ localOffset: { x: -6, z: 0 } }],
    },
  };
}

test('the recurring Ceres window materializes one Rapier-dynamic comet, mines it, and Continue preserves its physical depletion', async () => {
  assert.equal(cometPassAt(42, 0).active, true);
  assert.equal(cometPassAt(42, COMET_ICE.activeS).active, false);
  assert.notEqual(cometPassAt(42, 0).passId, cometPassAt(42, COMET_ICE.cycleS).passId);

  const news = [];
  const sim = createSimulation({ seed: 42, systems: [world, cargo, mining, physics] });
  try {
    sim.bus.on('news:publish', (payload) => news.push(payload));
    const owner = sim.registry.get('world');
    owner.newGame();
    const player = preparePlayer(sim, sim.spawn(playerSpec()));
    owner.enterSector(COMET_ICE.sectorId, { placePlayer: false });
    const comet = sim.state.entityList.find((entity) => entity.alive !== false && entity.data && entity.data.cometIce);
    assert.ok(comet, 'the active event exists as a mineable asteroid in the ordinary Ceres bag');
    assert.equal(comet.type, 'asteroid');
    assert.equal(comet.data.typeId, 'ast_icy');
    assert.equal(comet.physicsBody.dynamic, true);
    assert.ok(Math.hypot(comet.vel.x, comet.vel.z) > 0, 'the event body has real drift velocity');
    assert.equal(news.filter((item) => item.passId === comet.data.cometPassId).length, 1,
      'the news trace names the exact physical pass once');

    const physicsOwner = sim.registry.get('physics');
    assert.equal(await physicsOwner.prepareBackend(sim.state, { reset: true }), true);
    const x0 = comet.pos.x;
    const z0 = comet.pos.z;
    sim.runTicks(60);
    assert.ok(Math.hypot(comet.pos.x - x0, comet.pos.z - z0) > 2.5,
      'Rapier, not world, advances the comet along its live velocity');

    const speed = Math.hypot(comet.vel.x, comet.vel.z) || 1;
    player.pos.x = comet.pos.x - (comet.vel.x / speed) * 42;
    player.pos.z = comet.pos.z - (comet.vel.z / speed) * 42;
    player.vel.x = comet.vel.x;
    player.vel.z = comet.vel.z;
    sim.state.input.aimAngle = Math.atan2(comet.pos.z - player.pos.z, comet.pos.x - player.pos.x);
    sim.state.input.aimWorld = { x: comet.pos.x, z: comet.pos.z };
    sim.state.input.fireGroup = 2;
    const hpBefore = comet.data.oreHP;
    for (let tick = 0; tick < 30 && comet.data.oreHP === hpBefore; tick++) sim.step(SIM_DT);
    assert.ok(comet.data.oreHP < hpBefore, 'the default player beam removes real comet ore-HP');
    const savedHp = comet.data.oreHP;
    const savedWorld = structuredClone(owner.serialize());
    const savedTime = sim.state.simTime;

    const after = createSimulation({ seed: 42, systems: [world] });
    try {
      const afterOwner = after.registry.get('world');
      afterOwner.newGame();
      preparePlayer(after, after.spawn(playerSpec()));
      after.state.simTime = savedTime;
      afterOwner.deserialize(savedWorld);
      afterOwner.enterSector(COMET_ICE.sectorId, { placePlayer: false });
      const restored = after.state.entityList.find((entity) => entity.alive !== false && entity.data && entity.data.cometIce);
      assert.ok(restored, 'Continue re-materializes the still-open pass');
      assert.equal(restored.data.cometPassId, comet.data.cometPassId);
      assert.equal(restored.data.oreHP, savedHp, 'Continue cannot refill partially mined comet ice');
      assert.equal(restored.physicsBody.dynamic, true);
    } finally {
      after.dispose();
    }
  } finally {
    sim.dispose();
  }
});

test('a positive perfect crystal strike emits the production event consumed by the Industry feat', () => {
  const sim = createSimulation({ seed: 0x4242, systems: [cargo, mining] });
  try {
    const player = preparePlayer(sim, sim.spawn(playerSpec()));
    const crystal = sim.spawn(crystalSpec());
    const timing = resonanceTiming(sim.state.meta.seed, crystal.id, 0);
    sim.state.simTime = timing.phaseOffset + CRYSTAL_RESONANCE.periodS * 4 - SIM_DT;
    sim.state.input.aimAngle = 0;
    sim.state.input.aimWorld = { x: crystal.pos.x, z: crystal.pos.z };
    sim.state.input.fireGroup = 2;
    let resolved = null;
    let vfx = null;
    sim.bus.on('mining:resonanceResolved', (payload) => { resolved = payload; });
    sim.bus.on('presentation:vfxCue', (payload) => {
      if (payload.id === 'mining.resonance.perfect') vfx = payload;
    });
    sim.step(SIM_DT);
    assert.ok(crystal.data.oreHP < crystal.data.oreHPMax, 'the event follows positive physical mining work');
    assert.equal(resolved.grade, 'perfect');
    assert.equal(resolved.minerId, player.id);
    assert.equal(resolved.asteroidId, crystal.id);
    assert.ok(vfx && vfx.particles > 0, 'the same strike has a live visual timing receipt');

    const reduced = reduceTechProgression(undefined, 'mining:resonanceResolved', resolved, {
      playerId: player.id,
      tick: sim.state.tick,
    });
    assert.ok(reduced.progression.feats.feat_perfect_resonance,
      'Plan46 no longer depends on a fabricated or missing producer');
  } finally {
    sim.dispose();
  }
});

test('an off-beat crystal cut physically shatters into low-value silicate instead of relabeling full crystal yield', () => {
  const sim = createSimulation({ seed: 0x4243, systems: [cargo, mining] });
  try {
    preparePlayer(sim, sim.spawn(playerSpec()));
    const crystal = sim.spawn(crystalSpec());
    const timing = resonanceTiming(sim.state.meta.seed, crystal.id, 0);
    sim.state.simTime = timing.phaseOffset + CRYSTAL_RESONANCE.periodS * 4
      + CRYSTAL_RESONANCE.periodS * 0.5 - SIM_DT;
    sim.state.input.aimAngle = 0;
    sim.state.input.aimWorld = { x: crystal.pos.x, z: crystal.pos.z };
    sim.state.input.fireGroup = 2;
    let resolved = null;
    sim.bus.on('mining:resonanceResolved', (payload) => { resolved = payload; });
    for (let tick = 0; tick < 90 && crystal.alive !== false; tick++) sim.step(SIM_DT);
    assert.equal(resolved.grade, 'miss');
    assert.equal(crystal.alive, false, 'the badly timed beam still spends the finite rock');
    assert.ok((sim.state.player.cargo.items.cmdty_silicate || 0) > 0, 'the shattered fraction is real cargo');
    assert.equal(sim.state.player.cargo.items.cmdty_crystal_silica || 0, 0);
    assert.equal(sim.state.player.cargo.items.cmdty_crystal_lumin || 0, 0);
  } finally {
    sim.dispose();
  }
});

test('the selected prospect formation remains the material read by the real extractor capability', () => {
  const cols = 28;
  const rows = 45;
  const field = generateDrillField(42);
  const target = selectSurveyTarget(field, cols, rows);
  assert.ok(target && target.material.startsWith('vein:'), 'the real prospect selector finds a discrete vein');
  const targetSet = new Set(target.cells);
  const anchor = target.cells[0];
  const col = anchor % cols;
  const row = Math.floor(anchor / cols);
  const neighbors = [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]];
  const access = neighbors.find(([c, r]) => c >= 0 && c < cols && r >= 0 && r < rows && !targetSet.has(r * cols + c));
  assert.ok(access, 'the assayed formation exposes an adjacent machine access cell');
  field[access[0]][access[1]] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false };
  const profile = contactProfile(field, access[0], access[1], cols, rows);
  const capability = machineCapability(SITE_MACHINE_BY_ID.get('sm_extractor'), profile);
  const oreId = target.material.slice('vein:'.length);
  assert.ok((capability.outputsPerMin[oreId] || 0) > 0,
    'placing the claimed extractor beside the prospect pays that exact vein commodity');
  assert.equal(capability.usesGeology, true);
  assert.equal(capability.geologyLive, true);
});
