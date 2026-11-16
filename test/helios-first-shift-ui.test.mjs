import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { buildReply, generateContacts } from '../src/ui/station/barContacts.js';
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
  const sim = createSimulation({ seed: 4242, systems: [missions, economy, cargo], updateOrder: [] });
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
 const owner=sim.registry.get('missions');const board=owner.ensureBoard('station_helios');
 assert.ok(owner.acceptMission(board.slots.find(m=>m.params?.starterJobId==='starter_hitch').id));
 sim.bus.emit('mining:yield',{minerId:s.playerId,commodityId:'cmdty_ore_iron',qty:2,pos:{x:450,z:0}});
 owner.ensureBoard('station_helios');addCargo(s,'cmdty_ore_iron',3);
}
function openKessler(h) {
 const k=generateContacts('station_helios',h.sim.state).find(c=>c.canonicalKey==='kessler');
 const rail=h.screen.el.querySelector('.sx-bar__rail');const target=h.doc.createElement('button');target.setAttribute('data-contact',k.id);
 for(const fn of rail.listeners.click||[])fn({target,preventDefault(){}});
 const choice=h.stage.buttons.find(b=>b.getAttribute('data-choice')==='helios_local_work');assert.ok(choice);choice.click();
}
test('mounted Kessler renders paid return, routes held iron without selling, and rejects stale/hidden slips',()=>{
 const h=mount(setup);try{
 openKessler(h);assert.match(h.stage.innerHTML,/Review iron at Market/);
 assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/420 cr paid/);
 assert.match(h.stage.querySelector('.sx-talk__reply').textContent,/3u free iron/);
 const currentAction=h.stage.querySelector('[data-first-shift-market]');assert.ok(currentAction);
 const nav=[];h.sim.bus.on('station:navigate',e=>nav.push(e));
 const before=JSON.stringify([h.sim.state.player,h.sim.state.missions]);currentAction.click();
 assert.deepEqual(nav,[{destination:'market',options:{tradeMode:'sell',commodityId:'cmdty_ore_iron'}}]);
 assert.equal(JSON.stringify([h.sim.state.player,h.sim.state.missions]),before);
 removeCargo(h.sim.state,'cmdty_ore_iron',1);currentAction.click();
 assert.equal(nav.length,1);assert.match(h.stage.innerHTML,/hold or ticket changed/);assert.doesNotMatch(h.stage.innerHTML,/Review iron at Market/);
 openKessler(h);assert.match(h.stage.innerHTML,/Review iron at Market/);const hiddenAction=h.stage.querySelector('[data-first-shift-market]');h.screen.onHide();hiddenAction.click();assert.equal(nav.length,1);
 h.screen.onShow();assert.doesNotMatch(h.stage.innerHTML,/Review iron at Market/);
 }finally{h.close();}
});

import { createMarketScreen } from '../src/ui/station/screens/market.js';
import { TRADE_EXPECTATION_KEY } from '../src/ui/station/tradeReceipt.js';
import { installDom } from './helpers/mini-dom.mjs';

// The real Market screen on the shared test DOM: onShow's iron handoff must win over a
// cached lot and must never steal the selection back from an unresolved trade.
function marketState() {
  return {
    simTime: 0,
    ui: { dockedStationId: 'station_helios' },
    player: { credits: 0, cargo: { items: { cmdty_ore_copper: 5, cmdty_ore_iron: 3 }, capVolume: 100, usedVolume: 8 } },
    economy: { markets: {} },
  };
}
function openMarket(state) {
  const emitted = [];
  const screen = createMarketScreen({ state, bus: { emit: (...a) => emitted.push(a), on: () => () => {}, off: () => {} } });
  document.body.appendChild(screen.el);
  return { state, screen, emitted };
}
function marketSelection(h) {
  const active = h.screen.el.querySelector('.sx-mkt-row.is-active');
  return {
    selectedId: active && active.getAttribute('data-cmdty'),
    qty: Number(h.screen.el.querySelector('.sx-qty__in').value),
    mode: h.screen.el.querySelector('[data-mode="sell"].is-on') ? 'sell' : 'buy',
  };
}
function marketOpened(h) {
  return h.emitted.filter(e => e[0] === 'economy:marketOpened');
}
test('Market onShow honors iron handoff over cached/non-iron held lot', () => {
  const dom = installDom();
  try {
    const presets = [
      // a fresh screen — nothing selected yet
      () => {},
      // a cached Sell session resting on copper
      (h) => {
        h.screen.onShow({ state: h.state, tradeMode: 'sell' });
        h.screen.el.querySelector('[data-cmdty="cmdty_ore_copper"]').click();
        h.screen.onHide();
      },
      // a cached Buy session resting on iron
      (h) => { h.screen.onShow({ state: h.state, tradeMode: 'buy', commodityId: 'cmdty_ore_iron' }); h.screen.onHide(); },
    ];
    for (const preset of presets) {
      const state = marketState();
      const h = openMarket(state);
      preset(h);
      h.emitted.length = 0;
      h.screen.onShow({ state, tradeMode: 'sell', commodityId: 'cmdty_ore_iron' });
      const sel = marketSelection(h);
      assert.equal(sel.selectedId, 'cmdty_ore_iron');
      assert.equal(sel.mode, 'sell');
      assert.equal(sel.qty, 3);
      assert.deepEqual(marketOpened(h), [['economy:marketOpened', { stationId: 'station_helios' }]]);
      h.screen.dispose();
    }
  } finally { dom.restore(); }
});
test('Market onShow does not replace an unresolved trade with iron handoff', () => {
  const dom = installDom();
  try {
    for (const side of ['buy', 'sell']) {
      const state = marketState();
      const expectation = { intentId: 'pending-1', commodityId: 'cmdty_ore_copper', side, qty: 2, total: 24, stationId: 'station_helios', atSimTime: 0, status: 'pending', transport: 'main' };
      state.ui[TRADE_EXPECTATION_KEY] = expectation;
      const h = openMarket(state);
      h.emitted.length = 0;
      h.screen.onShow({ state, tradeMode: 'sell', commodityId: 'cmdty_ore_iron' });
      const sel = marketSelection(h);
      assert.equal(sel.selectedId, 'cmdty_ore_copper');
      assert.equal(sel.mode, side);
      assert.equal(sel.qty, 2);
      assert.equal(state.ui[TRADE_EXPECTATION_KEY], expectation, 'the unresolved trade keeps its own expectation');
      assert.deepEqual(marketOpened(h), [['economy:marketOpened', { stationId: 'station_helios' }]]);
      h.screen.dispose();
    }
  } finally { dom.restore(); }
});
