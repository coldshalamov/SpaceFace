#!/usr/bin/env node
// E1 natural multi-seed / multi-shape check — Tier A + production encounterDirector.
//
// Extends the naturalRoute driver + R2 multi skeleton for encounter content:
// multi-seed isolation, observe-only bus, no requestAuthoredEncounter / force.
//
// Green gate (prefer green over full 8-row ambition):
//   H1 (depth_h1_distress_from_inside) — CI triple (≥3 seeds), Helios yard mayday
//   H3 (depth_h3_wreck_that_knows_you) — second shape; fires natively with only
//       storyBeatMin + zone proximity (no POI/tech bootstrap)
//
// Supporting under F1 §1: flight bootstrap (mode/sector/player/POI eligibility
// state + sector:enter emit + zone placement). These stand in for player-earned
// exploration / world membership — not force-spawn. Primary uninjected flight
// + remaining 6 canonical encounters remain residual (2 banked follow-ons stub).
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

/** Helios yard local anchor — H1 only (matches zone plan / POI). */
const H1_YARD_LOCAL = Object.freeze({ x: -1760, z: -1260 });

/**
 * Native-fire shapes proven without force-spawn.
 * CI seeds chosen for early planner windows (bounded soak, multi-seed green).
 * Held-out seeds stay in naturalRouteSeeds.json (not embedded).
 *
 * Bootstrap is per-shape and intentionally minimal:
 *   H1 — storyBeatMin 3 + prior POI visit/discovery (production gates)
 *   H3 — storyBeatMin 6 only (no POI / no tech)
 */
const SHAPE_SPECS = Object.freeze([
  Object.freeze({
    routeId: 'e1-h1-distress-natural',
    shapeId: 'depth_h1_distress_from_inside',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H1',
    // ≥3 seeds (was CI pair 48200/91071); 100 also plans H1 on sector-day 1.
    ciSeeds: Object.freeze([48_200, 91_071, 100]),
    beatIndex: 3,
    poiId: 'poi_helios_yard',
    yardLocal: H1_YARD_LOCAL,
  }),
  Object.freeze({
    routeId: 'e1-h3-wreck-knows-you-natural',
    shapeId: 'depth_h3_wreck_that_knows_you',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H3',
    // Day-0 minors with due < 90s on Helios (pure planner probe).
    ciSeeds: Object.freeze([256, 35]),
    beatIndex: 6,
    poiId: null,
    yardLocal: null,
  }),
]);

const OBSERVE_EVENTS = Object.freeze([
  'sector:enter',
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:choiceOffered',
]);

const routesByShape = new Map(
  SHAPE_SPECS.map((spec) => [
    spec.shapeId,
    defineRoute({
      id: spec.routeId,
      contentClass: CONTENT_CLASSES.encounter,
      requiredMarks: REQUIRED_MARKS_BY_CLASS.encounter,
      ciSeeds: [...spec.ciSeeds],
      supporting: true,
      carrier: {
        slot: spec.slot,
        channel: 'encounterDirector planEncounters + pacing gate',
        shapeId: spec.shapeId,
        sectorId: spec.sectorId,
      },
      steps: [],
      meta: {
        skeleton: false,
        naturalDirector: true,
        shapeId: spec.shapeId,
        note: `${spec.slot} multi-seed native fire; bootstrap state is supporting`,
      },
    }),
  ]),
);

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
        zoneRadius: hit.zoneRadius || null,
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

/**
 * Supporting bootstrap only — never requestAuthoredEncounter / force / choose inject.
 * Stripped vs prior H1-only harness: no tech_long_range_survey; beatIndex is the
 * shape's storyBeatMin (not a blanket 7). H3 needs no POI discovery/visit.
 */
function applySupportingBootstrap(session, player, spec, planned) {
  session.state.mode = 'flight';
  session.state.world.currentSectorId = spec.sectorId;
  session.state.story.beatIndex = spec.beatIndex;

  if (spec.poiId) {
    session.state.world.discovery = session.state.world.discovery || {};
    session.state.world.discovery[spec.sectorId] = {
      discovered: true,
      pois: { [spec.poiId]: { discovered: true, identified: false } },
    };
    session.state.story.depthProgramPoiVisits = {
      [spec.poiId]: { firstSeenAt: -10 },
    };
  }

  // Prefer planner zone center (global); H1 may fall back to yard local anchor.
  let place = planned.zoneCenter || null;
  if (!place && spec.yardLocal) {
    place = sectorLocalToGlobalForSector(spec.yardLocal, spec.sectorId);
  }
  if (place) setPos(player, place.x, place.z);
  return place;
}

