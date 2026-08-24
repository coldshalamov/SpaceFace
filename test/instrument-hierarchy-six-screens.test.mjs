// PACKET HIERARCHY-6 — instrument grammar on the remaining live screens:
// sandbox, live station market, Combat Lab controls + telemetry, save/load, help.
// Source contracts: 12px floor, one DISPLAY, colour by meaning, --sf-data-face on figures,
// no hardcoded hex, no roleless cyan/azure, no animation:infinite, no native title=,
// no forbidden class vocabulary, SVG tokens on inline style, words beside every hue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { auditTypeFloor } from '../scripts/check-type-floor.mjs';
import { NATIVE_TITLE_RE, nativeTitlePropWrites } from '../scripts/check-ui-native-titles.mjs';
import { chartTrendColor, chartTrendRole, legalityRole as marketLegalityRole } from '../src/ui/station/screens/market.js';
import { legalityRole as helpLegalityRole } from '../src/ui/screens/help.js';
import { slotBadgeRole } from '../src/ui/screens/saveLoad.js';
import { labSpeedRole } from '../src/ui/screens/crucibleLabControls.js';
import { telemetryHostilesRole } from '../src/ui/screens/crucibleLabTelemetry.js';

const FILES = [
  'src/ui/screens/sandbox.js',
  'src/ui/station/screens/market.js',
  'src/ui/screens/crucibleLabControls.js',
  'src/ui/screens/saveLoad.js',
  'src/ui/screens/help.js',
  'src/ui/screens/crucibleLabTelemetry.js',
];
const DISPLAY = new Map([
  ['src/ui/screens/sandbox.js', '.sf-sandbox-now'],
  ['src/ui/station/screens/market.js', '.sx-mkt-title h2'],
  ['src/ui/screens/crucibleLabControls.js', '.sf-lab-speed-now'],
  ['src/ui/screens/saveLoad.js', '.sf-slot.sel .sf-slot-name'],
  ['src/ui/screens/help.js', '.sf-help-now'],
  ['src/ui/screens/crucibleLabTelemetry.js', '.sf-lab-tel-tick'],
]);
const PINNED_FORBIDDEN = /(?:\bpanel\b|sf-menu|sf-menu-wide|sf-panel|sx-panel)/;
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

test('type floor: nothing in the six screens is authored below 12px', () => {
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
  assert.match(load('src/ui/screens/sandbox.js'), /className = 'sf-fig'/);
  assert.match(load('src/ui/station/screens/market.js'), /sx-stat__v sf-fig/);
  assert.match(load('src/ui/screens/crucibleLabControls.js'), /sf-lab-speed-now sf-fig/);
  assert.match(load('src/ui/screens/saveLoad.js'), /sf-slot-detail sf-fig/);
  assert.match(load('src/ui/screens/help.js'), /num sf-fig/);
  assert.match(load('src/ui/screens/crucibleLabTelemetry.js'), /sf-lab-tel-tick sf-fig/);
});

test('colour is by meaning: role tokens present, zero hardcoded hex, no roleless cyan/azure', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    for (const role of ['--sf-you', '--sf-foe', '--sf-goal', '--sf-calm', '--sf-paper']) {
      assert.ok(code.includes(role), rel + ' missing ' + role);
    }
    assert.equal((code.match(HEX_RE) || []).length, 0, rel + ' still authors a hardcoded hex literal');
    assert.equal((code.match(/var\(--accent\)|var\(--accent,|#39d0ff|#4aa8ff/g) || []).length, 0,
      rel + ' still spends the roleless cyan/azure accent');
    assert.equal((code.match(/var\(--accent-3\)|#c08bff/g) || []).length, 0,
      rel + ' still spends roleless purple');
    assert.equal((code.match(/animation:[^;}]*\binfinite\b/g) || []).length, 0,
      rel + ' has animation: infinite');
  }
});

test('trend / legality / speed / badge colour is a meaning role, not a rainbow', () => {
  assert.equal(chartTrendRole(true), 'you');
  assert.equal(chartTrendRole(false), 'foe');
  assert.equal(chartTrendColor(true), 'var(--sf-you)');
  assert.equal(chartTrendColor(false), 'var(--sf-foe)');
  assert.equal(marketLegalityRole('contraband'), 'foe');
  assert.equal(marketLegalityRole('restricted'), 'goal');
  assert.equal(marketLegalityRole('legal'), 'calm');
  assert.equal(helpLegalityRole('contraband'), 'foe');
  assert.equal(helpLegalityRole('restricted'), 'goal');
  assert.equal(helpLegalityRole('legal'), 'calm');
  assert.equal(slotBadgeRole('Current'), 'you');
  assert.equal(slotBadgeRole('Latest'), 'goal');
  assert.equal(slotBadgeRole('Recovery'), 'foe');
  assert.equal(slotBadgeRole('v3'), 'calm');
  assert.equal(labSpeedRole(1), 'calm');
  assert.equal(labSpeedRole(2), 'you');
  assert.equal(labSpeedRole(0.5), 'goal');
  assert.equal(telemetryHostilesRole(0), 'calm');
  assert.equal(telemetryHostilesRole(3), 'foe');
});

test('SVG meaning colours ride inline style, never a presentation attribute', () => {
  for (const rel of FILES) {
    const code = stripComments(load(rel));
    assert.doesNotMatch(code, /stroke="var\(/, rel + ' paints a var() stroke presentation attribute');
    assert.doesNotMatch(code, /fill="var\(/, rel + ' paints a var() fill presentation attribute');
    assert.doesNotMatch(code, /stop-color="var\(/, rel + ' paints a var() stop-color presentation attribute');
  }
  const mkt = stripComments(load('src/ui/station/screens/market.js'));
  assert.match(mkt, /style="stroke:\$\{stroke\}"/,
    'market chart line must paint stroke from an inline style so CSS variables resolve');
  assert.match(mkt, /style="fill:\$\{stroke\}"/,
    'market chart end-dot must paint fill from an inline style so CSS variables resolve');
  assert.match(mkt, /style="stop-color:\$\{fill0\}"/,
    'market chart gradient stops must paint stop-color from an inline style so CSS variables resolve');
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
  const sandbox = load('src/ui/screens/sandbox.js');
  assert.match(sandbox, /result\.ok \? 'Ready' : 'Invalid'/);
  const mkt = load('src/ui/station/screens/market.js');
  assert.match(mkt, /▲ UP/);
  assert.match(mkt, /▼ DOWN/);
  assert.match(mkt, /HIGH DEMAND/);
  assert.match(mkt, /Tracked contract/);
  assert.match(mkt, /LEGAL_LABEL/);
  const controls = load('src/ui/screens/crucibleLabControls.js');
  assert.match(controls, /Invulnerable: on/);
  assert.match(controls, /Invulnerable: off/);
  const save = load('src/ui/screens/saveLoad.js');
  assert.match(save, /Empty slot/);
  assert.match(save, /'Current'/);
  assert.match(save, /'Latest'/);
  assert.match(save, /'Recovery'/);
  const help = load('src/ui/screens/help.js');
  assert.match(help, /is-' \+ legalRole/);
  assert.match(help, /c\.legality/);
  const tel = load('src/ui/screens/crucibleLabTelemetry.js');
  assert.match(tel, /Live hostiles/);
  assert.match(tel, /UNAVAILABLE_MARK/);
});
