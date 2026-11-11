import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { createRookBooth, rookMarketPadSpec } from '../src/systems/rookBooth.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { cinderPlayerTow, cinderRouteFocus, cinderFieldReport, cinderJournalAction, cinderTowMotion, cinderTowHandling } from '../src/missions/cinderRoute.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';
const SECTOR = 'sector_charon_expanse', PAD = rookPadPosition();

function fixture() {
  const state = createGameState(47), bus = createBus();
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000; state.player.heat = 0;
  let next = 100;
  const helpers = {
    voice: { say: () => true },
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: next++ }); stampOccupantGeneration(state,e);
      state.entities.set(e.id,e); state.entityList.push(e); return e;
    },
    removeEntity(id) { const e=state.entities.get(id); if(e)e.alive=false;state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id); },
    combatPhysics: { createAttachment: () => ({ id: next++ }), cutAttachment: () => true },
  };
  const player=helpers.spawnEntity({type:'ship',isPlayer:true,team:1,pos:PAD,vel:{x:0,z:0},mass:18,radius:12,hull:100,data:{}});
  state.playerId=player.id;
  const owner=Object.create(missions), aftermath=Object.create(aftermathWrecks), rook=createRookBooth();
  const registry={get:name=>({missions:owner,aftermathWrecks:aftermath,rookBooth:rook}[name]||null)};
  owner.init({state,bus,helpers,registry}); aftermath.init({state,bus,helpers,registry}); rook.init({state,bus,helpers,registry});
  const board=owner.ensureBoard('station_tethys');
  const offer=board.slots.find(m=>m.storyTag==='campaign47a:b2:cinder');assert.ok(offer);
  assert.equal(owner.acceptMission(offer.id),true);
  const m=state.missions.active.find(m=>m.storyTag===offer.storyTag);
  state.world.currentSectorId=SECTOR;bus.emit('sector:enter',{sectorId:SECTOR});owner.spawnTargetsForSector(SECTOR);
  assert.equal(m.targetEntityIds.length,3);
  const killer=Object.assign(Object.create(combat),{state,bus,helpers});
  for(const id of [...m.targetEntityIds])killer.kill(state.entities.get(id),state.playerId);
  const hull=aftermath._resolveBoundWreck(m.params.cinderMarkedWrecks[0].markerId);assert.ok(hull);
  ensureCombatState(state);
  const service=createAttachmentService({state,bus,helpers,catalog:createCombatCatalog()});
  function attach(body=hull) {
    const result=service.create({defId:'tether_standard',ownerId:player.id,targetId:body.id});assert.equal(result.ok,true,JSON.stringify(result));
    const a=result.attachment || service.get(result.attachmentId);
    assert.ok(a);
    state.player.tether={active:true,targetId:body.id,attachmentId:a.id};return a;
  }
  const a=attach();state.ui.trackedMissionId=m.id;
  function read(){owner.update(1/60,state);return flightDestinationSurface(state,resolveFlightObjectiveCommand(state)).line;}
  return {state,bus,owner,aftermath,rook,player,hull,m,a,service,attach,read,helpers,killer};
}



const QUIET = rookMarketPadSpec('quietline').pos;
function swing(h, pos = {x:PAD.x-800,z:PAD.z}) {
  h.hull.pos={...pos};h.player.pos={x:pos.x-100,z:pos.z};
  h.player.vel={x:0,z:0};h.hull.vel={x:0,z:50};
}
function sceneLines(h) {const lines=[];h.bus.on('comms:popup',p=>{if(p.id.startsWith('cinder_receiving_'))lines.push(p);});return lines;}

test('readout separates absolute hull speed, tug speed and real center-line relative sideways motion',()=>{
 const h=fixture();swing(h);assert.deepEqual(cinderTowMotion(h.state,h.hull),{hullSpeed:50,tugSpeed:0,radialRelativeSpeed:0,swingSpeed:50});
 assert.equal(cinderTowHandling(h.state,h.hull).kind,'swing');assert.match(cinderTowHandling(h.state,h.hull).text,/stopped tug does not stop.*Short reeling/);
 h.player.vel={x:30,z:40};h.hull.vel={x:30,z:40};assert.equal(cinderTowMotion(h.state,h.hull).swingSpeed,0);assert.equal(cinderTowHandling(h.state,h.hull).kind,'approach');
});

