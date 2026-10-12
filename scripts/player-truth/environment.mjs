// Harness self-check. The game is served from this worktree, and on the fleet
// `assets/` and `design/` are symlinks to a shared checkout. That checkout has
// been stale against HEAD before (New Game: "The authored starter ship could
// not be loaded"), which made every gate fail for a reason that was not the
// code under test. This module compares the files the route loads with
// `git ls-tree HEAD` and refuses to drive the game when they disagree.
//
// Cost, on purpose: every blob is size-checked (no LFS; size is the blob
// size). Content is hashed only for files ≤64KB, every render-package.json,
// and the starter-hull render.glb files the route actually loads. Hashing the
// whole design tree (~1GB) plus every render package on each run is too much
// IO for the shared box. Extra files on disk are ignored. A git failure is a
// harness error (exit 3), not an environment verdict.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const ENVIRONMENT_EXIT = 4;
export const STALE_BANNER = 'HARNESS ENVIRONMENT: assets stale vs HEAD';
export const HASH_BYTE_CAP = 64 * 1024;

/**
 * The harness writes its own scoreboard here. On the fleet, `design/` is a symlink to a
 * shared checkout, so those verdict files often differ from HEAD without the game loading
 * them. They are not part of the route. Everything else under assets/ and design/ is.
 */
export const HARNESS_OUTPUT_PREFIX = 'design/program/player-truth/';

export function isHarnessOutput(filePath) {
  return String(filePath).startsWith(HARNESS_OUTPUT_PREFIX);
}

/** Directories the public route loads as the starter hull, plus their lod1 sibling. */
const STARTER_GLB = /\/render-packages\/(kestrel|hornet-production-v1|drifter-production-v1|pelican-production-v1|wasp)(-lod1)?\/render\.glb$/;

/** Player-facing sentences that mean the route could not load. The harness quotes these; it does not grade them as a gameplay FAIL. */
const LOAD_ERROR_RES = [
  /The authored starter ship could not be loaded\.\s*Retry Launch; saved games are unchanged\./,
  /The starter ship did not finish preparing\.\s*Retry Launch; saved games are unchanged\./,
  /The flight renderer did not finish preparing\.\s*Retry Launch; saved games are unchanged\./,
  /The opening flight materials did not finish preparing\.\s*Retry Launch; saved games are unchanged\./,
  /The flight physics systems did not finish preparing\.\s*Retry Launch; saved games are unchanged\./,
  /The game could not start\.\s*Retry Launch; saved games are unchanged\./,
  /That New Run\+ legacy could not be restored\./,
  /The opening scenario could not be loaded/,
  /SpaceFace could not finish starting/,
];

export function quoteLoadError(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  for (const re of LOAD_ERROR_RES) {
    const m = flat.match(re);
    if (m) return m[0];
  }
  return null;
}

/** `git ls-tree -r -l` lines: `<mode> <type> <oid> <size>\t<path>`. */
export function parseLsTree(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const meta = line.slice(0, tab).trim().split(/\s+/);
    if (meta[1] !== 'blob') continue;
    const size = Number(meta[3]);
    if (!Number.isFinite(size) || size < 0) continue;
    out.push({ path: line.slice(tab + 1), oid: meta[2], size });
  }
  return out;
}

export function needsHash(filePath, size) {
  if (size <= HASH_BYTE_CAP) return true;
  if (String(filePath).endsWith('render-package.json')) return true;
  if (STARTER_GLB.test(String(filePath))) return true;
  return false;
}

/** Git blob id of a buffer (SHA-1 of `blob <len>\\0<body>`). */
export function gitBlobOid(buf) {
  const hash = createHash('sha1');
  hash.update(`blob ${buf.length}\0`);
  hash.update(buf);
  return hash.digest('hex');
}

export function gitHashFile(file) {
  return gitBlobOid(readFileSync(file));
}

/**
 * Compare a ls-tree listing with the files on disk.
 * `stat(absPath)` returns `{ size }` or null when the path is missing.
 * `hash(absPath)` returns the git blob oid. Both default to the real filesystem.
 */
