import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { ENVIRONMENT_FAMILIES, environmentMaterialOf } from '../src/data/environmentMaterials.js';
import { addEnvironmentHeat, environmentMaterials, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import { materializeAlienEcology } from '../src/systems/alienEcology.js';
import { world as worldSystem } from '../src/systems/world.js';
import { serializeResourceBodyBag, deserializeResourceBodyBag } from '../src/world/resourceBodyRecords.js';
import { hasExplicitAuthoredGeologyPresentation } from '../src/core/presentationAdmission.js';

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const owner = Object.create(environmentMaterials);
  owner.init(ctx);
  return { state, bus, helpers, owner };
}

function body(h, x, data) {
  return h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 30,
    hull: 600,
    hullMax: 600,
    collides: true,
    homeSectorId: 'sector_ceres_belt',
    data: {
      fieldId: 'calcite-test',
      asteroidSlotId: String(x),
      yieldU: 20,
      yieldRemainingU: 20,
      ...data,
    },
  });
}

function shardsFrom(state, parent) {
  const prefix = `${parent.data.asteroidSlotId}:shard:`;
  return state.entityList.filter((e) => e.alive !== false
    && e.data?.materialFragment === true
    && String(e.data.asteroidSlotId || '').startsWith(prefix));
}

test('seed 4242: calcite heat 42 and impact 60 each fracture into four moving shards', () => {
  const h = boot();
  const heated = body(h, 0, { material: 'calcite' });
  const struck = body(h, 400, { typeId: 'calcified_collar' });
  assert.equal(environmentMaterialOf(heated), 'calcite');
  assert.equal(environmentMaterialOf(struck), 'calcite');
  assert.equal(addEnvironmentHeat(h.state, heated, 42), true);
  assert.equal(queueEnvironmentImpact(h.state, struck, 60), true);
  h.owner.update(1 / 60);
  for (const parent of [heated, struck]) {
    assert.equal(parent.alive, false, 'the calcite body is gone');
    assert.equal(parent.data.fractured, true);
    assert.notEqual(parent.data.cooked, true, 'calcite cracks; it does not detonate');
    const shards = shardsFrom(h.state, parent);
    assert.equal(shards.length, 4, 'fracture leaves four shards');
    assert.ok(shards.every((e) => e.data.material === 'calcite'
      && e.data.materialName === 'Calcified residue'
      && e.data.tint === 0xd8d2c5
      && Math.hypot(e.vel.x, e.vel.z) > 40), 'each shard is calcified residue and still moving');
  }
  h.owner.destroy();
});

test('seed 4242: heat 41 and impact 59 leave calcite whole, and an anchored collar does not crack', () => {
  assert.deepEqual([...ENVIRONMENT_FAMILIES], ['rock', 'metal', 'crystal', 'volatile', 'debris', 'cryo']);
  const h = boot();
  const cool = body(h, 0, { material: 'calcite' });
  const glance = body(h, 400, { material: 'calcite' });
  const landmark = body(h, 800, { material: 'calcite', isLandmark: true, landmarkId: 'calcite-rib' });
  assert.equal(environmentMaterialOf(cool), 'calcite');
  assert.equal(environmentMaterialOf({ type: 'asteroid', data: { typeId: 'mineral_root' } }), 'rock',
    'a mineral root is calcite only when the site stamps it');
  assert.equal(addEnvironmentHeat(h.state, cool, 41), true);
  assert.equal(queueEnvironmentImpact(h.state, glance, 59), false);
  assert.equal(addEnvironmentHeat(h.state, landmark, 80), false);
  assert.equal(queueEnvironmentImpact(h.state, landmark, 120), false);
  h.owner.update(1 / 60);
  assert.equal(cool.alive, true);
  assert.equal(glance.alive, true);
  assert.equal(landmark.alive, true);
  assert.equal(h.state.materialReactions?.length || 0, 0);
  assert.equal(shardsFrom(h.state, cool).length, 0);
  h.owner.destroy();
});

test('seed 4242: a second heat or impact on reacted calcite queues no second fracture', () => {
  const h = boot();
  const rock = body(h, 0, { material: 'calcite' });
  assert.equal(environmentMaterialOf(rock), 'calcite');
  assert.equal(addEnvironmentHeat(h.state, rock, 42), true);
  assert.equal(h.state.materialReactions.length, 1);
  assert.equal(addEnvironmentHeat(h.state, rock, 42), true);
  assert.equal(queueEnvironmentImpact(h.state, rock, 60), true);
  assert.equal(h.state.materialReactions.length, 1, 'a pending calcite reaction is queued once');
  h.owner.update(1 / 60);
  assert.equal(shardsFrom(h.state, rock).length, 4);
  assert.equal(addEnvironmentHeat(h.state, rock, 42), false);
  assert.equal(queueEnvironmentImpact(h.state, rock, 60), false);
  assert.equal(h.state.materialReactions.length, 0);

  const held = body(h, 500, { material: 'calcite' });
  assert.equal(addEnvironmentHeat(h.state, held, 0), true);
  held.data.materialCondition.reacted = true;
  held.data.materialCondition.pending = false;
  const queued = h.state.materialReactions.length;
  assert.equal(addEnvironmentHeat(h.state, held, 42), true);
  assert.equal(queueEnvironmentImpact(h.state, held, 90), true);
  assert.equal(h.state.materialReactions.length, queued, 'an already-reacted calcite body queues nothing');
  h.owner.update(1 / 60);
  assert.equal(held.alive, true);
  assert.equal(shardsFrom(h.state, rock).length, 4);
  assert.equal(shardsFrom(h.state, held).length, 0);
  h.owner.destroy();
});

