import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
const root=new URL('.',import.meta.url);
const source=fs.readFileSync(process.argv[2] || new URL('../../../../../src/render/visualFactory.js',root),'utf8');
const blob=crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
if(blob!=='aba8b7cb9aa411907eb3d867f0f38892463484bd')throw Error('Wrong public factory');
function extract(name){const i=source.indexOf('function '+name+'(');if(i<0)throw Error(name);const n=source.slice(i+1).search(/\n(?:export )?function /);return source.slice(i,n<0?source.length:i+1+n);}
const cache=new Map();const get=(key,make)=>{if(!cache.has(key))cache.set(key,make());return cache.get(key);};
const funcs=new Function('THREE','getMaterial','getGeometry','stampSharedMaterialRole','SHARED_MATERIAL_ROLE','hashId','animateStation','payloadCommodityId','commodityPresentationFor','PICKUP_ROLE',
extract('emissiveMaterial')+'\n'+extract('buildBeacon')+'\n'+extract('buildPayload')+'\nreturn {buildBeacon,buildPayload};'
)(THREE,(k,f)=>get('m:'+k,f),(k,f)=>get('g:'+k,f),m=>m,{HULL:'hull'},()=>0,()=>{},()=>null,()=>{throw Error('Unexpected commodity')},{POD:'pod'});
const result={sourceBlob:blob,sourceCommit:'5e5b619b57c53be410e90c7e5f21bbb2fd0127f5',limits:['Source-slice primitive geometry, not full renderer or live game camera.','Material scalar properties transferred to Blender; game lighting, tone mapping and animation are not reproduced.','Blink/animation setup suppressed for a static comparison; material-role metadata omitted.','No commodity or volatile flags on this encounter.'],models:[]};
for(const [name,fn] of [['before_beacon',funcs.buildBeacon],['after_payload',funcs.buildPayload]]){
 const e={id:'runaway-kiln-review',type:name==='before_beacon'?'beacon':'payload',radius:23,data:{storyPropKind:'runaway_kiln',masslineTetherable:true}};
 const g=fn(e);g.updateMatrixWorld(true);const meshes=[];
 g.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position;const p=[];const v=new THREE.Vector3();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);p.push([v.x,-v.z,v.y]);}const ids=o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:a.count},(_,i)=>i);const normals=[]; const na=o.geometry.attributes.normal; const nm=new THREE.Matrix3().getNormalMatrix(o.matrixWorld); if(na){for(let i=0;i<na.count;i++){v.fromBufferAttribute(na,i).applyNormalMatrix(nm);normals.push([v.x,-v.z,v.y]);}} const m=o.material;meshes.push({positions:p,normals,indices:ids,color:m.color.toArray(),emissive:m.emissive?.toArray()||[0,0,0],emissiveIntensity:m.emissiveIntensity||0,roughness:m.roughness,metalness:m.metalness});});
 const b=new THREE.Box3().setFromObject(g);
 result.models.push({name,language:g.userData.visualLanguage,bounds:{min:b.min.toArray(),max:b.max.toArray()},triangles:meshes.reduce((s,m)=>s+m.indices.length/3,0),meshes});
}
fs.writeFileSync(new URL('geometry.json',root),JSON.stringify(result));
fs.writeFileSync(new URL('review.json',root),JSON.stringify({...result,models:result.models.map(({meshes,...r})=>({...r,meshCount:meshes.length}))},null,2));
console.log(result.models.map(m=>({name:m.name,bounds:m.bounds,triangles:m.triangles,meshCount:m.meshes.length})));

