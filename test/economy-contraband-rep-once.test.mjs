import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { addCargo, cashInSalvage } from '../src/systems/cargo.js';
import { economy as economyBase } from '../src/systems/economy.js';
import { factions as factionsBase } from '../src/systems/factions.js';

function bootScan() {
  const bus = createBus();
  const state = {
    meta: { seed: 1 },
    simTime: 10,
    playerId: 1,
    player: {
      credits: 5000,
      debt: 0,
      bounty: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
      stats: {},
    },
    factions: {},
    conflicts: {},
    entities: new Map(),
    world: { currentSectorId: 'sector_helios_prime' },
    economy: { markets: {}, cycles: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
  };
  addCargo(state, 'cmdty_narcotics', 1);
  const economySys = { ...economyBase };
  const factionsSys = { ...factionsBase };
  economySys.init({ state, bus, helpers: {}, registry: null });
  factionsSys.init({ state, bus, helpers: {}, registry: null });
  factionsSys.newGame();
  economySys._rng = () => 0;
  return { state, bus, economySys, factionsSys };
}

test('a contraband bust applies the factions standing hit once, not stacked with a second economy delta', () => {
  const { state, bus, economySys } = bootScan();
  const reasons = [];
  bus.on('faction:repChanged', (p) => {
    if (p.factionId === 'faction_scn') reasons.push(p.reason);
  });

  const before = state.factions.faction_scn.rep;
  const result = economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  assert.equal(result.found, true);
  assert.equal(state.player.cargo.items.cmdty_narcotics, undefined);

  const after = state.factions.faction_scn.rep;
  assert.equal(after - before, -40, 'spec caught_contraband is -40 on the first strike');
  assert.deepEqual(reasons, ['contraband']);
  assert.equal(state.factions.faction_scn.knownContrabandStrikes, 1);

  addCargo(state, 'cmdty_narcotics', 1);
  economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  assert.equal(state.factions.faction_scn.rep - after, -60, 'second strike is 1.5× the base hit, not a stacked pair');
  assert.equal(state.factions.faction_scn.knownContrabandStrikes, 2);
});

test('external salvage keeps illicit custody and uses the real scan, cloak, fine and debt rules', () => {
  const { state, economySys } = bootScan();
  state.player.cargo.items = {};
  state.player.credits = 0;
  state.player.salvageBay = { items: { cmdty_stolen_goods: 2, cmdty_ore_iron: 1 }, usedVolume: 3 };
  const sale = cashInSalvage(state);
  assert.equal(sale.units, 1, 'ordinary docks sell only legal scrap');
  assert.equal(state.player.salvageBay.items.cmdty_stolen_goods, 2);
  assert.equal(state.player.salvageBay.usedVolume, 2);
  economySys._rng = () => 1;
  const evaded = economySys.runScan({ security: 0, scannerCloak: 1, factionId: 'faction_scn' });
  assert.equal(evaded.evaded, true);
  assert.equal(state.player.salvageBay.items.cmdty_stolen_goods, 2, 'an evasion preserves custody');
  economySys._rng = () => 0;
  const caught = economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  assert.equal(caught.found, true);
  assert.deepEqual(caught.confiscated, [{ commodityId: 'cmdty_stolen_goods', qty: 2 }]);
  assert.equal(state.player.salvageBay.usedVolume, 0);
  assert.ok(state.player.debt > 0, 'a broke wallet owes the actual customs fine');
  assert.ok(state.player.bounty > 0);
  state.player.salvageBay = { items: { cmdty_stolen_goods: 1 }, usedVolume: 1 };
  assert.equal(cashInSalvage(state, { includeIllicit: true }).units, 1, 'black-market sale may release the lot');
});
