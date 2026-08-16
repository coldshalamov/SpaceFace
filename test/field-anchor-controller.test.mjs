import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { snapshotSimState, canonicalStringify } from '../src/core/simSnapshot.js';
import { physics } from '../src/core/physics.js';
import { fields, activeFieldSnapshot } from '../src/systems/fields.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { FIELD_DEFS, FIELD_FLAGS, FIELD_PALETTE } from '../src/data/fields.js';

const SHAPE_ID = 'field_anchor_controller';
const SECTOR_ID = 'sector_ceres_belt';
const DT = 1 / 60;

function withFieldsEnabled(fn) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = previous;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = previous; });
  }
  FIELD_FLAGS.enabled = previous;
  return result;
}

function shipSpec(pos, data = {}, team = 0) {
  return {
    type: 'ship',
    team,
    factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 40,
    hull: 160,
    hullMax: 160,
    cap: 100,
    capMax: 100,
    collides: true,
    physicsBody: { schemaVersion: 1, radius: 12, mass: 40, inertiaY: 80, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data,
  };
}

function boot(seed = 7001, systems = [fields]) {
  const sim = createSimulation({ seed, bus: createBus(), systems });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 2;
  state.input.actions = {};
  const player = sim.spawn(shipSpec({ x: 0, z: 0 }, { ai: {}, intent: {} }, 0));
  state.playerId = player.id;
  return { sim, state, player, fieldsSys: sim.registry.get('fields'), director: sim.registry.get('encounterDirector'), saveSys: sim.registry.get('save') };
}

async function bootPhysics(seed = 7011) {
  const h = boot(seed, [fields, physics]);
  const physicsSys = h.sim.registry.get('physics');
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await physicsSys.prepareBackend(h.state), true, 'SG-02 backend initializes');
  h.cleanup = () => {
    if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority();
  };
  return h;
}

function spawnAnchor(sim, pos = { x: 0, z: 0 }) {
  return sim.spawn(makeEnemySpawnSpec('field_anchor_controller', 6, pos, { startedTick: sim.state?.tick || 0 }));
}

