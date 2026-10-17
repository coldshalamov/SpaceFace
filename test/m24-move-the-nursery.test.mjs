import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { ALIEN_SITES, pointContaminationAt } from '../src/data/alienEcology.js';
import { materializeAlienEcology, tickAlienEcology, relocateAlienEcologySite,
  setRevelation } from '../src/systems/alienEcology.js';
import { veilNurseryMemory } from '../src/world/veilRayNursery.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

const site = ALIEN_SITES.veil_ray_nursery;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const copy = value => JSON.parse(JSON.stringify(value));

function fixture(saved = null) {
  const sim = createSimulation({ seed: 4242, systems: [spawnBudget, world, physics] });
  const state = sim.state, owner = sim.registry.get('world');
  state.mode = 'flight'; state.world.currentSectorId = site.sectorId;
  setRevelation(state, 2);
  if (saved) {
    owner.deserialize(copy(saved.world));
    state.tick = saved.tick; state.simTime = saved.simTime;
  }
  state.world.activeSector = { dressing: [], pois: [] };
  const center = owner._toGlobal(site.center, site.sectorId);
  const player = sim.spawn(makeShipEntitySpec('ship_hornet', { isPlayer: true,
    player: state.player, pos: { x: center.x + 220, z: center.z }, fittings: [] }));
  state.playerId = player.id;
  const materialize = () => materializeAlienEcology(owner, { id: site.sectorId }, state.world.activeSector, [site]);
  const adults = () => state.entityList.filter(e => e.alive !== false
    && e.data?.ecology?.siteId === site.siteId && !e.data.ecology.aggregate);
  const ribs = () => state.entityList.filter(e => e.alive !== false && Number.isInteger(e.data?.veilNurseryRib));
  const memory = () => veilNurseryMemory(state).relocation;
  const tick = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) {
    state.tick++; state.simTime = state.tick / 60; tickAlienEcology(owner, 1 / 60);
  } };
  const move = (x, z, duration) => sim.bus.emit('alienEcology:relocateSite', {
    siteId: site.siteId, center: { x, z }, duration,
  });
  const save = () => copy({ world: owner.serialize(), tick: state.tick, simTime: state.simTime });
  materialize();
  return { sim, state, owner, center, player, adults, ribs, memory, materialize, tick, move, save };
}

test('seed 4242: staged gentle substrate moves let the same animals re-home without towing them', async t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
  t.after(() => native.dispose());
  native.syncFromEntities(f.state.entityList);
  const ids = f.adults().map(e => e.id), ribIds = f.ribs().map(e => e.id);
  const anchors = f.adults().map(e => ({ ...e.data.ecology.anchor }));
  const ribPositions = f.ribs().map(e => ({ ...e.pos }));
  const positions = f.adults().map(e => ({ ...e.pos }));
  const beforeCredits = f.state.player.credits;
  for (let stage = 1; stage <= 10; stage++) {
    f.move(site.center.x + stage * 50, site.center.z, 10);
    if (stage === 1) {
      assert.deepEqual(f.adults().map(e => ({ ...e.pos })), positions, 'request does not move the animals');
      f.tick(0.5);
      assert.ok(Math.abs(f.ribs()[0].pos.x - ribPositions[0].x - 2.5) < 1e-6);
      for (let i = 0; i < f.adults().length; i++) {
        assert.ok(distance(f.adults()[i].pos, positions[i]) <= 34 * 0.5, 'ordinary fauna drive owns motion');
      }
      f.tick(9.5);
    } else f.tick(10);
    assert.equal(f.memory().status, 'settling');
    f.tick(30);
    assert.equal(f.memory().status, 'rehomed', `stage ${stage} settles on the moved shelter`);
    assert.equal(f.memory().scattered, false);
  }
  assert.deepEqual(f.adults().map(e => e.id), ids);
  assert.deepEqual(f.ribs().map(e => e.id), ribIds);
  assert.equal(f.memory().stages, 10);
  assert.deepEqual(f.memory().center, { x: site.center.x + 500, z: site.center.z });
  for (let i = 0; i < f.adults().length; i++) {
    const e = f.adults()[i];
    assert.ok(distance(e.data.ecology.anchor, { x: anchors[i].x + 500, z: anchors[i].z }) < 1e-6);
    assert.ok(distance(e.pos, e.data.ecology.anchor) <= 160, 'animal physically follows its relocated home');
    assert.ok(distance(e.pos, anchors[i]) > 300, 'animal left the old home');
  }
  native.syncFromEntities(f.state.entityList);
  for (let i = 0; i < f.ribs().length; i++) {
    const rib = f.ribs()[i];
    assert.ok(distance(rib.pos, { x: ribPositions[i].x + 500, z: ribPositions[i].z }) < 1e-6);
    assert.ok(distance(native.records.get(rib.id).body.translation(), rib.pos) < 0.1, 'real native solid moved too');
  }
  assert.equal(f.state.player.credits, beforeCredits, 'ecology does not invent a reward transaction');
});

