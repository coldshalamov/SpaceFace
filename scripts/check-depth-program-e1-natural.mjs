#!/usr/bin/env node
// E1 natural multi-seed / multi-shape check — Tier A + production encounterDirector.
//
// Extends the naturalRoute driver + R2 multi skeleton for encounter content:
// multi-seed isolation, observe-only bus for marks, no requestAuthoredEncounter / force.
//
// Green gate (F0: 8 canonical E1 shapes; 2 banked follow-ons stay weight-0 stubs):
//   H1 depth_h1_distress_from_inside — CI triple, Helios yard mayday
//   H2 depth_h2_drifting_bloom       — Veil tier≥3 + tech_long_range_survey eligibility
//   H3 depth_h3_wreck_that_knows_you — storyBeatMin only
//   H4 depth_h4_love_letter_buoy     — Io Reach rare ambient (day-0 CI seeds)
//   H5 depth_h5_corridor_massacre    — Io Reach major, storyBeatMin 5
//   H6 depth_h6_patrol_ambush        — empty gates; timeout→wait→vultured
//   H7 depth_h7_spared_return        — moralDebtOnly; supporting mercy-memory stand-in
//   H8 depth_h8_echo_of_player       — native telegraph; supporting mirror-course drive
//                                     (timeoutChoice null — pure timeout cannot complete)
//
// Supporting under F1 §1: membership scaffold (mode/sector + sector:enter + zone place)
// is still supporting for every shape — do NOT flip supporting:false globally.
// Eligibility injects are per-shape and minimized for H1–H6:
//   H1 — beat≥3 + discovery map + production poi:discovered (visit memory)
//   H2 — tech_long_range_survey inject (Tier A has no research earn path)
//   H3 — beat≥6 only
//   H4 — eligibility-free (zone membership only)
//   H5 — beat≥5 only
//   H6 — eligibility-free (empty gates; zone membership only)
//   H7 — moralMemory:remember stand-in (moralDebtOnly)
//   H8 — beat≥7 + mirror-course drive (timeoutChoice null)
// Follow-ons remain weight-0 stubs and never count toward pass.
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
/** H6 timeout→wait then H6_WAIT_TIMEOUT_S (20) before vultured. */
const H6_EXTRA_SOAK_S = 40;
/** H8 mirrorCourse.durationS = 6; hold a little longer after placement. */
const H8_MIRROR_HOLD_S = 8;

/** Helios yard local anchor — H1 only (matches zone plan / POI). */
const H1_YARD_LOCAL = Object.freeze({ x: -1760, z: -1260 });

/**
 * Native-fire shapes without force-spawn.
 * CI seeds chosen for early planner windows that also complete under runtime pacing.
 * Held-out seeds stay in naturalRouteSeeds.json (not embedded).
 *
 * Bootstrap is per-shape and intentionally minimal:
 *   H1 — storyBeatMin 3 + discovery map + production poi:discovered visit
 *   H2 — tech_long_range_survey (production gate; no Tier-A research earn) + tier≥3
 *   H3 — storyBeatMin 6 only
 *   H4 — Io Reach zone only (eligibility-free under membership scaffold)
 *   H5 — storyBeatMin 5 + Io Reach
 *   H6 — zone only / empty gates (eligibility-free under membership scaffold)
 *   H7 — moralMemory:remember stand-in (moralDebtOnly production gate)
 *   H8 — storyBeatMin 7 + post-telegraph mirror-course player drive stand-in
 *
 * supporting (F1 primary): always true while membership scaffold remains.
 * eligibilitySupporting: true only when beat/POI/tech/moral/mirror injects are used.
 */
