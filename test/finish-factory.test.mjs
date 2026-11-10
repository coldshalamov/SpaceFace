import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  claimFactoryJob,
  disposeFactoryJob,
  initializeFactory,
  listFactory,
  nextFactoryJob,
  pathsOverlap,
  recoverFactoryJob,
  recoverFactoryLock,
  returnFactoryJob,
} from '../scripts/lib/finishFactory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const finishRoot = path.join(repoRoot, '.devshots', 'finish');

test('factory packets bind actual inventory rows, board, HEAD, and compact asset identities', async (t) => {
  const fixture = await makeFixture({ rows: [
    { id: 'ship-a', label: 'A', assetIds: ['asset-a'], allowedWritePaths: ['src/data/a.js'] },
    { id: 'ship-b', label: 'B', assetIds: ['asset-b'], allowedWritePaths: ['src/data/b.js'] },
    { id: 'ship-c', label: 'C', assetIds: ['asset-c'], allowedWritePaths: ['src/data/c.js'] },
  ] });
  t.after(() => cleanupFixture(fixture));
  const run = await initializeFactory({
    repoRoot,
    inventoryPath: fixture.inventoryPath,
    boardPath: fixture.boardPath,
    boardReference: 'Lane2:F1',
    controller: 'controller-test',
    batchCount: 2,
    outDir: fixture.runA,
  });
  assert.equal(run.state.rowCount, 3);
  assert.equal(run.state.jobs.length, 2);
  const next = await nextFactoryJob({ repoRoot, runDir: fixture.runA });
  assert.equal(next.packet.immutable, true);
  assert.equal(next.packet.baseHead, run.state.baseHead);
  assert.equal(next.packet.inputHash, run.state.inputHash);
  assert.equal(next.packet.selectedBoard.reference, 'Lane2:F1');
  assert.deepEqual(next.packet.assetIds, ['asset-a', 'asset-b', 'ship-a', 'ship-b']);
  assert.deepEqual(next.packet.allowedWritePaths, ['src/data/a.js', 'src/data/b.js']);
  assert.ok(next.packet.existingWorkflow.fastLoop);
  assert.match(next.packet.existingWorkflow.agentRunTemplate, /agent-run\.mjs/);
  const packetBytes = await readFile(path.join(fixture.runA, 'packets', 'asset-001.json'));
  assert.equal(run.state.jobs[0].packetSha256, sha256(packetBytes));

  const shipsFixture = await writeInventory(fixture, { ships: [{ shipId: 'ship-z', assetId: 'pkg-z' }] });
  const shipsRun = await initializeFactory({
    repoRoot, inventoryPath: shipsFixture, boardPath: fixture.boardPath,
    controller: 'controller-test', outDir: fixture.runShips,
  });
  assert.equal((await nextFactoryJob({ repoRoot, runDir: fixture.runShips })).packet.items[0].id, 'ship-z');
  assert.equal(shipsRun.state.rowCount, 1);
});

