import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

const DT = 1 / 60;

function body(id, { type = 'ship', x = 0, z = 0, vx = 0, mass = 24, shape = 'capsule' } = {}) {
  return {
    id, type, alive: true, collides: true, mass, radius: 6,
    pos: { x, z }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0,
    combatSpeed: 100, maxSpeed: 100, data: { defId: 'ship_kestrel' },
    physicsBody: { schemaVersion: 1, radius: 6, mass, inertiaY: 48,
      dynamic: true, ccd: true, revision: 0, shape },
  };
}

async function simulate(a, b, { ticks = 120, impulseSpeed = 0, guarded = true } = {}) {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  if (!guarded) owner._prepareContactMotionBudgets = () => {};
  try {
    owner.syncFromEntities([a, b]);
    const initialSeparation = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    if (impulseSpeed) {
      for (const e of [a, b]) queuePhysicsImpulse(e, { x: e.mass * impulseSpeed, z: 0 });
    }
    const coast = a.vel.x + impulseSpeed;
    let maxCoastError = 0, maxSpin = 0, contacts = 0, damage = 0, helmLoss = 0;
    for (let i = 0; i < ticks; i++) {
      owner.step(DT);
      for (const e of [a, b]) {
        maxCoastError = Math.max(maxCoastError, Math.hypot(e.vel.x - coast, e.vel.z));
        maxSpin = Math.max(maxSpin, Math.abs(e.angVel));
      }
      for (const contact of owner.drainContactImpacts()) {
        contacts++;
        for (const [target, other] of [[a, b], [b, a]]) {
          const consequence = resolveCollisionConsequence({
            target, other, exchangedMomentum: contact.impulse,
            preSolveClosingSpeed: contact.preSolveClosingSpeed,
            preSolveContactSpeed: contact.preSolveContactSpeed,
            availableContactDeltaV: target.id === contact.aId
              ? contact.availableContactDeltaVA : contact.availableContactDeltaVB,
            wreckDamageOnly: target.type === 'wreck', tick: i,
          });
          damage += consequence?.impactDamage || 0;
          if (consequence && consequence.control !== 'none') helmLoss++;
        }
      }
    }
    return { a, b, maxCoastError, maxSpin, contacts, damage, helmLoss, initialSeparation,
      separation: Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) };
  } finally {
    owner.dispose();
  }
}

test('overlapping stationary NPCs separate without inventing speed, damage, or helm loss', async t => {
  for (const gap of [0, 1, 4]) {
    // The second location is far outside a normal gameplay camera. Simulation and impact
    // admission must not depend on whether the player happens to see the overlap.
    for (const origin of [0, 12000]) {
      const result = await simulate(body(1, { x: origin }), body(2, { x: origin + gap }));
      t.diagnostic(JSON.stringify({ gap, origin, maxSpeed: result.maxCoastError,
        contacts: result.contacts, damage: result.damage, separation: result.separation }));
      assert.ok(result.contacts > 0, 'the native solver must actually resolve the overlapping pair');
      assert.ok(result.maxCoastError < 0.1, 'position correction must not launch a stationary pilot');
      assert.ok(result.maxSpin < 0.1, 'position correction must not spin a stationary pilot');
      assert.equal(result.damage, 0, 'depenetration force is not a damaging impact');
      assert.equal(result.helmLoss, 0, 'depenetration force is not a combat stun');
      assert.ok(result.separation > 6 && result.separation < 20, 'native separation still resolves locally');
    }
  }
});

test('co-moving ships retain earned speed while their overlapping hulls separate', async () => {
  const result = await simulate(body(1, { vx: 100 }), body(2, { vx: 100 }));
  assert.ok(result.contacts > 0);
  assert.ok(result.maxCoastError < 0.1, 'absolute speed must not be mistaken for approaching motion');
  assert.ok(result.a.pos.x > 180 && result.b.pos.x > 180, 'both hulls really traverse at their earned speed');
  assert.equal(result.damage, 0);
});

