// Characterization of the stunt-witness observer's tracked-target scan. The optimisation under test
// (range-gate observers before profiling them; build the per-root tracked-target list once instead of
// once per observer) must not change a single recorded fact. EXPECTED_EPISODES below is the record the
// pre-optimisation observer produced for this exact scenario, with the sequence number inside each
// identity label (`life:number:<id>:<n>`) normalised away: the label is minted lazily and its sequence
// depends on when a body is first looked at, which is the one thing the optimisation legitimately moves.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { bindStuntEvidence, bodyLife } from '../src/combat/stuntEvidence.js';
import { observeStuntWitnesses } from '../src/combat/stuntWitnesses.js';

const EXPECTED_EPISODES = {
  "root:1": {
    "observers": {
      "entity:10": {
        "canSpeak": true,
        "comms": true,
        "factionId": null,
        "firstSeen": 100,
        "id": 10,
        "identity": "entity:10",
        "lifeId": "life:number:10",
        "name": "10",
        "payoffTicks": 0,
        "range": 300,
        "role": "patrol",
        "sourceTicks": 6,
        "sourceTicksLast": 111,
        "sourceTicksMax": 7,
        "targets": {
          "life:number:10": {
            "count": 0,
            "id": 10,
            "last": 111,
            "max": 0
          },
          "life:number:31": {
            "count": 0,
            "id": 31,
            "last": 111,
            "max": 0
          },
          "life:number:32": {
            "count": 0,
            "id": 32,
            "last": 111,
            "max": 0
          },
          "life:number:33": {
            "count": 0,
            "id": 33,
            "last": 111,
            "max": 0
          },
          "life:number:34": {
            "count": 6,
            "flight": true,
            "id": 34,
            "last": 111,
            "max": 6
          },
          "life:number:35": {
            "count": 0,
            "flight": true,
            "id": 35,
            "last": 111,
            "max": 0
          },
          "life:number:36": {
            "count": 0,
            "id": 36,
            "last": 111,
            "max": 0
          },
          "life:number:37": {
            "count": 0,
            "id": 37,
            "last": 111,
            "max": 0
          }
        },
        "transferTicks": 6,
        "transferTicksLast": 111,
        "transferTicksMax": 7
      },
      "entity:11": {
        "canSpeak": true,
        "comms": true,
        "factionId": null,
        "firstSeen": 100,
        "id": 11,
        "identity": "entity:11",
        "lifeId": "life:number:11",
        "name": "11",
        "payoffTicks": 0,
        "range": 180,
        "role": "civilian",
        "sourceTicks": 0,
        "sourceTicksLast": 105,
        "sourceTicksMax": 6,
        "targets": {
          "life:number:10": {
            "count": 0,
            "id": 10,
            "last": 111,
            "max": 0
          },
          "life:number:31": {
            "count": 6,
            "id": 31,
            "last": 111,
            "max": 6
          },
          "life:number:32": {
            "count": 6,
            "id": 32,
            "last": 111,
            "max": 6
          },
          "life:number:33": {
            "count": 0,
            "id": 33,
            "last": 111,
            "max": 0
          },
          "life:number:34": {
            "count": 0,
            "flight": true,
            "id": 34,
            "last": 111,
            "max": 0
          },
          "life:number:35": {
            "count": 0,
            "flight": true,
            "id": 35,
            "last": 111,
            "max": 0
          },
          "life:number:36": {
            "count": 0,
            "id": 36,
            "last": 111,
            "max": 0
          },
          "life:number:37": {
            "count": 0,
            "id": 37,
            "last": 111,
            "max": 0
          }
        },
        "transferTicks": 0,
        "transferTicksLast": 105,
        "transferTicksMax": 6
      },
      "entity:12": {
        "canSpeak": false,
        "comms": true,
        "factionId": null,
        "firstSeen": 100,
        "id": 12,
        "identity": "entity:12",
        "lifeId": "life:number:12",
        "name": "12",
        "payoffTicks": 0,
        "range": 450,
        "role": "station sensor",
        "sourceTicks": 6,
        "sourceTicksLast": 111,
        "sourceTicksMax": 7,
        "targets": {
          "life:number:10": {
            "count": 6,
            "id": 10,
            "last": 111,
            "max": 6
          },
          "life:number:31": {
            "count": 6,
            "id": 31,
            "last": 111,
            "max": 6
          },
          "life:number:32": {
            "count": 6,
            "id": 32,
            "last": 111,
            "max": 6
          },
          "life:number:33": {
            "count": 6,
            "id": 33,
            "last": 111,
            "max": 6
          },
          "life:number:34": {
            "count": 6,
            "flight": true,
            "id": 34,
            "last": 111,
            "max": 6
          },
          "life:number:35": {
            "count": 6,
            "flight": true,
            "id": 35,
            "last": 111,
            "max": 6
          },
          "life:number:36": {
            "count": 0,
            "id": 36,
            "last": 111,
            "max": 0
          },
          "life:number:37": {
            "count": 0,
            "id": 37,
            "last": 111,
            "max": 0
          }
        },
        "transferTicks": 6,
        "transferTicksLast": 111,
        "transferTicksMax": 7
      }
    },
    "rootId": "root:1",
    "rootTick": 95
  }
};

