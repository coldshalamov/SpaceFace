#!/usr/bin/env node
// Spatial truth — the frame contract generalized beyond the two sectors that already had a guard.
//
// WHY THIS EXISTS BESIDE check:map-frames (it extends, it does not duplicate).
//
// `scripts/check-map-frames.mjs` is the lead's bidirectional guard on the SYSTEM map model, and it is
// sound. But it is parameterized over exactly two sectors: Helios Prime at origin (0,0) — where this
// entire class of bug is INVISIBLE — and Tethys Junction at (+12288, +8192). Two samples, both with
// non-negative coordinates, cannot distinguish these three implementations:
//
//     global = local + origin          (correct)
//     global = local + |origin|        (identical on +,+ and 0,0 — wrong everywhere else)
//     global = local + max(origin, 0)  (identical on +,+ and 0,0 — wrong everywhere else)
//
// An `abs()` or a `Math.max(0, …)` slipped into a boundary conversion therefore passes the existing
// guard on every sector it covers, and mislocates the player by up to 57,344 WU in the eight sectors
// authored at negative x. This file closes that hole by driving the SAME real `buildSystemModel`
// across ALL SIX origin sign classes present in the authored lattice:
//
//     0,0   sector_helios_prime      (      0,      0)   the blind spot
//     +,+   sector_tethys_junction   (  12288,   8192)   where the original defect bit
//     -,+   sector_ceres_belt        ( -12288,   8192)   NEGATIVE x — the packet's canonical case
//     +,-   sector_dione_lane        (  32768,  -4096)   NEGATIVE z, and the largest |x| authored
//     -,0   sector_hyperion_cut      ( -28672,      0)   negative x against a ZERO z
//     0,+   sector_vesta_forge       (      0,  16384)   zero x against a positive z
//
// The mixed-sign and axis-zero cases matter independently: a conversion that sign-flips one axis, or
// that special-cases a zero component, survives every same-sign sample.
//
// GRADER ASSUMPTIONS (stated, per the program's evaluation principles):
//   - Authored data is the live `src/data/sectors.js` + `sectorZones.js`, not a fixture copy. If a
//     sector is re-authored to a different origin the sign-class table above must be re-derived; the
//     check asserts each named sector still has the sign class it is listed under, so drift is loud.
//   - The Atlas is a pure derived read model (ADR D2) — it does not tick and has no runtime state, so
//     rebuild-determinism is a legitimate stand-in for "content reload".
//   - The performance budget below is wall-clock on the developer machine and is deliberately loose;
//     it is a guard against accidental O(n^2)-per-query regressions, NOT a benchmark.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
  globalToSectorLocalForSector,
} from '../src/data/sectorCoordinates.js';

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

/** Every origin sign class authored into the lattice, with the sign it must keep. */
const SIGN_CLASSES = Object.freeze([
  { sectorId: 'sector_helios_prime', sign: '0,0', note: 'the blind spot — origin IS (0,0)' },
  { sectorId: 'sector_tethys_junction', sign: '+,+', note: 'where the original defect bit' },
  { sectorId: 'sector_ceres_belt', sign: '-,+', note: 'NEGATIVE x' },
  { sectorId: 'sector_dione_lane', sign: '+,-', note: 'NEGATIVE z, largest |x|' },
  { sectorId: 'sector_hyperion_cut', sign: '-,0', note: 'negative x, zero z' },
  { sectorId: 'sector_vesta_forge', sign: '0,+', note: 'zero x, positive z' },
]);

const LIVE_ENTITY_ID = 99;
const PLAYER_ID = 1;
const PLAYER_LOCAL = Object.freeze({ x: 120, z: -80 });
const LIVE_LOCAL = Object.freeze({ x: -640, z: 910 });

function signOf(n) {
  return n < 0 ? '-' : n > 0 ? '+' : '0';
}

function sectorRecord(sectorId) {
  const record = SECTORS.find((s) => s.id === sectorId);
  assert.ok(record, `fixture depends on authored sector ${sectorId}`);
  return record;
}

