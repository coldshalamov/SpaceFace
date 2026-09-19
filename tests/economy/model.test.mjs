import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ECONOMY_BALANCE as B} from '../../src/data/economyDerived.js';
import {deriveEconomyTables,COMMODITY_REFERENCE_VOLUMES} from '../../src/economy/economyModel.js';
import {COMMODITIES} from '../../src/data/commodities.js';
import {TECH_NODES} from '../../src/data/tech.js';
import {MISSION_TYPES,validateOfferMix} from '../../src/data/missions.js';
import {averageBoundedPrice,recoverStock} from '../../src/economy/economyMath.js';
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t*Math.max(1,Math.abs(b)),`${a} != ${b}`);
test('committed generated table is exactly recomputable',()=>assert.deepEqual(B,deriveEconomyTables()));
test('catalog coverage, IDs, legality, mass, volume, recipe roles and unlock graph are preserved',async()=>{
 const before=JSON.parse(await readFile(new URL('../fixtures/catalog-contract.json',import.meta.url),'utf8'));
 const without=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([k])=>!keys.includes(k)));
 assert.equal(COMMODITIES.length,47);assert.equal(TECH_NODES.length,32);
 assert.deepEqual(COMMODITIES.map(r=>without(r,['basePrice','elasticity','volatility'])),before.commodities);
 assert.deepEqual(TECH_NODES.map(r=>without(r,['cost'])),before.tech);
 for(const r of COMMODITIES)assert.ok(B.commodities[r.id]);
 for(const r of TECH_NODES)assert.deepEqual(r.cost,{credits:B.tech[r.id].credits,rp:B.tech[r.id].rp});
 assert.deepEqual(MISSION_TYPES.map(r=>r.type),before.missionTypes);
});
test('every technology prerequisite exists and the unlock graph is acyclic',()=>{
 const map=new Map(TECH_NODES.map(n=>[n.id,n]));
 function walk(id,seen=new Set()) {assert.ok(map.has(id),id);assert.ok(!seen.has(id),'cycle '+id);const next=new Set(seen).add(id);for(const p of map.get(id).prereqs)walk(p,next);}
 for(const n of TECH_NODES)walk(n.id);
 for(const n of TECH_NODES.filter(n=>!n.prereqs.length))assert.equal(n.cost.rp,0);
});
test('authored-only offers remain zero weight in every tier',()=>{
 assert.equal(validateOfferMix().ok,true);
 for(const mixes of Object.values(B.offerMixByTier))for(const mix of mixes) {
  for(const t of MISSION_TYPES.filter(t=>t.proceduralWeight===0))assert.equal(mix[t.type] || 0,0);
  assert.ok(Object.values(mix).every(x=>x>=0&&Number.isFinite(x)));
 }
});
test('working-capital solver closes the starter freight constraint',()=>{
 const fuel=B.commodities.cmdty_fuel_cells;
 assert.ok(fuel.workingCapitalCr<=B.market.referenceCapitalBudget*1.01);
 assert.ok(fuel.workingCapitalCr>=B.market.referenceCapitalBudget*.99);
});
for(const [id,c] of Object.entries(B.commodities)) {
 test(`steady throughput derives ${id}`,()=>{
  const qty=c.lotUnits,period=c.workMinutes*60,phase=B.phases[c.economyTier];
  const cp=c.baseEq*B.market.roleFactor.consume,pp=c.baseEq*B.market.roleFactor.produce;
  let sink=cp,source=pp,lastGross=0;
  for(let i=0;i<400;i++) {
   const sell=averageBoundedPrice(c.basePrice,c.baseEq,c.elasticity,sink,sink+qty)*(1-B.market.spread/2)*qty;
   const buy=c.valuation==='trade' ? averageBoundedPrice(c.basePrice,c.baseEq,c.elasticity,source-qty,source)*(1+B.market.spread/2)*qty : 0;
   lastGross=sell-buy;
   sink=recoverStock(sink+qty,cp,period,c.recoveryHalfLifeS);
   source=recoverStock(source-(c.valuation==='trade'?qty:0),pp,period,c.recoveryHalfLifeS);
  }
  const net=lastGross*(1-phase.operatingFraction)*3600/period;
  close(net,c.referenceNetCrPerHour,4e-6);
  // Currency quantization is exposed, not hidden behind a percentage-based tolerance.
  const maxRoundingRelative=.5/c.basePrice+1e-5;
  assert.ok(Math.abs(net/phase.netCrPerHour-1)<=maxRoundingRelative);
  assert.ok(c.recoveryHalfLifeS>0&&Number.isFinite(c.recoveryHalfLifeS));
 });
}

test('all 47 reference lots fit their phase hold and use the canonical physical volumes',()=>{
 for(const c of COMMODITIES) {
  assert.equal(COMMODITY_REFERENCE_VOLUMES[c.id],c.volPerU);
  const row=B.commodities[c.id];
  assert.ok(row.lotUnits*c.volPerU<=B.phases[row.economyTier].referenceHold+1e-9);
  assert.equal(row.lotVolume,Number((row.lotUnits*c.volPerU).toFixed(6)));
 }
});
