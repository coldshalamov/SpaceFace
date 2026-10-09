import {latchBodySpec,LATCH_RADIUS} from '../data/latchNineBody.js';
import {LATCH_ACTOR_KEY,isLatchActor} from '../data/latchNineIdentity.js';
import {resolveCollisionProxyManifest,proxyWorldPrimitives,effectiveCorridorBearingDeg} from '../data/collisionProxyManifests.js';
import {machineryPresentationPlace,markMachineryEffective} from '../core/machineryPresentation.js';
import {forgetLatchPropulsion} from './latchNinePropulsion.js';
import {registerLatchMaterializer,unregisterLatchMaterializer} from '../core/latchNineMaterialization.js';
const STATION='station_tethys',SECTOR='sector_tethys_junction',REQUESTER='latch-nine:tethys';
export function latchServicePlacement(station){
 const manifest=resolveCollisionProxyManifest(station),radius=Math.max(station.radius||0,station.data?.dockRadius||0,1);
 // Perpendicular to the actual corridor, outside both its radial throat and every authored
 // station primitive. Use measured primitive extents rather than the decorative station radius.
 let bound=radius;
 for(const p of manifest?proxyWorldPrimitives(station,manifest):[]){
  if(p.kind==='circle')bound=Math.max(bound,Math.hypot(p.x-station.pos.x,p.z-station.pos.z)+p.r);
  else if(p.kind==='capsule')bound=Math.max(bound,Math.hypot(p.ax-station.pos.x,p.az-station.pos.z)+p.r,Math.hypot(p.bx-station.pos.x,p.bz-station.pos.z)+p.r);
  else bound=Math.max(bound,Math.hypot(p.x-station.pos.x,p.z-station.pos.z)+Math.hypot(p.hx,p.hz));
 }
 const yaw=((manifest?.docking?effectiveCorridorBearingDeg(manifest,station):0)+90)*Math.PI/180+(station.rot||0),reach=bound+LATCH_RADIUS+35;
 const x=station.pos.x+Math.cos(yaw)*reach,z=station.pos.z+Math.sin(yaw)*reach;
 return {pos:{x,y:0,z},box:{minX:x-8,maxX:x+8,minZ:z-8,maxZ:z+8},stationBound:bound};
}
export function createLatchTenderOwner(ctx,{promoted,memory}){
 const state=ctx.state,helpers=ctx.helpers||{},owner={state,entity:null,life:null,body:null,departing:false,
  sync(){
   const memo=memory();
   if(this.departing||!promoted()||memo.destroyed||state.world?.currentSectorId!==SECTOR||state.run?.kind==='survival'){this.clear();return null;}
   const stations=(state.entityIndex?.stations||state.entityList||[]).filter(e=>e.alive&&e.type==='station'&&e.data?.stationId===STATION&&state.entities?.get(e.id)===e);
   if(stations.length!==1){this.clear();return null;}
   let e=this.entity;
   if(e&&(state.entities?.get(e.id)!==e||e.occupantGeneration!==this.life)){this.clear();e=null;}
   if(e&&(!e.alive||e.hull<=0))return e; // observer alone records semantic destruction
   if(!e){
    if(state.mode!=='flight'&&state.ui?.docked!==true)return null;
    // Do not adopt foreign same-tag actors, and never select one arbitrarily from duplicates.
    if((state.entityList||[]).some(other=>other.alive&&isLatchActor(other)&&state.entities?.get(other.id)===other))return null;
    const placement=latchServicePlacement(stations[0]);
    if((state.entityList||[]).some(other=>other.alive&&other.collides!==false&&other!==stations[0]&&Math.hypot(other.pos?.x-placement.pos.x,other.pos?.z-placement.pos.z)<LATCH_RADIUS+(other.radius||0)+4))return null;
    if(!helpers.spawnEntity||!helpers.spawnBudget||helpers.spawnBudget.request(1,REQUESTER)!==1)return null;
    try{
     e=helpers.spawnEntity({type:'prop',name:'Latch Nine',team:2,factionId:stations[0].factionId||null,pos:placement.pos,vel:{x:0,y:0,z:0},rot:0,angVel:0,radius:LATCH_RADIUS,mass:140,hull:180,hullMax:180,collides:true,physicsBody:latchBodySpec(),data:{role:'latch_nine',placeId:'place_latch_nine',identityKey:LATCH_ACTOR_KEY,persistenceOwner:'latchNine',homeSectorId:SECTOR,placeScale:1,latchNineService:{stationId:STATION,sectorId:SECTOR,box:placement.box},scannerSignalKind:'service',scanLabel:'Latch Nine · harbor guidance'}});
     if(!e||!helpers.spawnBudget.bindEntity(e.id,REQUESTER))throw Error('Latch budget binding failed');
    }catch(error){helpers.spawnBudget.release(REQUESTER);if(e)helpers.removeEntity?.(e.id);throw error;}
    this.entity=e;this.life=e.occupantGeneration;this.body=e.physicsBody;
   }
   const place=machineryPresentationPlace(e,state);
   if(place==='place_latch_nine'){
    if(e.physicsBody===false)e.physicsBody=this.body;e.collides=true;markMachineryEffective(e,state,place);
   }else{
    if(e.physicsBody)this.body=e.physicsBody;forgetLatchPropulsion(e);e.physicsBody=false;e.collides=false;markMachineryEffective(e,state,null);
   }
   return e;
  },clear(){const e=this.entity;if(e&&e.occupantGeneration===this.life){forgetLatchPropulsion(e);helpers.spawnBudget?.releaseEntity(e.id,e);if(state.entities?.get(e.id)===e)helpers.removeEntity?.(e.id);}this.entity=null;this.life=null;this.body=null;},
  destroy(){this.clear();unregisterLatchMaterializer(state,this);}
 };
 registerLatchMaterializer(state,owner);return owner;
}
