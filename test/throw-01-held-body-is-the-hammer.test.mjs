// THROW-01 — the body on your Line is your hammer: while latched it takes heavily reduced contact
// damage (so the swing never kills the thing you are about to throw); cut free, it takes full damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import {
  collisionConsequences, HELD_BODY_CONTACT_DAMAGE_SCALE, isHeldOnPlayerLine,
} from '../src/systems/collisionConsequences.js';

function route(state, target) {
  const seen = [];
  const host = Object.create(collisionConsequences);
  host.state = state;
  host.registry = { get: (k) => (k === 'combat' ? { kernel: { routeDamage: (i) => { seen.push(i); return null; } } } : null) };
  const receipt = { impactDamage: 100, surface: 'hull', pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 },
    provenance: { actorId: 1, weaponId: 'x', tag: 'massline' } };
  host._routeImpactDamage(target, { id: 9, type: 'asteroid' }, receipt);
  const channels = seen[0].packet.channels || {};
  return Object.values(channels).reduce((a, b) => a + (Number(b) || 0), 0) || seen[0].packet.amount || 0;
}

test('a latched body takes reduced contact damage; free, it takes full damage', () => {
  const saved = { ...MASSLINE2_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
  try {
    const target = { id: 2, type: 'ship', alive: true, team: 1, hull: 1000, shield: 0 };
    const state = { playerId: 1, player: { tether: { active: true, targetId: 2 } } };
    assert.equal(isHeldOnPlayerLine(state, target), true);
    const held = route(state, target);
    state.player.tether.active = false;
    assert.equal(isHeldOnPlayerLine(state, target), false);
    const free = route(state, target);
    assert.ok(free > 0, 'a free body takes the full blow');
    assert.ok(Math.abs(held / free - HELD_BODY_CONTACT_DAMAGE_SCALE) < 1e-6, `held ${held} vs free ${free}`);
    // A huge blow can never finish the held body: capped to a share of what it has left.
    state.player.tether.active = true;
    const frail = { id: 2, type: 'ship', alive: true, team: 1, hull: 10, shield: 0 };
    assert.ok(route(state, frail) <= 10 * 0.2 + 1e-9, 'one blow cannot finish a held body');
    // A body that is NOT the one on the line is unaffected, and the player never is.
    state.player.tether = { active: true, targetId: 77 };
    assert.equal(isHeldOnPlayerLine(state, target), false);
    state.player.tether = { active: true, targetId: 1 };
    assert.equal(isHeldOnPlayerLine(state, { id: 1, type: 'ship' }), false);
  } finally { Object.assign(MASSLINE2_FLAGS, saved); }
});

test('the whip recoil (second contact path) also spares the held body; free, the club pays in full', async () => {
  const { masslineImpactDamage } = await import('../src/systems/masslineImpactDamage.js');
  const saved = { ...MASSLINE2_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true, impactDamage: true });
  try {
    const target = { id: 2, type: 'ship', alive: true, team: 1, hull: 60, shield: 0, pos: { x: 0, z: 0 } };
    const state = { playerId: 1, player: { tether: { active: true, targetId: 2 } } };
    const hits = [];
    const host = Object.create(masslineImpactDamage);
    host.state = state;
    host._entity = (id) => (id === 2 ? target : null);
    host._routeKinetic = (mass, damage) => hits.push(damage);
    const whip = { rating: 'crushing', targetId: 2, momentum: 100000 };
    host._onWhipImpact(whip);
    state.player.tether.active = false;
    host._onWhipImpact(whip);
    assert.equal(hits.length, 2);
    assert.ok(hits[0] <= 60 * 0.2 + 1e-9, `held recoil ${hits[0]} must not finish a 60-hull body`);
    assert.ok(hits[1] >= 60, `free recoil ${hits[1]} pays in full`);
  } finally { Object.assign(MASSLINE2_FLAGS, saved); }
});
