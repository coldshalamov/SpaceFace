// THROW-02 — two proofs on the real masslineThrow + real input:
// 1. A fast swing that crosses the release band inside one tick still reports a release window of
//    at least 0.20 s of sim time — the lit RMB · THROW cue must be seeable (BOT-01: every
//    open:true died the same tick in Swarm). A tap inside the held tail earns the window's 'snap'
//    grade; a tap outside still throws as snap-manual (buffering unchanged).
// 2. Every loose free-floating rock the Swarm arena spawns (swarmArenaDebris asteroids and the
//    wreck-material ballast bodies) arms the throw; an Adventure field asteroid still cuts.
//    The arena's own spawn stamps the flag — proven through run:wavePlanned, not a fixture.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { input, domMouseDownEvent, domMouseUpEvent, isThrowArmPayload } from '../src/systems/input.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { releaseWindowOpen } from '../src/ui/throwCue.js';
import { entityOverLineClass } from '../src/data/lineProgression.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { swarmArena, SWARM_DEBRIS_TAG, SWARM_OPTIC_TAG } from '../src/systems/swarmArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const DT = 1 / 60;
const POINTER = { button: 2, clientX: 40, clientY: 40 };
const WINDOW_MIN_S = 0.20;

function world({ payloadType = 'hostile', payloadData = null, swingOmega = 3.0 } = {}) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 100; state.simTime = state.tick * DT;
  state.playerId = 1;
  state.entities.clear();
  state.entityList = [];
  const add = (e) => { state.entities.set(e.id, e); state.entityList.push(e); return e; };
  const player = add({ id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 40 },
    rot: 0, angVel: 0, mass: 40, radius: 12, flags: {}, data: { weapons: [], combat: {}, derived: {} } });
  const payload = payloadType === 'hostile'
    ? add({ id: 2, type: 'ship', alive: true, team: 1, pos: { x: 120, z: 0 }, vel: { x: 0, z: 120 }, mass: 16, radius: 14,
      flags: {}, data: { ai: { archetype: 'raider' }, combat: {} } })
    : add({ id: 2, type: payloadType, alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 120 }, mass: 16, radius: 14,
      data: payloadData || {} });
  const victim = add({ id: 3, type: 'ship', alive: true, team: 1, pos: { x: -500, z: 400 }, vel: { x: 0, z: 0 },
    mass: 30, radius: 14, flags: {}, data: { ai: { archetype: 'raider' }, combat: {} } });
  state.player.targetId = victim.id;
  state.player.tether = { active: false, targetId: null, attachmentId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' };
  state.input = { actions: {}, aimWorld: { x: -500, z: 400 }, aimIntentActive: false,
    mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false }, autoFire: false };

  const bus = createBus();
  const events = { throw: [], selfSling: [], cut: [], releaseWindow: [] };
  bus.on('massline:throw', (p) => events.throw.push(p));
  bus.on('massline:selfSling', (p) => events.selfSling.push(p));
  bus.on('tether:cut', (p) => events.cut.push(p));
  bus.on('massline:releaseWindow', (p) => events.releaseWindow.push({ ...p, simTime: state.simTime }));
  const attachments = {
    cut() { state.player.tether.active = false; state.player.tether.targetId = null; return { ok: true }; },
  };
  const host = Object.create(input);
  host._keys = Object.create(null); host._ndc = { x: 0, y: 0 }; host._screen = { x: 0, y: 0, active: false };
  host._m0 = host._m1 = host._m2 = false; host._lastKbmMs = 0;
  host.helpers = { raycastToPlane: () => ({ x: -500, z: 400 }) };
  host.bus = { emit() {} }; host.gamepad = null; host.touch = null; host.state = state;
  const system = Object.create(masslineThrow);
  system.init({ state, bus, helpers: {}, registry: { get: (k) => (k === 'actions' ? { kernel: { attachments } } : null) } });

  let phase = 0;
  const w = { state, host, system, events, player, payload, bus };
  w.tick = (n = 1, dt = DT) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1; state.simTime += dt;
      // The payload orbits the player on the taut line (a swing) — the release tangent sweeps the
      // aim target at swingOmega, exactly the motion that made Swarm's window sub-frame.
      phase += swingOmega * dt;
      payload.pos.x = Math.cos(phase) * 120; payload.pos.z = Math.sin(phase) * 120;
      payload.vel.x = -Math.sin(phase) * 120 * swingOmega; payload.vel.z = Math.cos(phase) * 120 * swingOmega;
      host.update(dt, state);
      const a = state.input.actions;
      if (a && a.tetherCut && state.player.tether.active) {
        attachments.cut(); bus.emit('tether:cut', { attachmentId: 8, targetId: payload.id });
      }
      system.update(DT, state);
    }
  };
  w.latch = () => {
    domMouseDownEvent(host, POINTER); w.tick(1);
    Object.assign(state.player.tether, { active: true, targetId: payload.id, attachmentId: 8, phase: 'loaded', load: 0.5, strain: 0.4, restLength: 120 });
    w.tick(1);
    domMouseUpEvent(host, POINTER); w.tick(1);
  };
  return w;
}