/** State carrying a player and a live station, both stamped into `sectorId`. */
function stateFixture(sectorId, { playerLocal = PLAYER_LOCAL, live = true } = {}) {
  const entityList = [];
  if (playerLocal) {
    const g = sectorLocalToGlobalForSector(playerLocal, sectorId);
    entityList.push({
      id: PLAYER_ID, type: 'ship', alive: true, pos: { x: g.x, z: g.z }, rot: 0.5,
      homeSectorId: sectorId, data: { homeSectorId: sectorId },
    });
  }
  if (live) {
    const g = sectorLocalToGlobalForSector(LIVE_LOCAL, sectorId);
    entityList.push({
      id: LIVE_ENTITY_ID, type: 'station', alive: true, pos: { x: g.x, z: g.z },
      homeSectorId: sectorId,
      data: { stationId: 'station_spatial_probe', name: 'Spatial Probe', homeSectorId: sectorId },
    });
  }
  return {
    world: { currentSectorId: sectorId, sectors: {} },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    playerId: playerLocal ? PLAYER_ID : null,
  };
}

// ---------------------------------------------------------------------------
// (1) The sign-class table is real. If content moves a sector, fail loudly here rather than
//     silently reducing this file's coverage to the same two sectors map-frames already had.
// ---------------------------------------------------------------------------
function testSignClassesAreDistinct() {
  const seen = new Set();
  for (const { sectorId, sign } of SIGN_CLASSES) {
    sectorRecord(sectorId);
    const origin = sectorGlobalOrigin(sectorId);
    assert.ok(origin, `${sectorId}: must have a frozen global origin`);
    const actual = `${signOf(origin.x)},${signOf(origin.z)}`;
    assert.equal(actual, sign,
      `${sectorId} is listed as sign class ${sign} but its origin (${origin.x}, ${origin.z}) is ${actual}`
      + ' — re-derive SIGN_CLASSES, do not relabel the row');
    assert.ok(!seen.has(sign), `sign class ${sign} is covered twice; each row must add new coverage`);
    seen.add(sign);
  }
  // The whole point: coverage must include a negative component on each axis independently.
  assert.ok([...seen].some((s) => s.startsWith('-')), 'coverage must include a NEGATIVE x origin');
  assert.ok([...seen].some((s) => s.endsWith('-')), 'coverage must include a NEGATIVE z origin');
  assert.ok(seen.size >= 6, `expected all six authored sign classes, covered ${seen.size}`);
  ok(`sign-class table matches authored origins — ${seen.size} distinct classes including negatives`);
}

