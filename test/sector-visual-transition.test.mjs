import assert from 'node:assert/strict';
import {
  easeSectorTransition,
  interpolateSectorPost,
  SECTOR_VISUAL_TRANSITION_SECONDS,
  snapshotSectorPost,
} from '../src/render/sectorVisualTransition.js';

assert.equal(SECTOR_VISUAL_TRANSITION_SECONDS, 1.5);
assert.equal(easeSectorTransition(0), 0);
assert.equal(easeSectorTransition(1), 1);
assert.ok(easeSectorTransition(0.5) > 0.45 && easeSectorTransition(0.5) < 0.55);

const start = snapshotSectorPost({ exposure: 0.96, bloomStrengthScale: 1.0, bloomThresholdBias: 0 });
const target = snapshotSectorPost({ exposure: 0.84, bloomStrengthScale: 1.25, bloomThresholdBias: -0.08 });
const frame = {};
interpolateSectorPost(start, target, 0.5, frame);
assert.ok(frame.exposure < start.exposure && frame.exposure > target.exposure);
assert.ok(frame.bloomStrengthScale > start.bloomStrengthScale);
assert.ok(frame.bloomThresholdBias < start.bloomThresholdBias);

const end = interpolateSectorPost(start, target, 1, {});
assert.deepEqual(end, target, 'the presentation seam must land exactly on the authored target');

console.log('sector visual transition: OK');
