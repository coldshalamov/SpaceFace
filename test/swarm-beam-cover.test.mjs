import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { combat } from '../src/systems/combat.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { clearPhysicsBodyNativeFailure, markPhysicsBodyNativeFailure, physicsBodyNativeReady, queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
function fixture(t, { cover = true, extraRocks = 0, flight = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, ...(flight ? [flightV3] : []), physics, combat] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 64 };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; noteSwarmPilotAction(state);
  for (let i = 0; i < extraRocks; i++) sim.spawn({ type: 'asteroid',
    pos: { x: -1000 - i * 40, z: 1000 }, radius: 8, mass: 40, collides: true });
  const rock = cover ? sim.spawn({ type: 'asteroid', pos: { x: 45, z: 0 }, vel: { x: 0, z: 0 },
    radius: 12, mass: 50, hull: 100, collides: true, data: { swarmArenaDebris: true } }) : null;
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 64); engine.spawnWave(state);
  const b = engine._bodies;
  const turret = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === 'beam_turret');
  const mite = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === 'mite');
  assert.ok(turret >= 0 && mite >= 0, 'ordinary finite roster supplies both lives');
  for (let i = 0; i < b.alive.length; i++) if (i !== turret) b.alive[i] = 0;
  b.px[turret] = b.teleX[turret] = 0; b.pz[turret] = b.teleZ[turret] = 0;
  b.vx[turret] = b.vz[turret] = 0; b.timer[turret] = 0;
  const awards = [], kills = []; bus.on('run:awardRequested', p => awards.push(p));
  bus.on('swarm:broodKills', p => kills.push(p));
  const step = (n = 1) => { for (let i = 0; i < n; i++) { state.tick++; state.simTime += DT; engine.step(state); } };
  const arm = () => { for (let i = 0; i < 600 && !engine._machine().beams; i++) step();
    assert.equal(engine._machine().beams, 1); return engine._beams.alive.findIndex(Boolean); };
  const straight = () => { const beam = arm(); engine._beams.a0[beam] = engine._beams.a1[beam] = 0; return beam; };
  return { sim, state, bus, player, rock, engine, b, turret, mite, awards, kills, step, arm, straight };
}

test('real stone stops the damaging edge and publishes that same clipped reach', t => {
  const h = fixture(t), beam = h.straight(); h.step();
  assert.equal(h.player.hull, 100);
  assert.equal(h.engine._beams.range[beam], 130, 'authored range is not spent by cover');
  assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 28);
  assert.equal(h.rock.hull, 100); assert.equal(h.rock.alive, true);
  assert.deepEqual(h.awards, []);
});

test('the unclipped authored sweep still burns an exposed pilot once', t => {
  const h = fixture(t, { cover: false }); h.straight(); h.step(10);
  assert.equal(h.player.hull, 78); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 130);
});

test('cover protects the pack, but only beyond its first surface', t => {
  const h = fixture(t); h.straight();
  const b = h.b; b.alive[h.mite] = 1; b.px[h.mite] = 90; b.pz[h.mite] = 0;
  b.vx[h.mite] = b.vz[h.mite] = 0; h.step();
  assert.equal(b.alive[h.mite], 1); assert.deepEqual(h.awards, []);
  b.px[h.mite] = 15; b.pz[h.mite] = 0; b.vx[h.mite] = b.vz[h.mite] = 0; h.step();
  assert.equal(b.alive[h.mite], 0, 'the room weapon still cuts bodies before the stone');
  assert.equal(h.kills.reduce((n, p) => n + p.removedCount, 0), 1);
  assert.equal(h.kills.reduce((n, p) => n + p.count, 0), 0, 'the environmental death is not credited');
  assert.deepEqual(h.awards, [], 'unassisted room kills gain no new credit');
});

for (const [name, mutate] of [
  ['dead', h => { h.rock.alive = false; }],
  ['noncolliding', h => { h.rock.collides = false; }],
  ['body removed', h => { h.rock.physicsBody = false; }],
  ['sensor', h => { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.material = 'sensor'; h.rock.physicsBody.revision++; }],
  ['massline sensor', h => { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.material = 'massline_sensor'; h.rock.physicsBody.revision++; }],
  ['removed identity', h => { h.state.entities.delete(h.rock.id); }],
  ['not stone', h => { h.rock.type = 'fx'; }],
  ['invalid pose', h => { h.rock.pos.x = NaN; }],
]) test(`${name} cover cannot make the pilot safe`, t => {
  const h = fixture(t); h.straight(); mutate(h); h.step();
  assert.equal(h.player.hull, 78); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 130);
});

