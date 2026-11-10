import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateThreeWeir, gateThreeWeirSpec } from '../src/systems/gateThreeWeir.js';
import { GATE_THREE_WEIR } from '../src/data/gateThree.js';
import { gateThreeEntered, gateThreeInWeir, gateThreeCargoBody, gateThreeCargoNear, gateThreeManifestT, gateThreeWeigh, gateThreeOutcome } from '../src/characters/gateThreeRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const POST = GATE_THREE_WEIR.post;
const OUTSIDE = { x: POST.x + GATE_THREE_WEIR.weirRadius + 500, z: POST.z };

function fixture({ sector = GATE_THREE_WEIR.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { ...OUTSIDE }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 50, hullMax: 50, isPlayer: true });
  state.playerId = player.id;
  for (const t of ['comms:popup', 'economy:chargeCredits', 'gateThree:weighed']) bus.on(t, (p) => events.push([t, p]));
  const system = createGateThreeWeir();
  system.init({ state, bus, helpers });
  const beacon = () => state.entityList.filter((e) => e.alive && e.data?.gateThreeWeir === true);
  const addPod = (over = {}) => helpers.spawnEntity({
    type: 'pickup', pos: { x: player.pos.x + 5, z: player.pos.z }, vel: { x: 0, z: 0 },
    radius: 6, mass: 30, hull: 1, hullMax: 1, data: { kind: 'cargo' }, ...over,
  });
  const step = (n = 1) => { for (let i = 0; i < n; i++) { state.tick++; system.update(0.5, state); } };
  const enterWeir = () => { player.pos.x = POST.x; player.pos.z = POST.z; step(); };
  const verdicts = () => events.filter(([t]) => t === 'gateThree:weighed');
  return { bus, state, helpers, system, events, beacon, player, addPod, step, enterWeir, verdicts };
}

test('registered in both orders on the calendar clock — a swept cordon census', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'gateThreeWeir').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'gateThreeWeir').length, 1);
  assert.equal(getDeclaredSystemClock('gateThreeWeir'), 'calendar');
});

test('the weir beacon waits at Tethys adventure and announces itself once ever', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'gate3_weir_announce');
  assert.equal(announces.length, 1);
  f.system._sync(); f.system._sync();
  assert.equal(f.beacon().length, 1, 're-entry cannot stack a second post');
  assert.equal(announces.length, 1, 'the post explains itself once ever');
});

test('no post in survival, lab, or another sector; leaving Tethys clears it', () => {
  for (const kind of ['survival', 'lab']) {
    const f = fixture({ kind });
    assert.equal(f.beacon().length, 0, kind);
  }
  const f = fixture();
  f.state.world.currentSectorId = 'sector_helios';
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 0, 'the weir is Tethys property');
});

test('crossing the cordon submits the hull once — a clean transit logs clean', () => {
  const f = fixture();
  f.step(2); // outside census establishes lastPos
  f.enterWeir();
  const v = f.verdicts();
  assert.equal(v.length, 1);
  assert.equal(v[0][1].outcome, 'clean');
  assert.equal(v[0][1].manifestMassT, 20);
  assert.equal(f.events.filter(([t]) => t === 'economy:chargeCredits').length, 0, 'no fine on a clean weigh');
  f.step(3); // parked inside must not re-fire
  assert.equal(f.verdicts().length, 1, 'a hull inside the ring is not re-weighed');
});

test('leaving and re-entering the ring submits a fresh weighing', () => {
  const f = fixture();
  f.step(2);
  f.enterWeir();
  f.player.pos.x = OUTSIDE.x; f.player.pos.z = OUTSIDE.z; f.step(2);
  f.enterWeir();
  assert.equal(f.verdicts().length, 2);
});

