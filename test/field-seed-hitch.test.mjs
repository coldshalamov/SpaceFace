// Field hitch reachable via tether (INFERENCE-16).
//
// The Mass Seed's advertised function — a lock-ring a delivered body gets hitched
// to — was presentation-only: FIELD_DEFS.seed carried lockStrength 400 and the
// kernel's hitch branch was implemented, but no production code ever registered a
// seed field or latched a hitch. The live seed now mirrors into the kernel while
// it is active, ring-entry edges (rope-delivered bodies, drifting loose mass)
// latch hitches through it, and re-roping a clamped body is the manual release.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { fields, fieldBodyProfile } from '../src/systems/fields.js';
import { massSeed } from '../src/systems/massSeed.js';
import { fieldContainsPoint } from '../src/core/fields/fieldKernel.js';
import { FIELD_DEFS, FIELD_ESCAPE_BOOST_ACCEL, FIELD_FLAGS } from '../src/data/fields.js';

const DT = SIM_DT;
const SEED = 16000;

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function boot(seed = SEED, opts = {}) {
  const bus = createBus();
  const emitted = [];
  bus.on('fields:hitchLatched', (p) => emitted.push({ name: 'fields:hitchLatched', payload: p }));
  bus.on('fields:hitchCut', (p) => emitted.push({ name: 'fields:hitchCut', payload: p }));
  const sim = createSimulation({
    seed,
    bus,
    systems: opts.withPhysics ? [fields, massSeed, physics] : [fields, massSeed],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  return {
    sim, state, player, emitted,
    bus: sim.bus,
    fieldsSys: sim.registry.get('fields'),
    massSeedSys: sim.registry.get('massSeed'),
    physicsSys: sim.registry.get('physics'),
  };
}

function deploySeedToActive(t) {
  const { state } = t;
  state.input.actions.deployMassSeed = true;
  t.sim.step();
  for (let i = 0; i < 240 && state.massSeed.phase !== 'active'; i++) t.sim.step();
  assert.equal(state.massSeed.phase, 'active', 'the seed locks within its authored schedule');
  t.sim.step(); // fields runs before massSeed in the system list — one more tick mirrors the field
  const ent = state.entities.get(state.massSeed.seedId);
  assert.ok(ent && ent.alive !== false, 'the anchor entity exists');
  return ent;
}

function makeShip(opts = {}) {
  return {
    type: 'ship', team: 1,
    pos: { x: opts.x ?? 0, z: opts.z ?? 0 },
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 12, collides: true,
    hull: 120, hullMax: 120,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 20, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  };
}

function seedField(t) {
  return t.fieldsSys._kernel.get(`field_seed_lock_${t.state.massSeed.seedId}`);
}

test('the live mass seed mirrors a real lock-ring field into the kernel', () => {
  withFlag(true, () => {
    const t = boot();
    const ent = deploySeedToActive(t);
    const f = seedField(t);
    assert.ok(f, 'a kernel field exists for the active seed');
    assert.equal(f.sourceId, t.state.massSeed.seedId, 'hitch matching keys on the seed entity id');
    assert.equal(f.lockStrength, FIELD_DEFS.seed.lockStrength);
    assert.equal(f.strength, 0, 'un-latched bodies feel no standing gravity');
    assert.equal(f.radius, FIELD_DEFS.seed.radius);
    assert.equal(f.tag, 'external', 'the mirror stays out of serialize, the cap, and the funnel publish');
    assert.equal(f.ownerId, t.player.id);
    assert.ok(Math.hypot(f.center.x - ent.pos.x, f.center.z - ent.pos.z) < 1e-3);
  });
});

test('a rope-delivered body latches on ring entry; the ring clamps it', () => {
  withFlag(true, () => {
    const t = boot();
    deploySeedToActive(t);
    const f = seedField(t);
    const rt = t.state.fields;
    const victim = t.sim.spawn(makeShip({ x: f.center.x + f.radius + 120, z: f.center.z }));
    t.state.player.tether = { active: true, targetId: victim.id, phase: 'taut' };
    t.sim.step();
    assert.equal(rt.hitches[victim.id], undefined, 'outside the ring is not a hitch');

    victim.pos.x = f.center.x + f.radius * 0.4;
    t.sim.step();
    const rec = rt.hitches[victim.id];
    assert.ok(rec, 'crossing the ring boundary while towed latches the hitch');
    assert.equal(rec.sourceId, t.state.massSeed.seedId);
    const profile = fieldBodyProfile(victim, t.state, {});
    assert.equal(profile.hitchedTo, t.state.massSeed.seedId, 'the kernel hitch branch sees the latch');
    assert.ok(t.emitted.some((e) => e.name === 'fields:hitchLatched'));
  });
});

test('roping the anchor itself never self-hitches', () => {
  withFlag(true, () => {
    const t = boot();
    const ent = deploySeedToActive(t);
    const rt = t.state.fields;
    // The seed IS the rope anchor — towing it is the feature's primary verb. A self-hitch
    // would fire toast/cue noise and burn a slot every time.
    t.state.player.tether = { active: true, targetId: ent.id, phase: 'taut' };
    t.sim.step();
    t.sim.step();
    assert.equal(rt.hitches[ent.id], undefined, 'the anchor cannot be its own catch');
    assert.equal(rt.hitches[String(ent.id)], undefined);
    assert.ok(!t.emitted.some((e) => e.name === 'toast' && /Hitched to the anchor/.test(e.payload?.text || '')),
      'no hitched toast for the anchor itself');
  });
});

test('release the rope and the body stays parked; re-roping pulls it free', () => {
  withFlag(true, () => {
    const t = boot();
    deploySeedToActive(t);
    const f = seedField(t);
    const rt = t.state.fields;
    const victim = t.sim.spawn(makeShip({ x: f.center.x, z: f.center.z }));
    t.state.player.tether = { active: true, targetId: victim.id, phase: 'taut' };
    t.sim.step();
    assert.ok(rt.hitches[victim.id], 'delivered into the ring');

    t.state.player.tether.active = false;
    for (let i = 0; i < 5; i++) t.sim.step();
    assert.ok(rt.hitches[victim.id], 'the clamp does not need the rope');

    t.bus.emit('tether:latched', { targetId: victim.id });
    assert.equal(rt.hitches[victim.id], undefined, 're-roping the body cuts the hitch');
    t.sim.step();
    t.sim.step();
    assert.equal(rt.hitches[victim.id], undefined, 'a freed body inside the ring does not re-latch');
  });
});

test('loose mass drifting through the ring is caught; ships are not auto-trapped', () => {
  withFlag(true, () => {
    const t = boot();
    deploySeedToActive(t);
    const f = seedField(t);
    const rt = t.state.fields;
    const pod = t.sim.spawn({
      type: 'pickup', pos: { x: f.center.x + f.radius + 60, z: f.center.z },
      vel: { x: 0, z: 0 }, radius: 4, alive: true, data: { kind: 'ore' },
    });
    pod.pos.x = f.center.x; // drifted inside between ticks
    t.sim.step();
    assert.ok(rt.hitches[pod.id], 'a pickup inside the ring is latched');

    const bandit = t.sim.spawn(makeShip({ x: f.center.x, z: f.center.z }));
    t.sim.step();
    assert.equal(rt.hitches[bandit.id], undefined, 'ships are never auto-caught — the ring is a parking tool');
  });
});

test('killing the seed drops the ring field and frees what it held', () => {
  withFlag(true, () => {
    const t = boot();
    const ent = deploySeedToActive(t);
    const f = seedField(t);
    const rt = t.state.fields;
    const victim = t.sim.spawn(makeShip({ x: f.center.x, z: f.center.z }));
    t.state.player.tether = { active: true, targetId: victim.id, phase: 'taut' };
    t.sim.step();
    assert.ok(rt.hitches[victim.id]);

    ent.alive = false;
    t.sim.step();
    assert.ok(seedField(t) == null, 'the kernel mirror retires with the seed');
    assert.equal(rt.hitches[victim.id], undefined, 'the hitch dies with its anchor');
  });
});

test('the lock holds against boost and lets go when the hitch is cut', async () => {
  await withFlag(true, async () => {
    const t = boot(SEED + 1, { withPhysics: true });
    t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    assert.equal(await t.physicsSys.prepareBackend(t.state), true, 'rapier initializes headless');
    try {
      deploySeedToActive(t);
      const f = seedField(t);
      const rt = t.state.fields;
      // Just outside the fixed seed hull (radius 7) + victim radius (12): r=20 clears the
      // overlap while staying inside the capture zone where lockStrength·falloff beats the
      // authored escape accel (400·(1-20/42) ≈ 210 > 200). Spawning at exact center puts a
      // dynamic body inside the anchor and Rapier depenetrates it out of the volume — a
      // contact artifact, not a hitch verdict.
      const victim = t.sim.spawn(makeShip({ x: f.center.x + 20, z: f.center.z }));
      t.state.player.tether = { active: true, targetId: victim.id, phase: 'taut' };
      t.sim.step();
      assert.ok(rt.hitches[victim.id]);

      // Boost hard radially outward at the authored escape accel: the hitch lock pins the
      // body against the anchor hull where lock·falloff still beats FIELD_ESCAPE_BOOST_ACCEL —
      // matching the authored counterplay contract ("boost cannot beat the hitch lock").
      const out = { x: f.center.x - victim.pos.x, z: f.center.z - victim.pos.z };
      const outLen = Math.hypot(out.x, out.z) || 1;
      const escape = { x: (out.x / outLen) * -FIELD_ESCAPE_BOOST_ACCEL, z: (out.z / outLen) * -FIELD_ESCAPE_BOOST_ACCEL };
      for (let i = 0; i < 90; i++) {
        const mass = victim.physicsBody && victim.physicsBody.mass || 20;
        queuePhysicsImpulse(victim, { x: escape.x * mass * DT, y: 0, z: escape.z * mass * DT });
        t.sim.step();
      }
      assert.ok(fieldContainsPoint(seedField(t), victim.pos.x, victim.pos.z),
        'the clamp holds a boosting body inside the ring');

      t.fieldsSys.cutFieldHitch(t.state, victim.id);
      for (let i = 0; i < 120; i++) {
        const mass = victim.physicsBody && victim.physicsBody.mass || 20;
        queuePhysicsImpulse(victim, { x: escape.x * mass * DT, y: 0, z: escape.z * mass * DT });
        t.sim.step();
      }
      assert.ok(!fieldContainsPoint(seedField(t), victim.pos.x, victim.pos.z),
        'a cut hitch lets the same thrust leave the ring');
    } finally {
      if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') t.physicsSys._disableSg02DynamicAuthority();
    }
  });
});
