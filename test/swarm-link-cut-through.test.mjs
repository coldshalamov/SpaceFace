import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { WEAPONS } from '../src/data/weapons.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { MASSLINE2_FLAGS, COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
function fixture(t, extra = [], acted = true) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, ...extra] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), wave: 55, phase: 'active' };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -500, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; if (acted) noteSwarmPilotAction(state);
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 55); engine.spawnWave(state);
  const b = engine._bodies;
  const linker = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === 'shield_linker');
  const target = b.alive.findIndex((n, i) => n && b.liveFamilyId[b.family[i]] === 'mite');
  assert.ok(linker >= 0 && target >= 0, 'ordinary late roster contains the pair');
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) { b.px[i] = 10000 + i * 100; b.pz[i] = 10000; }
  b.px[linker] = 0; b.pz[linker] = -30; b.px[target] = 0; b.pz[target] = 30;
  const rock = sim.spawn({ type: 'asteroid', pos: { x: -40, z: 0 }, vel: { x: 4800, z: 0 },
    radius: 4, mass: 24, hull: 100, collides: true, data: { swarmArenaDebris: true } });
  const awards = [], kills = []; bus.on('run:awardRequested', p => awards.push(p)); bus.on('swarm:broodKills', p => kills.push(p));
  const step = () => { state.tick++; state.simTime += DT; engine.step(state); };
  const prime = () => { step(); assert.equal(b.linkPartner[linker], target); assert.equal(b.shielded[target], 1); };
  const cross = () => { rock.pos.x = 40; step(); };
  return { sim, state, bus, player, engine, b, linker, target, rock, awards, kills, step, prime, cross };
}
function direct(h) {
  const shot = h.sim.spawn({ type: 'projectile', ownerId: h.player.id,
    pos: { x: h.b.px[h.target], z: h.b.pz[h.target] }, vel: { x: 100, z: 0 }, radius: 1, data: {} });
  return h.engine.commitProjectileHit({ kind: 'cell', slot: h.target, life: h.b.serial[h.target], wave: 55,
    x: h.b.px[h.target], z: h.b.pz[h.target] }, { projectileId: shot.id, ownerId: h.player.id, damage: 100 });
}

test('an ordinary rock cuts the visible beam and opens the charge to the next real hit', t => {
  const h = fixture(t); h.prime(); direct(h); assert.equal(h.b.alive[h.target], 1);
  h.rock.pos.x = 0; h.rock.vel.x = 80; h.step();
  assert.equal(h.b.linkPartner[h.linker], -1); assert.equal(h.b.shielded[h.target], 0);
  assert.equal(h.b.alive[h.linker], 1); assert.equal(h.b.alive[h.target], 1);
  assert.deepEqual(h.awards, [], 'breaking the beam itself pays nothing');
  direct(h, 2); assert.equal(h.b.alive[h.target], 0);
  assert.equal(h.kills.reduce((n, p) => n + p.count, 0), 1);
  assert.equal(h.rock.alive, true, 'the same rock stays in play');
});

test('a native-observed rock crosses between clear endpoints and drops the same shield', t => {
  const h = fixture(t); h.prime(); h.cross();
  assert.equal(h.b.linkPartner[h.linker], -1); assert.equal(h.b.shielded[h.target], 0);
  assert.deepEqual(h.awards, []);
});

test('observed fast travel still cuts after native braking at the far endpoint', t => {
  const h = fixture(t); h.prime(); h.rock.vel.x = 0; h.cross();
  assert.equal(h.b.linkPartner[h.linker], -1);
});

test('a thrown reusable remain also cuts between clear endpoints', t => {
  const h = fixture(t); h.rock.alive = false;
  const remain = h.sim.spawn({ type: 'payload', pos: { x: -40, z: 0 }, vel: { x: 4800, z: 0 },
    radius: 3, mass: 8, hull: 100, collides: true, data: { broodRemain: { kind: 'husk_shards' } } });
  h.prime(); remain.pos.x = 40; h.step();
  assert.equal(h.b.linkPartner[h.linker], -1); assert.equal(remain.alive, true);
});

