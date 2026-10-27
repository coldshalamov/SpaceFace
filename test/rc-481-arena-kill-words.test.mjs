// Row 481 — "the room decides what a kill is called": the live Swarm arena names every kill
// cause on the kill popup and on the stunt line, and scoring is not touched by the words.
//
// The slice is deterministic and headless: the vocabulary is pure data, the detector runs on a
// seeded run, and the stunt line mounts against the same fake-document seam the PQ-146 and
// SWARM-03 suites use. No browser, no GPU, no wall clock, no Math.random.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { ARENA_LAWS } from '../src/data/survivalArenas.js';
import {
  SWARM_ARENA_KILL_WORDS,
  SWARM_KILL_WORDS,
  swarmKillCauseWord,
} from '../src/data/swarmJuice.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';
import { calloutTextFor, createStuntCallout } from '../src/ui/stuntCallout.js';

const SEED = 4242;

/** The six cause families every room names. `friendlyFire` is deliberately not arena-keyed. */
const FAMILIES = Object.freeze(['slammed', 'banked', 'slung', 'mined', 'shredded', 'down']);
/** The (cause, surface) pair that resolves to each family. */
const FAMILY_PROBE = Object.freeze({
  slammed: { cause: 'terrain', surface: 'terrain' },
  banked: { cause: 'terrain', surface: 'structure' },
  slung: { cause: 'collision', surface: 'craft' },
  mined: { cause: 'explosive', surface: null },
  shredded: { cause: 'direct', surface: null },
  down: { cause: null, surface: null },
});

const ARENAS = Object.freeze(Object.keys(SWARM_ARENA_KILL_WORDS));

// --- the vocabulary -----------------------------------------------------------------

test('every live arena is in the table and names all six cause families', () => {
  assert.deepEqual(
    [...ARENAS].sort(),
    Object.keys(ARENA_LAWS).sort(),
    'the word table covers exactly the rooms a Swarm run can live in',
  );
  assert.equal(ARENAS.length, 7, 'Helios, Lagrange, Cinder, Cryo, Storm, Mill, Hive');
  for (const arenaId of ARENAS) {
    const words = SWARM_ARENA_KILL_WORDS[arenaId];
    assert.deepEqual(Object.keys(words).sort(), [...FAMILIES].sort(), `${arenaId} names every family`);
    for (const family of FAMILIES) {
      const word = words[family];
      assert.equal(typeof word, 'string', `${arenaId}.${family} is a word`);
      assert.ok(word.length > 0 && word === word.toUpperCase(), `${arenaId}.${family} reads loud`);
    }
  }
});

test('each room names a cause differently from every other room and from the generic word', () => {
  for (const family of FAMILIES) {
    const spoken = ARENAS.map((arenaId) => SWARM_ARENA_KILL_WORDS[arenaId][family]);
    assert.equal(new Set(spoken).size, spoken.length,
      `${family} is distinct per arena (${spoken.join(', ')})`);
    for (const word of spoken) {
      assert.notEqual(word, SWARM_KILL_WORDS[family],
        `${family} in an arena never repeats the room-agnostic word`);
    }
  }
});

test('a missing or unknown arena falls back to the room-agnostic words', () => {
  for (const family of FAMILIES) {
    const probe = { ...FAMILY_PROBE[family] };
    assert.equal(swarmKillCauseWord(probe), SWARM_KILL_WORDS[family], `${family} with no arenaId`);
    for (const arenaId of [null, undefined, '', 'not_a_room', 'constructor', '__proto__', 'HELIOS_CORE']) {
      assert.equal(swarmKillCauseWord({ ...probe, arenaId }), SWARM_KILL_WORDS[family],
        `${family} falls back for arenaId ${JSON.stringify(arenaId)}`);
    }
  }
});

test('friendly fire outranks every arena table entry in every arena', () => {
  for (const arenaId of ARENAS) {
    for (const family of FAMILIES) {
      const probe = FAMILY_PROBE[family];
      assert.equal(
        swarmKillCauseWord({ ...probe, arenaId, friendlyFire: true }),
        'FRIENDLY FIRE',
        `${arenaId} still calls a room-on-room kill FRIENDLY FIRE`,
      );
    }
  }
  for (const arenaId of ARENAS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(SWARM_ARENA_KILL_WORDS[arenaId], 'friendlyFire'),
      false,
      `${arenaId} must not key friendly fire — the law lives above the table`,
    );
  }
});

test('naming is deterministic and reads no ambient clock or randomness', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/data/swarmJuice.js', import.meta.url)), 'utf8');
  assert.ok(!/Math\.random/.test(source), 'the vocabulary never rolls dice');
  assert.ok(!/Date\.now|performance\.now/.test(source), 'the vocabulary never reads a wall clock');

  const first = ARENAS.map((arenaId) => swarmKillCauseWord({
    cause: 'terrain', surface: 'structure', arenaId,
  }));
  const again = ARENAS.map((arenaId) => swarmKillCauseWord({
    cause: 'terrain', surface: 'structure', arenaId,
  }));
  assert.deepEqual(first, again, 'same room, same cause, same word — every time');
  assert.deepEqual(first, ARENAS.map((arenaId) => SWARM_ARENA_KILL_WORDS[arenaId].banked));
});

