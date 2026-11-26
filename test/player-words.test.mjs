import test from 'node:test';
import assert from 'node:assert/strict';
import { BANNED_PLAYER_WORDS, findBannedPlayerWords } from '../scripts/lib/playerWords.mjs';

test('the words seen on screen at review time are caught', () => {
  const seen = [
    'BAY SCREEN · Shift Office',
    'STATION WIRE · Local Wire',
    'PL Pulse · ? unknown',
    'Your position (0, 0) m · Heading W',
    'IGNITION 14 · MIXED +2',
    'TOO HEAVY',
    'Swarm the Crucible',
  ].join('\n');
  const words = findBannedPlayerWords(seen).map(hit => hit.word);
  for (const expected of ['Bay screen', 'Station wire', '? unknown', 'map coordinates',
    'IGNITION / FLARE / NOVA', 'MIXED / TERRAIN / DIRECT +n', 'TOO HEAVY', 'Crucible']) {
    assert.ok(words.includes(expected), `expected "${expected}" to be caught in: ${words.join(', ')}`);
  }
});

test('plain player copy passes', () => {
  const clean = [
    'Helios Station — market, fuel, repairs — 1.1 k away',
    'Pick one · 2 picks waiting · Re-roll 150 Scrap',
    'Reaver Corsair killed you on round 6 from astern with its Heavy Autocannon.',
    'In the aftermath of the raid, the yard is quiet.', // lower-case prose is English, not the card label
    'Unbind a key in Settings to free it.',
    'Hull 86% · Fuel 100% · Hold 0/250',
  ].join('\n');
  assert.deepEqual(findBannedPlayerWords(clean), []);
});

test('every entry names why it is banned', () => {
  for (const entry of BANNED_PLAYER_WORDS) {
    assert.ok(entry.word && entry.why && entry.re instanceof RegExp, JSON.stringify(entry.word));
  }
});
