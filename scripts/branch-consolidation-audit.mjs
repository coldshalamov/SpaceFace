#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const INTEGRATION_BRANCH = 'integration/all-branches-20260824';
const OUT_DIR = 'design/program/branch-consolidation';
const MAX_FILE_PATHS = 320;
const MAX_UNIQUE_COMMITS = 100;
const TREE_PATH_CHUNK = 120;

function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function integer(value) {
  const parsed = Number.parseInt(String(value || '0').trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeLines(value) {
  return String(value || '').split(/\r?\n/).filter(Boolean);
}

function parseNameStatus(text) {
  return safeLines(text).map((line) => {
    const [status = '?', ...parts] = line.split('\t');
    return { status, path: parts.at(-1) || '' };
  }).filter((row) => row.path);
}

function parseTree(text) {
  const map = new Map();
  for (const line of safeLines(text)) {
    const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/.exec(line);
    if (!match) continue;
    map.set(match[4], { mode: match[1], type: match[2], sha: match[3] });
  }
  return map;
}

function treeEntriesForPaths(ref, paths) {
  const result = new Map();
  for (let i = 0; i < paths.length; i += TREE_PATH_CHUNK) {
    const chunk = paths.slice(i, i + TREE_PATH_CHUNK);
    if (!chunk.length) continue;
    const rows = parseTree(git(['ls-tree', '--full-tree', ref, '--', ...chunk]));
    for (const [path, entry] of rows) result.set(path, entry);
  }
  return result;
}

function sameEntry(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.mode === b.mode && a.type === b.type && a.sha === b.sha;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

function categoryFor(files) {
  const paths = files.map((row) => row.path);
  if (!paths.length) return 'empty';
  const every = (predicate) => paths.every(predicate);
  if (every((path) => /^(design|docs)\//.test(path) || /(^|\/)README\.md$/.test(path))) return 'docs';
  if (every((path) => /^test\//.test(path) || /^scripts\//.test(path) || /^\.github\/workflows\//.test(path))) return 'validation';
  if (every((path) => /^assets\//.test(path) || /\.(glb|gltf|blend|ktx2|png|jpe?g|webp|wav|ogg|mp3)$/i.test(path))) return 'assets';
  if (every((path) => /^(design|docs|test|scripts|\.github)\//.test(path))) return 'support';
  return 'runtime';
}

function classify(branch) {
  if (branch.ahead === 0) {
    return { disposition: 'DROP', reason: 'branch tip is an ancestor of current master' };
  }
  if (branch.exactOutcomeContained) {
    return { disposition: 'DROP', reason: 'every path changed by the branch already has the same final blob/deletion in current master' };
  }
  if (/^(backup\/|land\/stale-|codex\/delegation-base|claude\/session-|agent\/chatgpt-async-canary)/.test(branch.name)) {
    return { disposition: 'PRESERVE_REVIEW', reason: 'transport, backup, or coordination ref with a non-contained final delta; never raw-merge' };
  }
  if (/(transport|bootstrap|readiness|integration-review|validation|probe|check|handoff|standard|plan|roadmap|brainstorm)/i.test(branch.name)) {
    return { disposition: 'REVIEW_ADAPT', reason: 'planning, validation, transport, or standards outcome requires current-authority synthesis' };
  }
  if (branch.category === 'assets') {
    return { disposition: 'REVIEW_ADAPT', reason: 'unique asset donor requires identity, manifest, runtime, performance, and visual-acceptance review' };
  }
  return { disposition: 'REVIEW_PORT', reason: 'branch has a final path/blob outcome absent from current master' };
}

const master = git(['rev-parse', REMOTE_MASTER]);
const masterTree = parseTree(git(['ls-tree', '-r', '--full-tree', REMOTE_MASTER]));
const refs = safeLines(git([
  'for-each-ref',
  '--sort=refname',
  '--format=%(refname:short)%09%(objectname)%09%(committerdate:iso8601-strict)%09%(subject)',
  'refs/remotes/origin',
]));

const branches = [];
for (const row of refs) {
  const [shortRef, head, committedAt, ...subjectParts] = row.split('\t');
  if (!shortRef || shortRef === 'origin/HEAD' || shortRef === 'origin/master') continue;
  const name = shortRef.replace(/^origin\//, '');
  if (name === INTEGRATION_BRANCH) continue;
  const ref = `refs/remotes/origin/${name}`;
  const [behindText = '0', aheadText = '0'] = git([
    'rev-list', '--left-right', '--count', `${REMOTE_MASTER}...${ref}`,
  ]).split(/\s+/);
  const behind = integer(behindText);
  const ahead = integer(aheadText);
  const mergeBase = git(['merge-base', REMOTE_MASTER, ref]);
  const fileRows = parseNameStatus(git([
    'diff-tree', '-r', '--no-commit-id', '--name-status', '--no-renames', mergeBase, ref,
  ]));
  const paths = [...new Set(fileRows.map((entry) => entry.path))];
  const branchEntries = treeEntriesForPaths(ref, paths);
  const masterChangedPaths = new Set(safeLines(git([
    'diff-tree', '-r', '--no-commit-id', '--name-only', '--no-renames', mergeBase, REMOTE_MASTER,
  ])));

  let matchingOutcomePaths = 0;
  let differentOutcomePaths = 0;
  let collisionPathCount = 0;
  let addedOnlyToMaster = true;
  const pathEvidence = [];
  for (const file of fileRows) {
    const branchEntry = branchEntries.get(file.path) || null;
    const masterEntry = masterTree.get(file.path) || null;
    const matchesMaster = sameEntry(branchEntry, masterEntry);
    if (matchesMaster) matchingOutcomePaths += 1;
    else differentOutcomePaths += 1;
    if (masterChangedPaths.has(file.path)) collisionPathCount += 1;
    if (!(file.status.startsWith('A') && !masterEntry)) addedOnlyToMaster = false;
    pathEvidence.push({
      ...file,
      matchesMaster,
      changedOnMasterSinceBranchBase: masterChangedPaths.has(file.path),
      branchBlob: branchEntry && branchEntry.sha,
      masterBlob: masterEntry && masterEntry.sha,
    });
  }

  const exactOutcomeContained = ahead === 0 || (fileRows.length > 0 && differentOutcomePaths === 0);
  const rawDelta = git(['diff-tree', '-r', '--no-commit-id', '--raw', '--no-renames', mergeBase, ref]);
  const deltaHash = createHash('sha256').update(rawDelta).digest('hex');
  const uniqueCommitRows = ahead === 0 ? [] : safeLines(git([
    'log', '--format=%H%x09%s', '--no-merges', `${REMOTE_MASTER}..${ref}`, `--max-count=${MAX_UNIQUE_COMMITS}`,
  ])).map((line) => {
    const [sha, ...message] = line.split('\t');
    return { sha, subject: message.join('\t') };
  });

  const statusCounts = {};
  for (const file of fileRows) {
    const code = file.status[0] || '?';
    statusCounts[code] = (statusCounts[code] || 0) + 1;
  }

  const branch = {
    name,
    ref,
    head,
    committedAt,
    subject: subjectParts.join('\t'),
    masterAtAudit: master,
    mergeBase,
    ahead,
    behind,
    changedFileCount: fileRows.length,
    matchingOutcomePaths,
    differentOutcomePaths,
    exactOutcomeContained,
    collisionPathCount,
    addedOnlyToMaster: fileRows.length > 0 && addedOnlyToMaster,
    category: categoryFor(fileRows),
    statusCounts,
    filesTruncated: pathEvidence.length > MAX_FILE_PATHS,
    files: pathEvidence.slice(0, MAX_FILE_PATHS),
    deltaHash,
    uniqueCommitsTruncated: ahead > MAX_UNIQUE_COMMITS,
    uniqueCommits: uniqueCommitRows,
  };
  Object.assign(branch, classify(branch));
  branches.push(branch);
}

const candidates = branches
  .filter((branch) => branch.disposition !== 'DROP')
  .sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.name.localeCompare(b.name));
const drops = branches.filter((branch) => branch.disposition === 'DROP');
const duplicateGroups = [...groupBy(candidates, (branch) => branch.deltaHash).entries()]
  .filter(([, group]) => group.length > 1)
  .map(([deltaHash, group]) => ({ deltaHash, branches: group.map((branch) => branch.name) }));
const counts = Object.fromEntries(
  [...groupBy(branches, (branch) => branch.disposition).entries()]
    .map(([key, values]) => [key, values.length]),
);

const report = {
  schema: 2,
  generatedAt: new Date().toISOString(),
  repository: 'coldshalamov/SpaceFace',
  integrationBranch: INTEGRATION_BRANCH,
  master,
  evidence: 'commit ancestry plus exact tip-to-tip path/blob identity; no asset blob materialization',
  branchCount: branches.length,
  counts,
  uniqueCandidateCount: candidates.length,
  dropCount: drops.length,
  duplicateGroups,
  branches,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/inventory.json`, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(`${OUT_DIR}/candidates.json`, `${JSON.stringify({
  generatedAt: report.generatedAt,
  master,
  candidates,
  duplicateGroups,
}, null, 2)}\n`);

const escape = (value) => String(value || '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
const md = [];
md.push('# Branch consolidation inventory');
md.push('');
md.push(`Generated: ${report.generatedAt}`);
md.push(`Current master: \`${master}\``);
md.push(`Remote branches audited: **${branches.length}**`);
md.push(`Branches with a non-contained final outcome: **${candidates.length}**`);
md.push(`Branches already integrated or exact-final-state contained: **${drops.length}**`);
md.push('');
md.push('Evidence: commit ancestry plus exact blob/deletion identity for every path changed by each branch.');
md.push('');
md.push('## Disposition counts');
md.push('');
md.push('| Disposition | Count |');
md.push('|---|---:|');
for (const [key, value] of Object.entries(counts).sort()) md.push(`| ${key} | ${value} |`);
md.push('');
md.push('## Surviving candidates');
md.push('');
md.push('| Branch | Ahead | Behind | Files | Collisions | Category | Last commit | Proposed disposition | Tip subject |');
md.push('|---|---:|---:|---:|---:|---|---|---|---|');
for (const branch of candidates) {
  md.push(`| \`${escape(branch.name)}\` | ${branch.ahead} | ${branch.behind} | ${branch.changedFileCount} | ${branch.collisionPathCount} | ${branch.category} | ${escape(branch.committedAt.slice(0, 10))} | ${branch.disposition} | ${escape(branch.subject).slice(0, 120)} |`);
}
md.push('');
md.push('## Already contained refs');
md.push('');
for (const branch of drops) md.push(`- \`${branch.name}\` — ${branch.reason}`);
md.push('');
md.push('## Duplicate branch deltas');
md.push('');
if (duplicateGroups.length === 0) md.push('_No exact duplicate net deltas detected among surviving candidates._');
for (const group of duplicateGroups) {
  md.push(`- \`${group.deltaHash.slice(0, 12)}\`: ${group.branches.map((name) => `\`${name}\``).join(', ')}`);
}
md.push('');
md.push('Machine-readable path/blob evidence and bounded commit manifests are in `inventory.json` and `candidates.json`.');
writeFileSync(`${OUT_DIR}/README.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  master,
  audited: branches.length,
  candidates: candidates.length,
  drops: drops.length,
  duplicateGroups: duplicateGroups.length,
}, null, 2));
