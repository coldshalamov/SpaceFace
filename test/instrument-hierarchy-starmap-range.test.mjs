// Instrument grammar on the star chart and the range.
// Source contracts: 12px floor, one DISPLAY, colour by meaning, --sf-data-face on figures,
// no roleless cyan/purple, no animation:infinite, no native title=, no forbidden class
// vocabulary, canvas fonts without var(), and SVG tokens (if any) on inline style.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditTypeFloor } from '../scripts/check-type-floor.mjs';
import { NATIVE_TITLE_RE, nativeTitlePropWrites } from '../scripts/check-ui-native-titles.mjs';
import {
  dangerColor,
  dangerRole,
  pressureColor,
  pressureRole,
  trendRole,
  ROLE_FALLBACK as STARMAP_ROLES,
} from '../src/ui/screens/starmap.js';
import {
  gateStrokeRole,
  ROLE_FALLBACK as RANGE_ROLES,
} from '../src/ui/screens/range.js';

const FILES = [
  'src/ui/screens/starmap.js',
  'src/ui/screens/range.js',
];
const DISPLAY = new Map([
  ['src/ui/screens/starmap.js', '.sm-objective-title'],
  ['src/ui/screens/range.js', '.sf-range__rule'],
]);
const PINNED_FORBIDDEN = /(?:\bpanel\b|sf-menu)/;
const ALLOWED_PX = new Set([12, 13, 14, 15, 19, 20, 22, 28, 40, 64]);
const GRAMMAR_HEX = [...new Set(Object.values(STARMAP_ROLES).map((h) => h.toLowerCase()))].sort();

