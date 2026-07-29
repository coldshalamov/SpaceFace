import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  link as fsLink,
  lstat,
  open,
  readFile,
  rename as fsRename,
  rm,
  stat,
} from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, resolve } from 'node:path';

const COOPERATIVE_LOCK_SCHEMA = 'spaceface-file-set-lock/v1';
const COOPERATIVE_LOCK_KIND = 'spaceface-file-set';
const COOPERATIVE_LOCK_MAX_BYTES = 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function pathExists(path) {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function transactionPath(destination, token, index, suffix) {
  return resolve(
    dirname(destination),
    `.${basename(destination)}.sf-file-set-${token}-${index}.${suffix}`,
  );
}

function cooperativeLockPath(target) {
  return resolve(dirname(target), `.${basename(target)}.sf-file-set.lock`);
}

function compareStablePaths(left, right) {
  const leftFolded = left.toLowerCase();
  const rightFolded = right.toLowerCase();
  if (leftFolded < rightFolded) return -1;
  if (leftFolded > rightFolded) return 1;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function pathKey(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function pathsEqual(left, right) {
  return pathKey(left) === pathKey(right);
}

function cooperativeLockRecords(paths) {
  return [...paths]
    .sort(compareStablePaths)
    .map((destination) => ({
      destination,
      lockPath: cooperativeLockPath(destination),
      handle: null,
      payloadText: null,
    }));
}

function assertPlainObject(value, label) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new Error(
      `${label} keys must be exactly {${expected.join(',')}}; got {${actual.join(',')}}`,
    );
  }
}

function assertAbsoluteNormalizedPath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || resolve(value) !== value) {
    throw new Error(`${label} must be a normalized absolute path`);
  }
}

