import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { automation } from '../src/systems/automation.js';
import { environmentMaterials } from '../src/systems/environmentMaterials.js';
import { masslineImpacts } from '../src/systems/masslineImpacts.js';
import { syncMawWorksite, restoreMawWorksite, isMawWorksiteBody } from '../src/missions/mawWorksite.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { isBeamTargetEligible } from '../src/systems/miningBeamTargetingRead.js';
import { DRONES } from '../src/data/automation.js';
import { shipmentQty } from '../src/systems/cargoCustody.js';
import { buildMawWorksiteVisual, createVisualFactory } from '../src/render/visualFactory.js';

const DRONE = DRONES.find(row => row.id === 'drone_mk1');
function boot(updateOrder = []) {
  const sim = createSimulation({ seed: 819,
    systems: [environmentMaterials, masslineImpacts, missions, automation], updateOrder });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = 'sector_ceres_belt';
  s.player.credits = 10_000;
  const mission = { id: 'material-test:maw', type: 'tow_recovery', status: 'active',
    storyTag: 'campaign47a:b3:maw', destSectorId: s.world.currentSectorId,
    destStationId: 'station_ceres', needsTargets: true, targetEntityIds: [],
    params: { mawWorksiteVersion: 1, mawStunsNeeded: 3 } };
  s.missions.active.push(mission);
  const owner = sim.registry.get('missions');
  syncMawWorksite(owner, mission, sectorLocalToGlobalForSector);
  const body = slot => s.entities.get(mission.params.mawBodies[slot].entityId);
  return { sim, s, mission, owner, body, auto: sim.registry.get('automation') };
}
function queueFracture(f) {
  const original = f.body(0), impactor = f.body(2);
  impactor.pos = { x: original.pos.x - 30, z: original.pos.z };
  impactor.vel = { x: 120, z: 0 };
  f.sim.bus.emit('physics:impact', {
    aId: original.id, bId: impactor.id, preSolveClosingSpeed: 120,
  });
  f.sim.bus.flush();
  assert.equal(f.s.materialReactions.length, 1);
  return original;
}
function fractureOnly(f) {
  const original = queueFracture(f);
  f.sim.registry.get('environmentMaterials').update(SIM_DT, f.s);
  f.sim.bus.flush();
  const fragments = f.s.entityList.filter(e => e.alive && e.data?.materialFragment);
  assert.equal(original.alive, false);
  assert.equal(fragments.length, 4);
  return fragments;
}
function deploy(f, at) {
  const group = { id: 'material-test:drone', defId: DRONE.id, count: 1,
    oreType: 'cmdty_ore_iron', buffer: 0, bufferCap: 60, fuel: 240, fuelMax: 240,
    sectorId: f.s.world.currentSectorId, status: 'mining',
    originPos: { ...at.pos }, entityIds: [] };
  f.s.automation.drones.push(group);
  f.auto._spawnDroneEntities(group, DRONE);
  return group;
}
function mine(f, group, seconds = 2) {
  for (let tick = 0; tick < Math.round(seconds / SIM_DT); tick++) {
    f.s.simTime += SIM_DT;
    f.auto._updateDrones(SIM_DT, f.s.automation);
    f.sim.bus.flush();
  }
  return f.s.entities.get(group.entityIds[0]);
}
function ordinaryRock(f, pos) {
  return f.sim.spawn({ type: 'asteroid', pos, radius: 12, mass: 100,
    hull: 140, hullMax: 140, collides: true,
    data: { typeId: 'ast_rock', oreHP: 140, oreHPMax: 140 } });
}

test('actual fracture on the reconciliation tick loses the original Maw without adopting a shard', () => {
  const f = boot([environmentMaterials, masslineImpacts, missions]);
  try {
    const original = queueFracture(f);
    f.sim.step(SIM_DT);
    assert.equal(original.hull, 0);
    assert.equal(original.alive, false);
    assert.equal(f.mission.status, 'failed');
    assert.equal(f.s.missions.active.includes(f.mission), false);
    assert.equal(f.mission.params.mawBodies[0].entityId, original.id);
    assert.equal(f.mission.params.mawBodies[0].lost, true);
    assert.equal(f.mission.params.mawStuns, 0);
    assert.equal(f.s.player.credits, 10_000);
    assert.equal(f.s.entityList.filter(e => e.alive && e.data?.materialFragment).length, 4,
      'physical fragments survive the failed detail');
  } finally { f.sim.dispose(); }
});

