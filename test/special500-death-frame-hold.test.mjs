import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { runRenderUpdatePhase } from '../src/core/renderUpdatePhase.js';
import { combat } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createSpecial500DeathBell } from '../src/systems/special500DeathBell.js';
import { feel as feelDefinition } from '../src/render/feel.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// CPU interfaces for the existing DOM/canvas feedback and the renderer's submission seam.
// No renderer, browser, AudioContext or GPU is constructed. Feel, the render phase,
// combat's death producer, the bell owner and core fixed steps are the real owners.
function fixture({ legacy = false } = {}) {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const doc = fakeDom(), make = doc.createElement;
  doc.body = doc._make('body');
  doc.createElement = tag => {
    const node = make(tag); node.isConnected = true;
    if (tag === 'canvas') node.getContext = () => ({
      clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
    });
    return node;
  };
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1280, innerHeight: 720 };
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight'; state.settings.gameplay.difficulty = 'ironman';
  state.ui.screenStack = []; state.ui.docked = false;
  state.world.activeSector.stations = [{ id: 'station_forge', pos: { x: 1000, z: 0 } }];
  const sim = createSimulation({ state, bus, seed: 4242, systems: [combat, createSpecial500DeathBell()] });
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, team: 0, player: state.player, pos: { x: 999, z: 0 },
  }));
  state.playerId = player.id;
  const effects = createTimeEffects(state), feel = Object.create(feelDefinition);
  feel.init({ state, bus, timeEffects: effects, helpers: {} });
  let visible = null, prepared = null, uiElapsed = 0, sequence = 0, uiCalls = 0;
  const preparedFrames = [], acknowledged = [], feelFrames = [], cues = [];
  const calls = { prepare: 0, draw: 0, vfx: 0, legacy: 0 };
  const actualFeelFrame = feel.frame;
  feel.frame = function(dt, current) { feelFrames.push(dt); return actualFeelFrame.call(this, dt, current); };
  const render = legacy ? {
    renderFrame(_alpha, _dt, frame) { calls.legacy += 1; visible = frame.sequence; preparedFrames.push(frame); },
  } : {
    prepareFrame(_alpha, _dt, frame) { calls.prepare += 1; prepared = frame; preparedFrames.push(frame); return true; },
    drawPreparedFrame() { calls.draw += 1; visible = prepared.sequence; return true; },
  };
  const ui = { frame(dt) { uiCalls += 1; uiElapsed += dt; } };
  const vfx = { update() { calls.vfx += 1; } };
  bus.on('audio:cue', payload => cues.push(payload));
  let occurrence = null;
  bus.on('special500:deathBell', payload => { occurrence = payload; });
  function present(dt = 1 / 60, frame = { sequence: ++sequence, journalStart: 0, journalEnd: sequence }) {
    const accepted = runRenderUpdatePhase({ state, bus, feel, render, ui, vfx, alpha: 1,
      frameDt: dt, presentationFrame: frame });
    if (accepted) acknowledged.push(frame);
    return accepted;
  }
  return { state, bus, sim, feel, effects, render, ui, calls, cues, feelFrames, preparedFrames, acknowledged,
    present, die() { sim.registry.get('combat').kill(player, null, {}); },
    get visible() { return visible; }, get uiElapsed() { return uiElapsed; }, get uiCalls() { return uiCalls; },
    get occurrence() { return occurrence; },
    dispose() {
      feel.destroy(); sim.dispose();
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    },
  };
}

function usingFixture(fn, options) {
  const f = fixture(options);
  try { return fn(f); } finally { f.dispose(); }
}

test('actual death occurrence retains the submitted frame for 0.25 presentation seconds without consuming journal ranges', () => usingFixture(f => {
  assert.equal(f.present(), true);
  const visible = f.visible, beforeTick = f.state.tick, beforeTime = f.state.simTime;
  const beforeUi = f.uiElapsed, beforeUiCalls = f.uiCalls;
  f.die();
  assert.ok(f.occurrence, 'the real combat death reaches the real bell owner');
  assert.ok(f.cues.some(cue => cue.id === 'sfx_eighth_bell_toll'), 'the hold does not replace the bell');
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), true);
  const beat = f.feel._beatTimer;
  const owed = { sequence: 2, journalStart: 1, journalEnd: 16 };
  for (let frame = 0; frame < 2; frame++) {
    for (let step = 0; step < 8; step++) f.sim.step(1 / 60);
    assert.equal(f.present(0.125, owed), false);
    assert.equal(f.visible, visible);
    assert.equal(f.state.timeScale, 1);
    assert.deepEqual(f.effects.describeRequests(), {});
  }
  assert.equal(f.state.tick, beforeTick + 16);
  assert.ok(f.state.simTime > beforeTime);
  assert.equal(f.uiCalls, beforeUiCalls + 2);
  assert.equal(f.uiElapsed, beforeUi + 0.25);
  assert.ok(f.feel._beatTimer < beat, 'existing feel feedback advances through the hold');
  assert.equal(f.calls.prepare, 1); assert.equal(f.calls.draw, 1); assert.equal(f.calls.vfx, 1);
  assert.equal(f.preparedFrames.includes(owed), false);
  assert.equal(f.acknowledged.includes(owed), false, 'unconsumed ranges cannot be acknowledged');
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
  assert.equal(f.present(1 / 60, owed), true);
  assert.equal(f.visible, 2); assert.equal(f.preparedFrames.at(-1), owed);
  assert.equal(f.acknowledged.at(-1), owed, 'the still-owed range is consumed only on resume');
}));