function withFlags(fn) {
  const saved = { ...MASSLINE2_FLAGS };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
  try { return fn(); } finally { Object.assign(MASSLINE2_FLAGS, saved); }
}

function windowPairs(events) {
  const pairs = [];
  let open = null;
  for (const e of events.releaseWindow) {
    if (e.open === true) { assert.equal(open, null, 'a new window cannot open while one is lit'); open = e; }
    else if (open) { pairs.push({ open, close: e }); open = null; }
  }
  return pairs;
}

test('a one-tick band crossing still reports a release window of at least 0.20 s of sim time', () => withFlags(() => {
  // omega 6 rad/s puts the contact band under ~1.5 ticks wide — the Swarm sub-frame case.
  const w = world({ swingOmega: 6.0 });
  w.latch();
  const litTicks = [];
  for (let i = 0; i < 260 && w.events.throw.length === 0; i++) {
    w.tick(1);
    const sol = w.state.massline2 && w.state.massline2.throw && w.state.massline2.throw.solution;
    if (releaseWindowOpen(w.state)) litTicks.push(!!(sol && sol.onSolution));
  }
  const pairs = windowPairs(w.events);
  assert.ok(pairs.length >= 2, `expected several band crossings over ~4 s of swing, saw ${JSON.stringify(w.events.releaseWindow)}`);
  for (const { open, close } of pairs) {
    const heldS = close.simTime - open.simTime;
    assert.ok(heldS >= WINDOW_MIN_S - 1e-9,
      `window opened at sim ${open.simTime} closed at ${close.simTime} (${heldS.toFixed(3)} s < 0.20 s)`);
    assert.ok(heldS <= 1.5, `a window held ${heldS.toFixed(2)} s — the hold must end, not stick`);
  }
  // The lit cue itself — the thing the player actually sees — reads open for the whole held span,
  // including ticks after the solver's own on-solution tick has passed (that is the hold working).
  assert.ok(litTicks.length > 0, 'the cue never lit over a full swing');
  assert.ok(litTicks.some((onSolution) => onSolution === false),
    'the cue stayed lit past the solver band — the hold never engaged');
}));

test('a tap inside the held window tail earns snap; a tap outside still throws snap-manual', () => withFlags(() => {
  // Held tail: windowOpen stays lit after onSolution goes false — tap there -> 'snap'.
  const w = world({ swingOmega: 6.0 });
  w.latch();
  let tappedInTail = false;
  for (let i = 0; i < 400 && w.events.throw.length === 0; i++) {
    w.tick(1);
    const sol = w.state.massline2?.throw?.solution;
    if (sol && sol.windowOpen === true && sol.onSolution === false) {
      domMouseDownEvent(w.host, POINTER); w.tick(1); domMouseUpEvent(w.host, POINTER);
      tappedInTail = true;
    }
  }
  assert.ok(tappedInTail, 'no held-but-off-band tick arrived to tap on');
  assert.equal(w.events.throw.length, 1);
  assert.equal(w.events.throw[0].mode, 'snap', 'a tap inside the lit window tail earns the window grade');
  assert.equal(w.events.throw[0].payloadId, w.payload.id);
  // The prediction receipt still reports the honest geometry at the release tick — the held grade
  // does not launder a late tap into a fake on-solution claim.
  assert.ok(w.events.throw[0].prediction, 'the throw keeps its prediction receipt');

  // Outside the window and outside the 350 ms buffer: the same tap is snap-manual, unchanged.
  const off = world({ swingOmega: 6.0 });
  off.latch();
  let tappedOutside = false;
  for (let i = 0; i < 400 && off.events.throw.length === 0; i++) {
    off.tick(1);
    const sol = off.state.massline2?.throw?.solution;
    const enterS = sol && sol.window && sol.window.enterS;
    if (sol && sol.windowOpen !== true && (enterS == null || enterS > 0.35)) {
      domMouseDownEvent(off.host, POINTER); off.tick(1); domMouseUpEvent(off.host, POINTER);
      tappedOutside = true;
    }
  }
  assert.ok(tappedOutside, 'no clearly out-of-window tick arrived to tap on');
  assert.equal(off.events.throw.length, 1);
  assert.equal(off.events.throw[0].mode, 'snap-manual', 'a tap outside the window still throws, unassisted');
}));

