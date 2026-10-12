// SFQ-M M09 The salvage dispute: a Pitborn claim on a rich wreck, a tender that witnesses, and a
// survivor pod with failing air on the far side of the field. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { mining } from '../src/systems/mining.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';

const SEED = 4242;
const SECTOR = 'sector_io_reach';
const ANCHOR = Object.freeze({ x: 3000, z: -2500 });
const SHAPE = 'salvage_dispute';

function makeHarness(seed = SEED) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x + 150, z: ANCHOR.z + 250 }, vel: { x: 0, z: 0 },
    hull: 400, hullMax: 400, radius: 6, mass: 35,
  });
  state.playerId = player.id;
  const events = [];
  bus.on('encounter:resolved', (p) => events.push({ name: 'resolved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'grant', payload: p }));
  bus.on('faction:repDelta', (p) => events.push({ name: 'rep', payload: p }));
  bus.on('encounter:voice', (p) => events.push({ name: 'voice', payload: p }));
  return { sim, state, bus, player, events };
}

function fire(h) {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'test_m09', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'derelict_field', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const mOf = (live) => live.data.dispute;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => [e.payload.factionId, e.payload.delta]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function towPodTo(h, live, target) {
  const pod = ent(h, mOf(live).podId);
  pod.pos.x = target.x + 100; pod.pos.z = target.z;
  h.sim.runTicks(2);
}

test('salvage_dispute is a registered derelict-field claim minor off the Helios corridor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual(
    { tier: enc.tier, zones: [...enc.zoneTypes], script: enc.script, situation: enc.shape.situation },
    { tier: 'minor', zones: ['derelict_field'], script: 'selfRegistered', situation: 'claim' });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire stakes a real claim: wreck stamped to the tender, pod and tender on opposite sides', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  const wreck = ent(h, m.wreckId);
  const pod = ent(h, m.podId);
  const tender = ent(h, m.tenderId);
  assert.equal(wreck.data.salvorClaimedBy, m.claimId);
  assert.equal(tender.data.salvorClaimId, m.claimId, 'the claim resolves to a live witness hull');
  assert.equal(tender.data.ai.passive, true);
  assert.ok(Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0) === 13);
  assert.equal(isAttachable(pod, h.state.playerId, h.state), true);
  assert.equal(ensurePhysicsBodySpec(pod).dynamic, true);
  assert.ok(dist(pod.pos, tender.pos) > 1100, 'the rescue is a real tow across the field');
  assert.ok(dist(pod.pos, wreck.pos) > 500 && dist(tender.pos, wreck.pos) > 500);
  assert.match(h.events.find((e) => e.name === 'voice').payload.text, /Bring the pod to us and the wreck is yours/);
});

test('lawful: towing the pod to the tender pays, earns standing and releases the claim for honest salvage', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  towPodTo(h, live, ent(h, m.tenderId).pos);
  assert.deepEqual(resolved(h), ['rescued']);
  assert.deepEqual(grants(h), [260]);
  assert.deepEqual(reps(h), [['faction_pitborn', 4]]);
  const wreck = ent(h, m.wreckId);
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'the claim is released');
  assert.equal(wreck.data.scanLabel, 'RELEASED WRECK — PITBORN SIGNED IT OVER');
  assert.equal(Object.values(wreck.data.salvagePool).reduce((a, b) => a + b, 0), 13, 'the salvage is left for you');
});

test('extraction: working the claimed wreck past half settles stripped and costs Pitborn standing, no pay', () => {
  const h = makeHarness();
  const live = fire(h);
  const wreck = ent(h, mOf(live).wreckId);
  wreck.data.salvagePool = { cmdty_electronics: 0, cmdty_alloys: 1, cmdty_scrap_metal: 5 };
  h.sim.runTicks(2);
  assert.deepEqual(resolved(h), ['stripped']);
  assert.deepEqual(reps(h), [['faction_pitborn', -5]]);
  assert.deepEqual(grants(h), []);
  assert.equal(wreck.data.salvorClaimedBy, mOf(live).claimId, 'the claim still stands for the law');
});

test('the claim stamp drives the existing mining protest: the tender is named as the witnessed victim', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  const reports = [];
  const mine = Object.create(mining);
  mine.init({
    state: h.state, bus: h.bus, helpers: { spawnEntity: () => null },
    registry: { get: (id) => (id === 'lawSecurity' ? { reportIncident(r) { reports.push(r); return { accepted: true, incidentReceiptId: 'law:test:1' }; } } : null) },
  });
  mine._protestClaimJump(ent(h, h.state.playerId), ent(h, m.wreckId), { cmdty_electronics: 2 });
  assert.equal(reports.length, 1, 'the law owner receives the claim-jump report');
  assert.equal(reports[0].victimEntityId, m.tenderId);
});

test('late: when the air runs out the tender takes the pod and the wreck in the open; the pod is not deleted', () => {
  const h = makeHarness();
  const live = fire(h);
  const m = mOf(live);
  h.state.simTime = m.airEndsAt + 1;
  h.sim.runTicks(2);
  assert.deepEqual(resolved(h), ['claimed']);
  assert.deepEqual(grants(h), []);
  const pod = ent(h, m.podId);
  assert.ok(pod && pod.alive !== false);
  assert.equal(pod.data.scanLabel, 'ESCAPE POD — PITBORN TENDER RECOVERING');
  assert.equal(ent(h, m.wreckId).data.salvorClaimedBy, m.claimId);
});

test('destroying the pod is the worst outcome and costs the most standing', () => {
  const h = makeHarness();
  const live = fire(h);
  ent(h, mOf(live).podId).alive = false;
  h.sim.runTicks(2);
  assert.deepEqual(resolved(h), ['pod_lost']);
  assert.deepEqual(reps(h), [['faction_pitborn', -6]]);
});

test('same seed, same field', () => {
  const a = makeHarness(); const la = fire(a);
  const b = makeHarness(); const lb = fire(b);
  assert.deepEqual(ent(a, mOf(la).podId).pos, ent(b, mOf(lb).podId).pos);
  assert.deepEqual(ent(a, mOf(la).tenderId).pos, ent(b, mOf(lb).tenderId).pos);
});
