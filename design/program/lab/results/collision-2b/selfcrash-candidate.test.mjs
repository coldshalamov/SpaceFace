// Phase 2b #7: a self-piloted crash (direct_contact crediting the hull itself) may take at most SELF_CRASH_MAX_TOUGHNESS_SHARE of a hull's
// full toughness; a contact with a real cause (player, weapon, rope, another hull) keeps the full
// crumple law. Drives the real _resolveContact -> resolveCollisionConsequence -> damage route with
// a stub combat kernel that records the routed packet.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import {
  collisionConsequences, SELF_CRASH_MAX_TOUGHNESS_SHARE, selfCrashDamageCap,
} from '../src/systems/collisionConsequences.js';
import { resetPendingSlams } from '../src/systems/hullFracture.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight'; state.tick = 900; state.world.currentSectorId = 'sector-test';
  const bus = createBus();
  const helpers = { spawnEntity(spec) { const e = makeEntity(spec); e.id = state.nextEntityId++; e.alive = true; state.entities.set(e.id, e); state.entityList.push(e); return e; } };
  const routed = [];
  const sys = Object.create(collisionConsequences);
  sys.init({ state, bus, helpers, registry: { get: (id) => (id === 'combat' ? { kernel: { routeDamage(p) { routed.push(p); return { ok: true }; } } } : null) } });
  return { state, bus, helpers, sys, routed };
}
const wasp = (h) => h.helpers.spawnEntity({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 16,
  hull: 55, hullMax: 55, shield: 25, shieldMax: 25, data: { defId: 'ship_wasp' } });
const rock = (h) => h.helpers.spawnEntity({ type: 'asteroid', pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, radius: 22, mass: 480, collides: true, hull: 1e6, hullMax: 1e6 });
const slam = (speed) => ({ pos: { x: 10, z: 0 }, normal: { x: 1, z: 0 }, preSolveClosingSpeed: speed, tick: 900, kind: 'contact' });
const dmg = (p) => p.packet.channels ? Object.values(p.packet.channels).reduce((s, x) => s + (x || 0), 0) : p.packet.damage;

describe('self-crash damage cap', { concurrency: false }, () => {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  process.on('exit', () => { COMBAT_FLAGS.weaponImpulseConsequences = prev; });

  it('a hull flying itself into a rock at 100 wu/s loses at most the share, not its life', () => {
    resetPendingSlams(); const h = boot();
    try {
      const w = wasp(h); const r = rock(h);
      const self = Object.freeze({ actorId: w.id, weaponId: null, tag: 'direct_contact', appliedTick: 900 });
      h.sys._resolveContact(w, r, slam(100), 16 * 100, 900, self, false);
      assert.equal(h.routed.length, 1);
      const cap = SELF_CRASH_MAX_TOUGHNESS_SHARE * 80;
      assert.ok(Math.abs(dmg(h.routed[0]) - cap) < 1e-6, `routed ${dmg(h.routed[0])} == cap ${cap}`);
      assert.ok(cap < 80, 'one self-crash can never empty a full hull');
    } finally { h.sys.destroy(); h.bus.clear(); resetPendingSlams(); }
  });

  it('an uncredited environment contact (hazard, kill machine) keeps the full law', () => {
    resetPendingSlams(); const h = boot();
    try {
      const w = wasp(h); const r = rock(h);
      h.sys._resolveContact(w, r, slam(120), 16 * 120, 900, null, false);
      assert.ok(dmg(h.routed[0]) > SELF_CRASH_MAX_TOUGHNESS_SHARE * 80 * 2);
    } finally { h.sys.destroy(); h.bus.clear(); resetPendingSlams(); }
  });

  it('a contact the player caused keeps the full crumple law', () => {
    resetPendingSlams(); const h = boot();
    try {
      const w = wasp(h); const r = rock(h);
      const byPlayer = Object.freeze({ actorId: 1, weaponId: 'wpn_concussion_cannon_s', tag: 'weapon_hit', appliedTick: 899 });
      h.sys._resolveContact(w, r, slam(100), 16 * 100, 900, byPlayer, false);
      assert.ok(dmg(h.routed[0]) > SELF_CRASH_MAX_TOUGHNESS_SHARE * 80 * 2, `full law: ${dmg(h.routed[0])}`);
    } finally { h.sys.destroy(); h.bus.clear(); resetPendingSlams(); }
  });

  it('gentle self-bumps under the cap are untouched', () => {
    resetPendingSlams(); const h = boot();
    try {
      const w = wasp(h); const r = rock(h);
      const self = Object.freeze({ actorId: w.id, weaponId: null, tag: 'direct_contact', appliedTick: 900 });
      h.sys._resolveContact(w, r, slam(36), 16 * 36, 900, self, false);
      const d = h.routed.length ? dmg(h.routed[0]) : 0;
      // crumple: 0.5 * (36-30)^2 * (16/16) * 1.15 = 20.7 < cap 28
      assert.ok(Math.abs(d - 20.7) < 0.01, `uncapped small bump ${d}`);
    } finally { h.sys.destroy(); h.bus.clear(); resetPendingSlams(); }
  });

  it('selfCrashDamageCap: only self / uncaused tags, and only with a known toughness', () => {
    const t = { id: 7, hullMax: 100, shieldMax: 50, armorMax: 50 };
    assert.equal(selfCrashDamageCap(t, { tag: 'direct_contact', actorId: 7 }), 70);
    assert.equal(selfCrashDamageCap(t, { tag: 'environment', actorId: null }), Infinity, 'uncredited hazard');
    assert.equal(selfCrashDamageCap(t, { tag: 'direct_contact', actorId: 9 }), Infinity, 'rammed by another hull');
    assert.equal(selfCrashDamageCap(t, { tag: 'massline', actorId: 7 }), Infinity);
    assert.equal(selfCrashDamageCap({ id: 1 }, { tag: 'direct_contact', actorId: 1 }), Infinity, 'no toughness');
  });
});
