// Dependency-free GLB 2.0 writer for Vesper's own static meshes and rigid-joint hierarchy.
// Runtime effects/choreography remain in vesperModel.js; this is a reproducible DCC interchange,
// not an extra model download or a second runtime asset source.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { buildVesperVisual, disposeVesperVisual } from '../../src/render/characters/vesperModel.js';
import { vesperEntitySpec } from '../../src/systems/vesper.js';
const destination=process.argv[2];if(!destination)throw new Error('Usage: node scripts/characters/export-vesper-models.mjs <output-directory>');
await mkdir(destination,{recursive:true});
for(const index of [-1,0,1,2]){
 const e=vesperEntitySpec(undefined,index);Object.assign(e.data.vesperPose,{met:true,phase:'listen',previousPhase:'listen',simTime:8});
 const root=buildVesperVisual(e);root.userData.updateAuthoredMotion(e,8,{reducedMotion:true});root.updateMatrixWorld(true);
 const gltf={asset:{version:'2.0',generator:'SpaceFace SV-3 authored rig exporter'},scene:0,scenes:[{nodes:[0]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[],
  extensionsUsed:['KHR_materials_clearcoat','KHR_materials_emissive_strength'],extras:{source:'src/render/characters/vesperModel.js',pose:'awake / rigid joints preserved; runtime choreography and harmonic shader surfaces remain in source'}};
 const chunks=[],materialMap=new Map();let byteLength=0;
 function accessor(array,itemSize,target){
  const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),start=byteLength;chunks.push(bytes);byteLength+=bytes.length;
  const pad=(4-byteLength%4)%4;if(pad){chunks.push(Buffer.alloc(pad));byteLength+=pad;}
  const bufferView=gltf.bufferViews.push({buffer:0,byteOffset:start,byteLength:bytes.length,target})-1;
  const a={bufferView,componentType:array instanceof Float32Array?5126:array instanceof Uint16Array?5123:5125,count:array.length/itemSize,type:{1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[itemSize]};
  if(target===34962&&itemSize===3){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){
   const k=i%3;a.min[k]=Math.min(a.min[k],array[i]);a.max[k]=Math.max(a.max[k],array[i]);}}
  return gltf.accessors.push(a)-1;
 }
 function material(m){if(materialMap.has(m))return materialMap.get(m);
  const index=gltf.materials.push({name:m.name,pbrMetallicRoughness:{baseColorFactor:[...m.color.toArray(),m.opacity],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??.5},
   emissiveFactor:m.emissive?.toArray()||[0,0,0],doubleSided:m.side===2,extensions:{KHR_materials_clearcoat:{clearcoatFactor:m.clearcoat||0,clearcoatRoughnessFactor:m.clearcoatRoughness||0},KHR_materials_emissive_strength:{emissiveStrength:m.emissiveIntensity??1}}})-1;
  materialMap.set(m,index);return index;}
 function node(o){
  if(o.material?.isShaderMaterial)return null;o.updateMatrix();const n={name:o.name||o.type,matrix:o.matrix.toArray()},id=gltf.nodes.push(n)-1;
  if(o.isMesh){const g=o.geometry,p={attributes:{POSITION:accessor(new Float32Array(g.attributes.position.array),3,34962),NORMAL:accessor(new Float32Array(g.attributes.normal.array),3,34962)},material:material(o.material),mode:4};
   if(g.attributes.uv)p.attributes.TEXCOORD_0=accessor(new Float32Array(g.attributes.uv.array),2,34962);
   if(g.index)p.indices=accessor(new Uint32Array(g.index.array),1,34963);n.mesh=gltf.meshes.push({name:o.name,primitives:[p]})-1;}
  const children=o.children.map(node).filter(x=>x!==null);if(children.length)n.children=children;return id;
 }
 node(root);gltf.buffers=[{byteLength}];const json=Buffer.from(JSON.stringify(gltf)),jsonPad=Buffer.alloc((4-json.length%4)%4,0x20),bin=Buffer.concat(chunks);
 const total=12+8+json.length+jsonPad.length+8+bin.length,header=Buffer.alloc(12),jh=Buffer.alloc(8),bh=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);
 jh.writeUInt32LE(json.length+jsonPad.length,0);jh.writeUInt32LE(0x4e4f534a,4);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
 const name=index<0?'vesper-sv3':['vesper-low-barrel','vesper-middle-fork','vesper-high-crown'][index];
 await writeFile(join(resolve(destination),`${name}.glb`),Buffer.concat([header,jh,json,jsonPad,bh,bin]));
 console.log(`${name}: ${gltf.meshes.length} static meshes, ${total} bytes`);disposeVesperVisual(root);
}
