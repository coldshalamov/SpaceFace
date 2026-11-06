// inf-title-greeting (WF-09): a NEW title is acknowledged by a station voice once. The arrival
// barkeep used to greet only by contact memory and faction rank — earning a stunt title or a
// world record never reached the place you walk into. Now the newest un-greeted player sighting
// in the durable titlesSeen receipts names itself in the greeting; the titles system stamps
// greetedAt only when the receipt actually delivered, so the acknowledgment never repeats across
// stations, visits or saves.
import test from 'node:test';
import assert from 'node:assert/strict';

import { newestUngreetedPlayerTitleSeen } from '../src/data/titles.js';
import { titlesSystem } from '../src/systems/titles.js';
import {
  buildStationArrivalGreeting,
  titleGreetingLineFor,
} from '../src/ui/station/stationArrival.js';

const STATION = 'station_helios';

function busStub() {
  const handlers = new Map();
  return {
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
    },
    off(event, handler) { handlers.get(event)?.delete(handler); },
    emit(event, payload) {
      for (const handler of handlers.get(event) || []) handler(payload);
    },
  };
}

function stateWithSeen(sightings, extra = {}) {
  return {
    simTime: 0,
    tick: 0,
    player: { name: 'Rin Voss', stationContacts: {} },
    story: { titles: { schemaVersion: 2, byId: {} }, titlesSeen: sightings },
    ...extra,
  };
}

function greetingText(state) {
  const greeting = buildStationArrivalGreeting(state, STATION);
  assert.ok(greeting, `a barkeep greets at ${STATION}`);
  return greeting;
}

test('a player-held title sighting names itself in the arrival greeting', () => {
  const state = stateWithSeen([
    { id: 'title_rock_discovery:pilot:42', title: 'Rock Tutor', seenAt: 900, holderKey: 'pilot:42', trickId: 'rock_discovery' },
  ]);
  const greeting = greetingText(state);
  assert.match(greeting.text, /Rock Tutor/, `the keeper names the title: ${greeting.text}`);
  assert.equal(greeting.titleSeenId, 'title_rock_discovery:pilot:42');
  assert.equal(greeting.titleId, 'title_rock_discovery');
});

test('a title held by an NPC never greets — the greeting text is unchanged', () => {
  const bare = stateWithSeen([]);
  const npc = stateWithSeen([
    { id: 'title_thunderchild:2:hull:raider_alpha', title: 'Thunderchild', seenAt: 900, holderKey: 'hull:raider_alpha' },
  ]);
  const plain = greetingText(bare);
  const greeted = greetingText(npc);
  assert.equal(greeted.titleSeenId, undefined, 'no acknowledgment rides an NPC sighting');
  assert.equal(greeted.text, plain.text, 'the barkeep says exactly what they said before');
});

test('building the greeting is a pure read — nothing stamps until the receipt delivers', () => {
  const state = stateWithSeen([
    { id: 'title_bolas:pilot:7', title: 'Knotmaker', seenAt: 100, holderKey: 'pilot:7', trickId: 'bolas' },
  ]);
  greetingText(state);
  greetingText(state);
  const pending = newestUngreetedPlayerTitleSeen(state);
  assert.ok(pending, 'the sighting stays un-greeted after builds alone');
});

test('delivery stamps greetedAt once, and the same title is never greeted again', () => {
  const state = stateWithSeen([
    { id: 'title_tow_kill:pilot:9', title: 'Tow Terror', seenAt: 300, holderKey: 'pilot:9', trickId: 'tow_kill' },
  ]);
  const bus = busStub();
  const system = titlesSystem;
  system.init({ state, bus });

  const first = greetingText(state);
  bus.emit('title:arrivalGreeted', { seenId: first.titleSeenId, stationId: STATION });

  assert.ok(first.titleSeenId);
  const record = state.story.titlesSeen.find((row) => row.id === first.titleSeenId);
  assert.equal(record.greetedAt, 0, 'the titles system stamped the acknowledgment');

  const second = greetingText(state);
  assert.equal(second.titleSeenId, undefined, 'the acknowledgment never repeats');
  bus.emit('title:arrivalGreeted', { seenId: first.titleSeenId, stationId: STATION });
  assert.equal(record.greetedAt, 0, 'a duplicate intent cannot move or re-stamp the field');
  system.destroy();
});

