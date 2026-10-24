
import fs from 'node:fs';
import * as THREE from './node_modules/three/build/three.module.js';
import {buildFaunaMesh} from './src/render/faunaVisuals.js';
import {buildNurseryMineralRib} from './src/render/veilRayNurseryVisuals.js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const out={};
function extract(root){
 root.updateMatrixWorld(true);let meshes=[];
 root.traverse(o=>{
  if(!o.isMesh)return;
  const g=o.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),vc=g.getAttribute('color');
  const ids=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);
  for(let instance=0;instance<(o.isInstancedMesh?o.count:1);instance++){
   let M=o.matrixWorld.clone();if(o.isInstancedMesh){let im=new THREE.Matrix4();o.getMatrixAt(instance,im);M.multiply(im);}
   const N=new THREE.Matrix3().getNormalMatrix(M),v=[],norm=[];
   for(let i=0;i<p.count;i++){v.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(M).toArray());norm.push(new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(N).normalize().toArray());}
   const mat=o.material, groups=new Map();
   for(let j=0;j<ids.length;j+=3){const c=vc?new THREE.Color().fromBufferAttribute(vc,ids[j]).multiply(mat.color).toArray():mat.color.toArray();const key=c.join(',');if(!groups.has(key))groups.set(key,{color:c,ix:[]});groups.get(key).ix.push(ids.slice(j,j+3));}
   for(const group of groups.values())meshes.push({v,n:norm,ix:group.ix,color:group.color,emissive:mat.emissive?mat.emissive.clone().multiplyScalar(mat.emissiveIntensity).toArray():[0,0,0]});
  }
 });
 return meshes;
}
for(const [which,rows] of Object.entries(input)){
 out[which]={meshes:[],counts:[]};
 for(const row of rows){
  let e={...row,alive:true,occupantGeneration:1,data:row.data};
  const root=Number.isInteger(e.data?.veilNurseryRib)?buildNurseryMineralRib(e):buildFaunaMesh(e);
  if(root.userData.updateAuthoredMotion)root.userData.updateAuthoredMotion(e,12.1,{reducedMotion:true},null);
  root.position.set(row.x,0,row.z);root.rotation.y=-(row.rot||0);
  const m=extract(root);out[which].meshes.push(...m);out[which].counts.push({key:row.key||row.id,root:root.name,triangles:m.reduce((s,q)=>s+q.ix.length,0)});
 }
}
console.log(JSON.stringify(out));
