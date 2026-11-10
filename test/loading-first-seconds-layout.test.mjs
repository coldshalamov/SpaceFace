// Two layout costs the 2026-10-13 launch profile found, pinned where they were removed.
//
// D2: the objective-edge arrow caches its plate boxes and refills them only on resize, but the first visible HUD
//     frame refilled them AFTER its own marker text/class writes, so the getBoundingClientRect reads forced a
//     layout of everything just written (128 ms inside the first seconds of flight). frame() must refill a stale
//     cache before its first HUD write.
// D6: the 60 s emblem rotation lived inside the boot-ring SVG, so the whole SVG took part in per-frame style work for
//     as long as loading lasted. The emblem is an HTML <img> on its own compositor layer ahead of the SVG, and the
//     overlay contains layout and paint.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('D2: the HUD frame refills a stale obstacle cache before its first write', () => {
  const hud = read('src/ui/hud.js');
  const start = hud.indexOf('\n  function frame(dt) {');
  assert.ok(start > 0, 'hud.js still has frame(dt)');
  const body = hud.slice(start, start + 6000);
  const refill = body.indexOf('if (objectiveEdgeBoxes.stale) objectiveEdgeObstacles();');
  assert.ok(refill > 0, 'the stale-cache refill is at the top of frame()');
  const firstWrite = body.search(/\b(setText|setClass|setStyle|setAttr)\(/);
  assert.ok(firstWrite > 0, 'frame() writes HUD state');
  assert.ok(refill < firstWrite, 'the layout read comes before any HUD write in the same frame');
  assert.equal(body.slice(0, refill).replace(/\/\/[^\n]*/g, '').trim(), 'function frame(dt) {',
    'it is the first statement: nothing runs ahead of it');
});

test('D2: the cache really is invalidated on resize and refilled by objectiveEdgeObstacles', () => {
  const hud = read('src/ui/hud.js');
  assert.match(hud, /objectiveEdgeBoxes\s*=\s*\{[^}]*stale:\s*true/, 'the cache starts stale');
  assert.match(hud, /function objectiveEdgeObstacles\(/, 'the refill function exists');
  assert.match(hud, /objectiveEdgeBoxes\.stale\s*=\s*true/, 'a resize (or layout change) marks the cache stale again');
  assert.match(hud, /objectiveEdgeBoxes\.stale\s*=\s*false/, 'the refill marks it fresh');
});

test('D6: the boot emblem is an HTML image ahead of the SVG, not an SVG node inside it', () => {
  const ring = read('src/ui/orrery/bootRing.js');
  assert.match(ring, /const emblem = document\.createElement\('img'\);/);
  assert.match(ring, /emblem\.className = 'boot-ring__emblem boot-ring__emblem-layer';/);
  assert.match(ring, /shell\.append\(emblem, svg, canvas\)/, 'the layer sits under the SVG in the shell');
  assert.doesNotMatch(ring, /svg\.append\([^)]*emblem/, 'the SVG no longer carries the rotating emblem');
  assert.match(ring, /aria-hidden/, 'a decorative image stays out of the accessibility tree');
});

test('D6: the emblem layer is promoted and positioned, and the overlay contains layout and paint', () => {
  const instrument = read('styles/boot-instrument.css');
  const layer = instrument.match(/\.boot-instrument \.boot-ring__emblem-layer\s*\{([^}]*)\}/);
  assert.ok(layer, 'the emblem layer rule exists');
  assert.match(layer[1], /position:\s*absolute/);
  assert.match(layer[1], /will-change:\s*transform/, 'its rotation runs on the compositor');
  assert.match(layer[1], /left:\s*38px/);
  assert.match(layer[1], /top:\s*38px/);
  assert.match(layer[1], /width:\s*100px/);
  const intro = read('styles/intro.css');
  const overlay = intro.match(/#boot-overlay\s*\{[^}]*\}/);
  assert.ok(overlay, '#boot-overlay has a base rule');
  assert.match(overlay[0], /contain:\s*layout paint/);
});
