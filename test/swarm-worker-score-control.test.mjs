import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { createRunState } from '../src/core/runState.js';
import { swarmPilotHasActed } from '../src/systems/swarmSafety.js';

const sample = { kind: 'keepalive', wallDt: 1 / 60 };
const dom = d => ({ kind: 'domEvent', d });
const key = (pressed, blocked = false) => dom({ type: pressed ? 'keydown' : 'keyup',
  code: 'KeyW', pressed, repeat: false, blocked });
const swipe = (overrides = {}) => dom({ type: 'mousemove', clientX: 800, clientY: 450,
  movementX: 80, movementY: 0, uiCommand: false, neutralize: false, ...overrides });

test('production worker admits fresh pointer control at input sampling and preserves pre-control protection', async t => {
  // Real production host and wire drain, without a native/world tick or browser launch.
  // Active-run/body fixtures and synthetic kill receipts do not replay historical victims.
  const host = createSimHost();
  try {
    const init = await host.init({ profile: 'production', seed: 73311, viewport: { w: 1440, h: 900 },
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const { state, bus, registry } = host.host;
    const ring = createSimCommandRing();
    const main = {};
    const requests = [], awards = [];
    bus.on('run:awardRequested', p => requests.push(structuredClone(p)));
    bus.on('run:awarded', p => awards.push(structuredClone(p)));
    function mirror(reply) {
      for (const u of reply.domainUpdates || []) {
        const segs = u.segs.length === 1 && u.segs[0].includes('.') ? u.segs[0].split('.') : u.segs;
        const roots = new Map([[segs[0], main[segs[0]]]]);
        applyDomainPathUpdate(roots, { ...u, segs }, new Set());
        main[segs[0]] = roots.get(segs[0]);
      }
    }
    mirror(init);
    async function send(...descriptors) {
      for (const d of descriptors) assert.notEqual(pushLaneCommand(ring, d), null);
      const reply = await host.tick({ steps: 0, commands: ring.drain() });
      mirror(reply);
    }
    async function mirrorScore() {
      // Ordinary run cadence is 30 replies, cold leaves 60. Preserve its production profile.
      for (let i = 0; i < 60; i++) await send();
      assert.equal(main.run.score, state.run.score);
    }
    let token = 0, waveSerial = 0, victimId = 100;
    function activeRun(wave = waveSerial + 1, retireToken = ++token) {
      waveSerial = Math.max(waveSerial, wave);
      state.run = Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 73311 }),
        { phase: 'active', wave, retireToken });
      // This fixture supplies an active run instead of going through begin().
      // Adopt it at owner initialization before input/award clones exercise it.
      registry.get('runSession').init({ state, bus });
      registry.get('swarmChain')._reset();
    }
    async function reset() {
      await send(dom({ type: 'blur' }), { kind: 'uiFold', p: { modalActive: false, screenStackLen: 0 } });
      state.mode = 'flight'; state.input.blocked = false; state.input.autoFire = true;
      activeRun();
      state.playerId = 1; state.player.alive = true; state.player.targetId = null;
      state.entities.set(1, { id: 1, type: 'ship', alive: true, rot: 0, radius: 6,
        pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} });
      requests.length = 0; awards.length = 0;
      await send(sample); // Prime G-mode entry's normal stick reset before the device packet.
      assert.equal(swarmPilotHasActed(state), false);
    }
    function kill() {
      const id = ++victimId;
      state.entities.set(id, { id, type: 'ship', alive: false, pos: { x: 5, z: 5 },
        data: { runCohort: 'survival', level: 1, threatClass: 'fodder' } });
      return { kind: 'busEmit', emit: 'entity:killed', payload: { id, killerId: 1, cause: 'kinetic' } };
    }
    async function assertProtected() {
      assert.equal(swarmPilotHasActed(state), false);
      await send(kill());
      assert.equal(state.run.score, 0);
      assert.equal(state.run.xp, 3);
      assert.deepEqual(requests.map(p => p.score), [100, 1]);
      assert.deepEqual(awards.map(p => p.score), [0]);
    }

    await t.test('fresh forwarded pointer edge pays kill and chain without interrupting steering', async () => {
      await reset();
      await send(swipe());
      assert.equal(swarmPilotHasActed(state), false, 'draining an edge does not admit it before sampling');
      await send(sample);
      assert.equal(swarmPilotHasActed(state), true);
      assert.equal(state.input.drawFlightManual, false);
      const vector = structuredClone(state.input.autoTargetVector);
      assert.equal(vector.active, true);
      assert.ok(Math.abs(vector.magnitude - 0.4366404068167487) < 1e-12);
      registry.get('autoTargetAssist').update(1 / 60, state);
      assert.equal(state.input.drawFlightManual, false);
      assert.deepEqual(state.input.autoTargetVector, vector);
      assert.equal(state.input.moveZ, vector.magnitude, 'same ordinary post-input flight intent');
      assert.equal(Math.abs(state.input.moveX), 0);
      assert.equal(state.player.targetId, null);
      await send(kill());
      assert.equal(state.run.score, 101); assert.equal(state.run.xp, 3);
      assert.deepEqual(awards.map(p => p.score), [100, 1]);
      await mirrorScore();
    });

    await t.test('held W still admits; a down/up pair before sampling does not invent a hold', async () => {
      await reset(); await send(key(true), sample, kill());
      assert.equal(state.input.moveZ, 1); assert.equal(state.input.drawFlightManual, true);
      assert.equal(state.run.score, 101);
      await reset(); await send(key(true), key(false), sample);
      await assertProtected();
    });

    await t.test('idle, blocked, UI-only, deadzone and rejected packets remain protected', async () => {
      for (const descriptors of [
        [], [key(true, true)], [swipe({ uiCommand: true })], [swipe({ neutralize: true })],
        [swipe({ movementX: 1 })], [swipe({ movementX: 0 })],
        [swipe({ movementX: 40000 })], [swipe({ type: 'pointermove' })],
      ]) {
        await reset(); await send(...descriptors, sample); await assertProtected();
      }
    });

    await t.test('blur, input block and modal sampling discard pending admission', async () => {
      for (const interruption of [
        dom({ type: 'blur' }),
        { kind: 'inputFold', path: 'input.blocked', value: true },
        { kind: 'uiFold', p: { modalActive: true, screenStackLen: 1 } },
      ]) {
        await reset(); await send(swipe(), interruption);
        // inputFold is buffered until drain; sample only after the block has actually landed.
        await send(sample);
        await send({ kind: 'inputFold', path: 'input.blocked', value: false },
          { kind: 'uiFold', p: { modalActive: false, screenStackLen: 0 } }, sample);
        await assertProtected();
      }
    });

    await t.test('a mode excursion before sampling cannot carry a pending act back to flight', async () => {
      await reset();
      await send(swipe(), { kind: 'mode', mode: 'menu' }, { kind: 'mode', mode: 'flight' }, sample);
      await assertProtected();
    });

    await t.test('previous-wave vector persists as steering but cannot re-admit without a new edge', async () => {
      await reset(); await send(swipe(), sample);
      assert.equal(swarmPilotHasActed(state), true);
      activeRun(state.run.wave + 1, state.run.retireToken);
      await send(sample);
      assert.equal(state.input.autoTargetVector.active, true);
      await assertProtected();
      await send(swipe({ movementX: 20 }), sample, kill());
      assert.equal(swarmPilotHasActed(state), true);
      assert.equal(state.run.score, 102, 'new kill pays base100 plus current chain2');
    });

    await t.test('unsampled edges cannot cross wave or run identity, including same-seed retries', async () => {
      for (const replace of [() => activeRun(state.run.wave + 1, state.run.retireToken),
        () => activeRun(state.run.wave)]) {
        await reset(); await send(swipe()); replace(); await send(sample);
        assert.equal(state.input.autoTargetVector.active, true);
        await assertProtected();
        await send(swipe({ movementX: 20 }), sample);
        assert.equal(swarmPilotHasActed(state), true);
      }
    });

    await t.test('ordered earlier award stays gated across wallet replacement; no retroactive payment', async () => {
      await reset();
      const earlier = kill(), later = kill();
      const beforeTick = state.tick;
      await send(swipe(), earlier, sample, later);
      assert.equal(state.tick, beforeTick, 'no native/world tick was run');
      assert.equal(swarmPilotHasActed(state), true);
      assert.deepEqual(requests.map(p => p.score), [100, 1, 100, 2]);
      assert.deepEqual(awards.map(p => p.score), [0, 100, 2]);
      assert.equal(state.run.score, 102); assert.equal(state.run.xp, 6);
      await send(earlier);
      assert.equal(state.run.score, 102); assert.equal(state.run.xp, 6);
      assert.equal(requests.length, 4, 'already consumed entitlement is not paid after control');
      await mirrorScore();
    });
  } finally {
    host.shutdown();
  }
});
