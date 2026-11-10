import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createReadModel, applySpawnInfos, applyAuxUpserts, applyAuxRemovals } from '../scripts/lib/simReadModel.mjs';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { addEnvironmentHeat, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import {
  deserializeAlienEcologyState,
  materializeAlienEcology,
  serializeAlienEcologyState,
} from '../src/systems/alienEcology.js';
import {
  captureClosedRefineryProps,
  reconcileClosedRefineryProps,
} from '../src/systems/closedRefineryProps.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

const site = ALIEN_SITES.closed_refinery;
const isCalcite = e => e.alive !== false && e.data?.siteId === site.siteId
  && ['calcified_collar', 'mineral_root'].includes(e.data.moduleId);

test('seed 4242: refinery calcite sleeps at boot, materializes through the worker, fractures, and retires', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, registry, runtime } = lane.host;
    const world = registry.get('world');
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true,
      pos: world._toGlobal({ x: 0, z: 0 }, site.sectorId) }));
    state.playerId = player.id;
    state.mode = 'flight';
    world.enterSector(site.sectorId, { continuous: true, noTeleport: true, placePlayer: false });
    let ackEnd = init.initRebuild?.end ?? 0, tick = 0;
    const model = createReadModel();
    const step = async () => {
      const reply = await lane.tick({ tick: ++tick, steps: 1, commands: [], ackEnd });
      ackEnd = reply.journalEnd;
      applySpawnInfos(model, reply.spawnInfos);
      applyAuxUpserts(model, reply.auxUpserts);
      applyAuxRemovals(model, reply.auxRemovals);
      return reply;
    };
    const bodies = () => state.entityList.filter(e => e.type === 'prop' && isCalcite(e));
    const rows = () => state.world.dressing.rows.filter(isCalcite);
    await step();
    const count = rows().length;
    assert.ok(count >= 2, 'the authored ring has collars and roots');
    assert.equal(bodies().length, 0, 'no calcite bodies at Ceres boot');
    world.relocatePlayerInSector(world._toGlobal({ x: site.center.x + 501, z: site.center.z }, site.sectorId));
    await step();
    assert.equal(bodies().length, 0, 'outside the 500 WU approach radius stays quiet');
    const dressingIds = rows().map(e => e.id);
    world.relocatePlayerInSector(world._toGlobal({ x: site.center.x + 499, z: site.center.z }, site.sectorId));
    await step();
    const live = bodies();
    assert.equal(live.length, count, 'approaching the refinery materializes every collar and mineral root');
    assert.equal(rows().length, 0, 'live bodies replace their dressing without visible twins');
    const vf = installVisualOverrides(createVisualFactory());
    for (const body of live) {
      assert.equal(body.collides, true);
      assert.equal(body.physicsBody.dynamic, true);
      const presented = model.entities.get(body.id);
      assert.ok(presented, 'the real worker spawn reaches the entity read model');
      assert.equal(presented.data.placeId, body.data.placeId);
      assert.equal(presented.data.moduleId, body.data.moduleId);
      assert.equal(presented.data.scale, body.data.scale);
      const mesh = vf.build(presented);
      let drawables = 0;
      mesh.traverse(o => { if (o.isMesh) drawables++; });
      assert.ok(drawables > 0 && mesh.visible !== false && !mesh.userData.visualBuildFailed,
        'transported props retain the existing collar/root geometry');
    }
    assert.ok(dressingIds.every(id => !model.aux.has(id)), 'worker retires the old dressing visuals');
    await step();
    assert.equal(bodies().length, count, 'remaining nearby does not duplicate bodies');
    const [heated, struck] = bodies();
    assert.equal(addEnvironmentHeat(state, heated, 41), true);
    assert.equal(queueEnvironmentImpact(state, struck, 59), false);
    await step();
    assert.equal(heated.alive, true, 'subthreshold heat leaves the collar or root whole');
    assert.equal(struck.alive, true, 'subthreshold impact leaves it whole');
    assert.equal(addEnvironmentHeat(state, heated, 1), true);
    assert.equal(queueEnvironmentImpact(state, struck, 60), true);
    await step();
    for (const body of [heated, struck]) {
      assert.equal(body.alive, false, 'the actual refinery body breaks');
      const shards = state.entityList.filter(e => e.alive !== false && e.data?.materialFragment
        && String(e.data.asteroidSlotId).startsWith(`${body.id}:shard:`));
      assert.equal(shards.length, 4, 'fracture releases four moving calcite shards');
      assert.ok(shards.every(e => e.data.material === 'calcite' && Math.hypot(e.vel.x, e.vel.z) > 40));
    }
    await step();
    world.relocatePlayerInSector(world._toGlobal({ x: site.center.x + 621, z: site.center.z }, site.sectorId));
    await step();
    assert.equal(bodies().length, 0, 'departure releases the remaining refinery bodies');
    assert.equal(rows().length, count - 2, 'broken growth does not return as intact dressing');
    world.relocatePlayerInSector(world._toGlobal({ x: site.center.x + 499, z: site.center.z }, site.sectorId));
    await step();
    assert.equal(bodies().length, count - 2, 'returning materializes only the unbroken growth');
    assert.equal(Object.keys(serializeAlienEcologyState(state).sites[site.siteId].brokenCalcite).length, 2,
      'the existing site aftermath save remembers the two broken props');
    world.enterSector('sector_helios_prime', { continuous: true, noTeleport: true, placePlayer: false });
    await step();
    assert.equal(bodies().length, 0, 'a sector departure also releases the refinery bodies');
    console.log(`calcite approach: boot=0, near=${count}, fractured=2, departed=0, returned=${count - 2}; worker geometry delivered`);
  } finally { lane.shutdown(); }
});

