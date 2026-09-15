import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { speedGaugeMarkup, setKitGauge } from '../src/ui/views/flightInstruments.js';
import { formatSpeedFigure, velocityRailModel, SPEED_FIGURES } from '../src/ui/views/velocityRail.js';
import { mountVelocityRailStyles, VELOCITY_RAIL_CSS } from '../src/ui/views/velocityRailStyles.js';

// A tiny instrument DOM: tracks writes and queries rather than mocking browser layout.
function instrument(sample = '0') {
  const stats = { writes: 0, queries: 0, attrReads: 0, styleWrites: 0, textWrites: 0 };
  const node = () => {
    const attrs = new Map(), listeners = new Map(), events = []; let content = '';
    return {
      listeners, events,
      ownerDocument: { defaultView: { MouseEvent: class { constructor(type) { this.type = type; } } } },
      addEventListener(type, fn) { assert.ok(!listeners.has(type), 'listeners are mounted once'); listeners.set(type, fn); },
      dispatchEvent(event) { events.push(event.type); },
      get textContent() { return content; },
      set textContent(v) { content = String(v); stats.writes++; stats.textWrites++; },
      style: new Proxy({}, { set(o, k, v) { stats.writes++; stats.styleWrites++; o[k] = v; return true; } }),
      getAttribute: k => { stats.attrReads++; return attrs.get(k) ?? null; },
      hasAttribute: k => attrs.has(k),
      setAttribute(k, v) { stats.writes++; attrs.set(k, String(v)); },
      removeAttribute(k) { stats.writes++; attrs.delete(k); },
    };
  };
  const root = node(), source = node(), digits = node(), reference = node(), extent = node();
  const fill = node(), cursor = node(), glyphs = Array.from({ length: 5 }, node);
  const selectors = { '[data-k="speed"]': source, '.sf-speed__digits': digits,
    '.sf-speed__reference b': reference, '.sf-speed__extent': extent,
    '.sf-speed__fill': fill, '.sf-speed__cursor': cursor };
  root.querySelector = k => { stats.queries++; return selectors[k] ?? null; };
  root.querySelectorAll = k => { stats.queries++; assert.equal(k, '.sf-speed__digits path'); return glyphs; };
  source.textContent = sample;
  return { root, source, digits, glyphs, reference, extent, fill, cursor, stats };
}
const visiblePaths = i => i.glyphs.filter(g => g.getAttribute('display') !== 'none').map(g => g.getAttribute('d'));

test('default-route factory retains speed and tooltip owners and mounts the new instrument', () => {
  const html = speedGaugeMarkup();
  assert.match(html, /class="sf-kit-gauge sf-speed sf-stat--info"/);
  assert.equal((html.match(/data-k="speed"/g) || []).length, 1);
  assert.match(html, /data-tip="speed"/);
  assert.match(html, /role="meter"/);
  assert.doesNotMatch(html, /sf-kit-gauge__(?:needle|arc|face)|<canvas|<img|aria-live/);
});

for (const [value, expected] of [[0, '0'], [-10, '0'], [248.4, '248'], [248.5, '249'],
  [9999, '9999'], [10000, '10.0k'], [99949, '99.9k'], [99950, '100k'],
  [999499, '999k'], [999500, '1.0M'], [999500000, '1.0G'], [1e12, '999G+'],
  [NaN, '—'], [Infinity, '—'], [-Infinity, '—']]) {
  test(`number formatting: ${String(value)} -> ${expected}`, () => assert.equal(formatSpeedFigure(value), expected));
}

test('every compact boundary fits five authored glyphs, including rounding carry', () => {
  for (const scale of [1e3, 1e6, 1e9]) for (const boundary of [9.95, 10, 99.95, 100, 999.5]) {
    for (const delta of [-1, 0, 1]) {
      const label = formatSpeedFigure(scale * boundary + delta);
      assert.ok(label.length <= 5, label);
      for (const char of label) assert.ok(SPEED_FIGURES[char], `Missing glyph ${char}`);
    }
  }
});

