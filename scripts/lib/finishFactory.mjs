import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdir,
  link,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { planForFiles } from './agentLoopPlan.mjs';

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FINISH_OUTPUT_ROOT = '.devshots/finish';
const SCHEMA = 'spaceface.finishFactory.v1';
const FACTORY_CODE_PATHS = ['scripts/finish-factory.mjs', 'scripts/lib/finishFactory.mjs'];

export async function initializeFactory({
  repoRoot = MODULE_ROOT,
  inventoryPath,
  boardPath,
  boardReference = null,
  controller,
  batchCount = 1,
  writePaths = [],
  inputPaths = [],
  outDir = null,
  label = 'factory',
}) {
  const root = await realpath(repoRoot);
  const inventory = await resolveRepoFile(root, inventoryPath, 'inventory');
  const board = await resolveRepoFile(root, boardPath, 'board');
  const controllerId = requiredText(controller, 'controller');
  const count = positiveInteger(batchCount, 'batchCount');
  const inputBytes = await readFile(inventory.absolute);
  const boardBytes = await readFile(board.absolute);
  const inventoryJson = parseJson(inputBytes, inventory.relative);
  const rows = readInventoryRows(inventoryJson);
  if (!rows.length) throw new Error('inventory contains no .rows or .ships entries');
  if (count > rows.length) throw new Error(`batchCount ${count} exceeds inventory row count ${rows.length}`);

  const head = currentHead(root);
  const inputHash = hashParts([
    ['inventoryPath', inventory.relative], ['inventoryBytes', inputBytes],
    ['boardPath', board.relative], ['boardBytes', boardBytes],
  ]);
  const factoryCodeSha256 = await factoryCodeHash(root);
  const selectedBoard = {
    path: board.relative,
    reference: requiredText(boardReference || board.relative, 'board reference'),
    sha256: sha256(boardBytes),
  };
  const globalWritePaths = await canonicalPathList(root, writePaths);
  const groups = partitionRows(rows, count);
  const runId = `studio-${slug(label)}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const runDir = await validateNewRunPath(root, outDir || path.join(FINISH_OUTPUT_ROOT, runId));
  await mkdir(path.dirname(runDir), { recursive: true });
  await mkdir(runDir, { recursive: false });
  await mkdir(path.join(runDir, 'packets'), { recursive: true });

  const jobs = [];
  for (let index = 0; index < groups.length; index += 1) {
    const jobId = `asset-${String(index + 1).padStart(3, '0')}`;
    const items = groups[index].map((row) => compactInventoryItem(row));
    const allowedWritePaths = await canonicalPathList(root, [
      ...globalWritePaths,
      ...groups[index].flatMap((row) => row.allowedWritePaths || row.writePaths || []),
    ]);
    const sourceInputs = await pinSources(root, [
      ...normalizePathList(inputPaths), ...normalizePathList(inventoryJson.inputPaths || []),
      ...groups[index].flatMap((row) => normalizePathList(row.inputPaths || row.readPaths || [])),
      ...groups[index].flatMap(referencedSourcePaths), ...allowedWritePaths,
    ]);
    const readInputs = await pinSources(root, sourceInputs.map((input) => input.path), allowedWritePaths);
    const assetIds = [...new Set(items.flatMap((item) => item.assetIds))].sort();
    const packet = {
      schema: 'spaceface.finishFactoryPacket.v1',
      immutable: true,
      jobId,
      batch: { index: index + 1, count: groups.length, itemCount: items.length },
      baseHead: head,
      inputHash,
      factoryCodeSha256,
      selectedBoard,
      inventory: { path: inventory.relative, collection: inventoryJson.ships ? 'ships' : 'rows' },
      assetIds,
      allowedWritePaths,
      sourceInputs,
      readInputs,
      access: allowedWritePaths.length ? 'write-capable-by-explicit-claim' : 'read-only',
      items,
      existingWorkflow: workflowHints(allowedWritePaths, runId, jobId),
      authorityNote: 'Finish boards remain the plan authority. This packet only scopes assigned work; returned work is not accepted or disposed by the worker.',
    };
    const packetBytes = Buffer.from(`${JSON.stringify(packet, null, 2)}\n`);
    const packetPath = path.join('packets', `${jobId}.json`).replaceAll('\\', '/');
    await writeFile(path.join(runDir, packetPath), packetBytes, { flag: 'wx' });
    jobs.push({
      id: jobId,
      state: 'ready',
      packetPath,
      packetSha256: sha256(packetBytes),
      itemIds: items.map((item) => item.id),
      assetIds,
      allowedWritePaths,
      sourceInputs,
      readInputs,
      attempts: 0,
      claim: null,
      returns: [],
      disposition: null,
    });
  }

  const state = {
    schema: SCHEMA,
    runId,
    createdAt: now(),
    controllerId,
    baseHead: head,
    inputHash,
    factoryCodeSha256,
    inputs: {
      inventoryPath: inventory.relative,
      inventorySha256: sha256(inputBytes),
      boardPath: board.relative,
      boardSha256: selectedBoard.sha256,
      boardReference: selectedBoard.reference,
    },
    batchCount: count,
    rowCount: rows.length,
    activeGpuLease: null,
    jobs,
    events: [{ sequence: 1, at: now(), action: 'initialized', actor: controllerId,
      detail: { rowCount: rows.length, batchCount: count, inputHash, baseHead: head } }],
  };
  await writeState(runDir, state);
  return { runDir, state, freshness: await snapshotFreshness(root, state) };
}

export async function listFactory({ repoRoot = MODULE_ROOT, runDir }) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const state = await readState(directory);
  return { runDir: path.relative(root, directory).replaceAll('\\', '/'), state,
    freshness: await snapshotFreshness(root, state), globalResources: await readGlobalResources(root),
    jobFreshness: Object.fromEntries(await Promise.all(state.jobs.map(async (job) => [job.id, await snapshotFreshness(root, state, job)]))),
    locks: { run: await readOptionalJson(path.join(directory, '.operation.lock')),
      resources: await readOptionalJson(path.join(root, FINISH_OUTPUT_ROOT, '.studio-writer-leases.lock')) } };
}

export async function nextFactoryJob({ repoRoot = MODULE_ROOT, runDir }) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const state = await readState(directory);
  const freshness = await snapshotFreshness(root, state);
  if (!freshness.fresh) throw new Error(`cannot export next packet: factory snapshot is stale (${freshness.reasons.join(', ')})`);
  const blockedJobs = [];
  for (const job of state.jobs.filter((candidate) => candidate.state === 'ready')) {
    const jobFreshness = await snapshotFreshness(root, state, job);
    if (!jobFreshness.fresh) { blockedJobs.push({ jobId: job.id, reasons: jobFreshness.reasons }); continue; }
    const packet = await readAndVerifyPacket(directory, job);
    return { runId: state.runId, freshness: jobFreshness, blockedJobs, attemptInputs: job.attemptInputs || job.sourceInputs,
      globalResources: await readGlobalResources(root), job: summarizeJob(job), packet };
  }
  if (blockedJobs.length) throw new Error(`cannot export next packet: source snapshot is stale (${JSON.stringify(blockedJobs)})`);
  return { job: null, freshness, runId: state.runId, globalResources: await readGlobalResources(root) };
}

// fault is a test seam at durable transaction boundaries; production callers omit it.
export async function claimFactoryJob({
  repoRoot = MODULE_ROOT, runDir, jobId, owner, mode = 'readonly', resources = [], fault,
}) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const ownerId = requiredText(owner, 'owner');
  if (!['readonly', 'writer'].includes(mode)) throw new Error('claim mode must be readonly or writer');
  const requestedResources = normalizeResources(resources);
  return withRunLock(directory, () => withWriterLeaseLock(root, async () => {
    const state = await readState(directory);
    const job = requireJob(state, jobId);
    await requireFreshSnapshot(root, state, 'claim', job);
    const resuming = job.state === 'claiming' && job.claim?.owner === ownerId;
    if (!resuming && job.state !== 'ready') throw new Error(`job ${job.id} is ${job.state}, not ready`);
    if (resuming && (job.claim.mode !== mode || JSON.stringify(job.claim.resources) !== JSON.stringify(requestedResources))) {
      throw new Error('resumed claim must retain its original mode and resources');
    }
    if (mode === 'writer' && !job.allowedWritePaths.length) throw new Error('writer claim requires explicit allowedWritePaths');
    const canonicalPaths = await canonicalPathList(root, job.allowedWritePaths);
    if (JSON.stringify(canonicalPaths) !== JSON.stringify(job.allowedWritePaths)) throw new Error('write path identity changed; create a new packet');
    const leases = await readWriterLeases(root);
    if (mode === 'writer') {
      const conflicts = [];
      for (const lease of leases) {
        if (resuming && sameLease(lease, { runId: state.runId, jobId: job.id, ...job.claim })) continue;
        const heldPaths = await canonicalPathList(root, lease.paths);
        if (heldPaths.some((a) => canonicalPaths.some((b) => pathsOverlap(a, b)))) conflicts.push(`${lease.jobId}@${lease.runId}`);
      }
      if (conflicts.length) throw new Error(`global writer write path conflict with active job(s): ${conflicts.join(', ')}`);
    }
    const gpu = (await readGlobalResources(root)).gpuLease;
    if (requestedResources.includes('gpu') && gpu && !(resuming && sameLease(gpu, { runId: state.runId, jobId: job.id, ...job.claim }))) {
      throw new Error(`GPU lease is already held across factory runs: ${JSON.stringify(gpu)}`);
    }
    const packet = await readAndVerifyPacket(directory, job);
    if (!resuming) {
      job.attempts += 1;
      job.claim = { owner: ownerId, mode, resources: requestedResources, nonce: randomUUID(), claimedAt: now(), checkpoint: null };
      job.state = 'claiming';
      appendEvent(state, 'claim-started', ownerId, job.id, { nonce: job.claim.nonce, mode, resources: requestedResources });
      await writeState(directory, state);
    }
    await fault?.('claim-intent');
    const lease = { runId: state.runId, jobId: job.id, ...job.claim };
    if (mode === 'writer' && !leases.some((held) => sameLease(held, lease))) {
      await writeWriterLeases(root, [...leases, { ...lease, paths: canonicalPaths }]);
    }
    await fault?.('writer-lease');
    if (requestedResources.includes('gpu')) await createGlobalGpuLease(root, lease);
    await fault?.('gpu-lease');
    if (mode === 'writer') job.claim.checkpoint = await startExistingCheckpoint(root, state, job, ownerId);
    await fault?.('checkpoint');
    job.state = 'claimed';
    if (requestedResources.includes('gpu')) state.activeGpuLease = { ...lease, acquiredAt: job.claim.claimedAt };
    appendEvent(state, 'claimed', ownerId, job.id, { nonce: job.claim.nonce, mode, resources: requestedResources, checkpoint: job.claim.checkpoint });
    await writeState(directory, state);
    return { job: summarizeJob(job), packet, attemptInputs: job.attemptInputs || job.sourceInputs,
      checkpoint: job.claim.checkpoint, activeGpuLease: state.activeGpuLease,
      globalResources: await readGlobalResources(root) };
  }));
}

export async function returnFactoryJob({
  repoRoot = MODULE_ROOT, runDir, jobId, owner, status = 'returned', summary, artifacts = [], fault,
}) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const ownerId = requiredText(owner, 'owner');
  if (!['returned', 'blocked', 'failed'].includes(status)) throw new Error('worker return status must be returned, blocked, or failed; disposition is controller-only');
  const message = requiredText(summary, 'summary');
  return withRunLock(directory, () => withWriterLeaseLock(root, async () => {
    const state = await readState(directory);
    const job = requireJob(state, jobId);
    if (job.state === 'returned' && job.lastClaim?.owner === ownerId) {
      return { job: summarizeJob(job), workerReturn: job.returns.at(-1), freshness: await snapshotFreshness(root, state, job) };
    }
    assertOwner(job, ownerId);
    if (!['claimed', 'returning'].includes(job.state)) throw new Error(`job ${job.id} is ${job.state}, not claimed`);
    return finishReturn(root, directory, state, job, { status, summary: message, artifacts }, fault);
  }));
}

async function finishReturn(root, directory, state, job, result, fault) {
  const freshness = await snapshotFreshness(root, state, job, { allowWrites: job.claim.mode === 'writer' });
  if (job.state !== 'returning') {
    let sourceSnapshot = null;
    try { sourceSnapshot = await pinSources(root, (job.sourceInputs || []).map((input) => input.path)); }
    catch { freshness.fresh = false; } // Bad source identity must not prevent releasing owned resources.
    job.pendingReturn = { ...result, artifacts: normalizeArtifactPaths(result.artifacts || []), returnedAt: now(),
      snapshotFreshAtReturn: freshness.fresh, sourceSnapshot };
    job.state = 'returning';
    await writeState(directory, state);
  }
  await fault?.('return-intent');
  const expected = { runId: state.runId, jobId: job.id, ...job.claim };
  const leases = await readWriterLeases(root);
  const own = leases.filter((lease) => lease.runId === state.runId && lease.jobId === job.id);
  if (own.some((lease) => !sameLease(lease, expected))) throw new Error('refusing to release a different writer claim nonce');
  if (own.length) await writeWriterLeases(root, leases.filter((lease) => !sameLease(lease, expected)));
  await fault?.('writer-released');
  if (job.claim.resources.includes('gpu')) await releaseGlobalGpuLease(root, expected);
  await fault?.('gpu-released');
  job.returns.push(job.pendingReturn);
  job.pendingReturn = null;
  job.lastClaim = job.claim;
  job.claim = null;
  job.state = 'returned';
  if (state.activeGpuLease?.jobId === job.id) state.activeGpuLease = null;
  appendEvent(state, 'worker-returned', expected.owner, job.id, { status: job.returns.at(-1).status, nonce: expected.nonce });
  await writeState(directory, state);
  return { job: summarizeJob(job), workerReturn: job.returns.at(-1), freshness };
}

// The controller must establish that the native worker has stopped before abandoning its claim.
// CLI process liveness is deliberately NOT used as native-worker liveness.
export async function recoverFactoryJob({ repoRoot = MODULE_ROOT, runDir, jobId, controller, claimNonce, note }) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  return withRunLock(directory, () => withWriterLeaseLock(root, async () => {
    const state = await readState(directory);
    if (requiredText(controller, 'controller') !== state.controllerId) throw new Error('only controller may recover jobs');
    const job = requireJob(state, jobId);
    const nonce = requiredText(claimNonce, 'claim nonce');
    if (job.state === 'returned' && job.lastClaim?.nonce === nonce) {
      return { job: summarizeJob(job), workerReturn: job.returns.at(-1), freshness: await snapshotFreshness(root, state, job) };
    }
    if (!job.claim || job.claim.nonce !== nonce) throw new Error('claim nonce changed or no recoverable claim');
    const message = requiredText(note, 'recovery note');
    appendEvent(state, 'controller-recovery', controller, job.id, { nonce: claimNonce, note: message });
    return finishReturn(root, directory, state, job, { status: 'failed', summary: `Controller recovery: ${message}`, artifacts: [] });
  }));
}

export async function disposeFactoryJob({
  repoRoot = MODULE_ROOT,
  runDir,
  jobId,
  controller,
  decision,
  note,
}) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const actor = requiredText(controller, 'controller');
  if (!['accepted', 'rework', 'rejected'].includes(decision)) {
    throw new Error('decision must be accepted, rework, or rejected');
  }
  const detail = requiredText(note, 'note');
  return withRunLock(directory, async () => {
    const state = await readState(directory);
    if (actor !== state.controllerId) throw new Error(`only controller ${state.controllerId} may disposition jobs`);
    const job = requireJob(state, jobId);
    if (job.state !== 'returned') throw new Error(`job ${job.id} must be worker-returned before controller disposition`);
    const freshness = await snapshotFreshness(root, state, job);
    if (decision === 'accepted' && !freshness.fresh) {
      throw new Error('cannot accept a returned job against changed input/source bytes or a stale worker return');
    }
    if (decision === 'rework') {
      if (job.lastClaim?.mode === 'writer') {
        const readFreshness = await snapshotFreshness(root, state, job, { allowWrites: true });
        if (!readFreshness.fresh) throw new Error('cannot rework against changed immutable inputs; initialize a new packet');
        job.attemptInputs = await pinSources(root, (job.sourceInputs || []).map((input) => input.path));
      }
      job.state = 'ready';
      job.disposition = null;
    } else {
      job.state = decision;
      job.disposition = { decision, controller: actor, note: detail, at: now(), snapshotFresh: freshness.fresh };
    }
    job.lastDisposition = { decision, controller: actor, note: detail, at: now(), snapshotFresh: freshness.fresh };
    appendEvent(state, 'controller-disposition', actor, job.id,
      { decision, note: detail, snapshotFresh: freshness.fresh });
    await writeState(directory, state);
    return { job: summarizeJob(job), freshness };
  });
}

export function pathsOverlap(left, right) {
  const normalizedLeft = normalizeRepoPath(left);
  const normalizedRight = normalizeRepoPath(right);
  const a = process.platform === 'win32' ? normalizedLeft.toLowerCase() : normalizedLeft;
  const b = process.platform === 'win32' ? normalizedRight.toLowerCase() : normalizedRight;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function workflowHints(writePaths, runId, jobId) {
  const checkpointTask = `${slug(runId)}-${jobId}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const paths = [...writePaths];
  return {
    fastLoop: planForFiles(paths),
    checkpoint: paths.length ? {
      createdOnWriterClaim: true,
      taskIdPattern: checkpointTask,
      todos: ['implement assigned packet', 'run focused owner check', 'return result to controller'],
    } : null,
    agentRunTemplate: 'node scripts/agent-run.mjs --log <log-path> --stdin <packet-path> -- <configured-agent-command>',
    agentRunNote: 'Export hint only. The factory does not spawn agents, select models, or invoke hidden collaboration APIs.',
  };
}

