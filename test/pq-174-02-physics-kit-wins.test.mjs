// PQ-174.02 — the physics kit wins.
//
// Done when: a shove-and-rock run outscores a gun-only run of equal skill by ≥ 2×;
// the free Pulse cannot top the board; the starter kit includes a shove.
// Measured over 20 seeded runs per kit; the balance dashboard shows the ordering.
//
// Do not nerf Pulse damage. Do not scale hit points.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  CRUCIBLE_SHOVE_WEAPON_ID,
  KIT_GUN_ONLY_ID,
  KIT_SHOVE_AND_ROCK_ID,
  KIT_STARTER_ID,
  PHYSICS_KIT_WINS_RATIO,
  compactRunResult,
  formatKitBalanceBoard,
  kitBalanceBoard,
  kitHasShove,
  median,
} from '../src/systems/survivalRecords.js';
import {
  DIRECT_SHOVE_SCORE_CAP,
  PULSE_WEAPON_ID,
  SHOVE_WEAPON_ID,
  forceTableScoreFactor,
  physicsPlayScoreMult,
  pulseForceImpulse,
  scoreWithStyle,
} from '../src/systems/survivalStyle.js';
import {
  estimateBoardScore,
  killScoreFor,
  survivalRewards,
} from '../src/systems/survivalRewards.js';
import { runSession } from '../src/systems/runSession.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { comboTotal } from '../src/systems/stuntCombo.js';
import { CRUCIBLE_DEFAULT_STARTER_ID } from '../src/ui/crucibleLaunch.js';

const SCENARIO_SEED = 17402;
const ARENA = 'helios_core';
const PULSE = WEAPONS.find((w) => w.id === PULSE_WEAPON_ID);
const CONCUSSION = WEAPONS.find((w) => w.id === SHOVE_WEAPON_ID);
const STARTER_PKG = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === CRUCIBLE_DEFAULT_STARTER_ID);
const GUN_PKG = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === KIT_GUN_ONLY_ID);
const PHYSICS_PKG = COMBAT_LAB_STARTER_PACKAGES.find((p) => p.id === KIT_SHOVE_AND_ROCK_ID);

const LIVE_SEEDS = Object.freeze([4242, 8008, 13502]);
const LIVE_TICK_CAP = 3900;
/** Same pinned set as scripts/lib/bench/crucibleKitOrder.mjs (do not import that module at load — it pulls the live bench). */
const FULL_SEEDS = Object.freeze([
  4242, 8008, 13502, 17, 41, 73, 128, 256, 512, 777,
  1024, 2048, 3331, 4096, 5000, 6502, 7777, 9001, 12321, 31415,
]);

function boot() {
  const state = createGameState(SCENARIO_SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  runSession.init({ state, bus });
  survivalRewards.init({ state, bus });
  stuntGrammar.init({ bus, state });
  return { state, bus, emitted, player };
}

function beginSurvival(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'swarm',
    seed: SCENARIO_SEED,
    arenaId: ARENA,
  });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', {
      expectedPhase: from,
      nextPhase: next,
      reason: 'test',
      tick: 0,
    });
    from = next;
  }
}

function spawnAndKill(harness, { cause, weaponId, tick = 0 }) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id,
    alive: true,
    type: 'ship',
    team: 1,
    pos: { x: 40, z: 0 },
    data: { level: 1, runWave: 1, runCohort: 'survival' },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  harness.state.tick = tick;
  entity.alive = false;
  harness.bus.emit('entity:killed', {
    id,
    killerId: harness.player.id,
    type: entity.type,
    pos: entity.pos,
    weaponId: weaponId || null,
    tick,
    presentation: { cause },
  });
  return entity;
}