// --- the detector: the live run speaks the room ---------------------------------------

function boot({ arenaId = 'helios_core' } = {}) {
  const state = createGameState(SEED);
  state.settings.video.arcadeEffects = 'full';
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.simTime = 0;

  const ctx = { state, bus, helpers: {}, timeEffects: createTimeEffects(state) };
  swarmJuice.init(ctx);
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = 3;
  state.run.arenaId = arenaId;
  return { state, bus, emitted, player };
}

let victimSeq = 0;
/** Spawn a cohort body and emit its death at the current sim time. */
function kill(h, { cause = 'direct', surface = null, killer = null } = {}) {
  const id = h.state.nextEntityId++;
  const victim = {
    id, alive: false, type: 'ship', pos: { x: 10, z: 10 },
    data: { runCohort: SURVIVAL_COHORT_TAG, tag: victimSeq++, stuntThreat: { baseScore: 120, credits: 4 } },
  };
  h.state.entities.set(id, victim);
  h.state.entityList.push(victim);
  h.bus.emit('entity:killed', {
    id, killerId: killer != null ? killer : h.state.playerId, type: 'ship',
    pos: { x: 10, z: 10 },
    presentation: { cause, surface, playerCaused: killer == null || killer === h.state.playerId },
  });
  return victim;
}

function named(h, event) {
  return h.emitted.filter((e) => e.event === event);
}

test('the kill popup speaks the live arena word, and a Circuit switch is read at kill time', () => {
  const h = boot({ arenaId: 'cryo_drift' });
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  let pops = named(h, 'swarm:killPopup');
  assert.equal(pops.length, 1);
  assert.equal(pops[0].payload.word, 'SHATTERED', 'Cryo shatters a body on its plates');
  assert.equal(pops[0].payload.cause, 'terrain');
  assert.equal(pops[0].payload.friendlyFire, false);

  // The Circuit swaps rooms mid-run; the next kill speaks the new room.
  h.state.run.arenaId = 'cinder_sluice';
  kill(h, { cause: 'terrain_collision', surface: 'terrain' });
  pops = named(h, 'swarm:killPopup');
  assert.equal(pops[1].payload.word, 'ASHED', 'the Sluice ashed it');

  // An unknown room (a hauling save, a future arena) falls back instead of going silent.
  h.state.run.arenaId = 'room_from_a_later_patch';
  kill(h, { cause: 'ship_collision', surface: 'craft' });
  pops = named(h, 'swarm:killPopup');
  assert.equal(pops[2].payload.word, 'SLUNG', 'an unknown room keeps the generic word');
  swarmJuice.destroy();
});

test('the words never move the score: every arena pays the kill identically', () => {
  const paid = [];
  for (const arenaId of ARENAS) {
    const h = boot({ arenaId });
    kill(h, { cause: 'explosive' });
    const pop = named(h, 'swarm:killPopup')[0].payload;
    paid.push({ word: pop.word, score: pop.score, credits: pop.credits, wave: pop.wave });
    swarmJuice.destroy();
  }
  assert.deepEqual(paid.map((p) => p.score), ARENAS.map(() => 120), 'base score is the threat figure');
  assert.deepEqual(paid.map((p) => p.credits), ARENAS.map(() => 4));
  assert.deepEqual(paid.map((p) => p.wave), ARENAS.map(() => 3));
  assert.equal(new Set(paid.map((p) => p.word)).size, ARENAS.length, 'only the word changes');
});

test('brood wipes speak the room too', () => {
  const h = boot({ arenaId: 'the_hive' });
  swarmJuice._onBroodKills({
    count: 6, cause: 'explosive', pos: { x: 4, z: 5 }, credits: 6, score: 72, wave: 3,
  });
  const pop = named(h, 'swarm:killPopup')[0].payload;
  assert.equal(pop.word, 'DIGESTED', 'the Hive digests what it kills');
  assert.equal(pop.count, 6);
  assert.equal(pop.score, 72, 'the wipe pays exactly what the receipt said');
  assert.equal(pop.friendlyFire, false);
  swarmJuice.destroy();
});

test('a room-on-room kill stays FRIENDLY FIRE in an arena with its own vocabulary', () => {
  const h = boot({ arenaId: 'lagrange_crucible' });
  const roomKiller = {
    id: h.state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    data: { runCohort: SURVIVAL_COHORT_TAG },
  };
  h.state.entities.set(roomKiller.id, roomKiller);
  kill(h, { cause: 'ship_collision', surface: 'craft', killer: roomKiller.id });
  const pop = named(h, 'swarm:killPopup')[0].payload;
  assert.equal(pop.word, 'FRIENDLY FIRE', 'the generic law outranks the Crucible table');
  assert.equal(pop.friendlyFire, true, 'the payload says so — consumers never match on the word');
  assert.equal(pop.score, 0);
  swarmJuice.destroy();
});

// --- the stunt line re-gate ------------------------------------------------------------

