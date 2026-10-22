import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { admitVessel, ensureShipjack } from '../src/shipjack/model.js';
import { BLACK_FLAG_ENCOUNTER_BY_ID } from '../src/data/blackFlag.js';
import { blackFlagOffers, blackFlagOffer, normalizeBlackFlagJobs } from '../src/missions/blackFlagMissions.js';

function boot(encounterId='black_flag_empty_seat') {
  const state=createGameState(4242),bus=createBus();
  state.mode='flight';state.onboarding={active:false,finished:true};
  state.player.credits=1000;state.player.ownedShips=[{defId:'ship_kestrel',fittings:[]}];state.player.activeShipIndex=0;
  const row=BLACK_FLAG_ENCOUNTER_BY_ID.get(encounterId);
  state.ui.docked=true;state.ui.dockedStationId=row.stationId;state.world.currentSectorId=row.sectorId;
  const body=makeEntity({...makeShipEntitySpec(row.defId,{fittings:fittingsFromDefaultModules(row.defId,row.fitted),team:2,pos:{x:140,z:40}}),id:2});
  state.entities.set(body.id,body);state.entityList.push(body);
  const vessel=admitVessel(state,body,{origin:row.id,name:row.name,ownerId:row.ownerId,profile:row.profile.includes('pirate')?'pirate':'civilian',legalCategory:row.legalCategory==='salvage'?'unregistered':row.legalCategory});
  vessel.condition.hull=row.condition;
  const sj=ensureShipjack(state);sj.encounters[row.id]={admitted:true,vesselId:vessel.vesselId};
  const host=Object.create(missionsProto),economy=Object.create(economyProto);
  const registry={get:name=>name==='missions'?host:name==='economy'?economy:null};
  const ctx={state,bus,registry,helpers:{getEntity:id=>state.entities.get(id)}};
  economy.init(ctx);host.init(ctx);
  let seq=0;
  const completed=[];bus.on('mission:completed',p=>completed.push(p));
  const action=a=>bus.emit('shipjack:actionCommitted',{vesselId:vessel.vesselId,action:a,operationId:`action:${++seq}`});
  const settle=(a,extra={})=>{
    const receipt={ok:true,action:a,vesselId:vessel.vesselId,operationId:`yard:${++seq}`,stationId:row.stationId,...extra};
    sj.yardReceipts ||= [];sj.yardReceipts.push(receipt);bus.emit('shipjack:settled',receipt);return receipt;
  };
  const accept=pattern=>{
    const offer=blackFlagOffers(state,{vesselId:vessel.vesselId}).find(o=>o.params.blackFlagPattern===pattern);
    assert.ok(offer,`live state can commission ${pattern}`);
    host._onExternalBoardOffer(offer);
    const before=new Set(state.missions.active.map(m=>m.id));
    assert.equal(host.acceptMission(offer.id),true,`${pattern} enters the real mission owner`);
    return state.missions.active.find(m=>!before.has(m.id)) || state.missions.completedLog.at(-1);
  };
  const scan=()=>{sj.custodyAttempts[vessel.vesselId]={scanned:true,phase:'probed'};action('scan');};
  const owned=()=>{
    vessel.custodian='player';
    const record={vesselId:vessel.vesselId,defId:row.defId,fittings:[...body.data.fittings],fittedInstances:{}};
    state.player.ownedShips.push(record);return record;
  };
  const returned=()=>{vessel.claimResolved=true;vessel.title='returned';vessel.location.kind='returned';vessel.location.stationId=row.stationId;settle('return');};
  const extracted=(defId,condition=0.7)=>{
    const item={instanceId:`mi_extracted_${++seq}`,defId,condition,provenance:{sourceVesselId:vessel.vesselId}};
    state.player.moduleInventory.push(item);settle('extract',{defId,instanceId:item.instanceId});
  };
  return {state,bus,host,row,vessel,sj,body,completed,action,settle,accept,scan,owned,returned,extracted};
}

test('Empty Seat pays an employer wage through missions once, separately from property settlement',()=>{
  const b=boot(),m=b.accept('intact_return');b.scan();
  assert.equal(b.state.player.credits,1000);
  b.returned();assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1300);
  assert.equal(b.completed[0].completionMethod,'intact_claimant_return');
  b.bus.emit('shipjack:settled',b.sj.yardReceipts.at(-1));b.bus.emit('shipjack:opportunity',{vesselId:b.vessel.vesselId,encounterId:b.row.id});
  assert.equal(b.state.player.credits,1300);assert.equal(b.completed.length,1);
  assert.ok(!blackFlagOffers(b.state).some(o=>o.params.blackFlagPattern==='intact_return'));
});

