#!/usr/bin/env node
// No-boot iteration front door. Uses the existing lab, UI bench and broker process control.
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, openSync, closeSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseOptions, positiveInteger, insideRoot, scenarioPath, planForFiles, failureKey, aggregateRows } from './lib/agentLoopPlan.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMMANDS = {
  plan: { files: 'value', base: 'value' },
  compare: {},
  sim: { trace: 'boolean', 'timeout-ms': 'value', 'retry-reason': 'value' },
  ui: { viewports: 'value', walk: 'boolean', phone: 'boolean', max: 'value',
    'timeout-ms': 'value', 'cell-timeout-ms': 'value', 'retry-reason': 'value' },
  _worker: { job: 'value' },
};
function json(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n'); renameSync(temp, path);
}
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0').filter(Boolean);
}

// HEAD binds every unchanged tracked byte; hash only working-tree edits/untracked source.
// Do not read the asset bank or hundreds of MB of unchanged source on every iteration.
function fingerprintSnapshot(invocation) {
  const changed = [...git(['diff', '--name-only', '-z', 'HEAD', '--']),
    ...git(['ls-files', '--others', '--exclude-standard', '-z'])];
  const source = changed.filter(file => /\.(?:[cm]?js|jsx|tsx?|css|html|jsonc?|ya?ml|toml|glsl|wgsl|vert|frag)$/.test(file));
  const environment = { head: git(['rev-parse', '--verify', 'HEAD']).join('').trim(),
    chromium: process.env.SF_CHROMIUM || '', nodeOptions: process.env.NODE_OPTIONS || '' };
  return { key: failureKey(ROOT, source, invocation, environment),
    assetsDirty: git(['status', '--porcelain', '-z', '--', 'assets']).length > 0 };
}

