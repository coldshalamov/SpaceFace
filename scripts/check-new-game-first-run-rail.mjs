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

assert.match(newGame, /sf-ng-route/, 'New Game must render a first-15-minutes route rail');
assert.match(newGame, /First 15 minutes/, 'route rail must be explicitly labeled for first-session clarity');
for (const phrase of [
  'Follow the anomaly',
  'Mine the marked rock',
  'Dock at Helios',
  'Take one job',
]) {
  assert.match(newGame, new RegExp(phrase), `route rail must include: ${phrase}`);
}
assert.match(newGame, /47-A is already marked/, 'route rail must connect launch to the canonical 47-A opening');
assert.match(newGame, /Mission Board and Bar contracts track into the log/,
  'route rail must connect first launch to tracked mission/cargo work');
assert.match(newGame, /mining:\s*'Mining'/,
  'starter loadout must label the mining slot as mining, not stale sampling language');
assert.doesNotMatch(newGame, /mining:\s*'Sampler'/,
  'New Game starter loadout must not call the mining slot a sampler');
assert.match(newGame, /rootEl\.appendChild\(route\);[\s\S]*const lore = el\('div', 'sf-ng-lore'\)/,
  'route rail should sit before lore/footer so it is seen before Launch');
assert.match(newGame, /rootEl\.appendChild\(route\);[\s\S]*rootEl\.appendChild\(el\('h2', null, 'Starting Ship'\)\)/,
  'route rail should sit above the starter-ship block so it is visible without scrolling');
assert.match(newGame, /@media \(max-width:520px\)[\s\S]*sf-ng-route__steps/,
  'route rail should collapse cleanly on narrow viewports');
assert.doesNotMatch(newGame, /probe-only|debug-only|launcher-specific/i,
  'route rail must not describe a debug/probe-only launch path');

console.log('New Game first-run route OK - launch screen teaches the anomaly/mine/dock/job loop before play.');