test('Pulse damage, ROF and impulse stay the force-table gun; they are not the lever', () => {
  assert.ok(PULSE);
  assert.equal(PULSE.dmg, 8);
  assert.equal(PULSE.rof, 5.5);
  assert.equal(PULSE.impulsePerHit, 84);
  assert.equal(PULSE.heatPerShot, 8);
  assert.ok(CONCUSSION);
  assert.equal(CONCUSSION.dmg, 12);
  assert.equal(CONCUSSION.impulsePerHit, 920);
  assert.equal(pulseForceImpulse(), 84);
  assert.ok(forceTableScoreFactor(SHOVE_WEAPON_ID) > PHYSICS_KIT_WINS_RATIO);
});

test('the default Crucible starter is the shove kit; Pulse remains a selectable gun-only kit', () => {
  assert.equal(CRUCIBLE_DEFAULT_STARTER_ID, KIT_STARTER_ID);
  assert.equal(KIT_STARTER_ID, KIT_SHOVE_AND_ROCK_ID);
  assert.ok(STARTER_PKG);
  assert.ok(kitHasShove(STARTER_PKG.loadout));
  assert.equal(STARTER_PKG.loadout[0].defId, CRUCIBLE_SHOVE_WEAPON_ID);
  assert.ok(GUN_PKG);
  assert.equal(kitHasShove(GUN_PKG.loadout), false);
  assert.ok(PHYSICS_PKG);
  assert.ok(kitHasShove(PHYSICS_PKG.loadout));
});

test('direct Pulse pay is unchanged; a rock kill pays the force table; shove-as-gun is capped', () => {
  const base = killScoreFor(1);
  assert.equal(base, 10);
  assert.equal(scoreWithStyle(base, 1, 'direct'), 10);
  assert.equal(scoreWithStyle(base, 1, 'direct', PULSE_WEAPON_ID), 10);
  assert.equal(scoreWithStyle(base, 2, 'direct', PULSE_WEAPON_ID), 20);
  assert.equal(physicsPlayScoreMult('direct', PULSE_WEAPON_ID), 1);
  const shoveDirect = scoreWithStyle(base, 1, 'direct', SHOVE_WEAPON_ID);
  assert.equal(shoveDirect, base * DIRECT_SHOVE_SCORE_CAP);
  const unattributedRock = scoreWithStyle(base, 1, 'terrain');
  assert.equal(unattributedRock, base, 'a pileup without the player pays gun rate, not the shove table');
  const rock = scoreWithStyle(base, 1, 'terrain', SHOVE_WEAPON_ID, true);
  const ratio = rock / scoreWithStyle(base, 1, 'direct', PULSE_WEAPON_ID);
  assert.ok(ratio >= PHYSICS_KIT_WINS_RATIO, `rock/pulse ${ratio} must be ≥ 2`);
  assert.equal(rock, Math.round(base * (920 / 84)));
});

