#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ciMatrixSourceCommand } from './lib/ciGateGraph.mjs';

const DEFAULT_TIMEOUT_MS = 180000;
const LONG_TIMEOUT_MS = 420000;
const TAIL_LIMIT = 1600;

const SMOKE_COMMANDS = [
  cmd('vision-assertions', 'npm run check:vision:assertions'),
  cmd('ui-screen-imports', 'node scripts/check-ui-screen-imports.mjs'),
  cmd('47a-compare', 'npm run check:sim:compare'),
  cmd('47a-live-cold-open', 'npm run check:47a:live-cold-open', LONG_TIMEOUT_MS),
  cmd('first-15-runtime', 'npm run check:first-15-runtime', LONG_TIMEOUT_MS),
  cmd('market-first-loop', 'npm run check:market-first-loop', LONG_TIMEOUT_MS),
  cmd('claim-base', 'npm run check:claim-base'),
  cmd('flight-clean', 'npm run check:flight:clean', LONG_TIMEOUT_MS),
  cmd('save-schema', 'npm run check:save-schema'),
  // PQ-137.10: every FEEL_CONTRACT bar the bench can reach (B1-B8, B11, B13) is a real-path scenario
  // with a test that prints its number; feel that is not measured regresses.
  cmd('feel-scenarios', 'npm run check:feel:scenarios', LONG_TIMEOUT_MS),
  // Wired owner-seam proofs: each is a new node --test of live production that smoke must run.
  cmd('seam-cloak', 'node --test test/seam-cloak.test.mjs'),
  cmd('seam-beacons', 'node --test test/seam-beacons.test.mjs'),
  cmd('seam-fragile-cargo', 'node --test test/seam-fragile-cargo.test.mjs'),
  cmd('seam-jettison-impulse', 'node --test test/seam-jettison-impulse.test.mjs'),
  cmd('seam-bullet-time', 'node --test test/seam-bullet-time.test.mjs'),
  cmd('seam-scan-reveal', 'node --test test/seam-scan-reveal.test.mjs'),
  cmd('seam-kill-causality', 'node --test test/seam-kill-causality.test.mjs'),
  cmd('seam-combat-statuses', 'node --test test/seam-combat-statuses.test.mjs'),
  cmd('seam-combat-subsystems', 'node --test test/seam-combat-subsystems.test.mjs'),
  cmd('seam-fire-discipline', 'node --test test/seam-fire-discipline.test.mjs'),
  cmd('seam-gunnery', 'node --test test/seam-gunnery.test.mjs'),
  cmd('seam-inspection', 'node --test test/seam-inspection.test.mjs'),
  cmd('seam-pirate-disguise', 'node --test test/seam-pirate-disguise.test.mjs'),
  cmd('seam-terrain-anchors', 'node --test test/seam-terrain-anchors.test.mjs'),
  cmd('seam-bounty-hunt', 'node --test test/seam-bounty-hunt.test.mjs'),
  cmd('seam-mines', 'node --test test/seam-mines.test.mjs'),
];

// NOTE: the CLI entry point is at the BOTTOM of this file, not here. The group/shard classifier
// below is built from `const` tables, and a top-level `await runCli()` placed above them runs inside
// their temporal dead zone.

