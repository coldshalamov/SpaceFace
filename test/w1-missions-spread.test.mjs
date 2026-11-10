// W1 regression guard: the exported missions composite must carry its ops spread before init.
// Consumers clone it (`Object.create(missions)`, `{ ...missions }`) and call methods without an
// init pass; an init-only attach silently loses ~190 methods.
// Run: node --test test/w1-missions-spread.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missions } from '../src/systems/missions.js';

test('the literal composite exposes every ops family before init', () => {
  for (const key of [
    'serialize',
    'deserialize',
    'newGame',
    '_repOf',
    '_recordCampaignBookSignal',
    '_findOffer',
    '_releaseCampaignNavForSwarm',
    '_advanceStory',
    '_advanceEmbodiedStoryMission',
    '_onMiningYield',
    'ensureBoard',
    'acceptMission',
    'update',
  ]) {
    assert.equal(typeof missions[key], 'function', `${key} is on the exported composite`);
  }
});

test('a prototype clone keeps the ops methods without init', () => {
  const clone = Object.create(missions);
  for (const key of ['serialize', '_repOf', '_recordCampaignBookSignal', '_findOffer']) {
    assert.equal(typeof clone[key], 'function', `${key} survives Object.create cloning`);
  }
});
