// Independent PQ-146 observation. Reads physical actors and the authoritative journal only.
import { journalFor, bodyLife } from './stuntEvidence.js';
import { resolveCollisionProxyManifest, proxyWorldPrimitives } from '../data/collisionProxyManifests.js';
import { activeHullIdentity } from '../data/hullIdentity.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
const LIMITS = { episodes: 32, witnesses: 8, terminals: 8, reportQueue: 8 };
const finite = n => Number.isFinite(n) ? n : 0;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const key = id => String(id);
const copy = value => JSON.parse(JSON.stringify(value));
export function adventureStunts(state) { return !state.run || state.run.phase === 'inactive' || state.run.kind === 'adventure'; }
export function witnessState(state) {
  state.story ||= {}; state.story.titles ||= {}; const titles = state.story.titles;
  return titles.stuntWitnessing ||= { version: 1, episodes: {}, reports: [], networks: {}, lastTick: -1, sequence: 0 };
}
export function observerIdentity(entity) {
  return entity?.data?.worldRecordId ?? entity?.data?.identityKey ?? entity?.data?.transponderId ?? (entity?.id != null ? `entity:${entity.id}` : null);
}
export function observerProfile(state, entity) {
  if (!entity || entity.alive !== true || entity.id === state.playerId || !point(entity.pos)) return null;
  const d = entity.data || {};
  if (entity.ownerId === state.playerId || d.ownerId === state.playerId || d.playerOwned || d.runCohort) return null;
  if (!['ship','station','sensor','camera'].includes(entity.type)) return null;
  const runtime = state.combat?.entities?.[String(entity.id)];
  if (d.sensorsEnabled === false || d.sensorDisabled === true || d.sensorJammed === true || runtime?.capabilities?.sensor === false) return null;
  for (const [id, subsystem] of Object.entries(runtime?.subsystems || {})) if (/sensor/.test(id) && (subsystem.destroyed || subsystem.effectiveDisabled)) return null;
  const role = d.role ?? d.ai?.role ?? d.ai?.activity?.kind;
  const player = state.entities?.get?.(state.playerId);
  let hostile = false;
  if (player) { try { hostile = isHostileForAI(state, entity, player); } catch { hostile = entity.team != null && entity.team !== player.team; } }
  const station = entity.type === 'station';
  const unattended = d.unstaffed === true || ['sensor','camera'].includes(entity.type);
  const patrol = ['patrol','rescue','police'].includes(role);
  const range = Math.min(station && !unattended ? 450 : unattended || patrol ? 300 : hostile ? 220 : 180, Number.isFinite(d.sensorRange) ? d.sensorRange : Infinity);
  const comms = d.commsDisabled !== true && runtime?.capabilities?.comms !== false
    && !Object.entries(runtime?.subsystems || {}).some(([id,s]) => /comms/.test(id) && (s.destroyed || s.effectiveDisabled));
  const canSpeak = !unattended && comms && (entity.type === 'ship' || d.dispatcherId != null);
  return { id: entity.id, lifeId: bodyLife(entity,state)?.id, identity: observerIdentity(entity), name: d.displayName || entity.name || d.name || String(entity.id),
    role: station ? 'station sensor' : patrol ? 'patrol' : hostile ? 'hostile' : 'civilian',
    factionId: entity.factionId ?? d.factionId ?? null, range, canSpeak, comms };
}
function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z, square=dx*dx+dz*dz;
  const t=square ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/square)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
