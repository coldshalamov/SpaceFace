import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { normalizeField } from '../src/core/fields/fieldKernel.js';
import { createBroodEngine, broodAttackLimit, BROOD_ATTACK_GAP_S, BROOD_ATTACK_ARRIVAL_S,
  BROOD_LEECHER_STACK_MAX, BROOD_PHASE_FLOCK, BROOD_PHASE_WINDUP,
  BROOD_PHASE_DASH, BROOD_PHASE_LATCHED } from '../src/systems/swarmBrood.js';
import { BROOD_LEECHER_BRAKE_ACCEL, SWARM_BROOD_FAMILIES, BROOD_MAX_SPEED } from '../src/data/swarmBrood.js';
import { swarmChain } from '../src/systems/swarmChain.js';
const DT = 1 / 60;
function boot(wave = 1) {
  const state = createGameState(4242);
  state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), { wave, phase: 'active' });
  state.mode = 'flight';
  const player = { id: state.nextEntityId++, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 400, hull: 200, hullMax: 200, data: {} };
  state.playerId = player.id; state.entities.set(player.id, player); state.entityList.push(player);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  const bus = createBus(), events = [], damage = [], fields = [];
  const emit = bus.emit.bind(bus);
  bus.emit = (event, payload) => { events.push({ event, payload }); emit(event, payload); };
  const engine = createBroodEngine({ getState: () => state, bus, fieldList: () => fields,
    routeDamage: p => { damage.push(p); return { ok: true }; } });
  engine.prepareWave(state.run, wave);
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) { state.tick++; state.simTime += DT; engine.step(state); }
  };
  return { state, player, bus, events, damage, fields, engine, step };
}
const first = h => h.engine._bodies.alive.findIndex(v => v === 1);
function rockAt(h, x, z, { radius = 18, speed = 150, credited = false } = {}) {
  const e = { id: h.state.nextEntityId++, alive: true, type: 'asteroid', collides: true,
    pos: { x, z }, vel: { x: speed, z: 0 }, radius, mass: 1000, data: {} };
  h.state.entities.set(e.id, e); h.state.entityList.push(e); h.state.entityIndex.asteroids.push(e);
  if (credited) recordImpulseProvenance(e, { actorId: h.player.id, appliedTick: h.state.tick,
    magnitude: 1000, weaponId: 'tether_release', tag: 'player_throw' });
  return e;
}
function isolateFamily(h, familyId, count) {
  const bodies = h.engine._bodies;
  const family = SWARM_BROOD_FAMILIES.findIndex(f => f.id === familyId);
  let n = 0;
  for (let i = 0; i < bodies.alive.length; i++) {
    if (!bodies.alive[i]) continue;
    if (n++ < count) {
      bodies.family[i] = family;
      const a = i * Math.PI * 2 / count;
      bodies.px[i] = Math.cos(a) * 115; bodies.pz[i] = Math.sin(a) * 115;
      bodies.vx[i] = 0; bodies.vz[i] = 0; bodies.timer[i] = 0; bodies.phase[i] = BROOD_PHASE_FLOCK;
    } else h.engine._killDirectForTest(i, 'direct');
  }
  h.events.length = 0;
}
for (const wave of [3, 13, 31]) {
  test(`wave ${wave}: arrivals get grace, tells are spaced, and in-flight attacks share the cap`, () => {
    const h = boot(wave); h.engine.spawnWave(h.state); isolateFamily(h, 'spitter', 48);
    const b = h.engine._bodies; let previous = new Uint8Array(b.phase); let last = -Infinity; let starts = 0;
    for (let t = 0; t < 900; t++) {
      h.step();
      let committed = h.engine.view.lobCount;
      for (let i = 0; i < b.alive.length; i++) {
        if (!b.alive[i]) continue;
        if (b.phase[i] === BROOD_PHASE_WINDUP || b.phase[i] === BROOD_PHASE_DASH) committed++;
        if (b.phase[i] === BROOD_PHASE_WINDUP && previous[i] !== BROOD_PHASE_WINDUP) {
          assert.ok(h.state.simTime >= BROOD_ATTACK_ARRIVAL_S, 'full arrival tell before first attack');
          assert.ok(h.state.simTime - last >= BROOD_ATTACK_GAP_S - 1e-8, 'not a same-frame wall of tells');
          last = h.state.simTime; starts++;
        }
      }
      assert.ok(committed <= broodAttackLimit(wave), `wave ${wave}, frame ${t}: ${committed} attacks`);
      previous.set(b.phase);
    }
    assert.ok(starts >= 5, 'the cap must pace attacks, not disable them');
    assert.ok(h.damage.length > 0, 'standing in repeated marked attacks still hurts');
  });
}
test('a large leecher stack cannot reverse the pilot or bypass the three-stack acceleration ceiling', () => {
  for (const speed of [2, 40, 160]) {
    const h = boot(31); h.engine.spawnWave(h.state); isolateFamily(h, 'leecher', 80);
    h.player.vel = { x: speed * 0.6, z: speed * 0.8 };
    const b = h.engine._bodies;
    for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) b.phase[i] = BROOD_PHASE_LATCHED;
    const before = { ...h.player.vel }; h.step();
    const impulses = consumePhysicsCommand(h.player)?.impulses || [];
    const x = impulses.reduce((sum, j) => sum + j.x, 0), z = impulses.reduce((sum, j) => sum + j.z, 0);
    const dv = Math.hypot(x, z) / resolvePhysicsBodySpec(h.player).mass;
    assert.ok(dv > 0, 'leechers still brake');
    assert.ok(dv <= Math.min(speed, BROOD_LEECHER_BRAKE_ACCEL * DT * BROOD_LEECHER_STACK_MAX) + 1e-8);
    assert.deepEqual(h.player.vel, before, 'only the solver may apply the queued impulses');
  }
});
test('ambient plows still kill physically but never announce, chain, or pay a player wipe', () => {
  const h = boot(); const chain = Object.create(swarmChain); chain.init({ state: h.state, bus: h.bus });
  h.engine.spawnWave(h.state); const i = first(h), b = h.engine._bodies;
  rockAt(h, b.px[i], b.pz[i]); const before = h.engine.census().alive; h.step();
  assert.ok(h.engine.census().alive < before, 'physical collision remains lethal');
  const losses = h.events.filter(e => e.event === 'swarm:broodKills').map(e => e.payload);
  assert.ok(losses.some(p => p.removedCount > 0)); assert.ok(losses.every(p => p.count === 0));
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested' || e.event === 'swarm:chain').length, 0);
  chain.destroy();
});
test('the same plow earns a real chain and currency when impulse provenance names the pilot', () => {
  const h = boot(); const chain = Object.create(swarmChain); chain.init({ state: h.state, bus: h.bus });
  h.engine.spawnWave(h.state); const i = first(h), b = h.engine._bodies;
  rockAt(h, b.px[i], b.pz[i], { credited: true }); h.step();
  assert.ok(h.events.some(e => e.event === 'swarm:broodKills' && e.payload.count > 0));
  assert.ok(h.events.some(e => e.event === 'run:awardRequested' && e.payload.reason === 'brood'));
  assert.ok(h.events.some(e => e.event === 'swarm:chain')); chain.destroy();
});
test('a player field transfers causal credit into a later terrain slam', () => {
  const h = boot(); h.engine.spawnWave(h.state); const i = first(h), b = h.engine._bodies;
  h.fields.push(normalizeField({ id: 'player-well', kind: 'well', ownerId: h.player.id,
    center: { x: b.px[i] + 20, z: b.pz[i] }, radius: 100, strength: 200, durationS: Infinity }));
  h.step(); h.fields.length = 0;
  rockAt(h, b.px[i], b.pz[i], { speed: 0 }); b.vx[i] = BROOD_MAX_SPEED;
  h.step();
  assert.ok(h.events.some(e => e.event === 'swarm:broodKills' && e.payload.cause === 'terrain' && e.payload.count > 0));
});
test('explosion ownership matters; unowned explosions are not implicitly player attacks', () => {
  for (const owned of [false, true]) {
    const h = boot(); h.engine.spawnWave(h.state);
    const before = h.engine.census().alive;
    const payload = { pos: { x: 0, z: 0 }, radius: 500, ...(owned ? { ownerId: h.player.id } : {}) };
    h.engine.onExplosion(payload); h.engine.onExplosion(payload);
    assert.equal(h.engine.census().alive, 0);
    const receipts = h.events.filter(e => e.event === 'swarm:broodKills');
    assert.equal(receipts.reduce((sum, e) => sum + e.payload.count, 0), owned ? before : 0);
    assert.equal(h.events.some(e => e.event === 'run:awardRequested'), owned);
  }
});
test('blocked brood arrivals stay owed and retry safely without minting dead-on-arrival kills', () => {
  const h = boot(); const rock = rockAt(h, 0, 0, { radius: 2000, speed: 0 });
  assert.equal(h.engine.spawnWave(h.state), 0); assert.ok(h.engine.view.pendingCount > 0);
  h.step(29); assert.equal(h.engine.census().alive, 0); assert.equal(h.events.length, 0);
  rock.alive = false; h.state.entities.delete(rock.id); h.step(2);
  assert.equal(h.engine.census().alive, 100); assert.equal(h.engine.view.pendingCount, 0);
  assert.equal(h.events.filter(e => e.event === 'swarm:broodKills').length, 0);
});
test('a pending brood plan never bypasses the arena-owned opening lesson hold', () => {
  const h = boot(); h.step(300);
  assert.equal(h.engine.census().alive, 0);
  assert.equal(h.engine.spawnWave(h.state), 100);
  h.engine.clear(); h.step(90); assert.equal(h.engine.census().alive, 0);
});
test('late blast receipts cannot mutate or reward a paused armory wave', () => {
  const h = boot(); h.engine.spawnWave(h.state); const before = h.engine.census().alive;
  h.state.run.phase = 'draft';
  h.engine.onExplosion({ pos: { x: 0, z: 0 }, radius: 500, ownerId: h.player.id });
  assert.equal(h.engine.census().alive, before); assert.equal(h.events.length, 0);
});

