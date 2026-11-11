// words-corridor-log-ages — the corridor log tells you how long ago in words.
//
// Player problem: opening the mission log right after an encounter resolved read
// "RESOLVED · 0 s ago", and one tick later "1 s ago" — a stopwatch reading, not words.
// The age is now whole words: "just now" for a stamp from this instant, counted seconds
// in words for the first two minutes (singular included), counted minutes after that.
import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterAgeLabel } from '../src/ui/screens/missionLog.js';

test('a stamp from this instant says just now, never 0 s ago', () => {
  assert.equal(encounterAgeLabel(0), 'just now');
  assert.equal(encounterAgeLabel(0.4), 'just now');
  assert.equal(encounterAgeLabel(-12), 'just now', 'a stamp ahead of the clock still reads fresh, not negative');
  assert.ok(!encounterAgeLabel(0).includes('0 s'), 'no stopwatch zero on a fresh receipt');
});

test('the first two minutes count seconds in whole words, singular included', () => {
  assert.equal(encounterAgeLabel(1), '1 second ago');
  assert.equal(encounterAgeLabel(2), '2 seconds ago');
  assert.equal(encounterAgeLabel(45), '45 seconds ago');
  assert.equal(encounterAgeLabel(119.4), '119 seconds ago');
});

test('past two minutes it counts minutes, singular and plural', () => {
  assert.equal(encounterAgeLabel(120), '2 minutes ago');
  assert.equal(encounterAgeLabel(121), '2 minutes ago');
  assert.equal(encounterAgeLabel(60), '60 seconds ago', 'the last second of the minute still counts in seconds');
  assert.equal(encounterAgeLabel(181), '3 minutes ago');
  assert.equal(encounterAgeLabel(3600), '60 minutes ago');
});

test('a missing or corrupt stamp reads as fresh, never NaN or undefined', () => {
  assert.equal(encounterAgeLabel(NaN), 'just now');
  assert.equal(encounterAgeLabel(undefined), 'just now');
});
