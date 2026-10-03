// infer — "The ending archive is reachable."
//
// `ui:endingArchiveOpen` was the last dead world-seam intent: the story owner answered it
// (story.js re-emits `endgame:archive` for a filed manuscript) and the Codex Archive tab read
// it — but nothing on the player route ever SENT the intent, and nothing opened the codex on
// demand. The player route is now the pause menu's 'Ending Archive' entry (Media group), shown
// only once the story owner has filed the written ending (state.story.writtenFinale).
//
// This test pins both ends of that seam:
//   1. Behavior — a forked story owner re-emits `endgame:archive` exactly once per
//      `ui:endingArchiveOpen`, the natural write path still emits it at filing time, and the
//      intent stays silent when no ending has been written.
//   2. Menu wiring — the real pause screen renders 'Ending Archive' ONLY when the ending flag
//      is set; picking it pushes the codex and emits `ui:endingArchiveOpen` on the bus.
//      The codex deep-link (`requestCodexTab('Archive')`) mutates codex module state with no
//      exported reader, so it is pinned by the narrowest source anchor instead.
//
// Run: node --test test/infer-ending-archive-entry.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { mulberry32 } from '../src/core/rng.js';
import { ENDGAME_NET_WORTH_CR, ENDGAME_REP_MIN } from '../src/story/endings/endingDefs.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { story as storyProto } from '../src/systems/story.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { pauseScreen, ENDING_ARCHIVE_LABEL } from '../src/ui/screens/pause.js';

const SEED = 4242;

/* ────────────────────────── layer 1: story behavior ────────────────────────── */

/** A resolved-ending-ready captain: B7 cleared, Concord-qualified for Choice A. */
function makeState(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 1000;
  state.meta = state.meta || {};
  state.meta.seed = seed;
  state.playerId = 1;
  state.entities = state.entities || new Map();
  state.entities.set(1, { id: 1, team: 'player', pos: { x: 0, y: 0, z: 0 }, flags: {} });
  state.player.credits = ENDGAME_NET_WORTH_CR;
  state.player.heat = 0.4;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80, capMass: 200 };
  state.player.ownedShips = [{ defId: 'ship_bastion', fittings: [] }];
  state.factions = state.factions || {};
  for (const id of ['faction_scn', 'faction_mts', 'faction_free', 'faction_dmc']) {
    state.factions[id] = { rep: 0, aggro: false };
  }
  state.story.beatIndex = 7;
  state.story.branch = 'patrol';
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
  state.story.endgameDeclined = [];
  state.story.endgamePending = null;
  state.factions.faction_scn.rep = ENDGAME_REP_MIN;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_ashfall_reach';
  state.missions = state.missions || { active: [], boards: {}, completedLog: [] };
  state.missions.active = [];
  state.claims = { bodies: [{ id: 'claim_test' }] };
  state.careers = { origins: { hunter: { status: 'completed', acceptedAtS: 1 } } };
  return state;
}

function makeHarness(seed = SEED) {
  const state = makeState(seed);
  const bus = createBus();
  const archives = [];
  bus.on('endgame:archive', (p) => archives.push(p));
  const story = Object.assign({}, storyProto);
  const heat = Object.assign({}, heatProto);
  const missions = Object.assign({}, missionsProto);
  const registry = { get: (n) => (n === 'story' ? story : n === 'heat' ? heat : n === 'missions' ? missions : null) };
  const helpers = { mulberry32, voice: { say: () => true } };
  const ctx = { state, bus, helpers, registry };
  heat.init(ctx);
  missions.init(ctx);
  story.init(ctx);
  return { state, bus, story, archives };
}

test('filing the ending emits endgame:archive from the natural write path', () => {
  const h = makeHarness();
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });

  assert.equal(h.state.story.endgameResolved, true, 'the ending resolved');
  assert.equal(h.archives.length, 1, 'exactly one archive emission at filing time');
  assert.equal(h.archives[0].schema, 'spaceface.endingArchive.v1');
  assert.equal(h.archives[0].choiceId, 'A');
  assert.ok(h.archives[0].transmission.length > 0, 'the manuscript carries its transmission');
});