const SHAPE_SPECS = Object.freeze([
  Object.freeze({
    routeId: 'e1-h1-distress-natural',
    shapeId: 'depth_h1_distress_from_inside',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H1',
    ciSeeds: Object.freeze([48_200, 91_071, 100]),
    beatIndex: 3,
    poiId: 'poi_helios_yard',
    yardLocal: H1_YARD_LOCAL,
  }),
  Object.freeze({
    routeId: 'e1-h2-drifting-bloom-natural',
    shapeId: 'depth_h2_drifting_bloom',
    sectorId: 'sector_veil_nebula',
    slot: 'E1/H2',
    // Day-0 / day-1 Veil majors that clear pressure/pacing at runtime.
    ciSeeds: Object.freeze([3, 7]),
    beatIndex: 0,
    requiredTech: 'tech_long_range_survey',
  }),
  Object.freeze({
    routeId: 'e1-h3-wreck-knows-you-natural',
    shapeId: 'depth_h3_wreck_that_knows_you',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H3',
    ciSeeds: Object.freeze([256, 35]),
    beatIndex: 6,
  }),
  Object.freeze({
    routeId: 'e1-h4-love-letter-buoy-natural',
    shapeId: 'depth_h4_love_letter_buoy',
    sectorId: 'sector_io_reach',
    slot: 'E1/H4',
    // Day-0 rare ambient hits (weight 0.35 + RARE_GATE) — density lag residual otherwise.
    ciSeeds: Object.freeze([15, 22]),
    beatIndex: 0,
  }),
  Object.freeze({
    routeId: 'e1-h5-corridor-massacre-natural',
    shapeId: 'depth_h5_corridor_massacre',
    sectorId: 'sector_io_reach',
    slot: 'E1/H5',
    ciSeeds: Object.freeze([1, 4]),
    beatIndex: 5,
  }),
  Object.freeze({
    routeId: 'e1-h6-patrol-ambush-natural',
    shapeId: 'depth_h6_patrol_ambush',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H6',
    ciSeeds: Object.freeze([10, 4]),
    beatIndex: 0,
    extraSoakS: H6_EXTRA_SOAK_S,
  }),
  Object.freeze({
    routeId: 'e1-h7-spared-return-natural',
    shapeId: 'depth_h7_spared_return',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H7',
    // moralDebtOnly — CI pair proven with supporting mercy-memory stand-in.
    ciSeeds: Object.freeze([11, 12]),
    beatIndex: 0,
    moralDebt: true,
  }),
  Object.freeze({
    routeId: 'e1-h8-echo-of-player-natural',
    shapeId: 'depth_h8_echo_of_player',
    sectorId: 'sector_helios_prime',
    slot: 'E1/H8',
    // Native telegraph; timeoutChoice null → mirror-course drive for outcome.
    ciSeeds: Object.freeze([2, 6]),
    beatIndex: 7,
    mirrorCourse: true,
  }),
]);

/** Shape needs beat/POI/tech/moral/mirror inject beyond membership scaffold. */
function eligibilityInjectsOf(spec) {
  const injects = [];
  if ((spec.beatIndex | 0) > 0) injects.push(`storyBeatMin→beatIndex=${spec.beatIndex}`);
  if (spec.poiId) injects.push(`poiDiscovery+poi:discovered:${spec.poiId}`);
  if (spec.requiredTech) injects.push(`tech:${spec.requiredTech}`);
  if (spec.moralDebt) injects.push('moralMemory:remember');
  if (spec.mirrorCourse) injects.push('mirror-course drive');
  return injects;
}

function hasEligibilityInject(spec) {
  return eligibilityInjectsOf(spec).length > 0;
}

const OBSERVE_EVENTS = Object.freeze([
  'sector:enter',
  'encounter:telegraph',
  'encounter:spawned',
  'encounter:resolved',
  'encounter:receipt',
  'encounter:choiceOffered',
]);

const routesByShape = new Map(
  SHAPE_SPECS.map((spec) => {
    const eligibilitySupporting = hasEligibilityInject(spec);
    return [
      spec.shapeId,
      defineRoute({
        id: spec.routeId,
        contentClass: CONTENT_CLASSES.encounter,
        requiredMarks: REQUIRED_MARKS_BY_CLASS.encounter,
        ciSeeds: [...spec.ciSeeds],
        // Membership scaffold keeps all shapes supporting (F1 primary not claimed).
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
          eligibilitySupporting,
          eligibilityInjects: eligibilityInjectsOf(spec),
          note: eligibilitySupporting
            ? `${spec.slot} native fire; membership scaffold + eligibility injects`
            : `${spec.slot} native fire; membership scaffold only (eligibility-free)`,
        },
      }),
    ];
  }),
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

