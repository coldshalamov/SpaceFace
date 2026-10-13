// WF-05: a dumb round names its cause — one guidanceLost + one cue, once per round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weapons } from '../src/systems/weapons.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { combatVerbRecipe, playAuthoredVerbCue } from '../src/audio/combatVerbCues.js';

function busOf() {
  const events = [];
  const listeners = new Map();
  return {
    events,
    on(n, f) { if (!listeners.has(n)) listeners.set(n, new Set()); listeners.get(n).add(f); return () => listeners.get(n).delete(f); },
    emit(n, p) { events.push({ name: n, payload: p }); for (const f of listeners.get(n) || []) f(p); },
  };
}

function missile(id, ownerId, targetId, extra = {}) {
  return {
    id, type: 'projectile', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 100, z: 0 }, rot: 0,
    data: { kind: 'missile', armed: true, ownerId, targetId, turnRate: 2.5, projSpeed: 300, projAccel: 0, fuelS: 0, ...extra },
  };
}

test('a burning-out player missile emits one guidanceLost (burnout) + one cue; a hit emits none', () => {
  const prev = COMBAT_FLAGS.missileV2;
  COMBAT_FLAGS.missileV2 = true;
  try {
    const bus = busOf();
    const target = { id: 'tgt', alive: true, pos: { x: 500, z: 0 } };
    const host = { bus, helpers: { getEntity: (id) => (id === 'tgt' ? target : null) } };
    // Burnout: fuel about to expire, target live and ahead so only fuel kills guidance.
    const dumb = missile('m1', 'player', 'tgt', { fuelS: 5.99 });
    const state = { playerId: 'player', tick: 4242, entityIndex: { projectiles: [dumb] } };
    weapons._steerHoming.call(host, 0.05, state);
    const lost = bus.events.filter((e) => e.name === 'missile:guidanceLost');
    assert.equal(lost.length, 1, 'exactly one guidance loss');
    assert.equal(lost[0].payload.reason, 'burnout');
    assert.equal(lost[0].payload.missileId, 'm1');
    // Second tick coasting: no second emit.
    weapons._steerHoming.call(host, 0.05, state);
    assert.equal(bus.events.filter((e) => e.name === 'missile:guidanceLost').length, 1, 'one play per round');
    // The verb-cue table answers it with an existing recipe (no new sample).
    assert.equal(combatVerbRecipe('missile:guidanceLost'), 'sfx_wanted_clear');
    let plays = 0;
    playAuthoredVerbCue({ play: () => { plays++; return true; } }, 'missile:guidanceLost', lost[0].payload);
    assert.equal(plays, 1);

    // A healthy round that stays in cone/range emits nothing.
    const bus2 = busOf();
    const host2 = { bus: bus2, helpers: { getEntity: (id) => (id === 'tgt' ? target : null) } };
    const live = missile('m2', 'player', 'tgt', { fuelS: 0 });
    const state2 = { playerId: 'player', tick: 4242, entityIndex: { projectiles: [live] } };
    weapons._steerHoming.call(host2, 0.05, state2);
    assert.equal(bus2.events.filter((e) => e.name === 'missile:guidanceLost').length, 0, 'a guiding round stays silent');
  } finally { COMBAT_FLAGS.missileV2 = prev; }
});

test('an NPC round losing guidance stays silent (no cue spam)', () => {
  const prev = COMBAT_FLAGS.missileV2;
  COMBAT_FLAGS.missileV2 = true;
  try {
    const bus = busOf();
    const target = { id: 'tgt', alive: true, pos: { x: 500, z: 0 } };
    const host = { bus, helpers: { getEntity: (id) => (id === 'tgt' ? target : null) } };
    const npc = missile('m9', 'npc-1', 'tgt', { fuelS: 9 });
    weapons._steerHoming.call(host, 0.05, { playerId: 'player', tick: 4242, entityIndex: { projectiles: [npc] } });
    assert.equal(bus.events.filter((e) => e.name === 'missile:guidanceLost').length, 0);
  } finally { COMBAT_FLAGS.missileV2 = prev; }
});
