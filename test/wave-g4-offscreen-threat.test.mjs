// Wave G4 — one edge mark for a shooter outside the frame.
// The side matches the attacker's quadrant. An in-frame attacker gets none.
// The mark dies with the hostile. Projectiles do not each grow a mark.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createThreatHalo,
  hostileCanShoot,
  offscreenShooterMarker,
} from '../src/ui/threatHalo.js';

test('G4 quadrant sides, and in-frame or unarmed shooters get no mark', () => {
  const frame = { frameWidth: 1280, frameHeight: 720 };
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: true, onScreen: false, screenX: 2000, screenY: 360, ...frame,
  }).side, 'right');
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: true, onScreen: false, screenX: -400, screenY: 360, ...frame,
  }).side, 'left');
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: true, onScreen: false, screenX: 640, screenY: -200, ...frame,
  }).side, 'top');
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: true, onScreen: false, screenX: 640, screenY: 1400, ...frame,
  }).side, 'bottom');
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: true, onScreen: true, screenX: 2000, screenY: 360, ...frame,
  }), null);
  assert.equal(offscreenShooterMarker({
    alive: false, canShoot: true, onScreen: false, screenX: 2000, screenY: 360, ...frame,
  }), null);
  assert.equal(offscreenShooterMarker({
    alive: true, canShoot: false, onScreen: false, screenX: 2000, screenY: 360, ...frame,
  }), null);
});

function mockDocument() {
  const elements = [];
  const fakeElement = (tag) => {
    const el = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      innerHTML: '',
      parentNode: null,
      setAttribute(k, v) { this.attributes[k] = String(v); },
      removeAttribute(k) { delete this.attributes[k]; },
      getAttribute(k) { return this.attributes[k]; },
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
      },
    };
    elements.push(el);
    return el;
  };
  return { elements, document: { createElement: fakeElement } };
}

function arcSlots(mock) {
  return mock.elements.filter((el) => String(el.className).includes('sf-threat-halo__slot--arc'));
}

function visibleArcs(mock) {
  return arcSlots(mock).filter((el) => el.style.display === 'block');
}

test('G4 places one marker on the shooter quadrant and none for an in-frame or dead attacker', () => {
  const mock = mockDocument();
  const oldDoc = globalThis.document;
  globalThis.document = mock.document;
  try {
    const halo = createThreatHalo(mock.document.createElement('div'));
    const player = { id: 'player', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
    const shooter = {
      id: 'raider', type: 'ship', team: 1, alive: true,
      pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
      data: { encounter: true, weapons: ['wpn_pulse'] },
    };
    const bolts = [1, 2].map((n) => ({
      id: 'bolt-' + n, type: 'projectile', alive: true,
      pos: { x: 400 + n * 40, z: 20 }, vel: { x: -10, z: 0 },
      data: { kind: 'bolt' },
    }));
    const state = { tick: 10, simTime: 10 / 60, playerId: player.id, entityList: [player, shooter, ...bolts] };
    const offRight = (world, out) => {
      out.x = 640 + world.x;
      out.y = 360;
      out.onScreen = false;
      return out;
    };
    halo.update(player, state, offRight);
    const marks = visibleArcs(mock);
    assert.equal(marks.length, 1, 'one marker for the shooter, not one per bolt');
    assert.equal(marks[0].attributes['data-entity-id'], 'raider');
    assert.equal(marks[0].attributes['data-edge'], 'right');
    assert.equal(hostileCanShoot(shooter), true);

    const inFrame = (world, out) => {
      out.x = 640;
      out.y = 360;
      out.onScreen = true;
      return out;
    };
    halo.update(player, state, inFrame);
    assert.equal(visibleArcs(mock).length, 0, 'an in-frame attacker gets no edge mark');

    shooter.alive = false;
    halo.update(player, state, offRight);
    assert.equal(visibleArcs(mock).length, 0, 'the mark dies with the hostile');
  } finally {
    globalThis.document = oldDoc;
  }
});