test('queued external impulses stay in the trusted motion baseline during separation', async () => {
  const result = await simulate(body(1), body(2), { impulseSpeed: 120 });
  assert.ok(result.contacts > 0);
  assert.ok(result.maxCoastError < 0.1, 'the solver guard must preserve an authored external impulse');
  assert.ok(result.a.pos.x > 220 && result.b.pos.x > 220);
  assert.equal(result.damage, 0);
});

test('co-created debris of unequal mass settles without a chain of invented kicks', async () => {
  for (const shape of ['ball', 'capsule']) {
    const result = await simulate(
      body(1, { type: 'wreck', mass: 2, shape }),
      body(2, { type: 'wreck', mass: 24, shape }),
    );
    assert.ok(result.separation > result.initialSeparation + 1, 'native depenetration must actually occur');
    assert.ok(result.maxCoastError < 0.1, `${shape} debris must not be propelled by overlap correction`);
    assert.ok(result.maxSpin < 0.1, `${shape} debris must not gain a spin engine`);
    assert.equal(result.damage, 0);
    assert.ok(result.separation > 6 && result.separation < 20);
  }
});

test('real gentle and high-energy contacts still exchange momentum across mass classes', async () => {
  const gentle = await simulate(body(1, { x: -11, vx: 4 }), body(2), { ticks: 180 });
  assert.ok(gentle.contacts > 0);
  assert.ok(gentle.b.vel.x > 1.8 && gentle.b.vel.x < 2.2, 'a gentle bump pushes its neighbour');
  assert.ok(Math.abs(gentle.a.vel.x + gentle.b.vel.x - 4) < 0.01, 'the ordinary bump conserves momentum');
  assert.equal(gentle.damage, 0);

  for (const mass of [2, 24, 400]) {
    const hit = await simulate(body(1, { x: -40, vx: 120, mass }), body(2), { ticks: 60 });
    assert.ok(hit.contacts > 0);
    assert.ok(hit.b.vel.x > 5, 'a real incoming body still transfers meaningful motion');
    assert.ok(hit.a.vel.x < 120, 'the incoming body pays for the transferred motion');
    assert.ok(hit.damage > 0, 'committed impacts retain their gameplay damage');
  }
});

test('the player ram retains the native knock and the existing player contact policy', async () => {
  const results = [];
  for (const guarded of [false, true]) {
    const player = body(1, { x: -40, vx: 120 });
    player.isPlayer = true;
    results.push(await simulate(player, body(2), { ticks: 60, guarded }));
  }
  const [native, guarded] = results;
  assert.ok(guarded.b.vel.x > 20, 'a committed player ram still launches the other hull');
  assert.ok(guarded.a.vel.x < 120, 'the player still pays for a real collision');
  for (const id of ['a', 'b']) {
    assert.ok(Math.hypot(native[id].vel.x - guarded[id].vel.x, native[id].vel.z - guarded[id].vel.z) < 0.001,
      'the aggregate energy guard preserves this genuine native impact');
  }
});

function roundDebris(id, options) {
  const e = body(id, { type: 'wreck', shape: 'ball', ...options });
  e.data = {}; // Known round geometry lets the fixture put the bodies exactly in contact.
  return e;
}

