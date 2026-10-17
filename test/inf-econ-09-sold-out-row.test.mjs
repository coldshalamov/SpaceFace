import test from 'node:test';
import assert from 'node:assert/strict';
import { marketStockStatus } from '../src/systems/economy.js';
import { marketRowHtml } from '../src/ui/views/marketPresentation.js';
import { economyScenario, STATION, GOOD } from './helpers/infEconomyScenario.mjs';

test('ECON-09 seed 4242: a bought-out and zero-stock row names restock, then shows stock again', () => {
  const h = economyScenario();
  try {
    const row = () => marketRowHtml({
      id: GOOD, name: 'Iron Ore', stock: h.market[GOOD].stock,
      held: h.state.player.cargo.items[GOOD] || 0,
      ...marketStockStatus(h.state, STATION, GOOD),
    });
    h.market[GOOD].stock = 3;
    assert.equal(h.econ.execute(STATION, GOOD, 'buy', 2).ok, true);
    assert.equal(h.market[GOOD].stock, 1, 'the existing market reserves its final unit');
    assert.match(row(), /SOLD OUT/);
    h.market[GOOD].stock = 0;
    const before = row();
    assert.match(before, /data-cmdty="cmdty_ore_iron"/);
    assert.match(before, /SOLD OUT/);
    assert.match(before, /Restock ~10s/);
    h.state.simTime += 5;
    h.econ.econTick(5, h.state);
    h.state.simTime += 5;
    h.econ.econTick(5, h.state);
    const after = row();
    assert.ok(h.market[GOOD].stock >= 2, 'ordinary stock recovery makes a unit buyable');
    assert.match(after, /data-cmdty="cmdty_ore_iron"/);
    assert.doesNotMatch(after, /SOLD OUT|Restock/);
  } finally { h.sim.dispose(); }
});
