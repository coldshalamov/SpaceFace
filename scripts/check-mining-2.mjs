#!/usr/bin/env node

import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import {
  MAGNET_ACCEL,
  MAGNET_RANGE,
  SEAM_YIELD_OFF,
  mining,
} from '../src/systems/mining.js';
import { world } from '../src/systems/world.js';

const TAU = Math.PI * 2;

function boot(seed = 2202) {
  const sim = createSimulation({ seed, systems: [mining, cargo] });
  const { state } = sim;
  state.mode = 'flight';
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  state.player.magnetRange = 250;
  state.player.miningBeam = {
    tierId: 'beam_mk1',
    dps: 30,
    range: 320,
    heat: 0,
    heatRate: 12,
    coolRate: 20,
    overheated: false,
    directToCargo: false,
  };
  const player = sim.spawn({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {},
  });
  state.playerId = player.id;
  return { sim, state, player, miningSys: sim.registry.get('mining') };
}

function spawnAsteroid(sim, spec = {}) {
  const radius = spec.radius || 20;
  const hp = spec.hp || 100;
  return sim.spawn({
    type: 'asteroid',
    pos: spec.pos || { x: 160, z: 0 },
    radius,
    mass: 600,
    hull: hp,
    hullMax: hp,
    collides: true,
    data: {
      typeId: 'ast_common_rock',
      tier: 0,
      tierCap: 0,
      oreHP: hp,
      oreHPMax: hp,
      yieldU: spec.yieldU || 8,
      pctEjected: 0,
      seams: spec.seams,
      isChunk: spec.isChunk,
    },
  });
}

function resetAsteroid(ast, hp = 100) {
  ast.alive = true;
  ast.hull = hp;
  ast.hullMax = hp;
  ast.data.oreHP = hp;
  ast.data.oreHPMax = hp;
  ast.data.pctEjected = 0;
  ast.data._oreCarry = 0;
}

function setPlayerForContact(state, player, ast, angle, distance = 180) {
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  player.pos.x = ast.pos.x + ux * distance;
  player.pos.z = ast.pos.z + uz * distance;
  state.input.aimAngle = Math.atan2(ast.pos.z - player.pos.z, ast.pos.x - player.pos.x);
  state.input.aimWorld = { x: ast.pos.x, z: ast.pos.z };
}

function seamWorldPoint(ast, seam) {
  const local = seam.localOffset || { x: Math.cos(seam.angle) * (seam.offset || 0), z: Math.sin(seam.angle) * (seam.offset || 0) };
  const rot = ast.rot || 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    x: ast.pos.x + local.x * c - local.z * s,
    z: ast.pos.z + local.x * s + local.z * c,
  };
}

function findOffSeamContactAngle(ast) {
  const seams = ast.data.seams.map((seam) => seamWorldPoint(ast, seam));
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * TAU;
    const px = ast.pos.x + Math.cos(angle) * ast.radius;
    const pz = ast.pos.z + Math.sin(angle) * ast.radius;
    const minDist = Math.min(...seams.map((p) => Math.hypot(px - p.x, pz - p.z)));
    if (minDist > 16) return angle;
  }
  throw new Error('could not find off-seam contact angle');
}

function checkSeamYield() {
  const { sim, state, player, miningSys } = boot(2202);
  assert.equal(SEAM_YIELD_OFF, 0.35, 'off-seam yield multiplier should match the WS-C1 contract');
  const seamEvents = [];
  sim.bus.on('mining:seamHit', (p) => seamEvents.push(p));
  const ast = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 20 });
  const seams = miningSys._ensureAsteroidSeams(ast);
  assert(seams.length >= 1 && seams.length <= 4, 'seeded asteroid should derive 1-4 seams');

  const seamPoint = seamWorldPoint(ast, seams[0]);
  const seamAngle = Math.atan2(seamPoint.z - ast.pos.z, seamPoint.x - ast.pos.x);
  setPlayerForContact(state, player, ast, seamAngle);
  miningSys.applyMining(ast.id, 20, 1, player.id);
  const onSeamLoss = 100 - ast.data.oreHP;
  assert(seamEvents.some((e) => e.asteroidId === ast.id), 'on-seam mining should emit mining:seamHit');

  resetAsteroid(ast, 100);
  setPlayerForContact(state, player, ast, findOffSeamContactAngle(ast));
  miningSys.applyMining(ast.id, 20, 1, player.id);
  const offSeamLoss = 100 - ast.data.oreHP;
  assert(onSeamLoss > offSeamLoss, `seam loss ${onSeamLoss} should exceed off-seam loss ${offSeamLoss}`);
  assert(Math.abs(offSeamLoss - onSeamLoss * SEAM_YIELD_OFF) < 0.001,
    'off-seam extraction should be 35% of on-seam extraction');
}

