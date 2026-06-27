#!/usr/bin/env node
// check-new-game-first-run-rail.mjs - guards the New Game first-15-minutes player route.
//
// A Steam-demo player should know the first complete loop before launch: follow nav, mine, dock,
// then take a tracked job. This check keeps that player-facing rail on the default New Game screen
// instead of drifting into docs, probes, or a launcher-specific path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const newGame = read('src/ui/screens/newGame.js');

assert.match(newGame, /sf-ng-route/, 'New Game must render a first-15-minutes route rail');
assert.match(newGame, /First 15 minutes/, 'route rail must be explicitly labeled for demo clarity');
for (const phrase of [
  'Follow the anomaly',
  'Mine the marked rock',
  'Dock at Helios',
  'Take one job',
]) {
  assert.match(newGame, new RegExp(phrase), `route rail must include: ${phrase}`);
}
assert.match(newGame, /Mission Board and Bar contracts auto-track into the log/,
  'route rail must connect first launch to tracked mission/cargo work');
assert.match(newGame, /rootEl\.appendChild\(route\);[\s\S]*const lore = el\('div', 'sf-ng-lore'\)/,
  'route rail should sit before lore/footer so it is seen before Launch');
assert.doesNotMatch(newGame, /probe-only|debug-only|launcher-specific/i,
  'route rail must not describe a debug/probe-only launch path');

console.log('New Game first-run route OK - launch screen teaches the first mine/dock/job loop before play.');
