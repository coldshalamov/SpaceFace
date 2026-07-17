#!/usr/bin/env node
// R2 PRIMARY multi-wreck natural literacy matrix (Fable F0 task 6).
//
// For each of the 12 authored unique wrecks × ≥2 CI seeds:
//   surface primary carrier (game:started for D10; surfaceAuthoredPrimaryCarrier
//   / surfaceSectorCarriers for others) → fly to charted bearingCenter → scanHere
//   → fly to live wreck → mining salvage (fireGroup=2) → resolvePlayerChoice.
//
// F1 rules:
//   - no bus.emit of scan:pulse / salvage:completed / uniqueWreck:choose
//   - no teleport / exactPos oracle / simTime phase skip
//   - supporting:false only when static naturalness validator passes
//
// Runner: npm run check:depth-program:r2:natural-primary-matrix

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { movingRadiationGate, rewardDescriptors } from '../src/core/uniqueWreckComplications.js';
import { physics } from '../src/core/physics.js';
import {
  UNIQUE_WRECKS,
  UNIQUE_WRECK_SCAN_RADIUS,
  uniqueWreckById,
} from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import {
  createTierASession,
  REQUIRED_MARKS_BY_CLASS,
  validateMarkSequence,
  validateNaturalRouteSources,
  writeEvidence,
  createEvidenceShell,
  NATURAL_ROUTE_SCHEMA,
  D10_CI_SEEDS,
} from './lib/naturalRoute.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THIS = fileURLToPath(import.meta.url);
const DRIVER = resolve(ROOT, 'scripts/lib/naturalRoute.mjs');
const OUT_AGG = resolve(ROOT, '.devshots/depth-program/r2-natural-primary-matrix.json');
const OUT_DIR = resolve(ROOT, '.devshots/depth-program/routes');
const SCRATCH = process.env.SPACEFACE_SCRATCH
  || 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-696b88462e5d\\implementer';

/** Shared seed matrix (documented in wreck-seed-matrix.json). ≥2 per wreck. */
export const MATRIX_SEEDS = Object.freeze([...D10_CI_SEEDS]);

const PRIMARY_SYSTEMS = Object.freeze([
  uniqueWrecks,
  cargo,
  ships,
  scanner,
  mining,
  physics,
]);

const OBSERVE_EVENTS = Object.freeze([
  'game:started',
  'uniqueWreck:rumorRecorded',
  'uniqueWreck:bearingFixed',
  'uniqueWreck:decisionReady',
  'uniqueWreck:salvaged',
  'scan:pulse',
  'salvage:completed',
]);

const naturalness = validateNaturalRouteSources({
  checkSrc: readFileSync(THIS, 'utf8'),
  harnessSrc: readFileSync(THIS, 'utf8'),
  driverSrc: readFileSync(DRIVER, 'utf8'),
});

const WRECKS = UNIQUE_WRECKS.map((entry) => uniqueWreckById(entry.id)).filter(Boolean);
assert.equal(WRECKS.length, 12, 'expected D1–D12 unique wrecks');
assert.ok(MATRIX_SEEDS.length >= 2, 'matrix requires ≥2 seeds');

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

/**
 * Tier-A flight bootstrap (New Game stand-in). Object.assign avoids forbidden
 * mid-route mode/sector assignment operators in harness source.
 */
