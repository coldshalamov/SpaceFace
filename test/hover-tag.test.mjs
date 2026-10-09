import assert from 'node:assert/strict';
import test from 'node:test';

import { placeHoverTag } from '../src/ui/orrery/hoverTag.js';

function stubTag(w, h, text = 'Rock') {
  return { hidden: true, style: {}, textContent: text, offsetWidth: w, offsetHeight: h };
}

// Placement rides a translate3d composed with the stylesheet centering (see placeHoverTag):
// parse the px point out of the transform — the box lands exactly where the old left/top
// writes put it, without a per-tick layout invalidation.
function tagPos(el) {
  const m = /translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\)/.exec(el.style.transform || '');
  return m ? { px: parseFloat(m[1]), py: parseFloat(m[2]) } : { px: NaN, py: NaN };
}

test('an initially hidden tag is made visible before it is measured and placed', () => {
  const el = stubTag(120, 40);
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.hidden, false, 'measurement cannot run on a hidden element');
  assert.match(el.style.transform, /translate3d\(500px,300px,0\)/);
});

test('placement clamps inside the viewport at every corner', () => {
  const el = stubTag(200, 60, 'A Very Long Object Name That Will Not Fit');
  const vw = 1000, vh = 800;
  const spots = [[2, 2], [vw - 2, 2], [2, vh - 2], [vw - 2, vh - 2], [vw / 2, vh / 2]];
  for (const [x, y] of spots) {
    el.hidden = true;
    el.__woiSize = null;
    placeHoverTag(el, x, y, vw, vh);
    const { px, py } = tagPos(el);
    const halfW = Math.min(el.__woiSize.w, vw - 24) / 2;
    assert.ok(px - halfW >= 0 && px + halfW <= vw, `x=${x}: clamped inside, got px=${px}`);
    assert.ok(py - (el.__woiSize.h + 14) >= -1 && py <= vh, `y=${y}: clamped inside, got py=${py}`);
  }
});

test('a long name caps width to the viewport minus margins', () => {
  const el = stubTag(1600, 40, 'An Extremely Long Proper Noun Ship Name Beyond Any Reason');
  placeHoverTag(el, 500, 300, 1000, 800);
  assert.equal(el.style.maxWidth, '976px', 'the tag never runs past the viewport edge');
  const { px } = tagPos(el);
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

import { hoverTagVitals } from '../src/ui/orrery/hoverTag.js';

test('vitals report only the layers a body actually has, clamped to 0..1', () => {
  assert.equal(hoverTagVitals(null), null);
  assert.equal(hoverTagVitals({ type: 'asteroid' }), null, 'a rock carries no hull stat');
  const v = hoverTagVitals({ hull: 30, hullMax: 60, shield: 90, shieldMax: 60, armorHp: 0, armorMax: 0 });
  assert.deepEqual(v, { shield: 1, armor: null, hull: 0.5 });
});
