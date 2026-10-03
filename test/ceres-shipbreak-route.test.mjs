import { setPresentationAdmission } from '../src/core/presentationAdmission.js';
import { shouldVirtualizeFarActor } from '../src/world/farActorTable.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { SECTORS } from '../src/data/sectors.js';
import { createSectorArranger, clearsKeepouts } from '../src/world/arranger.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { mining } from '../src/systems/mining.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { CERES_SHIPBREAK_MANIFEST as manifest, CERES_SHIPBREAK_SITE_ID as SITE_ID } from '../src/data/ceresShipbreak.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { expandProxyPrimitives, resolveCollisionProxyManifest, proxyScaleFor } from '../src/data/collisionProxyManifests.js';
const DT = 1/60;
function makeBus() {
  const handlers = new Map();
  return {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload || {});
    },
  };
}

function harness() {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 47 },
    rng: () => 0.5,
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    mode: 'flight',
    input: { fireGroup: 2, aimAngle: 0 },
    ui: { beamMode: 'auto', componentSelection: null },
    player: {
      credits: 900,
      reputation: { faction_scn: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
      miningBeam: { tierId: 'beam_industrial', dps: 40, range: 500 },
    },
    world: { currentSectorId: 'sector_ceres_belt' },
    content: { commodities: [] },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_player',
    pos: { x: 740, z: -620 },
    vel: { x: 0, z: 0 },
    radius: 10,
    flags: { docked: false },
    data: { miningBeam: state.player.miningBeam },
  };
  entities.set(player.id, player);
  entityList.push(player);
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  let siteSystem;
  const registry = { get(name) { return name === 'asteroidSites' ? siteSystem : null; } };
  siteSystem = Object.create(asteroidSites);
  siteSystem.init({ state, bus, helpers, registry });
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  const miningSystem = Object.create(mining);
  miningSystem.init({ state, bus, helpers, registry });
  return { state, bus, player, siteSystem, miningSystem, helpers };
}

function component(h, componentId) {
  return [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data && entity.data.worldSiteId === SITE_ID
    && entity.data.worldSiteComponentId === componentId);
}


function work(h, componentId, ticks) {
  const target = component(h, componentId);
  assert.ok(target, `normal site target ${componentId}`);
  h.player.pos = { x: target.pos.x, z: target.pos.z + (componentId.startsWith('keel') ? 90 : -90) };
  for (const body of siteBodies(h)) for (const box of aabbs(body)) {
    const dx = Math.max(box.x0-h.player.pos.x, 0, h.player.pos.x-box.x1);
    const dz = Math.max(box.z0-h.player.pos.z, 0, h.player.pos.z-box.z1);
    assert.ok(Math.hypot(dx,dz) > h.player.radius, 'work approach stays outside real hull geometry');
  }
  h.state.player.targetId = target.id;
  h.miningSystem._stopBeam();
  h.state.input.actions = { mine: true, siteBeam: true };
  h.state.ui.componentSelection = null;
  for (let n=0;n<ticks;n++) {
    h.state.tick++; h.state.simTime += DT;
    h.miningSystem._runPlayerBeam(h.player, { dps:18, range:180, directToCargo:false }, DT, h.state);
  }
  return target;
}
function siteBodies(h) { return [...h.state.entities.values()].filter(e => e.alive && e.data.worldSiteId === SITE_ID && e.physicsBody); }
function aabbs(entity) {
  const proxy=resolveCollisionProxyManifest(entity), scale=proxyScaleFor(entity,proxy);
  return expandProxyPrimitives(proxy).map(p=>({x0:entity.pos.x+(p.x-p.hx)*scale,x1:entity.pos.x+(p.x+p.hx)*scale,z0:entity.pos.z+(p.z-p.hz)*scale,z1:entity.pos.z+(p.z+p.hz)*scale}));
}
test('Ceres normal producer owns three finite matched masses without disturbing Cathedral', () => {
  assert.equal(worldSiteManifestById(SITE_ID), manifest);
  const h=harness();
  assert.equal(siteBodies(h).length,8, 'five shell bodies plus three finite sections');
  assert.ok(h.siteSystem.getWorldSite('world_site_wreck_cathedral'));
  for (const p of manifest.payloads) assert.ok(component(h,p.componentId));
  const bodies=siteBodies(h);
  for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)for(const a of aabbs(bodies[i]))for(const b of aabbs(bodies[j])) {
    const overlapX=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0), overlapZ=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0);
    assert.ok(overlapX<=1e-7 || overlapZ<=1e-7,`${bodies[i].data.worldRecordId} overlaps ${bodies[j].data.worldRecordId}`);
  }
});

