// NXI-004 — keep two gamepads distinguishable after index reuse.
//
// The NXB-001 takeover record (gp._active = {index, id, generation}) already rejects the
// reused array slot's old axes and held buttons. The gap this packet closes is the remap
// capture's scratch state: `_captureGesture`/`_captureSpent` queued a held modifier sampled
// from the OLD connection generation, so pad A's half-formed chord could finish under pad B
// ('l1+action' out of a lone B press). The fix clears that scratch on both takeover seams —
// `_resetState` (disconnect) and `beginPadGesture` (a different device claiming input).
//
// Also pinned: under a legal settings remap (fire -> 'cancel', a flight/modal share the
// resolver allows), pad B's held-through button is inherited, not a shot, and only B's own
// fresh press feeds the new map.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGamepad } from '../src/systems/gamepad.js';

const DT = 1 / 60;

function button(down) {
  return { pressed: !!down, value: down ? 1 : 0 };
}

function fakePad(id, axes, held = []) {
  const buttons = [];
  for (let i = 0; i < 17; i++) buttons.push(button(held.includes(i)));
  return { connected: true, id, axes: axes.slice(), buttons };
}

function installNavigator(padsRef) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: { getGamepads: () => padsRef.pads },
    configurable: true,
    writable: true,
  });
  return () => {
    if (prev) Object.defineProperty(globalThis, 'navigator', prev);
    else delete globalThis.navigator;
  };
}

function makeState() {
  return {
    tick: 0,
    settings: { controls: { gamepad: { enabled: true, deadzone: 0.12 } } },
  };
}

test('NXI-004 a held modifier from a disconnected pad cannot chord under the reused index', () => {
  const padsRef = { pads: [fakePad('pad-a', [0, 0, 0, 0], [4])] }; // pad A holds LB
  const restore = installNavigator(padsRef);
  try {
    const state = makeState();
    const gp = createGamepad({ bus: { emit() {} }, state });
    gp.captureMode = true; // Settings → Controls pad-remap capture is listening
    const tick = () => { state.tick += 1; gp.tick(DT, state, null); };

    tick(); // boot-acquire pad A
    tick(); // 'l1' lands as a pending capture gesture while the player holds the modifier
    assert.deepEqual(gp._captureGesture, ['l1'], 'A\'s held modifier waits for a chord key');

    padsRef.pads = [null]; // A is unplugged
    tick();
    assert.equal(gp.isConnected(), false);

    // Pad B occupies A's array slot with its own buttons: nothing held, then a fresh X press.
    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [])];
    tick(); // baseline sample of the new generation — no gesture yet
    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [2])];
    tick(); // B's X press is the deliberate takeover edge
    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [])];
    tick(); // release commits the capture

    assert.equal(gp.id, 'pad-b', 'the live sample is B\'s generation, not A\'s');
    assert.deepEqual(gp.drainButtonPresses(), ['action'],
      'only B\'s own press is captured — A\'s l1 must not ride the reused slot');
  } finally { restore(); }
});

test('NXI-004 a live pad takeover on another slot cannot finish the old pad\'s gesture', () => {
  const padsRef = {
    pads: [
      fakePad('pad-a', [0, 0, 0, 0], [4]), // A holds LB mid-capture
      fakePad('pad-b', [0, 0, 0, 0], []),  // B already connected on slot 1
    ],
  };
  const restore = installNavigator(padsRef);
  try {
    const state = makeState();
    const gp = createGamepad({ bus: { emit() {} }, state });
    gp.captureMode = true;
    const tick = () => { state.tick += 1; gp.tick(DT, state, null); };

    tick(); // boot-acquire A; B sampled as present-but-inert
    tick(); // A's 'l1' is pending
    assert.deepEqual(gp._captureGesture, ['l1']);

    padsRef.pads = [
      fakePad('pad-a', [0, 0, 0, 0], [4]),
      fakePad('pad-b', [0, 0, 0, 0], [2]), // B presses X — its deliberate takeover edge
    ];
    tick();
    assert.equal(gp.id, 'pad-b', 'B\'s gesture owns the sample now');

    padsRef.pads = [
      fakePad('pad-a', [0, 0, 0, 0], [4]),
      fakePad('pad-b', [0, 0, 0, 0], []),
    ];
    tick();
    assert.deepEqual(gp.drainButtonPresses(), ['action'],
      'B pressed X alone — the queued name must not carry A\'s modifier');
  } finally { restore(); }
});

