import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { partitionUpdateSystems, updateQueueForThisStep } from '../src/core/catchupPolicy.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { createKesslerScale } from '../src/systems/kesslerScale.js';
import { kesslerPadPosition } from '../src/systems/kesslerScaleWorksite.js';
import { PRODUCTION_UPDATE_ORDER, PRODUCTION_INIT_ORDER, getSystemClock,
  validateSystemClockDeclarations, validateSystemModeDeclarations } from '../src/runtime/authoritativeSystemManifest.js';

// The powered deck is a library inside the field/impulse owner — not a registered
// per-tick system — and it acts only on pods the kesslerScale owner already recorded.
// The deck drag rides fields.update, so the real owner must be on.
FIELD_FLAGS.enabled = true;
const DT = 1 / 60;
function scene() {
  const s = createGameState(47), bus = createBus();
  s.tick = 1; s.mode = 'flight'; s.run = { kind: 'adventure' };
  s.world.currentSectorId = 'sector_tethys_junction';
  s.player.flags = { docked: false }; s.ui = {}; s.input = {};
  const pad = kesslerPadPosition();
  const pod = { id: 1, occupantGeneration: 1, type: 'payload', alive: true, hull: 100,
    hullMax: 100, collides: true, radius: 3, mass: 20, pos: { x: pad.x, z: pad.z },
    vel: { x: 30, z: 18 }, rot: 0, angVel: 0, data: { jettisonedCargo: true },
    physicsBody: { schemaVersion: 1, dynamic: true, ccd: true, shape: 'ball',
      radius: 3, mass: 20, inertiaY: 90, revision: 0 } };
  const player = { id: 7, occupantGeneration: 7, type: 'ship', alive: true, hull: 100,
    hullMax: 100, collides: true, radius: 10, mass: 30,
    pos: { x: pad.x - 400, z: pad.z - 400 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    data: {}, physicsBody: false };
  s.playerId = 7; s.entities = new Map([[1, pod], [7, player]]); s.entityList = [pod, player];
  s.combat = { entities: {} };
  const scale = createKesslerScale();
  scale.init({
    state: s, bus,
    helpers: {
      spawnEntity(spec) { const e = { ...spec, id: 40 + s.entityList.length, alive: true, occupantGeneration: 1 };
        s.entities.set(e.id, e); s.entityList.push(e); bus.emit('entity:spawned', { id: e.id, type: e.type, entity: e }); return e; },
      removeEntity(id) { const e = s.entities.get(id); if (e) e.alive = false; s.entities.delete(id); },
    },
    registry: { get: () => null },
  });
  fields.init({
    state: s, bus,
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
    registry: { get: (name) => (name === 'kesslerScale' ? scale : null) },
  });
  bus.emit('entity:spawned', { id: pod.id, type: pod.type, entity: pod });
  return { s, bus, pod, scale };
}

test('the deck drag rides the field owner before physics; it registers no clock of its own', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('fields'));
  assert.ok(!PRODUCTION_INIT_ORDER.includes('kesslerDeckDamping'));
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('kesslerDeckDamping'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('fields') < PRODUCTION_UPDATE_ORDER.indexOf('physics'),
    'fields update runs before physics');
  assert.equal(getSystemClock('fields'), 'table');
  assert.equal(getSystemClock('physics'), 'table');
  assert.equal(getSystemClock('kesslerScale'), 'calendar');
  assert.equal(getSystemClock('cargo'), 'near');
  assert.deepEqual(validateSystemClockDeclarations(), []);
  assert.deepEqual(validateSystemModeDeclarations(), []);
});

test('the recorded pod is damped inside one fixed tick and the impulse opposes real velocity', () => {
  const f = scene();
  assert.ok(f.scale._deckPods.has(f.pod.id), 'entity:spawned records the in-ring pod');
  fields.update(DT, f.s);
  const cmd = consumePhysicsCommand(f.pod);
  assert.ok(cmd?.impulses?.length, 'one queued impulse');
  const j = cmd.impulses[0];
  assert.ok(j.x * f.pod.vel.x + j.z * f.pod.vel.z < 0, 'opposes motion');
  fields.update(DT, f.s);
  assert.equal(consumePhysicsCommand(f.pod), null, 'one impulse per fixed tick');
});

test('only scale-recorded pods are touched — a foreign or drifting pod is never scanned', () => {
  const f = scene();
  f.scale._deckPods.clear();
  fields.update(DT, f.s);
  assert.equal(consumePhysicsCommand(f.pod), null, 'unrecorded pod is not damped');
  f.scale._deckPods.add(9999);
  f.s.tick++;
  fields.update(DT, f.s);
  assert.equal(consumePhysicsCommand(f.pod), null, 'stale id resolves to nothing');
});

test('mode, dock, venue, sector and restore gates fail closed through the real owner', () => {
  const changes = [s => { s.mode = 'menu'; }, s => { s.mode = 'swarm'; },
    s => { s.ui.docked = true; }, s => { s.player.flags.docked = true; },
    s => { s.save = { restoring: true }; }, s => { s.run.kind = 'survival'; },
    s => { s.physicsVenue = { active: true }; }, s => { s.world.currentSectorId = 'sector_ceres_belt'; }];
  for (const change of changes) {
    const f = scene(); change(f.s); f.s.tick++;
    fields.update(DT, f.s);
    assert.equal(consumePhysicsCommand(f.pod), null, String(change));
  }
});

// Focused native fixture: clock partitioning, deck impulses and the Rapier solve are
// the production owners — the pod's motion is the measured result, not Euler math.
async function nativeDeck(batch) {
  const f = scene(), native = await createSg02DynamicBodyOwner(), states = [];
  const systems = [
    { name: 'fields', update(dt) { fields.update(dt, f.s); } },
    { name: 'physics', update(dt) { native.syncFromEntities([f.pod]); native.step(dt, f.s.tick); } },
  ];
  const p = partitionUpdateSystems(systems);
  try {
    for (let i = 0; i < 180; i++) {
      f.s.tick = i + 1; f.s.simCatchupIndex = i % batch;
      for (const system of updateQueueForThisStep(p, f.s)) system.update(DT, f.s);
      assert.ok(Math.hypot(f.pod.vel.x, f.pod.vel.z) >= 0);
      states.push([f.pod.pos.x, f.pod.pos.z, f.pod.vel.x, f.pod.vel.z]);
    }
    assert.ok(Math.hypot(f.pod.vel.x, f.pod.vel.z) < 8,
      'the settled pod stops drifting below the desk read speed');
    assert.ok(Math.hypot(f.pod.pos.x - kesslerPadPosition().x,
      f.pod.pos.z - kesslerPadPosition().z) <= 90, 'the pod stayed on the plate');
    return states;
  } finally { native.dispose(); }
}

test('native deck motion is identical for one through four fixed steps per frame', async () => {
  const expected = await nativeDeck(1);
  for (const batch of [2, 3, 4]) assert.deepEqual(await nativeDeck(batch), expected);
});
