import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claims as claimsBase,
  CLAIM_DEFENSE_WARNING_S,
  DEPOT_PATROL_ROTATION_GAP_S,
} from '../src/systems/claims.js';
import { createEncounterChoicePrompt } from '../src/ui/encounterChoicePrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';

// FB-132 — a claim defense warning is a flight decision with three doors (go / ignore /
// delegate), not only a headline. The adapter owns no outcome: it normalizes the warning into
// one deck card per defense id and emits intents back; claims.js re-validates every verb —
// ignore settles the shipped 'ignored' column, go re-affirms the alarm waypoint, and delegate
// is refused with a reason unless a same-sector supported depot's patrol rotation can answer.

const FRONTIER = 'sector_io_reach';
const SEED = 4242; // packet-pinned seed

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

function fakeDeck() {
  const deck = { offers: [], resolved: [] };
  const byId = new Map();
  deck.offerDecision = (spec) => { deck.offers.push({ spec }); byId.set(spec.id, spec); return true; };
  deck.resolveDecision = (id) => { deck.resolved.push(id); return byId.delete(id); };
  deck.hasDecision = (id) => byId.has(id);
  return deck;
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
        refinedTotalU: 0, soldTotalCr: 0, lostU: 0,
        upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0,
      },
    },
  };
}

// A stocked Trade Relay whose Concord support is live — the depot that can answer a delegate.
function makeDepot(id = 'claim_depot') {
  const body = makeBody(id);
  body.name = 'Relay Depot';
  body.spec.id = 'spec_relay';
  body.depotSupport = {
    supported: true,
    since: 900,
    stockedAt: 900,
    dryAt: 0,
    lapsedAt: 0,
    lapseReason: null,
    rotations: 3,
    completedRotations: 2,
    patrol: {
      encounterId: 'depot-patrol:claim_depot:3',
      anchor: { x: 90, z: -60 },
      requestedAt: 990,
      nextAt: 1030,
      lastDenied: null,
      announced: true,
    },
  };
  return body;
}

function boot({ depot = null } = {}) {
  const bodies = [makeBody()];
  if (depot) bodies.push(depot);
  const state = {
    simTime: 1000,
    tick: 60000,
    mode: 'flight',
    meta: { seed: SEED },
    playerId: 'player',
    player: { credits: 100000, stats: {}, cargo: { items: {} } },
    onboarding: { active: false, finished: true },
    world: { currentSectorId: FRONTIER },
    nav: { waypoint: { kind: 'mission', missionId: 'm_keep', reason: 'Existing route', pos: { x: 1, z: 2 } } },
    entities: new Map(),
    entityList: [],
    claims: { bodies, meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1 } },
    factions: Object.freeze({}),
  };
  state.entities.set('player', {
    id: 'player', alive: true, type: 'ship', pos: { x: -2000, z: -2000 }, vel: { x: 0, z: 0 },
  });
  state.entityList.push(state.entities.get('player'));
  const bus = busHarness();
  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers: {}, registry: { get: () => null } });
  const deck = fakeDeck();
  setPromptDeck(deck);
  const prompt = createEncounterChoicePrompt({ state, bus });
  return { state, bus, sys, deck, prompt, body: bodies[0], depot };
}

function emitted(h, name) {
  return h.bus.log.filter((event) => event.name === name);
}

function raiseWarning(h, attackerCount = 4) {
  assert.equal(h.sys.beginRaidDefense(h.body.id, { attackerCount }), true, 'warning stands up');
  return h.body.spec.defense;
}

