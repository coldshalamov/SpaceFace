// PQ-019A H1 continuation — static authority for the one-use capsule presentation cell.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import manifest, {
  createPq019aCapsulePresentationManifest,
  PQ019A_CAPSULE_FRAMINGS,
  PQ019A_CAPSULE_PRESENTATION_FIXED_SEED,
} from '../scripts/validation-manifests/pq019a-capsule-presentation.mjs';
import { loadValidationManifestById } from '../scripts/lib/validationManifestRegistry.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const abs = (relative) => fileURLToPath(new URL(relative, ROOT));

test('the repaired capsule presentation is one candidate-bound Browser cell', () => {
  assert.equal(manifest.id, 'pq019a-capsule-presentation');
  assert.equal(manifest.runtimeKind, 'browser');
  assert.equal(manifest.mode, 'acceptance');
  assert.deepEqual(manifest.commandArgs, ['scripts/capture-pq019a-acceptance.mjs', '--capsule-only']);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ019A_CAPSULE_PRESENTATION_FIXED_SEED);
  assert.equal(PQ019A_CAPSULE_PRESENTATION_FIXED_SEED, 0x50513139);
  assert.deepEqual(
    PQ019A_CAPSULE_FRAMINGS.map(({ name, zoomRadii, expectedCameraZoom }) => (
      { name, zoomRadii, expectedCameraZoom }
    )),
    [
      { name: 'close', zoomRadii: 7.5, expectedCameraZoom: 45 },
      { name: 'default', zoomRadii: 11, expectedCameraZoom: 66 },
      { name: 'far', zoomRadii: 18, expectedCameraZoom: 108 },
    ],
  );
  assert.match(manifest.artifactRoot.replace(/\\/g, '/'), /^\.devshots\/pq019a-acceptance$/);
  assert.equal(createPq019aCapsulePresentationManifest({ timeoutMs: 1234 }).timeoutMs, 1234);
});

