// DEMO-ADV-2 — the Adventure opening speaks with one voice.
//
// Three facts about the first ninety seconds of a New Game, each proved over the real systems:
//
//   1. The FIRST instruction is the rope. missions installs and tracks the 47-A cold-start
//      contract on game:started (it inits before onboarding), so for the ~1.2 s until the rail's
//      first update tick the tracker and the minimap showed 'Recover 47-A from marked rock ↗ 1.1 km'
//      before the rope lesson took the slot. The opening objective is now seated on the flight
//      frame the rail begins on, so the second write is a no-op.
//   2. The throw lesson is one voice. While the swing beat is current the payoff receipts it earns
//      (Level 2 in the Pilot Tree, the 'Light Ships Are Ammunition' deed) wait for the throw, and
//      the generic swing-threat read — which cannot tell the lesson's own rock from a hostile line —
//      keeps its picture and its sound but drops its words.
//   3. The berth-course retire matches only the course the berth key laid. It used to delete any
//      course within station radius + 200 m and wrote nav.waypoint = null without publishing
//      nav:waypoint, leaving the HUD and radar drawing a marker the sim no longer held.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { BEATS, onboarding } from '../src/systems/onboarding.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { runSession as runSessionProto } from '../src/systems/runSession.js';
import { installAchievements, resetAchievementsForTests } from '../src/systems/achievements.js';
import { audio } from '../src/audio/audioSystem.js';
import { createToasts } from '../src/ui/toasts.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { RESCUE_PROOF_SEED } from '../src/onboarding/rescueOpening.js';
import { openingQuiet, openingThrowLessonCurrent, openingThrowPayoffWait } from '../src/onboarding/openingQuiet.js';
import { resolveFlightObjectiveCommand } from '../src/ui/hud.js';

// ── A minimal DOM, enough for the toast lane and the onboarding panel ─────────────────
function stubElement() {
  return {
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '',
    classList: { values: new Set(), contains(c) { return this.values.has(c); }, add(...v) { v.forEach((x) => this.values.add(x)); }, remove(...v) { v.forEach((x) => this.values.delete(x)); }, toggle() {} },
    appendChild(child) { if (child) { child.parentNode = this; this.children.push(child); } return child; },
    append(...kids) { kids.forEach((k) => this.appendChild(k)); },
    prepend(child) { if (child) { child.parentNode = this; this.children.unshift(child); } return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    remove() {},
    setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, removeAttribute() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    isConnected: true,
  };
}

function installDom({ splashUp = false } = {}) {
  const byId = new Map();
  for (const id of ['toasts', 'toast-live', 'hud']) {
    const el = stubElement();
    el.id = id;
    byId.set(id, el);
  }
  const body = stubElement();
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => byId.get(id) || null,
    // `_tryAdvanceBeat` reads this node to decide whether B0 may fire; a real first-run New Game
    // has it mounted for ~3.1 s.
    querySelector: (sel) => (splashUp && sel === '.sf-firstrun-splash' ? stubElement() : null),
    createElement: () => stubElement(),
    head: stubElement(),
    body,
    documentElement: { dataset: {} },
    activeElement: null,
  };
  return { byId, body, restore: () => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; } };
}

// ── The production-shaped rail harness (same route test/fix-03 uses) ──────────────────
function mapStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(String(key)),
  };
}

function makeRailState() {
  const state = createGameState(RESCUE_PROOF_SEED);
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    data: { weapons: [{ defId: 'pulse_laser_s', _heat: 0, heatMax: 100 }], combat: {}, ai: {} },
  });
  player.id = 1;
  state.mode = 'flight';
  state.simTime = 10;
  state.tick = 40;
  state.playerId = 1;
  state.player.hints = {};
  state.player.targetId = null;
  state.player.heat = 0;
  state.player.credits = NEW_GAME.credits;
  state.entities = new Map([[1, player]]);
  state.entityList = [player];
  state.nextEntityId = 10;
  state.nav = {};
  state.combat = { attachments: { byId: {} } };
  state.world.currentSectorId = 'sector_helios_prime';
  if (!state.world.activeSector) state.world.activeSector = { stations: [], gates: [] };
  state.story = { beatIndex: 0 };
  state.ui.dockedStationId = null;
  state.settings.gameplay = Object.assign({}, state.settings.gameplay, { tutorialHints: true });
  return state;
}

