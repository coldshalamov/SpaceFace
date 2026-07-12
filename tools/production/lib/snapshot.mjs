// SAFE-001 workspace snapshot. Creates an isolated candidate workspace as a
// plain file copy of the live working tree (including uncommitted state) —
// explicitly WITHOUT any git branch/stash/reset/worktree, per 02_ORCHESTRATOR_SPEC §2.
// The snapshot manifest lives in the CONTROL root, never inside the workspace,
// so a worker cannot edit its own baseline.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256File, sha256String, walkFiles, atomicWriteJson, nowIso, toPosix } from './util.mjs';

// Paths never copied into a workspace and never treated as candidate output.
// .campaign is the control plane: workers must not receive a copy of it.
export const DEFAULT_EXCLUDES = [
  '.git', 'node_modules', '.campaign', '.devshots', '.tmp',
  'build', 'dist', 'terminals', 'nul',
];

export function makeExcludePredicate(excludes) {
  const set = excludes.map(toPosix);
  return (rel) => {
    const norm = toPosix(rel);
    return set.some((ex) => norm === ex || norm.startsWith(ex + '/'));
  };
}

// Copy liveRoot -> workspaceDir, build a hash manifest, and return it.
// options.extraExcludes: additional top-level (or nested) path prefixes to skip.
// options.linkNodeModules: create a junction to the live node_modules so checks
//   can run inside the workspace without copying gigabytes. The junction target
//   is still protected by the live-root guard for writes.
export function createWorkspace(liveRoot, workspaceDir, options = {}) {
  const excludes = [...DEFAULT_EXCLUDES, ...(options.extraExcludes || [])];
  const isExcluded = makeExcludePredicate(excludes);
  if (fs.existsSync(workspaceDir)) {
    throw new Error(`workspace already exists: ${workspaceDir} (workspaces are single-use)`);
  }
  fs.mkdirSync(workspaceDir, { recursive: true });

  const files = walkFiles(liveRoot, isExcluded);
  const manifest = {};
  for (const rel of files) {
    const src = path.join(liveRoot, rel);
    const dst = path.join(workspaceDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    manifest[toPosix(rel)] = { sha256: sha256File(src), size: fs.statSync(src).size };
  }

  if (options.linkNodeModules) {
    const liveNm = path.join(liveRoot, 'node_modules');
    if (fs.existsSync(liveNm)) {
      const wsNm = path.join(workspaceDir, 'node_modules');
      // Junction on Windows needs no admin rights; 'junction' falls back to dir symlink elsewhere.
      fs.symlinkSync(liveNm, wsNm, 'junction');
    }
  }

  const manifestHash = sha256String(JSON.stringify(manifest));
  return {
    createdAt: nowIso(),
    liveRoot: toPosix(liveRoot),
    workspaceDir: toPosix(workspaceDir),
    excludes,
    fileCount: files.length,
    manifestHash,
    files: manifest,
  };
}

export function saveSnapshotRecord(controlRoot, runId, snapshot) {
  const file = path.join(controlRoot, 'workspaces', `${runId}.snapshot.json`);
  atomicWriteJson(file, snapshot);
  return file;
}

// Hash of the live-tree input set a candidate was built from. Integration later
// re-checks these exact hashes: if any input changed while the worker ran, the
// integration is stale and must abort (02_ORCHESTRATOR_SPEC §2 step 6).
export function computeInputBaseline(liveRoot, relPaths) {
  const baseline = {};
  for (const rel of relPaths) {
    const abs = path.join(liveRoot, rel);
    baseline[toPosix(rel)] = fs.existsSync(abs) ? sha256File(abs) : null;
  }
  return baseline;
}

// Working-tree fingerprint of a git root (empty string if not a git repo).
export function gitStatusFingerprint(root) {
  try {
    const out = execFileSync('git', ['status', '--porcelain=v1', '-z'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return sha256String(out);
  } catch {
    return '';
  }
}
