import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { onboarding } from '../src/systems/onboarding.js';

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

test('scenePrepared while loading stages the six rescue roles quietly', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const cast = rescueCast(h);
  assert.equal(cast.length, 6);
  const roles = cast.map((e) => e.data.rescueRole).sort();
  assert.deepEqual(roles, ['asteroid', 'beacon', 'derelict', 'pod', 'rock', 'scout']);
  const byRole = Object.fromEntries(cast.map((e) => [e.data.rescueRole, e]));
  assert.equal(byRole.derelict.type, 'wreck');
  assert.equal(byRole.scout.type, 'drone');
  assert.equal(byRole.pod.type, 'payload');
  assert.equal(byRole.beacon.type, 'beacon');
  assert.equal(byRole.derelict._invulnUntil, Infinity);
  assert.equal(byRole.beacon._invulnUntil, Infinity);
  assert.equal(h.rngStats.draws, 2, 'the spec builder draws exactly its two rolls');
  assert.equal(h.seen.rescueStarted, 0, 'no funnel event before real start');
  assert.equal(h.seen.toast, 0, 'no toast while loading');
  assert.equal(h.seen.tutorialSay, 0, 'no tutorial voice while loading');
  assert.equal(h.helpers.voice.said, 0, 'the voice helper is not spoken to');
  assert.equal(h.state.onboarding, undefined, 'preparation never installs onboarding UI state');
});

test('repeated scenePrepared joins the existing prepared cast without new draws', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const first = rescueCast(h).map((e) => e.id);
  await scenePrepared(h);
  await scenePrepared(h);
  const second = rescueCast(h).map((e) => e.id);
  assert.deepEqual(second, first, 'the same actor set is kept');
  assert.equal(h.rngStats.draws, 2, 'idempotent prepare never draws again');
  assert.equal(h.state.entityList.length, 7);
});

test('game:started adopts the prepared actors by exact reference', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const prepared = rescueCast(h);
  const preparedIds = prepared.map((e) => e.id).sort();
  h.state.mode = 'flight';
  h.bus.emit('game:started', {});
  const rescue = h.state.onboarding && h.state.onboarding.rescue;
  assert.ok(rescue && rescue.active === true);
  assert.deepEqual(
    Object.values(rescue.ids).slice().sort(),
    preparedIds,
    'the adopted funnel ids are the prepared actors',
  );
  for (const [slot, id] of Object.entries(rescue.ids)) {
    const live = h.state.entities.get(id);
    assert.ok(live, `adopted actor still in the world: ${slot}`);
    assert.equal(prepared.includes(live), true, `same object reference adopted: ${slot}`);
  }
  assert.equal(h.seen.rescueStarted, 1, 'exactly one rescue:started at real start');
  assert.equal(h.rngStats.draws, 2, 'adoption never draws the cast roll again');
  assert.equal(rescue.startedAt, h.state.simTime);
  assert.ok(h.state.onboarding.missingThree);
  assert.ok(h.state.onboarding.storeSentence);
});

test('carve-outs: flight mode, scenario payload, hints off, and active runs skip prepare', async () => {
  const flying = boot('flight');
  await scenePrepared(flying);
  assert.equal(rescueCast(flying).length, 0, 'never prepares outside loading');

  const scenario = boot('loading');
  await scenePrepared(scenario, { scenario: '47a' });
  assert.equal(rescueCast(scenario).length, 0, 'scenario payloads keep their own cast');

  const hintless = boot('loading');
  hintless.state.settings.gameplay.tutorialHints = false;
  await scenePrepared(hintless);
  assert.equal(rescueCast(hintless).length, 0, 'tutorialHints:false stays silent');

  const survival = boot('loading');
  await scenePrepared(survival);
  assert.equal(rescueCast(survival).length, 6);
  const second = boot('loading');
  second.state.run = { kind: 'survival', phase: 'loadout' };
  await scenePrepared(second);
  assert.equal(rescueCast(second).length, 0, 'an active survival run owns its arena');

  const lab = boot('loading');
  lab.state.run = { kind: 'lab', phase: 'active' };
  await scenePrepared(lab);
  assert.equal(rescueCast(lab).length, 0, 'an active lab session owns its cast');

  const idleRun = boot('loading');
  idleRun.state.run = { kind: 'survival', phase: 'inactive' };
  await scenePrepared(idleRun);
  assert.equal(rescueCast(idleRun).length, 6, 'an inactive run envelope is an ordinary adventure boot');
});