async function runCli() {
  const failFast = process.argv.includes('--fail-fast');
  const smoke = process.argv.includes('--smoke');
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const scripts = packageJson.scripts || {};
  // The matrix source is `CI_MATRIX_ROOT_SCRIPTS` in scripts/lib/ciGateGraph.mjs — one declaration,
  // shared with check-gate-reachability.mjs and with every gate that asserts "check:ci runs me".
  // Those gates resolve `check:ci` -> `check:ci:report` -> this runner -> this same list, so if the
  // list changes they follow it instead of silently reporting zero.
  const completeCheckCommand = ciMatrixSourceCommand(scripts);
  const commands = smoke
    ? SMOKE_COMMANDS
    : buildCommandMatrix(completeCheckCommand, scripts);
  if (commands.length === 0) throw new Error('No commands found in the package check matrix');

  if (process.argv.includes('--list-groups')) {
    const unclassified = findUnclassifiedCommands(commands, scripts);
    console.log(formatGroupTable(commands, scripts));
    process.exitCode = unclassified.length ? 1 : 0;
    return;
  }

  const group = readFlagValue('--group');
  const shard = parseShardArg(readFlagValue('--shard'));

  // Fail closed on an unclassified command whenever the matrix is being partitioned: a command in no
  // group would otherwise silently run in NO parallel job, and the gate would still go green.
  if (group || shard) {
    const unclassified = findUnclassifiedCommands(commands, scripts);
    if (unclassified.length) {
      throw new Error(
        `${unclassified.length} check matrix command(s) belong to no group — classify them in `
        + `COMMAND_GROUPS (scripts/check-ci-report.mjs) or CI will not run them:\n`
        + unclassified.map((c) => `  - ${c.id}: ${c.command}`).join('\n'),
      );
    }
  }

  let selected = commands;
  if (group) selected = selectGroup(selected, group, scripts);
  if (shard) selected = selectShard(selected, shard);

  const selectionLabel = [
    group ? `group=${group}` : null,
    shard ? `shard=${shard.index}/${shard.total}` : null,
  ].filter(Boolean).join(' ');
  if (selectionLabel) {
    console.log(`[check-ci-report] ${selectionLabel}: ${selected.length} of ${commands.length} commands`);
  }

  const startedAt = new Date().toISOString();
  const artifactRoot = buildArtifactRoot(startedAt);
  const results = [];

  for (const command of selected) {
    const result = await run(command, {
      artifactPath: buildArtifactPath(startedAt, command.id),
    });
    results.push(result);
    if (!result.ok && failFast) break;
  }

  const report = buildCiReport({
    startedAt,
    finishedAt: new Date().toISOString(),
    failFast,
    artifactRoot,
    // Identifier, not prose — downstream tooling groups on this. `precheck` is still read above as a
    // tripwire, but it no longer exists, so the honest name for the matrix source is just `check`.
    matrixSource: smoke ? 'smoke' : 'package:scripts.check',
    group: group || null,
    shard,
    matrixCommandCount: commands.length,
    results,
  });

  // Persist the report next to the per-command logs and emit a markdown sibling, so a run leaves a
  // durable artifact instead of only a 2 MB blob on stdout.
  await mkdir(artifactRoot, { recursive: true }).catch(() => {});
  await writeFile(`${artifactRoot}/report.json`, JSON.stringify(report, null, 2)).catch(() => {});
  await writeFile(`${artifactRoot}/report.md`, formatCiReportMarkdown(report)).catch(() => {});

  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else console.log(formatCiReportMarkdown(report));
  console.log(`\n[check-ci-report] artifacts: ${artifactRoot}/  (report.json, report.md, per-command .log)`);
  process.exitCode = report.ok ? 0 : 1;
}

/**
 * Compact, failure-first summary. The whole point of running every command instead of stopping at the
 * first `&&` failure is to learn the SET of things that are broken — which only helps if that set is
 * legible without grepping a giant JSON blob.
 */
export function formatCiReportMarkdown(report) {
  const results = Array.isArray(report && report.results) ? report.results : [];
  const failed = results.filter((r) => r && !r.ok);
  const lines = [];
  lines.push('# SpaceFace check report');
  lines.push('');
  lines.push(`- Started: ${report.startedAt || '?'}`);
  lines.push(`- Finished: ${report.finishedAt || '?'}`);
  lines.push(`- Matrix: \`${report.matrixSource || '?'}\``);
  if (report.group) lines.push(`- Group: \`${report.group}\``);
  if (report.shard) lines.push(`- Shard: \`${report.shard.index}/${report.shard.total}\``);
  if (Number.isFinite(report.matrixCommandCount) && report.matrixCommandCount !== results.length) {
    lines.push(`- Selected: **${results.length}** of **${report.matrixCommandCount}** matrix commands`);
  }
  lines.push(`- Commands: **${results.length}** — passed **${results.length - failed.length}**, failed **${failed.length}**`);
  lines.push(`- Result: **${report.ok ? 'PASS' : 'FAIL'}**`);
  lines.push('');
  if (failed.length) {
    lines.push('## Failures');
    lines.push('');
    lines.push('| # | id | exit | command |');
    lines.push('| ---: | --- | ---: | --- |');
    failed.forEach((r, i) => {
      lines.push(`| ${i + 1} | \`${r.id || '?'}\` | ${r.code ?? '?'} | \`${String(r.command || '').replace(/\|/g, '\\|')}\` |`);
    });
    lines.push('');
    for (const r of failed) {
      lines.push(`### \`${r.id || '?'}\``);
      lines.push('');
      lines.push('```');
      lines.push(String(r.tail || r.stderr || r.stdout || '(no output captured)').trim() || '(no output captured)');
      lines.push('```');
      lines.push('');
    }
  } else {
    lines.push('All commands passed.');
    lines.push('');
  }
  return lines.join('\n');
}

