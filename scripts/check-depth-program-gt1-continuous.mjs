#!/usr/bin/env node
// GT1 continuous goldenthread marks path — Tier-A scaffold (F1 contentClass goldenthread).
//
// Spine (required full marks): new-game → candle-fleet → ticker → bearing → unique-wreck → band
//
// Product truth (2026-07-17):
//   - Continuous unassisted first-hour (Tier B, no SF staging, Candle embodied) is NOT ready.
//   - D10 Choir-Tender primary path (ticker→bearing→unique) IS proven and reused here.
//   - Band soak reuses production bandRadio after the same continuous session (no reboot).
//   - Candle Fleet (H1c) is flavor/data only — no live landmark entity → REAL residual.
//
// Honesty contract:
//   - Never claim supporting:false full-spine green while candle-fleet is missing.
//   - Partial green: supporting:true when PARTIAL_MARKS land (D10 primary + band soak).
//   - Full spine missing candle → residual failureClass REAL, not faked.
//
// Prefer reuse of D10 primary production path over inject. No scan/salvage/claim bus injects.
//
// Runner: npm run check:depth-program:gt1:continuous

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
import { TUNABLE_BAND_CHANNEL_IDS } from '../src/data/bandRadio.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import {
  CONTENT_CLASSES,
  D10_CARRIER,
  D10_CI_SEEDS,
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
const AGGREGATE = resolve(ROOT, '.devshots/depth-program/gt1-continuous.json');
const OUT_DIR = resolve(ROOT, '.devshots/depth-program/routes');

export const GT1_CONTINUOUS_ROUTE_ID = 'gt1-continuous-goldenthread';
export const GT1_CI_SEEDS = Object.freeze([...D10_CI_SEEDS]);

/** Full goldenthread spine (F1 §6). Full green requires every mark in order. */
export const GT1_FULL_MARKS = Object.freeze([...REQUIRED_MARKS_BY_CLASS.goldenthread]);

/**
 * Partial supporting contract — continuous D10 primary + band soak without
 * embodied Candle Fleet. Does NOT include candle-fleet (REAL residual H1c).
 */
export const GT1_PARTIAL_MARKS = Object.freeze([
  'new-game',
  'ticker',
  'bearing',
  'unique-wreck',
  'band',
]);

const TARGET = D10_CARRIER.wreckId;
const TARGET_SLOT = uniqueWreckById(TARGET);
const HELIOS_SECTOR = D10_CARRIER.sectorId;

const OBSERVE_EVENTS = Object.freeze([
  'game:started',
  'uniqueWreck:rumorRecorded',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:decisionReady',
  'uniqueWreck:salvaged',
  'uniqueWreck:storyRewardGranted',
  'scan:pulse',
  'salvage:completed',
  'band:status',
  'band:bed',
]);

const CONTINUOUS_SYSTEMS = Object.freeze([
  uniqueWrecks,
  cargo,
  ships,
  scanner,
  mining,
  physics,
  bandRadio,
]);

assert.ok(TARGET_SLOT, `${TARGET} definition must exist`);

const GT1_CONTINUOUS_ROUTE = defineRoute({
  id: GT1_CONTINUOUS_ROUTE_ID,
  contentClass: CONTENT_CLASSES.goldenthread,
  requiredMarks: GT1_FULL_MARKS,
  ciSeeds: [...GT1_CI_SEEDS],
  supporting: true,
  carrier: {
    ...D10_CARRIER,
    goldenthread: 'Candle→ticker→bearing→unique→Band',
    band: 'bandRadio soak after D10 claim',
  },
  steps: [],
  meta: {
    harness: 'check-depth-program-gt1-continuous',
    continuous: true,
    reuses: 'check-depth-program-r2-natural-d10-primary production path',
    productReadyUnassisted: false,
  },
});

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

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

