import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { isChoiceECourierReady } from '../src/story/endings/eligibility.js';
import { story as storyPrototype } from '../src/systems/story.js';
import { buildReply, generateContacts, getChoices } from '../src/ui/station/barContacts.js';

const ASHCACHE = 'station_ashcache';

function makeHarness(seed = 4720) {
  const state = createGameState(seed);
  state.mode = 'station';
  state.simTime = 1400;
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.ownedShips = [{ defId: 'ship_bastion' }];
  state.factions.faction_mts = { rep: ENDGAME_REP_MIN, aggro: false };
  state.story.beatIndex = 7;
  state.story.branch = 'traders';
  state.story.flags = {
    endgame: true,
    deep_reach_operation_complete: true,
    ashfall_visited: true,
    deep_reach_ashfall_docked: true,
    kurtz_desk_opened: true,
  };
  state.story.endgameOffered = true;
  state.story.endgameChoice = null;
  state.story.endgameResolved = false;
  state.story.endgameDeclined = ['A', 'B', 'C', 'D'];
  state.story.endgamePending = null;
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.ui.dockedStationId = ASHCACHE;
  state.claims = { bodies: [{ id: 'claim_choice_e' }] };

  const bus = createBus();
  const story = Object.assign({}, storyPrototype);
  const missions = {
    postEndgameDispositionOffers() { return false; },
    clearEndgameDispositionOffers() { return false; },
  };
  const registry = { get: (name) => (name === 'story' ? story : (name === 'missions' ? missions : null)) };
  const events = [];
  for (const name of ['economy:grantCredits', 'endgame:chosen']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  story.init({ state, bus, registry, helpers: { voice: { say: () => true } } });
  return { state, bus, story, events, ctx: { state, bus, registry } };
}

import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { fakeDom } from './helpers/fake-dom.mjs';
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
  const sim = makeHarness(); sim.dispose = () => {};
  sim.state.ui.docked = true; sim.state.ui.dockedStationId = 'station_ashcache';
  setup?.(sim);
  const ctx = { state: sim.state, bus: sim.bus }; const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  const key = (target, key) => { let prevented = false; for (const fn of stage.listeners.keydown) fn({ target, key, preventDefault() { prevented = true; } }); return prevented; };
  return { doc, sim, ctx, screen, stage, key, frames,
    close() { screen.dispose(); sim.dispose(); for (const [key,value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}



const reply = h => h.stage.querySelector('.sx-talk__reply')?.textContent || '';
function review(h) { const button = h.stage.buttons.find(b => b.getAttribute('data-choice') === 'accept_next_run'); assert.ok(button); button.click(); }
function open(h,id) { const rail=h.screen.el.querySelector('.sx-bar__rail'),button=h.doc.createElement('button');button.setAttribute('data-contact',id);rail.appendChild(button);button.click(); }
test('mounted courier shows a completion receipt after delayed E confirmation',()=>{
 const h=mount();try {review(h); assert.match(reply(h),/Nothing is filed until you confirm/); assert.equal(h.sim.state.story.endgameChoice,null);
 h.sim.bus.emit('ui:endgameConfirm',{choice:'E'});h.screen.refresh();assert.equal(h.sim.state.story.endgameChoice,'E');assert.match(reply(h),/47-A closed/);assert.doesNotMatch(reply(h),/Nothing is filed/);
 }finally{h.close();}
});
for(const lifecycle of ['hide','load','contact','contact-return','dispose']) test('mounted courier does not publish a late receipt after '+lifecycle,()=>{
 const h=mount();try {review(h);
 if(lifecycle==='hide') h.screen.onHide();
 if(lifecycle==='load') h.sim.bus.emit('save:restoring',{});
 if(lifecycle==='contact' || lifecycle==='contact-return') open(h,'contact_station_ashcache_0');
 if(lifecycle==='contact-return') open(h,'contact_ashcache_next_run_courier');
 if(lifecycle==='dispose') h.screen.dispose();
 const before=reply(h); h.sim.bus.emit('ui:endgameConfirm',{choice:'E'});
 assert.doesNotMatch(reply(h),/47-A closed/); if(lifecycle==='dispose') assert.equal(reply(h),before);
 }finally{h.close();}
});