test('a cancelled prepare never removes a reissued foreign same-id entity', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const cast = rescueCast(h);
  const rock = cast.find((e) => e.data.rescueRole === 'rock');
  const others = cast.filter((e) => e !== rock);
  rock.alive = false;
  const foreign = { id: rock.id, type: 'ship', alive: true, pos: { x: 5, z: 5 } };
  h.state.entities.set(rock.id, foreign);
  h.state.entityList.push(foreign);
  h.state.mode = 'flight';
  h.bus.emit('game:started', {});
  const rescue = h.state.onboarding && h.state.onboarding.rescue;
  assert.ok(rescue, 'the funnel still stages');
  assert.equal(h.state.entities.get(rock.id), foreign, 'the foreign same-id entity is never deleted');
  assert.equal(foreign.alive, true);
  for (const stale of others) {
    assert.equal(stale.alive, false, 'owned leftovers of the cancelled cast are removed');
  }
  assert.equal(h.state.entities.get(rescue.ids.rock).id, rescue.ids.rock);
  assert.equal(h.seen.rescueStarted, 1);
});

test('teardown removes owned prepared actors; a stale descriptor cannot touch reissued ids', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const cast = rescueCast(h);
  h.sys._teardown();
  for (const actor of cast) {
    assert.equal(actor.alive, false, 'owned prepared actor removed');
  }
  assert.equal(h.sys._preparedRescue, null);

  const second = boot('loading');
  await scenePrepared(second);
  const secondCast = rescueCast(second);
  const foreign = { id: secondCast[0].id, type: 'ship', alive: true };
  second.state.entities.set(secondCast[0].id, foreign);
  second.sys._teardown();
  assert.equal(foreign.alive, true, 'teardown never deletes a reissued foreign id');
});

test('a scenario game:started after a prepared scene discards the owned cast', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const cast = rescueCast(h);
  assert.equal(cast.length, 6);
  h.state.mode = 'flight';
  h.bus.emit('game:started', { scenario: '47a' });
  assert.equal(h.state.onboarding.rescue, undefined, 'the harness keeps its own cast');
  for (const actor of cast) {
    assert.equal(actor.alive, false, 'the prepared cast does not leak into the harness world');
  }
  assert.equal(h.seen.rescueStarted, 0);
});

test('a second prepare after the world was rebuilt re-stages instead of trusting dead refs', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const first = rescueCast(h);
  h.state.entities.clear();
  h.state.entityList.length = 0;
  const player = makeEntity({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, data: {} });
  player.id = 1;
  h.state.entities.set(1, player);
  h.state.entityList.push(player);
  await scenePrepared(h);
  const second = rescueCast(h);
  assert.equal(second.length, 6, 'the new world gets its own cast');
  assert.equal(second.some((e) => first.includes(e)), false, 'no stale actor is revived');
  h.state.mode = 'flight';
  h.bus.emit('game:started', {});
  const rescue = h.state.onboarding && h.state.onboarding.rescue;
  assert.ok(rescue && Object.values(rescue.ids).every((id) => id != null));
});

test('hints turned off after prepare releases the owned cast at start', async () => {
  const h = boot('loading');
  await scenePrepared(h);
  const cast = rescueCast(h);
  assert.equal(cast.length, 6);
  h.state.settings.gameplay.tutorialHints = false;
  h.state.mode = 'flight';
  h.bus.emit('game:started', {});
  for (const actor of cast) {
    assert.equal(actor.alive, false, 'an owned prepared actor is removed with its descriptor');
  }
  assert.equal(h.sys._preparedRescue, null);
  assert.equal(h.state.onboarding.rescue, undefined);
  assert.equal(h.seen.rescueStarted, 0);
});

test('a scene event whose run moved on before the deferred prepare stages nothing', async () => {
  const h = boot('loading');
  h.state.render = { admissionRunGeneration: 3 };
  h.bus.emit('game:scenePrepared', {});
  h.state.render.admissionRunGeneration = 4;
  await Promise.resolve();
  assert.equal(rescueCast(h).length, 0, 'a generation bump retires the queued prepare');

  const second = boot('loading');
  const firstPlayer = second.state.entities.get(1);
  second.bus.emit('game:scenePrepared', {});
  const replacement = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 8, data: {},
  });
  replacement.id = 1;
  second.state.entities.set(1, replacement);
  await Promise.resolve();
  assert.equal(rescueCast(second).length, 0, 'a player swap retires the queued prepare');
  assert.equal(second.state.entities.get(1) !== firstPlayer, true);
});
