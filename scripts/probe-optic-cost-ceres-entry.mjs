#!/usr/bin/env node
// OPTIC-COST acceptance trace — build_map §24 "Collider cost" / §1C row 54.
//
// The §24 guard: "A Ceres entry trace names the optic bodies' cost. Scatter stays
// off until that cost fits the frame." The trace was never produced while scatter
// shipped live, so this probe produces it: a fixed-seed, headless A/B that names
// what the 42 live Ceres gallery bodies cost the sim, at the three moments a
// player meets them —
//
//   1. CERES ENTRY   enterSector('sector_ceres_belt') stamps the gallery through
//                    _ensureOpticStructures (42 insertAsteroidFieldRock calls) on
//                    the materialization frame.
//   2. QUIET BELT    the player parked at the sector entry point, lattice still
//                    field-resident: the per-tick tickOpticFieldRocks cost of 42
//                    extra compact records (quiet latch is production default ON).
//   3. AT THE GALLERY the player parked inside the authored decode disc: the
//                    promote-burst tick (up to 42 compact records become live
//                    combat asteroids in one tick) and the promoted steady state.
//
// Each moment is measured as an A/B against a sibling boot on the same seed with
// ONLY the optic stamp suppressed (world._ensureOpticStructures stubbed, the same
// control optic-seeded-scatter.test.mjs uses) — so the delta is the optic bodies'
// share, not residency noise. A fourth section counts what seeded scatter adds to
// an ordinary belt, to tie the 42-body anchor to the guard the row protects.
//
//   node scripts/probe-optic-cost-ceres-entry.mjs [--repeats=N]
//
// Writes .devshots/optic-cost/<stamp>.json and prints the numbers. The frame
// budget reference is one 60 Hz frame: 16.667 ms.

import { mkdirSync, writeFileSync } from 'node:fs';
import { hrtime } from 'node:process';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { asteroidFieldCensus } from '../src/world/asteroidField.js';
import {
  CERES_PRISM_GALLERY_ID,
  CERES_PRISM_GALLERY_ORIGIN,
  opticStructuresFor,
} from '../src/data/opticStructures.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = `${ROOT}.devshots/optic-cost`;
const SEED = 4242;
const DT = 1 / 60;
const FRAME_BUDGET_MS = 1000 / 60;
const CERES = 'sector_ceres_belt';
const CHARON = 'sector_charon_expanse';
const QUIET_TICKS = 600; // 10 sim-seconds per timed window

const REPEATS = Math.max(1, Number((process.argv.find((a) => a.startsWith('--repeats=')) || '')
  .slice('--repeats='.length)) || 15);

const nowNs = () => hrtime.bigint();
const ms = (ns) => Number(ns) / 1e6;

function median(sorted) {
  if (!sorted.length) return 0;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The optic-test boot: real core + real world system on a fixed seed, no renderer.
 * `suppressOptic` stubs ONLY the optic stamp (world.js `_ensureOpticStructures`) —
 * the rock draw, residency plan, and every other subsystem are identical, which is
 * what makes the A/B delta attributable to the 42 optic bodies.
 */
function boot(seed, suppressOptic) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.maxSpeed = 160;
  const world = Object.assign(Object.create(worldSystem), {});
  world.stampNs = 0;
  if (suppressOptic) {
    world._ensureOpticStructures = () => {};
  } else {
    const orig = world._ensureOpticStructures;
    world._ensureOpticStructures = function (sector, active) {
      const t0 = nowNs();
      const out = orig.call(this, sector, active);
      this.stampNs += Number(nowNs() - t0);
      return out;
    };
  }
  world.init(ctx);
  return { state, world, bus, helpers, player };
}

function opticFieldRecords(state, sectorId) {
  const field = state.world && state.world.asteroidField;
  return ((field && field.rocks) || []).filter(
    (r) => r.alive !== false && r.data && r.data.opticStructureId
      && (r.homeSectorId === sectorId || (r.data && r.data.homeSectorId === sectorId)),
  );
}

