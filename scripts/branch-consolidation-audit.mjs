#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const INTEGRATION_BRANCH = 'integration/all-branches-20260824';
const OUT_DIR = 'design/program/branch-consolidation';
const MAX_FILE_PATHS = 240;
const MAX_UNIQUE_COMMITS = 80;

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
    const parts = line.split('\t');
    const status = parts.shift() || '?';
    const path = parts.length > 1 ? `${parts[0]} -> ${parts[1]}` : (parts[0] || '');
    return { status, path };
  });
}

function classify(branch) {
  if (branch.ahead === 0) return { disposition: 'DROP', reason: 'branch tip is an ancestor of current master' };
  if (branch.patchUnique === 0) return { disposition: 'DROP', reason: 'all branch patches are already patch-equivalent in current master' };
  if (/^(backup\/|land\/stale-|codex\/delegation-base|claude\/session-|agent\/chatgpt-async-canary)/.test(branch.name)) {
    return { disposition: 'PRESERVE_REVIEW', reason: 'transport, backup, or coordination ref with unique commits; never raw-merge' };
  }
  if (/(transport|bootstrap|readiness|integration-review|validation|probe|check|handoff|standard|plan|roadmap|brainstorm)/i.test(branch.name)) {
    return { disposition: 'REVIEW_ADAPT', reason: 'unique planning, validation, transport, or standards work requires current-authority review' };
  }
  return { disposition: 'REVIEW_PORT', reason: 'contains patches absent from current master' };
}

const master = git(['rev-parse', REMOTE_MASTER]);
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
  const patchUnique = ahead === 0 ? 0 : integer(git([
    'rev-list', '--right-only', '--cherry-pick', '--no-merges', '--count', `${REMOTE_MASTER}...${ref}`,
  ]));
  const patchEquivalent = Math.max(0, ahead - patchUnique);
  const mergeBase = git(['merge-base', REMOTE_MASTER, ref]);
  const fileRows = parseNameStatus(git(['diff', '--name-status', `${mergeBase}..${ref}`]));
  const rawDelta = git(['diff-tree', '-r', '--no-commit-id', '--raw', mergeBase, ref]);
  const deltaHash = createHash('sha256').update(rawDelta).digest('hex');
  const shortStat = git(['diff', '--shortstat', `${mergeBase}..${ref}`]);
  const uniqueCommitRows = patchUnique === 0 ? [] : safeLines(git([
    'log', '--format=%H%x09%s', '--right-only', '--cherry-pick', '--no-merges',
    `${REMOTE_MASTER}...${ref}`, `--max-count=${MAX_UNIQUE_COMMITS}`,
  ])).map((line) => {
    const [sha, ...message] = line.split('\t');
    return { sha, subject: message.join('\t') };
  });

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
    patchUnique,
    patchEquivalent,
    changedFileCount: fileRows.length,
    filesTruncated: fileRows.length > MAX_FILE_PATHS,
    files: fileRows.slice(0, MAX_FILE_PATHS),
    shortStat,
    deltaHash,
    uniqueCommitsTruncated: patchUnique > MAX_UNIQUE_COMMITS,
    uniqueCommits: uniqueCommitRows,
  };
  Object.assign(branch, classify(branch));
  branches.push(branch);
}

const duplicateGroups = [...Map.groupBy(
  branches.filter((branch) => branch.patchUnique > 0),
  (branch) => branch.deltaHash,
).entries()]
  .filter(([, group]) => group.length > 1)
  .map(([deltaHash, group]) => ({
    deltaHash,
    branches: group.map((branch) => branch.name),
  }));

const candidates = branches
  .filter((branch) => branch.patchUnique > 0)
  .sort((a, b) => b.committedAt.localeCompare(a.committedAt) || a.name.localeCompare(b.name));
const drops = branches.filter((branch) => branch.disposition === 'DROP');
const counts = Object.fromEntries(
  [...Map.groupBy(branches, (branch) => branch.disposition).entries()]
    .map(([key, values]) => [key, values.length]),
);

const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  repository: 'coldshalamov/SpaceFace',
  integrationBranch: INTEGRATION_BRANCH,
  master,
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
md.push(`Branches with patches absent from master: **${candidates.length}**`);
md.push(`Branches already integrated or patch-equivalent: **${drops.length}**`);
md.push('');
md.push('## Disposition counts');
md.push('');
md.push('| Disposition | Count |');
md.push('|---|---:|');
for (const [key, value] of Object.entries(counts).sort()) md.push(`| ${key} | ${value} |`);
md.push('');
md.push('## Unique candidates');
md.push('');
md.push('| Branch | Unique patches | Ahead | Behind | Files | Last commit | Proposed disposition | Tip subject |');
md.push('|---|---:|---:|---:|---:|---|---|---|');
for (const branch of candidates) {
  md.push(`| \`${escape(branch.name)}\` | ${branch.patchUnique} | ${branch.ahead} | ${branch.behind} | ${branch.changedFileCount} | ${escape(branch.committedAt.slice(0, 10))} | ${branch.disposition} | ${escape(branch.subject).slice(0, 120)} |`);
}
md.push('');
md.push('## Patch-equivalent / already contained refs');
md.push('');
for (const branch of drops) md.push(`- \`${branch.name}\` — ${branch.reason}`);
md.push('');
md.push('## Duplicate final deltas');
md.push('');
if (duplicateGroups.length === 0) md.push('_No exact duplicate net deltas detected._');
for (const group of duplicateGroups) {
  md.push(`- \`${group.deltaHash.slice(0, 12)}\`: ${group.branches.map((name) => `\`${name}\``).join(', ')}`);
}
md.push('');
md.push('Machine-readable details, bounded file manifests, and unique commit subjects are in `inventory.json` and `candidates.json`.');
writeFileSync(`${OUT_DIR}/README.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({
  master,
  audited: branches.length,
  uniqueCandidates: candidates.length,
  drops: drops.length,
  duplicateGroups: duplicateGroups.length,
}, null, 2));
