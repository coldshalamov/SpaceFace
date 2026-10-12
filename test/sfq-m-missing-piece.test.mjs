// SFQ-M M28 A place for the missing piece: a Custodian stalled on an empty socket, a true insert
// far out, a cracked one close, an alignment field woken by a scan. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 4242;
const SECTOR = 'sector_ashfall_reach';
const ANCHOR = Object.freeze({ x: 2000, z: 2000 });
const SHAPE = 'missing_piece';

function makeHarness(extra = {}) {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector], ...extra });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 400, z: ANCHOR.z - 400 }, vel: { x: 0, z: 0 },
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
    shapeId: SHAPE, encounterId: 'test_m28', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'anomaly_deep', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const pOf = (live) => live.data.piece;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
let seq = 0;
const scanAt = (h, pos) => h.bus.emit('scan:pulse', { pos: { ...pos }, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: ++seq });

function seat(h, live, id, speed = 0) {
  const p = pOf(live);
  const piece = ent(h, id);
  piece.pos.x = p.socketPos.x + 10; piece.pos.z = p.socketPos.z;
  piece.vel = { x: -speed, z: 0 };
  h.sim.runTicks(1);
}

test('missing_piece is a registered deep-anomaly machine minor gated off the Helios corridor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual({ zones: [...enc.zoneTypes], script: enc.script, verbs: [...enc.verbs] },
    { zones: ['anomaly_deep'], script: 'selfRegistered', verbs: ['scan', 'latch', 'tow', 'align'] });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire lays out the Custodian, its socket, a far true insert and a near cracked one, both latchable', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  const g = ent(h, p.genuineId), s = ent(h, p.substituteId);
  assert.equal(isAttachable(g, h.state.playerId, h.state), true);
  assert.equal(isAttachable(s, h.state.playerId, h.state), true);
  assert.equal(isAttachable(ent(h, p.custodianId), h.state.playerId, h.state), false);
  assert.ok(dist(g.pos, p.socketPos) > 600, 'the true part is a real tow away');
  assert.ok(dist(s.pos, p.socketPos) < dist(g.pos, p.socketPos), 'the shortcut is closer');
});

test('a fast arrival is refused and kicked back out; nothing is welded', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  seat(h, live, p.genuineId, 40);
  assert.equal(p.refusals, 1);
  assert.equal(p.seatedId, null);
  assert.ok(said(h).includes('CUSTODIAN: MISALIGNED. REFUSED.'));
});

test('the true insert seated slowly welds only while the pilot holds clear, then restores the machine', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  h.player.pos.x = p.socketPos.x + 40; h.player.pos.z = p.socketPos.z;
  seat(h, live, p.genuineId, 4);
  assert.equal(p.seatedId, p.genuineId);
  h.sim.runTicks(600);
  assert.deepEqual(resolved(h), [], 'no weld with the pilot in the work reach');
  assert.ok(said(h).includes('CUSTODIAN: WORK REACH OCCUPIED. WELD HELD.'));
  h.player.pos.x = p.socketPos.x + 400;
  const piece = ent(h, p.genuineId);
  for (let i = 0; i < 600 && !p.settled; i++) { piece.pos.x = p.socketPos.x + 5; piece.pos.z = p.socketPos.z; piece.vel = { x: 0, z: 0 }; h.sim.runTicks(1); }
  assert.deepEqual(resolved(h), ['restored']);
  assert.deepEqual(grants(h), [420]);
  assert.equal(ent(h, p.custodianId).data.scanLabel, 'CUSTODIAN — REPAIR COMPLETE, SERVICE RESTORED');
});

test('the cracked insert works at reduced output and the Custodian keeps saying so', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  seat(h, live, p.substituteId, 2);
  const piece = ent(h, p.substituteId);
  for (let i = 0; i < 600 && !p.settled; i++) { piece.pos.x = p.socketPos.x + 5; piece.pos.z = p.socketPos.z; piece.vel = { x: 0, z: 0 }; h.sim.runTicks(1); }
  assert.deepEqual(resolved(h), ['patched']);
  assert.deepEqual(grants(h), [220]);
  assert.match(ent(h, p.custodianId).data.scanLabel, /REDUCED OUTPUT/);
});

test('on the real Rapier path a scan wakes the field and it draws a resting insert into the socket without a teleport', async () => {
  const h = makeHarness({
    systems: [spawnBudget, encounterDirector, physics], updateOrder: [spawnBudget, encounterDirector, physics],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    const live = fire(h);
    const p = pOf(live);
    const g = ent(h, p.genuineId);
    for (let i = 0; i < 4; i++) h.sim.step(SIM_DT);
    // Without the field a resting insert in field reach stays put.
    g.pos.x = p.socketPos.x + 180; g.pos.z = p.socketPos.z;
    for (let i = 0; i < 120; i++) h.sim.step(SIM_DT);
    const restX = g.pos.x;
    assert.ok(Math.abs(restX - (p.socketPos.x + 180)) < 2, 'nothing moves it before the field is woken');
    const custodian = ent(h, p.custodianId);
    scanAt(h, custodian.pos);
    assert.ok(said(h).includes('CUSTODIAN: ALIGNMENT FIELD — ACTIVE. PRESENT THE PART.'));
    let maxStep = 0;
    let prev = { ...g.pos };
    for (let i = 0; i < 60 * 40 && !p.settled; i++) {
      h.sim.step(SIM_DT);
      maxStep = Math.max(maxStep, dist(prev, g.pos)); prev = { ...g.pos };
    }
    assert.ok(maxStep < 1, `field motion is continuous (max step ${maxStep.toFixed(2)} WU)`);
    assert.deepEqual(resolved(h), ['restored']);
    assert.equal(p.refusals, 0, 'the field delivers it slow enough to seat');
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('the deadline leaves the machine stalled and the parts where they are', () => {
  const h = makeHarness();
  const live = fire(h);
  h.state.simTime = live.deadlineAt + 1;
  h.sim.runTicks(1);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.ok(ent(h, pOf(live).genuineId).alive !== false);
});
