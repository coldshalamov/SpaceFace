// Offline diagnostic only: actual runtime meshes, not a game-camera capture.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import sharp from 'sharp';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { preloadCreatureSkinLibrary } from '../src/render/creatureSkinLibrary.js';
import { buildFaunaMesh as candidate } from '../src/render/faunaVisuals.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const baselineRoot = arg('--baseline-root');
if (!baselineRoot) throw new Error('Pass --baseline-root with the matching original runtime checkout');
const { buildFaunaMesh: baseline } = await import(pathToFileURL(path.resolve(baselineRoot, 'src/render/faunaVisuals.js')).href);
const out = pathToFileURL(path.resolve(arg('--output-dir') || 'artifacts') + path.sep);
fs.mkdirSync(out, {recursive:true});
const textureNames = ['tissue_basecolor.jpg', 'tissue_normal.png'];
const textureDir = path.resolve(arg('--texture-dir') || fileURLToPath(new URL('../assets/ships/release/surfaces/creature-skins/', import.meta.url)));
for (const name of textureNames) {
  const source = path.join(textureDir, name), destination = fileURLToPath(new URL(name, out));
  if (source !== destination) fs.copyFileSync(source, destination);
}
await preloadCreatureSkinLibrary(null, {loadTexture: async url => {
  const name = url.includes('normal') ? 'tissue_normal.png' : 'tissue_basecolor.jpg';
  const {data,info} = await sharp(new URL(name,out).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  return new THREE.DataTexture(data,info.width,info.height);
}});
globalThis.FileReader = class {
  readAsArrayBuffer(blob){ blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();}); }
  readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result=`data:${blob.type};base64,${Buffer.from(v).toString('base64')}`;this.onloadend?.();});}
};
const summary = {kind:'Offline procedural runtime geometry export, not live visual acceptance', textures:textureNames.map(name=>({name,repositoryPath:`assets/ships/release/surfaces/creature-skins/${name}`,sha256:crypto.createHash('sha256').update(fs.readFileSync(new URL(name,out))).digest('hex')})), specimens:[]};
for (const [label,build] of (process.argv.includes('--motion') ? [['candidate-charge',candidate],['candidate-flee',candidate]] : [['baseline',baseline],['candidate',candidate]])) {
  const e={id:4242,type:'fauna',radius:16,mass:200,rot:0,data:{ecology:{speciesId:'bolus_rib',driveState:'drift'}}};
  if (label.includes('-charge')) e.data.ecology.driveState='charge';
  if (label.includes('-flee')) e.data.ecology.driveState='flee';
  const root=build(e); root.rotation.y=-e.rot; root.userData.updateAuthoredMotion(e,label.includes('-')?0.314:0,{}); root.updateMatrixWorld(true);
  const direct={name:label,meshes:[]};
  root.traverse(m=>{if(!m.isMesh)return; const g=m.geometry;direct.meshes.push({name:m.name,positions:Array.from(g.attributes.position.array),normals:Array.from(g.attributes.normal.array),uvs:g.attributes.uv?Array.from(g.attributes.uv.array):null,indices:g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i),matrix:m.matrixWorld.toArray(),color:m.material.color.toArray(),emissive:m.material.emissive.toArray(),emissiveIntensity:m.material.emissiveIntensity,roughness:m.material.roughness,metalness:m.material.metalness});m.material=m.material.clone();m.material.map=null;m.material.normalMap=null;});
  const gltf=await new GLTFExporter().parseAsync(root,{binary:false,onlyVisible:true});
  gltf.extensionsUsed=[...new Set([...(gltf.extensionsUsed||[]),'KHR_texture_transform'])];
  const imagePrefix = (arg('--image-uri-prefix') || '').replace(/\/$/, '');
  gltf.images=textureNames.map(name=>({uri:imagePrefix ? `${imagePrefix}/${name}` : name}));
  gltf.samplers=[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987}];
  gltf.textures=[{source:0,sampler:0},{source:1,sampler:0}];
  for(const mat of gltf.materials){mat.pbrMetallicRoughness.baseColorTexture={index:0,extensions:{KHR_texture_transform:{scale:[3,2]}}};mat.normalTexture={index:1,scale:0.9,extensions:{KHR_texture_transform:{scale:[3,2]}}};}
  const bytes=JSON.stringify(gltf); fs.writeFileSync(new URL(`${label}.gltf`,out),bytes);fs.writeFileSync(new URL(`${label}-source.json`,out),JSON.stringify(direct));
  summary.specimens.push({label,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),triangles:direct.meshes.reduce((n,m)=>n+m.indices.length/3,0),draws:direct.meshes.length,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()});
}
fs.writeFileSync(new URL(process.argv.includes('--motion')?'motion-inspection.json':'inspection.json',out),JSON.stringify(summary,null,2)); console.log(JSON.stringify(summary,null,2));
