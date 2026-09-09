#!/usr/bin/env node
// check-new-game-first-run-rail.mjs - guards the New Game first-15-minutes route.
//
// A Steam-demo player should know the first complete loop before launch: anomaly, mining,
// Helios, then a tracked job. This keeps that player-facing rail on the default New Game screen
// instead of drifting into docs, probes, or a launcher-specific path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const newGame = read('src/ui/screens/newGame.js');
const localizedCoreCopy = read('src/ui/localizedCoreCopy.js');

assert.match(newGame, /sf-ng-route/, 'New Game must render a first-15-minutes route rail');
assert.match(localizedCoreCopy, /firstMinutes:\s*\{\s*label:\s*'First 15 minutes'\s*\}/,
  'localized core copy must explicitly label the route rail for first-session clarity');
assert.match(newGame, /coreText\('firstMinutes'\)/,
  'New Game must render the localized first-session route label');
// spec2/03 supersedes the prior first-15 route copy. The rail now teaches the 6-beat pacing:
// wake/beacon → tether derelict → mine seam → dock + pick work.
for (const phrase of [
  'Wake at the beacon',
  'Tether the derelict',
  'Mine the first seam',
  'Dock and pick work',
]) {
  assert.match(newGame, new RegExp(phrase), `route rail must include: ${phrase}`);
}
assert.match(newGame, /One verb at a time/, 'route rail must convey the one-beat-one-verb pacing (spec2/03 §1)');
assert.match(newGame, /choose haul, bounty, or survey/,
  'route rail must connect the dock to the B5 three-offer choice (HAUL/BOUNTY/SURVEY)');
assert.match(newGame, /mining:\s*'Mining'/,
  'starter loadout must label the mining slot as mining, not stale sampling language');
assert.doesNotMatch(newGame, /mining:\s*'Sampler'/,
  'New Game starter loadout must not call the mining slot a sampler');
// Since Task B (design/frontend/direction/tasks/TASK_B_SHELL_AND_HUD.md §1.1) the screen is built on
// the kit: the rail is the last block of the hanging form, before the stage and the Launch foot.
assert.match(newGame, /body\.appendChild\(route\);[\s\S]*const stage = el\('div', 'k-stage'\)/,
  'route rail should sit in the form before the stage so it is seen before Launch');
assert.match(newGame, /body\.appendChild\(route\);[\s\S]*rootEl\.appendChild\(foot\);/,
  'route rail should be built before the Launch foot so it is read before Launch');
assert.match(newGame, /route\.appendChild\(steps\)/, 'route rail steps must be rendered inside the rail');
assert.match(newGame, /steps\.style\.setProperty\('--k-row-cols', 'minmax\(0, 1fr\)'\)/,
  'route rail rows stack in one column so the rail collapses cleanly on narrow viewports');
assert.doesNotMatch(newGame, /probe-only|debug-only|launcher-specific/i,
  'route rail must not describe a debug/probe-only launch path');

console.log('New Game first-run route OK - launch screen teaches the anomaly/mine/dock/job loop before play.');
