// Pause names the last thing that hit you, from the combat receipt already on state.
// Seed 4242. No hit stays quiet. A gun hit names the gun. A later shove replaces it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { appendCombatTrace } from '../src/combat/trace.js';
import { pauseStatusLines } from '../src/ui/screens/pause.js';

const SEED = 4242;
const PLAYER = 7;

function quietState() {
  return {
    meta: { seed: SEED },
    playerId: PLAYER,
    simTime: 12,
    tick: 12,
    combat: {},
    missions: { active: [] },
    save: {},
    player: { activeShipIndex: 0, ownedShips: [{ livingHull: { scars: [] } }] },
  };
}

test('pause line names the latest hit and drops the one it replaced', () => {
  const state = quietState();
  const before = pauseStatusLines(state);
  assert.equal(before.hit, '');
  assert.equal(before.objective, 'NO ACTIVE CONTRACT');

  appendCombatTrace(state.combat, 10, 'damage.routed', {
    actorId: 2,
    targetId: PLAYER,
    origin: { kind: 'weapon', id: 'wpn_pulse_laser_s', weaponId: 'wpn_pulse_laser_s' },
  });
  // A gun's own impulse row lands after the damage row. It is still the gun.
  appendCombatTrace(state.combat, 10, 'physics.impulse', {
    actorId: 2,
    targetId: PLAYER,
    reason: 'weapon_hit',
    provenance: 'starter_pulse_plink',
    weaponId: 'wpn_pulse_laser_s',
  });
  const gunned = pauseStatusLines(state);
  assert.equal(gunned.hit, 'A gun hit you.');
  assert.equal(gunned.objective, before.objective);
  assert.equal(gunned.next, before.next);
  assert.equal(gunned.save, before.save);

  appendCombatTrace(state.combat, 24, 'damage.routed', {
    actorId: 9,
    targetId: PLAYER,
    origin: { kind: 'impulse_charge', id: 'charge' },
  });
  const shoved = pauseStatusLines(state);
  assert.equal(shoved.hit, 'A shove hit you.');
  assert.equal(shoved.hit.includes('gun'), false);
  assert.equal(shoved.objective, before.objective);
  assert.equal(shoved.next, before.next);
  assert.equal(shoved.save, before.save);

  state.player.ownedShips[0].livingHull.scars.push({
    id: 'slam:40:bow',
    cause: 'slam',
    surface: 'terrain',
    band: 'heavy',
    facing: 'bow',
    tick: 40,
    atT: 40,
    patchedAtT: null,
  });
  assert.equal(pauseStatusLines(state).hit, 'A rock hit you.');

  state.player.ownedShips[0].livingHull.scars.push({
    id: 'slam:48:stern',
    cause: 'slam',
    surface: 'craft',
    band: 'hard',
    facing: 'stern',
    tick: 48,
    atT: 48,
    patchedAtT: null,
  });
  assert.equal(pauseStatusLines(state).hit, 'A slam hit you.');
  assert.equal(state.meta.seed, SEED);
});
