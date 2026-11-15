import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { createRunState } from '../src/core/runState.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createPlateTheft, PLATE_THEFT, preparePlateTheftRoom } from '../src/systems/foundryPlateTheft.js';
import { survivalArena, planArenaInstall, dominantGate } from '../src/systems/survivalArena.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { gateBearing } from '../src/systems/waveMaterialization.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

function runFor(arenaId = 'helios_core', ruleset = 'scored', wave = 20) {
  return { ...createRunState({ kind: 'survival', ruleset, seed: 4242 }),
    arenaId, wave, phase: 'active' };
}

test('every authored course admits one contested native bank; other contracts remain untouched', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    const run = runFor(arena.id);
    const plan = planWave({ seed: 4242, arenaId: arena.id, wave: 20 });
    const install = planArenaInstall({ arenaId: arena.id, arenaPhase: plan.arenaPhase,
      ruleset: 'scored', wave: 20, seed: 4242, anchor: { x: 0, z: 0 }, laneGate: dominantGate(plan) });
    const before = (install.toys || []).length;
    const id = preparePlateTheftRoom(install, { run, plan, anchor: { x: 0, z: 0 }, bearing: gateBearing('n') });
    assert.ok(id, arena.id);
    const plate = install.toys.find(toy => toy.id === id);
    assert.equal(plate.dynamic, true);
    assert.equal(plate.mass, PLATE_THEFT.mass);
    assert.equal(install.toys.filter(toy => toy.propRole === 'contested_bank').length, 1);
    assert.ok(install.toys.length <= before + 1 && install.toys.length <= 12);
    // Re-reading the install preserves the object's identity and bounded count.
    assert.equal(preparePlateTheftRoom(install, { run, plan, anchor: { x: 0, z: 0 }, bearing: gateBearing('n') }), id);
    assert.equal(install.toys.find(toy => toy.id === id), plate);
  }
  for (const [ruleset, wave] of [['swarm', 20], ['endless', 20], ['foundry_block', 20], ['scored', 19], ['scored', 21]]) {
    const install = { toys: [] };
    assert.equal(preparePlateTheftRoom(install, { run: runFor('helios_core', ruleset, wave),
      plan: { systemEvent: { id: 'foundry_plate_theft' } }, anchor: { x: 0, z: 0 }, bearing: { x: 1, z: 0 } }), null);
    assert.deepEqual(install.toys, []);
  }
});