for (const [name, mutate] of [
  ['noncolliding', h => { h.rock.collides = false; }],
  ['dead', h => { h.rock.alive = false; }],
  ['no native body', h => { h.rock.physicsBody = false; }],
  ['static', h => { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.dynamic = false; h.rock.physicsBody.revision++; }],
  ['sensor', h => { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.material = 'sensor'; h.rock.physicsBody.revision++; }],
  ['resting', h => { h.rock.vel.x = 0; }],
]) test(`${name} stone cannot cut merely by sitting across the link`, t => {
  const h = fixture(t); if (name === 'resting') h.rock.vel.x = 0; h.prime(); h.rock.pos.x = 0; mutate(h); h.step();
  assert.equal(h.b.linkPartner[h.linker], h.target); assert.equal(h.b.shielded[h.target], 1);
});

for (const guard of ['first-observation', 'tick-gap', 'generation', 'replacement', 'teleport', 'new-wave', 'new-link', 'new-target-life'])
  test(`${guard} cannot invent a swept beam cut`, t => {
    const h = fixture(t); if (guard !== 'first-observation') h.prime();
    if (guard === 'tick-gap') h.state.tick += 2;
    if (guard === 'generation') h.rock.occupantGeneration++;
    if (guard === 'replacement') {
      h.rock.alive = false;
      h.rock = h.sim.spawn({ type: 'asteroid', pos: { x: 40, z: 0 }, vel: { x: 4800, z: 0 }, radius: 4, mass: 24, collides: true });
    }
    if (guard === 'teleport') { h.rock.vel.x = 0; h.rock.pos.x = 400; h.step(); return assert.equal(h.b.shielded[h.target], 1); }
    if (guard === 'new-link') h.b.linkPartner[h.linker] = -1;
    if (guard === 'new-target-life') h.b.serial[h.target]++;
    if (guard === 'new-wave') {
      h.engine.prepareWave(h.state.run, 55); h.engine.spawnWave(h.state);
      for (let i = 0; i < h.b.alive.length; i++) if (h.b.alive[i]) { h.b.px[i] = 10000 + i * 100; h.b.pz[i] = 10000; }
      h.b.px[h.linker] = 0; h.b.pz[h.linker] = -30; h.b.px[h.target] = 0; h.b.pz[h.target] = 30;
    }
    h.cross(); assert.equal(h.b.shielded[h.target], 1);
  });

test('a near miss outside the actual stone skin does not borrow the padded terrain radius', t => {
  const h = fixture(t); h.prime();
  // Link length remains close to 60. Miss its upper endpoint by > radius + beam width.
  h.rock.pos.z = h.b.pz[h.target] + 5.15; h.cross();
  assert.equal(h.b.shielded[h.target], 1);
});

test('the same beam reforms only after its authored seven-second exposed window', t => {
  const h = fixture(t); h.prime(); h.cross(); h.rock.alive = false;
  const cutTime = h.state.simTime;
  h.state.simTime = cutTime + 6.8; h.step(); assert.equal(h.b.linkPartner[h.linker], -1);
  h.state.simTime = cutTime + 7; h.step(); assert.equal(h.b.linkPartner[h.linker], h.target);
});

test('a second untouched shield remains authoritative after the first beam is cut', t => {
  const h = fixture(t), second = h.b.alive.findIndex((n, i) => n && i !== h.linker
    && h.b.liveFamilyId[h.b.family[i]] === 'shield_linker');
  assert.ok(second >= 0); h.b.px[second] = 60; h.b.pz[second] = 30;
  h.prime(); assert.equal(h.b.linkPartner[second], h.target);
  h.cross(); assert.equal(h.b.linkPartner[h.linker], -1); assert.equal(h.b.linkPartner[second], h.target);
  assert.equal(h.b.shielded[h.target], 1); direct(h); assert.equal(h.b.alive[h.target], 1);
});

for (const [travel, cut] of [[80, false], [0, true]])
  test(`a moving link uses the matching interval, ${cut ? 'keeping contact' : 'rejecting a current-line-only crossing'}`, t => {
    const h = fixture(t);
    // Both beam endpoints travel together: the false case stays 40 WU ahead of the stone.
    h.b.vx[h.linker] = travel / DT; h.b.vx[h.target] = travel / DT;
    h.prime();
    h.b.px[h.linker] = travel; h.b.px[h.target] = travel;
    h.b.vx[h.linker] = travel / DT; h.b.vx[h.target] = travel / DT;
    h.rock.pos.x = 40;
    h.step(); assert.equal(h.b.linkPartner[h.linker] === -1, cut);
  });

