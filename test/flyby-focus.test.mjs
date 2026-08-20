import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { flybyFocus, pickFlybyTarget } from '../src/systems/flybyFocus.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;

function player(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 120, z: 0 },
    rot: 0,
    flags: {},
    ...overrides,
  };
}

function hostile(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 120, z: 0 },
    vel: { x: -20, z: 0 },
    radius: 12,
    mass: 60,
    data: {
      ai: { archetype: 'pirate' },
      combat: { targetId: null, lockTarget: null },
      weapons: [{ id: 'wpn_test' }],
    },
  };
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    vel: { ...base.vel, ...(overrides.vel || {}) },
    data: {
      ...base.data,
      ...(overrides.data || {}),
      ai: { ...base.data.ai, ...(overrides.data?.ai || {}) },
      combat: { ...base.data.combat, ...(overrides.data?.combat || {}) },
      weapons: overrides.data && Object.hasOwn(overrides.data, 'weapons')
        ? overrides.data.weapons
        : base.data.weapons,
    },
  };
}

function stateWith(contacts, options = {}) {
  const p = options.player || player();
  const state = {
    mode: 'flight',
    simTime: options.simTime || 0,
    tick: options.tick || 0,
    timeScale: 1,
    playerId: p.id,
    player: {
      heat: options.heat || 0,
      targetId: options.targetId ?? null,
      tether: { active: !!options.tetherActive, targetId: null },
    },
    entities: new Map(),
    entityList: [],
    input: { aimWorld: { x: 0, z: 0 }, aimAngle: 0 },
  };
  state.entities.set(p.id, p);
  state.entityList.push(p);
  for (const contact of contacts) {
    state.entities.set(contact.id, contact);
    state.entityList.push(contact);
  }
  return { state, p };
}

function runtimeFor(contacts, options = {}) {
  const fixture = stateWith(contacts, options);
  const bus = createBus();
  const timeEffects = createTimeEffects(fixture.state);
  const system = Object.assign({}, flybyFocus);
  system.init({ state: fixture.state, bus, timeEffects });
  return { ...fixture, bus, timeEffects, system };
}

// A fast threat needs to be acquired early enough for the player to read the pass and press F.
// The camera director can compose this pair within its legal engine zoom ceiling.
{
  const p = player();
  const atLimit = hostile(2, { pos: { x: 280, z: 0 }, vel: { x: -80, z: 0 } });
  const outside = hostile(3, { pos: { x: 281, z: 0 }, vel: { x: -80, z: 0 } });
  const state = stateWith([], { player: p }).state;
  assert.equal(pickFlybyTarget(state, p, [atLimit])?.id, 2, '280-unit early-warning boundary is eligible');
  assert.equal(pickFlybyTarget(state, p, [outside]), null, '281 units is outside the Focus envelope');
  const verticalTooFar = hostile(4, { pos: { x: 0, z: 280 }, vel: { x: 0, z: -200 } });
  const verticalFrameable = hostile(5, { pos: { x: 0, z: 160 }, vel: { x: 0, z: -200 } });
  assert.equal(pickFlybyTarget(state, p, [verticalTooFar]), null,
    'tilted-screen vertical pass waits until the pair fits the Focus camera');
  assert.equal(pickFlybyTarget(state, p, [verticalFrameable])?.id, 5,
    'vertical pass arms as soon as its pair is camera-frameable');
}

// Kinematic filters: a Focus candidate must be a real, imminent pass rather than ordinary orbit.
{
  const p = player();
  const state = stateWith([], { player: p }).state;
  assert.equal(pickFlybyTarget(state, p, [hostile(2, { vel: { x: 30, z: 0 } })]), null,
    'relative speed below 96 is rejected');
  assert.equal(pickFlybyTarget(state, p, [hostile(3, { vel: { x: 240, z: 0 } })]), null,
    'a receding contact is rejected');
  assert.equal(pickFlybyTarget(state, p, [hostile(4, { pos: { x: 120, z: 110 } })]), null,
    'closest surface miss beyond 96 is rejected');
  assert.equal(pickFlybyTarget(state, p, [hostile(5, { pos: { x: 120, z: 0 }, vel: { x: 100, z: 100 } })]), null,
    'closing speed below 25 is rejected');
}

