// R429 Node layout-contract substitutes: these do not measure browser rectangles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as hud from '../src/ui/hud.js';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { createRunState } from '../src/core/runState.js';
import { targetDisplayName, wingLineFor, objectInfoLine, targetIntelReadout, createTargetPanel } from '../src/ui/targetPanel.js';
import { mountRacingHud } from '../src/ui/racingHud.js';
import { targetFrameHtml } from '../src/ui/views/targetFrame.js';
import { injectHudCss } from '../src/ui/views/hudStyles.js';
import { injectOrreryShipworks } from '../src/ui/orrery/shipworksLayouts.js';
import { shipworksHullName } from '../src/ui/station/screens/shipworks.js';
import { SHIPS } from '../src/data/ships.js';
import { createMarketNews } from '../src/ui/marketNews.js';

test('technical wing identities resolve names or stable unit codes without losing tactics', () => {
  const member = ship(2, 3, 100, 'CUTLASS', { squadId: 'zone_ceres_derelict', combatDoctrineId: 'mine_layer_wake' });
  member.data.combat = { targetId: 1 };
  const state = { meta: { seed: 4242 }, playerId: 1, world: { currentSectorId: 'sector_ceres' } };
  const line = wingLineFor(member, 1, state);
  for (const text of ['THE ABANDONED DRILLER', 'AREA DENIAL', 'TRACKING YOU']) assert.ok(line.includes(text), line);
  assert.doesNotMatch(line, /ZONE_CERES_DERELICT/);
  assert.ok(line.length <= 64);
  assert.equal(targetIntelReadout(member, null, state, 100).wing, line, 'live intel passes state');
  member.data.ai.squadId = 'wolfpack-3';
  assert.match(wingLineFor(member, 1), /WOLFPACK-3/);
  for (const id of ['sq-77f3c2a19b04d1e0', 'unknown_technical_squad', 'zone_missing', 'squad-429-3', '429003']) {
    member.data.ai.squadId = id;
    const result = wingLineFor(member, 1);
    assert.match(result, /^WING [0-9A-Z]{4} · AREA DENIAL · TRACKING YOU$/);
    assert.equal(wingLineFor(structuredClone(member), 1), result);
  }
  member.data.ai.squadId = 'A very long authored squadron designation '.repeat(5);
  assert.ok(wingLineFor(member, 1).length <= 64);
  assert.match(wingLineFor(member, 1), /AREA DENIAL · TRACKING YOU$/);
  delete member.data.ai.squadId;
  assert.equal(wingLineFor(member, 1), null);
});

