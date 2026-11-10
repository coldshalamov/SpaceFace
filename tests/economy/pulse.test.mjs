import test from 'node:test';import assert from 'node:assert/strict';
import {createEconomyPulse,recordEconomyCash,recordEconomyPulse,economyPulseReport,restoreEconomyPulse} from '../../src/economy/economyPulse.js';
test('telemetry reports actual cash flow, not sales as profit',()=>{
 const e={pulse:createEconomyPulse(0)};recordEconomyCash(e,10,-1000,'trade:buy:fuel');recordEconomyCash(e,60,1200,'trade:sell:fuel');
 const r=economyPulseReport(e,900);assert.equal(r.rows[0].netCashFlowCr,200);assert.equal(r.rows[0].saleCr,1200);assert.equal(r.rows[0].buyCr,1000);assert.equal(r.rows[0].complete,true);
});
test('missing activity bins stay zero; partial coverage is explicitly marked',()=>{
 const e={pulse:createEconomyPulse(100)};recordEconomyCash(e,150,100,'reward');const r=economyPulseReport(e,4000);
 assert.equal(r.observedFromS,100);assert.equal(r.rows[0].complete,false);assert.equal(r.rows[1].cashInCr,0);assert.equal(r.rows.at(-1).complete,false);assert.equal(r.secondsSinceCashIn,3850);
});
test('pulse remains bounded after a million simulated seconds and restores without invented history',()=>{
 const e={pulse:createEconomyPulse(0)};for(let t=0;t<1e6;t+=900)recordEconomyPulse(e,t,{offers:1});
 assert.ok(e.pulse.bins.length<=48);assert.ok(economyPulseReport(e,1e6).rows.length<=48);
 const old=restoreEconomyPulse(null,1e6);assert.equal(old.observedFromS,1e6);assert.equal(old.bins.length,0);
});
