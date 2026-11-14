import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { captureReadyFleetLookFrame, inspectFleetLookAuthored } from '../src/render/fleetLook.js';
import { RESIDENCY_HELD } from '../src/render/residencyManager.js';

test('preview only settles published authored or explicit readable fallback boundaries', () => {
  const mesh = { isMesh: true, geometry: {}, material: {} };
  const boundary = { userData: { authoredAssetState: 'authored-prepared' },
    traverse(callback) { callback(this); callback(mesh); } };
  assert.deepEqual(inspectFleetLookAuthored(boundary),
    { ready: false, pending: ['authored-prepared'], failed: [], targetMeshes: 1 });
  boundary.userData.authoredAssetState = 'unavailable';
  assert.deepEqual(inspectFleetLookAuthored(boundary),
    { ready: false, pending: [], failed: ['unavailable'], targetMeshes: 1 });
  boundary.userData.authoredAssetState = 'authored';
  assert.deepEqual(inspectFleetLookAuthored(boundary),
    { ready: true, pending: [], failed: [], targetMeshes: 1 });
});

test('final preview waits for a residency hold on the same root before reading pixels', async () => {
  const mesh = { isMesh: true, geometry: {}, material: {}, name: 'Coils', userData: {}, visible: true };
  const root = { traverse(callback) { callback(this); callback(mesh); } };
  const events = [];
  let draws = 0;
  const result = await captureReadyFleetLookFrame({
    root, isActive: () => true,
    draw() { events.push('draw'); draws++; if (draws === 1) mesh.userData[RESIDENCY_HELD] = true; return { draws }; },
    settle() { events.push('settle'); mesh.userData[RESIDENCY_HELD] = false; return Promise.resolve(); },
    capture() { events.push('capture'); return 'pixels'; },
  });
  assert.deepEqual(events, ['draw', 'settle', 'draw', 'capture']);
  assert.equal(result.url, 'pixels');
  assert.equal(result.drawObservation.draws, 2);
  assert.equal(mesh.visible, true, 'the preview never overrides residency visibility');
});

test('a hold that never clears fails instead of returning a partial picture', async () => {
  const mesh = { name: 'Coils', userData: { [RESIDENCY_HELD]: true }, visible: false };
  const root = { traverse(callback) { callback(this); callback(mesh); } };
  let captured = false;
  await assert.rejects(captureReadyFleetLookFrame({
    root, isActive: () => true, draw: () => ({}), settle: async () => {}, maxAttempts: 2,
    capture() { captured = true; },
  }), /residency-held:Coils/);
  assert.equal(captured, false);
  assert.equal(mesh.visible, false);
});

function actualFleetLookFunction(name) {
  const source = readFileSync(new URL('../scripts/fleet-look.mjs', import.meta.url), 'utf8');
  const start = source.indexOf(`export function ${name}(`);
  assert.ok(start >= 0, `fleet-look must declare ${name}`);
  const end = source.indexOf('\n}\n', start);
  assert.ok(end > start, `fleet-look ${name} declaration must be complete`);
  const declaration = source.slice(start, end + 2).replace('export function ', 'function ');
  return runInNewContext(`(() => { ${declaration}; return ${name}; })()`, { setTimeout, clearTimeout });
}

test('an unresolved shot times out with its stage, preserves a partial report, and unwinds cleanup', async () => {
  const withDeadline = actualFleetLookFunction('withFleetLookShotDeadline');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spaceface-fleet-look-'));
  const finalReportPath = path.join(dir, 'report.json');
  const partialReportPath = path.join(dir, 'report.partial-run-1.json');
  const historicalReport = '{"historicalRun":true}\n';
  writeFileSync(finalReportPath, historicalReport);
  const state = { stage: 'render-place_ceres_section_cradle', expired: false, timeoutError: null };
  let cleanupReached = false;

  try {
    const run = async () => {
      try {
        await withDeadline(() => new Promise(() => {}), {
          timeoutMs: 15,
          name: 'place_ceres_section_cradle',
          view: 'close',
          state,
          onTimeout(error) {
            writeFileSync(partialReportPath, `${JSON.stringify({
              status: 'aborted',
              completed: ['hornet_close.png'],
              pending: [{ name: 'place_ceres_section_cradle', view: 'close' }],
              currentFailure: { code: error.code, shot: error.shot, message: error.message },
            }, null, 2)}\n`);
          },
        });
      } finally {
        cleanupReached = true;
      }
    };

    await assert.rejects(run(), (error) => {
      assert.equal(error.code, 'FLEET_LOOK_SHOT_TIMEOUT');
      assert.equal(error.shot.name, 'place_ceres_section_cradle');
      assert.equal(error.shot.view, 'close');
      assert.equal(error.shot.stage, 'render-place_ceres_section_cradle');
      assert.match(error.message, /place_ceres_section_cradle\/close at render-place_ceres_section_cradle/);
      return true;
    });
    assert.equal(state.expired, true);
    assert.equal(state.timeoutError.code, 'FLEET_LOOK_SHOT_TIMEOUT');
    assert.equal(cleanupReached, true);
    assert.equal(readFileSync(finalReportPath, 'utf8'), historicalReport,
      'the aborted run must not overwrite the previous full report');
    const partial = JSON.parse(readFileSync(partialReportPath, 'utf8'));
    assert.equal(partial.status, 'aborted');
    assert.equal(partial.completed[0], 'hornet_close.png');
    assert.deepEqual(partial.currentFailure.shot, {
      name: 'place_ceres_section_cradle',
      view: 'close',
      stage: 'render-place_ceres_section_cradle',
    });
  } finally {
    try { unlinkSync(partialReportPath); } catch (_) { /* no partial file if the helper failed */ }
    unlinkSync(finalReportPath);
    rmdirSync(dir);
  }
});
