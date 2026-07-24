#!/usr/bin/env node
// `sf lab` — deterministic gameplay lab CLI (Phase 3).
// In-process; uses createAuthoritativeRuntime. No long-lived daemon.
// Exit classes: 0 pass, 1 deterministic fail, 2 blocked, 3 infra/timeout, 4 invalid config, 5 nondeterminism/parity.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSimScenario, validateSimScenario, formatSimScenarioIssue } from '../src/contracts/simScenarioSchema.js';
import { runLabScenario } from '../src/testing/lab/runScenario.js';
import { repeatScenario } from '../src/testing/lab/repeat.js';
import { replayScenario } from '../src/testing/lab/replay.js';
import { compareSaveLoad } from '../src/testing/lab/saveLoadCompare.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO_DIR = join(ROOT, 'src/testing/scenarios');

const EXIT = {
  PASS: 0,
  FAIL: 1,
  BLOCKED: 2,
  INFRA: 3,
  INVALID: 4,
  NONDETERMINISM: 5,
};

/**
 * Entry from scripts/sf.mjs: args are tokens after `lab`.
 * @param {string[]} args
 */
export async function runLabCommand(args) {
  const action = args[0] || 'help';
  if (action === 'help' || action === '--help' || action === '-h') {
    printHelp();
    return EXIT.PASS;
  }

  const rest = args.slice(1);
  const flags = parseFlags(rest);
  const positional = rest.filter((a) => !a.startsWith('--'));
  const scenarioRef = positional[0];
  const verbosity = clampVerbosity(flags.verbosity ?? flags.v ?? 1);

  try {
    if (action === 'validate') {
      return await cmdValidate(scenarioRef, flags, verbosity);
    }
    if (action === 'run') {
      return await cmdRun(scenarioRef, flags, verbosity);
    }
    if (action === 'repeat') {
      return await cmdRepeat(scenarioRef, flags, verbosity);
    }
    if (action === 'compare') {
      return await cmdCompare(scenarioRef, flags, verbosity);
    }
    if (action === 'replay') {
      return await cmdReplay(scenarioRef, flags, verbosity);
    }
    if (action === 'trace') {
      return await cmdTrace(scenarioRef, flags, verbosity);
    }
    emit({
      schema: 'spaceface.labCliResult.v1',
      ok: false,
      exitClass: EXIT.INVALID,
      error: `unknown lab action: ${action}`,
    }, verbosity);
    return EXIT.INVALID;
  } catch (err) {
    emit({
      schema: 'spaceface.labCliResult.v1',
      ok: false,
      exitClass: EXIT.INFRA,
      error: err && err.message ? err.message : String(err),
      stack: verbosity >= 3 && err && err.stack ? err.stack : undefined,
    }, verbosity);
    return EXIT.INFRA;
  }
}

async function cmdValidate(scenarioRef, flags, verbosity) {
  if (!scenarioRef) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: 'scenario required' }, verbosity);
    return EXIT.INVALID;
  }
  const loaded = loadScenario(scenarioRef);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: loaded.error }, verbosity);
    return EXIT.INVALID;
  }
  const validation = validateSimScenario(loaded.doc, { file: loaded.path });
  const compiled = validation.ok ? compileSimScenario(loaded.doc, { file: loaded.path }) : null;
  emit({
    schema: 'spaceface.labCliResult.v1',
    ok: validation.ok,
    exitClass: validation.ok ? EXIT.PASS : EXIT.INVALID,
    command: 'validate',
    scenario: loaded.path,
    validation,
    canonical: compiled && compiled.ok ? compiled.canonical : null,
    issues: validation.ok ? [] : validation.issues.map(formatSimScenarioIssue),
  }, verbosity);
  return validation.ok ? EXIT.PASS : EXIT.INVALID;
}

