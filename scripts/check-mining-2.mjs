#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import {
  BEAM_OVERHEAT_RESET,
  BEAM_VENT_BAND_LO,
  BULK_HAUL_MIN_U,
  MAGNET_ACCEL,
  MAGNET_RANGE,
  SEAM_SPEED_OFF,
  SEAM_YIELD_OFF,
  bulkHaulPayoutForChunk,
  mining,
} from '../src/systems/mining.js';
import { ASTEROIDS, ORES } from '../src/data/mining.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

// Seams pay ORE, not just time. The constant has always been NAMED a yield fraction; it used to be
// applied to extraction speed, which cancelled out of the per-rock total and made aim cost nothing
// the player could observe (PHYSICAL_PLAY_GRAMMAR §9.5.3). Both halves are asserted behaviourally:
// the rock breaks slightly slower off-seam, and — the part that matters — the SAME rock pays a
// fraction of the ore when you spray it.
function checkSeamYield() {
  const { sim, state, player, miningSys } = boot(2202);
  const seamEvents = [];
  sim.bus.on('mining:seamHit', (p) => seamEvents.push(p));
  const ast = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 20 });
  const seams = miningSys._ensureAsteroidSeams(ast);
  assert(seams.length >= 1 && seams.length <= 4, 'seeded asteroid should derive 1-4 seams');

  const seamPoint = seamWorldPoint(ast, seams[0]);
  const seamAngle = Math.atan2(seamPoint.z - ast.pos.z, seamPoint.x - ast.pos.x);
  const offSeamAngle = findOffSeamContactAngle(ast);

  setPlayerForContact(state, player, ast, seamAngle);
  miningSys.applyMining(ast.id, 20, 1, player.id);
  const onSeamLoss = 100 - ast.data.oreHP;
  assert(seamEvents.some((e) => e.asteroidId === ast.id), 'on-seam mining should emit mining:seamHit');

  resetAsteroid(ast, 100);
  setPlayerForContact(state, player, ast, offSeamAngle);
  miningSys.applyMining(ast.id, 20, 1, player.id);
  const offSeamLoss = 100 - ast.data.oreHP;
  assert(onSeamLoss > offSeamLoss, `seam loss ${onSeamLoss} should exceed off-seam loss ${offSeamLoss}`);
  assert(Math.abs(offSeamLoss - onSeamLoss * SEAM_SPEED_OFF) < 0.001,
    `off-seam extraction speed should be ${SEAM_SPEED_OFF} of on-seam (got ${offSeamLoss / onSeamLoss})`);

  // Burn one identical rock entirely on-seam and one entirely off-seam, counting the ore each pays.
  const oreFromFullBurn = (angle) => {
    resetAsteroid(ast, 100);
    setPlayerForContact(state, player, ast, angle);
    let total = 0;
    const off = sim.bus.on('mining:yield', (p) => { total += p.qty || 0; });
    for (let i = 0; i < 400 && ast.data.oreHP > 0; i++) miningSys.applyMining(ast.id, 20, 0.05, player.id);
    if (typeof off === 'function') off();
    return total;
  };
  const onSeamOre = oreFromFullBurn(seamAngle);
  const offSeamOre = oreFromFullBurn(offSeamAngle);
  assert.equal(onSeamOre, 20, `a rock burned wholly on-seam pays its full yieldU (got ${onSeamOre})`);
  assert(offSeamOre < onSeamOre,
    `spraying the same rock must cost ore, not only time (${offSeamOre} vs ${onSeamOre})`);
  const ratio = offSeamOre / onSeamOre;
  assert(Math.abs(ratio - SEAM_YIELD_OFF) <= 0.06,
    `off-seam yield should land near SEAM_YIELD_OFF=${SEAM_YIELD_OFF} (got ${ratio.toFixed(3)})`);
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

