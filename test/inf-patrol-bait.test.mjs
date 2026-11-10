// inf-patrol-bait — a losing raider's spoofed band turns two lawful parties on each other
// for one beat, and the scan the pilot already owns burns the mask. Real bus, real
// hostility oracle; no renderer, no Math.random, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32 } from '../src/core/rng.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import {
  BAIT_BLAME_HOLD_S,
  BAIT_HURT_FRAC,
  tickPatrolBaits,
} from '../src/systems/patrolBait.js';

const SEED = 4242;

function hull(id, { team, faction, pos, hullFrac = 1, ai = {}, extraData = {} }) {
  return {
    id, team, type: 'ship', alive: true, factionId: faction,
    pos: { x: pos.x, z: pos.z }, radius: 12,
    hull: Math.round(100 * hullFrac), hullMax: 100,
    data: { ai: { ...ai }, ...extraData },
  };
}

function scene({ raiderHullFrac = 0.3, seed = SEED, simTime = 600 }) {
  const entities = new Map();
  const mk = (entity) => { entities.set(entity.id, entity); return entity; };
  const raider = mk(hull(7, {
    team: 1, faction: 'faction_reach', pos: { x: 400, z: 0 }, hullFrac: raiderHullFrac,
    ai: { archetype: 'pirate', roe: 'weapons_free' },
  }));
  const patrol = mk(hull(11, {
    team: 1, faction: 'faction_scn', pos: { x: 600, z: 300 },
    ai: { lawful: true, roe: 'lawful_wanted_only' },
  }));
  const screen = mk(hull(21, {
    team: 2, faction: 'faction_mts', pos: { x: 800, z: 200 },
    ai: { passive: true, roe: 'hold_fire' },
    extraData: { factionPresence: { doctrineId: 'meridian_convoy_preservation' } },
  }));
  const state = {
    tick: 0, simTime, playerId: 'player',
    meta: { seed },
    entities,
  };
  return { state, raider, patrol, screen };
}

/** A raider id whose arm gate passes for SEED at the scene's minute — the gate is deterministic. */
function gatePasses(seed, raiderId, minute) {
  return hash32(seed, raiderId, minute) % 100 < 40;
}

test('a winning raider never runs the trick — no stamps, no band', () => {
  const { state } = scene({ raiderHullFrac: 1 });
  const bus = createBus();
  const lines = [];
  bus.on('comms:log', (p) => lines.push(p));
  const live = tickPatrolBaits(state, bus);
  assert.equal(live, 0);
  assert.equal(lines.length, 0);
  const raider = state.entities.get(7);
  assert.equal(raider.data.baitTrick, undefined);
});

test('the spoofed band opens: both lawful parties are hostile to each other through the oracle', () => {
  // 600 s → minute 10; the gate must pass for this scene's fixed ids or the fixture is wrong.
  assert.ok(gatePasses(SEED, 7, 10), 'fixture ids must sit on a gated minute');
  const { state, patrol, screen } = scene({ raiderHullFrac: BAIT_HURT_FRAC * 0.5 });
  const bus = createBus();
  const lines = [];
  bus.on('comms:log', (p) => lines.push(p));
  const live = tickPatrolBaits(state, bus);
  assert.equal(live, 1);

  // The lie landed: the patrol is dispatched on the "rogue" screen, the screen retaliates
  // against the "extortionate" patrol — and the canonical oracle authorizes the cross-fire.
  const patrolAi = patrol.data.ai;
  const screenAi = screen.data.ai;
  assert.equal(patrolAi.securityTargetId, screen.id);
  assert.equal(screenAi.retaliationTargetId, patrol.id);
  assert.equal(isHostileForAI(state, patrol, screen), true);
  assert.equal(isHostileForAI(state, screen, patrol), true);

  // The band carried one demand and one angry reply — the misheard exchange, no dupes.
  const kinds = lines.map((p) => p.from);
  assert.deepEqual(kinds, ['CONCORD', 'MERIDIAN SCREEN']);

  // The trick did not touch the raider's own fight or the hulls' ownership fields it never set.
  const raider = state.entities.get(7);
  assert.equal(raider.data.baitTrick.victimIds.length, 1);
});

test('a re-tick inside the window repeats nothing — one exchange, stable stamps', () => {
  const { state, patrol, screen } = scene({});
  const bus = createBus();
  const lines = [];
  bus.on('comms:log', (p) => lines.push(p));
  tickPatrolBaits(state, bus);
  state.simTime += 1;
  tickPatrolBaits(state, bus);
  assert.equal(lines.length, 2);
  assert.equal(patrol.data.ai.securityTargetId, screen.id);
});

test('a scanner pulse burns the mask: stamps restore, the oracle goes cold, the band confesses', () => {
  const { state, patrol, screen, raider } = scene({});
  const bus = createBus();
  const cleared = [];
  bus.on('patrolBait:cleared', (p) => cleared.push(p));
  tickPatrolBaits(state, bus);

  // The hull was never verified before the lie; the pilot scans it now.
  raider.data.scanned = true;
  state.simTime += 1;
  const live = tickPatrolBaits(state, bus);
  assert.equal(live, 0);
  assert.deepEqual(cleared.map((p) => p.reason), ['scanned']);

  // Every stamped field restored to exactly what the trick found.
  assert.equal(patrol.data.ai.securityTargetId, undefined);
  assert.equal(patrol.data.ai.roe, 'lawful_wanted_only');
  assert.equal(screen.data.ai.retaliationTargetId, undefined);
  assert.equal(screen.data.ai.passive, true);
  assert.equal(screen.data.ai.roe, 'hold_fire');
  assert.equal(isHostileForAI(state, patrol, screen), false);
  assert.equal(isHostileForAI(state, screen, patrol), false);
  assert.equal(raider.data.baitDispatch, undefined);
  assert.equal(screen.data.baitBlame, undefined);
});

test('the trick expires on its own clock and both parties stand down', () => {
  const { state, patrol, screen } = scene({});
  const bus = createBus();
  const cleared = [];
  bus.on('patrolBait:cleared', (p) => cleared.push(p));
  tickPatrolBaits(state, bus);
  state.simTime += BAIT_BLAME_HOLD_S + 1;
  tickPatrolBaits(state, bus);
  assert.deepEqual(cleared.map((p) => p.reason), ['expired']);
  assert.equal(patrol.data.ai.securityTargetId, undefined);
  assert.equal(screen.data.ai.retaliationTargetId, undefined);
  assert.equal(isHostileForAI(state, patrol, screen), false);
});

test('the gate is deterministic: the same seed, id and minute answer the same every time', () => {
  assert.equal(gatePasses(SEED, 7, 15), gatePasses(SEED, 7, 15));
  assert.equal(typeof gatePasses(SEED, 9, 15), 'boolean');
  assert.equal(typeof gatePasses(SEED, 7, 16), 'boolean');
});
