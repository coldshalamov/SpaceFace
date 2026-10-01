import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import {
  BUILD_IDENTITY_REVEAL_CUE,
  SERVICE_BERTH_CUES,
  UNIQUE_LOOT_CUES,
  WANTED_SEARCH_EDGE_CUES,
  audio,
} from '../src/audio/audioSystem.js';
import { stepWantedSearchEdge } from '../src/presentation/wantedSearchVolume.js';

function recipe(id) {
  const found = RECIPES.find((entry) => entry.id === id);
  assert.ok(found, `${id} is an authored recipe`);
  return found;
}

function playingHost() {
  const played = [];
  const host = Object.create(audio);
  host.play = (id, opts) => { played.push({ id, ...opts }); return null; };
  host.rt = {};
  return { host, played };
}

test('crossing the wanted search ring speaks once on each edge', () => {
  recipe(WANTED_SEARCH_EDGE_CUES.leave);
  recipe(WANTED_SEARCH_EDGE_CUES.enter);
  assert.notEqual(WANTED_SEARCH_EDGE_CUES.leave, WANTED_SEARCH_EDGE_CUES.enter);
  assert.equal(stepWantedSearchEdge(null, true).edge, null, 'the first sample does not invent an enter');
  assert.equal(stepWantedSearchEdge(true, false).edge, 'leave');
  assert.equal(stepWantedSearchEdge(false, true).edge, 'enter');
  assert.equal(stepWantedSearchEdge(true, true).edge, null);

  const { host, played } = playingHost();
  const player = { pos: { x: 0, z: 0 } };
  host.state = {
    playerId: 1,
    world: { currentSectorId: 'sector_helios_prime' },
    player: {
      heatZone: {
        active: true,
        radius: 100,
        level: 2,
        center: { x: 0, z: 0 },
        sectorId: 'sector_helios_prime',
      },
    },
    entities: { get: (id) => (id === 1 ? player : null) },
  };

  host._stepWantedSearchAudio();
  assert.equal(played.length, 0, 'spawning inside the ring is silent');
  player.pos.x = 250;
  host._stepWantedSearchAudio();
  assert.equal(played.length, 1);
  assert.equal(played[0].id, WANTED_SEARCH_EDGE_CUES.leave);
  player.pos.x = 0;
  host._stepWantedSearchAudio();
  assert.equal(played.length, 2);
  assert.equal(played[1].id, WANTED_SEARCH_EDGE_CUES.enter);
  host._stepWantedSearchAudio();
  assert.equal(played.length, 2, 'holding inside does not repeat the enter cue');
});

test('a station service start and abort use two berth cues', () => {
  recipe(SERVICE_BERTH_CUES.started);
  recipe(SERVICE_BERTH_CUES.aborted);
  assert.notEqual(SERVICE_BERTH_CUES.started, SERVICE_BERTH_CUES.aborted);
  const { host, played } = playingHost();
  host._onServiceBerthCue('started');
  host._onServiceBerthCue('aborted');
  host._onServiceBerthCue('progress');
  assert.deepEqual(played.map((row) => row.id), [SERVICE_BERTH_CUES.started, SERVICE_BERTH_CUES.aborted]);
});

test('choir bell, nestbreaker split and pale coil blink have three distinct voices', () => {
  const ids = Object.values(UNIQUE_LOOT_CUES);
  assert.equal(new Set(ids).size, 3);
  for (const id of ids) recipe(id);
  const { host, played } = playingHost();
  for (const eventName of Object.keys(UNIQUE_LOOT_CUES)) host._onUniqueLootCue(eventName);
  host._onUniqueLootCue('uniqueLoot:unknown');
  assert.deepEqual(played.map((row) => row.id), ids);
});

test('a revealed build identity plays the scan resolve once per target', () => {
  recipe(BUILD_IDENTITY_REVEAL_CUE);
  assert.equal(BUILD_IDENTITY_REVEAL_CUE, 'sfx_scan_pulse');
  const { host, played } = playingHost();
  host._onBuildIdentityRevealed({ entityId: 7, shipId: 'ship_kestrel' });
  host._onBuildIdentityRevealed({ entityId: 7, shipId: 'ship_kestrel' });
  host._onBuildIdentityRevealed({ entityId: 8, shipId: 'ship_mule' });
  host._onBuildIdentityRevealed(null);
  assert.deepEqual(played.map((row) => row.id), [BUILD_IDENTITY_REVEAL_CUE, BUILD_IDENTITY_REVEAL_CUE]);
});