// ── the heat/vent rhythm ──────────────────────────────────────────────────────────────────────
// This used to be a check that the rhythm STAYED deleted (_beamRuntime unconditionally deleted
// heat/heatRate/coolRate/overheated/heatMax every tick) while cueRecipes still declared
// mining.heat.overheated / mining.vent.ready and audioSystem still shipped sfx_vent_chime.
// PHYSICAL_PLAY_GRAMMAR §9.5.2 amputation 1 is the design authority: heat rises with sustained
// beam, releasing in the amber band pays real ore, overheat locks. These assertions drive the live
// system through sim.step and assert the OUTCOME, so retuning the constants cannot fail them —
// only removing the mechanic can.

function mineForTicks(sim, state, ticks, holdFire) {
  for (let i = 0; i < ticks; i++) {
    state.input.fireGroup = holdFire(i) ? 2 : null;
    sim.step(SIM_DT);
  }
}

function checkBeamHeatLocksOutAndRecovers() {
  const { sim, state, player } = boot(3303);
  const overheats = [];
  const cooled = [];
  const ventReady = [];
  sim.bus.on('mining:overheated', (p) => overheats.push(p));
  sim.bus.on('mining:beamCooled', (p) => cooled.push(p));
  sim.bus.on('mining:ventReady', (p) => ventReady.push(p));
  const ast = spawnAsteroid(sim, { radius: 20, hp: 100000, yieldU: 20000 });
  setPlayerForContact(state, player, ast, Math.PI);

  const beam = state.player.miningBeam;
  let ticks = 0;
  while (!beam.overheated && ticks < 1200) { mineForTicks(sim, state, 1, () => true); ticks++; }
  assert(Number.isFinite(beam.heat), 'the beam runtime must carry heat again');
  assert.equal(beam.overheated, true, 'holding the beam to the peg must lock it out');
  assert.equal(overheats.length, 1, 'the lockout announces itself exactly once per peg');
  assert.equal(ventReady.length >= 1, true, 'the amber vent band must announce itself before the peg');
  assert(ventReady[0].pct >= BEAM_VENT_BAND_LO - 1e-6, 'ventReady fires at the band edge, not before');
  assert(ticks * SIM_DT > 1.5 && ticks * SIM_DT < 12,
    `cold-to-peg must be a seconds-scale beat, not a wait (${(ticks * SIM_DT).toFixed(2)}s)`);

  // While locked, the rock takes no further damage no matter how hard the trigger is held.
  const lockedAt = state.entities.get(ast.id).data.oreHP;
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  assert.equal(state.entities.get(ast.id).data.oreHP, lockedAt,
    'an overheated beam must not extract — the lockout has to cost something');

  // Release and let the radiators catch up; the beam comes back on its own.
  mineForTicks(sim, state, 600, () => false);
  assert.equal(cooled.length >= 1, true, 'the beam must unlock once heat falls back');
  assert.equal(beam.overheated, false, 'overheat clears after cooling');
  assert(beam.heat / beam.heatMax <= BEAM_OVERHEAT_RESET + 1e-6, 'unlock happens at the reset band');
  const before = state.entities.get(ast.id).data.oreHP;
  mineForTicks(sim, state, 20, () => true);
  assert(state.entities.get(ast.id).data.oreHP < before, 'a cooled beam mines again');
}

function checkVentBonusPaysRealOre() {
  const { sim, state, player } = boot(3304);
  state.player.cargo.capVolume = 100000;
  const bonuses = [];
  sim.bus.on('mining:ventBonus', (p) => bonuses.push(p));
  const ast = spawnAsteroid(sim, { radius: 20, hp: 100000, yieldU: 20000 });
  setPlayerForContact(state, player, ast, Math.PI);

  const beam = state.player.miningBeam;
  // Hold until the gauge is deep in the amber band, then let go — that is the whole verb.
  let held = 0;
  while ((beam.heat || 0) / (beam.heatMax || 100) < 0.95 && held < 2000) {
    state.input.fireGroup = 2;
    sim.step(SIM_DT);
    held++;
  }
  const heldOre = state.player.cargo.usedVolume;
  state.input.fireGroup = null;
  sim.step(SIM_DT);

  assert.equal(bonuses.length, 1, 'releasing inside the amber band pays exactly one vent bonus');
  assert(bonuses[0].qty > 0, 'the vent bonus is real ore, not a zero-value receipt');
  assert(state.player.cargo.usedVolume > heldOre, 'the vent bonus reaches the hold');

  // Releasing while cold pays nothing — the bonus is for timing, not for tapping the button.
  bonuses.length = 0;
  mineForTicks(sim, state, 400, () => false); // fully cool
  mineForTicks(sim, state, 6, () => true);
  state.input.fireGroup = null;
  sim.step(SIM_DT);
  assert.equal(bonuses.length, 0, 'a cold release must not pay a vent bonus');
}