// ---------------------------------------------------------------------------
// (2) The two-frame contract holds in EVERY sign class, for every point, live and static.
//     x/z GLOBAL (the nav frame) · drawPos SECTOR-LOCAL (the draw frame), differing by exactly
//     the sector origin — signed, with zero tolerance.
// ---------------------------------------------------------------------------
function testTwoFrameContractEverySignClass() {
  for (const { sectorId, sign, note } of SIGN_CLASSES) {
    const origin = sectorGlobalOrigin(sectorId);
    const bound = Number(sectorRecord(sectorId).worldRadius) || 4000;
    const model = buildSystemModel(stateFixture(sectorId), sectorId);

    const provenance = new Set();
    let positioned = 0;
    for (const p of model.points) {
      provenance.add(p.entityId != null ? 'live' : p.kind);
      if (!p.drawPos) {
        assert.equal(p.x, null, `${sectorId}/${p.id}: no drawPos means no global x either`);
        assert.equal(p.z, null, `${sectorId}/${p.id}: no drawPos means no global z either`);
        continue;
      }
      positioned++;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z),
        `${sectorId}/${p.id}: a drawable point must carry a finite global x/z for nav`);
      // Signed difference. An abs()/max(0,…) in the conversion changes this on negative origins only.
      assert.equal(p.x - p.drawPos.x, origin.x,
        `${sectorId} [${sign}] ${p.id}: x must be drawPos.x + origin.x (${origin.x}); a magnitude-only`
        + ' conversion passes on +,+ and 0,0 and fails exactly here');
      assert.equal(p.z - p.drawPos.z, origin.z,
        `${sectorId} [${sign}] ${p.id}: z must be drawPos.z + origin.z (${origin.z})`);
      assert.ok(Math.hypot(p.drawPos.x, p.drawPos.z) <= bound,
        `${sectorId} [${sign}] ${p.id}: drawPos escaped worldRadius ${bound} — a global position`
        + ' leaked into the draw frame');
    }

    assert.ok(positioned >= 3, `${sectorId}: expected several positioned points, saw ${positioned}`);
    for (const required of ['live', 'station', 'gate']) {
      assert.ok(provenance.has(required),
        `${sectorId}: contract must be exercised on ${required} provenance (saw ${[...provenance].join(', ')})`);
    }

    // The player mark carries the same two-frame shape as every other mark.
    assert.ok(model.player, `${sectorId}: system model must carry a player mark (${note})`);
    assert.equal(model.player.inSector, true, `${sectorId}: player is standing in this sector`);
    assert.deepEqual(
      { x: model.player.drawPos.x, z: model.player.drawPos.z },
      { x: PLAYER_LOCAL.x, z: PLAYER_LOCAL.z },
      `${sectorId} [${sign}]: player draws at its authored sector-local point`,
    );
    assert.equal(model.player.x - model.player.drawPos.x, origin.x,
      `${sectorId} [${sign}]: player x is global, like every other mark`);
    assert.equal(model.player.z - model.player.drawPos.z, origin.z,
      `${sectorId} [${sign}]: player z is global, like every other mark`);

    // Zones are authored sector-local and drawn directly; they must share the draw frame.
    for (const zone of model.zones || []) {
      assert.ok(Math.hypot(zone.x, zone.z) - (zone.radius || 0) <= bound * 2,
        `${sectorId} [${sign}]: zone ${zone.id} is not in the sector-local draw frame`);
    }
  }
  ok(`two-frame contract holds in all ${SIGN_CLASSES.length} sign classes, live + static + player`);
}

// ---------------------------------------------------------------------------
// (3) TEETH. A guard nobody has seen fail is a guard nobody has tested.
//     Re-derive each point the two wrong ways and prove the assertion above rejects them at a
//     NEGATIVE origin while being fooled at (0,0) and (+,+) — which is precisely why the existing
//     two-sector guard could not have caught this.
// ---------------------------------------------------------------------------
function testMutationControl() {
  const magnitudeOnly = (local, origin) => ({
    x: local.x + Math.abs(origin.x), z: local.z + Math.abs(origin.z),
  });
  const clampedToPositive = (local, origin) => ({
    x: local.x + Math.max(0, origin.x), z: local.z + Math.max(0, origin.z),
  });

  for (const [label, mutate] of [['abs(origin)', magnitudeOnly], ['max(0, origin)', clampedToPositive]]) {
    const fooled = [];
    const caught = [];
    for (const { sectorId, sign } of SIGN_CLASSES) {
      const origin = sectorGlobalOrigin(sectorId);
      const wrong = mutate(PLAYER_LOCAL, origin);
      const correct = sectorLocalToGlobalForSector(PLAYER_LOCAL, sectorId);
      (wrong.x === correct.x && wrong.z === correct.z ? fooled : caught).push(sign);
    }
    // The exact property that makes the extra sectors load-bearing.
    assert.ok(fooled.includes('0,0') && fooled.includes('+,+'),
      `${label}: must be INDISTINGUISHABLE on the two sectors map-frames already covered`
      + ` (fooled: ${fooled.join(' ')})`);
    assert.ok(caught.includes('-,+'),
      `${label}: must be CAUGHT at the negative-x origin this file adds (caught: ${caught.join(' ')})`);
    assert.ok(caught.length >= 3,
      `${label}: expected the added sign classes to catch it, caught only ${caught.join(' ')}`);
  }
  ok('mutation control: abs()/max(0,·) conversions slip past 0,0 and +,+ and are caught by the added classes');
}