test('same-step three- and five-body strikes retain native chain motion and downstream damage', async t => {
  for (const count of [3, 5]) {
    const results = [];
    for (const guarded of [false, true]) {
      const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
      // A/B the added guard against the same native solver and pre-existing structural give.
      if (!guarded) owner._prepareContactMotionBudgets = () => {};
      const bodies = Array.from({ length: count }, (_, i) => roundDebris(i + 1,
        { x: (i - 1) * 12, vx: i === 0 ? 120 : 0 }));
      try {
        owner.syncFromEntities(bodies);
        let firstContacts;
        for (let i = 0; i < 60; i++) {
          owner.step(DT);
          const contacts = owner.drainContactImpacts();
          if (i === 0) firstContacts = contacts;
        }
        results.push({ velocities: bodies.map(e => e.vel.x), firstContacts, bodies });
      } finally { owner.dispose(); }
    }
    const [native, guarded] = results;
    for (let i = 0; i < count; i++) {
      assert.ok(Math.abs(native.velocities[i] - guarded.velocities[i]) < 0.001,
        'a real chain keeps the native transfer, including upstream braking');
    }
    const last = guarded.firstContacts.find(r => r.aId === count - 1 && r.bId === count);
    assert.ok(last, 'the last two bodies contact in the SAME solve as the initial strike');
    assert.equal(last.preSolveContactSpeed, 0, 'the last pair had no initial approach of its own');
    assert.ok(last.availableContactDeltaVB > 60, 'incoming island motion can reach the resting end');
    const damage = resolveCollisionConsequence({ target: guarded.bodies.at(-1), other: guarded.bodies.at(-2),
      exchangedMomentum: last.impulse, preSolveClosingSpeed: last.preSolveClosingSpeed,
      preSolveContactSpeed: last.preSolveContactSpeed, availableContactDeltaV: last.availableContactDeltaVB,
      wreckDamageOnly: true });
    assert.ok(damage.impactDamage > 0, 'a genuine downstream chain impact still damages the end body');
    assert.ok(guarded.velocities.at(-1) > 20, 'the end body really moves');
    t.diagnostic(JSON.stringify({ count, native: native.velocities, guarded: guarded.velocities,
      downstreamDamage: damage.impactDamage }));
  }
});

test('multi-body overlap cannot repeatedly multiply a tiny amount of incoming motion', async () => {
  for (const gap of [0, 4, 11.5]) {
    for (const speed of [0, 0.02, 0.3]) {
      const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
      const bodies = Array.from({ length: 5 }, (_, i) => roundDebris(i + 1,
        { x: i * gap, vx: i === 0 ? speed : 0 }));
      try {
        owner.syncFromEntities(bodies);
        const initialEnergy = 0.5 * bodies[0].mass * speed * speed;
        for (let i = 0; i < 600; i++) {
          owner.step(DT); owner.drainContactImpacts();
          let energy = 0;
          for (const e of bodies) {
            const velocity = Math.hypot(e.vel.x, e.vel.z);
            assert.ok(velocity <= speed + 0.1, 'resting or gently drifting debris must not launch');
            energy += 0.5 * e.mass * velocity * velocity + 0.5 * e.physicsBody.inertiaY * e.angVel * e.angVel;
          }
          // Native forces below the impact-event threshold leave tiny numerical settling.
          assert.ok(energy <= initialEnergy + 0.1, 'contact correction cannot multiply island energy over ten seconds');
        }
      } finally { owner.dispose(); }
    }
  }
});

test('a fixed station does not share one ship impact with an unrelated gentle contact', async () => {
  const incoming = roundDebris(1, { x: -25.9, vx: 120 });
  const resting = roundDebris(2, { x: 25.9, vx: -0.1 });
  const station = body(3, { type: 'station', mass: 1_000_000, shape: 'ball' });
  station.data = {}; station.radius = station.physicsBody.radius = 20; station.physicsBody.dynamic = false;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    owner.syncFromEntities([incoming, resting, station]);
    let hit = false, restContact = false, damage = 0;
    for (let i = 0; i < 60; i++) {
      owner.step(DT);
      for (const r of owner.drainContactImpacts()) {
        if (r.aId === incoming.id) hit = true;
        if (r.aId !== resting.id) continue;
        restContact = true;
        assert.ok(r.availableContactDeltaVA <= 0.201,
          'this contact can spend only its own gentle approach energy');
        const consequence = resolveCollisionConsequence({ target: resting, other: station,
          exchangedMomentum: r.impulse, preSolveClosingSpeed: r.preSolveClosingSpeed,
          preSolveContactSpeed: r.preSolveContactSpeed, availableContactDeltaV: r.availableContactDeltaVA,
          wreckDamageOnly: true });
        damage += consequence.impactDamage;
      }
      assert.ok(Math.hypot(resting.vel.x, resting.vel.z) < 0.11,
        'the station cannot act as a bridge for impact energy on its opposite side');
    }
    assert.ok(hit && restContact, 'both sides must really contact the same fixed station');
    assert.equal(damage, 0);
    assert.ok(incoming.vel.x < 5, 'the fixed surface still stops the committed incoming body');
  } finally { owner.dispose(); }
});