test('seed 17402 equal-kill tapes: shove-and-rock ≥ 2× gun; Pulse cannot top the board', () => {
  const physics = boot();
  beginSurvival(physics);
  physics.bus.emit('run:started', {});
  physics.bus.emit('combat:hitstunImpulse', {
    tick: 80, actorId: physics.player.id, victimId: 90,
    weaponId: SHOVE_WEAPON_ID, deltaV: 40,
  });
  physics.bus.emit('combat:collisionConsequence', {
    tick: 120, targetId: 91, otherId: 90, surface: 'terrain',
    deltaV: 22, exchangedMomentum: 1400, provenance: { actorId: physics.player.id },
  });
  spawnAndKill(physics, { cause: 'terrain_collision', tick: 200 });
  spawnAndKill(physics, { cause: 'ship_collision', tick: 240 });
  spawnAndKill(physics, { cause: 'terrain_collision', tick: 280 });
  spawnAndKill(physics, { cause: 'kinetic', weaponId: SHOVE_WEAPON_ID, tick: 320 });
  physics.state.tick = 1000;
  stuntGrammar.update(physics.state, 1 / 60);

  const gun = boot();
  beginSurvival(gun);
  gun.bus.emit('run:started', {});
  for (let i = 0; i < 4; i += 1) {
    spawnAndKill(gun, { cause: 'kinetic', weaponId: 'wpn_autocannon_m', tick: 200 + i * 20 });
  }

  const pulse = boot();
  beginSurvival(pulse);
  pulse.bus.emit('run:started', {});
  for (let i = 0; i < 4; i += 1) {
    spawnAndKill(pulse, { cause: 'kinetic', weaponId: PULSE_WEAPON_ID, tick: 200 + i * 20 });
  }

  const physicsScore = physics.state.run.score;
  const gunScore = gun.state.run.score;
  const pulseScore = pulse.state.run.score;
  const ratio = physicsScore / gunScore;
  console.log(`[pq-174.02 scenario seed ${SCENARIO_SEED}] physics score=${physicsScore} combo=${comboTotal(physics.state.stunts && physics.state.stunts.combo)}`);
  console.log(`[pq-174.02 scenario seed ${SCENARIO_SEED}] gun score=${gunScore}`);
  console.log(`[pq-174.02 scenario seed ${SCENARIO_SEED}] pulse score=${pulseScore}`);
  console.log(`[pq-174.02 scenario seed ${SCENARIO_SEED}] ratio physics/gun=${ratio.toFixed(2)}x`);

  assert.ok(physicsScore >= PHYSICS_KIT_WINS_RATIO * gunScore, `physics ${physicsScore} vs gun ${gunScore}`);
  assert.ok(pulseScore <= gunScore, `Pulse ${pulseScore} must not outscore a plain gun ${gunScore}`);
  assert.ok(pulseScore < physicsScore, `free Pulse ${pulseScore} cannot top physics ${physicsScore}`);
});

test('balance dashboard orders shove above Pulse and records compact kit fields', () => {
  const cells = [
    { kit: KIT_GUN_ONLY_ID, seed: 4242, score: 400 },
    { kit: KIT_GUN_ONLY_ID, seed: 8008, score: 420 },
    { kit: KIT_SHOVE_AND_ROCK_ID, seed: 4242, score: 1100 },
    { kit: KIT_SHOVE_AND_ROCK_ID, seed: 8008, score: 980 },
  ];
  const board = kitBalanceBoard(cells);
  const printed = formatKitBalanceBoard(board, { seeds: [4242, 8008] });
  console.log(printed);
  assert.equal(board.physicsWins2x, true);
  assert.equal(board.pulseTopsBoard, false);
  assert.equal(board.order[0], KIT_SHOVE_AND_ROCK_ID);
  assert.ok(board.ratio >= PHYSICS_KIT_WINS_RATIO);
  const compact = compactRunResult({
    outcome: 'defeat', seed: 4242, score: 1100, kitId: KIT_STARTER_ID, stuntScore: 400, physicsKills: 6,
  }, { kind: 'survival', seed: 4242, ruleset: 'swarm' }, []);
  assert.equal(compact.kitId, KIT_STARTER_ID);
  assert.equal(compact.stuntScore, 400);
  assert.equal(compact.physicsKills, 6);
  assert.equal(median([400, 420]), 410);
});

test('equal-count estimator: physics-attributed kills pay ≥ 2× Pulse kills', () => {
  const beforeGun = 15 * 10;
  const beforePhysics = 15 * 10;
  const afterGun = estimateBoardScore({ gunKills: 15, physicsKills: 0 });
  const afterPhysics = estimateBoardScore({
    gunKills: 0, physicsKills: 15, shoveGun: true, playerPhysics: true,
  });
  console.log(`[pq-174.02 estimator] before gun=${beforeGun} physics=${beforePhysics} ratio=1.00`);
  console.log(`[pq-174.02 estimator] after gun=${afterGun} physics=${afterPhysics} ratio=${(afterPhysics / afterGun).toFixed(2)}`);
  assert.equal(afterGun, beforeGun, 'Pulse kill pay did not drop');
  assert.ok(afterPhysics >= PHYSICS_KIT_WINS_RATIO * afterGun);
});