test('rotating the line or translating both velocities preserves relative decomposition',()=>{
 const h=fixture();h.player.pos={x:0,z:0};h.hull.pos={x:0,z:100};h.player.vel={x:7,z:11};h.hull.vel={x:57,z:14};
 const m=cinderTowMotion(h.state,h.hull);assert.equal(m.swingSpeed,50);assert.equal(m.radialRelativeSpeed,3);
 h.hull.pos={x:100,z:0};h.player.vel={x:11,z:7};h.hull.vel={x:14,z:57};const r=cinderTowMotion(h.state,h.hull);assert.equal(r.swingSpeed,50);assert.equal(r.radialRelativeSpeed,3);
});

test('unknown or coincident physical evidence cannot manufacture a handling direction',()=>{
 for(const change of [h=>h.hull.pos.x=NaN,h=>h.hull.vel.z=Infinity,h=>h.player.vel.x=NaN,h=>h.hull.alive=false,h=>h.player.alive=false,h=>h.hull.pos={...h.player.pos}]) {
  const h=fixture();swing(h);change(h);assert.equal(cinderTowMotion(h.state,h.hull),null);assert.equal(cinderTowHandling(h.state,h.hull),null);
 }
});

test('fractional excess is visible while actual slow hull is never refused by relative motion',()=>{
 const h=fixture();swing(h,{x:PAD.x+50,z:PAD.z});h.hull.vel.z=8.04;
 assert.match(cinderTowHandling(h.state,h.hull).text,/8.1 WU\/s/);assert.match(h.read(),/SIDEWAYS AROUND TUG 8.1/);
 h.hull.vel.z=8;h.player.vel.z=100;assert.equal(cinderTowHandling(h.state,h.hull),null);
 assert.match(h.read(),/Inside and slow enough/);h.rook.update(1/60,h.state);assert.equal(h.m.status,'completed');
});

test('WANTED refusal outranks helpful handling and neither projection mutates owner state',()=>{
 const h=fixture();swing(h,{x:PAD.x+50,z:PAD.z});h.state.player.heat=.2;
 const before=JSON.stringify({m:h.m,credits:h.state.player.credits,heat:h.state.player.heat,hull:h.hull,player:h.player,flags:h.state.story.flags});
 const focus=cinderRouteFocus(h.m,h.state);assert.match(focus.reason,/ROOK REFUSES WHILE WANTED.*SIDEWAYS AROUND TUG/);assert.doesNotMatch(focus.reason,/hold for Rook/);
 assert.match(cinderJournalAction(h.state).body,/stopped tug does not stop.*Rook refuses delivery while WANTED/);
 assert.equal(JSON.stringify({m:h.m,credits:h.state.player.credits,heat:h.state.player.heat,hull:h.hull,player:h.player,flags:h.state.story.flags}),before);
});

test('real receiving owner warns about the swing before the ordinary crowded-apron scene',()=>{
 const h=fixture(),lines=sceneLines(h);swing(h);const before={credits:h.state.player.credits,hull:h.hull.hull,pos:{...h.hull.pos},vel:{...h.hull.vel}};
 h.rook.update(1/60,h.state);assert.equal(lines.length,1);assert.match(lines[0].id,/_handling_swing$/);assert.match(lines[0].text,/Hull 50.0 WU\/s; tug 0.0/);
 for(let i=0;i<30;i++)h.rook.update(1/60,h.state);assert.equal(lines.length,1);
 assert.deepEqual({credits:h.state.player.credits,hull:h.hull.hull,pos:{...h.hull.pos},vel:{...h.hull.vel}},before);assert.equal(h.m.status,'active');
});

test('terms stay first, later acquired swing speaks once, then Quiet still requires actual slow arrival',()=>{
 const h=fixture(),lines=sceneLines(h),sales=[];h.bus.on('rookWreck:delivered',p=>sales.push(p));
 h.hull.pos={x:QUIET.x+180,z:QUIET.z};h.player.pos={x:QUIET.x+230,z:QUIET.z};h.hull.vel={x:-12,z:0};h.player.vel={x:0,z:0};
 h.rook.update(1/60,h.state);assert.equal(lines.length,1);assert.match(lines[0].text,/no Rook delivery slip.*Slow the whole tow/);
 h.hull.vel={x:0,z:50};h.rook.update(1/60,h.state);assert.equal(lines.length,2);assert.match(lines[1].id,/_handling_swing$/);
 h.rook.update(1/60,h.state);assert.equal(lines.length,2);
 h.hull.pos={...QUIET};h.rook.update(1/60,h.state);assert.equal(sales.length,0);assert.equal(h.hull.alive,true);
 h.hull.vel={x:0,z:7.9};h.rook.update(1/60,h.state);assert.equal(sales.length,1);assert.equal(sales[0].standId,'quietline');assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);
});