test('a hull that tunnels through the ring edge between censuses still submits', () => {
  const f = fixture();
  f.step(2);
  // One fast sweep: outside on the east, outside on the west, path straight through the post.
  f.player.pos.x = POST.x + GATE_THREE_WEIR.weirRadius + 50; f.player.pos.z = POST.z;
  f.step();
  assert.equal(f.verdicts().length, 0, 'approach outside does not fire');
  f.player.pos.x = POST.x - GATE_THREE_WEIR.weirRadius - 50; f.player.pos.z = POST.z;
  f.step();
  assert.equal(f.verdicts().length, 1, 'the swept path clipped the cordon — the scale read it');
});

test('over-mass freight within the wave limit gets Dree\'s once-ever wave, no fine', () => {
  const f = fixture();
  f.step(2);
  const pod = f.addPod({ mass: 15 }); // 15 t loose freight near the hull — the manifest says 20, scale reads 35
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z; // it rides with the hull through the cordon
  f.enterWeir();
  const v = f.verdicts();
  assert.equal(v.length, 1);
  assert.equal(v[0][1].outcome, 'waived');
  assert.equal(v[0][1].waived, true);
  assert.equal(f.events.filter(([t]) => t === 'economy:chargeCredits').length, 0, 'the wave is free');
  assert.equal(f.state.story.flags[GATE_THREE_WEIR.waveFlag], true);
});

test('after the wave is spent the next over-mass files Hale\'s fine', () => {
  const f = fixture();
  f.state.story.flags[GATE_THREE_WEIR.waveFlag] = true; // the wave was spent on a previous lane
  f.step(2);
  const pod = f.addPod({ mass: 10 });
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterWeir();
  const v = f.verdicts();
  assert.equal(v[0][1].outcome, 'fined');
  const expected = Math.max(GATE_THREE_WEIR.fineMinCr, Math.round(10 * GATE_THREE_WEIR.finePerTCr));
  const charges = f.events.filter(([t]) => t === 'economy:chargeCredits');
  assert.equal(charges.length, 1);
  assert.equal(charges[0][1].amount, expected);
  assert.equal(charges[0][1].reason, 'fine:gate3-ref44c');
  assert.equal(f.state.story.flags[GATE_THREE_WEIR.countFlag], 1);
});

test('an over-mass beyond the wave limit is fined even with the wave unspent', () => {
  const f = fixture();
  f.step(2);
  const pod = f.addPod({ mass: 60 }); // 60 t loose — no inspector waves that
  pod.pos.x = POST.x + 5; pod.pos.z = POST.z;
  f.enterWeir();
  const v = f.verdicts();
  assert.equal(v[0][1].outcome, 'fined');
  assert.equal(f.state.story.flags[GATE_THREE_WEIR.waveFlag], false === true ? true : undefined, 'the wave stays unspent');
  const charges = f.events.filter(([t]) => t === 'economy:chargeCredits');
  assert.equal(charges.length, 1);
});

test('the rules are honest geometry — swept entry, cargo predicate, verdict naming', () => {
  assert.equal(gateThreeInWeir(POST), true);
  assert.equal(gateThreeInWeir(OUTSIDE), false);
  assert.equal(gateThreeEntered(OUTSIDE, POST), true);
  assert.equal(gateThreeEntered(POST, POST), false, 'parked inside is not a crossing');
  assert.equal(gateThreeEntered(OUTSIDE, OUTSIDE), false);
  assert.equal(gateThreeEntered(null, POST), true, 'first census inside submits once');
  const pod = { id: 9, pos: { x: 0, z: 0 }, alive: true, type: 'pickup', data: { kind: 'cargo' } };
  assert.equal(gateThreeCargoBody(pod, 7), true);
  assert.equal(gateThreeCargoBody({ ...pod, id: 7 }, 7), false, 'the subject is not its own freight');
  assert.equal(gateThreeCargoBody({ ...pod, type: 'beacon', data: {} }, 7), false);
  assert.equal(gateThreeManifestT({ mass: 20 }), 20);
  assert.equal(gateThreeManifestT({ mass: 0 }), GATE_THREE_WEIR.manifestMinT);
  assert.deepEqual(gateThreeOutcome({ outcome: 'clean' }, false).kind, 'clean');
  assert.deepEqual(gateThreeOutcome({ outcome: 'over_mass', overByT: 10 }, false).kind, 'waived');
  assert.deepEqual(gateThreeOutcome({ outcome: 'over_mass', overByT: 10 }, true).kind, 'fined');
  assert.deepEqual(gateThreeOutcome({ outcome: 'over_mass', overByT: 60 }, false).kind, 'fined');
});

