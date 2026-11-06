import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import * as THREE from 'three';
import { createReadModel, applySpawnInfos, applyEntityVitals } from '../scripts/lib/simReadModel.mjs';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';

// Run the production worker host across a real thread; no game boot or graphics context.
const source = `
  import { parentPort, workerData } from 'node:worker_threads';
  import { readFileSync } from 'node:fs';
  const { createSimHost } = await import(workerData.host);
  const { createRunState } = await import(workerData.runState);
  let worker, init, entity, state, seq = 0, originalTick;
  async function reply() {
    return worker.tick({ tick: ++seq, steps: 0, ackEnd: init.initRebuild?.end ?? 0 });
  }
  parentPort.on('message', async (action) => {
    try {
      if (action === 'init') {
        worker = createSimHost();
        init = await worker.init({ profile: 'production', seed: 4242,
          scenarioContract: JSON.parse(readFileSync(new URL(workerData.scenario))) });
        state = worker.host.state;
        state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 30 };
        entity = worker.host.runtime.spawn({ type: 'ship', pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 },
          radius: 20, hull: 100, data: { swarmAffix: 'rider', runCohort: 'survival' } });
        originalTick = state.tick;
      } else if (action === 'start') entity.data.swarmRide = { life: entity.occupantGeneration, until: state.tick + 240 };
      else if (action === 'expire') state.tick = entity.data.swarmRide.until;
      else if (action === 'resume') state.tick = originalTick;
      else if (action === 'draft') state.run.phase = 'draft';
      else if (action === 'active') state.run.phase = 'active';
      else if (action === 'retire') delete entity.data.swarmAffix;
      else if (action === 'restamp') entity.data.swarmAffix = 'rider';
      else if (action === 'end') delete entity.data.swarmRide;
      else if (action === 'stale') entity.data.swarmRide = { life: entity.occupantGeneration - 1, until: state.tick + 240 };
      else if (action === 'shutdown') { worker.shutdown(); parentPort.postMessage({ ok: true }); return; }
      parentPort.postMessage({ ok: true, id: entity.id, life: entity.occupantGeneration, wire: await reply() });
    } catch (error) { parentPort.postMessage({ ok: false, error: error.stack || String(error) }); }
  });
`;

test('Rider phase crosses the worker thread and controls the current-life mark through its end', async () => {
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
    workerData: {
      host: new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url).href,
      runState: new URL('../src/core/runState.js', import.meta.url).href,
      scenario: new URL('../src/data/scenarios/47a.scenario.json', import.meta.url).href,
    },
  });
  const send = action => new Promise((resolve, reject) => {
    const error = err => { worker.off('message', message); reject(err); };
    const message = result => { worker.off('error', error); result.ok ? resolve(result) : reject(new Error(result.error)); };
    worker.once('error', error); worker.once('message', message); worker.postMessage(action);
  });
  try {
    const main = createReadModel();
    const dressing = createLawArenaDressing();
    const boundary = new THREE.Group(); boundary.userData.hull = new THREE.Group(); boundary.add(boundary.userData.hull);
    const apply = wire => { applySpawnInfos(main, wire.spawnInfos); applyEntityVitals(main, wire.entityVitals); };
    const current = () => boundary.getObjectByName('sf-swarm-threat-affix-rider-current');
    let id;
    const render = () => dressing.updateBossDressing(main.entities.get(id), boundary, 1, 1 / 60,
      { motionReduce: true, flashReduce: true });
    const spawn = await send('init'); id = spawn.id; const life = spawn.life; apply(spawn.wire);
    const row = main.entities.get(id);
    assert.equal(row.occupantGeneration, life);
    assert.equal(row.data.swarmRideActive, false);
    render(); assert.equal(current().visible, false);

    const start = await send('start');
    assert.ok(start.wire.entityVitals.some(([key, fields]) => key === id && fields.swarmRideTell === life));
    apply(start.wire); render(); assert.equal(row.data.swarmRideActive, true); assert.equal(current().visible, true);
    for (const [action, expected] of [['expire', false], ['resume', true], ['draft', false], ['active', true],
      ['retire', false], ['restamp', true], ['end', false], ['stale', false]]) {
      const result = await send(action);
      if (action === 'retire' || action === 'end') {
        assert.ok(result.wire.entityVitals.some(([key, fields]) => key === id && fields.swarmRideTell === -life),
          `${action} emits explicit inactive state`);
      }
      apply(result.wire); render();
      assert.equal(row.data.swarmRideActive, expected, `${action} reaches the mirror`);
      assert.equal(current().visible, expected, `${action} reaches the mark`);
    }

    // Reuse the numeric ID and deliver old-life data after the new spawn.
    const info = structuredClone(spawn.wire.spawnInfos.find(info => info.entityId === id));
    const newLife = life + 100;
    info.occupantGeneration = newLife; info.vitals.swarmRideTell = -newLife;
    applySpawnInfos(main, [info]);
    const replacement = main.entities.get(id);
    assert.notEqual(replacement, row);
    applyEntityVitals(main, [[id, { swarmRideTell: life }]]);
    assert.equal(replacement.data.swarmRideActive, false, 'old-life start cannot relight replacement');
    applyEntityVitals(main, [[id, { swarmRideTell: newLife }]]);
    assert.equal(replacement.data.swarmRideActive, true);
    applyEntityVitals(main, [[id, { swarmRideTell: -life }]]);
    assert.equal(replacement.data.swarmRideActive, true, 'old-life end cannot clear replacement');
    applyEntityVitals(main, [[id, { swarmRideTell: -newLife }]]);
    assert.equal(replacement.data.swarmRideActive, false);
  } finally {
    await send('shutdown');
    await worker.terminate();
  }
});
