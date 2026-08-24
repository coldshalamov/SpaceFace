#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const REMOTE_MASTER = 'refs/remotes/origin/master';
const TOPOLOGY_PATH = 'design/program/branch-consolidation/topology.json';
const OUT_DIR = 'design/program/branch-consolidation';

const HARD_DROP = new Set([
  'agent/chatgpt-pq018-implementation-20260724',
  'codex/authored-hull-glbs-20260621',
  'codex/ac07-massline-honesty',
  'codex/ac10-combat-pacing',
  'codex/arcade-core-20',
]);

const MANUAL_BRANCHES = new Set([
  'codex/tactical-map-second-generation',
  'intro-cold-open-redesign',
  'remove-overheating-systems',
  'arcade-core-plans',
  'perf/exact-opening-geometry-residency',
  'fix/intentional-enemy-maneuvers',
  'agent/visual-asset-production-standard',
]);

const HARD_DROP_PATTERNS = [
  /^backup\//,
  /^land\/stale-/,
  /^codex\/delegation-base/,
  /^agent\/chatgpt-async-canary/,
  /(?:^|\/)transport(?:-|$)/i,
];

const BINARY_OR_ASSET = /(?:^assets\/|\.(?:blend|glb|gltf|ktx2|png|jpe?g|webp|gif|wav|ogg|mp3|flac|zip|gz|7z|bin|wasm|woff2?|ttf|otf)$)/i;
const VALIDATION_ONLY = /^(?:test|scripts|\.github\/workflows)\//;
const DOC_PATH = /^(?:design|docs)\//;

function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: options.binary ? null : 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr).trim() : '';
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function gitText(args) {
  return String(git(args)).trim();
}

function entry(ref, path) {
  const text = gitText(['ls-tree', '--full-tree', ref, '--', path]);
  if (!text) return null;
  const match = /^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/.exec(text.split(/\r?\n/)[0]);
  return match ? { mode: match[1], type: match[2], sha: match[3], path: match[4] } : null;
}

function sameEntry(a, b) {
  if (!a && !b) return true;
  return !!a && !!b && a.mode === b.mode && a.type === b.type && a.sha === b.sha;
}

function branchRef(name) {
  return `refs/remotes/origin/${name}`;
}

function isHardDrop(name) {
  return HARD_DROP.has(name) || HARD_DROP_PATTERNS.some((pattern) => pattern.test(name));
}

function isAssetSlice(row) {
  return row.sliceFiles.some((file) => BINARY_OR_ASSET.test(file.path));
}

function isValidationOnly(row) {
  return row.sliceFiles.length > 0 && row.sliceFiles.every((file) => VALIDATION_ONLY.test(file.path));
}

function isDocsOnly(row) {
  return row.sliceFiles.length > 0 && row.sliceFiles.every((file) => DOC_PATH.test(file.path));
}

function ancestorUnchangedOnMaster(row, file) {
  const ancestor = row.nearestNamedAncestor?.sha;
  if (!ancestor) return false;
  return sameEntry(entry(ancestor, file.path), entry(REMOTE_MASTER, file.path));
}

function integrationAlreadyOwns(path) {
  return !sameEntry(entry('HEAD', path), entry(REMOTE_MASTER, path));
}

function sliceSafeInIsolation(row) {
  if (!row.sliceFiles.length || row.sliceOutcomeContained) return { safe: false, reason: 'empty_or_contained' };
  if (isHardDrop(row.branch)) return { safe: false, reason: 'explicit_drop' };
  if (MANUAL_BRANCHES.has(row.branch)) return { safe: false, reason: 'manual_priority_branch' };
  if (isAssetSlice(row)) return { safe: false, reason: 'asset_or_binary_requires_acceptance' };
  if (isValidationOnly(row)) return { safe: false, reason: 'validation_without_product_outcome' };

  for (const file of row.sliceFiles) {
    const branchEntry = entry(branchRef(row.branch), file.path);
    const masterEntry = entry(REMOTE_MASTER, file.path);
    const headEntry = entry('HEAD', file.path);

    if (sameEntry(branchEntry, masterEntry) || sameEntry(branchEntry, headEntry)) continue;
    if (integrationAlreadyOwns(file.path)) {
      return { safe: false, reason: `integration_already_owns:${file.path}` };
    }

    const addedIntoEmptyPath = file.status.startsWith('A') && !masterEntry;
    const cleanModification = ancestorUnchangedOnMaster(row, file);
    if (!addedIntoEmptyPath && !cleanModification) {
      return { safe: false, reason: `master_collision:${file.path}` };
    }
  }

  return { safe: true, reason: isDocsOnly(row) ? 'disjoint_docs_slice' : 'disjoint_current_compatible_slice' };
}

function independentOverlap(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branchRef(a.branch), branchRef(b.branch)], { stdio: 'ignore' });
    return false;
  } catch {}
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', branchRef(b.branch), branchRef(a.branch)], { stdio: 'ignore' });
    return false;
  } catch {}
  return true;
}

