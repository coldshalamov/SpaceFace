import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { automation } from '../src/systems/automation.js';
import { economy } from '../src/systems/economy.js';
import { missions } from '../src/systems/missions.js';
import { story } from '../src/systems/story.js';
import { automationNextAction, automationScreen, describeAutomationPurchase } from '../src/ui/screens/automationPanel.js';
import { storyActionForBeat } from '../src/ui/screens/missionLog.js';
import { TRADERS } from '../src/data/automation.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { seedCharterOffer, seedCharterPaidReceipt, seedCharterRecord, normalizeSeedCharter, seedRemittanceComparison } from '../src/missions/empireSeedCharter.js';

// Explicit owner fixture: earned B5 flags and a stopped berth, not flight evidence.
function harness() {
  const state = createGameState(0x47a6), bus = createBus(), events = [];
  state.mode='flight'; state.simTime=60; state.playerId=1;
  state.settings.gameplay.tutorialHints=false; state.onboarding={active:false,finished:true};
  const player={id:1,type:'ship',alive:true,pos:{x:0,z:0},vel:{x:0,z:0},radius:8};
  const berth={id:2,type:'station',alive:true,pos:{x:0,z:0},radius:80,data:{stationId:'station_beltout'}};
  state.entities.set(1,player); state.entities.set(2,berth); state.entityList=[player,berth]; state.entityIndex={stations:[berth]};
  const registry={get:name=>name==='economy'?e:null}, helpers={voice:{say:()=>true}};
  const e={...economy};e.init({state,bus,helpers,registry});e.newGame();
  const m={...missions};m.init({state,bus,helpers,registry});m.newGame();
  state.missions.active=[];state.story.beatIndex=6;state.story.branch='patrol';
  state.story.flags={elroy_outcome:'custody',beat_5_done:true,proving_ground_complete:true,
    weighing_receipt:{outcome:'cleared_unverified'}};m._syncCampaignSidecarAfterAdvance();
  state.player.credits=27007;state.player.researchPoints=12;state.player.researchedNodes=[];
  state.player.ownedShips=[{defId:'ship_kestrel',fittings:[]}];state.player.activeShipIndex=0;
  state.world.currentSectorId='sector_ceres_belt';state.ui.docked=true;state.ui.dockedStationId='station_beltout';
  const a={...automation};a.init({state,bus,helpers,registry});
  const st={...story,state,bus,_fireComms(row){events.push({name:'comms:popup',payload:row});}};
  bus.on('asset:deployed',()=>st._armValeRemittanceWatch());
  bus.on('economy:grantCredits',p=>st._onAutomationRemittance(p));
  bus.on('automation:traderCycleCompleted',p=>st._onSeedCharterRemittance(p));
  for(const name of ['asset:deployed','economy:chargeCredits','economy:grantCredits','automation:traderCycleCompleted'])bus.on(name,p=>events.push({name,payload:structuredClone(p)}));
  return {state,bus,a,e,m,st,events,player,berth};
}
function commission(h){const view=automationNextAction(h.state);assert.equal(view.action,'commissionSeedCharter');automationScreen._onAction.call({_ctx:{state:h.state,bus:h.bus},refresh(){}},view.action,view.targetRef,view.kind);return h.state.automation.traders[0];}
function observation(captain,missionId,markerId){return {version:1,captainId:captain,missionId,markerId,storyTag:'campaign47a:b5:patrol:'+(captain==='cap_sable_iask'?1:2),owner:'VALE HOLDINGS LLC',cargo:'ADMINISTRATIVE RECORDS — 3 YEARS / SEALED',sectorId:'sector_charon_expanse',observedAt:30};}

test('earned Book 6 routes to Belt Outpost and ordinary fleet research stays locked',()=>{
 const h=harness();h.state.ui.docked=false;
 const next=automationNextAction(h.state);assert.equal(next.action,'openSeedCharterRoute');assert.match(next.body,/9,000 cr once, 18 cr\/min/);
 const journal=storyActionForBeat({beat:6},h.state);assert.equal(journal.mapAction.stationId,'station_beltout');assert.match(journal.body,/buying the charter is not income/);
 assert.equal(describeAutomationPurchase('trader',TRADERS[0],h.state).disabled,true);
 assert.equal(h.a.hireTrader('trader_hauler_l'),false);assert.equal(h.state.player.credits,27007);
});

test('real UI order charges once, advances through missions, and grants no technology or remittance',()=>{
 const h=harness();const t=commission(h);assert.ok(t);assert.equal(h.state.player.credits,21007);
 assert.equal(h.state.story.beatIndex,7);assert.equal(h.state.story.flags.empire_seed_asset_id,t.id);assert.equal(h.state.story.flags.empire_seed_variant,'trader');
 assert.deepEqual(h.state.player.researchedNodes,[]);assert.equal(h.state.player.researchPoints,12);
 assert.equal(h.state.automation.meta.seedCharter.costCr,9000);assert.equal(h.state.story.flags.seed_charter_remittance,undefined);
 assert.equal(h.state.story.flags.vale_remittance_noted,undefined);assert.equal(h.a.commissionSeedCharter(),false);
 assert.equal(h.a.hireTrader('trader_hauler_l'),false);assert.equal(h.state.automation.traders.length,1);
 assert.equal(h.events.filter(x=>x.name==='asset:deployed').length,1);
 assert.equal(h.events.filter(x=>x.name==='economy:grantCredits'&&x.payload.amount===3000).length,1);
 assert.match(seedCharterRecord(h.state).body,/first paid cycle is still pending/);
});

