// SAFE-001 live-root guard (repair-1).
//
// Modes:
//  'acl'   — PREVENTION. NTFS deny ACEs (write, delete, WRITE_DAC, WRITE_OWNER)
//            for the current user on every top-level child of the live root
//            except declared-allowed prefixes, plus an object-only deny on the
//            root itself. Because a same-user OWNER can always rewrite a DACL
//            (Windows owner right — cannot be denied to the owner), the ACL
//            guard is paired with a TAMPER WATCHDOG: the guard records each
//            target's SDDL at apply time and any change during the run is a
//            latched violation (kill + reapply). Pre-apply SDDL is captured so
//            heal RESTORES the exact prior descriptor — pre-existing deny ACEs
//            survive, and our ACEs never linger.
//  'watch' — DETECTION + KILL. Git-status polling INCLUDING IGNORED FILES
//            (advisory defect CONTAINMENT-05) for git roots, stat-manifest
//            otherwise. Defense in depth only: detection cannot restore
//            destroyed bytes and never substitutes for prevention on the live
//            dirty tree (SAFE-001-REPAIR required behavior).
//
// Also provides the CONTROL-PLANE watch: a manifest watch over the control root
// (leases, runs, journals, guards, packet state) with per-run exclusions for
// the files the runner itself must write. A worker writing any other control
// file is a latched violation (advisory defect CONTAINMENT-01).
//
// Guard journals intentionally omit ACL pre-state. Exact healing is possible
// only while the applying controller still holds that pre-state in memory. A
// later process fails closed with GUARD_RECOVERY_REQUIRED instead of trusting
// bytes reachable by the prior worker.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { atomicWriteJson, readJson, nowIso, walkFiles, toPosix, sha256String } from './util.mjs';
import { makeExcludePredicate } from './snapshot.mjs';

export const GUARD_ALLOWED_PREFIXES = ['.campaign', '.devshots', '.tmp'];

function currentUserSpec() {
  const domain = process.env.USERDOMAIN;
  const user = process.env.USERNAME;
  if (!user) throw new Error('cannot resolve current user for ACL guard');
  return domain ? `${domain}\\${user}` : user;
}

function icacls(args) {
  return execFileSync('icacls', args, { encoding: 'utf8', windowsHide: true });
}

function powershellSecurity(command) {
  const script =
    "$ErrorActionPreference='Stop'; " +
    "Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -Force; " +
    command;
  let firstError = null;
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      return execFileSync(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
      });
    } catch (error) {
      firstError ||= error;
      if (error.code !== 'ENOENT') firstError = error;
    }
  }
  throw firstError || new Error('no PowerShell host available for ACL operations');
}

function psQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

export function getSddl(targetPath) {
  return powershellSecurity(`(Get-Acl -LiteralPath ${psQuote(targetPath)}).Sddl`).trim();
}

export function setSddl(targetPath, sddl) {
  powershellSecurity(
    `$acl = Get-Acl -LiteralPath ${psQuote(targetPath)}; ` +
    `$acl.SetSecurityDescriptorSddlForm(${psQuote(sddl)}); ` +
    `Set-Acl -LiteralPath ${psQuote(targetPath)} -AclObject $acl`
  );
}

function guardJournalPath(controlRoot, runId) {
  return path.join(controlRoot, 'guards', `${runId}.json`);
}

// ---------- ACL (prevention + tamper evidence) ----------

// Deny write/delete AND the DACL/owner-modification rights. A non-owner cannot
// lift this; the owner can (Windows law), which is why applyAclGuard returns a
// tamper monitor the runner must poll (any SDDL drift = latched violation).
const DENY_RIGHTS = '(W,D,WDAC,WO)';

