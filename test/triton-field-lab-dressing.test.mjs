import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { everydaySpaceKitDressingForSector as kit, EVERYDAY_SPACE_KIT_SALT,
  EVERYDAY_SPACE_KIT_MODEL_BY_ID as models } from '../src/data/everydaySpaceKitDressing.js';
import { tritonFieldLabDressingForSector as compose, TRITON_FIELD_LAB_PROPS as props,
  TRITON_FIELD_LAB_SECTOR as sector, TRITON_FIELD_LAB_POI as poiId,
  TRITON_FIELD_LAB_APPROACH as approach, TRITON_FIELD_LAB_WATCH_STOP as watch,
} from '../src/data/tritonFieldLabDressing.js';

const root = new URL('../', import.meta.url);
const poi = (x = 1600, z = -700) => ({ id: 73, poiId, type: 'anomaly', pos: { x, z } });
const anchors = (p = poi()) => ({ pois: [p], stations: [
  { stationId: 'station_triton', pos: { x: 480, z: -980 } },
] });
const rows = (p = poi()) => kit(sector, 'anomaly', () => 0.47, anchors(p));
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
  return distance(p,{x:a.x+t*dx,z:a.z+t*dz});
}

test('four existing released purposes replace, rather than extend, the Triton kit', () => {
  assert.equal(rows().length,4);
  assert.equal(new Set(rows().map(r=>r.placeId)).size,4);
  assert.deepEqual(rows().map(r=>[r.placeId,r.pos.x,r.pos.z]),[
    ['place_freight_platform',1645,-700],['place_utility_module',1668,-670],
    ['place_habitat_pod',1668,-730],['place_observation_blister',1615,-660],
  ]);
  for(const row of rows()) {
    assert.equal(row.radius,models[row.placeId].radius);
    assert.equal(row.everydaySpaceKit,true);
    assert.equal(row.anchor,'poi');
  }
  assert.equal(Object.keys(models).length,46,'no inflated model inventory');
});

test('only the actual unique visible Archive anomaly anchors its field office', () => {
  for(const pois of [[],[poi(),poi()], [{...poi(),type:'wreck'}],
    [{...poi(),hidden:true}], [{...poi(),poiId:'poi_triton_watcher'}],
    [{id:poiId,type:'anomaly',pos:{x:1600,z:-700}}]]) {
    assert.equal(compose(sector,{pois}),null);
    assert.ok(kit(sector,'anomaly',()=>0.47,{...anchors(),pois})
      .every(r=>!props.some(p=>p.name===r.name)));
  }
  for(const value of [null,'1600',NaN,Infinity,-Infinity]) {
    assert.equal(compose(sector,anchors(poi(value,-700))),null);
    assert.equal(compose(sector,anchors(poi(1600,value))),null);
  }
  assert.equal(compose('sector_veil_nebula',anchors()),null);
});

test('moved live POI, not fixed local coordinates or the unrelated station, supplies origin', () => {
  const moved=poi(51123,40987),input=anchors(moved);
  input.stations[0].pos={x:-60000,z:70000};
  input.pois.unshift({poiId:'unrelated',type:'anomaly',pos:{x:10,z:10}});
  const result=kit(sector,'anomaly',()=>0.47,input);
  result.forEach((r,i)=>{
    assert.deepEqual(r.pos,{x:moved.pos.x+props[i].offset.x,z:moved.pos.z+props[i].offset.z});
    assert.deepEqual(r.anchorPos,moved.pos);
  });
  input.pois.reverse();
  assert.deepEqual(kit(sector,'anomaly',()=>0.91,input),result);
});

test('repeat and serialized-anchor reconstruction do not mutate, consume RNG or duplicate rows', () => {
  const input=anchors(),snapshot=structuredClone(input);
  for(const palette of ['core','belt','fringe','anomaly']) {
    let calls=0;
    const first=kit(sector,palette,()=>{calls++;return 0.3;},input);
    const again=kit(sector,palette,()=>{calls++;return 0.9;},JSON.parse(JSON.stringify(input)));
    assert.deepEqual(again,first);assert.equal(first.length,4);assert.equal(calls,0);
    assert.ok(Object.isFrozen(first)&&first.every(r=>Object.isFrozen(r)&&Object.isFrozen(r.pos)));
  }
  assert.deepEqual(input,snapshot);
});

test('ordinary world consumer passes the live POI and keeps its existing placement owner', () => {
  const source=readFileSync(new URL('src/systems/world.js',root),'utf8');
  const method=source.match(/  _spawnEverydaySpaceKitDressing\(sector, active, paletteClass\) \{([\s\S]*?)\n  \},/);
  assert.ok(method);
  const run=new Function('everydaySpaceKitDressingForSector','EVERYDAY_SPACE_KIT_SALT',
    `return function(sector,active,paletteClass){${method[1]}\n}`)(kit,EVERYDAY_SPACE_KIT_SALT);
  const input=anchors(poi(51000,40260)),calls=[];
  const context={state:{meta:{seed:47},world:{residentSectors:{}}},
    helpers:{hash32:()=>17,mulberry32:()=>()=>0.47},
    _spawnPlaceProp:(active,s,id,pos,opts)=>calls.push({id,pos,opts})};
  run.call(context,{id:sector},input,'anomaly');
  assert.equal(calls.length,4);
  calls.forEach((call,i)=>{
    assert.deepEqual(call.pos,{x:51000+props[i].offset.x,z:40260+props[i].offset.z});
    assert.equal(call.id,props[i].placeId);assert.equal(call.opts.everydaySpaceKit,true);
  });
});

