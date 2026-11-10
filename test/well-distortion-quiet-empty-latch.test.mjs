/**
 * #120 well-distortion-quiet-empty-latch — quiet empty fields.active skips
 * a11y+CAP-zero+DistortionField.update; dirty-wake on active push / ref replace.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { FIELD_KINDS } from '../src/data/fields.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

function makePresenter(state) {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene(), state });
  return presenter;
}

function emptyState(active = []) {
  return {
    playerId: 1,
    simTime: 1,
    settings: { video: { motionReduce: false, flashReduce: false }, accessibility: {} },
    fields: { active },
    entities: new Map(),
    entityList: [],
    entityIndex: null,
  };
}

function wellRec(id = 'w1') {
  return {
    id,
    kind: FIELD_KINDS.WELL,
    center: { x: 10, z: -4 },
    distortionRadius: 190,
    distortionStrength: 240,
  };
}

test('quiet empty latch arms after first empty sync and skips subsequent updates', () => {
  const active = [];
  const state = emptyState(active);
  const presenter = makePresenter(state);
  const field = presenter.wellDistortion;
  let updates = 0;
  const orig = field.update.bind(field);
  field.update = (...args) => {
    updates += 1;
    return orig(...args);
  };

  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._wellDistortionQuietEmpty, true);
  assert.equal(field.live, 0);
  assert.equal(updates, 1, 'first empty sync still publishes once');

  updates = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(updates, 0, 'latched empty ticks skip DistortionField.update');
  assert.equal(presenter._wellDistortionQuietEmpty, true);
  presenter.dispose();
});

test('dirty-wake: fields.active push clears latch and resumes well sync', () => {
  const active = [];
  const state = emptyState(active);
  const presenter = makePresenter(state);
  const field = presenter.wellDistortion;
  let updates = 0;
  const orig = field.update.bind(field);
  field.update = (...args) => {
    updates += 1;
    return orig(...args);
  };

  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._wellDistortionQuietEmpty, true);
  updates = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(updates, 0);

  active.push(wellRec());
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._wellDistortionQuietEmpty, false);
  assert.equal(field.live, 1);
  assert.ok(updates >= 1, 'length bump wakes sync');

  // Drain — empty again re-latches.
  active.length = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(field.live, 0);
  assert.equal(presenter._wellDistortionQuietEmpty, true);
  updates = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(updates, 0, 're-latches after drain');
  presenter.dispose();
});

test('dirty-wake: replacing fields.active ref wakes even at same length', () => {
  const state = emptyState([]);
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._wellDistortionQuietEmpty, true);

  // Same length 0, new array identity.
  state.fields.active = [];
  const field = presenter.wellDistortion;
  let updates = 0;
  const orig = field.update.bind(field);
  field.update = (...args) => {
    updates += 1;
    return orig(...args);
  };
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(updates >= 1, 'active ref replace wakes');
  assert.equal(presenter._wellDistortionQuietEmpty, true, 're-arms on empty');
  presenter.dispose();
});

test('no-active / missing fields refuses sticky false latch across state swap', () => {
  const state = emptyState([]);
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._wellDistortionQuietEmpty, true);

  // Swap to a state with a live well via brand-new fields object.
  const live = emptyState([wellRec('live')]);
  presenter.update(1 / 60, { state: live, interpolationAlpha: 1 });
  assert.equal(presenter.wellDistortion.live, 1);
  assert.equal(presenter._wellDistortionQuietEmpty, false);
  presenter.dispose();
});
