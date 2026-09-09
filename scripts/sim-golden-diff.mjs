#!/usr/bin/env node
// sim-golden-diff — answer "did this golden-hash change matter?" in about thirty seconds.
//
// WHY THIS EXISTS
// ---------------
// `test/47a.telemetry*.expected.json` carry an authoritativeHash over the ENTIRE 720-tick sim
// snapshot. That is the only thing standing between this project and a silent physics regression,
// and it is also extremely easy to knock over: on 2026-07-27 the legacy golden had been stale for
// 333 commits, and 21033 of the 21060 fields that had moved were the market price-cycle table.
// Someone tuning an economy curve invalidates the physics proof.
//
// So the question is never "did the hash change" (it changes constantly). The question is:
//
//     did any ENTITY MOTION field change?
//
// If no pos / vel / rot / angVel / prevPos moved, the physics and flight contract is bit-identical
// and a re-record is bookkeeping. If motion moved and you did not mean to move it, you have found a
// regression and you must NOT re-record.
//
// This script answers exactly that. It exports a reference commit with `git archive` — no checkout,
// no branch operation, safe to run while other agents are editing the working tree — runs the sim on
// both trees, and diffs the snapshots field by field.
//
// This is a DIAGNOSTIC, not a gate. It is deliberately not wired into any check chain: it shells out
// to git and writes a temp tree, which is fine for a human or an agent deciding something and wrong
// for CI. `check:sim` and `check:sim:v3` remain the gates.
//
// Usage:
//   node scripts/sim-golden-diff.mjs
//   node scripts/sim-golden-diff.mjs --flight-system v3
//   node scripts/sim-golden-diff.mjs --ref 850c80f3
//   node scripts/sim-golden-diff.mjs --json
//   node scripts/sim-golden-diff.mjs --keep      # leave the exported tree for further poking
//
// Exit 0 when the two hashes agree. Exit 1 when they differ (read the verdict). Exit 2 on a setup
// problem — most often "the reference tree does not reproduce the recorded hash", which means the
// ref you picked is not the commit that actually recorded that golden.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`sim-golden-diff — did this golden-hash change matter?

  --flight-system legacy|v3   which controller (default legacy)
  --ref <commitish>           reference commit (default: last commit to touch the expected file)
  --ticks N                   tick count (default 720, matching check:sim)
  --seed N                    seed (default 47)
  --json                      machine-readable
  --keep                      keep the exported reference tree and print its path
