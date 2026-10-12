// SFQ-M M33 At the edge of order: a selective, finite containment plane between two Boundary
// Walkers, reactive spore mass on one side, a Pitborn barge crossing past both edges on the other.
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
import { planeArrests } from '../src/data/encounters/1106-edge-of-order.js';

const SEED = 4242;
const SECTOR = 'sector_ashfall_reach';
const ANCHOR = Object.freeze({ x: 2000, z: 2000 });
const SHAPE = 'edge_of_order';

function makeHarness({ playerPos = null, ...extra } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [spawnBudget, encounterDirector], ...extra });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: playerPos ? { ...playerPos } : { x: ANCHOR.x - 900, z: ANCHOR.z - 900 }, vel: { x: 0, z: 0 },
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
    shapeId: SHAPE, encounterId: 'test_m33', sectorId: SECTOR, anchor: { ...ANCHOR },
    zoneType: 'anomaly_deep', zoneRadius: 600, force: true,
  });
  assert.equal(res.ok, true, `fire must succeed: ${JSON.stringify(res)}`);
  return Object.values(h.state.encounterDirector.live).find((l) => l.shapeId === SHAPE);
}

const oOf = (live) => live.data.edge;
const ent = (h, id) => h.state.entities.get(id);
const grants = (h) => h.events.filter((e) => e.name === 'grant').map((e) => e.payload.amount);
const reps = (h) => h.events.filter((e) => e.name === 'rep').map((e) => e.payload.delta);
const resolved = (h) => h.events.filter((e) => e.name === 'resolved').map((e) => e.payload.outcome);
const said = (h) => h.events.filter((e) => e.name === 'voice').map((e) => e.payload.text);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const seconds = (h, s) => h.sim.runTicks(Math.round(s / SIM_DT));
const at = (o, along, normal) => ({ x: o.mid.x + o.t.x * along + o.n.x * normal, z: o.mid.z + o.t.z * along + o.n.z * normal });
const latch = (h, id) => h.bus.emit('tether:attached', { targetId: id, ownerId: h.player.id, sourceId: h.player.id });
const spores = (h, o) => o.sporeIds.map((id) => ent(h, id)).filter(Boolean);

test('edge_of_order is a registered deep-anomaly convoy minor at the Ashfall walkers and outer dark, never Helios', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc);
  assert.deepEqual({ zones: [...enc.zoneTypes], script: enc.script, verbs: [...enc.verbs] },
    { zones: ['anomaly_deep'], script: 'selfRegistered', verbs: ['escort', 'latch', 'throw', 'tow'] });
  assert.ok(!enc.gates.sectorIds.includes('sector_helios_prime'));
});

test('fire stands two Walkers at the ends of a finite plane and starts a latchable barge on a route past both edges', () => {
  const h = makeHarness();
  const live = fire(h);
  const o = oOf(live);
  const [a, b] = o.walkerIds.map((id) => ent(h, id));
  assert.ok([a, b].every((w) => w.type === 'machine' && w.data.machine.kind === 'boundary_walker'));
  const span = dist(a.pos, b.pos);
  const barge = ent(h, o.bargeId);
  assert.equal(barge.physicsBody.dynamic, true);
  assert.equal(isAttachable(barge, h.state.playerId, h.state), true);
  const route = dist(barge.pos, o.routeEnd);
  assert.ok(route > span + 200, `the route (${route.toFixed(0)}) outruns the plane (${span.toFixed(0)}) at both ends`);
  assert.ok(said(h)[0].includes('Walker power cycles in 170 s'), 'the power interruption is declared up front');
});

test('the plane law is selective and finite: spore mass inside the span is arrested; hulls, far-edge spores and retreating spores are not', () => {
  const h = makeHarness();
  const o = oOf(fire(h));
  const n = o.n;
  const inbound = { x: n.x * 8, z: n.z * 8 };
  const body = (kind, pos, vel = inbound) => ({ pos, vel, data: { storyPropKind: kind } });
  assert.equal(planeArrests(o, body('m33_reactive_spore', at(o, 0, -10))), true);
  assert.equal(planeArrests(o, body('m33_reactive_spore', at(o, 300, -10))), false, 'past the edge the plane has no reach');
  assert.equal(planeArrests(o, body('m33_reactive_spore', at(o, 0, -10), { x: -inbound.x, z: -inbound.z })), false);
  assert.equal(planeArrests(o, body('m33_ore_barge', at(o, 0, -10))), false, 'ordinary hulls pass');
  assert.equal(planeArrests(o, { ...body(null, at(o, 0, -10)), type: 'ship' }), false);
});

test('the bloom feeds clumps at the barge from beyond the plane, on its cycle, as latchable bodies', () => {
  const h = makeHarness();
  const live = fire(h);
  const o = oOf(live);
  seconds(h, 28.5);
  const ss = spores(h, o);
  assert.equal(ss.length, 3);
  for (const s of ss) {
    assert.equal(s.physicsBody.dynamic, true);
    assert.equal(isAttachable(s, h.state.playerId, h.state), true, 'clumps can be latched and thrown clear');
    // The drift is launched as an impulse through the authority; the launch intent carries the aim.
    const toward = (s.data.launch.x * o.n.x + s.data.launch.z * o.n.z);
    assert.ok(toward > 0, 'aimed across the plane toward the protected side');
    assert.ok(Number.isFinite(s.data.launchQueuedAt), 'and actually queued to the physics authority');
  }
});

