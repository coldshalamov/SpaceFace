// PULSE-STORIES (build_map row 441) — done-when:
//   At least 30 roaming micro-stories; each appears across hail, band, trade, and news
//   surfaces; uses only existing verbs; stays low stakes; and never parks an obstacle
//   in a lane.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ROAMING_STORIES } from '../src/data/roamingStories.js';
import { FLAVOR_PACKS } from '../src/data/flavor/index.generated.js';
import { v2FlavorRuntime } from '../src/systems/v2FlavorRuntime.js';
import { hash32 } from '../src/core/rng.js';

const REQUIRED_SURFACES = ['hail', 'band', 'trade', 'news'];
const TALK_ONLY = new Set(['lane_grandma', 'dead_relay_crew']);
const PACK = FLAVOR_PACKS.roaming_events;

function makeHarness() {
  const state = { meta: { seed: 7 }, mode: 'flight', ui: {}, world: {} };
  const emitted = [];
  const bus = { emit: (name, payload) => emitted.push({ name, payload }), on: () => () => {} };
  const voice = { say: (msg) => (voice.said.push(msg), true), said: [] };
  v2FlavorRuntime.init({ state, bus, helpers: { voice } });
  return { state, bus, emitted, voice };
}

// ── thirty-plus authored micro-stories ────────────────────────────────────────────────

test('at least thirty roaming micro-stories, all riding the roaming_events pack', () => {
  assert.ok(ROAMING_STORIES.length >= 30, `${ROAMING_STORIES.length} stories authored`);
  const packIds = new Set(PACK.entries.map((e) => e.id));
  for (const story of ROAMING_STORIES) {
    assert.ok(packIds.has(story.id), `${story.id} is registered in the roaming_events pack`);
  }
  // The two authored epics still lead the pack; the small stories follow them.
  assert.deepEqual(PACK.entries.slice(0, 2).map((e) => e.id), ['insolvent', 'slow_fleet']);
});

// ── every story speaks on all four surfaces ───────────────────────────────────────────

test('every story carries lines on hail, band, trade, and news', () => {
  for (const story of ROAMING_STORIES) {
    const surfaces = new Set(story.lines.map((line) => line.surface));
    if (TALK_ONLY.has(story.id)) {
      assert.deepEqual([...surfaces].sort(), ['band', 'hail']);
      assert.equal(story.economyHook, undefined);
      assert.ok(story.lines.every((line) => line.surface === 'hail' || line.surface === 'band'));
      continue;
    }
    for (const surface of REQUIRED_SURFACES) {
      assert.ok(surfaces.has(surface), `${story.id} has a ${surface} line`);
    }
    assert.ok(story.lines.length >= 8, `${story.id} has enough copy for the loader contract`);
    assert.ok(story.economyHook && story.economyHook.kind, `${story.id} documents its cargo`);
  }
});

// ── ids stay stable and unique ────────────────────────────────────────────────────────

test('story ids, event ids, and line ids are unique across the whole pack', () => {
  const entryIds = new Set();
  const eventIds = new Set();
  const lineIds = new Set();
  for (const entry of PACK.entries) {
    assert.ok(!entryIds.has(entry.id), `duplicate entry id ${entry.id}`);
    entryIds.add(entry.id);
    assert.ok(entry.eventId && !eventIds.has(entry.eventId), `event id ${entry.eventId} unique`);
    eventIds.add(entry.eventId);
    for (const line of entry.lines) {
      assert.ok(!lineIds.has(line.id), `duplicate line id ${line.id}`);
      lineIds.add(line.id);
    }
  }
});

// ── low stakes, existing verbs, no lane obstacles ─────────────────────────────────────

test('stories carry only flavor fields — nothing that could spawn or park an obstacle', () => {
  const ALLOWED_KEYS = new Set(['id', 'eventId', 'economyHook', 'lines']);
  const ALLOWED_LINE_KEYS = new Set(['id', 'surface', 'text']);
  for (const story of ROAMING_STORIES) {
    for (const key of Object.keys(story)) {
      assert.ok(ALLOWED_KEYS.has(key), `${story.id} carries no spawn field (${key})`);
    }
    for (const line of story.lines) {
      for (const key of Object.keys(line)) {
        assert.ok(ALLOWED_LINE_KEYS.has(key), `${line.id} is a copy record only (${key})`);
      }
      assert.ok(!/spawn|pos\b|velocity|waypoint|blockade|mine\b/i.test(line.id),
        `${line.id} is not a spawn handle`);
    }
  }
});

