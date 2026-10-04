// RAVEL owns its memory, four authored entities, and attack clocks. Physics and damage remain
// with their existing owners. Rendering never decides whether a hit, release, or victory happened.
import { RAVEL as C, RAVEL_LINES, freshRavelMemory, normalizeRavelMemory } from '../data/ravel.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { farActorTableRadius } from '../world/farActorTable.js';
import { finiteXZ, clamp, distanceXZ, spoolGoal, boundedServo, sweptWaveHit, playerOwnsSpoolLine } from '../characters/ravelRules.js';

export const RAVEL_GLOBAL_ANCHOR = Object.freeze(sectorLocalToGlobalForSector(C.anchor, C.sectorId));
const activePhase = p => ['windup','cast','exposed','recover'].includes(p);
export function ravelEntitySpec(part = 'core', index = 0, memory = freshRavelMemory()) {
  const core=part==='core', bit=1<<index, free=!!(memory.freed&bit);
  const radius=core?C.coreRadius:C.spoolRadius, mass=core?C.coreMass:C.spoolMass;
  return {
    type:'drone', name:core?C.name:`Ravel counterweight ${index+1}`, team:2, factionId:null,
    pos:core?{...RAVEL_GLOBAL_ANCHOR}:spoolGoal(index,0,RAVEL_GLOBAL_ANCHOR), radius,mass,
    hull:core?memory.hull:C.spoolHull,hullMax:core?C.hull:C.spoolHull,collides:true,
    flags:{invuln:true},
    physicsBody:{dynamic:!core,shape:'ball',radius,mass,useMeasuredSkin:false,material:'debris',ccd:true,
      contact:{friction:0.15,restitution:0.2,linearDamping:0.08,angularDamping:0.3}},
    data:{ravelPart:part,ravelIndex:index,authoredCharacter:C.id,identityKey:core?C.id:`${C.id}:spool:${index}`,
      // The census removes a far-table shell by this stamp: a body the table shelved returns
      // promoted but anonymous (the lean row drops ravelPart), and only the owner may kill it.
      persistenceOwner:'ravel',
      ai:{passive:true},homeSectorId:C.sectorId,callsign:C.callsign,
      scanLabel:core?'RAVEL · scan twice to challenge':`Counterweight ${index+1} · pull beyond outer teeth`,
      scannerSignalKind:'anomaly',visualRadius:core?300:11,
      ravelPose:{phase:memory.pacified?'peace':'sleep',simTime:0,charge:0,angle:0,waveRadius:0,
        freed:memory.freed,broken:memory.broken,loose:free,quiet:false,points:[]}},
  };
}
export function createRavel() {
 return {
  name:'ravel',
  init(ctx) {
    this.destroy(); this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers||{};
    this.state.ravel=normalizeRavelMemory(this.state.ravel);this._unsubs=[];this._restoring=false;
    this._reset();
    const on=(name,fn)=>{const off=this.bus.on(name,fn);if(typeof off==='function')this._unsubs.push(off);};
    on('scan:pulse',p=>this._scan(p));
    on('combat:damage',p=>this._damage(p));
    on('entity:killed',p=>this._killed(p));
    on('game:newGame',()=>this.newGame());
    on('save:restoring',()=>{this._restoring=true;this._cancel(false);});
    on('save:loaded',()=>{this._restoring=false;this._reset();this._sync();});
    on('sector:enter',p=>{if(!deferSectorEnterMaterialization(this.state,p,this._cookProvider))this._sync();});
    this._cookProvider=()=>this._syncSteps();
    (this.helpers.sectorCookProviders||(this.helpers.sectorCookProviders=[])).push(this._cookProvider);
  },
  _reset() {
    this._coreRef=null;this._spools=[null,null,null];this._phase=this.state?.ravel?.pacified?'peace':this.state?.ravel?.met?'idle':'sleep';
    this._elapsed=0;this._angle=0;this._waveHit=false;this._cycle=0;this._scanSeq=0;this._scanSource=null;
    this._syncAt=0;this._streaming=false;this._discovered=false;this._inside=false;this._quiet=0;this._lastVoice=-100;
    this._touched=[-100,-100,-100];this._held=[0,0,0];this._lastDistance=[0,0,0];
    this._previousPlayer=null;this._goal={x:0,z:0};this._delta={x:0,z:0};this._outImpulse={x:0,z:0};
  },
  _entity(ref){return ref&&this.state?.entities?.get(ref.id)===ref&&ref.alive?ref:null;},
  _core(){return this._entity(this._coreRef);},
  _player(){return this.state?.entities?.get(this.state.playerId);},
  _adventure(){const r=this.state.run;return (!r||!r.kind||r.kind==='adventure'||r.kind==='campaign')
    &&this.state.world?.currentSectorId===C.sectorId;},
  _live(){const p=this._player();return !this._restoring&&this._adventure()&&this.state.mode==='flight'
    &&this.state.timeScale>0&&p?.alive&&!p.flags?.docked&&finiteXZ(p.pos)&&finiteXZ(p.vel);},
  /** The far-actor table's exit radius: past it a drone is shelved and later promoted as an anonymous shell. */
  _exitRadius(){
    try{const r=farActorTableRadius(this.state);if(r&&Number.isFinite(r.exit)&&r.exit>400)return r.exit;}
    catch(_){/* minimal harness: no far-actor table */}
    return C.farFallback;
  },
  /** Distance streaming with hysteresis: the encounter is alive only while the player is near enough that the
   * far-actor table would leave it alone. The hysteresis band is also the roam bound — core and spools stay
   * within ~200 WU of the anchor (servo goals; a cast excursion is far inside the band). */
  _streamed(){
    const p=this._player();
    if(!p||!finiteXZ(p.pos))return this._streaming;
    const exit=this._exitRadius(),d=distanceXZ(p.pos,RAVEL_GLOBAL_ANCHOR);
    const limit=this._streaming?exit-C.streamOutMargin:exit-C.streamInMargin;
    return (this._streaming=d<=Math.max(limit,250));
  },
  _removeOwned(){/* Snapshot: removeEntity may splice the live list mid-walk, stranding every other part. */
    for(const e of (this.state?.entityList||[]).slice())if(e?.alive&&e.data?.ravelPart)this.helpers?.removeEntity?.(e.id);
    this._coreRef=null;this._spools=[null,null,null];},
  _sync() {
    // Sync lane (emit listener, save:loaded): drain the chunked steps inline —
    // the census drive holds the same generator across its slices.
    for(const _ of this._syncSteps()) { /* inline */ }
  },
  *_syncSteps() {
    if(this._restoring)return;
    const m=this.state.ravel;
    if(!this._adventure()||m.destroyed){this._streaming=false;this._cancel(false);this._removeOwned();this._inside=false;return;}
    if(!this._streamed()){this._cancel(false);this._removeOwned();this._inside=false;return;}
    const found=[null,null,null,null];
    // Snapshot the live list across yields; ravelPart bodies minted by a
    // suspended run are adopted on re-scan, not re-minted.
    for(const e of (this.state.entityList||[]).slice()) {
      yield;
      if(!e?.alive)continue;
      // A shell the far-actor table promoted from a shelved row keeps our owner stamp but not our part.
      if(!e.data?.ravelPart){if(e.data?.persistenceOwner==='ravel')this.helpers.removeEntity?.(e.id);continue;}
      const i=e.data.ravelPart==='core'?0:e.data.ravelIndex+1;
      if(!Number.isInteger(i)||i<0||i>3||found[i]||(i>0&&(m.broken&(1<<(i-1)))))this.helpers.removeEntity?.(e.id);
      else found[i]=e;
    }
    for(let i=0;i<4;i++) {
      yield;
      if(!found[i]&&!(i>0&&(m.broken&(1<<(i-1)))))
        found[i]=this.helpers.spawnEntity?.(ravelEntitySpec(i===0?'core':'spool',Math.max(0,i-1),m))||null;
    }
    this._coreRef=found[0];this._spools=found.slice(1);
    this._publish();
  },
  newGame(){this._removeOwned();this.state.ravel=freshRavelMemory();this._restoring=false;this._reset();},
  serialize(){return normalizeRavelMemory({...this.state.ravel,hull:this._core()?.hull??this.state.ravel.hull});},
  deserialize(raw){this._removeOwned();this.state.ravel=normalizeRavelMemory(raw);this._reset();},
  destroy(){
    for(const off of this._unsubs||[])off();this._unsubs=[];this._removeOwned();
    const providers=this.helpers?.sectorCookProviders;
    if(providers){const i=providers.indexOf(this._cookProvider);if(i>=0)providers.splice(i,1);}
    const q=this.state?.render?.deferredEnterMaterializers;
    if(q)for(let i=q.length-1;i>=0;i--)if(q[i].provider===this._cookProvider)q.splice(i,1);
    this._cookProvider=null;
  },
  _say(key,important=false){const now=this.state.simTime||0;
    if(!RAVEL_LINES[key]||(!important&&now-this._lastVoice<C.voiceCooldown))return false;
    this._lastVoice=now;const text=RAVEL_LINES[key];
    if(this.helpers.voice?.say)this.helpers.voice.say({id:`ravel:${key}`,channel:'comms',priority:important?62:24,text,ttl:8});
    else this.bus.emit('toast',{text,kind:'info',ttl:8});
    this.bus.emit('ravel:voice',{key,text});return true;},
  _sound(id){this.bus.emit('audio:cue',{id,position:{...RAVEL_GLOBAL_ANCHOR},gain:0.65});},
  _scan(p){
    if(!this._live())return;const player=this._player(),core=this._core();
    if(!core||p?.source!=='player-scanner'||p.scannerId!==player.id||!Number.isSafeInteger(p.seq)||p.seq<1
      ||!finiteXZ(p.pos)||distanceXZ(p.pos,player.pos)>2||!Number.isFinite(p.radius)||p.radius<=0)return;
    if(this._scanSource===player&&p.seq<=this._scanSeq)return;
    this._scanSource=player;this._scanSeq=p.seq;
    if(distanceXZ(core.pos,player.pos)>Math.min(C.scanRadius,p.radius))return;
    const m=this.state.ravel;
    if(m.pacified){this._say('welcome');return;}
    if(!m.met){m.met=true;this._phase='idle';this._say('hello',true);this._sound('sfx_ravel_wake');this._publish();return;}
    if(activePhase(this._phase)){this._cancel(true);return;}
    this._say('begin',true);this._beginWindup();
  },
  _cancel(speak){
    if(!this.state)return;const was=activePhase(this._phase);
    this._phase=this.state.ravel?.pacified?'peace':this.state.ravel?.met?'idle':'sleep';
    this._elapsed=0;this._held=[0,0,0];this._touched=[-100,-100,-100];this._previousPlayer=null;this._waveHit=false;
    if(was&&speak)this._say('cancel',true);this._publish();
  },
  _beginWindup(){
    const core=this._core(),p=this._player();if(!core||!p)return;
    // One aim sample. Never tracks a dodge after the warning appears.
    this._angle=Math.atan2(p.pos.z+clamp(p.vel.z*0.45,-45,45)-core.pos.z,p.pos.x+clamp(p.vel.x*0.45,-45,45)-core.pos.x);
    this._phase='windup';this._elapsed=0;this._waveHit=false;this._previousPlayer={x:p.pos.x,z:p.pos.z};
    this._sound('sfx_ravel_load');this._publish();
    this.bus.emit('ravel:telegraph',{angle:this._angle,duration:C.windup});
  },
  _impulse(e,dv){
    const mass=e.physicsBody?.mass??e.mass;
    if(!finiteXZ(dv)||!Number.isFinite(mass)||mass<=0)return false;
    this._outImpulse.x=dv.x*mass;this._outImpulse.z=dv.z*mass;
    return queuePhysicsImpulse(e,this._outImpulse,{source:'ravel',part:e.data?.ravelPart||'player'});
  },
  _cast(){
    this._phase='cast';this._elapsed=0;this._sound('sfx_ravel_cast');this._say('cast');
    const m=this.state.ravel;
    for(let i=0;i<3;i++) {
      const e=this._entity(this._spools[i]);if(!e||((m.freed|m.broken)&(1<<i))||playerOwnsSpoolLine(this.state,e))continue;
      // Physical counterweights move, collide and can be intercepted. They are not visual missiles.
      this._delta.x=Math.cos(this._angle+(i-1)*0.13)*C.castSpeed-e.vel.x;
      this._delta.z=Math.sin(this._angle+(i-1)*0.13)*C.castSpeed-e.vel.z;
      const n=Math.hypot(this._delta.x,this._delta.z);if(n>C.castSpeed*1.5){this._delta.x*=C.castSpeed*1.5/n;this._delta.z*=C.castSpeed*1.5/n;}
      this._impulse(e,this._delta);
    }
    this.bus.emit('ravel:cast',{angle:this._angle,cycle:this._cycle});
  },
  _wave(dt){
    if(this._waveHit)return;const p=this._player(),core=this._core();if(!p||!core)return;
    const old=this._previousPlayer||p.pos,travel=distanceXZ(old,p.pos);
    // Save/rebase/teleport discontinuities are not a hit. Ordinary high-speed flight is swept.
    if(travel>Math.max(80,(Math.hypot(p.vel.x,p.vel.z)+50)*dt*3))return;
    if(!sweptWaveHit(old,p.pos,core.pos,this._angle,C.waveStart+Math.max(0,this._elapsed-dt)*C.waveSpeed,
      C.waveStart+this._elapsed*C.waveSpeed,p.radius||4))return;
    this._waveHit=true;
    const dx=p.pos.x-core.pos.x,dz=p.pos.z-core.pos.z,n=Math.hypot(dx,dz)||1;
    this._delta.x=dx/n*C.waveDeltaV;this._delta.z=dz/n*C.waveDeltaV;this._impulse(p,this._delta);
    this.helpers.routeCombatDamage?.({attackerId:core.id,targetId:p.id,
      packet:{channels:{kinetic:C.waveDamage},flags:{},hit:{pos:{x:p.pos.x,z:p.pos.z}}},origin:'ravel:cast'});
    this.bus.emit('ravel:hit',{targetId:p.id,cycle:this._cycle});
  },
  _release(index,broken=false){
    const m=this.state.ravel,bit=1<<index;if((m.freed|m.broken)&bit)return;
    if(broken)m.broken|=bit;else m.freed|=bit;
    this._held[index]=0;this._say(broken?'broken':'freed',true);this._sound('sfx_ravel_unthread');
    this.bus.emit('ravel:unthreaded',{index,broken});
    if((m.freed|m.broken)===7){m.pacified=true;this._cancel(false);this._quiet=0;
      this._say(m.broken?'scarred':'peaceful',true);this._sound('sfx_ravel_peace');
      this.bus.emit('ravel:pacified',{nonviolent:m.broken===0});}
    this._publish();
  },
  _damage(p){
    const core=this._core();
    if(core&&p?.targetId===core.id&&p.applied>0)this.state.ravel.hull=core.hull;
  },
  _killed(p){
    if(!p||!this._adventure())return;
    const core=this._coreRef;
    if(core&&p.id===core.id&&this.state.entities.get(core.id)===core){
      this.state.ravel.destroyed=true;this.state.ravel.hull=0;this.state.ravel.pacified=false;
      this._cancel(false);this._say('dead',true);this.bus.emit('ravel:destroyed',{});this._removeOwned();return;
    }
    for(let i=0;i<3;i++){const e=this._spools[i];if(e&&p.id===e.id&&this.state.entities.get(e.id)===e)this._release(i,true);}
  },
  _publish(){
    const core=this._core();if(!core)return;const m=this.state.ravel,p=core.data.ravelPose;
    core.flags.invuln=this._phase!=='exposed';core.team=activePhase(this._phase)?1:2;
    p.phase=this._phase;p.simTime=this.state.simTime||0;p.angle=this._angle;
    p.charge=this._phase==='windup'?clamp(this._elapsed/C.windup,0,1):0;
    p.waveRadius=this._phase==='cast'?C.waveStart+this._elapsed*C.waveSpeed:0;
    p.waveFade=this._phase==='cast'?1-clamp(this._elapsed/C.cast,0,1):0;
    p.freed=m.freed;p.broken=m.broken;p.quiet=m.quiet&&m.pacified;
    p.exposed=this._phase==='exposed'?1-this._elapsed/C.exposed:0;
    for(let i=0;i<3;i++){
      const e=this._entity(this._spools[i]);let point=p.points[i];if(!point)point=p.points[i]={x:0,z:0,live:false};
      point.live=!!e&&!((m.freed|m.broken)&(1<<i));
      if(!e)continue;point.x=e.pos.x-core.pos.x;point.z=e.pos.z-core.pos.z;
      e.team=core.team;e.flags.invuln=!activePhase(this._phase)||!!(m.freed&(1<<i));
      const q=e.data.ravelPose;q.phase=this._phase;q.simTime=p.simTime;q.loose=!!(m.freed&(1<<i));
      q.charge=p.charge;q.stress=clamp(this._held[i]/C.freeHold,0,1);
    }
  },
  update(dt){
    if(!Number.isFinite(dt)||dt<=0||dt>0.1||this._restoring)return;
    const now=this.state.simTime||0;
    if(now>=this._syncAt){this._syncAt=now+1;this._sync();}
    if(!this._adventure()||!this._streaming)return;
    const core=this._core();if(!core)return;
    if(!this._live()){
      // Pause freezes phase and pose; docking/leaving flight cancels dangerous carryover.
      if(this.state.mode!=='flight'||this._player()?.flags?.docked)this._cancel(false);
      return;
    }
    const player=this._player(),d=distanceXZ(player.pos,core.pos),m=this.state.ravel;
    if(d>C.leashRadius){if(activePhase(this._phase))this._cancel(true);this._inside=false;this._quiet=0;this._publish();return;}
    if(!this._inside){this._inside=true;m.visits++;if(m.visits===3&&m.met)this._say('third',true);}
    if(!this._discovered&&d<C.discoverRadius){this._discovered=true;if(!m.met)this._say('discover');}
    const combat=activePhase(this._phase);
    for(let i=0;i<3;i++){
      const e=this._entity(this._spools[i]);if(!e)continue;
      const bit=1<<i,linked=playerOwnsSpoolLine(this.state,e),r=distanceXZ(core.pos,e.pos);
      if(linked)this._touched[i]=now;
      if(m.freed&bit){
        if(m.pacified&&!m.returned&&r<32&&linked){m.returned=true;this._say('returned',true);}
        continue;
      }
      if(combat&&now-this._touched[i]<=C.touchGrace&&r>C.freeRadius&&r<C.leashRadius){
        // A physically carried/throw-released spool needs sustained travel; a save teleport is not a win.
        if(Math.abs(r-this._lastDistance[i])<Math.max(40,Math.hypot(e.vel.x,e.vel.z)*dt*3))this._held[i]+=dt;
        else this._held[i]=0;
        if(this._held[i]>=C.freeHold){this._release(i);this._lastDistance[i]=r;continue;}
      } else this._held[i]=0;
      this._lastDistance[i]=r;
      if(!linked&&this._phase!=='cast'){
        spoolGoal(i,now,core.pos,this._goal);
        const dv=boundedServo(e,this._goal,dt,this._delta);if(dv)this._impulse(e,dv);
      }
    }
    if(m.pacified){
      this._quiet=d<150&&Math.hypot(player.vel.x,player.vel.z)<5?this._quiet+dt:0;
      if(!m.quiet&&this._quiet>=C.quietSeconds){m.quiet=true;this._say('quiet',true);}
    }else if(activePhase(this._phase)){
      this._elapsed+=dt;
      if(this._phase==='windup'&&this._elapsed>=C.windup)this._cast();
      else if(this._phase==='cast'){
        this._wave(dt);
        if(this._elapsed>=C.cast){this._phase='exposed';this._elapsed=0;this._say('exposed');}
      }else if(this._phase==='exposed'&&this._elapsed>=C.exposed){this._phase='recover';this._elapsed=0;}
      else if(this._phase==='recover'&&this._elapsed>=C.recover){this._cycle++;this._beginWindup();}
    }
    if(!this._previousPlayer)this._previousPlayer={x:player.pos.x,z:player.pos.z};
    this._previousPlayer.x=player.pos.x;this._previousPlayer.z=player.pos.z;
    this._publish();
  },
 };
}
export const ravel=createRavel();
