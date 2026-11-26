/** Prepare a corrected legacy gatling part; does not overwrite or publish assets.
 * node tools/art/refine_gatling_placement.mjs --source INPUT.glb --out OUTPUT.glb
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve} from 'node:path';
import {lstat,open,readFile,realpath,unlink} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';

const options={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i];
  if(!['--source','--out'].includes(key)||!process.argv[i+1]||options[key])throw Error('Expected unique --source INPUT --out OUTPUT arguments');
  options[key]=process.argv[i+1];
}
if(!options['--source']||!options['--out'])throw Error('Required: --source INPUT --out OUTPUT');
const source=await realpath(options['--source']);
const out=join(await realpath(dirname(resolve(options['--out']))),basename(options['--out'])),sidecar=`${out}.provenance.json`;
const pathKey=value=>process.platform==='win32'?value.toLowerCase():value;
for(const path of [out,sidecar]){
  if(pathKey(path)===pathKey(source))throw Error('Output or sidecar collides with source');
  try{await lstat(path);throw Error(`Refusing to overwrite existing path: ${path}`);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHash='fb6a5fdf96f9ddbe1e1f7611d0f10cd1471c0f8ad45874bd6ff55115023023e4';
const bytes=await readFile(source);if(digest(bytes)!==sourceHash)throw Error('Unsupported input: use the reviewed gatling source');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(bytes),root=doc.getRoot();
const translations=new Map([
  ['DET_ammo_feed',[0.8,0.15,-0.35]],
  ['DET_mount_rail',[0.8,-0.55,0]],
  ['DET_scuff_plate',[0.8,0,0.42]],
]);
const close=(actual,expected)=>actual.length===expected.length&&actual.every((value,i)=>Math.abs(value-expected[i])<1e-6);
for(const [name,expected] of translations){
  const nodes=root.listNodes().filter(node=>node.getName()===name);assert.equal(nodes.length,1,`Expected one ${name}`);
  const node=nodes[0];assert.equal(node.getParentNode()?.getName(),'weapon_gatling');
  assert(node.getMesh()&&node.listChildren().length===0&&close(node.getTranslation(),expected)
    &&close(node.getRotation(),[0,0,0,1])&&close(node.getScale(),[1,1,1]),`Unexpected ${name} transform or hierarchy`);
  // The reviewed mesh vertices are already in gun-root coordinates. Removing the extra node
  // translation seats each detail without changing its vertices, materials or attachment hooks.
  node.setTranslation([0,0,0]);
}
if(digest(await readFile(source))!==sourceHash)throw Error('Source changed during preparation');
const output=await io.writeBinary(doc);let outputHandle,provenanceHandle;
try{
  outputHandle=await open(out,'wx');await outputHandle.writeFile(output);await outputHandle.close();
  provenanceHandle=await open(sidecar,'wx');
  await provenanceHandle.writeFile(`${JSON.stringify({recipe:'gatling-detail-placement-v1',sourcePath:source,sourceSha256:sourceHash,
    outputSha256:digest(output),nodes:[...translations.keys()],
    scope:'Remove three doubled detail translations; preserve all meshes, materials, textures, sockets and other transforms.'},null,2)}\n`);
  await provenanceHandle.close();
}catch(error){
  if(provenanceHandle){await provenanceHandle.close().catch(()=>{});await unlink(sidecar);}
  if(outputHandle){await outputHandle.close().catch(()=>{});await unlink(out);}
  throw error;
}
console.log(JSON.stringify({output:out,sha256:digest(output)}));