// Canonical hostility and a stable comparator are invariant under entity-list order.
{
  const p = player();
  const direct = hostile(7, { data: { combat: { targetId: 1 } } });
  const ambient = hostile(2);
  const state = stateWith([], { player: p }).state;
  assert.equal(pickFlybyTarget(state, p, [ambient, direct])?.id, 7, 'a direct attacker outranks ambient clutter');
  assert.equal(pickFlybyTarget(state, p, [direct, ambient])?.id, 7, 'selection is order-invariant');

  const tieA = hostile(9);
  const tieB = hostile(4);
  assert.equal(pickFlybyTarget(state, p, [tieA, tieB])?.id, 4, 'stable entity id breaks exact ties');
  assert.equal(pickFlybyTarget(state, p, [tieB, tieA])?.id, 4, 'stable tie-break survives reversal');

  const cleanLaw = hostile(10, { data: { ai: { lawful: true, roe: 'lawful_wanted_only' } } });
  assert.equal(pickFlybyTarget(state, p, [cleanLaw]), null, 'clean lawful patrol is not hostile');
  state.player.heat = 0.2;
  assert.equal(pickFlybyTarget(state, p, [cleanLaw])?.id, 10, 'wanted lawful patrol becomes eligible');
}

// Activation owns only its transient lease and slow-time. Persistent gun/UI selection is separate,
// while the exact Focus target still biases Massline acquisition through flybyFocus.targetId.
{
  const target = hostile(2);
  const distractor = {
    id: 3, type: 'asteroid', team: null, alive: true,
    pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 300, data: {},
  };
  const f = runtimeFor([target, distractor], { targetId: distractor.id });
  const starts = [];
  const ends = [];
  f.bus.on('flybyFocus:start', (payload) => starts.push(payload));
  f.bus.on('flybyFocus:end', (payload) => ends.push(payload));

  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, true);
  assert.equal(f.state.player.flybyFocus.targetId, target.id);
  assert.equal(f.state.player.targetId, distractor.id,
    'Focus start must preserve the player\'s persistent gun/UI selection');
  assert.equal(f.state.player.flybyFocus.until, 3, 'window provides a full three-second latch opportunity');
  assert.equal(f.state.timeScale, 0.5, 'Focus requests 50% slow-time through the shared authority');
  assert.equal(starts.length, 1);
  assert.deepEqual(
    Object.keys(starts[0]).sort(),
    ['closestSurfaceMiss', 'closingSpeed', 'durationS', 'relativeSpeed', 'scale', 'startedAt', 'targetId', 'timeToClosestS', 'until'].sort(),
  );

  f.state.player.targetId = 'manual-gun-target';
  f.state.simTime = 0.5;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.targetId, 'manual-gun-target',
    'an active Focus lease must not overwrite a later explicit gun/UI selection');

  const latch = tetherGameplay._acquireTarget.call(
    { _targetScratch: [] },
    f.p,
    { maxLength: 390 },
    f.state,
    false,
  );
  assert.equal(latch?.entity?.id, target.id, 'public F exact-lock path chooses the Focus target, not nearer clutter');

  f.timeEffects.set('test:pause', { scale: 0 });
  assert.equal(f.state.timeScale, 0, 'pause remains the minimum request');
  f.timeEffects.clear('test:pause');
  assert.equal(f.state.timeScale, 0.5, 'clearing pause reveals the still-active Focus request');

  f.state.simTime = 2.999;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, true);
  f.state.simTime = 3;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false);
  assert.equal(f.state.player.targetId, 'manual-gun-target',
    'normal expiry must not clear or replace persistent gun/UI selection');
  assert.equal(f.state.timeScale, 1);
  assert.equal(ends.at(-1)?.reason, 'expired');
  f.system.destroy();
}

