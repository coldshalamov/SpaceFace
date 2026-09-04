#!/usr/bin/env node
// scripts/measure-fun-loop.mjs — The Fun Convergence Loop Measurer (PQ-173.01).
//
// Runs the Fun Convergence bench (or reads two existing measure summaries) and prints/writes:
//   1. Per bench+seed receipt under the fun-loop receipts dir: ONE pooled "Bars (FEEL_CONTRACT §B)"
//      table evaluated once over the whole measurement set (with a fed-by column), then per-run
//      sections listing only the bars that run feeds, plus that run's fun metrics and gaps.
//   2. A rollup summary (<date>-measure-summary.json/.md) across all benches.
//   3. --diff mode: before/after comparison of two measure summaries on the same seeds, with a
//      KEEP/REVERT verdict per the law §3.6. Diff reads files only — it never re-runs the bench.
//
// Exit 0 on successful measurement (bar regressions are data, not infra failures); exit 1 only
// on infra errors (missing libs, unreadable diff inputs, bad flags).
//
// Law: design/program/FUN_CONVERGENCE_LOOP.md §3.2 MEASURE, §3.6 COMPARE, §3.7 REPORT.
// Bars: design/FEEL_CONTRACT.md §B.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { deriveFunMetrics, FUN_THRESHOLDS, KNOCK_BUDGET_LIMITS } from './lib/bench/funMetrics.mjs';
import {
  runCrucibleBench,
  CRUCIBLE_ARENAS,
  CRUCIBLE_LOADOUTS,
  CRUCIBLE_DEFAULT_SEEDS,
} from './lib/bench/crucibleBench.mjs';
import { runFlightBench } from './lib/bench/flightBench.mjs';
import { runVerbBench } from './lib/bench/verbBench.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_RECEIPTS_DIR = join(ROOT, 'design/program/roadmap/receipts/fun-loop');

/**
 * Deterministic sorted list of every scenario module and every direct bench/measurer helper
 * that can change a measurement. Receipt output files are never included.
 */
export function listFunLoopHarnessFiles(root = ROOT) {
  const rels = ['scripts/measure-fun-loop.mjs'];
  const benchDir = join(root, 'scripts/lib/bench');
  for (const name of readdirSync(benchDir).sort((a, b) => a.localeCompare(b))) {
    if (name.endsWith('.mjs')) rels.push(`scripts/lib/bench/${name}`);
  }
  try {
    const scenarioDir = join(benchDir, 'scenarios');
    for (const name of readdirSync(scenarioDir).sort((a, b) => a.localeCompare(b))) {
      if (name.endsWith('.mjs')) rels.push(`scripts/lib/bench/scenarios/${name}`);
    }
  } catch {
    // scenarios/ may be absent in a truncated fixture root
  }
  return [...new Set(rels)].sort((a, b) => a.localeCompare(b));
}

/** Snapshot at import time for callers that want a frozen list; digest uses listFunLoopHarnessFiles(). */
export const FUN_LOOP_HARNESS_FILES = Object.freeze(listFunLoopHarnessFiles());

