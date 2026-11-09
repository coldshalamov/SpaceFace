import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { recordImpulseProvenance, readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { combat } from '../src/systems/combat.js';
import { actions } from '../src/systems/actions.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { MASSLINE2_FLAGS, COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { TENDRIL_HEAD_LOOT_ID } from '../src/data/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { noteSwarmPilotAction, swarmPilotHasActed } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
function fixture(t, extra = [], acted = true) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, ...extra] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), wave: 6, phase: 'active' };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -500, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id; if (acted) noteSwarmPilotAction(state);
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 6); engine.spawnWave(state);
  const b = engine._bodies, slot = b.alive.findIndex(n => n === 1);
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) { b.px[i] = 10000; b.pz[i] = 10000; }
  b.family[slot] = b.liveFamilyId.indexOf('mite'); b.hp[slot] = 100;
  b.px[slot] = 0; b.pz[slot] = 0; b.vx[slot] = 0; b.vz[slot] = 0;
  const chunk = sim.spawn({ type: 'wreck', pos: { x: -40, z: 0 }, vel: { x: 4800, z: 0 }, radius: 16,
    mass: 110, hull: 320, hullMax: 320, collides: true, flags: { persistent: true },
    data: { swarmBossChunk: true, physicalRole: 'throw_mass', tetherable: true, masslineTetherable: true } });
  const kills = [], spent = [], awards = [];
  bus.on('swarm:broodKills', p => kills.push(p));
  bus.on('swarm:broodRemainsSpent', p => spent.push(p));
  bus.on('run:awardRequested', p => awards.push(p));
  function step() { state.tick++; state.simTime += DT; engine.step(state); }
  return { sim, state, bus, player, engine, b, slot, chunk, kills, spent, awards, step };
}
function prime(h) { h.step(); assert.equal(h.b.alive[h.slot], 1); }
function cross(h) { h.chunk.pos.x = 40; h.step(); }
const credited = h => h.kills.reduce((n, p) => n + p.count, 0);

test('fallen champion mass crosses the Brood between clear endpoints and remains reusable', t => {
  const h = fixture(t);
  recordImpulseProvenance(h.chunk, { tag: 'massline_throw', actorId: h.player.id, appliedTick: 0, magnitude: 528000 });
  prime(h); cross(h);
  assert.equal(h.b.alive[h.slot], 0); assert.equal(credited(h), 1);
  assert.equal(h.chunk.alive, true); assert.equal(h.spent.length, 0);
  h.engine.step(h.state); assert.equal(credited(h), 1);
  assert.deepEqual(h.awards, [{ reason: 'brood', wave: 6, credits: h.kills[0].credits, score: h.kills[0].score }]);
  assert.ok(h.awards[0].credits > 0 && h.awards[0].score > 0);
});

test('expired player provenance cannot turn a late chunk collision into score', t => {
  const h = fixture(t);
  recordImpulseProvenance(h.chunk, { tag: 'massline_throw', actorId: h.player.id, appliedTick: 0, magnitude: 528000 });
  h.state.tick = 500; h.state.simTime = 500 * DT;
  prime(h); cross(h); assert.equal(h.b.alive[h.slot], 0);
  assert.equal(credited(h), 0); assert.deepEqual(h.awards, []);
});

test('endpoint contact uses the existing collision family law', t => {
  const h = fixture(t); h.chunk.pos.x = 0; h.chunk.vel.x = 80;
  h.b.family[h.slot] = h.b.liveFamilyId.indexOf('keelback');
  h.step(); assert.equal(h.b.alive[h.slot], 0); assert.equal(h.kills[0].cause, 'collision');
});

test('unhandled champion scatter is environmental, not free pilot score', t => {
  const h = fixture(t); prime(h); cross(h);
  assert.equal(h.b.alive[h.slot], 0); assert.equal(credited(h), 0);
  assert.equal(h.kills.reduce((n, p) => n + p.environmentalCount, 0), 1);
  assert.deepEqual(h.awards, []);
});

