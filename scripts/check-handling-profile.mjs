#!/usr/bin/env node
// BP-07.1 MASS-PERSONALITY backend proof.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { SHIPS } from '../src/data/ships.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import {
  HANDLING_PROFILE_AXES,
  handlingAxisValue,
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

function liveProfile(shipId) {
  const derived = getDerivedStats(shipId, [], null);
  assert.ok(derived && derived.propulsion, `${shipId} exposes a live propulsion profile`);
  return derived;
}

// PQ-176.03 (2026-09-12): the axes moved from the compatibility flight model to the live
// propulsion profile flightV3 flies (AGENTS.md §5). The old contract ("axes stay tied to the
// shipped flightModel fields") is retired on purpose: since PQ-176.00 / PQ-176.01 the drive, the
// thruster bay and the mass law move `derived.propulsion`, and a bar that read `flightModel` said
// "top speed 145" for a hull that fights at 84 and travels at 470 and never moved with the fit.
function testAxisSources() {
  assert.deepEqual(HANDLING_PROFILE_AXES.map((entry) => entry.id), [
    'agility',
    'inertia',
    'topSpeed',
    'brake',
  ], 'axis roster/order stays stable');
  assert.deepEqual(HANDLING_PROFILE_AXES.map((entry) => entry.field), [
    'yawAccel',
    'mass',
    'travelCeiling',
    'reverseAccel',
  ], 'axes read the live propulsion profile the kernel flies');

  for (const shipId of ['ship_kestrel', 'ship_ironback', 'ship_hornet']) {
    const profile = handlingProfileForShip(shipId);
    const derived = liveProfile(shipId);
    const p = derived.propulsion;
    assert.equal(axis(profile, 'agility').raw, p.yawAccel, `${shipId} agility reads propulsion.yawAccel`);
    assert.equal(axis(profile, 'inertia').raw, derived.operationalMass, `${shipId} inertia reads the operational mass`);
    assert.equal(axis(profile, 'topSpeed').raw, p.travelCeiling, `${shipId} topSpeed reads propulsion.travelCeiling`);
    // brake takes the family's own brake key (reverseAccel / maxBrakeAccel / rcsReverseAccel)
    const brakeAxis = HANDLING_PROFILE_AXES.find((entry) => entry.id === 'brake');
    assert.equal(axis(profile, 'brake').raw, handlingAxisValue(derived, brakeAxis), `${shipId} brake reads the profile's brake key`);
    assert.ok(profile.axes.every((entry) => /^(propulsion\.|derived\.operationalMass)/.test(entry.source)),
      `${shipId} every axis names its live source (${profile.axes.map((entry) => entry.source).join(', ')})`);
    assert.ok(profile.axes.every((entry) => Number.isInteger(entry.bar) && entry.bar >= 0 && entry.bar <= 100),
      `${shipId} bars normalize into a stable 0-100 range`);
    assert.ok(profile.predictions && profile.predictions.combatSpeed > 0 && profile.predictions.travelCeiling >= profile.predictions.combatSpeed,
      `${shipId} predicts a fight speed and a travel ceiling at or above it`);
    assert.ok(profile.predictions.reversalTimeS > 0, `${shipId} predicts a reversal time from its own reverse thrust`);
  }
  // The fit moves the bars: 200 t of cargo aboard the starter hull must show up in inertia and
  // cost agility, because the mass law divides the accelerations by the load.
  const empty = handlingProfileForShip('ship_kestrel', { fittings: [], player: null });
  const loaded = handlingProfileForShip('ship_kestrel', { fittings: [], player: { cargo: { usedMass: 200 } } });
  assert.ok(axis(loaded, 'inertia').raw > axis(empty, 'inertia').raw, 'cargo aboard raises the inertia bar');
  assert.ok(axis(loaded, 'agility').raw < axis(empty, 'agility').raw, 'cargo aboard lowers the agility bar');
  ok('profile axes are direct reads from getDerivedStats(...).propulsion and move with the fit');
}

function testDistinctHullFingerprints() {
  const profiles = handlingProfilesForShips();
  assert.equal(profiles.length, 14, 'all 14 shipped hulls have a profile');
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
  // Top speed is the drive's travel ceiling now, and the live catalog says something the old
  // compatibility model hid: the Hornet's gravimetric-S drive tops out at 252 while the Ironback's
  // pulse-plate-M runs to 715 (and fights at 130 to the Hornet's 84). The bar must say what the
  // ship does, so the check asserts the live order instead of the compatibility one — and prints
  // the roster's travel order so the interceptor-slower-than-a-barge question stays visible to the
  // hull/drive authoring owners (PQ-050, PQ-176.02) rather than being hidden by a screen.
  const travelOrder = profiles
    .map((profile) => [profile.shipId, axis(profile, 'topSpeed').raw])
    .sort((a, b) => b[1] - a[1]);
  const fastest = travelOrder[0];
  assert.equal(axis(handlingProfileForShip(fastest[0]), 'topSpeed').raw, fastest[1],
    'the top-speed bar is the live travel ceiling for whichever hull has the highest');
  assert.ok(axis(ironback, 'topSpeed').raw > axis(hornet, 'topSpeed').raw,
    'live travel order today: Ironback (pulse-plate M, 715) over Hornet (gravimetric S, 252); if the drive catalog changes this, update the message with the new numbers');
  console.log(`  travel order (live travelCeiling): ${travelOrder.map(([id, v]) => `${id.replace('ship_', '')} ${Math.round(v)}`).join(' > ')}`);
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
