import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createStageHullStatus } from '../src/ui/screens/stageHullStatus.js';

test('an authored first draw, not a timer, makes the selected ship ready', () => {
  const updates = [];
  const status = createStageHullStatus(value => updates.push(value));
  status.select('ship_kestrel');
  assert.equal(status.drawn('ship_kestrel', 'procedural-fallback'), false);
  status.waiting();
  assert.equal(status.snapshot().phase, 'waiting');
  assert.equal(status.drawn('ship_kestrel', 'authored'), true);
  assert.equal(status.snapshot().phase, 'ready');
  assert.equal(updates.length, 3);
});
test('an asset swap from a previous save cannot mark the new selection ready', () => {
  const status = createStageHullStatus(() => {});
  status.select('ship_kestrel');
  status.select('ship_tug');
  assert.equal(status.drawn('ship_kestrel', 'authored'), false);
  assert.equal(status.snapshot().phase, 'loading');
  status.drawn('ship_tug', 'authored');
  assert.equal(status.snapshot().phase, 'ready');
  status.waiting();
  status.unavailable();
  assert.equal(status.snapshot().phase, 'ready');
});
test('disposing a screen rejects delayed asset callbacks', () => {
  const updates = [];
  const status = createStageHullStatus(value => updates.push(value));
  status.select('ship_kestrel');
  status.dispose();
  status.drawn('ship_kestrel', 'authored');
  status.select('ship_other');
  status.waiting();
  status.unavailable();
  assert.equal(updates.length, 1);
});
test('failed previews remain unready without disabling launch or load', () => {
  const status = createStageHullStatus(() => {});
  status.select('ship_kestrel'); status.unavailable();
  assert.equal(status.snapshot().phase, 'unavailable');
  assert.equal(status.drawn('ship_kestrel', 'authored'), true);
});
test('turntable does not start the preview renderer continuous frame loop for reduced motion', () => {
  const source = readFileSync(new URL('../src/ui/screens/stageHull.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bmount\.frame\(\);/);
  assert.match(source, /DRAW_INTERVAL_MS = 1000 \/ 30/);
  assert.match(source, /listeners\.abort\(\)/);
  assert.match(source, /document\.hidden/);
});
