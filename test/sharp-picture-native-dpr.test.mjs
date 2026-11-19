// Owner 2026-11-19: "the game looks kind of blurry". On the owner's Intel laptop (125 % Windows
// scaling), an Auto-only 1x pixel-ratio ceiling drew the world at 1536 px and let the browser stretch
// it to 1920 — a soft picture. Measured headed on that machine (Swarm round 1, the 30 Hz Auto cap,
// interleaved runs): the native 1920 px buffer held the same present rate as 1x, because the frame
// is submission-bound, not fill-bound. Integrated graphics render native up to 1.5x in EVERY quality
// mode; a busy machine's relief ladder trims post-FX first and never softens the raster.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function functionBody(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} exists in renderer.js`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`${name}: unbalanced braces`);
}

function constValue(name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)\\s*;`));
  assert.ok(m, `${name} is a numeric constant`);
  return Number(m[1]);
}

test('integrated graphics render native up to 1.5x in every quality mode (no Auto-only 1x ceiling)', () => {
  const body = functionBody('applyRendererSize');
  const capLine = body.split(/\r?\n/).find((line) => /const tierCap\s*=/.test(line));
  assert.ok(capLine, 'applyRendererSize computes a per-tier pixel-ratio cap');
  assert.match(capLine, /tier === 'integrated' \? 1\.5/, 'the integrated tier caps the pixel ratio at 1.5');
  assert.doesNotMatch(capLine, /auto/i,
    'the cap must not depend on the Auto quality mode: an Auto-only 1x ceiling is what made the owner\'s picture blurry');
  assert.doesNotMatch(body, /autoIntegrated/, 'no Auto-only integrated pixel-ratio ceiling');
});

test('automatic relief never softens the raster below the drawing buffer', () => {
  assert.ok(constValue('INTEGRATED_RELIEF_RASTER_CAP') >= 1,
    'integrated Auto relief keeps the full drawing buffer (fill relief buys nothing on a submission-bound frame)');
  const maxLevel = constValue('HITCH_RELIEF_MAX_LEVEL');
  assert.ok(maxLevel < 3, 'the hitch ladder stops at post-FX: the raster rung (level 3) stays unreachable');
});