export function computeFunLoopHarnessDigest(root = ROOT) {
  const hash = createHash('sha256');
  for (const rel of listFunLoopHarnessFiles(root)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(join(root, rel)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function gitText(root, args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!result || result.status !== 0) return '';
  return String(result.stdout || '');
}

/**
 * Production-runtime identity. Two sweeps are not comparable across different gameplay source,
 * even when the harness files themselves match. Receipt dirt does not enter this identity.
 */
export function computeProductionSourceIdentity(root = ROOT) {
  const gitHead = gitText(root, ['rev-parse', 'HEAD']).trim();
  const gitTree = gitText(root, ['log', '-1', '--format=%T']).trim() || gitHead;
  const porcelain = gitText(root, ['status', '--porcelain', '--untracked-files=normal', '--', 'src']);
  const diff = gitText(root, ['diff', 'HEAD', '--', 'src']);
  const untrackedText = gitText(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', 'src']);
  const untrackedPaths = String(untrackedText || '')
    .split('\0')
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const productionDirty = porcelain.trim().length > 0 || untrackedPaths.length > 0;
  const productionDiffHash = createHash('sha256');
  productionDiffHash.update(diff);
  productionDiffHash.update('\0');
  for (const rel of untrackedPaths) {
    productionDiffHash.update(rel);
    productionDiffHash.update('\0');
    try {
      const st = lstatSync(join(root, rel));
      if (st.isSymbolicLink() || !st.isFile()) {
        productionDiffHash.update('UNREADABLE');
      } else {
        productionDiffHash.update(readFileSync(join(root, rel)));
      }
    } catch {
      productionDiffHash.update('UNREADABLE');
    }
    productionDiffHash.update('\0');
  }
  return {
    gitHead: gitHead || null,
    gitTree: gitTree || null,
    productionDirty,
    productionDiffHash: productionDiffHash.digest('hex'),
  };
}

function sourceIdentityKey(identity) {
  if (!identity || typeof identity !== 'object') return null;
  if (typeof identity.gitHead !== 'string' || !identity.gitHead) return null;
  if (typeof identity.gitTree !== 'string' || !identity.gitTree) return null;
  if (typeof identity.productionDiffHash !== 'string' || !identity.productionDiffHash) return null;
  return `${identity.gitHead}\0${identity.gitTree}\0${identity.productionDirty ? '1' : '0'}\0${identity.productionDiffHash}`;
}

function sweepCellKey(run) {
  if (!run) return '';
  if (run.fedByRef) return run.fedByRef;
  if (run.bench === 'crucible') return `crucible/${run.arenaId}/${run.loadoutId}/s${run.seed}`;
  return `${run.bench}/${run.scenarioId}/s${run.seed}`;
}

function sweepCells(summary) {
  const cells = [];
  const benches = summary && summary.benches && typeof summary.benches === 'object' ? summary.benches : {};
  for (const [benchName, bench] of Object.entries(benches)) {
    const runs = bench && Array.isArray(bench.runs) ? bench.runs : [];
    for (const run of runs) {
      cells.push({
        key: sweepCellKey({ ...run, bench: run.bench || benchName }),
        runHash: typeof run.runHash === 'string' && run.runHash ? run.runHash : null,
      });
    }
  }
  cells.sort((a, b) => a.key.localeCompare(b.key));
  return cells;
}

function rejectSweep(reason, cells = []) {
  return { compatible: false, identical: false, reason, cells };
}

function indexUniqueCells(cells, side) {
  if (!Array.isArray(cells) || cells.length === 0) {
    return { error: `empty ${side} sweep — refuse to claim a match` };
  }
  const byKey = new Map();
  for (const cell of cells) {
    if (!cell || typeof cell.key !== 'string' || !cell.key) {
      return { error: `empty cell key in ${side} sweep` };
    }
    if (byKey.has(cell.key)) {
      return { error: `duplicate cell key "${cell.key}" in ${side} sweep` };
    }
    if (typeof cell.runHash !== 'string' || !cell.runHash) {
      return { error: `missing runHash for ${cell.key} in ${side} sweep` };
    }
    byKey.set(cell.key, cell);
  }
  return { byKey };
}

/**
 * Two sweep summaries match only when they share a harness digest, the same production
 * source identity, nonempty unique cell keys, and a one-to-one runHash match.
 * Empty sweeps, duplicate keys, missing hashes, and different key sets are incompatible.
 */
export function compareCompatibleSweeps(before, after) {
  const digestA = before && typeof before.harnessDigest === 'string' ? before.harnessDigest : null;
  const digestB = after && typeof after.harnessDigest === 'string' ? after.harnessDigest : null;
  if (!digestA || !digestB) {
    return rejectSweep('missing harnessDigest — refuse to claim two sweeps match');
  }
  if (digestA !== digestB) {
    return rejectSweep('harnessDigest mismatch — sweeps were not produced by the same source/harness');
  }
  const sourceA = sourceIdentityKey(before && before.sourceIdentity);
  const sourceB = sourceIdentityKey(after && after.sourceIdentity);
  if (!sourceA || !sourceB) {
    return rejectSweep('missing production source identity — refuse to claim two sweeps match');
  }
  if (sourceA !== sourceB) {
    return rejectSweep('production source identity mismatch — sweeps are not the same gameplay source');
  }
  const cellsA = sweepCells(before);
  const cellsB = sweepCells(after);
  const indexedA = indexUniqueCells(cellsA, 'before');
  if (indexedA.error) return rejectSweep(indexedA.error);
  const indexedB = indexUniqueCells(cellsB, 'after');
  if (indexedB.error) return rejectSweep(indexedB.error);
  const keysA = [...indexedA.byKey.keys()].sort((a, b) => a.localeCompare(b));
  const keysB = [...indexedB.byKey.keys()].sort((a, b) => a.localeCompare(b));
  if (keysA.length !== keysB.length || keysA.some((key, i) => key !== keysB[i])) {
    return rejectSweep('cell key sets differ — refuse one-to-one comparison');
  }
  const cells = [];
  let identical = true;
  for (const key of keysA) {
    const cell = indexedA.byKey.get(key);
    const other = indexedB.byKey.get(key);
    const hashOk = cell.runHash === other.runHash;
    if (!hashOk) identical = false;
    cells.push({
      key,
      match: hashOk,
      reason: hashOk ? null : 'runHash mismatch',
      hashA: cell.runHash,
      hashB: other.runHash,
    });
  }
  return {
    compatible: true,
    identical,
    reason: identical ? null : 'corresponding cell hashes do not all match',
    cells,
  };
}

const FLIGHT_DEFAULT_SEED = 13502;
const VERB_DEFAULT_SEED = 4242;
const CRUCIBLE_WAVE_COUNT = 3;

function printHelp() {
  console.log(`SpaceFace Fun Convergence Loop Measurer (PQ-173.01)
Usage: node scripts/measure-fun-loop.mjs [options]

Runs the bench, evaluates every FEEL_CONTRACT §B bar the bench can reach plus the per-run fun
metrics (law §3.2), and writes one JSON + one Markdown table per bench+seed under
design/program/roadmap/receipts/fun-loop/.

Options:
  --crucible            Measure only the Crucible feel bench
  --flight              Measure only the Flight bench
  --verbs               Measure only the Verb benches
  --seeds=4242,8008     Fixed seeds (default: bench defaults — crucible 4242,8008,13502; flight 13502; verbs 4242)
  --scenarios=a,b       Run only these verb scenario ids (comma-separated). The bench discovers
                        drop-in modules under scripts/lib/bench/scenarios/, several of which boot
                        the real runtime and take minutes, so a lane iterating on ONE bar should
                        name it rather than pay for the whole sweep. Unknown-only selections fail
                        nonzero. A mixed known+unknown request runs the known subset and keeps
                        unknown ids explicit in the rollup.
  --quick               Seconds-scale smoke: 1 crucible arena x 1 loadout x 1 seed, verbs full, flight 1 seed
  --json                Print the rollup JSON to stdout (files are still written)
  --out <dir>           Write receipts to <dir> instead of the default receipts folder
  --diff <before.json> <after.json>
                        Compare two measure summaries run-for-run (same seeds); emits
                        <date>-measure-diff.md/.json with a KEEP/REVERT verdict (law §3.6).
                        Reads files only — never re-runs the bench.
  --help, -h            Show this help text
`);
}

// ── argument parsing ─────────────────────────────────────────────────────────────

function parseArgs(list) {
  const args = { bench: null, seeds: null, quick: false, json: false, out: null, diff: null, scenarioIds: null };
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a === '--crucible' || a === '--flight' || a === '--verbs') {
      args.bench = a.slice(2);
    } else if (a.startsWith('--seeds=')) {
      args.seeds = parseSeedList(a.slice('--seeds='.length));
    } else if (a === '--seeds') {
      args.seeds = parseSeedList(list[++i]);
    } else if (a.startsWith('--scenarios=')) {
      args.scenarioIds = parseIdList(a.slice('--scenarios='.length));
    } else if (a === '--scenarios') {
      args.scenarioIds = parseIdList(list[++i]);
    } else if (a === '--quick') {
      args.quick = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--out') {
      args.out = list[++i];
      if (!args.out) fail('--out requires a directory argument');
    } else if (a === '--diff') {
      const before = list[++i];
      const after = list[++i];
      if (!before || !after) fail('--diff requires two summary JSON paths: --diff <before.json> <after.json>');
      args.diff = [before, after];
    } else {
      fail(`unknown argument: ${a} (see --help)`);
    }
  }
  if (args.seeds === null) return args;
  if (args.seeds.length === 0) fail('--seeds needs at least one seed, e.g. --seeds=4242');
  return args;
}

// Scenario ids are free-form strings (`feel.knock_budget`, `world.reaction_trio`); trim and drop
// blanks so `--scenarios=a, b,` behaves like `--scenarios=a,b`.
function parseIdList(text) {
  return String(text || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseSeedList(raw) {
  if (typeof raw !== 'string') fail('--seeds needs a comma-separated list, e.g. --seeds=4242,8008');
  const seeds = raw.split(',').map((s) => Number(s.trim())).filter((s) => Number.isInteger(s) && s > 0);
  if (seeds.length === 0) fail(`could not parse seeds from "${raw}"`);
  return seeds;
}

function fail(message) {
  console.error(`Fun measurer error: ${message}`);
  process.exit(1);
}

// ── main ─────────────────────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    return;
  }
  const args = parseArgs(rawArgs);
  const outDir = args.out ? args.out : DEFAULT_RECEIPTS_DIR;
  const isoDate = new Date().toISOString().slice(0, 10);

  if (args.diff) {
    runDiffMode(args, outDir, isoDate);
    return;
  }
  await runMeasureMode(args, outDir, isoDate);
}

// ── measure mode ─────────────────────────────────────────────────────────────────

async function runMeasureMode(args, outDir, isoDate) {
  const { evaluateBars, fedByOf } = await loadFeelBarsModule();
  const startedAt = Date.now();

  if (!args.json) {
    console.log('======================================================================');
    console.log('SpaceFace Fun Convergence Loop Measurer (PQ-173.01)');
    console.log(`Receipts directory: ${outDir}`);
    console.log('======================================================================\n');
  }

  const benchRuns = [];
  if (!args.bench || args.bench === 'crucible') {
    const arenas = args.quick ? [CRUCIBLE_ARENAS[0].id] : CRUCIBLE_ARENAS.map((a) => a.id);
    const loadouts = args.quick ? [CRUCIBLE_LOADOUTS[0].id] : CRUCIBLE_LOADOUTS.map((l) => l.id);
    const seeds = pickSeeds(args, CRUCIBLE_DEFAULT_SEEDS);
    if (!args.json) console.log(`► Crucible Feel Bench (${arenas.length} arena x ${loadouts.length} loadout x ${seeds.length} seed x ${CRUCIBLE_WAVE_COUNT} waves)...`);
    const result = await runCrucibleBench({ arenas, loadouts, seeds, waveCount: CRUCIBLE_WAVE_COUNT });
    benchRuns.push({ name: 'crucible', runs: result.runs });
  }
  if (!args.bench || args.bench === 'flight') {
    const seeds = pickSeeds(args, [FLIGHT_DEFAULT_SEED]);
    if (!args.json) console.log(`► Flight Bench (${seeds.length} seed)...`);
    const result = await runFlightBench({ seeds });
    benchRuns.push({ name: 'flight', runs: result.runs });
  }
  if (!args.bench || args.bench === 'verbs') {
    const seeds = pickSeeds(args, [VERB_DEFAULT_SEED]);
    const only = args.scenarioIds;
    const label = only
      ? `${only.length} named scenario${only.length === 1 ? '' : 's'}`
      : 'discovered scenarios';
    if (!args.json) console.log(`► Verb Benches (${label} x ${seeds.length} seed)...`);
    const result = only ? await runVerbBench({ seeds, scenarioIds: only }) : await runVerbBench({ seeds });
    let unknownScenarioIds = [];
    if (only) {
      const ran = new Set(result.runs.map((r) => r.scenarioId));
      unknownScenarioIds = only.filter((id) => !ran.has(id));
      if (result.runs.length === 0) {
        fail(`explicit --scenarios matched nothing: ${only.join(', ')}`);
      }
      if (!args.json && unknownScenarioIds.length) {
        console.log(`  (no such scenario: ${unknownScenarioIds.join(', ')})`);
      }
    }
    benchRuns.push({ name: 'verbs', runs: result.runs, unknownScenarioIds });
  }

  // The §B bars are a property of the whole measurement set, never of one run: evaluate them ONCE
  // per bench+seed group (receipt grouping) and once across all benches for the rollup. Per-run
  // sections list only the rows the run feeds (fedBy), so no receipt ever repeats a
  // "not measured here" row for a bar another section of the same receipt already answers.
  const allRuns = benchRuns.flatMap((b) => b.runs);
  const pooledByGroup = new Map();
  for (const { name, runs } of benchRuns) {
    const bySeed = new Map();
    for (const run of runs) {
      if (!bySeed.has(run.seed)) bySeed.set(run.seed, []);
      bySeed.get(run.seed).push(run);
    }
    for (const [seed, groupRuns] of bySeed) {
      pooledByGroup.set(`${name}-${seed}`, evaluateBars(groupRuns));
    }
  }

  const benches = {};
  const unknownScenarioIds = [];
  for (const { name, runs, unknownScenarioIds: missing } of benchRuns) {
    benches[name] = {
      runs: runs.map((run) => buildRunBlock(run, (pooledByGroup.get(`${name}-${run.seed}`) || { bars: [] }).bars, fedByOf)),
    };
    if (Array.isArray(missing) && missing.length) unknownScenarioIds.push(...missing);
  }

  const rollup = {
    schema: 'spaceface.funMeasure.v1',
    timestamp: new Date().toISOString(),
    date: isoDate,
    quick: args.quick === true,
    harnessDigest: computeFunLoopHarnessDigest(),
    sourceIdentity: computeProductionSourceIdentity(),
    seeds: [...new Set(allRuns.map((r) => r.seed))].sort((a, b) => a - b),
    benches,
    summary: evaluateBars(allRuns).summary,
    wallMs: Date.now() - startedAt,
  };
  if (unknownScenarioIds.length) rollup.unknownScenarioIds = unknownScenarioIds;

  // ── write receipts ───────────────────────────────────────────────────────────
  mkdirSync(outDir, { recursive: true });
  const written = [];
  const groups = groupByBenchSeed(rollup, pooledByGroup);
  for (const [key, group] of groups) {
    const base = join(outDir, `${isoDate}-${key}`);
    writeFileSync(`${base}.json`, JSON.stringify(group.json, null, 2), 'utf8');
    writeFileSync(`${base}.md`, group.markdown, 'utf8');
    written.push(`${base}.json`, `${base}.md`);
  }
  const summaryBase = join(outDir, `${isoDate}-measure-summary`);
  writeFileSync(`${summaryBase}.json`, JSON.stringify(rollup, null, 2), 'utf8');
  const summaryMd = renderMeasureSummaryMarkdown(rollup);
  writeFileSync(`${summaryBase}.md`, summaryMd, 'utf8');
  written.push(`${summaryBase}.json`, `${summaryBase}.md`);

  if (args.json) {
    console.log(JSON.stringify(rollup, null, 2));
  } else {
    console.log(`\n${summaryMd}`);
    console.log('\nReceipts written:');
    for (const path of written) console.log(`  ${path}`);
  }
}

// Seeds for one bench: --seeds wins; --quick keeps only the first; otherwise the bench default.
function pickSeeds(args, defaults) {
  const base = args.seeds ? args.seeds : defaults;
  return args.quick ? [base[0]] : base;
}

function buildRunRef(run) {
  if (run.bench === 'crucible') return `crucible ${run.arenaId}/${run.loadoutId} seed ${run.seed}`;
  return `${run.bench} ${run.scenarioId} seed ${run.seed}`;
}

// Fixture fallback only: production runs get their ref from the registry's own fedByOf
// (baked in at buildRunBlock time as fedByRef), so the two can never drift apart.
function fedByRefOf(run) {
  if (!run) return '';
  if (run.bench === 'crucible') return `crucible/${run.arenaId}/${run.loadoutId}/s${run.seed}`;
  return `${run.bench}/${run.scenarioId}/s${run.seed}`;
}

function fedBarsForRun(runBlock, pooledBars) {
  const ref = runBlock.fedByRef || fedByRefOf(runBlock);
  return (pooledBars || []).filter((bar) => Array.isArray(bar.fedBy) && bar.fedBy.includes(ref));
}

// One per-run block for the summaries/receipts: the run's identity, only the pooled §B rows this
// run feeds (never a re-evaluation per run), and its own fun metrics. fedByOfImpl is the bars
// registry's own fedByOf — the single source of the run refs the pooled fed-by column names.
export function buildRunBlock(run, pooledBars, fedByOfImpl = fedByRefOf) {
  const block = {
    runRef: buildRunRef(run),
    bench: run.bench,
    scenarioId: run.scenarioId,
    arenaId: run.arenaId,
    loadoutId: run.loadoutId,
    seed: run.seed,
    runHash: run.runHash,
    fedByRef: fedByOfImpl(run),
    funMetrics: deriveFunMetrics(run),
  };
  block.bars = fedBarsForRun(block, pooledBars);
  return block;
}

function groupByBenchSeed(rollup, pooledByGroup) {
  const groups = new Map();
  for (const [benchName, bench] of Object.entries(rollup.benches)) {
    const bySeed = new Map();
    for (const runBlock of bench.runs) {
      const seed = runBlock.seed;
      if (!bySeed.has(seed)) bySeed.set(seed, []);
      bySeed.get(seed).push(runBlock);
    }
    for (const [seed, runBlocks] of bySeed) {
      const pooled = pooledByGroup.get(`${benchName}-${seed}`) || { bars: [] };
      groups.set(`${benchName}-${seed}`, {
        json: {
          schema: 'spaceface.funMeasure.v1',
          timestamp: rollup.timestamp,
          bench: benchName,
          seed,
          bars: pooled.bars,
          runs: runBlocks,
        },
        markdown: renderBenchSeedMarkdown(benchName, seed, runBlocks, pooled.bars, rollup.timestamp),
      });
    }
  }
  return groups;
}

// ── bars registry loading ────────────────────────────────────────────────────────

async function loadFeelBarsModule() {
  try {
    const mod = await import('./lib/bench/feelBars.mjs');
    if (typeof mod.evaluateBars !== 'function') throw new Error('evaluateBars export not found');
    return mod;
  } catch (err) {
    console.error(
      'Fun measurer error: the bars registry scripts/lib/bench/feelBars.mjs (the parallel PQ-173.01 leaf) '
      + `is not available yet (${err.message}). Measurement mode cannot evaluate the FEEL_CONTRACT bars. `
      + 'The --diff mode still works without it.'
    );
    process.exit(1);
  }
}

// ── Markdown rendering (owner-readable; never a repo file path in a table) ──────

export function renderBenchSeedMarkdown(benchName, seed, runBlocks, pooledBars, timestamp) {
  const lines = [];
  lines.push(`# Fun measure — ${benchName} — seed ${seed} — ${timestamp.slice(0, 10)}`);
  lines.push('');
  lines.push('Every FEEL_CONTRACT §B bar, evaluated once over the whole measurement set in this receipt (Fun Convergence Loop §3.2), then the per-run fun metrics. Values are player units. The fed-by column names the run each bar number comes from; each run section below lists only the bars that run feeds.');
  lines.push('');
  lines.push('## Bars (FEEL_CONTRACT §B) — pooled over this receipt');
  lines.push('');
  lines.push(...renderBarTable(pooledBars, { withFedBy: true }));
  lines.push('');
  for (const runBlock of runBlocks) {
    lines.push(renderRunMarkdown(runBlock, pooledBars));
    lines.push('');
  }
  return lines.join('\n');
}

export function renderRunMarkdown(runBlock, pooledBars) {
  const lines = [];
  const hash = typeof runBlock.runHash === 'string' && runBlock.runHash ? ` (run ${runBlock.runHash.slice(0, 8)})` : '';
  lines.push(`### ${runBlock.runRef}${hash}`);
  lines.push('');
  lines.push('Bars this run feeds (FEEL_CONTRACT §B — pooled verdict for the whole receipt):');
  lines.push('');
  const fed = fedBarsForRun(runBlock, pooledBars);
  if (fed.length === 0) {
    lines.push('None — this run does not feed a FEEL_CONTRACT §B bar.');
  } else {
    lines.push(...renderBarTable(fed, { withFedBy: false }));
  }
  lines.push('');
  lines.push('Fun metrics (law §3.2):');
  lines.push('| metric | value | fun threshold | verdict |');
  lines.push('|---|---|---|---|');
  for (const row of renderFunMetricRows(runBlock.funMetrics)) lines.push(row);
  lines.push('');
  const gaps = (runBlock.funMetrics && runBlock.funMetrics.gaps) || [];
  lines.push(gaps.length === 0
    ? 'Gaps: none — every law metric was measurable for this run.'
    : `Gaps: ${[...new Set(gaps)].map((g) => sanitizeCell(g)).join('; ')}`);
  return lines.join('\n');
}

// One shared bar-table renderer: pooled receipts table (with fed by) and per-run fed tables use the
// same row format. Long text never goes into a cell and is never truncated — it becomes a full-text
// note bullet under the table.
// A value cell in the owner's words: a clause that is a yes/no fact reads yes/no,
// never "1 bool"; everything else is its number with its unit.
function valueWord(v) {
  if (v && v.unit === 'bool') return v.value === 1 ? 'yes' : 'no';
  return `${fmt(v.value)}${v && v.unit ? ` ${v.unit}` : ''}`;
}

function renderBarTable(bars, { withFedBy }) {
  const lines = [];
  const notes = [];
  lines.push(withFedBy
    ? '| bar | value(s) | target | met | fed by |'
    : '| bar | value(s) | target | met |');
  lines.push(withFedBy ? '|---|---|---|---|---|' : '|---|---|---|---|');
  for (const bar of bars || []) lines.push(renderBarRow(bar, withFedBy, notes));
  if (notes.length > 0) {
    lines.push('');
    lines.push('Notes — the full text behind the cells, never truncated:');
    for (const note of notes) lines.push(`- ${note}`);
  }
  return lines;
}

function renderBarRow(bar, withFedBy, notes) {
  const id = bar && bar.id != null ? String(bar.id) : '?';
  const title = sanitizeCell(String((bar && bar.title) || (bar && bar.key) || ''));
  const name = `${id}${title ? ` ${title}` : ''}`;
  const target = cell((bar && bar.target) != null ? String(bar.target) : '—');
  const met = barVerdict(bar);
  const fedByRefs = (bar && Array.isArray(bar.fedBy) ? bar.fedBy : []).map((ref) => cell(String(ref)));
  const allRows = (bar && Array.isArray(bar.values) ? bar.values : []).filter(Boolean);
  const values = allRows.filter((v) => typeof v.value === 'number' && Number.isFinite(v.value));
  const gaps = allRows.filter((v) => v.unmeasured === true || typeof v.value !== 'number' || !Number.isFinite(v.value));

  let valueCell;
  let noteText = '';
  if (!bar || bar.reachable === false) {
    valueCell = 'not reachable by this bench';
    noteText = barNotesIfAny(bar, 'this bench cannot measure this bar.');
  } else if (fedByRefs.length === 0) {
    valueCell = 'no feeding run in this measurement';
  } else if (values.length === 0 && gaps.length === 0) {
    valueCell = 'no finite value in this measurement';
    noteText = barNotesIfAny(bar, 'the feeding run(s) carried no finite value for this bar.');
  } else if (values.length === 0) {
    valueCell = gaps.map((v) => `${cell(String(v.label))}: unmeasured`).join('<br>');
    noteText = barNotesIfAny(bar, 'the feeding run(s) carried no finite value for this bar.');
  } else {
    valueCell = [
      ...values.map((v) => `${cell(String(v.label))}: ${valueWord(v)}`),
      ...gaps.map((v) => `${cell(String(v.label))}: unmeasured`),
    ].join('<br>');
    noteText = barNotesIfAny(bar, '');
  }

  if (noteText) notes.push(`**${name}** — ${noteText}`);

  const cells = [cell(name), valueCell, target, met];
  if (withFedBy) cells.push(fedByRefs.length > 0 ? fedByRefs.join('<br>') : '—');
  return `| ${cells.join(' | ')} |`;
}

// Full note text for a bar that earned a note (unreachable reason, or caveats on a measured bar).
// `fallback` is used only when the bar result carries no notes at all — pass '' when silence is
// the honest rendering (a fully measured bar with no caveats gets no note). Notes coming from the
// bars registry are reworded at the rendering layer: with pooled evaluation the old "not part of
// this measurement" phrasing is always wrong on a fed bar (some run in this receipt fed it), so it
// must never reach the rendered Markdown.
function barNotesIfAny(bar, fallback) {
  const text = sanitizeCell(String((bar && bar.notes) || ''))
    .replace(/\s+/g, ' ')
    .replace(/not part of this measurement/gi, 'not fed by this measurement')
    .trim();
  return text || fallback;
}

// Bar-level verdict: yes/no, or — when the bar result carries no verdict (met null).
// The registry's bar-level met is the authority (it applies the contract's clause
// semantics); value rows are clauses and must never promote a null bar to yes/no.
function barVerdict(bar) {
  if (!bar) return '—';
  if (bar.met === true) return 'yes';
  if (bar.met === false) return 'no';
  return '—';
}

// Finite numeric value rows of a bar, paired across before/after by a run-count-normalized
// label key: labels embed "(worst of N run(s))" facts that differ between two measurements
// of the same seeds, so the pairing key strips the trailing parenthetical.
function finiteRows(bar) {
  return (bar && Array.isArray(bar.values) ? bar.values : [])
    .map((v, i) => ({
      rawLabel: v && typeof v.label === 'string' ? v.label : `row ${i + 1}`,
      value: v && typeof v.value === 'number' && Number.isFinite(v.value) ? v.value : null,
      unit: v && typeof v.unit === 'string' ? v.unit : '',
      met: v && v.met === true ? true : v && v.met === false ? false : undefined,
    }))
    .filter((r) => r.value !== null)
    .map((r) => ({
      label: r.rawLabel,
      key: r.rawLabel.replace(/\s*\([^)]*run\(s?\)[^)]*\)\s*$/, '').trim() || r.rawLabel,
      value: r.value,
      unit: r.unit,
      met: r.met,
    }));
}