test('readable contact facts preserve authored names, quantities, legality and unresolved wreck privacy', () => {
  const fx = mountHudFixture();
  try {
    const snapshot = (state = fx.state) => {
      const stations = [
        { type: 'station', data: { stationId: 'station_helios', name: 'station_helios' } },
        { type: 'station', data: { stationId: 'station_old_missing' } },
        { type: 'station', data: { isGate: true, name: 'station_missing' } },
      ];
      assert.deepEqual(stations.map(targetDisplayName), ['Helios Station', 'Station', 'Jump Gate']);
      for (const name of ['CUTLASS', 'SCREEN-2', 'wolfpack-3', 'My_authored_name']) {
        assert.equal(targetDisplayName({ type: 'ship', data: { name, ai: { squadId: name } } }), name);
      }
      const contact = ship('threat-1', 3, 3100, null);
      contact.data = { name: 'ship_removed_hull', defId: SHIPS[0].id, role: 'unknown_role_429', ai: {} };
      assert.equal(targetDisplayName(contact), SHIPS[0].name);
      const pickup = { id: 99, type: 'pickup', data: { commodityId: 'cmdty_missing_429', amount: 7, legality: 'restricted' } };
      const facts = objectInfoLine(pickup, state, fx.entity('player'), 100);
      assert.match(facts, /Unidentified cargo ×7/);
      assert.match(facts, /Restricted cargo/);
      assert.doesNotMatch(facts, /cmdty_missing/);
      const pool = { ...pickup, type: 'wreck', data: { salvagePool: { cmdty_missing_429: 9 }, legality: 'contraband' } };
      assert.match(objectInfoLine(pool, fx.state, fx.entity('player'), 100), /Unidentified cargo ×9.*Contraband/);
      const manifest = hud.manifestSummary({ data: { manifest: [{ id: 'cmdty_missing_429', qty: 11 }] } });
      assert.match(manifest, /Unidentified cargo ×11/);
      return [...stations.map(targetDisplayName), targetDisplayName(contact), facts, manifest];
    };
    const first = snapshot();
    const equivalent = { ...fx.state, meta: { seed: 4242 }, rng: mulberry32(4242) };
    assert.deepEqual(snapshot(equivalent), first, 'equivalent seed-4242 presentation is deterministic');
    const hidden = fx.entity('wreck');
    delete hidden.data.callsign;
    hidden.data.name = 'Hidden manifest owner'; hidden.data.scanLabel = 'Secret cargo';
    fx.entity('threat-1').data.callsign = null;
    fx.entity('threat-1').data.role = 'internal_role_429';
    fx.entity('threat-1').data.defId = SHIPS[0].id;
    fx.step(24);
    const names = fx.overview.querySelectorAll('.sf-overview-row__name').map((node) => node.textContent);
    assert.ok(names.includes('Derelict'), 'unscanned wreck has no authored or scan identity leak');
    assert.ok(names.includes(SHIPS[0].name), 'roster uses the target presenter');
    assert.ok(!names.some((name) => /internal_role|Hidden manifest|Secret cargo/.test(name)));
    assert.equal(targetDisplayName({ type: 'wreck', data: { callsign: 'SCREEN-2', scanLabel: 'Secret cargo' } }, { concealWreck: true }), 'SCREEN-2', 'public callsign survives before scanning');
    const panel = createTargetPanel({ state: fx.state, bus: fx.bus, helpers: {} });
    fx.state.player.targetId = 'threat-1';
    panel.update({ slow: true });
    assert.doesNotMatch(panel.el.textContent, /internal_role_429/);
    assert.equal(panel.el.querySelector('.sf-target__triangle').style.display, 'grid');
  } finally { fx.hud.destroy(); fx.restore(); }
});

