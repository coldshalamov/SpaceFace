// Restore-path correctness: a valid save must never be refused or silently downgraded.
//  - a null/blank reference in retained evidence is not an alias identity (no false ambiguity)
//  - a conflicting station snapshot degrades to a refusal, never a throw out of loadEnvelope
//  - boost-regen upgrades (efficiencyMods.energyRegenMult) survive a restore
//  - a hull whose weapon list is empty is a coherent hull, not corrupt garbage
//  - an empty ownedShips roster still gets the rest of the player record normalized
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { createCatalogStationRestore } from '../src/save/catalogStationRestore.js';

const sectorId = 'sector_ceres_belt', stationId = 'station_ceres';
function station(id) {
  return { id, type: 'station', alive: true, pos: { x: 1, z: 2 }, hull: 1e6, hullMax: 1e6,
    flags: { persistent: true }, homeSectorId: sectorId,
    data: { stationId, sectorId, homeSectorId: sectorId } };
}

test('null references in retained evidence do not fabricate a station alias collision', () => {
  const data = { stunts: { evidence: { lives: [
    { id: 'a', targetId: null, entityId: 604 },
    { id: 'b', actorId: undefined, senderId: '', entityId: null },
  ] } } };
  // Aliases {603, 604}: only 604 is referenced; null/blank references name nobody.
  assert.equal(createCatalogStationRestore([station(603), station(604)], data).size, 1);
  // An id-less alias row mints no phantom "null" identity for those references.
  const idless = station(0); idless.id = null;
  const nullData = { stunts: { lives: [{ targetId: null, entityId: 603 }] } };
  assert.equal(createCatalogStationRestore([station(603), idless], nullData).size, 1);
});

function runtime(t) {
  const sim = createSimulation({ seed: 4121, systems: [world, save], updateOrder: [] });
  t.after(() => sim.dispose());
  const saver = sim.registry.get('save');
  const player = sim.spawn({ type: 'ship', isPlayer: true, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' } });
  sim.state.playerId = player.id;
  return { sim, saver, state: sim.state };
}
function envelopeOf(saver, label) {
  const env = saver.serialize(label);
  delete env.checksum;
  return env;
}

test('a conflicting station save is refused without throwing, outgoing run intact', t => {
  const { sim, saver, state } = runtime(t);
  const env = envelopeOf(saver, 'conflict');
  const conflict = station(604); conflict.hull--;
  env.data.entities.persistent = [station(603), conflict];
  const before = [...state.entityList];
  let result;
  assert.doesNotThrow(() => { result = saver.loadEnvelope(env); });
  assert.equal(result, false);
  assert.deepEqual(state.entityList, before);
  assert.equal(saver._restoring, false);
  void sim;
});

test('a save carrying a null-referencing station alias pair restores instead of locking the player out', t => {
  const { saver, state } = runtime(t);
  const env = envelopeOf(saver, 'null-alias');
  env.data.entities.persistent = [station(603), station(604)];
  env.data.stunts = { revision: 2, mode: 'adventure', evidence: { revision: 2, sequence: 1,
    lives: [['number:604', { id: 'only-life', entityId: 604, targetId: null }]] } };
  let result;
  assert.doesNotThrow(() => { result = saver.loadEnvelope(env); });
  assert.notEqual(result, false);
  void state;
});

test('boost-regen upgrades survive restore and a weaponless hull restores its damage state', t => {
  const { saver, state } = runtime(t);
  // Baseline: the same save with no upgrade.
  const plain = envelopeOf(saver, 'boost-base');
  assert.notEqual(saver.loadEnvelope(plain), false);
  const baseRegen = state.entities.get(state.playerId).boost.regenRate;
  assert.ok(baseRegen > 0);

  const env = envelopeOf(saver, 'boost');
  env.data.player.efficiencyMods = { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1.5, cargoCapMult: 1, tradeFeeMult: 1 };
  const saved = env.data.entities.player;
  saved.data.weapons = [];                     // weaponless hull
  saved.hullMax = 100; saved.hull = 25;        // damaged: must not be "repaired" to full
  assert.notEqual(saver.loadEnvelope(env), false);
  const live = state.entities.get(state.playerId);
  assert.ok(live.boost.regenRate > baseRegen * 1.4, `boost regen ${live.boost.regenRate} keeps the 1.5x upgrade (base ${baseRegen})`);
  assert.equal(live.hull, 25, 'a weaponless hull keeps its saved hull instead of being reset as garbage');
});

test('an empty ownedShips roster still normalizes the rest of the player record', t => {
  const { saver, state } = runtime(t);
  const env = envelopeOf(saver, 'empty-roster');
  const p = env.data.player;
  p.ownedShips = [];
  p.salvageRights = -7.9;
  p.efficiencyMods = 'garbage';
  delete p.moduleInventory; delete p.researchedNodes;
  p.defeatStreak = { count: 3 }; // no timestamp: fails closed
  assert.notEqual(saver.loadEnvelope(env), false);
  const live = state.player;
  assert.ok(live.salvageRights >= 0);
  assert.equal(live.defeatStreak, undefined);
  assert.ok(Array.isArray(live.moduleInventory));
  assert.ok(Array.isArray(live.researchedNodes));
  assert.equal(typeof live.efficiencyMods, 'object');
  assert.equal(live.efficiencyMods.energyRegenMult, 1);
});
