import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { npcPropulsionVisible } from '../src/render/npcPropulsionOwnership.js';
import { FamilyProductionFleet } from '../src/render/thruster/systems/familyFleet.js';

function harness(mode) {
  const scene = new THREE.Scene();
  const fleet = new FamilyProductionFleet(THREE, { maxShips: 2, initialShips: 2 });
  fleet.attachToScene(scene);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  const parent = new THREE.Group(); parent.add(mesh);
  const npc = { id: 2, alive: true, type: 'ship', pos: { x: 0, z: 0 }, rot: 0, radius: 4, mesh, data: {} };
  if (mode !== 'detached') scene.add(parent);
  if (mode === 'hidden') { mesh.visible = false; mesh.userData.authoredAssetState = 'preparing'; }
  if (mode === 'ancestor-hidden') parent.visible = false;
  if (mode === 'other-scene') new THREE.Scene().add(parent);
  if (mode === 'missing') { scene.remove(parent); npc.mesh = null; }
  const system = Object.create(vfx);
  Object.assign(system, {
    state: { playerId: 1, entities: new Map([[2, npc]]), settings: { video: {} }, render: { scene } },
    _scene: scene, _energy: { fleet }, _productionThrusterA11y: {}, _factionRgbScratch: {},
    _trailCandidates: [npc], _productionOwnedIds: new Array(2),
    _productionPlumeSockets: [{}, {}], _productionPlumeSocketView: [], _spawnLocalXZ: {},
    _entityLocalXZ: {}, _frameMembrane: null,
    _extendedEngineTrailsEnabled: () => true, _refreshTrailCandidates: () => {},
    _trailContext: () => ({ state: {}, playerId: 1, playerX: 0, playerZ: 0, tableWu: 330 }),
    _trailScreenChecks: () => ({ remaining: 4 }), _engineProfileIdFor: () => 'engine_ion_small',
    _engineDriveFor: () => ({ drive: 1, throttle: 1, boost: 0 }),
    _factionThrusterRgbInto: (e, out) => Object.assign(out, { r: 1, g: 1, b: 1 }),
    // Socket-less procedural hulls use the actual production fallback writer.
    _trailSocketObjects: () => [], _trailSocketWorldPose: () => null,
    // No player in this fixture: unrelated player-only light/RCS side effects are irrelevant.
    _syncPlayerPlumeEventLight: () => {}, _updateProductionRcs: () => {},
  });
  if (mode === 'retired') npc.alive = false;
  if (mode === 'replaced') system.state.entities.set(2, { ...npc });
  if (mode === 'hidden-scene') scene.visible = false;
  return { system, fleet, mesh, parent, npc, dispose() { system._overflowJets?.dispose(); fleet.dispose(); mesh.geometry.dispose(); mesh.material.dispose(); } };
}

for (const mode of ['hidden', 'ancestor-hidden', 'detached', 'other-scene', 'missing', 'retired', 'replaced', 'hidden-scene', 'visible-procedural']) {
  test(`actual production fleet writer respects ${mode} hull ownership`, () => {
    const h = harness(mode);
    try {
      for (let i = 0; i < 30; i++) h.system._updateEnergyPlume(1 / 60);
      const plume = h.fleet.familyPlume('engine_ion_small');
      const activeDraws = plume.layerBatches.filter(b => b.mesh.visible && b.mesh.count > 0).length;
      if (mode === 'visible-procedural') {
        assert.ok(plume.pool.activeCount > 0); assert.ok(activeDraws > 0);
      } else {
        assert.equal(plume.pool.activeCount, 0, `${mode} hull must not write live plume slots`);
        assert.equal(activeDraws, 0, `${mode} hull must not publish visible instanced draws`);
      }
    } finally { h.dispose(); }
  });
}