test('titles greet as a ladder: the newest first, then the older sighting on a later visit', () => {
  const state = stateWithSeen([
    { id: 'title_razor_release:pilot:3', title: 'Razorhand', seenAt: 100, holderKey: 'pilot:3', trickId: 'razor_release' },
    { id: 'title_lifeline:0:player', title: 'Lifeline', seenAt: 800, holderKey: 'player' },
  ]);
  const bus = busStub();
  const system = titlesSystem;
  system.init({ state, bus });

  const first = greetingText(state);
  assert.equal(first.titleSeenId, 'title_lifeline:0:player', 'the newest sighting speaks first');
  assert.match(first.text, /Lifeline/);
  bus.emit('title:arrivalGreeted', { seenId: first.titleSeenId });

  const second = greetingText(state);
  assert.equal(second.titleSeenId, 'title_razor_release:pilot:3', 'the older sighting keeps its turn');
  assert.match(second.text, /Razorhand/);
  bus.emit('title:arrivalGreeted', { seenId: second.titleSeenId });

  assert.equal(greetingText(state).titleSeenId, undefined, 'the ladder ends quiet');
  system.destroy();
});

test('the acknowledgment survives a save and reload — legacy saves load without the stamp', () => {
  const state = stateWithSeen([
    { id: 'title_wrecking_ball:pilot:5', title: 'Wrecker', seenAt: 400, holderKey: 'pilot:5', trickId: 'wrecking_ball' },
  ]);
  const bus = busStub();
  const system = titlesSystem;
  system.init({ state, bus });
  bus.emit('title:arrivalGreeted', { seenId: 'title_wrecking_ball:pilot:5', greetedAt: 777 });

  // The save path clones the story bag (JSON round-trip) and restore re-normalizes it.
  const restored = JSON.parse(JSON.stringify(state));
  system.destroy();
  const reloaded = titlesSystem;
  reloaded.init({ state: restored, bus: busStub() });

  const record = restored.story.titlesSeen[0];
  assert.equal(record.greetedAt, 777, 'greetedAt rides the story bag through a reload');
  assert.equal(greetingText(restored).titleSeenId, undefined, 'a reloaded save never re-greets');
  reloaded.destroy();

  // Legacy save shape: sightings predate the stamp entirely — they load and greet once.
  const legacy = stateWithSeen([
    { id: 'title_clothesline:pilot:2', title: 'Linebreaker', seenAt: 50, holderKey: 'pilot:2', trickId: 'clothesline' },
  ]);
  const legacySystem = titlesSystem;
  legacySystem.init({ state: legacy, bus: busStub() });
  assert.ok(titleGreetingLineFor(legacy), 'a legacy sighting greets on its next dock');
  assert.equal(legacy.story.titlesSeen[0].greetedAt, undefined, 'a pure read still writes nothing');
  legacySystem.destroy();
});

test('an unknown or malformed greeting intent writes nothing', () => {
  const state = stateWithSeen([
    { id: 'title_near_miss:pilot:11', title: 'Close Shave', seenAt: 200, holderKey: 'pilot:11', trickId: 'near_miss' },
  ]);
  const bus = busStub();
  const system = titlesSystem;
  system.init({ state, bus });
  bus.emit('title:arrivalGreeted', { seenId: 'title_nowhere:none' });
  bus.emit('title:arrivalGreeted', {});
  assert.equal(state.story.titlesSeen[0].greetedAt, undefined, 'unknown ids cannot stamp');
  system.destroy();
});
