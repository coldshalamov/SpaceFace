// FB-062 — the shipyard is a destination.
//
// Packet law: six hulls carry `shopOffers`; `stationShopOffer` resolves them on the same code
// path as module offers; the three yards list distinct hull sets; an exclusive hull is absent
// from every other yard — at the catalog read AND at the `ui:buyShip` counter. No tech-gate
// changes, no reputation pricing (that is FB-044), no fourth yard.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { SHIPS } from '../src/data/ships.js';
import {
  hullExclusiveStationId,
  ships,
  shipyardHullInfo,
  stationShopOffer,
} from '../src/systems/ships.js';

const HELIOS = 'station_helios';
const TETHYS = 'station_tethys';
const FORGE = 'station_forge';
const YARDS = [HELIOS, TETHYS, FORGE];

const ship = (id) => SHIPS.find((s) => s.id === id);

function listedHullIds(stationId) {
  return SHIPS.filter((s) => shipyardHullInfo(s, stationId).listed).map((s) => s.id);
}

test('six hulls carry authored shopOffers', () => {
  for (const id of ['ship_kestrel', 'ship_pelican', 'ship_mule', 'ship_ironback', 'ship_hawser', 'ship_atlas']) {
    assert.ok(ship(id).shopOffers, `${id} has shopOffers`);
  }
});

test('the same code path resolves a hull offer and a module offer', () => {
  // Helios discounts the Kestrel line; Tethys keeps the Mule and Atlas exclusively; the Forge
  // carries Ironback and Hawser with a fabrication discount.
  assert.equal(stationShopOffer(ship('ship_kestrel'), HELIOS).price, 0);
  assert.equal(stationShopOffer(ship('ship_kestrel'), TETHYS), null, 'no offer elsewhere');
  assert.equal(stationShopOffer(ship('ship_pelican'), HELIOS).price, 12000);
  assert.ok(stationShopOffer(ship('ship_pelican'), HELIOS).price < ship('ship_pelican').price,
    'Helios really discounts');
  assert.equal(stationShopOffer(ship('ship_mule'), TETHYS).price, 32000);
  assert.equal(stationShopOffer(ship('ship_atlas'), TETHYS).price, 355000);
  assert.ok(stationShopOffer(ship('ship_ironback'), FORGE).price < ship('ship_ironback').price,
    'Forge fabrication discount is below catalog');
  assert.ok(stationShopOffer(ship('ship_hawser'), FORGE).price < ship('ship_hawser').price);
});

test('the three yards list distinct hull sets', () => {
  const sets = YARDS.map(listedHullIds);
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      assert.notDeepEqual(sets[i].sort(), sets[j].slice().sort(),
        `${YARDS[i]} and ${YARDS[j]} do not read the same ledger`);
    }
  }
});

test('an exclusive hull is absent at every other yard', () => {
  assert.equal(hullExclusiveStationId(ship('ship_mule')), TETHYS);
  assert.equal(hullExclusiveStationId(ship('ship_atlas')), TETHYS);
  assert.equal(shipyardHullInfo('ship_mule', HELIOS).listed, false);
  assert.equal(shipyardHullInfo('ship_mule', FORGE).listed, false);
  assert.equal(shipyardHullInfo('ship_mule', TETHYS).listed, true);
  assert.equal(shipyardHullInfo('ship_atlas', HELIOS).listed, false);
  // Hitch's legacy hull is Helios's alone — the starter line stays where the game began.
  assert.equal(hullExclusiveStationId(ship('ship_kestrel')), HELIOS);
  assert.equal(shipyardHullInfo('ship_kestrel', TETHYS).listed, false);
  assert.equal(shipyardHullInfo('ship_kestrel', FORGE).listed, false);
});

function runtime(stationId, credits = 400000) {
  const bus = createBus();
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 60, hullMax: 100, data: { defId: 'ship_kestrel', fittings: [] },
  };
  const state = {
    mode: 'flight', tick: 0, simTime: 0, playerId: 1,
    meta: { seed: 4242 },
    entities: new Map([[1, player]]), entityList: [player],
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { docked: true, dockedStationId: stationId },
    player: {
      credits,
      researchedNodes: [],
      activeShipIndex: 0,
      moduleInventory: [],
      ownedShips: [{ defId: 'ship_kestrel', fittings: [] }],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 60 },
      missions: [],
    },
  };
  const toasts = [];
  const charges = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  const shipSystem = Object.create(ships);
  shipSystem.init({ state, bus, helpers: {} });
  return { bus, state, shipSystem, toasts, charges };
}

test('the counter refuses an exclusive hull at the wrong yard, and sells it at the right one', () => {
  // The Mule is a Tethys exclusive: Helios cannot sell it even to a rich, researched pilot.
  const away = runtime(HELIOS);
  assert.equal(away.state.player.ownedShips.length, 1);
  const refused = away.bus.emit('ui:buyShip', { defId: 'ship_mule' });
  void refused;
  assert.equal(away.state.player.ownedShips.length, 1, 'no hull joined the berths');
  assert.equal(away.charges.length, 0, 'no credits moved');
  assert.ok(away.toasts.some((t) => /Tethys/.test(t.text)),
    'the refusal names the yard that builds it');

  // At Tethys the same intent buys the Mule at the authored yard price.
  const home = runtime(TETHYS);
  home.bus.emit('ui:buyShip', { defId: 'ship_mule' });
  assert.equal(home.state.player.ownedShips.length, 2);
  assert.equal(home.state.player.ownedShips[1].defId, 'ship_mule');
  assert.deepEqual(home.charges.map((c) => c.amount), [32000]);
});

test('a yard offer sets the price on the chit below catalog', () => {
  const atHelios = runtime(HELIOS);
  const pelicanCatalog = ship('ship_pelican').price;
  atHelios.bus.emit('ui:buyShip', { defId: 'ship_pelican' });
  assert.equal(atHelios.state.player.ownedShips.length, 2);
  assert.deepEqual(atHelios.charges.map((c) => c.amount), [12000]);
  assert.ok(12000 < pelicanCatalog);
});