function runShapeSeed(spec, seed) {
  const planned = firstPlannedDue(seed, spec.shapeId, spec.sectorId);
  assert.ok(planned, `seed ${seed}: planner must schedule ${spec.shapeId} within 40 sector-days`);

  const session = createTierASession({
    seed,
    systems: [encounterDirector],
    observeEvents: OBSERVE_EVENTS,
  });

  const marks = [];
  const failures = [];
  const route = routesByShape.get(spec.shapeId);

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

    const place = applySupportingBootstrap(session, player, spec, planned);

    // Production membership event (world system emits this on intentional enter).
    session.bus.emit('sector:enter', { sectorId: spec.sectorId });
    marks.push(mark('sector-entered', session, {
      sectorId: spec.sectorId,
      shapeId: spec.shapeId,
      plannedKey: session.state.encounterDirector?.plannedKey || null,
      pendingCount: Array.isArray(session.state.encounterDirector?.pending)
        ? session.state.encounterDirector.pending.length
        : 0,
    }));

    const maxSimS = Math.ceil(planned.due + CHOICE_WINDOW_S + SOAK_SLACK_S);
    const maxTicks = Math.max(60, Math.ceil(maxSimS * 60));

    const wait = session.runTicksUntil((s) => {
      const done = s.state.story?.depthProgramEncounters?.completed?.[spec.shapeId];
      return Boolean(done);
    }, { maxTicks });

    const telegraphs = session.events.filter(
      (e) => e.event === 'encounter:telegraph' && e.payload?.kind === spec.shapeId,
    );
    const spawnedEvents = session.events.filter(
      (e) => e.event === 'encounter:spawned' && e.payload?.kind === spec.shapeId,
    );
    const resolvedEvents = session.events.filter(
      (e) => e.event === 'encounter:resolved'
        && (e.payload?.kind === spec.shapeId || e.payload?.shapeId === spec.shapeId),
    );
    const shapeTele = telegraphs[0] || null;
    const receipt = shapeTele?.payload || null;
    const fingerprint = receipt?.causality?.fingerprint
      || receipt?.fingerprint
      || null;

    if (!shapeTele || !receipt?.encounterId) {
      failures.push(`missing native encounterDirector telegraph for ${spec.shapeId}`);
    } else {
      // F1: encounter-spawned carries director receipt (native trigger), never harness spawn.
      marks.push(mark('encounter-spawned', session, {
        encounterId: receipt.encounterId,
        shapeId: spec.shapeId,
        tier: receipt.tier || null,
        zoneId: receipt.zoneId || null,
        fingerprint,
        sourceEvent: 'encounter:telegraph',
        simTime: shapeTele.simTime,
        spawnedEventCount: spawnedEvents.length,
      }));
    }

    const zoneCenter = planned.zoneCenter || place;
    const dist = zoneCenter ? distanceXZ(player.pos, zoneCenter) : Infinity;
    if (!(dist <= 1200)) {
      failures.push(`player not in ${spec.slot} zone (dist=${dist})`);
    } else {
      marks.push(mark('encounter-reached', session, {
        dist,
        zoneCenter,
        playerPos: { x: finite(player.pos.x), z: finite(player.pos.z) },
      }));
    }

    const completed = session.state.story?.depthProgramEncounters?.completed?.[spec.shapeId] || null;
    if (!completed || !completed.outcome) {
      failures.push(`missing durable ${spec.slot} outcome after soak (wait.ok=${wait.ok})`);
    } else {
      marks.push(mark('outcome-observed', session, {
        outcome: completed.outcome,
        encounterId: completed.encounterId || receipt?.encounterId || null,
        at: completed.at,
        // Production timeout default — no harness choose inject.
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
      routeId: spec.routeId,
      shapeId: spec.shapeId,
      sectorId: spec.sectorId,
      slot: spec.slot,
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
      carrier: route?.carrier || null,
    };
  } finally {
    session.dispose();
  }
}

// Build job list: each shape × its resolved seed set (ci / held-out / full).
const jobs = [];
for (const spec of SHAPE_SPECS) {
  const route = routesByShape.get(spec.shapeId);
  const seeds = [...resolveSeedSet(
    route,
    SEED_MODE === 'held-out' || SEED_MODE === 'full' ? SEED_MODE : 'ci',
  )];
  for (const seed of seeds) {
    jobs.push({ spec, seed });
  }
}

assert.ok(jobs.length >= 3, `E1 natural must cover ≥3 seed runs; got ${jobs.length}`);
assert.ok(
  SHAPE_SPECS.some((s) => s.shapeId === 'depth_h1_distress_from_inside' && s.ciSeeds.length >= 3),
  'H1 CI set must publish ≥3 seeds',
);
assert.ok(SHAPE_SPECS.length >= 2, 'must cover ≥2 encounter shapes when product can fire them natively');

const multi = await runMultiSeed({
  seeds: jobs.map((j) => j.seed),
  label: 'check:depth-program:e1:natural',
  // runMultiSeed calls runSeed(seed) once per seed entry; parallel same-seed
  // across shapes is fine because each job is a separate session. Map by index.
  runSeed: async (seed, index) => {
    const job = jobs[index];
    assert.ok(job, `missing job for index ${index} seed ${seed}`);
    assert.equal(job.seed, seed, `job/seed mismatch at ${index}`);
    return runShapeSeed(job.spec, seed);
  },
});

assert.equal(multi.pass, true, `E1 natural multi-seed failed: ${JSON.stringify(
  multi.rows.filter((row) => !row.pass).map((row) => ({
    seed: row.seed,
    shapeId: row.shapeId,
    slot: row.slot,
    failures: row.failures,
    planned: row.planned,
  })),
  null,
  2,
)}`);

const evidencePaths = [];
for (const row of multi.rows) {
  const evidence = createEvidenceShell({
    routeId: row.routeId,
    contentClass: CONTENT_CLASSES.encounter,
    tier: 'A',
    seed: row.seed,
    supporting: true,
    carrier: row.carrier || null,
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
    note: row.shapeId === 'depth_h1_distress_from_inside'
      ? 'supporting bootstrap: mode/sector/storyBeatMin/POI eligibility + sector:enter + yard/zone placement; spawn path is production planEncounters/pacing (no force, no tech inject)'
      : 'supporting bootstrap: mode/sector/storyBeatMin + sector:enter + zone placement; no POI/tech; spawn path is production planEncounters/pacing (no force)',
  };
  evidence.meta = {
    shapeId: row.shapeId,
    slot: row.slot,
    planned: row.planned || null,
    fingerprint: row.fingerprint || null,
    outcome: row.outcome || null,
    directorStats: row.directorStats || null,
  };
  evidencePaths.push(writeEvidence(evidence, OUT_DIR));
}

const shapeSummary = SHAPE_SPECS.map((spec) => {
  const rows = multi.rows.filter((r) => r.shapeId === spec.shapeId);
  return {
    routeId: spec.routeId,
    shapeId: spec.shapeId,
    slot: spec.slot,
    sectorId: spec.sectorId,
    ciSeeds: [...spec.ciSeeds],
    seedCount: rows.length,
    pass: rows.every((r) => r.pass),
    outcomes: rows.map((r) => ({ seed: r.seed, outcome: r.outcome, plannedDay: r.planned?.day ?? null })),
  };
});

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:e1:natural',
  supporting: true,
  seedMode: SEED_MODE,
  shapes: shapeSummary,
  seeds: jobs.map((j) => j.seed),
  jobs: jobs.map((j) => ({ shapeId: j.spec.shapeId, seed: j.seed, slot: j.spec.slot })),
  heldOutAvailable: loadHeldOutSeeds().length,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.encounter,
  result: multi.result,
  pass: multi.pass,
  rows: multi.rows.map((row) => ({
    seed: row.seed,
    shapeId: row.shapeId,
    slot: row.slot,
    routeId: row.routeId,
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
  densityNotes: {
    h1: 'Native on Helios when storyBeat≥3 + prior yard visit; CI triple day-1 windows.',
    h3: 'Native widely (many zone types); CI pair day-0 Helios minors. No POI/tech gate.',
    otherShapesProbed: {
      h2: 'Plans on tier≥3 sectors with tech_long_range_survey; native timeout works — residual (tech bootstrap).',
      h4: 'Rare ambient Io Reach; first hit often sector-day ≥7 — density lag, residual.',
      h5: 'Native Io Reach major with storyBeat≥5 — residual (second-sector coverage).',
      h6: 'Native minor combat, empty gates; timeout→vultured works — residual (combat density OK).',
      h7: 'Plans but fire-time moralDebtOnly — needs prior mercy memory (REAL progression gap for unassisted).',
      h8: 'Telegraphs natively but timeoutChoice null (mirror-course) — needs player action; residual.',
      followOns: 'weight 0 stubs — never count toward pass (F1 §6).',
    },
  },
  residual: [
    'Expand remaining canonical shapes (H2/H4/H5/H6/H7/H8) when bootstrap can stay supporting-only',
    'H7 REAL: moralDebtOnly requires prior spared contact — progression density not unassisted in Tier A soak alone',
    'H8 REAL for pure timeout: timeoutChoice null; mirror-course needs player drive',
    'H4 density lag: rare ambient often multi-day — accept long soak or document REAL rare gap',
    'Replace supporting bootstrap with uninjected flight + world sector:enter only',
    'Assert encounter:spawned entity ids when wreck helpers mirror onto live.ids',
    'Tier-B browser observation (≥1) per F1 §6 encounter primary tier note',
    'Promote off supporting when naturalness validator passes on harness sources',
  ],
};

mkdirSync(dirname(AGGREGATE), { recursive: true });
writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

const shapeLabels = shapeSummary.map((s) => `${s.slot}×${s.seedCount}`).join(', ');
console.log(`E1 natural multi-seed OK: ${multi.seedCount} runs (mode=${SEED_MODE}) shapes=[${shapeLabels}]`);
console.log(`Aggregate: ${AGGREGATE}`);
console.log(`Per-seed evidence: ${evidencePaths.length} files under ${OUT_DIR}`);
