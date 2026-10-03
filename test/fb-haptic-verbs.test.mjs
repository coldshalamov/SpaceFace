// FB-005 — "Haptics have their own axis and speak per-verb."
//
// Rumble is its own accessibility axis (off/low/full), not a side-effect of reduce-motion — a
// calmer screen often wants MORE haptic substitution, not less. On top of the continuous
// tension/slam/boost channels, six player verbs fire one-shot pulses on the event bus; at most
// one pulse per ~80 ms so a chain of events never becomes a flat buzz. NPC detonations and
// impacts that do not involve the player stay silent.
//
// Run: node --test test/fb-haptic-verbs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

let installedPad = null;
function makePad() {
  return {
    id: 'SpaceFace Synthetic Pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    vibrationActuator: {
      calls: [],
      playEffect(type, params) { this.calls.push({ type, params }); return Promise.resolve('complete'); },
      reset() { this.resetCalls = (this.resetCalls || 0) + 1; },
      resetCalls: 0,
    },
  };
}
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => (installedPad ? [installedPad] : []) },
  configurable: true,
});

const {
  createGamepad,
  computeHapticFrame,
  normalizeHapticLevel,
  HAPTIC_VERB_PULSES,
  HAPTIC_RELEASE_PULSES,
  HAPTIC_PULSE_MIN_GAP_TICKS,
} = await import('../src/systems/gamepad.js');
const { createBus } = await import('../src/core/eventBus.js');
const { createGameState } = await import('../src/core/gameState.js');
const { save } = await import('../src/save/saveSystem.js');

function padState(overrides = {}) {
  return {
    tick: 1,
    mode: 'flight',
    playerId: 1,
    player: { tether: { active: false, load: 0 } },
    input: {},
    settings: {
      controls: { gamepad: { enabled: true } },
      accessibility: { haptics: 'full', reduceMotion: false, ...overrides },
    },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  };
}

function step(gp, state, n = 1) {
  for (let i = 0; i < n; i++) { state.tick += 1; gp.tick(1 / 60, state); }
}

test('FB-005: the six verb events each produce their own pulse profile', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  assert.equal(gp.connected, true);

  const cases = [
    ['tether:latched', {}, HAPTIC_VERB_PULSES['tether:latched']],
    ['tether:cut', {}, HAPTIC_VERB_PULSES['tether:cut']],
    ['massline:snareCaught', {}, HAPTIC_VERB_PULSES['massline:snareCaught']],
    ['charge:detonated', { trigger: 'manual' }, HAPTIC_VERB_PULSES['charge:detonated']],
    ['cloak:engaged', {}, HAPTIC_VERB_PULSES['cloak:engaged']],
    ['tether:releaseRated', { classification: 'razor' }, HAPTIC_RELEASE_PULSES.razor],
  ];
  for (const [event, payload, spec] of cases) {
    step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2); // let any prior pulse/gap fully expire
    bus.emit(event, payload);
    step(gp, state);
    assert.ok(gp.haptics.pulse, `${event} lays a pulse over the continuous channels`);
    assert.equal(gp.haptics.pulse.strong, spec.strong, `${event} strong channel`);
    assert.equal(gp.haptics.pulse.weak, spec.weak, `${event} weak channel`);
    assert.equal(gp._lastVerbPulse, event);
    const lastCall = installedPad.vibrationActuator.calls.at(-1);
    assert.ok(lastCall && lastCall.type === 'dual-rumble', `${event} drives the actuator`);
  }
});

test('FB-005: release grading picks the band — a razor snap is not a messy thud', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  for (const band of ['razor', 'clean', 'good', 'messy']) {
    step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
    bus.emit('tether:releaseRated', { classification: band });
    step(gp, state);
    assert.deepEqual(gp.haptics.pulse,
      { strong: HAPTIC_RELEASE_PULSES[band].strong, weak: HAPTIC_RELEASE_PULSES[band].weak },
      `${band} release gets its own crack`);
  }
  // An unclassed release is still a release — the messy fallback, never silence.
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('tether:releaseRated', {});
  step(gp, state);
  assert.deepEqual(gp.haptics.pulse,
    { strong: HAPTIC_RELEASE_PULSES.messy.strong, weak: HAPTIC_RELEASE_PULSES.messy.weak });
});

test('FB-005: at most one pulse per ~80 ms — a burst of events does not become a buzz', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  assert.equal(HAPTIC_PULSE_MIN_GAP_TICKS, 5, '5 sim ticks ≈ 83 ms at 60 Hz');

  bus.emit('tether:latched', {});
  step(gp, state);
  assert.ok(gp.haptics.pulse, 'the first event pulses');
  const first = gp.haptics.pulse;

  // Fire a second event inside the gap: it is swallowed, the live pulse is undisturbed.
  bus.emit('tether:cut', {});
  step(gp, state, 2);
  assert.equal(gp._lastVerbPulse, 'tether:latched', 'the in-gap event never owned a pulse');
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, first.strong);

  // After the gap elapses the next event pulses on its own merits.
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('tether:cut', {});
  step(gp, state);
  assert.equal(gp._lastVerbPulse, 'tether:cut');
  assert.equal(gp.haptics.pulse.strong, HAPTIC_VERB_PULSES['tether:cut'].strong);
});

