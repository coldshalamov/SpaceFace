#!/usr/bin/env node
// probe:atlas:perf — reproducible performance baselines for the Universe Atlas surfaces.
//
// WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
// --------------------------------------------
// The program brief asks for budgets "or at minimum REPRODUCIBLE BASELINES" across map render and
// interaction, marker layout/clustering, route calculation, and high-speed VFX allocation. This
// probe supplies baselines for the parts that can be measured WITHOUT a GPU, which is most of the
// cost and all of the part that is machine-independent.
//
// It splits the two kinds of number on purpose, because they have different evidentiary value:
//
//   WALL-CLOCK (ms)   is machine-relative. It is RECORDED, never gated. The same code on the CI
//                     runner and on a dev laptop will differ by multiples, so a millisecond
//                     threshold here would either be vacuous or flaky. Environment metadata is
//                     written alongside every number so two runs can be compared honestly.
//
//   ALLOCATION (B/op) is machine-INDEPENDENT — it is a property of the code, not the host. This is
//                     the one the brief singles out as usually missed, and it is the one that
//                     produces hitches rather than low average FPS (this repo's own recorded hitch
//                     causes were a shader recompile storm, render-target realloc stalls, and
//                     planet-bake LRU thrash — all allocation/churn shaped, while a draw-call
//                     theory was FALSIFIED by measurement at 54 calls). So allocation is the axis
//                     that `--check` gates on.
//
// It measures the REAL exported builders against a REAL `createGameState`, at a swept content scale,
// so the output is a scaling curve rather than a single number that hides the exponent.
//
// NOT COVERED HERE, and recorded as such rather than quietly implied: GPU time, overdraw, and
// draw-call counts for the high-speed VFX. Those need a live WebGL context and belong with the
// headed probes (`check:perf`, `probe-performance-profile.mjs`). This probe's VFX section covers the
// CPU and allocation half only, and says so in its own output.
//
// USAGE
//   node --expose-gc scripts/probe-atlas-perf-baseline.mjs            # record baselines
//   node --expose-gc scripts/probe-atlas-perf-baseline.mjs --check    # gate on allocation ceilings
//   node scripts/probe-atlas-perf-baseline.mjs                        # runs, but allocation is skipped
//
// Exit codes: 0 recorded (or --check passed) · 1 --check exceeded an allocation ceiling.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, arch, totalmem } from 'node:os';

import { createGameState } from '../src/core/gameState.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import {
  buildGalaxyModel,
  buildSystemModel,
  buildLocalModel,
  buildMapModel,
  layoutMapLabels,
  pickMapTargetAt,
} from '../src/ui/galaxyMap.js';
import { projectOntoLane, resolveLaneSegment, travelLanes } from '../src/systems/travelLanes.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry } from '../src/data/travelLaneRoutes.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { TRAVEL_FLAGS } from '../src/data/featureFlags.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CEILINGS_PATH = resolve(ROOT, 'test/atlas-perf-allocation-ceilings.json');
const ARTIFACT = resolve(ROOT, 'scratch/atlas-perf/baseline.json');

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const VIEWPORT = { width: 1280, height: 860 };

const CHECK_MODE = process.argv.includes('--check');
const gc = typeof globalThis.gc === 'function' ? globalThis.gc : null;

// =================================================================================================
// Measurement primitives
// =================================================================================================

/** Median + p95 over repeated trials. Single-shot timing of sub-millisecond work is noise. */
function timeOp(fn, { trials = 30, innerLoops = 1, warmup = 5 } = {}) {
  for (let i = 0; i < warmup; i += 1) fn();
  const samples = [];
  for (let t = 0; t < trials; t += 1) {
    const started = process.hrtime.bigint();
    for (let i = 0; i < innerLoops; i += 1) fn();
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    samples.push(elapsed / innerLoops);
  }
  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
  return {
    medianMs: round(at(0.5), 5),
    p95Ms: round(at(0.95), 5),
    minMs: round(samples[0], 5),
    maxMs: round(samples[samples.length - 1], 5),
    trials,
    innerLoops,
  };
}

/**
 * Bytes retained-plus-churned per operation. Forced GC before and after bounds the drift; the result
 * is the allocation the operation asks the heap for, which is what drives GC pressure and therefore
 * hitching. Requires --expose-gc; returns null (never a fabricated zero) when unavailable.
 */
