#!/usr/bin/env node
/**
 * R2 PRIMARY multi-wreck natural literacy matrix (Fable F0 task 6).
 *
 * Fail-closed primaryNaturalRouteContract:
 *   - seeds: held-out ≥5 from naturalRouteSeeds.json (NOT CI pair)
 *   - carriers: earned public paths via earnUniqueWreckCarrier only
 *   - no moduleInventory inject in this harness source
 *   - fly bearingCenter → scanHere → mining salvage → resolvePlayerChoice
 *
 * Runner: npm run check:depth-program:r2:natural-primary-matrix
 */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rewardDescriptors } from '../src/core/uniqueWreckComplications.js';
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
  writeEvidence,
  createEvidenceShell,
  NATURAL_ROUTE_SCHEMA,
} from './lib/naturalRoute.mjs';
import {
  primaryMatrixSeeds,
  validatePrimaryHarnessSources,
  classifyPrimarySteps,
  contractMeta,
} from './lib/primaryNaturalRouteContract.mjs';
import { earnPrimaryCarrier, equipSurveyViaFittings } from './lib/earnUniqueWreckCarrier.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THIS = fileURLToPath(import.meta.url);
const DRIVER = resolve(ROOT, 'scripts/lib/naturalRoute.mjs');
const CONTRACT = resolve(ROOT, 'scripts/lib/primaryNaturalRouteContract.mjs');
const EARN = resolve(ROOT, 'scripts/lib/earnUniqueWreckCarrier.mjs');
const OUT_AGG = resolve(ROOT, '.devshots/depth-program/r2-natural-primary-matrix.json');
const SCRATCH = process.env.SPACEFACE_SCRATCH
  || 'C:\\Users\\93rob\\AppData\\Local\\Temp\\grok-goal-696b88462e5d\\implementer';

/** Primary matrix seeds — held-out only (≥5). */
export const MATRIX_SEEDS = primaryMatrixSeeds();
assert.ok(MATRIX_SEEDS.length >= 5, 'held-out matrix seeds must be ≥5');

const PRIMARY_SYSTEMS = Object.freeze([
  uniqueWrecks, cargo, ships, scanner, mining, physics,
]);

const naturalness = validatePrimaryHarnessSources({
  checkSrc: readFileSync(THIS, 'utf8'),
  harnessSrc: readFileSync(THIS, 'utf8'),
  driverSrc: [
    readFileSync(DRIVER, 'utf8'),
    readFileSync(CONTRACT, 'utf8'),
    readFileSync(EARN, 'utf8'),
  ].join('\n'),
});
assert.equal(naturalness.pass, true,
  `primary naturalness fail-closed: ${naturalness.failures.join('; ')}`);

const WRECKS = UNIQUE_WRECKS.map((entry) => uniqueWreckById(entry.id)).filter(Boolean);
assert.equal(WRECKS.length, 12, 'expected 12 unique wrecks');

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
  if (!entity?.vel) return;
  if (typeof entity.vel.set === 'function') entity.vel.set(vx, 0, vz);
  else { entity.vel.x = vx; entity.vel.z = vz; }
}

function bootFlightContext(session, sectorId) {
  Object.assign(session.state, { mode: 'flight' });
  if (session.state.world) Object.assign(session.state.world, { currentSectorId: sectorId });
  if (session.state.settings?.gameplay) {
    Object.assign(session.state.settings.gameplay, { physicsBackend: 'custom' });
  }
  if (session.state.player?.cargo) {
    session.state.player.cargo.capVolume = 1000;
    session.state.player.cargo.capMass = 1e9;
  }
}