function bootRail() {
  const bus = createBus();
  const state = makeRailState();
  const emitted = [];
  const helpers = {
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
    hash32,
    mulberry32,
    voice: { say: () => true },
  };
  const systems = new Map();
  const registry = { get: (name) => systems.get(name) || null };
  const missions = Object.create(missionsProto);
  missions.init({ state, bus, helpers, registry });
  systems.set('missions', missions);
  const sys = Object.create(onboarding);
  sys.init({ state, bus, helpers, registry });
  bus.on('nav:waypoint', (p) => emitted.push(p));
  helpers.spawnEntity({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: 620, z: 140 }, radius: 42,
    data: { stationId: 'station_helios', name: 'Helios Station', dockRadius: 80, factionId: 'faction_scn' },
  });
  return { bus, state, sys, helpers, missions, registry, navEmits: emitted };
}

function tickRail(h, dt = 0.25) {
  h.state.simTime += dt;
  h.sys.update(dt, h.state);
}

function driveToSwing(h) {
  h.bus.emit('game:started', {});
  tickRail(h);
  const derelictId = h.sys._derelictId;
  assert.ok(derelictId != null, 'the tether lesson stages its derelict');
  h.state.player.targetId = derelictId;
  h.bus.emit('tether:latched', { targetId: derelictId });
  h.bus.emit('tether:released', { targetId: derelictId });
  tickRail(h);
  tickRail(h, 5);
  assert.equal(h.state.onboarding.rescue.current, 'swing', 'the rail reaches the throw lesson');
}

// ══ 1 — the first instruction is seated with the first flight frame ═════════════════

test('DEMO-ADV-2: the rope is the tracked instruction on the frame the opening begins', () => {
  const h = bootRail();
  h.bus.emit('game:started', {});
  // No update tick has run yet: this is the first flight frame, which is where the tracker and the
  // minimap read their line.
  const wp = h.state.nav.waypoint;
  assert.ok(wp, 'the opening owns the objective slot before the first tick');
  assert.equal(wp.onboarding, true, 'the objective is the rail\'s, not the contract\'s');
  assert.equal(wp.markerId, 'onboarding:tether', 'the first instruction is the rope lesson');
  assert.equal(wp.reason, 'Latch the loose rock. (F / RMB)', 'the line names the verb the player is asked for');
  assert.equal(wp.label, 'Loose rock');
  assert.equal(h.state.onboarding.currentBeat, -1, 'seating the objective does not advance the rail');
  // The first tick writes the same objective, so nothing flickers or restarts.
  const before = { ...wp, pos: { ...wp.pos } };
  tickRail(h);
  const after = h.state.nav.waypoint;
  assert.equal(after.markerId, before.markerId);
  assert.equal(after.reason, before.reason);
  assert.deepEqual(after.pos, before.pos, 'the tick is a no-op on the seated objective');
});

test('DEMO-ADV-2: the seat survives the splash-gated ticks that have no beat to own it', () => {
  const dom = installDom({ splashUp: true });
  try {
    const h = bootRail();
    h.bus.emit('game:started', {});
    // A real New Game puts the first-run splash up before the rail's first tick, and B0 waits for it
    // to come down. The reviewer caught that the seat was undone here: with no beat current the
    // objective write fell through to "no target" and nulled the mark, so the tracker showed the
    // tracked 47-A contract for the splash's whole life — the flicker this packet exists to remove.
    h.bus.emit('ui:firstRunSplash:active', { line: 'Helios System · Third Shift Arrival' });
    assert.equal(h.sys._firstRunSplashPending, true, 'the splash gates B0');
    for (let i = 0; i < 12; i++) tickRail(h); // 3 s of splash
    const wp = h.state.nav.waypoint;
    assert.ok(wp, 'the rope keeps the objective slot while the splash holds B0 back');
    assert.equal(wp.markerId, 'onboarding:tether');
    assert.equal(wp.reason, 'Latch the loose rock. (F / RMB)');
    assert.equal(h.state.onboarding.currentBeat, -1, 'and the rail still has not started');
  } finally {
    dom.restore();
  }
});

test('DEMO-ADV-2: the opening speaks first over the 47-A contract in the splash window', () => {
  const dom = installDom({ splashUp: true });
  try {
    const h = bootRail();
    h.bus.emit('game:started', {});
    h.bus.emit('ui:firstRunSplash:active', { line: 'Helios System · Third Shift Arrival' });
    tickRail(h);
    // What the HUD does every frame: no nav waypoint means the tracked contract gets the slot.
    const command = resolveFlightObjectiveCommand(h.state);
    assert.notEqual(command?.owner, 'tracked-mission',
      'the splash cannot fall back to the contract while the rope is the instruction');
    assert.equal(command?.waypoint?.markerId, 'onboarding:tether',
      'the resolver reads the rail\'s own mark');
  } finally {
    dom.restore();
  }
});

