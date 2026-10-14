import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Document, NodeIO } from '@gltf-transform/core';
import { validateAssetManifest, validateBank } from '../scripts/check-reusable-asset-bank.mjs';

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-asset-bank-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const doc = new Document(), buffer = doc.createBuffer();
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0, 1,0,0, 0,1,0])).setBuffer(buffer);
  const material = doc.createMaterial('Material_Hull');
  const primitive = doc.createPrimitive().setAttribute('POSITION', position).setMaterial(material);
  const mesh = doc.createMesh().addPrimitive(primitive);
  const scene = doc.createScene().addChild(doc.createNode('surface').setMesh(mesh));
  scene.addChild(doc.createNode('SOCKET_A'));
  const bytes = await new NodeIO().writeBinary(doc);
  const row = { assetId:'test_piece', category:'fixture', unit:'metre', description:'Contract test piece',
    bounds:{min:[0,0,0],max:[1,1,0]}, sockets:[{name:'SOCKET_A',position:[0,0,0],forward:[1,0,0],up:[0,1,0]}],
    collision:{type:'none',solids:[]}, lods:[] };
  for (let i=0;i<3;i++) { const file=`test_piece_lod${i}.glb`; await writeFile(path.join(dir,file),bytes);
    row.lods.push({level:i,file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),triangles:1,draws:1}); }
  const manifest=path.join(dir,'test_piece.json');
  async function save() { await writeFile(manifest,JSON.stringify(row)); }
  await save(); return {dir,row,manifest,save};
}
test('valid authored library validates without claiming visual acceptance', async t => {
  const f=await fixture(t); const result=await validateBank(f.dir);
  assert.equal(result.assets,1);assert.equal(result.glbs,3);assert.equal(result.accepted,undefined);
});
test('bank ignores review evidence receipts but still rejects malformed model sidecars', async t => {
  const f=await fixture(t); const evidence=path.join(f.dir,'evidence','recipes-v3');
  await mkdir(evidence,{recursive:true});
  await writeFile(path.join(evidence,'dependencies.json'),JSON.stringify({dependencies:[]}));
  assert.equal((await validateBank(f.dir)).assets,1);
  await writeFile(path.join(f.dir,'broken_piece.json'),JSON.stringify({assetId:null}));
  await assert.rejects(validateBank(f.dir),/invalid asset identity/);
});
test('review evidence alone does not make an empty bank pass', async t => {
  const f=await fixture(t); await rm(f.manifest);
  await mkdir(path.join(f.dir,'evidence'));
  await writeFile(path.join(f.dir,'evidence','dependencies.json'),'{}');
  await assert.rejects(validateBank(f.dir),/No model manifests found/);
});
for (const [name, mutate, error] of [
 ['changed byte receipts', r=>r.lods[0].bytes++, /byte count differs/],
 ['changed hash', r=>r.lods[0].sha256='0'.repeat(64), /hash differs/],
 ['path traversal', r=>r.lods[0].file='../outside.glb', /unsafe LOD path/],
 ['duplicate LOD', r=>r.lods[2].level=1, /ordered LOD/],
 ['geometry misreport', r=>r.lods[0].triangles=9, /geometry receipt differs/],
 ['bad scale declaration', r=>r.unit='centimetre', /explicit metres/],
 ['nonfinite bounds', r=>r.bounds.min[0]=null, /invalid bounds/],
 ['degenerate socket', r=>r.sockets[0].up=[1,0,0], /basis is degenerate/],
 ['wrong exported socket direction', r=>r.sockets[0].forward=[-1,0,0], /orientation disagrees/],
 ['wrong exported socket position', r=>r.sockets[0].position=[10,0,0], /position disagrees/],
 ['duplicate socket', r=>r.sockets.push({...r.sockets[0]}), /duplicate socket/],
 ['zero proxy extent', r=>{r.collision={type:'compound-boxes',solids:[{type:'box',center:[0,0,0],size:[0,1,1],rotation:[0,0,0,1]}]};}, /nonpositive collision/],
]) test(`rejects ${name}`, async t=>{ const f=await fixture(t);mutate(f.row);await f.save();await assert.rejects(validateAssetManifest(f.manifest),error); });
test('rejects missing files',async t=>{const f=await fixture(t);await rm(path.join(f.dir,f.row.lods[1].file));await assert.rejects(validateAssetManifest(f.manifest),/ENOENT/);});
test('rejects duplicate bank identities',async t=>{const f=await fixture(t);await writeFile(path.join(f.dir,'duplicate.json'),await readFile(f.manifest));await assert.rejects(validateBank(f.dir),/Duplicate bank asset identity/);});
