import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { installDiagnostics } from '../../../src/render/diagnostics.js';
import { hookInstallsOverlay, sceneTruthFrameFromSamples } from '../lib/hook.mjs';
import { repoPath } from '../lib/root.mjs';

test('the scene-truth hook does not draw and does not install an overlay', () => {
  const frame = sceneTruthFrameFromSamples([
    { objectId: 'entity:1', visible: true, packageKey: 'kestrel', lodLevel: 'lod0', renderOrder: 22 },
  ], { tick: 4, seed: 47, zoom: 144, qualityTier: 'medium' });
  assert.equal(frame.overlay, false);
  assert.equal(frame.draws, false);
  assert.equal(frame.gpuFrame, false);
  assert.equal(frame.objectCount, 1);
  assert.equal(hookInstallsOverlay(), false);
  const source = fs.readFileSync(repoPath('tools/scene-truth/lib/hook.mjs'), 'utf8');
  assert.equal(source.includes('document.createElement'), false);
  assert.equal(source.includes('innerHTML'), false);
  const cli = fs.readFileSync(repoPath('tools/scene-truth/cli.mjs'), 'utf8');
  assert.equal(cli.includes('check-visual-regression'), false);
});

test('existing diagnostics expose counters and not object ids', () => {
  const renderer = {
    info: {
      autoReset: true,
      render: { calls: 3, triangles: 9, points: 0, lines: 0 },
      memory: { geometries: 1, textures: 1 },
      programs: [],
      reset() {
        this.render.calls = 0;
      },
    },
  };
  const diag = installDiagnostics(renderer);
  diag.update(0.016);
  const report = diag.getReport();
  assert.equal(Object.prototype.hasOwnProperty.call(report, 'objects'), false);
  assert.equal(typeof report.render.calls, 'number');
  diag.dispose();
});