test('Mk1 brace/cut/release through mining preserves body and has no uncommanded release kick',async()=>{
  const h=harness(),section=component(h,'long_plate'), pose={...section.pos};
  const owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT});
  try {
    work(h,'long_plate_clamp',81);
    assert.equal(section.data.worldSiteStructuralSupported,true);
    work(h,'long_plate',181);
    assert.equal(section.data.worldSiteStructuralAttached,false);
    assert.equal(section.physicsBody.dynamic,false);
    assert.strictEqual(component(h,'long_plate'),section);
    owner.syncFromEntities(siteBodies(h)); owner.step(DT);
    work(h,'long_plate_clamp',61);
    assert.equal(section.physicsBody.dynamic,true);
    owner.syncFromEntities(siteBodies(h));
    for(let i=0;i<120;i++)owner.step(DT);
    assert.ok(Math.hypot(section.pos.x-pose.x,section.pos.z-pose.z)<0.02,'matched cut creates no overlap kick');
    assert.ok(Math.hypot(section.vel.x,section.vel.z)<0.02);
    queuePhysicsImpulse(section,{x:0,z:-section.mass*65},{source:'ceres-tow-proof'});
    for(let i=0;i<240;i++)owner.step(DT);
    assert.ok(section.pos.z<pose.z-190,'physical tow clears tab and shell faces');
    assert.strictEqual(component(h,'long_plate'),section);
    const snapshot=h.siteSystem.serialize();
    h.bus.emit('sector:exit',{sectorId:'sector_ceres_belt'});
    h.siteSystem.deserialize(JSON.parse(JSON.stringify(snapshot)));
    h.bus.emit('sector:enter',{sectorId:'sector_ceres_belt'});
    const restored=component(h,'long_plate');
    assert.notEqual(restored.id,section.id);
    assert.equal(restored.data.worldRecordId,section.data.worldRecordId);
    assert.deepEqual(restored.pos,section.pos);
    assert.deepEqual(restored.vel,section.vel);
    assert.ok(Math.abs(restored.rot-section.rot)<1e-12);
    assert.ok(Math.abs(restored.angVel-section.angVel)<1e-12);
    assert.equal(restored.physicsBody.dynamic,true);
    assert.equal([...h.state.entities.values()].filter(e=>e.alive&&e.data.worldSiteStructural).length,3);
  } finally {owner.dispose();}
});


test('normal Ceres world generation reserves authored structure and approach without lowering field counts',()=>{
  const sector=SECTORS.find(s=>s.id==='sector_ceres_belt');
  const poi=sector.pois.find(p=>p.id===SITE_ID);
  assert.equal(poi.runtimeOwner,'asteroidSites');
  const arranger=createSectorArranger(sector,{origin:sectorGlobalOrigin(sector.id)});
  const reservation=arranger.keepouts.find(p=>p.id===SITE_ID);
  assert.ok(reservation);assert.ok(reservation.radius>=260);
  assert.deepEqual(reservation.center,manifest.placement.pos);
  assert.equal(clearsKeepouts(manifest.placement.pos,16,[reservation]),false);
  assert.equal(clearsKeepouts(manifest.mapAnnotation.coursePos,16,[reservation]),false);
});


for (const id of ['long_plate', 'crossbeam', 'keel']) {
  test(`normal-owner extraction and Continue preserve independent ${id}`, async () => {
    const h = harness(), section = component(h, id), start = { ...section.pos };
    const sign = id === 'keel' ? 1 : -1;
    work(h, `${id}_clamp`, 81); work(h, id, 181); work(h, `${id}_clamp`, 61);
    assert.equal(section.physicsBody.dynamic, true);
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      owner.syncFromEntities(siteBodies(h));
      for (let n = 0; n < 120; n++) owner.step(DT);
      assert.ok(Math.hypot(section.pos.x-start.x, section.pos.z-start.z) < 0.02);
      queuePhysicsImpulse(section, { x: 0, z: sign*section.mass*65 }, { source: 'ceres-route-test' });
      for (let n = 0; n < 240; n++) owner.step(DT);
      assert.ok(sign*(section.pos.z-start.z) > 190);
      const snapshot = h.siteSystem.serialize();
      h.bus.emit('sector:exit', { sectorId: 'sector_ceres_belt' });
      h.siteSystem.deserialize(JSON.parse(JSON.stringify(snapshot)));
      h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
      const restored = component(h, id);
      assert.deepEqual(restored.pos, section.pos); assert.deepEqual(restored.vel, section.vel);
      assert.ok(Math.abs(restored.rot-section.rot) < 1e-12);
      for (const other of manifest.payloads.filter(p => p.id !== id)) {
        assert.equal(component(h, other.id).physicsBody.dynamic, false, 'unworked masses stay independently attached');
      }
    } finally { owner.dispose(); }
  });
}

