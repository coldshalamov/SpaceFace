import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claims as claimsBase,
  CLAIM_DEFENSE_WARNING_S,
} from '../src/systems/claims.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

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
    name: id === 'claim_alpha' ? 'Pallas Industrial Moon' : 'Watch Rock',
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
        refinedTotalU: 0,
        soldTotalCr: 0,
        lostU: 0,
        upkeepPaidCr: 0,
        raidsRepelled: 0,
        raidsSuffered: 0,
      },
    },
  };
}

function boot({ onboarding = { active: false, finished: true }, director = null } = {}) {
  const state = {
    simTime: 1000,
    tick: 60000,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: 'player',
    player: { credits: 100000, stats: {}, cargo: { items: {} } },
    onboarding,
    world: { currentSectorId: FRONTIER },
    nav: { waypoint: { kind: 'mission', missionId: 'm_keep', reason: 'Existing route', pos: { x: 1, z: 2 } } },
    entities: new Map(),
    entityList: [],
    claims: { bodies: [makeBody()], meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 } },
    factions: Object.freeze({}),
  };
  state.entities.set('player', {
    id: 'player', alive: true, type: 'ship', pos: { x: -2000, z: -2000 }, vel: { x: 0, z: 0 },
  });
  state.entityList.push(state.entities.get('player'));
  const bus = busHarness();
  const peers = new Map();
  if (director) peers.set('encounterDirector', director);
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry: { get: (name) => peers.get(name) || null } });
  return { state, bus, sys, director, body: state.claims.bodies[0] };
}

function emitted(h, name) {
  return h.bus.log.filter((event) => event.name === name);
}

test('raid trip becomes a durable warning with motive, attacker identity, countdown, and claim goal', () => {
  const h = boot();
  assert.equal(h.sys.beginRaidDefense(h.body.id, { attackerCount: 3 }), true);
  const defense = h.body.spec.defense;
  assert.equal(defense.phase, 'warning');
  assert.equal(defense.attackerFactionId, 'faction_reach');
  assert.equal(defense.attackerCount, 3);
  assert.match(defense.motive, /stored|freight|seam/i);
  assert.equal(defense.deadlineAt, h.state.simTime + CLAIM_DEFENSE_WARNING_S);
  assert.equal(h.state.nav.waypoint.kind, 'claim_defense');
  assert.equal(h.state.nav.waypoint.markerKind, 'mission-objective');
  assert.deepEqual(h.state.nav.waypoint.pos, { x: h.body.x, z: h.body.z });
  assert.match(h.state.nav.waypoint.reason, /Reach scavengers.*3 ships.*respond/i);
  assert.equal(emitted(h, 'claim:defenseWarning').length, 1);
  assert.equal(emitted(h, 'nav:waypoint').length, 1);
});

test('arriving at the real claim requests one intentional encounter and never duplicates it', () => {
  const requests = [];
  const director = {
    requestClaimDefense(payload) {
      requests.push(payload);
      return { ok: true, encounterId: payload.encounterId };
    },
  };
  const h = boot({ director });
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 2 });
  const defense = h.body.spec.defense;
  const player = h.state.entities.get('player');
  player.pos = { x: h.body.x + 20, z: h.body.z };
  h.state.simTime += 1;
  h.sys.update(1, h.state);
  assert.equal(defense.phase, 'engaged');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].claimId, h.body.id);
  assert.deepEqual(requests[0].anchor, { x: h.body.x, z: h.body.z });
  assert.equal(requests[0].attackerCount, 2);
  assert.equal(requests[0].motive, defense.motive);
  h.sys.update(1, h.state);
  assert.equal(requests.length, 1, 'engaged defense is not requested twice');
});

