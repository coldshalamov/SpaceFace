import test from 'node:test';
import assert from 'node:assert/strict';
import {
  targetDisplayName,
  targetIntelReadout,
  targetRangeBand,
} from '../src/ui/targetPanel.js';

function player() {
  return {
    id: 'player', team: 1,
    data: { weapons: [{ range: 1000 }] },
  };
}

test('unnamed hulls receive useful identity instead of repeated generic Ship labels', () => {
  assert.equal(targetDisplayName({ type: 'ship', data: { role: 'patrol' } }), 'Unidentified');
  assert.equal(targetDisplayName({ type: 'ship', data: { callsign: 'CUTLASS' } }), 'CUTLASS');
  assert.equal(targetDisplayName({ type: 'drone', data: { callsign: 'SCREEN-2' } }), 'SCREEN-2');
});

test('range band reflects the player weapon envelope', () => {
  const p = player();
  assert.equal(targetRangeBand(300, p), 'CLOSE');
  assert.equal(targetRangeBand(800, p), 'IN RANGE');
  assert.equal(targetRangeBand(1400, p), 'APPROACH');
  assert.equal(targetRangeBand(2000, p), 'DISTANT');
});

test('tactical readout separates intent, motive, range and threat', () => {
  const p = player();
  const state = { playerId: p.id, world: { currentSectorId: 'sector_helios_prime' } };
  const hostile = {
    id: 'raider', type: 'ship', alive: true, team: 3, mass: 420,
    data: { ai: { forcePlayerTarget: true, motive: 'cargo_extortion' }, role: 'pirate' },
  };
  const intel = targetIntelReadout(hostile, p, state, 800);
  assert.equal(intel.hostile, true);
  assert.equal(intel.intent, 'HOSTILE');
  assert.equal(intel.motive, 'ROBBERY');
  assert.equal(intel.rangeBand, 'IN RANGE');
  assert.ok(intel.threatTier >= 1);
  assert.match(intel.threatPips, /▰/);

  const ally = {
    id: 'escort', type: 'ship', alive: true, team: 1, mass: 180,
    data: { ai: {}, role: 'escort' },
  };
  const friendly = targetIntelReadout(ally, p, state, 600);
  assert.equal(friendly.allied, true);
  assert.equal(friendly.intent, 'ALLY');
  assert.equal(friendly.motive, 'SUPPORT');
});
