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
function setup(sim) {
 const s=sim.state;s.mode='flight';s.world.currentSectorId='sector_helios_prime';s.simTime=20;
 s.playerId=sim.spawn({type:'ship',isPlayer:true,team:0,pos:{x:0,z:0},radius:10,mass:30,hull:100,data:{}}).id;
 s.player.ownedShips=[{defId:'ship_kestrel',fittings:['mod_drill_amp','mod_mining_laser_s']}];s.player.activeShipIndex=0;
 s.onboarding={active:false,finished:true};
 const owner=sim.registry.get('missions');owner.newGame();const board=owner.ensureBoard('station_helios');
 assert.ok(owner.acceptMission(board.slots.find(m=>m.params?.starterJobId==='starter_hitch').id));
 sim.bus.emit('mining:yield',{minerId:s.playerId,commodityId:'cmdty_ore_iron',qty:2,pos:{x:450,z:0}});
 owner.ensureBoard('station_helios');addCargo(s,'cmdty_ore_iron',3);
}
function openKessler(h) {
 const k=generateContacts('station_helios',h.sim.state).find(c=>c.canonicalKey==='kessler');
 const rail=h.screen.el.querySelector('.sx-bar__rail');const target=h.doc.createElement('button');target.setAttribute('data-contact',k.id);
 for(const fn of rail.listeners.click||[])fn({target,preventDefault(){}});
 const choice=h.stage.buttons.find(b=>b.getAttribute('data-choice')==='helios_47a_file');assert.ok(choice);choice.click();
}

const tick=()=>new Promise(r=>setImmediate(r));
function ready(h) {
 const s=h.sim.state,owner=h.sim.registry.get('missions');
 s.story.beatIndex=1;s.story.flags.contract_47a_payment_withheld=true;
 s.story.campaign47a.stepProgress['0']={completed:['mine','skim','dock']};
 owner.ensureBoard('station_helios');
}
test('mounted current and duplicate B0 track',()=>{const h=mount(setup);try{openKessler(h);const b=h.stage.querySelector('[data-campaign-handoff]');assert.ok(b);const events=[];h.sim.bus.on('ui:pushScreen',e=>events.push(e));b.click();b.click();assert.equal(events.length,1);}finally{h.close();}});
test('hidden cached alloy acceptance cannot emit',async()=>{const h=mount(setup);try{ready(h);openKessler(h);const b=h.stage.querySelector('[data-accept-mission]');assert.ok(b);const events=[];h.sim.bus.on('ui:acceptMission',e=>events.push(e));h.screen.onHide();b.click();await tick();assert.equal(events.length,0);}finally{h.close();}});
test('accepted panel clears after save reload',async()=>{const h=mount(setup);try{ready(h);openKessler(h);const b=h.stage.querySelector('[data-accept-mission]');assert.ok(b);b.click();await tick();assert.match(h.stage.innerHTML,/Accepted and tracked/);h.sim.bus.emit('save:loaded',{});assert.doesNotMatch(h.stage.innerHTML,/Accepted and tracked/);}finally{h.close();}});

test('inflight accept cannot overwrite another answer on same contact',async()=>{const h=mount(setup);try{ready(h);openKessler(h);h.stage.querySelector('[data-accept-mission]').click();const b=h.stage.buttons.find(b=>b.getAttribute('data-choice')==='helios_local_work');assert.ok(b);b.click();const answer=h.stage.querySelector('.sx-talk__reply').textContent;await tick();assert.equal(h.stage.querySelector('.sx-talk__reply').textContent,answer);assert.doesNotMatch(h.stage.innerHTML,/Accepted and tracked/);}finally{h.close();}});
test('inflight accept cannot repopulate reopened desk',async()=>{const h=mount(setup);try{ready(h);openKessler(h);h.stage.querySelector('[data-accept-mission]').click();h.screen.onHide();h.screen.onShow();await tick();assert.doesNotMatch(h.stage.innerHTML,/Accepted and tracked/);}finally{h.close();}});
test('inflight accept cannot repopulate loaded desk',async()=>{const h=mount(setup);try{ready(h);openKessler(h);h.stage.querySelector('[data-accept-mission]').click();h.sim.bus.emit('save:loaded',{});await tick();assert.doesNotMatch(h.stage.innerHTML,/Accepted and tracked/);}finally{h.close();}});

test('changed offer deadline requires renewed consent',async()=>{const h=mount(setup);try{ready(h);openKessler(h);const b=h.stage.querySelector('[data-accept-mission]');const o=h.sim.state.missions.boards.station_helios.slots.find(o=>o.id===b.getAttribute('data-accept-mission'));o.time_limit_s=1;const events=[];h.sim.bus.on('ui:acceptMission',e=>events.push(e));b.click();await tick();assert.equal(events.length,0);}finally{h.close();}});
test('changed offer collateral refuses cached acceptance',async()=>{const h=mount(setup);try{ready(h);openKessler(h);const b=h.stage.querySelector('[data-accept-mission]');const o=h.sim.state.missions.boards.station_helios.slots.find(o=>o.id===b.getAttribute('data-accept-mission'));o.collateral_cr=200;const events=[];h.sim.bus.on('ui:acceptMission',e=>events.push(e));b.click();await tick();assert.equal(events.length,0);}finally{h.close();}});
test('B0 changed recovery suppresses old track action',()=>{const h=mount(setup);try{openKessler(h);const b=h.stage.querySelector('[data-campaign-handoff]');const events=[];h.sim.bus.on('ui:trackMission',e=>events.push(e));h.sim.state.missions.active.find(m=>m.storyTag==='campaign47a:b0:recovery').params.sampleRecovered=true;b.click();assert.equal(events.length,0);}finally{h.close();}});

test('mounted original-copy choice is remembered through canonical contact owner',()=>{const h=mount(setup);try{openKessler(h);const original=h.stage.buttons.find(b=>b.getAttribute('data-choice')==='helios_47a_original');assert.ok(original);original.click();assert.equal(h.sim.state.player.stationContacts.contact_station_helios_kessler.flags.choice_helios_47a_original,true);assert.ok(!h.stage.buttons.some(b=>b.getAttribute('data-choice')==='helios_47a_original'));openKessler(h);assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/You asked me to leave it there/);}finally{h.close();}});
test('mounted alloy acceptance tracks exactly one active assignment',async()=>{const h=mount(setup);try{ready(h);openKessler(h);const b=h.stage.querySelector('[data-accept-mission]'),id=b.getAttribute('data-accept-mission'),events=[];h.sim.bus.on('ui:acceptMission',e=>events.push(e));b.click();b.click();await tick();assert.equal(events.length,1);const active=h.sim.state.missions.active.filter(m=>m.storyTag==='campaign47a:b1:alloy_run'&&m.status==='active');assert.equal(active.length,1);assert.equal(h.sim.state.ui.trackedMissionId,active[0].id);assert.equal(h.sim.state.player.cargo.items.cmdty_alloys,6);}finally{h.close();}});