for (const [name, mutate] of [
  ['ordinary wreck', h => { delete h.chunk.data.swarmBossChunk; }],
  ['wrong physical role', h => { h.chunk.data.physicalRole = 'cargo'; }],
  ['payload lookalike', h => { h.chunk.type = 'payload'; }],
  ['noncolliding', h => { h.chunk.collides = false; }],
  ['dead', h => { h.chunk.alive = false; }],
  ['static', h => { resolvePhysicsBodySpec(h.chunk); h.chunk.physicsBody.dynamic = false; h.chunk.physicsBody.revision++; }],
  ['sensor', h => { resolvePhysicsBodySpec(h.chunk); h.chunk.physicsBody.material = 'massline_sensor'; h.chunk.physicsBody.revision++; }],
  ['light', h => { resolvePhysicsBodySpec(h.chunk); h.chunk.physicsBody.mass = 20; h.chunk.physicsBody.revision++; }],
]) test(`${name} cannot acquire the fallen-champion plow`, t => {
  const h = fixture(t); mutate(h); prime(h); cross(h); assert.equal(h.b.alive[h.slot], 1);
});

for (const guard of ['first', 'gap', 'generation', 'replacement', 'teleport', 'new-wave'])
  test(`${guard} cannot invent a swept chunk path`, t => {
    const h = fixture(t); if (guard !== 'first') prime(h);
    if (guard === 'gap') h.state.tick += 2;
    if (guard === 'generation') h.chunk.occupantGeneration++;
    if (guard === 'replacement') {
      const old = h.chunk; old.alive = false;
      h.chunk = h.sim.spawn({ type: 'wreck', pos: { x: 40, z: 0 }, vel: { x: 4800, z: 0 }, radius: 16,
        mass: 110, hull: 320, collides: true, data: { ...old.data } });
    }
    if (guard === 'teleport') { h.chunk.pos.x = 200; h.chunk.vel.x = 0; h.step(); return assert.equal(h.b.alive[h.slot], 1); }
    if (guard === 'new-wave') {
      h.state.run.wave = 7; h.engine.prepareWave(h.state.run, 7); h.engine.spawnWave(h.state);
      h.slot = h.b.alive.findIndex(n => n === 1);
      for (let i = 0; i < h.b.alive.length; i++) if (h.b.alive[i]) { h.b.px[i] = 10000; h.b.pz[i] = 10000; }
      h.b.family[h.slot] = h.b.liveFamilyId.indexOf('mite'); h.b.px[h.slot] = 0; h.b.pz[h.slot] = 0;
    }
    cross(h); assert.equal(h.b.alive[h.slot], 1);
  });

test('near miss and slow contact do not become free area damage', t => {
  const h = fixture(t); h.chunk.pos.z = 24; prime(h); cross(h);
  assert.equal(h.b.alive[h.slot], 1);
  const slow = fixture(t); slow.chunk.pos.x = 0; slow.chunk.vel.x = 0; slow.step();
  assert.equal(slow.b.alive[slow.slot], 1); assert.equal(slow.b.hp[slow.slot], 100);
});

test('real linker shield still refuses a champion chunk', t => {
  const h = fixture(t), next = h.b.alive.findIndex((n, i) => n && i !== h.slot);
  h.b.family[next] = h.b.liveFamilyId.indexOf('shield_linker');
  h.b.px[next] = 0; h.b.pz[next] = 32; h.b.linkPartner[next] = h.slot;
  prime(h); assert.equal(h.b.shielded[h.slot], 1); cross(h);
  assert.equal(h.b.alive[h.slot], 1); assert.equal(h.chunk.alive, true);
});

test('single swept bellows touch cannot also count its endpoint as a second hit', t => {
  const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf('bellows');
  prime(h); h.chunk.pos.x = 0; h.step(); assert.equal(h.b.alive[h.slot], 1); assert.equal(h.kills.length, 0);
});

for (const ready of [true, false]) test(`index ready=${ready} uses one mass contact, never a terrain duplicate`, t => {
  const h = fixture(t); h.state.entityIndex.ready = ready;
  h.b.family[h.slot] = h.b.liveFamilyId.indexOf('bellows');
  prime(h); h.chunk.pos.x = 0; h.step();
  assert.equal(h.b.alive[h.slot], 1); assert.equal(h.kills.length, 0);
});

for (const ready of [true, false]) test(`index ready=${ready} keeps ordinary asteroids lethal and chunk contact out of terrain`, t => {
  const h = fixture(t); h.state.entityIndex.ready = ready;
  h.chunk.pos.x = 0; h.chunk.vel.x = 0; h.step();
  assert.equal(h.b.alive[h.slot], 1);
  h.sim.spawn({ type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 }, radius: 12,
    mass: 90, collides: true, data: {} });
  h.step(); assert.equal(h.b.alive[h.slot], 0);
});