// Held-out public route: a lower-authority contact writer can temporarily replace player.targetId
// after Focus arms, and Focus requests nearest-mode latch assistance. The massline must still honor
// the explicit Focus lease instead of degrading it into a generic nearest-object search.
{
  const target = hostile(20, { pos: { x: 118, z: 0 } });
  const clutter = {
    id: 21, type: 'asteroid', team: null, alive: true,
    pos: { x: 24, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 300, data: {},
  };
  const f = runtimeFor([target, clutter], { targetId: clutter.id });
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.targetId, target.id, 'fixture arms exact flyby target');

  // Reproduce the public inter-system timing rather than calling flybyFocus.update() again.
  f.state.player.targetId = clutter.id;
  const latch = tetherGameplay._acquireTarget.call(
    { _targetScratch: [] },
    f.p,
    { maxLength: 390 },
    f.state,
    true,
  );
  assert.equal(latch?.entity?.id, target.id,
    'active Focus hard-prefers its validated target even when selected target and nearest clutter disagree');
}

// A Focus lease can outlive tether reach (720 wu hold range versus a 390 wu tether). Physical
// eligibility comes first, so the out-of-range hint falls through to reachable world-space clutter.
{
  const target = hostile(22, { pos: { x: 118, z: 0 } });
  const clutter = {
    id: 23, type: 'asteroid', team: null, alive: true,
    pos: { x: 24, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 300, data: {},
  };
  const f = runtimeFor([target, clutter], { targetId: clutter.id });
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.targetId, target.id, 'fixture arms exact flyby target');

  target.pos.x = 450;
  f.state.simTime = 0.5;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, true, 'lease remains valid inside the 720 wu hold range');
  f.state.player.targetId = clutter.id;
  const latch = tetherGameplay._acquireTarget.call(
    { _targetScratch: [] },
    f.p,
    { maxLength: 390 },
    f.state,
    true,
  );
  assert.equal(latch?.entity?.id, clutter.id,
    'an out-of-reach Focus hint falls through to the reachable world-space candidate');
}

// Combat runs between Focus and tether gameplay. If it invalidates the leased target in that
// window, the public tether update must ignore the stale hint and attempt reachable clutter.
{
  const target = hostile(24, { pos: { x: 118, z: 0 } });
  const clutter = {
    id: 25, type: 'asteroid', team: null, alive: true,
    pos: { x: 24, z: 0 }, vel: { x: 0, z: 0 }, radius: 11, mass: 300, data: {},
  };
  const f = runtimeFor([target, clutter], { targetId: clutter.id });
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.targetId, target.id, 'fixture arms exact flyby target');

  let createCalls = 0;
  const attachments = {
    create() { createCalls += 1; return { ok: false }; },
  };
  const kernel = {
    attachments,
    catalog: { attachments: new Map([['tether_standard', { maxLength: 390 }]]) },
  };
  const tether = Object.assign({}, tetherGameplay);
  tether.init({
    state: f.state,
    bus: f.bus,
    helpers: {},
    registry: { get: (name) => (name === 'actions' ? { kernel } : null) },
  });
  f.state.input.actions = { tetherFire: true };
  f.state.input.tetherMode = 'nearest';
  target.alive = false;
  tether.update(DT, f.state);

  assert.equal(f.state.player.flybyFocus.active, true, 'Focus owner has not run again in this tick');
  assert.equal(createCalls, 1, 'invalid exact lease falls through and attempts the reachable clutter');
  assert.equal(f.state.player.tether.active, false, 'public update leaves the tether unlatched');
}

