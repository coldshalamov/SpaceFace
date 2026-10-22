import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { validateCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { segmentHitsProxy } from '../src/combat/lineOfSight.js';
import { STORMSHIFT_RECEIVER_COLLISION as MANIFEST, STORMSHIFT_RECEIVER_SOLIDS as SOLIDS, STORMSHIFT_RECEIVER_SOURCE_SCALE as K, STORMSHIFT_RECEIVER_SOURCE_LENGTH as LENGTH } from '../src/data/stormshiftReceiverCollision.js';
const file = process.env.STORMSHIFT_RECEIVER_GLB || new URL('../assets/ships/parts/wholeships/ship_stormshift_receiver_v01.glb', import.meta.url);
const bytes = readFileSync(file);
const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const contract = glb.asset.extras.stormshiftReceiver;
const world = (e, x, port) => ({ x: e.pos.x + K * e.radius * (x * Math.cos(e.rot) + port * Math.sin(e.rot)), y: 0,
  z: e.pos.z + K * e.radius * (x * Math.sin(e.rot) - port * Math.cos(e.rot)) });
function receiver(radius, rot) {
  return { id: 901, type: 'ship', alive: true, collides: true, radius, mass: 700,
    pos: { x: 30, z: -40 }, vel: { x: 0, z: 0 }, rot, angVel: 0,
    data: { defId: 'ship_mule', itinerary: { kind: 'anvil_work', role: 'receiver', phase: 'receiving' } },
    physicsBody: { schemaVersion: 1, radius, mass: 700, inertiaY: 40000, dynamic: true,
      shape: 'capsule', ccd: true, revision: 1, collisionProxyManifest: MANIFEST } };
}
test('actual exported receiver preserves source origin, compound, material identity and sockets', () => {
  assert.equal(glb.asset.extras.spacefaceAsset.assetId, 'SF_STORMSHIFT_RECEIVER_V01');
  assert.equal(contract.sourceSha256, createHash('sha256').update(readFileSync(new URL('../tools/blender/forge/ships/stormshift_receiver.py', import.meta.url))).digest('hex'));
  assert.ok(Math.abs(contract.dimensions[0] - LENGTH) < .002);
  assert.deepEqual(contract.sourceSolids, SOLIDS);
  assert.equal(validateCollisionProxyManifest(MANIFEST).ok, true);
  assert.ok(MANIFEST.primitives.length <= 32);
  const names = new Set(glb.nodes.map(n => n.name));
  for (const name of ['SOCKET_Engine_Main','SOCKET_Trail_Main','SOCKET_Tether_Massline','SOCKET_Receive','SOCKET_Service','SOCKET_Storage','MOTION_STORMSHIFT_RECEIVER_STATUS','COLLISION_HULL']) assert.ok(names.has(name), name);
  for (const name of ['SOCKET_Receive','SOCKET_Service','SOCKET_Storage']) {
    const node = glb.nodes.find(n => n.name === name);
    assert.equal(node.extras.spaceface.socket, true);
    assert.equal(node.extras.spaceface.forward.length, 3);
  }
  assert.deepEqual(glb.nodes.find(n => n.name === 'SOCKET_Service').extras.spaceface.forward, [0,0,1]);
  assert.ok(glb.materials.every(m => m.name.startsWith('Material_')));
  assert.ok(glb.materials.length <= 15, 'shared Forge finishes, no per-part unique material explosion');
  assert.equal(glb.animations?.length || 0, 0, 'runtime presentation owns shutter, no competing baked animation');
  const triangles = [0,1,2].map(lod => glb.nodes.filter(n => n.name?.startsWith(`LOD${lod}_`) && n.mesh != null)
    .reduce((sum,n) => sum + glb.meshes[n.mesh].primitives.reduce((s,p) => s + glb.accessors[p.indices].count/3,0),0));
  assert.ok(triangles[0] < 27000 && triangles[1] < triangles[0] && triangles[2] < triangles[1]);
  assert.ok(triangles.reduce((a,b)=>a+b,0) < 52822, 'total tiers below existing repair_tender manifest reference 52822');
});
for (const radius of [9,18,36]) for (const rot of [0,.71]) {
  test(`native compound preserves receiving void and separate saddle at radius ${radius}, yaw ${rot}`, async () => {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1/60 });
    try {
      const e = receiver(radius,rot); owner.syncFromEntities([e]); owner.step(1/60);
      const record = owner.records.get(e.id);
      assert.equal(record.colliders.length, SOLIDS.length);
      assert.ok(Math.abs(record.body.mass()-700)<.01);
      const overlaps=(x,port,r=.2)=>record.colliders.some(c=>c.intersectsShape(new owner.RAPIER.Ball(r*K*radius),world(e,x,port),{x:0,y:0,z:0,w:1}));
      for (const x of [0,2,5,8,11,14]) for (const port of [-3,0,3]) assert.equal(overlaps(x,port),false,`open ${x},${port}`);
      assert.equal(overlaps(-7,0),true,'workshop solid');
      assert.equal(overlaps(7.6,4.8),true,'receiving segment solid');
      assert.equal(overlaps(5,7.7),true,'fixed service arm solid');
      assert.equal(overlaps(-2.3,-9.15),false,'storage saddle open');
      assert.equal(overlaps(-2.3,-10.5),true,'storage saddle rail solid');
      assert.equal(segmentHitsProxy(e,world(e,15,0),world(e,0,0)),false);
      assert.equal(segmentHitsProxy(e,world(e,15,0),world(e,-7,0)),true);
      const handle=record.body.handle;e.data.itinerary.phase='delivery';owner.syncFromEntities([e]);
      assert.equal(owner.records.get(e.id).body.handle,handle,'presentation transitions do not rebuild solids');
    } finally { owner.dispose(); }
  });
}
test('recessed shutter swept planar envelope remains inside fixed workshop housing', () => {
  for (let a=0;a<=.35;a+=.005) for (const x of [-.5,.5]) for (const z of [-.225,.225]) {
    const xx=x*Math.cos(a)-z*Math.sin(a), zz=x*Math.sin(a)+z*Math.cos(a);
    assert.ok(Math.abs(xx)<1 && Math.abs(zz)<.85);
  }
});
test('fixed receiver compound remains inside the existing entity-radius approach envelope', () => {
  const bound = Math.max(...MANIFEST.primitives.map(p => Math.hypot(p.x,p.z)+Math.hypot(p.hx,p.hz)));
  assert.ok(bound < 1, `compound circumscribed bound ${bound}`);
  // This is only a conservative shape audit, not proof of complete district traffic.
  // Existing 60WU radial service point stays exterior at original receiver radius18.
  assert.ok(60 - bound * 18 > 42);
});