// Bar-level verdict, strict: the registry's met is the only authority. A bar whose clauses
// cannot decide (met null) renders '—' everywhere — the same verdict its receipt shows.
// Value rows keep their own per-clause met for row-level diffing, but they can never
// promote the bar. (Same rule as barVerdict; kept separate for the different null text.)
function metState(bar) {
  if (!bar) return '—';
  if (bar.met === true) return 'yes';
  if (bar.met === false) return 'no';
  return '—';
}

function renderFunMetricRows(fm) {
  const rows = [];
  const push = (metric, value, threshold, verdict) => rows.push(
    `| ${metric} | ${sanitizeCell(String(value))} | ${threshold} | ${verdict} |`
  );

  push('verbs per minute (distinct)',
    fm.verbsPerMinute === null ? '—' : fmt(fm.verbsPerMinute),
    '>= 4 per minute',
    fm.verbsPerMinute === null ? 'not measured' : fm.verbsPerMinute >= FUN_THRESHOLDS.verbsPerMinute.fun ? 'fun' : 'thin');
  push('consequences per player action',
    fm.consequencesPerAction === null ? '—' : fmt(fm.consequencesPerAction),
    '>= 2 within 3 s',
    fm.consequencesPerAction === null ? 'not measured' : fm.consequencesPerAction >= FUN_THRESHOLDS.consequencesPerAction.fun ? 'fun' : 'thin');
  push('time to first consequence',
    fm.timeToFirstConsequenceS === null ? '—' : `${fmt(fm.timeToFirstConsequenceS)} s`,
    '<= 0.3 s',
    fm.timeToFirstConsequenceS === null ? 'not measured' : fm.timeToFirstConsequenceS <= FUN_THRESHOLDS.timeToFirstConsequenceS.fun ? 'instant' : 'slow');
  push('moments per minute',
    fm.momentsPerMinute === null ? '—' : fmt(fm.momentsPerMinute),
    '>= 1 per minute',
    fm.momentsPerMinute === null ? 'not measured' : fm.momentsPerMinute >= FUN_THRESHOLDS.momentsPerMinute.fun ? 'alive' : 'dead');
  push('nothing-happened seconds',
    fm.nothingHappenedSeconds === null ? '—' : `${fmt(fm.nothingHappenedSeconds)} s`,
    'none',
    fm.nothingHappenedSeconds === null ? 'not measured' : fm.nothingHappenedSeconds <= FUN_THRESHOLDS.nothingHappenedSeconds.fun ? 'clean' : 'dead air');

  const kb = fm.knockBudget;
  if (kb) {
    const heading = kb.headingChangeEvents === null || kb.headingChangeEvents === undefined
      ? ''
      : `, ${kb.headingChangeEvents} heading change${kb.headingChangeEvents === 1 ? '' : 's'}`;
    const value = `${fmt(kb.eventsPerMinute)}/min, max ${fmt(round((kb.maxDeltaVFractionOfCruise ?? 0) * 100))}% of cruise${heading}`;
    push('knock budget on the player', value,
      `<= ${KNOCK_BUDGET_LIMITS.eventsPerMinute}/min and <= ${KNOCK_BUDGET_LIMITS.maxDeltaVFractionOfCruise * 100}% of cruise, never a heading change`,
      kb.met === true ? 'within budget' : kb.met === false ? 'over budget' : 'not measured');
  } else {
    push('knock budget on the player', '—', '<= 2/min and <= 10% of cruise, never a heading change', 'not measured');
  }

  const deaths = fm.deathsByCause;
  const deathText = deaths
    ? Object.entries(deaths).map(([cause, count]) => `${cause} ${count}`).join(', ')
    : '—';
  push('deaths by cause', deathText, 'informational', deaths ? 'recorded' : 'not measured');
  return rows;
}

