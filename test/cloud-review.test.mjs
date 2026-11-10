import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

test('cloud review preserves incremental coverage and never silently accepts stale work', () => {
  // Tiny synthetic Git history, not a copy/check-out of the game.
  const root = mkdtempSync(join(tmpdir(), 'sf-cloud-review-'));
  const ledgerFile = join(root, 'design/program/world-depth-2026-10-02/REVIEW_LEDGER.json');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const run = (command = 'status', ref = 'HEAD') => spawnSync(process.execPath, ['scripts/cloud-review.mjs', command, ref], { cwd: root, encoding: 'utf8' });
  const save = ledger => writeFileSync(ledgerFile, JSON.stringify(ledger));
  const load = () => JSON.parse(readFileSync(ledgerFile, 'utf8'));
  const commit = message => { git('add', '--', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const fetchPin = () => git('update-ref', 'refs/remotes/origin/cloud-fixture', git('rev-parse', 'HEAD'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    mkdirSync(join(root, 'design/program/world-depth-2026-10-02'), { recursive: true });
    copyFileSync(fileURLToPath(new URL('../scripts/cloud-review.mjs', import.meta.url)), join(root, 'scripts/cloud-review.mjs'));
    git('init', '-q');
    writeFileSync(join(root, 'work.txt'), 'groundwork');
    const base = commit('base');
    const originalBlob = git('rev-parse', 'HEAD:work.txt');
    const ledger = { pr: 221, branch: 'cloud-fixture', base, observedHead: base,
      controlPaths: ['scripts/cloud-review.mjs', 'design/program/world-depth-2026-10-02/REVIEW_LEDGER.json'],
      items: [{ id: 'WORK', title: 'one deliverable', match: ['^work\\.txt$'], phase: 'done', inspection: 'Primary inspected source',
        completion: { expansion: 'authored behavior', verification: 'focused route passed', critic: 'material findings fixed',
          fixCommit: base, reviewedBy: 'Primary', blobs: { 'work.txt': originalBlob } }, history: [] }],
      paths: { 'work.txt': { blob: originalBlob, items: ['WORK'] } }, commits: [] };
    save(ledger); fetchPin();
    const initialBytes = readFileSync(ledgerFile, 'utf8');
    assert.equal(run().status, 0);
    assert.equal(readFileSync(ledgerFile, 'utf8'), initialBytes, 'status is read-only');

    writeFileSync(join(root, 'transient.txt'), 'later deleted'); commit('add transient');
    rmSync(join(root, 'transient.txt')); commit('delete transient'); fetchPin();
    const unknown = run('sync');
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /transient\.txt/);
    assert.equal(readFileSync(ledgerFile, 'utf8'), initialBytes, 'unassigned work cannot partly mutate ledger');
    ledger.items[0].match.push('^transient\\.txt$'); save(ledger);
    assert.equal(run('sync').status, 2, 'new unreviewed tombstone makes old completion stale');
    let updated = load();
    assert.equal(updated.paths['transient.txt'].blob, null);
    assert.equal(updated.commits.length, 2, 'both intermediate commits remain visible');
    assert.equal(updated.items[0].phase, 'changed');
    assert.deepEqual(updated.items[0].completion, ledger.items[0].completion, 'old review is preserved');

    updated.items[0].phase = 'done'; save(updated);
    assert.equal(run().status, 2, 'omitted deleted path is not reviewed null');
    updated.items[0].completion.blobs['transient.txt'] = null; save(updated);
    assert.equal(run().status, 0);
    delete updated.items[0].completion.blobs; save(updated);
    const invalid = run();
    assert.equal(invalid.status, 2); assert.match(invalid.stdout, /INVALID DONE/);
    assert.doesNotMatch(invalid.stderr, /TypeError/, 'missing completion data is reported, not dereferenced');

    updated.items[0].phase = 'pending'; updated.items[0].completion = null; save(updated);
    writeFileSync(join(root, 'work.txt'), 'expanded'); commit('change deliverable');
    const beforeWrongBranch = readFileSync(ledgerFile, 'utf8');
    const wrongBranch = run('sync');
    assert.notEqual(wrongBranch.status, 0); assert.match(wrongBranch.stderr, /Sync only the fetched PR branch head/);
    assert.equal(readFileSync(ledgerFile, 'utf8'), beforeWrongBranch);
    fetchPin(); assert.equal(run('sync').status, 0);
    const once = readFileSync(ledgerFile, 'utf8');
    assert.equal(run('sync').status, 0); assert.equal(readFileSync(ledgerFile, 'utf8'), once, 'repeat sync is idempotent');

    const beforeRewrite = readFileSync(ledgerFile, 'utf8');
    git('update-ref', 'refs/remotes/origin/cloud-fixture', base);
    assert.notEqual(run('sync', base).status, 0, 'rewritten history needs reconciliation');
    assert.equal(readFileSync(ledgerFile, 'utf8'), beforeRewrite);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
