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
  // OVH-06a / R10: a contact beat no longer reaches the camera as trauma, so `traumas` must stay
  // empty. The flushed-beat bookkeeping these cases pin (one beat per contact, duplicate history,
  // cooldown, coalescing) is read from the camera gate's per-cause refusal counter instead: every
  // flushed contact beat is counted once as a refused 'collision' camera event.
  const beats = () => (host._cameraGate().counts().refused.collision || 0);
  return { state, bus, effects, host, traumas, beats, frame: (dt = 0) => host.frame(dt, state) };
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
  const { state, bus, host, effects, traumas, beats, frame } = fixture();
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
  assert.equal(beats(), 1, 'the flush counts exactly one contact beat');
  assert.equal(traumas.length, 0, 'R10: a room contact adds no camera trauma');
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
    const { bus, host, traumas, beats, frame } = fixture();
    const contact = receipt(60, {
      provenance: { actorId, tag: 'railgun_penetrator', appliedTick: 118 },
    });
    bus.emit('combat:collisionConsequence', contact);
    frame();
    assert.deepEqual(traumas, [], 'R10: no contact ever adds camera trauma');
    if (actorId !== 1) {
      assert.equal(beats(), 0, 'unrelated NPC collisions cannot slow or shake the player world');
      assert.equal(host._armedCollisionDeltaV, 0);
      continue;
    }
    assert.equal(beats(), 1, 'the player-caused collision is recognised and queues its one beat');
    assert.equal(host._armedCollisionDeltaV, contact.deltaV);
  }
});

test('physics and consequence coalesce into one strongest beat in either delivery order', () => {
  for (const receiptFirst of [false, true]) {
    const { bus, host, traumas, beats, frame } = fixture();
    const events = [
      ['physics:impact', physicsImpact(20)],
      ['combat:collisionConsequence', receipt(100)],
    ];
    if (receiptFirst) events.reverse();
    for (const [name, payload] of events) bus.emit(name, payload);
    assert.equal(beats(), 0);
    frame();
    assert.equal(host._armedCollisionDeltaV, 100);
    assert.equal(beats(), 1);
    frame();
    assert.equal(beats(), 1);
    assert.equal(traumas.length, 0, 'R10: no camera trauma');
  }
});

test('a deferred duplicate cannot re-arm an already handled contact, even after cooldown', () => {
  const { bus, host, traumas, beats, frame } = fixture();
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
  assert.equal(beats(), 1);
  frame(COLLISION_HITSTOP_COOLDOWN + 0.001);
  bus.emit('combat:collisionConsequence', duplicate);
  frame();
  assert.equal(beats(), 1);
  bus.emit('combat:collisionConsequence', { ...duplicate, tick: 121 });
  frame();
  assert.equal(beats(), 2, 'the same pair on a new tick remains a real collision');
  assert.equal(traumas.length, 0, 'R10: no camera trauma');
});

test('receipt grind cooldown survives the beat window; a distinct hard collision can interrupt', () => {
  const { bus, host, traumas, beats, frame } = fixture();
  bus.emit('combat:collisionConsequence', receipt(10));
  frame();
  frame(beatWindow(host) + 0.001);
  for (const deltaV of [11, 12, 14]) {
    bus.emit('combat:collisionConsequence', receipt(deltaV, { tick: 120 + deltaV }));
    frame();
  }
  assert.equal(beats(), 1);
  bus.emit('combat:collisionConsequence', receipt(100, { tick: 150 }));
  frame();
  assert.equal(beats(), 2);
  assert.equal(traumas.length, 0, 'R10: no camera trauma');
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
    const { state, bus, effects, host, traumas, beats, frame } = fixture();
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
    assert.equal(beats(), 2, `${event} must allow the next run to reuse contact IDs/ticks`);
    assert.deepEqual(traumas, [], 'R10: no camera trauma');
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