function renderMeasureSummaryMarkdown(rollup) {
  const lines = [];
  lines.push(`# Fun Convergence Loop — measure summary — ${rollup.timestamp.slice(0, 10)}`);
  lines.push('');
  lines.push(`**Seeds:** ${rollup.seeds.join(', ')} | **Schema:** ${rollup.schema}${rollup.quick ? ' | **Mode:** quick smoke' : ''}`);
  const s = rollup.summary || {};
  lines.push(`**Bars across this run set:** reachable ${s.reachable ?? '?'} | met ${s.met ?? '?'} | partial ${s.partial ?? '?'} | unreachable ${s.unreachable ?? '?'}`);
  lines.push('');
  lines.push('| bench | runs | per-seed receipts |');
  lines.push('|---|---|---|');
  for (const [benchName, bench] of Object.entries(rollup.benches)) {
    const seeds = [...new Set(bench.runs.map((r) => r.seed))].sort((a, b) => a - b)
      .map((seed) => `${rollup.date || rollup.timestamp.slice(0, 10)}-${benchName}-${seed}.md`)
      .join(', ');
    lines.push(`| ${benchName} | ${bench.runs.length} | ${seeds} |`);
  }
  lines.push('');
  lines.push('Each per-seed receipt pools the §B bars once for its whole measurement set (with a fed-by column naming the producing run), then lists per-run fed bars, fun metrics and gaps.');
  return lines.join('\n');
}

