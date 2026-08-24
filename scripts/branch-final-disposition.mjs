#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'design/program/branch-consolidation';
const TOPOLOGY = `${ROOT}/topology.json`;
const SAFE = `${ROOT}/safe-synthesis.json`;
const PRIORITY = `${ROOT}/priority-ports.json`;
const ORPHAN_LEDGER = 'design/program/ORPHAN_HARVEST_LEDGER.md';

const OPEN_PR_BY_BRANCH = Object.freeze({
  'codex/tactical-map-second-generation': 98,
  'intro-cold-open-redesign': 97,
  'remove-overheating-systems': 96,
  'arcade-core-plans': 95,
  'agent/chatgpt-pq018-implementation-20260724': 90,
  'agent/visual-asset-production-standard': 89,
  'fix/intentional-enemy-maneuvers': 88,
  'codex/authored-hull-glbs-20260621': 4,
});

const EXPLICIT_REJECTIONS = new Map([
  ['codex/ac07-massline-honesty', 'Later owner direction requires the expressive massline flourish this branch removed.'],
  ['codex/ac10-combat-pacing', 'Planner-bypass ambush and pacing policy were explicitly rejected by the recovery ledger.'],
  ['agent/chatgpt-pq018-implementation-20260724', 'Temporary release transport explicitly marked do not merge.'],
  ['codex/authored-hull-glbs-20260621', 'Bootstrap/generator transport does not contain the promised accepted authored hull outcome.'],
  ['codex/arcade-core-20', 'Closure/transport branch, not a distinct product outcome.'],
]);

const SUPERSEDED = new Map([
  ['fix/intentional-enemy-maneuvers', 'Current master contains the intentional-flight core plus later contact-index, avoidance, and heavy/capital hardening.'],
  ['agent/visual-asset-production-standard', 'Current master contains the visual-asset standard with later camera and acceptance requirements.'],
]);