export function buildCommandMatrix(checkCommand = '', scripts = {}) {
  const commands = expandCompositeCommands(checkCommand, scripts);
  const seenIds = new Map();
  return commands.map((command, index) => {
    const npmScript = command.match(/^npm\s+run\s+([\w:@.-]+)/)?.[1];
    const nodeTarget = command.match(/^node\s+(?:--test\s+)?([^\s]+)/)?.[1];
    const rawId = npmScript
      ? `check-${npmScript.replace(/^check:?/, '')}`
      : nodeTarget
        ? nodeTarget.split(/[\\/]/).pop().replace(/\.(?:c|m)?js$/i, '')
        : `matrix-step-${index + 1}`;
    const baseId = sanitizeArtifactSegment(rawId.replaceAll(':', '-'), `matrix-step-${index + 1}`);
    const occurrence = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, occurrence);
    const id = occurrence === 1 ? baseId : `${baseId}-${occurrence}`;
    const timeoutMs = /(?:^|:)(?:long|browser|electron)(?:$|:)|flight:clean|check:art\b|check:bundle\b|playwright|\b(?:probe|capture|soak|performance)\b/i.test(command)
      ? LONG_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;
    return cmd(id, command, timeoutMs);
  });
}

function expandCompositeCommands(command, scripts, stack = []) {
  return splitCommandChain(command).flatMap((segment) => {
    const npmScript = segment.match(/^npm\s+run\s+([\w:@.-]+)$/)?.[1];
    if (!npmScript || typeof scripts[npmScript] !== 'string' || stack.includes(npmScript)) {
      return [segment];
    }
    const nested = expandCompositeCommands(scripts[npmScript], scripts, [...stack, npmScript]);
    return nested.length > 1 ? nested : [segment];
  });
}

