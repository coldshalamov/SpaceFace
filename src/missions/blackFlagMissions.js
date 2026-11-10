// Imported by missions: physical source facts determine offers; missions alone settles wages.
import { BLACK_FLAG_ENCOUNTER_BY_ID } from '../data/blackFlag.js';
import { SECTORS } from '../data/sectors.js';
import { isBlackFlagAdventure, peekShipjack } from '../shipjack/model.js';
import { componentDefinition, componentCondition } from '../shipjack/market.js';
import { fenceForStation } from '../data/fences.js';

const STATIONS = new Map(SECTORS.flatMap(s => (s.stations || []).map(st => [st.id, { ...st, sectorId: s.id }])));
const LIMIT = 96;
const ACTIONS = new Set(['scan','hail','probe','isolator','port','drone','shutdown','helm','secure','piloted','cargo','repair_module','register','settle_title','forge_broadcast','repaint','return','sell','extract']);
export const BLACK_FLAG_JOB_PATTERNS = Object.freeze([
  { id:'intact_return', wage:300, name:'Bring the living frame home', steps:['Identify the frame','Return hull and installed equipment to its claimant'] },
  { id:'crew_return', wage:450, name:'People before machinery', steps:['Agree safe crew passage','Return the crew’s intact vessel'] },
  { id:'blackbird_prize', wage:600, name:'The Blackbird job', steps:['Identify Blackbird','Fly the actual prize or extract its unique governor'] },
  { id:'cold_controller', wage:400, name:'Cold Logic, live evidence', steps:['Perform a real safe shutdown','Extract the scanner controller or return the whole craft'] },
  { id:'warrant_return', wage:500, name:'One writ, one frame', steps:['Identify the exact warranted frame','Honor crew passage','Return this frame to its named receiver'] },
  { id:'claim_resolution', wage:400, name:'The claim war', steps:['Read the physical frame record','Choose return, compensated title, salvage registration, fence sale, or a tested copied broadcast'] },
  { id:'forensic_survey', wage:200, name:'A broadcast is not a frame', steps:['Record the target’s signatures','Submit the same vessel to a grade-three registry inspection'] },
  { id:'cold_restart', wage:250, name:'Give the drive a second life', steps:['Acquire the damaged vessel','Restore its installed engine through the yard'] },
  { id:'component_bounty', wage:250, name:'Bring the part, spare the shell', steps:['Identify the fitted component','Extract that exact component at recoverable condition'] },
  { id:'hot_fence_run', wage:300, name:'Hot berth delivery', steps:['Secure a reported disputed hull','Sell the physical prize to an illicit receiving yard'] },
  { id:'fleet_retrieval', wage:150, name:'No hull left behind', steps:['Locate your field-parked vessel','Pay for recovery and receive this hull at a named berth'] },
  { id:'broadcast_trial', wage:250, name:'The copied serial field trial', steps:['Fit a broker’s copied broadcast','Pass a broadcast-only inspection','Expose its mismatch to a grade-three inspector'] },
].map(Object.freeze));
const PATTERNS = new Map(BLACK_FLAG_JOB_PATTERNS.map(p => [p.id,p]));
const PRIMARY = { black_flag_empty_seat:'intact_return', black_flag_second_measure:'crew_return', black_flag_blackbird:'blackbird_prize', black_flag_cold_logic:'cold_controller', black_flag_writ_of_return:'warrant_return', black_flag_claim_war:'claim_resolution' };
const terminal = v => ['destroyed','sold','returned'].includes(v?.location?.kind);
const offerId = (id, pattern) => `blackflag:${id}:${pattern}`;
const finite = n => Number.isFinite(n) ? n : 0;