test('writer path conflicts and one cross-run GPU lease; return stays separate from controller disposition', async (t) => {
  const fixture = await makeFixture({ rows: [
    { id: 'a', allowedWritePaths: ['src/data/shared.js'] },
    { id: 'b', allowedWritePaths: ['src/data/shared.js/child'] },
  ] });
  t.after(() => cleanupFixture(fixture));
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', batchCount: 2, outDir: fixture.runA });
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', batchCount: 2, outDir: fixture.runB });

  const first = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'worker-a', mode: 'writer', resources: ['gpu'] });
  assert.equal(first.job.state, 'claimed');
  assert.ok(first.checkpoint?.file);
  fixture.checkpoints.push(path.join(repoRoot, first.checkpoint.file));
  await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', owner: 'worker-b', mode: 'writer' }), /write path conflict/);
  await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runB, jobId: 'asset-001', owner: 'worker-x', mode: 'writer' }), /global writer/);

  const readonly = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', owner: 'reader-c', mode: 'readonly' });
  assert.equal(readonly.job.activeClaim.mode, 'readonly');
  await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runB, jobId: 'asset-001', owner: 'worker-d', resources: ['gpu'] }), /GPU lease is already held/);

  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'worker-a', decision: 'accepted', note: 'not controller' }), /only controller/);
  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'accepted', note: 'worker has not returned yet' }), /worker-returned/);
  const returned = await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'worker-a', summary: 'work returned for review' });
  assert.equal(returned.job.state, 'returned');
  assert.equal(returned.workerReturn.status, 'returned');
  assert.equal((await listFactory({ repoRoot, runDir: fixture.runA })).state.jobs[0].state, 'returned');
  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'worker-a', decision: 'accepted', note: 'not controller' }), /only controller/);

  const accepted = await disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'accepted', note: 'controller reviewed returned work' });
  assert.equal(accepted.job.state, 'accepted');
  assert.equal(accepted.job.disposition, 'accepted');

  await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', owner: 'reader-c', summary: 'read-only notes returned' });
  await disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', controller: 'controller-test', decision: 'rework', note: 'reopen with clearer bounds' });
  assert.equal((await listFactory({ repoRoot, runDir: fixture.runA })).state.jobs[1].state, 'ready');
  assert.equal((await listFactory({ repoRoot, runDir: fixture.runA })).state.jobs[1].lastDisposition.decision, 'rework');

  const afterRelease = await claimFactoryJob({ repoRoot, runDir: fixture.runB, jobId: 'asset-001', owner: 'worker-d', mode: 'readonly', resources: ['gpu'] });
  assert.equal(afterRelease.activeGpuLease.jobId, 'asset-001');
  await returnFactoryJob({ repoRoot, runDir: fixture.runB, jobId: 'asset-001', owner: 'worker-d', summary: 'GPU lease release checked' });
});

test('changed input bytes make next and claim fail closed while list preserves stale diagnostics', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'stale-row' }] });
  t.after(() => cleanupFixture(fixture));
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', outDir: fixture.runA });
  await writeFile(fixture.inventoryPath, JSON.stringify({ rows: [{ id: 'stale-row', changed: true }] }));
  const listing = await listFactory({ repoRoot, runDir: fixture.runA });
  assert.equal(listing.freshness.fresh, false);
  assert.ok(listing.freshness.reasons.includes('INVENTORY_CHANGED'));
  await assert.rejects(nextFactoryJob({ repoRoot, runDir: fixture.runA }), /snapshot is stale/);
  await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'worker' }), /snapshot is stale/);
});

test('repository write-path overlap treats a parent directory as overlapping, but separate roots do not', () => {
  assert.equal(pathsOverlap('src/data/ships.js', 'src/data'), true);
  assert.equal(pathsOverlap('src/data/ships.js', 'src/ui/hud.js'), false);
  assert.equal(pathsOverlap('src//data/ships.js', 'src/data/ships.js'), true);
  for (const alias of ['C:src/file.js', 'src/data./file.js', 'src/data /file.js', 'src/file.js:stream', 'src/NUL.js']) {
    assert.throws(() => pathsOverlap(alias, 'src/data/ships.js'), /repository-relative/);
  }
});

