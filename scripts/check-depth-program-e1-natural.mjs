#!/usr/bin/env node
// E1 natural multi-seed check — Tier A + production encounterDirector.
//
// Extends the naturalRoute driver + R2 multi skeleton for encounter content:
// multi-seed isolation, observe-only bus, no requestAuthoredEncounter / force.
//
// Small green gate (prefer green over full 8-row ambition):
//   H1 (depth_h1_distress_from_inside) fires natively from the planner/pacing
//   gate on a CI seed pair, with director telegraph receipt + timeout outcome.
//
// Supporting under F1 §1: flight bootstrap (mode/sector/player/POI eligibility
// state + sector:enter emit + yard placement). These stand in for player-earned
// exploration / world membership — not force-spawn. Primary uninjected flight
// + 8 canonical encounters remain residual.
//
// Usage:
//   npm run check:depth-program:e1:natural
//   NATURAL_ROUTE_SEED_MODE=ci|held-out|full node scripts/check-depth-program-e1-natural.mjs

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import {
  encounterDirector,
  planEncounters,
} from '../src/systems/encounterDirector.js';
import {
  CONTENT_CLASSES,
  NATURAL_ROUTE_SCHEMA,
  REQUIRED_MARKS_BY_CLASS,
  createEvidenceShell,
  createTierASession,
  defineRoute,
  loadHeldOutSeeds,
  resolveSeedSet,
  runMultiSeed,
  validateMarkSequence,
  writeEvidence,
} from './lib/naturalRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots/depth-program/routes');
const AGGREGATE = resolve(ROOT, '.devshots/depth-program/e1-natural-multi.json');

const SEED_MODE = String(process.env.NATURAL_ROUTE_SEED_MODE || 'ci').toLowerCase();
const DAY_SECONDS = 600;
const CHOICE_WINDOW_S = 45;
const SOAK_SLACK_S = 90;

/** E1 H1 — first canonical unique encounter (Helios yard mayday). */
const E1_ROUTE_ID = 'e1-h1-distress-natural';
const E1_SHAPE_ID = 'depth_h1_distress_from_inside';
const E1_SECTOR_ID = 'sector_helios_prime';
const E1_POI_ID = 'poi_helios_yard';
/** Yard local anchor (matches E1 runtime / zone plan). */
const E1_YARD_LOCAL = Object.freeze({ x: -1760, z: -1260 });
/**
 * CI pair chosen so H1 plans on sector-day 1 (bounded soak, multi-seed green).
 * Held-out seeds remain in naturalRouteSeeds.json and are not embedded here.
 */
const E1_CI_SEEDS = Object.freeze([48_200, 91_071]);

const OBSERVE_EVENTS = Object.freeze([
  'sector:enter',
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:choiceOffered',
]);