test('FB-005: NPC and non-player events stay silent', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);

  // NPC ordnance shares charge:detonated — only the player's manual/proximity triggers speak.
  for (const trigger of ['sympathetic', 'dart', 'enemy']) {
    bus.emit('charge:detonated', { trigger });
    step(gp, state);
    assert.equal(gp.haptics.pulse, null, `NPC charge trigger '${trigger}' is silent`);
  }
  // A collision the player was never part of registers no slam.
  bus.emit('physics:impact', { aId: 7, bId: 9, dp: 20000 });
  step(gp, state);
  assert.equal(gp.haptics.slam, 0, 'an impact between strangers does not slam the player');
  assert.equal(gp.haptics.pulse, null);

  // Player-involved versions of the same events DO speak (guard against a dead filter).
  bus.emit('physics:impact', { aId: 1, bId: 9, dp: 20000 });
  step(gp, state);
  assert.ok(gp.haptics.slam > 0, 'the player taking a hit still slams');
});

test('FB-005: haptics live on their own axis — reduce-motion no longer silences rumble', () => {
  // The frame API never reads reduceMotion: same channels, same answer.
  const calm = computeHapticFrame({
    momentum: 60, boost: true, haptics: 'full', reduceMotion: true,
  });
  const plain = computeHapticFrame({
    momentum: 60, boost: true, haptics: 'full', reduceMotion: false,
  });
  assert.deepEqual(calm, plain, 'reduce-motion is vestibular, not a rumble switch');
  assert.ok(plain.weak > 0 && plain.strong > 0, 'the frame is still alive under reduce-motion');

  installedPad = makePad();
  const bus = createBus();
  const state = padState({ reduceMotion: true });
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  bus.emit('tether:latched', {});
  step(gp, state);
  assert.ok(gp.haptics.pulse, 'a reduce-motion player still feels the latch click');
});

test('FB-005: off yields an inert frame and resets the motors; low halves them', () => {
  const offFrame = computeHapticFrame({ momentum: 120, boost: true, slam: 1, haptics: 'off',
    pulse: { strong: 1, weak: 1 } });
  assert.equal(offFrame.enabled, false);
  assert.equal(offFrame.strong, 0);
  assert.equal(offFrame.weak, 0);
  assert.equal(offFrame.pulse, null, 'even a live pulse is swallowed by off');
  assert.equal(normalizeHapticLevel('quiet'), 'full', 'unknown levels fall back to full');
  assert.equal(normalizeHapticLevel(undefined), 'full', 'an unset preference ships full');

  const lowFrame = computeHapticFrame({ boost: true, momentum: 120, haptics: 'low' });
  const fullFrame = computeHapticFrame({ boost: true, momentum: 120, haptics: 'full' });
  assert.ok(Math.abs(lowFrame.weak - fullFrame.weak * 0.5) < 1e-9, 'low halves the weak motor');
  assert.ok(Math.abs(lowFrame.strong - fullFrame.strong * 0.5) < 1e-9, 'low halves the strong motor');

  // Live: a pad mid-rumble goes quiet when the level flips to off — motors reset once.
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  bus.emit('tether:latched', {});
  step(gp, state);
  assert.ok(installedPad.vibrationActuator.calls.length > 0, 'the pad rumbled');
  state.settings.accessibility.haptics = 'off';
  const callsBefore = installedPad.vibrationActuator.calls.length;
  step(gp, state, 2);
  assert.equal(installedPad.vibrationActuator.calls.length, callsBefore,
    'off issues no further playEffect calls');
  assert.ok(installedPad.vibrationActuator.resetCalls >= 1, 'off resets the motors');

  // The legacy controls.gamepad.haptics === false kill-switch still forces off.
  state.settings.accessibility.haptics = 'full';
  state.settings.controls.gamepad.haptics = false;
  bus.emit('tether:latched', {});
  step(gp, state);
  assert.equal(gp.haptics.enabled, false, 'the legacy kill-switch still wins');
});

test('FB-005: the haptics level survives profile normalization; corrupt values repair', () => {
  const state = createGameState(5005);
  save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ accessibility: { haptics: 'low' } });
  assert.equal(state.settings.accessibility.haptics, 'low');

  const bogus = createGameState(5006);
  save.init({ state: bogus, bus: createBus(), helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ accessibility: { haptics: 'loud' } });
  assert.equal(bogus.settings.accessibility.haptics, 'full', 'an unknown level repairs to full');
});