test('a Swarm arena debris rock arms the throw; a wreck-material one too; an Adventure rock cuts', () => withFlags(() => {
  for (const [payloadType, data, label] of [
    ['asteroid', { swarmArenaDebris: true, throwable: true, terrainAnchor: true }, 'debris rock'],
    ['wreck', { swarmArenaDebris: true, throwable: true, terrainAnchor: true }, 'ballast wreck'],
  ]) {
    const w = world({ payloadType, payloadData: data });
    assert.equal(isThrowArmPayload(w.state), false, `${label}: no throw arm before the latch`);
    w.latch();
    assert.equal(isThrowArmPayload(w.state), true, `${label}: the flag arms the throw`);
    w.tick(20);
    domMouseDownEvent(w.host, POINTER); w.tick(5); domMouseUpEvent(w.host, POINTER); w.tick(30);
    assert.equal(w.events.throw.length, 1, `${label}: the tap threw it`);
    assert.equal(w.events.cut.length, 0, `${label}: no plain tether_cut`);
  }

  const adv = world({ payloadType: 'asteroid', payloadData: {} });
  adv.latch();
  assert.equal(isThrowArmPayload(adv.state), false, 'an Adventure field asteroid is not throw-arm');
  adv.tick(20);
  domMouseDownEvent(adv.host, POINTER); adv.tick(5); domMouseUpEvent(adv.host, POINTER); adv.tick(5);
  assert.equal(adv.events.throw.length, 0);
  assert.equal(adv.events.cut.length, 1, 'an Adventure field asteroid still cuts');
}));

test('every rock the Swarm arena itself spawns is flagged throwable at spawn', () => {
  const SEED = 4242, ARENA = 'helios_core';
  const state = createGameState(SEED);
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', radius: 16 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.player.tether = { active: false, targetId: null };
  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET }) });

  const debris = state.entityList.filter((e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG] === true);
  assert.ok(debris.length >= 8, `the wave-1 room should field its cover (${debris.length})`);
  for (const rock of debris) {
    assert.equal(rock.data.throwable, true,
      `${rock.type} ${rock.id} (${rock.data.material || 'rock'}) spawned without the ammo flag`);
  }
  // The optic lattice is the arena's structure, not a loose rock — it keeps no flag.
  const lattice = state.entityList.filter((e) => e.data && e.data[SWARM_OPTIC_TAG] === true);
  for (const cell of lattice) assert.notEqual(cell.data.throwable, true);

  // isThrowArmPayload accepts a spawned debris rock on the player's line.
  const rock = debris.find((e) => e.type === 'asteroid' && Number.isFinite(e.radius) && e.radius <= 9);
  assert.ok(rock, 'a pebble-class debris rock exists in wave 1');
  state.player.tether = { active: true, targetId: rock.id };
  assert.equal(isThrowArmPayload(state), true, 'a spawned pebble-class rock arms the throw');
  // The line-class weight rule is untouched: a heavy body still reads over-class.
  const heavy = { ...rock, mass: 1e9, physicsBody: { mass: 1e9 }, data: { ...rock.data } };
  state.entities.set(-99, heavy);
  state.player.tether = { active: true, targetId: -99 };
  assert.equal(entityOverLineClass(state, heavy), true, 'a monster still says TOO HEAVY');
});