function spawnBody(sim, pos, vel = { x: 0, z: 0 }, mass = 28) {
  return sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    pos,
    vel,
    rot: 0,
    radius: 10,
    mass,
    hull: 120,
    hullMax: 120,
    cap: 100,
    capMax: 100,
    collides: true,
    physicsBody: { schemaVersion: 1, radius: 10, mass, inertiaY: 60, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
}

function runPastSpinup(sim, extraTicks = 10) {
  const ticks = FIELD_DEFS.anchorSnare.spinupTicks + extraTicks;
  for (let i = 0; i < ticks; i++) sim.step(DT);
}

test('seeded authored spawn produces one anchor controller plus escorts', () => {
  withFieldsEnabled(() => {
    const h = boot(7111, [fields, encounterDirector]);
    const result = h.director.requestAuthoredEncounter({
      shapeId: SHAPE_ID,
      encounterId: 'test:field-anchor-controller',
      sectorId: SECTOR_ID,
      anchor: { x: 420, z: -80 },
      zoneRadius: 520,
      force: true,
    });
    assert.equal(result.ok, true);
    const live = h.state.encounterDirector.live['test:field-anchor-controller'];
    assert.ok(live, 'encounter is live');
    const ships = live.ids.map((id) => h.state.entities.get(id)).filter(Boolean);
    assert.ok(ships.length >= 4 && ships.length <= 5, `spawned ${ships.length} ships`);
    const anchors = ships.filter((e) => e.data?.lootTableId === 'field_anchor_controller');
    assert.equal(anchors.length, 1, 'exactly one field anchor hull');
    assert.ok(anchors[0].data.fieldAnchor, 'anchor hull carries fieldAnchor record');
    assert.equal(anchors[0].data.fieldAnchor.presentationTag, 'hostile', 'anchor declares hostile field ownership');
    h.sim.step();
    const activeKernelField = activeFieldSnapshot(h.state).find((f) => f.sourceId === anchors[0].id);
    assert.ok(activeKernelField, 'field registered through shared owner');
    assert.equal(activeKernelField.tag, 'hostile', 'physics record retains hostile ownership');
    const activePresentation = h.state.fields.active.find((f) => f.id === activeKernelField.id);
    assert.equal(activePresentation.palette, FIELD_PALETTE.hostileSnare, 'hostile snare uses its amber force palette');
    assert.notEqual(activePresentation.palette, FIELD_PALETTE.well, 'hostile snare cannot read as the player Intake');
    assert.equal(ENCOUNTERS[SHAPE_ID].rare, true, 'shape is specialist rare');
  });
});

test('anchor snare alters a body trajectory through the shared field owner', async () => {
  await withFieldsEnabled(async () => {
    const h = await bootPhysics(7222);
    spawnAnchor(h.sim, { x: 0, z: 0 });
    const body = spawnBody(h.sim, { x: 145, z: 0 }, { x: 30, z: 0 }, 24);
    runPastSpinup(h.sim, 50);
    assert.ok(body.vel.x < 20, `snare drag slowed outbound velocity through physics, got ${body.vel.x}`);
    assert.ok(body.pos.x < 145 + 30 * (100 / 60), 'trajectory changed from free outbound travel');
    assert.ok(h.state.fields.telemetry.queries >= 1, 'field used bounded spatial query telemetry');
    h.cleanup();
  });
});

test('anchor death removes its field in the same simulation tick', () => {
  withFieldsEnabled(() => {
    const h = boot(7333, [fields]);
    const anchor = spawnAnchor(h.sim, { x: 0, z: 0 });
    h.sim.step();
    assert.equal(activeFieldSnapshot(h.state).length, 1);
    anchor.alive = false;
    h.sim.step();
    assert.equal(activeFieldSnapshot(h.state).length, 0, 'field snapshot cleared immediately');
    assert.equal(h.fieldsSys._kernel.size, 0, 'kernel unregistered the anchor field');
  });
});

test('anchor displacement moves the field with the hull record', () => {
  withFieldsEnabled(() => {
    const h = boot(7444, [fields]);
    const anchor = spawnAnchor(h.sim, { x: 10, z: -5 });
    h.sim.step();
    assert.deepEqual(activeFieldSnapshot(h.state)[0].center, { x: 10, z: -5 });
    anchor.pos.x = 180;
    anchor.pos.z = 70;
    h.sim.step();
    assert.deepEqual(activeFieldSnapshot(h.state)[0].center, { x: 180, z: 70 });
  });
});

test('two seeds replay byte-identical field-anchor outcomes', async () => {
  await withFieldsEnabled(async () => {
    async function run(seed) {
      const h = await bootPhysics(seed);
      spawnAnchor(h.sim, { x: 0, z: 0 });
      spawnBody(h.sim, { x: 150, z: 30 }, { x: 22, z: -5 }, 24);
      for (let i = 0; i < 120; i++) h.sim.step(DT);
      const text = canonicalStringify(snapshotSimState(h.state));
      h.cleanup();
      return text;
    }
    for (const seed of [7555, 7666]) {
      assert.equal(await run(seed), await run(seed), `seed ${seed} is byte-identical`);
    }
  });
});

test('save-style round trip rebuilds an anchor field from the hull record, not state.fields', () => {
  withFieldsEnabled(() => {
    const h = boot(7777, [fields, encounterDirector, save]);
    const result = h.director.requestAuthoredEncounter({
      shapeId: SHAPE_ID,
      encounterId: 'test:field-anchor-save',
      sectorId: SECTOR_ID,
      anchor: { x: 260, z: 40 },
      force: true,
    });
    assert.equal(result.ok, true);
    const live = h.state.encounterDirector.live['test:field-anchor-save'];
    const anchor = live.ids.map((id) => h.state.entities.get(id)).find((e) => e?.data?.lootTableId === 'field_anchor_controller');
    assert.ok(anchor, 'mid-encounter anchor exists');
    anchor.flags.persistent = true;
    const data = h.saveSys.serializeData();
    assert.equal(Object.hasOwn(data, 'fields'), false, 'field runtime is not serialized');
    const savedAnchor = data.entities.persistent.find((e) => e.data?.lootTableId === 'field_anchor_controller');
    assert.ok(savedAnchor?.data?.fieldAnchor, 'hull record carries fieldAnchor through save data');

    const restored = boot(7888, [fields]);
    restored.sim.spawn(savedAnchor);
    restored.sim.step();
    assert.equal(activeFieldSnapshot(restored.state).length, 1, 'spawned hull record registers field');
    restored.sim.bus.emit('save:loaded', {});
    restored.sim.step();
    assert.equal(activeFieldSnapshot(restored.state).length, 1, 'save:loaded rebuild preserves surviving anchor field');
  });
});
