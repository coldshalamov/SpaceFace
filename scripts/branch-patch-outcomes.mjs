#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const INTEGRATION_BRANCH = 'integration/all-branches-20260824';
const OUT_DIR = 'design/program/branch-consolidation';
const PATCH_ID_FILE = '/tmp/spaceface-all-patch-ids.txt';
const MAX_BRANCH_OUTCOMES = 300;
const MAX_OUTCOME_BRANCHES = 80;

function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function lines(value) {
  return String(value || '').split(/\r?\n/).filter(Boolean);
}

function computePatchIds() {
  const command = [
    'set -o pipefail;',
    'git log --all --no-merges --pretty=format:%H --patch',
    '--no-renames --no-ext-diff --no-textconv',
    '| git patch-id --stable',
    `> ${PATCH_ID_FILE}`,
  ].join(' ');
  const result = spawnSync('bash', ['-lc', command], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`global patch-id stream failed: ${String(result.stderr || '').trim()}`);
  }
}

function parseNameStatus(text) {
  return lines(text).map((line) => {
    const [status = '?', ...paths] = line.split('\t');
    return { status, path: paths.at(-1) || '' };
  }).filter((row) => row.path);
}

computePatchIds();
const patchByCommit = new Map();
const commitsByPatch = new Map();
for (const line of lines(readFileSync(PATCH_ID_FILE, 'utf8'))) {
  const [patchId, commit] = line.trim().split(/\s+/);
  if (!patchId || !commit) continue;
  patchByCommit.set(commit, patchId);
  const list = commitsByPatch.get(patchId);
  if (list) list.push(commit);
  else commitsByPatch.set(patchId, [commit]);
}

const master = git(['rev-parse', REMOTE_MASTER]);
const masterCommits = new Set(lines(git(['rev-list', '--no-merges', REMOTE_MASTER])));
const masterPatchIds = new Set();
for (const commit of masterCommits) {
  const patchId = patchByCommit.get(commit);
  if (patchId) masterPatchIds.add(patchId);
}

const refRows = lines(git([
  'for-each-ref', '--sort=refname',
  '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso8601-strict)%09%(subject)',
  'refs/remotes/origin',
]));
const branches = [];
const outcomeBranches = new Map();
const outcomeCommits = new Map();

for (const row of refRows) {
  const [short, head, committedAt, ...subjectParts] = row.split('\t');
  if (!short || short === 'origin/HEAD' || short === 'origin/master') continue;
  const name = short.replace(/^origin\//, '');
  if (name === INTEGRATION_BRANCH) continue;
  const ref = `refs/remotes/origin/${name}`;
  const commits = lines(git(['rev-list', '--no-merges', `${REMOTE_MASTER}..${ref}`]));
  const absent = new Map();
  let emptyCommitCount = 0;
  for (const commit of commits) {
    const patchId = patchByCommit.get(commit);
    if (!patchId) {
      emptyCommitCount += 1;
      continue;
    }
    if (masterPatchIds.has(patchId)) continue;
    if (!absent.has(patchId)) absent.set(patchId, commit);
    const branchList = outcomeBranches.get(patchId);
    if (branchList) branchList.add(name);
    else outcomeBranches.set(patchId, new Set([name]));
    const commitList = outcomeCommits.get(patchId);
    if (commitList) commitList.add(commit);
    else outcomeCommits.set(patchId, new Set([commit]));
  }
  branches.push({
    name,
    head,
    committedAt,
    tipSubject: subjectParts.join('\t'),
    nonMergeCommitsAbsentByAncestry: commits.length,
    patchOutcomesAbsentFromMaster: absent.size,
    emptyCommitCount,
    outcomesTruncated: absent.size > MAX_BRANCH_OUTCOMES,
    outcomes: [...absent.entries()].slice(0, MAX_BRANCH_OUTCOMES).map(([patchId, commit]) => ({ patchId, commit })),
  });
}

const outcomes = [];
for (const [patchId, branchSet] of outcomeBranches) {
  const commits = [...(outcomeCommits.get(patchId) || [])];
  const representative = commits
    .map((commit) => {
      const metadata = git(['show', '-s', '--format=%cI%x09%s', commit]).split('\t');
      return { commit, committedAt: metadata[0] || '', subject: metadata.slice(1).join('\t') };
    })
    .sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.commit.localeCompare(b.commit))[0];
  const parentCount = Number(git(['show', '-s', '--format=%P', representative.commit]).split(/\s+/).filter(Boolean).length) || 0;
  const files = parseNameStatus(git([
    'diff-tree', '--root', '-r', '--no-commit-id', '--name-status', '--no-renames', representative.commit,
  ]));
  const branchesForOutcome = [...branchSet].sort();
  outcomes.push({
    patchId,
    representativeCommit: representative.commit,
    representativeCommittedAt: representative.committedAt,
    subject: representative.subject,
    equivalentCommitCount: commits.length,
    equivalentCommits: commits.sort(),
    parentCount,
    fileCount: files.length,
    files,
    branchCount: branchesForOutcome.length,
    branchesTruncated: branchesForOutcome.length > MAX_OUTCOME_BRANCHES,
    branches: branchesForOutcome.slice(0, MAX_OUTCOME_BRANCHES),
  });
}