test('an actively recoiling kinematic anchor retains its real push into another body', async () => {
  const results = [];
  for (const guarded of [false, true]) {
    const target = roundDebris(1, { x: 26 });
    const station = body(2, { type: 'station', mass: 1_000_000, shape: 'ball' });
    station.data = {}; station.radius = station.physicsBody.radius = 20; station.physicsBody.dynamic = false;
    station.physicsBody.anchorRecoil = { rest: { x: 0, z: 0 }, x: 0, z: 0, vx: 8, vz: 0, settled: false };
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    if (!guarded) owner._prepareContactMotionBudgets = () => {};
    try {
      owner.syncFromEntities([target, station]);
      let contacts = 0;
      for (let i = 0; i < 30; i++) {
        owner.step(DT); contacts += owner.drainContactImpacts().length;
      }
      assert.ok(contacts > 0, 'the driven anchor must actually push the target through native contact');
      results.push(target.vel.x);
    } finally { owner.dispose(); }
  }
  assert.ok(results[1] > 5, 'kinematic work is an external motion source, not numerical noise');
  assert.ok(Math.abs(results[0] - results[1]) < 0.001, 'the guard preserves the native recoil transfer');
});

test('measured low-speed support cannot create craft damage from an arbitrarily large solver impulse', () => {
  const target = body(1), other = body(2);
  for (const speed of [0, 0.3, 2, 4]) {
    const receipt = resolveCollisionConsequence({ target, other, exchangedMomentum: 100000,
      preSolveClosingSpeed: speed, provenance: { tag: 'weapon_hit', actorId: 3, appliedTick: 0 } });
    assert.equal(receipt.impactDamage, 0);
    assert.equal(receipt.debrisCount, 0);
    assert.notEqual(receipt.control, 'tumble');
    assert.ok(receipt.deltaV <= 2 * speed);
  }
  const hard = resolveCollisionConsequence({ target, other, exchangedMomentum: 100000, preSolveClosingSpeed: 90 });
  assert.ok(hard.impactDamage > 0 && hard.debrisCount > 0, 'a hard collision remains a hard collision');
  const legacy = resolveCollisionConsequence({ target, other, exchangedMomentum: 100000 });
  assert.ok(legacy.impactDamage > 0, 'unmeasured compatibility receipts keep their existing fallback');
});

test('a rotating wreck transfers real angular motion and damage through the native contact adapter', async t => {
  const { physics } = await import('../src/core/physics.js');
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    for (const sign of [-1, 1]) {
      const state = createGameState(6209), bus = createBus();
      const rod = body(1, { type: 'wreck', mass: 80 });
      rod.physicsBody.inertiaY = 80 * 6 * 6;
      rod.data.proportions = { length: 4, halfWidth: 0.42, height: 0.3 };
      rod.angVel = sign * 4;
      const target = body(2, { x: 8, z: sign * 6 });
      target.radius = target.physicsBody.radius = 3;
      target.physicsBody.inertiaY = 24 * 3 * 3;
      for (const e of [rod, target]) { e.hull = e.hullMax = 1000; e.team = 1; }
      state.mode = 'flight'; state.playerId = 99;
      state.entities = new Map([[1, rod], [2, target]]); state.entityList = [rod, target];
      const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
      const adapter = Object.create(physics), consequences = Object.create(collisionConsequences);
      const applied = [], impacts = [];
      adapter.init({ state, bus, helpers: {} });
      adapter._sg02 = owner;
      consequences.init({ state, bus, helpers: {}, registry: { get: id => id === 'combat'
        ? { kernel: { routeDamage(packet) { applied.push(packet); return { ok: true }; } } } : null } });
      bus.on('physics:impact', payload => impacts.push({ ...payload }));
      try {
        owner.syncFromEntities([rod, target]);
        for (let i = 0; i < 30; i++) {
          state.tick = i; state.simTime = i * DT;
          owner.step(DT);
          adapter._emitSg02ContactImpacts(state);
          consequences.update(DT, state);
          bus.flush();
        }
        const first = impacts[0];
        assert.ok(first, 'the rotating arm must make a real native contact');
        assert.equal(first.preSolveClosingSpeed, 0, 'neither centre was approaching before the hit');
        assert.ok(first.preSolveContactSpeed > 30, 'the actual spinning surface carries approach speed');
        assert.ok(applied.some(hit => hit.targetId === target.id && hit.packet.channels.kinetic > 0),
          'real rotational impact must reach the combat damage writer');
        assert.ok(target.vel.z * sign > 5, 'the struck hull moves in the correct angular direction');
        t.diagnostic(JSON.stringify({ sign, centre: first.preSolveClosingSpeed,
          surface: first.preSolveContactSpeed, transferredSpeed: target.vel.z }));
      } finally {
        consequences.destroy(); adapter._disableSg02DynamicAuthority(); bus.clear();
      }
    }
  } finally { COMBAT_FLAGS.weaponImpulseConsequences = previous; }
});

