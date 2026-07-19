import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_POST_PRESENTATION,
  resolvePostPresentation,
} from '../src/render/bloom.js';

const backgroundSource = readFileSync(new URL('../src/render/spaceBackground.js', import.meta.url), 'utf8');

test('bloom defaults to selective light spill without a full-screen style overlay', () => {
  assert.deepEqual(DEFAULT_POST_PRESENTATION, { grain: 0, vignette: 0, grade: 0 });
  assert.deepEqual(resolvePostPresentation({ bloomStrength: 1 }), DEFAULT_POST_PRESENTATION,
    'bloom strength must not implicitly color-grade, vignette, or grain the whole frame');
});

test('optional post presentation is explicit and independently clamped', () => {
  assert.deepEqual(resolvePostPresentation({ grain: 2, vignette: -1, grade: 0.2 }), {
    grain: 1,
    vignette: 0,
    grade: 0.2,
  });
});

test('the base space field does not bake fake galaxies or hash-speckle behind real stars', () => {
  assert.doesNotMatch(backgroundSource, /Micro-stars: hash speckle/);
  assert.doesNotMatch(backgroundSource, /A few distant galaxies/);
  assert.doesNotMatch(backgroundSource, /float bandMask/);
  assert.doesNotMatch(backgroundSource, /float breath/,
    'the opaque void must not turn low-frequency noise into a full-screen blue fabric');
});
