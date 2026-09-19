import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteMissionEconomics as quote,priceProceduralOffer,affordableContractQuantity,economicRiskTier,offerMixForTier} from '../../src/economy/economyMissionTerms.js';
import {ECONOMY_BALANCE as B} from '../../src/data/economyDerived.js';
import {economyContracts,fieldContractEpoch} from '../../src/systems/economyContracts.js';
import {FIRST_TRADE_CONTRACT,buildFirstTradeOffer} from '../../src/data/economyContractTemplates.js';
import {SEAMS,patchMissionsSeams} from '../../scripts/lib/patch-missions-owner.mjs';
import {createState,createBus} from '../fixtures/world.mjs';
const info={id:'station_helios',name:'Fixture Helios Port',type:'trade_hub',tier:0,sectorId:'sector_helios_prime',factionId:'faction_scn'};
const calm=()=>({pricePressure:0,danger:0,driver:{pricePressure:'none',danger:'none'},trend:{danger:0}});
function fresh(){const state=createState(),bus=createBus(),c=Object.create(economyContracts);c.init({state,bus});return {c,state,bus};}
test('contract expectation closes across tiers, risks and service types',()=>{
 for(let tier=0;tier<6;tier++)for(let risk=0;risk<5;risk++)for(const type of ['bounty_hunt','escort','patrol_clear','cargo_delivery','tow_recovery','smuggling_run']) {
  const q=quote({type,tier,riskTier:risk,distance:1200,params:{qty:12,cmdtyId:'cmdty_fuel_cells',clearCount:3,targetStrength:2},preloadedCargo:type==='cargo_delivery'});
  assert.ok(q.expectedNetCr>=q.targetNetCr-1e-6);assert.ok(q.expectedNetCr-q.targetNetCr<1.000001);
  assert.ok(q.deadlineS>q.expectedDurationS);assert.ok(q.rewardCr>0&&Number.isSafeInteger(q.rewardCr));
 }
});
test('player supplied freight principal is accounted for; client cargo is not reimbursed',()=>{
 const input={type:'cargo_delivery',tier:0,riskTier:1,params:{cmdtyId:'cmdty_fuel_cells',qty:24}};
 const supplied=quote(input),client=quote({...input,preloadedCargo:true});
 assert.ok(supplied.suppliedInputsCr>0);assert.equal(client.suppliedInputsCr,0);assert.ok(supplied.rewardCr>client.rewardCr);
 assert.equal(supplied.collateralCr,0); // the native cargo-delivery definition does not require one
});
test('bulk trade counts expected margin, never gross sale revenue as free profit',()=>{
 const q=quote({type:'bulk_trade',tier:0,params:{cmdtyId:'cmdty_fuel_cells',qty:24}});
 assert.equal(q.otherRevenueCr,B.commodities.cmdty_fuel_cells.referenceGrossCr);
 assert.ok(q.otherRevenueCr<B.commodities.cmdty_fuel_cells.basePrice*24);assert.ok(q.collateralCr>0);
 assert.ok(q.rewardCr>0); // an objective premium, not principal reimbursement
});
test('smuggling collateral loss is probability-weighted, not refunded as an extra reward',()=>{
 const q=quote({type:'smuggling_run',tier:3,riskTier:4,params:{qty:10,cmdtyId:'cmdty_narcotics'}});
 assert.equal(q.failureLossCr,(1-q.successProbability)*q.collateralCr);
});
test('field and loyalty premiums have explicit finite bounds',()=>{
 const input={type:'escort',tier:1,riskTier:2,fieldPressure:1,loyaltyMultiplier:1.15};
 assert.deepEqual(quote(input),quote({...input,fieldPressure:1e100,loyaltyMultiplier:1e100}));
});
test('stronger standing changes combat difficulty, not the risk label on safe freight',()=>{
 assert.equal(economicRiskTier('bounty_hunt',0,400),4);assert.equal(economicRiskTier('cargo_delivery',0,400),0);
 assert.ok(offerMixForTier('trade_hub',4).tow_recovery>offerMixForTier('trade_hub',0).tow_recovery);
});
test('hold capacity bounds one-load contracts including exact fractional volume',()=>{
 assert.equal(affordableContractQuantity({desired:21,freeVolume:1.6,volumePerUnit:.8}),2);
 assert.equal(affordableContractQuantity({desired:21,freeVolume:0,volumePerUnit:.8}),0);
 assert.equal(affordableContractQuantity({desired:21,freeVolume:100,sourceStock:3}),3);
});
test('calm sector maintenance is a physical mission invitation, never money',()=>{
 const {c,state,bus}=fresh();state.simTime=600;const before=state.player.credits;
 c._handleDock('station_ceres');const offer=bus.events.find(e=>e.event==='mission:offered')?.p;
 assert.equal(offer.source,'economyMaintenance');assert.equal(offer.type,'tow_recovery');assert.equal(offer.params.physicalVerb,'tow');
 assert.equal(state.player.credits,before);assert.deepEqual(state.missions.boards,{});assert.deepEqual(state.missions.active,[]);
 const count=bus.events.length;c._handleDock('station_ceres');assert.equal(bus.events.length,count);
});
test('maintenance waits for onboarding and respects an active job across all ports',()=>{
 const {c,state}=fresh();state.simTime=600;state.onboarding={active:true,finished:false};assert.equal(c.planMaintenanceOffer(info,2),null);
 delete state.onboarding;state.missions.active=[{source:'economyMaintenance',status:'active'}];assert.equal(c.planMaintenanceOffer(info,2),null);
});
test('real scarcity delivery starts at a supplier and ends at a different distressed port',()=>{
 const {c,state}=fresh();state.fixtureSignals.sector_helios_prime=calm();
 state.fixtureSignals.sector_ceres_belt={...calm(),pricePressure:.6,driver:{pricePressure:'route_scarcity',danger:'none'}};
 state.player.cargo.capVolume=2;const offer=c.planOffer(info,2);
 assert.equal(offer.type,'cargo_delivery');assert.equal(offer.stationId,'station_helios');assert.equal(offer.destStationId,'station_ceres');
 assert.equal(offer.preloadedCargo,true);assert.equal(offer.params.qty,2);assert.equal(offer.duration_s,offer.time_limit_s);
 assert.equal(offer.economyTerms.suppliedInputsCr,0);
});
test('local scarcity cannot make a circular same-station delivery',()=>{
 const {c,state}=fresh();state.fixtureSignals.sector_helios_prime={...calm(),pricePressure:.6,driver:{pricePressure:'route_scarcity',danger:'none'}};
 state.fixtureSignals.sector_ceres_belt=calm();assert.equal(c.planOffer(info,2),null);
});
test('saved station-epoch dedupe survives reload and discards unknown station keys',()=>{
 const a=fresh();a.state.simTime=600;a.c._handleDock('station_ceres');const data=a.c.serialize();data.evaluatedEpochByStation.madeUp=999;
 const b=fresh();b.state.simTime=600;b.c.deserialize(data);b.c._handleDock('station_ceres');
 assert.equal(b.bus.events.filter(e=>e.event==='mission:offered').length,0);assert.equal(b.c.serialize().evaluatedEpochByStation.madeUp,undefined);
});
test('contract lifecycle unsubscribes both dock and new-game handlers',()=>{
 const {c,state,bus}=fresh();c.destroy();state.economyContracts.firstTradeOffered=true;bus.emit('game:started');
 assert.equal(state.economyContracts.firstTradeOffered,true);
});
test('first trade keeps its authored cargo/receipt contract and uses generated valuation',()=>{
 const offer=buildFirstTradeOffer(8008);assert.equal(offer.preloadedCargo,true);assert.equal(offer.params.qty,8);
 assert.equal(offer.params.cargoValue,8*B.commodities.cmdty_fuel_cells.basePrice);assert.equal(offer.reward_cr,FIRST_TRADE_CONTRACT.terms.paysCr);
 assert.equal(offer.duration_s,offer.time_limit_s);
});
test('native-owner seam patch is atomic-by-construction and refuses missing or repeated anchors',()=>{
 // Exact anchors only; not a replacement full missions owner and not a gameplay test.
 const source=SEAMS.map(([s])=>s).join('\n')+`\n  _rollParams(typeId, info, dest, riskTier, rng) {\n    pick(LEGAL_TRADE_CMDTYS);pick(MINEABLE_CMDTYS);\n  },\n  _titleFor(typeId, p, dest) {`;
 const next=patchMissionsSeams(source);assert.ok(next.includes('duration_s:time_limit_s'));assert.ok(next.includes('sim-day:'));
 assert.ok(!next.includes('new Date()'));assert.ok(next.includes('marketTier'));
 assert.throws(()=>patchMissionsSeams(source.replace(SEAMS[0][0],'')),/seam drift/);
 assert.throws(()=>patchMissionsSeams(source+'\n'+SEAMS[0][0]),/seam drift/);
});
