/**
 * U1 — fitted tractor magnet range on the ordinary mining scoop path.
 * Drives getDerivedStats + playerPickupMagnetRange (shipped seams), not a reimplementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import { MAGNET_RANGE, playerPickupMagnetRange } from '../src/systems/mining.js';
import { MODULES } from '../src/data/modules.js';

const TRACTOR = MODULES.find((m) => m.id === 'mod_tractor_beam_m');
const TIDELINE = MODULES.find((m) => m.id === 'unique_tideline_tractor');

test('U1: Tractor Beam M folds magnetRange into derived stats above scoop floor', () => {
  assert.ok(TRACTOR, 'mod_tractor_beam_m exists');
  assert.ok(TRACTOR.mods.magnetRange > MAGNET_RANGE,
    `tractor magnet (${TRACTOR.mods.magnetRange}) must beat floor ${MAGNET_RANGE}`);
  const derived = getDerivedStats('ship_kestrel', ['mod_tractor_beam_m']);
  assert.equal(derived.magnetRange, TRACTOR.mods.magnetRange,
    'derived.magnetRange must carry fitted tractor radius');
});

test('U1: Tideline tractor outranges standard tractor via max-wins', () => {
  assert.ok(TIDELINE);
  assert.ok(TIDELINE.mods.magnetRange > TRACTOR.mods.magnetRange);
  const derived = getDerivedStats('ship_kestrel', ['mod_tractor_beam_m', 'unique_tideline_tractor']);
  assert.equal(derived.magnetRange, TIDELINE.mods.magnetRange, 'strongest fitted magnet wins');
});

test('U1: playerPickupMagnetRange uses fitted tractor above floor', () => {
  const bare = {
    playerId: 'p',
    player: { magnetRange: 250 },
    entities: new Map([['p', { id: 'p', data: { fittings: [] } }]]),
  };
  assert.equal(playerPickupMagnetRange(bare), MAGNET_RANGE,
    'no fittings → mining floor (not the dead 250 knobs alone below floor)');

  const fitted = {
    playerId: 'p',
    player: { magnetRange: 250 },
    entities: new Map([['p', {
      id: 'p',
      data: {
        fittings: ['mod_tractor_beam_m'],
        derived: { magnetRange: TRACTOR.mods.magnetRange },
      },
    }]]),
  };
  assert.equal(playerPickupMagnetRange(fitted), TRACTOR.mods.magnetRange,
    'fitted tractor must extend ore magnet beyond the floor');

  const tideline = {
    playerId: 'p',
    player: { magnetRange: 250 },
    entities: new Map([['p', {
      id: 'p',
      data: {
        fittings: ['unique_tideline_tractor'],
        derived: { magnetRange: TIDELINE.mods.magnetRange },
      },
    }]]),
  };
  assert.equal(playerPickupMagnetRange(tideline), TIDELINE.mods.magnetRange);
});

test('U1: bare fittings still honor MAGNET_RANGE floor over weak player knob', () => {
  const state = {
    playerId: 'p',
    player: { magnetRange: 100 },
    entities: new Map([['p', { id: 'p', data: { fittings: [] } }]]),
  };
  assert.equal(playerPickupMagnetRange(state), MAGNET_RANGE);
});
