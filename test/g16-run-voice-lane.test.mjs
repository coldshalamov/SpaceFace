// G16-04 — a live round's voice line (Swarm or the Gauntlet) is a glass plate wrapped to three lines,
// and the HUD seats it in the measured lane to the right of the round panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const skin = readFileSync(new URL('../src/ui/orrery/hudSkin.js', import.meta.url), 'utf8');
const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
const survivalHud = readFileSync(new URL('../src/ui/survivalHud.js', import.meta.url), 'utf8');

test('the voice line wears the flight-glass plate for any live round, at every height', () => {
  const rule = skin.match(/\$\{S\}\.sf-run-flight \.sf-alert\.sf-alert--floor \{[^}]*\}/)?.[0] || '';
  assert.match(rule, /background:var\(--dp-glass-flight/);
  assert.match(rule, /max-width:100%/);
  assert.match(skin, /\.sf-run-flight \.sf-alert\.sf-alert--floor \.sf-alert__text \{[^}]*-webkit-line-clamp:3/);
  assert.doesNotMatch(skin, /@media \(max-height:540px\) \{\s*\$\{S\}\.sf-swarm-flight \.sf-alert/, 'no longer short-screen only');
});

test('every live survival run in flight carries the run class the lane keys off', () => {
  assert.match(survivalHud, /toggle\('sf-run-flight', runFlight\)/);
  assert.match(hud, /const runFlight = document\.body\?\.classList\?\.contains\('sf-run-flight'\)/);
  assert.match(hud, /const panel = plateBox\(root\.querySelector\('\.sf-crun'\)\);\s*const left = Math\.max\(layout\.safe\.left \+ 12, panel \? panel\.right \+ 12 : 0\)/,
    'the lane starts right of the round panel');
});
