#!/usr/bin/env node
// BP-07.1 MASS-PERSONALITY backend proof.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import {
  HANDLING_PROFILE_AXES,
  handlingProfileDomain,
  handlingProfileForShip,
  handlingProfilesForShips,
} from '../src/ui/panels/handlingProfile.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/ui/panels/handlingProfile.js', import.meta.url)),
  'src/ui/panels/handlingProfile.js exists');

let sections = 0;

function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in handling-profile path'); };
  Date.now = () => { throw new Error('Date.now in handling-profile path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testAxisSources);
guarded(testDistinctHullFingerprints);
guarded(testDriveMetadata);
testPackageAndNoTouchGuards();

console.log(`[check-handling-profile] PASS - ${sections} sections green`);

function axis(profile, id) {
  const found = profile && profile.axes.find((entry) => entry.id === id);
  assert.ok(found, `${profile && profile.shipId} has ${id} axis`);
  return found;
}

function liveModel(shipId) {
  const model = getDerivedStats(shipId, [], null).flightModel;
  assert.ok(model, `${shipId} exposes a live flightModel`);
  return model;
}

function testAxisSources() {
  assert.deepEqual(HANDLING_PROFILE_AXES.map((entry) => entry.id), [
    'agility',
    'inertia',
    'topSpeed',
    'brake',
  ], 'axis roster/order stays stable');
  assert.deepEqual(HANDLING_PROFILE_AXES.map((entry) => entry.field), [
    'angularAccel',
    'inertia',
    'maxSpeed',
    'angularBrake',
  ], 'axes stay tied to the shipped flightModel fields');

  for (const shipId of ['ship_kestrel', 'ship_ironback', 'ship_hornet']) {
    const profile = handlingProfileForShip(shipId);
    const model = liveModel(shipId);
    assert.equal(axis(profile, 'agility').raw, model.angularAccel, `${shipId} agility reads angularAccel`);
    assert.equal(axis(profile, 'inertia').raw, model.inertia, `${shipId} inertia reads inertia`);
    assert.equal(axis(profile, 'topSpeed').raw, model.maxSpeed, `${shipId} topSpeed reads maxSpeed`);
    assert.equal(axis(profile, 'brake').raw, model.angularBrake, `${shipId} brake reads angularBrake`);
    assert.ok(profile.axes.every((entry) => Number.isInteger(entry.bar) && entry.bar >= 0 && entry.bar <= 100),
      `${shipId} bars normalize into a stable 0-100 range`);
  }
  ok('profile axes are direct reads from getDerivedStats(...).flightModel');
}

function testDistinctHullFingerprints() {
  const profiles = handlingProfilesForShips();
  assert.equal(profiles.length, 13, 'all 13 shipped hulls have a profile');
  const fingerprints = new Set(profiles.map((profile) => profile.fingerprint));
  assert.equal(fingerprints.size, profiles.length, 'all shipped hulls have distinct 4-axis fingerprints');

  const kestrel = handlingProfileForShip('ship_kestrel');
  const ironback = handlingProfileForShip('ship_ironback');
  const hornet = handlingProfileForShip('ship_hornet');
  assert.ok(axis(hornet, 'agility').raw > axis(kestrel, 'agility').raw,
    'Hornet is snappier than Kestrel by live angularAccel');
  assert.ok(axis(kestrel, 'agility').raw > axis(ironback, 'agility').raw,
    'Kestrel is snappier than Ironback by live angularAccel');
  assert.ok(axis(ironback, 'inertia').raw > axis(kestrel, 'inertia').raw,
    'Ironback carries more inertia than Kestrel');
  assert.ok(axis(hornet, 'topSpeed').raw > axis(ironback, 'topSpeed').raw,
    'Hornet is faster than Ironback by live maxSpeed');
  assert.equal(handlingProfileForShip('ship_missing'), null, 'unknown hulls do not invent fallback profiles');

  const domain = handlingProfileDomain();
  for (const row of HANDLING_PROFILE_AXES) {
    assert.ok(domain[row.id].max > domain[row.id].min, `${row.id} domain spans the shipped hull roster`);
  }
  ok('per-hull fingerprints distinguish the shipped roster');
}

function testDriveMetadata() {
  for (const ship of SHIPS) {
    const profile = handlingProfileForShip(ship.id);
    const drive = getPropulsionProfile(ship.driveId);
    assert.ok(drive, `${ship.id} driveId ${ship.driveId} resolves in propulsionCatalog`);
    assert.equal(profile.driveId, ship.driveId, `${ship.id} profile keeps authored driveId`);
    assert.equal(profile.driveFamily, drive.family, `${ship.id} profile keeps propulsion family`);
  }
  assert.equal(handlingProfileForShip('ship_hornet').driveFamily, 'gravimetric',
    'Hornet profile exposes the authored gravimetric family');
  assert.equal(handlingProfileForShip('ship_ironback').driveFamily, 'pulse_plate',
    'Ironback profile exposes the authored pulse-plate family');
  ok('profiles preserve shipped drive metadata without changing propulsion');
}

function testPackageAndNoTouchGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:handling-profile'], 'node scripts/check-handling-profile.mjs',
    'package exposes check:handling-profile');

  const source = readFileSync(new URL('../src/ui/panels/handlingProfile.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'handling profile path does not use RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /document\.|window\.|innerHTML|addEventListener/,
    'handling profile helper is pure data, not DOM/render wiring');
  assert.doesNotMatch(source, /flightV3|input\.js|hud\.js|src\/render/,
    'handling profile helper does not reach into flight, input, HUD, or render lanes');
  ok('package and no-touch guards are present');
}
