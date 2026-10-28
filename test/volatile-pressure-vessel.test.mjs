import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createVisualFactory, invalidateVisualFactoryCaches} from '../src/render/visualFactory.js';
import {globalPickupMotion} from '../src/render/pickupMotionPresentation.js';

const entity = (id, volatileClass='explosive', type='payload') => ({id, type, alive:true, radius:6, pos:{x:0,z:0}, vel:{x:0,z:0}, rot:0, data:{volatileClass}});

test('volatile vessel fittings stay inside the unchanged radius and follow the original animated body', () => {
  const e=entity('vessel-motion','explosive','pickup');
  const before=JSON.stringify(e);
  const root=createVisualFactory().build(e);
  try {
    const body=root.children[0];
    assert.equal(body.name,'VolatilePod_Bottle');
    assert.equal(body.children.length,1);
    assert.equal(body.children[0].material.vertexColors,true);
    const colors=body.children[0].geometry.attributes.color;
    const values=new Set();
    for(let i=0;i<colors.count;i++)values.add([colors.getX(i),colors.getY(i),colors.getZ(i)].join(','));
    assert.equal(values.size,2,'containment and valve retain distinct construction values in one draw');
    assert.deepEqual(root.scale.toArray(),[6,6,6]);
    assert.equal(root.userData.visualLanguage,'volatile-pressure-bottle');
    let triangles=0,draws=0;
    root.traverse(o=>{
      if(!o.isMesh)return;
      draws++;
      const p=o.geometry.attributes.position;
      for(let i=0;i<p.count;i++) assert.ok(Math.hypot(p.getX(i),p.getY(i),p.getZ(i))<=1.000001,`${o.name} outside physical unit envelope`);
      triangles+=(o.geometry.index?.count ?? p.count)/3;
      assert.ok(!Array.isArray(o.material),'one material per merged mesh');
      assert.equal(o.geometry.groups.length,0,'no hidden per-material subdraws');
    });
    assert.equal(draws,2);
    assert.ok(triangles<=1100,`small prop budget: ${triangles}`);
    const transforms=body.children.map(o=>o.matrix.clone());
    for(let i=0;i<120;i++)globalPickupMotion.updatePickupMotion(e,root,i/60,1/60,null,{motionReduce:false});
    root.updateMatrixWorld(true);
    body.children.forEach((o,i)=>{
      assert.equal(o.parent,body);
      assert.deepEqual(o.matrix.elements,transforms[i].elements,'fittings never move independently');
      assert.deepEqual(o.matrixWorld.elements,body.matrixWorld.elements,'same tumble and strobe');
    });
    assert.notEqual(body.rotation.x,0);
    assert.equal(JSON.stringify(e),before,'presentation never writes the entity');
  } finally {invalidateVisualFactoryCaches();}
});

test('many volatile vessels share fittings and safe disposal while retaining existing class lamps', () => {
  const factory=createVisualFactory();
  try {
    const roots=Array.from({length:40},(_,i)=>factory.build(entity(`vessel-${i}`)));
    const first=roots[0].children[0];
    for(const root of roots){
      const body=root.children[0];
      assert.equal(body.geometry,first.geometry);
      assert.equal(body.material,first.material);
      body.children.forEach((o,i)=>{
        assert.equal(o.geometry,first.children[i].geometry);
        assert.equal(o.material,first.children[i].material);
      });
    }
    let disposal=0;
    first.traverse(o=>{if(o.isMesh){o.geometry.addEventListener('dispose',()=>disposal++);o.material.addEventListener('dispose',()=>disposal++);o.geometry.dispose();o.material.dispose();}});
    assert.equal(disposal,0,'per-entity disposal cannot invalidate pooled resources');
    for(const [klass,color] of [['explosive',0xffb340],['corrosive',0x7dd66a],['superdense',0xa77dff]]){
      const body=factory.build(entity(klass,klass)).children[0];
      assert.equal(body.material.emissive.getHex(),color);
      assert.equal(body.material.emissiveIntensity,.55);
      assert.equal(body.material.roughness,.42);
      assert.equal(body.material.metalness,.55);
      assert.equal(body.children[0].material.emissiveIntensity,1);
      assert.equal(body.children[0].material.emissive.getHex(),0,'containment never adds a second warning color');
    }
    invalidateVisualFactoryCaches();
    const refreshed=factory.build(entity('after-context-restore')).children[0];
    assert.notEqual(refreshed.geometry,first.geometry,'cache invalidation rebuilds geometry');
    assert.notEqual(refreshed.children[0].material,first.children[0].material,'cache invalidation rebuilds fittings');
  } finally {invalidateVisualFactoryCaches();}
});