export function assessTree(entries, { root, stat = null, hash = null } = {}) {
  const problems = [];
  let hashed = 0;
  const doStat = stat || ((abs) => {
    try {
      const st = statSync(abs);
      return st.isFile() ? { size: st.size } : { size: -1, notFile: true };
    } catch {
      return null;
    }
  });
  const doHash = hash || gitHashFile;
  for (const entry of entries) {
    const abs = path.join(root, entry.path);
    const st = doStat(abs);
    if (!st) {
      problems.push({ path: entry.path, kind: 'missing', expected: `${entry.size} ${entry.oid}`, served: 'absent' });
      continue;
    }
    if (st.notFile) {
      problems.push({ path: entry.path, kind: 'missing', expected: 'file', served: 'not a file' });
      continue;
    }
    if (st.size !== entry.size) {
      problems.push({ path: entry.path, kind: 'size', expected: String(entry.size), served: String(st.size) });
      continue;
    }
    if (!needsHash(entry.path, entry.size)) continue;
    hashed++;
    let oid;
    try { oid = doHash(abs); } catch (err) {
      problems.push({ path: entry.path, kind: 'hash', expected: entry.oid, served: String(err && err.message || err) });
      continue;
    }
    if (oid !== entry.oid) problems.push({ path: entry.path, kind: 'hash', expected: entry.oid, served: oid });
  }
  return { ok: problems.length === 0, problems, hashed };
}

export function readHeadTree(root, rev = 'HEAD') {
  let text;
  try {
    text = execFileSync('git', ['ls-tree', '-r', '-l', rev, '--', 'assets', 'design'], {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const wrapped = new Error(`harness could not read git ls-tree ${rev} -- assets design: ${err && err.message ? err.message.split('\n')[0] : err}`);
    wrapped.harnessError = true;
    throw wrapped;
  }
  const entries = parseLsTree(text);
  if (!entries.length) {
    const wrapped = new Error(`git ls-tree ${rev} -- assets design returned no blobs`);
    wrapped.harnessError = true;
    throw wrapped;
  }
  return entries;
}

/** One manifest, fetched the way the page fetches it, must be the HEAD blob. */
export async function checkServedSample(baseUrl, entries, samplePath = 'assets/ships/release/render-packages/kestrel/render-package.json') {
  const entry = entries.find((e) => e.path === samplePath);
  if (!entry) return { ok: false, problems: [{ path: samplePath, kind: 'missing', expected: 'listed in HEAD', served: 'not in ls-tree' }] };
  const url = new URL(samplePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  let res;
  try { res = await fetch(url); } catch (err) {
    return { ok: false, problems: [{ path: samplePath, kind: 'missing', expected: entry.oid, served: String(err && err.message || err) }] };
  }
  if (!res.ok) return { ok: false, problems: [{ path: samplePath, kind: 'missing', expected: entry.oid, served: `HTTP ${res.status}` }] };
  const buf = Buffer.from(await res.arrayBuffer());
  const oid = gitBlobOid(buf);
  if (buf.length !== entry.size || oid !== entry.oid) {
    const kind = buf.length !== entry.size ? 'size' : 'hash';
    return { ok: false, problems: [{ path: samplePath, kind, expected: `${entry.size} ${entry.oid}`, served: `${buf.length} ${oid}` }] };
  }
  return { ok: true, problems: [] };
}

export async function verifyHarnessEnvironment({ root, rev = 'HEAD', baseUrl = null }) {
  const entries = readHeadTree(root, rev).filter((entry) => !isHarnessOutput(entry.path));
  const disk = assessTree(entries, { root });
  const served = baseUrl ? await checkServedSample(baseUrl, entries) : { ok: true, problems: [] };
  const problems = [...disk.problems, ...served.problems];
  return { ok: problems.length === 0, problems, hashed: disk.hashed, checked: entries.length, banner: problems.length ? STALE_BANNER : null };
}

export function renderEnvironmentAbort({ problems, commit, checked, hashed }) {
  const shown = problems.slice(0, 12);
  const lines = [
    '# Player-truth verdict: ENVIRONMENT — harness',
    '',
    STALE_BANNER,
    '',
    `This is not a gameplay FAIL. Served assets/ and design/ do not match ${commit || 'HEAD'}.`,
    `Checked ${checked == null ? '?' : checked} blobs, hashed ${hashed == null ? '?' : hashed}. The browser was not started.`,
    '',
    ...shown.map((p) => `- ${p.path}: ${p.kind} expected ${p.expected} served ${p.served}`),
  ];
  if (problems.length > shown.length) lines.push(`- … ${problems.length - shown.length} more`);
  return `${lines.join('\n')}\n`;
}