test('surface and island channels survive deferred consequences and do not leak across pooled receipts', async () => {
  const { physics } = await import('../src/core/physics.js');
  const previous = { consequences: COMBAT_FLAGS.weaponImpulseConsequences, whip: COMBAT_FLAGS.whipDamage };
  COMBAT_FLAGS.weaponImpulseConsequences = true; COMBAT_FLAGS.whipDamage = true;
  const state = createGameState(6210), bus = createBus(), applied = [], impacts = [];
  const a = body(1), b = body(2, { x: 10 });
  for (const e of [a, b]) { e.hull = e.hullMax = 1000; e.team = 1; }
  state.mode = 'flight'; state.tick = 10; state.playerId = 99;
  state.player.tether = { active: true, targetId: a.id };
  state.entities = new Map([[1, a], [2, b]]); state.entityList = [a, b];
  const adapter = Object.create(physics), consequences = Object.create(collisionConsequences);
  adapter.init({ state, bus, helpers: {} });
  let contact = { aId: 1, bId: 2, impulse: 480, preSolveClosingSpeed: 0, preSolveContactSpeed: 40,
    availableContactDeltaVA: 0, availableContactDeltaVB: 40,
    pos: { x: 5, z: 0 }, normal: { x: 1, z: 0 } };
  adapter._sg02 = { drainContactImpacts: () => [contact], dispose() {} };
  consequences.init({ state, bus, helpers: {}, registry: { get: id => id === 'combat'
    ? { kernel: { routeDamage(packet) { applied.push(packet); return { ok: true }; } } } : null } });
  bus.on('physics:impact', payload => impacts.push({ ...payload }));
  try {
    adapter._emitSg02ContactImpacts(state);
    assert.equal(applied.length, 0, 'a live Massline contact defers the baseline until the tick tail');
    contact = { ...contact }; delete contact.preSolveContactSpeed;
    delete contact.availableContactDeltaVA; delete contact.availableContactDeltaVB;
    adapter._emitSg02ContactImpacts(state);
    assert.equal('preSolveContactSpeed' in impacts[1], false, 'an unmeasured receipt has no stale surface channel');
    assert.equal('availableContactDeltaVA' in impacts[1], false, 'an unmeasured receipt has no stale island channel');
    assert.equal('availableContactDeltaVB' in impacts[1], false, 'both pair endpoints clear the pooled island channel');
    bus.flush();
    assert.ok(applied.some(hit => hit.targetId === b.id && hit.packet.channels.kinetic > 0),
      'the deferred contact retained the target-specific available island motion');
    assert.ok(applied.every(hit => hit.targetId !== a.id), 'one endpoint cannot borrow the other endpoint motion budget');
    contact.preSolveContactSpeed = 0;
    contact.availableContactDeltaVA = contact.availableContactDeltaVB = 0;
    adapter._emitSg02ContactImpacts(state);
    assert.equal(impacts[2].preSolveContactSpeed, 0, 'a finite measured zero is preserved');
    assert.equal(impacts[2].availableContactDeltaVB, 0, 'a finite island zero is preserved');
  } finally {
    consequences.destroy(); adapter._disableSg02DynamicAuthority(); bus.clear();
    COMBAT_FLAGS.weaponImpulseConsequences = previous.consequences; COMBAT_FLAGS.whipDamage = previous.whip;
  }
});
