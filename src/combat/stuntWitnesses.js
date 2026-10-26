// Independent PQ-146 observation. Reads physical actors and the authoritative journal only.
import { journalFor, bodyLife } from './stuntEvidence.js';
import { witnessLineOfSight } from './lineOfSight.js';
import { activeHullIdentity } from '../data/hullIdentity.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { entityIndexVersion, entityIndexLaneVersion } from '../world/livingWorldViews.js';
export { witnessLineOfSight } from './lineOfSight.js';
const LIMITS = { episodes: 32, witnesses: 8, terminals: 8, reportQueue: 8 };
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const copy = value => JSON.parse(JSON.stringify(value));
export function adventureStunts(state) { return !state.run || state.run.phase === 'inactive' || state.run.kind === 'adventure'; }
export function witnessState(state) {
  // The hops to the bag are restored-state too: a truthy primitive at story/titles survives
  // ||= and then throws when the leaf key is written — normalize by shape, not truthiness.
  if (!state.story || typeof state.story !== 'object') state.story = {};
  if (!state.story.titles || typeof state.story.titles !== 'object') state.story.titles = {};
  const titles = state.story.titles;
  // A restored save adopts this bag wholesale — normalize every field the tick loop
  // dereferences (a plain-proto episodes bag re-opens the '__proto__' read seam; a missing
  // reports/sequence crashes or mints NaN ids; a primitive/array bag itself is corrupt too).
  let own = titles.stuntWitnessing;
  if (!own || typeof own !== 'object' || Array.isArray(own)) {
    titles.stuntWitnessing = own = { version: 1, episodes: Object.create(null), reports: [], lastTick: -1, sequence: 0 };
  }
  if (!own.episodes || typeof own.episodes !== 'object' || Object.getPrototypeOf(own.episodes) !== null) {
    own.episodes = Object.assign(Object.create(null), own.episodes);
  }
  if (!Array.isArray(own.reports)) own.reports = [];
  if (!Number.isFinite(own.sequence)) own.sequence = 0;
  if (!Number.isFinite(own.lastTick)) own.lastTick = -1;
  return own;
}
export function observerIdentity(entity) {
  return entity?.data?.worldRecordId ?? entity?.data?.identityKey ?? entity?.data?.transponderId ?? (entity?.id != null ? `entity:${entity.id}` : null);
}
// Witness-eligible types are spawn-fixed — the subset is latched on the entity-index
// version instead of paying observerProfile over every entity every tick while stunt
// roots are open. Volatile gates (alive/sensors/owner/hostility) still run per call.
const _witnessCandidates = { version: null, source: null, list: [] };
// Members are ship|station|sensor|camera — sensor/camera never spawn as entity types,
// so shipLike+stations lanes cover the real subset and projectile churn can't wake it.
const WITNESS_CANDIDATE_LANES = ['shipLike', 'stations'];
function witnessCandidatesFor(state) {
  const laneVersion = entityIndexLaneVersion(state, WITNESS_CANDIDATE_LANES);
  const version = laneVersion === -1 ? entityIndexVersion(state) : laneVersion;
  const cache = _witnessCandidates;
  if (version == null || cache.version !== version || cache.source !== state.entities) {
    cache.version = version;
    cache.source = state.entities;
    cache.list.length = 0;
    for (const e of state.entities.values()) {
      if (e && ['ship','station','sensor','camera'].includes(e.type)) cache.list.push(e);
    }
  }
  return cache.list;
}
// The root×observer target walk is spawn-stable eligibility — `alive`/`point(pos)` are
// rechecked per target below, and Map order is load-bearing (the tracked<8 cap picks by
// iteration order), so the array is version-latched rather than hash-queried.
const _witnessTargets = { version: null, source: null, list: [] };
function witnessTargetsFor(state) {
  const version = entityIndexVersion(state);
  const cache = _witnessTargets;
  if (version == null || cache.version !== version || cache.source !== state.entities) {
    cache.version = version;
    cache.source = state.entities;
    cache.list.length = 0;
    for (const t of state.entities.values()) if (t && t.alive && point(t.pos)) cache.list.push(t);
  }
  return cache.list;
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
  // Malformed restored rows (null, primitives) hold no evidence and can never expire — drop
  // them with the stale ones so the bag cannot crash or wedge the sweep.
  for(const [id,row] of Object.entries(own.episodes))if(!row||typeof row!=='object'||Array.isArray(row)||!Number.isFinite(row.rootTick)||tick>row.rootTick+480)delete own.episodes[id];
  const player=state.entities?.get?.(state.playerId);if(!player)return;
  const observers=[];
  for(const entity of witnessCandidatesFor(state)) { const profile=observerProfile(state,entity);if(profile&&distance(entity.pos,player.pos)<=450)observers.push({entity,profile}); }
  observers.sort((a,b)=>distance(a.entity.pos,player.pos)-distance(b.entity.pos,player.pos)||String(a.entity.id).localeCompare(String(b.entity.id)));
  observers.length=Math.min(observers.length,LIMITS.witnesses);
  // Per-tick target candidates for the root×observer nest — alive/point are rechecked
  // per target below; this just avoids re-walking the whole entity map per (root,observer).
  const witnessTargets=witnessTargetsFor(state);
  for(const root of j.roots.values()) {
    if(root.actorId!==state.playerId||tick<root.tick||tick>root.tick+480||root.truncated)continue;
    // episodes/observers/targets bags are keyed by record-derived identities (restored root ids,
    // worldRecordId/life ids) — hasOwn-guarded reads, defineProperty writes, null-prototype bags:
    // a corrupted '__proto__'-class id becomes an own key instead of Object.prototype or a throw.
    // A restored null/primitive row is dead data — a fresh episode replaces it (the cap only
    // gates genuinely new keys, never the overwrite of a corrupt one).
    let episode=Object.hasOwn(own.episodes,root.id)?own.episodes[root.id]:null;
    if(!episode||typeof episode!=='object'||Array.isArray(episode)) {
      if(!Object.hasOwn(own.episodes,root.id)&&Object.keys(own.episodes).length>=LIMITS.episodes)continue;
      episode={rootId:root.id,rootTick:root.tick,observers:Object.create(null)};
      Object.defineProperty(own.episodes,root.id,{value:episode,writable:true,enumerable:true,configurable:true});
    }
    if(!episode.observers||typeof episode.observers!=='object'||Object.getPrototypeOf(episode.observers)!==null) {
      episode.observers=Object.assign(Object.create(null),episode.observers);
    }
    const source=state.entities.get(root.sourceId);
    if(!source?.alive||bodyLife(source,state)?.id!==root.sourceLife)continue;
    for(const {entity:observer,profile} of observers) {
      // A restored primitive/null observer row is dead weight of the same class — a fresh row
      // replaces it so a corrupt bag cannot silently mask a real witness.
      let row=Object.hasOwn(episode.observers,profile.identity)?episode.observers[profile.identity]:null;
      if(!row||typeof row!=='object'||Array.isArray(row)){row={...profile,sourceTicks:0,transferTicks:0,payoffTicks:0,targets:Object.create(null),firstSeen:tick};episode.observers[profile.identity]=row;}
      if(row.lifeId!==profile.lifeId)continue;
      if(!row.targets||typeof row.targets!=='object'||Object.getPrototypeOf(row.targets)!==null) {
        row.targets=Object.assign(Object.create(null),row.targets);
      }
      const seesSource=canSee(state,observer,profile,source,[player.id]);
      const seesActor=canSee(state,observer,profile,player,[source.id]);
      const loaded=root.constraint?.attached&&root.constraint.loadedTicks>0;
      const timely=row.firstSeen<=root.tick+1||loaded;
      sampleCounter(row,'sourceTicks',tick,timely&&seesSource&&seesActor&&!root.release);
      const transferring=root.release ? tick>=root.release.tick : tick>root.tick;
      sampleCounter(row,'transferTicks',tick,transferring&&seesSource);
      row.sourceTicks=Math.min(row.sourceTicks,6);row.transferTicks=Math.min(row.transferTicks,6);
      // Watch actual approaching bodies before their terminal event; no destroyed target is
      // retroactively treated as visible for six later samples. The candidate walk is
      // hoisted out of the root×observer nest (spawn-stable eligibility only: every
      // per-target gate below re-runs per observer, preserving order and results).
      let tracked=0;
      for(const target of witnessTargets) {
        if(tracked>=8)break;
        const relevantFlight=root.threatIds?.includes(target.id)||root.needle?.boundaryIds?.includes(target.id);
        if(!target.alive||(!target.collides&&!relevantFlight)||target.id===source.id||target.id===player.id||!point(target.pos))continue;
        if(!relevantFlight&&distance(source.pos,target.pos)>Math.max(120,Math.hypot(source.vel?.x||0,source.vel?.z||0)*.12+(target.radius||0)))continue;
        const life=bodyLife(target,state);if(!life)continue;
        let v=Object.hasOwn(row.targets,life.id)?row.targets[life.id]:null;
        if(!v||typeof v!=='object'||Array.isArray(v))v=row.targets[life.id]={id:target.id,count:0,last:-2};
        const visible=canSee(state,observer,profile,target,[source.id]);
        v.count=visible?(v.last===tick-1?Math.min(6,v.count+1):1):0;v.last=tick;
        v.max=Math.max(v.max||0,v.count);
        if(relevantFlight)v.flight=true;
        tracked++;
      }
      for(const [id,v] of Object.entries(row.targets))if(!v||typeof v!=='object'||(!v.flight&&tick-v.last>6))delete row.targets[id];
      if(root.escape?.completed&&tick-root.escape.completedTick<=1) {
        const ids=[...(root.escape.threatIds||[]),...(root.escape.boundaryIds||[])];
        row.escapeVerified=seesSource&&ids.length>0&&ids.every(id=>Object.values(row.targets).some(v=>v&&v.id===id&&v.max>=6));
      }
    }
  }
}
export function sampledStuntWitnesses(state,trick,{partial=false}={}) {
  const own=witnessState(state),episode=Object.hasOwn(own.episodes,trick?.rootId)?own.episodes[trick.rootId]:null; if(!episode||typeof episode!=='object')return [];
  if(!episode.observers||typeof episode.observers!=='object'||Object.getPrototypeOf(episode.observers)!==null) {
    episode.observers=Object.assign(Object.create(null),episode.observers);
  }
  const tick=trick?.tick,root=journalFor(state)?.roots.get(trick?.rootId);
  const lives=Array.isArray(trick?.victimLives)?trick.victimLives:[];
  const result=[];
  for(const row of Object.values(episode.observers)) {
    if(!row||typeof row!=='object')continue;
    if(!row.targets||typeof row.targets!=='object'||Object.getPrototypeOf(row.targets)!==null) {
      row.targets=Object.assign(Object.create(null),row.targets);
    }
    const entity=state.entities?.get?.(row.id),profile=observerProfile(state,entity);if(!profile||profile.lifeId!==row.lifeId)continue;
    if(lives.some(life=>life&&life.dead===true&&life.lifeId===profile.lifeId))continue;
    if(!partial&&((row.sourceTicksMax||0)<6||(row.transferTicksMax||0)<6))continue;
    const observed=[];
    for(const life of lives) {
      if(!life||typeof life!=='object')continue;
      const target=life.lifeId===root?.sourceLife?{id:root.sourceId,count:row.transferTicksMax??0,last:row.transferTicksLast??-2}:row.targets[life.lifeId];
      const live=state.entities.get(target?.id);
      const terminal=root?.nodes?.findLast?.(n=>n.kind==='contact'&&(n.targetLife===life.lifeId||n.sourceLife===life.lifeId));
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
  ['ore_shotgun','Shellwright',1,'pilot_ship','Shellwright. That pod was a shell.','kill'],
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
  ore_shotgun:["That pod was a shell.","You shoved cargo into him. Cargo won.","Don't let him spend your hold on us!"],
});
// THE WORLD ANSWERS: a recognised trick said more exactly. A variant line (or the cargo-naming line
// of Ore Shotgun) is what a witness says about THIS episode, ahead of the generic title bark.
export const STUNT_VARIANT_LINES = Object.freeze({
  bolas_pair:'Two hulls, one rope, one rock.',
  own_wingman:'His own wingman finished him.',
});
export function stuntSpecificLine(incident) {
  if(!incident)return null;
  if(incident.trickId==='ore_shotgun') {
    const name=cleanName(incident.cargo?.name,'cargo').toLowerCase();
    return `That was your ${name}. The pod killed him.`;
  }
  return (incident.variantId && Object.hasOwn(STUNT_VARIANT_LINES, incident.variantId))
    ? STUNT_VARIANT_LINES[incident.variantId] : null;
}
export function completeWitness(witness) {
  return witness?.provenance==='live-physical-samples'&&witness.sourceTicks>=6&&witness.transferTicks>=6&&witness.payoffTicks>=6;
}
const cleanName=(value,fallback)=>{const out=String(value==null?fallback:value).replace(/\s+/g,' ').trim();return out||fallback;};
/** §5.2 one-sentence physical account, shared by the ship ledger and the port dossier. */
export function stuntAccountFor(record) {
  const source=cleanName(record?.sourceName,'the released body'),target=cleanName(record?.targetName,'the target');
  if(record?.variantId==='bolas_pair')return `bridled ${target} to a wingman and drove the pair into the rock`;
  if(record?.variantId==='own_wingman')return `put the wreck ${source} back in motion against its own wingman ${target}`;
  const account = {
    bolas:`released ${source} under load into ${target}`,
    wrecking_ball:`swung the attached ${source} into ${target}`,
    clothesline:`loaded a tether across ${target}'s path`,
    tow_kill:`towed ${source} into a fatal collision`,
    rock_discovery:`redirected ${source} into terrain`,
    well_golf:`sent ${source} through a gravity field into ${target}`,
    dead_mans_mass:`put the wreck ${source} back in motion against ${target}`,
    bank_job:`banked a shot around cover into ${target}`,
    return_to_sender:`returned hostile ordnance to its attacker ${target}`,
    kickstart:record?.escaped?'rode an explosion clear of an incoming threat':`spent blast momentum against ${target}`,
    needle_thread:'escaped an incoming threat through a moving gap',
    one_two:`corrected ${source}'s path with a second intervention into ${target}`,
    slingshot_golf:`passed ${source} from a loaded tether through gravity into ${target}`,
    ore_shotgun:`shoved ${source} into ${target} and the cargo killed it`,
    near_miss:'changed course and cleared an incoming threat',
  };
  // hasOwn: trickId rides the persisted incident record — a prototype key must not land an
  // inherited member as the ledger's account text.
  return (record?.trickId && Object.hasOwn(account, record.trickId) && account[record.trickId])
    || `completed ${cleanName(record?.name||record?.trickId,'a stunt')}`;
}
/** §6 harm row: actual recorded outcomes only; unknown values stay unknown. */
export function stuntHarmFor(incident) {
  const dead=(Array.isArray(incident?.victimLives)?incident.victimLives:[]).filter(v=>v&&v.dead===true).length;
  if(dead>0)return `${dead} ship${dead===1?'':'s'} destroyed`;
  if(incident?.consequence?.killed===true)return '1 ship destroyed';
  if(incident?.escaped===true)return 'no recorded harm';
  const c=incident?.consequence;
  if(c&&c.hullMax>0&&c.hullDamage>=0.25*c.hullMax)return 'disablement recorded';
  return 'harm not established';
}
/**
 * §6 rap sheet: what one information network actually knows about the pilot. Only DELIVERED
 * reports create dossier knowledge — black-box records and witnessed-only talk stay local.
 * `networkIds` is one id or a list the viewing body legitimately holds (faction id, the port's
 * own networkId or station alias). Bounded: three titles, three most recent incidents.
 */
export function stuntDossierForNetwork(state, networkIds) {
  const keys=new Set((Array.isArray(networkIds)?networkIds:[networkIds]).filter(v=>v!=null&&v!=='').map(String));
  const titles=state?.story?.titles;
  if(!keys.size||!titles)return null;
  const knownTitles=Object.values(titles.byId||{})
    .filter(t=>t&&typeof t==='object'&&t.status==='held'&&(Array.isArray(t.knownNetworks)?t.knownNetworks:[]).some(n=>keys.has(n)))
    .slice(0,3)
    .map(t=>({titleId:t.titleId,title:t.title,trickId:t.trickId}));
  const incidents=(Array.isArray(titles.stuntIncidents)?titles.stuntIncidents:[])
    .filter(i=>i&&typeof i==='object'&&(Array.isArray(i.reportedNetworks)?i.reportedNetworks:[]).some(n=>keys.has(n)))
    .slice(-3)
    .map(i=>{
      const sender=(Array.isArray(i.reports)?i.reports:[]).filter(r=>r&&keys.has(r.networkId)).map(r=>r.source?.name).find(v=>typeof v==='string'&&v)||null;
      return { id:i.id,trickId:i.trickId,name:i.name,tick:i.tick,sectorId:i.sectorId??null,
        shipName:cleanName(i.shipName,'the ship'),account:stuntAccountFor(i),harm:stuntHarmFor(i),
        evidence:sender?`delivered report from ${sender}`:'delivered report',disposition:'reported' };
    });
  if(!knownTitles.length&&!incidents.length)return null;
  return { titles:knownTitles, incidents };
}
function citationEvidence(incident) {
  return { revision:incident.evidenceRevision,consequence:{...incident.consequence},
    chain:copy((Array.isArray(incident.chain)?incident.chain:[]).slice(0,32)),
    witnesses:(Array.isArray(incident.witnesses)?incident.witnesses:[]).filter(completeWitness).map(w=>({identity:w.identity,lifeId:w.lifeId,
      sourceTicks:w.sourceTicks,transferTicks:w.transferTicks,payoffTicks:w.payoffTicks,terminalLives:w.terminalLives})).slice(0,8),
    deliveredReports:(Array.isArray(incident.reports)?incident.reports:[]).filter(r=>r&&typeof r==='object')
      .map(r=>({id:r.id,rootId:r.rootId,sentTick:r.sentTick,receivedTick:r.receivedTick,networkId:r.networkId})).slice(0,8) };
}
/** Keep recent detail and durable title citations; old visible rows remain truthful summaries. */
export function boundStuntNarrative(state) {
  const titles=state.story?.titles;if(!titles)return;
  const incidents=Array.isArray(titles.stuntIncidents)?titles.stuntIncidents:[];
  const active=new Set((Array.isArray(titles.stuntWitnessing?.reports)?titles.stuntWitnessing.reports:[]).map(p=>p?.incidentId));
  for(let i=0;i<incidents.length-8;i++) {
    const incident=incidents[i];if(!incident||typeof incident!=='object'||incident.detailRetained===false||active.has(incident.id)||state.tick<=incident.amendmentDeadline)continue;
    const chain=(Array.isArray(incident.chain)?incident.chain:[]).filter(n=>n&&typeof n==='object');
    incident.pathKinds=[...new Set(chain.map(n=>n.kind??n.type))];
    incident.chain=(chain.length>3?[chain[0],...chain.slice(-2)]:chain).map(n=>({kind:n.kind??n.type,tick:n.tick,entityId:n.entityId,
      sourceLife:n.sourceLife??n.lifeId,targetId:n.targetId,targetLife:n.targetLife}));
    incident.witnessNames=(Array.isArray(incident.witnesses)?incident.witnesses:[]).filter(completeWitness).map(w=>w.name).slice(0,8);
    incident.witnesses=[];
    incident.reports=[...new Map((Array.isArray(incident.reports)?incident.reports:[]).filter(r=>r&&typeof r==='object').map(r=>[r.networkId,r])).values()].map(r=>({id:r.id,rootId:r.rootId,senderId:r.senderId,networkId:r.networkId,
      sentTick:r.sentTick,receivedTick:r.receivedTick}));
    delete incident.reportSources;incident.detailRetained=false;
  }
}
export function qualifyStuntTitles(state,incident,bus) {
  const titles=state.story.titles;
  // Restored titles fields can carry wrong-shape values — a primitive byId/stuntProgress is
  // dead data that would otherwise throw on the write below.
  if(!titles.byId||typeof titles.byId!=='object'||Array.isArray(titles.byId))titles.byId={};
  if(!titles.stuntProgress||typeof titles.stuntProgress!=='object'||Array.isArray(titles.stuntProgress))titles.stuntProgress={};
  const witnesses=(Array.isArray(incident?.witnesses)?incident.witnesses:[]).filter(completeWitness);
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
    if(rule.kind==='collateral'&&!witnesses.some(w=>w&&w.terminalLives?.length>=3)&&!(incident.reportedTerminalLives?.length>=3))continue;
    const existing=titles.byId[rule.id];
    if(existing?.status==='held') {
      existing.knownWitnesses=[...new Set([...(Array.isArray(existing.knownWitnesses)?existing.knownWitnesses:[]),...witnesses.map(w=>w.identity)])].slice(-8);
      continue;
    }
    let progress=titles.stuntProgress[rule.id];
    if(!Array.isArray(progress))progress=titles.stuntProgress[rule.id]=[];
    let citation=progress.find(p=>p&&p.incidentId===incident.id);
    if(!citation) {
      citation={incidentId:incident.id,rootId:incident.rootId,trickId:incident.trickId,tick:incident.tick,shipId:incident.shipId,
        victimLives:(Array.isArray(incident.victimLives)?incident.victimLives:[]).map(v=>v&&v.lifeId).slice(0,8),encounterId:incident.encounterId,
        threatEpisodeId:incident.threatEpisodeId,bankCorridorId:incident.bankCorridorId,
        materialCombat:incident.materialCombat,witnessIds:witnesses.map(w=>w.identity),networks:[...(Array.isArray(incident.reportedNetworks)?incident.reportedNetworks:[])],
        evidence:citationEvidence(incident)};
      progress.push(citation);if(progress.length>8)progress.shift();
    }
    const victims=new Set(progress.flatMap(p=>Array.isArray(p?.victimLives)?p.victimLives:[]).filter(v=>v!=null));
    if(progress.length<(rule.trickId==='rock_discovery'?2:rule.count))continue;
    if(rule.trickId==='wrecking_ball'&&victims.size<2)continue;
    if(rule.trickId==='rock_discovery'&&(victims.size<3||progress.length<2))continue;
    if(rule.trickId==='near_miss'&&(new Set(progress.map(p=>p?.threatEpisodeId).filter(Boolean)).size<3||new Set(progress.map(p=>p?.encounterId).filter(Boolean)).size<2))continue;
    if(rule.trickId==='razor_release'&&!progress.some(p=>p?.materialCombat))continue;
    if(rule.trickId==='bank_job'&&new Set(progress.map(p=>p?.bankCorridorId).filter(v=>v!=null)).size<2)continue;
    titles.byId[rule.id]={titleId:rule.id,title:rule.title,trickId:rule.trickId,status:'held',scope:rule.scope,
      holderKey:incident.pilotId,pilotId:incident.pilotId,shipIds:rule.scope==='pilot_ship'?[incident.shipId]:[],earnedTick:incident.tick,
      citations:copy(progress.slice(-rule.count)),knownWitnesses:witnesses.map(w=>w.identity),knownNetworks:[...(Array.isArray(incident.reportedNetworks)?incident.reportedNetworks:[])]};
    delete titles.stuntProgress[rule.id];
    if(!Array.isArray(state.story.titlesSeen))state.story.titlesSeen=[];
    state.story.titlesSeen.push({id:`${rule.id}:${incident.pilotId}`,title:rule.title,seenAt:incident.tick,holderKey:incident.pilotId,trickId:rule.trickId});
    if(state.story.titlesSeen.length>32)state.story.titlesSeen.shift();
    if(!Array.isArray(incident.titleIds))incident.titleIds=[];if(!incident.titleIds.includes(rule.id))incident.titleIds.push(rule.id);
    const event={titleId:rule.id,title:rule.title,trickId:rule.trickId,holderKey:incident.pilotId,incidentId:incident.id,tick:incident.tick};
    earned.push(event);bus?.emit?.('title:earned',event);
  }
  return earned;
}

