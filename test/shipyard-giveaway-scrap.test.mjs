// The scrap desk is not a faucet: the yard never pays buyback on a hull it gives away for
// free (the starter Hitch, price 0), while a paid hull still refunds half its price with
// fitted modules returned to inventory. Drive the live ships system headless.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ships as shipsSystem } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

function harness(ownedShips, activeShipIndex) {
  const bus = { log: [], emit(name, payload) { this.log.push({ name, payload }); } };
  const state = {
    player: { credits: 0, moduleInventory: [], ownedShips, activeShipIndex },
    entities: new Map(),
  };
  shipsSystem.state = state;
  shipsSystem.bus = bus;
  shipsSystem.nextInstanceId = () => 1;
  return { bus, state };
}

test('the free starter cannot be scrapped for credits — the giveaway is not a faucet', () => {
  const starter = SHIPS.find((s) => s.id === 'ship_kestrel');
  assert.equal(starter.price, 0, 'sanity: the Hitch is the giveaway hull');
  assert.ok(starter.buyback > 0, 'sanity: it still carries an insurance value');
  const { bus, state } = harness(
    [
      { defId: 'ship_kestrel', fittings: [null, null] },
      { defId: 'ship_wasp', fittings: [null] },
    ],
    1,
  );
  assert.equal(shipsSystem.sellShip(0), false, 'selling the spare starter is refused');
  assert.equal(state.player.ownedShips.length, 2, 'the hull stays in the shed');
  assert.ok(bus.log.some((r) => r.name === 'toast' && /giveaway hulls/.test(r.payload.text)),
    'the yard says why');
  assert.ok(!bus.log.some((r) => r.name === 'economy:grantCredits'), 'no credits were minted');
});

test('a paid hull still sells: half-price refund, fittings returned to inventory', () => {
  const { bus, state } = harness(
    [
      { defId: 'ship_wasp', fittings: [null] },
      { defId: 'ship_pelican', fittings: ['wpn_pulse_laser_s'] },
    ],
    0,
  );
  assert.equal(shipsSystem.sellShip(1), true);
  assert.equal(state.player.ownedShips.length, 1);
  const pelican = SHIPS.find((s) => s.id === 'ship_pelican');
  const grant = bus.log.find((r) => r.name === 'economy:grantCredits');
  assert.equal(grant.payload.amount, Math.floor(pelican.price * 0.5));
  assert.equal(state.player.moduleInventory.length, 1, 'fitted module comes back to inventory');
});

test('capital hull list prices are the derived saving-minutes wages, not the old canyon', () => {
  const byId = new Map(SHIPS.map((s) => [s.id, s]));
  const t3Max = Math.max(...SHIPS.filter((s) => s.tier <= 3).map((s) => s.price));
  assert.ok(byId.get('ship_warden').price > t3Max, 'ladder does not invert at T3');
  assert.ok(byId.get('ship_leviathan').price < 1000000, 'flagship program is reachable');
});
