#!/usr/bin/env node
// check-new-game-first-run-rail.mjs - guards the New Game first-15-minutes route.
//
// A Steam-demo player should know the first complete loop before launch: rope a rock, throw it,
// dock at Helios, take a job. This keeps that player-facing rail on the default New Game screen
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
// The rail promises the route the game actually runs (demo route 2026-11-23): latch the loose
// rock, throw it, dock at Helios, take a job. Read the rows from the screen's own table and the
// order from the onboarding beat table, so the two cannot drift apart again (the rail used to
// promise "Mine the first seam" before the dock long after the game stopped asking for it).
const railStart = newGame.indexOf('const FIRST_MINUTES = [');
const railSrc = newGame.slice(railStart, newGame.indexOf('\n];', railStart));
const rows = [...railSrc.matchAll(/\['([^']+)',\s*'([^']+)'\]/g)].map((m) => ({ heading: m[1], detail: m[2] }));
assert.equal(rows.length, 4, 'the rail carries four rows');
assert.match(rows[0].heading, /^Latch the loose rock$/, 'row 1 is the first instruction in flight');
assert.match(rows[0].detail, /\bF\b/, 'row 1 names the key the flight line names (F)');
assert.match(rows[0].detail, /One verb at a time/, 'route rail must convey the one-beat-one-verb pacing');
assert.match(rows[1].heading, /^Throw/, 'row 2 is the throw');
assert.match(rows[2].heading, /^Dock at Helios$/, 'row 3 is the first dock');
assert.match(rows[3].heading, /job/i, "row 4 is the first job (the live row follows the hull's own ticket)");
for (const row of rows) {
  assert.doesNotMatch(row.heading + ' ' + row.detail, /seam|Contracts|Right-click/i,
    'rail row must not promise a retired step, tab or key: ' + row.heading);
}
const onboardingSrc = read('src/systems/onboarding.js');
const beatsStart = onboardingSrc.indexOf('export const BEATS = [');
const beatKeys = [...onboardingSrc.slice(beatsStart, onboardingSrc.indexOf('\n];', beatsStart))
  .matchAll(/^\s*key: '([a-z]+)',/gm)].map((m) => m[1]);
assert.deepEqual(beatKeys.slice(0, 2), ['tether', 'berth'],
  'the onboarding route opens with the rope-and-throw then the berth, as the rail promises');
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

console.log('New Game first-run route OK - launch screen teaches the rope/throw/dock/job loop before play, in the order the game asks for it.');
