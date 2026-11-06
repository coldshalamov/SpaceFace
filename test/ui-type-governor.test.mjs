// The type governor (src/ui/orrery/typeGovernor.js) applies STATION_STANDARD §2 to every UPPERCASE
// label on the 2D screens: tracking <= .075em at label sizes, normal width instead of poster width,
// and sentence case for running text. These tests pin the rules and the two properties that make the
// governor safe to run on any screen: it only ever narrows type, and it leaves compliant type alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { governType, governTree, installTypeGovernor, TYPE_GOVERNOR } from '../src/ui/orrery/typeGovernor.js';

const label = (over = {}) => ({ fontSize: 12, letterSpacingPx: 0, words: 2, chars: 12, wdth: 100, weight: 650, variation: '', ...over });

test('a 12px label tracked at .24em is brought to the .075em label cap', () => {
  const patch = governType(label({ letterSpacingPx: 12 * 0.24 }));
  assert.equal(patch['letter-spacing'], `${TYPE_GOVERNOR.trackingSmall}em`);
});

test('tracking caps scale with size: labels .075, 18-27px .06, display .04', () => {
  assert.equal(governType(label({ fontSize: 20, letterSpacingPx: 20 * 0.2 }))['letter-spacing'], '0.06em');
  assert.equal(governType(label({ fontSize: 56, letterSpacingPx: 56 * 0.2 }))['letter-spacing'], '0.04em');
});

test('type already inside the standard is left alone', () => {
  assert.equal(governType(label({ letterSpacingPx: 12 * 0.06 })), null);
  assert.equal(governType(label({ fontSize: 56, letterSpacingPx: 56 * 0.02 })), null);
});

test('a poster-width label (wdth 112+) is set at normal width and keeps its weight', () => {
  const patch = governType(label({ wdth: 125, weight: 800, letterSpacingPx: 12 * 0.06 }));
  assert.equal(patch['font-stretch'], '100%');
  assert.match(patch['font-variation-settings'], /"wdth" 100, "wght" 700/); // weight capped at 700 for labels
});

test('wide axes at display sizes are not touched (the screen title keeps its width)', () => {
  assert.equal(governType(label({ fontSize: 56, wdth: 125, letterSpacingPx: 56 * 0.02 })), null);
});

test('running text in capitals becomes sentence case in the reading face, at least 13px', () => {
  const patch = governType(label({ words: 8, chars: 43, letterSpacingPx: 12 * 0.2 }));
  assert.equal(patch['text-transform'], 'none');
  assert.match(patch['font-family'], /Instrument Sans/);
  assert.equal(patch['font-size'], '13px');
  assert.equal(patch['letter-spacing'], '.005em');
});

test('a short label is never turned into a sentence', () => {
  const patch = governType(label({ words: 3, chars: 17, letterSpacingPx: 12 * 0.2 }));
  assert.equal(patch['text-transform'], undefined);
});

test('the governor never widens: every declared tracking is at or below the cap', () => {
  for (const fs of [12, 13, 16, 18, 24, 28, 40, 80]) {
    for (const em of [0.1, 0.14, 0.2, 0.3]) {
      const patch = governType(label({ fontSize: fs, letterSpacingPx: fs * em }));
      assert.ok(patch, `${fs}px at ${em}em must be governed`);
      const declared = parseFloat(patch['letter-spacing']);
      assert.ok(declared <= em, `${fs}px: ${declared}em must not exceed the measured ${em}em`);
    }
  }
});

// A minimal DOM double: just enough surface for governTree (computed style, tree walking, inline style).
function fakeEl({ text, style, tag = 'SPAN', children = [], svg = false }) {
  const inline = new Map();
  const el = {
    nodeType: 1, tagName: tag, namespaceURI: svg ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', dataset: {},
    childNodes: [...(text ? [{ nodeType: 3, nodeValue: text }] : []), ...children], children,
    style: { setProperty: (k, v, p) => inline.set(k, `${v}${p ? ' !' + p : ''}`) }, inline, computed: style,
  };
  return el;
}

test('governTree writes important inline declarations only on measured uppercase text', () => {
  const caps = fakeEl({ text: 'MADE BY', style: { textTransform: 'uppercase', fontSize: '12px', letterSpacing: '3.36px', fontVariationSettings: '"wdth" 125, "wght" 900', fontStretch: '125%', fontWeight: '900' } });
  const plain = fakeEl({ text: 'Archivo', style: { textTransform: 'none', fontSize: '16px', letterSpacing: '0px', fontVariationSettings: 'normal', fontStretch: '100%', fontWeight: '500' } });
  const glyph = fakeEl({ text: 'MASS', tag: 'text', svg: true, style: { textTransform: 'uppercase', fontSize: '12px', letterSpacing: '4px', fontVariationSettings: 'normal', fontStretch: '100%', fontWeight: '650' } });
  const root = fakeEl({ tag: 'DIV', children: [caps, plain, glyph] });
  const all = [root, caps, plain, glyph];
  root.ownerDocument = { createTreeWalker: (start, _what, filter) => {
    const list = all.slice(all.indexOf(start) + 1).filter((n) => filter.acceptNode(n) === 1);
    let i = -1; return { nextNode: () => list[++i] || null };
  } };
  const win = { getComputedStyle: (el) => el.computed || { textTransform: 'none', fontSize: '16px', letterSpacing: '0px', fontVariationSettings: 'normal', fontStretch: '100%', fontWeight: '400' } };
  const changed = governTree(root, win);
  assert.equal(changed, 1);
  assert.match(caps.inline.get('letter-spacing'), /^0\.075em !important$/);
  assert.equal(plain.inline.size, 0, 'mixed-case text is not touched');
  assert.equal(glyph.inline.size, 0, 'SVG text is not touched');
  // idempotent: a second pass over the same tree finds nothing left to do
  assert.equal(governTree(root, win), 0);
});

test('installTypeGovernor is a no-op without a document or MutationObserver', () => {
  assert.doesNotThrow(() => installTypeGovernor(null));
  assert.doesNotThrow(() => installTypeGovernor({ defaultView: {} }));
});