`);
  process.exit(0);
}

const flightSystem = readOption('--flight-system') || 'legacy';
if (!['legacy', 'v3'].includes(flightSystem)) fail(2, '--flight-system must be legacy or v3');
const ticks = Number(readOption('--ticks') || 720);
const seed = Number(readOption('--seed') || 47);
const asJson = argv.includes('--json');
const keep = argv.includes('--keep');
const expectedPath = flightSystem === 'v3'
  ? 'test/47a.telemetry.v3.expected.json'
  : 'test/47a.telemetry.expected.json';

// Motion is the thing that must not move silently. Everything else in the snapshot is content:
// economy curves, mission copy, save version, new data fields. Those legitimately churn.
const MOTION_KEYS = new Set(['pos', 'vel', 'rot', 'angVel', 'prevPos', 'angularVelocity', 'linvel', 'angvel']);

const expected = JSON.parse(readFileSync(resolve(ROOT, expectedPath), 'utf8'));
const recordedHash = expected?.acceptanceCriteria?.authoritativeHash || null;
const ref = readOption('--ref') || lastCommitTouching(expectedPath);
if (!ref) fail(2, `could not determine a reference commit for ${expectedPath}; pass --ref`);

const workDir = mkdtempSync(join(tmpdir(), 'sf-golden-diff-'));
let refTree = null;
try {
  refTree = exportRefTree(ref, workDir);
  linkNodeModules(refTree);

  const refRun = runSim(refTree);
  const headRun = runSim(ROOT);

  const refReproducesGolden = recordedHash != null && refRun.sha256 === recordedHash;
  const hashEqual = refRun.sha256 === headRun.sha256;
  const diffs = diffSnapshots(refRun.snapshot, headRun.snapshot);
  const motionDiffs = diffs.filter((d) => d.motion);
  const traceDiffs = diffTraceCounts(refRun.traceSummary, headRun.traceSummary);
  const byTop = groupByTop(diffs);

  const verdict = hashEqual
    ? 'IDENTICAL'
    : motionDiffs.length === 0
      ? 'CONTENT_ONLY'
      : 'MOTION_CHANGED';

  if (asJson) {
    console.log(JSON.stringify({
      schema: 'spaceface.simGoldenDiff.v1',
      verdict,
      flightSystem,
      ref,
      expectedPath,
      recordedHash,
      refHash: refRun.sha256,
      headHash: headRun.sha256,
      refReproducesGolden,
      hashEqual,
      totalDiffs: diffs.length,
      motionDiffs,
      traceDiffs,
      byTopLevelKey: byTop,
      nonEconomyDiffs: diffs.filter((d) => !d.path.startsWith('$.economy')).slice(0, 200),
    }, null, 2));
  } else {
    report({ verdict, ref, refRun, headRun, recordedHash, refReproducesGolden, hashEqual, diffs, motionDiffs, traceDiffs, byTop });
  }

  if (recordedHash != null && !refReproducesGolden) process.exitCode = 2;
  else process.exitCode = hashEqual ? 0 : 1;
} finally {
  if (keep && refTree) console.log(`\n[kept] reference tree: ${refTree}`);
  else rmSync(workDir, { recursive: true, force: true, maxRetries: 3 });
}

function report(r) {
  console.log('');
  console.log(`sim-golden-diff  (${flightSystem}, ${ticks} ticks, seed ${seed})`);
  console.log(`  expected file : ${expectedPath}`);
  console.log(`  reference     : ${r.ref}`);
  console.log(`  recorded hash : ${r.recordedHash || '(none)'}`);
  console.log(`  reference run : ${r.refRun.sha256}${r.recordedHash ? (r.refReproducesGolden ? '  <- reproduces the recorded hash' : '  <- DOES NOT reproduce the recorded hash') : ''}`);
  console.log(`  working tree  : ${r.headRun.sha256}`);
  console.log('');
  if (r.recordedHash && !r.refReproducesGolden) {
    console.log('  WARNING: the reference commit does not reproduce the hash recorded in the expected');
    console.log('  file, so it is not the commit that recorded this golden. Two ordinary causes:');
    console.log('    1. the expected file has uncommitted edits (a re-record in progress);');
    console.log('    2. you picked the wrong --ref.');
    console.log(`  Find the recording commit with:  git log --oneline -- ${expectedPath}`);
    console.log('  The reference-vs-working-tree comparison below is still valid; it just is not a');
    console.log('  comparison against the recorded golden.');
    console.log('');
  }
  if (r.hashEqual) {
    console.log('  VERDICT: IDENTICAL — the working tree reproduces the reference run exactly.');
    console.log('');
    return;
  }
  console.log(`  ${r.diffs.length} snapshot fields differ.`);
  console.log('  by top-level key:');
  for (const [key, count] of r.byTop) console.log(`    ${String(count).padStart(7)}  ${key}`);
  console.log('');
  if (r.traceDiffs.length) {
    console.log('  event trace counts that moved:');
    for (const d of r.traceDiffs) console.log(`    ${d.type}: ${d.ref} -> ${d.head}`);
    console.log('');
  }
  if (r.verdict === 'CONTENT_ONLY') {
    console.log('  VERDICT: CONTENT_ONLY');
    console.log('  ZERO entity motion fields changed (pos / vel / rot / angVel / prevPos). The physics');
    console.log('  and flight contract is bit-identical; what moved is content — data tables, copy,');
    console.log('  save version, new fields. A re-record is bookkeeping, not a physics decision.');
    console.log('');
    console.log('  If you re-record, write WHY into the expected file\'s `notes`: the commit range, the');
    console.log('  by-key breakdown above, and the sentence "zero motion fields changed". The next');
    console.log('  person needs to be able to trust that line without redoing this.');
  } else {
    console.log('  VERDICT: MOTION_CHANGED  <-- read this before you touch the hash');
    console.log(`  ${r.motionDiffs.length} entity motion field(s) changed. Something moved differently.`);
    console.log('  If you did not deliberately change flight, physics, or weapons behaviour, this is a');
    console.log('  REGRESSION and re-recording the golden would bury it. First few:');
    for (const d of r.motionDiffs.slice(0, 25)) {
      console.log(`    ${d.path}\n        ref=${brief(d.ref)}  head=${brief(d.head)}`);
    }
    if (r.motionDiffs.length > 25) console.log(`    ... and ${r.motionDiffs.length - 25} more`);
  }
  const nonEconomy = r.diffs.filter((d) => !d.path.startsWith('$.economy'));
  if (nonEconomy.length && nonEconomy.length <= 60) {
    console.log('');
    console.log('  non-economy fields (economy curves churn on their own and drown everything else):');
    for (const d of nonEconomy) console.log(`    ${d.kind.padEnd(10)} ${d.path}\n        ref=${brief(d.ref)}  head=${brief(d.head)}`);
  }
  console.log('');
}

function runSim(cwd) {
  const args = [
    'scripts/sf-sim.mjs', 'run', '47a',
    '--seed', String(seed),
    '--ticks', String(ticks),
    '--inputs', 'test/47a.inputs.json',
    '--hash', '--snapshot',
  ];
  if (flightSystem === 'v3') args.push('--flight-system', 'v3');
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, { cwd, maxBuffer: 1 << 28, encoding: 'utf8' });
  } catch (error) {
    fail(2, `sf-sim failed in ${cwd}:\n${String(error.stderr || error.message).slice(0, 2000)}`);
  }
  const parsed = JSON.parse(stdout);
  if (!parsed.snapshot) fail(2, `sf-sim produced no snapshot in ${cwd}`);
  return parsed;
}

function exportRefTree(commitish, dir) {
  const tree = join(dir, 'ref');
  mkdirSync(tree, { recursive: true });
  // `git archive` is read-only: no checkout, no index write, no branch operation. Safe to run while
  // other agents hold the working tree. Only the paths sf-sim actually needs are exported.
  const archive = execFileSync('git', ['archive', commitish, 'src', 'scripts', 'test', 'package.json'], {
    cwd: ROOT,
    maxBuffer: 1 << 29,
  });
  writeFileSync(join(dir, 'ref.tar'), archive);
  // Relative paths on purpose: GNU tar (which git-for-windows puts on PATH ahead of bsdtar) reads a
  // leading `C:` as a remote host spec and fails with "Cannot connect to C: resolve failed".
  execFileSync('tar', ['-xf', 'ref.tar', '-C', 'ref'], { cwd: dir });
  if (!existsSync(join(tree, 'scripts', 'sf-sim.mjs'))) fail(2, `exported tree at ${commitish} has no scripts/sf-sim.mjs`);
  return tree;
}

function linkNodeModules(tree) {
  const target = join(ROOT, 'node_modules');
  if (!existsSync(target)) fail(2, 'node_modules is missing; the reference tree cannot resolve rapier');
  // Junction on Windows (no admin rights needed), dir symlink elsewhere. Note the reference tree
  // therefore runs against the CURRENT dependency versions — if the ref predates a dependency bump,
  // that is a confound and the "does it reproduce the recorded hash" check above will catch it.
  symlinkSync(target, join(tree, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
}

function lastCommitTouching(path) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%H', '--', path], { cwd: ROOT, encoding: 'utf8' });
    return out.trim() || null;
  } catch (_) {
    return null;
  }
}

function diffSnapshots(a, b) {
  const out = [];
  const walk = (x, y, path, underMotion) => {
    if (x === y) return;
    const tx = kindOf(x);
    const ty = kindOf(y);
    if (tx !== ty) { out.push({ kind: 'type', path, ref: x, head: y, motion: underMotion }); return; }
    if (tx === 'array') {
      if (x.length !== y.length) out.push({ kind: 'length', path: `${path}.length`, ref: x.length, head: y.length, motion: underMotion });
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) walk(x[i], y[i], `${path}[${i}]`, underMotion);
      return;
    }
    if (tx === 'object') {
      for (const key of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
        const nextMotion = underMotion || MOTION_KEYS.has(key);
        if (!(key in x)) { out.push({ kind: 'added', path: `${path}.${key}`, ref: undefined, head: y[key], motion: nextMotion }); continue; }
        if (!(key in y)) { out.push({ kind: 'removed', path: `${path}.${key}`, ref: x[key], head: undefined, motion: nextMotion }); continue; }
        walk(x[key], y[key], `${path}.${key}`, nextMotion);
      }
      return;
    }
    out.push({ kind: 'value', path, ref: x, head: y, motion: underMotion });
  };
  walk(a, b, '$', false);
  return out;
}

function diffTraceCounts(a, b) {
  const at = (a && a.types) || {};
  const bt = (b && b.types) || {};
  const out = [];
  for (const type of [...new Set([...Object.keys(at), ...Object.keys(bt)])].sort()) {
    const x = at[type] || 0;
    const y = bt[type] || 0;
    if (x !== y) out.push({ type, ref: x, head: y });
  }
  return out;
}

function groupByTop(diffs) {
  const counts = new Map();
  for (const d of diffs) {
    const top = d.path.split('.').slice(0, 2).join('.').replace(/\[\d+\]$/, '[]');
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  return [...counts.entries()].sort((p, q) => q[1] - p[1]);
}

function kindOf(v) {
  return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
}

function brief(v) {
  if (v === undefined) return '(absent)';
  const s = JSON.stringify(v);
  return s == null ? String(v) : s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

function readOption(name) {
  const prefix = `${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || null : null;
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}
