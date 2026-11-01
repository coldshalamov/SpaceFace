import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createStationApp } from '../src/ui/station/stationApp.js';
import { createBarScreen } from '../src/ui/station/screens/bar.js';
import { stationRegularRecognition, buildStationArrivalGreeting, createStationArrivalPresenter } from '../src/ui/station/stationArrival.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactMemoryFor } from '../src/data/stationContacts.js';
import { localPortraitForContact } from '../src/data/localPortraits.js';
import { portraitAssetForContact } from '../src/data/portraits.js';
import { save } from '../src/save/saveSystem.js';
import { audio } from '../src/audio/audioSystem.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';
import { presentUiStage, releaseUiStage, releaseUiStagePrewarm, setUiStagePartLoaderForTest, uiStageReport } from '../src/render/uiStage.js';

// Local DOM double follows INF-095. No browser or GPU is used.
let domWrites = 0;

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.dataset = {};
    // CSSStyleDeclaration-shaped enough for the scroll-extent cursor and inline writes
    this.style = { setProperty() {}, getPropertyValue: () => '', removeProperty() {} };
    this.attributes = {};
    this.parentNode = null;
    this.hidden = true;
    this.isConnected = true;
    this.tabIndex = 0;
    this.className = '';
    this.id = '';
    this._cls = new Set();
    this._listeners = {};
    this._bySel = new Map();
    let text = '';
    let html = '';
    Object.defineProperty(this, 'textContent', {
      get: () => text,
      set: (v) => { text = String(v); domWrites += 1; },
      configurable: true,
    });
    Object.defineProperty(this, 'innerHTML', {
      get: () => html,
      set: (v) => { html = String(v); this._hasHtml = html.length > 0; domWrites += 1; },
      configurable: true,
    });
    this.classList = {
      add: (...names) => names.forEach((n) => this._cls.add(n)),
      remove: (...names) => names.forEach((n) => this._cls.delete(n)),
      toggle: (n, force) => {
        const on = force === undefined ? !this._cls.has(n) : !!force;
        if (on) this._cls.add(n); else this._cls.delete(n);
        return on;
      },
      contains: (n) => this._cls.has(n),
    };
  }
  querySelector(sel) {
    if (!this._bySel.has(sel)) {
      const child = new FakeEl('div');
      child._hasHtml = true; // selector hits address parsed markup; reads behave
      this._bySel.set(sel, child);
    }
    return this._bySel.get(sel);
  }
  querySelectorAll() { return []; }
  getElementsByClassName() { return []; }
  appendChild(child) { this.children.push(child); if (child) child.parentNode = this; return child; }
  append(...nodes) { nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); }); }
  prepend(...nodes) { nodes.flat().reverse().forEach((n) => { if (typeof n === 'string') return; this.children.unshift(n); if (n) n.parentNode = this; }); }
  replaceChildren(...nodes) {
    for (const c of this.children) if (c) c.parentNode = null;
    this.children = [];
    nodes.flat().forEach((n) => { if (typeof n === 'string') return; this.appendChild(n); });
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
    if (child) child.parentNode = null;
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this._listeners[type] || [];
    const at = list.indexOf(fn);
    if (at >= 0) list.splice(at, 1);
  }
  setAttribute(k, v) { this.attributes[String(k)] = String(v); }
  getAttribute(k) { return this.attributes[String(k)] ?? null; }
  removeAttribute(k) { delete this.attributes[String(k)]; }
  hasAttribute(k) { return String(k) in this.attributes; }
  closest() { return null; }
  contains() { return false; }
  focus() {}
  click() {}
  get firstChild() {
    if (this.children.length) return this.children[0];
    // innerHTML-built subtrees are not parsed here; stand in a stable implicit child so
    // parsed-content reads (modeEl.firstChild) behave. No production path removes it.
    if (this._hasHtml) {
      if (!this._implicit) this._implicit = new FakeEl('div');
      return this._implicit;
    }
    return null;
  }
  get lastChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  get childElementCount() { return this.children.length; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 }; }
}