test('ordinary death-sheet pause retains the hold and expires on frameDt while simulation time is already paused', () => usingFixture(f => {
  f.present();
  f.bus.on('game:over', () => {
    f.state.ui.screenStack = ['gameOver'];
    f.effects.set('ui:pausing-screen', { scale: 0 });
    f.bus.emit('sim:pause', {});
    f.state.mode = 'paused';
    f.bus.emit('mode:changed', { from: 'flight', to: 'paused' });
  });
  f.die();
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), true);
  const simTime = f.state.simTime, visible = f.visible;
  assert.equal(f.present(0.125), false); assert.equal(f.present(0.125), false);
  assert.equal(f.visible, visible); assert.equal(f.state.simTime, simTime);
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false, 'expiration never waits on paused simTime');
  assert.deepEqual(f.effects.describeRequests(), { 'ui:pausing-screen': { scale: 0 } });
  assert.equal(f.state.timeScale, 0, 'the hold cannot release another owner\'s pause');
}));

test('new game, restore, loaded save, explicit pause and recovery dismissal cancel a pending hold', () => {
  for (const event of ['game:new', 'save:restoring', 'save:loaded', 'sim:pause', 'game:over:dismissed']) {
    usingFixture(f => {
      f.die(); assert.equal(f.feel.isDeathBellFrameHeld(f.state), true, event);
      f.bus.emit(event, {});
      assert.equal(f.feel.isDeathBellFrameHeld(f.state), false, event);
      assert.equal(f.present(), true, `${event}: no old hold survives the lifecycle edge`);
      assert.equal(f.state.timeScale, 1);
    });
  }
});

test('route, dock, modal, Photo and sector-admission transitions discard the old frame lease', () => {
  const transitions = [
    ['menu', s => { s.mode = 'menu'; }],
    ['loading', s => { s.mode = 'loading'; }],
    ['pause', s => { s.mode = 'paused'; s.ui.screenStack = ['pause']; }],
    ['dock', s => { s.ui.docked = true; }],
    ['map', s => { s.ui.screenStack = ['galaxyMap']; }],
    ['Photo', s => { s.mode = 'paused'; s.ui.screenStack = ['pause']; s.render.photoMode = { active: true }; }],
    ['sector admission', s => { s.render.sectorShellAdmission = true; }],
  ];
  for (const [name, transition] of transitions) usingFixture(f => {
    f.die(); transition(f.state);
    f.bus.emit('mode:changed', { to: f.state.mode });
    assert.equal(f.feel.isDeathBellFrameHeld(f.state), false, name);
    f.state.mode = 'flight'; f.state.ui.docked = false; f.state.ui.screenStack = [];
    f.state.render.photoMode = null; f.state.render.sectorShellAdmission = false;
    assert.equal(f.present(), true, `${name}: returning to flight cannot resurrect the lease`);
  });
});

test('reduced motion or reduced flash suppresses the hold and cancels an active one without suppressing the cue', () => {
  for (const [group, setting] of [['video', 'motionReduce'], ['accessibility', 'flashReduce'], ['video', 'flashReduce']]) {
    usingFixture(f => {
      (f.state.settings[group] ||= {})[setting] = true; f.die();
      assert.equal(f.feel.isDeathBellFrameHeld(f.state), false, `${group}.${setting}`);
      assert.ok(f.cues.some(cue => cue.id === 'sfx_eighth_bell_toll'));
      assert.equal(f.present(), true);
    });
    usingFixture(f => {
      f.die(); (f.state.settings[group] ||= {})[setting] = true;
      assert.equal(f.present(), true, `${group}.${setting}: next frame follows the new preference`);
      assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
    });
  }
});

test('feel rebind and teardown clear the lease and detach the previous occurrence listener', () => usingFixture(f => {
  f.die(); const occurrence = f.occurrence;
  f.feel.init({ state: f.state, bus: f.bus, timeEffects: f.effects, helpers: {} });
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
  const otherBus = createBus();
  f.feel.init({ state: f.state, bus: otherBus, timeEffects: f.effects, helpers: {} });
  f.bus.emit('special500:deathBell', occurrence); // delayed receipt from the retired realm
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
  f.feel.destroy(); otherBus.emit('special500:deathBell', occurrence);
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
  assert.deepEqual(f.effects.describeRequests(), {});
}));

test('held-frame feel failure still updates UI and never accepts the unconsumed range', () => usingFixture(f => {
  f.die(); const actualFrame = f.feel.frame, failure = new Error('feel frame failed');
  f.feel.frame = function(...args) { actualFrame.apply(this, args); throw failure; };
  assert.throws(() => f.present(0.125), failure);
  assert.equal(f.uiCalls, 1); assert.equal(f.uiElapsed, 0.125);
  assert.equal(f.calls.prepare, 0); assert.equal(f.calls.draw, 0); assert.equal(f.acknowledged.length, 0);
  f.feel.frame = actualFrame;
  assert.equal(f.present(0.125), false); assert.equal(f.present(), true);
}));

test('the same hold protects the legacy submission seam and releases after a long presentation frame', () => usingFixture(f => {
  f.present(); const visible = f.visible; f.die();
  assert.equal(f.present(1), false);
  assert.equal(f.visible, visible); assert.equal(f.calls.legacy, 1);
  assert.equal(f.feel.isDeathBellFrameHeld(f.state), false);
  assert.equal(f.present(), true); assert.equal(f.calls.legacy, 2);
}, { legacy: true }));