test('seed 4242: a severed site stamps calcite on calcified collars and mineral roots', () => {
  const site = ALIEN_SITES.closed_refinery;
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: site.sectorId, sectors: {} },
  };
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 3;
  ae.sites[site.siteId] = {
    state: 'severed',
    relaySevered: true,
    deadFauna: {},
    signals: [],
    beats: {},
    offersEmitted: {},
  };
  let next = 100;
  const active = { dressing: [], pois: [] };
  const world = {
    state,
    active,
    _toGlobal: (p) => ({ x: p.x, z: p.z }),
    bus: { emit() {} },
    helpers: {
      mulberry32,
      hash32,
      spawnEntity(spec) {
        const e = { ...spec, id: next++, alive: true, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity(id) {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
  };
  materializeAlienEcology(world, { id: site.sectorId }, active, [site]);
  const rows = [...(state.world.dressing?.rows || []), ...state.entityList]
    .filter((row) => row.data?.siteId === site.siteId && row.data?.alienEcology);
  const calcite = rows.filter((row) => row.data.moduleId === 'calcified_collar' || row.data.moduleId === 'mineral_root');
  const rest = rows.filter((row) => row.data.moduleId !== 'calcified_collar' && row.data.moduleId !== 'mineral_root');
  assert.ok(calcite.length >= 2, 'the dead palette places a collar and a mineral root');
  assert.ok(calcite.every((row) => row.data.material === 'calcite'), 'those props are stamped calcite');
  assert.ok(rest.length > 0 && rest.every((row) => row.data.material !== 'calcite'),
    'the rest of the dead palette stays unstamped');
});


test('seed 4242: actual Closed Refinery calcite cracks through heat and collision and stays broken after restore', () => {
  const site = ALIEN_SITES.closed_refinery;
  function materialize(h) {
    h.state.world.currentSectorId = site.sectorId;
    const ae = ensureAlienEcologyState(h.state);
    ae.revelation = 3;
    ae.sites[site.siteId] = { state: 'severed', relaySevered: true, deadFauna: {}, signals: [], beats: {}, offersEmitted: {} };
    const world = Object.assign(Object.create(worldSystem), {
      state: h.state, helpers: h.helpers, bus: h.bus,
      _toGlobal: (p) => ({ ...p }), active: { dressing: [], pois: [] },
    });
    h.owner.registry = { get: (name) => name === 'world' ? world : null };
    materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
    return [...h.state.entityList, ...(h.state.world.dressing?.rows || [])]
      .filter((e) => e.alive !== false && e.data?.siteId === site.siteId && e.data.material === 'calcite');
  }
  const h = boot();
  try {
    const calcite = materialize(h);
    assert.ok(calcite.length >= 4, 'the production dead palette includes breakable calcite');
    const [heated, struck, partial, landmark] = calcite;
    assert.equal(addEnvironmentHeat(h.state, heated, 42), true, 'actual refinery growth accepts heat');
    for (const e of calcite) {
      assert.equal(h.state.entities.get(e.id), e, 'each calcite piece is a live body');
      assert.equal(e.collides, true);
      assert.equal(e.physicsBody.dynamic, true);
      assert.equal(hasExplicitAuthoredGeologyPresentation(e), true, 'the body retains the authored growth visual');
    }
    landmark.data.isLandmark = true;
    assert.equal(addEnvironmentHeat(h.state, landmark, 100), false);
    assert.equal(queueEnvironmentImpact(h.state, landmark, 100), false);
    h.bus.emit('physics:impact', { aId: struck.id, bId: -1, preSolveClosingSpeed: 60 });
    assert.equal(addEnvironmentHeat(h.state, partial, 20), true);
    h.owner.update(1 / 60);
    for (const e of [heated, struck]) {
      assert.equal(e.alive, false, 'heat and actual collision intake both retire the growth');
      const shards = shardsFrom(h.state, e);
      assert.equal(shards.length, 4);
      assert.ok(shards.every((s) => Math.hypot(s.vel.x, s.vel.z) > 40));
      assert.ok(shards.every((s) => !hasExplicitAuthoredGeologyPresentation(s)), 'shards do not duplicate the whole growth visual');
    }
    assert.equal(landmark.alive, true, 'anchored landmarks remain immune');
    h.owner.serialize();
    const saved = JSON.parse(JSON.stringify(serializeResourceBodyBag(h.state.world.resourceBodies)));
    const restored = boot();
    try {
      restored.state.world.resourceBodies = deserializeResourceBodyBag(saved);
      const growth = materialize(restored);
      assert.ok(growth.every((e) => ![heated, struck].some((old) => old.data.asteroidSlotId === e.data.asteroidSlotId)),
        'broken pieces do not respawn after re-materialization from the save');
      const warm = growth.find((e) => e.data.asteroidSlotId === partial.data.asteroidSlotId);
      assert.ok(warm, 'an intact piece returns');
      assert.equal(warm.data.materialCondition.heat, 20, 'partial heat survives the save');
      addEnvironmentHeat(restored.state, warm, 22);
      restored.owner.update(1 / 60);
      assert.equal(warm.alive, false, 'restored partial heat contributes to the same fracture threshold');
    } finally { restored.owner.destroy(); }
  } finally { h.owner.destroy(); }
});
