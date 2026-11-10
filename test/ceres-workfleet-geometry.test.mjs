// Continuous, collision-proxy geometry proof. This does not certify a thrust/
// attachment controller or authored GLBs: those owners use this frozen contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPoint as point,
  ceresWorkfleetPose as compose, ceresWorkfleetCollision } from '../src/data/ceresWorkfleet.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { expandProxyPrimitives } from '../src/data/collisionProxyManifests.js';
const EPS=1e-8, zero={x:0,z:0,rot:0};
const {breaker:B,cradle:R,cutterHead:H}=C.assets, S=C.existing.section;
const close=(a,b)=>assert.ok(Math.abs(a-b)<EPS,`${a} != ${b}`);
function corners(b) {
  return [-1,1].flatMap(sx=>[-1,1].map(sz=>({
    x:b.center.x+sx*b.size.x/2,z:b.center.z+sz*b.size.z/2})));
}
function aabb(b,at=zero) {
  const points=corners(b).map(p=>point(at,p));
  return {id:b.id,x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),
    z0:Math.min(...points.map(p=>p.z)),z1:Math.max(...points.map(p=>p.z))};
}
function overlap(a,b) {
  return Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>EPS
    && Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0)>EPS;
}
function disjoint(boxes,obstacles,label) {
  for(const a of boxes)for(const b of obstacles)
    assert.ok(!overlap(a,b),`${label}: ${a.id} overlaps ${b.id}`);
}
const placed=(boxes,at=zero)=>boxes.map(b=>aabb(b,at));
const shipbreak=[...placed(C.existing.shellBoxes),
  ...C.existing.otherSections.flatMap(s=>placed(s.boxes,s.pose))];
const receiverOpen=placed(R.states.open.boxes,R.pose);
const world=[...shipbreak,...receiverOpen];
function union(a,b) {
  return {id:a.id,x0:Math.min(a.x0,b.x0),x1:Math.max(a.x1,b.x1),
    z0:Math.min(a.z0,b.z0),z1:Math.max(a.z1,b.z1)};
}
// Exact continuous sweep, not samples: cardinal OBB + one-axis translation is
// the union AABB of its endpoints. Reject a future diagonal/yaw route here.
function sweep(boxes,from,to) {
  close(from.rot||0,to.rot||0);
  close(Math.sin(2*(from.rot||0)),0);
  assert.ok(Math.abs(from.x-to.x)<EPS||Math.abs(from.z-to.z)<EPS,'axis-aligned leg required');
  return boxes.map(b=>union(aabb(b,from),aabb(b,to)));
}
const headDock=B.headMountedPose;
function parts(at,state='retained') {
  return [{boxes:B.states[state].boxes,at},
    {boxes:S.boxes,at:compose(at,B.loadPose)},
    {boxes:H.boxes,at:compose(at,headDock)}];
}
function internalClear(at,state='retained') {
  const sets=parts(at,state).map(p=>placed(p.boxes,p.at));
  for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++)
    disjoint(sets[i],sets[j],`loaded internal ${i}/${j}`);
}
function distanceToBox(p,b) {
  return Math.hypot(Math.max(b.x0-p.x,0,p.x-b.x1),Math.max(b.z0-p.z,0,p.z-b.z1));
}

test('frozen footprint derives the exact shell windows and real five-piece section',()=>{
  assert.deepEqual(C.existing.corridors.map(p=>p.x),[[-114,-46],[46,114]]);
  assert.deepEqual(C.existing.corridors.map(p=>p.z),[[-70,99],[-70,99]]);
  assert.equal(S.boxes.length,5);assert.equal(S.mass,1800);
  assert.deepEqual(S.mountedPose,{x:-80,z:0,rot:0});
  assert.equal(C.existing.corridors[0].x[1]-C.existing.corridors[0].x[0],S.dimensions.x);
  assert.equal(C.route.extraction.fullyClearCenterZ,-70-S.dimensions.z/2);
  // Exactly touching tabs are intentional. The release throat has zero lateral
  // slack; this proof must not advertise an invented two-WU margin.
  disjoint(placed(S.boxes,S.mountedPose),shipbreak,'mounted shear tabs');
  assert.ok(Object.isFrozen(C.assets.breaker.states.open.boxes));
});