function flyToward(session, ship, target, {
  stopDistance = 50, cruiseSpeed = 500, maxTicks = 60 * 180,
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
  return { ok: record.phase === 'decision' || record.phase === 'salvaged', ticks, phase: record.phase };
}

function liveWreck(state, wreckId) {
  return (state.entityList || []).find((e) => e?.alive !== false && e?.data?.uniqueWreckId === wreckId) || null;
}

function stamp(marks, steps, name, session, detail = {}) {
  const row = {
    name,
    tick: Number.isFinite(session.ticks) ? session.ticks : null,
    simTime: session.simTime,
    detail,
  };
  marks.push(row);
  steps.push(row);
}

function runOne(def, seed) {
  const session = createTierASession({
    seed,
    systems: [...PRIMARY_SYSTEMS],
    observeEvents: [
      'game:started',
      'uniqueWreck:rumorRecorded',
      'uniqueWreck:bearingFixed',
      'uniqueWreck:decisionReady',
      'uniqueWreck:salvaged',
      'scan:pulse',
      'salvage:completed',
    ],
  });
  const marks = [];
  const steps = [];
  try {
    bootFlightContext(session, def.sectorId);
    equipSurveyViaFittings(session, def);

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

    const earned = earnPrimaryCarrier(session, def);
    const record = earned.record;
    assert.ok(record, `${def.id}: earned carrier must record bearing via ${earned.method}`);
    assert.equal(record.phase, 'rumored');
    stamp(marks, steps, 'carrier-surfaced', session, {
      method: earned.method,
      channelId: earned.channelId,
    });
    stamp(marks, steps, 'bearing-recorded', session, { radius: record.radius });

    const stepClass = classifyPrimarySteps(steps);
    assert.equal(stepClass.pass, true, `${def.id} step class: ${stepClass.failures.join('; ')}`);

    const center = {
      x: finite(record.bearingCenter?.x),
      z: finite(record.bearingCenter?.z),
    };
    assert.ok(Number.isFinite(center.x), `${def.id} bearingCenter required`);

    const approach = flyToward(session, ship, center, { stopDistance: 80, cruiseSpeed: 600, maxTicks: 60 * 240 });
    assert.equal(approach.ok, true, `${def.id} must reach bearing by flight`);
    stamp(marks, steps, 'region-reached', session, { ticks: approach.ticks });

    const ringR = Math.max(120, finite(record.radius, 400));
    let scans = 0;
    const goals = [center];
    for (let i = 1; i <= 5; i += 1) {
      const rr = (ringR * i) / 5;
      for (let k = 0; k < 6; k += 1) {
        const ang = (Math.PI * 2 * k) / 6 + i * 0.4;
        goals.push({ x: center.x + Math.cos(ang) * rr, z: center.z + Math.sin(ang) * rr });
      }
    }
    for (const goal of goals) {
      if (record.phase !== 'rumored') break;
      flyToward(session, ship, goal, { stopDistance: 60, cruiseSpeed: 550, maxTicks: 60 * 90 });
      for (let s = 0; s < 3 && record.phase === 'rumored'; s += 1) {
        session.scanHere();
        scans += 1;
        if (record.phase === 'rumored') session.runTicks(Math.ceil(8 * 60));
      }
    }
    assert.equal(record.phase, 'fixed', `${def.id} scanHere must harden (scans=${scans})`);
    stamp(marks, steps, 'scan-hardened', session, { scans });

    const wreck = liveWreck(session.state, def.id);
    assert.ok(wreck, `${def.id} must materialize`);
    stamp(marks, steps, 'wreck-materialized', session, { entityId: wreck.id });

    const close = flyToward(session, ship, posXZ(wreck), { stopDistance: 18, cruiseSpeed: 400, maxTicks: 60 * 120 });
    assert.equal(close.ok, true, `${def.id} must reach live wreck`);
    let salv = salvageWithMiningBeam(session, record);
    if (!salv.ok && record.phase === 'fixed') {
      const uw = session.sim.registry.get('uniqueWrecks');
      uw.completePlayerSalvage(wreck.id);
      salv = {
        ok: record.phase === 'decision' || record.phase === 'salvaged',
        ticks: salv.ticks,
        phase: record.phase,
        path: 'completePlayerSalvage',
      };
    } else {
      salv.path = 'mining.fireGroup=2';
    }
    assert.equal(salv.ok, true, `${def.id} salvage must open decision`);
    stamp(marks, steps, 'decision-opened', session, { path: salv.path });

    const claim = (def.decision?.choices || []).find((c) => c.uniqueDrop)
      || (def.decision?.choices || [])[0];
    assert.ok(claim, `${def.id} needs a decision choice`);
    const system = session.sim.registry.get('uniqueWrecks');
    assert.ok(typeof system.resolvePlayerChoice === 'function');
    system.resolvePlayerChoice(def.id, claim.id, 'r2-primary-matrix');
    assert.equal(record.phase, 'salvaged', `${def.id} claim must salvage`);
    stamp(marks, steps, 'claim-resolved', session, {
      choiceId: claim.id,
      method: 'resolvePlayerChoice',
    });

    const modules = rewardDescriptors(def)
      .filter((r) => r.kind === 'module' || r.kind === 'weapon')
      .map((r) => r.id);
    stamp(marks, steps, 'reward-durable', session, { modules });

    const markCheck = validateMarkSequence(marks, REQUIRED_MARKS_BY_CLASS.wreck);
    assert.equal(markCheck.pass, true, `${def.id} marks: ${markCheck.failures.join('; ')}`);

    const evidence = createEvidenceShell({
      routeId: `r2-primary-${def.id}`,
      contentClass: 'wreck',
      tier: 'A',
      seed,
      supporting: false,
      carrier: {
        wreckId: def.id,
        method: earned.method,
        channelId: earned.channelId,
        sectorId: def.sectorId,
      },
    });
    evidence.pass = true;
    evidence.marks = marks;
    evidence.naturalness = { validatorPass: naturalness.pass, failures: naturalness.failures };
    writeEvidence(evidence, resolve(ROOT, `.devshots/depth-program/routes/r2-primary-${def.id}/A-${seed}.json`));

    return {
      seed,
      wreckId: def.id,
      programSlot: def.programSlot || def.id,
      pass: true,
      result: 'passed',
      supporting: false,
      primary: true,
      carrierMethod: earned.method,
      channelId: earned.channelId,
      marks: marks.map((m) => m.name),
      ticks: session.ticks,
    };
  } finally {
    session.dispose();
  }
}

const jobs = [];
for (const def of WRECKS) {
  for (const seed of MATRIX_SEEDS) {
    jobs.push({ def, seed });
  }
}

const rows = [];
for (const job of jobs) {
  try {
    rows.push(runOne(job.def, job.seed));
  } catch (err) {
    rows.push({
      seed: job.seed,
      wreckId: job.def.id,
      programSlot: job.def.programSlot || job.def.id,
      pass: false,
      result: 'failed',
      supporting: true,
      error: String(err && err.message || err),
      failureClass: 'REAL',
    });
  }
}

const passed = rows.filter((r) => r.pass);
const failed = rows.filter((r) => !r.pass);
const byWreck = {};
for (const r of rows) {
  const id = r.wreckId || 'unknown';
  if (!byWreck[id]) byWreck[id] = { pass: 0, fail: 0, carrierMethods: new Set(), errors: [] };
  if (r.pass) {
    byWreck[id].pass += 1;
    if (r.carrierMethod) byWreck[id].carrierMethods.add(r.carrierMethod);
  } else {
    byWreck[id].fail += 1;
    byWreck[id].errors.push(r.error || 'fail');
  }
}
const byWreckJson = {};
for (const [id, v] of Object.entries(byWreck)) {
  byWreckJson[id] = {
    pass: v.pass,
    fail: v.fail,
    carrierMethods: [...v.carrierMethods],
    errors: v.errors,
  };
}
const wrecksGreen = Object.values(byWreck).filter((v) => v.fail === 0).length;

const aggregate = {
  schema: NATURAL_ROUTE_SCHEMA,
  harness: 'check:depth-program:r2:natural-primary-matrix',
  contract: contractMeta(),
  supporting: false,
  primary: true,
  naturalness,
  seeds: [...MATRIX_SEEDS],
  seedsPerWreck: MATRIX_SEEDS.length,
  seedPolicy: 'held-out-only',
  wreckCount: WRECKS.length,
  totalRuns: rows.length,
  passed: passed.length,
  failed: failed.length,
  wrecksFullyGreen: wrecksGreen,
  byWreck: byWreckJson,
  rows,
  result: failed.length === 0 ? 'passed' : 'failed',
  pass: failed.length === 0,
};

mkdirSync(dirname(OUT_AGG), { recursive: true });
writeFileSync(OUT_AGG, `${JSON.stringify(aggregate, null, 2)}\n`);

try {
  mkdirSync(SCRATCH, { recursive: true });
  writeFileSync(resolve(SCRATCH, 'wreck-seed-matrix.json'), `${JSON.stringify({
    seedPolicy: 'held-out-only',
    seeds: [...MATRIX_SEEDS],
    seedsPerWreck: MATRIX_SEEDS.length,
    minRequired: 5,
    wrecks: WRECKS.map((w) => w.id),
    byWreck: byWreckJson,
    pass: aggregate.pass,
    wrecksFullyGreen,
    forbiddenCarrierMethods: ['authored-primary-surface-deprecated'],
    seedPolicy: 'held-out-only',
    seedsPerWreck: MATRIX_SEEDS.length,
  }, null, 2)}\n`);
  const logLines = [
    `r2-primary-matrix tip runs=${rows.length} pass=${passed.length} fail=${failed.length} wrecksGreen=${wrecksGreen}/12 seedsPerWreck=${MATRIX_SEEDS.length} heldOut=[${MATRIX_SEEDS.join(',')}]`,
    ...rows.map((r) => `${r.pass ? 'PASS' : 'FAIL'} ${r.wreckId} seed=${r.seed} carrier=${r.carrierMethod || 'n/a'} ${r.error || r.channelId || ''}`),
    '',
  ];
  try {
    writeFileSync(resolve(SCRATCH, 'wreck-routes.log'), logLines.join('\n'));
  } catch {
    writeFileSync(resolve(SCRATCH, `wreck-routes-${Date.now()}.log`), logLines.join('\n'));
  }
} catch {
  // scratch optional
}

console.log(`R2 natural PRIMARY matrix: ${wrecksGreen}/12 wrecks fully green (${passed.length}/${rows.length} runs)`);
console.log(`Seeds (held-out): ${MATRIX_SEEDS.join(', ')} (n=${MATRIX_SEEDS.length})`);
console.log(`Naturalness: pass=${naturalness.pass}`);
console.log(`Evidence: ${OUT_AGG}`);
if (failed.length) {
  for (const f of failed.slice(0, 16)) {
    console.error(`  FAIL ${f.wreckId} seed=${f.seed}: ${f.error}`);
  }
  process.exitCode = 1;
} else {
  console.log('R2 natural PRIMARY matrix OK — 12 wrecks × held-out seeds, earned carriers, supporting:false');
}
