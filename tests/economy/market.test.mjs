import test from 'node:test';
import assert from 'node:assert/strict';
import {economy,avgMid} from '../../src/systems/economy.js';
import {ECONOMY_BALANCE as B} from '../../src/data/economyDerived.js';
import {cycleFactorAt,createCycle,serializeCycles,deserializeCycles,CYCLE_FACTOR_LO,CYCLE_FACTOR_HI} from '../../src/systems/economyCycles.js';
import {createState,createBus,addCargo} from '../fixtures/world.mjs';
import {mulberry32} from '../fixtures/rng.mjs';
const cid='cmdty_fuel_cells',station='station_ceres';
function fresh(seed=8008) {const state=createState(seed),bus=createBus(),e=Object.create(economy);e.init({state,bus});return {e,state,bus};}
function neutral(e,sid=station,id=cid) {e.ensureMarket(sid);Object.assign(e.state.economy.cycles[sid][id],{regime:'stable',family:'stable',bias:0,amplitude:0,slope:0,regimeStartT:0,regimeEndT:1e9});delete e.state.economy.cycles[sid][id].blendFrom;}
const financial=(s)=>JSON.stringify({credits:s.player.credits,cargo:s.player.cargo,stocks:s.economy.markets});
test('real economy quotes and commits a finite conserved buy/sell',()=>{
 const {e,state}=fresh();neutral(e);const stock=state.economy.markets[station][cid].stock,before=state.player.credits;
 const q=e.quote(station,cid,'buy',24),buy=e.execute(station,cid,'buy',24);
 assert.equal(buy.total,q.total);assert.equal(state.player.credits,before-buy.total);assert.equal(state.player.cargo.items[cid],24);
 assert.ok(Math.abs(state.economy.markets[station][cid].stock-(stock-24))<1e-8);
 const sale=e.execute(station,cid,'sell',24);assert.ok(sale.total<buy.total);
 assert.ok(Math.abs(state.economy.markets[station][cid].stock-stock)<1e-8);
});
test('invalid sides and non-finite quantities do not warm or mutate a market',()=>{
 const {e,state}=fresh(),before=financial(state);
 for(const q of [NaN,Infinity,0,-1,'12'])assert.equal(e.execute(station,cid,'buy',q).ok,false);
 assert.equal(e.quote(station,cid,'barter',12).ok,false);assert.equal(financial(state),before);
});
test('partial stock quote and execution agree about quantity and consideration',()=>{
 const {e,state}=fresh();neutral(e);state.economy.markets[station][cid].stock=5;
 const q=e.quote(station,cid,'buy',20);assert.equal(q.qty,4);assert.equal(q.partial,true);
 const result=e.execute(station,cid,'buy',20);assert.equal(result.qty,4);assert.equal(result.total,q.total);
});
test('hold-limited partial fill is tested before affordability',()=>{
 const {e,state}=fresh();neutral(e);state.player.cargo.capVolume=1.6;
 state.player.credits=e.quote(station,cid,'buy',2).total;
 const r=e.execute(station,cid,'buy',100);assert.equal(r.ok,true);assert.equal(r.qty,2);assert.equal(state.player.credits,0);
});
test('sealed cargo and high-tier purchases retain owner gates',()=>{
 const {e,state}=fresh();addCargo(state,cid,10);state.fixtureSealed=[cid];
 assert.equal(e.execute(station,cid,'sell',10).reason,'mission_cargo_locked');
 assert.equal(e.quote(station,'cmdty_exotic_amazonite','buy',1).reason,'tier_unavailable');
});
test('intent is idempotent and rejects changed identities or quantities',()=>{
 const {e,state}=fresh();const r=e.execute(station,cid,'buy',10,{intentId:'one'});const credits=state.player.credits;
 assert.equal(e.execute(station,cid,'buy',10,{intentId:'one'}).duplicate,true);
 assert.equal(state.player.credits,credits);assert.equal(e.execute(station,cid,'sell',10,{intentId:'one'}).reason,'intent_conflict');
 assert.equal(e.execute(station,cid,'buy',11,{intentId:'one'}).reason,'intent_conflict');assert.equal(r.ok,true);
});
test('synchronous credits listeners cannot replay an in-flight trade intent',()=>{
 const {e,state,bus}=fresh();let replay;
 bus.on('credits:changed',()=>{replay=e.execute(station,cid,'buy',10,{intentId:'recursive'});});
 const r=e.execute(station,cid,'buy',10,{intentId:'recursive'});
 assert.equal(r.ok,true);assert.equal(replay.reason,'intent_pending');assert.equal(state.player.cargo.items[cid],10);
});
test('sell refuses a wallet overflow rather than deleting cargo for unreceivable credits',()=>{
 const {e,state}=fresh();state.player.credits=Number.MAX_SAFE_INTEGER;addCargo(state,cid,10);e.ensureMarket(station);
 const before=financial(state);assert.equal(e.execute(station,cid,'sell',10).reason,'credits_cap');assert.equal(financial(state),before);
});
test('malformed grants, charges and stock pressure cannot poison finite state',()=>{
 const {e,state}=fresh(),credits=state.player.credits;
 for(const x of [Infinity,-Infinity,NaN]){e.grantCredits(x,'bad');e.chargeCredits(x,'bad');e.applyStockPressure(station,cid,'sell',x);}
 assert.equal(state.player.credits,credits);assert.deepEqual(state.economy.markets,{});
});
test('saved filled intent and wallet state cannot double-pay after load',()=>{
 const a=fresh();a.e.execute(station,cid,'buy',10,{intentId:'saved'});
 const data=a.e.serialize(),b=fresh();b.state.player=structuredClone(a.state.player);b.state.simTime=a.state.simTime;b.e.deserialize(data);
 const before=b.state.player.credits;assert.equal(b.e.execute(station,cid,'buy',10,{intentId:'saved'}).duplicate,true);assert.equal(b.state.player.credits,before);
 assert.deepEqual(b.e.quote(station,cid,'buy',7),a.e.quote(station,cid,'buy',7));
});
test('migration updates book references once but does not rescale goods or cash',()=>{
 const {e,state}=fresh();e.ensureMarket(station);const data=e.serialize();delete data.balanceVersion;
 const originalStock=state.economy.markets[station][cid].stock,before=state.player.credits;
 e.deserialize(data);assert.equal(state.player.credits,before);assert.equal(state.economy.markets[station][cid].stock,originalStock);
 assert.equal(state.economy.markets[station][cid].baseEq,B.commodities[cid].baseEq);
 const first=e.serialize();e.deserialize(first);assert.deepEqual(e.serialize(),first);
});
test('economy event bridge validates canonical sectors and never spawns or pays',()=>{
 const {state,bus}=fresh(),before=state.player.credits;
 const p={sectorId:'sector_helios_prime',commodityId:'cmdty_ore_iron',qty:24,seq:1};bus.emit('economy:resourceWork:reserve',p);
 assert.equal(p.result.ok,true);assert.equal(state.player.credits,before);assert.equal(state.entities.size,0);
 const bad={...p,sectorId:'made-up'};bus.emit('economy:resourceWork:reserve',bad);assert.equal(bad.result.reason,'unknown_sector');
});
test('bulk price remains bounded through the original unclamped-integral failure',()=>{
 assert.ok(avgMid(10,100,1.2,1,3)<=26);assert.ok(avgMid(10,100,1.2,1000,1e7)>=4);
});
test('seeded cycles remain bounded through extreme times and survive serialization',()=>{
 const rng=mulberry32(4242);const state={economy:{cycles:{station:{}}}};
 for(let i=0;i<50;i++) {
  const c=createCycle(rng,{id:cid,basePrice:100,volatility:.3},0);c.cmdtyId=cid;state.economy.cycles.station[cid]=c;
  for(const t of [0,100,3000,1e7])assert.ok(cycleFactorAt(c,t)>=CYCLE_FACTOR_LO&&cycleFactorAt(c,t)<=CYCLE_FACTOR_HI);
  const restored={economy:{cycles:{}}};deserializeCycles(restored,serializeCycles(state));
  for(const t of [0,123,1234])assert.equal(cycleFactorAt(restored.economy.cycles.station[cid],t),cycleFactorAt(c,t));
 }
});

test('nested trades with different identities cannot reorder cash and cost-basis receipts',()=>{
 const {e,state,bus}=fresh();let nested;
 bus.on('credits:changed',()=>{nested=e.execute(station,cid,'buy',10,{intentId:'other'});});
 assert.equal(e.execute(station,cid,'buy',10,{intentId:'outer'}).ok,true);
 assert.equal(nested.reason,'trade_pending');assert.equal(state.player.cargo.items[cid],10);
});
test('unsafe or oversized intent identifiers fail before financial mutation',()=>{
 const {e,state}=fresh(),before=financial(state);
 for(const intentId of ['__proto__','constructor','prototype','x'.repeat(257)])
  assert.equal(e.execute(station,cid,'buy',10,{intentId}).reason,'bad_intent_id');
 assert.equal(financial(state),before);
});