function liveOpticEntities(state, sectorId) {
  return (state.entityList || []).filter(
    (e) => e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.opticStructureId
      && (!sectorId || e.homeSectorId === sectorId || (e.data && e.data.homeSectorId === sectorId)),
  );
}

function tickOnce(state, world) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + DT;
  world.update(DT, state);
}

function runWindows(state, world, windows, ticksPerWindow) {
  const samples = [];
  for (let w = 0; w < windows; w++) {
    const t0 = nowNs();
    for (let i = 0; i < ticksPerWindow; i++) tickOnce(state, world);
    samples.push(ms(nowNs() - t0) / ticksPerWindow);
  }
  return samples;
}

// ── Scenario 1: the Ceres entry frame ────────────────────────────────────────
function traceEntry() {
  const prod = [];
  const supp = [];
  let stampSamples = [];
  let census = null;
  // 3 warmup boots per arm, then timed boots. Timing order alternates per repeat
  // so neither arm systematically pays the previous boot's GC.
  for (let r = 0; r < REPEATS + 3; r++) {
    const warm = r < 3;
    const withOptic = boot(SEED, false);
    const without = boot(SEED, true);
    const firstIsProd = r % 2 === 0;
    const t0 = nowNs();
    (firstIsProd ? withOptic : without).world.enterSector(CERES);
    const dFirst = ms(nowNs() - t0);
    const t1 = nowNs();
    (firstIsProd ? without : withOptic).world.enterSector(CERES);
    const dSecond = ms(nowNs() - t1);
    const dProd = firstIsProd ? dFirst : dSecond;
    const dSupp = firstIsProd ? dSecond : dFirst;
    const stampMs = ms(withOptic.world.stampNs);
    const recs = opticFieldRecords(withOptic.state, CERES).length;
    if (!warm) { prod.push(dProd); supp.push(dSupp); stampSamples.push(stampMs); }
    if (!census) {
      census = {
        opticStructureIds: opticStructuresFor(CERES).map((s) => s.id),
        stampedRecords: recs,
        liveOpticAtEntry: liveOpticEntities(withOptic.state, CERES).length,
        fieldCensus: asteroidFieldCensus(withOptic.state),
        stampBreakdownMs: stampMs,
      };
    }
    const recsSupp = opticFieldRecords(without.state, CERES).length;
    if (recsSupp !== 0) throw new Error(`control leak: ${recsSupp} optic records with stamp suppressed`);
  }
  const p = [...prod].sort((a, b) => a - b);
  const s = [...supp].sort((a, b) => a - b);
  const st = [...stampSamples].sort((a, b) => a - b);
  return {
    enterSectorWithGalleryMs: { median: median(p), min: p[0], max: p[p.length - 1], n: p.length },
    enterSectorGallerySuppressedMs: { median: median(s), min: s[0], max: s[s.length - 1], n: s.length },
    opticStampShareMs: {
      median: median(st),
      min: st[0],
      medianDelta: median(p) - median(s),
    },
    census,
  };
}

// ── Scenario 2: quiet belt, lattice field-resident ───────────────────────────
function traceQuiet() {
  const out = {};
  for (const [arm, suppress] of [['withGallery', false], ['gallerySuppressed', true]]) {
    const { state, world } = boot(SEED, suppress);
    world.enterSector(CERES);
    for (let i = 0; i < 30; i++) tickOnce(state, world); // settle residency queue
    const samples = runWindows(state, world, 5, QUIET_TICKS).sort((a, b) => a - b);
    out[arm] = {
      perTickMs: { median: median(samples), min: samples[0] },
      opticFieldRecords: opticFieldRecords(state, CERES).length,
      liveOptic: liveOpticEntities(state, CERES).length,
      fieldCensus: asteroidFieldCensus(state),
    };
  }
  return out;
}

