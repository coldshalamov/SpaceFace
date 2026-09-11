// PQ-033.01 release identity: the build hash a crash report, an update check, and the
// title/pause fine print all agree on. Resolution is deterministic and offline-safe:
//
//   1. SPACEFACE_BUILD_HASH — evidence harnesses pin an exact build id.
//   2. Packaged app — the sha256 output digest recorded in build/web/spaceface-release-build.json,
//      which is the bundle actually being served.
//   3. Dev app — `git rev-parse --short=12 HEAD`, because Electron dev serves the live project root.
//   4. 'dev' — no receipt, no git: say so rather than quote a stale receipt.
//
// Everything is injectable so the seconds-scale test needs no Electron, git, or filesystem truth.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RELEASE_RECEIPT_RELATIVE = path.join('build', 'web', 'spaceface-release-build.json');
const BUILD_HASH_LENGTH = 12;

function cleanToken(value, max = 64) {
  const text = String(value == null ? '' : value).trim();
  return text.replace(/[^\w.\-]+/g, '').slice(0, max);
}

function readReleaseReceiptDigest(receiptPath, fsImpl = fs) {
  let raw;
  try {
    raw = fsImpl.readFileSync(receiptPath, 'utf8');
  } catch (_) {
    return null;
  }
  try {
    const receipt = JSON.parse(raw);
    const digest = receipt && receipt.output && receipt.output.digest;
    return typeof digest === 'string' && /^[0-9a-f]{16,64}$/i.test(digest)
      ? digest.slice(0, BUILD_HASH_LENGTH)
      : null;
  } catch (_) {
    return null;
  }
}

function readGitHead(projectRoot, execFileSyncImpl = execFileSync) {
  try {
    if (!fs.existsSync(path.join(projectRoot, '.git'))) return null;
    const out = execFileSyncImpl('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const hash = String(out || '').trim();
    return /^[0-9a-f]{7,40}$/i.test(hash) ? hash : null;
  } catch (_) {
    return null;
  }
}

function resolveReleaseIdentity({
  appApi,
  projectRoot,
  env = process.env,
  fsImpl = fs,
  execFileSyncImpl = execFileSync,
} = {}) {
  const packaged = !!(appApi && appApi.isPackaged === true);
  let version = '';
  try {
    if (appApi && typeof appApi.getVersion === 'function') version = String(appApi.getVersion() || '');
  } catch (_) {}

  const envBuild = cleanToken(env && env.SPACEFACE_BUILD_HASH, BUILD_HASH_LENGTH);
  if (envBuild) {
    return Object.freeze({ version, build: envBuild, packaged, source: 'env' });
  }

  const receiptPath = projectRoot ? path.join(projectRoot, RELEASE_RECEIPT_RELATIVE) : null;
  if (packaged && receiptPath) {
    const digest = readReleaseReceiptDigest(receiptPath, fsImpl);
    if (digest) return Object.freeze({ version, build: digest, packaged, source: 'release-receipt' });
    return Object.freeze({ version, build: '', packaged, source: 'unreceipted-package' });
  }

  const head = projectRoot ? readGitHead(projectRoot, execFileSyncImpl) : null;
  if (head) return Object.freeze({ version, build: head, packaged, source: 'git-head' });
  return Object.freeze({ version, build: 'dev', packaged, source: 'dev' });
}

// The renderer-facing view: never carries filesystem paths or env internals.
function publicBuildInfo(identity) {
  const source = identity && identity.source;
  return Object.freeze({
    version: cleanToken(identity && identity.version, 32),
    build: cleanToken(identity && identity.build, 32),
    packaged: !!(identity && identity.packaged),
    channel: source === 'release-receipt' ? 'release'
      : source === 'git-head' ? 'dev'
      : source === 'env' ? 'evidence'
      : 'unknown',
  });
}

module.exports = {
  BUILD_HASH_LENGTH,
  RELEASE_RECEIPT_RELATIVE,
  publicBuildInfo,
  readReleaseReceiptDigest,
  readGitHead,
  resolveReleaseIdentity,
};
