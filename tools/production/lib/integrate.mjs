// SAFE-001 integrator (repair-1). A SEPARATE authority from the worker/runner:
// copies only hash-bound allowlisted outputs from a reviewed candidate
// workspace into the live tree.
//
// Repair-1 hardening (SAFE-001-REPAIR defects 5/11 + advisory TOCTOU-01,
// INTEGRATION-01/02):
//  - integration holds its own code_mutation lease for its whole duration;
//  - every output path is normalized and containment-proved: no absolute, '..',
//    ADS-colon, device names; the resolved real destination directory must
//    remain inside the real live root (case-insensitive on win32);
//  - staging lives under the CONTROL root (never next to the destination), and
//    every staged file is re-hashed IMMEDIATELY before its atomic rename;
//  - a recovery journal is written BEFORE the first live rename; a crash
//    mid-publication is recoverable and can never be recorded as integrated;
//  - after the last rename, every live destination is re-hashed and must equal
//    the reviewed delta manifest exactly;
//  - source files in the workspace must be regular, non-linked files.
import fs from 'node:fs';
import path from 'node:path';
import { sha256File, atomicWriteJson, readJson, nowIso, toPosix } from './util.mjs';
import { pathHygieneViolation } from './journal.mjs';
import { acquireLease, releaseLease } from './leases.mjs';