// ---------------------------------------------------------------------------
// (4) Round-trip local <-> global is EXACT for every authored sector.
//     Lattice origins are integers, so this is integer addition; any tolerance would be hiding
//     something. Extreme magnitudes included — a conversion routed through a float32 buffer or a
//     normalized vector loses exactness here first.
// ---------------------------------------------------------------------------
function testRoundTripExactness() {
  const probes = [
    { x: 0, z: 0 },
    { x: 4000, z: -4000 },
    { x: -3999.5, z: 2750.25 },
    { x: 1e6, z: -1e6 },
    { x: -0.0009765625, z: 0.0009765625 }, // exact binary fractions; a rounding step breaks these
  ];
  let sectorsCovered = 0;
  for (const sector of SECTORS) {
    const origin = sectorGlobalOrigin(sector.id);
    if (!origin) continue;
    sectorsCovered++;
    for (const local of probes) {
      const global = sectorLocalToGlobalForSector(local, sector.id);
      assert.equal(global.x, local.x + origin.x, `${sector.id}: local->global x must be a signed sum`);
      assert.equal(global.z, local.z + origin.z, `${sector.id}: local->global z must be a signed sum`);
      const back = globalToSectorLocalForSector(global, sector.id);
      assert.equal(back.x, local.x,
        `${sector.id}: round-trip must be EXACT at local x=${local.x} (origin ${origin.x})`);
      assert.equal(back.z, local.z,
        `${sector.id}: round-trip must be EXACT at local z=${local.z} (origin ${origin.z})`);
    }
  }
  assert.ok(sectorsCovered >= 20,
    `round-trip must cover the authored lattice, covered only ${sectorsCovered} sectors`);
  ok(`local <-> global round-trips exactly across ${sectorsCovered} sectors x ${probes.length} probes`);
}

// ---------------------------------------------------------------------------
// (5) Stable ids and determinism across a content reload.
//     The Atlas is the durable strategic substrate (ADR D2); its whole contract is id-stable nodes
//     and edges. A rebuild must be byte-identical, and every id must be unique and non-positional —
//     an id derived from a coordinate silently changes when content is nudged.
// ---------------------------------------------------------------------------
function testAtlasIdStability() {
  const first = buildAtlasIndex();
  const second = buildAtlasIndex();

  assert.deepEqual(second.toJSON(), first.toJSON(),
    'rebuilding the atlas must be deterministic — a reload may not reshuffle the substrate');

  const ids = first.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'every atlas node id must be unique');
  assert.deepEqual(ids, [...ids].sort(),
    'node ordering must be derived from ids, never authoring order');

  const edgeIds = first.edges.map((e) => e.id);
  assert.equal(new Set(edgeIds).size, edgeIds.length, 'every atlas edge id must be unique');

  // Ids must not encode coordinates: moving a station must not rename its node.
  for (const node of first.nodes) {
    if (!node.hasPosition) continue;
    const { x, z } = node.globalPos;
    for (const component of [x, z]) {
      if (!Number.isFinite(component) || Math.abs(component) < 100) continue;
      assert.ok(!node.id.includes(String(Math.round(component))),
        `${node.id}: an atlas id must not embed its coordinate — moving the place would rename it`);
    }
  }

  // Every edge endpoint resolves. A dangling endpoint is a route the follower cannot fly.
  for (const edge of first.edges) {
    for (const endpoint of [edge.a, edge.b]) {
      assert.ok(first.getNode(endpoint) || SECTORS.some((s) => s.id === endpoint),
        `edge ${edge.id} references unknown endpoint ${endpoint}`);
    }
  }

  // Positioned nodes must agree with their own sector's frame — the atlas is the boundary converter.
  let positioned = 0;
  for (const node of first.nodes) {
    if (!node.hasPosition || node.kind === 'sector') continue;
    const origin = sectorGlobalOrigin(node.sectorId);
    if (!origin) continue;
    positioned++;
    const local = globalToSectorLocalForSector(node.globalPos, node.sectorId);
    const bound = (Number(SECTORS.find((s) => s.id === node.sectorId)?.worldRadius) || 4000) * 3;
    assert.ok(Math.hypot(local.x, local.z) <= bound,
      `${node.id}: global position is ${Math.hypot(local.x, local.z).toFixed(0)} WU from its own`
      + ` sector origin — beyond ${bound}, which means the boundary conversion was skipped or doubled`);
  }
  assert.ok(positioned >= 20, `expected many positioned atlas nodes, saw ${positioned}`);

  ok(`atlas ids stable + unique + non-positional; rebuild deterministic; ${positioned} nodes in-frame`);
}

