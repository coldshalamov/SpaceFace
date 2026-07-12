#!/usr/bin/env node
// SAFE-001 — write-enforcing transactional agent runner (repair-1).
//
// No auto-approved terminal worker may mutate the live SpaceFace tree
// (00_PRODUCTION_CONSTITUTION §6, 02_ORCHESTRATOR_SPEC §2). This runner is the
// boundary that makes that law mechanical:
//
//   1. acquires the single code/blender lease (owner token) and heartbeats it;
//      a failed/foreign heartbeat LATCHES a violation and kills the worker
//   2. snapshots the live working tree (plain copy — never branch/stash/reset/
//      worktree) into an isolated candidate workspace
//   3. guards the live root: ACL prevention (deny W,D,WDAC,WO + SDDL tamper
//      watchdog) and/or watch detection (git INCLUDING ignored paths) — plus a
//      control-plane watch so .campaign is never worker-writable
//   4. runs the worker with cwd inside the workspace only
//   5. on exit (normal OR killed): sweeps ALL process-tree descendants via CIM
//      ancestry, holds a stabilization window, verifies the tree is empty, and
//      only then journals, validates, writes records, heals guards, releases
//   6. journals every write (hardlinks/symlinks/ADS/device paths are
//      violations) and rejects allowlist violations with exact paths
//   7. validates the worker's submission (which structurally cannot claim
//      acceptance)
//
// Integration to the live tree is a SEPARATE authority (lib/integrate.mjs) run
// only after independent review, with its own lease, path containment,
// pre-publish re-hash, and crash-recovery journal.
//
// Usage:
//   node tools/production/run-agent.mjs --packet <file> --packet-id <id>
//     --lease code_mutation|blender_mutation --writable <glob> [--writable <glob>...]
//     [--live-root <dir>] [--control-root <dir>] [--exclude <rel>...]
//     [--guard acl|watch|acl+watch|none] [--guard-allow <prefix>...]
//     [--detection-only-acknowledgement]
//     [--timeout-sec N] [--poll-ms N] [--link-node-modules] [--resume]
//     -- <worker command...>
//   node tools/production/run-agent.mjs --heal [--control-root <dir>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nowIso, atomicWriteJson, toPosix } from './lib/util.mjs';
import {
  acquireLease, heartbeatLease, reassertAndReleaseLease, leaseHeartbeatTempRelativePath,
} from './lib/leases.mjs';
import { createWorkspace, saveSnapshotRecord, gitStatusFingerprint } from './lib/snapshot.mjs';
import {
  applyAclGuard, liftAclGuard, sweepStaleGuards, createWatchGuard, createControlWatch,
  checkAclTamper, reapplyAclGuard, GUARD_ALLOWED_PREFIXES,
} from './lib/guard.mjs';
import { journalWorkspace, candidateOutputs, readSubmission, SUBMISSION_DIR } from './lib/journal.mjs';
import { validateWorkerSubmission } from './lib/validate.mjs';
import { recoverIntegration } from './lib/integrate.mjs';

const EXIT = { OK: 0, INTERNAL: 1, VIOLATION: 2, INVALID_SUBMISSION: 3, LEASE_DENIED: 4, USAGE: 5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const opts = {
    packet: null, packetId: null, lease: null,
    liveRoot: process.cwd(), controlRoot: null,
    writable: [], exclude: [], guard: 'acl+watch', guardAllow: [],
    timeoutSec: 3600, pollMs: 1500, stabilizationMs: 1500, linkNodeModules: false,
    resume: false, heal: false, detectionOnlyAcknowledgement: false, worker: [],
  };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { opts.worker = argv.slice(i + 1); break; }
    else if (a === '--packet') opts.packet = argv[++i];
    else if (a === '--packet-id') opts.packetId = argv[++i];
    else if (a === '--lease') opts.lease = argv[++i];
    else if (a === '--live-root') opts.liveRoot = path.resolve(argv[++i]);
    else if (a === '--control-root') opts.controlRoot = path.resolve(argv[++i]);
    else if (a === '--writable') opts.writable.push(argv[++i]);
    else if (a === '--exclude') opts.exclude.push(argv[++i]);
    else if (a === '--guard') opts.guard = argv[++i];
    else if (a === '--guard-allow') opts.guardAllow.push(argv[++i]);
    else if (a === '--timeout-sec') opts.timeoutSec = Number(argv[++i]);
    else if (a === '--poll-ms') opts.pollMs = Number(argv[++i]);
    else if (a === '--stabilization-ms') opts.stabilizationMs = Number(argv[++i]);
    else if (a === '--heartbeat-ms') opts.heartbeatMs = Number(argv[++i]);
    else if (a === '--link-node-modules') opts.linkNodeModules = true;
    else if (a === '--resume') opts.resume = true;
    else if (a === '--heal') opts.heal = true;
    else if (a === '--detection-only-acknowledgement') opts.detectionOnlyAcknowledgement = true;
    else { console.error(`unknown argument: ${a}`); process.exit(EXIT.USAGE); }
  }
  if (!opts.controlRoot) opts.controlRoot = path.join(opts.liveRoot, '.campaign');
  return opts;
}