test('reference bounds only the rail; above-reference speed is never clamped', () => {
  const m = velocityRailModel(672, 400);
  assert.equal(m.speed, 672); assert.equal(m.fraction, 1); assert.equal(m.aboveReference, true);
  assert.equal(velocityRailModel(-12, 400).fraction, 0);
  assert.ok(Math.abs(velocityRailModel(248, 400).fraction - .62) <= 1 / 512);
});

test('nonfinite speed is unavailable and a missing reference does not invent a range', () => {
  assert.equal(velocityRailModel(Infinity, 400).available, false);
  for (const ref of [undefined, null, 0, -1, NaN, Infinity, '400']) {
    const m = velocityRailModel(248, ref);
    assert.equal(m.hasReference, false); assert.equal(m.fraction, 0);
  }
});

test('existing 10 Hz text owner is untouched; figures follow its sample on the next frame', () => {
  const i = instrument('248'); setKitGauge(i.root, 248.8, 400);
  assert.equal(i.source.textContent, '248');
  assert.deepEqual(visiblePaths(i), [...'248'].map(c => SPEED_FIGURES[c]));
  setKitGauge(i.root, 249.2, 400); // Analog motion must not create a second numeric writer.
  assert.equal(i.root.getAttribute('aria-valuenow'), '248');
  i.source.textContent = '249'; setKitGauge(i.root, 249.2, 400);
  assert.deepEqual(visiblePaths(i), [...'249'].map(c => SPEED_FIGURES[c]));
});

test('state word, figures and accessibility share one sample at the reference crossing', () => {
  const i = instrument('399'); setKitGauge(i.root, 402, 400);
  assert.equal(i.root.getAttribute('data-over-reference'), 'false');
  assert.doesNotMatch(i.root.getAttribute('aria-valuetext'), /above/);
  i.source.textContent = '402'; setKitGauge(i.root, 402, 400);
  assert.equal(i.extent.textContent, 'ABOVE REF');
  assert.match(i.root.getAttribute('aria-valuetext'), /above reference, not a speed limit/);
});

test('same candidate: 10,000 unchanged updates cause zero DOM writes or selector queries', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  const before = { ...i.stats };
  for (let n = 0; n < 10000; n++) setKitGauge(i.root, 248, 400);
  assert.deepEqual(i.stats, before);
});

test('reference changes repaint even at constant speed; meter remains internally valid', () => {
  const i = instrument('672'); setKitGauge(i.root, 672, 400);
  assert.equal(i.root.getAttribute('aria-valuenow'), '672');
  assert.equal(i.root.getAttribute('aria-valuemax'), '672');
  setKitGauge(i.root, 672, 1000);
  assert.equal(i.reference.textContent, '1000'); assert.equal(i.extent.textContent, 'REFERENCE');
  assert.equal(i.root.getAttribute('aria-valuemax'), '1000');
  assert.notEqual(i.fill.style.transform, 'scaleX(1)');
});

test('unavailable state removes stale ARIA bounds and recovers without remounting', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  setKitGauge(i.root, NaN, 400);
  assert.equal(i.root.getAttribute('role'), 'group');
  assert.equal(i.root.getAttribute('aria-valuenow'), null);
  assert.deepEqual(visiblePaths(i), [SPEED_FIGURES['—']]);
  setKitGauge(i.root, 248, NaN);
  assert.equal(i.root.getAttribute('role'), 'meter');
  assert.equal(i.root.getAttribute('data-has-reference'), 'false');
  assert.equal(i.extent.textContent, 'NO REFERENCE');
  setKitGauge(i.root, 248, 400);
  assert.equal(i.root.getAttribute('data-has-reference'), 'true');
});

