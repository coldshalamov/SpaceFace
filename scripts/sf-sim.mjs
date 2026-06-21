#!/usr/bin/env node
// SpaceFace headless sim CLI seed. This is the first SG-01/SG-07 command surface:
// run a named scenario with an input tape, produce a canonical snapshot hash, and repeat-check it.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { canonicalStringify, snapshotSimState } from '../src/core/simSnapshot.js';
import { flight } from '../src/systems/flight.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args[0] || 'help';
const scenario = args[1] || '';

if (command === 'help' || command === '--help' || command === '-h') usage(0);
if (command !== 'run') usage(1, `Unknown command: ${command}`);
if (scenario !== '47a') usage(1, `Unknown scenario: ${scenario}`);

const inputPath = argValue('--inputs', 'test/47a.inputs.json');
const tape = readJson(inputPath);
const seed = readInt('--seed', tape.seed || 47);
const ticks = readInt('--ticks', Math.max(720, lastTapeTick(tape) + 360));
const repeat = readInt('--repeat', 1);
const includeSnapshot = hasFlag('--snapshot') || !hasFlag('--hash');

const first = run47a({ seed, ticks, tape });
assert47aPhase0Metrics(first.metrics);
for (let i = 1; i < repeat; i++) {
  const next = run47a({ seed, ticks, tape });
  assert47aPhase0Metrics(next.metrics);
  assert.equal(next.sha256, first.sha256, `repeat ${i + 1} hash diverged`);
}

const result = {
  schema: 'spaceface.sfSimResult.v1',
  deterministic: true,
  command: 'run',
  scenario,
  seed,
  ticks,
  inputTape: inputPath.replace(/\\/g, '/'),
  repeat,
  sha256: first.sha256,
  metrics: first.metrics,
};
if (includeSnapshot) result.snapshot = first.snapshot;
process.stdout.write(JSON.stringify(result, null, 2) + '\n');

function run47a({ seed, ticks, tape }) {
  const sim = createSimulation({ seed, systems: [flight, weapons, physics, combat, cargo, economy] });
  const { state, bus, registry } = sim;
  const metrics = {
    combatFire: 0,
    projectileHits: 0,
    combatDamage: 0,
    entityKilled: 0,
    economyTicks: 0,
    firstMeaningfulSteeringTick: null,
  };
  bus.on('combat:fire', () => { metrics.combatFire++; });
  bus.on('projectile:hit', () => { metrics.projectileHits++; });
  bus.on('combat:damage', () => { metrics.combatDamage++; });
  bus.on('entity:killed', () => { metrics.entityKilled++; });
  bus.on('economy:tick', () => { metrics.economyTicks++; });

  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.credits = 5000;

  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    rot: 0,
  }));
  state.playerId = player.id;

  const target = sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 1,
    factionId: 'faction_reavers',
    pos: { x: 620, z: 245 },
    rot: Math.PI,
    ai: { role: 'target_dummy' },
  }));
  target.radius = Math.max(target.radius || 0, 44);

  const econ = registry.get('economy');
  if (econ && typeof econ.newGame === 'function') econ.newGame();

  const frames = normalizeTape(tape);
  let frameIndex = 0;
  let currentInput = frames[0] ? frames[0].input : {};

  for (let tick = 0; tick < ticks; tick++) {
    while (frameIndex < frames.length && frames[frameIndex].tick <= tick) {
      currentInput = frames[frameIndex].input || {};
      frameIndex++;
    }
    applyInput(state, currentInput);
    if (metrics.firstMeaningfulSteeringTick == null && isMeaningfulSteering(currentInput)) {
      metrics.firstMeaningfulSteeringTick = tick;
    }
    sim.step(SIM_DT);
  }

  metrics.finalPlayerCredits = state.player.credits;
  metrics.finalEntityCount = state.entityList.length;
  metrics.systems = registry.systems.map((s) => s.name);
  const snapshot = snapshotSimState(state);
  const sha256 = hashSnapshot(snapshot);
  sim.dispose();
  return { snapshot, sha256, metrics };
}

function applyInput(state, input) {
  const aimAngle = finite(input.aimAngle, state.input.aimAngle || 0);
  const player = state.entities.get(state.playerId);
  const origin = player ? player.pos : { x: 0, z: 0 };
  Object.assign(state.input, {
    moveX: finite(input.moveX, 0),
    moveZ: finite(input.moveZ, 0),
    turnIntent: finite(input.turnIntent, input.moveX || 0),
    boost: !!input.boost,
    fire: !!input.fire,
    fireGroup: input.fireGroup == null ? null : input.fireGroup,
    aimAngle,
    aimWorld: {
      x: origin.x + Math.cos(aimAngle) * 1000,
      z: origin.z + Math.sin(aimAngle) * 1000,
    },
  });
}

function normalizeTape(tape) {
  assert.equal(tape.schema, 'spaceface.goldenInputTape.v1', 'input tape schema mismatch');
  assert(Array.isArray(tape.frames), 'input tape requires frames[]');
  const frames = tape.frames.map((frame) => ({
    tick: readFrameTick(frame.tick),
    input: frame.input || {},
  })).sort((a, b) => a.tick - b.tick);
  for (let i = 1; i < frames.length; i++) {
    assert(frames[i].tick > frames[i - 1].tick, 'input frame ticks must strictly increase');
  }
  return frames;
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

function argValue(name, fallback) {
  const eq = name + '=';
  const ix = args.findIndex((arg) => arg === name || arg.startsWith(eq));
  if (ix < 0) return fallback;
  if (args[ix].startsWith(eq)) return args[ix].slice(eq.length);
  return args[ix + 1] || fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function readInt(name, fallback) {
  const raw = argValue(name, String(fallback));
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

function readFrameTick(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('input frame tick must be a non-negative integer');
  return value;
}

function lastTapeTick(tape) {
  return Array.isArray(tape.frames) ? Math.max(0, ...tape.frames.map((f) => f.tick || 0)) : 0;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isMeaningfulSteering(input) {
  return Math.abs(input.moveX || 0) > 0.01 || Math.abs(input.moveZ || 0) > 0.01 || Math.abs(input.turnIntent || 0) > 0.01;
}

function assert47aPhase0Metrics(metrics) {
  assert(metrics.firstMeaningfulSteeringTick != null && metrics.firstMeaningfulSteeringTick <= 300,
    '47-A Phase 0 tape should produce meaningful steering within 5s');
  assert(metrics.combatFire > 0, '47-A Phase 0 tape should exercise weapon fire');
  assert(metrics.projectileHits > 0, '47-A Phase 0 tape should exercise projectile collision');
  assert(metrics.combatDamage > 0, '47-A Phase 0 tape should exercise combat damage');
  assert(metrics.economyTicks > 0, '47-A Phase 0 tape should advance economy cadence');
}

function usage(code, message) {
  if (message) process.stderr.write(message + '\n');
  process.stderr.write('Usage: node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --hash --repeat 20\n');
  process.exit(code);
}
