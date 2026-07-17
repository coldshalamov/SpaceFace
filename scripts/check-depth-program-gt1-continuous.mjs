#!/usr/bin/env node
// GT1 continuous goldenthread marks path — Tier-A scaffold (F1 contentClass goldenthread).
//
// Spine (required full marks): new-game → candle-fleet → ticker → bearing → unique-wreck → band
//
// Product truth (2026-07-17, H1c embody):
//   - poi_memorial stamps flavorTargetRef=landmark_c3_candle_fleet on Helios sector entry
//     (production world.enterSector — no landmark inject).
//   - probeCandleFleet observes that live entity → stamps candle-fleet when present.
//   - D10 Choir-Tender primary path (ticker→bearing→unique) is proven and reused here.
//   - Band soak reuses production bandRadio after the same continuous session (no reboot).
//   - Multi-seed: CI pair D10_CI_SEEDS (≥2) by default; GT1_CONTINUOUS_SEED_MODE=held-out for
//     naturalRouteSeeds held-out set.
//
// Honesty contract:
//   - Full spine marks pass → supporting:false (Tier-A continuous goldenthread marks).
//   - Else supporting:true with honest mark residual (candle-fleet REAL when missing).
//   - When full spine greens, product residual is Electron dual-platform / Tier-B only —
//     never claim dual-platform primaryAcceptance or unassisted Playwright continuous DONE.
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
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { world } from '../src/systems/world.js';
import {
  CONTENT_CLASSES,
  D10_CARRIER,
  D10_CI_SEEDS,
  NATURAL_ROUTE_SCHEMA,
  REQUIRED_MARKS_BY_CLASS,
  createEvidenceShell,
  createTierASession,
  defineRoute,
  loadHeldOutSeeds,
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

/** CI pair (≥2) by default; set GT1_CONTINUOUS_SEED_MODE=held-out for held-out multi-seed. */
export function resolveGt1ContinuousSeeds(mode = process.env.GT1_CONTINUOUS_SEED_MODE || 'ci') {
  const normalized = String(mode || 'ci').toLowerCase();
  if (normalized === 'held-out' || normalized === 'heldout') {
    const held = [...loadHeldOutSeeds()];
    if (held.length < 2) {
      throw new Error(`held-out seed set requires ≥2 seeds; got ${held.length}`);
    }
    return Object.freeze(held);
  }
  if (GT1_CI_SEEDS.length < 2) {
    throw new Error(`GT1 CI seeds must publish ≥2; got ${GT1_CI_SEEDS.length}`);
  }
  return GT1_CI_SEEDS;
}

/** Product residual when Tier-A full spine greens — dual-platform remains open. */
export const GT1_ELECTRON_DUAL_PLATFORM_RESIDUAL = Object.freeze({
  mark: 'electron-dual-platform',
  failureClass: 'REAL',
  reason: 'Tier-A continuous full spine does not close Electron dual-platform / Tier-B unassisted continuous primaryAcceptance',
});

/** Full goldenthread spine (F1 §6). Full green requires every mark in order. */
export const GT1_FULL_MARKS = Object.freeze([...REQUIRED_MARKS_BY_CLASS.goldenthread]);

/**
 * Partial supporting contract — continuous D10 primary + band soak.
 * Candle-fleet is optional here (full spine requires it via GT1_FULL_MARKS).
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
  spawnBudget,
  world,
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
  // Route shell defaults supporting; multi runner promotes supporting:false when full spine greens.
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
    candleCarrier: 'world.enterSector → poi_memorial flavorTargetRef=landmark_c3_candle_fleet',
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
  // Sector ownership is finalized by production world.enterSector after player spawn
  // (materializes poi_memorial Candle Fleet). Do not assign currentSectorId here.
  if (session.state.settings && session.state.settings.gameplay) {
    Object.assign(session.state.settings.gameplay, { physicsBackend: 'custom' });
  }
  if (session.state.player && session.state.player.cargo) {
    session.state.player.cargo.capVolume = 1000;
    session.state.player.cargo.capMass = 1e9;
  }
}

/**
 * Production Helios entry — same path main.js uses at boot.
 * Materializes poi_memorial with flavorTargetRef=landmark_c3_candle_fleet (H1c).
 * Observe-only after: never injects a landmark entity.
 */
function enterHeliosForCandle(session) {
  const worldSys = session.sim.registry.get('world');
  assert.ok(worldSys && typeof worldSys.enterSector === 'function',
    'world.enterSector required to materialize Candle Fleet memorial');
  worldSys.enterSector(HELIOS_SECTOR, {
    placePlayer: true,
    fromSectorId: null,
  });
  assert.equal(
    session.state.world?.currentSectorId,
    HELIOS_SECTOR,
    'enterSector must land Helios for continuous goldenthread',
  );
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
  let candle = null;
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

    // Materialize Helios POIs (poi_memorial + flavorTargetRef) via production enterSector.
    enterHeliosForCandle(session);

    // --- new-game (Tier-A stand-in for New Game → Helios launch) ---
    stampMark(marks, 'new-game', session, {
      mode: session.state.mode,
      sectorId: session.state.world?.currentSectorId,
      via: 'tier-a-helios-flight-bootstrap+world.enterSector',
    });

    // --- candle-fleet (honest probe; stamp only when live entity present) ---
    candle = probeCandleFleet(session.state);
    if (candle.embodied) {
      stampMark(marks, 'candle-fleet', session, {
        entityCount: candle.entityCount,
        entities: candle.entities,
        via: 'world.enterSector → live poi_memorial flavorTargetRef',
      });
    } else {
      residuals.push({
        mark: 'candle-fleet',
        failureClass: 'REAL',
        reason: 'H1c Candle Fleet not embodied as a live landmark entity in Helios after world.enterSector',
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

    // Full spine incomplete is only non-fatal when candle residual is honestly REAL.
    // When candle is embodied, missing full marks (or unstamped candle) must fail.
    const candleMissing = residuals.some((r) => r.mark === 'candle-fleet' && r.failureClass === 'REAL');
    const candleMarked = marks.some((m) => m.name === 'candle-fleet');
    if (candle.embodied && !candleMarked) {
      failures.push('candle-fleet embodied but mark not stamped');
    }
    if (candle.embodied && candleMissing) {
      failures.push('candle-fleet embodied but REAL residual still recorded');
    }
    if (!fullCheck.pass && !candleMissing) {
      for (const msg of fullCheck.failures) {
        if (!failures.includes(msg)) failures.push(msg);
      }
    }

    const wallMs = Date.now() - wallStart;
    const partialPass = partialCheck.pass && failures.length === 0;
    // Full Tier-A spine greens when candle is embodied and every mark lands (no residuals).
    // productReadyUnassisted stays false — Tier-B unassisted continuous is separate.
    const fullPass = fullCheck.pass && residuals.length === 0 && failures.length === 0
      && candle.embodied === true && candleMarked;

    return {
      seed,
      result: partialPass ? 'passed' : 'failed',
      pass: partialPass,
      // supporting:false when this seed's full goldenthread spine greens.
      // primary stays false — dual-platform primaryAcceptance is a separate residual.
      supporting: !fullPass,
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
      candle,
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

export async function runGt1ContinuousMulti(seeds = resolveGt1ContinuousSeeds()) {
  const naturalness = naturalnessForHarness();
  const multi = await runMultiSeed({
    seeds: [...seeds],
    label: 'check:depth-program:gt1:continuous',
    runSeed: runGt1ContinuousSeed,
  });

  // supporting:false only when every seed full-spine greens AND naturalness holds.
  const anyFull = multi.rows.every((row) => row.fullSpinePass === true);
  const supporting = !(anyFull && naturalness.pass && multi.pass);
  const fullSpinePass = anyFull && naturalness.pass && multi.pass;

  const residualSummary = [];
  for (const row of multi.rows) {
    for (const residual of row.residuals || []) {
      residualSummary.push({ seed: row.seed, ...residual });
    }
  }

  // When Tier-A full spine greens, honest product residual is Electron dual-platform only.
  const productResiduals = fullSpinePass
    ? [{ ...GT1_ELECTRON_DUAL_PLATFORM_RESIDUAL }]
    : [];

  const evidencePaths = [];

  for (const row of multi.rows) {
    const evidence = createEvidenceShell({
      routeId: GT1_CONTINUOUS_ROUTE_ID,
      contentClass: CONTENT_CLASSES.goldenthread,
      tier: 'A',
      seed: row.seed,
      supporting: row.fullSpinePass === true ? false : true,
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
    evidence.supporting = row.fullSpinePass === true ? false : true;
    evidence.continuous = true;
    evidence.partialMarks = GT1_PARTIAL_MARKS;
    evidence.fullMarks = GT1_FULL_MARKS;
    evidence.partialCheck = row.partialCheck || null;
    evidence.fullCheck = row.fullCheck || null;
    evidence.residuals = row.residuals || [];
    evidence.productResiduals = productResiduals;
    if (!row.fullSpinePass) {
      evidence.failureClass = 'REAL';
    } else if (!evidence.pass) {
      evidence.failureClass = naturalness.pass ? 'REAL' : 'HARNESS';
    } else {
      evidence.failureClass = null;
    }
    const path = writeEvidence(evidence, OUT_DIR);
    evidencePaths.push(path);
  }

  const aggregate = {
    schema: NATURAL_ROUTE_SCHEMA,
    schemaVersion: 1,
    harness: 'check:depth-program:gt1:continuous',
    routeId: GT1_CONTINUOUS_ROUTE_ID,
    contentClass: CONTENT_CLASSES.goldenthread,
    tier: 'A',
    supporting,
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
    fullSpinePass,
    naturalness,
    requiredMarksFull: GT1_FULL_MARKS,
    requiredMarksPartial: GT1_PARTIAL_MARKS,
    residuals: residualSummary,
    residualClasses: [...new Set(residualSummary.map((r) => r.failureClass))],
    productResiduals,
    rows: multi.rows,
    evidencePaths,
    driver: 'scripts/lib/naturalRoute.mjs',
    notes: [
      'Continuous Tier-A goldenthread marks path: one session, no reboot between beats.',
      'Reuses D10 primary production path (game:started news → flight → scanHere → mining salvage → resolvePlayerChoice).',
      'Band soak via band:cycle + bandRadio.update after unique claim (same session).',
      'Candle Fleet: world.enterSector materializes poi_memorial with flavorTargetRef=landmark_c3_candle_fleet; probe stamps candle-fleet when live.',
      'supporting:false when full spine greens on every seed; else supporting:true with honest mark residual.',
      'When full spine greens, product residual is Electron dual-platform only (Tier-B unassisted continuous not claimed).',
      'Multi-seed: CI pair ≥2 by default; GT1_CONTINUOUS_SEED_MODE=held-out uses naturalRouteSeeds held-out set.',
    ],
  };

  mkdirSync(dirname(AGGREGATE), { recursive: true });
  writeFileSync(AGGREGATE, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

  return { multi, naturalness, aggregate, supporting, evidencePaths };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === HARNESS_PATH;
if (isMain) {
  const seeds = resolveGt1ContinuousSeeds();
  const { multi, naturalness, aggregate, supporting } = await runGt1ContinuousMulti(seeds);

  assert.ok(seeds.length >= 2, 'continuous harness requires multi-seed ≥2 (CI pair or held-out)');
  assert.equal(multi.rows.length, seeds.length, 'must execute every seed');
  assert.equal(naturalness.pass, true,
    `naturalness validator must pass: ${naturalness.failures.join('; ')}`);

  // Fail closed: continuous marks path must work (partial or full).
  assert.equal(multi.pass, true,
    `continuous marks must pass: ${multi.rows.flatMap((r) => r.failures || []).join('; ')}`);
  assert.equal(aggregate.pass, true, 'aggregate continuous must pass');

  for (const row of multi.rows) {
    const partial = validateMarkSequence(row.marks || [], GT1_PARTIAL_MARKS);
    assert.equal(partial.pass, true,
      `seed ${row.seed} missing partial marks: ${partial.missing.join(', ')}`);

    const candleEmbodied = row.candle?.embodied === true;
    const candleMarked = (row.marks || []).some((m) => m.name === 'candle-fleet');
    const candleResidual = (row.residuals || []).some(
      (r) => r.mark === 'candle-fleet' && r.failureClass === 'REAL',
    );

    if (candleEmbodied) {
      assert.equal(candleMarked, true,
        `seed ${row.seed}: embodied Candle Fleet must stamp candle-fleet mark`);
      assert.equal(candleResidual, false,
        `seed ${row.seed}: embodied Candle Fleet must not keep REAL residual`);
      assert.equal(row.fullSpinePass, true,
        `seed ${row.seed}: embodied Candle + partial marks must fullSpinePass`);
      assert.equal(row.supporting, false,
        `seed ${row.seed}: full spine green requires supporting:false`);
    } else {
      assert.equal(candleMarked, false,
        `seed ${row.seed} must not stamp candle-fleet without embodiment`);
      assert.equal(candleResidual, true,
        `seed ${row.seed} must document REAL residual for missing candle-fleet`);
      assert.equal(row.fullSpinePass, false,
        `seed ${row.seed} must not fake full spine without candle`);
      assert.equal(row.supporting, true,
        `seed ${row.seed}: incomplete spine stays supporting:true`);
    }
  }

  if (aggregate.fullSpinePass) {
    assert.equal(supporting, false,
      'full spine green must promote aggregate supporting:false');
    assert.equal(aggregate.residuals.length, 0,
      'full spine green must not carry candle mark residuals');
    assert.ok(
      (aggregate.productResiduals || []).some(
        (r) => r.mark === 'electron-dual-platform' && r.failureClass === 'REAL',
      ),
      'full spine green must keep honest Electron dual-platform product residual only',
    );
  } else {
    assert.equal(supporting, true,
      'incomplete full spine must keep aggregate supporting:true');
  }

  const residualLabel = aggregate.residuals.length
    ? aggregate.residuals.map((r) => `${r.mark}:${r.failureClass}`).join(', ')
    : (aggregate.productResiduals || []).map((r) => `${r.mark}:${r.failureClass}`).join(', ')
      || '(none)';
  const status = aggregate.fullSpinePass ? 'FULL SPINE OK' : 'PARTIAL OK';
  console.log(`GT1 continuous ${status}: ${multi.rows.length} seeds (supporting:${supporting})`);
  console.log(`Full spine: pass=${aggregate.fullSpinePass}`);
  console.log(`Residuals: ${residualLabel}`);
  console.log(`Naturalness: pass=${naturalness.pass}`);
  console.log(`Aggregate: ${AGGREGATE}`);
  console.log(`Per-seed evidence under: ${OUT_DIR}/${GT1_CONTINUOUS_ROUTE_ID}/`);
}