test('native manual rock release cuts the beam, then an ordinary fired projectile finishes the exposed charge', async t => {
  const flags = { enabled: MASSLINE2_FLAGS.enabled, throw: MASSLINE2_FLAGS.throw, tumble: MASSLINE2_FLAGS.tumble };
  MASSLINE2_FLAGS.enabled = true; MASSLINE2_FLAGS.throw = true; MASSLINE2_FLAGS.tumble = true;
  const fling = COMBAT_FLAGS.tumbleFling; COMBAT_FLAGS.tumbleFling = true;
  t.after(() => { Object.assign(MASSLINE2_FLAGS, flags); COMBAT_FLAGS.tumbleFling = fling; });
  const h = fixture(t, [actions, combat, weapons, physics, tetherGameplay, masslineThrow, tumbleStates]);
  const { state, sim, b, rock, player } = h;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.masslineReleaseAssist = 'off'; state.render.sectorShellAdmission = false;
  player.pos.x = -150; player.pos.z = 30;
  rock.pos.x = -60; rock.vel.x = 0;
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const service = sim.registry.get('actions').kernel.attachments;
  const line = service.create({ defId: 'tether_standard', ownerId: player.id, targetId: rock.id });
  assert.equal(line.ok, true, line.reason);
  state.player.tether = { active: true, targetId: rock.id, attachmentId: line.attachment.id,
    restLength: Math.hypot(player.pos.x - rock.pos.x, player.pos.z - rock.pos.z), phase: 'slack' };
  // Authored encounter arrangement and loaded swing are controlled initial conditions.
  // Every subsequent position is integrated by the real native owners.
  queuePhysicsImpulse(rock, { x: resolvePhysicsBodySpec(rock).mass * 110, y: 0, z: 0 });
  sim.step(DT);
  assert.equal(b.shielded[h.target], 1); assert.equal(direct(h).killed, false);
  const before = { ...rock.vel };
  state.input.aimIntentActive = true; state.input.aimWorld = { x: 50, z: 0 };
  state.input.actions = { throwArm: true };
  sim.registry.get('masslineThrow').update(DT, state);
  assert.equal(line.attachment.state, 'broken');
  assert.equal(state.massline2.throw.lastThrow.cut.accepted, true);
  assert.deepEqual(state.massline2.throw.lastThrow.impulses, []); assert.deepEqual({ ...rock.vel }, before);
  assert.equal(readRecentImpulseProvenance(rock, state.tick)?.actorId, player.id);
  let cutTick = null;
  for (let i = 0; i < 120 && cutTick == null; i++) {
    sim.step(DT);
    if (b.linkPartner[h.linker] === -1) cutTick = state.tick;
  }
  assert.ok(cutTick != null, 'the freely flying rock must physically cross the actual live beam');
  assert.equal(b.shielded[h.target], 0); assert.equal(b.alive[h.target], 1);
  assert.equal(state.player.tether.active, false); assert.equal(rock.alive, true);
  assert.equal(h.awards.length, 0);
  const def = WEAPONS.find(w => w.id === 'wpn_concussion_cannon_m');
  const aim = Math.atan2(b.pz[h.target] - player.pos.z, b.px[h.target] - player.pos.x);
  const hits = []; h.bus.on('swarm:broodProjectileHit', p => hits.push(p));
  sim.registry.get('weapons')._spawnProjectile(player, { defId: def.id, slotIndex: 1,
    dmg: def.dmg, damageType: def.damageType, projSpeed: def.projSpeed, range: def.range }, def, aim, null, false, state, {});
  for (let i = 0; i < 90 && b.alive[h.target]; i++) sim.step(DT);
  assert.equal(b.alive[h.target], 0); assert.equal(b.alive[h.linker], 1);
  assert.ok(hits.some(p => p.killed && p.ownerId === player.id), 'real native projectile sweep, not a direct kill seam');
  assert.equal(h.kills.reduce((n, p) => n + p.count, 0), 1);
  assert.equal(h.awards.filter(p => p.reason === 'brood').length, 1);
  t.diagnostic(`Native throw cut at tick ${cutTick}; charge shot at tick ${state.tick}; rock travels ${(rock.pos.x + 60).toFixed(2)} WU, original rock retained, one credited kill.`);
});

