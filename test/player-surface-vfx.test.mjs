import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CONTACT_MARK_KINDS, HullScorchPool } from '../src/render/weapons/contactMarks.js';
import { planPlayerSurfaceSplash, surfaceResponseKind, PLAYER_SPLASH_QUALITY } from '../src/render/weapons/playerSurfaceSplash.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

const common = {
  ownerId: 1, playerId: 1, targetType: 'asteroid', targetAlive: true,
  attached: true, hitShield: false, visible: true, now: 5, lastAt: 3, active: 0, targetRadius: 12,
};

test('surface splash is reserved for confirmed, visible player-to-asteroid contacts', () => {
  for (const change of [{ownerId:2},{playerId:2},{ownerId:null},{targetType:'ship'},
    {targetAlive:false},{attached:false},{hitShield:true},{visible:false},{now:NaN}]) {
    assert.equal(planPlayerSurfaceSplash({...common,...change}),null,JSON.stringify(change));
  }
  assert.ok(planPlayerSurfaceSplash(common));
});

test('source pressure is hard-capped at all quality levels and resets across sim clock rewind', () => {
  for (const [quality,q] of Object.entries(PLAYER_SPLASH_QUALITY)) {
    assert.equal(planPlayerSurfaceSplash({...common,quality,active:q.capacity}),null);
    assert.equal(planPlayerSurfaceSplash({...common,quality,lastAt:common.now-q.cooldown/2}),null);
    assert.ok(planPlayerSurfaceSplash({...common,quality,lastAt:common.now-q.cooldown}));
    assert.ok(planPlayerSurfaceSplash({...common,quality,lastAt:100}));
  }
});

test('impact verbs select different materials without recoloring identical mechanics', () => {
  assert.equal(surfaceResponseKind('railgun'),CONTACT_MARK_KINDS.mineralSplash);
  assert.equal(surfaceResponseKind('thermal-bolt'),CONTACT_MARK_KINDS.thermalSeat);
  assert.equal(surfaceResponseKind('disruptor'),CONTACT_MARK_KINDS.inductionBranch);
  assert.notEqual(surfaceResponseKind('disruptor'),surfaceResponseKind('concussion-slug'));
});

test('curved receiver marks share original 32-slot batch and do not create lights or simulations', () => {
  const scene = new THREE.Scene(), pool = new HullScorchPool(scene);
  try {
    assert.equal(scene.children.length,1,'no new pass or scene hierarchy');
    assert.equal(pool.capacity,32);
    assert.equal(pool.geometry.getAttribute('position').count,36,'5x5 curved patch');
    assert.ok(pool.geometry.getAttribute('aSurface'));
    assert.equal(pool.mesh.count,0);
    pool.spawn({ targetId:3, surfaceSplash:true, markKind:CONTACT_MARK_KINDS.mineralSplash,
      life:1,width:3,height:3,seed:.5,localX:8,localY:0,localZ:0 });
    assert.equal(pool.slots.filter(s=>s.alive).length,1);
    pool.update(.12,()=>({x:8,y:0,z:0,nx:1,ny:0,nz:0,surfaceX:0,surfaceY:0,surfaceZ:0,surfaceRadius:9}));
    assert.equal(pool.mesh.count,1);
    assert.equal(pool.surface.array[3],9);
    assert.ok(pool.mark.array[0]>4 && pool.mark.array[0]<5);
    pool.update(1.2,()=>({x:8,y:0,z:0,nx:1,ny:0,nz:0}));
    assert.equal(pool.live,0);
    assert.equal(pool.mesh.count,0);
    assert.equal(scene.children.length,1);
  } finally {pool.dispose();}
  assert.equal(scene.children.length,0);
});

test('mining gouge/fracture arguments survive the presenter and reach the existing material batch', () => {
  const mesh=new THREE.Object3D();mesh.updateMatrixWorld(true);
  const state={playerId:1, entities:new Map([[2,{id:2,type:'asteroid',radius:12,alive:true}]]),
    render:{meshes:new Map([[2,mesh]])},settings:{video:{particleQuality:'low'}},simTime:0};
  const p=new WeaponVfxPresenter({scene:new THREE.Scene(),state});
  try {
    p.stampMiningScar(2,10,0.3,0,1,0,0,2,0.9,CONTACT_MARK_KINDS.gouge,0.7);
    const s=p.scorches.slots.find(s=>s.alive);
    assert.equal(s.markKind,CONTACT_MARK_KINDS.gouge);
    assert.equal(s.fracture,0.7);
    assert.equal(s.surfaceSplash,false);
  } finally {p.dispose();}
});

test('player asteroid hit attaches the bright material reaction, while NPC hits retain normal effects', () => {
  const mesh=new THREE.Object3D();mesh.updateMatrixWorld(true);
  const rock={id:2,type:'asteroid',radius:18,alive:true};
  const state={playerId:1, entities:new Map([[2,rock],[1,{id:1,type:'ship',pos:{x:0,z:0}}]]),
    render:{meshes:new Map([[2,mesh]])},settings:{video:{particleQuality:'high'}},simTime:2};
  const p=new WeaponVfxPresenter({scene:new THREE.Scene(),state});
  try {
    const hit={ownerId:1,targetId:2,weaponId:'wpn_plasma_cannon_m',pos:{x:17,z:0},
      normal:{x:1,z:0},approach:{x:-1,z:0},projectileId:22};
    p.handleHit(hit,false);
    const reactions=p.scorches.slots.filter(s=>s.alive && s.surfaceSplash);
    assert.equal(reactions.length,1);
    assert.equal(reactions[0].markKind,CONTACT_MARK_KINDS.thermalSeat);
    p.scorches.update(.05,s=>p._resolveScorchPose(s));
    assert.equal(p.scorches.surface.array[3],18);
    p.handleHit({...hit,projectileId:23},false);
    assert.equal(p.scorches.slots.filter(s=>s.alive && s.surfaceSplash).length,1,'cooldown suppresses duplicates');
    state.simTime+=.12;
    p.handleHit({...hit,ownerId:3},false);
    assert.equal(p.scorches.slots.filter(s=>s.alive && s.surfaceSplash).length,1,'NPC hits do not spend hero budget');
  } finally {p.dispose();}
});
