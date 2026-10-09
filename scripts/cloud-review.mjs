#!/usr/bin/env node
// PR #221's item ledger. Git supplies coverage; people supply quality judgments.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const ledgerPath = new URL('../design/program/world-depth-2026-10-02/REVIEW_LEDGER.json', import.meta.url);
const args = process.argv.slice(2);
const command = args.shift() || 'status';
const ref = args.shift() || 'HEAD';
if (!['status', 'sync'].includes(command) || args.length) {
  throw new Error('Usage: node scripts/cloud-review.mjs [status|sync] [committed-ref]');
}
const git = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
const head = git('rev-parse', '--verify', `${ref}^{commit}`).trim();
if (command === 'sync') {
  const branchHead = git('rev-parse', '--verify', `refs/remotes/origin/${ledger.branch}^{commit}`).trim();
  if (head !== branchHead) throw new Error(`Sync only the fetched PR branch head: fetch origin refs/heads/${ledger.branch}:refs/remotes/origin/${ledger.branch}, then sync origin/${ledger.branch}`);
}
// A rewrite needs explicit reconciliation, never a silent reset of completed work.
git('merge-base', '--is-ancestor', ledger.observedHead, head);
const tree = new Map(git('ls-tree', '-rz', '--full-tree', head).split('\0').filter(Boolean).map(row => {
  const tab = row.indexOf('\t');
  return [row.slice(tab + 1), row.slice(0, tab).split(' ')[2]];
}));
const delta = git('diff', '--name-only', '-z', ledger.base, head).split('\0').filter(Boolean);
const controls = new Set(ledger.controlPaths);
const commitRows = git('log', '--reverse', '--format=%H%x00%s', `${ledger.observedHead}..${head}`)
  .trim().split('\n').filter(Boolean).map(line => {
    const [sha, subject] = line.split('\0');
    const paths = git('diff-tree', '--no-commit-id', '--name-only', '-r', '-m', '-z', sha).split('\0').filter(Boolean);
    return { sha, subject, paths };
  });
// Include transient files: add then delete between observations is still cloud work.
const candidates = new Set([...Object.keys(ledger.paths), ...delta, ...commitRows.flatMap(row => row.paths)]
  .filter(p => !controls.has(p)));
const rules = ledger.items.map(item => [item.id, item.match.map(pattern => new RegExp(pattern))]);
const classify = path => rules.filter(([, patterns]) => patterns.some(pattern => pattern.test(path))).map(([id]) => id);
const changes = [];
const unknown = [];
for (const path of [...candidates].sort()) {
  const prior = ledger.paths[path];
  const blob = tree.get(path) || null; // Tombstones remain visible after deletion.
  const items = prior?.items || classify(path);
  if (!items.length) unknown.push(path);
  if (!prior || prior.blob !== blob) changes.push({ path, blob, items });
}
const commits = commitRows.map(({ sha, subject, paths }) => {
    return { sha, subject, items: [...new Set(paths.filter(p => !controls.has(p)).flatMap(p => ledger.paths[p]?.items || classify(p)))].sort(),
      controlOnly: paths.length > 0 && paths.every(p => controls.has(p)) };
  });

if (command === 'sync') {
  // Refuse unassigned new work before writing. Add an item/match rule, then sync again.
  if (unknown.length) {
    console.error('Unassigned paths (add a specific item before syncing):\n' + unknown.join('\n'));
    process.exitCode = 2;
  } else {
    for (const change of changes) {
      ledger.paths[change.path] = { blob: change.blob, items: change.items };
      for (const id of change.items) {
        const item = ledger.items.find(row => row.id === id);
        if (item.phase === 'done') item.phase = 'changed';
        // Preserve previous reviews/fixes. Changed items need a fresh scoped judgment.
      }
    }
    ledger.commits.push(...commits);
    ledger.observedHead = head;
    ledger.paths = Object.fromEntries(Object.entries(ledger.paths).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + '\n');
  }
}

console.log(`PR #${ledger.pr}: observed ${ledger.observedHead.slice(0, 12)}, candidate ${head.slice(0, 12)}`);
console.log(`${Object.keys(ledger.paths).length} tracked paths; ${ledger.commits.length} inventoried commits; ${changes.length} path changes; ${unknown.length} unassigned paths`);
for (const item of ledger.items) {
  const currentPaths = [...candidates].filter(path => (ledger.paths[path]?.items || classify(path)).includes(item.id));
  const changed = changes.filter(change => change.items.includes(item.id));
  const completion = item.completion;
  const validBlobs = completion?.blobs && typeof completion.blobs === 'object' && !Array.isArray(completion.blobs);
  const stale = validBlobs && currentPaths.some(path => !Object.hasOwn(completion.blobs, path) ||
    completion.blobs[path] !== (tree.get(path) || null));
  const invalidDone = item.phase === 'done' && (!completion || !completion.expansion || !completion.verification ||
    !completion.critic || !completion.fixCommit || !completion.reviewedBy || !item.inspection ||
    !validBlobs || !Object.keys(completion.blobs).length);
  const verdict = invalidDone ? 'INVALID DONE' : stale ? 'CHANGED' : changed.length ? `${item.phase} + delta` : item.phase;
  console.log(`${item.id.padEnd(25)} ${verdict.padEnd(18)} ${item.title}`);
  if (stale || invalidDone) process.exitCode = 2;
}
if (unknown.length) {
  if (command !== 'sync') console.error('Unassigned paths:\n' + unknown.join('\n'));
  process.exitCode = 2;
}
// This command never marks an item inspected, improved, accepted, or done.
