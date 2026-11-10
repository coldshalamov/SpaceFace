/** SMALL SYNTHETIC WORLD: geographic/faction/cargo ports, no physics or entity spawner. */
import {COMMODITIES} from '../../src/data/commodities.js';
export const SECTORS=[
 {id:'sector_helios_prime',name:'Fixture Helios',tier:0,security:1,wealth:1,factionId:'faction_scn',position:{x:0,y:0},neighbors:['sector_ceres_belt'],stations:[
  {id:'station_helios',name:'Fixture Helios Port',type:'trade_hub',size:'M',factionId:'faction_scn'},
  {id:'station_mine',name:'Fixture Mine',type:'mining',size:'M',factionId:'faction_scn'}]},
 {id:'sector_ceres_belt',name:'Fixture Ceres',tier:0,security:1,wealth:1,factionId:'faction_scn',position:{x:1,y:0},neighbors:['sector_helios_prime','sector_frontier'],stations:[
  {id:'station_ceres',name:'Fixture Ceres Refinery',type:'refinery',size:'M',factionId:'faction_scn'}]},
 {id:'sector_frontier',name:'Fixture Frontier',tier:4,security:0.5,wealth:1,factionId:'faction_scn',position:{x:2,y:0},neighbors:['sector_ceres_belt'],stations:[
  {id:'station_frontier',name:'Fixture Frontier',type:'military',size:'L',factionId:'faction_scn'}]},
];
export function addCargo(state,id,qty) {
 const c=state.player.cargo,d=COMMODITIES.find(x=>x.id===id);
 const n=Math.max(0,Math.min(qty,Math.floor((c.capVolume-c.usedVolume+1e-9)/(d?.volPerU || 1))));
 c.items[id]=(c.items[id] || 0)+n;c.usedVolume+=n*(d?.volPerU || 1);c.usedMass+=n*(d?.massPerU || 1);return n;
}
export function removeCargo(state,id,qty) {
 const c=state.player.cargo,d=COMMODITIES.find(x=>x.id===id),n=Math.max(0,Math.min(c.items[id] || 0,qty));
 c.items[id]=(c.items[id] || 0)-n;c.usedVolume=Math.max(0,c.usedVolume-n*(d?.volPerU || 1));c.usedMass=Math.max(0,c.usedMass-n*(d?.massPerU || 1));return n;
}
export const isUnsellableCargo=(state,id)=>(state.fixtureSealed || []).includes(id);
export function createBus() {
 const listeners=new Map(),events=[];
 const bus={events,on(event,fn){const set=listeners.get(event)||new Set();listeners.set(event,set);set.add(fn);return ()=>bus.off(event,fn);},off(event,fn){listeners.get(event)?.delete(fn);},emit(event,p){events.push({event,p});for(const fn of [...(listeners.get(event)||[])])fn(p);},queue(event,p){bus.emit(event,p);}};
 return bus;
}
export function createState(seed=8008) {
 return {simTime:0,tick:0,meta:{seed},world:{currentSectorId:'sector_helios_prime'},
  content:{sectors:SECTORS,commodities:COMMODITIES},player:{credits:100000,cargo:{items:{},capVolume:200,usedVolume:0,usedMass:0},stats:{}},
  economy:{markets:{},cycles:{},econEvents:[],econClock:{accumulator:0,lastTickT:0,ticksElapsed:0},marketIntel:{}},
  missions:{active:[],boards:{}},entities:new Map(),ui:{},fixtureSignals:{},fixtureRisk:{}};
}
