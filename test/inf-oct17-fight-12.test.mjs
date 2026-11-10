// FIGHT-12 — a specialist that counters your Massline says what it did, once.
// Seed 4242, real owner code (barkDirector through the voice arbiter's bark
// channel). First countered latch in an engagement speaks in the specialist's
// register; the second stays quiet; the next engagement speaks again.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { ensureCombatant } from '../src/combat/runtime.js';
import { damageSubsystem, applyPendingSubsystemTransitions, recomputeCombatantModifiers } from '../src/combat/subsystems.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { createSimulation } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { combatOutcome } from '../src/systems/combatOutcome.js';
import { MASSLINE_COUNTERS, MASSLINE_COUNTERPLAY_BARKS } from '../src/data/masslineCounters.js';

function makeDirector(t) {
  const said = [];
  const sim = createSimulation({ seed: 4242, systems: [combatOutcome], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.tick = 4242; state.simTime = 70.7;
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 } }));
  state.playerId = player.id;
  const specialist = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 120, z: 0 }));
  const escort = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x: 180, z: 0 }));
  for (const entity of [specialist, escort]) {
    // aiFireIntent publishes these target/fire fields on the default worker lane.
    entity.data.combat = { targetId: player.id };
    entity.data.intent = { fire: true };
  }
  const voice = {
    say(entry) {
      if (entry.register === 'specialist' || entry.register === 'ace') said.push(entry);
      return true;
    },
  };
  const host = Object.create(barkDirector);
  host.init({ state, bus, helpers: { voice } });
  t.after(() => { host.destroy(); sim.dispose(); });
  const counter = (actorId = specialist.id) => bus.emit('massline:npcCounterplay', {
    schemaVersion: 1,
    verb: 'cut_bridle',
    role: 'specialist',
    actorId,
    attachmentId: 'att1',
    reason: 'specialist_cut',
    tick: state.tick,
  });
  host.update(1 / 60, state);
  return { host, bus, voice, state, said, counter, specialist, escort };
}

function hasRawId(text) {
  return /massline|npc_counterplay|cut_bridle|specialist_cut|attachment/i.test(String(text || ''))
    || /[_:]/.test(String(text || ''))
    || /[a-z]+[A-Z]/.test(String(text || ''));
}

test('FIGHT-12 seed 4242: first countered latch speaks once in the specialist register', (t) => {
  const { state, said, counter } = makeDirector(t);
  assert.ok(state.meta.seed === 4242, 'fixed seed 4242');
  assert.ok(
    Array.isArray(MASSLINE_COUNTERS) && MASSLINE_COUNTERS.some((row) => row.counter),
    'the counter rules carry the specialist counter words',
  );
  counter();
  assert.equal(said.length, 1, 'the first countered latch produces one bark');
  assert.equal(said[0].channel, 'bark', 'the bark travels the voice arbiter bark channel');
  assert.ok(said[0].text && said[0].text.length >= 8, 'the bark is a spoken line');
  assert.ok(MASSLINE_COUNTERPLAY_BARKS.includes(said[0].text), 'the line comes from the counter data');
  assert.equal(hasRawId(said[0].text), false, 'player words carry no raw id');
});

test('FIGHT-12 seed 4242: second countered latch in the same engagement stays quiet', (t) => {
  const { state, said, counter } = makeDirector(t);
  counter();
  assert.equal(said.length, 1, 'first latch speaks');
  state.simTime += 1;
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'second latch in the same engagement produces no bark');
});