test('actual save serialization preserves warning memory; later new warning does not replay the old one',async()=>{
 const {save}=await import('../src/save/saveSystem.js');const h=fixture();swing(h);h.rook.update(1/60,h.state);
 const flags=save._serializeMissions.call({state:h.state}).story.flags;
 const g=fixture(),lines=sceneLines(g);g.state.story.flags=structuredClone(flags);swing(g);g.rook.update(1/60,g.state);assert.equal(lines.length,0);
 g.hull.pos={x:QUIET.x+180,z:QUIET.z};g.player.pos={x:QUIET.x+230,z:QUIET.z};g.rook.update(1/60,g.state);assert.equal(lines.length,1);assert.match(lines[0].id,/_quiet$/);assert.doesNotMatch(lines[0].text,/stopped tug does not stop/);
});

test('unowned, remote, restored-in-progress and unmeasured tows cannot produce the early warning',()=>{
 for(const change of [h=>h.a.targetGeneration='stale',h=>h.state.player.tether.active=false,h=>h.state.save={restoring:true},h=>h.state.ui.docked=true,h=>h.state.run.kind='swarm',h=>h.state.world.currentSectorId='sector_ceres_belt',h=>h.hull.vel.z=NaN,h=>{swing(h,{x:PAD.x-1400,z:PAD.z});}]) {
  const h=fixture(),lines=sceneLines(h);swing(h);change(h);h.rook.update(1/60,h.state);assert.equal(lines.length,0);
 }
});

// Actual production listener and DOM construction coverage. This is a minimal
// document fixture, not browser geometry, pixels or a rendered-play assertion.
import { createComms } from '../src/ui/comms.js';
import { createToasts } from '../src/ui/toasts.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
function makeNode(tagName = 'div') {
  const node = {
    tagName: String(tagName).toUpperCase(),
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    isConnected: true,
    children: [],
    parentNode: null,
    dataset: {},
    attributes: {},
    listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) {
      if (!child) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, ref) {
      child.parentNode = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
      return child;
    },
    append(...kids) { for (const kid of kids) this.appendChild(kid); },
    prepend(child) { return this.insertBefore(child, this.children[0] || null); },
    removeChild(child) {
      this.children = this.children.filter((entry) => entry !== child);
      child.parentNode = null;
      return child;
    },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'id') this.id = String(value);
      if (name === 'class') this.className = String(value);
      if (name === 'hidden') this.hidden = true;
    },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
    addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      this.listeners[name] = (this.listeners[name] || []).filter((entry) => entry !== fn);
    },
    dispatchEvent(event) {
      for (const fn of this.listeners[event && event.type] || []) fn(event);
      return true;
    },
    querySelector(selector) {
      this.queries = this.queries || {};
      if (!this.queries[selector]) { const child = makeNode('div'); this.queries[selector] = child; this.appendChild(child); }
      return this.queries[selector];
    },
    contains(child) { return child === this || this.children.some(n => n.contains?.(child)); },
    querySelectorAll() { return []; },
    closest() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    focus() {},
    click() { for (const fn of this.listeners.click || []) fn({ target: this, preventDefault() {}, stopPropagation() {} }); },
  };
  let htmlText = '';
  Object.defineProperty(node, 'innerHTML', {get(){return htmlText;},set(value){htmlText=String(value);this.children=[];}});
  node.classList = {
    add(...names) { node.className = [...node.className.split(/\s+/), ...names].filter(Boolean).join(' '); },
    remove(...names) { node.className = node.className.split(/\s+/).filter((n) => n && !names.includes(n)).join(' '); },
    toggle(name, force) {
      const has = node.className.split(/\s+/).includes(name);
      const want = force === undefined ? !has : !!force;
      if (want && !has) node.classList.add(name);
      if (!want && has) node.classList.remove(name);
      return want;
    },
    contains(name) { return node.className.split(/\s+/).includes(name); },
  };
  return node;
}

