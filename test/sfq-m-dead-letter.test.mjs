// SFQ-M M27 Dead-letter delivery: a Courier repeating a failed delivery, a bale in its lane, a
// recipient whose seal has lapsed and an archive Witness that keeps what reaches it. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector, planEncountersDay } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { physics } from '../src/core/physics.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 4242;
const SECTOR = 'sector_io_reach';
const ANCHOR = Object.freeze({ x: 2000, z: 2000 });
const SHAPE = 'dead_letter';

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
    shapeId: SHAPE, encounterId: 'test_m27', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'anomaly_deep', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const pOf = (live) => live.data.letter;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => e.payload.delta);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const letters = (h) => [...h.state.entities.values()]
  .filter((e) => e && e.alive !== false && e.data && e.data.storyPropKind === 'm27_dead_letter');
let seq = 0;
const scanAt = (h, pos) => h.bus.emit('scan:pulse', { pos: { ...pos }, radius: 1200, source: 'player-scanner', scannerId: h.player.id, seq: ++seq });
const latch = (h, id) => h.bus.emit('tether:attached', { targetId: id, ownerId: h.player.id, sourceId: h.player.id });
const seconds = (h, s) => h.sim.runTicks(Math.round(s / SIM_DT));

function placeAt(h, id, pos, speed = 0, p = null) {
  const e = ent(h, id);
  e.pos.x = pos.x; e.pos.z = pos.z;
  e.vel = p ? { x: -p.dir.x * speed, z: -p.dir.z * speed } : { x: 0, z: 0 };
  h.sim.runTicks(1);
}

test('dead_letter is a registered deep-anomaly machine minor on the Io Listening Field and Pallas, never Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual({ zones: [...enc.zoneTypes], script: enc.script, verbs: [...enc.verbs] },
    { zones: ['anomaly_deep'], script: 'selfRegistered', verbs: ['scan', 'latch', 'tow', 'deliver'] });
  assert.deepEqual([...enc.gates.sectorIds], ['sector_io_reach', 'sector_pallas_drift']);
});

test('fire lays out the Courier lane: letter at the dock, a latchable bale across the lane, recipient and Witness as machines', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  const token = ent(h, p.tokenId), bale = ent(h, p.baleId);
  assert.equal(token.type, 'payload');
  assert.equal(isAttachable(token, h.state.playerId, h.state), true);
  assert.equal(isAttachable(bale, h.state.playerId, h.state), true);
  for (const id of [p.courierId, p.recipientId, p.witnessId]) {
    const m = ent(h, id);
    assert.equal(m.type, 'machine');
    assert.equal(isAttachable(m, h.state.playerId, h.state), false);
    assert.equal(m.homeSectorId, undefined, 'encounter-owned machines stay out of the Verge machine layer');
  }
  assert.deepEqual([p.courierId, p.recipientId, p.witnessId].map((id) => ent(h, id).data.machine.kind),
    ['courier', 'conservator', 'witness']);
  assert.ok(dist(token.pos, p.dockPos) < 1);
  // The bale sits on the lane line between the Courier and the recipient's intake.
  const vx = bale.pos.x - p.courierPos.x, vz = bale.pos.z - p.courierPos.z;
  const along = vx * p.dir.x + vz * p.dir.z;
  assert.ok(along > 100 && along < dist(p.courierPos, p.intakePos) - 100);
  assert.ok(Math.abs(vx * -p.dir.z + vz * p.dir.x) < 1, 'dead on the lane');
  assert.ok(dist(p.witnessPos, p.intakePos) > 200, 'the wrong hand is a separate, readable place');
  assert.equal(live.phase, 'cycling');
  assert.ok(said(h)[0].startsWith('SCAN: A Courier keeps throwing one sealed letter'));
});

test('the Courier throws on its cycle until you latch the letter; custody suspends the cycle', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  seconds(h, 6);
  assert.equal(p.throws, 1, 'first throw a few seconds after fire');
  seconds(h, 21);
  assert.equal(p.throws, 2, 'a resting letter at the dock is thrown again each cycle');
  latch(h, p.tokenId);
  assert.equal(p.inCustody, true);
  assert.ok(said(h).includes('COURIER: CUSTODY TRANSFERRED. CYCLE SUSPENDED.'));
  seconds(h, 45);
  assert.equal(p.throws, 2, 'no throws while the pilot holds the letter');
});

