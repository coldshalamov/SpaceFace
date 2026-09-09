#!/usr/bin/env node
// scripts/check-ui-control-labels.mjs — PQ-189.00: every displayed flight key comes from input.js.
//
// A label typed as prose is the defect. This scan fails when hud/help/settings/drill/prompts
// keep a private formatter, and when README / GDD §4 name a key the live PILOT table does not bind.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BINDINGS } from '../src/ui/bindings.js';
import {
  DEFAULTS,
  MOUSE_ACTION_LABELS,
  resolveActionLabel,
  TAUGHT_FLIGHT_ACTIONS,
} from '../src/systems/input.js';
import { controlPrompt, setPromptScheme } from '../src/ui/controlPrompts.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

const PILOT_STATE = Object.freeze({
  settings: {
    gameplay: { controlScheme: 'pilot' },
    controls: { bindings: null },
  },
});

const OWNED_UI = [
  'src/ui/hud.js',
  'src/ui/screens/help.js',
  'src/ui/screens/settings.js',
  'src/ui/screens/drill.js',
  'src/ui/screens/range.js',
  'src/ui/input.js',
  'src/ui/controlPrompts.js',
];

const BANNED_PROSE = [
  { re: /['"`]Space \/ F['"`]/, why: 'typed Massline keys' },
  { re: /['"`]SPACE \/ F['"`]/, why: 'typed Massline keys' },
  { re: /\|\|\s*['"]Arrow(?:Up|Down|Left|Right)['"]/, why: 'Arrow* display fallback' },
  { re: /\|\|\s*['"](?:Shift|SHIFT|Up)['"]/, why: 'typed key fallback' },
  { re: /['"`]W \/ A \/ S \/ D['"`]/, why: 'typed rover WASD' },
];

function walkUiJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) walkUiJs(next, acc);
    else if (entry.name.endsWith('.js')) acc.push(next);
  }
  return acc;
}

for (const abs of walkUiJs(join(ROOT, 'src', 'ui'))) {
  const rel = abs.slice(ROOT.length).replaceAll('\\', '/').replace(/^\//, '');
  const src = readFileSync(abs, 'utf8');
  for (const { re, why } of BANNED_PROSE) {
    assert.doesNotMatch(src, re, `${rel}: ${why}`);
  }
}

for (const rel of OWNED_UI) {
  const src = read(rel);
  assert.doesNotMatch(src, /function codeToBindingLabel\s*\(/, `${rel} must not keep a private code formatter`);
  assert.doesNotMatch(src, /function humanizeCode\s*\(/, `${rel} must not keep a private humanizeCode`);
  assert.doesNotMatch(src, /function flightActionLabel\s*\(/, `${rel} must not keep a private flightActionLabel`);
  assert.match(
    src,
    /from ['"].*systems\/input\.js['"]/,
    `${rel} must resolve labels from src/systems/input.js`,
  );
}

assert.match(read('src/ui/hud.js'), /resolveActionCodes\(|resolveActionLabel\(/,
  'the flight HUD must print live line-control keys, not a typed arrow string');
assert.match(read('src/ui/screens/help.js'), /resolveActionLabel\(/,
  'Help → Controls must resolve rebindable rows from input.js');
assert.match(read('src/ui/screens/settings.js'), /formatBindingCode\(/,
  'Settings → Controls must format captured codes with the shared formatter');
assert.match(read('src/ui/screens/drill.js'), /resolveActionCodes\(/,
  'the rover must read movement codes from the live flight bindings');
assert.match(read('src/ui/controlPrompts.js'), /resolveActionLabel\(/,
  'control prompts must interpolate live flight labels');
assert.match(read('src/ui/screens/range.js'), /resolveActionLabel\(/,
  'the range overlay must print live fire/tether/boost labels');

const tether = resolveActionLabel(PILOT_STATE, 'tether');
const brake = resolveActionLabel(PILOT_STATE, 'brake');
const forward = resolveActionLabel(PILOT_STATE, 'forward');
assert.equal(tether, 'Space/F', 'PILOT Massline is Space with F as the permanent alias');
assert.equal(brake, '0', 'PILOT dedicated brake is Digit0');
assert.match(forward, /^W\//, 'PILOT forward still teaches W');
assert.equal(resolveActionLabel(PILOT_STATE, 'fire'), MOUSE_ACTION_LABELS.fire);

for (const action of TAUGHT_FLIGHT_ACTIONS) {
  const label = resolveActionLabel(PILOT_STATE, action);
  assert.ok(typeof label === 'string', `taught action ${action} must resolve to a string`);
  if (action !== 'reelIn' && action !== 'reelOut') {
    assert.ok(label.length > 0, `taught action ${action} must have a player-facing label`);
  }
}

setPromptScheme('pilot');
const flightPrompt = controlPrompt('flight', 'kbm');
assert.match(flightPrompt, new RegExp(tether.replace('/', '\\/')),
  'the kbm flight prompt must name the live Massline keys');
assert.match(flightPrompt, new RegExp(`\\b${brake}\\b`),
  'the kbm flight prompt must name the live brake key');
assert.match(flightPrompt, new RegExp(MOUSE_ACTION_LABELS.fire),
  'the kbm flight prompt must name LMB fire');
assert.match(controlPrompt('mining', 'kbm'), /RMB hold to mine/);
assert.match(controlPrompt('station', 'gamepad'), /A dock/);
assert.match(controlPrompt('mining', 'touch'), /Mine button/);

const readme = read('README.md');
assert.match(readme, /\|\s*Massline[^|]*\|\s*\*\*Space\*\*/,
  'README must name Space as the Massline, never as fire');
assert.doesNotMatch(readme, /Space fires|Space to fire|Space is fire/i);
assert.match(readme, new RegExp(`\\|\\s*Star map\\s*\\|\\s*\\*\\*${BINDINGS.starmap.label}\\*\\*`),
  'README star map must match src/ui/bindings.js');
assert.match(readme, new RegExp(`\\|\\s*Local map\\s*\\|\\s*\\*\\*${BINDINGS.localmap.label}\\*\\*`),
  'README local map must match src/ui/bindings.js');
assert.match(readme, /\|\s*Dock\s*\|\s*\*\*E\*\*/);
assert.match(readme, /\|\s*Codex\s*\|\s*\*\*K\*\*/);

const gdd = read('design/GDD_2_0.md');
const section41 = gdd.slice(gdd.indexOf('### 4.1 Control scheme'), gdd.indexOf('### 4.2 '));
assert.match(section41, /Space became the Massline|Space is \*\*not\*\* brake; Space is the Massline/);
assert.match(section41, /\*\*0 \(Digit0\)\*\* = dedicated zero-thrust brake/);
assert.equal(DEFAULTS.SCHEMES.pilot.brake[0], 'Digit0');
assert.deepEqual(DEFAULTS.SCHEMES.pilot.tether, ['Space', 'KeyF']);

console.log(`UI control labels OK — ${TAUGHT_FLIGHT_ACTIONS.length} taught flight actions resolve from input.js; README/GDD match PILOT.`);
