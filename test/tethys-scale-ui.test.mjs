import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { FURNACE_MITE_KEYS } from '../src/missions/furnaceWorksite.js';
import { furnaceDetailRead } from '../src/missions/furnaceArrivalScene.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// The packet names this file for the Tethys desk conversation; the conversation that
// actually landed is Rook's Cinder desk relay (PRI-10e) and its settled-return account
// at Expanse. These tests mount the production bar screen and prove the minted rail
// row, the signature-bound choices, the Ceres host's pointer, and the real posting's
// own accept path — all through the contact list and clicks a player sees.

const TETHYS = 'station_tethys', CERES = 'station_ceres', EXPANSE = 'station_expanse';
const TETHYS_SECTOR = 'sector_tethys_junction', CERES_SECTOR = 'sector_ceres_belt', EXPANSE_SECTOR = 'sector_charon_expanse';

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
      for (const parent of [node, ...parents(node)]) for (const fn of parent.listeners.click || []) fn({ target: node, preventDefault() {}, stopPropagation() {} });
      function* parents(n) { for (let p = n.parentNode; p; p = p.parentNode) yield p; }
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
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  const sim = createSimulation({ seed: 6008, systems: [missions, economy, cargo, stationContacts], updateOrder: [] });
  sim.state.playerId = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: {} }).id;
  setup?.(sim);
  const ctx = { state: sim.state, bus: sim.bus }; const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  return { doc, sim, ctx, screen, stage, frames,
    close() { screen.dispose(); sim.dispose(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

// The same record the conversation's own unit test settles: the filed furnace slip,
// the unpaid Ceres scan fine, and beat 2. The desk reads only this record — it does
// not mint the mission, the fine, or the receipts itself.
function cinderRecord(s, received = 3) {
  s.mode = 'flight'; s.run = { kind: 'adventure' }; s.simTime = 100;
  s.ui.docked = true; s.ui.dockedStationId = CERES; s.world.currentSectorId = CERES_SECTOR;
  s.story = { beatIndex: 2, flags: { contract_47a_payment_withheld: true }, campaign47a: createCampaign47aState() };
  s.story.campaign47a.stepProgress['2'] = { completed: [], updatedAtS: 100 };
  s.missions = { nextId: 1, completedLog: [], active: [], boards: {}, receipts: [{ id: 'furnace:completed', missionId: 'furnace',
    outcome: 'completed', type: 'patrol_clear', factionId: 'faction_dmc', destStationId: CERES,
    destSectorId: CERES_SECTOR, at_s: 100, rewardCr: received * 160 }], furnaceWorksiteAftermath: {
    version: 1, missionId: 'furnace', lots: [0, 1, 2].map(slot => ({ slot, pos: { x: 1, z: 1 }, hull: 220,
      received: slot < received, lost: slot >= received })) } };
  const deadFauna = Object.fromEntries(FURNACE_MITE_KEYS.map(key => [key, true]));
  for (let i = 0; i < 3; i++) deadFauna[`closed_refinery:casket_worm:${i}`] = true;
  s.world.alienEcology = { sites: { closed_refinery: { deadFauna } } };
  const key = 'warrant:wanted:station_ceres:scan';
  s.lawSecurity = { composed: { [key]: { key, kind: 'warrant', causeId: 'wanted:station_ceres:scan', status: 'open', remainingCr: 250 } } };
  s.player.heat = 0.2; s.player.credits = 1223;
  assert.equal(furnaceDetailRead(s)?.settled, true, 'fixture must leave a genuinely settled furnace slip');
}

function postCinderBoard(s) {
  const offer = buildMissionBoardContract(2, { seed: 6008, epoch: 0, state: s });
  assert.ok(offer, 'the board owner posts a real Cinder contract for this record');
  s.missions.boards[TETHYS] = { slots: [offer] };
  return offer;
}
function atTethys(s) { s.ui.dockedStationId = TETHYS; s.world.currentSectorId = TETHYS_SECTOR; return postCinderBoard(s); }
function settleCinder(s) {
  s.story.campaign47a.stepProgress['2'].completed.push('cinder_board');
  s.story.campaign47a.receipts = [{ kind: 'step_progress', beatIndex: 2, stepId: 'cinder_board',
    signal: 'mission:completed', atSimTime: 100, completionMethod: 'clearance_only' }];
  s.missions.receipts.push({ id: 'cinder-m-1:completed', missionId: 'cinder-m-1', outcome: 'completed',
    type: 'patrol_clear', source: 'campaign47a.embodied', stationId: TETHYS, destStationId: EXPANSE,
    destSectorId: EXPANSE_SECTOR, at_s: 100, rewardCr: 0 });
}
const open = (h, id) => {
  const rail = h.screen.el.querySelector('.sx-bar__rail'), button = h.doc.createElement('button');
  button.setAttribute('data-contact', id); rail.appendChild(button); button.click();
};
const reply = h => h.stage.querySelector('.sx-talk__reply')?.textContent || '';
const choice = (h, prefix) => h.stage.buttons.find(b => (b.getAttribute('data-choice') || '').startsWith(prefix));
const flush = () => new Promise(r => setTimeout(r, 0));

test('mounted Tethys bar lists Rook only while the real Cinder record stands, and the posting accepts through the rail', async () => {
  const h = mount(sim => { cinderRecord(sim.state); atTethys(sim.state); });
  try {
    const rook = generateContacts(TETHYS, h.sim.state).find(c => c.id === 'contact_station_tethys_rook');
    assert.ok(rook, 'the desk relay mints a rail row only while its receipts and board stand');
    assert.match(rook.line, /desk relay/);
    assert.equal(generateContacts(TETHYS, h.sim.state).filter(c => c.id === rook.id).length, 1, 'no duplicate relay row');
    open(h, rook.id);
    const read = choice(h, 'cinder_departure:read:'); assert.ok(read, 'the read choice is rendered');
    read.click();
    assert.match(reply(h), /DMC recorded 480 cr for 3 received pods|Their book, not mine/);
    const offer = choice(h, 'cinder_departure:offer:'); assert.ok(offer, 'the offer choice is rendered');
    offer.click();
    assert.match(reply(h), /700 cr contract pay|exact posting/);
    const accept = h.stage.querySelector('[data-accept-mission]'); assert.ok(accept, 'the posting renders its own Accept + track');
    const intents = []; h.sim.bus.on('ui:acceptMission', e => intents.push(e));
    accept.click(); await flush();
    assert.equal(intents.length, 1, 'the accept button emits the real board intent');
    assert.ok(h.sim.state.missions.active.some(m => m.storyTag === 'campaign47a:b2:cinder'),
      'the missions owner accepted the genuine posting');
    assert.match(reply(h), /Accepted \+ tracked/);
  } finally { h.close(); }
});

test('the minted relay row fails closed with its record — undocked, restored, or ambiguous', () => {
  for (const mutate of [
    s => s.ui.docked = false,
    s => s.save = { restoring: true },
    s => s.story.beatIndex = 3,
    s => s.missions.boards[TETHYS].slots.push({ ...s.missions.boards[TETHYS].slots[0] }),
    s => s.story.campaign47a.stepProgress['2'].completed.push('cinder_board'),
  ]) {
    const h = mount(sim => { cinderRecord(sim.state); atTethys(sim.state); });
    try {
      mutate(h.sim.state);
      assert.equal(generateContacts(TETHYS, h.sim.state).some(c => c.id === 'contact_station_tethys_rook'), false);
    } finally { h.close(); }
  }
});

test('the Ceres host carries the same record — a pointer to the Tethys desk, never an invented posting', () => {
  const h = mount(sim => cinderRecord(sim.state));
  try {
    const host = generateContacts(CERES, h.sim.state).find(c => c.id === 'contact_station_ceres_0');
    assert.ok(host, 'the authored Ceres host is on the rail');
    assert.ok(host.choices.some(c => c.id.startsWith('cinder_departure:next:')), 'its choices carry the stamped story row');
    open(h, host.id);
    const courses = []; h.sim.bus.on('ui:setCourse', e => courses.push(e));
    choice(h, 'cinder_departure:next:').click();
    assert.match(reply(h), /Rook is posting Cinder work at Tethys/);
    assert.equal(courses.length, 0, 'the ledger answer marks nothing');
    choice(h, 'cinder_departure:desk:').click();
    assert.equal(courses.length, 1, 'the desk choice plots the authored Tethys berth');
    assert.equal(courses[0].stationId, TETHYS); assert.equal(courses[0].sectorId, TETHYS_SECTOR);
    assert.equal(courses[0].autopilot, false);
    assert.match(reply(h), /two different stops/);
    assert.equal(generateContacts(CERES, h.sim.state).some(c => c.canonicalKey === 'rook'), false,
      'no relay row is invented at Ceres');
  } finally { h.close(); }
});

test('a choice minted for one record cannot answer or accept for a different one', async () => {
  const h = mount(sim => { cinderRecord(sim.state); atTethys(sim.state); });
  try {
    open(h, 'contact_station_tethys_rook');
    choice(h, 'cinder_departure:offer:').click();
    const accept = h.stage.querySelector('[data-accept-mission]'); assert.ok(accept);
    const intents = []; h.sim.bus.on('ui:acceptMission', e => intents.push(e));
    h.sim.state.missions.boards[TETHYS].slots = [];
    accept.click(); await flush();
    assert.equal(intents.length, 0, 'a stale offer cannot sign a contract that no longer stands');
    assert.match(reply(h), /posting changed|Ask again/);
    const events = []; h.sim.bus.on('ui:setCourse', e => events.push(e));
    h.sim.state.ui.dockedStationId = CERES; h.sim.state.world.currentSectorId = CERES_SECTOR;
    h.screen.refresh();
    open(h, 'contact_station_ceres_0');
    const stale = choice(h, 'cinder_departure:desk:'); assert.ok(stale);
    const live = stale.getAttribute('data-choice');
    h.sim.state.lawSecurity.composed['warrant:wanted:station_ceres:scan'].status = 'paid';
    const stamped = h.doc.createElement('button'); stamped.setAttribute('data-choice', live);
    h.stage.appendChild(stamped); stamped.click();
    assert.equal(events.length, 0, 'the old signature fires no navigation intent');
    assert.doesNotMatch(reply(h), /Tethys Trade Hub|marked your chart/);
  } finally { h.close(); }
});

test('a settled cinder_board opens Rook’s closed account at Expanse through the same rail', () => {
  const h = mount(sim => {
    cinderRecord(sim.state); settleCinder(sim.state);
    sim.state.ui.dockedStationId = EXPANSE; sim.state.world.currentSectorId = EXPANSE_SECTOR;
  });
  try {
    const rook = generateContacts(EXPANSE, h.sim.state).find(c => c.id === 'contact_station_expanse_rook');
    assert.ok(rook, 'the settled account has its own rail row at the receiving ring');
    assert.match(rook.line, /Lane clear|delivery column empty|desk relay/);
    open(h, rook.id);
    const pushes = []; h.sim.bus.on('ui:pushScreen', e => pushes.push(e));
    choice(h, 'cinder_departure:return_account:').click();
    assert.match(reply(h), /No hull in my book|closed at zero contract pay/);
    choice(h, 'cinder_departure:return_journal:').click();
    assert.deepEqual(pushes, [{ id: 'missionLog', source: 'station-bar:cinder-return' }],
      'the journal choice opens the Mission Log through the real intent');
    assert.match(reply(h), /Follow what is open/);
    const before = JSON.stringify([h.sim.state.missions, h.sim.state.player.credits]);
    choice(h, 'cinder_departure:return_compost:').click();
    assert.match(reply(h), /feed|loose wreck|free pod/);
    assert.equal(JSON.stringify([h.sim.state.missions, h.sim.state.player.credits]), before,
      'the account pays nothing again and grants no material');
  } finally { h.close(); }
});