test('DEMO-ADV-2: a boot that names a scenario slice seats nothing', () => {
  const h = bootRail();
  h.bus.emit('game:started', { scenario: '47a' });
  assert.equal(h.state.nav.waypoint, undefined,
    'harness boots own their own cast and their own objective');
});

test('DEMO-ADV-2: the 47-A contract document being loaded is not a scenario-slice signal', () => {
  // Every production boot loads `47a.scenario.json` into helpers.scenarioContract (main.js) and
  // scenarioRuntime writes `state.scenario.active` as an OBJECT (id/hash/beat window) on its first
  // flight tick. The seat's first version read both as "this run is a slice" and so never ran in the
  // real game at all — the objective only appeared on the rail's first tick, 1.5 s in, after the
  // splash had already shown the contract. Pin the ordinary boot: both facts present, seat still on.
  const h = bootRail();
  // What main.js always sets, and what the slice harnesses would additionally carry.
  h.sys.helpers.scenarioContract = { id: 'scenario_47a_mass_variance', schema: 'spaceface.scenarioContract.v1' };
  h.state.scenario = {
    active: { id: 'scenario_47a_mass_variance', activeBeatId: null, contractHash: 'abc' },
    facts: {}, actorBindings: {}, unresolvedActorIds: [], enteredBeatIds: [], evidence: {},
  };
  h.bus.emit('game:started', {});
  const wp = h.state.nav.waypoint;
  assert.ok(wp, 'the ordinary route seats the rope even with the contract document loaded');
  assert.equal(wp.markerId, 'onboarding:tether');
  assert.equal(wp.reason, 'Latch the loose rock. (F / RMB)');
  assert.equal(h.state.onboarding.currentBeat, -1, 'and no beat has started yet');
});

// ══ 2 — the throw lesson keeps one voice ════════════════════════════════════════════

test('DEMO-ADV-2: the throw lesson is one voice — no swing-threat words, no early payoff', () => {
  const h = bootRail();
  driveToSwing(h);
  assert.equal(openingThrowLessonCurrent(h.state), true, 'the swing beat is current');
  assert.equal(openingQuiet(h.state), true, 'the opening still holds the glass');
  assert.equal(openingThrowPayoffWait(h.state), true, 'and its payoffs are waiting');
  // The lesson ends the beat, and the opening stops holding once the throw lands.
  h.bus.emit('massline:throw', { payloadId: h.state.onboarding.rescue.ids.rock });
  assert.equal(h.state.onboarding.rescue.beats.swing.state, 'done');
  assert.equal(openingThrowLessonCurrent(h.state), false, 'the throw closes the lesson');
  assert.equal(openingQuiet(h.state), true, 'the rest of the opening still owns the glass');
  // But the instruction is still on the tracker until the rail's next tick writes the berth, so the
  // payoff keeps waiting for exactly that beat (the review's item 2b hole).
  assert.equal(openingThrowPayoffWait(h.state), true,
    'the instruction that earned the payoff is still up: the wait outlasts the beat flag');
  tickRail(h);
  assert.equal(h.state.nav.waypoint?.markerId, 'onboarding:berth', 'the next instruction takes the slot');
  assert.equal(openingThrowPayoffWait(h.state), false, 'and the payoff is free to speak');
});