test('victory, partial defense, retreat, timeout, and destruction settle proportionally through authority events', () => {
  const cases = [
    { outcome: 'defended', loss: 0, rep: 3, danger: -0.05, repelled: 1, suffered: 0 },
    { outcome: 'partial', loss: 25, rep: 1, danger: -0.01, repelled: 0, suffered: 1 },
    { outcome: 'retreated', loss: 50, rep: -2, danger: 0.03, repelled: 0, suffered: 1 },
    { outcome: 'timeout', loss: 70, rep: -3, danger: 0.05, repelled: 0, suffered: 1 },
    { outcome: 'destroyed', loss: 90, rep: -5, danger: 0.08, repelled: 0, suffered: 1 },
  ];
  for (const row of cases) {
    const h = boot();
    h.sys.beginRaidDefense(h.body.id);
    const defense = h.body.spec.defense;
    defense.phase = 'engaged';
    h.bus.emit('encounter:resolved', {
      encounterId: defense.encounterId,
      shape: 'claim_threat',
      outcome: row.outcome,
      sectorId: FRONTIER,
    });
    assert.equal(h.body.spec.totals.lostU, row.loss, `${row.outcome} storage loss`);
    assert.equal(h.body.spec.totals.raidsRepelled, row.repelled, `${row.outcome} repelled count`);
    assert.equal(h.body.spec.totals.raidsSuffered, row.suffered, `${row.outcome} suffered count`);
    const rep = emitted(h, 'faction:repDelta').at(-1);
    assert.equal(rep.payload.factionId, 'faction_free');
    assert.equal(rep.payload.delta, row.rep);
    const impulse = emitted(h, 'sectorsim:impulse').at(-1);
    assert.equal(impulse.payload.danger, row.danger);
    assert.equal(emitted(h, 'claim:defenseResolved').length, 1);
    assert.equal(h.body.spec.defense, null);
    assert.equal(h.state.nav.waypoint.missionId, 'm_keep', 'the displaced route is restored');
    assert.ok(h.body.spec.receipts.some((receipt) => receipt.kind === `defense_${row.outcome}`));
  }
});

test('save and reload preserve the exact defense contract and re-request the same encounter id', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 4 });
  h.body.spec.defense.phase = 'engaged';
  h.body.spec.defense.requestedAt = h.state.simTime;
  const expected = structuredClone(h.body.spec.defense);
  const snap = h.sys.serialize();

  const requests = [];
  const h2 = boot({ director: {
    requestClaimDefense(payload) {
      requests.push(payload);
      return { ok: true, encounterId: payload.encounterId };
    },
  } });
  h2.sys.deserialize(snap);
  const restored = h2.state.claims.bodies[0];
  assert.deepEqual(restored.spec.defense, expected);
  h2.state.entities.get('player').pos = { x: restored.x, z: restored.z };
  h2.state.simTime += 1;
  h2.sys.update(1, h2.state);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].encounterId, expected.encounterId);
});

test('engaged defense loaded in another sector keeps retrying until return and materializes once', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id, { attackerCount: 3 });
  h.body.spec.defense.phase = 'engaged';
  h.body.spec.defense.requestedAt = h.state.simTime;
  const snap = h.sys.serialize();

  const attempts = [];
  let materialized = 0;
  const h2 = boot({ director: {
    requestClaimDefense(payload) {
      attempts.push({ encounterId: payload.encounterId, sectorId: h2.state.world.currentSectorId });
      if (h2.state.world.currentSectorId !== payload.sectorId) return { ok: false, reason: 'wrong_sector' };
      materialized += 1;
      return { ok: true, encounterId: payload.encounterId };
    },
  } });
  h2.sys.deserialize(snap);
  const restored = h2.state.claims.bodies[0];
  h2.state.world.currentSectorId = 'sector_helios_prime';
  h2.state.simTime += 1;
  h2.sys.update(1, h2.state);
  assert.equal(restored.spec.defense.phase, 'engaged');
  assert.equal(materialized, 0);

  h2.state.world.currentSectorId = FRONTIER;
  h2.state.entities.get('player').pos = { x: restored.x, z: restored.z };
  h2.state.simTime += 1;
  h2.sys.update(1, h2.state);
  assert.equal(materialized, 1, 'returning to the claim materializes the encounter once');
  assert.equal(restored.spec.defense.phase, 'engaged');
  h2.sys.update(1, h2.state);
  assert.equal(materialized, 1, 'successful materialization consumes the retry token');
  assert.equal(new Set(attempts.map((attempt) => attempt.encounterId)).size, 1, 'every retry keeps the durable encounter identity');
});

