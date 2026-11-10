// Lightweight fail-closed fingerprint for the travel public-route harness.
// Full alpha worktreeFingerprint hangs on multi-10k-line dirty masters because it
// hashes the entire binary git diff. Travel harnesses only need to prove that the
// route sources and package wiring did not drift mid-run.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export const TRAVEL_FINGERPRINT_PATHS = Object.freeze([
  'scripts/lib/professionalTravelPublicRoute.mjs',
  'scripts/check-professional-travel-public-route-browser.mjs',
  'scripts/check-professional-travel-public-route-electron.mjs',
  'test/professional-travel-public-route-contract.test.mjs',
  'test/galaxy-map-gate-jump-seam.test.mjs',
  'src/ui/galaxyMap.js',
  'package.json',
]);

export async function travelRouteFingerprint(root) {
  const resolved = path.resolve(root);
  const hash = createHash('sha256');
  const entries = [];

  const head = await gitText(resolved, ['rev-parse', 'HEAD']);
  const branch = (await gitText(resolved, ['branch', '--show-current'])) || 'detached';
  const status = await gitText(resolved, ['status', '--porcelain=v1', '--', ...TRAVEL_FINGERPRINT_PATHS]);
  // HEAD is evidence metadata, not part of the scoped digest. Parallel production commits may
  // advance master while a headed route is running; only changes to the owned paths below should
  // invalidate the capture.
  hash.update(`branch:${branch}\0status:${status}\0`);

  for (const rel of TRAVEL_FINGERPRINT_PATHS) {
    const abs = path.join(resolved, rel);
    let body = '';
    try {
      body = await readFile(abs, 'utf8');
    } catch (error) {
      body = `MISSING:${error.message || error}`;
    }
    const fileDigest = createHash('sha256').update(body).digest('hex');
    entries.push({ path: rel, digest: fileDigest, bytes: Buffer.byteLength(body) });
    hash.update(`${rel}\0${fileDigest}\0`);
  }

  const digest = hash.digest('hex');
  return {
    kind: 'travel-route-scoped',
    branch,
    head,
    digest,
    id: `${branch}@${head.slice(0, 8)}#travel-${digest.slice(0, 12)}`,
    paths: TRAVEL_FINGERPRINT_PATHS.slice(),
    entries,
  };
}

async function gitText(cwd, args) {
  const result = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  return String(result.stdout || '').trim();
}
