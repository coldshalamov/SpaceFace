import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainMirroringProfile } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createShipStage } from '../src/ui/station/screens/shipworks.js';
import { fakeDom } from '../test/helpers/fake-dom.mjs';
import { makeShipEntitySpec, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
function shipworksDom() {
  const doc = fakeDom();
  const make = doc.createElement;
  const regions = new Map();
  doc.createElement = (tag) => {
    const node = make(tag);
    node.ownerDocument = doc;
    node.hidden = true;
    node.style.removeProperty = (key) => { delete node.style[key]; };
    node.hasAttribute = (key) => node.getAttribute(key) !== null;
    node.removeEventListener = () => {};
    node.remove = () => {};
    node.prepend = (...children) => children.forEach((child) => node.appendChild(child));
    node.insertBefore = (child) => node.appendChild(child);
    node.after = () => {}; node.before = () => {};
    node.replaceChildren = (...children) => { node.children.length = 0; children.forEach((child) => node.appendChild(child)); };
    node.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
    node.getContext = () => null;
    node.contains = (child) => child?.parentNode === node;
    node.querySelector = (selector) => {
      if (node.className === 'sx-sw-lot-dialog') {
        node.dialogParts ||= new Map();
        if (!node.dialogParts.has(selector)) node.dialogParts.set(selector, doc.createElement('div'));
        return node.dialogParts.get(selector);
      }
      if (node.className.split(/\s+/).includes('sx-sw')) {
        if (!regions.has(selector)) regions.set(selector, doc.createElement('div'));
        return regions.get(selector);
      }
      if (/^\[data-gauge-(?:value|ghost)\]$/.test(selector)) {
        node.gaugeNodes ||= new Map();
        if (!node.gaugeNodes.has(selector)) node.gaugeNodes.set(selector, doc.createElement('span'));
        return node.gaugeNodes.get(selector);
      }
      const attr = selector.match(/^\[(data-(?:buyship|buy|mode))(?:="([^"]*)")?\]$/);
      if (!attr) return null;
      const button = [...node.innerHTML.matchAll(/<button\b[^>]*>/g)]
        .find(([html]) => html.includes(`${attr[1]}="${attr[2] || ''}`));
      if (!button) return null;
      const control = doc.createElement('button');
      for (const [, key, value] of button[0].matchAll(/([\w-]+)="([^"]*)"/g)) control.setAttribute(key, value);
      control.disabled = /\sdisabled(?:\s|>)/.test(button[0]);
      control.parentNode = node;
      control.closest = (sel) => sel === `[${attr[1]}]` ? control : null;
      return control;
    };
    node.fire = async (target) => {
      for (const handler of node.listeners.click || []) await handler({ target, preventDefault() {}, stopPropagation() {} });
    };
    return node;
  };
  doc.createComment = () => doc.createElement('comment');
  doc.createElementNS = (_ns, tag) => doc.createElement(tag);
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  return { doc, regions };
}


test('worker Shipworks Remove waits for owner and preserves the exact fitting', async () => {
const host=createSimHost(),main=createGameState(4242),bus=createBus(),domains=new Map(Object.entries(main));let seq=0;
const apply=reply=>{for(const u of reply.domainUpdates||[]){const segs=u.segs.length===1&&u.segs[0].includes('.')?u.segs[0].split('.'):u.segs;applyDomainPathUpdate(domains,{...u,segs},new Set());main[segs[0]]=domains.get(segs[0]);}};
const tick=async(commands=[])=>{const r=structuredClone(await host.tick({tick:++seq,steps:0,commands}));apply(r);return r;};
const globals=['document','window','requestAnimationFrame','cancelAnimationFrame','setTimeout'];const previous=new Map(globals.map(k=>[k,globalThis[k]]));let stage;
try {
 apply(structuredClone(await host.init({profile:'production',seed:4242,bridgeAll:true,domainMirroring:createDomainMirroringProfile('station'),scenarioContract:JSON.parse(readFileSync('src/data/scenarios/47a.scenario.json','utf8'))})));
 const {state,registry,runtime}=host.host;state.mode='flight';state.ui.docked=true;state.ui.dockedStationId='station_helios';
 const player=runtime.spawn({...makeShipEntitySpec('ship_kestrel'),isPlayer:true});state.playerId=player.id;
 const hull=SHIPS.find(s=>s.id==='ship_kestrel'),slots=buildSlotList(hull),slot=slots.findIndex(s=>s.type==='cargo');
 state.player.ownedShips=[{defId:hull.id,fittings:Array(slots.length).fill(null),fittedInstances:{}}];state.player.activeShipIndex=0;
 state.player.credits=20000;
 state.player.moduleInventory=Array.from({length:600},(_,i)=>({instanceId:`mi_previous_${i}`,defId:'mod_hull_patch_kit_s'}));
 state.player.ownedShips[0].fittings[slot]='mod_cargo_net_s';state.player.ownedShips[0].fittedInstances[slot]={instanceId:'mi_earned',defId:'mod_cargo_net_s'};registry.get('ships').recomputeEntity(player.id,state.player.ownedShips[0].fittings);await tick();
 const inventoryNode=host.host.domainDiffer.paths.get('player.moduleInventory');
 while((inventoryNode.slot-host.host.domainDiffSeq+60)%60<10)await tick();
 const dom=shipworksDom();globalThis.document=dom.doc;globalThis.window={innerWidth:1920,innerHeight:1080,addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}})};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.setTimeout=()=>1;
 main.render={renderer:{getContext:()=>({isContextLost:()=>true})}};const ring=createSimCommandRing();let seen;
 bus.on('ui:unfitModule',p=>{seen=p;if(MAIN_TO_SIM_BUS_EVENTS.has('ui:unfitModule'))ring.pushBus({emit:'ui:unfitModule',payload:p});});
 for(const name of ['ui:buyShip','ui:setActiveShip']) bus.on(name,p=>{
   if(MAIN_TO_SIM_BUS_EVENTS.has(name))ring.pushBus({emit:name,payload:p});
 });
 stage=createShipStage({state:main,bus,screenMemory:{read:(_screen,key,fallback)=>({mode:'fleet'})[key]??fallback,set(){}}});stage.onShow();
 const slotfield=dom.regions.get('.sx-sw__slotfield'),chooser=dom.regions.get('.sx-sw__chooser');
 const anchor={getAttribute:k=>k==='data-spatial-slot'?String(slot):null,closest:s=>s==='[data-spatial-slot]'?anchor:null};
 await slotfield.fire(anchor);
 assert.match(chooser.innerHTML, /data-unfit/);
 const button={disabled:false,getAttribute:k=>k==='data-unfit'?String(slot):null,closest:s=>s==='[data-unfit]'?button:null};
 installSimCommandSink(()=>{});
 const cues=[];bus.on('audio:cue',p=>cues.push(p.id));
 // The hold fills after the chooser was rendered: the worker's real overflow gate must win.
 assert.equal(addCargo(state,'cmdty_silicate',260),260);
 const refusedClick=chooser.fire(button);const refusedCommands=ring.drain();
 assert.equal(refusedCommands.length,1,'the actual Remove control forwards one intent');
 assert.equal(button.disabled,true,'the decision remains pending until its owner replies');
 assert.equal(cues.includes('sfx_ui_switch_detent'),false,'no success cue before acknowledgement');
 const refused=await tick(refusedCommands);
 for(const event of refused.events||[])bus.emit(event.t,event.p);
 await refusedClick;
 assert.equal(state.player.ownedShips[0].fittings[slot],'mod_cargo_net_s');
 assert.equal(main.player.ownedShips[0].fittings[slot],'mod_cargo_net_s');
 assert.equal(button.disabled,false,'refusal leaves Remove usable');
 assert.ok(stage.el.classList.contains('is-choosing'),'refusal keeps the chooser open');
 assert.ok(cues.includes('ui_deny'));
 assert.ok(refused.events.some(e=>e.t==='module:fitRefused'&&e.p.reason==='cargo_overflow'));
 assert.ok(refused.events.some(e=>e.t==='toast'&&/260 used \/ 250 capacity.*Sell or transfer cargo first/.test(e.p.text)),
   'the real refusal explains the load, capacity and practical remedy');
 assert.equal(removeCargo(state,'cmdty_silicate',20),20);
 const acceptedClick=chooser.fire(button);const acceptedCommands=ring.drain();
 assert.equal(acceptedCommands.length,1);
 const accepted=await tick(acceptedCommands);
 for(const event of accepted.events||[])bus.emit(event.t,event.p);
 await acceptedClick;
 assert.equal(state.player.ownedShips[0].fittings[slot],null);
 assert.equal(main.player.ownedShips[0].fittings[slot],null);
 assert.equal(state.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1);
 assert.equal(main.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1,
   'removed fitting is usable in the main hold in the same reply, even for a cold inventory');
 assert.ok(cues.includes('sfx_ui_switch_detent'));
 assert.equal(state.player.cargo.items.cmdty_silicate,240);
 const saved=registry.get('save').serializeData();
 assert.equal(saved.player.ownedShips[0].fittings[slot],null);
 assert.equal(saved.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1);
 assert.equal(saved.cargo.items.cmdty_silicate,240);
 // Buy the discounted Pelican from the actual rail, then switch to it at this berth.
 const segment=dom.regions.get('.sx-seg'),rail=dom.regions.get('.sx-sw__list'),side=dom.regions.get('.sx-sw__side');
 const mode=(name)=>{const b={getAttribute:k=>k==='data-mode'?name:null};b.closest=s=>s==='[data-mode]'?b:null;return b;};
 await segment.fire(mode('buy'));
 const pelican={parentNode:rail,getAttribute:k=>k==='data-buy'?'ship_pelican':null};
 pelican.closest=s=>s==='[data-fleet], [data-buy]'?pelican:null;
 await rail.fire(pelican);
 const buy=side.querySelector('[data-buyship="ship_pelican"]');
 assert.ok(buy&&!buy.disabled,'earned credits can purchase the displayed Pelican');
 await side.fire(buy);
 const buyReply=await tick(ring.drain());for(const event of buyReply.events||[])bus.emit(event.t,event.p);
 assert.equal(state.player.credits,8000,'the real Helios quote charges 12,000 once');
 assert.equal(main.player.credits,8000);
 assert.equal(state.player.ownedShips[1].defId,'ship_pelican');
 await segment.fire(mode('fleet'));
 const row={parentNode:rail,getAttribute:k=>k==='data-fleet'?'1':null};
 row.closest=s=>s==='[data-fleet], [data-buy]'?row:null;
 await rail.fire(row);
 const activate={disabled:false,getAttribute:k=>k==='data-activate-ship'?'1':null};
 activate.closest=s=>s==='[data-activate-ship]'?activate:null;
 await side.fire(activate);
 const switchReply=await tick(ring.drain());for(const event of switchReply.events||[])bus.emit(event.t,event.p);
 assert.equal(state.player.activeShipIndex,1);assert.equal(main.player.activeShipIndex,1);
 assert.equal(state.player.ownedShips[0].cargo.items.cmdty_silicate,240,'the outgoing hull retains its actual cargo');
 assert.equal(state.player.cargo.items.cmdty_silicate||0,0,'the incoming hold is its own');
 assert.equal(state.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1,'unfitted item keeps its identity');
 const afterSwitch=registry.get('save').serializeData();
 assert.equal(afterSwitch.player.activeShipIndex,1);
 assert.equal(afterSwitch.player.ownedShips[0].cargo.items.cmdty_silicate,240);
 assert.equal(afterSwitch.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1);
 uninstallSimCommandSink();
 registry.get('save')._restore(structuredClone(afterSwitch),'quick');
 assert.equal(state.player.activeShipIndex,1,'Continue restores the purchased hull');
 assert.equal(state.player.ownedShips[0].fittings[slot],null);
 assert.equal(state.player.ownedShips[0].cargo.items.cmdty_silicate,240);
 assert.equal(state.player.moduleInventory.filter(i=>i.instanceId==='mi_earned').length,1);
 assert.equal(state.player.credits,8000);
}finally{uninstallSimCommandSink();stage?.dispose();for(const [k,v] of previous){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}host.shutdown();}
});
