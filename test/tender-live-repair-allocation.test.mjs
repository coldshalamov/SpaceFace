import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {cargo,addCargo} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {combat} from '../src/systems/combat.js';
import {stationServices} from '../src/systems/stationServices.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {bookTenderService,stepTenderService,rebindTenderService} from '../src/features/salvageTender/services.js';
import {normalizeTenderService} from '../src/features/salvageTender/model.js';
function boot(){
 const sim=createSimulation({seed:34310,systems:[cargo,economy,stationServices,combat],updateOrder:[]}),s=sim.state;
 s.mode='flight';s.player.credits=1000;
 const p=sim.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:s.player}));s.playerId=p.id;
 p.hull=80;p.hullMax=100;p.armorHp=100;p.armorMax=100;p.shield=0;p.shieldMax=0;
 const row={owned:true,stage:2,revision:0,emergencyAvailable:true},ctx={state:s,bus:sim.bus};
 const receipts=[];sim.bus.on('service:completed',r=>receipts.push(r));addCargo(s,'cmdty_scrap_metal',1);
 const step=(dt=1,gate={ok:true})=>stepTenderService(ctx,row,dt,gate);
 const fixHull=()=>stationServices._applyJobDelta(s,{type:'repair',meta:{shares:{hull:1,armor:0}}},100);
 return{sim,s,p,row,ctx,receipts,step,fixHull,book:()=>bookTenderService(ctx,row,'repair'),close:()=>sim.dispose()};
}
test('paid bench work follows changed damage on its same hull without charging again',()=>{
 const h=boot();try{assert.equal(h.book().ok,true);assert.equal(h.row.service.hullShare,1);assert.equal(h.row.service.armorShare,0);
 h.fixHull();h.p.armorHp=80; // damage-distribution fixture; delivery below uses the real yard writer
 const outcome=h.step(3);assert.equal(outcome.completed,true);assert.equal(h.p.hull,100);assert.equal(h.p.armorHp,100);
 assert.equal(h.row.service,null);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,undefined);assert.equal(h.s.player.credits,1000);
 assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].restoredHull,0);assert.equal(h.receipts[0].restoredArmor,20);h.step(3);assert.equal(h.receipts.length,1);
 }finally{h.close();}
});
test('partial paid work waits when full, then completes current damage after return',()=>{
 const h=boot();try{h.book();h.step(1);assert.equal(h.p.hull,88);assert.equal(h.row.service.remaining,12);
 h.fixHull();h.step(2);assert.equal(h.row.service.remaining,12);assert.equal(h.row.service.paused,true);
 h.p.armorHp=88;h.step(4,{ok:false,reason:'Return to the berth.'});assert.equal(h.p.armorHp,88);assert.equal(h.row.service.remaining,12);
 const done=h.step(2);assert.equal(done.completed,true);assert.equal(h.p.armorHp,100);assert.equal(h.receipts[0].restoredHull,8);assert.equal(h.receipts[0].restoredArmor,12);
 }finally{h.close();}
});
test('current mixed deficits receive the booked rate, never exceed the paid combined remainder',()=>{
 const h=boot();try{h.p.hull=90;h.p.armorHp=90;h.book();h.fixHull();h.step(1);assert.equal(h.p.armorHp,98);assert.equal(h.row.service.remaining,12);
 h.step(1);assert.equal(h.p.armorHp,100);assert.equal(h.row.service.remaining,10);h.p.hull=90;h.step(2);
 assert.equal(h.p.hull,100);assert.equal(h.row.service,null);assert.equal(h.receipts[0].restoredHull+h.receipts[0].restoredArmor,20);
 }finally{h.close();}
});
test('restored unfinished booking uses current damage only after trusted service rebind',()=>{
 const h=boot(),g=boot();try{h.book();h.step(1);const old=JSON.parse(JSON.stringify(h.row.service));g.row.service=normalizeTenderService(old);
 g.p.hull=100;g.p.armorHp=88;g.step(2);assert.equal(g.p.armorHp,88);assert.equal(g.row.service.remaining,12);
 assert.equal(rebindTenderService(g.ctx,g.row),true);g.step(2);assert.equal(g.p.armorHp,100);assert.equal(g.row.service,null);assert.equal(g.receipts.length,1);
 }finally{h.close();g.close();}
});
test('emergency weld stays hull-only and a replacement same-model pilot cannot claim paid work',()=>{
 const h=boot();try{h.p.hull=20;assert.equal(bookTenderService(h.ctx,h.row,'emergency').ok,true);h.fixHull();h.p.armorHp=50;
 h.step(5);assert.equal(h.p.armorHp,50);assert.equal(h.row.service.remaining,15);
 h.row.service=null;h.p.hull=80;h.book();const replacement=h.sim.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:h.s.player}));h.s.playerId=replacement.id;
 const before=replacement.hull;h.step(4);assert.equal(replacement.hull,before);assert.equal(h.row.service.remaining,20);assert.match(h.row.service.pauseReason,/previous hull/);
 }finally{h.close();}
});
