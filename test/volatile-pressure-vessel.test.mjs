import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createVisualFactory, invalidateVisualFactoryCaches} from '../src/render/visualFactory.js';
import {globalPickupMotion} from '../src/render/pickupMotionPresentation.js';

const entity = (id, volatileClass='explosive', type='payload') => ({id, type, alive:true, radius:6, pos:{x:0,z:0}, vel:{x:0,z:0}, rot:0, data:{volatileClass}});

test('payloads and pickups share a smoothly shaded pressure shell and containment', () => {
  const factory=createVisualFactory();
  try {
    const pickup=factory.build(entity('flat-pickup','corrosive','pickup')).children[0];
    const payload=factory.build(entity('smooth-payload','corrosive')).children[0];
    const a=pickup.geometry,b=payload.geometry;
    assert.equal(a,b,'pickup and payload share the same indexed shell geometry');
    assert.ok(b.index,'the shell retains indexed geometry');
    assert.equal(b.attributes.uv.count,b.attributes.position.count,'every shell vertex has texture coordinates');
    b.computeBoundingSphere();
    assert.ok(b.boundingSphere.radius<=1,'the shell stays inside the physical envelope');
    for(let i=0;i<b.attributes.position.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(b.attributes.position,i).normalize();
      const n=new THREE.Vector3().fromBufferAttribute(b.attributes.normal,i);
      assert.ok(p.distanceTo(n)<1e-6,'sphere normals remain radial across triangle seams');
    }
    assert.equal(payload.children[0].geometry,pickup.children[0].geometry,'hard cage is still shared');
    assert.equal(factory.build(entity('another-payload','superdense')).children[0].geometry,b,'all payload classes share smooth geometry');
  } finally {invalidateVisualFactoryCaches();}
});

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
    assert.equal(values.size,3,'containment, valve and warning band remain distinct in one draw');
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

test('many volatile vessels share resources and retain distinct class warning bands', () => {
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
    const hasWarningColor=(body,color)=>{
      const colors=body.children[0].geometry.getAttribute('color'), expected=new THREE.Color(color);
      for(let i=0;i<colors.count;i++){
        if(Math.abs(colors.getX(i)-expected.r)<1e-6 && Math.abs(colors.getY(i)-expected.g)<1e-6
          && Math.abs(colors.getZ(i)-expected.b)<1e-6)return true;
      }
      return false;
    };
    for(const [klass,color] of [['explosive',0xffb340],['corrosive',0x7dd66a],['superdense',0xa77dff],['cryogenic',0x8fe1fa]]){
      const body=factory.build(entity(klass,klass)).children[0];
      assert.equal(body.material,first.material,'all classes share the neutral fallback shell');
      assert.equal(body.material.emissiveIntensity,0,'the shell is not an emissive warning lamp');
      assert.ok(hasWarningColor(body,color),`${klass} retains its physical warning color`);
    }
    for(const [lamp,color] of [['amber',0xffb340],['green',0x7dd66a],['violet',0xa77dff],['red',0xff5c4a]]){
      const e=entity(`lamp-${lamp}`);e.data={volatileLamp:lamp};
      const body=factory.build(e).children[0];
      assert.equal(body.material,first.material,'lamp-only classes share the shell');
      assert.ok(hasWarningColor(body,color),`${lamp} retains its physical warning color`);
    }
    invalidateVisualFactoryCaches();
    const refreshed=factory.build(entity('after-context-restore')).children[0];
    assert.notEqual(refreshed.geometry,first.geometry,'cache invalidation rebuilds geometry');
    assert.notEqual(refreshed.children[0].material,first.children[0].material,'cache invalidation rebuilds fittings');
  } finally {invalidateVisualFactoryCaches();}
});