async function physicsFixture(t) {
  const state = createGameState(4242); state.run = runFor();
  const bus = createBus(), receipts = [];
  bus.on('survivalArena:plateTheft', p => receipts.push(p));
  const spawn = spec => {
    const e = makeEntity({ ...spec, id: state.nextEntityId++, occupantGeneration: state.nextEntityId });
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const plate = spawn({ type: 'station', radius: 24, mass: 96, hull: 10000, hullMax: 10000,
    pos: { x: 0, z: 0 }, physicsBody: { schemaVersion: 1, radius: 24, mass: 96,
      inertiaY: 1000, dynamic: true, ccd: false }, data: { roomKind: 'plate' } });
  const thief = spawn({ type: 'ship', team: 2, radius: 12, mass: 96, hull: 100, hullMax: 100,
    pos: { x: 220, z: 0 }, physicsBody: { schemaVersion: 1, radius: 12, mass: 96,
      inertiaY: 1000, dynamic: true, ccd: false },
    data: { lootTableId: 'pd_screen_escort', runCohort: 'survival', runWave: 20 } });
  const pilot = spawn({ type: 'ship', team: 0, radius: 12, mass: 80, hull: 100, hullMax: 100,
    pos: { x: -160, z: 0 }, physicsBody: { schemaVersion: 1, radius: 12, mass: 80,
      inertiaY: 1000, dynamic: true, ccd: false } });
  state.playerId = pilot.id;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.syncFromEntities(state.entityList); owner.step(1 / 60, 0);
  const kernel = createCombatKernel({ state, bus, helpers: { combatPhysics: createSg02CombatPhysicsPort(owner) } });
  const removed = [];
  const helpers = { removeEntity(id) { removed.push(id); state.entities.get(id).alive = false; return true; } };
  const director = createPlateTheft({ state, bus, helpers,
    registry: { get: id => id === 'combat' ? { kernel } : null } });
  const exit = { gate: { x: 260, z: 0 }, dir: { x: 1, z: 0 } };
  director.arm(plate, exit);
  t.after(() => { director.clear('destroy'); kernel.dispose(); owner.dispose(); });
  const step = (ticks, tow = false) => {
    for (let i = 0; i < ticks; i++) {
      state.tick++; state.simTime = state.tick / 60;
      director.update(1 / 60); kernel.prePhysics(1 / 60);
      if (tow) writePhysicsControl(thief, { mode: 'test_tow', source: 'test',
        force: { x: 900, y: 0, z: 0 }, maxSpeed: 24 });
      owner.step(1 / 60, state.tick); kernel.postPhysics(); bus.flush();
    }
  };
  return { state, bus, receipts, plate, thief, pilot, kernel, director, step, removed, exit, spawn };
}

const listenerCount = bus => [...bus._listeners.values()].reduce((sum, set) => sum + set.size, 0);

test('the warned tow drags the same bank out through the exit gate and the run loses it', async t => {
  const h = await physicsFixture(t);
  const listeners = listenerCount(h.bus);
  h.step(119);
  assert.equal(h.director.diagnostics().links, 0, 'two-second response window');
  h.step(3);
  assert.equal(h.director.diagnostics().links, 1);
  assert.ok(Object.values(h.state.combat.attachments.byId).some(a => a.state === 'active'
    && a.ownerId === h.thief.id && a.targetId === h.plate.id));
  assert.equal(h.thief.data.ai.activity.reason, 'vignette_motion:foundry_plate_tow', 'the captor heads for the gate');
  assert.ok(h.thief.data.ai.activity.anchor.x > h.exit.gate.x, 'its course runs out past the gate');
  for (let i = 0; i < 4000 && h.director.diagnostics().status !== 'stolen'; i++) h.step(1, true);
  const done = h.director.diagnostics();
  assert.equal(done.status, 'stolen', JSON.stringify({ done, x: h.plate.pos.x }));
  assert.ok(h.receipts.some(row => row.status === 'towing'), 'the tow reads before the loss');
  assert.ok(h.plate.pos.x - h.exit.gate.x >= PLATE_THEFT.exitClear + h.plate.radius,
    `the plate crossed out of the gate (${h.plate.pos.x})`);
  assert.deepEqual(h.removed, [h.plate.id], 'the ordinary removal seam takes the plate');
  assert.equal(h.plate.alive, false, 'gone for the run');
  assert.equal(done.links, 0);
  assert.equal(Object.values(h.state.combat.attachments.byId).filter(a => a.state === 'active').length, 0);
  assert.equal(h.thief.data.ai.activity, undefined, 'the escort goes back to its own fight');
  assert.equal(h.receipts.filter(row => row.status === 'stolen').length, 1);
  assert.equal(h.state.run.score, 0, 'no invented kill or reward');
  h.step(60, true);
  h.director.clear('wave_cleared');
  assert.equal(h.receipts.filter(row => row.status === 'secured').length, 0);
  assert.equal(h.receipts.filter(row => row.status === 'stolen').length, 1);
  assert.equal(listenerCount(h.bus), listeners, 'the tow-out subscribes nothing');
});

test('severing the actual tow wins the intervention; the kept bank is a slab the pilot can latch and throw', async t => {
  const h = await physicsFixture(t); h.step(123);
  const link = Object.values(h.state.combat.attachments.byId).find(a => a.state === 'active');
  assert.ok(link);
  assert.equal(h.kernel.attachments.cut(link.id, h.thief.id, 'player_intervention').ok, true);
  h.step(180);
  assert.equal(h.director.diagnostics().links, 0);
  assert.equal(h.thief.data.ai.activity, undefined, 'a cut line ends the tow-out order');
  assert.equal(Object.values(h.state.combat.attachments.byId).filter(a => a.state === 'active').length, 0);
  h.director.clear('wave_cleared'); h.director.clear('wave_cleared');
  assert.equal(h.receipts.filter(row => row.status === 'secured').length, 1);
  assert.equal(h.state.entities.get(h.plate.id), h.plate);
  assert.equal(h.plate.alive, true);
  assert.deepEqual(h.removed, []);
  // The kept bank: a 96-mass dynamic slab on the pilot's own Massline.
  assert.equal(isAttachable(h.plate, h.pilot.id, h.state), true);
  assert.equal(h.plate.physicsBody.dynamic, true);
  assert.equal(h.plate.physicsBody.mass, PLATE_THEFT.mass);
  const line = h.kernel.attachments.create({ defId: 'attachment_massline', ownerId: h.pilot.id,
    targetId: h.plate.id, sourceWorld: h.pilot.pos, targetWorld: h.plate.pos });
  assert.equal(line.ok, true, JSON.stringify(line));
  const before = h.plate.pos.x;
  const gap = () => Math.hypot(h.plate.pos.x - h.pilot.pos.x, h.plate.pos.z - h.pilot.pos.z);
  const startGap = gap();
  for (let i = 0; i < 240; i++) {
    h.kernel.attachments.reel(line.attachment.id, -1, h.plate.radius + h.pilot.radius + 8);
    h.step(1);
  }
  assert.ok(h.plate.pos.x < before - 20, `the pilot's line hauls the slab (${before} -> ${h.plate.pos.x})`);
  assert.ok(gap() < startGap - 20, `the slab comes in on the line (${startGap} -> ${gap()})`);
  assert.equal(h.kernel.attachments.get(line.attachment.id)?.state, 'active', 'the pilot holds it, ready to throw');
});

test('Retry arms a fresh bank; the stolen one never comes back', async t => {
  const h = await physicsFixture(t);
  h.step(122);
  for (let i = 0; i < 4000 && h.director.diagnostics().status !== 'stolen'; i++) h.step(1, true);
  assert.equal(h.director.diagnostics().status, 'stolen');
  h.state.run = { ...runFor(), retireToken: h.state.run.retireToken + 1 };
  const fresh = h.spawn({ type: 'station', radius: 24, mass: 96, hull: 10000, hullMax: 10000,
    pos: { x: 0, z: 40 }, physicsBody: { schemaVersion: 1, radius: 24, mass: 96,
      inertiaY: 1000, dynamic: true, ccd: false }, data: { roomKind: 'plate' } });
  h.director.arm(fresh, h.exit);
  const rearmed = h.director.diagnostics();
  assert.equal(rearmed.status, 'contested');
  assert.equal(rearmed.plateId, fresh.id);
  assert.equal(rearmed.links, 0);
  assert.equal(rearmed.towing, 0);
  assert.equal(h.plate.alive, false, 'the stolen plate stays gone');
  assert.equal(h.receipts.filter(row => row.status === 'stolen').length, 1);
});

test('missing or recycled bank identity is loss; paused preparation cannot spend the event', async t => {
  const h = await physicsFixture(t);
  h.state.run.phase = 'refit'; h.step(300);
  assert.equal(h.director.diagnostics().links, 0);
  h.state.run.phase = 'active';
  h.state.entities.set(h.plate.id, { ...h.plate, occupantGeneration: 999 });
  h.step(1); h.director.clear('wave_cleared');
  assert.equal(h.receipts.filter(row => row.status === 'lost').length, 1);
  assert.equal(h.receipts.filter(row => row.status === 'secured').length, 0);
});

test('synchronous run exit during a warning or physical attachment cannot leave a tow behind', async t => {
  const warning = await physicsFixture(t);
  warning.bus.on('survivalArena:plateTheft', receipt => {
    if (receipt.status === 'targeted') warning.director.clear('run_ended');
  });
  assert.doesNotThrow(() => warning.step(1));
  assert.equal(warning.director.diagnostics(), null);
  assert.equal(Object.values(warning.state.combat.attachments.byId).filter(a => a.state === 'active').length, 0);

  const attached = await physicsFixture(t);
  attached.bus.on('tether:attached', () => attached.director.clear('run_ended'));
  assert.doesNotThrow(() => attached.step(123));
  assert.equal(attached.director.diagnostics(), null);
  assert.equal(Object.values(attached.state.combat.attachments.byId).filter(a => a.state === 'active').length, 0);
});

test('the public arena consumer preserves a moved plate on replay and releases its own room', () => {
  const state = createGameState(4242); state.run = runFor();
  const bus = createBus();
  const helpers = { spawnEntity(spec) {
    const e = makeEntity({ ...spec, id: state.nextEntityId++ });
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const arena = Object.create(survivalArena); arena.init({ state, bus, helpers, registry: { get: () => null } });
  try {
    const plan = planWave({ seed: 4242, arenaId: 'helios_core', wave: 20 });
    bus.emit('run:wavePlanned', { wave: 20, plan });
    const first = arena.diagnostics().plateTheft;
    assert.ok(first);
    // The exit is the room's own marked arrival mouth, between its two gate posts.
    const posts = state.entityList.filter(e => e.alive !== false && e.data?.roomKind === 'gate');
    assert.equal(posts.length, 2);
    assert.ok(Math.abs(first.exit.gate.x - (posts[0].pos.x + posts[1].pos.x) / 2) < 1e-6);
    assert.ok(Math.abs(first.exit.gate.z - (posts[0].pos.z + posts[1].pos.z) / 2) < 1e-6);
    assert.ok(Math.abs(Math.hypot(first.exit.dir.x, first.exit.dir.z) - 1) < 1e-9);
    const plate = state.entities.get(first.plateId); plate.pos.x += 70;
    assert.equal(plate.physicsBody.dynamic, true, 'the bank the arena admits is a movable slab');
    assert.equal(plate.physicsBody.mass, PLATE_THEFT.mass);
    assert.equal(isAttachable(plate, null, state), true, 'the pilot can latch it');
    const count = state.entityList.length;
    bus.emit('run:wavePlanned', { wave: 20, plan });
    assert.equal(state.entityList.length, count);
    assert.equal(arena.diagnostics().plateTheft.plateId, plate.id);
    bus.emit('run:waveCleared', { wave: 20 });
    assert.equal(arena.diagnostics().plateTheft, null);
    assert.equal(plate.alive, false);
    state.run.phase = 'refit';
    bus.emit('run:wavePlanned', { wave: 20, plan });
    assert.equal(state.entityList.length, count, 'spent event cannot re-admit a bank during refit');
    state.run.phase = 'active';
    bus.emit('run:wavePlanned', { wave: 20, plan });
    assert.equal(state.entityList.length, count, 'same run cannot replay the spent event');
    state.run = { ...runFor(), retireToken: state.run.retireToken + 1 };
    bus.emit('run:wavePlanned', { wave: 20, plan });
    assert.ok(arena.diagnostics().plateTheft, 'a genuine new run may install its bank');
  } finally { arena.destroy(); }
});

test('re-init on the same bus leaves exactly one spawn listener, and destroy releases it', () => {
  const state = createGameState(4242); state.run = runFor();
  const bus = createBus();
  const helpers = { spawnEntity(spec) {
    const e = makeEntity({ ...spec, id: state.nextEntityId++ });
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  const liveSpawnListeners = () => bus._listeners.get('entity:spawned')?.size || 0;
  const ctx = () => ({ state, bus, helpers, registry: { get: () => null } });
  const arena = Object.create(survivalArena);
  const baseline = liveSpawnListeners();
  arena.init(ctx());
  try {
    const armed = liveSpawnListeners();
    arena.init(ctx());
    assert.equal(liveSpawnListeners(), armed,
      'init → destroy → init installs one spawn listener, not two');
    // A subsequent spawn is recorded once — one live subscription on the bus.
    let heard = 0;
    const off = bus.on('entity:spawned', () => { heard++; });
    bus.emit('entity:spawned', { entity: { alive: true, data: {} }, id: 99999 });
    off();
    assert.equal(heard, 1, 'one emit reaches one observer');
    arena.destroy();
    assert.equal(liveSpawnListeners(), baseline,
      'the arena destroy path releases the helper subscription');
  } finally { arena.destroy(); }
});

test('retired create and cleanup cannot cut a successor attachment with a recycled ID', async t => {
  const h = await physicsFixture(t);
  const service = h.kernel.attachments;
  let replacement, once = false;
  h.bus.on('tether:attached', payload => {
    if (once) return;
    once = true;
    h.director.clear('run_ended');
    service.cut(payload.attachmentId, h.thief.id, 'old_run_retires');
    h.state.run.retireToken++;
    h.state.combat.attachments.nextId = 1;
    replacement = service.create({ defId: PLATE_THEFT.attachmentDefId,
      ownerId: h.thief.id, targetId: h.plate.id, controllerId: h.thief.id });
  });
  h.step(123);
  assert.equal(replacement?.ok, true);
  assert.equal(replacement.attachment.state, 'active');
  assert.equal(service.get(replacement.attachment.id), replacement.attachment);
  assert.equal(h.director.diagnostics(), null);
  h.director.clear('destroy');
  assert.equal(replacement.attachment.state, 'active');
});
