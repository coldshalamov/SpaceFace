// PACKET HIERARCHY-2 — instrument grammar on the factions standing dial and the codex.
// Source contracts: 12px floor, one DISPLAY, colour by meaning, --sf-data-face on figures,
// no hardcoded hex, no roleless azure/cyan accent, no animation:infinite, no native title=,
// no forbidden class vocabulary, and no state resting on hue alone (words carry it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditTypeFloor } from '../scripts/check-type-floor.mjs';
import { NATIVE_TITLE_RE, nativeTitlePropWrites } from '../scripts/check-ui-native-titles.mjs';
import { standingColor, standingColorAt } from '../src/ui/station/screens/factions.js';
import {
  codexProgressSummary,
  commUnlocked,
  SIGNAL_ARCHIVE,
} from '../src/ui/screens/codex.js';

const FILES = [
  'src/ui/station/screens/factions.js',
  'src/ui/screens/codex.js',
];
const DISPLAY = new Map([
  ['src/ui/station/screens/factions.js', '.sx-fac-ident h2'],
  ['src/ui/screens/codex.js', '.sf-codex-beat.current h3'],
]);
// Same scale the three converted screens pinned (mission log / tech tree / local map).
const ALLOWED_PX = new Set([12, 13, 14, 15, 19, 20, 22, 28, 40, 64]);
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;

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
  const fac = load('src/ui/station/screens/factions.js');
  assert.match(fac, /class="sx-dial-rep sf-fig"/);
  assert.match(fac, /class="sf-fig" style="color:\$\{col\}"/);
  const codex = load('src/ui/screens/codex.js');
  assert.match(codex, /sf-codex-status-v sf-fig/);
});

test('colour is by meaning: role tokens present, zero hardcoded hex, no roleless azure/cyan', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    for (const role of ['--sf-you', '--sf-foe', '--sf-goal', '--sf-calm', '--sf-paper']) {
      assert.ok(code.includes(role), rel + ' missing ' + role);
    }
    assert.equal((code.match(HEX_RE) || []).length, 0, rel + ' still authors a hardcoded hex literal');
    assert.equal((code.match(/var\(--accent\)|var\(--accent,|#39d0ff|#4aa8ff/g) || []).length, 0,
      rel + ' still spends the roleless cyan/azure accent');
    assert.equal((code.match(/animation:[^;}]*\binfinite\b/g) || []).length, 0,
      rel + ' has animation: infinite');
  }
});

test('standing colour is a meaning role indexed by tier, not a rainbow', () => {
  assert.equal(standingColorAt(0), 'var(--sf-foe)');
  assert.equal(standingColorAt(3), 'var(--sf-foe)');
  assert.equal(standingColorAt(4), 'var(--sf-calm)');
  assert.equal(standingColorAt(5), 'var(--sf-you)');
  assert.equal(standingColorAt(8), 'var(--sf-you)');
  assert.equal(standingColor(-800), 'var(--sf-foe)');
  assert.equal(standingColor(0), 'var(--sf-calm)');
  assert.equal(standingColor(500), 'var(--sf-you)');
});

test('SVG meaning colours ride inline style, never a presentation attribute', () => {
  const fac = stripComments(load('src/ui/station/screens/factions.js'));
  assert.match(fac, /style="stroke:\$\{standingColorAt\(i\)\}"/,
    'dial segments must paint stroke from an inline style so CSS variables resolve');
  assert.doesNotMatch(fac, /stroke="var\(/,
    'a var() stroke presentation attribute silently paints nothing');
});

test('no native title=; naming avoids pulse/blink/flash and card/menu/panel/modal', () => {
  for (const rel of FILES) {
    const body = load(rel);
    assert.equal([...body.matchAll(new RegExp(NATIVE_TITLE_RE.source, 'g'))].length, 0, rel + ' writes title=');
    assert.equal(nativeTitlePropWrites(body).length, 0, rel + ' writes .title');
    const classes = [...stripComments(body).matchAll(/class(?:Name)?=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    for (const cls of classes) {
      assert.doesNotMatch(cls, /pulse|blink|flash/, rel + ' class ' + cls);
      assert.doesNotMatch(cls, /(?:\bpanel\b|\bcard\b|\bmenu\b|\bmodal\b)/, rel + ' introduced forbidden class ' + cls);
    }
  }
});

test('crest / stage / apron zones are named on each screen', () => {
  const fac = load('src/ui/station/screens/factions.js');
  assert.match(fac, /\bsf-crest\b/);
  assert.match(fac, /\bsf-stage\b/);
  assert.match(fac, /\bsf-apron\b/);
});

test('no state rests on hue alone: the words sit beside every colour', () => {
  const fac = load('src/ui/station/screens/factions.js');
  // Tier name + signed rep always accompany the standing colour, in rail, dial and decisions.
  assert.match(fac, /AUTHORITY · /);
  assert.match(fac, /'ALIGN' : 'RIVAL'/);
  assert.match(fac, /PEAK HELD/);
  assert.match(fac, /escapeHtml\(tier\.name\)\} \$\{signed\(rep\)\}/);
  const codex = load('src/ui/screens/codex.js');
  // Locked, current and filed states each carry a word or glyph, never hue alone.
  assert.match(codex, /— not yet encountered —/);
  assert.match(codex, /YOUR CHOICE/);
  assert.match(codex, /'✓ ' : ''/);
});

test('codex model still gates by beat and reports honest progress', () => {
  const fresh = codexProgressSummary({ beatIndex: 0, seenComms: {}, graffitiShown: {} });
  assert.equal(fresh.beat, 0);
  const story = fresh.items.find((item) => item.key === 'Story');
  assert.ok(story && story.value === '1/8 beats', 'story count should start at 1/8');

  assert.equal(commUnlocked({ id: 'x', beat: 3 }, { seenComms: {} }, 2, 'personal'), false);
  assert.equal(commUnlocked({ id: 'x', beat: 3 }, { seenComms: { x: 1 } }, 0, 'personal'), true);
  assert.equal(commUnlocked({ id: 't', beat: 0 }, { seenComms: {} }, 7, 'traps'), false,
    'traps must never unlock by beat alone');

  assert.ok(Object.isFrozen(SIGNAL_ARCHIVE));
  assert.equal(SIGNAL_ARCHIVE.length, 4);
  for (const signal of SIGNAL_ARCHIVE) {
    assert.match(signal.poster, /^assets\/cinematics\/C-INTRO-\d+\.jpg$/);
    assert.match(signal.video, /^assets\/cinematics\/C-INTRO-\d+_6s\.mp4$/);
    assert.ok(signal.caption && signal.title);
  }
});