for (const guard of ['pause', 'draft', 'protected']) test(`${guard} keeps the chunk from dealing player-credited damage`, t => {
  const h = fixture(t, [], guard !== 'protected'); prime(h);
  recordImpulseProvenance(h.chunk, { tag: 'massline_throw', actorId: h.player.id, appliedTick: h.state.tick, magnitude: 528000 });
  if (guard === 'pause') h.state.mode = 'pause';
  if (guard === 'draft') h.state.run.phase = 'draft';
  if (guard === 'protected') assert.equal(swarmPilotHasActed(h.state), false);
  h.chunk.pos.x = 0; h.step();
  assert.equal(credited(h), 0); assert.equal(h.b.alive[h.slot], 1);
});

test('boss chunks are not starved behind the persistent remains cache', t => {
  const h = fixture(t);
  for (let i = 0; i < 100; i++) h.sim.spawn({ type: 'payload', pos: { x: -3000, z: i * 10 },
    vel: { x: 0, z: 0 }, radius: 1, mass: 8, collides: true, data: { broodRemain: { kind: 'husk' } } });
  prime(h); cross(h); assert.equal(h.b.alive[h.slot], 0);
});

for (const stamp of [false, true]) test(`chunk admission=${stamp} preserves the last existing remain slot`, t => {
  const h = fixture(t); h.chunk.data.swarmBossChunk = stamp; h.chunk.pos.x = -3000; h.chunk.vel.x = 0;
  for (let i = 0; i < 94; i++) h.sim.spawn({ type: 'payload', pos: { x: -5000, z: i * 10 },
    vel: { x: 0, z: 0 }, radius: 1, mass: 8, collides: true, data: { broodRemain: { kind: 'husk' } } });
  const thrown = h.sim.spawn({ type: 'payload', pos: { x: 0, z: 0 }, vel: { x: 90, z: 0 },
    radius: 3, mass: 8, collides: true, data: { broodRemain: { kind: 'husk' } } });
  recordImpulseProvenance(thrown, { tag: 'massline_throw', actorId: h.player.id, appliedTick: 0, magnitude: 720 });
  h.step(); assert.equal(h.b.alive[h.slot], 0); assert.equal(credited(h), 1);
});

test('late live chunk path outranks eight earlier distant moving trophies', t => {
  const h = fixture(t); h.chunk.alive = false;
  for (let i = 0; i < 8; i++) h.sim.spawn({ type: 'wreck', pos: { x: -3000, z: i * 50 },
    vel: { x: 4800, z: 0 }, radius: 16, mass: 110, collides: true,
    data: { swarmBossChunk: true, physicalRole: 'throw_mass' } });
  h.chunk = h.sim.spawn({ type: 'wreck', pos: { x: -40, z: 0 }, vel: { x: 4800, z: 0 },
    radius: 16, mass: 110, collides: true, data: { swarmBossChunk: true, physicalRole: 'throw_mass' } });
  prime(h); cross(h); assert.equal(h.b.alive[h.slot], 0);
});

for (const kind of ['ordinary-remain', 'boss-chunk']) test(`${kind} still hits the Tendril after ordinary cells are gone`, t => {
  const h = fixture(t); h.chunk.alive = false;
  h.state.run.wave = 75; h.engine.prepareWave(h.state.run, 75); h.engine.spawnWave(h.state);
  noteSwarmPilotAction(h.state);
  h.sim.spawn({ type: 'ship', team: 1, pos: { x: 500, z: 500 }, vel: { x: 30, z: 0 },
    radius: 30, mass: 1000, hull: 1000, data: { lootTableId: TENDRIL_HEAD_LOOT_ID } });
  h.step(); const segments = h.engine._segs; assert.ok(segments.alive[0]);
  h.b.alive.fill(0); // Isolate the real spawned segment population; not an earned wave clear.
  h.sim.spawn({ type: kind === 'boss-chunk' ? 'wreck' : 'payload',
    pos: { x: segments.x[0], z: segments.z[0] }, vel: { x: 90, z: 0 }, radius: 16, mass: 110,
    hull: 320, collides: true, data: kind === 'boss-chunk'
      ? { swarmBossChunk: true, physicalRole: 'throw_mass' } : { broodRemain: { kind: 'husk' } } });
  h.step(); assert.equal(segments.alive[0], 0);
});