test('compact tape moves only on parent changes and retains actions, visibility and cleanup', () => {
  const fx = mountHudFixture();
  let tape;
  try {
    const root = fx.document.body;
    const dock = root.querySelector('.sf-rightdock');
    const children = [...dock.children];
    const pushed = [];
    let open = false;
    const beforeListeners = fx.activeBusSubscriptions.size;
    tape = mountRacingHud({ root, state: fx.state, bus: fx.bus,
      screens: { isOpen: () => open, pushScreen: (id) => pushed.push(id) } });
    tape.frame(fx.state);
    const panel = dock.firstChild;
    assert.equal(panel.id, 'race-tape');
    assert.deepEqual(dock.children.slice(1), children);
    let moves = 0;
    const insert = dock.insertBefore.bind(dock);
    dock.insertBefore = (...args) => { moves++; return insert(...args); };
    tape.frame(fx.state); tape.frame(fx.state);
    assert.equal(moves, 0, 'unchanged frames never move the tape');
    assert.equal(root.querySelectorAll('#race-tape').length, 1);
    const buttons = panel.querySelectorAll('button');
    const board = buttons.find((button) => button.textContent === 'Circuits');
    board.focus(); board.click(0);
    assert.ok(fx.document.activeElement === board, 'keyboard activation retains focus');
    board.click(1);
    assert.ok(board.blurred, 'pointer activation blurs');
    assert.deepEqual(pushed, ['raceBoard', 'raceBoard']);
    const view = buttons[0]; view.click();
    assert.equal(fx.state.settings.gameplay.steeringView, 'racing');
    fx.state.missions.active = [{ id: 'race429', type: 'race', status: 'active', params: { racingContractId: '429' } }];
    tape.frame(fx.state); // Same simTime: ownership must reconcile ahead of telemetry throttle.
    assert.ok(panel.parentNode === root);
    assert.equal(panel.dataset.compact, 'false');
    fx.state.missions.active = [];
    dock.remove();
    tape.frame(fx.state);
    assert.ok(panel.parentNode === root, 'isolated fallback remains usable');
    const replacement = fx.document.createElement('div'); replacement.className = 'sf-rightdock';
    root.appendChild(replacement); tape.frame(fx.state);
    assert.ok(replacement.firstChild === panel, 'reconstruction reacquires the new dock');
    fx.bus.emit('combat:fire', { ownerId: fx.state.playerId }); tape.frame(fx.state);
    assert.equal(panel.dataset.combatLock, 'true');
    assert.equal(panel.querySelector('.race-tape-actions').inert, true);
    open = true; tape.frame(fx.state); assert.equal(panel.hidden, true);
    open = false; fx.state.ui.docked = true; tape.frame(fx.state); assert.equal(panel.hidden, true);
    fx.state.ui.docked = false; fx.state.render = { photoMode: { active: true } };
    tape.frame(fx.state); assert.equal(panel.hidden, true);
    fx.state.render.photoMode.active = false;
    fx.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }); fx.state.run.phase = 'active';
    tape.frame(fx.state); assert.equal(panel.hidden, true, 'sealed runs suppress controls');
    tape.dispose(); tape = null;
    assert.ok(panel.parentNode === null);
    assert.equal(fx.activeBusSubscriptions.size, beforeListeners, 'all tape listeners unsubscribe');
  } finally { tape?.dispose(); fx.hud.destroy(); fx.restore(); }
});

function rule(css, selector) {
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1].trim().split(',').map((s) => s.trim()).includes(selector));
  assert.ok(blocks.length, `production CSS rule exists: ${selector}`);
  return blocks.at(-1)[2];
}

