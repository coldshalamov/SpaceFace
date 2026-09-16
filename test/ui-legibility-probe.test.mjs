// The rendered-pixel legibility probe (scripts/lib/ui-legibility.mjs) is the only pass in
// check:ui:layout that looks at pixels rather than geometry. Its two failure modes are silent:
// a false positive calls black-on-black text unreadable, and a false negative lets light words on
// a lit hull through. This pins both, plus the display-type case that first measured 1.86:1 on a
// bone word over a black panel (a whole tile was glyph, and a plain median read the glyph as the
// ground).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { legibilityFindings, legibilityFloor } from '../scripts/lib/ui-legibility.mjs';

const BONE = [234, 230, 223];

/** Paint a strip: `background` fill, then vertical glyph bars in `ink`. */
function strip({ width = 240, height = 40, background, ink, glyphColumns = 6, glyphWidth = 4, fill = false }) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = fill || (x % 40 < glyphWidth && x < glyphColumns * 40);
      const [r, g, b] = on ? ink : background;
      const i = (width * y + x) << 2;
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

const candidate = (overrides = {}) => ({
  label: 'p.k-sentence', text: 'Bone words', x: 0, y: 0, w: 240, h: 40,
  color: BONE, alpha: 1, size: 16, weight: 400, ...overrides,
});

test('bone text on the pause bulkhead is read as legible, not as a black-on-black failure', () => {
  const png = strip({ background: [12, 10, 8], ink: BONE });
  assert.deepEqual(legibilityFindings(png, [candidate()]), []);
});

test('the same words over a lit ground are flagged with a ratio and a floor', () => {
  const png = strip({ background: [186, 180, 168], ink: BONE });
  const findings = legibilityFindings(png, [candidate()]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'text-against-render');
  assert.match(findings[0].detail, /:1 against the drawn ground \(floor 4\.5\)/);
});

test('display type that fills its own tile is not measured against its own glyphs', () => {
  // A tile that is almost all glyph has no ground to judge: it must be skipped, not scored 1:1.
  const png = strip({ width: 240, height: 60, background: [12, 10, 8], ink: BONE, fill: true });
  assert.deepEqual(legibilityFindings(png, [candidate({ w: 240, h: 60, size: 42, weight: 900 })]), []);
});

test('the floor follows WCAG text size: 3:1 large, 4.5:1 body', () => {
  assert.equal(legibilityFloor(candidate({ size: 42, weight: 900 })), 3);
  assert.equal(legibilityFloor(candidate({ size: 16, weight: 400 })), 4.5);
});
