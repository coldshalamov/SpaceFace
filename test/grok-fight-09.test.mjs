// FIGHT-09: wardScreenTarget publishes the warded hull, and the halo marks it
// until the ward drops. The warden is still the returned screen body.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  publishedWardTarget,
  refreshWardScreenPublication,
  wardScreenTarget,
} from '../src/ai/specialistCounterplay.js';
import { applyWardScreenMark } from '../src/ui/threatHalo.js';

const SEED = 4242;

function host() {
  const attrs = new Map();
  return {
    setAttribute(name, value) { attrs.set(name, String(value)); },
    removeAttribute(name) { attrs.delete(name); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
  };
}

test('the halo marks the warded hull until the warden leaves the shot', () => {
  const player = {
    id: 1, alive: true, type: 'ship', team: 0, pos: { x: 0, z: 0 }, collisionRadius: 8,
  };
  const mule = {
    id: 30, alive: true, type: 'ship', team: 1, pos: { x: 200, z: 0 }, collisionRadius: 16,
    data: { enemyTypeId: 'hauler' },
  };
  const warden = {
    id: 13, alive: true, type: 'ship', team: 1, pos: { x: 100, z: 0 }, collisionRadius: 21,
    data: { enemyTypeId: 'warden_escort' },
  };
  const state = {
    meta: { seed: SEED },
    seed: SEED,
    entityList: [player, mule, warden],
  };
  const screen = wardScreenTarget(state, player, mule, { kind: 'weapon' });
  assert.equal(screen && screen.id, warden.id, 'the screen body is still the warden');
  assert.equal(publishedWardTarget(state), mule.id);
  assert.notEqual(publishedWardTarget(state), warden.id);

  assert.equal(wardScreenTarget(state, player, mule, { kind: 'collision' }), null);
  assert.equal(publishedWardTarget(state), mule.id, 'a slam does not drop the published ward');

  const layer = host();
  assert.equal(applyWardScreenMark(layer, state), mule.id);
  assert.equal(layer.getAttribute('data-warded-id'), String(mule.id));

  warden.pos = { x: 100, z: 400 };
  assert.equal(refreshWardScreenPublication(state), null);
  assert.equal(publishedWardTarget(state), null);
  assert.equal(applyWardScreenMark(layer, state), null);
  assert.equal(layer.getAttribute('data-warded-id'), null);

  warden.pos = { x: 100, z: 0 };
  assert.equal(wardScreenTarget(state, player, mule, { kind: 'weapon' }) && warden.id, warden.id);
  assert.equal(warden.collisionRadius, 21, 'ward radius math did not rewrite the warden');
  assert.equal(applyWardScreenMark(layer, state), mule.id);
});