test('newly mounted gauges have independent caches; shrinking readings hide surplus slots', () => {
  const a = instrument('1426'), b = instrument('9');
  setKitGauge(a.root, 1426, 2200); setKitGauge(b.root, 9, 80);
  assert.equal(visiblePaths(a).length, 4); assert.equal(visiblePaths(b).length, 1);
  a.source.textContent = '0'; setKitGauge(a.root, 0, 2200);
  assert.deepEqual(visiblePaths(a), [SPEED_FIGURES['0']]);
  assert.equal(b.root.getAttribute('aria-valuenow'), '9');
  assert.doesNotThrow(() => setKitGauge(null, 1, 10));
});

test('empty or nonnumeric text samples do not masquerade as a stopped ship', () => {
  for (const sample of ['', 'bad', 'Infinity']) {
    const i = instrument(sample); setKitGauge(i.root, 123, 400);
    assert.equal(i.root.getAttribute('data-available'), 'false');
    assert.deepEqual(visiblePaths(i), [SPEED_FIGURES['—']]);
  }
});

test('one stylesheet per document, with safe server-side import and production asset path', () => {
  const children = [], doc = { head: { appendChild: e => children.push(e) },
    getElementById: id => children.find(e => e.id === id), createElement: () => ({}) };
  mountVelocityRailStyles(doc); mountVelocityRailStyles(doc);
  assert.equal(children.length, 1); assert.equal(children[0].textContent, VELOCITY_RAIL_CSS);
  assert.doesNotThrow(() => mountVelocityRailStyles(null));
  const asset = 'assets/ui/kit/assets/svg/velocity-rail-shell.svg';
  assert.ok(VELOCITY_RAIL_CSS.includes(`url("${asset}")`));
  assert.ok(existsSync(new URL('../' + asset, import.meta.url)));
});

test('view owns no timer, layout read, network fetch or GPU/filter pass', () => {
  const source = readFileSync(new URL('../src/ui/views/velocityRail.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /requestAnimationFrame\s*\(|set(?:Timeout|Interval)\s*\(|new MutationObserver|getBoundingClientRect\s*\(|fetch\s*\(/);
  assert.doesNotMatch(VELOCITY_RAIL_CSS, /backdrop-filter\s*:|filter\s*:|will-change\s*:|animation\s*:/);
  assert.match(VELOCITY_RAIL_CSS, /prefers-reduced-motion/);
  assert.match(VELOCITY_RAIL_CSS, /html\.sf-reduce-motion/);
  assert.match(VELOCITY_RAIL_CSS, /forced-colors/);
});


test('10,000 changing analog samples touch only transforms, not attributes, text or selectors', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  const before = { ...i.stats };
  // A changing velocity with the same authoritative 10 Hz numeric sample is the costly path
  // missed by unchanged-value benchmarks. Do not allow formatting/ARIA reads back onto this path.
  for (let n = 0; n < 10000; n++) setKitGauge(i.root, 20 + (n % 350), 400);
  assert.equal(i.stats.queries, before.queries);
  assert.equal(i.stats.attrReads, before.attrReads);
  assert.equal(i.stats.textWrites, before.textWrites);
  assert.equal(i.stats.writes - before.writes, i.stats.styleWrites - before.styleWrites);
  assert.ok(i.stats.styleWrites - before.styleWrites <= 20000);
});

test('subpixel telemetry inside the same rail quantum produces no writes', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  const before = { ...i.stats };
  for (let n = 0; n < 1000; n++) setKitGauge(i.root, 248 + n * 1e-8, 400);
  assert.deepEqual(i.stats, before);
});

test('analog reversals reach the new position immediately, with no chase easing', () => {
  const i = instrument('100'); setKitGauge(i.root, 400, 400);
  setKitGauge(i.root, 0, 400);
  assert.equal(i.fill.style.transform, 'scaleX(0)');
  assert.equal(i.cursor.style.transform, 'translateX(0.000%)');
  assert.doesNotMatch(VELOCITY_RAIL_CSS, /transition:\s*transform/);
});