export function applyAclGuard(liveRoot, controlRoot, runId, { allowedPrefixes = GUARD_ALLOWED_PREFIXES } = {}) {
  if (process.platform !== 'win32') {
    throw new Error("guard mode 'acl' requires Windows icacls; use --guard watch");
  }
  const user = currentUserSpec();
  const allowed = new Set(allowedPrefixes.map(toPosix));
  const targets = [];
  for (const entry of fs.readdirSync(liveRoot, { withFileTypes: true })) {
    if (allowed.has(toPosix(entry.name))) continue;
    targets.push({ rel: entry.name, inherit: entry.isDirectory() });
  }

  // ACL pre-state is controller authority. It exists only in this process's
  // memory and is NEVER serialized beneath the worker-reachable control root.
  // A crashed controller therefore fails closed for manual recovery instead
  // of applying worker-poisonable SDDL bytes (SAFE001R-HEAL-01).
  const trustedRecord = {
    runId,
    mode: 'acl',
    liveRoot: toPosix(liveRoot),
    user,
    ownerPid: process.pid,
    appliedAt: nowIso(),
    healedAt: null,
    rootDeny: true,
    preSddl: { '.': getSddl(liveRoot) },
    targets: targets.map((t) => t.rel),
  };
  for (const t of targets) {
    trustedRecord.preSddl[t.rel] = getSddl(path.join(liveRoot, t.rel));
  }
  const publicRecord = () => {
    const { preSddl: _secretPreState, ...safe } = trustedRecord;
    return safe;
  };
  atomicWriteJson(guardJournalPath(controlRoot, runId), publicRecord());

  try {
    icacls([liveRoot, '/deny', `${user}:${DENY_RIGHTS}`]);
    for (const t of targets) {
      const abs = path.join(liveRoot, t.rel);
      const ace = t.inherit ? `${user}:(OI)(CI)${DENY_RIGHTS}` : `${user}:${DENY_RIGHTS}`;
      icacls([abs, '/deny', ace]);
    }
  } catch (error) {
    // The trusted bytes are still in memory, so unwind any partial apply now.
    for (const [rel, sddl] of Object.entries(trustedRecord.preSddl)) {
      try { setSddl(rel === '.' ? liveRoot : path.join(liveRoot, rel), sddl); } catch { /* original error wins */ }
    }
    throw error;
  }

  // Post-apply SDDL fingerprint per target — the tamper baseline.
  const postSddl = { '.': getSddl(liveRoot) };
  for (const t of targets) postSddl[t.rel] = getSddl(path.join(liveRoot, t.rel));
  trustedRecord.postSddlHash = Object.fromEntries(Object.entries(postSddl).map(([k, v]) => [k, sha256String(v)]));
  atomicWriteJson(guardJournalPath(controlRoot, runId), publicRecord());
  return trustedRecord;
}

// Tamper check: returns the list of targets whose DACL no longer matches the
// post-apply fingerprint. Any entry is a latched violation; reapply() restores
// the deny so the window stays closed while the runner kills the worker.
export function checkAclTamper(record) {
  const liveRoot = record.liveRoot;
  const tampered = [];
  for (const [rel, expectedHash] of Object.entries(record.postSddlHash || {})) {
    const abs = rel === '.' ? liveRoot : path.join(liveRoot, rel);
    let now;
    try {
      now = sha256String(getSddl(abs));
    } catch {
      tampered.push(`${rel} (unreadable ACL)`);
      continue;
    }
    if (now !== expectedHash) tampered.push(rel);
  }
  return tampered;
}

export function reapplyAclGuard(record) {
  const user = record.user;
  const liveRoot = record.liveRoot;
  icacls([liveRoot, '/deny', `${user}:${DENY_RIGHTS}`]);
  for (const rel of record.targets) {
    const abs = path.join(liveRoot, rel);
    let isDir = false;
    try { isDir = fs.statSync(abs).isDirectory(); } catch { continue; }
    const ace = isDir ? `${user}:(OI)(CI)${DENY_RIGHTS}` : `${user}:${DENY_RIGHTS}`;
    icacls([abs, '/deny', ace]);
  }
}