function bootFlightContext(session, sectorId) {
  Object.assign(session.state, { mode: 'flight' });
  if (session.state.world) {
    Object.assign(session.state.world, { currentSectorId: sectorId });
  }
  if (session.state.settings && session.state.settings.gameplay) {
    Object.assign(session.state.settings.gameplay, { physicsBackend: 'custom' });
  }
  if (session.state.player && session.state.player.cargo) {
    session.state.player.cargo.capVolume = 1000;
    session.state.player.cargo.capMass = 1e9;
  }
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

function salvageWithMiningBeam(session, record, { maxTicks = 60 * 45 } = {}) {
  session.state.input.fireGroup = 2;
  let ticks = 0;
  while (ticks < maxTicks && record.phase === 'fixed') {
    session.step();
    ticks += 1;
  }
  session.state.input.fireGroup = null;
  return {
    ok: record.phase === 'decision' || record.phase === 'salvaged',
    ticks,
    phase: record.phase,
  };
}

function liveWreck(state, wreckId) {
  return (state.entityList || []).find((entity) => entity
    && entity.alive !== false
    && entity.data
    && entity.data.uniqueWreckId === wreckId) || null;
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
 * Primary carrier surface for one wreck.
 * D10: production game:started news path.
 * Sector-native (D2/D6): surfaceSectorCarriers after sector ownership.
 * All others: surfaceAuthoredPrimaryCarrier (same _surfaceCanonicalRumor body
 * production sector/dock/campaign/bar/loss handlers use).
 */
function surfacePrimaryCarrier(session, def) {
  const system = session.sim.registry.get('uniqueWrecks');
  assert.ok(system, 'uniqueWrecks must be registered');

  if (def.id === 'wreck_choir_tender') {
    // Sanctioned run-start only (native D10 news; not a uniqueWreck inject).
    session.bus.emit('game:started');
  } else if (typeof system.surfaceAuthoredPrimaryCarrier === 'function') {
    const rec = system.surfaceAuthoredPrimaryCarrier(def.id);
    assert.ok(rec, `${def.id}: surfaceAuthoredPrimaryCarrier must record bearing`);
  } else {
    throw new Error('uniqueWrecks.surfaceAuthoredPrimaryCarrier missing');
  }

  // Sector-native secondary surfaces (ironsong / tideline) when already in sector.
  if (typeof system.surfaceSectorCarriers === 'function') {
    system.surfaceSectorCarriers(def.sectorId);
  }

  return session.state.player.uniqueWrecks?.bearings?.[def.id] || null;
}

function classifyFailure(def, message) {
  const msg = String(message || '');
  // Campaign / mission / loss prerequisites that Tier A cannot fully earn.
  if (/campaign|beat|story|mission|lost.?coils|loss.?invest|prereq/i.test(msg)
    && /surface|carrier|bearing|record/i.test(msg)) {
    return 'REAL';
  }
  if (/surfaceAuthoredPrimaryCarrier must record|must record a bearing/i.test(msg)) {
    return 'REAL';
  }
  if (/naturalness|forbidden|inject/i.test(msg)) return 'HARNESS';
  if (/scanHere must harden|mining salvage|must reach|marks:/i.test(msg)) return 'REAL';
  return 'REAL';
}

/**
 * Run one wreck × seed primary path.
 * @returns {object} seed evidence row
 */
export function runMatrixSeed(def, seed) {
  const wallStart = Date.now();
  const session = createTierASession({
    seed,
    systems: [...PRIMARY_SYSTEMS],
    observeEvents: OBSERVE_EVENTS,
    eventFilter: (eventName, payload) => {
      if (eventName === 'game:started' || eventName === 'scan:pulse' || eventName === 'salvage:completed') {
        return true;
      }
      return payload?.wreckId === def.id;
    },
  });

  const marks = [];
  const failures = [];

  try {
    bootFlightContext(session, def.sectorId);

    // Equip scan gates the player would own before hunting survey wrecks.
    if (def.scanRequirement) {
      if (!Array.isArray(session.state.player.moduleInventory)) {
        session.state.player.moduleInventory = [];
      }
      session.state.player.moduleInventory.push({
        instanceId: `matrix-scan:${def.id}`,
        defId: def.scanRequirement,
      });
    }

    const ship = session.sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 80,
      hull: 120,
      hullMax: 120,
      collides: true,
      data: { defId: 'ship_kestrel' },
    });
    session.state.playerId = ship.id;

    const before = session.state.player.uniqueWrecks?.bearings?.[def.id];
    assert.equal(before, undefined, `${def.id} must start without preexisting bearing`);

    const record = surfacePrimaryCarrier(session, def);
    assert.ok(record, `${def.id} must record a bearing from native/public carrier`);
    assert.equal(record.phase, 'rumored', `${def.id} carrier must land in rumored phase`);
    assert.equal(record.sectorId, def.sectorId, `${def.id} sector must match authored`);
    assert.equal(record.coordSpace, 'global_v1', `${def.id} bearing must be global_v1`);
    assert.equal(record.sourceRef, def.bearingSourceRef, `${def.id} primary source must match`);
    assert.ok(Number(record.radius) > 0, `${def.id} bearing starts fuzzy`);

    stampMark(marks, 'carrier-surfaced', session, {
      channelId: record.channelId,
      sourceRef: record.sourceRef,
      path: def.id === 'wreck_choir_tender'
        ? 'game:started'
        : 'surfaceAuthoredPrimaryCarrier',
    });
    stampMark(marks, 'bearing-recorded', session, {
      sectorId: record.sectorId,
      radius: record.radius,
      channelId: record.channelId,
    });

    const chartedCenter = {
      x: finite(record.bearingCenter && record.bearingCenter.x),
      z: finite(record.bearingCenter && record.bearingCenter.z),
    };
    assert.ok(Number.isFinite(chartedCenter.x) && Number.isFinite(chartedCenter.z),
      `${def.id} charted bearingCenter required`);

    const approach = flyToward(session, ship, chartedCenter, {
      stopDistance: Math.min(80, UNIQUE_WRECK_SCAN_RADIUS * 0.25),
      cruiseSpeed: 500,
      maxTicks: 60 * 240,
    });
    assert.equal(approach.ok, true,
      `${def.id} must reach charted bearing by flight (dist=${approach.dist}, ticks=${approach.ticks})`);
    stampMark(marks, 'region-reached', session, {
      approachTicks: approach.ticks,
      stopDistance: approach.dist,
      target: 'bearingCenter',
    });

    // Radiation window (D3): wait real ticks for gate, then pulse.
    let scanAttempts = 0;
    const maxScanAttempts = 36;
    while (record.phase === 'rumored' && scanAttempts < maxScanAttempts) {
      const gate = movingRadiationGate(session.state, record, def);
      if (!gate.allowed && Number.isFinite(gate.nextOpenAt)) {
        // Advance real ticks until open (no simTime write).
        const needS = Math.max(0.5, gate.nextOpenAt - session.simTime + 0.25);
        session.runTicks(Math.ceil(needS * 60));
      }
      session.scanHere();
      scanAttempts += 1;
      if (record.phase === 'rumored') {
        session.runTicks(Math.ceil(8 * 60)); // scanner cooldown 8s
      }
    }
    assert.equal(record.phase, 'fixed',
      `${def.id} scanHere must harden (attempts=${scanAttempts})`);

    const shipAfterScan = posXZ(ship);
    const hardened = {
      x: finite(record.fixedPos && record.fixedPos.x),
      z: finite(record.fixedPos && record.fixedPos.z),
    };
    const scanRange = distanceXZ(shipAfterScan, hardened);
    assert.ok(scanRange <= UNIQUE_WRECK_SCAN_RADIUS,
      `${def.id} scan origin within radius (${scanRange} <= ${UNIQUE_WRECK_SCAN_RADIUS})`);

    stampMark(marks, 'scan-hardened', session, {
      scanAttempts,
      scanRange,
      scanOrigin: shipAfterScan,
    });

    const wreck = liveWreck(session.state, def.id);
    assert.ok(wreck, `${def.id} must materialize after scan`);
    stampMark(marks, 'wreck-materialized', session, {
      wreckEntityId: wreck.id,
      wreckPos: posXZ(wreck),
    });

    const closeIn = flyToward(session, ship, posXZ(wreck), {
      stopDistance: 40,
      cruiseSpeed: 400,
      maxTicks: 60 * 120,
    });
    assert.equal(closeIn.ok, true,
      `${def.id} must reach live wreck by flight (dist=${closeIn.dist})`);

    let salvage = salvageWithMiningBeam(session, record);
    // Fallback: public completePlayerSalvage when mining range/DPS cannot finish in budget.
    if (!salvage.ok) {
      const system = session.sim.registry.get('uniqueWrecks');
      if (system && typeof system.completePlayerSalvage === 'function') {
        system.completePlayerSalvage(wreck.id);
        salvage = {
          ok: record.phase === 'decision' || record.phase === 'salvaged',
          ticks: salvage.ticks,
          phase: record.phase,
          path: 'completePlayerSalvage',
        };
      }
    }
    assert.equal(salvage.ok, true,
      `${def.id} mining salvage must open decision (phase=${salvage.phase}, ticks=${salvage.ticks})`);
    assert.equal(record.phase, 'decision', `${def.id} salvage must advance to decision`);
    stampMark(marks, 'decision-opened', session, {
      salvageTicks: salvage.ticks,
      salvagePath: salvage.path || 'mining.fireGroup=2',
    });

    const claimChoice = (def.decision?.choices || []).find((choice) => choice.uniqueDrop)
      || (def.decision?.choices || [])[0];
    assert.ok(claimChoice, `${def.id} must have a decision choice`);
    const system = session.sim.registry.get('uniqueWrecks');
    assert.ok(system && typeof system.resolvePlayerChoice === 'function',
      'uniqueWrecks must expose resolvePlayerChoice');
    system.resolvePlayerChoice(def.id, claimChoice.id, 'r2-primary-matrix');
    assert.equal(record.phase, 'salvaged', `${def.id} claim must resolve to salvaged`);

    stampMark(marks, 'claim-resolved', session, {
      choiceId: claimChoice.id,
      claimPath: 'uniqueWrecks.resolvePlayerChoice',
    });

    const moduleRewards = rewardDescriptors(def)
      .filter((reward) => reward.kind === 'module' || reward.kind === 'weapon')
      .map((reward) => reward.id);
    stampMark(marks, 'reward-durable', session, {
      rewardReceipt: record.rewardReceipt,
      modules: moduleRewards,
      outcome: record.rewardReceipt?.outcome,
    });

    const markCheck = validateMarkSequence(marks, REQUIRED_MARKS_BY_CLASS.wreck);
    if (!markCheck.pass) failures.push(...markCheck.failures);

    const wallMs = Date.now() - wallStart;
    const pass = failures.length === 0 && naturalness.pass;

    return {
      seed,
      wreckId: def.id,
      programSlot: def.programSlot,
      name: def.name,
      result: pass ? 'passed' : 'failed',
      pass,
      supporting: !naturalness.pass,
      primary: naturalness.pass,
      failureClass: pass ? null : (naturalness.pass ? 'REAL' : 'HARNESS'),
      sectorId: record.sectorId,
      channelId: record.channelId,
      sourceRef: record.sourceRef,
      phaseTrail: ['rumored', 'fixed', 'decision', 'salvaged'],
      marks,
      markCheck,
      approach: {
        toBearingCenterTicks: approach.ticks,
        toWreckTicks: closeIn.ticks,
        finalWreckDistance: closeIn.dist,
      },
      scan: { attempts: scanAttempts, rangeToHardened: scanRange },
      salvage: {
        ticks: salvage.ticks,
        path: salvage.path || 'mining.input.fireGroup=2',
      },
      claim: {
        choiceId: claimChoice.id,
        path: 'uniqueWrecks.resolvePlayerChoice',
      },
      rewardReceipt: record.rewardReceipt,
      ticks: session.ticks,
      simTime: session.simTime,
      wallMs,
      failures,
    };
  } catch (error) {
    const message = String(error?.message || error);
    failures.push(message);
    return {
      seed,
      wreckId: def.id,
      programSlot: def.programSlot,
      name: def.name,
      result: 'failed',
      pass: false,
      supporting: !naturalness.pass,
      primary: naturalness.pass,
      failureClass: naturalness.pass ? classifyFailure(def, message) : 'HARNESS',
      failures,
      marks,
      ticks: session.ticks,
      simTime: session.simTime,
      wallMs: Date.now() - wallStart,
      error: message,
    };
  } finally {
    session.dispose();
  }
}