// ── diff mode (law §3.6 COMPARE) ─────────────────────────────────────────────────

function runDiffMode(args, outDir, isoDate) {
  const [beforePath, afterPath] = args.diff;
  const before = readMeasureSummary(beforePath);
  const after = readMeasureSummary(afterPath);
  const diff = buildMeasureDiff(before, after, {
    timestamp: new Date().toISOString(),
    beforeRef: basename(beforePath),
    afterRef: basename(afterPath),
  });

  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `${isoDate}-measure-diff`);
  const md = renderDiffMarkdown(diff);
  writeFileSync(`${base}.json`, JSON.stringify(diff, null, 2), 'utf8');
  writeFileSync(`${base}.md`, md, 'utf8');

  if (args.json) console.log(JSON.stringify(diff, null, 2));
  else console.log(md);
  if (!args.json) {
    console.log(`\nDiff receipts written:\n  ${base}.json\n  ${base}.md`);
  }
}

function readMeasureSummary(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`cannot read diff input "${path}": ${err.message}`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.benches) {
      fail(`"${path}" is not a measure summary (expected schema spaceface.funMeasure.v1 with a benches block)`);
    }
    return parsed;
  } catch (err) {
    if (err && err.message.startsWith('Fun measurer')) throw err;
    fail(`cannot parse diff input "${path}": ${err.message}`);
  }
  return null;
}