// Heal the ACL guard from SAME-PROCESS trusted memory only
// (SAFE001R-HEAL-01). The runner passes the object returned by applyAclGuard;
// no descriptor is ever re-read from worker-reachable storage. Cross-process
// recovery refuses automatically and requires controller intervention.
export function liftAclGuard(controlRoot, runId, trustedRecord = null) {
  const file = guardJournalPath(controlRoot, runId);
  if (!trustedRecord || trustedRecord.runId !== runId || !trustedRecord.preSddl) {
    const error = new Error(
      `ACL recovery for ${runId} requires the same-process trusted pre-state; refusing worker-reachable journal bytes`
    );
    error.code = 'GUARD_RECOVERY_REQUIRED';
    throw error;
  }

  const record = trustedRecord;
  const liveRoot = record.liveRoot;
  const failures = [];
  for (const [rel, sddl] of Object.entries(record.preSddl)) {
    const abs = rel === '.' ? liveRoot : path.join(liveRoot, rel);
    try {
      setSddl(abs, sddl);
    } catch (e) {
      failures.push({ path: abs, error: String(e.message || e).slice(0, 300) });
    }
  }

  // Write only the non-secret heal outcome after worker authority has ended.
  const { preSddl: _secretPreState, ...auditRecord } = record;
  auditRecord.healedAt = nowIso();
  auditRecord.healMode = 'trusted-memory-sddl';
  auditRecord.healFailures = failures;
  atomicWriteJson(file, auditRecord);
  if (failures.length) {
    const err = new Error(`ACL heal left ${failures.length} descriptors unrestored — inspect ${file}`);
    err.failures = failures;
    throw err;
  }
  return auditRecord;
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// Sweep only records backed by a caller-supplied same-process trusted record.
// A stale disk-only record fails closed; live-owner records are never touched.
export function sweepStaleGuards(controlRoot, trustedRecords = new Map()) {
  const dir = path.join(controlRoot, 'guards');
  if (!fs.existsSync(dir)) return [];
  const healed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const runId = name.replace(/\.json$/, '');
    let record;
    try {
      record = readJson(path.join(dir, name));
    } catch {
      continue;
    }
    if (record.mode === 'acl' && !record.healedAt && !pidAlive(record.ownerPid)) {
      const trusted = trustedRecords.get(runId);
      if (!trusted) {
        const error = new Error(
          `stale ACL guard ${runId} has no same-process trusted pre-state; refusing automatic heal`
        );
        error.code = 'GUARD_RECOVERY_REQUIRED';
        error.runId = runId;
        throw error;
      }
      liftAclGuard(controlRoot, runId, trusted);
      healed.push(runId);
    }
  }
  return healed;
}

// ---------- WATCH (detection, defense in depth) ----------

// Git strategy INCLUDES IGNORED FILES (':!' pathspecs keep the huge ephemeral
// trees out). A worker writing build/evil.txt on a git root is a violation even
// though git-porcelain alone would never show it.
function gitEntries(root, allowedPrefixes) {
  const excludes = ['node_modules', ...allowedPrefixes].map((p) => `:!${p}`);
  const out = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--ignored=matching', '--', '.', ...excludes],
    { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
  );
  const entries = new Map();
  for (const chunk of out.split('\0')) {
    if (!chunk || chunk.length < 4) continue;
    entries.set(toPosix(chunk.slice(3)), chunk.slice(0, 2));
  }
  return entries;
}

function statManifest(root, isExcluded) {
  const manifest = new Map();
  for (const rel of walkFiles(root, isExcluded)) {
    const st = fs.statSync(path.join(root, rel));
    manifest.set(toPosix(rel), `${st.size}:${Math.floor(st.mtimeMs)}`);
  }
  return manifest;
}

export function createWatchGuard(liveRoot, { allowedPrefixes = GUARD_ALLOWED_PREFIXES, strategy } = {}) {
  const allowed = allowedPrefixes.map(toPosix);
  const isAllowed = (rel) => allowed.some((p) => rel === p || rel.startsWith(p + '/'));
  const useGit = strategy === 'git' || (strategy === undefined && fs.existsSync(path.join(liveRoot, '.git')));
  const isExcluded = makeExcludePredicate(['node_modules', ...allowed]);

  const snap = () => (useGit ? gitEntries(liveRoot, allowed) : statManifest(liveRoot, isExcluded));
  const baseline = snap();

  return {
    strategy: useGit ? 'git' : 'manifest',
    check() {
      const now = snap();
      const violations = [];
      for (const [rel, sig] of now) {
        if (isAllowed(rel)) continue;
        if (!baseline.has(rel) || baseline.get(rel) !== sig) violations.push(rel);
      }
      for (const rel of baseline.keys()) {
        if (!now.has(rel) && !isAllowed(rel)) violations.push(`${rel} (deleted)`);
      }
      return violations;
    },
  };
}

