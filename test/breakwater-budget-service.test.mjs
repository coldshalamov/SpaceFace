// breakwater-spur.test.mjs — focused candidate checks for the Breakwater Spur
// commission. Covers physical seating and safe refusal, partial restoration
// across Save/Continue, canonical debit, both charters' first jobs, cost and
// progress publication, and destroyed/duplicate-event safety — through the real
// native physics, economy, cargo and npcJobs owners, not stand-ins.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { ensureActivityClassified, refreshPhysicsPartition, requestActivityReclassify } from '../src/world/activityRuntime.js';
import { refreshEntityPhysicsIndex } from '../src/core/coreSystem.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { stationServices } from '../src/systems/stationServices.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { advance as advanceNpcJob } from '../src/systems/npcJobs.js';
import { traffic } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { createBreakwaterSpurSystem } from '../src/features/breakwaterSpur/runtime.js';
import {
  BREAKWATER_SITE_LOCAL, BREAKWATER_POCKET_LOCAL, BREAKWATER_SECTOR_ID,
  BREAKWATER_CARTRIDGES, BREAKWATER_SOCKETS, BREAKWATER_STRUCTURE,
  BREAKWATER_POCKET_DRESSING, BREAKWATER_SUPPLY_LOAD, BREAKWATER_CONSIGNMENT,
  BREAKWATER_PHASE, BREAKWATER_CHARTER, BREAKWATER_COOP_JOBS, BREAKWATER_BONDED,
  BREAKWATER_SEAT_CAPS, breakwaterRecordId,
} from '../src/features/breakwaterSpur/definition.js';
import { createBreakwaterRow, nextActionFor, recomputePhase, recomputeStage } from '../src/features/breakwaterSpur/project.js';
import { normalizeBreakwaterSpurRow } from '../src/features/breakwaterSpur/persistence.js';
import { getBreakwaterSpurStatus, getBreakwaterSpurMapMarkers, buildBreakwaterSpurOffer } from '../src/features/breakwaterSpur/readModel.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { buildSystemModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';