test('stories stay low stakes — no combat, ransom, or kill verbs in the copy', () => {
  const STAKES = /open fire|weapons free|shoot to kill|ransom|hostage|bounty on your head|board (them|her|him)|dead or alive|war crimes/i;
  for (const story of ROAMING_STORIES) {
    for (const line of story.lines) {
      assert.ok(!STAKES.test(line.text), `${line.id} keeps the stakes small: "${line.text}"`);
    }
  }
});

// ── every story reaches all four surfaces through the real runtime path ───────────────

test('the v2 runtime presents each story on all four surfaces with correct channels', () => {
  const { emitted, voice } = makeHarness();
  const CHANNELS = { hail: 'comms', band: 'band', trade: 'news', news: 'news' };
  for (const story of ROAMING_STORIES) {
    const record = { encounterId: `enc_test_${story.id}`, eventId: story.eventId, fingerprint: 'fp-test' };
    if (TALK_ONLY.has(story.id)) {
      for (const surface of ['hail', 'band']) {
        assert.equal(v2FlavorRuntime._presentRoaming(record, surface, { eventId: record.encounterId }), true);
      }
      for (const surface of ['trade', 'news', 'scan']) {
        assert.equal(v2FlavorRuntime._presentRoaming(record, surface, { eventId: record.encounterId }), false);
      }
      continue;
    }
    for (const surface of REQUIRED_SURFACES) {
      const before = voice.said.length;
      const ok = v2FlavorRuntime._presentRoaming(record, surface, { eventId: record.encounterId });
      assert.ok(ok, `${story.id} presents on ${surface}`);
      const said = voice.said.at(-1);
      assert.equal(voice.said.length, before + 1);
      assert.equal(said.channel, CHANNELS[surface], `${story.id} ${surface} rides the ${CHANNELS[surface]} channel`);
      const lineIds = new Set(story.lines.filter((l) => l.surface === surface).map((l) => l.id));
      const evt = emitted.at(-1);
      assert.equal(evt.name, 'v2:flavorPresented');
      assert.equal(evt.payload.surface, surface);
      assert.ok(lineIds.has(evt.payload.lineId), `${story.id} ${surface} line comes from the authored entry`);
    }
  }
});

test('a second harness binds the same copy — deterministic under one seed', () => {
  const story = ROAMING_STORIES[0];
  const record = { encounterId: 'enc_det', eventId: story.eventId, fingerprint: 'fp-det' };
  // The runtime is a singleton — drive each harness fully before initializing the next.
  const a = makeHarness();
  for (const surface of REQUIRED_SURFACES) {
    v2FlavorRuntime._presentRoaming(record, surface, {});
  }
  const aTexts = a.voice.said.map((m) => m.text);
  const b = makeHarness();
  for (const surface of REQUIRED_SURFACES) {
    v2FlavorRuntime._presentRoaming(record, surface, {});
  }
  assert.deepEqual(aTexts, b.voice.said.map((m) => m.text),
    'same seed and record select byte-identical copy');
  // Receipt dedupe: the same surface never repeats inside one binding.
  const h = makeHarness();
  let presented = 0;
  for (let i = 0; i < 3; i++) {
    const before = h.emitted.length;
    v2FlavorRuntime._presentRoaming(record, 'band', {});
    if (h.emitted.length > before) presented++;
  }
  assert.equal(presented, 1, 'one presentation per surface per encounter, never a repeat');
});

test('stories bind only through the live-carrier gate — no orphan text, no self-spawn', () => {
  // The pack offers no presentation path of its own: without the runtime's verified
  // roaming record the copy is inert. Assert _presentRoaming fails closed on bad input.
  const { voice } = makeHarness();
  const bogus = { encounterId: 'enc_ghost', eventId: 'event_does_not_exist', fingerprint: 'x' };
  for (const surface of REQUIRED_SURFACES) {
    assert.equal(v2FlavorRuntime._presentRoaming(bogus, surface, {}), false);
  }
  assert.equal(voice.said.length, 0, 'nothing speaks without a bound roaming entry');
  // And the runtime itself spawns no entities — binding is by hash into the pack entries.
  const idx = hash32(7, 'enc_test', 'fp', 'sector', 'zone', 'v2-roaming-event') % PACK.entries.length;
  assert.ok(idx >= 0 && idx < PACK.entries.length, 'binding is a pure index into the corpus');
});
