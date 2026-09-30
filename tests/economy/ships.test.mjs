// The capital hull ladder follows the economy model's saving-minutes grammar (license tech is
// the door, hull is the room) and the ladder stays monotonic against the hand-authored T0-T3
// prices. Pure data: the yard behavior (giveaway scrap refusal) lives in
// test/shipyard-giveaway-scrap.test.mjs, outside the economy component fixture.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ECONOMY_BALANCE as B } from '../../src/data/economyDerived.js';
import { deriveEconomyTables, ECONOMY_MODEL } from '../../src/economy/economyModel.js';
import { SHIPS } from '../../src/data/ships.js';

test('capital hull list prices are the derived saving-minutes wages, exactly recomputable', () => {
  assert.deepEqual(B.ships, deriveEconomyTables().ships);
  assert.deepEqual(Object.keys(B.ships).sort(), ['ship_colossus', 'ship_leviathan', 'ship_warden'],
    'exactly the three capitals derive; T0-T3 stay hand-authored');
  for (const def of SHIPS) {
    const row = B.ships[def.id];
    if (!row) continue;
    assert.equal(def.price, row.credits, `${def.id} catalog price is the derived value`);
    const phase = ECONOMY_MODEL.phases[row.tier];
    assert.equal(row.credits, Math.round(phase.netCrPerHour * row.savingMinutes / 60),
      `${def.id} credits = phase wage x saving minutes`);
    const license = { ship_warden: 'tech_capital_weapons', ship_colossus: 'tech_capital_hulls', ship_leviathan: 'tech_flagship_command' }[def.id];
    assert.ok(row.credits > B.tech[license].credits, `${def.id} hull costs more than its license`);
  }
});

test('the capital canyon closes without inverting the hand ladder', () => {
  const byId = new Map(SHIPS.map((s) => [s.id, s]));
  const t3Max = Math.max(...SHIPS.filter((s) => s.tier <= 3).map((s) => s.price));
  const warden = byId.get('ship_warden').price;
  const colossus = byId.get('ship_colossus').price;
  const leviathan = byId.get('ship_leviathan').price;
  assert.ok(t3Max < warden, `T3 top (${t3Max}) stays under the Warden (${warden})`);
  assert.ok(warden < colossus && colossus < leviathan, 'capitals stay ordered');
  for (const [id, row] of Object.entries(B.ships)) {
    const hours = row.savingMinutes / 60;
    assert.ok(hours >= 6 && hours <= 10.5, `${id} sits in the authored band (${hours.toFixed(1)}h)`);
  }
  assert.ok(leviathan < 1000000, 'the flagship program is no longer a 4.5M museum piece');
});