test('the recipient refuses until the pilot understands the letter, then renews its seal on a close scan', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  const recipient = ent(h, p.recipientId);
  scanAt(h, recipient.pos);
  assert.equal(p.acknowledged, false, 'a blind scan names no delivery');
  assert.ok(said(h).includes('RECIPIENT: NO DELIVERY PENDING THAT YOU CAN NAME.'));
  // A slow arrival with the seal lapsed is refused back toward the sender.
  placeAt(h, p.tokenId, p.intakePos, 3, p);
  seconds(h, 1.2);
  assert.equal(p.refusals, 1);
  assert.ok(said(h).includes('RECIPIENT: SEAL LAPSED. RETURN TO SENDER.'));
  assert.deepEqual(resolved(h), []);
  // Having watched the refusal, the scan now renews the seal.
  scanAt(h, recipient.pos);
  assert.equal(p.acknowledged, true);
  assert.equal(recipient.data.scanLabel, 'RECIPIENT — SEAL RENEWED, AWAITING ONE TOKEN');
});

test('reading the address by scanning the letter is the other way to earn the seal renewal', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  scanAt(h, ent(h, p.tokenId).pos);
  assert.equal(p.addressRead, true);
  assert.ok(said(h).includes('LETTER: ADDRESSEE SEAL EXPIRED. A WITNESSED SCAN AT THE RECIPIENT RENEWS IT.'));
  scanAt(h, ent(h, p.recipientId).pos);
  assert.equal(p.acknowledged, true);
});

test('carried by hand: latch, renew the seal, ease it in — paid through the single writers, route still blocked', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  latch(h, p.tokenId);
  scanAt(h, ent(h, p.tokenId).pos);
  scanAt(h, ent(h, p.recipientId).pos);
  // Too fast is refused even with the seal renewed.
  placeAt(h, p.tokenId, p.intakePos, 20, p);
  seconds(h, 1.2);
  assert.ok(said(h).includes('RECIPIENT: ARRIVAL TOO FAST. REFUSED.'));
  assert.deepEqual(resolved(h), []);
  seconds(h, 3);
  placeAt(h, p.tokenId, p.intakePos, 5, p);
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['carried']);
  assert.deepEqual(grants(h), [300]);
  assert.deepEqual(reps(h), [2]);
  assert.equal(p.permission, 'recipient_intake');
  const token = ent(h, p.tokenId);
  assert.equal(token.alive, true, 'the delivered letter stays in the world');
  assert.equal(token.data.scanLabel, 'DEAD LETTER — DELIVERED, ACKNOWLEDGED');
  assert.equal(isAttachable(token, h.state.playerId, h.state), false);
  assert.equal(ent(h, p.courierId).data.scanLabel, 'COURIER FRAME — ROUTE STILL BLOCKED; YOU CARRIED ITS LETTER');
  assert.match(ent(h, p.recipientId).data.scanLabel, /WORK ORDER RESUMED/);
});

test('coming to rest in the archive Witness reach is the wrong hand: kept, unpaid, a small mark', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  latch(h, p.tokenId);
  placeAt(h, p.tokenId, p.witnessPos, 2, p);
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['misdelivered']);
  assert.deepEqual(grants(h), []);
  assert.deepEqual(reps(h), [-1]);
  const token = ent(h, p.tokenId);
  assert.equal(token.alive, true);
  assert.equal(token.data.scanLabel, 'DEAD LETTER — KEPT BY THE ARCHIVE WITNESS');
  assert.equal(ent(h, p.courierId).data.scanLabel, 'COURIER FRAME — CYCLE STALLED, LETTER HELD BY THE WRONG HAND');
});

test('a destroyed letter is reissued once after a delay, never duplicated; a second loss ends it', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  assert.equal(ent(h, p.tokenId).data.letterSerial, 1);
  ent(h, p.tokenId).alive = false;
  seconds(h, 1.2);
  assert.ok(said(h).includes('COURIER: TOKEN LOST. ONE COPY WILL BE REISSUED.'));
  seconds(h, 20);
  assert.equal(letters(h).length, 0, 'no instant remint');
  seconds(h, 12);
  assert.equal(letters(h).length, 1, 'exactly one reissued copy');
  assert.equal(p.tokenSerial, 2);
  assert.equal(ent(h, p.tokenId).data.letterSerial, 2, 'the reissue is copy 2, not the lost copy 1');
  assert.ok(dist(ent(h, p.tokenId).pos, p.dockPos) < 1, 'reissued at the Courier dock');
  seconds(h, 40);
  assert.equal(letters(h).length, 1, 'no further copies while one is alive');
  ent(h, p.tokenId).alive = false;
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['lost']);
  assert.deepEqual(grants(h), []);
  assert.equal(ent(h, p.courierId).data.scanLabel, 'COURIER FRAME — NO LETTER LEFT TO CARRY');
});