async function cmdRun(scenarioRef, flags, verbosity) {
  if (!scenarioRef) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: 'scenario required' }, verbosity);
    return EXIT.INVALID;
  }
  const loaded = loadScenario(scenarioRef);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: loaded.error }, verbosity);
    return EXIT.INVALID;
  }
  const result = await runLabScenario(loaded.doc, {
    file: loaded.path,
    verbosity,
    observerEnabled: flags.observer === true || flags['observer-on'] === true,
    saveLoadAt: flags['save-load-at'] != null ? Number(flags['save-load-at']) : undefined,
  });
  emit({
    schema: 'spaceface.labCliResult.v1',
    ok: result.ok,
    exitClass: result.exitClass,
    command: 'run',
    scenario: loaded.path,
    result: slimResult(result, verbosity),
  }, verbosity);
  return result.exitClass;
}

async function cmdRepeat(scenarioRef, flags, verbosity) {
  if (!scenarioRef) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: 'scenario required' }, verbosity);
    return EXIT.INVALID;
  }
  const loaded = loadScenario(scenarioRef);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: loaded.error }, verbosity);
    return EXIT.INVALID;
  }
  const result = await repeatScenario(loaded.doc, {
    file: loaded.path,
    verbosity,
    runs: flags.runs != null ? Number(flags.runs) : 2,
    observerEnabled: flags.observer === true,
  });
  emit({
    schema: 'spaceface.labCliResult.v1',
    ok: result.ok,
    exitClass: result.exitClass,
    command: 'repeat',
    scenario: loaded.path,
    result,
  }, verbosity);
  return result.exitClass;
}

async function cmdCompare(scenarioRef, flags, verbosity) {
  if (!scenarioRef) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: 'scenario required' }, verbosity);
    return EXIT.INVALID;
  }
  const loaded = loadScenario(scenarioRef);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: loaded.error }, verbosity);
    return EXIT.INVALID;
  }
  const kind = flags.kind || 'save-load';
  if (kind !== 'save-load') {
    emit({
      schema: 'spaceface.labCliResult.v1',
      ok: false,
      exitClass: EXIT.INVALID,
      error: `unsupported compare kind: ${kind} (supported: save-load)`,
    }, verbosity);
    return EXIT.INVALID;
  }
  const result = await compareSaveLoad(loaded.doc, {
    file: loaded.path,
    verbosity,
    saveLoadAt: flags['save-load-at'] != null ? Number(flags['save-load-at']) : undefined,
  });
  emit({
    schema: 'spaceface.labCliResult.v1',
    ok: result.ok,
    exitClass: result.exitClass,
    command: 'compare',
    scenario: loaded.path,
    result,
  }, verbosity);
  return result.exitClass;
}

async function cmdReplay(scenarioRef, flags, verbosity) {
  if (!scenarioRef) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: 'scenario required' }, verbosity);
    return EXIT.INVALID;
  }
  const loaded = loadScenario(scenarioRef);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: EXIT.INVALID, error: loaded.error }, verbosity);
    return EXIT.INVALID;
  }
  const result = await replayScenario(loaded.doc, {
    file: loaded.path,
    verbosity,
    fingerprint: flags.fingerprint || null,
  });
  emit({
    schema: 'spaceface.labCliResult.v1',
    ok: result.ok,
    exitClass: result.exitClass,
    command: 'replay',
    scenario: loaded.path,
    result,
  }, verbosity);
  return result.exitClass;
}

async function cmdTrace(scenarioRef, flags, verbosity) {
  // Trace = run at high verbosity
  return cmdRun(scenarioRef, flags, Math.max(verbosity, 3));
}

