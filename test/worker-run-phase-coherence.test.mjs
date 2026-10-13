import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyDomainPathUpdate, createDomainDiffer } from '../scripts/lib/simReadModel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';

test('native arena phase identity reaches the first reply with its contemporaneous body clock', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const domains = new Map(); const mutable = new WeakSet(); let tick = 0;
    const accept = reply => { for (const update of reply.domainUpdates) applyDomainPathUpdate(domains, update, mutable); };
    accept(init);
    const send = async (...descriptors) => {
      const ring = createSimCommandRing();
      for (const descriptor of descriptors) pushLaneCommand(ring, descriptor);
      const reply = await lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
      accept(reply); return reply;
    };
    assert.equal(domains.get('run').phase, 'inactive');
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    requestSandboxGame(bus, crucibleLaunchConfig(crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value, 'swarm'));
    await send({ kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'arena', op: 'newGameBoot', args: { opts } });
    const state = lane.host.state;
    assert.equal(state.run.phase, 'draft');
    assert.equal(domains.get('run').phase, 'draft', 'boot cannot leave its phase behind the native owner');
    const machine = lane.host.registry.get('survivalRun');
    await send({ kind: 'mode', mode: 'flight' }, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    machine.update(1 / 60, state);
    assert.equal(state.run.phase, 'wave_intro');
    await send();
    assert.equal(domains.get('run').phase, 'wave_intro');
    assert.equal(domains.get('run').wave, state.run.wave);
    let nativeOpening;
    lane.host.bus.on('run:waveStarted', payload => { nativeOpening = { wave: payload.wave, simTime: state.simTime }; });
    lane.host.bus.emit('run:waveIntroComplete', { wave: state.run.wave });
    machine.update(1 / 60, state);
    const opening = await send();
    assert.equal(state.run.phase, 'active');
    assert.deepEqual(nativeOpening, { wave: state.run.wave, simTime: opening.simTime });
    assert.equal(domains.get('run').phase, 'active', 'first active body reply must have the active phase');
    assert.equal(domains.get('run').kind, state.run.kind);
    assert.equal(domains.get('run').ruleset, state.run.ruleset);
    for (let later = 0; later < 35; later++) { await send(); assert.equal(domains.get('run').phase, 'active'); }
    await send({ kind: 'rpc', id: 'ordinary', op: 'newGameBoot', args: { opts: { seed: 4242 } } });
    assert.equal(state.run.phase, 'inactive');
    assert.equal(domains.get('run').phase, 'inactive', 'ordinary boot resets the old run on its first reply');
    assert.equal(domains.get('run').kind, state.run.kind);
    assert.equal(domains.get('run').wave, state.run.wave);
  } finally { lane.shutdown(); }
});

test('run identity stays coherent across null/reset while score retains its existing slow cadence', () => {
  const differ = createDomainDiffer(); const domains = new Map(); const mutable = new WeakSet();
  const run = { kind: 'survival', ruleset: 'swarm', phase: 'wave_intro', wave: 2, score: 0 };
  const state = { run };
  const diff = tick => { const reply = differ.diff(state, tick); for (const update of reply.updates) applyDomainPathUpdate(domains, update, mutable); return reply; };
  diff(0);
  state.run = { ...run, phase: 'active', score: 10 };
  diff(1);
  assert.equal(domains.get('run').phase, 'active');
  assert.equal(domains.get('run').score, 0, 'the unrelated run payload remains paced');
  for (let tick = 2; tick <= 32; tick++) { diff(tick); assert.equal(domains.get('run').phase, 'active'); }
  assert.equal(domains.get('run').score, 10);
  state.run = null; diff(33);
  assert.equal(domains.get('run'), null);
  state.run = { kind: null, ruleset: null, phase: 'inactive', wave: 0, score: 0 }; diff(34);
  assert.deepEqual(domains.get('run'), state.run);
  state.run = null; diff(35);
  assert.equal(domains.get('run'), null, 'a previously seen null still replaces the newer object');
});