function crossesBox(a,b,p) {
  const c=Math.cos(-p.rot),s=Math.sin(-p.rot);
  const rotate=v=>({x:(v.x-p.x)*c-(v.z-p.z)*s,z:(v.x-p.x)*s+(v.z-p.z)*c});
  const from=rotate(a),to=rotate(b); let low=0,high=1;
  for (const [axis,half] of [['x',p.hx],['z',p.hz]]) {
    const d=to[axis]-from[axis];
    if(Math.abs(d)<1e-9) { if(Math.abs(from[axis])>half)return false;continue; }
    const t1=(-half-from[axis])/d,t2=(half-from[axis])/d;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
  }
  return high>0&&low<1;
}
function segmentIntersects(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
    ||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))return false;
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
/** Uses the same station primitives as physics, preserving real gaps through compound geometry. */
export function witnessLineOfSight(state, observer, destination, ignored = []) {
  if (!point(observer?.pos)||!point(destination))return false;
  for (const entity of state.entities?.values?.() || []) {
    if(!entity?.alive||!entity.collides||entity.id===observer.id||ignored.includes(entity.id)||!point(entity.pos))continue;
    if(!['ship','station','asteroid','planet','wreck','debris'].includes(entity.type) && entity.data?.sensorBlocking!==true)continue;
    const manifest=resolveCollisionProxyManifest(entity);
    const primitives=manifest?proxyWorldPrimitives(entity,manifest):[{kind:'circle',x:entity.pos.x,z:entity.pos.z,r:entity.physicsBody?.radius??entity.radius??entity.r??0}];
    for(const p of primitives) {
      if(p.kind==='circle'&&p.r>0&&pointSegmentDistance(p,observer.pos,destination)<p.r)return false;
      if(p.kind==='obb'&&crossesBox(observer.pos,destination,p))return false;
      if(p.kind==='capsule') {
        const a={x:p.ax,z:p.az},b={x:p.bx,z:p.bz};
        if(segmentIntersects(observer.pos,destination,a,b)||Math.min(pointSegmentDistance(a,observer.pos,destination),pointSegmentDistance(b,observer.pos,destination),pointSegmentDistance(observer.pos,a,b),pointSegmentDistance(destination,a,b))<p.r)return false;
      }
    }
  }
  return true;
}
function canSee(state,observer,profile,entity,ignored=[]) {
  return entity?.id!==observer.id&&point(entity?.pos)&&distance(observer.pos,entity.pos)<=profile.range&&witnessLineOfSight(state,observer,entity.pos,[entity.id,...ignored]);
}
function sampleCounter(row, field, tick, visible) {
  const last=row[`${field}Last`]??-2;
  if(visible) { row[field]=last===tick-1?(row[field]||0)+1:1;row[`${field}Last`]=tick;row[`${field}Max`]=Math.max(row[`${field}Max`]||0,row[field]); }
  else row[field]=0;
}
export function observeStuntWitnesses(state) {
  if(!adventureStunts(state)||state.mode!=='flight')return;
  const j=journalFor(state); if(!j?.roots.size)return;
  const own=witnessState(state),tick=state.tick;
  if(own.lastTick===tick)return;own.lastTick=tick;
  for(const [id,row] of Object.entries(own.episodes))if(tick>row.rootTick+480)delete own.episodes[id];
  const player=state.entities?.get?.(state.playerId);if(!player)return;
  const observers=[];
  for(const entity of state.entities.values()) { const profile=observerProfile(state,entity);if(profile&&distance(entity.pos,player.pos)<=450)observers.push({entity,profile}); }
  observers.sort((a,b)=>distance(a.entity.pos,player.pos)-distance(b.entity.pos,player.pos)||String(a.entity.id).localeCompare(String(b.entity.id)));
  observers.length=Math.min(observers.length,LIMITS.witnesses);
  for(const root of j.roots.values()) {
    if(root.actorId!==state.playerId||tick<root.tick||tick>root.tick+480||root.truncated)continue;
    let episode=own.episodes[root.id];
    if(!episode) { if(Object.keys(own.episodes).length>=LIMITS.episodes)continue;episode=own.episodes[root.id]={rootId:root.id,rootTick:root.tick,observers:{}}; }
    const source=state.entities.get(root.sourceId);
    if(!source?.alive||bodyLife(source,state)?.id!==root.sourceLife)continue;
    for(const {entity:observer,profile} of observers) {
      const row=episode.observers[profile.identity] ||= {...profile,sourceTicks:0,transferTicks:0,payoffTicks:0,targets:{},firstSeen:tick};
      if(row.lifeId!==profile.lifeId)continue;
      const seesSource=canSee(state,observer,profile,source,[player.id]);
      const seesActor=canSee(state,observer,profile,player,[source.id]);
      const loaded=root.constraint?.attached&&root.constraint.loadedTicks>0;
      const timely=row.firstSeen<=root.tick+1||loaded;
      sampleCounter(row,'sourceTicks',tick,timely&&seesSource&&seesActor&&!root.release);
      const transferring=root.release ? tick>=root.release.tick : tick>root.tick;
      sampleCounter(row,'transferTicks',tick,transferring&&seesSource);
      row.sourceTicks=Math.min(row.sourceTicks,6);row.transferTicks=Math.min(row.transferTicks,6);
      // Watch actual approaching bodies before their terminal event; no destroyed target is
      // retroactively treated as visible for six later samples.
      let tracked=0;
      for(const target of state.entities.values()) {
        if(tracked>=8)break;
        const relevantFlight=root.threatIds?.includes(target.id)||root.needle?.boundaryIds?.includes(target.id);
        if(!target.alive||(!target.collides&&!relevantFlight)||target.id===source.id||target.id===player.id||!point(target.pos))continue;
        if(!relevantFlight&&distance(source.pos,target.pos)>Math.max(120,Math.hypot(source.vel?.x||0,source.vel?.z||0)*.12+(target.radius||0)))continue;
        const life=bodyLife(target,state);if(!life)continue;
        const v=row.targets[life.id] ||= {id:target.id,count:0,last:-2};
        const visible=canSee(state,observer,profile,target,[source.id]);
        v.count=visible?(v.last===tick-1?Math.min(6,v.count+1):1):0;v.last=tick;
        v.max=Math.max(v.max||0,v.count);
        if(relevantFlight)v.flight=true;
        tracked++;
      }
      for(const [id,v] of Object.entries(row.targets))if(!v.flight&&tick-v.last>6)delete row.targets[id];
      if(root.escape?.completed&&tick-root.escape.completedTick<=1) {
        const ids=[...(root.escape.threatIds||[]),...(root.escape.boundaryIds||[])];
        row.escapeVerified=seesSource&&ids.length>0&&ids.every(id=>Object.values(row.targets).some(v=>v.id===id&&v.max>=6));
      }
    }
  }
}
export function sampledStuntWitnesses(state,trick,{partial=false}={}) {
  const own=witnessState(state),episode=own.episodes[trick.rootId]; if(!episode)return [];
  const tick=trick.tick,root=journalFor(state)?.roots.get(trick.rootId);
  const lives=trick.victimLives||[];
  const result=[];
  for(const row of Object.values(episode.observers)) {
    const entity=state.entities?.get?.(row.id),profile=observerProfile(state,entity);if(!profile||profile.lifeId!==row.lifeId)continue;
    if(lives.some(life=>life.dead===true&&life.lifeId===profile.lifeId))continue;
    if(!partial&&((row.sourceTicksMax||0)<6||(row.transferTicksMax||0)<6))continue;
    const observed=[];
    for(const life of lives) {
      const target=row.targets[life.lifeId];
      const live=state.entities.get(target?.id);
      const terminal=root?.nodes?.findLast?.(n=>n.kind==='contact'&&n.targetLife===life.lifeId);
      const pos=live&&bodyLife(live,state)?.id===life.lifeId?live.pos:terminal?.pos;
      if(target?.count>=6&&target.last<=tick&&tick-target.last<=1&&point(pos)&&distance(entity.pos,pos)<=profile.range
        &&witnessLineOfSight(state,entity,pos,[target.id,root?.sourceId]))observed.push(life.lifeId);
    }
    if(!observed.length && !trick.pureEscape && !partial)continue;
    if(trick.pureEscape && !row.escapeVerified)continue;
    const requiredTransfers=[...new Set([root?.sourceLife,...(root?.nodes||[]).map(n=>n.sourceLife)].filter(v=>v!=null))].slice(0,8);
    const transferCoverage=Object.fromEntries(requiredTransfers.map(id=>[id,id===root?.sourceLife?Math.min(6,row.transferTicksMax||0):Math.min(6,row.targets[id]?.max||0)]));
    result.push({...profile,sourceTicks:Math.min(6,row.sourceTicksMax||0),transferTicks:Math.min(6,...Object.values(transferCoverage)),payoffTicks:observed.length||row.escapeVerified?6:0,
      requiredTransfers,transferCoverage,
      lineOfSight:true,terminalLives:observed,rootId:trick.rootId,observedTick:tick,provenance:'live-physical-samples'});
  }
  return result.slice(0,8);
}
export function incidentIdentity(state,trick) {
  const player=state.entities?.get?.(state.playerId),hull=activeHullIdentity(state);
  return { pilotId: state.player?.identityId ?? `pilot:${state.meta?.seed??0}`,
    shipId: player?.data?.transponderId??player?.data?.worldRecordId??hull?.registration??(player?bodyLife(player,state)?.id:null),
    shipName:player?.data?.displayName??player?.name??hull?.name??'Player ship',
    encounterId:trick.encounterId??journalFor(state)?.roots.get(trick.rootId)?.encounterId??state.combat?.encounterId??bodyLife(player,state)?.encounterId??null };
}