test('seed 4242: a violent move scatters living animals and quiet time plus save/reload cannot undo it', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  const positions = f.adults().map(e => ({ ...e.pos }));
  f.move(site.center.x + 1500, site.center.z, 1);
  assert.equal(f.memory().status, 'scattered');
  assert.deepEqual(f.adults().map(e => ({ ...e.pos })), positions);
  f.tick(90);
  assert.equal(pointContaminationAt(f.state, site.sectorId, site.center.x + 1500, site.center.z), 0.02,
    'the existing nursery footprint follows the substrate without retuning its balance');
  assert.ok(pointContaminationAt(f.state, site.sectorId, site.center.x, site.center.z) > 0.02,
    'the old location no longer retains the nursery footprint');
  assert.equal(veilNurseryMemory(f.state).mode, 'QUIET', 'panic is bounded, loss of the nursery is persistent');
  assert.equal(f.adults().length, 3, 'scattering is not killing or respawning the animals');
  const homes = copy(f.memory().scatterAnchors);
  for (const e of f.adults()) {
    assert.ok(distance(e.data.ecology.anchor, f.owner._toGlobal(homes[e.data.ecology.faunaKey], site.sectorId)) < 1e-6);
    assert.ok(distance(e.pos, e.data.ecology.anchor) < 160, 'animals reach separate refuge homes');
  }
  const restored = fixture(f.save()); t.after(() => restored.sim.dispose());
  assert.deepEqual(restored.memory(), f.memory());
  restored.tick(40); restored.materialize();
  assert.equal(restored.memory().status, 'scattered');
  assert.deepEqual(restored.memory().scatterAnchors, homes);
  assert.equal(restored.adults().length, 3);
  for (const e of restored.adults()) {
    assert.ok(distance(e.pos, restored.owner._toGlobal(homes[e.data.ecology.faunaKey], site.sectorId)) < 160);
  }
  const flock = restored.state.entityList.find(e => e.data?.ecology?.aggregate);
  assert.ok(distance(flock.pos, restored.adults()[0].pos) < 2, 'juveniles shelter with a surviving adult, not the abandoned substrate');
});

test('seed 4242: world save/reload preserves in-flight substrate travel and the completed new home', t => {
  const f = fixture(); t.after(() => f.sim.dispose());
  f.move(site.center.x + 50, site.center.z + 20, 10); f.tick(4);
  const saved = f.save();
  const restored = fixture(saved); t.after(() => restored.sim.dispose());
  assert.deepEqual(restored.memory(), f.memory());
  const rib = restored.ribs()[0], originalRib = f.ribs()[0];
  assert.ok(distance(rib.pos, originalRib.pos) < 1e-6, 'reload materializes substrate at the saved current position');
  restored.tick(36); f.tick(36);
  assert.equal(restored.memory().status, 'rehomed');
  assert.deepEqual(restored.memory(), f.memory());
  const rehomed = fixture(restored.save()); t.after(() => rehomed.sim.dispose());
  const ids = rehomed.adults().map(e => e.id);
  assert.equal(rehomed.memory().status, 'rehomed');
  assert.deepEqual(rehomed.memory().center, { x: site.center.x + 50, z: site.center.z + 20 });
  rehomed.materialize(); rehomed.tick(1);
  assert.deepEqual(rehomed.adults().map(e => e.id), ids, 're-entry does not duplicate animals');
});

test('seed 4242: fast short moves and rushed stages scatter; invalid or duplicate requests do not move anything', t => {
  for (const rushed of [false, true]) {
    const f = fixture(); t.after(() => f.sim.dispose());
    if (rushed) {
      f.move(site.center.x + 50, site.center.z, 10); f.tick(11);
      assert.equal(f.memory().status, 'settling');
      f.move(site.center.x + 100, site.center.z, 10);
    } else f.move(site.center.x + 50, site.center.z, 1);
    assert.equal(f.memory().scattered, true);
  }
  const f = fixture(); t.after(() => f.sim.dispose());
  const before = f.ribs().map(e => ({ ...e.pos }));
  assert.equal(relocateAlienEcologySite(f.owner, { siteId: site.siteId,
    center: { x: NaN, z: 0 }, duration: 10 }).reason, 'invalid-move');
  assert.equal(f.memory(), undefined);
  assert.deepEqual(f.ribs().map(e => ({ ...e.pos })), before);
  f.move(site.center.x + 50, site.center.z, 10); f.tick(2);
  const progress = copy(f.memory());
  f.move(site.center.x + 50, site.center.z, 10);
  assert.deepEqual(f.memory(), progress, 'duplicate event does not restart travel');
  assert.equal(relocateAlienEcologySite(f.owner, { siteId: site.siteId,
    center: { x: site.center.x + 60, z: site.center.z }, duration: 10 }).reason, 'move-in-progress');
  assert.deepEqual(f.memory(), progress);
});