function compactInventoryItem(row) {
  const id = row.shipId ?? row.assetId ?? row.id ?? row.key ?? row.name;
  if (id == null || String(id).trim() === '') throw new Error('each inventory row needs shipId, assetId, id, key, or name');
  const itemId = String(id);
  const assetIds = collectAssetIds(row, itemId);
  const source = row.sourceIdentity || row.source || {};
  const physics = row.physics || {};
  const mass = physics.mass || {};
  const proxy = physics.collisionProxy || {};
  const inertia = physics.yawInertia || {};
  return {
    id: itemId,
    label: String(row.label || row.name || itemId),
    role: row.usage?.role || row.role || row.category || null,
    assetIds,
    sourceIdentity: {
      modelTruthId: source.modelTruth?.id || null,
      modelUrl: source.modelTruth?.url || null,
      meshHash: source.modelTruth?.meshHash || null,
      sourcePath: row.renderSelection?.wholeShip?.assetIdentity?.sourcePath || null,
      sourceSha256: row.renderSelection?.wholeShip?.assetIdentity?.sourceSha256 || null,
      releasePath: row.renderSelection?.wholeShip?.assetIdentity?.releasePath || null,
      releaseSha256: row.renderSelection?.wholeShip?.assetIdentity?.releaseSha256 || null,
      packageAssetId: row.renderSelection?.wholeShip?.runtimePackage?.packageAssetId || null,
      packageKey: row.renderSelection?.wholeShip?.runtimePackage?.packageKey || null,
    },
    physicsSummary: Object.keys(physics).length ? {
      mass: mass.defaultOperationalMass ?? mass.defaultDerivedMass ?? null,
      proxyId: proxy.id || null,
      proxyMeasured: proxy.measured ?? null,
      yawInertia: inertia.derivedFlightModel ?? null,
      materialId: physics.material?.materialId || null,
    } : null,
    rowSha256: sha256(Buffer.from(JSON.stringify(row))),
  };
}