function installDom() {
  const previous = globalThis.document;
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const head = makeNode('head');
  const body = makeNode('body');
  const html = makeNode('html');
  const uiRoot = makeNode('div');
  uiRoot.id = 'ui-root';
  body.appendChild(uiRoot);
  const doc = {
    head,
    body,
    documentElement: html,
    activeElement: body,
    createElement: makeNode,
    createElementNS: (_namespace, tagName) => makeNode(tagName),
    createDocumentFragment: () => makeNode('fragment'),
    getElementById(id) {
      const visit = (node) => {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of node.children || []) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(head) || visit(body);
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
  };
  uiRoot.ownerDocument = doc;
  body.ownerDocument = doc;
  head.ownerDocument = doc;
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return {
    doc,
    restore() {
      if (previous === undefined) delete globalThis.document; else globalThis.document = previous;
      if (previousRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = previousRaf;
      if (previousCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = previousCancel;
    },
  };
}

function textOf(node, out = []) {
  if (typeof node.textContent === 'string' && node.textContent) out.push(node.textContent);
  for (const child of node.children || []) textOf(child, out);
  return out.join(' ');
}

function liveRows(feed) {
  return feed.children.filter((row) => !row.classList.contains('sf-comm--out'));
}

function liveText(feed) {
  return liveRows(feed).map((row) => textOf(row)).join(' ');
}


function mountReceivingPresenters(h, job = '') {
 const dom=installDom();dom.doc.body.dataset.sfHudJob=job;
 const hud=makeNode(),root=makeNode(),live=makeNode();hud.id='hud';root.id='toasts';live.id='toast-live';
 dom.doc.body.appendChild(hud);hud.appendChild(root);root.appendChild(live);
 globalThis.requestAnimationFrame=fn=>{fn();return 0;};
 const main=createBus(),wire=[];
 const comms=createComms({bus:main,state:h.state}),toasts=createToasts({bus:main,state:h.state});
 const offs=['toast','comms:popup'].map(type=>h.bus.on(type,payload=>{
  const projected=projectBridgeEvent(type,payload);assert.equal(projected.dropped,false);
  const flat=structuredClone(projected.flat);wire.push({type,payload:flat});main.emit(type,flat);
 }));
 return {dom,root,live,comms,wire,destroy(){for(const off of offs)off();toasts.destroy();comms.destroy();dom.restore();}};
}
function htmlTree(node) {return [node.innerHTML||'',node.textContent||'',...(node.children||[]).map(htmlTree)].join(' ');}

test('real Adventure listeners show one bridged mechanical warning and retain full detail in LOG',()=>{
 const h=fixture();swing(h);const p=mountReceivingPresenters(h);
 try {
  h.rook.update(1/60,h.state);
  assert.equal(p.dom.doc.getElementById('sf-comms').children.length,0,'narrative feed stays off the flight glass');
  assert.equal(p.live.textContent,'Intake cannot accept this swing: slow the load outside the rings');
  const cards=()=>p.root.children.filter(n=>n.classList.contains('sf-toast'));
  assert.equal(cards().length,1);assert.equal(cards()[0].classList.contains('sf-toast--in'),true);
  const full=p.wire.find(r=>r.type==='comms:popup').payload;assert.equal(full.storyReceipt,true);
  assert.equal(p.dom.doc.getElementById('sf-comm-backlog-btn').classList.contains('sf-comm-backlog-btn--pulse'),true);
  p.comms.openBacklog();assert.match(htmlTree(p.dom.doc.getElementById('sf-comm-backlog')),/Hull 50.0 WU\/s; tug 0.0.*stopped tug does not stop/);
  const count=p.wire.length;h.rook.update(1/60,h.state);assert.equal(p.wire.length,count);assert.equal(cards().length,1);assert.doesNotMatch(htmlTree(cards()[0]),/×2/);
 } finally {p.destroy();}
});

test('real combat and hurt receipt lanes retain the actionable speed refusal without prose over flight',()=>{
 for(const job of ['fight','hurt']) {
  const h=fixture();swing(h);const p=mountReceivingPresenters(h,job);
  try {h.rook.update(1/60,h.state);assert.match(p.live.textContent,/Intake cannot accept this swing/);assert.equal(p.dom.doc.getElementById('sf-comms').children.length,0);}
  finally {p.destroy();}
 }
});

test('real receiving listeners retain WANTED priority and Quiet contract consequence',()=>{
 for(const quiet of [false,true]) {
  const h=fixture();h.state.player.heat=.2;
  swing(h,quiet?{x:QUIET.x+180,z:QUIET.z}:{x:PAD.x+220,z:PAD.z});const p=mountReceivingPresenters(h,'fight');
  try {h.rook.update(1/60,h.state);assert.match(p.live.textContent,quiet?/Quiet Line pays.*without Rook contract credit/:/Rook refuses WANTED.*preserve/);
   p.comms.openBacklog();assert.match(htmlTree(p.dom.doc.getElementById('sf-comm-backlog')),quiet?/no Rook delivery slip/:/pad stays dark/);
   assert.equal(h.hull.alive,true);assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);
  } finally {p.destroy();}
 }
});