function realCaseless(p) {
  const real = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

function isInsideReal(realRoot, realCandidate) {
  const rel = path.relative(realRoot, realCandidate);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function nearestExistingAncestor(p) {
  let current = p;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function containedDestination(liveRoot, relPath) {
  const hygiene = pathHygieneViolation(relPath);
  if (hygiene) return { ok: false, reason: hygiene };
  let liveReal;
  try { liveReal = realCaseless(liveRoot); } catch (error) {
    return { ok: false, reason: `live root realpath failed: ${String(error.message || error)}` };
  }
  const resolved = path.resolve(liveRoot, relPath);
  const ancestor = nearestExistingAncestor(path.dirname(resolved));
  if (!ancestor) return { ok: false, reason: 'destination parent has no existing ancestor' };
  let parentReal;
  try { parentReal = realCaseless(ancestor); } catch (error) {
    return { ok: false, reason: `destination parent realpath failed: ${String(error.message || error)}` };
  }
  if (!isInsideReal(liveReal, parentReal)) {
    return { ok: false, reason: 'resolved destination parent escapes live root through a junction/symlink' };
  }
  if (fs.existsSync(resolved)) {
    const st = fs.lstatSync(resolved);
    if (st.isSymbolicLink()) return { ok: false, reason: 'destination is a symlink/reparse point' };
  }
  const rootAbs = path.resolve(liveRoot);
  const norm = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const rootNorm = process.platform === 'win32' ? rootAbs.toLowerCase() : rootAbs;
  if (!(norm === rootNorm || norm.startsWith(rootNorm + path.sep))) {
    return { ok: false, reason: 'resolves outside live root' };
  }
  return { ok: true, resolved, liveReal };
}

function proveCreatedParentContained(liveReal, destination) {
  const parentReal = realCaseless(path.dirname(destination));
  if (!isInsideReal(liveReal, parentReal)) {
    throw new Error(`destination parent escaped live root before publish: ${destination}`);
  }
  if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) {
    throw new Error(`destination became a symlink/reparse point before publish: ${destination}`);
  }
}

export function integrateCandidate({
  liveRoot,
  workspaceDir,
  controlRoot,
  runId,
  outputs, // [{ path, sha256 }] — the reviewed, accepted delta manifest
  inputBaseline, // { relPath: sha256|null } captured at snapshot time
  integratorId = 'integrator',
  __testCrashAfterApplies = null, // fixture-only: throw after N renames to prove recovery
  __testTamperStagedIndex = null, // fixture-only: mutate a staged file post-verify to prove the pre-publish re-hash
}) {
  const recoveryPath = path.join(controlRoot, 'integrations', `${runId}.recovery.json`);
  const report = {
    runId,
    startedAt: nowIso(),
    liveRoot: toPosix(liveRoot),
    workspaceDir: toPosix(workspaceDir),
    pathViolations: [],
    sourceViolations: [],
    verified: [],
    staleInputs: [],
    hashMismatches: [],
    applied: [],
    finalHashMismatches: [],
    status: 'pending',
  };
  const finish = (status) => {
    report.status = status;
    report.finishedAt = nowIso();
    atomicWriteJson(path.join(controlRoot, 'integrations', `${runId}.json`), report);
    return report;
  };

  // 0. Integration owns the mutation lane for its whole duration.
  let lease;
  try {
    lease = acquireLease(controlRoot, {
      kind: 'code_mutation', packetId: `integrate:${runId}`, holder: integratorId, ttlSeconds: 600,
    });
  } catch (e) {
    report.error = `integration lease unavailable: ${String(e.message || e)}`;
    return finish('aborted_lease_unavailable');
  }

  try {
    // 1. Path containment for every output.
    const resolvedOutputs = [];
    for (const out of outputs) {
      const contained = containedDestination(liveRoot, out.path);
      if (!contained.ok) {
        report.pathViolations.push({ path: out.path, reason: contained.reason });
      } else {
        resolvedOutputs.push({ ...out, dst: contained.resolved, liveReal: contained.liveReal });
      }
    }
    if (report.pathViolations.length) return finish('aborted_path_violation');

    // 2. Stale-input check: every live input the candidate was built from must
    //    still match its snapshot-time hash.
    for (const [rel, expected] of Object.entries(inputBaseline || {})) {
      const abs = path.join(liveRoot, rel);
      const actual = fs.existsSync(abs) ? sha256File(abs) : null;
      if (actual !== expected) report.staleInputs.push({ path: rel, expected, actual });
    }
    if (report.staleInputs.length) return finish('aborted_stale_inputs');

    // 3. Verify every accepted output in the workspace: regular file, single
    //    link, exact reviewed hash. Acceptance is bound to exact hashes.
    for (const out of resolvedOutputs) {
      const src = path.join(workspaceDir, out.path);
      let st;
      try {
        st = fs.lstatSync(src);
      } catch {
        report.hashMismatches.push({ path: out.path, expected: out.sha256, actual: 'missing' });
        continue;
      }
      if (!st.isFile() || st.isSymbolicLink()) {
        report.sourceViolations.push({ path: out.path, reason: 'not a regular file' });
        continue;
      }
      if (st.nlink > 1) {
        report.sourceViolations.push({ path: out.path, reason: `hardlink count ${st.nlink}` });
        continue;
      }
      const actual = sha256File(src);
      if (actual !== out.sha256) {
        report.hashMismatches.push({ path: out.path, expected: out.sha256, actual });
      } else {
        report.verified.push(out.path);
      }
    }
    if (report.sourceViolations.length) return finish('aborted_source_violation');
    if (report.hashMismatches.length) return finish('aborted_hash_mismatch');

    // 4. Stage under the CONTROL root and verify each staged copy.
    const stagingDir = path.join(controlRoot, 'staging', runId);
    fs.mkdirSync(stagingDir, { recursive: true });
    const staged = [];
    try {
      for (let i = 0; i < resolvedOutputs.length; i++) {
        const out = resolvedOutputs[i];
        const src = path.join(workspaceDir, out.path);
        const stagedPath = path.join(stagingDir, `${i}.staged`);
        fs.copyFileSync(src, stagedPath);
        if (sha256File(stagedPath) !== out.sha256) throw new Error(`staged copy corrupted: ${out.path}`);
        staged.push({ stagedPath, dst: out.dst, rel: out.path, sha256: out.sha256, liveReal: out.liveReal });
      }
    } catch (e) {
      fs.rmSync(stagingDir, { recursive: true, force: true });
      report.error = String(e.message || e);
      return finish('aborted_staging_failure');
    }

    // 5. Recovery journal BEFORE the first live rename. A crash between renames
    //    is completed (or exactly reported) by recoverIntegration().
    const recovery = {
      runId,
      phase: 'publishing',
      startedAt: nowIso(),
      liveRoot: toPosix(liveRoot),
      files: staged.map((s) => ({ staged: toPosix(s.stagedPath), dst: toPosix(s.dst), rel: s.rel, sha256: s.sha256 })),
      appliedCount: 0,
    };
    atomicWriteJson(recoveryPath, recovery);

    // 6. Publish: re-hash each staged file IMMEDIATELY before its rename
    //    (closes the stage->publish TOCTOU), then rename atomically.
    if (__testTamperStagedIndex !== null && staged[__testTamperStagedIndex]) {
      fs.appendFileSync(staged[__testTamperStagedIndex].stagedPath, '/* tampered-after-verification */');
    }
    for (let i = 0; i < staged.length; i++) {
      const s = staged[i];
      if (sha256File(s.stagedPath) !== s.sha256) {
        report.error = `staged file mutated before publish: ${s.rel}`;
        return finish('aborted_staging_tamper');
      }
      fs.mkdirSync(path.dirname(s.dst), { recursive: true });
      proveCreatedParentContained(s.liveReal, s.dst);
      try {
        fs.renameSync(s.stagedPath, s.dst);
      } catch (e) {
        if (e.code === 'EXDEV') {
          const tmp = `${s.dst}.__xdev.${process.pid}`;
          fs.copyFileSync(s.stagedPath, tmp);
          fs.renameSync(tmp, s.dst);
          fs.rmSync(s.stagedPath, { force: true });
        } else {
          throw e;
        }
      }
      report.applied.push(s.rel);
      recovery.appliedCount = i + 1;
      atomicWriteJson(recoveryPath, recovery);
      if (__testCrashAfterApplies !== null && recovery.appliedCount >= __testCrashAfterApplies) {
        const crash = new Error(`__testCrashAfterApplies:${__testCrashAfterApplies}`);
        crash.code = 'TEST_CRASH';
        throw crash;
      }
    }

    // 7. Final proof: live bytes equal the reviewed delta manifest exactly.
    for (const s of staged) {
      const actual = fs.existsSync(s.dst) ? sha256File(s.dst) : 'missing';
      if (actual !== s.sha256) report.finalHashMismatches.push({ path: s.rel, expected: s.sha256, actual });
    }
    if (report.finalHashMismatches.length) return finish('failed_final_verification');

    recovery.phase = 'done';
    recovery.finishedAt = nowIso();
    atomicWriteJson(recoveryPath, recovery);
    fs.rmSync(stagingDir, { recursive: true, force: true });
    return finish('integrated');
  } catch (e) {
    report.error = report.error || String(e.message || e);
    // NEVER 'integrated' after a partial publish: the recovery journal stays in
    // 'publishing' phase and recoverIntegration() owns completion/reporting.
    return finish(e.code === 'TEST_CRASH' ? 'crashed_mid_publish' : 'aborted_publish_failure');
  } finally {
    try { releaseLease(controlRoot, 'code_mutation', lease.id, lease.token, 'released'); } catch { /* best effort */ }
  }
}

// Complete or exactly report every interrupted publication. A file whose live
// destination already carries the reviewed hash counts as applied; a file whose
// staged copy survives is completed; anything else is reported unrecoverable —
// and the integration is NEVER retroactively marked integrated here; the
// controller decides with the recovery report in hand.
export function recoverIntegration(controlRoot, { integratorId = 'integration-recovery' } = {}) {
  const dir = path.join(controlRoot, 'integrations');
  if (!fs.existsSync(dir)) return [];
  const pending = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.recovery.json')) continue;
    try {
      const recovery = readJson(path.join(dir, name));
      if (recovery.phase !== 'done' && recovery.phase !== 'recovered') pending.push({ name, recovery });
    } catch { /* corrupt records are not live-write authority */ }
  }
  if (pending.length === 0) return [];

  let lease;
  try {
    lease = acquireLease(controlRoot, {
      kind: 'code_mutation', packetId: 'integration-recovery', holder: integratorId, ttlSeconds: 600,
    });
  } catch (error) {
    return [{
      status: 'recovery_lease_unavailable',
      error: String(error.message || error),
      pendingRunIds: pending.map(({ recovery }) => recovery.runId),
    }];
  }

  const reports = [];
  try {
    for (const { name, recovery } of pending) {
      const result = { runId: recovery.runId, completed: [], alreadyApplied: [], unrecoverable: [] };
      for (const f of recovery.files || []) {
        const contained = containedDestination(recovery.liveRoot, f.rel);
        if (!contained.ok) {
          result.unrecoverable.push({ rel: f.rel, reason: contained.reason });
          continue;
        }
        const stagedAbs = path.resolve(f.staged);
        const controlReal = realCaseless(controlRoot);
        const stagedAncestor = nearestExistingAncestor(path.dirname(stagedAbs));
        let stagedContained = false;
        try {
          stagedContained = !!stagedAncestor && isInsideReal(controlReal, realCaseless(stagedAncestor));
        } catch { stagedContained = false; }
        if (!stagedContained) {
          result.unrecoverable.push({ rel: f.rel, reason: 'staged path escapes control root' });
          continue;
        }
        const dst = contained.resolved;
        const dstHash = fs.existsSync(dst) ? sha256File(dst) : null;
        if (dstHash === f.sha256) {
          result.alreadyApplied.push(f.rel);
        } else if (fs.existsSync(stagedAbs) && fs.lstatSync(stagedAbs).isFile() && sha256File(stagedAbs) === f.sha256) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          proveCreatedParentContained(contained.liveReal, dst);
          fs.renameSync(stagedAbs, dst);
          result.completed.push(f.rel);
        } else {
          result.unrecoverable.push({ rel: f.rel, liveHash: dstHash });
        }
      }
      recovery.phase = result.unrecoverable.length ? 'recovery_incomplete' : 'recovered';
      recovery.recoveredAt = nowIso();
      recovery.recoveryResult = result;
      atomicWriteJson(path.join(dir, name), recovery);
      reports.push(recovery);
    }
    return reports;
  } finally {
    releaseLease(controlRoot, 'code_mutation', lease.id, lease.token, 'released');
  }
}