const DT = 1 / 60;
const copy = v => JSON.parse(JSON.stringify(v));
const g2l = p => ({ x: p.x, z: p.z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function fixture() {
  const breakwaterSpur = createBreakwaterSpurSystem();
  const sim = createSimulation({
    seed: 42,
    systems: [ships, cargo, economy, stationServices, npcJobsRuntime, traffic, flightV3, combat, physics, breakwaterSpur],
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = BREAKWATER_SECTOR_ID;
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.ui.docked = false;
  sim.registry.get('ships').newGame();
  const site = sectorLocalToGlobalForSector({ x: BREAKWATER_SITE_LOCAL.x, z: BREAKWATER_SITE_LOCAL.z + 40 }, BREAKWATER_SECTOR_ID);
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: s.player, pos: site, fittings: [] }));
  s.playerId = player.id;
  sim.registry.get('economy').grantCredits(5000, 'breakwater-fixture');
  const owner = sim.registry.get('breakwaterSpur');
  const native = sim.registry.get('physics');
  const offers = [], receipts = [], cues = [], actions = [];
  sim.bus.on('breakwaterSpur:offer', p => offers.push(p));
  sim.bus.on('breakwaterSpur:receipt', p => receipts.push(p));
  sim.bus.on('breakwaterSpur:cue', p => cues.push(p));
  const emit = a => sim.bus.emit('breakwaterSpur:action', typeof a === 'object' ? a : { actionId: a });
  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      s.tick++; s.simTime = s.tick * DT;
      owner.update(DT, s);
      native.update(DT, s);
    }
  }
  const admitted = await native.prepareBackend(s);
  return { sim, s, owner, native, player, offers, receipts, cues, emit, tick, admitted };
}
import { affordableBreakwaterServiceUnits, breakwaterServicePrice } from '../src/features/breakwaterSpur/services.js';
async function berth(credits=10){
 const h=await fixture();h.tick(3);const row=h.s.world.breakwaterSpur;
 // Existing commissioned co-op fixture; construction and charter choice are not skipped by production.
 row.phase='operating';row.charter='cooperative';row.commission.status='paid';
 h.s.player.credits=credits;h.s.fuel={current:0,max:100};row.coop.stock.fuel=40;row.coop.stock.repair=40;
 h.player.hull=h.player.hullMax-40;
 h.choose=async id=>{h.owner._offer();const offer=h.s.breakwaterSpurOffer;const action=offer.actions.find(a=>a.id===id);assert.ok(action,id);h.emit({actionId:id,revision:offer.revision});await Promise.resolve();return action;};
 h.close=()=>{for(const sys of [...h.sim.registry.systems].reverse())sys.destroy?.();h.native._sg02?.dispose?.();h.sim.dispose();};return h;
}
test('actual co-op offer permits an affordable departure refill through its public action',async()=>{
 const h=await berth();try{
 const before=h.s.world.breakwaterSpur.coop.stock.fuel;
 const action=await h.choose('service:fuel:budget');assert.match(action.label,/3 units \/ 9 CR/);
 assert.equal(h.s.fuel.current,3);assert.equal(h.s.player.credits,1);assert.equal(h.s.world.breakwaterSpur.coop.stock.fuel,before-3);
 assert.ok(h.receipts.some(r=>/Fuel drawn/.test(r.text)) || h.s.world.breakwaterSpur.receipts.some(r=>/Fuel drawn/.test(r.text)));
 }finally{h.close();}
});
test('integer affordable quotes use the existing rounded debit and finite stock, including zero funds',()=>{
 for(const kind of ['fuel','repair'])for(const stock of [0,1,2,10,40])for(const balance of [0,.5,1,2,3,8,10,100]){
 const n=affordableBreakwaterServiceUnits(kind,stock,balance);assert.ok(n>=0&&n<=stock);
 if(n)assert.ok(breakwaterServicePrice(kind,n)<=balance);
 if(n<stock)assert.ok(breakwaterServicePrice(kind,n+1)>balance);
 }
});
test('budget action keeps its quoted cap if funds rise and refuses an unaffordable stale debit',async()=>{
 const h=await berth(10);try{
 h.owner._offer();let offer=h.s.breakwaterSpurOffer;h.s.player.credits=100;
 h.emit({actionId:'service:fuel:budget',revision:offer.revision});await Promise.resolve();assert.equal(h.s.fuel.current,3);assert.equal(h.s.player.credits,91);
 h.s.player.credits=10;h.owner._offer();offer=h.s.breakwaterSpurOffer;h.s.player.credits=1;
 const stock=h.s.world.breakwaterSpur.coop.stock.fuel;
 h.emit({actionId:'service:fuel:budget',revision:offer.revision});await Promise.resolve();assert.equal(h.s.fuel.current,3);assert.equal(h.s.player.credits,1);assert.equal(h.s.world.breakwaterSpur.coop.stock.fuel,stock);
 }finally{h.close();}
});
test('hull budget service debits once, preserves cargo and rejects same-offer callback replay',async()=>{
 const h=await berth(10);try{
 const before=h.player.hull,cargoBefore=copy(h.s.player.cargo),row=h.s.world.breakwaterSpur;
 h.owner._offer();const offer=h.s.breakwaterSpurOffer;const off=h.sim.bus.on('credits:changed',()=>h.emit({actionId:'service:repair:budget',revision:offer.revision}));
 h.emit({actionId:'service:repair:budget',revision:offer.revision});await Promise.resolve();off();
 assert.equal(h.player.hull,before+11);assert.equal(h.s.player.credits,0);assert.equal(row.coop.stock.repair,29);assert.deepEqual(h.s.player.cargo,cargoBefore);
 const saved=h.owner.serialize();h.owner.deserialize(copy(saved));assert.equal(h.s.world.breakwaterSpur.coop.stock.repair,29);assert.equal(h.player.hull,before+11);
 }finally{h.close();}
});
test('native pilot approaches the real co-op berth before selecting its partial refill',async()=>{
 const h=await berth(10);try{
 const site=sectorLocalToGlobalForSector(BREAKWATER_SITE_LOCAL,BREAKWATER_SECTOR_ID);
 // Initial approach fixture outside the public action radius, not a completed restoration run.
 const start={x:site.x+200,z:site.z+140},rec=h.native._sg02.records.get(h.player.id);
 rec.body.setTranslation({x:start.x,y:0,z:start.z},true);rec.body.setLinvel({x:0,y:0,z:0},true);
 h.player.pos.set(start.x,0,start.z);h.s.fuel={current:10,max:100};
 h.owner._offer();const old=h.s.breakwaterSpurOffer;h.emit({actionId:'service:fuel:budget',revision:old.revision});await Promise.resolve();assert.equal(h.s.player.credits,10,'outside action range refuses');
 let arrived=false;
 for(let i=0;i<90/DT;i++){
 const dx=h.player.pos.x-site.x;
 h.s.input.moveZ=dx>45?-.12:0;h.s.input.moveX=0;h.s.input.turnIntent=0;h.s.input.brake=dx<40;h.s.input.boost=false;
 h.sim.step(DT);
 if(Math.hypot(h.player.pos.x-site.x,h.player.pos.z-site.z)>149)continue;
 const before=h.s.fuel.current;await h.choose('service:fuel:budget');assert.ok(Math.abs(h.s.fuel.current-before-3)<1e-8);arrived=true;break;
 }
 assert.equal(arrived,true,JSON.stringify({pos:h.player.pos,start,vel:h.player.vel,rot:h.player.rot,fuel:h.s.fuel,mode:h.s.mode}));assert.equal(h.s.player.credits,1);assert.equal(h.s.world.breakwaterSpur.coop.stock.fuel,37);
 console.log(JSON.stringify({nativeBudgetBerth:{seconds:h.s.simTime,travel:Math.hypot(h.player.pos.x-start.x,h.player.pos.z-start.z),fuelPurchased:3,creditsSpent:9}}));
 }finally{h.close();}
});
import { createPromptDeck, setPromptDeck } from '../src/ui/promptDeck.js';
import { createBreakwaterSpurPromptSystem } from '../src/features/breakwaterSpur/presentation.js';