function checkWorldSpawnSeams() {
  const sim = createSimulation({ seed: 6606, systems: [world] });
  const spawned = sim.registry.get('world')._spawnAsteroid(
    { id: 'check_field', type: 'ast_common_rock' },
    { tierCap: 0, respawnSec: 90 },
    { x: 0, z: 0 },
    1,
    sim.state.rng,
  );
  assert(spawned.data.seams.length >= 1 && spawned.data.seams.length <= 4,
    'world asteroid spawn should attach 1-4 deterministic seams');
}

function checkVentBonus() {
  const { sim, state, player } = boot(3303);
  const ventEvents = [];
  sim.bus.on('mining:ventBonus', () => ventEvents.push(state.simTime));
  const ast = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 20 });
  state.player.miningBeam.heat = 74;
  setPlayerForContact(state, player, ast, Math.PI);
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  state.input.fireGroup = null;
  sim.step(SIM_DT);
  assert.equal(ventEvents.length, 1, 'releasing in the 70-95 heat band should emit mining:ventBonus once');
  assert(state.player.mining && state.player.mining.ventBonusUntil > state.simTime,
    'vent bonus should stay active after release');
}

function checkFractureAndVacuumCargo() {
  const { sim, state, player, miningSys } = boot(4404);
  assert.equal(MAGNET_RANGE, 420, 'Mining 2.0 magnet range should be 420 wu');
  assert.equal(MAGNET_ACCEL, 520, 'Mining 2.0 magnet accel should be 520 wu/s^2');
  const chunkEvents = [];
  sim.bus.on('asteroid:chunked', (p) => chunkEvents.push(p));

  const seams = [
    { angle: 0, localOffset: { x: 10, z: 0 } },
    { angle: 1.8, localOffset: { x: -4.544042, z: 9.33892 } },
    { angle: 3.4, localOffset: { x: -9.667981, z: -2.555411 } },
  ];
  const parent = spawnAsteroid(sim, {
    radius: 20,
    hp: 3,
    yieldU: 6,
    pos: { x: 160, z: 0 },
    seams,
  });
  state.player.miningBeam.dps = 600;
  state.player.miningBeam.range = 340;
  state.player.miningBeam.directToCargo = false;
  setPlayerForContact(state, player, parent, Math.PI);
  const beforePos = { x: player.pos.x, z: player.pos.z };
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  state.input.fireGroup = null;

  const chunks = state.entityList.filter((e) => e.type === 'asteroid' && e.data && e.data.isChunk);
  assert(chunks.length >= 2 && chunks.length <= 3, `fracture should spawn 2-3 chunks, got ${chunks.length}`);
  assert.equal(chunkEvents.length, chunks.length, 'each chunk should emit asteroid:chunked');
  for (const chunk of chunks) {
    assert(chunk.radius >= parent.radius * 0.35 - 1e-6, 'chunk radius should be at least 35% of parent');
    assert(chunk.radius <= parent.radius * 0.5 + 1e-6, 'chunk radius should be at most 50% of parent');
    assert.equal(chunk.data.seams.length, seams.length - 1, 'chunks should inherit parent seam count minus one');
  }
  assert.deepEqual({ x: player.pos.x, z: player.pos.z }, beforePos,
    'pickup collection should not require player movement');
  assert(state.player.cargo.usedVolume > 0, 'beam-line ore pickups should reach cargo');

  const beforeChunkTotal = state.entityList.filter((e) => e.type === 'asteroid' && e.data && e.data.isChunk).length;
  miningSys.applyMining(chunks[0].id, 1000, 1, player.id);
  const afterChunkTotal = state.entityList.filter((e) => e.type === 'asteroid' && e.data && e.data.isChunk).length;
  assert.equal(afterChunkTotal, beforeChunkTotal, 'chunks should not fracture recursively');
}

function checkMiningNoiseCrossing() {
  const { sim, state } = boot(5505);
  const dangerEvents = [];
  sim.bus.on('danger:miningNoise', (p) => dangerEvents.push(p));
  state.player.miningNoise = 69;
  sim.registry.get('mining')._updateMiningNoise(true, 0.25, state);
  sim.registry.get('mining')._updateMiningNoise(true, 0.25, state);
  assert.equal(dangerEvents.length, 1, 'mining noise should emit once when crossing above 70');
  assert(dangerEvents[0].level > 70, 'danger:miningNoise should include the crossed level');
}

checkWorldSpawnSeams();
checkSeamYield();
checkVentBonus();
checkFractureAndVacuumCargo();
checkMiningNoiseCrossing();

console.log('Mining 2.0 core checks OK');