test('a fixed native stone is cover too', t => {
  const h = fixture(t); resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.dynamic = false; h.rock.physicsBody.revision++;
  h.straight(); h.step(); assert.equal(h.player.hull, 100);
});

test('cover uses the native body radius rather than the display or padded flock radius', t => {
  const h = fixture(t); resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.radius = 18; h.rock.physicsBody.revision++;
  h.straight(); h.step(); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 22);
});

test('the nearest real surface wins regardless of index order', t => {
  const h = fixture(t); h.sim.spawn({ type: 'asteroid', pos: { x: 25, z: 0 }, radius: 7, mass: 20, collides: true });
  h.straight(); h.step(); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 13);
});

test('cover beyond the old 64-rock movement cache still stops the actual beam', t => {
  const h = fixture(t, { extraRocks: 72 }); h.straight(); h.step();
  assert.equal(h.player.hull, 100); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 28);
});

test('moving the same rock out of the edge reopens its full reach without a new sweep', t => {
  const h = fixture(t); h.straight(); h.step(); assert.equal(h.player.hull, 100);
  h.rock.pos.z = 30; h.step(); assert.equal(h.player.hull, 78);
  assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 130);
  h.rock.pos.z = 0; h.step(); assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 28);
  assert.equal(h.player.hull, 78);
});

test('pause freezes the sweep and resume observes current physical cover', t => {
  const h = fixture(t); const beam = h.straight(); h.step(); const elapsed = h.engine._beams.t[beam];
  h.state.mode = 'pause'; h.rock.alive = false; h.step(60);
  assert.equal(h.player.hull, 100); assert.equal(h.engine._beams.t[beam], elapsed);
  h.state.mode = 'flight'; h.step(); assert.equal(h.player.hull, 78);
});

test('native registered turret sweep respects the original stone and its physical departure', async t => {
  for (const moveCover of [false, true]) {
    const h = fixture(t); assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);
    const original = h.rock; let sawSweep = false, clipped = false, started = false;
    const fromZ = h.rock.pos.z;
    for (let i = 0; i < 600; i++) {
      h.sim.step(DT);
      if (h.b.beamState[h.turret] === 1 && !started) {
        started = true;
        if (moveCover) queuePhysicsImpulse(h.rock, { x: 0, z: 6000 }, { cause: 'test_cover_departure' });
      }
      if (h.engine._machine().beams) {
        sawSweep = true;
        if (h.engine.view.beams.some(v => v.state === 1 && v.range < 100)) clipped = true;
      } else if (sawSweep) break;
    }
    assert.equal(sawSweep, true); assert.equal(h.state.entities.get(original.id), original);
    assert.equal(original.alive, true); assert.equal(h.b.alive[h.turret], 1);
    assert.equal(h.player.hull, moveCover ? 78 : 100);
    if (!moveCover) assert.equal(clipped, true);
    else assert.ok(Math.abs(original.pos.z - fromZ) > 20, `native stone travelled ${original.pos.z - fromZ}`);
    assert.deepEqual(h.awards, []);
    t.diagnostic(`Native ${moveCover ? 'departing' : 'held'} cover: same stone travelled ${Math.abs(original.pos.z - fromZ).toFixed(2)} WU; pilot hull ${h.player.hull}; unchanged one sweep and no awards.`);
  }
});

