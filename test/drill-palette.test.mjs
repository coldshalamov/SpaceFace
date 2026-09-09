import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ROLE_FALLBACK,
  buildSvgTemplates,
  colorForMaterial,
  materialKind,
} from '../src/ui/screens/drill.js';

const DRILL_SRC = new URL('../src/ui/screens/drill.js', import.meta.url);

function hexLiterals(src) {
  return [...src.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)].map((m) => m[0].toLowerCase());
}

function uniqueHex(src) {
  return [...new Set(hexLiterals(src))].sort();
}

const ALLOWED = [...new Set(Object.values(ROLE_FALLBACK).map((h) => h.toLowerCase()))].sort();

test('drill screen hex palette is exactly the seven instrument-grammar roles', () => {
  const src = readFileSync(DRILL_SRC, 'utf8');
  const found = uniqueHex(src);
  assert.deepEqual(found, ALLOWED);
  assert.equal(found.length, 7);
});

test('a roleless hex in the drill screen fails the palette pin', () => {
  const src = readFileSync(DRILL_SRC, 'utf8');
  const poisoned = src + '\nconst LEAK = "#ff00aa";\n';
  const found = uniqueHex(poisoned);
  assert.ok(found.includes('#ff00aa'), 'injected hex must be detected');
  assert.ok(found.length > 7, 'roleless hex must make the unique count exceed the grammar set');
  assert.deepEqual(uniqueHex(src), ALLOWED, 'the live file must still be clean after the negative probe');
});

test('each rock material has one identity and a non-hue mark', () => {
  const t = buildSvgTemplates(ROLE_FALLBACK);
  assert.equal(materialKind('cmdty_ore_iron'), 'metal');
  assert.equal(materialKind('cmdty_ore_copper'), 'metal');
  assert.equal(materialKind('cmdty_ore_titanium'), 'metal');
  assert.equal(materialKind('cmdty_ice_water'), 'ice');
  assert.equal(materialKind('cmdty_ore_einsteinium'), 'exotic');
  assert.equal(materialKind('cmdty_gem_ruby'), 'exotic');
  assert.equal(materialKind('gasRevealed'), 'gas');
  assert.equal(materialKind('rock'), 'basalt');
  assert.equal(materialKind('dirt'), 'matrix');
  assert.equal(materialKind('rover'), 'you');

  assert.equal(t.cmdty_ore_iron, t.cmdty_ore_copper);
  assert.equal(t.cmdty_ore_iron, t.cmdty_ore_titanium);
  assert.equal(t.cmdty_ore_iron, t.cmdty_ore_platinoid);
  assert.equal(t.gas, t.dirt, 'unrevealed gas reuses the matrix tile');
  assert.notEqual(t.gasRevealed, t.dirt);
  assert.notEqual(t.cmdty_ice_water, t.cmdty_ore_iron);
  assert.notEqual(t.cmdty_ore_einsteinium, t.cmdty_ore_iron);
  assert.notEqual(t.rock, t.dirt);
  assert.notEqual(t.rover, t.dirt);

  assert.ok(t.cmdty_ore_iron.includes('rect x="6" y="9"'), 'metal reads as stacked ingots');
  assert.ok(t.cmdty_ice_water.includes('20,4 36,20 20,36 4,20'), 'ice reads as a diamond');
  assert.ok(t.cmdty_ore_einsteinium.includes('20,5 33,12.5'), 'exotic reads as a hex');
  assert.ok(t.gasRevealed.includes('M14 16 L26 28'), 'gas reads as an X');
  assert.ok(t.rock.includes('M4 8 L18 22'), 'basalt reads as fractures');
  assert.ok(t.dirt.includes('circle cx="7"'), 'matrix reads as grain');

  assert.equal(colorForMaterial('cmdty_ore_iron', ROLE_FALLBACK), ROLE_FALLBACK.calm);
  assert.equal(colorForMaterial('cmdty_ice_water', ROLE_FALLBACK), ROLE_FALLBACK.paper);
  assert.equal(colorForMaterial('gasRevealed', ROLE_FALLBACK), ROLE_FALLBACK.foe);
  assert.equal(colorForMaterial('cmdty_ore_einsteinium', ROLE_FALLBACK), ROLE_FALLBACK.goal);
  assert.equal(colorForMaterial('rock', ROLE_FALLBACK), ROLE_FALLBACK.edge);
  assert.equal(colorForMaterial('dirt', ROLE_FALLBACK), ROLE_FALLBACK.surface);
  assert.equal(colorForMaterial('rover', ROLE_FALLBACK), ROLE_FALLBACK.you);
});

test('drill screen does not spend --accent, infinite motion, or native titles', () => {
  const src = readFileSync(DRILL_SRC, 'utf8');
  assert.doesNotMatch(src, /var\(--accent\)/);
  assert.doesNotMatch(src, /animation:[^;\n]*infinite/);
  assert.doesNotMatch(src, /(?<![\w.-])title=(?=['"])/);
  assert.doesNotMatch(src, /class(?:Name)?\s*=\s*['"][^'"]*(?:pulse|blink|flash)/i);
  assert.doesNotMatch(src, /class(?:Name)?\s*=\s*['"][^'"]*(?:panel|card|menu|modal)/i);
});