function load(rel) {
  return readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8');
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function pxSizes(src) {
  const out = [];
  const longhand = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g;
  let m;
  while ((m = longhand.exec(src))) out.push(Number(m[1]));
  const shorthand = /(^|[;{]|\s)font:\s*[^;}]*?([0-9]+(?:\.[0-9]+)?)px/g;
  while ((m = shorthand.exec(src))) out.push(Number(m[2]));
  return out;
}

function uniqueHex(src) {
  return [...new Set([...src.matchAll(/#(?:[0-9a-fA-F]{3,8})\b/g)].map((m) => m[0].toLowerCase()))].sort();
}

test('type floor: nothing in the two screens is authored below 12px', () => {
  const { findings } = auditTypeFloor(FILES);
  assert.deepEqual(findings, [], JSON.stringify(findings, null, 2));
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    assert.equal((code.match(/font-size:\s*[0-9.]+rem/g) || []).length, 0, rel + ' still uses rem font-size');
    assert.equal((code.match(/font-size:\s*[0-9.]+em/g) || []).length, 0, rel + ' still uses em font-size');
    for (const size of pxSizes(code)) {
      assert.ok(size >= 12, rel + ' font-size ' + size + 'px is below the floor');
      assert.ok(ALLOWED_PX.has(size), rel + ' font-size ' + size + 'px is not on the grammar scale');
    }
  }
});

test('one DISPLAY-sized element per screen, and it is the named eye-winner', () => {
  for (const rel of FILES) {
    const code = load(rel);
    const selectors = [];
    const re = /([^{}]+)\{[^}]*font-size:\s*28px/g;
    let m;
    while ((m = re.exec(code))) selectors.push(m[1].replace(/@media[^{]+/g, '').trim());
    const unique = [...new Set(selectors.filter(Boolean))];
    assert.equal(unique.length, 1, rel + ' DISPLAY selectors: ' + unique.join(' | '));
    assert.ok(unique[0].includes(DISPLAY.get(rel)), rel + ' DISPLAY should be ' + DISPLAY.get(rel));
  }
});

test('every figure binds --sf-data-face', () => {
  for (const rel of FILES) {
    const code = load(rel);
    assert.match(code, /font-family:\s*var\(--sf-data-face\)/, rel + ' has no --sf-data-face binding');
    assert.match(code, /\.sf-fig/, rel + ' has no .sf-fig figure class');
  }
  const star = load('src/ui/screens/starmap.js');
  assert.match(star, /class="sf-fig" data-fuel/);
  assert.match(star, /canvasFontScaled\('700', 12, z, 'data'\)/);
  const range = load('src/ui/screens/range.js');
  assert.match(range, /sf-range__progress sf-fig/);
  assert.match(range, /canvasFont\('600', 12, 'data'\)/);
});

test('colour is by meaning: role tokens present, grammar hex only, no roleless cyan/purple', () => {
  assert.deepEqual([...new Set(Object.values(RANGE_ROLES).map((h) => h.toLowerCase()))].sort(), GRAMMAR_HEX);
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    for (const role of ['--sf-you', '--sf-foe', '--sf-goal', '--sf-calm', '--sf-paper']) {
      assert.ok(code.includes(role), rel + ' missing ' + role);
    }
    assert.deepEqual(uniqueHex(code), GRAMMAR_HEX, rel + ' authored a hex outside the seven grammar roles');
    assert.equal((code.match(/var\(--accent\)|var\(--accent,|#39d0ff|#4aa8ff/g) || []).length, 0,
      rel + ' still spends the roleless cyan/azure accent');
    assert.equal((code.match(/var\(--accent-3\)|#c08bff/g) || []).length, 0,
      rel + ' still spends roleless purple');
    assert.equal((code.match(/animation:[^;}]*\binfinite\b/g) || []).length, 0,
      rel + ' has animation: infinite');
  }
});

test('danger / pressure / gate colour is a meaning role, not a rainbow', () => {
  assert.equal(dangerRole(0.1), 'you');
  assert.equal(dangerRole(0.5), 'goal');
  assert.equal(dangerRole(0.9), 'foe');
  assert.equal(dangerColor(0.1), 'var(--sf-you)');
  assert.equal(dangerColor(0.9), 'var(--sf-foe)');
  assert.equal(pressureRole(-0.2), 'you');
  assert.equal(pressureRole(0), 'calm');
  assert.equal(pressureRole(0.2), 'goal');
  assert.equal(pressureColor(0.2), 'var(--sf-goal)');
  assert.equal(trendRole(0), 'calm');
  assert.equal(gateStrokeRole('passed'), 'you');
  assert.equal(gateStrokeRole('failed'), 'foe');
  assert.equal(gateStrokeRole('pending'), 'calm');
});

test('SVG meaning colours ride inline style, never a presentation attribute', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    assert.doesNotMatch(code, /stroke="var\(/, rel + ' paints a var() stroke presentation attribute');
    assert.doesNotMatch(code, /fill="var\(/, rel + ' paints a var() fill presentation attribute');
  }
});

test('no native title=; naming avoids pulse/blink/flash and card/menu/panel/modal', () => {
  for (const rel of FILES) {
    const body = load(rel);
    assert.equal([...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))].length, 0, rel + ' writes title=');
    assert.equal(nativeTitlePropWrites(body).length, 0, rel + ' writes .title');
    const classes = [...stripComments(body).matchAll(/class(?:Name)?=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    for (const cls of classes) {
      assert.doesNotMatch(cls, /pulse|blink|flash/, rel + ' class ' + cls);
      if (/panel|card|menu|modal/.test(cls)) {
        assert.match(cls, PINNED_FORBIDDEN, rel + ' introduced forbidden class ' + cls);
      }
    }
  }
});

test('crest / stage / apron zones are named on each screen', () => {
  for (const rel of FILES) {
    const code = load(rel);
    assert.match(code, /\bsf-crest\b/, rel);
    assert.match(code, /\bsf-stage\b/, rel);
    assert.match(code, /\bsf-apron\b/, rel);
  }
});

test('canvas text does not pass var() into ctx.font', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    assert.doesNotMatch(code, /\.font\s*=\s*[`'"][^`'"]*var\(--/);
    assert.match(code, /from '\.\.\/canvasFonts\.js'/);
  }
});

test('no state rests on hue alone: the words sit beside every colour', () => {
  const star = load('src/ui/screens/starmap.js');
  assert.match(star, /sm-pips-word">HIGH/);
  assert.match(star, /sm-pips-word">NULL/);
  assert.match(star, /pressureLabel/);
  assert.match(star, /danger field/);
  assert.match(star, /\[!\]/);
  const range = load('src/ui/screens/range.js');
  assert.match(range, /CLEARED/);
  assert.match(range, /fillText\('STOP'/);
  assert.match(range, /fillText\('EXIT'/);
  assert.match(range, /% CAP/);
  assert.match(range, /state === 'passed' \? '✓' : '✕'/);
});
