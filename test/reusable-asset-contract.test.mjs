import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssetContract, inspectAssetDocument } from '../scripts/lib/reusableAssetContract.mjs';

const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function fixture() {
  const row = { assetId:'module', unit:'metre', description:'Test module',
    bounds:{min:[0,0,0],max:[1,1,0]}, sockets:[{name:'SOCKET_A',position:[0,0,0],forward:[1,0,0],up:[0,1,0]}],
    collision:{type:'none',solids:[]}, lods:[0,1,2].map(level => ({level,file:`module_lod${level}.glb`,bytes:100,triangles:1,draws:1,sha256:'a'.repeat(64)})) };
  const accessor = (array, type = 'VEC3') => ({getArray:()=>array, getType:()=>type, getCount:()=>array.length/(type==='VEC3'?3:1)});
  const primitive = {getMode:()=>4, getAttribute:()=>accessor(new Float32Array([0,0,0,1,0,0,0,1,0])), getIndices:()=>null, getMaterial:()=>({})};
  const mesh = {listPrimitives:()=>[primitive]};
  const node = (name, geometry = null, matrix = identity(), children = []) => ({getName:()=>name,getMesh:()=>geometry,getWorldMatrix:()=>matrix,listChildren:()=>children});
  const surface = node('surface',mesh), socket = node('SOCKET_A');
  const children = [surface,socket], scene = {listChildren:()=>children};
  const root = {listScenes:()=>[scene],getDefaultScene:()=>scene};
  const doc = {getRoot:()=>root};
  return {row,doc,root,scene,children,surface,socket,mesh,primitive,node,accessor};
}