function checkPulsingOutEarnsPegging() {
  // The design claim under test: pulse-timing is worth learning. Two runs of identical length on
  // identical rocks — one venting inside the amber band, one holding the trigger down forever.
  const run = (seed, strategy) => {
    const { sim, state, player } = boot(seed);
    state.player.cargo.capVolume = 100000;
    const ast = spawnAsteroid(sim, { radius: 20, hp: 100000, yieldU: 20000 });
    setPlayerForContact(state, player, ast, Math.PI);
    const beam = state.player.miningBeam;
    let ore = 0;
    sim.bus.on('mining:yield', (p) => { ore += p.qty || 0; });
    for (let i = 0; i < 3000; i++) {
      const pct = (beam.heat || 0) / (beam.heatMax || 100);
      state.input.fireGroup = strategy(pct, beam) ? 2 : null;
      sim.step(SIM_DT);
    }
    return ore;
  };
  // Vent at ~93% of the gauge, resume once the radiators have caught up.
  let venting = false;
  const pulsed = run(4501, (pct, beam) => {
    if (pct >= 0.93) venting = true;
    if (venting && pct <= 0.25) venting = false;
    return !venting && !beam.overheated;
  });
  const pegged = run(4501, () => true);
  assert(pulsed > pegged * 1.2,
    `pulse-timing must clearly out-earn holding the button (${pulsed} vs ${pegged})`);
}

function checkMasslineTargetOwnsMiningBeam() {
  const { sim, state, player, miningSys } = boot(6607);
  const tethered = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 10, pos: { x: 140, z: 0 } });
  const aimed = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 10, pos: { x: 0, z: 110 } });
  state.input.aimAngle = Math.atan2(aimed.pos.z - player.pos.z, aimed.pos.x - player.pos.x);
  state.input.aimWorld = { x: aimed.pos.x, z: aimed.pos.z };
  state.combat = state.combat || {};
  state.combat.attachments = state.combat.attachments || { byId: {} };
  state.combat.attachments.byId = state.combat.attachments.byId || {};
  state.combat.attachments.byId.att_test_tether = {
    id: 'att_test_tether',
    defId: 'tether_standard',
    state: 'active',
    ownerId: player.id,
    targetId: tethered.id,
  };

  const picked = miningSys._acquireTarget(player, state.player.miningBeam.range, state);
  assert.equal(picked, tethered,
    'active massline asteroid should own the mining beam even when the reticle points at another rock');

  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  assert(tethered.data.oreHP < tethered.data.oreHPMax, 'mining tick should damage the tethered asteroid');
  assert.equal(aimed.data.oreHP, aimed.data.oreHPMax, 'mining tick should not damage the aimed non-tethered asteroid');
}

