// INF-078 — warn about collateral without vetoing the stunt. The armed throw preview
// shows where the rock goes but never mentioned WHO is in the way: a protected body
// inside the predicted corridor went unnamed until law adjudicated the actual hit.
// Now the throw diamond appends one advisory cue naming the body — while the release
// stays fully the player's: stale predictions, unknown bodies, and non-protected
// traffic never trigger it, and it never blocks anything.
import test from 'node:test';
import assert from 'node:assert/strict';

import { masslineHud } from '../src/ui/masslineHud.js';
import {
  resolveThrowCollateral,
  THROW_COLLATERAL_PAD,
} from '../src/combat/masslineReleaseGeometry.js';

function fakeEl() {
  return {
    style: { setProperty() {} },
    textContent: '',
    classList: { toggle() {} },
    setAttribute() {},
  };
}

function fakeDom() {
  return { throwEl: fakeEl(), throwLabel: fakeEl(), selfEl: fakeEl(), selfLabel: fakeEl() };
}

const w2sCenter = () => ({ x: 720, y: 450, onScreen: true });

const CONFIDENT = Object.freeze({
  valid: true, onSolution: true, errorRad: 0, tolRad: 0.1, interceptAngle: 0,
  predicted: Object.freeze({ x: 200, z: 0 }),
});
const PAYLOAD_POS = Object.freeze({ x: 0, z: 0 });

function civilian(id, x, z, extra = {}) {
  return {
    id, type: 'ship', team: 2, alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 8, data: { role: 'hauler', displayName: 'Hauler' }, ...extra,
  };
}

function armedThrow(entities) {
  return {
    armed: true,
    payloadId: 5,
    aimTargetId: null,
    releaseTarget: { kind: 'point', pos: { x: 200, z: 0 } },
    solution: CONFIDENT,
  };
}

function stateWith(list) {
  const entities = new Map();
  entities.set(5, {
    id: 5, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6,
  });
  for (const entity of list) entities.set(entity.id, entity);
  return { entities, playerId: 1 };
}

test('the corridor names a protected body in the way', () => {
  const hit = resolveThrowCollateral(CONFIDENT, PAYLOAD_POS, 6,
    [{ x: 100, z: 5, r: 8, label: 'HAULER' }]);
  assert.ok(hit, 'body inside the corridor is named');
  assert.equal(hit.label, 'HAULER', 'the nearest body is named');
  const miss = resolveThrowCollateral(CONFIDENT, PAYLOAD_POS, 6,
    [{ x: 100, z: 60, r: 8, label: 'HAULER' }]);
  assert.equal(miss, null, 'traffic outside the corridor stays silent');
});

test('the nearest of two bodies wins; the pad is a readability tolerance', () => {
  assert.ok(THROW_COLLATERAL_PAD >= 0 && THROW_COLLATERAL_PAD <= 10, 'pad stays small');
  const hit = resolveThrowCollateral(CONFIDENT, PAYLOAD_POS, 6, [
    { x: 150, z: 10, r: 8, label: 'FAR' },
    { x: 60, z: 0, r: 8, label: 'NEAR' },
  ]);
  assert.equal(hit && hit.label, 'NEAR', 'nearest intersection wins');
});

test('uncertainty never triggers certainty', () => {
  const spots = [{ x: 100, z: 0, r: 8, label: 'HAULER' }];
  assert.equal(resolveThrowCollateral({ ...CONFIDENT, degraded: true }, PAYLOAD_POS, 6, spots), null,
    'a degraded prediction names nobody');
  assert.equal(resolveThrowCollateral({ ...CONFIDENT, decisionStale: true }, PAYLOAD_POS, 6, spots), null,
    'a stale prediction names nobody');
  assert.equal(resolveThrowCollateral({ ...CONFIDENT, valid: false }, PAYLOAD_POS, 6, spots), null,
    'an invalid solution names nobody');
  assert.equal(resolveThrowCollateral({ ...CONFIDENT, predicted: null }, PAYLOAD_POS, 6, spots), null,
    'no predicted point means no danger region');
  assert.equal(resolveThrowCollateral(CONFIDENT, null, 6, spots), null,
    'no payload position means no corridor');
  assert.equal(resolveThrowCollateral(CONFIDENT, PAYLOAD_POS, 6,
    [{ x: 100, z: 0, label: 'GHOST' }]), null, 'an unmeasurable spot is skipped');
  assert.equal(resolveThrowCollateral(CONFIDENT, PAYLOAD_POS, 6, []), null, 'empty sky is silent');
});

test('the throw diamond warns without vetoing', () => {
  const dom = fakeDom();
  const state = stateWith([civilian(9, 100, 5)]);
  masslineHud._updateThrowMark(dom, armedThrow(state.entities), state, w2sCenter);
  assert.equal(dom.throwEl.style.display, 'block', 'the preview still shows — never vetoed');
  assert.match(dom.throwLabel.textContent, /RELEASE/, 'the release read stays');
  assert.match(dom.throwLabel.textContent, /COLLATERAL RISK · HAULER/, 'the bystander is named');
});

test('a lawful patrol counts as protected; hostiles and the dead do not', () => {
  const patrol = {
    id: 11, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, data: { ai: { lawful: true } },
  };
  const dom = fakeDom();
  masslineHud._updateThrowMark(dom, armedThrow(), stateWith([patrol]), w2sCenter);
  assert.match(dom.throwLabel.textContent, /COLLATERAL RISK/, 'lawful hulls are protected');

  const hostile = {
    id: 12, type: 'ship', team: 1, alive: true, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, data: { ai: { archetype: 'pirate' } },
  };
  const dom2 = fakeDom();
  masslineHud._updateThrowMark(dom2, armedThrow(), stateWith([hostile]), w2sCenter);
  assert.doesNotMatch(dom2.throwLabel.textContent, /COLLATERAL/, 'a pirate is nobody\u2019s collateral');

  const wreck = civilian(13, 100, 0, { alive: false });
  const dom3 = fakeDom();
  masslineHud._updateThrowMark(dom3, armedThrow(), stateWith([wreck]), w2sCenter);
  assert.doesNotMatch(dom3.throwLabel.textContent, /COLLATERAL/, 'a dead hull triggers nothing');

  const hidden = civilian(14, 100, 0);
  delete hidden.pos;
  const dom4 = fakeDom();
  masslineHud._updateThrowMark(dom4, armedThrow(), stateWith([hidden]), w2sCenter);
  assert.doesNotMatch(dom4.throwLabel.textContent, /COLLATERAL/, 'an unpositioned body triggers nothing');
});

test('a stale solution keeps its STALE read with no speculation', () => {
  const dom = fakeDom();
  const state = stateWith([civilian(9, 100, 0)]);
  const stale = {
    ...armedThrow(),
    solution: { ...CONFIDENT, degraded: true },
  };
  masslineHud._updateThrowMark(dom, stale, state, w2sCenter);
  assert.equal(dom.throwLabel.textContent, 'STALE', 'uncertainty keeps its own read');
});
