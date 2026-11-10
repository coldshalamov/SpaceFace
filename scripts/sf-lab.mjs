#!/usr/bin/env node
// sf lab: authoritative executors, lazy imports, bounded verbosity. Trace is diagnostic, not a seal.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOptions } from './lib/agentLoopPlan.mjs';
import { executeLabRequest, labExitCode } from './lib/labExecution.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCENARIO_DIR = join(ROOT, 'src/testing/scenarios');
const FLAGS = { verbosity: 'value', v: 'value', observer: 'boolean', 'observer-on': 'boolean',
  'save-load-at': 'value', runs: 'value', kind: 'value', runtimes: 'value',
  'checkpoint-every': 'value', timeout: 'value', fingerprint: 'value' };

export async function runLabCommand(args) {
  const action = args[0] || 'help';
  if (['help', '--help', '-h'].includes(action)) { printHelp(); return 0; }
  let verbosity = 1;
  let flags, positional;
  try {
    ({ options: flags, positional } = parseOptions(args.slice(1), FLAGS));
    verbosity = clampVerbosity(flags.verbosity ?? flags.v ?? 1);
    if (!['validate', 'run', 'repeat', 'compare', 'replay', 'trace'].includes(action)) throw new Error(`unknown lab action: ${action}`);
    if (positional.length !== 1) throw new Error('exactly one scenario required');
  } catch (err) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: 4, error: err.message }, verbosity);
    return 4;
  }
  const loaded = loadScenario(positional[0]);
  if (!loaded.ok) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: 4, error: loaded.error }, verbosity);
    return 4;
  }
  try {
    if (action === 'validate') {
      const { compileSimScenario, validateSimScenario, formatSimScenarioIssue } = await import('../src/contracts/simScenarioSchema.js');
      const validation = validateSimScenario(loaded.doc, { file: loaded.path });
      const compiled = validation.ok ? compileSimScenario(loaded.doc, { file: loaded.path }) : null;
      emit({ schema: 'spaceface.labCliResult.v1', ok: validation.ok, exitClass: validation.ok ? 0 : 4,
        command: 'validate', scenario: loaded.path, validation,
        canonical: compiled?.ok ? compiled.canonical : null,
        issues: validation.ok ? [] : validation.issues.map(formatSimScenarioIssue) }, verbosity);
      return validation.ok ? 0 : 4;
    }
    let options;
    try {
      options = { file: loaded.path, verbosity, observer: flags.observer === true || flags['observer-on'] === true,
        saveLoadAt: numericFlag(flags, 'save-load-at', 0), runs: numericFlag(flags, 'runs', 2),
        kind: flags.kind, runtimes: flags.runtimes, checkpointEvery: numericFlag(flags, 'checkpoint-every', 1),
        timeoutMs: numericFlag(flags, 'timeout', 1), fingerprint: flags.fingerprint };
      if (flags.kind && flags.kind !== 'save-load') throw new Error(`unsupported compare kind: ${flags.kind}`);
      if (flags.runtimes) {
        const runtimes = flags.runtimes.split(',').map(s => s.trim().toLowerCase());
        if (!runtimes.includes('node') || !runtimes.some(s => s === 'chromium' || s === 'browser')
          || runtimes.some(s => !['node', 'chromium', 'browser'].includes(s))) {
          throw new Error('compare --runtimes supports node,chromium (both required)');
        }
      }
    } catch (error) {
      emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: 4, error: error.message }, verbosity);
      return 4;
    }
    const result = await executeLabRequest(action, loaded.doc, options);
    const exitClass = labExitCode(result);
    const diagnostic = action === 'trace' || result.nonPromoting === true;
    const payload = { schema: 'spaceface.labCliResult.v1', ok: result.ok, exitClass, command: action,
      scenario: loaded.path, result: slimResult(result, action === 'trace' ? 4 : verbosity),
      ...(diagnostic ? { nonPromoting: true, certifying: false,
        note: 'Diagnostic internal arm; does not certify declared multi-run equivalences or a public route.' } : {}) };
    if (action === 'trace') payload.captureOk = Array.isArray(result.trace) && result.trace.length > 0;
    if (action === 'compare' && flags.runtimes) {
      payload.kind = 'node-chromium'; payload.browserLaunches = result.browserLaunches | 0;
    }
    emit(payload, action === 'trace' ? Math.max(3, verbosity) : verbosity);
    return exitClass;
  } catch (err) {
    emit({ schema: 'spaceface.labCliResult.v1', ok: false, exitClass: 3,
      error: err?.message || String(err), stack: verbosity >= 3 ? err?.stack : undefined }, verbosity);
    return 3;
  }
}

