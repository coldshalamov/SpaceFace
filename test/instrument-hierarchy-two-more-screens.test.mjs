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

// The station Factions screen moved onto the frontend kit (Frontend Task C §1.6) and the codex
// followed (Frontend Task D): neither authors sizes, faces or colours of its own any more, so the
// legacy-grammar audits below have no file left to read; the kit-clothes assertions replace them.
const FILES = [];
const DISPLAY = new Map();
const PINNED_FORBIDDEN = /(?:\bpanel\b|sf-menu|sf-menu-wide)/;
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

// auditTypeFloor reports an infra finding for an empty file list; with every audited screen on the
// kit (which authors no sizes) the legacy audit has nothing to observe and is skipped, not failed.
test('type floor: nothing in the two screens is authored below 12px', { skip: FILES.length === 0 && 'every audited screen has moved onto the kit' }, () => {
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
});

test('the codex screen authors no injected styles, legacy tokens or hex of its own', () => {
  const codex = stripComments(load('src/ui/screens/codex.js'));
  assert.match(codex, /from '\.\.\/kit\/index\.js'/, 'the codex is built on the frontend kit');
  assert.doesNotMatch(codex, /injectStyle|STYLE_ID|createElement\('style'\)/, 'no injected style block');
  assert.doesNotMatch(codex, /var\(--sf-|var\(--ink|var\(--accent/, 'no legacy colour or face token');
  assert.equal((codex.match(HEX_RE) || []).length, 0, 'no hardcoded hex literal');
  assert.doesNotMatch(codex, /font-size:\s*[0-9.]+(px|rem|em)/, 'no authored font size');
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
  // The kit's three meaning words: against you (--k-bad), at rest (the 62% bone), a gain (--k-good).
  assert.equal(standingColorAt(0), 'var(--k-bad)');
  assert.equal(standingColorAt(3), 'var(--k-bad)');
  assert.equal(standingColorAt(4), 'var(--k-bone-62)');
  assert.equal(standingColorAt(5), 'var(--k-good)');
  assert.equal(standingColorAt(8), 'var(--k-good)');
  assert.equal(standingColor(-800), 'var(--k-bad)');
  assert.equal(standingColor(0), 'var(--k-bone-62)');
  assert.equal(standingColor(500), 'var(--k-good)');
});

test('the factions screen authors no dial SVG, tints or injected styles of its own', () => {
  const fac = stripComments(load('src/ui/station/screens/factions.js'));
  assert.doesNotMatch(fac, /sx-dial|buildDialSvg|<svg/, 'the standing dial is gone; the words carry the state');
  assert.doesNotMatch(fac, /injectStyle|FACTIONS_CSS|--tint:|--relation:/, 'no injected style block or per-faction tints');
  assert.equal((fac.match(HEX_RE) || []).length, 0, 'no hardcoded hex literal');
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

test('no state rests on hue alone: the words sit beside every colour', () => {
  const fac = load('src/ui/station/screens/factions.js');
  // Tier name + signed rep always accompany the standing colour, in the rows and the heroes.
  assert.match(fac, /Authority · /);
  assert.match(fac, /'Align' : 'Rival'/);
  assert.match(fac, /Peak held/);
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
