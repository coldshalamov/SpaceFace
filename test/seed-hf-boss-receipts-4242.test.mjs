// SEED-HF-01..05, SEED-HF-12, SEED-HF-13 — boss facts the score already emits reach the player.
// Seed 4242. The live toast binder and the live capital score are the owners.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { LAST_ARGUMENT as C } from '../src/data/lastArgument.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { createCapitalBossEncounters, observeCapitalBody } from '../src/systems/capitalBossEncounters.js';
import { spawnCapitalBossWing } from '../src/missions/capitalBossSpawn.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import {
  bindCapitalBossReceipts,
  capitalBossActReceipt,
  capitalBossCounteredReceipt,
  capitalBossDisarmedReceipt,
  capitalBossExposureReceipt,
  capitalBossHitReceipt,
  capitalBossStartedReceipt,
} from '../src/ui/toasts.js';

const SEED = 4242;

function fight() {
  return createCapitalBossFight({
    encounterId: C.scoreId,
    fightId: 'last-argument:seed:4242',
    bossId: 2,
    targetId: 1,
  });
}

function obs(tick, over = {}) {
  return {
    tick,
    simTime: tick / 60,
    active: true,
    boss: {
      id: 2, alive: true, hull: C.hull, hullMax: C.hull,
      pos: { x: 0, z: 0 }, radius: C.radius, rot: 0, disabled: [],
    },
    // Far enough that the siege ark's opening is the spinal warning, the same
    // observation the native cancel contract uses.
    target: { id: 1, alive: true, hull: 140, hullMax: 140, pos: { x: 600, z: 0 }, radius: 14 },
    ...over,
  };
}

function tollmanFight() {
  return createCapitalBossFight({
    encounterId: 'capital_boss_tollman',
    fightId: 'tollman:seed:4242',
    bossId: 2,
    targetId: 1,
  });
}

function tollmanObs(tick) {
  return {
    tick,
    simTime: tick / 60,
    active: true,
    boss: {
      id: 2, alive: true, hull: 840, hullMax: 840,
      pos: { x: 0, z: 0 }, radius: 30, rot: 0, disabled: [],
    },
    // Inside the corridor, so the opening pattern plays instead of the range answer.
    target: { id: 1, alive: true, hull: 140, hullMax: 140, pos: { x: 180, z: 0 }, radius: 14 },
  };
}