test('native capital death, manual throw cut and next-round mass contact use the original chunk', async t => {
  const flags = { enabled: MASSLINE2_FLAGS.enabled, throw: MASSLINE2_FLAGS.throw, tumble: MASSLINE2_FLAGS.tumble };
  MASSLINE2_FLAGS.enabled = true; MASSLINE2_FLAGS.throw = true; MASSLINE2_FLAGS.tumble = true;
  const tumbleFling = COMBAT_FLAGS.tumbleFling; COMBAT_FLAGS.tumbleFling = true;
  t.after(() => { COMBAT_FLAGS.tumbleFling = tumbleFling; });
  t.after(() => Object.assign(MASSLINE2_FLAGS, flags));
  const sim = createSimulation({ seed: 4242, systems: [actions, swarmArena, combat, physics,
    tetherGameplay, masslineThrow, tumbleStates, createProductionCapitalBossEncounters()] });
  t.after(() => sim.dispose()); const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.masslineReleaseAssist = 'off'; state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), wave: 5, phase: 'active' };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -150, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: {} }); state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, radius: 28, mass: 1000,
    hull: 1000, hullMax: 1000, collides: true, data: { scanLabel: 'Iron Maw', survivalWave: 5 } });
  const owner = sim.registry.get('capitalBossEncounters');
  owner.start({ encounterId: 'capital_boss_hulk', fightId: 'swarm:w5:iron_maw', bossId: boss.id, targetId: player.id });
  const hit = sim.registry.get('combat').onHit({ targetId: boss.id, ownerId: player.id,
    damage: 100000, damageType: 'kinetic', pos: { ...boss.pos } });
  assert.equal(hit.ok, true); assert.equal(boss.alive, false);
  const record = state.capitalBossEncounters.fights['swarm:w5:iron_maw'];
  assert.ok(record.swarmAmmoChunks.length >= 4);
  const chunks = record.swarmAmmoChunks.map(id => state.entities.get(id));
  const chunk = chunks.reduce((a, b) => Math.hypot(a.pos.x, a.pos.z) > Math.hypot(b.pos.x, b.pos.z) ? a : b);
  const initial = { x: chunk.pos.x, z: chunk.pos.z }, distance = Math.hypot(initial.x, initial.z);
  const ux = initial.x / distance, uz = initial.z / distance;
  state.run.wave = 6;
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 6); engine.spawnWave(state);
  const b = engine._bodies, slots = [];
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    if (slots.length < 3) {
      const ahead = 48 + slots.length * 30;
      b.family[i] = b.liveFamilyId.indexOf('keelback'); b.hp[i] = 100;
      b.px[i] = initial.x + ux * ahead; b.pz[i] = initial.z + uz * ahead;
      b.vx[i] = 0; b.vz[i] = 0; slots.push(i);
    } else { b.px[i] = 10000; b.pz[i] = 10000; }
  }
  noteSwarmPilotAction(state);
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const service = sim.registry.get('actions').kernel.attachments;
  const result = service.create({ defId: 'tether_standard', ownerId: player.id, targetId: chunk.id });
  assert.equal(result.ok, true, result.reason);
  state.player.tether = { active: true, targetId: chunk.id, attachmentId: result.attachment.id,
    restLength: Math.hypot(player.pos.x - chunk.pos.x, player.pos.z - chunk.pos.z), phase: 'slack' };
  // Controlled initial swing momentum; thereafter real native integration, release and collision.
  const mass = resolvePhysicsBodySpec(chunk).mass;
  queuePhysicsImpulse(chunk, { x: ux * mass * 90, y: 0, z: uz * mass * 90 }, { kind: 'test_loaded_swing' });
  sim.step(DT);
  const before = { ...chunk.vel }, kills = [], spent = [], awards = [];
  bus.on('swarm:broodKills', p => kills.push(p)); bus.on('swarm:broodRemainsSpent', p => spent.push(p));
  bus.on('run:awardRequested', p => awards.push(p));
  state.input.aimIntentActive = true; state.input.aimWorld = { x: b.px[slots[0]], z: b.pz[slots[0]] };
  state.input.actions = { throwArm: true };
  sim.registry.get('masslineThrow').update(DT, state);
  assert.equal(result.attachment.state, 'broken'); assert.equal(state.massline2.throw.lastThrow.cut.accepted, true);
  assert.deepEqual({ ...chunk.vel }, before); assert.deepEqual(state.massline2.throw.lastThrow.impulses, []);
  assert.equal(readRecentImpulseProvenance(chunk, state.tick)?.actorId, player.id);
  for (let i = 0; i < 180 && slots.some(slot => b.alive[slot]); i++) sim.step(DT);
  assert.equal(state.player.tether.active, false, 'credit does not rely on an unreconciled line mirror');
  assert.ok(Math.hypot(chunk.pos.x - initial.x, chunk.pos.z - initial.z) > 65);
  assert.deepEqual(slots.map(slot => b.alive[slot]), [0, 0, 0]);
  assert.equal(kills.filter(k => k.cause === 'collision').reduce((sum, k) => sum + k.count, 0), 3);
  assert.equal(chunk.alive, true); assert.equal(spent.length, 0);
  assert.deepEqual(awards.filter(a => a.reason === 'brood'), kills.filter(k => k.count > 0).map(k =>
    ({ reason: 'brood', wave: 6, credits: k.credits, score: k.score })));
  const paid = awards.length; engine.step(state); assert.equal(awards.length, paid);
  assert.deepEqual(record.swarmAmmoChunks, chunks.map(e => e.id));
  assert.equal(state.entities.get(chunk.id), chunk); assert.equal(chunk.flags.persistent, true);
  t.diagnostic(`Original chunk ${chunk.id}: ${mass.toFixed(2)}t, ${Math.hypot(chunk.pos.x - initial.x, chunk.pos.z - initial.z).toFixed(2)}WU travel, ${state.tick} ticks, three armored collision kills.`);
});

