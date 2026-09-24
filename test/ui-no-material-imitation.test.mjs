// OWNER RULING 2026-09-22: "free of any common CSS anti-patterns of old internet (mostly when CSS
// is pretending to be physical materials, it looks awful and we need either custom or downloaded
// assets for a lot of things)."
//
// This is the guard that keeps the screws out. Every pattern below was live on every screen in the
// game the day the owner said it: a radial-gradient LED dot on each button, a 512px brushed-steel
// tile under each keycap, SVG bezels with fasteners in the corners, inset-shadow bevels, a fader
// cap striped to look knurled, and a Houdini paint worklet that machined a plate procedurally.
// design/frontend/ONE_PHOTOGRAPH.md §0 records the ruling and marks P4 superseded.
//
// What is allowed instead: type, flat fills, hairlines, geometry (clip-path), emitted light (a glow
// on something that is lit), and PRODUCED ART at the size it is shown -- a render or an authored
// vector. Comments are stripped before matching, because these files document what they retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(js|css|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// The 2D interface: every stylesheet, the Deckplate system, the screens, the HUD styles, and the
// kit layer injected at dock. The 3D renderers under src/ui/asteroid draw real bevels on real
// geometry and are not CSS.
const FILES = [
  ...walk(join(ROOT, 'styles')),
  ...walk(join(ROOT, 'src/ui')).filter((p) => !/[\\/]asteroid[\\/]asteroidRenderer/.test(p)),
  join(ROOT, 'assets/ui/kit/kit/fh.css'),
];

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1');

const FORBIDDEN = [
  [/dp-tex-(?:brushed|scratch|grain|smudge|scan)\b/, 'a texture tile standing in for a material'],
  [/assets\/ui\/deckplate\/tex\//, 'a texture tile standing in for a material'],
  [/\bKEY_LED_|\bLED_(?:ON|OFF|RED|RIM|ON_GLOW)(?:_TL|_BB)?\b/, 'the painted LED dot on a control'],
  [/\.dp-led\b/, 'the painted LED dot on a control'],
  [/dp-rivets?\b|rule-cap\.svg/, 'a painted fastener'],
  [/(?:bezel|bezel-thin|bezel-lit|keycap|keycap-pressed)\.svg/, 'a bezel or keycap drawn around a control'],
  [/paint\(dp-(?:plate|channel)\)|plate-worklet/, 'the procedural metal worklet'],
  [/--dp-(?:plate|channel)-bevel\b/, 'an inset-shadow bevel'],
  [/--dp-metal-(?:layers|sheen|fall)\b/, 'the brushed-metal composite'],
  [/tile\.hazard\.stripe-[a-z]+\.png/, 'a raster hazard tile'],
  // The kit's photographed controls: keys, sockets, switches, slider parts, lamps, gauge cells,
  // tapes, windows and texture tiles. A backdrop photograph of the world (plates/plate.backdrop.*)
  // is a picture, not a control, and stays allowed; so do the vector icons, marks and SVG shells.
  [/assets\/(?:ui\/kit\/)?assets\/(?:keys|controls|lights|gauges|sockets|tapes|strips|wear|windows|badges|radar|tiles)\//,
    'a photographed control standing in for a drawn one'],
  [/\.\.\/assets\/(?:keys|controls|lights|gauges|sockets|tapes|strips|wear|windows|badges|radar|tiles)\//,
    'a photographed control standing in for a drawn one'],
];

test('no CSS in the 2D interface imitates a physical material', () => {
  const hits = [];
  for (const file of FILES) {
    const src = strip(readFileSync(file, 'utf8'));
    for (const [pattern, what] of FORBIDDEN) {
      const m = src.match(pattern);
      if (m) hits.push(`${relative(ROOT, file)}: ${m[0]} (${what})`);
    }
  }
  assert.deepEqual(hits, [], 'owner ruling 2026-09-22 -- an object is produced art or it is light:\n  ' + hits.join('\n  '));
});

test('the direction records the ruling that retired computed metal', () => {
  const doc = readFileSync(join(ROOT, 'design/frontend/ONE_PHOTOGRAPH.md'), 'utf8');
  assert.match(doc, /CSS may not imitate a material/);
  assert.match(doc, /P4 — SUPERSEDED by the owner, 2026-09-22/);
});