function flattenRuns(summary) {
  const runs = [];
  for (const benchName of Object.keys(summary.benches || {})) {
    for (const runBlock of (summary.benches[benchName] && summary.benches[benchName].runs) || []) {
      runs.push({ benchName, ...runBlock });
    }
  }
  return runs;
}

function runKey(runBlock) {
  const identity = runBlock.scenarioId
    ? String(runBlock.scenarioId)
    : [runBlock.arenaId, runBlock.loadoutId].filter(Boolean).join('/') || runBlock.runRef || '';
  return [runBlock.bench || runBlock.benchName, identity, String(runBlock.seed)].join('|');
}

const FUN_METRIC_DIFF_FIELDS = [
  { key: 'verbsPerMinute', label: 'verbs per minute', direction: 'higher', threshold: '>= 4/min' },
  { key: 'consequencesPerAction', label: 'consequences per action', direction: 'higher', threshold: '>= 2' },
  { key: 'timeToFirstConsequenceS', label: 'time to first consequence (s)', direction: 'lower', threshold: '<= 0.3 s' },
  { key: 'momentsPerMinute', label: 'moments per minute', direction: 'higher', threshold: '>= 1/min' },
  { key: 'nothingHappenedSeconds', label: 'nothing-happened seconds', direction: 'lower', threshold: 'none' },
  { key: 'knockBudget.eventsPerMinute', label: 'knock events per minute', direction: 'lower', threshold: '<= 2/min' },
  { key: 'knockBudget.maxDeltaVFractionOfCruise', label: 'max knock delta-v, fraction of cruise', direction: 'lower', threshold: '<= 10%' },
  { key: 'knockBudget.headingChangeEvents', label: 'knock heading changes', direction: 'lower', threshold: 'never' },
];