// Invalidation and runtime boundaries clear only the Focus-owned transient request, never the
// persistent gun/UI selection.
for (const event of ['save:restoring', 'save:loaded', 'game:started', 'dock:docked', 'player:death']) {
  const target = hostile(2);
  const f = runtimeFor([target], { targetId: 'persistent-selection' });
  f.system.update(DT, f.state);
  assert.equal(f.state.timeScale, 0.5, `${event}: fixture activates`);
  f.bus.emit(event, {});
  assert.equal(f.state.player.flybyFocus.active, false, `${event}: focus resets`);
  assert.equal(f.state.player.targetId, 'persistent-selection', `${event}: persistent selection survives`);
  assert.equal(f.state.timeScale, 1, `${event}: Focus request clears`);
  f.system.destroy();
}

// Explicit cancel and a wide release hysteresis end the lease cleanly without target churn.
// The release radius is deliberately much wider than the 280 wu acquire envelope so a normal pass
// keeps its full turn-and-latch window, while teleports/runaway contacts cannot own the camera.
{
  const target = hostile(2);
  const f = runtimeFor([target], { targetId: 'persistent-selection' });
  const ends = [];
  f.bus.on('flybyFocus:end', (payload) => ends.push(payload));
  f.system.update(DT, f.state);
  f.bus.emit('flybyFocus:cancel', { reason: 'player-cancel' });
  assert.equal(f.state.player.flybyFocus.active, false, 'explicit cancel releases Focus');
  assert.equal(f.state.player.targetId, 'persistent-selection', 'explicit cancel preserves persistent selection');
  assert.equal(f.state.timeScale, 1, 'explicit cancel clears slow-time');
  assert.equal(ends.at(-1)?.reason, 'player-cancel');
  f.system.destroy();
}

{
  const target = hostile(2);
  const f = runtimeFor([target], { targetId: 'persistent-selection' });
  const ends = [];
  f.bus.on('flybyFocus:end', (payload) => ends.push(payload));
  f.system.update(DT, f.state);
  target.pos.x = 721;
  f.state.simTime = 0.25;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false, 'extreme range exit releases Focus');
  assert.equal(f.state.player.targetId, 'persistent-selection', 'range release preserves persistent selection');
  assert.equal(f.state.timeScale, 1, 'range release clears slow-time');
  assert.equal(ends.at(-1)?.reason, 'out-of-range');
  f.system.destroy();
}

// A genuine 240 wu/s head-on pass must keep 50% time through closest approach and a usable
// post-pass latch window instead of expiring while the player is still turning to face it.
{
  const movingPlayer = player({ vel: { x: 0, z: 0 } });
  const target = hostile(2, { pos: { x: 120, z: 0 }, vel: { x: -240, z: 0 } });
  const f = runtimeFor([target], { player: movingPlayer });
  const ends = [];
  f.bus.on('flybyFocus:end', (payload) => ends.push(payload));
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, true, 'head-on pass activates inside the early-warning envelope');

  for (let tick = 1; tick < 180; tick++) {
    target.pos.x += target.vel.x * DT;
    f.state.simTime = tick * DT;
    f.system.update(DT, f.state);
    assert.equal(f.state.player.flybyFocus.active, true,
      `moving target keeps the lease through tick ${tick}`);
    assert.equal(f.state.timeScale, 0.5, `moving target keeps 50% time through tick ${tick}`);
  }
  assert.equal(ends.length, 0, 'range exit cannot emit an early Focus end');

  target.pos.x += target.vel.x * DT;
  f.state.simTime = 3;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false);
  assert.equal(f.state.timeScale, 1);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].reason, 'expired');
  assert.equal(ends[0].endedAt, 3);
  f.system.destroy();
}

{
  const f = runtimeFor([hostile(2)], { tetherActive: true });
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false, 'an existing tether blocks a new Focus window');
  assert.equal(f.state.timeScale, 1);
  f.system.destroy();
}

{
  const f = runtimeFor([hostile(2)]);
  f.system.update(DT, f.state);
  f.system.destroy();
  assert.equal(f.state.player.flybyFocus.active, false);
  assert.equal(f.state.timeScale, 1, 'destroy releases the Focus request');
}

