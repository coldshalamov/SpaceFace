// SAFE-001 lease manager (repair-1). Enforces the Alpha topology numerically:
// at most ONE code_mutation lease and ONE blender_mutation lease at a time.
//
// Repair-1 changes (SAFE-001-REPAIR defects 2/4 + advisory LEASE-01/02):
//  - reclaim of an expired lease is serialized through an atomic lock directory,
//    so two racing reclaimers cannot both win;
//  - every lease carries an owner token; heartbeat and release require it, so a
//    displaced old owner cannot release or beat a successor's lease;
//  - heartbeat re-reads the file and verifies id+token, so a swapped/forged
//    lease file latches LEASE_LOST instead of being silently accepted;
//  - a corrupt lease file FAILS CLOSED (no silent reclaim); recovery is an
//    explicit controller action (healCorruptLease) that preserves evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { nowIso, isoPlusSeconds, readJson, atomicWriteJson } from './util.mjs';

export const LEASE_KINDS = ['code_mutation', 'blender_mutation', 'read_only'];
const RECLAIM_LOCK_STALE_MS = 30_000;

function leasePath(controlRoot, kind) {
  return path.join(controlRoot, 'leases', `${kind}.json`);
}

export function leaseHeartbeatTempRelativePath(kind, leaseId) {
  if (!LEASE_KINDS.includes(kind)) throw new Error(`unknown lease kind: ${kind}`);
  if (typeof leaseId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(leaseId)) {
    throw new Error('lease id is not safe for heartbeat temp path');
  }
  return `leases/.${kind}.json.${leaseId}.heartbeat.tmp`;
}

function isExpired(lease) {
  return Date.parse(lease.expiresAt) < Date.now();
}

function journalLease(controlRoot, lease) {
  const journal = path.join(controlRoot, 'leases', 'journal');
  fs.mkdirSync(journal, { recursive: true });
  atomicWriteJson(path.join(journal, `${lease.id}.json`), lease);
}

