import assert from 'node:assert/strict';
import test from 'node:test';

import { placeHoverTag } from '../src/ui/orrery/hoverTag.js';

function stubTag(w, h, text = 'Rock') {
  return { hidden: true, style: {}, textContent: text, offsetWidth: w, offsetHeight: h };
}

test('an initially hidden tag is made visible before it is measured and placed', () => {
  const el = stubTag(120, 40);
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.hidden, false, 'measurement cannot run on a hidden element');
  assert.equal(el.style.left, '500px');
  assert.equal(el.style.top, '300px');
});

test('placement clamps inside the viewport at every corner', () => {
  const el = stubTag(200, 60, 'A Very Long Object Name That Will Not Fit');
  const vw = 1000, vh = 800;
  const spots = [[2, 2], [vw - 2, 2], [2, vh - 2], [vw - 2, vh - 2], [vw / 2, vh / 2]];
  for (const [x, y] of spots) {
    el.hidden = true;
    el.__woiSize = null;
    placeHoverTag(el, x, y, vw, vh);
    const px = parseFloat(el.style.left);
    const py = parseFloat(el.style.top);
    const halfW = Math.min(el.__woiSize.w, vw - 24) / 2;
    assert.ok(px - halfW >= 0 && px + halfW <= vw, `x=${x}: clamped inside, got left=${px}`);
    assert.ok(py - (el.__woiSize.h + 14) >= -1 && py <= vh, `y=${y}: clamped inside, got top=${py}`);
  }
});

test('a long name caps width to the viewport minus margins', () => {
  const el = stubTag(1600, 40, 'An Extremely Long Proper Noun Ship Name Beyond Any Reason');
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.style.maxWidth, '976px', 'the tag never runs past the viewport edge');
  const px = parseFloat(el.style.left);
  assert.ok(px + 488 <= 1000, 'right edge stays inside');
});

test('measured size is cached until text or viewport changes', () => {
  const el = stubTag(100, 40);
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 100);
  el.offsetWidth = 400;
  placeHoverTag(el, 510, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 100, 'same text + viewport skips the layout read');
  el.textContent = 'Different Subject Name';
  placeHoverTag(el, 510, 300, 1000, 800);
  assert.equal(el.__woiSize.w, 400, 'new text re-measures');
});