function loadScenario(ref) {
  if (!ref) return { ok: false, error: 'scenario ref required' };
  const candidates = [];
  if (ref.endsWith('.json') || ref.includes('/') || ref.includes('\\')) {
    candidates.push(resolve(process.cwd(), ref));
    candidates.push(resolve(ROOT, ref));
  } else {
    candidates.push(join(SCENARIO_DIR, `${ref}.scenario.json`));
    candidates.push(join(SCENARIO_DIR, ref));
    candidates.push(join(SCENARIO_DIR, `${ref}.json`));
    // Allow id-like refs: flight.fixed-input.baseline → flight-fixed-input.scenario.json
    const dashed = ref.replace(/\./g, '-');
    candidates.push(join(SCENARIO_DIR, `${dashed}.scenario.json`));
  }
  for (const path of candidates) {
    if (existsSync(path)) {
      try {
        const doc = JSON.parse(readFileSync(path, 'utf8'));
        return { ok: true, path: path.replace(/\\/g, '/'), doc };
      } catch (err) {
        return { ok: false, error: `failed to parse ${path}: ${err.message}` };
      }
    }
  }
  // Map known short names
  const SHORT = {
    'flight-fixed-input': 'flight-fixed-input.scenario.json',
    'flight.fixed-input.baseline': 'flight-fixed-input.scenario.json',
    'massline-latch-reel': 'massline-latch-reel.scenario.json',
    'massline.latch-reel': 'massline-latch-reel.scenario.json',
    'massline-orbit-assist': 'massline-orbit-assist.scenario.json',
    'massline.orbit-assist': 'massline-orbit-assist.scenario.json',
    'flight-save-load': 'flight-save-load.scenario.json',
    'flight.save-load.continuation': 'flight-save-load.scenario.json',
  };
  if (SHORT[ref]) {
    const path = join(SCENARIO_DIR, SHORT[ref]);
    if (existsSync(path)) {
      const doc = JSON.parse(readFileSync(path, 'utf8'));
      return { ok: true, path: path.replace(/\\/g, '/'), doc };
    }
  }
  return { ok: false, error: `scenario not found: ${ref}` };
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next != null && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

function clampVerbosity(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(4, n | 0));
}

function slimResult(result, verbosity) {
  if (!result) return result;
  if (verbosity >= 3) return result;
  const {
    schema, ok, exitClass, status, runId, scenarioId, seed, ticks,
    evidenceClass, rendering, observerEnabled, scenarioDigest, inputDigest,
    overlay, fingerprint, params, metrics, oracle, checkpoints, traceHash, failure, live, error,
  } = result;
  return {
    schema, ok, exitClass, status, runId, scenarioId, seed, ticks,
    evidenceClass, rendering, observerEnabled, scenarioDigest, inputDigest,
    overlay, fingerprint, params, metrics, oracle, checkpoints, traceHash, failure, live, error,
  };
}

function emit(payload, verbosity) {
  if (verbosity <= 0) {
    process.stdout.write(JSON.stringify({
      schema: payload.schema,
      ok: payload.ok,
      exitClass: payload.exitClass,
      status: payload.status || (payload.ok ? 'pass' : 'fail'),
    }) + '\n');
    return;
  }
  process.stdout.write(JSON.stringify(payload, null, verbosity >= 2 ? 2 : 0) + '\n');
}

function printHelp() {
  process.stdout.write(`sf lab — Deterministic Gameplay Lab

Usage:
  sf lab validate <scenario>
  sf lab run <scenario> [--verbosity 0-4] [--observer-on] [--save-load-at N]
  sf lab repeat <scenario> [--runs N]
  sf lab compare <scenario> [--kind save-load] [--save-load-at N]
  sf lab replay <scenario> [--fingerprint <hex>]
  sf lab trace <scenario>

Scenarios live under src/testing/scenarios/ (id or path).
Exit classes: 0 pass | 1 fail | 2 blocked | 3 infra | 4 invalid | 5 nondeterminism
`);
}

// Direct execution
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runLabCommand(process.argv.slice(2)).then((code) => {
    process.exitCode = code == null ? 1 : code;
  }).catch((err) => {
    process.stderr.write((err && err.stack) || String(err));
    process.stderr.write('\n');
    process.exitCode = 3;
  });
}
