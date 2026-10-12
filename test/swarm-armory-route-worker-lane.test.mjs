import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { onboarding } from '../src/systems/onboarding.js';
import { configureRacingCorridorSession } from '../src/world/racingCorridor.js';

function stubElement() {
  return {
    children: [],
    style: {},
    dataset: {},
    textContent: '',
    innerHTML: '',
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toggle: () => {},
    },
    appendChild() {},
    prepend() {},
    remove() {},
    setAttribute() {},
    getAttribute: () => null,
    hasAttribute: () => false,
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
  };
}

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  head: stubElement(),
  body: stubElement(),
  documentElement: null,
  createElement: () => stubElement(),
};

function boot(mode = 'loading') {
  const player = makeEntity({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    data: {},
  });
  player.id = 1;
  const rng = mulberry32(47);
  const rngStats = { draws: 0 };
  const state = {
    meta: { seed: 47 },
    simTime: 0,
    tick: 0,
    mode,
    settings: { gameplay: { tutorialHints: true } },
    playerId: 1,
    player: { hints: {}, targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    nextEntityId: 10,
    nav: {},
    combat: { attachments: { byId: {} } },
    world: { activeSector: { stations: [], gates: [] }, currentSectorId: 'sector_helios_prime' },
    story: { beatIndex: 0 },
    rng: () => {
      rngStats.draws += 1;
      return rng();
    },
  };
  const bus = createBus();
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
    voice: {
      said: 0,
      say() { this.said += 1; return true; },
    },
  };
  const sys = Object.create(onboarding);
  const seen = { rescueStarted: 0, toast: 0, tutorialSay: 0 };
  bus.on('rescue:started', () => { seen.rescueStarted += 1; });
  bus.on('toast', () => { seen.toast += 1; });
  bus.on('tutorial:say', () => { seen.tutorialSay += 1; });
  sys.init({ state, bus, helpers, registry: null });
  return { bus, state, sys, helpers, spawned, seen, rngStats };
}

async function scenePrepared(h, payload = {}) {
  h.bus.emit('game:scenePrepared', payload);
  await Promise.resolve();
}

function rescueCast(h) {
  return h.state.entityList.filter((e) => e.data && e.data.rescue === true);
}

// Worker lane (default since PR #260): the new-game boot and onboarding run in the worker,
// which never sees the main-side sandbox pendingConfig. A Swarm OPEN ARMORY launch begins its
// survival run only AFTER scenePrepared replays to main — so onboarding must read the launch
// off the payload, or it stages the Training Derelict and the player lands in the tutorial.
test('crucibleLaunch scenePrepared stages no rescue cast before the run is live', async () => {
  const h = boot('loading');
  assert.equal(h.state.run, undefined, 'run not yet begun (worker-lane ordering)');
  await scenePrepared(h, { crucibleLaunch: true });
  assert.equal(rescueCast(h).length, 0, 'no Training Derelict opening for a Crucible launch');
  assert.equal(h.rngStats.draws, 0);
});

test('crucibleLaunch game:started receipt never starts the Adventure tutorial', async () => {
  const h = boot('loading');
  await scenePrepared(h, { crucibleLaunch: true });
  h.state.mode = 'flight';
  h.bus.emit('game:started', { newGamePlus: null, crucibleLaunch: true });
  assert.equal(h.state.onboarding && h.state.onboarding.active, false);
  assert.equal(h.seen.rescueStarted, 0);
  assert.equal(h.seen.tutorialSay, 0);
});

test('an ordinary Adventure new game still stages and starts the rescue tutorial', async () => {
  const h = boot('loading');
  await scenePrepared(h, {});
  assert.equal(rescueCast(h).length, 6);
  h.state.mode = 'flight';
  h.bus.emit('game:started', { newGamePlus: null });
  assert.equal(h.state.onboarding.active, true);
  assert.equal(h.seen.rescueStarted, 1);
});