for (const [width, height] of [[1280, 720], [1920, 1080]]) {
  test(`${width}x${height}: Node layout-contract substitute for bounded stack and full weapon labels`, () => {
    const fx = mountHudFixture(width, height);
    let tape;
    try {
      fx.entity('selected').data.scanLabel = 'A very long target and cargo contact label '.repeat(8);
      fx.entity('threat-1').data.ai.squadId = 'zone_ceres_derelict';
      fx.state.settings.ui.overviewOpen = true;
      fx.document.querySelector('.sf-radar').click();
      assert.ok(fx.document.querySelector('.sf-radar--expanded'), 'expanded radar state exercised');
      fx.step(24);
      const at = fx.state.simTime;
      injectHudCss();
      tape = mountRacingHud({ root: fx.document.body, state: fx.state, bus: fx.bus }); tape.frame(fx.state);
      const dock = fx.document.querySelector('.sf-rightdock');
      assert.equal(dock.getAttribute('tabindex'), '0');
      assert.equal(dock.getAttribute('aria-label'), 'Contacts and flight controls');
      assert.equal(dock.firstChild.id, 'race-tape');
      assert.ok(fx.overview.querySelectorAll('.sf-overview-row').length >= 3, 'populated roster within viewport cap');
      assert.equal(fx.state.simTime, at, 'presentation does not tick simulation');
      const css = fx.document.getElementById('sf-hud-style').textContent;
      const stack = rule(css, '#hud .sf-rightdock');
      for (const property of ['max-height:calc(100vh - 96px)', 'max-height:calc(100dvh - 96px)', 'overflow-y:auto', 'overflow-x:hidden', 'min-height:0']) assert.ok(stack.includes(property));
      assert.ok(stack.indexOf('100vh') < stack.indexOf('100dvh'));
      assert.match(rule(css, '#hud .sf-rightdock > *'), /flex:0 0 auto/);
      const compact = rule(css, '#hud .sf-rightdock > #race-tape[data-compact="true"]');
      for (const property of ['position:relative', 'top:auto', 'right:auto', 'left:auto', 'bottom:auto', 'transform:none', 'width:100%', 'min-width:0', 'grid-template-columns:minmax(0,1fr)']) assert.ok(compact.includes(property));
      assert.match(rule(css, '#hud .sf-rightdock > #race-tape[data-compact="true"] .race-tape-actions'), /flex-wrap:wrap/);
      for (const cls of ['sf-target__name', 'sf-target__identity', 'sf-target__intent', 'sf-target__object', 'sf-overview-footer']) assert.match(rule(css, `#hud .sf-rightdock .${cls}`), /overflow-wrap:anywhere/);
      const html = targetFrameHtml();
      assert.match(html, />Weapon effect</);
      for (const [family, cls, row] of [['Energy', 'e', 2], ['Kinetic', 'k', 3], ['Explosive', 'x', 4]]) {
        assert.match(html, new RegExp(`>${family}</span>`));
        assert.match(html, new RegExp(`sf-tri--${cls}" tabindex="0" role="img" aria-label="[^"]+" data-why="${family}"`));
        assert.match(rule(css, `#hud .sf-rightdock .sf-tri--${cls}`), new RegExp(`grid-row:${row}`));
      }
      assert.match(html, /sf-tri__fill/);
      assert.match(rule(css, '#hud .sf-rightdock .sf-target__tri-label'), /grid-row:1/);
      assert.match(rule(css, '#hud .sf-rightdock .sf-target__tri-layer'), /grid-row:1/);
      assert.match(rule(css, '#hud .sf-rightdock .sf-tri'), /grid-template-columns:minmax\(0,1fr\) 52px/);
      assert.doesNotMatch(rule(css, '.sf-tri__k'), /width:8px/);
    } finally { tape?.dispose(); fx.hud.destroy(); fx.restore(); }
  });
}