test('outer bounds, radius, normalized proxies and socket budgets agree',()=>{
  const expected={breaker:13,cradle:11,cutterHead:3};
  let sockets=0;
  for(const [id,asset]of Object.entries(C.assets)) {
    sockets+=Object.keys(asset.sockets).length;
    for(const axis of ['x','y','z'])close(asset.bounds.max[axis]-asset.bounds.min[axis],asset.dimensions[axis]);
    for(const state of asset.states?Object.keys(asset.states):['open']) {
      const boxes=asset.states?.[state].boxes||asset.boxes;
      assert.equal(boxes.length,expected[id]);
      for(const b of boxes) {
        for(const axis of ['x','y','z']) {
          assert.ok(b.center[axis]-b.size[axis]/2>=asset.bounds.min[axis]-EPS);
          assert.ok(b.center[axis]+b.size[axis]/2<=asset.bounds.max[axis]+EPS);
        }
        for(const p of corners(b))assert.ok(Math.hypot(p.x,p.z)<=asset.radius+EPS);
      }
      const proxy=ceresWorkfleetCollision(id,state);
      const primitives=expandProxyPrimitives(proxy);
      assert.equal(primitives.length,boxes.length);
      primitives.forEach((p,i)=>{
        close(p.x*asset.radius,boxes[i].center.x);close(p.z*asset.radius,boxes[i].center.z);
        close(p.hx*2*asset.radius,boxes[i].size.x);close(p.hz*2*asset.radius,boxes[i].size.z);
      });
      for(const clear of asset.clearVolumes?.[state]||[])
        disjoint(placed(boxes),[{id:'strict authored clear volume',x0:clear.x[0],x1:clear.x[1],z0:clear.z[0],z1:clear.z[1]}],id);
    }
    for(const [name,dir]of Object.entries(asset.socketDirections)) {
      assert.ok(asset.sockets[name]);close(Math.hypot(dir.x,dir.y,dir.z),1);
    }
  }
  assert.equal(sockets,C.limits.criticalSocketCount);
  assert.throws(()=>ceresWorkfleetCollision('unknown'),/Unknown/);
  assert.throws(()=>ceresWorkfleetCollision('breaker','imaginary'),/Unknown/);
});

test('110-WU section axis maps into 118-WU longitudinal well, not the lateral span',()=>{
  close(B.well.x[1]-B.well.x[0],118);close(B.well.z[1]-B.well.z[0],96);
  const load=placed(S.boxes,B.loadPose);
  close(Math.min(...load.map(b=>b.x0)),-28);close(Math.max(...load.map(b=>b.x1)),82);
  close(Math.min(...load.map(b=>b.z0)),-34);close(Math.max(...load.map(b=>b.z1)),34);
  internalClear(zero);
  for(const p of parts(zero))for(const b of p.boxes)for(const corner of corners(b)) {
    const q=point(p.at,corner);
    assert.ok(Math.hypot(q.x,q.z)<=B.radius,'entire loaded assembly enclosed by turn circle');
  }
});

test('breaker stays outside hull; finite head alone reaches exposed cut face',()=>{
  const at=C.route.breakerWorkPose;
  disjoint(placed(B.states.open.boxes,at),world,'outside work pose');
  assert.ok(Math.max(...placed(B.states.open.boxes,at).map(b=>b.z1))<-70);
  assert.ok(B.dimensions.z>68,'carrier cannot enter either shell window');
  const obstacles=[...world,...placed(S.boxes,S.mountedPose),...placed(B.states.open.boxes,at)];
  const poses=C.route.headPosesInBreaker.map(p=>compose(at,p));
  for(let i=1;i<poses.length;i++)disjoint(sweep(H.boxes,poses[i-1],poses[i]),obstacles,'head deployment');
  const emitter=point(poses.at(-1),H.sockets.SOCKET_Cut);
  const cut=point(S.mountedPose,S.sockets.SOCKET_Cut_A);
  close(emitter.x,cut.x);close(cut.z-emitter.z,C.route.headCutGap);
  const tether=ATTACHMENT_DEFS.find(d=>d.id==='tether_standard');
  const source=point(at,B.sockets.SOCKET_Tether_Massline);
  for(const p of poses) {
    const distance=Math.hypot(p.x-source.x,p.z-source.z);
    assert.ok(distance>=tether.minLength&&distance<=tether.maxLength,'honest cutter tether reach');
  }
  // Current public course point remains a real 28-WU-diameter approach in the
  // open carrier throat; permanent hardware is placed elsewhere.
  disjoint([{id:'player approach',x0:-94,x1:-66,z0:-164,z1:-136}],
    [...world,...placed(B.states.open.boxes,at),...placed(H.boxes,compose(at,headDock))],'course approach');
});

