// BLACK FLAG coordinator. Canonical owners perform combat, control, cargo, law and settlement.
import { admitVessel, captureReadiness, currentSector, ensureShipjack, finite, isBlackFlagAdventure, normalizeShipjack, peekShipjack, queryShipjack, registryOwnerLabel, SHIPJACK_LIMITS, vesselForEntity, vesselHistory } from '../shipjack/model.js';
import { advanceYardOperations, executeYardOperation } from '../shipjack/yardOperations.js';
import { BLACK_FLAG_ENCOUNTERS } from '../data/blackFlag.js';
import { SECTORS } from '../data/sectors.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from './ships.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, resolvePhysicsBodySpec } from '../core/physicsAuthority.js';
import { inspectVessel } from '../shipjack/market.js';
import { inspectFittedComponents } from '../shipjack/componentProvenance.js';
import { fittedBlackFlagTool } from '../data/shipjackEquipment.js';
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { makeEnemySpawnSpec } from './combat.js';
import { advanceFleetOperations, executeFleetOperation } from '../shipjack/fleetOperations.js';
import { globalToSectorLocalForSector, sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { isRacingCorridorSession } from '../world/racingCorridor.js';
import { isGuidedOnboardingActive } from '../onboarding/opportunityAdmission.js';

const YARD_ACTIONS = new Set(['sell','return','extract','repair_module','register','settle_title','forge_broadcast','repaint','settle_lien']);
const TERMINAL = new Set(['aborted','escaped','destroyed','expired']);
const PROFILE = {civilian_cooperative:'civilian',corporate_locked:'corporate',pirate_improvised:'pirate',derelict_autonomous:'autonomous'};
const STATIONS = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id,{...st,sectorId:s.id}])));
const vec = v => ({x:finite(v?.x),z:finite(v?.z)});
const now = state => finite(state.simTime);