export const STUNT_TITLE_RULES = Object.freeze([
  ['bolas','Knotmaker',1,'pilot_ship','Knotmaker. You tied that fight off nicely.','kill'],
  ['wrecking_ball','Wrecker',2,'pilot',"Give Wrecker room. That's not spare cargo.",'material'],
  ['clothesline','Linebreaker',1,'pilot',"Linebreaker put a rope where his exit used to be.",'kill'],
  ['collateral','Chain Artist',1,'pilot','Chain Artist. One mistake, three wrecks.','collateral'],
  ['near_miss','Close Shave',3,'pilot',"Close Shave's still flying. Somehow.",'escape'],
  ['tow_kill','Tow Terror',2,'pilot',"Don't let Tow Terror get a line on you.",'kill'],
  ['rock_discovery','Rock Tutor',3,'pilot',"Rock Tutor's giving another lesson.",'material'],
  ['well_golf','Well Digger',1,'pilot','Well Digger used the gravity. Watch the far side.','kill'],
  ['dead_mans_mass','Graverigger',1,'pilot','Graverigger just put that wreck back to work.','kill'],
  ['razor_release','Razorhand',2,'pilot','Razorhand. I saw when you cut it.','razor'],
  ['bank_job','Banker',2,'pilot',"Banker's here. Cover's not a guarantee.",'bank'],
  ['return_to_sender','Return Address',1,'pilot','Return Address. It came back with your name on it.','kill'],
  ['kickstart','Blast Rider',1,'pilot_ship','Blast Rider rode the blast clear.','escape_or_combat'],
  ['needle_thread','Needle',1,'pilot',"Needle went through that. Don't ask me how.",'escape'],
  ['one_two','Second Thought',1,'pilot','Second Thought changed its mind halfway there.','kill'],
  ['slingshot_golf','Slingwright',1,'pilot','Slingwright. Rope, well, wreck. I saw the whole thing.','kill'],
].map(([trickId,title,count,scope,bark,kind])=>Object.freeze({id:`title_${trickId}`,trickId,title,count,scope,bark,kind})));
export const STUNT_SITUATION_LINES = Object.freeze({
  bolas:["You threw him into his own wingman.","That was a ship. You threw a ship.","Break the line! Don't bunch up!"],
  wrecking_ball:["Keep the heavy end moving.","That's a heavy end to swing.","Stay outside the swing."],
  clothesline:["You closed his escape lane.","Watch the cable. Watch the cable!","Line across the corridor. Go wide."],
  collateral:["More contacts. One throw.","Keep clear of that chain.","Spread out. You're feeding the chain."],
  near_miss:["Clear. Barely.","I thought you were gone.","Missed. Reacquire."],
  tow_kill:["Dragged him all the way in.","Please don't tow that past us.","Cut the tether before the wall!"],
  rock_discovery:["The rock won.","That lane was marked.","Terrain strike. Ship disabled."],
  well_golf:["The well carried it around.","It's coming out the other side.","Don't sit on the exit tangent."],
  dead_mans_mass:["That wreck still had one job left.","That wreck is moving again.","Debris is being used as a weapon."],
  razor_release:["Perfect cut.","You let go just in time.","Released body inbound."],
  bank_job:["Nice bank. He thought he had cover.","Shots are coming around the block.","Change cover. That angle's compromised."],
  return_to_sender:["That one was theirs.","Did that just turn around?","Own ordnance returning!"],
  kickstart:["You used the blast to leave.","That's one way to clear the dock.","Blast-propelled departure. Track the exit."],
  needle_thread:["You fit. That's the important part.","There wasn't a gap a second ago.","Don't follow that line."],
  one_two:["You corrected it in flight.","It was going the other way.","Second impulse. New trajectory."],
  slingshot_golf:["You handed it from rope to gravity.","The well threw it back out.","Track the whole path, not the release."],
});
export function completeWitness(witness) {
  return witness?.provenance==='live-physical-samples'&&witness.sourceTicks>=6&&witness.transferTicks>=6&&witness.payoffTicks>=6;
}
function citationEvidence(incident) {
  return { revision:incident.evidenceRevision,consequence:{...incident.consequence},
    chain:copy((incident.chain||[]).slice(0,32)),
    witnesses:(incident.witnesses||[]).filter(completeWitness).map(w=>({identity:w.identity,lifeId:w.lifeId,
      sourceTicks:w.sourceTicks,transferTicks:w.transferTicks,payoffTicks:w.payoffTicks,terminalLives:w.terminalLives})).slice(0,8),
    deliveredReports:(incident.reports||[]).map(r=>({id:r.id,rootId:r.rootId,sentTick:r.sentTick,receivedTick:r.receivedTick,networkId:r.networkId})).slice(0,8) };
}
/** Keep recent detail and durable title citations; old visible rows remain truthful summaries. */
export function boundStuntNarrative(state) {
  const titles=state.story?.titles;if(!titles)return;
  const incidents=titles.stuntIncidents||[];
  const active=new Set((titles.stuntWitnessing?.reports||[]).map(p=>p.incidentId));
  for(let i=0;i<incidents.length-8;i++) {
    const incident=incidents[i];if(incident.detailRetained===false||active.has(incident.id)||state.tick<=incident.amendmentDeadline)continue;
    const chain=incident.chain||[];
    incident.pathKinds=[...new Set(chain.map(n=>n.kind??n.type))];
    incident.chain=(chain.length>3?[chain[0],...chain.slice(-2)]:chain).map(n=>({kind:n.kind??n.type,tick:n.tick,entityId:n.entityId,
      sourceLife:n.sourceLife??n.lifeId,targetId:n.targetId,targetLife:n.targetLife}));
    incident.witnessNames=(incident.witnesses||[]).filter(completeWitness).map(w=>w.name).slice(0,8);
    incident.witnesses=[];
    incident.reports=[...new Map((incident.reports||[]).map(r=>[r.networkId,r])).values()].map(r=>({id:r.id,rootId:r.rootId,senderId:r.senderId,networkId:r.networkId,
      sentTick:r.sentTick,receivedTick:r.receivedTick}));
    delete incident.reportSources;incident.detailRetained=false;
  }
}
export function qualifyStuntTitles(state,incident,bus) {
  const titles=state.story.titles; titles.byId ||= {};titles.stuntProgress ||= {};
  const witnesses=(incident.witnesses||[]).filter(completeWitness);
  if(!witnesses.length && incident.visibility!=='reported')return [];
  const earned=[];
  for(const rule of STUNT_TITLE_RULES) {
    const relevant=rule.trickId===incident.trickId
      ||rule.trickId==='collateral'&&incident.modifiers?.collateralCount>=3
      ||rule.trickId==='razor_release'&&incident.modifiers?.razorRelease==='razor'
      ||rule.trickId==='near_miss'&&incident.modifiers?.closeShave===true;
    if(!relevant)continue;
    if(rule.kind==='kill'&&incident.consequence?.killed!==true)continue;
    if(rule.kind==='bank'&&(!incident.consequence?.killed||!incident.bankCorridorId))continue;
    if(rule.kind==='escape'&&!incident.escaped)continue;
    if(rule.kind==='escape_or_combat'&&!incident.escaped&&!incident.materialCombat)continue;
    if(rule.kind==='collateral'&&!witnesses.some(w=>w.terminalLives?.length>=3)&&!(incident.reportedTerminalLives?.length>=3))continue;
    const existing=titles.byId[rule.id];
    if(existing?.status==='held') {
      existing.knownWitnesses=[...new Set([...(existing.knownWitnesses||[]),...witnesses.map(w=>w.identity)])].slice(-8);
      continue;
    }
    const progress=titles.stuntProgress[rule.id] ||= [];
    let citation=progress.find(p=>p.incidentId===incident.id);
    if(!citation) {
      citation={incidentId:incident.id,rootId:incident.rootId,trickId:incident.trickId,tick:incident.tick,shipId:incident.shipId,
        victimLives:(incident.victimLives||[]).map(v=>v.lifeId).slice(0,8),encounterId:incident.encounterId,
        threatEpisodeId:incident.threatEpisodeId,bankCorridorId:incident.bankCorridorId,
        materialCombat:incident.materialCombat,witnessIds:witnesses.map(w=>w.identity),networks:[...(incident.reportedNetworks||[])],
        evidence:citationEvidence(incident)};
      progress.push(citation);if(progress.length>8)progress.shift();
    }
    const victims=new Set(progress.flatMap(p=>p.victimLives));
    if(progress.length<(rule.trickId==='rock_discovery'?2:rule.count))continue;
    if(rule.trickId==='wrecking_ball'&&victims.size<2)continue;
    if(rule.trickId==='rock_discovery'&&(victims.size<3||progress.length<2))continue;
    if(rule.trickId==='near_miss'&&(new Set(progress.map(p=>p.threatEpisodeId).filter(Boolean)).size<3||new Set(progress.map(p=>p.encounterId).filter(Boolean)).size<2))continue;
    if(rule.trickId==='razor_release'&&!progress.some(p=>p.materialCombat))continue;
    if(rule.trickId==='bank_job'&&new Set(progress.map(p=>p.bankCorridorId)).size<2)continue;
    titles.byId[rule.id]={titleId:rule.id,title:rule.title,trickId:rule.trickId,status:'held',scope:rule.scope,
      holderKey:incident.pilotId,pilotId:incident.pilotId,shipIds:rule.scope==='pilot_ship'?[incident.shipId]:[],earnedTick:incident.tick,
      citations:copy(progress.slice(-rule.count)),knownWitnesses:witnesses.map(w=>w.identity),knownNetworks:[...(incident.reportedNetworks||[])]};
    delete titles.stuntProgress[rule.id];
    state.story.titlesSeen ||= [];
    state.story.titlesSeen.push({id:`${rule.id}:${incident.pilotId}`,title:rule.title,seenAt:incident.tick,holderKey:incident.pilotId,trickId:rule.trickId});
    if(state.story.titlesSeen.length>32)state.story.titlesSeen.shift();
    incident.titleIds ||= [];if(!incident.titleIds.includes(rule.id))incident.titleIds.push(rule.id);
    const event={titleId:rule.id,title:rule.title,trickId:rule.trickId,holderKey:incident.pilotId,incidentId:incident.id,tick:incident.tick};
    earned.push(event);bus?.emit?.('title:earned',event);
  }
  return earned;
}

