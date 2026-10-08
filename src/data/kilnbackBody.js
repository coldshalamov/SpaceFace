// SF20-08 physical concept contract for the retained source checkpoint.
// The default route remains unwired until its distinct Forge hull is built and
// these assembly envelopes are reconciled to that source. No asset is certified here.
export const KILNBACK_RADIUS=23;
export const KILNBACK_CASK_RADIUS=4;
export const KILNBACK_CORE_MASS=150;
export const KILNBACK_CASK_MASS=15;
const sockets=Object.freeze({cask_port:Object.freeze({x:-1,z:-10}),cask_starboard:Object.freeze({x:-1,z:10})});
const core=[[-14,-5],[-12,-7],[12,-7],[14,-5],[14,5],[12,7],[-12,7],[-14,5]];
function caskPoints(x,z){const points=[];
  for(let i=0;i<=8;i++){const a=-Math.PI/2+i*Math.PI/8;points.push([x+2+Math.cos(a)*1.5,z+Math.sin(a)*1.5]);}
  for(let i=0;i<=8;i++){const a=Math.PI/2+i*Math.PI/8;points.push([x-2+Math.cos(a)*1.5,z+Math.sin(a)*1.5]);}
  return points;
}
function part(id,points,radius){return {id,points:points.map(([x,z])=>({x:x/radius,z:z/radius}))};}
function proxy(id,parts,radius){return {schemaVersion:1,id,referenceRadius:'radius',convexParts:parts,
  primitives:parts.map(p=>{const xs=p.points.map(q=>q.x),zs=p.points.map(q=>q.z);
    const lowX=Math.min(...xs),highX=Math.max(...xs),lowZ=Math.min(...zs),highZ=Math.max(...zs);
    return {kind:'obb',id:p.id,x:(lowX+highX)/2,z:(lowZ+highZ)/2,hx:(highX-lowX)/2,hz:(highZ-lowZ)/2};})};}
export function kilnbackCaskSocket(id){if(!sockets[id])throw new Error('Unknown Kilnback cask: '+id);return {...sockets[id]};}
export function kilnbackMouthSocket(){return {x:14,z:0};}
export function kilnbackPhysicalBody(attachedIds=Object.keys(sockets),revision=0){
  const attached=new Set(attachedIds);if([...attached].some(id=>!sockets[id]))throw new Error('Unknown Kilnback attached cask');
  const parts=[part('core',core,KILNBACK_RADIUS)];
  for(const id of Object.keys(sockets))if(attached.has(id)){const p=sockets[id];parts.push(part(id,caskPoints(p.x,p.z),KILNBACK_RADIUS));}
  const bitmap=Object.keys(sockets).map(id=>attached.has(id)?'1':'0').join('');
  return {schemaVersion:1,dynamic:true,mass:KILNBACK_CORE_MASS+attached.size*KILNBACK_CASK_MASS,
    inertiaY:12250+attached.size*1587.5,radius:KILNBACK_RADIUS,revision,ccd:true,material:'ship',shape:'compound',
    collisionProxyManifest:proxy('kilnback:physical-contract:v1:'+bitmap,parts,KILNBACK_RADIUS)};
}
export function kilnbackCaskPhysicalBody(id){kilnbackCaskSocket(id);
  return {schemaVersion:1,dynamic:true,mass:KILNBACK_CASK_MASS,inertiaY:72.5,
    radius:KILNBACK_CASK_RADIUS,ccd:true,material:'ship',shape:'compound',
    collisionProxyManifest:proxy('kilnback:cask:physical-contract:v1:'+id,[part(id,caskPoints(0,0),KILNBACK_CASK_RADIUS)],KILNBACK_CASK_RADIUS)};
}