function collectAssetIds(row, fallbackId) {
  const found = new Set([String(fallbackId)]);
  const acceptedKeys = new Set([
    'assetId', 'assetID', 'packageAssetId', 'runtimeAssetId', 'partId', 'modelTruthId',
    'sourcePath', 'releasePath', 'sourceUrl', 'url',
  ]);
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return;
    if (Array.isArray(value)) { for (const entry of value) visit(entry, depth + 1); return; }
    for (const [key, entry] of Object.entries(value)) {
      if (acceptedKeys.has(key) && typeof entry === 'string' && entry) found.add(entry.replaceAll('\\', '/'));
      if (entry && typeof entry === 'object') visit(entry, depth + 1);
    }
  };
  for (const key of ['assetIds', 'assetIDs']) {
    if (Array.isArray(row[key])) for (const id of row[key]) if (id != null) found.add(String(id));
  }
  visit(row);
  return [...found].sort();
}

function readInventoryRows(inventory) {
  const rows = Array.isArray(inventory?.ships) ? inventory.ships : inventory?.rows;
  if (!Array.isArray(rows)) throw new Error('inventory must expose a .ships or .rows array');
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('inventory rows must be objects');
    return row;
  }).sort((a, b) => String(a.shipId ?? a.assetId ?? a.id ?? a.key ?? a.name)
    .localeCompare(String(b.shipId ?? b.assetId ?? b.id ?? b.key ?? b.name)));
}

