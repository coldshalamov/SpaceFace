#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const TOPOLOGY_PATH = 'design/program/branch-consolidation/topology.json';
const OUT_DIR = 'design/program/branch-consolidation';
const SELECTED = Object.freeze([
  { branch: 'codex/tactical-map-second-generation', mode: 'commits', outcome: 'native tactical radar and paused operational atlas' },
  { branch: 'intro-cold-open-redesign', mode: 'commits', outcome: 'full-bleed honest loading presentation' },
  { branch: 'arcade-core-plans', mode: 'tree', path: 'design/arcade-core', outcome: 'physics-arcade design program' },
  { branch: 'perf/exact-opening-geometry-residency', mode: 'commits', outcome: 'bounded exact opening GPU geometry residency' },
]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function git(args, options = {}) {
  const result = run('git', args, options);
  if (!result.ok) throw new Error(`git ${args.join(' ')} failed${result.stderr ? `: ${result.stderr}` : ''}`);
  return result.stdout;
}

function ref(name) {
  return `refs/remotes/origin/${name}`;
}

function changedPaths() {
  return git(['status', '--short']).split(/\r?\n/).filter(Boolean);
}

function conflictPaths() {
  const result = run('git', ['diff', '--name-only', '--diff-filter=U']);
  return result.ok ? result.stdout.split(/\r?\n/).filter(Boolean) : [];
}

function abortCherryPick() {
  run('git', ['cherry-pick', '--abort']);
}

function portCommits(row, selected) {
  const commits = Array.isArray(row?.sliceCommits) ? row.sliceCommits.map((commit) => commit.sha) : [];
  if (!commits.length) {
    return { status: 'held', reason: 'no branch-specific non-merge commits were found' };
  }

  const before = git(['rev-parse', 'HEAD']);
  const result = run('git', ['cherry-pick', ...commits]);
  if (!result.ok) {
    const conflicts = conflictPaths();
    abortCherryPick();
    const afterAbort = git(['rev-parse', 'HEAD']);
    if (afterAbort !== before) throw new Error(`failed cherry-pick for ${selected.branch} did not restore HEAD`);
    return {
      status: 'held',
      reason: 'current-master semantic conflict',
      conflicts,
      stderr: result.stderr.slice(0, 4000),
      commits,
    };
  }

  return {
    status: 'ported',
    reason: 'branch-specific commits applied cleanly to the integration line',
    commits,
    head: git(['rev-parse', 'HEAD']),
  };
}

function portTree(row, selected) {
  const treePath = selected.path;
  const branch = ref(selected.branch);
  const donorExists = run('git', ['cat-file', '-e', `${branch}:${treePath}`]).ok;
  if (!donorExists) return { status: 'held', reason: `donor path ${treePath} does not exist` };

  const masterExists = run('git', ['cat-file', '-e', `${REMOTE_MASTER}:${treePath}`]).ok;
  const headExists = run('git', ['cat-file', '-e', `HEAD:${treePath}`]).ok;
  if (masterExists || headExists) {
    return {
      status: 'held',
      reason: `${treePath} already exists on master or integration and requires authority synthesis`,
    };
  }

  const checkout = run('git', ['checkout', branch, '--', treePath]);
  if (!checkout.ok) return { status: 'held', reason: 'tree transplant failed', stderr: checkout.stderr.slice(0, 4000) };
  git(['add', '--', treePath]);
  const commit = run('git', ['commit', '-m', `docs(arcade-core): transplant current unique design program from ${selected.branch}`]);
  if (!commit.ok) return { status: 'held', reason: 'tree transplant produced no commit', stderr: commit.stderr.slice(0, 4000) };
  return {
    status: 'ported',
    reason: 'unique additive design tree transplanted without old branch history',
    path: treePath,
    head: git(['rev-parse', 'HEAD']),
    donorHead: row?.head || null,
  };
}

if (!existsSync(TOPOLOGY_PATH)) throw new Error(`${TOPOLOGY_PATH} missing`);
const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
const byBranch = new Map(topology.rows.map((row) => [row.branch, row]));
const results = [];

for (const selected of SELECTED) {
  const row = byBranch.get(selected.branch);
  if (!row) {
    results.push({ ...selected, status: 'held', reason: 'branch absent from topology' });
    continue;
  }
  if (row.sliceOutcomeContained) {
    results.push({ ...selected, status: 'drop', reason: 'branch-specific final outcome is already contained by master' });
    continue;
  }

  const result = selected.mode === 'tree'
    ? portTree(row, selected)
    : portCommits(row, selected);
  results.push({
    ...selected,
    donorHead: row.head,
    nearestNamedAncestor: row.nearestNamedAncestor,
    sliceCommitCount: row.sliceCommitCount,
    sliceFileCount: row.sliceFileCount,
    ...result,
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  master: git(['rev-parse', REMOTE_MASTER]),
  integrationHead: git(['rev-parse', 'HEAD']),
  dirtyAfterPorts: changedPaths(),
  results,
};
writeFileSync(`${OUT_DIR}/priority-ports.json`, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# Priority branch ports',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '| Donor | Outcome | Result | Reason |',
  '|---|---|---|---|',
];
for (const row of results) {
  md.push(`| \`${row.branch}\` | ${row.outcome} | **${row.status.toUpperCase()}** | ${String(row.reason || '').replaceAll('|', '\\|')} |`);
  if (row.conflicts?.length) md.push(`|  |  | Conflicts | ${row.conflicts.map((path) => `\`${path}\``).join(', ')} |`);
}
md.push('', 'A held donor is not lost or rejected. It remains named for a manual current-architecture adaptation.');
writeFileSync(`${OUT_DIR}/PRIORITY_PORTS.md`, `${md.join('\n')}\n`);

git(['add', '--sparse', '-A']);
const reportCommit = run('git', ['commit', '-m', 'chore(integration): record priority donor port results [skip ci]']);
if (!reportCommit.ok && !/nothing to commit/i.test(reportCommit.stdout + reportCommit.stderr)) {
  throw new Error(`could not commit priority port report: ${reportCommit.stderr}`);
}

console.log(JSON.stringify({
  head: git(['rev-parse', 'HEAD']),
  ported: results.filter((row) => row.status === 'ported').map((row) => row.branch),
  held: results.filter((row) => row.status === 'held').map((row) => row.branch),
  dropped: results.filter((row) => row.status === 'drop').map((row) => row.branch),
}, null, 2));