test('the deadline leaves the Courier cycling and the letter in the world', () => {
  const h = makeHarness();
  const live = fire(h);
  const p = pOf(live);
  h.state.simTime = live.deadlineAt + 1;
  h.sim.runTicks(60);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.equal(ent(h, p.tokenId).alive, true);
  assert.equal(isAttachable(ent(h, p.tokenId), h.state.playerId, h.state), true, 'the letter can still be picked up');
  assert.equal(ent(h, p.courierId).data.scanLabel, 'COURIER FRAME — STILL CYCLING A DEAD LETTER');
});

test('on the real Rapier path the bale bats the throw back; cleared lane plus renewed seal lets the Courier deliver', async () => {
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
    const token = ent(h, p.tokenId);
    const bale = ent(h, p.baleId);
    let maxStep = 0;
    let prev = { ...token.pos };
    let maxOut = 0;
    const stepTrack = (n) => {
      for (let i = 0; i < n && !p.settled; i++) {
        h.sim.step(SIM_DT);
        maxStep = Math.max(maxStep, dist(prev, token.pos)); prev = { ...token.pos };
        maxOut = Math.max(maxOut, dist(token.pos, p.dockPos));
      }
    };
    stepTrack(60 * 40);
    assert.ok(p.throws >= 1, 'the Courier threw');
    assert.ok(maxOut > 100, `the throw really flew (${maxOut.toFixed(0)} WU)`);
    assert.ok(maxOut < dist(p.dockPos, ent(h, p.baleId).pos) + 10, 'the bale stopped it short of the recipient');
    assert.deepEqual(resolved(h), [], 'a batted-back throw is not a delivery');
    // Stand-in for a tow: the bale is hauled well off the lane.
    bale.pos.x += -p.dir.z * 220; bale.pos.z += p.dir.x * 220;
    bale.vel = { x: 0, z: 0 };
    scanAt(h, token.pos);
    scanAt(h, ent(h, p.recipientId).pos);
    assert.equal(p.acknowledged, true);
    prev = { ...token.pos };
    stepTrack(60 * 150);
    assert.deepEqual(resolved(h), ['escorted']);
    assert.deepEqual(grants(h), [360]);
    assert.equal(ent(h, p.courierId).data.scanLabel, 'COURIER FRAME — ROUTE CLEAR, CYCLE RESTORED');
    assert.ok(maxStep < 12 * SIM_DT * 3, `no teleport: largest per-step move ${maxStep.toFixed(3)} WU`);
    assert.ok(dist(token.pos, p.intakePos) < 40, 'the letter is physically at the intake');
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('same seed, same lane', () => {
  const a = pOf(fire(makeHarness()));
  const b = pOf(fire(makeHarness()));
  assert.deepEqual([a.courierPos, a.intakePos, a.witnessPos, a.dir], [b.courierPos, b.intakePos, b.witnessPos, b.dir]);
});

test('the ordinary sector-day roll (seed 4242) draws it off the starter corridor and it fires there without force', () => {
  const zones = zonesForSector(SECTOR);
  let planned = null;
  for (let day = 0; day < 365 && !planned; day++) {
    planned = planEncountersDay(SEED, SECTOR, day, zones).find((item) => item.shapeId === SHAPE) || null;
  }
  assert.ok(planned, `${SHAPE} is drawn by the ordinary roll in ${SECTOR}`);
  assert.ok(ENCOUNTERS[SHAPE].zoneTypes.includes(planned.zoneType), 'it lands on one of its authored zone types');
  const helios = zonesForSector('sector_helios_prime');
  for (let day = 0; day < 60; day++) {
    assert.equal(planEncountersDay(SEED, 'sector_helios_prime', day, helios).some((item) => item.shapeId === SHAPE), false,
      'the starter corridor never draws it');
  }
  const h = makeHarness();
  const director = h.sim.registry.get('encounterDirector');
  const request = () => director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: planned.encounterId, sectorId: SECTOR, anchor: { ...planned.zoneCenter },
    zoneType: planned.zoneType, zoneRadius: planned.zoneRadius, respectPacing: true,
  });
  let res = request();
  for (let s = 0; s < 900 && !res.ok; s++) {
    assert.equal(res.reason, 'pressure', `only the pressure budget may hold it back: ${JSON.stringify(res)}`);
    h.sim.runTicks(60);
    res = request();
  }
  assert.equal(res.ok, true, `the planned item passes the fire-time gates and pacing: ${JSON.stringify(res)}`);
  assert.ok(Object.values(h.state.encounterDirector.live).some((l) => l.shapeId === SHAPE));
});
