import { SABLE_VENN as S, freshSableVenn, normalizeSableVenn, sableVennWorkshop, sableVennServiceAvailable } from '../data/sableVenn.js';
import { makeShipEntitySpec } from './ships.js';
import { SABLE_VENN_RADIUS, SABLE_VENN_VISUAL_RADIUS, sableVennPhysicalBody } from '../data/sableVennBody.js';
import { resolveCollisionProxyManifest, proxyOuterRadiusWu, effectiveCorridorBearingDeg, hullEnvelopeWu } from '../data/collisionProxyManifests.js';

function berthPosition(state,station){
  const manifest=resolveCollisionProxyManifest(station);
  const outer=manifest?proxyOuterRadiusWu(manifest,station):station.radius;
  const distance=outer+SABLE_VENN_RADIUS+24;
  if(distance>station.radius+250-SABLE_VENN_RADIUS)return null;
  // A workshop stays off the real approach lane; its whole hull clears the
  // resolved station proxy. Nearby traffic may defer this bounded visit.
  const axis=(station.rot||0)+(manifest?effectiveCorridorBearingDeg(manifest,station)*Math.PI/180:0);
  for(const side of [1,-1,0.75,-0.75,1.25,-1.25]){
    const angle=axis+side*Math.PI/2,pos={x:station.pos.x+Math.cos(angle)*distance,z:station.pos.z+Math.sin(angle)*distance};
    if((state.entityList||[]).some(e=>e!==station&&e.alive!==false&&e.collides!==false&&['ship','asteroid','wreck','station'].includes(e.type)
      &&Math.hypot(e.pos.x-pos.x,e.pos.z-pos.z)<SABLE_VENN_RADIUS+hullEnvelopeWu(e)+6))continue;
    return pos;
  }
  return null;
}

export const sableVenn={
  name:'sableVenn',
  init(ctx){this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers;this.registry=ctx.registry;this._unsubs=[];this._nextTick=0;this._reserved=false;
    this.state.sableVenn=normalizeSableVenn(this.state.sableVenn);
    const on=(e,fn)=>this._unsubs.push(this.bus.on(e,fn));
    on('module:purchased',p=>{
      const player=this.state.player,owned=player.ownedShips?.[p?.shipIndex??player.activeShipIndex];
      const instance=Number.isInteger(p?.fitSlotIndex)?owned?.fittedInstances?.[p.fitSlotIndex]
        :player.moduleInventory?.find(item=>item.instanceId===p?.instanceId);
      if(!instance?.instanceId||instance.instanceId!==p?.instanceId||instance.defId!==p?.defId)return;
      const memory=this.state.sableVenn,first=!memory.met;memory.met=true;memory.lastReceiptId='module:'+instance.instanceId;
      if(first)this.bus.emit('toast',{text:'Sable Venn · Bring that fit to Ceres Refinery. I fix the part between what a ship promises and what it does.',kind:'info',ttl:6});
      this._nextTick=0;this._visit();
      const actor=sableVennWorkshop(this.state);if(actor)actor.data.sableVenn={phase:'receipt',tick:this.state.tick,receiptId:memory.lastReceiptId};
    });
    on('sable:demonstrated',p=>{
      if(!sableVennServiceAvailable(this.state)||typeof p?.moduleId!=='string')return;
      const next=normalizeSableVenn({...this.state.sableVenn,demonstratedItemIds:[...this.state.sableVenn.demonstratedItemIds,p.moduleId]});
      this.state.sableVenn=next;const actor=sableVennWorkshop(this.state);if(actor)actor.data.sableVenn={phase:'demonstrate',tick:this.state.tick,moduleId:p.moduleId};
    });
    on('sector:enter',()=>{this._nextTick=0;});
    on('sector:exit',()=>this._release());
    on('save:restoring',()=>{this._nextTick=0;this._reserved=false;});
    on('entity:killed',p=>{const e=this.state.entities.get(p?.entityId??p?.id??p?.targetId);if(e?.data?.worldRecordId===S.worldRecordId){
      this.state.sableVenn.workshopLost=true;this.helpers.spawnBudget?.releaseEntity(e.id,e);}});
    on('game:newGame',()=>this.newGame());
  },
  update(_dt,state){if(state.tick<this._nextTick)return;this._nextTick=state.tick+60;this._visit();},
  _visit(){
    const state=this.state,budget=this.helpers.spawnBudget;
    if(state.world?.currentSectorId!==S.sectorId||!state.sableVenn.met||state.sableVenn.workshopLost)return;
    const existing=sableVennWorkshop(state);
    if(existing){
      if(budget?.ownerForEntity(existing.id)!==S.worldRecordId&&(!budget||(!budget.bindEntity(existing.id,S.worldRecordId)
        &&(budget.request(1,S.worldRecordId)!==1||!budget.bindEntity(existing.id,S.worldRecordId)))))this._release();
      else this._reserved=false;
      return;
    }
    const station=state.entityList.find(e=>e.alive!==false&&e.type==='station'&&e.data?.stationId===S.stationId);
    if(!station||!budget)return;const pos=berthPosition(state,station);if(!pos||(!this._reserved&&budget.request(1,S.worldRecordId)!==1))return;
    const spec=makeShipEntitySpec(S.shipId,{team:2,factionId:station.factionId,pos,ai:{passive:true,allowPassiveManeuver:false,archetype:'fleeing_trader'}});
    Object.assign(spec,{radius:SABLE_VENN_RADIUS,physicsBody:sableVennPhysicalBody(spec.mass),flags:{persistent:true}});
    spec.data={...spec.data,worldRecordId:S.worldRecordId,sectorId:S.sectorId,homeSectorId:S.sectorId,transientSector:true,
      persistenceOwner:'sableVenn',authoredAssetId:'SF_SHIP_SABLE_PATCHWORK',visualRadius:SABLE_VENN_VISUAL_RADIUS,
      role:'shipwright',callsign:S.callsign,name:'Sable Venn · Patchwork',intent:{moveZ:0,moveX:0,turn:0,brake:true},sableVenn:{phase:'available',tick:state.tick}};
    let actor;try{actor=this.helpers.spawnEntity(spec);}catch(error){budget.release(S.worldRecordId);throw error;}
    this._reserved=false;if(!actor||!budget.bindEntity(actor.id,S.worldRecordId)){if(actor)this.helpers.removeEntity?.(actor.id);budget.release(S.worldRecordId);}
  },
  _release(){const actor=sableVennWorkshop(this.state);if(actor)this.helpers.removeEntity?.(actor.id);this.helpers.spawnBudget?.release(S.worldRecordId);this._reserved=false;},
  serialize(){return normalizeSableVenn(this.state.sableVenn);},
  deserialize(raw){this.state.sableVenn=normalizeSableVenn(raw);this._nextTick=0;
    this._reserved=this.state.world?.currentSectorId===S.sectorId&&this.state.sableVenn.met&&!this.state.sableVenn.workshopLost
      &&this.helpers.spawnBudget?.request(1,S.worldRecordId)===1;
  },
  newGame(){this._release();this.state.sableVenn=freshSableVenn();this._nextTick=0;},
  destroy(){this._release();for(const off of this._unsubs||[])off?.();this._unsubs=[];},
};