test('continuous extraction clears exact shell, other sections and carrier without a teleport',()=>{
  const r=C.route.extraction;
  disjoint(sweep(S.boxes,r.sectionFrom,r.sectionTo),world,'section extraction');
  disjoint(sweep(B.states.open.boxes,r.breakerFrom,r.breakerTo),world,'carrier backing');
  const relative={x:r.sectionFrom.x-r.breakerFrom.x,z:r.sectionFrom.z-r.breakerFrom.z,rot:0};
  close(r.sectionTo.x-r.breakerTo.x,relative.x);close(r.sectionTo.z-r.breakerTo.z,relative.z);
  disjoint(placed(S.boxes,r.sectionFrom),placed(B.states.open.boxes,r.breakerFrom),'moving pair start');
  const source=point(r.breakerFrom,B.sockets[r.sourceSocket]),target=point(r.sectionFrom,S.sockets[r.targetSocket]);
  close(Math.hypot(target.x-source.x,target.z-source.z),r.restLength);
  assert.ok(r.restLength<=ATTACHMENT_DEFS.find(d=>d.id==='tether_standard').maxLength);
  assert.ok(r.sectionTo.z<C.route.extraction.fullyClearCenterZ);
  // Reject tempting early diagonal turns/offsets into the collars.
  assert.throws(()=>disjoint(sweep(S.boxes,r.sectionFrom,{...r.sectionFrom,x:r.sectionFrom.x+1}),world,'bad drift'),/overlaps/);
  assert.throws(()=>sweep(S.boxes,r.sectionFrom,{...r.sectionTo,x:-90}),/axis-aligned/);
});

test('reel-in fits the actual carrier and lands at the standard line minimum',()=>{
  const r=C.route.seating,at=r.breakerPose;
  disjoint(sweep(S.boxes,r.sectionFrom,r.sectionTo),
    [...world,...placed(B.states.open.boxes,at),...placed(H.boxes,compose(at,headDock))],'reel seating');
  const expected=compose(at,B.loadPose);
  close(expected.x,r.sectionTo.x);close(expected.z,r.sectionTo.z);close(expected.rot,0);
  const source=point(at,B.sockets.SOCKET_Tether_Massline);
  for(const [p,length]of [[r.sectionFrom,r.lineLengthFrom],[r.sectionTo,r.lineLengthTo]]) {
    const target=point(p,S.sockets.SOCKET_Cut_A);close(Math.hypot(source.x-target.x,source.z-target.z),length);
  }
  close(r.lineLengthTo,ATTACHMENT_DEFS.find(d=>d.id==='tether_standard').minLength);
});

test('loaded route proves all translations and both whole-angle turns continuously',()=>{
  let last=C.route.seating.breakerPose;
  for(const leg of C.route.loadedLegs) {
    assert.deepEqual(leg.from,last,'no pose gap between phases');
    if(leg.kind==='rotate') {
      close(leg.from.x,leg.to.x);close(leg.from.z,leg.to.z);
      // Enclosing-circle separation proves every intervening angle, not just
      // a sampled selection of headings that could miss a corner collision.
      for(const obstacle of world)assert.ok(distanceToBox(leg.from,obstacle)>B.radius,
        `whole-angle turn circle intersects ${obstacle.id}`);
    } else {
      const from=parts(leg.from),to=parts(leg.to);
      from.forEach((p,i)=>disjoint(sweep(p.boxes,p.at,to[i].at),world,'loaded transit'));
    }
    internalClear(leg.to);last=leg.to;
  }
  const section=compose(last,B.loadPose);
  close(section.x,R.pose.x);close(section.z,R.pose.z);close(section.rot,R.pose.rot);
  close(Math.max(...placed(B.states.retained.boxes,last).map(b=>b.z1)),-217);
  close(Math.min(...receiverOpen.filter(b=>b.id==='rear_spine').map(b=>b.z0)),-215);
});

test('receiver admits carrier, holds original section, then closes only after withdrawal',()=>{
  const at=C.route.loadedLegs.at(-1).to,section=C.route.receiverPose;
  const source=point(R.pose,R.sockets.SOCKET_Service_Head),target=point(section,S.sockets.SOCKET_Cut_B);
  close(Math.hypot(source.x-target.x,source.z-target.z),C.route.coupling.receiverRestLength);
  disjoint(sweep(B.states.open.boxes,at,C.route.carrierWithdrawalTo),
    [...world,...placed(S.boxes,section)],'carrier withdrawal');
  disjoint(sweep(H.boxes,compose(at,headDock),compose(C.route.carrierWithdrawalTo,headDock)),
    [...world,...placed(S.boxes,section)],'head withdraws with carrier');
  const closure=R.states.open.boxes.map((b,i)=>union(aabb(b,R.pose),aabb(R.states.retained.boxes[i],R.pose)));
  disjoint(closure,[...shipbreak,...placed(S.boxes,section),
    ...placed(B.states.open.boxes,C.route.carrierWithdrawalTo)],'continuous clamp closing');
  // Closing around the carrier is genuinely illegal, not an animation choice.
  assert.throws(()=>disjoint(closure,placed(B.states.retained.boxes,at),'early closure'),/overlaps/);
  for(const c of C.existing.corridors)disjoint(placed(R.states.retained.boxes,R.pose),
    [{id:c.id,x0:c.x[0],x1:c.x[1],z0:c.protectedExitZ[0],z1:c.protectedExitZ[1]}],'preserved passage');
  assert.equal(C.persistence.retainedWorldObjectId,C.identities.payload);
  assert.equal(C.persistence.ordinaryConsumingReceivers,'unchanged');
  assert.deepEqual(C.persistence.salvagePool,{});
  assert.equal(B.mass+H.mass,3260,'one mounted head, no duplicated mass');
  assert.equal(H.motion.mountedMassOwnedBy,'cutterHead');
  assert.equal(H.motion.detachedMassOwnedBy,'cutterHead');
  const headAnchor=point(headDock,H.sockets.SOCKET_Mount),dock=B.sockets.SOCKET_Cutter_Dock;
  close(Math.hypot(headAnchor.x-dock.x,headAnchor.z-dock.z),C.route.headMount.restLength);
  assert.notEqual(C.route.headMount.owner,'breaker','mounted tool does not occupy carrier owned clamp slot');
});