function installDom() {
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    raf: globalThis.requestAnimationFrame,
    caf: globalThis.cancelAnimationFrame,
  };
  const head = new FakeEl('head');
  const body = new FakeEl('body');
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: () => null,
    // truthful no-match answer for the continue-veil probe in uiStageRequestFor
    querySelector: () => null,
    head,
    body,
    activeElement: null,
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
    devicePixelRatio: 1,
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  return () => {
    if (prev.document === undefined) delete globalThis.document; else globalThis.document = prev.document;
    if (prev.window === undefined) delete globalThis.window; else globalThis.window = prev.window;
    if (prev.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prev.raf;
    if (prev.caf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prev.caf;
  };
}

function clock() {
  let time = 0, serial = 0;
  const jobs = new Map();
  return {
    now: () => time,
    setTimeout(fn, delay = 0) { const id = ++serial; jobs.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    step(ms) {
      const end = time + ms;
      for (let guard = 0; guard < 10000; guard++) {
        const next = [...jobs].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) { time = end; return; }
        jobs.delete(next[0]); time = next[1].at; next[1].fn();
      }
      throw new Error('timer loop did not settle');
    },
    get pending() { return jobs.size; },
    callbacks: () => [...jobs.values()].map((job) => job.fn),
  };
}
function fixture() {
  const state = createGameState(4242);
  state.player.name = 'Wren';
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [] }];
  state.player.activeShipIndex = 0;
  state.factions.faction_scn = { rep: 0 };
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.ui.screenStack = ['station'];
  state.mode = 'flight';
  return state;
}
const barkeep = (state, stationId = 'station_helios') => generateContacts(stationId, state).find((c) => c.role === 'barkeep');
const face = (c) => portraitAssetForContact(c) || localPortraitForContact(c);
function harness({ acknowledge = true, state = fixture() } = {}) {
  const bus = createBus(), timers = clock(), receipts = [], voices = [];
  let receiptBusy = false;
  const presenter = createStationArrivalPresenter({ state, bus, registry: { get() { throw new Error('frozen queue must never be read'); } } }, {
    ...timers, showReceipt: (...args) => receipts.push(args), receiptVisible: () => receiptBusy,
  });
  bus.on('barkDirector:voice', (payload) => {
    voices.push(payload);
    if (acknowledge) bus.emit('presentation:caption', { shape: 'radio', text: payload.text });
  });
  return { state, bus, timers, receipts, voices, presenter, busy(value) { receiptBusy = value; } };
}

test('4242 actual local host, pilot sanitization, pure builders, and persistent faces', () => {
  const state = fixture(), paired = fixture();
  const before = JSON.stringify({ player: state.player, factions: state.factions });
  const first = buildStationArrivalGreeting(state, 'station_helios');
  assert.equal(first.speakerName, 'Koda Craine');
  assert.equal(first.contactId, 'contact_station_helios_0');
  assert.match(first.text, /^Wren, /);
  assert.equal(buildStationArrivalGreeting(state, 'station_ceres').speakerName, 'Neve Tull');
  assert.equal(buildStationArrivalGreeting(state, 'station_sker').speakerName, 'Quinn');
  assert.equal(buildStationArrivalGreeting(state, null), null);
  assert.equal(buildStationArrivalGreeting(state, 'unknown'), null);
  assert.deepEqual(first, buildStationArrivalGreeting(state, 'station_helios'));
  assert.equal(JSON.stringify({ player: state.player, factions: state.factions }), before);
  assert.equal(state.rng(), paired.rng(), 'arrival must consume no simulation RNG');
  const host = barkeep(state), quinn = barkeep(state, 'station_sker');
  const identity = [host.id, host.name, face(host)];
  assert.match(face(host), /barkeep_16\.jpg$/);
  state.player.stationContacts = { [host.id]: { met: true, standing: 3 }, [quinn.id]: { met: true, standing: 3 } };
  assert.deepEqual([barkeep(state).id, barkeep(state).name, face(barkeep(state))], identity);
  assert.equal(face(barkeep(state, 'station_sker')), face(quinn));
  assert.ok(face(quinn));
  assert.equal(barkeep(state, 'station_sker').line, quinn.line);
  assert.ok(buildStationArrivalGreeting(state, 'station_sker').text.includes(quinn.line));
  state.player.name = ' \u0000  Wren\n  Vale \u007f ';
  assert.match(buildStationArrivalGreeting(state, 'station_helios').text, /^Wren Vale, /);
  state.player.name = 'a'.repeat(30);
  assert.match(buildStationArrivalGreeting(state, 'station_helios').text, /^a{20}, /);
  state.player.name = '\n\t';
  assert.match(buildStationArrivalGreeting(state, 'station_helios').text, /^Pilot, /);
});