test('ui:endingArchiveOpen re-emits the filed manuscript exactly once per intent', () => {
  const h = makeHarness();
  h.bus.emit('ui:endgameChoose', { choice: 'A', confirm: true });
  assert.equal(h.archives.length, 1);

  h.bus.emit('ui:endingArchiveOpen');
  assert.equal(h.archives.length, 2, 'one re-emit for the intent');
  assert.equal(h.archives[1].schema, 'spaceface.endingArchive.v1');
  assert.equal(h.archives[1].receiptId, h.archives[0].receiptId, 'the same filed manuscript');
  assert.deepEqual(h.archives[1].transmission, h.archives[0].transmission);

  h.bus.emit('ui:endingArchiveOpen');
  assert.equal(h.archives.length, 3, 'still exactly one re-emit per intent');
});

test('ui:endingArchiveOpen stays silent when no ending has been written', () => {
  const h = makeHarness();
  h.state.story.writtenFinale = null;
  assert.equal(h.story.getWrittenEndingArchive(), null, 'no manuscript without a written finale');

  h.bus.emit('ui:endingArchiveOpen');
  assert.equal(h.archives.length, 0, 'the intent must not fabricate an archive');
});

/* ────────────────────────── layer 2: pause menu wiring ────────────────────────── */

/** Minimal display record that passes the same schema gate `writtenEndingArchive` applies. */
function filedEndingRecord() {
  return {
    schema: 'spaceface.writtenFinale.v1',
    choiceId: 'A',
    receiptId: 'test:receipt:1',
    title: 'THE CLEAN UNIFORM',
    subtitle: 'The record stands.',
    startedAtS: 900,
    nextAtS: 906,
    cursor: 1,
    completedAtS: 904,
    basis: { recordedAtS: 900, seed: SEED },
    beats: [{
      kind: 'comms', id: 'test:receipt:1:transmission:0', ordinal: 0, delayS: 0,
      sender: 'CONCORD ADMIN', text: 'Service history: exemplary.', ttl: 6, phase: 0,
    }],
    epilogue: ['The record stands.'],
  };
}