test('NXI-004 under a different resolved map only B\'s fresh mapping is accepted', () => {
  const padsRef = { pads: [fakePad('pad-a', [0, 0, 0, 0], [7])] }; // A holds RT (fire)
  const restore = installNavigator(padsRef);
  try {
    const state = makeState();
    const gp = createGamepad({ bus: { emit() {} }, state });
    const tick = () => { state.tick += 1; gp.tick(DT, state, null); };

    tick();
    assert.equal(gp.actions.fire.held, true, 'A\'s trigger is a real held fire while A owns the slot');

    // B arrives under a different bindings map: a legal modal->flight share moves 'cancel'
    // off B/Circle (index 1) onto Y (index 3). The resolver rebuild runs inside B's ticks.
    state.settings.controls.gamepad.bindings = { cancel: ['alt'] };

    padsRef.pads = [null];
    tick();
    assert.equal(gp.actions.fire.held, false, 'disconnect zeroes the old generation');

    // B sits on B/Circle — 'cancel's OLD seat, which is unbound under the new map.
    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [1])];
    tick(); // baseline of B's generation — publishes nothing
    assert.equal(gp.actions.fire.held, false, 'A\'s RT hold cannot ghost fire on B\'s slot');
    assert.equal(gp.actions.fire.released, false, 'no phantom release edge crosses generations');

    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [0, 1])]; // B's deliberate A press takes over
    tick();
    assert.equal(gp.id, 'pad-b', 'the takeover record carries B\'s identity, not the index');
    assert.equal(gp.actions.accept.pressed, true, 'B\'s fresh A press is its own verb');
    assert.equal(gp._mapCache.map.cancel[0], 'alt', 'the fresh map, not A\'s, resolved');
    assert.equal(gp.actions.cancel.held, false,
      'B\'s held B/Circle means nothing under the new map — the old seat is unbound');
    assert.equal(gp.actions.deployRepulsor.held, false);

    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [])]; // B lets go of everything
    tick();
    padsRef.pads = [fakePad('pad-b', [0, 0, 0, 0], [3])]; // and presses Y — cancel's NEW seat
    tick();
    assert.equal(gp.actions.cancel.pressed, true,
      'a deliberate press at the new seat feeds B\'s fresh mapping');
  } finally { restore(); }
});

test('NXI-004 neighboring success: a real chord on one pad still captures as a chord', () => {
  const padsRef = { pads: [fakePad('pad-a', [0, 0, 0, 0], [])] };
  const restore = installNavigator(padsRef);
  try {
    const state = makeState();
    const gp = createGamepad({ bus: { emit() {} }, state });
    gp.captureMode = true;
    const tick = () => { state.tick += 1; gp.tick(DT, state, null); };

    tick(); // acquire
    padsRef.pads = [fakePad('pad-a', [0, 0, 0, 0], [4])]; // LB down — the modifier
    tick();
    padsRef.pads = [fakePad('pad-a', [0, 0, 0, 0], [4, 12])]; // D-pad up taps under it
    tick();
    padsRef.pads = [fakePad('pad-a', [0, 0, 0, 0], [4])];
    tick();
    padsRef.pads = [fakePad('pad-a', [0, 0, 0, 0], [])];
    tick();
    assert.deepEqual(gp.drainButtonPresses(), ['l1+dUp'],
      'modifier plus key on the SAME pad is still one chord name');
  } finally { restore(); }
});