// Direction of a bar target string for the FIRST (headline) value row only: ">= 4" means
// higher is better, "<= 0.3 s" lower. Later `;`-separated clauses belong to other value
// rows (e.g. B7's "stretch < 10 %; release keeps ≥ 95 %") and must never flip the sign.
export function parseTargetDirection(target) {
  if (typeof target === 'number') return null;
  if (typeof target !== 'string') return null;
  const firstClause = String(target).split(';')[0].trim();
  if (firstClause.includes('≥') || firstClause.includes('>=')) return 'higher';
  if (firstClause.includes('≤') || firstClause.includes('<=')) return 'lower';
  if (firstClause.includes('<')) return 'lower';
  if (firstClause.includes('>')) return 'higher';
  return null;
}

function diffDirection(before, after, target, metBefore, metAfter) {
  const delta = round(after - before);
  if (Math.abs(after - before) < 1e-9) return { delta: 0, direction: 'unchanged' };
  const dir = parseTargetDirection(target);
  if (dir === 'higher') return { delta, direction: delta > 0 ? 'toward' : 'away' };
  if (dir === 'lower') return { delta, direction: delta < 0 ? 'toward' : 'away' };
  if (metBefore === 'no' && metAfter === 'yes') return { delta, direction: 'toward' };
  if (metBefore === 'yes' && metAfter === 'no') return { delta, direction: 'away' };
  return { delta, direction: 'unknown' };
}

/**
 * Builds the before/after diff (law §3.6). Runs align by (bench, scenarioId | arenaId+loadoutId,
 * seed). Pure: reads the two summaries, touches nothing else.
 */
export function buildMeasureDiff(beforeSummary, afterSummary, { timestamp } = {}) {
  const beforeRuns = flattenRuns(beforeSummary);
  const afterRuns = flattenRuns(afterSummary);
  const beforeByKey = new Map(beforeRuns.map((r) => [runKey(r), r]));

  const notes = [];
  const runs = [];
  for (const afterRun of afterRuns) {
    const beforeRun = beforeByKey.get(runKey(afterRun));
    if (!beforeRun) {
      notes.push(`run ${afterRun.runRef || runKey(afterRun)} has no before counterpart; skipped`);
      continue;
    }
    beforeByKey.delete(runKey(afterRun));

    const bars = [];
    const afterBars = new Map((afterRun.bars || []).map((b) => [b.id, b]));
    for (const afterBar of afterRun.bars || []) {
      const beforeBar = (beforeRun.bars || []).find((b) => b.id === afterBar.id);
      if (!beforeBar) {
        notes.push(`bar ${afterBar.id} present only in after for ${afterRun.runRef}`);
        continue;
      }
      const target = afterBar.target != null ? afterBar.target : beforeBar.target;
      // Pair EVERY value row by label: a multi-clause bar (B6, B13, B7/B8/B11, and any row the
      // bar-feed seam adds) regresses in any row, not just its headline. A diff that read only
      // row 1 could call a real regression KEEP.
      const afterRows = finiteRows(afterBar);
      const beforeRows = finiteRows(beforeBar);
      const rows = [];
      for (const ar of afterRows) {
        const br = beforeRows.find((r) => r.key === ar.key);
        if (!br) {
          notes.push(`bar ${afterBar.id} row "${ar.label}" present only in after for ${afterRun.runRef}`);
          continue;
        }
        const rowMetBefore = br.met === true ? 'yes' : br.met === false ? 'no' : '—';
        const rowMetAfter = ar.met === true ? 'yes' : ar.met === false ? 'no' : '—';
        const { delta, direction } = diffDirection(br.value, ar.value, target, rowMetBefore, rowMetAfter);
        rows.push({ label: ar.label, unit: ar.unit, before: br.value, after: ar.value, delta, direction });
      }
      for (const br of beforeRows) {
        if (!afterRows.some((r) => r.key === br.key)) {
          notes.push(`bar ${afterBar.id} row "${br.label}" present only in before for ${afterRun.runRef}`);
        }
      }
      if (rows.length === 0) {
        notes.push(`bar ${afterBar.id} on ${afterRun.runRef} has no numeric value row on both sides; skipped`);
        continue;
      }
      // Tri-state: the registry's bar-level met is the authority; a bar whose clauses
      // cannot decide (met null) must render as '—', never collapse to 'no'.
      const metBefore = metState(beforeBar);
      const metAfter = metState(afterBar);
      const headline = rows[0];
      // §3.6, worst row wins: any away row is a regression; an undecidable row reverts; ties revert.
      let direction = 'unchanged';
      for (const rank of ['away', 'unknown', 'toward']) {
        if (rows.some((r) => r.direction === rank)) { direction = rank; break; }
      }
      bars.push({
        id: afterBar.id,
        title: afterBar.title || beforeBar.title || '',
        before: headline.before,
        after: headline.after,
        delta: headline.delta,
        target,
        direction,
        metBefore,
        metAfter,
        rows,
      });
    }
    for (const beforeBar of beforeRun.bars || []) {
      if (!afterBars.has(beforeBar.id)) notes.push(`bar ${beforeBar.id} present only in before for ${afterRun.runRef}`);
    }

    const funMetrics = [];
    for (const field of FUN_METRIC_DIFF_FIELDS) {
      const bv = getByPath(beforeRun.funMetrics, field.key);
      const av = getByPath(afterRun.funMetrics, field.key);
      if (typeof bv !== 'number' || typeof av !== 'number') continue;
      const { delta, direction } = diffDirection(bv, av, field.direction === 'lower' ? '<= x' : '>= x', null, null);
      funMetrics.push({ metric: field.key, label: field.label, threshold: field.threshold, before: bv, after: av, delta, direction });
    }

    runs.push({
      key: runKey(afterRun),
      runRef: afterRun.runRef || runKey(afterRun),
      bench: afterRun.bench || afterRun.benchName,
      seed: afterRun.seed,
      bars,
      funMetrics,
    });
  }
  for (const leftover of beforeByKey.values()) {
    notes.push(`run ${leftover.runRef || runKey(leftover)} has no after counterpart; skipped`);
  }

  runs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const { verdict, reason } = computeVerdict(runs);
  const allBars = runs.flatMap((r) => r.bars);
  const allMetrics = runs.flatMap((r) => r.funMetrics);
  const countBy = (items, prop) => items.reduce((acc, item) => { acc[item[prop]] = (acc[item[prop]] || 0) + 1; return acc; }, {});

  return {
    schema: 'spaceface.funMeasureDiff.v1',
    timestamp: timestamp || null,
    beforeRef: beforeSummary.timestamp || null,
    afterRef: afterSummary.timestamp || null,
    verdict,
    reason,
    runs,
    notes,
    summary: {
      bars: countBy(allBars, 'direction'),
      funMetrics: countBy(allMetrics, 'direction'),
    },
  };
}

