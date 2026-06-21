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
import { createDeterministicEventTrace } from '../src/core/eventTrace.js';
import { flight } from '../src/systems/flight.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { save } from '../src/save/saveSystem.js';
import {
  TELEMETRY_ENVELOPE_SCHEMA,
  validateEvidenceDocument,
  formatEvidenceIssue,
} from '../src/contracts/evidenceSchemas.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const command = args[0] || 'help';
const scenario = args[1] || '';

if (command === 'help' || command === '--help' || command === '-h') usage(0);
if (command !== 'run' && command !== 'inspect') usage(1, `Unknown command: ${command}`);
if (scenario !== '47a') usage(1, `Unknown scenario: ${scenario}`);

const inputPath = argValue('--inputs', 'test/47a.inputs.json');
const tape = readJson(inputPath);
assertEvidenceDocument(tape, inputPath);
const seed = readInt('--seed', tape.seed || 47);
const inspectTick = command === 'inspect' ? readRequiredInt('--tick') : null;
const ticks = inspectTick == null ? readInt('--ticks', Math.max(720, lastTapeTick(tape) + 360)) : inspectTick;
const repeat = command === 'run' ? readInt('--repeat', 1) : 1;
const reloadAt = readOptionalInt('--reload-at', null);
if (reloadAt != null && (reloadAt <= 0 || reloadAt >= ticks)) {
  throw new RangeError('--reload-at must be greater than 0 and less than --ticks');
}
const includeSnapshot = command === 'inspect' || hasFlag('--snapshot') || !hasFlag('--hash');
const expectPath = command === 'run' ? argValue('--expect', null) : null;
const expectedEnvelope = expectPath ? readJson(expectPath) : null;
if (expectedEnvelope) assertEvidenceDocument(expectedEnvelope, expectPath);