function scenario() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.tick = 100;
  state.entities = new Map();
  const mk = (id, type, x, z, extra = {}) => {
    const e = { id, type, alive: true, pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 }, radius: 10, collides: true, team: 1, data: {}, ...extra };
    state.entities.set(id, e);
    return e;
  };
  mk(1, 'ship', 0, 0, { isPlayer: true, team: 0 });
  state.playerId = 1;
  const source = mk(2, 'asteroid', 60, 0, { radius: 24, vel: { x: 3, z: 0 } });
  mk(10, 'ship', 100, 40, { data: { role: 'patrol' } });
  mk(11, 'ship', -80, 60);
  mk(12, 'station', 200, -150, { radius: 40 });
  mk(13, 'ship', 900, 0); // beyond the 450 WU witness range
  mk(14, 'ship', 50, 50, { alive: false });
  for (let i = 0; i < 12; i++) {
    mk(30 + i, i % 5 === 0 ? 'pickup' : 'asteroid', 60 + (i * 11) % 90 - 40, 20 + i * 6,
      { collides: i % 5 !== 0, radius: 6 + i });
  }
  mk(60, 'asteroid', 5000, 5000);
  mk(61, 'payload', 70, -30, { collides: false });
  const journal = bindStuntEvidence(state);
  journal.roots.set('root:1', {
    id: 'root:1', actorId: 1, tick: 95, sourceId: 2, sourceLife: bodyLife(source, state).id,
    threatIds: [61, 35], needle: { boundaryIds: [34] }, nodes: [], constraint: { attached: true, loadedTicks: 4 },
  });
  return { state, source };
}

const normalise = (value) => JSON.parse(JSON.stringify(value).replace(/life:(number:\d+):\d+/g, 'life:$1'));

test('witness episodes are exactly what the unoptimised observer recorded', () => {
  const { state, source } = scenario();
  for (let t = 100; t < 112; t++) {
    state.tick = t;
    source.pos.x += 3;
    observeStuntWitnesses(state);
  }
  assert.deepEqual(normalise(state.story.titles.stuntWitnessing.episodes), EXPECTED_EPISODES);
});

test('no observer is recorded beyond the 450 WU witness range, and none is dead', () => {
  const { state, source } = scenario();
  for (let t = 100; t < 104; t++) { state.tick = t; source.pos.x += 3; observeStuntWitnesses(state); }
  const observers = Object.keys(state.story.titles.stuntWitnessing.episodes['root:1'].observers);
  assert.ok(observers.length > 0, 'the scenario has witnesses');
  assert.ok(!observers.includes('entity:13'), 'a ship 900 WU away is not a witness');
  assert.ok(!observers.includes('entity:14'), 'a dead ship is not a witness');
});
