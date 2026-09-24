// Observes completed evasions from fixed-tick body trajectories. Never writes physics or input.
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { bodyLife, journalFor, observeAppliedImpulse, angleBetween } from './stuntEvidence.js';

const pt=p=>({x:p.x,z:p.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function interceptSeconds(relative,velocity,radius) {
  const a=velocity.x**2+velocity.z**2,b=2*(relative.x*velocity.x+relative.z*velocity.z),c=relative.x**2+relative.z**2-radius**2;
  if(c<=0)return 0;
  const d=b*b-4*a*c;if(!(a>0)||d<0)return Infinity;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0?t:Infinity;
}
// Threat scan only needs bodies that can close in the 2s intercept window. Far rocks/pickups
// and opposite-hemisphere traffic were paying isHostileForAI on every entity every tick.
const THREAT_SCAN_RANGE_WU = 2400;
const THREAT_SCAN_RANGE_SQ = THREAT_SCAN_RANGE_WU * THREAT_SCAN_RANGE_WU;
function isThreatCandidateType(type) {
  return type === 'ship' || type === 'projectile' || type === 'drone';
}
function hostileThreat(state,e,player) {
  const owner=e.ownerId!=null?state.entities.get(e.ownerId):e;
  if(!owner||!isHostileForAI(state,owner,player))return false;
  return e.type==='projectile'||e.data?.ai?.activity?.targetId===player.id||e.data?.combat?.targetId===player.id;
}
export class StuntFlightObserver {
  constructor(){this.tracks=new Map();this.history=[];this.lastTick=-1;this.lastDamageTick=-Infinity;this.lastContactTick=-Infinity;}
  damage(tick){this.lastDamageTick=Math.max(this.lastDamageTick,tick);}
  contact(tick){this.lastContactTick=Math.max(this.lastContactTick,tick);}
  update(state) {
    const tick=state.tick,player=state.entities?.get(state.playerId),j=journalFor(state);
    if(!j||!player?.pos||!player.vel||player.alive===false||tick<=this.lastTick)return [];
    this.lastTick=tick;
    const life=bodyLife(player,state),u=life.cruise,L=life.length,pr=life.radius;
    let incoming=false;const results=[];
    const previous=this.history.at(-1);
    for(const e of state.entities.values()) {
      if(!e?.pos||!e.vel||e.alive===false||e.id===player.id)continue;
      if(!isThreatCandidateType(e.type))continue;
      const dx=e.pos.x-player.pos.x,dz=e.pos.z-player.pos.z;
      if(dx*dx+dz*dz>THREAT_SCAN_RANGE_SQ)continue;
      if(!hostileThreat(state,e,player))continue;
      const radius=pr+(e.radius??0),rv={x:e.vel.x-player.vel.x,z:e.vel.z-player.vel.z};
      const t=interceptSeconds({x:dx,z:dz},rv,radius);
      if(t<=2)incoming=true;
      const tl=bodyLife(e,state);let track=this.tracks.get(tl.id);
      if(!track&&t>=.2&&t<=1.2&&this.tracks.size<12) {
        track={id:`threat:${tl.id}:${tick}`,lifeId:tl.id,entityId:e.id,ownerId:e.ownerId??e.id,tick,intercept:t,
          playerPos:pt(player.pos),playerVel:pt(player.vel),threatPos:pt(e.pos),threatVel:pt(e.vel),radius,
          initialSeparation:Math.hypot(dx,dz),maxSeparation:0,minClearance:Infinity,relativeSpeed:0,rootId:null,completed:false};
        this.tracks.set(tl.id,track);
      }
      if(!track)continue;
      // Minimum over the actual swept relative segment, not distance at a single frame.
      if(track.lastRelative) {
        const ax=track.lastRelative.x,az=track.lastRelative.z,vx=dx-ax,vz=dz-az;
        const d=vx*vx+vz*vz,tau=d>0?Math.max(0,Math.min(1,-(ax*vx+az*vz)/d)):0;
        const clearance=Math.hypot(ax+tau*vx,az+tau*vz)-radius;
        if(clearance<track.minClearance){track.minClearance=clearance;track.relativeSpeed=Math.hypot(rv.x,rv.z);}
      }
      track.lastRelative={x:dx,z:dz};track.lastSeen=tick;
      track.maxSeparation=Math.max(track.maxSeparation,Math.hypot(dx,dz));
    }
    j.pressure={incomingInterception:incoming,tick};
    const controlled=Math.abs(state.input?.turn??0)+Math.abs(state.input?.throttle??0)+Math.abs(state.input?.strafe??0)>0.01
      ||state.input?.brake===true||state.input?.boost===true||state.input?.drawFlight===true;
    for(const [key,track] of this.tracks) {
      if(tick-track.tick>300){this.tracks.delete(key);continue;}
      if(track.completed)continue;
      const turn=angleBetween(track.playerVel,player.vel),dv=Math.hypot(player.vel.x-track.playerVel.x,player.vel.z-track.playerVel.z);
      let root=track.rootId?j.roots.get(track.rootId):null;
      if(!root) {
        const influence=j.bodies.get(life.id),physical=influence&&j.roots.get(influence.rootId);
        if(physical&&physical.tick>=track.tick&&physical.tick-track.tick<=120)root=physical;
        else if(controlled&&tick-track.tick<=72&&(turn>=20||dv>=.2*u)) {
          root=observeAppliedImpulse(player,track.playerVel,player.vel,{actorId:player.id},tick,'flight',state);
        }
        if(root){track.rootId=root.id;root.threatAtRoot=track.id;root.threatIds=[track.entityId];}
      }
      if(!root||tick-root.tick>180)continue;
      if(root.kind==='impulse_charge'&&tick-root.tick>=45&&!root.nodes.some(n=>n.kind==='launch_retained')) {
        const speed=Math.hypot(player.vel.x,player.vel.z),exitSpeed=Math.hypot(root.after.x,root.after.z);
        root.nodes.push({kind:'launch_retained',tick,entityId:player.id,lifeId:life.id,deltaV:Math.hypot(root.dv.x,root.dv.z),
          exitSpeed,retainedSpeed:speed,retainedTicks:tick-root.tick});
      }
      this._gap(state,player,life,root,track,previous);
      const escaped=distance(player.pos,track.playerPos)>=3*L&&track.maxSeparation-track.initialSeparation>=2*L
        &&tick-root.tick>=60&&this.lastDamageTick<root.tick&&this.lastContactTick<root.tick&&track.minClearance>0;
      if(!escaped)continue;
      track.completed=true;
      const closeShave=(turn>=20||dv>=.2*u)&&track.minClearance<=.35*pr&&track.relativeSpeed>=.75*u;
      root.escape={completed:true,threatIds:[track.entityId],threatLifeIds:[track.lifeId],boundaryIds:root.needle?.boundaryIds??[],boundaryLifeIds:root.needle?.boundaryLifeIds??[],completedTick:tick,
        threatEpisodeId:track.id,displacement:distance(player.pos,track.playerPos),separationGain:track.maxSeparation-track.initialSeparation,
        damageFreeTicks:tick-Math.max(root.tick,this.lastDamageTick),closestClearance:track.minClearance,closeShave};
      root.nodes.push({kind:'escape',tick,entityId:player.id,lifeId:life.id,threatId:track.entityId,...root.escape});
      results.push({tick,targetId:track.entityId,targetHostile:true,escape:root.escape,
        victimLife:{lifeId:track.lifeId,threatClass:'none',dead:false},
        stuntEvidence:structuredClone({revision:2,root,path:{tick,edges:0,usefulDeltaV:dv,
          momentum:root.kind==='flight'?0:life.mass*Math.hypot(root.dv.x,root.dv.z)},contact:null})});
    }
    const frame={tick,pos:pt(player.pos),vel:pt(player.vel),bodies:[]};
    for(const e of state.entities.values())if(e?.pos&&e.vel&&e.collides!==false&&e.id!==player.id&&distance(e.pos,player.pos)<L*8&&frame.bodies.length<32)
      frame.bodies.push({id:e.id,pos:pt(e.pos),vel:pt(e.vel),radius:e.radius??0});
    this.history.push(frame);if(this.history.length>121)this.history.shift();
    return results;
  }
  _gap(state,player,life,root,track,previous) {
    if(root.needle||!previous||this.lastContactTick>=track.tick||Math.hypot(player.vel.x,player.vel.z)<1.25*life.cruise)return;
    const old=this.history.find(f=>f.tick<=state.tick-30&&f.tick>=state.tick-31);if(!old)return;
    const diameter=2*life.radius,candidates=previous.bodies;
    for(let i=0;i<candidates.length;i++)for(let k=i+1;k<candidates.length;k++) {
      const a=state.entities.get(candidates[i].id),b=state.entities.get(candidates[k].id);
      if(!a?.pos||!b?.pos||!a.vel||!b.vel||a.alive===false||b.alive===false||a.ownerId===player.id||b.ownerId===player.id)continue;
      if(journalFor(state).bodies.has(bodyLife(a,state).id)||journalFor(state).bodies.has(bodyLife(b,state).id))continue;
      const aa=old.bodies.find(e=>e.id===a.id),bb=old.bodies.find(e=>e.id===b.id);if(!aa||!bb)continue;
      const gap=distance(a.pos,b.pos)-(a.radius??0)-(b.radius??0),prior=distance(aa.pos,bb.pos)-aa.radius-bb.radius;
      if(gap<1.1*diameter||gap>1.6*diameter||Math.abs(prior-gap)<.2*diameter)continue;
      if(distance(a.vel,player.vel)<.1*life.cruise||distance(b.vel,player.vel)<.1*life.cruise)continue;
      const x=b.pos.x-a.pos.x,z=b.pos.z-a.pos.z,len2=x*x+z*z;
      const along=((player.pos.x-a.pos.x)*x+(player.pos.z-a.pos.z)*z)/len2;
      const side=(player.pos.x-a.pos.x)*z-(player.pos.z-a.pos.z)*x;
      const oldSide=(previous.pos.x-candidates[i].pos.x)*(candidates[k].pos.z-candidates[i].pos.z)
        -(previous.pos.z-candidates[i].pos.z)*(candidates[k].pos.x-candidates[i].pos.x);
      if(along<=0||along>=1||side*oldSide>0||angleBetween(track.playerVel,player.vel)<20)continue;
      const hit=e=>interceptSeconds({x:e.pos.x-track.playerPos.x,z:e.pos.z-track.playerPos.z},
        {x:e.vel.x-track.playerVel.x,z:e.vel.z-track.playerVel.z},life.radius+(e.radius??0))<=3;
      if(!hit(aa)&&!hit(bb))continue;
      root.needle={tick:state.tick,boundaryIds:[a.id,b.id],boundaryLifeIds:[bodyLife(a,state).id,bodyLife(b,state).id],width:gap,priorWidth:prior,speed:Math.hypot(player.vel.x,player.vel.z)};
      root.nodes.push({kind:'needle_crossing',entityId:player.id,...root.needle});return;
    }
  }
  serialize(){return {revision:2,tracks:[...this.tracks],history:this.history,lastTick:this.lastTick,lastDamageTick:Number.isFinite(this.lastDamageTick)?this.lastDamageTick:null,lastContactTick:Number.isFinite(this.lastContactTick)?this.lastContactTick:null};}
  restore(raw){if(raw?.revision!==2)return;this.tracks=new Map((raw.tracks??[]).slice(0,12));this.history=(raw.history??[]).slice(-121);this.lastTick=raw.lastTick??-1;this.lastDamageTick=raw.lastDamageTick??-Infinity;this.lastContactTick=raw.lastContactTick??-Infinity;}
}
