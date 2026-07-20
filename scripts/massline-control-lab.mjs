#!/usr/bin/env node
// Deterministic massline physics-control laboratory — CLI (PQ-002 / SF-02, roadmap T01+T05 prep).
//
// A tuning substrate for the massline program: run one scenario, a grid-search sweep over controller
// gains × environment, or an acceptance matrix, all headless + deterministic. See the library
// scripts/lib/masslineControlLab.mjs for the architecture (controller seam, metrics, determinism).
//
// Usage:
//   node scripts/massline-control-lab.mjs --matrix                       # baseline acceptance matrix
//   node scripts/massline-control-lab.mjs --matrix --controller pd --Kr 4 --Kd 0.6
//   node scripts/massline-control-lab.mjs --sweep                        # PD-gain × environment sweep
//   node scripts/massline-control-lab.mjs --scenario --line-length 120 --anchor-mass 400
//   node scripts/massline-control-lab.mjs --scenario --controller detuned --Kd 3
//   node scripts/massline-control-lab.mjs --matrix --self-check          # run twice, assert hash-equal
//   node scripts/massline-control-lab.mjs --matrix --json out.json       # write full JSON to a file
//
// Every mode prints a stable `digest` (matrix/sweep) or `traceHash` (scenario) with NO wall-clock in
// it, so running the same command twice is byte-identical. `--self-check` does that double run in one
// invocation and exits non-zero on any mismatch.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  acceptanceMatrix,
  sweep,
  runScenario,
  makePdRadialController,
  makeDetunedController,
  BASELINE_CONTROLLER,
  DEFAULT_SEED,
  LAB_DEFAULTS,
} from './lib/masslineControlLab.mjs';

const argv = process.argv.slice(2);

if (has('--help') || has('-h')) usage(0);

const mode = has('--sweep') ? 'sweep' : has('--matrix') ? 'matrix' : 'scenario';
const seed = int('--seed', DEFAULT_SEED);
const ticks = int('--ticks', LAB_DEFAULTS.ticks);
const controllerName = str('--controller', 'baseline');
const Kr = num('--Kr', 0);
const Kd = num('--Kd', controllerName === 'detuned' ? 3 : 0.6);
const Ts = has('--Ts') ? num('--Ts', null) : null;
const lineLength = num('--line-length', 120);
const anchorMass = num('--anchor-mass', 400);
const entrySpeed = num('--entry-speed', 30);
const jsonPath = str('--json', null);
const selfCheck = has('--self-check');
const includeTrace = has('--trace');

function makeController() {
  if (controllerName === 'pd') return makePdRadialController({ Kr, Kd, Ts });
  if (controllerName === 'detuned') return makeDetunedController({ Kd });
  return BASELINE_CONTROLLER;
}

function controllerFactory() {
  if (controllerName === 'pd') return () => makePdRadialController({ Kr, Kd, Ts });
  if (controllerName === 'detuned') return () => makeDetunedController({ Kd });
  return null; // baseline
}

async function runMode() {
  if (mode === 'matrix') {
    return acceptanceMatrix({ seed, ticks, controllerFactory: controllerFactory(), controllerLabel: controllerName });
  }
  if (mode === 'sweep') {
    return sweep({ seed, ticks });
  }
  const result = await runScenario({
    seed, ticks, lineLength, anchorMass, entrySpeed, controller: makeController(),
  });
  const out = {
    schema: 'spaceface.masslineControlLab.scenario.v1',
    deterministic: true,
    seed, ticks, controller: controllerName,
    params: result.params,
    metrics: result.metrics,
    live: result.live,
    traceHash: result.traceHash,
    traceLength: result.trace.length,
  };
  // JSON trace output (named deliverable): the full per-tick series — radiusError, tangentFraction,
  // tension, radialSpeed, injected command, … — for plotting a swing or feeding a downstream tuner.
  if (includeTrace) out.trace = result.trace;
  return out;
}

function digestOf(result) {
  return result.digest || result.traceHash || null;
}

function summarize(result) {
  const digest = digestOf(result);
  if (result.summary) {
    return `${result.schema} controller=${result.controller} cells=${result.summary.total} pass=${result.summary.pass} fail=${result.summary.fail} digest=${digest}`;
  }
  return `${result.schema} controller=${result.controller} pass=${result.metrics.pass} osc=${result.metrics.oscillations} broke=${result.metrics.broke} traceHash=${digest}`;
}

(async () => {
  const first = await runMode();

  if (selfCheck) {
    const second = await runMode();
    const a = digestOf(first);
    const b = digestOf(second);
    const ok = a === b;
    process.stdout.write(JSON.stringify({
      schema: 'spaceface.masslineControlLab.selfCheck.v1',
      mode,
      controller: controllerName,
      seed,
      ticks,
      run1: a,
      run2: b,
      deterministic: ok,
    }, null, 2) + '\n');
    process.exitCode = ok ? 0 : 1;
    return;
  }

  if (jsonPath) {
    const abs = resolve(process.cwd(), jsonPath);
    writeFileSync(abs, JSON.stringify(first, null, 2) + '\n');
    process.stdout.write(summarize(first) + `\nwrote ${abs}\n`);
    return;
  }

  process.stdout.write(JSON.stringify(first, null, 2) + '\n');
})().catch((err) => {
  process.stderr.write(`massline-control-lab: ${err && err.stack || err}\n`);
  process.exitCode = 1;
});

// ---- arg parsing ----

function has(flag) {
  return argv.includes(flag);
}

function rawArg(name) {
  const eq = name + '=';
  const ix = argv.findIndex((a) => a === name || a.startsWith(eq));
  if (ix < 0) return undefined;
  const token = argv[ix];
  if (token.startsWith(eq)) return token.slice(eq.length);
  return argv[ix + 1];
}

function str(name, fallback) {
  const v = rawArg(name);
  return v === undefined ? fallback : v;
}

function num(name, fallback) {
  const v = rawArg(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function int(name, fallback) {
  const n = num(name, fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function usage(code) {
  process.stdout.write([
    'massline-control-lab — deterministic massline physics-control laboratory',
    '',
    'Modes:',
    '  --matrix                 baseline acceptance matrix (default controller: baseline)',
    '  --sweep                  grid-search over PD gains (Kr,Kd,Ts) × environment',
    '  --scenario               run a single scenario (default mode)',
    '',
    'Controller:  --controller baseline|pd|detuned  [--Kr N --Kd N --Ts N]',
    'Environment: --line-length N --anchor-mass N --entry-speed N',
    'Common:      --seed N --ticks N --json <path> --self-check --trace',
    '             (--trace includes the full per-tick series in --scenario output)',
    '',
    'Examples:',
    '  node scripts/massline-control-lab.mjs --matrix',
    '  node scripts/massline-control-lab.mjs --matrix --self-check',
    '  node scripts/massline-control-lab.mjs --sweep',
    '  node scripts/massline-control-lab.mjs --scenario --controller pd --Kr 4 --Kd 0.6',
    '  node scripts/massline-control-lab.mjs --scenario --trace --json swing.json',
    '',
  ].join('\n'));
  process.exit(code);
}