test('recognition follows normalized memory and the existing -30/-29 and 149/150 rank boundaries', () => {
  const state = fixture(), host = barkeep(state);
  state.factions[host.factionId] = { rep: 0 };
  assert.deepEqual(stationRegularRecognition(state, host), { band: 'new', label: 'New arrival', reaction: 'They look up from the counter.' });
  state.player.stationContacts = { [host.id]: { met: true, standing: 1 } };
  assert.deepEqual(stationRegularRecognition(state, host), { band: 'recognized', label: 'Recognized', reaction: 'They recognize you before you speak.' });
  state.player.stationContacts[host.id].standing = 3;
  assert.deepEqual(stationRegularRecognition(state, host), { band: 'trusted', label: 'Trusted', reaction: 'They kept a place for you.' });
  state.factions[host.factionId].rep = -30;
  assert.deepEqual(stationRegularRecognition(state, host), { band: 'wary', label: 'Guarded', reaction: 'They keep the paperwork between you.' });
  state.factions[host.factionId].rep = -29;
  assert.equal(stationRegularRecognition(state, host).band, 'trusted', 'contact trust survives non-hostile rep');
  delete state.player.stationContacts;
  for (const [rep, expected] of [[-30, 'wary'], [-29, 'new'], [149, 'new'], [150, 'trusted']]) {
    state.factions[host.factionId].rep = rep;
    assert.equal(stationRegularRecognition(state, host).band, expected, `rep ${rep}`);
  }
  delete state.factions[host.factionId];
  assert.equal(stationRegularRecognition(state, host).band, 'new');
});

test('real conversation choices advance persisted recognition; arrival never advances memory; saves remain compatible', (t) => {
  const state = fixture(), bus = createBus(), host = barkeep(state);
  const owner = Object.create(stationContacts);
  owner.init({ state, bus }); t.after(() => owner.destroy());
  const before = JSON.stringify(state.player.stationContacts);
  buildStationArrivalGreeting(state, 'station_helios');
  const h = harness({ state }); h.presenter.show(); h.timers.step(4000); h.presenter.dispose();
  assert.equal(JSON.stringify(state.player.stationContacts), before);
  for (const [index, choiceId] of ['rumors', 'word', 'drink'].entries()) {
    bus.emit('ui:talkContact', { contactId: host.id, name: host.name, stationId: 'station_helios', role: host.role, choiceId });
    assert.equal(stationContactMemoryFor(state, host.id).standing, index + 1);
    assert.equal(stationRegularRecognition(state, host).band, index === 2 ? 'trusted' : 'recognized');
  }
  bus.emit('ui:talkContact', { contactId: host.id, stationId: 'station_helios', choiceId: 'word' });
  assert.equal(stationContactMemoryFor(state, host.id).standing, 3);
  const saved = Object.create(save); saved.state = state;
  const restored = fixture(); restored.player = JSON.parse(JSON.stringify(saved._serializePlayer()));
  assert.deepEqual(stationRegularRecognition(restored, host), stationRegularRecognition(state, host));
  delete restored.player.stationContacts;
  assert.equal(stationRegularRecognition(restored, host).band, 'new');
});