/** Actual point-to-point report packet: sent now, received on a later active simulation tick. */
export function sendWitnessReports(state,incident,bus) {
  const own=witnessState(state);
  for(const witness of incident.witnesses||[]) {
    if(own.reports.length>=8)break;
    const sender=state.entities?.get?.(witness.id),profile=observerProfile(state,sender);
    if(!profile?.comms||!profile.factionId)continue;
    if(profile.lifeId!==witness.lifeId)continue;
    const coverageKey=JSON.stringify([witness.identity,witness.sourceTicks,witness.transferCoverage,witness.payoffTicks,witness.terminalLives]);
    if(incident.reportSources?.includes(coverageKey))continue;
    let receiver=null,range=Infinity;
    for(const entity of state.entities.values()) {
      if(entity.id===sender.id||entity.type!=='station')continue;
      const target=observerProfile(state,entity);
      if(!target?.comms||target.factionId!==profile.factionId)continue;
      const d=distance(sender.pos,entity.pos),limit=Math.min(sender.data?.commsRange??450,entity.data?.commsRange??450);
      if(d<=limit&&d<range){receiver=entity;range=d;}
    }
    if(!receiver)continue;
    const packet={id:`report:${++own.sequence}`,incidentId:incident.id,rootId:incident.rootId,senderId:sender.id,
      receiverId:receiver.id,receiverLife:bodyLife(receiver,state)?.id,networkId:receiver.data?.networkId??profile.factionId,source:copy(witness),sentTick:state.tick,
      deliveryTick:state.tick+Math.max(1,Math.ceil(range/1000*60))};
    own.reports.push(packet);incident.reportSources ||= [];incident.reportSources.push(coverageKey);if(incident.reportSources.length>8)incident.reportSources.shift();
    bus?.emit?.('stunt:reportSent',copy(packet));
  }
}
export function deliverWitnessReports(state,bus) {
  if(!adventureStunts(state)||state.mode!=='flight')return;
  const own=witnessState(state),tick=state.tick;
  if(!own.reports.length)return;
  let changed=false;
  for(const packet of own.reports.slice()) {
    if(tick<packet.deliveryTick)continue;
    own.reports.splice(own.reports.indexOf(packet),1);
    changed=true;
    const receiver=state.entities?.get?.(packet.receiverId),profile=observerProfile(state,receiver);
    const incident=state.story.titles.stuntIncidents?.find(i=>i.id===packet.incidentId);
    if(!profile?.comms||profile.lifeId!==packet.receiverLife||!incident||packet.rootId!==incident.rootId)continue;
    incident.reports ||= [];if(incident.reports.some(r=>r.id===packet.id))continue;
    incident.reports.push({...packet,receivedTick:tick});if(incident.reports.length>8)incident.reports.shift();
    const delivered=incident.reports.filter(r=>r.source&&r.networkId===packet.networkId&&r.rootId===incident.rootId);
    const source=Math.max(...delivered.map(r=>r.source.sourceTicks));
    const required=[...new Set(delivered.flatMap(r=>r.source.requiredTransfers||[]))];
    const transfer=required.length?Math.min(...required.map(life=>Math.max(...delivered.map(r=>r.source.transferCoverage?.[life]||0)))):0;
    const payoff=Math.max(...delivered.map(r=>r.source.payoffTicks));
    if(source>=6&&transfer>=6&&payoff>=6) {
      incident.visibility='reported';incident.reportedNetworks ||= [];
      if(!incident.reportedNetworks.includes(packet.networkId))incident.reportedNetworks.push(packet.networkId);
      incident.reportedTerminalLives=[...new Set(delivered.flatMap(r=>r.source.terminalLives||[]))].slice(0,8);
      qualifyStuntTitles(state,incident,bus);
      for(const title of Object.values(state.story.titles.byId||{}))if(title.citations?.some(c=>c.incidentId===incident.id)) {
        title.knownNetworks ||= [];if(!title.knownNetworks.includes(packet.networkId))title.knownNetworks.push(packet.networkId);
      }
    }
    bus?.emit?.('stunt:reportDelivered',{...copy(packet),receivedTick:tick});
    bus?.emit?.('story:stuntIncidentUpdated',{incident});
  }
  if(changed)boundStuntNarrative(state);
}
export function knownStuntTitles(state,observer,identity=incidentIdentity(state,{})) {
  const profile=observerProfile(state,observer);if(!profile)return [];
  const network=observer.data?.networkId??profile.factionId;
  return Object.values(state.story?.titles?.byId||{}).filter(t=>t.status==='held'
    &&(t.pilotId===identity.pilotId||t.scope==='pilot_ship'&&t.shipIds?.includes(identity.shipId))
    &&(t.knownWitnesses?.includes(profile.identity)||network&&t.knownNetworks?.includes(network))).slice(0,3);
}