function assertCooperativeLockToken(value, label = 'cooperative lock token') {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase UUID`);
  }
}

function validateCooperativeLockDocument(document, actualLockPath) {
  assertPlainObject(document, 'cooperative lock document');
  assertExactKeys(
    document,
    ['schema', 'kind', 'token', 'owner', 'target', 'lockPath', 'participants', 'artifacts'],
    'cooperative lock document',
  );
  if (document.schema !== COOPERATIVE_LOCK_SCHEMA) {
    throw new Error(`unknown cooperative lock schema: ${String(document.schema)}`);
  }
  if (document.kind !== COOPERATIVE_LOCK_KIND) {
    throw new Error(`unknown cooperative lock kind: ${String(document.kind)}`);
  }
  assertCooperativeLockToken(document.token);

  assertPlainObject(document.owner, 'cooperative lock owner');
  assertExactKeys(
    document.owner,
    ['pid', 'hostname', 'createdAt'],
    'cooperative lock owner',
  );
  if (!Number.isSafeInteger(document.owner.pid) || document.owner.pid < 1) {
    throw new Error('cooperative lock owner PID must be a positive safe integer');
  }
  if (typeof document.owner.hostname !== 'string'
    || document.owner.hostname.length === 0
    || document.owner.hostname.length > 255) {
    throw new Error('cooperative lock owner hostname must be non-empty');
  }
  if (typeof document.owner.createdAt !== 'string'
    || !Number.isFinite(Date.parse(document.owner.createdAt))
    || new Date(document.owner.createdAt).toISOString() !== document.owner.createdAt) {
    throw new Error('cooperative lock owner createdAt must be an ISO timestamp');
  }

  assertAbsoluteNormalizedPath(document.target, 'cooperative lock target');
  assertAbsoluteNormalizedPath(document.lockPath, 'cooperative lock path');
  if (!pathsEqual(document.lockPath, actualLockPath)) {
    throw new Error(
      `cooperative lock document path mismatch: ${document.lockPath} != ${actualLockPath}`,
    );
  }
  const expectedSelectedLockPath = cooperativeLockPath(document.target);
  if (!pathsEqual(document.lockPath, expectedSelectedLockPath)) {
    throw new Error(
      `cooperative lock path does not belong to target: `
      + `${document.lockPath} != ${expectedSelectedLockPath}`,
    );
  }

  if (!Array.isArray(document.participants) || document.participants.length === 0) {
    throw new Error('cooperative lock participants must be a non-empty array');
  }
  const participantTargets = new Set();
  const participantLockPaths = new Set();
  document.participants.forEach((participant, index) => {
    assertPlainObject(participant, `cooperative lock participant ${index}`);
    assertExactKeys(
      participant,
      ['target', 'lockPath', 'role'],
      `cooperative lock participant ${index}`,
    );
    assertAbsoluteNormalizedPath(
      participant.target,
      `cooperative lock participant ${index} target`,
    );
    assertAbsoluteNormalizedPath(
      participant.lockPath,
      `cooperative lock participant ${index} path`,
    );
    const expectedLockPath = cooperativeLockPath(participant.target);
    if (!pathsEqual(participant.lockPath, expectedLockPath)) {
      throw new Error(
        `cooperative lock participant ${index} path does not belong to target`,
      );
    }
    if (participant.role !== 'destination' && participant.role !== 'guard') {
      throw new Error(
        `cooperative lock participant ${index} role must be destination or guard`,
      );
    }
    const targetKey = pathKey(participant.target);
    const lockPathKey = pathKey(participant.lockPath);
    if (participantTargets.has(targetKey)) {
      throw new Error(`duplicate cooperative lock participant target: ${participant.target}`);
    }
    if (participantLockPaths.has(lockPathKey)) {
      throw new Error(`duplicate cooperative lock participant path: ${participant.lockPath}`);
    }
    participantTargets.add(targetKey);
    participantLockPaths.add(lockPathKey);
    if (index > 0
      && compareStablePaths(document.participants[index - 1].target, participant.target) >= 0) {
      throw new Error('cooperative lock participants are not in deterministic path order');
    }
  });
  if (!document.participants.some(
    (participant) => pathsEqual(participant.target, document.target)
      && pathsEqual(participant.lockPath, document.lockPath),
  )) {
    throw new Error('cooperative lock selected target is absent from participants');
  }

  const destinationParticipantTargets = new Set(
    document.participants
      .filter((participant) => participant.role === 'destination')
      .map((participant) => pathKey(participant.target)),
  );
  if (!Array.isArray(document.artifacts)
    || document.artifacts.length === 0
    || document.artifacts.length !== destinationParticipantTargets.size) {
    throw new Error(
      'cooperative lock artifacts must map every destination participant exactly once',
    );
  }
  const artifactDestinations = new Set();
  const artifactPaths = new Set();
  document.artifacts.forEach((artifact, index) => {
    assertPlainObject(artifact, `cooperative lock artifact ${index}`);
    assertExactKeys(
      artifact,
      ['index', 'destination', 'staged', 'backup'],
      `cooperative lock artifact ${index}`,
    );
    if (artifact.index !== index) {
      throw new Error(
        `cooperative lock artifact index must be contiguous: expected ${index}, `
        + `got ${String(artifact.index)}`,
      );
    }
    assertAbsoluteNormalizedPath(
      artifact.destination,
      `cooperative lock artifact ${index} destination`,
    );
    assertAbsoluteNormalizedPath(
      artifact.staged,
      `cooperative lock artifact ${index} staged path`,
    );
    assertAbsoluteNormalizedPath(
      artifact.backup,
      `cooperative lock artifact ${index} backup path`,
    );
    if (!destinationParticipantTargets.has(pathKey(artifact.destination))) {
      throw new Error(
        `cooperative lock artifact ${index} destination is not a destination participant`,
      );
    }
    const destinationKey = pathKey(artifact.destination);
    if (artifactDestinations.has(destinationKey)) {
      throw new Error(`duplicate cooperative lock artifact destination: ${artifact.destination}`);
    }
    artifactDestinations.add(destinationKey);
    const expectedStaged = transactionPath(
      artifact.destination,
      document.token,
      index,
      'tmp',
    );
    const expectedBackup = transactionPath(
      artifact.destination,
      document.token,
      index,
      'bak',
    );
    if (!pathsEqual(artifact.staged, expectedStaged)
      || !pathsEqual(artifact.backup, expectedBackup)) {
      throw new Error(`cooperative lock artifact ${index} paths do not match its token`);
    }
    for (const artifactPath of [artifact.staged, artifact.backup]) {
      const key = pathKey(artifactPath);
      if (artifactPaths.has(key)) {
        throw new Error(`duplicate cooperative lock recovery artifact path: ${artifactPath}`);
      }
      artifactPaths.add(key);
    }
  });
  for (const destinationTarget of destinationParticipantTargets) {
    if (!artifactDestinations.has(destinationTarget)) {
      throw new Error(
        'cooperative lock artifacts omit a destination participant',
      );
    }
  }

  return document;
}

async function readValidatedCooperativeLock(lockPath) {
  if (typeof lockPath !== 'string' || lockPath.trim().length === 0) {
    throw new TypeError('cooperative lock inspection requires a non-empty lock path');
  }
  const resolvedLockPath = resolve(lockPath.trim());
  let lockStat;
  try {
    lockStat = await lstat(resolvedLockPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`cooperative lock does not exist: ${resolvedLockPath}`, { cause: error });
    }
    throw error;
  }
  if (!lockStat.isFile() || lockStat.isSymbolicLink()) {
    throw new Error(`cooperative lock must be a regular non-symlink file: ${resolvedLockPath}`);
  }
  if (lockStat.size < 2 || lockStat.size > COOPERATIVE_LOCK_MAX_BYTES) {
    throw new Error(
      `cooperative lock size is outside the safe inspection range: `
      + `${resolvedLockPath} (${lockStat.size} bytes)`,
    );
  }
  const payloadText = await readFile(resolvedLockPath, 'utf8');
  let document;
  try {
    document = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`cooperative lock is not valid JSON: ${resolvedLockPath}`, { cause: error });
  }
  validateCooperativeLockDocument(document, resolvedLockPath);
  return { document, payloadText };
}

function cooperativeLockTransactionIdentity(document) {
  return JSON.stringify({
    schema: document.schema,
    kind: document.kind,
    token: document.token,
    owner: document.owner,
    participants: document.participants,
    artifacts: document.artifacts,
  });
}

async function inspectRecoveryArtifact(artifact, role) {
  const path = artifact[role];
  try {
    const artifactStat = await lstat(path);
    let status = 'other';
    if (artifactStat.isFile()) status = 'file';
    else if (artifactStat.isDirectory()) status = 'directory';
    else if (artifactStat.isSymbolicLink()) status = 'symlink';
    return {
      index: artifact.index,
      destination: artifact.destination,
      role,
      path,
      status,
      bytes: artifactStat.size,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return {
        index: artifact.index,
        destination: artifact.destination,
        role,
        path,
        status: 'missing',
        bytes: null,
      };
    }
    return {
      index: artifact.index,
      destination: artifact.destination,
      role,
      path,
      status: 'unreadable',
      bytes: null,
      error: error.message,
    };
  }
}

function probeLocalOwnerProcess(owner) {
  if (owner.hostname.toLowerCase() !== hostname().toLowerCase()) {
    return {
      status: 'unknown',
      detail: `owner host ${owner.hostname} does not match local host ${hostname()}`,
    };
  }
  try {
    process.kill(owner.pid, 0);
    return { status: 'alive', detail: null };
  } catch (error) {
    if (error?.code === 'ESRCH') return { status: 'dead', detail: null };
    if (error?.code === 'EPERM') {
      return { status: 'alive', detail: 'process exists but cannot be signaled' };
    }
    return {
      status: 'unknown',
      detail: `owner process probe failed: ${error.message}`,
    };
  }
}

/**
 * Read-only recovery inventory for a cooperative file-set lock. The inventory
 * validates the selected lock, every still-present participant lock, and every
 * transaction-owned .tmp/.bak path. Age is intentionally not a recovery
 * signal: only a validated same-host dead owner with no unresolved artifacts
 * or conflicting locks is reclaimable.
 */
export async function inspectFileSetCooperativeLock(lockPath) {
  const selected = await readValidatedCooperativeLock(lockPath);
  const { document } = selected;
  const selectedIdentity = cooperativeLockTransactionIdentity(document);
  const participantLocks = [];
  for (const participant of document.participants) {
    try {
      const associated = await readValidatedCooperativeLock(participant.lockPath);
      const sameTransaction = cooperativeLockTransactionIdentity(associated.document)
        === selectedIdentity;
      participantLocks.push({
        target: participant.target,
        lockPath: participant.lockPath,
        status: sameTransaction ? 'owned' : 'conflict',
        token: associated.document.token,
        error: sameTransaction ? null : 'lock metadata belongs to a different transaction',
      });
    } catch (error) {
      if (error?.cause?.code === 'ENOENT') {
        participantLocks.push({
          target: participant.target,
          lockPath: participant.lockPath,
          status: 'missing',
          token: null,
          error: null,
        });
      } else {
        participantLocks.push({
          target: participant.target,
          lockPath: participant.lockPath,
          status: 'invalid',
          token: null,
          error: error.message,
        });
      }
    }
  }

  const artifacts = [];
  for (const artifact of document.artifacts) {
    artifacts.push(await inspectRecoveryArtifact(artifact, 'staged'));
    artifacts.push(await inspectRecoveryArtifact(artifact, 'backup'));
  }
  const ownerProbe = probeLocalOwnerProcess(document.owner);
  const blockers = [];
  if (ownerProbe.status === 'alive') {
    blockers.push(`owner PID appears alive: ${document.owner.pid}`);
  } else if (ownerProbe.status !== 'dead') {
    blockers.push(`owner status is unknown: ${ownerProbe.detail}`);
  }
  for (const participant of participantLocks) {
    if (participant.status === 'conflict' || participant.status === 'invalid') {
      blockers.push(
        `associated lock ${participant.status}: ${participant.lockPath}`
        + `${participant.error ? ` (${participant.error})` : ''}`,
      );
    }
  }
  for (const artifact of artifacts) {
    if (artifact.status !== 'missing') {
      blockers.push(
        `unresolved ${artifact.role} recovery artifact: ${artifact.path} `
        + `(${artifact.status})`,
      );
    }
  }

  return {
    schema: document.schema,
    kind: document.kind,
    token: document.token,
    owner: { ...document.owner },
    target: document.target,
    lockPath: document.lockPath,
    ownerStatus: ownerProbe.status,
    ownerStatusDetail: ownerProbe.detail,
    participantLocks,
    artifacts,
    reclaimable: blockers.length === 0,
    blockers,
  };
}

/**
 * Explicitly reclaim all still-present locks belonging to one validated,
 * artifact-free, dead-owner transaction. The caller must echo the inspected
 * token. Unknown, malformed, live-owner, remote-owner, artifact-bearing, or
 * conflicting locks are retained fail-closed.
 */
export async function reclaimOrphanedFileSetLocks({
  lockPath,
  expectedToken,
} = {}) {
  assertCooperativeLockToken(expectedToken, 'expected cooperative lock token');
  // Inspect twice so ownership, lock membership, and recovery-artifact
  // inventory are current immediately before the first removal.
  let inspection = await inspectFileSetCooperativeLock(lockPath);
  if (inspection.token !== expectedToken) {
    throw new Error(
      `cooperative lock token confirmation failed: expected ${expectedToken}, `
      + `got ${inspection.token}`,
    );
  }
  inspection = await inspectFileSetCooperativeLock(lockPath);
  if (inspection.token !== expectedToken) {
    throw new Error('cooperative lock token changed during recovery inspection');
  }
  if (!inspection.reclaimable) {
    throw new Error(
      `cooperative lock recovery refused fail-closed: ${inspection.blockers.join('; ')}`,
    );
  }

  const selected = await readValidatedCooperativeLock(lockPath);
  const expectedIdentity = cooperativeLockTransactionIdentity(selected.document);
  const ownedLocks = inspection.participantLocks
    .filter((participant) => participant.status === 'owned')
    .sort((left, right) => compareStablePaths(right.lockPath, left.lockPath));
  const removedLockPaths = [];
  for (const participant of ownedLocks) {
    const current = await readValidatedCooperativeLock(participant.lockPath);
    if (current.document.token !== expectedToken
      || cooperativeLockTransactionIdentity(current.document) !== expectedIdentity) {
      throw new Error(
        `cooperative lock changed before reclaim: ${participant.lockPath}; `
        + `already removed: ${removedLockPaths.join(', ') || '<none>'}`,
      );
    }
    await rm(participant.lockPath);
    removedLockPaths.push(participant.lockPath);
  }
  return {
    token: expectedToken,
    removedLockPaths,
    missingLockPaths: inspection.participantLocks
      .filter((participant) => participant.status === 'missing')
      .map((participant) => participant.lockPath),
  };
}

function buildCooperativeLockContext(records, lockRecords, token) {
  const destinationPaths = new Set(records.map((record) => pathKey(record.destination)));
  return {
    schema: COOPERATIVE_LOCK_SCHEMA,
    kind: COOPERATIVE_LOCK_KIND,
    token,
    owner: {
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
    },
    participants: lockRecords.map((record) => ({
      target: record.destination,
      lockPath: record.lockPath,
      role: destinationPaths.has(pathKey(record.destination)) ? 'destination' : 'guard',
    })),
    artifacts: records.map((record, index) => ({
      index,
      destination: record.destination,
      staged: record.staged,
      backup: record.backup,
    })),
  };
}

async function acquireCooperativeLock(record, context) {
  record.payloadText = `${JSON.stringify({
    ...context,
    target: record.destination,
    lockPath: record.lockPath,
  }, null, 2)}\n`;
  try {
    record.handle = await open(record.lockPath, 'wx');
    await record.handle.writeFile(record.payloadText);
    await record.handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`cooperative lock already held: ${record.lockPath}`, { cause: error });
    }
    if (record.handle) {
      try {
        await record.handle.close();
      } finally {
        record.handle = null;
        await rm(record.lockPath, { force: true });
      }
    }
    throw error;
  }
}

async function releaseCooperativeLocks(records) {
  const errors = [];
  for (const record of [...records].reverse()) {
    if (!record.handle) continue;
    let matchesOwnedPayload = false;
    try {
      matchesOwnedPayload = await readFile(record.lockPath, 'utf8') === record.payloadText;
      if (!matchesOwnedPayload) {
        errors.push(`${record.lockPath}: contents changed; unknown lock retained`);
      }
    } catch (error) {
      errors.push(`${record.lockPath}: ownership revalidation failed: ${error.message}`);
    }
    try {
      await record.handle.close();
    } catch (error) {
      errors.push(`${record.lockPath}: close failed: ${error.message}`);
    }
    if (matchesOwnedPayload) {
      try {
        await rm(record.lockPath);
      } catch (error) {
        errors.push(`${record.lockPath}: remove failed: ${error.message}`);
      }
    }
    record.handle = null;
  }
  return errors;
}

async function writeDurableExclusive(path, bytes) {
  const handle = await open(path, 'wx');
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function cleanup(records, removeFile, includeBackups) {
  const errors = [];
  for (const record of records) {
    const paths = [record.staged, ...(includeBackups ? [record.backup] : [])];
    for (const path of paths) {
      try {
        await removeFile(path, { force: true });
      } catch (error) {
        errors.push(`${path}: ${error.message}`);
      }
    }
  }
  return errors;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function currentSha256(path) {
  if (!await pathExists(path)) return null;
  return sha256(await readFile(path));
}

async function assertCurrentHashPrecondition(record) {
  if (!record.hasCurrentHashPrecondition) return;
  const actualCurrentSha256 = await currentSha256(record.destination);
  if (actualCurrentSha256 !== record.expectedCurrentSha256) {
    throw new Error(
      `current SHA-256 changed: expected ${record.expectedCurrentSha256 ?? '<missing>'}, `
      + `got ${actualCurrentSha256 ?? '<missing>'}`,
    );
  }
}

/**
 * Durably stage and validate an arbitrary same-volume file set before replacing
 * any destination. A file descriptor may include `expectedCurrentSha256` (a
 * digest, or null when the destination must not exist) to reject stale
 * publication. A guard descriptor requires `path` and `expectedCurrentSha256`;
 * guards are checked before and throughout promotion but are never staged,
 * moved, or rewritten. Deterministically ordered cooperative locks cover every
 * destination and guard from the final precondition check through promotion,
 * rollback, and cleanup. The staged-to-live hop uses atomic no-replace hard-link
 * creation, so a noncooperating destination recreation fails rather than being
 * overwritten. A failed promotion restores every original in reverse order
 * through the same atomic no-replace primitive.
 */
export async function publishFileSetTransaction({ files, guards = [], fileOps = {} } = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new TypeError('file-set publish requires at least one file descriptor');
  }
  if (!Array.isArray(guards)) {
    throw new TypeError('file-set publish guards must be an array');
  }
  files.forEach((file, index) => {
    if (typeof file?.path !== 'string' || file.path.trim().length === 0) {
      throw new TypeError(`file-set descriptor ${index} requires a non-empty path`);
    }
    if (!Object.prototype.hasOwnProperty.call(file, 'bytes') || file.bytes == null) {
      throw new TypeError(`file-set descriptor ${index} requires bytes`);
    }
    if (typeof file.validate !== 'function') {
      throw new TypeError(`file-set descriptor ${index} requires a staged-file validator`);
    }
    if (Object.prototype.hasOwnProperty.call(file, 'expectedCurrentSha256')) {
      const expected = file.expectedCurrentSha256;
      if (expected !== null && (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected))) {
        throw new TypeError(
          `file-set descriptor ${index} expectedCurrentSha256 must be a SHA-256 digest or null`,
        );
      }
    }
  });
  guards.forEach((guard, index) => {
    if (typeof guard?.path !== 'string' || guard.path.trim().length === 0) {
      throw new TypeError(`file-set guard ${index} requires a non-empty path`);
    }
    if (!Object.prototype.hasOwnProperty.call(guard, 'expectedCurrentSha256')) {
      throw new TypeError(`file-set guard ${index} requires expectedCurrentSha256`);
    }
    const expected = guard.expectedCurrentSha256;
    if (expected !== null && (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected))) {
      throw new TypeError(
        `file-set guard ${index} expectedCurrentSha256 must be a SHA-256 digest or null`,
      );
    }
  });

  const destinations = files.map((file) => resolve(file.path.trim()));
  if (new Set(destinations.map((path) => path.toLowerCase())).size !== destinations.length) {
    throw new TypeError('file-set publish destinations must be distinct');
  }
  const guardPaths = guards.map((guard) => resolve(guard.path.trim()));
  const allPaths = [...destinations, ...guardPaths].map((path) => path.toLowerCase());
  if (new Set(allPaths).size !== allPaths.length) {
    throw new TypeError('file-set publish destinations and guards must be distinct');
  }
  for (const destination of destinations) {
    if (await pathExists(destination) && (await stat(destination)).isDirectory()) {
      throw new TypeError(`file-set publish destination must be a file: ${destination}`);
    }
  }
  for (const guardPath of guardPaths) {
    if (await pathExists(guardPath) && (await stat(guardPath)).isDirectory()) {
      throw new TypeError(`file-set publish guard must be a file: ${guardPath}`);
    }
  }
  const devices = await Promise.all(destinations.map(async (path) => (await stat(dirname(path))).dev));
  if (new Set(devices.map(String)).size !== 1) {
    throw new Error(`file-set publish requires one filesystem device; got ${destinations.join(', ')}`);
  }

  const renameFile = fileOps.rename || fsRename;
  const linkFile = fileOps.link || fsLink;
  const removeFile = fileOps.remove || rm;
  const token = randomUUID();
  const records = files.map((file, index) => ({
    destination: destinations[index],
    bytes: Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes),
    promotedSha256: sha256(Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes)),
    validate: file.validate,
    hasCurrentHashPrecondition: Object.prototype.hasOwnProperty.call(file, 'expectedCurrentSha256'),
    expectedCurrentSha256: typeof file.expectedCurrentSha256 === 'string'
      ? file.expectedCurrentSha256.toLowerCase()
      : file.expectedCurrentSha256,
    staged: transactionPath(destinations[index], token, index, 'tmp'),
    backup: transactionPath(destinations[index], token, index, 'bak'),
    backedUp: false,
    promoted: false,
  }));
  const guardRecords = guards.map((guard) => ({
    destination: resolve(guard.path.trim()),
    hasCurrentHashPrecondition: true,
    expectedCurrentSha256: typeof guard.expectedCurrentSha256 === 'string'
      ? guard.expectedCurrentSha256.toLowerCase()
      : guard.expectedCurrentSha256,
  }));
  const lockRecords = cooperativeLockRecords([...destinations, ...guardPaths]);
  const lockContext = buildCooperativeLockContext(records, lockRecords, token);

  let phase = 'staging';
  let current = records[0];
  let primaryError = null;
  const rollbackErrors = [];
  try {
    for (const record of records) {
      current = record;
      await writeDurableExclusive(record.staged, record.bytes);
    }

    phase = 'validating';
    for (const record of records) {
      current = record;
      await record.validate(record.staged, await readFile(record.staged));
    }

    phase = 'acquiring cooperative locks';
    for (const lock of lockRecords) {
      current = lock;
      await acquireCooperativeLock(lock, lockContext);
    }

    phase = 'checking current-hash preconditions';
    for (const record of records) {
      current = record;
      await assertCurrentHashPrecondition(record);
    }

    phase = 'checking read-only guards';
    for (const guard of guardRecords) {
      current = guard;
      await assertCurrentHashPrecondition(guard);
    }

    phase = 'promoting';
    for (const record of records) {
      for (const guard of guardRecords) {
        current = guard;
        await assertCurrentHashPrecondition(guard);
      }
      current = record;
      // Revalidate while all cooperative path locks are held. Late guard or
      // destination conflicts roll back already-promoted records.
      await assertCurrentHashPrecondition(record);
      if (await pathExists(record.destination)) {
        await renameFile(record.destination, record.backup);
        record.backedUp = true;
        await assertCurrentHashPrecondition({
          ...record,
          destination: record.backup,
        });
      }
      if (await pathExists(record.destination)) {
        throw new Error(
          `destination recreated after backup or appeared before promotion: `
          + `${record.destination}`,
        );
      }
      try {
        await linkFile(record.staged, record.destination);
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error(
            `destination recreated at atomic no-replace promotion: ${record.destination}`,
            { cause: error },
          );
        }
        throw error;
      }
      record.promoted = true;
      if (record.backedUp) {
        await assertCurrentHashPrecondition({
          ...record,
          destination: record.backup,
        });
      }
      await removeFile(record.staged, { force: true });
      for (const guard of guardRecords) {
        current = guard;
        await assertCurrentHashPrecondition(guard);
      }
    }
  } catch (error) {
    primaryError = error;
    for (const record of [...records].reverse()) {
      try {
        if (record.promoted) {
          const currentPromotedSha256 = await currentSha256(record.destination);
          if (currentPromotedSha256 !== record.promotedSha256) {
            rollbackErrors.push(
              `${record.destination}: externally changed after promotion `
              + `(${record.promotedSha256} -> ${currentPromotedSha256 ?? '<missing>'}); `
              + `destination and backup retained`,
            );
            continue;
          }
          await removeFile(record.destination, { force: true });
        } else if (record.backedUp && await pathExists(record.destination)) {
          rollbackErrors.push(
            `${record.destination}: externally recreated after backup; destination and backup retained`,
          );
          continue;
        }
        if (record.backedUp) {
          try {
            await linkFile(record.backup, record.destination);
          } catch (rollbackError) {
            if (rollbackError?.code === 'EEXIST') {
              rollbackErrors.push(
                `${record.destination}: destination recreated at atomic no-replace `
                + `rollback restore; destination and backup retained`,
              );
              continue;
            }
            throw rollbackError;
          }
          await removeFile(record.backup);
          record.backedUp = false;
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${record.backup} -> ${record.destination}: ${rollbackError.message}`);
      }
    }
  }

  if (primaryError) {
    const cleanupErrors = await cleanup(records, removeFile, rollbackErrors.length === 0);
    const lockReleaseErrors = await releaseCooperativeLocks(lockRecords);
    const rollbackDetail = rollbackErrors.length
      ? `rollback incomplete (${rollbackErrors.join('; ')}); backups retained`
      : 'original destinations restored';
    const cleanupDetail = cleanupErrors.length ? `; cleanup failed (${cleanupErrors.join('; ')})` : '';
    const lockDetail = lockReleaseErrors.length
      ? `; cooperative lock release failed (${lockReleaseErrors.join('; ')})`
      : '';
    throw new Error(
      `file-set publish failed while ${phase} "${current.destination}": `
      + `${primaryError.message}; ${rollbackDetail}${cleanupDetail}${lockDetail}`,
      { cause: primaryError },
    );
  }

  const cleanupErrors = await cleanup(records, removeFile, true);
  const lockReleaseErrors = await releaseCooperativeLocks(lockRecords);
  if (cleanupErrors.length || lockReleaseErrors.length) {
    const details = [
      ...(cleanupErrors.length ? [`cleanup failed: ${cleanupErrors.join('; ')}`] : []),
      ...(lockReleaseErrors.length
        ? [`cooperative lock release failed: ${lockReleaseErrors.join('; ')}`]
        : []),
    ];
    throw new Error(`file-set publish completed but ${details.join('; ')}`);
  }
  return destinations;
}
