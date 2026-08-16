import assert from 'node:assert/strict';
import test from 'node:test';

import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { masslineThrow, selfSlingBonusDv } from '../src/systems/masslineThrow.js';

test('release flourish is retired: a cut never adds load-scaled extra delta-v', () => {
  assert.equal(selfSlingBonusDv(1, 1, true), 0, 'a near-stationary release gets no kick');
  assert.equal(selfSlingBonusDv(100, 1, false), 0, 'a slack line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(100, 0, true), 0, 'an unloaded line gets no kick at any speed');
  assert.equal(selfSlingBonusDv(24.99, 1, true), 0, 'an accidental low-speed tap gets no kick');
  assert.equal(selfSlingBonusDv(100, 0.55, true), 0, 'ordinary loaded tension adds nothing');
  assert.equal(selfSlingBonusDv(100, 1, true), 0, 'a fully loaded taut swing adds nothing');
  assert.equal(selfSlingBonusDv(-100, 2, true), 0, 'unsigned speed and clamped load still add nothing');
});

test('a taut loaded manual cut keeps the real exit speed and records zero added delta-v', () => {
  const saved = { ...MASSLINE2_FLAGS };
  for (const key of Object.keys(MASSLINE2_FLAGS)) MASSLINE2_FLAGS[key] = true;
  try {
    const player = {
      id: 1, type: 'ship', alive: true, mass: 20, radius: 8,
      pos: { x: 0, z: 0 }, vel: { x: 100, z: 0 },
    };
    const anchor = {
      id: 2, type: 'asteroid', alive: true, mass: 20_000, radius: 40,
      pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    };
    const impulses = [];
    const state = {
      mode: 'flight', tick: 300, simTime: 5, playerId: 1,
      entities: new Map([[1, player], [2, anchor]]), entityList: [player, anchor],
      settings: { gameplay: { masslineReleaseAssist: 'arm' } },
      input: { actions: { throwArm: false } },
      player: {
        targetId: null,
        tether: { active: true, targetId: 2, attachmentId: 'att-sling', phase: 'loaded', load: 1 },
        masslineTelemetry: { active: true, tangentialSpeed: 100 },
      },
      nav: { waypoint: { pos: { x: 500, z: 0 }, arrivalRadius: 18 } },
    };
    const handlers = new Map();
    const bus = {
      on(type, fn) {
        const list = handlers.get(type) || [];
        list.push(fn);
        handlers.set(type, list);
        return () => {};
      },
      emit(type, payload) {
        for (const fn of handlers.get(type) || []) fn(payload, type);
      },
    };
    masslineThrow.init({
      state,
      bus,
      helpers: {
        combatPhysics: {
          applyImpulse(command) {
            impulses.push(command);
            return true;
          },
        },
      },
      registry: { get: () => null },
    });
    masslineThrow.update(1 / 60, state);
    const earned = { x: player.vel.x, z: player.vel.z };
    bus.emit('tether:cut', { targetId: anchor.id, slingshot: true });

    assert.equal(impulses.length, 0, 'the retired flourish must not queue a physics impulse');
    assert.deepEqual({ x: player.vel.x, z: player.vel.z }, earned);
    const receipt = state.massline2.throw.lastSelfSling;
    assert.equal(receipt.bonusDv, 0);
    assert.equal(receipt.releaseAddedDv, 0);
    assert.equal(receipt.exitSpeed, 100);
    assert.deepEqual(receipt.impulses, []);
  } finally {
    Object.assign(MASSLINE2_FLAGS, saved);
    masslineThrow.destroy();
  }
});