test('Shipworks roster uses separate automatic flow rows and safe saved-hull labels', () => {
  const fx = mountHudFixture();
  try {
    injectOrreryShipworks(fx.document);
    const css = fx.document.getElementById('sf-orrery-shipworks').textContent;
    const w = 'html body #screens > .sx-berth.orr-station .sx-sw';
    assert.match(rule(css, `${w} .sx-sw-row`), /grid-template-columns:minmax\(0,1fr\); row-gap:3px/);
    assert.match(rule(css, `${w} .sx-sw-row > .sx-sw-row__body`), /grid-column:1; grid-row:1; display:block; min-width:0/);
    assert.match(rule(css, `${w} .sx-sw-row > .k-row__num`), /grid-column:1; grid-row:2; justify-self:start; white-space:normal/);
    for (const cls of ['sx-sw-row__name', 'sx-sw-row__sub']) assert.match(rule(css, `${w} .sx-sw-row .${cls}`), /display:block; white-space:normal; overflow-wrap:anywhere/);
    assert.match(css, /min-height:0 !important; height:auto !important/);
    assert.doesNotMatch(css, /sx-sw-row > .k-row__num \{ grid-column:2; grid-row:1/);
    const row = fx.document.createElement('button');
    row.innerHTML = `<span class="sx-sw-row__body"><span class="sx-sw-row__name">${'Long hull '.repeat(12)}</span><span class="sx-sw-row__sub">${'Long role '.repeat(12)}</span></span><span class="k-row__num">123456789</span>`;
    assert.equal(row.querySelectorAll('.sx-sw-row__name').length, 1);
    assert.equal(row.querySelectorAll('.sx-sw-row__sub').length, 1);
    assert.equal(shipworksHullName(SHIPS[0].id), SHIPS[0].name);
    assert.equal(shipworksHullName('ship_unknown_saved_429'), 'Unidentified hull');
    const source = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');
    const rail = source.slice(source.indexOf('  function renderRail()'), source.indexOf('  function selectRailButton'));
    assert.match(rail, /data-fleet=/); assert.match(rail, /data-buy=/);
    assert.equal((rail.match(/escapeHtml\(shipworksHullName\(s.defId\)\)/g) || []).length, 3, 'visible, title and accessible hull names use the helper');
    assert.match(rail, /syncScrollExtent\(railListEl\)/);
    assert.match(css, /sx-sw__list\[data-overflow="1"\]/);
    const stationCss = readFileSync(new URL('../styles/station.css', import.meta.url), 'utf8');
    assert.match(stationCss, /\.sx-sw__list \{ min-height: 0; overflow: hidden auto;/, 'retained station list scrolls vertically');
  } finally { fx.hud.destroy(); fx.restore(); }
});

test('tutorial retains three cited headlines silently, then rotates one child every 7000ms', () => {
  const fx = mountHudFixture();
  let news;
  try {
    const host = fx.document.createElement('div'); host.id = 'news-ticker'; fx.document.body.appendChild(host);
    // The flight HUD has a separate host; this fixture explicitly supplies a ticker surface.
    const oldHost = fx.document.querySelectorAll('#news-ticker').find((node) => node !== host);
    oldHost?.remove();
    const timers = new Map(); let id = 0;
    window.setTimeout = (fn, ms) => { timers.set(++id, { fn, ms }); return id; };
    window.clearTimeout = (key) => timers.delete(key);
    fx.state.onboarding = { active: true, finished: false };
    const voice = []; const toast = [];
    fx.bus.on('toast', (event) => toast.push(event));
    news = createMarketNews({ state: fx.state, bus: fx.bus, helpers: { voice: { say: (event) => { voice.push(event); return true; } } } });
    const at = fx.state.simTime;
    for (let i = 0; i < 3; i++) fx.bus.emit('news:publish', { text: `Cited news ${i}`, source: 'R429', sourceRef: `receipt:429:${i}`, eventId: `429:${i}` });
    assert.equal(news.getLog().length, 3);
    assert.ok(news.getLog().every((item) => item.sourceRef?.startsWith('receipt:429:')));
    assert.equal(voice.length, 0); assert.equal(toast.length, 0);
    assert.equal(host.hidden, true); assert.equal(timers.size, 0);
    const ticker = host.children[0]; assert.equal(ticker.children.length, 0);
    fx.state.onboarding = { active: false, finished: true }; fx.bus.emit('tutorial:finished', {});
    assert.equal(host.hidden, false); assert.equal(ticker.children.length, 1);
    const before = ticker.children[0];
    const [key, timer] = [...timers.entries()][0]; assert.equal(timer.ms, 7000);
    timers.delete(key); timer.fn();
    assert.equal(ticker.children.length, 1);
    assert.ok(ticker.children[0] !== before);
    assert.notEqual(ticker.textContent, before.textContent);
    assert.equal(fx.state.simTime, at);
  } finally { news?.destroy(); fx.hud.destroy(); fx.restore(); }
});

const WRITE_SPY = {
  root: null,
  count: 0,
  reset(root) { this.root = root; this.count = 0; },
  off() { this.root = null; this.count = 0; },
};

function mountHudFixture(width = 1920, height = 1080) {
  const globals = {
    document: globalThis.document,
    window: globalThis.window,
    performance: globalThis.performance,
    getComputedStyle: globalThis.getComputedStyle,
  };
  WRITE_SPY.off();
  const document = new HudDocument();
  const root = document.createElement('div');
  root.id = 'hud';
  document.body.appendChild(root);
  globalThis.document = document;
  globalThis.window = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
  const clock = { now: 1000 };
  globalThis.performance = { now: () => clock.now };
  globalThis.getComputedStyle = (element) => ({
    display: element?.style?.display === 'none'
      ? 'none'
      : (element?.classList?.contains('sf-overview') ? 'flex' : (element?.style?.display || 'block')),
    getPropertyValue: () => '',
  });

  const player = ship('player', 1, 0, 'Player');
  player.pos.x = 0;
  player.hull = player.hullMax = 140;
  player.shield = player.shieldMax = 55;
  player.armorHp = player.armorMax = 30;
  player.energy = player.energyMax = 80;
  player.fuel = player.fuelMax = 100;
  player.maxSpeed = 140;
  player.data.defId = 'hitch';
  player.data.weapons = [];
  const selected = wreck('selected', 3000, 'Selected Wreck');
  selected.data.scanned = true;
  const threat1 = ship('threat-1', 3, 3100, 'Threat One', { forcePlayerTarget: true });
  const threat2 = ship('threat-2', 3, 3200, 'Threat Two', { forcePlayerTarget: true });
  const ally = ship('ally', 1, 3300, 'Wing Ally');
  const otherWreck = wreck('wreck', 3400, 'Other Wreck');
  const ambient1 = ship('ambient-1', 0, 3500, 'Ambient One');
  const ambient2 = ship('ambient-2', 0, 3600, 'Ambient Two');
  const contacts = [selected, threat1, threat2, ally, otherWreck, ambient1, ambient2];
  const entityList = [player, ...contacts];
  const state = {
    meta: { seed: 4242 }, rng: mulberry32(4242), mode: 'flight', playerId: player.id, entities: new Map(entityList.map((e) => [e.id, e])), entityList,
    player: {
      targetId: selected.id,
      credits: 0,
      cargo: { items: {}, usedVolume: 0, capVolume: 40 },
      weaponRange: 900,
      heat: 0,
    },
    settings: {
      ui: { overviewOpen: false },
      accessibility: { colorblindMode: 'none', reducedMotion: true, reducedFlash: true },
      gameplay: {}, controls: {}, audio: {}, graphics: {},
    },
    ui: { radarRange: 4000, trackedMissionId: null },
    input: { actions: {}, autoFire: false },
    missions: { active: [] },
    story: { beatIndex: -1 },
    nav: {}, world: { currentSectorId: 'helios', scanPings: {} },
    simTime: 0, tick: 0,
  };
  const bus = createBus();
  const activeBusSubscriptions = new Set();
  const busOn = bus.on.bind(bus);
  bus.on = (event, listener, options) => {
    const rawOff = busOn(event, listener, options);
    const trackedOff = () => {
      activeBusSubscriptions.delete(trackedOff);
      return typeof rawOff === 'function' ? rawOff() : undefined;
    };
    trackedOff.event = event;
    activeBusSubscriptions.add(trackedOff);
    return trackedOff;
  };
  const mounted = hud.createHud({
    state,
    bus,
    helpers: { worldToScreen: () => ({ x: 960, y: 540, onScreen: true }) },
  }, null);

  const fx = {
    state, bus, hud: mounted, document, contacts, clock, spy: WRITE_SPY, activeBusSubscriptions,
    get overview() { return document.querySelector('.sf-overview'); },
    entity(id) { return state.entities.get(id); },
    add(entity) {
      state.entityList.push(entity);
      state.entities.set(entity.id, entity);
      contacts.push(entity);
      return entity;
    },
    step(frames, fps = 60) {
      for (let i = 0; i < frames; i++) {
        state.simTime += 1 / fps;
        state.tick += 1;
        for (const contact of contacts) contact.pos.x += contact.vel.x / fps;
        clock.now += 1000 / fps;
        mounted.frame(1 / fps);
      }
    },
    restore() {
      WRITE_SPY.off();
      globalThis.document = globals.document;
      globalThis.window = globals.window;
      globalThis.performance = globals.performance;
      globalThis.getComputedStyle = globals.getComputedStyle;
    },
  };
  return fx;
}

function ship(id, team, x, callsign, ai = {}) {
  return {
    id, type: 'ship', alive: true, team, factionId: team === 3 ? 'faction_vael' : null,
    pos: { x, y: 0, z: 0 }, vel: { x: 20, z: 0 }, radius: 12,
    hull: 100, hullMax: 100, shield: 30, shieldMax: 30, armorHp: 20, armorMax: 20,
    data: { callsign, ai: { lawful: false, ...ai }, weapons: [] },
  };
}

function wreck(id, x, callsign) {
  return {
    id, type: 'wreck', alive: true, team: 0,
    pos: { x, y: 0, z: 0 }, vel: { x: 20, z: 0 }, radius: 10,
    data: { callsign, scanned: false },
  };
}

// --- minimal DOM shim (mirrors test/hud-contact-roster-visibility.test.mjs) --------------------
class HudClassList {
  constructor(owner) { this.owner = owner; this.values = new Set(); }
  reset(value) { this.values = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const active = force === undefined ? !this.values.has(value) : !!force;
    if (active) this.values.add(value); else this.values.delete(value);
    return active;
  }
}

class HudStyle {
  setProperty(name, value) { this[name] = String(value); }
  removeProperty(name) { delete this[name]; }
}

class HudText {
  constructor(text) { this.nodeType = 3; this._text = text; this.parentNode = null; }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
}

class HudElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.childNodes = this.children;
    this.parentNode = null;
    this.style = new HudStyle();
    this.dataset = {};
    this.attributes = new Map();
    this.classList = new HudClassList(this);
    this._className = '';
    this._innerHTML = '';
    this._listeners = new Map();
    this.id = '';
    this.hidden = false;
    this.rebuildCount = 0;
    this.isConnected = true;
    this.offsetWidth = 1;
  }
  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList.reset(this._className); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) {
    this._innerHTML = String(value || '');
    if (this.classList.contains('sf-overview') && this._innerHTML === '') this.rebuildCount += 1;
    this.children.length = 0;
    parseMarkup(this, this._innerHTML);
  }
  get textContent() { return this.children.map((child) => child.textContent).join(''); }
  set textContent(value) {
    // Instrumentation: count text writes inside the roster so cadence can be asserted without
    // depending on the teardown this rewrite removed.
    if (WRITE_SPY.root && WRITE_SPY.root.contains(this)) WRITE_SPY.count += 1;
    this._innerHTML = '';
    this.children.length = 0;
    if (value != null && String(value) !== '') this.appendChild(new HudText(String(value)));
  }
  // Real appendChild DETACHES first, so appending a live node MOVES it. Without this the shim
  // duplicates any node a reconciler reorders.
  appendChild(child) {
    if (child.nodeType === 11) {
      const kids = (child.children || []).slice();
      (child.children || []).length = 0;
      for (const kid of kids) this.appendChild(kid);
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this; this.children.push(child); return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children.length = 0;
    children.forEach((child) => this.appendChild(child));
  }
  // Real append() stringifies non-node children into text nodes — the Speed Dial mixes
  // (element, 'wu/s') and the bare shim used to die on the string.
  append(...children) {
    children.forEach((child) => this.appendChild(
      typeof child === 'object' && child !== null ? child : new HudText(String(child))));
  }
  get firstChild() { return this.children[0] || null; }
  get firstElementChild() { return this.children.find((child) => child.nodeType === 1) || null; }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = before ? this.children.indexOf(before) : this.children.length;
    assert.ok(i >= 0, 'insertBefore reference belongs to parent');
    child.parentNode = this; this.children.splice(i, 0, child); return child;
  }
  prepend(child) { return this.insertBefore(child, this.firstChild); }
  blur() { this.ownerDocument.activeElement = this.ownerDocument.body; this.blurred = true; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
    this.isConnected = false;
  }
  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === 'id') this.id = text;
    if (name === 'class') this.className = text;
    if (name === 'style') parseStyle(this.style, text);
    if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = text;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type) || [];
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  click(detail = 1) { if (this.disabled || this.closest('[inert]')) return; for (const fn of this._listeners.get('click') || []) fn({ type: 'click', detail, currentTarget: this, preventDefault() {} }); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const result = [];
    const token = String(selector).trim().split(/\s+/).at(-1);
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.nodeType === 1 && matchesSelector(child, token)) result.push(child);
        if (child.nodeType === 1) visit(child);
      }
    };
    visit(this);
    return result;
  }
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 220, bottom: 180, width: 220, height: 180 }; }
  getTotalLength() { return 2 * Math.PI * 44; }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { for (let p = node; p; p = p.parentNode) if (p === this) return true; return false; }
  closest(selector) {
    for (let node = this; node && node.nodeType === 1; node = node.parentNode) {
      if (matchesSelector(node, selector)) return node;
    }
    return null;
  }
  getContext() { return canvasContext(); }
}