// ── Scenario 3: parked at the gallery, decode disc promotes the lattice ──────
// The promote-burst tick is measured over fresh boots per arm (the burst only
// happens on first arrival) so the median is not one GC-struck sample; the
// suppressed arm's burst names the share that is actually the 42 spawns.
function traceGallery() {
  const out = {};
  const bursts = { withGallery: [], gallerySuppressed: [] };
  for (let r = 0; r < REPEATS; r++) {
    for (const [arm, suppress] of [['withGallery', false], ['gallerySuppressed', true]]) {
      const { state, world, player } = boot(SEED, suppress);
      world.enterSector(CERES);
      for (let i = 0; i < 30; i++) tickOnce(state, world);
      const g = sectorLocalToGlobalForSector(CERES_PRISM_GALLERY_ORIGIN, CERES);
      player.pos.x = g.x;
      player.pos.z = g.z;
      const t0 = nowNs();
      tickOnce(state, world); // the promote-burst tick
      bursts[arm].push(ms(nowNs() - t0));
    }
  }
  for (const [arm, suppress] of [['withGallery', false], ['gallerySuppressed', true]]) {
    const { state, world, player } = boot(SEED, suppress);
    world.enterSector(CERES);
    for (let i = 0; i < 30; i++) tickOnce(state, world);
    const g = sectorLocalToGlobalForSector(CERES_PRISM_GALLERY_ORIGIN, CERES);
    player.pos.x = g.x;
    player.pos.z = g.z;
    tickOnce(state, world); // settle the burst before the steady windows
    const promotedNow = liveOpticEntities(state, CERES).length;
    const samples = runWindows(state, world, 5, QUIET_TICKS).sort((a, b) => a - b);
    const b = [...bursts[arm]].sort((a, b2) => a - b2);
    out[arm] = {
      promoteBurstTickMs: { median: median(b), min: b[0], n: b.length },
      promotedOpticBodies: promotedNow,
      perTickMs: { median: median(samples), min: samples[0] },
      fieldCensus: asteroidFieldCensus(state),
    };
  }
  return out;
}

// ── Scenario 4: what seeded scatter adds to an ordinary belt ─────────────────
function traceScatterAnchor() {
  const { state, world } = boot(SEED, false);
  world.enterSector(CHARON);
  const cells = opticFieldRecords(state, CHARON);
  const byStructure = new Map();
  for (const r of cells) {
    const id = r.data.opticStructureId;
    byStructure.set(id, (byStructure.get(id) || 0) + 1);
  }
  const ceres = boot(SEED, false);
  ceres.world.enterSector(CERES);
  return {
    sector: CHARON,
    seed: SEED,
    scatterCells: cells.length,
    lattices: [...byStructure.entries()].map(([id, n]) => ({ id, cells: n })),
    ceresAnchorCells: opticFieldRecords(ceres.state, CERES).length,
  };
}

const entry = traceEntry();
const quiet = traceQuiet();
const gallery = traceGallery();
const scatter = traceScatterAnchor();

const quietDeltaMs = quiet.withGallery.perTickMs.median - quiet.gallerySuppressed.perTickMs.median;
const galleryDeltaMs = gallery.withGallery.perTickMs.median - gallery.gallerySuppressed.perTickMs.median;
const burstDeltaMs = gallery.withGallery.promoteBurstTickMs.median
  - gallery.gallerySuppressed.promoteBurstTickMs.median;

const report = {
  schema: 'spaceface.opticCostCeresEntry.v1',
  date: new Date().toISOString().slice(0, 10),
  seed: SEED,
  frameBudgetMs: Number(FRAME_BUDGET_MS.toFixed(3)),
  entry: entry.census,
  entryTiming: {
    enterSectorWithGalleryMs: entry.enterSectorWithGalleryMs,
    enterSectorGallerySuppressedMs: entry.enterSectorGallerySuppressedMs,
    opticStampShareMs: entry.opticStampShareMs,
  },
  quietBelt: quiet,
  quietDeltaPerTickMs: quietDeltaMs,
  atGallery: gallery,
  galleryDeltaPerTickMs: galleryDeltaMs,
  scatterAnchor: scatter,
  verdict: {
    // Filled by the caller below.
  },
};

