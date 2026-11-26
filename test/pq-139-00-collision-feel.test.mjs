import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { resolveCollisionConsequence } from '../src/combat/impulseKernel.js';
import {
  COLLISION_DELTA_V_FLOOR,
  COLLISION_HITSTOP_COOLDOWN,
  HS_IMPACT_MAX,
  feel,
  resolveCollisionFeel,
} from '../src/render/feel.js';

function receipt(deltaV, overrides = {}) {
  return resolveCollisionConsequence({
    target: { id: 2, type: 'ship', mass: 20 },
    other: { id: 3, type: 'asteroid', mass: 1000 },
    exchangedMomentum: deltaV * 20,
    tick: 120,
    pos: { x: 1200, z: 0 },
    normal: { x: -1, z: 0 },
    provenance: { actorId: 1, weaponId: 'wpn_railgun_m', tag: 'railgun_penetrator', appliedTick: 118 },
    ...overrides,
  });
}

function physicsImpact(deltaV, overrides = {}) {
  return {
    consequenceKernelVersion: 1,
    tick: 120,
    aId: 2,
    bId: 3,
    dp: deltaV * 20,
    playerInvolved: false,
    // These coalescing cases pair with the player-caused remote consequence above.
    // Unrelated NPC contacts are deliberately silent under the shipped feel policy.
    causalActorId: 1,
    pos: { x: 1200, z: 0 },
    ...overrides,
  };
}

function fixture() {
  const traumas = [];
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    settings: { video: { motionReduce: false } },
    ui: { screenStack: [], docked: false },
    entities: new Map([
      [1, { id: 1, type: 'ship', mass: 20, pos: { x: 0, z: 0 } }],
      [2, { id: 2, type: 'ship', mass: 20, pos: { x: 1200, z: 0 } }],
      [3, { id: 3, type: 'asteroid', mass: 1000, pos: { x: 1200, z: 0 } }],
    ]),
    render: { cameraCtrl: { addTrauma: (value) => traumas.push(value) } },
    rng: () => { throw new Error('presentation must not consume sim RNG'); },
  };
  const bus = createBus();
  const effects = createTimeEffects(state);
  const host = Object.create(feel);
  // Only DOM/canvas work is replaced; init, bus listeners, frame, trigger and time authority run.
  host._injectStyle = () => {};
  host._mountVignette = () => {};
  host._ensureVignette = () => null;
  host._updateSpeedLines = () => {};
  host.init({ state, bus, timeEffects: effects });
  return { state, bus, effects, host, traumas, frame: (dt = 0) => host.frame(dt, state) };
}

// The authored beat window a fired beat leaves armed, whichever internal field carries it.
// Beats are presentation only — the window paces a queued chain beat; it never writes the clock.
function beatWindow(host) {
  return host._beatTimer ?? host._hsTimer ?? 0;
}

test('pure collision ramp ignores below-floor/invalid deltaV and orders scrape, knock, slam', () => {
  const contact = receipt(60);
  const context = { mode: 'flight', playerDistance: 0, motionReduce: false };
  for (const deltaV of [-1, 0, COLLISION_DELTA_V_FLOOR - 0.01, NaN, Infinity, undefined]) {
    assert.equal(resolveCollisionFeel(contact, { ...context, deltaV }), null);
  }
  const rows = [8, 20, 40, 60, 100, 150, 1000].map((deltaV) =>
    resolveCollisionFeel(contact, { ...context, deltaV }));
  assert.deepEqual(rows.map((row) => row.id), [
    'impact.scrape', 'impact.scrape', 'impact.knock', 'impact.knock',
    'impact.slam', 'impact.slam', 'impact.slam',
  ]);
  for (let i = 0; i < rows.length; i++) {
    assert.ok(rows[i].hsDur > 0 && rows[i].hsDur <= HS_IMPACT_MAX);
    if (i > 0) for (const key of ['hsDur', 'fov', 'trauma']) {
      assert.ok(rows[i][key] >= rows[i - 1][key], `${key} must be monotone`);
    }
  }
  assert.deepEqual(resolveCollisionFeel(contact, { ...context, deltaV: 60 }), rows[3]);
  const scratch = {};
  assert.equal(resolveCollisionFeel(contact, { ...context, deltaV: 100 }, scratch), scratch);
  assert.deepEqual(scratch, rows[4]);
  resolveCollisionFeel(contact, { ...context, deltaV: 8 }, scratch);
  assert.deepEqual(scratch, rows[0], 'reusing an output must replace the previous impact');
  assert.ok(Object.isFrozen(rows[0]), 'pure callers retain the immutable result contract');
  assert.equal(resolveCollisionFeel(contact, { ...context, deltaV: 60, motionReduce: true }), null);
});

