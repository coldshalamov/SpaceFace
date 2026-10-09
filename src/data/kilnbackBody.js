// SF20-08 native geometry from Forge kilnback/ and kilnback_cask/measured-contract.json.
// Semantic masses stay authored: 150 core + two original 15-mass casks.
export const KILNBACK_RADIUS=23;
export const KILNBACK_CASK_RADIUS=4;
export const KILNBACK_CORE_MASS=150;
export const KILNBACK_CASK_MASS=15;
const sockets=Object.freeze({cask_port:Object.freeze({x:-1,z:-10}),cask_starboard:Object.freeze({x:-1,z:10})});
// XZ convex hulls of the measured Forge COLLISION assemblies; source scale 1.
// Main core excludes the cask air gaps and render-only pipework.
const sourceParts={"core":[[-13.721355,-3.322075],[-13.636383,-4.502289],[-11.792818,-6.094917],[-5.0,-6.8],[7.5,-6.7],[11.1,-5.6],[12.500207,-4.803148],[13.993006,-2.80038],[13.994056,-2.796804],[13.995123,2.796534],[12.500206,4.803148],[11.1,5.6],[7.500002,6.7],[-5.0,6.8],[-11.792818,6.094916],[-13.636383,4.502289],[-13.721355,3.322075]],"cask_port":[[-4.500287,-10.360692],[-4.157706,-11.150492],[-3.866365,-11.518357],[1.867083,-11.517704],[2.157706,-11.150492],[2.500286,-10.360691],[2.500286,-9.63931],[2.157705,-8.849507],[1.866365,-8.481644],[-3.867083,-8.482297],[-4.157706,-8.849508],[-4.500287,-9.639309]],"cask_starboard":[[-4.500287,9.639309],[-4.157705,8.849507],[-3.866365,8.481644],[1.867083,8.482297],[2.157705,8.849507],[2.500286,9.63931],[2.500286,10.360691],[2.157706,11.150492],[1.866365,11.518357],[-3.867084,11.517704],[-4.157706,11.150492],[-4.500287,10.360692]]};
const looseCask=[[-3.500286,-0.360691],[-3.157706,-1.15049],[-2.866364,-1.518357],[2.867083,-1.517703],[3.157706,-1.15049],[3.500286,-0.360691],[3.500286,0.360691],[3.157706,1.15049],[2.866364,1.518357],[-2.867083,1.517703],[-3.157706,1.15049],[-3.500286,0.360691]];
function part(id,points,radius){return {id,points:points.map(([x,z])=>({x:x/radius,z:z/radius}))};}
function proxy(id,parts,radius){return {schemaVersion:1,id,referenceRadius:'radius',convexParts:parts,
  primitives:parts.map(p=>{const xs=p.points.map(q=>q.x),zs=p.points.map(q=>q.z);
    const lowX=Math.min(...xs),highX=Math.max(...xs),lowZ=Math.min(...zs),highZ=Math.max(...zs);
    return {kind:'obb',id:p.id,x:(lowX+highX)/2,z:(lowZ+highZ)/2,hx:(highX-lowX)/2,hz:(highZ-lowZ)/2};})};}
export function kilnbackCaskSocket(id){if(!sockets[id])throw new Error('Unknown Kilnback cask: '+id);return {...sockets[id]};}
export function kilnbackMouthSocket(){return {x:14,z:0};}
export function kilnbackPhysicalBody(attachedIds=Object.keys(sockets),revision=0){
  const attached=new Set(attachedIds);if([...attached].some(id=>!sockets[id]))throw new Error('Unknown Kilnback attached cask');
  const parts=[part('core',sourceParts.core,KILNBACK_RADIUS)];
  for(const id of Object.keys(sockets))if(attached.has(id)){parts.push(part(id,sourceParts[id],KILNBACK_RADIUS));}
  const bitmap=Object.keys(sockets).map(id=>attached.has(id)?'1':'0').join('');
  return {schemaVersion:1,dynamic:true,mass:KILNBACK_CORE_MASS+attached.size*KILNBACK_CASK_MASS,
    inertiaY:12250+attached.size*1587.5,radius:KILNBACK_RADIUS,revision,ccd:true,material:'ship',shape:'compound',
    collisionProxyManifest:proxy('kilnback:forge:v1:'+bitmap,parts,KILNBACK_RADIUS)};
}
export function kilnbackCaskPhysicalBody(id){kilnbackCaskSocket(id);
  return {schemaVersion:1,dynamic:true,mass:KILNBACK_CASK_MASS,inertiaY:72.5,
    radius:KILNBACK_CASK_RADIUS,revision:0,ccd:true,material:'ship',shape:'compound',
    collisionProxyManifest:proxy('kilnback:cask:forge:v1:'+id,[part(id,looseCask,KILNBACK_CASK_RADIUS)],KILNBACK_CASK_RADIUS)};
}