export const shipjack = {
  name:'shipjack',
  init(ctx) {
    this.destroy(); this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers || {};this.registry=ctx.registry;
    this._subs=[];this._nextWork=0;this._pendingEntry=false;this._opportunitiesDeferred=false;
    const on=(name,fn)=>{const off=this.bus.on(name,fn);this._subs.push(typeof off==='function'?off:()=>this.bus.off(name,fn));};
    on('ui:shipjack',p=>this.command(p || {}));
    on('game:new',()=>{if(this.state.player)delete this.state.player.shipjack;delete this.state.shipjack;this._pendingEntry=false;this._opportunitiesDeferred=false;});
    on('game:started',()=>{this._pendingEntry=true;this._nextWork=0;});
    on('sector:enter',()=>{this._pendingEntry=true;this._nextWork=0;});
    on('sector:exit',()=>this.parkSector());
    on('save:restoring',()=>{delete this.state.shipjack;this._pendingEntry=false;this._opportunitiesDeferred=false;});
    on('save:loaded',()=>{
      const normalized=normalizeShipjack(this.state.player?.shipjack);
      if(normalized){this.state.player.shipjack=normalized;this.state.shipjack=normalized;}
      else {delete this.state.player.shipjack;delete this.state.shipjack;}
      this._pendingEntry=true;this._nextWork=0;
    });
    on('player:death',()=>this.abortAll('Pilot lost; vessel trajectories remain on record.'));
    on('shipjack:yardReceipt',p=>this._yardReceipt(p));
    on('ship:controlTransferred',p=>this._transferred(p));
    on('ship:berthSwitching',p=>{
      const e=this.state.entities.get(p.fromId),v=vesselForEntity(this.state,e);
      if(v){this.snapshot(v,e);v.location.kind='berth';v.location.stationId=this.state.ui?.dockedStationId;v.location.entityId=null;}
    });
    on('dock:docked',p=>{
      this.berthAt(p?.stationId);
      // Station presentation suspends full-tick systems. Work that matured in flight
      // must settle at this physical arrival, before that suspension takes effect.
      if(isBlackFlagAdventure(this.state))advanceYardOperations({state:this.state,bus:this.bus,registry:this.registry});
    });
    on('combat:surrendered',p=>{
      if(!isBlackFlagAdventure(this.state)||p?.entityId===this.state.playerId)return;
      const e=this.state.entities.get(p?.entityId);if(!e)return;
      const v=this.admit(e);if(!v)return;const a=this.attempt(v,e);if(a){a.surrendered=true;a.phase='exposed';a.windowUntil=now(this.state)+90;}
    });
    on('entity:killed',p=>this._killed(p?.id ?? p?.entityId ?? p?.targetId));
    on('scan:pulse',()=>this.scanSelected());
    // The UI commits docked state AFTER dock:docked reaches the sim systems, and docking then freezes
    // the full tick, so update() never sees a docked player. Paid extraction work that matured in
    // flight settles here, once docked state is real, at its originating berth (after berthAt).
    on('dock:committed',()=>{if(isBlackFlagAdventure(this.state))advanceYardOperations({state:this.state,bus:this.bus,registry:this.registry});});
  },
  destroy(){for(const off of this._subs || [])off();this._subs=[];this._pendingEntry=false;this._opportunitiesDeferred=false;},
  newGame(){if(this.state?.player)delete this.state.player.shipjack;if(this.state)delete this.state.shipjack;this._pendingEntry=true;this._opportunitiesDeferred=false;},
  dirty(){this.bus.emit('save:dirty',{kind:'player',payload:{source:'shipjack'}});},
  say(text,kind='info'){
    this.bus.emit('toast',{text,kind,ttl:4,source:'shipjack'});
    this.bus.emit('comms:log',{from:'BLACK FLAG',text,kind:'encounter'});
  },
  cue(action,entity){
    const p=entity?.pos;
    this.bus.emit('shipjack:cue',{action,entityId:entity?.id,pos:p?vec(p):null,t:now(this.state)});
    const sounds={scan:'scan_resolve',port:'sfx_tether_latch_lock',secure:'sfx_tether_latch_lock',isolator:'sfx_bomb_emp_pulse',transfer:'ui_confirm',failed:'ui_deny'};
    this.bus.emit('audio:cue',{id:sounds[action] || 'ui_click',pos:p?vec(p):null});
    const captions={scan:'Frame signature resolved',port:'Service claw engaged',secure:'Provisional custody secured',isolator:'Drive bus ion discharge',transfer_start:'Airlock crossing — hold position',transfer:'Helm authenticated · previous ship marked',failed:'Signal denied',shutdown:'Power isolated · reboot in six seconds',drone:'Service pod launched'};
    if(captions[action])this.bus.emit('presentation:caption',{text:captions[action],assertive:action==='failed',physical:true,shape:'arc',channel:'shipjack'});
  },
  admit(entity,options={}){
    const vessel=admitVessel(this.state,entity,options);
    if(vessel && options.playerOwned)this.registry?.get('ships')?.linkVesselToOwned({vesselId:vessel.vesselId});
    return vessel;
  },
  attempt(vessel,entity){
    const own=ensureShipjack(this.state);
    if(own.custodyAttempts[vessel.vesselId])return own.custodyAttempts[vessel.vesselId];
    for(const [id,row] of Object.entries(own.custodyAttempts))if(TERMINAL.has(row.phase))delete own.custodyAttempts[id];
    if(Object.keys(own.custodyAttempts).length>=SHIPJACK_LIMITS.attempts)return null;
    return own.custodyAttempts[vessel.vesselId]={vesselId:vessel.vesselId,generation:entity.data.shipjackGeneration,phase:'observed',scanned:false,dwell:0,adaptation:0,tries:0,deadline:now(this.state)+180,windowUntil:0,lastActionAt:-10};
  },
  scanSelected(){if(isBlackFlagAdventure(this.state)&&this.state.player?.targetId!=null&&queryShipjack(this.state,this.state.player.targetId).eligible)this.command({action:'scan',targetId:this.state.player.targetId});},
  result(payload,result){
    const value={...result,action:payload.action,operationId:payload.operationId};
    this.bus.emit('shipjack:result',value);
    if(result.ok&&payload.action){
      const v=payload.vesselId?peekShipjack(this.state)?.vesselsById[payload.vesselId]:vesselForEntity(this.state,this.state.entities.get(payload.targetId ?? this.state.player?.targetId));
      if(v)this.bus.emit('shipjack:actionCommitted',{vesselId:v.vesselId,action:payload.action,operationId:payload.operationId,at:now(this.state)});
    }
    if(result.reason)this.say(result.reason,result.ok?'info':'warn');
    return value;
  },
  command(payload){
    const state=this.state;
    const deny=reason=>this.result(payload,{ok:false,reason});
    if(!isBlackFlagAdventure(state))return deny('Ship custody is available only in Adventure.');
    if(payload.action==='module_sell'){
      const owner=this.registry?.get('ships');
      return this.result(payload,owner?.sellModule(payload) || {ok:false,reason:'Shipworks is unavailable.'});
    }
    if(['recover','secure_berth','cancel_recovery'].includes(payload.action)){
      const result=executeFleetOperation(this.fleetContext(),payload);if(result.ok)this.dirty();return this.result(payload,result);
    }
    if(payload.action==='navigate')return this.navigate(payload.vesselId);
    if(YARD_ACTIONS.has(payload.action)){
      if(!payload.operationId)return deny('Review a current yard quote before committing.');
      const result=executeYardOperation({state,bus:this.bus,registry:this.registry},payload);
      if(result.ok)this.dirty();return this.result(payload,result);
    }
    if(state.mode!=='flight'||state.ui?.docked)return deny('Undock before approaching a vessel.');
    const pilot=state.entities.get(state.playerId);
    if(!pilot?.alive)return deny('No living pilot can authorize this action.');
    if(payload.action==='distress'){
      const active=vesselForEntity(state,pilot)||this.admit(pilot,{playerOwned:true,ownerId:'player'});
      if(!active)return deny('The distress registry is full; your live hull has not been moved.');
      active.beacon=true;this.snapshot(active,pilot);this.dirty();
      this.bus.emit('shipjack:distress',{vesselId:active.vesselId,sectorId:currentSector(state),pos:vec(pilot.pos)});
      return this.result(payload,{ok:true,reason:'Distress beacon marked. No rescue tow has accepted. Return to your retained hull; a damaged drive may receive existing yard-tender assistance, but an extracted drive requires replacement at a yard.'});
    }
    const entity=state.entities.get(payload.targetId ?? state.player.targetId);
    const view=queryShipjack(state,entity?.id);
    if(!view.eligible)return deny(view.reason || 'This vessel cannot accept a helm transfer.');
    if(payload.generation && payload.generation!==(entity.data?.shipjackGeneration ?? entity.occupantGeneration))return deny('The contact has changed; identify it again.');
    const vessel=this.admit(entity);
    if(!vessel)return deny('The working registry is full. Resolve or return a recorded vessel first.');
    if(Number.isInteger(payload.expectedRevision)&&payload.vesselId&&payload.expectedRevision!==vessel.revision)return deny('The vessel record changed. Read the current signal before committing.');
    const a=this.attempt(vessel,entity);if(!a)return deny('Too many active custody links. Break an old link first.');
    const time=now(state),ready=captureReadiness(state,entity,a);
    if(payload.action==='scan'){
      if(ready.distance>1200)return deny('Identify within 1,200 WU.');
      a.scanned=true;
      if(TERMINAL.has(a.phase)){a.phase='probed';a.deadline=time+180;a.dwell=0;a.windowUntil=0;}
      else if(a.phase==='observed')a.phase='probed';
      vesselHistory(state,vessel,'scan',`${vessel.name}: frame and drive signatures recorded. ${registryOwnerLabel(vessel.recognizedOwner)} still holds title.`);
      this.cue('scan',entity);this.dirty();return this.result(payload,{ok:true,reason:`${vessel.name}: ${vessel.title} title; ${ready.driveDisabled?'drive disabled':'drive live'}. Match motion and attach Massline.`});
    }
    if(payload.action==='abort'){
      a.phase=vessel.custodian==='player'?'secured':'aborted';a.dwell=0;a.transferStartedAt=null;
      if(a.droneId)this.helpers.removeEntity?.(a.droneId);a.droneId=null;
      this.dirty();return this.result(payload,{ok:true,reason:'Link abandoned. Damage, adaptation and the registry record remain.'});
    }
    if(payload.action==='beacon'){
      if(vessel.custodian!=='player')return deny('Only a vessel in your custody can carry your recovery beacon.');
      vessel.beacon=true;vesselHistory(state,vessel,'beacon','Recovery beacon enabled: find this hull from the station registry.');this.dirty();return this.result(payload,{ok:true,reason:'Beacon recorded. Its signal identifies the parked hull to other crews too.'});
    }
    if(payload.action==='release'){
      if(vessel.custodian!=='player')return deny('You do not hold this vessel.');
      return deny('Use a receiving berth to return property; release never erases its physical hull or title.');
    }
    if(payload.action==='transfer'){
      if(state.settings?.gameplay?.shipjackHandoff===false)return deny('Physical handoff is disabled by the diagnostic kill switch. Tow the hull instead.');
      if(vessel.custodian!=='player' && a.phase!=='secured')return deny('Secure custody before attempting a transfer.');
      if(!ready.ready || a.dwell<1.5)return deny(ready.reasons[0] || 'Hold the relative-speed band for 1.5 seconds.');
      if(!a.transferStartedAt){a.transferStartedAt=time;a.transferUntil=time+2;this.cue('transfer_start',entity);return this.result(payload,{ok:true,reason:'Airlock link crossing — hold position for two seconds. Back breaks the link.'});}
      return deny('Transfer is already crossing. Hold position or break the link.');
    }
    if(payload.action==='tow'){
      if(a.phase!=='secured')return deny('Secure the target first.');
      if(!ready.tethered)return deny('Attach the Massline to this exact hull before plotting a tow. A line to another object cannot carry it.');
      vessel.location.kind='tow';this.navigate(vessel.vesselId,true);return this.result(payload,{ok:true,reason:'Tow slowly into a receiving berth. The Massline carries the actual hull.'});
    }
    if(!a.scanned)return deny('Identify the frame before negotiating or probing.');
    if(time-a.lastActionAt<1.2)return deny('The interface is recovering; watch the signal before another command.');
    a.lastActionAt=time;
    if(payload.action==='hail'){
      if(vessel.crew==='automated'||vessel.profile==='autonomous')return deny('No crew channel answers. Probe the maintenance signal or reach the service port with a pod; safe-passage terms cannot surrender an autonomous helm.');
      if(ready.distance>1200)return deny('Comms are out of range.');
      const safeCrew=entity.data.shipjackUncrewed || vessel.crew==='evacuated' || vessel.crew==='automated';
      const hullFraction=entity.hull/Math.max(1,entity.hullMax);
      const odds=pilot.hull/Math.max(1,entity.hull) + (ready.driveDisabled?1:0) + (ready.weaponsDisabled?1:0);
      const accepts=safeCrew || ready.driveDisabled && (vessel.profile==='civilian'||hullFraction<.6||odds>2.7);
      if(!accepts){a.tries++;this.cue('failed',entity);return deny(vessel.profile==='corporate'?'Captain: Crew passage, yes. Corporate title, no. Cut my drive before you ask for the helm.':'Captain: I still have engines and people counting on me. Not yet.');}
      a.surrendered=true;a.phase='exposed';a.windowUntil=time+90;vessel.crewSafe=true;a.method='parley';
      if(fittedBlackFlagTool(state,'mod_proof_recorder_s'))vessel.proofRecorded=true;
      // An evacuated/automated frame has no pilot to surrender. Registering one with the
      // crew recovery owner would schedule an impossible flee/despawn behind this attempt.
      if(!safeCrew)this.registry?.get('pirateDisengage')?.acceptCrewSurrender(entity.id,'black_flag_safe_passage');
      vesselHistory(state,vessel,'crew_passage','Crew accepted safe passage. Vessel title was not transferred.');
      this.cue('hail',entity);this.dirty();return this.result(payload,{ok:true,reason:'Crew passage accepted. Match speed, approach the service port, and secure the bridge.'});
    }
    if(payload.action==='isolator'){
      if(ready.distance>180||finite(entity.shield)>1)return deny('Pulse requires an exposed shield and range below 180 WU.');
      if(pilot.cap<18)return deny('Pulse isolator needs 18 capacitor energy.');
      // Combat owns both the finite cost and targeted subsystem damage through its action seam.
      const receipt=this.helpers.requestShipjackPulse?.({actorId:pilot.id,targetId:entity.id,generation:vessel.generation});
      if(!receipt?.ok)return deny(receipt?.reason || 'Pulse tool is unavailable. Precision weapon fire can still disable the drive.');
      vessel.signature.tamper=Math.min(10,(vessel.signature.tamper || 0)+1);a.adaptation=Math.min(8,a.adaptation+1);
      this.cue('isolator',entity);this.dirty();return this.result(payload,{ok:true,reason:'Ion pulse struck the drive bus. Repeated pulses risk the internals; momentum is unchanged.'});
    }
    if(payload.action==='probe'){
      if(ready.distance>350)return deny('Maintenance handshake needs range below 350 WU.');
      if(finite(entity.shield)>1)return deny('Shield noise denies the handshake. Lower it or negotiate.');
      if(!(fittedBlackFlagTool(state,'mod_quiet_intrusion_s')&&a.tries===0))a.adaptation++;
      a.tries++;
      if(a.adaptation>3 && !ready.driveDisabled && !a.surrendered){a.phase='probed';a.alarmAt=time+8;return deny('Keys rotated. Alarm in eight seconds; isolate the drive or negotiate a crew key.');}
      a.phase='exposed';a.windowUntil=time+(vessel.profile==='military'?7:16);a.method='electronic';
      if(!ready.driveDisabled&&!a.surrendered)this.registry?.get('pirateDisengage')?.attemptCustodyBreakout?.(entity.id);
      this.cue('probe',entity);return this.result(payload,{ok:true,reason:'Maintenance access found. Hold a physical approach before the key rotates.'});
    }
    if(payload.action==='drone'){
      if(ready.distance>300)return deny('Service drone launch range is 300 WU.');
      if(a.droneId&&state.entities.get(a.droneId)?.alive)return deny('Your service drone is already approaching.');
      if(state.player.credits<45)return deny('A vulnerable service drone costs 45 cr.');
      const charge={amount:45,requireFull:true,expectedCredits:state.player.credits,result:false,reason:`shipjack:pod:${vessel.vesselId}:${a.tries}`};
      this.bus.emit('economy:chargeCredits',charge);if(!charge.result)return deny('Drone launch payment was refused.');
      const e=this.helpers.spawnEntity({type:'drone',team:0,factionId:'faction_player',pos:vec(pilot.pos),vel:vec(pilot.vel),radius:4,mass:6,hull:20,hullMax:20,ttl:25,collides:false,data:{kind:'mining_drone',shipjackServicePod:true,targetVesselId:vessel.vesselId},physicsBody:{shape:'circle',radius:4,dynamic:true}});
      a.droneId=e.id;a.droneLaunchedAt=time;a.droneDwell=0;a.tries++;
      this.cue('drone',e);return this.result(payload,{ok:true,reason:'Service pod away. Cross the aft port below 25 WU/s; enemy fire can destroy it. Match your own Massline approach to exploit its key.'});
    }
    if(payload.action==='port'){
      if(a.phase!=='exposed')return deny('Expose a maintenance handshake or obtain a crew key first.');
      if(!ready.ready)return deny(ready.reasons[0]);
      if(a.dwell<1.5)return deny('Steady the line for 1.5 seconds.');
      a.phase='foothold';a.endpoint='port';a.windowUntil=time+12;this.cue('port',entity);
      return this.result(payload,{ok:true,reason:'Service claw locked. Choose the helm, a quiet shutdown, or the cargo doors.'});
    }
    if(payload.action==='shutdown'){
      if(!['exposed','foothold'].includes(a.phase)||ready.distance>115)return deny('Establish close service access before a shutdown.');
      const result=this.helpers.requestShipjackShutdown?.({actorId:pilot.id,targetId:entity.id,durationTicks:360});
      if(!result?.ok)return deny('The power controller rejected shutdown.');
      a.phase='exposed';a.windowUntil=time+8;a.endpoint='port';this.cue('shutdown',entity);
      return this.result(payload,{ok:true,reason:'Six-second safe shutdown. Thrusters and weapons are isolated; the ship still drifts. Secure before reboot.'});
    }
    if(payload.action==='cargo'){
      if(a.phase!=='foothold'||!ready.ready)return deny('Cargo release needs a maintained foothold.');
      const cargo=this.registry?.get('cargo');
      if(typeof cargo?.releaseVesselFreight!=='function')return deny('This hull has no remotely releasable freight manifest. Keep the signal as recovery intel.');
      const receipt=cargo.releaseVesselFreight({vesselId:vessel.vesselId,entityId:entity.id,operationId:`${vessel.vesselId}:freight`});
      a.phase='aborted';return this.result(payload,receipt);
    }
    if(payload.action==='helm'||payload.action==='secure'){
      if(a.phase!=='foothold')return deny('Reach and hold the service port before asserting helm custody.');
      if(!ready.ready||a.dwell<1.5)return deny(ready.reasons[0] || 'Keep the approach stable.');
      const admission=this.registry?.get('ships')?.admitCapturedVessel({targetId:entity.id,targetGeneration:vessel.generation,vesselId:vessel.vesselId,operationId:`${vessel.vesselId}:custody`});
      if(!admission?.ok)return deny(admission?.reason || 'The ship owner could not record physical custody.');
      this.registry?.get('surrenderRecovery')?.relinquishToVesselCustody?.(entity.id);
      this.registry?.get('world')?.transferRecordToVesselCustody?.(entity.id,vessel.vesselId);
      this.registry?.get('traffic')?.relinquishVessel?.(entity.id,vessel.vesselId);
      a.phase='secured';a.windowUntil=time+90;vessel.custodian='player';vessel.materializationOwner='shipjack';vessel.location.kind='tow';entity.data.shipjackCustody='player';
      const lawful=vessel.profile==='derelict'||vessel.salvageEligible||vessel.recoveryAuthorized===true;
      if(!lawful){vessel.signature.broadcastFlagged=true;vessel.incidentId=`incident:${vessel.vesselId}`;vessel.noticeAt=time+15;this.reportTheft(vessel,entity);}
      vesselHistory(state,vessel,'secured',`${a.method==='parley'?'Crew terms honored':'Helm authority contested and secured'}; provisional custody only.`);
      this.cue('secure',entity);this.dirty();return this.result(payload,{ok:true,reason:'Bridge secured — provisional custody. Tow home or assume control. The previous owner’s title remains.'});
    }
    return deny('That custody action is unavailable.');
  },
  update(dt,state){
    if(!isBlackFlagAdventure(state)||state.mode!=='flight')return;
    if(this._opportunitiesDeferred&&!isGuidedOnboardingActive(state)){this._opportunitiesDeferred=false;this._pendingEntry=true;}
    if(this._pendingEntry && state.entities.get(state.playerId)?.alive){this._pendingEntry=false;this.enterSector();}
    const own=peekShipjack(state);if(!own)return;
    advanceYardOperations({state,bus:this.bus,registry:this.registry},dt);
    advanceFleetOperations(this.fleetContext());
    const time=now(state);
    for(const [id,a] of Object.entries(own.custodyAttempts)){
      if(TERMINAL.has(a.phase))continue;
      const v=own.vesselsById[id],e=state.entities.get(v?.location?.entityId);
      if(!e?.alive||e.data?.shipjackGeneration!==a.generation){a.phase=e?.data?.shipjackGeneration===a.generation?'destroyed':'escaped';a.transferStartedAt=null;continue;}
      const readiness=captureReadiness(state,e,a);
      if(readiness.tethered&&readiness.distance<180&&fittedBlackFlagTool(state,'mod_claw_anchor_s')){
        const body=resolvePhysicsBodySpec(e),inertia=body?.inertiaY || e.mass*e.radius*e.radius*.5;
        // Finite opposing impulses: the player pays the reaction and the Massline can still snap.
        const impulse=-Math.sign(e.angVel)*Math.min(Math.abs(e.angVel)*inertia,inertia*.9*dt);
        queuePhysicsTorqueImpulse(e,{x:0,y:impulse,z:0});
        const pilot=state.entities.get(state.playerId);if(pilot)queuePhysicsTorqueImpulse(pilot,{x:0,y:-impulse*.12,z:0});
      }
      if(a.droneId)this.advancePod(a,e,dt);
      a.dwell=readiness.ready?Math.min(3,(a.dwell || 0)+dt):0;
      if(a.transferStartedAt){
        if(!readiness.ready||e.hull<=0||!state.entities.get(state.playerId)?.alive){a.transferStartedAt=null;a.transferUntil=null;this.say('Airlock crossing aborted: relative approach lost.','warn');}
        else if(time>=a.transferUntil){
          a.transferStartedAt=null;
          const pilot=state.entities.get(state.playerId);this.admit(pilot,{playerOwned:true,ownerId:'player'});
          const op=`shipjack:transfer:${++own.operationCounter}`;
          const result=this.registry.get('ships').captureAndTransfer({targetId:e.id,targetGeneration:a.generation,vesselId:v.vesselId,operationId:op});
          if(result?.ok){a.phase='secured';v.custodian='player';v.location.kind='active';this.say(`${v.name}: provisional helm accepted. Your previous hull remains at its beacon.`);this.cue('transfer',e);this.dirty();}
          else this.say(result?.reason || 'Handoff refused without changing ships.','warn');
        }
      }
      if(a.phase!=='secured'&&a.windowUntil>0&&time>a.windowUntil){a.phase='probed';a.endpoint=null;a.adaptation=Math.min(8,a.adaptation+1);a.windowUntil=0;this.say(`${v.name}: keys rotated; link lost. Physical damage remains.`,'warn');this.cue('failed',e);}
      if(a.phase!=='secured'&&time>a.deadline){a.phase='expired';this.say(`${v.name}: approach window expired. Its last trajectory is recorded.`);}
      if(a.alarmAt && time>=a.alarmAt){a.alarmAt=0;this.reportTheft(v,e);this.say(`${v.name}: alarm broadcast reached local authority.`,'warn');}
    }
    if(time<this._nextWork)return;this._nextWork=time+.5;
    for(const v of Object.values(own.vesselsById)){
      const e=state.entities.get(v.location?.entityId);
      if(e?.alive && e.data?.vesselId===v.vesselId && e.data?.shipjackGeneration===v.generation)this.snapshot(v,e);
      else if(v.location.sectorId===currentSector(state)&&['field','tow','active'].includes(v.location.kind)){
        v.location.kind='missing';v.location.entityId=null;
        vesselHistory(state,v,'signal_lost','Physical signal lost. The last recorded trajectory is retained; custody and title have not been reassigned.');this.dirty();
      }
      if(v.noticeAt && time>=v.noticeAt && !v.claimResolved){v.noticeAt=0;this.say(`REGISTRY: ${v.name} reported missing. Broadcast papers cannot conceal its frame and engine.`, 'warn');vesselHistory(state,v,'reported','Owner’s missing-vessel notice reached the network.');}
      // Finite remote drift. No invisible loot rolls or full-universe physics.
    }
  },
  snapshot(v,e){
    v.condition.hull=Math.max(0,Math.min(1,e.hull/Math.max(1,e.hullMax)));
    Object.assign(v.location,{entityId:e.id,sectorId:currentSector(this.state),pos:globalToSectorLocalForSector(e.pos,currentSector(this.state)),vel:vec(e.vel),rot:e.rot,angVel:finite(e.angVel),at:now(this.state)});
    v.parkedBody={hull:e.hull,armorHp:e.armorHp,shield:e.shield,cap:e.cap,fittings:[...(e.data.fittings || [])],subsystems:JSON.parse(JSON.stringify(this.state.combat?.entities?.[String(e.id)]?.subsystems || {}))};
  },
  fleetContext(){return {state:this.state,bus:this.bus,registry:this.registry,
    detachVessel:v=>{
      const e=this.state.entities.get(v.location.entityId);
      if(!e?.alive)return true;
      if(e.id===this.state.playerId||e.data?.vesselId!==v.vesselId)return false;
      if(typeof this.helpers.removeEntity!=='function')return false;
      this.snapshot(v,e);this.helpers.removeEntity(e.id);v.location.entityId=null;this.dirty();return !this.state.entities.has(e.id);
    },
    arriveVessel:(_job,v)=>{this.say(`${v.name}: paid recovery tug reached the receiving berth. Damage, hold and title remain on record.`);this.dirty();},
  };},
  advancePod(a,target,dt){
    const pod=this.state.entities.get(a.droneId);
    if(!pod?.alive){a.droneId=null;a.droneDwell=0;a.adaptation=Math.min(8,a.adaptation+1);this.say('Service pod lost. The defender has its handshake; try a different approach.','warn');return;}
    const reach=(target.radius || 14)+8;
    const port={x:target.pos.x-Math.cos(target.rot)*reach,z:target.pos.z-Math.sin(target.rot)*reach};
    const dx=port.x-pod.pos.x,dz=port.z-pod.pos.z,d=Math.hypot(dx,dz);
    const speed=Math.min(65,d*2),vx=target.vel.x+(d>1?dx/d*speed:0),vz=target.vel.z+(d>1?dz/d*speed:0);
    const ix=(vx-pod.vel.x)*pod.mass,iz=(vz-pod.vel.z)*pod.mass,cap=pod.mass*80*dt,mag=Math.hypot(ix,iz),scale=mag>cap?cap/mag:1;
    queuePhysicsImpulse(pod,{x:ix*scale,y:0,z:iz*scale});
    const relative=Math.hypot(pod.vel.x-target.vel.x,pod.vel.z-target.vel.z);
    if(d<14&&relative<25&&finite(target.shield)<=1){
      a.droneDwell=(a.droneDwell || 0)+dt;
      if(a.droneDwell>=.8&&!a.podKey){a.podKey=true;a.phase='exposed';a.endpoint='port';a.windowUntil=now(this.state)+18;this.cue('port',pod);this.say('ROLLING KEY — pod matched the aft port. Eighteen-second service aperture; stabilize the hull and claim a foothold.');}
    }else a.droneDwell=0;
  },
  _transferred(p){
    const own=ensureShipjack(this.state);
    for(const [entityId,kind] of [[p.fromId,'field'],[p.toId,'active']]){
      const e=this.state.entities.get(entityId);const v=vesselForEntity(this.state,e);
      if(v){this.snapshot(v,e);v.location.kind=kind;v.custodian='player';v.beacon=true;if(kind==='field')vesselHistory(this.state,v,'parked','Pilot departed. Hull left physically drifting at its recorded position.');}
    }
    for(const v of Object.values(own.vesselsById))if(v.location.kind==='active'&&v.location.entityId!==this.state.playerId)v.location.kind='field';
  },
  navigate(vesselId,toReceiver=false){
    const v=peekShipjack(this.state)?.vesselsById[vesselId];if(!v)return this.result({action:'navigate'},{ok:false,reason:'No trajectory is on record.'});
    const encounter=BLACK_FLAG_ENCOUNTERS.find(row=>peekShipjack(this.state).encounters[row.id]?.vesselId===vesselId);
    let receiver=encounter&&STATIONS.get(encounter.stationId);
    if(toReceiver&&(!receiver||!this.stationEntity(receiver.id))){
      const pilot=this.state.entities.get(this.state.playerId);
      receiver=[...STATIONS.values()].filter(port=>port.sectorId===currentSector(this.state)
        &&port.services?.some(service=>['shipyard','repair','black_market'].includes(service))&&this.stationEntity(port.id))
        .sort((a,b)=>{
          const pa=this.stationEntity(a.id).pos,pb=this.stationEntity(b.id).pos;
          return Math.hypot(pa.x-pilot.pos.x,pa.z-pilot.pos.z)-Math.hypot(pb.x-pilot.pos.x,pb.z-pilot.pos.z)||a.id.localeCompare(b.id);
        })[0];
      if(!receiver)return this.result({action:'navigate'},{ok:false,reason:'No receiving yard is physically available in this sector. Keep the hull beacon marked and arrange recovery from a port.'});
    }
    const pos=toReceiver&&receiver?this.stationEntity(receiver.id)?.pos:sectorLocalToGlobalForSector(v.location.pos,v.location.sectorId);
    const sectorId=toReceiver&&receiver?receiver.sectorId:v.location.sectorId;
    const body=this.state.entities.get(v.location.entityId);
    const live=body?.alive&&body.data?.vesselId===v.vesselId&&body.data?.shipjackGeneration===v.generation;
    const targetEntityId=!toReceiver&&live?body.id:null;
    this.bus.emit('ui:setCourse',sectorId!==currentSector(this.state)?{sectorId}:{sectorId,pos:vec(pos),label:toReceiver&&receiver?receiver.name:v.name,targetEntityId,rendezvous:targetEntityId!=null});
    this.bus.emit('shipjack:route',{vesselId,sectorId:v.location.sectorId,pos:vec(pos),label:v.name});
    return this.result({action:'navigate'},{ok:true,reason:`${v.name}: ${v.location.kind}, ${v.location.sectorId}. Beacon route requested.`});
  },
  reportTheft(v,e){
    const receipt=this.registry?.get('lawSecurity')?.reportIncident({reportId:`shipjack:${v.vesselId}`,kind:'vessel_theft',offenderStableId:'player',offenderEntityId:this.state.playerId,payloadStableId:v.vesselId,victimEntityId:e.id,causalTick:this.state.tick|0,pos:vec(e.pos)});
    if(receipt?.accepted)v.incidentId=receipt.incidentReceiptId;
    return receipt;
  },
  abortAll(reason){const own=peekShipjack(this.state);if(!own)return;for(const a of Object.values(own.custodyAttempts)){if(a.phase!=='secured')a.phase='aborted';a.transferStartedAt=null;}if(reason)this.say(reason);},
  _killed(id){const e=this.state.entities.get(id),v=vesselForEntity(this.state,e);if(!v)return;this.snapshot(v,e);v.location.kind='destroyed';const a=peekShipjack(this.state)?.custodyAttempts[v.vesselId];if(a)a.phase='destroyed';vesselHistory(this.state,v,'destroyed','Intact recovery and hull resale ended. Wreck salvage remains governed by the aftermath owner.');this.bus.emit('shipjack:destroyed',{vesselId:v.vesselId});this.dirty();},
  parkSector(){
    const own=peekShipjack(this.state);if(!own)return;
    this.abortAll();
    for(const v of Object.values(own.vesselsById)){
      const e=this.state.entities.get(v.location?.entityId);
      if(!e?.alive||e.id===this.state.playerId||e.data?.vesselId!==v.vesselId)continue;
      this.snapshot(v,e);v.location.kind='remote';
      if(v.materializationOwner!=='shipjack'){v.location.entityId=null;continue;}
      // Store only the finite ship spec needed to restore this exact body, once.
      v.parkedBody={hull:e.hull,armorHp:e.armorHp,shield:e.shield,cap:e.cap,fittings:[...(e.data.fittings || [])],subsystems:JSON.parse(JSON.stringify(this.state.combat?.entities?.[String(e.id)]?.subsystems || {}))};
      this.helpers.removeEntity?.(e.id);v.location.entityId=null;
    }
  },
  enterSector(){
    const state=this.state;if(!isBlackFlagAdventure(state)||!this.helpers.spawnEntity)return;
    const own=peekShipjack(state);
    if(own){state.shipjack=own;
      // Saved persistent entities have new numeric ids; reconcile by durable vessel identity.
      for(const e of state.entityList || []){const v=vesselForEntity(state,e);if(v&&e.alive){v.location.entityId=e.id;v.generation=e.data.shipjackGeneration;}}
      for(const v of Object.values(own.vesselsById))if(v.materializationOwner==='shipjack'&&v.location.kind==='remote'&&v.location.sectorId===currentSector(state))this.rematerialize(v);
    }
    // Deferred admission is a runtime retry edge, not a consumed encounter or save field.
    if(isGuidedOnboardingActive(state)){this._opportunitiesDeferred=true;return;}
    this._opportunitiesDeferred=false;
    // Borrowed circuits admit no new campaign opportunities; retained custody still reconciles above.
    if(isRacingCorridorSession(state))return;
    for(const row of BLACK_FLAG_ENCOUNTERS){
      if(row.sectorId!==currentSector(state))continue;
      const sj=ensureShipjack(state);if(sj.encounters[row.id])continue;
      const anchor=(state.entityList || []).find(e=>e.alive&&e.data?.poiId===row.anchorPoiId) || state.world?.active?.pois?.find(p=>p.poiId===row.anchorPoiId) || this.stationEntity(row.stationId);if(!anchor)continue;
      const offset=row.offset || {x:220,z:150};
      const radius=Math.hypot(offset.x,offset.z)||1,clear=anchor.type==='station'?Math.max(radius,(anchor.radius || 80)+210):radius;
      const pos={x:anchor.pos.x+offset.x/radius*clear,z:anchor.pos.z+offset.z/radius*clear};
      const budgetId=`blackflag:${row.id}`;
      if(this.helpers.spawnBudget && this.helpers.spawnBudget.request(1,budgetId)<1){this._pendingEntry=true;continue;}
      const fittings=fittingsFromDefaultModules(row.defId,row.fitted);
      const spec=makeShipEntitySpec(row.defId,{team:row.profile.includes('pirate')?1:2,factionId:row.factionId,fittings,pos,
        ai:{archetype:'trader',passive:true,lawful:!row.profile.includes('pirate'),fsm:row.disabled?'idle':'patrol',homeSectorId:row.sectorId,
          roe:RulesOfEngagement.HOLD_FIRE,activity:normalizeActivity({kind:row.disabled?ActivityKind.LOITER:ActivityKind.TRANSIT,reason:'registry_route',anchor:{x:pos.x+1100,z:pos.z-700},leashRadius:2400,startedTick:state.tick})}});
      spec.data.name=row.name;spec.data.shipjackEncounterId=row.id;spec.data.shipjackUncrewed=['evacuated','automated'].includes(row.crew);spec.flags={...spec.flags,persistent:true};
      spec.data.persistenceOwner='shipjack';
      // D207: the vessel is sector-owned (park/rematerialize keys on row.sectorId) — stamp the
      // canonical tag so residency teardown and sector-scoped readers can see the ownership.
      spec.homeSectorId=row.sectorId;spec.data.homeSectorId=row.sectorId;spec.data.sectorId=row.sectorId;
      if(row.disabled&&row.crew==='evacuated'){spec.data.ai=null;spec.data.intent=null;spec.shieldRegenRate=0;}
      spec.hull*=row.condition;spec.shield=row.disabled?0:spec.shield;spec.vel={x:row.disabled?2:12,z:row.disabled?1:0};
      const e=this.helpers.spawnEntity(spec);
      this.helpers.spawnBudget?.bindEntity(e.id,budgetId);
      const v=this.admit(e,{origin:row.id,name:row.name,ownerId:row.ownerId,profile:PROFILE[row.profile] || 'civilian',crew:row.crew,legalCategory:row.legalCategory==='salvage'?'unregistered':row.legalCategory});
      if(!v)continue;v.materializationOwner='shipjack';v.salvageEligible=row.legalCategory==='salvage';v.returnReward=row.returnReward;v.recoveryAuthorized=['recovery','warrant','salvage'].includes(row.legalCategory);
      sj.encounters[row.id]={admitted:true,vesselId:v.vesselId,outcome:'open'};
      if(row.disabled)this.helpers.disableShipjackSubsystem?.({entityId:e.id,subsystemId:'subsystem_drive'});
      this.bus.emit('shipjack:opportunity',{vesselId:v.vesselId,encounterId:row.id,entityId:e.id,stationId:row.stationId,defId:row.defId});
      if(row.id==='black_flag_blackbird'){
        const escortBudget=`${budgetId}:escort`;
        if(!this.helpers.spawnBudget||this.helpers.spawnBudget.request(1,escortBudget)>0){
          const escort=makeEnemySpawnSpec('patrol_lawman',2,{x:pos.x+110,z:pos.z-80},{factionId:row.factionId,spawnContext:'black_flag_escort'});
          escort.data.name='Sera Holt · recovery escort';
          const guard=this.helpers.spawnEntity(escort);this.helpers.spawnBudget?.bindEntity(guard.id,escortBudget);
          v.escortEntityId=guard.id;
        }
      }
      this.say(row.intro);this.dirty();
    }
  },
  stationEntity(stationId){return (this.state.entityList || []).find(e=>e.alive&&e.type==='station'&&(e.data?.stationId===stationId||e.data?.defId===stationId||e.data?.id===stationId));},
  rematerialize(v){
    if(!this.helpers.spawnEntity||this.state.entities.get(v.location.entityId)?.data?.vesselId===v.vesselId)return;
    const b=v.parkedBody || {},dt=Math.min(60,Math.max(0,now(this.state)-v.location.at));
    const pos=sectorLocalToGlobalForSector({x:v.location.pos.x+v.location.vel.x*dt,z:v.location.pos.z+v.location.vel.z*dt},v.location.sectorId);
    const pilot=this.state.entities.get(this.state.playerId);if(pilot&&Math.hypot(pos.x-pilot.pos.x,pos.z-pilot.pos.z)<80){pos.x+=100;}
    const spec=makeShipEntitySpec(v.defId,{team:v.custodian==='player'?0:2,fittings:b.fittings || this.state.player.ownedShips?.find(s=>s.vesselId===v.vesselId)?.fittings || [],pos,rot:v.location.rot});
    Object.assign(spec,{vel:vec(v.location.vel),angVel:v.location.angVel,hull:b.hull ?? spec.hull*v.condition.hull,armorHp:b.armorHp ?? spec.armorHp,shield:b.shield ?? 0,cap:b.cap ?? spec.cap});
    Object.assign(spec.data,{vesselId:v.vesselId,shipjackGeneration:v.generation,persistenceOwner:'shipjack',shipjackParked:v.custodian==='player',name:v.name,shipjackUncrewed:v.crewSafe || v.crew==='evacuated'});spec.flags={...spec.flags,persistent:true};
    if(v.location.sectorId!=null){spec.homeSectorId=v.location.sectorId;spec.data.homeSectorId=v.location.sectorId;spec.data.sectorId=v.location.sectorId;}
    const e=this.helpers.spawnEntity(spec);v.location.entityId=e.id;v.location.kind='field';
    if(b.subsystems)this.helpers.restoreShipjackSubsystems?.({entityId:e.id,subsystems:b.subsystems});
  },
  berthAt(stationId){
    const station=this.stationEntity(stationId),own=peekShipjack(this.state);if(!station||!isBlackFlagAdventure(this.state))return;
    // Equipment carries its own evidence even when the mounting starter hull has no registry row.
    const active=this.state.entities.get(this.state.playerId),activeVessel=vesselForEntity(this.state,active);
    const owned=this.state.player.ownedShips?.[this.state.player.activeShipIndex];
    const grade=stationId==='station_smuggler'?1:stationId==='station_customs'?3:2;
    const findings=activeVessel&&activeVessel.custodian==='player'
      ? inspectVessel(activeVessel,{grade,jurisdiction:stationId}) : {grade,accepted:true,findings:[]};
    const components=inspectFittedComponents(this.state,owned?.fittedInstances,{grade});
    findings.findings.push(...components.findings);findings.accepted&&=components.accepted;
    if(active?.alive&&(activeVessel||components.findings.length)){
      this.bus.emit('shipjack:inspection',{vesselId:activeVessel?.vesselId || null,entityId:active.id,stationId,grade,accepted:findings.accepted,findings:findings.findings});
      if(!findings.accepted){
        this.say(`${station.data?.name || 'REGISTRY'}: ${findings.findings.join('; ')}. Resolve the frame or component title before honest resale.`, 'warn');
        if(activeVessel?.signature?.broadcastFlagged&&!activeVessel.claimResolved)this.reportTheft(activeVessel,active);
      }
    }
    if(!own)return;
    for(const v of Object.values(own.vesselsById)){
      const e=this.state.entities.get(v.location.entityId);if(!e?.alive||v.custodian!=='player')continue;
      if(e.id===this.state.playerId){
        v.location.kind='active';v.location.stationId=stationId;
        continue;
      }
      if(Math.hypot(e.pos.x-station.pos.x,e.pos.z-station.pos.z)>station.radius+180||Math.hypot(e.vel.x,e.vel.z)>25)continue;
      this.snapshot(v,e);v.location.kind='berth';v.location.stationId=stationId;
      this.helpers.removeEntity?.(e.id);v.location.entityId=null;this.say(`${v.name}: receiving cradle accepted physical delivery.`);this.dirty();
    }
  },
  _yardReceipt(p){
    if(!p?.ok)return;
    const own=peekShipjack(this.state),v=own?.vesselsById[p.vesselId];if(!v)return;
    if(p.action==='repair_module'&&p.subsystemId&&v.parkedBody?.subsystems?.[p.subsystemId]){
      const row=v.parkedBody.subsystems[p.subsystemId];row.health=row.maxHealth;row.destroyed=false;row.effectiveDisabled=false;
    }
    vesselHistory(this.state,v,p.action,`${p.action==='return'?'Returned to claimant':p.action==='extract'?'Fitted part extracted intact':p.action==='sell'?'Released to buyer':p.action==='register'?'Salvage title adjudicated':p.action==='settle_title'?'Claimant compensated; lawful title issued':'Yard service completed'} at ${v.location.stationId || this.state.ui?.dockedStationId}.`);
    if(p.action==='return')for(const e of Object.values(own.encounters))if(e.vesselId===v.vesselId)e.outcome='returned';
    this.bus.emit('shipjack:settled',{...p,title:v.title,stationId:this.state.ui?.dockedStationId});this.dirty();
  },
};
