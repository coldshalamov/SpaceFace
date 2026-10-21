// Row 457 slice: the first two minutes are readable to a muted stranger on seed 4242.
// The premise is captioned in the existing objective tracker from the opening tether lesson, the
// weapon hint is captioned, and news records history without speaking over the lesson.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { onboarding, BEATS } from '../src/systems/onboarding.js';
import { createMarketNews } from '../src/ui/marketNews.js';
import { paintTutorialTrackerCaption, tutorialTrackerCaptionText } from '../src/ui/hud.js';

const PREMISE = 'Contract 47-A: the manifest says one mass — your instruments say another.';
const WEAPON = 'Hitch is armed: fire the Pulse Laser S, then let the heat clear.';
const TETHER_LINE = 'Target the marked derelict.';

function makeState(overrides = {}) {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {
      weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }],
      combat: {},
      ai: {},
    },
  });
  player.id = 1;
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    tick: 0,
    mode: 'flight',
    settings: {
      gameplay: { tutorialHints: true },
      audio: { muted: true },
    },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
    ...overrides,
  };
  return state;
}

function makeHelpers(state) {
  return {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
}

function bootTutorial(overrides = {}) {
  const bus = createBus();
  const state = makeState(overrides);
  const helpers = makeHelpers(state);
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, helpers, sys };
}

function startAndReachTether(t) {
  t.bus.emit('game:started', {});
  const step = 1 / 60;
  for (let i = 0; i < 60 * 60; i++) {
    t.state.simTime += step;
    t.sys.update(step, t.state);
    const ob = t.state.onboarding;
    if (ob && ob.currentBeat === 0 && ob.active === true) return;
  }
  assert.fail('the opening tether lesson did not enter within 60 simulated seconds');
}

function captionById(state, id) {
  const list = state.onboarding && Array.isArray(state.onboarding.trackerCaptions)
    ? state.onboarding.trackerCaptions
    : [];
  return list.find((rec) => rec && rec.id === id) || null;
}

function fakeElement(tagName = 'div') {
  const el = {
    tagName: String(tagName).toUpperCase(),
    style: {},
    attributes: new Map(),
    children: [],
    isConnected: true,
    classList: {
      values: new Set(),
      contains(cls) { return this.values.has(cls); },
      toggle(cls, on) { if (on) this.values.add(cls); else this.values.delete(cls); },
    },
    setAttribute(key, value) { this.attributes.set(key, String(value)); },
    appendChild(child) { el.children.push(child); return child; },
  };
  let text = '';
  Object.defineProperty(el, 'textContent', {
    get() { return text + el.children.map((child) => child.textContent).join(''); },
    set(value) { text = value == null ? '' : String(value); el.children.length = 0; },
    enumerable: true,
  });
  return el;
}

test('muted opening hook: the first lesson captions 47-A while the waypoint keeps its verb', () => {
  const t = bootTutorial();
  const said = [];
  t.bus.on('tutorial:say', (payload) => said.push(payload));

  startAndReachTether(t);

  assert.equal(t.state.onboarding.active, true);
  assert.equal(BEATS[t.state.onboarding.currentBeat].key, 'tether', 'the tether lesson owns the opening');
  assert.equal(tutorialTrackerCaptionText(t.state), PREMISE,
    'a muted pilot reads the 47-A premise in the tracker');
  assert.equal(t.state.nav.waypoint.reason, TETHER_LINE,
    'the captioned premise never replaces the actionable waypoint verb');
  assert.ok(said.some((line) => line.text === PREMISE), 'tutorial audio still receives the premise');
});

test('caption timing is a 12s window, queued once, and never replayed by adjacent lessons', () => {
  const t = bootTutorial();
  startAndReachTether(t);
  const premise = captionById(t.state, 'premise');
  assert.ok(premise);
  assert.equal(premise.endAtS - premise.startAtS, 12, 'the caption is a twelve-second window');

  assert.equal(tutorialTrackerCaptionText(t.state), PREMISE, 'visible at the window start');
  t.state.simTime = premise.endAtS - 0.001;
  assert.equal(tutorialTrackerCaptionText(t.state), PREMISE, 'visible just before the end');
  t.state.simTime = premise.endAtS;
  assert.equal(tutorialTrackerCaptionText(t.state), '', 'absent exactly at the end');

  // Re-entering the same lesson must not append another premise record or restart its window.
  const tether = BEATS.find((beat) => beat.key === 'tether');
  t.state.onboarding.beatAction = tether.line;
  t.sys._enterBeat(tether);
  assert.equal(
    t.state.onboarding.trackerCaptions.filter((rec) => rec.id === 'premise').length,
    1,
    'resuming tether reuses its one premise caption',
  );
  assert.equal(captionById(t.state, 'premise').endAtS, premise.endAtS,
    're-entry does not restart the absolute caption window');

  // The old thrust-branch premise call is gone: entering thrust emits no premise line.
  const premiseSaidBefore = t.state.onboarding.tutorialLog
    .filter((line) => line.text === PREMISE).length;
  const thrust = BEATS.find((beat) => beat.key === 'thrust');
  t.state.onboarding.currentBeat = BEATS.indexOf(thrust);
  t.state.onboarding.beatAction = thrust.line;
  t.sys._enterBeat(thrust);
  const premiseSaidAfter = t.state.onboarding.tutorialLog
    .filter((line) => line.text === PREMISE).length;
  assert.equal(premiseSaidAfter, premiseSaidBefore, 'thrust no longer speaks the cold open');
});

