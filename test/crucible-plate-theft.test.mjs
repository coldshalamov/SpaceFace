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
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.syncFromEntities(state.entityList); owner.step(1 / 60, 0);
  const kernel = createCombatKernel({ state, bus, helpers: { combatPhysics: createSg02CombatPhysicsPort(owner) } });
  const director = createPlateTheft({ state, bus, registry: { get: id => id === 'combat' ? { kernel } : null } });
  director.arm(plate);
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
  return { state, bus, receipts, plate, thief, kernel, director, step };
}

test('the warned tow uses the native constraint and physically moves the same bank', async t => {
  const h = await physicsFixture(t);
  h.step(119);
  assert.equal(h.director.diagnostics().links, 0, 'two-second response window');
  h.step(3);
  assert.equal(h.director.diagnostics().links, 1);
  assert.ok(Object.values(h.state.combat.attachments.byId).some(a => a.state === 'active'
    && a.ownerId === h.thief.id && a.targetId === h.plate.id));
  h.step(900, true);
  assert.ok(h.plate.pos.x >= 100, `native solver moved bank only ${h.plate.pos.x}`);
  assert.equal(h.director.diagnostics().status, 'stolen', JSON.stringify(h.director.diagnostics()));
  assert.equal(h.state.entities.get(h.plate.id), h.plate);
  assert.equal(h.plate.alive, true, 'the relocated bank remains usable geometry');
  assert.equal(h.receipts.filter(row => row.status === 'stolen').length, 1);
  assert.equal(h.state.run.score, 0, 'no invented kill or reward');
  h.director.clear('wave_cleared');
  assert.equal(h.receipts.filter(row => row.status === 'secured').length, 0);
});

test('severing the actual tow wins the intervention; an actor cannot instantly re-latch', async t => {
  const h = await physicsFixture(t); h.step(123);
  const link = Object.values(h.state.combat.attachments.byId).find(a => a.state === 'active');
  assert.ok(link);
  assert.equal(h.kernel.attachments.cut(link.id, h.thief.id, 'player_intervention').ok, true);
  h.step(180);
  assert.equal(h.director.diagnostics().links, 0);
  assert.equal(Object.values(h.state.combat.attachments.byId).filter(a => a.state === 'active').length, 0);
  h.director.clear('wave_cleared'); h.director.clear('wave_cleared');
  assert.equal(h.receipts.filter(row => row.status === 'secured').length, 1);
  assert.equal(h.state.entities.get(h.plate.id), h.plate);
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
    const plate = state.entities.get(first.plateId); plate.pos.x += 70;
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
