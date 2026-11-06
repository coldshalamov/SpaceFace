// inf-mine-layer-drift — the telegraphed drift mine appears on the rock's live lane.
import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMineLayerVerb, anchorSalvoToDriftingDebris } from '../src/ai/mineLayerVerb.js';

function fixture() {
  const jackal = {
    id: 'jackal', type: 'ship', alive: true, team: 1, factionId: 'faction_reach',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { lootTableId: 'mine_layer_jackal', runCohort: 'survival', runWave: 2 },
  };
  const rock = {
    id: 'rock-1', type: 'asteroid', alive: true, pos: { x: 100, z: 0 },
    vel: { x: 60, z: 0 }, radius: 10, data: {},
  };
  const state = {
    run: { kind: 'survival', ruleset: 'swarm', phase: 'active' },
    tick: 100,
    entities: new Map([[jackal.id, jackal], [rock.id, rock]]),
    entityList: [jackal, rock],
  };
  return { state, jackal, rock };
}

test('the planner leaves its wake input alone and identifies selected live anchors', () => {
  const { state, jackal, rock } = fixture();
  const wakePoints = [{ x: -20, z: 0 }, { x: -50, z: 30 }];
  const before = structuredClone(wakePoints);
  const plan = anchorSalvoToDriftingDebris(state, jackal, wakePoints, 2);
  assert.deepEqual(wakePoints, before, 'planning is read-only for caller-owned wake points');
  assert.equal(plan.anchors[0], rock.id, 'fastest eligible rock owns the first seed');
  assert.equal(plan.anchors[1], null, 'the unmatched seed stays on the wake');
});

test('the mine-drop phase places the mine on the rock current pose and inherits current drift', () => {
  const { state, jackal, rock } = fixture();
  const placed = [];
  const placeMine = (spec) => { placed.push(spec); return spec; };

  applyMineLayerVerb({ state, entity: jackal, doctrinePhase: 'wake_cue', tick: 100,
    doctrineStartedTick: 100, placeMine });
  // The doctrine's telegraph lasts 30 ticks. The selected rock moves during that public warning.
  rock.pos.x = 130;
  rock.vel = { x: 72, z: 6 };
  applyMineLayerVerb({ state, entity: jackal, doctrinePhase: 'mine_drop', tick: 130,
    doctrineStartedTick: 100, placeMine });

  assert.equal(placed.length, 1, 'one real placement request is issued');
  const mine = placed[0];
  assert.ok(Math.abs(mine.pos.x - 114) < 1e-9 && Math.abs(mine.pos.z) < 1e-9,
    `seed sits one pad outside the live rock toward the jackal: ${JSON.stringify(mine.pos)}`);
  assert.deepEqual(mine.vel, rock.vel, 'the mine starts with the rock velocity at deployment');
  assert.equal(mine.swarmSpecialistMine, true);
});

test('a selected rock destroyed during the telegraph falls back to the frozen wake lane', () => {
  const { state, jackal, rock } = fixture();
  const placed = [];
  const placeMine = (spec) => { placed.push(spec); return spec; };
  applyMineLayerVerb({ state, entity: jackal, doctrinePhase: 'wake_cue', tick: 100,
    doctrineStartedTick: 100, placeMine });
  const frozenFallback = structuredClone(jackal.data.swarmSpecialist.salvoPoints[0]);
  rock.alive = false;
  applyMineLayerVerb({ state, entity: jackal, doctrinePhase: 'mine_drop', tick: 130,
    doctrineStartedTick: 100, placeMine });
  assert.deepEqual(placed[0].pos, frozenFallback);
  assert.equal(placed[0].vel, undefined, 'destroyed anchors do not lend stale velocity');
});
