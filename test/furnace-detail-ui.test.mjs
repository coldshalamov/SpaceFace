import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { furnaceWorksiteFocus } from '../src/missions/furnaceWorksite.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// Mount the production controller. This small DOM models its text, focus and scroll calls,
// not a browser's CSS geometry. Actual compact geometry has a separate browser regression.
function mount(setup) {
  const saved = Object.fromEntries(['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].map(k => [k, globalThis[k]]));
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
        : selector.startsWith('[') && node.hasAttribute(selector.slice(1, -1));
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
      return null;
    };
    node.querySelectorAll = selector => {
      if (selector.includes('[data-choice]') || selector === '.sx-choice') return node.buttons || [];
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
        const item = doc.createElement('button'); item.setAttribute(match[1], match[2] || ''); item.textContent = match[3]; node.appendChild(item); selectors.set('[' + match[1] + ']', item);
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
  globalThis.getComputedStyle = node => ({ position: node.style.position || 'static' });
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const sim = createSimulation({ seed: 4242, systems: [missions, economy, cargo, stationContacts], updateOrder: [] });
  sim.state.ui.docked = true; sim.state.ui.dockedStationId = 'station_helios';
  setup?.(sim);
  const ctx = { state: sim.state, bus: sim.bus };
  const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  return { doc, sim, ctx, screen, stage, frames,
    close() { screen.dispose(); sim.dispose(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

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

function choose(h, kind) {
  return h.stage.buttons.find(b => b.getAttribute('data-choice').startsWith(`furnace_detail:${kind}:`));
}
function open(h, id = 'contact_station_ceres_0') {
  const rail = h.screen.el.querySelector('.sx-bar__rail');
  const button = h.doc.createElement('button');
  button.setAttribute('data-contact', id); rail.appendChild(button); button.click();
}
const said = h => h.stage.querySelector('.sx-talk__reply')?.textContent || '';

test('tracking the local Furnace job confirms its name and leaves its instructions on the waypoint', () => {
  const h = mount(setup);
  try {
    h.sim.state.ui.docked = false;
    h.sim.state.missions.active[0].title = 'Furnace Detail';
    const notices = [];
    h.sim.bus.on('toast', event => notices.push(event.text));
    h.sim.bus.emit('ui:trackMission', { missionId: 'furnace-ui' });
    assert.equal(h.sim.state.ui.trackedMissionId, 'furnace-ui');
    assert.match(h.sim.state.nav.waypoint.reason, /marked repair-mite sites/);
    assert.deepEqual(notices.filter(line => line.startsWith('Tracking:')), ['Tracking: Furnace Detail']);
  } finally { h.close(); }
});

test('Furnace flight cues show progress, the usable controls and the next action', () => {
  const h = mount(setup);
  try {
    const state = h.sim.state;
    const job = state.missions.active[0];
    const hint = () => furnaceWorksiteFocus(job, state).reason;
    job.objectiveProgress = 2;
    state.bombs = { rack: { cells: [{ id: 'bomb_frag', count: 1 }] } };
    state.settings.gameplay.powerFire = 'hold';
    assert.equal(hint(), '2/4 marked repair-mite sites clear. Use Frag from the east. Hold Bomb. Dashes warn of a mite moving clear. Double rings warn of Casket damage.');
    state.settings.gameplay.powerFire = 'press';
    state.bombs.rack.cells[0].count = 0;
    assert.equal(hint(), '2/4 marked repair-mite sites clear. Use Frag from the east. Keep Caskets clear. Reload Frag at Tethys or Helios.');

    job.objectiveProgress = 4;
    job.params.furnaceFeeds = 1;
    job.params.furnaceLosses = 1;
    const [received, lost, pending] = job.params.furnaceLots;
    received.received = true;
    lost.lost = true;
    assert.equal(hint(), '1/3 pods received · 1 lost. Tow from the current marked load position or hail CR-FEED.');
    const held = h.sim.spawn({ type: 'payload', pos: { ...pending.pos }, flags: { tethered: true } });
    pending.entityId = held.id;
    assert.equal(hint(), '1/3 pods received · 1 lost. Release the pod into the amber ring.');
  } finally { h.close(); }
});

test('the Ceres host reads the live slip in one line and opens the Mission Log once', () => {
  const h = mount(setup);
  try {
    open(h);
    assert.ok(choose(h, 'read'));
    assert.ok(choose(h, 'log'));
    choose(h, 'read').click();
    assert.match(said(h), /sealed one/);
    assert.match(said(h), /0\/4 sites, 0\/3 pods, 0 lost/);
    const events = [];
    h.sim.bus.on('ui:trackMission', e => events.push(['track', e]));
    h.sim.bus.on('ui:pushScreen', e => events.push(['push', e]));
    choose(h, 'log').click();
    assert.equal(events.length, 2);
    assert.equal(events[0][0], 'track'); assert.equal(events[0][1].missionId, 'furnace-ui');
    assert.equal(events[1][0], 'push'); assert.equal(events[1][1].id, 'missionLog');
    // Nothing else was written: no cargo, no credits, no ledger change.
    assert.equal(h.sim.state.missions.active[0].params.furnaceLots.filter(l => l.received).length, 0);
  } finally { h.close(); }
});

test('hidden, stale-ledger, changed-contact and undocked controls cannot issue navigation', () => {
  for (const change of ['hide', 'ledger', 'contact', 'undock']) {
    const h = mount(setup);
    try {
      open(h);
      const button = choose(h, 'log');
      const events = [];
      h.sim.bus.on('ui:trackMission', e => events.push(e));
      h.sim.bus.on('ui:pushScreen', e => events.push(e));
      if (change === 'hide') h.screen.onHide();
      if (change === 'ledger') h.sim.state.missions.active[0].params.furnaceLots[0].lost = true;
      if (change === 'contact') {
        const other = generateContacts('station_ceres', h.sim.state).find(c => c.id !== 'contact_station_ceres_0');
        if (other) open(h, other.id);
      }
      if (change === 'undock') h.sim.state.ui.docked = false;
      button.click();
      assert.equal(events.length, 0, change);
    } finally { h.close(); }
  }
});

test('a slip answer dies on save transition and on screen swap; the settled record reads once', () => {
  const h = mount(setup);
  try {
    open(h);
    choose(h, 'read').click();
    assert.match(said(h), /0\/3 pods/);
    h.sim.bus.emit('save:restoring', {});
    assert.doesNotMatch(said(h), /0\/3 pods/);
    h.sim.bus.emit('save:loaded', {});
    open(h);
    choose(h, 'read').click();
    assert.match(said(h), /0\/3 pods/);
    h.screen.onHide();
    h.screen.onShow();
    assert.doesNotMatch(said(h), /0\/3 pods/);
    // Settled aftermath: one honest line, the log opens without a tracking intent.
    const s = h.sim.state;
    const m = s.missions.active[0];
    m.status = 'completed';
    s.missions.active = [];
    s.missions.receipts = [{ id: 'furnace-ui:completed', missionId: 'furnace-ui', outcome: 'completed',
      type: 'patrol_clear', factionId: 'faction_dmc', destStationId: 'station_ceres',
      destSectorId: 'sector_ceres_belt', at_s: 20, rewardCr: 4200 }];
    s.world.alienEcology.sites.closed_refinery.deadFauna = {
      'closed_refinery:suture_mite:0': true, 'closed_refinery:suture_mite:1': true,
      'closed_refinery:suture_mite:2': true, 'closed_refinery:suture_mite:3': true };
    s.missions.furnaceWorksiteAftermath = { version: 1, missionId: 'furnace-ui',
      lots: [0, 1, 2].map(slot => ({ slot, pos: { x: 1, z: 1 }, hull: 220, received: true, lost: false })) };
    // Re-selecting the same contact early-returns, so swap the screen to re-render
    // the choices against the settled record.
    h.screen.onHide();
    h.screen.onShow();
    const events = [];
    h.sim.bus.on('ui:trackMission', e => events.push(e));
    h.sim.bus.on('ui:pushScreen', e => events.push(e));
    choose(h, 'read').click();
    assert.match(said(h), /3\/3 received, 0 lost, 4200 cr/);
    choose(h, 'log').click();
    assert.equal(events.length, 1); // push only — a settled detail has nothing to track
    assert.equal(events[0].id, 'missionLog');
  } finally { h.close(); }
});