for (const [startZ, speedZ, shouldHit] of [[20.5, -180, false], [17.5, 180, true]])
  test(`matched observed target interval ${shouldHit ? 'keeps a genuine crossing' : 'refuses a future-only graze'}`, t => {
    const h = fixture(t); h.b.pz[h.slot] = startZ; h.b.vz[h.slot] = speedZ;
    const from = { x: h.b.px[h.slot], z: h.b.pz[h.slot] };
    prime(h); const to = { x: h.b.px[h.slot], z: h.b.pz[h.slot] };
    const dx = -40 - from.x, dz = -from.z;
    const mx = 80 - (to.x - from.x), mz = -(to.z - from.z);
    const at = Math.max(0, Math.min(1, -(dx * mx + dz * mz) / (mx * mx + mz * mz)));
    const separation = Math.hypot(dx + mx * at, dz + mz * at);
    const reach = resolvePhysicsBodySpec(h.chunk).radius + h.b.liveFamilyRadius[h.b.family[h.slot]];
    assert.equal(separation <= reach, shouldHit, 'actual matching interval establishes the control');
    cross(h); assert.equal(h.b.alive[h.slot], shouldHit ? 0 : 1);
  });

test('saturated relevance retains an observed hit ahead of eight future-only near misses', t => {
  const h = fixture(t); h.b.pz[h.slot] = 17.5; h.b.vz[h.slot] = 180;
  const misses = Array.from({ length: 8 }, () => h.sim.spawn({ type: 'wreck',
    pos: { x: -40, z: 40 }, vel: { x: 4800, z: 0 }, radius: 16, mass: 110, collides: true,
    data: { swarmBossChunk: true, physicalRole: 'throw_mass' } }));
  prime(h); for (const chunk of misses) chunk.pos.x = 40;
  cross(h); assert.equal(h.b.alive[h.slot], 0);
});

test('same-tick repeated endpoint cannot pop a Bellows from one chunk touch', t => {
  const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf('bellows');
  h.chunk.pos.x = 0; h.chunk.vel.x = 90; h.step();
  assert.equal(h.b.alive[h.slot], 1);
  h.engine.step(h.state); assert.equal(h.b.alive[h.slot], 1); assert.equal(h.awards.length, 0);
});

test('a replaced cell life cannot inherit a target path, but fresh observations recover', t => {
  const h = fixture(t); prime(h); h.b.serial[h.slot]++;
  cross(h); assert.equal(h.b.alive[h.slot], 1);
  h.chunk.vel.x = -4800; h.chunk.pos.x = -40; h.step();
  assert.equal(h.b.alive[h.slot], 0);
});

test('a teleported target cannot manufacture a plausible chunk crossing', t => {
  const h = fixture(t); h.chunk.pos.z = 80; prime(h);
  h.b.pz[h.slot] = 80; cross(h); assert.equal(h.b.alive[h.slot], 1);
});