// A corpse that never fires player:death must not keep or re-open Focus / slow-time.
{
  const target = hostile(2);
  const f = runtimeFor([target]);
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, true, 'fixture activates before death');
  f.p.alive = false;
  f.state.simTime = DT;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false, 'dead player releases Focus without waiting for player:death');
  assert.equal(f.state.player.flybyFocus.targetId, null);
  assert.equal(f.state.timeScale, 1, 'dead player clears slow-time');
  f.state.simTime = 5;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false, 'dead player cannot re-open Focus');
  assert.equal(f.state.timeScale, 1);
  f.system.destroy();
}

// player:death resets cooldown; update() must still refuse to lease a new window on a corpse.
{
  const target = hostile(2);
  const f = runtimeFor([target]);
  f.system.update(DT, f.state);
  f.bus.emit('player:death', {});
  f.p.alive = false;
  f.state.simTime = 0.25;
  f.system.update(DT, f.state);
  assert.equal(f.state.player.flybyFocus.active, false, 'Focus stays dark after death even though cooldown was reset');
  assert.equal(f.state.timeScale, 1);
  f.system.destroy();
}

{
  const p = player();
  const nanTarget = hostile(2, { pos: { x: Number.NaN, z: 0 } });
  const state = stateWith([], { player: p }).state;
  assert.equal(pickFlybyTarget(state, p, [nanTarget]), null, 'NaN-position contacts are not eligible');
  p.alive = false;
  assert.equal(pickFlybyTarget(state, p, [hostile(3)]), null, 'a dead player cannot acquire Focus');
}

// Registry/test re-init must finish the lease through the OLD state/time authority before the
// singleton object adopts new references. The new bus must not receive an end event for old state.
{
  const old = runtimeFor([hostile(2)], { targetId: 'persistent-selection' });
  const oldState = old.state;
  const oldEnds = [];
  old.bus.on('flybyFocus:end', (payload) => oldEnds.push(payload));
  old.system.update(DT, old.state);
  assert.equal(oldState.player.flybyFocus.active, true);
  assert.equal(oldState.timeScale, 0.5);

  const nextFixture = stateWith([]);
  const nextBus = createBus();
  const nextTimeEffects = createTimeEffects(nextFixture.state);
  const nextEnds = [];
  nextBus.on('flybyFocus:end', (payload) => nextEnds.push(payload));
  old.system.init({
    state: nextFixture.state,
    bus: nextBus,
    timeEffects: nextTimeEffects,
  });

  assert.equal(oldState.player.flybyFocus.active, false, 'old Focus lease is finished before re-init');
  assert.equal(oldState.player.flybyFocus.latchScale, 1, 'old latch presentation scale is normalized');
  assert.equal(oldState.player.targetId, 'persistent-selection',
    're-init finishes the transient lease without mutating persistent selection');
  assert.equal(oldState.timeScale, 1, 'old time authority is released before re-init');
  assert.equal(oldEnds.length, 1, 'old bus receives exactly one end event for its lease');
  assert.deepEqual(
    { reason: oldEnds[0].reason, targetId: oldEnds[0].targetId },
    { reason: 'reinit', targetId: 2 },
  );
  assert.deepEqual(
    Object.keys(oldEnds[0]).sort(),
    ['endedAt', 'reason', 'targetId'],
    're-init end payload contains only the documented fields',
  );
  assert.equal(nextFixture.state.player.flybyFocus.active, false, 'new state starts with no Focus lease');
  assert.equal(nextFixture.state.timeScale, 1, 'new state starts at normal time');
  assert.equal(nextEnds.length, 0, 'new bus receives no end event for the old state');
  old.system.destroy();
}

const source = readFileSync(new URL('../src/systems/flybyFocus.js', import.meta.url), 'utf8');
assert.doesNotMatch(source, /Math\.random\s*\(/, 'Focus sim code must not use Math.random');
assert.doesNotMatch(source, /(?:Date|performance)\.now\s*\(/, 'Focus sim code must not use wall-clock time');

console.log('flyby-focus: targeting, lease, timing, reset, and exact-F contracts PASS');