outcomes.sort((a, b) => b.representativeCommittedAt.localeCompare(a.representativeCommittedAt)
  || a.subject.localeCompare(b.subject));
branches.sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.name.localeCompare(b.name));

const zeroOutcomeBranches = branches.filter((branch) => branch.patchOutcomesAbsentFromMaster === 0);
const activeOutcomeBranches = branches.filter((branch) => branch.patchOutcomesAbsentFromMaster > 0);
const singletonOutcomes = outcomes.filter((outcome) => outcome.branchCount === 1);
const sharedOutcomes = outcomes.filter((outcome) => outcome.branchCount > 1);

mkdirSync(OUT_DIR, { recursive: true });
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  master,
  patchIdCommitCount: patchByCommit.size,
  masterPatchIdCount: masterPatchIds.size,
  branchCount: branches.length,
  branchCountWithNoAbsentPatchOutcome: zeroOutcomeBranches.length,
  branchCountWithAbsentPatchOutcomes: activeOutcomeBranches.length,
  absentPatchOutcomeCount: outcomes.length,
  singletonOutcomeCount: singletonOutcomes.length,
  sharedOutcomeCount: sharedOutcomes.length,
  branches,
  outcomes,
};
writeFileSync(`${OUT_DIR}/patch-outcomes.json`, `${JSON.stringify(report, null, 2)}\n`);

const esc = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const md = [
  '# Deduplicated patch outcomes',
  '',
  `Generated: ${report.generatedAt}`,
  `Current master: \`${master}\``,
  '',
  `Non-merge commits assigned stable patch IDs: **${patchByCommit.size}**`,
  `Branches with no patch absent from master: **${zeroOutcomeBranches.length}**`,
  `Branches still carrying at least one absent patch: **${activeOutcomeBranches.length}**`,
  `Distinct absent patch outcomes across all branches: **${outcomes.length}**`,
  '',
  'This is the exact deduplication layer: an old commit is removed when an equivalent patch already exists anywhere in current master, even when its SHA and final file blob differ.',
  '',
  '## Branches with absent patch outcomes',
  '',
  '| Branch | Absent outcomes | Last commit | Tip subject |',
  '|---|---:|---|---|',
];
for (const branch of activeOutcomeBranches) {
  md.push(`| \`${esc(branch.name)}\` | ${branch.patchOutcomesAbsentFromMaster} | ${branch.committedAt.slice(0, 10)} | ${esc(branch.tipSubject).slice(0, 130)} |`);
}
md.push('', '## Branches fully patch-equivalent to master', '');
for (const branch of zeroOutcomeBranches) md.push(`- \`${branch.name}\``);
md.push('', '## Distinct absent patch outcomes', '');
md.push('| Date | Patch | Branches | Files | Subject |');
md.push('|---|---|---:|---:|---|');
for (const outcome of outcomes) {
  md.push(`| ${outcome.representativeCommittedAt.slice(0, 10)} | \`${outcome.patchId.slice(0, 12)}\` | ${outcome.branchCount} | ${outcome.fileCount} | ${esc(outcome.subject).slice(0, 150)} |`);
}
md.push('', 'Complete branch membership, equivalent commits, and path manifests are in `patch-outcomes.json`.');
writeFileSync(`${OUT_DIR}/PATCH_OUTCOMES.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  master,
  patchIdCommitCount: patchByCommit.size,
  branches: branches.length,
  zeroOutcomeBranches: zeroOutcomeBranches.length,
  activeOutcomeBranches: activeOutcomeBranches.length,
  absentPatchOutcomes: outcomes.length,
}, null, 2));