function installMiniDom() {
  const previous = {
    document: globalThis.document, window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame, matchMedia: globalThis.matchMedia,
  };
  class Mini {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.listeners = new Map(); this._class = new Set(); this._text = '';
      this.hidden = false; this.tabIndex = 0; this.disabled = false;
      this.style = { setProperty() {}, removeProperty() {} };
      const owner = this;
      this.classList = {
        add(...names) { names.forEach((name) => name && owner._class.add(name)); },
        remove(...names) { names.forEach((name) => owner._class.delete(name)); },
        contains(name) { return owner._class.has(name); },
      };
      this.dataset = new Proxy(Object.create(null), {
        set(target, key, value) { target[key] = value; owner.attributes.set('data-' + String(key), String(value)); return true; },
        deleteProperty(target, key) { delete target[key]; owner.attributes.delete('data-' + String(key)); return true; },
      });
    }
    get className() { return [...this._class].join(' '); }
    set className(value) { this._class.clear(); String(value || '').split(/\s+/).forEach((name) => name && this._class.add(name)); }
    get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; }
    set textContent(value) { this._text = String(value ?? ''); this.children = []; }
    set innerHTML(value) { if (value === '') this.textContent = ''; }
    getAttribute(name) { return name === 'class' ? this.className : (this.attributes.get(name) ?? null); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'class') this.className = value; }
    removeAttribute(name) { this.attributes.delete(name); }
    appendChild(child) { if (child) { child.parentElement = this; this.children.push(child); } return child; }
    append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(listener); }
    removeEventListener() {}
    dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this, type, preventDefault() {} }); }
    focus() { globalThis.document.activeElement = this; }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) {
      const matches = (node) => {
        if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
        if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1);
        if (selector.startsWith('[')) { const hit = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/); return !!hit && (hit[2] == null ? node.getAttribute(hit[1]) != null : node.getAttribute(hit[1]) === hit[2]); }
        return node.tagName === selector.toUpperCase();
      };
      const result = [];
      const visit = (node) => { for (const child of node.children) { if (matches(child)) result.push(child); visit(child); } };
      visit(this); return result;
    }
  }
  const body = new Mini('body');
  globalThis.document = { body, documentElement: body, head: new Mini('head'), activeElement: body, createElement: (tag) => new Mini(tag), getElementById: () => null };
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1280, innerHeight: 720 };
  globalThis.requestAnimationFrame = (fn) => { fn(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  return { restore() {
    globalThis.document = previous.document; globalThis.window = previous.window;
    globalThis.requestAnimationFrame = previous.requestAnimationFrame; globalThis.matchMedia = previous.matchMedia;
    if ('cancelAnimationFrame' in previous) globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    else delete globalThis.cancelAnimationFrame;
  } };
}

/** Mount the real pause screen with a capture bus and a pushScreen recorder. */
function mountPause(writtenFinale) {
  const dom = installMiniDom();
  try {
    const emitted = [];
    const pushes = [];
    const root = globalThis.document.createElement('div');
    const ctx = {
      state: {
        mode: 'paused',
        story: { writtenFinale: writtenFinale || null },
        missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' },
      },
      bus: { emit(event, payload) { emitted.push({ event, payload }); }, on() { return () => {}; } },
      screenManager: {
        pushScreen(id) { pushes.push(id); },
        popScreen() {}, hasScreen() { return true; },
      },
    };
    pauseScreen.mount(root, ctx);
    return { root, emitted, pushes, buttons: root.querySelectorAll('button') };
  } finally {
    dom.restore();
  }
}

const byLabel = (mounted, label) => mounted.buttons.find((button) => button.textContent.startsWith(label));

test('pause offers Ending Archive only when the ending is filed, and picking it opens the codex with the intent', () => {
  const withEnding = mountPause(filedEndingRecord());
  const entry = byLabel(withEnding, ENDING_ARCHIVE_LABEL);
  assert.ok(entry, 'Ending Archive is reachable when a written finale exists');
  assert.ok(byLabel(withEnding, 'Photo'), 'the Media group still renders alongside it');
  assert.deepEqual(
    withEnding.emitted.filter((e) => e.event === 'ui:endingArchiveOpen'),
    [],
    'mounting the menu alone must not emit the intent',
  );

  entry.dispatch('click');
  assert.deepEqual(withEnding.pushes, ['codex'], 'the entry opens the codex screen');
  const intents = withEnding.emitted.filter((e) => e.event === 'ui:endingArchiveOpen');
  assert.equal(intents.length, 1, 'exactly one ui:endingArchiveOpen per pick');
});

test('pause hides Ending Archive until an ending exists', () => {
  const withoutEnding = mountPause(null);
  assert.equal(byLabel(withoutEnding, ENDING_ARCHIVE_LABEL), undefined,
    'no Ending Archive entry before the story files an ending');
  assert.ok(byLabel(withoutEnding, 'Photo'), 'the rest of the menu is untouched');
});

test('a finale filed after mount opens the row on the next pause show (the mounted sheet re-gates)', () => {
  const dom = installMiniDom();
  try {
    const emitted = [];
    const root = globalThis.document.createElement('div');
    const state = {
      mode: 'paused',
      story: { writtenFinale: null },
      missions: { active: [] }, nav: {}, save: {}, meta: {}, ui: {}, run: { phase: 'inactive' },
    };
    const ctx = {
      state,
      bus: { emit(event, payload) { emitted.push({ event, payload }); }, on() { return () => {}; } },
      screenManager: { pushScreen() {}, popScreen() {}, hasScreen() { return true; } },
    };
    pauseScreen.mount(root, ctx);
    assert.equal(byLabel({ buttons: root.querySelectorAll('button') }, ENDING_ARCHIVE_LABEL), undefined,
      'mounted without a finale, the row is absent');

    state.story.writtenFinale = filedEndingRecord();
    pauseScreen.onShow(ctx);
    const entry = byLabel({ buttons: root.querySelectorAll('button') }, ENDING_ARCHIVE_LABEL);
    assert.ok(entry, 'the next show re-gates the mounted sheet and the row appears');
    entry.dispatch('click');
    assert.equal(emitted.filter((e) => e.event === 'ui:endingArchiveOpen').length, 1,
      'the late row works like a mounted one');

    pauseScreen.onHide(ctx);
  } finally {
    dom.restore();
  }
});

test('the entry deep-links the codex onto its Archive tab (source anchor: requestCodexTab has no exported reader)', () => {
  const src = readFileSync(
    new URL('../src/ui/screens/pause.js', import.meta.url), 'utf8',
  );
  assert.ok(src.includes("requestCodexTab('Archive')"),
    'the entry requests the codex Archive tab before pushing the screen');
  assert.ok(src.includes("emit('ui:endingArchiveOpen')"),
    'the entry emits the story intent the archive re-emit answers');
});
