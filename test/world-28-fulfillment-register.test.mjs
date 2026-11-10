// WORLD-28 — an administrative reroute or a Fulfillment provocation is announced in the
// faction's register. Both factionPresence receipts were emitted into silence: the route's
// escorts flipping hostile and an administrative boarding completing its seizure produced no
// line at all. Now a tagged hull speaks the route's warn (or demand-cargo) line, and a reroute
// with no tagged hull on the field is still announced by the route desk over comms.
import test from 'node:test';
import assert from 'node:assert/strict';

import { barkDirector } from '../src/systems/barkDirector.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {
        const list = handlers.get(event) || [];
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
      };
    },
    off(event, fn) {
      const list = handlers.get(event) || [];
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(event, payload) {
      for (const fn of (handlers.get(event) || []).slice()) fn(payload);
    },
  };
}

function fulfillmentHull(id, routeId) {
  return {
    id, type: 'ship', alive: true, team: 2, factionId: 'faction_fulfillment',
    pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    data: { factionPresence: { factionId: 'faction_fulfillment', routeId } },
  };
}

function makeState(entities = []) {
  return {
    mode: 'flight',
    tick: 40,
    simTime: 40,
    playerId: 1,
    player: {},
    entities: new Map(entities.map((e) => [e.id, e])),
    meta: { seed: 4242 },
    settings: {},
  };
}

function boot(entities = []) {
  const bus = makeBus();
  const says = [];
  const popups = [];
  const voice = { say: (p) => { says.push(p); return true; } };
  bus.on('comms:popup', (p) => popups.push(p));
  const bd = Object.create(barkDirector);
  bd.init({ state: makeState(entities), bus, helpers: { voice }, registry: { get() { return null; } } });
  return { bd, bus, says, popups };
}

test('a provoked route speaks one warn line from a tagged hull', () => {
  const { bus, says } = boot([fulfillmentHull(7, 'route_k1')]);
  bus.emit('factionPresence:fulfillmentProvoked', { routeId: 'route_k1', count: 3, tick: 40 });
  assert.equal(says.length, 1);
  assert.equal(says[0].factionId, 'faction_fulfillment');
  assert.equal(says[0].kind, 'barkDirector');
  assert.ok(says[0].text.length > 4);
});

test('a provocation with no tagged hull on the field stays silent', () => {
  const { bus, says, popups } = boot([fulfillmentHull(7, 'route_other')]);
  bus.emit('factionPresence:fulfillmentProvoked', { routeId: 'route_k1', count: 3, tick: 40 });
  assert.equal(says.length, 0);
  assert.equal(popups.length, 0, 'the provocation is hull-voiced or silent — never a desk note');
});

test('an administrative reroute is announced in the demand-cargo register by a tagged hull', () => {
  const { bus, says, popups } = boot([fulfillmentHull(7, 'route_k1')]);
  bus.emit('factionPresence:administrativeRouting', {
    routeId: 'route_k1', commodityId: 'cmdty_ore_iron', requested: 1, removed: 2,
    administrative: true, t: 40, boardingId: 'board_1', routingCode: 'FR-AB12',
  });
  assert.equal(says.length, 1, 'the hull speaks the seizure');
  assert.equal(popups.length, 0, 'no desk note while a hull is on the field');
});

test('a reroute with no tagged hull still says it — from the route desk', () => {
  const { bus, says, popups } = boot();
  bus.emit('factionPresence:administrativeRouting', {
    routeId: 'route_k1', removed: 1, administrative: true, t: 40,
    boardingId: 'board_1', routingCode: 'FR-AB12',
  });
  assert.equal(says.length, 0);
  assert.equal(popups.length, 1);
  assert.equal(popups[0].sender, 'FULFILLMENT ROUTE DESK');
  assert.match(popups[0].text, /FR-AB12/);
  assert.equal(popups[0].category, 'law');
});

test('the same boarding never announces twice; a new boarding does', () => {
  const { bus, popups } = boot();
  const payload = {
    routeId: 'route_k1', removed: 1, administrative: true, t: 40,
    boardingId: 'board_1', routingCode: 'FR-AB12',
  };
  bus.emit('factionPresence:administrativeRouting', payload);
  bus.emit('factionPresence:administrativeRouting', { ...payload });
  assert.equal(popups.length, 1, 'one reroute, one note');
  bus.emit('factionPresence:administrativeRouting', { ...payload, boardingId: 'board_2', routingCode: 'FR-CD34' });
  assert.equal(popups.length, 2, 'a new seizure is a new note');
});

test('off-flight emissions and teardown stay silent', () => {
  const { bd, bus, says, popups } = boot([fulfillmentHull(7, 'route_k1')]);
  bd.state.mode = 'dock';
  bus.emit('factionPresence:fulfillmentProvoked', { routeId: 'route_k1', count: 1, tick: 40 });
  assert.equal(says.length, 0, 'no route chatter on the dock');
  bd.state.mode = 'flight';
  bd.destroy();
  bus.emit('factionPresence:fulfillmentProvoked', { routeId: 'route_k1', count: 1, tick: 41 });
  bus.emit('factionPresence:administrativeRouting', {
    routeId: 'route_k1', boardingId: 'board_9', t: 41, administrative: true,
  });
  assert.equal(says.length, 0);
  assert.equal(popups.length, 0);
});