test('the alarm opens ONE deck decision with three doors — go, ignore, delegate', () => {
  const h = boot();
  try {
    const defense = raiseWarning(h);
    assert.equal(h.deck.offers.length, 1);
    const spec = h.deck.offers[0].spec;
    assert.equal(spec.id, `claim-defense:${defense.id}`);
    assert.equal(spec.kind, 'danger');
    assert.equal(spec.deadlineAt, defense.deadlineAt, 'the card carries the real countdown');
    assert.deepEqual(spec.choices.map((choice) => choice.id), ['go', 'ignore', 'delegate']);

    // A repeat warning for the same defense does not stack a second card.
    h.bus.emit('claim:defenseWarning', {
      bodyId: h.body.id, defenseId: defense.id, sectorId: FRONTIER,
      attackerName: 'Reach scavengers', attackerCount: 4, deadlineAt: defense.deadlineAt,
    });
    assert.equal(h.deck.offers.length, 1, 'one prompt per warning');

    // A second, distinct warning is a second decision — dedupe is per defense id.
    const other = makeBody('claim_beta');
    other.spec.defense = {
      id: 'claim_beta:9', encounterId: 'claim-defense:claim_beta:9', phase: 'warning',
      warnedAt: h.state.simTime, deadlineAt: h.state.simTime + CLAIM_DEFENSE_WARNING_S,
      attackerName: 'Reach scavengers', attackerCount: 2,
    };
    h.state.claims.bodies.push(other);
    h.bus.emit('claim:defenseWarning', {
      bodyId: other.id, defenseId: other.spec.defense.id, sectorId: FRONTIER,
      attackerName: 'Reach scavengers', attackerCount: 2, deadlineAt: other.spec.defense.deadlineAt,
    });
    assert.equal(h.deck.offers.length, 2, 'a different warning is a different decision');
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('go re-affirms the alarm waypoint through the claims-owned intent', () => {
  const h = boot();
  try {
    const defense = raiseWarning(h);
    // The player wandered the nav while deciding — go points it back at the claim.
    h.state.nav.waypoint = { kind: 'mission', missionId: 'm_keep' };
    h.deck.offers[0].spec.onChoose('go', 'test');
    assert.ok(h.deck.resolved.includes(`claim-defense:${defense.id}`), 'the card retires on choose');
    const gos = emitted(h, 'claim:defenseGo');
    assert.equal(gos.length, 1);
    assert.equal(gos[0].payload.claimId, h.body.id);
    assert.equal(gos[0].payload.defenseId, defense.id);
    assert.equal(h.state.nav.waypoint.kind, 'claim_defense',
      'the defense waypoint is re-affirmed');
    assert.equal(h.body.spec.defense.phase, 'warning', 'go leaves the defense pending arrival');
    assert.equal(emitted(h, 'claim:defenseResolved').length, 0, 'the prompt never settles the raid');
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('ignore settles the warning through the shipped ignored column', () => {
  const h = boot();
  try {
    const defense = raiseWarning(h);
    h.deck.offers[0].spec.onChoose('ignore', 'test');
    const ignores = emitted(h, 'claim:defenseIgnore');
    assert.equal(ignores.length, 1);
    assert.equal(h.body.spec.defense, null, 'the warning settles immediately');
    const resolved = emitted(h, 'claim:defenseResolved');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].payload.outcome, 'ignored');
    assert.equal(h.body.spec.totals.lostU, 70, 'ignored pays the shipped 70% loss');
    assert.ok(h.deck.resolved.includes(`claim-defense:${defense.id}`));
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('delegate spends a supported depot rotation early and settles the defense as defended', () => {
  const h = boot({ depot: makeDepot() });
  try {
    const defense = raiseWarning(h);
    const ds = h.depot.depotSupport;
    const beforeNextAt = ds.patrol.nextAt;
    h.deck.offers[0].spec.onChoose('delegate', 'test');

    const delegates = emitted(h, 'claim:defenseDelegate');
    assert.equal(delegates.length, 1);
    const spent = emitted(h, 'claim:depotPatrolSpent');
    assert.equal(spent.length, 1, 'the depot rotation spend is a real ledger event');
    assert.equal(spent[0].payload.depotId, h.depot.id);
    assert.ok(ds.patrol.nextAt >= h.state.simTime + DEPOT_PATROL_ROTATION_GAP_S,
      'the next relief posts a full rotation later — the early beat is consumed');
    assert.ok(ds.patrol.nextAt > beforeNextAt || beforeNextAt <= h.state.simTime + DEPOT_PATROL_ROTATION_GAP_S);

    const resolved = emitted(h, 'claim:defenseResolved');
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].payload.outcome, 'defended',
      'a patrol that answers settles the same column a won fight would');
    assert.equal(h.body.spec.totals.lostU, 0, 'the depot beat holds the stores');
    assert.equal(h.body.spec.totals.raidsRepelled, 1);
    assert.equal(h.body.spec.defense, null);
    assert.equal(emitted(h, 'claim:defenseDelegateRefused').length, 0);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('delegate without a supported depot is refused with the reason, and nothing settles', () => {
  const h = boot(); // no depot on the seam
  try {
    const defense = raiseWarning(h);
    h.deck.offers[0].spec.onChoose('delegate', 'test');

    assert.equal(emitted(h, 'claim:depotPatrolSpent').length, 0);
    const refused = emitted(h, 'claim:defenseDelegateRefused');
    assert.equal(refused.length, 1, 'the refusal is a named event, not silence');
    assert.equal(refused[0].payload.reason, 'no_supported_depot');
    assert.match(refused[0].payload.text, /supported depot/i);
    assert.equal(h.body.spec.defense.id, defense.id, 'a refused delegate leaves the warning live');
    assert.equal(h.body.spec.totals.lostU, 0, 'nothing was settled');
    assert.equal(emitted(h, 'claim:defenseResolved').length, 0);

    // A stale defenseId is refused too — the engine re-validates, the prompt never settles.
    h.bus.emit('claim:defenseDelegate', { claimId: h.body.id, defenseId: 'stale:99' });
    assert.equal(emitted(h, 'claim:defenseDelegateRefused').length, 2);
    assert.equal(emitted(h, 'claim:defenseDelegateRefused').at(-1).payload.reason, 'not_pending');
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});

test('the card retires when the warning window ends by any settlement path', () => {
  const h = boot();
  try {
    const defense = raiseWarning(h);
    // Timeout path: sim time runs past the deadline and claims settles 'ignored'.
    h.state.simTime += CLAIM_DEFENSE_WARNING_S + 1;
    h.sys.update(1, h.state);
    assert.ok(h.deck.resolved.includes(`claim-defense:${defense.id}`),
      'a settled defense retires its own card');
    assert.equal(h.body.spec.defense, null);
  } finally {
    h.prompt.destroy();
    setPromptDeck(null);
  }
});
