import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMineLayerVerb } from '../src/ai/mineLayerVerb.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';

const tuning = SWARM_SPECIALIST_TUNING.jackal;

function fixture() {
  const jackal = { id: 1, occupantGeneration: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { enemyTypeId: 'mine_layer_jackal', runCohort: 'survival', runWave: 6 } };
  const rock = { id: 2, occupantGeneration: 2, type: 'asteroid', alive: true, radius: 10,
    pos: { x: 100, z: 0 }, vel: { x: 60, z: 0 }, data: {} };
  const state = { tick: 0, simTime: 0, run: { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 6 },
    entityList: [jackal, rock], entities: new Map([[jackal.id, jackal], [rock.id, rock]]) };
  const requests = [];
  const step = (phase, tick) => {
    state.tick = tick; state.simTime = tick / 60;
    return applyMineLayerVerb({ state, entity: jackal, doctrinePhase: phase, tick,
      placeMine: spec => { requests.push(structuredClone(spec)); return { id: 100 + requests.length }; } });
  };
  return { state, jackal, rock, requests, step };
}

for (const change of ['recycled map occupant', 'recycled in place', 'removed map occupant', 'legacy anchor data']) {
  test(`${change} cannot move the warned mine onto a different carrier`, () => {
    const f = fixture(); f.step('wake_cue', 0);
    f.rock.pos.x = 130; f.step('wake_cue', 20);
    const warned = structuredClone(f.jackal.data.swarmSpecialist.salvoPoints[0]);
    if (change === 'recycled map occupant') {
      const replacement = { ...structuredClone(f.rock), occupantGeneration: 3,
        pos: { x: -500, z: 200 }, vel: { x: -300, z: 50 } };
      f.state.entities.set(f.rock.id, replacement);
      f.state.entityList.push(replacement); // Old cached row remains deliberately.
    } else if (change === 'recycled in place') {
      f.rock.occupantGeneration++; f.rock.pos.x = -500;
    } else if (change === 'removed map occupant') {
      f.state.entities.delete(f.rock.id); f.rock.pos.x = -500;
    } else {
      f.jackal.data = JSON.parse(JSON.stringify(f.jackal.data));
      delete f.jackal.data.swarmSpecialist.salvoAnchorGenerations;
      f.rock.pos.x = -500;
    }
    f.step('wake_cue', 25);
    assert.deepEqual(f.jackal.data.swarmSpecialist.salvoPoints[0], warned);
    assert.equal(f.requests.length, 0);
    assert.ok(f.step('mine_drop', tuning.windupTicks));
    assert.deepEqual(f.requests[0].pos, warned);
    assert.equal(f.requests[0].vel, undefined, 'unproven carrier cannot lend its drift to the mine');
    assert.equal(f.jackal.data.swarmSpecialist.salvoAnchors[0], null);
  });
}

test('JSON copying preserves an explicitly retained carrier identity and release cadence', () => {
  const f = fixture(); f.step('wake_cue', 0);
  f.jackal.data = JSON.parse(JSON.stringify(f.jackal.data));
  const restored = structuredClone(f.rock);
  restored.pos.x = 140; restored.vel = { x: 70, z: 4 };
  f.state.entities.set(restored.id, restored); f.state.entityList[1] = restored;
  f.step('wake_cue', 20);
  assert.deepEqual(f.jackal.data.swarmSpecialist.salvoPoints[0], { x: 124, z: 0 });
  assert.equal(f.step('mine_drop', tuning.windupTicks - 1), null);
  assert.ok(f.step('mine_drop', tuning.windupTicks));
  assert.deepEqual(f.requests[0].pos, { x: 124, z: 0 });
  assert.deepEqual(f.requests[0].vel, { x: 70, z: 4 });
  assert.equal(f.step('mine_drop', tuning.windupTicks + tuning.salvoSpacingTicks - 1), null);
  assert.ok(f.step('mine_drop', tuning.windupTicks + tuning.salvoSpacingTicks));
});

test('unstamped and stale cached bodies never acquire a moving anchor at initial commitment', () => {
  for (const change of ['unstamped', 'stale']) {
    const f = fixture();
    if (change === 'unstamped') delete f.rock.occupantGeneration;
    else f.state.entities.delete(f.rock.id);
    f.step('wake_cue', 0);
    assert.deepEqual(f.jackal.data.swarmSpecialist.salvoAnchors, [null, null, null]);
    assert.deepEqual(f.jackal.data.swarmSpecialist.salvoAnchorGenerations, [null, null, null]);
  }
});
