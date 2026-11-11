import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { buildReply, generateContacts } from '../src/ui/station/barContacts.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// Mount the production controller. This small DOM models its text, focus and scroll calls,
// not a browser's CSS geometry. Actual compact geometry has a separate browser regression.
function mount(setup) {
  const saved = Object.fromEntries(['document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
  const doc = fakeDom(), make = doc.createElement, frames = new Map(); let frameId = 0;
  const unescape = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  doc.createElement = tag => {
    const node = make(tag.toUpperCase()); node.ownerDocument = doc; node.isConnected = true;
    node.hidden = false; node.offsetWidth = 260; node.clientHeight = 180; node.scrollTop = 0;
    node.style.removeProperty = () => {}; node.style.getPropertyValue = () => '';
    node.hasAttribute = key => node.getAttribute(key) != null;
    node.removeEventListener = (name, fn) => { node.listeners[name] = (node.listeners[name] || []).filter(item => item !== fn); };
    node.getBoundingClientRect = () => ({ left: 0, right: 260, top: 0, bottom: 180, width: 260, height: 180 });
    node.contains = other => node === other || node.children.some(child => child.contains(other));
    node.removeChild = child => { node.children = node.children.filter(c => c !== child); child.parentNode = null; };
    node.remove = () => node.parentNode?.removeChild(node);
    node.replaceChildren = (...children) => { node.children = []; node.append(...children); };
    node.scrollIntoView = options => { node.lastScroll = options; };
    node.closest = selector => {
      const matches = selector.startsWith('.') ? node.classList.contains(selector.slice(1))
        : selector.startsWith('[') && node.hasAttribute(selector.slice(1,-1));
      return matches ? node : node.parentNode?.closest(selector) || null;
    };
    node.focus = () => {
      doc.activeElement = node;
      for (let parent = node; parent; parent = parent.parentNode) for (const fn of parent.listeners.focusin || []) fn({ target: node });
    };
    node.click = () => {
      for (let parent = node; parent; parent = parent.parentNode) for (const fn of parent.listeners.click || []) fn({ target: node, preventDefault() {}, stopPropagation() {} });
    };
    const selectors = new Map(); let html = '';
    node.querySelector = selector => {
      if (selectors.has(selector)) return selectors.get(selector);
      if (selector === '.sx-choice') return node.buttons?.[0] || null;
      if (selector === '.sx-talk__reply.is-said') return selectors.get('.sx-talk__reply')?.classList.contains('is-said') ? selectors.get('.sx-talk__reply') : null;
      return null;
    };
    node.querySelectorAll = selector => {
      if (selector.includes('[data-choice]') || selector === '.sx-choice') return node.buttons || [];
      if (selector === '.sx-choice.is-current') return (node.buttons || []).filter(b => b.classList.contains('is-current'));
      return [];
    };
    node.insertAdjacentElement = (_where, child) => node.parentNode?.appendChild(child);
    Object.defineProperty(node, 'innerHTML', { get: () => html, set(value) {
      html = value; selectors.clear(); node.children = []; node.buttons = [];
      for (const name of ['sx-bar__hang', 'sx-bar__rail', 'sx-bar__stage', 'sx-bar__leads', 'sx-talk', 'sx-talk__id', 'sx-talk__choices']) {
        if (!value.includes(name)) continue;
        const item = doc.createElement('div'); item.className = name; node.appendChild(item); selectors.set(`.${name}`, item);
      }
      for (const match of value.matchAll(/<(p|h2) class="([^"]+)"[^>]*>([^<]*)<\/(?:p|h2)>/g)) {
        const item = doc.createElement(match[1]); item.className = match[2]; item.textContent = unescape(match[3]); node.appendChild(item);
        for (const name of match[2].split(' ')) selectors.set(`.${name}`, item);
      }
      for (const match of value.matchAll(/<button[^>]*(data-campaign-handoff|data-accept-mission|data-open-mission-log)(?:="([^"]*)")?[^>]*>([^<]*)<\/button>/g)) {
        const item = doc.createElement('button'); item.setAttribute(match[1], match[2] || ''); item.textContent=match[3]; node.appendChild(item); selectors.set('['+match[1]+']',item);
      }
      if (/<button[^>]*data-first-shift-market/.test(value)) {
        const item = doc.createElement('button'); item.setAttribute('data-first-shift-market', '');
        item.textContent = 'Review iron at Market'; node.appendChild(item); selectors.set('[data-first-shift-market]', item);
      }
      for (const match of value.matchAll(/<button[^>]*class="([^"]*)"[^>]*data-choice="([^"]+)"([^>]*)>([^<]*)<\/button>/g)) {
        const item = doc.createElement('button'); item.className = match[1]; item.setAttribute('data-choice', match[2]);
        item.disabled = / disabled/.test(match[3]); item.textContent = unescape(match[4]); node.appendChild(item); node.buttons.push(item);
      }
    } });
    return node;
  };
  doc.documentElement = doc.createElement('html'); doc.body = doc.createElement('body');
  doc.querySelector = () => null; doc.querySelectorAll = () => [];
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  globalThis.document = doc; globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const sim = createSimulation({ seed: 4242, systems: [missions, economy, cargo, stationContacts], updateOrder: [] });
  sim.state.ui.docked = true; sim.state.ui.dockedStationId = 'station_helios';
  setup?.(sim);
  const ctx = { state: sim.state, bus: sim.bus }; const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  const key = (target, key) => { let prevented = false; for (const fn of stage.listeners.keydown) fn({ target, key, preventDefault() { prevented = true; } }); return prevented; };
  return { doc, sim, ctx, screen, stage, key, frames,
    close() { screen.dispose(); sim.dispose(); for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}


import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo } from '../src/systems/cargo.js';


import { setupState } from './cinder-departure-conversation.test.mjs';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
function setup(sim) { setupState(sim.state, 2); }
function choose(h, kind) { return h.stage.buttons.find(b => b.getAttribute('data-choice').startsWith(`cinder_departure:${kind}:`)); }
function open(h, id='contact_station_ceres_0') { const rail=h.screen.el.querySelector('.sx-bar__rail'),button=h.doc.createElement('button');button.setAttribute('data-contact',id);rail.appendChild(button);button.click(); }

test('mounted Ceres next scene reveals current consequences and sets exactly one real course',()=>{
 const h=mount(setup);try{open(h);choose(h,'next').click();assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/2\/3 pods received.*250 cr unpaid/);
 const events=[];h.sim.bus.on('ui:setCourse',e=>events.push(e));choose(h,'desk').click();assert.equal(events.length,1);assert.equal(events[0].stationId,'station_tethys');
 assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/two different stops/);
 }finally{h.close();}
});
test('mounted Rook relay shows the real offer through ordinary mission-offer presentation',()=>{
 const h=mount(sim=>{setup(sim);sim.state.world.currentSectorId='sector_tethys_junction';sim.state.ui.dockedStationId='station_tethys';
 const offer=buildMissionBoardContract(2,{seed:4242,epoch:0,state:sim.state});sim.state.missions.boards.station_tethys={slots:[offer]};});
 try{open(h,'contact_station_tethys_rook');choose(h,'offer').click();assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/700 cr contract pay.*100-WU/);
 assert.equal(h.sim.state.missions.active.length,0,'reading does not accept');
 }finally{h.close();}
});
test('hidden, stale fine, changed-contact, restored and undocked controls never act',()=>{
 for(const change of ['hide','fine','contact','restore','undock']){const h=mount(setup);try{open(h);const button=choose(h,'desk'),events=[];h.sim.bus.on('ui:setCourse',e=>{if(e.source==='station-bar:ceres-cinder')events.push(e)});
 if(change==='hide')h.screen.onHide();if(change==='fine')h.sim.state.lawSecurity.composed['warrant:wanted:station_ceres:scan'].remainingCr=200;
 if(change==='contact')open(h,generateContacts('station_ceres',h.sim.state).find(c=>c.id!=='contact_station_ceres_0').id);
 if(change==='restore'){h.sim.bus.emit('save:restoring',{});h.sim.bus.emit('save:loaded',{});}
 if(change==='undock')h.sim.state.ui.docked=false;button.click();assert.equal(events.length,0,change);
 }finally{h.close();}}
});
test('reply is immediately readable and does not survive a synchronous departure or Save/Continue',()=>{
 for(const transition of ['hide','restore']){const h=mount(setup);try{open(h);choose(h,'next').click();assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/250 cr unpaid/);
 if(transition==='restore'){h.sim.bus.emit('save:restoring',{});h.sim.bus.emit('save:loaded',{});assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply').textContent,/250 cr unpaid/);}
 else{h.sim.bus.on('ui:setCourse',()=>h.screen.onHide());choose(h,'desk').click();h.screen.onShow();assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply').textContent,/two different stops/);}
 }finally{h.close();}}
});

for (const change of ['current', 'remove-offer', 'terms', 'undock', 'restore', 'audio-terms', 'audio-hide', 'refresh-terms']) {
 test(`Cinder acceptance lifecycle: ${change}`, async()=>{
  const h=mount(sim=>{setup(sim);sim.state.world.currentSectorId='sector_tethys_junction';sim.state.ui.dockedStationId='station_tethys';
   const offer=buildMissionBoardContract(2,{seed:4242,epoch:0,state:sim.state});sim.state.missions.boards.station_tethys={slots:[offer]};});
  try {
   open(h,'contact_station_tethys_rook');choose(h,'offer').click();
   const b=h.stage.querySelector('[data-accept-mission]');assert.ok(b);
   const events=[];h.sim.bus.on('ui:acceptMission',e=>events.push(e));
   const board=h.sim.state.missions.boards.station_tethys;
   if(change==='remove-offer')board.slots=[];
   if(change==='terms'||change==='refresh-terms')board.slots[0].reward_cr=1;
   if(change==='undock')h.sim.state.ui.docked=false;
   if(change==='restore'){h.sim.bus.emit('save:restoring',{});h.sim.bus.emit('save:loaded',{});}
   if(change==='audio-terms')h.sim.bus.on('audio:cue',e=>{if(e.id==='ui_accept')board.slots[0].reward_cr=1;});
   if(change==='audio-hide')h.sim.bus.on('audio:cue',e=>{if(e.id==='ui_accept')h.screen.onHide();});
   if(change==='refresh-terms'||change==='remove-offer'){
    h.sim.bus.emit('stationContact:changed',{});
    assert.equal(h.stage.querySelector('[data-accept-mission]'),null,'refresh must remove stale acceptance');
   }
   b.click();await Promise.resolve();await Promise.resolve();
   assert.equal(events.length,change==='current'?1:0);
  } finally {h.close();}
 });
}

// Independent review regression: a popup subscriber may end the visit before the
// reply and its ownership flags are cached. Reopening must not resurrect it.
for (const transition of ['hide', 'hide-reopen', 'restore', 'contact']) {
 test(`Cinder posting popup respects reentrant ${transition}`,()=>{
  const h=mount(sim=>{setup(sim);sim.state.world.currentSectorId='sector_tethys_junction';sim.state.ui.dockedStationId='station_tethys';
   const offer=buildMissionBoardContract(2,{seed:4242,epoch:0,state:sim.state});sim.state.missions.boards.station_tethys={slots:[offer]};});
  try {
   open(h,'contact_station_tethys_rook');
   h.sim.bus.on('comms:popup',e=>{
    if(!e.id?.startsWith('bar-lead:'))return;
    if(transition==='hide'||transition==='hide-reopen')h.screen.onHide();
    if(transition==='hide-reopen')h.screen.onShow();
    if(transition==='restore'){h.sim.bus.emit('save:restoring',{});h.sim.bus.emit('save:loaded',{});}
    if(transition==='contact')open(h,generateContacts('station_tethys',h.sim.state).find(c=>c.id!=='contact_station_tethys_rook').id);
   });
   choose(h,'offer').click();
   if(transition==='hide')h.screen.onShow();
   for(const refreshed of [false,true]) {
    if(refreshed)h.screen.refresh();
    assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply')?.textContent||'',/prints Rook’s current posting/);
    assert.equal(h.stage.querySelector('[data-accept-mission]'),null,'ended visit has no cached offer');
   }
   assert.equal(h.sim.state.missions.active.length,0,'reading does not accept');
  } finally {h.close();}
 });
}
