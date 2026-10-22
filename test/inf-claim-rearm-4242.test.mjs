import test from 'node:test';
import assert from 'node:assert/strict';

import { claims as claimsBase, CLAIM_DEFENSE_REPRIEVE_S } from '../src/systems/claims.js';

const SECTOR = 'sector_io_reach';

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

function boot(director = null) {
  const body = {
    id: 'claim_alpha',
    sectorId: SECTOR,
    name: 'Pallas Industrial Moon',
    x: 200,
    z: -120,
    spec: {
      id: 'spec_refinery',
      status: 'active',
      store: { input: { cmdty_ore_iron: 100 }, output: {} },
      defense: null,
      receipts: [],
      totals: { lostU: 0, raidsSuffered: 0, raidsRepelled: 0 },
    },
  };
  const state = {
    simTime: 1000,
    tick: 60000,
    mode: 'flight',
    meta: { seed: 4242 },
    playerId: 'player',
    player: { credits: 1000 },
    onboarding: { active: false, finished: true },
    world: { currentSectorId: SECTOR },
    nav: { waypoint: null },
    entities: new Map([['player', { id: 'player', alive: true, type: 'ship', pos: { x: -2000, z: -2000 } }]]),
    entityList: [],
    claims: { bodies: [body], meta: { nextRaidId: 1 } },
  };
  const bus = busHarness();
  const sys = Object.create(claimsBase);
  const peers = new Map();
  if (director) peers.set('encounterDirector', director);
  sys.init({ state, bus, helpers: {}, registry: { get: (name) => peers.get(name) || null } });
  return { state, bus, sys, body };
}

function since(h, mark, name) {
  return h.bus.log.slice(mark).filter((event) => event.name === name);
}

test('an aborted claim fight tells the pilot the raid is still coming, seed 4242', () => {
  const h = boot();
  assert.equal(h.sys.beginRaidDefense(h.body.id, { attackerCount: 4 }), true);
  const defense = h.body.spec.defense;
  defense.phase = 'engaged';
  h.state.simTime = defense.deadlineAt + 1;
  const mark = h.bus.log.length;
  h.bus.emit('encounter:resolved', {
    encounterId: defense.encounterId,
    shape: 'claim_threat',
    outcome: 'aborted:no_budget',
    sectorId: SECTOR,
  });
  assert.equal(defense.phase, 'warning');
  assert.equal(defense.deadlineAt, h.state.simTime + CLAIM_DEFENSE_REPRIEVE_S);
  const warning = since(h, mark, 'claim:defenseWarning');
  assert.equal(warning.length, 1);
  assert.equal(warning[0].payload.rearm, true);
  assert.equal(warning[0].payload.countdownS, CLAIM_DEFENSE_REPRIEVE_S);
  assert.equal(warning[0].payload.bodyName, 'Pallas Industrial Moon');
  const toast = since(h, mark, 'toast')[0];
  assert.ok(toast);
  assert.match(toast.payload.text, /CLAIM STILL LIVE — Reach scavengers turned back\. Reach Pallas Industrial Moon in 45s\./);
});

test('a refusal that can never field the fight speaks the same live claim, seed 4242', () => {
  const h = boot({
    requestClaimDefense() {
      return { ok: false, reason: 'no_director' };
    },
  });
  assert.equal(h.sys.beginRaidDefense(h.body.id, { attackerCount: 4 }), true);
  const defense = h.body.spec.defense;
  defense.phase = 'engaged';
  defense.retryAt = 0;
  h.sys._resumeDefenseIds = new Set([defense.id]);
  h.state.simTime = defense.deadlineAt + 1;
  const mark = h.bus.log.length;
  h.sys.update(1, h.state);
  assert.equal(defense.phase, 'warning');
  const toast = since(h, mark, 'toast').map((event) => event.payload.text).join(' ');
  assert.match(toast, /CLAIM STILL LIVE/);
  assert.match(toast, /45s/);
});

test('a held claim does not say the raiders turned back, seed 4242', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 4 });
  const defense = h.body.spec.defense;
  defense.phase = 'engaged';
  const mark = h.bus.log.length;
  h.bus.emit('encounter:resolved', {
    encounterId: defense.encounterId,
    shape: 'claim_threat',
    outcome: 'defended',
    sectorId: SECTOR,
  });
  const text = since(h, mark, 'toast').map((event) => event.payload.text).join(' ');
  assert.equal(text.includes('CLAIM STILL LIVE'), false);
  assert.equal(defense.phase == null || h.body.spec.defense == null || h.body.spec.defense.phase !== 'warning', true);
});