// Acquire a lease. Fails if a live (unexpired) lease of the same kind exists,
// fails CLOSED on a corrupt lease file, and serializes expired-lease reclaim
// through an atomic lock directory.
export function acquireLease(controlRoot, { kind, packetId, holder, ttlSeconds = 900 }) {
  if (!LEASE_KINDS.includes(kind)) throw new Error(`unknown lease kind: ${kind}`);
  const file = leasePath(controlRoot, kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const record = {
    id: `${kind}-${crypto.randomBytes(6).toString('hex')}`,
    token: crypto.randomBytes(16).toString('hex'),
    kind,
    status: 'active',
    packetId,
    holder,
    pid: process.pid,
    acquiredAt: nowIso(),
    heartbeatAt: nowIso(),
    expiresAt: isoPlusSeconds(ttlSeconds),
    ttlSeconds,
    reclaimedFrom: null,
  };

  // read_only leases are journal entries, not exclusive lanes.
  if (kind === 'read_only') {
    const roFile = path.join(controlRoot, 'leases', `read_only-${record.id}.json`);
    atomicWriteJson(roFile, record);
    return { ...record, file: roFile };
  }

  try {
    fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    return { ...record, file };
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }

  // A lease file exists. Corrupt -> FAIL CLOSED. Live -> refuse. Expired or
  // released -> serialized reclaim.
  let existing;
  try {
    existing = readJson(file);
  } catch {
    const evidence = `${file}.corrupt.${Date.now()}`;
    fs.copyFileSync(file, evidence);
    const err = new Error(
      `lease file for ${kind} is corrupt — failing closed. Evidence preserved at ${evidence}. ` +
      `Recovery requires an explicit controller healCorruptLease() call.`
    );
    err.code = 'LEASE_CORRUPT';
    err.evidence = evidence;
    throw err;
  }
  if (existing.status === 'active' && !isExpired(existing)) {
    const err = new Error(
      `lease ${kind} is held by packet=${existing.packetId} holder=${existing.holder} pid=${existing.pid} until ${existing.expiresAt}`
    );
    err.code = 'LEASE_HELD';
    err.existing = existing;
    throw err;
  }

  // Expired/released: reclaim under an atomic lock so exactly one succeeds.
  const lockDir = `${file}.reclaim.lock`;
  try {
    fs.mkdirSync(lockDir);
  } catch (e) {
    if (e.code === 'EEXIST') {
      // A concurrent reclaimer holds the lock. If it crashed long ago, clear it;
      // otherwise refuse — the winner will hold the lane.
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(lockDir).mtimeMs > RECLAIM_LOCK_STALE_MS;
      } catch { /* raced away */ }
      if (stale) {
        try { fs.rmdirSync(lockDir); } catch { /* raced */ }
      }
      const err = new Error(`lease ${kind} reclaim is in progress by another process`);
      err.code = 'LEASE_RECLAIM_RACE';
      throw err;
    }
    throw e;
  }

  try {
    // Re-check under the lock: a winner may have already installed a live lease.
    let current = null;
    try {
      current = readJson(file);
    } catch { /* absent or corrupt-raced; treat as absent */ }
    if (current && current.status === 'active' && !isExpired(current)) {
      const err = new Error(`lease ${kind} was reclaimed by another process during the race`);
      err.code = 'LEASE_HELD';
      err.existing = current;
      throw err;
    }
    if (current) journalLease(controlRoot, { ...current, status: 'expired_reclaimed', reclaimNote: `reclaimed by ${record.id}` });
    record.reclaimedFrom = current
      ? { packetId: current.packetId, holder: current.holder, pid: current.pid, status: current.status, expiresAt: current.expiresAt }
      : 'missing-lease-file';
    fs.rmSync(file, { force: true });
    fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    return { ...record, file };
  } finally {
    try { fs.rmdirSync(lockDir); } catch { /* already removed */ }
  }
}

// Heartbeat requires the owner token. Any mismatch (foreign file, successor
// lease, tampered content) throws LEASE_LOST — callers must treat that as a
// latched violation: kill the worker and keep guards up.
export function heartbeatLease(controlRoot, kind, leaseId, token) {
  const file = leasePath(controlRoot, kind);
  let lease;
  try {
    lease = readJson(file);
  } catch {
    const err = new Error('heartbeat refused: lease file missing or unreadable (lost the lane)');
    err.code = 'LEASE_LOST';
    throw err;
  }
  if (lease.id !== leaseId || lease.token !== token) {
    const err = new Error(`heartbeat refused: lease file holds ${lease.id}, not ${leaseId} with matching token (lost the lane)`);
    err.code = 'LEASE_LOST';
    throw err;
  }
  lease.heartbeatAt = nowIso();
  lease.expiresAt = isoPlusSeconds(lease.ttlSeconds);
  atomicWriteJson(file, lease, {
    tmpPath: path.join(controlRoot, leaseHeartbeatTempRelativePath(kind, leaseId)),
  });
  // Read back and verify: if a concurrent writer swapped the file between our
  // read and write, the rename wins/loses atomically — verify we still own it.
  const after = readJson(file);
  if (after.id !== leaseId || after.token !== token) {
    const err = new Error('heartbeat read-back failed: lease was replaced concurrently');
    err.code = 'LEASE_LOST';
    throw err;
  }
  return after;
}

export function releaseLease(controlRoot, kind, leaseId, token, finalStatus = 'released') {
  if (!['released', 'violated'].includes(finalStatus)) throw new Error(`bad final status ${finalStatus}`);
  const file = leasePath(controlRoot, kind);
  let lease;
  try {
    lease = readJson(file);
  } catch {
    return null;
  }
  // Old-owner release race: a displaced owner (wrong id or token) may not
  // release a successor's lease.
  if (lease.id !== leaseId || lease.token !== token) return null;
  lease.status = finalStatus;
  lease.releasedAt = nowIso();
  journalLease(controlRoot, lease);
  fs.rmSync(file, { force: true });
  return lease;
}