test('weapon caption names Hitch and Pulse Laser S, queues behind the premise, and keeps the burst verb', () => {
  const t = bootTutorial();
  startAndReachTether(t);
  const premise = captionById(t.state, 'premise');
  t.state.simTime = premise.startAtS + 5;

  const burst = BEATS.find((beat) => beat.key === 'burst');
  t.state.onboarding.currentBeat = BEATS.indexOf(burst);
  t.state.onboarding.beatAction = burst.line;
  t.sys._enterBeat(burst);

  const weapon = captionById(t.state, 'weapon');
  assert.ok(weapon, 'the burst lesson captions the starter weapon');
  assert.match(weapon.text, /Hitch/);
  assert.match(weapon.text, /Pulse Laser S/);
  assert.doesNotMatch(weapon.text, /Kestrel/);
  assert.equal(weapon.text, WEAPON);
  assert.equal(weapon.startAtS, premise.endAtS,
    'overlapping crafted lines queue instead of overwriting the premise');
  assert.equal(t.state.nav.waypoint.reason, burst.line,
    'the burst objective is unchanged by the caption');

  t.state.simTime = premise.endAtS;
  assert.equal(tutorialTrackerCaptionText(t.state), WEAPON, 'the queued weapon line owns the next window');
});

test('the production tracker painter writes, shows, and expires the caption on a minimal DOM', () => {
  const t = bootTutorial();
  startAndReachTether(t);
  const line = fakeElement('div');

  assert.equal(paintTutorialTrackerCaption(line, t.state), true);
  assert.equal(line.textContent, PREMISE);
  assert.notEqual(line.style.display, 'none');
  assert.equal(line.classList.contains('sf-mt-urgent'), false,
    'a caption never inherits the objective deadline tone');

  const premise = captionById(t.state, 'premise');
  t.state.simTime = premise.endAtS;
  assert.equal(paintTutorialTrackerCaption(line, t.state), false);
  assert.equal(line.style.display, 'none', 'the expired caption is hidden');

  const states = [
    { label: 'inactive', mutate: (s) => { s.onboarding.active = false; } },
    { label: 'finished', mutate: (s) => { s.onboarding.finished = true; } },
    { label: 'hints-disabled', mutate: (s) => { s.settings.gameplay.tutorialHints = false; } },
    { label: 'non-flight', mutate: (s) => { s.mode = 'station'; } },
    { label: 'sealed Survival', mutate: (s) => { s.run = { kind: 'survival', phase: 'active' }; } },
  ];
  for (const entry of states) {
    const state = {
      simTime: premise.startAtS,
      mode: 'flight',
      settings: { gameplay: { tutorialHints: true } },
      onboarding: { active: true, finished: false, trackerCaptions: [{ ...premise }] },
    };
    entry.mutate(state);
    assert.equal(tutorialTrackerCaptionText(state), '', `${entry.label} state returns no caption`);
  }
});

test('captions survive a save round-trip with absolute timestamps, and malformed records clear safely', () => {
  const t = bootTutorial();
  startAndReachTether(t);
  const premise = captionById(t.state, 'premise');

  const saved = JSON.parse(JSON.stringify(t.sys.serialize()));
  assert.deepEqual(saved.trackerCaptions, [{
    id: 'premise',
    text: PREMISE,
    startAtS: premise.startAtS,
    endAtS: premise.endAtS,
  }]);

  const restored = bootTutorial();
  restored.sys.deserialize(saved);
  assert.deepEqual(restored.state.onboarding.trackerCaptions, saved.trackerCaptions,
    'the restored caption keeps its original expiry instead of restarting');

  // Missing field.
  const noField = { ...saved };
  delete noField.trackerCaptions;
  restored.sys.deserialize(noField);
  assert.deepEqual(restored.state.onboarding.trackerCaptions, [], 'a missing field defaults empty');

  // Malformed field: unknown id, empty text, invalid timestamps, duplicate id, more than two.
  restored.sys.deserialize({
    ...saved,
    trackerCaptions: [
      { id: 'other', text: 'nope', startAtS: 1, endAtS: 2 },
      { id: 'premise', text: '', startAtS: 1, endAtS: 2 },
      { id: 'premise', text: PREMISE, startAtS: 3, endAtS: 3 },
      { id: 'premise', text: PREMISE, startAtS: 4, endAtS: 16 },
      { id: 'premise', text: 'second copy', startAtS: 4, endAtS: 20 },
      { id: 'weapon', text: WEAPON, startAtS: 16, endAtS: 28 },
      { id: 'weapon', text: 'third copy', startAtS: 40, endAtS: 50 },
    ],
  });
  assert.deepEqual(restored.state.onboarding.trackerCaptions, [
    { id: 'premise', text: PREMISE, startAtS: 4, endAtS: 16 },
    { id: 'weapon', text: WEAPON, startAtS: 16, endAtS: 28 },
  ], 'only known, valid, deduplicated records survive, capped at two');

  const finished = Object.create(onboarding);
  finished.state = { onboarding: { active: false, finished: true } };
  assert.equal(finished.serialize(), null, 'a finished tutorial still serializes to null');
});

