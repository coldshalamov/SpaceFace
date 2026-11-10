// SEED-PC-05 / SEED-PC-09 — two strangers who hail and talk, and ask for nothing.
// The roaming runtime is the surface the player hears. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { ROAMING_STORIES } from '../src/data/roamingStories.js';
import { v2FlavorRuntime } from '../src/systems/v2FlavorRuntime.js';

const TALK = [
  {
    id: 'lane_grandma',
    hail: 'Grandma to the lane. I am not selling anything. I wanted a voice that is not the autopilot.',
  },
  {
    id: 'dead_relay_crew',
    hail: 'Tender crew on the dead relay. We are mid-repair. We are not hiring and we are not selling the parts.',
  },
];

test('seed 4242: grandma and the relay crew speak on hail and band and stay silent on trade and news', () => {
  const state = createGameState(4242);
  const said = [];
  v2FlavorRuntime.init({
    state,
    bus: { emit() {}, on() { return () => {}; } },
    helpers: { voice: { say(msg) { said.push(msg); return true; } } },
  });

  for (const row of TALK) {
    const story = ROAMING_STORIES.find((entry) => entry.id === row.id);
    assert.ok(story, `${row.id} is in the roaming pack`);
    assert.equal(story.economyHook, undefined);
    const record = { encounterId: `enc_${row.id}`, eventId: story.eventId, fingerprint: 'fp-4242' };
    const before = said.length;
    assert.equal(v2FlavorRuntime._presentRoaming(record, 'hail', { eventId: record.encounterId }), true);
    assert.equal(v2FlavorRuntime._presentRoaming(record, 'band', { eventId: record.encounterId }), true);
    assert.equal(v2FlavorRuntime._presentRoaming(record, 'trade', { eventId: record.encounterId }), false);
    assert.equal(v2FlavorRuntime._presentRoaming(record, 'news', { eventId: record.encounterId }), false);
    assert.equal(v2FlavorRuntime._presentRoaming(record, 'scan', { eventId: record.encounterId }), false);
    const spoken = said.slice(before).map((msg) => msg.text);
    assert.equal(spoken.length, 2);
    const hailLines = new Set(story.lines.filter((line) => line.surface === 'hail').map((line) => line.text));
    assert.ok(hailLines.has(spoken[0]), `${row.id} hail is one of the authored lines`);
    assert.ok(hailLines.has(row.hail), `${row.id} keeps the no-ask hail`);
    assert.equal(spoken.some((text) => /buy|sell|cargo|credits|contract/i.test(text) && /please|need you|deliver/i.test(text)), false);
  }
});
