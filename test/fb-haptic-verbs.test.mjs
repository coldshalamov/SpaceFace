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

test('the gyre strain channel hums continuously under a held clump', () => {
  // A near-tear excursion is felt the WHOLE time, not only at the 120 ms
  // boundary pulse — the 'line'-load precedent for ongoing tension.
  const straining = computeHapticFrame({ gyreStrain: 0.6, haptics: 'full' });
  assert.equal(straining.gyre, 0.6);
  assert.ok(straining.weak >= 0.3, 'strain rides the weak motor');
  assert.ok(straining.strong >= 0.2, 'strain reaches the strong motor');

  const idle = computeHapticFrame({ gyreStrain: 0, haptics: 'full' });
  assert.equal(idle.gyre, 0);
  assert.equal(idle.weak, 0, 'no held clump → no hum');

  const off = computeHapticFrame({ gyreStrain: 1, haptics: 'off' });
  assert.equal(off.gyre, 0, 'off swallows the channel like every other');
  assert.equal(off.weak, 0);
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

test('gyre vocabulary routes through the pulse table — torn/dropped/droppedEmpty pseudo-keys', () => {
  installedPad = makePad();
  const bus = createBus();
  const state = padState();
  const gp = createGamepad({ bus, state });
  gp.tick(1 / 60, state);
  assert.equal(gp.connected, true);

  // [event, payload, spec the emit should own] — the dropped pseudo-key switch:
  // a torn clump is the big loss beat, an empty beam's close the soft flick, a
  // held clump's release the full thud. `reason` wins over the id key.
  const cases = [
    ['gyre:beamOn', {}, 'gyre:beamOn'],
    ['gyre:snagged', {}, 'gyre:snagged'],
    ['gyre:windup', {}, 'gyre:windup'],
    // thrown mass-lerps like the rest — at capped mass it lands the authored
    // full crack (the table value); the pebble end is asserted below.
    ['gyre:thrown', { mass: 2400 }, 'gyre:thrown'],
    ['gyre:full', {}, 'gyre:full'],
    ['gyre:fuseLow', {}, 'gyre:fuseLow'],
    ['gyre:ballGrave', {}, 'gyre:ballGrave'],
    ['gyre:strained', {}, 'gyre:strained'],
    ['gyre:dropped', { reason: 'strained', coreId: null }, 'gyre:torn'],
    ['gyre:dropped', { reason: 'launched', coreId: null }, 'gyre:droppedEmpty'],
    ['gyre:dropped', { coreId: 7 }, 'gyre:dropped'],
  ];
  for (const [event, payload, specName] of cases) {
    step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2); // let any prior pulse/gap fully expire
    bus.emit(event, payload);
    step(gp, state);
    const spec = HAPTIC_VERB_PULSES[specName];
    assert.equal(gp._lastVerbPulse, specName, `${event} ${JSON.stringify(payload)} → ${specName}`);
    assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, spec.strong, `${specName} strong channel`);
    assert.equal(gp.haptics.pulse && gp.haptics.pulse.weak, spec.weak, `${specName} weak channel`);
  }

  // The absorb tick lerps by meal mass: mass 0 is the authored flick, 80+ t lands
  // the drop-thud end of the lerp.
  const base = HAPTIC_VERB_PULSES['gyre:absorbTick'];
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('gyre:absorbTick', { mass: 0 });
  step(gp, state);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, base.strong, 'pebble stays the authored flick');
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('gyre:absorbTick', { mass: 80 });
  step(gp, state);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, base.strong + 0.25, 'wreck lerp tops out');
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.weak, base.weak + 0.1, 'wreck lerp weak channel');

  // snagged/windup top ends too: at their lerp ceilings the payloads push past
  // the authored base — the graded paths aren't dead-tested at t=0.
  const sg = HAPTIC_VERB_PULSES['gyre:snagged'];
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('gyre:snagged', { mass: 200 });
  step(gp, state);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, sg.strong + 0.2, 'a wreck snag lands heavier');
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.weak, sg.weak + 0.15, 'wreck snag weak channel');
  const wu = HAPTIC_VERB_PULSES['gyre:windup'];
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('gyre:windup', { mass: 2400 });
  step(gp, state);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, wu.strong + 0.3, 'a capped coil rumbles heavier');
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.weak, wu.weak + 0.15, 'capped coil weak channel');

  // gyre:thrown pebble end: mass 0 throws lighter than the authored crack —
  // a capped moon (asserted in the loop above) lands the full table value.
  const tb = HAPTIC_VERB_PULSES['gyre:thrown'];
  step(gp, state, HAPTIC_PULSE_MIN_GAP_TICKS + 2);
  bus.emit('gyre:thrown', { mass: 0 });
  step(gp, state);
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.strong, tb.strong - 0.35, 'pebble throw cracks lighter');
  assert.equal(gp.haptics.pulse && gp.haptics.pulse.weak, tb.weak - 0.2, 'pebble throw weak channel');

  // Boundary/quiet drops are context resets — silence, and the live pulse is untouched.
  const last = gp._lastVerbPulse;
  bus.emit('gyre:dropped', { quiet: true, coreId: 7 });
  bus.emit('gyre:dropped', { boundary: true, coreId: 7 });
  step(gp, state);
  assert.equal(gp._lastVerbPulse, last, 'quiet/boundary drops never own a pulse');
});
