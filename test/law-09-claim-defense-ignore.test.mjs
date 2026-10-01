import test from 'node:test';
import assert from 'node:assert/strict';

import { claims as claimsBase } from '../src/systems/claims.js';
import { describeClaimMapMarker, resolveClaimIgnoreAction } from '../src/ui/galaxyMap.js';

const FRONTIER = 'sector_io_reach';

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

function makeBody(id = 'claim_alpha') {
  return {
    id,
    sectorId: FRONTIER,
    poiId: `poi_${id}`,
    name: 'Pallas Industrial Moon',
    size: 'M',
    slots: 3,
    modules: ['mod_refinery'],
    linkedStationId: null,
    x: 200,
    z: -120,
    claimedAt: 100,
    spec: {
      id: 'spec_refinery',
      since: 100,
      status: 'active',
      statusUntil: 0,
      store: { input: { cmdty_ore_iron: 100 }, output: {} },
      convoy: null,
      acc: 0,
      nextDispatchAt: 0,
      destStationId: null,
      upkeepDebt: 0,
      deterrenceUntil: 0,
      outputFull: false,
      receipts: [],
      defense: null,
      totals: {
        refinedTotalU: 0, soldTotalCr: 0, lostU: 0,
        upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0,
      },
    },
  };
}

function boot() {
  const state = {
    simTime: 1000,
    tick: 60000,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: 'player',
    player: { credits: 100000, stats: {}, cargo: { items: {} } },
    onboarding: { active: false, finished: true },
    world: { currentSectorId: FRONTIER },
    nav: { waypoint: { kind: 'mission', missionId: 'm_keep', reason: 'Existing route', pos: { x: 1, z: 2 } } },
    entities: new Map(),
    entityList: [],
    claims: { bodies: [makeBody()], meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 } },
    factions: Object.freeze({}),
  };
  const bus = busHarness();
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { state, bus, sys, body: state.claims.bodies[0] };
}

function emitted(h, name) {
  return h.bus.log.filter((event) => event.name === name);
}

test('the marker verb emits claim:defenseIgnore and settles the warning as ignored', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 3 });
  const defense = h.body.spec.defense;
  assert.equal(defense.phase, 'warning');

  h.bus.emit('claim:defenseIgnore', { claimId: h.body.id, defenseId: defense.id });

  assert.equal(h.body.spec.defense, null, 'the warning is settled once');
  assert.equal(h.body.spec.totals.lostU, 70, 'the ignored raid takes its cut of stores');
  const resolved = emitted(h, 'claim:defenseResolved');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.outcome, 'ignored');
  assert.equal(emitted(h, 'claim:raided').length, 1, 'an ignored defense reads as a landed raid');
  assert.equal(h.state.nav.waypoint.missionId, 'm_keep', 'the displaced route is restored');
});

test('a stale marker or an answered defense cannot be ignored', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 3 });
  const defense = h.body.spec.defense;

  h.bus.emit('claim:defenseIgnore', { claimId: h.body.id, defenseId: 'stale_defense_id' });
  assert.ok(h.body.spec.defense, 'a stale defenseId settles nothing');
  assert.equal(emitted(h, 'claim:defenseResolved').length, 0);

  defense.phase = 'engaged';
  h.bus.emit('claim:defenseIgnore', { claimId: h.body.id, defenseId: defense.id });
  assert.equal(h.body.spec.defense.phase, 'engaged', 'an answered defense is already committed');
  assert.equal(emitted(h, 'claim:defenseResolved').length, 0);
});

test('the claim map marker carries the live warning and resolves the stand-down verb', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 3 });
  const defense = h.body.spec.defense;

  const marker = describeClaimMapMarker(h.body, null);
  assert.equal(marker.claimId, h.body.id);
  assert.equal(marker.defense.phase, 'warning');
  assert.equal(marker.defense.id, defense.id);

  const action = resolveClaimIgnoreAction(marker);
  assert.equal(action.id, 'ignore-raid');
  assert.equal(action.available, true);
  assert.match(action.reason, /unmolested/i);
  assert.deepEqual(action.event, {
    name: 'claim:defenseIgnore', claimId: h.body.id, defenseId: defense.id,
  });
});

test('a claim with no live warning has no stand-down verb', () => {
  const h = boot();
  const marker = describeClaimMapMarker(h.body, null);
  assert.equal(marker.defense, null);
  const action = resolveClaimIgnoreAction(marker);
  assert.equal(action.available, false);
  assert.equal(action.event, null);
});
