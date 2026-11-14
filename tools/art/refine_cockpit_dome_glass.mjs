/** Prepare the reviewed dome-glass material without regenerating its finished geometry.
 * node tools/art/refine_cockpit_dome_glass.mjs --source INPUT.glb --out OUTPUT.glb
 * Never publishes release assets. The input is pinned to the reviewed prepared source;
 * recover that source from Git blob 5a79667cf5c96ae7ea6f18cd41baa716d6b51db5 with a
 * binary-safe Node spawn of `git cat-file blob` if it has already been promoted.
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
const sourcePath=await realpath(options['--source']);
const out=join(await realpath(dirname(resolve(options['--out']))),basename(options['--out'])),sidecar=`${out}.provenance.json`;
const key=value=>process.platform==='win32'?value.toLowerCase():value;
for(const path of [out,sidecar]){
  if(key(path)===key(sourcePath))throw Error('Output or sidecar collides with source');
  try{await lstat(path);throw Error(`Refusing to overwrite existing path: ${path}`);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reviewedHash='34adb6518bccf0d570108b796e869978f33776da3acca30ee65b88e5ac78d27a';
const original=await readFile(sourcePath);
if(hash(original)!==reviewedHash)throw Error('Unsupported input: use the reviewed prepared cockpit source');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(original),root=doc.getRoot();
assert.equal(root.listScenes()[0].getExtras().spacefaceAsset.assetId,'SF_COCKPIT_DOME');
const materials=root.listMaterials().filter(m=>m.getName()==='Material_Glass');
assert.equal(materials.length,1,'Expected one authored glass material');
const glass=materials[0];
glass.setBaseColorFactor([0.07,0.2,0.28,1]).setEmissiveFactor([0.01,0.03,0.05]).setRoughnessFactor(0.13);
if(hash(await readFile(sourcePath))!==reviewedHash)throw Error('Source changed during preparation');
const output=await io.writeBinary(doc);
let outputHandle,provenanceHandle;
try{
  outputHandle=await open(out,'wx');await outputHandle.writeFile(output);await outputHandle.close();
  provenanceHandle=await open(sidecar,'wx');
  await provenanceHandle.writeFile(`${JSON.stringify({recipe:'cockpit-dome-smoke-glass-v1',sourcePath,sourceSha256:reviewedHash,
    sourceGitBlob:'5a79667cf5c96ae7ea6f18cd41baa716d6b51db5',outputSha256:hash(output),
    scope:'Only Material_Glass base-color, emissive and roughness factors; geometry, textures and bindings preserved.'},null,2)}\n`);
  await provenanceHandle.close();
}catch(error){
  if(provenanceHandle){await provenanceHandle.close().catch(()=>{});await unlink(sidecar);}
  if(outputHandle){await outputHandle.close().catch(()=>{});await unlink(out);}
  throw error;
}
console.log(JSON.stringify({output:out,sha256:hash(output)}));
