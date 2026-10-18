import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import {
  laneDomEvent,
  laneRpc,
  laneSetMode,
  laneSpawnEntity,
  laneWriteSetting,
} from '../src/core/simLaneCommands.js';

// D227 forward-progress fixture — real wholeSimBrowserWorker in a node Worker
// thread behind the real simLaneMain transport (clockMode 'worker-local').
// Exercises the interleavings the recording's 0–2.5 s / 3–5.5 s position holds
// imply: withheld ACK delivery (slow presentation), command/RPC/spawn churn
// queued behind an in-flight command, pause→rearm while a send is outstanding,
// and stale/duplicate ACKs. The starvation shape is the M1 mechanism: while
// `sentAwaitingAck` is set the worker coalesces instead of publishing, so the
// lane must show exactly one held reply, an invisible ~1.2 s of accumulated
// steps on release, and no spurious full-rebuild on recovery. A live trap reds
// the post-release forward-progress assertions.

function waitFor(predicate, timeoutMs = 30000, label = 'condition') {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const poll = () => {
      let ok = false;
      try { ok = predicate(); } catch (_) { ok = false; }
      if (ok) { resolve(); return; }
      if (Date.now() >= deadline) {
        reject(new Error(`timed out waiting for ${label}`));
        return;
      }
      setTimeout(poll, 5);
    };
    poll();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('worker-local clock forward progress under held ACKs, churn, pause/rearm', { timeout: 180000 }, async () => {
  const mainPosts = [];
  const deliveredReplies = [];
  const heldReplies = [];
  let holdReplies = false;
  let receive = null;
  let workerError = null;
  const worker = new Worker(
    new URL('./fixtures/whole-sim-browser-worker-thread.mjs', import.meta.url),
    { type: 'module' },
  );
  const state = createGameState(4242);
  state.timeScale = 0;
  let lane = null;
  let churnTimer = null;
  try {
    worker.on('message', (message) => {
      if (message && message.kind === 'error') workerError = message;
      if (holdReplies && message && message.kind === 'clockTick') {
        heldReplies.push(message);
        return;
      }
      deliveredReplies.push(message);
      queueMicrotask(() => { if (receive) receive(message); });
    });
    worker.on('error', (error) => {
      workerError = { kind: 'error', message: error?.message || String(error), stack: error?.stack || null };
    });
    const scenarioContract = JSON.parse(readFileSync(
      new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
    ));
    lane = createSimLaneRuntime({
      state,
      registry: {},
      bus: createBus(),
      flags: { lane: 'worker', warnings: [], sab: false },
      clockMode: 'worker-local',
      helpers: {
        scenarioContract,
        scenarioContractPath: 'src/data/scenarios/47a.scenario.json',
        scenarioContractHash: 'd227-forward-progress',
        raycastToPlane(_ndc, hit) { hit.x = 0; hit.z = 0; return hit; },
      },
      channelFactory: () => ({
        post(message) {
          mainPosts.push(message);
          worker.postMessage(message);
        },
        onMessage(handler) { receive = handler; },
        onError(handler) { worker.on('error', handler); },
        terminate() { void worker.terminate(); },
      }),
    });
    await lane.readyPromise;
    lane.runner.setClockActive(true);

    const boot = await laneRpc('newGameBoot', { opts: { seed: 4242 }, newGamePlus: null });
    assert.equal(boot.ok, true, workerError?.message);
    assert.equal(boot.result.ok, true);
    laneSetMode(state, null, 'flight');
    state.timeScale = 1;
    laneWriteSetting(state, 'timeScale', 1);
    laneDomEvent({ type: 'mousemove', clientX: 320, clientY: 180 });

    const clockTicks = () => deliveredReplies.filter((r) => r && r.kind === 'clockTick');
    const releaseHeld = () => {
      const batch = heldReplies.splice(0);
      for (const reply of batch) {
        deliveredReplies.push(reply);
        receive(reply);
      }
      return batch;
    };

    await waitFor(
      () => clockTicks().some((r) => r.clockDiagnostics?.scale === 1 && r.clockDiagnostics.steps > 0),
      30000,
      'active clock ticks after boot',
    );
    assert.equal(workerError, null);

    // ---- Phase 1: withhold the outstanding reply; drive command/RPC/spawn churn.
    holdReplies = true;
    await waitFor(() => heldReplies.length >= 1, 10000, 'the outstanding send to arrive');
    let cursorStep = 0;
    churnTimer = setInterval(() => {
      laneDomEvent({ type: 'mousemove', clientX: 200 + (cursorStep++ % 400), clientY: 120 });
      laneDomEvent({ type: 'keydown', code: 'KeyW', pressed: true, repeat: false });
      laneDomEvent({ type: 'keyup', code: 'KeyW', pressed: false, repeat: false });
    }, 25);
    const churnRpcs = [laneRpc('probeState'), laneRpc('probeState'), laneRpc('probeState')];
    for (let i = 0; i < 40; i++) {
      laneSpawnEntity({ type: 'asteroid', pos: { x: -500 - i * 10, z: -500 } });
    }
    await sleep(1200);
    clearInterval(churnTimer);
    churnTimer = null;

    // M1 starvation shape: exactly one reply is outstanding; the worker coalesced
    // every later tick into its retained reply instead of publishing again.
    assert.equal(heldReplies.length, 1,
      'one outstanding send per ACK window — no second reply may be published while it is held');
    const held = heldReplies[0];
    assert.ok(Number.isSafeInteger(held.clockSequence));
    assert.ok(held.clockDiagnostics?.steps > 0, 'held reply carries real sim steps');

    // Release and drain the convoy. The first post-release reply must carry the
    // ~1.2 s of invisible steps the worker accumulated while awaiting the ACK.
    const preReleaseTickCount = clockTicks().length;
    const lastStateTickBeforeHold = clockTicks().reduce(
      (m, r) => Math.max(m, Number.isSafeInteger(r.stateTick) ? r.stateTick : 0), 0);
    holdReplies = false;
    releaseHeld();
    await waitFor(
      () => lane.getDiagnostics().workerClockLastAckedSequence >= held.clockSequence,
      10000,
      'ACK for the held reply',
    );
    await waitFor(
      () => clockTicks().length > preReleaseTickCount
        && clockTicks().at(-1).clockDiagnostics.steps > 0,
      15000,
      'fresh published ticks after the hold',
    );
    await waitFor(
      () => lane.getDiagnostics().workerClockCommandInFlight === false,
      15000,
      'queued command/RPC flight release after the convoy',
    );
    for (const pending of churnRpcs) {
      const result = await pending;
      assert.equal(result.ok, true, 'queued probe RPC resolves after release');
    }
    const postReleaseReplies = clockTicks().slice(preReleaseTickCount);
    const catchupReply = postReleaseReplies.find(
      (r) => Number.isSafeInteger(r.stateTick) && r.stateTick > lastStateTickBeforeHold + 30);
    assert.ok(catchupReply,
      'the retained blob must surface the held window as accumulated steps, not a frozen world');
    const rebuildCount = postReleaseReplies.filter((r) => r.journalFullRebuild === true).length;
    assert.ok(rebuildCount <= 1,
      `contiguous retained journal must not storm rebuilds on release (saw ${rebuildCount})`);
    assert.equal(lane.getDiagnostics().error, null);

    // ---- Phase 2: pause while a send is outstanding, then rearm.
    holdReplies = true;
    await waitFor(() => heldReplies.length >= 1, 10000, 'a reply to hold for the pause');
    lane.runner.setClockActive(false);
    const pausedProbe = laneRpc('probeState');
    await sleep(300);
    holdReplies = false;
    releaseHeld();
    const pausedAck = await pausedProbe;
    assert.equal(pausedAck.ok, true, 'paused-lane RPC resolves through forced command ticks');
    const stepsAtPause = lane.getDiagnostics().workerClockLastDiagnostics?.steps || 0;

    const timerFiresBeforeRearm = lane.getDiagnostics().workerClockLastDiagnostics?.timerFires || 0;
    lane.runner.setClockActive(true);
    await waitFor(
      () => clockTicks().some((r) => r.clockDiagnostics?.steps > stepsAtPause
        && r.clockDiagnostics?.timerFires > timerFiresBeforeRearm),
      15000,
      'clock re-arms and steps after pause release',
    );

    // ---- Phase 3: stale/duplicate ACKs must not corrupt the send window.
    const currentMax = clockTicks().reduce(
      (m, r) => Math.max(m, Number.isSafeInteger(r.clockSequence) ? r.clockSequence : 0), 0);
    assert.ok(currentMax > 0);
    const lastJournalEnd = clockTicks().at(-1)?.journalEnd || 0;
    const lifecycle = lane.runner.getLifecycleGeneration();
    const beforeStale = clockTicks().length;
    for (const staleSeq of [Math.max(0, currentMax - 2), currentMax]) {
      worker.postMessage({
        kind: 'clockAck', seq: `stale-ack-${staleSeq}`, clockSequence: staleSeq,
        ackJournalEnd: lastJournalEnd,
        generation: lifecycle,
        lifecycleGeneration: lifecycle,
      });
    }
    await sleep(500);
    assert.equal(workerError, null, 'stale/duplicate ACKs produce no worker error');
    const afterStale = clockTicks().slice(beforeStale);
    const seqSet = new Set(afterStale.map((r) => r.clockSequence));
    assert.equal(afterStale.length, seqSet.size,
      'stale ACKs must not double-publish a clock sequence');
    assert.equal(lane.getDiagnostics().error, null);
  } finally {
    if (churnTimer) clearInterval(churnTimer);
    try { lane?.close(); } catch (_) {}
    await sleep(20);
    try { await worker.terminate(); } catch (_) {}
  }
});