export async function main(argv = process.argv.slice(2)) {
  const [command = 'help', ...rest] = argv;
  if (['help', '--help', '-h'].includes(command)) {
    console.log(`SpaceFace fast iteration (never a player-acceptance substitute)
  node scripts/agent-loop.mjs plan [--files=src/systems/flightV3.js] [--base=HEAD]
  node scripts/agent-loop.mjs sim flight-fixed-input flight-save-load
  node scripts/agent-loop.mjs sim flight-fixed-input --trace
  node scripts/agent-loop.mjs compare <before-handling.json> <after-handling.json>
  node scripts/agent-loop.mjs ui pause,settings --viewports=960x540,1920x1080 --walk

sim auto-selects run/repeat/save-load from declared assertions; browser/mixed equivalences fail closed.
--trace produces a diagnostic trajectory/handling report (exit 4, never acceptance-green).
Simulation imports are amortized across the batch; each scenario still creates/disposes its own runtime.
--timeout-ms bounds the whole child batch (sim 60000, ui 120000); completed artifacts survive timeout.
An unchanged failure is stopped. After a real environment repair use --retry-reason="what changed".
Artifacts/logs: .devshots/agent-loop/<unique run>/summary.json
Final integration: existing validation broker/player-truth commands, once per affected coherent change.`);
    return 0;
  }
  if (!COMMANDS[command]) throw new Error(`Unknown command: ${command}`);
  const { options, positional } = parseOptions(rest, COMMANDS[command]);
  if (command === '_worker') return worker(insideRoot(ROOT, options.job || ''));
  if (command === 'compare') {
    if (positional.length !== 2) throw new Error('compare requires before and after handling JSON files');
    const { compareHandling } = await import('./lib/labTraceReport.mjs');
    const reports = positional.map(file => JSON.parse(readFileSync(insideRoot(ROOT, file), 'utf8')));
    const comparison = compareHandling(...reports);
    console.log(JSON.stringify({ schema: 'spaceface.agentLoopComparison.v1', nonPromoting: true,
      gameBoots: 0, ...comparison }, null, 2));
    return comparison.comparable ? 0 : 4; // Success means comparable, never "better" or acceptance.
  }
  if (command === 'plan') {
    if (positional.length) throw new Error('plan takes --files or --base, not positional arguments');
    const base = options.base || 'HEAD';
    if (base.startsWith('-')) throw new Error('Invalid base ref');
    const files = options.files ? options.files.split(',').filter(Boolean) : [
      ...git(['diff', '--name-only', '-z', base, '--']), ...git(['ls-files', '--others', '--exclude-standard', '-z']),
    ];
    console.log(JSON.stringify(planForFiles(files), null, 2)); return 0;
  }
  const refs = [...new Set(positional.flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean))];
  if (!refs.length) throw new Error(`${command} requires at least one ${command === 'sim' ? 'scenario' : 'screen'}`);
  const timeoutMs = positiveInteger(options['timeout-ms'], command === 'sim' ? 60_000 : 120_000);
  const scenarios = command === 'sim' ? refs.map(ref => relative(ROOT, scenarioPath(ROOT, ref))) : [];
  const invocation = { command, refs, ...options, 'retry-reason': undefined };
  const { key, assetsDirty } = fingerprintSnapshot(invocation);
  const artifactRoot = join(ROOT, '.devshots/agent-loop');
  mkdirSync(join(artifactRoot, 'failures'), { recursive: true });
  const guardFile = join(artifactRoot, 'failures', `${key}.json`);
  if (!assetsDirty && existsSync(guardFile) && !options['retry-reason']) {
    const previous = JSON.parse(readFileSync(guardFile, 'utf8'));
    console.log(JSON.stringify({ schema: 'spaceface.agentLoopSummary.v1', ok: false, nonPromoting: true,
      status: 'stopped-unchanged-failure', exitClass: 2, previous,
      next: 'Read the previous logs, reduce the failure, and change the owner. For a real environment repair, record --retry-reason.' }, null, 2));
    return 2;
  }
  const out = join(artifactRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  mkdirSync(out, { recursive: true });
  const job = { command, scenarios, trace: options.trace === true, out: relative(ROOT, out), fingerprint: key };
  json(join(out, 'job.json'), job);
  const args = command === 'sim' ? ['scripts/agent-loop.mjs', '_worker', `--job=${relative(ROOT, join(out, 'job.json'))}`]
    : ['scripts/ui-bench.mjs', `--shot=${refs.join(',')}`, `--out=${relative(ROOT, join(out, 'ui'))}`,
      `--timeout-ms=${positiveInteger(options['cell-timeout-ms'], 30_000, 300_000)}`,
      ...(options.viewports ? [`--viewports=${options.viewports}`] : []),
      ...(options.walk ? ['--walk'] : []), ...(options.phone ? ['--phone'] : []),
      ...(options.max ? [`--max=${positiveInteger(options.max, 24, 1000)}`] : [])];
  const { runWithTimeout, killProcessTree } = await import('./lib/validationProcessControl.mjs');
  const stdoutPath = join(out, 'stdout.log'), stderrPath = join(out, 'stderr.log');
  const stdout = openSync(stdoutPath, 'w'), stderr = openSync(stderrPath, 'w');
  let childPid = null, interrupted = false;
  const interrupt = () => { interrupted = true; if (childPid) void killProcessTree(childPid); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  let execution;
  try {
    execution = await runWithTimeout({ command: process.execPath, args, cwd: ROOT, timeoutMs,
      stdio: ['ignore', stdout, stderr], ownership: { probeId: 'agent-loop', browserOwned: command === 'ui', serverOwned: command === 'ui' },
      onSpawn: info => { childPid = info.pid; } });
  } finally {
    closeSync(stdout); closeSync(stderr);
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
  }
  let summary;
  const detailFile = join(out, command === 'sim' ? 'batch.json' : 'ui/report.json');
  let detail = null;
  try { detail = JSON.parse(readFileSync(detailFile, 'utf8')); } catch { /* incomplete children are not green */ }
  if (command === 'sim') {
    const rows = detail?.rows || [];
    summary = { ...aggregateRows(rows, scenarios.length), rows,
      notRun: scenarios.slice(rows.length) };
  } else {
    const captured = execution.exitCode === 0 && detail?.ok === true;
    summary = { ok: captured, nonPromoting: true, exitClass: captured ? 0 : 1,
      status: captured ? 'ui-fixtures-captured' : 'failed-or-incomplete',
      gameBoots: 0, browserLaunches: detail?.browserLaunches ?? null,
      report: relative(ROOT, detailFile), visualReview: 'Open the PNGs. Captures/findings do not certify appearance or live-route behavior.' };
  }
  if (interrupted || execution.timedOut || execution.status === 'infra_error' || execution.exitCode == null) {
    Object.assign(summary, { ok: false, status: interrupted ? 'interrupted' : execution.timedOut ? 'timeout' : 'infra-error', exitClass: 3 });
  } else if (execution.exitCode !== summary.exitClass) {
    Object.assign(summary, { ok: false, status: 'child-result-mismatch', exitClass: execution.exitCode || 3 });
  }
  Object.assign(summary, { schema: 'spaceface.agentLoopSummary.v1', fingerprint: key,
    durationMs: execution.durationMs, timeoutMs, retryReason: options['retry-reason'] || null,
    stdout: relative(ROOT, stdoutPath), stderr: relative(ROOT, stderrPath),
    artifacts: relative(ROOT, out), child: execution.pidRecord });
  const after = fingerprintSnapshot(invocation);
  const sourceChangedDuringRun = after.key !== key;
  if (sourceChangedDuringRun) Object.assign(summary, { ok: false, status: 'source-changed-during-run', exitClass: 3 });
  Object.assign(summary, { sourceChangedDuringRun, failureReuseDisabledForDirtyAssets: assetsDirty || after.assetsDirty });
  json(join(out, 'summary.json'), summary);
  if (!assetsDirty && !after.assetsDirty && !sourceChangedDuringRun && !summary.ok && summary.status !== 'diagnostic-complete') {
    json(guardFile, { fingerprint: key, status: summary.status, artifacts: relative(ROOT, out), at: new Date().toISOString() });
  }
  console.log(JSON.stringify(summary, null, 2)); return summary.exitClass;
}

async function worker(jobPath) {
  const job = JSON.parse(readFileSync(jobPath, 'utf8'));
  const out = realpathSync(resolve(ROOT, job.out)), rows = [];
  if (!Array.isArray(job.scenarios) || !job.scenarios.length) throw new Error('Worker requires scenarios');
  // Validate output location independently of the parent, including symlink traversal.
  if (!relative(realpathSync(resolve(ROOT, '.devshots/agent-loop')), out) || relative(realpathSync(resolve(ROOT, '.devshots/agent-loop')), out).startsWith('..')) {
    throw new Error('Worker output must be a run folder under .devshots/agent-loop');
  }
  const { executeLabRequest, selectHeadlessAction, labExitCode } = await import('./lib/labExecution.mjs');
  const { summarizeTrace, handlingHtml } = await import('./lib/labTraceReport.mjs');
  for (const [index, path] of job.scenarios.entries()) {
    const started = performance.now(), stem = String(index + 1).padStart(3, '0');
    let result, action = job.trace ? 'trace' : 'auto', doc;
    try {
      const file = insideRoot(ROOT, path);
      doc = JSON.parse(readFileSync(file, 'utf8'));
      if (!job.trace) action = await selectHeadlessAction(doc);
      result = await executeLabRequest(action, doc, { file, verbosity: 3 });
    } catch (error) {
      result = { ok: false, exitClass: action === 'auto' ? 4 : 3, status: 'invalid-or-infra',
        nonPromoting: true, error: error?.stack || String(error) };
    }
    const resultPath = `${stem}-result.json`;
    json(join(out, resultPath), result);
    const arm = result.trace ? result : result.primary;
    let report;
    try { report = summarizeTrace(arm, { dt: doc?.dt ?? 1 / 60 }); }
    catch (error) { report = { available: false, nonPromoting: true, reason: error.message }; }
    json(join(out, `${stem}-handling.json`), report);
    writeFileSync(join(out, `${stem}-handling.html`), handlingHtml(report, arm?.trace, arm?.inputLog));
    rows.push({ scenario: path, action, ok: result.ok === true, nonPromoting: result.nonPromoting === true,
      exitClass: labExitCode(result), status: result.status, durationMs: performance.now() - started,
      diagnostic: action === 'trace', captureOk: action === 'trace' ? report.available : undefined,
      evidenceClass: result.evidenceClass ?? result.primary?.executionEvidenceClass ?? null,
      firstBadTick: result.oracle?.firstBadTick ?? result.primary?.oracle?.firstBadTick ?? null,
      result: resultPath, handling: `${stem}-handling.json`, view: `${stem}-handling.html` });
    json(join(out, 'batch.json'), { ...aggregateRows(rows, job.scenarios.length), rows });
    console.log(`${stem} ${action} ${path}: ${result.status} (${rows.at(-1).durationMs.toFixed(1)} ms)`);
  }
  return aggregateRows(rows, job.scenarios.length).exitClass;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error?.stack || String(error)); process.exitCode = 3;
  });
}
