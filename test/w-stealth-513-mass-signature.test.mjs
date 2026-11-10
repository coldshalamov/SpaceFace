// build_map §34 row 513 — mass-signature stealth (08 §5).
// Done when: sensors read mass and heat inside drawn sweep rings; large bodies cast mass
// shadows; Hush Head, decoy pods and cold coasting hide mass; Lantern cysts and Furnace
// maws use the same heat model; the Weighing (E-04) is playable three ways.
import assert from 'node:assert/strict';
import test from 'node:test';

import { massSignature } from '../src/systems/massSignature.js';
import {
  SWEEP_SCANNER_PROFILES, signatureOf, signatureRead, castsMassShadow,
  pointInMassShadow, weighingRead, weighingVerdict, sweepRingFor,
  SIGNATURE_DETECT_MIN,
} from '../src/data/massSignature.js';

function makeBus() {
  const events = [];
  return { events, emit(name, payload) { events.push({ name, payload }); } };
}

function makeState() {
  return { entities: new Map(), simTime: 0, tick: 0 };
}

function spawn(state, spec) {
  const e = {
    id: spec.id || `e${state.entities.size + 1}`,
    alive: true,
    pos: { x: spec.x || 0, z: spec.z || 0 },
    vel: { x: 0, z: 0 },
    mass: spec.mass || 0,
    radius: spec.radius || 4,
    type: spec.type || 'ship',
    data: spec.data || {},
    ...spec.extra,
  };
  state.entities.set(e.id, e);
  return e;
}

function makeHarness() {
  const state = makeState();
  const bus = makeBus();
  const helpers = {};
  const sys = { ...massSignature };
  sys.init({ state, bus, helpers });
  return { state, bus, sys, tick(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) { state.simTime += dt; state.tick += 1; sys.update(dt, state); } } };
}

test('sensors read mass and heat inside a drawn sweep ring — ring drawn, reading resolved', () => {
  const { state, bus, sys, tick } = makeHarness();
  const barge = spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, radius: 40, data: { massScanner: 'scale_barge' } });
  const mule = spawn(state, { id: 'mule', x: 300, z: 0, mass: 55, vel: undefined, extra: {} });
  state.entities.get('mule').vel = { x: 0, z: 0 }; // idle hull, drive warm

  tick(1 / 60, 1);
  assert.ok(barge.data.sweepRing, 'the scanner draws its sweep ring');
  assert.equal(barge.data.sweepRing.radius, SWEEP_SCANNER_PROFILES.scale_barge.ringRadius);
  assert.ok(Number.isFinite(barge.data.sweepRing.edgeAngle), 'the ring has a moving edge');

  // Resolve needs the edge's dwell (1.5 s for a scale barge).
  const ring = SWEEP_SCANNER_PROFILES.scale_barge;
  tick(1 / 60, Math.ceil(ring.dwellS * 60) + 2);
  const scan = state.massSignature.scans[barge.id];
  const read = scan.reads.mule;
  assert.equal(read.detected, true, 'the hull inside the ring is read');
  assert.equal(read.resolved, true, 'the read resolves after the dwell');
  assert.ok(read.massT >= 55, 'the scale reads the mule’s tonnage');
  assert.ok(read.heat > 0.3, 'a warm drive reads heat');
  assert.equal(state.entities.get('mule').data.massSignature.resolvedBy, 'barge');
  assert.ok(bus.events.some((e) => e.name === 'sensors:signatureResolved' && e.payload.targetId === 'mule'));
  void sys;
});

test('a hull outside the ring is never read', () => {
  const { state } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawn(state, { id: 'far', x: 5000, z: 0, mass: 55 });
  const sys = { ...massSignature };
  sys.init({ state, bus: makeBus(), helpers: {} });
  sys.update(1 / 60, state);
  const scan = state.massSignature.scans.barge;
  assert.equal(scan.reads.far.detected, false);
  assert.equal(scan.reads.far.reason, 'out_of_ring');
});

