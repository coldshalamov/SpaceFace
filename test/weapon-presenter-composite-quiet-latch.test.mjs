/**
 * #126 weapon-presenter-composite-quiet-latch — quiet all-pools residual skips
 * ageShield+a11y+setCamera+syncBolts+nearMiss+N pool.update; dirty-wake on
 * pool live / quarks._quietEmpty / shields / fields.active / entityIndexVersion.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { FIELD_KINDS } from '../src/data/fields.js';
import {
  addShieldContact,
  clearShieldContacts,
  WeaponVfxPresenter,
} from '../src/render/weapons/index.js';

function makePresenter(state) {
  return new WeaponVfxPresenter({ scene: new THREE.Scene(), state });
}

function quietState(overrides = {}) {
  return {
    playerId: 1,
    simTime: 1,
    settings: { video: { motionReduce: false, flashReduce: false }, accessibility: {} },
    fields: { active: [] },
    entities: new Map([[1, { id: 1, alive: true, pos: { x: 0, z: 0 } }]]),
    entityList: [],
    entityIndex: {
      ready: true,
      version: 1,
      projectiles: [],
      __spacefaceEntityIndexV1: true,
    },
    ...overrides,
  };
}

test('composite quiet latch arms after first all-quiet update and skips residual', () => {
  clearShieldContacts();
  const state = quietState();
  const presenter = makePresenter(state);
  let boltBegins = 0;
  const origBegin = presenter.bolts.beginFrame.bind(presenter.bolts);
  presenter.bolts.beginFrame = (...args) => {
    boltBegins += 1;
    return origBegin(...args);
  };
  let dischargeUpdates = 0;
  const origDisc = presenter.discharges.update.bind(presenter.discharges);
  presenter.discharges.update = (...args) => {
    dischargeUpdates += 1;
    return origDisc(...args);
  };

  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true, 'arms composite latch');
  assert.equal(presenter.bolts._quietEmpty, true);
  assert.ok(presenter.quarks._quietEmpty, 'quarks quiet after first empty update');
  assert.ok(boltBegins >= 1, 'first tick still runs syncBolts begin');
  assert.ok(dischargeUpdates >= 1, 'first tick still runs discharges.update');

  boltBegins = 0;
  dischargeUpdates = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(boltBegins, 0, 'latched ticks skip syncBolts begin');
  assert.equal(dischargeUpdates, 0, 'latched ticks skip discharges.update');
  assert.equal(presenter._presenterQuietEmpty, true);
  presenter.dispose();
  clearShieldContacts();
});

test('dirty-wake: quarks.spawn clears latch via _quietEmpty', () => {
  clearShieldContacts();
  const state = quietState();
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true);

  let boltBegins = 0;
  const origBegin = presenter.bolts.beginFrame.bind(presenter.bolts);
  presenter.bolts.beginFrame = (...args) => {
    boltBegins += 1;
    return origBegin(...args);
  };

  presenter.quarks.spawnMuzzle(0, 0.3, 0, 1, 0, 0, 0, false);
  assert.equal(presenter.quarks._quietEmpty, false);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(boltBegins >= 1, 'quarks spawn wakes composite');
  // Drain particles across a few frames then re-latch. Advance simTime so
  // quarks.update receives a non-zero particleDt and ages the burst out.
  for (let i = 0; i < 120; i++) {
    state.simTime += 1 / 60;
    presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  }
  assert.equal(presenter.quarks._quietEmpty, true);
  assert.equal(presenter._presenterQuietEmpty, true, 're-latches after quarks drain');
  boltBegins = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(boltBegins, 0, 'stays latched after re-arm');
  presenter.dispose();
  clearShieldContacts();
});

test('dirty-wake: addShieldContact wakes composite', () => {
  clearShieldContacts();
  const state = quietState();
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true);

  let disc = 0;
  const orig = presenter.discharges.update.bind(presenter.discharges);
  presenter.discharges.update = (...args) => {
    disc += 1;
    return orig(...args);
  };

  addShieldContact(1, 1, 0, 0, 1);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(disc >= 1, 'shield contact wakes');
  assert.equal(presenter._presenterQuietEmpty, false);

  // Age out contacts.
  for (let i = 0; i < 40; i++) presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true, 're-latches after shield drain');
  presenter.dispose();
  clearShieldContacts();
});

test('dirty-wake: fields.active push wakes (well path)', () => {
  clearShieldContacts();
  const active = [];
  const state = quietState({ fields: { active } });
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true);

  let wellUpdates = 0;
  const field = presenter.wellDistortion;
  const orig = field.update.bind(field);
  field.update = (...args) => {
    wellUpdates += 1;
    return orig(...args);
  };

  active.push({
    id: 'w1',
    kind: FIELD_KINDS.WELL,
    center: { x: 10, z: -4 },
    distortionRadius: 190,
    distortionStrength: 240,
  });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(wellUpdates >= 1, 'well push wakes composite + well sync');
  assert.equal(field.live, 1);
  assert.equal(presenter._presenterQuietEmpty, false);

  active.length = 0;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(field.live, 0);
  assert.equal(presenter._presenterQuietEmpty, true);
  presenter.dispose();
  clearShieldContacts();
});

test('dirty-wake: entityIndexVersion / projectiles lane wakes', () => {
  clearShieldContacts();
  const projectiles = [];
  const state = quietState({
    entityIndex: {
      ready: true,
      version: 3,
      projectiles,
      __spacefaceEntityIndexV1: true,
    },
  });
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true);

  let begins = 0;
  const orig = presenter.bolts.beginFrame.bind(presenter.bolts);
  presenter.bolts.beginFrame = (...args) => {
    begins += 1;
    return orig(...args);
  };

  state.entityIndex.version = 4;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(begins >= 1, 'index version bump wakes');
  // Empty projectiles → re-latch.
  assert.equal(presenter._presenterQuietEmpty, true);

  begins = 0;
  projectiles.push({
    id: 99, type: 'projectile', alive: true,
    pos: { x: 1, z: 2 }, prevPos: { x: 0, z: 0 },
    vel: { x: 10, z: 0 }, data: { weaponId: 'pulse-cannon' },
  });
  state.entityIndex.version = 5;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.ok(begins >= 1, 'projectile push wakes');
  assert.equal(presenter._presenterQuietEmpty, false);

  projectiles.length = 0;
  state.entityIndex.version = 6;
  // Ribbon linger keeps live>0 for a few frames after release; drain then re-latch.
  for (let i = 0; i < 30; i++) presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter.ribbons.live, 0, 'ribbon linger drained');
  assert.equal(presenter._presenterQuietEmpty, true);
  presenter.dispose();
  clearShieldContacts();
});

test('dispose clears composite latch', () => {
  clearShieldContacts();
  const state = quietState();
  const presenter = makePresenter(state);
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter._presenterQuietEmpty, true);
  presenter.dispose();
  assert.equal(presenter._presenterQuietEmpty, false);
  clearShieldContacts();
});