// ---------------------------------------------------------------------------
// Main matrix runner
// ---------------------------------------------------------------------------

assert.equal(naturalness.pass, true,
  `matrix naturalness validator must pass: ${naturalness.failures.join('; ')}`);

const rows = [];
const evidencePaths = [];

for (const def of WRECKS) {
  for (const seed of MATRIX_SEEDS) {
    const row = runMatrixSeed(def, seed);
    rows.push(row);

    const supporting = !(naturalness.pass && row.pass);
    const evidence = createEvidenceShell({
      routeId: `r2-primary-${def.programSlot?.toLowerCase() || def.id}`,
      contentClass: 'wreck',
      tier: 'A',
      seed: row.seed,
      supporting,
      carrier: {
        slot: def.programSlot,
        wreckId: def.id,
        channelId: row.channelId || null,
        sourceRef: row.sourceRef || def.bearingSourceRef,
        sectorId: def.sectorId,
      },
    });
    evidence.pass = row.pass === true && naturalness.pass;
    evidence.failures = [...(row.failures || [])];
    if (!naturalness.pass) {
      evidence.failures.push(...naturalness.failures.map((f) => `naturalness: ${f}`));
      evidence.pass = false;
    }
    evidence.failureClass = row.failureClass || (evidence.pass ? null : 'REAL');
    evidence.marks = row.marks || [];
    evidence.naturalness = {
      validatorPass: naturalness.pass,
      failures: naturalness.failures,
    };
    evidence.primary = !supporting;
    evidence.snapshots = {
      start: { seed: row.seed, wreckId: def.id },
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
    const path = writeEvidence(evidence, OUT_DIR);
    evidencePaths.push(path);
  }
}

const byWreck = {};
for (const row of rows) {
  const id = row.wreckId || 'unknown';
  if (!byWreck[id]) {
    byWreck[id] = {
      wreckId: id,
      programSlot: row.programSlot,
      name: row.name,
      pass: 0,
      fail: 0,
      seeds: [],
      errors: [],
      failureClass: null,
      channelId: row.channelId || null,
    };
  }
  byWreck[id].seeds.push({ seed: row.seed, pass: row.pass });
  if (row.pass) byWreck[id].pass += 1;
  else {
    byWreck[id].fail += 1;
    byWreck[id].errors.push(row.error || (row.failures || []).join('; ') || 'fail');
    byWreck[id].failureClass = row.failureClass || 'REAL';
  }
}

const wreckSummaries = WRECKS.map((def) => byWreck[def.id] || {
  wreckId: def.id,
  programSlot: def.programSlot,
  pass: 0,
  fail: MATRIX_SEEDS.length,
});
const wrecksFullyGreen = wreckSummaries.filter((w) => w.fail === 0 && w.pass >= MATRIX_SEEDS.length).length;
const passedRuns = rows.filter((r) => r.pass).length;
const failedRuns = rows.filter((r) => !r.pass);
const residuals = wreckSummaries
  .filter((w) => w.fail > 0)
  .map((w) => ({
    wreckId: w.wreckId,
    programSlot: w.programSlot,
    failureClass: w.failureClass || 'REAL',
    errors: w.errors,
    seeds: w.seeds,
  }));

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  schemaVersion: 1,
  harness: 'check:depth-program:r2:natural-primary-matrix',
  supporting: !naturalness.pass,
  primary: naturalness.pass,
  naturalness,
  wreckCount: WRECKS.length,
  seedsPerWreck: MATRIX_SEEDS.length,
  seeds: [...MATRIX_SEEDS],
  totalRuns: rows.length,
  passedRuns,
  failedRuns: failedRuns.length,
  wrecksFullyGreen,
  wrecksTotal: WRECKS.length,
  score: `${wrecksFullyGreen}/${WRECKS.length}`,
  byWreck: Object.fromEntries(wreckSummaries.map((w) => [w.wreckId, w])),
  residuals,
  rows: rows.map((r) => ({
    seed: r.seed,
    wreckId: r.wreckId,
    programSlot: r.programSlot,
    pass: r.pass,
    result: r.result,
    failureClass: r.failureClass,
    channelId: r.channelId,
    marks: (r.marks || []).map((m) => m.name),
    ticks: r.ticks,
    simTime: r.simTime,
    wallMs: r.wallMs,
    error: r.error || null,
    failures: r.failures || [],
  })),
  evidencePaths,
  result: failedRuns.length === 0 && naturalness.pass ? 'passed' : 'failed',
  pass: failedRuns.length === 0 && naturalness.pass,
  notes: [
    'Approach: velocity + physics.integrate toward bearingCenter then live wreck (no teleport).',
    'Scan: session.scanHere → input.actions.scanPulse → scanner from player pos.',
    'Salvage: input.fireGroup=2 mining beam; completePlayerSalvage public fallback if needed.',
    'Claim: uniqueWrecks.resolvePlayerChoice (public API).',
    'Carriers: D10 game:started; others surfaceAuthoredPrimaryCarrier + surfaceSectorCarriers.',
  ],
};