function splitCommandChain(command) {
  return String(command)
    .split(/\s*&&\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// PARTITION — named groups and deterministic shards
// ---------------------------------------------------------------------------
//
// Why this exists
// ---------------
// `check:ci` used to be ONE CI job: ~280 commands, sequential, behind a Playwright Chromium install
// that blocked all of them, under a 35-minute ceiling. Every master run ended cancelled or timed out,
// so a red "check" told a PR author nothing about the PR. The fix is not to run less; it is to run
// the same matrix in four parallel jobs, only one of which needs a browser.
//
// Two orthogonal knobs:
//   * `--group=<name>` — a semantic partition of the matrix. Every command lands in EXACTLY one
//     group; a command in no group is a hard error, because it would otherwise run in no job at all
//     while the gate still went green.
//   * `--shard=<i>/<n>` — a mechanical partition, round-robin by position in the selected list, so
//     `n` runners cover the list exactly once with no overlap. Composable with `--group` (filter to
//     the group first, then shard inside it) for when one group outgrows its own job.
//
// Group meanings, in cost terms rather than taxonomy terms:
//   * `browser` — spawns Playwright/Chromium (or a raw Chrome + CDP). The only group whose job needs
//     `npx playwright install`, and the only one that needs a browser cache.
//   * `sim`     — determinism, the 47-A golden envelope, save/reload continuation, massline. Long,
//     CPU-bound, and the group whose failures mean "a golden moved".
//   * `feel`    — the FEEL_CONTRACT handling surface: flight, brake/governor/RCS, propulsion, camera,
//     draw-to-fly, route following, combat grammar, Crucible. The job also runs
//     `check:feel:scenarios` and `check:fun-bench` as explicit steps — those bars are NOT in the
//     package `check` chain, so they are workflow steps, not matrix members.
//   * `static`  — everything else: pure-Node data refs, schema, source scans, UI/label contracts,
//     asset manifests, control-plane readers. No browser, no golden, fast per command.
export const COMMAND_GROUPS = Object.freeze(['static', 'sim', 'browser', 'feel']);

// Leaf files that transitively launch a real browser. Derived by walking each matrix command down to
// its leaf `node <file>` invocations, following relative imports inside scripts/, test/ and tools/,
// and looking for `load-playwright`, `from 'playwright'`, `chromium.launch`, or a raw Chrome spawn
// with `--remote-debugging-port`. Re-derive that way rather than trusting a name: `check:sg06:live-*`
// and `check:47a:live-branch` read browser-ish and are pure Node, while `probe-authored-assets-live`
// launches Chrome without ever mentioning Playwright.
const BROWSER_LEAF_FILES = new Set([
  'scripts/check-47a-live-cold-open.mjs',
  'scripts/check-bar-mission-readiness-live.mjs',
  'scripts/check-confirm-dialog-safety.mjs',
  'scripts/check-depth-program-k1-ui-runtime.mjs',
  'scripts/check-first-15-runtime.mjs',
  'scripts/check-market-first-loop-runtime.mjs',
  'scripts/check-mission-accept-handoff-runtime.mjs',
  'scripts/check-mission-cargo-loading-runtime.mjs',
  'scripts/check-new-game-layout.mjs',
  'scripts/check-shader-compile.mjs',
  'scripts/check-station-egress-runtime.mjs',
  'scripts/check-station-tab-navigation-runtime.mjs',
  'scripts/check-title-continue-runtime.mjs',
  'scripts/check-trail-streak-instancing-webgl.mjs',
  // Raw Chrome + CDP, no Playwright import anywhere in its tree.
  'scripts/probe-authored-assets-live.mjs',
  'scripts/probe-flight-visual.mjs',
  'scripts/probe-ship-visual-stability.mjs',
  'test/lab-browser-input-grammar.test.mjs',
]);

// Safety net for a command added after the list above was derived. Matched against the RESOLVED leaf
// command, so `npm run check:x` is judged by what it actually executes.
const BROWSER_COMMAND_TEXT = /playwright|chromium|puppeteer|--headed\b|--headless\b|remote-debugging-port|probe-runtime-witness|capture-ui-matrix|check-visual-regression|grammar-matrix:headed/i;

// FEEL_CONTRACT surface — how flying and fighting feel, measured in numbers. The `flight` and
// `camera` fragments are segment-anchored on purpose: unanchored, `flight` swallows
// `check-mission-preflight` and `camera` swallows `check-map-camera`, neither of which is a feel bar.
const FEEL_ID = /(?:^|[-:])(?:feel|fun-bench)(?:[-:]|$)|(?:^|-)flight|(?:^|-)camera-|knock|brake-convergence|governor|rcs-sign|propulsion|draw-to-fly|route-follower|route-engage|speed-lines|attack-spec|combat-grammar|combat-doctrines|crucible|gameplay-core|movement-doctrine|ai-intentionality/i;

// Determinism, goldens, and continuation.
const SIM_ID = /(?:^|[-:])sim(?:[-:]|$)|sectorsim|47a|massline|save|replay|tether-mass|golden|determinis/i;

// Commands whose generated id does not name what they are. `sf` is
// `node scripts/sf.mjs validate test/47a.* …` — the 47-A golden envelope validator.
const SIM_EXTRA_IDS = new Set(['sf']);

// A command shape this runner knows how to reason about. Anything else (a bare `npx …`, a shell
// pipeline, a build step) is deliberately unclassified so it fails closed instead of quietly
// defaulting into `static`.
const RECOGNIZED_COMMAND_SHAPE = /^(?:npm\s+run\s+[\w:@.-]+|node\s+(?:--test\s+)?[\w./\\@-]+\.(?:m|c)?js)(?:\s|$)/;

/** Resolve `npm run X` through package.json until the segments are real commands. */
export function resolveLeafCommands(command, scripts = {}, stack = []) {
  return splitCommandChain(command).flatMap((segment) => {
    const name = segment.match(/^npm\s+run\s+([\w:@.-]+)/)?.[1];
    if (!name || typeof scripts[name] !== 'string' || stack.includes(name)) return [segment];
    return resolveLeafCommands(scripts[name], scripts, [...stack, name]);
  });
}

/**
 * The single group a command belongs to, or `null` when it belongs to none.
 *
 * Order matters and is not arbitrary: browser wins over everything (a 47-A *visual* probe is a
 * browser cost, not a golden cost), then feel, then sim, and `static` is the residual for a command
 * shape this runner recognizes.
 */
export function classifyCommandGroup(def = {}, scripts = {}) {
  const id = String(def.id || '');
  const command = String(def.command || '');
  const leaves = resolveLeafCommands(command, scripts);
  const leafText = leaves.join(' && ');
  const leafFiles = leafText
    .split(/\s+/)
    .filter((token) => /\.(?:m|c)?js$/.test(token))
    .map((token) => token.replace(/\\/g, '/').replace(/^\.\//, ''));

  if (leafFiles.some((file) => BROWSER_LEAF_FILES.has(file))) return 'browser';
  if (BROWSER_COMMAND_TEXT.test(leafText)) return 'browser';
  if (FEEL_ID.test(id)) return 'feel';
  if (SIM_ID.test(id) || SIM_EXTRA_IDS.has(id)) return 'sim';
  if (RECOGNIZED_COMMAND_SHAPE.test(command)) return 'static';
  return null;
}

/** Commands that belong to no group. A non-empty result is a defect, not a warning. */
export function findUnclassifiedCommands(commands = [], scripts = {}) {
  return commands.filter((def) => classifyCommandGroup(def, scripts) === null);
}

/** The commands in one named group, in matrix order. An empty group is legal, not an error. */
export function selectGroup(commands = [], group, scripts = {}) {
  if (!COMMAND_GROUPS.includes(group)) {
    throw new Error(`unknown --group "${group}" (expected one of: ${COMMAND_GROUPS.join(', ')})`);
  }
  return commands.filter((def) => classifyCommandGroup(def, scripts) === group);
}

/** Parse `--shard=<i>/<n>` into `{ index, total }`, 1-based. `null` when the flag is absent. */
export function parseShardArg(value) {
  if (value == null || value === '') return null;
  const match = String(value).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) throw new Error(`invalid --shard "${value}" (expected <index>/<total>, 1-based)`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1) throw new Error(`invalid --shard "${value}": total must be at least 1`);
  if (index < 1 || index > total) {
    throw new Error(`invalid --shard "${value}": index must be between 1 and ${total}`);
  }
  return { index, total };
}

/**
 * Round-robin by position: command at position `k` belongs to shard `(k % total) + 1`. Round-robin
 * rather than contiguous blocks so a run of slow neighbours (the 47-A long compares sit together in
 * the chain) spreads across runners instead of landing on one.
 */
export function selectShard(commands = [], shard) {
  if (!shard) return commands;
  return commands.filter((_, position) => (position % shard.total) + 1 === shard.index);
}

/** Stable, deterministic group table. Same input, same bytes — it is committed evidence, not prose. */
export function formatGroupTable(commands = [], scripts = {}) {
  const byGroup = new Map(COMMAND_GROUPS.map((group) => [group, []]));
  const unclassified = [];
  for (const def of commands) {
    const group = classifyCommandGroup(def, scripts);
    if (group) byGroup.get(group).push(def);
    else unclassified.push(def);
  }

  const lines = [];
  lines.push('# check matrix groups');
  lines.push('');
  lines.push(`- Commands: **${commands.length}**`);
  lines.push('');
  lines.push('| group | commands |');
  lines.push('| --- | ---: |');
  for (const group of COMMAND_GROUPS) lines.push(`| ${group} | ${byGroup.get(group).length} |`);
  lines.push(`| (unclassified) | ${unclassified.length} |`);
  lines.push('');
  for (const group of COMMAND_GROUPS) {
    lines.push(`## ${group}`);
    lines.push('');
    const members = byGroup.get(group);
    if (!members.length) lines.push('_(empty)_');
    for (const def of members) lines.push(`- \`${def.id}\` — \`${def.command}\``);
    lines.push('');
  }
  if (unclassified.length) {
    lines.push('## unclassified — FAIL');
    lines.push('');
    lines.push('These commands belong to no group, so no parallel CI job would run them.');
    lines.push('');
    for (const def of unclassified) lines.push(`- \`${def.id}\` — \`${def.command}\``);
    lines.push('');
  }
  return lines.join('\n');
}

/** Read `--flag=value` or `--flag value` from argv. */
function readFlagValue(flag, argv = process.argv) {
  const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = argv.indexOf(flag);
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--')) return argv[index + 1];
  return null;
}

export function buildArtifactPath(startedAt, commandId) {
  return `${buildArtifactRoot(startedAt)}/${sanitizeArtifactSegment(commandId, 'command')}.log`;
}

export function createCommandResult({
  def,
  code = 1,
  signal = null,
  timedOut = false,
  durationMs = 0,
  stdout = '',
  stderr = '',
  structured = null,
  attempts = null,
  artifactPath = null,
} = {}) {
  const parsedStructured = structured || extractStructuredResult(`${stdout}\n${stderr}`);
  const normalizedDurationMs = Number.isFinite(durationMs)
    ? Math.max(0, Math.round(durationMs))
    : 0;
  const classification = classifyCommandResult({
    id: def?.id,
    command: def?.command,
    code,
    signal,
    timedOut,
    stdout,
    stderr,
    structured: parsedStructured,
    attempts: attempts || parsedStructured?.attempts || null,
  });
  const ok = classification.category === 'passed';

  return {
    id: def?.id || 'unknown',
    command: def?.command || '',
    ok,
    code,
    signal,
    timedOut,
    durationMs: normalizedDurationMs,
    reason: summarizeReason({ code, signal, timedOut, stdout, stderr, structured: parsedStructured }),
    classification,
    artifactPath,
    structured: summarizeStructured(parsedStructured),
    stdoutTail: trimTail(stdout),
    stderrTail: trimTail(stderr),
  };
}

export function buildCiReport({
  startedAt,
  finishedAt,
  failFast = false,
  artifactRoot = null,
  matrixSource = 'unspecified',
  group = null,
  shard = null,
  matrixCommandCount = null,
  results = [],
} = {}) {
  const failed = results.filter((result) => !result.ok);
  const classificationCounts = {};
  for (const result of results) {
    const category = result.classification?.category || 'unclassified';
    classificationCounts[category] = (classificationCounts[category] || 0) + 1;
  }

  return {
    schema: 'spaceface.ciReport.v2',
    ok: failed.length === 0,
    startedAt,
    finishedAt,
    failFast,
    executionMode: failFast ? 'fail_fast' : 'complete_matrix',
    matrixSource,
    // Which slice of the matrix this run actually executed. `null`/`null` is the whole matrix; a
    // parallel CI job records the group it owns and, when the group is sharded, which shard it was.
    group: group || null,
    shard: shard ? { index: shard.index, total: shard.total } : null,
    matrixCommandCount: Number.isFinite(matrixCommandCount) ? matrixCommandCount : null,
    artifactRoot,
    commandCount: results.length,
    failingCount: failed.length,
    classificationCounts,
    failing: failed.map(({
      id,
      command,
      code,
      signal,
      timedOut,
      durationMs,
      reason,
      artifactPath,
      classification,
    }) => ({
      id,
      command,
      code,
      signal,
      timedOut,
      durationMs,
      reason,
      artifactPath,
      classification,
    })),
    results,
  };
}

export function classifyCommandResult(input = {}) {
  const {
    id = '',
    command = '',
    code = 1,
    signal = null,
    timedOut = false,
    stdout = '',
    stderr = '',
    structured = null,
    attempts = null,
  } = input;
  const flake = classifyFlakeEvidence(attempts);
  const base = classifyBaseFailure({
    id,
    command,
    code,
    signal,
    timedOut,
    stdout,
    stderr,
    structured,
  });

  if (flake.status === 'observed') {
    return {
      category: 'flake',
      underlyingCategory: base.category,
      confidence: 'high',
      evidence: `${flake.failedAttempts} failed and ${flake.passedAttempts} passed attempts`,
      flake,
    };
  }

  return { ...base, flake };
}

function classifyBaseFailure({ id, command, code, signal, timedOut, stdout, stderr, structured }) {
  const text = `${stderr || ''}\n${stdout || ''}`.replace(/\r/g, '').trim();
  const context = `${id || ''} ${command || ''} ${text}`;

  if (timedOut) {
    return diagnostic('timeout', 'high', 'runner timeout elapsed before command completion');
  }
  if (signal) {
    return diagnostic('child_signal', 'high', `child exited by signal ${signal}`, { signal });
  }
  // Deliberately AHEAD of the code === 0 check below, and pinned by
  // test/check-ci-report.test.mjs:40 ("treats a code-zero compare with expected-envelope diffs as
  // non-passing verification debt"). `sf-sim compare` exits 0 when the two runs agree with EACH OTHER
  // — determinism holds — even when both disagree with the expected envelope. That is real
  // verification debt and the exit code cannot see it, so this classifier is intentionally stricter
  // than the process status. Do not "fix" this by letting a zero exit short-circuit it.
  if (isStaleGolden(structured, text)) {
    return diagnostic(
      'stale_golden',
      'high',
      // Prefer a diff the envelope comparison actually reported. The generic pattern also matches the
      // bare word "baseline", which appears in compare's ordinary success output, so quoting the first
      // match could surface `"baseline": {` as the whole explanation and read like a false positive.
      matchingEvidence(text, /expectedTraceCount|expectedMetric|drifted|stale|re-?record/i)
      || 'candidate runs agree with each other, but the expected envelope contains differences',
    );
  }
  if (code === 0) {
    return diagnostic('passed', 'high', 'command exited with code 0');
  }
  if (/(?:stale|out[- ]of[- ]date)\s+(?:source\s+)?pin\b|\bsource pin\b.*(?:stale|mismatch|does not match)|\b(?:commit|source) pin\b.*(?:stale|mismatch|does not match)/i.test(text)) {
    return diagnostic('stale_source_pin', 'high', matchingEvidence(text, /source pin|commit pin|stale/i));
  }
  if (/(?:ECONNRESET|ERR_CONNECTION_RESET|connection (?:was )?reset)/i.test(text) && /electron/i.test(context)) {
    return diagnostic('electron_connection_reset', 'high', matchingEvidence(text, /ECONNRESET|ERR_CONNECTION_RESET|connection (?:was )?reset/i));
  }
  if (/browserType\.launch|failed to launch (?:the )?browser|browser launch (?:failed|failure)|executable (?:does not|doesn't) exist.*(?:chromium|chrome|firefox|webkit)|could not find (?:chromium|chrome)/i.test(text)) {
    return diagnostic('browser_launch_failure', 'high', matchingEvidence(text, /browserType\.launch|failed to launch|browser launch|executable|could not find/i));
  }
  if (/TimeoutError|Timeout \d+ms exceeded|timed out|timeout exceeded/i.test(text)) {
    return diagnostic('timeout', 'medium', matchingEvidence(text, /TimeoutError|Timeout \d+ms exceeded|timed out|timeout exceeded/i));
  }
  if (/\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b|terminated by signal/i.test(text)) {
    const textSignal = text.match(/\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b/i)?.[0]?.toUpperCase() || null;
    return diagnostic('child_signal', 'medium', matchingEvidence(text, /\bSIG(?:TERM|KILL|INT|ABRT|SEGV)\b|terminated by signal/i), { signal: textSignal });
  }
  if (/performance regression|(?:frame|render|gpu|cpu|raf|callback|latency|duration|p\d{2})[^\n]*(?:exceeds?|above|over)[^\n]*(?:budget|threshold)|(?:fps|frames per second)[^\n]*(?:below|under)[^\n]*(?:budget|threshold)/i.test(text)) {
    return diagnostic('performance_regression', 'high', matchingEvidence(text, /performance regression|budget|threshold/i));
  }
  if (/missing (?:required )?evidence|required evidence (?:is )?(?:missing|not found)|evidence (?:file|artifact)[^\n]*(?:missing|not found)|(?:ENOENT|not found)[^\n]*(?:evidence|artifact)/i.test(text)) {
    return diagnostic('missing_evidence', 'high', matchingEvidence(text, /missing|required evidence|not found|ENOENT/i));
  }
  if (/orphan(?:ed)? (?:child )?process|(?:residual|leaked) (?:browser|electron|child|process)|process leak detected|left [^\n]* process running/i.test(text)) {
    return diagnostic('orphan_process', 'high', matchingEvidence(text, /orphan|residual|leaked|process leak|process running/i));
  }
  if (/AssertionError|ERR_ASSERTION/i.test(text)) {
    return diagnostic('assertion_failure', 'high', matchingEvidence(text, /AssertionError|ERR_ASSERTION/i));
  }

  return diagnostic(
    'generic_nonzero',
    'low',
    trimEvidence(firstNonEmptyLine(text) || `exited with code ${code}`),
  );
}

function classifyFlakeEvidence(attempts) {
  const validAttempts = Array.isArray(attempts)
    ? attempts.filter((attempt) => attempt && typeof attempt.ok === 'boolean')
    : [];
  if (validAttempts.length < 2) {
    return {
      status: 'unknown',
      attemptsObserved: validAttempts.length || 1,
      passedAttempts: validAttempts.filter((attempt) => attempt.ok).length,
      failedAttempts: validAttempts.filter((attempt) => !attempt.ok).length,
    };
  }

  const passedAttempts = validAttempts.filter((attempt) => attempt.ok).length;
  const failedAttempts = validAttempts.length - passedAttempts;
  return {
    status: passedAttempts > 0 && failedAttempts > 0 ? 'observed' : 'not_observed',
    attemptsObserved: validAttempts.length,
    passedAttempts,
    failedAttempts,
  };
}

function isStaleGolden(structured, text) {
  if (structured?.schema === 'spaceface.sfSimCompareResult.v1') {
    const comparison = structured.comparison;
    if (
      comparison?.hashEqual === true
      && comparison.firstDivergentTick == null
      && Array.isArray(comparison.diffs)
      && comparison.diffs.length > 0
    ) {
      return true;
    }
  }
  return /(?:stale|out[- ]of[- ]date)\s+(?:golden|baseline|snapshot|expected (?:fixture|envelope|telemetry))|(?:golden|baseline|snapshot)\s+(?:is\s+)?(?:stale|out[- ]of[- ]date)|re-?record[^\n]*(?:golden|baseline|snapshot|expected)/i.test(text);
}

function diagnostic(category, confidence, evidence, extra = {}) {
  return {
    category,
    confidence,
    evidence: trimEvidence(evidence),
    ...extra,
  };
}

function matchingEvidence(text, pattern) {
  const line = String(text || '')
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => pattern.test(candidate));
  return trimEvidence(line || '');
}

function trimEvidence(value) {
  const text = String(value || '').trim();
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

function buildArtifactRoot(startedAt) {
  return `scratch/check-ci-report/${sanitizeArtifactSegment(startedAt, 'unknown-run')}`;
}

function sanitizeArtifactSegment(value, fallback) {
  const sanitized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function cmd(id, command, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return { id, command, timeoutMs };
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try { process.kill(pid, 'SIGKILL'); } catch (_) {}
}

function run(def, { artifactPath }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(def.command, {
      shell: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child.pid);
    }, def.timeoutMs);

    const finishOnce = async (code, signal, finalStderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = createCommandResult({
        def,
        code,
        signal,
        timedOut,
        durationMs: Date.now() - started,
        stdout,
        stderr: finalStderr,
        artifactPath,
      });
      try {
        await writeDiagnosticArtifact(artifactPath, result, stdout, finalStderr);
        result.artifactAvailable = true;
      } catch (error) {
        result.artifactAvailable = false;
        result.artifactError = error instanceof Error ? error.message : String(error);
      }
      resolve(result);
    };

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      void finishOnce(-1, null, `${stderr}\n${error.message}`);
    });
    child.on('close', (code, signal) => {
      void finishOnce(code, signal, stderr);
    });
  });
}