const CALCITE_PLACE = new Set(['alien_growth_calcified_collar', 'alien_growth_mineral_root']);

function refineryWorld(seed) {
  let nextId = 1;
  const state = {
    meta: { seed },
    simTime: 12,
    mode: 'flight',
    playerId: 1,
    player: {},
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: site.sectorId },
  };
  const player = { id: 1, alive: true, pos: { x: site.center.x, z: site.center.z }, data: {} };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    _toGlobal(pos) { return { x: pos.x, z: pos.z }; },
    helpers: {
      hash32,
      mulberry32,
      spawnEntity(spec) {
        const entity = {
          id: ++nextId,
          alive: true,
          hull: spec.hull,
          hullMax: spec.hullMax,
          pos: spec.pos ? { ...spec.pos } : { x: 0, z: 0 },
          rot: spec.rot || 0,
          radius: spec.radius,
          data: spec.data ? { ...spec.data } : {},
          flags: {},
        };
        state.entities.set(entity.id, entity);
        state.entityList.push(entity);
        return entity;
      },
      removeEntity(id) {
        const entity = state.entities.get(id);
        if (entity) entity.alive = false;
      },
    },
  };
  return world;
}

function calciteDressing(active) {
  return (active.dressing || []).filter((row) => CALCITE_PLACE.has(row.placeId));
}

test('broken calcite stays broken after the site is saved and continued', () => {
  const world = refineryWorld(4242);
  const active = { dressing: [] };
  materializeAlienEcology(world, { id: site.sectorId }, active, [site]);
  const grown = calciteDressing(active);
  assert.ok(grown.length >= 2, 'the refinery ring grows collars and roots');
  reconcileClosedRefineryProps(world);
  const bodies = world.state.entityList.filter((entity) => entity.alive !== false
    && entity.data && CALCITE_PLACE.has(`alien_growth_${entity.data.moduleId}`));
  assert.equal(bodies.length, grown.length, 'closing in promotes the calcite dressing to bodies');
  const broken = bodies.slice(0, 2);
  for (const body of broken) body.hull = 0;
  captureClosedRefineryProps(world.state);
  const saved = JSON.parse(JSON.stringify(serializeAlienEcologyState(world.state)));
  const brokenKeys = Object.keys(saved.sites[site.siteId].brokenCalcite || {}).sort();
  assert.equal(brokenKeys.length, 2);

  saved.sites[site.siteId].brokenCalcite.nope = true;
  saved.sites[site.siteId].brokenCalcite['99'] = true;
  saved.sites[site.siteId].brokenCalcite.bad = 'yes';

  const continued = { meta: { seed: 4242 }, simTime: 12, player: {}, entities: new Map(), entityList: [], world: {} };
  deserializeAlienEcologyState(continued, saved);
  const restored = continued.world.alienEcology.sites[site.siteId].brokenCalcite;
  assert.deepEqual(Object.keys(restored).sort(), brokenKeys);
  for (const key of brokenKeys) assert.equal(restored[key], true);

  const againWorld = refineryWorld(4242);
  againWorld.state.world.alienEcology = continued.world.alienEcology;
  const again = { dressing: [] };
  materializeAlienEcology(againWorld, { id: site.sectorId }, again, [site]);
  assert.equal(calciteDressing(again).length, grown.length - 2,
    'continue does not grow back the collars and roots that were already broken');
});
