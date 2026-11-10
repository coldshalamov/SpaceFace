import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { combat } from '../src/systems/combat.js';

// W-BLOOM-LOW remains: the kill leaves the tool. Each brood family's authored deathLeaves is
// a real latched body — position and momentum of the victim, thrown-mass counterplay through
// the existing plow/whip laws, and the family's authored effect on top.
const DT = 1 / 60;

function fixture({ wave = 17 } = {}) {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight';
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    { wave, phase: 'active' });
  const player = { id: state.nextEntityId++, type: 'ship', alive: true,
    hull: 40, hullMax: 200, radius: 8, mass: 400, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, data: {} };
  state.playerId = player.id;
  state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [], payloads: [] };
  const helpers = { spawnEntity(spec) {
    const e = { ...spec, id: state.nextEntityId++, alive: true };
    state.entities.set(e.id, e); state.entityList.push(e);
    if (e.type === 'payload') state.entityIndex.payloads.push(e);
    bus.emit('entity:spawned', { entity: e });
    return e;
  }, removeEntity(id) {
    const e = state.entities.get(id);
    if (e) e.alive = false;
  } };
  const combatSys = Object.create(combat);
  combatSys.init({ state, bus, helpers });
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => [] });
  engine.prepareWave(state.run, wave); engine.spawnWave(state);
  const bodies = engine._bodies;
  const remains = () => state.entityList.filter(e => e.alive && e.data?.payloadType === 'brood_remains');
  const familyOf = (i) => bodies.liveFamilyId[bodies.family[i]];
  const firstAlive = (familyId) => {
    for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i] && familyOf(i) === familyId) return i;
    return -1;
  };
  const aliveList = (familyId) => {
    const out = [];
    for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i] && familyOf(i) === familyId) out.push(i);
    return out;
  };
  // Kill the cell in isolation: family bursts and shards are real mechanisms and would
  // cascade extra deaths (and extra remains) off-screen of what this assert measures.
  const killIsolated = (i, cause) => {
    bodies.px[i] = 9000; bodies.pz[i] = 9000;
    engine._killDirectForTest(i, cause);
  };
  const tick = (n = 1) => { for (let k = 0; k < n; k++) { engine.step(state); state.simTime += DT; state.tick += 1; } };
  // A remain body placed by hand — the physics-side tests only need the mover/entity shape.
  const placeRemain = (kind, pos, vel, extra = {}) => helpers.spawnEntity({
    type: 'payload', alive: true, collides: true, radius: 4, mass: 12,
    physicsBody: { dynamic: true, mass: 12 },
    pos: { x: pos.x, z: pos.z }, vel: { x: vel.x, z: vel.z },
    hull: 20, hullMax: 20,
    data: { kind: 'payload', payloadType: 'brood_remains', name: kind,
      masslineTetherable: true, transientSector: true,
      despawnAt: state.simTime + 45, broodRemain: { familyId: 'test', kind, ...extra } },
  });
  return { state, bus, player, helpers, engine, combatSys, bodies, remains, familyOf, firstAlive, aliveList, killIsolated, tick, placeRemain };
}

test('a brood death leaves its authored physical body at the death spot, with the victim momentum', () => {
  const h = fixture();
  const want = {
    mite: 'husk_shards', spitter: 'acid_sac', charger: 'horn_plate',
    leecher: 'leech_glue', glassback: 'glass_shards', wake_eel: 'eel_body',
  };
  for (const [familyId, kind] of Object.entries(want)) {
    const i = h.firstAlive(familyId);
    assert.ok(i >= 0, `wave 17 fields a ${familyId}`);
    const before = h.remains().length;
    h.bodies.vx[i] = 30; h.bodies.vz[i] = -10;
    h.killIsolated(i, 'collision');
    const mine = h.remains().filter(e => e.data.broodRemain.familyId === familyId);
    assert.equal(mine.length, 1, `${familyId} leaves exactly one body`);
    assert.equal(h.remains().length, before + 1, `isolated ${familyId} death adds no other bodies`);
    const body = mine[0];
    assert.equal(body.data.broodRemain.familyId, familyId);
    assert.equal(body.data.broodRemain.kind, kind);
    assert.equal(body.pos.x, 9000); assert.equal(body.pos.z, 9000, 'the body appears at the death spot');
    assert.equal(body.vel.x, 30); assert.equal(body.vel.z, -10, 'the body keeps the victim momentum');
    assert.equal(body.type, 'payload');
    assert.equal(body.data.masslineTetherable, true, 'the Line can latch it');
    assert.equal(body.data.physicalCustodyOnly, true);
    assert.equal(body.data.transientSector, true);
    assert.ok(Number.isFinite(body.data.despawnAt), 'bounded lifetime');
  }
  const glass = h.remains().find(e => e.data.broodRemain.familyId === 'glassback');
  assert.equal(glass.data.broodRemain.splashRadius, 40);
  const leech = h.remains().find(e => e.data.broodRemain.familyId === 'leecher');
  assert.equal(leech.data.broodRemain.glueS, 3);
  const eel = h.remains().find(e => e.data.broodRemain.familyId === 'wake_eel');
  assert.equal(eel.data.broodRemain.whipMult, 1.9);
});