test('native pilot strafe and brake enter the stone shadow during the actual windup', async t => {
  for (const [takeCover, cover] of [[false, true], [true, true], [true, false]]) {
    const h = fixture(t, { flight: true, cover }); h.player.pos.z = 40;
    assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);
    const contacts = []; h.bus.on('physics:contact', p => contacts.push(p));
    let sawSweep = false, stopped = false, started = false;
    for (let i = 0; i < 600; i++) {
      if (takeCover && h.b.beamState[h.turret] === 1 && !stopped) {
        started = true; h.state.input.moveX = -1;
        if (h.player.pos.z < 30) { h.state.input.moveX = 0; h.state.input.brake = true; stopped = true; }
      }
      h.sim.step(DT);
      if (h.engine._machine().beams) sawSweep = true;
      else if (sawSweep) break;
    }
    assert.equal(sawSweep, true);
    assert.equal(h.player.hull, takeCover && cover ? 100 : 78, `hull ${h.player.hull} at ${h.player.pos.x},${h.player.pos.z}`);
    if (takeCover) { assert.equal(started, true); assert.equal(stopped, true); assert.ok(Math.abs(h.player.pos.z) < 18, `final ${h.player.pos.z}, velocity ${h.player.vel.z}`); }
    if (cover) { assert.equal(h.rock.pos.x, 45); assert.equal(h.rock.pos.z, 0); assert.equal(h.rock.alive, true); }
    assert.equal(contacts.length, 0);
    assert.deepEqual(h.awards, []);
    t.diagnostic(`Native ${takeCover ? (cover ? 'strafe/brake into cover' : 'same input without cover') : 'no-move control'}: pilot z40 -> ${h.player.pos.z.toFixed(2)}, hull ${h.player.hull}, contacts ${contacts.length}.`);
  }
});

for (const reason of ['turret death', 'run ended', 'fresh wave']) test(`${reason} cannot retain an old clipped edge`, t => {
  const h = fixture(t); h.straight(); h.step(); assert.ok(h.engine.view.beams.length);
  if (reason === 'turret death') h.engine._killDirectForTest(h.turret, 'collision');
  else if (reason === 'run ended') h.bus.emit('run:ended', {});
  else { h.engine.prepareWave(h.state.run, 64); h.engine.spawnWave(h.state); }
  assert.equal(h.engine._machine().beams, 0);
  assert.equal(h.engine.view.beams.length, 0);
});

test('a reused native identity cannot leave invisible cover at the retired position', t => {
  const h = fixture(t); h.straight(); h.step();
  const retired = h.rock;
  h.state.entities.set(retired.id, { ...retired, occupantGeneration: retired.occupantGeneration + 1,
    pos: { x: 200, z: 200 } });
  h.step(); assert.equal(h.player.hull, 78);
});

test('an unready type index fallback filters ordinary non-stone objects', t => {
  const h = fixture(t, { cover: false }); h.straight();
  h.state.entityIndex.ready = false;
  h.sim.spawn({ type: 'payload', pos: { x: 40, z: 0 }, radius: 20, mass: 200, collides: true });
  h.step(); assert.equal(h.player.hull, 78);
});

test('an edge starting inside physical stone has zero reach and cannot burn the pilot', t => {
  const h = fixture(t); h.straight(); h.rock.pos.x = 0; h.step();
  assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 0);
  assert.equal(h.player.hull, 100);
});

test('a current-life failed native replacement cannot make ghost cover', t => {
  const h = fixture(t); h.straight(); resolvePhysicsBodySpec(h.rock);
  markPhysicsBodyNativeFailure(h.rock, 'test-native-owner');
  assert.equal(physicsBodyNativeReady(h.rock), false);
  h.step(); assert.equal(h.player.hull, 78);
  assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 130);
});

test('the native owner can restore the same original cover with its matching recovery receipt', t => {
  const h = fixture(t); h.straight(); resolvePhysicsBodySpec(h.rock);
  const failure = markPhysicsBodyNativeFailure(h.rock, 'test-native-owner');
  clearPhysicsBodyNativeFailure(h.rock, 'foreign-owner', failure);
  assert.equal(physicsBodyNativeReady(h.rock), false);
  clearPhysicsBodyNativeFailure(h.rock, 'test-native-owner', failure);
  assert.equal(physicsBodyNativeReady(h.rock), true);
  h.step(); assert.equal(h.player.hull, 100);
  assert.equal(h.engine.view.beams.find(v => v.state === 1).range, 28);
});

test('an old native failure does not poison a fresh occupant life', t => {
  const h = fixture(t); h.straight(); resolvePhysicsBodySpec(h.rock);
  markPhysicsBodyNativeFailure(h.rock, 'test-native-owner'); h.rock.occupantGeneration++;
  assert.equal(physicsBodyNativeReady(h.rock), true);
  h.step(); assert.equal(h.player.hull, 100);
});