test('paused arrival delivers exactly once through in-app refresh, tabs and modal cycles', () => {
  const h = harness(); const { presenter, timers, bus, state } = h;
  const sim = [state.simTime, state.tick];
  presenter.show(); timers.step(3999);
  assert.equal(h.voices.length, 0);
  timers.step(1);
  assert.equal(h.voices.length, 1); assert.equal(h.receipts.length, 1);
  assert.deepEqual(h.receipts[0], ['Koda Craine', h.voices[0].text, 'Bar']);
  assert.equal(h.voices[0].situation, 'patrol-greeting'); assert.equal(h.voices[0].importance, 0.55);
  presenter.show(); bus.emit('dock:docked', { stationId: 'station_helios' });
  bus.emit('dock:committed', { stationId: 'station_helios' });
  presenter.hide(); presenter.show(); timers.step(10000);
  assert.equal(h.voices.length, 1); assert.equal(h.receipts.length, 1);
  assert.deepEqual([state.simTime, state.tick], sim);
  presenter.dispose(); assert.equal(timers.pending, 0);
});

test('modal inside anchor re-arms pending delivery and cancelled callbacks cannot run in flight', () => {
  const h = harness(); h.presenter.show(); h.timers.step(1000);
  const [stale] = h.timers.callbacks();
  h.presenter.hide(); h.timers.step(6000); stale();
  assert.equal(h.voices.length, 0);
  h.presenter.show(); h.timers.step(500);
  assert.equal(h.voices.length, 1);
  h.presenter.dispose(); stale(); assert.equal(h.voices.length, 1);
  const flight = harness(); flight.presenter.show(); const [pending] = flight.timers.callbacks();
  flight.state.ui.docked = false; pending(); flight.timers.step(10000);
  assert.equal(flight.receipts.length, 0); flight.presenter.dispose();
  const awaiting = harness({ acknowledge: false });
  awaiting.presenter.show(); awaiting.timers.step(4000);
  const [retry] = awaiting.timers.callbacks();
  awaiting.presenter.hide();
  awaiting.bus.emit('presentation:caption', { shape: 'radio', text: awaiting.voices[0].text });
  retry(); awaiting.timers.step(5000);
  assert.equal(awaiting.receipts.length, 0, 'late admission cannot write a hidden receipt');
  assert.equal(awaiting.voices.length, 1, 'cancelled retry cannot speak while hidden');
  awaiting.presenter.dispose();
});

test('committed station changes schedule without onShow; stale raw docks mint no visit; undock/redock does', () => {
  const h = harness(); h.presenter.show(); h.timers.step(4000);
  const oldCallbacks = h.timers.callbacks();
  h.bus.emit('dock:docked', { stationId: 'station_ceres' }); h.timers.step(5000);
  assert.equal(h.voices.length, 1, 'uncommitted raw dock cannot start a visit');
  h.state.ui.dockedStationId = 'station_ceres';
  h.bus.emit('dock:committed', { stationId: 'station_ceres' });
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  oldCallbacks.forEach((fn) => fn()); h.timers.step(4000);
  assert.equal(h.voices.length, 2); assert.equal(h.voices[1].speakerName, 'Neve Tull');
  h.state.ui.docked = false; h.bus.emit('dock:undocked');
  h.state.ui.docked = true; h.bus.emit('dock:committed', { stationId: 'station_ceres' });
  h.timers.step(4000); assert.equal(h.voices.length, 3); h.presenter.dispose();
});

test('restore, both new-game routes, station replacement and disposal cancel stale work and all subscriptions', () => {
  for (const event of ['save:restoring', 'game:new', 'game:newGame', 'dock:undocked']) {
    const h = harness(); h.presenter.show(); const [stale] = h.timers.callbacks();
    h.bus.emit(event); stale(); h.timers.step(20000);
    assert.equal(h.voices.length, 0, event); h.presenter.dispose();
  }
  const h = harness(); h.presenter.show(); const [stale] = h.timers.callbacks();
  h.state.ui.dockedStationId = 'station_ceres'; stale(); h.timers.step(10000);
  assert.equal(h.receipts.length, 0); h.presenter.dispose();
  // A real bus wrapper measures removal without inspecting the presenter's internals.
  const bus = createBus(); let count = 0;
  const measured = { emit: (...args) => bus.emit(...args), on(ev, fn) { count++; bus.on(ev, fn); }, off(ev, fn) { count--; bus.off(ev, fn); } };
  const p = createStationArrivalPresenter({ state: fixture(), bus: measured }, clock());
  assert.ok(count > 0); p.dispose(); assert.equal(count, 0); p.show();
});