for (const endpoint of [false, true]) test(`protected pilot cannot receive a ${endpoint ? 'current' : 'swept'} rock cut before acting`, t => {
  const h = fixture(t, [], false); h.prime(); h.rock.pos.x = endpoint ? 0 : 40; h.step();
  assert.equal(h.b.shielded[h.target], 1); assert.deepEqual(h.awards, []);
  noteSwarmPilotAction(h.state); h.rock.pos.x = 80; h.step();
  assert.equal(h.b.shielded[h.target], 1, 'first action cannot borrow protected travel');
  h.rock.pos.x = -40; h.rock.vel.x = -7200; h.step();
  assert.equal(h.b.shielded[h.target], 0, 'fresh post-action native observations restore the counter');
});

for (const type of ['ship', 'payload']) for (const guard of ['noncolliding', 'no body', 'sensor', 'static'])
  test(`${guard} ${type} cannot sever a shield at its current endpoint`, t => {
    const h = fixture(t); h.rock.alive = false; h.prime();
    const entity = h.sim.spawn({ type, pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
      radius: 4, mass: 24, collides: true, data: type === 'payload' ? { broodRemain: { kind: 'husk_shards' } } : {} });
    if (guard === 'noncolliding') entity.collides = false;
    if (guard === 'no body') entity.physicsBody = false;
    if (guard === 'sensor' || guard === 'static') {
      resolvePhysicsBodySpec(entity);
      if (guard === 'sensor') entity.physicsBody.material = 'massline_sensor';
      else entity.physicsBody.dynamic = false;
      entity.physicsBody.revision++;
    }
    h.step(); assert.equal(h.b.shielded[h.target], 1);
  });

for (const guard of ['ghost', 'sensor', 'resized', 'body-replaced'])
  test(`a previously ${guard} stone has no borrowed solid sweep`, t => {
    const h = fixture(t);
    if (guard === 'ghost') h.rock.physicsBody = false;
    if (guard === 'sensor') { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.material = 'sensor'; h.rock.physicsBody.revision++; }
    if (guard === 'resized') { resolvePhysicsBodySpec(h.rock); h.rock.physicsBody.radius = 1; h.rock.physicsBody.revision++; h.rock.pos.z = 34; }
    h.prime();
    if (guard === 'ghost') delete h.rock.physicsBody;
    if (guard === 'sensor') { h.rock.physicsBody.material = 'default'; h.rock.physicsBody.revision++; }
    if (guard === 'resized') { h.rock.physicsBody.radius = 10; h.rock.physicsBody.revision++; }
    if (guard === 'body-replaced') h.rock.physicsBody = { ...h.rock.physicsBody, revision: h.rock.physicsBody.revision + 1 };
    h.cross(); assert.equal(h.b.shielded[h.target], 1);
  });

test('pause and inactive phase do not retrospectively sever a beam on return', t => {
  const h = fixture(t); h.prime(); h.state.run.phase = 'draft'; h.rock.pos.x = 40; h.step();
  assert.equal(h.b.shielded[h.target], 1);
  h.state.run.phase = 'active'; h.rock.pos.x = 80; h.step();
  assert.equal(h.b.shielded[h.target], 1);
  h.rock.pos.x = -40; h.rock.vel.x = -7200; h.step(); assert.equal(h.b.shielded[h.target], 0);
});

for (const [kind, effect] of [
  ['leech_glue', { glueS: 3 }], ['acid_sac', { splashRadius: 10 }],
]) {
  test(`${kind} keeps its eligible current-endpoint beam contact`, t => {
    const h = fixture(t); h.rock.alive = false; h.prime();
    const mass = h.sim.spawn({ type: 'payload', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
      radius: 3, mass: 14, collides: true, data: { broodRemain: { kind, ...effect } } });
    h.step(); assert.equal(h.b.linkPartner[h.linker], -1); assert.equal(h.b.shielded[h.target], 0);
    assert.equal(mass.alive, true); assert.deepEqual(h.awards, []);
  });

  test(`${kind} does not gain a swept-only cut even in an unobstructed interval`, t => {
    const h = fixture(t); h.rock.alive = false;
    const mass = h.sim.spawn({ type: 'payload', pos: { x: -40, z: 0 }, vel: { x: 4800, z: 0 },
      radius: 3, mass: 14, collides: true, data: { broodRemain: { kind, ...effect } } });
    h.prime(); mass.pos.x = 40; h.step();
    assert.equal(h.b.linkPartner[h.linker], h.target); assert.equal(h.b.shielded[h.target], 1);
  });
}