test('real junction aliases share writer ownership and junction escapes cannot create output or writer paths', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  const actual = path.join(fixture.directory, 'actual');
  const alias = path.join(fixture.directory, 'alias');
  const outside = await mkdtemp(path.join(tmpdir(), 'spaceface-factory-outside-'));
  const escape = path.join(fixture.directory, 'studio-escape');
  await mkdir(actual);
  try {
    try {
      await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
      await symlink(outside, escape, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'ENOTSUP', 'EACCES'].includes(error.code)) { t.skip(`filesystem links unavailable: ${error.code}`); return; }
      throw error;
    }
    const realFile = repoPath(path.join(actual, 'future.js'));
    const aliasFile = repoPath(path.join(alias, 'future.js'));
    await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
      controller: 'controller-test', writePaths: [aliasFile.replaceAll('/', '//')], outDir: fixture.runA });
    await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
      controller: 'controller-test', writePaths: [realFile], outDir: fixture.runB });
    assert.deepEqual((await nextFactoryJob({ repoRoot, runDir: fixture.runA })).packet.allowedWritePaths, [realFile]);
    const claim = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'junction-a', mode: 'writer' });
    fixture.checkpoints.push(path.join(repoRoot, claim.checkpoint.file));
    await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runB, jobId: 'asset-001', owner: 'junction-b', mode: 'writer' }), /global writer/);
    await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'junction-a', summary: 'released' });
    await assert.rejects(initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
      controller: 'controller-test', writePaths: [repoPath(path.join(escape, 'future.js'))], outDir: fixture.runShips }), /inside the repository/);
    await assert.rejects(initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
      controller: 'controller-test', outDir: path.join(escape, 'new-run') }), /inside the repository/);
    assert.deepEqual(await import('node:fs/promises').then((fs) => fs.readdir(outside)), []);
  } finally {
    await unlink(alias).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await unlink(escape).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await rm(outside, { recursive: true, force: true });
  }
});

test('HEAD is provenance while per-shard source bytes guard claims and returned readonly work', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }, { id: 'b' }] });
  t.after(() => cleanupFixture(fixture));
  const sourceA = path.join(fixture.directory, 'input', 'a.js');
  const sourceB = path.join(fixture.directory, 'input', 'b.js');
  await writeFile(sourceA, 'original a');
  await writeFile(sourceB, 'original b');
  await writeFile(fixture.inventoryPath, JSON.stringify({ rows: [
    { id: 'a', inputPaths: [repoPath(sourceA)] }, { id: 'b', inputPaths: [repoPath(sourceB)] },
  ] }));
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', batchCount: 2, outDir: fixture.runA });
  // Model an unrelated commit without mutating shared Git HEAD or creating another checkout.
  const stateFile = path.join(fixture.runA, 'state.json');
  const state = JSON.parse(await readFile(stateFile));
  state.baseHead = 'previous-unrelated-head';
  await writeFile(stateFile, JSON.stringify(state));
  assert.equal((await listFactory({ repoRoot, runDir: fixture.runA })).freshness.headAdvanced, true);
  assert.equal((await nextFactoryJob({ repoRoot, runDir: fixture.runA })).job.id, 'asset-001');
  await writeFile(sourceA, 'dirty relevant change');
  const next = await nextFactoryJob({ repoRoot, runDir: fixture.runA });
  assert.equal(next.job.id, 'asset-002');
  assert.match(next.blockedJobs[0].reasons.join(), /SOURCE_CHANGED/);
  await assert.rejects(claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'reader-a' }), /SOURCE_CHANGED/);
  await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', owner: 'reader-b' });
  await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', owner: 'reader-b', summary: 'unchanged input review' });
  const accepted = await disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-002', controller: 'controller-test', decision: 'accepted', note: 'unrelated HEAD did not invalidate work' });
  assert.equal(accepted.job.state, 'accepted');
});