test('service receipts and competing voice/captions yield without consuming the emit budget; frozen queue cannot starve arrival', () => {
  const h = harness(), queue = new VoiceQueue();
  h.bus.on('voice:say', (payload) => queue.enqueue(payload, h.state.simTime * 1000));
  h.bus.emit('voice:say', { id: 'pre-dock-frozen-queue', text: 'Old flight bark', channel: 'bark' });
  assert.equal(queue.pending.length, 1);
  h.presenter.show();
  h.bus.emit('barkDirector:voice', { text: 'deed' }); h.voices.length = 0;
  h.bus.emit('tutorial:say', { text: 'instructor' }); h.bus.emit('comms:popup', { category: 'danger' });
  h.bus.emit('presentation:caption', { shape: 'arc', text: 'foreground' });
  h.busy(true); h.timers.step(20000);
  assert.equal(h.voices.length, 0); assert.equal(h.receipts.length, 0);
  h.busy(false); h.bus.emit('tutorial:say', { text: 'next instructor' });
  h.timers.step(3999); assert.equal(h.voices.length, 0);
  h.timers.step(501); assert.equal(h.voices.length, 1); assert.equal(h.receipts.length, 1);
  assert.equal(queue.pending.length, 1, 'the sim queue remains frozen through delivery');
  h.presenter.dispose();
  for (const event of ['barkDirector:voice', 'tutorial:say', 'comms:popup']) {
    const busy = harness(); busy.presenter.show(); busy.timers.step(3500);
    busy.bus.emit(event, { text: 'competing', category: 'priority' }); busy.voices.length = 0;
    busy.timers.step(3999); assert.equal(busy.voices.length, 0, event);
    busy.timers.step(501); assert.equal(busy.voices.length, 1, event); busy.presenter.dispose();
  }
});

test('silent audio drops cap actual emits at 16, then preserve written greeting; own voice never yields to itself', () => {
  const h = harness({ acknowledge: false }); h.presenter.show(); h.timers.step(30000);
  assert.equal(h.voices.length, 16); assert.equal(h.receipts.length, 1);
  assert.equal(h.timers.pending, 0); h.presenter.dispose();
});

test('muted and each zero-volume bus keep written copy without audible requests', () => {
  for (const setting of [{ muted: true }, { master: 0 }, { voice: 0 }, { comms: 0 }]) {
    const h = harness(); Object.assign(h.state.settings.audio, setting);
    h.presenter.show(); h.timers.step(10000);
    assert.equal(h.voices.length, 0, JSON.stringify(setting)); assert.equal(h.receipts.length, 1);
    assert.match(h.receipts[0][1], /^Wren, /); h.presenter.dispose();
  }
});

test('actual audio adapter clears a mechanic hold past 4s and admits exact radio caption on retry', () => {
  const h = harness({ acknowledge: false });
  const host = Object.create(audio), plays = [], captions = [];
  host.state = h.state; host.bus = h.bus;
  host.rt = { ctx: { get currentTime() { return h.timers.now() / 1000; } } };
  host.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  host._applyFactionSting = () => {};
  h.bus.on('presentation:caption', (p) => captions.push(p));
  host._onBarkVoice({ mechanic: true, kind: 'mechanic', text: 'The docking clamps are secure and the hull inspection is finished. Keep your cargo manifest ready while we check the outer plating and clear the berth for service.' });
  assert.ok(host.rt._commsImmediateUntilS > 4, 'mechanic hold must extend past the initial anchor');
  // On the first real mount, system dock handlers have already spoken before this presenter exists.
  h.presenter.dispose();
  const receipts = [];
  const presenter = createStationArrivalPresenter({ state: h.state, bus: h.bus }, { ...h.timers, showReceipt: (...args) => receipts.push(args) });
  h.bus.on('barkDirector:voice', (p) => host._onBarkVoice(p));
  presenter.show(); h.timers.step(4000);
  assert.equal(receipts.length, 0, 'the first attempt is silently held');
  h.timers.step(1800);
  assert.equal(receipts.length, 1); assert.ok(h.voices.length >= 2);
  const greeting = buildStationArrivalGreeting(h.state, 'station_helios');
  const body = plays.find((p) => p.opts.barkSampleId === 'bark_scn');
  assert.ok(body); assert.equal(body.recipeId, 'sfx_bark_radio');
  assert.equal(captions.filter((p) => p.shape === 'radio' && p.text === greeting.text).length, 1);
  h.timers.step(20000); assert.equal(receipts.length, 1); presenter.dispose();
});