for (const mode of ['killed', 'destroyed']) {
  test(`structural ${mode} receipt survives cleanup before the next capture tick`, () => {
    const h = harness(), section = component(h, 'long_plate');
    section.hull = 0; section.alive = false;
    if (mode === 'killed') h.bus.emit('entity:killed', { id: section.id });
    h.state.entities.delete(section.id);
    if (mode === 'destroyed') h.bus.emit('entity:destroyed', { id: section.id, entity: section });
    const snapshot = h.siteSystem.serialize();
    assert.equal(snapshot.worldById[SITE_ID].payloads.long_plate.destroyed, true);
    h.siteSystem.deserialize(JSON.parse(JSON.stringify(snapshot)));
    h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
    assert.equal(component(h, 'long_plate'), undefined);
  });
}

test('stale deferred death cannot destroy a new section generation', () => {
  const h = harness(), old = component(h, 'long_plate');
  h.bus.emit('sector:exit', { sectorId: 'sector_ceres_belt' });
  h.bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.notEqual(component(h, 'long_plate'), old);
  old.hull = 0;
  h.bus.emit('entity:destroyed', { id: old.id, entity: old });
  assert.notEqual(h.siteSystem.getWorldSite(SITE_ID).payloads.long_plate.destroyed, true);
});

test('structural site masses never lose compound/finite identity to a lean far-actor row', () => {
  const h = harness(), section = component(h, 'long_plate');
  for (const simTier of [SIM_TIER.S2_ABSTRACT, SIM_TIER.S3_DORMANT]) {
    section.activity = { simTier };
    assert.equal(shouldVirtualizeFarActor(section, h.state), false);
    assert.equal(shouldVirtualizeFarActor({ ...section, data: {} }, h.state), true, 'ordinary wreck budget unchanged');
  }
});

for (const id of ['long_plate', 'crossbeam']) {
  test(`28 WU craft traverses the entire ${id} passage only after physical removal`, async () => {
    const h = harness(), section = component(h, id), center = { ...section.pos };
    const craft = entityId => ({ id: entityId, type: 'ship', alive: true, radius: 14, mass: 100,
      pos: { x: center.x, z: center.z-150 }, vel: { x: 0, z: 60 }, rot: 0, angVel: 0, data: {},
      physicsBody: { schemaVersion: 1, shape: 'ball', dynamic: true, radius: 14, mass: 100, inertiaY: 200, ccd: true, revision: 0 } });
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
    try {
      const blocked = craft(9001); owner.syncFromEntities([...siteBodies(h), blocked]);
      for (let n = 0; n < 320; n++) owner.step(DT);
      assert.ok(blocked.pos.z < center.z-55, 'intact section is actual cover');
      work(h, id, 181);
      owner.syncFromEntities(siteBodies(h));
      queuePhysicsImpulse(section, { x: 0, z: -section.mass*65 }, { source: 'ceres-route-test' });
      for (let n = 0; n < 240; n++) owner.step(DT);
      const through = craft(9002); owner.syncFromEntities([...siteBodies(h), through]);
      for (let n = 0; n < 320; n++) owner.step(DT);
      assert.ok(through.pos.z > center.z+140, 'clear mouth and exit, not a capped pocket');
    } finally { owner.dispose(); }
  });
}


test('each separately rendered structural mass fails closed until its own appearance is ready', () => {
  const h = harness(), section = component(h, 'long_plate');
  const root = [...h.state.entities.values()].find(e => e.data?.worldSiteId === SITE_ID && e.data.role === 'world_site_root');
  h.state.render = { scene: {} };
  setPresentationAdmission(root, 'ready');
  h.siteSystem._syncWorldSites();
  assert.equal(section.collides, false);
  assert.equal(section.data.worldSiteTargetable, false);
  setPresentationAdmission(section, 'ready');
  h.siteSystem._pollWorldSiteAdmission();
  assert.equal(section.collides, true);
  assert.equal(section.data.worldSiteTargetable, true);
  assert.equal(component(h, 'crossbeam').collides, false);
  setPresentationAdmission(section, 'unavailable');
  h.siteSystem._pollWorldSiteAdmission();
  assert.equal(section.collides, false);
  assert.equal(section.data.worldSiteTargetable, false);
});