/** Actual point-to-point report packet: sent now, received on a later active simulation tick. */
export function sendWitnessReports(state,incident,bus) {
  const own=witnessState(state);
  for(const witness of (Array.isArray(incident?.witnesses)?incident.witnesses:[])) {
    if(own.reports.length>=8)break;
    if(!witness||typeof witness!=='object')continue;
    const sender=state.entities?.get?.(witness.id),profile=observerProfile(state,sender);
    if(!profile?.comms||!profile.factionId)continue;
    if(profile.lifeId!==witness.lifeId)continue;
    const coverageKey=JSON.stringify([witness.identity,witness.sourceTicks,witness.transferCoverage,witness.payoffTicks,witness.terminalLives]);
    if(Array.isArray(incident.reportSources)&&incident.reportSources.includes(coverageKey))continue;
    let receiver=null,range=Infinity;
    const _swIndex=state.entityIndex;
    const _swReceivers=_swIndex&&_swIndex.__spacefaceEntityIndexV1===true&&_swIndex.ready===true
      &&Array.isArray(_swIndex.stations)?_swIndex.stations:state.entities.values();
    for(const entity of _swReceivers) {
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
    own.reports.push(packet);if(!Array.isArray(incident.reportSources))incident.reportSources=[];incident.reportSources.push(coverageKey);if(incident.reportSources.length>8)incident.reportSources.shift();
    bus?.emit?.('stunt:reportSent',copy(packet));
  }
}
export function deliverWitnessReports(state,bus) {
  if(!adventureStunts(state)||state.mode!=='flight')return;
  const own=witnessState(state),tick=state.tick;
  if(!own.reports.length)return;
  let changed=false;
  for(const packet of own.reports.slice()) {
    // A restored null/primitive packet can never deliver — eject it with the queue sweep.
    // Same for an unreachable deliveryTick: a legit packet lands within ~60 ticks of send
    // (comms range ≤ ~1000 WU), so a non-finite or far-future value is dead weight occupying
    // one of the 8 queue slots forever.
    if(!packet||typeof packet!=='object'||!Number.isFinite(packet.deliveryTick)||packet.deliveryTick>tick+7200) {
      own.reports.splice(own.reports.indexOf(packet),1);changed=true;continue;
    }
    if(tick<packet.deliveryTick)continue;
    own.reports.splice(own.reports.indexOf(packet),1);
    changed=true;
    const receiver=state.entities?.get?.(packet.receiverId),profile=observerProfile(state,receiver);
    const incident=(Array.isArray(state.story.titles.stuntIncidents)?state.story.titles.stuntIncidents:[]).find(i=>i&&i.id===packet.incidentId);
    if(!profile?.comms||profile.lifeId!==packet.receiverLife||!incident||packet.rootId!==incident.rootId)continue;
    if(!Array.isArray(incident.reports))incident.reports=[];if(incident.reports.some(r=>r&&r.id===packet.id))continue;
    incident.reports.push({...packet,receivedTick:tick});if(incident.reports.length>8)incident.reports.shift();
    const delivered=incident.reports.filter(r=>r&&r.source&&r.networkId===packet.networkId&&r.rootId===incident.rootId);
    const source=Math.max(...delivered.map(r=>r.source.sourceTicks));
    const required=[...new Set(delivered.flatMap(r=>r.source.requiredTransfers||[]))];
    const transfer=required.length?Math.min(...required.map(life=>Math.max(...delivered.map(r=>r.source.transferCoverage?.[life]||0)))):0;
    const payoff=Math.max(...delivered.map(r=>r.source.payoffTicks));
    if(source>=6&&transfer>=6&&payoff>=6) {
      incident.visibility='reported';if(!Array.isArray(incident.reportedNetworks))incident.reportedNetworks=[];
      if(!incident.reportedNetworks.includes(packet.networkId))incident.reportedNetworks.push(packet.networkId);
      incident.reportedTerminalLives=[...new Set(delivered.flatMap(r=>r.source.terminalLives||[]))].slice(0,8);
      qualifyStuntTitles(state,incident,bus);
      for(const title of Object.values(state.story.titles.byId||{}))if(title?.citations?.some(c=>c&&c.incidentId===incident.id)) {
        if(!Array.isArray(title.knownNetworks))title.knownNetworks=[];if(!title.knownNetworks.includes(packet.networkId))title.knownNetworks.push(packet.networkId);
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
  return Object.values(state.story?.titles?.byId||{}).filter(t=>t&&typeof t==='object'&&t.status==='held'
    &&(t.pilotId===identity.pilotId||t.scope==='pilot_ship'&&(Array.isArray(t.shipIds)?t.shipIds:[]).includes(identity.shipId))
    &&((Array.isArray(t.knownWitnesses)?t.knownWitnesses:[]).includes(profile.identity)||network&&(Array.isArray(t.knownNetworks)?t.knownNetworks:[]).includes(network))).slice(0,3);
}