test('stripping a claimant hull before return fails the intact wage while retaining the recovered component',()=>{
  const b=boot(),m=b.accept('intact_return');b.scan();b.extracted('mod_engine_ion_m');b.returned();
  assert.equal(m.status,'failed');assert.equal(b.state.player.credits,1000);
  assert.equal(b.state.player.moduleInventory[0].defId,'mod_engine_ion_m');
  assert.match(m.params.failureOpportunity,/physical parts/);
});

test('Blackbird transfer-start is not control; a committed physical handoff satisfies its own endpoint',()=>{
  const b=boot('black_flag_blackbird'),m=b.accept('blackbird_prize');b.scan();b.action('transfer');
  assert.equal(m.status,'active');assert.equal(b.state.player.credits,1000);
  const receipt={ok:true,vesselId:b.vessel.vesselId,operationId:'physical:transfer:1'};
  b.state.player.shipControlTransfers={version:1,receipts:[receipt]};b.bus.emit('ship:controlTransferred',receipt);
  assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1600);
  assert.equal(b.completed[0].completionMethod,'prototype_piloted');
});

test('Blackbird unique governor is an alternate physical prize; unrelated equipment never satisfies it',()=>{
  const b=boot('black_flag_blackbird'),m=b.accept('blackbird_prize');b.scan();b.extracted('mod_cargo_scanner_s');
  assert.equal(m.status,'active');b.extracted('unique_blackbird_governor',0.8);
  assert.equal(m.status,'completed');assert.equal(b.completed[0].completionMethod,'prototype_governor_recovered');
});

test('Second Measure crew terms must be honored before its return wage can settle',()=>{
  const b=boot('black_flag_second_measure'),m=b.accept('crew_return');b.returned();
  assert.equal(m.status,'failed');assert.equal(b.state.player.credits,1000);
  const c=boot('black_flag_second_measure'),n=c.accept('crew_return');
  c.vessel.crewSafe=true;c.action('hail');c.returned();
  assert.equal(n.status,'completed');assert.equal(c.state.player.credits,1450);
});

test('Cold Logic needs safe shutdown and an actual recoverable controller, in either action order',()=>{
  const b=boot('black_flag_cold_logic'),m=b.accept('cold_controller');
  b.extracted('mod_cargo_scanner_s',0.7);assert.equal(m.status,'active');
  b.action('shutdown');assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1400);
  assert.equal(b.completed[0].completionMethod,'isolated_controller_extracted');
});

test('the exact Writ frame and named receiver matter; another ship receipt cannot settle it',()=>{
  const b=boot('black_flag_writ_of_return'),m=b.accept('warrant_return');b.scan();b.vessel.crewSafe=true;
  b.bus.emit('shipjack:settled',{ok:true,vesselId:'vessel:unrelated',action:'return',operationId:'wrong:frame'});
  assert.equal(m.status,'active');b.returned();assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1500);
  assert.match(blackFlagOffer(boot('black_flag_writ_of_return').state).description,/no authority against other ships/);
});

test('Claim War copied-papers outcome remains disputed and requires a real low-grade inspection',()=>{
  const b=boot('black_flag_claim_war'),m=b.accept('claim_resolution');b.scan();b.owned();
  b.vessel.signature.forged=true;b.settle('forge_broadcast');assert.equal(m.status,'active');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:1,accepted:true});
  assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1400);assert.equal(b.vessel.title,'disputed');
  assert.equal(b.completed[0].completionMethod,'unresolved_copied_identity');
});

test('forensic survey requires grade-three scrutiny, not a broadcast-only pass',()=>{
  const b=boot();b.scan();b.owned();const m=b.accept('forensic_survey');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:1,accepted:true});assert.equal(m.status,'active');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:3,accepted:false});
  assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1200);
});

test('drive restoration contract cannot be satisfied by repairing an unrelated weapon',()=>{
  const b=boot(),owned=b.owned(),slot=owned.fittings.findIndex(id=>id==='mod_engine_ion_m');
  assert.ok(slot>=0);owned.fittedInstances={[slot]:{defId:'mod_engine_ion_m',instanceId:'mi_broken',condition:0.2}};
  const m=b.accept('cold_restart');b.settle('repair_module',{subsystemId:'subsystem_weapon'});assert.equal(m.status,'active');
  b.settle('repair_module',{subsystemId:'subsystem_drive'});assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1250);
});

test('component bounty accepts only its exact fitted part at recoverable condition',()=>{
  const b=boot(),m=b.accept('component_bounty');b.scan();
  assert.equal(m.params.componentDefId,'mod_engine_ion_m');
  b.extracted('mod_cargo_scanner_s',1);assert.equal(m.status,'active');
  b.extracted('mod_engine_ion_m',0.1);assert.equal(m.status,'active');
  b.extracted('mod_engine_ion_m',0.6);assert.equal(m.status,'completed');
});

