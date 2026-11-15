import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { fakeDom } from './helpers/fake-dom.mjs';

// The packet's desk/hail row for the Helios hand-off: the conversation reader was
// proven in helios-campaign-handoff.test.mjs; this file proves the player-facing half
// — the real choices render on the mounted bar screen, and the hand-off/accept
// buttons ride the screen's own pending machinery through real clicks.

const HOME = 'station_helios', SECTOR = 'sector_helios_prime';
const FILE = 'helios_47a_file', ORIGINAL = 'helios_47a_original';

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
  const sim = createSimulation({ seed: 79319, systems: [missions, economy, cargo, stationContacts], updateOrder: [] });
  sim.state.playerId = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: {} }).id;
  const bag = {};
  setup?.(sim, bag);
  const ctx = { state: sim.state, bus: sim.bus }; const screen = createBarScreen(ctx); screen.onShow();
  const stage = screen.el.querySelector('.sx-bar__stage');
  return { doc, sim, bag, ctx, screen, stage, frames,
    close() { screen.dispose(); sim.dispose(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

// The same record the reader test drives: the marked asteroid is field-bound so the
// source exposure is real, the first paid shift settles through the missions owner,
// and the B0 recovery is live in state — nothing here is a flag minted for the bar.
function setup(sim, bag) {
  const s = sim.state; s.mode = 'flight'; s.simTime = 20; s.world.currentSectorId = SECTOR;
  bag.asteroid = sim.spawn({ type: 'asteroid', pos: { x: 180, z: -60 }, radius: 20, mass: 30, hull: 100,
    data: { typeId: 'ast_common_rock', oreHP: 200, fieldId: 'f_helios_starter', asteroidSlotId: 'f_helios_starter:assay', homeSectorId: SECTOR } });
  s.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_drill_amp', 'mod_mining_laser_s'] }]; s.player.activeShipIndex = 0;
  s.onboarding = { active: false, finished: true }; s.settings.gameplay.tutorialHints = false;
  const owner = sim.registry.get('missions'); owner.newGame();
  bag.b0 = s.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery'); assert.ok(bag.b0);
  const posting = owner.ensureBoard(HOME).slots.find(m => m.params?.starterJobId === 'starter_hitch');
  assert.ok(owner.acceptMission(posting.id));
  bag.first = s.missions.active.find(m => m.params?.starterJobId === 'starter_hitch'); assert.ok(bag.first);
}
const dock = h => { const s = h.sim.state; s.ui.docked = true; s.ui.dockedStationId = HOME; s.player.flags = { ...s.player.flags, docked: true }; };
const paid = h => { const s = h.sim.state; h.sim.bus.emit('mining:yield', { minerId: s.playerId, commodityId: 'cmdty_ore_iron', qty: 2, pos: { x: 450, z: 0 } });
  assert.equal(h.bag.first.status, 'completed'); h.sim.registry.get('missions').ensureBoard(HOME); dock(h); h.screen.refresh(); };
const receive = h => { const s = h.sim.state; h.sim.bus.emit('mining:yield', { minerId: s.playerId, commodityId: 'cmdty_ore_iron', qty: 1, pos: { ...h.bag.asteroid.pos } });
  assert.equal(h.bag.b0.params.sampleRecovered, true); h.sim.bus.emit('dock:docked', { stationId: HOME }); dock(h);
  assert.equal(s.story.beatIndex, 1); h.sim.registry.get('missions').ensureBoard(HOME); h.screen.refresh(); };
const open = (h, id) => {
  const rail = h.screen.el.querySelector('.sx-bar__rail'), button = h.doc.createElement('button');
  button.setAttribute('data-contact', id); rail.appendChild(button); button.click();
};
const openKessler = h => open(h, generateContacts(HOME, h.sim.state).find(c => c.canonicalKey === 'kessler').id);
const reply = h => h.stage.querySelector('.sx-talk__reply')?.textContent || '';
const choice = (h, id) => h.stage.buttons.find(b => b.getAttribute('data-choice') === id);
const flush = () => new Promise(r => setTimeout(r, 0));

test('mounted Kessler hides the 47-A file until the paid shift, then hands off through real clicks', () => {
  const h = mount(setup); try {
    dock(h); h.screen.refresh(); openKessler(h);
    assert.equal(choice(h, FILE), undefined, 'no file before the paid shift settles');
    paid(h); openKessler(h);
    const file = choice(h, FILE); assert.ok(file, 'the real receipts put the file on the desk');
    file.click();
    assert.match(reply(h), /not another iron quota/);
    const handoff = h.stage.querySelector('[data-campaign-handoff]'); assert.ok(handoff, 'the reply carries its action button');
    const tracks = [], pushes = [];
    h.sim.bus.on('ui:trackMission', e => tracks.push(e)); h.sim.bus.on('ui:pushScreen', e => pushes.push(e));
    handoff.click();
    assert.deepEqual(tracks, [{ missionId: h.bag.b0.id }], 'the hand-off tracks the live B0 mission');
    assert.deepEqual(pushes, [{ id: 'missionLog', source: 'station-bar' }]);
    assert.equal(h.bag.b0.status, 'active', 'the click does not settle the work');
  } finally { h.close(); }
});

test('the alloy posting accepts through the mounted offer panel, not through the reply text', async () => {
  const h = mount(setup); try {
    paid(h); receive(h); openKessler(h);
    choice(h, FILE).click();
    assert.match(reply(h), /Freight payment withheld/);
    const accept = h.stage.querySelector('[data-accept-mission]'); assert.ok(accept, 'the reply exposes the board offer');
    assert.equal(accept.getAttribute('data-accept-mission'),
      h.sim.state.missions.boards[HOME].slots.find(o => o.storyTag === 'campaign47a:b1:alloy_run').id);
    const intents = []; h.sim.bus.on('ui:acceptMission', e => intents.push(e));
    accept.click(); await flush();
    assert.equal(intents.length, 1, 'the click emits the real board intent');
    assert.equal(h.sim.state.player.cargo.items.cmdty_alloys, 6, 'the accepted contract loads its freight');
    assert.ok(h.sim.state.missions.active.some(m => m.storyTag === 'campaign47a:b1:alloy_run'));
    assert.match(reply(h), /Accepted \+ tracked/);
  } finally { h.close(); }
});

test('the original-number choice records through the contact owner and the file answers differently after', () => {
  const h = mount(setup); try {
    paid(h); openKessler(h);
    const before = JSON.stringify([h.sim.state.player.credits, h.sim.state.story, h.sim.state.missions]);
    choice(h, ORIGINAL).click();
    const kesslerId = generateContacts(HOME, h.sim.state).find(c => c.canonicalKey === 'kessler').id;
    assert.equal(h.sim.state.player.stationContacts[kesslerId].flags[`choice_${ORIGINAL}`], true,
      'the ordinary talk event wrote the memory flag');
    assert.match(reply(h), /note, not a payment/);
    assert.equal(JSON.stringify([h.sim.state.player.credits, h.sim.state.story, h.sim.state.missions]), before,
      'the story note settles nothing');
    openKessler(h);
    assert.equal(choice(h, ORIGINAL), undefined, 'the remembered choice leaves the desk');
    choice(h, FILE).click();
    assert.match(reply(h), /asked me to leave it/);
  } finally { h.close(); }
});

test('a hand-off minted for one record does not fire after the record moves on', () => {
  const h = mount(setup); try {
    paid(h); openKessler(h); choice(h, FILE).click();
    const handoff = h.stage.querySelector('[data-campaign-handoff]'); assert.ok(handoff);
    h.bag.b0.status = 'completed';
    const tracks = [], pushes = [];
    h.sim.bus.on('ui:trackMission', e => tracks.push(e)); h.sim.bus.on('ui:pushScreen', e => pushes.push(e));
    handoff.click();
    assert.equal(tracks.length + pushes.length, 0, 'a settled B0 cannot be re-tracked from the old answer');
    assert.match(reply(h), /contract changed|Ask Kessler again/);
  } finally { h.close(); }
});