test('crowded co-op renders every action across two bounded menus with Leave and real routing',async()=>{
 const h=await berth(10),previous=globalThis.document,doc=promptDeckDocument(900,900);
 globalThis.document=doc;const deck=createPromptDeck({document:doc,state:h.s,bus:h.sim.bus});setPromptDeck(deck);
 const prompt=createBreakwaterSpurPromptSystem();prompt.init({state:h.s,bus:h.sim.bus});
 const buttons=()=>{const found=[];const walk=n=>{if(n.dataset?.choiceId)found.push(n);for(const c of n.children||[])walk(c);};walk(deck.el);return found;};
 const click=id=>{const rendered=buttons();const index=rendered.findIndex(b=>b.dataset.choiceId===id);assert.ok(index>=0,`rendered ${id}`);doc.dispatch('keydown',{key:String(index+1)});};
 const ids=()=>buttons().map(b=>b.dataset.choiceId);
 try{
 const row=h.s.world.breakwaterSpur;
 for(const role of ['drive','drum'])Object.assign(row.cartridges[role],{status:'seated',hull:50,hullMax:100,damaged:true});
 h.owner._offer();const mainRevision=h.s.breakwaterSpurOffer.revision;
 assert.deepEqual(ids(),['repair:drive','repair:drum','job:scrap','job:supply','job:defend','service:menu','close']);
 click('service:menu');assert.notEqual(h.s.breakwaterSpurOffer.revision,mainRevision);
 assert.deepEqual(ids(),['service:repair','service:repair:budget','service:fuel','service:fuel:budget','service:back','close']);
 h.emit({actionId:'service:fuel:budget',revision:mainRevision});await Promise.resolve();assert.equal(h.s.player.credits,10,'main-page revision cannot authorize service purchase');
 click('service:back');assert.ok(ids().includes('close'));assert.ok(ids().includes('job:defend'));
 click('service:menu');
 const fuelIndex=ids().indexOf('service:fuel:budget');doc.dispatch('keydown',{key:String(fuelIndex+1)});await Promise.resolve();
 assert.equal(h.s.fuel.current,3);assert.equal(h.s.player.credits,1);assert.ok(ids().includes('close'),'refreshed main retains Leave');
 click('close');assert.deepEqual(ids(),[]);assert.equal(h.s.breakwaterSpurOffer,null);
 }finally{prompt.destroy();deck.destroy();setPromptDeck(null);globalThis.document=previous;h.close();}
});

// Existing prompt-deck DOM fixture, copied locally to exercise actual mounted menu routing.
function promptDeckDocument(width, height) {
  const listeners = new Map();
  const make = (tagName) => {
    const node = {
      tagName, id: '', className: '', textContent: '', hidden: false, disabled: false,
      children: [], attrs: {}, dataset: {}, listeners: {}, parentNode: null,
      style: { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } },
      get firstElementChild() { return this.children[0] || null; },
      get lastElementChild() { return this.children.at(-1) || null; },
      get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
      },
      get childElementCount() { return this.children.length; },
      appendChild(child) { detach(child); child.parentNode = this; this.children.push(child); return child; },
      append(...children) { for (const child of children) this.appendChild(child); },
      insertBefore(child, ref) {
        if (child === ref) return child;
        detach(child); child.parentNode = this;
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        return child;
      },
      replaceChildren(...children) { for (const child of [...this.children]) detach(child); this.append(...children); },
      remove() { detach(this); },
      contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
      setAttribute(name, value) { this.attrs[name] = String(value); },
      getAttribute(name) { return this.attrs[name] ?? null; },
      removeAttribute(name) { delete this.attrs[name]; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== fn); },
      click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
    };
    function detach(child) {
      const siblings = child.parentNode?.children;
      const index = siblings?.indexOf(child) ?? -1;
      if (index >= 0) siblings.splice(index, 1);
      child.parentNode = null;
    }
    node.classList = {
      add(...names) { node.className = [...new Set([...node.className.split(/\s+/), ...names])].filter(Boolean).join(' '); },
      remove(...names) { node.className = node.className.split(/\s+/).filter((name) => name && !names.includes(name)).join(' '); },
      contains(name) { return node.className.split(/\s+/).includes(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !node.classList.contains(name) : !!force;
        if (shouldAdd) node.classList.add(name); else node.classList.remove(name);
        return shouldAdd;
      },
    };
    return node;
  };
  const head = make('head');
  const body = make('body');
  body.id = 'ui-root';
  const documentElement = make('html');
  documentElement.classList.add('sf-reduce-motion');
  const viewListeners = new Map();
  const defaultView = {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) { (viewListeners.get(type) || viewListeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { viewListeners.get(type)?.delete(fn); },
  };
  const doc = {
    head, body, documentElement, defaultView,
    createElement: make,
    getElementById(id) {
      if (id === 'ui-root') return body;
      const find = (node) => node.id === id ? node : node.children.map(find).find(Boolean) || null;
      return find(head) || find(body);
    },
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event) { for (const fn of listeners.get(type) || []) fn({ ...event, preventDefault() {}, stopImmediatePropagation() {} }); },
  };
  return doc;
}