test('fixed independent exhaust channels stay inside existing support solids and preserve propulsion axes',()=>{
  const expected={
    breaker:[
      ['MAIN_PORT_OUTER',[-89.9,0,-53.5],[-1,0,0]],['MAIN_PORT_INNER',[-89.9,0,-43.5],[-1,0,0]],
      ['MAIN_STARBOARD_INNER',[-89.9,0,43.5],[-1,0,0]],['MAIN_STARBOARD_OUTER',[-89.9,0,53.5],[-1,0,0]],
      ['RETRO_PORT',[89.9,0,-55],[1,0,0]],['RETRO_STARBOARD',[89.9,0,55],[1,0,0]],
      ['RCS_BOW_PORT',[64,0,-61.9],[0,0,-1]],['RCS_BOW_STARBOARD',[64,0,61.9],[0,0,1]],
      ['RCS_STERN_PORT',[-64,0,-61.9],[0,0,-1]],['RCS_STERN_STARBOARD',[-64,0,61.9],[0,0,1]],
    ],
    cutterHead:[
      ['AXIAL_AFT_PORT',[-5.3,0,-4.6],[-1,0,0]],['AXIAL_AFT_STARBOARD',[-5.3,0,4.6],[-1,0,0]],
      ['AXIAL_FORE_PORT',[-2.7,0,-4.6],[1,0,0]],['AXIAL_FORE_STARBOARD',[-2.7,0,4.6],[1,0,0]],
      ['LATERAL_PORT',[0,0,-5.85],[0,0,-1]],['LATERAL_STARBOARD',[0,0,5.85],[0,0,1]],
    ],
  };
  for(const [part,rows] of Object.entries(expected)){
    const asset=C.assets[part],channels=asset.propulsion.channels;
    assert.equal(channels.length,rows.length);
    channels.forEach((c,i)=>{
      const [id,mouth,normal]=rows[i],keys=['x','y','z'];
      assert.equal(c.id,id);assert.deepEqual(keys.map(k=>c.mouth[k]),mouth);
      assert.deepEqual(keys.map(k=>c.exhaustDirection[k]),normal);
      assert.deepEqual(asset.sockets[c.socket],c.mouth);
      assert.deepEqual(asset.socketDirections[c.socket],c.exhaustDirection);
      const support=(asset.states?.open.boxes||asset.boxes).find(b=>b.id===c.supportingSolid);
      assert.ok(support);assert.ok(!/shoe|ram|retention/.test(support.id),'Every propulsion housing is fixed');
      for(let axis=0;axis<3;axis++){
        const key=keys[axis],n=normal[axis],lip=n?0:c.lipRadiusWU;
        const min=Math.min(mouth[axis]+n*.04,mouth[axis]-n*c.depthWU)-lip;
        const max=Math.max(mouth[axis]+n*.04,mouth[axis]-n*c.depthWU)+lip;
        assert.ok(min>=support.center[key]-support.size[key]/2-EPS,`${id} low ${key}`);
        assert.ok(max<=support.center[key]+support.size[key]/2+EPS,`${id} high ${key}`);
      }
      const caps=part==='cutterHead'?[1.6,.7]:id.startsWith('RETRO')?[3.4,2.4]:[3,1.5];
      if(c.category==='retro'||c.category==='lateral'){
        assert.ok(c.depthWU<=caps[0]);assert.ok(c.lipRadiusWU<=caps[1]);
      }
      assert.ok(Object.isFrozen(c));
    });
  }
  assert.deepEqual(H.propulsion.thrustPoints,[{x:-4,y:0,z:-5},{x:-4,y:0,z:5}]);
  assert.equal(C.limits.newPersistentIdentities,3);
});
