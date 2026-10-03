// FB-114 — the first-hour rail and the pad tuning survive a save and a load.
//   1. A save written mid-rail resumes at the saved beat: the current step re-fires
//      its line, restages its props, and re-arms the waypoint — completed beats
//      never re-fire. The returning-pilot path (story mode + recap) is for rails
//      that had already finished.
//   2. controls.gamepad (override map, deadzone, invert) survives a settings
//      restore; the pad override map restores atomically like controls.bindings —
//      a slot that never rebound pad buttons does not inherit the live map.
// Run: node --test test/fb-onboarding-pad-save.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { RESCUE_PROOF_SEED } from '../src/onboarding/rescueOpening.js';
import {
  freshMissingThreeState,
  missingThreeBeatLine,
} from '../src/onboarding/missingThree.js';
import { freshRescueState } from '../src/onboarding/rescueOpening.js';
import { freshStoreSentenceState } from '../src/onboarding/storeSentence.js';
import { onboarding } from '../src/systems/onboarding.js';
import { save } from '../src/save/saveSystem.js';

function stubElement() {
  return {
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: { contains: () => false, add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function makeState() {
  const player = makeEntity({
    type: 'ship',
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: { weapons: [], combat: {}, ai: {} },
  });
  player.id = 1;
  return {
    meta: { seed: RESCUE_PROOF_SEED },
    simTime: 100,
    tick: 0,
    mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    input: { boost: false, autoTargetPath: { active: false, drawing: false, points: [] } },
    world: { activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
  };
}

function boot() {
  const bus = createBus();
  const state = makeState();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const sys = Object.create(onboarding);
  const seen = { firsthour: [] };
  bus.on('firsthour:started', (p) => seen.firsthour.push({ event: 'firsthour:started', ...p }));
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned, seen };
}

// A rail parked at `current`: earlier beats done, the named beat in flight, the
// rescue opening complete (its 'grab' prereq satisfied), and the claimed gate stamped.
function midRailState(current, doneKeys) {
  const three = freshMissingThreeState();
  three.startedAt = 40;
  three.current = current;
  for (const key of doneKeys) {
    three.beats[key].state = 'done';
    three.beats[key].doneAt = 50;
  }
  three.beats[current].state = 'current';
  const rescue = freshRescueState();
  rescue.completed = true;
  rescue.completedAt = 35;
  for (const key of Object.keys(rescue.beats)) {
    rescue.beats[key].state = 'done';
    rescue.beats[key].doneAt = 30;
  }
  return {
    active: true,
    finished: false,
    currentBeat: 6,
    beatDoneAt: { claimed: 60, raid: 55 },
    firedFollowups: {},
    oreCollected: 0,
    trainingOre: 0,
    tetherReeled: false,
    tetherBreaks: 0,
    beatAction: '',
    rescue,
    missingThree: three,
    storeSentence: { ...freshStoreSentenceState(), shown: true, shownAt: 12 },
  };
}

function loadWith(h, record) {
  h.sys.deserialize(record == null ? record : JSON.parse(JSON.stringify(record)));
  h.bus.emit('save:loaded', {});
  return h.state.onboarding;
}

test('a save at rail step N resumes at step N — line re-fired, props restaged, done beats kept', () => {
  const a = boot();
  a.state.onboarding = midRailState('well', ['boost', 'stroke']);
  const record = a.sys.serialize();
  assert.ok(record && record.missingThree, 'a mid-rail save serializes the rail');
  assert.equal(record.missingThree.current, 'well');
  assert.equal(record.missingThree.beats.boost.state, 'done');
  // Staged props are transient: the saved record carries no actor ids.
  assert.deepEqual(record.missingThree.ids, { scrap: null, clump: [], lane: [] });

  const b = boot();
  const ob = loadWith(b, record);
  const three = ob.missingThree;
  assert.equal(three.current, 'well', 'the rail resumes on the saved step');
  assert.equal(three.beats.well.state, 'current');
  assert.equal(three.beats.boost.state, 'done', 'completed beats stay done — no replay');
  assert.equal(three.beats.stroke.state, 'done');
  assert.equal(ob.active, true);
  // The well lesson's scrap prop is restaged next to the restored player.
  const scrap = b.spawned.find((e) => e.data && e.data.missingThreeRole === 'scrap');
  assert.ok(scrap, 'the well prop is restaged on resume');
  assert.equal(three.ids.scrap, scrap.id);
  // The current beat's line re-presents through the tutorial voice.
  const lines = (ob.tutorialLog || []).map((entry) => entry.text);
  assert.ok(lines.includes(missingThreeBeatLine('well')), 'the saved step re-presents its line');
  // firsthour:started belongs to a fresh rail — a resume never replays it.
  assert.equal(b.seen.firsthour.length, 0);
  // The returning-pilot story panel does not mount while a rail owns the resume.
  assert.notEqual(b.sys._storyMode, true);
});

test('a rail between beats resumes without a line replay', () => {
  const a = boot();
  a.state.onboarding = midRailState('stroke', ['boost']);
  a.state.onboarding.missingThree.current = null;
  a.state.onboarding.missingThree.beats.stroke.state = 'pending';
  const record = a.sys.serialize();
  const b = boot();
  const ob = loadWith(b, record);
  assert.equal(ob.missingThree.current, null);
  assert.equal(ob.missingThree.beats.stroke.state, 'pending');
  assert.equal(ob.active, true, 'the rail stays armed — the advance check picks it up next tick');
  assert.notEqual(b.sys._storyMode, true);
});

test('a finished rail serializes nothing — the returning-pilot path owns the load', () => {
  const a = boot();
  a.state.onboarding = midRailState('cone', ['boost', 'stroke', 'well', 'repulsor', 'cone']);
  a.state.onboarding.missingThree.current = null;
  a.state.onboarding.missingThree.completed = true;
  a.state.onboarding.finished = true;
  assert.equal(a.sys.serialize(), null);

  const b = boot();
  b.state.onboarding = { active: false, finished: true };
  const ob = loadWith(b, null);
  assert.equal(ob.active, false, 'an absent slice resets to the pre-begin baseline');
  assert.equal(ob.finished, false);
  assert.ok(ob.missingThree == null && ob.rescue == null,
    'a live rail cannot bleed into the load');
  assert.equal(b.sys._storyMode, true, 'the returning-pilot story tracker mounts');
});

test('pad overrides and deadzone survive a settings restore — bindings map restores atomically', () => {
  const src = Object.create(save);
  src.state = {
    simTime: 5,
    settings: {
      gameplay: {},
      controls: {
        bindings: { forward: ['KeyW'] },
        gamepad: {
          enabled: false,
          deadzone: 0.3,
          invertY: true,
          curve: 'expo',
          scheme: 'twinstick',
          bindings: { boost: ['pad5'] },
        },
      },
    },
  };
  const packed = src._serializeSettings();
  const roundTripped = JSON.parse(JSON.stringify(packed));

  const dst = Object.create(save);
  dst.state = {
    simTime: 0,
    settings: {
      gameplay: {},
      controls: {
        bindings: { forward: ['ArrowUp'] },
        gamepad: {
          enabled: true,
          deadzone: 0.12,
          invertY: false,
          scheme: 'drive',
          bindings: { aim: ['pad9'] }, // stale map the save must not union into
        },
      },
    },
  };
  dst._restoreSettings(roundTripped);
  const gp = dst.state.settings.controls.gamepad;
  assert.equal(gp.deadzone, 0.3, 'deadzone survives load');
  assert.equal(gp.invertY, true, 'invert survives load');
  assert.equal(gp.enabled, false, 'enabled flag survives load');
  assert.equal(gp.scheme, 'twinstick', 'scheme survives load');
  assert.deepEqual(gp.bindings, { boost: ['pad5'] },
    'the pad override map restores atomically — a stale chord never unions in');
});
