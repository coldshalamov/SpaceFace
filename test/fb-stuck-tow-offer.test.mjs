// FB-111 — a hull wedged long enough is offered a tow to the nearest lawful berth: thrust
// committed, no displacement, no speed for eight seconds. Accept docks at the priced cost;
// open space never offers.
import assert from 'node:assert/strict';
import test from 'node:test';

import { world } from '../src/systems/world.js';
import { INSURANCE_DEFAULTS } from '../src/systems/economy.js';

function busCapture() {
  const subs = new Map();
  const events = [];
  return {
    events,
    on(ev, fn) { const l = subs.get(ev) || []; l.push(fn); subs.set(ev, l); },
    emit(ev, p) { events.push({ ev, p }); for (const fn of subs.get(ev) || []) fn(p); },
    of(ev) { return events.filter((e) => e.ev === ev); },
  };
}

function harness({ thrusting = true, stuckPos = { x: 0, z: 0 } } = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: stuckPos.x, z: stuckPos.z },
    vel: { x: 0, z: 0 },
    prevPos: { x: stuckPos.x, z: stuckPos.z },
    data: { defId: 'ship_kestrel' },
  };
  const state = {
    mode: 'flight',
    playerId: 'player',
    player: { credits: 5000, insurance: { ...INSURANCE_DEFAULTS }, cargo: { items: {} } },
    entities: new Map([['player', player]]),
    entityList: [player],
    input: { moveZ: thrusting ? 1 : 0, moveX: 0, brake: false },
    ui: { docked: false },
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: {
        stations: [{ stationId: 'station_helios', id: 'station_helios', pos: { x: 500, z: 0 } }],
      },
    },
    content: {},
    meta: { seed: 4242 },
    simTime: 0,
    tick: 0,
  };
  const bus = busCapture();
  const w = Object.create(world);
  w.state = state;
  w.bus = bus;
  // The tow charge goes through the economy's single-writer intent; the harness answers it
  // the same way economy._settleTowCharge does.
  bus.on('economy:towCharge', (p) => {
    p.ok = true;
    p.chargedCr = Math.min(p.quotedCr, Math.round(state.player.credits));
    p.debtCr = Math.max(0, p.quotedCr - p.chargedCr);
    state.player.credits -= p.chargedCr;
    state.player.debt = (state.player.debt || 0) + p.debtCr;
  });
  // The accept intent routes through world.init in production; the harness wires the same seam.
  bus.on('world:stuckTowAccept', () => w._executeStuckTow());
  return { state, bus, w, player };
}

function wedge(w, state, player, seconds, dt = 0.5) {
  for (let t = 0; t < seconds; t += dt) {
    state.simTime += dt;
    w._updateStuckWatch(dt, state);
  }
}

test('a scripted wedge offers the tow after eight seconds, once per episode', () => {
  const { state, bus, w, player } = harness();
  wedge(w, state, player, 9);
  const offers = bus.of('world:stuckTowOffer');
  assert.equal(offers.length, 1, 'one offer per wedge episode');
  assert.ok(offers[0].p.stuckS >= 8, 'the offer lands at the eight-second mark');
  assert.equal(offers[0].p.stationId, 'station_helios', 'the tow names the lawful berth');
  assert.ok(offers[0].p.quotedCr > 0, 'the offer prices the tow');
  wedge(w, state, player, 5);
  assert.equal(bus.of('world:stuckTowOffer').length, 1, 'still wedged, still one offer');
});

test('accept docks at the lawful berth and charges the quoted cost', () => {
  const { state, bus, w, player } = harness();
  wedge(w, state, player, 9);
  assert.equal(bus.of('world:stuckTowOffer').length, 1);
  bus.emit('world:stuckTowAccept', {});
  const docks = bus.of('dock:docked');
  assert.equal(docks.length, 1, 'the tow docks through the normal arrival path');
  assert.equal(docks[0].p.stationId, 'station_helios');
  assert.equal(docks[0].p.via, 'tow');
  assert.ok(state.player.credits < 5000, 'the quoted cost was charged');
  assert.equal(state.player.debt || 0, 0, 'a funded wallet files no debt');
  assert.ok(player.pos.x > 500 - 1e-6, 'the hull was delivered beside the berth');
});

test('a broke pilot still gets towed — the shortfall goes on the note', () => {
  const { state, bus, w, player } = harness();
  state.player.credits = 100;
  wedge(w, state, player, 9);
  bus.emit('world:stuckTowAccept', {});
  assert.equal(bus.of('dock:docked').length, 1);
  assert.ok(state.player.debt > 0, 'the uncovered tow filed as debt');
});

test('free flight never offers — moving, coasting, or braking all stay silent', () => {
  // Coasting: no thrust input at all.
  let h = harness({ thrusting: false });
  wedge(h.w, h.state, h.player, 12);
  assert.equal(h.bus.of('world:stuckTowOffer').length, 0, 'coasting never counts');

  // Moving: thrust held but the hull answers — displacement resets the watch every tick.
  h = harness({ thrusting: true });
  for (let t = 0; t < 12; t += 0.5) {
    h.state.simTime += 0.5;
    h.player.pos.x += 10;             // the hull is flying, not wedged
    h.player.vel.x = 20;
    h.w._updateStuckWatch(0.5, h.state);
  }
  assert.equal(h.bus.of('world:stuckTowOffer').length, 0, 'a moving hull never counts');

  // A stale accept tows nothing once the offer lapsed.
  h = harness({ thrusting: true });
  wedge(h.w, h.state, h.player, 9);
  h.player.pos.x += 50;               // the hull broke free
  h.player.vel.x = 30;
  h.w._updateStuckWatch(0.5, h.state);
  h.bus.emit('world:stuckTowAccept', {});
  assert.equal(h.bus.of('dock:docked').length, 0, 'a freed hull cannot accept a stale tow');
});