async function writeDiagnosticArtifact(artifactPath, result, stdout, stderr) {
  const absolutePath = resolve(artifactPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const contents = [
    JSON.stringify({
      schema: 'spaceface.ciCommandDiagnostic.v1',
      id: result.id,
      command: result.command,
      ok: result.ok,
      code: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      reason: result.reason,
      classification: result.classification,
      artifactPath: result.artifactPath,
      structured: result.structured,
    }, null, 2),
    '\n--- stdout ---\n',
    stdout || '(empty)',
    '\n--- stderr ---\n',
    stderr || '(empty)',
    '\n',
  ].join('');
  await writeFile(absolutePath, contents, 'utf8');
}

function summarizeReason({ code, signal, timedOut, stdout, stderr, structured }) {
  if (timedOut) return 'timed out';
  const text = `${stderr || ''}\n${stdout || ''}`.replace(/\r/g, '').trim();
  if (isStaleGolden(structured, text)) {
    const comparison = structured.comparison || {};
    const diffs = Array.isArray(comparison.diffs)
      ? comparison.diffs.map((diff) => `${diff.path || diff.kind}: expected ${diff.expected}, actual ${diff.actual}`).join('; ')
      : 'no diff detail';
    return `sf-sim compare found a stale expected envelope; hashEqual=${comparison.hashEqual === true}; ${diffs}`;
  }
  if (code === 0) return 'passed';
  if (structured && structured.schema === 'spaceface.sfSimCompareResult.v1') {
    const comparison = structured.comparison || {};
    const diffs = Array.isArray(comparison.diffs)
      ? comparison.diffs.map((diff) => `${diff.path || diff.kind}: expected ${diff.expected}, actual ${diff.actual}`).join('; ')
      : 'no diff detail';
    return `sf-sim compare failed; hashEqual=${comparison.hashEqual === true}; ${diffs}`;
  }
  const primaryText = String(stderr || stdout || '').replace(/\r/g, '').trim();
  if (/EADDRINUSE/.test(primaryText)) return 'port already in use';
  if (/TimeoutError|Timeout \d+ms exceeded|Timed out/i.test(primaryText)) return firstMatchingLine(primaryText, /TimeoutError|Timeout \d+ms exceeded|Timed out/i);
  if (/AssertionError/i.test(primaryText)) return firstMatchingLine(primaryText, /AssertionError/i);
  if (signal) return `exited by signal ${signal}`;
  return firstNonEmptyLine(primaryText) || `exited with code ${code}`;
}

function summarizeStructured(structured) {
  if (!structured || typeof structured !== 'object') return null;
  if (structured.schema === 'spaceface.sfSimCompareResult.v1') {
    return {
      schema: structured.schema,
      ok: structured.ok === true,
      deterministic: structured.deterministic === true,
      scenario: structured.scenario,
      seed: structured.seed,
      ticks: structured.ticks,
      flightSystem: structured.flightSystem,
      expectedTelemetry: structured.expectedTelemetry,
      baselineHash: structured.baseline && structured.baseline.sha256,
      candidateHash: structured.candidate && structured.candidate.sha256,
      comparison: structured.comparison ? {
        ok: structured.comparison.ok === true,
        mode: structured.comparison.mode,
        reloadAt: structured.comparison.reloadAt,
        hashEqual: structured.comparison.hashEqual === true,
        firstDivergentTick: structured.comparison.firstDivergentTick,
        diffs: structured.comparison.diffs || [],
      } : null,
    };
  }
  return structured;
}

function extractStructuredResult(text) {
  const parsed = extractLastJsonObject(text);
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.schema === 'string') return parsed;
  return null;
}

function extractLastJsonObject(text) {
  const source = String(text || '');
  for (let start = source.lastIndexOf('\n{'); start >= 0; start = source.lastIndexOf('\n{', start - 1)) {
    const objectText = balancedObject(source.slice(start + 1));
    if (!objectText) continue;
    try { return JSON.parse(objectText); } catch (_) {}
  }
  if (source.trimStart().startsWith('{')) {
    const objectText = balancedObject(source.trimStart());
    if (objectText) {
      try { return JSON.parse(objectText); } catch (_) {}
    }
  }
  return null;
}

function balancedObject(text) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return null;
}

function trimTail(text) {
  const value = String(text || '');
  return value.length > TAIL_LIMIT ? value.slice(value.length - TAIL_LIMIT) : value;
}

function firstMatchingLine(text, pattern) {
  return String(text || '').split('\n').map((line) => line.trim()).find((line) => pattern.test(line)) || 'failed';
}

function firstNonEmptyLine(text) {
  return String(text || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
}

// CLI entry. Must stay last: see the note beside `runCli`.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