// Exact released-GLB identities, and their decoded rest-pose XZ bounds. Values
// include production draw centering; this is geometric clearance, not native
// flight, materials, lighting or a full renderer/save acceptance witness.
const geometry=[
  ['place_freight_platform','8857b8adfa02ffd43b8d0b0bff4b8945b60cf8a53e11fec84658cab585c3e3ab',[-12,12,-6.175757,6.175694]],
  ['place_utility_module','4fb29967042d11a4ccbdbc6b2576b7439073cd5035add181c3bbb700e71234b0',[-3.059993,3.059994,-2.159962,2.159963]],
  ['place_habitat_pod','31e453c8f953ffd39b53ebaaace94c05fa54891c8f6409ed3df445e0f226706d',[-5.888689,5.888689,-3.8,3.8]],
  ['place_observation_blister','e9515d6c765a85a56f4b03ae469586473da6802c63201586fd19486285ebb244',[-3.143463,3.143463,-3.15,3.15]],
];
test('actual released envelopes fit conservative radii and leave the west approach and watch stop open', () => {
  geometry.forEach(([id,digest,bounds],i)=>{
    const bytes=readFileSync(new URL(`assets/ships/release/parts/places/${id}.glb`,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),digest);
    assert.equal(bytes.toString('ascii',0,4),'glTF');
    const p=props[i];
    for(const x of bounds.slice(0,2))for(const z of bounds.slice(2))
      assert.ok(Math.hypot(x,z)<p.radius,`${id}: radius encloses actual rest geometry`);
    for(let j=1;j<approach.length;j++)
      assert.ok(segmentDistance(p.offset,approach[j-1],approach[j])>p.radius+36);
    assert.ok(distance(p.offset,watch.pos)>p.radius+watch.clearRadius);
    assert.ok(Math.hypot(p.offset.x,p.offset.z)+p.radius+36<180,
      'the example 180–300WU survey annulus stays open, without mandating it');
    for(const other of props.slice(i+1))
      assert.ok(distance(p.offset,other.offset)>p.radius+other.radius);
  });
});

test('habitat airlock faces its own working apron rather than the west approach', () => {
  const h=props[2],platform=props[0];
  const facing={x:-Math.cos(h.rot),z:-Math.sin(h.rot)};
  const toward={x:platform.offset.x-h.offset.x,z:platform.offset.z-h.offset.z};
  const length=Math.hypot(toward.x,toward.z);
  assert.ok(facing.x*toward.x/length+facing.z*toward.z/length>0.999);
});

test('existing Archive mast remains distinct and outside every new conservative envelope', () => {
  const source=readFileSync(new URL('src/systems/world.js',root),'utf8');
  const east=readFileSync(new URL('src/data/frontierRegions/east.js',root),'utf8');
  const census=JSON.parse(readFileSync(new URL('src/data/modelTruthCensus.json',root),'utf8'));
  const mast=census.rows.find(r=>r.id==='place_sensor_mast');
  assert.equal(mast.gameplay.entityRadius,14);
  assert.equal(mast.drawScale,1);
  assert.match(east,/id: 'poi_triton_field_lab',[\s\S]*?landmarkGlb: 'place_sensor_mast'/);
  // Actual authored row has neither landmark:true nor collides:true. It is a
  // radius10 presentation POI, not a new collider or a platform attachment.
  assert.match(source,/\(placeId && DRESSING_RADIUS\[placeId\]\) \|\| \(poi.landmark \? 24 : 10\)/);
  assert.match(source,/poi.collides !== false && \(poi.landmark \|\| poi.collides === true\)/);
  for(const p of props)assert.ok(Math.hypot(p.offset.x,p.offset.z)>10+p.radius);
  assert.equal(Math.hypot(props[0].offset.x,props[0].offset.z)-10-props[0].radius,7);
  for(const p of props){
    const r=census.rows.find(r=>r.id===p.placeId);
    assert.equal(r.gameplay.entityRadius,p.radius);
    assert.equal(r.drawScale,1,'runtime census reference matches decoded bounds');
  }
  // Execute the actual existing exclusion admission prelude, rather than
  // bypassing it in the consumer call recorder above.
  const prelude=source.split('  _spawnPlaceProp(active, sector, placeId, pos, options = {}) {')[1]
    .split('    const paletteClass =')[0];
  const admit=new Function('dist2',`return function(active,placeId,pos){${prelude};return true;}`)
    ((a,b)=>(a.x-b.x)**2+(a.z-b.z)**2);
  const carriers=new Map([[73,{pos:poi().pos,data:{poi:true,placeId:'place_sensor_mast'}}]]);
  const ctx={_poiCarrier:id=>carriers.get(id)};
  for(const row of rows())assert.equal(admit.call(ctx,anchors(),row.placeId,row.pos),true);
  carriers.get(73).data.dressingExclusionRadius=200;
  assert.equal(admit.call(ctx,anchors(),props[0].placeId,rows()[0].pos),null,
    'existing future exclusion remains authoritative; composition does not bypass it');
});