test('FIGHT-12 seed 4242: the next engagement speaks again', (t) => {
  const { host, bus, state, said, counter, specialist, escort } = makeDirector(t);
  counter();
  assert.equal(said.length, 1, 'first engagement speaks once');
  state.tick += 60;
  counter();
  assert.equal(said.length, 1, 'still quiet inside the same engagement');
  escort.alive = false;
  bus.emit('entity:killed', { id: escort.id, killerId: state.playerId });
  specialist.data.intent.fire = false;
  bus.emit('ai:flee', { entityId: specialist.id });
  assert.equal(state.combatOutcome.outcomes.length, 2, 'the real outcome owner records both hulls');
  state.simTime += 0.5; state.tick += 30;
  host.update(1 / 60, state);
  specialist.data.intent.fire = true;
  // The ambient gap stays the anti-spam floor across engagements: a fresh engagement
  // speaks again once the gap has passed.
  counter();
  assert.equal(said.length, 1, 'the fresh engagement still obeys the ambient gap');
  state.simTime += 13;
  state.tick += 780;
  counter();
  assert.equal(said.length, 2, 'a new engagement speaks again');
});

for (const outcome of ['disabled', 'surrendered', 'fled', 'killed']) {
  test(`FIGHT-12 seed 4242: another ship ${outcome} does not re-arm the fighting specialist`, (t) => {
    const { bus, state, said, counter, escort } = makeDirector(t);
    counter();
    if (outcome === 'disabled') bus.emit('combat:subsystemDisabled', {
      targetId: escort.id, subsystemId: 'subsystem_drive' });
    if (outcome === 'surrendered') bus.emit('combat:surrendered', { entityId: escort.id });
    if (outcome === 'fled') {
      escort.data.intent.fire = false;
      bus.emit('ai:flee', { entityId: escort.id });
    }
    if (outcome === 'killed') {
      escort.alive = false;
      bus.emit('entity:killed', { id: escort.id, killerId: state.playerId });
    }
    assert.equal(state.combatOutcome.outcomes[0].outcome, outcome, 'real per-ship outcome published');
    state.simTime += 13; state.tick += 780;
    counter();
    assert.equal(said.length, 1, 'a per-ship outcome cannot re-arm a specialist still attacking');
  });
}

// Exercise production event capture, structured-clone transport and main-side replay.
// Zero-step replies keep AI from replacing the controlled pressing-hostile samples.
async function makeWorkerFight(t) {
  const worker = createSimHost();
  const scenarioContract = JSON.parse(readFileSync(
    new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
  ));
  const state = createGameState(4242);
  const bus = createBus();
  const said = [];
  const outcomes = [];
  bus.on('barkDirector:voice', p => { if (p.reason === 'massline:npcCounterplay') said.push(p); });
  bus.on('combat:outcome', p => outcomes.push(p));
  let deliver, resolveTick, rejectTick;
  const lane = createSimLaneRuntime({ state, bus, registry: {},
    flags: { lane: 'worker', warnings: [], sab: false },
    channelFactory: () => ({
      post(message) {
        if (message.kind === 'shutdown') return worker.shutdown();
        const operation = message.kind === 'init'
          ? worker.init({ ...message, scenarioContract }) : worker.tick({ ...message, steps: 0 });
        Promise.resolve(operation).then(reply => {
          const envelope = { kind: message.kind === 'init' ? 'ready' : 'tickDone', seq: message.seq, ...reply };
          deliver(structuredClone(envelope));
          if (message.kind === 'tick') resolveTick(reply);
        }, error => {
          deliver({ kind: 'error', seq: message.seq, message: error.message });
          rejectTick?.(error);
        });
      },
      onMessage(callback) { deliver = callback; },
      terminate() { worker.shutdown(); },
    }),
  });
  t.after(() => lane.close());
  await lane.readyPromise;
  const sim = worker.host;
  sim.state.mode = 'flight';
  sim.state.tick = 12000;
  sim.state.simTime = 200;
  const player = sim.runtime.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: 0, z: 0 } }));
  sim.state.playerId = player.id;
  const director = sim.runtime.getSystem('barkDirector');
  const spawn = (x = 120) => {
    const entity = sim.runtime.spawn(makeEnemySpawnSpec('reaver_pirate', 1, { x, z: 0 }));
    entity.data.combat = { targetId: player.id };
    entity.data.intent = { fire: true };
    return entity;
  };
  const flush = () => new Promise((resolve, reject) => {
    resolveTick = resolve; rejectTick = reject;
    lane.runner.stepOnce();
  });
  const update = (seconds = 0.5) => {
    sim.state.simTime += seconds;
    sim.state.tick += Math.round(seconds * 60);
    director.update(1 / 60, sim.state);
  };
  const counter = actor => sim.bus.emit('massline:npcCounterplay', {
    schemaVersion: 1, verb: 'cut_bridle', role: 'specialist', actorId: actor.id,
    attachmentId: 'att1', reason: 'specialist_cut', tick: sim.state.tick,
  });
  const disable = (entity, subsystemId = 'subsystem_weapon') => {
    const catalog = sim.runtime.getSystem('combat').kernel.catalog;
    const context = { state: sim.state, bus: sim.bus, catalog };
    const runtime = ensureCombatant(sim.state, entity, catalog);
    const result = damageSubsystem(context, entity, runtime, subsystemId, 10000, { kinetic: 1 });
    assert.ok(result.applied > 0, 'the real subsystem owner damages the subsystem');
    sim.state.tick++;
    applyPendingSubsystemTransitions(context, entity, runtime);
    recomputeCombatantModifiers(context, entity, runtime);
    assert.equal(runtime.subsystems[subsystemId].effectiveDisabled, true);
  };
  const kill = entity => {
    entity.alive = false;
    sim.bus.emit('entity:killed', { id: entity.id, killerId: player.id });
  };
  return { sim, state, director, said, outcomes, spawn, flush, update, counter, disable, kill };
}