// The §24 judgment: does each optic-attributable cost fit one 60 Hz frame?
// The promoted steady state is the real steady cost (the quiet arm measures the
// latch, which is ~0 within noise); report it as the steady figure.
const steadyDeltaMs = galleryDeltaMs;
const burst = gallery.withGallery.promoteBurstTickMs.median;
report.verdict = {
  fitsFrame: {
    entryStampMs: entry.opticStampShareMs.median < FRAME_BUDGET_MS,
    promoteBurstTickMs: burst < FRAME_BUDGET_MS,
    steadyPerTickDeltaMs: steadyDeltaMs < FRAME_BUDGET_MS,
  },
  numbers: {
    opticStampShareMedianMs: Number(entry.opticStampShareMs.median.toFixed(3)),
    promoteBurstTickMs: Number(burst.toFixed(3)),
    promoteBurstShareMs: Number(burstDeltaMs.toFixed(3)),
    steadyPerTickDeltaMs: Number(steadyDeltaMs.toFixed(4)),
    quietPerTickDeltaMs: Number(quietDeltaMs.toFixed(4)),
    promotedOpticBodies: gallery.withGallery.promotedOpticBodies,
    stampedRecords: entry.census.stampedRecords,
  },
};

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = `${OUT_DIR}/${stamp}.json`;
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

const f = (x, d = 3) => Number(x).toFixed(d);
console.log('OPTIC-COST — Ceres entry trace (seed', SEED, ', frame budget', f(FRAME_BUDGET_MS), 'ms)');
console.log('');
console.log('Census:', JSON.stringify(report.entry));
console.log('');
console.log('1. Ceres entry frame');
console.log(`   enterSector with gallery    : median ${f(entry.enterSectorWithGalleryMs.median)} ms  (min ${f(entry.enterSectorWithGalleryMs.min)}, n=${entry.enterSectorWithGalleryMs.n})`);
console.log(`   enterSector stamp suppressed: median ${f(entry.enterSectorGallerySuppressedMs.median)} ms  (min ${f(entry.enterSectorGallerySuppressedMs.min)})`);
console.log(`   optic stamp share (_ensureOpticStructures): median ${f(entry.opticStampShareMs.median)} ms`);
console.log('');
console.log('2. Quiet belt (player at entry point, lattice field-resident)');
console.log(`   per-tick with gallery    : median ${f(quiet.withGallery.perTickMs.median, 4)} ms`);
console.log(`   per-tick stamp suppressed: median ${f(quiet.gallerySuppressed.perTickMs.median, 4)} ms`);
console.log(`   optic delta              : ${f(quietDeltaMs, 4)} ms/tick`);
console.log('');
console.log('3. Parked at the gallery (decode disc)');
console.log(`   promote-burst tick       : median ${f(burst)} ms  (suppressed arm median ${f(gallery.gallerySuppressed.promoteBurstTickMs.median)} ms; optic share ${f(burstDeltaMs)} ms; n=${gallery.withGallery.promoteBurstTickMs.n})`);
console.log(`   promoted ${gallery.withGallery.promotedOpticBodies} bodies`);
console.log(`   per-tick with gallery    : median ${f(gallery.withGallery.perTickMs.median, 4)} ms`);
console.log(`   per-tick stamp suppressed: median ${f(gallery.gallerySuppressed.perTickMs.median, 4)} ms`);
console.log(`   optic delta              : ${f(galleryDeltaMs, 4)} ms/tick`);
console.log('');
console.log('4. Seeded scatter anchor:', JSON.stringify(scatter));
console.log('');
console.log('Verdict:', JSON.stringify(report.verdict.fitsFrame), JSON.stringify(report.verdict.numbers));
console.log('Artifact:', outPath);