test('clear- and burst-only families leave no body; a dead slot cannot drop twice', () => {
  const h = fixture();
  for (const familyId of ['spore_drift', 'lantern_cyst', 'bellows']) {
    const i = h.firstAlive(familyId);
    assert.ok(i >= 0, `wave 17 fields a ${familyId}`);
    h.engine._killDirectForTest(i, 'explosive');
    const left = h.remains().filter(e => e.data.broodRemain.familyId === familyId);
    assert.equal(left.length, 0, `${familyId} authored no remains`);
  }
  // A slot already dead emits no second body no matter how the receipt is re-driven.
  const i = h.firstAlive('mite');
  h.engine._killDirectForTest(i, 'collision');
  const count = h.remains().length;
  h.engine._killDirectForTest(i, 'collision');
  h.engine._killDirectForTest(i, 'explosive');
  assert.equal(h.remains().length, count, 'stale kills spawn nothing');
});

test('a thrown remain plows the flock — burst remains splash and are spent, plain remains keep flying', () => {
  const h = fixture();
  const mite = h.firstAlive('mite');
  assert.ok(mite >= 0);
  // A light husk shard (mass under the pebble gate) still kills at speed — it is a weapon.
  const target = { x: h.bodies.px[mite], z: h.bodies.pz[mite] };
  const husk = h.placeRemain('husk_shards', target, { x: 100, z: 0 });
  h.tick();
  assert.equal(h.bodies.alive[mite], 0, 'thrown husk shard kills on contact');
  assert.equal(husk.alive, true, 'a plain mass remain keeps flying after the hit');

  // Acid sac: the struck cell dies, its neighbors inside the splash die by explosive law,
  // a body just outside the splash survives, and the sac itself is spent.
  const mites = h.aliveList('mite');
  assert.ok(mites.length >= 3);
  const [a, b, c] = mites;
  h.bodies.px[a] = 5000; h.bodies.pz[a] = 5000;
  h.bodies.px[b] = 5020; h.bodies.pz[b] = 5000; // inside splashRadius 30 of the hit
  h.bodies.px[c] = 5060; h.bodies.pz[c] = 5000; // outside the splash
  const sac = h.placeRemain('acid_sac', { x: 5000, z: 5000 }, { x: 100, z: 0 }, { splashRadius: 30 });
  h.tick();
  assert.equal(h.bodies.alive[a], 0, 'the sac lands the impact kill');
  assert.equal(h.bodies.alive[b], 0, 'the splash takes the close neighbor');
  assert.equal(h.bodies.alive[c], 1, 'a body outside the splash survives');
  assert.equal(sac.alive, false, 'the sac bursts — its body is spent');

  // An ordinary payload with no remain stamp is not a mover: same speed, same spot, no kill.
  const d = h.firstAlive('mite');
  assert.ok(d >= 0);
  h.helpers.spawnEntity({ type: 'payload', alive: true, collides: true, radius: 4, mass: 40,
    pos: { x: h.bodies.px[d], z: h.bodies.pz[d] }, vel: { x: 100, z: 0 }, data: {} });
  const before = h.bodies.alive[d];
  h.tick();
  assert.equal(h.bodies.alive[d], before, 'unstamped payloads never plow the flock');
});