test('actual audio adapter critical-squelch silent drop retries, then delivers', () => {
  const h = harness({ acknowledge: false }), host = Object.create(audio);
  host.state = h.state; host.bus = h.bus; host.rt = {};
  host.play = () => ({}); host._applyFactionSting = () => {};
  let critical = true; host._isCriticalSquelchActive = () => critical;
  h.bus.on('barkDirector:voice', (p) => host._onBarkVoice(p));
  h.presenter.show(); h.timers.step(4000); assert.equal(h.receipts.length, 0);
  critical = false; h.timers.step(600); assert.equal(h.receipts.length, 1); h.presenter.dispose();
});

test('live station onShow preserves berth request and delivers via the existing receipt/history', (t) => {
  const restore = installDom();
  const timers = clock();
  t.mock.method(globalThis, 'setTimeout', timers.setTimeout);
  t.mock.method(globalThis, 'clearTimeout', timers.clearTimeout);
  const state = fixture(), bus = createBus();
  state.ui.stageRequest = { scene: 'berth', hullDefId: state.player.ownedShips[state.player.activeShipIndex].defId };
  const expectedStage = { ...state.ui.stageRequest };
  bus.on('barkDirector:voice', (p) => bus.emit('presentation:caption', { shape: 'radio', text: p.text }));
  const ctx = { state, bus, screenMemory: { read: () => null, write() {}, get: () => null, set() {} } };
  const app = createStationApp(new FakeEl(), ctx, { arrivalTimers: timers, serviceQuote: () => ({ amount: 0, cost: 0, detail: 'ok', buttonLabel: 'Do', disabled: false, chips: [] }) });
  t.after(() => { try { app.dispose(); } finally { restore(); } }); app.onShow();
  assert.deepEqual(state.ui.stageRequest, expectedStage);
  timers.step(4000);
  const receipt = app.el.querySelector('.sx-receipt');
  assert.equal(receipt.hidden, false);
  assert.equal(receipt.querySelector('.sx-receipt__title').textContent, buildStationArrivalGreeting(state, 'station_helios').text);
  assert.equal(receipt.querySelector('.sx-receipt__kind').textContent, 'Koda Craine');
  assert.equal(receipt.querySelector('.sx-receipt__delta').textContent, 'Bar');
  app.refresh(); app.onHide(); app.onShow(); timers.step(10000);
  assert.equal(receipt.hidden, true, 'refresh/modal does not replay a delivered greeting');
});