function bootHeliosFlightContext(session) {
  Object.assign(session.state, { mode: 'flight' });
  if (session.state.world) {
    Object.assign(session.state.world, { currentSectorId: HELIOS_SECTOR });
  }
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

/** Honest Candle Fleet embodiment probe (H1c). Observe-only; never injects a landmark. */
function probeCandleFleet(state) {
  const entities = (state.entityList || []).filter((entity) => {
    if (!entity || entity.alive === false) return false;
    const data = entity.data || {};
    const blob = JSON.stringify(data).toLowerCase();
    const name = String(data.name || data.displayName || data.landmarkId || '').toLowerCase();
    return blob.includes('candle')
      || name.includes('candle')
      || blob.includes('landmark_c3')
      || data.landmarkId === 'landmark_c3_candle_fleet'
      || data.flavorTargetRef === 'landmark_c3_candle_fleet';
  }).map((entity) => ({
    id: entity.id,
    type: entity.type,
    name: entity.data?.name || null,
    landmarkId: entity.data?.landmarkId || entity.data?.flavorTargetRef || null,
  }));

  // Data-only memorial zone is not embodiment; only live entities count for the mark.
  return {
    embodied: entities.length > 0,
    entityCount: entities.length,
    entities,
    sectorId: state.world?.currentSectorId || null,
  };
}

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

function settleClaimChoice(session, wreckId, choiceId) {
  const system = session.sim.registry.get('uniqueWrecks');
  assert.ok(system && typeof system.resolvePlayerChoice === 'function',
    'uniqueWrecks must expose public resolvePlayerChoice for Tier-A claims');
  return system.resolvePlayerChoice(wreckId, choiceId, 'gt1-continuous-tier-a-claim');
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
 * Band soak after unique claim — production bandRadio update path.
 * Player-equivalent tune: bus.emit('band:cycle') matches ui/input KeyO / HUD chip.
 * Not a uniqueWreck/scan/salvage inject; F1 naturalness does not forbid band:cycle.
 */
function soakBand(session, { maxCycles = 8, settleTicks = 60 * 2 } = {}) {
  const system = session.sim.registry.get('bandRadio');
  assert.ok(system, 'bandRadio system must be registered for continuous band soak');

  const voices = [];
  const helpers = session.sim.helpers || {};
  // Ensure voice sink so band can speak (production uses helpers.voice.say).
  if (!helpers.voice || typeof helpers.voice.say !== 'function') {
    helpers.voice = {
      say(message) {
        voices.push(message && typeof message === 'object' ? { ...message } : message);
        return true;
      },
    };
    if (session.sim.helpers) Object.assign(session.sim.helpers, helpers);
    system.helpers = { ...(system.helpers || {}), ...helpers };
  }

  let channelId = null;
  let statusSeen = false;
  let bedSeen = false;
  let cycles = 0;

  // Cycle until a tunable channel is selected (off → first channel is production default).
  while (cycles < maxCycles) {
    session.bus.emit('band:cycle', { source: 'gt1-continuous-tier-a-band-cycle' });
    cycles += 1;
    session.runTicks(Math.max(1, settleTicks));
    channelId = session.state.bandRadio?.channelId || null;
    if (channelId && TUNABLE_BAND_CHANNEL_IDS.includes(channelId)) break;
  }

  const statusEvents = session.events.filter((e) => e.event === 'band:status');
  const bedEvents = session.events.filter((e) => e.event === 'band:bed');
  statusSeen = statusEvents.length > 0;
  bedSeen = bedEvents.some((e) => e.payload && e.payload.active === true)
    || bedEvents.length > 0;

  const own = session.state.bandRadio || {};
  const ok = !!(channelId && (statusSeen || own.channelId === channelId));

  return {
    ok,
    channelId,
    cycles,
    statusSeen,
    bedSeen,
    signalStrength: Number(own.signalStrength) || 0,
    effectiveChannelId: own.effectiveChannelId || null,
    voices: voices.length,
    statusCount: statusEvents.length,
    bedCount: bedEvents.length,
  };
}

/**
 * One continuous seed: New Game stand-in → (candle probe) → D10 ticker/bearing/unique → Band.
 * @returns {object} seed evidence row
 */
export function runGt1ContinuousSeed(seed) {
  const wallStart = Date.now();
  const session = createTierASession({
    seed,
    systems: [...CONTINUOUS_SYSTEMS],
    helpers: {
      voice: {
        say(message) {
          return message;
        },
      },
    },
    observeEvents: OBSERVE_EVENTS,
    eventFilter: (eventName, payload) => {
      if (
        eventName === 'game:started'
        || eventName === 'scan:pulse'
        || eventName === 'salvage:completed'
        || eventName === 'band:status'
        || eventName === 'band:bed'
      ) {
        return true;
      }
      return payload?.wreckId === TARGET_SLOT.id || payload?.wreckId === TARGET;
    },
  });

  const marks = [];
  const failures = [];
  const residuals = [];
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

    // --- new-game (Tier-A stand-in for New Game → Helios launch) ---
    stampMark(marks, 'new-game', session, {
      mode: session.state.mode,
      sectorId: session.state.world?.currentSectorId,
      via: 'tier-a-helios-flight-bootstrap',
    });

    // --- candle-fleet (honest probe; no inject) ---
    const candle = probeCandleFleet(session.state);
    if (candle.embodied) {
      stampMark(marks, 'candle-fleet', session, {
        entityCount: candle.entityCount,
        entities: candle.entities,
      });
    } else {
      residuals.push({
        mark: 'candle-fleet',
        failureClass: 'REAL',
        reason: 'H1c Candle Fleet not embodied as a live landmark entity in Helios (flavor/data only)',
        sectorId: candle.sectorId,
        entityCount: 0,
      });
    }

    const before = session.state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.equal(before, undefined, 'D10 must start without a preexisting bearing');

    // --- ticker (D10 native news carrier — reuses primary path) ---
    session.bus.emit('game:started');

    const record = session.state.player.uniqueWrecks?.bearings?.[TARGET];
    assert.ok(record, 'game:started must create the D10 record (ticker carrier)');
    assert.equal(record.phase, 'rumored', 'natural game:start rumor must land in rumored phase');
    assert.equal(record.sectorId, HELIOS_SECTOR, 'D10 record must stay in Helios');
    assert.equal(record.channelId, 'news', 'D10 primary source must be news ticker');
    stampMark(marks, 'ticker', session, {
      channelId: record.channelId,
      sourceRef: record.sourceRef,
      wreckId: TARGET,
      via: 'game:started native news (D10 primary carrier)',
    });

    // --- bearing ---
    assert.ok(Number(record.radius) > 0, 'bearing starts fuzzy (radius > 0)');
    stampMark(marks, 'bearing', session, {
      sectorId: record.sectorId,
      radius: record.radius,
      coordSpace: record.coordSpace,
      phase: record.phase,
    });

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

    let scanAttempts = 0;
    const maxScanAttempts = 8;
    while (record.phase === 'rumored' && scanAttempts < maxScanAttempts) {
      session.scanHere();
      scanAttempts += 1;
      if (record.phase === 'rumored') session.runTicks(Math.ceil(8 * 60));
    }
    assert.equal(record.phase, 'fixed',
      `scanPulse from player pos should harden D10 (attempts=${scanAttempts})`);

    const wreck = liveWreck(session.state, TARGET_SLOT.id);
    assert.ok(wreck, 'D10 must materialize after scan');

    const closeIn = flyToward(session, ship, posXZ(wreck), {
      stopDistance: 40,
      cruiseSpeed: 400,
      maxTicks: 60 * 90,
    });
    assert.equal(closeIn.ok, true, `must reach live wreck by flight (dist=${closeIn.dist})`);

    const salvage = salvageWithMiningBeam(session, record);
    assert.equal(salvage.ok, true,
      `mining beam salvage must open decision (phase=${salvage.phase}, ticks=${salvage.ticks})`);
    assert.equal(record.phase, 'decision', 'salvage must advance to decision');

    const claimChoice = TARGET_SLOT.decision.choices.find((choice) => choice.uniqueDrop);
    assert.ok(claimChoice, 'D10 must have a unique claim branch');
    settleClaimChoice(session, TARGET_SLOT.id, claimChoice.id);
    assert.equal(record.phase, 'salvaged', 'claim choice must resolve D10 to salvaged');

    for (const moduleId of moduleRewards) {
      assert.equal(
        session.state.player.moduleInventory.some((item) => item?.defId === moduleId),
        true,
        `D10 should grant ${moduleId}`,
      );
    }

    // --- unique-wreck (claim durable on continuous session) ---
    stampMark(marks, 'unique-wreck', session, {
      wreckId: TARGET_SLOT.id,
      choiceId: claimChoice.id,
      uniqueDropId: record.rewardReceipt?.uniqueDropId || TARGET_SLOT.uniqueDropId,
      claimPath: 'uniqueWrecks.resolvePlayerChoice',
      salvagePath: 'mining.input.fireGroup=2',
      phase: record.phase,
    });

    // --- band soak (same continuous session; no reboot) ---
    const band = soakBand(session);
    if (!band.ok) {
      failures.push(
        `band soak failed after unique (channelId=${band.channelId}, status=${band.statusSeen})`,
      );
      residuals.push({
        mark: 'band',
        failureClass: 'REAL',
        reason: 'bandRadio did not surface a tunable channel/status after claim soak',
        band,
      });
    } else {
      stampMark(marks, 'band', session, {
        channelId: band.channelId,
        cycles: band.cycles,
        signalStrength: band.signalStrength,
        via: 'band:cycle + bandRadio.update soak (continuous post-unique)',
      });
    }

    const partialCheck = validateMarkSequence(marks, GT1_PARTIAL_MARKS);
    const fullCheck = validateMarkSequence(marks, GT1_FULL_MARKS);
    if (!partialCheck.pass) failures.push(...partialCheck.failures);

    // Full spine incomplete is expected until H1c; do not treat as harness pass failure
    // when residual is documented REAL for candle-fleet only.
    const candleMissing = residuals.some((r) => r.mark === 'candle-fleet' && r.failureClass === 'REAL');
    if (!fullCheck.pass && !candleMissing) {
      for (const msg of fullCheck.failures) {
        if (!failures.includes(msg)) failures.push(msg);
      }
    }

    const wallMs = Date.now() - wallStart;
    const partialPass = partialCheck.pass && failures.length === 0;
    // Full unassisted continuous is NOT product-ready; never green full without candle.
    const fullPass = fullCheck.pass && residuals.length === 0 && failures.length === 0;

    return {
      seed,
      result: partialPass ? 'passed' : 'failed',
      pass: partialPass,
      supporting: true,
      primary: false,
      continuous: true,
      productReadyUnassisted: false,
      fullSpinePass: fullPass,
      sectorId: record.sectorId,
      phaseTrail: ['rumored', 'fixed', 'decision', 'salvaged'],
      marks,
      partialCheck,
      fullCheck,
      residuals,
      candle,
      band,
      claim: {
        choiceId: claimChoice.id,
        path: 'uniqueWrecks.resolvePlayerChoice',
      },
      salvage: {
        ticks: salvage.ticks,
        path: 'mining.input.fireGroup=2',
      },
      approach: {
        toBearingCenterTicks: approach.ticks,
        toWreckTicks: closeIn.ticks,
      },
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
      failureClass: partialPass
        ? (fullPass ? null : 'REAL')
        : (failures.length ? 'REAL' : 'REAL'),
    };
  } catch (error) {
    return {
      seed,
      result: 'failed',
      pass: false,
      supporting: true,
      primary: false,
      continuous: true,
      productReadyUnassisted: false,
      fullSpinePass: false,
      failures: [...failures, String(error?.message || error)],
      residuals,
      marks,
      ticks: session.ticks,
      simTime: session.simTime,
      wallMs: Date.now() - wallStart,
      failureClass: 'REAL',
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

export async function runGt1ContinuousMulti(seeds = GT1_CI_SEEDS) {
  const naturalness = naturalnessForHarness();
  const multi = await runMultiSeed({
    seeds: [...seeds],
    label: 'check:depth-program:gt1:continuous',
    runSeed: runGt1ContinuousSeed,
  });

  // Continuous unassisted is not product-ready → always supporting:true for this gate.
  // Promote supporting:false only when full spine greens without residuals (not today).
  const anyFull = multi.rows.every((row) => row.fullSpinePass === true);
  const supporting = !(anyFull && naturalness.pass && multi.pass);
  const evidencePaths = [];

  for (const row of multi.rows) {
    const evidence = createEvidenceShell({
      routeId: GT1_CONTINUOUS_ROUTE_ID,
      contentClass: CONTENT_CLASSES.goldenthread,
      tier: 'A',
      seed: row.seed,
      supporting: true,
      carrier: { ...GT1_CONTINUOUS_ROUTE.carrier },
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
        fullSpinePass: row.fullSpinePass === true,
        residuals: row.residuals || [],
        candle: row.candle || null,
        band: row.band || null,
        rewardReceipt: row.rewardReceipt || null,
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
    evidence.primary = false;
    evidence.continuous = true;
    evidence.partialMarks = GT1_PARTIAL_MARKS;
    evidence.fullMarks = GT1_FULL_MARKS;
    evidence.partialCheck = row.partialCheck || null;
    evidence.fullCheck = row.fullCheck || null;
    evidence.residuals = row.residuals || [];
    if (!row.fullSpinePass) {
      evidence.failureClass = 'REAL';
    } else if (!evidence.pass) {
      evidence.failureClass = naturalness.pass ? 'REAL' : 'HARNESS';
    }
    const path = writeEvidence(evidence, OUT_DIR);
    evidencePaths.push(path);
  }

  const residualSummary = [];
  for (const row of multi.rows) {
    for (const residual of row.residuals || []) {
      residualSummary.push({ seed: row.seed, ...residual });
    }
  }

  const aggregate = {
    schema: NATURAL_ROUTE_SCHEMA,
    schemaVersion: 1,
    harness: 'check:depth-program:gt1:continuous',
    routeId: GT1_CONTINUOUS_ROUTE_ID,
    contentClass: CONTENT_CLASSES.goldenthread,
    tier: 'A',
    supporting: true,
    primary: false,
    continuous: true,
    productReadyUnassisted: false,
    carrier: { ...GT1_CONTINUOUS_ROUTE.carrier },
    d10Reuse: {
      wreckId: TARGET,
      slot: D10_CARRIER.slot,
      sectorId: HELIOS_SECTOR,
      path: 'scripts/check-depth-program-r2-natural-d10-primary.mjs production sequence',
    },
    seeds: [...seeds],
    ciSeeds: [...GT1_CI_SEEDS],
    seedCount: seeds.length,
    result: multi.pass && naturalness.pass ? 'passed' : 'failed',
    pass: multi.pass && naturalness.pass,
    fullSpinePass: anyFull && naturalness.pass && multi.pass,
    naturalness,
    requiredMarksFull: GT1_FULL_MARKS,
    requiredMarksPartial: GT1_PARTIAL_MARKS,
    residuals: residualSummary,
    residualClasses: [...new Set(residualSummary.map((r) => r.failureClass))],
    rows: multi.rows,
    evidencePaths,
    driver: 'scripts/lib/naturalRoute.mjs',
    notes: [
      'Continuous Tier-A goldenthread marks path: one session, no reboot between beats.',
      'Reuses D10 primary production path (game:started news → flight → scanHere → mining salvage → resolvePlayerChoice).',
      'Band soak via band:cycle + bandRadio.update after unique claim (same session).',
      'Candle Fleet mark omitted when not embodied — REAL residual (H1c), not faked green.',
      'supporting:true until full spine greens without residuals (product-ready unassisted continuous).',
      'Partial green is intentional; full unassisted Tier-B continuous remains residual.',
    ],
  };

  mkdirSync(dirname(AGGREGATE), { recursive: true });
  writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

  return { multi, naturalness, aggregate, supporting, evidencePaths };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === HARNESS_PATH;
if (isMain) {
  const { multi, naturalness, aggregate, supporting } = await runGt1ContinuousMulti();

  assert.ok(GT1_CI_SEEDS.length >= 2, 'continuous harness requires ≥2 CI seeds');
  assert.equal(multi.rows.length, GT1_CI_SEEDS.length, 'must execute every CI seed');
  assert.equal(naturalness.pass, true,
    `naturalness validator must pass: ${naturalness.failures.join('; ')}`);

  // Fail closed on partial path: D10 + band must work.
  assert.equal(multi.pass, true,
    `partial continuous marks must pass: ${multi.rows.flatMap((r) => r.failures || []).join('; ')}`);
  assert.equal(aggregate.pass, true, 'aggregate partial continuous must pass');
  assert.equal(supporting, true,
    'continuous gate must remain supporting:true while unassisted full spine is not product-ready');
  assert.equal(aggregate.fullSpinePass, false,
    'must not claim full goldenthread spine green without embodied Candle Fleet');

  for (const row of multi.rows) {
    assert.equal(row.supporting, true, `seed ${row.seed} must be supporting`);
    assert.equal(row.fullSpinePass, false, `seed ${row.seed} must not fake full spine`);
    const partial = validateMarkSequence(row.marks || [], GT1_PARTIAL_MARKS);
    assert.equal(partial.pass, true,
      `seed ${row.seed} missing partial marks: ${partial.missing.join(', ')}`);
    assert.ok(
      (row.residuals || []).some((r) => r.mark === 'candle-fleet' && r.failureClass === 'REAL'),
      `seed ${row.seed} must document REAL residual for missing candle-fleet`,
    );
    assert.equal(
      (row.marks || []).some((m) => m.name === 'candle-fleet'),
      false,
      `seed ${row.seed} must not stamp candle-fleet without embodiment`,
    );
  }

  console.log(`GT1 continuous PARTIAL OK: ${multi.rows.length} seeds (supporting:true)`);
  console.log(`Full spine: pass=${aggregate.fullSpinePass} (expected false until H1c Candle embodied)`);
  console.log(`Residuals: ${aggregate.residuals.map((r) => `${r.mark}:${r.failureClass}`).join(', ')}`);
  console.log(`Naturalness: pass=${naturalness.pass}`);
  console.log(`Aggregate: ${AGGREGATE}`);
  console.log(`Per-seed evidence under: ${OUT_DIR}/${GT1_CONTINUOUS_ROUTE_ID}/`);
}