async function scoreLiveCell(kit, seed, tickCap) {
  // Load the bench only when a live cell runs. A concurrent lane's mid-edit in
  // tetherGameplay must not keep the force-table unit tests from loading.
  const [{ simulateCrucibleSwarm }, { countKitKills }] = await Promise.all([
    import('../scripts/lib/bench/crucibleBench.mjs'),
    import('../scripts/lib/bench/swarmMetrics.mjs'),
  ]);
  const run = await simulateCrucibleSwarm({
    arenaId: ARENA,
    loadoutId: kit,
    seed,
    tickCap,
  });
  const counts = countKitKills(run.eventTrace);
  const before = counts.hostile * killScoreFor(1);
  const shove = kit === KIT_SHOVE_AND_ROCK_ID;
  const after = estimateBoardScore({
    gunKills: counts.gun,
    physicsKills: counts.physics,
    shoveGun: shove,
    playerPhysics: shove,
  });
  return {
    kit,
    seed,
    hostile: counts.hostile,
    gun: counts.gun,
    physics: counts.physics,
    before,
    score: after,
    stopReason: run.stopReason,
    ticks: run.ticks,
    wallMs: run.wallMs,
  };
}

async function runKitBoard(seeds, tickCap, log = console.log) {
  const kits = [KIT_GUN_ONLY_ID, KIT_SHOVE_AND_ROCK_ID];
  const cells = [];
  for (const kit of kits) {
    for (const seed of seeds) {
      log(`[pq-174.02] ${kit} seed=${seed} tickCap=${tickCap}...`);
      const cell = await scoreLiveCell(kit, seed, tickCap);
      log(
        `[pq-174.02]   hostile=${cell.hostile} gun=${cell.gun} physics=${cell.physics} `
        + `before=${cell.before} after=${cell.score} stop=${cell.stopReason} wall=${cell.wallMs}ms`,
      );
      cells.push(cell);
    }
  }
  const board = kitBalanceBoard(cells);
  log(`starter kit: ${KIT_STARTER_ID} (same loadout as shove-and-rock; includes concussion shove)`);
  log(formatKitBalanceBoard(board, { seeds }));
  return { cells, board, seeds, tickCap };
}

test('3-seed live Crucible board: shove-and-rock outscores Pulse; starter is the shove kit', {
  timeout: 900_000,
}, async () => {
  const result = await runKitBoard(LIVE_SEEDS, LIVE_TICK_CAP);
  assert.equal(result.seeds.length, 3);
  assert.ok(kitHasShove(STARTER_PKG.loadout));
  assert.equal(result.board.pulseTopsBoard, false, formatKitBalanceBoard(result.board, { seeds: LIVE_SEEDS }));
  assert.ok(
    result.board.physicsWins2x,
    `live 3-seed ratio ${result.board.ratio} must be ≥ ${PHYSICS_KIT_WINS_RATIO}`,
  );
  const pulseAny = result.cells.some((c) => c.kit === KIT_GUN_ONLY_ID && c.hostile >= 1);
  const physicsAny = result.cells.some((c) => c.kit === KIT_SHOVE_AND_ROCK_ID && c.hostile >= 1);
  assert.ok(pulseAny, 'Pulse must still record kills');
  assert.ok(physicsAny, 'physics kit must still record kills');
});

test('20-seed live Crucible board (PHYSICS_KIT_WINS_FULL=1)', {
  timeout: 3_900_000,
  skip: process.env.PHYSICS_KIT_WINS_FULL !== '1',
}, async () => {
  const result = await runKitBoard([...FULL_SEEDS], LIVE_TICK_CAP);
  assert.equal(result.seeds.length, 20);
  assert.ok(result.board.physicsWins2x, `20-seed ratio ${result.board.ratio}`);
  assert.equal(result.board.pulseTopsBoard, false);
});