test('all manifest invalidation paths exist and the focused repair runs before claim issue', () => {
  const missing = [];
  for (const group of ['regressionSourcePaths', 'productionSourcePaths', 'harnessSourcePaths']) {
    assert.ok(manifest[group].length > 0, `${group} must not be empty`);
    for (const relative of manifest[group]) {
      if (!existsSync(abs(relative))) missing.push(`${group}: ${relative}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.deepEqual(manifest.fastGateCommands, [
    'node --test test/pq019a-capsule-capture-repair.test.mjs test/pq019a-capsule-presentation-h1-manifest.test.mjs',
    'npm run check:pq019a:facility-embodiment',
    'npm run check:sim:compare',
  ]);
});

test('the capture consumes a broker claim and cannot silently turn a direct run into evidence', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  assert.match(source, /requireBrokerClaimOrDiagnostic/);
  assert.match(source, /process\.env\.SF_BROKER_CLAIM/);
  assert.match(source, /process\.exit\(2\)/);
  assert.match(source, /requiredRuntimeKind:\s*'browser'/);
  assert.match(source, /page\.fill\('#sf-ng-seed', String\(CAPTURE_SEED\)\)/);
  assert.match(source, /assert\.equal\(recordedSeed, CAPTURE_SEED/);
  assert.match(source, /assertInFrame\(receipt, `cargo_capsule\/\$\{framing\.name\}`\)/);
});

test('the frozen-subject page context declares every returned player-relative fact', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  const body = source.slice(
    source.indexOf('async function trackFrozenSubject'),
    source.indexOf('async function clearFrozenSubjectTracking'),
  );
  assert.match(body, /const player = state\.entities\.get\(state\.playerId\)/,
    'the accepted run failed with ReferenceError: player is not defined');
  assert.match(body, /const separation = Math\.hypot\(/,
    'separationFromPlayer must be computed inside the same page.evaluate context');
  assert.match(body, /Math\.max\(cameraZoomMin, radius \* framing\.zoomRadii\)/,
    'the capture calculation must model the product camera owner minimum');
  assert.match(body, /cameraZoomMin:\s*CAMERA_ZOOM_MIN/,
    'Node-side camera constants must be passed into the page context explicitly');
  assert.match(source, /assert\.equal\(receipt\.cameraZoom, framing\.expectedCameraZoom/,
    'each runtime receipt must prove that the camera owner applied the declared zoom');
});

test('the continuation skips already-valid facility and cue screenshots', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  assert.match(source, /const CAPSULE_ONLY = process\.argv\.includes\('--capsule-only'\)/);
  assert.match(source, /for \(const framing of CAPSULE_FRAMINGS\)/);
  assert.match(source, /if \(!CAPSULE_ONLY\) \{[\s\S]*?for \(const facility of FACILITIES\)/);
  assert.match(source, /if \(!CAPSULE_ONLY\) \{[\s\S]*?launch-cue-tminus\.png/);
});

test('the tracked registry resolves the capsule presentation cell', async () => {
  const registered = await loadValidationManifestById({
    root: fileURLToPath(ROOT),
    id: 'pq019a-capsule-presentation',
  });
  assert.equal(registered.id, manifest.id);
  assert.match(registered.__trackedManifest.relativePath, /pq019a-capsule-presentation\.mjs$/);
});

test('the cell stays presentation-only', () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  for (const forbidden of [
    /performance\.now\s*\(/,
    /frameTimes?\s*[:=]/,
    /hitch(?:Count|es)\s*[:=]/i,
    /p(?:95|99)\s*[:=]/i,
  ]) assert.doesNotMatch(source, forbidden);
  assert.match(source, /Presentation stills only/);
  assert.match(source, /'matched traffic performance'/);
});

// Execute only the capture-owned framing seam. No browser, renderer, broker claim, or wall wait.
function facilityCaptureSeam() {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  const declarations = source.slice(source.indexOf('const FRAMINGS ='), source.indexOf('function systemBrowser()'));
  const frameSubject = source.slice(source.indexOf('async function frameSubject'), source.indexOf('// Track the frozen subject'));
  return runInNewContext(`${declarations}\n${frameSubject}\n({ FRAMINGS, FACILITIES, frameSubject })`, {
    PQ019A_CAPSULE_FRAMINGS,
  });
}

test('facility framing honors the camera floor and ceiling without changing retained facility scales', async () => {
  const { FRAMINGS, frameSubject } = facilityCaptureSeam();
  const cases = [
    { role: 'heist_launcher', placeRadius: 20, radius: 99, zooms: [60, 110, 220] },
    { role: 'lawful_catcher', placeRadius: 24, radius: 99, zooms: [72, 132, 264] },
    { role: 'fence_receiver', placeRadius: 24, radius: 99, zooms: [72, 132, 264] },
    // This shared approach seam also handles the six-WU capsule before its accepted frozen views.
    { role: 'cargo_capsule', radius: 6, zooms: [45, 45, 66] },
    { role: 'floor-boundary', radius: 15, zooms: [45, 82.5, 165] },
    { role: 'ceiling-boundary', radius: 110, zooms: [330, 330, 330] },
  ];
  for (const fixture of cases) {
    for (const [index, framing] of FRAMINGS.entries()) {
      const player = { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
      const target = {
        id: fixture.role, pos: { x: 100, z: 200 }, radius: fixture.radius,
        data: { placeRadius: fixture.placeRadius },
      };
      const requested = [];
      const state = { playerId: player.id, camera: {}, entityList: [player, target],
        entities: new Map([[player.id, player], [target.id, target]]) };
      const page = {
        // A fresh page context catches omitted Node-to-page arguments rather than closing over them.
        evaluate(fn, args) {
          return runInNewContext(`(${fn.toString()})(args)`, {
            args,
            window: { SF: { state, bus: { emit(event, { level }) {
              assert.equal(event, 'camera:zoom');
              requested.push(level);
              state.camera.zoom = Math.min(330, Math.max(45, level));
            } } } },
            setTimeout: (resolve) => resolve(),
            requestAnimationFrame: (resolve) => resolve(),
          });
        },
      };
      const receipt = await frameSubject(page, target.id, framing);
      const label = `${fixture.role}/${framing.name}`;
      assert.deepEqual(requested, [fixture.zooms[index]], `${label}: request must model the camera owner`);
      assert.equal(receipt.cameraZoom, fixture.zooms[index], `${label}: no below-floor overwrite after the bus clamp`);
      assert.equal(receipt.subjectRadius, fixture.placeRadius ?? fixture.radius);
    }
  }
});

test('facility screenshot metadata retains each declared zoom multiplier after JSON serialization', async () => {
  const source = read('scripts/capture-pq019a-acceptance.mjs');
  const { FRAMINGS, FACILITIES } = facilityCaptureSeam();
  const start = source.indexOf('captures.push(await screenshot(page, `${facility.id}-${framing.name}.png`');
  assert.ok(start >= 0, 'the actual facility screenshot call must be exercised');
  const end = source.indexOf('}));', start);
  assert.ok(end > start, 'the actual screenshot metadata must be complete');
  const capture = source.slice(start, end + 4);
  for (const facility of FACILITIES) {
    for (const framing of FRAMINGS) {
      const captures = [];
      await runInNewContext(`(async () => { ${capture} })()`, {
        facility, framing, captures, page: {}, receipt: {},
        SECTOR_ID: 'sector_tethys_junction', CAPTURE_SEED: PQ019A_CAPSULE_PRESENTATION_FIXED_SEED,
        screenshot: async (_page, file, entry) => ({ ...entry, file }),
      });
      const [serialized] = JSON.parse(JSON.stringify(captures));
      assert.equal(serialized.subject, facility.id);
      assert.equal(serialized.framing, framing.name);
      assert.equal(serialized.framingRadii, framing.zoomRadii,
        `${facility.id}/${framing.name}: undefined framing.radii disappears from manifest JSON`);
    }
  }
});
