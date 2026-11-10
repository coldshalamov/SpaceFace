#!/usr/bin/env node
// CRU-008 — deterministic Lab physics-swarm witness.
// Proves: the scenario is valid simScenario.v1; two seeded repeat arms share
// traceHash and semantic hash (repeatability); the player actually fired
// (capacitor dropped / weapon RNG draws) and at least one hostile lost hull.
// Does not prove: hostile return fire (AI is not in the focused system list),
// that every hostile was hit, or production-manifest combat.
// Equal hashes of an inert run are not a pass.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SIM_SCENARIO_SCHEMA,
  validateSimScenario,
  compileSimScenario,
  formatSimScenarioIssue,
} from '../src/contracts/simScenarioSchema.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCENARIO_PATH = join(ROOT, '../src/testing/scenarios/crucible-physics-swarm.scenario.json');

let failed = 0;

function pass(label) {
  console.log(`PASS  ${label}`);
}

function fail(label, detail) {
  failed += 1;
  const extra = detail ? `: ${detail}` : '';
  console.log(`FAIL  ${label}${extra}`);
}

async function step(label, fn) {
  try {
    const note = await fn();
    pass(note ? `${label} — ${note}` : label);
  } catch (err) {
    fail(label, err && err.message ? err.message : String(err));
  }
}

function combatEvidence(rep, doc) {
  const metrics = (rep.primary && rep.primary.metrics) || [];
  const capMetric = metrics.find((m) => m.name === 'trace.min');
  const capMin = capMetric && Number.isFinite(capMetric.value) ? capMetric.value : null;
  const capCeiling = (() => {
    const authored = (doc.metrics || []).find((m) => m.name === 'trace.min' && m.params && m.params.signal === 'cap');
    const value = authored && authored.threshold && authored.threshold.value;
    return Number.isFinite(value) ? value : 260;
  })();
  const surface = rep.primary
    && rep.primary.checkpoints
    && rep.primary.checkpoints.final
    && rep.primary.checkpoints.final.deterministicCovered
    && rep.primary.checkpoints.final.deterministicCovered.surface;
  const playerId = surface ? surface.playerId : null;
  const entities = (surface && Array.isArray(surface.entities)) ? surface.entities : [];
  const hostiles = entities.filter((e) => e && e.team === 1 && e.id !== playerId);
  const damaged = hostiles.filter((e) => {
    if (!e.alive) return true;
    const hull = Number(e.hull);
    const hullMax = Number(e.hullMax);
    return Number.isFinite(hull) && Number.isFinite(hullMax) && hull < hullMax;
  });
  const remaining = hostiles.filter((e) => e.alive);
  const draws = surface && surface.entropy && surface.entropy.weapons
    ? (surface.entropy.weapons.draws | 0)
    : 0;
  const capDropped = capMin != null && capMin < capCeiling;
  return {
    shotsFired: draws > 0 || capDropped,
    weaponDraws: draws,
    capMin,
    hostilesDamaged: damaged.length,
    hostilesRemaining: remaining.length,
    hostilesTotal: hostiles.length,
  };
}

function formatEvidence(ev) {
  return `shotsFired=${ev.shotsFired} weaponDraws=${ev.weaponDraws} capMin=${ev.capMin}`
    + ` hostilesDamaged=${ev.hostilesDamaged} hostilesRemaining=${ev.hostilesRemaining}`
    + ` hostilesTotal=${ev.hostilesTotal}`;
}

await step('scenario file exists', () => {
  assert.equal(existsSync(SCENARIO_PATH), true, SCENARIO_PATH);
});

const doc = existsSync(SCENARIO_PATH)
  ? JSON.parse(readFileSync(SCENARIO_PATH, 'utf8'))
  : null;

await step('validate simScenario.v1', () => {
  assert.ok(doc, 'scenario document missing');
  assert.equal(doc.schema, SIM_SCENARIO_SCHEMA);
  const v = validateSimScenario(doc, { file: SCENARIO_PATH });
  if (!v.ok) {
    const text = (v.issues || []).map((issue) => formatSimScenarioIssue(issue)).join('\n');
    assert.equal(v.ok, true, text || 'validation failed');
  }
  assert.equal(v.issueCount, 0);
});

await step('compile scenario', () => {
  assert.ok(doc, 'scenario document missing');
  const compiled = compileSimScenario(doc, { file: SCENARIO_PATH });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.validation && compiled.validation.issues));
});

await step('repeatScenario 2 arms: equal traceHash and semantic output', async () => {
  assert.ok(doc, 'scenario document missing');
  const rep = await repeatScenario(doc, { verbosity: 3, runs: 2 });
  if (!rep.ok) {
    const mismatch = JSON.stringify(rep.mismatches || []);
    const oracle = rep.primary && rep.primary.oracle
      ? JSON.stringify(rep.primary.oracle.failed || []).slice(0, 1200)
      : '';
    const err = rep.primary && rep.primary.error ? rep.primary.error : '';
    assert.equal(
      rep.ok,
      true,
      `status=${rep.status} exitClass=${rep.exitClass} error=${err} mismatches=${mismatch} oracle=${oracle}`,
    );
  }
  assert.equal(rep.exitClass, 0);
  assert.equal(rep.runs, 2);
  assert.ok(rep.traceHash, 'traceHash missing');
  assert.ok(rep.semanticHash, 'semanticHash missing');
  assert.deepEqual(rep.mismatches || [], []);
  const eq = rep.equivalence && rep.equivalence['run-eq-repeat'];
  assert.ok(eq, 'run-eq-repeat missing');
  assert.equal(eq.ok, true);

  const ev = combatEvidence(rep, doc);
  if (!ev.shotsFired) {
    assert.equal(ev.shotsFired, true, `no shot evidence — ${formatEvidence(ev)}`);
  }
  if (ev.hostilesDamaged < 1) {
    assert.ok(ev.hostilesDamaged >= 1, `no hostile hull damage — ${formatEvidence(ev)}`);
  }
  return `traceHash=${rep.traceHash} semanticHash=${rep.semanticHash} ${formatEvidence(ev)}`;
});

if (failed) {
  console.log(`CRUCIBLE-LAB FAIL  ${failed} step(s)`);
  process.exit(1);
}

console.log('CRUCIBLE-LAB PASS');