const ASSET_RE = /(?:^assets\/|\.(?:blend|glb|gltf|ktx2|png|jpe?g|webp|gif|wav|ogg|mp3|flac|zip|gz|7z|bin|wasm|woff2?|ttf|otf)$)/i;
const DOC_RE = /^(?:design|docs)\//;
const SUPPORT_RE = /^(?:test|scripts|\.github\/workflows)\//;

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function normalizeDisposition(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const topology = readJson(TOPOLOGY);
if (!topology) throw new Error(`${TOPOLOGY} missing`);
const safe = readJson(SAFE, { applied: [], skipped: [] });
const priority = readJson(PRIORITY, { results: [] });
const orphanText = existsSync(ORPHAN_LEDGER) ? readFileSync(ORPHAN_LEDGER, 'utf8') : '';

const safeApplied = new Map((safe.applied || []).map((row) => [row.branch, row]));
const safeSkipped = new Map((safe.skipped || []).map((row) => [row.branch, row]));
const priorityByBranch = new Map((priority.results || []).map((row) => [row.branch, row]));

function ledgerEvidence(branch) {
  const index = orphanText.indexOf(branch);
  if (index < 0) return null;
  const slice = orphanText.slice(Math.max(0, index - 420), Math.min(orphanText.length, index + branch.length + 900));
  const upper = slice.toUpperCase();
  let disposition = null;
  if (/\bDROP\b|ALREADY MERGED|ALREADY LIVE|SUPERSEDED/.test(upper)) disposition = 'DROP_LEDGERED';
  else if (/\bPORT\b|\bMERGE\b/.test(upper)) disposition = 'PORT_CANDIDATE';
  else if (/CHECKPOINT|PRESERVE|REVIEW/.test(upper)) disposition = 'PRESERVE_REVIEW';
  return {
    disposition,
    excerpt: slice.replace(/\s+/g, ' ').trim().slice(0, 600),
  };
}

function classify(row) {
  const branch = row.branch;
  const pr = OPEN_PR_BY_BRANCH[branch] || null;
  const base = {
    branch,
    head: row.head,
    committedAt: row.committedAt,
    nearestNamedAncestor: row.nearestNamedAncestor,
    sliceCommitCount: row.sliceCommitCount,
    sliceFileCount: row.sliceFileCount,
    openPr: pr,
    files: row.sliceFiles.map((file) => file.path),
  };

  if (row.sliceOutcomeContained) {
    return { ...base, disposition: 'DROP_ALREADY_CONTAINED', reason: 'The branch-specific final outcome is already present on current master.' };
  }
  if (safeApplied.has(branch)) {
    return { ...base, disposition: 'PORTED_SAFE', reason: 'The complete disjoint branch-specific slice was transplanted onto the integration branch.' };
  }

  const priorityResult = priorityByBranch.get(branch);
  if (priorityResult?.status === 'ported') {
    return { ...base, disposition: 'PORTED_PRIORITY', reason: priorityResult.reason || 'Priority donor ported and validated.' };
  }
  if (priorityResult?.status === 'drop') {
    return { ...base, disposition: 'DROP_PRIORITY_CONTAINED', reason: priorityResult.reason || 'Priority donor already contained.' };
  }
  if (EXPLICIT_REJECTIONS.has(branch)) {
    return { ...base, disposition: 'DROP_REJECTED_OR_TRANSPORT', reason: EXPLICIT_REJECTIONS.get(branch) };
  }
  if (SUPERSEDED.has(branch)) {
    return { ...base, disposition: 'DROP_SUPERSEDED', reason: SUPERSEDED.get(branch) };
  }
  if (/^backup\//.test(branch)) {
    return { ...base, disposition: 'DROP_BACKUP_CONTAINED_OR_HISTORICAL', reason: 'Historical backup pointer; useful evidence remains in Git history, not a merge candidate.' };
  }
  if (/^land\/stale-/.test(branch)) {
    return { ...base, disposition: 'DROP_STALE_TRANSPORT', reason: 'Explicit stale-tree transport branch.' };
  }
  if (/^codex\/delegation-base/.test(branch)) {
    return { ...base, disposition: 'DROP_DELEGATION_BASE', reason: 'Delegation scaffold, not an independently shippable product outcome.' };
  }

  const ledger = ledgerEvidence(branch);
  if (ledger?.disposition === 'DROP_LEDGERED') {
    return { ...base, disposition: 'DROP_LEDGERED', reason: 'Existing orphan-harvest evidence records the outcome as merged, live, superseded, or rejected.', ledgerExcerpt: ledger.excerpt };
  }

  const held = priorityResult?.status === 'held'
    ? priorityResult.reason
    : safeSkipped.get(branch)?.reason;
  const hasAssets = row.sliceFiles.some((file) => ASSET_RE.test(file.path));
  const docsOnly = row.sliceFiles.length > 0 && row.sliceFiles.every((file) => DOC_RE.test(file.path));
  const supportOnly = row.sliceFiles.length > 0 && row.sliceFiles.every((file) => SUPPORT_RE.test(file.path));

  if (hasAssets) {
    return { ...base, disposition: 'PRESERVE_ASSET_DONOR', reason: held || 'Binary/authored asset outcomes require visual and representative-scene acceptance before wiring.' };
  }
  if (supportOnly) {
    return { ...base, disposition: 'PRESERVE_SUPPORT_DONOR', reason: held || 'Standalone workflow/test/checker changes do not constitute a product outcome without the matching implementation.' };
  }
  if (docsOnly) {
    return { ...base, disposition: 'ADAPT_DOCUMENT_AUTHORITY', reason: held || 'Unique documentation requires reconciliation with current vision and program authority before becoming normative.' };
  }
  if (ledger?.disposition === 'PORT_CANDIDATE') {
    return { ...base, disposition: 'ADAPT_LEDGER_PORT_CANDIDATE', reason: held || 'Existing recovery evidence identifies useful work, but current-master collisions require a semantic port.', ledgerExcerpt: ledger.excerpt };
  }
  if (ledger?.disposition === 'PRESERVE_REVIEW') {
    return { ...base, disposition: 'PRESERVE_REVIEW', reason: held || 'Existing recovery evidence intentionally preserves this as a checkpoint pending product review.', ledgerExcerpt: ledger.excerpt };
  }
  return {
    ...base,
    disposition: priorityResult?.status === 'held' ? 'ADAPT_PRIORITY_CONFLICT' : 'ADAPT_CURRENT_ARCHITECTURE',
    reason: held || 'Unique runtime/product changes overlap newer master work and must be ported semantically rather than merged by history.',
  };
}

const rows = topology.rows
  .filter((row) => row.branch !== 'master')
  .map(classify)
  .sort((a, b) => a.branch.localeCompare(b.branch));

const counts = {};
for (const row of rows) counts[row.disposition] = (counts[row.disposition] || 0) + 1;
const report = {
  schema: 1,
  generatedAt: new Date().toISOString(),
  master: topology.master,
  integrationHead: priority.integrationHead || null,
  branchCount: rows.length,
  counts,
  branches: rows,
};
mkdirSync(ROOT, { recursive: true });
writeFileSync(`${ROOT}/all-branch-dispositions.json`, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# All-branch consolidation dispositions',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `Remote branches reviewed: **${rows.length}**`,
  '',
  '## Totals',
  '',
  '| Disposition | Count |',
  '|---|---:|',
  ...Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => `| ${name} | ${count} |`),
  '',
  '## Branch ledger',
  '',
  '| Branch | PR | Slice | Disposition | Reason |',
  '|---|---:|---:|---|---|',
];
for (const row of rows) {
  md.push(`| \`${row.branch}\` | ${row.openPr ? `#${row.openPr}` : '—'} | ${row.sliceCommitCount} commit(s), ${row.sliceFileCount} path(s) | **${row.disposition}** | ${String(row.reason).replaceAll('|', '\\|')} |`);
}
writeFileSync(`${ROOT}/ALL_BRANCH_DISPOSITIONS.md`, `${md.join('\n')}\n`);

const unresolved = rows.filter((row) => /^(?:ADAPT|PRESERVE)/.test(row.disposition));
writeFileSync(`${ROOT}/manual-review-queue.json`, `${JSON.stringify({ generatedAt: report.generatedAt, count: unresolved.length, branches: unresolved }, null, 2)}\n`);

console.log(JSON.stringify({ branchCount: rows.length, counts, unresolved: unresolved.length }, null, 2));