test('canonical persistent restore keeps one chunk and starts observation afresh', async t => {
  const { save } = await import('../src/save/saveSystem.js');
  const before = fixture(t), after = fixture(t);
  prime(before); before.chunk.pos.x = 40;
  const rows = save._serializeEntities.call({ state: before.state }).persistent.filter(e => e.data?.swarmBossChunk);
  assert.equal(rows.length, 1);
  const owner = { state: after.state, helpers: after.sim.helpers };
  save._spawnPersistentEntities.call(owner, JSON.parse(JSON.stringify(rows)));
  save._spawnPersistentEntities.call(owner, JSON.parse(JSON.stringify(rows)));
  const chunks = after.state.entityList.filter(e => e.alive && e.data?.swarmBossChunk);
  assert.equal(chunks.length, 1); after.chunk = chunks[0];
  assert.notEqual(after.chunk, before.chunk); assert.equal(after.chunk.pos.x, 40);
  assert.equal(after.chunk.flags.persistent, true);
  after.step(); assert.equal(after.b.alive[after.slot], 1, 'restoration cannot replay pre-save travel');
  assert.deepEqual(after.awards, []);
  after.chunk.vel.x = -4800; after.chunk.pos.x = -40; after.step();
  assert.equal(after.b.alive[after.slot], 0, 'fresh real observations restore physical contact');
  assert.equal(credited(after), 0, 'saved momentum does not restore unsaved player provenance');
});

test('a death callback replacing the wave aborts old chunk contacts before the fresh cohort moves', t => {
  const h = fixture(t); let fresh = null;
  h.bus.on('swarm:broodRemains', () => {
    if (fresh) return;
    h.engine.prepareWave(h.state.run, 6); h.engine.spawnWave(h.state);
    const slot = h.b.alive.findIndex(n => n === 1);
    for (let i = 0; i < h.b.alive.length; i++) if (h.b.alive[i]) { h.b.px[i] = 10000; h.b.pz[i] = 10000; }
    h.b.family[slot] = h.b.liveFamilyId.indexOf('mite'); h.b.px[slot] = 0; h.b.pz[slot] = 0;
    h.b.vx[slot] = 0; h.b.vz[slot] = 0;
    fresh = { slot, life: h.b.serial[slot] };
  });
  h.chunk.pos.x = 0; h.chunk.vel.x = 90; h.step();
  assert.ok(fresh); assert.equal(h.b.serial[fresh.slot], fresh.life);
  assert.equal(h.b.alive[fresh.slot], 1); assert.equal(h.b.px[fresh.slot], 0);
  assert.equal(h.b.pz[fresh.slot], 0); assert.deepEqual(h.awards, []);
});

for (const [family, phase] of [['leecher', 4], ['wake_eel', 6], ['burrower', 5], ['burrower', 1]])
  test(`champion mass preserves ${family} physical exclusion in phase ${phase}`, t => {
    const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf(family);
    assert.ok(h.b.family[h.slot] >= 0); h.b.phase[h.slot] = phase;
    h.b.teleX[h.slot] = 0; h.b.teleZ[h.slot] = 0; h.b.timer[h.slot] = 10;
    h.chunk.pos.x = 0; h.chunk.vel.x = 90; h.step();
    assert.equal(h.b.alive[h.slot], 1); assert.deepEqual(h.awards, []);
  });

test('an exposed burrower takes the normal current mass contact', t => {
  const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf('burrower');
  h.b.phase[h.slot] = 0; h.chunk.pos.x = 0; h.chunk.vel.x = 90; h.step();
  assert.equal(h.b.alive[h.slot], 0);
});

test('an already-due Bellows fuse retains explosive ownership ahead of chunk contact', t => {
  const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf('bellows');
  h.chunk.pos.x = 0; h.chunk.vel.x = 90; h.step(); assert.equal(h.b.alive[h.slot], 1);
  h.state.simTime += 3; h.step(); assert.equal(h.b.alive[h.slot], 0);
  assert.equal(h.kills.at(-1).cause, 'explosive');
});

test('a newly exposed burrower cannot borrow its concealed interval for a swept hit', t => {
  const h = fixture(t); h.b.family[h.slot] = h.b.liveFamilyId.indexOf('burrower');
  h.b.phase[h.slot] = 5; h.b.teleX[h.slot] = 0; h.b.teleZ[h.slot] = 0;
  prime(h); h.b.phase[h.slot] = 0; cross(h);
  assert.equal(h.b.alive[h.slot], 1);
  h.chunk.pos.x = h.b.px[h.slot]; h.chunk.pos.z = h.b.pz[h.slot]; h.chunk.vel.x = 90; h.step();
  assert.equal(h.b.alive[h.slot], 0, 'a subsequent visible endpoint remains physical');
});