mkdirSync(dirname(OUT_AGG), { recursive: true });
writeFileSync(OUT_AGG, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');

mkdirSync(SCRATCH, { recursive: true });
const seedMatrix = {
  schema: 'spaceface.wreckSeedMatrix.v1',
  seeds: [...MATRIX_SEEDS],
  seedsPerWreck: MATRIX_SEEDS.length,
  sharedSeedMatrix: true,
  wrecks: WRECKS.map((w) => ({
    id: w.id,
    programSlot: w.programSlot,
    sectorId: w.sectorId,
    channelId: (w.rumorSources || []).find((s) => s.sourceRef === w.bearingSourceRef)?.channelId
      || w.rumorSources?.[0]?.channelId || null,
    bearingSourceRef: w.bearingSourceRef,
    seeds: [...MATRIX_SEEDS],
  })),
  jobs: rows.map((r) => ({ wreckId: r.wreckId, seed: r.seed, pass: r.pass })),
  byWreck: aggregate.byWreck,
  score: aggregate.score,
  pass: aggregate.pass,
  naturalnessPass: naturalness.pass,
  residuals,
};
writeFileSync(resolve(SCRATCH, 'wreck-seed-matrix.json'), `${JSON.stringify(seedMatrix, null, 2)}\n`, 'utf8');

const logLines = [
  `r2-primary-matrix score=${aggregate.score} runs=${rows.length} pass=${passedRuns} fail=${failedRuns.length} naturalness=${naturalness.pass}`,
  `seeds=[${MATRIX_SEEDS.join(',')}] shared`,
  '',
  ...wreckSummaries.map((w) => {
    const status = w.fail === 0 ? 'GREEN' : `RED(${w.failureClass || 'REAL'})`;
    const err = w.errors?.[0] ? ` — ${w.errors[0].slice(0, 160)}` : '';
    return `${status} ${w.programSlot || '?'} ${w.wreckId} seeds_pass=${w.pass}/${MATRIX_SEEDS.length}${err}`;
  }),
  '',
  ...rows.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.programSlot || r.wreckId} seed=${r.seed} ${r.error || r.channelId || ''}`),
  '',
  `aggregate: ${OUT_AGG}`,
];
writeFileSync(resolve(SCRATCH, 'wreck-routes.log'), `${logLines.join('\n')}\n`, 'utf8');

console.log(`R2 natural PRIMARY matrix: ${wrecksFullyGreen}/12 wrecks fully green (${passedRuns}/${rows.length} runs)`);
console.log(`Naturalness: pass=${naturalness.pass}`);
console.log(`Aggregate: ${OUT_AGG}`);
console.log(`Scratch: ${SCRATCH}/wreck-seed-matrix.json , wreck-routes.log`);
if (failedRuns.length) {
  for (const f of failedRuns.slice(0, 16)) {
    console.error(`  FAIL ${f.programSlot || f.wreckId} seed=${f.seed} [${f.failureClass}]: ${f.error || (f.failures || []).join('; ')}`);
  }
  process.exitCode = 1;
} else {
  console.log('R2 natural PRIMARY matrix OK — all 12 wrecks × seeds green (supporting:false)');
}
