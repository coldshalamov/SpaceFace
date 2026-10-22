// SEED-WL-04 — a returning ace names the weapon that last put the crew down.
// The kill receipt writes lastWeaponId; the return spawn speaks it. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { factions } from '../src/systems/factions.js';
import { aceMemory, aceWeaponMemoryLine } from '../src/systems/aceMemory.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { aceById } from '../src/data/namedAces.js';

const ACE_ID = 'ace_yara_no_cut';
const WEAPON_ID = 'wpn_pulse_laser_s';
const WEAPON_LINE = 'Last time it was the Pulse Laser S.';

test('an unknown weapon id stays silent', () => {
  assert.equal(aceWeaponMemoryLine({ lastWeaponId: 'wpn_does_not_exist' }), null);
  assert.equal(aceWeaponMemoryLine({ lastWeaponId: '' }), null);
  assert.equal(aceWeaponMemoryLine(null), null);
});

test('seed 4242: the return names the weapon from the kill that wrote it', () => {
  const sim = createSimulation({
    seed: 4242,
    systems: [factions, spawnBudget, aceMemory],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const said = [];
  const events = [];
  const aceSystem = sim.registry.get('aceMemory');
  aceSystem.helpers = {
    ...aceSystem.helpers,
    voice: { say(payload) { said.push(payload); return true; } },
  };
  bus.on('aceMemory:voice', (payload) => events.push(payload));

  const ace = aceById(ACE_ID);
  const wing = sim.spawn({
    type: 'ship', team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 40, hull: 40, hullMax: 40,
    data: { namedAceId: ACE_ID, ai: { encounterRole: 'wing', name: 'Wing' } },
  });
  bus.emit('entity:killed', {
    id: wing.id,
    type: 'ship',
    killerId: player.id,
    weaponId: WEAPON_ID,
    presentation: { playerCaused: true, weaponId: WEAPON_ID },
  });
  assert.equal(state.aceMemory[ACE_ID].lastWeaponId, WEAPON_ID);

  bus.emit('encounter:receipt', {
    shape: 'named_hunter',
    outcome: 'escaped',
    encounterId: 'wl04:yara:escape',
    aceId: ACE_ID,
    text: `${ace.name} breaks off and burns dark.`,
    sectorId: state.world.currentSectorId,
    t: state.simTime,
  });
  const rec = state.aceMemory[ACE_ID];
  assert.equal(rec.lastWeaponId, WEAPON_ID, 'fleeing keeps the weapon that landed');
  assert.equal(rec.returnScheduled, true);
  if (state.simTime < rec.returnAt) state.simTime = rec.returnAt + 1;
  sim.runTicks(Math.ceil(0.6 / SIM_DT));

  const spoken = said.filter((row) => row.text === WEAPON_LINE);
  const named = events.filter((row) => row.situation === 'last-weapon');
  assert.equal(spoken.length, 1, 'the return says the weapon once');
  assert.equal(named.length, 1);
  assert.equal(named[0].text, WEAPON_LINE);
});