test('an enemy spitter killing its own flock does not mint player rewards', () => {
  const h = boot(3); h.engine.spawnWave(h.state); isolateFamily(h, 'spitter', 2);
  const b = h.engine._bodies;
  const ids = Array.from(b.alive).flatMap((live, i) => live ? [i] : []);
  const victim = ids[1];
  b.family[victim] = SWARM_BROOD_FAMILIES.findIndex(f => f.id === 'mite');
  b.px[victim] = 1500; b.pz[victim] = 1500;
  for (let t = 0; t < 360 && h.engine.view.lobCount === 0; t++) h.step();
  assert.ok(h.engine.view.lobCount > 0, 'real spitter launched its projectile');
  const lob = h.engine._lobs, slot = lob.alive.findIndex(v => v === 1);
  h.events.length = 0;
  for (let t = 0; t < 180 && b.alive[victim]; t++) {
    b.px[victim] = lob.tx[slot]; b.pz[victim] = lob.tz[slot];
    b.vx[victim] = 0; b.vz[victim] = 0;
    h.step();
  }
  assert.equal(b.alive[victim], 0, 'friendly acid remains lethal');
  const kills = h.events.filter(e => e.event === 'swarm:broodKills' && e.payload.cause === 'explosive');
  assert.ok(kills.some(e => e.payload.removedCount > 0));
  assert.ok(kills.every(e => e.payload.count === 0));
  assert.equal(h.events.filter(e => e.event === 'run:awardRequested').length, 0);
});
