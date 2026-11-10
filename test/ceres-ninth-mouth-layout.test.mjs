import test from 'node:test';
import assert from 'node:assert/strict';
import { CERES_NINTH_MOUTH as CUT, ninthMouthSpecs, worldPoint, localPoint } from '../src/data/ceresNinthMouth.js';
import { CERES_WORKFLEET_CONTRACT } from '../src/data/ceresWorkfleet.js';
import { modelTruthRow } from '../src/data/modelTruth.js';

function footprint(s) {
  const m=s.physicsBody.collisionProxyManifest;
  const points=m.compactHull || m.primitives.flatMap(p=>p.kind==='capsule'
    ? [{x:p.ax-p.r,z:p.az-p.r},{x:p.ax+p.r,z:p.az+p.r},{x:p.bx-p.r,z:p.bz-p.r},{x:p.bx+p.r,z:p.bz+p.r}]
    : p.kind==='circle'?[{x:p.x-p.r,z:p.z-p.r},{x:p.x+p.r,z:p.z+p.r}]
    : [{x:p.x-p.hx,z:p.z-p.hz},{x:p.x+p.hx,z:p.z+p.hz}]);
  const p=localPoint(s.pos);
  return {minX:p.x+Math.min(...points.map(p=>p.x))*s.radius,
    maxX:p.x+Math.max(...points.map(p=>p.x))*s.radius,
    minZ:p.z+Math.min(...points.map(p=>p.z))*s.radius,
    maxZ:p.z+Math.max(...points.map(p=>p.z))*s.radius};
}

test('finite deterministic originals have separate persistent identities and fresh mutable specs',()=>{
  const a=ninthMouthSpecs(), b=ninthMouthSpecs();
  assert.deepEqual(a,b); assert.equal(a.length,7);
  assert.equal(new Set(a.map(s=>s.data.ninthMouthIdentity)).size,7);
  for(const s of a){
    assert.equal(s.data.ninthMouthIdentity,`${CUT.id}:${s.data.ninthMouthRole}`);
    assert.equal(s.homeSectorId,CUT.sectorId);
    assert.equal(s.physicsBody.shape,'compound');
    assert.ok(s.physicsBody.collisionProxyManifest.primitives.length);
    assert.equal(s.data.masslineTetherable,s.physicsBody.dynamic);
  }
  a[0].pos.x++; assert.notDeepEqual(a,b);
  assert.equal(a.filter(s=>s.physicsBody.dynamic).length,4);
});

test('service cut is disjoint from Second Measure and coordinate helpers round trip',()=>{
  const other=CERES_WORKFLEET_CONTRACT.sitePlacement.pos;
  assert.ok(Math.hypot(CUT.center.x-other.x,CUT.center.z-other.z)>=1200);
  assert.deepEqual(localPoint(worldPoint({x:123,z:-46})),{x:123,z:-46});
  assert.ok(CUT.route.nominalRescueDistance>=300 && CUT.route.nominalRescueDistance<=450);
  assert.equal(CUT.barge.radius,24);
  assert.equal(CUT.barge.defId,'ship_ironback');
});

test('two separate rock shoulders leave a real open route, lamp seats and reverse exit',()=>{
  const specs=ninthMouthSpecs();
  const boxes=specs.filter(s=>s.data.ninthMouthRole.startsWith('shoulder_')).map(footprint);
  // Conservative full native-hull bounding boxes, not handwaved entity radii.
  assert.ok(boxes[1].minZ-boxes[0].maxZ>45,'barge and small tug clear throat');
  for(const p of CUT.route.extraction) {
    for(const b of boxes) assert.ok(p.x<b.minX-24 || p.x>b.maxX+24 || p.z<b.minZ-24 || p.z>b.maxZ+24);
  }
  for(const lamp of CUT.lamps) for(const b of boxes)
    assert.ok(lamp.local.x<b.minX-3 || lamp.local.x>b.maxX+3 || lamp.local.z<b.minZ-3 || lamp.local.z>b.maxZ+3);
  assert.ok(CUT.route.reverseEscape[1].x>Math.max(...boxes.map(b=>b.maxX))+24);
  assert.ok(CUT.berth.local.x<Math.min(...boxes.map(b=>b.minX))-CUT.berth.radius);
});

test('fallen rock is beside barge without initial penetration; inward pull can contact it',()=>{
  const loose=ninthMouthSpecs().find(s=>s.data.ninthMouthRole==='fallen_rock');
  const b=footprint(loose),ship=CUT.barge;
  const halfZ=ship.measuredEnvelope.z/2;
  assert.ok(b.minZ>ship.local.z+halfZ,'initial full-envelope gap');
  assert.ok(b.minZ-(ship.local.z+halfZ)<15,'nearby wrong-angle contact, not remote scenery');
  assert.ok(b.minX<ship.local.x+ship.measuredEnvelope.x/2 && b.maxX>ship.local.x-ship.measuredEnvelope.x/2);
  assert.equal(loose.physicsBody.dynamic,true);
  // This checks layout only. Force/contact movement needs a native physics test.
});

test('packaged fit uses measured source skins and retains documented material caveats',()=>{
  for(const d of CUT.definitions){
    const row=modelTruthRow(d.asset);
    assert.ok(row?.proposedSkin?.adopted);
    assert.equal(row.collider.overTolerance,false);
    const spec=ninthMouthSpecs().find(s=>s.data.ninthMouthRole===d.role);
    assert.equal(spec.data.packagedPropRadius,d.radius);
    assert.equal(spec.physicsBody.collisionProxyManifest.sourceRow,d.asset);
    assert.ok(row.url.endsWith(d.file));
    const source=row.proposedSkin.primitives[0];
    const fitted=spec.physicsBody.collisionProxyManifest.primitives[0];
    const ref=row.gameplay.entityRadius, scale=ref*2/Math.max(...row.worldSize);
    const offset=row.drawOffset || [0,0,0];
    const expectedAX=(source.ax-(row.bounds.center[0]*row.drawScale+offset[0])/ref)*scale;
    const expectedAZ=(source.az-(row.bounds.center[2]*row.drawScale+offset[2])/ref)*scale;
    assert.ok(Math.abs(fitted.ax-expectedAX)<1e-10,'census draw offset is not applied twice');
    assert.ok(Math.abs(fitted.az-expectedAZ)<1e-10);
  }
});