// ---------------------------------------------------------------------------
// (6) Query performance at authored content scale.
//     Budgets are LOOSE on purpose — this guards against an accidental O(n^2) per query, not
//     against a slow machine. Median of several trials, so one GC pause cannot fail the gate.
// ---------------------------------------------------------------------------
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function testQueryPerformance() {
  const atlas = buildAtlasIndex();
  const nodeCount = atlas.nodes.length;
  const TRIALS = 5;
  const QUERIES = 2000;

  const probePositions = [];
  for (let i = 0; i < QUERIES; i++) {
    const angle = (i / QUERIES) * Math.PI * 2;
    probePositions.push({ x: Math.cos(angle) * 40000, z: Math.sin(angle) * 40000 });
  }

  const nearestTrials = [];
  for (let t = 0; t < TRIALS; t++) {
    const started = process.hrtime.bigint();
    for (const pos of probePositions) atlas.nearestNode(pos);
    nearestTrials.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const nearestMs = median(nearestTrials);
  const NEAREST_BUDGET_MS = 1500;
  assert.ok(nearestMs < NEAREST_BUDGET_MS,
    `nearestNode x${QUERIES} took ${nearestMs.toFixed(1)}ms (median of ${TRIALS}), budget ${NEAREST_BUDGET_MS}ms`);

  // Indexed lookups must be constant-time — they are Map reads, so a regression here means someone
  // replaced an index with a scan.
  const lookupIds = atlas.nodes.map((n) => n.id);
  const lookupTrials = [];
  for (let t = 0; t < TRIALS; t++) {
    const started = process.hrtime.bigint();
    for (let i = 0; i < 20000; i++) atlas.getNode(lookupIds[i % lookupIds.length]);
    lookupTrials.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const lookupMs = median(lookupTrials);
  const LOOKUP_BUDGET_MS = 400;
  assert.ok(lookupMs < LOOKUP_BUDGET_MS,
    `getNode x20000 took ${lookupMs.toFixed(1)}ms (median of ${TRIALS}), budget ${LOOKUP_BUDGET_MS}ms`
    + ' — an indexed lookup must not become a scan');

  // Building the whole index is startup cost; it must stay well inside a frame budget * a few.
  const buildTrials = [];
  for (let t = 0; t < TRIALS; t++) {
    const started = process.hrtime.bigint();
    buildAtlasIndex();
    buildTrials.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  const buildMs = median(buildTrials);
  const BUILD_BUDGET_MS = 500;
  assert.ok(buildMs < BUILD_BUDGET_MS,
    `buildAtlasIndex took ${buildMs.toFixed(1)}ms (median of ${TRIALS}), budget ${BUILD_BUDGET_MS}ms`);

  console.log(
    `       scale: ${nodeCount} nodes / ${atlas.edges.length} edges · `
    + `nearest x${QUERIES} ${nearestMs.toFixed(1)}ms · getNode x20000 ${lookupMs.toFixed(1)}ms · `
    + `build ${buildMs.toFixed(1)}ms (medians of ${TRIALS})`,
  );
  ok('atlas queries stay inside their budgets at authored content scale');
}

// ---------------------------------------------------------------------------
// (7) Registration — a check nobody runs is indistinguishable from one that does not exist.
// ---------------------------------------------------------------------------
function testRegistration() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:atlas-spatial-truth'], 'node scripts/check-atlas-spatial-truth.mjs',
    'package must expose check:atlas-spatial-truth');
  assert.ok(String(pkg.scripts['check:atlas'] || '').includes('npm run check:atlas-spatial-truth'),
    'check:atlas-spatial-truth must be reachable from the check:atlas aggregate, or it gates nothing');
  ok('check is registered and reachable from the check:atlas aggregate');
}

testSignClassesAreDistinct();
testTwoFrameContractEverySignClass();
testMutationControl();
testRoundTripExactness();
testAtlasIdStability();
testQueryPerformance();
testRegistration();

console.log(`Atlas spatial truth OK — ${sections} sections across ${SIGN_CLASSES.length} origin sign classes.`);