function binder(playerId = 1) {
  const toasts = [];
  const handlers = new Map();
  const bus = {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
    },
    emit(name, payload) {
      if (name === 'toast') toasts.push(payload);
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
  bindCapitalBossReceipts(bus, () => ({ playerId, meta: { seed: SEED } }));
  return { bus, toasts };
}

test('SEED-HF-01 the boss names itself and its lesson once per fight', () => {
  assert.equal(SEED, 4242);
  const started = capitalBossStartedReceipt({
    fightId: 'f1', name: 'THE TOLLMAN',
    lesson: 'The bright lane is the shot. Stay off it.',
  });
  assert.equal(started.text, 'THE TOLLMAN — The bright lane is the shot. Stay off it.');
  const { bus, toasts } = binder();
  bus.emit('capitalBoss:started', { fightId: 'f1', name: 'THE TOLLMAN', lesson: 'The bright lane is the shot. Stay off it.' });
  bus.emit('capitalBoss:started', { fightId: 'f1', name: 'THE TOLLMAN', lesson: 'The bright lane is the shot. Stay off it.' });
  assert.equal(toasts.length, 1);
  const live = fight();
  const named = [];
  for (let tick = 0; tick < 5; tick += 1) named.push(...stepCapitalBossFight(live, obs(tick)));
  const fact = named.find((row) => row.type === 'started');
  assert.equal(fact.name.length > 0, true);
  assert.equal(fact.lesson.length > 0, true);
  assert.equal(capitalBossStartedReceipt(fact).text, `${fact.name} — ${fact.lesson}`);
});

test('SEED-HF-02 an act change names its title once per index', () => {
  const { bus, toasts } = binder();
  bus.emit('capitalBoss:actChanged', { fightId: 'f1', index: 1, title: 'II · THE BROKEN RUDDER' });
  bus.emit('capitalBoss:actChanged', { fightId: 'f1', index: 1, title: 'II · THE BROKEN RUDDER' });
  bus.emit('capitalBoss:actChanged', { fightId: 'f1', index: 0, title: 'I · THE OFFER' });
  assert.deepEqual(toasts.map((row) => row.text), ['II · THE BROKEN RUDDER', 'I · THE OFFER']);
  assert.equal(capitalBossActReceipt({ fightId: 'f1', index: 2 }), null);
});

test('SEED-HF-03 a subsystem break names the cancelled attack; other cancels stay quiet', () => {
  const live = fight();
  // The spinal warning is charging at tick 670. Breaking its housing on that tick is the cancel.
  for (let tick = 0; tick < 670; tick += 1) stepCapitalBossFight(live, obs(tick));
  const armed = obs(670);
  armed.boss.disabled = ['subsystem_last_argument_spine'];
  const out = stepCapitalBossFight(live, armed);
  const fact = out.find((row) => row.type === 'countered');
  assert.ok(fact, 'the live score emits countered when the charging bank is broken');
  assert.equal(fact.reason, 'subsystem_disabled');
  assert.equal(typeof fact.title, 'string');
  assert.ok(fact.title.length > 0);
  const { bus, toasts } = binder();
  bus.emit('capitalBoss:countered', fact);
  bus.emit('capitalBoss:countered', { reason: 'suspended', title: fact.title });
  bus.emit('capitalBoss:countered', { reason: 'act_changed', title: fact.title });
  bus.emit('capitalBoss:countered', { reason: 'spent', title: fact.title });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, `${fact.title} — the part you broke cancelled it`);
  assert.equal(capitalBossCounteredReceipt({ reason: 'suspended', title: 'KEELBREAKER' }), null);
});

test('SEED-HF-04 an exposure recovery says throw now; a closed recovery does not', () => {
  const live = tollmanFight();
  let exposure = null;
  let closed = null;
  for (let tick = 0; tick < 1600 && (!exposure || !closed); tick += 1) {
    for (const row of stepCapitalBossFight(live, tollmanObs(tick))) {
      if (row.type !== 'recovery') continue;
      if (row.exposure) exposure = row;
      else closed = row;
    }
  }
  assert.ok(exposure, 'the live score emits a recovery whose exposure is set');
  assert.equal(typeof exposure.title, 'string');
  const { bus, toasts } = binder();
  bus.emit('capitalBoss:recovery', exposure);
  if (closed) bus.emit('capitalBoss:recovery', closed);
  else bus.emit('capitalBoss:recovery', { ...exposure, exposure: null });
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, `EXPOSED — ${exposure.title}. Throw now`);
  assert.equal(capitalBossExposureReceipt({ title: 'KEELBREAKER', exposure: null }), null);
});

test('SEED-HF-05 the first disarmed tick speaks once', () => {
  const live = fight();
  const facts = [];
  for (let tick = 0; tick < 2500; tick += 1) {
    const view = obs(tick);
    view.boss.disabled = ['subsystem_power'];
    facts.push(...stepCapitalBossFight(live, view));
  }
  const spoken = facts.filter((row) => row.type === 'disarmed');
  assert.equal(spoken.length, 1);
  assert.equal(live.phase, 'disabled');
  const quiet = fight();
  const again = [];
  let tick = 0;
  for (; tick < 2500 && !again.some((row) => row.type === 'disarmed'); tick += 1) {
    const view = obs(tick);
    view.boss.disabled = ['subsystem_power'];
    again.push(...stepCapitalBossFight(quiet, view));
  }
  const spokenAt = tick;
  stepCapitalBossFight(quiet, { ...obs(spokenAt), active: false, boss: { ...obs(spokenAt).boss, disabled: ['subsystem_power'] } });
  for (let resume = spokenAt + 1; resume < spokenAt + 400; resume += 1) {
    const view = obs(resume);
    view.boss.disabled = ['subsystem_power'];
    again.push(...stepCapitalBossFight(quiet, view));
  }
  assert.equal(again.filter((row) => row.type === 'disarmed').length, 1, 'suspend and resume do not speak again');
  const { bus, toasts } = binder();
  bus.emit('capitalBoss:disarmed', spoken[0]);
  bus.emit('capitalBoss:disarmed', spoken[0]);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'Disarmed — finish it');
  assert.equal(capitalBossDisarmedReceipt({}), null);
});

