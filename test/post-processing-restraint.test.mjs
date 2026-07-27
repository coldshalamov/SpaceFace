import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_POST_PRESENTATION,
  resolvePostPresentation,
} from '../src/render/bloom.js';

// WHAT THIS FILE PROTECTS, AND WHAT IT DELIBERATELY NO LONGER PROTECTS
// -------------------------------------------------------------------
// Retained: the CLAMPING CONTRACT. `bloomStrength` is a selective, additive light-spill control.
// It must never implicitly reach the full-screen presentation channels (grade / vignette / grain).
// That is a real resolver invariant: those three are separate authored knobs owned by
// src/render/post/spaceRenderGraph.js and by settings, and a bloom slider that silently graded the
// whole frame would make every brightness change also a colour change, which is unreviewable.
//
// Withdrawn 2026-07-27 (grammar §9.2.1, build plan §2.5 item 2): this file used to assert that the
// background shader SOURCE did not contain four literal strings ("Micro-stars: hash speckle",
// "A few distant galaxies", "float bandMask", "float breath"). Two of the four matched COMMENTS,
// not code. No observed play failure was ever cited for any of them, they were defeatable by
// renaming a variable, and they banned a whole category of visual work by string match — the exact
// pattern CANONICAL_BUILD_MAP.md:164 and docs/POLICY_MANIFEST.md:44-58 forbid. Deleted.
//
// Also withdrawn: pinning DEFAULT_POST_PRESENTATION to exactly {0,0,0}. Whether the shipped default
// grade/vignette/grain is zero is a SETTINGS DEFAULT and a matter of taste; it belongs in the
// settings layer where a designer can move it, not in a test that fails the build. The invariant
// below is expressed against DEFAULT_POST_PRESENTATION itself, so it keeps holding whatever the
// authored defaults become.

test('bloom strength never implicitly grades, vignettes, or grains the whole frame', () => {
  // Every channel is a number in [0,1] — the resolver must produce a usable presentation record.
  for (const key of ['grain', 'vignette', 'grade']) {
    const value = DEFAULT_POST_PRESENTATION[key];
    assert.equal(typeof value, 'number', `${key} must resolve to a number`);
    assert.ok(value >= 0 && value <= 1, `${key} must resolve inside [0,1]`);
  }

  // The clamping contract: bloom controls do not leak into the full-screen presentation channels.
  for (const bloomStrength of [0, 0.35, 1, 2.5]) {
    assert.deepEqual(
      resolvePostPresentation({ bloomStrength }),
      DEFAULT_POST_PRESENTATION,
      `bloomStrength ${bloomStrength} must not implicitly color-grade, vignette, or grain the frame`,
    );
  }
  for (const bloom of [true, false]) {
    assert.deepEqual(resolvePostPresentation({ bloom }), DEFAULT_POST_PRESENTATION,
      'toggling bloom must not implicitly change full-screen presentation');
  }
});

test('optional post presentation is explicit and independently clamped', () => {
  assert.deepEqual(resolvePostPresentation({ grain: 2, vignette: -1, grade: 0.2 }), {
    grain: 1,
    vignette: 0,
    grade: 0.2,
  });
});