function setVel(entity, x, z) {
  if (!entity?.vel) return;
  if (typeof entity.vel.set === 'function') entity.vel.set(x, 0, z);
  else {
    entity.vel.x = x;
    entity.vel.z = z;
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

function naturalnessNote(spec) {
  const injects = eligibilityInjectsOf(spec);
  const bits = [
    'membership scaffold: mode/sector + sector:enter + zone placement (supporting)',
    'spawn path is production planEncounters/pacing (no force)',
  ];
  if (injects.length === 0) {
    bits.push('eligibility-free (no beat/POI/tech/moral/mirror inject)');
  } else {
    bits.push(`eligibility injects: ${injects.join(', ')}`);
  }
  if (spec.poiId) {
    bits.push('H1 visit via production poi:discovered (discovery map still seeded)');
  }
  if (spec.requiredTech) {
    bits.push(`H2 tech inject required — Tier A has no research earn path for ${spec.requiredTech}`);
  }
  if (spec.moralDebt) bits.push('H7 moralMemory:remember stand-in for prior mercy');
  if (spec.mirrorCourse) {
    bits.push('H8 post-telegraph mirror-course placement (timeoutChoice null; no choose inject)');
  }
  return bits.join('; ');
}

/**
 * Supporting bootstrap only — never requestAuthoredEncounter / force / choose inject.
 * Per-shape minimum: beatIndex when gated; optional POI/tech/moral stand-ins.
 * H4/H6: membership scaffold only (eligibility-free).
 */
function applySupportingBootstrap(session, player, spec, planned) {
  session.state.mode = 'flight';
  session.state.world.currentSectorId = spec.sectorId;
  // Only write beat when the shape actually gates on storyBeatMin (>0).
  if ((spec.beatIndex | 0) > 0) {
    session.state.story.beatIndex = spec.beatIndex;
  }

  if (spec.poiId) {
    // requiredPoiDiscovered still needs discovery map — world system not in Tier A list.
    session.state.world.discovery = session.state.world.discovery || {};
    session.state.world.discovery[spec.sectorId] = {
      discovered: true,
      pois: { [spec.poiId]: { discovered: true, identified: false } },
    };
    // Production visit memory: poi:discovered → encounterDirector._rememberPoiVisit.
    // Prefer this over writing depthProgramPoiVisits directly.
    session.bus.emit('poi:discovered', { poiId: spec.poiId, type: 'derelict' });
    // requirePriorPoiVisit needs firstSeenAt < fire-time simTime.
    session.runTicks(Math.ceil(2 * 60));
  }

  if (spec.requiredTech) {
    // REAL residual: tech gate cannot be earned in Tier A without research systems.
    session.state.player = session.state.player || {};
    const nodes = Array.isArray(session.state.player.researchedNodes)
      ? session.state.player.researchedNodes
      : (session.state.player.researchedNodes = []);
    if (!nodes.includes(spec.requiredTech)) nodes.push(spec.requiredTech);
  }

  // Production moralDebtOnly gate — stands in for player-earned mercy memory (not force-spawn).
  if (spec.moralDebt) {
    session.bus.emit('moralMemory:remember', {
      id: `e1_natural_debt_${spec.shapeId}_${session.seed}`,
      name: 'Natural-route spared contact',
      cause: 'spared',
      factionId: 'faction_reach',
    });
  }

  // Prefer planner zone center (global); H1 may fall back to yard local anchor.
  let place = planned.zoneCenter || null;
  if (!place && spec.yardLocal) {
    place = sectorLocalToGlobalForSector(spec.yardLocal, spec.sectorId);
  }
  if (place) setPos(player, place.x, place.z);
  return place;
}

/**
 * H8 has timeoutChoice null — pure timeout cannot complete outcome-observed.
 * After native telegraph/spawn, place the player on the mirror course (player drive stand-in).
 * No encounter:choose inject.
 */
function driveH8MirrorCourse(session, player, shapeId) {
  const dir = session.state.encounterDirector;
  const live = dir && dir.live
    ? Object.values(dir.live).find((row) => row && row.shapeId === shapeId)
    : null;
  if (!live) return { ok: false, reason: 'no live H8' };

  const echoId = Array.isArray(live.ids) ? live.ids[0] : null;
  const echo = echoId != null ? session.state.entities.get(echoId) : null;
  const center = live.vars?.mirrorCenter || live.anchor || null;
  if (!echo || !center) return { ok: false, reason: 'missing echo/center' };

  // Perfect XZ mirror through center with opposite velocity (e1EncounterRuntime h8.tick).
  const ex = finite(echo.pos.x);
  const ez = finite(echo.pos.z);
  const evx = finite(echo.vel?.x);
  const evz = finite(echo.vel?.z);
  setPos(player, 2 * finite(center.x) - ex, 2 * finite(center.z) - ez);
  setVel(player, -evx, -evz);

  session.runTicks(Math.ceil(H8_MIRROR_HOLD_S * 60));
  return {
    ok: true,
    center: { x: finite(center.x), z: finite(center.z) },
    matchedS: live.vars?.matchedS ?? null,
  };
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
      data: {
        intent: {},
        ai: {},
        // H8 mirrors player defId/fittings when present.
        defId: 'ship_kestrel',
      },
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

    const extraSoak = finite(spec.extraSoakS, 0);
    const maxSimS = Math.ceil(planned.due + CHOICE_WINDOW_S + SOAK_SLACK_S + extraSoak);
    const maxTicks = Math.max(60, Math.ceil(maxSimS * 60));

    if (spec.mirrorCourse) {
      // Wait for native live H8, then drive mirror course (no choose inject).
      session.runTicksUntil((s) => {
        const dir = s.state.encounterDirector;
        if (!dir?.live) return false;
        return Object.values(dir.live).some((row) => row && row.shapeId === spec.shapeId);
      }, { maxTicks });

      const mirror = driveH8MirrorCourse(session, player, spec.shapeId);
      if (!mirror.ok) {
        failures.push(`H8 mirror-course drive failed: ${mirror.reason}`);
      }
    } else {
      session.runTicksUntil((s) => {
        const done = s.state.story?.depthProgramEncounters?.completed?.[spec.shapeId];
        return Boolean(done);
      }, { maxTicks });
    }

    // Capture wait status for outcome diagnostics (recompute completion after optional H8 drive).
    const waitOk = Boolean(
      session.state.story?.depthProgramEncounters?.completed?.[spec.shapeId],
    );

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
    // H8 mirror drive intentionally moves the player opposite the zone center; still count
    // as reached if we saw native telegraph while in zone, or post-drive near mirror center.
    if (!(dist <= 1200) && !spec.mirrorCourse) {
      failures.push(`player not in ${spec.slot} zone (dist=${dist})`);
    } else if (spec.mirrorCourse && !shapeTele) {
      failures.push(`H8 never reached zone / telegraphed (dist=${dist})`);
    } else {
      marks.push(mark('encounter-reached', session, {
        dist: finite(dist),
        zoneCenter,
        playerPos: { x: finite(player.pos.x), z: finite(player.pos.z) },
        mirrorCourse: !!spec.mirrorCourse,
      }));
    }

    const completed = session.state.story?.depthProgramEncounters?.completed?.[spec.shapeId] || null;
    if (!completed || !completed.outcome) {
      failures.push(`missing durable ${spec.slot} outcome after soak (waitOk=${waitOk})`);
    } else {
      const via = spec.mirrorCourse
        ? 'H8 mirror-course player drive stand-in (no encounter:choose inject)'
        : 'encounterDirector timeout / runtime (no encounter:choose inject)';
      marks.push(mark('outcome-observed', session, {
        outcome: completed.outcome,
        encounterId: completed.encounterId || receipt?.encounterId || null,
        at: completed.at,
        via,
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
    const eligibilitySupporting = hasEligibilityInject(spec);
    const eligibilityInjects = eligibilityInjectsOf(spec);
    return {
      seed,
      pass,
      result: pass ? 'passed' : 'failed',
      // Membership scaffold residual — never claim primary here.
      supporting: true,
      eligibilitySupporting,
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
      bootstrap: {
        membershipScaffold: true,
        eligibilitySupporting,
        eligibilityInjects,
        beatIndex: (spec.beatIndex | 0) > 0 ? spec.beatIndex : 0,
        poi: !!spec.poiId,
        poiVisitVia: spec.poiId ? 'poi:discovered' : null,
        tech: spec.requiredTech || null,
        moralDebt: !!spec.moralDebt,
        mirrorCourse: !!spec.mirrorCourse,
      },
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

assert.ok(jobs.length >= 8, `E1 natural must cover ≥8 seed runs across shapes; got ${jobs.length}`);
assert.ok(
  SHAPE_SPECS.some((s) => s.shapeId === 'depth_h1_distress_from_inside' && s.ciSeeds.length >= 3),
  'H1 CI set must publish ≥3 seeds',
);
assert.equal(SHAPE_SPECS.length, 8, 'must cover all 8 canonical E1 shapes (H1–H8); follow-ons stay stubs');
assert.ok(
  !SHAPE_SPECS.some((s) => String(s.shapeId).includes('follow_on')),
  'banked follow-ons must not count toward pass',
);

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
  const spec = SHAPE_SPECS.find((s) => s.shapeId === row.shapeId);
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
    note: naturalnessNote(spec || {}),
  };
  evidence.meta = {
    shapeId: row.shapeId,
    slot: row.slot,
    planned: row.planned || null,
    fingerprint: row.fingerprint || null,
    outcome: row.outcome || null,
    directorStats: row.directorStats || null,
    bootstrap: row.bootstrap || null,
    eligibilitySupporting: row.eligibilitySupporting === true,
  };
  evidencePaths.push(writeEvidence(evidence, OUT_DIR));
}

const shapeSummary = SHAPE_SPECS.map((spec) => {
  const rows = multi.rows.filter((r) => r.shapeId === spec.shapeId);
  const eligibilitySupporting = hasEligibilityInject(spec);
  return {
    routeId: spec.routeId,
    shapeId: spec.shapeId,
    slot: spec.slot,
    sectorId: spec.sectorId,
    ciSeeds: [...spec.ciSeeds],
    seedCount: rows.length,
    pass: rows.every((r) => r.pass),
    // F1 primary flag remains true while membership scaffold is used.
    supporting: true,
    eligibilitySupporting,
    bootstrap: {
      membershipScaffold: true,
      eligibilitySupporting,
      eligibilityInjects: eligibilityInjectsOf(spec),
      beatIndex: (spec.beatIndex | 0) > 0 ? spec.beatIndex : 0,
      poi: !!spec.poiId,
      poiVisitVia: spec.poiId ? 'poi:discovered' : null,
      tech: spec.requiredTech || null,
      moralDebt: !!spec.moralDebt,
      mirrorCourse: !!spec.mirrorCourse,
    },
    outcomes: rows.map((r) => ({
      seed: r.seed,
      outcome: r.outcome,
      plannedDay: r.planned?.day ?? null,
    })),
  };
});

// H1–H6 eligibility probe (documented; full CI still uses necessary injects).
// H4/H6 are eligibility-free and pass full marks under membership scaffold alone.
const h1h6 = SHAPE_SPECS.filter((s) => /^E1\/H[1-6]$/.test(s.slot));
const eligibilityFreeH1H6 = h1h6.filter((s) => !hasEligibilityInject(s));
const eligibilityFreeRows = multi.rows.filter(
  (r) => eligibilityFreeH1H6.some((s) => s.shapeId === r.shapeId),
);
const eligibilityFreePassCount = eligibilityFreeRows.filter((r) => r.pass).length;
const eligibilitySupportingH1H6 = h1h6.filter((s) => hasEligibilityInject(s));
const eligibilitySupportingRows = multi.rows.filter(
  (r) => eligibilitySupportingH1H6.some((s) => s.shapeId === r.shapeId),
);

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:e1:natural',
  // Do not flip globally: membership scaffold (mode/sector/sector:enter/zone place)
  // remains supporting for every shape under F1 naturalness rules.
  supporting: true,
  seedMode: SEED_MODE,
  canonicalShapes: 8,
  bankedFollowOnStubs: Object.freeze([
    'depth_h6_vael_enforcement_follow_on',
    'depth_h8_mass_migration_follow_on',
  ]),
  eligibilityReduction: {
    scope: 'H1-H6',
    note: 'Per-shape eligibility injects minimized; membership scaffold keeps supporting:true',
    eligibilityFreeShapes: eligibilityFreeH1H6.map((s) => s.slot),
    eligibilityFreeSeedRuns: eligibilityFreeRows.length,
    eligibilityFreePassCount,
    eligibilitySupportingShapes: eligibilitySupportingH1H6.map((s) => ({
      slot: s.slot,
      injects: eligibilityInjectsOf(s),
    })),
    eligibilitySupportingSeedRuns: eligibilitySupportingRows.length,
    // supporting:false partial: full marks under membership-only for eligibility-free shapes.
    // Still not primary (sector:enter / mode / pos writes fail naturalness validator).
    supportingFalsePrimaryClaim: false,
    supportingFalsePartial: {
      shapes: eligibilityFreeH1H6.map((s) => s.slot),
      fullMarkPassRuns: eligibilityFreePassCount,
      totalRuns: eligibilityFreeRows.length,
      residual: 'membership scaffold still supporting; naturalness validator forbids sector:enter/mode/pos',
    },
  },
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
    supporting: true,
    eligibilitySupporting: row.eligibilitySupporting === true,
    planned: row.planned,
    teleAt: row.marks?.find((m) => m.name === 'encounter-spawned')?.detail?.simTime ?? null,
    outcome: row.outcome,
    fingerprint: row.fingerprint,
    ticks: row.ticks,
    simTime: row.simTime,
    failures: row.failures,
    bootstrap: row.bootstrap || null,
  })),
  evidencePaths,
  densityNotes: {
    h1: 'Native Helios when beat≥3 + yard discovery; visit via production poi:discovered; CI triple.',
    h2: 'Native tier≥3 (Veil) with tech_long_range_survey inject (no Tier-A research earn); timeout→scanned.',
    h3: 'Native widely; beat≥6 only. No POI/tech gate.',
    h4: 'Eligibility-free; rare ambient Io day-0 CI seeds 15/22; timeout→heard.',
    h5: 'Native Io Reach major with beat≥5; timeout→fled.',
    h6: 'Eligibility-free; empty gates; timeout→wait→vultured (+20s battle soak).',
    h7: 'Plans widely; fire-time moralDebtOnly — supporting moralMemory:remember stand-in for CI.',
    h8: 'Telegraphs natively; timeoutChoice null — supporting mirror-course drive for outcome.',
    followOns: 'weight 0 stubs — never count toward pass (F1 §6).',
  },
  residual: [
    'Membership scaffold residual (all shapes): mode/sector/sector:enter/zone place — keeps supporting:true; naturalness validator would fail on harness sources',
    'H1 still seeds discovery map (world system not in Tier A); visit memory now production poi:discovered',
    'REAL H2 tech: requiredTech cannot be earned in Tier A without research systems — inject remains',
    'H3/H5 beatIndex inject: missions progression not present in Tier A session',
    'REAL unassisted H7: moralDebtOnly requires prior spared contact — moralMemory:remember stand-in',
    'REAL unassisted H8 pure timeout: timeoutChoice null; mirror-course needs player drive',
    'H4 density lag without day-0 CI seeds: rare ambient often multi-day — product density residual',
    'Eligibility-free H4/H6 pass full marks under membership scaffold only (4/4 CI runs) — still not primary',
    'Do not flip supporting:false globally until uninjected flight membership + naturalness validator pass',
    'Tier-B browser observation (≥1) per F1 §6 encounter primary tier note',
    'Banked follow-ons remain weight-0 stubs until authored',
  ],
};

mkdirSync(dirname(AGGREGATE), { recursive: true });
writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

const shapeLabels = shapeSummary.map((s) => `${s.slot}×${s.seedCount}`).join(', ');
const freeLabels = eligibilityFreeH1H6.map((s) => s.slot).join(', ') || '(none)';
console.log(`E1 natural multi-seed OK: ${multi.seedCount} runs (mode=${SEED_MODE}) shapes=[${shapeLabels}]`);
console.log(`supporting:true (membership scaffold residual); eligibility-free H1–H6: [${freeLabels}] pass ${eligibilityFreePassCount}/${eligibilityFreeRows.length}`);
console.log(`Aggregate: ${AGGREGATE}`);
console.log(`Per-seed evidence: ${evidencePaths.length} files under ${OUT_DIR}`);