function allocPerOp(fn, { iterations = 400, warmup = 50, rounds = 5 } = {}) {
  if (!gc) return null;
  for (let i = 0; i < warmup; i += 1) fn();
  // A single heapUsed delta is badly noisy: an incremental GC landing mid-window can even make it
  // negative. Several rounds and the MEDIAN gives a number stable enough to gate on. Ceilings are
  // still only set on the low-allocation per-frame paths, where this is most reliable and where the
  // answer actually matters.
  const samples = [];
  for (let r = 0; r < rounds; r += 1) {
    gc(); gc();
    const before = process.memoryUsage().heapUsed;
    let sink = null;
    for (let i = 0; i < iterations; i += 1) sink = fn();
    const after = process.memoryUsage().heapUsed;
    if (sink === undefined) throw new Error('allocPerOp: operation returned undefined — result may be optimized away');
    samples.push((after - before) / iterations);
  }
  samples.sort((a, b) => a - b);
  return Math.max(0, Math.round(samples[Math.floor(samples.length / 2)]));
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// =================================================================================================
// Fixtures — real state, swept content scale
// =================================================================================================

/**
 * A real `createGameState` tree with the world frame set and N live entities placed around the
 * sector origin. Entity scale is the axis the map builders are sensitive to, so it is the sweep
 * variable rather than a fixed guess at "expected".
 */
function stateAtScale(entityCount, sectorId = TETHYS) {
  const state = createGameState(47);
  const origin = sectorGlobalOrigin(sectorId);
  const player = {
    id: 'player', type: 'ship', team: 0, alive: true,
    pos: { x: origin.x, z: origin.z }, vel: { x: 0, z: 0 }, rot: 0,
    homeSectorId: sectorId,
    data: { isPlayer: true, homeSectorId: sectorId },
  };
  const entities = new Map([[player.id, player]]);
  // Deterministic placement: a fixed lattice, so two runs measure the same geometry.
  const kinds = ['ship', 'asteroid', 'station', 'poi'];
  for (let i = 0; i < entityCount; i += 1) {
    const angle = (i * 2.399963) % (Math.PI * 2);
    const radius = 200 + ((i * 37) % 3000);
    const id = `e${i}`;
    entities.set(id, {
      id,
      type: kinds[i % kinds.length],
      team: i % 3,
      alive: true,
      pos: { x: origin.x + Math.cos(angle) * radius, z: origin.z + Math.sin(angle) * radius },
      vel: { x: 0, z: 0 },
      rot: 0,
      homeSectorId: sectorId,
      name: `Contact ${i}`,
      data: { homeSectorId: sectorId },
    });
  }
  state.playerId = 'player';
  state.player = { id: 'player', entityId: 'player' };
  // BOTH stores, and entityList is the load-bearing one. `galaxyMap.entityIterator` tests
  // `Array.isArray(state.entityList)` BEFORE falling back to the `entities` Map, and
  // `createGameState` ships `entityList: []` — so a fixture that sets only `.entities` on top of a
  // real game state measures ZERO entities while looking fully populated. This probe originally had
  // that bug: the entity sweep reported a flat curve because every scale was really scale 0.
  state.entityList = [...entities.values()];
  state.entities = entities;
  state.mode = 'flight';
  state.simTime = 120;
  state.world = state.world || {};
  state.world.currentSectorId = sectorId;
  state.world.sectorId = sectorId;
  state.world.sectors = state.world.sectors || {};
  state.world.discovery = state.world.discovery || {};
  state.nav = state.nav || {};
  return state;
}

function labelCandidates(count) {
  const kinds = ['station', 'gate', 'zone', 'poi', 'ship', 'asteroid', 'hazard'];
  return Array.from({ length: count }, (_, i) => ({
    id: `label-${i}`,
    text: `Waypoint ${i}`,
    kind: kinds[i % kinds.length],
    sx: (i * 97) % VIEWPORT.width,
    sy: (i * 61) % VIEWPORT.height,
    radiusPx: 10,
  }));
}

function pickTargets(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    kind: i % 5 === 0 ? 'station' : 'ship',
    sx: (i * 89) % VIEWPORT.width,
    sy: (i * 53) % VIEWPORT.height,
    radiusPx: 14,
  }));
}

// =================================================================================================
// Scenarios
// =================================================================================================