if (command === 'inspect') {
  const inspected = run47a({ seed, ticks, tape, reloadAt });
  const result = {
    schema: 'spaceface.sfSimInspectResult.v1',
    deterministic: true,
    command: 'inspect',
    scenario,
    seed,
    tick: ticks,
    inputTape: inputPath.replace(/\\/g, '/'),
    reloadAt,
    sha256: inspected.sha256,
    metrics: inspected.metrics,
    traceSummary: inspected.traceSummary,
    snapshot: inspected.snapshot,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const baseline = run47a({ seed, ticks, tape });
  assert47aPhase0Metrics(baseline.metrics);
  const first = reloadAt == null ? baseline : run47a({ seed, ticks, tape, reloadAt });
  assert47aPhase0Metrics(first.metrics, { reloadAt });
  if (reloadAt != null) {
    assert.equal(first.sha256, baseline.sha256, `reload-at ${reloadAt} hash diverged from uninterrupted baseline`);
  }
  for (let i = 1; i < repeat; i++) {
    const next = run47a({ seed, ticks, tape, reloadAt });
    assert47aPhase0Metrics(next.metrics, { reloadAt });
    assert.equal(next.sha256, first.sha256, `repeat ${i + 1} hash diverged`);
  }
  if (expectedEnvelope) assertExpectedEnvelope(expectedEnvelope, first, { inputPath, seed, repeat });

  const result = {
    schema: 'spaceface.sfSimResult.v1',
    deterministic: true,
    command: 'run',
    scenario,
    seed,
    ticks,
    inputTape: inputPath.replace(/\\/g, '/'),
    expectedTelemetry: expectPath ? expectPath.replace(/\\/g, '/') : null,
    repeat,
    reloadAt,
    sha256: first.sha256,
    baselineSha256: reloadAt == null ? undefined : baseline.sha256,
    metrics: first.metrics,
    traceSummary: first.traceSummary,
  };
  if (includeSnapshot) result.snapshot = first.snapshot;
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

function run47a({ seed, ticks, tape, reloadAt = null }) {
  const sim = createSimulation({ seed, systems: [flight, weapons, physics, combat, cargo, economy, missions, story, save] });
  const { state, bus, registry } = sim;
  const eventTrace = createDeterministicEventTrace(bus, state);
  const metrics = {
    combatFire: 0,
    projectileHits: 0,
    combatDamage: 0,
    entityKilled: 0,
    economyTicks: 0,
    saveReloads: 0,
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
  target.flags = Object.assign({}, target.flags, { persistent: true });

  const econ = registry.get('economy');
  if (econ && typeof econ.newGame === 'function') econ.newGame();
  bus.emit('game:started', { source: 'sf-sim', scenario: '47a' });

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
    if (reloadAt != null && state.tick === reloadAt) {
      reloadThroughSave(registry, state, metrics, reloadAt);
    }
  }

  metrics.finalPlayerCredits = state.player.credits;
  metrics.finalEntityCount = state.entityList.length;
  metrics.systems = registry.systems.map((s) => s.name);
  const traceSummary = summarizeTrace(eventTrace.snapshot());
  const snapshot = snapshotSimState(state);
  const sha256 = hashSnapshot(snapshot);
  eventTrace.dispose();
  sim.dispose();
  return { snapshot, sha256, metrics, traceSummary };
}

function reloadThroughSave(registry, state, metrics, reloadAt) {
  const saveSys = registry.get('save');
  assert(saveSys && typeof saveSys.serialize === 'function' && typeof saveSys.loadEnvelope === 'function',
    '47-A reload check requires the real save system');
  const persistentBefore = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  const envelope = saveSys.serialize('sf-sim-reload');
  assert.equal(saveSys.loadEnvelope(envelope, 'sf-sim-reload'), true, '47-A reload check should load its own envelope');
  const persistentAfter = state.entityList.filter((e) => e.alive && e.flags && e.flags.persistent).length;
  assert.equal(state.tick, reloadAt, '47-A reload should preserve sim tick');
  assert.equal(persistentAfter, persistentBefore, '47-A reload should preserve persistent live actors');
  metrics.saveReloads++;
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
  const frames = tape.frames.map((frame) => ({
    tick: frame.tick,
    input: frame.input || {},
  }));
  return frames;
}

function assertEvidenceDocument(doc, rel) {
  const report = validateEvidenceDocument(doc, { file: rel });
  assert(report.ok, `evidence schema invalid:\n${report.issues.map(formatEvidenceIssue).join('\n')}`);
}

function assertExpectedEnvelope(envelope, run, options) {
  assert.equal(envelope.schema, TELEMETRY_ENVELOPE_SCHEMA, '--expect must point to a telemetry envelope');
  assert.equal(envelope.seed, options.seed, 'expected telemetry seed must match run seed');
  assert.equal(normalizePath(envelope.sourceInputTape), normalizePath(options.inputPath), 'expected telemetry sourceInputTape must match --inputs');
  const placeholders = envelope.acceptancePlaceholders || {};
  if (placeholders.authoritativeHash != null) {
    assert.equal(run.sha256, placeholders.authoritativeHash, '47-A authoritative hash drifted from expected telemetry envelope');
  }
  if (placeholders.firstMeaningfulSteeringTickMax != null) {
    assert(run.metrics.firstMeaningfulSteeringTick <= placeholders.firstMeaningfulSteeringTickMax,
      'first meaningful steering tick exceeded expected telemetry ceiling');
  }
  if (placeholders.cleanRunCountRequired != null) {
    assert(options.repeat >= placeholders.cleanRunCountRequired, 'repeat count is below expected clean run requirement');
  }
  const observedCounts = envelope.phase0ObservedTraceCounts || {};
  for (const [type, expectedCount] of Object.entries(observedCounts)) {
    const actualCount = run.traceSummary.types[type] || 0;
    assert.equal(actualCount, expectedCount, `47-A observed trace count drifted for ${type}`);
  }
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(canonicalStringify(snapshot)).digest('hex');
}

function summarizeTrace(trace) {
  const types = {};
  const firstTick = {};
  const lastTick = {};
  for (const event of trace) {
    types[event.type] = (types[event.type] || 0) + 1;
    if (!(event.type in firstTick)) firstTick[event.type] = event.tick;
    lastTick[event.type] = event.tick;
  }
  return {
    schema: 'spaceface.traceSummary.v1',
    total: trace.length,
    types,
    firstTick,
    lastTick,
  };
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

function readRequiredInt(name) {
  const raw = argValue(name, null);
  if (raw == null) usage(1, `${name} is required`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

function readOptionalInt(name, fallback) {
  const raw = argValue(name, null);
  if (raw == null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

function lastTapeTick(tape) {
  return Array.isArray(tape.frames) ? Math.max(0, ...tape.frames.map((f) => f.tick || 0)) : 0;
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isMeaningfulSteering(input) {
  return Math.abs(input.moveX || 0) > 0.01 || Math.abs(input.moveZ || 0) > 0.01 || Math.abs(input.turnIntent || 0) > 0.01;
}

function assert47aPhase0Metrics(metrics, options = {}) {
  assert(metrics.firstMeaningfulSteeringTick != null && metrics.firstMeaningfulSteeringTick <= 300,
    '47-A Phase 0 tape should produce meaningful steering within 5s');
  assert(metrics.combatFire > 0, '47-A Phase 0 tape should exercise weapon fire');
  assert(metrics.projectileHits > 0, '47-A Phase 0 tape should exercise projectile collision');
  assert(metrics.combatDamage > 0, '47-A Phase 0 tape should exercise combat damage');
  assert(metrics.economyTicks > 0, '47-A Phase 0 tape should advance economy cadence');
  if (options.reloadAt != null) {
    assert.equal(metrics.saveReloads, 1, '47-A reload check should perform exactly one save/load cycle');
  }
}

function usage(code, message) {
  if (message) process.stderr.write(message + '\n');
  process.stderr.write('Usage:\n');
  process.stderr.write('  node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20 [--reload-at 600]\n');
  process.stderr.write('  node scripts/sf-sim.mjs inspect 47a --seed 47 --tick 360 --inputs test/47a.inputs.json [--reload-at 600]\n');
  process.exit(code);
}