function checkFractureAndVacuumCargo() {
  const { sim, state, player, miningSys } = boot(4404);
  assert.equal(MAGNET_RANGE, 420, 'Mining 2.0 magnet range should be 420 wu');
  // f277c5e7 replaced the old absolute pull with velocity-relative homing. This value is the
  // controller's convergence authority, not the superseded raw acceleration target from C1.
  assert.equal(MAGNET_ACCEL, 900, 'Mining 2.0 homing convergence authority should be 900 wu/s^2');
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

function checkBeamTargetSticksUntilRelease() {
  const { sim, state, player, miningSys } = boot(7711);
  const first = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 10, pos: { x: 160, z: 0 } });
  const second = spawnAsteroid(sim, { radius: 20, hp: 100, yieldU: 10, pos: { x: 0, z: 110 } });
  setPlayerForContact(state, player, first, Math.PI);
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  assert(first.data.oreHP < first.data.oreHPMax, 'beam should damage the initially aimed asteroid');
  assert.equal(second.data.oreHP, second.data.oreHPMax, 'second asteroid should stay pristine on first tick');

  state.input.aimAngle = Math.atan2(second.pos.z - player.pos.z, second.pos.x - player.pos.x);
  state.input.aimWorld = { x: second.pos.x, z: second.pos.z };
  const hpFirst = first.data.oreHP;
  const hpSecond = second.data.oreHP;
  for (let i = 0; i < 30; i++) sim.step(SIM_DT);
  assert(first.data.oreHP < hpFirst, 'beam should keep mining the locked asteroid after aim moves');
  assert.equal(second.data.oreHP, hpSecond, 'beam should not retarget mid-hold when aim moves');

  state.input.fireGroup = null;
  sim.step(SIM_DT);
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  assert(second.data.oreHP < second.data.oreHPMax, 'releasing and refiring should acquire the newly aimed asteroid');
}

function checkMiningNoiseCrossing() {
  const { sim, state } = boot(5505);
  const dangerEvents = [];
  const impulses = [];
  sim.bus.on('danger:miningNoise', (p) => dangerEvents.push(p));
  sim.bus.on('sectorsim:impulse', (p) => impulses.push(p));
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.miningNoise = 69;
  sim.registry.get('mining')._updateMiningNoise(true, 0.25, state);
  sim.registry.get('mining')._updateMiningNoise(true, 0.25, state);
  assert.equal(dangerEvents.length, 1, 'mining noise should emit once when crossing above 70');
  assert(dangerEvents[0].level > 70, 'danger:miningNoise should include the crossed level');

  // The meter has to DO something. sectorSim folds this impulse into the sector's danger node, which
  // lowers effective regional security, which encounterDirector reads into combat pressure. Without
  // it the game tells the player loud mining is dangerous and then makes it free (grammar §9.5.2).
  assert.equal(impulses.length, 1, 'crossing the attention threshold must raise sector danger');
  assert.equal(impulses[0].kind, 'mining_noise', 'the impulse names its cause for the ledger');
  assert.equal(impulses[0].sectorId, 'sector_ceres_belt', 'danger lands in the sector being mined');
  assert(impulses[0].danger > 0, 'loud mining raises danger, it does not lower it');

  // Re-crossing immediately must not let one session flood the field.
  state.player.miningNoise = 69;
  sim.registry.get('mining')._updateMiningNoise(true, 0.5, state);
  assert.equal(dangerEvents.length, 2, 'the meter still reports every crossing');
  assert.equal(impulses.length, 1, 'the field impulse is rate-limited');
}