test('DEMO-ADV-2: the generic swing threat drops its words but keeps its world feedback', () => {
  const h = bootRail();
  driveToSwing(h);
  const ui = [];
  const captions = [];
  const vfx = [];
  const audio = [];
  h.bus.on('presentation:uiCue', (p) => ui.push(p));
  h.bus.on('presentation:caption', (p) => captions.push(p));
  h.bus.on('presentation:vfxCue', (p) => vfx.push(p));
  h.bus.on('presentation:audioCue', (p) => audio.push(p));
  const sys = Object.create(presentationAdapters);
  sys.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: h.registry });
  const cue = {
    id: 'massline.threat',
    sourceEvent: 'massline:threat',
    targetId: h.state.onboarding.rescue.ids.rock,
    playerRelevance: 0.88,
    importance: 0.74,
    magnitude: 60,
    lanes: { camera: 'camera.threat_composition', vfx: 'vfx.massline_threat', audio: 'audio.massline_threat', ui: 'ui.threat_warning', accessibility: 'accessibility.directional_warning' },
    budgets: { cameraTrauma: 0.06, particles: 20, voices: 2, uiPulses: 1 },
    tags: ['critical', 'tether', 'threat'],
  };
  h.bus.emit('presentation:cue', cue);
  assert.equal(ui.some((p) => p.cueId === 'massline.threat'), false,
    'no SWING THREAT banner over the instruction asking for the throw');
  assert.equal(captions.some((p) => /swing threat/i.test(String(p.text || ''))), false,
    'no spoken "Swing threat detected." over it either');
  assert.ok(audio.some((p) => p.cueId === 'massline.threat'), 'the sting still plays');
  assert.ok(vfx.some((p) => p.id === 'massline.threat'), 'the spark still draws');
  // A named hostile action is not the lesson and still speaks.
  ui.length = 0;
  h.bus.emit('presentation:cue', { ...cue, id: 'massline.counter_tether.cut', tags: ['critical', 'tether', 'counter_tether'] });
  assert.ok(ui.some((p) => p.cueId === 'massline.counter_tether.cut'),
    'an enemy preparing to cut the line is still said out loud');
});

test('DEMO-ADV-2: a level-up earned by the throw waits for the throw', () => {
  const dom = installDom();
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  try {
    const h = bootRail();
    driveToSwing(h);
    const toasts = createToasts({ bus: h.bus, state: h.state });
    const lane = dom.byId.get('toasts');
    const texts = () => lane.children.map((el) => String(el._sfRec ? el._sfRec.text : ''));
    // The receipts the probe caught inside the throw's six seconds, raised by their real emitters:
    // runSession's awardAdventureXp ('pilot:xpEarned' -> the level toast) and the achievements
    // ledger ('achievement:unlocked'). Both are installed on this bus the way main.js installs them.
    const runSession = Object.create(runSessionProto);
    runSession.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: h.registry });
    const ledger = installAchievements({
      bus: h.bus, state: h.state, storage: mapStorage(), shell: null, voice: false,
    });
    try {
      h.bus.emit('pilot:xpEarned', { xp: 260, source: 'mine', label: 'Mined 40 units of ore' });
      assert.equal(h.state.player.pilot.level, 3, 'the award is a real Adventure level — the 22 s beat the probe caught');
      assert.equal(h.state.onboarding.rescue.current, 'swing', 'and it lands inside the throw lesson');
      assert.deepEqual(texts(), [], 'nothing drew over the sentence asking for the throw');

      // The throw itself earns the deed (achievements counts a thrown body) and closes the beat.
      h.bus.emit('massline:throw', {
        payloadId: h.state.onboarding.rescue.ids.rock, payloadSpeed: 38, payloadGeneration: 0,
        tick: h.state.tick, time: h.state.simTime,
      });
      assert.equal(h.state.onboarding.rescue.beats.swing.state, 'done', 'the throw lands the lesson');
      // The throw closes the beat flag in this dispatch — but the sentence asking for the throw is
      // still the tracked objective until the rail writes the next beat. The receipt must not
      // speak into that gap: a toast frame here is the exact leak the review found.
      toasts.tick();
      assert.deepEqual(texts(), [], 'the receipt does not speak between the throw and the next instruction');
      // The rail writes the next instruction on its following tick; the held payoff speaks after it.
      tickRail(h);
      toasts.tick();
      const drawn = texts().filter((t) => t !== 'Line strain');
      assert.ok(drawn.some((t) => /^Level \d+: \d+ points? to spend \(T\)$/.test(t)),
        `the level paid by the throw speaks once the instruction has left: ${JSON.stringify(drawn)}`);
      // A warning is not a payoff and never waited.
      toasts.push({ text: 'Line strain', kind: 'warn', ttl: 2 });
      assert.ok(texts().some((t) => t === 'Line strain'), 'a warning is never held');
    } finally {
      ledger.dispose({ flush: false });
      resetAchievementsForTests();
      toasts.destroy();
    }
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
    dom.restore();
  }
});