test('FIX2 M24 seed 4242: ordinary Massline input tows the substrate gently or scatters it when rushed', async t => {
  for (const speed of [5, 90]) {
    const f = fixture(); t.after(() => f.sim.dispose());
    const native = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic' });
    t.after(() => native.dispose());
    const rib = f.ribs().find(e => e.data.veilNurseryRib === 0);
    f.player.pos = { x: rib.pos.x + 150, z: rib.pos.z };
    native.syncFromEntities(f.state.entityList);
    assert.equal(native.records.get(rib.id).body.isDynamic(), true, 'the advertised tow point must move in production physics');
    for (let i = 0; i < 3; i++) {
      native.syncFromEntities(f.state.entityList);
      native.step(1 / 60, f.state.tick); f.tick(1 / 60);
    }
    assert.equal(f.memory(), undefined, 'native coordinate rounding alone is not a nursery move');
    const ids = f.adults().map(e => e.id), before = f.ribs().map(e => ({ ...e.pos }));
    const catalog = createCombatCatalog(), helpers = { ...f.sim.helpers, combatPhysics: native };
    ensureCombatState(f.state);
    const attachments = createAttachmentService({ state: f.state, catalog, helpers, bus: f.sim.bus });
    const kernel = { attachments, catalog: { attachments: catalog.attachments } };
    const tow = Object.create(tetherGameplay);
    const denied = [];
    f.sim.bus.on('tether:latchDenied', p => denied.push(p));
    tow.init({ state: f.state, bus: f.sim.bus, helpers, registry: { get: () => ({ kernel }) } });
    t.after(() => tow.destroy?.());
    f.state.player.targetId = rib.id;
    f.state.input.aimWorld = { ...rib.pos };
    f.state.input.aimIntentActive = true;
    f.state.spatialHash = { diagnostics: { activeBuckets: 1 }, queryRadius(x, z, radius, out) {
      for (const e of f.state.entityList) if (e.alive !== false && distance(e.pos, { x, z }) <= radius + e.radius) out.push(e);
    } };
    f.state.input.actions = { tetherFire: true, tetherCut: false, reelDelta: 0 };
    tow.update(1 / 60, f.state);
    f.state.input.actions = {};
    tow.update(1 / 60, f.state);
    assert.equal(f.state.player.tether.targetId, rib.id, `the ordinary latch control acquires the real substrate: ${JSON.stringify(denied)}`);
    assert.equal(f.state.player.tether.active, true);
    f.state.input.actions = {};
    let peakSpeed = 0;
    for (let i = 0; i < 420; i++) {
      native.records.get(f.player.id).body.setLinvel({ x: speed, y: 0, z: 0 }, true);
      native.syncFromEntities(f.state.entityList);
      native.step(1 / 60, f.state.tick);
      peakSpeed = Math.max(peakSpeed, Math.hypot(rib.vel.x, rib.vel.z));
      f.tick(1 / 60);
    }
    assert.ok(f.memory(), 'physical towing reaches the ecology relocation owner without a debug relocation event');
    assert.ok(distance(f.memory().center, site.center) > 20);
    assert.equal(f.memory().scattered, speed > 5, JSON.stringify({ peakSpeed, relocation: f.memory(), nursery: veilNurseryMemory(f.state).lastCause }));
    for (let i = 0; i < f.ribs().length; i++) {
      assert.ok(Math.abs((f.ribs()[i].pos.x - before[i].x)
        - (rib.pos.x - before[0].x)) < 0.1, 'all seven ribs follow the same real tow');
    }
    f.state.input.actions = { tetherCut: true };
    tow.update(1 / 60, f.state);
    f.tick(1 / 60);
    f.state.input.actions = {};
    tow.update(1 / 60, f.state);
    assert.equal(f.state.player.tether.active, false);
    native.records.get(rib.id).body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    native.step(1 / 60, f.state.tick); f.tick(35);
    assert.equal(f.memory().status, speed === 5 ? 'rehomed' : 'scattered');
    assert.deepEqual(f.adults().map(e => e.id), ids, 'the same living animals follow or flee');
  }
});