test('hot-property wage requires an actual illicit buyer, while clean registry sale is a different outcome',()=>{
  const b=boot('black_flag_blackbird');b.owned();b.vessel.incidentId='incident:known';b.vessel.signature.broadcastFlagged=true;
  const m=b.accept('hot_fence_run');b.vessel.location.kind='sold';b.vessel.title='clean';b.settle('sell',{stationId:'station_helios'});
  assert.equal(m.status,'failed');assert.equal(b.state.player.credits,1000);
  const c=boot('black_flag_blackbird');c.owned();c.vessel.incidentId='incident:fence';c.vessel.signature.broadcastFlagged=true;
  const n=c.accept('hot_fence_run');c.vessel.location.kind='sold';c.settle('sell',{stationId:'station_smuggler'});
  assert.equal(n.status,'completed');assert.equal(c.state.player.credits,1300);
});

test('fleet retrieval job recognizes arrival, never a paid booking or departure',()=>{
  const b=boot();b.owned();const m=b.accept('fleet_retrieval');
  b.sj.fleetReceipts=[{ok:true,vesselId:b.vessel.vesselId,status:'queued',operationId:'fleet:1'}];b.bus.emit('shipjack:fleetReceipt',b.sj.fleetReceipts[0]);
  assert.equal(m.status,'active');b.sj.fleetReceipts[0].status='arrived';b.vessel.location.kind='berth';
  b.bus.emit('shipjack:fleetReceipt',b.sj.fleetReceipts[0]);assert.equal(m.status,'completed');assert.equal(b.state.player.credits,1150);
});

test('copied serial trial cannot reuse inspections made before the forgery existed',()=>{
  const b=boot('black_flag_blackbird');b.owned();const m=b.accept('broadcast_trial');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:1,accepted:true});
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:3,accepted:false});
  b.vessel.signature.forged=true;b.settle('forge_broadcast');assert.equal(m.status,'active');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:1,accepted:true});assert.equal(m.status,'active');
  b.bus.emit('shipjack:inspection',{vesselId:b.vessel.vesselId,grade:3,accepted:false});assert.equal(m.status,'completed');
});

test('out-of-order capture and completed-job tombstones survive the real missions save envelope',()=>{
  const b=boot('black_flag_blackbird');b.scan();
  b.state.player.shipControlTransfers={version:1,receipts:[{ok:true,vesselId:b.vessel.vesselId,operationId:'before:contract'}]};
  b.accept('blackbird_prize');assert.equal(b.completed.length,1);assert.equal(b.state.player.credits,1600);
  const data=JSON.parse(JSON.stringify(b.host.serialize()));assert.ok(data.blackFlagJobs);
  b.host.deserialize(data);b.bus.emit('save:loaded',{});
  assert.ok(!blackFlagOffers(b.state).some(o=>o.params.blackFlagPattern==='blackbird_prize'));
  assert.equal(b.state.player.credits,1600);
});

test('abandonment and destroyed target retire the exact job while other concrete salvage options remain',()=>{
  const b=boot(),m=b.accept('intact_return');b.host.abandonMission(m.id);
  b.bus.emit('shipjack:opportunity',{vesselId:b.vessel.vesselId});
  assert.ok(!blackFlagOffers(b.state).some(o=>o.params.blackFlagPattern==='intact_return'));
  assert.ok(blackFlagOffers(b.state).some(o=>o.params.blackFlagPattern==='component_bounty'));
  const c=boot('black_flag_blackbird'),n=c.accept('blackbird_prize');c.vessel.location.kind='destroyed';
  c.bus.emit('shipjack:destroyed',{vesselId:c.vessel.vesselId});assert.equal(n.status,'failed');assert.equal(c.state.player.credits,1000);
});

test('normal opportunity refresh caps Black Flag board clutter at two rows per station',()=>{
  const b=boot();b.scan();b.owned();
  for(let i=0;i<20;i++)b.bus.emit('shipjack:opportunity',{vesselId:b.vessel.vesselId,encounterId:b.row.id});
  for(const board of Object.values(b.state.missions.boards))assert.ok(board.slots.filter(o=>o.source==='blackFlag').length<=2);
});

test('bounded observation records reject malformed arrays and temporary modes produce no mission facts',()=>{
  const raw={version:1,byVessel:{}};
  for(let i=0;i<10000;i++)raw.byVessel[`vessel:old:${i}`]={actions:{scan:true,imaginary:true},extracted:Array(100).fill({defId:'bad'}),finished:['bad','intact_return','intact_return']};
  const normalized=normalizeBlackFlagJobs(raw);assert.equal(Object.keys(normalized.byVessel).length,96);
  assert.deepEqual(Object.values(normalized.byVessel)[0].finished,['intact_return']);
  const b=boot(),before=JSON.stringify(b.state.missions);b.state.run.kind='survival';b.state.run.phase='active';
  b.action('shutdown');b.bus.emit('shipjack:opportunity',{vesselId:b.vessel.vesselId});
  assert.equal(JSON.stringify(b.state.missions),before);
});