test('the leech body is glue ammunition — it pins a cell without killing it, then lets go', () => {
  const h = fixture();
  const i = h.firstAlive('charger');
  assert.ok(i >= 0);
  h.bodies.px[i] = -5000; h.bodies.pz[i] = -5000;
  h.bodies.vx[i] = 36; h.bodies.vz[i] = 0;
  const leech = h.placeRemain('leech_glue', { x: -5000, z: -5000 }, { x: 5, z: 0 }, { glueS: 3 });
  h.tick();
  assert.equal(h.bodies.alive[i], 1, 'glue sticks — it does not kill');
  assert.ok(h.bodies.gluedUntil[i] > h.state.simTime, 'the pin clock is live');
  assert.equal(leech.alive, false, 'the stuck leech is spent');
  h.tick(30);
  const gluedSpeed = Math.hypot(h.bodies.vx[i], h.bodies.vz[i]);
  assert.ok(gluedSpeed < 15, `glued body crawls (speed ${gluedSpeed.toFixed(1)})`);
  h.state.simTime = h.bodies.gluedUntil[i] + 0.1;
  // Track the best speed across the release window — a windup-hold frame must not read as
  // "still glued"; the freed body has to actually move again somewhere in it.
  let freedSpeed = 0;
  for (let k = 0; k < 90; k++) { h.tick(); freedSpeed = Math.max(freedSpeed, Math.hypot(h.bodies.vx[i], h.bodies.vz[i])); }
  assert.ok(freedSpeed > gluedSpeed + 10, `the body moves again once the glue lets go (peak ${freedSpeed.toFixed(1)})`);

  // A committed dash is a body too: glue landed mid-pass still pins it — the authored
  // counter is "glue the dash", not "glue it before it commits".
  const d = h.firstAlive('charger');
  assert.ok(d >= 0);
  h.bodies.px[d] = -8000; h.bodies.pz[d] = -8000;
  h.bodies.vx[d] = 200; h.bodies.vz[d] = 0;
  h.bodies.phase[d] = 2; // BROOD_PHASE_DASH
  h.placeRemain('leech_glue', { x: -8000, z: -8000 }, { x: 5, z: 0 }, { glueS: 3 });
  h.tick(20);
  const pinnedDashSpeed = Math.hypot(h.bodies.vx[d], h.bodies.vz[d]);
  assert.ok(pinnedDashSpeed < 30, `a pinned dash never lands (speed ${pinnedDashSpeed.toFixed(1)})`);

  // The glue dies with the wave: a cleared slot can never hand its pin to the next body.
  const gluedSlot = d;
  h.engine.clear();
  h.engine.prepareWave(h.state.run, 17); h.engine.spawnWave(h.state);
  for (let n = 0; n < h.bodies.alive.length; n++) {
    assert.equal(h.bodies.gluedUntil[n], 0, `slot ${n === gluedSlot ? 'reused' : n} carries no stale pin`);
  }
});

test('the eel body widens the held whip; an ordinary remain does not', () => {
  const h = fixture();
  h.state.player = h.state.player || {};
  const setWhip = (entity) => { h.state.player.tether = { active: true, targetId: entity.id }; };
  // Cell at perpendicular distance 5.2 from the swing line: inside the eel's 3.8+2.4 reach,
  // outside an ordinary payload's 2.0+2.4 reach.
  const cellAt = (d) => {
    const i = h.firstAlive('mite');
    h.bodies.px[i] = 15; h.bodies.pz[i] = d; h.bodies.vx[i] = 0; h.bodies.vz[i] = 0;
    return i;
  };
  const horn = h.placeRemain('horn_plate', { x: 30, z: 0 }, { x: 100, z: 0 });
  const plainTarget = cellAt(5.2);
  setWhip(horn);
  h.tick();
  assert.equal(h.bodies.alive[plainTarget], 1, 'an ordinary held body keeps the authored 2.0 whip width');

  const eel = h.placeRemain('eel_body', { x: 30, z: 0 }, { x: 100, z: 0 }, { whipMult: 1.9 });
  const eelTarget = cellAt(5.2);
  setWhip(eel);
  h.tick();
  assert.equal(h.bodies.alive[eelTarget], 0, 'the eel body held on the line widens the kill width');
});

test('the pool is bounded; run-boundary clears and stale receipts behave', () => {
  const h = fixture();
  let kills = 0;
  for (let i = 0; i < h.bodies.alive.length && kills < 20; i++) {
    if (!h.bodies.alive[i] || h.familyOf(i) !== 'mite') continue;
    h.engine._killDirectForTest(i, 'collision');
    kills += 1;
  }
  assert.equal(kills, 20);
  assert.equal(h.remains().length, 16, 'the pool is capped — oldest unattached bodies leave first');
  // A stale/foreign spend receipt retires nothing it does not own.
  h.bus.emit('swarm:broodRemainsSpent', { entityId: 999999 });
  h.bus.emit('swarm:broodRemainsSpent', { entityId: h.player.id });
  assert.equal(h.remains().length, 16);
  // run:ended sweeps every run-scoped remain.
  h.bus.emit('run:ended', {});
  assert.equal(h.remains().length, 0, 'run end clears the field');
});
