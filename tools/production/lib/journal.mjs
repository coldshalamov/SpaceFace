// SAFE-001 write journal (repair-1). After a worker run, diff the workspace
// against its snapshot manifest and classify every write against the packet's
// writable allowlist.
//
// Repair-1 hardening (SAFE-001-REPAIR defects 6/7):
//  - a workspace entry that is a symlink/junction/reparse point is a VIOLATION,
//    not a skip — planting a link is an escape attempt;
//  - a workspace file with hardlink count > 1 is a VIOLATION: mutating a
//    hardlink alias inside the workspace mutates the linked live/control file;
//  - any path containing ':' (NTFS ADS), a device basename (CON/NUL/COM1...),
//    '..' segments, or an absolute form is a VIOLATION wherever it appears
//    (journal entries, submission evidence, candidate outputs);
//  - candidate outputs must be regular files.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sha256File, walkFiles, globToRegExp, matchesAny, toPosix, nowIso } from './util.mjs';
import { makeExcludePredicate } from './snapshot.mjs';

export const SUBMISSION_DIR = '.submission';

const DEVICE_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

// Path hygiene shared by journal, submission validation, and integration.
export function pathHygieneViolation(relPath) {
  const p = String(relPath);
  if (!p.length) return 'empty path';
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\')) return 'absolute path';
  if (p.includes(':')) return 'colon in path (NTFS alternate data stream syntax)';
  const segs = toPosix(p).split('/');
  if (segs.some((s) => s === '..')) return "'..' traversal segment";
  if (segs.some((s) => DEVICE_NAMES.test(s))) return 'reserved device name';
  return null;
}

// Walk the workspace with lstat so links are visible instead of followed.
function walkWithLstat(workspaceDir, isExcluded) {
  const files = [];
  const linkViolations = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(workspaceDir, rel) : workspaceDir;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcluded(childRel)) continue;
      let st;
      try {
        st = fs.lstatSync(path.join(workspaceDir, childRel));
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        // node reports junctions and symlinks here. The snapshot itself creates
        // exactly one sanctioned junction: node_modules (excluded above).
        linkViolations.push({ path: toPosix(childRel), kind: 'symlink/reparse point' });
        continue;
      }
      if (st.isDirectory()) {
        stack.push(childRel);
      } else if (st.isFile()) {
        files.push({ rel: toPosix(childRel), nlink: st.nlink });
      } else {
        linkViolations.push({ path: toPosix(childRel), kind: 'non-regular file' });
      }
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, linkViolations };
}