function partitionRows(rows, count) {
  const size = Math.ceil(rows.length / count);
  return Array.from({ length: count }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

function normalizePathList(values) {
  const entries = Array.isArray(values) ? values : [values];
  return [...new Set(entries.flatMap((value) => String(value || '').split(',').map(normalizeRepoPath).filter(Boolean)))].sort();
}

function normalizeRepoPath(value) {
  const raw = String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!raw || raw.startsWith('/') || raw.includes(':') || raw.split('/').some((part) => part === '..' || part === '.'
    || /[. ]$/.test(part) || /[<>"|?*\x00-\x1f]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part))) {
    throw new Error(`path must be a repository-relative path without traversal or Windows aliases: ${value}`);
  }
  return raw.replace(/\/{2,}/g, '/');
}

function relativeInside(root, absolute) {
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('path must resolve inside the repository');
  return relative;
}

// New files are resolved through their nearest real ancestor too, so junctions cannot
// hide an escape or give two writers different names for the same future file.
async function canonicalRepoPath(root, value) {
  const normalized = normalizeRepoPath(value);
  let ancestor = path.resolve(root, normalized);
  const suffix = [];
  for (;;) {
    try {
      const actual = path.join(await realpath(ancestor), ...suffix);
      return relativeInside(root, actual);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor) throw error;
      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
}

async function canonicalPathList(root, values) {
  return [...new Set(await Promise.all(normalizePathList(values).map((value) => canonicalRepoPath(root, value))))].sort();
}

function referencedSourcePaths(row) {
  const found = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (['sourcePath', 'releasePath', 'partsManifest', 'releaseManifest'].includes(key) && typeof entry === 'string' && entry) found.push(entry);
      else if (entry && typeof entry === 'object') visit(entry);
    }
  };
  visit(row);
  return found;
}

async function pinSources(root, paths, excludePaths = []) {
  const canonical = await canonicalPathList(root, paths);
  return Promise.all(canonical.map(async (file) => ({ path: file, sha256: await sourceHash(root, file, excludePaths) })));
}

function ownedPath(file, paths) {
  return paths.some((owned) => pathsOverlap(file, owned) && normalizeRepoPath(file).length >= normalizeRepoPath(owned).length);
}

async function sourceHash(root, file, excludePaths = []) {
  if (ownedPath(file, excludePaths)) return sha256('owned-output');
  const canonical = await canonicalRepoPath(root, file);
  if (canonical !== file) throw new Error(`source path identity changed: ${file}`);
  const target = path.join(root, file);
  let metadata;
  try { metadata = await stat(target); }
  catch (error) { if (error.code === 'ENOENT') return sha256('missing'); throw error; }
  if (metadata.isFile()) return hashParts([['file', await readFile(target)]]);
  if (!metadata.isDirectory()) throw new Error(`unsupported source input: ${file}`);
  const children = (await readdir(target)).filter((child) => !ownedPath(`${file}/${child}`, excludePaths)).sort();
  return hashParts(await Promise.all(children.map(async (child) => [child, await sourceHash(root, `${file}/${child}`, excludePaths)])));
}

function normalizeResources(resources) {
  const values = Array.isArray(resources) ? resources : [resources];
  const normalized = [...new Set(values.flatMap((value) => String(value || '').split(',').filter(Boolean)))].sort();
  const unknown = normalized.filter((value) => value !== 'gpu');
  if (unknown.length) throw new Error(`unsupported resource(s): ${unknown.join(', ')}`);
  return normalized;
}

function normalizeArtifactPaths(paths) {
  return normalizePathList(paths);
}

async function resolveRepoFile(root, value, label) {
  if (!value) throw new Error(`${label} path is required`);
  const candidate = path.resolve(root, String(value));
  const actual = await realpath(candidate);
  const relative = path.relative(root, actual).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve to a file inside the repository`);
  }
  const metadata = await stat(actual);
  if (!metadata.isFile()) throw new Error(`${label} must be a file: ${value}`);
  return { absolute: actual, relative };
}

async function validateNewRunPath(root, value) {
  const lexical = relativeInside(root, path.resolve(root, String(value)));
  const canonical = await canonicalRepoPath(root, lexical);
  const prefix = `${FINISH_OUTPUT_ROOT}/studio-`;
  if (!lexical.startsWith(prefix) || !canonical.startsWith(prefix)) throw new Error(`run output must be under ${prefix}<name>`);
  return path.join(root, canonical);
}

async function resolveRunDirectory(repoRoot, value) {
  const root = await realpath(repoRoot);
  if (!value) throw new Error('--run is required');
  const directory = await validateNewRunPath(root, value);
  if (!(await stat(directory)).isDirectory()) throw new Error('run path is not a directory');
  return { root, directory };
}

async function snapshotFreshness(root, state, job = null, { allowWrites = false } = {}) {
  try {
    const head = currentHead(root);
    const inventory = await resolveRepoFile(root, state.inputs.inventoryPath, 'inventory');
    const board = await resolveRepoFile(root, state.inputs.boardPath, 'board');
    const [inventoryBytes, boardBytes] = await Promise.all([readFile(inventory.absolute), readFile(board.absolute)]);
    const codeHash = await factoryCodeHash(root);
    const inventoryHash = sha256(inventoryBytes);
    const boardHash = sha256(boardBytes);
    const inputHash = hashParts([
      ['inventoryPath', state.inputs.inventoryPath], ['inventoryBytes', inventoryBytes],
      ['boardPath', state.inputs.boardPath], ['boardBytes', boardBytes],
    ]);
    const reasons = [inventoryHash !== state.inputs.inventorySha256 ? 'INVENTORY_CHANGED' : null,
      boardHash !== state.inputs.boardSha256 ? 'BOARD_CHANGED' : null,
      codeHash !== state.factoryCodeSha256 ? 'FACTORY_CODE_CHANGED' : null].filter(Boolean);
    const returned = job?.state === 'returned' ? job.returns.at(-1) : null;
    if (!allowWrites && returned?.snapshotFreshAtReturn === false) reasons.push('STALE_WORKER_RETURN');
    const expectedSources = allowWrites ? (job?.readInputs || []) : (returned?.sourceSnapshot || job?.attemptInputs || job?.sourceInputs || []);
    for (const input of expectedSources) {
      if (await sourceHash(root, input.path, allowWrites ? job.allowedWritePaths : []) !== input.sha256) reasons.push(`SOURCE_CHANGED:${input.path}`);
    }
    return { fresh: reasons.length === 0, currentHead: head, headAdvanced: head !== state.baseHead,
      inputHash, inventorySha256: inventoryHash, boardSha256: boardHash, factoryCodeSha256: codeHash, reasons };
  } catch (error) {
    return { fresh: false, currentHead: null, inputHash: null, reasons: [`INPUT_READ_FAILED:${error.message}`] };
  }
}

async function requireFreshSnapshot(root, state, action, job) {
  const freshness = await snapshotFreshness(root, state, job);
  if (!freshness.fresh) throw new Error(`cannot ${action}: factory snapshot is stale (${freshness.reasons.join(', ')})`);
  return freshness;
}

async function readState(directory) {
  const state = parseJson(await readFile(path.join(directory, 'state.json')), 'state.json');
  if (state.schema !== SCHEMA || !Array.isArray(state.jobs) || !Array.isArray(state.events)) {
    throw new Error('invalid factory state schema');
  }
  return state;
}

async function readAndVerifyPacket(directory, job) {
  const bytes = await readFile(path.join(directory, job.packetPath));
  if (sha256(bytes) !== job.packetSha256) throw new Error(`immutable packet changed: ${job.packetPath}`);
  return parseJson(bytes, job.packetPath);
}

function requireJob(state, id) {
  const job = state.jobs.find((candidate) => candidate.id === id);
  if (!job) throw new Error(`unknown job: ${id}`);
  return job;
}

function assertOwner(job, owner) {
  if (job.claim?.owner !== owner) throw new Error(`job ${job.id} is not claimed by ${owner}`);
}

async function startExistingCheckpoint(root, state, job, owner) {
  const taskId = `factory-${sha256(state.runId).slice(0, 16)}-${job.id}-a${job.attempts}`;
  const file = path.join(root, '.codex', 'agent-checkpoints', `${taskId}.json`);
  const existing = await readOptionalJson(file);
  if (existing) {
    if (existing.owner !== owner || JSON.stringify(existing.paths) !== JSON.stringify(job.allowedWritePaths)) throw new Error('checkpoint identity does not match resumed claim');
    return { taskId, file: path.relative(root, file).replaceAll('\\', '/'), started: 'resumed existing checkpoint' };
  }
  const args = [path.join(root, 'scripts', 'agent-checkpoint.mjs'), 'start', `--task=${taskId}`,
    `--owner=${owner}`, '--next=implement assigned factory packet'];
  for (const allowedPath of job.allowedWritePaths) args.push(`--path=${allowedPath}`);
  for (const todo of ['implement assigned packet', 'run focused owner check', 'return result to controller']) args.push(`--todo=${todo}`);
  let output;
  try {
    output = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 5_000 });
  } catch (error) {
    throw new Error(`existing agent-checkpoint start failed: ${error.stderr || error.message}`);
  }
  return { taskId, file: path.relative(root, file).replaceAll('\\', '/'), started: output.trim() };
}

async function createGlobalGpuLease(root, lease) {
  const finishRoot = path.join(root, FINISH_OUTPUT_ROOT);
  const file = path.join(finishRoot, 'studio-gpu-lease.json');
  await mkdir(finishRoot, { recursive: true });
  const bytes = `${JSON.stringify({ schema: 'spaceface.finishFactoryGpuLease.v1', ...lease, acquiredAt: now() }, null, 2)}\n`;
  try { await createExclusiveFile(file, bytes); }
  catch (error) {
    if (error.code === 'EEXIST') {
      const held = await readOptionalJson(file);
      if (sameLease(held, lease)) return;
      throw new Error(`GPU lease is already held across factory runs: ${JSON.stringify(held)}`);
    }
    throw error;
  }
}

async function factoryCodeHash(root) {
  const inputs = await Promise.all(FACTORY_CODE_PATHS.map(async (file) => [file, await readFile(path.join(root, file))]));
  return hashParts(inputs);
}

async function readWriterLeases(root) {
  const file = path.join(root, FINISH_OUTPUT_ROOT, 'studio-writer-leases.json');
  try {
    const ledger = parseJson(await readFile(file), file);
    if (ledger.schema !== 'spaceface.finishFactoryWriterLeases.v1' || !Array.isArray(ledger.leases)) {
      throw new Error('invalid global writer lease ledger');
    }
    return ledger.leases;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readGlobalResources(root) {
  const gpuPath = path.join(root, FINISH_OUTPUT_ROOT, 'studio-gpu-lease.json');
  let gpuLease = null;
  try { gpuLease = parseJson(await readFile(gpuPath), gpuPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { activeWriters: await readWriterLeases(root), gpuLease };
}

async function writeWriterLeases(root, leases) {
  const directory = path.join(root, FINISH_OUTPUT_ROOT);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, 'studio-writer-leases.json');
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schema: 'spaceface.finishFactoryWriterLeases.v1', leases }, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, target);
}

async function withWriterLeaseLock(root, callback) {
  const directory = path.join(root, FINISH_OUTPUT_ROOT);
  await mkdir(directory, { recursive: true });
  return withFileLock(path.join(directory, '.studio-writer-leases.lock'), callback);
}

function sameLease(left, right) {
  return left?.runId === right.runId && left?.jobId === right.jobId && left?.owner === right.owner && left?.nonce === right.nonce;
}

async function readOptionalJson(file) {
  try { return parseJson(await readFile(file), file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function releaseGlobalGpuLease(root, expected) {
  const file = path.join(root, FINISH_OUTPUT_ROOT, 'studio-gpu-lease.json');
  let held;
  try { held = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!sameLease(held, expected)) {
    throw new Error('refusing to release a GPU lease owned by another factory job');
  }
  await rm(file);
}

function appendEvent(state, action, actor, jobId, detail) {
  state.events.push({ sequence: state.events.length + 1, at: now(), action, actor, jobId, detail });
}

async function withRunLock(directory, callback) {
  return withFileLock(path.join(directory, '.operation.lock'), callback);
}

async function removeOwnedLock(file, nonce) {
  const held = await readOptionalJson(file);
  if (!held || held.nonce !== nonce) throw new Error(`lock nonce changed; refusing removal: ${file}`);
  await rm(file);
}

async function withFileLock(file, callback, { wait = true } = {}) {
  const nonce = randomUUID();
  let acquired = false;
  const stopAt = Date.now() + 10_000;
  while (!acquired) {
    try {
      await createExclusiveFile(file, `${JSON.stringify({ nonce, pid: process.pid, acquiredAt: now() })}\n`);
      acquired = true;
    }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!wait || Date.now() >= stopAt) throw new Error(`lock held at ${file}; no automatic takeover. Inspect list locks; controller recover-lock requires its exact nonce and a stopped operation process.`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await callback();
  } finally {
    await removeOwnedLock(file, nonce);
  }
}

// Publish complete bytes with an exclusive directory entry. A process exit cannot
// leave an empty lock/lease that lacks the identity required for recovery.
async function createExclusiveFile(file, bytes) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try { await link(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}

// A single non-reentrant controller recovery guard serializes explicit lock repair.
// It never guesses native worker liveness or takes over a live operation lock.
export async function recoverFactoryLock({ repoRoot = MODULE_ROOT, runDir, controller, scope, nonce, note }) {
  const { root, directory } = await resolveRunDirectory(repoRoot, runDir);
  const state = await readState(directory);
  if (requiredText(controller, 'controller') !== state.controllerId) throw new Error('only controller may recover locks');
  requiredText(note, 'recovery note');
  if (!['run', 'resources'].includes(scope)) throw new Error('lock scope must be run or resources');
  const file = scope === 'run' ? path.join(directory, '.operation.lock') : path.join(root, FINISH_OUTPUT_ROOT, '.studio-writer-leases.lock');
  const guard = path.join(root, FINISH_OUTPUT_ROOT, '.studio-controller-recovery.lock');
  return withFileLock(guard, async () => {
    const held = await readOptionalJson(file);
    requiredText(nonce, 'lock nonce');
    if (!held) return { recovered: scope, alreadyReleased: true, nonce, controller, note };
    if (held.nonce !== nonce) throw new Error('lock nonce changed');
    if (!Number.isSafeInteger(held.pid) || held.pid <= 0) throw new Error('invalid operation PID; inspect this lock manually');
    try { process.kill(held.pid, 0); throw new Error('operation process is still live; refusing recovery'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    await removeOwnedLock(file, nonce);
    return { recovered: scope, nonce, controller, note };
  }, { wait: false });
}

async function writeState(directory, state) {
  const target = path.join(directory, 'state.json');
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  await rename(temporary, target);
}

function summarizeJob(job) {
  return { id: job.id, state: job.state, itemIds: job.itemIds, assetIds: job.assetIds,
    allowedWritePaths: job.allowedWritePaths, attempts: job.attempts,
    activeClaim: job.claim ? { owner: job.claim.owner, mode: job.claim.mode, resources: job.claim.resources, nonce: job.claim.nonce } : null,
    returnCount: job.returns.length, disposition: job.disposition?.decision || null,
    lastDisposition: job.lastDisposition || null };
}

function currentHead(root) {
  return execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function parseJson(bytes, label) {
  try { return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function hashParts(parts) {
  const hash = createHash('sha256');
  for (const [label, value] of parts) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
    hash.update(`${label.length}:${label}:${buffer.length}:`);
    hash.update(buffer);
  }
  return hash.digest('hex');
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function now() { return new Date().toISOString(); }
function slug(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'factory'; }
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`);
  return number;
}