test('live Bar updates owner-backed recognition only while visible and keeps selected identity/face', (t) => {
  const restore = installDom(); t.after(restore);
  const state = fixture(), bus = createBus(), owner = Object.create(stationContacts);
  owner.init({ state, bus }); t.after(() => owner.destroy());
  const screen = createBarScreen({ state, bus }); t.after(() => screen.dispose());
  screen.onShow();
  const rail = screen.el.querySelector('.sx-bar__rail'), stage = screen.el.querySelector('.sx-bar__stage');
  const host = barkeep(state);
  const button = new FakeEl('button'); button.setAttribute('data-contact', host.id);
  const target = { closest: (sel) => sel === '[data-contact]' ? button : null };
  for (const handler of rail._listeners.click || []) handler({ target });
  assert.match(stage.innerHTML, /Koda Craine/);
  assert.match(stage.innerHTML, /They look up from the counter\./);
  const beforeFace = stage.querySelector('[data-bigpic]').lastChild.src;
  assert.match(beforeFace, /barkeep_16\.jpg$/);
  let talks = 0; bus.on('ui:talkContact', () => talks++);
  for (const choiceId of ['rumors', 'word', 'drink']) bus.emit('ui:talkContact', { contactId: host.id, stationId: 'station_helios', name: host.name, choiceId });
  assert.match(rail.innerHTML, /barkeep · Trusted/);
  assert.match(stage.innerHTML, /They kept a place for you\./);
  assert.match(stage.innerHTML, /Koda Craine/);
  assert.equal(stage.querySelector('[data-bigpic]').lastChild.src, beforeFace);
  state.factions[host.factionId].rep = -30; bus.emit('faction:repChanged', { factionId: host.factionId });
  assert.match(stage.innerHTML, /They keep the paperwork between you\./);
  screen.onHide(); const hidden = stage.innerHTML;
  state.factions[host.factionId].rep = 150; bus.emit('faction:repChanged', { factionId: host.factionId });
  assert.equal(stage.innerHTML, hidden);
  screen.onShow(); assert.match(stage.innerHTML, /They kept a place for you\./);
  assert.equal(talks, 3, 'only explicit choices may emit talk intents');
});

test('dock transition owner rejects stale raw actor notifications before any arrival visit', () => {
  const h = harness(); h.presenter.show(); h.timers.step(4000);
  assert.equal(commitDockedUiState(h.state, { stationId: 'station_ceres', shipId: -999 }, h.bus), false);
  h.bus.emit('dock:docked', { stationId: 'station_ceres', shipId: -999 }); h.timers.step(10000);
  assert.equal(h.voices.length, 1); h.presenter.dispose();
});

test('actual berth renderer draws three props and the player hull at frozen sim time; presentation motion respects reduced motion', async (t) => {
  const reset = () => { releaseUiStage('r431-test'); releaseUiStagePrewarm('r431-test'); setUiStagePartLoaderForTest(null); };
  reset(); t.after(reset);
  for (const motionReduce of [false, true]) {
    reset(); const loads = [], frames = [];
    setUiStagePartLoaderForTest(async (url) => {
      loads.push(url);
      return { primitives: [{ name: `${url}#0`, geometry: new THREE.BoxGeometry(1, 1, 1), material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4() }] };
    });
    let target = null; const clear = new THREE.Color();
    const renderer = {
      domElement: { isConnected: false }, autoClear: true, shadowMap: { enabled: false }, info: { programs: [] },
      render(scene, camera) { frames.push({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), children: scene.children.length }); },
      compileAsync: async () => {}, initTexture() {}, getSize: (v) => v.set(1280, 720),
      getRenderTarget: () => target, setRenderTarget(next) { target = next; },
      getClearColor: (out) => out.copy(clear), getClearAlpha: () => 1, setClearColor(color) { clear.set(color); },
    };
    const state = fixture(); state.settings.video.motionReduce = motionReduce;
    state.ui.stageRequest = { scene: 'berth', hullDefId: 'ship_kestrel' };
    const render = { renderer }, sim = state.simTime;
    presentUiStage({ render, state });
    for (let i = 0; i < 200 && uiStageReport().phase !== 'live'; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(uiStageReport().phase, 'live');
    frames.length = 0;
    for (let i = 0; i < 10; i++) {
      assert.equal(presentUiStage({ render, state, frameDt: 0.1 }), true);
      assert.equal(uiStageReport().hullDrawn, true); assert.equal(uiStageReport().props, 3);
    }
    assert.equal(loads.length, 4); assert.equal(state.simTime, sim);
    assert.ok(frames.length >= 10); assert.ok(frames.every((f) => f.children > 3));
    if (motionReduce) assert.deepEqual(frames[0].position, frames.at(-1).position);
    else assert.notDeepEqual(frames[0].position, frames.at(-1).position);
  }
});

