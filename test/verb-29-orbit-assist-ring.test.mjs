// VERB-29 — the orbit assist shows the ring it is holding you to. flightV3 publishes a live
// ship->anchor radius on every player frame (`entity._flightFrame.orbitAssist`); the HUD paints
// it as a dashed ring centered on the tether anchor. Idle assist, a dead anchor, or a missing
// tether paints nothing — and the signature gate must roll for every one of the ring's inputs.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  masslineHud,
  masslineHudInputsUnchanged,
  resolveOrbitAssistRing,
} from '../src/ui/masslineHud.js';

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
  return { orbitSvg: fakeEl(), orbitCircle: fakeEl() };
}

const w2s = (q) => ({ x: q.x + 720, y: q.z + 450, onScreen: true });

function fixture(orbitAssist = { active: true, radius: 140, reason: 'engaged', direction: 1 }) {
  const entities = new Map();
  entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 360, z: -200 }, vel: { x: 0, z: 0 },
    _flightFrame: { orbitAssist },
  });
  entities.set(7, {
    id: 7, type: 'asteroid', alive: true, pos: { x: 500, z: -200 }, vel: { x: 0, z: 0 }, radius: 20,
  });
  const state = {
    entities,
    playerId: 1,
    player: { tether: { active: true, targetId: 7 } },
    massline2: {},
  };
  return { state, player: entities.get(1) };
}

test('an engaged assist resolves a ring centered on the tether anchor at the held radius', () => {
  const { state, player } = fixture();
  const ring = resolveOrbitAssistRing(state, player);
  assert.ok(ring, 'precondition: the ring resolves');
  assert.equal(ring.radius, 140);
  assert.equal(ring.x, 500);
  assert.equal(ring.z, -200);
});

test('the ring is zero-sized when the assist is idle — whatever the reason', () => {
  for (const oa of [
    { active: false, reason: 'no-lateral-intent' },
    { active: false, reason: 'assist-off' },
    { active: false, reason: 'unavailable' },
    { active: true, radius: 0, reason: 'engaged' },
    null,
  ]) {
    const { state, player } = fixture(oa);
    assert.equal(resolveOrbitAssistRing(state, player), null,
      `no ring for ${oa ? oa.reason : 'missing frame'}`);
  }
});

test('a dead or untethered anchor paints no ring', () => {
  const { state, player } = fixture();
  state.entities.get(7).alive = false;
  assert.equal(resolveOrbitAssistRing(state, player), null, 'dead anchor hides the ring');

  const fresh = fixture();
  fresh.state.player.tether.targetId = null;
  assert.equal(resolveOrbitAssistRing(fresh.state, fresh.player), null,
    'no tether target, no ring');
});

test('the signature rolls for every ring input — engage, radius, anchor drift', () => {
  const { state, player } = fixture();
  assert.equal(masslineHudInputsUnchanged(state, player), false, 'first read always repaints');
  assert.equal(masslineHudInputsUnchanged(state, player), true,
    'an unchanged frame is skipped');

  player._flightFrame.orbitAssist.active = false;
  assert.equal(masslineHudInputsUnchanged(state, player), false,
    'disengaging rolls the signature');
  assert.equal(masslineHudInputsUnchanged(state, player), true);

  player._flightFrame.orbitAssist = { active: true, radius: 220, reason: 'engaged', direction: 1 };
  assert.equal(masslineHudInputsUnchanged(state, player), false,
    'a new held radius rolls the signature');
  assert.equal(masslineHudInputsUnchanged(state, player), true);

  state.entities.get(7).pos.x = 560;
  assert.equal(masslineHudInputsUnchanged(state, player), false,
    'a drifting anchor re-centers the ring');
});

test('_updateOrbitRing projects the world ring and hides it when idle', () => {
  const { state, player } = fixture();
  const dom = fakeDom();
  masslineHud._updateOrbitRing(dom, player, state, w2s);
  assert.equal(dom.orbitSvg.style.display, 'block');
  // Anchor at (500,-200) -> (1220,250); edge at 640 -> x 1360; r = |1360-1220| = 140.
  assert.equal(dom.orbitSvg.style.transform, 'translate3d(1220px, 250px, 0)');
  assert.equal(dom.orbitCircle.attrs.r, '140');

  player._flightFrame.orbitAssist = { active: false, reason: 'assist-off' };
  masslineHud._updateOrbitRing(dom, player, state, w2s);
  assert.equal(dom.orbitSvg.style.display, 'none', 'idle assist hides the ring');
});

test('headless update returns without a DOM', () => {
  const { state } = fixture();
  assert.doesNotThrow(() => masslineHud.update(0.016, state));
});
