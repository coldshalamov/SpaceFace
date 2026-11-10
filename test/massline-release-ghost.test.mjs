// §22 F1 — the release ghost. While a throw is armed, the HUD draws a thin predicted arc of
// the payload's own post-release path, read straight off the same mirrored solution the
// intercept diamond reads: the field-aware `projectedPath` when the solution carries one,
// the straight payload -> predicted segment for the constant-velocity model. It is
// presentation only — it never steers, and a stale or degraded solution paints nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { masslineHud } from '../src/ui/masslineHud.js';

function fakeEl() {
  const classes = new Set();
  return {
    style: { setProperty() {} },
    attrs: {},
    classes,
    textContent: '',
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
}

function fakeDom() {
  return {
    throwEl: fakeEl(),
    throwLabel: fakeEl(),
    selfEl: fakeEl(),
    selfLabel: fakeEl(),
    ghostSvg: fakeEl(),
    ghostPath: fakeEl(),
    ghostD: null,
  };
}

// World -> screen: an affine projection so a real polyline produces real path data.
const w2s = (q) => ({ x: q.x + 720, y: q.z + 450, onScreen: true });

const CONFIDENT = Object.freeze({
  valid: true, onSolution: true, errorRad: 0, tolRad: 0.1, interceptAngle: 0,
  predicted: Object.freeze({ x: 200, z: 0 }),
});

function stateWith() {
  const entities = new Map();
  entities.set(5, {
    id: 5, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6,
  });
  return { entities, playerId: 1 };
}

function armedThrow(solution) {
  return {
    armed: true,
    payloadId: 5,
    aimTargetId: null,
    releaseTarget: { kind: 'point', pos: { x: 200, z: 0 } },
    solution,
  };
}

test('a field-aware solution paints its own projected path as the ghost', () => {
  const dom = fakeDom();
  const state = stateWith();
  const path = [
    { x: 0, z: 0 }, { x: 60, z: 10 }, { x: 120, z: 30 }, { x: 200, z: 0 },
  ];
  const solution = { ...CONFIDENT, fieldAware: true, projectedPath: path };
  masslineHud._updateThrowMark(dom, armedThrow(solution), state, w2s);
  assert.equal(dom.ghostSvg.style.display, 'block', 'armed throw shows the ghost');
  const d = dom.ghostPath.attrs.d;
  assert.match(d, /^M720 450L780 460L840 480L920 450$/,
    'the ghost decimates nothing here: every projected vertex paints, in order');
  assert.ok(dom.ghostSvg.classes.has('ml2-hot'), 'an on-solution ghost warms with the diamond');
});

test('the constant-velocity model falls back to the straight payload -> predicted segment', () => {
  const dom = fakeDom();
  const state = stateWith();
  masslineHud._updateThrowMark(dom, armedThrow(CONFIDENT), state, w2s);
  assert.equal(dom.ghostSvg.style.display, 'block');
  assert.equal(dom.ghostPath.attrs.d, 'M720 450L920 450',
    'two world points, one straight segment');
});

test('a long projected path decimates but always lands its final point', () => {
  const dom = fakeDom();
  const state = stateWith();
  const path = [];
  for (let i = 0; i <= 200; i += 1) path.push({ x: i, z: i * 0.5 });
  const solution = { ...CONFIDENT, fieldAware: true, projectedPath: path };
  masslineHud._updateThrowMark(dom, armedThrow(solution), state, w2s);
  const d = dom.ghostPath.attrs.d;
  assert.ok(d, 'ghost paints');
  const segments = d.split('L').length;
  assert.ok(segments <= 48, `bounded decimation; got ${segments} vertices`);
  assert.ok(d.endsWith('L920 550'), 'the final predicted point is never decimated away');
});

test('an off-solution ghost stays cool', () => {
  const dom = fakeDom();
  const state = stateWith();
  const solution = { ...CONFIDENT, onSolution: false };
  masslineHud._updateThrowMark(dom, armedThrow(solution), state, w2s);
  assert.equal(dom.ghostSvg.style.display, 'block', 'a missable throw still shows its path');
  assert.equal(dom.ghostSvg.classes.has('ml2-hot'), false, 'no amber without a window');
});

test('stale or degraded solutions paint no path — a promise the prediction cannot keep', () => {
  const state = stateWith();
  for (const flag of ['degraded', 'decisionStale']) {
    const dom = fakeDom();
    const solution = {
      ...CONFIDENT, [flag]: true,
      fieldAware: true,
      projectedPath: [{ x: 0, z: 0 }, { x: 200, z: 0 }],
    };
    masslineHud._updateThrowMark(dom, armedThrow(solution), state, w2s);
    assert.equal(dom.ghostSvg.style.display, 'none', `${flag} hides the ghost`);
  }
});

test('nothing armed, nothing valid, nothing drawn', () => {
  const state = stateWith();
  const disarmed = fakeDom();
  masslineHud._updateThrowMark(disarmed, { armed: false, solution: CONFIDENT }, state, w2s);
  assert.equal(disarmed.ghostSvg.style.display, 'none', 'a disarmed throw hides the ghost');

  const invalid = fakeDom();
  masslineHud._updateThrowMark(invalid, armedThrow({ valid: false }), state, w2s);
  assert.equal(invalid.ghostSvg.style.display, 'none', 'an invalid solution hides the ghost');
});

test('a self-sling paints the same ghost from the player, not the anchor', () => {
  const dom = fakeDom();
  const entities = new Map();
  entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 40,
  });
  entities.set(7, {
    id: 7, type: 'asteroid', alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 20, mass: 400,
  });
  const state = { entities, playerId: 1 };
  const throwState = {
    armed: true,
    payloadId: 7, // the heavy anchor — the player is the body that will move
    aimTargetId: null,
    selfSolution: {
      valid: true, onSolution: true, errorRad: 0, tolRad: 0.1, interceptAngle: 0,
      targetKind: 'point', targetPos: { x: 200, z: 0 }, predicted: { x: 150, z: 0 },
      degraded: false,
    },
  };
  masslineHud._updateSelfMark(dom, throwState, state, w2s);
  assert.equal(dom.selfEl.style.display, 'block', 'precondition: the self mark paints');
  assert.equal(dom.ghostSvg.style.display, 'block', 'the self-sling shows its future too');
  assert.equal(dom.ghostPath.attrs.d, 'M720 450L870 450',
    'the arc starts at the player, not the anchor — and lands on the predicted point');
});

test('a self-domain miss hides the ghost the throw mark does not own', () => {
  const dom = fakeDom();
  const entities = new Map();
  entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 6, mass: 40 });
  const state = { entities, playerId: 1 };
  // No selfSolution: the self mark hides and the ghost goes with it.
  masslineHud._updateSelfMark(dom, { armed: false, payloadId: 1, selfSolution: null }, state, w2s);
  assert.equal(dom.ghostSvg.style.display, 'none');
});

test('the ghost is read-only: it never mutates the mirrored solution or the sim state', () => {
  const dom = fakeDom();
  const state = stateWith();
  const solution = {
    ...CONFIDENT, fieldAware: true,
    projectedPath: [{ x: 0, z: 0 }, { x: 100, z: 20 }, { x: 200, z: 0 }],
  };
  const throwState = armedThrow(solution);
  const before = JSON.stringify({ solution, throwState: { ...throwState, solution: undefined }, entities: [...state.entities.values()] });
  masslineHud._updateThrowMark(dom, throwState, state, w2s);
  const after = JSON.stringify({ solution, throwState: { ...throwState, solution: undefined }, entities: [...state.entities.values()] });
  assert.equal(after, before, 'presentation leaves every mirrored field untouched');
});
