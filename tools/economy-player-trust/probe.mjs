// Reproduce settled round trips and quote-backed freight plans through the actual economy.
import { createBus } from '../../src/core/eventBus.js';
import { economy } from '../../src/systems/economy.js';
import { SECTORS } from '../../src/data/sectors.js';
import { computeBestTrades } from '../../src/ui/market/tradeLogic.js';
const station='station_helios';
const info=SECTORS.flatMap(s=>s.stations||[]).find(s=>s.id===station);
const results=[];
for (const rep of [0,500,1000]) {
 const state={mode:'flight',meta:{seed:4242},simTime:600,tick:0,playerId:'p',player:{credits:100000,stats:{},cargo:{items:{},capVolume:250,usedVolume:0,usedMass:0}},entities:new Map(),factions:{[info.factionId]:{rep}}};
 const inst=Object.create(economy); inst.init({state,bus:createBus(),helpers:{},registry:null}); inst.ensureMarket(station); inst.ensureMarket('station_coalition'); inst.snapshotIntel(station); inst.snapshotIntel('station_coalition');
 const good='cmdty_ore_iron';
 const before={credits:state.player.credits,stock:state.economy.markets[station][good].stock};
 const buy=inst.execute(station,good,'buy',1); const sell=inst.execute(station,good,'sell',1);
 results.push({kind:'roundtrip',rep,faction:info.factionId,before,buy,sell,delta:state.player.credits-before.credits,stockDelta:state.economy.markets[station][good].stock-before.stock});
 if(rep===0){
  state.player.credits=1000;
  const routes=computeBestTrades(state,station,{quote:inst.quote.bind(inst)});
  for(const route of routes){const q=inst.quote(station,route.cmdtyId,'buy',route.loadUnits); results.push({kind:'route',good:route.cmdtyId,units:route.loadUnits,shownCost:route.loadCost,actualQuote:q.total,accepted:q.qty,credits:state.player.credits,shownMargin:route.loadProfit});}
 }
}
console.log(JSON.stringify(results,null,2));