// ---------- descendant containment (SAFE-001-REPAIR defect 3) ----------

// Windows has no ambient process groups for detached children; ancestry is
// reconstructed from the CIM process table. ParentProcessId values persist
// after a parent dies, so orphaned grandchildren remain reachable. Creation
// time filtering guards against PID reuse.
function listProcessTable() {
  if (process.platform !== 'win32') return [];
  const ps =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId," +
    "@{n='Start';e={ if ($_.CreationDate) { $_.CreationDate.ToFileTimeUtc() } else { 0 } }} | ConvertTo-Json -Compress";
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return null; // table unavailable — callers must fail closed
  }
}

function listPosixProcessTable() {
  try {
    const out = execFileSync('ps', ['-eo', 'pid=,ppid=,pgid='], {
      encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    });
    const rows = [];
    for (const line of out.split(/\r?\n/)) {
      const fields = line.trim().split(/\s+/).map(Number);
      if (fields.length !== 3 || fields.some((value) => !Number.isInteger(value))) continue;
      rows.push({ ProcessId: fields[0], ParentProcessId: fields[1], ProcessGroupId: fields[2] });
    }
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

function findDescendantsFromTable(table, rootPid, sinceFileTime, untilFileTime = null) {
  const children = new Map();
  for (const p of table) {
    if (!children.has(p.ParentProcessId)) children.set(p.ParentProcessId, []);
    children.get(p.ParentProcessId).push(p);
  }
  const found = [];
  const frontier = [rootPid];
  const seen = new Set(frontier);
  while (frontier.length) {
    const pid = frontier.pop();
    for (const child of children.get(pid) || []) {
      if (seen.has(child.ProcessId)) continue;
      seen.add(child.ProcessId);
      if (child.Start && sinceFileTime && child.Start < sinceFileTime) continue; // PID reuse guard
      if (child.Start && untilFileTime && child.Start > untilFileTime) continue;
      found.push(child.ProcessId);
      frontier.push(child.ProcessId);
    }
  }
  return found;
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
  } catch { /* already dead */ }
}

// Kill the worker tree, then verify it is actually empty. On Windows the kill
// mechanism is the kernel job object (KILL_ON_JOB_CLOSE — see JOBWRAP_PS1):
// wrapper exit closes the last job handle and the kernel terminates every
// member, INCLUDING detached/orphaned daemons whose ParentProcessId
// chain is broken (a pure CIM ancestry walk cannot reach those — SAFE-001
// repair defect 3). The job's sampled member PIDs are then verified dead
// rather than trusting the mechanism; the CIM walk remains as a second net.
// Post-exit containment never taskkills the stale wrapper PID unless CIM proves
// the exact wrapper creation identity is still alive, preventing PID-reuse
// kills of unrelated controller/helper processes.
// Returns { contained, survivors, sweeps, method, jobSampledPids }.
async function containProcessTree(rootPid, sinceFileTime, stabilizationMs, jobMembersFile) {
  if (process.platform !== 'win32') {
    return containPosixProcessTree(rootPid, stabilizationMs);
  }
  return containWindowsProcessTree(rootPid, sinceFileTime, stabilizationMs, jobMembersFile);
}

export async function containWindowsProcessTree(rootPid, sinceFileTime, stabilizationMs, jobMembersFile, dependencies = {}) {
  const listTable = dependencies.listTable || listProcessTable;
  const killOne = dependencies.killOne || killPid;
  const wait = dependencies.sleepFn || sleep;
  const containStartFileTime = dependencies.containStartFileTime || epochMsToFileTime(Date.now());
  let sampledPids = null;
  let rootStartFileTime = null;
  if (dependencies.membersRecord) {
    const rec = dependencies.membersRecord;
    sampledPids = (rec.pids || []).filter((p) => p !== rootPid && p !== rec.wrapperPid);
    rootStartFileTime = Number(rec.wrapperStartFileTime) || null;
  } else if (jobMembersFile) {
    try {
      const rec = JSON.parse(fs.readFileSync(jobMembersFile, 'utf8'));
      sampledPids = (rec.pids || []).filter((p) => p !== rootPid && p !== rec.wrapperPid);
      rootStartFileTime = Number(rec.wrapperStartFileTime) || null;
    } catch { sampledPids = null; /* fail closed below */ }
  }
  let rootPidReused = false;
  const surviving = () => {
    const table = listTable();
    if (table === null) return null;
    const out = new Set();
    const rootRow = table.find((row) => row.ProcessId === rootPid);
    if (rootRow) {
      if (rootStartFileTime && rootRow.Start === rootStartFileTime) {
        // Unexpectedly still alive after the child 'exit' event: terminate the
        // exact wrapper identity and its descendants.
        out.add(rootPid);
        for (const pid of findDescendantsFromTable(table, rootPid, rootStartFileTime, containStartFileTime)) out.add(pid);
      } else {
        // The wrapper already exited and Windows reused its PID. Never traverse
        // or taskkill this unrelated process tree (controller-session safety).
        rootPidReused = true;
      }
    } else {
      // ParentProcessId persists for orphans. Bound both ends of creation time
      // so only descendants created during this wrapper's lifetime qualify.
      const lower = rootStartFileTime || sinceFileTime;
      for (const pid of findDescendantsFromTable(table, rootPid, lower, containStartFileTime)) out.add(pid);
    }
    if (sampledPids) {
      const alive = new Map(table.map((p) => [p.ProcessId, p]));
      for (const p of sampledPids) {
        const row = alive.get(p);
        // A sampled pid alive but CREATED AFTER containment began is PID reuse
        // (the job teardown already killed the member), not a survivor.
        if (row && (!row.Start || row.Start < containStartFileTime)) out.add(p);
      }
    }
    return [...out];
  };
  let sweeps = 0;
  for (; sweeps < 5; sweeps++) {
    const s = surviving();
    if (s === null) return { contained: false, survivors: ['<process table unavailable>'], sweeps, method: 'job-object+cim' };
    if (s.length === 0) break;
    for (const pid of s) killOne(pid);
    await wait(400);
  }
  await wait(stabilizationMs);
  const final = surviving();
  if (final === null) return { contained: false, survivors: ['<process table unavailable>'], sweeps, method: 'job-object+cim' };
  return {
    contained: final.length === 0 && sampledPids !== null,
    survivors: sampledPids === null ? ['<job member samples unavailable — failing closed>'] : final,
    sweeps: sweeps + 1,
    method: 'job-object+cim',
    jobSampledPids: sampledPids,
    rootStartFileTime,
    rootPidReused,
  };
}

export async function containPosixProcessTree(rootPid, stabilizationMs, dependencies = {}) {
    const listTable = dependencies.listTable || listPosixProcessTable;
    const killGroup = dependencies.killGroup || (() => { try { process.kill(-rootPid, 'SIGKILL'); } catch { /* already dead */ } });
    const killOne = dependencies.killOne || killPid;
    const wait = dependencies.sleepFn || sleep;
    const initial = listTable();
    if (initial === null) {
      return { contained: false, survivors: ['<process table unavailable>'], sweeps: 0, method: 'process-group+ps' };
    }
    const sampled = new Set(findDescendantsFromTable(initial, rootPid, 0));
    for (const row of initial) if (row.ProcessGroupId === rootPid) sampled.add(row.ProcessId);
    sampled.delete(process.pid);
    killGroup();
    let sweeps = 0;
    let survivors = [];
    for (; sweeps < 5; sweeps++) {
      const table = listTable();
      if (table === null) {
        return { contained: false, survivors: ['<process table unavailable>'], sweeps, method: 'process-group+ps' };
      }
      const alive = new Set(table.map((row) => row.ProcessId));
      survivors = table
        .filter((row) => row.ProcessGroupId === rootPid || sampled.has(row.ProcessId))
        .map((row) => row.ProcessId)
        .filter((pid) => pid !== process.pid && alive.has(pid));
      if (survivors.length === 0) break;
      for (const pid of survivors) killOne(pid);
      await wait(200);
    }
    await wait(stabilizationMs);
    const finalTable = listTable();
    if (finalTable === null) {
      return { contained: false, survivors: ['<process table unavailable>'], sweeps, method: 'process-group+ps' };
    }
    const final = finalTable
      .filter((row) => row.ProcessGroupId === rootPid || sampled.has(row.ProcessId))
      .map((row) => row.ProcessId)
      .filter((pid) => pid !== process.pid);
    return { contained: final.length === 0, survivors: final, sweeps: sweeps + 1, method: 'process-group+ps', sampledPids: [...sampled] };
}

const epochMsToFileTime = (ms) => (ms + 11644473600000) * 10000;

// PowerShell wrapper that puts ITSELF (and therefore every transitive
// descendant — breakaway is not granted) into a named kernel job object with
// JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE before spawning the worker. When the
// wrapper dies for any reason (normal exit, timeout kill, violation kill) the
// last handle closes and the kernel terminates every member. It samples the
// job's live PID list to a guards-dir file (~4/s, cumulative union) so the
// runner can verify member death afterward instead of trusting the mechanism.
// Exit 97 = job setup failed (the worker is NEVER run outside the job).
const JOBWRAP_PS1 = String.raw`$ErrorActionPreference = 'Stop'
$jobName = $args[0]
$cmdFile = $args[1]
$membersFile = $args[2]
$wrapperStartFileTime = [System.Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToFileTimeUtc()

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SFJob {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, IntPtr lpInfo, int cbInfo);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool QueryInformationJobObject(IntPtr hJob, int infoClass, IntPtr lpInfo, int cbInfo, out int lpReturnLength);
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetCurrentProcess();
}
'@

$job = [SFJob]::CreateJobObjectW([IntPtr]::Zero, $jobName)
if ($job -eq [IntPtr]::Zero) { [Console]::Error.WriteLine('SFJOB: CreateJobObject failed'); exit 97 }
# JOBOBJECT_EXTENDED_LIMIT_INFORMATION (x64, 144 bytes); LimitFlags at offset 16
# = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000). Info class 9 = extended limits.
$size = 144
$ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($size)
try {
  for ($i = 0; $i -lt $size; $i++) { [System.Runtime.InteropServices.Marshal]::WriteByte($ptr, $i, 0) }
  [System.Runtime.InteropServices.Marshal]::WriteInt32($ptr, 16, 0x2000)
  if (-not [SFJob]::SetInformationJobObject($job, 9, $ptr, $size)) { [Console]::Error.WriteLine('SFJOB: SetInformationJobObject failed'); exit 97 }
} finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr) }
if (-not [SFJob]::AssignProcessToJobObject($job, [SFJob]::GetCurrentProcess())) { [Console]::Error.WriteLine('SFJOB: AssignProcessToJobObject failed'); exit 97 }

# Info class 3 = JobObjectBasicProcessIdList: two UInt32 counters then ULONG_PTR[].
function Get-JobPids {
  $cap = 512
  $bytes = 8 + 8 * $cap
  $buf = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes)
  try {
    $ret = 0
    if (-not [SFJob]::QueryInformationJobObject($job, 3, $buf, $bytes, [ref]$ret)) { return @() }
    $n = [System.Runtime.InteropServices.Marshal]::ReadInt32($buf, 4)
    $pids = @()
    for ($i = 0; $i -lt $n; $i++) { $pids += [System.Runtime.InteropServices.Marshal]::ReadIntPtr($buf, 8 + 8 * $i).ToInt64() }
    return $pids
  } finally { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($buf) }
}

$seen = New-Object System.Collections.Generic.HashSet[long]
function Write-Members {
  foreach ($p in (Get-JobPids)) { [void]$seen.Add($p) }
  $sorted = @($seen) | Sort-Object
  $json = '{"wrapperPid":' + $PID + ',"wrapperStartFileTime":' + $wrapperStartFileTime + ',"sampledAt":"' + [DateTime]::UtcNow.ToString('o') + '","pids":[' + ($sorted -join ',') + ']}'
  $tmp = $membersFile + '.tmp'
  [System.IO.File]::WriteAllText($tmp, $json)
  Move-Item -Force $tmp $membersFile
}

$cmdline = [System.IO.File]::ReadAllText($cmdFile)
Write-Members
$p = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', ('"' + $cmdline + '"')) -NoNewWindow -PassThru
while (-not $p.HasExited) { Write-Members; Start-Sleep -Milliseconds 250 }
Write-Members
exit $p.ExitCode
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.heal) {
    const healed = sweepStaleGuards(opts.controlRoot);
    const recovered = recoverIntegration(opts.controlRoot);
    console.log(healed.length ? `healed guards: ${healed.join(', ')}` : 'no stale guards');
    console.log(recovered.length ? `recovered integrations: ${recovered.map((r) => r.runId).join(', ')}` : 'no interrupted integrations');
    process.exit(EXIT.OK);
  }

  if (!opts.packetId || !opts.lease || opts.writable.length === 0 || opts.worker.length === 0) {
    console.error('required: --packet-id, --lease, at least one --writable, and a worker command after --');
    process.exit(EXIT.USAGE);
  }
  if (!['code_mutation', 'blender_mutation'].includes(opts.lease)) {
    console.error(`--lease must be code_mutation or blender_mutation, got ${opts.lease}`);
    process.exit(EXIT.USAGE);
  }
  if (!['acl', 'watch', 'acl+watch', 'none'].includes(opts.guard)) {
    console.error(`--guard must be acl|watch|acl+watch|none, got ${opts.guard}`);
    process.exit(EXIT.USAGE);
  }
  if (process.platform === 'win32' && opts.lease.endsWith('_mutation') && !opts.guard.includes('acl') && !opts.detectionOnlyAcknowledgement) {
    console.error('Windows mutation lanes require ACL prevention; pass --detection-only-acknowledgement to explicitly accept watch-only detection');
    process.exit(EXIT.USAGE);
  }
  if (opts.lease.endsWith('_mutation') && opts.guard === 'none') {
    console.error("mutation lanes cannot use --guard none; detection-only acknowledgement requires --guard watch");
    process.exit(EXIT.USAGE);
  }

  const runId = `${opts.packetId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const runRecordPath = path.join(opts.controlRoot, 'runs', `${runId}.json`);
  const record = {
    runId,
    packetId: opts.packetId,
    packetFile: opts.packet ? toPosix(opts.packet) : null,
    startedAt: nowIso(),
    liveRoot: toPosix(opts.liveRoot),
    guardMode: opts.guard,
    resume: opts.resume,
    worker: opts.worker,
    disposition: 'running',
    violations: [],
    timedOut: false,
    workerExitCode: null,
    descendantContainment: null,
  };
  // Run-record write discipline: ONE initial write before the control-watch
  // baseline, then NOTHING until worker write-authority has ended (post-sweep).
  // Controller records are therefore written by a separate phase, not while a
  // worker could race them (SAFE-001-REPAIR required behavior).
  const saveRecordInitial = () => atomicWriteJson(runRecordPath, record);
  sweepStaleGuards(opts.controlRoot);
  recoverIntegration(opts.controlRoot);

  // 1. Lease (with owner token)
  let lease;
  try {
    lease = acquireLease(opts.controlRoot, {
      kind: opts.lease, packetId: opts.packetId,
      holder: `run-agent:${runId}`, ttlSeconds: Math.max(120, opts.timeoutSec + 300),
    });
  } catch (e) {
    if (e.code === 'LEASE_HELD' || e.code === 'LEASE_RECLAIM_RACE' || e.code === 'LEASE_CORRUPT') {
      record.disposition = 'lease_denied';
      record.leaseError = { code: e.code, message: String(e.message || e) };
      saveRecordInitial();
      console.error(`LEASE DENIED (${e.code}): ${e.message}`);
      process.exit(EXIT.LEASE_DENIED);
    }
    throw e;
  }
  record.leaseId = lease.id;
  const expectedLeaseWrites = [
    `leases/${opts.lease}.json`,
    leaseHeartbeatTempRelativePath(opts.lease, lease.id),
  ];

  let aclRecord = null;
  let watchGuard = null;
  let controlWatch = null;
  let heartbeatTimer = null;
  let violationLatched = false;
  let leaseCleanupDone = false;

  const lift = () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (aclRecord) {
      // Pass the TRUSTED in-memory record so the heal restores authoritative
      // pre-apply SDDL, never bytes re-read from the worker-writable guard
      // journal (advisory defect SAFE001R-HEAL-01).
      try { liftAclGuard(opts.controlRoot, runId, aclRecord); } catch (e) { console.error(String(e.message || e)); }
      aclRecord = null;
    }
  };

  const cleanupLease = (finalStatus) => {
    if (leaseCleanupDone) return record.leaseCleanup;
    const cleanup = reassertAndReleaseLease(opts.controlRoot, lease, finalStatus);
    record.leaseCleanup = cleanup;
    leaseCleanupDone = true;
    return cleanup;
  };

  try {
    // 2. Snapshot -> isolated workspace
    const workspaceDir = path.join(opts.controlRoot, 'workspaces', runId);
    const snapshot = createWorkspace(opts.liveRoot, workspaceDir, {
      extraExcludes: opts.exclude, linkNodeModules: opts.linkNodeModules,
    });
    const snapshotPath = saveSnapshotRecord(opts.controlRoot, runId, snapshot);
    record.workspaceDir = toPosix(workspaceDir);
    record.snapshotPath = toPosix(snapshotPath);
    record.snapshotManifestHash = snapshot.manifestHash;
    record.liveGitFingerprint = gitStatusFingerprint(opts.liveRoot);
    fs.mkdirSync(path.join(workspaceDir, SUBMISSION_DIR), { recursive: true });

    // 3. Guards. Initial record write happens BEFORE the control-watch baseline
    // so the runner's own record file is part of the baseline, then untouched
    // while the worker lives.
    const allowedPrefixes = [...GUARD_ALLOWED_PREFIXES.filter((p) => p === '.campaign'), ...opts.guardAllow];
    // Note: .devshots/.tmp are NOT allowed by default in repair-1 — worker write
    // authority is the workspace allowlist plus the submission ingress, nothing
    // else. Concurrent legitimate lanes must be declared via --guard-allow and
    // are recorded here for audit.
    record.guardAllowedPrefixes = allowedPrefixes;
    saveRecordInitial();

    if (opts.guard.includes('acl')) {
      aclRecord = applyAclGuard(opts.liveRoot, opts.controlRoot, runId, { allowedPrefixes });
      console.log(`ACL guard engaged on ${opts.liveRoot} (deny W,D,WDAC,WO; SDDL tamper-watched; auto-heals)`);
    }
    if (opts.guard.includes('watch')) {
      watchGuard = createWatchGuard(opts.liveRoot, { allowedPrefixes });
      record.watchStrategy = watchGuard.strategy;
    }
    // The control plane is watched in every mode except 'none'. The only
    // expected runner write during the worker's lifetime is the lease heartbeat;
    // the worker's ONLY legitimate control-plane target is its own workspace.
    // guards/ carries only ACL journals (written pre-baseline + post-worker), so
    // it is fully watched now — a worker write there is a latched violation
    // (advisory defects SAFE001R-CTRL-01 / HEAL-01). The job-object scratch that
    // used to live under guards/ has moved to a non-derivable OS temp dir.
    // 4. Launch the worker inside the workspace. On Windows the worker runs
    // under the job-object wrapper (JOBWRAP_PS1): the command line is written
    // to a guards-dir file (never passed through argv re-parsing), and the
    // wrapper's death — for any reason — tears down every job member. On posix
    // the worker gets its own process group (detached) killed at containment.
    const runStartFileTime = epochMsToFileTime(Date.now() - 2000);
    const workerEnv = {
      ...process.env,
      SF_PACKET_ID: opts.packetId,
      SF_RUN_ID: runId,
      SF_WORKSPACE: workspaceDir,
      SF_SUBMISSION_PATH: path.join(workspaceDir, SUBMISSION_DIR, 'worker-submission.json'),
    };
    let child;
    let jobMembersFile = null;
    if (process.platform === 'win32') {
      const guardsDir = path.join(opts.controlRoot, 'guards');
      fs.mkdirSync(guardsDir, { recursive: true });
      const wrapPath = path.join(guardsDir, `jobwrap-${runId}.ps1`);
      const cmdFile = path.join(guardsDir, `jobcmd-${runId}.txt`);
      const memberDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-job-members-'));
      jobMembersFile = path.join(memberDir, 'members.json');
      const cmdline = opts.worker
        .map((a) => (/\s/.test(a) && !/^".*"$/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
        .join(' ');
      fs.writeFileSync(wrapPath, JOBWRAP_PS1);
      fs.writeFileSync(cmdFile, cmdline);
      // Exact baseline is captured only after all controller-owned immutable
      // job inputs exist. During the run the sole expected control write is
      // the token-verified lease heartbeat; the job member stream is outside
      // the worker-visible control plane.
      if (opts.guard !== 'none') {
        controlWatch = createControlWatch(opts.controlRoot, {
          expectedWrites: expectedLeaseWrites, ownRunId: runId,
        });
      }
      child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', wrapPath, `Local\\sfrun-${runId.replace(/[^A-Za-z0-9-]/g, '-')}`, cmdFile, jobMembersFile,
      ], {
        cwd: workspaceDir,
        windowsHide: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: workerEnv,
      });
    } else {
      if (opts.guard !== 'none') {
        controlWatch = createControlWatch(opts.controlRoot, {
          expectedWrites: expectedLeaseWrites, ownRunId: runId,
        });
      }
      const [cmd, ...rawArgs] = opts.worker;
      child = spawn(cmd, rawArgs, {
        cwd: workspaceDir,
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        env: workerEnv,
      });
    }
    record.workerPid = child.pid;

    const latchViolation = (reason) => {
      if (!record.violations.includes(reason)) record.violations.push(reason);
      if (!violationLatched) {
        violationLatched = true;
        record.disposition = 'violated_boundary';
        console.error(`BOUNDARY VIOLATION — killing worker tree. ${reason}`);
        killPid(child.pid);
      }
    };

    // Heartbeat failure is a LATCHED violation: a lease-less worker may not
    // continue (SAFE-001-REPAIR defect 2).
    heartbeatTimer = setInterval(() => {
      try {
        heartbeatLease(opts.controlRoot, opts.lease, lease.id, lease.token);
      } catch (e) {
        latchViolation(`lease heartbeat failed (${e.code || 'ERR'}): ${String(e.message || e)}`);
      }
    }, opts.heartbeatMs || Math.max(5000, Math.min(60_000, (lease.ttlSeconds * 1000) / 3)));

    // 5. Monitor until worker exit: live watch + control watch + ACL tamper + timeout.
    await new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (!settled) {
          settled = true;
          clearInterval(pollTimer);
          clearTimeout(timeoutTimer);
          resolve();
        }
      };
      const pollTimer = setInterval(() => {
        try {
          if (watchGuard) {
            for (const v of watchGuard.check()) latchViolation(`live-root mutation: ${v}`);
          }
          if (controlWatch) {
            for (const v of controlWatch.check()) latchViolation(`control-plane mutation: ${v}`);
          }
          if (aclRecord) {
            const tampered = checkAclTamper(aclRecord);
            if (tampered.length) {
              for (const t of tampered) latchViolation(`ACL tamper detected on: ${t}`);
              try { reapplyAclGuard(aclRecord); } catch { /* recorded; kill already latched */ }
            }
          }
        } catch (e) {
          latchViolation(`guard poll failure (failing closed): ${String(e.message || e)}`);
        }
      }, opts.pollMs);
      const timeoutTimer = setTimeout(() => {
        record.timedOut = true;
        console.error(`TIMEOUT after ${opts.timeoutSec}s — killing worker (controller event, not worker success)`);
        killPid(child.pid);
      }, opts.timeoutSec * 1000);
      child.on('exit', (code) => { record.workerExitCode = code; settle(); });
      child.on('error', (e) => { record.workerSpawnError = String(e.message || e); settle(); });
    });

    // 6. Descendant containment BEFORE anything else: worker write authority
    // ends only when the process tree is provably empty (stabilization window
    // included). Guards stay up throughout.
    const containment = await containProcessTree(child.pid, runStartFileTime, opts.stabilizationMs, jobMembersFile);
    record.descendantContainment = containment;
    if (!containment.contained) {
      record.violations.push(`descendant containment failed: survivors ${containment.survivors.join(', ')}`);
      record.disposition = 'violated_boundary';
    }

    // 7. Final guard checks with guards STILL UP.
    if (watchGuard) {
      for (const v of watchGuard.check()) {
        const line = `live-root mutation: ${v}`;
        if (!record.violations.includes(line)) record.violations.push(line);
      }
    }
    if (controlWatch) {
      for (const v of controlWatch.check()) {
        const line = `control-plane mutation: ${v}`;
        if (!record.violations.includes(line)) record.violations.push(line);
      }
      const healed = controlWatch.heal();
      record.controlPlaneHeal = healed;
      if (healed.failures.length || healed.remaining.length) {
        record.violations.push(
          `control-plane heal failed: ${healed.failures.length} error(s), ${healed.remaining.length} mutation(s) remain`
        );
      }
    }
    if (aclRecord) {
      for (const t of checkAclTamper(aclRecord)) {
        const line = `ACL tamper detected on: ${t}`;
        if (!record.violations.includes(line)) record.violations.push(line);
      }
    }
    if (record.violations.length && record.disposition !== 'violated_boundary') {
      record.disposition = 'violated_boundary';
    }

    // 8. Journal the workspace (hardlink/symlink/ADS checks inside).
    const journal = journalWorkspace(workspaceDir, snapshot, opts.writable, { excludes: opts.exclude });
    const journalPath = path.join(opts.controlRoot, 'journals', `${runId}.json`);
    atomicWriteJson(journalPath, journal);
    record.journalPath = toPosix(journalPath);
    record.workspaceWriteTotals = journal.totals;

    if (record.disposition === 'violated_boundary') {
      record.finishedAt = nowIso();
      lift();
      cleanupLease('violated');
      atomicWriteJson(runRecordPath, record);
      console.error(`disposition: violated_boundary — candidate rejected. Record: ${runRecordPath}`);
      for (const v of record.violations) console.error(`  ${v}`);
      process.exit(EXIT.VIOLATION);
    }

    if (journal.violations.length) {
      record.violations.push(...journal.violations.map((v) => `workspace violation: ${v}`));
      record.disposition = 'rejected_allowlist';
      record.finishedAt = nowIso();
      lift();
      cleanupLease('violated');
      atomicWriteJson(runRecordPath, record);
      console.error(`disposition: rejected_allowlist — ${journal.violations.length} violation(s):`);
      for (const v of journal.violations) console.error(`  ${v}`);
      process.exit(EXIT.VIOLATION);
    }

    const sub = readSubmission(workspaceDir);
    if (!sub.exists || sub.parseError) {
      record.disposition = 'invalid_submission';
      record.submissionError = sub.exists ? `parse error: ${sub.parseError}` : 'missing worker-submission.json';
      record.finishedAt = nowIso();
      lift();
      cleanupLease('released');
      atomicWriteJson(runRecordPath, record);
      console.error(`disposition: invalid_submission — ${record.submissionError}`);
      process.exit(EXIT.INVALID_SUBMISSION);
    }
    const verdict = validateWorkerSubmission(sub.parsed);
    if (!verdict.ok) {
      record.disposition = 'invalid_submission';
      record.submissionErrors = verdict.errors;
      record.finishedAt = nowIso();
      lift();
      cleanupLease('released');
      atomicWriteJson(runRecordPath, record);
      console.error('disposition: invalid_submission —');
      for (const e of verdict.errors) console.error(`  ${e}`);
      process.exit(EXIT.INVALID_SUBMISSION);
    }

    // 9. Candidate captured. Outputs are hash-bound for the separate integrator.
    const outputs = candidateOutputs(workspaceDir, journal);
    record.candidateOutputs = outputs;
    record.submissionStatus = sub.parsed.status;
    record.submissionPath = toPosix(sub.file);
    record.disposition = 'candidate_captured';
    record.finishedAt = nowIso();
    lift();
    cleanupLease('released');
    atomicWriteJson(runRecordPath, record);
    console.log(`disposition: candidate_captured (${sub.parsed.status}, ${outputs.length} output file(s), workerExit=${record.workerExitCode}${record.timedOut ? ', TIMED OUT' : ''})`);
    console.log(`run record: ${runRecordPath}`);
    process.exit(EXIT.OK);
  } catch (e) {
    record.disposition = 'internal_error';
    record.error = String((e && e.stack) || e);
    record.finishedAt = nowIso();
    lift();
    try { cleanupLease('released'); } catch (cleanupError) {
      record.leaseCleanupError = String(cleanupError.message || cleanupError);
    }
    try { atomicWriteJson(runRecordPath, record); } catch { /* record what we can */ }
    console.error(`internal error: ${String(e.message || e)}`);
    process.exit(EXIT.INTERNAL);
  }
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  main();
}