test('admission fails before payment for early, absent, false, remote and unaffordable berths',()=>{
 for(const change of [h=>h.state.story.beatIndex=5,h=>delete h.state.story.flags.beat_5_done,h=>h.state.ui.docked=false,
 h=>h.state.ui.dockedStationId='station_ceres',h=>h.state.world.currentSectorId='sector_charon_expanse',h=>h.player.pos.x=10000,
 h=>h.state.player.credits=8999,h=>h.state.automation.meta.seedCharter={broken:true},h=>h.state.automation.traders.push({id:99,defId:'trader_hauler_l'})]){
  const h=harness();change(h);const before=h.state.player.credits;assert.equal(h.a.commissionSeedCharter(),false);assert.equal(h.state.player.credits,before);assert.equal(h.events.filter(x=>x.name==='asset:deployed').length,0);
 }
});

test('nested click during economy charge cannot issue a second charter',()=>{
 const h=harness();let repeated=null;
 h.bus.on('economy:chargeCredits',p=>{if(p.reason.includes('seed_charter'))repeated=h.a.commissionSeedCharter();});
 commission(h);assert.equal(repeated,false);assert.equal(h.state.automation.traders.length,1);assert.equal(h.state.player.credits,21007);
});

test('spent charter and normal trader round-trip without reissue, including dismissal and damaged old records',()=>{
 const h=harness();const t=commission(h);const saved=JSON.parse(JSON.stringify(h.a.serialize()));h.a.deserialize(saved);
 assert.equal(h.state.automation.traders[0].id,t.id);assert.deepEqual(h.state.automation.meta.seedCharter,saved.meta.seedCharter);
 h.a.dismissTrader(t.id);h.state.story.beatIndex=6;delete h.state.story.flags.empire_seed_complete;
 assert.equal(seedCharterOffer(h.state),null);assert.equal(h.a.commissionSeedCharter(),false);assert.match(seedCharterRecord(h.state).body,/no longer on your books/);
 h.state.automation.meta.seedCharter={bad:true};const broken=h.a.serialize();assert.deepEqual(broken.meta.seedCharter,{spent:true});h.a.deserialize(broken);assert.equal(seedCharterOffer(h.state),null);
 assert.equal(normalizeSeedCharter({version:1,assetId:'<bad>'}),null);
});

test('only this trader’s real positive wallet receipt can write the one-time clearing annotation',()=>{
 const h=harness();const t=commission(h);const original=h.state.player.credits;
 h.st._onAutomationRemittance({reason:'automation:trader',amount:0});h.st._onAutomationRemittance({reason:'automation:trader',amount:99});
 assert.equal(h.state.story.flags.seed_charter_remittance,undefined);assert.equal(h.state.story.flags.vale_remittance_noted,undefined);
 const receipt={n:1,from:'station_ceres',to:'station_tethys',good:'cmdty_ore_iron',result:'paid',credited:75};
 t.cycles=1;t.lastReceipt=receipt;
 for(const bad of [{...receipt,credited:0},{...receipt,result:'capped'},{...receipt,n:2}])assert.equal(seedCharterPaidReceipt(h.state,{kind:'trader',id:t.id,defId:t.defId,receipt:bad}),null);
 assert.equal(seedCharterPaidReceipt(h.state,{kind:'trader',id:'other',defId:t.defId,receipt}),null);
 const event={kind:'trader',id:t.id,defId:t.defId,receipt:{...receipt}};h.st._onSeedCharterRemittance(event);h.st._onSeedCharterRemittance(event);
 assert.equal(h.state.story.transactionLog.length,1);assert.equal(h.events.filter(x=>x.name==='comms:popup').length,1);assert.equal(h.state.player.credits,original,'annotation is not a payer');
 assert.equal(h.state.story.flags.seed_charter_remittance.amount,75);assert.match(seedCharterRecord(h.state).body,/75 cr reached your wallet/);
});

test('ordinary trader cycle uses actual economy, upkeep, market pressure and cap before story reads it',()=>{
 const h=harness();const t=commission(h);h.a._capBudget=100; // explicit cap fixture; no clock/flight claim
 const quote=h.a._traderCycleQuote(t,TRADERS[0]);assert.ok(quote.profit>0);
 const upkeepBefore=h.state.player.credits;h.a._drainUpkeep(60,h.state.automation);assert.equal(upkeepBefore-h.state.player.credits,18);
 const before=h.state.player.credits;h.a._completeTraderCycle(t,TRADERS[0],h.state.automation,0);
 const cycle=h.events.find(x=>x.name==='automation:traderCycleCompleted');assert.ok(cycle);assert.equal(cycle.payload.receipt.result,'paid');
 assert.equal(h.state.player.credits-before,cycle.payload.receipt.credited);assert.ok(cycle.payload.receipt.credited<=100);
 assert.equal(h.state.story.flags.seed_charter_remittance.amount,cycle.payload.receipt.credited);
 assert.equal(h.state.story.flags.weighing_receipt.outcome,'cleared_unverified');assert.equal(h.state.story.flags.helix_unmasked,undefined);
});