test('cleared restore IDs cannot adopt or earn stuns from real material fragments', () => {
  const f = boot();
  try {
    const saved = JSON.parse(JSON.stringify(f.mission));
    const fragments = fractureOnly(f);
    restoreMawWorksite(saved);
    assert.equal(saved.params.mawBodies[0].entityId, undefined);
    saved.targetEntityIds = [];
    f.s.missions.active = [saved];
    syncMawWorksite(f.owner, saved, sectorLocalToGlobalForSector);
    const restored = f.s.entities.get(saved.params.mawBodies[0].entityId);
    assert.equal(restored.data.materialFragment, undefined);
    assert.equal(restored.radius, 24);
    assert.ok(fragments.every(e => e.alive), 'ordinary fragments are not deduplicated as objectives');
    const fragment = fragments[0];
    fragment.pos = { x: restored.pos.x + 300, z: restored.pos.z };
    fragment.vel = { x: 0, z: 0 };
    const pod = f.s.entities.get(saved.params.mawBodies[1].entityId);
    pod.pos = { x: fragment.pos.x - 25, z: fragment.pos.z };
    pod.vel = { x: 60, z: 0 };
    f.s.player.tether = { active: true, targetId: pod.id };
    f.sim.registry.get('masslineImpacts').update(SIM_DT, f.s);
    f.sim.bus.flush();
    assert.equal(saved.params.mawStuns, 0);
    assert.equal(pod.alive, true);
  } finally { f.sim.dispose(); }
});

test('Maw non-ore lineage remains beam protected after physical fracture', () => {
  const f = boot();
  try {
    assert.equal(isBeamTargetEligible(f.body(0), f.s), false);
    const fragments = fractureOnly(f);
    for (const fragment of fragments) {
      assert.equal(isMawWorksiteBody(fragment), true, 'non-ore identity includes material descendants');
      assert.equal(isBeamTargetEligible(fragment, f.s), false);
    }
    assert.equal(isBeamTargetEligible(ordinaryRock(f, { x: 0, z: 0 }), f.s), true);
  } finally { f.sim.dispose(); }
});

test('real fracture children select ordinary material geometry at their fragment size', () => {
  const f = boot();
  const previousDocument = globalThis.document;
  // CPU texture storage only; the real asteroid builder still selects and sizes geometry.
  globalThis.document ||= { createElement: () => ({ getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
  }) }) };
  try {
    const factory = createVisualFactory();
    assert.equal(factory.build(f.body(0)).name, 'SF_MawWorksite');
    for (const fragment of fractureOnly(f)) {
      const physicalRadius = fragment.physicsBody.radius;
      assert.equal(isMawWorksiteBody(fragment), true, 'non-ore lineage survives fracture');
      assert.ok(buildMawWorksiteVisual(fragment) === null, 'a fragment cannot build the whole Maw');
      const visual = factory.build(fragment);
      assert.ok(visual.userData.asteroidBody, 'the ordinary asteroid selector owns this fragment');
      assert.equal(visual.userData.mawWorksite, undefined);
      assert.equal(visual.userData.asteroidBody.scale.x, fragment.radius);
      assert.equal(fragment.physicsBody.radius, physicalRadius, 'visual admission cannot change physics');
      assert.equal(fragment.alive, true);
      assert.equal(isBeamTargetEligible(fragment, f.s), false);
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    f.sim.dispose();
  }
});

for (const kind of ['maw', 'fragment']) {
  test(`ordinary drone acquisition cannot extract or accrue ore from ${kind}`, () => {
    const f = boot();
    try {
      const target = kind === 'maw' ? f.body(0) : fractureOnly(f)[0];
      const before = target.hull;
      const group = deploy(f, target);
      const drone = mine(f, group);
      assert.equal(drone.data.targetAstId, null);
      assert.equal(group.buffer, 0);
      assert.equal(target.hull, before);
      if (kind === 'maw') assert.equal(target.data.oreHP, undefined);
    } finally { f.sim.dispose(); }
  });

  test(`retained drone ${kind} target is rejected without buffer credit and ordinary ore still mines`, () => {
    const f = boot();
    try {
      const target = kind === 'maw' ? f.body(0) : fractureOnly(f)[0];
      const before = target.hull;
      const group = deploy(f, target);
      const drone = f.s.entities.get(group.entityIds[0]);
      drone.data.targetAstId = target.id;
      mine(f, group);
      assert.equal(drone.data.targetAstId, null);
      assert.equal(group.buffer, 0);
      assert.equal(target.hull, before);
      const rock = ordinaryRock(f, { x: drone.pos.x + 35, z: drone.pos.z });
      mine(f, group);
      assert.equal(drone.data.targetAstId, rock.id);
      assert.ok(group.buffer > 1.59);
      assert.ok(rock.hull < 140);
      assert.equal(target.hull, before);
    } finally { f.sim.dispose(); }
  });

  test(`program-supplied ${kind} and direct extraction reject material without changing shipment`, () => {
    const f = boot();
    try {
      const target = kind === 'maw' ? f.body(0) : fractureOnly(f)[0];
      const before = structuredClone(target);
      const group = deploy(f, target);
      group._programMineCarry = 0.75;
      f.auto._programMineIntoCargo(group, DRONE, 2, target);
      assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 0);
      assert.equal(group._programMineCarry, 0.75);
      assert.deepEqual(structuredClone(target), before);
      assert.equal(f.auto._chipAsteroid(target, DRONE, 2), 0);
      assert.deepEqual(structuredClone(target), before);
      const rock = ordinaryRock(f, { x: target.pos.x + 150, z: target.pos.z });
      f.auto._programMineIntoCargo(group, DRONE, 2);
      assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 2);
      assert.ok(rock.hull < 140);
      assert.deepEqual(structuredClone(target), before);
    } finally { f.sim.dispose(); }
  });
}

