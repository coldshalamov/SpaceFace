import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { SECTORS } from '../src/data/sectors.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ID='place_charon_colony_service_barge';
const json=p=>JSON.parse(readFileSync(resolve(ROOT,p),'utf8'));
function glb(p){const b=readFileSync(resolve(ROOT,p));return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString('utf8'));}
function sockets(d){return new Map(d.nodes.filter(n=>n.name?.startsWith('SOCKET_')).map(n=>[n.name,n]));}
function lodTris(d,lod){return d.nodes.filter(n=>n.name?.startsWith(`LOD${lod}_`)&&n.mesh!==undefined).reduce((n,node)=>n+d.meshes[node.mesh].primitives.reduce((a,p)=>a+d.accessors[p.indices].count/3,0),0);}
test('Charon only changes the evacuated colony artwork, preserving final claim scale and identity',()=>{
 const sectors=Array.isArray(SECTORS)?SECTORS:Object.values(SECTORS);
 const charon=sectors.find(s=>s.id==='sector_charon_expanse');assert.ok(charon);
 const colony=charon.pois.find(p=>p.id==='poi_colony');assert.equal(colony.landmarkGlb,ID);assert.equal(colony.visualRadius,20);
 assert.deepEqual(colony.pos,{x:-620,z:1420});assert.equal(sectors.flatMap(s=>s.pois||[]).filter(p=>p.landmarkGlb===ID).length,1);
});
test('colony export preserves donor sockets and keeps source-derived collision',()=>{
 const d=glb(`assets/ships/parts/places/${ID}.glb`);const old=glb('assets/ships/parts/places/place_conveyor_barge.glb');
 const a=sockets(old),b=sockets(d);assert.deepEqual([...a.keys()].sort(),[...b.keys()].sort());
 for(const [name,n]of a){const nn=b.get(name);assert.deepEqual(nn.extras,n.extras);for(let i=0;i<3;i++)assert.ok(Math.abs((nn.translation?.[i]||0)-(n.translation?.[i]||0))<1e-5);}
 assert.equal(d.scenes[0].extras.spacefaceAsset.assetId,'SF_PLACE_CHARON_COLONY_SERVICE_BARGE');
 assert.equal(d.nodes.filter(n=>n.name==='COLLISION_HULL'&&n.mesh!==undefined).length,1);
 assert.ok(lodTris(d,0)>lodTris(old,0));assert.ok(lodTris(d,1)<lodTris(d,0));assert.ok(lodTris(d,2)<lodTris(d,1));
 // These bounds are derived from the exporter, not a shrunken gameplay proxy.
 const m=json('assets/ships/parts/parts_manifest.json');const row=m.parts.find(p=>p.id===ID),donor=m.parts.find(p=>p.id==='place_conveyor_barge');
 assert.deepEqual(row.bounds,donor.bounds);assert.equal(row.triangleMetric,'lod0');assert.equal(row.tris,lodTris(d,0));
 assert.ok(d.materials.some(m=>m.name==='Material_Canopy'&&!m.emissiveFactor?.some(Boolean)));
 assert.ok(!d.materials.some(m=>m.name==='Material_Emissive_Warm'));
});
test('colony has its own release package and measured solid skin',()=>{
 const pilots=json('assets/ships/render-packages/pilots.json').pilots;const pilot=pilots.find(p=>p.releaseAssetId===ID);assert.ok(pilot);
 const metadata=json(pilot.metadataUrl);assert.equal(metadata.assetId,pilot.assetId);assert.equal(metadata.provenance.sourceGlb.sha256,pilot.releaseSha256);
 const rows=json('src/data/modelTruthCensus.json').rows;const row=rows.find(r=>r.id===ID);assert.ok(row);assert.notEqual(row.status,'red');
 assert.equal(row.gameplay.entityRadius,48);
});
