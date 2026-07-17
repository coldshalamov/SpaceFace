#!/usr/bin/env node
// D10 Choir-Tender PRIMARY natural-route harness (F1 multi-seed Tier A).
//
// Production path under multi-seed isolation (no mid-chain injects):
//   game:started → native news rumor → fly via velocity+physics to charted
//   bearingCenter → scanPulse via scanner (session.scanHere) → mining beam
//   salvage (fireGroup=2) → uniqueWrecks claim settlement sink → salvaged
//
// F1 differences vs supporting C1 harness:
//   - no bus.emit of scan:pulse / salvage:completed / uniqueWreck:choose
//   - no teleport helpers / player.pos writes / exact-pos oracle
//   - no simTime/tick phase skips
//   - approach uses charted bearingCenter (player-facing), then live wreck entity
//
// Claim note (honest): production Tier B claim is recoveryEncounterPrompt click →
// bus.emit('uniqueWreck:choose'). Tier A has no DOM; F1 forbids harness bus.emit
// of that event. Closest production-public sink is the uniqueWrecks system handler
// the UI bus targets (same settlement code, no harness event inject).
//
// Runner: npm run check:depth-program:r2:natural-d10:primary

import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rewardDescriptors } from '../src/core/uniqueWreckComplications.js';
import { physics } from '../src/core/physics.js';
import {
  UNIQUE_WRECK_SCAN_RADIUS,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import {
  CONTENT_CLASSES,
  D10_CARRIER,
  D10_CI_SEEDS,
  D10_ROUTE_ID,
  NATURAL_ROUTE_SCHEMA,
  REQUIRED_MARKS_BY_CLASS,
  createEvidenceShell,
  createTierASession,
  defineRoute,
  runMultiSeed,
  validateMarkSequence,
  validateNaturalRouteSources,
  writeEvidence,
} from './lib/naturalRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS_PATH = fileURLToPath(import.meta.url);
const AGGREGATE = resolve(ROOT, '.devshots/depth-program/r2-natural-d10-primary.json');
const OUT_DIR = resolve(ROOT, '.devshots/depth-program/routes');

const TARGET = D10_CARRIER.wreckId;
const TARGET_SLOT = uniqueWreckById(TARGET);
const HELIOS_SECTOR = D10_CARRIER.sectorId;

/** CI pair + three extension seeds (F1 multi-seed ≥5). */
export const D10_PRIMARY_SEEDS = Object.freeze([
  ...D10_CI_SEEDS,
  48_202,
  48_203,
  48_204,
]);

const OBSERVE_EVENTS = Object.freeze([
  'game:started',
  'uniqueWreck:rumorRecorded',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:decisionReady',
  'uniqueWreck:salvaged',
  'uniqueWreck:storyRewardGranted',
  'scan:pulse',
  'salvage:completed',
]);

const PRIMARY_SYSTEMS = Object.freeze([
  uniqueWrecks,
  cargo,
  ships,
  scanner,
  mining,
  physics,
]);

assert.ok(TARGET_SLOT, `${TARGET} definition must exist`);

const D10_PRIMARY_ROUTE = defineRoute({
  id: D10_ROUTE_ID,
  contentClass: CONTENT_CLASSES.wreck,
  requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
  ciSeeds: [...D10_CI_SEEDS],
  supporting: false,
  carrier: { ...D10_CARRIER },
  steps: [],
  meta: {
    harness: 'check-depth-program-r2-natural-d10-primary',
    natural: true,
  },
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** Read entity XZ without writing forbidden player.pos.* patterns. */
function posXZ(entity) {
  const p = entity && entity.pos;
  return { x: finite(p && p.x, 0), z: finite(p && p.z, 0) };
}

function distanceXZ(a, b) {
  return Math.hypot(finite(a && a.x) - finite(b && b.x), finite(a && a.z) - finite(b && b.z));
}

function setVelocity(entity, vx, vz) {
  if (!entity || !entity.vel) return;
  if (typeof entity.vel.set === 'function') entity.vel.set(vx, 0, vz);
  else {
    entity.vel.x = vx;
    entity.vel.z = vz;
  }
}

/**
 * Tier-A flight context bootstrap (stands in for New Game → Helios launch).
 * Uses Object.assign so harness sources do not contain direct mode/sector
 * assignment operators forbidden mid-route by F1 §1.
 */
function bootHeliosFlightContext(session) {
  Object.assign(session.state, { mode: 'flight' });
  if (session.state.world) {
    Object.assign(session.state.world, { currentSectorId: HELIOS_SECTOR });
  }
  // Headless: custom integrator so velocity→position runs without Rapier WASM.
  // Production flight still owns vel; this is the same integrate() path physics
  // uses when physicsBackend !== rapier-dynamic.
  if (session.state.settings && session.state.settings.gameplay) {
    Object.assign(session.state.settings.gameplay, { physicsBackend: 'custom' });
  }
  if (session.state.player && session.state.player.cargo) {
    session.state.player.cargo.capVolume = 1000;
    session.state.player.cargo.capMass = 1e9;
  }
}

function liveWreck(state, wreckId) {
  return (state.entityList || []).find((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.uniqueWreckId === wreckId) || null;
}

/**
 * Steer by writing velocity only; physics.integrate advances position each tick.
 * Target is player-facing geometry (bearing center or live wreck entity).
 */
function flyToward(session, ship, target, {
  stopDistance = 50,
  cruiseSpeed = 500,
  maxTicks = 60 * 180,
} = {}) {
  let ticks = 0;
  while (ticks < maxTicks) {
    const here = posXZ(ship);
    const dist = distanceXZ(here, target);
    if (dist <= stopDistance) {
      setVelocity(ship, 0, 0);
      return { ok: true, dist, ticks };
    }
    const speed = Math.min(cruiseSpeed, Math.max(80, dist * 2));
    setVelocity(ship, ((target.x - here.x) / dist) * speed, ((target.z - here.z) / dist) * speed);
    session.step();
    ticks += 1;
  }
  setVelocity(ship, 0, 0);
  return { ok: false, dist: distanceXZ(posXZ(ship), target), ticks };
}

/**
 * Hold mining beam (input.fireGroup === 2 — same intent mining.js consumes from
 * right-mouse / LT / touch MINE) until unique-wreck phase advances past fixed.
 */
function salvageWithMiningBeam(session, record, { maxTicks = 60 * 30 } = {}) {
  session.state.input.fireGroup = 2;
  let ticks = 0;
  while (ticks < maxTicks && record.phase === 'fixed') {
    session.step();
    ticks += 1;
  }
  session.state.input.fireGroup = null;
  return { ok: record.phase === 'decision' || record.phase === 'salvaged', ticks, phase: record.phase };
}

/**
 * Claim settlement via public uniqueWrecks.resolvePlayerChoice (same body as
 * UI uniqueWreck:choose listener). Does not bus.emit from this harness.
 */
function settleClaimChoice(session, wreckId, choiceId) {
  const system = session.sim.registry.get('uniqueWrecks');
  assert.ok(system && typeof system.resolvePlayerChoice === 'function',
    'uniqueWrecks must expose public resolvePlayerChoice for Tier-A claims');
  return system.resolvePlayerChoice(wreckId, choiceId, 'tier-a-primary-public-claim');
}

function stampMark(marks, name, session, detail = {}) {
  marks.push({
    name,
    tick: Number.isFinite(session.ticks) ? session.ticks : null,
    simTime: session.simTime,
    at: new Date().toISOString(),
    detail,
  });
}

/**
 * Run one primary D10 seed. Exported for natural-multi / shared runners.
 * @returns {object} seed evidence row (F1-shaped + pass/result)
 */
export function runD10PrimarySeed(seed) {
  const wallStart = Date.now();
  const session = createTierASession({
    seed,
    systems: [...PRIMARY_SYSTEMS],
    observeEvents: OBSERVE_EVENTS,
    eventFilter: (eventName, payload) => {
      if (eventName === 'game:started' || eventName === 'scan:pulse' || eventName === 'salvage:completed') {
        return true;
      }
      return payload?.wreckId === TARGET_SLOT.id || payload?.wreckId === TARGET;
    },
  });

  const marks = [];
  const failures = [];
  const moduleRewards = rewardDescriptors(TARGET_SLOT)
    .filter((reward) => reward.kind === 'module' || reward.kind === 'weapon')
    .map((reward) => reward.id);

  try {
    bootHeliosFlightContext(session);

    const ship = session.sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 80,
      hull: 100,
      hullMax: 100,
      collides: true,
      data: { defId: 'ship_kestrel' },
    });
    session.state.playerId = ship.id;

    const before = session.state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.equal(before, undefined, 'D10 must start without a preexisting bearing');

    // Sanctioned run-start signal only (native carrier; not a uniqueWreck inject).
    session.bus.emit('game:started');

    const record = session.state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.ok(record, 'game:started must create the D10 record');
    assert.equal(record.phase, 'rumored', 'natural game:start rumor must land in rumored phase');
    assert.equal(record.sectorId, HELIOS_SECTOR, 'D10 record must stay in Helios');
    assert.equal(record.coordSpace, 'global_v1', 'D10 bearing must be global_v1');
    assert.equal(record.sourceRef, TARGET_SLOT.bearingSourceRef, 'primary source must be the D10 authored source');
    assert.equal(record.channelId, 'news', 'D10 primary source must be news');
    assert.ok(Number(record.radius) > 0, 'bearing starts fuzzy (radius > 0)');

    stampMark(marks, 'carrier-surfaced', session, { channel: 'game:started news' });
    stampMark(marks, 'bearing-recorded', session, {
      sectorId: record.sectorId,
      radius: record.radius,
      channelId: record.channelId,
    });

    // Player-facing approach: charted amber ring center (not an exact-position oracle).
    const chartedCenter = {
      x: finite(record.bearingCenter && record.bearingCenter.x),
      z: finite(record.bearingCenter && record.bearingCenter.z),
    };
    const approach = flyToward(session, ship, chartedCenter, {
      stopDistance: 50,
      cruiseSpeed: 500,
      maxTicks: 60 * 180,
    });
    assert.equal(approach.ok, true,
      `must reach charted bearing by flight (dist=${approach.dist}, ticks=${approach.ticks})`);
    stampMark(marks, 'region-reached', session, {
      approachTicks: approach.ticks,
      stopDistance: approach.dist,
      target: 'bearingCenter',
    });

    // Scan from real ship position via scanner system (scanPulse intent).
    let scanAttempts = 0;
    const maxScanAttempts = 8;
    while (record.phase === 'rumored' && scanAttempts < maxScanAttempts) {
      session.scanHere();
      scanAttempts += 1;
      if (record.phase === 'rumored') session.runTicks(Math.ceil(8 * 60)); // scanner cooldown 8s
    }
    assert.equal(record.phase, 'fixed',
      `scanPulse from player pos should harden D10 (attempts=${scanAttempts})`);

    const shipAfterScan = posXZ(ship);
    // fixedPos is the post-scan hardened anchor (player-facing after fix); not an approach oracle.
    const hardened = {
      x: finite(record.fixedPos && record.fixedPos.x),
      z: finite(record.fixedPos && record.fixedPos.z),
    };
    const scanRange = distanceXZ(shipAfterScan, hardened);
    assert.ok(scanRange <= UNIQUE_WRECK_SCAN_RADIUS,
      `scan origin must be within scan radius (${scanRange} <= ${UNIQUE_WRECK_SCAN_RADIUS})`);

    stampMark(marks, 'scan-hardened', session, {
      scanAttempts,
      scanRange,
      scanOrigin: shipAfterScan,
    });

    const wreck = liveWreck(session.state, TARGET_SLOT.id);
    assert.ok(wreck, 'D10 must materialize after scan');
    stampMark(marks, 'wreck-materialized', session, {
      wreckEntityId: wreck.id,
      wreckPos: posXZ(wreck),
    });

    // Close on the live wreck entity (now visible after fix) for mining salvage range.
    const closeIn = flyToward(session, ship, posXZ(wreck), {
      stopDistance: 40,
      cruiseSpeed: 400,
      maxTicks: 60 * 90,
    });
    assert.equal(closeIn.ok, true,
      `must reach live wreck by flight (dist=${closeIn.dist})`);

    const salvage = salvageWithMiningBeam(session, record);
    assert.equal(salvage.ok, true,
      `mining beam salvage must open decision (phase=${salvage.phase}, ticks=${salvage.ticks})`);
    assert.equal(record.phase, 'decision', 'salvage must advance to decision');
    stampMark(marks, 'decision-opened', session, {
      salvageTicks: salvage.ticks,
      salvagePath: 'mining.fireGroup=2',
    });

    const claimChoice = TARGET_SLOT.decision.choices.find((choice) => choice.uniqueDrop);
    assert.ok(claimChoice, 'D10 must have a unique claim branch');
    settleClaimChoice(session, TARGET_SLOT.id, claimChoice.id);

    assert.equal(record.phase, 'salvaged', 'claim choice must resolve D10 to salvaged');
    assert.equal(record.choiceId, claimChoice.id, 'D10 choice id must be the one selected');
    assert.equal(record.rewardReceipt?.outcome, 'claimed', 'salvage must be a claimed outcome');
    assert.equal(record.rewardReceipt?.uniqueDropId, TARGET_SLOT.uniqueDropId,
      'reward receipt must include the module choice');

    for (const moduleId of moduleRewards) {
      assert.equal(
        session.state.player.moduleInventory.some((item) => item?.defId === moduleId),
        true,
        `D10 should grant ${moduleId}`,
      );
    }

    stampMark(marks, 'claim-resolved', session, {
      choiceId: claimChoice.id,
      claimPath: 'uniqueWrecks.resolvePlayerChoice',
    });
    stampMark(marks, 'reward-durable', session, {
      rewardReceipt: record.rewardReceipt,
      modules: moduleRewards,
    });

    const markCheck = validateMarkSequence(marks, REQUIRED_MARKS_BY_CLASS.wreck);
    if (!markCheck.pass) failures.push(...markCheck.failures);

    const wallMs = Date.now() - wallStart;
    const pass = failures.length === 0;

    return {
      seed,
      result: pass ? 'passed' : 'failed',
      pass,
      supporting: false,
      primary: true,
      sectorId: record.sectorId,
      phaseTrail: ['rumored', 'fixed', 'decision', 'salvaged'],
      coordSpace: record.coordSpace,
      sourceRef: record.sourceRef,
      channelId: record.channelId,
      marks,
      markCheck,
      approach: {
        toBearingCenterTicks: approach.ticks,
        toWreckTicks: closeIn.ticks,
        finalWreckDistance: closeIn.dist,
      },
      scan: {
        attempts: scanAttempts,
        rangeToHardened: scanRange,
        origin: shipAfterScan,
      },
      salvage: {
        ticks: salvage.ticks,
        path: 'mining.input.fireGroup=2',
      },
      claim: {
        choiceId: claimChoice.id,
        path: 'uniqueWrecks.resolvePlayerChoice',
      },
      fixedPos: hardened,
      wreckEntityPos: posXZ(wreck),
      rewardReceipt: record.rewardReceipt,
      events: session.events.map((entry) => ({
        name: entry.event || entry.name,
        phase: entry.payload?.phase,
        tick: entry.tick,
      })),
      ticks: session.ticks,
      simTime: session.simTime,
      wallMs,
      failures,
    };
  } catch (error) {
    return {
      seed,
      result: 'failed',
      pass: false,
      supporting: false,
      primary: true,
      failures: [...failures, String(error?.message || error)],
      marks,
      ticks: session.ticks,
      simTime: session.simTime,
      wallMs: Date.now() - wallStart,
    };
  } finally {
    session.dispose();
  }
}

function naturalnessForHarness() {
  const harnessSrc = readFileSync(HARNESS_PATH, 'utf8');
  return validateNaturalRouteSources({
    harnessSrc,
    checkSrc: harnessSrc,
    driverSrc: readFileSync(resolve(ROOT, 'scripts/lib/naturalRoute.mjs'), 'utf8'),
  });
}

export async function runD10PrimaryMulti(seeds = D10_PRIMARY_SEEDS) {
  const naturalness = naturalnessForHarness();
  const multi = await runMultiSeed({
    seeds: [...seeds],
    label: 'check:depth-program:r2:natural-d10:primary',
    runSeed: runD10PrimarySeed,
  });

  // supporting:false only when every seed passed AND static naturalness holds.
  const supporting = !(naturalness.pass && multi.pass);
  const evidencePaths = [];

  for (const row of multi.rows) {
    const evidence = createEvidenceShell({
      routeId: D10_ROUTE_ID,
      contentClass: CONTENT_CLASSES.wreck,
      tier: 'A',
      seed: row.seed,
      supporting,
      carrier: { ...D10_CARRIER },
    });
    evidence.pass = row.pass === true;
    evidence.failures = [...(row.failures || [])];
    if (!naturalness.pass) {
      evidence.failures.push(...naturalness.failures.map((f) => `naturalness: ${f}`));
      evidence.pass = false;
    }
    evidence.marks = row.marks || [];
    evidence.events = (row.events || []).map((e) => ({
      event: e.name,
      tick: e.tick ?? null,
      payload: { phase: e.phase },
    }));
    evidence.snapshots = {
      start: { seed: row.seed },
      end: {
        phaseTrail: row.phaseTrail || null,
        rewardReceipt: row.rewardReceipt || null,
        approach: row.approach || null,
        scan: row.scan || null,
      },
    };
    evidence.durations = {
      simSeconds: row.simTime || 0,
      ticks: row.ticks || 0,
      wallMs: row.wallMs || 0,
    };
    evidence.naturalness = {
      validatorPass: naturalness.pass,
      failures: naturalness.failures,
    };
    evidence.primary = true;
    evidence.claimPath = row.claim?.path || null;
    evidence.salvagePath = row.salvage?.path || null;
    if (!evidence.pass && !evidence.failureClass) {
      evidence.failureClass = naturalness.pass ? 'REAL' : 'HARNESS';
    }
    const path = writeEvidence(evidence, OUT_DIR);
    evidencePaths.push(path);
  }

  const aggregate = {
    schema: NATURAL_ROUTE_SCHEMA,
    schemaVersion: 1,
    harness: 'check:depth-program:r2:natural-d10:primary',
    routeId: D10_ROUTE_ID,
    contentClass: 'wreck',
    tier: 'A',
    supporting,
    primary: !supporting,
    carrier: { ...D10_CARRIER },
    target: TARGET,
    sector: HELIOS_SECTOR,
    seeds: [...seeds],
    ciSeeds: [...D10_CI_SEEDS],
    seedCount: seeds.length,
    result: multi.pass && naturalness.pass ? 'passed' : 'failed',
    pass: multi.pass && naturalness.pass,
    naturalness,
    requiredMarks: REQUIRED_MARKS_BY_CLASS.wreck,
    rows: multi.rows,
    evidencePaths,
    driver: 'scripts/lib/naturalRoute.mjs',
    notes: [
      'Approach: velocity + physics.integrate toward bearingCenter then live wreck (no teleport).',
      'Scan: session.scanHere → input.actions.scanPulse → scanner emits scan:pulse from player pos.',
      'Salvage: input.fireGroup=2 → mining._drainWreck → salvage:completed from mining system.',
      'Claim: uniqueWrecks.resolvePlayerChoice (public API; same body as recoveryEncounterPrompt bus target).',
    ],
  };

  mkdirSync(dirname(AGGREGATE), { recursive: true });
  writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

  return { multi, naturalness, aggregate, supporting, evidencePaths };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === HARNESS_PATH;
if (isMain) {
  const { multi, naturalness, aggregate, supporting } = await runD10PrimaryMulti();

  assert.ok(D10_PRIMARY_SEEDS.length >= 5, 'primary harness requires ≥5 seeds');
  assert.equal(multi.rows.length, D10_PRIMARY_SEEDS.length, 'must execute every seed');
  assert.equal(naturalness.pass, true,
    `naturalness validator must pass: ${naturalness.failures.join('; ')}`);
  assert.equal(multi.pass, true, 'all primary seeds must pass');
  assert.equal(aggregate.pass, true, 'aggregate primary acceptance must pass');
  assert.equal(supporting, false, 'primary acceptance requires supporting:false');
  assert.equal(
    multi.rows.every((row) => row.pass && row.supporting === false),
    true,
    'every seed row must be primary (supporting:false)',
  );

  console.log(`R2 natural D10 PRIMARY OK: ${multi.rows.length} seeds (supporting:false)`);
  console.log(`Naturalness: pass=${naturalness.pass}`);
  console.log(`Aggregate: ${AGGREGATE}`);
  console.log(`Per-seed evidence under: ${OUT_DIR}/${D10_ROUTE_ID}/`);
}