const results = {};
function record(section, name, entry) {
  (results[section] = results[section] || {})[name] = entry;
}

// -------------------------------------------------------------------------------------------------
// FIXTURE SELF-CHECK — run before any measurement.
//
// The first version of this probe reported a flat entity-scaling curve. The cause was not that the
// map builders scale beautifully; it was that the fixture populated `state.entities` while the
// builders read `state.entityList`, so every "scale" was really scale zero. A perf probe that
// measures an empty scene will happily report excellent numbers forever, which is the same class of
// failure as a gate that runs in no aggregate. So the fixture proves it is populated, loudly, and
// the probe refuses to record numbers it knows are meaningless.
// -------------------------------------------------------------------------------------------------
{
  const probe = stateAtScale(200);
  const local = buildLocalModel(probe, () => false, {});
  const contacts = (local && local.contacts && local.contacts.length) || 0;
  if (contacts < 100) {
    console.error(
      `FIXTURE SELF-CHECK FAILED: stateAtScale(200) yielded only ${contacts} local contacts.\n`
      + 'The map builders are not seeing the fixture entities, so every number below would be measured\n'
      + 'against an empty scene. Check that state.entityList is populated — galaxyMap.entityIterator\n'
      + 'reads entityList BEFORE the entities Map, and createGameState ships entityList: [].',
    );
    process.exit(1);
  }
  console.log(`fixture self-check OK — stateAtScale(200) yields ${contacts} local contacts\n`);
}

// --- Atlas derivation ---------------------------------------------------------------------------
const atlas = buildAtlasIndex();
record('atlas', 'buildAtlasIndex', {
  ...timeOp(() => buildAtlasIndex(), { trials: 20 }),
  allocBytesPerOp: allocPerOp(() => buildAtlasIndex(), { iterations: 60, warmup: 5 }),
  scale: { nodes: atlas.nodes.length, edges: atlas.edges.length },
  note: 'Derived read model (ADR D2). routeFollower builds this ONCE at init, not per engage.',
});

// --- Map model construction at swept content scale ------------------------------------------------
const ENTITY_SCALES = [0, 50, 200, 800];
for (const scale of ENTITY_SCALES) {
  const state = stateAtScale(scale);
  record('mapModel', `buildGalaxyModel@${scale}`, {
    ...timeOp(() => buildGalaxyModel(state), { trials: 25, innerLoops: 4 }),
    allocBytesPerOp: allocPerOp(() => buildGalaxyModel(state)),
    scale: { entities: scale },
  });
  record('mapModel', `buildSystemModel@${scale}`, {
    ...timeOp(() => buildSystemModel(state, TETHYS, {}), { trials: 25, innerLoops: 4 }),
    allocBytesPerOp: allocPerOp(() => buildSystemModel(state, TETHYS, {})),
    scale: { entities: scale },
  });
}

// --- buildMapModel across the three zoom levels ---------------------------------------------------
// This is the whole-map path the screen actually calls, so it is the closest headless proxy for
// "map render time". Zoom selects GALAXY / SYSTEM / LOCAL, which are materially different workloads.
// The options matter: `buildMapModel` forwards `options.sectorId` to the SYSTEM branch and
// `options.isHostile` to the LOCAL branch. Passing `{}` silently measures the undefined-sector
// fallback (SECTORS[0], Helios at origin 0,0) instead of the real workload, so the options are
// spelled out here rather than defaulted.
const zoomState = stateAtScale(200);
const mapOpts = { sectorId: TETHYS, isHostile: () => false };
for (const [label, zoom] of [['galaxy', 0.8], ['system', 2.0], ['local', 4.0]]) {
  record('mapModel', `buildMapModel:${label}`, {
    ...timeOp(() => buildMapModel(zoomState, zoom, mapOpts), { trials: 25, innerLoops: 4 }),
    allocBytesPerOp: allocPerOp(() => buildMapModel(zoomState, zoom, mapOpts)),
    scale: { entities: 200, zoom },
  });
}

// --- Marker layout and clustering -----------------------------------------------------------------
// layoutMapLabels is the declutter/collision pass. It sorts and then collision-tests candidates, so
// it is the marker-layout cost the brief asks about, and the place a superlinear term would hide.
for (const count of [20, 100, 400]) {
  const candidates = labelCandidates(count);
  record('markerLayout', `layoutMapLabels@${count}`, {
    ...timeOp(() => layoutMapLabels(candidates, VIEWPORT, {}), { trials: 25, innerLoops: 4 }),
    allocBytesPerOp: allocPerOp(() => layoutMapLabels(candidates, VIEWPORT, {})),
    scale: { candidates: count },
  });
}