test('actual claim process interruption retains recoverable nonce, leases and checkpoint', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', writePaths: [repoPath(path.join(fixture.directory, 'future.js'))], outDir: fixture.runA });
  const moduleUrl = new URL('../scripts/lib/finishFactory.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { claimFactoryJob } from ${JSON.stringify(moduleUrl)};
    await claimFactoryJob({
      ...${JSON.stringify({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'interrupted', mode: 'writer', resources: ['gpu'] })},
      fault(stage) { if (stage === 'checkpoint') process.exit(73); }
    });
  `], { cwd: repoRoot, encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 73, child.stderr);
  const interrupted = await listFactory({ repoRoot, runDir: fixture.runA });
  assert.equal(interrupted.state.jobs[0].state, 'claiming');
  const nonce = interrupted.state.jobs[0].claim.nonce;
  assert.equal(interrupted.globalResources.gpuLease.nonce, nonce);
  await assert.rejects(recoverFactoryLock({ repoRoot, runDir: fixture.runA, controller: 'controller-test', scope: 'run', nonce: 'wrong', note: 'dead process' }), /nonce changed/);
  for (const scope of ['run', 'resources']) {
    await recoverFactoryLock({ repoRoot, runDir: fixture.runA, controller: 'controller-test', scope,
      nonce: interrupted.locks[scope].nonce, note: 'fault-injected CLI process exited; native worker never dispatched' });
  }
  const resumed = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'interrupted', mode: 'writer', resources: ['gpu'] });
  fixture.checkpoints.push(path.join(repoRoot, resumed.checkpoint.file));
  assert.equal(resumed.job.activeClaim.nonce, nonce);
  assert.match(resumed.checkpoint.started, /resumed/);
  await assert.rejects(recoverFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', claimNonce: 'wrong', note: 'stopped' }), /nonce changed/);
  const recovered = await recoverFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', claimNonce: nonce, note: 'no native worker was dispatched' });
  assert.equal(recovered.workerReturn.status, 'failed');
  const resources = (await listFactory({ repoRoot, runDir: fixture.runA })).globalResources;
  assert.equal(resources.gpuLease, null);
  assert.equal(resources.activeWriters.some((lease) => lease.nonce === nonce), false);
});

test('interrupted returns release idempotently and pin writer output until controller disposition', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  const owned = path.join(fixture.directory, 'output.js');
  await writeFile(owned, 'before');
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', writePaths: [repoPath(owned)], outDir: fixture.runA });
  const claim = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', mode: 'writer', resources: ['gpu'] });
  fixture.checkpoints.push(path.join(repoRoot, claim.checkpoint.file));
  await writeFile(owned, 'worker candidate');
  for (const boundary of ['return-intent', 'writer-released', 'gpu-released']) {
    await assert.rejects(returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', summary: 'candidate',
      fault(stage) { if (stage === boundary) throw new Error(`interrupted at ${boundary}`); } }), /interrupted/);
    const state = (await listFactory({ repoRoot, runDir: fixture.runA })).state;
    assert.equal(state.jobs[0].state, 'returning');
    assert.equal(state.jobs[0].claim.nonce, claim.job.activeClaim.nonce);
    assert.equal(state.jobs[0].returns.length, 0);
  }
  const returned = await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', summary: 'retry' });
  assert.equal(returned.workerReturn.summary, 'candidate');
  assert.equal(returned.workerReturn.snapshotFreshAtReturn, true);
  assert.equal((await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', summary: 'lost acknowledgement retry' })).job.returnCount, 1);
  await writeFile(owned, 'changed after return');
  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'accepted', note: 'must catch changed candidate' }), /changed input\/source bytes/);
  await writeFile(owned, 'worker candidate');
  await disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'rework', note: 'continue improving current candidate' });
  const rework = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', mode: 'writer' });
  fixture.checkpoints.push(path.join(repoRoot, rework.checkpoint.file));
  assert.equal(rework.job.attempts, 2);
  assert.notDeepEqual(rework.attemptInputs, rework.packet.sourceInputs);
  await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'returning', summary: 'rework complete' });
  assert.equal((await disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'accepted', note: 'candidate preserved' })).job.state, 'accepted');
});

test('a writer cannot hide sibling input edits inside a directory containing its owned output', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  const owned = path.join(fixture.directory, 'input', 'owned.js');
  const sibling = path.join(fixture.directory, 'input', 'read-only.js');
  await writeFile(owned, 'before');
  await writeFile(sibling, 'read input');
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', inputPaths: [repoPath(path.dirname(owned))], writePaths: [repoPath(owned)], outDir: fixture.runA });
  const claim = await claimFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'directory-writer', mode: 'writer' });
  fixture.checkpoints.push(path.join(repoRoot, claim.checkpoint.file));
  await writeFile(owned, 'expected candidate');
  await writeFile(sibling, 'unexpected sibling change');
  const returned = await returnFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', owner: 'directory-writer', summary: 'must not pass immutable inputs' });
  assert.equal(returned.workerReturn.snapshotFreshAtReturn, false);
  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'accepted', note: 'stale sibling' }), /changed input\/source bytes/);
  await assert.rejects(disposeFactoryJob({ repoRoot, runDir: fixture.runA, jobId: 'asset-001', controller: 'controller-test', decision: 'rework', note: 'cannot silently bless sibling change' }), /immutable inputs/);
});

test('controller lock recovery never takes over a live operation or a replacement nonce', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath, boardPath: fixture.boardPath,
    controller: 'controller-test', outDir: fixture.runA });
  const file = path.join(fixture.runA, '.operation.lock');
  await writeFile(file, JSON.stringify({ nonce: 'live-operation', pid: process.pid }));
  await assert.rejects(recoverFactoryLock({ repoRoot, runDir: fixture.runA, controller: 'not-controller', scope: 'run', nonce: 'live-operation', note: 'test' }), /only controller/);
  await assert.rejects(recoverFactoryLock({ repoRoot, runDir: fixture.runA, controller: 'controller-test', scope: 'run', nonce: 'old-operation', note: 'test' }), /nonce changed/);
  await assert.rejects(recoverFactoryLock({ repoRoot, runDir: fixture.runA, controller: 'controller-test', scope: 'run', nonce: 'live-operation', note: 'test' }), /still live/);
  assert.equal(JSON.parse(await readFile(file)).nonce, 'live-operation');
});

test('simultaneous cross-run GPU requests admit one owner and allow the loser after release', async (t) => {
  const fixture = await makeFixture({ rows: [{ id: 'a' }] });
  t.after(() => cleanupFixture(fixture));
  const runs = [fixture.runA, fixture.runB];
  for (const runDir of runs) await initializeFactory({ repoRoot, inventoryPath: fixture.inventoryPath,
    boardPath: fixture.boardPath, controller: 'controller-test', outDir: runDir });
  const results = await Promise.allSettled(runs.map((runDir, index) => claimFactoryJob({ repoRoot, runDir,
    jobId: 'asset-001', owner: `simultaneous-${index}`, resources: ['gpu'] })));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  const loser = 1 - winner;
  assert.match(results[loser].reason.message, /GPU lease is already held/);
  await returnFactoryJob({ repoRoot, runDir: runs[winner], jobId: 'asset-001', owner: `simultaneous-${winner}`, summary: 'lease released' });
  const retry = await claimFactoryJob({ repoRoot, runDir: runs[loser], jobId: 'asset-001', owner: `simultaneous-${loser}`, resources: ['gpu'] });
  assert.equal(retry.job.state, 'claimed');
  await returnFactoryJob({ repoRoot, runDir: runs[loser], jobId: 'asset-001', owner: `simultaneous-${loser}`, summary: 'retry released' });
});

function repoPath(file) { return path.relative(repoRoot, file).replaceAll('\\', '/'); }

async function makeFixture(inventory) {
  await mkdir(finishRoot, { recursive: true });
  const directory = await mkdtemp(path.join(finishRoot, 'studio-factory-test-'));
  const fixtures = path.join(directory, 'input');
  await mkdir(fixtures, { recursive: true });
  const inventoryPath = path.join(fixtures, 'inventory.json');
  const boardPath = path.join(fixtures, 'board.md');
  await writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
  await writeFile(boardPath, '# Fixture board\n\nLane2:F1\n');
  return {
    directory,
    inventoryPath,
    boardPath,
    runA: path.join(directory, 'studio-run-a'),
    runB: path.join(directory, 'studio-run-b'),
    runShips: path.join(directory, 'studio-run-ships'),
    checkpoints: [],
  };
}

async function writeInventory(fixture, inventory) {
  const file = path.join(fixture.directory, 'input', `inventory-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(inventory, null, 2));
  return file;
}

async function cleanupFixture(fixture) {
  for (const checkpoint of fixture.checkpoints) await rm(checkpoint, { force: true });
  await rm(fixture.directory, { recursive: true, force: true });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