for (const subsystem of ['weapon', 'drive', 'power', 'tether_spool']) {
  test(`FIGHT-12 worker seed 4242: a specialist's own ${subsystem} loss cannot re-arm the same fight`, async t => {
    const f = await makeWorkerFight(t);
    const specialist = f.spawn();
    f.counter(specialist);
    f.update();
    await f.flush();
    assert.equal(f.said.length, 1, 'the first specialist bark reaches main through the production bridge');
    f.disable(specialist, `subsystem_${subsystem}`);
    await f.flush();
    assert.equal(f.outcomes[0].outcome, 'disabled', 'the real outcome owner publishes the subsystem loss');
    assert.notEqual(f.outcomes[0], f.sim.state.combatOutcome.outcomes[0], 'the receipt crossed a clone boundary');
    assert.equal(f.director._hostilesStillPressing(), 1, 'the same hull remains an attacker');
    f.update(13);
    f.counter(specialist);
    await f.flush();
    assert.equal(f.said.length, 1, 'a subsystem loss must not let the same fight speak twice after the ambient gap');
  });
}

test('FIGHT-12 worker seed 4242: deduplicated deaths re-arm only after the current fight goes quiet', async t => {
  const f = await makeWorkerFight(t);
  const specialist = f.spawn();
  const escort = f.spawn(180);
  f.counter(specialist);
  f.update();
  f.disable(specialist);
  f.disable(escort);
  await f.flush();
  assert.equal(f.said.length, 1);
  assert.deepEqual(f.outcomes.map(p => p.outcome), ['disabled', 'disabled']);
  f.kill(specialist);
  f.kill(escort);
  f.update();
  await f.flush();
  assert.equal(f.director._hostilesStillPressing(), 0, 'both attackers are gone');
  assert.equal(f.outcomes.length, 2, 'the deaths emit no new combat outcome');
  assert.ok(f.sim.state.combatOutcome.outcomes.every(p => p.dead), 'the real owner updates both disabled receipts');
  // Repeated quiet samples must not spend or repeatedly advance the next fight.
  f.update();
  const next = f.spawn();
  f.counter(next);
  await f.flush();
  assert.equal(f.said.length, 1, 'the next fight still obeys the ambient gap');
  f.update(13);
  f.counter(next);
  await f.flush();
  assert.equal(f.said.length, 2, 'a new specialist speaks again after a quiet boundary with no outcome event');
  f.update(13);
  f.counter(next);
  await f.flush();
  assert.equal(f.said.length, 2, 'the next ongoing fight is also limited to one specialist bark');
});
