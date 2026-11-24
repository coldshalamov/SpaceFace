// OVH-08b / W2-1 — heat you can read: 0.6 amber threshold, per-gun lock detection,
// per-gun lock audio clack, and combat readout cooling state.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { HEAT_AMBER_BAND, weaponHeatSummary } from '../src/ui/weaponHeat.js';
import { resolveDryFireReadiness } from '../src/audio/audioSystem.js';
import { crucibleCombatLines } from '../src/ui/crucibleCombatReadout.js';

test('OVH-08b: weaponHeatSummary exposes the 0.6 amber band and per-mount _lockUntil state', () => {
  assert.equal(HEAT_AMBER_BAND, 0.6);

  const cool = weaponHeatSummary([{ defId: 'wpn_pulse_laser_s', _heat: 40, heatMax: 100 }], null, 10);
  assert.equal(cool.amber, false);
  assert.equal(cool.locked, false);

  const amber = weaponHeatSummary([{ defId: 'wpn_pulse_laser_s', _heat: 60, heatMax: 100 }], null, 10);
  assert.equal(amber.amber, true, '0.6 matches FEATHER_BAND in weapons.js');
  assert.equal(amber.locked, false);

  const locked = weaponHeatSummary([
    { defId: 'wpn_pulse_laser_s', _heat: 20, heatMax: 100, _lockUntil: 0 },
    { defId: 'wpn_autocannon_m', _heat: 72, heatMax: 100, _lockUntil: 11.2 },
  ], null, 10.4);
  assert.equal(locked.locked, true);
  assert.equal(locked.overheated, true);
  assert.equal(locked.lockedWeaponId, 'wpn_autocannon_m');
  assert.ok(Math.abs(locked.lockRemainingS - 0.8) < 1e-6);
});

test('OVH-08b: crucibleCombatLines treats a per-gun _lockUntil mount as cooling, not armed', () => {
  const lockedState = {
    simTime: 25.0,
    playerId: 1,
    run: { kind: 'survival', phase: 'active' },
    player: {
      activeShipIndex: 0,
      ownedShips: [{ fittings: ['wpn_pulse_laser_s', 'mod_bank_shot'] }],
    },
    entities: new Map([[1, {
      id: 1,
      alive: true,
      cap: 100,
      data: {
        weapons: [{ defId: 'wpn_pulse_laser_s', _cooldown: 0, _heat: 80, heatMax: 100, _lockUntil: 25.9 }],
        derived: { cap: 100 },
      },
    }]]),
  };
  const out = crucibleCombatLines(lockedState);
  const bankRow = out.find((r) => r.id === 'mod_bank_shot');
  assert.ok(bankRow, 'bank-shot readiness row must appear for a projectile gun');
  assert.equal(bankRow.status, 'cooldown');
  assert.match(bankRow.text, /cooling$/);
});

test('OVH-08b: resolveDryFireReadiness clacks during per-gun _lockUntil', () => {
  const player = {
    cap: 100,
    data: {
      weapons: [{ defId: 'wpn_pulse_laser_s', energyCost: 1, _cooldown: 0, _heat: 50, heatMax: 100, _lockUntil: 12.2 }],
      combat: {},
    },
  };
  assert.equal(resolveDryFireReadiness(player, { simTime: 11.5 }).clack, true);
  assert.equal(resolveDryFireReadiness(player, { simTime: 12.5 }).clack, false);
});

test('OVH-08b: flightCluster amber threshold is 0.6 and hud.js names per-gun lock alerts', () => {
  const clusterSrc = readFileSync(new URL('../src/ui/orrery/flightCluster.js', import.meta.url), 'utf8');
  assert.match(clusterSrc, /heatF >= 0\.6 \? 'hand' : 'hi'/);
  assert.doesNotMatch(clusterSrc, /heatF > 0\.75/);

  const hudSrc = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hudSrc, /p\.perGun && p\.weaponId/);
  assert.match(hudSrc, /LOCKED/);
});