// --- Interaction latency (hit-test) ---------------------------------------------------------------
// pickMapTargetAt runs on pointer move/click. It is the input-to-highlight critical path.
for (const count of [50, 500]) {
  const targets = pickTargets(count);
  record('interaction', `pickMapTargetAt@${count}`, {
    ...timeOp(() => pickMapTargetAt(targets, 640, 430), { trials: 30, innerLoops: 200 }),
    allocBytesPerOp: allocPerOp(() => pickMapTargetAt(targets, 640, 430) || null, { iterations: 2000 }),
    scale: { targets: count },
    note: 'Per pointer event. Allocation here should be ~0 — it runs on every mouse move.',
  });
}

// --- Physical lane traffic ------------------------------------------------------------------------
// projectOntoLane / resolveLaneSegment run per tick while the travel drive is engaged, so any
// allocation here is per-frame churn on the hot path.
// The REAL shipped lane geometry, not a hand-built shape — a fixture that merely resembled it would
// measure a function the game never calls.
const heliosOrigin = sectorGlobalOrigin(HELIOS);
const laneGeometry = buildLaneGeometry(LANE_HELIOS_TETHYS);
const lanePos = { x: heliosOrigin.x + 4000, z: heliosOrigin.z + 2600 };
record('lane', 'projectOntoLane', {
  ...timeOp(() => projectOntoLane(laneGeometry, lanePos), { trials: 30, innerLoops: 500 }),
  allocBytesPerOp: allocPerOp(() => projectOntoLane(laneGeometry, lanePos), { iterations: 4000 }),
  note: 'Public convenience helper; the fixed-step runtime projects into retained output storage.',
});
record('lane', 'resolveLaneSegment', {
  ...timeOp(() => resolveLaneSegment(laneGeometry, lanePos), { trials: 30, innerLoops: 500 }),
  allocBytesPerOp: allocPerOp(() => resolveLaneSegment(laneGeometry, lanePos), { iterations: 4000 }),
  note: 'Public convenience helper; the fixed-step runtime uses retained output storage.',
});

// The helpers above are useful maths baselines, but this is the actual fixed-step path: drive
// modifier, authored-lane projection, six resident traffic entities, and status publication. All
// spawnable entities are pre-warmed so the row measures steady flight rather than admission work.
const laneState = createGameState(47);
const lanePlayer = {
  id: 'lane-probe-player',
  type: 'ship',
  alive: true,
  pos: {
    x: laneGeometry.from.x + laneGeometry.axis.x * 2048,
    z: laneGeometry.from.z + laneGeometry.axis.z * 2048,
  },
  vel: { x: 0, z: 0 },
  rot: 0,
  mass: 1000,
  inertia: 1000,
  // Shipped refits publish a complete derived profile; driveId resolves the same frozen catalogue
  // profile without accidentally benchmarking the partial-profile compatibility merge.
  driveId: 'drive_reaction_m',
};
laneState.playerId = lanePlayer.id;
laneState.player = {};
laneState.entities = new Map([[lanePlayer.id, lanePlayer]]);
laneState.entityList = [lanePlayer];
laneState.input = laneState.input || {};
laneState.input.travelDrive = { state: 'engaged', cap: 0 };
laneState.simTime = 120;
laneState.world = laneState.world || {};
laneState.world.currentSectorId = HELIOS;