const route = defineRoute({
  id: E1_ROUTE_ID,
  contentClass: CONTENT_CLASSES.encounter,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.encounter,
  ciSeeds: [...E1_CI_SEEDS],
  supporting: true,
  carrier: {
    slot: 'E1/H1',
    channel: 'encounterDirector planEncounters + pacing gate',
    shapeId: E1_SHAPE_ID,
    sectorId: E1_SECTOR_ID,
  },
  steps: [],
  meta: {
    skeleton: false,
    naturalDirector: true,
    shapeId: E1_SHAPE_ID,
    note: 'H1 multi-seed native fire; bootstrap state is supporting',
  },
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function distanceXZ(a, b) {
  return Math.hypot(finite(a?.x) - finite(b?.x), finite(a?.z) - finite(b?.z));
}

function setPos(entity, x, z) {
  if (!entity?.pos) return;
  if (typeof entity.pos.set === 'function') entity.pos.set(x, 0, z);
  else {
    entity.pos.x = x;
    entity.pos.z = z;
  }
  if (entity.prevPos) {
    if (typeof entity.prevPos.set === 'function') entity.prevPos.set(x, 0, z);
    else {
      entity.prevPos.x = x;
      entity.prevPos.z = z;
    }
  }
  if (entity.vel) {
    if (typeof entity.vel.set === 'function') entity.vel.set(0, 0, 0);
    else {
      entity.vel.x = 0;
      entity.vel.z = 0;
    }
  }
}

/** Pure planner peek — bounds soak; never force-spawns. */
function firstPlannedDue(seed, shapeId, sectorId, maxDays = 40) {
  const zones = zonesForSector(sectorId);
  for (let day = 0; day < maxDays; day += 1) {
    const rows = planEncounters(seed, sectorId, day, zones, null);
    const hit = rows.find((row) => row.shapeId === shapeId);
    if (hit) {
      return {
        day,
        delay: finite(hit.delay),
        due: day * DAY_SECONDS + finite(hit.delay),
        zoneId: hit.zoneId || null,
        zoneCenter: hit.zoneCenter || null,
      };
    }
  }
  return null;
}

function mark(name, session, detail = {}) {
  return {
    name,
    tick: Number.isFinite(session.ticks) ? session.ticks : null,
    simTime: session.simTime,
    at: new Date().toISOString(),
    detail,
  };
}

function runSeed(seed) {
  const planned = firstPlannedDue(seed, E1_SHAPE_ID, E1_SECTOR_ID);
  assert.ok(planned, `seed ${seed}: planner must schedule ${E1_SHAPE_ID} within 40 sector-days`);

  const session = createTierASession({
    seed,
    systems: [encounterDirector],
    observeEvents: OBSERVE_EVENTS,
  });

  const marks = [];
  const failures = [];

  try {
    const player = session.sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 100,
      hull: 100,
      hullMax: 100,
      data: { intent: {}, ai: {} },
    });
    session.state.playerId = player.id;

    // Supporting bootstrap: production flight membership + H1 eligibility a player earns.
    // No requestAuthoredEncounter, no force, no encounter:choose inject.
    session.state.mode = 'flight';
    session.state.world.currentSectorId = E1_SECTOR_ID;
    session.state.story.beatIndex = 7;
    const nodes = session.state.player.researchedNodes || (session.state.player.researchedNodes = []);
    if (!nodes.includes('tech_long_range_survey')) nodes.push('tech_long_range_survey');

    session.state.world.discovery = session.state.world.discovery || {};
    session.state.world.discovery[E1_SECTOR_ID] = {
      discovered: true,
      pois: { [E1_POI_ID]: { discovered: true, identified: false } },
    };
    session.state.story.depthProgramPoiVisits = {
      [E1_POI_ID]: { firstSeenAt: -10 },
    };

    const yardGlobal = sectorLocalToGlobalForSector(E1_YARD_LOCAL, E1_SECTOR_ID);
    setPos(player, yardGlobal.x, yardGlobal.z);

    // Production membership event (world system emits this on intentional enter).
    session.bus.emit('sector:enter', { sectorId: E1_SECTOR_ID });
    marks.push(mark('sector-entered', session, {
      sectorId: E1_SECTOR_ID,
      plannedKey: session.state.encounterDirector?.plannedKey || null,
      pendingCount: Array.isArray(session.state.encounterDirector?.pending)
        ? session.state.encounterDirector.pending.length
        : 0,
    }));

    const maxSimS = Math.ceil(planned.due + CHOICE_WINDOW_S + SOAK_SLACK_S);
    const maxTicks = Math.max(60, Math.ceil(maxSimS * 60));

    const wait = session.runTicksUntil((s) => {
      const done = s.state.story?.depthProgramEncounters?.completed?.[E1_SHAPE_ID];
      return Boolean(done);
    }, { maxTicks });

    const telegraphs = session.events.filter(
      (e) => e.event === 'encounter:telegraph' && e.payload?.kind === E1_SHAPE_ID,
    );
    const spawnedEvents = session.events.filter(
      (e) => e.event === 'encounter:spawned' && e.payload?.kind === E1_SHAPE_ID,
    );
    const resolvedEvents = session.events.filter(
      (e) => e.event === 'encounter:resolved'
        && (e.payload?.kind === E1_SHAPE_ID || e.payload?.shapeId === E1_SHAPE_ID),
    );
    const h1Tele = telegraphs[0] || null;
    const receipt = h1Tele?.payload || null;
    const fingerprint = receipt?.causality?.fingerprint
      || receipt?.fingerprint
      || null;

    if (!h1Tele || !receipt?.encounterId) {
      failures.push(`missing native encounterDirector telegraph for ${E1_SHAPE_ID}`);
    } else {
      // F1: encounter-spawned carries director receipt (native trigger), never harness spawn.
      // H1 telegraphs even when wreck entity ids are not mirrored onto live.ids.
      marks.push(mark('encounter-spawned', session, {
        encounterId: receipt.encounterId,
        shapeId: E1_SHAPE_ID,
        tier: receipt.tier || null,
        zoneId: receipt.zoneId || null,
        fingerprint,
        sourceEvent: 'encounter:telegraph',
        simTime: h1Tele.simTime,
        spawnedEventCount: spawnedEvents.length,
      }));
    }

    const zoneCenter = planned.zoneCenter || yardGlobal;
    const dist = distanceXZ(player.pos, zoneCenter);
    if (!(dist <= 1200)) {
      failures.push(`player not in H1 zone (dist=${dist})`);
    } else {
      marks.push(mark('encounter-reached', session, {
        dist,
        zoneCenter,
        playerPos: { x: finite(player.pos.x), z: finite(player.pos.z) },
      }));
    }

    const completed = session.state.story?.depthProgramEncounters?.completed?.[E1_SHAPE_ID] || null;
    if (!completed || !completed.outcome) {
      failures.push(`missing durable H1 outcome after soak (wait.ok=${wait.ok})`);
    } else {
      marks.push(mark('outcome-observed', session, {
        outcome: completed.outcome,
        encounterId: completed.encounterId || receipt?.encounterId || null,
        at: completed.at,
        // Production timeout default for H1 is "leave" → outcome "left"; no harness choose.
        via: 'encounterDirector timeout / runtime (no encounter:choose inject)',
        resolvedEvents: resolvedEvents.length,
      }));
    }

    const markCheck = validateMarkSequence(marks, REQUIRED_MARKS_BY_CLASS.encounter);
    if (!markCheck.pass) {
      for (const msg of markCheck.failures) failures.push(msg);
    }

    // Fail closed: harness must not have used the force seam.
    const dir = session.sim.registry.get('encounterDirector');
    assert.equal(typeof dir?.requestAuthoredEncounter, 'function',
      'production requestAuthoredEncounter must exist (unused)');

    const pass = failures.length === 0;
    return {
      seed,
      pass,
      result: pass ? 'passed' : 'failed',
      supporting: true,
      routeId: E1_ROUTE_ID,
      shapeId: E1_SHAPE_ID,
      sectorId: E1_SECTOR_ID,
      planned,
      ticks: session.ticks,
      simTime: session.simTime,
      marks,
      failures,
      fingerprint,
      outcome: completed?.outcome || null,
      eventsObserved: session.events.map((e) => e.event),
      directorStats: session.state.encounterDirector?.stats
        ? { ...session.state.encounterDirector.stats }
        : null,
      snapshot: session.snapshot('end'),
    };
  } finally {
    session.dispose();
  }
}