test('news records the headline and emits news:headline while the tutorial keeps the floor silent', () => {
  const bus = createBus();
  const voices = [];
  const toasts = [];
  const headlines = [];
  const state = {
    meta: { seed: 4242 },
    simTime: 8,
    onboarding: { active: true, finished: false },
    ui: {},
  };
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('news:headline', (payload) => headlines.push(payload));
  const news = createMarketNews({
    bus,
    state,
    helpers: {
      voice: {
        say(payload) { voices.push(payload); return true; },
      },
    },
  });
  try {
    bus.emit('economy:eventStarted', {
      type: 'shortage',
      eventId: 'rc457-shortage-1',
      stationId: 'station_helios',
      commodityId: 'cmdty_medical',
    });

    assert.equal(news.getLog().length, 1, 'the headline history still records the event');
    assert.equal(headlines.length, 1, 'news:headline still reaches other owners');
    assert.equal(headlines[0].stationId, 'station_helios');
    assert.equal(voices.length, 0, 'no news voice competes with the tutorial');
    assert.equal(toasts.length, 0, 'no news toast fallback competes with the tutorial');
  } finally {
    news.destroy();
  }
});

test('the ticker hides during the tutorial and restores retained history on tutorial:finished', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const timers = new Map();
  let nextTimer = 1;
  let ticker = null;
  const host = fakeElement('div');
  host.hidden = false;
  host.closest = () => ({
    hidden: false,
    querySelector: (selector) => (selector === '.sf-commtape__slots'
      ? { childElementCount: 1 }
      : null),
  });
  globalThis.document = {
    getElementById(id) {
      if (id === 'news-ticker') return host;
      if (id === 'sf-news-ticker') return ticker;
      return null;
    },
    createElement(tag) {
      const el = fakeElement(tag);
      el.appendChild = (child) => {
        el.children.push(child);
        return child;
      };
      return el;
    },
  };
  globalThis.window = {
    setTimeout(fn, ms) {
      const id = nextTimer++;
      timers.set(id, { fn, ms, cancelled: false });
      return id;
    },
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer) timer.cancelled = true;
    },
  };

  const bus = createBus();
  const state = {
    meta: { seed: 4242 },
    simTime: 5,
    onboarding: { active: false, finished: false },
    ui: {},
  };
  let news = null;
  try {
    news = createMarketNews({ bus, state, helpers: {} });
    ticker = host.children[0] || null;
    assert.ok(ticker, 'the ticker host mounts');
    bus.emit('economy:eventStarted', {
      type: 'shortage',
      eventId: 'rc457-ticker-1',
      stationId: 'station_helios',
      commodityId: 'cmdty_medical',
    });
    bus.emit('economy:eventStarted', {
      type: 'surplus',
      eventId: 'rc457-ticker-2',
      stationId: 'station_helios',
      commodityId: 'cmdty_food',
    });
    const retained = news.getLog()[0].text;
    assert.match(ticker.textContent, new RegExp(retained.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(host.hidden, false, 'news is visible outside the tutorial');
    assert.ok(timers.size >= 1, 'two retained headlines schedule a rotation');

    state.onboarding = { active: true, finished: false };
    bus.emit('tutorial:say', { text: PREMISE, atS: 6 });
    assert.equal(ticker.textContent, '', 'the tutorial hides the painted headline');
    assert.equal(host.hidden, true, 'the ticker host is hidden while the lesson owns attention');
    assert.equal(timers.size >= 1 && [...timers.values()].every((timer) => timer.cancelled), true,
      'the rotation timer is cancelled, not left to repaint over the lesson');

    state.onboarding = { active: false, finished: true };
    bus.emit('tutorial:finished', {});
    assert.match(ticker.textContent, new RegExp(retained.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      'the retained headline returns without another economy event');
    assert.equal(host.hidden, false);
    assert.equal(host.closest().hidden, false, 'a sibling comms slot keeps the tape host visible');
  } finally {
    if (news) news.destroy();
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