const laneSystem = Object.create(travelLanes);
laneSystem.init({
  state: laneState,
  bus: { on() {}, emit() {} },
  helpers: { spawnEntity() { return null; } },
  registry: { get() { return null; } },
});
for (const beacon of laneSystem.geometry.beacons) {
  const id = `lane-probe-beacon-${beacon.index}`;
  laneSystem._beaconIds.set(beacon.index, id);
  laneState.entities.set(id, { id, alive: true });
}
for (let i = 0; i < 6; i += 1) {
  const id = `lane-probe-traffic-${i}`;
  laneSystem._trafficIds[i] = id;
  laneState.entities.set(id, { id, alive: true, pos: { x: 0, z: 0 }, rot: 0 });
}
const priorLaneFlag = TRAVEL_FLAGS.laneBoost;
const priorBurnFlag = TRAVEL_FLAGS.travelBurn;
TRAVEL_FLAGS.laneBoost = true;
TRAVEL_FLAGS.travelBurn = true;
const stepLaneRuntime = () => {
  laneState.simTime += 1 / 60;
  laneSystem.update(1 / 60, laneState);
  return laneState.travelLanes;
};
record('lane', 'travelLanes.update@steady', {
  ...timeOp(stepLaneRuntime, { trials: 30, innerLoops: 500 }),
  allocBytesPerOp: allocPerOp(stepLaneRuntime, { iterations: 4000 }),
  scale: { traffic: 6, beacons: laneSystem.geometry.beacons.length },
  note: 'Actual fixed-step lane path after all route entities are resident.',
});
TRAVEL_FLAGS.laneBoost = priorLaneFlag;
TRAVEL_FLAGS.travelBurn = priorBurnFlag;

// =================================================================================================
// Report
// =================================================================================================

const report = {
  schema: 'spaceface.atlasPerfBaseline.v1',
  recordedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: (cpus()[0] || {}).model || 'unknown',
    cpuCount: cpus().length,
    totalMemGB: round(totalmem() / 1024 ** 3, 1),
    gcExposed: Boolean(gc),
  },
  interpretation: {
    wallClock: 'MACHINE-RELATIVE. Recorded for trend comparison on the same host. Never gated.',
    allocation: 'MACHINE-INDEPENDENT bytes/op. This is the axis --check gates on.',
    notCovered: 'GPU time, overdraw and draw-call counts require a live WebGL context — see check:perf.',
  },
  results,
};

mkdirSync(dirname(ARTIFACT), { recursive: true });
writeFileSync(ARTIFACT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`atlas perf baseline — node ${process.version} on ${platform()}/${arch()}`);
console.log(`  cpu: ${report.environment.cpu} (${report.environment.cpuCount} threads)`);
console.log(`  gc exposed: ${report.environment.gcExposed}${gc ? '' : '  (allocation skipped — rerun with --expose-gc)'}`);
for (const [section, entries] of Object.entries(results)) {
  console.log(`\n[${section}]`);
  for (const [name, entry] of Object.entries(entries)) {
    const alloc = entry.allocBytesPerOp == null ? 'n/a' : `${entry.allocBytesPerOp} B/op`;
    console.log(`  ${name.padEnd(30)} median ${String(entry.medianMs).padStart(9)} ms   p95 ${String(entry.p95Ms).padStart(9)} ms   alloc ${alloc}`);
  }
}
console.log(`\nartifact: ${ARTIFACT}`);

if (!CHECK_MODE) {
  console.log('\nBaselines recorded (no thresholds enforced). Run with --check to gate allocation.');
  process.exit(0);
}

if (!gc) {
  console.error('\n--check requires --expose-gc: allocation cannot be measured, so nothing would be gated.');
  process.exit(1);
}
if (!existsSync(CEILINGS_PATH)) {
  console.error(`\n--check requires ${CEILINGS_PATH}`);
  process.exit(1);
}
const ceilings = JSON.parse(readFileSync(CEILINGS_PATH, 'utf8'));
const violations = [];
for (const [key, ceiling] of Object.entries(ceilings.ceilings || {})) {
  const [section, name] = key.split('/');
  const entry = results[section] && results[section][name];
  if (!entry) {
    violations.push(`${key}: ceiling declared but the scenario did not run — the probe and the ceilings have drifted`);
    continue;
  }
  if (entry.allocBytesPerOp == null) {
    violations.push(`${key}: allocation was not measured`);
    continue;
  }
  if (entry.allocBytesPerOp > ceiling.maxBytesPerOp) {
    violations.push(`${key}: ${entry.allocBytesPerOp} B/op exceeds ceiling ${ceiling.maxBytesPerOp} B/op — ${ceiling.why}`);
  }
}
if (violations.length) {
  console.error('\nALLOCATION CEILING VIOLATIONS:');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('\nAllocation churn on a per-frame path is what produces hitches. Do not raise a ceiling');
  console.error('to make this pass without a recorded justification — reduce the allocation instead.');
  process.exit(1);
}
console.log(`\nAllocation OK — ${Object.keys(ceilings.ceilings || {}).length} ceilings enforced, none exceeded.`);