// ── the bulk tether-haul loop-lock ────────────────────────────────────────────────────────────
// `BULK_HAUL_MIN_U = 20` against a best-possible chunk of ~8u meant bulkHaulPayoutForChunk, the
// refinery dock handler and the whole src/ui/prompts/bulkHaulTag.js system were code that had never
// executed once (grammar §9.5.2 amputation 2). A big rock must now leave behind a fragment the hold
// cannot swallow, so the reason you own a rope is that some ore is too big to scoop.
function checkFractureLeavesAHaulableCore() {
  const { sim, state, player, miningSys } = boot(8801);
  const chunked = [];
  const tetherPrompts = [];
  sim.bus.on('asteroid:chunked', (p) => chunked.push(p));
  sim.bus.on('mining:bulkRequiresTether', (p) => tetherPrompts.push(p));

  const biggest = Math.max(...ASTEROIDS.map((a) => a.yieldU[1]));
  const parent = spawnAsteroid(sim, { radius: 22, hp: 4, yieldU: biggest, pos: { x: 160, z: 0 } });
  parent.data.typeId = 'ast_metallic';
  state.player.miningBeam.dps = 4000;
  state.player.miningBeam.range = 340;
  setPlayerForContact(state, player, parent, Math.PI);
  state.input.fireGroup = 2;
  sim.step(SIM_DT);
  state.input.fireGroup = null;

  const cores = state.entityList.filter((e) => e.type === 'asteroid' && e.data && e.data.bulkCore);
  assert.equal(cores.length, 1, 'the largest authored rock must leave exactly one core chunk');
  const core = cores[0];
  assert(core.data.bulkMassU > BULK_HAUL_MIN_U,
    `the core chunk must exceed the haul threshold (${core.data.bulkMassU} vs ${BULK_HAUL_MIN_U})`);
  assert(core.radius > parent.radius * 0.5, 'the core chunk reads as oversized next to its siblings');
  assert(core.mass < parent.mass,
    'a core chunk is never heavier than the parent the player could already tether');
  assert(chunked.some((c) => c.chunkId === core.id && c.bulkCore === true),
    'asteroid:chunked names the core chunk so downstream consumers can see it');

  // It cannot be beamed into loose ore. The only way to monetize it is the rope.
  const released = miningSys.applyMining(core.id, 500, 1, player.id);
  assert.equal(released, 0, 'the core chunk refuses the mining beam');
  assert(tetherPrompts.length >= 1, 'refusing the beam tells the player to tether it');
  const payout = bulkHaulPayoutForChunk(core);
  assert(payout.credits > 0, 'the refinery payout path pays real credits');
  assert.equal(payout.massU, core.data.bulkMassU, 'the payout is priced on the mass you dragged');

  // A small rock must NOT produce one — bulk haul is an event, not a tax on every asteroid.
  const small = spawnAsteroid(sim, { radius: 8, hp: 4, yieldU: 8, pos: { x: -160, z: 0 } });
  miningSys.applyMining(small.id, 500, 1, player.id);
  const smallCores = state.entityList.filter(
    (e) => e.type === 'asteroid' && e.data && e.data.bulkCore && e.id !== core.id,
  );
  assert.equal(smallCores.length, 0, 'small rocks must not spawn haulable cores');
}

// ── the codex tells the truth ─────────────────────────────────────────────────────────────────
// ORES used to duplicate COMMODITIES at different numbers (iron: 12 here, 28 there) and the codex
// ore table renders ORES, so the game actively told new players wrong prices (grammar §9.5.5).
function checkOreTableIsSingleSourced() {
  const byId = new Map(COMMODITIES.map((c) => [c.id, c]));
  for (const ore of ORES) {
    const cmdty = byId.get(ore.id);
    assert(cmdty, `ORES row ${ore.id} must resolve to a canonical commodity`);
    assert.equal(ore.baseValue, cmdty.basePrice, `${ore.id} price must match the market`);
    assert.equal(ore.name, cmdty.name, `${ore.id} name must match the market`);
    assert.equal(ore.mass, cmdty.massPerU, `${ore.id} mass must match the market`);
    assert.equal(ore.vol, cmdty.volPerU, `${ore.id} volume must match the market`);
  }
}

function checkYieldFloatingTextNamesCommodity() {
  // Starter beam is directToCargo — mining:yield is the only flight float for each unit.
  // Bare "+1" without a commodity name is unreadable (player can't tell iron from silicate).
  const floatSrc = readFileSync(resolve(ROOT, 'src/ui/floatingText.js'), 'utf8');
  assert.match(floatSrc, /bus\.on\('mining:yield'/, 'floatingText must listen for mining:yield');
  assert.match(floatSrc, /'\+' \+ p\.qty \+ ' ' \+ name/,
    'mining yield float text must be "+N Commodity Name", not bare +qty');
  assert.doesNotMatch(floatSrc, /mining:yield'[\s\S]{0,120}spawn\('\+' \+ p\.qty,/,
    'mining yield must not spawn bare +qty floats');
}

checkWorldSpawnSeams();
checkSeamYield();
checkBeamHeatLocksOutAndRecovers();
checkVentBonusPaysRealOre();
checkPulsingOutEarnsPegging();
checkMasslineTargetOwnsMiningBeam();
checkBeamTargetSticksUntilRelease();
checkFractureAndVacuumCargo();
checkFractureLeavesAHaulableCore();
checkMiningNoiseCrossing();
checkOreTableIsSingleSourced();
checkYieldFloatingTextNamesCommodity();

console.log('Mining 2.0 core checks OK');
