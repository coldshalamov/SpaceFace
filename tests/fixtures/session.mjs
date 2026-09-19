/** A scheduled-work ECONOMIC COMPONENT fixture, not SpaceFace's gameplay/AI acceptance harness.
 * Real economy init/update/quote/execute/save, real cycles, real catalog, real work reservations.
 * Synthetic ports + scheduled deliveries; operating debits follow model assumptions, not flight fuel.
 */
import assert from 'node:assert/strict';
import {economy} from '../../src/systems/economy.js';
import {ECONOMY_BALANCE as B} from '../../src/data/economyDerived.js';
import {createState,createBus,addCargo} from './world.mjs';

function instance(state) {const bus=createBus(),owner=Object.create(economy);owner.init({state,bus});return {state,bus,owner};}
export function runSession({seed=8008,career='miner',hours=12,reloadAtS=null,spontaneousEvents=true}={}) {
 if(!['miner','trader'].includes(career))throw new RangeError('Fixture supports scheduled miner/trader only');
 let game=instance(createState(seed));
 const initialCredits=career==='trader'?2500:0;
 game.state.player.credits=initialCredits;game.state.player.cargo.capVolume=24;
 const id=career==='miner'?'cmdty_ore_iron':'cmdty_fuel_cells';
 const row=B.commodities[id],periodS=row.workMinutes*60;
 game.owner.ensureMarket('station_ceres');game.owner.ensureMarket('station_helios');
 const result={seed,career:`scheduled_${career}`,hours,initialCredits,spontaneousEvents,
  completedWork:0,skippedWork:0,tradeCount:0,resourceUnitsPublished:0,netByHour:[],reloadAtS};
 let lastCredits=initialCredits,reloaded=false;
 const advance=(seconds)=>{
  for(let i=0;i<seconds/5;i++) {
   game.state.simTime+=5;game.state.tick+=300;
   if(spontaneousEvents)game.owner.update(5,game.state);
   else game.owner.econTick(5,game.state);
  }
 };
 const reload=()=>{
  const state=createState(seed);state.simTime=game.state.simTime;state.tick=game.state.tick;
  state.player=structuredClone(game.state.player);
  const saved=JSON.parse(JSON.stringify(game.owner.serialize()));
  game=instance(state);game.owner.deserialize(saved);game.bus.emit('save:loaded');reloaded=true;
 };
 for(let n=0;n<hours*3600/periodS;n++) {
  let qty=24,buyCost=0;
  if(career==='miner') {
   const request={sectorId:'sector_helios_prime',commodityId:id,qty,seq:n+1};
   game.bus.emit('economy:resourceWork:reserve',request);
   if(request.result?.ok) {
    const lease=request.result;qty=lease.qty;
    const commit={sectorId:request.sectorId,leaseId:lease.id,producedQty:qty};game.bus.emit('economy:resourceWork:settle',commit);
    assert.equal(commit.result?.ok,true);result.resourceUnitsPublished+=qty;
   } else {qty=0;result.skippedWork++;}
   advance(periodS);
   if(qty)assert.equal(addCargo(game.state,id,qty),qty); // scheduled delivery, NOT a real asteroid kill
  } else {
   // A declared component policy: keep a 200-credit reserve and do not knowingly enter a loss.
   while(qty>0) {
    const buy=game.owner.quote('station_ceres',id,'buy',qty),sell=game.owner.quote('station_helios',id,'sell',qty);
    if(buy.ok&&sell.ok&&buy.qty===qty&&buy.total<=game.state.player.credits-200&&sell.total>buy.total)break;
    qty--;
   }
   if(qty) {
    const buy=game.owner.execute('station_ceres',id,'buy',qty,{intentId:`fixture-buy-${n}`});assert.equal(buy.ok,true);
    qty=buy.qty;buyCost=buy.total;result.tradeCount++;
   } else result.skippedWork++;
   advance(periodS/2);
  }
  if(qty) {
   const sell=game.owner.execute('station_helios',id,'sell',qty,{intentId:`fixture-sale-${n}`});assert.equal(sell.ok,true);
   const grossProfit=sell.total-buyCost;
   game.owner.chargeCredits(Math.round(Math.max(0,grossProfit)*B.phases[0].operatingFraction),'fixture:assumed_operating_cost');
   result.completedWork++;result.tradeCount++;
  }
  if(career==='trader')advance(periodS/2);
  if(game.state.simTime%3600===0) {
   result.netByHour.push(game.state.player.credits-lastCredits);lastCredits=game.state.player.credits;
  }
  if(!reloaded&&reloadAtS!=null&&game.state.simTime>=reloadAtS)reload();
 }
 result.finalCredits=game.state.player.credits;result.netCashFlowCr=result.finalCredits-initialCredits;
 result.positiveNetInEveryHour=result.netByHour.every(n=>n>0);
 result.pulse=game.owner.getPulse();
 // Observable replay checkpoint intentionally excludes historical chart caching and event-listener identity.
 result.checkpoint={credits:game.state.player.credits,rngSeed:game.state.economy.rngSeed,
  stocks:Object.fromEntries(Object.entries(game.state.economy.markets).map(([sid,m])=>[sid,Object.fromEntries(Object.entries(m).map(([cid,e])=>[cid,e.stock]))])),
  resourceWork:game.owner.serialize().resourceWork};
 return result;
}