test('meaningful consequence arms only the frame flush, using receipt truth after entity retirement', () => {
  const { state, bus, host, effects, traumas, frame } = fixture();
  const contact = receipt(60);
  state.entities.delete(2);
  state.entities.delete(3);
  effects.set('flyby-focus', { scale: 0.5 });
  const before = JSON.stringify(state);
  bus.emit('combat:collisionConsequence', contact);
  assert.equal(JSON.stringify(state), before, 'headless event dispatch must not mutate simulation state');
  assert.equal(host._pendingCollisionFeel?.deltaV, contact.deltaV);
  assert.equal(beatWindow(host), 0);
  assert.equal(traumas.length, 0);
  frame();
  assert.equal(host._pendingCollisionFeel, null);
  assert.equal(state.timeScale, 0.5, 'the beat never writes the clock — the Focus bound holds');
  assert.equal(beatWindow(host), resolveCollisionFeel(contact, {
    mode: 'flight', deltaV: contact.deltaV,
  }).hsDur);
  // R10: a collision is a room event. The camera never shakes for it, whoever caused it — the
  // beat paces and arms, and books exactly one refused 'collision' trauma at the gate.
  assert.equal(traumas.length, 0, 'R10: no camera trauma for any collision');
  assert.equal(state.render.cameraGate.counts().refused.collision, 1,
    'the flushed beat is booked as refused room trauma');
  frame(HS_IMPACT_MAX + 0.001);
  assert.equal(state.timeScale, 0.5, 'the beat window expiring cannot touch another owner');
});

test('receipt deltaV stays authoritative when live mass differs; zero momentum is ignored', () => {
  const { state, bus, host, frame } = fixture();
  state.entities.get(2).mass = 0.1;
  for (const contact of [receipt(7.9), { ...receipt(60), exchangedMomentum: 0 }]) {
    bus.emit('combat:collisionConsequence', contact);
    frame();
    assert.equal(host._pendingCollisionFeel, null);
    assert.equal(state.timeScale, 1);
  }
  bus.emit('combat:collisionConsequence', receipt(8));
  frame();
  assert.equal(host._armedCollisionDeltaV, 8);
});

test('receipt provenance recognizes a player-caused collision and silences unrelated NPC contacts', () => {
  for (const actorId of [1, 9]) {
    const { state, bus, traumas, frame } = fixture();
    const contact = receipt(60, {
      provenance: { actorId, tag: 'railgun_penetrator', appliedTick: 118 },
    });
    bus.emit('combat:collisionConsequence', contact);
    frame();
    const refused = state.render.cameraGate.counts().refused;
    assert.deepEqual(traumas, [], 'R10: a collision never shakes the camera, whoever caused it');
    if (actorId !== 1) {
      // An NPC-only contact is silenced at the queue: it never paces, arms or flushes a beat.
      assert.equal(refused.collisionFov, 1, 'unrelated NPC contacts are refused at the queue');
      assert.equal(refused.collision, undefined, 'an NPC contact never reaches the flush');
      continue;
    }
    // The player's own throw still lands its beat: it flushes, and R10 books its trauma as
    // refused room motion — the body that was hit answers, not the camera.
    assert.equal(refused.collision, 1, 'the player-caused beat flushes and is refused as room trauma');
  }
});

test('physics and consequence coalesce into one strongest beat in either delivery order', () => {
  for (const receiptFirst of [false, true]) {
    const { state, bus, host, traumas, frame } = fixture();
    const flushes = () => state.render.cameraGate.counts().refused.collision || 0;
    const events = [
      ['physics:impact', physicsImpact(20)],
      ['combat:collisionConsequence', receipt(100)],
    ];
    if (receiptFirst) events.reverse();
    for (const [name, payload] of events) bus.emit(name, payload);
    assert.equal(traumas.length, 0);
    frame();
    assert.equal(host._pendingCollisionFeel, null, 'one strongest beat, not two');
    assert.equal(host._armedCollisionDeltaV, 100);
    // R10: the one coalesced beat flushes as a refused room trauma, never a camera shake.
    assert.equal(flushes(), 1, 'exactly one beat flushed');
    assert.equal(traumas.length, 0, 'R10: no camera trauma for any collision');
    frame();
    assert.equal(flushes(), 1, 'the spent beat cannot fire twice');
  }
});

