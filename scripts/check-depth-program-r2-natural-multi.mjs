#!/usr/bin/env node
// R2 natural multi-seed check skeleton (partial).
//
// Goal: ride scripts/lib/naturalRoute.mjs for a multi-wreck / multi-seed sweep
// without SF injection as the primary drive. D10 is always included (F1 §8).
//
// Status: SKELETON — boots Tier-A sessions per seed, installs observers, steps
// a short soak, and records structural evidence. Full rumor→bearing→scan→claim
// uninjected steps per wreck are residual (route configs under scripts/routes/).
//
// Not yet wired into package.json acceptance; safe to run standalone for smoke.
//
// Usage:
//   node scripts/check-depth-program-r2-natural-multi.mjs
//   NATURAL_ROUTE_SEED_MODE=ci|held-out|full node scripts/check-depth-program-r2-natural-multi.mjs

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import {
  CONTENT_CLASSES,
  D10_CARRIER,
  D10_CI_SEEDS,
  D10_ROUTE_ID,
  NATURAL_ROUTE_SCHEMA,
  REQUIRED_MARKS_BY_CLASS,
  createTierASession,
  defineRoute,
  loadHeldOutSeeds,
  resolveSeedSet,
  runMultiSeed,
  writeEvidence,
} from './lib/naturalRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots/depth-program/routes');
const AGGREGATE = resolve(ROOT, '.devshots/depth-program/r2-natural-multi-skeleton.json');

const SEED_MODE = String(process.env.NATURAL_ROUTE_SEED_MODE || 'ci').toLowerCase();
const SKELETON_TICKS = Number(process.env.NATURAL_ROUTE_SKELETON_TICKS || 30);

/** Partial wreck roster — D10 first; expand with remaining R2 slots later. */
const WRECK_SLOTS = Object.freeze([
  Object.freeze({
    routeId: D10_ROUTE_ID,
    wreckId: D10_CARRIER.wreckId,
    sectorId: D10_CARRIER.sectorId,
    slot: D10_CARRIER.slot,
    channel: D10_CARRIER.channel,
  }),
  // TODO: D11+ slots as pure route configs under scripts/routes/
]);

const OBSERVE_EVENTS = Object.freeze([
  'game:started',
  'uniqueWreck:rumorRecorded',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:decisionReady',
  'uniqueWreck:salvaged',
  'scan:pulse',
]);

function defineWreckSkeletonRoute(slot) {
  return defineRoute({
    id: slot.routeId,
    contentClass: CONTENT_CLASSES.wreck,
    requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
    ciSeeds: [...D10_CI_SEEDS],
    supporting: true,
    carrier: {
      slot: slot.slot,
      channel: slot.channel,
      wreckId: slot.wreckId,
      sectorId: slot.sectorId,
    },
    // Empty steps → structural multi-seed soak only (not content acceptance).
    steps: [],
    meta: { skeleton: true, wreckId: slot.wreckId },
  });
}

function runSeedForSlot(slot, seed) {
  const session = createTierASession({
    seed,
    systems: [uniqueWrecks, cargo, ships],
    observeEvents: OBSERVE_EVENTS,
  });

  try {
    // Structural soak only — no bus.emit of uniqueWreck/scan/salvage injects.
    // Full natural drive (flight + input.actions.scanPulse) lands with route configs.
    session.state.mode = 'flight';
    if (session.state.world) {
      session.state.world.currentSectorId = slot.sectorId;
    }

    session.runTicks(SKELETON_TICKS);
    const snap = session.snapshot('end');

    return {
      seed,
      result: 'passed',
      pass: true,
      supporting: true,
      skeleton: true,
      routeId: slot.routeId,
      wreckId: slot.wreckId,
      sectorId: slot.sectorId,
      ticks: session.ticks,
      simTime: session.simTime,
      eventsObserved: session.events.map((e) => e.event),
      snapshot: snap,
      note: 'skeleton soak only — content marks not asserted',
    };
  } finally {
    session.dispose();
  }
}

const route = defineWreckSkeletonRoute(WRECK_SLOTS[0]);
const seeds = [...resolveSeedSet(route, SEED_MODE === 'held-out' || SEED_MODE === 'full' ? SEED_MODE : 'ci')];

assert.ok(seeds.includes(D10_CI_SEEDS[0]) || SEED_MODE === 'held-out',
  'CI mode must always be able to pin D10 seeds (F1 §8)');

const multi = await runMultiSeed({
  seeds,
  label: 'check:depth-program:r2:natural-multi:skeleton',
  runSeed: (seed) => runSeedForSlot(WRECK_SLOTS[0], seed),
});

assert.equal(multi.pass, true, 'skeleton multi-seed must pass structural soak');

// Per-seed F1 evidence shells (supporting skeleton).
const evidencePaths = [];
for (const row of multi.rows) {
  const evidence = {
    schema: NATURAL_ROUTE_SCHEMA,
    routeId: route.id,
    contentClass: route.contentClass,
    tier: 'A',
    seed: row.seed,
    supporting: true,
    rev: null,
    pass: true,
    failures: [],
    failureClass: null,
    marks: [],
    events: (row.eventsObserved || []).map((event) => ({ event, tick: null, payload: {} })),
    snapshots: { start: {}, end: row.snapshot || {} },
    durations: {
      simSeconds: row.simTime || 0,
      ticks: row.ticks || 0,
      wallMs: 0,
    },
    naturalness: {
      validatorPass: null,
      failures: [],
      note: 'skeleton harness intentionally sets mode/sector for soak isolation; primary naturalness deferred',
    },
    carrier: route.carrier,
    screenshots: [],
    skeleton: true,
  };
  const path = writeEvidence(evidence, OUT_DIR);
  evidencePaths.push(path);
}

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:r2:natural-multi:skeleton',
  supporting: true,
  skeleton: true,
  seedMode: SEED_MODE,
  seeds,
  heldOutAvailable: loadHeldOutSeeds().length,
  slots: WRECK_SLOTS,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
  result: multi.result,
  pass: multi.pass,
  rows: multi.rows,
  evidencePaths,
  residual: [
    'Add scripts/routes/* configs per wreck (data, not harness code)',
    'Wire uninjected drive: flight approach + input.actions.scanPulse only',
    'Assert full wreck mark spine per seed',
    'Expand WRECK_SLOTS beyond D10',
    'Promote off supporting when naturalness validator passes on harness sources',
  ],
};

mkdirSync(dirname(AGGREGATE), { recursive: true });
writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

console.log(`R2 natural multi skeleton OK: ${multi.seedCount} seeds (mode=${SEED_MODE})`);
console.log(`Aggregate: ${AGGREGATE}`);
console.log(`Per-seed evidence: ${evidencePaths.length} files under ${OUT_DIR}`);