test('loss of speed signal says NO SIGNAL instead of pretending the reference is the issue', () => {
  const i = instrument('672'); setKitGauge(i.root, 672, 400);
  setKitGauge(i.root, NaN, 400);
  assert.equal(i.extent.textContent, 'NO SIGNAL');
  assert.equal(i.reference.textContent, '400');
  assert.equal(i.root.getAttribute('data-over-reference'), 'false');
  assert.equal(i.root.getAttribute('data-available'), 'false');
  assert.equal(i.root.getAttribute('aria-valuenow'), null);
  setKitGauge(i.root, 672, 400);
  assert.equal(i.extent.textContent, 'ABOVE REF');
});

test('compact visual notation preserves the exact accessible speed and meter bounds', () => {
  const i = instrument('12345'); setKitGauge(i.root, 12345, 400);
  assert.deepEqual(visiblePaths(i), [...'12.3k'].map(c => SPEED_FIGURES[c]));
  assert.equal(i.root.getAttribute('aria-valuenow'), '12345');
  assert.equal(i.root.getAttribute('aria-valuemax'), '12345');
  assert.match(i.root.getAttribute('aria-valuetext'), /^12345 world units per second/);
});

test('keyboard inspection uses a unique described tooltip; the instrument is not a live region', () => {
  const a = speedGaugeMarkup(), b = speedGaugeMarkup();
  assert.match(a, /tabindex="0"/);
  const idA = /aria-describedby="([^"]+)"/.exec(a)[1];
  const idB = /aria-describedby="([^"]+)"/.exec(b)[1];
  assert.notEqual(idA, idB);
  assert.ok(a.includes(`id="${idA}" data-tip="speed"`));
  assert.match(VELOCITY_RAIL_CSS, /:focus-visible \.sf-tip\s*\{\s*display:block/);
  assert.match(VELOCITY_RAIL_CSS, /:focus-visible\s*\{\s*outline:2px/);
  assert.doesNotMatch(a, /aria-live/);
});

test('foregrounds have measured contrast on the brightest area of their carrier', () => {
  function luminance(hex) {
    const c = hex.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255)
      .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  }
  const ratio = (a, b) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  };
  const token = name => new RegExp(`--sv-${name}:(#[0-9a-f]{6})`).exec(VELOCITY_RAIL_CSS)[1];
  assert.ok(ratio(token('ink'), '#101c27') >= 7, 'primary numerals');
  assert.ok(ratio(token('muted'), '#22303f') >= 7, '12px labels');
  assert.ok(ratio(token('signal'), '#080e12') >= 7, 'active rail');
  assert.ok(ratio(token('track'), '#080e12') >= 3, 'inactive rail geometry');
});

test('reference removal and restoration at constant speed do not leave stale scale claims', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  setKitGauge(i.root, 248, undefined);
  assert.equal(i.reference.textContent, '—'); assert.equal(i.extent.textContent, 'NO REFERENCE');
  assert.equal(i.root.getAttribute('data-has-reference'), 'false');
  assert.equal(i.fill.style.transform, 'scaleX(0)');
  setKitGauge(i.root, 248, 800);
  assert.equal(i.reference.textContent, '800'); assert.equal(i.extent.textContent, 'REFERENCE');
  assert.equal(i.root.getAttribute('aria-valuenow'), '248');
});


test('focus requests fresh braking detail from the existing host owner, with one listener', () => {
  const i = instrument('248'); setKitGauge(i.root, 248, 400);
  for (let n = 0; n < 100; n++) setKitGauge(i.root, 248 + n, 400);
  assert.equal(i.root.listeners.size, 1);
  i.root.listeners.get('focus')({ currentTarget: i.root });
  assert.deepEqual(i.root.events, ['mouseenter']);
});

test('component skin is protected from the generic live HUD gauge selector', () => {
  assert.match(VELOCITY_RAIL_CSS, /#hud \.sf-kit-gauge\.sf-speed\s*\{/);
  assert.match(VELOCITY_RAIL_CSS, /html\.sf-high-contrast #hud \.sf-kit-gauge\.sf-speed/);
  assert.match(VELOCITY_RAIL_CSS, /overflow-wrap:anywhere/);
});