function numericFlag(flags, key, min) {
  if (flags[key] == null) return undefined;
  const n = Number(flags[key]);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(`--${key} must be an integer >= ${min}`);
  return n;
}

function loadScenario(ref) {
  if (!ref) return { ok: false, error: 'scenario ref required' };
  const candidates = [];
  if (ref.endsWith('.json') || ref.includes('/') || ref.includes('\\')) {
    candidates.push(resolve(process.cwd(), ref), resolve(ROOT, ref));
  } else {
    candidates.push(join(SCENARIO_DIR, `${ref}.scenario.json`), join(SCENARIO_DIR, ref),
      join(SCENARIO_DIR, `${ref}.json`), join(SCENARIO_DIR, `${ref.replace(/\./g, '-')}.scenario.json`));
  }
  const SHORT = { 'flight.fixed-input.baseline': 'flight-fixed-input.scenario.json',
    'massline.latch-reel': 'massline-latch-reel.scenario.json',
    'massline.orbit-assist': 'massline-orbit-assist.scenario.json',
    'flight.save-load.continuation': 'flight-save-load.scenario.json' };
  if (SHORT[ref]) candidates.push(join(SCENARIO_DIR, SHORT[ref]));
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try { return { ok: true, path: path.replace(/\\/g, '/'), doc: JSON.parse(readFileSync(path, 'utf8')) }; }
    catch (err) { return { ok: false, error: `failed to parse ${path}: ${err.message}` }; }
  }
  return { ok: false, error: `scenario not found: ${ref}` };
}

function clampVerbosity(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, n | 0)) : 1;
}
function slimResult(result, verbosity) {
  if (!result || verbosity >= 3) return result;
  // Keep every authority/diagnostic flag. Only remove bulky observations, never evidence scope.
  const { trace, oracleTrace, inputLog, ...rest } = result;
  return rest;
}
function emit(payload, verbosity) {
  if (verbosity <= 0) {
    process.stdout.write(JSON.stringify({ schema: payload.schema, ok: payload.ok, exitClass: payload.exitClass,
      status: payload.status || (payload.ok ? 'pass' : 'fail'),
      ...(payload.nonPromoting ? { nonPromoting: true, certifying: false } : {}) }) + '\n');
  } else process.stdout.write(JSON.stringify(payload, null, verbosity >= 2 ? 2 : 0) + '\n');
}
function printHelp() {
  process.stdout.write(`sf lab — Deterministic Gameplay Lab

Usage:
  sf lab validate <scenario>
  sf lab run <scenario> [--verbosity 0-4] [--observer-on] [--save-load-at N]
  sf lab repeat <scenario> [--runs N]
  sf lab compare <scenario> [--kind save-load] [--save-load-at N]
  sf lab compare <scenario> --runtimes node,chromium [--checkpoint-every N]
  sf lab replay <scenario> [--fingerprint <hex>]
  sf lab trace <scenario>

Trace emits poses AND inputLog from the real runner, marked nonPromoting.
A successful diagnostic arm exits 4, not acceptance-green 0. Inspect captureOk and the oracle result.
Batch without a browser: node scripts/agent-loop.mjs sim <scenario> [<scenario> ...]
Scenarios live under src/testing/scenarios/ (id or path).
Exit classes: 0 pass | 1 fail | 2 blocked | 3 infra | 4 invalid/diagnostic/incomplete | 5 nondeterminism
`);
}
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runLabCommand(process.argv.slice(2)).then(code => { process.exitCode = code ?? 1; }).catch(err => {
  process.stderr.write((err?.stack || String(err)) + '\n'); process.exitCode = 3;
});