function enumerateAlternateStreams(workspaceDir, files) {
  if (process.platform !== 'win32' || files.length === 0) return { violations: [], error: null };
  const absolutePaths = files.map(({ rel }) => path.join(workspaceDir, rel));
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$paths = @(([Console]::In.ReadToEnd() | ConvertFrom-Json))
$out = @()
foreach ($p in $paths) {
  $streams = @(Get-Item -LiteralPath $p -Stream * | Select-Object -ExpandProperty Stream)
  $bad = @($streams | Where-Object { $_ -ne ':$DATA' })
  if ($bad.Count -gt 0) { $out += [pscustomobject]@{ path = $p; streams = $bad } }
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($out) -Compress))
`;
  let lastError = null;
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      const raw = execFileSync(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
        input: JSON.stringify(absolutePaths), encoding: 'utf8', windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
      const found = JSON.parse(raw || '[]');
      return {
        violations: found.flatMap((item) => item.streams.map((stream) =>
          `${toPosix(path.relative(workspaceDir, item.path))} (NTFS alternate stream ${stream})`
        )),
        error: null,
      };
    } catch (error) {
      lastError = error;
    }
  }
  return { violations: [], error: `NTFS stream enumeration unavailable: ${String(lastError?.message || lastError)}` };
}

export function journalWorkspace(workspaceDir, snapshotManifest, writableGlobs, { excludes = [] } = {}) {
  const isExcluded = makeExcludePredicate(['node_modules', ...excludes]);
  const writableRes = writableGlobs.map(globToRegExp);
  const implicitRes = [globToRegExp(`${SUBMISSION_DIR}/**`)];

  const { files, linkViolations } = walkWithLstat(workspaceDir, isExcluded);
  const streamAudit = enumerateAlternateStreams(workspaceDir, files);
  const currentSet = new Set(files.map((f) => f.rel));
  const baseFiles = snapshotManifest.files;

  const added = [];
  const modified = [];
  const deleted = [];
  const hygieneViolations = [];
  const hardlinkViolations = [];
  const streamViolations = [...streamAudit.violations];
  if (streamAudit.error) streamViolations.push(streamAudit.error);

  for (const f of files) {
    const hygiene = pathHygieneViolation(f.rel);
    if (hygiene) hygieneViolations.push(`${f.rel} (${hygiene})`);
    if (f.nlink > 1) hardlinkViolations.push(`${f.rel} (hardlink count ${f.nlink} — may alias a live/control file)`);
    const base = baseFiles[f.rel];
    if (!base) {
      added.push(f.rel);
    } else {
      const hash = sha256File(path.join(workspaceDir, f.rel));
      if (hash !== base.sha256) modified.push(f.rel);
    }
  }
  for (const rel of Object.keys(baseFiles)) {
    if (!currentSet.has(rel)) deleted.push(rel);
  }

  const classify = (rel) =>
    matchesAny(rel, writableRes) || matchesAny(rel, implicitRes) ? 'allowed' : 'violation';

  const entries = [
    ...added.map((p) => ({ path: p, change: 'added', verdict: classify(p) })),
    ...modified.map((p) => ({ path: p, change: 'modified', verdict: classify(p) })),
    ...deleted.map((p) => ({ path: p, change: 'deleted', verdict: classify(p) })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  const violations = [
    ...entries.filter((e) => e.verdict === 'violation').map((v) => `${v.path} (${v.change})`),
    ...linkViolations.map((v) => `${v.path} (${v.kind})`),
    ...hardlinkViolations,
    ...streamViolations,
    ...hygieneViolations,
  ];

  return {
    journaledAt: nowIso(),
    workspaceDir: toPosix(workspaceDir),
    writableGlobs,
    totals: { added: added.length, modified: modified.length, deleted: deleted.length },
    linkViolations: linkViolations.map((v) => `${v.path} (${v.kind})`),
    hardlinkViolations,
    streamViolations,
    hygieneViolations,
    violations,
    entries,
  };
}

// Hash every allowed changed regular file: the candidate output set an
// integrator may later copy to the live tree — and nothing else.
export function candidateOutputs(workspaceDir, journal) {
  const outputs = [];
  for (const entry of journal.entries) {
    if (entry.verdict !== 'allowed' || entry.change === 'deleted') continue;
    if (entry.path === SUBMISSION_DIR || entry.path.startsWith(SUBMISSION_DIR + '/')) continue;
    if (pathHygieneViolation(entry.path)) continue; // already a violation; never an output
    const abs = path.join(workspaceDir, entry.path);
    const st = fs.lstatSync(abs);
    if (!st.isFile() || st.isSymbolicLink() || st.nlink > 1) continue;
    outputs.push({ path: entry.path, sha256: sha256File(abs) });
  }
  return outputs;
}

export function readSubmission(workspaceDir) {
  const file = path.join(workspaceDir, SUBMISSION_DIR, 'worker-submission.json');
  if (!fs.existsSync(file)) return { file, exists: false, parsed: null, parseError: null };
  try {
    return { file, exists: true, parsed: JSON.parse(fs.readFileSync(file, 'utf8')), parseError: null };
  } catch (e) {
    return { file, exists: true, parsed: null, parseError: String(e.message || e) };
  }
}