// Post-containment cleanup for a runner whose lease file may have been
// overwritten by the worker. The caller supplies the lease object retained in
// controller memory from acquireLease(); no field is read from the untrusted
// on-disk record. Once worker descendants are gone, reassert the exact owner
// identity, then release through the normal token-checked path so the audit
// journal is written and the exclusive lane is physically freed.
export function reassertAndReleaseLease(controlRoot, trustedLease, finalStatus = 'released') {
  if (!trustedLease || !LEASE_KINDS.includes(trustedLease.kind) || trustedLease.kind === 'read_only') {
    throw new Error('trusted exclusive lease record required for cleanup');
  }
  if (!trustedLease.id || !trustedLease.token) {
    throw new Error('trusted lease cleanup requires in-memory id and token');
  }
  if (!['released', 'violated'].includes(finalStatus)) throw new Error(`bad final status ${finalStatus}`);

  const file = leasePath(controlRoot, trustedLease.kind);
  const reassertedAt = nowIso();
  const authoritative = {
    id: trustedLease.id,
    token: trustedLease.token,
    kind: trustedLease.kind,
    status: 'active',
    packetId: trustedLease.packetId,
    holder: trustedLease.holder,
    pid: trustedLease.pid,
    acquiredAt: trustedLease.acquiredAt,
    heartbeatAt: reassertedAt,
    expiresAt: isoPlusSeconds(Math.max(1, Number(trustedLease.ttlSeconds) || 1)),
    ttlSeconds: trustedLease.ttlSeconds,
    reclaimedFrom: trustedLease.reclaimedFrom ?? null,
    cleanupReassertedAt: reassertedAt,
  };

  // The worker is contained at this point. Remove arbitrary bytes first, then
  // atomically publish controller-owned authority and verify before release.
  fs.rmSync(file, { force: true });
  atomicWriteJson(file, authoritative);
  const check = readJson(file);
  if (check.id !== trustedLease.id || check.token !== trustedLease.token) {
    const error = new Error('trusted lease reassertion read-back mismatch');
    error.code = 'LEASE_REASSERT_FAILED';
    throw error;
  }
  const released = releaseLease(
    controlRoot, trustedLease.kind, trustedLease.id, trustedLease.token, finalStatus
  );
  if (!released || fs.existsSync(file)) {
    const error = new Error('trusted lease cleanup failed to free the exclusive lane');
    error.code = 'LEASE_RELEASE_FAILED';
    throw error;
  }
  return {
    mode: 'trusted-owner-reassert-release',
    leaseId: trustedLease.id,
    kind: trustedLease.kind,
    finalStatus,
    reassertedAt,
    releasedAt: released.releasedAt,
    laneFreed: true,
  };
}

export function currentLease(controlRoot, kind) {
  try {
    const lease = readJson(leasePath(controlRoot, kind));
    return { ...lease, expired: isExpired(lease) };
  } catch {
    return null;
  }
}

// Explicit controller recovery for a corrupt lease file. Preserves the corrupt
// bytes in the journal, then frees the lane. Never called automatically.
export function healCorruptLease(controlRoot, kind, { controllerId }) {
  const file = leasePath(controlRoot, kind);
  if (!fs.existsSync(file)) return null;
  const journal = path.join(controlRoot, 'leases', 'journal');
  fs.mkdirSync(journal, { recursive: true });
  const evidence = path.join(journal, `corrupt-${kind}-${Date.now()}.bin`);
  fs.copyFileSync(file, evidence);
  fs.rmSync(file, { force: true });
  atomicWriteJson(path.join(journal, `corrupt-${kind}-${Date.now()}.heal.json`), {
    healedBy: controllerId, healedAt: nowIso(), evidence,
  });
  return evidence;
}