// §3.6: keep only if every bar that moved moved toward its target and none regressed. Ties revert.
function computeVerdict(runs) {
  const directions = runs.flatMap((r) => r.bars.map((b) => b.direction));
  const changed = directions.filter((d) => d !== 'unchanged');
  if (changed.length === 0) {
    return { verdict: 'REVERT', reason: 'tie: no bar moved — the law says ties revert (FUN_CONVERGENCE_LOOP §3.6)' };
  }
  const toward = changed.filter((d) => d === 'toward').length;
  if (toward === changed.length) {
    return { verdict: 'KEEP', reason: `all ${changed.length} changed bar(s) moved toward their target (FUN_CONVERGENCE_LOOP §3.6)` };
  }
  const regressed = changed.length - toward;
  return { verdict: 'REVERT', reason: `${regressed} of ${changed.length} changed bar(s) moved away from or unclear vs target — a regression reverts (FUN_CONVERGENCE_LOOP §3.6)` };
}

export function renderDiffMarkdown(diff) {
  const lines = [];
  lines.push(`# Fun Convergence Loop — before/after diff — ${(diff.timestamp || '').slice(0, 10)}`);
  lines.push('');
  lines.push(`**Verdict: ${diff.verdict}** — ${diff.reason}`);
  lines.push('');
  lines.push(`Before: ${diff.beforeRef || 'unknown'} | After: ${diff.afterRef || 'unknown'}`);
  lines.push('');
  for (const run of diff.runs) {
    lines.push(`## ${run.runRef}`);
    lines.push('');
    if (run.bars.length === 0) {
      lines.push('Bars: this bench reaches no FEEL_CONTRACT bar for this run.');
      lines.push('');
    } else {
      lines.push('| bar | before | after | delta | target | direction | met before → after |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const bar of run.bars) {
        lines.push(`| ${sanitizeCell(String(bar.id))}${bar.title ? ` ${sanitizeCell(String(bar.title))}` : ''} | ${fmt(bar.before)} | ${fmt(bar.after)} | ${signed(bar.delta)} | ${sanitizeCell(String(bar.target ?? '—'))} | ${bar.direction} | ${bar.metBefore} → ${bar.metAfter} |`);
      }
      lines.push('');
      const multiRow = run.bars.filter((bar) => Array.isArray(bar.rows) && bar.rows.length > 1);
      if (multiRow.length > 0) {
        lines.push('Row detail — every value row of the multi-clause bars above, each with its own direction:');
        for (const bar of multiRow) {
          for (const row of bar.rows) {
            lines.push(`- ${bar.id} ${sanitizeCell(String(row.label))}: ${fmt(row.before)} → ${fmt(row.after)} (${signed(row.delta)}, ${row.direction})`);
          }
        }
        lines.push('');
      }
    }
    if (run.funMetrics.length === 0) {
      lines.push('Fun metrics: none numerically measurable on both sides for this run.');
      lines.push('');
    } else {
      lines.push('| fun metric | before | after | delta | fun threshold | direction |');
      lines.push('|---|---|---|---|---|---|');
      for (const metric of run.funMetrics) {
        lines.push(`| ${metric.label} | ${fmt(metric.before)} | ${fmt(metric.after)} | ${signed(metric.delta)} | ${metric.threshold} | ${metric.direction} |`);
      }
      lines.push('');
    }
  }
  if (diff.notes.length > 0) {
    lines.push(`Notes: ${diff.notes.map((n) => sanitizeCell(n)).join('; ')}`);
    lines.push('');
  }
  lines.push(`Run sets compared: ${diff.runs.length}. Verdict rule: keep only if every bar that moved moved toward its target and none regressed; ties revert (FUN_CONVERGENCE_LOOP §3.6).`);
  return lines.join('\n');
}

// ── small shared helpers ─────────────────────────────────────────────────────────

function getByPath(obj, path) {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function fmt(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return String(round(value));
}

function signed(value) {
  const r = round(value);
  return r > 0 ? `+${r}` : String(r);
}

// A table cell: path-sanitized and pipe-escaped so arbitrary note text cannot break the table.
// Long text still never belongs in a cell — renderBarTable moves it to full-text notes instead.
function cell(text) {
  return sanitizeCell(text).replace(/\|/g, '\\|');
}

// Markdown tables must never carry repo file paths (owner-readable receipts). Strips path-shaped
// runs: repo-dir-prefixed paths, drive-letter paths, and paths ending in a source extension.
function sanitizeCell(text) {
  return String(text)
    .replace(/[A-Za-z]:\\[^\s'",|)]*/g, '<repo file>')
    .replace(/(?:scripts|src|design|docs|test|tests|assets|tools)(?:[\/\\][\w.\-]+)+/g, '<repo file>')
    .replace(/(?:[\w.\-]+[\/\\])+\w+\.(?:mjs|js|cjs|json|ts|md|txt)/g, '<repo file>');
}

// ── entrypoint (importing this module must not run the measurer) ─────────────────

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('Fun measurer error:', err);
    process.exit(1);
  });
}
