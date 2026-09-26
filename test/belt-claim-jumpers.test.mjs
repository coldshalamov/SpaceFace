// The Ceres claim-jump is a miner still cutting, with its own words, and it does not
// travel to any other sector.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';

test('belt claim jumpers are a Ceres miner under two Wasps, with their own words', () => {
  const enc = ENCOUNTERS.belt_claim_jumpers;
  assert.ok(enc, 'belt_claim_jumpers is in the live catalog');
  assert.deepEqual(enc.gates.sectorIds, ['sector_ceres_belt']);
  assert.equal(enc.shape.situation, 'claim');
  assert.equal(enc.claimVictim.archetype, 'mule_trader');
  assert.match(enc.telegraph, /miner/i);
  assert.match(enc.receipts.cleared, /miner/i);
  assert.notEqual(enc.telegraph, 'ambush_tele');

  const said = [];
  const spawned = [];
  const d = {
    now() { return 0; },
    spawnShips(_live, ships) {
      spawned.push(ships);
      return ships.map((_ship, i) => i + 1);
    },
    abort() { throw new Error('abort'); },
    say(_live, _channel, text, _vars, opts) { said.push({ text, literal: !!(opts && opts.literal) }); },
    setPassive() {},
    playerNearZone() { return false },
    cargoValue() { return 0 },
  };
  const live = {
    shapeId: 'belt_claim_jumpers',
    shape: enc,
    plan: { ships: [{ archetype: 'wasp_swarmer', level: 2, pos: { x: 10, z: 20 }, role: 'squad' }] },
    data: {},
    anchor: { x: 0, z: 0 },
    ids: [],
    roles: {},
  };
  ENCOUNTER_SCRIPTS.ambush.fire(d, live, { entities: new Map() });
  const victim = spawned.flat().find((ship) => ship.role === 'claim');
  assert.ok(victim, 'a miner spawns with the jumpers');
  assert.equal(victim.archetype, 'mule_trader');
  assert.equal(victim.team, 2);
  assert.equal(victim.passive, true);
  assert.ok(said.some((row) => row.literal && /miner/i.test(row.text)), 'the opening line names the miner');
  assert.ok(!said.some((row) => row.text === 'ambush_tele'), 'the stock ambush bark is not the line');
});
