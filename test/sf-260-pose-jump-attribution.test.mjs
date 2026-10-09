// SF-260 — D60 pose-jump attribution, retired on the instrumented seam.
// The renderer stamps state.render.poseJump only when an applied pose moved a root
// by at least POSE_JUMP_WU. A delta inside the envelope is not a defect; a jump with
// a matching-distance writer attributes to that writer; a jump with no writer stays
// honestly 'not-reproduced' — instrumentation, never a silent second fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  attributePoseJump,
  POSE_JUMP_WU,
} from '../src/render/pipelineAutoFlushPolicy.js';

test('pose deltas inside the envelope are not jumps', () => {
  for (const [dx, dz] of [[0, 0], [12, -4], [POSE_JUMP_WU - 1, 0], [0, -POSE_JUMP_WU + 100]]) {
    const verdict = attributePoseJump({ dx, dz });
    assert.equal(verdict.jumped, false, `${dx},${dz}`);
    assert.equal(verdict.reason, 'within-envelope');
  }
});

test('a jump with a matching-distance writer attributes by name', () => {
  const verdict = attributePoseJump({
    dx: POSE_JUMP_WU, dz: 0,
    writers: { 'sector-portal': { dx: POSE_JUMP_WU + 0.5, dz: 0 }, 'knockback': { dx: 40, dz: 0 } },
  });
  assert.equal(verdict.jumped, true);
  assert.equal(verdict.attributed, true);
  assert.equal(verdict.writer, 'sector-portal');
  assert.equal(verdict.reason, 'writer');
});

test('a jump with no matching writer stays not reproduced — the honest close', () => {
  for (const writers of [null, {}, { knockback: { dx: 10, dz: 0 }, portal: { dx: 0, dz: 0 } }]) {
    const verdict = attributePoseJump({ dx: POSE_JUMP_WU * 2, dz: 0, writers });
    assert.equal(verdict.jumped, true);
    assert.equal(verdict.attributed, false);
    assert.equal(verdict.reason, 'not-reproduced');
    assert.equal(verdict.writer, undefined);
  }
});

test('the renderer stamps the verdict only on an applied >= envelope pose move', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /attributePoseJump\(\{ dx: poseDx, dz: poseDz \}\)/);
  assert.match(source, /poseDx \* poseDx \+ poseDz \* poseDz >= POSE_JUMP_WU \* POSE_JUMP_WU/);
  assert.match(source, /state\.render\.poseJump = attributePoseJump/,
    'the verdict lands on state.render for the hitch-attribution surface');
});