test('three clumps on the hull foul the burn: stranded, unpaid, and it stays where it died', () => {
  const h = makeHarness();
  const live = fire(h);
  const o = oOf(live);
  const barge = ent(h, o.bargeId);
  for (let i = 0; i < 3; i++) {
    seconds(h, 10.5);
    const s = spores(h, o).find((e) => !e.data.sporeStuck);
    assert.ok(s, 'a clump to stick');
    s.pos.x = barge.pos.x + 20; s.pos.z = barge.pos.z;
    seconds(h, 1.2);
  }
  assert.deepEqual(resolved(h), ['fouled']);
  assert.ok(said(h).includes('BARGE: SPORE ON THE HULL (1/3).'));
  assert.ok(said(h).includes('BARGE: BURN FOULED. WE ARE STRANDED.'));
  assert.deepEqual(grants(h), []);
  assert.deepEqual(reps(h), [-1]);
  assert.equal(barge.alive, true);
  assert.equal(barge.data.scanLabel, 'PITBORN ORE BARGE — FOULED, STRANDED AT THE EDGE OF ORDER');
});

test('in tow the barge burn cuts; running it out your own way with one scar pays reduced', () => {
  const h = makeHarness();
  const live = fire(h);
  const o = oOf(live);
  const barge = ent(h, o.bargeId);
  latch(h, o.bargeId);
  assert.equal(o.inTow, true);
  assert.ok(said(h).includes('BARGE: BURN CUT. YOUR LINE, YOUR ROUTE — GET US OUT.'));
  seconds(h, 10.5);
  const s = spores(h, o)[0];
  s.pos.x = barge.pos.x + 20; s.pos.z = barge.pos.z;
  seconds(h, 1.2);
  assert.equal(o.stuck, 1);
  // Stand-in for the tow: the pilot hauls it out around the far side of the plane.
  const out = at(o, -600, 300);
  barge.pos.x = out.x; barge.pos.z = out.z;
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['crossed_fouled']);
  assert.deepEqual(grants(h), [220]);
  assert.deepEqual(reps(h), [1]);
});

test('the declared power cycle drops the plane; the deadline leaves the barge crawling', () => {
  const h = makeHarness();
  const live = fire(h);
  const o = oOf(live);
  h.state.simTime = o.powerOffAt + 0.5;
  seconds(h, 1.2);
  assert.equal(o.powered, false);
  assert.ok(said(h).includes('WALKERS: POWER CYCLE. PLANE RELEASED.'));
  h.state.simTime = live.deadlineAt + 1;
  seconds(h, 1.2);
  assert.deepEqual(resolved(h), ['lapsed']);
  assert.equal(ent(h, o.bargeId).alive, true);
});

test('on the real Rapier path the plane stops inbound clumps without a fling, and the barge crosses on its burn', async () => {
  // A proximity encounter fires with the pilot on the scene: stand them behind the barge's route,
  // inside the active simulation bubble (far bodies are abstracted and do not integrate).
  const scout = oOf(fire(makeHarness()));
  const h = makeHarness({
    playerPos: at(scout, 0, 260),
    systems: [spawnBudget, encounterDirector, physics], updateOrder: [spawnBudget, encounterDirector, physics],
    runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES },
  });
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSystem = h.sim.registry.get('physics');
  try {
    assert.equal(await physicsSystem.prepareBackend(h.state), true);
    const live = fire(h);
    const o = oOf(live);
    const barge = ent(h, o.bargeId);
    let maxSporeSpeed = 0;
    let crossedPlane = 0;
    for (let i = 0; i < 60 * 160 && !o.settled; i++) {
      h.sim.step(SIM_DT);
      if (i % 30) continue;
      for (const s of spores(h, o)) {
        maxSporeSpeed = Math.max(maxSporeSpeed, Math.hypot(s.vel.x, s.vel.z));
        const dx = s.pos.x - o.mid.x, dz = s.pos.z - o.mid.z;
        const along = dx * o.t.x + dz * o.t.z, h2 = dx * o.n.x + dz * o.n.z;
        if (o.powered && Math.abs(along) < 200 && h2 > 15) crossedPlane++;
      }
    }
    assert.ok(o.arrested >= 2, `the plane arrested clumps (${o.arrested}; outcome ${o.outcome}, t ${h.state.simTime.toFixed(1)}, spores ${o.sporeSerial}, barge ${JSON.stringify(barge.pos)} end ${JSON.stringify(o.routeEnd)})`);
    assert.equal(crossedPlane, 0, 'nothing in the span got through while powered');
    assert.ok(maxSporeSpeed < 8 * 1.3, `arrest never flings a clump (max ${maxSporeSpeed.toFixed(2)} WU/s)`);
    assert.ok(o.settled, 'the crossing resolved');
    assert.ok(['crossed', 'crossed_fouled', 'fouled'].includes(o.outcome), o.outcome);
    if (o.outcome !== 'fouled') assert.ok(dist(barge.pos, o.routeEnd) < 80, 'the barge physically reached the far end');
  } finally {
    if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') physicsSystem._disableSg02DynamicAuthority();
    h.sim.dispose();
  }
});

test('same seed, same plane', () => {
  const a = oOf(fire(makeHarness()));
  const b = oOf(fire(makeHarness()));
  assert.deepEqual([a.mid, a.n, a.routeEnd, a.bloom], [b.mid, b.n, b.routeEnd, b.bloom]);
});

test('the ordinary sector-day roll (seed 4242) draws it off the starter corridor and it fires there without force', () => {
  const zones = zonesForSector(SECTOR);
  let planned = null;
  for (let day = 0; day < 60 && !planned; day++) {
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
