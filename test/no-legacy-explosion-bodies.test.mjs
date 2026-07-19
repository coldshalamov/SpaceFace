import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/render/vfx.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('the phased lifecycle is the only executable explosion implementation', () => {
  assert.doesNotMatch(source, /\n\s*_explodeSmall\s*\(/,
    'remove the unreachable legacy small-ship ring explosion body');
  assert.doesNotMatch(source, /\n\s*_explodeCapital\s*\(/,
    'remove the unreachable legacy capital ring explosion body');

  const start = source.indexOf('  _explode(p, big) {');
  const end = source.indexOf('  // ---- mining beam visual', start);
  assert.ok(start >= 0 && end > start, 'explosion routing seam must remain present');
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /_spawnSprite\(SPR_(?:RING|FLASH)/,
    'routing must queue the phased lifecycle instead of retaining a second unreachable visual body');
});

test('explosion residue uses the irregular smoke role instead of the circular additive glow card', () => {
  const start = source.indexOf("    if (phase === 'residue') {");
  const end = source.indexOf('\n    }\n  },\n\n  _explode', start);
  assert.ok(start >= 0 && end > start, 'residue phase must remain inspectable');
  const body = source.slice(start, end);
  assert.match(body, /_spawnSprite\(SPR_PUFF/,
    'residue remains on the bounded pooled smoke lifecycle');
  assert.match(source, /if \(s\.kind === SPR_PUFF\) \{\s*smokeOrder\[smokeCount\+\+\] = i;/,
    'puff events must enter the bounded far-to-near smoke order');
  assert.match(source, /writeInstancedSpriteFields\(\s*this\._spriteBatches,\s*'smoke'/,
    'ordered puffs must route through the allocation-free irregular smoke bucket writer');
  assert.match(source, /function makeSmokeTexture\(\)/);
});

test('every phased destruction stage remains non-ring and uses repeatable authored placement', () => {
  const start = source.indexOf('  _emitExplosionPhase(');
  const end = source.indexOf('  _explode(p, big)', start);
  assert.ok(start >= 0 && end > start, 'phased destruction emitter must remain inspectable');
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /SPR_(?:RING|FLASH)/,
    'reduced and dense destruction must not reveal a hidden ring or circular flash fallback');
  assert.doesNotMatch(body, /Math\.random\(\)/,
    'fixed destruction receipts must retain stable silhouettes across normal-route captures');
  assert.match(body, /phase === 'breakup'/,
    'capital destruction retains a structural breakup stage before rupture');
  assert.match(body, /explosionPattern(?:01|Signed)/,
    'irregular placement comes from the deterministic presentation mixer');
});
