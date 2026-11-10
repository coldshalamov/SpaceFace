import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { planSiteKit, planSiteVisit } from '../src/systems/siteIndustryPlanner.js';

function freshEconomy(check) {
  const sim = createSimulation({ seed: 47, systems: [economy], updateOrder: [] });
  try {
    const owner = sim.registry.get('economy');
    owner.grantCredits(NEW_GAME.credits, 'test:new-game');
    sim.state.player.cargo.capVolume = NEW_GAME.cargoCapacity;
    return check(owner, sim.state);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
}

test('a fresh Helios market sells the whole first claim through normal quotes and transactions', () => {
  freshEconomy((owner, state) => {
    const manifest = planSiteKit('first_claim').manifest;
    const market = owner.ensureMarket('station_helios');
    let spent = 0;
    for (const [good, qty] of Object.entries(manifest)) {
      assert.ok(market[good]?.stock >= qty + 1, `${good}: already stocked before the first quote`);
      const stock = market[good].stock;
      const quote = owner.quote('station_helios', good, 'buy', qty);
      assert.equal(quote.ok, true, `${good}: ${quote.reason}`);
      assert.equal(quote.qty, qty);
      const result = owner.execute('station_helios', good, 'buy', qty, { expectedTotal: quote.total });
      assert.equal(result.ok, true, `${good}: ${result.reason}`);
      assert.equal(result.qty, qty);
      assert.equal(state.player.cargo.items[good], qty);
      assert.equal(market[good].stock, stock - qty);
      spent += result.total;
    }
    assert.equal(state.player.credits, NEW_GAME.credits - spent);
    assert.ok(spent > 0 && state.player.credits > 0, 'the starter can afford the kit and keep a reserve');
    assert.ok(planSiteVisit('first_claim', { cargo: state.player.cargo.items }).ready);
  });
});

test('starter construction supply does not remove regional tier gates', () => {
  freshEconomy((owner) => {
    assert.equal(owner.quote('station_coalition', 'cmdty_control_unit', 'buy', 1).reason, 'tier_unavailable');
    assert.equal(owner.quote('station_helios', 'cmdty_ore_titanium', 'buy', 1).reason, 'tier_unavailable');
    // Art already has a Helios produce recipe, but tier-three goods still do not seed there.
    assert.equal(owner.quote('station_helios', 'cmdty_art', 'buy', 1).reason, 'tier_unavailable');
  });
});

test('the construction kit preserves the starter market’s existing authored supplies', () => {
  freshEconomy((owner) => {
    for (const good of ['cmdty_food', 'cmdty_luxury_goods', 'cmdty_impulse_charge']) {
      const quote = owner.quote('station_helios', good, 'buy', 1);
      assert.equal(quote.ok, true, `${good}: ${quote.reason}`);
    }
  });
});
