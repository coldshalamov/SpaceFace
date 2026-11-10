// Seed 4242. The chart's discovery selection reads knowledgeById. A rumored wreck
// names the next step and does not print its exact position. A ping does the same.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { selectionKnowledgeLine } from '../src/ui/sim/discoveryKnowledge.js';

const SEED = 4242;

function state() {
  return {
    meta: { seed: SEED },
    world: {
      currentSectorId: 'helios',
      scanPings: {
        helios: [{ id: 'signal:4242-a', pos: { x: 400, z: -200 }, kind: 'unknown' }],
      },
      frontierRumors: { byId: {} },
    },
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_rumor: {
            sectorId: 'helios',
            name: 'Rumored hull',
            phase: 'rumored',
            bearingCenter: { x: 100, z: 80 },
            radius: 60,
            exactPos: { x: 50, z: 50 },
          },
        },
      },
    },
  };
}

test('seed 4242 the discovery selection names the earned step and hides the place', () => {
  const live = state();
  assert.equal(live.meta.seed, SEED);
  const wreck = selectionKnowledgeLine(live, 'wreck_rumor');
  assert.equal(wreck, 'fly the bearing ring and pulse the scanner');
  assert.equal(wreck.includes('50'), false);
  const ping = selectionKnowledgeLine(live, 'ping:helios:signal:4242-a');
  assert.equal(ping, 'close with the contact and scan to identify');
  assert.equal(ping.includes('400'), false);
  assert.equal(selectionKnowledgeLine(live, 'missing'), '');
  const tab = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
  assert.match(tab, /selectionKnowledgeLine\(state, t && t.id\)/);
  assert.match(tab, /escapeMapHtml\(knownLine\)/);
});
