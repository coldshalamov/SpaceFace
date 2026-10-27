import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDom,findButtons,textLines} from './helpers/fake-dom.mjs';
import { createLaunderService } from '../src/ui/station/launderService.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
// Repository headless DOM helper, extended locally for child removal. No browser/layout claims.
function documentFixture(){const d=fakeDom(),create=d.createElement;d.createElement=tag=>{const n=create(tag);n.removeChild=child=>{const i=n.children.indexOf(child);if(i>=0)n.children.splice(i,1);child.parentNode=null;return child;};n.hasAttribute=key=>n.getAttribute(key)!==null;return n;};return d;}
function buttons(el){return findButtons(el);}
function text(el){return textLines(el).join(' ');}
function confirm(el){return buttons(el).find(b=>b.hasAttribute('data-launder-confirm'));}
function boot(){
 const sim=createSimulation({seed:15120,systems:[economy,pirateDisguise]});const {state,bus:worker}=sim;
 state.mode='flight';state.player.credits=5000;state.world.currentSectorId='sector_eunomia_gulf';
 const p=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},hull:100,radius:6});state.playerId=p.id;
 sim.spawn({type:'station',pos:{x:0,z:0},radius:20,data:{stationId:'station_eunomia'}});
 state.ui.docked=true;state.ui.dockedStationId='station_eunomia';
 const pod=spawnJettisonedCargoPod(state,{pos:{x:12,z:8},commodityId:'cmdty_narcotics',amount:8,ownerId:'merchant'},sim.helpers);
 const bus=createBus(),requests=[],responses=[];
 bus.on('dock:launder',p=>requests.push(JSON.parse(JSON.stringify(p))));
 for(const event of ['cargo:launderQuoted','cargo:laundered'])worker.on(event,p=>{const projected=projectBridgeEvent(event,p);assert.equal(projected.dropped,false);responses.push([event,JSON.parse(JSON.stringify(projected.flat))]);});
 const panel=createLaunderService({bus,getState:()=>state,document:documentFixture()});
 function drainRequests(){while(requests.length)worker.emit('dock:launder',requests.shift());}
 function drainResponses(){while(responses.length){const [event,p]=responses.shift();bus.emit(event,p);}}
 function pump(){drainRequests();drainResponses();}
 return {sim,state,pod,bus,worker,panel,requests,responses,pump,drainRequests,drainResponses,close(){panel.dispose();sim.dispose();}};
}
test('isolated service DOM: async quote, explicit one-pod price, double click pays once',()=>{const t=boot();try{t.panel.show();assert.equal(t.state.player.credits,5000);assert.equal(confirm(t.panel.el),undefined);t.pump();const b=confirm(t.panel.el);assert.ok(b);assert.match(b.textContent,/1613 cr/);assert.equal(b.style.whiteSpace,'normal');assert.equal(b.style.minHeight,'44px');assert.equal(b.parentNode.style.gridTemplateColumns,'minmax(0, 1fr)');assert.equal(b.parentNode.children[0].style.overflowWrap,'anywhere');assert.match(text(t.panel.el),/title: unnamed owner/);assert.match(text(t.panel.el),/200 WU/);b.click();b.click();assert.equal(t.requests.length,1);assert.deepEqual(Object.keys(t.requests[0]).sort(),['action','contextId','quoteId','requestId','stationId']);assert.equal(t.state.player.credits,5000);t.pump();assert.equal(t.state.player.credits,3387);assert.equal(t.state.player.launderLedger.length,1);assert.match(text(t.panel.el),/Paid 1613 cr/);}finally{t.close();}});
test('Close/Back before async reply discards quote; reopen never reuses context/token',()=>{const t=boot();try{t.panel.show();t.drainRequests();const old=t.responses[0][1];t.panel.hide();t.panel.show();t.drainResponses();assert.equal(confirm(t.panel.el),undefined);t.pump();const fresh=confirm(t.panel.el);assert.ok(fresh);assert.notEqual(fresh.getAttribute('data-launder-confirm'),old.quotes[0].quoteId);t.bus.emit('cargo:launderQuoted',old);assert.equal(confirm(t.panel.el),fresh);}finally{t.close();}});
for(const event of ['save:restoring','save:loaded','game:new','sector:exit','dock:undocked'])test(event+' clears mounted UI and rejects a retained click',()=>{const t=boot();try{t.panel.show();t.pump();const b=confirm(t.panel.el);t.worker.emit(event,{});t.bus.emit(event,{});b.click();t.pump();assert.equal(t.panel.el.hidden,true);assert.equal(t.state.player.credits,5000);assert.equal(t.pod.data.laundered,undefined);}finally{t.close();}});
test('station change, refusal, refresh and disposal stay isolated from trade controls',()=>{const t=boot();try{t.panel.show();t.pump();const b=confirm(t.panel.el);t.state.player.credits=10;b.click();t.pump();assert.match(text(t.panel.el),/Not enough credits/);assert.equal(t.state.player.credits,10);const refresh=buttons(t.panel.el).find(n=>n.hasAttribute('data-launder-refresh'));refresh.click();t.pump();assert.equal(confirm(t.panel.el).disabled,true);t.state.ui.dockedStationId='station_helios';confirm(t.panel.el).click();t.pump();assert.equal(t.panel.el.hidden,true);t.panel.dispose();t.panel.show();assert.equal(t.panel.el.hidden,true);}finally{t.close();}});

test('late pre-reset worker quote and verdict cannot repaint a reopened service',()=>{const t=boot();try{t.panel.show();t.drainRequests();const old=t.responses[0][1];t.worker.emit('save:loaded',{});t.bus.emit('save:loaded',{});t.panel.show();t.pump();const fresh=confirm(t.panel.el);assert.ok(fresh);t.bus.emit('cargo:launderQuoted',old);t.bus.emit('cargo:laundered',{...old,accepted:true,cut:1613});assert.equal(confirm(t.panel.el),fresh);assert.doesNotMatch(text(t.panel.el),/Paid/);assert.equal(t.state.player.credits,5000);}finally{t.close();}});
test('long authored cargo/title labels retain isolated narrow-panel wrapping contracts',()=>{const t=boot();try{const long='LongUnbrokenManifestName'.repeat(16);t.pod.name=long;t.pod.data.cargoIdentity={...t.pod.data.cargoIdentity,ownerName:'Named manifest owner '.repeat(20)};t.panel.show();t.pump();const b=confirm(t.panel.el),row=b.parentNode,label=row.children[0];assert.match(text(t.panel.el),new RegExp(long));assert.equal(row.style.gridTemplateColumns,'minmax(0, 1fr)');assert.equal(label.style.overflowWrap,'anywhere');assert.equal(label.style.minWidth,'0');for(const button of buttons(t.panel.el)){assert.equal(button.style.whiteSpace,'normal');assert.equal(button.style.minWidth,'0');assert.equal(button.style.minHeight,'44px');}assert.equal(t.state.player.credits,5000);}finally{t.close();}});