class HudDocument {
  constructor() {
    this.head = new HudElement(this, 'head');
    this.body = new HudElement(this, 'body');
    this.documentElement = this.body;
    this.activeElement = this.body;
  }
  createElement(tagName) { return new HudElement(this, tagName); }
  createTextNode(text) { return new HudText(String(text)); }
  createElementNS(_ns, tagName) { return this.createElement(tagName); }
  createDocumentFragment() {
    const fragment = this.createElement('#fragment');
    fragment.nodeType = 11;
    return fragment;
  }
  getElementById(id) { return findElement([this.head, this.body], (node) => node.id === id); }
  querySelector(selector) { return this.head.querySelector(selector) || this.body.querySelector(selector); }
  querySelectorAll(selector) { return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)]; }
  addEventListener() {}
  removeEventListener() {}
}

function parseMarkup(parent, markup) {
  if (!markup) return;
  const stack = [parent];
  for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
    if (!token.startsWith('<')) {
      if (token) stack.at(-1).appendChild(new HudText(token.replace(/&times;/g, '×')));
      continue;
    }
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    const match = token.match(/^<\s*([\w:-]+)/);
    if (!match) continue;
    const element = parent.ownerDocument.createElement(match[1]);
    const attrs = token.slice(match[0].length, token.length - (token.endsWith('/>') ? 2 : 1));
    for (const attr of attrs.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      element.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    }
    stack.at(-1).appendChild(element);
    if (!token.endsWith('/>') && !['BR', 'HR', 'IMG', 'INPUT'].includes(element.tagName)) stack.push(element);
  }
}

function parseStyle(style, value) {
  for (const entry of String(value || '').split(';')) {
    const i = entry.indexOf(':');
    if (i > 0) style[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
  }
}

function dataKey(value) { return value.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()); }

function matchesSelector(element, selector) {
  if (!selector) return false;
  if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('[')) {
    const match = selector.match(/^\[([^=\]]+)(?:=([^\]]+))?\]$/);
    if (!match) return false;
    const expected = match[2]?.replace(/^['"]|['"]$/g, '');
    const actual = element.getAttribute(match[1]);
    return expected === undefined ? actual != null : actual === expected;
  }
  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function findElement(roots, predicate) {
  const stack = [...roots];
  while (stack.length) {
    const node = stack.shift();
    if (predicate(node)) return node;
    stack.unshift(...(node.children || []).filter((child) => child.nodeType === 1));
  }
  return null;
}

function canvasContext() {
  const gradient = () => ({ addColorStop() {} });
  const target = {
    measureText: (text) => ({ width: String(text).length * 5 }),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
  };
  return new Proxy(target, {
    get(obj, key) { return key in obj ? obj[key] : () => {}; },
    set(obj, key, value) { obj[key] = value; return true; },
  });
}
