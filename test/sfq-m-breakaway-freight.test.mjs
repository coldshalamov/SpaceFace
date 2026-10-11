// SFQ-M M02 Breakaway freight: a blown coupler, a segment already drifting for a yard spar, and a
// tug's net that judges every catch by the segment's real entry speed. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { ensurePhysicsBodySpec, isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';
import { physics } from '../src/core/physics.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 4242;
const SECTOR = 'sector_ceres_belt';
const ANCHOR = Object.freeze({ x: -5000, z: 4000 });
const SHAPE = 'breakaway_freight';

function makeHarness(seed = SEED, extra = {}) {
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector], ...extra });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 200, z: ANCHOR.z - 150 }, vel: { x: 0, z: 0 },
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

function fire(h, id = 'test_m02') {
  const res = h.sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: id, sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'refinery_approach', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  const live = Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
  assert.ok(live, 'the encounter is live');
  return live;
}

const bOf = (live) => live.data.breakaway;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => [e.payload.factionId, e.payload.delta]);
const pickups = (h) => h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'pickup');

/** Put the segment at the edge of the net moving inward at `speed` (what a tow or a throw ends as). */
function arriveAtNet(h, live, speed) {
  const b = bOf(live);
  const seg = ent(h, b.segmentId);
  const tug = ent(h, b.tugId);
  seg.pos.x = tug.pos.x + 130; seg.pos.z = tug.pos.z;
  seg.vel = { x: -speed, z: 0 };
  tug.vel = { x: 0, z: 0 };
  h.sim.runTicks(2);
}

test('breakaway_freight is a registered refinery-approach civilian minor gated off the Helios corridor', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'in the shipped catalog');
  assert.deepEqual(
    { tier: enc.tier, deck: enc.deck, zones: [...enc.zoneTypes], script: enc.script, verbs: [...enc.verbs] },
    { tier: 'minor', deck: 'civilian', zones: ['refinery_approach'], script: 'selfRegistered', verbs: ['latch', 'brake', 'tow', 'release'] });
  assert.deepEqual([...enc.gates.sectorIds], ['sector_ceres_belt', 'sector_charon_expanse', 'sector_vesta_forge']);
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire casts a passive tug, a latchable dynamic segment already drifting, and the spar on its line', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bOf(live);
  const tug = ent(h, b.tugId);
  const seg = ent(h, b.segmentId);
  const spar = ent(h, b.sparId);
  assert.equal(tug.data.ai.passive, true);
  assert.equal(tug.data.scanLabel, 'YARD TUG — COUPLER BLOWN, NET OUT');
  assert.match(seg.data.scanLabel, /MANIFEST: 8× COMPOSITE ALLOYS/);
  assert.equal(isAttachable(seg, h.state.playerId, h.state), true, 'the Massline offers the segment');
  assert.equal(ensurePhysicsBodySpec(seg).dynamic, true);
  assert.equal(isDynamicPhysicsBodyEntity(seg), true);
  const speed = Math.hypot(seg.vel.x, seg.vel.z);
  assert.ok(Math.abs(speed - 14) < 1e-6, 'already moving');
  const toSpar = { x: spar.pos.x - seg.pos.x, z: spar.pos.z - seg.pos.z };
  const along = (toSpar.x * seg.vel.x + toSpar.z * seg.vel.z) / (Math.hypot(toSpar.x, toSpar.z) * speed);
  assert.ok(along > 0.999, 'the drift points straight at the spar');
  assert.ok(Math.hypot(toSpar.x, toSpar.z) > 800, 'enough warning time for an ordinary pilot');
  assert.equal(grants(h).length, 0);
});

test('a soft entry (tow, or a gentle throw) is intact: full pay and standing with the tug', () => {
  const h = makeHarness();
  const live = fire(h);
  arriveAtNet(h, live, 30);
  assert.deepEqual(resolved(h), ['intact']);
  assert.deepEqual(grants(h), [340]);
  assert.deepEqual(reps(h), [['faction_mts', 3]]);
  assert.equal(pickups(h).length, 0, 'nothing spilled');
});

