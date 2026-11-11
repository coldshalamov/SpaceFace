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


import { returnState } from './cinder-return-conversation.test.mjs';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
function setup(sim) { returnState(sim.state); }
function choose(h, kind) { return h.stage.buttons.find(b => b.getAttribute('data-choice').startsWith(`cinder_departure:${kind}:`)); }
function open(h, id='contact_station_ceres_0') { const rail=h.screen.el.querySelector('.sx-bar__rail'),button=h.doc.createElement('button');button.setAttribute('data-contact',id);rail.appendChild(button);button.click(); }


test('mounted Rook return reads the paid receipt and marks only the outside-mouth approach',()=>{
 const h=mount(setup);try{open(h,'contact_station_expanse_rook');choose(h,'return_account').click();
 assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/700 cr in contract pay/);
 assert.equal(h.stage.querySelector('.sx-talk__reply').lastScroll.block,'nearest');
 const events=[];h.sim.bus.on('ui:setCourse',e=>events.push(e));choose(h,'return_garden').click();
 assert.equal(events.length,1);assert.equal(events[0].autopilot,false);assert.equal(events[0].stationId,null);
 assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/Marked, not flown/);
 assert.equal(h.sim.state.player.credits,1415);
 }finally{h.close();}
});
for(const boundary of ['hide','undock','receipt','growth','contact','restore'])test(`mounted return rejects old button after ${boundary}`,()=>{
 const h=mount(setup);try{open(h,'contact_station_expanse_rook');const b=choose(h,'return_garden'),events=[];
 h.sim.bus.on('ui:setCourse',e=>events.push(e));
 if(boundary==='hide')h.screen.onHide();
 if(boundary==='undock')h.sim.state.ui.docked=false;
 if(boundary==='receipt')h.sim.state.missions.receipts[0].rewardCr=701;
 if(boundary==='growth')h.sim.state.story.campaign47a.stepProgress['2'].completed.push('compost');
 if(boundary==='contact')open(h,generateContacts('station_expanse',h.sim.state).find(c=>c.id!=='contact_station_expanse_rook').id);
 if(boundary==='restore')h.sim.state.save={restoring:true};
 b.click();assert.equal(events.length,0);
 }finally{h.close();}
});
test('mounted synchronous conversation interruption cannot navigate from the old return',()=>{
 const h=mount(setup);try{open(h,'contact_station_expanse_rook');const events=[];
 h.sim.bus.on('ui:setCourse',e=>events.push(e));h.sim.bus.on('ui:talkContact',()=>h.screen.onHide());
 choose(h,'return_garden').click();assert.equal(events.length,0);
 }finally{h.close();}
});