function writeBranchPath(branch, file) {
  const ref = branchRef(branch);
  const branchEntry = entry(ref, file.path);
  if (!branchEntry) {
    if (existsSync(file.path)) rmSync(file.path, { recursive: true, force: true });
    return 'deleted';
  }
  mkdirSync(dirname(file.path), { recursive: true });
  const bytes = git(['show', `${ref}:${file.path}`], { binary: true });
  writeFileSync(file.path, bytes);
  if (branchEntry.mode === '100755') chmodSync(file.path, 0o755);
  return 'written';
}

if (!existsSync(TOPOLOGY_PATH)) {
  throw new Error(`${TOPOLOGY_PATH} missing; run branch-family-topology.mjs first`);
}

const topology = JSON.parse(readFileSync(TOPOLOGY_PATH, 'utf8'));
const rows = topology.rows.filter((row) => row.branch !== 'master');
const preliminary = new Map(rows.map((row) => [row.branch, sliceSafeInIsolation(row)]));

const proposalsByPath = new Map();
for (const row of rows) {
  if (!preliminary.get(row.branch)?.safe) continue;
  for (const file of row.sliceFiles) {
    const proposals = proposalsByPath.get(file.path) || [];
    proposals.push(row);
    proposalsByPath.set(file.path, proposals);
  }
}

const overlapBlocks = new Map();
for (const [path, proposals] of proposalsByPath) {
  if (proposals.length < 2) continue;
  for (let i = 0; i < proposals.length; i += 1) {
    for (let j = i + 1; j < proposals.length; j += 1) {
      const a = proposals[i];
      const b = proposals[j];
      const aEntry = entry(branchRef(a.branch), path);
      const bEntry = entry(branchRef(b.branch), path);
      if (sameEntry(aEntry, bEntry)) continue;
      if (!independentOverlap(a, b)) continue;
      overlapBlocks.set(a.branch, `independent_overlap:${path}:${b.branch}`);
      overlapBlocks.set(b.branch, `independent_overlap:${path}:${a.branch}`);
    }
  }
}

const eligible = rows.filter((row) => preliminary.get(row.branch)?.safe && !overlapBlocks.has(row.branch));
// Parent branches must land before descendants. Commit date is the deterministic fallback for
// independent slices, which by construction do not share changed paths.
eligible.sort((a, b) => a.committedAt.localeCompare(b.committedAt) || a.branch.localeCompare(b.branch));

const applied = [];
const skipped = [];
for (const row of rows) {
  const initial = preliminary.get(row.branch);
  if (!initial?.safe) {
    skipped.push({ branch: row.branch, disposition: isHardDrop(row.branch) ? 'DROP' : 'MANUAL_REVIEW', reason: initial?.reason || 'not_safe' });
  } else if (overlapBlocks.has(row.branch)) {
    skipped.push({ branch: row.branch, disposition: 'MANUAL_REVIEW', reason: overlapBlocks.get(row.branch) });
  }
}

for (const row of eligible) {
  const changed = [];
  for (const file of row.sliceFiles) {
    const branchEntry = entry(branchRef(row.branch), file.path);
    if (sameEntry(branchEntry, entry('HEAD', file.path))) continue;
    changed.push({ path: file.path, action: writeBranchPath(row.branch, file) });
  }
  if (changed.length) {
    applied.push({
      branch: row.branch,
      head: row.head,
      nearestNamedAncestor: row.nearestNamedAncestor,
      reason: preliminary.get(row.branch).reason,
      files: changed,
    });
  } else {
    skipped.push({ branch: row.branch, disposition: 'DROP', reason: 'already_present_on_integration' });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const result = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  master: topology.master,
  appliedCount: applied.length,
  skippedCount: skipped.length,
  applied,
  skipped: skipped.sort((a, b) => a.branch.localeCompare(b.branch)),
};
writeFileSync(`${OUT_DIR}/safe-synthesis.json`, `${JSON.stringify(result, null, 2)}\n`);

const md = [
  '# Safe branch synthesis',
  '',
  `Generated: ${result.generatedAt}`,
  '',
  `Automatically ported branch-specific slices: **${applied.length}**`,
  `Held for manual review or dropped: **${skipped.length}**`,
  '',
  'The automatic pass accepts only whole slices whose paths are unchanged on current master, absent on current master, or already identical. Independent branches proposing different blobs for the same path are held. Assets, transport branches, standalone validation, and priority product branches are never auto-applied.',
  '',
  '## Automatically ported',
  '',
];
for (const row of applied) {
  md.push(`- \`${row.branch}\` — ${row.files.length} path(s), ${row.reason}`);
}
md.push('', '## Held or dropped', '');
for (const row of result.skipped) {
  md.push(`- \`${row.branch}\` — **${row.disposition}**: ${row.reason}`);
}
writeFileSync(`${OUT_DIR}/SAFE_SYNTHESIS.md`, `${md.join('\n')}\n`);

console.log(JSON.stringify({ applied: applied.length, skipped: skipped.length }, null, 2));
