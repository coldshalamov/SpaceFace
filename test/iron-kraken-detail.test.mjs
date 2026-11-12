import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildIronKrakenArmGeometry } from '../src/render/ironKrakenArmGeometry.js';

const shared=(geometry,name)=>{
  geometry.name=name;
  geometry.userData.spacefaceSharedAsset=true;
  return geometry;
};
const full=buildIronKrakenArmGeometry({shared});
const distant=buildIronKrakenArmGeometry({shared,detail:'distant'});
const surface=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
after(()=>{
  for(const geometry of [...Object.values(full),...Object.values(distant)])geometry.dispose();
  surface.dispose();
});
const triangles=geometry=>(geometry.index?.count??geometry.attributes.position.count)/3;
const close=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,message);

function hits(geometry,origin,direction) {
  const mesh=new THREE.Mesh(geometry,surface);
  mesh.updateMatrixWorld(true);
  return new THREE.Raycaster(origin,direction).intersectObject(mesh,false);
}

function axialProfile(geometry) {
  const position=geometry.attributes.position,rows=new Set();
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    // Both radial meshes share the +Z meridian. Compare the actual beveled wall and collar
    // profile rather than pinning triangle totals or requiring the same tessellation.
    if(Math.abs(x)<1e-7&&z>0)rows.add(`${y.toFixed(6)},${z.toFixed(6)}`);
  }
  return [...rows].sort();
}

test('full remains the default and the explicit distant set preserves the shared geometry contract',()=>{
  const explicit=buildIronKrakenArmGeometry({shared,detail:'full'});
  try {
    assert.deepEqual(Object.keys(distant),Object.keys(full));
    for(const key of Object.keys(full)) {
      assert.equal(full[key].name,explicit[key].name);
      for(const attribute of ['position','normal','uv'])
        assert.deepEqual(full[key].attributes[attribute].array,explicit[key].attributes[attribute].array);
      assert.ok(distant[key].userData.spacefaceSharedAsset);
      assert.notEqual(distant[key].name,full[key].name,'a distant buffer cannot collide with the full cache identity');
      for(const attribute of ['position','normal','uv'])
        assert.ok(distant[key].attributes[attribute].array.every(Number.isFinite));
      assert.ok(Number.isFinite(distant[key].boundingSphere.radius));
      assert.ok(distant[key].boundingSphere.center.toArray().every(Number.isFinite));
    }
    assert.throws(()=>buildIronKrakenArmGeometry({shared,detail:'typo'}),/full or distant/);
  } finally { for(const geometry of Object.values(explicit))geometry.dispose(); }
});

test('distant detail removes micro surfaces while keeping all structural families and reducing real submitted geometry',()=>{
  let nearTriangles=0,farTriangles=0;
  for(const key of Object.keys(full)) {
    nearTriangles+=triangles(full[key]);farTriangles+=triangles(distant[key]);
    if(key==='stripe'||key==='sleeveDetail') {
      assert.equal(distant[key].attributes.position.count,0);
      assert.ok(distant[key].boundingBox.isEmpty());
      assert.equal(distant[key].boundingSphere.radius,0);
    } else {
      assert.ok(triangles(distant[key])>0,`${key} still supplies a visible structural surface`);
      assert.ok(triangles(distant[key])<triangles(full[key]),`${key} actually uses a simpler buffer`);
    }
  }
  assert.ok(farTriangles<nearTriangles,'distance changes submitted geometry, not only a diagnostic label');
  assert.deepEqual(axialProfile(distant.armor),axialProfile(full.armor));
  for(const key of ['armor','joint','suckerCore'])for(const corner of ['min','max'])for(const axis of ['x','y','z'])
    close(distant[key].boundingBox[corner][axis],full[key].boundingBox[corner][axis],`${key} retains its external mounting envelope`);
});

test('all four paired suction dishes and open red rims remain on their existing mounts',()=>{
  for(const x of [-.49,.49])for(const y of [-.48,.48]) {
    const origin=new THREE.Vector3(x,y,1),direction=new THREE.Vector3(0,0,-1);
    const nearDish=hits(full.suckerCore,origin,direction),farDish=hits(distant.suckerCore,origin,direction);
    assert.ok(nearDish.length&&farDish.length,'every mount retains a front-facing recessed cup');
    close(nearDish[0].point.x,farDish[0].point.x,'cup center X is fixed');
    close(nearDish[0].point.y,farDish[0].point.y,'cup center Y is fixed');
    close(nearDish[0].point.z,farDish[0].point.z,'the cup keeps its recessed center depth');
    assert.equal(hits(distant.sucker,origin,direction).length,0,'the red rim remains open around the dark throat');
    const lip=new THREE.Vector3(x+.271,y,1);
    assert.ok(hits(full.sucker,lip,direction).length&&hits(distant.sucker,lip,direction).length,
      'each existing red working rim remains visible from its outward face');
  }
  assert.equal(hits(distant.suckerCore,new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)).length,0,
    'four separate cups must not become a single plate bridging their gaps');
});

test('all four exposed hydraulic rods and their dark cylinders keep the same exterior surfaces',()=>{
  for(const angle of [Math.PI/4,Math.PI*3/4,Math.PI*5/4,Math.PI*7/4]) {
    const sx=Math.sin(angle),sz=Math.cos(angle),direction=new THREE.Vector3(-sx,0,-sz);
    for(const [key,height] of [['jointMetal',.15],['joint',-.14]]) {
      const origin=new THREE.Vector3(sx*.86,height,sz*.86);
      const near=hits(full[key],origin,direction),far=hits(distant[key],origin,direction);
      assert.ok(near.length&&far.length,'every hydraulic mechanism retains a real exterior surface');
      for(const axis of ['x','y','z'])close(near[0].point[axis],far[0].point[axis],
        'simplifying collars never replaces or moves the exposed hydraulic rod');
    }
  }
});