test('capped receipts remain pending and later positive receipt can speak',()=>{
 const h=harness();const t=commission(h);h.a._capBudget=0;h.a._completeTraderCycle(t,TRADERS[0],h.state.automation,0);
 assert.equal(t.lastReceipt.credited,0);assert.equal(h.state.story.flags.seed_charter_remittance,undefined);
 assert.match(seedCharterRecord(h.state).body,/still pending/);
 h.a.reroute(t.id);h.a._capBudget=100;h.a._completeTraderCycle(t,TRADERS[0],h.state.automation,0);
 assert.ok(t.lastReceipt.credited>0);assert.equal(h.state.story.flags.seed_charter_remittance.cycle,2);
 assert.equal(h.events.filter(x=>x.name==='comms:popup').length,1);
});

test('comparison uses independently observed labels, never missing, duplicate or sealed contents',()=>{
 const h=harness();assert.doesNotMatch(seedRemittanceComparison(h.state),/wreck labels/);
 h.state.aftermathWrecks={patrolObservations:{cap_sable_iask:observation('cap_sable_iask','m_14','a')}};
 assert.match(seedRemittanceComparison(h.state),/wreck label you read/);
 h.state.aftermathWrecks.patrolObservations.cap_redcut_sorrel=observation('cap_redcut_sorrel','m_15','b');assert.match(seedRemittanceComparison(h.state),/Both wreck labels/);
 h.state.aftermathWrecks.patrolObservations.cap_redcut_sorrel.markerId='a';assert.doesNotMatch(seedRemittanceComparison(h.state),/Both wreck labels/);
});

test('paid clearing record stays on the real Traders surface after the asset is dismissed',()=>{
 const h=harness();const t=commission(h);t.cycles=1;t.lastReceipt={n:1,from:'station_ceres',to:'station_tethys',good:'cmdty_ore_iron',result:'paid',credited:75};
 h.st._onSeedCharterRemittance({kind:'trader',id:t.id,defId:t.defId,receipt:{...t.lastReceipt}});h.a.dismissTrader(t.id);
 const old=globalThis.document;globalThis.document=fakeDom();
 try {const frag=document.createElement('div');const view=Object.assign({},automationScreen,{_ctx:{state:h.state}});view._renderTraders(frag);
 const text=frag.children.map(x=>x.textContent||x.innerHTML||'').join(' ');assert.match(text,/First remittance/);assert.match(text,/VALE HOLDINGS LLC/);assert.match(text,/no longer on your books/);assert.match(text,/Autonomous Fleets/);
 } finally {globalThis.document=old;}
});


test('route selection prices the full shipment and fuel, not the largest isolated spread',()=>{
 const h=harness();const calls=[];
 h.a._economy=()=>({getMarket(){},priceOf(id,good,side){return side==='buy'&&['station_rhea_cinder','station_coalition'].includes(id)?1:side==='sell'&&id==='station_helios'?1:0;}});
 h.a._stationPrice=(id,good,side,qty)=>{calls.push({id,good,side,qty});
   if(side==='buy')return id==='station_rhea_cinder'?1:id==='station_coalition'?10:0;
   return id==='station_helios'?20:0;
 };
 const def=TRADERS[0], route=h.a._pickRoute(null,def);
 assert.equal(route.from,'station_coalition');assert.equal(route.to,'station_helios');
 const distant={from:'station_rhea_cinder',to:'station_helios',good:route.good};
 assert.equal(h.a._traderCycleQuote({route:distant,hotness:0},def).profit,0);
 assert.ok(h.a._traderCycleQuote({route,hotness:0},def).profit>0);
 assert.deepEqual(h.a._pickRoute(route,def),route,'do not swap the only positive route for a loss');
 assert.ok(calls.every(c=>c.qty===80));
 calls.length=0;h.a._pickRoute(null,TRADERS[1]);assert.ok(calls.every(c=>c.qty===200));
});


test('route selection does not turn nominal settlement fallback into an unknown market',()=>{
 const h=harness(), consulted=[];
 h.a._economy=()=>({getMarket(){},priceOf(id,good,side){return side==='buy'&&id==='station_coalition'?10:side==='sell'&&id==='station_helios'?20:0;}});
 h.a._stationPrice=(id,good,side,qty)=>{consulted.push(id);return side==='buy'?10:20;};
 const route=h.a._pickRoute(null,TRADERS[0]);assert.equal(route.from,'station_coalition');assert.equal(route.to,'station_helios');
 assert.deepEqual([...new Set(consulted)].sort(),['station_coalition','station_helios']);
});