test('a deferred duplicate cannot re-arm an already handled contact, even after cooldown', () => {
  const { state, bus, host, traumas, frame } = fixture();
  const flushes = () => state.render.cameraGate.counts().refused.collision || 0;
  bus.emit('physics:impact', physicsImpact(20));
  frame();
  // A deferred receipt has unscaled momentum and reversed pair order; neither makes a new contact.
  const duplicate = receipt(100, {
    target: { id: 3, type: 'ship', mass: 20 },
    other: { id: 2, type: 'ship', mass: 20 },
  });
  bus.queue('combat:collisionConsequence', duplicate);
  bus.flush();
  frame();
  assert.equal(host._armedCollisionDeltaV, 20);
  assert.equal(flushes(), 1);
  frame(COLLISION_HITSTOP_COOLDOWN + 0.001);
  bus.emit('combat:collisionConsequence', duplicate);
  frame();
  assert.equal(flushes(), 1);
  bus.emit('combat:collisionConsequence', { ...duplicate, tick: 121 });
  frame();
  assert.equal(flushes(), 2, 'the same pair on a new tick remains a real collision');
  assert.equal(host._armedCollisionDeltaV, 100);
});

test('receipt grind cooldown survives the beat window; a distinct hard collision can interrupt', () => {
  const { state, bus, host, frame } = fixture();
  const flushes = () => state.render.cameraGate.counts().refused.collision || 0;
  bus.emit('combat:collisionConsequence', receipt(10));
  frame();
  frame(beatWindow(host) + 0.001);
  for (const deltaV of [11, 12, 14]) {
    bus.emit('combat:collisionConsequence', receipt(deltaV, { tick: 120 + deltaV }));
    frame();
  }
  assert.equal(flushes(), 1, 'a grind inside the cooldown never re-arms the beat');
  assert.equal(host._armedCollisionDeltaV, 10);
  bus.emit('combat:collisionConsequence', receipt(100, { tick: 150 }));
  frame();
  assert.equal(flushes(), 2, 'a meaningfully harder hit interrupts the cooldown');
  assert.equal(host._armedCollisionDeltaV, 100);
});

test('motion-reduce and modal gates suppress receipts both before queueing and before flush', () => {
  for (const gate of ['motionReduce', 'modal', 'docked', 'mode']) {
    for (const afterQueue of [false, true]) {
      const { state, bus, host, traumas, frame } = fixture();
      const emit = () => bus.emit('combat:collisionConsequence', receipt(150));
      if (afterQueue) emit();
      if (gate === 'motionReduce') state.settings.video.motionReduce = true;
      if (gate === 'modal') state.ui.screenStack.push('settings');
      if (gate === 'docked') state.ui.docked = true;
      if (gate === 'mode') state.mode = 'menu';
      if (!afterQueue) emit();
      frame();
      assert.equal(state.timeScale, 1, `${gate}, afterQueue=${afterQueue}`);
      assert.equal(host._pendingCollisionFeel, null);
      assert.equal(host._fovPunch, 0);
      assert.deepEqual(traumas, []);
    }
  }
});

test('pause/save/new game clears pending contact and duplicate history without clearing another pause', () => {
  for (const event of ['sim:pause', 'save:restoring', 'save:loaded', 'game:new']) {
    const { state, bus, effects, host, frame } = fixture();
    const flushes = () => state.render.cameraGate.counts().refused.collision || 0;
    bus.emit('combat:collisionConsequence', receipt(60));
    frame();
    bus.emit('combat:collisionConsequence', receipt(150, { tick: 121 }));
    effects.set('ui:pausing-screen', { scale: 0 });
    bus.emit(event);
    assert.equal(host._pendingCollisionFeel, null);
    assert.equal(beatWindow(host), 0);
    assert.equal(state.timeScale, 0);
    effects.clear('ui:pausing-screen');
    bus.emit('combat:collisionConsequence', receipt(60));
    frame();
    assert.equal(flushes(), 2, `${event} must allow the next run to reuse contact IDs/ticks`);
    assert.equal(host._armedCollisionDeltaV, 60);
  }
});

test('ordinary rapid gunfire and armor/hull hits still never arm a beat', () => {
  const { state, bus, host, frame } = fixture();
  for (let tick = 0; tick < 60; tick++) {
    bus.emit('combat:fire', { ownerId: 1, weaponId: 'wpn_pulse_laser_s' });
    bus.emit('combat:damage', { attackerId: 1, targetId: 2, amount: 4, armorHit: tick % 2 === 0, hullHit: tick % 2 !== 0 });
    frame(1 / 60);
    assert.equal(state.timeScale, 1);
    assert.equal(beatWindow(host), 0);
    assert.equal(host._pendingCollisionFeel, null);
  }
});