test('DEMO-ADV-2: the deed and its fanfare wait for the instruction that earned them', () => {
  // The real audio system's own subscriptions, with play() stubbed: what this proves is the
  // dispatch — a deed unlocked by the throw does not reach play() or the caption lane while the
  // sentence asking for the throw is still on the tracker, and does once that sentence is gone.
  const h = bootRail();
  driveToSwing(h);
  const played = [];
  const captions = [];
  const host = Object.create(audio);
  host.init({ state: h.state, bus: h.bus, helpers: {} });
  try {
    host.play = (recipeId) => { played.push(recipeId); return null; };
    host._emitNamedCaption = (text) => { captions.push(String(text || '')); };
    h.bus.on('presentation:caption', (p) => captions.push(String((p && p.text) || '')));

    h.bus.emit('achievement:unlocked', { id: 'light_ships_are_ammunition', name: 'Light Ships Are Ammunition', category: 'massline' });
    assert.deepEqual(played, [], 'no fanfare over the sentence asking for the throw');
    assert.equal(captions.some((t) => /Light Ships Are Ammunition/.test(t)), false,
      'and no caption speaking over it');

    // The throw lands. It clears rescue.current in this dispatch — the very reason the old hold
    // missed — so the payoff must still wait for the rail's next tick to take the sentence down.
    h.bus.emit('massline:throw', { payloadId: h.state.onboarding.rescue.ids.rock, payloadSpeed: 38 });
    host._drainOpeningPayoffs();
    assert.deepEqual(played, [], 'the beat flag alone closing is not the moment the line leaves');

    tickRail(h);
    host._drainOpeningPayoffs();
    assert.deepEqual(played, ['sfx_achievement_fanfare'], 'the fanfare plays once the instruction is gone');
    assert.equal(captions.filter((t) => /Light Ships Are Ammunition/.test(t)).length, 1,
      'and its caption speaks exactly once');
  } finally {
    host.destroy();
  }
});

// ══ 3 — the berth-course retire matches only the opening's own run ══════════════════

test('DEMO-ADV-2: docking retires the berth key\'s course and publishes the clear', () => {
  const h = bootRail();
  h.bus.emit('game:started', {});
  tickRail(h);
  // What ui/input.js plots when the player presses [E] Fly to berth: world carries the stamp.
  h.state.nav.waypoint = {
    kind: 'local', label: 'Helios Station', reason: 'Helios Station',
    pos: { x: 620, z: 140 }, berthAutopilot: true, berthStationId: 'station_helios',
  };
  h.navEmits.length = 0;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.nav.waypoint, null, 'the finished berth run is cleared');
  assert.deepEqual(h.navEmits, [null], 'and the clear is published, so the HUD stops drawing it');
});

test('DEMO-ADV-2: a course the pilot plotted near the station outlives the dock', () => {
  const h = bootRail();
  h.bus.emit('game:started', {});
  tickRail(h);
  // A chart course to the same station, 40 m from its centre — well inside the old reach.
  const plotted = {
    kind: 'local', label: 'Helios Station', reason: 'Set course',
    pos: { x: 660, z: 140 },
  };
  h.state.nav.waypoint = plotted;
  h.navEmits.length = 0;
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.state.nav.waypoint, plotted, 'the pilot\'s own plan is not the opening\'s run');
  assert.equal(h.navEmits.length, 0, 'and nothing published a clear');
});

test('DEMO-ADV-2: a berth run retargeted elsewhere is no longer the opening\'s to retire', () => {
  const h = bootRail();
  h.bus.emit('game:started', {});
  tickRail(h);
  h.state.nav.waypoint = {
    kind: 'local', label: 'Helios Station', reason: 'Helios Station',
    pos: { x: 620, z: 140 }, berthAutopilot: true, berthStationId: 'station_helios',
  };
  h.bus.emit('dock:docked', { stationId: 'station_tethys' });
  assert.equal(h.state.nav.waypoint?.berthStationId, 'station_helios',
    'docking somewhere else does not retire the run to another station');
});

test('DEMO-ADV-2: the berth key stamps the course it plots', () => {
  const source = readFileSync(new URL('../src/ui/input.js', import.meta.url), 'utf8');
  const fly = source.slice(source.indexOf('function flyToBerth'), source.indexOf('function flyToBerth') + 1200);
  assert.match(fly, /berthAutopilot: true/, 'the course records that the berth key laid it');
  assert.match(fly, /berthStationId:/, 'and the stable station id it was laid to');
  const world = readFileSync(new URL('../src/systems/world.js', import.meta.url), 'utf8');
  assert.match(world, /payload\.berthAutopilot === true \? \{ berthAutopilot: true \}/,
    'the sim carries the stamp onto the waypoint it builds');
});

test('DEMO-ADV-2: BEATS[0] is the rope — the first instruction the seat names', () => {
  assert.equal(BEATS[0].key, 'tether');
});