test('large bodies cast mass shadows — a pod behind the big rock is not read', () => {
  const { state, bus } = makeHarness();
  const barge = spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  const rock = spawn(state, { id: 'bigrock', x: 200, z: 0, mass: 5000, radius: 60, type: 'asteroid' });
  const pod = spawn(state, { id: 'crate', x: 320, z: 0, mass: 40, type: 'pickup', data: { massT: 40 } });
  const sys = { ...massSignature };
  sys.init({ state, bus, helpers: {} });
  sys.update(1 / 60, state);
  const scan = state.massSignature.scans.barge;
  assert.equal(scan.reads.crate.detected, false);
  assert.equal(scan.reads.crate.reason, 'mass_shadow');
  assert.equal(scan.reads.crate.occludedBy, 'bigrock');
  assert.equal(castsMassShadow(rock), true, 'the big rock is the shadow caster');
  assert.equal(pointInMassShadow(barge.pos, rock, pod.pos), true);
});

test('cold coasting hides a small hull; the same hull thrusting resolves', () => {
  const { state, bus } = makeHarness();
  spawn(state, { id: 'relay', x: 0, z: 0, mass: 800, data: { massScanner: 'scale_barge' } });
  const ghost = spawn(state, { id: 'ghost', x: 200, z: 0, mass: 18, data: { coldCoast: true } });
  const sys = { ...massSignature };
  sys.init({ state, bus, helpers: {} });
  const ring = SWEEP_SCANNER_PROFILES.scale_barge;
  for (let i = 0; i < Math.ceil(ring.dwellS * 60) + 4; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  let scan = state.massSignature.scans.relay;
  assert.equal(scan.reads.ghost.detected, false, 'a cold-coasting fighter is rock clutter');
  assert.equal(scan.reads.ghost.reason, 'below_threshold');
  assert.ok(signatureOf(ghost).strength < SIGNATURE_DETECT_MIN);

  // Drive lit: the same hull crosses the threshold the moment it burns.
  ghost.data.coldCoast = false;
  ghost.vel = { x: 30, z: 0 };
  for (let i = 0; i < Math.ceil(ring.dwellS * 60) + 4; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  scan = state.massSignature.scans.relay;
  assert.equal(scan.reads.ghost.resolved, true, 'thrust betrays the coast');
  assert.ok(bus.events.some((e) => e.name === 'sensors:signatureResolved' && e.payload.targetId === 'ghost'));
});

test('Hush-held cargo contributes zero mass; a decoy pod reports its spoofed mass', () => {
  const { state } = makeHarness();
  spawn(state, { id: 'barge', x: 0, z: 0, mass: 900, data: { massScanner: 'scale_barge' } });
  spawn(state, { id: 'quiet_pod', x: 200, z: 40, mass: 40, type: 'pickup', data: { signatureHidden: true } });
  spawn(state, { id: 'decoy', x: 200, z: -40, mass: 12, type: 'pickup', data: { decoySpoofMassT: 220 } });
  const sys = { ...massSignature };
  sys.init({ state, bus: makeBus(), helpers: {} });
  const ring = SWEEP_SCANNER_PROFILES.scale_barge;
  for (let i = 0; i < Math.ceil(ring.dwellS * 60) + 4; i++) { state.simTime += 1 / 60; sys.update(1 / 60, state); }
  const scan = state.massSignature.scans.barge;
  // The Hush pod's signature is mass 0 + idle heat — under the resolved threshold.
  assert.equal(signatureOf(state.entities.get('quiet_pod')).massT, 0);
  assert.notEqual(scan.reads.quiet_pod.reason, 'resolved');
  // The decoy reads as a 220 t signature — the sensor names it, and names it wrong.
  assert.equal(scan.reads.decoy.resolved, true);
  assert.equal(scan.reads.decoy.massT, 220);
  assert.equal(scan.reads.decoy.spoofed, true);
});

test('Lantern cysts hunt the same heat model — a cold coast drops their lock to the next hot hull', () => {
  const { state, bus } = makeHarness();
  const cyst = spawn(state, { id: 'cyst', x: 0, z: 0, mass: 5, data: { heatSeeker: true } });
  const hot = spawn(state, { id: 'hot_hull', x: 300, z: 0, mass: 55 });
  hot.vel = { x: 40, z: 0 }; // thrusting hard — hot
  spawn(state, { id: 'cold_hull', x: 200, z: 50, mass: 20, data: { coldCoast: true } });
  const sys = { ...massSignature };
  sys.init({ state, bus, helpers: {} });
  sys.update(1 / 60, state);
  assert.equal(cyst.data.ai.heatTargetId, 'hot_hull', 'the cyst drifts toward the hot hull');
  assert.equal(state.massSignature.heatLocks.cyst, 'hot_hull');

  hot.vel = { x: 0, z: 0 };
  hot.data.coldCoast = true; // the hot hull cuts its drive
  sys.update(1 / 60, state);
  assert.equal(cyst.data.ai.heatTargetId, null, 'coasting cold makes the cyst lose the hull');
  assert.ok(bus.events.some((e) => e.name === 'sensors:heatLock'));
  assert.ok(bus.events.some((e) => e.name === 'sensors:heatLost'));
});

test('the Weighing is playable three ways — shadow hide, decoy hand-off, or pay', () => {
  // Way 1 — the crate sits in open ring: the scale names the over-mass.
  const barge = { id: 'barge', pos: { x: 0, z: 0 } };
  const hull = { id: 'hull', pos: { x: 200, z: 0 }, mass: 55, data: {} };
  const manifestT = 55;
  const profile = SWEEP_SCANNER_PROFILES.scale_barge;
  const openCrate = { id: 'crate_open', pos: { x: 240, z: 10 }, mass: 40, data: {} };
  let read = weighingRead(profile, barge.pos, hull, [openCrate], []);
  assert.equal(read.cargoMassT, 40);
  assert.equal(weighingVerdict(read.readMassT, manifestT).outcome, 'over_mass');

  // Way 2 — the same crate parked in the big rock's mass shadow reads clean.
  const bigRock = { id: 'rock', pos: { x: 220, z: 0 }, mass: 4000, radius: 60 };
  const shadowCrate = { id: 'crate_shadow', pos: { x: 280, z: 0 }, mass: 40, data: {} };
  read = weighingRead(profile, barge.pos, hull, [shadowCrate], [bigRock]);
  assert.equal(read.cargoMassT, 0, 'the shadow takes the crate off the scale');
  assert.equal(read.hidden[0].reason, 'mass_shadow');
  assert.equal(weighingVerdict(read.readMassT, manifestT).outcome, 'clean');

  // Way 3 — the crate handed to a decoy pod (or a Hush hold) reads clean.
  const decoy = { id: 'decoy', pos: { x: 240, z: 10 }, mass: 12, data: { decoySpoofMassT: 40 } };
  read = weighingRead(profile, barge.pos, hull, [decoy], []);
  assert.equal(read.cargoMassT, 0, 'the decoy owns the signature, not the hull');
  assert.equal(read.decoys[0].id, 'decoy');
  assert.equal(weighingVerdict(read.readMassT, manifestT).outcome, 'clean');

  // The fine path is the encounter's (row 515): an over-mass read is what the fine prices.
});

test('sweep ring edge moves deterministically with sim time', () => {
  const scanner = { pos: { x: 10, z: 10 } };
  const p = SWEEP_SCANNER_PROFILES.customs_weir;
  const a = sweepRingFor(scanner, p, 0);
  const b = sweepRingFor(scanner, p, p.edgePeriodS / 4);
  const c = sweepRingFor(scanner, p, p.edgePeriodS);
  assert.equal(Math.abs(b.edgeAngle - a.edgeAngle), Math.PI / 2, 'a quarter period is a quarter turn');
  assert.equal(c.edgeAngle, 0, 'the edge wraps each period');
});