test('valid contract and reachable scene produce measured costs without acceptance', () => {
  const f=fixture(); assert.equal(validateAssetContract(f.row),f.row);
  assert.deepEqual(inspectAssetDocument(f.doc,f.row,0),{triangles:1,draws:1,bounds:f.row.bounds});
});
for (const [name, mutate, error] of [
  ['missing identity',r=>delete r.assetId,/identity/],
  ['incorrect units',r=>r.unit='centimetre',/metres/],
  ['empty description',r=>r.description='  ',/description/],
  ['nonfinite bounds',r=>r.bounds.min[0]=NaN,/bounds/],
  ['reversed bounds',r=>r.bounds.min[0]=2,/reversed/],
  ['null socket',r=>r.sockets=[null],/socket name/],
  ['empty socket name',r=>r.sockets[0].name='',/socket name/],
  ['duplicate socket',r=>r.sockets.push({...r.sockets[0]}),/duplicate socket/],
  ['unnormalized basis',r=>r.sockets[0].up=[0,2,0],/normalized/],
  ['parallel basis',r=>r.sockets[0].up=[1,0,0],/degenerate/],
  ['unknown collision',r=>r.collision.type='hull',/collision/],
  ['empty compound collision',r=>r.collision.type='compound-boxes',/disagrees/],
  ['none collision with solids',r=>r.collision.solids=[{}],/disagrees/],
  ['null LOD',r=>r.lods[1]=null,/ordered LOD/],
  ['duplicate LOD file',r=>r.lods[1].file=r.lods[0].file,/duplicate LOD file/],
  ['POSIX traversal',r=>r.lods[0].file='../outside.glb',/unsafe/],
  ['Windows traversal',r=>r.lods[0].file='..\\outside.glb',/unsafe/],
  ['drive path',r=>r.lods[0].file='C:outside.glb',/unsafe/],
  ['NUL path',r=>r.lods[0].file='a\0.glb',/unsafe/],
  ['negative cost',r=>r.lods[0].triangles=-1,/cost/],
  ['fractional cost',r=>r.lods[0].draws=1.5,/cost/],
  ['unsafe cost integer',r=>r.lods[0].bytes=Number.MAX_SAFE_INTEGER+1,/cost/],
  ['malformed hash',r=>r.lods[0].sha256='not-a-hash',/hash/],
]) test(`rejects ${name}`,()=>{const f=fixture();mutate(f.row);assert.throws(()=>validateAssetContract(f.row),error);});
for (const row of [null,[],undefined,5]) test(`rejects malformed manifest ${JSON.stringify(row)}`,()=>assert.throws(()=>validateAssetContract(row),/invalid manifest/));
test('authored collision boxes remain supported',()=>{
 const f=fixture();f.row.collision={type:'compound-boxes',solids:[{type:'box',center:[0,0,0],size:[1,1,1],rotation:[0,0,0,1]}]};
 assert.doesNotThrow(()=>validateAssetContract(f.row));f.row.collision.solids[0].size[0]=0;
 assert.throws(()=>validateAssetContract(f.row),/nonpositive/);
});
test('socket roll mismatch is rejected even when forward agrees',()=>{
 const f=fixture();const matrix=identity();matrix[5]=-1;matrix[10]=-1;f.socket.getWorldMatrix=()=>matrix;
 assert.throws(()=>inspectAssetDocument(f.doc,f.row,0),/up orientation/);
});
test('detached socket cannot satisfy the active scene contract',()=>{
 const f=fixture();f.children.splice(1,1);f.root.listNodes=()=>[f.surface,f.socket];
 assert.throws(()=>inspectAssetDocument(f.doc,f.row,0),/absent/);
});
test('duplicate active sockets fail',()=>{const f=fixture();f.children.push(f.node('SOCKET_A'));assert.throws(()=>inspectAssetDocument(f.doc,f.row,0),/duplicated/);});
test('shared mesh definitions count each reachable instance',()=>{
 const f=fixture();f.children.push(f.node('second',f.mesh));
 const result=inspectAssetDocument(f.doc,f.row,0);assert.equal(result.triangles,2);assert.equal(result.draws,2);
});
test('unreachable meshes contribute no cost',()=>{
 const f=fixture();f.root.listMeshes=()=>[f.mesh,f.mesh,f.mesh];
 assert.equal(inspectAssetDocument(f.doc,f.row,0).draws,1);
});
test('transformed geometry, not local coordinates, must fit bounds',()=>{
 const f=fixture();const m=identity();m[12]=2;f.surface.getWorldMatrix=()=>m;
 assert.throws(()=>inspectAssetDocument(f.doc,f.row,0),/escapes declared bounds/);
 f.row.bounds={min:[2,0,0],max:[3,1,0]};assert.doesNotThrow(()=>inspectAssetDocument(f.doc,f.row,0));
});
test('coarser geometry may shrink inside the bind-pose envelope',()=>{
 const f=fixture();const m=identity();m[0]=.5;m[5]=.5;f.surface.getWorldMatrix=()=>m;
 assert.doesNotThrow(()=>inspectAssetDocument(f.doc,f.row,2));
});
for (const [name,mutate,error] of [
 ['nonfinite vertex',f=>f.primitive.getAttribute=()=>f.accessor([NaN,0,0,1,0,0,0,1,0]),/nonfinite vertex/],
 ['nonfinite transform',f=>{const m=identity();m[12]=Infinity;f.surface.getWorldMatrix=()=>m;},/nonfinite mesh transform/],
 ['nontriangle mode',f=>f.primitive.getMode=()=>1,/triangle/],
 ['non-VEC3 positions',f=>f.primitive.getAttribute=()=>f.accessor([0,0,0],'SCALAR'),/POSITION/],
 ['incomplete triangle',f=>f.primitive.getAttribute=()=>f.accessor([0,0,0]),/incomplete/],
 ['missing material',f=>f.primitive.getMaterial=()=>null,/material/],
 ['negative index',f=>f.primitive.getIndices=()=>f.accessor([-1,0,1],'SCALAR'),/index outside/],
 ['fractional index',f=>f.primitive.getIndices=()=>f.accessor([0,.5,1],'SCALAR'),/index outside/],
 ['oversized index',f=>f.primitive.getIndices=()=>f.accessor([0,1,3],'SCALAR'),/index outside/],
 ['empty active scene',f=>f.children.length=0,/no reachable/],
 ['scene cycle',f=>f.surface.listChildren=()=>[f.surface],/cyclic/],
 ['ambiguous scene',f=>{f.root.getDefaultScene=()=>null;f.root.listScenes=()=>[f.scene,f.scene];},/ambiguous/],
 ['singular socket basis',f=>{const m=identity();m[0]=0;f.socket.getWorldMatrix=()=>m;},/orientation/],
]) test(`rejects ${name}`,()=>{const f=fixture();mutate(f);assert.throws(()=>inspectAssetDocument(f.doc,f.row,0),error);});
test('single scene without explicit default is accepted',()=>{const f=fixture();f.root.getDefaultScene=()=>null;assert.doesNotThrow(()=>inspectAssetDocument(f.doc,f.row,0));});
test('indexed geometry is measured correctly',()=>{const f=fixture();f.primitive.getIndices=()=>f.accessor(new Uint16Array([0,1,2]),'SCALAR');assert.equal(inspectAssetDocument(f.doc,f.row,0).triangles,1);});
