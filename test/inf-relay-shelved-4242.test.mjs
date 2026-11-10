// A launched relay hauler that is off the map is not paid as if it docked.
import assert from 'node:assert/strict';
import test from 'node:test';

import { claims as claimsBase } from '../src/systems/claims.js';

const QTY = 60;
const PRICE = 64;

function busHarness() {
  const handlers = new Map();
  const log = [];
  return {
    log,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    off() {},
    emit(name, payload) {
      log.push({ name, payload });
      for (const fn of (handlers.get(name) || []).slice()) fn(payload);
    },
  };
}

function boot({ manifested, present }) {
  const entityId = 77;
  const convoy = {
    goodId: 'cmdty_refined_metals',
    qty: QTY,
    destStationId: 'station_helios',
    departedAt: 100,
    arriveAt: 400,
    convoyId: 'claim_alpha:cv1',
    bodyId: 'claim_alpha',
    worldRecordId: 'rec-relay-1',
    manifested,
    entityId: manifested ? entityId : null,
  };
  const body = {
    id: 'claim_alpha',
    sectorId: 'sector_helios_prime',
    name: 'Helios Relay',
    x: 200,
    z: -120,
    modules: [],
    spec: {
      id: 'spec_relay',
      status: 'active',
      store: { input: {}, output: {} },
      convoy,
      nextDispatchAt: 100000,
      receipts: [],
      totals: { lostU: 0, soldTotalCr: 0 },
    },
  };
  const entities = new Map();
  if (present) {
    entities.set(entityId, {
      id: entityId,
      alive: true,
      type: 'ship',
      data: { claimConvoy: { convoyId: convoy.convoyId } },
    });
  }
  const state = {
    simTime: 500,
    tick: 30000,
    mode: 'flight',
    meta: { seed: 4242 },
    playerId: 'player',
    player: { credits: 1000 },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
    claims: { bodies: [body] },
    economy: {
      markets: {
        station_helios: {
          cmdty_refined_metals: { lastSell: PRICE },
        },
      },
    },
  };
  const bus = busHarness();
  const sys = Object.create(claimsBase);
  const economy = { priceOf: () => PRICE };
  sys.init({
    state,
    bus,
    helpers: {},
    registry: { get: (name) => (name === 'economy' ? economy : null) },
  });
  return { state, bus, sys, body };
}

function sales(h) {
  return h.bus.log.filter((event) => (
    event.name === 'economy:grantCredits'
    && event.payload
    && event.payload.reason === 'claim_relay_sale'
  ));
}

test('a launched relay hauler that is off the map is not paid as if it docked (seed 4242)', () => {
  const h = boot({ manifested: true, present: false });
  h.sys.update(0.05, h.state);
  assert.equal(sales(h).length, 0);
  assert.equal(h.body.spec.convoy && h.body.spec.convoy.convoyId, 'claim_alpha:cv1');
  assert.equal(h.body.spec.totals.soldTotalCr, 0);
  assert.equal(h.bus.log.some((event) => event.name === 'claim:convoyAbandoned'), false);
});

test('a launched relay hauler that is still flying is not paid by the transit clock (seed 4242)', () => {
  const h = boot({ manifested: true, present: true });
  h.sys.update(0.05, h.state);
  assert.equal(sales(h).length, 0);
  assert.equal(h.body.spec.convoy && h.body.spec.convoy.convoyId, 'claim_alpha:cv1');
});

test('a relay leg that never launched still settles when its transit ends (seed 4242)', () => {
  const h = boot({ manifested: false, present: false });
  h.sys.update(0.05, h.state);
  const paid = sales(h);
  assert.equal(paid.length, 1);
  assert.ok(paid[0].payload.amount > 0);
  assert.equal(h.body.spec.convoy, null);
});