test('a hard entry is caught but split: reduced pay and a real spilled-alloy lot to sweep', () => {
  const h = makeHarness();
  const live = fire(h);
  arriveAtNet(h, live, 75);
  assert.deepEqual(resolved(h), ['split']);
  assert.deepEqual(grants(h), [150]);
  const spill = pickups(h);
  assert.equal(spill.length, 1);
  assert.equal(spill[0].data.commodityId, 'cmdty_alloys');
  assert.equal(spill[0].data.amount, 3);
  assert.equal(bOf(live).entrySpeed, 75);
});

test('too fast bursts the net: no pay, only loose alloys', () => {
  const h = makeHarness();
  const live = fire(h);
  arriveAtNet(h, live, 160);
  assert.deepEqual(resolved(h), ['burst']);
  assert.deepEqual(grants(h), []);
  assert.equal(pickups(h)[0].data.amount, 2);
});

test('unattended on the real Rapier path the segment drifts without drag, hits the spar and stays crushed scrap', async () => {
  const h = makeHarness(SEED, {
    systems: [spawnBudget, encounterDirector, physics], updateOrder: [spawnBudget, encounterDirector, physics],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    const live = fire(h, 'test_m02_native');
    const b = bOf(live);
    const seg = ent(h, b.segmentId);
    const start = { ...seg.pos };
    for (let i = 0; i < 600; i++) h.sim.step(SIM_DT);
    const moved = Math.hypot(seg.pos.x - start.x, seg.pos.z - start.z);
    assert.ok(moved > 125 && moved < 155, `10 s of drift at 14 WU/s (moved ${moved.toFixed(1)})`);
    assert.ok(Math.abs(Math.hypot(seg.vel.x, seg.vel.z) - 14) < 0.5, 'no drag bled the drift');
    for (let i = 0; i < 4800 && !b.settled; i++) h.sim.step(SIM_DT);
    assert.deepEqual(resolved(h), ['crushed']);
    assert.deepEqual(grants(h), []);
    assert.equal(seg.alive !== false, true, 'the crushed segment is still in the world');
    assert.equal(seg.data.scanLabel, 'CRUSHED SEGMENT — WRITTEN OFF');
    assert.equal(seg.data.masslineTetherable, false);
    const scrap = pickups(h).filter((p) => p.data.commodityId === 'cmdty_scrap_metal');
    assert.equal(scrap.length, 1, 'the scrap is a real recoverable lot');
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('shooting the segment apart costs standing with the tug and pays nothing', () => {
  const h = makeHarness();
  const live = fire(h);
  ent(h, bOf(live).segmentId).alive = false;
  h.sim.runTicks(2);
  assert.deepEqual(resolved(h), ['destroyed']);
  assert.deepEqual(reps(h), [['faction_mts', -3]]);
  assert.deepEqual(grants(h), []);
});

test('latching the segment is noticed once; the deadline lapses honestly with the segment still out there', () => {
  const h = makeHarness();
  const live = fire(h);
  const b = bOf(live);
  h.bus.emit('tether:attached', { actorId: h.player.id, targetId: b.segmentId });
  h.bus.emit('tether:attached', { actorId: h.player.id, targetId: b.segmentId });
  const hints = h.events.filter((e) => e.name === 'voice' && /Kill the drift first/.test(e.payload.text));
  assert.equal(hints.length, 1);
  assert.equal(b.latched, true);
  const seg = ent(h, b.segmentId);
  seg.vel = { x: 0, z: 0 };
  h.state.simTime = live.deadlineAt + 1;
  h.sim.runTicks(2);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.equal(seg.alive !== false, true);
});

test('same seed, same layout', () => {
  const a = makeHarness(); const la = fire(a);
  const c = makeHarness(); const lc = fire(c);
  const pa = ent(a, bOf(la).segmentId).pos; const pc = ent(c, bOf(lc).segmentId).pos;
  assert.deepEqual({ x: pa.x, z: pa.z }, { x: pc.x, z: pc.z });
  assert.deepEqual(ent(a, bOf(la).sparId).pos, ent(c, bOf(lc).sparId).pos);
});
