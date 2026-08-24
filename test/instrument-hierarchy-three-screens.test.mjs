// PACKET HIERARCHY-3 — instrument grammar on mission log, tech tree, local map.
// Source contracts: 12px floor, one DISPLAY, colour by meaning, --sf-data-face on figures,
// no animation:infinite, no native title=, no cyan --accent, no forbidden class vocabulary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditTypeFloor } from '../scripts/check-type-floor.mjs';
import { NATIVE_TITLE_RE, nativeTitlePropWrites } from '../scripts/check-ui-native-titles.mjs';
import { describeTechNodeReadiness } from '../src/ui/screens/techTree.js';
import { objectiveText } from '../src/ui/screens/missionLog.js';

const FILES = [
  'src/ui/screens/missionLog.js',
  'src/ui/screens/techTree.js',
  'src/ui/screens/localmap.js',
];
const DISPLAY = new Map([
  ['src/ui/screens/missionLog.js', '.sf-mlog-rec-title'],
  ['src/ui/screens/techTree.js', '.tt-title'],
  ['src/ui/screens/localmap.js', '.lm-objective-title'],
]);
const PINNED_FORBIDDEN = /(?:\bpanel\b|sf-menu|sf-mlog-card)/;
const ALLOWED_PX = new Set([12, 13, 14, 15, 19, 20, 22, 28, 40, 64]);

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

test('type floor: nothing in the three screens is authored below 12px', () => {
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
  const tech = load('src/ui/screens/techTree.js');
  assert.match(tech, /#sf-techtree \.tt-res b/);
  assert.match(tech, /#sf-techtree \.tt-cost/);
  assert.match(tech, /canvasFontScaled\(500, 13, zoom, 'data'\)/);
  const map = load('src/ui/screens/localmap.js');
  assert.match(map, /#sf-localmap \.lm-route-profit/);
  assert.match(map, /#sf-localmap \.lm-objective-meta/);
  assert.match(map, /canvasFont\(500, 13, 'data'\)/);
});

test('colour is by meaning: role tokens present, cyan accent absent', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    for (const role of ['--sf-you', '--sf-foe', '--sf-goal', '--sf-calm', '--sf-paper']) {
      assert.ok(code.includes(role), rel + ' missing ' + role);
    }
    assert.equal((code.match(/var\(--accent\)|var\(--accent,|#39d0ff/g) || []).length, 0,
      rel + ' still spends the roleless cyan --accent');
    assert.equal((code.match(/var\(--accent-3\)|#c08bff/g) || []).length, 0,
      rel + ' still spends roleless purple');
    assert.equal((code.match(/animation:[^;}]*\binfinite\b/g) || []).length, 0,
      rel + ' has animation: infinite');
  }
});

test('no native title=; naming avoids pulse/blink/flash', () => {
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
  for (const rel of ['src/ui/screens/techTree.js', 'src/ui/screens/localmap.js']) {
    const code = stripComments(load(rel));
    assert.doesNotMatch(code, /\.font\s*=\s*[`'"][^`'"]*var\(--/);
    assert.match(code, /from '\.\.\/canvasFonts\.js'/);
  }
});

test('describeTechNodeReadiness still names the lock reason in words', () => {
  const locked = describeTechNodeReadiness(
    { id: 'b', name: 'B', prereqs: ['a'], cost: { credits: 0, rp: 0 } },
    { player: { researchedNodes: [], credits: 0, researchPoints: 0 } },
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', prereqs: ['a'] }],
  );
  assert.equal(locked.state, 'locked');
  assert.match(locked.actionLabel, /Research A first/);
  assert.ok(objectiveText({ type: 'patrol_clear', objectiveProgress: 1, objectiveTarget: 3 }));
});
