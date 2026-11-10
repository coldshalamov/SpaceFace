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
  const s = sim.state;
  s.mode = 'flight'; s.simTime = 30; s.world.currentSectorId = 'sector_ceres_belt';
  s.ui.dockedStationId = 'station_ceres'; s.story.flags = {};
  s.world.alienEcology = { sites: { closed_refinery: { deadFauna: {} } } };
  s.missions.active = [{ id: 'furnace-ui', status: 'active', type: 'patrol_clear',
    storyTag: 'campaign47a:b1:infested', destStationId: 'station_ceres', destSectorId: 'sector_ceres_belt',
    objectiveTarget: 4, objectiveProgress: 0, params: { furnaceWorksiteVersion: 1, furnaceFeedsNeeded: 3,
      furnaceLots: [0, 1, 2].map(slot => ({ slot, pos: { x: 1, z: 1 }, hull: 220, received: false, lost: false })) } }];
}
function choose(h, kind) { return h.stage.buttons.find(b => b.getAttribute('data-choice').startsWith(`furnace_detail:${kind}:`)); }
function open(h, id = 'contact_station_ceres_0') {
  const rail = h.screen.el.querySelector('.sx-bar__rail'), button = h.doc.createElement('button');
  button.setAttribute('data-contact', id); rail.appendChild(button); button.click();
}

test('mounted Ceres host reads current disposal record and opens the real Mission Log once', () => {
  const h = mount(setup);
  try {
    open(h); assert.equal(choose(h, 'read').textContent, 'My Line is rated for 20 t. Those pods are 40 t.'); choose(h, 'read').click();
    assert.match(h.stage.querySelector('.sx-talk__reply').textContent, /Jorah.*not his ship.*0\/3 pods received/);
    const events = []; h.sim.bus.on('ui:trackMission', e => events.push(e));
    h.sim.bus.on('ui:pushScreen', e => { events.push(e); h.screen.onHide(); });
    choose(h, 'log').click();
    assert.equal(events.length, 2); assert.equal(events[0].missionId, 'furnace-ui'); assert.equal(events[1].id, 'missionLog');
    h.screen.onShow(); assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply').textContent, /Mission Log has your/);
  } finally { h.close(); }
});

test('hidden, stale, changed-contact and undocked Ceres controls cannot issue navigation', () => {
  for (const change of ['hide', 'ledger', 'contact', 'undock']) {
    const h = mount(setup);
    try {
      open(h); const button = choose(h, 'log'), events = [];
      h.sim.bus.on('ui:trackMission', e => events.push(e)); h.sim.bus.on('ui:pushScreen', e => events.push(e));
      if (change === 'hide') h.screen.onHide();
      if (change === 'ledger') h.sim.state.missions.active[0].params.furnaceLots[0].lost = true;
      if (change === 'contact') open(h, generateContacts('station_ceres', h.sim.state).find(c => c.id !== 'contact_station_ceres_0').id);
      if (change === 'undock') h.sim.state.ui.docked = false;
      button.click(); assert.equal(events.length, 0, change);
    } finally { h.close(); }
  }
});

test('Ceres reply clears on Save/Continue and cannot commit across synchronous lifecycle changes', () => {
  for (const transition of ['restore', 'reopen', 'contact']) {
    const h = mount(setup);
    try {
      open(h); choose(h, 'read').click();
      assert.match(h.stage.querySelector('.sx-talk__reply').textContent, /0\/3 pods received/);
      h.sim.bus.emit('save:restoring', {});
      assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply').textContent, /0\/3 pods received/);
      h.sim.bus.emit('save:loaded', {}); open(h);
      let count = 0;
      h.sim.bus.on('ui:pushScreen', () => {
        count++;
        if (transition === 'restore') { h.sim.bus.emit('save:restoring', {}); h.sim.bus.emit('save:loaded', {}); }
        if (transition === 'reopen') { h.screen.onHide(); h.screen.onShow(); }
        if (transition === 'contact') open(h, generateContacts('station_ceres', h.sim.state).find(c => c.id !== 'contact_station_ceres_0').id);
      });
      choose(h, 'log').click(); assert.equal(count, 1);
      assert.doesNotMatch(h.stage.querySelector('.sx-talk__reply').textContent, /Mission Log has your/);
    } finally { h.close(); }
  }
});