// ---------- CONTROL-PLANE watch ----------

// The control root is never worker-writable. The runner itself must write a
// small, exact set of files during the run (its lease heartbeat; nothing else —
// run records are buffered and written after worker write-authority ends), so
// those exact relative paths are excluded. Everything else changing under the
// control root while the worker lives is a latched violation.
// The ONLY control-plane subtree a worker may legitimately write is its own
// workspace, `workspaces/<ownRunId>/**` (its sandbox + submission ingress).
// EVERYTHING else under the control root — other runs' workspaces, staging,
// guards, runs, journals, leases — is watched; a worker write there is a
// latched violation (advisory defects SAFE001R-CTRL-01 / HEAL-01: `guards/`
// and sibling workspaces were previously excluded and thus poisonable).
export function createControlWatch(controlRoot, { expectedWrites = [], ownRunId = null } = {}) {
  const expected = new Set(expectedWrites.map(toPosix));
  const excludes = ownRunId ? [`workspaces/${toPosix(ownRunId)}`] : [];
  const isExcluded = makeExcludePredicate(excludes);
  const snap = () => {
    const manifest = new Map();
    const stack = [''];
    while (stack.length) {
      const rel = stack.pop();
      const abs = rel ? path.join(controlRoot, rel) : controlRoot;
      let entries;
      try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const childRel = toPosix(rel ? `${rel}/${entry.name}` : entry.name);
        if (isExcluded(childRel)) continue;
        const childAbs = path.join(controlRoot, childRel);
        let st;
        try { st = fs.lstatSync(childAbs); } catch { continue; }
        if (st.isDirectory() && !st.isSymbolicLink()) {
          stack.push(childRel);
        } else if (st.isFile() && !st.isSymbolicLink()) {
          const bytes = fs.readFileSync(childAbs);
          manifest.set(childRel, { kind: 'file', hash: sha256String(bytes), bytes, mode: st.mode });
        } else {
          manifest.set(childRel, { kind: 'link-or-special', hash: null, bytes: null, mode: st.mode });
        }
      }
    }
    return manifest;
  };
  const baseline = snap();

  const differences = (now) => {
    const violations = [];
    for (const [rel, item] of now) {
      if (expected.has(rel)) continue;
      const before = baseline.get(rel);
      if (!before || before.kind !== item.kind || before.hash !== item.hash) {
        violations.push(`control-plane: ${rel}`);
      }
    }
    for (const rel of baseline.keys()) {
      if (!now.has(rel) && !expected.has(rel)) violations.push(`control-plane: ${rel} (deleted)`);
    }
    return violations;
  };

  return {
    check() {
      return differences(snap());
    },
    // Called only after descendant containment proves worker authority ended.
    // Restore controller files from the in-memory baseline and remove additions;
    // no worker-authored bytes participate in healing (SAFE001R-CTRL-01).
    heal() {
      const now = snap();
      const healed = [];
      const failures = [];
      for (const [rel, item] of now) {
        if (expected.has(rel)) continue;
        const before = baseline.get(rel);
        if (before && before.kind === item.kind && before.hash === item.hash) continue;
        const abs = path.join(controlRoot, rel);
        try {
          if (!before) {
            fs.rmSync(abs, { force: true, recursive: item.kind !== 'file' });
          } else {
            fs.rmSync(abs, { force: true, recursive: item.kind !== 'file' });
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, before.bytes, { mode: before.mode });
          }
          healed.push(rel);
        } catch (error) {
          failures.push({ path: rel, error: String(error.message || error) });
        }
      }
      for (const [rel, before] of baseline) {
        if (expected.has(rel) || now.has(rel)) continue;
        const abs = path.join(controlRoot, rel);
        try {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, before.bytes, { mode: before.mode });
          healed.push(rel);
        } catch (error) {
          failures.push({ path: rel, error: String(error.message || error) });
        }
      }
      return { healed, failures, remaining: differences(snap()) };
    },
  };
}
