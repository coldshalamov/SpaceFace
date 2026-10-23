// Rows 474 (RC-GLASS) and 494 (CRAFT-GLASS / D240): the breathing glass and its three tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitReceipt, dangerQuietArmed, DANGER_QUIET_ARM, DANGER_QUIET_RELEASE,
  GLASS_PRESETS, glassPresetFor, bingoFuelLine, sortieTallyLine,
  tetherRingRead, releaseReadReceipt, flightGlassNever,
} from '../src/ui/hudAttention.js';
import { createGameState } from '../src/core/gameState.js';

test('danger-quiet arms at <=20% hull and releases at >=30%', () => {
  assert.equal(DANGER_QUIET_ARM, 0.20);
  assert.equal(DANGER_QUIET_RELEASE, 0.30);
  assert.equal(dangerQuietArmed(0.19, false), true);
  assert.equal(dangerQuietArmed(0.25, true), true, 'hysteresis holds quiet through 30%');
  assert.equal(dangerQuietArmed(0.31, true), false, 'releases once hull climbs past 30%');
  assert.equal(dangerQuietArmed(0.5, false), false);
});

test('glass presets: clean/hauler/fighter, persisted through settings', () => {
  assert.deepEqual(Object.keys(GLASS_PRESETS).sort(), ['clean', 'fighter', 'hauler']);
  assert.equal(glassPresetFor('hauler').id, 'hauler');
  assert.equal(glassPresetFor('nope').id, 'clean');
  const s = createGameState();
  assert.equal(s.settings.glassPreset, 'clean', 'preset default survives reload via settings');
});

test('bingo fuel + sortie tally + release read + tether ring', () => {
  assert.equal(bingoFuelLine(0.5), '');
  assert.match(bingoFuelLine(0.04), /^BINGO FUEL/);
  assert.match(sortieTallyLine({ kills: 3, rocks: 2, credits: 40 }), /SORTIE — 3 kills · 2 rocks · 40 cr/);
  assert.equal(sortieTallyLine({}), '');
  const read = tetherRingRead({ load: 0.7, strain: 0.4 });
  assert.equal(read.load, 0.7);
  assert.equal(read.hot, true);
  assert.equal(releaseReadReceipt({ tonnageU: 42, load: 0.7, strain: 0.5 }), 'Line released: 42 t, load 70%, strain 50%');
});

test('three tiers: flight glass never shows legends/authority/jurisdiction/debug (D240)', () => {
  assert.equal(flightGlassNever('legend', 'red = hostile'), true);
  assert.equal(flightGlassNever('authority', 'PATROL ACK'), true);
  assert.equal(flightGlassNever('jurisdiction', 'helios law'), true);
  assert.equal(flightGlassNever('info', 'Reach·Fighter·L1 … VULN E— K— X—'), true);
  assert.equal(flightGlassNever('info', 'ORE HOLD FULL'), false);
  // Ordinary receipts use middot separators too — without a stat tail they must still admit.
  assert.equal(flightGlassNever('info', '920 cr payout · no bond · 5 min'), false);
  assert.equal(flightGlassNever('info', 'delivered 6u silicate · Ceres Port · 1,420 cr on the receipt'), false);
  // A level token in spaced-separator prose is not a debug stat string.
  assert.equal(flightGlassNever('info', 'Refit complete · L2 engine fitted'), false);
  assert.equal(flightGlassNever('info', 'Refit complete · SL2 engine fitted'), false);
  assert.equal(flightGlassNever('info', 'Refit complete · Level 3 engine fitted'), false);
  // …but the compact unspaced stat shape still is.
  assert.equal(flightGlassNever('info', 'Reach·Fighter·L1'), true);
  assert.equal(admitReceipt({ text: 'some line', kind: 'jurisdiction' }).admit, false);
  assert.equal(admitReceipt({ text: 'Reach·Fighter·L1', kind: 'info' }).admit, false);
  assert.equal(admitReceipt({ text: 'ORE HOLD FULL', kind: 'info' }).admit, true);
});