export function normalizeBlackFlagJobs(input) {
  if (!input || input.version !== 1 || !input.byVessel || typeof input.byVessel !== 'object' || Array.isArray(input.byVessel)) return null;
  const out = {version:1,byVessel:{}};
  for (const [id,row] of Object.entries(input.byVessel).slice(0,LIMIT)) {
    if (!/^vessel:[A-Za-z0-9:_-]{1,90}$/.test(id) || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    const actions = {};
    for (const key of ACTIONS) if (row.actions?.[key] === true) actions[key] = true;
    const extracted = (Array.isArray(row.extracted)?row.extracted:[]).slice(0,8).filter(p=>p&&componentDefinition(p.defId)&&typeof p.instanceId==='string').map(p=>({defId:p.defId,instanceId:p.instanceId.slice(0,120),condition:componentCondition(p.condition)}));
    out.byVessel[id] = {actions,extracted,finished:[...new Set((Array.isArray(row.finished)?row.finished:[]).filter(p=>PATTERNS.has(p)))].slice(0,12),
      lowAccepted:row.lowAccepted===true,highInspected:row.highInspected===true,highRejected:row.highRejected===true,driveRepaired:row.driveRepaired===true};
  }
  return out;
}
function ledger(state,create=false) {
  const own=state.missions;
  if(!own)return null;
  if(!own.blackFlagJobs&&create)own.blackFlagJobs={version:1,byVessel:{}};
  return own.blackFlagJobs || null;
}
function facts(state,id,create=false) {
  if(!peekShipjack(state)?.vesselsById[id])return null;
  const bag=ledger(state,create);if(!bag)return null;
  if(!bag.byVessel[id]&&create&&Object.keys(bag.byVessel).length<LIMIT)bag.byVessel[id]={actions:{},extracted:[],finished:[],lowAccepted:false,highInspected:false,highRejected:false};
  return bag.byVessel[id] || null;
}
function entry(state,id) {
  const sj=peekShipjack(state),v=sj?.vesselsById[id];if(!v)return null;
  const encounter=Object.entries(sj.encounters || {}).find(([,r])=>r.vesselId===id)?.[0];
  const row=BLACK_FLAG_ENCOUNTER_BY_ID.get(encounter) || BLACK_FLAG_ENCOUNTER_BY_ID.get(v.origin);
  const f=facts(state,id) || {actions:{},extracted:[],finished:[]};
  const attempt=sj.custodyAttempts?.[id],owned=state.player.ownedShips?.find(s=>s.vesselId===id);
  const yards=(sj.yardReceipts || []).filter(r=>r.vesselId===id&&r.ok);
  const scanned=attempt?.scanned===true||f.actions.scan===true||v.history?.some(h=>h.action==='scan');
  const returned=v.claimResolved===true&&v.location.kind==='returned';
  const piloted=f.actions.piloted===true||state.player.shipControlTransfers?.receipts?.some(r=>r.vesselId===id&&r.ok);
  const extracted=[...f.extracted];
  for(const r of yards.filter(r=>r.action==='extract')) {
    if(extracted.some(p=>p.instanceId===r.instanceId))continue;
    const item=state.player.moduleInventory?.find(m=>m.instanceId===r.instanceId);
    extracted.push({defId:r.defId,instanceId:r.instanceId,condition:item?componentCondition(item.condition):0});
  }
  return {sj,v,row,f,attempt,owned,yards,scanned,returned,piloted,extracted,
    action:a=>f.actions[a]===true||v.history?.some(h=>h.action===a)||yards.some(r=>r.action===a),
    safe:v.crewSafe===true,sold:v.location.kind==='sold'&&yards.some(r=>r.action==='sell'),
    illicitSold:v.location.kind==='sold'&&yards.some(r=>r.action==='sell'&&fenceForStation(r.stationId)),
    recovered:(sj.fleetReceipts || []).some(r=>r.vesselId===id&&r.ok&&r.status==='arrived')};
}
function targetComponent(e) {
  if(e.row?.id==='black_flag_blackbird')return 'unique_blackbird_governor';
  const candidates=e.owned?.fittings || e.row?.fitted || [];
  return candidates.find(id=>componentDefinition(id)?.slotType==='engine') || candidates.find(id=>componentDefinition(id)) || null;
}
function projection(e,pattern,params={}) {
  const part=id=>e.extracted.some(p=>p.defId===id&&p.condition>=0.25);
  let tests=[],method=pattern;
  switch(pattern) {
    case 'intact_return': tests=[e.scanned,e.returned&&e.v.condition.hull>=0.35&&e.extracted.length===0];method='intact_claimant_return';break;
    case 'crew_return': tests=[e.safe,e.returned];method='crew_safe_return';break;
    case 'blackbird_prize': tests=[e.scanned,e.piloted||part('unique_blackbird_governor')];method=e.piloted?'prototype_piloted':'prototype_governor_recovered';break;
    case 'cold_controller': tests=[e.action('shutdown'),part('mod_cargo_scanner_s')||e.returned];method=e.returned?'isolated_frame_return':'isolated_controller_extracted';break;
    case 'warrant_return': tests=[e.scanned,e.safe,e.returned&&e.v.location.stationId===e.row?.stationId];method='frame_specific_writ_return';break;
    case 'claim_resolution': tests=[e.scanned,e.returned||e.v.title==='clean'&&(e.action('register')||e.action('settle_title'))||e.sold||e.v.signature?.forged&&e.f.lowAccepted];method=e.returned?'claimant_restitution':e.sold?'fence_affiliate':e.v.title==='clean'?e.action('settle_title')?'compensated_owner':'registered_salvager':'unresolved_copied_identity';break;
    case 'forensic_survey': tests=[e.scanned,e.f.highInspected];method='physical_signature_verified';break;
    case 'cold_restart': tests=[!!e.owned||e.piloted,e.f.driveRepaired||e.yards.some(r=>r.action==='repair_module'&&r.subsystemId==='subsystem_drive')];method='drive_restoration';break;
    case 'component_bounty': tests=[e.scanned,part(params.componentDefId || targetComponent(e))];method='specific_part_extraction';break;
    case 'hot_fence_run': tests=[!!e.v.incidentId||e.v.signature?.broadcastFlagged===true,e.illicitSold];method='reported_hull_fenced';break;
    case 'fleet_retrieval': tests=[e.recovered];method='paid_physical_retrieval';break;
    case 'broadcast_trial': tests=[e.v.signature?.forged===true,e.f.lowAccepted,e.f.highRejected];method='layered_identity_trial';break;
    default:return {done:false,progress:0,next:'This job pattern is unavailable.'};
  }
  const def=PATTERNS.get(pattern),count=tests.filter(Boolean).length,index=tests.findIndex(t=>!t);
  const done=count===tests.length;
  let failed=null;
  if(!done&&e.v.location.kind==='destroyed')failed='target_lost';
  if(!done&&e.v.location.kind==='sold')failed=pattern==='hot_fence_run'?'wrong_receiver':'property_sold';
  if(!done&&e.returned)failed='recovery_terms_unmet';
  return {done,failed,progress:count/tests.length,method,next:done?'Employer terms satisfied.':def.steps[index] || def.steps.at(-1),stages:def.steps.map((text,i)=>({text,done:!!tests[i]}))};
}
function eligible(e,p) {
  if(e.f.finished?.includes(p))return false;
  if(terminal(e.v)&&!projection(e,p).done)return false;
  const primary=PRIMARY[e.row?.id];
  if(p===primary)return !terminal(e.v)||projection(e,p).done;
  if(p==='claim_resolution'&&e.v.title==='salvage')return true;
  if(p==='forensic_survey')return e.scanned&&(e.v.custodian==='player'||e.f.highInspected);
  if(p==='cold_restart')return projection(e,p).done||!!e.owned&&Object.entries(e.owned.fittedInstances||{}).some(([slot,m])=>e.owned.fittings?.[slot]===m?.defId&&componentDefinition(m.defId)?.slotType==='engine'&&componentCondition(m.condition)<1);
  if(p==='component_bounty')return e.v.originalOwner!=='player'&&!!targetComponent(e)&&(!terminal(e.v)||projection(e,p).done);
  if(p==='hot_fence_run')return e.v.title==='disputed'&&(!!e.v.incidentId||e.v.signature?.broadcastFlagged)&&(!terminal(e.v)||e.sold);
  if(p==='fleet_retrieval')return e.v.custodian==='player'&&(['field','remote','tow'].includes(e.v.location.kind)||e.recovered);
  if(p==='broadcast_trial')return e.v.title==='disputed'&&(e.v.custodian==='player'||e.v.signature?.forged);
  return false;
}
function buildOffer(state,e,p) {
  const pattern=PATTERNS.get(p),id=offerId(e.v.vesselId,p);
  const special=p==='hot_fence_run'||p==='broadcast_trial'||p==='component_bounty'&&e.v.title!=='salvage';
  const stationId=special?'station_smuggler':p==='forensic_survey'?'station_customs':e.row?.stationId || (state.ui?.docked?state.ui.dockedStationId:'station_helios');
  const station=STATIONS.get(stationId);if(!station)return null;
  const componentDefId=targetComponent(e),component=componentDefinition(componentDefId);
  const brief=pattern.steps.join(' → ')+(p==='component_bounty'?` (${component?.name || 'verified fitted part'}; minimum condition 25%).`:'.');
  return {id,type:'vessel_recovery',source:'blackFlag',sourceRef:e.row?.id || e.v.origin,
    stationId,destStationId:stationId,destSectorId:station.sectorId,factionId:station.factionId,
    title:`${e.v.name} — ${pattern.name}`,brief,summary:brief,
    description:`${brief} Employer wage: ${pattern.wage} cr, once for this vessel and these terms. Yard property prices are separate. This contract grants no authority against other ships.`,
    params:{vesselId:e.v.vesselId,encounterId:e.row?.id || null,blackFlagPattern:p,componentDefId,physicalVerb:p==='component_bounty'?'extract':p==='forensic_survey'?'inspect':'recover',nextAction:pattern.steps[0],jobWageOnly:true},
    cause:{tag:'black_flag_job',fingerprint:id},reward_cr:pattern.wage,collateral_cr:0,riskTier:e.row?.act>1?2:0,duration_s:0,distance:500};
}
export function blackFlagOffers(state,payload={}) {
  if(!isBlackFlagAdventure(state))return [];
  const ids=payload.vesselId?[payload.vesselId]:Object.keys(peekShipjack(state)?.vesselsById || {}).slice(0,LIMIT);
  const offers=[];
  for(const id of ids){const e=entry(state,id);if(!e)continue;
    const primary=PRIMARY[e.row?.id],order=[primary,...PATTERNS.keys()].filter((p,i,a)=>p&&a.indexOf(p)===i);
    for(const p of order)if(eligible(e,p)){const offer=buildOffer(state,e,p);if(offer)offers.push(offer);}
  }
  return offers;
}
export function blackFlagOffer(state,payload={}){return blackFlagOffers(state,payload)[0] || null;}

export function installBlackFlagMissions(host){
  for(const off of host._blackFlagMissionOffs || [])off();host._blackFlagMissionOffs=[];
  const settling=new Set();
  const on=(event,fn)=>{const off=host.bus.on(event,fn);host._blackFlagMissionOffs.push(typeof off==='function'?off:()=>host.bus.off(event,fn));};
  const retire=m=>{const f=facts(host.state,m.params?.vesselId,true),p=m.params?.blackFlagPattern || PRIMARY[m.params?.encounterId];if(f&&p&&!f.finished.includes(p))f.finished.push(p);};
  const refresh=()=>{
    const state=host.state;if(!isBlackFlagAdventure(state))return;
    for(const board of Object.values(state.missions?.boards || {}))if(Array.isArray(board.slots))board.slots=board.slots.filter(o=>{
      if(o.source!=='blackFlag')return true;
      const e=entry(state,o.params?.vesselId),p=o.params?.blackFlagPattern || PRIMARY[o.params?.encounterId];
      return !!e&&eligible(e,p);
    });
    const counts=new Map();
    for(const board of Object.values(state.missions?.boards || {}))for(const o of board.slots || [])if(o.source==='blackFlag')counts.set(o.stationId,(counts.get(o.stationId)||0)+1);
    for(const m of state.missions?.active || [])if(m.source==='blackFlag'&&m.status==='active')counts.set(m.stationId,(counts.get(m.stationId)||0)+1);
    for(const offer of blackFlagOffers(state)){
      if((counts.get(offer.stationId)||0)>=2)continue;
      if(host._onExternalBoardOffer(offer))counts.set(offer.stationId,(counts.get(offer.stationId)||0)+1);
    }
  };
  const reconcile=()=>{
    if(!isBlackFlagAdventure(host.state))return;
    for(const m of [...(host.state.missions?.active || [])]){
      if(m.source!=='blackFlag'||m.status!=='active'||settling.has(m.id))continue;
      const e=entry(host.state,m.params?.vesselId),i=host.state.missions.active.indexOf(m);
      if(!e){host._failMission(m,i,'target_unavailable');continue;}
      const p=m.params.blackFlagPattern || PRIMARY[m.params.encounterId],result=projection(e,p,m.params);
      m.params.blackFlagPattern=p;m.params.nextAction=result.next;m.params.blackFlagStages=result.stages;
      m.brief=result.next;m.objectiveProgress=result.progress*(m.objectiveTarget || 1);
      if(result.done||result.failed){settling.add(m.id);try{
        if(result.done){m.params.completionMethod=result.method;host._completeMission(m,i);}
        else{m.params.failureOpportunity='The physical parts, last trajectory and unresolved claims remain available through the registry.';host._failMission(m,i,result.failed);}
        if(m.status!=='active')retire(m);
      }finally{settling.delete(m.id);}}
      else host.bus.emit('mission:updated',{missionId:m.id,nextAction:result.next});
    }
    refresh();
  };
  const observeAction=p=>{
    if(!isBlackFlagAdventure(host.state)||!p?.vesselId||!ACTIONS.has(p.action)||p.action==='piloted'||p.action==='transfer')return;
    const f=facts(host.state,p.vesselId,true);if(!f)return;
    f.actions[p.action]=true;reconcile();
  };
  on('shipjack:actionCommitted',observeAction);
  on('ship:controlTransferred',p=>{
    if(!isBlackFlagAdventure(host.state)||!p?.ok)return;
    const canonical=host.state.player.shipControlTransfers?.receipts?.some(r=>r.operationId===p.operationId&&r.vesselId===p.vesselId&&r.ok);
    if(canonical){const f=facts(host.state,p.vesselId,true);if(f)f.actions.piloted=true;reconcile();}
  });
  on('shipjack:inspection',p=>{
    if(!isBlackFlagAdventure(host.state)||!p||!Number.isInteger(p.grade)||p.grade<1||p.grade>3||typeof p.accepted!=='boolean')return;
    const f=facts(host.state,p.vesselId,true);if(!f)return;
    const forged=peekShipjack(host.state)?.vesselsById[p.vesselId]?.signature?.forged===true;
    if(p.grade===1&&p.accepted&&forged)f.lowAccepted=true;
    if(p.grade===3){f.highInspected=true;if(!p.accepted&&forged)f.highRejected=true;}
    reconcile();
  });
  on('shipjack:settled',p=>{
    if(!isBlackFlagAdventure(host.state)||!p?.ok)return;
    const real=peekShipjack(host.state)?.yardReceipts?.some(r=>r.operationId===p.operationId&&r.vesselId===p.vesselId&&r.ok&&r.action===p.action);
    if(!real)return;
    const f=facts(host.state,p.vesselId,true);if(!f)return;
    f.actions[p.action]=true;
    if(p.action==='repair_module'&&p.subsystemId==='subsystem_drive')f.driveRepaired=true;
    if(p.action==='extract'&&p.instanceId&&!f.extracted.some(m=>m.instanceId===p.instanceId)){
      const item=host.state.player.moduleInventory?.find(m=>m.instanceId===p.instanceId);
      if(item&&item.defId===p.defId&&f.extracted.length<8)f.extracted.push({defId:item.defId,instanceId:item.instanceId,condition:componentCondition(item.condition)});
    }
    reconcile();
  });
  on('shipjack:opportunity',refresh);
  on('shipjack:fleetReceipt',reconcile);
  on('shipjack:destroyed',reconcile);
  on('dock:docked',reconcile);
  on('save:loaded',()=>{const normalized=normalizeBlackFlagJobs(host.state.missions?.blackFlagJobs);if(normalized)host.state.missions.blackFlagJobs=normalized;reconcile();});
  on('mission:accepted',reconcile);
  for(const name of ['mission:completed','mission:failed','mission:expired'])on(name,p=>{
    const m=host.state.missions?.active?.find(m=>m.id===p?.missionId&&m.source==='blackFlag');if(m)retire(m);
  });
  host._reconcileBlackFlagJobs=reconcile;
}