test('first-session onboarding protection suppresses a raid without consuming or resolving it', () => {
  const h = boot({ onboarding: { active: true, finished: false } });
  assert.equal(h.sys.beginRaidDefense(h.body.id), false);
  assert.equal(h.body.spec.defense, null);
  assert.equal(emitted(h, 'claim:defenseWarning').length, 0);
  assert.equal(h.body.spec.totals.lostU, 0);
});

test('ignored or unreachable warning falls back once, never double-resolves or double-rewards', () => {
  const h = boot();
  h.sys.beginRaidDefense(h.body.id);
  const defenseId = h.body.spec.defense.id;
  h.state.world.currentSectorId = 'sector_helios_prime';
  h.state.simTime += CLAIM_DEFENSE_WARNING_S + 1;
  h.sys.update(1, h.state);
  assert.equal(h.body.spec.defense, null);
  assert.equal(h.body.spec.totals.lostU, 70);
  assert.equal(emitted(h, 'claim:defenseResolved').length, 1);
  h.bus.emit('encounter:resolved', {
    encounterId: `claim-defense:${defenseId}`,
    shape: 'claim_threat', outcome: 'defended', sectorId: FRONTIER,
  });
  h.sys.update(1, h.state);
  assert.equal(h.body.spec.totals.lostU, 70);
  assert.equal(emitted(h, 'claim:defenseResolved').length, 1);
});

test('the live director materializes the requested claim set piece at the exact anchor with readable ROE', () => {
  const sim = createSimulation({ seed: 47, systems: [spawnBudget, encounterDirector] });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = FRONTIER;
  state.claims = { bodies: [makeBody()] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 200, z: -120 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  const payload = {
    encounterId: 'claim-defense:claim_alpha:7',
    defenseId: 'claim_alpha:7',
    claimId: 'claim_alpha',
    sectorId: FRONTIER,
    anchor: { x: 200, z: -120 },
    attackerFactionId: 'faction_reach',
    attackerName: 'Reach scavengers',
    attackerCount: 3,
    motive: 'Stored freight drew a stripping crew.',
  };
  const director = sim.registry.get('encounterDirector');
  const result = director.requestClaimDefense(payload);
  assert.deepEqual(result, { ok: true, encounterId: payload.encounterId });
  const live = state.encounterDirector.live[payload.encounterId];
  assert.ok(live, 'requested defense becomes a live director encounter');
  assert.equal(live.data.claimId, payload.claimId);
  assert.deepEqual(live.anchor, payload.anchor);
  assert.equal(live.ids.length, 3);
  for (const id of live.ids) {
    const entity = state.entities.get(id);
    assert.equal(entity.data.ai.passive, true, 'arrival begins with a readable staging beat');
    assert.equal(entity.data.ai.motive, payload.motive);
    assert.equal(entity.data.ai.engagementTrigger, 'claim_defense_arrival');
    assert.ok(entity.data.ai.combatDoctrineId, 'each attacker uses an intentional combat doctrine');
    assert.notEqual(entity.pos.x, payload.anchor.x, 'attackers form outside the claim center');
  }
  sim.runTicks(240);
  assert.equal(live.phase, 'conflict');
  for (const id of live.ids) assert.equal(state.entities.get(id).data.ai.passive, false);
  assert.deepEqual(director.requestClaimDefense(payload), {
    ok: true, encounterId: payload.encounterId, reused: true,
  });
  assert.equal(live.ids.length, 3, 'same durable request cannot duplicate the squad');
});