test('destroy clears listeners, providers, and the beacon; re-init is clean', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  f.system.destroy();
  assert.equal(f.beacon().length, 0);
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  f.system.init({ state: f.state, bus: f.bus, helpers: f.helpers });
  assert.equal(f.beacon().length, 1, 'repeated init still leaves exactly one post');
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'gate3_weir_announce');
  assert.equal(announces.length, 1, 'the once-ever flag survives re-init');
});

test('the shared scale model resolves a real weigh — pod counted, far freight ignored', () => {
  const f = fixture();
  const near = f.addPod({ mass: 15 });
  const far = f.helpers.spawnEntity({
    type: 'pickup', pos: { x: POST.x, z: POST.z + 5000 }, vel: { x: 0, z: 0 },
    radius: 6, mass: 99, hull: 1, hullMax: 1, data: { kind: 'cargo' },
  });
  f.player.pos.x = POST.x; f.player.pos.z = POST.z;
  near.pos.x = POST.x + 5; near.pos.z = POST.z;
  const near2 = gateThreeCargoNear(f.player, f.state.entityList);
  assert.ok(near2.includes(near));
  assert.ok(!near2.includes(far), 'freight 5000 WU away is not the hull\'s mass');
  const { verdict, manifestMassT } = gateThreeWeigh(f.player, f.state.entityList);
  assert.equal(manifestMassT, 20);
  assert.ok(verdict.readMassT > manifestMassT, 'loose freight reads over manifest');
});

test('lane clutter on the cordon sightline cannot shadow the scale — casters are the barge\'s set', () => {
  const f = fixture();
  // Hull parked inside the ring; a fighter parked exactly on the post->hull line.
  // A fighter is not a mass-shadow caster: the hull still weighs itself (700's filter).
  f.player.pos.x = POST.x; f.player.pos.z = POST.z + 100;
  f.helpers.spawnEntity({
    type: 'ship', pos: { x: POST.x, z: POST.z + 50 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 10, hullMax: 10, data: {},
  });
  const { read } = gateThreeWeigh(f.player, f.state.entityList);
  assert.equal(read.subjectMassT, 20, 'a small body on the line is clutter, not a shadow');
});

test('a real mass-shadow caster still hides freight behind it — shadows read through the filter', () => {
  const f = fixture();
  // Hull at +150 on the axis; a dense fragment at +200 hides the pod parked behind it
  // at +240 without covering the hull — the same hiding lesson the barge teaches.
  f.player.pos.x = POST.x + 150; f.player.pos.z = POST.z;
  const pod = f.addPod({ mass: 15 });
  pod.pos.x = POST.x + 240; pod.pos.z = POST.z + 5;
  f.helpers.spawnEntity({
    type: 'prop', pos: { x: POST.x + 200, z: POST.z }, vel: { x: 0, z: 0 },
    radius: 40, mass: 5000, hull: 1, hullMax: 1, data: { massShadow: true },
  });
  const { read, verdict } = gateThreeWeigh(f.player, f.state.entityList);
  assert.equal(read.subjectMassT, 20, 'the hull stands clear of the shadow');
  assert.ok(read.hidden.some((h) => h.id === pod.id && h.reason === 'mass_shadow'),
    'freight behind a real caster never existed — the shared model');
  assert.equal(verdict.outcome, 'clean', 'the hidden pod never counted against the manifest');
});