function fakeElement(tag) {
  const el = {
    tag, children: [], attributes: {}, className: '', textContent: '', hidden: false,
    parentNode: null, _classes: new Set(), _styles: {},
    classList: {
      add(...n) { for (const x of n) el._classes.add(x); },
      remove(...n) { for (const x of n) el._classes.delete(x); },
      contains(n) { return el._classes.has(n); },
      toggle(n, on) { const w = on === undefined ? !el._classes.has(n) : !!on; if (w) el._classes.add(n); else el._classes.delete(n); return w; },
    },
    style: { setProperty(k, v) { el._styles[k] = String(v); }, removeProperty(k) { delete el._styles[k]; }, display: '', left: '' },
    setAttribute(k, v) { el.attributes[k] = String(v); },
    removeAttribute(k) { delete el.attributes[k]; },
    appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
  };
  return el;
}

function fakeDocument() {
  const doc = { head: fakeElement('head'), body: fakeElement('body'), documentElement: fakeElement('html') };
  doc.getElementById = () => null;
  doc.createElement = (t) => fakeElement(t);
  return doc;
}

function calloutState() {
  return {
    run: { kind: 'survival', phase: 'active', ruleset: 'swarm', arenaId: 'the_hive' },
    mode: 'flight',
    ui: { screenStack: [] },
    tick: 670,
    playerId: 1,
    stunts: {},
    settings: { video: { motionReduce: false } },
  };
}

test('arena-renamed physics words land on the stunt line; gun kills and friendly fire stay quiet', () => {
  const bus = createBus();
  const owner = createStuntCallout({ state: calloutState(), bus, doc: fakeDocument() });

  // A renamed terrain word is gated by its CAUSE, not by a word list.
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'SWALLOWED', cause: 'terrain', friendlyFire: false, wave: 2,
  });
  owner.update(0);
  let text = calloutTextFor(owner.root);
  assert.match(text, /SWALLOWED/, 'the Hive word reaches the lane');

  // A repeat rolls the count on the same line.
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'SWALLOWED', cause: 'terrain', friendlyFire: false, wave: 2,
  });
  owner.update(10);
  text = calloutTextFor(owner.root);
  assert.match(text, /SWALLOWED\s*×2/, 'a repeat rolls the count');

  // Friendly fire carries a physics cause too — the flag excludes it, not the word.
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'FRIENDLY FIRE', cause: 'collision', friendlyFire: true, wave: 2,
  });
  // A renamed structure word still teaches (BANKED became WEBBED in the Hive).
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'WEBBED', cause: 'terrain', surface: 'structure', friendlyFire: false, wave: 2,
  });
  // Guns never needed teaching, whatever the room calls them.
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'BITTEN', cause: 'direct', friendlyFire: false, wave: 2,
  });
  owner.update(20);
  text = calloutTextFor(owner.root);
  assert.match(text, /WEBBED/, 'the renamed structure word lands');
  assert.ok(!/FRIENDLY FIRE/.test(text), 'the announcer owns friendly fire, not the teaching lane');
  assert.ok(!/BITTEN/.test(text), 'gun kills stay quiet');
  owner.destroy();
});

test('the ARENA register rolls a kill storm on its one slot instead of flashing words', () => {
  const bus = createBus();
  const owner = createStuntCallout({ state: calloutState(), bus, doc: fakeDocument() });
  const kill = (word) => bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word, cause: 'terrain', friendlyFire: false, wave: 2,
  });

  // The single-kill path is unchanged: one kill files one plain register line.
  kill('SWALLOWED');
  owner.update(0);
  let text = calloutTextFor(owner.root);
  assert.match(text, /ARENA: SWALLOWED/, 'the register files the arena word');
  assert.ok(!/ARENA: SWALLOWED ×/.test(text), 'a lone kill carries no count');

  // The storm rolls the word's own count on the same register slot.
  kill('SWALLOWED');
  kill('SWALLOWED');
  kill('SWALLOWED');
  owner.update(10);
  text = calloutTextFor(owner.root);
  assert.match(text, /ARENA: SWALLOWED ×4/, 'the register counts the storm');

  // A different word files fresh — one slot supersedes — with its own run,
  // and the earlier word's count is remembered, not restarted.
  kill('WEBBED');
  kill('WEBBED');
  owner.update(20);
  text = calloutTextFor(owner.root);
  assert.match(text, /ARENA: WEBBED ×2/, 'a new word files fresh with its own run');
  kill('SWALLOWED');
  owner.update(30);
  text = calloutTextFor(owner.root);
  assert.match(text, /ARENA: SWALLOWED ×5/, 'the earlier word keeps its count');
  owner.destroy();
});

test('the cause lane stays dark outside a run even for an arena word', () => {
  const bus = createBus();
  const st = calloutState();
  st.run = null;
  const owner = createStuntCallout({ state: st, bus, doc: fakeDocument() });
  bus.emit('swarm:killPopup', {
    pos: { x: 0, z: 0 }, word: 'SWALLOWED', cause: 'terrain', friendlyFire: false, wave: 2,
  });
  owner.update(0);
  assert.ok(owner.root.hidden, 'adventure flight never sees the cause lane');
  owner.destroy();
});
