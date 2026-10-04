import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function splitterSourceGraph(file){
 const bytes=readFileSync(file),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
 const materials=new Map(),textures=new Map();
 const texture=t=>{if(!t)return null;if(!textures.has(t)){const q=new THREE.Texture();q.name=t.getName();q.userData.sourceImageSha256=sha(t.getImage());textures.set(t,q);}return textures.get(t);};
 const material=m=>{if(!m)return new THREE.MeshStandardMaterial({name:'non-render-helper'});if(!materials.has(m)){const color=m.getBaseColorFactor();const q=new THREE.MeshStandardMaterial({name:m.getName(),color:new THREE.Color(...color.slice(0,3)),opacity:color[3],roughness:m.getRoughnessFactor(),metalness:m.getMetallicFactor(),map:texture(m.getBaseColorTexture()),normalMap:texture(m.getNormalTexture()),roughnessMap:texture(m.getMetallicRoughnessTexture()),metalnessMap:texture(m.getMetallicRoughnessTexture())});q.userData=m.getExtras();materials.set(m,q);}return materials.get(m);};
 const names={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',COLOR_0:'color',TANGENT:'tangent'};
 const node=n=>{let object;const primitives=n.getMesh()?.listPrimitives()||[];
  if(primitives.length>1)throw new Error('graph fixture requires the sealed one-material-per-node source');
  if(primitives.length){const p=primitives[0],g=new THREE.BufferGeometry();for(const sem of p.listSemantics()){const attr=p.getAttribute(sem);if(names[sem])g.setAttribute(names[sem],new THREE.BufferAttribute(attr.getArray().slice(),attr.getElementSize(),attr.getNormalized()));}if(p.getIndices())g.setIndex(new THREE.BufferAttribute(p.getIndices().getArray().slice(),1));object=new THREE.Mesh(g,material(p.getMaterial()));}
  else object=new THREE.Group();
  object.name=n.getName();object.userData=structuredClone(n.getExtras());new THREE.Matrix4().fromArray(n.getMatrix()).decompose(object.position,object.quaternion,object.scale);
  for(const child of n.listChildren())object.add(node(child));return object;};
 const src=doc.getRoot().listScenes()[0],scene=new THREE.Group();scene.name=src.getName();scene.userData=structuredClone(src.getExtras());for(const n of src.listChildren())scene.add(node(n));
 scene.updateMatrixWorld(true);return {scene,asset:json.asset,sha256:sha(bytes),bytes:bytes.length};
}
