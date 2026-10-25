// SEED-SW-23 — Glaive: a blade thrown out, carving back through the thrower's position once —
// one outward leg, one return pass that lands on a different body, then the arc is spent. No
// homing, no orbiting, no second turn.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { SWARM_DRAFT_OFFERS } from '../src/data/swarmDraft.js';
import { weapons } from '../src/systems/weapons.js';
import { consumeProjectileContinuation } from '../src/core/physicsAuthority.js';

const SEED = 4242;
const DEF = WEAPONS.find((d) => d.id === 'wpn_glaive_s');

test('glaive is a catalogued gun on the swarm shelf with a returning arc', () => {
  assert.ok(DEF);
  assert.equal(SWARM_DRAFT_OFFERS.find((o) => o.defId === DEF.id)?.id, 'glaive');
  assert.ok(DEF.returnArc && DEF.returnArc.legRange > 0, 'authored outward leg');
  // The pass-each-once contract is pierce on the fitted spec, not a metadata flag — the
  // def-declared piercing-core rank compiles through the same path the fire loop uses.
  const owner = { id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, team: 'player', data: {} };
  const state = { tick: 0, simTime: 0, playerId: 'player', entities: new Map(), entityList: [], entityIndex: null, spatialHash: null };
  const spec = weapons._attackSpecFor.call(
    { state, helpers: {}, bus: { emit: () => {} } },
    { defId: DEF.id, slotIndex: 0 }, DEF, state, owner);
  assert.ok(spec.propagation.pierce >= 1, `pierce ${spec.propagation.pierce} — each pass lands once`);
});

test('the blade flies out, turns once through the thrower, then is spent', () => {
  void SEED;
  const owner = {
    id: 'player', type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, team: 'player', data: {},
  };
  const blade = {
    id: 'g1', type: 'projectile', alive: true,
    pos: { x: 10, z: 0 }, vel: { x: 320, z: 0 }, radius: 3, rot: 0,
    ownerId: 'player', team: 'player',
    data: {
      weaponId: DEF.id, returnArc: { ...DEF.returnArc, phase: 'out' },
      spawnPos: { x: 0, z: 0 }, maxDistance: 600,
    },
  };
  const entities = new Map([[owner.id, owner], [blade.id, blade]]);
  const state = {
    tick: 5, simTime: 0, playerId: 'player', entities,
    entityList: [...entities.values()], entityIndex: null, spatialHash: null,
  };
  const host = { state, _entityGetter: (id) => entities.get(id) || null };
  // Outward leg: still short of the authored range → keeps flying +x, no turn yet.
  weapons._tickReturnArc.call(host, 1 / 60, state);
  assert.equal(blade.data.returnArc.phase, 'out');
  assert.equal(Math.sign(blade.vel.x), 1);
  // Past legRange → the single redirect points back through the thrower.
  blade.pos.x = DEF.returnArc.legRange + 5;
  weapons._tickReturnArc.call(host, 1 / 60, state);
  assert.equal(blade.data.returnArc.phase, 'return');
  assert.ok(blade.vel.x < 0, `returning toward the thrower, vx=${blade.vel.x}`);
  const speed = Math.hypot(blade.vel.x, blade.vel.z);
  assert.ok(Math.abs(speed - 320) < 1e-6, 'redirect keeps the thrown speed');
  // The bolt is a Rapier-owned bullet: the redirect must reach the real body through the
  // projectile continuation membrane — a bare vel mirror would die in the post-step readback
  // and the return leg would never fly.
  const continuation = consumeProjectileContinuation(blade);
  assert.ok(continuation, 'redirect queued through the projectile continuation membrane');
  assert.ok(continuation.velocity.x < 0, 'continuation carries the return velocity');
  assert.equal(consumeProjectileContinuation(blade), null, 'the membrane consumes once');
  // Fly the return leg back across the thrower's position.
  for (let i = 0; i < 120; i++) {
    blade.pos.x += blade.vel.x / 60;
    blade.pos.z += blade.vel.z / 60;
    weapons._tickReturnArc.call(host, 1 / 60, state);
  }
  assert.equal(blade.data.returnArc.phase, 'done', 'arc spent after passing through the thrower');
  assert.ok(blade.pos.x < 0, 'the blade passed through, not around');
  assert.equal(blade.alive, false, 'the bolt expires with its return — nothing lingers');
});