test('retained fleet stops draws when a previously visible hull hides, then readmits', () => {
  const h = harness('visible-procedural');
  try {
    for (let i=0;i<30;i++) h.system._updateEnergyPlume(1/60);
    const plume=h.fleet.familyPlume('engine_ion_small');
    assert.ok(plume.pool.activeCount>0);
    h.mesh.visible=false;
    h.system._updateEnergyPlume(1/60);
    assert.equal(plume.pool.activeCount,0);
    assert.ok(plume.layerBatches.every(b=>!b.mesh.visible || b.mesh.count===0));
    h.mesh.visible=true;
    h.system._updateEnergyPlume(1/60);
    assert.ok(plume.pool.activeCount>0);
  } finally { h.dispose(); }
});

for (const mode of ['hidden','ancestor-hidden','detached','other-scene','missing','retired','replaced','hidden-scene','visible-procedural','player-no-mesh']) {
  test(`actual overflow main and reverse admission respects ${mode}`, () => {
    const h=harness(mode);
    try {
      if(mode==='player-no-mesh') { h.system.state.playerId=2; h.npc.mesh=null; }
      h.system._ensureOverflowJets();
      const pool=h.system._overflowJets;
      const claim=pool.claim.bind(pool); let claims=0;
      pool.claim=(...args)=>{claims++;return claim(...args);};
      const main=h.system._admitOverflowMainJet(h.npc,1);
      const left=h.system._admitOverflowReverseJet(h.npc,'reverse-left',1);
      const right=h.system._admitOverflowReverseJet(h.npc,'reverse-right',1);
      const expected=mode==='visible-procedural'||mode==='player-no-mesh';
      assert.equal(claims,expected?3:0);
      for(const slot of [main,left,right]) {
        if(expected) { assert.ok(slot); assert.ok(slot.shape.drive>0); assert.ok(slot.shape.jetLength>0); }
        else assert.equal(slot === null,true);
      }
    } finally { h.dispose(); }
  });
}

test('overflow hidden transition blocks refresh but preserves existing hold retirement', () => {
  const h=harness('visible-procedural');
  try {
    h.system._ensureOverflowJets();
    const slot=h.system._admitOverflowMainJet(h.npc,1);
    const hold=slot.hold;
    h.mesh.visible=false;
    assert.equal(h.system._admitOverflowMainJet(h.npc,1) === null,true);
    assert.equal(slot.hold,hold);
    for(let i=0;i<30;i++) h.system._overflowJets.endFrame(1/60,null);
    assert.equal(slot.hold,0);
    assert.equal(slot.entityId,null);
  } finally { h.dispose(); }
});

test('ownership walk is bounded and accepts only visible ancestry in the current scene', () => {
  const scene={visible:true,parent:null}; const mesh={visible:true,parent:scene};
  const e={id:2,type:'ship',alive:true,mesh};
  const state={playerId:1,entities:new Map([[2,e]]),render:{scene}};
  assert.equal(npcPropulsionVisible(state,e,scene),true);
  assert.equal(npcPropulsionVisible(state,e,{}),false);
  mesh.parent=mesh;
  assert.equal(npcPropulsionVisible(state,e,scene),false);
  let parent=scene;
  for(let i=0;i<64;i++) parent={visible:true,parent};
  mesh.parent=parent;
  assert.equal(npcPropulsionVisible(state,e,scene),false);
  state.playerId=2;e.mesh=null;
  assert.equal(npcPropulsionVisible(state,e,scene),true);
});

for(const mode of ['hidden','detached','replaced','visible-procedural']) {
  test(`actual drone overflow ownership respects ${mode}`,()=>{
    const h=harness(mode);
    try {
      h.npc.type='drone';
      h.system._ensureOverflowJets();
      const pool=h.system._overflowJets;
      let claims=0;const claim=pool.claim.bind(pool);
      pool.claim=(...args)=>{claims++;return claim(...args);};
      const slots=[h.system._admitOverflowMainJet(h.npc,1),h.system._admitOverflowReverseJet(h.npc,'reverse-left',1)];
      assert.equal(claims,mode==='visible-procedural'?2:0);
      for(const slot of slots) assert.equal(!!slot,mode==='visible-procedural');
    } finally {h.dispose();}
  });
}
