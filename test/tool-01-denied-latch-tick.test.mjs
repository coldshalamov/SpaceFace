// TOOL-01 catalog line proof: a denied Massline latch plays the promoted Kenney tick
// (assets/audio/massline/massline_deny.wav), while a successful latch keeps its own id.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';
import { minimalActionAudioSpec } from '../src/audio/minimalActionAudio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('TOOL-01: the denied-latch cue resolves to the promoted tick sample', () => {
  const spec = minimalActionAudioSpec('latchDenied');
  assert.equal(spec.sourceEvent, 'tether:latchDenied');
  assert.equal(spec.recipeId, 'sfx_massline_deny');

  const binding = resolveSampleBinding(spec.recipeId);
  assert.ok(binding, 'sfx_massline_deny must be sample-bound');
  assert.equal(binding.sampleId, 'massline_deny');
  assert.ok(binding.file.endsWith('assets/audio/massline/massline_deny.wav'));
  assert.ok(existsSync(path.join(ROOT, binding.file)), 'promoted tick file must exist');
});

test('TOOL-01: a successful latch still plays a different id', () => {
  const deny = resolveSampleBinding('sfx_massline_deny');
  const latch = resolveSampleBinding('sfx.tetherLatch');
  assert.ok(latch, 'sfx.tetherLatch must stay sample-bound');
  assert.notEqual(deny.sampleId, latch.sampleId);
});
