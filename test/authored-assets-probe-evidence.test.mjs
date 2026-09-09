import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const probeSource = await readFile(new URL('../scripts/probe-authored-assets-live.mjs', import.meta.url), 'utf8');

test('browser evidence contract binds the route, GPU, and honest fixture metadata', () => {
  assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_SHOT/,
    'browser fixture can place its screenshot inside its evidence task directory');
  assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_REPORT/,
    'browser fixture can write a machine-readable task-contained report');
  assert.match(probeSource, /process\.env\.SF_ASSETS_LIVE_LOG/,
    'browser fixture can write a task-contained probe log without shell redirection');
  assert.match(probeSource, /WEBGL_debug_renderer_info/,
    'browser report queries the WebGL debug renderer identity when available');
  assert.match(probeSource, /UNMASKED_VENDOR_WEBGL/,
    'browser report records the actual WebGL vendor');
  assert.match(probeSource, /UNMASKED_RENDERER_WEBGL/,
    'browser report records the actual WebGL renderer');
  assert.match(probeSource, /route:\s*probeRoute/,
    'browser report names the explicit seeded debug route');
  assert.match(probeSource, /injectedState:\s*true/,
    'browser report acknowledges internal game:new/ui:closeAll event injection');
  assert.match(probeSource, /inputSource:\s*['"]fixture['"]/,
    'browser report labels the seeded internal-event path as a fixture');
});

test('PASS evidence is candidate-bound and follows exact runtime teardown proof', async () => {
  assert.match(probeSource, /export function collectAuthoredProbeCandidateIdentity/,
    'the probe must publish a source-bound candidate identity');
  assert.match(probeSource, /export function finalizeAuthoredProbeEvidence/,
    'PASS serialization must be guarded by the teardown receipt');
  const {
    assertAuthoredProbeCleanup,
    collectAuthoredProbeCandidateIdentity,
    finalizeAuthoredProbeEvidence,
  } = await import('../scripts/probe-authored-assets-live.mjs');

  const candidate = collectAuthoredProbeCandidateIdentity();
  assert.match(candidate.head, /^[0-9a-f]{40}$/);
  assert.match(candidate.originMaster, /^[0-9a-f]{40}$/);
  assert.match(candidate.sourceDigest, /^[0-9a-f]{64}$/);
  assert.ok(candidate.sourceFiles.includes('src/render/partsLibrary.js'));
  assert.ok(candidate.sourceFiles.includes('src/render/renderPackageManifest.js'));

  const cleanup = {
    chrome: { started: true, pid: 1001, exitConfirmed: true },
    server: { started: true, pid: 1002, exitConfirmed: true },
    ports: [
      { name: 'chrome-debug', port: 9801, refused: true },
      { name: 'game-server', port: 8521, refused: true },
    ],
    profile: { path: 'owned-profile', deleted: true },
  };
  assert.doesNotThrow(() => assertAuthoredProbeCleanup(cleanup));
  const receipt = finalizeAuthoredProbeEvidence({ candidate, route: 'fixture' }, cleanup);
  assert.equal(receipt.status, 'PASS');
  assert.deepEqual(receipt.cleanup, cleanup);

  const leaking = structuredClone(cleanup);
  leaking.ports[1].refused = false;
  assert.throws(() => assertAuthoredProbeCleanup(leaking), /game-server/);
  assert.throws(() => finalizeAuthoredProbeEvidence({ candidate }, leaking), /game-server/,
    'a listener leak must prevent PASS evidence from being constructed');
});