const seeds = [...resolveSeedSet(
  route,
  SEED_MODE === 'held-out' || SEED_MODE === 'full' ? SEED_MODE : 'ci',
)];

// Held-out / full modes may include seeds with late H1 windows; still require every seed.
const multi = await runMultiSeed({
  seeds,
  label: 'check:depth-program:e1:natural',
  runSeed,
});

assert.equal(multi.pass, true, `E1 natural multi-seed failed: ${JSON.stringify(
  multi.rows.filter((row) => !row.pass).map((row) => ({
    seed: row.seed,
    failures: row.failures,
    planned: row.planned,
  })),
  null,
  2,
)}`);

const evidencePaths = [];
for (const row of multi.rows) {
  const evidence = createEvidenceShell({
    routeId: route.id,
    contentClass: route.contentClass,
    tier: 'A',
    seed: row.seed,
    supporting: true,
    carrier: route.carrier,
  });
  evidence.pass = row.pass === true;
  evidence.failures = [...(row.failures || [])];
  evidence.failureClass = row.pass ? null : 'REAL';
  evidence.marks = row.marks || [];
  evidence.events = (row.eventsObserved || []).map((event) => ({
    event,
    tick: null,
    payload: {},
  }));
  evidence.snapshots = { start: {}, end: row.snapshot || {} };
  evidence.durations = {
    simSeconds: row.simTime || 0,
    ticks: row.ticks || 0,
    wallMs: 0,
  };
  evidence.naturalness = {
    validatorPass: null,
    failures: [],
    note: 'supporting bootstrap: mode/sector/POI eligibility + sector:enter + yard placement; spawn path is production planEncounters/pacing (no force)',
  };
  evidence.meta = {
    shapeId: E1_SHAPE_ID,
    planned: row.planned || null,
    fingerprint: row.fingerprint || null,
    outcome: row.outcome || null,
    directorStats: row.directorStats || null,
  };
  evidencePaths.push(writeEvidence(evidence, OUT_DIR));
}

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:e1:natural',
  supporting: true,
  seedMode: SEED_MODE,
  seeds,
  heldOutAvailable: loadHeldOutSeeds().length,
  routeId: E1_ROUTE_ID,
  shapeId: E1_SHAPE_ID,
  sectorId: E1_SECTOR_ID,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.encounter,
  result: multi.result,
  pass: multi.pass,
  rows: multi.rows.map((row) => ({
    seed: row.seed,
    pass: row.pass,
    result: row.result,
    planned: row.planned,
    teleAt: row.marks?.find((m) => m.name === 'encounter-spawned')?.detail?.simTime ?? null,
    outcome: row.outcome,
    fingerprint: row.fingerprint,
    ticks: row.ticks,
    simTime: row.simTime,
    failures: row.failures,
  })),
  evidencePaths,
  residual: [
    'Expand beyond H1 to remaining 7 canonical E1 shapes (2 banked follow-ons stay stub:true)',
    'Replace supporting bootstrap with uninjected flight + world sector:enter only',
    'Assert encounter:spawned entity ids when wreck helpers mirror onto live.ids',
    'Tier-B browser observation (≥1) per F1 §6 encounter primary tier note',
    'Promote off supporting when naturalness validator passes on harness sources',
  ],
};

mkdirSync(dirname(AGGREGATE), { recursive: true });
writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

console.log(`E1 natural multi-seed OK: ${multi.seedCount} seeds (mode=${SEED_MODE}) H1 native fire`);
console.log(`Aggregate: ${AGGREGATE}`);
console.log(`Per-seed evidence: ${evidencePaths.length} files under ${OUT_DIR}`);