test('SEED-HF-12 a requested wing speaks its authored bark once', () => {
  const state = createGameState(SEED);
  const said = [];
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos || { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    voice: { say(line) { said.push(line); } },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0, hull: 100, hullMax: 100, radius: 8 };
  const boss = { id: state.nextEntityId++, alive: true, pos: { x: 200, z: 0 }, rot: 0, hull: 200, hullMax: 840, radius: 30, type: 'ship', team: 1 };
  state.entities.set(player.id, player);
  state.entities.set(boss.id, boss);
  state.entityList.push(player, boss);
  state.playerId = player.id;
  state.meta = { seed: SEED };
  const ledger = {};
  const cap = createCapitalBossEncounters({
    observe(record, live) {
      const bossBody = live.entities.get(record.bossId);
      const targetBody = live.entities.get(record.targetId);
      const bossView = observeCapitalBody(bossBody);
      const targetView = observeCapitalBody(targetBody);
      const apart = bossView && targetView
        ? Math.hypot(targetView.pos.x - bossView.pos.x, targetView.pos.z - bossView.pos.z)
        : Infinity;
      return {
        boss: bossView,
        target: targetView,
        active: Boolean(bossView && targetView && bossBody.alive !== false && targetBody.alive !== false && apart <= 620),
        targets: targetView ? [targetView] : [],
      };
    },
    spawnWing(command, record, ctx) {
      return spawnCapitalBossWing({
        command,
        record,
        boss: ctx.state.entities.get(record.bossId),
        level: 4,
        ledger,
        makeEnemySpawnSpec,
        spawnEntity: ctx.helpers.spawnEntity,
      });
    },
  });
  cap.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_tollman',
    fightId: 'contract:capital_boss_tollman',
    bossId: boss.id,
    targetId: player.id,
  });
  const collectors = () => said.filter((line) => /Collectors, take the balance/.test(line.text));
  for (let i = 0; i < 4000 && collectors().length === 0; i += 1) {
    state.tick += 1;
    state.simTime += 1 / 60;
    cap.update(1 / 60);
  }
  assert.equal(collectors().length, 1);
  const before = said.length;
  for (let i = 0; i < 120; i += 1) {
    state.tick += 1;
    state.simTime += 1 / 60;
    cap.update(1 / 60);
  }
  assert.equal(said.filter((line) => /Collectors, take the balance/.test(line.text)).length, 1);
  assert.equal(said.length, before);
});

test('SEED-HF-13 a boss strike that lands on you names itself', () => {
  assert.equal(capitalBossHitReceipt({ title: 'KEELBREAKER', targetId: 7, castId: 'f:1' }, 7).text, 'KEELBREAKER landed');
  assert.equal(capitalBossHitReceipt({ title: 'KEELBREAKER', targetId: 4, castId: 'f:1' }, 7), null);
  const { bus, toasts } = binder(7);
  bus.emit('capitalBoss:telegraph', {
    castId: 'f:1', fightId: 'f', title: 'KEELBREAKER', counter: 'Break the housing.',
  });
  bus.emit('capitalBoss:hit', { castId: 'f:1', fightId: 'f', beatId: 'keel', targetId: 4, counter: 'Break the housing.' });
  bus.emit('capitalBoss:hit', { castId: 'f:1', fightId: 'f', beatId: 'keel', targetId: 7, counter: 'Break the housing.' });
  bus.emit('capitalBoss:ended', { fightId: 'f' });
  bus.emit('capitalBoss:hit', { castId: 'f:1', fightId: 'f', beatId: 'keel', targetId: 7 });
  assert.deepEqual(toasts.filter((row) => /landed/.test(row.text)).map((row) => row.text), ['KEELBREAKER landed']);
});
